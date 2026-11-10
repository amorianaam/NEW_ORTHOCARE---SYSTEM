const db = require('../database/db');
const fs = require('fs');
const path = require('path');
const { ensureLabInventorySchema } = require('./labInventoryController');

// Helper: Automated BOM Consumable Deduction Engine (Idempotent per visit_lab_requests row)
const deductLabConsumablesForRequests = async (conn, requestRows, userId) => {
  const lowStockAlerts = [];
  let deductedAny = false;

  for (const reqRow of requestRows) {
    if (Number(reqRow.consumables_deducted) === 1) continue;

    const [bomItems] = await conn.execute(
      `SELECT
         ltc.lab_item_id,
         ltc.consumption_mode,
         ltc.quantity_per_test,
         ltc.tests_per_unit,
         li.name AS item_name,
         li.unit AS item_unit,
         li.quantity AS current_quantity,
         li.min_quantity,
         COALESCE(li.cost_price, 0) AS cost_price
       FROM lab_test_consumables ltc
       JOIN lab_inventory_items li ON ltc.lab_item_id = li.id
       WHERE ltc.lab_test_id = ? AND li.is_active = 1`,
      [reqRow.lab_test_id]
    );

    for (const bom of bomItems) {
      const qtyToDeduct =
        bom.consumption_mode === 'per_unit_yield' && parseFloat(bom.tests_per_unit) > 0
          ? Number((1 / parseFloat(bom.tests_per_unit)).toFixed(4))
          : Number(parseFloat(bom.quantity_per_test || 1).toFixed(4));

      if (!isNaN(qtyToDeduct) && qtyToDeduct > 0) {
        const unitCost = Number(parseFloat(bom.cost_price || 0).toFixed(2));
        const totalCost = Number((qtyToDeduct * unitCost).toFixed(2));

        await conn.execute(
          `UPDATE lab_inventory_items SET quantity = ROUND(quantity - ?, 4) WHERE id = ?`,
          [qtyToDeduct, bom.lab_item_id]
        );

        const newQty = Number((parseFloat(bom.current_quantity || 0) - qtyToDeduct).toFixed(4));
        const minQty = parseFloat(bom.min_quantity || 0);

        if (newQty <= minQty) {
          lowStockAlerts.push({
            itemId: bom.lab_item_id,
            itemName: bom.item_name,
            quantity: newQty,
            minQuantity: minQty,
            unit: bom.item_unit,
            isNegative: newQty < 0
          });
        }

        const logNote = `استهلاك تلقائي لتحليل: ${reqRow.test_name || 'تحليل مخبري'} (طلب رقم #${reqRow.id})`;
        await conn.execute(
          `INSERT INTO clinical_consumption_log
            (store, item_id, item_name, item_unit, qty_deducted, unit_cost, total_cost, visit_id, visit_number, patient_name, service_id, service_name, trigger_type, notes, performed_by)
           VALUES ('lab', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'procedure_consumption', ?, ?)`,
          [
            bom.lab_item_id,
            bom.item_name,
            bom.item_unit || 'وحدة',
            qtyToDeduct,
            unitCost,
            totalCost,
            reqRow.visit_id || null,
            reqRow.visit_number || null,
            reqRow.patient_name || null,
            reqRow.lab_test_id || null,
            reqRow.test_name || null,
            logNote,
            userId || null
          ]
        );

        deductedAny = true;
      }
    }

    // Mark request as consumables_deducted = 1 to guarantee 100% idempotency
    await conn.execute(
      `UPDATE visit_lab_requests SET consumables_deducted = 1 WHERE id = ?`,
      [reqRow.id]
    );
  }

  return { deductedAny, lowStockAlerts };
};

