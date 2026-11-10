const db = require('../database/db');

// ── Medications ───────────────────────────────────────────────────

exports.getMedications = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM medications WHERE is_deleted = 0 ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب الأدوية', error: err.message });
  }
};

exports.createMedication = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'اسم الدواء مطلوب' });

    const [existing] = await db.execute('SELECT * FROM medications WHERE name = ?', [name]);
    if (existing.length > 0) {
      if (existing[0].is_deleted) {
        await db.execute('UPDATE medications SET is_deleted = 0, is_active = 1 WHERE id = ?', [existing[0].id]);
        return res.json({ message: 'تم إضافة الدواء بنجاح', id: existing[0].id });
      } else {
        return res.status(400).json({ message: 'الدواء موجود مسبقاً' });
      }
    }

    const [result] = await db.execute('INSERT INTO medications (name) VALUES (?)', [name]);
    res.json({ message: 'تم إضافة الدواء', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'الدواء موجود مسبقاً' });
    res.status(500).json({ message: 'خطأ في إضافة الدواء', error: err.message });
  }
};

exports.updateMedication = async (req, res) => {
  try {
    const { name, is_active } = req.body;
    const { id } = req.params;
    await db.execute('UPDATE medications SET name = ?, is_active = ? WHERE id = ?', [name, is_active, id]);
    res.json({ message: 'تم تحديث الدواء' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'الاسم موجود مسبقاً' });
    res.status(500).json({ message: 'خطأ في تحديث الدواء', error: err.message });
  }
};


// ── Clinical Categories ───────────────────────────────────────────

exports.getClinicalCategories = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM clinical_categories WHERE is_deleted = 0 ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب الفئات', error: err.message });
  }
};

exports.createClinicalCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'اسم الفئة مطلوب' });

    const [existing] = await db.execute('SELECT * FROM clinical_categories WHERE name = ?', [name]);
    if (existing.length > 0) {
      if (existing[0].is_deleted) {
        await db.execute('UPDATE clinical_categories SET is_deleted = 0 WHERE id = ?', [existing[0].id]);
        return res.json({ message: 'تم إضافة الفئة بنجاح', id: existing[0].id });
      } else {
        return res.status(400).json({ message: 'الفئة موجودة مسبقاً' });
      }
    }

    const [result] = await db.execute('INSERT INTO clinical_categories (name) VALUES (?)', [name]);
    res.json({ message: 'تم إضافة الفئة', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'الفئة موجودة مسبقاً' });
    res.status(500).json({ message: 'خطأ في إضافة الفئة', error: err.message });
  }
};

exports.updateClinicalCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const { id } = req.params;
    await db.execute('UPDATE clinical_categories SET name = ? WHERE id = ?', [name, id]);
    res.json({ message: 'تم تحديث الفئة' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'الاسم موجود مسبقاً' });
    res.status(500).json({ message: 'خطأ في تحديث الفئة', error: err.message });
  }
};


// ── Clinical Services ─────────────────────────────────────────────

exports.getClinicalServices = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT s.*, c.name as category_name
      FROM clinical_services s
      LEFT JOIN clinical_categories c ON s.category_id = c.id
      WHERE s.is_deleted = 0
      ORDER BY c.name ASC, s.name ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب الخدمات', error: err.message });
  }
};

exports.createClinicalService = async (req, res) => {
  try {
    const { category_id, name, price } = req.body;
    if (!name || price === undefined) return res.status(400).json({ message: 'الاسم والسعر مطلوبان' });
    
    let catId = null;
    if (category_id !== undefined && category_id !== null && category_id !== '' && category_id !== 'null' && category_id !== 'undefined') {
      catId = parseInt(category_id, 10);
      if (isNaN(catId)) catId = null;
    }

    const [existing] = await db.execute('SELECT * FROM clinical_services WHERE name = ?', [name]);
    if (existing.length > 0) {
      if (existing[0].is_deleted) {
        await db.execute(
          'UPDATE clinical_services SET category_id = ?, price = ?, is_deleted = 0, is_active = 1 WHERE id = ?',
          [catId, price, existing[0].id]
        );
        return res.json({ message: 'تم إضافة الخدمة بنجاح', id: existing[0].id });
      } else {
        return res.status(400).json({ message: 'الخدمة موجودة مسبقاً' });
      }
    }

    const [result] = await db.execute(
      'INSERT INTO clinical_services (category_id, name, price) VALUES (?, ?, ?)',
      [catId, name, price]
    );
    res.json({ message: 'تم إضافة الخدمة السريرية', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'الخدمة موجودة مسبقاً' });
    res.status(500).json({ message: 'خطأ في إضافة الخدمة', error: err.message });
  }
};

