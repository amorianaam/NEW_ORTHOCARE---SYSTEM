import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

const LimitExceededModal = ({ quantityWarning, onClose }) => {
  if (!quantityWarning) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-100 animate-in zoom-in-95 transition-all duration-300 w-full max-w-md">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center border border-amber-100/50 shadow-sm">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800">تجاوز الحد المسموح</h2>
              <p className="text-[10px] font-bold text-slate-500 mt-0.5">الكمية المطلوبة غير متوفرة</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-slate-600 text-sm font-bold leading-relaxed mb-6 text-center">
            الكمية المطلوبة من الصنف <span className="text-red-500 font-black px-1">{quantityWarning.itemName}</span> تتجاوز الرصيد المتوفر حالياً في المخزن!
          </p>

          <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner">
            <div className="flex-1 flex flex-col items-center justify-center border-l border-slate-200">
              <span className="block text-2xl font-black text-red-500 drop-shadow-sm leading-none" dir="ltr">{parseInt(quantityWarning.requested, 10)}</span>
              <span className="block text-[10px] font-bold text-slate-400 mt-1">الكمية المطلوبة</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center">
              <span className="block text-2xl font-black text-emerald-500 drop-shadow-sm leading-none" dir="ltr">{parseInt(quantityWarning.available, 10)}</span>
              <span className="block text-[10px] font-bold text-slate-400 mt-1">المخزون المتوفر</span>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-100">
          <button 
            onClick={onClose}
            className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white font-black rounded-xl text-sm transition-all shadow-md shadow-slate-900/10 active:scale-[0.98]"
          >
            حسناً، فهمت
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LimitExceededModal;
