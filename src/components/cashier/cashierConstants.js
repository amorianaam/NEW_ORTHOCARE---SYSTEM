import taffyot from '../../utils/taffyot';

export const INCOME_TYPES = [
  { value: 'external_lab',       label: 'تحاليل خارجية' },
  { value: 'external_radiology', label: 'أشعة خارجية' },
  { value: 'treasury_deposit',   label: 'إيداع خزينة' },
  { value: 'general_income',     label: 'إيراد متنوع' },
];

export const EXPENSE_TYPES = [
  { value: 'general_expense',    label: 'مصروف عام' },
  { value: 'emergency_expense',  label: 'صرف طارئ' },
  { value: 'emergency_purchase', label: 'مشتريات طارئة' },
  { value: 'refund',             label: 'استرداد نقدي' },
];

export const SERVICE_REFUND_CATS = {
  lab:             'استرداد تحليل مخبري',
  radiology:       'استرداد فحص أشعة',
  clinical:        'استرداد خدمة سريرية',
  entry_fee:       'استرداد رسوم معاينة',
  services:        'استرداد خدمات طبية',
  surgery_payment: 'استرداد دفعة عملية',
};

export const CAT_LABEL = {
  entry_fee:          'رسوم المعاينة',
  lab:                'تحاليل مخبرية',
  radiology:          'فحوصات أشعة',
  clinical:           'خدمات سريرية',
  services:           'خدمات طبية',
  surgery_payment:    'دفعات العمليات',
  external_service:   'خدمات خارجية',
  external_lab:       'تحاليل خارجية',
  external_radiology: 'أشعة خارجية',
  treasury_deposit:   'إيداع خزينة',
  external_surgery:   'عمليات خارجية',
  general_income:     'إيراد متنوع',
  general_expense:    'مصروف عام',
  emergency_expense:  'صرف طارئ',
  emergency_purchase: 'مشتريات طارئة',
  refund:             'استرداد نقدي',
  income:             'إيرادات عامة',
  expense:            'مصروفات عامة',
};

[...INCOME_TYPES, ...EXPENSE_TYPES].forEach((t) => {
  CAT_LABEL[t.value] = t.label;
});

export const isServiceIncome = (tx) => {
  if (!tx) return false;
  const isRefund = Number(tx.is_refund) === 1 || tx.is_refund === true || tx.category === 'refund';
  if (isRefund || tx.type !== 'income') return false;
  if (['external_service', 'external_lab', 'external_radiology', 'treasury_deposit', 'general_income'].includes(tx.category)) {
    return false;
  }
  return (
    ['entry_fee', 'lab', 'radiology', 'clinical', 'services', 'surgery_payment'].includes(tx.category) ||
    Boolean(tx.visit_id) ||
    Boolean(tx.surgery_id)
  );
};

export const ROLE_LABEL = {
  cashier: 'المحاسب',
  auditor: 'مدير النظام',
  doctor:  'مدير النظام',
  admin:   'مدير النظام',
};

export const cleanDescription = (desc) => {
  if (!desc) return '';
  return desc
    .replace(/-\s*خصم\s*0\s*0/g, '')
    .replace(/-\s*خصم\s*0/g, '')
    .replace(/\s+0\b/g, '')
    .replace(/\s*-\s*$/, '')
    .trim();
};