// Helper: Safely delete orphan files on disk without affecting shared references or traversing directories
const safelyDeleteOrphanFiles = async (oldUrls, targetRequestIds, conn) => {
  if (!Array.isArray(oldUrls) || oldUrls.length === 0) return;

  const labUploadsDir = path.resolve(path.join(__dirname, '../uploads/lab'));

  for (const fileUrl of oldUrls) {
    if (!fileUrl || typeof fileUrl !== 'string') continue;

    // Path Traversal Security Check: only allow files inside uploads/lab
    const relUrl = fileUrl.startsWith('/') ? fileUrl.substring(1) : fileUrl;
    const filePath = path.resolve(path.join(__dirname, '..', relUrl));

    if (!filePath.startsWith(labUploadsDir)) {
      console.warn(`[Lab Safe Delete] Refused to delete file outside lab directory: ${filePath}`);
      continue;
    }

    try {
      // Check if any other request outside targetRequestIds still references this file
      let query = `SELECT id FROM visit_lab_requests WHERE result_file LIKE ?`;
      let params = [`%${fileUrl}%`];

      if (Array.isArray(targetRequestIds) && targetRequestIds.length > 0) {
        query += ` AND id NOT IN (${targetRequestIds.map(() => '?').join(',')})`;
        params.push(...targetRequestIds);
      }
      query += ` LIMIT 1`;

      const [rows] = await conn.query(query, params);

      if (rows.length === 0) {
        // Truly an orphan file not referenced by any other request — safe to delete physically
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`[Lab Safe Delete] Removed orphan file: ${filePath}`);
        }
      } else {
        console.log(`[Lab Safe Delete] Retained shared file still referenced by request #${rows[0].id}: ${fileUrl}`);
      }
    } catch (err) {
      console.error(`[Lab Safe Delete] Error deleting ${filePath}:`, err.message);
    }
  }
};




// 1. Get all distinct visits based on tab
exports.getRequests = async (req, res) => {
  const { tab = 'pending', startDate, endDate } = req.query;
  try {
    let statusFilter = "('paid')";
    if (tab === 'in_progress') statusFilter = "('in_progress', 'result_uploaded')";
    if (tab === 'completed') statusFilter = "('completed')";

    let dateFilter = '';
    const params = [];
    if (startDate && endDate) {
      if (tab === 'completed') {
        dateFilter = `AND (SELECT MAX(performed_at) FROM visit_lab_requests WHERE visit_id = v.id AND status = 'completed') BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND`;
      } else {
        dateFilter = `AND (SELECT MIN(requested_at) FROM visit_lab_requests WHERE visit_id = v.id) BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND`;
      }
      params.push(`${startDate} 03:00:00`, `${endDate} 03:00:00`);
    }

    const query = `
      SELECT DISTINCT 
        v.id as visit_id, 
        v.visit_number, 
        (CASE WHEN v.visit_number LIKE 'EXT-%' THEN 1 ELSE 0 END) AS is_external, 
        (CASE WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v.id) OR v.status = 'transferred_to_center' OR EXISTS (SELECT 1 FROM visit_lab_requests vlr2 WHERE vlr2.visit_id = v.id AND vlr2.surgery_id IS NOT NULL) THEN 1 ELSE 0 END) AS is_surgery,
        p.full_name, 
        p.age, 
        p.gender,
        (CASE 
          WHEN ${tab === 'completed'} THEN (SELECT COALESCE(MAX(performed_at), MAX(requested_at)) FROM visit_lab_requests WHERE visit_id = v.id AND status = 'completed')
          ELSE (SELECT MIN(requested_at) FROM visit_lab_requests WHERE visit_id = v.id AND status IN ${statusFilter})
        END) as requested_at,
        (SELECT MAX(performed_at) FROM visit_lab_requests WHERE visit_id = v.id AND status = 'completed') as performed_at,
        (SELECT COUNT(*) FROM visit_lab_requests WHERE visit_id = v.id AND status IN ${statusFilter}) as total_tab_tests,
        (SELECT COUNT(*) FROM visit_lab_requests WHERE visit_id = v.id AND status = 'in_progress') as total_in_progress,
        (SELECT COUNT(*) FROM visit_lab_requests WHERE visit_id = v.id AND status = 'completed') as total_completed_tests
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      JOIN visit_lab_requests vlr ON v.id = vlr.visit_id
      WHERE vlr.status IN ${statusFilter}
      ${dateFilter}
      ORDER BY total_in_progress DESC, requested_at ${tab === 'completed' ? 'DESC' : 'ASC'}
    `;
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('getRequests error:', error);
    res.status(500).json({ message: 'فشل تحميل الطلبات' });
  }
};

