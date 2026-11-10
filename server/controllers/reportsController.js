const db = require('../database/db');
const { getShiftRange } = require('../utils/shiftHelpers');

// 1. Executive Dashboard (KPIs, Charts, Recent Tables)
exports.getExecutiveDashboard = async (req, res) => {
  try {
    // Top Card KPIs
    const [patientsCount] = await db.query("SELECT COUNT(*) as total FROM patients");
    const [surgeriesCount] = await db.query("SELECT COUNT(*) as total FROM surgeries");
    
    // Revenue by currency - safe version without potentially missing columns
    const [surgPayments] = await db.query("SELECT SUM(amount) as total FROM surgery_payments");
    const [visitFees] = await db.query("SELECT SUM(entry_fee) as total FROM visits WHERE status NOT IN ('registered', 'pending_payment', 'cancelled') AND entry_fee > 0");
    const [labRev] = await db.query("SELECT SUM(price) as total FROM visit_lab_requests WHERE status IN ('paid', 'completed')");
    const [radRev] = await db.query("SELECT SUM(price) as total FROM visit_radiology_requests WHERE status IN ('paid', 'completed')");
    const [genIncome] = await db.query("SELECT SUM(amount) as total FROM financial_transactions WHERE type = 'income'");

    // Merge all revenue
    const totalRevenue = 
      parseFloat(surgPayments[0]?.total || 0) + 
      parseFloat(visitFees[0]?.total || 0) + 
      parseFloat(labRev[0]?.total || 0) + 
      parseFloat(radRev[0]?.total || 0) + 
      parseFloat(genIncome[0]?.total || 0);
      
    const revenueRows = [{ currency: 'YER', total: totalRevenue }];

    // Expenses
    const [surgExpenses] = await db.query("SELECT SUM(amount) as total FROM surgery_expenses");
    const [genExpenses] = await db.query("SELECT SUM(amount) as total FROM financial_transactions WHERE type = 'expense'");

    const totalExpenses = parseFloat(surgExpenses[0]?.total || 0) + parseFloat(genExpenses[0]?.total || 0);
    const expenseRows = [{ currency: 'YER', total: totalExpenses }];

    // Inventory Total Value
    const [generalInventoryVal] = await db.query("SELECT COALESCE(SUM(quantity * cost_price), 0) as total FROM general_inventory_items WHERE is_active = true");
    const [orInventoryVal] = await db.query("SELECT COALESCE(SUM(quantity * cost_price), 0) as total FROM or_inventory_items WHERE is_active = true");

    // Recent Lists
    const [recentPatients] = await db.query("SELECT id, full_name, age, created_at FROM patients ORDER BY id DESC LIMIT 10");
    const [recentSurgeries] = await db.query(`
      SELECT s.id, s.surgery_type, s.full_price, 'YER' as currency, s.status, p.full_name 
      FROM surgeries s 
      JOIN patients p ON s.patient_id = p.id 
      ORDER BY s.id DESC LIMIT 5
    `);
    const [recentPayments] = await db.query(`
      SELECT ft.id, ft.type, ft.category, ft.amount, 'YER' as currency, ft.created_at, p.full_name
      FROM financial_transactions ft
      LEFT JOIN visits v ON ft.visit_id = v.id
      LEFT JOIN patients p ON v.patient_id = p.id
      ORDER BY ft.id DESC LIMIT 10
    `);

    res.json({
      kpis: {
        totalPatients: patientsCount[0].total,
        totalSurgeries: surgeriesCount[0].total,
        revenue: revenueRows,
        expenses: expenseRows,
        inventoryValue: (parseFloat(generalInventoryVal[0].total || 0) + parseFloat(orInventoryVal[0].total || 0)).toFixed(2)
      },
      recent: {
        patients: recentPatients,
        surgeries: recentSurgeries,
        payments: recentPayments
      }
    });
  } catch (error) {
    console.error('getExecutiveDashboard error:', error);
    res.status(500).json({ message: 'حدث خطأ في تحميل لوحة التقارير التنفيذية', detail: error.message });
  }
};

