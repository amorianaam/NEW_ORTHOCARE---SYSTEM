const db = require('../database/db');

// ── Auto-Init & Historical Cost Backfill for Radiology Sub-Store ───────────
let radSchemaInitPromise = null;

async function ensureRadHistoricalCostBackfill() {
  if (radSchemaInitPromise) return radSchemaInitPromise;

  radSchemaInitPromise = (async () => {
    try {
      const [cclUnitCostCol] = await db.query(
        "SHOW COLUMNS FROM clinical_consumption_log LIKE 'unit_cost'"
      );
      if (cclUnitCostCol.length === 0) {
        await db.query(`
          ALTER TABLE clinical_consumption_log
            ADD COLUMN unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER qty_deducted,
            ADD COLUMN total_cost DECIMAL(12, 2) NOT NULL DEFAULT 0.00 AFTER unit_cost
        `);
      }

      // Backfill historical radiology consumption & wastage records that have 0.00 cost
      await db.query(`
        UPDATE clinical_consumption_log ccl
        JOIN rad_inventory_items ri ON ccl.store = 'radiology' AND ccl.item_id = ri.id
        SET ccl.unit_cost = ri.cost_price,
            ccl.total_cost = ROUND(ccl.qty_deducted * ri.cost_price, 2)
        WHERE ccl.store = 'radiology' AND ccl.unit_cost = 0.00 AND ri.cost_price > 0
      `);
    } catch (err) {
      console.error('[RadiologyInventory] Historical cost backfill error:', err.message);
      radSchemaInitPromise = null;
    }
  })();

  return radSchemaInitPromise;
}

ensureRadHistoricalCostBackfill().catch(() => {});
exports.ensureRadHistoricalCostBackfill = ensureRadHistoricalCostBackfill;

