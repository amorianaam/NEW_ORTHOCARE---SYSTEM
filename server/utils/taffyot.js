/**
 * تحويل الأرقام إلى كلمات باللغة العربية مع دعم العملة (ريال يمني)
 * @param {number} number 
 * @returns {string}
 */
function taffyot(number) {
  if (number === 0 || !number) return 'صفر ريال يمني';
  
  const parsedNumber = parseFloat(number);
  if (isNaN(parsedNumber)) return 'صفر ريال يمني';

  // Split integer and decimal parts
  const parts = parsedNumber.toFixed(2).split('.');
  const integerPart = parseInt(parts[0], 10);
  const decimalPart = parseInt(parts[1], 10);
  
  if (integerPart === 0 && decimalPart === 0) return 'صفر ريال يمني';

  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
  
  function convertGroup(n) {
    let result = '';
    const h = Math.floor(n / 100);
    const t = n % 100;
    
    if (h > 0) {
      result += hundreds[h];
    }
    
    if (t > 0) {
      if (result !== '') result += ' و ';
      if (t < 20) {
        result += ones[t];
      } else {
        const o = t % 10;
        const tenStr = tens[Math.floor(t / 10)];
        if (o > 0) {
          result += ones[o] + ' و ' + tenStr;
        } else {
          result += tenStr;
        }
      }
    }
    return result;
  }
  
  let words = '';
  let temp = integerPart;
  
  // Groups: Billions, Millions, Thousands, Ones
  const groups = [];
  while (temp > 0) {
    groups.push(temp % 1000);
    temp = Math.floor(temp / 1000);
  }
  
  for (let i = groups.length - 1; i >= 0; i--) {
    const groupVal = groups[i];
    if (groupVal === 0) continue;
    
    let groupStr = '';
    
    if (i === 1) { // Thousands
      if (groupVal === 1) groupStr = 'ألف';
      else if (groupVal === 2) groupStr = 'ألفان';
      else if (groupVal >= 3 && groupVal <= 10) groupStr = convertGroup(groupVal) + ' آلاف';
      else groupStr = convertGroup(groupVal) + ' ألفاً';
    } else if (i === 2) { // Millions
      if (groupVal === 1) groupStr = 'مليون';
      else if (groupVal === 2) groupStr = 'مليونان';
      else if (groupVal >= 3 && groupVal <= 10) groupStr = convertGroup(groupVal) + ' ملايين';
      else groupStr = convertGroup(groupVal) + ' مليوناً';
    } else if (i === 3) { // Billions
      if (groupVal === 1) groupStr = 'مليار';
      else if (groupVal === 2) groupStr = 'ملياران';
      else if (groupVal >= 3 && groupVal <= 10) groupStr = convertGroup(groupVal) + ' مليارات';
      else groupStr = convertGroup(groupVal) + ' ملياراً';
    } else {
      groupStr = convertGroup(groupVal);
    }
    
    if (words !== '' && groupStr !== '') words += ' و ';
    words += groupStr;
  }
  
  // Pluralization for Yemeni Rial
  let currencySuffix = ' ريال يمني';
  if (integerPart >= 3 && integerPart <= 10) {
    currencySuffix = ' ريالات يمنية';
  } else if (integerPart > 10) {
    currencySuffix = ' ريالاً يمنياً';
  }
  
  let finalResult = words ? (words + currencySuffix) : '';
  
  if (decimalPart > 0) {
    let filsSuffix = ' فلس';
    if (decimalPart >= 3 && decimalPart <= 10) {
      filsSuffix = ' فلوس';
    } else if (decimalPart > 10) {
      filsSuffix = ' فلساً';
    }
    
    const decimalWords = convertGroup(decimalPart);
    if (finalResult !== '') {
      finalResult += ' و ' + decimalWords + filsSuffix;
    } else {
      finalResult = decimalWords + filsSuffix;
    }
  }
  
  return finalResult;
}

module.exports = taffyot;
