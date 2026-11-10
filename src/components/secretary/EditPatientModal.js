import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Save, X, User, Phone, Plus, Minus, Check } from 'lucide-react';
import { toast } from 'react-toastify';

const toEnglishDigits = (val) => {
  if (!val) return '';
  return String(val).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
};

export default function EditPatientModal({ patient, token, onClose, onSaved }) {
  const [form, setForm] = useState({
    fullName: patient?.full_name || '',
    age: patient?.age ? String(patient.age) : '',
    gender: patient?.gender === 'female' || patient?.gender === 'أنثى' ? 'female' : 'male',
    phone: patient?.phone || '',
    chronicDiseases: patient?.chronic_diseases || '',
    allergies: patient?.allergies || '',
    currentMedications: patient?.current_medications || '',
  });
  const [saving, setSaving] = useState(false);

  const handleAgeChange = (val) => {
    const raw = toEnglishDigits(val).replace(/\D/g, '');
    const num = Number(raw);
    if (raw === '' || (num >= 0 && num <= 120)) {
      setForm(p => ({ ...p, age: raw }));
    }
  };

  const handleIncrementAge = () => {
    const cur = Number(toEnglishDigits(form.age)) || 0;
    if (cur < 120) setForm(p => ({ ...p, age: String(cur + 1) }));
  };

  const handleDecrementAge = () => {
    const cur = Number(toEnglishDigits(form.age)) || 0;
    if (cur > 1) setForm(p => ({ ...p, age: String(cur - 1) }));
  };

  const handlePhoneChange = (val) => {
    const raw = toEnglishDigits(val).replace(/\D/g, '').slice(0, 9);
    setForm(p => ({ ...p, phone: raw }));
  };

  const isPhoneInvalid = Boolean(
    form.phone && form.phone.length >= 2 && !['77', '73', '71', '78', '70'].includes(form.phone.slice(0, 2))
  );

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!form.fullName.trim()) return toast.error('الاسم مطلوب');
    if (isPhoneInvalid) return toast.error('رقم الهاتف يجب أن يبدأ بـ 77، 73، 71، 78، أو 70');

    setSaving(true);
    try {
      const payload = {
        ...form,
        fullName: form.fullName.trim(),
        age: form.age ? Number(toEnglishDigits(form.age)) : null,
        phone: form.phone ? toEnglishDigits(form.phone).trim() : null,
      };

      const res = await fetch(`/api/patients/${patient.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('تم تحديث بيانات المريض بنجاح');
        if (onSaved) onSaved();
        onClose();
      } else {
        toast.error(data.message || 'فشل تحديث البيانات');
      }
    } catch {
      toast.error('تعذر الاتصال بالخادم');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm modal-overlay-anim" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />
      
      {/* Modal Container */}
      <div className="relative z-10 bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.18)] w-full max-w-lg mx-auto overflow-hidden max-h-[92vh] flex flex-col transform transition-all border border-slate-100">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-teal-700 via-teal-600 to-teal-700 text-white flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center shadow-xs">
              <Pencil size={17} strokeWidth={2.2} />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base tracking-wide leading-tight">تعديل بيانات المريض</h3>
              <p className="text-[11px] font-bold text-teal-100 mt-0.5 opacity-90">
                تحديث معلومات الملف الطبي للمريض
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white hover:text-red-100 rounded-lg transition-all shadow-sm cursor-pointer active:scale-95"
            title="إغلاق"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 sm:p-7 space-y-5 custom-scrollbar">
          
          {/* Full Name Field */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1.5 px-1">
              الاسم الكامل <span className="text-rose-500 font-black">*</span>
            </label>
            <div className="relative flex items-center h-[42px] border border-gray-200 rounded-xl overflow-hidden transition-all shadow-2xs px-3 gap-2 group bg-white focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-200/60">
              <div className="shrink-0 text-gray-400 group-focus-within:text-teal-600 transition-colors">
                <User size={16} />
              </div>
              <input 
                type="text"
                value={form.fullName} 
                onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))}
                placeholder="اسم المريض الرباعي..."
                required 
                className="flex-1 w-full bg-transparent text-xs sm:text-sm font-bold text-gray-800 placeholder-gray-400 focus:outline-none py-1" 
              />
              {form.fullName && (
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, fullName: '' }))}
                  className="shrink-0 w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                  title="مسح الاسم"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>

          {/* Age & Gender Side by Side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Age Stepper */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1.5 px-1 whitespace-nowrap">
                العمر <span className="text-rose-500 font-black">*</span>
              </label>
              <div className="relative flex items-center h-[42px] border border-gray-200 rounded-xl overflow-hidden transition-all shadow-2xs group bg-white focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-200/60">
                <button
                  type="button"
                  tabIndex="-1"
                  onClick={handleDecrementAge}
                  disabled={!form.age || Number(toEnglishDigits(form.age)) <= 1}
                  className="w-9 h-full flex items-center justify-center text-gray-400 hover:text-teal-600 hover:bg-teal-50 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  title="إنقاص"
                >
                  <Minus size={14} strokeWidth={3} />
                </button>
                <input 
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={toEnglishDigits(form.age)}
                  onChange={e => handleAgeChange(e.target.value)}
                  className="flex-1 w-full min-w-0 bg-transparent text-xs sm:text-sm font-black text-gray-700 text-center focus:outline-none" 
                  placeholder="0"
                  required
                />
                <button
                  type="button"
                  tabIndex="-1"
                  onClick={handleIncrementAge}
                  disabled={Number(toEnglishDigits(form.age)) >= 120}
                  className="w-9 h-full flex items-center justify-center text-gray-400 hover:text-teal-600 hover:bg-teal-50 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  title="زيادة"
                >
                  <Plus size={14} strokeWidth={3} />
                </button>
              </div>
            </div>

            {/* Gender Toggle */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1.5 px-1 whitespace-nowrap">
                الجنس
              </label>
              <div className="flex p-1 rounded-xl h-[42px] items-center border border-gray-200/80 bg-gray-100/80">
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, gender: 'male' }))}
                  className={`flex-1 h-[34px] text-xs font-bold rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                    form.gender === 'male' || form.gender === 'ذكر' ? 'bg-white shadow-2xs text-teal-700 font-black' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  ذكر
                </button>
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, gender: 'female' }))}
                  className={`flex-1 h-[34px] text-xs font-bold rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                    form.gender === 'female' || form.gender === 'أنثى' ? 'bg-white shadow-2xs text-rose-700 font-black' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  أنثى
                </button>
              </div>
            </div>
          </div>

          {/* Phone Field */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1.5 px-1 whitespace-nowrap">
              رقم الهاتف <span className="text-gray-400 text-[10px] font-normal">(اختياري)</span>
            </label>
            <div
              className={`relative flex items-center h-[42px] border rounded-xl overflow-hidden transition-all shadow-2xs px-3 gap-2 group ${
                isPhoneInvalid
                  ? 'bg-white border-rose-300 focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-200'
                  : 'bg-white border-gray-200 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-200/60'
              }`}
              dir="ltr"
            >
              <div className="shrink-0">
                <Phone
                  size={14}
                  className={
                    isPhoneInvalid
                      ? 'text-rose-500'
                      : 'text-gray-400 group-focus-within:text-teal-600 transition-colors'
                  }
                />
              </div>
              <input 
                type="tel" 
                dir="ltr"
                maxLength={9}
                placeholder="77xxxxxxx" 
                value={toEnglishDigits(form.phone)} 
                onChange={e => handlePhoneChange(e.target.value)}
                className="flex-1 w-full bg-transparent text-xs sm:text-sm font-bold text-gray-800 placeholder-gray-400 focus:outline-none py-1 text-left" 
              />
              {form.phone && form.phone.length >= 2 && (
                <div className="shrink-0">
                  {!isPhoneInvalid ? (
                    <div
                      className="w-5 h-5 rounded-full bg-teal-50 border border-teal-200/60 flex items-center justify-center text-teal-600 animate-in fade-in zoom-in-75"
                      title="بادئة صحيحة"
                    >
                      <Check size={11} strokeWidth={3} />
                    </div>
                  ) : (
                    <div
                      className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 animate-in fade-in zoom-in-75"
                      title="البادئة يجب أن تبدأ بـ 77، 73، 71، 78، 70"
                    >
                      <X size={11} strokeWidth={3} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </form>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3 flex-shrink-0">
          <button 
            type="button"
            onClick={onClose} 
            className="px-5 py-2.5 rounded-xl text-xs font-black bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            إلغاء
          </button>
          <button 
            type="button"
            onClick={handleSubmit} 
            disabled={saving}
            className="bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white font-black py-2.5 px-6 rounded-xl text-xs transition-all shadow-xs shadow-teal-500/20 active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> : <Save size={14} />}
            {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
