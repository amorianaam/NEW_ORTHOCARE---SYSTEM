import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Layers, Maximize2, Minimize2, X, ArrowDownLeft, RotateCcw,
  ArrowUpRight, Calendar, Wallet, Tag, CreditCard, User, FileText
} from 'lucide-react';
import {
  SERVICE_REFUND_CATS,
  CAT_LABEL,
  ROLE_LABEL,
  cleanDescription,
  formatCurrency,
  formatDateEn,
  formatTimeEn,
  formatTafqeet,
  parseRefundDetails,
  getTransactionCategoryLabel,
  parseServiceOrSurgery,
} from '../cashierConstants';

const cleanServiceDisplay = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/\s*\(?\s*مع\s*(?:طباعة\s*)?ف[يـ]?لم\s*\)?/g, '')
    .replace(/\s*\(?\s*مع\s*طباعة\s*\)?/g, '')
    .trim();
};

const TransactionDetailsModal = ({
  transaction,
  selectedTx: legacyTx,
  onClose,
  onOpenPatientRecord,
  title = 'تفاصيل الحركة المالية — الخزينة العامة',
}) => {
  const [isTxDetailsFullscreen, setIsTxDetailsFullscreen] = useState(false);
  const tx = transaction || legacyTx;

  if (!tx) return null;

  const isRefund = Number(tx.is_refund) === 1 || tx.category === 'refund';
  const isIncome = tx.type === 'income' && !isRefund;
  const isServiceIncome = isIncome && (
    ['entry_fee', 'lab', 'radiology', 'clinical', 'services', 'surgery_payment'].includes(tx?.category) ||
    Boolean(tx?.visit_id) ||
    Boolean(tx?.surgery_id)
  );
  const amt = parseFloat(tx.amount || 0);
  const refundInfo = isRefund ? parseRefundDetails(tx) : null;
  const serviceInfo = !isRefund ? parseServiceOrSurgery(tx) : null;

  const handleClose = () => {
    setIsTxDetailsFullscreen(false);
    if (onClose) onClose();
  };

  const handleOpenRecord = (patientId) => {
    handleClose();
    if (onOpenPatientRecord) {
      onOpenPatientRecord(patientId);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99990] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300 print:hidden"
      dir="rtl"
    >
      <div className="absolute inset-0" onClick={handleClose} />

      <div
        className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-white/60 ${
          isTxDetailsFullscreen
            ? 'w-[98vw] h-[98vh] rounded-[2.5rem]'
            : 'w-full max-w-5xl max-h-[90vh] rounded-[2rem]'
        }`}
      >
        {/* Top Title Bar & Window Controls */}
        <div
          className={`${
            isTxDetailsFullscreen ? 'px-6 py-3' : 'px-5 py-2.5'
          } flex items-center justify-between flex-shrink-0 shadow-md text-white transition-all duration-300 z-30 ${
            isIncome
              ? 'bg-gradient-to-r from-teal-700 via-emerald-600 to-teal-700'
              : isRefund
              ? 'bg-gradient-to-r from-rose-700 via-rose-600 to-red-700'
              : 'bg-gradient-to-r from-amber-700 via-amber-600 to-orange-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Layers size={isTxDetailsFullscreen ? 18 : 16} />
            <span
              className={`${
                isTxDetailsFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
              } font-black tracking-wide drop-shadow-sm`}
            >
              {title}
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setIsTxDetailsFullscreen((prev) => !prev)}
              className={`${
                isTxDetailsFullscreen ? 'w-8 h-8' : 'w-7 h-7'
              } flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all shadow-sm hidden sm:flex cursor-pointer`}
              title={isTxDetailsFullscreen ? 'تصغير النافذة' : 'تكبير النافذة'}
            >
              {isTxDetailsFullscreen ? (
                <Minimize2 size={isTxDetailsFullscreen ? 16 : 15} />
              ) : (
                <Maximize2 size={isTxDetailsFullscreen ? 16 : 15} />
              )}
            </button>
            <div className="w-px h-5 bg-white/30 mx-0.5 hidden sm:block" />
            <button
              type="button"
              onClick={handleClose}
              className={`${
                isTxDetailsFullscreen ? 'w-8 h-8' : 'w-7 h-7'
              } flex items-center justify-center bg-white/20 hover:bg-white/30 text-white hover:text-red-100 rounded-lg transition-all shadow-sm cursor-pointer`}
              title="إغلاق النافذة"
            >
              <X size={isTxDetailsFullscreen ? 16 : 15} />
            </button>
          </div>
        </div>

        {/* Balanced Identity & Context Header */}
        <div
          className={`bg-white ${
            isTxDetailsFullscreen ? 'px-7 sm:px-9 py-4 sm:py-5' : 'px-5 sm:px-6 py-3.5'
          } flex items-start sm:items-center justify-between gap-4 border-b border-slate-100 shrink-0 z-20 transition-all`}
        >
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
            <div
              className={`${
                isTxDetailsFullscreen
                  ? 'w-13 h-13 sm:w-15 sm:h-15 rounded-2xl'
                  : 'w-11 h-11 sm:w-12 sm:h-12 rounded-xl'
              } bg-gradient-to-br flex items-center justify-center shadow-inner border shrink-0 transition-all ${
                isIncome
                  ? 'from-emerald-50 to-teal-100/80 text-emerald-600 border-emerald-200/60'
                  : isRefund
                  ? 'from-rose-50 to-rose-100/80 text-rose-600 border-rose-200/60'
                  : 'from-amber-50 to-amber-100/80 text-amber-600 border-amber-200/60'
              }`}
            >
              {isIncome ? (
                <ArrowDownLeft size={isTxDetailsFullscreen ? 25 : 20} strokeWidth={2.3} />
              ) : isRefund ? (
                <RotateCcw size={isTxDetailsFullscreen ? 24 : 20} strokeWidth={2.2} />
              ) : (
                <ArrowUpRight size={isTxDetailsFullscreen ? 25 : 20} strokeWidth={2.3} />
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2
                  className={`font-black text-slate-800 tracking-tight leading-none ${
                    isTxDetailsFullscreen ? 'text-lg sm:text-2xl' : 'text-base sm:text-lg'
                  }`}
                >
                  تفاصيل الحركة المالية
                </h2>
                <span
                  className={`inline-flex items-center rounded-lg font-black border ${
                    isTxDetailsFullscreen
                      ? 'px-3 py-1 text-xs'
                      : 'px-2.5 py-0.5 text-[10px] sm:text-[11px]'
                  } ${
                    isIncome
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
                      : isRefund
                      ? 'bg-rose-50 text-rose-700 border-rose-200/70'
                      : 'bg-amber-50 text-amber-700 border-amber-200/70'
                  }`}
                >
                  {isServiceIncome
                    ? 'إيراد خدمات طبية'
                    : isIncome
                    ? 'إيداع في الخزينة'
                    : isRefund
                    ? 'استرداد نقدي'
                    : 'مصروف تشغيلي'}
                </span>
                <span
                  dir="ltr"
                  className="text-xs font-black text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200/70"
                >
                  #{tx.id}
                </span>
              </div>
              <p
                className={`text-slate-500 font-semibold truncate ${
                  isTxDetailsFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
                }`}
              >
                {isServiceIncome
                  ? 'حركة تحصيل وتسديد رسوم خدمات طبية مقيدة بالخزينة'
                  : isIncome
                  ? 'حركة مقبوضات وإيداع نقدي مقيدة بالخزينة العامة'
                  : isRefund
                  ? 'حركة استرداد مالي لمريض موثقة بالسجل المالي وتفاصيل الخدمة'
                  : 'حركة صرف تشغيلي ومصروفات عامة مقيدة بالخزينة'}
              </p>
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
            <div
              className={`flex items-center gap-1.5 text-slate-500 font-bold ${
                isTxDetailsFullscreen ? 'text-sm' : 'text-xs'
              }`}
            >
              <Calendar
                size={isTxDetailsFullscreen ? 16 : 14}
                className={
                  isIncome
                    ? 'text-emerald-600 opacity-80'
                    : isRefund
                    ? 'text-rose-600 opacity-80'
                    : 'text-amber-600 opacity-80'
                }
              />
              <span dir="ltr">{formatDateEn(tx.created_at)}</span>
              <span className="text-slate-300 mx-0.5">•</span>
              <span dir="ltr">{formatTimeEn(tx.created_at)}</span>
            </div>
            {(tx.visit_number || tx.visit_id) && (
              <div
                className={`flex items-center gap-1 font-black text-slate-400 ${
                  isTxDetailsFullscreen ? 'text-xs' : 'text-[11px]'
                }`}
              >
                <span>معرف الزيارة:</span>
                <span className="text-slate-800 font-black" dir="ltr">
                  {tx.visit_number || tx.visit_id}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Body Content */}
        <div
          className={`flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50 transition-all ${
            isTxDetailsFullscreen ? 'p-6 sm:p-8 space-y-5' : 'p-4 sm:p-5 space-y-3.5'
          }`}
        >
          {/* 1. Amount & Action Timestamp (2 Balanced Columns) */}
          <div
            className={`bg-white rounded-xl border border-slate-200/60 shadow-xs transition-all ${
              isTxDetailsFullscreen ? 'p-5 sm:p-6' : 'p-3.5 sm:p-4'
            }`}
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4">
              {/* المبلغ المالي المعتمد مع عرض المبلغ كتابة ونسب مئوية ذكية */}
              <div className="lg:col-span-7">
                <label className="font-bold text-slate-700 flex items-center gap-1.5 text-xs mb-1.5">
                  <Wallet
                    size={13}
                    className={
                      isIncome ? 'text-emerald-600' : isRefund ? 'text-rose-600' : 'text-amber-600'
                    }
                  />
                  <span>المبلغ المالي المعتمد</span>
                </label>
                <div className="bg-slate-50/80 border border-slate-200/80 px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 h-11 shadow-2xs">
                  <div className="flex items-center gap-1.5 font-black text-sm sm:text-base shrink-0">
                    <span
                      className={`tabular-nums ${
                        isIncome ? 'text-emerald-700' : isRefund ? 'text-rose-600' : 'text-amber-700'
                      }`}
                    >
                      {formatCurrency(amt)}
                    </span>
                    <span className="text-xs font-bold text-slate-400">ر.ي</span>
                  </div>
                  {amt > 0 && (
                    <span
                      className="text-xs sm:text-sm font-bold text-slate-600 truncate text-left"
                      title={formatTafqeet(amt)}
                    >
                      {formatTafqeet(amt)}
                    </span>
                  )}
                </div>
              </div>

              {/* وقت وتاريخ الإجراء بنسب مئوية ذكية */}
              <div className="lg:col-span-5">
                <label className="font-bold text-slate-700 flex items-center gap-1.5 text-xs mb-1.5">
                  <Calendar
                    size={13}
                    className={
                      isIncome ? 'text-emerald-600' : isRefund ? 'text-rose-600' : 'text-amber-600'
                    }
                  />
                  <span>وقت وتاريخ الإجراء</span>
                </label>
                <div className="bg-slate-50/80 border border-slate-200/80 px-3.5 py-2.5 rounded-xl flex items-center h-11 shadow-2xs">
                  <div className="flex items-center gap-2 font-bold text-slate-700 text-xs sm:text-sm">
                    <span dir="ltr">{formatDateEn(tx.created_at)}</span>
                    <span className="text-slate-300">•</span>
                    <span dir="ltr">{formatTimeEn(tx.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Metadata Grid (4 Balanced Columns) */}
          <div
            className={`bg-white rounded-xl border border-slate-200/60 shadow-xs transition-all ${
              isTxDetailsFullscreen ? 'p-5 sm:p-6' : 'p-3.5 sm:p-4'
            }`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
              {/* نوع العملية */}
              <div>
                <label className="font-bold text-slate-700 flex items-center gap-1.5 text-xs mb-1.5">
                  {isIncome ? (
                    <ArrowDownLeft size={13} className="text-emerald-600" />
                  ) : isRefund ? (
                    <RotateCcw size={13} className="text-rose-600" />
                  ) : (
                    <ArrowUpRight size={13} className="text-amber-600" />
                  )}
                  <span>نوع العملية</span>
                </label>
                <div className="bg-slate-50/80 border border-slate-200/80 px-3.5 py-2.5 rounded-xl flex items-center h-11 shadow-2xs">
                  <span className="text-xs sm:text-sm font-black text-slate-800 truncate">
                    {isServiceIncome ? 'إيراد خدمات' : isIncome ? 'إيراد عام (إيداع)' : isRefund ? 'استرداد نقدي' : 'مصروف عام'}
                  </span>
                </div>
              </div>

              {/* الفئة التصنيفية */}
              <div>
                <label className="font-bold text-slate-700 flex items-center gap-1.5 text-xs mb-1.5">
                  <Tag size={13} className="text-sky-600" />
                  <span>الفئة التصنيفية</span>
                </label>
                <div className="bg-slate-50/80 border border-slate-200/80 px-3.5 py-2.5 rounded-xl flex items-center h-11 shadow-2xs">
                  <span
                    className="text-xs sm:text-sm font-black text-slate-800 truncate"
                    title={getTransactionCategoryLabel(tx)}
                  >
                    {getTransactionCategoryLabel(tx)}
                  </span>
                </div>
              </div>

              {/* طريقة الدفع */}
              <div>
                <label className="font-bold text-slate-700 flex items-center gap-1.5 text-xs mb-1.5">
                  {tx.payment_method === 'bank_transfer' ? (
                    <CreditCard size={13} className="text-blue-600" />
                  ) : (
                    <Wallet size={13} className="text-slate-600" />
                  )}
                  <span>طريقة الدفع</span>
                </label>
                <div className="bg-slate-50/80 border border-slate-200/80 px-3.5 py-2.5 rounded-xl flex items-center h-11 shadow-2xs">
                  <span className="text-xs sm:text-sm font-black text-slate-800 truncate">
                    {tx.payment_method === 'bank_transfer' ? 'تحويل بنكي' : 'نقداً'}
                  </span>
                </div>
              </div>

              {/* الموظف المسؤول */}
              <div>
                <label className="font-bold text-slate-700 flex items-center gap-1.5 text-xs mb-1.5">
                  <User size={13} className="text-indigo-600" />
                  <span>الموظف المسؤول</span>
                </label>
                <div className="bg-slate-50/80 border border-slate-200/80 px-3.5 py-2.5 rounded-xl flex items-center h-11 shadow-2xs">
                  <span className="text-xs sm:text-sm font-black text-slate-800 truncate">
                    {tx.cashier_name || 'المحاسب'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Patient & Visit Context Card */}
          {(isRefund || tx.patient_name || tx.patient_id) && (
            <div
              className={`bg-white rounded-xl border border-slate-200/60 shadow-xs transition-all ${
                isTxDetailsFullscreen ? 'p-5 sm:p-6' : 'p-3.5 sm:p-4'
              }`}
            >
              <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <User size={15} className={isRefund ? 'text-rose-600' : 'text-emerald-600'} />
                  <span className="font-bold text-xs sm:text-sm text-slate-700">بيانات المريض والخدمة المرتبطة</span>
                </div>
                {tx.patient_id && (
                  <button
                    type="button"
                    onClick={() => handleOpenRecord(tx.patient_id)}
                    className="text-xs font-bold text-sky-600 hover:text-sky-700 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Layers size={12} />
                    <span>فتح السجل المالي</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* المريض المستفيد + معرف الزيارة اسفله */}
                <div>
                  <label className="font-bold text-slate-700 flex items-center gap-1.5 text-xs mb-1.5">
                    <User size={13} className={isRefund ? 'text-rose-600' : 'text-emerald-600'} />
                    <span>المريض المستفيد</span>
                  </label>
                  <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 shadow-2xs min-h-[58px] flex flex-col justify-center text-right">
                    <span className="text-xs sm:text-sm font-black text-slate-800 block truncate">
                      {refundInfo?.patientName || tx.patient_name || 'غير محدد'}
                    </span>
                    {(tx.visit_number || tx.visit_id) && (
                      <div className="flex items-center gap-1.5 mt-1 justify-start">
                        <span
                          className="font-black text-xs sm:text-sm text-sky-600 tracking-wide"
                          dir="ltr"
                        >
                          {tx.visit_number || tx.visit_id}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* الخدمة المقدمة / المسترجعة */}
                {(isRefund || refundInfo?.service || isServiceIncome || serviceInfo?.isService || tx.service_name) && (
                  <div>
                    <label className="font-bold text-slate-700 flex items-center gap-1.5 text-xs mb-1.5">
                      {isRefund ? (
                        <RotateCcw size={13} className="text-purple-600" />
                      ) : (
                        <Tag size={13} className="text-purple-600" />
                      )}
                      <span>{isRefund ? 'الخدمة المسترجعة' : 'الخدمة المقدمة'}</span>
                    </label>
                    <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 shadow-2xs min-h-[58px] flex items-center justify-between gap-3">
                      <span
                        className="text-xs sm:text-sm font-black text-slate-800 truncate"
                        title={isRefund ? cleanServiceDisplay(refundInfo?.service || 'استرداد نقدي') : cleanServiceDisplay(serviceInfo?.name || tx.service_name || CAT_LABEL[tx.category] || 'خدمة طبية')}
                      >
                        {isRefund
                          ? cleanServiceDisplay(refundInfo?.service || tx.service_name || tx.category_label || CAT_LABEL[tx.category] || 'خدمة طبية')
                          : cleanServiceDisplay(serviceInfo?.name || tx.service_name || tx.category_label || CAT_LABEL[tx.category] || 'خدمة طبية')}
                      </span>
                      <div className={`flex items-center gap-1.5 shrink-0 font-black text-xs sm:text-sm ${isRefund ? 'text-rose-600' : 'text-emerald-600'}`}>
                        <span className="tabular-nums">{formatCurrency(amt)}</span>
                        <span className="text-[11px] font-bold text-slate-400">ر.ي</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. Description / Notes / Reason Card */}
          <div
            className={`bg-white rounded-xl border border-slate-200/60 shadow-xs transition-all ${
              isTxDetailsFullscreen ? 'p-5 sm:p-6' : 'p-3.5 sm:p-4'
            }`}
          >
            <label className="font-bold text-slate-700 flex items-center gap-1.5 text-xs mb-1.5">
              <FileText
                size={13}
                className={
                  isIncome ? 'text-emerald-600' : isRefund ? 'text-rose-600' : 'text-amber-600'
                }
              />
              <span>{isRefund ? 'سبب الاسترداد والملاحظات التوضيحية' : 'البيان والملاحظات التوضيحية'}</span>
            </label>

            <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50/80 border border-slate-200/80">
              <p className="text-xs sm:text-sm font-semibold text-slate-800 leading-relaxed whitespace-pre-wrap break-words">
                {isRefund
                  ? refundInfo?.reason || tx.refund_reason || 'لا يوجد سبب استرداد مسجل.'
                  : cleanDescription(tx.description) || 'لا توجد ملاحظات إضافية مسجلة لهذه الحركة.'}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          className={`${
            isTxDetailsFullscreen ? 'px-7 sm:px-9 py-4' : 'px-5 sm:px-6 py-3'
          } bg-white border-t border-slate-200/80 flex items-center justify-between gap-3 flex-shrink-0 transition-all`}
        >
          <div
            className={`hidden sm:flex items-center gap-1.5 font-bold text-slate-500 ${
              isTxDetailsFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isIncome
                  ? 'bg-emerald-500'
                  : isRefund
                  ? 'bg-rose-500'
                  : 'bg-amber-500'
              }`}
            />
            <span>
              {isServiceIncome
                ? 'حركة تحصيل وتسديد رسوم خدمات طبية مقيدة بالخزينة العامة'
                : isIncome
                ? 'حركة إيداع مقيدة بالخزينة العامة'
                : isRefund
                ? 'حركة استرداد مالي معتمدة ومقيدة بالخزينة العامة'
                : 'حركة صرف تشغيلي مقيدة بالخزينة العامة'}
            </span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            {tx.patient_id && (
              <button
                type="button"
                onClick={() => handleOpenRecord(tx.patient_id)}
                className={`${
                  isTxDetailsFullscreen ? 'px-5 py-2.5 text-xs sm:text-sm' : 'px-4 py-2 text-xs'
                } bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200/80 font-black rounded-xl transition-all flex items-center gap-2 cursor-pointer active:scale-95`}
              >
                <Layers size={isTxDetailsFullscreen ? 16 : 14} />
                <span>عرض السجل المالي للمريض</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className={`${
                isTxDetailsFullscreen ? 'px-7 py-3 text-xs sm:text-sm' : 'px-6 py-2.5 text-xs'
              } rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer active:scale-95`}
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TransactionDetailsModal;
