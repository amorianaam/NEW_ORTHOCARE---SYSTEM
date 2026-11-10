import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Printer, X, Check, CheckSquare, Square, FileText, 
  User, Phone, Calendar, Hash, ShieldCheck, Sparkles,
  Layers, Info, RefreshCw, Smartphone, Mail, MapPin
} from 'lucide-react';
import taffyot from '../../../utils/taffyot';
import useAuthStore from '../../../store/useAuthStore';
import { CLINIC_LOGO_BASE64 } from '../../../assets/clinicLogo';

const CATEGORY_MAP = {
  entry_fee: 'رسوم معاينة',
  lab: 'مختبر',
  radiology: 'أشعة',
  clinical: 'خدمة سريرية',
  surgery_payment: 'عملية',
  emergency: 'طوارئ',
  dental: 'أسنان',
  refund: 'استرداد مالي',
  external_lab: 'مختبر',
  external_radiology: 'أشعة',
  external_service: 'خدمة خارجية',
  services: 'خدمات طبية',
  other: 'أخرى'
};

const formatDateEn = (isoStr) => {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return String(isoStr);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const formatTimeEn = (isoStr) => {
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

const InvoicePrintModal = ({
  isOpen,
  onClose,
  patient,
  visit,
  transactions = [],
  recordData = null,
}) => {
  const { user } = useAuthStore();

  // Print configuration state
  const [printMode, setPrintMode] = useState('single'); // 'single' (A5 Landscape) | 'double' (2x A5 on A4)

  // Filter out refunded transactions completely
  const isRefundTransaction = useCallback((t) => {
    if (!t) return false;
    if (t.isRefunded || t.is_refund || t.is_refunded) return true;
    if (t.status === 'refunded' || t.status === 'cancelled') return true;
    if (t.type === 'expense') return true;
    if (parseFloat(t.amount || 0) < 0) return true;
    const desc = String(t.description || '');
    const name = String(t.serviceName || t.name || '');
    if (
      desc.includes('استرداد للمريض') || 
      desc.includes('استرداد كامل الخدمات') || 
      desc.startsWith('استرداد') || 
      name.startsWith('استرداد') ||
      desc.includes('[استرداد]') ||
      name.includes('[استرداد]')
    ) {
      return true;
    }
    return false;
  }, []);

  const activeTransactions = useMemo(() => {
    return (transactions || []).filter(t => !isRefundTransaction(t));
  }, [transactions, isRefundTransaction]);

  // Default selection: select all active non-refunded transactions
  const [selectedIds, setSelectedIds] = useState(() => {
    return new Set(
      (transactions || [])
        .filter(t => !isRefundTransaction(t))
        .map((t, idx) => String(t.id || t.item_id || idx))
    );
  });

  // Keep selection up to date when transactions change
  React.useEffect(() => {
    if (transactions && transactions.length > 0) {
      setSelectedIds(
        new Set(
          transactions
            .filter(t => !isRefundTransaction(t))
            .map((t, idx) => String(t.id || t.item_id || idx))
        )
      );
    }
  }, [transactions, isRefundTransaction]);

  const cashierName = user?.name || user?.full_name || 'أمين الصندوق';

  // Toggle single item selection
  const toggleItem = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Toggle all items
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === activeTransactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeTransactions.map((t, idx) => String(t.id || t.item_id || idx))));
    }
  }, [selectedIds, activeTransactions]);

  // Resolve discount and original price for an item
  const resolveItemFinancials = useCallback((t) => {
    const netAmount = Math.max(0, parseFloat(t.amount || 0));
    let discount = 0;
    let isFree = netAmount === 0;

    if (t.discount_amount && parseFloat(t.discount_amount) > 0) {
      discount = parseFloat(t.discount_amount);
    }

    const desc = String(t.description || '');
    const priceMatch = desc.match(/\(السعر الأصلي:\s*([\d.]+)\)/);
    if (priceMatch && priceMatch[1]) {
      const origVal = parseFloat(priceMatch[1]);
      if (origVal > 0) {
        if (netAmount === 0) {
          discount = origVal;
          isFree = true;
        } else if (origVal > netAmount) {
          discount = origVal - netAmount;
        }
      }
    }

    if (discount === 0 && recordData?.serviceHistory) {
      const match = recordData.serviceHistory.find(s => 
        String(s.visit_id) === String(t.visit_id) && 
        (s.name === t.name || (desc && desc.includes(s.name)))
      );
      if (match) {
        if (match.discount_amount && parseFloat(match.discount_amount) > 0) {
          discount = parseFloat(match.discount_amount);
        } else if (netAmount === 0 && (match.price || match.original_price)) {
          const p = parseFloat(match.original_price || match.price || 0);
          if (p > 0) {
            discount = p;
            isFree = true;
          }
        }
      }
    }

    if (desc.includes('مجاني بواسطة الدكتور') || desc.includes('مجانية بواسطة الدكتور') || t.isFree) {
      isFree = true;
    }

    const originalPrice = netAmount + discount;
    return {
      originalPrice,
      discount,
      netAmount,
      isFree
    };
  }, [recordData]);

  // Filtered printable items with resolved data
  const printableItems = useMemo(() => {
    return activeTransactions.map((t, idx) => {
      const id = String(t.id || t.item_id || idx);
      const isSelected = selectedIds.has(id);
      const { originalPrice, discount, netAmount, isFree } = resolveItemFinancials(t);

      // Clean service name
      let serviceName = t.service_name || t.serviceName || t.name || '';
      if (!serviceName && (recordData?.serviceHistory || recordData?.pendingServices)) {
        const pool = [...(recordData?.serviceHistory || []), ...(recordData?.pendingServices || [])];
        const match = pool.find(s => String(s.visit_id) === String(t.visit_id));
        if (match?.name) serviceName = match.name;
      }
      if (!serviceName) {
        serviceName = t.description || 'خدمة طبية';
      }
      serviceName = serviceName.replace(/\{.*?\}/g, '').trim();

      // Detect and extract clean name from free service pattern
      // e.g. "أشعة مجانية بواسطة الدكتور (السعر الأصلي: 2500.00) - CXR"
      const freePattern = /^(?:أشعة|تحليل|خدمة سريرية|خدمة)?\s*مجاني(?:ة)?\s*بواسطة\s*الدكتور(?:\s*\(السعر الأصلي:\s*[\d.]+\))?(?:\s*[-—]\s*(.+))?$/;
      const freeMatch = serviceName.match(freePattern);
      if (freeMatch) {
        if (freeMatch[1] && freeMatch[1].trim()) {
          serviceName = freeMatch[1].trim();
        } else if (t.name && !t.name.includes('بواسطة الدكتور')) {
          serviceName = t.name;
        } else if (t.category === 'radiology' || t.category === 'أشعة' || t.category === 'external_radiology') {
          serviceName = 'فحص أشعة';
        } else if (t.category === 'lab' || t.category === 'مختبر' || t.category === 'external_lab') {
          serviceName = 'تحليل مخبري';
        } else if (t.category === 'clinical' || t.category === 'خدمة سريرية') {
          serviceName = 'خدمة سريرية';
        } else {
          serviceName = 'خدمة طبية';
        }
      }

      // Remove standalone original price / free mentions
      serviceName = serviceName.replace(/\(السعر الأصلي:\s*[\d.]+\)/g, '').trim();
      serviceName = serviceName.replace(/(?:أشعة|تحليل|خدمة سريرية|خدمة)?\s*مجاني(?:ة)?\s*بواسطة\s*الدكتور\s*[-—]?\s*/g, '').trim();

      if (serviceName === 'رسم كشف' || serviceName === 'رسم كشف طبي' || serviceName === 'رسوم معاينة (كشف طبي)') {
        serviceName = 'رسوم معاينة';
      }

      // Radiology digital/film handling
      let radHistoryMatch = null;
      if (recordData?.serviceHistory) {
        radHistoryMatch = recordData.serviceHistory.find(s => 
          (s.type === 'radiology' || s.category === 'radiology' || s.category === 'external_radiology') &&
          String(s.visit_id) === String(t.visit_id) &&
          (
            s.name === serviceName || 
            s.name === t.name || 
            (t.description && t.description.includes(s.name))
          )
        );
        if (!radHistoryMatch) {
          const visitRads = recordData.serviceHistory.filter(s => 
            (s.type === 'radiology' || s.category === 'radiology' || s.category === 'external_radiology') &&
            String(s.visit_id) === String(t.visit_id)
          );
          if (visitRads.length === 1) {
            radHistoryMatch = visitRads[0];
          }
        }
      }

      const isRadiology = t.category === 'radiology' || t.category === 'external_radiology' || t.category === 'أشعة' || 
                          serviceName.includes('أشعة') || serviceName.includes('اشعة') ||
                          Boolean(radHistoryMatch);

      let isDigital = false;
      if (t.with_film === 0 || t.with_film === false || t.withFilm === false || t.isWithoutFilm === true) {
        isDigital = true;
      } else if (radHistoryMatch && (radHistoryMatch.with_film === 0 || radHistoryMatch.with_film === false)) {
        isDigital = true;
      } else if (
        /(?:بلا|بدون)\s*(?:طباعة\s*)?ف[يـ]?لم/.test(serviceName) || 
        /(?:بلا|بدون)\s*(?:طباعة\s*)?ف[يـ]?لم/.test(t.description || '') ||
        /(?:بلا|بدون)\s*طباعة/.test(serviceName) ||
        /(?:بلا|بدون)\s*طباعة/.test(t.description || '') ||
        /رقمي/.test(serviceName) || 
        /رقمي/.test(t.description || '')
      ) {
        isDigital = true;
      }

      // Strip "مع فيلم" / "مع فلم" completely
      serviceName = serviceName.replace(/\s*\(?\s*مع\s*(?:طباعة\s*)?ف[يـ]?لم\s*\)?/g, '').trim();
      serviceName = serviceName.replace(/\s*\(?\s*مع\s*طباعة\s*\)?/g, '').trim();
      // Strip "بدون فيلم" / "بلا فيلم" / "رقمي"
      serviceName = serviceName.replace(/\s*\(?\s*(?:بلا|بدون)\s*(?:طباعة\s*)?ف[يـ]?لم\s*\)?/g, '').trim();
      serviceName = serviceName.replace(/\s*\(?\s*(?:بلا|بدون)\s*طباعة\s*\)?/g, '').trim();
      serviceName = serviceName.replace(/\s*\(?\s*رقمي\s*\)?/g, '').trim();

      // If radiology and digital (without film), display "(بدون فيلم)"
      if (isRadiology && isDigital) {
        serviceName = `${serviceName} (بدون فيلم)`;
      }

      // Department
      let categoryLabel = t.categoryLabel || CATEGORY_MAP[t.category] || '';
      if (t.category === 'external_lab') categoryLabel = 'مختبر';
      if (t.category === 'external_radiology') categoryLabel = 'أشعة';
      if (!categoryLabel || categoryLabel === 'عام') {
        if (isRadiology) categoryLabel = 'أشعة';
        else if (t.category === 'lab' || t.category === 'external_lab' || (t.description && t.description.includes('تحليل'))) categoryLabel = 'مختبر';
        else categoryLabel = CATEGORY_MAP[t.category] || t.category || 'عام';
      }

      return {
        id,
        raw: t,
        serviceName,
        categoryLabel,
        originalPrice,
        discount,
        netAmount,
        isFree,
        isSelected
      };
    });
  }, [activeTransactions, selectedIds, resolveItemFinancials, recordData]);

  // Selected items only
  const activePrintableItems = useMemo(() => {
    return printableItems.filter(item => item.isSelected);
  }, [printableItems]);

  // Determine whether discount/free columns should be displayed
  const hasDiscountsOrFree = useMemo(() => {
    const list = activePrintableItems.length > 0 ? activePrintableItems : printableItems;
    return list.some(item => 
      item.discount > 0 || item.isFree || (item.originalPrice > item.netAmount)
    );
  }, [activePrintableItems, printableItems]);

  // Calculations
  const { totalOriginal, totalDiscount, grandTotal } = useMemo(() => {
    let orig = 0;
    let disc = 0;
    let grand = 0;

    activePrintableItems.forEach(item => {
      orig += item.originalPrice;
      disc += item.discount;
      grand += item.netAmount;
    });

    return {
      totalOriginal: Math.max(0, orig),
      totalDiscount: Math.max(0, disc),
      grandTotal: Math.max(0, grand)
    };
  }, [activePrintableItems]);

  // Taffyot in Yemeni Rial (words only, matching FinancialRecordModal)
  const taffyotWords = useMemo(() => {
    if (grandTotal <= 0) return 'صفر';
    return taffyot(grandTotal).replace(/(ريالاً يمنياً|ريال يمني|فقط|لا غير|-)/g, '').trim();
  }, [grandTotal]);

  // Execute print in a clean popup or iframe
  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      alert('يرجى السماح بالنوافذ المنبثقة للطباعة');
      return;
    }

    const now = new Date();
    const printTimeStr = `${formatDateEn(now)} - ${formatTimeEn(now)}`;
    const invoiceNumber = `INV-${visit?.visit_number || visit?.id || '000'}`;
    const logoSrc = CLINIC_LOGO_BASE64;

    // Vector SVG Icons for high-precision print output without emoji artifacts
    const svgPhone = `<svg width="8.5" height="8.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-left:2px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
    const svgMobile = `<svg width="8.5" height="8.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-left:2px;"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>`;
    const svgMail = `<svg width="8.5" height="8.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-left:2px;"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>`;
    const svgPin = `<svg width="8.5" height="8.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-left:3px;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
    const svgScissors = `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-left:3px;"><circle cx="6" cy="6" r="3"></circle><path d="M8.12 8.12 12 12"></path><path d="M20 4 8.12 15.88"></path><circle cx="6" cy="18" r="3"></circle><path d="M14.8 14.8 20 20"></path></svg>`;

    // Render single invoice HTML
    const renderInvoiceHTML = (copyLabel = '') => `
      <div class="invoice-sheet ${printMode === 'double' ? 'double-sheet' : ''}">
        <!-- Watermark Background -->
        <div class="watermark-container">
          <img src="${logoSrc}" alt="watermark" class="watermark-img" />
        </div>

        <!-- Top Header Banner -->
        <header class="invoice-header">
          <div class="clinic-top-bar">
            <h1 class="clinic-main-title">مركز الدكتور أحمد أنعم لجراحة العظام والمفاصل والتشوهات</h1>
          </div>

          <div class="header-body">
            <div class="doctor-side doctor-right">
              <h3 class="doctor-name">إشراف د/ أحمد أنعم</h3>
              <p class="doctor-spec">إستشاري أمراض</p>
              <p class="doctor-spec">وجراحة العظام والمفاصل</p>
            </div>

            <div class="clinic-center">
              <div class="logo-wrap">
                <img src="${logoSrc}" alt="شعار المركز" class="clinic-logo" />
              </div>
              <div class="badge-wrapper">
                <span class="invoice-badge">فاتورة خدمات علاجية وسند قبض ${copyLabel ? `(${copyLabel})` : ''}</span>
              </div>
            </div>

            <div class="doctor-side doctor-left">
              <h3 class="doctor-name">د/ هيثم أنعم</h3>
              <p class="doctor-spec">إستشاري أمراض</p>
              <p class="doctor-spec">وجراحة العظام والمفاصل</p>
            </div>
          </div>
        </header>

        <!-- Patient & Visit Meta Strip -->
        <section class="patient-strip">
          <div class="meta-item">
            <span class="meta-label">اسم المريض:</span>
            <span class="meta-value patient-name">${patient?.full_name || '—'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">رقم الفاتورة:</span>
            <span class="meta-value invoice-no" dir="ltr">${invoiceNumber}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">تاريخ الطباعة:</span>
            <span class="meta-value" dir="ltr">${formatDateEn(now)}</span>
          </div>
        </section>

        <!-- Financial Items Table -->
        <main class="table-container">
          <table class="items-table">
            ${hasDiscountsOrFree ? `
              <colgroup>
                <col style="width: 6%;">
                <col style="width: 42%;">
                <col style="width: 14%;">
                <col style="width: 13%;">
                <col style="width: 11%;">
                <col style="width: 14%;">
              </colgroup>
            ` : `
              <colgroup>
                <col style="width: 8%;">
                <col style="width: 52%;">
                <col style="width: 20%;">
                <col style="width: 20%;">
              </colgroup>
            `}
            <thead>
              <tr>
                <th style="text-align: center;">#</th>
                <th style="text-align: right;">الخدمة</th>
                <th style="text-align: right;">القسم</th>
                ${hasDiscountsOrFree ? `
                  <th style="text-align: center;">المبلغ الأصلي</th>
                  <th style="text-align: center;">الخصم</th>
                ` : ''}
                <th style="text-align: center;">المبلغ المعتمد</th>
              </tr>
            </thead>
            <tbody>
              ${activePrintableItems.length === 0 ? `
                <tr><td colspan="${hasDiscountsOrFree ? 6 : 4}" style="text-align: center; padding: 15px; color: #94a3b8;">لم يتم تحديد أي خدمات للطباعة</td></tr>
              ` : activePrintableItems.map((item, idx) => `
                <tr>
                  <td style="text-align: center; font-weight: bold; color: #64748b;">${idx + 1}</td>
                  <td style="font-weight: 700; color: #0f172a;">
                    ${item.serviceName}
                    ${item.isFree ? '<span class="free-tag">(مجاني)</span>' : ''}
                  </td>
                  <td style="color: #475569; font-weight: 600;">${item.categoryLabel}</td>
                  ${hasDiscountsOrFree ? `
                    <td style="text-align: center; color: #475569;" dir="ltr">${item.originalPrice.toLocaleString('en-US')}</td>
                    <td style="text-align: center; color: ${item.discount > 0 ? '#d97706' : '#94a3b8'}; font-weight: bold;" dir="ltr">
                      ${item.discount > 0 ? item.discount.toLocaleString('en-US') : '—'}
                    </td>
                  ` : ''}
                  <td style="text-align: center; font-weight: 800; color: #0f172a;" dir="ltr">
                    ${item.netAmount.toLocaleString('en-US')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="tfoot-summary">
                <td colspan="${hasDiscountsOrFree ? 6 : 4}" class="tfoot-cell">
                  <div class="tfoot-flex">
                    <div class="tfoot-right">
                      <span class="total-title">إجمالي المبلغ:</span>
                      ${totalDiscount > 0 ? `
                        <span class="total-discount-tag">(إجمالي الخصم: ${totalDiscount.toLocaleString('en-US')} ر.ي)</span>
                      ` : ''}
                    </div>
                    <div class="tfoot-left">
                      <span class="total-amount" dir="ltr">${grandTotal.toLocaleString('en-US')}</span>
                      <span class="total-currency">ر.ي</span>
                      ${grandTotal > 0 ? `
                        <span class="total-divider">|</span>
                        <span class="total-words">${taffyotWords} ريال يمني.</span>
                      ` : ''}
                    </div>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </main>

        <!-- Signatures Strip -->
        <section class="signatures-strip">
          <div class="sig-block">
            <span class="sig-title">توقيع أمين الصندوق:</span>
            <span class="sig-dots">..................................................</span>
          </div>
        </section>

        <!-- Footer Contact & Address Section (Clean On-Paper Layout) -->
        <footer class="invoice-footer">
          <div class="footer-address">
            <span>${svgPin} الجمهورية اليمنية - تعز- شارع جمال - مقابل مطعم السعيد - فوق (الصيدلية المركزية).</span>
          </div>
          <hr class="footer-line" />
          <div class="footer-contacts">
            <span dir="ltr">&#x200E;${svgPhone} 04-263750</span>
            <span class="footer-sep">|</span>
            <span dir="ltr">&#x200E;${svgPhone} 04-266150</span>
            <span class="footer-sep">|</span>
            <span dir="ltr">&#x200E;${svgMobile} +967 737714264</span>
            <span class="footer-sep">|</span>
            <span dir="ltr">${svgMail} dranaam2007@yahoo.com</span>
          </div>
        </footer>
      </div>
    `;

    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <base href="${typeof window !== 'undefined' && window.location?.origin ? `${window.location.origin}/` : '/'}" />
          <meta charset="utf-8" />
          <title>فاتورة علاجية - ${patient?.full_name || 'المريض'}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');
            
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }

            body {
              font-family: 'Tajawal', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              color: #0f172a;
              background: #f1f5f9;
              direction: rtl;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            @page {
              size: ${printMode === 'double' ? 'A4 portrait' : 'A5 landscape'};
              margin: 0;
            }

            .invoice-sheet {
              width: 210mm;
              height: 148mm;
              max-height: 148mm;
              margin: 0 auto;
              padding: 6mm 8mm 5mm 8mm;
              background: #ffffff;
              position: relative;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              box-sizing: border-box;
            }

            .double-wrapper {
              display: flex;
              flex-direction: column;
              width: 210mm;
              height: 297mm;
              margin: 0 auto;
              background: #ffffff;
            }

            .cut-divider {
              width: 100%;
              border-top: 1px dashed #94a3b8;
              position: relative;
              margin: 0;
              text-align: center;
              height: 0;
            }

            .cut-divider span {
              position: absolute;
              top: -8px;
              left: 50%;
              transform: translateX(-50%);
              background: #ffffff;
              padding: 0 10px;
              font-size: 10px;
              font-weight: bold;
              color: #64748b;
            }

            /* Watermark */
            .watermark-container {
              position: absolute;
              inset: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              pointer-events: none;
              z-index: 1;
              opacity: 0.045;
            }

            .watermark-img {
              width: 320px;
              height: auto;
              filter: grayscale(10%);
            }

            /* Header */
            .invoice-header {
              display: flex;
              flex-direction: column;
              align-items: center;
              border-bottom: 2px solid #0284c7;
              padding-bottom: 3.5px;
              margin-bottom: 2px;
              position: relative;
              z-index: 2;
            }

            .clinic-top-bar {
              width: 100%;
              text-align: center;
              margin-bottom: 2.5px;
            }

            .clinic-main-title {
              font-size: 15px;
              font-weight: 900;
              color: #0c4a6e;
              line-height: 1.2;
              letter-spacing: -0.2px;
            }

            .header-body {
              width: 100%;
              display: flex;
              align-items: center;
              justify-content: space-between;
            }

            .doctor-side {
              width: 31%;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            }

            .doctor-right {
              text-align: center;
            }

            .doctor-left {
              text-align: center;
            }

            .doctor-name {
              font-size: 12px;
              font-weight: 900;
              color: #0c4a6e;
              margin-bottom: 1.5px;
              line-height: 1.2;
            }

            .doctor-spec {
              font-size: 9px;
              font-weight: 700;
              color: #334155;
              line-height: 1.3;
              margin: 0;
            }

            .clinic-center {
              width: 38%;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            }

            .logo-wrap {
              width: 66px;
              height: 66px;
              margin-bottom: 2px;
            }

            .clinic-logo {
              width: 100%;
              height: 100%;
              object-fit: contain;
            }

            .badge-wrapper {
              display: flex;
              justify-content: center;
            }

            .invoice-badge {
              display: inline-block;
              background: #0284c7;
              color: #ffffff;
              font-size: 8.5px;
              font-weight: 800;
              padding: 1.5px 8px;
              border-radius: 9999px;
              letter-spacing: 0.2px;
              white-space: nowrap;
            }

            /* Patient Strip */
            .patient-strip {
              display: flex;
              align-items: center;
              justify-content: space-between;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 6px;
              padding: 4px 10px;
              margin-top: 4px;
              margin-bottom: 4px;
              position: relative;
              z-index: 2;
            }

            .meta-item {
              display: flex;
              align-items: center;
              gap: 4px;
              font-size: 10px;
            }

            .meta-label {
              font-weight: 700;
              color: #475569;
            }

            .meta-value {
              font-weight: 800;
              color: #0f172a;
            }

            .meta-value.patient-name {
              color: #0369a1;
              font-size: 11px;
            }

            .meta-value.invoice-no {
              color: #0284c7;
            }

            /* Table */
            .table-container {
              flex: 1;
              position: relative;
              z-index: 2;
              overflow: hidden;
            }

            .items-table {
              width: 100%;
              table-layout: fixed;
              border-collapse: collapse;
              font-size: 9.5px;
            }

            .items-table th {
              background: #f1f5f9;
              color: #1e293b;
              font-weight: 800;
              padding: 4px 6px;
              border-top: 1px solid #cbd5e1;
              border-bottom: 1.5px solid #0284c7;
              font-size: 9px;
            }

            .items-table td {
              padding: 4px 6px;
              border-bottom: 1px solid #f1f5f9;
              color: #1e293b;
              vertical-align: middle;
            }

            .items-table tbody tr:nth-child(even) {
              background: #fafbfc;
            }

            .refund-row td {
              background: #fff1f2 !important;
            }

            .refund-tag {
              color: #e11d48;
              font-size: 8px;
              font-weight: bold;
              margin-right: 4px;
            }

            .tfoot-summary td {
              background: #f8fafc !important;
              border-top: 1.5px solid #0284c7;
              border-bottom: none;
              padding: 4px 8px;
            }

            .tfoot-flex {
              display: flex;
              align-items: center;
              justify-content: space-between;
              width: 100%;
            }

            .tfoot-right {
              display: flex;
              align-items: center;
              gap: 6px;
            }

            .tfoot-left {
              display: flex;
              align-items: center;
              gap: 3px;
            }

            .total-title {
              font-size: 9.5px;
              font-weight: 800;
              color: #0f172a;
            }

            .total-amount {
              font-size: 15px;
              font-weight: 900;
              color: #0369a1;
            }

            .total-currency {
              font-size: 8.5px;
              font-weight: 700;
              color: #64748b;
            }

            .total-divider {
              color: #cbd5e1;
              font-weight: bold;
              margin: 0 4px;
            }

            .total-words {
              font-size: 9px;
              font-weight: 800;
              color: #0c4a6e;
            }

            .total-discount-tag {
              font-size: 8.5px;
              font-weight: 700;
              color: #d97706;
            }

            .free-tag {
              color: #d97706;
              font-weight: 800;
              margin-right: 4px;
              font-size: 9px;
            }

            /* Signatures */
            .signatures-strip {
              display: flex;
              align-items: center;
              justify-content: flex-start;
              margin-top: 2px;
              margin-bottom: 14px;
              padding: 2px 4px;
              position: relative;
              z-index: 2;
            }

            .sig-block {
              display: flex;
              align-items: center;
              gap: 8px;
              font-size: 9.5px;
            }

            .sig-title {
              font-weight: 800;
              color: #334155;
            }

            .sig-dots {
              color: #94a3b8;
              font-size: 8.5px;
              letter-spacing: 1px;
            }

            /* Footer Contact & Address (Clean On-Paper Layout) */
            .invoice-footer {
              background: transparent;
              color: #1e293b;
              padding: 0;
              margin-top: 8px;
              text-align: center;
              position: relative;
              z-index: 2;
            }

            .footer-address {
              font-size: 8.5px;
              font-weight: 800;
              color: #0f2b48;
              margin-bottom: 2.5px;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 4px;
            }

            .footer-line {
              border: none;
              border-top: 1px solid #cbd5e1;
              margin: 2.5px auto;
              width: 98%;
            }

            .footer-contacts {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              font-size: 8px;
              font-weight: 700;
              color: #475569;
              direction: ltr;
              padding-top: 1px;
            }

            .footer-contacts span {
              white-space: nowrap;
            }

            .footer-sep {
              color: #cbd5e1;
              font-weight: bold;
            }

            @media print {
              body {
                background: #ffffff;
              }
              .invoice-sheet {
                box-shadow: none;
                border: none;
                page-break-after: avoid;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          ${printMode === 'double' ? `
            <div class="double-wrapper">
              ${renderInvoiceHTML('نسخة المريض')}
              <div class="cut-divider">
                <span>${svgScissors} قص من هنا</span>
              </div>
              ${renderInvoiceHTML('نسخة المركز / الأرشيف')}
            </div>
          ` : `
            ${renderInvoiceHTML('')}
          `}
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 800);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm print:hidden" dir="rtl">
        {/* Background Overlay */}
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }} 
          className="absolute inset-0"
          onClick={onClose} 
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          className="relative z-10 bg-slate-100 rounded-3xl shadow-2xl border border-white/80 w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden"
        >
          {/* Top Control Bar */}
          <div className="px-6 py-3.5 bg-gradient-to-r from-sky-900 via-sky-800 to-indigo-900 text-white flex items-center justify-between shrink-0 shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-sky-200 border border-white/20">
                <Printer size={18} />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black">
                  معاينة وطباعة الفاتورة وسند القبض
                </h2>
                <p className="text-[11px] text-sky-200/80 font-medium">
                  حدد الخدمات المراد طباعتها في الفاتورة واضبط خيارات الطباعة قبل الإصدار
                </p>
              </div>
            </div>

            {/* Quick Actions in Header */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handlePrint}
                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-black rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer active:scale-95 border border-emerald-400/40"
              >
                <Printer size={15} />
                <span>طباعة الفاتورة الآن</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Configuration Toolbar */}
          <div className="bg-white border-b border-slate-200/80 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer"
              >
                {selectedIds.size === transactions.length ? (
                  <>
                    <CheckSquare size={14} className="text-sky-600" />
                    <span>إلغاء تحديد الكل ({selectedIds.size})</span>
                  </>
                ) : (
                  <>
                    <Square size={14} className="text-slate-400" />
                    <span>تحديد كل الخدمات ({selectedIds.size}/{transactions.length})</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Print Mode Selector */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPrintMode('single')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    printMode === 'single'
                      ? 'bg-white text-sky-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  ورقة A5 مفردة
                </button>
                <button
                  type="button"
                  onClick={() => setPrintMode('double')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    printMode === 'double'
                      ? 'bg-white text-sky-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                  title="طباعة نسختين (للمريض والأرشيف) على ورقة A4 واحدة"
                >
                  نسختين على A4 (للمريض والأرشيف)
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Live Preview Area */}
          <div className="flex-1 overflow-auto p-4 sm:p-6 flex justify-center items-start">
            <div 
              className="bg-white rounded-2xl shadow-xl border border-slate-200/90 relative overflow-hidden flex flex-col justify-between"
              style={{
                width: '100%',
                maxWidth: '820px',
                minHeight: '520px',
                padding: '24px 28px',
                boxSizing: 'border-box'
              }}
            >
              {/* Watermark in Preview */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.045] z-0">
                <img 
                  src={CLINIC_LOGO_BASE64} 
                  alt="watermark" 
                  className="w-80 h-auto" 
                />
              </div>

              {/* Header */}
              <div className="border-b-2 border-sky-600 pb-2 relative z-10">
                {/* Clinic Top Bar Title */}
                <div className="text-center mb-1.5">
                  <h1 className="text-base sm:text-lg font-black text-sky-950 tracking-tight">
                    مركز الدكتور أحمد أنعم لجراحة العظام والمفاصل والتشوهات
                  </h1>
                </div>

                {/* Sub Header: Doctor أحمد, enlarged Logo + badge, Doctor هيثم */}
                <div className="flex items-center justify-between">
                  <div className="text-center w-1/3 flex flex-col items-center">
                    <h3 className="text-sm font-extrabold text-sky-950 mb-0.5">إشراف د/ أحمد أنعم</h3>
                    <p className="text-[11px] font-bold text-slate-700 leading-tight">إستشاري أمراض</p>
                    <p className="text-[11px] font-bold text-slate-700 leading-tight">وجراحة العظام والمفاصل</p>
                  </div>

                  <div className="text-center w-1/3 flex flex-col items-center">
                    <div className="w-[72px] h-[72px] flex items-center justify-center mb-1">
                      <img 
                        src={CLINIC_LOGO_BASE64} 
                        alt="Logo" 
                        className="w-full h-full object-contain drop-shadow-sm" 
                      />
                    </div>
                    <span className="inline-block bg-sky-600 text-white text-[9px] font-black px-2.5 py-0.5 rounded-full shadow-sm">
                      فاتورة خدمات علاجية وسند قبض مالي
                    </span>
                  </div>

                  <div className="text-center w-1/3 flex flex-col items-center">
                    <h3 className="text-sm font-extrabold text-sky-950 mb-0.5">د/ هيثم أنعم</h3>
                    <p className="text-[11px] font-bold text-slate-700 leading-tight">إستشاري أمراض</p>
                    <p className="text-[11px] font-bold text-slate-700 leading-tight">وجراحة العظام والمفاصل</p>
                  </div>
                </div>
              </div>

              {/* Patient Info Strip */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 mt-3 flex items-center justify-between text-xs relative z-10">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold">اسم المريض:</span>
                  <span className="font-black text-slate-900 text-sm">{patient?.full_name || '—'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold">رقم الفاتورة:</span>
                  <span className="font-black text-sky-700" dir="ltr">INV-{visit?.visit_number || visit?.id || '000'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold">تاريخ الطباعة:</span>
                  <span className="font-bold text-slate-700" dir="ltr">{formatDateEn(new Date())}</span>
                </div>
              </div>

              {/* Items Table with Interactive Checkboxes in Preview */}
              <div className="mt-3 flex-1 overflow-hidden relative z-10">
                <div className="text-[11px] font-bold text-slate-400 mb-1 flex items-center justify-between">
                  <span>قائمة الخدمات المسجلة (انقر على المربع لتضمين أو استبعاد الخدمة من الطباعة):</span>
                  <span className="text-sky-700">{activePrintableItems.length} من {printableItems.length} محدد للطباعة</span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-right text-xs table-fixed">
                    {hasDiscountsOrFree ? (
                      <colgroup>
                        <col className="w-[6%]" />
                        <col className="w-[5%]" />
                        <col className="w-[39%]" />
                        <col className="w-[13%]" />
                        <col className="w-[13%]" />
                        <col className="w-[10%]" />
                        <col className="w-[14%]" />
                      </colgroup>
                    ) : (
                      <colgroup>
                        <col className="w-[6%]" />
                        <col className="w-[6%]" />
                        <col className="w-[50%]" />
                        <col className="w-[18%]" />
                        <col className="w-[20%]" />
                      </colgroup>
                    )}
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="p-2 text-center">تحديد</th>
                        <th className="p-2 text-center">#</th>
                        <th className="p-2 text-right">الخدمة</th>
                        <th className="p-2 text-right">القسم</th>
                        {hasDiscountsOrFree && (
                          <>
                            <th className="p-2 text-center">المبلغ الأصلي</th>
                            <th className="p-2 text-center">الخصم</th>
                          </>
                        )}
                        <th className="p-2 text-center">المبلغ المعتمد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {printableItems.length === 0 ? (
                        <tr>
                          <td colSpan={hasDiscountsOrFree ? 7 : 5} className="p-6 text-center text-slate-400 font-bold">
                            لا توجد خدمات أو حركات مالية مسجلة في هذه الزيارة
                          </td>
                        </tr>
                      ) : (
                        printableItems.map((item, idx) => (
                          <tr 
                            key={item.id} 
                            onClick={() => toggleItem(item.id)}
                            className={`transition-colors cursor-pointer ${
                              item.isSelected 
                                ? 'bg-white hover:bg-sky-50/50' 
                                : 'bg-slate-50/60 opacity-40 hover:opacity-70'
                            }`}
                          >
                            <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={item.isSelected}
                                onChange={() => toggleItem(item.id)}
                                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                              />
                            </td>
                            <td className="p-2 text-center font-bold text-slate-400">{idx + 1}</td>
                            <td className="p-2 font-bold text-slate-900">
                              <span className={item.isSelected ? '' : 'line-through'}>{item.serviceName}</span>
                              {item.isFree && (
                                <span className="mr-1.5 text-xs font-black text-amber-600">
                                  (مجاني)
                                </span>
                              )}
                            </td>
                            <td className="p-2 font-semibold text-slate-600">{item.categoryLabel}</td>
                            {hasDiscountsOrFree && (
                              <>
                                <td className="p-2 text-center font-bold text-slate-700" dir="ltr">
                                  {item.originalPrice.toLocaleString('en-US')}
                                </td>
                                <td className="p-2 text-center font-bold" dir="ltr">
                                  {item.discount > 0 ? (
                                    <span className="text-amber-600">{item.discount.toLocaleString('en-US')}</span>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                              </>
                            )}
                            <td className="p-2 text-center font-black text-slate-900" dir="ltr">
                              {item.netAmount.toLocaleString('en-US')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t-2 border-sky-600 font-bold">
                      <tr>
                        <td colSpan={hasDiscountsOrFree ? 7 : 5} className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-800 font-black text-xs">إجمالي المبلغ:</span>
                              {totalDiscount > 0 && (
                                <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  (إجمالي الخصم: {totalDiscount.toLocaleString('en-US')} ر.ي)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-base font-black text-sky-800" dir="ltr">
                                {grandTotal.toLocaleString('en-US')}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500">ر.ي</span>
                              {grandTotal > 0 && (
                                <>
                                  <span className="text-slate-300 mx-1.5 font-bold">|</span>
                                  <span className="text-xs font-bold text-slate-700">
                                    {taffyotWords} ريال يمني.
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Signatures Strip */}
              <div className="mt-1.5 mb-3 flex items-center justify-start text-xs relative z-10">
                <div className="flex items-center gap-2">
                  <span className="text-slate-700 font-bold">توقيع أمين الصندوق:</span>
                  <span className="text-slate-400 tracking-wider">..................................................</span>
                </div>
              </div>

              {/* Footer Contact & Address (Clean On-Paper Layout) */}
              <div className="mt-7 pt-1 text-center relative z-10">
                <p className="text-[11px] font-black text-sky-950 flex items-center justify-center gap-1.5 mb-1.5">
                  <MapPin size={12} className="text-sky-600 shrink-0" />
                  <span>الجمهورية اليمنية - تعز- شارع جمال - مقابل مطعم السعيد - فوق (الصيدلية المركزية).</span>
                </p>
                <div className="w-full border-t border-slate-200 my-1.5" />
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-600 font-bold" dir="ltr">
                  <span className="flex items-center gap-1" dir="ltr">
                    <Phone size={11} className="text-sky-600" />
                    <span>&#x200E;04-263750</span>
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="flex items-center gap-1" dir="ltr">
                    <Phone size={11} className="text-sky-600" />
                    <span>&#x200E;04-266150</span>
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="flex items-center gap-1" dir="ltr">
                    <Smartphone size={11} className="text-emerald-600" />
                    <span>&#x200E;+967 737714264</span>
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="flex items-center gap-1" dir="ltr">
                    <Mail size={11} className="text-sky-600" />
                    <span>dranaam2007@yahoo.com</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default InvoicePrintModal;
