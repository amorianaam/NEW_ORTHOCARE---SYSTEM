import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FlaskConical, CheckCircle2,
  TrendingUp, LayoutGrid, List, Eye, ChevronLeft, ChevronRight,
  Search, X, Scissors, FileText, Users
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useLocation } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';
import { usePersistentState } from '../../hooks/usePersistentState';
import { LabPatientDetailPanel } from '../../components/lab/LabModals';
import { formatArabicTestsCount } from '../../utils/arabicFormatters';
import {
  getCurrentShiftDate,
  formatShiftDate,
  getShiftWeekStartDate,
  getShiftMonthStartDate
} from '../../utils/shiftHelpers';

const PAGE_SIZE = 20;

// Helper: Format ISO Date/Time to clean English two-line format
const formatDateTimeEn = (isoStr) => {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return String(isoStr);

  const pad = (n) => n.toString().padStart(2, '0');
  const date = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;

  let hours = d.getHours();
  const minutes = pad(d.getMinutes());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;

  return `${date} - ${pad(hours)}:${minutes} ${ampm}`;
};

const LabRequests = () => {
  const { token } = useAuthStore();
  const location = useLocation();
  const latestLabEvent = useSocketStore(state => state.latestLabEvent);

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [layoutMode, setLayoutMode] = usePersistentState('lab_layout_preference', 'grid');
  const [selectedVisitId, setSelectedVisitId] = useState(null);

  // Filters
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // 'all' | 'today' | 'week' | 'month' | 'custom'
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [page, setPage] = useState(1);

  // Deep linking for visitId
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const visitId = params.get('visitId');
    if (visitId) {
      setSelectedVisitId(Number(visitId));
      window.history.replaceState({}, '', '/lab/reports');
    }
  }, [location.search]);

  // Fetch stats and table data
  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      let url = '/api/lab/stats?';
      
      if (dateFilter === 'custom' && customRange.start && customRange.end) {
        url += `startDate=${customRange.start}&endDate=${customRange.end}`;
      } else if (dateFilter !== 'all') {
        let start = '';
        const end = getCurrentShiftDate();
        
        if (dateFilter === 'today') {
          start = end;
        } else if (dateFilter === 'week') {
          start = formatShiftDate(getShiftWeekStartDate());
        } else if (dateFilter === 'month') {
          start = formatShiftDate(getShiftMonthStartDate());
        }
        url += `startDate=${start}&endDate=${end}`;
      }

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      } else {
        toast.error('فشل تحميل الإحصائيات');
      }
    } catch {
      toast.error('فشل تحميل الإحصائيات');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, dateFilter, customRange]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Real-time update on socket event
  useEffect(() => {
    if (latestLabEvent?.id || latestLabEvent?.timestamp) {
      fetchStats(true);
    }
  }, [latestLabEvent, fetchStats]);

  const handleResetFilters = () => {
    setDateFilter('all');
    setCustomRange({ start: '', end: '' });
    setQuery('');
    setPage(1);
    toast.info('تم إعادة تعيين فلاتر التقارير');
  };

  // 3 Cards Quick Stats
  const statsCards = useMemo(() => [
    { 
      id: 'total',
      label: 'إجمالي التحاليل', 
      rawValue: Number(stats?.summary?.total_requests || 0),
      value: (stats?.summary?.total_requests || 0).toLocaleString('en-US'), 
      unit: 'تحليل', 
      sub: 'تحاليل مستلمة وجارية ومنجزة', 
      icon: FlaskConical, 
      color: 'text-violet-600', 
      bg: 'bg-violet-100', 
      border: 'border-violet-200' 
    },
    { 
      id: 'completed',
      label: 'التحاليل المنجزة', 
      rawValue: Number(stats?.summary?.completed || 0),
      value: (stats?.summary?.completed || 0).toLocaleString('en-US'), 
      unit: 'تحليل', 
      sub: 'تم اعتماد وتوثيق نتائجها', 
      icon: CheckCircle2, 
      color: 'text-emerald-600', 
      bg: 'bg-emerald-100', 
      border: 'border-emerald-200' 
    },
    { 
      id: 'visits',
      label: 'إجمالي الزيارات', 
      rawValue: Number(stats?.tableData?.length || 0),
      value: (stats?.tableData?.length || 0).toLocaleString('en-US'), 
      unit: 'زيارة', 
      sub: 'سجلات مراجعي المختبر', 
      icon: Users, 
      color: 'text-indigo-600', 
      bg: 'bg-indigo-100', 
      border: 'border-indigo-200' 
    },
  ].filter(s => loading || s.rawValue > 0), [stats, loading]);

  const statsGridColsClass =
    statsCards.length === 1
      ? 'grid-cols-1 sm:max-w-[340px]'
      : statsCards.length === 2
      ? 'grid-cols-1 sm:grid-cols-2 sm:max-w-[694px]'
      : 'grid-cols-1 sm:grid-cols-3';

  // Filter Data strictly by (اسم المريض - معرف الزيارة - اسم التحليل - اسم القسم\نوع التحليل)
  const filteredData = useMemo(() => {
    const list = stats?.tableData || [];
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();

    return list.filter(row => {
      const patientMatch = (row.patient_name || '').toLowerCase().includes(q);
      const visitMatch = String(row.visit_number || row.visit_id || '').toLowerCase().includes(q);
      const testMatch = (row.test_names || '').toLowerCase().includes(q);
      const categoryMatch = (row.category_names || '').toLowerCase().includes(q);
      return patientMatch || visitMatch || testMatch || categoryMatch;
    });
  }, [stats?.tableData, query]);

  // Pagination (20 items per page)
  const totalPages = Math.ceil((filteredData.length || 0) / PAGE_SIZE) || 1;
  const paginatedData = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredData.slice(start, start + PAGE_SIZE);
  }, [filteredData, page]);

  return (
    <div className="space-y-6 w-full p-6" dir="rtl">
      {/* ── 1. Page Header Banner (Matching LaboratoryDashboard Style) ── */}
      <div className="flex items-center justify-between gap-4 mb-2 flex-shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-800 text-white flex items-center justify-center shadow-md shadow-violet-500/20">
            <TrendingUp size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800">تقارير وإحصائيات المختبر التحليلية</h1>
            <p className="text-sm font-bold text-gray-500 mt-0.5">
              تتبع الأداء، مراجعي الفحوصات المخبرية، وحالة نتائج التحاليل
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. Quick Stats Grid (Directly below the banner) ── */}
      {statsCards.length > 0 && (
        <div className={`grid ${statsGridColsClass} gap-3.5 w-full flex-shrink-0`}>
          {statsCards.map((s, i) => (
            <div
              key={s.id || i}
              className={`p-4 rounded-2xl border ${s.border} bg-white shadow-2xs hover:shadow-xs transition-all duration-200 relative overflow-hidden flex flex-col justify-between isolate group`}
            >
              <div
                className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${s.bg} to-transparent opacity-50 rounded-bl-full z-[-1] transition-transform duration-500 group-hover:scale-110`}
              />
              <div className="flex justify-between items-start mb-3">
                <div
                  className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center shadow-2xs transition-transform group-hover:scale-105`}
                >
                  <s.icon size={16} className={s.color} />
                </div>
                <span className={`text-xs font-bold ${s.color}`}>
                  {s.label}
                </span>
              </div>
              <div>
                {loading && !stats ? (
                  <div className="h-7 bg-gray-100 rounded-lg animate-pulse w-24"></div>
                ) : (
                  <p
                    className="text-xl font-black text-gray-800 flex items-baseline justify-end gap-1.5 transition-opacity duration-200"
                    dir="ltr"
                  >
                    {s.unit ? <span className="text-xs font-bold text-gray-400 uppercase">{s.unit}</span> : null}
                    <span>{s.value}</span>
                  </p>
                )}
                {s.sub && (
                  <p className="text-[10px] text-gray-400 font-semibold mt-1 truncate text-right" title={s.sub}>
                    {s.sub}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 3. Advanced Filter Toolbar (Matching Secretary PatientsArchive Style) ── */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4 flex-shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          {/* Search Bar (Right in RTL) */}
          <div className="relative w-full md:w-80 lg:w-96">
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
              <Search size={16} strokeWidth={2.2} />
            </div>
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1); }}
              placeholder="بحث باسم المريض، معرف الزيارة، التحليل، أو القسم..."
              className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-violet-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200/60 shadow-xs transition-all"
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

          {/* Temporal filter tabs & Layout Toggle (Left in RTL) */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
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
                    dateFilter === f.id ? 'bg-white text-violet-800 shadow-xs' : 'hover:bg-white/40 text-gray-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* View Switcher */}
            <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shrink-0">
              <button
                type="button"
                onClick={() => setLayoutMode('grid')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  layoutMode === 'grid' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
                title="عرض كشبكة"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('list')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  layoutMode === 'list' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'
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
          <div className="p-4 bg-violet-50/40 rounded-2xl border border-violet-100/80 flex flex-wrap gap-4 items-center animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-violet-800">من:</span>
              <input
                type="date"
                value={customRange.start}
                onChange={e => { setCustomRange(prev => ({ ...prev, start: e.target.value })); setPage(1); }}
                className="px-3 py-1.5 bg-white border border-violet-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-violet-500 cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-violet-800">إلى:</span>
              <input
                type="date"
                value={customRange.end}
                onChange={e => { setCustomRange(prev => ({ ...prev, end: e.target.value })); setPage(1); }}
                className="px-3 py-1.5 bg-white border border-violet-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-violet-500 cursor-pointer"
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

        {/* Counter inside filter card (Matching Secretary PatientsArchive style) */}
        <div className="flex justify-between items-center pt-3 border-t border-gray-50 text-xs font-semibold text-slate-500">
          <span>
            تم العثور على <span className="text-violet-700 font-black">{filteredData.length}</span> من السجلات
          </span>
          {(dateFilter !== 'all' || query) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-[11px] font-bold text-violet-600 hover:text-violet-700 hover:underline cursor-pointer"
            >
              عرض جميع السجلات
            </button>
          )}
        </div>
      </div>

      {/* ── 4. Main Content: Grid / List Render ── */}
      {loading && !stats ? (
        <div className="flex justify-center items-center p-16 bg-white rounded-3xl border border-gray-100 shadow-sm">
          <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredData.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-300">
            {query ? <Search size={32} strokeWidth={1.5} /> : <FlaskConical size={32} strokeWidth={1.5} />}
          </div>
          <h3 className="text-base font-black text-gray-700">
            {query ? `لا توجد نتائج مطابقة للبحث "${query}"` : 'لا توجد سجلات مخبرية في هذه الفترة'}
          </h3>
          <p className="text-gray-400 text-xs mt-1.5 font-semibold">
            {query ? 'تأكد من كتابة الاسم أو معرف الزيارة أو اسم التحليل أو القسم بشكل صحيح.' : 'يمكنك تجربة تغيير الفلتر الزمني لعرض المزيد من السجلات.'}
          </p>
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="mt-3 text-xs font-bold text-violet-600 hover:text-violet-700 bg-violet-50 px-3 py-1.5 rounded-lg border border-violet-100 transition-colors cursor-pointer"
            >
              مسح كلمة البحث
            </button>
          )}
        </div>
      ) : layoutMode === 'grid' ? (
        /* ── Grid Mode (Matching LaboratoryDashboard Cards) ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {paginatedData.map((row, idx) => {
            const dateFormatted = formatDateTimeEn(row.date);
            const cardIndex = (page - 1) * PAGE_SIZE + idx + 1;

            return (
              <div
                key={row.visit_id || row.visit_number || idx}
                onClick={() => setSelectedVisitId(row.visit_id)}
                className="bg-white rounded-3xl border border-slate-100/90 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-violet-300 flex flex-col justify-between p-5 select-none shadow-[0_4px_20px_rgb(0,0,0,0.03)] group"
                dir="rtl"
              >
                {/* Top: Avatar + Name + Surgery Badge + Visit Number + Index Counter */}
                <div>
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center font-black text-base transition-transform group-hover:scale-105 shadow-xs bg-gradient-to-br from-violet-50 to-violet-100/80 text-violet-700 border border-violet-200/50">
                        {row.patient_name?.charAt(0) ?? '؟'}
                      </div>
                      <div className="min-w-0 flex-1 text-right" dir="rtl">
                        <div className="flex items-center gap-1 flex-wrap">
                          <h3 className="font-black text-slate-800 text-sm leading-tight group-hover:text-violet-700 transition-colors truncate">
                            {row.patient_name || 'مريض غير معروف'}
                          </h3>
                          {Boolean(row.is_surgery) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                              <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                              <span>عمليات</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-bold text-slate-400 text-right mt-1 w-full" dir="rtl">
                          <span dir="ltr">{row.visit_number}</span>
                        </p>
                      </div>
                    </div>

                    {/* Index Counter Badge */}
                    <span className="text-xs font-black text-slate-400 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100 flex-shrink-0">
                      {cardIndex}
                    </span>
                  </div>

                  {/* Middle Details: إجمالي التحاليل فقط بدون أقسام أو حالات خدمات */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100/80">
                    <span className="text-[11px] font-black bg-violet-50 text-violet-700 px-3 py-1 rounded-xl border border-violet-200/60 flex items-center gap-1.5">
                      <FlaskConical size={13} />
                      <span>{formatArabicTestsCount(row.total_tests)}</span>
                    </span>
                  </div>
                </div>

                {/* Bottom Metadata: Date/Time + Action Button */}
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100/80 gap-2">
                  <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                    {dateFormatted}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedVisitId(row.visit_id);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-black text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200/60 rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer"
                    title="عرض تقرير التحاليل المخبرية"
                  >
                    <Eye size={13} strokeWidth={2.2} />
                    <span>عرض التقرير</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── List Mode (Matching LaboratoryDashboard Table) ── */
        <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap table-fixed">
              <thead className="bg-gradient-to-r from-slate-50/90 via-violet-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                <tr>
                  <th className="w-[6%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                  <th className="w-[44%] px-4 py-4 text-right font-black text-xs text-slate-600">المريض</th>
                  <th className="w-[20%] px-4 py-4 text-right font-black text-xs text-slate-600">إجمالي التحاليل</th>
                  <th className="w-[18%] px-4 py-4 text-right font-black text-xs text-slate-600">وقت وتاريخ الإنجاز</th>
                  <th className="w-[12%] px-4 py-4 text-center font-black text-xs text-slate-600">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/70">
                {paginatedData.map((row, idx) => {
                  const dateFormatted = formatDateTimeEn(row.date);
                  const cardIndex = (page - 1) * PAGE_SIZE + idx + 1;

                  return (
                    <tr
                      key={row.visit_id || row.visit_number || idx}
                      onClick={() => setSelectedVisitId(row.visit_id)}
                      className="hover:bg-violet-50/30 cursor-pointer transition-colors border-b border-slate-100/70 last:border-0 group"
                    >
                      {/* # Number */}
                      <td className="w-[6%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                        {cardIndex}
                      </td>

                      {/* Patient Details */}
                      <td className="w-[44%] px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 group-hover:scale-105 transition-transform bg-gradient-to-br from-violet-50 to-violet-100/80 text-violet-700 border border-violet-200/50">
                            {row.patient_name?.charAt(0) ?? '؟'}
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0 text-right" dir="rtl">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-black text-slate-800 text-sm group-hover:text-violet-700 transition-colors truncate">
                                {row.patient_name}
                              </span>
                              {Boolean(row.is_surgery) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                  <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                                  <span>عمليات</span>
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-bold text-slate-400 text-right mt-0.5 w-full" dir="rtl">
                              <span dir="ltr">{row.visit_number}</span>
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Total Tests (إجمالي التحاليل فقط) */}
                      <td className="w-[20%] px-4 py-4 text-right">
                        <span className="inline-flex items-center gap-1.5 text-xs font-black bg-violet-50 text-violet-700 px-3 py-1 rounded-xl border border-violet-200/60">
                          <FlaskConical size={13} />
                          <span>{formatArabicTestsCount(row.total_tests)}</span>
                        </span>
                      </td>

                      {/* Date & Time */}
                      <td className="w-[18%] px-4 py-4 text-right">
                        <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                          {dateFormatted}
                        </span>
                      </td>

                      {/* Action Button */}
                      <td className="w-[12%] px-4 py-4 text-center">
                        <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setSelectedVisitId(row.visit_id)}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-black text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200/60 rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer"
                            title="عرض التقرير"
                          >
                            <Eye size={13} strokeWidth={2.2} />
                            <span>عرض التقرير</span>
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

      {/* ── 5. Pagination (Matching Secretary PatientsArchive Style) ── */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center text-xs font-bold text-slate-500 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex-shrink-0 mt-2">
          <span>
            صفحة <span className="text-violet-700 font-black">{page}</span> من <span className="font-black">{totalPages}</span>
          </span>
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

      {/* ── 7. Detailed Lab Record Modal (Unified LabPatientDetailPanel) ── */}
      {selectedVisitId && (
        <LabPatientDetailPanel
          visitId={selectedVisitId}
          token={token}
          isArchiveMode={true}
          onClose={() => setSelectedVisitId(null)}
          onCompleted={() => fetchStats(true)}
        />
      )}
    </div>
  );
};

export default LabRequests;
