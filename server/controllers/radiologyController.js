const db = require('../database/db');
const fs = require('fs');
const path = require('path');

const deleteUnlinkedFiles = (oldJsonStr, newFilesArray) => {
  if (!oldJsonStr || typeof oldJsonStr !== 'string' || !oldJsonStr.startsWith('[')) return;
  try {
    const oldFiles = JSON.parse(oldJsonStr);
    const newUrls = (Array.isArray(newFilesArray) ? newFilesArray : []).map(f => f.url).filter(Boolean);
    oldFiles.forEach(oldFile => {
      if (oldFile.url && !newUrls.includes(oldFile.url)) {
        // __dirname is server/controllers, so .. goes to server/
        // oldFile.url is /uploads/radiology/...
        // we remove the leading slash if it exists so path.join works predictably on windows
        const relUrl = oldFile.url.startsWith('/') ? oldFile.url.substring(1) : oldFile.url;
        const filePath = path.join(__dirname, '..', relUrl);
        if (fs.existsSync(filePath)) {
           fs.unlinkSync(filePath);
        }
      }
    });
  } catch (e) {
    console.error('GC Error:', e);
  }
};

// 1. Get requests based on tab (pending, in_progress, completed)
exports.getRequests = async (req, res) => {
  const { tab = 'pending', startDate, endDate } = req.query;
  try {
    let statusFilter = "('paid')";
    if (tab === 'in_progress') statusFilter = "('in_progress')";
    if (tab === 'completed') statusFilter = "('completed')";
    if (tab === 'pending') statusFilter = "('paid')";

    let dateFilter = '';
    const params = [];
    if (startDate && endDate) {
      if (tab === 'completed') {
        dateFilter = `AND COALESCE((SELECT MAX(performed_at) FROM visit_radiology_requests WHERE visit_id = v.id AND status = 'completed'), (SELECT MAX(requested_at) FROM visit_radiology_requests WHERE visit_id = v.id AND status = 'completed')) BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND`;
      } else {
        dateFilter = `AND (SELECT MIN(requested_at) FROM visit_radiology_requests WHERE visit_id = v.id) BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND`;
      }
      params.push(`${startDate} 03:00:00`, `${endDate} 03:00:00`);
    }

    const query = `
      SELECT DISTINCT 
        v.id as visit_id, 
        v.visit_number, 
        (CASE WHEN v.visit_number LIKE 'EXT-%' THEN 1 ELSE 0 END) AS is_external, 
        p.full_name, 
        p.age, 
        p.gender,
        (CASE 
          WHEN ${tab === 'completed'} THEN (SELECT COALESCE(MAX(performed_at), MAX(requested_at)) FROM visit_radiology_requests WHERE visit_id = v.id AND status = 'completed')
          ELSE (SELECT MIN(requested_at) FROM visit_radiology_requests WHERE visit_id = v.id AND status IN ${statusFilter})
        END) as requested_at,
        (SELECT MAX(performed_at) FROM visit_radiology_requests WHERE visit_id = v.id AND status = 'completed') as performed_at,
        (SELECT COUNT(*) FROM visit_radiology_requests WHERE visit_id = v.id AND status IN ${statusFilter}) as total_tests,
        (SELECT COUNT(*) FROM visit_radiology_requests WHERE visit_id = v.id AND status IN ${statusFilter} AND with_film = 1) as tests_with_film
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      JOIN visit_radiology_requests vrr ON v.id = vrr.visit_id
      WHERE vrr.status IN ${statusFilter} ${dateFilter}
      ORDER BY requested_at ${tab === 'completed' ? 'DESC' : 'ASC'}
    `;
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('getRequests error:', error);
    res.status(500).json({ message: 'فشل تحميل الطلبات' });
  }
};

