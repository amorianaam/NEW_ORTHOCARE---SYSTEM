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
exports.getDashboardStats = async (req, res) => {
  try {
    const [[totalItems]] = await db.execute(`SELECT COUNT(*) AS total FROM general_inventory_items WHERE is_active=1`);
    const [[lowStock]] = await db.execute(`SELECT COUNT(*) AS total FROM general_inventory_items WHERE is_active=1 AND quantity <= min_quantity`);
    const [lowStockItems] = await db.execute(`SELECT id, name, quantity, min_quantity, unit, cost_price FROM general_inventory_items WHERE is_active=1 AND quantity <= min_quantity`);
    const [[totalValue]] = await db.execute(`SELECT SUM(quantity * cost_price) AS total FROM general_inventory_items WHERE is_active=1`);
    
    // Items expiring within 90 days
    const [expiringItems] = await db.execute(`
      SELECT id, name, quantity, unit, expiry_date, cost_price 
      FROM general_inventory_items 
      WHERE is_active=1 
        AND expiry_date IS NOT NULL 
        AND expiry_date <= DATE_ADD(NOW(), INTERVAL 90 DAY)
      ORDER BY expiry_date ASC
    `);

    // Recent transactions
    const [recentTransactions] = await db.execute(`
      SELECT it.*, i.name AS item_name, u.full_name AS user_name 
      FROM inventory_transactions it
      JOIN general_inventory_items i ON i.id = it.item_id
      LEFT JOIN users u ON u.id = it.performed_by
      WHERE it.item_type = 'general'
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
    // console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.getDashboardTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    const { dateFilter, startDate, endDate, typeFilter, search, itemId, export: isExport } = req.query;

    let whereClauses = ["it.item_type = 'general'"];
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
      LEFT JOIN general_inventory_items i ON i.id = it.item_id
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
      JOIN general_inventory_items i ON i.id = it.item_id
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
      JOIN general_inventory_items i ON i.id = it.item_id
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
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// ═══════════════════════════════════════════════════════════════════
// ITEMS CRUD
// ═══════════════════════════════════════════════════════════════════
exports.getItems = async (req, res) => {
  try {
    const { page, limit, search, unit, stockStatus, dateFilter, startDate, endDate } = req.query;

    if (!page) {
      // Legacy unpaginated behavior for Receive.js / Issue.js
      const [rows] = await db.execute(`SELECT * FROM general_inventory_items WHERE is_active=1 ORDER BY id DESC, created_at DESC`);
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
        whereClauses.push("DATE(created_at) = CURDATE()");
      } else if (dateFilter === '7days') {
        whereClauses.push("created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)");
      } else if (dateFilter === '30days') {
        whereClauses.push("created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)");
      } else if (dateFilter === 'custom' && startDate && endDate) {
        whereClauses.push("DATE(created_at) BETWEEN ? AND ?");
        params.push(startDate, endDate);
      }
    }

    const whereString = whereClauses.join(" AND ");

    const [[{ totalItems }]] = await db.execute(`SELECT COUNT(*) as totalItems FROM general_inventory_items WHERE ${whereString}`, params);

    // Global Stats Query (Independent of filters)
    const [[globalStats]] = await db.execute(`
      SELECT 
        COUNT(*) as totalItems,
        SUM(CASE WHEN quantity <= min_quantity AND quantity > 0 THEN 1 ELSE 0 END) as lowStock,
        SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) as outOfStock,
        SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date <= DATE_ADD(NOW(), INTERVAL 90 DAY) THEN 1 ELSE 0 END) as expiring
      FROM general_inventory_items 
      WHERE is_active = 1
    `);

    const query = `
      SELECT * FROM general_inventory_items 
      WHERE ${whereString} 
      ORDER BY id DESC, created_at DESC 
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
    // console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.createItem = async (req, res) => {
  try {
    const { name, description, unit, min_quantity, cost_price, expiry_date } = req.body;
    
    // Phase 1: Duplicate Prevention Check
    const [[existing]] = await db.execute(`SELECT id FROM general_inventory_items WHERE name = ? AND unit = ? AND is_active = 1`, [name.trim(), unit]);
    if (existing) {
      return res.status(400).json({ message: 'هذا الصنف بنفس نوع الوحدة موجود مسبقاً' });
    }

    const [result] = await db.execute(
      `INSERT INTO general_inventory_items (name, description, unit, min_quantity, cost_price, expiry_date) VALUES (?, ?, ?, ?, ?, ?)`,
      [name.trim(), description, unit, min_quantity || 0, cost_price || 0, expiry_date || null]
    );
    res.json({ message: 'تم إضافة الصنف بنجاح', id: result.insertId });
  } catch (err) {
    // console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

exports.getItemById = async (req, res) => {
  try {
    const [[item]] = await db.execute(`SELECT * FROM general_inventory_items WHERE id=?`, [req.params.id]);
    if (!item) return res.status(404).json({ message: 'الصنف غير موجود' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: 'خطأ' });
  }
};

exports.updateItem = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { name, description, unit, min_quantity, cost_price, expiry_date } = req.body;
    
    // Duplicate Prevention Check
    const [[existing]] = await conn.execute(`SELECT id FROM general_inventory_items WHERE name = ? AND unit = ? AND is_active = 1 AND id != ?`, [name.trim(), unit, id]);
    if (existing) {
      await conn.rollback();
      return res.status(400).json({ message: 'هذا الصنف بنفس نوع الوحدة موجود مسبقاً' });
    }

    // Fetch old data for audit
    const [[oldData]] = await conn.execute(`SELECT * FROM general_inventory_items WHERE id=?`, [id]);

    await conn.execute(
      `UPDATE general_inventory_items SET name=?, description=?, unit=?, min_quantity=?, cost_price=?, expiry_date=? WHERE id=?`,
      [name.trim(), description, unit, min_quantity || 0, cost_price || 0, expiry_date || null, id]
    );

    // Fetch new data
    const [[newData]] = await conn.execute(`SELECT * FROM general_inventory_items WHERE id=?`, [id]);

    // Calculate changes
    let changes = {};
    const fields = ['name', 'description', 'unit', 'min_quantity', 'cost_price', 'expiry_date'];
    fields.forEach(f => {
      let oldVal = oldData[f];
      let newVal = newData[f];
      if (oldVal instanceof Date) oldVal = oldVal.toISOString().split('T')[0];
      if (newVal instanceof Date) newVal = newVal.toISOString().split('T')[0];
      if (String(oldVal) !== String(newVal)) {
        changes[f] = { old: oldVal, new: newVal };
      }
    });

    if (Object.keys(changes).length > 0) {
      await conn.execute(
        `INSERT INTO general_item_audit_logs (item_id, user_id, action, changes) VALUES (?, ?, ?, ?)`,
        [id, req.user.id, 'UPDATE', JSON.stringify(changes)]
      );
    }

    await conn.commit();
    res.json({ message: 'تم تحديث الصنف بنجاح' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

exports.deleteItem = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    const [[item]] = await conn.execute(`SELECT quantity, name FROM general_inventory_items WHERE id=?`, [id]);
    if (!item) {
      await conn.rollback();
      return res.status(404).json({ message: 'الصنف غير موجود' });
    }

    if (parseFloat(item.quantity) > 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'لا يمكن حذف صنف يحتوي على كمية متوفرة في المخزن' });
    }

    const [[txCount]] = await conn.execute(`SELECT COUNT(id) as c FROM inventory_transactions WHERE item_id = ?`, [id]);
    
    if (txCount.c > 0) {
      // Soft Delete
      await conn.execute(`UPDATE general_inventory_items SET is_active=0 WHERE id=?`, [id]);
      await conn.execute(
        `INSERT INTO general_item_audit_logs (item_id, user_id, action, changes) VALUES (?, ?, ?, ?)`,
        [id, req.user.id, 'DELETE', JSON.stringify({ type: 'soft_delete', item_name: item.name })]
      );
    } else {
      // Hard Delete
      await conn.execute(`DELETE FROM general_inventory_items WHERE id=?`, [id]);
      await conn.execute(
        `INSERT INTO general_item_audit_logs (item_id, user_id, action, changes) VALUES (?, ?, ?, ?)`,
        [null, req.user.id, 'DELETE', JSON.stringify({ type: 'hard_delete', deleted_item_id: id, item_name: item.name })]
      );
    }

    await conn.commit();
    res.json({ message: 'تم حذف الصنف بنجاح' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

exports.getItemMovements = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT it.*, u.full_name as user_name
      FROM inventory_transactions it
      LEFT JOIN users u ON u.id = it.performed_by
      WHERE it.item_id = ? AND it.item_type = 'general'
      ORDER BY it.created_at DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم' });
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
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};

// ═══════════════════════════════════════════════════════════════════
// RECEIVE STOCK
// ═══════════════════════════════════════════════════════════════════
exports.receiveStock = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { supplier, invoice_date, notes } = req.body;
    let items = req.body.items;
    
    // Phase 1: File Handling Architecture (FormData)
    if (typeof items === 'string') {
      items = JSON.parse(items);
    }

    // Generate ONE unique batch ID for this entire receive operation
    const batchId = `REC-${Date.now().toString(36).toUpperCase()}`;
    
    const invoiceUrl = req.file ? `/uploads/generalStore/${req.file.filename}` : null;
    const baseNotes = notes ? notes : 'استلام فاتورة';
    const finalNotes = invoiceUrl ? `${baseNotes} | مرفق الفاتورة: ${invoiceUrl}` : baseNotes;
    
    // Array to hold rich details for notifications
    const emittedItems = [];

    for (let it of items) {
      const receivedQty = parseFloat(it.quantity) || 0;
      if (!it.item_id || receivedQty <= 0) continue;
      
      const [[itemData]] = await conn.execute(`SELECT name, unit FROM general_inventory_items WHERE id=?`, [it.item_id]);
      emittedItems.push({
        item_name: itemData?.name || it.item_name || 'صنف',
        item_unit: itemData?.unit || 'وحدة',
        quantity: receivedQty
      });

      // Update quantity & moving average cost (or just latest cost for simplicity)
      await conn.execute(
        `UPDATE general_inventory_items SET quantity = quantity + ?, cost_price = ? WHERE id=?`,
        [receivedQty, it.unit_price, it.item_id]
      );

      await recordTransaction(conn, {
        item_id: it.item_id,
        item_type: 'general',
        transaction_type: 'in',
        quantity: it.quantity,
        unit_price: it.unit_price,
        source_entity: supplier || 'مورد خارجي',
        destination_entity: 'المخزن العام',
        reference_id: batchId,
        notes: finalNotes,
        performed_by: req.user.id
      });
    }

    await conn.commit();
    
    // Emit scoped socket events
    const io = req.app.get('io');
    if (io) {
      io.to('general_store').emit('inventory:updated', { type: 'receive' });
      // Emit single batch receipt event
      io.to('general_store').emit('batch:received', { 
        items: emittedItems,
        supplier: supplier || 'مورد خارجي'
      });
    }

    res.json({ message: 'تم استلام وتحديث المخزون بنجاح', batchId });
  } catch (err) {
    await conn.rollback();
    // console.error(err);
    res.status(500).json({ message: 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════════════
// ISSUE STOCK
// ═══════════════════════════════════════════════════════════════════
exports.issueStock = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let { destination, items, notes } = req.body; // destination: 'or_store', 'radiology', 'lab', etc.
    
    // Parse items if they come as a JSON string (via FormData)
    if (typeof items === 'string') {
      try {
        items = JSON.parse(items);
      } catch (e) {
        items = [];
      }
    }

    // Generate ONE unique batch ID for this entire issue operation
    const batchId = `ISS-${Date.now().toString(36).toUpperCase()}`;

    let finalNotes = notes || 'صرف للأقسام';
    if (req.file) {
      finalNotes += ` | مرفق المستند: /uploads/generalStore/${req.file.filename}`;
    }

    const emittedItems = [];

    for (let it of items) {
      const requestedQty = parseFloat(it.quantity) || 0;
      if (!it.item_id || requestedQty <= 0) continue;

      // Check stock
      const [[itemData]] = await conn.execute(`SELECT quantity, cost_price, name, unit FROM general_inventory_items WHERE id=?`, [it.item_id]);
      
      const availableStock = parseFloat(itemData.quantity) || 0;
      if (availableStock < requestedQty) {
        throw new Error(`الكمية غير كافية للصنف: ${itemData.name}`);
      }

      emittedItems.push({
        item_name: itemData.name,
        item_unit: itemData.unit || 'وحدة',
        quantity: requestedQty
      });

      // Deduct from general store
      await conn.execute(`UPDATE general_inventory_items SET quantity = quantity - ? WHERE id=?`, [requestedQty, it.item_id]);

      const isRadiologyDest = (destination === 'قسم الأشعة' || destination === 'قسم الاشعة' || destination === 'radiology');
      const isLabDest = (destination === 'قسم المختبر' || destination === 'المختبر' || destination === 'مخزن المختبر' || destination === 'lab');
      const isInternalSubStore = (destination === 'مخزن العمليات' || isRadiologyDest || isLabDest);

      if (!isInternalSubStore) {
        await recordTransaction(conn, {
          item_id: it.item_id,
          item_type: 'general',
          transaction_type: 'out',
          quantity: requestedQty,
          unit_price: itemData.cost_price,
          source_entity: 'المخزن العام',
          destination_entity: destination,
          reference_id: batchId,
          notes: finalNotes,
          performed_by: req.user.id
        });
      }

      // If destination is OR store, Radiology, or Lab, create pending transfer
      if (destination === 'مخزن العمليات') {
        await conn.execute(
          `INSERT INTO inventory_transfers (from_store, to_store, status, sent_by, sent_quantity, general_item_id, batch_ref, batch_notes)
           VALUES ('general', 'or', 'pending', ?, ?, ?, ?, ?)`,
          [req.user.id, requestedQty, it.item_id, batchId, finalNotes]
        );
      } else if (isRadiologyDest) {
        await conn.execute(
          `INSERT INTO inventory_transfers (from_store, to_store, status, sent_by, sent_quantity, general_item_id, batch_ref, batch_notes)
           VALUES ('general', 'radiology', 'pending', ?, ?, ?, ?, ?)`,
          [req.user.id, requestedQty, it.item_id, batchId, finalNotes]
        );
      } else if (isLabDest) {
        await conn.execute(
          `INSERT INTO inventory_transfers (from_store, to_store, status, sent_by, sent_quantity, general_item_id, batch_ref, batch_notes)
           VALUES ('general', 'lab', 'pending', ?, ?, ?, ?, ?)`,
          [req.user.id, requestedQty, it.item_id, batchId, finalNotes]
        );
      }
    }

    await conn.commit();

    // Emit socket
    const io = req.app.get('io');
    if (io) {
      if (destination === 'مخزن العمليات') {
        io.to('or_store').emit('transfer:sent', { 
          message: 'لديك شحنة توريد جديدة من المخزن العام',
          item_count: emittedItems.length,
          item_name: emittedItems[0]?.item_name,
          quantity_label: emittedItems.length === 1 ? `${emittedItems[0].quantity} ${emittedItems[0].item_unit}` : '',
          sender_name: req.user?.full_name || req.user?.username || 'المخزن العام'
        });
      } else if (destination === 'قسم الأشعة' || destination === 'قسم الاشعة' || destination === 'radiology') {
        io.to('radiology').emit('transfer:sent', { 
          message: 'لديك شحنة توريد جديدة من المخزن العام',
          item_count: emittedItems.length,
          item_name: emittedItems[0]?.item_name,
          quantity_label: emittedItems.length === 1 ? `${emittedItems[0].quantity} ${emittedItems[0].item_unit}` : '',
          sender_name: req.user?.full_name || req.user?.username || 'المخزن العام',
          from_store: 'general'
        });
        io.to('radiology').emit('inventory:updated', { type: 'transfer_sent' });
      } else if (destination === 'قسم المختبر' || destination === 'المختبر' || destination === 'مخزن المختبر' || destination === 'lab') {
        io.to('lab').emit('transfer:sent', { 
          message: 'لديك شحنة توريد جديدة من المخزن العام',
          item_count: emittedItems.length,
          item_name: emittedItems[0]?.item_name,
          quantity_label: emittedItems.length === 1 ? `${emittedItems[0].quantity} ${emittedItems[0].item_unit}` : '',
          sender_name: req.user?.full_name || req.user?.username || 'المخزن العام',
          from_store: 'general'
        });
        io.to('lab').emit('inventory:updated', { type: 'transfer_sent' });
      }
      
      io.to('general_store').emit('inventory:updated', { type: 'issue' });
      // Emit single batch issue event
      io.to('general_store').emit('batch:issued', { 
        items: emittedItems,
        destination: destination || 'جهة غير محددة'
      });
    }

    res.json({ message: 'تم صرف المواد بنجاح', batchId });
  } catch (err) {
    await conn.rollback();
    // console.error(err);
    res.status(400).json({ message: err.message || 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════════════
// STOCKTAKING (الجرد)
// ═══════════════════════════════════════════════════════════════════

// GET /api/inventory/general/stocktaking
// Returns all sessions (draft + completed) for all users, ordered newest first

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
      FROM inventory_stocktaking_drafts st
      LEFT JOIN users u ON u.id = st.created_by
      LEFT JOIN inventory_stocktaking_draft_items si ON si.draft_id = st.id
      LEFT JOIN general_inventory_items gi ON gi.id = si.item_id
      WHERE st.store_type = 'general'
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
      FROM inventory_stocktaking st
      LEFT JOIN users u ON u.id = st.created_by
      LEFT JOIN inventory_stocktaking_items si ON si.stocktaking_id = st.id
      LEFT JOIN general_inventory_items gi ON gi.id = si.item_id
      WHERE st.store_type = 'general'
      GROUP BY st.id

      ORDER BY (status = 'draft') DESC, created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم' });
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
        FROM inventory_stocktaking_drafts st
        LEFT JOIN users u ON u.id = st.created_by
        WHERE st.id = ? AND st.store_type = 'general'
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
        FROM general_inventory_items gi
        LEFT JOIN inventory_stocktaking_draft_items si ON gi.id = si.item_id AND si.draft_id = ?
        WHERE gi.is_active = 1
        ORDER BY gi.name ASC
      `, [id]);

      return res.json({ session, items, transactions: [] });
    } else {
      const [[session]] = await db.execute(`
        SELECT st.*, u.full_name AS creator_name
        FROM inventory_stocktaking st
        LEFT JOIN users u ON u.id = st.created_by
        WHERE st.id = ? AND st.store_type = 'general'
      `, [id]);

      if (!session) return res.status(404).json({ message: 'جلسة الجرد غير موجودة' });

      const [items] = await db.execute(`
        SELECT si.id, si.item_id, si.expected_quantity, si.actual_quantity,
               si.difference, si.notes, si.unit,
               gi.name AS item_name,
               gi.cost_price
        FROM inventory_stocktaking_items si
        LEFT JOIN general_inventory_items gi ON gi.id = si.item_id
        WHERE si.stocktaking_id = ?
        ORDER BY gi.name ASC
      `, [id]);

      let transactions = [];
      if (session.batch_id) {
        const [txRows] = await db.execute(`
          SELECT it.id, it.transaction_type, it.quantity, it.unit_price, it.notes, it.created_at,
                 gi.name AS item_name, gi.unit AS item_unit, gi.cost_price
          FROM inventory_transactions it
          JOIN general_inventory_items gi ON gi.id = it.item_id
          WHERE it.reference_id = ? AND it.item_type = 'general'
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
      `SELECT id FROM inventory_stocktaking_drafts WHERE id = ? AND store_type = 'general'`,
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
      FROM inventory_stocktaking_draft_items si
      JOIN general_inventory_items gi ON gi.id = si.item_id
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
          `UPDATE inventory_stocktaking_draft_items SET expected_quantity = ?, actual_quantity = ?, difference = 0 WHERE id = ?`,
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
      `SELECT id FROM inventory_stocktaking_drafts WHERE id = ? AND store_type = 'general'`,
      [id]
    );
    if (!session) throw new Error('مسودة الجرد غير موجودة');

    const [staleItems] = await conn.execute(`
      SELECT si.id as draft_item_id, gi.quantity as live_qty, si.actual_quantity
      FROM inventory_stocktaking_draft_items si
      JOIN general_inventory_items gi ON gi.id = si.item_id
      WHERE si.draft_id = ?
        AND ABS(si.expected_quantity - gi.quantity) > 0
    `, [id]);

    for (let row of staleItems) {
      const liveQty = parseFloat(row.live_qty);
      const actualQty = parseFloat(row.actual_quantity);
      const newDiff = actualQty - liveQty;
      await conn.execute(
        `UPDATE inventory_stocktaking_draft_items
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
        `INSERT INTO inventory_stocktaking_drafts (store_type, notes, created_by)
         VALUES ('general', ?, ?)`,
        [notes || '', req.user.id]
      );
      const draftId = stResult.insertId;

      for (let it of items) {
        const expected = parseFloat(it.expected_quantity) || 0;
        const actual   = parseFloat(it.actual_quantity) || 0;
        const diff     = actual - expected;
        if (actual < 0) throw new Error(`كمية غير صحيحة للصنف ID: ${it.item_id}`);

        await conn.execute(
          `INSERT INTO inventory_stocktaking_draft_items
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
      `INSERT INTO inventory_stocktaking (store_type, status, notes, batch_id, created_by, completed_at)
       VALUES ('general', 'completed', ?, ?, ?, NOW())`,
      [notes || '', batchId, req.user.id]
    );
    const stocktakingId = stResult.insertId;

    for (let it of items) {
      const expected = parseFloat(it.expected_quantity) || 0;
      const actual   = parseFloat(it.actual_quantity) || 0;
      const diff     = actual - expected;
      if (actual < 0) throw new Error(`كمية غير صحيحة للصنف ID: ${it.item_id}`);

      await conn.execute(
        `INSERT INTO inventory_stocktaking_items
         (stocktaking_id, item_id, expected_quantity, actual_quantity, difference, notes, unit)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [stocktakingId, it.item_id, expected, actual, diff, it.notes || '', it.unit || '']
      );

      if (diff !== 0) {
        const [[itemInfo]] = await conn.execute(`SELECT cost_price FROM general_inventory_items WHERE id = ?`, [it.item_id]);
        const currentPrice = itemInfo ? itemInfo.cost_price : 0;

        await conn.execute(
          `UPDATE general_inventory_items SET quantity = ? WHERE id = ?`,
          [actual, it.item_id]
        );

        await recordTransaction(conn, {
          item_id:            it.item_id,
          item_type:          'general',
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
      `SELECT id FROM inventory_stocktaking_drafts WHERE id = ? AND store_type = 'general'`, [id]
    );
    if (!session) throw new Error('مسودة الجرد غير موجودة');

    await conn.execute(`UPDATE inventory_stocktaking_drafts SET notes = ? WHERE id = ?`, [notes || '', id]);
    await conn.execute(`DELETE FROM inventory_stocktaking_draft_items WHERE draft_id = ?`, [id]);

    for (let it of items) {
      const expected = parseFloat(it.expected_quantity) || 0;
      const actual   = parseFloat(it.actual_quantity) || 0;
      const diff     = actual - expected;

      await conn.execute(
        `INSERT INTO inventory_stocktaking_draft_items
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

    const [result] = await db.execute(`DELETE FROM inventory_stocktaking_drafts WHERE id = ? AND store_type = 'general'`, [id]);
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

    const [[session]] = await conn.execute(`SELECT * FROM inventory_stocktaking_drafts WHERE id = ? AND store_type = 'general'`, [id]);
    if (!session) throw new Error('جلسة الجرد غير موجودة');

    const [staleRows] = await conn.execute(`
      SELECT COUNT(*) AS stale_count
      FROM inventory_stocktaking_draft_items si
      JOIN general_inventory_items gi ON gi.id = si.item_id
      WHERE si.draft_id = ? AND ABS(si.expected_quantity - gi.quantity) > 0
    `, [id]);
    if (staleRows[0].stale_count > 0) throw new Error('يوجد تغيير في أرصدة المخزون منذ إنشاء المسودة. يرجى تحديث الكميات أولاً');

    const timestamp = Date.now().toString(36).toUpperCase();
    const batchId = `STK-${timestamp}`;
    const batchInId = `STK-IN-${timestamp}`;
    const batchOutId = `STK-OUT-${timestamp}`;

    const [items] = await conn.execute(`SELECT * FROM inventory_stocktaking_draft_items WHERE draft_id = ?`, [id]);

    const [stResult] = await conn.execute(
      `INSERT INTO inventory_stocktaking (store_type, status, notes, batch_id, created_by, completed_at)
       VALUES ('general', 'completed', ?, ?, ?, NOW())`,
      [session.notes || '', batchId, session.created_by]
    );
    const newStocktakingId = stResult.insertId;

    for (let it of items) {
      const expected = parseFloat(it.expected_quantity) || 0;
      const actual   = parseFloat(it.actual_quantity) || 0;
      const diff     = actual - expected;

      await conn.execute(
        `INSERT INTO inventory_stocktaking_items
         (stocktaking_id, item_id, expected_quantity, actual_quantity, difference, notes, unit)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newStocktakingId, it.item_id, expected, actual, diff, it.notes || '', it.unit || '']
      );

      if (diff !== 0) {
        const [[itemInfo]] = await conn.execute(`SELECT cost_price FROM general_inventory_items WHERE id = ?`, [it.item_id]);
        const currentPrice = itemInfo ? itemInfo.cost_price : 0;

        await conn.execute(`UPDATE general_inventory_items SET quantity = ? WHERE id = ?`, [actual, it.item_id]);

        await recordTransaction(conn, {
          item_id:            it.item_id,
          item_type:          'general',
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

    await conn.execute(`DELETE FROM inventory_stocktaking_drafts WHERE id = ?`, [id]);
    await conn.commit();
    res.json({ message: 'تم اعتماد الجرد وتحديث الأرصدة بنجاح', batchId, stocktakingId: newStocktakingId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message || 'خطأ في الخادم' });
  } finally {
    conn.release();
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
      JOIN general_inventory_items i ON i.id = it.item_id
      WHERE it.reference_id = ? AND it.item_type = 'general'
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

// GET /api/inventory/general/transaction/:id
// Returns a single transaction row (for old data with NULL reference_id)
exports.getTransactionDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.execute(`
      SELECT it.id, it.quantity, it.unit_price, it.transaction_type,
             i.name AS item_name, i.unit AS item_unit, i.expiry_date
      FROM inventory_transactions it
      JOIN general_inventory_items i ON i.id = it.item_id
      WHERE it.id = ? AND it.item_type = 'general' AND it.item_type = 'general' AND it.item_type = 'general'
    `, [id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
};


exports.getPendingOutboundTransfers = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        it.*, 
        gi.name AS item_name, 
        gi.unit, 
        gi.cost_price, 
        gi.expiry_date, 
        COALESCE(it.batch_ref, CONCAT('LEGACY-', it.id)) AS batch_ref_key
      FROM inventory_transfers it
      JOIN general_inventory_items gi ON gi.id = it.general_item_id
      WHERE it.from_store = 'general' AND it.status = 'pending'
      ORDER BY it.sent_at ASC
    `);

    const grouped = {};
    rows.forEach(row => {
      const key = row.batch_ref_key;
      if (!grouped[key]) {
        let destName = row.to_store;
        if (destName === 'or') destName = 'مخزن العمليات';
        else if (destName === 'radiology') destName = 'قسم الأشعة';
        else if (destName === 'lab') destName = 'قسم المختبر';

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
        general_item_id: row.general_item_id,
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
    res.status(500).json({ message: 'خطأ في جلب بيانات الشحنات الصادرة المعلقة' });
  }
};


exports.revokeBatch = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { batch_ref } = req.params;

    const isLegacy = batch_ref.startsWith('LEGACY-');
    const transferId = isLegacy ? batch_ref.replace('LEGACY-', '') : null;

    let query = `
      SELECT it.*, gi.name 
      FROM inventory_transfers it
      JOIN general_inventory_items gi ON gi.id = it.general_item_id
      WHERE it.status = 'pending' AND it.from_store = 'general' AND 
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
        `UPDATE general_inventory_items SET quantity = quantity + ? WHERE id = ?`,
        [transfer.sent_quantity, transfer.general_item_id]
      );

      await conn.execute(
        `UPDATE inventory_transfers SET status = 'cancelled', rejected_by = ?, rejected_at = NOW(), rejection_reason = ? WHERE id = ?`,
        [req.user.id, 'تم سحب وإلغاء الشحنة بواسطة المخزن العام', transfer.id]
      );
    }

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      const toStore = transfers[0]?.to_store;
      const targetRoom = toStore === 'radiology' ? 'radiology' : toStore === 'lab' ? 'lab' : 'or_store';
      const itemName = transfers[0]?.name || (transfers.length > 1 ? `${transfers[0]?.name} (+${transfers.length - 1})` : 'شحنة');
      const senderName = 'المخزن العام';
      const reason = 'تم سحب وإلغاء الشحنة بواسطة المخزن العام';

      const payload = { 
        batchRef: batch_ref,
        batch_ref: batch_ref,
        itemName,
        item_name: itemName,
        senderName,
        sender_name: senderName,
        reason,
        item_count: transfers.length,
        message: `تم إلغاء وسحب شحنة (${batch_ref}) من قبل المخزن العام`
      };

      io.to(targetRoom).emit('transfer:revoked', payload);
      if (targetRoom === 'radiology' || targetRoom === 'lab') {
        io.to(targetRoom).emit('inventory:updated', { type: 'revoke' });
      }
      io.to('general_store').emit('inventory:updated', { type: 'revoke' });
    }

    res.json({ message: 'تم سحب وإلغاء الشحنة بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(400).json({ message: err.message || 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};


// ═══════════════════════════════════════════════════════════════════
// INCOMING TRANSFERS FROM OR STORE (Reverse Logistics)
// ═══════════════════════════════════════════════════════════════════

exports.getPendingIncomingFromOR = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        it.*, 
        oi.name AS item_name, 
        oi.unit, 
        oi.cost_price, 
        oi.expiry_date, 
        u.full_name AS sender_name,
        COALESCE(it.batch_ref, CONCAT('LEGACY-', it.id)) AS batch_ref_key
      FROM inventory_transfers it
      JOIN or_inventory_items oi ON oi.id = it.or_item_id
      LEFT JOIN users u ON u.id = it.sent_by
      WHERE it.from_store = 'or' AND it.to_store = 'general' AND it.status = 'pending'
      ORDER BY it.sent_at ASC
    `);

    const grouped = {};
    rows.forEach(row => {
      const key = row.batch_ref_key;
      if (!grouped[key]) {
        grouped[key] = {
          batch_ref_key: key,
          original_batch_ref: row.batch_ref,
          sender_name: row.sender_name || 'مخزن العمليات',
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

    const resultList = Object.values(grouped).sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
    res.json(resultList);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في جلب المرتجعات المعلقة من مخزن العمليات' });
  }
};

exports.acceptBatchFromOR = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { batch_ref } = req.params;

    const isLegacy = batch_ref.startsWith('LEGACY-');
    const transferId = isLegacy ? batch_ref.replace('LEGACY-', '') : null;

    let query = `
      SELECT it.*, oi.name, oi.description, oi.unit, oi.cost_price, oi.expiry_date
      FROM inventory_transfers it
      JOIN or_inventory_items oi ON oi.id = it.or_item_id
      WHERE it.status = 'pending' AND it.from_store = 'or' AND it.to_store = 'general' AND 
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
      // Find or create item in General Store
      let generalItemId;
      const [[existingItem]] = await conn.execute(`SELECT id FROM general_inventory_items WHERE name = ?`, [transfer.name]);

      if (existingItem) {
        generalItemId = existingItem.id;
        await conn.execute(
          `UPDATE general_inventory_items SET quantity = quantity + ?, cost_price = ? WHERE id = ?`,
          [transfer.sent_quantity, transfer.cost_price, generalItemId]
        );
      } else {
        const [newResult] = await conn.execute(
          `INSERT INTO general_inventory_items (name, description, unit, quantity, cost_price, min_quantity, is_active, expiry_date)
           VALUES (?, ?, ?, ?, ?, 10, 1, ?)`,
          [transfer.name, transfer.description || '', transfer.unit || 'وحدة', transfer.sent_quantity, transfer.cost_price, transfer.expiry_date]
        );
        generalItemId = newResult.insertId;
      }

      await conn.execute(
        `UPDATE inventory_transfers SET status='received', received_by=?, received_at=NOW(), received_quantity=?, general_item_id=? WHERE id=?`,
        [req.user.id, transfer.sent_quantity, generalItemId, transfer.id]
      );

      // Delayed OUT for OR Store
      await recordTransaction(conn, {
        item_id: transfer.or_item_id,
        item_type: 'or',
        transaction_type: 'out',
        quantity: transfer.sent_quantity,
        unit_price: transfer.cost_price,
        source_entity: 'مخزن العمليات',
        destination_entity: 'المخزن العام',
        reference_id: batch_ref,
        notes: transfer.batch_notes || 'صرف للمخزن العام (مؤكد)',
        performed_by: transfer.sent_by
      });

      // IN for General Store
      await recordTransaction(conn, {
        item_id: generalItemId,
        item_type: 'general',
        transaction_type: 'in',
        quantity: transfer.sent_quantity,
        unit_price: transfer.cost_price,
        source_entity: 'مخزن العمليات',
        destination_entity: 'المخزن العام',
        reference_id: batch_ref,
        notes: transfer.batch_notes || 'استلام دفعة واردة من مخزن العمليات',
        performed_by: req.user.id
      });

      emittedItems.push({ item_name: transfer.name, quantity: transfer.sent_quantity, item_unit: transfer.unit });
    }

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('or_store').emit('transfer:received', { 
        message: `تم استلام الشحنة الواردة في المخزن العام بنجاح`,
        batch_ref: batch_ref,
        sender_name: req.user?.full_name || req.user?.username || 'المخزن العام',
        item_count: transfers.length,
        item_name: transfers[0].name
      });
      io.to('or_store').emit('inventory:updated', { type: 'receive' });
      io.to('general_store').emit('inventory:updated', { type: 'receive' });
    }

    res.json({ message: 'تم استلام الشحنة الواردة بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(400).json({ message: err.message || 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};

exports.rejectBatchFromOR = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { batch_ref } = req.params;
    const { rejection_reason } = req.body;

    if (!rejection_reason) throw new Error('سبب الرفض مطلوب');

    const isLegacy = batch_ref.startsWith('LEGACY-');
    const transferId = isLegacy ? batch_ref.replace('LEGACY-', '') : null;

    let query = `
      SELECT it.*, oi.name 
      FROM inventory_transfers it
      JOIN or_inventory_items oi ON oi.id = it.or_item_id
      WHERE it.status = 'pending' AND it.from_store = 'or' AND it.to_store = 'general' AND 
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
        `UPDATE or_inventory_items SET quantity = quantity + ? WHERE id = ?`,
        [transfer.sent_quantity, transfer.or_item_id]
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
      const receiverName = 'المخزن العام';
      io.to('or_store').emit('transfer:rejected', { 
        message: `تم رفض الشحنة الواردة`,
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
      io.to('or_store').emit('inventory:updated', { type: 'revoke' });
    }

    res.json({ message: 'تم رفض الشحنة واسترجاع الكميات لمخزن العمليات بنجاح' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(400).json({ message: err.message || 'خطأ في الخادم' });
  } finally {
    conn.release();
  }
};
