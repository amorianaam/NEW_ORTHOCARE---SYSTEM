const db = require('../database/db');
const { getShiftRange, SHIFT_START_SQL, SHIFT_GROUP_BY_SQL, SHIFT_IS_TODAY_SQL } = require('../utils/shiftHelpers');

// ─── HELPERS ──────────────────────────────────────────────────────
async function recordTransaction(conn, { type, category, amount, visitId = null, surgeryId = null, description, userId, paymentMethod = 'cash' }) {
  const validMethod = (paymentMethod === 'bank_transfer' || paymentMethod === 'transfer' || paymentMethod === 'bank') ? 'bank_transfer' : 'cash';
  await conn.execute(
    `INSERT INTO financial_transactions (type, category, amount, payment_method, visit_id, surgery_id, description, performed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [type, category, amount, validMethod, visitId, surgeryId, description, userId]
  );
}

// ═══════════════════════════════════════════════════════════════════
// GET /api/cashier/pending  — زيارات بانتظار دفع رسوم المعاينة
// ═══════════════════════════════════════════════════════════════════
exports.getPending = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT v.id AS visit_id, v.id, v.visit_number, v.entity, v.created_at,
             v.discount_amount, v.discount_reason, v.status,
             p.id AS patient_id, p.full_name, p.age, p.gender, p.phone
      FROM visits v
      JOIN patients p ON p.id = v.patient_id
      WHERE (v.visit_number IS NULL OR v.visit_number NOT LIKE 'EXT-%')
        AND v.status NOT IN ('completed', 'cancelled')
        AND COALESCE(v.is_exempt, 0) = 0
        AND COALESCE(v.is_follow_up, 0) = 0
        AND (v.entry_fee IS NULL OR v.entry_fee = 0)
        AND NOT EXISTS (
          SELECT 1 FROM financial_transactions ft 
          WHERE ft.visit_id = v.id 
            AND ft.category = 'entry_fee' 
            AND ft.type = 'income' 
            AND ft.is_refund = 0
        )
      ORDER BY v.created_at ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// ═══════════════════════════════════════════════════════════════════
// POST /api/cashier/visit/:id/pay-entry  — تأكيد دفع رسم الدخول
// ═══════════════════════════════════════════════════════════════════
exports.payEntryFee = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const receiptNumber = 'REC-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000);
    const { id: visitId } = req.params;
    const { amount, discountAmount = 0, discountReason = '', payment_method, paymentMethod } = req.body;
    const selectedPaymentMethod = payment_method || paymentMethod || 'cash';

    if (!amount || isNaN(amount) || amount <= 0)
      return res.status(400).json({ message: 'مبلغ الرسم غير صحيح' });

    // Defensive Guard: Reject entry fee payment for external dummy visits
    const [[targetVisit]] = await conn.execute(`SELECT visit_number FROM visits WHERE id=?`, [visitId]);
    if (targetVisit?.visit_number?.startsWith('EXT-')) {
      await conn.rollback();
      return res.status(400).json({ message: 'لا يمكن تسديد رسوم معاينة لزيارة خارجية' });
    }

    // Update visit
    await conn.execute(
      `UPDATE visits SET status='waiting', entry_fee=?, discount_amount=?, discount_reason=? WHERE id=?`,
      [amount, discountAmount, discountReason, visitId]
    );

    // Record financial transaction
    await recordTransaction(conn, {
      type: 'income', category: 'entry_fee',
      amount: parseFloat(amount) - parseFloat(discountAmount),
      visitId, description: 'رسوم معاينة', userId: req.user.id,
      paymentMethod: selectedPaymentMethod
    });

    await conn.commit();

    // 🔔 Notify doctor: new patient in waiting queue
    const [patientRows] = await conn.execute(`SELECT p.full_name as patientName FROM visits v JOIN patients p ON v.patient_id = p.id WHERE v.id=?`, [visitId]);
    const patientName = patientRows.length > 0 ? patientRows[0].patientName : 'مريض';

    const io = req.app.get('io');
    if (io) {
      const waitingPayload = {
        visitId,
        message: `تم تسديد رسوم المعاينة ونقل المريض (${patientName}) لقائمة الانتظار`,
        patientName,
        type: 'patient_queued'
      };
      io.to('doctor').emit('patient:waiting', waitingPayload);
      io.to('secretary').emit('patient:waiting', waitingPayload);
      io.to('cashier').emit('cashier:update');
    }
    res.json({ message: 'تم تأكيد الدفع وإرسال المريض إلى الانتظار' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════════════
// PUT /api/cashier/visit/:id/cancel  — إلغاء زيارة
// ═══════════════════════════════════════════════════════════════════
exports.cancelVisit = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id: visitId } = req.params;
    const { refundAmount = 0, reason = '' } = req.body;

    const [visitData] = await conn.execute(`
      SELECT v.visit_number, p.full_name, p.id AS patient_id
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      WHERE v.id = ?
    `, [visitId]);
    const cancelledVisit = visitData[0] || {};

    await conn.execute(`UPDATE visits SET status='cancelled' WHERE id=?`, [visitId]);

    if (parseFloat(refundAmount) > 0) {
      await recordTransaction(conn, {
        type: 'expense', category: 'refund',
        amount: refundAmount, visitId,
        description: `استرداد: ${reason}`, userId: req.user.id
      });
    }

    await conn.commit();
    const io = req.app.get('io');
    if (io) {
      const cancelPayload = {
        visitId,
        patientId: cancelledVisit.patient_id,
        visitNumber: cancelledVisit.visit_number || '',
        patientName: cancelledVisit.full_name || 'مريض',
        message: `تم إلغاء الزيارة (${cancelledVisit.visit_number || ''}) للمريض: (${cancelledVisit.full_name || 'مريض'}) من قبل المحاسب`
      };
      io.to('cashier').emit('cashier:update');
      io.to('secretary').emit('visit:cancelled', cancelPayload);
      io.to('doctor').emit('visit:cancelled', cancelPayload);
      io.to('doctor').emit('patient:cancelled', { visitId, patientId: cancelledVisit.patient_id });
      io.to('secretary').emit('patient:updated', { patientId: cancelledVisit.patient_id });
      io.to('doctor').emit('patient:updated', { patientId: cancelledVisit.patient_id, visitId });
    }
    res.json({ message: 'تم إلغاء الزيارة بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════════════
// GET /api/cashier/waiting  — مرضى لديهم طلبات خدمات (awaiting_service_payment)
// ═══════════════════════════════════════════════════════════════════
exports.getWaiting = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT v.id AS visit_id, v.id, v.visit_number, v.entity, v.status,
             v.entry_fee, v.discount_amount, v.created_at,
             p.id AS patient_id, p.full_name, p.age, p.gender, p.phone,
             (
               (SELECT COUNT(*) FROM visit_lab_requests WHERE visit_id = v.id AND status = 'pending_payment') +
               (SELECT COUNT(*) FROM visit_radiology_requests WHERE visit_id = v.id AND status = 'pending_payment') +
               (SELECT COUNT(*) FROM visit_clinical_service_requests WHERE visit_id = v.id AND status = 'pending_payment')
             ) AS pending_services_count
      FROM visits v
      JOIN patients p ON p.id = v.patient_id
      WHERE v.status != 'cancelled'
        AND (
          EXISTS (SELECT 1 FROM visit_lab_requests WHERE visit_id = v.id AND status = 'pending_payment')
          OR EXISTS (SELECT 1 FROM visit_radiology_requests WHERE visit_id = v.id AND status = 'pending_payment')
          OR EXISTS (SELECT 1 FROM visit_clinical_service_requests WHERE visit_id = v.id AND status = 'pending_payment')
        )
      ORDER BY v.created_at ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// ═══════════════════════════════════════════════════════════════════
// GET /api/cashier/visit/:id/invoice  — فاتورة زيارة مع كل الخدمات
// ═══════════════════════════════════════════════════════════════════
exports.getInvoice = async (req, res) => {
  try {
    const { id: visitId } = req.params;

    const [[visit]] = await db.execute(`
      SELECT v.*, p.full_name, p.age, p.gender, p.phone
      FROM visits v JOIN patients p ON p.id = v.patient_id
      WHERE v.id = ?
    `, [visitId]);

    if (!visit) return res.status(404).json({ message: 'الزيارة غير موجودة' });

    const [labRequests] = await db.execute(`
      SELECT vlr.id, vlr.status, vlr.price, vlr.discount_percentage,
             vlr.discount_amount, vlr.final_price, vlr.is_free,
             lt.name, lt.category_id, lc.name AS category_name
      FROM visit_lab_requests vlr
      JOIN lab_tests lt ON lt.id = vlr.lab_test_id
      LEFT JOIN lab_categories lc ON lc.id = lt.category_id
      WHERE vlr.visit_id = ? AND vlr.status != 'cancelled'
    `, [visitId]);

    const [radiologyRequests] = await db.execute(`
      SELECT vrr.id, vrr.status, vrr.price, vrr.discount_percentage,
             vrr.discount_amount, vrr.final_price, vrr.is_free,
             vrr.with_film, rt.name, rt.price_with_film, rt.price_without_film
      FROM visit_radiology_requests vrr
      JOIN radiology_tests rt ON rt.id = vrr.radiology_test_id
      WHERE vrr.visit_id = ? AND vrr.status != 'cancelled'
    `, [visitId]);

    const [clinicalRequests] = await db.execute(`
      SELECT vcr.id, vcr.status, vcr.price, vcr.discount_percentage,
             vcr.discount_amount, vcr.final_price, vcr.is_free,
             cs.name
      FROM visit_clinical_service_requests vcr
      JOIN clinical_services cs ON cs.id = vcr.service_id
      WHERE vcr.visit_id = ? AND vcr.status != 'cancelled'
    `, [visitId]);

    res.json({ visit, labRequests, radiologyRequests, clinicalRequests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// ═══════════════════════════════════════════════════════════════════
// POST /api/cashier/visit/:id/pay-services  — دفع خدمات محددة
// Body: { labIds: [1,2], radiologyIds: [{id:3, withFilm:true}], discount:{amount,reason} }
// ═══════════════════════════════════════════════════════════════════
exports.payServices = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id: visitId } = req.params;
    const { labIds = [], radiologyItems = [], clinicalIds = [], discount = {}, payment_method, paymentMethod } = req.body;
    const selectedPaymentMethod = payment_method || paymentMethod || 'cash';
    const userId = req.user.id;
    let totalPaid = 0;

    // ── Pay lab tests ──
    for (const labId of labIds) {
      const [[req_]] = await conn.execute(
        'SELECT vlr.*, lt.name FROM visit_lab_requests vlr JOIN lab_tests lt ON vlr.lab_test_id = lt.id WHERE vlr.id=? AND vlr.visit_id=?', [labId, visitId]
      );
      if (!req_ || req_.status !== 'pending_payment') continue;

      await conn.execute(
        `UPDATE visit_lab_requests SET status='paid' WHERE id=?`, [labId]
      );
      await recordTransaction(conn, {
        type: 'income', category: 'lab',
        amount: parseFloat(req_.final_price ?? req_.price),
        visitId,
        description: req_.name, userId,
        paymentMethod: selectedPaymentMethod
      });
      totalPaid += parseFloat(req_.final_price ?? req_.price);
    }

    // ── Pay radiology tests ──
    for (const item of radiologyItems) {
      const [[req_]] = await conn.execute(
        'SELECT vrr.*, rt.name, rt.price_with_film, rt.price_without_film FROM visit_radiology_requests vrr JOIN radiology_tests rt ON vrr.radiology_test_id = rt.id WHERE vrr.id=? AND vrr.visit_id=?', [item.id, visitId]
      );
      if (!req_ || req_.status !== 'pending_payment') continue;

      const basePrice = parseFloat(item.withFilm ? (req_.price_with_film || req_.price) : (req_.price_without_film || req_.price)) || 0;
      let newFinalPrice = basePrice;
      let newDiscountAmount = 0;

      if (Number(req_.is_free) === 1) {
        newFinalPrice = 0;
        newDiscountAmount = basePrice;
      } else if (parseFloat(req_.discount_percentage) > 0) {
        const pct = Math.min(100, Math.max(0, parseFloat(req_.discount_percentage)));
        newDiscountAmount = (basePrice * pct) / 100;
        newFinalPrice = Math.max(0, basePrice - newDiscountAmount);
      } else if (parseFloat(req_.discount_amount) > 0) {
        newDiscountAmount = Math.min(basePrice, parseFloat(req_.discount_amount));
        newFinalPrice = Math.max(0, basePrice - newDiscountAmount);
      }

      await conn.execute(
        `UPDATE visit_radiology_requests SET status='paid', with_film=?, price=?, discount_amount=?, final_price=? WHERE id=?`,
        [item.withFilm ? 1 : 0, basePrice, newDiscountAmount, newFinalPrice, item.id]
      );
      await recordTransaction(conn, {
        type: 'income', category: 'radiology',
        amount: newFinalPrice, visitId,
        description: `${req_.name}${item.withFilm ? '' : ' (بدون فيلم)'}`, userId,
        paymentMethod: selectedPaymentMethod
      });
      totalPaid += newFinalPrice;
    }

    // ── Pay clinical services ──
    for (const clinId of clinicalIds) {
      const [[req_]] = await conn.execute(
        'SELECT vcr.*, cs.name FROM visit_clinical_service_requests vcr JOIN clinical_services cs ON vcr.service_id = cs.id WHERE vcr.id=? AND vcr.visit_id=?', [clinId, visitId]
      );
      if (!req_ || req_.status !== 'pending_payment') continue;

      const amountToPay = parseFloat(req_.final_price ?? req_.price);
      await conn.execute(
        `UPDATE visit_clinical_service_requests SET status='paid' WHERE id=?`, [clinId]
      );
      await recordTransaction(conn, {
        type: 'income', category: 'clinical',
        amount: amountToPay, visitId,
        description: `خدمة سريرية: ${req_.name}`, userId,
        paymentMethod: selectedPaymentMethod
      });
      totalPaid += amountToPay;
    }

    // ── Apply discount ──
    if (discount.amount && parseFloat(discount.amount) > 0) {
      await conn.execute(
        `UPDATE visits SET discount_amount=discount_amount+?, discount_reason=? WHERE id=?`,
        [discount.amount, discount.reason || '', visitId]
      );
    }

    // ── Determine new visit status ──
    const [allLab] = await conn.execute(
      `SELECT status FROM visit_lab_requests WHERE visit_id=? AND status != 'cancelled'`, [visitId]
    );
    const [allRad] = await conn.execute(
      `SELECT status FROM visit_radiology_requests WHERE visit_id=? AND status != 'cancelled'`, [visitId]
    );
    const [allClin] = await conn.execute(
      `SELECT status FROM visit_clinical_service_requests WHERE visit_id=? AND status != 'cancelled'`, [visitId]
    );

    const allServices = [...allLab, ...allRad, ...allClin];
    const unpaidCount = allServices.filter(s => s.status === 'pending_payment').length;
    const paidLabCount = allLab.filter(s => s.status === 'paid').length;
    const paidRadCount = allRad.filter(s => s.status === 'paid').length;
    const paidClinCount = allClin.filter(s => s.status === 'paid').length;

    let newStatus = 'completed_admin_pending_services';
    if (unpaidCount === 0) {
      // All paid — determine destination
      if (paidLabCount > 0) {
        newStatus = 'awaiting_lab';
      } else if (paidRadCount > 0) {
        newStatus = 'awaiting_radiology';
      } else if (paidClinCount > 0 || allClin.length > 0) {
        newStatus = 'with_doctor'; // Destination is doctor to execute clinical services!
      } else {
        newStatus = 'with_doctor';
      }
    } else if (unpaidCount < allServices.length) {
      // Partial payment
      newStatus = 'completed_admin_pending_services';
      if (paidLabCount > 0) {
        await conn.execute(
          `UPDATE visits SET status='awaiting_lab' WHERE id=? AND status='awaiting_service_payment'`, [visitId]
        );
      } else if (paidRadCount > 0) {
        await conn.execute(
          `UPDATE visits SET status='awaiting_radiology' WHERE id=? AND status='awaiting_service_payment'`, [visitId]
        );
      } else if (paidClinCount > 0) {
        await conn.execute(
          `UPDATE visits SET status='with_doctor' WHERE id=? AND status='awaiting_service_payment'`, [visitId]
        );
      }
    }

    await conn.execute(`UPDATE visits SET status=? WHERE id=?`, [newStatus, visitId]);
    await conn.commit();

    // 🔔 Notify lab / radiology / doctor
    const io = req.app.get('io');
    if (io) {
      if (labIds.length > 0)        io.to('lab').emit('request:new', { visitId, message: 'طلب تحاليل جديد' });
      if (radiologyItems.length > 0) io.to('radiology').emit('request:new', { visitId, message: 'طلب أشعة جديدة' });
      if (clinicalIds.length > 0 || newStatus === 'with_doctor') {
        io.to('doctor').emit('patient:updated', { visitId, message: 'تم سداد الخدمة السريرية وتحويل المريض للطبيب' });
      } else {
        io.to('doctor').emit('patient:updated', { visitId });
      }
    }

    if (io) io.to('cashier').emit('cashier:update');
    res.json({ message: 'تم سداد المدفوعات بنجاح', totalPaid });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════════════
// GET /api/cashier/surgeries  — عمليات المركز الجراحي
// ═══════════════════════════════════════════════════════════════════
exports.getSurgeries = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT s.id AS surgery_id, s.surgery_type, s.full_price, s.status,
             s.scheduled_date, s.notes, s.discount_amount,
             p.id AS patient_id, p.full_name, p.age, p.gender, p.phone,
             v.id AS visit_id, v.visit_number, v.entity,
             COALESCE((SELECT SUM(sp.amount) FROM surgery_payments sp WHERE sp.surgery_id = s.id), 0) AS paid_amount,
             (s.full_price - s.discount_amount - COALESCE((SELECT SUM(sp.amount) FROM surgery_payments sp WHERE sp.surgery_id = s.id), 0)) AS remaining_amount
      FROM surgeries s
      JOIN visits v ON v.id = s.visit_id
      JOIN patients p ON p.id = s.patient_id
      WHERE s.status != 'cancelled'
        AND s.full_price > 0
        AND (s.full_price - s.discount_amount - COALESCE((SELECT SUM(sp.amount) FROM surgery_payments sp WHERE sp.surgery_id = s.id), 0)) > 0.01
      ORDER BY s.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// ═══════════════════════════════════════════════════════════════════
// GET /api/cashier/surgery/:id/payments  — سجل دفعات عملية
// ═══════════════════════════════════════════════════════════════════
exports.getSurgeryPayments = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.execute(
      `SELECT sp.*, u.full_name AS received_by_name
       FROM surgery_payments sp
       LEFT JOIN users u ON u.id = sp.received_by
       WHERE sp.surgery_id = ? ORDER BY sp.payment_date DESC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// ═══════════════════════════════════════════════════════════════════
// POST /api/cashier/surgery/:id/pay  — إضافة دفعة عملية
// ═══════════════════════════════════════════════════════════════════
exports.paySurgery = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id: surgeryId } = req.params;
    const { amount, payment_method, paymentMethod } = req.body;
    const selectedPaymentMethod = payment_method || paymentMethod || 'cash';
    const receiptNumber = 'REC-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000);

    if (!amount || isNaN(amount) || amount <= 0)
      return res.status(400).json({ message: 'المبلغ غير صحيح' });

    const [[surgery]] = await conn.execute(
      `SELECT s.*, 
       COALESCE((SELECT SUM(sp.amount) FROM surgery_payments sp WHERE sp.surgery_id = s.id), 0) AS paid_amount
       FROM surgeries s
       WHERE s.id = ?`, [surgeryId]
    );
    if (!surgery) return res.status(404).json({ message: 'العملية غير موجودة' });

    let equivalentAmount = parseFloat(amount);

    const remaining = parseFloat(surgery.full_price) - parseFloat(surgery.discount_amount) - parseFloat(surgery.paid_amount);
    
    // Allow slight float tolerance
    if (equivalentAmount > remaining + 1)
      return res.status(400).json({ message: `المبلغ يعادل (${equivalentAmount.toFixed(2)}) وهو يتجاوز المتبقي (${remaining.toFixed(2)} YER)` });

    // Record payment
    await conn.execute(
      `INSERT INTO surgery_payments (surgery_id, amount, received_by) VALUES (?,?,?)`,
      [surgeryId, amount, req.user.id]
    );

    await recordTransaction(conn, {
      type: 'income', category: 'surgery_payment',
      amount: amount, visitId: surgery.visit_id, surgeryId: surgeryId,
      description: surgery.surgery_type ? `دفعة عملية: ${surgery.surgery_type}` : `دفعة عملية جراحية (${amount} YER)`,
      userId: req.user.id,
      paymentMethod: selectedPaymentMethod
    });

    // Check if fully paid → update surgery status to 'ready'
    const newPaid = parseFloat(surgery.paid_amount) + equivalentAmount;
    const netPrice = parseFloat(surgery.full_price) - parseFloat(surgery.discount_amount);
    
    if (newPaid >= netPrice - 1) { // 1 unit tolerance
      await conn.execute(
        `UPDATE surgeries SET status='ready' WHERE id=?`, [surgeryId]
      );
      await conn.execute(
        `UPDATE visits SET status='awaiting_surgery' WHERE id=?`, [surgery.visit_id]
      );
    }

    await conn.commit();
    
    // Notify Surgery Coordinator
    const io = req.app.get('io');
    if (io) io.to('surgery_coordinator').emit('surgery:payment_received', { message: `تم استلام دفعة لعملية: ${surgery.surgery_type}` });

    if (io) io.to('cashier').emit('cashier:update');
    res.json({ message: 'تم سداد الدفعة بنجاح', newPaid, remaining: Math.max(0, netPrice - newPaid), receiptNumber });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════════════
// GET /api/cashier/stats/summary  — الأرقام السريعة
// ═══════════════════════════════════════════════════════════════════
exports.getStatsSummary = async (req, res) => {
  try {
    const [[income]] = await db.execute(
      `SELECT COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE type='income' AND is_refund=0`
    );
    const [[expense]] = await db.execute(
      `SELECT COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE type='expense' AND is_refund=0`
    );
    const [[refunds]] = await db.execute(
      `SELECT COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE is_refund=1`
    );
    
    // Today's metrics (Total + Cash & Bank Breakdown)
    const [[todayMetrics]] = await db.execute(`
      SELECT 
        COALESCE(SUM(CASE WHEN type='income' AND is_refund=0 THEN amount ELSE 0 END), 0) AS totalIncome,
        COALESCE(SUM(CASE WHEN type='income' AND is_refund=0 AND (payment_method IS NULL OR payment_method != 'bank_transfer') THEN amount ELSE 0 END), 0) AS cashIncome,
        COALESCE(SUM(CASE WHEN type='income' AND is_refund=0 AND payment_method = 'bank_transfer' THEN amount ELSE 0 END), 0) AS bankIncome,
        COALESCE(SUM(CASE WHEN type='expense' AND is_refund=0 THEN amount ELSE 0 END), 0) AS totalExpense,
        COALESCE(SUM(CASE WHEN type='expense' AND is_refund=0 AND (payment_method IS NULL OR payment_method != 'bank_transfer') THEN amount ELSE 0 END), 0) AS cashExpense,
        COALESCE(SUM(CASE WHEN type='expense' AND is_refund=0 AND payment_method = 'bank_transfer' THEN amount ELSE 0 END), 0) AS bankExpense,
        COALESCE(SUM(CASE WHEN is_refund=1 THEN amount ELSE 0 END), 0) AS totalRefunds,
        COALESCE(SUM(CASE WHEN is_refund=1 AND (payment_method IS NULL OR payment_method != 'bank_transfer') THEN amount ELSE 0 END), 0) AS cashRefunds,
        COALESCE(SUM(CASE WHEN is_refund=1 AND payment_method = 'bank_transfer' THEN amount ELSE 0 END), 0) AS bankRefunds
      FROM financial_transactions 
      WHERE ${SHIFT_IS_TODAY_SQL('created_at')}
    `);
    const [[todayVisits]] = await db.execute(
      `SELECT COUNT(*) AS total FROM visits WHERE ${SHIFT_IS_TODAY_SQL('created_at')} AND status != 'cancelled' AND (visit_number IS NULL OR visit_number NOT LIKE 'EXT-%')`
    );

    // Notification counts
    const [[pendingEntryFees]] = await db.execute(`
      SELECT COUNT(*) AS total FROM visits v
      WHERE (v.visit_number IS NULL OR v.visit_number NOT LIKE 'EXT-%')
        AND v.status NOT IN ('completed', 'cancelled')
        AND COALESCE(v.is_exempt, 0) = 0
        AND COALESCE(v.is_follow_up, 0) = 0
        AND (v.entry_fee IS NULL OR v.entry_fee = 0)
        AND NOT EXISTS (
          SELECT 1 FROM financial_transactions ft 
          WHERE ft.visit_id = v.id AND ft.category = 'entry_fee' AND ft.type = 'income' AND ft.is_refund = 0
        )
    `);
    const [[waitingServices]] = await db.execute(`
      SELECT COUNT(DISTINCT v.id) AS total FROM visits v
      WHERE v.status != 'cancelled'
        AND (
          EXISTS (SELECT 1 FROM visit_lab_requests WHERE visit_id = v.id AND status = 'pending_payment')
          OR EXISTS (SELECT 1 FROM visit_radiology_requests WHERE visit_id = v.id AND status = 'pending_payment')
          OR EXISTS (SELECT 1 FROM visit_clinical_service_requests WHERE visit_id = v.id AND status = 'pending_payment')
        )
    `);
    const [[pendingSurgeries]] = await db.execute(`
      SELECT COUNT(*) AS total FROM surgeries s
      WHERE s.status != 'cancelled'
        AND s.full_price > 0
        AND (s.full_price - s.discount_amount - COALESCE((SELECT SUM(sp.amount) FROM surgery_payments sp WHERE sp.surgery_id = s.id), 0)) > 0.01
    `);
    const [[activePatients]] = await db.execute(`
      SELECT COUNT(DISTINCT v.id) AS total FROM visits v
      JOIN patients p ON p.id = v.patient_id
      WHERE (v.visit_number IS NULL OR v.visit_number NOT LIKE 'EXT-%')
        AND (
          (${SHIFT_IS_TODAY_SQL('v.created_at')})
          OR (
            v.status != 'cancelled' AND (
              (
                COALESCE(v.is_exempt, 0) = 0 
                AND COALESCE(v.is_follow_up, 0) = 0 
                AND (v.entry_fee IS NULL OR v.entry_fee = 0)
                AND NOT EXISTS (
                  SELECT 1 FROM financial_transactions ft 
                  WHERE ft.visit_id = v.id AND ft.category = 'entry_fee' AND ft.type = 'income' AND ft.is_refund = 0
                )
              )
              OR EXISTS (SELECT 1 FROM visit_lab_requests WHERE visit_id = v.id AND status = 'pending_payment')
              OR EXISTS (SELECT 1 FROM visit_radiology_requests WHERE visit_id = v.id AND status = 'pending_payment')
              OR EXISTS (SELECT 1 FROM visit_clinical_service_requests WHERE visit_id = v.id AND status = 'pending_payment')
              OR EXISTS (
                SELECT 1 FROM surgeries s 
                WHERE s.visit_id = v.id 
                  AND s.status != 'cancelled' 
                  AND s.full_price > 0 
                  AND (s.full_price - s.discount_amount - COALESCE((SELECT SUM(amount) FROM surgery_payments WHERE surgery_id = s.id), 0)) > 0.01
              )
            )
          )
        )
    `);

    const tIncome = parseFloat(todayMetrics.totalIncome || 0);
    const cIncome = parseFloat(todayMetrics.cashIncome || 0);
    const bIncome = parseFloat(todayMetrics.bankIncome || 0);

    const tExpense = parseFloat(todayMetrics.totalExpense || 0);
    const cExpense = parseFloat(todayMetrics.cashExpense || 0);
    const bExpense = parseFloat(todayMetrics.bankExpense || 0);

    const tRefunds = parseFloat(todayMetrics.totalRefunds || 0);
    const cRefunds = parseFloat(todayMetrics.cashRefunds || 0);
    const bRefunds = parseFloat(todayMetrics.bankRefunds || 0);

    const tAvailable = tIncome - tExpense - tRefunds;
    const cAvailable = cIncome - cExpense - cRefunds;
    const bAvailable = bIncome - bExpense - bRefunds;

    res.json({
      totalBox: income.total,
      availableCash: parseFloat(income.total) - parseFloat(expense.total) - parseFloat(refunds.total),
      todayIncome: tIncome,
      todayExpenses: tExpense,
      todayRefunds: tRefunds,
      todayAvailable: tAvailable,
      todayIncomeCash: cIncome,
      todayIncomeBank: bIncome,
      todayExpensesCash: cExpense,
      todayExpensesBank: bExpense,
      todayRefundsCash: cRefunds,
      todayRefundsBank: bRefunds,
      todayAvailableCash: cAvailable,
      todayAvailableBank: bAvailable,
      todayVisits: todayVisits.total,
      pendingEntryFeesCount: pendingEntryFees.total,
      waitingServicesCount: waitingServices.total,
      pendingSurgeriesCount: pendingSurgeries.total,
      activePatientsCount: activePatients.total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// ═══════════════════════════════════════════════════════════════════
// GET /api/cashier/stats/transactions?period=today|week|month|year|custom&from=&to=
// ═══════════════════════════════════════════════════════════════════
exports.getTransactions = async (req, res) => {
  try {
    const { period = 'today', from, to } = req.query;
    let sinceClause, untilClause = 'NOW()';
    const params = [];

    if (period === 'custom' && from) {
      const range = getShiftRange(from, to || from);
      sinceClause = '?';
      params.push(range.startStr);
      if (to) {
        untilClause = 'DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND';
        params.push(range.endStr);
      }
    } else {
      const shiftStart = SHIFT_START_SQL;
      const intervals = {
        today: shiftStart,
        week:  `DATE_SUB(${shiftStart}, INTERVAL 7 DAY)`,
        month: `DATE_SUB(${shiftStart}, INTERVAL 30 DAY)`,
        year:  `DATE_SUB(${shiftStart}, INTERVAL 365 DAY)`,
        all:   "'1970-01-01'"
      };
      sinceClause = intervals[period] || intervals.today;
    }

    const [rows] = await db.execute(`
      SELECT ft.*, u.full_name AS cashier_name, u.role AS cashier_role,
             v.visit_number AS visit_number,
             v.status AS visit_status,
             COALESCE(p1.full_name, p2.full_name, p3.full_name) AS patient_name, 
             COALESCE(p1.id, p2.id, p3.id) AS patient_id,
             COALESCE(s.surgery_type, s2.surgery_type) AS surgery_name,
             COALESCE(s.status, s2.status) AS surgery_status,
             COALESCE(
               NULLIF(TRIM(ft.description), ''),
               s.surgery_type,
               s2.surgery_type,
               CASE 
                 WHEN ft.category IN ('lab', 'external_lab') THEN 
                   (SELECT lt.name FROM visit_lab_requests vlr JOIN lab_tests lt ON lt.id = vlr.lab_test_id WHERE vlr.visit_id = COALESCE(v.id, s.visit_id, s2.visit_id) LIMIT 1)
                 WHEN ft.category IN ('radiology', 'external_radiology') THEN 
                   (SELECT CONCAT(rt.name, IF(vrr.with_film = 1, '', ' (بدون فيلم)')) FROM visit_radiology_requests vrr JOIN radiology_tests rt ON rt.id = vrr.radiology_test_id WHERE vrr.visit_id = COALESCE(v.id, s.visit_id, s2.visit_id) LIMIT 1)
                 WHEN ft.category = 'clinical' THEN 
                   (SELECT cs.name FROM visit_clinical_service_requests vcr JOIN clinical_services cs ON cs.id = vcr.service_id WHERE vcr.visit_id = COALESCE(v.id, s.visit_id, s2.visit_id) LIMIT 1)
                 WHEN ft.category = 'entry_fee' THEN 'رسوم معاينة'
                 ELSE NULL
               END
             ) AS service_name
      FROM financial_transactions ft
      LEFT JOIN users u ON u.id = ft.performed_by
      LEFT JOIN visits v ON v.id = ft.visit_id
      LEFT JOIN patients p1 ON p1.id = v.patient_id
      LEFT JOIN surgeries s ON s.id = ft.surgery_id
      LEFT JOIN surgeries s2 ON s2.visit_id = v.id
      LEFT JOIN patients p2 ON p2.id = s.patient_id
      LEFT JOIN patients p3 ON p3.id = ft.patient_id
      WHERE ft.created_at >= ${sinceClause} AND ft.created_at <= ${untilClause} AND ft.amount > 0
      ORDER BY ft.created_at DESC LIMIT 1000
    `, params);

    const [chartData] = await db.execute(`
      SELECT ${SHIFT_GROUP_BY_SQL} AS day,
        SUM(CASE WHEN type='income' AND is_refund=0 THEN amount ELSE 0 END) AS income,
        SUM(CASE WHEN type='expense' OR is_refund=1 THEN amount ELSE 0 END) AS expense
      FROM financial_transactions
      WHERE created_at >= ${sinceClause} AND created_at <= ${untilClause}
      GROUP BY ${SHIFT_GROUP_BY_SQL} ORDER BY day ASC
    `, params);

    const [breakdown] = await db.execute(`
      SELECT category, SUM(amount) AS total, COUNT(*) AS count
      FROM financial_transactions
      WHERE type='income' AND is_refund=0 AND created_at >= ${sinceClause} AND created_at <= ${untilClause}
      GROUP BY category
    `, params);

    const [
      [[deptIncomeRow]],
      [[labCountRow]],
      [[radCountRow]],
      [[clinCountRow]],
      [[surgeryCountRow]]
    ] = await Promise.all([
      db.execute(`
        SELECT 
          COALESCE(SUM(
            CASE 
              WHEN (ft.category = 'entry_fee' OR (ft.category = 'refund' AND (ft.description LIKE '%معاينة%' OR ft.description LIKE '%كشف%')))
                   AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount 
              WHEN (ft.category = 'entry_fee' OR (ft.category = 'refund' AND (ft.description LIKE '%معاينة%' OR ft.description LIKE '%كشف%')))
                   AND (ft.type = 'expense' OR ft.is_refund = 1) THEN -ft.amount 
              ELSE 0 
            END
          ), 0) AS consultationIncome,
          COUNT(DISTINCT CASE 
            WHEN ft.category = 'entry_fee' AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) 
                 AND NOT EXISTS (
                   SELECT 1 FROM financial_transactions ft_ref 
                   WHERE ft_ref.visit_id = ft.visit_id 
                     AND (ft_ref.category = 'entry_fee' OR ft_ref.category = 'refund')
                     AND (ft_ref.is_refund = 1 OR ft_ref.type = 'expense')
                 )
            THEN ft.id 
            ELSE NULL 
          END) AS consultationCount,
          COALESCE(SUM(
            CASE 
              WHEN (ft.category IN ('lab', 'external_lab') OR (ft.category = 'refund' AND (ft.description LIKE '%تحليل%' OR ft.description LIKE '%مخبر%' OR ft.description LIKE '%FBS%')))
                   AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount 
              WHEN (ft.category IN ('lab', 'external_lab') OR (ft.category = 'refund' AND (ft.description LIKE '%تحليل%' OR ft.description LIKE '%مخبر%' OR ft.description LIKE '%FBS%')))
                   AND (ft.type = 'expense' OR ft.is_refund = 1) THEN -ft.amount 
              ELSE 0 
            END
          ), 0) AS labIncome,
          COALESCE(SUM(
            CASE 
              WHEN (ft.category IN ('radiology', 'external_radiology') OR (ft.category = 'refund' AND (ft.description LIKE '%أشعة%' OR ft.description LIKE '%اشعة%')))
                   AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount 
              WHEN (ft.category IN ('radiology', 'external_radiology') OR (ft.category = 'refund' AND (ft.description LIKE '%أشعة%' OR ft.description LIKE '%اشعة%')))
                   AND (ft.type = 'expense' OR ft.is_refund = 1) THEN -ft.amount 
              ELSE 0 
            END
          ), 0) AS radIncome,
          COALESCE(SUM(
            CASE 
              WHEN (ft.category IN ('clinical', 'external_service') OR (ft.category = 'refund' AND ft.description LIKE '%سريري%'))
                   AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount 
              WHEN (ft.category IN ('clinical', 'external_service') OR (ft.category = 'refund' AND ft.description LIKE '%سريري%'))
                   AND (ft.type = 'expense' OR ft.is_refund = 1) THEN -ft.amount 
              ELSE 0 
            END
          ), 0) AS clinIncome,
          COALESCE(SUM(
            CASE 
              WHEN ft.category IN ('surgery_payment', 'surgery') AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount 
              WHEN ft.category IN ('surgery_payment', 'surgery') AND (ft.type = 'expense' OR ft.is_refund = 1) THEN -ft.amount 
              ELSE 0 
            END
          ), 0) AS surgeryIncome,
          COALESCE(SUM(
            CASE 
              WHEN ft.category IN ('general_income', 'treasury_deposit')
                   AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount 
              WHEN ft.category IN ('general_income', 'treasury_deposit')
                   AND (ft.type = 'expense' OR ft.is_refund = 1) THEN -ft.amount 
              ELSE 0 
            END
          ), 0) AS generalIncome,
          COUNT(DISTINCT CASE 
            WHEN ft.category IN ('general_income', 'treasury_deposit')
                 AND ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.id 
            ELSE NULL 
          END) AS generalCount
        FROM financial_transactions ft
        LEFT JOIN visits v ON ft.visit_id = v.id
        LEFT JOIN surgeries s ON ft.surgery_id = s.id
        WHERE ft.created_at >= ${sinceClause} AND ft.created_at <= ${untilClause}
          AND (v.status IS NULL OR v.status NOT IN ('cancelled', 'refunded'))
          AND (s.status IS NULL OR s.status != 'cancelled')
      `, params),

      db.execute(`
        SELECT COUNT(*) AS count
        FROM visit_lab_requests lr
        JOIN visits v ON lr.visit_id = v.id
        WHERE lr.status IN ('paid', 'in_progress', 'result_uploaded', 'completed')
          AND lr.is_free = 0
          AND v.is_exempt = 0
          AND v.status NOT IN ('cancelled', 'refunded')
          AND EXISTS (
            SELECT 1 FROM financial_transactions ft 
            WHERE ft.visit_id = lr.visit_id 
              AND ft.category IN ('lab', 'external_lab') 
              AND ft.type = 'income' 
              AND ft.is_refund = 0 
              AND ft.created_at >= ${sinceClause} AND ft.created_at <= ${untilClause}
          )
      `, params),

      db.execute(`
        SELECT COUNT(*) AS count
        FROM visit_radiology_requests rr
        JOIN visits v ON rr.visit_id = v.id
        WHERE rr.status IN ('paid', 'in_progress', 'result_uploaded', 'completed')
          AND rr.is_free = 0
          AND v.is_exempt = 0
          AND v.status NOT IN ('cancelled', 'refunded')
          AND EXISTS (
            SELECT 1 FROM financial_transactions ft 
            WHERE ft.visit_id = rr.visit_id 
              AND ft.category IN ('radiology', 'external_radiology') 
              AND ft.type = 'income' 
              AND ft.is_refund = 0 
              AND ft.created_at >= ${sinceClause} AND ft.created_at <= ${untilClause}
          )
      `, params),

      db.execute(`
        SELECT COUNT(*) AS count
        FROM visit_clinical_service_requests cr
        JOIN visits v ON cr.visit_id = v.id
        WHERE cr.status IN ('paid', 'completed')
          AND cr.is_free = 0
          AND v.is_exempt = 0
          AND v.status NOT IN ('cancelled', 'refunded')
          AND EXISTS (
            SELECT 1 FROM financial_transactions ft 
            WHERE ft.visit_id = cr.visit_id 
              AND ft.category IN ('clinical', 'external_service') 
              AND ft.type = 'income' 
              AND ft.is_refund = 0 
              AND ft.created_at >= ${sinceClause} AND ft.created_at <= ${untilClause}
          )
      `, params),

      db.execute(`
        SELECT COUNT(*) AS count
        FROM surgery_payments sp
        JOIN surgeries s ON sp.surgery_id = s.id
        WHERE s.status != 'cancelled'
          AND sp.payment_date >= ${sinceClause} AND sp.payment_date <= ${untilClause}
      `, params)
    ]);

    const finalDeptIncome = {
      ...deptIncomeRow,
      labCount: parseInt(labCountRow?.count || 0, 10),
      radCount: parseInt(radCountRow?.count || 0, 10),
      clinCount: parseInt(clinCountRow?.count || 0, 10),
      surgeryCount: parseInt(surgeryCountRow?.count || 0, 10)
    };

    res.json({ transactions: rows, chartData, breakdown, deptIncome: finalDeptIncome });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// ═══════════════════════════════════════════════════════════════════
// PUT /api/cashier/visit/:id/postpone  — تأجيل الخدمات (رفض المريض الدفع)
// ═══════════════════════════════════════════════════════════════════
exports.postponeServices = async (req, res) => {
  try {
    const { id: visitId } = req.params;
    await db.execute(
      `UPDATE visits SET status='completed_admin_pending_services' WHERE id=?`, [visitId]
    );
    const io = req.app.get('io');
    if (io) io.to('cashier').emit('cashier:update');
    res.json({ message: 'تم تأجيل الخدمات — الزيارة محفوظة' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// ═══════════════════════════════════════════════════════════════════
// PUT /api/cashier/visit/:id/refund-all  — استرداد كامل المدفوعات + إلغاء
// ═══════════════════════════════════════════════════════════════════
// ==================================================================================================
// PUT /api/cashier/service/:type/:id/cancel - Cancels a single unpaid pending service
// ==================================================================================================
exports.cancelSingleService = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { type, id } = req.params;
    let table = '';
    let socketEvent = '';

    let nameJoin = '';
    let nameCol = '';

    if (type === 'lab') {
      table = 'visit_lab_requests';
      socketEvent = 'lab:update';
      nameJoin = 'JOIN lab_tests lt ON lt.id = req.lab_test_id';
      nameCol = 'lt.name AS service_name';
    } else if (type === 'radiology') {
      table = 'visit_radiology_requests';
      socketEvent = 'radiology:updated';
      nameJoin = 'JOIN radiology_tests rt ON rt.id = req.radiology_test_id';
      nameCol = 'rt.name AS service_name';
    } else if (type === 'clinical') {
      table = 'visit_clinical_service_requests';
      socketEvent = 'doctor:update';
      nameJoin = 'JOIN clinical_services cs ON cs.id = req.service_id';
      nameCol = 'cs.name AS service_name';
    } else {
      throw new Error('Invalid service type');
    }

    // 1. Get the visit_id and details before update
    const [[service]] = await conn.execute(`
      SELECT req.visit_id, ${nameCol}, p.full_name AS patient_name
      FROM ${table} req
      JOIN visits v ON v.id = req.visit_id
      JOIN patients p ON p.id = v.patient_id
      ${nameJoin}
      WHERE req.id=? AND req.status='pending_payment'
    `, [id]);

    if (!service) {
      throw new Error('Service not found or already processed');
    }
    const visitId = service.visit_id;
    const serviceName = service.service_name || 'خدمة';
    const patientName = service.patient_name || 'مريض';
    const reason = req.body?.reason || 'إلغاء بواسطة المحاسب';

    // 2. Cancel the specific service
    const [updateRes] = await conn.execute(`UPDATE ${table} SET status='cancelled' WHERE id=? AND status='pending_payment'`, [id]);
    if (updateRes.affectedRows === 0) {
      throw new Error('Service could not be cancelled');
    }

    // 3. Check for any remaining pending services for this visit
    const [[pendingLab]] = await conn.execute(`SELECT COUNT(*) as count FROM visit_lab_requests WHERE visit_id=? AND status='pending_payment'`, [visitId]);
    const [[pendingRad]] = await conn.execute(`SELECT COUNT(*) as count FROM visit_radiology_requests WHERE visit_id=? AND status='pending_payment'`, [visitId]);
    const [[pendingClin]] = await conn.execute(`SELECT COUNT(*) as count FROM visit_clinical_service_requests WHERE visit_id=? AND status='pending_payment'`, [visitId]);
    
    if (pendingLab.count === 0 && pendingRad.count === 0 && pendingClin.count === 0) {
      // 4. Update visit status to 'with_doctor' if no active services remain
      const [[activeLab]] = await conn.execute(`SELECT COUNT(*) as count FROM visit_lab_requests WHERE visit_id=? AND status NOT IN ('cancelled', 'refunded')`, [visitId]);
      const [[activeRad]] = await conn.execute(`SELECT COUNT(*) as count FROM visit_radiology_requests WHERE visit_id=? AND status NOT IN ('cancelled', 'refunded')`, [visitId]);
      const [[activeClin]] = await conn.execute(`SELECT COUNT(*) as count FROM visit_clinical_service_requests WHERE visit_id=? AND status NOT IN ('cancelled', 'refunded')`, [visitId]);

      if (activeLab.count === 0 && activeRad.count === 0 && activeClin.count === 0) {
        await conn.execute(`
          UPDATE visits 
          SET status='with_doctor' 
          WHERE id=? AND status IN ('awaiting_service_payment', 'completed_admin_pending_services')
        `, [visitId]);
      }
    }

    await conn.commit();

    // 5. Emit socket events
    const io = req.app.get('io');
    if (io) {
      const cancelPayload = {
        visitId,
        patientName,
        serviceType: type,
        serviceName,
        reason
      };
      io.to('doctor').emit('service:cancelled_by_cashier', cancelPayload);
      io.to('cashier').emit('cashier:update');
      io.to('doctor').emit('patient:updated', { visitId });
      if (type === 'lab') io.to('lab').emit(socketEvent);
      if (type === 'radiology') io.to('radiology').emit(socketEvent);
    }

    res.json({ message: 'تم إلغاء الخدمة بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(400).json({ message: err.message || 'حدث خطأ أثناء الإلغاء' });
  } finally {
    conn.release();
  }
};

// ==================================================================================================
// DELETE /api/cashier/service/:type/:id - Hard deletes a suspended service
// ==================================================================================================
exports.deleteSuspendedService = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { type, id } = req.params;
    if (type === 'lab') {
      const [[reqRow]] = await conn.execute(`SELECT status FROM visit_lab_requests WHERE id=?`, [id]);
      if (!reqRow) throw new Error('Service not found');
      if (reqRow.status !== 'cancelled') throw new Error('Service is not suspended');
      await conn.execute(`DELETE FROM visit_lab_requests WHERE id=?`, [id]);
    } else if (type === 'radiology') {
      const [[reqRow]] = await conn.execute(`SELECT status FROM visit_radiology_requests WHERE id=?`, [id]);
      if (!reqRow) throw new Error('Service not found');
      if (reqRow.status !== 'cancelled') throw new Error('Service is not suspended');
      await conn.execute(`DELETE FROM visit_radiology_requests WHERE id=?`, [id]);
    } else if (type === 'clinical') {
      const [[reqRow]] = await conn.execute(`SELECT status FROM visit_clinical_service_requests WHERE id=?`, [id]);
      if (!reqRow) throw new Error('Service not found');
      if (reqRow.status !== 'cancelled') throw new Error('Service is not suspended');
      await conn.execute(`DELETE FROM visit_clinical_service_requests WHERE id=?`, [id]);
    } else {
      throw new Error('Invalid type');
    }

    const io = req.app.get('io');
    if (io) {
      io.to('cashier').emit('cashier:update');
    }
    res.json({ message: 'تم حذف الخدمة المعلقة نهائياً بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

exports.refundVisit = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id: visitId } = req.params;
    const { reason = 'إلغاء وإسترداد كامل' } = req.body;

    const [[paidRow]] = await conn.execute(
      "SELECT COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE visit_id=? AND type='income' AND is_refund=0", [visitId]
    );
    const refundAmt = parseFloat(paidRow.total);

    await conn.execute("UPDATE visits SET status='cancelled' WHERE id=?", [visitId]);

    if (refundAmt > 0) {
      await conn.execute(
        "INSERT INTO financial_transactions (type,category,amount,is_refund,refund_reason,visit_id,description,performed_by) VALUES ('expense','refund',?,1,?,?,?,?)",
        [refundAmt, reason, visitId, 'استرداد كامل: ' + reason, req.user.id]
      );
    }

    await conn.commit();
    const io = req.app.get('io');
    if (io) {
      const [visitData] = await conn.execute("SELECT v.visit_number, p.full_name, p.id AS patient_id FROM visits v JOIN patients p ON v.patient_id = p.id WHERE v.id = ?", [visitId]);
      const cancelledVisit = visitData[0] || {};
      
      const cancelPayload = {
        visitId,
        patientId: cancelledVisit.patient_id,
        visitNumber: cancelledVisit.visit_number || '',
        patientName: cancelledVisit.full_name || 'مريض',
        isConsultationRefund: true,
        message: `تم إلغاء الزيارة واسترداد رسوم المعاينة للمريض: (${cancelledVisit.full_name || 'مريض'}) من قبل المحاسب`
      };
      io.to('cashier').emit('cashier:update');
      io.to('secretary').emit('visit:cancelled', cancelPayload);
      io.to('doctor').emit('visit:cancelled', cancelPayload);
      io.to('doctor').emit('patient:cancelled', { visitId, patientId: cancelledVisit.patient_id });
      io.to('secretary').emit('patient:updated', { patientId: cancelledVisit.patient_id });
      io.to('doctor').emit('patient:updated', { patientId: cancelledVisit.patient_id, visitId });
    }
    res.json({ message: 'تم إلغاء الزيارة واسترداد ' + refundAmt + ' ريال يمني' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════════════
// PUT /api/cashier/service-lab/:id/refund  — استرداد خدمة تحليل واحدة
// ═══════════════════════════════════════════════════════════════════
exports.refundLabService = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { reason = 'استرداد جزئي' } = req.body;

    const [[row]] = await conn.execute(
      `SELECT vlr.*, v.id AS visit_id, v.visit_number, lt.name AS test_name, p.full_name AS patient_name 
       FROM visit_lab_requests vlr
       JOIN visits v ON v.id = vlr.visit_id 
       JOIN patients p ON p.id = v.patient_id
       JOIN lab_tests lt ON lt.id = vlr.lab_test_id
       WHERE vlr.id=?`, [id]
    );
    if (!row || row.status !== 'paid')
      return res.status(400).json({ message: 'لا يمكن استرداد هذا البند' });

    const isExternal = Boolean(row.visit_number?.startsWith('EXT-'));

    const refundAmount = (row.final_price !== null && row.final_price !== undefined)
      ? parseFloat(row.final_price)
      : (Number(row.is_free) === 1 ? 0 : parseFloat(row.price));

    if (Number(row.is_free) === 1 || refundAmount <= 0)
      return res.status(400).json({ message: 'لا يمكن استرداد خدمة مجانية لم يتم تحصيل رسومها' });

    await conn.execute(`UPDATE visit_lab_requests SET status='refunded' WHERE id=?`, [id]);
    await conn.execute(
      `INSERT INTO financial_transactions (type,category,amount,is_refund,refund_reason,visit_id,description,performed_by)
       VALUES ('expense','lab',?,1,?,?,?,?)`,
      [refundAmount, reason, row.visit_id, row.test_name || 'تحليل مخبري', req.user.id]
    );

    // ── Check if any active services remain for this visit ──
    const [[activeLab]] = await conn.execute(
      `SELECT COUNT(*) as count FROM visit_lab_requests WHERE visit_id=? AND status NOT IN ('cancelled', 'refunded')`, [row.visit_id]
    );
    const [[activeRad]] = await conn.execute(
      `SELECT COUNT(*) as count FROM visit_radiology_requests WHERE visit_id=? AND status NOT IN ('cancelled', 'refunded')`, [row.visit_id]
    );
    const [[activeClin]] = await conn.execute(
      `SELECT COUNT(*) as count FROM visit_clinical_service_requests WHERE visit_id=? AND status NOT IN ('cancelled', 'refunded')`, [row.visit_id]
    );

    if (activeLab.count === 0 && activeRad.count === 0 && activeClin.count === 0) {
      if (isExternal) {
        await conn.execute(
          `UPDATE visits SET status='completed', closed_at=NOW() WHERE id=?`,
          [row.visit_id]
        );
      } else {
        await conn.execute(
          `UPDATE visits SET status='with_doctor' WHERE id=? AND status NOT IN ('completed', 'cancelled')`,
          [row.visit_id]
        );
      }
    }

    await conn.commit();
    const io = req.app.get('io');
    if (io) {
      const refundPayload = {
        visitId: row.visit_id,
        patientName: row.patient_name || 'مريض',
        serviceType: 'lab',
        serviceName: row.test_name || 'تحليل مخبري',
        reason
      };
      if (!isExternal) {
        io.to('doctor').emit('service:refunded', refundPayload);
      }
      io.to('lab').emit('service:refunded', refundPayload);
      io.to('cashier').emit('cashier:update');
      io.to('lab').emit('lab:update', { visitId: row.visit_id });
      if (!isExternal) {
        io.to('doctor').emit('patient:updated', { visitId: row.visit_id });
      }
    }
    res.json({ message: `تم استرداد ${refundAmount} ريال يمني` });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════════════
// PUT /api/cashier/service-clinical/:id/refund — استرداد خدمة سريرية واحدة
// ═══════════════════════════════════════════════════════════════════
exports.refundClinicalService = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { reason = 'استرداد جزئي' } = req.body;

    const [[row]] = await conn.execute(
      `SELECT vcr.*, v.id AS visit_id, cs.name AS service_name, p.full_name AS patient_name 
       FROM visit_clinical_service_requests vcr
       JOIN visits v ON v.id = vcr.visit_id 
       JOIN patients p ON p.id = v.patient_id
       JOIN clinical_services cs ON cs.id = vcr.service_id
       WHERE vcr.id=?`, [id]
    );
    if (!row || row.status !== 'paid')
      return res.status(400).json({ message: 'لا يمكن استرداد هذا البند (غير مسدد أو مسترد مسبقاً)' });

    const refundAmount = (row.final_price !== null && row.final_price !== undefined)
      ? parseFloat(row.final_price)
      : (Number(row.is_free) === 1 ? 0 : parseFloat(row.price));

    if (Number(row.is_free) === 1 || refundAmount <= 0)
      return res.status(400).json({ message: 'لا يمكن استرداد خدمة مجانية لم يتم تحصيل رسومها' });

    await conn.execute(`UPDATE visit_clinical_service_requests SET status='refunded' WHERE id=?`, [id]);
    await conn.execute(
      `INSERT INTO financial_transactions (type,category,amount,is_refund,refund_reason,visit_id,description,performed_by)
       VALUES ('expense','clinical',?,1,?,?,?,?)`,
      [refundAmount, reason, row.visit_id, row.service_name || 'خدمة سريرية', req.user.id]
    );

    // ── Check if any active services remain for this visit ──
    const [[activeLab]] = await conn.execute(
      `SELECT COUNT(*) as count FROM visit_lab_requests WHERE visit_id=? AND status NOT IN ('cancelled', 'refunded')`, [row.visit_id]
    );
    const [[activeRad]] = await conn.execute(
      `SELECT COUNT(*) as count FROM visit_radiology_requests WHERE visit_id=? AND status NOT IN ('cancelled', 'refunded')`, [row.visit_id]
    );
    const [[activeClin]] = await conn.execute(
      `SELECT COUNT(*) as count FROM visit_clinical_service_requests WHERE visit_id=? AND status NOT IN ('cancelled', 'refunded')`, [row.visit_id]
    );

    if (activeLab.count === 0 && activeRad.count === 0 && activeClin.count === 0) {
      await conn.execute(
        `UPDATE visits SET status='with_doctor' WHERE id=? AND status NOT IN ('completed', 'cancelled')`,
        [row.visit_id]
      );
    }

    await conn.commit();
    const io = req.app.get('io');
    if (io) {
      const refundPayload = {
        visitId: row.visit_id,
        patientName: row.patient_name || 'مريض',
        serviceType: 'clinical',
        serviceName: row.service_name || 'خدمة سريرية',
        reason
      };
      io.to('doctor').emit('service:refunded', refundPayload);
      io.to('cashier').emit('cashier:update');
      io.to('doctor').emit('patient:updated', { visitId: row.visit_id });
    }
    res.json({ message: `تم استرداد ${refundAmount} ريال يمني بنجاح` });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════════════
// PUT /api/cashier/service-radiology/:id/refund — استرداد خدمة أشعة واحدة
// ═══════════════════════════════════════════════════════════════════
exports.refundRadiologyService = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { reason = 'استرداد جزئي' } = req.body;

    const [[row]] = await conn.execute(
      `SELECT vrr.*, v.id AS visit_id, v.visit_number, rt.name AS test_name, p.full_name AS patient_name 
       FROM visit_radiology_requests vrr
       JOIN visits v ON v.id = vrr.visit_id 
       JOIN patients p ON p.id = v.patient_id
       JOIN radiology_tests rt ON rt.id = vrr.radiology_test_id
       WHERE vrr.id=?`, [id]
    );
    if (!row || row.status !== 'paid')
      return res.status(400).json({ message: 'لا يمكن استرداد هذا البند' });

    const isExternal = Boolean(row.visit_number?.startsWith('EXT-'));

    const refundAmount = (row.final_price !== null && row.final_price !== undefined)
      ? parseFloat(row.final_price)
      : (Number(row.is_free) === 1 ? 0 : parseFloat(row.price));

    if (Number(row.is_free) === 1 || refundAmount <= 0)
      return res.status(400).json({ message: 'لا يمكن استرداد خدمة مجانية لم يتم تحصيل رسومها' });

    await conn.execute(`UPDATE visit_radiology_requests SET status='refunded' WHERE id=?`, [id]);
    await conn.execute(
      `INSERT INTO financial_transactions (type,category,amount,is_refund,refund_reason,visit_id,description,performed_by)
       VALUES ('expense','radiology',?,1,?,?,?,?)`,
      [refundAmount, reason, row.visit_id, `${row.test_name || 'فحص أشعة'}${row.with_film ? '' : ' (بدون فيلم)'}`, req.user.id]
    );

    // ── Check if any active services remain for this visit ──
    const [[activeLab]] = await conn.execute(
      `SELECT COUNT(*) as count FROM visit_lab_requests WHERE visit_id=? AND status NOT IN ('cancelled', 'refunded')`, [row.visit_id]
    );
    const [[activeRad]] = await conn.execute(
      `SELECT COUNT(*) as count FROM visit_radiology_requests WHERE visit_id=? AND status NOT IN ('cancelled', 'refunded')`, [row.visit_id]
    );
    const [[activeClin]] = await conn.execute(
      `SELECT COUNT(*) as count FROM visit_clinical_service_requests WHERE visit_id=? AND status NOT IN ('cancelled', 'refunded')`, [row.visit_id]
    );

    if (activeLab.count === 0 && activeRad.count === 0 && activeClin.count === 0) {
      if (isExternal) {
        await conn.execute(
          `UPDATE visits SET status='completed', closed_at=NOW() WHERE id=?`,
          [row.visit_id]
        );
      } else {
        await conn.execute(
          `UPDATE visits SET status='with_doctor' WHERE id=? AND status NOT IN ('completed', 'cancelled')`,
          [row.visit_id]
        );
      }
    }

    await conn.commit();
    const io = req.app.get('io');
    if (io) {
      const refundPayload = {
        visitId: row.visit_id,
        patientName: row.patient_name || 'مريض',
        serviceType: 'radiology',
        serviceName: `${row.test_name || 'فحص أشعة'}${row.with_film ? '' : ' (بدون فيلم)'}`,
        reason
      };
      if (!isExternal) {
        io.to('doctor').emit('service:refunded', refundPayload);
      }
      io.to('radiology').emit('service:refunded', refundPayload);
      io.to('cashier').emit('cashier:update');
      io.to('radiology').emit('radiology:updated', { visitId: row.visit_id });
      if (!isExternal) {
        io.to('doctor').emit('patient:updated', { visitId: row.visit_id });
      }
    }
    res.json({ message: `تم استرداد ${refundAmount} ريال يمني` });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════════════
// GENERAL TRANSACTIONS  GET/POST /api/cashier/general-transactions
// ═══════════════════════════════════════════════════════════════════
const GENERAL_INCOME_CATS  = ['external_service','external_lab','external_radiology','treasury_deposit','external_surgery','general_income'];
const GENERAL_EXPENSE_CATS = ['emergency_expense','emergency_purchase','general_expense'];

exports.getGeneralTransactions = async (req, res) => {
  try {
    const { period = 'all', from, to } = req.query;
    let sinceClause, untilClause = 'NOW()';
    const params = [];
    if (period === 'custom' && from) {
      const range = getShiftRange(from, to || from);
      sinceClause = '?';
      params.push(range.startStr);
      if (to) {
        untilClause = 'DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND';
        params.push(range.endStr);
      }
    } else {
      const shiftStart = SHIFT_START_SQL;
      const m = {
        today: shiftStart,
        week:  `DATE_SUB(${shiftStart}, INTERVAL 7 DAY)`,
        month: `DATE_SUB(${shiftStart}, INTERVAL 30 DAY)`,
        year:  `DATE_SUB(${shiftStart}, INTERVAL 365 DAY)`,
        all:   "'1970-01-01'"
      };
      sinceClause = m[period] || m.all;
    }
    const allCats = [...GENERAL_INCOME_CATS, ...GENERAL_EXPENSE_CATS, 'refund'].map(c => `'${c}'`).join(',');
    const [rows] = await db.execute(`
      SELECT ft.*,
             COALESCE(ft.patient_id, v.patient_id, s.patient_id) AS patient_id,
             v.visit_number AS visit_number,
             u.full_name AS cashier_name,
             u.role AS cashier_role,
             COALESCE(p1.full_name, p2.full_name, p3.full_name) AS patient_name,
             COALESCE(s.surgery_type, s2.surgery_type) AS surgery_name,
             COALESCE(
               NULLIF(TRIM(ft.description), ''),
               s.surgery_type,
               s2.surgery_type,
               CASE 
                 WHEN ft.category IN ('lab', 'external_lab') THEN 
                   (SELECT lt.name FROM visit_lab_requests vlr JOIN lab_tests lt ON lt.id = vlr.lab_test_id WHERE vlr.visit_id = COALESCE(v.id, s.visit_id, s2.visit_id) LIMIT 1)
                 WHEN ft.category IN ('radiology', 'external_radiology') THEN 
                   (SELECT CONCAT(rt.name, IF(vrr.with_film = 1, '', ' (بدون فيلم)')) FROM visit_radiology_requests vrr JOIN radiology_tests rt ON rt.id = vrr.radiology_test_id WHERE vrr.visit_id = COALESCE(v.id, s.visit_id, s2.visit_id) LIMIT 1)
                 WHEN ft.category = 'clinical' THEN 
                   (SELECT cs.name FROM visit_clinical_service_requests vcr JOIN clinical_services cs ON cs.id = vcr.service_id WHERE vcr.visit_id = COALESCE(v.id, s.visit_id, s2.visit_id) LIMIT 1)
                 WHEN ft.category = 'entry_fee' THEN 'رسوم معاينة'
                 ELSE NULL
               END
             ) AS service_name
      FROM financial_transactions ft
      LEFT JOIN users u ON u.id = ft.performed_by
      LEFT JOIN visits v ON v.id = ft.visit_id
      LEFT JOIN patients p1 ON p1.id = v.patient_id
      LEFT JOIN surgeries s ON s.id = ft.surgery_id
      LEFT JOIN surgeries s2 ON s2.visit_id = v.id
      LEFT JOIN patients p2 ON p2.id = s.patient_id
      LEFT JOIN patients p3 ON p3.id = ft.patient_id
      WHERE (
        (ft.category IN (${allCats}) AND (ft.visit_id IS NULL OR v.visit_number LIKE 'EXT-%' OR ft.category IN ('external_service', 'external_lab', 'external_radiology')))
        OR ft.is_refund = 1
        OR ft.category = 'refund'
      )
        AND ft.created_at >= ${sinceClause} AND ft.created_at <= ${untilClause}
      ORDER BY ft.created_at DESC
    `, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.addGeneralTransaction = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const {
      type,
      category,
      amount,
      description,
      visit_id,
      patient_id,
      payment_method,
      refund_reason,
      service_id,
      service_type,
      external_patient_name,
      external_patient_phone,
      with_film
    } = req.body;

    let targetPatientId = patient_id;

    if (!type || !category || !amount) {
      await conn.rollback();
      return res.status(400).json({ message: 'النوع والفئة والمبلغ مطلوبة' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'المبلغ غير صالح' });
    }

    const validCats = [...GENERAL_INCOME_CATS, ...GENERAL_EXPENSE_CATS, 'refund'];
    if (!validCats.includes(category)) {
      await conn.rollback();
      return res.status(400).json({ message: 'فئة غير صحيحة' });
    }

    const validPaymentMethod = (payment_method === 'bank_transfer' || payment_method === 'bank') ? 'bank_transfer' : 'cash';

    // ── External Service (خدمات خارجية: تحاليل أو أشعة لمريض خارجي) ──
    const isExtService = ['external_service', 'external_lab', 'external_radiology'].includes(category);
    if (isExtService) {
      const resolvedServiceType = service_type || (category === 'external_radiology' ? 'radiology' : 'lab');
      if (!external_patient_name || !external_patient_name.trim()) {
        await conn.rollback();
        return res.status(400).json({ message: 'يرجى إدخال اسم المريض الخارجي' });
      }
      if (!['lab', 'radiology'].includes(resolvedServiceType)) {
        await conn.rollback();
        return res.status(400).json({ message: 'يرجى تحديد نوع الخدمة (أشعة أو تحاليل)' });
      }
      if (!service_id) {
        await conn.rollback();
        return res.status(400).json({ message: 'يرجى اختيار الخدمة المطلوبة' });
      }

      let officialPrice = 0;
      let serviceItemName = '';

      if (resolvedServiceType === 'lab') {
        const [[labRow]] = await conn.execute(
          `SELECT id, name, price FROM lab_tests WHERE id = ? AND is_active = 1`,
          [service_id]
        );
        if (!labRow) {
          await conn.rollback();
          return res.status(404).json({ message: 'التحليل المخبري المحدد غير متوفر' });
        }
        officialPrice = parseFloat(labRow.price) || 0;
        serviceItemName = labRow.name;
      } else {
        const [[radRow]] = await conn.execute(
          `SELECT id, name, price, price_with_film, price_without_film FROM radiology_tests WHERE id = ? AND is_active = 1`,
          [service_id]
        );
        if (!radRow) {
          await conn.rollback();
          return res.status(404).json({ message: 'فحص الأشعة المحدد غير متوفر' });
        }
        const hasFilm = Boolean(with_film === true || with_film === 1 || with_film === '1');
        officialPrice = hasFilm
          ? (parseFloat(radRow.price_with_film) || parseFloat(radRow.price) || 0)
          : (parseFloat(radRow.price_without_film) || parseFloat(radRow.price) || 0);
        serviceItemName = `${radRow.name} (${hasFilm ? 'فيلم' : 'بدون فيلم'})`;
      }

      // 1. إنشاء سجل مريض خفيف في جدول patients
      const trimmedPatientName = external_patient_name.trim();
      const trimmedPhone = external_patient_phone ? external_patient_phone.trim() : null;

      const [pRes] = await conn.execute(
        `INSERT INTO patients (full_name, phone, created_by) VALUES (?, ?, ?)`,
        [trimmedPatientName, trimmedPhone, req.user.id]
      );
      targetPatientId = pRes.insertId;

      // 2. توليد رقم زيارة خارجية فريد
      const extVisitNumber = `EXT-${Date.now().toString().slice(-6)}`;

      // 3. إنشاء سجل زيارة في جدول visits وتوجيهها للقسم المعني
      const initialVisitStatus = resolvedServiceType === 'lab' ? 'awaiting_lab' : 'awaiting_radiology';
      const [vRes] = await conn.execute(
        `INSERT INTO visits 
          (patient_id, visit_number, entity, status, entry_fee, is_exempt, is_follow_up, created_by)
         VALUES (?, ?, 'clinic', ?, 0.00, 0, 0, ?)`,
        [targetPatientId, extVisitNumber, initialVisitStatus, req.user.id]
      );
      const newVisitId = vRes.insertId;

      // 4. إنشاء طلب الفحص بحالة 'paid' (مسدد) ليظهر فوراً في طابور القسم
      if (resolvedServiceType === 'lab') {
        await conn.execute(
          `INSERT INTO visit_lab_requests 
            (visit_id, lab_test_id, price, final_price, status, requested_by, requested_at)
           VALUES (?, ?, ?, ?, 'paid', ?, NOW())`,
          [newVisitId, service_id, officialPrice, officialPrice, req.user.id]
        );
      } else {
        const hasFilm = Boolean(with_film === true || with_film === 1 || with_film === '1');
        await conn.execute(
          `INSERT INTO visit_radiology_requests 
            (visit_id, radiology_test_id, with_film, price, final_price, status, requested_by, requested_at)
           VALUES (?, ?, ?, ?, ?, 'paid', ?, NOW())`,
          [newVisitId, service_id, hasFilm ? 1 : 0, officialPrice, officialPrice, req.user.id]
        );
      }

      // 5. حفظ المعاملة المالية في الخزينة
      const dbCat = resolvedServiceType === 'lab' ? 'external_lab' : 'external_radiology';
      const finalDesc = (description && description.trim()) ? description.trim() : (serviceItemName || null);

      await conn.execute(
        `INSERT INTO financial_transactions 
          (type, category, amount, payment_method, description, is_refund, refund_reason, visit_id, patient_id, performed_by)
         VALUES ('income', ?, ?, ?, ?, 0, NULL, ?, ?, ?)`,
        [
          dbCat,
          officialPrice,
          validPaymentMethod,
          finalDesc,
          newVisitId,
          targetPatientId,
          req.user.id
        ]
      );

      await conn.commit();

      const io = req.app.get('io');
      if (io) {
        io.to('cashier').emit('cashier:update');
        if (resolvedServiceType === 'lab') {
          io.to('lab').emit('lab:update');
          io.to('lab').emit('lab:new_request', {
            visitId: newVisitId,
            visitNumber: extVisitNumber,
            patientName: trimmedPatientName,
            isExternal: true
          });
        } else {
          io.to('radiology').emit('radiology:updated', { visitId: newVisitId });
          io.to('radiology').emit('radiology:new_request', {
            visitId: newVisitId,
            visitNumber: extVisitNumber,
            patientName: trimmedPatientName,
            isExternal: true
          });
        }
      }

      return res.status(201).json({
        message: `تم تسجيل طلب الخدمة الخارجية (${serviceItemName}) وإرسالها للقسم بنجاح`,
        visit_id: newVisitId,
        visit_number: extVisitNumber,
        amount: officialPrice
      });
    }

    const isRefund = category === 'refund' ? 1 : 0;
    let finalRefundReason = null;
    let refundedServiceName = null;
    let refundedPatientName = null;
    let refundedVisitNumber = null;

    if (isRefund) {
      if (refund_reason && refund_reason.trim()) {
        finalRefundReason = refund_reason.trim();
      } else if (description) {
        const rMatch = description.match(/(?:السبب|سبب الاسترداد|سبب)\s*:\s*(.+)$/);
        finalRefundReason = rMatch ? rMatch[1].trim() : description;
      }

      // If visit_id is provided, enforce strict balance and status constraints
      if (visit_id) {
        // 1. Verify visit exists and calculate total paid and refunded
        const [[visitFin]] = await conn.execute(
          `SELECT 
             v.id, v.patient_id, v.created_at, v.status, v.closed_at, v.visit_number,
             COALESCE(v.is_exempt, v.is_exempted, 0) AS is_exempt_val,
             COALESCE(SUM(CASE WHEN ft.type = 'income' AND (ft.is_refund = 0 OR ft.is_refund IS NULL) THEN ft.amount ELSE 0 END), 0) AS total_paid,
             COALESCE(SUM(CASE WHEN ft.is_refund = 1 OR ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) AS total_refunded
           FROM visits v
           LEFT JOIN financial_transactions ft ON ft.visit_id = v.id
           WHERE v.id = ?
           GROUP BY v.id`,
          [visit_id]
        );

        if (!visitFin) {
          await conn.rollback();
          return res.status(404).json({ message: 'الزيارة المحددة غير موجودة' });
        }

        // قاعدة محاسبية: عدم استرداد أي رسوم لزيارة قد تم إنهاؤها أو إغلاقها مسبقاً
        if (visitFin.status === 'completed' || visitFin.closed_at) {
          await conn.rollback();
          return res.status(400).json({ message: 'لا يمكن استرداد أي رسوم لزيارة قد تم إنهاؤها وإغلاقها مسبقاً' });
        }

        if (!targetPatientId && visitFin.patient_id) {
          targetPatientId = visitFin.patient_id;
        }

        const netBalance = parseFloat(visitFin.total_paid || 0) - parseFloat(visitFin.total_refunded || 0);
        if (numAmount > netBalance) {
          await conn.rollback();
          return res.status(400).json({
            message: `المبلغ المطلوب استرداده (${numAmount}) يتجاوز الرصيد المتاح للزيارة (${netBalance})`
          });
        }

        // 2. If a specific service item was selected, validate and update its status
        if (service_type && (service_id || service_id === 0 || service_type === 'entry_fee')) {
          if (service_type === 'lab') {
            const [[labReq]] = await conn.execute(
              `SELECT vlr.id, vlr.status, vlr.is_free, vlr.price, vlr.final_price, lt.name AS service_name, p.full_name AS patient_name
               FROM visit_lab_requests vlr
               JOIN lab_tests lt ON lt.id = vlr.lab_test_id
               JOIN visits v ON v.id = vlr.visit_id
               JOIN patients p ON p.id = v.patient_id
               WHERE vlr.id = ? AND vlr.visit_id = ?`,
              [service_id, visit_id]
            );
            if (!labReq || labReq.status !== 'paid') {
              await conn.rollback();
              return res.status(400).json({ message: 'الخدمة المخبرية غير مؤهلة للاسترداد أو تم استردادها/تنفيذها مسبقاً' });
            }
            refundedServiceName = labReq.service_name;
            refundedPatientName = labReq.patient_name;
            await conn.execute(`UPDATE visit_lab_requests SET status = 'refunded' WHERE id = ?`, [service_id]);
            if (visitFin?.visit_number?.startsWith('EXT-')) {
              const [[activeExt]] = await conn.execute(
                `SELECT 
                  (SELECT COUNT(*) FROM visit_lab_requests WHERE visit_id = ? AND status NOT IN ('cancelled', 'refunded')) +
                  (SELECT COUNT(*) FROM visit_radiology_requests WHERE visit_id = ? AND status NOT IN ('cancelled', 'refunded')) AS active_count`,
                [visit_id, visit_id]
              );
              if (activeExt && parseInt(activeExt.active_count) === 0) {
                await conn.execute(`UPDATE visits SET status = 'completed', closed_at = NOW() WHERE id = ?`, [visit_id]);
              }
            }
          } else if (service_type === 'radiology') {
            const [[radReq]] = await conn.execute(
              `SELECT vrr.id, vrr.status, vrr.is_free, vrr.price, vrr.final_price, rt.name AS service_name, p.full_name AS patient_name
               FROM visit_radiology_requests vrr
               JOIN radiology_tests rt ON rt.id = vrr.radiology_test_id
               JOIN visits v ON v.id = vrr.visit_id
               JOIN patients p ON p.id = v.patient_id
               WHERE vrr.id = ? AND vrr.visit_id = ?`,
              [service_id, visit_id]
            );
            if (!radReq || radReq.status !== 'paid') {
              await conn.rollback();
              return res.status(400).json({ message: 'فحص الأشعة غير مؤهل للاسترداد أو تم استرداده/تنفيذه مسبقاً' });
            }
            refundedServiceName = radReq.service_name;
            refundedPatientName = radReq.patient_name;
            await conn.execute(`UPDATE visit_radiology_requests SET status = 'refunded' WHERE id = ?`, [service_id]);
            if (visitFin?.visit_number?.startsWith('EXT-')) {
              const [[activeExt]] = await conn.execute(
                `SELECT 
                  (SELECT COUNT(*) FROM visit_lab_requests WHERE visit_id = ? AND status NOT IN ('cancelled', 'refunded')) +
                  (SELECT COUNT(*) FROM visit_radiology_requests WHERE visit_id = ? AND status NOT IN ('cancelled', 'refunded')) AS active_count`,
                [visit_id, visit_id]
              );
              if (activeExt && parseInt(activeExt.active_count) === 0) {
                await conn.execute(`UPDATE visits SET status = 'completed', closed_at = NOW() WHERE id = ?`, [visit_id]);
              }
            }
          } else if (service_type === 'clinical') {
            const [[clinReq]] = await conn.execute(
              `SELECT vcr.id, vcr.status, vcr.is_free, vcr.price, vcr.final_price, cs.name AS service_name, p.full_name AS patient_name
               FROM visit_clinical_service_requests vcr
               JOIN clinical_services cs ON cs.id = vcr.service_id
               JOIN visits v ON v.id = vcr.visit_id
               JOIN patients p ON p.id = v.patient_id
               WHERE vcr.id = ? AND vcr.visit_id = ?`,
              [service_id, visit_id]
            );
            if (!clinReq || clinReq.status !== 'paid') {
              await conn.rollback();
              return res.status(400).json({ message: 'الخدمة السريرية غير مؤهلة للاسترداد أو تم استردادها/تنفيذها مسبقاً' });
            }
            refundedServiceName = clinReq.service_name;
            refundedPatientName = clinReq.patient_name;
            await conn.execute(`UPDATE visit_clinical_service_requests SET status = 'refunded' WHERE id = ?`, [service_id]);
          } else if (service_type === 'entry_fee') {
            // عدم استرداد رسوم المعاينة إذا تم إنهاء الزيارة
            if (visitFin.status === 'completed' || visitFin.closed_at) {
              await conn.rollback();
              return res.status(400).json({ message: 'لا يمكن استرداد رسوم المعاينة لزيارة قد تم إنهاؤها وإغلاقها' });
            }

            // عدم استرداد رسوم المعاينة إذا مضى يومين من تاريخ الدفع
            const [[entryTx]] = await conn.execute(
              `SELECT id, created_at FROM financial_transactions 
               WHERE visit_id = ? AND category = 'entry_fee' AND type = 'income' AND (is_refund = 0 OR is_refund IS NULL)
               ORDER BY id DESC LIMIT 1`,
              [visit_id]
            );
            if (!entryTx) {
              await conn.rollback();
              return res.status(400).json({ message: 'لا توجد رسوم معاينة مسددة لهذه الزيارة' });
            }
            const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
            if (new Date(entryTx.created_at) < twoDaysAgo) {
              await conn.rollback();
              return res.status(400).json({ message: 'لا يمكن استرداد رسوم المعاينة بعد مضي يومين من تاريخ الدفع' });
            }

            const [[orderCounts]] = await conn.execute(
              `SELECT 
                 (SELECT COUNT(*) FROM visit_lab_requests WHERE visit_id = ?) +
                 (SELECT COUNT(*) FROM visit_radiology_requests WHERE visit_id = ?) +
                 (SELECT COUNT(*) FROM visit_clinical_service_requests WHERE visit_id = ?) AS total_orders`,
              [visit_id, visit_id, visit_id]
            );
            if (orderCounts && parseInt(orderCounts.total_orders) > 0) {
              await conn.rollback();
              return res.status(400).json({ message: 'لا يمكن استرداد رسوم المعاينة نظراً لوجود خدمات طبية مطلوبة للزيارة' });
            }
            const [[alreadyRefundedEntry]] = await conn.execute(
              `SELECT id FROM financial_transactions 
               WHERE visit_id = ? AND category = 'entry_fee' AND (is_refund = 1 OR type = 'expense')`,
              [visit_id]
            );
            if (alreadyRefundedEntry) {
              await conn.rollback();
              return res.status(400).json({ message: 'تم استرداد رسوم المعاينة لهذه الزيارة مسبقاً' });
            }

            // Fetch visit details & patient name
            const [[visitInfoRow]] = await conn.execute(
              `SELECT v.visit_number, p.full_name, p.id AS patient_id 
               FROM visits v 
               JOIN patients p ON v.patient_id = p.id 
               WHERE v.id = ?`,
              [visit_id]
            );
            refundedServiceName = 'رسوم المعاينة';
            if (visitInfoRow) {
              refundedPatientName = visitInfoRow.full_name;
              refundedVisitNumber = visitInfoRow.visit_number;
              if (!targetPatientId) targetPatientId = visitInfoRow.patient_id;
            }

            // Immediately mark the visit as cancelled upon refunding consultation fee
            await conn.execute(`UPDATE visits SET status = 'cancelled' WHERE id = ?`, [visit_id]);
          }
        }
      }
    }

    let finalCategory = category;
    if (isRefund && service_type && ['lab', 'radiology', 'clinical', 'entry_fee'].includes(service_type)) {
      finalCategory = service_type;
    }

    // Insert into financial_transactions
    await conn.execute(
      `INSERT INTO financial_transactions 
        (type, category, amount, payment_method, description, is_refund, refund_reason, visit_id, patient_id, performed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        type,
        finalCategory,
        numAmount,
        validPaymentMethod,
        description || '',
        isRefund,
        finalRefundReason,
        visit_id || null,
        targetPatientId || null,
        req.user.id
      ]
    );

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('cashier').emit('cashier:update');
      if (isRefund) {
        if (service_type === 'entry_fee') {
          const cancelPayload = {
            visitId: visit_id,
            patientId: targetPatientId,
            visitNumber: refundedVisitNumber || '',
            patientName: refundedPatientName || 'مريض',
            isConsultationRefund: true,
            reason: finalRefundReason,
            message: `تم إلغاء الزيارة واسترداد رسوم المعاينة للمريض: (${refundedPatientName || 'مريض'}) من قبل المحاسب`
          };
          io.to('secretary').emit('visit:cancelled', cancelPayload);
          io.to('doctor').emit('visit:cancelled', cancelPayload);
          io.to('doctor').emit('patient:cancelled', { visitId: visit_id, patientId: targetPatientId });
          io.to('secretary').emit('patient:updated', { patientId: targetPatientId });
          io.to('doctor').emit('patient:updated', { patientId: targetPatientId, visitId: visit_id });
        } else if (refundedServiceName) {
          const isExternal = Boolean((refundedVisitNumber || visitFin?.visit_number)?.startsWith('EXT-'));
          const refundPayload = {
            visitId: visit_id,
            patientName: refundedPatientName || 'مريض',
            serviceType: service_type,
            serviceName: refundedServiceName,
            reason: finalRefundReason
          };
          if (!isExternal) {
            io.to('doctor').emit('service:refunded', refundPayload);
          }
          if (service_type === 'lab' || service_type === 'radiology') {
            io.to(service_type).emit('service:refunded', refundPayload);
          }
        }
        if (service_type === 'lab') io.to('lab').emit('lab:update');
        if (service_type === 'radiology') io.to('radiology').emit('radiology:updated');
        const isExternalClinical = Boolean((refundedVisitNumber || visitFin?.visit_number)?.startsWith('EXT-'));
        if (service_type === 'clinical' && visit_id && !isExternalClinical) io.to('doctor').emit('patient:updated', { visitId: visit_id, patientId: targetPatientId });
      }
    }

    res.status(201).json({ message: 'تم تسجيل الإجراء بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════════════
// GET /api/cashier/refundable-patients — جلب المرضى المؤهلين للاسترداد وفق القيود الصارمة
// ═══════════════════════════════════════════════════════════════════
exports.getRefundablePatients = async (req, res) => {
  try {
    const { q = '' } = req.query;
    let query = `
      WITH LatestPatientVisits AS (
        SELECT 
          v.id AS visit_id,
          v.patient_id,
          v.visit_number,
          v.created_at AS visit_created_at,
          v.entry_fee,
          v.status,
          v.closed_at,
          COALESCE(v.discount_amount, 0) AS discount_amount,
          COALESCE(v.is_exempt, v.is_exempted, 0) AS is_exempt_val,
          ROW_NUMBER() OVER (
            PARTITION BY v.patient_id 
            ORDER BY v.created_at DESC, v.id DESC
          ) AS rn
        FROM visits v
      ),
      VisitRefundableTotals AS (
        SELECT 
          lpv.visit_id,
          (
            COALESCE((
              SELECT SUM(COALESCE(vlr.final_price, vlr.price))
              FROM visit_lab_requests vlr
              WHERE vlr.visit_id = lpv.visit_id
                AND vlr.status = 'paid'
                AND COALESCE(vlr.is_free, 0) = 0
                AND COALESCE(vlr.final_price, vlr.price) > 0
            ), 0)
            +
            COALESCE((
              SELECT SUM(COALESCE(vrr.final_price, vrr.price))
              FROM visit_radiology_requests vrr
              WHERE vrr.visit_id = lpv.visit_id
                AND vrr.status = 'paid'
                AND COALESCE(vrr.is_free, 0) = 0
                AND COALESCE(vrr.final_price, vrr.price) > 0
            ), 0)
            +
            COALESCE((
              SELECT SUM(COALESCE(vcr.final_price, vcr.price))
              FROM visit_clinical_service_requests vcr
              WHERE vcr.visit_id = lpv.visit_id
                AND vcr.status = 'paid'
                AND COALESCE(vcr.is_free, 0) = 0
                AND COALESCE(vcr.final_price, vcr.price) > 0
            ), 0)
            +
            COALESCE((
              SELECT SUM(ft.amount)
              FROM financial_transactions ft
              WHERE ft.visit_id = lpv.visit_id
                AND ft.category = 'entry_fee'
                AND ft.type = 'income'
                AND (ft.is_refund = 0 OR ft.is_refund IS NULL)
                AND ft.created_at >= NOW() - INTERVAL 2 DAY
                AND NOT EXISTS (
                  SELECT 1 FROM financial_transactions ft_ref 
                  WHERE ft_ref.visit_id = ft.visit_id 
                    AND ft_ref.category = 'entry_fee' 
                    AND (ft_ref.is_refund = 1 OR ft_ref.type = 'expense')
                )
                AND (SELECT COUNT(*) FROM visit_lab_requests WHERE visit_id = lpv.visit_id) = 0
                AND (SELECT COUNT(*) FROM visit_radiology_requests WHERE visit_id = lpv.visit_id) = 0
                AND (SELECT COUNT(*) FROM visit_clinical_service_requests WHERE visit_id = lpv.visit_id) = 0
            ), 0)
          ) AS refundable_amount
        FROM LatestPatientVisits lpv
        WHERE lpv.rn = 1 
          AND lpv.is_exempt_val = 0 
          AND lpv.status NOT IN ('completed', 'cancelled')
          AND lpv.closed_at IS NULL
          AND lpv.visit_created_at >= NOW() - INTERVAL 7 DAY
      )
      SELECT 
        p.id,
        p.id AS patient_id,
        p.full_name,
        p.phone,
        p.age,
        p.gender,
        lpv.visit_id,
        lpv.visit_number,
        lpv.visit_number AS latest_visit_number,
        lpv.visit_created_at,
        vrt.refundable_amount AS total_paid,
        0 AS total_refunded,
        vrt.refundable_amount AS net_refundable_balance
      FROM LatestPatientVisits lpv
      JOIN patients p ON p.id = lpv.patient_id
      JOIN VisitRefundableTotals vrt ON vrt.visit_id = lpv.visit_id
      WHERE lpv.rn = 1
        AND lpv.is_exempt_val = 0
        AND lpv.status NOT IN ('completed', 'cancelled')
        AND lpv.closed_at IS NULL
        AND lpv.visit_created_at >= NOW() - INTERVAL 7 DAY
        AND vrt.refundable_amount > 0
    `;

    const params = [];
    if (q && q.trim()) {
      const searchTerm = `%${q.trim()}%`;
      query += ` AND (p.full_name LIKE ? OR p.phone LIKE ? OR lpv.visit_number LIKE ? OR CAST(p.id AS CHAR) = ?)`;
      params.push(searchTerm, searchTerm, searchTerm, q.trim());
    }

    query += ` ORDER BY lpv.visit_created_at DESC LIMIT 100`;

    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ أثناء جلب قائمة المرضى المؤهلين للاسترداد' });
  }
};

// ═══════════════════════════════════════════════════════════════════
// GET /api/cashier/visit-refundable-services/:visitId — جلب الخدمات المؤهلة للاسترداد لزيارة محددة
// ═══════════════════════════════════════════════════════════════════
exports.getVisitRefundableServices = async (req, res) => {
  try {
    const { visitId } = req.params;
    if (!visitId) {
      return res.status(400).json({ message: 'معرف الزيارة مطلوب' });
    }

    // عدم استرداد أي رسوم لزيارة قد تم إنهاؤها أو إغلاقها
    const [[visitRow]] = await db.execute(
      `SELECT id, status, closed_at FROM visits WHERE id = ?`,
      [visitId]
    );

    if (!visitRow || visitRow.status === 'completed' || visitRow.closed_at) {
      return res.json([]);
    }

    const query = `
      -- 1. الفحوصات المخبرية المؤهلة
      SELECT 
        vlr.id AS item_id,
        'lab' AS item_type,
        'مختبر' AS category_label,
        COALESCE(lt.name, 'تحليل مخبري') AS service_name,
        COALESCE(vlr.final_price, vlr.price) AS price,
        vlr.status,
        vlr.requested_at
      FROM visit_lab_requests vlr
      JOIN lab_tests lt ON lt.id = vlr.lab_test_id
      WHERE vlr.visit_id = ?
        AND vlr.status = 'paid'
        AND COALESCE(vlr.is_free, 0) = 0
        AND COALESCE(vlr.final_price, vlr.price) > 0

      UNION ALL

      -- 2. الفحوصات الإشعاعية المؤهلة
      SELECT 
        vrr.id AS item_id,
        'radiology' AS item_type,
        'أشعة' AS category_label,
        CONCAT(COALESCE(rt.name, 'فحص أشعة'), CASE WHEN vrr.with_film = 1 THEN '' ELSE ' (بدون فيلم)' END) AS service_name,
        COALESCE(vrr.final_price, vrr.price) AS price,
        vrr.status,
        vrr.requested_at
      FROM visit_radiology_requests vrr
      JOIN radiology_tests rt ON rt.id = vrr.radiology_test_id
      WHERE vrr.visit_id = ?
        AND vrr.status = 'paid'
        AND COALESCE(vrr.is_free, 0) = 0
        AND COALESCE(vrr.final_price, vrr.price) > 0

      UNION ALL

      -- 3. الخدمات السريرية المؤهلة
      SELECT 
        vcr.id AS item_id,
        'clinical' AS item_type,
        'خدمة سريرية' AS category_label,
        COALESCE(cs.name, 'خدمة سريرية') AS service_name,
        COALESCE(vcr.final_price, vcr.price) AS price,
        vcr.status,
        vcr.created_at AS requested_at
      FROM visit_clinical_service_requests vcr
      JOIN clinical_services cs ON cs.id = vcr.service_id
      WHERE vcr.visit_id = ?
        AND vcr.status = 'paid'
        AND COALESCE(vcr.is_free, 0) = 0
        AND COALESCE(vcr.final_price, vcr.price) > 0

      UNION ALL

      -- 4. رسوم المعاينة (مشروطة بعدم إنهاء الزيارة وسدادها خلال يومين فقط وعدم وجود أي طلبات فحص)
      SELECT 
        0 AS item_id,
        'entry_fee' AS item_type,
        'رسوم معاينة' AS category_label,
        'رسوم معاينة' AS service_name,
        ft.amount AS price,
        'paid' AS status,
        ft.created_at AS requested_at
      FROM financial_transactions ft
      JOIN visits v ON v.id = ft.visit_id
      WHERE ft.visit_id = ?
        AND v.status NOT IN ('completed', 'cancelled')
        AND v.closed_at IS NULL
        AND ft.category = 'entry_fee'
        AND ft.type = 'income'
        AND (ft.is_refund = 0 OR ft.is_refund IS NULL)
        AND ft.created_at >= NOW() - INTERVAL 2 DAY
        AND NOT EXISTS (
          SELECT 1 FROM financial_transactions ft_ref 
          WHERE ft_ref.visit_id = ft.visit_id 
            AND ft_ref.category = 'entry_fee' 
            AND (ft_ref.is_refund = 1 OR ft_ref.type = 'expense')
        )
        AND (SELECT COUNT(*) FROM visit_lab_requests WHERE visit_id = ft.visit_id) = 0
        AND (SELECT COUNT(*) FROM visit_radiology_requests WHERE visit_id = ft.visit_id) = 0
        AND (SELECT COUNT(*) FROM visit_clinical_service_requests WHERE visit_id = ft.visit_id) = 0
    `;

    const [rows] = await db.execute(query, [visitId, visitId, visitId, visitId]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ أثناء جلب الخدمات المؤهلة للاسترداد' });
  }
};

// ═══════════════════════════════════════════════════════════════════
// GET /api/cashier/archive/patients — جلب أو البحث عن المرضى للأرشيف المالي
// ═══════════════════════════════════════════════════════════════════
exports.getArchivePatients = async (req, res) => {
  try {
    const { q = '', excludeExempt = '' } = req.query;
    const onlyNonExempt = excludeExempt === '1' || excludeExempt === 'true';
    let query = `
      SELECT p.id, p.full_name, p.phone, p.gender, p.age,
             MAX(v.created_at) AS last_visit_date,
             COUNT(v.id) AS total_visits,
             (
               SELECT COUNT(*)
               FROM visits v_ne
               WHERE v_ne.patient_id = p.id
                 AND COALESCE(v_ne.is_exempt, v_ne.is_exempted, 0) = 0
                 AND v_ne.status != 'cancelled'
             ) AS non_exempt_visits_count,
             (
               SELECT COUNT(*)
               FROM visits v_ex
               WHERE v_ex.patient_id = p.id
                 AND COALESCE(v_ex.is_exempt, v_ex.is_exempted, 0) = 1
                 AND v_ex.status != 'cancelled'
             ) AS exempt_visits_count,
             (
               SELECT COUNT(*)
               FROM visits v_fu
               WHERE v_fu.patient_id = p.id
                 AND COALESCE(v_fu.is_follow_up, 0) = 1
                 AND v_fu.status != 'cancelled'
             ) AS review_visits_count,
             (
               SELECT COALESCE(NULLIF(v_lat.visit_number, ''), CAST(v_lat.id AS CHAR))
               FROM visits v_lat
               WHERE v_lat.patient_id = p.id AND v_lat.status != 'cancelled' ${onlyNonExempt ? 'AND COALESCE(v_lat.is_exempt, 0) = 0' : ''}
               ORDER BY v_lat.created_at DESC, v_lat.id DESC
               LIMIT 1
             ) AS latest_visit_number,
             (
               SELECT GROUP_CONCAT(DISTINCT COALESCE(NULLIF(v_all.visit_number, ''), CAST(v_all.id AS CHAR)) ORDER BY v_all.created_at DESC SEPARATOR ', ')
               FROM visits v_all
               WHERE v_all.patient_id = p.id
             ) AS all_visit_numbers,
             (
               SELECT GROUP_CONCAT(DISTINCT CAST(v_all.id AS CHAR) ORDER BY v_all.created_at DESC SEPARATOR ', ')
               FROM visits v_all
               WHERE v_all.patient_id = p.id
             ) AS all_visit_ids,
             (
               SELECT COALESCE(v_lat.is_exempt, v_lat.is_exempted, 0)
               FROM visits v_lat
               WHERE v_lat.patient_id = p.id AND v_lat.status != 'cancelled'
               ORDER BY v_lat.created_at DESC, v_lat.id DESC
               LIMIT 1
             ) AS is_exempt,
             (
               SELECT COALESCE(v_lat.is_follow_up, 0)
               FROM visits v_lat
               WHERE v_lat.patient_id = p.id AND v_lat.status != 'cancelled'
               ORDER BY v_lat.created_at DESC, v_lat.id DESC
               LIMIT 1
             ) AS is_follow_up,
             CASE
               WHEN COALESCE((
                 SELECT GREATEST(0, SUM(CASE WHEN ft_lat.type = 'income' AND COALESCE(ft_lat.is_refund, 0) = 0 THEN ft_lat.amount WHEN ft_lat.is_refund = 1 OR ft_lat.type = 'expense' THEN -ft_lat.amount ELSE 0 END))
                 FROM financial_transactions ft_lat
                 LEFT JOIN surgeries s_lat ON s_lat.id = ft_lat.surgery_id
                 WHERE (
                   ft_lat.visit_id = (SELECT v_lat.id FROM visits v_lat WHERE v_lat.patient_id = p.id AND v_lat.status != 'cancelled' ORDER BY v_lat.created_at DESC, v_lat.id DESC LIMIT 1)
                   OR (ft_lat.visit_id IS NULL AND s_lat.visit_id = (SELECT v_lat.id FROM visits v_lat WHERE v_lat.patient_id = p.id AND v_lat.status != 'cancelled' ORDER BY v_lat.created_at DESC, v_lat.id DESC LIMIT 1) AND s_lat.status != 'cancelled')
                 )
               ), 0) > 0 
                 THEN COALESCE((
                   SELECT GREATEST(0, SUM(CASE WHEN ft_lat.type = 'income' AND COALESCE(ft_lat.is_refund, 0) = 0 THEN ft_lat.amount WHEN ft_lat.is_refund = 1 OR ft_lat.type = 'expense' THEN -ft_lat.amount ELSE 0 END))
                   FROM financial_transactions ft_lat
                   LEFT JOIN surgeries s_lat ON s_lat.id = ft_lat.surgery_id
                   WHERE (
                     ft_lat.visit_id = (SELECT v_lat.id FROM visits v_lat WHERE v_lat.patient_id = p.id AND v_lat.status != 'cancelled' ORDER BY v_lat.created_at DESC, v_lat.id DESC LIMIT 1)
                     OR (ft_lat.visit_id IS NULL AND s_lat.visit_id = (SELECT v_lat.id FROM visits v_lat WHERE v_lat.patient_id = p.id AND v_lat.status != 'cancelled' ORDER BY v_lat.created_at DESC, v_lat.id DESC LIMIT 1) AND s_lat.status != 'cancelled')
                   )
                 ), 0)
               ELSE COALESCE((
                 SELECT GREATEST(0, SUM(CASE WHEN ft_pd.type = 'income' AND COALESCE(ft_pd.is_refund, 0) = 0 THEN ft_pd.amount WHEN ft_pd.is_refund = 1 OR ft_pd.type = 'expense' THEN -ft_pd.amount ELSE 0 END))
                 FROM financial_transactions ft_pd
                 LEFT JOIN surgeries s_pd ON s_pd.id = ft_pd.surgery_id
                 WHERE (
                   ft_pd.visit_id = (SELECT v_pd.id FROM visits v_pd WHERE v_pd.patient_id = p.id AND v_pd.status != 'cancelled' AND (SELECT COALESCE(SUM(CASE WHEN ft_chk.type = 'income' AND COALESCE(ft_chk.is_refund, 0) = 0 THEN ft_chk.amount WHEN ft_chk.is_refund = 1 OR ft_chk.type = 'expense' THEN -ft_chk.amount ELSE 0 END), 0) FROM financial_transactions ft_chk LEFT JOIN surgeries s_chk ON s_chk.id = ft_chk.surgery_id WHERE (ft_chk.visit_id = v_pd.id OR (ft_chk.visit_id IS NULL AND s_chk.visit_id = v_pd.id AND s_chk.status != 'cancelled'))) > 0 ORDER BY v_pd.created_at DESC, v_pd.id DESC LIMIT 1)
                   OR (ft_pd.visit_id IS NULL AND s_pd.visit_id = (SELECT v_pd.id FROM visits v_pd WHERE v_pd.patient_id = p.id AND v_pd.status != 'cancelled' AND (SELECT COALESCE(SUM(CASE WHEN ft_chk.type = 'income' AND COALESCE(ft_chk.is_refund, 0) = 0 THEN ft_chk.amount WHEN ft_chk.is_refund = 1 OR ft_chk.type = 'expense' THEN -ft_chk.amount ELSE 0 END), 0) FROM financial_transactions ft_chk LEFT JOIN surgeries s_chk ON s_chk.id = ft_chk.surgery_id WHERE (ft_chk.visit_id = v_pd.id OR (ft_chk.visit_id IS NULL AND s_chk.visit_id = v_pd.id AND s_chk.status != 'cancelled'))) > 0 ORDER BY v_pd.created_at DESC, v_pd.id DESC LIMIT 1) AND s_pd.status != 'cancelled')
                 )
               ), 0)
             END AS total_amount,
             CASE
               WHEN COALESCE((
                 SELECT GREATEST(0, SUM(CASE WHEN ft_lat.type = 'income' AND COALESCE(ft_lat.is_refund, 0) = 0 THEN ft_lat.amount WHEN ft_lat.is_refund = 1 OR ft_lat.type = 'expense' THEN -ft_lat.amount ELSE 0 END))
                 FROM financial_transactions ft_lat
                 LEFT JOIN surgeries s_lat ON s_lat.id = ft_lat.surgery_id
                 WHERE (
                   ft_lat.visit_id = (SELECT v_lat.id FROM visits v_lat WHERE v_lat.patient_id = p.id AND v_lat.status != 'cancelled' ORDER BY v_lat.created_at DESC, v_lat.id DESC LIMIT 1)
                   OR (ft_lat.visit_id IS NULL AND s_lat.visit_id = (SELECT v_lat.id FROM visits v_lat WHERE v_lat.patient_id = p.id AND v_lat.status != 'cancelled' ORDER BY v_lat.created_at DESC, v_lat.id DESC LIMIT 1) AND s_lat.status != 'cancelled')
                 )
               ), 0) > 0 
                 THEN (SELECT v_lat.id FROM visits v_lat WHERE v_lat.patient_id = p.id AND v_lat.status != 'cancelled' ORDER BY v_lat.created_at DESC, v_lat.id DESC LIMIT 1)
               ELSE (SELECT v_pd.id FROM visits v_pd WHERE v_pd.patient_id = p.id AND v_pd.status != 'cancelled' AND (SELECT COALESCE(SUM(CASE WHEN ft_chk.type = 'income' AND COALESCE(ft_chk.is_refund, 0) = 0 THEN ft_chk.amount WHEN ft_chk.is_refund = 1 OR ft_chk.type = 'expense' THEN -ft_chk.amount ELSE 0 END), 0) FROM financial_transactions ft_chk LEFT JOIN surgeries s_chk ON s_chk.id = ft_chk.surgery_id WHERE (ft_chk.visit_id = v_pd.id OR (ft_chk.visit_id IS NULL AND s_chk.visit_id = v_pd.id AND s_chk.status != 'cancelled'))) > 0 ORDER BY v_pd.created_at DESC, v_pd.id DESC LIMIT 1)
             END AS target_visit_id,
             CASE WHEN EXISTS (
               SELECT 1 FROM visits v2 
               LEFT JOIN visit_lab_requests lr ON lr.visit_id = v2.id AND lr.status = 'suspended'
               LEFT JOIN visit_radiology_requests rr ON rr.visit_id = v2.id AND rr.status = 'suspended'
               WHERE v2.patient_id = p.id AND (lr.id IS NOT NULL OR rr.id IS NOT NULL)
             ) THEN 1 ELSE 0 END AS has_suspended_services,
             (
               SELECT (CASE WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v_lat.id AND s.status != 'cancelled') OR v_lat.status = 'transferred_to_center' THEN 1 ELSE 0 END)
               FROM visits v_lat
               WHERE v_lat.patient_id = p.id AND v_lat.status != 'cancelled'
               ORDER BY v_lat.created_at DESC, v_lat.id DESC
               LIMIT 1
             ) AS is_surgery,
             (
               SELECT (CASE WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v_lat.id AND s.status != 'cancelled') OR v_lat.status = 'transferred_to_center' THEN 1 ELSE 0 END)
               FROM visits v_lat
               WHERE v_lat.patient_id = p.id AND v_lat.status != 'cancelled'
               ORDER BY v_lat.created_at DESC, v_lat.id DESC
               LIMIT 1
             ) AS has_surgeries,
             (
               SELECT (CASE WHEN v_lat.visit_number LIKE 'EXT-%' THEN 1 ELSE 0 END)
               FROM visits v_lat
               WHERE v_lat.patient_id = p.id AND v_lat.status != 'cancelled'
               ORDER BY v_lat.created_at DESC, v_lat.id DESC
               LIMIT 1
             ) AS is_external
      FROM patients p
      LEFT JOIN visits v ON v.patient_id = p.id AND v.status != 'cancelled' ${onlyNonExempt ? 'AND COALESCE(v.is_exempt, 0) = 0' : ''}
    `;
    const conditions = [];
    const params = [];
    if (onlyNonExempt) {
      conditions.push(`EXISTS (SELECT 1 FROM visits v_chk WHERE v_chk.patient_id = p.id AND COALESCE(v_chk.is_exempt, 0) = 0)`);
    }
    if (q) {
      conditions.push(`(p.full_name LIKE ? OR p.phone LIKE ? OR p.id LIKE ? OR v.visit_number LIKE ?)`);
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }
    const limitVal = req.query.limit ? Math.min(parseInt(req.query.limit) || 500, 2000) : 500;
    query += ` GROUP BY p.id ORDER BY last_visit_date DESC LIMIT ${limitVal}`;

    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في جلب الأرشيف' });
  }
};

// ═══════════════════════════════════════════════════════════════════
// GET /api/cashier/archive/patient/:id — جلب الملف المالي الكامل لمريض
// ═══════════════════════════════════════════════════════════════════
exports.getPatientFinancialRecord = async (req, res) => {
  try {
    const { id } = req.params;

    const [[patient]] = await db.execute(`SELECT * FROM patients WHERE id=?`, [id]);
    if (!patient) return res.status(404).json({ message: 'المريض غير موجود' });

    const [transactions] = await db.execute(`
      SELECT ft.id, ft.type, ft.category, ft.amount, ft.payment_method, ft.is_refund, ft.refund_reason, 
             ft.description, ft.created_at, u.full_name AS cashier_name,
             COALESCE(ft.visit_id, s.visit_id) AS visit_id,
             ft.surgery_id,
             COALESCE(
               NULLIF(TRIM(ft.description), ''),
               s.surgery_type,
               CASE 
                 WHEN ft.category IN ('lab', 'external_lab') THEN 
                   (SELECT lt.name FROM visit_lab_requests vlr JOIN lab_tests lt ON lt.id = vlr.lab_test_id WHERE vlr.visit_id = COALESCE(ft.visit_id, s.visit_id) LIMIT 1)
                 WHEN ft.category IN ('radiology', 'external_radiology') THEN 
                   (SELECT CONCAT(rt.name, IF(vrr.with_film = 1, '', ' (بدون فيلم)')) FROM visit_radiology_requests vrr JOIN radiology_tests rt ON rt.id = vrr.radiology_test_id WHERE vrr.visit_id = COALESCE(ft.visit_id, s.visit_id) LIMIT 1)
                 WHEN ft.category = 'clinical' THEN 
                   (SELECT cs.name FROM visit_clinical_service_requests vcr JOIN clinical_services cs ON cs.id = vcr.service_id WHERE vcr.visit_id = COALESCE(ft.visit_id, s.visit_id) LIMIT 1)
                 WHEN ft.category = 'entry_fee' THEN 'رسوم معاينة'
                 ELSE NULL
               END
             ) AS service_name
      FROM financial_transactions ft
      LEFT JOIN visits v ON v.id = ft.visit_id
      LEFT JOIN surgeries s ON s.id = ft.surgery_id
      LEFT JOIN users u ON u.id = ft.performed_by
      WHERE (v.patient_id = ? OR s.patient_id = ? OR ft.patient_id = ?)
        AND (ft.amount > 0 OR ft.is_refund = 1)
      ORDER BY ft.created_at DESC
    `, [id, id, id]);

    const [visits] = await db.execute(`
      SELECT v.id, v.visit_number, v.status, v.entry_fee, v.created_at,
             COALESCE(v.is_exempt, v.is_exempted, 0) AS is_exempt,
             COALESCE(v.is_follow_up, 0) AS is_follow_up,
             (CASE WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v.id) OR v.status = 'transferred_to_center' THEN 1 ELSE 0 END) AS is_surgery,
             (CASE WHEN v.visit_number LIKE 'EXT-%' THEN 1 ELSE 0 END) AS is_external
      FROM visits v WHERE v.patient_id = ? ORDER BY v.created_at DESC
    `, [id]);

    const [suspendedLab] = await db.execute(`
      SELECT lr.id, lr.visit_id, lr.lab_test_id, lr.price, lr.requested_at, v.created_at AS visit_created_at, COALESCE(lr.requested_at, v.created_at) AS created_at, v.visit_number, t.name, 'lab' AS type
      FROM visit_lab_requests lr
      JOIN visits v ON v.id = lr.visit_id
      JOIN lab_tests t ON t.id = lr.lab_test_id
      WHERE v.patient_id = ? AND lr.status = 'cancelled' AND COALESCE(lr.is_free, 0) = 0
    `, [id]);

    const [suspendedRad] = await db.execute(`
      SELECT rr.id, rr.visit_id, rr.radiology_test_id, rr.price, rr.requested_at, v.created_at AS visit_created_at, COALESCE(rr.requested_at, v.created_at) AS created_at, rr.with_film, v.visit_number, rt.name, 'radiology' AS type
      FROM visit_radiology_requests rr
      JOIN visits v ON v.id = rr.visit_id
      JOIN radiology_tests rt ON rt.id = rr.radiology_test_id
      WHERE v.patient_id = ? AND rr.status = 'cancelled' AND COALESCE(rr.is_free, 0) = 0
    `, [id]);

    const [suspendedClin] = await db.execute(`
      SELECT cr.id, cr.visit_id, cr.service_id, cr.price, cr.created_at AS requested_at, v.created_at AS visit_created_at, COALESCE(cr.created_at, v.created_at) AS created_at, v.visit_number, cs.name, 'clinical' AS type
      FROM visit_clinical_service_requests cr
      JOIN visits v ON v.id = cr.visit_id
      JOIN clinical_services cs ON cs.id = cr.service_id
      WHERE v.patient_id = ? AND cr.status = 'cancelled' AND COALESCE(cr.is_free, 0) = 0
    `, [id]);
    
    const suspendedServices = [...(suspendedLab || []), ...(suspendedRad || []), ...(suspendedClin || [])].sort((a,b) => new Date(b.requested_at || b.created_at) - new Date(a.requested_at || a.created_at));

    // Query A: Pending Payment Items (Entry Fees + Lab + Radiology)
    const [pendingVisits] = await db.execute(`
      SELECT v.id AS visit_id, v.id, v.status, v.entry_fee, v.discount_amount,
             v.visit_number, v.created_at,
             COALESCE(
               NULLIF(v.entry_fee, 0),
               (SELECT CAST(setting_value AS DECIMAL(10,2)) FROM settings WHERE setting_key = 'entry_fee' LIMIT 1),
               0
             ) AS price
      FROM visits v
      WHERE v.patient_id = ? 
        AND v.status IN ('registered', 'pending_payment') 
        AND COALESCE(v.is_exempt, 0) = 0
        AND NOT EXISTS (
          SELECT 1 FROM financial_transactions ft 
          WHERE ft.visit_id = v.id AND ft.category = 'entry_fee' AND ft.type = 'income' AND ft.is_refund = 0
        )
    `, [id]);

    const pendingEntryFees = (pendingVisits || []).map(v => ({
      id: `entry_${v.visit_id}`,
      visit_id: v.visit_id,
      status: 'pending_payment',
      price: parseFloat(v.price) || 0,
      discount_percentage: 0,
      discount_amount: parseFloat(v.discount_amount) || 0,
      final_price: Math.max(0, (parseFloat(v.price) || 0) - (parseFloat(v.discount_amount) || 0)),
      is_free: 0,
      name: 'رسوم المعاينة',
      type: 'entry_fee',
      visit_number: v.visit_number,
      created_at: v.created_at
    }));

    const [pendingLab] = await db.execute(`
      SELECT vlr.id, vlr.visit_id, vlr.status, vlr.price, vlr.discount_percentage,
             vlr.discount_amount, vlr.final_price, vlr.is_free,
             lt.name, 'lab' AS type, v.visit_number,
             vlr.requested_at, v.created_at AS visit_created_at, COALESCE(vlr.requested_at, v.created_at) AS created_at
      FROM visit_lab_requests vlr
      JOIN visits v ON v.id = vlr.visit_id
      JOIN lab_tests lt ON lt.id = vlr.lab_test_id
      WHERE v.patient_id = ? AND vlr.status = 'pending_payment'
    `, [id]);

    const [pendingRad] = await db.execute(`
      SELECT vrr.id, vrr.visit_id, vrr.status, vrr.price, vrr.discount_percentage,
             vrr.discount_amount, vrr.final_price, vrr.is_free,
             vrr.with_film, rt.name, 'radiology' AS type, v.visit_number,
             vrr.requested_at, v.created_at AS visit_created_at, COALESCE(vrr.requested_at, v.created_at) AS created_at
      FROM visit_radiology_requests vrr
      JOIN visits v ON v.id = vrr.visit_id
      JOIN radiology_tests rt ON rt.id = vrr.radiology_test_id
      WHERE v.patient_id = ? AND vrr.status = 'pending_payment'
    `, [id]);

    const [pendingClin] = await db.execute(`
      SELECT vcr.id, vcr.visit_id, vcr.status, vcr.price, vcr.discount_percentage,
             vcr.discount_amount, vcr.final_price, vcr.is_free,
             cs.name, 'clinical' AS type, v.visit_number,
             vcr.created_at AS requested_at, v.created_at AS visit_created_at, COALESCE(vcr.created_at, v.created_at) AS created_at
      FROM visit_clinical_service_requests vcr
      JOIN visits v ON v.id = vcr.visit_id
      JOIN clinical_services cs ON cs.id = vcr.service_id
      WHERE v.patient_id = ? AND vcr.status = 'pending_payment'
    `, [id]);

    const pendingServices = [...pendingEntryFees, ...(pendingLab || []), ...(pendingRad || []), ...(pendingClin || [])].sort((a,b) => new Date(b.requested_at || b.created_at) - new Date(a.requested_at || a.created_at));

    // Query B: Service History (Paid / In Progress / Completed / Refunded)
    const [historyLab] = await db.execute(`
      SELECT vlr.id, vlr.visit_id, vlr.status, vlr.price, vlr.discount_percentage, vlr.discount_amount, vlr.final_price, vlr.is_free,
             lt.name, 'lab' AS type, v.visit_number,
             vlr.requested_at, vlr.performed_at, v.created_at AS visit_created_at, COALESCE(vlr.requested_at, v.created_at) AS created_at,
             ft.refund_reason, ft.created_at AS refunded_at, ft.payment_method AS refund_payment_method
      FROM visit_lab_requests vlr
      JOIN visits v ON v.id = vlr.visit_id
      JOIN lab_tests lt ON lt.id = vlr.lab_test_id
      LEFT JOIN financial_transactions ft
        ON ft.visit_id = vlr.visit_id
        AND ft.is_refund = 1
        AND (ft.category = 'lab' OR ft.category = 'refund' OR ft.category = 'external_lab')
        AND (ft.description = lt.name OR (COALESCE(vlr.final_price, vlr.price) > 0 AND ft.amount = COALESCE(vlr.final_price, vlr.price)) OR ft.description LIKE '%استرداد%')
      WHERE v.patient_id = ? AND vlr.status IN ('paid', 'in_progress', 'result_uploaded', 'completed', 'refunded')
    `, [id]);

    const [historyRad] = await db.execute(`
      SELECT vrr.id, vrr.visit_id, vrr.status, vrr.price, vrr.discount_percentage, vrr.discount_amount, vrr.final_price, vrr.is_free,
             vrr.with_film, rt.name, 'radiology' AS type, v.visit_number,
             vrr.requested_at, vrr.performed_at, v.created_at AS visit_created_at, COALESCE(vrr.requested_at, v.created_at) AS created_at,
             ft.refund_reason, ft.created_at AS refunded_at, ft.payment_method AS refund_payment_method
      FROM visit_radiology_requests vrr
      JOIN visits v ON v.id = vrr.visit_id
      JOIN radiology_tests rt ON rt.id = vrr.radiology_test_id
      LEFT JOIN financial_transactions ft
        ON ft.visit_id = vrr.visit_id
        AND ft.is_refund = 1
        AND (ft.category = 'radiology' OR ft.category = 'refund' OR ft.category = 'external_radiology')
        AND (ft.description LIKE CONCAT('%', rt.name, '%') OR (COALESCE(vrr.final_price, vrr.price) > 0 AND ft.amount = COALESCE(vrr.final_price, vrr.price)) OR ft.description LIKE '%استرداد%')
      WHERE v.patient_id = ? AND vrr.status IN ('paid', 'in_progress', 'result_uploaded', 'completed', 'refunded')
    `, [id]);

    const [historyClin] = await db.execute(`
      SELECT vcr.id, vcr.visit_id, vcr.status, vcr.price, vcr.discount_percentage, vcr.discount_amount, vcr.final_price, vcr.is_free,
             cs.name, 'clinical' AS type, v.visit_number,
             vcr.created_at AS requested_at, vcr.performed_at, v.created_at AS visit_created_at, COALESCE(vcr.created_at, v.created_at) AS created_at,
             ft.refund_reason, ft.created_at AS refunded_at, ft.payment_method AS refund_payment_method
      FROM visit_clinical_service_requests vcr
      JOIN visits v ON v.id = vcr.visit_id
      JOIN clinical_services cs ON cs.id = vcr.service_id
      LEFT JOIN financial_transactions ft
        ON ft.visit_id = vcr.visit_id
        AND ft.is_refund = 1
        AND (ft.category = 'clinical' OR ft.category = 'refund')
        AND (ft.description LIKE CONCAT('%', cs.name, '%') OR (COALESCE(vcr.final_price, vcr.price) > 0 AND ft.amount = COALESCE(vcr.final_price, vcr.price)) OR ft.description LIKE '%استرداد%')
      WHERE v.patient_id = ? AND vcr.status IN ('paid', 'completed', 'refunded')
    `, [id]);

    const serviceHistory = [...(historyLab || []), ...(historyRad || []), ...(historyClin || [])].sort((a,b) => new Date(b.requested_at || b.created_at) - new Date(a.requested_at || a.created_at));

    // Query C: Surgeries
    const [surgeries] = await db.execute(`
      SELECT s.id AS surgery_id, s.surgery_type, s.full_price, s.discount_amount, s.status, s.scheduled_date, s.created_at,
             COALESCE((SELECT SUM(amount) FROM surgery_payments WHERE surgery_id = s.id), 0) AS paid_amount,
             (s.full_price - s.discount_amount - COALESCE((SELECT SUM(amount) FROM surgery_payments WHERE surgery_id = s.id), 0)) AS remaining_amount,
             COALESCE(
               (SELECT MAX(payment_date) FROM surgery_payments WHERE surgery_id = s.id),
               (SELECT MAX(created_at) FROM financial_transactions WHERE surgery_id = s.id AND type = 'income')
             ) AS last_payment_date,
             s.visit_id
      FROM surgeries s
      WHERE s.patient_id = ?
      ORDER BY s.created_at DESC
    `, [id]);

    res.json({ patient, transactions: transactions || [], visits: visits || [], suspendedServices, pendingServices, serviceHistory, surgeries: surgeries || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ' });
  }
};


// ═══════════════════════════════════════════════════════════════════
// GET /api/cashier/board/today — جلب لوحة العمليات المالية لليوم
// ═══════════════════════════════════════════════════════════════════
exports.getDailyBoard = async (req, res) => {
  try {
    // 1. Lab Services today
    const [lab] = await db.execute(`
      SELECT vlr.id, vlr.status, vlr.price, vlr.requested_at AS created_at,
             lt.name AS service_name, p.full_name AS patient_name, p.id AS patient_id, 'lab' AS department
      FROM visit_lab_requests vlr
      JOIN lab_tests lt ON lt.id = vlr.lab_test_id
      JOIN visits v ON v.id = vlr.visit_id
      JOIN patients p ON p.id = v.patient_id
      WHERE DATE(vlr.requested_at) = CURDATE() AND vlr.status != 'cancelled'
      ORDER BY vlr.requested_at DESC
    `);

    // 2. Radiology Services today
    const [rad] = await db.execute(`
      SELECT vrr.id, vrr.status, vrr.price, vrr.requested_at AS created_at,
             rt.name AS service_name, p.full_name AS patient_name, p.id AS patient_id, 'radiology' AS department
      FROM visit_radiology_requests vrr
      JOIN radiology_tests rt ON rt.id = vrr.radiology_test_id
      JOIN visits v ON v.id = vrr.visit_id
      JOIN patients p ON p.id = v.patient_id
      WHERE DATE(vrr.requested_at) = CURDATE() AND vrr.status != 'cancelled'
      ORDER BY vrr.requested_at DESC
    `);

    // 3. Surgeries today
    const [surg] = await db.execute(`
      SELECT s.id, s.status, s.full_price AS price, s.created_at,
             s.surgery_type AS service_name, p.full_name AS patient_name, p.id AS patient_id, 'surgery' AS department
      FROM surgeries s
      JOIN patients p ON p.id = s.patient_id
      WHERE DATE(s.created_at) = CURDATE() OR DATE(s.scheduled_date) = CURDATE()
      ORDER BY s.created_at DESC
    `);

    const services = [...(lab || []), ...(rad || []), ...(surg || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(services);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في جلب بيانات اللوحة' });
  }
};




// ═══════════════════════════════════════════════════════════════════
// PUT /api/cashier/visit/:id/suspend-services  — إلغاء/تعليق الخدمات غير المدفوعة ونقل للأرشيف
// ═══════════════════════════════════════════════════════════════════
exports.suspendServices = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id: visitId } = req.params;
    
    // Cancel unpaid lab requests
    await conn.execute(`UPDATE visit_lab_requests SET status='cancelled' WHERE visit_id=? AND status='pending_payment'`, [visitId]);
    
    // Cancel unpaid radiology requests
    await conn.execute(`UPDATE visit_radiology_requests SET status='cancelled' WHERE visit_id=? AND status='pending_payment'`, [visitId]);
    
    // Update visit status to completed so it goes to archive
    await conn.execute(`UPDATE visits SET status='completed' WHERE id=? AND status IN ('awaiting_service_payment', 'completed_admin_pending_services')`, [visitId]);
    
    await conn.commit();
    
    const io = req.app.get('io');
    if (io) io.to('cashier').emit('cashier:update');
    
    res.json({ message: 'تم تعليق/إلغاء الطلبات وانتقل الملف للأرشيف' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};


// ═══════════════════════════════════════════════════════════════════
// PUT /api/cashier/service/:type/:id/reactivate-and-pay
// ═══════════════════════════════════════════════════════════════════
exports.reactivateAndPayService = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { type, id } = req.params;
    const { payment_method, paymentMethod } = req.body || {};
    const selectedPaymentMethod = payment_method || paymentMethod || 'cash';
    let price = 0;
    let visitId = null;
    let desc = '';

    if (type === 'lab') {
      const [[reqRow]] = await conn.execute(`SELECT lr.price, lr.visit_id, t.name FROM visit_lab_requests lr JOIN lab_tests t ON t.id=lr.lab_test_id WHERE lr.id=?`, [id]);
      if (!reqRow) throw new Error('Service not found');
      price = reqRow.price;
      visitId = reqRow.visit_id;
      desc = `سداد وتفعيل تحليل (سابق): ${reqRow.name}`;
      await conn.execute(`UPDATE visit_lab_requests SET status='paid' WHERE id=?`, [id]);
    } else if (type === 'radiology') {
      const [[reqRow]] = await conn.execute(`
        SELECT rr.*, t.name, t.price_with_film, t.price_without_film 
        FROM visit_radiology_requests rr 
        JOIN radiology_tests t ON t.id=rr.radiology_test_id 
        WHERE rr.id=?
      `, [id]);
      if (!reqRow) throw new Error('Service not found');

      const isWithFilm = (req.body && req.body.withFilm !== undefined)
        ? Boolean(req.body.withFilm)
        : (reqRow.with_film !== 0);

      const basePrice = parseFloat(isWithFilm ? (reqRow.price_with_film || reqRow.price) : (reqRow.price_without_film || reqRow.price)) || 0;
      let newFinalPrice = basePrice;
      let newDiscountAmount = 0;

      if (Number(reqRow.is_free) === 1) {
        newFinalPrice = 0;
        newDiscountAmount = basePrice;
      } else if (parseFloat(reqRow.discount_percentage) > 0) {
        const pct = Math.min(100, Math.max(0, parseFloat(reqRow.discount_percentage)));
        newDiscountAmount = (basePrice * pct) / 100;
        newFinalPrice = Math.max(0, basePrice - newDiscountAmount);
      } else if (parseFloat(reqRow.discount_amount) > 0) {
        newDiscountAmount = Math.min(basePrice, parseFloat(reqRow.discount_amount));
        newFinalPrice = Math.max(0, basePrice - newDiscountAmount);
      }

      price = newFinalPrice;
      visitId = reqRow.visit_id;
      desc = `سداد وتفعيل أشعة (سابق): ${reqRow.name}${isWithFilm ? '' : ' (بدون فيلم)'}`;
      await conn.execute(
        `UPDATE visit_radiology_requests SET status='paid', with_film=?, price=?, discount_amount=?, final_price=? WHERE id=?`,
        [isWithFilm ? 1 : 0, basePrice, newDiscountAmount, newFinalPrice, id]
      );
    } else if (type === 'clinical') {
      const [[reqRow]] = await conn.execute(`SELECT cr.price, cr.final_price, cr.visit_id, cs.name FROM visit_clinical_service_requests cr JOIN clinical_services cs ON cs.id=cr.service_id WHERE cr.id=?`, [id]);
      if (!reqRow) throw new Error('Service not found');
      price = reqRow.final_price || reqRow.price;
      visitId = reqRow.visit_id;
      desc = `سداد وتفعيل خدمة سريرية (سابق): ${reqRow.name}`;
      await conn.execute(`UPDATE visit_clinical_service_requests SET status='paid' WHERE id=?`, [id]);
    } else {
      throw new Error('Invalid type');
    }

    await recordTransaction(conn, {
      type: 'income', category: 'services',
      amount: price, visitId: visitId,
      description: desc, userId: req.user.id,
      paymentMethod: selectedPaymentMethod
    });

    await conn.commit();
    const io = req.app.get('io');
    if (io) {
      io.to('cashier').emit('cashier:update');
      if (type === 'lab') io.to('lab').emit('lab:update');
      if (type === 'radiology') io.to('radiology').emit('radiology:updated');
      if (type === 'clinical') io.to('doctor').emit('patient:updated', { visitId });
    }
    res.json({ message: 'تم السداد وإعادة تفعيل الخدمة بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: err.message || 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};







exports.getSurgerySuppliesCost = async (req, res) => {
  const { id: surgeryId } = req.params;
  try {
    const [[surgery]] = await db.execute('SELECT patient_id FROM surgeries WHERE id = ?', [surgeryId]);
    if (!surgery) return res.status(404).json({ message: 'العملية غير موجودة' });

    const patientId = surgery.patient_id;
    
    // Calculate total cost of consumed items for this surgery/patient
    const [[result]] = await db.execute(
      `SELECT SUM(quantity * unit_price) AS supplies_cost 
       FROM inventory_transactions 
       WHERE item_type = 'or' 
         AND transaction_type = 'out' 
         AND (reference_id = ? OR destination_entity = ? OR reference_id = ? OR destination_entity = ?)`,
      [surgeryId.toString(), surgeryId.toString(), patientId.toString(), patientId.toString()]
    );

    res.json({ supplies_cost: result.supplies_cost || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'حدث خطأ أثناء جلب تكلفة المستهلكات' });
  }
};

// ===================================================================
// POST /api/cashier/patient/:id/general-refund
// ===================================================================
exports.generalRefund = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const patientId = req.params.id;
    const { amount, reason } = req.body;

    if (!amount || amount <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'مبلغ غير صالح' });
    }
    if (!reason || !reason.trim()) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'سبب الاسترداد مطلوب' });
    }

    const [[incomeTotal]] = await connection.execute(
      `SELECT SUM(ft.amount) AS total_income 
       FROM financial_transactions ft
       LEFT JOIN visits v ON v.id = ft.visit_id
       LEFT JOIN surgeries s ON s.id = ft.surgery_id
       WHERE (ft.patient_id = ? OR v.patient_id = ? OR s.patient_id = ?) AND ft.type = 'income'`,
      [patientId, patientId, patientId]
    );

    const [[refundTotal]] = await connection.execute(
      `SELECT SUM(ft.amount) AS total_refunded 
       FROM financial_transactions ft
       LEFT JOIN visits v ON v.id = ft.visit_id
       LEFT JOIN surgeries s ON s.id = ft.surgery_id
       WHERE (ft.patient_id = ? OR v.patient_id = ? OR s.patient_id = ?) AND ft.is_refund = 1`,
      [patientId, patientId, patientId]
    );

    const totalIncome = parseFloat(incomeTotal.total_income || 0);
    const totalRefunded = parseFloat(refundTotal.total_refunded || 0);
    const maxAllowed = totalIncome - totalRefunded;

    if (parseFloat(amount) > maxAllowed) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'المبلغ المطلوب استرداده يتجاوز الرصيد المتاح للمريض' });
    }

    await connection.execute(
      `INSERT INTO financial_transactions 
       (type, category, amount, description, is_refund, refund_reason, patient_id, performed_by)
       VALUES ('expense', 'refund', ?, ?, 1, ?, ?, ?)`,
      [amount, `استرداد مالي عام: ${reason}`, reason, patientId, req.user.id]
    );

    await connection.commit();

    const io = req.app.get('io');
    if (io) io.to('cashier').emit('cashier:update');

    res.json({ success: true, message: 'تم تنفيذ الاسترداد بنجاح' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ success: false, message: 'خطأ في الاسترداد المالي العام' });
  } finally {
    connection.release();
  }
};
