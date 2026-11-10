/**
 * Yemen Operational Shift Helpers (Asia/Aden timezone, 03:00 AM day boundary)
 * 
 * Standardized across the entire ORTHOCARE ERP:
 * The medical operational day begins at 03:00 AM (Yemen Time) and ends at 02:59:59 AM the next day.
 */

/**
 * Converts any date or timestamp into a Date object representing the time in Yemen (Asia/Aden)
 * @param {Date|string|number} d 
 * @returns {Date}
 */
export const toYemenDate = (d = new Date()) => {
  return new Date(new Date(d).toLocaleString('en-US', { timeZone: 'Asia/Aden' }));
};

/**
 * Calculates the operational shift start (03:00:00.000 AM) for a given date.
 * If the current time is before 03:00 AM, the shift belongs to the previous calendar day.
 * @param {Date|string|number} d 
 * @returns {Date}
 */
export const getShiftStartOfDay = (d = new Date()) => {
  const dt = toYemenDate(d);
  if (dt.getHours() < 3) {
    dt.setDate(dt.getDate() - 1);
  }
  dt.setHours(3, 0, 0, 0);
  return dt;
};

/**
 * Calculates the operational shift end (02:59:59.999 AM next day) for a given date.
 * @param {Date|string|number} d 
 * @returns {Date}
 */
export const getShiftEndOfDay = (d = new Date()) => {
  const start = getShiftStartOfDay(d);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
};

/**
 * Formats a Date object to 'YYYY-MM-DD' string.
 * @param {Date|string|number} d 
 * @returns {string} e.g. "2026-10-19"
 */
export const formatShiftDate = (d = new Date()) => {
  const dt = d instanceof Date ? d : new Date(d);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

/**
 * Returns today's active operational shift date as a 'YYYY-MM-DD' string.
 * (e.g. at 02:00 AM on 2026-10-20, returns "2026-10-19")
 * @param {Date|string|number} d 
 * @returns {string}
 */
export const getCurrentShiftDate = (d = new Date()) => {
  return formatShiftDate(getShiftStartOfDay(d));
};

/**
 * Returns the start of a 7-day rolling window based on operational shift.
 * @param {Date|string|number} d 
 * @returns {Date}
 */
export const getShiftWeekStartDate = (d = new Date()) => {
  const start = getShiftStartOfDay(d);
  return new Date(start.getTime() - 6 * 24 * 60 * 60 * 1000);
};

/**
 * Returns the start of a 1-month rolling window based on operational shift.
 * @param {Date|string|number} d 
 * @returns {Date}
 */
export const getShiftMonthStartDate = (d = new Date()) => {
  const start = new Date(getShiftStartOfDay(d));
  start.setMonth(start.getMonth() - 1);
  return start;
};