exports.updateClinicalService = async (req, res) => {
  try {
    const { category_id, name, price, is_active } = req.body;
    const { id } = req.params;
    
    let catId = null;
    if (category_id !== undefined && category_id !== null && category_id !== '' && category_id !== 'null' && category_id !== 'undefined') {
      catId = parseInt(category_id, 10);
      if (isNaN(catId)) catId = null;
    }

    await db.execute(
      'UPDATE clinical_services SET category_id = ?, name = ?, price = ?, is_active = ? WHERE id = ?',
      [catId, name, price, is_active, id]
    );
    res.json({ message: 'تم تحديث الخدمة السريرية' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'الاسم موجود مسبقاً' });
    res.status(500).json({ message: 'خطأ في تحديث الخدمة', error: err.message });
  }
};


// ── Surgery Prep Packages ─────────────────────────────────────────

exports.getSurgeryPrepPackages = async (req, res) => {
  try {
    const [packages] = await db.execute('SELECT * FROM surgery_prep_packages WHERE is_deleted = 0 ORDER BY name ASC');
    const [items] = await db.execute(`
      SELECT p.*, 
        CASE WHEN p.item_type = 'lab' THEN l.name ELSE r.name END as item_name
      FROM surgery_prep_items p
      LEFT JOIN lab_tests l ON p.item_id = l.id AND p.item_type = 'lab'
      LEFT JOIN radiology_tests r ON p.item_id = r.id AND p.item_type = 'radiology'
      WHERE (p.item_type = 'lab' AND (l.is_deleted IS NULL OR l.is_deleted = 0))
         OR (p.item_type = 'radiology' AND (r.is_deleted IS NULL OR r.is_deleted = 0))
    `);
    
    // Attach items to packages
    const result = packages.map(pkg => {
      pkg.items = items.filter(i => i.package_id === pkg.id);
      return pkg;
    });
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب الباقات', error: err.message });
  }
};

exports.createSurgeryPrepPackage = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'اسم الباقة مطلوب' });

    const [existing] = await db.execute('SELECT * FROM surgery_prep_packages WHERE name = ?', [name]);
    if (existing.length > 0) {
      if (existing[0].is_deleted) {
        await db.execute('UPDATE surgery_prep_packages SET is_deleted = 0, is_active = 1 WHERE id = ?', [existing[0].id]);
        return res.json({ message: 'تم إضافة الباقة بنجاح', id: existing[0].id });
      } else {
        return res.status(400).json({ message: 'الباقة موجودة مسبقاً' });
      }
    }

    const [result] = await db.execute('INSERT INTO surgery_prep_packages (name) VALUES (?)', [name]);
    res.json({ message: 'تم إضافة الباقة', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'الباقة موجودة مسبقاً' });
    res.status(500).json({ message: 'خطأ في إضافة الباقة', error: err.message });
  }
};

exports.updateSurgeryPrepPackage = async (req, res) => {
  try {
    const { name, is_active } = req.body;
    const { id } = req.params;
    await db.execute('UPDATE surgery_prep_packages SET name = ?, is_active = ? WHERE id = ?', [name, is_active, id]);
    res.json({ message: 'تم تحديث الباقة' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'الاسم موجود مسبقاً' });
    res.status(500).json({ message: 'خطأ في تحديث الباقة', error: err.message });
  }
};

