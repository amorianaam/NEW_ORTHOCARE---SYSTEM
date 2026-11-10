import React, { useState, useEffect, useCallback, useRef } from "react";
import { usePersistentState } from "../../hooks/usePersistentState";
import { useNavigate } from "react-router-dom";
import PatientQueueCard from "../../components/common/PatientQueueCard";
import {
  Plus,
  Minus,
  User,
  Phone,
  X,
  Crown,
  UserPlus,
  RefreshCcw,
  Users,
  ShieldCheck,
  LayoutGrid,
  List,
  Stethoscope,
  Grid,
  Eye,
  AlertCircle,
  Check,
  RotateCcw,
  Scissors,
  Lock,
  FileText
} from "lucide-react";
import { toast } from "react-toastify";
import axios from "axios";
import useAuthStore from "../../store/useAuthStore";
import useSocketStore from "../../store/useSocketStore";
import taffyot from "../../utils/taffyot";
import { toYemenDate, getShiftStartOfDay, getShiftEndOfDay } from "../../utils/shiftHelpers";
import { createPortal } from "react-dom";
import HistoricEMRModal from "../../components/HistoricEMRModal";

// Helper: Convert Eastern Arabic numerals to standard English digits
const toEnglishDigits = (str) => {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
};

// Format Date/Time in English (Doctor Queue Style - Standardized)
const formatDateTimeEn = (isoStr) => {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return String(isoStr);

  const pad = (n) => n.toString().padStart(2, '0');
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

  let hours = d.getHours();
  const minutes = pad(d.getMinutes());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const time = `${pad(hours)}:${minutes} ${ampm}`;

  return `${date} - ${time}`;
};