// 2. Get details for a specific visit (only the requested lab tests)
exports.getVisitDetails = async (req, res) => {
  const { visitId } = req.params;
  try {
    const visitQuery = `
      SELECT 
        v.id as visit_id, 
        v.visit_number, 
        (CASE WHEN v.visit_number LIKE 'EXT-%' THEN 1 ELSE 0 END) AS is_external, 
        v.created_at,
        (SELECT MAX(performed_at) FROM visit_lab_requests WHERE visit_id = v.id AND status = 'completed') as performed_at,
        (CASE WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v.id) OR v.status = 'transferred_to_center' OR EXISTS (SELECT 1 FROM visit_lab_requests vlr2 WHERE vlr2.visit_id = v.id AND vlr2.surgery_id IS NOT NULL) THEN 1 ELSE 0 END) AS is_surgery,
        p.id as patient_id,
        p.full_name, 
        p.age, 
        p.gender, 
        p.allergies, 
        p.chronic_diseases
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      WHERE v.id = ?
    `;
    const [visitRows] = await db.query(visitQuery, [visitId]);
    if (visitRows.length === 0) return res.status(404).json({ message: 'الزيارة غير موجودة' });

    const requestsQuery = `
      SELECT 
        vlr.id, 
        vlr.status, 
        vlr.result_file, 
        vlr.result_notes, 
        vlr.requested_at,
        vlr.performed_at,
        lt.name, 
        lc.name as category_name
      FROM visit_lab_requests vlr
      JOIN lab_tests lt ON vlr.lab_test_id = lt.id
      LEFT JOIN lab_categories lc ON lt.category_id = lc.id
      WHERE vlr.visit_id = ? AND vlr.status IN ('paid', 'in_progress', 'result_uploaded', 'completed')
      ORDER BY vlr.id ASC
    `;
    const [requests] = await db.query(requestsQuery, [visitId]);

    res.json({
      visit: visitRows[0],
      requests
    });
  } catch (error) {
    console.error('getVisitDetails error:', error);
    res.status(500).json({ message: 'فشل تحميل تفاصيل الزيارة' });
  }
};

// 3. Update status (e.g. to in_progress or completed)
exports.updateRequestStatus = async (req, res) => {
  const { requestId } = req.params;
  const { status } = req.body;
  const conn = await db.getConnection();
  try {
    await ensureLabInventorySchema();
    await conn.beginTransaction();

    const [[currentReq]] = await conn.execute(
      `SELECT
         vlr.id,
         vlr.visit_id,
         vlr.lab_test_id,
         vlr.status,
         COALESCE(vlr.consumables_deducted, 0) AS consumables_deducted,
         lt.name AS test_name,
         v.visit_number, 
        (CASE WHEN v.visit_number LIKE 'EXT-%' THEN 1 ELSE 0 END) AS is_external,
         p.full_name AS patient_name
       FROM visit_lab_requests vlr
       JOIN lab_tests lt ON vlr.lab_test_id = lt.id
       JOIN visits v ON vlr.visit_id = v.id
       JOIN patients p ON v.patient_id = p.id
       WHERE vlr.id = ? FOR UPDATE`,
      [requestId]
    );

    if (currentReq && currentReq.status === 'pending_payment' && (status === 'in_progress' || status === 'completed')) {
      await conn.rollback();
      return res.status(403).json({ message: 'لا يمكن تحديث حالة طلب غير مدفوع' });
    }

    await conn.execute(
      `UPDATE visit_lab_requests SET status = ?, performed_by = ?, performed_at = CASE WHEN ? = 'completed' THEN COALESCE(performed_at, NOW()) ELSE performed_at END WHERE id = ?`,
      [status, req.user.id, status, requestId]
    );

    let deductionResult = { deductedAny: false, lowStockAlerts: [] };
    if (status === 'completed' && currentReq && Number(currentReq.consumables_deducted) === 0) {
      deductionResult = await deductLabConsumablesForRequests(conn, [currentReq], req.user?.id);
    }

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('lab').emit('lab:update');
      io.to('cashier').emit('cashier:update');
      if (deductionResult.deductedAny) {
        io.to('lab').emit('inventory:updated', { store: 'lab' });
        io.to('auditor').emit('inventory:updated', { store: 'lab' });
      }
      if (deductionResult.lowStockAlerts.length > 0) {
        io.to('lab').emit('lab:low_stock_alert', { alerts: deductionResult.lowStockAlerts });
        io.to('auditor').emit('lab:low_stock_alert', { alerts: deductionResult.lowStockAlerts });
      }
    }
    res.json({ message: 'تم تحديث الحالة بنجاح' });
  } catch (error) {
    await conn.rollback();
    console.error('updateRequestStatus error:', error);
    res.status(500).json({ message: 'فشل تحديث الحالة' });
  } finally {
    conn.release();
  }
};

