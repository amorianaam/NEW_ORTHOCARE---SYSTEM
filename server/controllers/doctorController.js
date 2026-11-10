const db = require('../database/db');
const { getShiftRange, getCurrentShiftDate, getShiftWeekStartDate, getShiftMonthStartDate, formatShiftDate, SHIFT_IS_TODAY_SQL } = require('../utils/shiftHelpers');

// GET /api/doctor/queue - Waiting patients for doctor
exports.getQueue = async (req, res) => {
  try {
    const [visits] = await db.execute(`
      SELECT v.id as visitId, v.visit_number, v.status, v.entity, v.created_at, v.is_follow_up, v.is_exempt,
             (CASE WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v.id) OR v.status = 'transferred_to_center' THEN 1 ELSE 0 END) AS is_surgery,
             p.id as patient_id, p.full_name, p.age, p.gender, p.chronic_diseases, p.allergies, p.current_medications, p.phone,
             (SELECT COUNT(*) FROM visits v2 WHERE v2.patient_id = p.id AND v2.status != 'cancelled') AS total_visits,
             (
               SELECT GROUP_CONCAT(DISTINCT COALESCE(NULLIF(v_all.visit_number, ''), CAST(v_all.id AS CHAR)) ORDER BY v_all.created_at DESC SEPARATOR ', ')
               FROM visits v_all
               WHERE v_all.patient_id = p.id AND v_all.status != 'cancelled'
             ) AS all_visit_numbers
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      WHERE (v.visit_number IS NULL OR v.visit_number NOT LIKE 'EXT-%')
        AND v.status NOT IN ('cancelled', 'registered', 'awaiting_payment')
        AND (
          v.is_exempt = 1
          OR v.is_follow_up = 1
          OR EXISTS (
            SELECT 1 FROM financial_transactions ft 
            WHERE ft.visit_id = v.id 
              AND ft.category = 'entry_fee' 
              AND ft.type = 'income' 
              AND ft.is_refund = 0
          )
        )
        AND (
          v.status != 'completed'
          OR ${SHIFT_IS_TODAY_SQL('v.created_at')}
          OR ${SHIFT_IS_TODAY_SQL('v.closed_at')}
        )
      ORDER BY 
        CASE WHEN v.status = 'completed' THEN 1 ELSE 0 END ASC,
        v.created_at ASC
    `);

    const result = [];
    for (const v of visits) {
      // Lab requests
      const [labs] = await db.execute(`
        SELECT lr.id, lr.status, lr.price, lr.discount_percentage, lr.discount_amount, lr.final_price, lr.is_free, lr.result_notes, lr.result_file, lr.performed_at, lr.requested_at, lt.name, lt.id AS test_id
        FROM visit_lab_requests lr
        JOIN lab_tests lt ON lr.lab_test_id = lt.id
        WHERE lr.visit_id = ?
      `, [v.visitId]);

      // Radiology requests
      const [rads] = await db.execute(`
        SELECT rr.id, rr.status, rr.price, rr.discount_percentage, rr.discount_amount, rr.final_price, rr.is_free, rr.with_film, rr.result_notes, rr.result_file, rr.performed_at, rr.requested_at, rt.name, rt.id AS test_id
        FROM visit_radiology_requests rr
        JOIN radiology_tests rt ON rr.radiology_test_id = rt.id
        WHERE rr.visit_id = ?
      `, [v.visitId]);

      // Clinical requests
      const [clinicals] = await db.execute(`
        SELECT cr.id, cr.status, cr.created_at, cr.performed_at, cr.notes, cr.price, cr.discount_percentage, cr.discount_amount, cr.final_price, cr.is_free, cs.name, cs.id AS test_id
        FROM visit_clinical_service_requests cr
        JOIN clinical_services cs ON cr.service_id = cs.id
        WHERE cr.visit_id = ?
      `, [v.visitId]);

      result.push({
        ...v,
        labRequests: labs,
        radiologyRequests: rads,
        clinicalRequests: clinicals
      });
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// PUT /api/doctor/visit/:visitId/start - Doctor starts examining
exports.startExamination = async (req, res) => {
  try {
    const { visitId } = req.params;
    const [[visitRow]] = await db.execute(`SELECT status FROM visits WHERE id = ?`, [visitId]);
    if (!visitRow) return res.status(404).json({ message: 'الزيارة غير موجودة' });
    if (visitRow.status === 'cancelled') {
      return res.status(400).json({ message: 'لا يمكن استدعاء مريض لزيارة ملغاة' });
    }
    await db.execute(
      `UPDATE visits SET status = 'with_doctor', closed_at = NULL WHERE id = ? AND status IN ('waiting', 'awaiting_lab', 'awaiting_radiology', 'pending_payment', 'awaiting_service_payment', 'completed_admin_pending_services', 'completed')`, [visitId]
    );
    const io = req.app.get('io');
    if (io) io.to('cashier').emit('cashier:update');
    res.json({ message: 'تم استدعاء المريض' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
};

// POST /api/doctor/visit/:visitId/order-services - Order lab/radiology/clinical
exports.orderServices = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { visitId } = req.params;
    const { labTests = [], radiologyTests = [], clinicalServices = [] } = req.body;

    const [[visitRow]] = await conn.execute(`SELECT status, is_exempt FROM visits WHERE id = ?`, [visitId]);
    if (!visitRow) {
      await conn.rollback();
      return res.status(404).json({ message: 'الزيارة غير موجودة' });
    }
    if (visitRow.status === 'cancelled') {
      await conn.rollback();
      return res.status(400).json({ message: 'لا يمكن طلب خدمات طبية لزيارة ملغاة' });
    }
    const isExemptVisit = visitRow ? (visitRow.is_exempt === 1 || visitRow.is_exempt === true) : false;

    // Auto-reopen completed visit when doctor adds new services
    if (visitRow && visitRow.status === 'completed') {
      await conn.execute(
        `UPDATE visits SET status = 'with_doctor', closed_at = NULL WHERE id = ? AND status = 'completed'`,
        [visitId]
      );
    }

    let hasNonFree = false;

    // Helper
    const calc = (price, discPercent, isFree) => {
      if (isFree || isExemptVisit) return { discount_amount: price, final_price: 0, is_free: 1 };
      const discAmt = (price * (discPercent || 0)) / 100;
      return { discount_amount: discAmt, final_price: price - discAmt, is_free: 0 };
    };

    // Lab
    for (const test of labTests) {
      const { final_price, discount_amount, is_free } = calc(test.price, test.discount_percentage, test.is_free);
      if (!is_free) hasNonFree = true;
      
      const status = is_free ? 'paid' : 'pending_payment';
      await conn.execute(
        `INSERT INTO visit_lab_requests (visit_id, lab_test_id, price, discount_percentage, discount_amount, final_price, is_free, requested_by, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [visitId, test.id, test.price, test.discount_percentage || 0, discount_amount, final_price, is_free, req.user.id, status]
      );
    }

    // Radiology
    for (const test of radiologyTests) {
      const testPrice = test.price !== undefined ? test.price : (test.price_with_film || 0);
      const { final_price, discount_amount, is_free } = calc(testPrice, test.discount_percentage, test.is_free);
      if (!is_free) hasNonFree = true;
      
      const status = is_free ? 'paid' : 'pending_payment';
      await conn.execute(
        `INSERT INTO visit_radiology_requests (visit_id, radiology_test_id, with_film, price, discount_percentage, discount_amount, final_price, is_free, requested_by, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [visitId, test.id, test.withFilm ? 1 : 0, testPrice, test.discount_percentage || 0, discount_amount, final_price, is_free, req.user.id, status]
      );
    }

    // Clinical Services
    for (const test of clinicalServices) {
      const { final_price, discount_amount, is_free } = calc(test.price, test.discount_percentage, test.is_free);
      if (!is_free) hasNonFree = true;
      
      const status = is_free ? 'paid' : 'pending_payment';
      await conn.execute(
        `INSERT INTO visit_clinical_service_requests (visit_id, service_id, price, discount_percentage, discount_amount, final_price, is_free, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [visitId, test.id, test.price, test.discount_percentage || 0, discount_amount, final_price, is_free, status]
      );
    }

    if (hasNonFree) {
      await conn.execute(`UPDATE visits SET status = 'awaiting_service_payment' WHERE id = ?`, [visitId]);
    } else {
      // If all were free, they are considered paid. We emit events to lab/rad if needed.
      // But we just leave status as 'with_doctor' or 'completed_admin_pending_services'
      // Keep it 'with_doctor' so doctor can still see it in queue.
    }

    await conn.commit();
    
    // Notifications
    const io = req.app.get('io');
    if (io) {
      if (labTests.some(t => t.is_free)) io.to('lab').emit('request:new', { message: 'طلب تحاليل جديد' });
      if (radiologyTests.some(t => t.is_free)) io.to('radiology').emit('request:new', { message: 'طلب أشعة جديدة' });
      
      if (hasNonFree) {
        const [[visitInfo]] = await db.execute(`
          SELECT v.visit_number, p.full_name AS patient_name
          FROM visits v
          JOIN patients p ON p.id = v.patient_id
          WHERE v.id = ?
        `, [visitId]);

        const totalServices = (labTests.filter(t => !t.is_free).length) +
                              (radiologyTests.filter(t => !t.is_free).length) +
                              (clinicalServices.filter(t => !t.is_free).length);

        const formatServicesCountAr = (n) => {
          if (n === 1) return 'خدمة واحدة';
          if (n === 2) return 'خدمتان';
          if (n >= 3 && n <= 10) return `${n} خدمات`;
          return `${n} خدمة`;
        };
        const countStr = formatServicesCountAr(totalServices);

        io.to('cashier').emit('cashier:service_requested', {
          visitId: parseInt(visitId),
          visitNumber: visitInfo?.visit_number || '',
          patientName: visitInfo?.patient_name || 'مريض',
          servicesCount: totalServices,
          message: `طلب خدمات طبية للمريض: ${visitInfo?.patient_name || 'مريض'} (${countStr})`
        });
      }
      io.to('cashier').emit('cashier:update');
    }

    res.json({ message: 'تم طلب الخدمات بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

// PUT /api/doctor/visit/:visitId/close - Close visit
exports.closeVisit = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { visitId } = req.params;

    // 1. Check for pending ancillary requests
    const [[pendingCounts]] = await conn.execute(`
      SELECT 
        (SELECT COUNT(*) FROM visit_lab_requests 
         WHERE visit_id = ? AND status NOT IN ('completed', 'cancelled', 'refunded')) AS pending_labs,
        (SELECT COUNT(*) FROM visit_radiology_requests 
         WHERE visit_id = ? AND status NOT IN ('completed', 'cancelled', 'refunded')) AS pending_rads,
        (SELECT COUNT(*) FROM visit_clinical_service_requests 
         WHERE visit_id = ? AND status NOT IN ('completed', 'cancelled', 'refunded')) AS pending_clinicals
    `, [visitId, visitId, visitId]);

    const pendingLabs = parseInt(pendingCounts.pending_labs || 0);
    const pendingRads = parseInt(pendingCounts.pending_rads || 0);
    const pendingClinicals = parseInt(pendingCounts.pending_clinicals || 0);
    const totalPending = pendingLabs + pendingRads + pendingClinicals;

    if (totalPending > 0) {
      await conn.rollback();
      return res.status(400).json({
        message: `لا يمكن إنهاء المعاينة: توجد خدمات طبية معلقة (${totalPending}) لم تُستكمل بعد.`,
        details: { pendingLabs, pendingRads, pendingClinicals }
      });
    }

    // Fetch visit info for secretary discharge alert
    const [[visitRow]] = await conn.execute(`
      SELECT v.visit_number, p.full_name AS patient_name
      FROM visits v
      JOIN patients p ON p.id = v.patient_id
      WHERE v.id = ?
    `, [visitId]);

    // 2. Safely close visit
    await conn.execute(
      `UPDATE visits SET status = 'completed', closed_at = NOW() WHERE id = ?`, 
      [visitId]
    );

    await conn.commit();

    // 3. Multicast Socket Events
    const io = req.app.get('io');
    if (io) {
      io.to('doctor').emit('patient:updated', { visitId, status: 'completed' });
      io.to('cashier').emit('cashier:update');
      io.to('secretary').emit('secretary:patient_discharged', {
        visitId,
        patientName: visitRow ? visitRow.patient_name : 'مريض',
        visitNumber: visitRow ? visitRow.visit_number : ''
      });
    }

    res.json({ message: 'تم إنهاء المعاينة وإغلاق الزيارة بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم أثناء إغلاق الزيارة' });
  } finally {
    conn.release();
  }
};

// PUT /api/doctor/visit/:visitId/refer-surgery - Refer to surgery center
exports.referToSurgery = async (req, res) => {
  try {
    const { visitId } = req.params;
    
    // 1. Get patient_id from visit
    const [visitRows] = await db.execute(`SELECT patient_id FROM visits WHERE id = ?`, [visitId]);
    if (visitRows.length === 0) {
      return res.status(404).json({ message: 'الزيارة غير موجودة' });
    }
    const patientId = visitRows[0].patient_id;

    // 2. Insert into surgeries if not exists
    const [existing] = await db.execute(`SELECT id FROM surgeries WHERE visit_id = ?`, [visitId]);
    if (existing.length === 0) {
      await db.execute(
        `INSERT INTO surgeries (visit_id, patient_id, status) VALUES (?, ?, 'planned')`,
        [visitId, patientId]
      );
    }

    // 3. Update visit status
    await db.execute(
      `UPDATE visits SET status = 'transferred_to_center' WHERE id = ?`, [visitId]
    );

    // 4. Emit socket event for the coordinator
    const io = req.app.get('io');
    if (io) {
      io.to('surgery_coordinator').emit('surgery:new_referral', { message: 'تحويل مريض جديد إلى العمليات' });
      io.to('cashier').emit('cashier:update');
    }

    res.json({ message: 'تم تحويل المريض للعمليات بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// PUT /api/doctor/clinical-service/:id/complete - Doctor executes and completes a clinical service
exports.completeClinicalService = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { notes = '' } = req.body;

    const [[row]] = await conn.execute(
      `SELECT cr.*, v.id AS visit_id, cs.name AS service_name
       FROM visit_clinical_service_requests cr
       JOIN visits v ON v.id = cr.visit_id
       JOIN clinical_services cs ON cs.id = cr.service_id
       WHERE cr.id = ?`, [id]
    );

    if (!row) {
      return res.status(404).json({ message: 'الخدمة السريرية غير موجودة' });
    }

    if (row.status === 'completed') {
      return res.status(400).json({ message: 'هذه الخدمة تم تنفيذها مسبقاً' });
    }

    if (row.status === 'cancelled' || row.status === 'refunded') {
      return res.status(400).json({ message: 'لا يمكن تنفيذ خدمة ملغاة أو مستردة' });
    }

    await conn.execute(
      `UPDATE visit_clinical_service_requests 
       SET status = 'completed', performed_at = NOW(), performed_by = ?, notes = ?
       WHERE id = ?`,
      [req.user.id, notes || null, id]
    );

    // Check if any other services are pending
    const [[pendingLab]] = await conn.execute(
      `SELECT COUNT(*) as count FROM visit_lab_requests WHERE visit_id=? AND status NOT IN ('completed', 'cancelled', 'refunded')`, [row.visit_id]
    );
    const [[pendingRad]] = await conn.execute(
      `SELECT COUNT(*) as count FROM visit_radiology_requests WHERE visit_id=? AND status NOT IN ('completed', 'cancelled', 'refunded')`, [row.visit_id]
    );
    const [[pendingClin]] = await conn.execute(
      `SELECT COUNT(*) as count FROM visit_clinical_service_requests WHERE visit_id=? AND status NOT IN ('completed', 'cancelled', 'refunded')`, [row.visit_id]
    );

    if (pendingLab.count === 0 && pendingRad.count === 0 && pendingClin.count === 0) {
      await conn.execute(
        `UPDATE visits SET status='with_doctor' WHERE id=? AND status NOT IN ('completed', 'cancelled')`,
        [row.visit_id]
      );
    }

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('doctor').emit('patient:updated', { visitId: row.visit_id, message: `تم تنفيذ خدمة ${row.service_name}` });
      io.to('cashier').emit('cashier:update');
    }

    res.json({ message: `تم تنفيذ الخدمة السريرية (${row.service_name}) بنجاح` });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

// GET /api/doctor/patient/:patientId/history - Get patient timeline/history
exports.getPatientHistory = async (req, res) => {
  try {
    const { patientId } = req.params;
    
    // Fetch visits with consultation payment status
    const [visits] = await db.execute(`
      SELECT v.id, v.visit_number, v.created_at, v.status, v.closed_at, v.is_exempt, v.is_follow_up, v.entry_fee,
             (CASE WHEN v.visit_number LIKE 'EXT-%' THEN 1 ELSE 0 END) AS is_external,
             (
               SELECT ft.amount 
               FROM financial_transactions ft 
               WHERE ft.visit_id = v.id 
                 AND ft.category = 'entry_fee' 
                 AND ft.type = 'income' 
                 AND (ft.is_refund = 0 OR ft.is_refund IS NULL) 
               ORDER BY ft.id DESC LIMIT 1
             ) AS entry_fee_paid,
             (
               SELECT ft.created_at 
               FROM financial_transactions ft 
               WHERE ft.visit_id = v.id 
                 AND ft.category = 'entry_fee' 
                 AND ft.type = 'income' 
                 AND (ft.is_refund = 0 OR ft.is_refund IS NULL) 
               ORDER BY ft.id DESC LIMIT 1
             ) AS entry_fee_paid_at
      FROM visits v
      WHERE v.patient_id = ? 
        AND v.status NOT IN ('registered', 'awaiting_payment')
        AND (
          v.status = 'cancelled'
          OR v.is_exempt = 1
          OR v.is_follow_up = 1
          OR v.visit_number LIKE 'EXT-%'
          OR EXISTS (
            SELECT 1 FROM financial_transactions ft 
            WHERE ft.visit_id = v.id 
              AND ft.type = 'income' 
              AND (ft.is_refund = 0 OR ft.is_refund IS NULL)
          )
        )
      ORDER BY v.created_at DESC
    `, [patientId]);

    // For each visit, fetch lab, radiology, clinical, and surgeries
    for (let visit of visits) {
      // Lab
      const [lab] = await db.execute(`
        SELECT r.id, l.name, r.status, r.result_notes, r.result_file,
               r.price, r.discount_percentage, r.discount_amount, r.final_price, r.is_free,
               r.requested_at, r.performed_at
        FROM visit_lab_requests r
        JOIN lab_tests l ON l.id = r.lab_test_id
        WHERE r.visit_id = ?
      `, [visit.id]);
      visit.labTests = lab;

      // Radiology
      const [rad] = await db.execute(`
        SELECT r.id, rad.name, r.status, r.result_notes, r.result_file, r.with_film, r.radiology_film_id, f.film_size,
               r.price, r.discount_percentage, r.discount_amount, r.final_price, r.is_free,
               r.requested_at, r.performed_at
        FROM visit_radiology_requests r
        JOIN radiology_tests rad ON rad.id = r.radiology_test_id
        LEFT JOIN visit_radiology_films f ON f.id = r.radiology_film_id
        WHERE r.visit_id = ?
      `, [visit.id]);
      visit.radiologyTests = rad;

      // Clinical
      const [clin] = await db.execute(`
        SELECT r.id, c.name, r.status, r.created_at, r.performed_at, r.notes,
               r.price, r.discount_percentage, r.discount_amount, r.final_price, r.is_free
        FROM visit_clinical_service_requests r
        JOIN clinical_services c ON c.id = r.service_id
        WHERE r.visit_id = ?
      `, [visit.id]);
      visit.clinicalServices = clin;

      // Surgeries with full financial records & payments
      const [surg] = await db.execute(`
        SELECT s.id, s.id AS surgery_id, s.surgery_type, s.full_price, s.discount_amount, s.status, s.scheduled_date, s.created_at,
               COALESCE((SELECT SUM(amount) FROM surgery_payments WHERE surgery_id = s.id), 0) AS paid_amount,
               (s.full_price - s.discount_amount - COALESCE((SELECT SUM(amount) FROM surgery_payments WHERE surgery_id = s.id), 0)) AS remaining_amount,
               COALESCE(
                 (SELECT MAX(payment_date) FROM surgery_payments WHERE surgery_id = s.id),
                 (SELECT MAX(created_at) FROM financial_transactions WHERE surgery_id = s.id AND type = 'income')
               ) AS last_payment_date,
               s.visit_id
        FROM surgeries s
        WHERE s.visit_id = ?
        ORDER BY s.created_at DESC
      `, [visit.id]);

      for (let s of (surg || [])) {
        const [payments] = await db.execute(`
          SELECT sp.*, sp.id AS receipt_number, u.full_name AS receiver_name
          FROM surgery_payments sp
          LEFT JOIN users u ON u.id = sp.received_by
          WHERE sp.surgery_id = ?
          ORDER BY sp.payment_date DESC
        `, [s.id]);
        s.payments = payments || [];
      }
      visit.surgeries = surg;
      visit.is_surgery = (Array.isArray(surg) && surg.length > 0) || visit.status === 'transferred_to_center';

      // Prescriptions
      const [presc] = await db.execute(`
        SELECT id FROM prescriptions WHERE visit_id = ?
      `, [visit.id]);
      if (presc.length > 0) {
        const [items] = await db.execute(`
          SELECT medication_name, dosage, duration, instructions
          FROM prescription_items
          WHERE prescription_id = ?
          ORDER BY id ASC
        `, [presc[0].id]);
        visit.prescriptionItems = items;
      } else {
        visit.prescriptionItems = [];
      }
    }

    res.json(visits);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في جلب السجل الطبي' });
  }
};

// ── Doctor Admin Routes ───────────────────────────────────────────
const bcrypt = require('bcryptjs');

exports.getUsers = async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, full_name, username, role, is_active, last_login, created_at, plain_password FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { fullName, username, role, password } = req.body;
    if (!fullName || !username || !role || !password)
      return res.status(400).json({ message: 'جميع الحقول مطلوبة' });

    const hash = await bcrypt.hash(password, 10);
    await db.execute(
      `INSERT INTO users (full_name, username, role, password_hash, plain_password, must_change_password, created_by) VALUES (?, ?, ?, ?, ?, true, ?)`,
      [fullName, username, role, hash, password, req.user.id]
    );
    res.status(201).json({ message: 'تم إنشاء المستخدم بنجاح' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ message: 'اسم المستخدم مستخدم بالفعل' });
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (Number(id) === req.user.id)
      return res.status(400).json({ message: 'لا يمكنك تعطيل حسابك الخاص' });

    const [target] = await db.execute('SELECT role, username FROM users WHERE id = ?', [id]);
    if (target[0]?.role === 'auditor' || target[0]?.username === 'auditor') {
      return res.status(400).json({ message: 'لا يمكن تعطيل حساب مدير النظام' });
    }

    await db.execute('UPDATE users SET is_active = NOT is_active WHERE id = ?', [id]);
    res.json({ message: 'تم تحديث حالة المستخدم' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    const hash = await bcrypt.hash(newPassword, 10);
    await db.execute(
      'UPDATE users SET password_hash = ?, plain_password = ?, must_change_password = true WHERE id = ?', [hash, newPassword, id]
    );
    res.json({ message: 'تم إعادة تعيين كلمة المرور' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// ── Admin: Lab/Radiology Catalog ─────────────────────────────────
exports.getLabTests = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT t.*, c.name as category_name FROM lab_tests t
      LEFT JOIN lab_categories c ON t.category_id = c.id
      WHERE t.is_active = true AND t.is_deleted = 0 ORDER BY c.name, t.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.getRadiologyTests = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT t.*, c.name as category_name FROM radiology_tests t
      LEFT JOIN radiology_categories c ON t.category_id = c.id
      WHERE t.is_active = true AND t.is_deleted = 0 ORDER BY c.name, t.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// ── Settings (read/write from DB) ─────────────────────────────────
exports.getSettings = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT setting_key, setting_value FROM settings');
    const settings = {};
    rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.updateSetting = async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) return res.status(400).json({ message: 'مفتاح وقيمة مطلوبان' });
    await db.execute(
      `INSERT INTO settings (setting_key, setting_value, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), updated_by=VALUES(updated_by), updated_at=NOW()`,
      [key, String(value), req.user.id]
    );
    // Log audit
    await db.execute(
      `INSERT INTO audit_log (user_id, action, table_name, record_id, new_values) VALUES (?, 'update', 'settings', NULL, ?)`,
      [req.user.id, JSON.stringify({ key, value })]
    );

    const io = req.app.get('io');
    if (key === 'entry_fee' && io) {
      io.to('cashier').emit('cashier:update');
    }

    res.json({ message: 'تم حفظ الإعداد' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// ── Audit Log (real DB) ───────────────────────────────────────────
exports.getAuditLog = async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const [rows] = await db.execute(`
      SELECT al.*, u.full_name AS user_name, u.role AS user_role
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC
      LIMIT ?
    `, [parseInt(limit)]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// GET /api/doctor/dashboard-stats - Stats & Executed Services for Doctor Dashboard
exports.getDashboardStats = async (req, res) => {
  try {
    const { period = 'today', startDate, endDate } = req.query;

    let hasDateFilter = false;
    let shiftRange = null;

    if (period === 'custom' && startDate && endDate) {
      shiftRange = getShiftRange(startDate, endDate);
      hasDateFilter = true;
    } else if (period !== 'all') {
      const today = getCurrentShiftDate();
      let start = today;
      if (period === 'week') {
        start = formatShiftDate(getShiftWeekStartDate());
      } else if (period === 'month') {
        start = formatShiftDate(getShiftMonthStartDate());
      }
      shiftRange = getShiftRange(start, today);
      hasDateFilter = true;
    }

    // 1. Patient flow (Consultations, Exemptions, and Reviews - strictly paid/exempt/review, excluding unpaid registered and refunded)
    let visitsQuery = `
      SELECT 
        COUNT(v.id) as total,
        SUM(CASE WHEN v.is_exempt = 0 AND COALESCE(v.is_follow_up, 0) = 0 THEN 1 ELSE 0 END) as paidTotal,
        SUM(CASE WHEN v.is_exempt = 0 THEN 1 ELSE 0 END) as nonExemptTotal,
        SUM(CASE WHEN v.status IN ('waiting', 'with_doctor') THEN 1 ELSE 0 END) as waiting,
        SUM(CASE WHEN v.status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN v.is_exempt = 1 THEN 1 ELSE 0 END) as exemptCount,
        SUM(CASE WHEN v.is_follow_up = 1 THEN 1 ELSE 0 END) as reviewCount
      FROM visits v
      WHERE (v.visit_number IS NULL OR v.visit_number NOT LIKE 'EXT-%')
        AND v.status NOT IN ('cancelled', 'refunded', 'registered')
        AND (
          v.is_exempt = 1 
          OR v.is_follow_up = 1 
          OR (
            EXISTS (
              SELECT 1 FROM financial_transactions ft 
              WHERE ft.visit_id = v.id 
                AND ft.category = 'entry_fee' 
                AND ft.type = 'income' 
                AND (ft.is_refund = 0 OR ft.is_refund IS NULL)
            )
            AND NOT EXISTS (
              SELECT 1 FROM financial_transactions ft_ref 
              WHERE ft_ref.visit_id = v.id 
                AND (ft_ref.category = 'entry_fee' OR ft_ref.category = 'refund')
                AND (ft_ref.is_refund = 1 OR ft_ref.type = 'expense')
            )
          )
        )
    `;
    let visitsParams = [];
    if (hasDateFilter) {
      visitsQuery += ` AND ${shiftRange.sqlBetween('v.created_at')}`;
      visitsParams.push(shiftRange.startStr, shiftRange.endStr);
    }
    const [[patientsFlow]] = await db.execute(visitsQuery, visitsParams);

    // 2. Consultation Income (Entry Fees from financial_transactions - strictly net of refunds)
    let consultIncomeQuery = `
      SELECT 
        COALESCE(SUM(
          CASE 
            WHEN ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount 
            WHEN ft.type = 'expense' OR ft.is_refund = 1 THEN -ft.amount 
            ELSE 0 
          END
        ), 0) as total,
        COUNT(DISTINCT CASE 
          WHEN ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) 
               AND NOT EXISTS (
                 SELECT 1 FROM financial_transactions ft_ref 
                 WHERE ft_ref.visit_id = ft.visit_id 
                   AND (ft_ref.category = 'entry_fee' OR ft_ref.category = 'refund')
                   AND (ft_ref.is_refund = 1 OR ft_ref.type = 'expense')
               )
          THEN ft.id 
          ELSE NULL 
        END) as paidCount
      FROM financial_transactions ft
      LEFT JOIN visits v ON ft.visit_id = v.id
      WHERE (ft.category = 'entry_fee' OR (ft.category = 'refund' AND (ft.description LIKE '%معاينة%' OR ft.description LIKE '%كشف%')))
        AND (v.status IS NULL OR v.status NOT IN ('cancelled', 'refunded'))
    `;
    let consultIncomeParams = [];
    if (hasDateFilter) {
      consultIncomeQuery += ` AND ${shiftRange.sqlBetween('ft.created_at')}`;
      consultIncomeParams.push(shiftRange.startStr, shiftRange.endStr);
    }
    const [[consultIncomeRow]] = await db.execute(consultIncomeQuery, consultIncomeParams);
    const consultationIncome = Math.max(0, parseFloat(consultIncomeRow.total || 0));
    const paidConsultationsCount = parseInt(consultIncomeRow.paidCount || patientsFlow.paidTotal || 0);

    // 3. Services Income (Lab, Radiology, Clinical, External from financial_transactions - strictly net of refunds)
    let servicesIncomeQuery = `
      SELECT COALESCE(SUM(
        CASE 
          WHEN ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount 
          WHEN ft.type = 'expense' OR ft.is_refund = 1 THEN -ft.amount 
          ELSE 0 
        END
      ), 0) as total
      FROM financial_transactions ft
      LEFT JOIN visits v ON ft.visit_id = v.id
      WHERE (
        ft.category IN ('lab', 'external_lab', 'radiology', 'external_radiology', 'clinical', 'external_service') 
        OR (ft.category = 'refund' AND (
          ft.description LIKE '%تحليل%' OR ft.description LIKE '%مخبر%' OR ft.description LIKE '%FBS%' OR
          ft.description LIKE '%أشعة%' OR ft.description LIKE '%اشعة%' OR
          ft.description LIKE '%سريري%'
        ))
      )
      AND (v.status IS NULL OR v.status NOT IN ('cancelled', 'refunded'))
    `;
    let servicesIncomeParams = [];
    if (hasDateFilter) {
      servicesIncomeQuery += ` AND ${shiftRange.sqlBetween('ft.created_at')}`;
      servicesIncomeParams.push(shiftRange.startStr, shiftRange.endStr);
    }
    const [[servicesIncomeRow]] = await db.execute(servicesIncomeQuery, servicesIncomeParams);
    const servicesIncome = Math.max(0, parseFloat(servicesIncomeRow.total || 0));

    // 4. Surgery Income (from financial_transactions - strictly net of refunds)
    let surgeryIncomeQuery = `
      SELECT COALESCE(SUM(
        CASE 
          WHEN ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount 
          WHEN ft.type = 'expense' OR ft.is_refund = 1 THEN -ft.amount 
          ELSE 0 
        END
      ), 0) as total
      FROM financial_transactions ft
      LEFT JOIN surgeries s ON ft.surgery_id = s.id
      LEFT JOIN visits v ON ft.visit_id = v.id
      WHERE ft.category IN ('surgery_payment', 'surgery')
        AND (s.status IS NULL OR s.status != 'cancelled')
        AND (v.status IS NULL OR v.status NOT IN ('cancelled', 'refunded'))
    `;
    let surgeryIncomeParams = [];
    if (hasDateFilter) {
      surgeryIncomeQuery += ` AND ${shiftRange.sqlBetween('ft.created_at')}`;
      surgeryIncomeParams.push(shiftRange.startStr, shiftRange.endStr);
    }
    const [[surgeryIncomeRow]] = await db.execute(surgeryIncomeQuery, surgeryIncomeParams);
    const surgeryIncome = Math.max(0, parseFloat(surgeryIncomeRow.total || 0));

    // 5. Department Income Breakdown (strictly net of refunds, including external services and general income)
    let deptIncomeQuery = `
      SELECT 
        COALESCE(SUM(
          CASE 
            WHEN (ft.category IN ('lab', 'external_lab') OR (ft.category = 'refund' AND (ft.description LIKE '%تحليل%' OR ft.description LIKE '%مخبر%' OR ft.description LIKE '%FBS%')))
                 AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount 
            WHEN (ft.category IN ('lab', 'external_lab') OR (ft.category = 'refund' AND (ft.description LIKE '%تحليل%' OR ft.description LIKE '%مخبر%' OR ft.description LIKE '%FBS%')))
                 AND (ft.type = 'expense' OR ft.is_refund = 1) THEN -ft.amount 
            ELSE 0 
          END
        ), 0) as labIncome,
        COALESCE(SUM(
          CASE 
            WHEN (ft.category IN ('radiology', 'external_radiology') OR (ft.category = 'refund' AND (ft.description LIKE '%أشعة%' OR ft.description LIKE '%اشعة%')))
                 AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount 
            WHEN (ft.category IN ('radiology', 'external_radiology') OR (ft.category = 'refund' AND (ft.description LIKE '%أشعة%' OR ft.description LIKE '%اشعة%')))
                 AND (ft.type = 'expense' OR ft.is_refund = 1) THEN -ft.amount 
            ELSE 0 
          END
        ), 0) as radIncome,
        COALESCE(SUM(
          CASE 
            WHEN (ft.category IN ('clinical', 'external_service') OR (ft.category = 'refund' AND ft.description LIKE '%سريري%'))
                 AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount 
            WHEN (ft.category IN ('clinical', 'external_service') OR (ft.category = 'refund' AND ft.description LIKE '%سريري%'))
                 AND (ft.type = 'expense' OR ft.is_refund = 1) THEN -ft.amount 
            ELSE 0 
          END
        ), 0) as clinIncome,
        COALESCE(SUM(
          CASE 
            WHEN ft.category IN ('general_income', 'treasury_deposit')
                 AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount 
            WHEN ft.category IN ('general_income', 'treasury_deposit')
                 AND (ft.type = 'expense' OR ft.is_refund = 1) THEN -ft.amount 
            ELSE 0 
          END
        ), 0) as generalIncome,
        COUNT(DISTINCT CASE 
          WHEN ft.category IN ('general_income', 'treasury_deposit')
               AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.id 
          ELSE NULL 
        END) as generalCount
      FROM financial_transactions ft
      LEFT JOIN visits v ON ft.visit_id = v.id
      WHERE (
        ft.category IN ('lab', 'external_lab', 'radiology', 'external_radiology', 'clinical', 'external_service', 'general_income', 'treasury_deposit') 
        OR (ft.category = 'refund' AND (
          ft.description LIKE '%تحليل%' OR ft.description LIKE '%مخبر%' OR ft.description LIKE '%FBS%' OR
          ft.description LIKE '%أشعة%' OR ft.description LIKE '%اشعة%' OR
          ft.description LIKE '%سريري%'
        ))
      )
      AND (v.status IS NULL OR v.status NOT IN ('cancelled', 'refunded'))
    `;
    let deptIncomeParams = [];
    if (hasDateFilter) {
      deptIncomeQuery += ` AND ${shiftRange.sqlBetween('ft.created_at')}`;
      deptIncomeParams.push(shiftRange.startStr, shiftRange.endStr);
    }
    const [[deptIncomeRow]] = await db.execute(deptIncomeQuery, deptIncomeParams);

    // 6. Free Services Count across lab, radiology, and clinical
    let freeServicesQuery = `
      SELECT (
        (
          SELECT COUNT(lr.id) 
          FROM visit_lab_requests lr 
          JOIN visits v ON lr.visit_id = v.id
          WHERE lr.is_free = 1 
            AND lr.status NOT IN ('cancelled', 'refunded')
            AND v.status NOT IN ('cancelled', 'refunded')
            ${hasDateFilter ? 'AND ' + shiftRange.sqlBetween('COALESCE(lr.performed_at, lr.requested_at)') : ''}
        ) + (
          SELECT COUNT(rr.id) 
          FROM visit_radiology_requests rr 
          JOIN visits v ON rr.visit_id = v.id
          WHERE rr.is_free = 1 
            AND rr.status NOT IN ('cancelled', 'refunded')
            AND v.status NOT IN ('cancelled', 'refunded')
            ${hasDateFilter ? 'AND ' + shiftRange.sqlBetween('COALESCE(rr.performed_at, rr.requested_at)') : ''}
        ) + (
          SELECT COUNT(cr.id) 
          FROM visit_clinical_service_requests cr 
          JOIN visits v ON cr.visit_id = v.id
          WHERE cr.is_free = 1 
            AND cr.status NOT IN ('cancelled', 'refunded')
            AND v.status NOT IN ('cancelled', 'refunded')
            ${hasDateFilter ? 'AND ' + shiftRange.sqlBetween('COALESCE(cr.performed_at, cr.created_at)') : ''}
        )
      ) as totalFree
    `;
    let freeParams = [];
    if (hasDateFilter) {
      freeParams.push(shiftRange.startStr, shiftRange.endStr);
      freeParams.push(shiftRange.startStr, shiftRange.endStr);
      freeParams.push(shiftRange.startStr, shiftRange.endStr);
    }
    const [[freeServicesRow]] = await db.execute(freeServicesQuery, freeParams);
    const freeServicesCount = parseInt(freeServicesRow.totalFree || 0);

    // 7. Executed Services List (Paid Completed Services & Surgery Payments)
    let executedQuery = `
      SELECT 
        'lab' as service_type,
        lr.id,
        lt.name as service_name,
        p.full_name as patient_name,
        p.id as patient_id,
        v.visit_number,
        v.id as visit_id,
        lr.final_price,
        lr.price as original_price,
        lr.is_free,
        v.is_exempt,
        lr.status,
        lr.performed_at,
        lr.requested_at,
        (
          SELECT ft.created_at 
          FROM financial_transactions ft 
          WHERE ft.visit_id = lr.visit_id 
            AND ft.category IN ('lab', 'external_lab') 
            AND ft.type = 'income' 
            AND ft.is_refund = 0 
          ORDER BY ft.id DESC 
          LIMIT 1
        ) as payment_date
      FROM visit_lab_requests lr
      JOIN visits v ON lr.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      JOIN lab_tests lt ON lr.lab_test_id = lt.id
      WHERE lr.status IN ('paid', 'in_progress', 'result_uploaded', 'completed')
        AND lr.is_free = 0
        AND v.is_exempt = 0
        AND v.status NOT IN ('cancelled', 'refunded')
        ${hasDateFilter ? `AND EXISTS (
          SELECT 1 FROM financial_transactions ft 
          WHERE ft.visit_id = lr.visit_id 
            AND ft.category IN ('lab', 'external_lab') 
            AND ft.type = 'income' 
            AND ft.is_refund = 0 
            AND ${shiftRange.sqlBetween('ft.created_at')}
        )` : ''}

      UNION ALL

      SELECT 
        'radiology' as service_type,
        rr.id,
        rt.name as service_name,
        p.full_name as patient_name,
        p.id as patient_id,
        v.visit_number,
        v.id as visit_id,
        rr.final_price,
        rr.price as original_price,
        rr.is_free,
        v.is_exempt,
        rr.status,
        rr.performed_at,
        rr.requested_at,
        (
          SELECT ft.created_at 
          FROM financial_transactions ft 
          WHERE ft.visit_id = rr.visit_id 
            AND ft.category IN ('radiology', 'external_radiology') 
            AND ft.type = 'income' 
            AND ft.is_refund = 0 
          ORDER BY ft.id DESC 
          LIMIT 1
        ) as payment_date
      FROM visit_radiology_requests rr
      JOIN visits v ON rr.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      JOIN radiology_tests rt ON rr.radiology_test_id = rt.id
      WHERE rr.status IN ('paid', 'in_progress', 'result_uploaded', 'completed')
        AND rr.is_free = 0
        AND v.is_exempt = 0
        AND v.status NOT IN ('cancelled', 'refunded')
        ${hasDateFilter ? `AND EXISTS (
          SELECT 1 FROM financial_transactions ft 
          WHERE ft.visit_id = rr.visit_id 
            AND ft.category IN ('radiology', 'external_radiology') 
            AND ft.type = 'income' 
            AND ft.is_refund = 0 
            AND ${shiftRange.sqlBetween('ft.created_at')}
        )` : ''}

      UNION ALL

      SELECT 
        'clinical' as service_type,
        cr.id,
        cs.name as service_name,
        p.full_name as patient_name,
        p.id as patient_id,
        v.visit_number,
        v.id as visit_id,
        cr.final_price,
        cr.price as original_price,
        cr.is_free,
        v.is_exempt,
        cr.status,
        cr.performed_at,
        cr.created_at as requested_at,
        (
          SELECT ft.created_at 
          FROM financial_transactions ft 
          WHERE ft.visit_id = cr.visit_id 
            AND ft.category IN ('clinical', 'external_service') 
            AND ft.type = 'income' 
            AND ft.is_refund = 0 
          ORDER BY ft.id DESC 
          LIMIT 1
        ) as payment_date
      FROM visit_clinical_service_requests cr
      JOIN visits v ON cr.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      JOIN clinical_services cs ON cr.service_id = cs.id
      WHERE cr.status IN ('paid', 'completed')
        AND cr.is_free = 0
        AND v.is_exempt = 0
        AND v.status NOT IN ('cancelled', 'refunded')
        ${hasDateFilter ? `AND EXISTS (
          SELECT 1 FROM financial_transactions ft 
          WHERE ft.visit_id = cr.visit_id 
            AND ft.category IN ('clinical', 'external_service') 
            AND ft.type = 'income' 
            AND ft.is_refund = 0 
            AND ${shiftRange.sqlBetween('ft.created_at')}
        )` : ''}

      UNION ALL

      SELECT 
        'surgery' as service_type,
        sp.id,
        COALESCE(s.surgery_type, 'عملية جراحية') as service_name,
        p.full_name as patient_name,
        p.id as patient_id,
        COALESCE(v.visit_number, CONCAT('S-', s.id)) as visit_number,
        s.visit_id,
        sp.amount as final_price,
        s.full_price as original_price,
        0 as is_free,
        COALESCE(v.is_exempt, 0) as is_exempt,
        s.status,
        COALESCE(s.completed_date, sp.payment_date) as performed_at,
        s.created_at as requested_at,
        sp.payment_date as payment_date
      FROM surgery_payments sp
      JOIN surgeries s ON sp.surgery_id = s.id
      JOIN patients p ON s.patient_id = p.id
      LEFT JOIN visits v ON s.visit_id = v.id
      WHERE s.status != 'cancelled'
        ${hasDateFilter ? 'AND ' + shiftRange.sqlBetween('sp.payment_date') : ''}

      ORDER BY COALESCE(payment_date, performed_at, requested_at) DESC
    `;
    let executedParams = [];
    if (hasDateFilter) {
      executedParams.push(shiftRange.startStr, shiftRange.endStr);
      executedParams.push(shiftRange.startStr, shiftRange.endStr);
      executedParams.push(shiftRange.startStr, shiftRange.endStr);
      executedParams.push(shiftRange.startStr, shiftRange.endStr);
    }
    const [executedServices] = await db.execute(executedQuery, executedParams);

    // 7.1 Grouped Patient Payments per Visit (for Tab 1: سجل مدفوعات المرضى)
    let patientPaymentsQuery = `
      SELECT 
        COALESCE(ft.visit_id, s.visit_id) AS visit_id,
        COALESCE(v.visit_number, CONCAT('S-', s.id)) AS visit_number,
        COALESCE(v.patient_id, s.patient_id, ft.patient_id) AS patient_id,
        COALESCE(p.full_name, p_surg.full_name, p_ft.full_name, 'مريض بدون اسم') AS patient_name,
        (CASE WHEN v.visit_number LIKE 'EXT-%' THEN 1 ELSE 0 END) AS is_external,
        COALESCE(SUM(CASE WHEN ft.category = 'entry_fee' AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount ELSE 0 END), 0) AS consultation_paid,
        COALESCE(SUM(CASE WHEN ft.category IN ('lab', 'external_lab') AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount ELSE 0 END), 0) AS lab_paid,
        COALESCE(SUM(CASE WHEN ft.category IN ('radiology', 'external_radiology') AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount ELSE 0 END), 0) AS radiology_paid,
        COALESCE(SUM(CASE WHEN ft.category IN ('clinical', 'external_service') AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount ELSE 0 END), 0) AS clinical_paid,
        COALESCE(SUM(CASE WHEN ft.category IN ('surgery_payment', 'surgery') AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount ELSE 0 END), 0) AS surgery_paid,
        COALESCE(SUM(CASE WHEN ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) AND ft.category IN ('entry_fee', 'lab', 'external_lab', 'radiology', 'external_radiology', 'clinical', 'external_service', 'surgery_payment', 'surgery') THEN ft.amount ELSE 0 END), 0) AS total_paid,
        MAX(ft.created_at) AS last_payment_date
      FROM financial_transactions ft
      LEFT JOIN visits v ON v.id = ft.visit_id
      LEFT JOIN surgeries s ON s.id = ft.surgery_id
      LEFT JOIN patients p ON p.id = v.patient_id
      LEFT JOIN patients p_surg ON p_surg.id = s.patient_id
      LEFT JOIN patients p_ft ON p_ft.id = ft.patient_id
      WHERE ft.amount > 0
        AND ft.type = 'income'
        AND (ft.is_refund = 0 OR ft.is_refund IS NULL)
        AND ft.category IN ('entry_fee', 'lab', 'external_lab', 'radiology', 'external_radiology', 'clinical', 'external_service', 'surgery_payment', 'surgery')
        AND (v.status IS NULL OR v.status NOT IN ('cancelled', 'refunded'))
        AND (s.status IS NULL OR s.status != 'cancelled')
        ${hasDateFilter ? 'AND ' + shiftRange.sqlBetween('ft.created_at') : ''}
      GROUP BY COALESCE(ft.visit_id, s.visit_id), COALESCE(v.visit_number, CONCAT('S-', s.id)), COALESCE(v.patient_id, s.patient_id, ft.patient_id), COALESCE(p.full_name, p_surg.full_name, p_ft.full_name), v.visit_number
      ORDER BY last_payment_date DESC
    `;
    let patientPaymentsParams = hasDateFilter ? [shiftRange.startStr, shiftRange.endStr] : [];
    const [patientPaymentsRows] = await db.execute(patientPaymentsQuery, patientPaymentsParams);

    // 8. Discounts in period (Excluding exemptions)
    let labDiscountsQuery = `
      SELECT COALESCE(SUM(lr.discount_amount), 0) as total
      FROM visit_lab_requests lr
      JOIN visits v ON lr.visit_id = v.id
      WHERE lr.status NOT IN ('cancelled', 'refunded')
        AND v.status NOT IN ('cancelled', 'refunded')
        AND v.is_exempt = 0
        AND lr.discount_amount > 0
        AND lr.is_free = 0
    `;
    let radDiscountsQuery = `
      SELECT COALESCE(SUM(rr.discount_amount), 0) as total
      FROM visit_radiology_requests rr
      JOIN visits v ON rr.visit_id = v.id
      WHERE rr.status NOT IN ('cancelled', 'refunded')
        AND v.status NOT IN ('cancelled', 'refunded')
        AND v.is_exempt = 0
        AND rr.discount_amount > 0
        AND rr.is_free = 0
    `;
    let clinDiscountsQuery = `
      SELECT COALESCE(SUM(cr.discount_amount), 0) as total
      FROM visit_clinical_service_requests cr
      JOIN visits v ON cr.visit_id = v.id
      WHERE cr.status NOT IN ('cancelled', 'refunded')
        AND v.status NOT IN ('cancelled', 'refunded')
        AND v.is_exempt = 0
        AND cr.discount_amount > 0
        AND cr.is_free = 0
    `;
    let discountParams = [];
    if (hasDateFilter) {
      labDiscountsQuery += ` AND ${shiftRange.sqlBetween('lr.requested_at')}`;
      radDiscountsQuery += ` AND ${shiftRange.sqlBetween('rr.requested_at')}`;
      clinDiscountsQuery += ` AND ${shiftRange.sqlBetween('cr.created_at')}`;
      discountParams.push(shiftRange.startStr, shiftRange.endStr);
    }
    const [[labDisc]] = await db.execute(labDiscountsQuery, discountParams);
    const [[radDisc]] = await db.execute(radDiscountsQuery, discountParams);
    const [[clinDisc]] = await db.execute(clinDiscountsQuery, discountParams);
    const totalDiscounts = parseFloat(labDisc.total || 0) + parseFloat(radDisc.total || 0) + parseFloat(clinDisc.total || 0);

    // 9. Exempt visits in period
    let exemptQuery = `
      SELECT COUNT(id) as total
      FROM visits
      WHERE is_exempt = 1 
        AND status NOT IN ('cancelled', 'refunded')
    `;
    let exemptParams = [];
    if (hasDateFilter) {
      exemptQuery += ` AND ${shiftRange.sqlBetween('created_at')}`;
      exemptParams.push(shiftRange.startStr, shiftRange.endStr);
    }
    const [[exemptStats]] = await db.execute(exemptQuery, exemptParams);

    // 10. Treasury / Fund Net Balance (Matching Cashier Reports)
    let treasuryQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN type='income' AND (is_refund=0 OR is_refund IS NULL) THEN amount ELSE 0 END), 0) AS totalIncome,
        COALESCE(SUM(CASE WHEN type='income' AND (is_refund=0 OR is_refund IS NULL) AND (payment_method IS NULL OR payment_method != 'bank_transfer') THEN amount ELSE 0 END), 0) AS cashIncome,
        COALESCE(SUM(CASE WHEN type='income' AND (is_refund=0 OR is_refund IS NULL) AND payment_method = 'bank_transfer' THEN amount ELSE 0 END), 0) AS bankIncome,
        COALESCE(SUM(CASE WHEN type='expense' AND (is_refund=0 OR is_refund IS NULL) THEN amount ELSE 0 END), 0) AS totalExpense,
        COALESCE(SUM(CASE WHEN type='expense' AND (is_refund=0 OR is_refund IS NULL) AND (payment_method IS NULL OR payment_method != 'bank_transfer') THEN amount ELSE 0 END), 0) AS cashExpense,
        COALESCE(SUM(CASE WHEN type='expense' AND (is_refund=0 OR is_refund IS NULL) AND payment_method = 'bank_transfer' THEN amount ELSE 0 END), 0) AS bankExpense,
        COALESCE(SUM(CASE WHEN is_refund=1 OR category='refund' THEN amount ELSE 0 END), 0) AS totalRefunds,
        COALESCE(SUM(CASE WHEN (is_refund=1 OR category='refund') AND (payment_method IS NULL OR payment_method != 'bank_transfer') THEN amount ELSE 0 END), 0) AS cashRefunds,
        COALESCE(SUM(CASE WHEN (is_refund=1 OR category='refund') AND payment_method = 'bank_transfer' THEN amount ELSE 0 END), 0) AS bankRefunds,
        COUNT(CASE WHEN type='income' AND (is_refund=0 OR is_refund IS NULL) THEN 1 END) AS incomeCount,
        COUNT(CASE WHEN type='expense' AND (is_refund=0 OR is_refund IS NULL) THEN 1 END) AS expenseCount,
        COUNT(CASE WHEN is_refund=1 OR category='refund' THEN 1 END) AS refundCount,
        COUNT(*) AS allCount
      FROM financial_transactions ft
      WHERE ft.amount > 0
    `;
    let treasuryParams = [];
    if (hasDateFilter) {
      treasuryQuery += ` AND ${shiftRange.sqlBetween('ft.created_at')}`;
      treasuryParams.push(shiftRange.startStr, shiftRange.endStr);
    }
    const [[treasuryRow]] = await db.execute(treasuryQuery, treasuryParams);

    const treasuryTotalIncome = parseFloat(treasuryRow.totalIncome || 0);
    const treasuryCashIncome = parseFloat(treasuryRow.cashIncome || 0);
    const treasuryBankIncome = parseFloat(treasuryRow.bankIncome || 0);

    const treasuryTotalExpense = parseFloat(treasuryRow.totalExpense || 0);
    const treasuryCashExpense = parseFloat(treasuryRow.cashExpense || 0);
    const treasuryBankExpense = parseFloat(treasuryRow.bankExpense || 0);

    const treasuryTotalRefunds = parseFloat(treasuryRow.totalRefunds || 0);
    const treasuryCashRefunds = parseFloat(treasuryRow.cashRefunds || 0);
    const treasuryBankRefunds = parseFloat(treasuryRow.bankRefunds || 0);

    const netBalance = treasuryTotalIncome - treasuryTotalExpense - treasuryTotalRefunds;
    const cashNet = treasuryCashIncome - treasuryCashExpense - treasuryCashRefunds;
    const bankNet = treasuryBankIncome - treasuryBankExpense - treasuryBankRefunds;
    const treasuryTransactionsCount = parseInt(treasuryRow.allCount || 0);
    const incomeCount = parseInt(treasuryRow.incomeCount || 0);
    const expenseCount = parseInt(treasuryRow.expenseCount || 0);
    const refundCount = parseInt(treasuryRow.refundCount || 0);
    const generalIncome = Math.max(0, parseFloat(deptIncomeRow.generalIncome || 0));
    const generalCount = parseInt(deptIncomeRow.generalCount || 0);

    const clinicExecutedServices = executedServices.filter(s => s.service_type !== 'surgery');

    res.json({
      patientsFlow: {
        total: parseInt(patientsFlow.total || 0),
        paidCount: parseInt(patientsFlow.paidTotal || 0),
        nonExemptTotal: parseInt(patientsFlow.nonExemptTotal || 0),
        waiting: parseInt(patientsFlow.waiting || 0),
        completed: parseInt(patientsFlow.completed || 0),
        exemptCount: parseInt(patientsFlow.exemptCount || 0),
        reviewCount: parseInt(patientsFlow.reviewCount || 0)
      },
      procedures: {
        total: clinicExecutedServices.length + freeServicesCount,
        completed: clinicExecutedServices.length + freeServicesCount,
        paidCount: clinicExecutedServices.length,
        freeServicesCount: freeServicesCount
      },
      financial: {
        totalRevenue: treasuryTotalIncome,
        netRevenue: Math.max(0, consultationIncome + servicesIncome + surgeryIncome + generalIncome),
        consultationIncome,
        paidConsultationsCount: paidConsultationsCount,
        servicesIncome,
        surgeryIncome,
        generalIncome,
        generalCount,
        discounts: totalDiscounts,
        exemptCount: parseInt(patientsFlow.exemptCount || 0),
        reviewCount: parseInt(patientsFlow.reviewCount || 0),
        freeServicesCount: freeServicesCount,
        deptIncome: {
          lab: Math.max(0, parseFloat(deptIncomeRow.labIncome || 0)),
          radiology: Math.max(0, parseFloat(deptIncomeRow.radIncome || 0)),
          clinical: Math.max(0, parseFloat(deptIncomeRow.clinIncome || 0)),
          surgery: surgeryIncome,
          general: generalIncome
        },
        treasury: {
          netBalance,
          cashNet,
          bankNet,
          totalIncome: treasuryTotalIncome,
          totalExpense: treasuryTotalExpense,
          totalRefunds: treasuryTotalRefunds,
          cashIncome: treasuryCashIncome,
          bankIncome: treasuryBankIncome,
          cashExpense: treasuryCashExpense,
          bankExpense: treasuryBankExpense,
          cashRefunds: treasuryCashRefunds,
          bankRefunds: treasuryBankRefunds,
          incomeCount,
          expenseCount,
          refundCount,
          allCount: treasuryTransactionsCount,
          transactionsCount: treasuryTransactionsCount
        }
      },
      executedServices: executedServices.map(s => ({
        id: s.id,
        service_type: s.service_type,
        service_name: s.service_name,
        patient_name: s.patient_name,
        patient_id: s.patient_id,
        visit_number: s.visit_number || s.visit_id,
        visit_id: s.visit_id,
        collected_amount: s.is_free ? 0 : parseFloat(s.final_price || 0),
        original_price: parseFloat(s.original_price || 0),
        is_free: Boolean(s.is_free),
        is_exempt: Boolean(s.is_exempt),
        status: s.status,
        payment_date: s.payment_date || s.performed_at || s.requested_at,
        performed_at: s.performed_at
      })),
      patientPayments: (patientPaymentsRows || []).map(r => ({
        visit_id: r.visit_id,
        visit_number: r.visit_number || String(r.visit_id),
        patient_id: r.patient_id,
        patient_name: r.patient_name || 'مريض بدون اسم',
        is_external: Boolean(r.is_external),
        consultation_paid: parseFloat(r.consultation_paid || 0),
        lab_paid: parseFloat(r.lab_paid || 0),
        radiology_paid: parseFloat(r.radiology_paid || 0),
        clinical_paid: parseFloat(r.clinical_paid || 0),
        surgery_paid: parseFloat(r.surgery_paid || 0),
        total_paid: parseFloat(r.total_paid || 0),
        last_payment_date: r.last_payment_date
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// DELETE /api/doctor/order-service/:type/:id - Cancel/Delete a service request if pending payment
exports.cancelServiceRequest = async (req, res) => {
  try {
    const { type, id } = req.params;
    let tableName = '';
    let nameJoin = '';
    let nameCol = '';
    
    if (type === 'lab') {
      tableName = 'visit_lab_requests';
      nameJoin = 'JOIN lab_tests lt ON lt.id = req.lab_test_id';
      nameCol = 'lt.name AS service_name';
    } else if (type === 'radiology') {
      tableName = 'visit_radiology_requests';
      nameJoin = 'JOIN radiology_tests rt ON rt.id = req.radiology_test_id';
      nameCol = 'rt.name AS service_name';
    } else if (type === 'clinical') {
      tableName = 'visit_clinical_service_requests';
      nameJoin = 'JOIN clinical_services cs ON cs.id = req.service_id';
      nameCol = 'cs.name AS service_name';
    } else {
      return res.status(400).json({ message: 'نوع الخدمة غير معروف' });
    }

    // Check if the service request is in a cancellable state
    const [existing] = await db.execute(
      `SELECT req.status, req.visit_id, req.is_free, req.final_price, ${nameCol}, p.full_name AS patient_name
       FROM ${tableName} req
       JOIN visits v ON v.id = req.visit_id
       JOIN patients p ON p.id = v.patient_id
       ${nameJoin}
       WHERE req.id = ?`,
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }

    // Condition A: Free service, not yet executed by lab tech (status = 'pending' or 'paid')
    // Condition B: Paid service awaiting cashier payment (status = 'pending_payment')
    // Condition C: Free service marked 'paid' by system but lab hasn't started yet
    const isFree = (existing[0].is_free === 1 || parseFloat(existing[0].final_price || 0) === 0) ? 1 : 0;
    const serviceName = existing[0].service_name || 'خدمة';
    const patientName = existing[0].patient_name || 'مريض';
    const isPendingPayment = existing[0].status === 'pending_payment';
    const isPending        = existing[0].status === 'pending';
    const isPaidFree       = existing[0].status === 'paid' && isFree === 1;

    if (!isPendingPayment && !isPending && !isPaidFree) {
      return res.status(400).json({ message: 'لا يمكن إلغاء الطلب بعد سداد رسومه أو بدء العمل فيه' });
    }

    // Delete the request
    await db.execute(`DELETE FROM ${tableName} WHERE id = ?`, [id]);

    // If it was a free service, clean up any 0-amount financial transaction in financial_transactions
    if (isFree === 1) {
      await db.execute(
        `DELETE FROM financial_transactions 
         WHERE visit_id = ? AND category = ? AND amount = 0 AND (description LIKE ? OR description LIKE ?)`,
        [existing[0].visit_id, type, `%${serviceName}%`, '%مجاني%']
      );
    }

    // Check if there are other non-free pending requests to determine visit status
    const visitId = existing[0].visit_id;
    const [labs] = await db.execute(`SELECT id FROM visit_lab_requests WHERE visit_id = ? AND status = 'pending_payment'`, [visitId]);
    const [rads] = await db.execute(`SELECT id FROM visit_radiology_requests WHERE visit_id = ? AND status = 'pending_payment'`, [visitId]);
    const [clins] = await db.execute(`SELECT id FROM visit_clinical_service_requests WHERE visit_id = ? AND status = 'pending_payment'`, [visitId]);
    
    if (labs.length === 0 && rads.length === 0 && clins.length === 0) {
      // Restore visit status to 'with_doctor'
      await db.execute(`UPDATE visits SET status = 'with_doctor' WHERE id = ? AND status = 'awaiting_service_payment'`, [visitId]);
    }

    const io = req.app.get('io');
    if (io) {
      const payload = {
        visitId,
        patientName,
        serviceType: type,
        serviceName,
        isFree
      };

      if (isFree === 1) {
        if (type === 'lab') io.to('lab').emit('order:cancelled', payload);
        if (type === 'radiology') io.to('radiology').emit('order:cancelled', payload);
      } else {
        io.to('cashier').emit('order:cancelled', payload);
      }

      io.to('cashier').emit('cashier:update');
      io.to('doctor').emit('patient:updated', { visitId });
    }

    res.json({ message: 'تم إلغاء الطلب بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// POST /api/doctor/visit/:visitId/prescription - Save prescription
exports.savePrescription = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { visitId } = req.params;
    const { items = [] } = req.body;

    const [visitRows] = await conn.execute(`SELECT patient_id FROM visits WHERE id = ?`, [visitId]);
    if (visitRows.length === 0) {
      return res.status(404).json({ message: 'الزيارة غير موجودة' });
    }
    const patientId = visitRows[0].patient_id;

    const [existing] = await conn.execute(`SELECT id FROM prescriptions WHERE visit_id = ?`, [visitId]);
    if (existing.length > 0) {
      await conn.execute(`DELETE FROM prescriptions WHERE visit_id = ?`, [visitId]);
    }

    const [prescriptionRes] = await conn.execute(
      `INSERT INTO prescriptions (visit_id, patient_id, doctor_id) VALUES (?, ?, ?)`,
      [visitId, patientId, req.user.id]
    );
    const prescriptionId = prescriptionRes.insertId;

    for (const item of items) {
      if (!item.medication_name) continue;
      await conn.execute(
        `INSERT INTO prescription_items (prescription_id, medication_name, dosage, frequency, duration, instructions) VALUES (?, ?, ?, ?, ?, ?)`,
        [prescriptionId, item.medication_name.trim(), item.dosage || '', item.frequency || '', item.duration || '', item.instructions || '']
      );
    }

    await conn.commit();
    res.json({ message: 'تم حفظ الوصفة الطبية بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

// GET /api/doctor/visit/:visitId/prescription - Get prescription
exports.getPrescription = async (req, res) => {
  try {
    const { visitId } = req.params;
    const [prescRows] = await db.execute(
      `SELECT * FROM prescriptions WHERE visit_id = ?`, [visitId]
    );

    if (prescRows.length === 0) {
      return res.json({ items: [] });
    }

    const [items] = await db.execute(
      `SELECT * FROM prescription_items WHERE prescription_id = ? ORDER BY id ASC`,
      [prescRows[0].id]
    );

    res.json({
      ...prescRows[0],
      items
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// POST /api/doctor/vip-intake
exports.createVipIntake = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { patientId: existingPatientId, fullName, age, gender = 'male', phone = null } = req.body;
    
    let patientId = existingPatientId;

    if (patientId) {
      const [[existingVisitToday]] = await conn.execute(
        `SELECT id FROM visits WHERE patient_id = ? AND ${SHIFT_IS_TODAY_SQL('created_at')} AND status != 'cancelled'`,
        [patientId]
      );
      if (existingVisitToday) {
        await conn.rollback();
        return res.status(409).json({ message: 'هذا المريض مسجل بالفعل في قائمة زيارات اليوم.' });
      }
    } else {
      if (!fullName) return res.status(400).json({ message: 'الاسم مطلوب' });
      
      const [[existingPatientVisit]] = await conn.execute(`
        SELECT v.id FROM visits v
        JOIN patients p ON v.patient_id = p.id
        WHERE p.full_name = ? AND ${SHIFT_IS_TODAY_SQL('v.created_at')} AND v.status != 'cancelled' AND (v.visit_number IS NULL OR v.visit_number NOT LIKE 'EXT-%')
      `, [fullName.trim()]);
      
      if (existingPatientVisit) {
        await conn.rollback();
        return res.status(409).json({ message: 'يوجد مريض بهذا الاسم مسجل بالفعل في قائمة زيارات اليوم.' });
      }

      // Insert patient
      const [patientResult] = await conn.execute(
        `INSERT INTO patients (full_name, age, gender, phone, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [fullName.trim(), age || null, gender, phone || null, req.user.id]
      );
      patientId = patientResult.insertId;
    }

    const visitNumber = `VIP${Date.now()}`;
    const [visitResult] = await conn.execute(
      `INSERT INTO visits (patient_id, visit_number, entity, status, is_exempt, entry_fee, created_by)
       VALUES (?, ?, 'clinic', 'with_doctor', 1, 0, ?)`,
      [patientId, visitNumber, req.user.id]
    );
    const visitId = visitResult.insertId;

    await conn.commit();

    // Fetch the newly created visit with patient info
    const [[newVisit]] = await db.execute(`
      SELECT v.id as visitId, v.visit_number, v.status, v.entity, v.created_at, v.is_follow_up, v.is_exempt,
             p.id as patient_id, p.full_name, p.age, p.gender, p.chronic_diseases, p.allergies, p.current_medications, p.phone
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      WHERE v.id = ?
    `, [visitId]);

    // Send realtime notification
    const io = req.app.get('io');
    if (io) {
      io.to('doctor').to('secretary').emit('patient:waiting'); // triggers queue refresh for doctor and secretary only
      io.to('cashier').emit('cashier:update');
    }

    res.status(201).json({
      message: 'تم تسجيل حالة الإعفاء المباشرة بنجاح',
      visit: {
        ...newVisit,
        labRequests: [],
        radiologyRequests: [],
        clinicalRequests: []
      }
    });

  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};





