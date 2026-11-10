import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Archive, Search, FileText, X, History, RotateCcw,
  LayoutGrid, List, ChevronRight, ChevronLeft, ChevronDown,
  Users, Scissors, Crown,
  Calendar, Check, FolderOpen, CalendarCheck, Sparkles
} from 'lucide-react';
import { toast } from 'react-toastify';
import Fuse from 'fuse.js';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';
import FinancialRecordModal from '../../components/common/FinancialRecordModal';
import { useLocation } from 'react-router-dom';
import { toYemenDate, getShiftStartOfDay, getShiftEndOfDay, getShiftWeekStartDate, getShiftMonthStartDate } from '../../utils/shiftHelpers';

const PAGE_SIZE = 20;

const toEnglishDigits = (val) =>
  String(val ?? '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٫،]/g, '.');

const formatCurrency = (val) => {
  const num = parseFloat(val);
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const formatDateEn = (isoStr) => {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return String(isoStr);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const formatTimeEn = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => n.toString().padStart(2, '0');
  let hours = d.getHours();
  const minutes = pad(d.getMinutes());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${pad(hours)}:${minutes} ${ampm}`;
};

const formatDate = formatDateEn;
const formatTime = formatTimeEn;

const getMatchedVisit = (patient, searchQ) => {
  if (!searchQ || (!patient?.all_visit_numbers && !patient?.latest_visit_number)) return null;
  const rawClean = toEnglishDigits(searchQ.trim());
  const cleanQ = rawClean.replace(/^#+/, '').trim().toLowerCase();
  if (!cleanQ) return null;

  // If search query directly matches the displayed latest_visit_number, no need for previous visit indicator
  const latestClean = String(patient.latest_visit_number || '').replace(/^#+/, '').trim().toLowerCase();
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

const CashierArchive = () => {
  const { token } = useAuthStore();
  const { latestSilentUpdate } = useSocketStore();
  const location = useLocation();
  
  // Core Data
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filters
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'week', 'month', 'custom'
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all', 'exempt', 'follow_up', 'surgeries', 'suspended'
  const [showPatientTypeMenu, setShowPatientTypeMenu] = useState(false);
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [layoutMode, setLayoutMode] = useState(() => localStorage.getItem('cashier_archive_layout') || 'grid');
  const [page, setPage] = useState(1);

  useEffect(() => {
    localStorage.setItem('cashier_archive_layout', layoutMode);
  }, [layoutMode]);

  // Selected Patient Record
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [selectedInitialVisitId, setSelectedInitialVisitId] = useState(null);
  const [recordData, setRecordData] = useState(null);
  const [recordLoading, setRecordLoading] = useState(false);

  const fetchPatients = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch(`/api/cashier/archive/patients?limit=500`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPatients(Array.isArray(data) ? data : []);
      } else {
        toast.error('تعذر جلب بيانات الأرشيف المالي');
      }
    } catch {
      toast.error('خطأ في الاتصال بالخادم');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPatients(true);
  }, [fetchPatients]);

  // Real-time auto sync
  useEffect(() => {
    if (latestSilentUpdate?.type === "cashier") {
      fetchPatients(false);
    }
  }, [latestSilentUpdate, fetchPatients]);

  // 1. Temporal filter (Official operational day begins at 03:00 AM Yemen Time / Asia/Aden)
  const timeFilteredPatients = useMemo(() => {
    let result = patients;
    const now = new Date();

    if (dateFilter === 'today') {
      const shiftStart = getShiftStartOfDay(now);
      const shiftEnd = getShiftEndOfDay(now);
      result = result.filter(p => {
        if (!p.last_visit_date) return false;
        const pDate = toYemenDate(p.last_visit_date);
        return pDate >= shiftStart && pDate <= shiftEnd;
      });
    } else if (dateFilter === 'week') {
      const shiftEnd = getShiftEndOfDay(now);
      const shiftWeekStart = getShiftWeekStartDate(now);
      result = result.filter(p => {
        if (!p.last_visit_date) return false;
        const pDate = toYemenDate(p.last_visit_date);
        return pDate >= shiftWeekStart && pDate <= shiftEnd;
      });
    } else if (dateFilter === 'month') {
      const shiftEnd = getShiftEndOfDay(now);
      const shiftMonthStart = getShiftMonthStartDate(now);
      result = result.filter(p => {
        if (!p.last_visit_date) return false;
        const pDate = toYemenDate(p.last_visit_date);
        return pDate >= shiftMonthStart && pDate <= shiftEnd;
      });
    } else if (dateFilter === 'custom' && customRange.start && customRange.end) {
      const [sY, sM, sD] = customRange.start.split('-').map(Number);
      const start = new Date(sY, sM - 1, sD, 3, 0, 0, 0);

      const [eY, eM, eD] = customRange.end.split('-').map(Number);
      const end = new Date(eY, eM - 1, eD + 1, 2, 59, 59, 999);

      result = result.filter(p => {
        if (!p.last_visit_date) return false;
        const pDate = toYemenDate(p.last_visit_date);
        return pDate >= start && pDate <= end;
      });
    }

    return result;
  }, [patients, dateFilter, customRange]);

  // Statistical calculations across the dataset / filtered period
  const stats = useMemo(() => {
    let totalCollected = 0;
    let totalVisits = 0;
    let suspendedCount = 0;
    let surgeriesCount = 0;
    let externalVisits = 0;
    let exemptVisits = 0;
    let reviewVisits = 0;

    timeFilteredPatients.forEach(p => {
      totalCollected += parseFloat(p.total_amount || 0);
      totalVisits += parseInt(p.total_visits || 0, 10);
      if (Number(p.has_suspended_services) === 1) suspendedCount++;
      if (Number(p.is_surgery ?? p.has_surgeries) === 1) surgeriesCount++;
      if (Number(p.is_external) === 1 || p.latest_visit_number?.startsWith('EXT-') || (p.all_visit_numbers && p.all_visit_numbers.split(',').some(v => v.trim().startsWith('EXT-')))) externalVisits++;
      exemptVisits += parseInt(p.exempt_visits_count !== undefined ? p.exempt_visits_count : (Number(p.is_exempt) === 1 ? 1 : 0), 10);
      reviewVisits += parseInt(p.review_visits_count !== undefined ? p.review_visits_count : (Number(p.is_follow_up) === 1 ? 1 : 0), 10);
    });

    return {
      totalPatients: timeFilteredPatients.length,
      totalCollected,
      totalVisits,
      suspendedCount,
      surgeriesCount,
      exemptVisits,
      reviewVisits,
      exemptCount: exemptVisits,
      followUpCount: reviewVisits,
      externalVisits,
      externalCount: externalVisits
    };
  }, [timeFilteredPatients]);

  // Client-side filtering (Search + Category)
  const filteredPatients = useMemo(() => {
    let result = timeFilteredPatients;

    // 1. Search filter (filtering by: patient name, visit number (latest & all previous), phone number)
    if (query.trim()) {
      const rawClean = toEnglishDigits(query.trim());
      const cleanQ = rawClean.replace(/^#+/, '').trim();
      const cleanQLower = cleanQ.toLowerCase();

      // Fast direct exact/substring matching for visit numbers, phone or name
      const directMatches = new Set();
      const directList = [];

      timeFilteredPatients.forEach(p => {
        const allVisitsStr = `${p.latest_visit_number || ''} ${p.all_visit_numbers || ''} ${p.all_visit_ids || ''}`.toLowerCase();
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

      const fuse = new Fuse(timeFilteredPatients, {
        keys: [
          { name: 'full_name', weight: 0.4 },
          { name: 'latest_visit_number', weight: 0.3 },
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

    // 2. Category filter
    if (categoryFilter === 'exempt') {
      result = result.filter(p => Number(p.is_exempt) === 1);
    } else if (categoryFilter === 'follow_up') {
      result = result.filter(p => Number(p.is_follow_up) === 1);
    } else if (categoryFilter === 'surgeries') {
      result = result.filter(p => Number(p.is_surgery ?? p.has_surgeries) === 1);
    } else if (categoryFilter === 'external') {
      result = result.filter(p => Boolean(
        Number(p.is_external) === 1 || 
        p.latest_visit_number?.startsWith('EXT-') || 
        (p.all_visit_numbers && p.all_visit_numbers.split(',').some(v => v.trim().startsWith('EXT-')))
      ));
    }

    return result;
  }, [timeFilteredPatients, query, categoryFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / PAGE_SIZE));
  const paginatedPatients = useMemo(() => {
    return filteredPatients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [filteredPatients, page]);

  const handleResetFilters = () => {
    setQuery('');
    setDateFilter('all');
    setCategoryFilter('all');
    setCustomRange({ start: '', end: '' });
    setShowPatientTypeMenu(false);
    setPage(1);
    toast.info('تم عرض جميع الزيارات');
  };

  const isFilterActive = query.trim() !== '' || dateFilter !== 'all' || categoryFilter !== 'all' || (dateFilter === 'custom' && Boolean(customRange.start || customRange.end));

  const openPatientRecord = useCallback(async (id, targetVisitId = null) => {
    setSelectedPatientId(id);
    setSelectedInitialVisitId(targetVisitId);
    setRecordData(null);
    setRecordLoading(true);
    try {
      const res = await fetch(`/api/cashier/archive/patient/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setRecordData(await res.json());
      } else {
        toast.error('تعذر جلب السجل المالي');
      }
    } catch {
      toast.error('خطأ في الاتصال بالخادم');
    } finally {
      setRecordLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const patientId = params.get('patientId');
    if (patientId) {
      openPatientRecord(patientId);
    }
  }, [location.search, openPatientRecord]);

  return (
    <div className="space-y-6 w-full print:p-0 print:space-y-0" dir="rtl">
      
      {/* ── 1. Page Header Banner ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-1 flex-shrink-0 print:hidden">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
            <Archive size={24} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
              الأرشيف والسجل المالي الشامل
              <span className="relative flex h-3 w-3" title="متصل بالشبكة المحلية">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </h1>
            <p className="text-sm font-bold text-gray-500 mt-0.5">
              البحث والاطلاع على السجلات المالية وتاريخ المدفوعات والزيارات لجميع المرضى
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white px-4 py-2 rounded-2xl border border-slate-200/80 shadow-xs text-sm font-bold text-slate-600 flex items-center gap-2">
            <FolderOpen size={16} className="text-emerald-600 shrink-0" />
            <span>إجمالي ملفات المرضى:</span>
            <span className="text-emerald-700 font-black text-lg" dir="ltr">{loading ? '—' : stats.totalPatients.toLocaleString('en-US')}</span>
            <span className="text-xs font-bold text-slate-400">ملف</span>
          </div>
        </div>
      </div>

      {/* ── 2. Quick Executive Statistics Cards (Matching Store Items Style & Adaptive Grid) ── */}
      {(() => {
        const archiveCards = [
          {
            id: 'all',
            label: 'إجمالي الزيارات',
            rawValue: Number(stats.totalVisits || 0),
            value: (stats.totalVisits || 0).toLocaleString('en-US'),
            unit: 'زيارة',
            sub: 'كافة زيارات ومعاملات المرضى',
            icon: CalendarCheck,
            color: 'text-blue-700',
            valColor: 'text-gray-800',
            bg: 'bg-blue-100',
            border: categoryFilter === 'all' ? 'border-blue-300 ring-2 ring-blue-300/40 shadow-sm' : 'border-slate-200/80 hover:border-slate-300',
            onClick: () => { setCategoryFilter('all'); setPage(1); }
          },
          {
            id: 'follow_up',
            label: 'زيارات المراجعة',
            rawValue: Number(stats.reviewVisits || 0),
            value: (stats.reviewVisits || 0).toLocaleString('en-US'),
            unit: 'مراجعة',
            sub: 'متابعات ومراجعات سريرية مجانية',
            icon: RotateCcw,
            color: 'text-emerald-700',
            valColor: 'text-gray-800',
            bg: 'bg-emerald-100',
            border: categoryFilter === 'follow_up' ? 'border-emerald-300 ring-2 ring-emerald-300/40 shadow-sm' : 'border-slate-200/80 hover:border-slate-300',
            onClick: () => { setCategoryFilter(categoryFilter === 'follow_up' ? 'all' : 'follow_up'); setPage(1); }
          },
          {
            id: 'exempt',
            label: 'حالات الإعفاء',
            rawValue: Number(stats.exemptVisits || 0),
            value: (stats.exemptVisits || 0).toLocaleString('en-US'),
            unit: 'إعفاء',
            sub: 'معاينات معفاة بقرار الطبيب',
            icon: Crown,
            color: 'text-amber-700',
            valColor: 'text-gray-800',
            bg: 'bg-amber-100',
            border: categoryFilter === 'exempt' ? 'border-amber-300 ring-2 ring-amber-300/40 shadow-sm' : 'border-slate-200/80 hover:border-slate-300',
            onClick: () => { setCategoryFilter(categoryFilter === 'exempt' ? 'all' : 'exempt'); setPage(1); }
          },
          {
            id: 'surgeries',
            label: 'مرضى العمليات',
            rawValue: Number(stats.surgeriesCount || 0),
            value: (stats.surgeriesCount || 0).toLocaleString('en-US'),
            unit: 'مريض',
            sub: 'حالات محولة للعمليات الجراحية',
            icon: Scissors,
            color: 'text-purple-700',
            valColor: 'text-gray-800',
            bg: 'bg-purple-100',
            border: categoryFilter === 'surgeries' ? 'border-purple-300 ring-2 ring-purple-300/40 shadow-sm' : 'border-slate-200/80 hover:border-slate-300',
            onClick: () => { setCategoryFilter(categoryFilter === 'surgeries' ? 'all' : 'surgeries'); setPage(1); }
          },
          {
            id: 'external',
            label: 'مرضى خارجيين',
            rawValue: Number(stats.externalCount || 0),
            value: (stats.externalCount || 0).toLocaleString('en-US'),
            unit: 'مريض',
            sub: 'فحوصات وتحاليل خارجية مباشرة',
            icon: Sparkles,
            color: 'text-teal-700',
            valColor: 'text-gray-800',
            bg: 'bg-teal-100',
            border: categoryFilter === 'external' ? 'border-teal-300 ring-2 ring-teal-300/40 shadow-sm' : 'border-slate-200/80 hover:border-slate-300',
            onClick: () => { setCategoryFilter(categoryFilter === 'external' ? 'all' : 'external'); setPage(1); }
          }
        ].filter(s => loading || s.rawValue > 0);

        if (archiveCards.length === 0) return null;

        const gridColsClass =
          archiveCards.length === 1 ? 'grid-cols-1 sm:max-w-[340px]' :
          archiveCards.length === 2 ? 'grid-cols-1 sm:grid-cols-2 sm:max-w-[694px]' :
          archiveCards.length === 3 ? 'grid-cols-1 sm:grid-cols-3' :
          archiveCards.length === 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' :
          'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5';

        return (
          <div className={`grid ${gridColsClass} gap-3.5 w-full flex-shrink-0 print:hidden`}>
            {archiveCards.map((s) => (
              <div
                key={s.id}
                onClick={s.onClick}
                className={`p-4 rounded-2xl border ${s.border} bg-white shadow-2xs hover:shadow-xs transition-all duration-200 relative overflow-hidden flex flex-col justify-between isolate group cursor-pointer`}
              >
                <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${s.bg} to-transparent opacity-50 rounded-bl-full z-[-1] transition-transform duration-500 group-hover:scale-110`} />
                <div className="flex justify-between items-center mb-3">
                  <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center shadow-2xs transition-transform group-hover:scale-105`}>
                    <s.icon size={16} className={s.color} />
                  </div>
                  <span className={`text-xs font-bold ${s.color}`}>
                    {s.label}
                  </span>
                </div>
                <div>
                  <p className={`text-xl font-black ${s.valColor || 'text-gray-800'} flex items-baseline justify-end gap-1.5`} dir="ltr">
                    {s.unit ? <span className="text-xs font-bold text-gray-400">{s.unit}</span> : null}
                    <span>{loading ? '—' : s.value}</span>
                  </p>
                  {s.sub ? (
                    <p className="text-[10px] text-gray-400 font-semibold mt-1 truncate text-right">
                      {s.sub}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── 3. Advanced Filter Toolbar (Aligned with GeneralTransactions.js) ─ */}
      <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/70 space-y-4 print:hidden">
        <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-3.5">
          {/* Search Bar (Matching GeneralTransactions.js) */}
          <div className="relative w-full xl:w-96">
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
              <Search size={16} strokeWidth={2.2} />
            </div>
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1); }}
              placeholder="بحث باسم المريض، معرف الزيارة، أو رقم الهاتف..."
              className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-sky-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200/60 shadow-xs transition-all"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); setPage(1); }}
                className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                title="مسح البحث"
              >
                <div className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                  <X size={12} strokeWidth={2.5} />
                </div>
              </button>
            )}
          </div>

          {/* Temporal Filter Tabs + Patient Type Dropdown + Layout Switcher */}
          <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto justify-between xl:justify-end">
            {/* Time Filter Pills */}
            <div className="flex gap-1 bg-gray-100/90 p-1.5 rounded-2xl text-xs font-bold text-gray-500 overflow-x-auto no-scrollbar">
              {[
                { id: 'all',    label: 'الكل' },
                { id: 'today',  label: 'اليوم' },
                { id: 'week',   label: 'هذا الأسبوع' },
                { id: 'month',  label: 'هذا الشهر' },
                { id: 'custom', label: 'تاريخ مخصص' }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { setDateFilter(f.id); setPage(1); }}
                  className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-bold cursor-pointer ${
                    dateFilter === f.id
                      ? 'bg-white text-sky-800 shadow-xs font-black'
                      : 'hover:bg-white/40 text-gray-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Patient Type Dropdown (مطابق لقائمة نوع الحركة) */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowPatientTypeMenu(!showPatientTypeMenu)}
                className={`h-10 px-3.5 rounded-2xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                  categoryFilter !== 'all'
                    ? 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
                    : 'bg-white text-slate-600 border-slate-200/90 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <Users size={14} className={categoryFilter !== 'all' ? 'text-sky-600' : 'text-slate-400'} />
                <span>
                  {categoryFilter === 'all'
                    ? 'نوع الحالة'
                    : categoryFilter === 'exempt'
                    ? 'حالات الإعفاء'
                    : categoryFilter === 'follow_up'
                    ? 'حالات المراجعة'
                    : categoryFilter === 'surgeries'
                    ? 'مرضى العمليات'
                    : categoryFilter === 'external'
                    ? 'مرضى خارجيين'
                    : 'نوع الحالة'}
                </span>
                <ChevronDown
                  size={14}
                  className={`text-slate-400 transition-transform duration-200 ${showPatientTypeMenu ? 'rotate-180' : ''}`}
                />
              </button>

              {showPatientTypeMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowPatientTypeMenu(false)} />
                  <div className="absolute top-full left-0 mt-1.5 w-48 bg-white border border-slate-100 shadow-xl rounded-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 p-1.5 space-y-1">
                    {[
                      { id: 'all',       label: 'كافة الزيارات والحالات', icon: CalendarCheck },
                      { id: 'exempt',    label: 'حالات الإعفاء',          icon: Crown },
                      { id: 'follow_up', label: 'حالات المراجعة',         icon: RotateCcw },
                      { id: 'surgeries', label: 'مرضى العمليات',         icon: Scissors },
                      { id: 'external',  label: 'مرضى خارجيين',           icon: Sparkles },
                    ].map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setCategoryFilter(item.id);
                          setShowPatientTypeMenu(false);
                          setPage(1);
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between cursor-pointer ${
                          categoryFilter === item.id
                            ? 'bg-sky-50 text-sky-700 font-black'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <item.icon size={13} className={categoryFilter === item.id ? 'text-sky-600' : 'text-slate-400'} />
                          <span>{item.label}</span>
                        </div>
                        {categoryFilter === item.id && (
                          <Check size={13} className="text-sky-600" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Layout Toggle (Grid / List) */}
            <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200 shrink-0">
              <button
                type="button"
                onClick={() => setLayoutMode('grid')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  layoutMode === 'grid'
                    ? 'bg-white text-sky-700 shadow-sm font-bold'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
                title="عرض كشبكة"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('list')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  layoutMode === 'list'
                    ? 'bg-white text-sky-700 shadow-sm font-bold'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
                title="عرض كقائمة"
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {dateFilter === 'custom' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 flex flex-wrap gap-3.5 items-center"
          >
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-600">من:</span>
              <input
                type="date"
                value={customRange.start}
                onChange={e => { setCustomRange({ ...customRange, start: e.target.value }); setPage(1); }}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none text-slate-700 focus:border-sky-500 shadow-2xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">إلى:</span>
              <input
                type="date"
                value={customRange.end}
                onChange={e => { setCustomRange({ ...customRange, end: e.target.value }); setPage(1); }}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none text-slate-700 focus:border-sky-500 shadow-2xs"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setCustomRange({ start: '', end: '' });
                setDateFilter('all');
                setPage(1);
              }}
              className="px-3 py-1.5 text-xs bg-slate-200/80 hover:bg-slate-300 text-slate-700 rounded-xl font-bold transition-all cursor-pointer mr-auto"
            >
              إلغاء التخصيص
            </button>
          </motion.div>
        )}

        {/* Toolbar Footer Summary */}
        <div className="flex justify-between items-center pt-2 border-t border-gray-50 text-xs font-semibold text-gray-500">
          <span>
            {query
              ? `تم العثور على ${filteredPatients.length} من أصل ${patients.length} مريض`
              : `إجمالي الأرشيف: ${filteredPatients.length} مريض`}
          </span>
          {isFilterActive && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-bold text-sky-600 hover:text-sky-800 hover:underline transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={12} strokeWidth={2.2} />
              <span>عرض جميع الزيارات</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 4. Main Data Display (Grid or List) ────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 py-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-44 bg-white rounded-2xl border border-slate-100 p-5 shadow-2xs animate-pulse flex flex-col justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100" />
                <div className="space-y-2 flex-1">
                  <div className="h-3.5 bg-slate-100 rounded w-3/4" />
                  <div className="h-2.5 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-slate-100 rounded w-2/3" />
                <div className="h-3 bg-slate-100 rounded w-1/3" />
              </div>
              <div className="h-3 bg-slate-100 rounded w-full" />
            </div>
          ))}
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-gray-150 min-h-[340px] flex flex-col justify-center items-center print:hidden shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3.5 text-slate-300">
            {query ? <Search size={32} strokeWidth={1.5} /> : <Archive size={32} strokeWidth={1.5} />}
          </div>
          <h3 className="text-base font-black text-slate-700">
            {query ? `لا توجد نتائج مطابقة للبحث "${query}"` : "لا توجد سجلات في الأرشيف تطابق معيار التصفية المحدد"}
          </h3>
          <p className="text-slate-400 text-xs mt-1.5 font-semibold max-w-md">
            {query ? "تأكد من كتابة الاسم أو معرف الزيارة بدقة." : "جرّب تغيير الفترة الزمنية أو اختيار فئة تصفية أخرى لعرض السجلات."}
          </p>
          {isFilterActive && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-4 text-xs font-bold text-emerald-600 hover:text-emerald-800 hover:underline transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={13} strokeWidth={2.2} />
              <span>عرض جميع الزيارات</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4 flex-1 print:hidden">
          {layoutMode === 'grid' ? (
            /* ── A. Grid Mode Cards (مطابق لتصميم صفحة الأرشيف في مستخدم الطبيب) ── */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {paginatedPatients.map((p, idx) => {
                const totalAmt = parseFloat(p.total_amount || 0);
                const isExempt = Number(p.is_exempt) === 1;
                const isFollowUp = Number(p.is_follow_up) === 1;
                const isSurgery = Number(p.is_surgery ?? p.has_surgeries) === 1;
                const isExternal = Boolean(
                  Number(p.is_external) === 1 || 
                  p.latest_visit_number?.startsWith('EXT-') || 
                  (p.all_visit_numbers && p.all_visit_numbers.split(',').some(v => v.trim().startsWith('EXT-')))
                );
                const seqNum = (page - 1) * PAGE_SIZE + idx + 1;
                const dateFormatted = p.last_visit_date
                  ? `${formatDateEn(p.last_visit_date)} - ${formatTimeEn(p.last_visit_date)}`
                  : '—';
                const matchedVisit = getMatchedVisit(p, query);
                const targetVisit = matchedVisit || p.target_visit_id;

                return (
                  <div
                    key={p.id}
                    onClick={() => openPatientRecord(p.id, targetVisit)}
                    className="bg-white rounded-3xl border border-slate-100/90 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-emerald-300 hover:shadow-emerald-500/10 flex flex-col justify-between p-5 select-none shadow-[0_4px_20px_rgb(0,0,0,0.03)] group"
                    dir="rtl"
                  >
                    {/* Top Row: Avatar + Name + Badges + Visit ID + Index Counter */}
                    <div>
                      <div className="flex justify-between items-start gap-2.5">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center font-black text-base transition-transform group-hover:scale-105 shadow-xs bg-gradient-to-br from-emerald-50 to-emerald-100/80 text-emerald-700 border border-emerald-200/50">
                            {p.full_name?.trim() ? p.full_name.trim().charAt(0) : 'م'}
                          </div>
                          <div className="min-w-0 flex-1 text-right" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-black text-slate-800 text-sm leading-tight group-hover:text-emerald-700 transition-colors">
                                {p.full_name}
                              </h3>
                              {isExternal && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-teal-100/80 text-teal-800 border border-teal-200/80 select-none shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                  <Sparkles size={11} className="text-teal-600 shrink-0" strokeWidth={2.2} />
                                  <span>مريض خارجي</span>
                                </span>
                              )}
                              {isFollowUp && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-emerald-100/75 text-emerald-700 border border-emerald-200/70 select-none shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                  <RotateCcw size={11} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                                  <span>مراجعة</span>
                                </span>
                              )}
                              {isExempt && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-amber-100/75 text-amber-700 border border-amber-200/70 select-none shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                  <Crown size={11} className="text-amber-600 shrink-0" strokeWidth={2.2} />
                                  <span>إعفاء</span>
                                </span>
                              )}
                              {isSurgery && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                  <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                                  <span>عمليات</span>
                                </span>
                              )}
                            </div>
                            {(p.latest_visit_number || matchedVisit) && (
                              <div className="flex items-center gap-1.5 flex-wrap mt-1" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                                {p.latest_visit_number && (
                                  <span className="text-[11px] font-bold text-slate-400" dir="ltr">
                                    {p.latest_visit_number}
                                  </span>
                                )}
                                {matchedVisit && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs select-none leading-none">
                                    <History size={10} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                                    <span>زيارة سابقة:</span>
                                    <span dir="ltr" className="font-black">{matchedVisit}</span>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Sequential Index Counter */}
                        <span className="text-xs font-black text-slate-400 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100 flex-shrink-0">
                          {seqNum}
                        </span>
                      </div>

                      {/* Middle Financial Summary (Matching GeneralTransactions.js typography) */}
                      <div className="mt-3.5 pt-3 border-t border-slate-100/80 flex items-center justify-between">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xs font-bold text-slate-400">المدفوعات:</span>
                          {totalAmt > 0 ? (
                            <span className="inline-flex items-baseline gap-1" dir="ltr">
                              <span className="text-xs font-bold text-slate-400">ر.ي</span>
                              <span className="text-base font-black tracking-tight text-emerald-600">
                                {formatCurrency(totalAmt)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-slate-400 select-none">—</span>
                          )}
                        </div>
                        {Number(p.total_visits) > 1 && (
                          <div className="text-left">
                            <span 
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200/50 cursor-help"
                              title={p.all_visit_numbers ? `معرفات الزيارات: ${p.all_visit_numbers}` : undefined}
                            >
                              {Number(p.total_visits) === 2 ? 'زيارتان' : `${p.total_visits} زيارات`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Row: Last Visit & Action Button with Text */}
                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100/80 gap-2">
                      <span dir="ltr" className="text-xs font-bold text-slate-700 whitespace-nowrap inline-block">
                        {dateFormatted}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPatientRecord(p.id, targetVisit);
                        }}
                        title="معاينة السجل المالي للمريض"
                        className="h-8 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white flex items-center gap-1.5 text-xs font-bold shadow-xs hover:shadow-md hover:shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
                      >
                        <FileText size={13} strokeWidth={2.2} />
                        <span>معاينة السجل</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── B. List Mode Table (Smart Proportional Layout 100%) ───── */
            <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs table-fixed whitespace-nowrap">
                  <thead className="bg-gradient-to-r from-slate-50/90 via-emerald-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                    <tr>
                      <th className="w-[6%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                      <th className="w-[34%] px-4 py-4 text-right font-black text-xs text-slate-600">المريض</th>
                      <th className="w-[15%] px-4 py-4 text-center font-black text-xs text-slate-600">إجمالي الزيارات</th>
                      <th className="w-[19%] px-4 py-4 text-right font-black text-xs text-slate-600">إجمالي المدفوعات</th>
                      <th className="w-[18%] px-4 py-4 text-right font-black text-xs text-slate-600">تاريخ آخر زيارة</th>
                      <th className="w-[8%] px-4 py-4 text-center font-black text-xs text-slate-600">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/70">
                    {paginatedPatients.map((p, idx) => {
                      const totalAmt = parseFloat(p.total_amount || 0);
                      const isExempt = Number(p.is_exempt) === 1;
                      const isFollowUp = Number(p.is_follow_up) === 1;
                      const isSurgery = Number(p.is_surgery ?? p.has_surgeries) === 1;
                      const isExternal = Boolean(
                        Number(p.is_external) === 1 || 
                        p.latest_visit_number?.startsWith('EXT-') || 
                        (p.all_visit_numbers && p.all_visit_numbers.split(',').some(v => v.trim().startsWith('EXT-')))
                      );
                      const seqNum = (page - 1) * PAGE_SIZE + idx + 1;
                      const dateFormatted = p.last_visit_date
                        ? `${formatDateEn(p.last_visit_date)} - ${formatTimeEn(p.last_visit_date)}`
                        : '—';
                      const matchedVisit = getMatchedVisit(p, query);
                      const targetVisit = matchedVisit || p.target_visit_id;

                      return (
                        <tr
                          key={p.id}
                          onClick={() => openPatientRecord(p.id, targetVisit)}
                          className="hover:bg-emerald-50/30 cursor-pointer transition-colors border-b border-slate-100/70 last:border-0 group"
                        >
                          {/* Sequential Number (6%) */}
                          <td className="w-[6%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                            {seqNum}
                          </td>

                          {/* Patient Name + Visit Status Badges + Visit ID (34%) */}
                          <td className="w-[34%] px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 group-hover:scale-105 transition-transform bg-gradient-to-br from-emerald-50 to-emerald-100/80 text-emerald-700 border border-emerald-200/50">
                                {p.full_name?.trim() ? p.full_name.trim().charAt(0) : 'م'}
                              </div>
                              <div className="flex flex-col gap-0.5 min-w-0 text-right" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-black text-slate-800 text-sm group-hover:text-emerald-700 transition-colors truncate">
                                    {p.full_name}
                                  </span>
                                  {isExternal && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-teal-100/80 text-teal-800 border border-teal-200/80 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                      <Sparkles size={11} className="text-teal-600 shrink-0" strokeWidth={2.2} />
                                      <span>مريض خارجي</span>
                                    </span>
                                  )}
                                  {isFollowUp && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-emerald-100/75 text-emerald-700 border border-emerald-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                      <RotateCcw size={11} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                                      <span>مراجعة</span>
                                    </span>
                                  )}
                                  {isExempt && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-amber-100/75 text-amber-700 border border-amber-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                      <Crown size={11} className="text-amber-600 shrink-0" strokeWidth={2.2} />
                                      <span>إعفاء</span>
                                    </span>
                                  )}
                                  {isSurgery && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                      <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                                      <span>عمليات</span>
                                    </span>
                                  )}
                                </div>
                                {(p.latest_visit_number || matchedVisit) && (
                                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                                    {p.latest_visit_number && (
                                      <span className="text-[11px] font-bold text-slate-400" dir="ltr">
                                        {p.latest_visit_number}
                                      </span>
                                    )}
                                    {matchedVisit && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs select-none leading-none">
                                        <History size={10} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                                        <span>زيارة سابقة:</span>
                                        <span dir="ltr" className="font-black">{matchedVisit}</span>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Total Visits (15%) */}
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

                          {/* Total Paid (19% - Matching GeneralTransactions.js) */}
                          <td className="w-[19%] px-4 py-4 text-right align-middle">
                            <div className="flex items-center justify-start">
                              {totalAmt > 0 ? (
                                <span className="inline-flex items-baseline justify-start gap-1.5" dir="ltr">
                                  <span className="text-xs font-bold text-slate-400">ر.ي</span>
                                  <span className="text-base font-black tracking-tight text-emerald-600">
                                    {formatCurrency(totalAmt)}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-sm font-bold text-slate-400 select-none">
                                  —
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Last Visit Date & Time (18% - Matching Grid View format) */}
                          <td className="w-[18%] px-4 py-4 text-right align-middle">
                            <span dir="ltr" className="text-xs font-bold text-slate-700 whitespace-nowrap inline-block">
                              {dateFormatted}
                            </span>
                          </td>

                          {/* Action Button: Icon Only (8%) */}
                          <td className="w-[8%] px-4 py-4 text-center">
                            <div className="flex items-center justify-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPatientRecord(p.id, targetVisit);
                                }}
                                className="w-8 h-8 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white flex items-center justify-center shadow-xs hover:shadow-md hover:shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer mx-auto"
                                title="عرض السجل المالي للمريض"
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

          {/* ── C. Pagination Footer (Clean minimal without numbers or text) ── */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center text-xs font-bold text-gray-500 bg-gray-50/50 p-4 rounded-2xl border border-slate-200/60">
              <span>
                صفحة <span className="font-black text-slate-800">{page}</span> من <span className="font-black text-slate-800">{totalPages}</span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-2 bg-white border border-slate-200 rounded-xl disabled:opacity-40 text-slate-600 hover:text-slate-900 hover:bg-gray-50 transition-colors cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                  title="الصفحة السابقة"
                >
                  <ChevronRight size={18} />
                </button>

                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="p-2 bg-white border border-slate-200 rounded-xl disabled:opacity-40 text-slate-600 hover:text-slate-900 hover:bg-gray-50 transition-colors cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                  title="الصفحة التالية"
                >
                  <ChevronLeft size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Financial Record Modal */}
      {selectedPatientId && (
        <FinancialRecordModal
          token={localStorage.getItem('token') || token} 
          recordData={recordData}
          recordLoading={recordLoading}
          initialVisitId={selectedInitialVisitId}
          onClose={() => {
            setSelectedPatientId(null);
            setSelectedInitialVisitId(null);
            setRecordData(null);
          }}
        />
      )}
    </div>
  );
};

export default CashierArchive;
