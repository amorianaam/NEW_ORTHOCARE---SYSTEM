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
  XCircle,
  Loader2,
  Calendar,
  Clock,
  AlertCircle
} from 'lucide-react';
import { DocumentPreviewOverlay } from './TransactionDetailsModal';
import taffyot from '../../utils/taffyot';
import { formatArabicItemsCount } from '../../utils/arabicFormatters';

// ── English Date & Time Helpers (Matching RadiologyModals) ──────────────────
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

const BatchDetailsModal = ({
  isOpen,
  onClose,
  batch,
  mode = 'inbound', // 'inbound' | 'outbound'
  themeColor = 'amber',

  // Handlers
  onAccept,
  onReject,
  onRevoke,

  // States
  isProcessing = false,
  rejectingBatch,
  setRejectingBatch,
  rejectionReason,
  setRejectionReason,
  hideFinancials = false,
  readOnly = false
}) => {
  const [isFullscreen, setIsFullscreen] = useState(() => {
    return localStorage.getItem('storeModalFullscreen') === 'true';
  });
  const [showFilePreview, setShowFilePreview] = useState(false);

  useEffect(() => {
    localStorage.setItem('storeModalFullscreen', isFullscreen);
  }, [isFullscreen]);

  if (!isOpen || !batch) return null;

  const isRejected = batch.status === 'rejected';
  const isReceived = batch.status === 'received';

  const texts =
    mode === 'inbound'
      ? {
          title: 'تفاصيل الشحنة الواردة',
          subtitle: readOnly
            ? isRejected
              ? 'تم رفض الشحنة وإرجاعها للمخزن المرسل'
              : 'تم تأكيد استلام الشحنة وإيداعها في المخزن'
            : 'بانتظار إجراءات المراجعة والاستلام',
          itemsLabel: 'بيانات الأصناف الواردة',
          senderLabel: 'المصدر/المرسل',
          quantityLabel: 'الكمية الواردة'
        }
      : {
          title: 'تفاصيل الشحنة الصادرة',
          subtitle: 'بانتظار تأكيد الاستلام من الجهة الأخرى',
          itemsLabel: 'بيانات الأصناف الصادرة',
          senderLabel: 'الوجهة المستفيدة',
          quantityLabel: 'الكمية المُرسلة'
        };

  const themes = {
    amber: {
      iconBox: 'bg-gradient-to-br from-amber-50 to-amber-100/80 text-amber-600 border-amber-200/60',
      badge: 'bg-amber-50 text-amber-700 border-amber-200/70',
      dot: 'bg-amber-500 animate-pulse'
    },
    emerald: {
      iconBox: 'bg-gradient-to-br from-emerald-50 to-emerald-100/80 text-emerald-600 border-emerald-200/60',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
      dot: 'bg-emerald-500'
    },
    sky: {
      iconBox: 'bg-gradient-to-br from-sky-50 to-blue-100/80 text-sky-700 border-sky-200/60',
      badge: 'bg-sky-50 text-sky-700 border-sky-200/70',
      dot: 'bg-sky-500'
    },
    violet: {
      iconBox: 'bg-gradient-to-br from-violet-50 to-purple-100/80 text-violet-700 border-violet-200/60',
      badge: 'bg-violet-50 text-violet-700 border-violet-200/70',
      dot: 'bg-violet-500 animate-pulse'
    }
  };

  const activeTheme = readOnly
    ? isRejected
      ? {
          iconBox: 'bg-gradient-to-br from-rose-50 to-rose-100/80 text-rose-600 border-rose-200/60',
          badge: 'bg-rose-50 text-rose-700 border-rose-200/70',
          dot: 'bg-rose-500'
        }
      : themes.emerald
    : themes[themeColor] || themes.amber;

  const extractInvoiceUrl = (notes) => {
    if (!notes) return null;
    const match = notes.match(/\/uploads\/(generalStore|orStore)\/[^\s|]+/);
    return match ? match[0] : null;
  };

  const invoiceUrl = extractInvoiceUrl(batch.batch_notes);

  let cleanNotes = batch.batch_notes || '';
  if (cleanNotes.includes('مرفق الفاتورة:')) {
    cleanNotes = cleanNotes.split('مرفق الفاتورة:')[0].trim();
  } else if (cleanNotes.includes('مرفق المستند:')) {
    cleanNotes = cleanNotes.split('مرفق المستند:')[0].trim();
  }
  cleanNotes = cleanNotes.replace(/\|\s*$/, '').trim();

  const cleanSenderName = (
    batch.store_name ||
    batch.sender_name ||
    batch.sent_by_name ||
    'المخزن العام'
  )
    .replace(/\s*\([^)]*\)\s*/g, '')
    .trim();

  const itemsList = batch.items || [];
  const hasExpiryColumn = itemsList.some((i) => i.expiry_date);
  const showPriceColumn = !hideFinancials;

  const getItemPrice = (item) => parseFloat(item.cost_price ?? item.unit_price ?? 0) || 0;
  const getItemQty = (item) => parseFloat(item.sent_quantity ?? item.quantity ?? 0) || 0;
  const formatQtyNum = (val) => Number((parseFloat(val) || 0).toFixed(4)).toLocaleString();

  const grandTotal =
    itemsList.reduce(
      (sum, item) => sum + getItemPrice(item) * getItemQty(item),
      0
    ) || 0;

  const totalUnitsCount = itemsList.reduce(
    (sum, item) => sum + getItemQty(item),
    0
  );

  // Proportional column widths for Section 1 table (100% total)
  const getColWidths = () => {
    if (!showPriceColumn && !hasExpiryColumn) {
      return { index: '6%', name: '46%', unit: '24%', qty: '24%' };
    }
    if (!showPriceColumn && hasExpiryColumn) {
      return { index: '6%', name: '38%', unit: '18%', qty: '19%', expiry: '19%' };
    }
    if (showPriceColumn && !hasExpiryColumn) {
      return { index: '5%', name: '35%', unit: '14%', qty: '15%', price: '15%', total: '16%' };
    }
    return { index: '5%', name: '29%', unit: '12%', qty: '13%', price: '14%', total: '14%', expiry: '13%' };
  };

  const colW = getColWidths();
  const displayTimestamp = batch.resolved_at || batch.sent_at;

  const handleSafeClose = () => {
    if (!isProcessing) {
      setRejectingBatch?.(null);
      setRejectionReason?.('');
      onClose();
    }
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[99990] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300"
        dir="rtl"
      >
        <div className="absolute inset-0" onClick={handleSafeClose} />

        {/* ── Modal Window Container (Exact Sizing & Proportions of PatientDetailPanel) ── */}
        <div
          className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/60 ${
            isFullscreen
              ? 'w-[98vw] h-[98vh] rounded-[2.5rem]'
              : 'w-full max-w-5xl h-full max-h-[90vh] rounded-[2rem]'
          }`}
        >
          {/* ── Modal Header (Adaptive Spacing & Sizing Matching PatientDetailPanel) ── */}
          <div
            className={`bg-white ${
              isFullscreen ? 'px-6 sm:px-8 py-3.5 sm:py-4' : 'px-5 sm:px-6 py-3.5'
            } flex items-center justify-between gap-3 border-b border-slate-100 shrink-0 z-20 transition-all duration-300`}
          >
            {/* Right: Icon + Title + Status Badge */}
            <div className={`flex items-center ${isFullscreen ? 'gap-3.5 sm:gap-4' : 'gap-3 sm:gap-3.5'}`}>
              <div
                className={`${
                  isFullscreen ? 'w-11 h-11 sm:w-12 sm:h-12 rounded-xl' : 'w-10 h-10 sm:w-11 sm:h-11 rounded-xl'
                } flex items-center justify-center shadow-inner border shrink-0 ${activeTheme.iconBox}`}
              >
                {mode === 'inbound' ? (
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
                  {texts.title}
                </h2>

                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black border shadow-2xs select-none ${activeTheme.badge}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeTheme.dot}`} />
                  <span>
                    {readOnly
                      ? isRejected
                        ? 'مرفوضة'
                        : isReceived
                        ? 'تم الاستلام'
                        : 'قيد الانتظار'
                      : 'قيد الانتظار'}
                  </span>
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
                onClick={handleSafeClose}
                disabled={!!isProcessing}
                className={`${
                  isFullscreen ? 'w-9 h-9' : 'w-8 h-8'
                } flex items-center justify-center bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100 rounded-xl transition-all border border-slate-200/80 shadow-2xs disabled:opacity-50 cursor-pointer active:scale-95`}
                title="إغلاق"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* ── Scrollable Body Workspace (Full-Width Adaptive Layout Matching PatientDetailPanel) ── */}
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
                    <h3 className={`${isFullscreen ? 'text-sm sm:text-base' : 'text-sm'} font-black text-slate-700`}>
                      {texts.itemsLabel}
                    </h3>
                    <span className="text-xs px-2.5 py-0.5 font-black bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200/60">
                      {formatArabicItemsCount(itemsList.length || batch.item_count || 0)}
                    </span>
                  </div>

                  {totalUnitsCount > 0 && (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-white px-3 py-1 rounded-xl border border-slate-200/70 shadow-2xs">
                      <span>مجموع الكميات:</span>
                      <span
                        className={`font-black ${isRejected ? 'text-rose-600' : 'text-emerald-600'}`}
                        dir="ltr"
                      >
                        +{formatQtyNum(totalUnitsCount)}
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
                            {texts.quantityLabel}
                          </th>
                          {showPriceColumn && (
                            <th
                              style={{ width: colW.price }}
                              className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center"
                            >
                              سعر الوحدة
                            </th>
                          )}
                          {showPriceColumn && (
                            <th
                              style={{ width: colW.total }}
                              className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center"
                            >
                              الإجمالي
                            </th>
                          )}
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
                        {itemsList.map((item, idx) => {
                          const qty = getItemQty(item);
                          const unitPrice = getItemPrice(item);
                          const rowTotal = unitPrice * qty;
                          const unitDisplay =
                            item.film_type === 'large'
                              ? 'فيلم كبير'
                              : item.film_type === 'small'
                              ? 'فيلم صغير'
                              : item.unit || item.item_unit || '—';

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
                                className={`px-4 ${isFullscreen ? 'py-4' : 'py-3.5'} align-middle`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                      isRejected ? 'bg-rose-500' : 'bg-emerald-500'
                                    }`}
                                  />
                                  <span
                                    className={`font-black text-slate-800 ${
                                      isFullscreen ? 'text-sm sm:text-base' : 'text-sm'
                                    } truncate`}
                                    title={item.item_name}
                                  >
                                    {item.item_name}
                                  </span>
                                </div>
                              </td>

                              {/* 3. نوع الصنف */}
                              <td
                                style={{ width: colW.unit }}
                                className={`px-3 ${
                                  isFullscreen ? 'py-4' : 'py-3.5'
                                } text-center align-middle`}
                              >
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs">
                                  {unitDisplay}
                                </span>
                              </td>

                              {/* 4. الكمية الواردة */}
                              <td
                                style={{ width: colW.qty }}
                                className={`px-3 ${
                                  isFullscreen ? 'py-4' : 'py-3.5'
                                } text-center align-middle`}
                              >
                                <span
                                  className={`inline-flex items-center justify-center px-3 py-1 rounded-xl font-black ${
                                    isFullscreen ? 'text-base sm:text-lg' : 'text-base'
                                  } ${
                                    isRejected
                                      ? 'text-rose-600 bg-rose-50/80 border border-rose-200/60'
                                      : 'text-emerald-600 bg-emerald-50/80 border border-emerald-200/60'
                                  }`}
                                  dir="ltr"
                                >
                                  +{formatQtyNum(qty)}
                                </span>
                              </td>

                              {/* 5. سعر الوحدة (للمدير والمخازن فقط) */}
                              {showPriceColumn && (
                                <td
                                  style={{ width: colW.price }}
                                  className={`px-3 ${
                                    isFullscreen ? 'py-4' : 'py-3.5'
                                  } font-semibold text-slate-700 text-center align-middle`}
                                >
                                  <span dir="ltr" className="font-bold text-slate-700">
                                    {unitPrice.toLocaleString()}
                                  </span>
                                  <span className="text-[10px] text-slate-400 mr-1">ر.ي</span>
                                </td>
                              )}

                              {/* 6. الإجمالي (سعر الوحدة × الكمية) */}
                              {showPriceColumn && (
                                <td
                                  style={{ width: colW.total }}
                                  className={`px-3 ${
                                    isFullscreen ? 'py-4' : 'py-3.5'
                                  } font-bold text-slate-800 text-center align-middle`}
                                >
                                  <span dir="ltr" className="font-black text-slate-800">
                                    {rowTotal.toLocaleString()}
                                  </span>
                                  <span className="text-[10px] text-slate-400 mr-1">ر.ي</span>
                                </td>
                              )}

                              {/* 7. تاريخ الانتهاء (اختياري) */}
                              {hasExpiryColumn && (
                                <td
                                  style={{ width: colW.expiry }}
                                  className={`px-3 ${
                                    isFullscreen ? 'py-4' : 'py-3.5'
                                  } font-semibold text-slate-600 text-center align-middle`}
                                  dir="ltr"
                                >
                                  {item.expiry_date ? (
                                    new Date(item.expiry_date).toLocaleDateString('en-GB')
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Horizontal Footer for Financial Total */}
                  {!hideFinancials && (
                    <div className="flex items-center justify-between px-6 py-4 border-t mt-auto bg-emerald-50/50 border-emerald-100/60">
                      <span className="text-xs font-bold text-emerald-800">إجمالي القيمة:</span>
                      <div className="flex items-center gap-1.5">
                        <span dir="ltr" className="text-base font-black tracking-tight text-emerald-700">
                          {grandTotal.toLocaleString()}
                        </span>
                        <span className="text-xs font-bold text-emerald-600">ر.ي</span>
                        {grandTotal > 0 && (
                          <span className="text-xs font-bold mr-1.5 pr-2 border-r text-emerald-700/70 border-emerald-200/60">
                            {taffyot(grandTotal)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Section 2: Movement Details (Smart Proportional Layout 100% Total) ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <div className="p-1.5 bg-sky-100/80 rounded-lg text-sky-700 shadow-sm">
                    <FileText size={isFullscreen ? 18 : 16} />
                  </div>
                  <h3 className={`${isFullscreen ? 'text-sm sm:text-base' : 'text-sm'} font-black text-slate-700`}>
                    تفاصيل الحركة
                  </h3>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-right text-sm table-fixed">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          {/* 1. المصدر / المرسل: 22% مع مرفق | 26% بدون مرفق */}
                          <th
                            style={{ width: invoiceUrl ? '22%' : '26%' }}
                            className={`${
                              invoiceUrl ? 'w-[22%]' : 'w-[26%]'
                            } px-4 py-3.5 text-xs font-bold text-slate-500 text-right whitespace-nowrap`}
                          >
                            {texts.senderLabel}
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

                          {/* 3. الملاحظات: 44% مع مرفق | 48% بدون مرفق (متوافق مع تقسيم جدول الأصناف 52% / 48%) */}
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
                          {/* 1. المصدر / المرسل */}
                          <td
                            style={{ width: invoiceUrl ? '22%' : '26%' }}
                            className={`${invoiceUrl ? 'w-[22%]' : 'w-[26%]'} px-4 ${
                              isFullscreen ? 'py-4' : 'py-3.5'
                            } font-black text-slate-800 align-middle whitespace-nowrap`}
                          >
                            <span className="inline-flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                              <span>{cleanSenderName}</span>
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
                                {formatDateEn(displayTimestamp)}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400">
                                {formatTimeEn(displayTimestamp)}
                              </span>
                            </div>
                          </td>

                          {/* 3. الملاحظات */}
                          <td
                            style={{ width: invoiceUrl ? '44%' : '48%' }}
                            className={`${invoiceUrl ? 'w-[44%]' : 'w-[48%]'} px-4 ${
                              isFullscreen ? 'py-4' : 'py-3.5'
                            } font-semibold text-slate-600 whitespace-pre-wrap break-words align-middle`}
                            title={cleanNotes}
                          >
                            {cleanNotes || 'لا توجد ملاحظات إضافية مرفقة'}
                          </td>

                          {/* 4. مستند مرفق (أيقونة فقط) */}
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

              {/* ── سبب الرفض خارج قسم تفاصيل الحركة (بدون إطار وباللون الأحمر) ── */}
              {isRejected && batch.rejection_reason && (
                <div className="flex items-start gap-2 px-2 pt-0.5 text-red-600 animate-in fade-in duration-200">
                  <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm leading-relaxed">
                    <span className="font-black ml-1.5">سبب الرفض:</span>
                    <span className="font-bold">{batch.rejection_reason}</span>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Floating Action Footer (Matching PatientDetailPanel Footer) ── */}
          <div
            className={`${
              isFullscreen ? 'px-6 sm:px-8 py-4' : 'px-6 py-3.5'
            } bg-white border-t border-slate-100 z-20 flex-shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]`}
          >
            {readOnly ? (
              <div className="flex justify-between items-center gap-4">
                <div className="text-xs font-bold text-slate-400 hidden sm:block flex-1">
                  {isRejected ? (
                    <span className="flex items-center gap-2 text-rose-600">
                      <XCircle size={15} /> تم رفض هذه الشحنة وإرجاعها إلى {cleanSenderName}.
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-emerald-600">
                      <CheckCircle size={15} /> تم تأكيد استلام هذه الشحنة وإيداع أصنافها في رصيد المخزن.
                    </span>
                  )}
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
            ) : mode === 'outbound' ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onRevoke(batch.batch_ref_key)}
                  disabled={isProcessing}
                  className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 disabled:opacity-50 text-white py-2.5 px-5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(220,38,38,0.2)] cursor-pointer active:scale-95"
                >
                  {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <XCircle size={18} />}
                  سحب وإلغاء الشحنة
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isProcessing}
                  className="bg-white border-2 border-slate-200 hover:bg-slate-50 text-slate-700 disabled:opacity-50 py-2 px-6 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  إغلاق
                </button>
              </div>
            ) : rejectingBatch === batch.batch_ref_key ? (
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <textarea
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 resize-none transition-all"
                  rows="2"
                  placeholder="اكتب سبب رفض هذه الشحنة بالكامل هنا..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => onReject(batch.batch_ref_key)}
                    disabled={isProcessing || !rejectionReason.trim()}
                    className="flex-1 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(220,38,38,0.2)] cursor-pointer active:scale-95"
                  >
                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                    تأكيد الرفض والإرجاع
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingBatch?.(null);
                      setRejectionReason?.('');
                    }}
                    disabled={isProcessing}
                    className="w-auto px-6 bg-white border-2 border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl flex items-center justify-center font-black text-xs sm:text-sm transition-all cursor-pointer active:scale-95"
                  >
                    تراجع
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
                <div className="text-xs font-bold text-slate-400 hidden lg:block flex-1">
                  <span className="flex items-center gap-2 text-amber-600">
                    <Clock size={15} /> يرجى التحقق من الأصناف والكميات الواردة قبل تأكيد الاستلام أو الرفض.
                  </span>
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => onAccept(batch.batch_ref_key)}
                    disabled={isProcessing}
                    className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 text-white py-2.5 px-6 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(16,185,129,0.2)] cursor-pointer active:scale-95"
                  >
                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                    استلام الدفعة بالكامل
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectingBatch(batch.batch_ref_key)}
                    disabled={isProcessing}
                    className="px-5 bg-white border-2 border-red-200 hover:bg-red-50 text-red-600 disabled:opacity-50 py-2 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <XCircle size={15} />
                    رفض الدفعة
                  </button>
                  <button
                    type="button"
                    onClick={handleSafeClose}
                    disabled={isProcessing}
                    className="px-5 bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 py-2 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center cursor-pointer active:scale-95"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showFilePreview && invoiceUrl && (
        <DocumentPreviewOverlay fileUrl={invoiceUrl} onClose={() => setShowFilePreview(false)} />
      )}
    </>,
    document.body
  );
};

export default BatchDetailsModal;

