const db = require('../database/db');

// Helper to fetch alerts for a given inventory table
const getAlertsForTable = async (tableName) => {
  // Get items near expiry (less than 90 days) or expired
  const [expiryItems] = await db.query(`
    SELECT 
      id, name, unit as type, expiry_date, quantity,
      DATEDIFF(expiry_date, CURDATE()) as days_left
    FROM ${tableName}
    WHERE expiry_date IS NOT NULL 
      AND is_active = 1 
      AND quantity > 0
      AND DATEDIFF(expiry_date, CURDATE()) <= 90
    ORDER BY days_left ASC
  `);

  // Get items out of stock or below min_quantity
  const [stockItems] = await db.query(`
    SELECT 
      id, name, unit as type, quantity, min_quantity
    FROM ${tableName}
    WHERE is_active = 1
      AND min_quantity IS NOT NULL
      AND quantity <= min_quantity
    ORDER BY quantity ASC
  `);

  return { expiry: expiryItems, stock: stockItems };
};

exports.getGeneralAlerts = async (req, res) => {
  try {
    const data = await getAlertsForTable('general_inventory_items');
    res.json(data);
  } catch (err) {
    console.error('[Inventory Alerts Error - General]', err);
    res.status(500).json({ message: 'خطأ في جلب التنبيهات' });
  }
};

exports.getOrAlerts = async (req, res) => {
  try {
    const data = await getAlertsForTable('or_inventory_items');
    res.json(data);
  } catch (err) {
    console.error('[Inventory Alerts Error - OR]', err);
    res.status(500).json({ message: 'خطأ في جلب التنبيهات' });
  }
};

exports.getLabAlerts = async (req, res) => {
  try {
    const data = await getAlertsForTable('lab_inventory_items');
    res.json(data);
  } catch (err) {
    console.error('[Inventory Alerts Error - Lab]', err);
    res.status(500).json({ message: 'خطأ في جلب التنبيهات' });
  }
};

exports.getRadiologyAlerts = async (req, res) => {
  try {
    const data = await getAlertsForTable('rad_inventory_items');
    res.json(data);
  } catch (err) {
    console.error('[Inventory Alerts Error - Radiology]', err);
    res.status(500).json({ message: 'خطأ في جلب التنبيهات' });
  }
};

