import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Maximize2,
  Minimize2,
  Beaker,
  Layers,
  Package,
  ArrowLeftRight,
  CheckCircle2,
  RotateCcw,
  FileText,
  User
} from 'lucide-react';

// ── English Date & Time Helpers (Standardized across OR Store & Radiology) ──
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

const ManufacturingMovementModal = ({ isOpen, onClose, order }) => {
  const [isFullscreen, setIsFullscreen] = useState(() => {
    return localStorage.getItem('storeModalFullscreen') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('storeModalFullscreen', isFullscreen);
  }, [isFullscreen]);

  if (!isOpen || !order) return null;

  // Numerical calculations
  const rawQty = parseInt(order.raw_quantity || 0, 10);
  const prodQty = parseInt(order.produced_quantity || 0, 10);
  const rawUnitCost = parseFloat(order.raw_item_cost_price || 0);
  const rawTotalCost = rawQty * rawUnitCost;
  const prodUnitCost = parseFloat(order.cost_per_unit || 0);
  const prodTotalCost = prodQty * prodUnitCost;
  const isReversed = Boolean(order.is_reversed);

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300"
      dir="rtl"
    >
      <div className="absolute inset-0" onClick={onClose} />

      {/* ── Modal Window Container (Exact Sizing & Proportions of Store Modals) ── */}
      <div
        className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/60 ${
          isFullscreen
            ? 'w-[98vw] h-[98vh] rounded-[2.5rem]'
            : 'w-full max-w-5xl h-full max-h-[90vh] rounded-[2rem]'
        }`}
      >
        {/* ── Modal Header (Adaptive Spacing & Sizing) ── */}
        <div
          className={`bg-white ${
            isFullscreen ? 'px-6 sm:px-8 py-3.5 sm:py-4' : 'px-5 sm:px-6 py-3.5'
          } flex items-center justify-between gap-3 border-b border-slate-100 shrink-0 z-20 transition-all duration-300`}
        >
          {/* Right: Icon + Title + Status Badges */}
          <div className="flex items-center gap-3 sm:gap-3.5">
            <div
              className={`${
                isFullscreen
                  ? 'w-11 h-11 sm:w-12 sm:h-12 rounded-xl'
                  : 'w-10 h-10 sm:w-11 sm:h-11 rounded-xl'
              } flex items-center justify-center shadow-inner border shrink-0 bg-gradient-to-br from-violet-50 to-purple-100/80 text-violet-700 border-violet-200/60`}
            >
              <Beaker size={isFullscreen ? 22 : 20} strokeWidth={2} />
            </div>

            <div className="flex items-center flex-wrap gap-2.5">
              <h2
                className={`${
                  isFullscreen ? 'text-lg sm:text-xl' : 'text-base sm:text-lg'
                } font-black text-slate-800 tracking-tight leading-none`}
              >
                تفاصيل حركة تصنيع المستهلكات
              </h2>

              {/* Status Badge */}
              {isReversed ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200/70 shadow-2xs select-none">
                  <RotateCcw size={12} strokeWidth={2.5} className="text-rose-600 shrink-0" />
                  <span>تم التراجع</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200/70 shadow-2xs select-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span>معتمد</span>
                </span>
              )}
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

        {/* ── Scrollable Body Workspace ── */}
        <div
          className={`flex-1 overflow-y-auto ${
            isFullscreen ? 'p-6 sm:p-8' : 'p-5 sm:p-6'
          } custom-scrollbar bg-slate-50/40`}
        >
          <div className={`w-full ${isFullscreen ? 'space-y-6' : 'space-y-5'}`}>

            {/* ── Visual Flow Card: Raw Consumed ──► Produced Item ── */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs relative overflow-hidden">
              <div className="flex flex-col lg:flex-row items-stretch justify-between gap-4">
                
                {/* 1. Source (Raw Material Consumed) */}
                <div className="w-full lg:flex-1 flex flex-col">
                  {/* Operation Type & Icon Outside Card */}
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <div className="p-1.5 bg-amber-100/80 rounded-lg text-amber-700 shadow-2xs shrink-0">
                      <Package size={14} strokeWidth={2.5} />
                    </div>
                    <span className="text-xs font-black text-slate-700">
                      المادة الخام المستهلكة
                    </span>
                  </div>

                  {/* Card Body: Item + Type + Quantity in the Same Row */}
                  <div className="bg-gradient-to-l from-amber-50/70 via-amber-50/30 to-white rounded-2xl p-3.5 sm:p-4 border border-amber-200/80 shadow-2xs hover:border-amber-300 transition-all">
                    <div className="flex items-center justify-between gap-3">
                      
                      {/* الصنف ونوع الصنف بجانبه */}
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="text-sm font-black text-slate-800 truncate" title={`${order.raw_item_name || ''} (${order.raw_item_unit || 'وحدة'})`}>
                          {order.raw_item_name}
                        </span>
                        {order.raw_item_unit && (
                          <span className="text-xs font-bold text-slate-500 shrink-0">
                            ({order.raw_item_unit})
                          </span>
                        )}
                      </div>

                      {/* الكمية المستهلكة وقيمتها في نفس الصف */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold text-slate-500">الكمية المستهلكة:</span>
                        <span className="text-sm sm:text-base font-black text-amber-700 font-mono" dir="ltr">
                          {rawQty.toLocaleString('en-US')}
                        </span>
                      </div>

                    </div>
                  </div>
                </div>

                {/* 2. Conversion Flow Center Icon */}
                <div className="flex flex-col items-center justify-center shrink-0 px-1 self-center lg:pt-6">
                  <div className="w-9 h-9 rounded-xl bg-violet-100/90 text-violet-700 border border-violet-200/80 flex items-center justify-center shadow-xs">
                    <ArrowLeftRight size={16} strokeWidth={2.5} />
                  </div>
                  <span className="text-[10px] font-black text-violet-700 mt-1 whitespace-nowrap">
                    تحويل وتصنيع
                  </span>
                </div>

                {/* 3. Destination (Produced Material Generated) */}
                <div className="w-full lg:flex-1 flex flex-col">
                  {/* Operation Type & Icon Outside Card */}
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <div className="p-1.5 bg-emerald-100/80 rounded-lg text-emerald-700 shadow-2xs shrink-0">
                      <Layers size={14} strokeWidth={2.5} />
                    </div>
                    <span className="text-xs font-black text-slate-700">
                      المادة المنتجة المصنعة
                    </span>
                  </div>

                  {/* Card Body: Item + Type + Quantity in the Same Row */}
                  <div className="bg-gradient-to-l from-emerald-50/70 via-emerald-50/30 to-white rounded-2xl p-3.5 sm:p-4 border border-emerald-200/80 shadow-2xs hover:border-emerald-300 transition-all">
                    <div className="flex items-center justify-between gap-3">
                      
                      {/* الصنف ونوع الصنف بجانبه */}
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="text-sm font-black text-slate-800 truncate" title={`${order.produced_item_name || ''} (${order.produced_item_unit || 'وحدة'})`}>
                          {order.produced_item_name}
                        </span>
                        {order.produced_item_unit && (
                          <span className="text-xs font-bold text-slate-500 shrink-0">
                            ({order.produced_item_unit})
                          </span>
                        )}
                      </div>

                      {/* الكمية المنتجة وقيمتها في نفس الصف */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold text-slate-500">الكمية المنتجة:</span>
                        <span className="text-sm sm:text-base font-black text-emerald-700 font-mono" dir="ltr">
                          {prodQty.toLocaleString('en-US')}
                        </span>
                      </div>

                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* ── Section 1: Consumables & Production Items Table (100% Total Width) ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-violet-100/80 rounded-lg text-violet-700 shadow-sm">
                    <Package size={isFullscreen ? 18 : 16} />
                  </div>
                  <h3
                    className={`${
                      isFullscreen ? 'text-sm sm:text-base' : 'text-sm'
                    } font-black text-slate-700`}
                  >
                    بيانات الأصناف والمكونات
                  </h3>
                  <span className="text-xs px-2.5 py-0.5 font-black bg-violet-50 text-violet-700 rounded-full border border-violet-200/60">
                    طرفا التحويل (2)
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-right text-sm whitespace-nowrap table-fixed">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th style={{ width: '5%' }} className="px-2 py-3.5 text-xs font-bold text-slate-500 text-center">#</th>
                        <th style={{ width: '28%' }} className="px-4 py-3.5 text-xs font-bold text-slate-500 text-right">الصنف</th>
                        <th style={{ width: '14%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">نوع الصنف</th>
                        <th style={{ width: '14%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">نوع العملية</th>
                        <th style={{ width: '12%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">الكمية</th>
                        <th style={{ width: '13%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">تكلفة الوحدة</th>
                        <th style={{ width: '14%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      
                      {/* Row 1: Raw Material (Outbound/Consumption) */}
                      <tr className="hover:bg-slate-50/60 transition-colors">
                        <td style={{ width: '5%' }} className="px-2 py-4 text-xs font-black text-slate-400 text-center align-middle font-mono">
                          1
                        </td>
                        <td style={{ width: '28%' }} className="px-4 py-4 align-middle">
                          <span className="font-black text-slate-800 text-sm truncate block" title={order.raw_item_name}>
                            {order.raw_item_name}
                          </span>
                        </td>
                        <td style={{ width: '14%' }} className="px-3 py-4 text-center align-middle text-xs font-bold text-slate-600">
                          {order.raw_item_unit || 'وحدة'}
                        </td>
                        <td style={{ width: '14%' }} className="px-3 py-4 text-center align-middle">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/60 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                            <span>إستهلاك</span>
                          </span>
                        </td>
                        <td style={{ width: '12%' }} className="px-3 py-4 text-center align-middle">
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-xl font-black text-sm text-amber-600 bg-amber-50/80 border border-amber-200/60 font-mono" dir="ltr">
                            {rawQty.toLocaleString('en-US')}
                          </span>
                        </td>
                        <td style={{ width: '13%' }} className="px-3 py-4 text-center align-middle">
                          <span dir="ltr" className="font-bold text-slate-700">
                            {Math.round(rawUnitCost).toLocaleString('en-US')}
                          </span>
                          <span className="text-[10px] text-slate-400 mr-1">ر.ي</span>
                        </td>
                        <td style={{ width: '14%' }} className="px-3 py-4 text-center align-middle">
                          <span dir="ltr" className="font-black text-amber-700">
                            {Math.round(rawTotalCost).toLocaleString('en-US')}
                          </span>
                          <span className="text-[10px] text-amber-600 mr-1">ر.ي</span>
                        </td>
                      </tr>

                      {/* Row 2: Produced Item (Inbound/Production) */}
                      <tr className="hover:bg-slate-50/60 transition-colors">
                        <td style={{ width: '5%' }} className="px-2 py-4 text-xs font-black text-slate-400 text-center align-middle font-mono">
                          2
                        </td>
                        <td style={{ width: '28%' }} className="px-4 py-4 align-middle">
                          <span className="font-black text-slate-800 text-sm truncate block" title={order.produced_item_name}>
                            {order.produced_item_name}
                          </span>
                        </td>
                        <td style={{ width: '14%' }} className="px-3 py-4 text-center align-middle text-xs font-bold text-slate-600">
                          {order.produced_item_unit || 'وحدة'}
                        </td>
                        <td style={{ width: '14%' }} className="px-3 py-4 text-center align-middle">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            <span>إنتاج</span>
                          </span>
                        </td>
                        <td style={{ width: '12%' }} className="px-3 py-4 text-center align-middle">
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-xl font-black text-sm text-emerald-600 bg-emerald-50/80 border border-emerald-200/60 font-mono" dir="ltr">
                            {prodQty.toLocaleString('en-US')}
                          </span>
                        </td>
                        <td style={{ width: '13%' }} className="px-3 py-4 text-center align-middle">
                          <span dir="ltr" className="font-bold text-slate-700">
                            {Math.round(prodUnitCost).toLocaleString('en-US')}
                          </span>
                          <span className="text-[10px] text-slate-400 mr-1">ر.ي</span>
                        </td>
                        <td style={{ width: '14%' }} className="px-3 py-4 text-center align-middle">
                          <span dir="ltr" className="font-black text-emerald-700">
                            {Math.round(prodTotalCost).toLocaleString('en-US')}
                          </span>
                          <span className="text-[10px] text-emerald-600 mr-1">ر.ي</span>
                        </td>
                      </tr>

                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ── Section 2: Movement Details & Audit Information (100% Total Width) ── */}
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
                  بيانات العملية والمصادقة
                </h3>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-right text-sm table-fixed">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th style={{ width: '35%' }} className="px-4 py-3.5 text-xs font-bold text-slate-500 text-right whitespace-nowrap">المسؤول عن التنفيذ</th>
                        <th style={{ width: '35%' }} className="px-4 py-3.5 text-xs font-bold text-slate-500 text-center whitespace-nowrap">التاريخ والوقت</th>
                        <th style={{ width: '30%' }} className="px-4 py-3.5 text-xs font-bold text-slate-500 text-center whitespace-nowrap">حالة العملية</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      <tr className="hover:bg-slate-50/50 transition-colors">
                        
                        {/* 1. Performed By */}
                        <td style={{ width: '35%' }} className="px-4 py-4 align-middle">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-700 border border-sky-100 flex items-center justify-center shrink-0">
                              <User size={13} strokeWidth={2.5} />
                            </div>
                            <span className="text-xs font-black text-slate-700 truncate" title={order.performed_by_name}>
                              {order.performed_by_name || 'مسؤول المخزن'}
                            </span>
                          </div>
                        </td>

                        {/* 2. Date & Time */}
                        <td style={{ width: '35%' }} className="px-4 py-4 text-center align-middle whitespace-nowrap">
                          <div className="flex flex-col items-center" dir="ltr">
                            <span className="text-xs font-bold text-slate-700">
                              {formatDateEn(order.created_at)}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400">
                              {formatTimeEn(order.created_at)}
                            </span>
                          </div>
                        </td>

                        {/* 3. Status */}
                        <td style={{ width: '30%' }} className="px-4 py-4 text-center align-middle whitespace-nowrap">
                          {isReversed ? (
                            <div className="flex flex-col items-center">
                              <span className="text-xs font-black text-rose-700">
                                تم التراجع
                              </span>
                              {order.reversed_at && (
                                <span className="text-[10px] font-bold text-slate-400 mt-0.5" dir="ltr">
                                  {formatDateEn(order.reversed_at)} {formatTimeEn(order.reversed_at)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200/70 shadow-2xs">
                              <CheckCircle2 size={13} strokeWidth={2.5} className="text-emerald-600 shrink-0" />
                              <span>معتمد ومسجل</span>
                            </span>
                          )}
                        </td>

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
                {isReversed ? (
                  <>
                    <RotateCcw size={15} className="text-rose-500 shrink-0" />
                    <span>تم التراجع عن أمر التصنيع هذا واسترجاع المواد الخام وإلغاء الرصيد المنتج.</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                    <span>تم تسجيل حركة تصنيع المستهلكات وتحديث رصيد الحزم والمكونات بنجاح.</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 font-black py-2 px-6 rounded-xl transition-all active:scale-95 cursor-pointer text-xs sm:text-sm shadow-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};

export default ManufacturingMovementModal;
