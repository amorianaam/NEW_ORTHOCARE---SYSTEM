/**
 * Backend Shift Time Helpers for Yemen Operational Day (03:00 AM Asia/Aden)
 * 
 * Standardized across the entire ORTHOCARE ERP:
 * Start of shift: ${startDate} 03:00:00
 * End of shift:   DATE_ADD('${endDate} 03:00:00', INTERVAL 1 DAY) - INTERVAL 1 SECOND
 */

/**
 * Converts any date or timestamp into a Date object representing the time in Yemen (Asia/Aden)
 * @param {Date|string|number} d 
 * @returns {Date}
 */
const toYemenDate = (d = new Date()) => {
  return new Date(new Date(d).toLocaleString('en-US', { timeZone: 'Asia/Aden' }));
};

/**
 * Calculates the operational shift start (03:00:00.000 AM) for a given date.
 * If the current time is before 03:00 AM, the shift belongs to the previous calendar day.
 * @param {Date|string|number} d 
 * @returns {Date}
 */
const getShiftStartOfDay = (d = new Date()) => {
  const dt = toYemenDate(d);
  if (dt.getHours() < 3) {
    dt.setDate(dt.getDate() - 1);
  }
  dt.setHours(3, 0, 0, 0);
  return dt;
};

/**
 * Formats a Date object to 'YYYY-MM-DD' string.
 * @param {Date|string|number} d 
 * @returns {string} e.g. "2026-10-19"
 */
const formatShiftDate = (d = new Date()) => {
  const dt = d instanceof Date ? d : new Date(d);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

/**
 * Returns today's active operational shift date as a 'YYYY-MM-DD' string.
 * @param {Date|string|number} d 
 * @returns {string}
 */
const getCurrentShiftDate = (d = new Date()) => {
  return formatShiftDate(getShiftStartOfDay(d));
};

/**
 * Returns the start of a 7-day rolling window based on operational shift.
 * @param {Date|string|number} d 
 * @returns {Date}
 */
const getShiftWeekStartDate = (d = new Date()) => {
  const start = getShiftStartOfDay(d);
  return new Date(start.getTime() - 6 * 24 * 60 * 60 * 1000);
};

/**
 * Returns the start of a 1-month rolling window based on operational shift.
 * @param {Date|string|number} d 
 * @returns {Date}
 */
const getShiftMonthStartDate = (d = new Date()) => {
  const start = new Date(getShiftStartOfDay(d));
  start.setMonth(start.getMonth() - 1);
  return start;
};

/**
 * Returns standardized shift start and end parameters for SQL queries
 * @param {string} startDate 'YYYY-MM-DD'
 * @param {string} endDate 'YYYY-MM-DD'
 */
const getShiftRange = (startDate, endDate = startDate) => {
  return {
    startStr: `${startDate} 03:00:00`,
    endStr: `${endDate} 03:00:00`,
    sqlBetween: (column) => `${column} BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) - INTERVAL 1 SECOND`
  };
};

const SHIFT_START_SQL = 'DATE_ADD(DATE(NOW() - INTERVAL 3 HOUR), INTERVAL 3 HOUR)';
const SHIFT_GROUP_BY_SQL = 'DATE(created_at - INTERVAL 3 HOUR)';
const SHIFT_IS_TODAY_SQL = (column = 'created_at') => `DATE(${column} - INTERVAL 3 HOUR) = DATE(NOW() - INTERVAL 3 HOUR)`;

module.exports = {
  toYemenDate,
  getShiftStartOfDay,
  formatShiftDate,
  getCurrentShiftDate,
  getShiftWeekStartDate,
  getShiftMonthStartDate,
  getShiftRange,
  SHIFT_START_SQL,
  SHIFT_GROUP_BY_SQL,
  SHIFT_IS_TODAY_SQL
};