// 3b. Start all requests for a visit
exports.startAllRequests = async (req, res) => {
  const { visitId } = req.params;
  try {
    await db.query("UPDATE visit_lab_requests SET status = 'in_progress', performed_by = ? WHERE visit_id = ? AND status = 'paid'", [req.user.id, visitId]);
    const io = req.app.get('io');
    if (io) {
      io.to('lab').emit('lab:update');
      io.to('cashier').emit('cashier:update');
    }
    res.json({ message: 'تم استلام كافة العينات بنجاح' });
  } catch (error) {
    console.error('startAllRequests error:', error);
    res.status(500).json({ message: 'فشل استلام العينات' });
  }
};

// 4. Upload result (FormData multipart: files via Multer + resultNotes)
exports.uploadResult = async (req, res) => {
  const { requestId } = req.params;
  const { resultNotes, existingFiles } = req.body;

  // Build file array: start with preserved existing server files
  let filesArray = [];
  if (existingFiles) {
    try { filesArray = JSON.parse(existingFiles); } catch(e) {}
  }

  // Append newly uploaded disk files from Multer
  if (req.files && req.files.length > 0) {
    const newFiles = req.files.map(file => ({
      name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      type: file.mimetype,
      url: '/uploads/lab/' + file.filename,
      size: file.size
    }));
    filesArray = [...filesArray, ...newFiles];
  }

  // Legacy fallback: accept old Base64 payload if no new files
  if (req.body.resultFile && filesArray.length === 0) {
    try { filesArray = JSON.parse(req.body.resultFile); } catch(e) { filesArray = req.body.resultFile; }
  }

  const filePayload = (Array.isArray(filesArray) && filesArray.length > 0)
    ? JSON.stringify(filesArray)
    : (typeof filesArray === 'string' && filesArray ? filesArray : null);

  try {
    // Fetch current record for GC and status logic
    const [[currentReq]] = await db.query(`
      SELECT vlr.status, vlr.visit_id, vlr.result_file, p.full_name as patient_name, v.visit_number
      FROM visit_lab_requests vlr
      JOIN visits v ON vlr.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      WHERE vlr.id = ?
    `, [requestId]);

    if (!currentReq) return res.status(404).json({ message: "الطلب غير موجود" });

    const newStatus = (currentReq.status === 'completed') ? 'completed' : 'result_uploaded';

    await db.query(`
      UPDATE visit_lab_requests
      SET status = ?, result_notes = ?, result_file = ?, performed_by = ?, performed_at = NOW()
      WHERE id = ?`,
      [newStatus, resultNotes || null, filePayload, req.user.id, requestId]
    );

    // Safely garbage-collect orphaned disk files only if no other request references them
    if (currentReq.result_file) {
      try {
        const oldFiles = typeof currentReq.result_file === 'string' && currentReq.result_file.startsWith('[')
          ? JSON.parse(currentReq.result_file)
          : [];
        const newUrls = new Set((Array.isArray(filesArray) ? filesArray : []).map(f => f.url).filter(Boolean));
        const oldUrlsToDelete = oldFiles.map(f => f.url).filter(url => url && !newUrls.has(url));

        if (oldUrlsToDelete.length > 0) {
          await safelyDeleteOrphanFiles(oldUrlsToDelete, [requestId], db);
        }
      } catch (gcErr) {
        console.error('Safe Lab GC Error:', gcErr);
      }
    }

    const io = req.app.get('io');
    if (io) {
      io.to('lab').emit('lab:update', { visitId: currentReq.visit_id });

      // Only notify doctor and secretary if this is an actual modification of an already completed test
      const isExternal = Boolean(currentReq?.visit_number?.startsWith('EXT-'));
      if (currentReq.status === 'completed' && !isExternal) {
        const patientName = currentReq.patient_name || 'مريض';
        const msg = `تم تعديل نتيجة التحاليل للمريض: ${patientName}`;

        const updatePayload = {
          type: 'lab_ready',
          message: msg,
          patientName,
          visitId: currentReq.visit_id,
          category: 'lab'
        };

        io.to('doctor').emit('result:updated', updatePayload);
        io.to('secretary').emit('result:updated', updatePayload);
      }
    }

    res.json({ message: 'تم حفظ النتيجة بنجاح' });
  } catch (error) {
    console.error('uploadResult error:', error);
    res.status(500).json({ message: 'فشل حفظ النتيجة' });
  }
};



