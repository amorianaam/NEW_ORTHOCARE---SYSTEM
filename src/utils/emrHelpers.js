/**
 * EMR Shared Helpers (Single Source of Truth for EMR Modals)
 * Shared between PatientEMRModal (Doctor) and HistoricEMRModal (Reception/Secretary)
 */
import { getServerBaseUrl } from './apiConfig';

/**
 * Converts Eastern Arabic numerals (٠-٩) to standard English ASCII digits (0-9).
 * @param {string|number} val
 * @returns {string}
 */
export const toEnglishDigits = (val) => {
  if (!val) return '';
  return String(val).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
};

/**
 * Safely resolves raw file metadata (HTTP URL, local uploads path, base64 data URI, JSON array/object, raw base64)
 * into a structured object containing { url, isPdf }, or null if invalid.
 * @param {any} raw
 * @returns {{ url: string, isPdf: boolean } | null}
 */
export function resolveFileUrl(raw) {
  if (!raw) return null;

  // 1. If raw is an array or object, unwrap it recursively
  if (typeof raw === 'object' && raw !== null) {
    if (Array.isArray(raw)) {
      if (raw.length === 0) return null;
      return resolveFileUrl(raw[0].data || raw[0].url || raw[0].base64 || raw[0].result_file || raw[0].previewUrl || raw[0]);
    }
    return resolveFileUrl(raw.data || raw.url || raw.base64 || raw.result_file || raw.previewUrl);
  }

  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 2. Direct HTTP/HTTPS URLs
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const isPdf = trimmed.toLowerCase().includes('.pdf');
    return { url: trimmed, isPdf };
  }

  // 3. Blob URLs
  if (trimmed.startsWith('blob:')) {
    return { url: trimmed, isPdf: false };
  }

  // 4. Server uploads relative path (e.g. /uploads/radiology/... or uploads/lab/...)
  const normalized = trimmed.replace(/\\/g, '/');
  if (normalized.startsWith('/uploads') || normalized.startsWith('uploads/') || normalized.includes('/uploads/')) {
    const uploadPath = normalized.startsWith('/') ? normalized : `/${normalized}`;
    const baseUrl = getServerBaseUrl();
    const fullUrl = `${baseUrl}${uploadPath}`;
    const isPdf = fullUrl.toLowerCase().includes('.pdf');
    return { url: fullUrl, isPdf };
  }

  // 5. Data URIs
  if (trimmed.startsWith('data:')) {
    const isPdf = trimmed.includes('application/pdf');
    const parts = trimmed.split(',');
    if (parts.length < 2) return null;
    const header = parts[0];
    const base64 = parts[1];
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : (isPdf ? 'application/pdf' : 'image/jpeg');
    try {
      const bytes = atob(base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: mime });
      return { url: URL.createObjectURL(blob), isPdf };
    } catch { return null; }
  }

  // 6. JSON encoded array or object string
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      return resolveFileUrl(parsed);
    } catch { /* fall through */ }
  }

  // 7. Raw Base64 string
  if (trimmed.length > 100) {
    try {
      const bytes = atob(trimmed);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const isPdf = bytes.startsWith('%PDF-');
      const mime = isPdf ? 'application/pdf' : 'image/jpeg';
      const blob = new Blob([arr], { type: mime });
      return { url: URL.createObjectURL(blob), isPdf };
    } catch { /* invalid base64 */ }
  }

  return null;
}

/**
 * Resolves radiology film type badge information: label and badge style class.
 * Standardizes between 'بدون فيلم', 'فيلم كبير', 'فيلم صغير', 'فيلم وسط'.
 * @param {object} item
 * @returns {{ label: string, badgeClass: string }}
 */
export const getFilmTypeBadgeInfo = (item) => {
  if (!item) {
    return {
      label: 'بدون فيلم',
      badgeClass: 'bg-violet-50 text-violet-700 border-violet-200/70',
      iconType: 'image',
      iconClass: 'text-violet-500'
    };
  }

  const isWithoutFilm = item.with_film === 0 || item.with_film === false || item.withFilm === false ||
    String(item.film_type || '').includes('بدون فيلم') ||
    String(item.film_type || '').includes('رقمي');

  if (isWithoutFilm) {
    return {
      label: 'بدون فيلم',
      badgeClass: 'bg-violet-50 text-violet-700 border-violet-200/70',
      iconType: 'image',
      iconClass: 'text-violet-500'
    };
  }

  const filmSize = String(
    item.film_size || 
    (item.items && item.items[0] && item.items[0].film_size) || 
    (item.requests && item.requests[0] && item.requests[0].film_size) || 
    ''
  ).toLowerCase();
  const filmTypeStr = String(item.film_type || '').toLowerCase();

  if (filmSize === 'large' || filmTypeStr.includes('كبير') || filmTypeStr.includes('large')) {
    return {
      label: 'كبير',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200/70',
      iconType: 'film',
      iconClass: 'text-indigo-500'
    };
  }

  if (filmSize === 'small' || filmTypeStr.includes('صغير') || filmTypeStr.includes('small')) {
    return {
      label: 'صغير',
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-200/70',
      iconType: 'film',
      iconClass: 'text-sky-500'
    };
  }

  if (filmSize === 'medium' || filmTypeStr.includes('وسط') || filmTypeStr.includes('medium')) {
    return {
      label: 'وسط',
      badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200/70',
      iconType: 'film',
      iconClass: 'text-cyan-500'
    };
  }

  if (item.film_type && item.film_type !== 'فيلم مجمّع') {
    return {
      label: item.film_type,
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-200/70',
      iconType: 'film',
      iconClass: 'text-sky-500'
    };
  }

  return {
    label: 'بدون فيلم',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200/70',
    iconType: 'image',
    iconClass: 'text-violet-500'
  };
};

