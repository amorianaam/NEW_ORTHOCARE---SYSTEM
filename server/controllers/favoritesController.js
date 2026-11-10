const db = require('../database/db');

// --- MEDICATION FAVORITES ---

// GET /api/doctor/favorites/medications
exports.getFavoriteMeds = async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM doctor_favorite_meds WHERE doctor_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// POST /api/doctor/favorites/medications
exports.addFavoriteMed = async (req, res) => {
  try {
    const { medicationName, dosage, frequency, duration, instructions } = req.body;
    if (!medicationName) return res.status(400).json({ message: 'اسم الدواء مطلوب' });

    await db.execute(
      `INSERT INTO doctor_favorite_meds (doctor_id, medication_name, dosage, frequency, duration, instructions) 
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE dosage = VALUES(dosage), frequency = VALUES(frequency), duration = VALUES(duration), instructions = VALUES(instructions)`,
      [req.user.id, medicationName.trim(), dosage || '', frequency || '', duration || '', instructions || '']
    );

    res.json({ message: 'تمت الإضافة للمفضلة بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// DELETE /api/doctor/favorites/medications/:id
exports.deleteFavoriteMed = async (req, res) => {
  try {
    await db.execute(
      'DELETE FROM doctor_favorite_meds WHERE id = ? AND doctor_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'تم الحذف من المفضلة' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// --- PREFERRED DOSAGES ---

// GET /api/doctor/favorites/medications/preferred-dosages
exports.getPreferredDosages = async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT DISTINCT dosage, duration, instructions FROM doctor_preferred_dosages WHERE doctor_id = ?',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// POST /api/doctor/favorites/medications/preferred-dosages
exports.addPreferredDosage = async (req, res) => {
  try {
    const { medicationName, dosage, duration, instructions } = req.body;
    if (!dosage) return res.status(400).json({ message: 'الجرعة مطلوبة' });

    // Check if it already exists
    const [existing] = await db.execute(
      'SELECT id FROM doctor_preferred_dosages WHERE doctor_id = ? AND dosage = ? AND medication_name = ?',
      [req.user.id, dosage.trim(), medicationName ? medicationName.trim() : '']
    );

    if (existing.length === 0) {
      await db.execute(
        `INSERT INTO doctor_preferred_dosages (doctor_id, medication_name, dosage, duration, instructions) 
         VALUES (?, ?, ?, ?, ?)`,
        [req.user.id, medicationName ? medicationName.trim() : '', dosage.trim(), duration || '', instructions || '']
      );
    }

    res.json({ message: 'تم حفظ الجرعة في المفضلة' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// --- TEST FAVORITES (LAB / RADIOLOGY / CLINICAL) ---

// GET /api/doctor/favorites/tests
exports.getFavoriteTests = async (req, res) => {
  try {
    // Fetch and join with lab_tests, radiology_tests, clinical_services
    const [rows] = await db.execute(
      `SELECT ft.id, ft.test_id, ft.test_type, ft.created_at,
              CASE 
                WHEN ft.test_type = 'lab' THEN lt.name
                WHEN ft.test_type = 'radiology' THEN rt.name
                WHEN ft.test_type = 'clinical' THEN cs.name
              END as name,
              CASE 
                WHEN ft.test_type = 'lab' THEN lt.price
                WHEN ft.test_type = 'radiology' THEN rt.price_with_film
                WHEN ft.test_type = 'clinical' THEN cs.price
              END as price,
              CASE 
                WHEN ft.test_type = 'radiology' THEN rt.price_without_film
                ELSE NULL
              END as price_without_film
       FROM doctor_favorite_tests ft
       LEFT JOIN lab_tests lt ON ft.test_type = 'lab' AND ft.test_id = lt.id
       LEFT JOIN radiology_tests rt ON ft.test_type = 'radiology' AND ft.test_id = rt.id
       LEFT JOIN clinical_services cs ON ft.test_type = 'clinical' AND ft.test_id = cs.id
       WHERE ft.doctor_id = ?
       ORDER BY ft.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// POST /api/doctor/favorites/tests
exports.addFavoriteTest = async (req, res) => {
  try {
    const { testId, testType } = req.body;
    if (!testId || !testType) return res.status(400).json({ message: 'بيانات الفحص غير كاملة' });

    await db.execute(
      `INSERT INTO doctor_favorite_tests (doctor_id, test_id, test_type) 
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP`,
      [req.user.id, testId, testType]
    );

    res.json({ message: 'تمت الإضافة للمفضلة بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// DELETE /api/doctor/favorites/tests/:id
exports.deleteFavoriteTest = async (req, res) => {
  try {
    await db.execute(
      'DELETE FROM doctor_favorite_tests WHERE id = ? AND doctor_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'تم الحذف من المفضلة' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// DELETE /api/doctor/favorites/tests/type/:testType/id/:testId
exports.deleteFavoriteTestByTypeAndId = async (req, res) => {
  try {
    const { testType, testId } = req.params;
    await db.execute(
      'DELETE FROM doctor_favorite_tests WHERE doctor_id = ? AND test_type = ? AND test_id = ?',
      [req.user.id, testType, testId]
    );
    res.json({ message: 'تم الحذف من المفضلة' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};


// --- BUNDLES ---

// GET /api/doctor/favorites/bundles
exports.getFavoriteBundles = async (req, res) => {
  try {
    // Get all bundles for this doctor
    const [bundles] = await db.execute(
      'SELECT * FROM doctor_favorite_bundles WHERE doctor_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );

    const result = [];
    for (const b of bundles) {
      const [items] = await db.execute(
        `SELECT bi.id, bi.test_id, bi.test_type,
                CASE 
                  WHEN bi.test_type = 'lab' THEN lt.name
                  WHEN bi.test_type = 'radiology' THEN rt.name
                  WHEN bi.test_type = 'clinical' THEN cs.name
                END as name,
                CASE 
                  WHEN bi.test_type = 'lab' THEN lt.price
                  WHEN bi.test_type = 'radiology' THEN rt.price_with_film
                  WHEN bi.test_type = 'clinical' THEN cs.price
                END as price,
                CASE 
                  WHEN bi.test_type = 'radiology' THEN rt.price_without_film
                  ELSE NULL
                END as price_without_film
         FROM doctor_favorite_bundle_items bi
         LEFT JOIN lab_tests lt ON bi.test_type = 'lab' AND bi.test_id = lt.id
         LEFT JOIN radiology_tests rt ON bi.test_type = 'radiology' AND bi.test_id = rt.id
         LEFT JOIN clinical_services cs ON bi.test_type = 'clinical' AND bi.test_id = cs.id
         WHERE bi.bundle_id = ?`,
        [b.id]
      );
      result.push({ ...b, items });
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// POST /api/doctor/favorites/bundles
exports.createFavoriteBundle = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { name, items = [] } = req.body;
    if (!name) return res.status(400).json({ message: 'اسم الحزمة مطلوب' });

    // Create bundle
    const [bundleRes] = await conn.execute(
      'INSERT INTO doctor_favorite_bundles (doctor_id, name) VALUES (?, ?)',
      [req.user.id, name.trim()]
    );
    const bundleId = bundleRes.insertId;

    // Add items to bundle
    for (const item of items) {
      await conn.execute(
        'INSERT INTO doctor_favorite_bundle_items (bundle_id, test_id, test_type) VALUES (?, ?, ?)',
        [bundleId, item.test_id, item.test_type]
      );
    }

    await conn.commit();
    res.json({ id: bundleId, message: 'تم إنشاء الحزمة المجمعة بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

// DELETE /api/doctor/favorites/bundles/:id
exports.deleteFavoriteBundle = async (req, res) => {
  try {
    await db.execute(
      'DELETE FROM doctor_favorite_bundles WHERE id = ? AND doctor_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'تم حذف الحزمة المجمعة بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};
