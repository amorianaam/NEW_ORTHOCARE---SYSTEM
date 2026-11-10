import React from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X, RefreshCw } from 'lucide-react';

const ConfirmDeleteModal = ({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  loading,
  // Flexible props for reuse (all have defaults that preserve original behavior)
  title = 'حذف الصنف',
  subtitle = 'تأكيد عملية الحذف بشكل نهائي',
  bodyTitle = 'هل أنت متأكد من الحذف؟',
  bodyDescription,
  confirmLabel = 'تأكيد الحذف',
  loadingLabel = 'جاري الحذف...',
  icon: Icon = Trash2,
}) => {
  if (!isOpen) return null;

  const defaultBodyDescription = (
    <>
      سيتم حذف الصنف <span className="text-red-500 font-black px-1">{itemName}</span> وكافة بياناته من النظام نهائياً. لا يمكن التراجع عن هذا الإجراء بعد التأكيد.
    </>
  );

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
      <div className="absolute inset-0" onClick={!loading ? onClose : undefined} />
      <div className="relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-100 animate-in zoom-in-95 transition-all duration-300 w-full max-w-md">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center border border-red-100/50 shadow-sm">
              <Icon size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">{title}</h2>
              <p className="text-xs font-bold text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={loading} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 text-center space-y-3">
          <h3 className="font-black text-xl text-slate-800">{bodyTitle}</h3>
          <p className="text-slate-500 text-sm font-bold leading-relaxed max-w-sm mx-auto">
            {bodyDescription ?? defaultBodyDescription}
          </p>
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button 
            onClick={onClose} 
            disabled={loading}
            className="px-5 py-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 font-bold rounded-xl text-sm transition-all disabled:opacity-50"
          >
            إلغاء
          </button>
          <button 
            onClick={onConfirm} 
            disabled={loading}
            className="px-6 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-black rounded-xl text-sm shadow-md shadow-red-200/50 flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {loading ? (
              <><RefreshCw size={16} className="animate-spin" /> {loadingLabel}</>
            ) : (
              <><Icon size={16} /> {confirmLabel}</>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmDeleteModal;
