export const formatArabicQuantity = (qty, unit) => {
  if (!unit) return `${qty}`;
  const unitStr = unit.trim();
  const numQty = parseFloat(qty) || 0;
  
  if (numQty <= 0) return `0 ${unitStr}`;

  if (numQty === 1) {
    if (unitStr === 'قطعة') return 'قطعة واحدة';
    if (unitStr === 'علبة') return 'علبة واحدة';
    if (unitStr === 'شريط') return 'شريط واحد';
    if (unitStr === 'حبة') return 'حبة واحدة';
    if (unitStr === 'قرص') return 'قرص واحد';
    if (unitStr === 'كيس') return 'كيس واحد';
    if (unitStr === 'امبولة' || unitStr === 'أمبولة') return 'أمبولة واحدة';
    if (unitStr === 'أنبوبة' || unitStr === 'انبوبة') return 'أنبوبة واحدة';
    if (unitStr === 'عبوة') return 'عبوة واحدة';
    if (unitStr === 'مغذية') return 'مغذية واحدة';
    if (unitStr === 'فيلم') return 'فيلم واحد';
    if (unitStr === 'فيلم صغير') return 'فيلم صغير واحد';
    if (unitStr === 'فيلم كبير') return 'فيلم كبير واحد';
    if (unitStr === 'فيال' || unitStr === 'فيالة') return 'فيال واحد';
    if (unitStr === 'مسمار') return 'مسمار واحد';
    if (unitStr === 'شريحة') return 'شريحة واحدة';
    if (unitStr === 'خيط') return 'خيط واحد';
    if (unitStr === 'ابرة' || unitStr === 'إبرة') return 'إبرة واحدة';
    if (unitStr === 'حقنة' || unitStr === 'سرنجة') return 'حقنة واحدة';
    if (unitStr === 'باكت') return 'باكت واحد';
    if (unitStr === 'درزن') return 'درزن واحد';
    if (unitStr === 'كرتون') return 'كرتون واحد';
    return `${unitStr} واحد`;
  }

  if (numQty === 2) {
    if (unitStr === 'قطعة') return 'قطعتان';
    if (unitStr === 'علبة') return 'علبتان';
    if (unitStr === 'شريط') return 'شريطان';
    if (unitStr === 'حبة') return 'حبتان';
    if (unitStr === 'قرص') return 'قرصان';
    if (unitStr === 'كيس') return 'كيسان';
    if (unitStr === 'امبولة' || unitStr === 'أمبولة') return 'أمبولتان';
    if (unitStr === 'أنبوبة' || unitStr === 'انبوبة') return 'أنبوبتان';
    if (unitStr === 'عبوة') return 'عبوتان';
    if (unitStr === 'مغذية') return 'مغذيتان';
    if (unitStr === 'فيلم') return 'فيلمان';
    if (unitStr === 'فيلم صغير') return 'فيلمان صغيران';
    if (unitStr === 'فيلم كبير') return 'فيلمان كبيران';
    if (unitStr === 'فيال' || unitStr === 'فيالة') return 'فيالان';
    if (unitStr === 'مسمار') return 'مسماران';
    if (unitStr === 'شريحة') return 'شريحتان';
    if (unitStr === 'خيط') return 'خيطان';
    if (unitStr === 'ابرة' || unitStr === 'إبرة') return 'إبرتان';
    if (unitStr === 'حقنة' || unitStr === 'سرنجة') return 'حقنتان';
    if (unitStr === 'باكت') return 'باكتان';
    if (unitStr === 'درزن') return 'درزنان';
    if (unitStr === 'كرتون') return 'كرتونان';
    return `2 ${unitStr}`;
  }
  
  if (numQty >= 3 && numQty <= 10) {
    if (unitStr === 'قطعة') return `${numQty} قطع`;
    if (unitStr === 'علبة') return `${numQty} علب`;
    if (unitStr === 'شريط') return `${numQty} أشرطة`;
    if (unitStr === 'حبة') return `${numQty} حبات`;
    if (unitStr === 'قرص') return `${numQty} أقراص`;
    if (unitStr === 'كيس') return `${numQty} أكياس`;
    if (unitStr === 'امبولة' || unitStr === 'أمبولة') return `${numQty} أمبولات`;
    if (unitStr === 'أنبوبة' || unitStr === 'انبوبة') return `${numQty} أنابيب`;
    if (unitStr === 'عبوة') return `${numQty} عبوات`;
    if (unitStr === 'مغذية') return `${numQty} مغذيات`;
    if (unitStr === 'فيلم') return `${numQty} أفلام`;
    if (unitStr === 'فيلم صغير') return `${numQty} أفلام صغيرة`;
    if (unitStr === 'فيلم كبير') return `${numQty} أفلام كبيرة`;
    if (unitStr === 'فيال' || unitStr === 'فيالة') return `${numQty} فيالات`;
    if (unitStr === 'مسمار') return `${numQty} مسامير`;
    if (unitStr === 'شريحة') return `${numQty} شرائح`;
    if (unitStr === 'خيط') return `${numQty} خيوط`;
    if (unitStr === 'ابرة' || unitStr === 'إبرة') return `${numQty} إبر`;
    if (unitStr === 'حقنة' || unitStr === 'سرنجة') return `${numQty} حقن`;
    if (unitStr === 'باكت') return `${numQty} باكتات`;
    if (unitStr === 'درزن') return `${numQty} درازن`;
    if (unitStr === 'كرتون') return `${numQty} كراتين`;
    return `${numQty} ${unitStr}`;
  }
  
  if (numQty >= 11) {
    if (unitStr === 'قطعة') return `${numQty} قطعة`;
    if (unitStr === 'علبة') return `${numQty} علبة`;
    if (unitStr === 'شريط') return `${numQty} شريطاً`;
    if (unitStr === 'حبة') return `${numQty} حبة`;
    if (unitStr === 'قرص') return `${numQty} قرصاً`;
    if (unitStr === 'كيس') return `${numQty} كيساً`;
    if (unitStr === 'امبولة' || unitStr === 'أمبولة') return `${numQty} أمبولة`;
    if (unitStr === 'أنبوبة' || unitStr === 'انبوبة') return `${numQty} أنبوبة`;
    if (unitStr === 'عبوة') return `${numQty} عبوة`;
    if (unitStr === 'مغذية') return `${numQty} مغذية`;
    if (unitStr === 'فيلم') return `${numQty} فيلماً`;
    if (unitStr === 'فيلم صغير') return `${numQty} فيلماً صغيراً`;
    if (unitStr === 'فيلم كبير') return `${numQty} فيلماً كبيراً`;
    if (unitStr === 'فيال' || unitStr === 'فيالة') return `${numQty} فيالاً`;
    if (unitStr === 'مسمار') return `${numQty} مسماراً`;
    if (unitStr === 'شريحة') return `${numQty} شريحة`;
    if (unitStr === 'خيط') return `${numQty} خيطاً`;
    if (unitStr === 'ابرة' || unitStr === 'إبرة') return `${numQty} إبرة`;
    if (unitStr === 'حقنة' || unitStr === 'سرنجة') return `${numQty} حقنة`;
    if (unitStr === 'باكت') return `${numQty} باكت`;
    if (unitStr === 'درزن') return `${numQty} درزن`;
    if (unitStr === 'كرتون') return `${numQty} كرتوناً`;
    return `${numQty} ${unitStr}`;
  }
  
  return `${numQty} ${unitStr}`;
};