exports.addSurgeryPrepItem = async (req, res) => {
  try {
    const { package_id, item_type, item_id } = req.body;
    if (!package_id || !item_type || !item_id) return res.status(400).json({ message: 'بيانات العنصر غير مكتملة' });
    const [result] = await db.execute(
      'INSERT INTO surgery_prep_items (package_id, item_type, item_id) VALUES (?, ?, ?)',
      [package_id, item_type, item_id]
    );
    res.json({ message: 'تم إضافة العنصر للباقة', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الإضافة', error: err.message });
  }
};

exports.removeSurgeryPrepItem = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('DELETE FROM surgery_prep_items WHERE id = ?', [id]);
    res.json({ message: 'تم إزالة العنصر' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الحذف', error: err.message });
  }
};


// ── Lab Categories ────────────────────────────────────────────────

exports.getLabCategories = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM lab_categories WHERE is_deleted = 0 ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب الأقسام', error: err.message });
  }
};

exports.createLabCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'اسم القسم مطلوب' });

    const [existing] = await db.execute('SELECT * FROM lab_categories WHERE name = ?', [name]);
    if (existing.length > 0) {
      if (existing[0].is_deleted) {
        await db.execute('UPDATE lab_categories SET is_deleted = 0 WHERE id = ?', [existing[0].id]);
        return res.json({ message: 'تم إضافة القسم بنجاح', id: existing[0].id });
      } else {
        return res.status(400).json({ message: 'القسم موجود مسبقاً' });
      }
    }

    const [result] = await db.execute('INSERT INTO lab_categories (name) VALUES (?)', [name]);
    res.json({ message: 'تم إضافة القسم', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'القسم موجود مسبقاً' });
    res.status(500).json({ message: 'خطأ في الإضافة', error: err.message });
  }
};

exports.updateLabCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const { id } = req.params;
    await db.execute('UPDATE lab_categories SET name = ? WHERE id = ?', [name, id]);
    res.json({ message: 'تم التحديث' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في التحديث', error: err.message });
  }
};

exports.deleteLabCategory = async (req, res) => {
  try {
    const { id } = req.params;
    // Set tests in this category to NULL category
    await db.execute('UPDATE lab_tests SET category_id = NULL WHERE category_id = ?', [id]);
    await db.execute('UPDATE lab_categories SET is_deleted = 1 WHERE id = ?', [id]);
    res.json({ message: 'تم حذف القسم' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الحذف', error: err.message });
  }
};


// ── Lab Tests (Full CRUD via admin) ──────────────────────────────

exports.getLabTestsAdmin = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT t.*, c.name as category_name
      FROM lab_tests t
      LEFT JOIN lab_categories c ON t.category_id = c.id
      WHERE t.is_deleted = 0
      ORDER BY c.name ASC, t.name ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب التحاليل', error: err.message });
  }
};

exports.createLabTest = async (req, res) => {
  try {
    const { category_id, name, price } = req.body;
    if (!name || price === undefined) return res.status(400).json({ message: 'الاسم والسعر مطلوبان' });
    
    let catId = null;
    if (category_id !== undefined && category_id !== null && category_id !== '' && category_id !== 'null' && category_id !== 'undefined') {
      catId = parseInt(category_id, 10);
      if (isNaN(catId)) catId = null;
    }

    const [existing] = await db.execute('SELECT * FROM lab_tests WHERE name = ?', [name]);
    if (existing.length > 0) {
      if (existing[0].is_deleted) {
        await db.execute(
          'UPDATE lab_tests SET category_id = ?, price = ?, is_deleted = 0, is_active = 1 WHERE id = ?',
          [catId, price, existing[0].id]
        );
        return res.json({ message: 'تم إضافة التحليل بنجاح', id: existing[0].id });
      } else {
        return res.status(400).json({ message: 'التحليل موجود مسبقاً' });
      }
    }

    const [result] = await db.execute(
      'INSERT INTO lab_tests (category_id, name, price) VALUES (?, ?, ?)',
      [catId, name, price]
    );
    res.json({ message: 'تم إضافة التحليل', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'التحليل موجود مسبقاً' });
    res.status(500).json({ message: 'خطأ في الإضافة', error: err.message });
  }
};