// 2. Financial Report (Summaries + Detailed individual transactions per tab)
exports.getFinancialReport = async (req, res) => {
  const { startDate, endDate, currency } = req.query;
  let dateFilter = "";
  let params = [];

  if (startDate && endDate) {
    dateFilter = "AND created_at BETWEEN ? AND ?";
    params = [startDate + ' 00:00:00', endDate + ' 23:59:59'];
  }

  try {
    // Overall summaries
    let summaryQuery = `
      SELECT type, category, 'YER' as currency, SUM(amount) as total
      FROM financial_transactions
      WHERE 1=1 ${dateFilter}
      GROUP BY type, category
    `;
    const [summaries] = await db.query(summaryQuery, params);

    // Dynamic detailed tabs

    // A. Visit Fees
    let visitParams = [...params];
    const [visitFees] = await db.query(`
      SELECT v.created_at, v.visit_number, p.full_name, v.entry_fee as amount, 'YER' as currency, u.full_name as cashier_name
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      LEFT JOIN users u ON v.created_by = u.id
      WHERE v.status NOT IN ('registered', 'pending_payment', 'cancelled') AND v.entry_fee > 0
      ${startDate && endDate ? "AND v.created_at BETWEEN ? AND ?" : ""}
      ORDER BY v.created_at DESC
    `, visitParams);

    // B. Lab Requests
    const [labs] = await db.query(`
      SELECT r.requested_at as created_at, v.visit_number, p.full_name, t.name as service_name, r.price as amount, 'YER' as currency
      FROM visit_lab_requests r
      JOIN visits v ON r.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      JOIN lab_tests t ON r.lab_test_id = t.id
      WHERE r.status IN ('paid', 'completed')
      ${startDate && endDate ? "AND r.requested_at BETWEEN ? AND ?" : ""}
      ORDER BY r.requested_at DESC
    `, visitParams);

    // C. Radiology Requests
    const [radiologies] = await db.query(`
      SELECT r.requested_at as created_at, v.visit_number, p.full_name, t.name as service_name, r.price as amount, 'YER' as currency, r.with_film
      FROM visit_radiology_requests r
      JOIN visits v ON r.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      JOIN radiology_tests t ON r.radiology_test_id = t.id
      WHERE r.status IN ('paid', 'completed')
      ${startDate && endDate ? "AND r.requested_at BETWEEN ? AND ?" : ""}
      ORDER BY r.requested_at DESC
    `, visitParams);

    // D. Surgery Payments
    let surgPayParams = [...params];
    const [surgeries] = await db.query(`
      SELECT sp.payment_date as created_at, s.id as surgery_id, s.surgery_type, p.full_name, sp.amount, 'YER' as currency, 1 as exchange_rate, u.full_name as cashier_name
      FROM surgery_payments sp
      JOIN surgeries s ON sp.surgery_id = s.id
      JOIN patients p ON s.patient_id = p.id
      LEFT JOIN users u ON sp.received_by = u.id
      WHERE 1=1
      ${startDate && endDate ? "AND sp.payment_date BETWEEN ? AND ?" : ""}
      ORDER BY sp.payment_date DESC
    `, surgPayParams);

    // E. General Income & Expenses
    let ftParams = [...params];
    const [generalTransactions] = await db.query(`
      SELECT ft.created_at, ft.type, ft.category, ft.amount, 'YER' as currency, ft.description, u.full_name as cashier_name
      FROM financial_transactions ft
      LEFT JOIN users u ON ft.performed_by = u.id
      WHERE ft.category IN ('general_income', 'general_expense', 'refund')
      ${startDate && endDate ? "AND ft.created_at BETWEEN ? AND ?" : ""}
      ORDER BY ft.created_at DESC
    `, ftParams);

    res.json({
      summaries,
      details: {
        visitFees,
        labs,
        radiologies,
        surgeries,
        general: generalTransactions
      }
    });
  } catch (error) {
    console.error('getFinancialReport error:', error);
    res.status(500).json({ message: 'فشل تحميل التقرير المالي' });
  }
};