export const formatArabicItemsCount = (count) => {
  if (count === 1) return "صنف واحد";
  if (count === 2) return "صنفان";
  if (count >= 3 && count <= 10) return `${count} أصناف`;
  if (count >= 11 && count <= 99) return `${count} صنفاً`;
  return `${count} صنف`;
};

export const getSmartItemText = (count, itemName) => {
  const numCount = parseInt(count, 10) || 0;
  if (numCount === 1 && itemName) return itemName;
  return formatArabicItemsCount(numCount);
};

export const formatArabicTestsCount = (count) => {
  const n = parseInt(count, 10) || 0;
  if (n <= 0) return 'لا توجد تحاليل';
  if (n === 1) return 'تحليل واحد';
  if (n === 2) return 'تحليلان';
  const mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return `${n} تحاليل`;
  return `${n} تحليلاً`;
};

export const formatArabicTestsStatus = (count, status) => {
  const n = parseInt(count, 10) || 0;
  if (n <= 0) return 'لا توجد تحاليل';

  if (status === 'pending') {
    if (n === 1) return 'تحليل واحد مطلوب';
    if (n === 2) return 'تحليلان مطلوبان';
    const mod100 = n % 100;
    if (mod100 >= 3 && mod100 <= 10) return `${n} تحاليل مطلوبة`;
    return `${n} تحليلاً مطلوباً`;
  }

  if (status === 'in_progress') {
    if (n === 1) return 'تحليل واحد قيد الإجراء';
    if (n === 2) return 'تحليلان قيد الإجراء';
    const mod100 = n % 100;
    if (mod100 >= 3 && mod100 <= 10) return `${n} تحاليل قيد الإجراء`;
    return `${n} تحليلاً قيد الإجراء`;
  }

  if (status === 'completed') {
    if (n === 1) return 'تحليل واحد منجز';
    if (n === 2) return 'تحليلان منجزان';
    const mod100 = n % 100;
    if (mod100 >= 3 && mod100 <= 10) return `${n} تحاليل منجزة`;
    return `${n} تحليلاً منجزاً`;
  }

  return formatArabicTestsCount(n);
};

