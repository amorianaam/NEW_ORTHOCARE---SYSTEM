const db = require('../database/db');
const { SHIFT_IS_TODAY_SQL } = require('../utils/shiftHelpers');

// GET /api/patients
exports.getAllPatients = async (req, res) => {
  try {
    const { q, name, phone } = req.query;

    let sql = `
      SELECT p.*,
             v.id AS visit_id,
             v.visit_number,
             v.status AS visit_status,
             v.is_follow_up,
             v.is_exempt,
             (CASE WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v.id AND s.status != 'cancelled') OR v.status = 'transferred_to_center' THEN 1 ELSE 0 END) AS is_surgery,
             v.created_at AS last_visit_date,
             (SELECT COUNT(*) FROM visits WHERE patient_id = p.id AND is_follow_up = 1 AND status != 'cancelled') AS reviews_count,
             (SELECT COUNT(*) FROM visits WHERE patient_id = p.id AND is_exempt = 1 AND status != 'cancelled') AS exempts_count,
             (SELECT COUNT(*) FROM visits WHERE patient_id = p.id AND COALESCE(is_exempt,0) = 0 AND COALESCE(is_follow_up,0) = 0 AND status != 'cancelled') AS regular_visits_count,
             (SELECT COUNT(*) FROM surgeries s WHERE s.patient_id = p.id AND s.status != 'cancelled') AS surgeries_count,
             (SELECT COUNT(*) FROM visits WHERE patient_id = p.id AND status != 'cancelled') AS total_visits,
             (SELECT COUNT(*) FROM visits WHERE patient_id = p.id AND ${SHIFT_IS_TODAY_SQL('created_at')} AND status != 'cancelled') AS today_visits_count,
             (
               SELECT GROUP_CONCAT(DISTINCT COALESCE(NULLIF(v_all.visit_number, ''), CAST(v_all.id AS CHAR)) ORDER BY v_all.created_at DESC SEPARATOR ', ')
               FROM visits v_all
               WHERE v_all.patient_id = p.id
             ) AS all_visit_numbers,
             (
               SELECT GROUP_CONCAT(DISTINCT CAST(v_all.id AS CHAR) ORDER BY v_all.created_at DESC SEPARATOR ', ')
               FROM visits v_all
               WHERE v_all.patient_id = p.id
             ) AS all_visit_ids
      FROM patients p
      INNER JOIN (
          SELECT patient_id, MAX(id) as latest_visit_id
          FROM visits v
          WHERE v.status NOT IN ('cancelled', 'registered', 'awaiting_payment')
            AND (
              v.is_exempt = 1
              OR v.is_follow_up = 1
              OR v.status = 'transferred_to_center'
              OR EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v.id AND s.status != 'cancelled')
              OR EXISTS (
                SELECT 1 FROM financial_transactions ft 
                WHERE ft.visit_id = v.id 
                  AND ft.category = 'entry_fee' 
                  AND ft.type = 'income' 
                  AND ft.is_refund = 0
              )
            )
          GROUP BY patient_id
      ) latest ON p.id = latest.patient_id
      JOIN visits v ON latest.latest_visit_id = v.id
    `;
    let params = [];
    if (name) {
      sql += ' WHERE p.full_name LIKE ?';
      params = [`%${name}%`];
    } else if (phone) {
      sql += ' WHERE p.phone LIKE ?';
      params = [`%${phone}%`];
    } else if (q) {
      sql += ' WHERE (p.full_name LIKE ? OR p.phone LIKE ? OR EXISTS (SELECT 1 FROM visits v_search WHERE v_search.patient_id = p.id AND (v_search.visit_number LIKE ? OR CAST(v_search.id AS CHAR) LIKE ?)))';
      params = [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`];
    }
    sql += ' ORDER BY COALESCE(v.created_at, p.created_at) DESC';
    const [rows] = await db.execute(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// POST /api/patients
exports.createPatient = async (req, res) => {
  try {
    const { fullName, age, gender, phone, chronicDiseases, allergies, currentMedications, entity } = req.body;
    if (!fullName) return res.status(400).json({ message: 'الاسم مطلوب' });

    const [result] = await db.execute(
      `INSERT INTO patients (full_name, age, gender, phone, chronic_diseases, allergies, current_medications, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [fullName.trim(), age || null, gender || 'male', phone || null,
       chronicDiseases || null, allergies || null, currentMedications || null, req.user.id]
    );

    const patientId = result.insertId;
    const visitNumber = `V${Date.now()}`;

    await db.execute(
      `INSERT INTO visits (patient_id, visit_number, entity, status, created_by)
       VALUES (?, ?, ?, 'registered', ?)`,
      [patientId, visitNumber, entity || 'clinic', req.user.id]
    );

    const visitId = (await db.execute(`SELECT id FROM visits WHERE visit_number=?`, [visitNumber]))[0][0]?.id;

    // 🔔 Notify cashier: new patient registered (only if entry_fee > 0)
    const io = req.app.get('io');
    if (io) {
      const [[feeSetting]] = await db.execute(`SELECT CAST(setting_value AS DECIMAL(10,2)) as entry_fee FROM settings WHERE setting_key = 'entry_fee' LIMIT 1`);
      const entryFee = feeSetting ? parseFloat(feeSetting.entry_fee) || 0 : 0;

      if (entryFee > 0) {
        io.to('cashier').emit('patient:registered', {
          visitId,
          visitNumber,
          patientName: fullName.trim(),
          entryFee,
          message: `مريض جديد: ${fullName.trim()}`
        });
        io.to('cashier').emit('cashier:update');
      }
      io.to('secretary').emit('secretary:patient_registered', {
        visitId,
        patientName: fullName.trim(),
        visitNumber
      });
    }

    res.status(201).json({ message: 'تم تسجيل المريض بنجاح', patientId, visitNumber });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// GET /api/patients/:id
exports.getPatientById = async (req, res) => {
  try {
    const { id } = req.params;
    const [[patient]] = await db.execute('SELECT * FROM patients WHERE id = ?', [id]);
    if (!patient) return res.status(404).json({ message: 'المريض غير موجود' });
    const [visits] = await db.execute(`
      SELECT v.* FROM visits v 
      WHERE v.patient_id = ? 
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
      ORDER BY v.created_at DESC
    `, [id]);
    res.json({ ...patient, visits });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// PUT /api/patients/:id
exports.updatePatient = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, age, gender, phone, chronicDiseases, allergies, currentMedications } = req.body;
    if (!fullName) return res.status(400).json({ message: 'الاسم مطلوب' });

    await db.execute(
      `UPDATE patients SET full_name=?, age=?, gender=?, phone=?,
       chronic_diseases=?, allergies=?, current_medications=? WHERE id=?`,
      [fullName.trim(), age || null, gender, phone || null,
       chronicDiseases || null, allergies || null, currentMedications || null, id]
    );
    res.json({ message: 'تم تحديث بيانات المريض' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// ── Follow-Up Calculation Engine ───────────────────────────────────
// Calculates free follow-up eligibility based on business rules:
// 1. Regular paid visit: 1 free follow-up review within 7 days.
// 2. Surgery visit: 2 free follow-up reviews within 14 days (2 weeks).
// 3. Exempt (VIP/إعفاء) and follow-up (مراجعة) visits: 0 free follow-ups.
// 4. Any new confirmed anchor visit resets entitlement and drops previous unused opportunities.
// 5. Patient cannot be registered for follow-up if already registered in today's visits list.
async function calculateFollowUpEligibility(patientId) {
  // 1. Find the latest confirmed anchor visit (non-follow-up, confirmed/paid or exempt, non-cancelled)
  const [anchorRows] = await db.execute(`
    SELECT v.*,
           (CASE 
              WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v.id AND s.status != 'cancelled') 
                   OR v.status = 'transferred_to_center' 
              THEN 1 
              ELSE 0 
            END) AS is_surgery
    FROM visits v
    WHERE v.patient_id = ?
      AND COALESCE(v.is_follow_up, 0) = 0
      AND v.status NOT IN ('cancelled', 'registered', 'awaiting_payment')
      AND (
        v.is_exempt = 1
        OR (
          (
            (v.entry_fee IS NOT NULL AND v.entry_fee > 0)
            OR EXISTS (
              SELECT 1 FROM financial_transactions ft 
              WHERE ft.visit_id = v.id 
                AND ft.category = 'entry_fee' 
                AND ft.type = 'income' 
                AND ft.is_refund = 0
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM financial_transactions ft_ref 
            WHERE ft_ref.visit_id = v.id 
              AND ft_ref.category = 'entry_fee' 
              AND (ft_ref.is_refund = 1 OR ft_ref.type = 'expense')
          )
        )
      )
    ORDER BY v.created_at DESC, v.id DESC
    LIMIT 1
  `, [patientId]);

  if (!anchorRows || anchorRows.length === 0) {
    return {
      eligible: false,
      remainingCount: 0,
      maxAllowed: 0,
      daysPassed: 0,
      maxDays: 0,
      visitType: 'none',
      anchorVisit: null,
      reason: 'لا توجد زيارة سابقة مسجلة ومؤكدة للمريض'
    };
  }

  const anchorVisit = anchorRows[0];
  const isSurgery = Boolean(anchorVisit.is_surgery === 1 || anchorVisit.is_surgery === true);
  const isExempt = Boolean(anchorVisit.is_exempt === 1 || anchorVisit.is_exempt === true);

  // 2. Check if patient is already registered today in an active visit
  const [[todayCheck]] = await db.execute(
    `SELECT COUNT(*) as count 
     FROM visits 
     WHERE patient_id = ? 
       AND ${SHIFT_IS_TODAY_SQL('created_at')}
       AND status != 'cancelled'
       AND (visit_number IS NULL OR visit_number NOT LIKE 'EXT-%')`,
    [patientId]
  );
  const todayCount = parseInt(todayCheck?.count || 0, 10);
  if (todayCount > 0) {
    return {
      eligible: false,
      remainingCount: 0,
      maxAllowed: isSurgery ? 2 : (isExempt ? 0 : 1),
      daysPassed: 0,
      maxDays: isSurgery ? 14 : 7,
      visitType: isExempt ? 'exempt' : (isSurgery ? 'surgery' : 'regular'),
      anchorVisit,
      reason: 'المريض مسجل بالفعل في قائمة زيارات اليوم'
    };
  }

  // 3. Exempt visits do not grant any free follow-ups
  if (isExempt) {
    return {
      eligible: false,
      remainingCount: 0,
      maxAllowed: 0,
      daysPassed: 0,
      maxDays: 0,
      visitType: 'exempt',
      anchorVisit,
      reason: 'حالات الإعفاء لا تمنح مراجعات مجانية'
    };
  }

  // 4. Define limits based on visit type
  const maxAllowed = isSurgery ? 2 : 1;
  const maxDays = isSurgery ? 14 : 7;
  const visitType = isSurgery ? 'surgery' : 'regular';

  // 5. Time window check
  const anchorDate = new Date(anchorVisit.created_at);
  const diffMs = Math.max(0, Date.now() - anchorDate.getTime());
  const daysPassed = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (daysPassed > maxDays) {
    return {
      eligible: false,
      remainingCount: 0,
      maxAllowed,
      daysPassed,
      maxDays,
      visitType,
      anchorVisit,
      reason: isSurgery
        ? `تجاوزت العملية المهلة المحددة للمراجعات المجانية (14 يوماً) - مضى عليها ${daysPassed} يوم`
        : `تجاوزت الزيارة المهلة المحددة للمراجعة المجانية (7 أيام) - مضى عليها ${daysPassed} يوم`
    };
  }

  // 6. Count subsequent follow-up visits recorded after this anchor visit
  const [[followUpRows]] = await db.execute(
    `SELECT COUNT(*) as count 
     FROM visits 
     WHERE patient_id = ? 
       AND is_follow_up = 1 
       AND status != 'cancelled'
       AND (id > ? OR created_at > ?)`,
    [patientId, anchorVisit.id, anchorVisit.created_at]
  );
  const usedCount = parseInt(followUpRows?.count || 0, 10);
  const remainingCount = Math.max(0, maxAllowed - usedCount);

  if (remainingCount <= 0) {
    return {
      eligible: false,
      remainingCount: 0,
      maxAllowed,
      usedCount,
      daysPassed,
      maxDays,
      visitType,
      anchorVisit,
      reason: isSurgery
        ? 'تم استهلاك جميع المراجعات المجانية المسموحة للعملية (مراجعتين)'
        : 'تم استهلاك المراجعة المجانية المستحقة لهذه الزيارة'
    };
  }

  return {
    eligible: true,
    remainingCount,
    maxAllowed,
    usedCount,
    daysPassed,
    maxDays,
    visitType,
    anchorVisit,
    reason: null
  };
}

// POST /api/patients/follow-up - Send returning patient directly to waiting queue
exports.createFollowUp = async (req, res) => {
  try {
    const { patientId } = req.body;
    if (!patientId) return res.status(400).json({ message: 'معرّف المريض مطلوب' });

    const [[patient]] = await db.execute('SELECT * FROM patients WHERE id = ?', [patientId]);
    if (!patient) return res.status(404).json({ message: 'المريض غير موجود' });

    // ── Guard: Check Follow-Up Eligibility ──
    const eligibility = await calculateFollowUpEligibility(patientId);
    if (!eligibility.eligible) {
      return res.status(400).json({ 
        message: eligibility.reason || 'المريض غير مستحق لمراجعة مجانية',
        eligibility 
      });
    }

    const visitNumber = `FU${Date.now()}`;
    await db.execute(
      `INSERT INTO visits (patient_id, visit_number, entity, status, is_follow_up, entry_fee, created_by)
       VALUES (?, ?, 'clinic', 'waiting', true, 0, ?)`,
      [patientId, visitNumber, req.user.id]
    );

    const [patientRows] = await db.execute(`SELECT full_name as patientName FROM patients WHERE id=?`, [patientId]);
    const patientName = patientRows.length > 0 ? patientRows[0].patientName : 'مريض';

    const io = req.app.get('io');
    if (io) {
       io.to('doctor').emit('patient:waiting', { message: 'متابعة جديدة في الانتظار', patientName });
       // Follow-up patients have entry_fee = 0 and go directly to doctor queue; cashier is not notified.
       io.to('secretary').emit('secretary:update');
    }

    res.status(201).json({ 
      message: 'تم إرسال المريض إلى قائمة الانتظار بنجاح', 
      visitNumber,
      remainingCount: Math.max(0, eligibility.remainingCount - 1)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// GET /api/patients/:id/follow-up-eligibility — Check patient's free follow-up eligibility
exports.getFollowUpEligibility = async (req, res) => {
  try {
    const { id } = req.params;
    const eligibility = await calculateFollowUpEligibility(id);
    res.json(eligibility);
  } catch (err) {
    console.error('getFollowUpEligibility error:', err);
    res.status(500).json({ message: 'خطأ في الخادم أثناء فحص استحقاق المراجعة' });
  }
};

exports.calculateFollowUpEligibility = calculateFollowUpEligibility;

// POST /api/patients/:id/visits — Paid revisit for an existing patient (goes to Cashier first)
exports.createExistingPatientVisit = async (req, res) => {
  try {
    const { id } = req.params;
    const { entity } = req.body;

    // 1. Validate patient exists
    const [[patient]] = await db.execute('SELECT id, full_name FROM patients WHERE id = ?', [id]);
    if (!patient) return res.status(404).json({ message: 'المريض غير موجود' });

    // 2. Insert new PAID visit (is_follow_up=false, status='registered' → goes to Cashier)
    const visitNumber = `PR${Date.now()}`;
    await db.execute(
      `INSERT INTO visits (patient_id, visit_number, entity, status, is_follow_up, created_by)
       VALUES (?, ?, ?, 'registered', false, ?)`,
      [patient.id, visitNumber, entity || 'clinic', req.user.id]
    );

    // 3. Fetch newly created visit with patient demographics for socket payload
    const [[visit]] = await db.execute(
      `SELECT v.*, p.full_name, p.age, p.gender, p.phone
       FROM visits v
       JOIN patients p ON p.id = v.patient_id
       WHERE v.visit_number = ?`,
      [visitNumber]
    );

    // 4. Emit Socket.io events identical to createPatient (Deep Hydration)
    const io = req.app.get('io');
    if (io) {
      const [[feeSetting]] = await db.execute(`SELECT CAST(setting_value AS DECIMAL(10,2)) as entry_fee FROM settings WHERE setting_key = 'entry_fee' LIMIT 1`);
      const entryFee = feeSetting ? parseFloat(feeSetting.entry_fee) || 0 : 0;

      if (entryFee > 0) {
        io.to('cashier').emit('patient:registered', {
          visitId: visit?.id,
          visitNumber,
          patientName: patient.full_name,
          entryFee,
          message: `زيارة جديدة: ${patient.full_name}`
        });
        io.to('cashier').emit('cashier:update');
      }
      io.to('secretary').emit('secretary:update');
    }

    // 5. Return success
    res.status(201).json({ message: 'تم تسجيل الزيارة بنجاح', visit });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// GET /api/patients/visits/today — All visits created today with their status
exports.getTodayVisits = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT v.*, p.full_name, p.age, p.gender, p.phone,
             (${SHIFT_IS_TODAY_SQL('v.created_at')}) AS is_today,
             (SELECT COUNT(*) FROM visits v2 WHERE v2.patient_id = p.id AND v2.status != 'cancelled') AS total_visits,
             (
               SELECT GROUP_CONCAT(DISTINCT COALESCE(NULLIF(v_all.visit_number, ''), CAST(v_all.id AS CHAR)) ORDER BY v_all.created_at DESC SEPARATOR ', ')
               FROM visits v_all
               WHERE v_all.patient_id = p.id AND v_all.status != 'cancelled'
             ) AS all_visit_numbers,
             CASE
               -- P1: Visit is cancelled -> terminal state
               WHEN v.status = 'cancelled'
                 THEN 'financial_cancelled'
               
               -- P2: Entry fee not paid yet (non-exempt, non-follow-up)
               WHEN COALESCE(v.is_exempt, 0) = 0
                 AND COALESCE(v.is_follow_up, 0) = 0
                 AND (v.entry_fee IS NULL OR v.entry_fee = 0)
                 AND NOT EXISTS (
                   SELECT 1 FROM financial_transactions ft
                   WHERE ft.visit_id = v.id
                     AND ft.category = 'entry_fee'
                     AND ft.type = 'income'
                     AND ft.is_refund = 0
                 )
                 THEN 'pending_entry_fee'
               
               -- P3: Has unpaid medical services (lab/rad/clinical pending_payment)
               WHEN EXISTS (
                   SELECT 1 FROM visit_lab_requests WHERE visit_id = v.id AND status = 'pending_payment'
                 ) OR EXISTS (
                   SELECT 1 FROM visit_radiology_requests WHERE visit_id = v.id AND status = 'pending_payment'
                 ) OR EXISTS (
                   SELECT 1 FROM visit_clinical_service_requests WHERE visit_id = v.id AND status = 'pending_payment'
                 )
                 THEN 'pending_services_payment'
               
               -- P4: Has unpaid surgery installment
               WHEN EXISTS (
                   SELECT 1 FROM surgeries s
                   WHERE s.visit_id = v.id
                     AND s.status != 'cancelled'
                     AND s.full_price > 0
                     AND (s.full_price - s.discount_amount - COALESCE(
                       (SELECT SUM(sp.amount) FROM surgery_payments sp WHERE sp.surgery_id = s.id), 0
                     )) > 0.01
                 )
                 THEN 'pending_surgery_payment'
               
                              -- P5a: Lab or Radiology is ACTIVELY being executed
                WHEN EXISTS (
                    SELECT 1 FROM visit_lab_requests WHERE visit_id = v.id AND status IN ('in_progress','result_uploaded')
                  )
                  OR EXISTS (
                    SELECT 1 FROM visit_radiology_requests WHERE visit_id = v.id AND status IN ('in_progress','result_uploaded')
                  )
                  THEN 'in_execution'

                -- P5b: Paid but lab/radiology NOT yet started
                WHEN v.status IN ('awaiting_lab', 'awaiting_radiology')
                  OR EXISTS (
                    SELECT 1 FROM visit_lab_requests WHERE visit_id = v.id AND status = 'paid'
                  )
                  OR EXISTS (
                    SELECT 1 FROM visit_radiology_requests WHERE visit_id = v.id AND status = 'paid'
                  )
                  THEN 'pending_execution'
               
               -- P6: Visit fully completed (closed by doctor)
               WHEN v.status = 'completed'
                 THEN 'examination_done'
               
               -- P7: Default - registered, waiting, with_doctor, no pending financial issues
               ELSE 'ready_for_examination'
             END AS financial_status
      FROM visits v
      JOIN patients p ON p.id = v.patient_id
      WHERE (v.visit_number IS NULL OR v.visit_number NOT LIKE 'EXT-%')
        AND (
          (${SHIFT_IS_TODAY_SQL('v.created_at')})
          OR (
            v.status != 'cancelled' AND (
              -- 1. Unpaid Entry Fee
              (
                COALESCE(v.is_exempt, 0) = 0 
                AND COALESCE(v.is_follow_up, 0) = 0 
                AND (v.entry_fee IS NULL OR v.entry_fee = 0)
                AND NOT EXISTS (
                  SELECT 1 FROM financial_transactions ft 
                  WHERE ft.visit_id = v.id 
                    AND ft.category = 'entry_fee' 
                    AND ft.type = 'income' 
                    AND ft.is_refund = 0
                )
              )
              -- 2. Unpaid Medical Services (Labs, Radiology, Clinical Services)
              OR EXISTS (
                SELECT 1 FROM visit_lab_requests lr 
                WHERE lr.visit_id = v.id AND lr.status IN ('pending_payment', 'paid', 'in_progress', 'result_uploaded')
              )
              OR EXISTS (
                SELECT 1 FROM visit_radiology_requests rr 
                WHERE rr.visit_id = v.id AND rr.status IN ('pending_payment', 'paid', 'in_progress', 'result_uploaded')
              )
              OR EXISTS (
                SELECT 1 FROM visit_clinical_service_requests cr 
                WHERE cr.visit_id = v.id AND cr.status IN ('pending_payment', 'paid', 'in_progress', 'result_uploaded')
              )
              -- 3. Unpaid or Partially Paid Surgeries
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
      ORDER BY v.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'حدث خطأ في الخادم' });
  }
};

// GET /api/search
exports.search = async (req, res) => {
  try {
    const { q } = req.query;
    const isStoreRole = req.user?.role === 'general_store' || req.user?.role === 'or_store';
    if (!q || (q.trim().length < 2 && !isStoreRole)) return res.json([]);
    const searchQuery = `%${q.trim()}%`;
    
    // Inventory-scoped search ONLY — no patient tables
    if (isStoreRole) {
      const isOrStore = req.user.role === 'or_store';
      const cleanQ = q.trim();
      const numQ = parseInt(cleanQ, 10);

      // ── Dynamic Item Table: or_inventory_items vs general_inventory_items ──
      const itemTable = isOrStore ? 'or_inventory_items' : 'general_inventory_items';
      const pItems = db.query(`
        SELECT
          id as item_id,
          name as full_name,
          unit as category,
          quantity,
          unit,
          'inventory_item' as result_type
        FROM ${itemTable}
        WHERE is_active = 1 AND (name LIKE ? OR unit LIKE ?)
        LIMIT 10
      `, [searchQuery, searchQuery]);

      // ── Dynamic Session Tables: UNION ALL of drafts + completed ──
      let pSessions;
      if (isOrStore) {
        pSessions = db.query(`
          SELECT CONCAT('DRAFT-', id) as session_id, 'draft' as status, created_at,
                 'stocktaking_session' as result_type
          FROM or_inventory_stocktaking_drafts
          WHERE ${isNaN(numQ) ? '0=1' : 'id = ?'}

          UNION ALL

          SELECT CAST(id AS CHAR) as session_id, 'completed' as status, created_at,
                 'stocktaking_session' as result_type
          FROM or_inventory_stocktaking
          WHERE ${isNaN(numQ) ? '0=1' : 'id = ?'}
          LIMIT 5
        `, isNaN(numQ) ? [] : [numQ, numQ]);
      } else {
        pSessions = db.query(`
          SELECT CONCAT('DRAFT-', id) as session_id, 'draft' as status, created_at,
                 'stocktaking_session' as result_type
          FROM inventory_stocktaking_drafts
          WHERE store_type = 'general' AND ${isNaN(numQ) ? '0=1' : 'id = ?'}

          UNION ALL

          SELECT CAST(id AS CHAR) as session_id, 'completed' as status, created_at,
                 'stocktaking_session' as result_type
          FROM inventory_stocktaking
          WHERE store_type = 'general' AND ${isNaN(numQ) ? '0=1' : 'id = ?'}
          LIMIT 5
        `, isNaN(numQ) ? [] : [numQ, numQ]);
      }

      const [[items], [sessions]] = await Promise.all([pItems, pSessions]);
      return res.json([...sessions, ...items]);
    }
    
    let queryStr = `
      SELECT p.id as patient_id, p.full_name, p.phone, p.age, v.id as visitId, v.visit_number, v.status, DATE(v.created_at) as visit_date,
      COUNT(DISTINCT vrr.id) as radiology_count,
      COUNT(DISTINCT vlr.id) as lab_count
      FROM patients p
      LEFT JOIN visits v ON p.id = v.patient_id
      LEFT JOIN visit_radiology_requests vrr ON v.id = vrr.visit_id
      LEFT JOIN visit_lab_requests vlr ON v.id = vlr.visit_id
    `;
    let queryParams = [];

    if (req.user?.role === 'lab' || req.user?.role === 'radiology') {
      queryStr += ` WHERE (p.full_name LIKE ? OR v.visit_number LIKE ?)`;
      queryParams = [searchQuery, searchQuery];
    } else {
      queryStr += ` WHERE (p.full_name LIKE ? OR p.phone LIKE ? OR p.id LIKE ? OR v.visit_number LIKE ?)`;
      queryParams = [searchQuery, searchQuery, searchQuery, searchQuery];
    }

    queryStr += ` AND (v.status IS NULL OR v.status NOT IN ('cancelled', 'awaiting_payment'))`;
    queryStr += ` GROUP BY p.id, v.id`;

    if (req.user?.role === 'radiology') {
      queryStr += ` HAVING radiology_count > 0`;
    } else if (req.user?.role === 'lab') {
      queryStr += ` HAVING lab_count > 0`;
    }

    queryStr += ` ORDER BY v.created_at DESC LIMIT 10`;

    const [rows] = await db.query(queryStr, queryParams);
    res.json(rows);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
};
