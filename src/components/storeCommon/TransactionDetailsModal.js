import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ArrowDownToLine,
  ArrowUpFromLine,
  Package,
  FileText,
  Eye,
  Maximize2,
  Minimize2,
  CheckCircle,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import taffyot from '../../utils/taffyot';
import { formatArabicItemsCount } from '../../utils/arabicFormatters';
import useAuthStore from '../../store/useAuthStore';
import { getServerBaseUrl } from '../../utils/apiConfig';

// ── English Date & Time Helpers (Matching BatchDetailsModal & RadiologyModals) ──
const formatDateEn = (isoStr) => {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '—';
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
};

const formatTimeEn = (isoStr) => {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '—';
  const pad = (n) => n.toString().padStart(2, '0');
  let hours = d.getHours();
  const minutes = pad(d.getMinutes());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${pad(hours)}:${minutes} ${ampm}`;
};

// ── Surgery Movement Notes Parser & Formatter ─────────────────────────
const parseSurgeryNotes = (notes, isReceive) => {
  if (!notes) return null;
  const isSurgery = notes.includes('عملية') || notes.includes('العملية');
  if (!isSurgery) return null;

  let op = '';
  let patient = '';
  let visit = '';

  if (notes.includes('|')) {
    const parts = notes.split('|').map((p) => p.trim());
    for (const part of parts) {
      if (part.startsWith('العملية:')) op = part.replace('العملية:', '').trim();
      else if (part.startsWith('معرف الزيارة:')) visit = part.replace('معرف الزيارة:', '').trim();
      else if (part.includes('صرف لعملية جراحية:')) patient = part.split('صرف لعملية جراحية:')[1].trim();
      else if (part.startsWith('المريض:')) patient = part.replace('المريض:', '').trim();
    }
  } else if (notes.includes('\n')) {
    const lines = notes.split('\n').map((l) => l.trim()).filter(Boolean);
    const line1 = lines[0] || '';
    const opMatch = line1.match(/\(([^)]+)\)/);
    if (opMatch) op = opMatch[1].trim();

    if (lines.length >= 2) {
      let line2 = lines[1];
      const visMatch = line2.match(/\(([^)]+)\)$/);
      if (visMatch) {
        visit = visMatch[1].trim();
        line2 = line2.replace(/\(([^)]+)\)$/, '').trim();
      }
      patient = line2.replace(/^للمريض:?\s*/, '').trim();
    }
    if (!visit && lines.length >= 3) {
      visit = lines[2].trim();
    }
  }

  // Normalize by stripping any existing parentheses
  patient = patient.replace(/[()]/g, '').trim();
  visit = visit.replace(/[()]/g, '').trim();

  const title = isReceive
    ? `إلغاء صرف واسترجاع من عملية${op ? ` (${op})` : ''}`
    : `صرف للعملية الجراحية${op ? ` (${op})` : ''}`;

  return { title, patient, visit };
};

const TransactionDetailsModal = ({ isOpen, onClose, transaction, storeType = 'general' }) => {
  const [isFullscreen, setIsFullscreen] = useState(() => {
    return localStorage.getItem('storeModalFullscreen') === 'true';
  });
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [batchItems, setBatchItems] = useState(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const { token } = useAuthStore();

  useEffect(() => {
    localStorage.setItem('storeModalFullscreen', isFullscreen);
  }, [isFullscreen]);

  useEffect(() => {
    if (isOpen && transaction) {
      const fetchDetails = async () => {
        setBatchLoading(true);
        setBatchItems(null);
        try {
          const base = storeType === 'or' ? '/api/inventory/or' : '/api/inventory/general';
          const isMfg =
            transaction.reference_id &&
            (String(transaction.reference_id).startsWith('MFG-') ||
              String(transaction.reference_id).startsWith('REV-MFG-'));
          const useBatch =
            transaction.reference_id &&
            !String(transaction.reference_id).startsWith('_') &&
            !transaction.is_single_view &&
            !isMfg;

          let url = useBatch
            ? `${base}/batch/${transaction.reference_id}`
            : `${base}/transaction/${transaction.id}`;

          if (useBatch && transaction.notes !== undefined) {
            url += `?notes=${encodeURIComponent(transaction.notes || '')}`;
          }

          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          setBatchItems(Array.isArray(data) ? data : []);
        } catch (err) {
          console.error('Failed to fetch batch items:', err);
          setBatchItems([]);
        } finally {
          setBatchLoading(false);
        }
      };
      fetchDetails();
    } else {
      setBatchItems(null);
    }
  }, [isOpen, transaction, token, storeType]);

  if (!isOpen || !transaction) return null;

  const isReceive = transaction.transaction_type === 'in';

  let invoiceUrl = null;
  let cleanNotes = transaction.notes || '';
  if (cleanNotes.includes('مرفق الفاتورة:')) {
    const parts = cleanNotes.split('مرفق الفاتورة:');
    cleanNotes = parts[0].trim();
    invoiceUrl = parts[1]?.trim();
  } else if (cleanNotes.includes('مرفق المستند:')) {
    const parts = cleanNotes.split('مرفق المستند:');
    cleanNotes = parts[0].trim();
    invoiceUrl = parts[1]?.trim();
  }
  cleanNotes = cleanNotes.replace(/\|\s*$/, '').trim();

  let extractedStocktakingId = null;
  if (cleanNotes.includes('تسوية جرد') && cleanNotes.includes('رقم الجلسة:')) {
    const parts = cleanNotes.split('| رقم الجلسة:');
    const rightSide = parts[1] || '';
    if (rightSide.includes('| ملاحظة:')) {
      const subParts = rightSide.split('| ملاحظة:');
      extractedStocktakingId = subParts[0].trim();
      cleanNotes = subParts[1].trim();
    } else {
      extractedStocktakingId = rightSide.trim();
      cleanNotes = '';
    }
  }

  let sourceOrDest = isReceive
    ? transaction.source_entity || 'جهة غير محددة'
    : transaction.destination_entity || 'جهة غير محددة';
  if (extractedStocktakingId && !sourceOrDest.includes('(رقم')) {
    sourceOrDest = `${sourceOrDest} (رقم ${extractedStocktakingId})`;
  }

  // Clean up trailing pipes
  if (cleanNotes.endsWith('|')) {
    cleanNotes = cleanNotes.slice(0, -1).trim();
  }

  // Formatting for Receive notes (Handles both old and new formats)
  if (isReceive && cleanNotes) {
    const oldFormatWithNote = cleanNotes.match(/^استلام فاتورة \d{4}-\d{2}-\d{2} \| (.*)$/);
    const oldFormatWithoutNote = cleanNotes.match(/^استلام فاتورة \d{4}-\d{2}-\d{2}$/);

    if (oldFormatWithNote) {
      cleanNotes = oldFormatWithNote[1].trim();
    } else if (oldFormatWithoutNote) {
      cleanNotes = 'استلام فاتورة';
    }
  }

  const parsedSurgeryNotes = parseSurgeryNotes(cleanNotes, isReceive);

  // Identify special movement types
  const isStocktaking = Boolean(
    (cleanNotes && cleanNotes.includes('تسوية جرد')) ||
      (transaction.reference_id && String(transaction.reference_id).startsWith('ADJ-')) ||
      sourceOrDest.includes('تسوية جرد')
  );

  const isMfg = Boolean(
    (transaction.reference_id &&
      (String(transaction.reference_id).startsWith('MFG-') ||
        String(transaction.reference_id).startsWith('REV-MFG-'))) ||
      (cleanNotes && (cleanNotes.includes('تصنيع') || cleanNotes.includes('تفكيك')))
  );

  // Active theme configuration
  const theme = isStocktaking
    ? {
        iconBox: 'bg-gradient-to-br from-indigo-50 to-indigo-100/80 text-indigo-600 border-indigo-200/60',
        badge: 'bg-indigo-50 text-indigo-700 border-indigo-200/70',
        dot: 'bg-indigo-500',
        label: isReceive ? 'تسوية فائض' : 'تسوية عجز',
        title: 'تفاصيل حركة تسوية الجرد',
        senderLabel: isReceive ? 'جهة التسليم (المصدر)' : 'الجهة المستلمة (الوجهة)',
        itemsLabel: 'بيانات الأصناف المسواة'
      }
    : isMfg
    ? {
        iconBox: 'bg-gradient-to-br from-violet-50 to-purple-100/80 text-violet-700 border-violet-200/60',
        badge: 'bg-violet-50 text-violet-700 border-violet-200/70',
        dot: 'bg-violet-500',
        label: 'تصنيع مجموعات',
        title: 'تفاصيل حركة تصنيع المستهلكات',
        senderLabel: 'الوجهة المستفيدة',
        itemsLabel: 'بيانات الأصناف والمكونات'
      }
    : isReceive
    ? {
        iconBox: 'bg-gradient-to-br from-emerald-50 to-emerald-100/80 text-emerald-600 border-emerald-200/60',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
        dot: 'bg-emerald-500 animate-pulse',
        label: 'إستلام وتوريد',
        title: 'تفاصيل الحركة المخزنية الواردة',
        senderLabel: 'جهة التسليم (المصدر)',
        itemsLabel: 'بيانات الأصناف الواردة'
      }
    : {
        iconBox: 'bg-gradient-to-br from-amber-50 to-amber-100/80 text-amber-600 border-amber-200/60',
        badge: 'bg-amber-50 text-amber-700 border-amber-200/70',
        dot: 'bg-amber-500 animate-pulse',
        label: 'صرف للأقسام',
        title: 'تفاصيل الحركة المخزنية الصادرة',
        senderLabel: 'الجهة المستلمة (الوجهة)',
        itemsLabel: 'بيانات الأصناف الصادرة'
      };

  // Resolve display items
  const displayItems =
    batchItems && batchItems.length > 0
      ? batchItems
      : transaction.item_name
      ? [transaction]
      : [];

  const hasExpiryColumn = displayItems.some((item) => item.expiry_date);
  const totalUnitsCount = displayItems.reduce(
    (sum, item) => sum + (parseFloat(item.quantity) || 0),
    0
  );
  const grandTotal = displayItems.reduce(
    (sum, item) =>
      sum + (parseFloat(item.unit_price) || 0) * (parseFloat(item.quantity) || 0),
    0
  );

  const formatQtyNum = (val) =>
    Number((parseFloat(val) || 0).toFixed(4)).toLocaleString();

  // Proportional column widths for Section 1 table (100% total)
  const getColWidths = () => {
    if (!hasExpiryColumn) {
      return { index: '5%', name: '35%', unit: '14%', qty: '15%', price: '15%', total: '16%' };
    }
    return { index: '5%', name: '29%', unit: '12%', qty: '13%', price: '14%', total: '14%', expiry: '13%' };
  };

  const colW = getColWidths();

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300"
        dir="rtl"
      >
        <div className="absolute inset-0" onClick={onClose} />

        {/* ── Modal Window Container (Exact Sizing & Proportions of BatchDetailsModal) ── */}
        <div
          className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/60 ${
            isFullscreen
              ? 'w-[98vw] h-[98vh] rounded-[2.5rem]'
              : 'w-full max-w-5xl h-full max-h-[90vh] rounded-[2rem]'
          }`}
        >
          {/* ── Modal Header (Adaptive Spacing & Sizing Matching BatchDetailsModal) ── */}
          <div
            className={`bg-white ${
              isFullscreen ? 'px-6 sm:px-8 py-3.5 sm:py-4' : 'px-5 sm:px-6 py-3.5'
            } flex items-center justify-between gap-3 border-b border-slate-100 shrink-0 z-20 transition-all duration-300`}
          >
            {/* Right: Icon + Title + Status Badge */}
            <div
              className={`flex items-center ${
                isFullscreen ? 'gap-3.5 sm:gap-4' : 'gap-3 sm:gap-3.5'
              }`}
            >
              <div
                className={`${
                  isFullscreen
                    ? 'w-11 h-11 sm:w-12 sm:h-12 rounded-xl'
                    : 'w-10 h-10 sm:w-11 sm:h-11 rounded-xl'
                } flex items-center justify-center shadow-inner border shrink-0 ${theme.iconBox}`}
              >
                {isReceive ? (
                  <ArrowDownToLine size={isFullscreen ? 22 : 20} strokeWidth={2} />
                ) : (
                  <ArrowUpFromLine size={isFullscreen ? 22 : 20} strokeWidth={2} />
                )}
              </div>

              <div className="flex items-center flex-wrap gap-2.5">
                <h2
                  className={`${
                    isFullscreen ? 'text-lg sm:text-xl' : 'text-base sm:text-lg'
                  } font-black text-slate-800 tracking-tight leading-none`}
                >
                  {theme.title}
                </h2>

                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black border shadow-2xs select-none ${theme.badge}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${theme.dot}`} />
                  <span>{theme.label}</span>
                </span>
              </div>
            </div>

            {/* Left: Window Control Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className={`${
                  isFullscreen ? 'w-9 h-9' : 'w-8 h-8'
                } flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-xl transition-all border border-slate-200/80 shadow-2xs cursor-pointer active:scale-95`}
                title={isFullscreen ? 'تصغير النافذة' : 'تكبير النافذة'}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className={`${
                  isFullscreen ? 'w-9 h-9' : 'w-8 h-8'
                } flex items-center justify-center bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100 rounded-xl transition-all border border-slate-200/80 shadow-2xs cursor-pointer active:scale-95`}
                title="إغلاق"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* ── Scrollable Body Workspace (Full-Width Adaptive Layout Matching BatchDetailsModal) ── */}
          <div
            className={`flex-1 overflow-y-auto ${
              isFullscreen ? 'p-6 sm:p-8' : 'p-5 sm:p-6'
            } custom-scrollbar bg-slate-50/40`}
          >
            <div className={`w-full ${isFullscreen ? 'space-y-6' : 'space-y-5'}`}>
              {/* ── Section 1: Items Data Table (Proportional 100% Width) ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-100/80 rounded-lg text-indigo-600 shadow-sm">
                      <Package size={isFullscreen ? 18 : 16} />
                    </div>
                    <h3
                      className={`${
                        isFullscreen ? 'text-sm sm:text-base' : 'text-sm'
                      } font-black text-slate-700`}
                    >
                      {theme.itemsLabel}
                    </h3>
                    <span className="text-xs px-2.5 py-0.5 font-black bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200/60">
                      {formatArabicItemsCount(displayItems.length || 0)}
                    </span>
                  </div>

                  {totalUnitsCount > 0 && (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-white px-3 py-1 rounded-xl border border-slate-200/70 shadow-2xs">
                      <span>مجموع الكميات:</span>
                      <span
                        className={`font-black ${
                          isReceive ? 'text-emerald-600' : 'text-amber-600'
                        }`}
                        dir="ltr"
                      >
                        {isReceive ? '+' : '-'}
                        {formatQtyNum(totalUnitsCount)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-right text-sm whitespace-nowrap table-fixed">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th
                            style={{ width: colW.index }}
                            className="px-2 py-3.5 text-xs font-bold text-slate-500 text-center"
                          >
                            #
                          </th>
                          <th
                            style={{ width: colW.name }}
                            className="px-4 py-3.5 text-xs font-bold text-slate-500 text-right"
                          >
                            اسم الصنف
                          </th>
                          <th
                            style={{ width: colW.unit }}
                            className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center"
                          >
                            نوع الصنف
                          </th>
                          <th
                            style={{ width: colW.qty }}
                            className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center"
                          >
                            الكمية
                          </th>
                          <th
                            style={{ width: colW.price }}
                            className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center"
                          >
                            سعر الوحدة
                          </th>
                          <th
                            style={{ width: colW.total }}
                            className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center"
                          >
                            الإجمالي
                          </th>
                          {hasExpiryColumn && (
                            <th
                              style={{ width: colW.expiry }}
                              className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center"
                            >
                              تاريخ الانتهاء
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {batchLoading ? (
                          <tr>
                            <td
                              colSpan={hasExpiryColumn ? 7 : 6}
                              className="px-5 py-8 text-center text-slate-400 font-bold text-sm"
                            >
                              جاري تحميل بيانات الأصناف...
                            </td>
                          </tr>
                        ) : displayItems.length > 0 ? (
                          displayItems.map((item, idx) => {
                            const itemIsReceive = item.transaction_type
                              ? item.transaction_type === 'in'
                              : isReceive;
                            const qty = parseFloat(item.quantity) || 0;
                            const unitPrice = parseFloat(item.unit_price) || 0;
                            const rowTotal = unitPrice * qty;

                            return (
                              <tr
                                key={item.id || idx}
                                className="hover:bg-slate-50/60 transition-colors"
                              >
                                {/* 1. الترقيم */}
                                <td
                                  style={{ width: colW.index }}
                                  className={`px-2 ${
                                    isFullscreen ? 'py-4' : 'py-3.5'
                                  } text-xs font-black text-slate-400 text-center align-middle`}
                                >
                                  {idx + 1}
                                </td>

                                {/* 2. اسم الصنف */}
                                <td
                                  style={{ width: colW.name }}
                                  className={`px-4 ${
                                    isFullscreen ? 'py-4' : 'py-3.5'
                                  } align-middle`}
                                >
                                  <span
                                    className={`font-black text-slate-800 ${
                                      isFullscreen
                                        ? 'text-sm sm:text-base'
                                        : 'text-sm'
                                    } truncate block`}
                                    title={item.item_name}
                                  >
                                    {item.item_name}
                                  </span>
                                </td>

                                {/* 3. نوع الصنف */}
                                <td
                                  style={{ width: colW.unit }}
                                  className={`px-3 ${
                                    isFullscreen ? 'py-4' : 'py-3.5'
                                  } text-center align-middle`}
                                >
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs">
                                    {item.item_unit || item.unit || 'وحدة'}
                                  </span>
                                </td>

                                {/* 4. الكمية */}
                                <td
                                  style={{ width: colW.qty }}
                                  className={`px-3 ${
                                    isFullscreen ? 'py-4' : 'py-3.5'
                                  } text-center align-middle`}
                                >
                                  <span
                                    className={`inline-flex items-center justify-center px-3 py-1 rounded-xl font-black ${
                                      isFullscreen
                                        ? 'text-base sm:text-lg'
                                        : 'text-base'
                                    } ${
                                      itemIsReceive
                                        ? 'text-emerald-600 bg-emerald-50/80 border border-emerald-200/60'
                                        : 'text-amber-600 bg-amber-50/80 border border-amber-200/60'
                                    }`}
                                    dir="ltr"
                                  >
                                    {itemIsReceive ? '+' : '-'}
                                    {formatQtyNum(qty)}
                                  </span>
                                </td>

                                {/* 5. سعر الوحدة */}
                                <td
                                  style={{ width: colW.price }}
                                  className={`px-3 ${
                                    isFullscreen ? 'py-4' : 'py-3.5'
                                  } font-semibold text-slate-700 text-center align-middle`}
                                >
                                  <span dir="ltr" className="font-bold text-slate-700">
                                    {unitPrice.toLocaleString()}
                                  </span>
                                  <span className="text-[10px] text-slate-400 mr-1">
                                    ر.ي
                                  </span>
                                </td>

                                {/* 6. الإجمالي */}
                                <td
                                  style={{ width: colW.total }}
                                  className={`px-3 ${
                                    isFullscreen ? 'py-4' : 'py-3.5'
                                  } font-bold text-slate-800 text-center align-middle`}
                                >
                                  <span dir="ltr" className="font-black text-slate-800">
                                    {rowTotal.toLocaleString()}
                                  </span>
                                  <span className="text-[10px] text-slate-400 mr-1">
                                    ر.ي
                                  </span>
                                </td>

                                {/* 7. تاريخ الانتهاء */}
                                {hasExpiryColumn && (
                                  <td
                                    style={{ width: colW.expiry }}
                                    className={`px-3 ${
                                      isFullscreen ? 'py-4' : 'py-3.5'
                                    } font-semibold text-slate-600 text-center align-middle`}
                                    dir="ltr"
                                  >
                                    {item.expiry_date ? (
                                      new Date(item.expiry_date).toLocaleDateString(
                                        'en-GB'
                                      )
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  {/* Horizontal Footer for Financial Total */}
                  <div
                    className={`flex items-center justify-between px-6 py-4 border-t mt-auto ${
                      isReceive
                        ? 'bg-emerald-50/50 border-emerald-100/60'
                        : 'bg-amber-50/50 border-amber-100/60'
                    }`}
                  >
                    <span
                      className={`text-xs font-bold ${
                        isReceive ? 'text-emerald-800' : 'text-amber-800'
                      }`}
                    >
                      إجمالي القيمة:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        dir="ltr"
                        className={`text-base font-black tracking-tight ${
                          isReceive ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {grandTotal.toLocaleString()}
                      </span>
                      <span
                        className={`text-xs font-bold ${
                          isReceive ? 'text-emerald-600' : 'text-amber-600'
                        }`}
                      >
                        ر.ي
                      </span>
                      {grandTotal > 0 && (
                        <span
                          className={`text-xs font-bold mr-1.5 pr-2 border-r ${
                            isReceive
                              ? 'text-emerald-700/70 border-emerald-200/60'
                              : 'text-amber-700/70 border-amber-200/60'
                          }`}
                        >
                          {taffyot(grandTotal)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Section 2: Movement Details (Smart Proportional Layout 100% Total) ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <div className="p-1.5 bg-sky-100/80 rounded-lg text-sky-700 shadow-sm">
                    <FileText size={isFullscreen ? 18 : 16} />
                  </div>
                  <h3
                    className={`${
                      isFullscreen ? 'text-sm sm:text-base' : 'text-sm'
                    } font-black text-slate-700`}
                  >
                    تفاصيل الحركة
                  </h3>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-right text-sm table-fixed">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          {/* 1. المصدر / الوجهة: 22% مع مرفق | 26% بدون مرفق */}
                          <th
                            style={{ width: invoiceUrl ? '22%' : '26%' }}
                            className={`${
                              invoiceUrl ? 'w-[22%]' : 'w-[26%]'
                            } px-4 py-3.5 text-xs font-bold text-slate-500 text-right whitespace-nowrap`}
                          >
                            {theme.senderLabel}
                          </th>

                          {/* 2. التاريخ والوقت: 22% مع مرفق | 26% بدون مرفق */}
                          <th
                            style={{ width: invoiceUrl ? '22%' : '26%' }}
                            className={`${
                              invoiceUrl ? 'w-[22%]' : 'w-[26%]'
                            } px-4 py-3.5 text-xs font-bold text-slate-500 text-center whitespace-nowrap`}
                          >
                            التاريخ والوقت
                          </th>

                          {/* 3. الملاحظات: 44% مع مرفق | 48% بدون مرفق */}
                          <th
                            style={{ width: invoiceUrl ? '44%' : '48%' }}
                            className={`${
                              invoiceUrl ? 'w-[44%]' : 'w-[48%]'
                            } px-4 py-3.5 text-xs font-bold text-slate-500 text-right`}
                          >
                            الملاحظات
                          </th>

                          {/* 4. مستند مرفق: 12% (يظهر فقط عند وجود مستند) */}
                          {invoiceUrl && (
                            <th
                              style={{ width: '12%' }}
                              className="w-[12%] px-3 py-3.5 text-xs font-bold text-slate-500 text-center whitespace-nowrap"
                            >
                              مستند مرفق
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        <tr className="hover:bg-slate-50/50 transition-colors">
                          {/* 1. المصدر / الوجهة */}
                          <td
                            style={{ width: invoiceUrl ? '22%' : '26%' }}
                            className={`${invoiceUrl ? 'w-[22%]' : 'w-[26%]'} px-4 ${
                              isFullscreen ? 'py-4' : 'py-3.5'
                            } font-black text-slate-800 align-middle whitespace-nowrap`}
                          >
                            <span className="inline-flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  isReceive ? 'bg-emerald-500' : 'bg-amber-500'
                                }`}
                              />
                              <span>{sourceOrDest}</span>
                            </span>
                          </td>

                          {/* 2. التاريخ والوقت */}
                          <td
                            style={{ width: invoiceUrl ? '22%' : '26%' }}
                            className={`${invoiceUrl ? 'w-[22%]' : 'w-[26%]'} px-4 ${
                              isFullscreen ? 'py-4' : 'py-3.5'
                            } text-center align-middle whitespace-nowrap`}
                          >
                            <div className="flex flex-col items-center" dir="ltr">
                              <span className="text-xs font-bold text-slate-700">
                                {formatDateEn(transaction.created_at)}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400">
                                {formatTimeEn(transaction.created_at)}
                              </span>
                            </div>
                          </td>

                          {/* 3. الملاحظات */}
                          <td
                            style={{ width: invoiceUrl ? '44%' : '48%' }}
                            className={`${invoiceUrl ? 'w-[44%]' : 'w-[48%]'} px-4 ${
                              isFullscreen ? 'py-4' : 'py-3.5'
                            } font-semibold text-slate-600 whitespace-pre-wrap break-words align-middle`}
                            title={typeof cleanNotes === 'string' ? cleanNotes : ''}
                          >
                            {parsedSurgeryNotes ? (
                              <div className="flex flex-col gap-0.5 py-0.5 text-right">
                                <span className="font-extrabold text-slate-800 text-xs leading-relaxed">
                                  {parsedSurgeryNotes.title}
                                </span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-slate-700 text-xs leading-relaxed">
                                    للمريض {parsedSurgeryNotes.patient}
                                  </span>
                                  {parsedSurgeryNotes.visit && (
                                    <span
                                      className={`font-black text-xs leading-relaxed ${
                                        isReceive ? 'text-emerald-600' : 'text-amber-600'
                                      }`}
                                    >
                                      ({parsedSurgeryNotes.visit})
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              cleanNotes || 'لا توجد ملاحظات إضافية مرفقة'
                            )}
                          </td>

                          {/* 4. مستند مرفق (أيقونة العين مدمجة داخل الجدول) */}
                          {invoiceUrl && (
                            <td
                              style={{ width: '12%' }}
                              className={`w-[12%] px-3 ${
                                isFullscreen ? 'py-4' : 'py-3.5'
                              } text-center align-middle whitespace-nowrap`}
                            >
                              <button
                                type="button"
                                onClick={() => setShowFilePreview(true)}
                                className="p-2 text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 rounded-xl transition-all border border-indigo-100 shadow-sm cursor-pointer active:scale-95 inline-flex items-center justify-center"
                                title="عرض المستند المرفق"
                              >
                                <Eye size={16} />
                              </button>
                            </td>
                          )}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Floating Action Footer (Matching BatchDetailsModal & PatientDetailPanel) ── */}
          <div
            className={`${
              isFullscreen ? 'px-6 sm:px-8 py-4' : 'px-6 py-3.5'
            } bg-white border-t border-slate-100 z-20 flex-shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]`}
          >
            <div className="flex justify-between items-center gap-4">
              <div className="text-xs font-bold text-slate-400 hidden sm:block flex-1">
                <span className="flex items-center gap-2 text-slate-500">
                  <CheckCircle
                    size={15}
                    className={isReceive ? 'text-emerald-500' : 'text-amber-500'}
                  />
                  {isStocktaking
                    ? isReceive
                      ? 'تم اعتماد جلسة الجرد وتسجيل فائض الأصناف وإيداعها في رصيد المخزن.'
                      : 'تم اعتماد جلسة الجرد وتسجيل عجز الأصناف وخصمها من رصيد المخزن.'
                    : isMfg
                    ? 'تم تسجيل حركة تصنيع المستهلكات وتحديث رصيد الحزم والمكونات.'
                    : isReceive
                    ? 'تم تأكيد استلام وتوريد هذه الحركة وإيداع أصنافها في رصيد المخزن.'
                    : 'تم تأكيد صرف هذه الحركة وخصم كمياتها من رصيد المخزن.'}
                </span>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-none bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 font-black py-2 px-6 rounded-xl transition-all active:scale-95 cursor-pointer text-xs sm:text-sm"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showFilePreview && invoiceUrl && (
        <DocumentPreviewOverlay
          fileUrl={invoiceUrl}
          onClose={() => setShowFilePreview(false)}
        />
      )}
    </>,
    document.body
  );
};

// ── المكون الفرعي لعارض المستندات (Shared Preview Component) ──
export const DocumentPreviewOverlay = ({ fileUrl, fileType, onClose }) => {
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);

  if (!fileUrl) return null;

  const isPdf = fileType
    ? fileType.includes('pdf')
    : fileUrl.toLowerCase().endsWith('.pdf');
  const base = getServerBaseUrl();
  const cleanPath = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
  const fullUrl =
    fileUrl.startsWith('http') || fileUrl.startsWith('blob:') || fileUrl.startsWith('data:')
      ? fileUrl
      : `${base}${cleanPath}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[100020] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300"
      dir="rtl"
    >
      <div
        className={`bg-white rounded-3xl shadow-luxury flex flex-col overflow-hidden transition-all duration-300 ${
          isPreviewMaximized ? 'w-[98vw] h-[98vh]' : 'w-full max-w-4xl h-[80vh]'
        }`}
      >
        <div className="flex justify-between items-center p-4 border-b bg-slate-50 flex-shrink-0">
          <h3 className="font-black text-slate-800">عرض المرفق</h3>
          <div className="flex items-center gap-2">
            <a
              href={fullUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors text-xs font-bold flex items-center gap-1.5"
            >
              <ExternalLink size={14} /> فتح في نافذة مستقلة
            </a>
            <button
              onClick={() => setIsPreviewMaximized(!isPreviewMaximized)}
              className="p-2 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
            >
              {isPreviewMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-100 flex items-center justify-center overflow-hidden p-4 relative">
          {isPdf ? (
            <iframe
              src={fullUrl}
              className="w-full h-full rounded-xl border border-slate-200 bg-white shadow-inner"
              title="Document Preview"
            />
          ) : (
            <div className="w-full h-full overflow-auto flex items-center justify-center custom-scrollbar">
              <img
                src={fullUrl}
                className="max-w-full max-h-full object-contain rounded-2xl shadow-md bg-white p-2"
                alt="Medical Result"
              />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TransactionDetailsModal;
