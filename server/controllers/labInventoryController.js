const db = require('../database/db');

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-INIT SCHEMA FOR LAB SUB-STORE & BOM CONSUMABLES ENGINE
// ═══════════════════════════════════════════════════════════════════════════
let schemaInitPromise = null;

async function ensureLabInventorySchema() {
  if (schemaInitPromise) return schemaInitPromise;

  schemaInitPromise = (async () => {
    try {
      // 1. Create lab_inventory_items table
      await db.query(`
        CREATE TABLE IF NOT EXISTS lab_inventory_items (
          id INT PRIMARY KEY AUTO_INCREMENT,
          name VARCHAR(255) NOT NULL,
          description TEXT NULL,
          category VARCHAR(100) NOT NULL DEFAULT 'محاليل وكواشف',
          unit VARCHAR(50) NOT NULL DEFAULT 'وحدة',
          quantity DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
          min_quantity DECIMAL(12, 4) NOT NULL DEFAULT 5.0000,
          cost_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
          expiry_date DATE NULL,
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_lab_inv_category (category),
          INDEX idx_lab_inv_active (is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
      `);

      // 2. Create lab_test_consumables (BOM Recipe table)
      await db.query(`
        CREATE TABLE IF NOT EXISTS lab_test_consumables (
          id INT PRIMARY KEY AUTO_INCREMENT,
          lab_test_id INT NOT NULL,
          lab_item_id INT NOT NULL,
          consumption_mode ENUM('per_test', 'per_unit_yield') NOT NULL DEFAULT 'per_test',
          quantity_per_test DECIMAL(12, 4) NOT NULL DEFAULT 1.0000,
          tests_per_unit DECIMAL(12, 4) NOT NULL DEFAULT 1.0000,
          notes VARCHAR(255) NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_lab_test_item (lab_test_id, lab_item_id),
          INDEX idx_ltc_test (lab_test_id),
          INDEX idx_ltc_item (lab_item_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
      `);

      // 3. Ensure visit_lab_requests has consumables_deducted TINYINT(1) DEFAULT 0
      const [vlrCols] = await db.query(
        "SHOW COLUMNS FROM visit_lab_requests LIKE 'consumables_deducted'"
      );
      if (vlrCols.length === 0) {
        await db.query(
          "ALTER TABLE visit_lab_requests ADD COLUMN consumables_deducted TINYINT(1) NOT NULL DEFAULT 0 AFTER status"
        );
      }

      // 4. Ensure inventory_transfers supports 'lab' in from_store / to_store and has lab_item_id
      const [labItemCol] = await db.query(
        "SHOW COLUMNS FROM inventory_transfers LIKE 'lab_item_id'"
      );
      if (labItemCol.length === 0) {
        await db.query(
          "ALTER TABLE inventory_transfers ADD COLUMN lab_item_id INT NULL AFTER or_item_id"
        );
      }

      await db.query(`
        ALTER TABLE inventory_transfers 
        MODIFY from_store ENUM('general', 'or', 'radiology', 'lab') NOT NULL,
        MODIFY to_store ENUM('general', 'or', 'radiology', 'lab') NOT NULL
      `);

      // 5. Ensure clinical_consumption_log exists and supports DECIMAL(12,4) for fractional deductions + financial cost snapshot
      await db.query(`
        CREATE TABLE IF NOT EXISTS clinical_consumption_log (
          id INT PRIMARY KEY AUTO_INCREMENT,
          store ENUM('radiology', 'lab') NOT NULL DEFAULT 'radiology',
          item_id INT NOT NULL,
          item_name VARCHAR(255) NOT NULL,
          item_unit VARCHAR(50) NOT NULL,
          qty_deducted DECIMAL(12, 4) NOT NULL,
          unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
          total_cost DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
          visit_id INT NULL,
          visit_number VARCHAR(100) NULL,
          patient_name VARCHAR(255) NULL,
          service_id INT NULL,
          service_name VARCHAR(255) NULL,
          trigger_type ENUM('procedure_consumption', 'wastage', 'reversal', 'manual') NOT NULL DEFAULT 'procedure_consumption',
          notes TEXT NULL,
          performed_by INT NULL,
          performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_store (store),
          INDEX idx_visit (visit_id),
          INDEX idx_item (item_id),
          INDEX idx_performed_at (performed_at),
          INDEX idx_ccl_store_service_date (store, service_id, performed_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
      `);

      // 6. Ensure unit_cost, total_cost, and idx_ccl_store_service_date exist in clinical_consumption_log (Historical Cost Snapshot)
      const [cclUnitCostCol] = await db.query(
        "SHOW COLUMNS FROM clinical_consumption_log LIKE 'unit_cost'"
      );
      if (cclUnitCostCol.length === 0) {
        await db.query(`
          ALTER TABLE clinical_consumption_log
            ADD COLUMN unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER qty_deducted,
            ADD COLUMN total_cost DECIMAL(12, 2) NOT NULL DEFAULT 0.00 AFTER unit_cost,
            ADD INDEX idx_ccl_store_service_date (store, service_id, performed_at)
        `);
      } else {
        const [cclIdx] = await db.query(
          "SHOW INDEX FROM clinical_consumption_log WHERE Key_name = 'idx_ccl_store_service_date'"
        );
        if (cclIdx.length === 0) {
          await db.query(`
            ALTER TABLE clinical_consumption_log
              ADD INDEX idx_ccl_store_service_date (store, service_id, performed_at)
          `);
        }
      }

      // 7. One-Time Historical Backfill for lab consumption records with 0.00 cost
      await db.query(`
        UPDATE clinical_consumption_log ccl
        JOIN lab_inventory_items li ON ccl.store = 'lab' AND ccl.item_id = li.id
        SET ccl.unit_cost = li.cost_price,
            ccl.total_cost = ROUND(ccl.qty_deducted * li.cost_price, 2)
        WHERE ccl.store = 'lab' AND ccl.unit_cost = 0.00 AND li.cost_price > 0
      `);
    } catch (err) {
      console.error('[LabInventory] Schema initialization error:', err.message);
      schemaInitPromise = null;
      throw err;
    }
  })();

  return schemaInitPromise;
}

// Trigger auto-init on module load
ensureLabInventorySchema().catch(() => {});

exports.ensureLabInventorySchema = ensureLabInventorySchema;