// 2. Get details for a specific visit, including film groups
exports.getVisitDetails = async (req, res) => {
  const { visitId } = req.params;
  try {
    const visitQuery = `
      SELECT 
        v.id as visit_id, 
        v.visit_number, 
        (CASE WHEN v.visit_number LIKE 'EXT-%' THEN 1 ELSE 0 END) AS is_external, 
        v.created_at,
        (CASE WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v.id) OR v.status = 'transferred_to_center' OR EXISTS (SELECT 1 FROM visit_radiology_requests vrr2 WHERE vrr2.visit_id = v.id AND vrr2.surgery_id IS NOT NULL) THEN 1 ELSE 0 END) AS is_surgery,
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
        vrr.id, 
        vrr.status, 
        vrr.with_film, 
        vrr.result_file, 
        vrr.result_notes, 
        vrr.radiology_film_id, 
        vrr.requested_at,
        vrr.performed_at,
        rt.name, 
        rc.name as category_name
      FROM visit_radiology_requests vrr
      JOIN radiology_tests rt ON vrr.radiology_test_id = rt.id
      LEFT JOIN radiology_categories rc ON rt.category_id = rc.id
      WHERE vrr.visit_id = ? AND vrr.status IN ('paid', 'in_progress', 'completed')
      ORDER BY vrr.id ASC
    `;
    const [requests] = await db.query(requestsQuery, [visitId]);

    const filmsQuery = `SELECT id, film_size, created_at FROM visit_radiology_films WHERE visit_id = ?`;
    const [films] = await db.query(filmsQuery, [visitId]);

    res.json({
      visit: visitRows[0],
      requests,
      films
    });
  } catch (error) {
    console.error('getVisitDetails error:', error);
    res.status(500).json({ message: 'فشل تحميل تفاصيل الزيارة' });
  }
};

// 3. Update status (e.g. start all)
exports.updateRequestStatus = async (req, res) => {
  const { requestId } = req.params;
  const { status } = req.body;
  try {
    // Phase 3: Backend Security Guard
    // If trying to mark a scan as 'completed', enforce the film business rule:
    // A scan that requires a film (with_film = 1) CANNOT be completed unless it is linked to one.
    let visitId, patientName, msgText;
    if (status === 'completed') {
      const [[scanRow]] = await db.query(
        `SELECT vrr.with_film, vrr.radiology_film_id, vrr.visit_id, p.full_name as patientName 
         FROM visit_radiology_requests vrr
         JOIN visits v ON vrr.visit_id = v.id
         JOIN patients p ON v.patient_id = p.id
         WHERE vrr.id = ?`,
        [requestId]
      );
      if (scanRow && scanRow.with_film === 1 && !scanRow.radiology_film_id) {
        return res.status(400).json({
          message: 'لا يمكن تسليم هذه الدراسة بشكل منفرد — يجب إدراجها في فيلم أولاً'
        });
      }
      if (scanRow) {
        visitId = scanRow.visit_id;
        patientName = scanRow.patientName;
        msgText = (scanRow.with_film === 1 && scanRow.radiology_film_id) 
            ? 'تم تجهيز فحص الأشعة للمريض' 
            : 'تم تجهيز الفحص الإشعاعي للمريض';
      }
    }

    await db.query("UPDATE visit_radiology_requests SET status = ?, performed_by = ? WHERE id = ?", [status, req.user.id, requestId]);
    
    const io = req.app.get('io');
    if (io) {
      if (status === 'completed' && visitId) {
        io.to('radiology').emit('radiology:updated', { visitId });
      }
      io.to('cashier').emit('cashier:update');
    }

    res.json({ message: 'تم تحديث الحالة بنجاح' });
  } catch (error) {
    console.error('updateRequestStatus error:', error);
    res.status(500).json({ message: 'فشل تحديث الحالة' });
  }
};

