const db = require('../database/db');

// 1. Get all surgeries for dashboard
exports.getSurgeriesDashboard = async (req, res) => {
  try {
    const query = `
      SELECT s.id, s.visit_id, s.surgery_type, s.full_price, 'YER' as currency, s.status, s.scheduled_date, s.created_at,
             v.visit_number, p.full_name, p.age,
             (SELECT COALESCE(SUM(amount), 0) FROM surgery_payments WHERE surgery_id = s.id) as total_paid
      FROM surgeries s
      JOIN visits v ON s.visit_id = v.id
      JOIN patients p ON s.patient_id = p.id
      ORDER BY s.created_at DESC
    `;
    const [rows] = await db.query(query);
    res.json(rows);
  } catch (error) {
    console.error('getSurgeriesDashboard error:', error);
    res.status(500).json({ message: 'فشل تحميل بيانات العمليات' });
  }
};

// 2. Get specific surgery details
exports.getSurgeryDetails = async (req, res) => {
  const { id } = req.params;
  try {
    const surgeryQuery = `
      SELECT s.*, v.visit_number, p.full_name, p.age, p.gender, p.allergies, p.chronic_diseases
      FROM surgeries s
      JOIN visits v ON s.visit_id = v.id
      JOIN patients p ON s.patient_id = p.id
      WHERE s.id = ?
    `;
    const [surgeryRows] = await db.query(surgeryQuery, [id]);
    if (surgeryRows.length === 0) return res.status(404).json({ message: 'العملية غير موجودة' });

    const surgery = surgeryRows[0];

    // Get diagnostic services
    const [labs] = await db.query("SELECT vlr.*, lt.name FROM visit_lab_requests vlr JOIN lab_tests lt ON vlr.lab_test_id = lt.id WHERE vlr.surgery_id = ?", [id]);
    const [rads] = await db.query("SELECT vrr.*, rt.name FROM visit_radiology_requests vrr JOIN radiology_tests rt ON vrr.radiology_test_id = rt.id WHERE vrr.surgery_id = ?", [id]);
    
    // Get materials used
    const [materials] = await db.query("SELECT smu.*, inv.name, inv.unit FROM surgery_materials_used smu JOIN or_inventory_items inv ON smu.inventory_item_id = inv.id WHERE smu.surgery_id = ?", [id]);

    // Get expenses
    const [expenses] = await db.query("SELECT * FROM surgery_expenses WHERE surgery_id = ?", [id]);

    // Get payments with receiver name
    const [payments] = await db.query(
      `SELECT sp.*, u.full_name AS received_by_name 
       FROM surgery_payments sp 
       LEFT JOIN users u ON u.id = sp.received_by 
       WHERE sp.surgery_id = ? 
       ORDER BY sp.payment_date DESC`,
      [id]
    );

    res.json({
      surgery,
      diagnosticServices: { labs, rads },
      materials,
      expenses,
      payments
    });
  } catch (error) {
    console.error('getSurgeryDetails error:', error);
    res.status(500).json({ message: 'فشل تحميل تفاصيل العملية' });
  }
};

// 3. Price and Schedule Surgery
exports.priceSurgery = async (req, res) => {
  const { id } = req.params;
  const { surgery_type, full_price, scheduled_date } = req.body;
  try {
    await db.query(
      "UPDATE surgeries SET surgery_type = ?, full_price = ?, scheduled_date = ?, status = 'scheduled' WHERE id = ?",
      [surgery_type, full_price, scheduled_date || null, id]
    );
    const [[surgeryData]] = await db.query(`
      SELECT s.id, s.surgery_type, s.full_price, v.visit_number, p.full_name AS patient_name
      FROM surgeries s
      JOIN visits v ON s.visit_id = v.id
      JOIN patients p ON s.patient_id = p.id
      WHERE s.id = ?
    `, [id]);

    const io = req.app.get('io');
    if (io) {
      io.to('cashier').emit('cashier:surgery_fee_pending', {
        surgeryId: parseInt(id),
        surgeryType: surgeryData?.surgery_type || surgery_type,
        fullPrice: surgeryData?.full_price !== undefined ? surgeryData.full_price : full_price,
        visitNumber: surgeryData?.visit_number || '',
        patientName: surgeryData?.patient_name || 'مريض',
        message: `تم تسعير عملية جديدة للمريض: ${surgeryData?.patient_name || 'مريض'} (عملية: ${surgeryData?.surgery_type || surgery_type})`
      });
      io.to('cashier').emit('cashier:update');
    }
    res.json({ message: 'تم تسعير وجدولة العملية بنجاح وإرسالها للصندوق' });
  } catch (error) {
    console.error('priceSurgery error:', error);
    res.status(500).json({ message: 'فشل التسعير' });
  }
};

