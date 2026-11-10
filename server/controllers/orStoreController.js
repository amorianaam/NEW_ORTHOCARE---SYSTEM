const db = require('../database/db');

// ─── HELPERS ──────────────────────────────────────────────────────
async function recordTransaction(conn, { item_id, item_type, transaction_type, quantity, unit_price = 0, source_entity = '', destination_entity = '', reference_id = null, notes = '', performed_by }) {
  await conn.execute(
    `INSERT INTO inventory_transactions 
     (item_id, item_type, transaction_type, quantity, unit_price, source_entity, destination_entity, reference_id, notes, performed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [item_id, item_type, transaction_type, quantity, unit_price, source_entity, destination_entity, reference_id, notes, performed_by]
  );
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════
// ITEMS CRUD
// ═══════════════════════════════════════════════════════════════════
exports.getItemById = async (req, res) => {
  try {
    const [[item]] = await db.execute(`SELECT * FROM or_inventory_items WHERE id = ? AND is_active = 1`, [req.params.id]);
    if (!item) return res.status(404).json({ message: 'الصنف غير موجود' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.getItems = async (req, res) => {
  try {
    const { page, limit, search, unit, stockStatus, dateFilter, startDate, endDate } = req.query;

    if (!page) {
      // Legacy unpaginated behavior for Receive.js / Issue.js
      const [rows] = await db.execute(`SELECT * FROM or_inventory_items WHERE is_active=1 ORDER BY id DESC`);
      return res.json(rows);
    }

    // Advanced paginated behavior
    const offset = (parseInt(page) - 1) * parseInt(limit || 10);
    const parsedLimit = parseInt(limit || 10);

    let whereClauses = ["is_active = 1"];
    const params = [];

    if (search && search.trim() !== '') {
      whereClauses.push("(name LIKE ? OR description LIKE ?)");
      const s = `%${search.trim()}%`;
      params.push(s, s);
    }

    if (unit && unit.trim() !== '') {
      whereClauses.push("unit = ?");
      params.push(unit);
    }

    if (stockStatus === 'low') {
      whereClauses.push("quantity <= min_quantity AND quantity > 0");
    } else if (stockStatus === 'out') {
      whereClauses.push("quantity = 0");
    } else if (stockStatus === 'expiring') {
      whereClauses.push("expiry_date IS NOT NULL AND expiry_date <= DATE_ADD(NOW(), INTERVAL 90 DAY)");
    }

    // Date Filter Logic
    if (dateFilter) {
      if (dateFilter === 'today') {
        whereClauses.push("1 = CURDATE()");
      } else if (dateFilter === '7days') {
        whereClauses.push("1 >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)");
      } else if (dateFilter === '30days') {
        whereClauses.push("1 >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)");
      } else if (dateFilter === 'custom' && startDate && endDate) {
        whereClauses.push("1 BETWEEN ? AND ?");
        params.push(startDate, endDate);
      }
    }

    const whereString = whereClauses.join(" AND ");

    const [[{ totalItems }]] = await db.execute(`SELECT COUNT(*) as totalItems FROM or_inventory_items WHERE ${whereString}`, params);

    // Global Stats Query (Independent of filters)
    const [[globalStats]] = await db.execute(`
      SELECT 
        COUNT(*) as totalItems,
        SUM(CASE WHEN quantity <= min_quantity AND quantity > 0 THEN 1 ELSE 0 END) as lowStock,
        SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) as outOfStock,
        SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date <= DATE_ADD(NOW(), INTERVAL 90 DAY) THEN 1 ELSE 0 END) as expiring
      FROM or_inventory_items 
      WHERE is_active = 1
    `);

    const query = `
      SELECT * FROM or_inventory_items 
      WHERE ${whereString} 
      ORDER BY id DESC 
      LIMIT ${parsedLimit} OFFSET ${offset}
    `;
    const [items] = await db.execute(query, params);

    res.json({
      items,
      pagination: {
        page: parseInt(page),
        limit: parsedLimit,
        totalItems,
        totalPages: Math.ceil(totalItems / parsedLimit)
      },
      stats: {
        totalItems: globalStats.totalItems || 0,
        lowStock: globalStats.lowStock || 0,
        outOfStock: globalStats.outOfStock || 0,
        expiring: globalStats.expiring || 0
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error in getItems' });
  }
};

exports.createItem = async (req, res) => {
  try {
    const { name, description, unit, min_quantity, cost_price, expiry_date, is_manufactured } = req.body;
    const [result] = await db.execute(
      `INSERT INTO or_inventory_items (name, description, unit, min_quantity, cost_price, expiry_date, is_manufactured) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, description, unit, min_quantity || 0, cost_price || 0, expiry_date || null, is_manufactured ? 1 : 0]
    );
    res.json({ message: 'تم إضافة الصنف بنجاح', id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, unit, min_quantity, cost_price, expiry_date, is_manufactured } = req.body;
    await db.execute(
      `UPDATE or_inventory_items SET name=?, description=?, unit=?, min_quantity=?, cost_price=?, expiry_date=?, is_manufactured=? WHERE id=?`,
      [name, description, unit, min_quantity || 0, cost_price || 0, expiry_date || null, is_manufactured ? 1 : 0, id]
    );
    res.json({ message: 'تم تحديث الصنف بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// ═══════════════════════════════════════════════════════════════════
// TRANSFERS (From General Store)
// ═══════════════════════════════════════════════════════════════════
exports.getPendingTransfers = async (req, res) => {
  try {
    // 1. Fetch flat transfers
    const [rows] = await db.execute(`
      SELECT 
        it.*, 
        gi.name AS item_name, 
        gi.unit, 
        gi.cost_price, 
        gi.expiry_date, 
        u.full_name AS sender_name,
        COALESCE(it.batch_ref, CONCAT('LEGACY-', it.id)) AS batch_ref_key
      FROM inventory_transfers it
      JOIN general_inventory_items gi ON gi.id = it.general_item_id
      LEFT JOIN users u ON u.id = it.sent_by
      WHERE it.to_store = 'or' AND it.status = 'pending'
      ORDER BY it.sent_at ASC
    `);

    // 2. Group in JS layer
    const grouped = {};
    
    rows.forEach(row => {
      const key = row.batch_ref_key;
      if (!grouped[key]) {
        grouped[key] = {
          batch_ref_key: key,
          original_batch_ref: row.batch_ref,
          sender_name: row.sender_name,
          sent_at: row.sent_at,
          // Legacy check: fallback to legacy notes querying if empty
          batch_notes: row.batch_notes || null, 
          item_count: 0,
          items: []
        };
      }
      
      grouped[key].item_count += 1;
      grouped[key].items.push({
        id: row.id,
        general_item_id: row.general_item_id,
        item_name: row.item_name,
        unit: row.unit,
        cost_price: row.cost_price,
        sent_quantity: row.sent_quantity,
        expiry_date: row.expiry_date
      });
    });

    // Handle legacy notes from inventory_transactions for old rows that don't have batch_notes
    const legacyBatches = Object.values(grouped).filter(g => !g.batch_notes && g.original_batch_ref);
    if (legacyBatches.length > 0) {
      const batchKeys = legacyBatches.map(g => g.original_batch_ref);
      const inPlaceholders = batchKeys.map(() => '?').join(',');
      const [txnRows] = await db.execute(`
        SELECT reference_id, notes
        FROM inventory_transactions
        WHERE transaction_type = 'out' 
          AND item_type = 'general'
          AND reference_id IN (${inPlaceholders})
      `, batchKeys);
      
      txnRows.forEach(txn => {
        if (grouped[txn.reference_id]) {
          grouped[txn.reference_id].batch_notes = txn.notes;
        }
      });
    }

    const resultList = Object.values(grouped).sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));

    res.json(resultList);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في جلب بيانات الشحنات المعلقة' });
  }
};

exports.receiveBatch = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { batch_ref } = req.params;

    const isLegacy = batch_ref.startsWith('LEGACY-');
    const transferId = isLegacy ? batch_ref.replace('LEGACY-', '') : null;

    let query = `
      SELECT it.*, it.general_item_id, it.batch_notes, gi.name, gi.description, gi.unit, gi.cost_price, gi.expiry_date
      FROM inventory_transfers it
      JOIN general_inventory_items gi ON gi.id = it.general_item_id
      WHERE it.status = 'pending' AND 
    `;
    let params = [];

    if (isLegacy) {
      query += `it.id = ? FOR UPDATE`;
      params.push(transferId);
    } else {
      query += `it.batch_ref = ? FOR UPDATE`;
      params.push(batch_ref);
    }

    const [transfers] = await conn.execute(query, params);

    if (!transfers || transfers.length === 0) {
      throw new Error('الدفعة غير موجودة أو تم استلامها مسبقاً');
    }

    const emittedItems = [];

    for (const transfer of transfers) {
      // Find or create item in OR store
      let orItemId;
      const [[existingItem]] = await conn.execute(`SELECT id FROM or_inventory_items WHERE name = ?`, [transfer.name]);

      if (existingItem) {
        orItemId = existingItem.id;
        await conn.execute(
          `UPDATE or_inventory_items SET quantity = quantity + ?, cost_price = ? WHERE id = ?`,
          [transfer.sent_quantity, transfer.cost_price, orItemId]
        );
      } else {
        const [newResult] = await conn.execute(
          `INSERT INTO or_inventory_items (name, description, unit, quantity, cost_price, expiry_date)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [transfer.name, transfer.description, transfer.unit, transfer.sent_quantity, transfer.cost_price, transfer.expiry_date]
        );
        orItemId = newResult.insertId;
      }

      await conn.execute(
        `UPDATE inventory_transfers SET status='received', received_by=?, received_at=NOW(), received_quantity=?, or_item_id=? WHERE id=?`,
        [req.user.id, transfer.sent_quantity, orItemId, transfer.id]
      );

      // Add delayed OUT transaction for General Store
      await recordTransaction(conn, {
        item_id: transfer.general_item_id,
        item_type: 'general',
        transaction_type: 'out',
        quantity: transfer.sent_quantity,
        unit_price: transfer.cost_price,
        source_entity: 'المخزن العام',
        destination_entity: 'مخزن العمليات',
        reference_id: batch_ref,
        notes: transfer.batch_notes || 'صرف لمخزن العمليات (مؤكد)',
        performed_by: transfer.sent_by // Credit original sender
      });

      // Add IN transaction for OR store
      await recordTransaction(conn, {
        item_id: orItemId,
        item_type: 'or',
        transaction_type: 'in',
        quantity: transfer.sent_quantity,
        unit_price: transfer.cost_price,
        source_entity: 'المخزن العام',
        destination_entity: 'مخزن العمليات',
        reference_id: batch_ref,
        notes: transfer.batch_notes || 'استلام دفعة واردة من المخزن العام',
        performed_by: req.user.id
      });

      emittedItems.push({ item_name: transfer.name, quantity: transfer.sent_quantity, item_unit: transfer.unit });
    }

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('general_store').emit('transfer:received', { 
        message: `تم استلام الدفعة في مخزن العمليات`,
        batch_ref: batch_ref,
        sender_name: req.user?.full_name || req.user?.username || 'مخزن العمليات',
        item_count: transfers.length,
        item_name: transfers[0].name
      });
      io.to('or_store').emit('inventory:updated', { type: 'receive' });
      io.to('general_store').emit('inventory:updated', { type: 'receive' });
    }

    res.json({ message: 'تم استلام الدفعة بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(400).json({ message: err.message || 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

exports.rejectBatch = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { batch_ref } = req.params;
    const { rejection_reason } = req.body;

    if (!rejection_reason) throw new Error('سبب الرفض مطلوب');

    const isLegacy = batch_ref.startsWith('LEGACY-');
    const transferId = isLegacy ? batch_ref.replace('LEGACY-', '') : null;

    let query = `
      SELECT it.*, gi.name, gi.unit 
      FROM inventory_transfers it
      JOIN general_inventory_items gi ON gi.id = it.general_item_id
      WHERE it.status = 'pending' AND 
    `;
    let params = [];

    if (isLegacy) {
      query += `it.id = ? FOR UPDATE`;
      params.push(transferId);
    } else {
      query += `it.batch_ref = ? FOR UPDATE`;
      params.push(batch_ref);
    }

    const [transfers] = await conn.execute(query, params);

    if (!transfers || transfers.length === 0) {
      throw new Error('الدفعة غير موجودة أو تم التعامل معها مسبقاً');
    }

    const emittedItems = [];

    for (const transfer of transfers) {
      await conn.execute(
        `UPDATE general_inventory_items SET quantity = quantity + ? WHERE id = ?`,
        [transfer.sent_quantity, transfer.general_item_id]
      );

      await conn.execute(
        `UPDATE inventory_transfers SET status = 'rejected', rejected_by = ?, rejected_at = NOW(), rejection_reason = ? WHERE id = ?`,
        [req.user.id, rejection_reason, transfer.id]
      );



      emittedItems.push(transfer.name);
    }

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      const itemName = emittedItems[0] || 'شحنة';
      const receiverName = 'مخزن العمليات';
      io.to('general_store').emit('transfer:rejected', { 
        message: `تم رفض دفعة`,
        batchRef: batch_ref,
        batch_ref: batch_ref,
        itemName,
        item_name: itemName,
        item_count: emittedItems.length,
        reason: rejection_reason,
        receiverName,
        receiver_name: receiverName,
        sender_name: receiverName
      });
      io.to('general_store').emit('inventory:updated', { type: 'receive' });
    }

    res.json({ message: 'تم رفض الشحنة واسترجاع الكميات بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(400).json({ message: err.message || 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};
// ═══════════════════════════════════════════════════════════════════
// DIRECT RECEIVE (From External Supplier)
// ═══════════════════════════════════════════════════════════════════
exports.receiveDirectStock = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { supplier, notes } = req.body;
    let items = req.body.items;

    // Parse items if they come as a JSON string (via FormData)
    if (typeof items === 'string') {
      try {
        items = JSON.parse(items);
      } catch (e) {
        items = [];
      }
    }

    const batchId = `REC-OR-${Date.now().toString(36).toUpperCase()}`;
    const emittedItems = [];

    let finalNotes = notes || 'استلام مباشر';
    if (req.file) {
      finalNotes += ` | مرفق الفاتورة: /uploads/orStore/${req.file.filename}`;
    }

    for (let it of items) {
      if (!it.item_id || it.quantity <= 0) continue;
      
      const [[itemData]] = await conn.execute(`SELECT name, unit FROM or_inventory_items WHERE id=?`, [it.item_id]);
      emittedItems.push({
        item_name: itemData?.name || 'صنف',
        item_unit: itemData?.unit || 'وحدة',
        quantity: it.quantity
      });

      await conn.execute(
        `UPDATE or_inventory_items SET quantity = quantity + ?, cost_price = ? WHERE id=?`,
        [it.quantity, it.unit_price, it.item_id]
      );

      await recordTransaction(conn, {
        item_id: it.item_id,
        item_type: 'or',
        transaction_type: 'in',
        quantity: it.quantity,
        unit_price: it.unit_price,
        source_entity: supplier || 'مورد خارجي',
        destination_entity: 'مخزن العمليات',
        reference_id: batchId,
        notes: finalNotes,
        performed_by: req.user.id, reference_id: batchId
      });
    }

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('or_store').emit('inventory:updated', { type: 'receive' });
      io.to('or_store').emit('batch:received', { 
        items: emittedItems,
        supplier: supplier || 'مورد خارجي',
        batchId 
      });
    }

    res.json({ message: 'تم استلام الوارد المباشر بنجاح', batchId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الاستلام' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════════════
// ISSUE STOCK (Fast-Issue to OR)
// ═══════════════════════════════════════════════════════════════════
exports.issueStock = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let { destination, notes } = req.body;
    let items = req.body.items;
    
    if (typeof items === 'string') {
      try {
        items = JSON.parse(items);
      } catch (e) {
        items = [];
      }
    }

    if (!items || !items.length) {
      throw new Error('لا توجد أصناف للصرف');
    }

    const isReturnToGeneral = destination === 'المخزن العام';
    const isRadiologyDest = (destination === 'قسم الأشعة' || destination === 'قسم الاشعة' || destination === 'radiology');
    const isLabDest = (destination === 'قسم المختبر' || destination === 'المختبر' || destination === 'مخزن المختبر' || destination === 'lab');
    const batchPrefix = 'ISS-OR-';
    const batchId = `${batchPrefix}${Date.now().toString(36).toUpperCase()}`;
    const emittedItems = [];

    let finalNotes = notes || (isReturnToGeneral ? 'صرف للمخزن العام' : isRadiologyDest ? 'صرف لقسم الأشعة' : isLabDest ? 'صرف لقسم المختبر' : 'صرف للأقسام');
    if (req.file) {
      finalNotes += ` | مرفق المستند: /uploads/orStore/${req.file.filename}`;
    }

    for (let it of items) {
      const requestedQty = parseFloat(it.quantity) || 0;
      if (!it.item_id || requestedQty <= 0) continue;

      const [[itemData]] = await conn.execute(`SELECT quantity, cost_price, name, unit FROM or_inventory_items WHERE id=? FOR UPDATE`, [it.item_id]);
      if (!itemData) throw new Error('صنف غير موجود');
      if (itemData.quantity < requestedQty) throw new Error(`الكمية غير كافية للصنف: ${itemData.name}`);

      emittedItems.push({
        item_name: itemData.name,
        item_unit: itemData.unit || 'وحدة',
        quantity: requestedQty
      });

      await conn.execute(
        `UPDATE or_inventory_items SET quantity = quantity - ? WHERE id=?`,
        [requestedQty, it.item_id]
      );

      if (isReturnToGeneral) {
        // Deferred Ledger Flow -> General Store
        await conn.execute(
          `INSERT INTO inventory_transfers (from_store, to_store, status, sent_by, sent_quantity, or_item_id, batch_ref, batch_notes)
           VALUES ('or', 'general', 'pending', ?, ?, ?, ?, ?)`,
          [req.user.id, requestedQty, it.item_id, batchId, finalNotes]
        );
      } else if (isRadiologyDest) {
        // Deferred Ledger Flow -> Radiology Store
        await conn.execute(
          `INSERT INTO inventory_transfers (from_store, to_store, status, sent_by, sent_quantity, or_item_id, batch_ref, batch_notes)
           VALUES ('or', 'radiology', 'pending', ?, ?, ?, ?, ?)`,
          [req.user.id, requestedQty, it.item_id, batchId, finalNotes]
        );
      } else if (isLabDest) {
        // Deferred Ledger Flow -> Lab Store
        await conn.execute(
          `INSERT INTO inventory_transfers (from_store, to_store, status, sent_by, sent_quantity, or_item_id, batch_ref, batch_notes)
           VALUES ('or', 'lab', 'pending', ?, ?, ?, ?, ?)`,
          [req.user.id, requestedQty, it.item_id, batchId, finalNotes]
        );
      } else {
        // Standard Issue Flow
        await recordTransaction(conn, {
          item_id: it.item_id,
          item_type: 'or',
          transaction_type: 'out',
          quantity: requestedQty,
          unit_price: itemData.cost_price || 0,
          source_entity: 'مخزن العمليات',
          destination_entity: destination || 'صرف عمليات',
          reference_id: batchId,
          notes: finalNotes,
          performed_by: req.user.id
        });
      }
    }

    await conn.commit();
    
    const io = req.app.get('io');
    if (io) {
      if (isReturnToGeneral) {
        io.to('general_store').emit('transfer:sent', { 
          message: 'لديك شحنة واردة من مخزن العمليات بانتظار الاستلام',
          item_count: emittedItems.length,
          item_name: emittedItems[0]?.item_name,
          quantity_label: emittedItems.length === 1 ? `${emittedItems[0].quantity} ${emittedItems[0].item_unit}` : '',
          sender_name: req.user?.full_name || req.user?.username || 'مخزن العمليات'
        });
      } else if (isRadiologyDest) {
        io.to('radiology').emit('transfer:sent', { 
          message: 'لديك شحنة واردة من مخزن العمليات بانتظار الاستلام',
          item_count: emittedItems.length,
          item_name: emittedItems[0]?.item_name,
          quantity_label: emittedItems.length === 1 ? `${emittedItems[0].quantity} ${emittedItems[0].item_unit}` : '',
          sender_name: req.user?.full_name || req.user?.username || 'مخزن العمليات',
          from_store: 'or'
        });
        io.to('radiology').emit('inventory:updated', { type: 'transfer_sent' });
      } else if (isLabDest) {
        io.to('lab').emit('transfer:sent', { 
          message: 'لديك شحنة واردة من مخزن العمليات بانتظار الاستلام',
          item_count: emittedItems.length,
          item_name: emittedItems[0]?.item_name,
          quantity_label: emittedItems.length === 1 ? `${emittedItems[0].quantity} ${emittedItems[0].item_unit}` : '',
          sender_name: req.user?.full_name || req.user?.username || 'مخزن العمليات',
          from_store: 'or'
        });
        io.to('lab').emit('inventory:updated', { type: 'transfer_sent' });
      }
      
      io.to('or_store').emit('inventory:updated', { type: 'issue' });
      io.to('or_store').emit('batch:issued', { 
        items: emittedItems,
        destination: destination || 'صرف عمليات',
        batchId 
      });
    }

    res.json({ message: 'تم صرف الأصناف بنجاح', batchId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(400).json({ message: err.message || 'خطأ في الصرف' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════════════
// MANUFACTURING (التصنيع)
// ═══════════════════════════════════════════════════════════════════
exports.createManufacturing = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { raw_item_id, raw_quantity, produced_item_id, produced_item_name, produced_item_unit, produced_quantity, waste_percentage = 0, manual_cost } = req.body;

      let finalProducedItemId = produced_item_id;
      if (!finalProducedItemId && produced_item_name) {
          const [insertRes] = await conn.execute(
            'INSERT INTO or_inventory_items (name, unit, cost_price, is_manufactured) VALUES (?, ?, ?, 1)',
            [produced_item_name, produced_item_unit || 'علبة', manual_cost]
          );
          finalProducedItemId = insertRes.insertId;
      }

    if (raw_quantity <= 0 || produced_quantity <= 0) throw new Error('الكميات يجب أن تكون صحيحة وأكبر من الصفر');
    if (manual_cost === undefined || manual_cost === null || manual_cost < 0) throw new Error('يجب إدخال التكلفة اليدوية للمادة المنتجة بشكل صحيح');

    const [[rawItem]] = await conn.execute('SELECT quantity, cost_price, name, unit FROM or_inventory_items WHERE id=?', [raw_item_id]);
    if (rawItem.quantity < raw_quantity) throw new Error(`الكمية غير كافية للمادة الخام: ${rawItem.name}`);

    // Deduct raw material
    await conn.execute('UPDATE or_inventory_items SET quantity = quantity - ? WHERE id=?', [raw_quantity, raw_item_id]);

    // Add produced material
    await conn.execute('UPDATE or_inventory_items SET quantity = quantity + ?, cost_price = ? WHERE id=?', 
      [produced_quantity, manual_cost, finalProducedItemId]);

    // Record manufacturing order
    const [orderRes] = await conn.execute(`
        INSERT INTO manufacturing_orders (raw_item_id, raw_quantity, produced_item_id, produced_quantity, waste_percentage, cost_per_unit, performed_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [raw_item_id, raw_quantity, finalProducedItemId, produced_quantity, waste_percentage, manual_cost, req.user.id]);
      const batchId = 'MFG-' + orderRes.insertId;

    // Fetch the produced item name for readable notes
    const [[producedItemForNotes]] = await conn.execute('SELECT name, unit FROM or_inventory_items WHERE id=?', [finalProducedItemId]);
    const producedItemNameLabel = producedItemForNotes?.name || produced_item_name || 'صنف مجهول';
    const producedItemUnitLabel = producedItemForNotes?.unit || produced_item_unit || '';
    const producedFullName = producedItemUnitLabel ? `${producedItemNameLabel} - ${producedItemUnitLabel}` : producedItemNameLabel;
    
    const rawFullName = rawItem.unit ? `${rawItem.name} - ${rawItem.unit}` : rawItem.name;

    // Record transactions
    await recordTransaction(conn, {
      item_id: raw_item_id, item_type: 'or', transaction_type: 'out', quantity: raw_quantity,
      unit_price: rawItem.cost_price, source_entity: 'تصنيع', destination_entity: 'تصنيع', notes: `استهلكت لتصنيع: ${producedFullName}`, performed_by: req.user.id, reference_id: batchId });
    
    await recordTransaction(conn, {
      item_id: finalProducedItemId, item_type: 'or', transaction_type: 'in', quantity: produced_quantity,
      unit_price: manual_cost, source_entity: 'تصنيع', destination_entity: 'تصنيع', notes: `إنتاج من مادة خام: ${rawFullName}`, performed_by: req.user.id, reference_id: batchId });

    await conn.commit();
    res.json({ message: 'تمت عملية التصنيع والتحويل بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(400).json({ message: err.message || 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

exports.getStocktakingSessions = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT CONCAT('DRAFT-', st.id) AS id, 'draft' AS status, NULL AS batch_id, st.notes,
             st.created_at, NULL AS completed_at,
             u.full_name AS creator_name,
             COUNT(si.id) AS item_count,
             SUM(CASE WHEN si.difference > 0 THEN 1 ELSE 0 END) AS surplus_count,
             SUM(CASE WHEN si.difference < 0 THEN 1 ELSE 0 END) AS deficit_count,
             COALESCE(SUM(si.expected_quantity * gi.cost_price), 0) AS total_expected_value,
             COALESCE(SUM(si.actual_quantity * gi.cost_price), 0) AS total_actual_value
      FROM or_inventory_stocktaking_drafts st
      LEFT JOIN users u ON u.id = st.created_by
      LEFT JOIN or_inventory_stocktaking_draft_items si ON si.draft_id = st.id
      LEFT JOIN or_inventory_items gi ON gi.id = si.item_id
      GROUP BY st.id

      UNION ALL

      SELECT CAST(st.id AS CHAR) AS id, 'completed' AS status, st.batch_id, st.notes,
             st.created_at, st.completed_at,
             u.full_name AS creator_name,
             COUNT(si.id) AS item_count,
             SUM(CASE WHEN si.difference > 0 THEN 1 ELSE 0 END) AS surplus_count,
             SUM(CASE WHEN si.difference < 0 THEN 1 ELSE 0 END) AS deficit_count,
             COALESCE(SUM(si.expected_quantity * gi.cost_price), 0) AS total_expected_value,
             COALESCE(SUM(si.actual_quantity * gi.cost_price), 0) AS total_actual_value
      FROM or_inventory_stocktaking st
      LEFT JOIN users u ON u.id = st.created_by
      LEFT JOIN or_inventory_stocktaking_items si ON si.stocktaking_id = st.id
      LEFT JOIN or_inventory_items gi ON gi.id = si.item_id
      GROUP BY st.id
      ORDER BY (status = 'draft') DESC, created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching stocktaking sessions.' });
  }
};

exports.getStocktakingSessionById = async (req, res) => {
  try {
    let { id } = req.params;
    const isDraft = id.toString().startsWith('DRAFT-');
    if (isDraft) id = id.toString().replace('DRAFT-', '');

    if (isDraft) {
      const [[session]] = await db.execute(`
        SELECT st.id, 'draft' AS status, st.notes, st.created_at, u.full_name AS creator_name
        FROM or_inventory_stocktaking_drafts st
        LEFT JOIN users u ON u.id = st.created_by
        WHERE st.id = ?
      `, [id]);

      if (!session) return res.status(404).json({ message: 'جلسة الجرد غير موجودة' });

      const [items] = await db.execute(`
        SELECT COALESCE(si.id, CONCAT('NEW-', gi.id)) AS id, 
               gi.id AS item_id, 
               COALESCE(si.expected_quantity, gi.quantity) AS expected_quantity, 
               COALESCE(si.actual_quantity, gi.quantity) AS actual_quantity,
               COALESCE(si.difference, 0) AS difference, 
               COALESCE(si.notes, '') AS notes, 
               COALESCE(si.unit, gi.unit) AS unit, 
               COALESCE(si.is_counted, 0) AS is_counted,
               gi.name AS item_name,
               gi.cost_price
        FROM or_inventory_items gi
        LEFT JOIN or_inventory_stocktaking_draft_items si ON gi.id = si.item_id AND si.draft_id = ?
        WHERE gi.is_active = 1
        ORDER BY gi.name ASC
      `, [id]);

      return res.json({ session, items, transactions: [] });
    } else {
      const [[session]] = await db.execute(`
        SELECT st.*, u.full_name AS creator_name
        FROM or_inventory_stocktaking st
        LEFT JOIN users u ON u.id = st.created_by
        WHERE st.id = ?
      `, [id]);

      if (!session) return res.status(404).json({ message: 'جلسة الجرد غير موجودة' });

      const [items] = await db.execute(`
        SELECT si.id, si.item_id, si.expected_quantity, si.actual_quantity,
               si.difference, si.notes, si.unit,
               gi.name AS item_name,
               gi.cost_price
        FROM or_inventory_stocktaking_items si
        LEFT JOIN or_inventory_items gi ON gi.id = si.item_id
        WHERE si.stocktaking_id = ?
        ORDER BY gi.name ASC
      `, [id]);

      let transactions = [];
      if (session.batch_id) {
        const [txRows] = await db.execute(`
          SELECT it.id, it.transaction_type, it.quantity, it.unit_price, it.notes, it.created_at,
                 gi.name AS item_name, gi.unit AS item_unit, gi.cost_price
          FROM inventory_transactions it
          JOIN or_inventory_items gi ON gi.id = it.item_id
          WHERE it.reference_id = ? AND it.item_type = 'or'
          ORDER BY it.id ASC
        `, [session.batch_id]);
        transactions = txRows;
      }
      return res.json({ session, items, transactions });
    }
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.checkDraftStaleness = async (req, res) => {
  try {
    let { id } = req.params;
    if (!id.toString().startsWith('DRAFT-')) {
      return res.json({ stale: false, items: [], auto_synced_items: [] });
    }
    id = id.toString().replace('DRAFT-', '');

    const [[session]] = await db.execute(
      `SELECT id FROM or_inventory_stocktaking_drafts WHERE id = ?`,
      [id]
    );
    if (!session) return res.status(404).json({ message: 'لا يوجد جلسة جرد بهذا المعرف' });

    const [rows] = await db.execute(`
      SELECT
        si.id            AS draft_row_id,
        si.item_id,
        si.expected_quantity AS snapshot_balance,
        si.actual_quantity   AS physical_count,
        si.unit              AS snapshot_unit,
        si.is_counted        AS is_counted,
        gi.name              AS item_name,
        gi.quantity          AS live_balance
      FROM or_inventory_stocktaking_draft_items si
      JOIN or_inventory_items gi ON gi.id = si.item_id
      WHERE si.draft_id = ?
        AND ABS(si.expected_quantity - gi.quantity) > 0
    `, [id]);

    const counted_stale = [];
    const uncounted_stale = [];
    rows.forEach(r => {
      if (r.is_counted) counted_stale.push(r);
      else uncounted_stale.push(r);
    });

    if (uncounted_stale.length > 0) {
      for (let r of uncounted_stale) {
        await db.execute(
          `UPDATE or_inventory_stocktaking_draft_items SET expected_quantity = ?, actual_quantity = ?, difference = 0 WHERE id = ?`,
          [r.live_balance, r.live_balance, r.draft_row_id]
        );
      }
    }

    res.json({
      stale: counted_stale.length > 0,
      item_count: counted_stale.length,
      items: counted_stale.map(r => ({
        draft_row_id:     r.draft_row_id,
        item_id:          r.item_id,
        item_name:        r.item_name,
        unit:             r.snapshot_unit || '',
        snapshot_balance: parseInt(r.snapshot_balance, 10) || 0,
        live_balance:     parseInt(r.live_balance, 10) || 0,
        physical_count:   parseInt(r.physical_count, 10) || 0,
        delta:            (parseInt(r.live_balance, 10) || 0) - (parseInt(r.snapshot_balance, 10) || 0)
      })),
      auto_synced_items: uncounted_stale.map(r => ({
        item_id: r.item_id,
        live_balance: parseInt(r.live_balance, 10) || 0
      }))
    });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.refreshDraftExpected = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let { id } = req.params;
    if (!id.toString().startsWith('DRAFT-')) throw new Error('لا يمكن تحديث جرد معتمد');
    id = id.toString().replace('DRAFT-', '');

    const [[session]] = await conn.execute(
      `SELECT id FROM or_inventory_stocktaking_drafts WHERE id = ?`,
      [id]
    );
    if (!session) throw new Error('مسودة الجرد غير موجودة');

    const [staleItems] = await conn.execute(`
      SELECT si.id as draft_item_id, gi.quantity as live_qty, si.actual_quantity
      FROM or_inventory_stocktaking_draft_items si
      JOIN or_inventory_items gi ON gi.id = si.item_id
      WHERE si.draft_id = ?
        AND ABS(si.expected_quantity - gi.quantity) > 0
    `, [id]);

    for (let row of staleItems) {
      const liveQty = parseFloat(row.live_qty);
      const actualQty = parseFloat(row.actual_quantity);
      const newDiff = actualQty - liveQty;
      await conn.execute(
        `UPDATE or_inventory_stocktaking_draft_items
         SET expected_quantity = ?, difference = ?
         WHERE id = ?`,
        [liveQty, newDiff, row.draft_item_id]
      );
    }

    await conn.commit();
    res.json({ message: 'تم تحديث الكميات المرجعية للمسودة بنجاح' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message || 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

exports.createStocktaking = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { items, isDraft = false, notes = '' } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({ message: 'لا توجد أصناف للجرد' });
    }

    if (isDraft) {
      const [stResult] = await conn.execute(
        `INSERT INTO or_inventory_stocktaking_drafts (notes, created_by)
         VALUES (?, ?)`,
        [notes || '', req.user.id]
      );
      const draftId = stResult.insertId;

      for (let it of items) {
        const expected = parseFloat(it.expected_quantity) || 0;
        const actual   = parseFloat(it.actual_quantity) || 0;
        const diff     = actual - expected;
        if (actual < 0) throw new Error(`كمية غير صحيحة للصنف ID: ${it.item_id}`);

        await conn.execute(
          `INSERT INTO or_inventory_stocktaking_draft_items
             (draft_id, item_id, expected_quantity, actual_quantity, difference, notes, unit, is_counted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [draftId, it.item_id, expected, actual, diff, it.notes || '', it.unit || '', it.is_counted ? 1 : 0]
        );
      }
      await conn.commit();
      return res.json({
        message: 'تم حفظ الجرد كمسودة — يمكنك المتابعة والاعتماد لاحقاً',
        stocktakingId: 'DRAFT-' + draftId,
        status: 'draft'
      });
    }

    // FINALIZATION PATH
    const timestamp = Date.now().toString(36).toUpperCase();
    const batchId = `STK-${timestamp}`;
    const batchInId = `STK-IN-${timestamp}`;
    const batchOutId = `STK-OUT-${timestamp}`;
    
    const [stResult] = await conn.execute(
      `INSERT INTO or_inventory_stocktaking (status, notes, batch_id, created_by, completed_at)
       VALUES ('completed', ?, ?, ?, NOW())`,
      [notes || '', batchId, req.user.id]
    );
    const stocktakingId = stResult.insertId;

    for (let it of items) {
      const expected = parseFloat(it.expected_quantity) || 0;
      const actual   = parseFloat(it.actual_quantity) || 0;
      const diff     = actual - expected;
      if (actual < 0) throw new Error(`كمية غير صحيحة للصنف ID: ${it.item_id}`);

      await conn.execute(
        `INSERT INTO or_inventory_stocktaking_items
         (stocktaking_id, item_id, expected_quantity, actual_quantity, difference, notes, unit)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [stocktakingId, it.item_id, expected, actual, diff, it.notes || '', it.unit || '']
      );

      if (diff !== 0) {
        const [[itemInfo]] = await conn.execute(`SELECT cost_price FROM or_inventory_items WHERE id = ?`, [it.item_id]);
        const currentPrice = itemInfo ? itemInfo.cost_price : 0;

        await conn.execute(
          `UPDATE or_inventory_items SET quantity = ? WHERE id = ?`,
          [actual, it.item_id]
        );

        await recordTransaction(conn, {
          item_id:            it.item_id,
          item_type:          'or',
          transaction_type:   diff > 0 ? 'in' : 'out',
          quantity:           Math.abs(diff),
          unit_price:         currentPrice,
          source_entity:      diff > 0 ? `تسوية جرد - فائض (رقم ${stocktakingId})` : '',
          destination_entity: diff < 0 ? `تسوية جرد - عجز (رقم ${stocktakingId})` : '',
          reference_id:       diff > 0 ? batchInId : batchOutId,
          notes:              it.notes || '',
          performed_by:       req.user.id
        });
      }
    }

    await conn.commit();
    res.json({
      message: 'تم اعتماد الجرد وتحديث الأرصدة بنجاح',
      stocktakingId,
      batchId,
      status: 'completed'
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message || 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

exports.updateStocktakingDraft = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let { id } = req.params;
    if (!id.toString().startsWith('DRAFT-')) throw new Error('لا يمكن تعديل جرد معتمد');
    id = id.toString().replace('DRAFT-', '');
    const { items, notes } = req.body;

    const [[session]] = await conn.execute(
      `SELECT id FROM or_inventory_stocktaking_drafts WHERE id = ?`, [id]
    );
    if (!session) throw new Error('مسودة الجرد غير موجودة');

    await conn.execute(`UPDATE or_inventory_stocktaking_drafts SET notes = ? WHERE id = ?`, [notes || '', id]);
    await conn.execute(`DELETE FROM or_inventory_stocktaking_draft_items WHERE draft_id = ?`, [id]);

    for (let it of items) {
      const expected = parseFloat(it.expected_quantity) || 0;
      const actual   = parseFloat(it.actual_quantity) || 0;
      const diff     = actual - expected;

      await conn.execute(
        `INSERT INTO or_inventory_stocktaking_draft_items
             (draft_id, item_id, expected_quantity, actual_quantity, difference, notes, unit, is_counted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, it.item_id, expected, actual, diff, it.notes || '', it.unit || '', it.is_counted ? 1 : 0]
      );
    }

    await conn.commit();
    res.json({ message: 'تم تحديث المسودة بنجاح' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message || 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

exports.deleteStocktakingDraft = async (req, res) => {
  try {
    let { id } = req.params;
    if (!id.toString().startsWith('DRAFT-')) return res.status(400).json({ message: 'لا يمكن حذف جرد معتمد' });
    id = id.toString().replace('DRAFT-', '');

    const [result] = await db.execute(`DELETE FROM or_inventory_stocktaking_drafts WHERE id = ?`, [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'مسودة غير موجودة' });
    res.json({ message: 'تم حذف المسودة بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.finalizeStocktaking = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let { id } = req.params;
    if (!id.toString().startsWith('DRAFT-')) throw new Error('الجرد ليس مسودة لاعتماده');
    id = id.toString().replace('DRAFT-', '');

    const [[session]] = await conn.execute(`SELECT * FROM or_inventory_stocktaking_drafts WHERE id = ?`, [id]);
    if (!session) throw new Error('جلسة الجرد غير موجودة');

    const [staleRows] = await conn.execute(`
      SELECT COUNT(*) AS stale_count
      FROM or_inventory_stocktaking_draft_items si
      JOIN or_inventory_items gi ON gi.id = si.item_id
      WHERE si.draft_id = ? AND ABS(si.expected_quantity - gi.quantity) > 0
    `, [id]);
    if (staleRows[0].stale_count > 0) throw new Error('يوجد تغيير في أرصدة المخزون منذ إنشاء المسودة. يرجى تحديث الكميات أولاً');

    const timestamp = Date.now().toString(36).toUpperCase();
    const batchId = `STK-${timestamp}`;
    const batchInId = `STK-IN-${timestamp}`;
    const batchOutId = `STK-OUT-${timestamp}`;

    const [items] = await conn.execute(`SELECT * FROM or_inventory_stocktaking_draft_items WHERE draft_id = ?`, [id]);

    const [stResult] = await conn.execute(
      `INSERT INTO or_inventory_stocktaking (status, notes, batch_id, created_by, completed_at)
       VALUES ('completed', ?, ?, ?, NOW())`,
      [session.notes || '', batchId, session.created_by]
    );
    const newStocktakingId = stResult.insertId;

    for (let it of items) {
      const expected = parseFloat(it.expected_quantity) || 0;
      const actual   = parseFloat(it.actual_quantity) || 0;
      const diff     = actual - expected;

      await conn.execute(
        `INSERT INTO or_inventory_stocktaking_items
         (stocktaking_id, item_id, expected_quantity, actual_quantity, difference, notes, unit)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newStocktakingId, it.item_id, expected, actual, diff, it.notes || '', it.unit || '']
      );

      if (diff !== 0) {
        const [[itemInfo]] = await conn.execute(`SELECT cost_price FROM or_inventory_items WHERE id = ?`, [it.item_id]);
        const currentPrice = itemInfo ? itemInfo.cost_price : 0;

        await conn.execute(`UPDATE or_inventory_items SET quantity = ? WHERE id = ?`, [actual, it.item_id]);

        await recordTransaction(conn, {
          item_id:            it.item_id,
          item_type:          'or',
          transaction_type:   diff > 0 ? 'in' : 'out',
          quantity:           Math.abs(diff),
          unit_price:         currentPrice,
          source_entity:      diff > 0 ? `تسوية جرد - فائض (رقم ${newStocktakingId})` : '',
          destination_entity: diff < 0 ? `تسوية جرد - عجز (رقم ${newStocktakingId})` : '',
          reference_id:       diff > 0 ? batchInId : batchOutId,
          notes:              it.notes || '',
          performed_by:       req.user.id
        });
      }
    }

    await conn.execute(`DELETE FROM or_inventory_stocktaking_drafts WHERE id = ?`, [id]);
    await conn.commit();
    res.json({ message: 'تم اعتماد الجرد وتحديث الأرصدة بنجاح', batchId, stocktakingId: newStocktakingId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message || 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const [[totalItems]] = await db.execute(`SELECT COUNT(*) AS total FROM or_inventory_items WHERE is_active=1`);
    const [[lowStock]] = await db.execute(`SELECT COUNT(*) AS total FROM or_inventory_items WHERE is_active=1 AND quantity <= min_quantity`);
    const [lowStockItems] = await db.execute(`SELECT id, name, quantity, min_quantity, unit, cost_price FROM or_inventory_items WHERE is_active=1 AND quantity <= min_quantity`);
    const [[totalValue]] = await db.execute(`SELECT SUM(quantity * cost_price) AS total FROM or_inventory_items WHERE is_active=1`);
    
    // Items expiring within 90 days
    const [expiringItems] = await db.execute(`
      SELECT id, name, quantity, unit, expiry_date, cost_price 
      FROM or_inventory_items 
      WHERE is_active=1 
        AND expiry_date IS NOT NULL 
        AND expiry_date <= DATE_ADD(NOW(), INTERVAL 90 DAY)
      ORDER BY expiry_date ASC
    `);

    // Recent transactions
    const [recentTransactions] = await db.execute(`
      SELECT it.*, i.name AS item_name, u.full_name AS user_name 
      FROM inventory_transactions it
      JOIN or_inventory_items i ON i.id = it.item_id
      LEFT JOIN users u ON u.id = it.performed_by
      WHERE it.item_type = 'or'
      ORDER BY it.created_at DESC LIMIT 5
    `);

    res.json({
      totalItems: totalItems.total,
      lowStock: lowStock.total,
      lowStockItems,
      expiringCount: expiringItems.length,
      expiringItems,
      totalValue: totalValue.total || 0,
      recentTransactions
    });
  } catch (err) {
    console.error(err);
    console.log(err); res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.getDashboardTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    const { dateFilter, startDate, endDate, typeFilter, search, itemId, export: isExport } = req.query;

    let whereClauses = ["it.item_type = 'or'"];
    let params = [];

    // 1. Type Filter
    if (typeFilter === 'in' || typeFilter === 'out') {
      whereClauses.push("it.transaction_type = ?");
      params.push(typeFilter);
    }

    // 2. Date Filter
    if (dateFilter === 'today') {
      whereClauses.push("DATE(it.created_at) = CURDATE()");
    } else if (dateFilter === '7days') {
      whereClauses.push("DATE(it.created_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)");
    } else if (dateFilter === '30days') {
      whereClauses.push("DATE(it.created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)");
    } else if (dateFilter === 'custom' && startDate && endDate) {
      whereClauses.push("DATE(it.created_at) BETWEEN ? AND ?");
      params.push(startDate, endDate);
    }

    // 3. Search Filter
    if (search && search.trim() !== '') {
      whereClauses.push("(it.source_entity LIKE ? OR it.destination_entity LIKE ? OR i.name LIKE ? OR u.full_name LIKE ? OR it.notes LIKE ?)");
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s, s);
    }

    // 4. Specific Item Filter
    if (itemId && itemId.trim() !== '') {
      whereClauses.push("it.item_id = ?");
      params.push(itemId);
    }

    const whereString = whereClauses.join(" AND ");

    const isGrouped = req.query.grouped !== 'false';

    // Query 1: Get total count and aggregate stats
    const [[stats]] = await db.execute(`
      SELECT 
        ${isGrouped ? "COUNT(DISTINCT IFNULL(it.reference_id, it.id))" : "COUNT(it.id)"} as totalItems,
        SUM(CASE WHEN it.transaction_type = 'in' THEN it.quantity ELSE 0 END) as totalReceived,
        SUM(CASE WHEN it.transaction_type = 'out' THEN it.quantity ELSE 0 END) as totalIssued,
        ${isGrouped ? "COUNT(DISTINCT CASE WHEN it.transaction_type = 'in' THEN IFNULL(it.reference_id, it.id) END)" : "SUM(CASE WHEN it.transaction_type = 'in' THEN 1 ELSE 0 END)"} as receivedCount,
        ${isGrouped ? "COUNT(DISTINCT CASE WHEN it.transaction_type = 'out' THEN IFNULL(it.reference_id, it.id) END)" : "SUM(CASE WHEN it.transaction_type = 'out' THEN 1 ELSE 0 END)"} as issuedCount
      FROM inventory_transactions it
      LEFT JOIN or_inventory_items i ON i.id = it.item_id
      LEFT JOIN users u ON u.id = it.performed_by
      WHERE ${whereString}
    `, params);

    const totalItems = stats.totalItems || 0;
    const totalPages = Math.ceil(totalItems / limit);

    // Query 2: Get the actual rows
    let query = isGrouped ? `
      SELECT 
        MIN(it.id) as id,
        it.transaction_type,
        MIN(it.created_at) as created_at,
        it.source_entity,
        it.destination_entity,
        it.notes,
        IFNULL(it.reference_id, CONCAT('_', it.id)) as reference_id,
        MIN(i.name) AS item_name,
        MIN(i.unit) AS item_unit,
        u.full_name AS user_name,
        MIN(i.expiry_date) as expiry_date,
        COUNT(it.id) as items_count,
        SUM(it.quantity) as total_quantity,
        SUM(it.unit_price * it.quantity) as total_value
      FROM inventory_transactions it
      JOIN or_inventory_items i ON i.id = it.item_id
      LEFT JOIN users u ON u.id = it.performed_by
      WHERE ${whereString}
      GROUP BY IFNULL(it.reference_id, it.id), it.transaction_type, it.source_entity, it.destination_entity, it.notes, u.full_name
      ORDER BY created_at DESC
    ` : `
      SELECT 
        it.id as id,
        it.transaction_type,
        it.created_at,
        it.source_entity,
        it.destination_entity,
        it.notes,
        IFNULL(it.reference_id, CONCAT('_', it.id)) as reference_id,
        i.name AS item_name,
        i.unit AS item_unit,
        u.full_name AS user_name,
        i.expiry_date,
        1 as items_count,
        it.quantity as total_quantity,
        it.quantity,
        (it.unit_price * it.quantity) as total_value
      FROM inventory_transactions it
      JOIN or_inventory_items i ON i.id = it.item_id
      LEFT JOIN users u ON u.id = it.performed_by
      WHERE ${whereString}
      ORDER BY it.created_at DESC
    `;

    if (isExport !== 'true') {
      query += ` LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;
    }

    const [transactions] = await db.execute(query, params);

    res.json({
      transactions,
      pagination: {
        page: isExport === 'true' ? 1 : page,
        limit: isExport === 'true' ? totalItems : limit,
        totalItems,
        totalPages: isExport === 'true' ? 1 : totalPages
      },
      stats: {
        totalReceived: stats.totalReceived || 0,
        totalIssued: stats.totalIssued || 0,
        receivedCount: stats.receivedCount || 0,
        issuedCount: stats.issuedCount || 0
      }
    });

  } catch (err) {
    console.error(err);
    console.log(err); res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.getItemMovements = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT it.*, u.full_name as user_name
      FROM inventory_transactions it
      LEFT JOIN users u ON u.id = it.performed_by
      WHERE it.item_id = ? AND it.item_type = 'or'
      ORDER BY it.created_at DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    console.log(err); res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.getItemAuditLogs = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT l.*, u.full_name as user_name
      FROM general_item_audit_logs l
      JOIN users u ON u.id = l.user_id
      WHERE l.item_id = ?
      ORDER BY l.created_at DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    console.log(err); res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.getBatchDetails = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { notes } = req.query;

    let query = `
      SELECT it.id, it.quantity, it.unit_price, it.transaction_type,
             i.name AS item_name, i.unit AS item_unit, i.expiry_date
      FROM inventory_transactions it
      JOIN or_inventory_items i ON i.id = it.item_id
      WHERE it.reference_id = ? AND it.item_type = 'or'
    `;
    let params = [batchId];

    if (notes !== undefined) {
      if (notes === '') {
        query += ` AND (it.notes IS NULL OR it.notes = '')`;
      } else {
        query += ` AND it.notes = ?`;
        params.push(notes);
      }
    }

    query += ` ORDER BY it.id ASC`;

    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.getTransactionDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.execute(`
      SELECT it.id, it.quantity, it.unit_price, it.transaction_type,
             i.name AS item_name, i.unit AS item_unit, i.expiry_date
      FROM inventory_transactions it
      JOIN or_inventory_items i ON i.id = it.item_id
      WHERE it.id = ? AND it.item_type = 'or' AND it.item_type = 'or'
    `, [id]);
    res.json(rows);
  } catch (err) {
    console.log(err); res.status(500).json({ message: 'خطأ في الخادم' });
  }
};


exports.deleteItem = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    const [[item]] = await conn.execute('SELECT quantity, name FROM or_inventory_items WHERE id=?', [id]);
    if (!item) {
      await conn.rollback();
      return res.status(404).json({ message: 'الصنف غير موجود' });
    }

    if (parseFloat(item.quantity) > 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'لا يمكن حذف صنف يحتوي على كمية متوفرة في المخزن' });
    }

    const [[txCount]] = await conn.execute('SELECT COUNT(id) as c FROM inventory_transactions WHERE item_id = ? AND item_type = \'or\'', [id]);
    
    if (txCount.c > 0) {
      // Soft Delete
      await conn.execute('UPDATE or_inventory_items SET is_active=0 WHERE id=?', [id]);
      await conn.execute(
        'INSERT INTO or_item_audit_logs (item_id, user_id, action, changes) VALUES (?, ?, ?, ?)',
        [id, req.user.id, 'DELETE', JSON.stringify({ type: 'soft_delete', item_name: item.name })]
      );
      res.json({ message: 'تم أرشفة الصنف بنجاح لارتباطه بحركات مخزنية' });
    } else {
      // Hard Delete
      await conn.execute('DELETE FROM or_inventory_items WHERE id=?', [id]);
      res.json({ message: 'تم حذف الصنف نهائياً بنجاح' });
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};


// ═══════════════════════════════════════════════════════════════════
// MANUFACTURING LEDGER & REVERSALS
// ═══════════════════════════════════════════════════════════════════

exports.getManufacturingOrders = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        mo.*,
        raw_item.name AS raw_item_name,
        raw_item.unit AS raw_item_unit,
        raw_item.cost_price AS raw_item_cost_price,
        produced_item.name AS produced_item_name,
        produced_item.unit AS produced_item_unit,
        performed_user.full_name AS performed_by_name,
        reversed_user.full_name AS reversed_by_name
      FROM manufacturing_orders mo
      LEFT JOIN or_inventory_items raw_item ON mo.raw_item_id = raw_item.id
      LEFT JOIN or_inventory_items produced_item ON mo.produced_item_id = produced_item.id
      LEFT JOIN users performed_user ON mo.performed_by = performed_user.id
      LEFT JOIN users reversed_user ON mo.reversed_by = reversed_user.id
      ORDER BY mo.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في جلب سجل التصنيع' });
  }
};

exports.reverseManufacturingOrder = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    // 1. Fetch Order
    const [[order]] = await conn.execute('SELECT * FROM manufacturing_orders WHERE id = ? FOR UPDATE', [id]);
    if (!order) throw new Error('أمر التصنيع غير موجود');
    if (order.is_reversed) throw new Error('تم التراجع عن هذا الأمر مسبقاً');

    // Time-lock validation: 24 hours
    const orderAge = Date.now() - new Date(order.created_at).getTime();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    if (orderAge > TWENTY_FOUR_HOURS) {
      throw new Error('لا يمكن التراجع: انتهت مهلة التراجع المسموح بها (24 ساعة).');
    }

    // 2. Stock-Gate Validation (Check produced item stock)
    const [[producedItem]] = await conn.execute('SELECT quantity, name, cost_price FROM or_inventory_items WHERE id = ? FOR UPDATE', [order.produced_item_id]);
    if (!producedItem) throw new Error('المادة المنتجة لم تعد موجودة');
    if (parseFloat(producedItem.quantity) < parseFloat(order.produced_quantity)) {
      throw new Error(`لا يمكن التراجع: الرصيد الحالي (${producedItem.quantity}) للمادة (${producedItem.name}) أقل من الكمية المصنّعة (${order.produced_quantity}). لقد تم صرف جزء منها.`);
    }

    // 3. Fetch raw item
    const [[rawItem]] = await conn.execute('SELECT cost_price FROM or_inventory_items WHERE id = ? FOR UPDATE', [order.raw_item_id]);
    if (!rawItem) throw new Error('المادة الخام لم تعد موجودة');

    // 4. Update Inventory
    // Subtract produced quantity
    await conn.execute('UPDATE or_inventory_items SET quantity = quantity - ? WHERE id = ?', [order.produced_quantity, order.produced_item_id]);
    // Add back raw quantity
    await conn.execute('UPDATE or_inventory_items SET quantity = quantity + ? WHERE id = ?', [order.raw_quantity, order.raw_item_id]);

    // 5. Update Order Status
    await conn.execute('UPDATE manufacturing_orders SET is_reversed = 1, reversed_at = NOW(), reversed_by = ? WHERE id = ?', [req.user.id, id]);

    // 6. Record Compensating Transactions
    const batchId = 'REV-MFG-' + order.id;
    
    // Reverse out the produced item
    await recordTransaction(conn, {
      item_id: order.produced_item_id, item_type: 'or', transaction_type: 'out', quantity: order.produced_quantity,
      unit_price: order.cost_per_unit, source_entity: 'مصنع', destination_entity: 'تسوية وإلغاء', notes: `تراجع عن أمر تصنيع (رقم ${order.id})`, performed_by: req.user.id, reference_id: batchId
    });

    // Reverse in the raw item
    await recordTransaction(conn, {
      item_id: order.raw_item_id, item_type: 'or', transaction_type: 'in', quantity: order.raw_quantity,
      unit_price: rawItem.cost_price, source_entity: 'تسوية وإلغاء', destination_entity: 'مصنع', notes: `استرجاع مادة خام لإلغاء أمر تصنيع (رقم ${order.id})`, performed_by: req.user.id, reference_id: batchId
    });

    await conn.commit();
    res.json({ message: 'تم التراجع عن أمر التصنيع بنجاح واسترجاع المواد الخام' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(400).json({ message: err.message || 'حدث خطأ أثناء محاولة التراجع' });
  } finally {
    conn.release();
  }
};


// ═══════════════════════════════════════════════════════════════════
// PENDING OUTBOUND TRANSFERS (Reverse Logistics)
// ═══════════════════════════════════════════════════════════════════

exports.getPendingOutboundFromOR = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        it.*, 
        oi.name AS item_name, 
        oi.unit, 
        oi.cost_price, 
        oi.expiry_date, 
        COALESCE(it.batch_ref, CONCAT('LEGACY-', it.id)) AS batch_ref_key
      FROM inventory_transfers it
      JOIN or_inventory_items oi ON oi.id = it.or_item_id
      WHERE it.from_store = 'or' AND it.status = 'pending'
      ORDER BY it.sent_at ASC
    `);

    const grouped = {};
    rows.forEach(row => {
      const key = row.batch_ref_key;
      if (!grouped[key]) {
        let destName = 'المخزن العام';
        if (row.to_store === 'radiology') destName = 'قسم الأشعة';
        else if (row.to_store === 'lab') destName = 'قسم المختبر';
        else if (row.to_store === 'general') destName = 'المخزن العام';

        grouped[key] = {
          batch_ref_key: key,
          original_batch_ref: row.batch_ref,
          destination_name: destName,
          sender_name: destName,
          sent_at: row.sent_at,
          batch_notes: row.batch_notes || null, 
          item_count: 0,
          items: []
        };
      }
      
      grouped[key].item_count += 1;
      grouped[key].items.push({
        id: row.id,
        or_item_id: row.or_item_id,
        item_name: row.item_name,
        unit: row.unit,
        cost_price: row.cost_price,
        sent_quantity: row.sent_quantity,
        expiry_date: row.expiry_date
      });
    });

    const resultList = Object.values(grouped).sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
    res.json(resultList);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في جلب الشحنات الصادرة المعلقة' });
  }
};

exports.revokeBatchOR = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { batch_ref } = req.params;

    const isLegacy = batch_ref.startsWith('LEGACY-');
    const transferId = isLegacy ? batch_ref.replace('LEGACY-', '') : null;

    let query = `
      SELECT it.*, oi.name 
      FROM inventory_transfers it
      JOIN or_inventory_items oi ON oi.id = it.or_item_id
      WHERE it.status = 'pending' AND it.from_store = 'or' AND 
    `;
    let params = [];

    if (isLegacy) {
      query += `it.id = ? FOR UPDATE`;
      params.push(transferId);
    } else {
      query += `it.batch_ref = ? FOR UPDATE`;
      params.push(batch_ref);
    }

    const [transfers] = await conn.execute(query, params);

    if (!transfers || transfers.length === 0) {
      throw new Error('الدفعة غير موجودة أو تم التعامل معها مسبقاً من قبل الجهة المستلمة');
    }

    for (const transfer of transfers) {
      await conn.execute(
        `UPDATE or_inventory_items SET quantity = quantity + ? WHERE id = ?`,
        [transfer.sent_quantity, transfer.or_item_id]
      );

      await conn.execute(
        `UPDATE inventory_transfers SET status = 'cancelled', rejected_by = ?, rejected_at = NOW(), rejection_reason = ? WHERE id = ?`,
        [req.user.id, 'تم سحب وإلغاء الشحنة الصادرة بواسطة مخزن العمليات', transfer.id]
      );
    }

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      const toStore = transfers[0]?.to_store;
      const targetRoom = toStore === 'radiology' ? 'radiology' : toStore === 'lab' ? 'lab' : 'general_store';
      const itemName = transfers[0]?.name || (transfers.length > 1 ? `${transfers[0]?.name} (+${transfers.length - 1})` : 'شحنة');
      const senderName = 'مخزن العمليات';
      const reason = 'تم سحب وإلغاء الشحنة الصادرة بواسطة مخزن العمليات';

      const payload = { 
        batchRef: batch_ref,
        batch_ref: batch_ref,
        itemName,
        item_name: itemName,
        senderName,
        sender_name: senderName,
        reason,
        item_count: transfers.length,
        message: `تم سحب وإلغاء الشحنة الصادرة (${batch_ref}) من قبل مخزن العمليات`
      };

      io.to(targetRoom).emit('transfer:revoked', payload);
      if (targetRoom === 'radiology' || targetRoom === 'lab') {
        io.to(targetRoom).emit('inventory:updated', { type: 'revoke' });
      }
      io.to('or_store').emit('inventory:updated', { type: 'revoke' });
    }

    res.json({ message: 'تم سحب وإلغاء الشحنة الصادرة بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(400).json({ message: err.message || 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};