// Start all pending requests for a visit
exports.startAllRequests = async (req, res) => {
  const { visitId } = req.params;
  try {
    await db.query("UPDATE visit_radiology_requests SET status = 'in_progress', performed_by = ? WHERE visit_id = ? AND status = 'paid'", [req.user.id, visitId]);
    
    const io = req.app.get('io');
    if (io) {
      io.to('radiology').emit('radiology:updated', { visitId });
      io.to('cashier').emit('cashier:update');
    }

    res.json({ message: 'تم بدء التنفيذ لجميع طلبات الأشعة' });
  } catch (error) {
    console.error('startAllRequests error:', error);
    res.status(500).json({ message: 'فشل بدء التنفيذ' });
  }
};

// Film Grouping Management
exports.createFilmGroup = async (req, res) => {
  const { visitId } = req.params;
  const { filmSize, requestIds } = req.body; // array of vrr.id
  const conn = await db.getConnection();
  try {
    if (!requestIds || requestIds.length === 0) {
      return res.status(400).json({ message: 'يجب تحديد فحص واحد على الأقل' });
    }
    
    if (filmSize === 'large' && requestIds.length > 6) {
      return res.status(400).json({ message: 'الفيلم الكبير لا يمكنه احتواء أكثر من 6 فحوصات' });
    }
    if (filmSize === 'small' && requestIds.length > 2) {
      return res.status(400).json({ message: 'الفيلم الصغير لا يمكنه احتواء أكثر من فحصين' });
    }

    await conn.beginTransaction();
    
    // 1. Insert film record
    const [insertRes] = await conn.query(
      "INSERT INTO visit_radiology_films (visit_id, film_size) VALUES (?, ?)",
      [visitId, filmSize]
    );
    const filmId = insertRes.insertId;

    // 2. Link requests to this film
    const placeholders = requestIds.map(() => '?').join(',');
    await conn.query(
      `UPDATE visit_radiology_requests SET radiology_film_id = ? WHERE id IN (${placeholders}) AND visit_id = ?`,
      [filmId, ...requestIds, visitId]
    );

    // 3. Automatic film inventory deduction (Supports negative stock for emergency medical continuity)
    if (filmSize === 'large' || filmSize === 'small') {
      const [[radItem]] = await conn.query(
        "SELECT id, name, unit, quantity, COALESCE(cost_price, 0) AS cost_price FROM rad_inventory_items WHERE film_type = ? AND is_active = 1 LIMIT 1",
        [filmSize]
      );

      if (radItem) {
        const unitCost = Number(parseFloat(radItem.cost_price || 0).toFixed(2));
        const totalCost = Number((1 * unitCost).toFixed(2));

        // Deduct 1 unit
        await conn.execute(
          "UPDATE rad_inventory_items SET quantity = quantity - 1 WHERE id = ?",
          [radItem.id]
        );

        // Fetch visit & patient & scan details for audit trail
        const [[visitInfo]] = await conn.query(`
          SELECT v.visit_number, p.full_name as patient_name
          FROM visits v
          JOIN patients p ON v.patient_id = p.id
          WHERE v.id = ?
        `, [visitId]);

        const [scanRows] = await conn.query(
          `SELECT rt.name FROM visit_radiology_requests vrr
           JOIN radiology_tests rt ON vrr.radiology_test_id = rt.id
           WHERE vrr.id IN (${placeholders})`,
          requestIds
        );
        const scanNames = scanRows.map(r => r.name).join('، ');

        await conn.execute(`
          INSERT INTO clinical_consumption_log
            (store, item_id, item_name, item_unit, qty_deducted, unit_cost, total_cost, visit_id, patient_name, visit_number, service_name, trigger_type, notes, performed_by)
          VALUES
            ('radiology', ?, ?, ?, 1.0000, ?, ?, ?, ?, ?, ?, 'procedure_consumption', ?, ?)
        `, [
          radItem.id,
          radItem.name,
          radItem.unit || 'فيلم',
          unitCost,
          totalCost,
          visitId,
          visitInfo?.patient_name || null,
          visitInfo?.visit_number || null,
          scanNames || (filmSize === 'large' ? 'فيلم أشعة كبير' : 'فيلم أشعة صغير'),
          `استهلاك تلقائي عند تجميع فيلم (${filmSize === 'large' ? 'كبير' : 'صغير'})`,
          req.user?.id || null
        ]);
      }
    }

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('radiology').emit('inventory:updated');
      io.to('radiology').emit('radiology:updated', { visitId });
    }

    res.json({ message: 'تم تجميع الأشعة في الفيلم وخصم المخزون تلقائياً بنجاح', filmId });
  } catch (error) {
    await conn.rollback();
    console.error('createFilmGroup error:', error);
    res.status(500).json({ message: 'فشل إنشاء الفيلم: ' + (error.message || 'خطأ في الخادم') });
  } finally {
    conn.release();
  }
};