// 4b. Bulk Upload Result for a Visit (Shares 1 uploaded file across all/selected tests with Safe Orphan Deletion)
exports.bulkUploadResult = async (req, res) => {
  const { visitId } = req.params;
  const { resultNotes, existingFiles, targetTestIds } = req.body;

  // 1. Build file array: preserve existing files if provided
  let filesArray = [];
  if (existingFiles) {
    try {
      filesArray = typeof existingFiles === 'string' ? JSON.parse(existingFiles) : existingFiles;
      if (!Array.isArray(filesArray)) filesArray = [];
    } catch (e) {
      filesArray = [];
    }
  }

  // 2. Append newly uploaded disk files from Multer (saved ONCE to /uploads/lab/)
  if (req.files && req.files.length > 0) {
    const newFiles = req.files.map(file => ({
      name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      type: file.mimetype,
      url: '/uploads/lab/' + file.filename,
      size: file.size
    }));
    filesArray = [...filesArray, ...newFiles];
  }

  // Legacy fallback: accept old Base64 payload if no new files
  if (req.body.resultFile && filesArray.length === 0) {
    try { filesArray = JSON.parse(req.body.resultFile); } catch (e) { filesArray = req.body.resultFile; }
  }

  const filePayload = (Array.isArray(filesArray) && filesArray.length > 0)
    ? JSON.stringify(filesArray)
    : (typeof filesArray === 'string' && filesArray ? filesArray : null);

  if (!filePayload && !resultNotes) {
    return res.status(400).json({ message: "يجب إرفاق ملف أو كتابة تقرير" });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 3. Resolve target test IDs for this visit
    let targetIds = [];
    if (targetTestIds) {
      try {
        targetIds = typeof targetTestIds === 'string' ? JSON.parse(targetTestIds) : targetTestIds;
      } catch (e) {
        targetIds = [];
      }
    }

    let targetRequests = [];
    if (Array.isArray(targetIds) && targetIds.length > 0) {
      const [rows] = await conn.query(
        `SELECT vlr.id, vlr.status, vlr.result_file, vlr.visit_id, p.full_name AS patient_name, v.visit_number
         FROM visit_lab_requests vlr
         JOIN visits v ON vlr.visit_id = v.id
         JOIN patients p ON v.patient_id = p.id
         WHERE vlr.visit_id = ? AND vlr.id IN (?) AND vlr.status IN ('in_progress', 'result_uploaded', 'completed')`,
        [visitId, targetIds]
      );
      targetRequests = rows;
    } else {
      // If no specific IDs provided, apply to all active started tests in this visit (excluding 'paid')
      const [rows] = await conn.query(
        `SELECT vlr.id, vlr.status, vlr.result_file, vlr.visit_id, p.full_name AS patient_name, v.visit_number
         FROM visit_lab_requests vlr
         JOIN visits v ON vlr.visit_id = v.id
         JOIN patients p ON v.patient_id = p.id
         WHERE vlr.visit_id = ? AND vlr.status IN ('in_progress', 'result_uploaded', 'completed')`,
        [visitId]
      );
      targetRequests = rows;
    }

    if (targetRequests.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "لم يتم العثور على أي تحاليل قيد التنفيذ أو مكتملة قابلة للتحديث لهذه الزيارة" });
    }

    const targetRequestIds = targetRequests.map(r => r.id);

    // 4. Safe Orphan Deletion Analysis:
    // Collect all old file URLs from target rows before updating
    const keptUrls = new Set((Array.isArray(filesArray) ? filesArray : []).map(f => f.url).filter(Boolean));
    const oldUrlsSet = new Set();

    targetRequests.forEach(reqItem => {
      if (reqItem.result_file) {
        try {
          if (typeof reqItem.result_file === 'string' && reqItem.result_file.startsWith('[')) {
            const parsed = JSON.parse(reqItem.result_file);
            if (Array.isArray(parsed)) {
              parsed.forEach(f => { if (f?.url) oldUrlsSet.add(f.url); });
            }
          }
        } catch (e) {}
      }
    });

    // Filter out URLs that are being kept or just uploaded
    const oldUrlsToDelete = [...oldUrlsSet].filter(url => !keptUrls.has(url));

    // 5. Update Database Records for All Target Tests
    const completedIds = targetRequests.filter(r => r.status === 'completed').map(r => r.id);
    const nonCompletedIds = targetRequests.filter(r => r.status !== 'completed').map(r => r.id);

    if (completedIds.length > 0) {
      await conn.query(
        `UPDATE visit_lab_requests
         SET status = 'completed', result_notes = ?, result_file = ?, performed_by = ?, performed_at = NOW()
         WHERE id IN (?)`,
        [resultNotes || null, filePayload, req.user.id, completedIds]
      );
    }

    if (nonCompletedIds.length > 0) {
      await conn.query(
        `UPDATE visit_lab_requests
         SET status = 'result_uploaded', result_notes = ?, result_file = ?, performed_by = ?, performed_at = NOW()
         WHERE id IN (?)`,
        [resultNotes || null, filePayload, req.user.id, nonCompletedIds]
      );
    }

    // Commit DB transaction first so references are updated
    await conn.commit();

    // 6. Safely Delete Unlinked Orphan Files from Disk (checked against other database references)
    if (oldUrlsToDelete.length > 0) {
      await safelyDeleteOrphanFiles(oldUrlsToDelete, targetRequestIds, db);
    }

    // 7. Emit Realtime Sockets
    const io = req.app.get('io');
    if (io) {
      io.to('lab').emit('lab:update', { visitId: Number(visitId) });

      const anyCompleted = targetRequests.some(r => r.status === 'completed');
      const isExternal = Boolean(targetRequests[0]?.visit_number?.startsWith('EXT-'));
      if (anyCompleted && !isExternal) {
        const patientName = targetRequests[0]?.patient_name || 'مريض';
        const msg = `تم تعديل نتيجة التحاليل للمريض: ${patientName}`;
        const updatePayload = {
          type: 'lab_ready',
          message: msg,
          patientName,
          visitId: Number(visitId),
          category: 'lab'
        };
        io.to('doctor').emit('result:updated', updatePayload);
        io.to('secretary').emit('result:updated', updatePayload);
      }
    }

    res.json({
      message: `تم حفظ واعتماد النتيجة لـ (${targetRequests.length}) تحاليل بنجاح`,
      updatedCount: targetRequests.length
    });
  } catch (error) {
    await conn.rollback();
    console.error('bulkUploadResult error:', error);
    res.status(500).json({ message: 'فشل حفظ النتائج المجمعة' });
  } finally {
    conn.release();
  }
};

