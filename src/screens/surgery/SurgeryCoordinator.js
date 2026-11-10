import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Search, Plus, Calendar, DollarSign,
  Package, Stethoscope, CheckCircle, Clock,
  ChevronLeft, X, Pill, Save, AlertCircle, Syringe,
  Check, RefreshCcw, Eye, Scissors, Crown, RotateCcw,
  AlertTriangle, Sparkles, Filter, Wallet, FileText, User,
  LayoutGrid, List, ChevronDown, CalendarCheck, Tag
} from 'lucide-react';
import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';
import { getSocket } from '../../utils/socket';
import { usePersistentState } from '../../hooks/usePersistentState';
import { 
  toYemenDate, 
  getShiftStartOfDay, 
  getShiftEndOfDay, 
  getShiftWeekStartDate, 
  getShiftMonthStartDate 
} from '../../utils/shiftHelpers';
import SurgeryDetailModal from '../../components/surgery/SurgeryDetailModal';

// ── Helpers ──────────────────────────────────────────────────────────
const formatCurrency = (val) => {
  const num = parseFloat(val);
  if (isNaN(num)) return '0';
  return Math.round(num).toLocaleString('en-US');
};

const formatDateEn = (isoStr) => {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return String(isoStr);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
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

const formatRegistrationDate = (isoStr) => {
  if (!isoStr) return '—';
  const date = formatDateEn(isoStr);
  const time = formatTimeEn(isoStr);
  return time ? `${date} - ${time}` : date;
};

const formatScheduledDate = (dateStr) => {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const dateFormatted = d.toLocaleDateString('en-GB');
    const timeFormatted = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${dateFormatted} - ${timeFormatted}`;
  } catch {
    return null;
  }
};

const isScheduledToday = (scheduledDate) => {
  if (!scheduledDate) return false;
  try {
    const sDate = toYemenDate(scheduledDate);
    const now = new Date();
    const shiftStart = getShiftStartOfDay(now);
    const shiftEnd = getShiftEndOfDay(now);
    return sDate >= shiftStart && sDate <= shiftEnd;
  } catch {
    return false;
  }
};

const SURGERY_TABS = [
  {
    id: 'planned',
    label: 'محول جديد',
    sub: 'بانتظار التسعير وتحديد الموعد',
    icon: Clock,
    color: 'text-blue-600',
    bg: 'bg-blue-100',
    activeBg: 'bg-blue-600',
    border: 'border-blue-200/80',
    activeBorder: 'border-blue-500 ring-2 ring-blue-500/20',
    badgeActiveText: 'text-blue-800',
    avatarGrad: 'from-blue-50 to-blue-100/80 text-blue-700 border-blue-200/50'
  },
  {
    id: 'scheduled',
    label: 'بانتظار الدفع',
    sub: 'تم التسعير وبانتظار السداد بالصندوق',
    icon: DollarSign,
    color: 'text-amber-600',
    bg: 'bg-amber-100',
    activeBg: 'bg-amber-600',
    border: 'border-amber-200/80',
    activeBorder: 'border-amber-500 ring-2 ring-amber-500/20',
    badgeActiveText: 'text-amber-800',
    avatarGrad: 'from-amber-50 to-amber-100/80 text-amber-700 border-amber-200/50'
  },
  {
    id: 'ready',
    label: 'جاهزة للعملية',
    sub: 'تم سداد الرسوم وجاهز للإجراء',
    icon: Syringe,
    color: 'text-emerald-600',
    bg: 'bg-emerald-100',
    activeBg: 'bg-emerald-600',
    border: 'border-emerald-200/80',
    activeBorder: 'border-emerald-500 ring-2 ring-emerald-500/20',
    badgeActiveText: 'text-emerald-800',
    avatarGrad: 'from-emerald-50 to-emerald-100/80 text-emerald-700 border-emerald-200/50'
  },
  {
    id: 'post_op',
    label: 'ما بعد العملية',
    sub: 'تسجيل استهلاك المواد وتكاليف الجراحة',
    icon: Activity,
    color: 'text-purple-600',
    bg: 'bg-purple-100',
    activeBg: 'bg-purple-600',
    border: 'border-purple-200/80',
    activeBorder: 'border-purple-500 ring-2 ring-purple-500/20',
    badgeActiveText: 'text-purple-800',
    avatarGrad: 'from-purple-50 to-purple-100/80 text-purple-700 border-purple-200/50'
  },
  {
    id: 'completed',
    label: 'مكتملة',
    sub: 'عمليات منهية ومغلقة بالأرشيف',
    icon: CheckCircle,
    color: 'text-slate-600',
    bg: 'bg-slate-100',
    activeBg: 'bg-slate-800',
    border: 'border-slate-200/80',
    activeBorder: 'border-slate-500 ring-2 ring-slate-500/20',
    badgeActiveText: 'text-slate-800',
    avatarGrad: 'from-slate-100 to-slate-200/80 text-slate-700 border-slate-200/50'
  }
];

const TABS = SURGERY_TABS;

// SurgeryDetailModal extracted to src/components/surgery/SurgeryDetailModal.js

// ── Main Screen ───────────────────────────────────────────────────
const SurgeryCoordinator = () => {
  const { token } = useAuthStore();
  const [activeTab, setActiveTab] = useState('planned');
  const [surgeries, setSurgeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'week', 'month', 'custom'
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [layoutMode, setLayoutMode] = usePersistentState('surgery_coordinator_layout', 'grid');
  const [selectedSurgery, setSelectedSurgery] = useState(null);

  const fetchSurgeries = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/surgery/dashboard', { headers: { Authorization: `Bearer ${token}` }});
      const data = await res.json();
      setSurgeries(Array.isArray(data) ? data : []);
    } catch {
      toast.error('فشل تحميل العمليات');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSurgeries();
    const socket = getSocket();
    if (!socket) return;
    const handleNewReferral = () => fetchSurgeries();
    const handlePaymentReceived = () => fetchSurgeries();
    socket.on('surgery:new_referral', handleNewReferral);
    socket.on('surgery:payment_received', handlePaymentReceived);
    return () => {
      socket.off('surgery:new_referral', handleNewReferral);
      socket.off('surgery:payment_received', handlePaymentReceived);
    };
  }, [fetchSurgeries]);

  // Temporal filter logic (Official shift boundary 03:00 AM)
  const timeFilteredSurgeries = useMemo(() => {
    let result = surgeries;
    const now = new Date();

    if (dateFilter === 'today') {
      const shiftStart = getShiftStartOfDay(now);
      const shiftEnd = getShiftEndOfDay(now);
      result = result.filter(s => {
        const dateVal = s.created_at || s.scheduled_date;
        if (!dateVal) return false;
        const pDate = toYemenDate(dateVal);
        return pDate >= shiftStart && pDate <= shiftEnd;
      });
    } else if (dateFilter === 'week') {
      const shiftEnd = getShiftEndOfDay(now);
      const shiftWeekStart = getShiftWeekStartDate(now);
      result = result.filter(s => {
        const dateVal = s.created_at || s.scheduled_date;
        if (!dateVal) return false;
        const pDate = toYemenDate(dateVal);
        return pDate >= shiftWeekStart && pDate <= shiftEnd;
      });
    } else if (dateFilter === 'month') {
      const shiftEnd = getShiftEndOfDay(now);
      const shiftMonthStart = getShiftMonthStartDate(now);
      result = result.filter(s => {
        const dateVal = s.created_at || s.scheduled_date;
        if (!dateVal) return false;
        const pDate = toYemenDate(dateVal);
        return pDate >= shiftMonthStart && pDate <= shiftEnd;
      });
    } else if (dateFilter === 'custom' && customRange.start && customRange.end) {
      const [sY, sM, sD] = customRange.start.split('-').map(Number);
      const start = new Date(sY, sM - 1, sD, 3, 0, 0, 0);

      const [eY, eM, eD] = customRange.end.split('-').map(Number);
      const end = new Date(eY, eM - 1, eD + 1, 2, 59, 59, 999);

      result = result.filter(s => {
        const dateVal = s.created_at || s.scheduled_date;
        if (!dateVal) return false;
        const pDate = toYemenDate(dateVal);
        return pDate >= start && pDate <= end;
      });
    }

    return result;
  }, [surgeries, dateFilter, customRange]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return timeFilteredSurgeries.filter(s => {
      const matchTab = s.status === activeTab;
      if (!term) return matchTab;
      const matchSearch =
        (s.full_name && s.full_name.toLowerCase().includes(term)) ||
        (s.visit_number && s.visit_number.toLowerCase().includes(term)) ||
        (s.surgery_type && s.surgery_type.toLowerCase().includes(term));
      return matchTab && matchSearch;
    });
  }, [timeFilteredSurgeries, activeTab, search]);

  const tabCounts = useMemo(() => {
    return timeFilteredSurgeries.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {});
  }, [timeFilteredSurgeries]);

  const isFilterActive = search !== '' || dateFilter !== 'all' || customRange.start !== '';

  const handleResetFilters = () => {
    setSearch('');
    setDateFilter('all');
    setCustomRange({ start: '', end: '' });
  };

  // ── Surgery Card Renderer (Matching Cashier Archive Design) ──────
  const renderSurgeryCard = (s, idx) => {
    const isPlanned = s.status === 'planned';
    const hasSurgeryType = Boolean(s.surgery_type && s.surgery_type.trim());
    const isPriced = s.full_price != null && parseFloat(s.full_price) > 0;
    const priceVal = parseFloat(s.full_price || 0);
    const paidVal = parseFloat(s.total_paid || 0);
    const hasFinancials = isPriced || paidVal > 0;
    const scheduledToday = isScheduledToday(s.scheduled_date);

    // In 'planned' tab, hide empty surgery box and empty financials to avoid hollowness
    const showSurgeryTypeBox = !isPlanned || hasSurgeryType;
    const showFinancials = !isPlanned || hasFinancials;

    const surgeryName = s.surgery_type?.trim() || '';
    const isLongSurgeryType = surgeryName.length > 22;

    return (
      <motion.div
        key={s.id}
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.22, delay: Math.min(idx * 0.03, 0.25) }}
        onClick={() => setSelectedSurgery(s)}
        className="bg-white rounded-3xl border border-slate-100/90 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-purple-300 hover:shadow-purple-500/10 flex flex-col p-5 select-none shadow-[0_4px_20px_rgb(0,0,0,0.03)] group min-h-[220px]"
        dir="rtl"
      >
        {/* 1. Top Section (flex-1 ensures proper space distribution without hanging fields) */}
        <div className="flex-1 flex flex-col">
          {/* Top Row: Avatar + Name + Surgery Badge + Index Counter */}
          <div className="flex justify-between items-start gap-2.5">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center font-black text-base transition-transform group-hover:scale-105 shadow-xs bg-gradient-to-br from-purple-50 to-purple-100/80 text-purple-700 border border-purple-200/50">
                {s.full_name?.trim() ? s.full_name.trim().charAt(0) : 'م'}
              </div>
              <div className="min-w-0 flex-1 text-right" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-black text-slate-800 text-sm leading-tight group-hover:text-purple-700 transition-colors truncate">
                    {s.full_name}
                  </h3>
                  {/* Standardized Surgery Badge (Only) */}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none shrink-0 shadow-2xs leading-none whitespace-nowrap">
                    <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                    <span>عمليات</span>
                  </span>

                  {/* Scheduled Today Badge */}
                  {scheduledToday && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-emerald-100/80 text-emerald-800 border border-emerald-200 select-none shrink-0 shadow-2xs leading-none whitespace-nowrap animate-pulse">
                      <Calendar size={11} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                      <span>العملية اليوم</span>
                    </span>
                  )}
                </div>

                {/* Visit Number (Without age / gender) */}
                <div className="flex items-center gap-1.5 flex-wrap mt-1" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                  <span className="text-[11px] font-bold text-slate-400" dir="ltr">
                    {s.visit_number}
                  </span>
                </div>
              </div>
            </div>

            {/* Sequential Index Counter */}
            <span className="text-xs font-black text-slate-400 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100 flex-shrink-0">
              {idx + 1}
            </span>
          </div>

          {/* Middle: Surgery Type (Adaptive: Same row if short, multi-line if long) */}
          {showSurgeryTypeBox && (
            <div className="mt-3.5 mb-2.5 pt-2.5 border-t border-slate-100/70 text-right">
              {isLongSurgeryType ? (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-1">
                    <Activity size={13} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                    <span>نوع العملية:</span>
                  </div>
                  <p className="text-sm font-black text-slate-800 leading-snug pr-4.5">
                    {hasSurgeryType ? surgeryName : <span className="text-slate-400 font-bold italic">لم يتم تحديد نوع العملية بعد</span>}
                  </p>
                </div>
              ) : (
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 shrink-0">
                    <Activity size={13} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                    <span>نوع العملية:</span>
                  </div>
                  <span className="text-sm font-black text-slate-800 truncate">
                    {hasSurgeryType ? surgeryName : <span className="text-slate-400 font-bold italic">غير محدد</span>}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. Middle Financial Summary (Anchored above footer: Fees row + Payments row below it) */}
        {showFinancials && (
          <div className="mt-auto pt-2.5 border-t border-slate-100/80 space-y-2">
            {/* صف رسوم العملية */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-500">
                <Tag size={13} className="text-blue-600 shrink-0" strokeWidth={2.2} />
                <span>رسوم العملية:</span>
              </div>
              {isPriced ? (
                <span className="inline-flex items-baseline gap-1" dir="ltr">
                  <span className="text-xs font-bold text-slate-400">ر.ي</span>
                  <span className="text-sm font-black tracking-tight text-slate-800">
                    {formatCurrency(priceVal)}
                  </span>
                </span>
              ) : (
                <span className="font-bold text-rose-500">غير مسعر</span>
              )}
            </div>

            {/* صف المدفوعات (أسفل صف الرسوم) */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-500">
                <CheckCircle size={13} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                <span>المدفوعات:</span>
              </div>
              {paidVal > 0 ? (
                <span className="inline-flex items-baseline gap-1" dir="ltr">
                  <span className="text-xs font-bold text-slate-400">ر.ي</span>
                  <span className="text-sm font-black tracking-tight text-emerald-600">
                    {formatCurrency(paidVal)}
                  </span>
                </span>
              ) : (
                <span className="font-bold text-slate-400 select-none">—</span>
              )}
            </div>
          </div>
        )}

        {/* 3. Bottom Row: Date & Action Button (Matching Cashier Archive) */}
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100/80 gap-2">
          {/* Right: Date (تاريخ التسجيل) */}
          <div className="text-xs font-bold text-slate-500 whitespace-nowrap" dir="ltr" title="تاريخ التسجيل">
            {formatRegistrationDate(s.created_at)}
          </div>

          {/* Left: Action Button with text and icon */}
          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setSelectedSurgery(s)}
              title="معاينة وتعديل ملف العملية"
              className="h-8 px-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white flex items-center gap-1.5 text-xs font-black shadow-xs hover:shadow-md hover:shadow-purple-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
            >
              <Eye size={13} strokeWidth={2.2} />
              <span>معاينة الملف</span>
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-6 w-full pb-12" dir="rtl">
      {/* ── 1. Page Header (مثل لوحة تحكم الطبيب) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 flex-shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-purple-500/20">
            <Scissors size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800">منسق العمليات الجراحية</h1>
            <p className="text-sm font-bold text-gray-500 mt-0.5">
              متابعة وإدارة دورة حياة العمليات الجراحية، التسعير، استهلاك المواد، والتكاليف لحظياً
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchSurgeries}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-sm font-black shadow-md shadow-purple-500/25 hover:shadow-purple-500/35 transition-all cursor-pointer active:scale-95"
          >
            <RefreshCcw size={16} strokeWidth={2.2} className={loading ? "animate-spin" : ""} />
            <span>تحديث البيانات</span>
          </button>
        </div>
      </div>

      {/* ── 2. Quick Stats Grid (مثل صفحة لوحة التحكم) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 w-full flex-shrink-0">
        {SURGERY_TABS.map((s, i) => (
          <div
            key={i}
            onClick={() => setActiveTab(s.id)}
            className={`p-4 rounded-2xl border ${
              activeTab === s.id ? s.activeBorder : s.border
            } bg-white shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden flex flex-col justify-between isolate group cursor-pointer`}
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
                  <span className="text-xs font-bold text-gray-400 uppercase">حالة</span>
                  <span>{tabCounts[s.id] || 0}</span>
                </p>
              )}
              {s.sub && (
                <p
                  className="text-[10px] text-gray-400 font-semibold mt-1 truncate"
                  title={s.sub}
                >
                  {s.sub}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── 3. Advanced Filter Toolbar (مثل أرشيف المرضى في الطبيب والمحاسب) ── */}
      <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/70 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          {/* Search bar (Right side in RTL) */}
          <div className="relative w-full md:w-80">
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
              <Search size={16} strokeWidth={2.2} />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم، رقم الزيارة، أو نوع العملية..."
              className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-purple-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200/60 shadow-xs transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                title="مسح البحث"
              >
                <div className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                  <X size={12} strokeWidth={2.5} />
                </div>
              </button>
            )}
          </div>

          {/* Temporal filter tabs & Layout Toggle (Left side in RTL) */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            <div className="flex gap-1 bg-gray-100/90 p-1.5 rounded-2xl text-xs font-bold text-gray-500 overflow-x-auto no-scrollbar">
              {[
                { id: "all", label: "الكل" },
                { id: "today", label: "اليوم" },
                { id: "week", label: "هذا الأسبوع" },
                { id: "month", label: "هذا الشهر" },
                { id: "custom", label: "تاريخ مخصص" },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setDateFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-bold cursor-pointer ${
                    dateFilter === f.id
                      ? "bg-white text-purple-700 shadow-xs font-black"
                      : "hover:bg-white/40 text-gray-600"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Layout Toggle (شبكة / قائمة) */}
            <div className="flex items-center bg-gray-100/90 p-1 rounded-2xl border border-gray-200/50 shrink-0">
              <button
                type="button"
                onClick={() => setLayoutMode("grid")}
                className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                  layoutMode === "grid"
                    ? "bg-white text-purple-700 shadow-xs"
                    : "text-slate-400 hover:text-slate-600"
                }`}
                title="عرض البطاقات (Grid)"
              >
                <LayoutGrid size={16} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode("list")}
                className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                  layoutMode === "list"
                    ? "bg-white text-purple-700 shadow-xs"
                    : "text-slate-400 hover:text-slate-600"
                }`}
                title="عرض الجدول (List)"
              >
                <List size={16} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        </div>

        {/* Custom Range Picker */}
        {dateFilter === "custom" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500">من:</span>
              <input
                type="date"
                value={customRange.start}
                onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none text-slate-700 focus:border-purple-500 shadow-2xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500">إلى:</span>
              <input
                type="date"
                value={customRange.end}
                onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none text-slate-700 focus:border-purple-500 shadow-2xs"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setCustomRange({ start: "", end: "" });
                setDateFilter("all");
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
            {search
              ? `تم العثور على ${filtered.length} من أصل ${surgeries.length} عملية`
              : `إجمالي العمليات في هذه الفترة: ${filtered.length} عملية`}
          </span>
          {isFilterActive && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-bold text-purple-600 hover:text-purple-800 hover:underline transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={12} strokeWidth={2.2} />
              <span>إعادة تعيين الفلاتر</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 4. Tabs Menu (مطابق لتصميم وتنسيق وتخطيط لوحة تحكم المحاسب) ── */}
      <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1.5 flex-shrink-0 overflow-x-auto no-scrollbar mb-6">
        {SURGERY_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = tabCounts[tab.id] || 0;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-max flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all duration-300 whitespace-nowrap cursor-pointer ${
                isActive
                  ? `${tab.activeBg} text-white shadow-md transform scale-[1.02]`
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                  isActive ? "bg-white/20 text-white" : tab.bg + " " + tab.color
                }`}
              >
                <tab.icon size={16} strokeWidth={2.5} />
              </div>
              <span>{tab.label}</span>
              {count > 0 && (
                <span
                  className={`mr-1 px-2 py-0.5 rounded-full text-xs font-black ${
                    isActive
                      ? "bg-white " + tab.badgeActiveText
                      : "bg-red-500 text-white shadow-sm animate-pulse"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── 5. Main Content Area (Grid or List with non-shifting min-h-[480px]) ── */}
      <div className="min-h-[480px]">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-56 bg-white rounded-3xl border border-slate-100 p-5 shadow-2xs animate-pulse flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-slate-100" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-4 bg-slate-200 rounded w-1/2" />
                      <div className="h-3 bg-slate-100 rounded w-1/3" />
                    </div>
                  </div>
                  <div className="h-14 bg-slate-50 rounded-xl border border-slate-100" />
                </div>
                <div className="space-y-2 pt-3 border-t border-slate-100">
                  <div className="flex justify-between">
                    <div className="h-3 bg-slate-100 rounded w-1/4" />
                    <div className="h-3 bg-slate-100 rounded w-1/4" />
                  </div>
                  <div className="h-8 bg-slate-100 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-3xl p-16 text-center border border-gray-150 min-h-[360px] flex flex-col justify-center items-center shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3.5 text-slate-300">
              {search ? (
                <Search size={32} strokeWidth={1.5} />
              ) : (
                <Scissors size={32} strokeWidth={1.5} />
              )}
            </div>
            <h3 className="text-base font-black text-slate-700">
              {search
                ? `لا توجد نتائج مطابقة لبحثك "${search}"`
                : "لا توجد عمليات جراحية في هذه المرحلة تطابق التصفية المحددة"}
            </h3>
            <p className="text-slate-400 text-xs mt-1.5 font-semibold max-w-md">
              {search
                ? "تأكد من كتابة الاسم أو رقم الزيارة بدقة."
                : "يمكنك تغيير الفترة الزمنية أو مراجعة باقي مراحل دورة العمليات."}
            </p>
            {isFilterActive && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-4 text-xs font-bold text-purple-600 hover:text-purple-800 hover:underline transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={13} strokeWidth={2.2} />
                <span>إعادة تعيين الفلاتر</span>
              </button>
            )}
          </div>
        ) : layoutMode === "grid" ? (
          /* ── Grid Mode (مطابق لأرشيف المحاسب) ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <AnimatePresence mode="popLayout">
              {filtered.map((s, idx) => renderSurgeryCard(s, idx))}
            </AnimatePresence>
          </div>
        ) : (
          /* ── List Mode (جدول متناسق مطابق لأرشيف المحاسب والطبيب) ── */
          <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs table-fixed whitespace-nowrap">
                <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-bold">
                  <tr>
                    <th className="py-3.5 px-4 text-center w-[4%] font-black text-xs text-slate-400">#</th>
                    <th className="py-3.5 px-4 text-right w-[27%] font-black text-xs text-slate-600">المريض ومعرف الزيارة</th>
                    <th className="py-3.5 px-4 text-right w-[24%] font-black text-xs text-slate-600">نوع العملية</th>
                    <th className="py-3.5 px-4 text-center w-[12%] font-black text-xs text-slate-600">رسوم العملية</th>
                    <th className="py-3.5 px-4 text-center w-[11%] font-black text-xs text-slate-600">المدفوعات</th>
                    <th className="py-3.5 px-4 text-center w-[16%] font-black text-xs text-slate-600">
                      تاريخ التسجيل
                    </th>
                    <th className="py-3.5 px-4 text-center w-[6%] font-black text-xs text-slate-600">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filtered.map((s, idx) => {
                    const hasSurgeryType = Boolean(s.surgery_type && s.surgery_type.trim());
                    const isPriced = s.full_price != null && parseFloat(s.full_price) > 0;
                    const priceVal = parseFloat(s.full_price || 0);
                    const paidVal = parseFloat(s.total_paid || 0);

                    return (
                      <tr
                        key={s.id}
                        onClick={() => setSelectedSurgery(s)}
                        className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4 text-center font-bold text-xs text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-black text-xs shrink-0 border border-purple-200/50">
                              {s.full_name?.trim() ? s.full_name.trim().charAt(0) : "م"}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-black text-slate-800 text-sm group-hover:text-purple-700 transition-colors truncate">
                                  {s.full_name}
                                </span>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 leading-none">
                                  <Scissors size={10} className="text-purple-600" />
                                  <span>عمليات</span>
                                </span>
                              </div>
                              <span className="text-[11px] font-bold text-slate-400 block mt-0.5" dir="ltr">
                                {s.visit_number}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <Activity size={12} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                            <p className="font-black text-slate-800 text-xs truncate max-w-xs">
                              {hasSurgeryType ? (
                                s.surgery_type
                              ) : (
                                <span className="text-slate-400 italic font-bold">غير محدد</span>
                              )}
                            </p>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {isPriced ? (
                            <span className="inline-flex items-baseline gap-1" dir="ltr">
                              <span className="text-xs font-bold text-slate-400">ر.ي</span>
                              <span className="text-base font-black tracking-tight text-slate-800">
                                {formatCurrency(priceVal)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-rose-500">غير مسعر</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {paidVal > 0 ? (
                            <span className="inline-flex items-baseline gap-1" dir="ltr">
                              <span className="text-xs font-bold text-slate-400">ر.ي</span>
                              <span className="text-base font-black tracking-tight text-emerald-600">
                                {formatCurrency(paidVal)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-300 font-bold select-none">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center text-slate-600 font-bold text-xs" dir="ltr">
                          {formatRegistrationDate(s.created_at)}
                        </td>
                        <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center">
                            <button
                              type="button"
                              onClick={() => setSelectedSurgery(s)}
                              title="معاينة وتعديل ملف العملية"
                              className="w-8 h-8 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white flex items-center justify-center shadow-xs hover:shadow-md hover:shadow-purple-500/20 active:scale-95 transition-all cursor-pointer mx-auto"
                            >
                              <Eye size={14} strokeWidth={2.2} />
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

      <AnimatePresence>
        {selectedSurgery && (
          <SurgeryDetailModal
            surgeryRow={selectedSurgery}
            token={token}
            onClose={() => setSelectedSurgery(null)}
            onRefresh={fetchSurgeries}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default SurgeryCoordinator;