exports.deleteFilmGroup = async (req, res) => {
  const { filmId } = req.params;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Fetch film info before deletion
    const [[filmRow]] = await conn.query(
      "SELECT id, visit_id, film_size FROM visit_radiology_films WHERE id = ?",
      [filmId]
    );

    if (filmRow) {
      // Automatic film reversal (+1) if large or small
      if (filmRow.film_size === 'large' || filmRow.film_size === 'small') {
        const [[radItem]] = await conn.query(
          "SELECT id, name, unit FROM rad_inventory_items WHERE film_type = ? AND is_active = 1 LIMIT 1",
          [filmRow.film_size]
        );

        if (radItem) {
          await conn.execute(
            "UPDATE rad_inventory_items SET quantity = quantity + 1 WHERE id = ?",
            [radItem.id]
          );

          await conn.execute(`
            DELETE FROM clinical_consumption_log
            WHERE store = 'radiology'
              AND visit_id = ?
              AND item_id = ?
              AND trigger_type = 'procedure_consumption'
            ORDER BY id DESC
            LIMIT 1
          `, [filmRow.visit_id, radItem.id]);
        }
      }

      // Revert completed status back to in_progress before deletion
      await conn.query(`
        UPDATE visit_radiology_requests 
        SET status = 'in_progress' 
        WHERE radiology_film_id = ? AND status = 'completed'
      `, [filmId]);

      // ON DELETE SET NULL constraint will automatically unlink the requests
      await conn.query("DELETE FROM visit_radiology_films WHERE id = ?", [filmId]);
    }

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('radiology').emit('inventory:updated');
      io.to('radiology').emit('radiology:updated', { visitId: filmRow ? filmRow.visit_id : null });
    }

    res.json({ message: 'تم حذف الفيلم واسترجاع رصيد المخزون وفك ارتباط الفحوصات' });
  } catch (error) {
    await conn.rollback();
    console.error('deleteFilmGroup error:', error);
    res.status(500).json({ message: 'فشل حذف الفيلم: ' + (error.message || 'خطأ في الخادم') });
  } finally {
    conn.release();
  }
};