// 1. Get Radiology Sub-Store Items & Stats
exports.getInventoryItems = async (req, res) => {
  try {
    await ensureRadHistoricalCostBackfill();

    const includeInactive = req.query.includeInactive === 'true';
    const whereClause = includeInactive ? '' : 'WHERE is_active = 1';
    const [items] = await db.query(`
      SELECT id, name, description, film_type, unit, quantity, min_quantity, cost_price, expiry_date, is_active, updated_at
      FROM rad_inventory_items
      ${whereClause}
      ORDER BY 
        is_active DESC,
        CASE 
          WHEN film_type = 'large' THEN 1
          WHEN film_type = 'small' THEN 2
          ELSE 3
        END,
        name ASC
    `);

    // Calculate real-time indicators (based on active items)
    const activeItems = items.filter(it => Number(it.is_active) !== 0);
    let totalItems = activeItems.length;
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

    // Check pending incoming transfers count
    const [[{ pendingTransfers }]] = await db.query(`
      SELECT COUNT(DISTINCT COALESCE(batch_ref, CONCAT('TRANSFER-', id))) as pendingTransfers
      FROM inventory_transfers
      WHERE to_store = 'radiology' AND status = 'pending'
    `);

    // Monthly movements count
    const [[{ monthlyMovements }]] = await db.query(`
      SELECT COUNT(*) AS monthlyMovements
      FROM clinical_consumption_log
      WHERE store = 'radiology'
        AND trigger_type != 'reversal'
        AND performed_at >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')
    `);

    res.json({
      items,
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
    console.error('getInventoryItems error:', err);
    res.status(500).json({ message: 'فشل تحميل مخزون قسم الأشعة' });
  }
};

// Helper: Resolve film_type from explicit column or item name
const resolveFilmType = (explicitFilmType, itemName = '') => {
  if (explicitFilmType === 'large' || explicitFilmType === 'small') return explicitFilmType;
  const n = String(itemName).trim();
  const isFilmWord = n.includes('فيلم') || n.includes('أفلام') || n.includes('افلام');
  if (isFilmWord && n.includes('كبير')) return 'large';
  if (isFilmWord && n.includes('صغير')) return 'small';
  return 'none';
};

// 2. Get Pending Incoming Transfers from General Store or OR Store
exports.getPendingTransfers = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        it.id,
        it.from_store,
        it.batch_ref,
        it.batch_notes,
        it.sent_quantity,
        it.sent_at,
        u.full_name as sent_by_user,
        COALESCE(gi.name, oi.name) as item_name,
        COALESCE(gi.unit, oi.unit) as item_unit,
        COALESCE(gi.film_type, 'none') as film_type,
        COALESCE(NULLIF(gi.cost_price, 0), NULLIF(oi.cost_price, 0), 0) as cost_price,
        COALESCE(NULLIF(gi.cost_price, 0), NULLIF(oi.cost_price, 0), 0) as unit_cost,
        COALESCE(gi.expiry_date, oi.expiry_date) as expiry_date
      FROM inventory_transfers it
      LEFT JOIN users u ON it.sent_by = u.id
      LEFT JOIN general_inventory_items gi ON it.from_store = 'general' AND it.general_item_id = gi.id
      LEFT JOIN or_inventory_items oi ON it.from_store = 'or' AND it.or_item_id = oi.id
      WHERE it.to_store = 'radiology' AND it.status = 'pending'
      ORDER BY it.sent_at DESC
    `);

    // Group by batch_ref
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
          sent_by_name: storeName,
          sent_at: r.sent_at,
          batch_notes: r.batch_notes,
          notes: r.batch_notes,
          item_count: 0,
          total_quantity: 0,
          total_value: 0,
          total_cost: 0,
          items: []
        };
      }
      const resolvedName = r.item_name || 'صنف غير محدد';
      const qty = parseFloat(r.sent_quantity) || 0;
      const unitStr = r.item_unit || 'وحدة';
      const costPrice = parseFloat(r.cost_price) || 0;
      const itemTotalCost = Number((qty * costPrice).toFixed(2));
      batches[ref].item_count += 1;
      batches[ref].total_quantity += qty;
      batches[ref].total_value = Number((batches[ref].total_value + itemTotalCost).toFixed(2));
      batches[ref].total_cost = batches[ref].total_value;
      batches[ref].items.push({
        id: r.id,
        item_name: resolvedName,
        unit: unitStr,
        item_unit: unitStr,
        film_type: resolveFilmType(r.film_type, resolvedName),
        cost_price: costPrice,
        unit_cost: costPrice,
        unit_price: costPrice,
        total_cost: itemTotalCost,
        expiry_date: r.expiry_date,
        sent_quantity: qty,
        quantity: qty
      });
    });

    res.json(Object.values(batches));
  } catch (err) {
    console.error('getPendingTransfers error:', err);
    res.status(500).json({ message: 'فشل تحميل الشحنات الواردة' });
  }
};

// 3. Receive / Accept Incoming Batch Transfer
exports.receiveBatch = async (req, res) => {
  const { batch_ref } = req.params;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    let query = `
      SELECT it.*,
             COALESCE(gi.name, oi.name) as source_item_name,
             COALESCE(gi.unit, oi.unit) as source_item_unit,
             COALESCE(gi.film_type, 'none') as film_type,
             COALESCE(gi.cost_price, oi.cost_price, 0) as cost_price,
             COALESCE(gi.expiry_date, oi.expiry_date) as expiry_date
      FROM inventory_transfers it
      LEFT JOIN general_inventory_items gi ON it.from_store = 'general' AND it.general_item_id = gi.id
      LEFT JOIN or_inventory_items oi ON it.from_store = 'or' AND it.or_item_id = oi.id
      WHERE it.to_store = 'radiology' AND it.status = 'pending'
    `;
    let params = [];
    if (batch_ref.startsWith('TRANSFER-')) {
      const id = batch_ref.replace('TRANSFER-', '');
      query += ` AND it.id = ? FOR UPDATE`;
      params.push(id);
    } else if (batch_ref.startsWith('LEGACY-')) {
      const id = batch_ref.replace('LEGACY-', '');
      query += ` AND it.id = ? FOR UPDATE`;
      params.push(id);
    } else {
      query += ` AND it.batch_ref = ? FOR UPDATE`;
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
      const itemName = t.source_item_name || 'صنف أشعة';
      const filmType = resolveFilmType(t.film_type, itemName);
      const unit = t.source_item_unit || (filmType !== 'none' ? 'فيلم' : 'وحدة');
      const cost = parseFloat(t.cost_price) || 0;
      const fromStore = t.from_store || 'general';
      senderStores.add(fromStore);

      // Match item in rad_inventory_items:
      // Priority 1: Match by film_type if large or small
      // Priority 2: Match by exact name
      let radItem = null;
      if (filmType === 'large' || filmType === 'small') {
        const [[matchedFilm]] = await conn.query(
          "SELECT id, quantity FROM rad_inventory_items WHERE film_type = ? AND is_active = 1 LIMIT 1",
          [filmType]
        );
        radItem = matchedFilm;
      }
      if (!radItem) {
        const [[matchedName]] = await conn.query(
          "SELECT id, quantity FROM rad_inventory_items WHERE name = ? AND is_active = 1 LIMIT 1",
          [itemName]
        );
        radItem = matchedName;
      }

      let radItemId;
      if (radItem) {
        radItemId = radItem.id;
        await conn.execute(
          `UPDATE rad_inventory_items 
           SET quantity = quantity + ?, 
               cost_price = ?, 
               expiry_date = COALESCE(?, expiry_date) 
           WHERE id = ?`,
          [qty, cost, t.expiry_date || null, radItemId]
        );
      } else {
        const [insertRes] = await conn.execute(
          `INSERT INTO rad_inventory_items (name, film_type, unit, quantity, min_quantity, cost_price, expiry_date)
           VALUES (?, ?, ?, ?, 5.0000, ?, ?)`,
          [itemName, filmType, unit, qty, cost, t.expiry_date || null]
        );
        radItemId = insertRes.insertId;
      }

      // Update transfer status
      await conn.execute(
        `UPDATE inventory_transfers 
         SET status = 'received', 
             received_by = ?, 
             received_at = NOW(), 
             received_quantity = sent_quantity, 
             rad_item_id = ? 
         WHERE id = ?`,
        [req.user.id, radItemId, t.id]
      );

      // Record deferred OUT transaction for the sending store ledger
      const sourceItemId = fromStore === 'or' ? t.or_item_id : t.general_item_id;
      const sourceEntity = fromStore === 'or' ? 'مخزن العمليات' : 'المخزن العام';
      if (sourceItemId) {
        await conn.execute(
          `INSERT INTO inventory_transactions 
           (item_id, item_type, transaction_type, quantity, unit_price, source_entity, destination_entity, reference_id, notes, performed_by)
           VALUES (?, ?, 'out', ?, ?, ?, 'قسم الأشعة', ?, ?, ?)`,
          [
            sourceItemId,
            fromStore === 'or' ? 'or' : 'general',
            qty,
            cost,
            sourceEntity,
            t.batch_ref || batch_ref,
            t.batch_notes || `صرف شحنة مؤكدة لقسم الأشعة (${itemName})`,
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
      io.to('radiology').emit('inventory:updated');
      io.to('auditor').emit('inventory:updated');
      const payload = {
        batch_ref,
        sender_name: 'قسم الأشعة',
        received_by: req.user?.full_name || 'فني الأشعة',
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

    res.json({ message: 'تم تأكيد استلام الشحنة وإيداع الكميات في رصيد القسم بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error('receiveBatch error:', err);
    res.status(500).json({ message: 'فشل استلام الشحنة: ' + (err.message || 'خطأ في الخادم') });
  } finally {
    conn.release();
  }
};

// 4. Reject Incoming Batch Transfer
exports.rejectBatch = async (req, res) => {
  const { batch_ref } = req.params;
  const { reason, rejection_reason } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    let query = `
      SELECT t.*, COALESCE(gi.name, oi.name, 'صنف') AS item_name
      FROM inventory_transfers t
      LEFT JOIN general_inventory_items gi ON gi.id = t.general_item_id
      LEFT JOIN or_inventory_items oi ON oi.id = t.or_item_id
      WHERE t.to_store = 'radiology' AND t.status = 'pending'
    `;
    let params = [];
    if (batch_ref.startsWith('TRANSFER-')) {
      query += ` AND t.id = ? FOR UPDATE`;
      params.push(batch_ref.replace('TRANSFER-', ''));
    } else if (batch_ref.startsWith('LEGACY-')) {
      query += ` AND t.id = ? FOR UPDATE`;
      params.push(batch_ref.replace('LEGACY-', ''));
    } else {
      query += ` AND t.batch_ref = ? FOR UPDATE`;
      params.push(batch_ref);
    }

    const [transfers] = await conn.query(query, params);

    if (!transfers || transfers.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'الشحنة غير موجودة أو تم البت فيها مسبقاً' });
    }

    const rejectionReason = reason || rejection_reason || 'تم الرفض بواسطة قسم الأشعة';
    const senderStores = new Set();

    for (const t of transfers) {
      const qty = parseFloat(t.sent_quantity) || 0;
      const fromStore = t.from_store || 'general';
      senderStores.add(fromStore);

      // Refund to the originating store
      if (fromStore === 'or' && t.or_item_id && qty > 0) {
        await conn.execute(
          "UPDATE or_inventory_items SET quantity = quantity + ? WHERE id = ?",
          [qty, t.or_item_id]
        );
      } else if (t.general_item_id && qty > 0) {
        await conn.execute(
          "UPDATE general_inventory_items SET quantity = quantity + ? WHERE id = ?",
          [qty, t.general_item_id]
        );
      }

      // Mark rejected
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
      io.to('radiology').emit('inventory:updated');
      io.to('auditor').emit('inventory:updated');
      const itemName = transfers[0]?.item_name || (transfers.length > 1 ? `${transfers[0]?.item_name} (+${transfers.length - 1})` : 'شحنة');
      const receiverName = 'قسم الأشعة';
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

    const storeLabel = senderStores.has('or') && !senderStores.has('general') ? 'مخزن العمليات' : 'المخزن العام';
    res.json({ message: `تم رفض الشحنة وإرجاع الكميات إلى ${storeLabel}` });
  } catch (err) {
    await conn.rollback();
    console.error('rejectBatch error:', err);
    res.status(500).json({ message: 'فشل رفض الشحنة' });
  } finally {
    conn.release();
  }
};

// 5. Manual Wastage / Damage Logging
exports.recordWastage = async (req, res) => {
  const { item_id, quantity, reason, notes } = req.body;
  const parsedQty = parseFloat(quantity);

  if (!item_id || isNaN(parsedQty) || parsedQty <= 0) {
    return res.status(400).json({ message: 'يرجى إدخال صنف وكمية هدر صحيحة' });
  }

  const conn = await db.getConnection();
  try {
    await ensureRadHistoricalCostBackfill();
    await conn.beginTransaction();

    const [[item]] = await conn.query(
      "SELECT id, name, unit, quantity, COALESCE(cost_price, 0) AS cost_price FROM rad_inventory_items WHERE id = ? AND is_active = 1",
      [item_id]
    );

    if (!item) {
      await conn.rollback();
      return res.status(404).json({ message: 'الصنف غير موجود في مخزن الأشعة' });
    }

    const unitCost = Number(parseFloat(item.cost_price || 0).toFixed(2));
    const totalCost = Number((parsedQty * unitCost).toFixed(2));

    // Deduct quantity (allows negative stock if emergency!)
    await conn.execute(
      "UPDATE rad_inventory_items SET quantity = ROUND(quantity - ?, 4) WHERE id = ?",
      [parsedQty, item.id]
    );

    const fullReason = [reason || 'تلف/هدر يدوي', notes].filter(Boolean).join(' - ');

    // Log to consumption log with financial snapshot
    await conn.execute(`
      INSERT INTO clinical_consumption_log
        (store, item_id, item_name, item_unit, qty_deducted, unit_cost, total_cost, trigger_type, notes, performed_by)
      VALUES
        ('radiology', ?, ?, ?, ?, ?, ?, 'wastage', ?, ?)
    `, [item.id, item.name, item.unit || 'فيلم', parsedQty, unitCost, totalCost, fullReason, req.user.id]);

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('radiology').emit('inventory:updated');
      io.to('auditor').emit('inventory:updated');
    }

    res.json({ message: 'تم تسجيل الهدر وخصم الكمية من الرصيد بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error('recordWastage error:', err);
    res.status(500).json({ message: 'فشل تسجيل الهدر' });
  } finally {
    conn.release();
  }
};

// 6. Get Radiology Consumption & Wastage Log
exports.getConsumptionLog = async (req, res) => {
  const { startDate, endDate, trigger_type, search, limit = 50000, offset = 0 } = req.query;
  try {
    await ensureRadHistoricalCostBackfill();

    const params = [];
    let whereClause = "WHERE ccl.store = 'radiology' AND ccl.trigger_type != 'reversal'";

    if (startDate && endDate) {
      whereClause += " AND ccl.performed_at BETWEEN ? AND ?";
      params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    }

    if (trigger_type && trigger_type !== 'all') {
      whereClause += " AND ccl.trigger_type = ?";
      params.push(trigger_type);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClause += ` AND (
        COALESCE(ccl.item_name, ri.name, '') LIKE ? OR 
        COALESCE(ccl.item_unit, ri.unit, '') LIKE ? OR 
        (CASE 
          WHEN COALESCE(ri.film_type, 'none') = 'large' THEN 'فيلم كبير'
          WHEN COALESCE(ri.film_type, 'none') = 'small' THEN 'فيلم صغير'
          ELSE COALESCE(ccl.item_unit, ri.unit, '')
        END) LIKE ? OR 
        COALESCE(ccl.service_name, '') LIKE ? OR 
        COALESCE(ccl.patient_name, '') LIKE ? OR 
        COALESCE(u.full_name, '') LIKE ? OR 
        (CASE 
          WHEN ccl.trigger_type = 'procedure_consumption' THEN 'استهلاك'
          WHEN ccl.trigger_type = 'wastage' THEN 'إتلاف اتلاف هدر'
          ELSE ''
        END) LIKE ?
      )`;
      params.push(term, term, term, term, term, term, term);
    }

    const [[aggRow]] = await db.query(
      `SELECT 
         COUNT(*) as total,
         COALESCE(SUM(CASE WHEN ccl.trigger_type = 'procedure_consumption' THEN ccl.total_cost ELSE 0 END), 0) AS total_consumption_cost,
         COALESCE(SUM(CASE WHEN ccl.trigger_type = 'wastage' THEN ccl.total_cost ELSE 0 END), 0) AS total_wastage_cost,
         COALESCE(SUM(ccl.total_cost), 0) AS total_deducted_cost,
         COALESCE(SUM(CASE WHEN ccl.trigger_type = 'procedure_consumption' THEN 1 ELSE 0 END), 0) AS consumption_count,
         COALESCE(SUM(CASE WHEN ccl.trigger_type = 'wastage' THEN 1 ELSE 0 END), 0) AS wastage_count
       FROM clinical_consumption_log ccl
       LEFT JOIN rad_inventory_items ri ON ccl.item_id = ri.id
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
        COALESCE(ri.film_type, 'none') as film_type,
        COALESCE(ri.unit, ccl.item_unit) as resolved_unit,
        u.full_name as technician_name
      FROM clinical_consumption_log ccl
      LEFT JOIN rad_inventory_items ri ON ccl.item_id = ri.id
      LEFT JOIN users u ON ccl.performed_by = u.id
      ${whereClause}
      ORDER BY ccl.performed_at DESC
      LIMIT ? OFFSET ?
    `;

    const parsedLimit = parseInt(limit) || 50000;
    const parsedOffset = parseInt(offset) || 0;
    const queryParams = [...params, parsedLimit, parsedOffset];
    const [rows] = await db.query(query, queryParams);

    // Fetch radiology test categories to enrich scan items (matching Archive modal 'الأشعة المنفذة')
    const [testRows] = await db.query(`
      SELECT rt.name, rc.name as category_name
      FROM radiology_tests rt
      LEFT JOIN radiology_categories rc ON rt.category_id = rc.id
    `);
    const testCategoryMap = new Map();
    testRows.forEach(t => {
      if (t.name) {
        testCategoryMap.set(t.name.trim(), t.category_name || null);
      }
    });

    const enrichedLogs = rows.map(r => {
      const resolvedFilmType = resolveFilmType(r.film_type, r.item_name);
      const rawService = String(r.service_name || '').trim();
      const scanNames = rawService
        ? rawService.split(/\s*(?:،|\+)\s*/).map(s => s.trim()).filter(Boolean)
        : [];
      const scans = scanNames.map(sName => ({
        name: sName,
        category_name: testCategoryMap.get(sName) || null
      }));

      return {
        ...r,
        film_type: resolvedFilmType,
        scans
      };
    });

    res.json({
      total,
      logs: enrichedLogs,
      data: enrichedLogs,
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
    console.error('getConsumptionLog error:', err);
    res.status(500).json({ message: 'فشل تحميل سجل الاستهلاك' });
  }
};

// 7. Get Historical Incoming Transfers (Received / Rejected) for Radiology
exports.getTransfersHistory = async (req, res) => {
  const { startDate, endDate, status, search } = req.query;
  try {
    const params = [];
    let whereClause = "WHERE it.to_store = 'radiology' AND it.status IN ('received', 'rejected')";

    if (status && status !== 'all') {
      whereClause += " AND it.status = ?";
      params.push(status);
    }

    if (startDate && endDate) {
      whereClause += " AND COALESCE(it.received_at, it.rejected_at, it.sent_at) BETWEEN ? AND ?";
      params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClause += ` AND (
        COALESCE(ri.name, gi.name, oi.name, '') LIKE ? OR
        COALESCE(ri.unit, gi.unit, oi.unit, '') LIKE ? OR
        (CASE
          WHEN COALESCE(ri.film_type, gi.film_type, 'none') = 'large' THEN 'فيلم كبير'
          WHEN COALESCE(ri.film_type, gi.film_type, 'none') = 'small' THEN 'فيلم صغير'
          ELSE COALESCE(ri.unit, gi.unit, oi.unit, '')
        END) LIKE ? OR
        (CASE WHEN it.from_store = 'or' THEN 'مخزن العمليات' ELSE 'المخزن العام' END) LIKE ?
      )`;
      params.push(term, term, term, term);
    }

    const [rows] = await db.query(`
      SELECT 
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
        u_sent.full_name as sent_by_user,
        u_rec.full_name as received_by_user,
        u_rej.full_name as rejected_by_user,
        COALESCE(ri.name, gi.name, oi.name) as item_name,
        COALESCE(ri.unit, gi.unit, oi.unit) as item_unit,
        COALESCE(ri.film_type, gi.film_type, 'none') as film_type,
        COALESCE(NULLIF(gi.cost_price, 0), NULLIF(oi.cost_price, 0), NULLIF(ri.cost_price, 0), 0) as cost_price,
        COALESCE(NULLIF(gi.cost_price, 0), NULLIF(oi.cost_price, 0), NULLIF(ri.cost_price, 0), 0) as unit_cost,
        COALESCE(ri.expiry_date, gi.expiry_date, oi.expiry_date) as expiry_date
      FROM inventory_transfers it
      LEFT JOIN users u_sent ON it.sent_by = u_sent.id
      LEFT JOIN users u_rec ON it.received_by = u_rec.id
      LEFT JOIN users u_rej ON it.rejected_by = u_rej.id
      LEFT JOIN general_inventory_items gi ON it.from_store = 'general' AND it.general_item_id = gi.id
      LEFT JOIN or_inventory_items oi ON it.from_store = 'or' AND it.or_item_id = oi.id
      LEFT JOIN rad_inventory_items ri ON it.rad_item_id = ri.id
      ${whereClause}
      ORDER BY COALESCE(it.received_at, it.rejected_at, it.sent_at) DESC
    `, params);

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
          sent_by_name: storeName,
          sent_at: r.sent_at,
          resolved_at: actionDate,
          action_at: actionDate,
          action_by_name: actionUser || 'قسم الأشعة',
          batch_notes: r.batch_notes,
          notes: r.batch_notes,
          rejection_reason: r.rejection_reason,
          item_count: 0,
          total_quantity: 0,
          total_value: 0,
          total_cost: 0,
          items: []
        };
      }

      const resolvedName = r.item_name || 'صنف غير محدد';
      const qty = parseFloat(r.received_quantity ?? r.sent_quantity) || 0;
      const unitStr = r.item_unit || 'وحدة';
      const costPrice = parseFloat(r.cost_price) || 0;
      const itemTotalCost = Number((qty * costPrice).toFixed(2));
      batches[ref].item_count += 1;
      batches[ref].total_quantity += qty;
      batches[ref].total_value = Number((batches[ref].total_value + itemTotalCost).toFixed(2));
      batches[ref].total_cost = batches[ref].total_value;
      batches[ref].items.push({
        id: r.id,
        item_name: resolvedName,
        unit: unitStr,
        item_unit: unitStr,
        film_type: resolveFilmType(r.film_type, resolvedName),
        cost_price: costPrice,
        unit_cost: costPrice,
        unit_price: costPrice,
        total_cost: itemTotalCost,
        expiry_date: r.expiry_date,
        sent_quantity: qty,
        quantity: qty
      });
    });

    res.json(Object.values(batches));
  } catch (err) {
    console.error('getTransfersHistory error:', err);
    res.status(500).json({ message: 'فشل تحميل سجل الشحنات الواردة' });
  }
};

// ── 8. Create Radiology Inventory Item (System Admin / Auditor) ─────────────
exports.createInventoryItem = async (req, res) => {
  const {
    name,
    description = '',
    film_type = 'none',
    unit = '',
    quantity = 0,
    min_quantity = 5,
    cost_price = 0,
    expiry_date = null,
    is_active = 1
  } = req.body;

  const cleanName = String(name || '').trim();
  if (!cleanName) {
    return res.status(400).json({ message: 'يرجى إدخال اسم الصنف' });
  }

  const validFilmType = ['large', 'small', 'none'].includes(film_type)
    ? film_type
    : resolveFilmType('none', cleanName);
  const cleanUnit = String(unit || '').trim() || (validFilmType !== 'none' ? 'فيلم' : 'وحدة');
  const parsedQty = isNaN(parseFloat(quantity)) ? 0 : parseFloat(quantity);
  const parsedMin = isNaN(parseFloat(min_quantity)) ? 5 : Math.max(0, parseFloat(min_quantity));
  const parsedCost = isNaN(parseFloat(cost_price)) ? 0 : Math.max(0, parseFloat(cost_price));
  const cleanExpiry = expiry_date && String(expiry_date).trim() ? String(expiry_date).trim() : null;
  const activeFlag = is_active === 0 || is_active === false ? 0 : 1;

  try {
    const [[existing]] = await db.query(
      'SELECT id FROM rad_inventory_items WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND LOWER(TRIM(unit)) = LOWER(TRIM(?)) LIMIT 1',
      [cleanName, cleanUnit]
    );
    if (existing) {
      return res.status(400).json({ message: 'يوجد صنف مسجل بالفعل بنفس الاسم ونفس وحدة القياس في مخزن الأشعة' });
    }

    const [result] = await db.execute(
      `INSERT INTO rad_inventory_items
        (name, description, film_type, unit, quantity, min_quantity, cost_price, expiry_date, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cleanName,
        String(description || '').trim() || null,
        validFilmType,
        cleanUnit,
        parsedQty,
        parsedMin,
        parsedCost,
        cleanExpiry,
        activeFlag
      ]
    );

    const io = req.app.get('io');
    if (io) {
      io.to('radiology').emit('inventory:updated');
      io.to('auditor').emit('inventory:updated');
    }

    res.status(201).json({
      id: result.insertId,
      message: 'تم إضافة الصنف إلى مخزن الأشعة بنجاح'
    });
  } catch (err) {
    console.error('createInventoryItem error:', err);
    res.status(500).json({ message: 'فشل إضافة الصنف إلى مخزن الأشعة' });
  }
};