// 3. Surgery Performance Report (Detailed margins and profit percentages)
exports.getSurgeryPerformance = async (req, res) => {
  const { doctorId, startDate, endDate } = req.query;
  let filters = "";
  let params = [];

  if (startDate && endDate) {
    filters += " AND s.created_at BETWEEN ? AND ?";
    params.push(startDate + ' 00:00:00', endDate + ' 23:59:59');
  }

  try {
    const query = `
      SELECT s.id, s.created_at, s.surgery_type, s.full_price, 'YER' as currency, s.status, p.full_name,
             -- Cost of materials
             (SELECT COALESCE(SUM(quantity * cost_price), 0) FROM surgery_materials_used WHERE surgery_id = s.id) as materials_cost,
             -- Cost of other expenses (labour, etc.)
             (SELECT COALESCE(SUM(amount), 0) FROM surgery_expenses WHERE surgery_id = s.id) as other_expenses,
             -- Total paid so far
             (SELECT COALESCE(SUM(amount), 0) FROM surgery_payments WHERE surgery_id = s.id) as total_paid
      FROM surgeries s
      JOIN patients p ON s.patient_id = p.id
      WHERE 1=1 ${filters}
      ORDER BY s.created_at DESC
    `;
    const [rows] = await db.query(query, params);

    res.json(rows);
  } catch (error) {
    console.error('getSurgeryPerformance error:', error);
    res.status(500).json({ message: 'فشل تحميل تقرير العمليات الجراحية' });
  }
};

// 4. Patients & Visits Report
exports.getPatientsVisits = async (req, res) => {
  const { startDate, endDate, search } = req.query;
  let filters = "";
  let params = [];

  if (startDate && endDate) {
    filters += " AND v.created_at BETWEEN ? AND ?";
    params.push(startDate + ' 00:00:00', endDate + ' 23:59:59');
  }
  if (search) {
    filters += " AND (p.full_name LIKE ? OR v.visit_number LIKE ? OR p.phone LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  try {
    const query = `
      SELECT v.id, v.created_at, v.visit_number, v.entity, v.status, v.entry_fee, v.discount_amount,
             p.full_name, p.age, p.gender, p.phone, u.full_name as doctor_name
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      LEFT JOIN users u ON v.created_by = u.id
      WHERE 1=1 ${filters}
      ORDER BY v.created_at DESC
    `;
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('getPatientsVisits error:', error);
    res.status(500).json({ message: 'فشل تحميل تقرير المرضى والزيارات' });
  }
};

// Get single visit/patient full details for drill-down
exports.getPatientVisitDetail = async (req, res) => {
  const { id } = req.params;
  try {
    const [visitRows] = await db.query(`
      SELECT v.*, p.full_name, p.age, p.gender, p.phone, p.chronic_diseases, p.allergies, p.current_medications
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      WHERE v.id = ?
    `, [id]);
    
    if (visitRows.length === 0) return res.status(404).json({ message: 'الزيارة غير موجودة' });
    const visit = visitRows[0];

    // Get labs
    const [labs] = await db.query(`
      SELECT r.*, t.name as test_name 
      FROM visit_lab_requests r 
      JOIN lab_tests t ON r.lab_test_id = t.id 
      WHERE r.visit_id = ?
    `, [id]);

    // Get radiology
    const [radiologies] = await db.query(`
      SELECT r.*, t.name as test_name 
      FROM visit_radiology_requests r 
      JOIN radiology_tests t ON r.radiology_test_id = t.id 
      WHERE r.visit_id = ?
    `, [id]);

    // Get payments
    const [payments] = await db.query("SELECT * FROM financial_transactions WHERE visit_id = ?", [id]);

    // Get surgery linked (if any)
    const [surgeries] = await db.query("SELECT * FROM surgeries WHERE visit_id = ?", [id]);

    res.json({
      visit,
      labs,
      radiologies,
      payments,
      surgeries
    });
  } catch (error) {
    console.error('getPatientVisitDetail error:', error);
    res.status(500).json({ message: 'فشل تحميل تفاصيل الزيارة' });
  }
};