/**
 * Groups laboratory tests that share the identical result file or notes within the same visit.
 * Returns an array of grouped test objects. If multiple tests share a result, `isShared: true`
 * and `items: [...]` are attached.
 * @param {Array} labs
 * @returns {Array}
 */
export const groupLabsBySharedResult = (labs) => {
  if (!Array.isArray(labs) || labs.length === 0) return [];

  const groups = {};
  labs.forEach((t, idx) => {
    // Normalise result_file representation for robust grouping key
    const normFile = typeof t.result_file === 'string' ? t.result_file.trim() : (t.result_file ? JSON.stringify(t.result_file) : '');
    const hasFile = Boolean(normFile && normFile !== '[]' && normFile !== 'null' && normFile !== '""');
    const normNotes = (t.result_notes || '').trim();
    const hasNotes = Boolean(normNotes);

    // Only group tests that actually share an existing non-empty file or notes
    let key = null;
    if (hasFile) {
      key = `file_${normFile}`;
    } else if (hasNotes) {
      key = `notes_${normNotes}`;
    } else {
      key = `standalone_${t.id || idx}`;
    }

    if (!groups[key]) {
      groups[key] = {
        items: [],
        result_notes: t.result_notes,
        result_file: t.result_file,
        performed_at: t.performed_at || t.completed_at || t.updated_at || t.created_at
      };
    }

    groups[key].items.push(t);
    if (t.result_notes && !groups[key].result_notes) groups[key].result_notes = t.result_notes;
    if (t.result_file && !groups[key].result_file) groups[key].result_file = t.result_file;
  });

  return Object.values(groups).map((g, grpIdx) => {
    const isShared = g.items.length > 1;
    const mainItem = g.items[0] || {};
    const names = g.items.map(i => i.name || i.test_name).filter(Boolean);

    return {
      ...mainItem,
      id: isShared ? `lab_shared_${grpIdx}_${mainItem.id || grpIdx}` : (mainItem.id || `lab_${grpIdx}`),
      name: isShared ? names.join(' + ') : (mainItem.name || mainItem.test_name || 'تحليل مخبري'),
      categoryKey: 'lab',
      typeLabel: 'مختبر',
      isShared,
      items: g.items,
      date: mainItem.performed_at || mainItem.completed_at || mainItem.updated_at || mainItem.created_at,
      result_notes: g.result_notes,
      result_file: g.result_file
    };
  });
};

/**
 * Splits an array of radiology items into visually balanced rows, preventing
 * unsightly orphan items (single item on the trailing row) and adapting to modal size.
 *
 * - Small window (!isFullscreen):
 *   - Up to 3 per row.
 *   - If count === 4: splits into 2 + 2 (two symmetrical rows of 2).
 *   - If count === 5: splits into 3 + 2.
 *   - If count === 6: splits into 3 + 3.
 *
 * - Large / Fullscreen window (isFullscreen):
 *   - Up to 4-5 per row.
 *   - If count === 5: splits into 3 + 2 (borrowing 1 from row 1 to prevent a lonely orphan).
 *   - If count === 6: splits into 3 + 3.
 *   - If count === 7: splits into 4 + 3.
 *   - If count === 8: splits into 4 + 4.
 *
 * @param {Array} items
 * @param {boolean} isFullscreen
 * @returns {Array<Array>} array of rows
 */
export const getBalancedRadiologyRows = (items, isFullscreen = false) => {
  if (!Array.isArray(items) || items.length === 0) return [];
  const count = items.length;

  if (!isFullscreen) {
    // ── Small / Default Window ──
    if (count <= 3) return [items];
    if (count === 4) return [items.slice(0, 2), items.slice(2, 4)];
    if (count === 5) return [items.slice(0, 3), items.slice(3, 5)];
    if (count === 6) return [items.slice(0, 3), items.slice(3, 6)];

    const rows = [];
    let i = 0;
    while (i < count) {
      const remaining = count - i;
      if (remaining === 4) {
        rows.push(items.slice(i, i + 2));
        rows.push(items.slice(i + 2, i + 4));
        break;
      }
      const take = Math.min(3, remaining);
      rows.push(items.slice(i, i + take));
      i += take;
    }
    return rows;
  } else {
    // ── Large / Fullscreen Window (Max 4-5) ──
    const maxPerRow = 4;
    if (count <= maxPerRow) return [items];
    if (count === 5) return [items.slice(0, 3), items.slice(3, 5)]; // 3 + 2
    if (count === 6) return [items.slice(0, 3), items.slice(3, 6)]; // 3 + 3
    if (count === 7) return [items.slice(0, 4), items.slice(4, 7)]; // 4 + 3
    if (count === 8) return [items.slice(0, 4), items.slice(4, 8)]; // 4 + 4

    const rows = [];
    let i = 0;
    while (i < count) {
      const remaining = count - i;
      if (remaining === 5) {
        rows.push(items.slice(i, i + 3));
        rows.push(items.slice(i + 3, i + 5));
        break;
      }
      const take = Math.min(maxPerRow, remaining);
      rows.push(items.slice(i, i + take));
      i += take;
    }
    return rows;
  }
};