// 5. Complete all lab work for a visit, automatically deduct BOM consumables, and notify doctor
exports.completeVisitLab = async (req, res) => {
  const { visitId } = req.params;
  const conn = await db.getConnection();
  try {
    await ensureLabInventorySchema();
    await conn.beginTransaction();

    // 1. Fetch all finalized/completing lab requests for this visit that have not yet had consumables deducted
    const [requestsToDeduct] = await conn.execute(
      `SELECT
         vlr.id,
         vlr.visit_id,
         vlr.lab_test_id,
         vlr.status,
         COALESCE(vlr.consumables_deducted, 0) AS consumables_deducted,
         lt.name AS test_name,
         v.visit_number, 
        (CASE WHEN v.visit_number LIKE 'EXT-%' THEN 1 ELSE 0 END) AS is_external,
         p.full_name AS patient_name
       FROM visit_lab_requests vlr
       JOIN lab_tests lt ON vlr.lab_test_id = lt.id
       JOIN visits v ON vlr.visit_id = v.id
       JOIN patients p ON v.patient_id = p.id
       WHERE vlr.visit_id = ?
         AND vlr.status IN ('result_uploaded', 'completed')
         AND COALESCE(vlr.consumables_deducted, 0) = 0
       FOR UPDATE`,
      [visitId]
    );

    // 2. Mark all result_uploaded lab requests as completed
    await conn.execute(
      `UPDATE visit_lab_requests SET status = 'completed', performed_at = COALESCE(performed_at, NOW()) WHERE visit_id = ? AND status = 'result_uploaded'`,
      [visitId]
    );

    // 3. Execute automated BOM consumable deduction & clinical_consumption_log insertion
    const deductionResult = await deductLabConsumablesForRequests(conn, requestsToDeduct, req.user?.id);

    // 4. Check if ALL ancillaries for this visit are now done
    const [[allDone]] = await conn.execute(`
      SELECT
        (SELECT COUNT(*) FROM visit_lab_requests WHERE visit_id = ? AND status NOT IN ('completed', 'cancelled', 'refunded')) AS pending_labs,
        (SELECT COUNT(*) FROM visit_radiology_requests WHERE visit_id = ? AND status NOT IN ('completed', 'cancelled', 'refunded')) AS pending_rads,
        (SELECT COUNT(*) FROM visit_clinical_service_requests WHERE visit_id = ? AND status NOT IN ('completed', 'cancelled', 'refunded')) AS pending_clinicals
    `, [visitId, visitId, visitId]);

    const [[visitRow]] = await conn.execute(`SELECT visit_number FROM visits WHERE id = ?`, [visitId]);
    const isExternal = Boolean(visitRow?.visit_number?.startsWith('EXT-'));

    // If no pending services remain, restore visit to with_doctor or complete if external
    if (
      parseInt(allDone.pending_labs || 0) === 0 &&
      parseInt(allDone.pending_rads || 0) === 0 &&
      parseInt(allDone.pending_clinicals || 0) === 0
    ) {
      await conn.execute(
        isExternal
          ? `UPDATE visits SET status = 'completed', closed_at = NOW() WHERE id = ?`
          : `UPDATE visits SET status = 'with_doctor' WHERE id = ? AND status = 'awaiting_lab'`,
        [visitId]
      );
    }

    await conn.commit();

    const [rows] = await conn.query(
      `SELECT p.full_name as patientName FROM visits v JOIN patients p ON v.patient_id = p.id WHERE v.id = ?`,
      [visitId]
    );
    const patientName = rows.length > 0 ? rows[0].patientName : '';

    const io = req.app.get('io');
    if (io) {
      if (!isExternal) {
        io.to('doctor').emit('lab:completed', { message: `تم تجهيز تحاليل المريض`, patientName, visitId });
      }
      if (!isExternal) {
        io.to('secretary').emit('secretary:lab_ready', { visitId, patientName });
      }
      io.to('lab').emit('lab:update');
      io.to('cashier').emit('cashier:update');
      if (deductionResult.deductedAny) {
        io.to('lab').emit('inventory:updated', { store: 'lab' });
        io.to('auditor').emit('inventory:updated', { store: 'lab' });
      }
      if (deductionResult.lowStockAlerts.length > 0) {
        io.to('lab').emit('lab:low_stock_alert', { alerts: deductionResult.lowStockAlerts });
        io.to('auditor').emit('lab:low_stock_alert', { alerts: deductionResult.lowStockAlerts });
      }
    }
    res.json({ message: isExternal ? 'تم إنجاز التحليل الخارجي بنجاح' : 'تم إنهاء الزيارة وإشعار الطبيب' });
  } catch (error) {
    await conn.rollback();
    console.error('completeVisitLab error:', error);
    res.status(500).json({ message: 'تعذر تحديث حالة انتهاء المختبر' });
  } finally {
    conn.release();
  }
};