// 5. Diagnostics Report (Lab & Radiology stats)
exports.getDiagnosticsReport = async (req, res) => {
  const { startDate, endDate } = req.query;
  let dateFilter = "";
  let params = [];

  if (startDate && endDate) {
    dateFilter = "AND requested_at BETWEEN ? AND ?";
    params = [startDate + ' 00:00:00', endDate + ' 23:59:59'];
  }

  try {
    // Executed Labs
    const [labs] = await db.query(`
      SELECT r.requested_at as date, p.full_name as patient_name, t.name as test_name, r.price, r.status
      FROM visit_lab_requests r
      JOIN visits v ON r.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      JOIN lab_tests t ON r.lab_test_id = t.id
      WHERE 1=1 ${dateFilter}
      ORDER BY r.requested_at DESC
    `, params);

    // Executed Radiologies
    const [radiologies] = await db.query(`
      SELECT r.requested_at as date, p.full_name as patient_name, t.name as test_name, r.with_film, r.price, r.status
      FROM visit_radiology_requests r
      JOIN visits v ON r.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      JOIN radiology_tests t ON r.radiology_test_id = t.id
      WHERE 1=1 ${dateFilter}
      ORDER BY r.requested_at DESC
    `, params);

    // Top 10 Labs Requested
    const [topLabs] = await db.query(`
      SELECT t.name as test_name, COUNT(*) as count, SUM(r.price) as revenue
      FROM visit_lab_requests r
      JOIN lab_tests t ON r.lab_test_id = t.id
      WHERE r.status IN ('paid', 'completed')
      GROUP BY t.id
      ORDER BY count DESC LIMIT 10
    `);

    // Top 10 Radiologies Requested
    const [topRadiologies] = await db.query(`
      SELECT t.name as test_name, COUNT(*) as count, SUM(r.price) as revenue
      FROM visit_radiology_requests r
      JOIN radiology_tests t ON r.radiology_test_id = t.id
      WHERE r.status IN ('paid', 'completed')
      GROUP BY t.id
      ORDER BY count DESC LIMIT 10
    `);

    res.json({
      labs,
      radiologies,
      topLabs,
      topRadiologies
    });
  } catch (error) {
    console.error('getDiagnosticsReport error:', error);
    res.status(500).json({ message: 'فشل تحميل تقرير الخدمات التشخيصية' });
  }
};

// 6. Cashier Operations Report
exports.getCashierOperations = async (req, res) => {
  const { startDate, endDate } = req.query;
  let dateFilter = "";
  let params = [];

  if (startDate && endDate) {
    dateFilter = "AND ft.created_at BETWEEN ? AND ?";
    params = [startDate + ' 00:00:00', endDate + ' 23:59:59'];
  }

  try {
    const query = `
      SELECT ft.id, ft.created_at, ft.type, ft.category, ft.amount, 'YER' as currency, ft.description, 
             p.full_name as patient_name, u.full_name as cashier_name
      FROM financial_transactions ft
      LEFT JOIN visits v ON ft.visit_id = v.id
      LEFT JOIN patients p ON v.patient_id = p.id
      LEFT JOIN users u ON ft.performed_by = u.id
      WHERE 1=1 ${dateFilter}
      ORDER BY ft.created_at DESC
    `;
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('getCashierOperations error:', error);
    res.status(500).json({ message: 'فشل تحميل تقرير الصندوق' });
  }
};

// 7. Inventory Report & Stock History
exports.getInventoryReport = async (req, res) => {
  const { storeType } = req.query; // 'general' or 'or'
  try {
    let itemsQuery = storeType === 'or' 
      ? "SELECT id, name, unit, quantity, cost_price, min_quantity FROM or_inventory_items WHERE is_active = true"
      : "SELECT id, name, unit, quantity, cost_price, min_quantity FROM general_inventory_items WHERE is_active = true";
      
    const [items] = await db.query(itemsQuery);

    // Get recently completed transfers
    const [transfers] = await db.query(`
      SELECT tr.*, u1.full_name as sender_name, u2.full_name as receiver_name
      FROM inventory_transfers tr
      LEFT JOIN users u1 ON tr.sent_by = u1.id
      LEFT JOIN users u2 ON tr.received_by = u2.id
      ORDER BY tr.id DESC LIMIT 20
    `);

    res.json({ items, transfers });
  } catch (error) {
    console.error('getInventoryReport error:', error);
    res.status(500).json({ message: 'فشل تحميل التقرير المخزني' });
  }
};

// Get history of an individual item
exports.getItemHistory = async (req, res) => {
  const { id } = req.params;
  const { storeType } = req.query; // 'general' or 'or'
  try {
    const [history] = await db.query(`
      SELECT t.*, u.full_name as performed_by_name
      FROM inventory_transactions t
      LEFT JOIN users u ON t.performed_by = u.id
      WHERE t.item_id = ? AND t.item_type = ?
      ORDER BY t.created_at DESC
    `, [id, storeType]);

    res.json(history);
  } catch (error) {
    console.error('getItemHistory error:', error);
    res.status(500).json({ message: 'فشل تحميل سجل الصنف' });
  }
};