exports.updateLabTest = async (req, res) => {
  try {
    const { category_id, name, price, is_active } = req.body;
    const { id } = req.params;
    
    let catId = null;
    if (category_id !== undefined && category_id !== null && category_id !== '' && category_id !== 'null' && category_id !== 'undefined') {
      catId = parseInt(category_id, 10);
      if (isNaN(catId)) catId = null;
    }

    await db.execute(
      'UPDATE lab_tests SET category_id = ?, name = ?, price = ?, is_active = ? WHERE id = ?',
      [catId, name, price, is_active !== undefined ? is_active : true, id]
    );
    res.json({ message: 'تم التحديث' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في التحديث', error: err.message });
  }
};

exports.deleteLabTest = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('UPDATE lab_tests SET is_deleted = 1 WHERE id = ?', [id]);
    res.json({ message: 'تم حذف التحليل بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الحذف', error: err.message });
  }
};


// ── Radiology Categories ──────────────────────────────────────────

exports.getRadiologyCategories = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM radiology_categories WHERE is_deleted = 0 ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب الأقسام', error: err.message });
  }
};

exports.createRadiologyCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'اسم القسم مطلوب' });

    const [existing] = await db.execute('SELECT * FROM radiology_categories WHERE name = ?', [name]);
    if (existing.length > 0) {
      if (existing[0].is_deleted) {
        await db.execute('UPDATE radiology_categories SET is_deleted = 0 WHERE id = ?', [existing[0].id]);
        return res.json({ message: 'تم إضافة القسم بنجاح', id: existing[0].id });
      } else {
        return res.status(400).json({ message: 'القسم موجود مسبقاً' });
      }
    }

    const [result] = await db.execute('INSERT INTO radiology_categories (name) VALUES (?)', [name]);
    res.json({ message: 'تم إضافة القسم', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'القسم موجود مسبقاً' });
    res.status(500).json({ message: 'خطأ في الإضافة', error: err.message });
  }
};

exports.updateRadiologyCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const { id } = req.params;
    await db.execute('UPDATE radiology_categories SET name = ? WHERE id = ?', [name, id]);
    res.json({ message: 'تم التحديث' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في التحديث', error: err.message });
  }
};

exports.deleteRadiologyCategory = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('UPDATE radiology_tests SET category_id = NULL WHERE category_id = ?', [id]);
    await db.execute('UPDATE radiology_categories SET is_deleted = 1 WHERE id = ?', [id]);
    res.json({ message: 'تم حذف القسم' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الحذف', error: err.message });
  }
};


// ── Radiology Tests (Full CRUD via admin) ────────────────────────

exports.getRadiologyTestsAdmin = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT t.*, c.name as category_name
      FROM radiology_tests t
      LEFT JOIN radiology_categories c ON t.category_id = c.id
      WHERE t.is_deleted = 0
      ORDER BY c.name ASC, t.name ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب الأشعة', error: err.message });
  }
};

exports.createRadiologyTest = async (req, res) => {
  try {
    const { category_id, name, price_with_film, price_without_film, price } = req.body;
    const priceWithFilmVal = price_with_film !== undefined ? price_with_film : price;
    if (!name || priceWithFilmVal === undefined) return res.status(400).json({ message: 'الاسم والسعر مطلوبان' });

    let catId = null;
    if (category_id !== undefined && category_id !== null && category_id !== '' && category_id !== 'null' && category_id !== 'undefined') {
      catId = parseInt(category_id, 10);
      if (isNaN(catId)) catId = null;
    }

    let parsedPriceWithFilm = null;
    if (priceWithFilmVal !== undefined && priceWithFilmVal !== null && priceWithFilmVal !== '' && priceWithFilmVal !== 'null' && priceWithFilmVal !== 'undefined') {
      parsedPriceWithFilm = parseFloat(priceWithFilmVal);
      if (isNaN(parsedPriceWithFilm)) parsedPriceWithFilm = null;
    }

    let parsedPriceWithoutFilm = null;
    if (price_without_film !== undefined && price_without_film !== null && price_without_film !== '' && price_without_film !== 'null' && price_without_film !== 'undefined') {
      parsedPriceWithoutFilm = parseFloat(price_without_film);
      if (isNaN(parsedPriceWithoutFilm)) parsedPriceWithoutFilm = null;
    }

    const [existing] = await db.execute('SELECT * FROM radiology_tests WHERE name = ?', [name]);
    if (existing.length > 0) {
      if (existing[0].is_deleted) {
        await db.execute(
          'UPDATE radiology_tests SET category_id = ?, price_with_film = ?, price_without_film = ?, is_deleted = 0, is_active = 1 WHERE id = ?',
          [catId, parsedPriceWithFilm, parsedPriceWithoutFilm, existing[0].id]
        );
        return res.json({ message: 'تم إضافة الفحص بنجاح', id: existing[0].id });
      } else {
        return res.status(400).json({ message: 'الفحص موجود مسبقاً' });
      }
    }

    const [result] = await db.execute(
      'INSERT INTO radiology_tests (category_id, name, price_with_film, price_without_film) VALUES (?, ?, ?, ?)',
      [catId, name, parsedPriceWithFilm, parsedPriceWithoutFilm]
    );
    res.json({ message: 'تم إضافة الفحص', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'الفحص موجود مسبقاً' });
    res.status(500).json({ message: 'خطأ في الإضافة', error: err.message });
  }
};