export const formatArabicPendingLabBadge = (count) => {
  const n = parseInt(count, 10) || 0;
  if (n <= 0) return '';
  if (n === 1) return 'بانتظار تحليل واحد';
  if (n === 2) return 'بانتظار تحليلين';
  const mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return `بانتظار ${n} تحاليل`;
  return `بانتظار ${n} تحليلاً`;
};

export const formatArabicPendingLabTitle = (count) => {
  const n = parseInt(count, 10) || 0;
  if (n <= 0) return '';
  if (n === 1) return 'يوجد تحليل واحد بانتظار وقيد التنفيذ';
  if (n === 2) return 'يوجد تحليلان بانتظار وقيد التنفيذ';
  const mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return `توجد ${n} تحاليل بانتظار وقيد التنفيذ`;
  return `يوجد ${n} تحليلاً بانتظار وقيد التنفيذ`;
};

export const formatArabicServicesCount = (count) => {
  const n = Math.max(1, parseInt(count, 10) || 1);
  if (n === 1) return 'خدمة واحدة';
  if (n === 2) return 'خدمتان';
  const mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return `${n} خدمات`;
  return `${n} خدمة`;
};

export const formatArabicLabUnitQty = (qty, unit) => {
  const unitStr = (unit || 'وحدة').trim();
  const rawNum = parseFloat(qty);
  const numQty = isNaN(rawNum) || rawNum <= 0 ? 1 : Number(rawNum.toFixed(4));

  if (numQty === 0.25) return `ربع ${unitStr}`;
  if (numQty === 0.5) return `نصف ${unitStr}`;

  if (numQty === 1) {
    if (unitStr === 'عبوة') return 'عبوة واحدة';
    if (unitStr === 'أنبوبة' || unitStr === 'انبوبة') return 'أنبوبة واحدة';
    if (unitStr === 'أنبوب' || unitStr === 'انبوب') return 'أنبوب واحد';
    if (unitStr === 'قطعة') return 'قطعة واحدة';
    if (unitStr === 'علبة') return 'علبة واحدة';
    if (unitStr === 'شريط') return 'شريط واحد';
    if (unitStr === 'وحدة') return 'وحدة واحدة';
    if (unitStr === 'حبة') return 'حبة واحدة';
    if (unitStr === 'كيس') return 'كيس واحد';
    if (unitStr === 'امبولة' || unitStr === 'أمبولة') return 'أمبولة واحدة';
    if (unitStr === 'كرتون') return 'كرتون واحد';
    if (unitStr === 'كيت (Kit)') return 'كيت واحد (Kit)';
    if (unitStr === 'كيت') return 'كيت واحد';
    if (unitStr === 'لتر') return 'لتر واحد';
    if (unitStr === 'مل (mL)' || unitStr === 'مل') return `1 ${unitStr}`;
    if (unitStr === 'شريحة') return 'شريحة واحدة';
    if (unitStr === 'مسحة') return 'مسحة واحدة';
    if (unitStr === 'زجاجة') return 'زجاجة واحدة';
    if (unitStr === 'قنينة') return 'قنينة واحدة';
    if (unitStr === 'إبرة' || unitStr === 'ابرة') return 'إبرة واحدة';
    if (unitStr === 'سرنجة') return 'سرنجة واحدة';
    if (unitStr === 'كبسولة') return 'كبسولة واحدة';
    if (unitStr === 'قطرة') return 'قطرة واحدة';
    if (unitStr.endsWith('ة') || unitStr.endsWith('ه')) return `${unitStr} واحدة`;
    return `${unitStr} واحد`;
  }

  if (numQty === 2) {
    if (unitStr === 'عبوة') return 'عبوتان';
    if (unitStr === 'أنبوبة' || unitStr === 'انبوبة') return 'أنبوبتان';
    if (unitStr === 'أنبوب' || unitStr === 'انبوب') return 'أنبوبان';
    if (unitStr === 'قطعة') return 'قطعتان';
    if (unitStr === 'علبة') return 'علبتان';
    if (unitStr === 'شريط') return 'شريطان';
    if (unitStr === 'وحدة') return 'وحدتان';
    if (unitStr === 'حبة') return 'حبتان';
    if (unitStr === 'كيس') return 'كيسان';
    if (unitStr === 'امبولة' || unitStr === 'أمبولة') return 'أمبولتان';
    if (unitStr === 'كرتون') return 'كرتونان';
    if (unitStr === 'كيت (Kit)') return 'كيتان (Kit)';
    if (unitStr === 'كيت') return 'كيتان';
    if (unitStr === 'لتر') return 'لتران';
    if (unitStr === 'مل (mL)' || unitStr === 'مل') return `2 ${unitStr}`;
    if (unitStr === 'شريحة') return 'شريحتان';
    if (unitStr === 'مسحة') return 'مسحتان';
    if (unitStr === 'زجاجة') return 'زجاجتان';
    if (unitStr === 'قنينة') return 'قنينتان';
    if (unitStr === 'إبرة' || unitStr === 'ابرة') return 'إبرتان';
    if (unitStr === 'سرنجة') return 'سرنجتان';
    if (unitStr === 'كبسولة') return 'كبسولتان';
    if (unitStr === 'قطرة') return 'قطرتان';
    if (unitStr.endsWith('ة')) return `${unitStr.slice(0, -1)}تان`;
    return `2 ${unitStr}`;
  }

  const mod100 = Number.isInteger(numQty) ? numQty % 100 : -1;
  if (Number.isInteger(numQty) && mod100 >= 3 && mod100 <= 10) {
    if (unitStr === 'عبوة') return `${numQty} عبوات`;
    if (unitStr === 'أنبوبة' || unitStr === 'انبوبة' || unitStr === 'أنبوب' || unitStr === 'انبوب') return `${numQty} أنابيب`;
    if (unitStr === 'قطعة') return `${numQty} قطع`;
    if (unitStr === 'علبة') return `${numQty} علب`;
    if (unitStr === 'شريط') return `${numQty} أشرطة`;
    if (unitStr === 'وحدة') return `${numQty} وحدات`;
    if (unitStr === 'حبة') return `${numQty} حبات`;
    if (unitStr === 'كيس') return `${numQty} أكياس`;
    if (unitStr === 'امبولة' || unitStr === 'أمبولة') return `${numQty} أمبولات`;
    if (unitStr === 'كرتون') return `${numQty} كراتين`;
    if (unitStr === 'كيت (Kit)') return `${numQty} كيتات (Kit)`;
    if (unitStr === 'كيت') return `${numQty} كيتات`;
    if (unitStr === 'لتر') return `${numQty} لترات`;
    if (unitStr === 'مل (mL)' || unitStr === 'مل') return `${numQty} ${unitStr}`;
    if (unitStr === 'شريحة') return `${numQty} شرائح`;
    if (unitStr === 'مسحة') return `${numQty} مسحات`;
    if (unitStr === 'زجاجة') return `${numQty} زجاجات`;
    if (unitStr === 'قنينة') return `${numQty} قنانٍ`;
    if (unitStr === 'إبرة' || unitStr === 'ابرة') return `${numQty} إبر`;
    if (unitStr === 'سرنجة') return `${numQty} سرنجات`;
    if (unitStr === 'كبسولة') return `${numQty} كبسولات`;
    if (unitStr === 'قطرة') return `${numQty} قطرات`;
    if (unitStr.endsWith('ة')) return `${numQty} ${unitStr.slice(0, -1)}ات`;
    return `${numQty} ${unitStr}`;
  }

  return `${numQty} ${unitStr}`;
};