// Get surgery specific details (materials used, other expenses)
exports.getSurgeryDetails = async (req, res) => {
  const { id } = req.params;
  try {
    const [materials] = await db.query(`
      SELECT smu.*, item.name as item_name, item.unit 
      FROM surgery_materials_used smu 
      JOIN or_inventory_items item ON smu.inventory_item_id = item.id 
      WHERE smu.surgery_id = ?
    `, [id]);

    const [expenses] = await db.query("SELECT * FROM surgery_expenses WHERE surgery_id = ?", [id]);

    res.json({
      materials,
      expenses
    });
  } catch (error) {
    console.error('getSurgeryDetails error:', error);
    res.status(500).json({ message: 'فشل تحميل تفاصيل تكاليف العملية الجراحية' });
  }
};

// GET /api/doctor/reports/analytical
exports.getDoctorAnalyticalReports = async (req, res) => {
  const { startDate, endDate } = req.query;
  const doctorId = req.user.id;
  
  try {
    let shiftRange = null;
    if (startDate && endDate) {
      shiftRange = getShiftRange(startDate, endDate);
    }

    // 1. Completed Cases
    let completedQuery = `
      SELECT v.id as visitId, v.visit_number, v.status, v.entity, v.created_at, v.closed_at, v.is_follow_up, v.is_exempt, 
             (CASE WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v.id) OR v.status = 'transferred_to_center' THEN 1 ELSE 0 END) as is_surgery,
             IF(v.is_exempt = 1 AND v.entry_fee = 0, (SELECT CAST(setting_value AS UNSIGNED) FROM settings WHERE setting_key = 'entry_fee'), v.entry_fee) as consultation_fee,
             p.id as patient_id, p.full_name, p.age, p.gender, p.chronic_diseases, p.allergies, p.current_medications, p.phone
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      WHERE ((v.status = 'completed' AND v.is_exempt = 0) OR (v.is_exempt = 1 AND v.status NOT IN ('cancelled', 'refunded'))) AND v.created_by = ?
    `;
    let completedParams = [doctorId];
    if (shiftRange) {
      completedQuery += ` AND ((v.status = "completed" AND v.is_exempt = 0 AND ${shiftRange.sqlBetween('v.closed_at')}) OR (v.is_exempt = 1 AND v.status NOT IN ("cancelled", "refunded") AND ${shiftRange.sqlBetween('v.created_at')}))`;
      completedParams.push(shiftRange.startStr, shiftRange.endStr, shiftRange.startStr, shiftRange.endStr);
    }
    completedQuery += ' ORDER BY COALESCE(v.closed_at, v.created_at) DESC';
    const [completedRows] = await db.execute(completedQuery, completedParams);

    // Load full details for each completed visit (excluding cancelled/refunded services)
    const completedCases = [];
    for (const v of completedRows) {
      const [labs] = await db.execute(`
        SELECT lr.id, lr.status, lr.price, lr.discount_percentage, lr.discount_amount, lr.final_price, lr.is_free, lr.requested_at, lt.name
        FROM visit_lab_requests lr
        JOIN lab_tests lt ON lr.lab_test_id = lt.id
        WHERE lr.visit_id = ? AND lr.status NOT IN ('cancelled', 'refunded')
      `, [v.visitId]);

      const [rads] = await db.execute(`
        SELECT rr.id, rr.status, rr.price, rr.discount_percentage, rr.discount_amount, rr.final_price, rr.is_free, rr.requested_at, rt.name, rr.with_film
        FROM visit_radiology_requests rr
        JOIN radiology_tests rt ON rr.radiology_test_id = rt.id
        WHERE rr.visit_id = ? AND rr.status NOT IN ('cancelled', 'refunded')
      `, [v.visitId]);

      const [clinicals] = await db.execute(`
        SELECT cr.id, cr.status, cr.price, cr.discount_percentage, cr.discount_amount, cr.final_price, cr.is_free, cr.created_at, cs.name
        FROM visit_clinical_service_requests cr
        JOIN clinical_services cs ON cr.service_id = cs.id
        WHERE cr.visit_id = ? AND cr.status NOT IN ('cancelled', 'refunded')
      `, [v.visitId]);

      completedCases.push({
        ...v,
        labRequests: labs,
        radiologyRequests: rads,
        clinicalRequests: clinicals
      });
    }

    // 2. Discounts (Diagnostic & Clinical services only - strictly excluding cancelled/refunded)
    let discountsQuery = `
      SELECT 'lab' as type, lr.requested_at as date, p.id as patient_id, p.id, p.full_name as patient_name, p.full_name,
             p.age, p.gender, p.phone,
             v.is_follow_up, v.is_exempt,
             (CASE WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v.id) OR v.status = 'transferred_to_center' THEN 1 ELSE 0 END) as is_surgery,
             lt.name as service_name, lr.price as original_price, NULL as with_film, 
             lr.discount_percentage, lr.discount_amount, lr.final_price, v.visit_number, v.id as visit_id
      FROM visit_lab_requests lr
      JOIN visits v ON lr.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      JOIN lab_tests lt ON lr.lab_test_id = lt.id
      WHERE lr.discount_amount > 0 AND lr.is_free = 0 AND lr.requested_by = ?
        AND lr.status NOT IN ('cancelled', 'refunded')
        AND v.status NOT IN ('cancelled', 'refunded')
    `;
    let discountParams = [doctorId];
    if (shiftRange) {
      discountsQuery += ` AND ${shiftRange.sqlBetween('lr.requested_at')}`;
      discountParams.push(shiftRange.startStr, shiftRange.endStr);
    }

    discountsQuery += `
      UNION ALL
      
      SELECT 'radiology' as type, rr.requested_at as date, p.id as patient_id, p.id, p.full_name as patient_name, p.full_name,
             p.age, p.gender, p.phone,
             v.is_follow_up, v.is_exempt,
             (CASE WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v.id) OR v.status = 'transferred_to_center' THEN 1 ELSE 0 END) as is_surgery,
             rt.name as service_name, rr.price as original_price, rr.with_film, 
             rr.discount_percentage, rr.discount_amount, rr.final_price, v.visit_number, v.id as visit_id
      FROM visit_radiology_requests rr
      JOIN visits v ON rr.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      JOIN radiology_tests rt ON rr.radiology_test_id = rt.id
      WHERE rr.discount_amount > 0 AND rr.is_free = 0 AND rr.requested_by = ?
        AND rr.status NOT IN ('cancelled', 'refunded')
        AND v.status NOT IN ('cancelled', 'refunded')
    `;
    discountParams.push(doctorId);
    if (shiftRange) {
      discountsQuery += ` AND ${shiftRange.sqlBetween('rr.requested_at')}`;
      discountParams.push(shiftRange.startStr, shiftRange.endStr);
    }

    discountsQuery += `
      UNION ALL
      
      SELECT 'clinical' as type, cr.created_at as date, p.id as patient_id, p.id, p.full_name as patient_name, p.full_name,
             p.age, p.gender, p.phone,
             v.is_follow_up, v.is_exempt,
             (CASE WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v.id) OR v.status = 'transferred_to_center' THEN 1 ELSE 0 END) as is_surgery,
             cs.name as service_name, cr.price as original_price, NULL as with_film, 
             cr.discount_percentage, cr.discount_amount, cr.final_price, v.visit_number, v.id as visit_id
      FROM visit_clinical_service_requests cr
      JOIN visits v ON cr.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      JOIN clinical_services cs ON cr.service_id = cs.id
      WHERE cr.discount_amount > 0 AND cr.is_free = 0 AND v.created_by = ?
        AND cr.status NOT IN ('cancelled', 'refunded')
        AND v.status NOT IN ('cancelled', 'refunded')
    `;
    discountParams.push(doctorId);
    if (shiftRange) {
      discountsQuery += ` AND ${shiftRange.sqlBetween('cr.created_at')}`;
      discountParams.push(shiftRange.startStr, shiftRange.endStr);
    }

    discountsQuery += ' ORDER BY date DESC';
    const [discounts] = await db.execute(discountsQuery, discountParams);

    // 3. Exemptions (Diagnostic & Clinical services only - strictly excluding cancelled/refunded)
    let exemptionsQuery = `
      SELECT 'lab' as type, lr.requested_at as date, p.id as patient_id, p.id, p.full_name as patient_name, p.full_name,
             p.age, p.gender, p.phone,
             v.is_follow_up, v.is_exempt,
             (CASE WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v.id) OR v.status = 'transferred_to_center' THEN 1 ELSE 0 END) as is_surgery,
             lt.name as service_name, lr.price as original_price, NULL as with_film, v.visit_number, v.id as visit_id
      FROM visit_lab_requests lr
      JOIN visits v ON lr.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      JOIN lab_tests lt ON lr.lab_test_id = lt.id
      WHERE lr.is_free = 1 AND lr.requested_by = ?
        AND lr.status NOT IN ('cancelled', 'refunded')
        AND v.status NOT IN ('cancelled', 'refunded')
    `;
    let exemptionParams = [doctorId];
    if (shiftRange) {
      exemptionsQuery += ` AND ${shiftRange.sqlBetween('lr.requested_at')}`;
      exemptionParams.push(shiftRange.startStr, shiftRange.endStr);
    }

    exemptionsQuery += `
      UNION ALL
      
      SELECT 'radiology' as type, rr.requested_at as date, p.id as patient_id, p.id, p.full_name as patient_name, p.full_name,
             p.age, p.gender, p.phone,
             v.is_follow_up, v.is_exempt,
             (CASE WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v.id) OR v.status = 'transferred_to_center' THEN 1 ELSE 0 END) as is_surgery,
             rt.name as service_name, rr.price as original_price, rr.with_film, v.visit_number, v.id as visit_id
      FROM visit_radiology_requests rr
      JOIN visits v ON rr.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      JOIN radiology_tests rt ON rr.radiology_test_id = rt.id
      WHERE rr.is_free = 1 AND rr.requested_by = ?
        AND rr.status NOT IN ('cancelled', 'refunded')
        AND v.status NOT IN ('cancelled', 'refunded')
    `;
    exemptionParams.push(doctorId);
    if (shiftRange) {
      exemptionsQuery += ` AND ${shiftRange.sqlBetween('rr.requested_at')}`;
      exemptionParams.push(shiftRange.startStr, shiftRange.endStr);
    }

    exemptionsQuery += `
      UNION ALL
      
      SELECT 'clinical' as type, cr.created_at as date, p.id as patient_id, p.id, p.full_name as patient_name, p.full_name,
             p.age, p.gender, p.phone,
             v.is_follow_up, v.is_exempt,
             (CASE WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v.id) OR v.status = 'transferred_to_center' THEN 1 ELSE 0 END) as is_surgery,
             cs.name as service_name, cr.price as original_price, NULL as with_film, v.visit_number, v.id as visit_id
      FROM visit_clinical_service_requests cr
      JOIN visits v ON cr.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      JOIN clinical_services cs ON cr.service_id = cs.id
      WHERE cr.is_free = 1 AND v.created_by = ?
        AND cr.status NOT IN ('cancelled', 'refunded')
        AND v.status NOT IN ('cancelled', 'refunded')
    `;
    exemptionParams.push(doctorId);
    if (shiftRange) {
      exemptionsQuery += ` AND ${shiftRange.sqlBetween('cr.created_at')}`;
      exemptionParams.push(shiftRange.startStr, shiftRange.endStr);
    }

    exemptionsQuery += ' ORDER BY date DESC';
    const [exemptions] = await db.execute(exemptionsQuery, exemptionParams);

    // 4. VIP Exemptions (Calculated at registration time, excluding cancelled visits)
    let vipQuery = `
      SELECT v.id as visitId, v.visit_number, v.created_at as closed_at, v.is_exempt, v.is_follow_up,
             (CASE WHEN EXISTS (SELECT 1 FROM surgeries s WHERE s.visit_id = v.id) OR v.status = 'transferred_to_center' THEN 1 ELSE 0 END) as is_surgery,
             p.id as patient_id, p.id, p.full_name, p.full_name as patient_name, p.age, p.gender, p.phone,
             IF(v.is_exempt = 1 AND v.entry_fee = 0, (SELECT CAST(setting_value AS UNSIGNED) FROM settings WHERE setting_key = 'entry_fee'), v.entry_fee) as consultation_fee
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      WHERE v.is_exempt = 1 AND v.created_by = ? AND v.status NOT IN ('cancelled', 'refunded')
    `;
    let vipParams = [doctorId];
    if (shiftRange) {
      vipQuery += ` AND ${shiftRange.sqlBetween('v.created_at')}`;
      vipParams.push(shiftRange.startStr, shiftRange.endStr);
    }
    vipQuery += ' ORDER BY v.created_at DESC';
    const [vipExemptions] = await db.execute(vipQuery, vipParams);

    res.json({
      completedCases,
      discounts,
      exemptions,
      vipExemptions
    });

  } catch (err) {
    console.error('getDoctorAnalyticalReports error:', err);
    res.status(500).json({ message: 'خطأ في جلب تقارير الطبيب التحليلية' });
  }
};