// 4. Update Status (e.g., scheduled -> post_op)
exports.updateSurgeryStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    await db.query("UPDATE surgeries SET status = ? WHERE id = ?", [status, id]);
    const io = req.app.get('io');
    if (io) io.to('cashier').emit('cashier:update');
    res.json({ message: 'تم تحديث حالة العملية بنجاح' });
  } catch (error) {
    console.error('updateSurgeryStatus error:', error);
    res.status(500).json({ message: 'فشل تحديث الحالة' });
  }
};

// 5. Add Diagnostic Service
exports.addDiagnosticService = async (req, res) => {
  const { id } = req.params;
  const { type, test_id, with_film } = req.body; // type: 'lab' or 'rad'
  
  try {
    // Get surgery visit_id
    const [surgRows] = await db.query("SELECT visit_id FROM surgeries WHERE id = ?", [id]);
    if (surgRows.length === 0) return res.status(404).json({ message: 'Not found' });
    const visit_id = surgRows[0].visit_id;

    if (type === 'lab') {
      await db.query(
        "INSERT INTO visit_lab_requests (visit_id, lab_test_id, surgery_id, is_included_in_surgery, price, status, requested_by) VALUES (?, ?, ?, true, 0, 'paid', ?)",
        [visit_id, test_id, id, req.user.id]
      );
    } else {
      await db.query(
        "INSERT INTO visit_radiology_requests (visit_id, radiology_test_id, surgery_id, is_included_in_surgery, with_film, price, status, requested_by) VALUES (?, ?, ?, true, ?, 0, 'paid', ?)",
        [visit_id, test_id, id, with_film ? 1 : 0, req.user.id]
      );
    }
    
    // Notify Lab / Radiology and Cashier
    const io = req.app.get('io');
    if (io) {
      if (type === 'lab') {
        io.to('lab').emit('request:new', { message: 'طلب تحليل جديد ضمن عملية جراحية' });
      } else {
        io.to('radiology').emit('request:new', { message: 'طلب أشعة جديد ضمن عملية جراحية' });
      }
      io.to('cashier').emit('cashier:update');
    }
    
    res.json({ message: 'تم إضافة الخدمة التشخيصية بنجاح' });
  } catch (error) {
    console.error('addDiagnosticService error:', error);
    res.status(500).json({ message: 'فشل إضافة الخدمة التشخيصية' });
  }
};

// 6. Get OR Inventory Items
exports.getInventoryItems = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id, name, unit, quantity, cost_price FROM or_inventory_items WHERE is_active = true");
    res.json(rows);
  } catch (error) {
    console.error('getInventoryItems error:', error);
    res.status(500).json({ message: 'فشل تحميل مواد المخزن' });
  }
};

