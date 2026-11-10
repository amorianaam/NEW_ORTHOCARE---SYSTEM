import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  User, Phone, Save, UserCheck, Users, FileText, Clock, LayoutGrid, List, 
  AlertCircle, Eye, Plus, Minus, Check, X, RotateCcw, Crown, Scissors, 
  UserPlus, Search, Lock 
} from 'lucide-react';
import { usePersistentState } from '../hooks/usePersistentState';
import HistoricEMRModal from '../components/HistoricEMRModal';
import { toast } from 'react-toastify';
import axios from 'axios';
import useAuthStore from '../store/useAuthStore';
import useSocketStore from '../store/useSocketStore';
import { getCurrentShiftDate, formatShiftDate, getShiftStartOfDay } from '../utils/shiftHelpers';

// Helper: Convert Eastern Arabic numerals to standard English digits
const toEnglishDigits = (val) => {
  if (!val && val !== 0) return '';
  return String(val)
    .replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
    .replace(/[۰-۹]/g, (d) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)]);
};



// Format Date/Time in English (Doctor Queue & Dashboard Style)
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

const EMPTY_FORM = {
  fullName: '', 
  age: '', 
  gender: 'male', 
  phone: '',
  entity: 'clinic', // Always clinic by default
};

const RegisterPatient = () => {
  const { token } = useAuthStore();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [todayVisits, setTodayVisits] = useState([]);
  const [loadingVisits, setLoadingVisits] = useState(true);
  const [searchVisits, setSearchVisits] = useState('');

  // Smart Matching Engine
  const [strictMatches, setStrictMatches] = useState([]);
  const [isSearchingMatch, setIsSearchingMatch] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const debounceRef = useRef(null);
  const isAutoFillingRef = useRef(false);

  // EMR Modal State
  const [selectedPatientForModal, setSelectedPatientForModal] = useState(null);
  const [isEMRModalOpen, setIsEMRModalOpen] = useState(false);

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

        // CLIENT-SIDE FILTER: مطابقة الاسم فقط وتجاهل التطابق إذا اختلف العمر
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

  // Clean up debounce on unmount
  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  // Layout preference
  const [layoutMode, setLayoutMode] = usePersistentState('global_layout_preference', 'grid');

  // Sorted visits for today (Day starts at 03:00 AM)
  const sortedVisits = useMemo(() => {
    const todayShiftStr = getCurrentShiftDate();
    return [...todayVisits]
      .filter(v => formatShiftDate(getShiftStartOfDay(v.created_at)) === todayShiftStr || v.is_today === 1 || v.is_today === true)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [todayVisits]);

  // Filtered visits by search query
  const filteredVisits = useMemo(() => {
    const q = searchVisits.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return sortedVisits.filter(v => {
      if (!q) return true;
      return (
        (v.full_name || '').toLowerCase().includes(q) ||
        (v.phone && (String(v.phone).includes(q) || (qDigits && String(v.phone).replace(/\D/g, '').includes(qDigits)))) ||
        String(v.visit_number || v.patient_id || v.id || '').toLowerCase().includes(q)
      );
    });
  }, [sortedVisits, searchVisits]);

  const isAlreadyRegisteredToday = useMemo(() => {
    if (!selectedMatch) return false;
    return sortedVisits.some(v => v.patient_id === selectedMatch.id);
  }, [selectedMatch, sortedVisits]);

  // Deep Hydration: Listen for updates
  const latestSilentUpdate = useSocketStore(state => state.latestSilentUpdate);
  const lastFetchRef = useRef(0);

  const fetchTodayVisits = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoadingVisits(true);
      const res = await axios.get('/api/patients/visits/today', { headers });
      setTodayVisits(Array.isArray(res.data) ? res.data : []);
      lastFetchRef.current = Date.now();
    } catch {
      if (!silent) toast.error('تعذر مزامنة سجل زيارات اليوم');
    } finally {
      setLoadingVisits(false);
    }
  }, [headers]);

  useEffect(() => {
    fetchTodayVisits();
  }, [fetchTodayVisits]);

  useEffect(() => {
    if (latestSilentUpdate?.timestamp > lastFetchRef.current) {
      fetchTodayVisits(true);
    }
  }, [latestSilentUpdate?.timestamp, fetchTodayVisits]);

  const set = (field, val) => {
    setForm(p => {
      const newForm = { ...p, [field]: val };
      if (!isAutoFillingRef.current && (field === 'fullName' || field === 'phone' || field === 'gender' || field === 'age')) {
        searchMatches(newForm);
        if (selectedMatch) setSelectedMatch(null);
      }
      return newForm;
    });
  };

  const handleIncrementAge = () => {
    const current = Number(toEnglishDigits(form.age)) || 0;
    if (current < 120) {
      set('age', String(current + 1));
    }
  };

  const handleDecrementAge = () => {
    const current = Number(toEnglishDigits(form.age)) || 0;
    if (current > 1) {
      set('age', String(current - 1));
    }
  };

  const handleAgeChange = (val) => {
    const eng = toEnglishDigits(val).replace(/\D/g, '');
    if (eng === '') {
      set('age', '');
      return;
    }
    const num = Number(eng);
    if (num <= 120) {
      set('age', String(num));
    }
  };

  const handlePhoneChange = (val) => {
    const eng = toEnglishDigits(val).replace(/\D/g, '');
    if (eng.length <= 9) {
      set('phone', eng);
    }
  };

  const handleReset = () => {
    setForm(EMPTY_FORM);
    setStrictMatches([]);
    setSelectedMatch(null);
    clearTimeout(debounceRef.current);
  };

  const handleSelectMatch = (row) => {
    if (selectedMatch?.id === row.id) {
      setSelectedMatch(null);
      return;
    }

    isAutoFillingRef.current = true;

    setForm(p => ({
      ...p,
      fullName: row.full_name,
      age: String(row.age || ''),
      gender: row.gender || 'male',
      phone: row.phone || '',
      entity: 'clinic',
    }));
    setSelectedMatch(row);

    requestAnimationFrame(() => {
      isAutoFillingRef.current = false;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.fullName.trim()) return toast.error('يرجى إدخال اسم المريض');
    if (!form.age || isNaN(form.age) || Number(form.age) < 0 || Number(form.age) > 150)
      return toast.error('يرجى التحقق من صحة العمر المُدخل');

    setLoading(true);
    try {
      const payload = {
        ...form,
        entity: 'clinic' // Always enforce clinic referral
      };
      const res = await axios.post('/api/patients', payload, { headers });
      const data = res.data;
      toast.success(`تم فتح ملف طبي للمريض "${form.fullName || 'المريض'}" بنجاح — رقم الزيارة: ${data.visitNumber ?? 'جديد'}`);
      handleReset();
      fetchTodayVisits(true);
    } catch (err) {
      const msg = err.response?.data?.message || 'فشلت عملية إنشاء الملف الطبي';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleNewVisit = async () => {
    if (!selectedMatch) return;
    setLoading(true);
    try {
      const res = await axios.post(
        `/api/patients/${selectedMatch.id}/visits`,
        { entity: 'clinic', visitType: 'paid_revisit' },
        { headers }
      );
      toast.success(`تم تسجيل زيارة للملف الطبي بنجاح "${selectedMatch.full_name}"`);
      handleReset();
      fetchTodayVisits(true);
    } catch (err) {
      const msg = err.response?.data?.message || 'حدث خطأ أثناء تسجيل الزيارة';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const openEMRModal = (patient) => {
    setSelectedPatientForModal(patient);
    setIsEMRModalOpen(true);
  };

  const closeEMRModal = () => {
    setIsEMRModalOpen(false);
    setSelectedPatientForModal(null);
  };

  // Render cards / tables (without status field!)
  const renderPatientTable = ({ rows, onRowClick, selectedId, isMatch }) => {
    if (layoutMode === 'list' || isMatch) {
      return (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap table-fixed">
              <thead className="bg-gradient-to-r from-slate-50/90 via-teal-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                <tr>
                  <th className="w-[6%] px-3 py-4 text-center font-black text-xs text-slate-600">
                    {isMatch ? 'تحديد' : '#'}
                  </th>
                  <th className="w-[32%] px-4 py-4 text-right font-black text-xs text-slate-600">المريض</th>
                  <th className="w-[15%] px-4 py-4 text-center font-black text-xs text-slate-600">إجمالي الزيارات</th>
                  <th className="w-[16%] px-4 py-4 text-right font-black text-xs text-slate-600">رقم الهاتف</th>
                  <th className="w-[18%] px-4 py-4 text-right font-black text-xs text-slate-600">
                    {isMatch ? 'تاريخ آخر مراجعة' : 'وقت وتاريخ التسجيل'}
                  </th>
                  <th className="w-[13%] px-4 py-4 text-center font-black text-xs text-slate-600">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/70">
                {rows.map((row, idx) => {
                  const dateFormatted = isMatch 
                    ? (row.last_visit_date ? formatDateTimeEn(row.last_visit_date) : "لا يوجد")
                    : formatDateTimeEn(row.created_at);
                  const phoneFormatted = formatPhoneNumber(row.phone);
                  const isCancelled = row.status === 'cancelled' || row.visit_status === 'cancelled' || row.visit_status === 'financial_cancelled';

                  return (
                    <tr 
                      key={row.id || idx} 
                      onClick={() => onRowClick ? onRowClick(row) : openEMRModal({ ...row, id: row.patient_id || row.id, status: row.status, visit_status: row.visit_status })}
                      className={`hover:bg-teal-50/30 cursor-pointer transition-colors border-b border-slate-100/70 last:border-0 group ${
                        isCancelled ? 'opacity-65 bg-rose-50/20 border-rose-200/60 hover:bg-rose-50/40' : ''
                      } ${
                        selectedId === row.id ? 'bg-teal-50/60 ring-1 ring-inset ring-teal-200' : ''
                      }`}
                    >
                      {/* Selection / Index */}
                      <td className="w-[6%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                        {isMatch ? (
                          <div className="flex items-center justify-center">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onRowClick?.(row); }}
                              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                                selectedId === row.id
                                  ? 'border-teal-600 bg-teal-600 text-white shadow-xs ring-2 ring-teal-200'
                                  : 'border-slate-300 bg-white hover:border-teal-500'
                              }`}
                              title={selectedId === row.id ? 'إلغاء التحديد' : 'تحديد السجل الطبي'}
                            >
                              {selectedId === row.id && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                            </button>
                          </div>
                        ) : (
                          idx + 1
                        )}
                      </td>

                      {/* Patient Details */}
                      <td className="w-[30%] px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 group-hover:scale-105 transition-transform bg-gradient-to-br from-teal-50 to-teal-100/80 text-teal-700 border border-teal-200/50">
                            {row.full_name?.charAt(0) ?? '؟'}
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0 text-right" dir="rtl">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-black text-slate-800 text-sm group-hover:text-teal-700 transition-colors truncate">
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
                              <span dir="ltr">{isMatch ? (row.visit_number || row.visit_id || row.latest_visit_id || row.id) : (row.visit_number || row.patient_id || row.id)}</span>
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

                      {/* Action */}
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
                            className="w-8 h-8 rounded-xl inline-flex items-center justify-center text-white bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 shadow-xs shadow-teal-500/20 active:scale-95 transition-all cursor-pointer"
                            title="فتح الملف الطبي"
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
      );
    }

    // Grid Mode (NO status badge)
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {rows.map((row, idx) => {
          const dateFormatted = isMatch 
            ? (row.last_visit_date ? formatDateTimeEn(row.last_visit_date) : "لا يوجد")
            : formatDateTimeEn(row.created_at);
          const phoneFormatted = formatPhoneNumber(row.phone);
          const hasPhone = Boolean(row.phone && String(row.phone).trim() && String(row.phone).trim() !== '-' && String(row.phone).trim() !== '—');
          const hasVisitsCount = Number(row.total_visits) > 1;
          const isCancelled = row.status === 'cancelled' || row.visit_status === 'cancelled' || row.visit_status === 'financial_cancelled';

          return (
            <div
              key={row.id || idx}
              onClick={() => onRowClick ? onRowClick(row) : openEMRModal({ ...row, id: row.patient_id || row.id, status: row.status, visit_status: row.visit_status })}
              className={`bg-white rounded-3xl border cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg flex flex-col justify-between p-5 select-none shadow-[0_4px_20px_rgb(0,0,0,0.03)] group ${
                isCancelled
                  ? 'border-rose-200/90 bg-rose-50/15 opacity-65 hover:opacity-85 hover:border-rose-300'
                  : 'border-slate-100/90 hover:border-teal-300'
              } ${
                selectedId === row.id ? 'ring-2 ring-teal-500 border-teal-500 bg-teal-50/20' : ''
              }`}
              dir="rtl"
            >
              {/* Top: Avatar + Patient Name + Badges + Subtext + Index Badge */}
              <div className="flex justify-between items-start gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center font-black text-base transition-transform group-hover:scale-105 shadow-xs bg-gradient-to-br from-teal-50 to-teal-100/80 text-teal-700 border border-teal-200/50">
                    {row.full_name?.charAt(0) ?? '؟'}
                  </div>
                  <div className="min-w-0 flex-1 text-right" dir="rtl">
                    <div className="flex items-center gap-1 flex-wrap">
                      <h3 className="font-black text-slate-800 text-sm leading-tight group-hover:text-teal-700 transition-colors truncate">
                        {row.full_name || 'مريض غير معروف'}
                      </h3>
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
                    <p className="text-[11px] font-bold text-slate-400 text-right mt-1 w-full" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                      <span dir="ltr">{isMatch ? (row.visit_number || row.visit_id || row.latest_visit_id || row.id) : (row.visit_number || row.patient_id || row.id)}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                  {isMatch ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRowClick?.(row); }}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                          selectedId === row.id
                            ? 'border-teal-600 bg-teal-600 text-white shadow-xs ring-2 ring-teal-200'
                            : 'border-slate-300 bg-white hover:border-teal-500'
                        }`}
                        title={selectedId === row.id ? 'إلغاء التحديد' : 'تحديد السجل الطبي'}
                      >
                        {selectedId === row.id && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                      </button>
                      <span className="text-[10px] font-black text-slate-400 px-1.5 py-0.5 bg-slate-50 rounded-md border border-slate-100 leading-none">
                        {idx + 1}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-black text-slate-400 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100">
                      {idx + 1}
                    </span>
                  )}
                </div>
              </div>

              {/* Middle row: Total Visits badge (Right) + Phone (Left) */}
              {(hasVisitsCount || hasPhone) && (
                <div className="mt-3.5 pt-3 border-t border-slate-100/80 flex items-center justify-between min-h-[30px]">
                  {hasVisitsCount ? (
                    <div className="text-right">
                      <span 
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200/50 cursor-help"
                        title={row.all_visit_numbers ? `معرفات الزيارات: ${row.all_visit_numbers}` : undefined}
                      >
                        {Number(row.total_visits) === 2 ? 'زيارتان' : `${row.total_visits} زيارات`}
                      </span>
                    </div>
                  ) : (
                    <div />
                  )}
                  {hasPhone ? (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                      <Phone size={13} className="text-slate-400 shrink-0" />
                      <span>{phoneFormatted}</span>
                    </div>
                  ) : (
                    <div />
                  )}
                </div>
              )}

              {/* Bottom Metadata: Date/Time + (NO status badge) + Action Button */}
              <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100/80 gap-2">
                <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                  {dateFormatted}
                </span>
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
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-black text-white bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 rounded-xl shadow-xs shadow-teal-500/20 active:scale-95 transition-all cursor-pointer"
                  title="فتح الملف"
                >
                  <FileText size={13} strokeWidth={2.2} />
                  <span>فتح الملف</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 w-full" dir="rtl">
      {/* EMR Modal */}
      {isEMRModalOpen && selectedPatientForModal && (
        <HistoricEMRModal
          patient={selectedPatientForModal}
          onClose={closeEMRModal}
          token={token}
          hideFinancials={true}
        />
      )}

      {/* ── 1. Page Header Banner (Matching SecretaryDashboard style) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 flex-shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 text-white flex items-center justify-center shadow-md shadow-teal-500/20">
            <UserPlus size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800">استقبال وتسجيل المرضى</h1>
            <p className="text-sm font-bold text-gray-500 mt-0.5">
              فتح ملفات طبية جديدة، مطابقة السجلات السابقة، وتسجيل زيارات المراجعين للعيادة
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white px-4 py-2.5 rounded-2xl border border-gray-100 shadow-sm text-sm font-bold text-gray-600">
            تسجيلات اليوم: <span className="text-teal-700 font-black text-lg">{sortedVisits.filter(v => !v.is_follow_up).length}</span>
          </div>
          <div className="bg-white px-4 py-2.5 rounded-2xl border border-gray-100 shadow-sm text-sm font-bold text-gray-600">
            المراجعات: <span className="text-emerald-700 font-black text-lg">{sortedVisits.filter(v => v.is_follow_up).length}</span>
          </div>
        </div>
      </div>

      {/* ── 2. Personal Information Section (Matching VIPCases Intake style) ── */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-gray-50">
          <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
            <UserPlus size={15} />
          </div>
          <h2 className="font-black text-sm text-gray-800">المعلومات الشخصية</h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col md:flex-row items-end gap-3.5">
            {/* Full Name */}
            <div className="w-full md:max-w-[280px] flex-1 min-w-[200px]">
              <div className="flex items-center justify-between mb-1.5 px-1">
                <label className="text-[11px] font-bold text-gray-600 flex items-center gap-1 whitespace-nowrap">
                  <span>اسم المريض</span>
                  <span className="text-rose-500 font-black">*</span>
                </label>
                {selectedMatch ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md whitespace-nowrap" title="المريض لديه زيارة سابقة">
                    <Lock size={10} className="text-emerald-600 shrink-0" />
                    المريض لديه زيارة سابقة
                  </span>
                ) : isSearchingMatch ? (
                  <span className="text-[10px] font-bold text-teal-600 animate-pulse">جاري البحث...</span>
                ) : null}
              </div>
              <div className={`relative flex items-center h-[38px] border rounded-xl overflow-hidden transition-all shadow-sm px-3 gap-2 group ${
                selectedMatch
                  ? 'bg-slate-100/70 border-slate-200 cursor-not-allowed'
                  : 'bg-white border-gray-200 focus-within:border-teal-500 focus-within:ring-1 focus-within:ring-teal-500'
              }`}>
                <div className="shrink-0 text-gray-400 group-focus-within:text-teal-500 transition-colors">
                  {selectedMatch ? (
                    <Lock size={15} className="text-emerald-600" />
                  ) : isSearchingMatch ? (
                    <div className="w-3.5 h-3.5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <User size={15} />
                  )}
                </div>
                <input
                  type="text"
                  placeholder="اسم المريض الرباعي..."
                  value={form.fullName}
                  onChange={(e) => set('fullName', e.target.value)}
                  disabled={Boolean(selectedMatch)}
                  className="flex-1 w-full bg-transparent text-xs font-bold text-gray-800 placeholder-gray-400 focus:outline-none py-1 disabled:text-gray-500 disabled:cursor-not-allowed"
                  required
                />
                {form.fullName && (
                  <button
                    type="button"
                    onClick={() => {
                      set('fullName', '');
                      setSelectedMatch(null);
                      setStrictMatches([]);
                    }}
                    className="shrink-0 w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    title={selectedMatch ? "إلغاء التحديد ومسح الاسم" : "مسح الاسم"}
                  >
                    <X size={11} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>

            {/* Age Stepper */}
            <div className="w-full md:w-32 shrink-0">
              <label className="block text-[11px] font-bold text-gray-600 mb-1.5 px-1 whitespace-nowrap">
                العمر <span className="text-rose-500 font-black">*</span>
              </label>
              <div className={`relative flex items-center h-[38px] border rounded-xl overflow-hidden transition-all shadow-sm group ${
                selectedMatch
                  ? 'bg-slate-100/70 border-slate-200 cursor-not-allowed'
                  : 'bg-white border-gray-200 focus-within:border-teal-500 focus-within:ring-1 focus-within:ring-teal-500'
              }`}>
                <button
                  type="button"
                  tabIndex="-1"
                  onClick={handleDecrementAge}
                  disabled={Boolean(selectedMatch) || !form.age || Number(toEnglishDigits(form.age)) <= 1}
                  className="w-8 h-full flex items-center justify-center text-gray-400 hover:text-teal-600 hover:bg-teal-50 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  title="إنقاص"
                >
                  <Minus size={14} strokeWidth={3} />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={toEnglishDigits(form.age)}
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
                  disabled={Boolean(selectedMatch) || Number(form.age) >= 120}
                  className="w-8 h-full flex items-center justify-center text-gray-400 hover:text-teal-600 hover:bg-teal-50 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  title="زيادة"
                >
                  <Plus size={14} strokeWidth={3} />
                </button>
              </div>
            </div>

            {/* Gender Toggle */}
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
                  onClick={() => set('gender', 'male')}
                  className={`flex-1 h-[32px] text-[11px] font-bold rounded-lg transition-all flex items-center justify-center ${
                    selectedMatch ? 'cursor-not-allowed' : 'cursor-pointer'
                  } ${
                    form.gender === 'male' ? 'bg-white shadow-2xs text-teal-700 font-black' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  ذكر
                </button>
                <button
                  type="button"
                  disabled={Boolean(selectedMatch)}
                  onClick={() => set('gender', 'female')}
                  className={`flex-1 h-[32px] text-[11px] font-bold rounded-lg transition-all flex items-center justify-center ${
                    selectedMatch ? 'cursor-not-allowed' : 'cursor-pointer'
                  } ${
                    form.gender === 'female' ? 'bg-white shadow-2xs text-rose-700 font-black' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  أنثى
                </button>
              </div>
            </div>

            {/* Phone */}
            <div className="w-full md:w-44 shrink-0">
              <label className="block text-[11px] font-bold text-gray-600 mb-1.5 px-1 whitespace-nowrap">
                رقم الهاتف <span className="text-gray-400 text-[10px] font-normal">(اختياري)</span>
              </label>
              <div
                className={`relative flex items-center h-[38px] border rounded-xl overflow-hidden transition-all shadow-sm px-3 gap-2 group ${
                  selectedMatch
                    ? 'bg-slate-100/70 border-slate-200 cursor-not-allowed'
                    : form.phone && form.phone.length >= 2 && !['77', '73', '71', '78', '70'].includes(form.phone.slice(0, 2))
                      ? 'bg-white border-rose-300 focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500'
                      : 'bg-white border-gray-200 focus-within:border-teal-500 focus-within:ring-1 focus-within:ring-teal-500'
                }`}
                dir="ltr"
              >
                <div className="shrink-0">
                  <Phone
                    size={14}
                    className={
                      form.phone && form.phone.length >= 2 && !['77', '73', '71', '78', '70'].includes(form.phone.slice(0, 2))
                        ? 'text-rose-500'
                        : selectedMatch
                          ? 'text-emerald-600'
                          : 'text-gray-400 group-focus-within:text-teal-500 transition-colors'
                    }
                  />
                </div>
                <input
                  type="tel"
                  dir="ltr"
                  maxLength={9}
                  placeholder="77xxxxxxx"
                  value={toEnglishDigits(form.phone)}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  disabled={Boolean(selectedMatch)}
                  className="flex-1 w-full bg-transparent text-xs font-bold text-gray-800 placeholder-gray-400 focus:outline-none py-1 text-left disabled:text-gray-500 disabled:cursor-not-allowed"
                />
                {!selectedMatch && form.phone && form.phone.length >= 2 && (
                  <div className="shrink-0">
                    {['77', '73', '71', '78', '70'].includes(form.phone.slice(0, 2)) ? (
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

            {/* Action Buttons in Same Row */}
            <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
              {/* If a previous match is selected, show visit registration button and deselect button */}
              {selectedMatch ? (
                <>
                  <button
                    type="button"
                    disabled={loading || isAlreadyRegisteredToday}
                    onClick={handleNewVisit}
                    className={`w-full md:w-auto h-[38px] px-6 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 border bg-white border-teal-300 text-teal-700 shadow-sm cursor-pointer active:scale-95 ${
                      isAlreadyRegisteredToday
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:bg-teal-50'
                    }`}
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Users size={15} />
                    )}
                    <span>تسجيل زيارة للملف المحدد</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="w-full md:w-auto h-[38px] px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 shadow-2xs cursor-pointer active:scale-95 whitespace-nowrap"
                    title="إلغاء التحديد وتنظيف الحقول"
                  >
                    <RotateCcw size={13} strokeWidth={2.2} />
                    <span>إلغاء التحديد</span>
                  </button>
                </>
              ) : (
                /* New Patient registration button */
                <button
                  type="submit"
                  disabled={loading || strictMatches.length > 0}
                  className={`w-full md:w-auto h-[38px] px-7 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white font-black text-xs rounded-xl shadow-md shadow-teal-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0 whitespace-nowrap cursor-pointer ${
                    strictMatches.length > 0 ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <UserPlus size={15} />
                  )}
                  <span>{loading ? 'جاري الإنشاء...' : 'إنشاء ملف طبي'}</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* ── Same-Day Duplicate Guard Warning ── */}
      {selectedMatch && isAlreadyRegisteredToday && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-3.5 shadow-sm">
          <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
          <p className="font-black text-sm text-red-700">
            تنبيه: المريض مسجل بالفعل في قائمة زيارات اليوم.
          </p>
        </div>
      )}

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
            renderPatientTable({
              rows: strictMatches,
              onRowClick: handleSelectMatch,
              selectedId: selectedMatch?.id,
              isMatch: true,
            })
          )}
        </div>
      )}

      {/* ── 3. Recent Registrations Section (قائمة زيارات اليوم) ── */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-gray-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
              <Users size={15} />
            </div>
            <div>
              <h2 className="font-black text-sm text-gray-800">قائمة زيارات اليوم</h2>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Quick Search in Today's Visits */}
            <div className="relative flex-1 sm:w-64">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchVisits}
                onChange={(e) => setSearchVisits(e.target.value)}
                placeholder="بحث في زيارات اليوم..."
                className="w-full bg-slate-50 border border-slate-200/80 focus:border-teal-500 rounded-xl pr-9 pl-8 py-1.5 text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-200 transition-all"
              />
              {searchVisits && (
                <button
                  type="button"
                  onClick={() => setSearchVisits('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Layout Toggle (Grid / List) */}
            <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shrink-0">
              <button
                type="button"
                onClick={() => setLayoutMode('grid')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  layoutMode === 'grid' ? 'bg-white shadow text-teal-700' : 'text-gray-400 hover:text-gray-600'
                }`}
                title="عرض كشبكة"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('list')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  layoutMode === 'list' ? 'bg-white shadow text-teal-700' : 'text-gray-400 hover:text-gray-600'
                }`}
                title="عرض كقائمة"
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {loadingVisits ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredVisits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-slate-300 mb-3 shadow-sm border border-slate-100">
              {searchVisits ? <Search size={28} /> : <FileText size={28} />}
            </div>
            <p className="text-sm font-black text-slate-600">
              {searchVisits ? `لا توجد نتائج مطابقة للبحث "${searchVisits}"` : 'قائمة زيارات اليوم فارغة'}
            </p>
            <p className="text-xs text-slate-400 mt-1 font-semibold">
              {searchVisits ? 'تأكد من كتابة الاسم أو رقم الهاتف بشكل صحيح' : 'استخدم النموذج أعلاه لإضافة أو تسجيل زيارة لمريض'}
            </p>
          </div>
        ) : (
          renderPatientTable({
            rows: filteredVisits,
            onRowClick: null,
            selectedId: null,
            isMatch: false,
          })
        )}
      </div>
    </div>
  );
};

export default RegisterPatient;