// 4. Upload result (FormData multipart: files via Multer + resultNotes)
exports.uploadResult = async (req, res) => {
  const { requestId } = req.params;
  const { resultNotes, existingFiles } = req.body;
  
  let filesArray = [];
  if (existingFiles) {
    try { filesArray = JSON.parse(existingFiles); } catch(e) {}
  }
  
  if (req.files && req.files.length > 0) {
    const newFiles = req.files.map(file => ({
      name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      type: file.mimetype,
      url: '/uploads/radiology/' + file.filename,
      size: file.size
    }));
    filesArray = [...filesArray, ...newFiles];
  }
  
  // Fallback for legacy uploads (Base64 JSON sent directly in resultFile)
  if (req.body.resultFile && filesArray.length === 0) {
    try { filesArray = JSON.parse(req.body.resultFile); } catch(e) { filesArray = req.body.resultFile; }
  }

  const filePayload = (Array.isArray(filesArray) && filesArray.length > 0) ? JSON.stringify(filesArray) : (typeof filesArray === 'string' && filesArray ? filesArray : null);

  try {
    const [[oldRequest]] = await db.query('SELECT result_file FROM visit_radiology_requests WHERE id = ?', [requestId]);

    await db.query(`
      UPDATE visit_radiology_requests 
      SET result_file = ?, result_notes = ?, performed_by = ?, performed_at = NOW() 
      WHERE id = ?`, 
      [filePayload, resultNotes || null, req.user.id, requestId]
    );
    
    if (oldRequest) {
      deleteUnlinkedFiles(oldRequest.result_file, filesArray || []);
    }
    
    // Notify on result update
    const [[scanRow]] = await db.query(
      `SELECT vrr.status, vrr.visit_id, p.full_name as patientName, v.visit_number 
       FROM visit_radiology_requests vrr
       JOIN visits v ON vrr.visit_id = v.id
       JOIN patients p ON v.patient_id = p.id
       WHERE vrr.id = ?`,
      [requestId]
    );

    const io = req.app.get('io');
    if (io && scanRow) {
       io.to('radiology').emit('radiology:updated', { visitId: scanRow.visit_id });

       // Only notify doctor and secretary if this is an actual modification of an already completed test
       const isExternal = Boolean(scanRow?.visit_number?.startsWith('EXT-'));
       if (scanRow.status === 'completed' && !isExternal) {
          const patientName = scanRow.patientName || 'مريض';
          const msg = `تم تعديل نتيجة الأشعة للمريض: ${patientName}`;
          const updatePayload = {
             type: 'radiology_ready',
             message: msg,
             patientName,
             visitId: scanRow.visit_id,
             category: 'radiology'
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

// 4b. Upload shared result for a film (FormData multipart)
exports.uploadFilmResult = async (req, res) => {
  const { filmId } = req.params;
  const { resultNotes, existingFiles } = req.body;
  
  let filesArray = [];
  if (existingFiles) {
    try { filesArray = JSON.parse(existingFiles); } catch(e) {}
  }
  
  if (req.files && req.files.length > 0) {
    const newFiles = req.files.map(file => ({
      name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      type: file.mimetype,
      url: '/uploads/radiology/' + file.filename,
      size: file.size
    }));
    filesArray = [...filesArray, ...newFiles];
  }
  
  if (req.body.resultFile && filesArray.length === 0) {
    try { filesArray = JSON.parse(req.body.resultFile); } catch(e) { filesArray = req.body.resultFile; }
  }

  const filePayload = (Array.isArray(filesArray) && filesArray.length > 0) ? JSON.stringify(filesArray) : (typeof filesArray === 'string' && filesArray ? filesArray : null);

  try {
    const [[oldRequest]] = await db.query('SELECT result_file FROM visit_radiology_requests WHERE radiology_film_id = ? LIMIT 1', [filmId]);

    await db.query(`
      UPDATE visit_radiology_requests 
      SET result_file = ?, result_notes = ?, performed_by = ?, performed_at = NOW() 
      WHERE radiology_film_id = ?
    `, [filePayload, resultNotes || null, req.user.id, filmId]);

    if (oldRequest) {
      deleteUnlinkedFiles(oldRequest.result_file, filesArray || []);
    }
    
    // Notify on film result update
    const [scans] = await db.query(
      `SELECT vrr.status, vrr.visit_id, p.full_name as patientName, v.visit_number 
       FROM visit_radiology_requests vrr
       JOIN visits v ON vrr.visit_id = v.id
       JOIN patients p ON v.patient_id = p.id
       WHERE vrr.radiology_film_id = ? LIMIT 1`,
      [filmId]
    );

    const io = req.app.get('io');
    if (io && scans.length > 0) {
       const scanRow = scans[0];
       io.to('radiology').emit('radiology:updated', { visitId: scanRow.visit_id });

       // Only notify doctor and secretary if this is an actual modification of an already completed test
       const isExternal = Boolean(scanRow?.visit_number?.startsWith('EXT-'));
       if (scanRow.status === 'completed' && !isExternal) {
          const patientName = scanRow.patientName || 'مريض';
          const msg = `تم تعديل نتيجة الأشعة للفيلم للمريض: ${patientName}`;
          const updatePayload = {
             type: 'radiology_ready',
             message: msg,
             patientName,
             visitId: scanRow.visit_id,
             category: 'radiology'
          };

          io.to('doctor').emit('result:updated', updatePayload);
          io.to('secretary').emit('result:updated', updatePayload);
       }
    }

    res.json({ message: 'تم رفع النتيجة المشتركة للفيلم' });
  } catch (error) {
    console.error('uploadFilmResult error:', error);
    res.status(500).json({ message: 'فشل حفظ النتيجة المشتركة' });
  }
};

// 5. Complete all radiology work for a visit and notify doctor
exports.completeVisitRadiology = async (req, res) => {
  const { visitId } = req.params;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Validate if any with_film=1 is still unassigned to a film
    const [unassigned] = await conn.query(
      "SELECT id FROM visit_radiology_requests WHERE visit_id = ? AND with_film = 1 AND radiology_film_id IS NULL AND status IN ('paid', 'in_progress', 'completed')",
      [visitId]
    );
    if (unassigned.length > 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'لا يمكن الإنهاء: توجد فحوصات مع أفلام لم يتم تجميعها أو تحديد حجم فيلم لها' });
    }

    // Check if ALL ancillaries for this visit are now done
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
          : `UPDATE visits SET status = 'with_doctor' WHERE id = ? AND status = 'awaiting_radiology'`,
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
        io.to('doctor').emit('radiology:completed', { message: 'تم تجهيز أشعة المريض', patientName, visitId });
      }
      if (!isExternal) {
        io.to('secretary').emit('secretary:radiology_ready', { visitId, patientName });
      }
      io.to('radiology').emit('radiology:updated', { visitId });
      io.to('cashier').emit('cashier:update');
    }
    res.json({ message: isExternal ? 'تم إنجاز فحص الأشعة الخارجي بنجاح' : 'تم إنهاء الزيارة وإشعار الطبيب' });
  } catch (error) {
    await conn.rollback();
    console.error('completeVisitRadiology error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء إنهاء الزيارة' });
  } finally {
    conn.release();
  }
};