// ── 9. Update Radiology Inventory Item Details (System Admin / Auditor) ─────
exports.updateInventoryItem = async (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    film_type,
    unit,
    min_quantity,
    cost_price,
    expiry_date,
    is_active
  } = req.body;

  try {
    const [[item]] = await db.query('SELECT * FROM rad_inventory_items WHERE id = ?', [id]);
    if (!item) {
      return res.status(404).json({ message: 'الصنف غير موجود في مخزن الأشعة' });
    }

    const cleanName = name !== undefined ? String(name).trim() : item.name;
    if (!cleanName) {
      return res.status(400).json({ message: 'اسم الصنف لا يمكن أن يكون فارغاً' });
    }

    const validFilmType =
      film_type !== undefined && ['large', 'small', 'none'].includes(film_type)
        ? film_type
        : item.film_type;
    const cleanUnit =
      unit !== undefined
        ? String(unit).trim() || (validFilmType !== 'none' ? 'فيلم' : 'وحدة')
        : item.unit;

    const [[dup]] = await db.query(
      'SELECT id FROM rad_inventory_items WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND LOWER(TRIM(unit)) = LOWER(TRIM(?)) AND id != ? LIMIT 1',
      [cleanName, cleanUnit, id]
    );
    if (dup) {
      return res.status(400).json({ message: 'يوجد صنف آخر مسجل بنفس الاسم ونفس وحدة القياس في مخزن الأشعة' });
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

    await db.execute(
      `UPDATE rad_inventory_items
       SET name = ?,
           description = ?,
           film_type = ?,
           unit = ?,
           min_quantity = ?,
           cost_price = ?,
           expiry_date = ?,
           is_active = ?
       WHERE id = ?`,
      [cleanName, cleanDesc, validFilmType, cleanUnit, parsedMin, parsedCost, cleanExpiry, activeFlag, id]
    );

    // Backfill any historical radiology consumption/wastage records for this item that had 0.00 cost
    if (parsedCost > 0) {
      await db.execute(
        `UPDATE clinical_consumption_log
         SET unit_cost = ?,
             total_cost = ROUND(qty_deducted * ?, 2)
         WHERE store = 'radiology' AND item_id = ? AND unit_cost = 0.00`,
        [parsedCost, parsedCost, id]
      );
    }

    const io = req.app.get('io');
    if (io) {
      io.to('radiology').emit('inventory:updated');
      io.to('auditor').emit('inventory:updated');
    }

    res.json({ message: 'تم تحديث بيانات الصنف بنجاح' });
  } catch (err) {
    console.error('updateInventoryItem error:', err);
    res.status(500).json({ message: 'فشل تحديث بيانات الصنف' });
  }
};