// 7. Add Material Used (with strict stock check & inventory_transactions audit record)
exports.addMaterial = async (req, res) => {
  const { id } = req.params;
  const { inventory_item_id, quantity } = req.body;
  const qtyNum = Math.round(Number(quantity));
  if (!qtyNum || qtyNum <= 0) {
    return res.status(400).json({ message: 'يرجى إدخال كمية صحيحة أكبر من الصفر' });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 1. Fetch item and lock row for update
    const [itemRows] = await connection.query(
      "SELECT id, name, unit, cost_price, quantity FROM or_inventory_items WHERE id = ? AND is_active = 1 FOR UPDATE",
      [inventory_item_id]
    );
    if (itemRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'الصنف غير موجود أو غير نشط في مخزن العمليات' });
    }
    const item = itemRows[0];
    const availableStock = Math.round(Number(item.quantity) || 0);

    // 2. Validate stock sufficiency
    if (availableStock < qtyNum) {
      await connection.rollback();
      return res.status(400).json({
        message: `الرصيد المتاح في مخزن العمليات (${availableStock}) غير كافٍ لصرف الكمية المطلوبة (${qtyNum})`
      });
    }

    // 3. Fetch Surgery, Visit, and Patient details for the transaction audit notes
    const [surgeryRows] = await connection.query(
      `SELECT s.id, s.surgery_type, v.visit_number, p.full_name AS patient_name
       FROM surgeries s
       JOIN visits v ON s.visit_id = v.id
       JOIN patients p ON s.patient_id = p.id
       WHERE s.id = ?`,
      [id]
    );
    if (surgeryRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'سجل العملية الجراحية غير موجود' });
    }
    const surgery = surgeryRows[0];
    const cost_price = Number(item.cost_price) || 0;
    const issue_price = cost_price;

    // 4. Insert material record into surgery_materials_used
    await connection.query(
      "INSERT INTO surgery_materials_used (surgery_id, inventory_item_id, quantity, cost_price, issue_price) VALUES (?, ?, ?, ?, ?)",
      [id, inventory_item_id, qtyNum, cost_price, issue_price]
    );

    // 5. Deduct from inventory
    await connection.query(
      "UPDATE or_inventory_items SET quantity = quantity - ? WHERE id = ?",
      [qtyNum, inventory_item_id]
    );

    // 6. Record formal 'out' transaction in inventory_transactions
    const opText = surgery.surgery_type ? ` (${surgery.surgery_type})` : '';
    const transactionNotes = `صرف للعملية الجراحية${opText}\nللمريض ${surgery.patient_name} (${surgery.visit_number})`;
    const performedBy = req.user?.id || req.user?.userId || null;

    await connection.query(
      `INSERT INTO inventory_transactions 
       (item_id, item_type, transaction_type, quantity, unit_price, source_entity, destination_entity, reference_id, notes, performed_by)
       VALUES (?, 'or', 'out', ?, ?, 'مخزن العمليات', 'غرفة العمليات الجراحية', ?, ?, ?)`,
      [inventory_item_id, qtyNum, cost_price, id, transactionNotes, performedBy]
    );

    await connection.commit();

    // 7. Emit realtime events to or_store and global listeners
    const io = req.app.get('io');
    if (io) {
      io.to('or_store').emit('inventory:updated', { type: 'issue', surgeryId: id, itemId: inventory_item_id });
      io.emit('inventory:updated', { type: 'issue', surgeryId: id, itemId: inventory_item_id });
    }

    res.json({ message: 'تم إضافة وصرف المادة من مخزن العمليات وتوثيق حركة الصرف بنجاح' });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('addMaterial error:', error);
    res.status(500).json({ message: 'فشل إضافة وصرف المادة من المخزن' });
  } finally {
    if (connection) connection.release();
  }
};

// 8. Add Expense
exports.addExpense = async (req, res) => {
  const { id } = req.params;
  const { description, amount } = req.body;
  try {
    await db.query(
      "INSERT INTO surgery_expenses (surgery_id, description, amount, created_by) VALUES (?, ?, ?, ?)",
      [id, description, amount, req.user?.id || req.user?.userId || null]
    );
    res.json({ message: 'تم إضافة التكلفة' });
  } catch (error) {
    console.error('addExpense error:', error);
    res.status(500).json({ message: 'فشل إضافة التكلفة' });
  }
};