// 6. Reports & Stats
exports.getStats = async (req, res) => {
  const { startDate, endDate, quickStats } = req.query;
  try {
    let fastFilmFilter = '';
    let tableFilmFilter = '';
    let dateFilterReq = '';
    let dateFilterReqUnion = '';
    const params = [];
    const tableParams = [];
    if (startDate && endDate) {
      fastFilmFilter = `AND created_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND`;
      tableFilmFilter = `WHERE f.created_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND`;
      dateFilterReq = `AND performed_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND`;
      dateFilterReqUnion = `AND vrr.performed_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND`;
      
      const startStr = `${startDate} 03:00:00`;
      const endStr = `${endDate} 03:00:00`;
      params.push(startStr, endStr);
      tableParams.push(startStr, endStr, startStr, endStr);
    }

    // Request date filter for scans
    let reqDateFilter = '';
    const reqDateParams = [];
    if (startDate && endDate) {
      reqDateFilter = `AND (performed_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND OR (performed_at IS NULL AND requested_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND))`;
      const startStr = `${startDate} 03:00:00`;
      const endStr = `${endDate} 03:00:00`;
      reqDateParams.push(startStr, endStr, startStr, endStr);
    }

    // Fast Stats
    const [[{ large_films }]] = await db.query(`SELECT COUNT(*) as large_films FROM visit_radiology_films WHERE film_size = 'large' ${fastFilmFilter}`, params);
    const [[{ small_films }]] = await db.query(`SELECT COUNT(*) as small_films FROM visit_radiology_films WHERE film_size = 'small' ${fastFilmFilter}`, params);
    
    const [[{ without_film }]] = await db.query(`SELECT COUNT(*) as without_film FROM visit_radiology_requests WHERE (with_film = 0 OR with_film IS NULL) AND status = 'completed' ${reqDateFilter}`, reqDateParams);

    const [[{ total_scans }]] = await db.query(
      `SELECT COUNT(*) as total_scans FROM visit_radiology_requests WHERE status IN ('paid', 'in_progress', 'completed') ${reqDateFilter}`,
      reqDateParams
    );

    const [[{ completed_scans }]] = await db.query(
      `SELECT COUNT(*) as completed_scans FROM visit_radiology_requests WHERE status = 'completed' ${reqDateFilter}`,
      reqDateParams
    );

    // Tab Counters — CRITICAL SAFEGUARD:
    // Pending and In-Progress queues must NEVER be filtered by date so waiting patients are never hidden.
    const [[{ pendingVisits }]] = await db.query(`SELECT COUNT(DISTINCT visit_id) as pendingVisits FROM visit_radiology_requests WHERE status = 'paid'`);
    const [[{ inProgressVisits }]] = await db.query(`SELECT COUNT(DISTINCT visit_id) as inProgressVisits FROM visit_radiology_requests WHERE status = 'in_progress'`);
    
    // Completed counter applies operational shift boundary (03:00 AM)
    let completedDateFilter = '';
    const completedParams = [];
    if (startDate && endDate) {
      completedDateFilter = `AND (performed_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND OR (performed_at IS NULL AND requested_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND))`;
      const startStr = `${startDate} 03:00:00`;
      const endStr = `${endDate} 03:00:00`;
      completedParams.push(startStr, endStr, startStr, endStr);
    }
    const [[{ completedVisits }]] = await db.query(`SELECT COUNT(DISTINCT visit_id) as completedVisits FROM visit_radiology_requests WHERE status = 'completed' ${completedDateFilter}`, completedParams);
    
    // Detailed Table Stats
    const tableQuery = `
      SELECT 
        v.id as visit_id, v.visit_number, p.full_name as patient_name, p.age as patient_age, p.gender as patient_gender, f.created_at as date, f.film_size,
        COUNT(vrr.id) as scans_in_film,
        GROUP_CONCAT(rt.name SEPARATOR ' - ') as scan_names
      FROM visit_radiology_films f
      JOIN visits v ON f.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      LEFT JOIN visit_radiology_requests vrr ON vrr.radiology_film_id = f.id
      LEFT JOIN radiology_tests rt ON vrr.radiology_test_id = rt.id
      ${tableFilmFilter}
      GROUP BY f.id
      
      UNION ALL
      
      SELECT 
        v.id as visit_id, v.visit_number, p.full_name as patient_name, p.age as patient_age, p.gender as patient_gender, vrr.performed_at as date, 'none' as film_size,
        1 as scans_in_film,
        rt.name as scan_names
      FROM visit_radiology_requests vrr
      JOIN visits v ON vrr.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      JOIN radiology_tests rt ON vrr.radiology_test_id = rt.id
      WHERE vrr.status = 'completed' AND (vrr.with_film = 0 OR vrr.with_film IS NULL)
      ${dateFilterReqUnion}
      
      ORDER BY date DESC
    `;
    // Skip heavy tableQuery for dashboard quick-stats requests
    if (quickStats === '1') {
      return res.json({
        summary: {
          large_films: large_films || 0,
          small_films: small_films || 0,
          without_film: without_film || 0,
          total_operations: (large_films || 0) + (small_films || 0) + (without_film || 0),
          total_scans: total_scans || 0,
          completed_scans: completed_scans || 0
        },
        tabCounters: {
          pending: pendingVisits || 0,
          in_progress: inProgressVisits || 0,
          completed: completedVisits || 0,
        }
      });
    }

    const [tableData] = await db.query(tableQuery, tableParams);

    res.json({
      summary: {
        large_films: large_films || 0,
        small_films: small_films || 0,
        without_film: without_film || 0,
        total_operations: (large_films || 0) + (small_films || 0) + (without_film || 0),
        total_scans: total_scans || 0,
        completed_scans: completed_scans || 0
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