// ── 10. Direct Stock Adjustment / Reconciliation (System Admin / Auditor) ───
exports.adjustInventoryStock = async (req, res) => {
  const { id } = req.params;
  const { mode = 'set', quantity, reason = '' } = req.body;
  const parsedVal = parseFloat(quantity);
  const cleanReason = String(reason || '').trim();

  if (isNaN(parsedVal)) {
    return res.status(400).json({ message: 'يرجى إدخال قيمة رقمية صحيحة لتعديل الرصيد' });
  }
  if (!cleanReason) {
    return res.status(400).json({ message: 'يرجى إدخال سبب التسوية / الملاحظة (حقل إجباري)' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[item]] = await conn.query(
      'SELECT * FROM rad_inventory_items WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!item) {
      await conn.rollback();
      return res.status(404).json({ message: 'الصنف غير موجود في مخزن الأشعة' });
    }

    const currentQty = parseFloat(item.quantity) || 0;
    let newQty = currentQty;

    if (mode === 'add') {
      newQty = currentQty + parsedVal;
    } else if (mode === 'deduct') {
      newQty = currentQty - parsedVal;
    } else {
      // mode === 'set'
      newQty = parsedVal;
    }

    await conn.execute(
      'UPDATE rad_inventory_items SET quantity = ? WHERE id = ?',
      [newQty, id]
    );

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('radiology').emit('inventory:updated');
      io.to('auditor').emit('inventory:updated');
    }

    res.json({
      message: `تم تحديث الرصيد الفعلي للصنف (${item.name}) من ${currentQty} إلى ${newQty} بنجاح`,
      previous_quantity: currentQty,
      new_quantity: newQty,
      reason: cleanReason
    });
  } catch (err) {
    await conn.rollback();
    console.error('adjustInventoryStock error:', err);
    res.status(500).json({ message: 'فشل تعديل رصيد الصنف' });
  } finally {
    conn.release();
  }
};