export const getServiceTypeBadge = (itemType) => {
  switch (itemType) {
    case 'lab':
      return 'bg-purple-50 text-purple-700 border-purple-200/80';
    case 'radiology':
      return 'bg-blue-50 text-blue-700 border-blue-200/80';
    case 'clinical':
      return 'bg-teal-50 text-teal-700 border-teal-200/80';
    case 'entry_fee':
      return 'bg-amber-50 text-amber-700 border-amber-200/80';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

export const toEnglishDigits = (val) =>
  String(val ?? '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٫،]/g, '.');

export const sanitizeDecimalInput = (val) => {
  const normalized = toEnglishDigits(String(val ?? '').replace(/,/g, '')).replace(/[^0-9.]/g, '');
  const parts = normalized.split('.');
  if (parts.length <= 2) return normalized;
  return `${parts[0]}.${parts.slice(1).join('')}`;
};

export const formatCurrency = (val) => {
  const num = parseFloat(val);
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

export const formatCurrencyInteger = (val) => {
  const num = parseFloat(val);
  if (isNaN(num)) return '0';
  return Math.round(num).toLocaleString('en-US');
};

export const formatDateEn = (isoStr) => {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return String(isoStr);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export const formatTimeEn = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => n.toString().padStart(2, '0');
  let hours = d.getHours();
  const minutes = pad(d.getMinutes());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${pad(hours)}:${minutes} ${ampm}`;
};

export const formatAmountInput = (val) => {
  if (val === '' || val === null || val === undefined) return '';
  const clean = sanitizeDecimalInput(val);
  if (!clean) return '';
  const parts = clean.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
};

export const formatTafqeet = (val) => {
  const num = parseFloat(val);
  if (!num || num <= 0) return '';
  const text = taffyot(num);
  if (!text || text === 'صفر ريال يمني') return '';
  return text.endsWith('.') ? text : `${text}.`;
};

// ── Smart Refund Description Parser ─────────────────────────────────────────
export const parseRefundDetails = (r) => {
  const rawDesc = String(r?.description || '').trim();
  const rawReason = String(r?.refund_reason || '').trim();
  let patientName = r?.patient_name ? String(r.patient_name).trim() : '';
  let service = '';
  let reason = '';

  const isServiceCategory = Boolean(r?.category && SERVICE_REFUND_CATS[r.category]);
  const isCompositeDesc = rawDesc.includes('استرداد للمريض:') || rawDesc.includes('الخدمة:') || /^استرداد\s*(?:كامل)?\s*:/.test(rawDesc);

  if (isServiceCategory && !isCompositeDesc) {
    service = rawDesc;
    reason = rawReason;
    return { patientName, service, reason };
  }

  if (rawDesc) {
    // Check for visit full refund or cancel visit
    const fullRefundMatch = rawDesc.match(/^استرداد كامل\s*:\s*(.+)$/);
    if (fullRefundMatch) {
      service = 'كامل خدمات الزيارة';
      reason = rawReason || fullRefundMatch[1].trim();
      return { patientName, service, reason };
    }

    const cancelRefundMatch = rawDesc.match(/^استرداد\s*:\s*(.+)$/);
    if (cancelRefundMatch && !rawDesc.includes('الخدمة:')) {
      service = 'إلغاء زيارة';
      reason = rawReason || cancelRefundMatch[1].trim();
      return { patientName, service, reason };
    }

    // Split by " - " or " — " segments
    const segments = rawDesc.split(/\s+(?:-|—)\s+/);
    const leftover = [];

    segments.forEach((seg) => {
      const s = seg.trim();
      if (!s) return;

      const patientMatch = s.match(/^استرداد للمريض\s*:\s*(.+)$/);
      if (patientMatch) {
        if (!patientName) patientName = patientMatch[1].trim();
        return;
      }

      const serviceMatch = s.match(/^الخدمة\s*:\s*(.+)$/);
      if (serviceMatch) {
        service = serviceMatch[1].trim();
        return;
      }

      const reasonMatch = s.match(/^(?:الملاحظات|ملاحظات|السبب|سبب الاسترداد)\s*:\s*(.+)$/);
      if (reasonMatch) {
        reason = reasonMatch[1].trim();
        return;
      }

      const genRefundMatch = s.match(/^استرداد مالي عام\s*:\s*(.+)$/);
      if (genRefundMatch) {
        reason = genRefundMatch[1].trim();
        return;
      }

      leftover.push(s);
    });

    if (!reason && leftover.length > 0) {
      reason = leftover.join(' — ').replace(/^استرداد للمريض\s*:\s*[^-—]+/, '').trim();
    }
  }

  if (!reason && rawReason) {
    const cleanRef = rawReason
      .replace(/^استرداد للمريض\s*:\s*[^-—]+(?:\s*[-—]\s*)?/, '')
      .replace(/^استرداد مالي عام\s*:\s*/, '')
      .trim();
    if (cleanRef && !cleanRef.startsWith('الخدمة:')) {
      reason = cleanRef;
    }
  }

  if (!service && isServiceCategory) {
    service = r?.service_name || (r?.category === 'entry_fee' ? 'رسوم معاينة' : CAT_LABEL[r?.category] || 'خدمة طبية');
  }

  if (service === 'رسوم معاينة (كشف طبي)') {
    service = 'رسوم معاينة';
  }

  if (service) {
    service = service
      .replace(/\s*\(?\s*مع\s*(?:طباعة\s*)?ف[يـ]?لم\s*\)?/g, '')
      .replace(/\s*\(?\s*مع\s*طباعة\s*\)?/g, '')
      .trim();
  }

  return {
    patientName,
    service,
    reason,
  };
};

// ── Smart Category Resolver for Refunds & Transactions ──────────────────────
export const getTransactionCategoryLabel = (tx) => {
  if (!tx) return '—';

  const isRefund = Number(tx.is_refund) === 1 || tx.is_refund === true || tx.category === 'refund';

  if (!isRefund) {
    return CAT_LABEL[tx.category] || tx.category || '—';
  }

  if (tx.category && SERVICE_REFUND_CATS[tx.category]) {
    return SERVICE_REFUND_CATS[tx.category];
  }

  if (tx.service_type && SERVICE_REFUND_CATS[tx.service_type]) {
    return SERVICE_REFUND_CATS[tx.service_type];
  }

  const refundInfo = parseRefundDetails(tx);
  const s = String(refundInfo?.service || tx.service_name || tx.description || '').toLowerCase();

  if (
    s.includes('أشعة') || s.includes('اشعة') || s.includes('رنين') ||
    s.includes('مقطعية') || s.includes('تلفزيونية') || s.includes('سونار') ||
    s.includes('x-ray') || s.includes('xray') || s.includes('radiology') ||
    s.includes('mri') || s.includes('ct') || s.includes('ultrasound')
  ) {
    return 'استرداد فحص أشعة';
  }

  if (
    s.includes('تحليل') || s.includes('فحص مخبري') || s.includes('مختبر') ||
    s.includes('دم') || s.includes('lab') || s.includes('cbc') ||
    s.includes('بول') || s.includes('براز') || s.includes('مزرعة')
  ) {
    return 'استرداد تحليل مخبري';
  }

  if (
    s.includes('سريري') || s.includes('ضماد') || s.includes('حقن') ||
    s.includes('جبس') || s.includes('غرز') || s.includes('خياطة') ||
    s.includes('clinical') || s.includes('تضميد') || s.includes('تجبير')
  ) {
    return 'استرداد خدمة سريرية';
  }

  if (
    s.includes('معاينة') || s.includes('كشف') || s.includes('رسوم كشف') ||
    s.includes('رسوم معاينة') || s.includes('entry') || s.includes('استشارة')
  ) {
    return 'استرداد رسوم معاينة';
  }

  if (
    s.includes('عملية') || s.includes('جراح') || s.includes('surgery')
  ) {
    return 'استرداد دفعة عملية';
  }

  return 'استرداد نقدي';
};

// ── Smart Service & Surgery Details Parser ──────────────────────────────────
export const parseServiceOrSurgery = (r) => {
  if (!r) return { isSurgery: false, isService: false, name: '', notes: '' };

  const isRefund = Number(r.is_refund) === 1 || r.is_refund === true || r.category === 'refund';
  if (isRefund) {
    return { isSurgery: false, isService: false, name: '', notes: '' };
  }

  const isSurgery = r.category === 'surgery_payment' || Boolean(r.surgery_id) || r.category === 'external_surgery';
  const isService = isSurgery || [
    'entry_fee', 'lab', 'radiology', 'clinical', 'services', 
    'external_service', 'external_lab', 'external_radiology'
  ].includes(r.category) || Boolean(r.visit_id);

  if (!isService && !isSurgery) {
    return { isSurgery: false, isService: false, name: '', notes: cleanDescription(r.description) };
  }

  if (isSurgery) {
    let surgName = r.surgery_name || r.surgery_type || '';
    const rawDesc = cleanDescription(r.description || '');

    if (!surgName && rawDesc) {
      const match = rawDesc.match(/(?:دفعة عملية جراحية|دفعة عملية|عملية جراحية|عملية)\s*:\s*([^()—-]+)/);
      if (match && match[1]?.trim()) {
        surgName = match[1].trim();
      } else {
        const stripped = rawDesc.replace(/\s*\(\s*\d+.*?\)/g, '').replace(/^(?:دفعة عملية جراحية|دفعة عملية|عملية)\s*/, '').trim();
        if (stripped && stripped !== 'جراحية' && stripped !== 'جراحة') {
          surgName = stripped;
        }
      }
    }

    if (!surgName) {
      surgName = 'عملية جراحية';
    }

    let notes = rawDesc;
    if (surgName && notes.includes(surgName)) {
      notes = notes.replace(surgName, '').replace(/(?:دفعة عملية جراحية|دفعة عملية|عملية)\s*:?/g, '').trim();
      notes = notes.replace(/^[—\-:\s]+|[—\-:\s]+$/g, '').trim();
    } else if (notes.startsWith('دفعة عملية جراحية') || notes.startsWith('دفعة عملية')) {
      notes = '';
    }

    return {
      isSurgery: true,
      isService: true,
      name: surgName,
      notes: notes,
    };
  }

  // Other services (entry_fee, lab, radiology, clinical, services, etc.)
  const rawDesc = cleanDescription(r.description || '');
  let serviceName = '';
  let notes = '';

  if (r.category === 'entry_fee') {
    serviceName = 'رسوم معاينة واستشارة طبية';
    if (rawDesc && rawDesc !== 'رسوم معاينة' && rawDesc !== 'معاينة' && rawDesc !== 'رسوم معاينة واستشارة طبية') {
      notes = rawDesc;
    }
  } else if (r.service_name || ['external_service', 'external_lab', 'external_radiology'].includes(r.category)) {
    serviceName = r.service_name || '';
    if (!serviceName && rawDesc) {
      const extMatch = rawDesc.match(/^(?:خدمة خارجية\s*(?:\([^)]*\))?\s*:\s*)([^\u2014\-]+)(?:\s*[\u2014\-]\s*المريض\s*:\s*.+)?$/);
      if (extMatch && extMatch[1]?.trim()) {
        serviceName = extMatch[1].trim();
      } else {
        serviceName = rawDesc;
      }
    }
    if (rawDesc && !rawDesc.startsWith('خدمة خارجية') && rawDesc !== serviceName) {
      notes = rawDesc;
    }
  } else {
    const svcMatch = rawDesc.match(/^(?:خدمة سريرية|خدمة طبية|خدمة|فحص|تحليل)\s*:\s*(.+)$/);
    if (svcMatch) {
      serviceName = svcMatch[1].trim();
    } else if (rawDesc) {
      serviceName = rawDesc;
    } else {
      serviceName = CAT_LABEL[r.category] || r.category || 'خدمة طبية';
    }
  }

  // Strip "مع فيلم" completely from serviceName and notes (leaving "بدون فيلم" intact)
  if (serviceName) {
    serviceName = serviceName
      .replace(/\s*\(?\s*مع\s*(?:طباعة\s*)?ف[يـ]?لم\s*\)?/g, '')
      .replace(/\s*\(?\s*مع\s*طباعة\s*\)?/g, '')
      .trim();
  }
  if (notes) {
    notes = notes
      .replace(/\s*\(?\s*مع\s*(?:طباعة\s*)?ف[يـ]?لم\s*\)?/g, '')
      .replace(/\s*\(?\s*مع\s*طباعة\s*\)?/g, '')
      .trim();
  }

  return {
    isSurgery: false,
    isService: true,
    name: serviceName,
    notes: notes,
  };
};
