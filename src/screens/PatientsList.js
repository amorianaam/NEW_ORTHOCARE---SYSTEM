import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePersistentState } from '../hooks/usePersistentState';
import { useLocation, useNavigate } from 'react-router-dom';
import EditPatientModal from '../components/secretary/EditPatientModal';
import {
  Search, Calendar, LayoutGrid, List,
  History, FolderOpen, User, Phone, ChevronRight,
  Pencil, ChevronLeft, Crown, RotateCcw, Scissors, FileText, AlertCircle,
  UserCheck, Users, Info, X, SendHorizontal, CalendarCheck, ChevronDown, Check
} from 'lucide-react';
import { toast } from 'react-toastify';
import Fuse from 'fuse.js';
import axios from 'axios';
import useAuthStore from '../store/useAuthStore';
import HistoricEMRModal from '../components/HistoricEMRModal';
import useSocketStore from '../store/useSocketStore';
import { toYemenDate, getShiftStartOfDay, getShiftEndOfDay, getShiftWeekStartDate, getShiftMonthStartDate } from '../utils/shiftHelpers';

const PAGE_SIZE = 20;

// Format Date & Time Helper (English Digits)
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

const toEnglishDigits = (val) =>
  String(val ?? '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٫،]/g, '.');

const getMatchedVisit = (patient, searchQ) => {
  if (!searchQ || (!patient?.all_visit_numbers && !patient?.visit_number)) return null;
  const rawClean = toEnglishDigits(searchQ.trim());
  const cleanQ = rawClean.replace(/^#+/, '').trim().toLowerCase();
  if (!cleanQ) return null;

  // If search query directly matches displayed visit_number, no need for previous visit indicator
  const latestClean = String(patient.visit_number || patient.visit_id || '').replace(/^#+/, '').trim().toLowerCase();
  if (latestClean && latestClean === cleanQ) {
    return null;
  }

  // Check all previous visit numbers / ids
  const combinedVisits = `${patient.all_visit_numbers || ''}, ${patient.all_visit_ids || ''}`
    .split(/[,\s]+/)
    .map(v => v.replace(/^#+/, '').trim())
    .filter(Boolean);

  const matched = combinedVisits.find(v => v.toLowerCase() === cleanQ || (cleanQ.length >= 2 && v.toLowerCase().includes(cleanQ)));
  return matched ? matched.replace(/^#+/, '') : null;
};

export default function PatientsList() {
  const { token } = useAuthStore();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const location = useLocation();
  const navigate = useNavigate();

  // Core Data
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // 'all' | 'today' | 'week' | 'month' | 'custom'
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [caseTypeFilter, setCaseTypeFilter] = useState('all'); // 'all' | 'regular' | 'exempt' | 'review' | 'surgeries'
  const [showCaseTypeMenu, setShowCaseTypeMenu] = useState(false);
  const [layoutMode, setLayoutMode] = usePersistentState('global_layout_preference', 'grid'); // 'grid' | 'list'
  const [page, setPage] = useState(1);
  const [reviewModal, setReviewModal] = useState({ isOpen: false, patient: null, mode: '' });

  // Selected Patient (opens HistoricEMRModal)
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedInitialVisitId, setSelectedInitialVisitId] = useState(null);

  // Actions
  const [editPatient, setEditPatient] = useState(null);
  const [sendingReview, setSendingReview] = useState(null);

  // ─── Deep Hydration State ────────────────────────────────────────
  const latestPatientEvent = useSocketStore(s => s.latestPatientEvent);
  const latestSilentUpdate = useSocketStore(s => s.latestSilentUpdate);
  const lastFetchRef = useRef(Date.now());

  // ─── Fetch All Patients ──────────────────────────────────────────
  const fetchPatients = useCallback(async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    try {
      const res = await axios.get('/api/patients', { headers });
      setPatients(Array.isArray(res.data) ? res.data : []);
      lastFetchRef.current = Date.now();
    } catch {
      if (!isPolling) toast.error('فشل تحميل أرشيف المرضى');
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [headers]);

  // Initial Load
  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  // Deep Hydration (Socket Integration)
  useEffect(() => {
    const evTime = latestPatientEvent?.timestamp || 0;
    const silentTime = latestSilentUpdate?.timestamp || 0;
    const maxTime = Math.max(evTime, silentTime);

    if (maxTime > lastFetchRef.current) {
      fetchPatients(true);
    }
  }, [latestPatientEvent?.timestamp, latestSilentUpdate?.timestamp, fetchPatients]);

  useEffect(() => {
    if (location.state?.openPatientId && patients.length > 0 && !selectedPatient) {
      const p = patients.find(x => x.id === location.state.openPatientId);
      if (p) {
        handleOpenEMR(p);
      }
      // Clear state so it doesn't reopen if the user refreshes
      navigate(location.pathname, { replace: true });
    }
  }, [location.state, patients, selectedPatient, navigate, location.pathname]);

  // ─── Temporal Filtering (Applied first so stats reflect the time filter) ──
  const timeFilteredPatients = useMemo(() => {
    let result = patients;
    const now = new Date();

    if (dateFilter === 'today') {
      const shiftStart = getShiftStartOfDay(now);
      const shiftEnd = getShiftEndOfDay(now);
      result = result.filter(p => {
        if (p.today_visits_count > 0) return true;
        const rawDate = p.last_visit_date || p.created_at;
        if (!rawDate) return false;
        const pDate = toYemenDate(rawDate);
        return pDate >= shiftStart && pDate <= shiftEnd;
      });
    } else if (dateFilter === 'week') {
      const shiftEnd = getShiftEndOfDay(now);
      const shiftWeekStart = getShiftWeekStartDate(now);
      result = result.filter(p => {
        const rawDate = p.last_visit_date || p.created_at;
        if (!rawDate) return false;
        const pDate = toYemenDate(rawDate);
        return pDate >= shiftWeekStart && pDate <= shiftEnd;
      });
    } else if (dateFilter === 'month') {
      const shiftEnd = getShiftEndOfDay(now);
      const shiftMonthStart = getShiftMonthStartDate(now);
      result = result.filter(p => {
        const rawDate = p.last_visit_date || p.created_at;
        if (!rawDate) return false;
        const pDate = toYemenDate(rawDate);
        return pDate >= shiftMonthStart && pDate <= shiftEnd;
      });
    } else if (dateFilter === 'custom' && customRange.start && customRange.end) {
      const [sY, sM, sD] = customRange.start.split('-').map(Number);
      const start = new Date(sY, sM - 1, sD, 3, 0, 0, 0);

      const [eY, eM, eD] = customRange.end.split('-').map(Number);
      const end = new Date(eY, eM - 1, eD + 1, 2, 59, 59, 999);

      result = result.filter(p => {
        const rawDate = p.last_visit_date || p.created_at;
        if (!rawDate) return false;
        const pDate = toYemenDate(rawDate);
        return pDate >= start && pDate <= end;
      });
    }

    return result;
  }, [patients, dateFilter, customRange]);

  // ─── Clinic Archive Statistics (Dynamic based on active Time Filter) ──
  const stats = useMemo(() => {
    // 1. عدد المرضى الذي تم تسجيلهم (عدا المراجعات والإعفاءات)
    const registered = timeFilteredPatients.filter(p => !p.is_follow_up && !p.is_exempt).length;
    // 2. عدد المراجعات المحولة
    const followUps = timeFilteredPatients.filter(p => Boolean(p.is_follow_up)).length;
    // 3. إجمالي المرضى المسجلين في الأرشيف
    const total = timeFilteredPatients.length;

    // 4. إجمالي الزيارات وتفاصيلها (عادية، مراجعة، إعفاء)
    let totalVisits = 0;
    let regularVisits = 0;
    let reviewVisits = 0;
    let exemptVisits = 0;

    if (dateFilter === 'all') {
      timeFilteredPatients.forEach(p => {
        totalVisits += parseInt(p.total_visits || 1, 10);
        regularVisits += parseInt(p.regular_visits_count || (!p.is_follow_up && !p.is_exempt ? 1 : 0), 10);
        reviewVisits += parseInt(p.reviews_count || (p.is_follow_up ? 1 : 0), 10);
        exemptVisits += parseInt(p.exempts_count || (p.is_exempt ? 1 : 0), 10);
      });
    } else {
      timeFilteredPatients.forEach(p => {
        const vCount = Math.max(1, parseInt(dateFilter === 'today' ? (p.today_visits_count || 1) : 1, 10));
        totalVisits += vCount;
        if (p.is_follow_up) {
          reviewVisits += vCount;
        } else if (p.is_exempt) {
          exemptVisits += vCount;
        } else {
          regularVisits += vCount;
        }
      });
    }

    return {
      registered,
      followUps,
      total,
      totalVisits,
      regularVisits,
      reviewVisits,
      exemptVisits,
    };
  }, [timeFilteredPatients, dateFilter]);

  // ─── Helper Functions & Options for Case Type Filtering ─────────
  const isPatientSurgery = useCallback((p) => {
    if (
      Boolean(p.is_surgery) ||
      p.visit_status === 'transferred_to_center' ||
      p.status === 'transferred_to_center'
    ) {
      return true;
    }
    if (dateFilter === 'all' && Number(p.surgeries_count) > 0) return true;
    return false;
  }, [dateFilter]);

  const isPatientExempt = useCallback((p) => {
    if (Boolean(p.is_exempt)) return true;
    if (dateFilter === 'all' && Number(p.exempts_count) > 0) return true;
    return false;
  }, [dateFilter]);

  const isPatientReview = useCallback((p) => {
    if (Boolean(p.is_follow_up)) return true;
    if (dateFilter === 'all' && Number(p.reviews_count) > 0) return true;
    return false;
  }, [dateFilter]);

  const isPatientRegular = useCallback((p) => {
    return !isPatientSurgery(p) && !isPatientExempt(p) && !isPatientReview(p);
  }, [isPatientSurgery, isPatientExempt, isPatientReview]);

  const caseTypeMenuOptions = useMemo(
    () => [
      { id: 'all', label: 'كافة الحالات', icon: Users },
      { id: 'regular', label: 'الحالات النظامية', icon: UserCheck },
      { id: 'exempt', label: 'حالات الإعفاء', icon: Crown },
      { id: 'review', label: 'حالات المراجعة', icon: RotateCcw },
      { id: 'surgeries', label: 'العمليات', icon: Scissors },
    ],
    [],
  );

  // ─── Advanced Search Filter (Applied on timeFilteredPatients) ──────
  const filteredPatients = useMemo(() => {
    let result = timeFilteredPatients;

    if (caseTypeFilter === 'surgeries') {
      result = result.filter(isPatientSurgery);
    } else if (caseTypeFilter === 'exempt') {
      result = result.filter(isPatientExempt);
    } else if (caseTypeFilter === 'review') {
      result = result.filter(isPatientReview);
    } else if (caseTypeFilter === 'regular') {
      result = result.filter(isPatientRegular);
    }

    if (query.trim()) {
      const rawClean = toEnglishDigits(query.trim());
      const cleanQ = rawClean.replace(/^#+/, '').trim();
      const cleanQLower = cleanQ.toLowerCase();

      const directMatches = new Set();
      const directList = [];

      result.forEach(p => {
        const allVisitsStr = `${p.visit_number || ''} ${p.visit_id || ''} ${p.all_visit_numbers || ''} ${p.all_visit_ids || ''}`.toLowerCase();
        const visitTokens = allVisitsStr.split(/[,\s]+/).filter(Boolean);
        const hasVisitMatch = visitTokens.some(v => v === cleanQLower || (cleanQLower.length >= 2 && v.includes(cleanQLower)));

        const phoneStr = String(p.phone || '').replace(/\s+/g, '');
        const hasPhoneMatch = phoneStr.includes(cleanQLower);

        const nameStr = String(p.full_name || '').toLowerCase();
        const hasNameMatch = nameStr.includes(cleanQLower);

        if (hasVisitMatch || hasPhoneMatch || hasNameMatch) {
          directMatches.add(p.id);
          directList.push(p);
        }
      });

      const fuse = new Fuse(result, {
        keys: [
          { name: 'full_name', weight: 0.4 },
          { name: 'visit_number', weight: 0.3 },
          { name: 'all_visit_numbers', weight: 0.35 },
          { name: 'phone', weight: 0.25 }
        ],
        threshold: 0.35
      });
      const fuzzyResults = fuse.search(cleanQ).map(r => r.item);

      const combined = [...directList];
      fuzzyResults.forEach(item => {
        if (!directMatches.has(item.id)) {
          combined.push(item);
        }
      });
      result = combined;
    }

    return result;
  }, [timeFilteredPatients, query, caseTypeFilter, isPatientSurgery, isPatientExempt, isPatientReview, isPatientRegular]);

  const totalPages = Math.ceil(filteredPatients.length / PAGE_SIZE);
  const paginatedPatients = useMemo(() => {
    return filteredPatients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [filteredPatients, page]);

  const handleResetFilters = () => {
    setQuery('');
    setDateFilter('all');
    setCustomRange({ start: '', end: '' });
    setCaseTypeFilter('all');
    setShowCaseTypeMenu(false);
    setPage(1);
    toast.info('تم إعادة تعيين فلاتر البحث');
  };

  const handleSendReview = async (e, patient) => {
    if (e?.stopPropagation) e.stopPropagation();
    
    if (!patient) return;

    let eligibility = patient.eligibility;
    if (!eligibility) {
      try {
        const res = await axios.get(`/api/patients/${patient.id}/follow-up-eligibility`, { headers });
        eligibility = res.data;
      } catch (err) {
        console.error("Failed to check follow-up eligibility:", err);
      }
    }

    if (!eligibility || !eligibility.eligible) {
      const reasons = eligibility?.reason ? [eligibility.reason] : ['المريض لا يستوفي شروط المراجعة المجانية'];
      setReviewModal({ isOpen: true, patient, mode: 'reject', reasons, eligibility });
      return;
    }

    setReviewModal({ isOpen: true, patient, mode: 'confirm', eligibility });







    









  };

  const executeSendReview = async () => {
    const patient = reviewModal.patient;
    if (!patient) return;
    setReviewModal({ isOpen: false, patient: null, mode: '' });
    setSendingReview(patient.id);
    try {
      const res = await axios.post(
        '/api/patients/follow-up',
        { patientId: patient.id },
        { headers }
      );
      if (res.status === 200 || res.status === 201) {
        toast.success(`تم إرسال ${patient.full_name || 'المريض'} إلى قائمة الانتظار بنجاح`);
        fetchPatients();
      } else {
        toast.error(res.data?.message || 'حدث خطأ أثناء تسجيل المراجعة');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'تعذر الاتصال بالخادم');
    } finally {
      setSendingReview(null);
    }
  };

  const handleEditPatient = (e, patient) => {
    e.stopPropagation();
    setEditPatient(patient);
  };

  // ─── Open Historic EMR Modal ─────────────────────────────────────
  const handleOpenEMR = (patient, targetVisitId = null) => {
    setSelectedPatient(patient);
    setSelectedInitialVisitId(targetVisitId);
  };

  return (
    <div className="space-y-6 w-full" dir="rtl">
      {/* ── 1. Page Header Banner (SecretaryDashboard Style) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 flex-shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 text-white flex items-center justify-center shadow-md shadow-teal-500/20">
            <History size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800">أرشيف المرضى</h1>
            <p className="text-sm font-bold text-gray-500 mt-0.5">
              البحث في السجلات الطبية السابقة، متابعة الزيارات، وتعديل بيانات المرضى
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white px-4 py-2 rounded-2xl border border-slate-200/80 shadow-xs text-sm font-bold text-slate-600 flex items-center gap-2">
            <FolderOpen size={16} className="text-teal-600 shrink-0" />
            <span>إجمالي ملفات المرضى:</span>
            <span className="text-teal-700 font-black text-lg" dir="ltr">{stats.total.toLocaleString('en-US')}</span>
            <span className="text-xs font-bold text-slate-400">ملف</span>
          </div>
        </div>
      </div>

      {/* ── 2. Quick Stats Grid (Secretary Dashboard Style) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full flex-shrink-0">
        {[
          {
            label: "إجمالي الزيارات",
            value: stats.totalVisits,
            unit: "زيارة",
            sub: ` كافة الزيارات لـ ${stats.total} ملف مريض مسجل`,
            icon: CalendarCheck,
            color: "text-purple-600",
            bg: "bg-purple-100",
            border: "border-purple-200",
          },
          {
            label: "الحالات النظامية",
            value: stats.regularVisits,
            unit: "زيارة",
            sub: "تسجيل نظامي لإجراءات دخول العيادة",
            icon: UserCheck,
            color: "text-teal-600",
            bg: "bg-teal-100",
            border: "border-teal-200",
          },
          {
            label: "المراجعات المحولة",
            value: stats.reviewVisits,
            unit: "مراجعة",
            sub: "مراجعات متابعة محولة لعيادة الطبيب",
            icon: RotateCcw,
            color: "text-emerald-600",
            bg: "bg-emerald-100",
            border: "border-emerald-200",
          },
          {
            label: "حالات الإعفاء",
            value: stats.exemptVisits,
            unit: "إعفاء",
            sub: "زيارات معفاة من الرسوم بقرار الطبيب",
            icon: Crown,
            color: "text-amber-600",
            bg: "bg-amber-100",
            border: "border-amber-200",
          },
        ].map((s, i) => (
          <div
            key={i}
            className={`p-4 rounded-2xl border ${s.border} bg-white shadow-sm hover:shadow-md transition-shadow duration-200 relative overflow-hidden flex flex-col justify-between isolate group`}
          >
            <div
              className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${s.bg} to-transparent opacity-50 rounded-bl-full z-[-1] transition-transform duration-500 group-hover:scale-110`}
            />
            <div className="flex justify-between items-start mb-3">
              <div
                className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center shadow-sm transition-transform group-hover:scale-105`}
              >
                <s.icon size={16} className={s.color} />
              </div>
              <span className={`text-xs font-bold ${s.color}`}>
                {s.label}
              </span>
            </div>
            <div>
              {loading ? (
                <div className="h-7 bg-gray-100 rounded-lg animate-pulse w-24"></div>
              ) : (
                <p
                  className="text-xl font-black text-gray-800 flex items-baseline justify-end gap-1.5 transition-opacity duration-200"
                  dir="ltr"
                >
                  <span className="text-xs font-bold text-gray-400 uppercase">{s.unit}</span>
                  <span>{s.value}</span>
                </p>
              )}
              {s.sub && (
                <p className="text-[10px] text-gray-400 font-semibold mt-1 truncate" title={s.sub}>
                  {s.sub}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── 3. Advanced Filter Toolbar & Search Bar ── */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          {/* Search bar (Right side in RTL) */}
          <div className="relative w-full md:w-80">
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
              <Search size={16} strokeWidth={2.2} />
            </div>
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1); }}
              placeholder="بحث بالاسم، رقم الهاتف، أو معرف الزيارة..."
              className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-teal-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-200/60 shadow-xs transition-all"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); setPage(1); }}
                className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                title="مسح البحث"
              >
                <div className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                  <X size={12} strokeWidth={2.5} />
                </div>
              </button>
            )}
          </div>

          {/* Temporal filter tabs & Layout Toggle (Left side in RTL) */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex gap-1 bg-gray-100/90 p-1.5 rounded-2xl text-xs font-bold text-gray-500 overflow-x-auto">
              {[
                { id: 'all', label: 'الكل' },
                { id: 'today', label: 'اليوم' },
                { id: 'week', label: 'هذا الأسبوع' },
                { id: 'month', label: 'هذا الشهر' },
                { id: 'custom', label: 'تاريخ مخصص' },
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { setDateFilter(f.id); setPage(1); }}
                  className={`px-3.5 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-bold cursor-pointer ${
                    dateFilter === f.id ? 'bg-white text-teal-800 shadow-xs' : 'hover:bg-white/40 text-gray-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Case Type Dropdown */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowCaseTypeMenu(!showCaseTypeMenu)}
                className={`h-10 px-3.5 rounded-2xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                  caseTypeFilter !== 'all'
                    ? 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
                    : 'bg-white text-slate-600 border-slate-200/90 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                {(() => {
                  const ActiveIcon =
                    caseTypeFilter === 'surgeries'
                      ? Scissors
                      : caseTypeFilter === 'exempt'
                      ? Crown
                      : caseTypeFilter === 'review'
                      ? RotateCcw
                      : caseTypeFilter === 'regular'
                      ? UserCheck
                      : Users;
                  return (
                    <ActiveIcon
                      size={14}
                      className={caseTypeFilter !== 'all' ? 'text-teal-600' : 'text-slate-400'}
                    />
                  );
                })()}
                <span>
                  {caseTypeFilter === 'all'
                    ? 'نوع الحالة'
                    : caseTypeFilter === 'regular'
                    ? 'الحالات النظامية'
                    : caseTypeFilter === 'exempt'
                    ? 'حالات الإعفاء'
                    : caseTypeFilter === 'review'
                    ? 'حالات المراجعة'
                    : 'العمليات'}
                </span>
                <ChevronDown
                  size={14}
                  className={`text-slate-400 transition-transform duration-200 ${
                    showCaseTypeMenu ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showCaseTypeMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowCaseTypeMenu(false)}
                  />
                  <div className="absolute top-full left-0 mt-1.5 w-52 bg-white border border-slate-100 shadow-xl rounded-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 p-1.5 space-y-1">
                    {caseTypeMenuOptions.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setCaseTypeFilter(item.id);
                          setShowCaseTypeMenu(false);
                          setPage(1);
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between cursor-pointer ${
                          caseTypeFilter === item.id
                            ? 'bg-teal-50 text-teal-700 font-black'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <item.icon
                            size={13}
                            className={caseTypeFilter === item.id ? 'text-teal-600' : 'text-slate-400'}
                          />
                          <span>{item.label}</span>
                        </div>
                        {caseTypeFilter === item.id && (
                          <Check size={13} className="text-teal-600 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shrink-0">
              <button
                type="button"
                onClick={() => setLayoutMode('grid')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  layoutMode === 'grid' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
                title="عرض كشبكة"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('list')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  layoutMode === 'list' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
                title="عرض كقائمة"
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {dateFilter === 'custom' && (
          <div className="p-4 bg-teal-50/40 rounded-2xl border border-teal-100/80 flex flex-wrap gap-4 items-center animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-teal-700">من:</span>
              <input
                type="date"
                value={customRange.start}
                onChange={e => { setCustomRange({ ...customRange, start: e.target.value }); setPage(1); }}
                className="px-3 py-1.5 bg-white border border-teal-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-teal-700">إلى:</span>
              <input
                type="date"
                value={customRange.end}
                onChange={e => { setCustomRange({ ...customRange, end: e.target.value }); setPage(1); }}
                className="px-3 py-1.5 bg-white border border-teal-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-4 py-1.5 text-xs bg-white text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl font-bold mr-auto border border-slate-200 transition-colors cursor-pointer"
            >
              إعادة تعيين
            </button>
          </div>
        )}

        <div className="flex justify-between items-center pt-3 border-t border-gray-50 text-xs font-semibold text-slate-500">
          <span>تم العثور على <span className="text-teal-700 font-black">{filteredPatients.length}</span> مريض مسجل</span>
          {dateFilter !== 'all' && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-[11px] font-bold text-teal-600 hover:text-teal-700 hover:underline cursor-pointer"
            >
              عرض جميع السجلات
            </button>
          )}
        </div>
      </div>

      {/* ── 4. Patients Content (Grid / List Mode) ── */}
      {loading ? (
        <div className="flex justify-center items-center p-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
          <div className="w-9 h-9 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-300">
            {query ? <Search size={32} strokeWidth={1.5} /> : <Users size={32} strokeWidth={1.5} />}
          </div>
          <h3 className="text-base font-black text-gray-700">
            {query ? `لا توجد نتائج مطابقة للبحث "${query}"` : 'لا توجد سجلات مرضى في هذه الفترة'}
          </h3>
          <p className="text-gray-400 text-xs mt-1.5 font-semibold">
            {query ? 'تأكد من كتابة الاسم أو رقم الهاتف أو معرف الزيارة بشكل صحيح.' : 'تأكد من اختيار الفلتر الزمني المطلوب أو قم بإعادة تعيين الفلاتر.'}
          </p>
          {(query || dateFilter !== 'all') && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-3 text-xs font-bold text-teal-600 hover:text-teal-700 bg-teal-50 px-3.5 py-1.5 rounded-xl border border-teal-100 transition-colors cursor-pointer"
            >
              إعادة تعيين الفلاتر
            </button>
          )}
        </div>
      ) : layoutMode === 'grid' ? (
        /* ── Grid Mode (مطابق لصفحة تسجيل مريض وبطاقات لوحة التحكم - بدون جنس وعمر) ── */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {paginatedPatients.map((p, idx) => {
              const dateFormatted = formatDateTimeEn(p.last_visit_date || p.created_at);
              const phoneFormatted = formatPhoneNumber(p.phone);
              const hasPhone = Boolean(p.phone && String(p.phone).trim() && String(p.phone).trim() !== '-' && String(p.phone).trim() !== '—');
              const visitNumber = p.visit_number || p.visit_id || p.latest_visit_id || p.id;
              const matchedVisit = getMatchedVisit(p, query);
              const hasVisitsCount = Number(p.total_visits) > 1;

              return (
                <div
                  key={p.id}
                  onClick={() => handleOpenEMR(p, matchedVisit)}
                  className="bg-white rounded-3xl border border-slate-100/90 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-teal-300 flex flex-col justify-between p-5 select-none shadow-[0_4px_20px_rgb(0,0,0,0.03)] group"
                  dir="rtl"
                >
                  {/* Top: Avatar + Name + Badges + Subtitle + Index */}
                  <div>
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center font-black text-base transition-transform group-hover:scale-105 shadow-xs bg-gradient-to-br from-teal-50 to-teal-100/80 text-teal-700 border border-teal-200/50">
                          {p.full_name?.charAt(0) ?? '؟'}
                        </div>
                        <div className="min-w-0 flex-1 text-right" dir="rtl">
                          <div className="flex items-center gap-1 flex-wrap">
                            <h3 className="font-black text-slate-800 text-sm leading-tight group-hover:text-teal-700 transition-colors truncate">
                              {p.full_name || 'مريض غير معروف'}
                            </h3>
                            {Boolean(p.is_follow_up) && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-emerald-100/75 text-emerald-700 border border-emerald-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                <RotateCcw size={11} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                                <span>مراجعة</span>
                              </span>
                            )}
                            {Boolean(p.is_exempt) && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-amber-100/75 text-amber-700 border border-amber-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                <Crown size={11} className="text-amber-600 shrink-0" strokeWidth={2.2} />
                                <span>إعفاء</span>
                              </span>
                            )}
                            {Boolean(p.is_surgery || p.visit_status === 'transferred_to_center') && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                                <span>عمليات</span>
                              </span>
                            )}
                          </div>
                          {/* Visit ID below patient name */}
                          <div className="flex items-center gap-1.5 flex-wrap mt-1" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                            <span className="text-[11px] font-bold text-slate-400" dir="ltr">
                              {visitNumber}
                            </span>
                            {matchedVisit && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-teal-50 text-teal-700 border border-teal-200/80 shadow-2xs select-none leading-none">
                                <History size={10} className="text-teal-600 shrink-0" strokeWidth={2.2} />
                                <span>زيارة سابقة:</span>
                                <span dir="ltr" className="font-black">{matchedVisit}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <span className="text-xs font-black text-slate-400 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100 flex-shrink-0">
                        {(page - 1) * PAGE_SIZE + idx + 1}
                      </span>
                    </div>

                    {/* Middle: Total Visits Badge (Right) + Phone (Left) */}
                    {(hasVisitsCount || hasPhone) && (
                      <div className="mt-3.5 pt-3 border-t border-slate-100/80 flex items-center justify-between min-h-[32px]">
                        {hasVisitsCount ? (
                          <div className="text-right">
                            <span 
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200/50 cursor-help"
                              title={p.all_visit_numbers ? `معرفات الزيارات: ${p.all_visit_numbers}` : undefined}
                            >
                              {Number(p.total_visits) === 2 ? 'زيارتان' : `${p.total_visits} زيارات`}
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
                  </div>

                  {/* Bottom Actions: Date/Time (Right) + Edit & Open EMR Buttons (Left) */}
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100/80 gap-2">
                    <span dir="ltr" className="text-xs font-bold text-slate-700 whitespace-nowrap inline-block">
                      {dateFormatted}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleEditPatient(e, p); }}
                        className="p-1.5 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-xl border border-amber-100/70 transition-colors cursor-pointer"
                        title="تعديل بيانات المريض"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleOpenEMR(p, matchedVisit); }}
                        className="h-8 px-3 rounded-xl bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white flex items-center gap-1.5 text-xs font-bold shadow-xs hover:shadow-md hover:shadow-teal-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
                        title="فتح الملف الطبي"
                      >
                        <FileText size={13} strokeWidth={2.2} />
                        <span>فتح الملف</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center text-xs font-bold text-slate-500 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
              <span>صفحة <span className="text-teal-700 font-black">{page}</span> من <span className="font-black">{totalPages}</span></span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-2 bg-slate-50 border border-slate-200/80 hover:bg-slate-100 rounded-xl disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed text-slate-600"
                  title="الصفحة السابقة"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="p-2 bg-slate-50 border border-slate-200/80 hover:bg-slate-100 rounded-xl disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed text-slate-600"
                  title="الصفحة التالية"
                >
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── List Mode (تقسيم نسبي 100% مع عمود مخصص للجنس والعمر مطابق لتسجيل مريض) ── */
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap table-fixed">
                <thead className="bg-gradient-to-r from-slate-50/90 via-teal-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                  <tr>
                    <th className="w-[5%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                    <th className="w-[31%] px-4 py-4 text-right font-black text-xs text-slate-600">المريض</th>
                    <th className="w-[15%] px-4 py-4 text-center font-black text-xs text-slate-600">إجمالي الزيارات</th>
                    <th className="w-[16%] px-4 py-4 text-right font-black text-xs text-slate-600">رقم الهاتف</th>
                    <th className="w-[18%] px-4 py-4 text-right font-black text-xs text-slate-600">تاريخ آخر زيارة</th>
                    <th className="w-[15%] px-4 py-4 text-center font-black text-xs text-slate-600">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/70">
                  {paginatedPatients.map((p, idx) => {
                    const dateFormatted = formatDateTimeEn(p.last_visit_date || p.created_at);
                    const phoneFormatted = formatPhoneNumber(p.phone);
                    const hasPhone = Boolean(p.phone && String(p.phone).trim() && String(p.phone).trim() !== '-' && String(p.phone).trim() !== '—');
                    const visitNumber = p.visit_number || p.visit_id || p.latest_visit_id || p.id;
                    const matchedVisit = getMatchedVisit(p, query);
                    const seqNum = (page - 1) * PAGE_SIZE + idx + 1;

                    return (
                      <tr
                        key={p.id}
                        onClick={() => handleOpenEMR(p, matchedVisit)}
                        className="hover:bg-teal-50/30 cursor-pointer transition-colors border-b border-slate-100/70 last:border-0 group"
                      >
                        {/* # Index */}
                        <td className="w-[5%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                          {seqNum}
                        </td>

                        {/* Patient Details */}
                        <td className="w-[31%] px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 group-hover:scale-105 transition-transform bg-gradient-to-br from-teal-50 to-teal-100/80 text-teal-700 border border-teal-200/50">
                              {p.full_name?.charAt(0) ?? '؟'}
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0 text-right" dir="rtl">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-black text-slate-800 text-sm group-hover:text-teal-700 transition-colors truncate">
                                  {p.full_name}
                                </span>
                                {Boolean(p.is_follow_up) && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-emerald-100/75 text-emerald-700 border border-emerald-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                    <RotateCcw size={11} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                                    <span>مراجعة</span>
                                  </span>
                                )}
                                {Boolean(p.is_exempt) && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-amber-100/75 text-amber-700 border border-amber-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                    <Crown size={11} className="text-amber-600 shrink-0" strokeWidth={2.2} />
                                    <span>إعفاء</span>
                                  </span>
                                )}
                                {Boolean(p.is_surgery || p.visit_status === 'transferred_to_center') && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                    <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                                    <span>عمليات</span>
                                  </span>
                                )}
                              </div>
                              {/* Visit ID below patient name */}
                              <div className="flex items-center gap-1.5 flex-wrap mt-0.5" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                                <span className="text-[11px] font-bold text-slate-400" dir="ltr">
                                  {visitNumber}
                                </span>
                                {matchedVisit && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-teal-50 text-teal-700 border border-teal-200/80 shadow-2xs select-none leading-none">
                                    <History size={10} className="text-teal-600 shrink-0" strokeWidth={2.2} />
                                    <span>زيارة سابقة:</span>
                                    <span dir="ltr" className="font-black">{matchedVisit}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Total Visits (matching CashierArchive.js) */}
                        <td className="w-[15%] px-4 py-4 text-center">
                          {Number(p.total_visits) > 1 ? (
                            <span 
                              className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100/90 text-slate-700 border border-slate-200/50 cursor-help"
                              title={p.all_visit_numbers ? `معرفات الزيارات: ${p.all_visit_numbers}` : undefined}
                            >
                              {Number(p.total_visits) === 2 ? 'زيارتان' : `${p.total_visits} زيارات`}
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-slate-400">
                              زيارة واحدة
                            </span>
                          )}
                        </td>

                        {/* Phone */}
                        <td className="w-[16%] px-4 py-4 text-right">
                          {hasPhone ? (
                            <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                              {phoneFormatted}
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-slate-400 whitespace-nowrap" dir="ltr">—</span>
                          )}
                        </td>

                        {/* Date */}
                        <td className="w-[18%] px-4 py-4 text-right">
                          <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                            {dateFormatted}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="w-[15%] px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleEditPatient(e, p); }}
                              className="p-1.5 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-xl transition-colors cursor-pointer border border-amber-100"
                              title="تعديل بيانات المريض"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleOpenEMR(p, matchedVisit); }}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-black text-white bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 rounded-xl shadow-xs shadow-teal-500/20 active:scale-95 transition-all cursor-pointer"
                              title="فتح الملف الطبي"
                            >
                              <FileText size={13} strokeWidth={2.2} />
                              <span>فتح الملف</span>
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center text-xs font-bold text-slate-500 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
              <span>صفحة <span className="text-teal-700 font-black">{page}</span> من <span className="font-black">{totalPages}</span></span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-2 bg-slate-50 border border-slate-200/80 hover:bg-slate-100 rounded-xl disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed text-slate-600"
                  title="الصفحة السابقة"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="p-2 bg-slate-50 border border-slate-200/80 hover:bg-slate-100 rounded-xl disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed text-slate-600"
                  title="الصفحة التالية"
                >
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal (Secretary specific) */}
      {editPatient && (
        <EditPatientModal patient={editPatient} token={token} onClose={() => setEditPatient(null)} onSaved={fetchPatients} />
      )}

      {/* ─── HISTORIC READ-ONLY EMR MODAL ─── */}
      {selectedPatient && !editPatient && (
        <HistoricEMRModal
          patient={selectedPatient}
          initialVisitId={selectedInitialVisitId}
          onClose={() => { setSelectedPatient(null); setSelectedInitialVisitId(null); }}
          token={token}
          hideFinancials={true}
          onEditPatient={() => setEditPatient(selectedPatient)}
          onSendReview={(e, p) => handleSendReview(e, p || selectedPatient)}
          sendingReview={sendingReview}
        />
      )}

      {/* Review Confirmation/Rejection Modal */}
      {reviewModal.isOpen && createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm modal-overlay-anim" dir="rtl">
          <div className="bg-white rounded-3xl shadow-luxury overflow-hidden flex flex-col border border-gray-100 animate-scale-in transition-all duration-300 w-full max-w-md">
            <div className="p-6 text-center space-y-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2 ${reviewModal.mode === 'confirm' ? 'bg-emerald-50 text-emerald-500' : 'bg-red-50 text-red-500'}`}>
                {reviewModal.mode === 'confirm' ? <SendHorizontal size={32} /> : <AlertCircle size={32} />}
              </div>
              <h3 className="font-extrabold text-lg text-gray-800">
                {reviewModal.mode === 'confirm' ? 'تأكيد تسجيل المراجعة' : 'لا يمكن تسجيل مراجعة'}
              </h3>
              <div className="text-gray-500 text-sm font-semibold leading-relaxed space-y-2">
                {reviewModal.mode === 'confirm' ? (
                  <div className="space-y-2.5">
                    <p>هل أنت متأكد من تسجيل مراجعة للمريض <span className="text-emerald-600 font-black">{reviewModal.patient?.full_name}</span> وإرساله لطابور الطبيب؟</p>
                    {reviewModal.eligibility && (
                      <div className="bg-emerald-50/90 border border-emerald-200/80 rounded-2xl p-3 text-xs text-emerald-900 font-bold flex flex-col gap-1.5 text-right">
                        <div className="flex items-center justify-between">
                          <span className="text-emerald-700">نوع الزيارة المعتمدة:</span>
                          <span className="font-black px-2 py-0.5 rounded-full bg-emerald-100/90 text-emerald-800">
                            {reviewModal.eligibility.visitType === 'surgery' ? 'عملية جراحية (مهلة 14 يوماً)' : 'كشف سريري عادي (مهلة 7 أيام)'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-emerald-700">الرصيد المتاح:</span>
                          <span className="font-black text-emerald-800">
                            {reviewModal.eligibility.remainingCount} مراجعة مجانية
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <p>عذراً، المريض <span className="text-red-500 font-black">{reviewModal.patient?.full_name}</span> لا يستوفي شروط المراجعة المجانية للسبب التالي:</p>
                    <ul className="text-red-500 font-bold list-disc list-inside bg-red-50 p-3 rounded-xl inline-block text-right">
                      {reviewModal.reasons?.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                    <p className="text-xs text-gray-400 font-medium">يرجى تسجيل زيارة جديدة برسوم معاينة عادية.</p>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-3 p-4 bg-gray-50/50 border-t border-gray-150">
              <button
                type="button"
                onClick={() => setReviewModal({ isOpen: false, patient: null, mode: '' })}
                className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl text-sm transition-colors cursor-pointer"
              >
                {reviewModal.mode === 'confirm' ? 'إلغاء' : 'إغلاق'}
              </button>
              {reviewModal.mode === 'confirm' && (
                <button
                  type="button"
                  onClick={executeSendReview}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-xl text-sm shadow-md transition-colors cursor-pointer"
                >
                  تأكيد وإرسال
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