// ── 11. Delete or Deactivate Radiology Inventory Item (System Admin) ────────
exports.deleteInventoryItem = async (req, res) => {
  const { id } = req.params;
  try {
    const [[item]] = await db.query('SELECT * FROM rad_inventory_items WHERE id = ?', [id]);
    if (!item) {
      return res.status(404).json({ message: 'الصنف غير موجود في مخزن الأشعة' });
    }

    const currentQty = parseFloat(item.quantity) || 0;
    if (Number(item.is_active) !== 0 && currentQty !== 0) {
      return res.status(400).json({
        message: `لا يمكن حذف هذا الصنف لأنه لا يزال يحتوي على كمية في المخزون (${currentQty} ${item.unit || 'وحدة'}). يرجى تصفير الرصيد أولاً عبر تسوية الرصيد ثم إعادة المحاولة.`,
        hasStock: true,
        quantity: currentQty,
        unit: item.unit
      });
    }

    // Check if linked to historical consumption logs or transfers
    const [[{ logCount }]] = await db.query(
      "SELECT COUNT(*) as logCount FROM clinical_consumption_log WHERE store = 'radiology' AND item_id = ?",
      [id]
    );
    const [[{ transferCount }]] = await db.query(
      'SELECT COUNT(*) as transferCount FROM inventory_transfers WHERE rad_item_id = ?',
      [id]
    );

    const hasHistory = (logCount || 0) > 0 || (transferCount || 0) > 0;

    if (hasHistory) {
      const nextActive = Number(item.is_active) === 1 ? 0 : 1;
      await db.execute(
        'UPDATE rad_inventory_items SET is_active = ? WHERE id = ?',
        [nextActive, id]
      );

      const io = req.app.get('io');
      if (io) {
        io.to('radiology').emit('inventory:updated');
        io.to('auditor').emit('inventory:updated');
      }

      return res.json({
        softDeleted: true,
        is_active: nextActive,
        message:
          nextActive === 0
            ? 'تم إيقاف تنشيط الصنف بدلاً من حذفه لارتباطه بسجلات استهلاك أو شحنات سابقة'
            : 'تم إعادة تفعيل الصنف في مخزن الأشعة بنجاح'
      });
    }

    await db.execute('DELETE FROM rad_inventory_items WHERE id = ?', [id]);

    const io = req.app.get('io');
    if (io) {
      io.to('radiology').emit('inventory:updated');
      io.to('auditor').emit('inventory:updated');
    }

    res.json({
      softDeleted: false,
      message: 'تم حذف الصنف نهائياً من مخزن الأشعة بنجاح'
    });
  } catch (err) {
    console.error('deleteInventoryItem error:', err);
    res.status(500).json({ message: 'فشل حذف الصنف من مخزن الأشعة' });
  }
};