exports.updateRadiologyTest = async (req, res) => {
  try {
    const { category_id, name, price_with_film, price_without_film, price, is_active } = req.body;
    const { id } = req.params;
    const priceWithFilmVal = price_with_film !== undefined ? price_with_film : price;

    let catId = null;
    if (category_id !== undefined && category_id !== null && category_id !== '' && category_id !== 'null' && category_id !== 'undefined') {
      catId = parseInt(category_id, 10);
      if (isNaN(catId)) catId = null;
    }

    let parsedPriceWithFilm = null;
    if (priceWithFilmVal !== undefined && priceWithFilmVal !== null && priceWithFilmVal !== '' && priceWithFilmVal !== 'null' && priceWithFilmVal !== 'undefined') {
      parsedPriceWithFilm = parseFloat(priceWithFilmVal);
      if (isNaN(parsedPriceWithFilm)) parsedPriceWithFilm = null;
    }

    let parsedPriceWithoutFilm = null;
    if (price_without_film !== undefined && price_without_film !== null && price_without_film !== '' && price_without_film !== 'null' && price_without_film !== 'undefined') {
      parsedPriceWithoutFilm = parseFloat(price_without_film);
      if (isNaN(parsedPriceWithoutFilm)) parsedPriceWithoutFilm = null;
    }

    await db.execute(
      'UPDATE radiology_tests SET category_id = ?, name = ?, price_with_film = ?, price_without_film = ?, is_active = ? WHERE id = ?',
      [catId, name, parsedPriceWithFilm, parsedPriceWithoutFilm, is_active !== undefined ? is_active : true, id]
    );
    res.json({ message: 'تم التحديث' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في التحديث', error: err.message });
  }
};

exports.deleteRadiologyTest = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('UPDATE radiology_tests SET is_deleted = 1 WHERE id = ?', [id]);
    res.json({ message: 'تم حذف الفحص بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الحذف', error: err.message });
  }
};

// ── Added Logical Deletes for Medications, Clinical, Prep ───────────────────

exports.deleteMedication = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('UPDATE medications SET is_deleted = 1 WHERE id = ?', [id]);
    res.json({ message: 'تم حذف الدواء بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في حذف الدواء', error: err.message });
  }
};

exports.deleteClinicalCategory = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('UPDATE clinical_services SET category_id = NULL WHERE category_id = ?', [id]);
    await db.execute('UPDATE clinical_categories SET is_deleted = 1 WHERE id = ?', [id]);
    res.json({ message: 'تم حذف الفئة بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في حذف الفئة', error: err.message });
  }
};

exports.deleteClinicalService = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('UPDATE clinical_services SET is_deleted = 1 WHERE id = ?', [id]);
    res.json({ message: 'تم حذف الخدمة بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في حذف الخدمة', error: err.message });
  }
};

exports.deleteSurgeryPrepPackage = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('UPDATE surgery_prep_packages SET is_deleted = 1 WHERE id = ?', [id]);
    res.json({ message: 'تم حذف الباقة بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في حذف الباقة', error: err.message });
  }
};

