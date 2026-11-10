import React from 'react';
import { createPortal } from 'react-dom';
import { ClipboardCheck, TrendingUp, X, AlertTriangle } from 'lucide-react';

const ConfirmFinalizeModal = ({ items, saving, onConfirm, onCancel }) => {
  const withVariance = items.filter(i => parseInt(i.actual_quantity,10) !== parseInt(i.expected_quantity,10));
  const surplusItems = withVariance.filter(i => parseInt(i.actual_quantity,10) > parseInt(i.expected_quantity,10));
  const deficitItems = withVariance.filter(i => parseInt(i.actual_quantity,10) < parseInt(i.expected_quantity,10));
  
  const totalSurplus = surplusItems.reduce((s,i) => s+(parseInt(i.actual_quantity,10)-parseInt(i.expected_quantity,10)),0);
  const totalDeficit = deficitItems.reduce((s,i) => s+(parseInt(i.expected_quantity,10)-parseInt(i.actual_quantity,10)),0);

  const totalExpectedValue = items.reduce((s, i) => s + ((parseInt(i.expected_quantity, 10) || 0) * (parseFloat(i.cost_price) || 0)), 0);
  const totalActualValue = items.reduce((s, i) => s + ((parseInt(i.actual_quantity, 10) || 0) * (parseFloat(i.cost_price) || 0)), 0);
  const totalSurplusValue = surplusItems.reduce((s, i) => s + (((parseInt(i.actual_quantity, 10) || 0) - (parseInt(i.expected_quantity, 10) || 0)) * (parseFloat(i.cost_price) || 0)), 0);
  const totalDeficitValue = deficitItems.reduce((s, i) => s + (((parseInt(i.expected_quantity, 10) || 0) - (parseInt(i.actual_quantity, 10) || 0)) * (parseFloat(i.cost_price) || 0)), 0);
  
  const matchedItemsCount = items.length - withVariance.length;
  const matchedPct = items.length ? (matchedItemsCount / items.length) * 100 : 0;
  const surplusPct = items.length ? (surplusItems.length / items.length) * 100 : 0;
  const deficitPct = items.length ? (deficitItems.length / items.length) * 100 : 0;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
      <div className="absolute inset-0" onClick={!saving ? onCancel : undefined} />
      <div className="relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-100 animate-in zoom-in-95 transition-all duration-300 w-full max-w-xl">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center border border-indigo-100/50 shadow-sm">
              <ClipboardCheck size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">اعتماد جلسة الجرد</h2>
              <p className="text-xs font-bold text-slate-500 mt-0.5">مراجعة النتائج وتحديث المخزون</p>
            </div>
          </div>
          <button onClick={onCancel} disabled={saving} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-slate-600 text-sm font-bold leading-relaxed mb-6 text-center">
            سيتم اعتماد الجلسة الحالية وتحديث كميات المخزون. لا يمكن التراجع بعد التأكيد.
          </p>

          {/* 📊 Innovative Analysis Bar */}
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 mb-4 shadow-sm">
            <div className="flex justify-between items-end mb-4">
              <div>
                <h4 className="text-slate-800 font-black text-base flex items-center gap-2">
                  <TrendingUp size={16} className="text-indigo-500" /> تحليل المطابقة
                </h4>
                <p className="text-slate-400 text-[11px] font-bold mt-1">نتيجة مقارنة الجرد الفعلي مع النظام</p>
              </div>
              <div className="text-left bg-white px-3 py-1.5 rounded-xl border border-slate-100 shadow-sm">
                <span className="text-lg font-black text-slate-800 leading-none">{items.length}</span>
                <span className="text-[10px] font-bold text-slate-500 mr-1.5">إجمالي الأصناف</span>
              </div>
            </div>

            {/* Impact Bar */}
            <div className="flex h-3 rounded-full overflow-hidden bg-slate-200 mb-5 w-full ring-1 ring-slate-900/5">
              {matchedPct > 0 && <div style={{ width: `${matchedPct}%` }} className="bg-indigo-500 transition-all hover:bg-indigo-600 cursor-help" title={`مطابق: ${matchedItemsCount}`}></div>}
              {surplusPct > 0 && <div style={{ width: `${surplusPct}%` }} className="bg-emerald-500 transition-all hover:bg-emerald-600 cursor-help" title={`فائض: ${surplusItems.length}`}></div>}
              {deficitPct > 0 && <div style={{ width: `${deficitPct}%` }} className="bg-red-500 transition-all hover:bg-red-600 cursor-help" title={`عجز: ${deficitItems.length}`}></div>}
            </div>

            {/* Legends */}
            <div className="flex flex-wrap items-stretch justify-between gap-4">
              {/* Matched */}
              <div className="flex flex-col flex-1">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>
                  <span className="text-[11px] font-bold text-slate-600">مطابق تماماً</span>
                </div>
                <div className="flex items-end gap-1.5">
                  <span className="text-lg font-black text-slate-800 leading-none">{matchedItemsCount}</span>
                  <span className="text-[10px] font-bold text-slate-400 mb-0.5">صنف</span>
                </div>
              </div>
              
              {/* Surplus */}
              {surplusItems.length > 0 && (
                <div className="flex flex-col flex-1 border-r border-slate-200 pr-4">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></div>
                    <span className="text-[11px] font-bold text-emerald-600">يوجد فائض</span>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <span className="text-lg font-black text-emerald-700 leading-none">{surplusItems.length}</span>
                    <span className="text-[10px] font-bold text-emerald-600/80 mb-0.5">صنف (+{totalSurplus} وحدة)</span>
                  </div>
                </div>
              )}

              {/* Deficit */}
              {deficitItems.length > 0 && (
                <div className="flex flex-col flex-1 border-r border-slate-200 pr-4">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]"></div>
                    <span className="text-[11px] font-bold text-red-600">يوجد عجز</span>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <span className="text-lg font-black text-red-700 leading-none">{deficitItems.length}</span>
                    <span className="text-[10px] font-bold text-red-600/80 mb-0.5">صنف (-{totalDeficit} وحدة)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Financial Summary Row inside Modal */}
            {(() => {
              const activeCount = 2 + (totalSurplusValue > 0 ? 1 : 0) + (totalDeficitValue > 0 ? 1 : 0);
              const gridCols = activeCount >= 4
                ? 'grid-cols-2 sm:grid-cols-4'
                : activeCount === 3
                  ? 'grid-cols-1 sm:grid-cols-3'
                  : 'grid-cols-2';

              return (
                <div className={`mt-4 pt-4 border-t border-slate-200/80 grid ${gridCols} gap-2.5`}>
                  <div className="bg-slate-50/70 rounded-2xl p-3 border border-slate-200/80 shadow-2xs flex flex-col justify-between">
                    <span className="block text-[11px] font-bold text-slate-500 mb-1.5">القيمة الدفترية</span>
                    <div className="flex items-baseline justify-end gap-1 text-slate-700" dir="ltr">
                      <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                      <span className="text-sm font-black">{Math.round(totalExpectedValue).toLocaleString('en-US')}</span>
                    </div>
                  </div>
                  <div className="bg-indigo-50/50 rounded-2xl p-3 border border-indigo-100 shadow-2xs flex flex-col justify-between">
                    <span className="block text-[11px] font-bold text-indigo-600 mb-1.5">قيمة الجرد الفعلية</span>
                    <div className="flex items-baseline justify-end gap-1 text-indigo-700" dir="ltr">
                      <span className="text-[10px] font-bold text-indigo-400">ر.ي</span>
                      <span className="text-sm font-black">{Math.round(totalActualValue).toLocaleString('en-US')}</span>
                    </div>
                  </div>
                  {totalSurplusValue > 0 && (
                    <div className="bg-emerald-50/60 rounded-2xl p-3 border border-emerald-100 shadow-2xs flex flex-col justify-between">
                      <span className="block text-[11px] font-bold text-emerald-600 mb-1.5">قيمة الفائض المالي</span>
                      <div className="flex items-baseline justify-end gap-1 text-emerald-700" dir="ltr">
                        <span className="text-[10px] font-bold text-emerald-500">ر.ي</span>
                        <span className="text-sm font-black">+{Math.round(totalSurplusValue).toLocaleString('en-US')}</span>
                      </div>
                    </div>
                  )}
                  {totalDeficitValue > 0 && (
                    <div className="bg-rose-50/60 rounded-2xl p-3 border border-rose-100 shadow-2xs flex flex-col justify-between">
                      <span className="block text-[11px] font-bold text-rose-600 mb-1.5">قيمة العجز المالي</span>
                      <div className="flex items-baseline justify-end gap-1 text-rose-700" dir="ltr">
                        <span className="text-[10px] font-bold text-rose-500">ر.ي</span>
                        <span className="text-sm font-black">-{Math.round(totalDeficitValue).toLocaleString('en-US')}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          
          {withVariance.length > 0 && (
            <div className="flex items-start gap-3 bg-amber-50/50 border border-amber-100 rounded-2xl p-4 mt-2">
              <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs font-bold text-amber-700 leading-relaxed">
                يوجد <span className="font-black text-amber-800 mx-1">{withVariance.length}</span> أصناف تحتاج تسوية. سيقوم النظام بإنشاء سندات مخزنية (صرف/استلام) لمعالجتها آلياً.
              </p>
            </div>
          )}
        </div>
        
        <div className="flex gap-3 p-4 bg-gray-50/50 border-t border-gray-100">
          <button 
            onClick={onCancel} 
            disabled={saving}
            className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl text-sm transition-colors disabled:opacity-50"
          >
            إلغاء
          </button>
          <button 
            onClick={onConfirm} 
            disabled={saving}
            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-sm shadow-md transition-colors disabled:opacity-50 flex items-center justify-center"
          >
            {saving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : 'تأكيد الاعتماد'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmFinalizeModal;