// Helper: Normalize BOM consumption calculation
function normalizeConsumptionRule(rule = {}) {
  const mode = rule.consumption_mode === 'per_unit_yield' ? 'per_unit_yield' : 'per_test';
  if (mode === 'per_unit_yield') {
    const rawYield = parseFloat(rule.tests_per_unit ?? rule.value);
    const testsPerUnit = !isNaN(rawYield) && rawYield > 0 ? Number(rawYield.toFixed(4)) : 1.0;
    const qtyPerTest = Number((1 / testsPerUnit).toFixed(4));
    return {
      consumption_mode: 'per_unit_yield',
      quantity_per_test: qtyPerTest > 0 ? qtyPerTest : 0.0001,
      tests_per_unit: testsPerUnit
    };
  } else {
    const rawQty = parseFloat(rule.quantity_per_test ?? rule.value);
    const qtyPerTest = !isNaN(rawQty) && rawQty > 0 ? Number(rawQty.toFixed(4)) : 1.0;
    return {
      consumption_mode: 'per_test',
      quantity_per_test: qtyPerTest,
      tests_per_unit: 1.0
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. GET LAB INVENTORY ITEMS & AGGREGATE STATS
// ═══════════════════════════════════════════════════════════════════════════
exports.getInventoryItems = async (req, res) => {
  try {
    await ensureLabInventorySchema();

    const includeInactive = req.query.includeInactive === 'true';
    const whereClause = includeInactive ? '' : 'WHERE is_active = 1';

    const [items] = await db.query(`
      SELECT id, name, description, category, unit, quantity, min_quantity, cost_price, expiry_date, is_active, created_at, updated_at
      FROM lab_inventory_items
      ${whereClause}
      ORDER BY is_active DESC, category ASC, name ASC
    `);

    // Fetch all BOM links to enrich each item with its linked lab tests
    const [bomRows] = await db.query(`
      SELECT 
        ltc.id,
        ltc.lab_test_id,
        ltc.lab_item_id,
        ltc.consumption_mode,
        ltc.quantity_per_test,
        ltc.tests_per_unit,
        ltc.notes,
        lt.name AS test_name,
        lt.is_active AS test_is_active,
        lc.name AS test_category_name
      FROM lab_test_consumables ltc
      JOIN lab_tests lt ON ltc.lab_test_id = lt.id
      LEFT JOIN lab_categories lc ON lt.category_id = lc.id
      ORDER BY lt.name ASC
    `);

    const bomByItem = new Map();
    bomRows.forEach(r => {
      if (!bomByItem.has(r.lab_item_id)) {
        bomByItem.set(r.lab_item_id, []);
      }
      bomByItem.get(r.lab_item_id).push({
        id: r.id,
        lab_test_id: r.lab_test_id,
        lab_item_id: r.lab_item_id,
        test_name: r.test_name,
        test_category_name: r.test_category_name || 'عام',
        test_is_active: r.test_is_active,
        consumption_mode: r.consumption_mode,
        quantity_per_test: parseFloat(r.quantity_per_test) || 1,
        tests_per_unit: parseFloat(r.tests_per_unit) || 1,
        notes: r.notes || null
      });
    });

    const enrichedItems = items.map(it => {
      const qty = parseFloat(it.quantity) || 0;
      const linkedTests = (bomByItem.get(it.id) || []).map(lt => {
        const qPerTest = parseFloat(lt.quantity_per_test) || 1;
        const estimatedTestsRemaining =
          qty > 0 && qPerTest > 0 ? Math.floor((qty + 1e-9) / qPerTest) : 0;
        return {
          ...lt,
          estimated_tests_remaining: estimatedTestsRemaining
        };
      });

      return {
        ...it,
        linked_tests: linkedTests,
        linked_tests_count: linkedTests.length
      };
    });

    // Calculate real-time indicators based on active items
    const activeItems = enrichedItems.filter(it => Number(it.is_active) !== 0);
    const totalItems = activeItems.length;
    let lowStockCount = 0;
    let negativeStockCount = 0;
    let expiringSoonCount = 0;
    let expiredCount = 0;
    let totalInventoryValue = 0;
    let lowStockValue = 0;
    let expiringStockValue = 0;
    let negativeDeficitValue = 0;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const ninetyDaysAhead = new Date(todayStart);
    ninetyDaysAhead.setDate(ninetyDaysAhead.getDate() + 90);

    activeItems.forEach(it => {
      const q = parseFloat(it.quantity) || 0;
      const min = parseFloat(it.min_quantity) || 0;
      const cost = parseFloat(it.cost_price) || 0;
      const positiveItemValue = Math.max(q, 0) * cost;

      totalInventoryValue += positiveItemValue;

      if (q < 0) {
        negativeStockCount++;
        negativeDeficitValue += Math.abs(q) * cost;
      } else if (q <= min) {
        lowStockCount++;
        lowStockValue += positiveItemValue;
      }

      if (it.expiry_date) {
        const exp = new Date(it.expiry_date);
        exp.setHours(0, 0, 0, 0);
        if (!isNaN(exp.getTime())) {
          if (exp < todayStart) {
            expiredCount++;
            expiringSoonCount++;
            expiringStockValue += positiveItemValue;
          } else if (exp <= ninetyDaysAhead) {
            expiringSoonCount++;
            expiringStockValue += positiveItemValue;
          }
        }
      }
    });

    // Check pending incoming transfers count for lab
    const [[{ pendingTransfers }]] = await db.query(`
      SELECT COUNT(DISTINCT COALESCE(batch_ref, CONCAT('TRANSFER-', id))) AS pendingTransfers
      FROM inventory_transfers
      WHERE to_store = 'lab' AND status = 'pending'
    `);

    // Monthly consumption count
    const [[{ monthlyMovements }]] = await db.query(`
      SELECT COUNT(*) AS monthlyMovements
      FROM clinical_consumption_log
      WHERE store = 'lab'
        AND trigger_type != 'reversal'
        AND performed_at >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')
    `);

    res.json({
      items: enrichedItems,
      stats: {
        totalItems,
        lowStockCount,
        negativeStockCount,
        expiringSoonCount,
        expiredCount,
        totalInventoryValue: Number(totalInventoryValue.toFixed(2)),
        lowStockValue: Number(lowStockValue.toFixed(2)),
        expiringStockValue: Number(expiringStockValue.toFixed(2)),
        negativeDeficitValue: Number(negativeDeficitValue.toFixed(2)),
        pendingTransfersCount: pendingTransfers || 0,
        monthlyMovementsCount: monthlyMovements || 0
      }
    });
  } catch (err) {
    console.error('getLabInventoryItems error:', err);
    res.status(500).json({ message: 'فشل تحميل مخزون قسم المختبر' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. ADMIN CRUD & STOCK ADJUSTMENT
// ═══════════════════════════════════════════════════════════════════════════
exports.createInventoryItem = async (req, res) => {
  const {
    name,
    description = '',
    category = 'محاليل وكواشف',
    unit = 'وحدة',
    quantity = 0,
    min_quantity = 5,
    cost_price = 0,
    expiry_date = null,
    is_active = 1,
    linked_tests = []
  } = req.body;

  const cleanName = String(name || '').trim();
  if (!cleanName) {
    return res.status(400).json({ message: 'يرجى إدخال اسم الصنف' });
  }

  const cleanCategory = String(category || '').trim() || 'محاليل وكواشف';
  const cleanUnit = String(unit || '').trim() || 'وحدة';
  const parsedQty = isNaN(parseFloat(quantity)) ? 0 : parseFloat(quantity);
  const parsedMin = isNaN(parseFloat(min_quantity)) ? 5 : Math.max(0, parseFloat(min_quantity));
  const parsedCost = isNaN(parseFloat(cost_price)) ? 0 : Math.max(0, parseFloat(cost_price));
  const cleanExpiry = expiry_date && String(expiry_date).trim() ? String(expiry_date).trim() : null;
  const activeFlag = is_active === 0 || is_active === false ? 0 : 1;

  const conn = await db.getConnection();
  try {
    await ensureLabInventorySchema();
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      'SELECT id FROM lab_inventory_items WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND LOWER(TRIM(unit)) = LOWER(TRIM(?)) LIMIT 1',
      [cleanName, cleanUnit]
    );
    if (existing) {
      await conn.rollback();
      return res.status(400).json({ message: 'يوجد صنف مسجل بنفس الاسم ونفس وحدة القياس في مخزن المختبر' });
    }

    const [result] = await conn.execute(
      `INSERT INTO lab_inventory_items
        (name, description, category, unit, quantity, min_quantity, cost_price, expiry_date, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cleanName,
        String(description || '').trim() || null,
        cleanCategory,
        cleanUnit,
        parsedQty,
        parsedMin,
        parsedCost,
        cleanExpiry,
        activeFlag
      ]
    );

    const newItemId = result.insertId;

    // Optional: Link tests immediately if provided
    if (Array.isArray(linked_tests) && linked_tests.length > 0) {
      for (const rule of linked_tests) {
        const testId = parseInt(rule.lab_test_id);
        if (!testId) continue;
        const norm = normalizeConsumptionRule(rule);
        await conn.execute(
          `INSERT INTO lab_test_consumables
            (lab_test_id, lab_item_id, consumption_mode, quantity_per_test, tests_per_unit, notes)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
            consumption_mode = VALUES(consumption_mode),
            quantity_per_test = VALUES(quantity_per_test),
            tests_per_unit = VALUES(tests_per_unit),
            notes = VALUES(notes)`,
          [
            testId,
            newItemId,
            norm.consumption_mode,
            norm.quantity_per_test,
            norm.tests_per_unit,
            rule.notes ? String(rule.notes).trim() : null
          ]
        );
      }
    }

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('lab').emit('inventory:updated');
      io.to('auditor').emit('inventory:updated');
    }

    res.status(201).json({
      id: newItemId,
      message: 'تم إضافة الصنف إلى مخزن المختبر بنجاح'
    });
  } catch (err) {
    await conn.rollback();
    console.error('createLabInventoryItem error:', err);
    res.status(500).json({ message: 'فشل إضافة الصنف إلى مخزن المختبر' });
  } finally {
    conn.release();
  }
};

exports.updateInventoryItem = async (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    category,
    unit,
    min_quantity,
    cost_price,
    expiry_date,
    is_active,
    linked_tests
  } = req.body;

  const conn = await db.getConnection();
  try {
    await ensureLabInventorySchema();
    await conn.beginTransaction();

    const [[item]] = await conn.query('SELECT * FROM lab_inventory_items WHERE id = ?', [id]);
    if (!item) {
      await conn.rollback();
      return res.status(404).json({ message: 'الصنف غير موجود في مخزن المختبر' });
    }

    const cleanName = name !== undefined ? String(name).trim() : item.name;
    if (!cleanName) {
      await conn.rollback();
      return res.status(400).json({ message: 'اسم الصنف لا يمكن أن يكون فارغاً' });
    }

    const cleanCategory =
      category !== undefined ? String(category).trim() || 'محاليل وكواشف' : item.category;
    const cleanUnit =
      unit !== undefined ? String(unit).trim() || 'وحدة' : item.unit;

    const [[dup]] = await conn.query(
      'SELECT id FROM lab_inventory_items WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND LOWER(TRIM(unit)) = LOWER(TRIM(?)) AND id != ? LIMIT 1',
      [cleanName, cleanUnit, id]
    );
    if (dup) {
      await conn.rollback();
      return res.status(400).json({ message: 'يوجد صنف آخر مسجل بنفس الاسم ونفس وحدة القياس في مخزن المختبر' });
    }

    const cleanDesc =
      description !== undefined ? String(description).trim() || null : item.description;
    const parsedMin =
      min_quantity !== undefined && !isNaN(parseFloat(min_quantity))
        ? Math.max(0, parseFloat(min_quantity))
        : parseFloat(item.min_quantity) || 0;
    const parsedCost =
      cost_price !== undefined ? parseFloat(cost_price) : parseFloat(item.cost_price);
    if (isNaN(parsedCost) || parsedCost <= 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'يرجى إدخال سعر للصنف أعلى من 0 عند تعديل بيانات الصنف' });
    }
    const cleanExpiry =
      expiry_date !== undefined
        ? expiry_date && String(expiry_date).trim()
          ? String(expiry_date).trim()
          : null
        : item.expiry_date;
    const activeFlag =
      is_active !== undefined ? (is_active === 0 || is_active === false ? 0 : 1) : item.is_active;

    await conn.execute(
      `UPDATE lab_inventory_items
       SET name = ?,
           description = ?,
           category = ?,
           unit = ?,
           min_quantity = ?,
           cost_price = ?,
           expiry_date = ?,
           is_active = ?
       WHERE id = ?`,
      [cleanName, cleanDesc, cleanCategory, cleanUnit, parsedMin, parsedCost, cleanExpiry, activeFlag, id]
    );

    // Optional: Sync linked_tests for this item if passed
    if (Array.isArray(linked_tests)) {
      await conn.execute('DELETE FROM lab_test_consumables WHERE lab_item_id = ?', [id]);
      for (const rule of linked_tests) {
        const testId = parseInt(rule.lab_test_id);
        if (!testId) continue;
        const norm = normalizeConsumptionRule(rule);
        await conn.execute(
          `INSERT INTO lab_test_consumables
            (lab_test_id, lab_item_id, consumption_mode, quantity_per_test, tests_per_unit, notes)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            testId,
            id,
            norm.consumption_mode,
            norm.quantity_per_test,
            norm.tests_per_unit,
            rule.notes ? String(rule.notes).trim() : null
          ]
        );
      }
    }

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('lab').emit('inventory:updated');
      io.to('auditor').emit('inventory:updated');
    }

    res.json({ message: 'تم تحديث بيانات الصنف بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error('updateLabInventoryItem error:', err);
    res.status(500).json({ message: 'فشل تحديث بيانات الصنف' });
  } finally {
    conn.release();
  }
};

exports.adjustInventoryStock = async (req, res) => {
  const { id } = req.params;
  const { mode = 'set', quantity, reason = '' } = req.body;
  const parsedVal = parseFloat(quantity);
  const cleanReason = String(reason || '').trim();

  if (isNaN(parsedVal)) {
    return res.status(400).json({ message: 'يرجى إدخال قيمة رقمية صحيحة لتعديل الرصيد' });
  }

  if ((mode === 'add' || mode === 'deduct' || mode === 'subtract') && parsedVal <= 0) {
    return res.status(400).json({ message: 'يرجى إدخال كمية أكبر من الصفر للإضافة أو الخصم' });
  }

  if (!cleanReason) {
    return res.status(400).json({ message: 'يرجى إدخال سبب التسوية / الملاحظة لتعديل الرصيد' });
  }

  const conn = await db.getConnection();
  try {
    await ensureLabInventorySchema();
    await conn.beginTransaction();

    const [[item]] = await conn.query(
      'SELECT * FROM lab_inventory_items WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!item) {
      await conn.rollback();
      return res.status(404).json({ message: 'الصنف غير موجود في مخزن المختبر' });
    }

    const currentQty = parseFloat(item.quantity) || 0;
    let newQty = currentQty;

    if (mode === 'add') {
      newQty = Number((currentQty + parsedVal).toFixed(4));
    } else if (mode === 'deduct' || mode === 'subtract') {
      newQty = Number((currentQty - parsedVal).toFixed(4));
    } else {
      newQty = Number(parsedVal.toFixed(4));
    }

    await conn.execute(
      'UPDATE lab_inventory_items SET quantity = ? WHERE id = ?',
      [newQty, id]
    );

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('lab').emit('inventory:updated');
      io.to('auditor').emit('inventory:updated');
    }

    res.json({
      message: `تم تحديث الرصيد الفعلي للصنف (${item.name}) من ${currentQty} إلى ${newQty} بنجاح`,
      previous_quantity: currentQty,
      new_quantity: newQty,
      reason: String(reason || '').trim()
    });
  } catch (err) {
    await conn.rollback();
    console.error('adjustLabInventoryStock error:', err);
    res.status(500).json({ message: 'فشل تعديل رصيد الصنف' });
  } finally {
    conn.release();
  }
};

exports.deleteInventoryItem = async (req, res) => {
  const { id } = req.params;
  try {
    await ensureLabInventorySchema();

    const [[item]] = await db.query('SELECT * FROM lab_inventory_items WHERE id = ?', [id]);
    if (!item) {
      return res.status(404).json({ message: 'الصنف غير موجود في مخزن المختبر' });
    }

    // ── Block deletion if item still has stock ──────────────────────────────
    const currentQty = parseFloat(item.quantity) || 0;
    if (currentQty !== 0) {
      return res.status(400).json({
        message: `لا يمكن حذف هذا الصنف لأنه لا يزال يحتوي على كمية في المخزون (${currentQty} ${item.unit || 'وحدة'}). يرجى تصفير الرصيد أولاً عبر تسوية الرصيد ثم إعادة المحاولة.`,
        hasStock: true,
        quantity: currentQty,
        unit: item.unit
      });
    }

    const [[{ logCount }]] = await db.query(
      "SELECT COUNT(*) AS logCount FROM clinical_consumption_log WHERE store = 'lab' AND item_id = ?",
      [id]
    );
    const [[{ transferCount }]] = await db.query(
      'SELECT COUNT(*) AS transferCount FROM inventory_transfers WHERE lab_item_id = ?',
      [id]
    );

    const hasHistory = (logCount || 0) > 0 || (transferCount || 0) > 0;

    if (hasHistory) {
      // Has log history but zero quantity → soft-delete (toggle active)
      const nextActive = Number(item.is_active) === 1 ? 0 : 1;
      await db.execute(
        'UPDATE lab_inventory_items SET is_active = ? WHERE id = ?',
        [nextActive, id]
      );

      const io = req.app.get('io');
      if (io) {
        io.to('lab').emit('inventory:updated');
        io.to('auditor').emit('inventory:updated');
      }

      return res.json({
        softDeleted: true,
        is_active: nextActive,
        message:
          nextActive === 0
            ? 'تم إيقاف تنشيط الصنف بدلاً من حذفه لارتباطه بسجلات استهلاك أو شحنات سابقة'
            : 'تم إعادة تفعيل الصنف في مخزن المختبر بنجاح'
      });
    }

    // No history, zero quantity → safe to hard-delete
    await db.execute('DELETE FROM lab_test_consumables WHERE lab_item_id = ?', [id]);
    await db.execute('DELETE FROM lab_inventory_items WHERE id = ?', [id]);

    const io = req.app.get('io');
    if (io) {
      io.to('lab').emit('inventory:updated');
      io.to('auditor').emit('inventory:updated');
    }

    res.json({
      softDeleted: false,
      message: 'تم حذف الصنف نهائياً من مخزن المختبر بنجاح'
    });
  } catch (err) {
    console.error('deleteLabInventoryItem error:', err);
    res.status(500).json({ message: 'فشل حذف الصنف من مخزن المختبر' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. BOM MANAGEMENT (MANY-TO-MANY TEST <-> CONSUMABLES RECIPES)
// ═══════════════════════════════════════════════════════════════════════════
exports.getTestConsumables = async (req, res) => {
  const testId = req.params.testId || req.query.test_id;
  const itemId = req.query.item_id;

  try {
    await ensureLabInventorySchema();

    let whereParts = [];
    let params = [];

    if (testId) {
      whereParts.push('ltc.lab_test_id = ?');
      params.push(testId);
    }
    if (itemId) {
      whereParts.push('ltc.lab_item_id = ?');
      params.push(itemId);
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT 
         ltc.id,
         ltc.lab_test_id,
         ltc.lab_item_id,
         ltc.consumption_mode,
         ltc.quantity_per_test,
         ltc.tests_per_unit,
         ltc.notes,
         lt.name AS test_name,
         lt.price AS test_price,
         lt.is_active AS test_is_active,
         lc.name AS test_category_name,
         li.name AS item_name,
         li.category AS item_category,
         li.unit AS item_unit,
         li.quantity AS item_quantity,
         li.min_quantity AS item_min_quantity,
         COALESCE(li.cost_price, 0) AS item_cost_price,
         li.is_active AS item_is_active,
         CASE 
           WHEN ltc.consumption_mode = 'per_unit_yield' AND ltc.tests_per_unit > 0 
             THEN ROUND(1 / ltc.tests_per_unit, 4)
           ELSE ltc.quantity_per_test
         END AS effective_qty_per_test,
         ROUND(
           (CASE 
             WHEN ltc.consumption_mode = 'per_unit_yield' AND ltc.tests_per_unit > 0 
               THEN (1 / ltc.tests_per_unit)
             ELSE ltc.quantity_per_test
           END) * COALESCE(li.cost_price, 0),
           2
         ) AS item_cost_per_test
       FROM lab_test_consumables ltc
       JOIN lab_tests lt ON ltc.lab_test_id = lt.id
       LEFT JOIN lab_categories lc ON lt.category_id = lc.id
       JOIN lab_inventory_items li ON ltc.lab_item_id = li.id
       ${whereClause}
       ORDER BY lt.name ASC, li.name ASC`,
      params
    );

    if (testId) {
      const activeConsumables = rows.filter(r => Number(r.item_is_active) !== 0);
      const operationalCost = Number(
        activeConsumables
          .reduce((sum, r) => sum + (parseFloat(r.item_cost_per_test) || 0), 0)
          .toFixed(2)
      );
      return res.json({
        lab_test_id: Number(testId),
        operational_cost: operationalCost,
        consumables: rows
      });
    }

    // Also fetch all lab tests with their linked consumables summary
    const [allTests] = await db.query(`
      SELECT lt.id, lt.name, lt.category_id, lt.price, lt.is_active,
             lc.name AS category_name
      FROM lab_tests lt
      LEFT JOIN lab_categories lc ON lt.category_id = lc.id
      WHERE lt.is_deleted = 0
      ORDER BY lc.name ASC, lt.name ASC
    `);

    const byTestId = new Map();
    rows.forEach(r => {
      if (!byTestId.has(r.lab_test_id)) {
        byTestId.set(r.lab_test_id, []);
      }
      byTestId.get(r.lab_test_id).push(r);
    });

    const testsWithConsumables = allTests.map(t => {
      const testConsumables = byTestId.get(t.id) || [];
      const activeConsumables = testConsumables.filter(c => Number(c.item_is_active) !== 0);
      const operationalCost = Number(
        activeConsumables
          .reduce((sum, c) => sum + (parseFloat(c.item_cost_per_test) || 0), 0)
          .toFixed(2)
      );
      const testPrice = Number(parseFloat(t.price || 0).toFixed(2));
      const profitPerTest = Number((testPrice - operationalCost).toFixed(2));
      const profitMarginPercent =
        testPrice > 0 ? Number(((profitPerTest / testPrice) * 100).toFixed(1)) : 0;

      return {
        ...t,
        consumables: testConsumables,
        consumables_count: testConsumables.length,
        operational_cost: operationalCost,
        profit_per_test: profitPerTest,
        profit_margin_percent: profitMarginPercent
      };
    });

    const linkedTests = testsWithConsumables.filter(t => t.consumables_count > 0);
    const avgBomCost =
      linkedTests.length > 0
        ? Number(
            (
              linkedTests.reduce((sum, t) => sum + t.operational_cost, 0) / linkedTests.length
            ).toFixed(2)
          )
        : 0;
    const avgProfitMarginPercent =
      linkedTests.length > 0
        ? Number(
            (
              linkedTests.reduce((sum, t) => sum + t.profit_margin_percent, 0) / linkedTests.length
            ).toFixed(1)
          )
        : 0;
    const lowMarginTestsCount = linkedTests.filter(t => t.profit_margin_percent < 20).length;

    res.json({
      consumables: rows,
      tests: testsWithConsumables,
      bomStats: {
        totalTestsCount: testsWithConsumables.length,
        linkedTestsCount: linkedTests.length,
        unlinkedTestsCount: testsWithConsumables.length - linkedTests.length,
        avgBomCost,
        avgProfitMarginPercent,
        lowMarginTestsCount
      }
    });
  } catch (err) {
    console.error('getTestConsumables error:', err);
    res.status(500).json({ message: 'فشل جلب وصفات استهلاك التحاليل المخبرية' });
  }
};

exports.saveTestConsumables = async (req, res) => {
  const labTestId = parseInt(req.params.testId || req.body.lab_test_id);
  const consumables = Array.isArray(req.body.consumables)
    ? req.body.consumables
    : Array.isArray(req.body.items)
    ? req.body.items
    : [];

  if (!labTestId || isNaN(labTestId)) {
    return res.status(400).json({ message: 'يرجى تحديد التحليل المخبري المراد ربطه بالمستهلكات' });
  }

  const conn = await db.getConnection();
  try {
    await ensureLabInventorySchema();
    await conn.beginTransaction();

    const [[testExists]] = await conn.query(
      'SELECT id, name FROM lab_tests WHERE id = ?',
      [labTestId]
    );
    if (!testExists) {
      await conn.rollback();
      return res.status(404).json({ message: 'التحليل المخبري غير موجود' });
    }

    // Clear existing BOM links for this test
    await conn.execute('DELETE FROM lab_test_consumables WHERE lab_test_id = ?', [labTestId]);

    const seenItemIds = new Set();
    const savedItems = [];

    for (const entry of consumables) {
      const itemId = parseInt(entry.lab_item_id || entry.item_id);
      if (!itemId || isNaN(itemId) || seenItemIds.has(itemId)) continue;
      seenItemIds.add(itemId);

      const norm = normalizeConsumptionRule(entry);
      const cleanNotes = entry.notes ? String(entry.notes).trim() : null;

      await conn.execute(
        `INSERT INTO lab_test_consumables
          (lab_test_id, lab_item_id, consumption_mode, quantity_per_test, tests_per_unit, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          labTestId,
          itemId,
          norm.consumption_mode,
          norm.quantity_per_test,
          norm.tests_per_unit,
          cleanNotes
        ]
      );

      savedItems.push({
        lab_test_id: labTestId,
        lab_item_id: itemId,
        ...norm,
        notes: cleanNotes
      });
    }

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('lab').emit('inventory:updated');
      io.to('auditor').emit('inventory:updated');
    }

    res.json({
      message: `تم حفظ وصفة المستهلكات للتحليل (${testExists.name}) بنجاح`,
      lab_test_id: labTestId,
      consumables_count: savedItems.length,
      consumables: savedItems
    });
  } catch (err) {
    await conn.rollback();
    console.error('saveTestConsumables error:', err);
    res.status(500).json({ message: 'فشل حفظ ربط المستهلكات بالتحليل المخبري' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. INTER-STORE TRANSFERS (PENDING, HISTORY, RECEIVE, REJECT)
// ═══════════════════════════════════════════════════════════════════════════
exports.getPendingTransfers = async (req, res) => {
  try {
    await ensureLabInventorySchema();

    const [rows] = await db.query(`
      SELECT 
        it.id,
        it.from_store,
        it.batch_ref,
        it.batch_notes,
        it.sent_quantity,
        it.sent_at,
        u.full_name AS sent_by_user,
        COALESCE(gi.name, oi.name) AS item_name,
        COALESCE(gi.unit, oi.unit) AS item_unit,
        COALESCE(gi.cost_price, oi.cost_price, 0) AS cost_price,
        COALESCE(gi.expiry_date, oi.expiry_date) AS expiry_date
      FROM inventory_transfers it
      LEFT JOIN users u ON it.sent_by = u.id
      LEFT JOIN general_inventory_items gi ON it.from_store = 'general' AND it.general_item_id = gi.id
      LEFT JOIN or_inventory_items oi ON it.from_store = 'or' AND it.or_item_id = oi.id
      WHERE it.to_store = 'lab' AND it.status = 'pending'
      ORDER BY it.sent_at DESC
    `);

    const batches = {};
    rows.forEach(r => {
      const ref = r.batch_ref || `TRANSFER-${r.id}`;
      const storeName = r.from_store === 'or' ? 'مخزن العمليات' : 'المخزن العام';
      if (!batches[ref]) {
        batches[ref] = {
          batch_ref_key: ref,
          batch_ref: ref,
          from_store: r.from_store || 'general',
          store_name: storeName,
          sender_name: storeName,
          sent_by_name: r.sent_by_user || storeName,
          sent_at: r.sent_at,
          batch_notes: r.batch_notes,
          notes: r.batch_notes,
          item_count: 0,
          total_quantity: 0,
          items: []
        };
      }
      const resolvedName = r.item_name || 'صنف غير محدد';
      const qty = parseFloat(r.sent_quantity) || 0;
      const unitStr = r.item_unit || 'وحدة';
      const costPrice = parseFloat(r.cost_price) || 0;
      batches[ref].item_count += 1;
      batches[ref].total_quantity += qty;
      batches[ref].items.push({
        id: r.id,
        item_name: resolvedName,
        unit: unitStr,
        item_unit: unitStr,
        cost_price: costPrice,
        unit_price: costPrice,
        expiry_date: r.expiry_date,
        sent_quantity: qty,
        quantity: qty
      });
    });

    res.json(Object.values(batches));
  } catch (err) {
    console.error('getLabPendingTransfers error:', err);
    res.status(500).json({ message: 'فشل تحميل الشحنات الواردة للمختبر' });
  }
};

exports.getTransfersHistory = async (req, res) => {
  const { startDate, endDate, status, search } = req.query;
  try {
    await ensureLabInventorySchema();

    const params = [];
    let whereClause = "WHERE it.to_store = 'lab' AND it.status IN ('received', 'rejected')";

    if (status && status !== 'all') {
      whereClause += ' AND it.status = ?';
      params.push(status);
    }

    if (startDate && endDate) {
      whereClause += ' AND COALESCE(it.received_at, it.rejected_at, it.sent_at) BETWEEN ? AND ?';
      params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClause += ` AND (
        COALESCE(li.name, gi.name, oi.name, '') LIKE ? OR
        COALESCE(li.unit, gi.unit, oi.unit, '') LIKE ? OR
        COALESCE(li.category, '') LIKE ? OR
        (CASE WHEN it.from_store = 'or' THEN 'مخزن العمليات' ELSE 'المخزن العام' END) LIKE ?
      )`;
      params.push(term, term, term, term);
    }

    const [rows] = await db.query(
      `SELECT 
         it.id,
         it.from_store,
         it.status,
         it.batch_ref,
         it.batch_notes,
         it.rejection_reason,
         it.sent_quantity,
         it.received_quantity,
         it.sent_at,
         it.received_at,
         it.rejected_at,
         u_sent.full_name AS sent_by_user,
         u_rec.full_name AS received_by_user,
         u_rej.full_name AS rejected_by_user,
         COALESCE(li.name, gi.name, oi.name) AS item_name,
         COALESCE(li.unit, gi.unit, oi.unit) AS item_unit,
         COALESCE(li.category, 'محاليل وكواشف') AS category,
         COALESCE(li.cost_price, gi.cost_price, oi.cost_price, 0) AS cost_price,
         COALESCE(li.expiry_date, gi.expiry_date, oi.expiry_date) AS expiry_date
       FROM inventory_transfers it
       LEFT JOIN users u_sent ON it.sent_by = u_sent.id
       LEFT JOIN users u_rec ON it.received_by = u_rec.id
       LEFT JOIN users u_rej ON it.rejected_by = u_rej.id
       LEFT JOIN general_inventory_items gi ON it.from_store = 'general' AND it.general_item_id = gi.id
       LEFT JOIN or_inventory_items oi ON it.from_store = 'or' AND it.or_item_id = oi.id
       LEFT JOIN lab_inventory_items li ON it.lab_item_id = li.id
       ${whereClause}
       ORDER BY COALESCE(it.received_at, it.rejected_at, it.sent_at) DESC`,
      params
    );

    const batches = {};
    rows.forEach(r => {
      const ref = r.batch_ref || `TRANSFER-${r.id}`;
      const storeName = r.from_store === 'or' ? 'مخزن العمليات' : 'المخزن العام';
      const actionDate = r.received_at || r.rejected_at || r.sent_at;
      const actionUser = r.status === 'received' ? r.received_by_user : r.rejected_by_user;

      if (!batches[ref]) {
        batches[ref] = {
          batch_ref_key: ref,
          batch_ref: ref,
          status: r.status,
          from_store: r.from_store || 'general',
          store_name: storeName,
          sender_name: storeName,
          sent_by_name: r.sent_by_user || storeName,
          sent_at: r.sent_at,
          resolved_at: actionDate,
          action_at: actionDate,
          action_by_name: actionUser || 'قسم المختبر',
          batch_notes: r.batch_notes,
          notes: r.batch_notes,
          rejection_reason: r.rejection_reason,
          item_count: 0,
          total_quantity: 0,
          items: []
        };
      }

      const resolvedName = r.item_name || 'صنف غير محدد';
      const qty = parseFloat(r.received_quantity ?? r.sent_quantity) || 0;
      const unitStr = r.item_unit || 'وحدة';
      const costPrice = parseFloat(r.cost_price) || 0;
      batches[ref].item_count += 1;
      batches[ref].total_quantity += qty;
      batches[ref].items.push({
        id: r.id,
        item_name: resolvedName,
        unit: unitStr,
        item_unit: unitStr,
        category: r.category || 'محاليل وكواشف',
        cost_price: costPrice,
        unit_price: costPrice,
        expiry_date: r.expiry_date,
        sent_quantity: qty,
        quantity: qty
      });
    });

    res.json(Object.values(batches));
  } catch (err) {
    console.error('getLabTransfersHistory error:', err);
    res.status(500).json({ message: 'فشل تحميل سجل الشحنات الواردة للمختبر' });
  }
};

exports.receiveBatch = async (req, res) => {
  const { batch_ref } = req.params;
  const conn = await db.getConnection();
  try {
    await ensureLabInventorySchema();
    await conn.beginTransaction();

    let query = `
      SELECT it.*,
             COALESCE(gi.name, oi.name) AS source_item_name,
             COALESCE(gi.description, oi.description) AS source_item_desc,
             COALESCE(gi.unit, oi.unit) AS source_item_unit,
             COALESCE(gi.cost_price, oi.cost_price, 0) AS cost_price,
             COALESCE(gi.expiry_date, oi.expiry_date) AS expiry_date
      FROM inventory_transfers it
      LEFT JOIN general_inventory_items gi ON it.from_store = 'general' AND it.general_item_id = gi.id
      LEFT JOIN or_inventory_items oi ON it.from_store = 'or' AND it.or_item_id = oi.id
      WHERE it.to_store = 'lab' AND it.status = 'pending'
    `;
    const params = [];
    if (batch_ref.startsWith('TRANSFER-')) {
      query += ' AND it.id = ? FOR UPDATE';
      params.push(batch_ref.replace('TRANSFER-', ''));
    } else if (batch_ref.startsWith('LEGACY-')) {
      query += ' AND it.id = ? FOR UPDATE';
      params.push(batch_ref.replace('LEGACY-', ''));
    } else {
      query += ' AND it.batch_ref = ? FOR UPDATE';
      params.push(batch_ref);
    }

    const [transfers] = await conn.query(query, params);

    if (!transfers || transfers.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'الشحنة غير موجودة أو تم استلامها مسبقاً' });
    }

    const acceptedItems = [];
    const senderStores = new Set();

    for (const t of transfers) {
      const qty = parseFloat(t.sent_quantity) || 0;
      const itemName = t.source_item_name || 'صنف مختبر';
      const unit = t.source_item_unit || 'وحدة';
      const cost = parseFloat(t.cost_price) || 0;
      const fromStore = t.from_store || 'general';
      senderStores.add(fromStore);

      // Match item in lab_inventory_items by exact name
      const [[matchedItem]] = await conn.query(
        'SELECT id, quantity FROM lab_inventory_items WHERE name = ? LIMIT 1',
        [itemName]
      );

      let labItemId;
      if (matchedItem) {
        labItemId = matchedItem.id;
        await conn.execute(
          `UPDATE lab_inventory_items
           SET quantity = quantity + ?,
               cost_price = ?,
               expiry_date = COALESCE(?, expiry_date),
               is_active = 1
           WHERE id = ?`,
          [qty, cost, t.expiry_date || null, labItemId]
        );
      } else {
        // Infer category from item name
        let inferredCategory = 'محاليل وكواشف';
        if (itemName.includes('أنبوب') || itemName.includes('انبوب') || itemName.includes('عين')) {
          inferredCategory = 'أنابيب وعينات';
        } else if (itemName.includes('إبر') || itemName.includes('ابر') || itemName.includes('سرنج') || itemName.includes('سحب')) {
          inferredCategory = 'إبر ومستهلكات سحب';
        } else if (itemName.includes('شريط') || itemName.includes('شرائط') || itemName.includes('مسحة')) {
          inferredCategory = 'شرائط ومستلزمات عامة';
        }

        const [insertRes] = await conn.execute(
          `INSERT INTO lab_inventory_items
            (name, description, category, unit, quantity, min_quantity, cost_price, expiry_date, is_active)
           VALUES (?, ?, ?, ?, ?, 5.0000, ?, ?, 1)`,
          [
            itemName,
            t.source_item_desc || null,
            inferredCategory,
            unit,
            qty,
            cost,
            t.expiry_date || null
          ]
        );
        labItemId = insertRes.insertId;
      }

      // Update transfer status
      await conn.execute(
        `UPDATE inventory_transfers
         SET status = 'received',
             received_by = ?,
             received_at = NOW(),
             received_quantity = sent_quantity,
             lab_item_id = ?
         WHERE id = ?`,
        [req.user.id, labItemId, t.id]
      );

      // Record deferred OUT transaction for the sending store ledger
      const sourceItemId = fromStore === 'or' ? t.or_item_id : t.general_item_id;
      const sourceEntity = fromStore === 'or' ? 'مخزن العمليات' : 'المخزن العام';
      if (sourceItemId) {
        await conn.execute(
          `INSERT INTO inventory_transactions
            (item_id, item_type, transaction_type, quantity, unit_price, source_entity, destination_entity, reference_id, notes, performed_by)
           VALUES (?, ?, 'out', ?, ?, ?, 'قسم المختبر', ?, ?, ?)`,
          [
            sourceItemId,
            fromStore === 'or' ? 'or' : 'general',
            qty,
            cost,
            sourceEntity,
            t.batch_ref || batch_ref,
            t.batch_notes || `صرف شحنة مؤكدة لقسم المختبر (${itemName})`,
            t.sent_by || req.user.id
          ]
        );
      }

      acceptedItems.push({
        item_name: itemName,
        quantity: qty,
        unit
      });
    }

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('lab').emit('inventory:updated');
      io.to('auditor').emit('inventory:updated');
      const payload = {
        batch_ref,
        sender_name: 'قسم المختبر',
        received_by: req.user?.full_name || 'فني المختبر',
        item_count: acceptedItems.length,
        item_name: acceptedItems[0]?.item_name
      };
      if (senderStores.has('or')) {
        io.to('or_store').emit('transfer:received', payload);
        io.to('or_store').emit('inventory:updated');
      }
      if (senderStores.has('general')) {
        io.to('general_store').emit('transfer:received', payload);
        io.to('general_store').emit('inventory:updated');
      }
    }

    res.json({ message: 'تم تأكيد استلام الشحنة وإيداع الكميات في رصيد مخزن المختبر بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error('receiveLabBatch error:', err);
    res.status(500).json({ message: 'فشل استلام الشحنة: ' + (err.message || 'خطأ في الخادم') });
  } finally {
    conn.release();
  }
};

exports.rejectBatch = async (req, res) => {
  const { batch_ref } = req.params;
  const { reason, rejection_reason } = req.body;
  const conn = await db.getConnection();
  try {
    await ensureLabInventorySchema();
    await conn.beginTransaction();

    let query = `
      SELECT t.*, COALESCE(gi.name, oi.name, 'صنف') AS item_name
      FROM inventory_transfers t
      LEFT JOIN general_inventory_items gi ON gi.id = t.general_item_id
      LEFT JOIN or_inventory_items oi ON oi.id = t.or_item_id
      WHERE t.to_store = 'lab' AND t.status = 'pending'
    `;
    const params = [];
    if (batch_ref.startsWith('TRANSFER-')) {
      query += ' AND t.id = ? FOR UPDATE';
      params.push(batch_ref.replace('TRANSFER-', ''));
    } else if (batch_ref.startsWith('LEGACY-')) {
      query += ' AND t.id = ? FOR UPDATE';
      params.push(batch_ref.replace('LEGACY-', ''));
    } else {
      query += ' AND t.batch_ref = ? FOR UPDATE';
      params.push(batch_ref);
    }

    const [transfers] = await conn.query(query, params);

    if (!transfers || transfers.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'الشحنة غير موجودة أو تم البت فيها مسبقاً' });
    }

    const rejectionReason = reason || rejection_reason || 'تم الرفض بواسطة قسم المختبر';
    const senderStores = new Set();

    for (const t of transfers) {
      const qty = parseFloat(t.sent_quantity) || 0;
      const fromStore = t.from_store || 'general';
      senderStores.add(fromStore);

      if (fromStore === 'or' && t.or_item_id && qty > 0) {
        await conn.execute(
          'UPDATE or_inventory_items SET quantity = quantity + ? WHERE id = ?',
          [qty, t.or_item_id]
        );
      } else if (t.general_item_id && qty > 0) {
        await conn.execute(
          'UPDATE general_inventory_items SET quantity = quantity + ? WHERE id = ?',
          [qty, t.general_item_id]
        );
      }

      await conn.execute(
        `UPDATE inventory_transfers
         SET status = 'rejected',
             rejection_reason = ?,
             rejected_by = ?,
             rejected_at = NOW()
         WHERE id = ?`,
        [rejectionReason, req.user.id, t.id]
      );
    }

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('lab').emit('inventory:updated');
      io.to('auditor').emit('inventory:updated');
      const itemName = transfers[0]?.item_name || (transfers.length > 1 ? `${transfers[0]?.item_name} (+${transfers.length - 1})` : 'شحنة');
      const receiverName = 'قسم المختبر';
      const payload = {
        batchRef: batch_ref,
        batch_ref,
        itemName,
        item_name: itemName,
        receiverName,
        receiver_name: receiverName,
        sender_name: receiverName,
        rejected_by: req.user?.full_name || receiverName,
        reason: rejectionReason,
        item_count: transfers.length
      };
      if (senderStores.has('or')) {
        io.to('or_store').emit('transfer:rejected', payload);
        io.to('or_store').emit('inventory:updated');
      }
      if (senderStores.has('general')) {
        io.to('general_store').emit('transfer:rejected', payload);
        io.to('general_store').emit('inventory:updated');
      }
    }

    const storeLabel =
      senderStores.has('or') && !senderStores.has('general') ? 'مخزن العمليات' : 'المخزن العام';
    res.json({ message: `تم رفض الشحنة وإرجاع الكميات إلى ${storeLabel}` });
  } catch (err) {
    await conn.rollback();
    console.error('rejectLabBatch error:', err);
    res.status(500).json({ message: 'فشل رفض الشحنة' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 5. SPOILAGE / WASTAGE LOGGING & CONSUMPTION LOG
// ═══════════════════════════════════════════════════════════════════════════
exports.recordSpoilage = async (req, res) => {
  const { item_id, lab_item_id, lab_test_id, quantity, reason, notes } = req.body;
  const targetItemId = item_id || lab_item_id;
  const parsedQty = parseFloat(quantity);

  const conn = await db.getConnection();
  try {
    await ensureLabInventorySchema();
    await conn.beginTransaction();

    const fullReason = [reason || 'تلف عينة / هدر مخبري', notes].filter(Boolean).join(' - ');

    // Mode A: Spoilage by Lab Test (Re-draw / Repeat Test) -> deducts all BOM items linked to the test
    if (!targetItemId && lab_test_id) {
      const multiplier = !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : 1;
      const [[labTest]] = await conn.query('SELECT id, name FROM lab_tests WHERE id = ?', [lab_test_id]);
      if (!labTest) {
        await conn.rollback();
        return res.status(404).json({ message: 'التحليل المحدد غير موجود' });
      }

      const [bomItems] = await conn.query(
        `SELECT ltc.*, li.name AS item_name, li.unit AS item_unit, COALESCE(li.cost_price, 0) AS cost_price
         FROM lab_test_consumables ltc
         JOIN lab_inventory_items li ON ltc.lab_item_id = li.id
         WHERE ltc.lab_test_id = ? AND li.is_active = 1`,
        [lab_test_id]
      );

      if (bomItems.length === 0) {
        await conn.rollback();
        return res.status(400).json({ message: 'لا توجد أصناف مستهلكات مرتبطة بهذا التحليل' });
      }

      for (const bom of bomItems) {
        const basePerTest =
          bom.consumption_mode === 'per_unit_yield' && parseFloat(bom.tests_per_unit) > 0
            ? 1 / parseFloat(bom.tests_per_unit)
            : parseFloat(bom.quantity_per_test) || 1;
        const deductAmt = Number((basePerTest * multiplier).toFixed(4));
        const unitCost = Number(parseFloat(bom.cost_price || 0).toFixed(2));
        const totalCost = Number((deductAmt * unitCost).toFixed(2));

        await conn.execute(
          'UPDATE lab_inventory_items SET quantity = ROUND(quantity - ?, 4) WHERE id = ?',
          [deductAmt, bom.lab_item_id]
        );

        await conn.execute(
          `INSERT INTO clinical_consumption_log
            (store, item_id, item_name, item_unit, qty_deducted, unit_cost, total_cost, service_id, service_name, trigger_type, notes, performed_by)
           VALUES ('lab', ?, ?, ?, ?, ?, ?, ?, ?, 'wastage', ?, ?)`,
          [
            bom.lab_item_id,
            bom.item_name,
            bom.item_unit || 'وحدة',
            deductAmt,
            unitCost,
            totalCost,
            labTest.id,
            labTest.name,
            fullReason,
            req.user.id
          ]
        );
      }

      await conn.commit();

      const io = req.app.get('io');
      if (io) {
        io.to('lab').emit('inventory:updated');
        io.to('auditor').emit('inventory:updated');
      }

      return res.json({
        message: `تم تسجيل الهدر وخصم مستهلكات التحليل (${labTest.name}) بنجاح`
      });
    }

    // Mode B: Direct Item Spoilage
    if (!targetItemId || isNaN(parsedQty) || parsedQty <= 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'يرجى تحديد الصنف وإدخال كمية تالف/هدر صحيحة' });
    }

    const [[item]] = await conn.query(
      'SELECT id, name, unit, quantity, COALESCE(cost_price, 0) AS cost_price FROM lab_inventory_items WHERE id = ? AND is_active = 1',
      [targetItemId]
    );

    if (!item) {
      await conn.rollback();
      return res.status(404).json({ message: 'الصنف غير موجود في مخزن المختبر' });
    }

    const unitCost = Number(parseFloat(item.cost_price || 0).toFixed(2));
    const totalCost = Number((parsedQty * unitCost).toFixed(2));

    await conn.execute(
      'UPDATE lab_inventory_items SET quantity = ROUND(quantity - ?, 4) WHERE id = ?',
      [parsedQty, item.id]
    );

    await conn.execute(
      `INSERT INTO clinical_consumption_log
        (store, item_id, item_name, item_unit, qty_deducted, unit_cost, total_cost, trigger_type, notes, performed_by)
       VALUES ('lab', ?, ?, ?, ?, ?, ?, 'wastage', ?, ?)`,
      [item.id, item.name, item.unit || 'وحدة', parsedQty, unitCost, totalCost, fullReason, req.user.id]
    );

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('lab').emit('inventory:updated');
      io.to('auditor').emit('inventory:updated');
    }

    res.json({ message: 'تم تسجيل التالف/الهدر وخصم الكمية من رصيد المختبر بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error('recordLabSpoilage error:', err);
    res.status(500).json({ message: 'فشل تسجيل الهدر في مخزن المختبر' });
  } finally {
    conn.release();
  }
};

// Alias for consistency with radiologyInventoryController
exports.recordWastage = exports.recordSpoilage;

exports.getConsumptionLog = async (req, res) => {
  const { startDate, endDate, trigger_type, search, limit = 50000, offset = 0 } = req.query;
  try {
    await ensureLabInventorySchema();

    const params = [];
    let whereClause = "WHERE ccl.store = 'lab' AND ccl.trigger_type != 'reversal'";

    if (startDate && endDate) {
      whereClause += ' AND ccl.performed_at BETWEEN ? AND ?';
      params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    }

    if (trigger_type && trigger_type !== 'all') {
      whereClause += ' AND ccl.trigger_type = ?';
      params.push(trigger_type);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClause += ` AND (
        COALESCE(ccl.item_name, li.name, '') LIKE ? OR
        COALESCE(ccl.item_unit, li.unit, '') LIKE ? OR
        COALESCE(li.category, '') LIKE ? OR
        COALESCE(ccl.service_name, '') LIKE ? OR
        COALESCE(ccl.patient_name, '') LIKE ? OR
        COALESCE(u.full_name, '') LIKE ? OR
        (CASE
          WHEN ccl.trigger_type = 'procedure_consumption' THEN 'استهلاك تحليل'
          WHEN ccl.trigger_type = 'wastage' THEN 'تالف إتلاف اتلاف هدر'
          ELSE ''
        END) LIKE ?
      )`;
      params.push(term, term, term, term, term, term, term);
    }

    const [[aggRow]] = await db.query(
      `SELECT 
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN ccl.trigger_type = 'procedure_consumption' THEN ccl.total_cost ELSE 0 END), 0) AS total_consumption_cost,
         COALESCE(SUM(CASE WHEN ccl.trigger_type = 'wastage' THEN ccl.total_cost ELSE 0 END), 0) AS total_wastage_cost,
         COALESCE(SUM(ccl.total_cost), 0) AS total_deducted_cost,
         COALESCE(SUM(CASE WHEN ccl.trigger_type = 'procedure_consumption' THEN 1 ELSE 0 END), 0) AS consumption_count,
         COALESCE(SUM(CASE WHEN ccl.trigger_type = 'wastage' THEN 1 ELSE 0 END), 0) AS wastage_count
       FROM clinical_consumption_log ccl
       LEFT JOIN lab_inventory_items li ON ccl.item_id = li.id
       LEFT JOIN users u ON ccl.performed_by = u.id
       ${whereClause}`,
      params
    );

    const total = Number(aggRow?.total || 0);
    const totalConsumptionCost = Number(parseFloat(aggRow?.total_consumption_cost || 0).toFixed(2));
    const totalWastageCost = Number(parseFloat(aggRow?.total_wastage_cost || 0).toFixed(2));
    const totalDeductedCost = Number(parseFloat(aggRow?.total_deducted_cost || 0).toFixed(2));
    const consumptionCount = Number(aggRow?.consumption_count || 0);
    const wastageCount = Number(aggRow?.wastage_count || 0);
    const wastageRatioPercent =
      totalDeductedCost > 0
        ? Number(((totalWastageCost / totalDeductedCost) * 100).toFixed(1))
        : 0;

    const query = `
      SELECT 
        ccl.*,
        COALESCE(li.category, 'محاليل وكواشف') AS category,
        COALESCE(li.unit, ccl.item_unit) AS resolved_unit,
        u.full_name AS technician_name
      FROM clinical_consumption_log ccl
      LEFT JOIN lab_inventory_items li ON ccl.item_id = li.id
      LEFT JOIN users u ON ccl.performed_by = u.id
      ${whereClause}
      ORDER BY ccl.performed_at DESC
      LIMIT ? OFFSET ?
    `;

    const parsedLimit = parseInt(limit) || 50000;
    const parsedOffset = parseInt(offset) || 0;
    const queryParams = [...params, parsedLimit, parsedOffset];
    const [rows] = await db.query(query, queryParams);

    res.json({
      total,
      logs: rows,
      data: rows,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset
      },
      summary: {
        total,
        total_consumption_cost: totalConsumptionCost,
        total_wastage_cost: totalWastageCost,
        total_deducted_cost: totalDeductedCost,
        consumption_count: consumptionCount,
        wastage_count: wastageCount,
        wastage_ratio_percent: wastageRatioPercent
      }
    });
  } catch (err) {
    console.error('getLabConsumptionLog error:', err);
    res.status(500).json({ message: 'فشل تحميل سجل استهلاك المختبر' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 6. FINANCIAL & OPERATIONAL ANALYTICS (REVENUE VS. COGS & WASTAGE)
// ═══════════════════════════════════════════════════════════════════════════
exports.getLabFinancialAnalytics = async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    await ensureLabInventorySchema();

    const hasDateFilter = Boolean(startDate && endDate);
    const startDateTime = hasDateFilter ? `${startDate} 00:00:00` : null;
    const endDateTime = hasDateFilter ? `${endDate} 23:59:59` : null;

    const execDateClause = hasDateFilter
      ? 'AND COALESCE(vlr.performed_at, vlr.requested_at) BETWEEN ? AND ?'
      : '';
    const cogsDateClause = hasDateFilter
      ? 'AND ccl.performed_at BETWEEN ? AND ?'
      : '';

    const queryParams = [];
    if (hasDateFilter) {
      queryParams.push(startDateTime, endDateTime, startDateTime, endDateTime);
    }

    const [rows] = await db.query(
      `SELECT 
         lt.id AS lab_test_id,
         lt.name AS test_name,
         lt.price AS catalog_price,
         lt.is_active,
         COALESCE(lc.name, 'عام') AS category_name,

         -- 1. Standard BOM Cost per 1 Execution
         COALESCE(bom_agg.standard_bom_cost, 0) AS standard_bom_cost,
         COALESCE(bom_agg.consumables_count, 0) AS consumables_count,

         -- 2. Realized Executions & Revenue from visit_lab_requests
         COALESCE(exec_agg.total_executions, 0) AS total_executions,
         COALESCE(exec_agg.paid_executions, 0) AS paid_executions,
         COALESCE(exec_agg.free_executions, 0) AS free_executions,
         COALESCE(exec_agg.gross_revenue, 0) AS gross_revenue,
         COALESCE(exec_agg.total_discounts, 0) AS total_discounts,
         COALESCE(exec_agg.net_revenue, 0) AS total_revenue,

         -- 3. Historical COGS & Test-Linked Wastage from clinical_consumption_log
         COALESCE(cogs_agg.procedure_cogs, 0) AS logged_procedure_cogs,
         COALESCE(cogs_agg.wastage_cost, 0) AS wastage_cost,
         COALESCE(cogs_agg.logged_deductions_count, 0) AS logged_deductions_count

       FROM lab_tests lt
       LEFT JOIN lab_categories lc ON lt.category_id = lc.id

       -- Subquery 1: Standard BOM Valuation per Test
       LEFT JOIN (
         SELECT 
           ltc.lab_test_id,
           COUNT(ltc.id) AS consumables_count,
           ROUND(SUM(
             (CASE 
               WHEN ltc.consumption_mode = 'per_unit_yield' AND ltc.tests_per_unit > 0 
                 THEN (1 / ltc.tests_per_unit)
               ELSE ltc.quantity_per_test
             END) * COALESCE(li.cost_price, 0)
           ), 2) AS standard_bom_cost
         FROM lab_test_consumables ltc
         JOIN lab_inventory_items li ON ltc.lab_item_id = li.id AND li.is_active = 1
         GROUP BY ltc.lab_test_id
       ) bom_agg ON bom_agg.lab_test_id = lt.id

       -- Subquery 2: Realized Executions & Revenue from visit_lab_requests
       LEFT JOIN (
         SELECT 
           vlr.lab_test_id,
           COUNT(vlr.id) AS total_executions,
           SUM(CASE WHEN COALESCE(vlr.is_free, 0) = 0 AND vlr.final_price > 0 THEN 1 ELSE 0 END) AS paid_executions,
           SUM(CASE WHEN COALESCE(vlr.is_free, 0) = 1 OR vlr.final_price = 0 THEN 1 ELSE 0 END) AS free_executions,
           ROUND(SUM(COALESCE(vlr.price, 0)), 2) AS gross_revenue,
           ROUND(SUM(COALESCE(vlr.discount_amount, 0)), 2) AS total_discounts,
           ROUND(SUM(COALESCE(vlr.final_price, 0)), 2) AS net_revenue
         FROM visit_lab_requests vlr
         WHERE vlr.status = 'completed'
           ${execDateClause}
         GROUP BY vlr.lab_test_id
       ) exec_agg ON exec_agg.lab_test_id = lt.id

       -- Subquery 3: Historical COGS & Test-Linked Wastage from clinical_consumption_log
       LEFT JOIN (
         SELECT 
           ccl.service_id AS lab_test_id,
           COUNT(ccl.id) AS logged_deductions_count,
           ROUND(SUM(CASE WHEN ccl.trigger_type = 'procedure_consumption' THEN ccl.total_cost ELSE 0 END), 2) AS procedure_cogs,
           ROUND(SUM(CASE WHEN ccl.trigger_type = 'wastage' THEN ccl.total_cost ELSE 0 END), 2) AS wastage_cost
         FROM clinical_consumption_log ccl
         WHERE ccl.store = 'lab'
           AND ccl.service_id IS NOT NULL
           AND ccl.trigger_type IN ('procedure_consumption', 'wastage')
           ${cogsDateClause}
         GROUP BY ccl.service_id
       ) cogs_agg ON cogs_agg.lab_test_id = lt.id

       WHERE lt.is_deleted = 0
       ORDER BY total_revenue DESC, total_executions DESC, lt.name ASC`,
      queryParams
    );

    // Unallocated wastage (direct item spoilage not tied to a specific lab_test_id)
    const unallocParams = hasDateFilter ? [startDateTime, endDateTime] : [];
    const [[unallocRow]] = await db.query(
      `SELECT 
         COALESCE(SUM(total_cost), 0) AS unallocated_wastage_cost,
         COUNT(*) AS unallocated_wastage_count
       FROM clinical_consumption_log
       WHERE store = 'lab'
         AND trigger_type = 'wastage'
         AND service_id IS NULL
         ${hasDateFilter ? 'AND performed_at BETWEEN ? AND ?' : ''}`,
      unallocParams
    );

    const unallocatedWastageCost = Number(parseFloat(unallocRow?.unallocated_wastage_cost || 0).toFixed(2));
    const unallocatedWastageCount = Number(unallocRow?.unallocated_wastage_count || 0);

    let totalCompletedExecutions = 0;
    let totalPaidExecutions = 0;
    let totalFreeExecutions = 0;
    let totalGrossRevenue = 0;
    let totalDiscounts = 0;
    let totalNetRevenue = 0;
    let totalProcedureCogs = 0;
    let totalTestWastageCost = 0;

    const testsAnalytics = rows.map(r => {
      const catalogPrice = Number(parseFloat(r.catalog_price || 0).toFixed(2));
      const standardBomCost = Number(parseFloat(r.standard_bom_cost || 0).toFixed(2));
      const consumablesCount = Number(r.consumables_count || 0);
      const totalExecutions = Number(r.total_executions || 0);
      const paidExecutions = Number(r.paid_executions || 0);
      const freeExecutions = Number(r.free_executions || 0);
      const grossRevenue = Number(parseFloat(r.gross_revenue || 0).toFixed(2));
      const totalDiscountsTest = Number(parseFloat(r.total_discounts || 0).toFixed(2));
      const totalRevenue = Number(parseFloat(r.total_revenue || 0).toFixed(2));
      const loggedProcedureCogs = Number(parseFloat(r.logged_procedure_cogs || 0).toFixed(2));
      const wastageCost = Number(parseFloat(r.wastage_cost || 0).toFixed(2));
      const loggedDeductionsCount = Number(r.logged_deductions_count || 0);

      // Effective procedure COGS: prefer historical logged cost, fallback to standard BOM * executions if unlogged
      const isEstimatedCogs = loggedProcedureCogs === 0 && totalExecutions > 0 && standardBomCost > 0;
      const effectiveProcedureCogs =
        loggedProcedureCogs > 0
          ? loggedProcedureCogs
          : isEstimatedCogs
          ? Number((totalExecutions * standardBomCost).toFixed(2))
          : 0;

      const totalCogs = Number((effectiveProcedureCogs + wastageCost).toFixed(2));
      const netProfit = Number((totalRevenue - totalCogs).toFixed(2));
      const standardProfitPerTest = Number((catalogPrice - standardBomCost).toFixed(2));
      const standardMarginPercent =
        catalogPrice > 0 ? Number(((standardProfitPerTest / catalogPrice) * 100).toFixed(1)) : 0;

      let profitMarginPercent = 0;
      if (totalRevenue > 0) {
        profitMarginPercent = Number(((netProfit / totalRevenue) * 100).toFixed(1));
      } else if (totalCogs > 0) {
        profitMarginPercent = -100;
      } else {
        profitMarginPercent = standardMarginPercent;
      }

      totalCompletedExecutions += totalExecutions;
      totalPaidExecutions += paidExecutions;
      totalFreeExecutions += freeExecutions;
      totalGrossRevenue += grossRevenue;
      totalDiscounts += totalDiscountsTest;
      totalNetRevenue += totalRevenue;
      totalProcedureCogs += effectiveProcedureCogs;
      totalTestWastageCost += wastageCost;

      return {
        lab_test_id: r.lab_test_id,
        test_name: r.test_name,
        category_name: r.category_name,
        is_active: r.is_active,
        catalog_price: catalogPrice,
        standard_bom_cost: standardBomCost,
        standard_profit_per_test: standardProfitPerTest,
        standard_margin_percent: standardMarginPercent,
        consumables_count: consumablesCount,
        total_executions: totalExecutions,
        paid_executions: paidExecutions,
        free_executions: freeExecutions,
        gross_revenue: grossRevenue,
        total_discounts: totalDiscountsTest,
        total_revenue: totalRevenue,
        logged_procedure_cogs: loggedProcedureCogs,
        effective_procedure_cogs: effectiveProcedureCogs,
        is_estimated_cogs: isEstimatedCogs,
        wastage_cost: wastageCost,
        total_cogs: totalCogs,
        net_profit: netProfit,
        profit_margin_percent: profitMarginPercent,
        logged_deductions_count: loggedDeductionsCount
      };
    });

    const totalWastageCost = Number((totalTestWastageCost + unallocatedWastageCost).toFixed(2));
    const totalCogsAndWastage = Number((totalProcedureCogs + totalWastageCost).toFixed(2));
    const netOperatingProfit = Number((totalNetRevenue - totalCogsAndWastage).toFixed(2));
    const overallProfitMarginPercent =
      totalNetRevenue > 0
        ? Number(((netOperatingProfit / totalNetRevenue) * 100).toFixed(1))
        : 0;

    res.json({
      tests: testsAnalytics,
      summary: {
        total_tests_count: testsAnalytics.length,
        active_executed_tests_count: testsAnalytics.filter(t => t.total_executions > 0 || t.total_cogs > 0).length,
        total_completed_executions: totalCompletedExecutions,
        total_paid_executions: totalPaidExecutions,
        total_free_executions: totalFreeExecutions,
        total_gross_revenue: Number(totalGrossRevenue.toFixed(2)),
        total_discounts: Number(totalDiscounts.toFixed(2)),
        total_net_revenue: Number(totalNetRevenue.toFixed(2)),
        total_procedure_cogs: Number(totalProcedureCogs.toFixed(2)),
        total_test_wastage_cost: Number(totalTestWastageCost.toFixed(2)),
        unallocated_wastage_cost: unallocatedWastageCost,
        unallocated_wastage_count: unallocatedWastageCount,
        total_wastage_cost: totalWastageCost,
        total_cogs_and_wastage: totalCogsAndWastage,
        net_operating_profit: netOperatingProfit,
        overall_profit_margin_percent: overallProfitMarginPercent
      }
    });
  } catch (err) {
    console.error('getLabFinancialAnalytics error:', err);
    res.status(500).json({ message: 'فشل تحميل التحليل المالي والتشغيلي للمختبر' });
  }
};