// ── 12. Financial & Operational Analytics (Revenue vs. Proportional Shared Film COGS & Wastage) ──
exports.getRadiologyFinancialAnalytics = async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    await ensureRadHistoricalCostBackfill();

    const hasDateFilter = Boolean(startDate && endDate);
    const startDateTime = hasDateFilter ? `${startDate} 00:00:00` : null;
    const endDateTime = hasDateFilter ? `${endDate} 23:59:59` : null;

    // 1. Resolve Large & Small Film Unit Costs from rad_inventory_items
    const [filmCostRows] = await db.query(`
      SELECT film_type, COALESCE(cost_price, 0) AS cost_price, is_active
      FROM rad_inventory_items
      WHERE film_type IN ('large', 'small')
      ORDER BY is_active DESC, cost_price DESC, id ASC
    `);

    let largeFilmCost = 0;
    let smallFilmCost = 0;
    filmCostRows.forEach(fr => {
      const c = parseFloat(fr.cost_price) || 0;
      if (fr.film_type === 'large' && largeFilmCost === 0 && c > 0) {
        largeFilmCost = c;
      } else if (fr.film_type === 'small' && smallFilmCost === 0 && c > 0) {
        smallFilmCost = c;
      }
    });
    const fallbackFilmCost = smallFilmCost > 0 ? smallFilmCost : largeFilmCost;

    // 2. Query all Radiology Tests with Realized Executions, Dual Pricing & Proportional Shared Film COGS
    const execDateClause = hasDateFilter
      ? 'AND COALESCE(vrr.performed_at, vrr.requested_at) BETWEEN ? AND ?'
      : '';

    const queryParams = [largeFilmCost, smallFilmCost, fallbackFilmCost];
    if (hasDateFilter) {
      queryParams.push(startDateTime, endDateTime);
    }

    const [rows] = await db.query(
      `SELECT 
         rt.id AS radiology_test_id,
         rt.name AS test_name,
         COALESCE(rt.price_with_film, 0) AS price_with_film,
         COALESCE(rt.price_without_film, 0) AS price_without_film,
         rt.is_active,
         COALESCE(rc.name, 'عام') AS category_name,

         -- Realized Executions & Dual-Mode Breakdown
         COALESCE(exec_agg.total_executions, 0) AS total_executions,
         COALESCE(exec_agg.with_film_executions, 0) AS with_film_executions,
         COALESCE(exec_agg.without_film_executions, 0) AS without_film_executions,
         COALESCE(exec_agg.paid_executions, 0) AS paid_executions,
         COALESCE(exec_agg.free_executions, 0) AS free_executions,
         COALESCE(exec_agg.shared_film_executions, 0) AS shared_film_executions,
         COALESCE(exec_agg.effective_films_used, 0) AS effective_films_used,

         -- Revenue & Discounts
         COALESCE(exec_agg.gross_revenue, 0) AS gross_revenue,
         COALESCE(exec_agg.total_discounts, 0) AS total_discounts,
         COALESCE(exec_agg.net_revenue, 0) AS total_revenue,

         -- Proportional Shared Film COGS
         COALESCE(exec_agg.allocated_film_cogs, 0) AS allocated_film_cogs

       FROM radiology_tests rt
       LEFT JOIN radiology_categories rc ON rt.category_id = rc.id
       LEFT JOIN (
         SELECT 
           vrr.radiology_test_id,
           COUNT(vrr.id) AS total_executions,
           SUM(CASE WHEN COALESCE(vrr.with_film, 1) = 1 THEN 1 ELSE 0 END) AS with_film_executions,
           SUM(CASE WHEN COALESCE(vrr.with_film, 1) = 0 THEN 1 ELSE 0 END) AS without_film_executions,
           SUM(CASE WHEN COALESCE(vrr.is_free, 0) = 0 AND vrr.final_price > 0 THEN 1 ELSE 0 END) AS paid_executions,
           SUM(CASE WHEN COALESCE(vrr.is_free, 0) = 1 OR vrr.final_price = 0 THEN 1 ELSE 0 END) AS free_executions,
           SUM(CASE WHEN COALESCE(vrr.with_film, 1) = 1 AND COALESCE(film_sharing.scans_on_film, 1) > 1 THEN 1 ELSE 0 END) AS shared_film_executions,
           ROUND(SUM(
             CASE 
               WHEN COALESCE(vrr.with_film, 1) = 1 THEN (1.0 / GREATEST(COALESCE(film_sharing.scans_on_film, 1), 1))
               ELSE 0
             END
           ), 4) AS effective_films_used,
           ROUND(SUM(COALESCE(vrr.price, 0)), 2) AS gross_revenue,
           ROUND(SUM(COALESCE(vrr.discount_amount, 0)), 2) AS total_discounts,
           ROUND(SUM(COALESCE(vrr.final_price, 0)), 2) AS net_revenue,
           ROUND(SUM(
             CASE 
               WHEN COALESCE(vrr.with_film, 1) = 0 THEN 0
               WHEN vrf.film_size = 'large' THEN (? / GREATEST(COALESCE(film_sharing.scans_on_film, 1), 1))
               WHEN vrf.film_size = 'small' THEN (? / GREATEST(COALESCE(film_sharing.scans_on_film, 1), 1))
               ELSE (? / GREATEST(COALESCE(film_sharing.scans_on_film, 1), 1))
             END
           ), 2) AS allocated_film_cogs
         FROM visit_radiology_requests vrr
         LEFT JOIN visit_radiology_films vrf ON vrr.radiology_film_id = vrf.id
         LEFT JOIN (
           SELECT radiology_film_id, COUNT(*) AS scans_on_film
           FROM visit_radiology_requests
           WHERE radiology_film_id IS NOT NULL AND status = 'completed'
           GROUP BY radiology_film_id
         ) film_sharing ON film_sharing.radiology_film_id = vrr.radiology_film_id
         WHERE vrr.status = 'completed'
           ${execDateClause}
         GROUP BY vrr.radiology_test_id
       ) exec_agg ON exec_agg.radiology_test_id = rt.id
       WHERE rt.is_deleted = 0
       ORDER BY total_revenue DESC, total_executions DESC, rt.name ASC`,
      queryParams
    );

    // 3. Query Consumption Log for Wastage & Logged Film Consumption Summary
    const logParams = hasDateFilter ? [startDateTime, endDateTime] : [];
    const [[logSummaryRow]] = await db.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN trigger_type = 'wastage' THEN total_cost ELSE 0 END), 0) AS total_wastage_cost,
         COALESCE(SUM(CASE WHEN trigger_type = 'wastage' THEN 1 ELSE 0 END), 0) AS total_wastage_count,
         COALESCE(SUM(CASE WHEN trigger_type = 'procedure_consumption' THEN total_cost ELSE 0 END), 0) AS logged_procedure_cogs,
         COALESCE(SUM(CASE WHEN trigger_type = 'procedure_consumption' THEN 1 ELSE 0 END), 0) AS logged_procedure_count
       FROM clinical_consumption_log
       WHERE store = 'radiology'
         AND trigger_type IN ('procedure_consumption', 'wastage')
         ${hasDateFilter ? 'AND performed_at BETWEEN ? AND ?' : ''}`,
      logParams
    );

    // 4. Find Top Consumed Item by Financial Value in Radiology Store
    const [topItemRows] = await db.query(
      `SELECT 
         ccl.item_id,
         COALESCE(ri.name, ccl.item_name) AS item_name,
         COALESCE(ri.unit, ccl.item_unit, 'فيلم') AS unit,
         ROUND(SUM(ccl.qty_deducted), 2) AS total_qty,
         ROUND(SUM(ccl.total_cost), 2) AS total_cost
       FROM clinical_consumption_log ccl
       LEFT JOIN rad_inventory_items ri ON ccl.item_id = ri.id
       WHERE ccl.store = 'radiology'
         AND ccl.trigger_type IN ('procedure_consumption', 'wastage')
         ${hasDateFilter ? 'AND ccl.performed_at BETWEEN ? AND ?' : ''}
       GROUP BY ccl.item_id, COALESCE(ri.name, ccl.item_name), COALESCE(ri.unit, ccl.item_unit, 'فيلم')
       ORDER BY total_cost DESC, total_qty DESC
       LIMIT 1`,
      logParams
    );

    const topConsumedItem = topItemRows[0]
      ? {
          item_id: topItemRows[0].item_id,
          item_name: topItemRows[0].item_name,
          unit: topItemRows[0].unit,
          total_qty: Number(parseFloat(topItemRows[0].total_qty || 0).toFixed(2)),
          total_cost: Number(parseFloat(topItemRows[0].total_cost || 0).toFixed(2))
        }
      : null;

    let totalCompletedExecutions = 0;
    let totalWithFilmExecutions = 0;
    let totalWithoutFilmExecutions = 0;
    let totalPaidExecutions = 0;
    let totalFreeExecutions = 0;
    let totalSharedFilmExecutions = 0;
    let totalEffectiveFilmsUsed = 0;
    let totalGrossRevenue = 0;
    let totalDiscounts = 0;
    let totalNetRevenue = 0;
    let totalProcedureCogs = 0;

    let topProfitableTest = null;

    const testsAnalytics = rows.map(r => {
      const priceWithFilm = Number(parseFloat(r.price_with_film || 0).toFixed(2));
      const priceWithoutFilm = Number(parseFloat(r.price_without_film || 0).toFixed(2));
      const catalogPrice = priceWithFilm > 0 ? priceWithFilm : priceWithoutFilm;

      const totalExecutions = Number(r.total_executions || 0);
      const withFilmExecutions = Number(r.with_film_executions || 0);
      const withoutFilmExecutions = Number(r.without_film_executions || 0);
      const paidExecutions = Number(r.paid_executions || 0);
      const freeExecutions = Number(r.free_executions || 0);
      const sharedFilmExecutions = Number(r.shared_film_executions || 0);
      const effectiveFilmsUsed = Number(parseFloat(r.effective_films_used || 0).toFixed(2));

      const grossRevenue = Number(parseFloat(r.gross_revenue || 0).toFixed(2));
      const totalDiscountsTest = Number(parseFloat(r.total_discounts || 0).toFixed(2));
      const totalRevenue = Number(parseFloat(r.total_revenue || 0).toFixed(2));
      const effectiveProcedureCogs = Number(parseFloat(r.allocated_film_cogs || 0).toFixed(2));

      const avgCogsPerExecution =
        totalExecutions > 0 ? Number((effectiveProcedureCogs / totalExecutions).toFixed(2)) : 0;
      const avgCogsPerFilmScan =
        withFilmExecutions > 0 ? Number((effectiveProcedureCogs / withFilmExecutions).toFixed(2)) : 0;

      const netProfit = Number((totalRevenue - effectiveProcedureCogs).toFixed(2));
      const standardFilmCost = fallbackFilmCost;
      const standardProfitPerTest = Number((catalogPrice - standardFilmCost).toFixed(2));
      const standardMarginPercent =
        catalogPrice > 0 ? Number(((standardProfitPerTest / catalogPrice) * 100).toFixed(1)) : 0;

      let profitMarginPercent = 0;
      if (totalRevenue > 0) {
        profitMarginPercent = Number(((netProfit / totalRevenue) * 100).toFixed(1));
      } else if (effectiveProcedureCogs > 0) {
        profitMarginPercent = -100;
      } else {
        profitMarginPercent = standardMarginPercent;
      }

      totalCompletedExecutions += totalExecutions;
      totalWithFilmExecutions += withFilmExecutions;
      totalWithoutFilmExecutions += withoutFilmExecutions;
      totalPaidExecutions += paidExecutions;
      totalFreeExecutions += freeExecutions;
      totalSharedFilmExecutions += sharedFilmExecutions;
      totalEffectiveFilmsUsed += effectiveFilmsUsed;
      totalGrossRevenue += grossRevenue;
      totalDiscounts += totalDiscountsTest;
      totalNetRevenue += totalRevenue;
      totalProcedureCogs += effectiveProcedureCogs;

      const testObj = {
        radiology_test_id: r.radiology_test_id,
        test_name: r.test_name,
        category_name: r.category_name,
        is_active: r.is_active,
        price_with_film: priceWithFilm,
        price_without_film: priceWithoutFilm,
        catalog_price: catalogPrice,
        standard_film_cost: standardFilmCost,
        standard_profit_per_test: standardProfitPerTest,
        standard_margin_percent: standardMarginPercent,
        total_executions: totalExecutions,
        with_film_executions: withFilmExecutions,
        without_film_executions: withoutFilmExecutions,
        paid_executions: paidExecutions,
        free_executions: freeExecutions,
        shared_film_executions: sharedFilmExecutions,
        effective_films_used: effectiveFilmsUsed,
        gross_revenue: grossRevenue,
        total_discounts: totalDiscountsTest,
        total_revenue: totalRevenue,
        effective_procedure_cogs: effectiveProcedureCogs,
        avg_cogs_per_execution: avgCogsPerExecution,
        avg_cogs_per_film_scan: avgCogsPerFilmScan,
        total_cogs: effectiveProcedureCogs,
        net_profit: netProfit,
        profit_margin_percent: profitMarginPercent
      };

      if (
        totalExecutions > 0 &&
        (!topProfitableTest || netProfit > topProfitableTest.net_profit)
      ) {
        topProfitableTest = {
          radiology_test_id: r.radiology_test_id,
          test_name: r.test_name,
          net_profit: netProfit,
          total_revenue: totalRevenue,
          total_executions: totalExecutions
        };
      }

      return testObj;
    });

    const totalWastageCost = Number(parseFloat(logSummaryRow?.total_wastage_cost || 0).toFixed(2));
    const totalWastageCount = Number(logSummaryRow?.total_wastage_count || 0);
    const loggedProcedureCogs = Number(parseFloat(logSummaryRow?.logged_procedure_cogs || 0).toFixed(2));

    const totalCogsAndWastage = Number((totalProcedureCogs + totalWastageCost).toFixed(2));
    const netOperatingProfit = Number((totalNetRevenue - totalCogsAndWastage).toFixed(2));
    const overallProfitMarginPercent =
      totalNetRevenue > 0
        ? Number(((netOperatingProfit / totalNetRevenue) * 100).toFixed(1))
        : 0;
    const avgProfitPerExecution =
      totalCompletedExecutions > 0
        ? Number((netOperatingProfit / totalCompletedExecutions).toFixed(2))
        : 0;
    const wastageToRevenuePercent =
      totalNetRevenue > 0
        ? Number(((totalWastageCost / totalNetRevenue) * 100).toFixed(1))
        : 0;

    res.json({
      tests: testsAnalytics,
      summary: {
        total_tests_count: testsAnalytics.length,
        active_executed_tests_count: testsAnalytics.filter(
          t => t.total_executions > 0 || t.total_cogs > 0
        ).length,
        total_completed_executions: totalCompletedExecutions,
        total_with_film_executions: totalWithFilmExecutions,
        total_without_film_executions: totalWithoutFilmExecutions,
        total_paid_executions: totalPaidExecutions,
        total_free_executions: totalFreeExecutions,
        total_shared_film_executions: totalSharedFilmExecutions,
        total_effective_films_used: Number(totalEffectiveFilmsUsed.toFixed(2)),
        large_film_unit_cost: Number(largeFilmCost.toFixed(2)),
        small_film_unit_cost: Number(smallFilmCost.toFixed(2)),
        total_gross_revenue: Number(totalGrossRevenue.toFixed(2)),
        total_discounts: Number(totalDiscounts.toFixed(2)),
        total_net_revenue: Number(totalNetRevenue.toFixed(2)),
        total_procedure_cogs: Number(totalProcedureCogs.toFixed(2)),
        logged_procedure_cogs: loggedProcedureCogs,
        unallocated_wastage_cost: totalWastageCost,
        unallocated_wastage_count: totalWastageCount,
        total_wastage_cost: totalWastageCost,
        total_cogs_and_wastage: totalCogsAndWastage,
        net_operating_profit: netOperatingProfit,
        overall_profit_margin_percent: overallProfitMarginPercent,
        avg_profit_per_execution: avgProfitPerExecution,
        wastage_to_revenue_percent: wastageToRevenuePercent,
        top_profitable_test: topProfitableTest,
        top_consumed_item: topConsumedItem
      }
    });
  } catch (err) {
    console.error('getRadiologyFinancialAnalytics error:', err);
    res.status(500).json({ message: 'فشل تحميل التحليل المالي والتشغيلي للأشعة' });
  }
};

