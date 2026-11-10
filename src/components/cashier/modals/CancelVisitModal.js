import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';

const CancelVisitModal = ({ visit, token, onClose, onCancelled }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!visit) return null;

  const handleCancel = async () => {
    setIsSubmitting(true);
    try {
      const targetId = visit.id || visit.visit_id;
      const res = await fetch(`/api/cashier/visit/${targetId}/cancel`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        toast.success('تم إلغاء الزيارة بنجاح');
        onCancelled();
        onClose();
      } else {
        const error = await res.json();
        toast.error(error.message || 'حدث خطأ أثناء الإلغاء');
      }
    } catch (err) {
      toast.error('حدث خطأ في الاتصال بالخادم');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" dir="rtl" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl border border-slate-100 transition-all duration-200 animate-in fade-in zoom-in-95"
      >
        <div className="p-6 flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-red-50 border border-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-1 shadow-sm">
            <AlertCircle size={28} strokeWidth={2.2} />
          </div>
          <h3 className="text-lg font-black text-slate-800">تأكيد الإلغاء</h3>
          <p className="text-xs font-bold text-slate-500 leading-relaxed">
            هل أنت متأكد من إلغاء الزيارة <span className="text-red-500 font-black">{visit.visit_number}</span> للمريض "<span className="text-red-500 font-black">{visit.full_name}</span>"؟
          </p>
        </div>
        
        <div className="flex bg-slate-50/80 border-t border-slate-100 p-3 gap-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50 text-sm shadow-sm"
          >
            تراجع
          </button>
          <button
            onClick={handleCancel}
            disabled={isSubmitting}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50 text-sm shadow-sm flex items-center justify-center"
          >
            {isSubmitting ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CancelVisitModal;