// 9. Complete Surgery
exports.completeSurgery = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("UPDATE surgeries SET status = 'completed', completed_date = NOW() WHERE id = ?", [id]);
    const io = req.app.get('io');
    if (io) io.to('cashier').emit('cashier:update');
    res.json({ message: 'تم إنهاء العملية بنجاح' });
  } catch (error) {
    console.error('completeSurgery error:', error);
    res.status(500).json({ message: 'فشل إنهاء العملية' });
  }
};

// 10. Delete Material Used (and restore stock to inventory with reverse transaction)
exports.deleteMaterial = async (req, res) => {
  const { id, materialId } = req.params;
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 1. Find material record with surgery, visit, and patient context
    const [rows] = await connection.query(
      `SELECT smu.id, smu.surgery_id, smu.inventory_item_id, smu.quantity, smu.cost_price,
              s.surgery_type, v.visit_number, p.full_name AS patient_name,
              oi.name AS item_name
       FROM surgery_materials_used smu
       JOIN surgeries s ON smu.surgery_id = s.id
       JOIN visits v ON s.visit_id = v.id
       JOIN patients p ON s.patient_id = p.id
       LEFT JOIN or_inventory_items oi ON smu.inventory_item_id = oi.id
       WHERE smu.id = ? AND smu.surgery_id = ?
       FOR UPDATE`,
      [materialId, id]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'سجل المادة غير موجود' });
    }

    const { inventory_item_id, quantity, cost_price, patient_name, visit_number, surgery_type } = rows[0];
    const qtyToRestore = Math.round(Number(quantity)) || 0;
    const unitPrice = Number(cost_price) || 0;
    const performedBy = req.user?.id || req.user?.userId || null;

    // 2. Restore inventory quantity
    await connection.query(
      "UPDATE or_inventory_items SET quantity = quantity + ? WHERE id = ?",
      [qtyToRestore, inventory_item_id]
    );

    // 3. Record reverse 'in' transaction in inventory_transactions
    const opText = surgery_type ? ` (${surgery_type})` : '';
    const reverseNotes = `إلغاء صرف واسترجاع من عملية${opText}\nللمريض ${patient_name} (${visit_number})`;
    await connection.query(
      `INSERT INTO inventory_transactions 
       (item_id, item_type, transaction_type, quantity, unit_price, source_entity, destination_entity, reference_id, notes, performed_by)
       VALUES (?, 'or', 'in', ?, ?, 'غرفة العمليات الجراحية', 'مخزن العمليات', ?, ?, ?)`,
      [inventory_item_id, qtyToRestore, unitPrice, id, reverseNotes, performedBy]
    );

    // 4. Delete material record from surgery_materials_used
    await connection.query(
      "DELETE FROM surgery_materials_used WHERE id = ? AND surgery_id = ?",
      [materialId, id]
    );

    await connection.commit();

    // 5. Emit realtime events to or_store and global listeners
    const io = req.app.get('io');
    if (io) {
      io.to('or_store').emit('inventory:updated', { type: 'return', surgeryId: id, itemId: inventory_item_id });
      io.emit('inventory:updated', { type: 'return', surgeryId: id, itemId: inventory_item_id });
    }

    res.json({ message: 'تم حذف المادة واسترجاع رصيدها لمخزن العمليات وتوثيق حركة الإرجاع بنجاح' });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('deleteMaterial error:', err);
    res.status(500).json({ message: 'فشل حذف المادة من العملية واسترجاع الرصيد' });
  } finally {
    if (connection) connection.release();
  }
};

// 11. Delete Expense
exports.deleteExpense = async (req, res) => {
  const { id, expenseId } = req.params;
  try {
    const [result] = await db.query(
      "DELETE FROM surgery_expenses WHERE id = ? AND surgery_id = ?",
      [expenseId, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'سجل التكلفة غير موجود' });
    }
    res.json({ message: 'تم حذف التكلفة بنجاح' });
  } catch (error) {
    console.error('deleteExpense error:', error);
    res.status(500).json({ message: 'فشل حذف التكلفة' });
  }
};