export const formatLabConsumableRateText = (c) => {
  if (!c) return '';
  if (c.consumption_mode === 'per_unit_yield') {
    const unit = (c.item_unit || 'عبوة').trim();
    return `${formatArabicTestsCount(c.tests_per_unit)} / لكل ${unit}`;
  }
  const unit = (c.item_unit || 'وحدة').trim();
  return `${formatArabicLabUnitQty(c.quantity_per_test, unit)} / لكل تحليل`;
};

export const formatLabConsumableRate = (c) => {
  const text = formatLabConsumableRateText(c);
  return text ? `(${text})` : '';
};


export const formatArabicScansCount = (count) => {
  const n = parseInt(count, 10) || 0;
  if (n <= 0) return 'لا توجد فحوصات';
  if (n === 1) return 'فحص واحد';
  if (n === 2) return 'فحصان';
  const mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return `${n} فحوصات`;
  return `${n} فحصاً`;
};

export const formatArabicScansStatus = (count, status) => {
  const n = parseInt(count, 10) || 0;
  if (n <= 0) return 'لا توجد فحوصات';

  if (status === 'pending') {
    if (n === 1) return 'فحص واحد مطلوب';
    if (n === 2) return 'فحصان مطلوبان';
    const mod100 = n % 100;
    if (mod100 >= 3 && mod100 <= 10) return `${n} فحوصات مطلوبة`;
    return `${n} فحصاً مطلوباً`;
  }

  if (status === 'in_progress') {
    if (n === 1) return 'فحص واحد قيد الإجراء';
    if (n === 2) return 'فحصان قيد الإجراء';
    const mod100 = n % 100;
    if (mod100 >= 3 && mod100 <= 10) return `${n} فحوصات قيد الإجراء`;
    return `${n} فحصاً قيد الإجراء`;
  }

  if (status === 'completed') {
    if (n === 1) return 'فحص واحد منجز';
    if (n === 2) return 'فحصان منجزان';
    const mod100 = n % 100;
    if (mod100 >= 3 && mod100 <= 10) return `${n} فحوصات منجزة`;
    return `${n} فحصاً منجزاً`;
  }

  return formatArabicScansCount(n);
};

export const formatArabicPendingScansBadge = (count) => {
  const n = parseInt(count, 10) || 0;
  if (n <= 0) return '';
  if (n === 1) return 'بانتظار فحص واحد';
  if (n === 2) return 'بانتظار فحصين';
  const mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return `بانتظار ${n} فحوصات`;
  return `بانتظار ${n} فحصاً`;
};

export const formatArabicPendingScansTitle = (count) => {
  const n = parseInt(count, 10) || 0;
  if (n <= 0) return '';
  if (n === 1) return 'يوجد فحص واحد بانتظار وقيد التنفيذ';
  if (n === 2) return 'يوجد فحصان بانتظار وقيد التنفيذ';
  const mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return `توجد ${n} فحوصات بانتظار وقيد التنفيذ`;
  return `يوجد ${n} فحصاً بانتظار وقيد التنفيذ`;
};