// 6. Reports & Stats
exports.getStats = async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const params = [];
    let dateCondition = '';
    if (startDate && endDate) {
      dateCondition = 'AND (vlr.performed_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND OR (vlr.performed_at IS NULL AND vlr.requested_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND))';
      params.push(`${startDate} 03:00:00`, `${endDate} 03:00:00`, `${startDate} 03:00:00`, `${endDate} 03:00:00`);
    }

    const summaryParams = [];
    let summaryDateCondition = '';
    if (startDate && endDate) {
      summaryDateCondition = 'AND (performed_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND OR (performed_at IS NULL AND requested_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND))';
      summaryParams.push(`${startDate} 03:00:00`, `${endDate} 03:00:00`, `${startDate} 03:00:00`, `${endDate} 03:00:00`);
    }

    const [[{ total_requests }]] = await db.query(
      `SELECT COUNT(*) as total_requests FROM visit_lab_requests WHERE status IN ('paid', 'in_progress', 'result_uploaded', 'completed') ${summaryDateCondition}`,
      summaryParams
    );
    const [[{ completed }]] = await db.query(
      `SELECT COUNT(*) as completed FROM visit_lab_requests WHERE status = 'completed' ${summaryDateCondition}`,
      summaryParams
    );
    // CRITICAL SAFEGUARD: Pending tests & waiting queues are NOT date-filtered so patients from previous shifts are never hidden
    const [[{ pending }]] = await db.query(
      `SELECT COUNT(*) as pending FROM visit_lab_requests WHERE status IN ('paid', 'in_progress', 'result_uploaded')`
    );
    
    // Tab Counters — CRITICAL SAFEGUARD:
    // Pending and In-Progress queues must NEVER be filtered by date
    const [[{ pendingVisits }]] = await db.query(
      `SELECT COUNT(DISTINCT visit_id) as pendingVisits FROM visit_lab_requests WHERE status = 'paid'`
    );
    const [[{ inProgressVisits }]] = await db.query(
      `SELECT COUNT(DISTINCT visit_id) as inProgressVisits FROM visit_lab_requests WHERE status IN ('in_progress', 'result_uploaded')`
    );
    // Completed counter applies operational shift boundary (03:00 AM)
    const [[{ completedVisits }]] = await db.query(
      `SELECT COUNT(DISTINCT visit_id) as completedVisits FROM visit_lab_requests WHERE status = 'completed' ${summaryDateCondition}`,
      summaryParams
    );
    
    const tableQuery = `
      SELECT 
        v.id as visit_id,
        v.visit_number, 
        (CASE WHEN v.visit_number LIKE 'EXT-%' THEN 1 ELSE 0 END) AS is_external, 
        p.full_name as patient_name, 
        (CASE WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v.id) OR v.status = 'transferred_to_center' OR EXISTS (SELECT 1 FROM visit_lab_requests vlr2 WHERE vlr2.visit_id = v.id AND vlr2.surgery_id IS NOT NULL) THEN 1 ELSE 0 END) AS is_surgery,
        COALESCE(MAX(vlr.performed_at), MAX(vlr.requested_at)) as date,
        COUNT(vlr.id) as total_tests,
        SUM(CASE WHEN vlr.status = 'completed' THEN 1 ELSE 0 END) as completed_tests,
        SUM(CASE WHEN vlr.status IN ('paid', 'in_progress', 'result_uploaded') THEN 1 ELSE 0 END) as pending_tests,
        GROUP_CONCAT(DISTINCT lt.name SEPARATOR ', ') as test_names,
        GROUP_CONCAT(DISTINCT lc.name SEPARATOR ', ') as category_names
      FROM visit_lab_requests vlr
      JOIN visits v ON vlr.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      LEFT JOIN lab_tests lt ON vlr.lab_test_id = lt.id
      LEFT JOIN lab_categories lc ON lt.category_id = lc.id
      WHERE vlr.status IN ('paid', 'in_progress', 'result_uploaded', 'completed')
      ${dateCondition}
      GROUP BY v.id
      ORDER BY date DESC
    `;
    const [tableData] = await db.query(tableQuery, params);

    res.json({
      summary: {
        total_requests: total_requests || 0,
        completed: completed || 0,
        pending: pending || 0,
      },
      tabCounters: {
        pending: pendingVisits || 0,
        in_progress: inProgressVisits || 0,
        completed: completedVisits || 0,
      },
      tableData
    });
  } catch (error) {
    console.error('getStats error:', error);
    res.status(500).json({ message: 'فشل تحميل الإحصائيات' });
  }
};