// Format Phone Number Helper
const formatPhoneNumber = (phone) => {
  if (!phone) return '—';
  const clean = String(phone).trim().replace(/\D/g, '');
  if (clean.length === 9) {
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }
  if (clean.length === 10 && clean.startsWith('0')) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7)}`;
  }
  return String(phone).trim();
};

export default function VIPCases() {
  const { token } = useAuthStore();
  const lastFetchRef = useRef(0);
  const latestPatientEvent = useSocketStore(state => state.latestPatientEvent);
  const navigate = useNavigate();
  const headers = { Authorization: `Bearer ${token}` };

  // Intake Form State
  const [formData, setFormData] = useState({
    fullName: "",
    age: "",
    gender: "male",
    phone: "",
  });
  const [submittingIntake, setSubmittingIntake] = useState(false);
  const [layoutMode, setLayoutMode] = usePersistentState('global_layout_preference', 'grid');
  const [duplicateAlert, setDuplicateAlert] = useState({ isOpen: false, message: '' });

  // Historic EMR Modal State
  const [selectedPatientForModal, setSelectedPatientForModal] = useState(null);
  const [isEMRModalOpen, setIsEMRModalOpen] = useState(false);

  const openEMRModal = (patient) => {
    setSelectedPatientForModal(patient);
    setIsEMRModalOpen(true);
  };

  const closeEMRModal = () => {
    setIsEMRModalOpen(false);
    setSelectedPatientForModal(null);
  };

  // Smart Matching Engine State
  const [strictMatches, setStrictMatches] = useState([]);
  const [isSearchingMatch, setIsSearchingMatch] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const debounceRef = useRef(null);
  const isAutoFillingRef = useRef(false);

  const searchMatches = useCallback((currentForm) => {
    clearTimeout(debounceRef.current);
    const query = currentForm.fullName?.trim() || '';
    if (query.length < 2) {
      setStrictMatches([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearchingMatch(true);
      try {
        const res = await axios.get(`/api/patients?name=${encodeURIComponent(query)}`, { headers });
        const all = Array.isArray(res.data) ? res.data : [];

        const formAgeNum = currentForm.age ? Number(toEnglishDigits(currentForm.age)) : null;

        const filtered = all.filter(p => {
          // 1. شرط الاسم: مطابقة حقل الاسم فقط وتجاهل أي مطابقة مع رقم الهاتف
          const nameMatch = (p.full_name || '').trim().toLowerCase().includes(query.toLowerCase());
          if (!nameMatch) return false;

          // 2. شرط الجنس
          const genderMatch = !currentForm.gender || p.gender === currentForm.gender;
          if (!genderMatch) return false;

          // 3. شرط رقم الهاتف (إن وُجد جزء منه في النموذج)
          const phoneQuery = (currentForm.phone || '').trim();
          const phoneMatch = phoneQuery.length < 3 || (p.phone || '').includes(phoneQuery);
          if (!phoneMatch) return false;

          // 4. شرط العمر: إذا كان العمر مختلف يتم تجاهل التطابق
          const patientAgeNum = (p.age !== null && p.age !== undefined && String(p.age).trim() !== '') 
            ? Number(toEnglishDigits(p.age)) 
            : null;
          const ageMatch = !formAgeNum || (patientAgeNum !== null ? formAgeNum === patientAgeNum : true);
          if (!ageMatch) return false;

          return true;
        });

        setStrictMatches(filtered);
      } catch {
        setStrictMatches([]);
      } finally {
        setIsSearchingMatch(false);
      }
    }, 500);
  }, [headers]);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const setField = (field, val) => {
    setFormData(p => {
      const newForm = { ...p, [field]: val };
      if (!isAutoFillingRef.current && (field === 'fullName' || field === 'phone' || field === 'gender' || field === 'age')) {
        searchMatches(newForm);
        if (selectedMatch) setSelectedMatch(null);
      }
      return newForm;
    });
  };

  // Helper: check if a record's created_at falls into the current shift (day starts at 3:00 AM)
  const isTodayShift = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const pDate = toYemenDate(d);
    return pDate >= getShiftStartOfDay() && pDate <= getShiftEndOfDay();
  };

  // Active VIP Queue & Selected Active Patient
  const [vipQueue, setVipQueue] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(true);

  // ─── Data Fetching ───────────────────────────────────────────────
  const fetchQueue = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoadingQueue(true);
      lastFetchRef.current = Date.now();
      const res = await axios.get("/api/doctor/queue", { headers });
      if (Array.isArray(res.data)) {
        // Filter only exempt/VIP cases for today's 3:00 AM shift that are not completed/cancelled
        const vips = res.data.filter(
          (v) =>
            v.is_exempt === 1 &&
            v.status !== "completed" &&
            v.status !== "cancelled" &&
            isTodayShift(v.created_at),
        );
        setVipQueue(vips);
      }
    } catch {
      toast.error("فشل تحميل قائمة الحالات المعفاة");
    } finally {
      setLoadingQueue(false);
    }
  }, [token]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Real-time synchronization via Zustand
  useEffect(() => {
    if (latestPatientEvent?.timestamp > lastFetchRef.current) {
      fetchQueue(true); // silent fetch
    }
  }, [latestPatientEvent?.timestamp, fetchQueue]);

  const handleSelectMatch = (row) => {
    if (selectedMatch?.id === row.id) {
      setSelectedMatch(null);
      return;
    }
    isAutoFillingRef.current = true;
    setSelectedMatch(row);
    let matchedPhone = row.phone ? toEnglishDigits(row.phone).replace(/\D/g, '') : '';
    if (matchedPhone.startsWith('0')) matchedPhone = matchedPhone.substring(1);
    if (matchedPhone.length > 9) matchedPhone = matchedPhone.slice(0, 9);

    setFormData(prev => ({
      ...prev,
      fullName: row.full_name,
      phone: matchedPhone,
      gender: row.gender || 'male',
      age: row.age ? String(toEnglishDigits(row.age)) : prev.age
    }));
    setTimeout(() => { isAutoFillingRef.current = false; }, 100);
  };

  const handleAgeChange = (val) => {
    const digits = toEnglishDigits(val).replace(/\D/g, '');
    if (digits === '') {
      setField('age', '');
    } else {
      const num = Math.min(120, parseInt(digits, 10));
      setField('age', String(num));
    }
  };

  const handleIncrementAge = () => {
    const current = parseInt(toEnglishDigits(formData.age), 10);
    const val = isNaN(current) ? 1 : Math.min(120, current + 1);
    setField('age', String(val));
  };

  const handleDecrementAge = () => {
    const current = parseInt(toEnglishDigits(formData.age), 10);
    if (isNaN(current) || current <= 1) return;
    const val = Math.max(1, current - 1);
    setField('age', String(val));
  };

  const handlePhoneChange = (val) => {
    let digits = toEnglishDigits(val).replace(/\D/g, '');
    if (digits.startsWith('0')) {
      digits = digits.substring(1);
    }
    if (digits.length > 9) {
      digits = digits.slice(0, 9);
    }
    setField('phone', digits);
  };

  const handleReset = () => {
    setFormData({ fullName: "", age: "", gender: "male", phone: "" });
    setSelectedMatch(null);
    setStrictMatches([]);
    clearTimeout(debounceRef.current);
  };

  const isPhoneValid = !formData.phone || (formData.phone.length === 9 && ['77', '73', '71', '78'].includes(formData.phone.slice(0, 2)));
  const isFormFilled = Boolean(formData.fullName.trim() && formData.age !== '' && Number(toEnglishDigits(formData.age)) >= 1 && isPhoneValid);

  // ─── Intake Form Handler ─────────────────────────────────────────
  const handleIntakeSubmit = async (e) => {
    e.preventDefault();
    if (!formData.fullName.trim()) return toast.warning("الاسم مطلوب");

    const cleanAge = toEnglishDigits(formData.age || '').replace(/\D/g, '');
    if (!cleanAge || Number(cleanAge) < 1) {
      return toast.warning("يرجى إدخال العمر بشكل صحيح (سنة واحدة على الأقل)");
    }

    const cleanPhone = toEnglishDigits(formData.phone || '').replace(/\D/g, '');
    if (cleanPhone) {
      if (cleanPhone.length !== 9) {
        return toast.warning("رقم الهاتف يجب أن يتكون من 9 أرقام");
      }
      if (!/^(77|73|71|78)/.test(cleanPhone)) {
        return toast.warning("رقم الهاتف يجب أن يبدأ بأحد أرقام الشركات اليمنية (77، 73، 71، 78)");
      }
    }

    setSubmittingIntake(true);
    try {
      const payload = {
        ...formData,
        fullName: formData.fullName.trim(),
        age: parseInt(cleanAge, 10),
        phone: cleanPhone || null,
        patientId: selectedMatch ? selectedMatch.id : undefined,
      };
      const res = await axios.post("/api/doctor/vip-intake", payload, {
        headers,
      });
      toast.success("تم تسجيل حالة الإعفاء المباشرة وبدء المعاينة");
      setFormData({ fullName: "", age: "", gender: "male", phone: "" });
      setSelectedMatch(null);
      setStrictMatches([]);
      fetchQueue();
      // Select the patient immediately
      if (res.data && res.data.visit) {
        handleSelectPatient(res.data.visit);
      }
    } catch (err) {
      if (err.response?.status === 409) {
        setDuplicateAlert({ isOpen: true, message: err.response?.data?.message || 'هذا المريض مسجل بالفعل في قائمة اليوم.' });
      } else {
        toast.error(err.response?.data?.message || "خطأ في حفظ الحالة");
      }
    } finally {
      setSubmittingIntake(false);
    }
  };

  const handleSelectPatient = (visit) => {
    navigate('/doctor/queue', { state: { autoOpenVisitId: visit.visitId } });
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* ── Page Header (Matches DoctorQueue but Amber Theme) ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
            <Stethoscope className="text-amber-500" />
            الحالات المعفاة المباشرة
            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full font-black bg-amber-100/80 text-amber-800 border border-amber-200/80 shadow-2xs select-none">
              <Crown size={13} className="text-amber-600 shrink-0" />
              <span>إعفاء VIP</span>
            </span>
          </h1>
          <p className="text-xs text-gray-400 mt-1 font-semibold">
            تسجيل الحالات المعفاة وإجراء المعاينة مباشرةً دون المرور بقسم المحاسبة.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="bg-amber-50 border border-amber-100 px-4 py-2 rounded-xl text-center">
            <span className="text-[10px] block font-black text-amber-600">حالات نشطة</span>
            <span className="text-xl font-black text-amber-700">{vipQueue.length}</span>
          </div>
        </div>
      </div>

      {/* ── Horizontal Intake Form ── */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-gray-50">
          <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
            <UserPlus size={15} />
          </div>
          <h2 className="font-black text-sm text-gray-800">تسجيل حالة إعفاء جديدة</h2>
        </div>
        <form onSubmit={handleIntakeSubmit}>
          <div className="flex flex-col md:flex-row items-end gap-3.5">
            {/* Full Name */}
            <div className="w-full md:max-w-[280px] flex-1 min-w-[180px]">
              <div className="flex items-center justify-between mb-1.5 px-1">
                <label className="text-[11px] font-bold text-gray-600 flex items-center gap-1 whitespace-nowrap">
                  <span>الاسم الكامل</span>
                  <span className="text-rose-500 font-black">*</span>
                </label>
                {selectedMatch ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md whitespace-nowrap" title="المريض لديه زيارة سابقة">
                    <Lock size={10} className="text-emerald-600 shrink-0" />
                    المريض لديه زيارة سابقة
                  </span>
                ) : isSearchingMatch ? (
                  <span className="text-[10px] font-bold text-amber-600 animate-pulse">جاري البحث...</span>
                ) : null}
              </div>
              <div className={`relative flex items-center h-[38px] border rounded-xl overflow-hidden transition-all shadow-sm px-3 gap-2 group ${
                selectedMatch
                  ? 'bg-slate-100/70 border-slate-200 cursor-not-allowed'
                  : 'bg-white border-gray-200 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500'
              }`}>
                <div className="shrink-0 text-gray-400 group-focus-within:text-amber-500 transition-colors">
                  {selectedMatch ? (
                    <Lock size={15} className="text-emerald-600" />
                  ) : isSearchingMatch ? (
                    <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <User size={15} />
                  )}
                </div>
                <input
                  type="text"
                  placeholder="اسم المريض الرباعي..."
                  value={formData.fullName}
                  onChange={(e) => setField('fullName', e.target.value)}
                  disabled={Boolean(selectedMatch)}
                  className="flex-1 w-full bg-transparent text-xs font-bold text-gray-800 placeholder-gray-400 focus:outline-none py-1 disabled:text-gray-500 disabled:cursor-not-allowed"
                  required
                />
                {formData.fullName && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="shrink-0 w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    title={selectedMatch ? "إلغاء التحديد وتنظيف الحقول" : "مسح الاسم"}
                  >
                    <X size={11} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>

            {/* Age Stepper - Exact Match to Quantity in Receive.js */}
            <div className="w-full md:w-32 shrink-0">
              <label className="block text-[11px] font-bold text-gray-600 mb-1.5 px-1 whitespace-nowrap">
                العمر <span className="text-rose-500 font-black">*</span>
              </label>
              <div className={`relative flex items-center h-[38px] border rounded-xl overflow-hidden transition-all shadow-sm group ${
                selectedMatch
                  ? 'bg-slate-100/70 border-slate-200 cursor-not-allowed'
                  : 'bg-white border-gray-200 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500'
              }`}>
                <button
                  type="button"
                  tabIndex="-1"
                  onClick={handleDecrementAge}
                  disabled={Boolean(selectedMatch) || !formData.age || Number(toEnglishDigits(formData.age)) <= 1}
                  className="w-8 h-full flex items-center justify-center text-gray-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  title="إنقاص"
                >
                  <Minus size={14} strokeWidth={3} />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={toEnglishDigits(formData.age)}
                  onChange={(e) => handleAgeChange(e.target.value)}
                  disabled={Boolean(selectedMatch)}
                  className="flex-1 w-full min-w-0 bg-transparent text-xs font-black text-gray-700 text-center focus:outline-none disabled:text-gray-500 disabled:cursor-not-allowed"
                  placeholder="0"
                  required
                />
                <button
                  type="button"
                  tabIndex="-1"
                  onClick={handleIncrementAge}
                  disabled={Boolean(selectedMatch) || Number(formData.age) >= 120}
                  className="w-8 h-full flex items-center justify-center text-gray-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  title="زيادة"
                >
                  <Plus size={14} strokeWidth={3} />
                </button>
              </div>
            </div>

            {/* Gender - Compact Control */}
            <div className="w-full md:w-36 shrink-0">
              <label className="block text-[11px] font-bold text-gray-600 mb-1.5 px-1 whitespace-nowrap">
                الجنس
              </label>
              <div className={`flex p-0.5 rounded-xl h-[38px] items-center border transition-all ${
                selectedMatch ? 'bg-slate-100/70 border-slate-200 opacity-80 cursor-not-allowed' : 'bg-gray-100/80 border-gray-200/50'
              }`}>
                <button
                  type="button"
                  disabled={Boolean(selectedMatch)}
                  onClick={() => setField('gender', 'male')}
                  className={`flex-1 h-[32px] text-[11px] font-bold rounded-lg transition-all flex items-center justify-center ${
                    selectedMatch ? 'cursor-not-allowed' : 'cursor-pointer'
                  } ${
                    formData.gender === 'male' ? 'bg-white shadow-2xs text-blue-700 font-black' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  ذكر
                </button>
                <button
                  type="button"
                  disabled={Boolean(selectedMatch)}
                  onClick={() => setField('gender', 'female')}
                  className={`flex-1 h-[32px] text-[11px] font-bold rounded-lg transition-all flex items-center justify-center ${
                    selectedMatch ? 'cursor-not-allowed' : 'cursor-pointer'
                  } ${
                    formData.gender === 'female' ? 'bg-white shadow-2xs text-rose-700 font-black' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  أنثى
                </button>
              </div>
            </div>

            {/* Phone - Optional, Amber Glow, Valid Indicator */}
            <div className="w-full md:w-44 shrink-0">
              <label className="block text-[11px] font-bold text-gray-600 mb-1.5 px-1 whitespace-nowrap">
                رقم الهاتف <span className="text-gray-400 text-[10px] font-normal">(اختياري)</span>
              </label>
              <div
                className={`relative flex items-center h-[38px] border rounded-xl overflow-hidden transition-all shadow-sm px-3 gap-2 group ${
                  selectedMatch
                    ? 'bg-slate-100/70 border-slate-200 cursor-not-allowed'
                    : formData.phone && formData.phone.length >= 2 && !['77', '73', '71', '78'].includes(formData.phone.slice(0, 2))
                      ? 'bg-white border-rose-300 focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500'
                      : 'bg-white border-gray-200 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500'
                }`}
                dir="ltr"
              >
                <div className="shrink-0">
                  <Phone
                    size={14}
                    className={
                      formData.phone && formData.phone.length >= 2 && !['77', '73', '71', '78'].includes(formData.phone.slice(0, 2))
                        ? 'text-rose-500'
                        : selectedMatch
                          ? 'text-emerald-600'
                          : 'text-gray-400 group-focus-within:text-amber-500 transition-colors'
                    }
                  />
                </div>
                <input
                  type="tel"
                  dir="ltr"
                  maxLength={9}
                  placeholder="77xxxxxxx"
                  value={toEnglishDigits(formData.phone)}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  disabled={Boolean(selectedMatch)}
                  className="flex-1 w-full bg-transparent text-xs font-bold text-gray-800 placeholder-gray-400 focus:outline-none py-1 text-left disabled:text-gray-500 disabled:cursor-not-allowed"
                />
                {!selectedMatch && formData.phone && formData.phone.length >= 2 && (
                  <div className="shrink-0">
                    {['77', '73', '71', '78'].includes(formData.phone.slice(0, 2)) ? (
                      <div
                        className="w-5 h-5 rounded-full bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-600 animate-in fade-in zoom-in-75"
                        title="بادئة صحيحة"
                      >
                        <Check size={11} strokeWidth={3} />
                      </div>
                    ) : (
                      <div
                        className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 animate-in fade-in zoom-in-75"
                        title="البادئة يجب أن تبدأ بـ 77، 73، 71، 78"
                      >
                        <X size={11} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Submit & Reset Buttons in Same Row */}
            <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
              {isFormFilled && (
                <button
                  type="submit"
                  disabled={submittingIntake}
                  className="w-full md:w-auto h-[38px] px-5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-black text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 shrink-0 whitespace-nowrap cursor-pointer active:scale-98 animate-in fade-in duration-200"
                >
                  {submittingIntake ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <UserPlus size={16} />
                  )}
                  <span>تسجيل وبدء المعاينة</span>
                </button>
              )}

              {selectedMatch && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full md:w-auto h-[38px] px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 shadow-2xs cursor-pointer active:scale-95 whitespace-nowrap"
                  title="إلغاء التحديد وتنظيف الحقول"
                >
                  <RotateCcw size={13} strokeWidth={2.2} />
                  <span>إلغاء التحديد</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* ── Smart Match Results ── */}
      {(isSearchingMatch || strictMatches.length > 0) && (
        <div className="bg-amber-50/50 rounded-3xl p-5 shadow-sm border border-amber-200">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle size={16} className="text-amber-600" />
            <h3 className="font-black text-sm text-amber-800">
              {isSearchingMatch ? 'جاري البحث عن سجلات مطابقة...' : `تنبيه: يوجد تطابق في السجلات الطبية (${strictMatches.length} نتائج)`}
            </h3>
          </div>
          {isSearchingMatch ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap table-fixed">
                  <thead className="bg-gradient-to-r from-slate-50/90 via-amber-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                    <tr>
                      <th className="w-[6%] px-3 py-4 text-center font-black text-xs text-slate-600">تحديد</th>
                      <th className="w-[32%] px-4 py-4 text-right font-black text-xs text-slate-600">المريض</th>
                      <th className="w-[15%] px-4 py-4 text-center font-black text-xs text-slate-600">إجمالي الزيارات</th>
                      <th className="w-[16%] px-4 py-4 text-right font-black text-xs text-slate-600">رقم الهاتف</th>
                      <th className="w-[18%] px-4 py-4 text-right font-black text-xs text-slate-600">تاريخ آخر مراجعة</th>
                      <th className="w-[13%] px-4 py-4 text-center font-black text-xs text-slate-600">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/70">
                    {strictMatches.map(row => {
                      const isSelected = selectedMatch?.id === row.id;
                      const dateFormatted = row.last_visit_date 
                        ? formatDateTimeEn(row.last_visit_date) 
                        : "لا يوجد";
                      const phoneFormatted = formatPhoneNumber(row.phone);

                      return (
                        <tr 
                          key={row.id} 
                          onClick={() => handleSelectMatch(row)}
                          className={`hover:bg-amber-50/30 cursor-pointer transition-colors border-b border-slate-100/70 last:border-0 group ${
                            isSelected ? 'bg-amber-50/60 ring-1 ring-inset ring-amber-200' : ''
                          }`}
                        >
                          {/* Selection Radio Circle */}
                          <td className="w-[6%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                            <div className="flex items-center justify-center">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleSelectMatch(row); }}
                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                                  isSelected
                                    ? 'border-amber-600 bg-amber-600 text-white shadow-xs ring-2 ring-amber-200'
                                    : 'border-slate-300 bg-white hover:border-amber-500'
                                }`}
                                title={isSelected ? 'إلغاء التحديد' : 'تحديد السجل الطبي'}
                              >
                                {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                              </button>
                            </div>
                          </td>

                          {/* Patient Details */}
                          <td className="w-[32%] px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 group-hover:scale-105 transition-transform bg-gradient-to-br from-amber-50 to-amber-100/80 text-amber-700 border border-amber-200/50">
                                {row.full_name?.charAt(0) ?? '؟'}
                              </div>
                              <div className="flex flex-col gap-0.5 min-w-0 text-right" dir="rtl">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-black text-slate-800 text-sm group-hover:text-amber-700 transition-colors truncate">
                                    {row.full_name}
                                  </span>
                                  {Boolean(row.is_follow_up) && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-emerald-100/75 text-emerald-700 border border-emerald-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                      <RotateCcw size={11} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                                      <span>مراجعة</span>
                                    </span>
                                  )}
                                  {Boolean(row.is_exempt) && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-amber-100/75 text-amber-700 border border-amber-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                      <Crown size={11} className="text-amber-600 shrink-0" strokeWidth={2.2} />
                                      <span>إعفاء</span>
                                    </span>
                                  )}
                                  {Boolean(row.is_surgery || row.has_surgery || row.has_surgeries || row.status === 'transferred_to_center') && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                      <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                                      <span>عمليات</span>
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] font-bold text-slate-400 text-right mt-0.5" dir="rtl">
                                  <span dir="ltr">{row.visit_number || row.visit_id || row.latest_visit_id || row.id}</span>
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Total Visits */}
                          <td className="w-[15%] px-4 py-4 text-center">
                            {Number(row.total_visits) > 1 ? (
                              <span 
                                className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100/90 text-slate-700 border border-slate-200/50 cursor-help"
                                title={row.all_visit_numbers ? `معرفات الزيارات: ${row.all_visit_numbers}` : undefined}
                              >
                                {Number(row.total_visits) === 2 ? 'زيارتان' : `${row.total_visits} زيارات`}
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-slate-400">زيارة واحدة</span>
                            )}
                          </td>

                          {/* Phone */}
                          <td className="w-[16%] px-4 py-4 text-right">
                            <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                              {phoneFormatted}
                            </span>
                          </td>

                          {/* Date */}
                          <td className="w-[18%] px-4 py-4 text-right">
                            <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                              {dateFormatted}
                            </span>
                          </td>

                          {/* Action Button: Preview Archive File */}
                          <td className="w-[13%] px-4 py-4 text-center">
                            <div className="flex items-center justify-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEMRModal({
                                    id: row.patient_id || row.id,
                                    patient_id: row.patient_id || row.id,
                                    full_name: row.full_name,
                                    age: row.age,
                                    gender: row.gender,
                                    phone: row.phone,
                                    visit_number: row.visit_number,
                                    visitId: row.visitId || row.id,
                                    status: row.status,
                                    visit_status: row.visit_status,
                                    is_exempt: row.is_exempt,
                                    is_follow_up: row.is_follow_up,
                                    is_surgery: row.is_surgery,
                                    created_at: row.created_at
                                  });
                                }}
                                className="w-8 h-8 rounded-xl inline-flex items-center justify-center text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-xs shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
                                title="معاينة ملف الأرشيف"
                              >
                                <FileText size={14} strokeWidth={2.2} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Active Queue Section ── */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
        {/* Section Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-50 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
              <Users size={15} />
            </div>
            <div>
              <h2 className="font-black text-sm text-gray-800">الحالات النشطة اليوم</h2>
            </div>
          </div>
          {/* View Toggles */}
          <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
            <button
              onClick={() => setLayoutMode("grid")}
              className={`p-1.5 rounded-lg transition-all ${
                layoutMode === "grid" ? "bg-white text-amber-700 shadow-sm" : "text-gray-400 hover:text-gray-600"
              }`}
              title="عرض كشبكة"
            >
              <Grid size={16} />
            </button>
            <button
              onClick={() => setLayoutMode("list")}
              className={`p-1.5 rounded-lg transition-all ${
                layoutMode === "list" ? "bg-white text-amber-700 shadow-sm" : "text-gray-400 hover:text-gray-600"
              }`}
              title="عرض كقائمة"
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        {loadingQueue ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : vipQueue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-gray-300 mb-4 shadow-sm">
              <ShieldCheck size={32} />
            </div>
            <p className="text-sm font-black text-gray-500">لا توجد حالات إعفاء معلقة</p>
            <p className="text-[11px] text-gray-400 mt-1 font-semibold">استخدم النموذج أعلاه لإضافة حالة جديدة</p>
          </div>
        ) : layoutMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {vipQueue.map((item, idx) => (
              <PatientQueueCard
                key={item.visitId}
                index={idx + 1}
                visit={{ ...item, is_exempt: item.is_exempt ?? 1 }}
                onClick={() => handleSelectPatient(item)}
                colorTheme="amber"
                hideStatus={true}
                actionLabel="معاينة المريض"
                actionIcon={<Stethoscope size={13} strokeWidth={2.5} />}
                onActionClick={() => handleSelectPatient(item)}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap table-fixed">
                <thead className="bg-gradient-to-r from-slate-50/90 via-amber-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                  <tr>
                    <th className="w-[6%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                    <th className="w-[38%] px-4 py-4 text-right font-black text-xs text-slate-600">المريض</th>
                    <th className="w-[16%] px-4 py-4 text-center font-black text-xs text-slate-600">إجمالي الزيارات</th>
                    <th className="w-[22%] px-4 py-4 text-right font-black text-xs text-slate-600">وقت وتاريخ التسجيل</th>
                    <th className="w-[18%] px-4 py-4 text-center font-black text-xs text-slate-600">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/70">
                  {vipQueue.map((visit, idx) => {
                    const dateFormatted = visit.created_at
                      ? `${new Date(visit.created_at).toLocaleDateString("en-GB")} - ${new Date(visit.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}`
                      : "--";
                    return (
                      <tr
                        key={visit.visitId}
                        onClick={() => handleSelectPatient(visit)}
                        className="hover:bg-amber-50/30 cursor-pointer transition-colors border-b border-slate-100/70 last:border-0 group"
                      >
                        {/* # Number */}
                        <td className="w-[6%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                          {idx + 1}
                        </td>

                        {/* Patient Details */}
                        <td className="w-[38%] px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 group-hover:scale-105 transition-transform bg-gradient-to-br from-amber-50 to-amber-100/80 text-amber-700 border border-amber-200/50">
                              {visit.full_name?.charAt(0) ?? '؟'}
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0 text-right" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="font-black text-slate-800 text-sm group-hover:text-amber-700 transition-colors truncate">
                                  {visit.full_name}
                                </span>
                                {(visit.is_exempt == null || Boolean(visit.is_exempt)) && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-amber-100/75 text-amber-700 border border-amber-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                    <Crown size={11} className="text-amber-600 shrink-0" strokeWidth={2.2} />
                                    <span>إعفاء</span>
                                  </span>
                                )}
                                {Boolean(visit.is_follow_up) && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-emerald-100/75 text-emerald-700 border border-emerald-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                    <RotateCcw size={11} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                                    <span>مراجعة</span>
                                  </span>
                                )}
                                {Boolean(visit.is_surgery || visit.has_surgeries || visit.has_surgery || visit.status === 'transferred_to_center' || (Array.isArray(visit.surgeries) && visit.surgeries.length > 0)) && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                    <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                                    <span>عمليات</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] font-bold text-slate-400 text-right mt-0.5 w-full" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                                <span dir="ltr">{visit.visit_number || visit.visitId}</span>
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Total Visits */}
                        <td className="w-[16%] px-4 py-4 text-center">
                          {Number(visit.total_visits) > 1 ? (
                            <span 
                              className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100/90 text-slate-700 border border-slate-200/50 cursor-help"
                              title={visit.all_visit_numbers ? `معرفات الزيارات: ${visit.all_visit_numbers}` : undefined}
                            >
                              {Number(visit.total_visits) === 2 ? 'زيارتان' : `${visit.total_visits} زيارات`}
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-slate-400">
                              زيارة واحدة
                            </span>
                          )}
                        </td>

                        {/* Date and Time */}
                        <td className="w-[22%] px-4 py-4 text-right">
                          <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                            {dateFormatted}
                          </span>
                        </td>

                        {/* Action Button */}
                        <td className="w-[20%] px-4 py-4 text-center">
                          <div className="flex items-center justify-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectPatient(visit);
                              }}
                              className="px-4 py-2 font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-amber-500/20 hover:shadow-md hover:shadow-amber-500/30"
                            >
                              <Stethoscope size={13} strokeWidth={2.5} />
                              <span>معاينة المريض</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ─── CUSTOM DUPLICATE ALERT MODAL ─── */}
      {duplicateAlert.isOpen && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm modal-overlay-anim" dir="rtl">
          <div className="bg-white rounded-3xl shadow-luxury overflow-hidden flex flex-col border border-gray-100 animate-scale-in transition-all duration-300 w-full max-w-md">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-2">
                <AlertCircle size={32} />
              </div>
              <h3 className="font-extrabold text-lg text-gray-800">تنبيه تسجيل مكرر</h3>
              <p className="text-gray-500 text-sm font-semibold leading-relaxed">
                {duplicateAlert.message}
              </p>
            </div>
            <div className="flex gap-3 p-4 bg-gray-50/50 border-t border-gray-150">
              <button 
                onClick={() => setDuplicateAlert({ isOpen: false, message: '' })}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl text-sm shadow-md transition-colors"
              >
                حسناً، فهمت
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Historic EMR Modal ── */}
      {isEMRModalOpen && selectedPatientForModal && (
        <HistoricEMRModal
          isOpen={isEMRModalOpen}
          onClose={closeEMRModal}
          patient={selectedPatientForModal}
        />
      )}

    </div>
  );
}
