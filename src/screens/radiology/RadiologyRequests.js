import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import {
  Radiation,
  BarChart3,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Eye,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Search,
  X,
  Scissors,
  RefreshCcw,
  AlertCircle,
  Sparkles
} from "lucide-react";
import { toast } from "react-toastify";
import useAuthStore from "../../store/useAuthStore";
import { usePersistentState } from "../../hooks/usePersistentState";
import { PatientDetailPanel } from "../../components/radiology/RadiologyModals";
import { formatArabicScansCount } from "../../utils/arabicFormatters";
import { getSocket } from "../../utils/socket";
import {
  getCurrentShiftDate,
  formatShiftDate,
  getShiftWeekStartDate,
  getShiftMonthStartDate
} from "../../utils/shiftHelpers";

const PAGE_SIZE = 20;

// ── English Date & Time Helpers ─────────────────────────────────────────────
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

// ── Reports Tab ─────────────────────────────────────────────────────────────
const ReportsPanel = ({ token }) => {
  const location = useLocation();
  const [selectedVisitId, setSelectedVisitId] = useState(null);
  
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const visitId = params.get('visitId');
    if (visitId) {
      setSelectedVisitId(Number(visitId));
      window.history.replaceState({}, '', '/radiology/reports');
    }
  }, [location.search]);

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [layoutMode, setLayoutMode] = usePersistentState('rad_layout_preference', 'grid');
  const [page, setPage] = useState(1);

  // Filters
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all"); // 'all' | 'today' | 'week' | 'month' | 'custom'
  const [filmTypeFilter, setFilmTypeFilter] = useState("all"); // 'all' | 'large' | 'small' | 'none'
  const [showFilmMenu, setShowFilmMenu] = useState(false);
  const [customRange, setCustomRange] = useState({ start: "", end: "" });

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      let url = "/api/radiology/stats?";

      if (dateFilter === "custom" && customRange.start && customRange.end) {
        url += `startDate=${customRange.start}&endDate=${customRange.end}`;
      } else if (dateFilter !== "all") {
        let start = "";
        const end = getCurrentShiftDate();

        if (dateFilter === "today") {
          start = end;
        } else if (dateFilter === "week") {
          start = formatShiftDate(getShiftWeekStartDate());
        } else if (dateFilter === "month") {
          start = formatShiftDate(getShiftMonthStartDate());
        }
        url += `startDate=${start}&endDate=${end}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setStats(await res.json());
      } else {
        toast.error("فشل تحميل الإحصائيات");
      }
    } catch {
      toast.error(
        <div className="flex items-center gap-2">
          <AlertCircle size={20} />
          <span>فشل تحميل الإحصائيات</span>
        </div>,
        { className: "!bg-red-50 !border-red-200 !text-red-800 !z-[999999]" }
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, dateFilter, customRange]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Real-time synchronization on socket updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handleLiveSync = () => fetchStats(true);
    socket.on('radiology:updated', handleLiveSync);
    socket.on('radiology:completed', handleLiveSync);
    return () => {
      socket.off('radiology:updated', handleLiveSync);
      socket.off('radiology:completed', handleLiveSync);
    };
  }, [fetchStats]);

  // Ensure pagination resets when filters change
  useEffect(() => {
    setPage(1);
  }, [filmTypeFilter, dateFilter, query]);

  const handleResetFilters = () => {
    setDateFilter("all");
    setFilmTypeFilter("all");
    setShowFilmMenu(false);
    setCustomRange({ start: "", end: "" });
    setQuery("");
    setPage(1);
    toast.info("تم إعادة تعيين فلاتر التقارير");
  };

  const handleViewRecord = (group) => {
    if (!group?.visit_id) return toast.error("معرّف الزيارة غير متاح");
    setSelectedVisitId(Number(group.visit_id));
  };

  // Accurately compute stats from loaded tableData (always 100% in sync with report records)
  const computedStats = useMemo(() => {
    if (!stats?.tableData) {
      return {
        totalScans: stats?.summary?.completed_scans || stats?.summary?.total_scans || 0,
        largeFilms: stats?.summary?.large_films || 0,
        smallFilms: stats?.summary?.small_films || 0,
        withoutFilm: stats?.summary?.without_film || 0,
      };
    }
    let totalScans = 0;
    let largeFilms = 0;
    let smallFilms = 0;
    let withoutFilm = 0;

    stats.tableData.forEach((row) => {
      const scans = parseInt(row.scans_in_film || 1, 10);
      totalScans += scans;
      if (row.film_size === "large") {
        largeFilms += 1;
      } else if (row.film_size === "small") {
        smallFilms += 1;
      } else {
        withoutFilm += scans;
      }
    });

    return { totalScans, largeFilms, smallFilms, withoutFilm };
  }, [stats]);

  // 4 Cards Quick Stats (Matching Radiology Dashboard & Lab Reports Layout)
  const statsCards = useMemo(() => [
    { 
      id: 'all',
      label: 'إجمالي الأشعة المنجزة', 
      rawValue: Number(computedStats.totalScans || 0),
      value: (computedStats.totalScans || 0).toLocaleString('en-US'), 
      unit: 'أشعة', 
      sub: 'إجمالي الفحوصات الإشعاعية المنجزة', 
      icon: BarChart3, 
      color: 'text-emerald-600', 
      bg: 'bg-emerald-100', 
      border: 'border-emerald-200' 
    },
    { 
      id: 'large',
      label: 'أفلام كبيرة مستخدمة', 
      rawValue: Number(computedStats.largeFilms || 0),
      value: (computedStats.largeFilms || 0).toLocaleString('en-US'), 
      unit: 'فيلم', 
      sub: 'مقاس كبير للأفلام المطبوعة', 
      icon: Film, 
      color: 'text-indigo-600', 
      bg: 'bg-indigo-100', 
      border: 'border-indigo-200' 
    },
    { 
      id: 'small',
      label: 'أفلام صغيرة مستخدمة', 
      rawValue: Number(computedStats.smallFilms || 0),
      value: (computedStats.smallFilms || 0).toLocaleString('en-US'), 
      unit: 'فيلم', 
      sub: 'مقاس صغير للأفلام المطبوعة', 
      icon: Film, 
      color: 'text-sky-600', 
      bg: 'bg-sky-100', 
      border: 'border-sky-200' 
    },
    { 
      id: 'none',
      label: 'بدون فيلم (رقمي)', 
      rawValue: Number(computedStats.withoutFilm || 0),
      value: (computedStats.withoutFilm || 0).toLocaleString('en-US'), 
      unit: 'فحص', 
      sub: 'أرشفة رقمية عبر النظام', 
      icon: ImageIcon, 
      color: 'text-violet-600', 
      bg: 'bg-violet-100', 
      border: 'border-violet-200' 
    },
  ].filter(s => loading || s.rawValue > 0), [computedStats, loading]);

  const statsGridColsClass =
    statsCards.length === 1
      ? 'grid-cols-1 sm:max-w-[340px]'
      : statsCards.length === 2
      ? 'grid-cols-1 sm:grid-cols-2 sm:max-w-[694px]'
      : statsCards.length === 3
      ? 'grid-cols-1 sm:grid-cols-3'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

  // Group and Filter Data
  const groupedData = useMemo(() => {
    if (!stats?.tableData) return [];
    
    // Phase 1: Deep Filter (Pre-Grouping) by Film Type
    let sourceData = stats.tableData;
    if (filmTypeFilter !== "all") {
      sourceData = sourceData.filter(row => {
        if (filmTypeFilter === "large") return row.film_size === "large";
        if (filmTypeFilter === "small") return row.film_size === "small";
        if (filmTypeFilter === "none") return !row.film_size || row.film_size === "none";
        return true;
      });
    }

    const map = new Map();
    sourceData.forEach((row) => {
      if (!map.has(row.visit_number)) {
        map.set(row.visit_number, {
          visit_id: row.visit_id,
          visit_number: row.visit_number,
          patient_name: row.patient_name,
          date: row.date,
          age: row.patient_age || null,
          gender: row.patient_gender || null,
          is_surgery: Boolean(row.is_surgery),
          total_scans: 0,
          large_films: 0,
          small_films: 0,
          without_films: 0,
          details: [],
        });
      }
      const group = map.get(row.visit_number);
      if (row.is_surgery) {
        group.is_surgery = true;
      }
      const scansCount = parseInt(row.scans_in_film || 1, 10);
      group.total_scans += scansCount;

      if (row.film_size === "large") group.large_films += 1;
      else if (row.film_size === "small") group.small_films += 1;
      else group.without_films += scansCount;

      if (new Date(row.date) > new Date(group.date)) {
        group.date = row.date;
      }
      group.details.push(row);
    });

    let filteredGroups = Array.from(map.values());

    // Phase 2: Search Query Filtering (by patient name, visit number, or scan name)
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      filteredGroups = filteredGroups.filter(g => {
        const nameMatch = (g.patient_name || '').toLowerCase().includes(q);
        const visitMatch = String(g.visit_number || g.visit_id || '').toLowerCase().includes(q);
        const scanMatch = g.details.some(d => (d.scan_names || '').toLowerCase().includes(q));
        return nameMatch || visitMatch || scanMatch;
      });
    }

    return filteredGroups.sort(
      (a, b) => new Date(b.date) - new Date(a.date),
    );
  }, [stats?.tableData, filmTypeFilter, query]);

  const totalPages = Math.ceil(groupedData.length / PAGE_SIZE) || 1;
  const paginatedData = useMemo(() => {
    return groupedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [groupedData, page]);

  return (
    <div className="space-y-6 w-full p-6" dir="rtl">
      {/* ── 1. Page Header Banner (Matching Radiology Dashboard & Lab Style) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 flex-shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-600 to-blue-800 text-white flex items-center justify-center shadow-md shadow-sky-500/20">
            <Radiation size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800">تقارير الأداء والإحصائيات التحليلية</h1>
            <p className="text-sm font-bold text-gray-500 mt-0.5">
              تتبع استهلاك أفلام التصوير الطبي وعدد الأشعة المنجزة وتحليل مؤشرات الأداء
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. Quick Stats Grid (Directly below the banner, matching Dashboard layout) ── */}
      {statsCards.length > 0 && (
        <div className={`grid ${statsGridColsClass} gap-3.5 w-full flex-shrink-0`}>
          {statsCards.map((s, i) => {
            const isSelected = filmTypeFilter === s.id;
            return (
              <div
                key={s.id || i}
                onClick={() => {
                  setFilmTypeFilter(s.id);
                  setPage(1);
                }}
                className={`p-4 rounded-2xl border bg-white shadow-2xs hover:shadow-xs transition-all duration-200 relative overflow-hidden flex flex-col justify-between isolate group cursor-pointer ${
                  isSelected
                    ? 'ring-2 ring-sky-500 border-sky-400 shadow-sky-500/10'
                    : `${s.border} hover:border-slate-300`
                }`}
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
                  {s.breakdown ? (
                    <div className="flex items-center gap-1 mt-1 text-[10px] font-bold text-gray-500 flex-wrap justify-end" dir="rtl">
                      <span className="text-indigo-600 font-black">{s.breakdown.large} كبيرة</span>
                      <span className="text-gray-300">•</span>
                      <span className="text-sky-600 font-black">{s.breakdown.small} صغيرة</span>
                      <span className="text-gray-300">•</span>
                      <span className="text-violet-600 font-black">{s.breakdown.noPrint} رقمي</span>
                    </div>
                  ) : s.sub ? (
                    <p className="text-[10px] text-gray-400 font-semibold mt-1 truncate text-right" title={s.sub} dir="rtl">
                      {s.sub}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 3. Advanced Filter Toolbar (Film Type Filter as Dropdown Menu beside Time Filter) ── */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4 flex-shrink-0">
        <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4">
          {/* Search Bar (Right in RTL) */}
          <div className="relative w-full xl:w-96">
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
              <Search size={16} strokeWidth={2.2} />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="بحث باسم المريض، رقم الزيارة، أو نوع الفحص..."
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

          {/* Temporal Filter Tabs + Film Type Dropdown + View Switcher (Left in RTL) */}
          <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto justify-between xl:justify-end">
            {/* Time Filter Tabs */}
            <div className="flex gap-1 bg-gray-100/90 p-1.5 rounded-2xl text-xs font-bold text-gray-500 overflow-x-auto">
              {[
                { id: 'all', label: 'الكل' },
                { id: 'today', label: 'اليوم' },
                { id: 'week', label: 'هذا الأسبوع' },
                { id: 'month', label: 'هذا الشهر' },
                { id: 'custom', label: 'تاريخ مخصص' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { setDateFilter(f.id); setPage(1); }}
                  className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-bold cursor-pointer ${
                    dateFilter === f.id
                      ? 'bg-white text-sky-800 shadow-xs'
                      : 'hover:bg-white/40 text-gray-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Film Type Dropdown Menu (Beside Time Filter) */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowFilmMenu(!showFilmMenu)}
                className={`h-10 px-3.5 rounded-2xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                  filmTypeFilter !== 'all'
                    ? 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
                    : 'bg-white text-slate-600 border-slate-200/90 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <Film size={14} className={filmTypeFilter !== 'all' ? 'text-sky-600' : 'text-slate-400'} />
                <span>
                  {filmTypeFilter === 'all'
                    ? 'نوع الفيلم'
                    : filmTypeFilter === 'large'
                    ? 'فيلم كبير'
                    : filmTypeFilter === 'small'
                    ? 'فيلم صغير'
                    : 'بدون فيلم (رقمي)'}
                </span>
                <ChevronDown
                  size={14}
                  className={`text-slate-400 transition-transform duration-200 ${showFilmMenu ? 'rotate-180' : ''}`}
                />
              </button>

              {showFilmMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowFilmMenu(false)} />
                  <div className="absolute top-full left-0 mt-1.5 w-48 bg-white border border-slate-100 shadow-xl rounded-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 p-1.5 space-y-1">
                    {[
                      { id: 'all', label: 'جميع الأنواع', icon: Film },
                      { id: 'large', label: 'فيلم كبير', icon: Film },
                      { id: 'small', label: 'فيلم صغير', icon: Film },
                      { id: 'none', label: 'بدون فيلم (رقمي)', icon: ImageIcon },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          setFilmTypeFilter(f.id);
                          setShowFilmMenu(false);
                          setPage(1);
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between cursor-pointer ${
                          filmTypeFilter === f.id
                            ? 'bg-sky-50 text-sky-700 font-black'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <f.icon size={13} className={filmTypeFilter === f.id ? 'text-sky-600' : 'text-slate-400'} />
                          <span>{f.label}</span>
                        </div>
                        {filmTypeFilter === f.id && (
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-600" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* View Switcher */}
            <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shrink-0">
              <button
                type="button"
                onClick={() => setLayoutMode('grid')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  layoutMode === 'grid' ? 'bg-white text-sky-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
                title="عرض كشبكة"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('list')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  layoutMode === 'list' ? 'bg-white text-sky-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'
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
          <div className="p-4 bg-sky-50/40 rounded-2xl border border-sky-100/80 flex flex-wrap gap-4 items-center animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-sky-800">من تاريخ:</span>
              <input
                type="date"
                value={customRange.start}
                onChange={(e) => { setCustomRange(prev => ({ ...prev, start: e.target.value })); setPage(1); }}
                className="px-3 py-1.5 bg-white border border-sky-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-sky-500 cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-sky-800">إلى تاريخ:</span>
              <input
                type="date"
                value={customRange.end}
                onChange={(e) => { setCustomRange(prev => ({ ...prev, end: e.target.value })); setPage(1); }}
                className="px-3 py-1.5 bg-white border border-sky-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-sky-500 cursor-pointer"
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

        {/* Counter inside filter card */}
        <div className="flex justify-between items-center pt-3 border-t border-gray-100/80 text-xs font-semibold text-slate-500">
          <span>
            تم العثور على <span className="text-sky-700 font-black">{groupedData.length}</span> من السجلات
          </span>
          {(dateFilter !== 'all' || filmTypeFilter !== 'all' || query.trim()) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-[11px] font-bold text-sky-600 hover:text-sky-700 hover:underline cursor-pointer flex items-center gap-1"
            >
              <X size={12} />
              <span>إعادة تعيين كافة الفلاتر</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 4. Main Content: Grid / List Render ── */}
      {loading && !stats ? (
        <div className="flex justify-center items-center p-16 bg-white rounded-3xl border border-gray-100 shadow-sm">
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : groupedData.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-300">
            {query ? <Search size={32} strokeWidth={1.5} /> : <Film size={32} strokeWidth={1.5} />}
          </div>
          <h3 className="text-base font-black text-gray-700">
            {query ? `لا توجد نتائج مطابقة للبحث "${query}"` : 'لا توجد سجلات استهلاك لأفلام الأشعة في هذه الفترة'}
          </h3>
          <p className="text-gray-400 text-xs mt-1.5 font-semibold">
            {query ? 'تأكد من كتابة اسم المريض أو رقم الزيارة أو اسم الفحص بشكل صحيح.' : 'يمكنك تجربة تغيير الفلتر الزمني أو نوع الفيلم لعرض المزيد من السجلات.'}
          </p>
          {(query || dateFilter !== 'all' || filmTypeFilter !== 'all') && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-3 text-xs font-bold text-sky-600 hover:text-sky-700 bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-100 transition-colors cursor-pointer"
            >
              إعادة تعيين الفلاتر
            </button>
          )}
        </div>
      ) : layoutMode === 'grid' ? (
        /* ── Grid Mode (Matching Laboratory & Dashboard Cards) ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {paginatedData.map((group, idx) => {
            const cardIndex = (page - 1) * PAGE_SIZE + idx + 1;

            return (
              <div
                key={group.visit_number}
                onClick={() => handleViewRecord(group)}
                className="bg-white rounded-3xl border border-slate-100/90 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-sky-300 flex flex-col justify-between p-5 select-none shadow-[0_4px_20px_rgb(0,0,0,0.03)] group"
                dir="rtl"
              >
                {/* Top: Avatar + Name + Surgery Badge + Visit Number + Index Counter */}
                <div>
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center font-black text-base transition-transform group-hover:scale-105 shadow-xs bg-gradient-to-br from-sky-50 to-sky-100/80 text-sky-700 border border-sky-200/50">
                        {group.patient_name?.charAt(0) ?? '؟'}
                      </div>
                      <div className="min-w-0 flex-1 text-right" dir="rtl">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-black text-slate-800 text-sm leading-tight group-hover:text-sky-700 transition-colors truncate">
                            {group.patient_name || 'مريض غير معروف'}
                          </h3>
                          {Boolean(group.is_surgery) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                              <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                              <span>عمليات</span>
                            </span>
                          )}
                          {(Boolean(group.is_external) || group.visit_number?.startsWith('EXT-')) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-teal-100/80 text-teal-800 border border-teal-200/80 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                              <Sparkles size={11} className="text-teal-600 shrink-0" strokeWidth={2.2} />
                              <span>مريض خارجي</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-bold text-slate-400 text-right mt-1 w-full" dir="rtl">
                          <span dir="ltr">{group.visit_number}</span>
                        </p>
                      </div>
                    </div>

                    {/* Index Counter Badge */}
                    <span className="text-xs font-black text-slate-400 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100 flex-shrink-0">
                      {cardIndex}
                    </span>
                  </div>

                  {/* Middle Details: Total Scans Field (Clean, No border, No icon) */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100/80">
                    <span className="text-xs font-bold text-slate-500">الفحوصات:</span>
                    <span className="text-xs font-black text-sky-700 bg-sky-50 px-2.5 py-1 rounded-lg">
                      {formatArabicScansCount(group.total_scans)}
                    </span>
                  </div>

                  {/* Consumed Films Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                    {group.large_films > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700">
                        <Film size={11} className="text-indigo-500 shrink-0" />
                        <span>{group.large_films} كبير</span>
                      </span>
                    )}
                    {group.small_films > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-sky-50 text-sky-700">
                        <Film size={11} className="text-sky-500 shrink-0" />
                        <span>{group.small_films} صغير</span>
                      </span>
                    )}
                    {group.without_films > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700">
                        <ImageIcon size={11} className="text-slate-500 shrink-0" />
                        <span>{group.without_films} رقمي</span>
                      </span>
                    )}
                    {group.large_films === 0 && group.small_films === 0 && group.without_films === 0 && (
                      <span className="text-xs font-bold text-slate-400">—</span>
                    )}
                  </div>
                </div>

                {/* Bottom Metadata: Date/Time (Two rows) + Action Button */}
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100/80 gap-2">
                  <div className="space-y-0.5 text-right">
                    <div>
                      <span dir="ltr" className="text-xs font-bold text-slate-700 whitespace-nowrap inline-block">
                        {formatDateEn(group.date)}
                      </span>
                    </div>
                    <div>
                      <span dir="ltr" className="text-[11px] font-semibold text-slate-400 whitespace-nowrap inline-block">
                        {formatTimeEn(group.date)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewRecord(group);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-black text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer"
                    title="تقرير الأشعة"
                  >
                    <Eye size={13} strokeWidth={2.2} />
                    <span>التقرير</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── List Mode (Smart Proportional Layout - 100% Exact Distribution) ── */
        <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap table-fixed">
              <thead className="bg-gradient-to-r from-slate-50/90 via-sky-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                <tr>
                  <th className="w-[5%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                  <th className="w-[34%] px-4 py-4 text-right font-black text-xs text-slate-600">المريض</th>
                  <th className="w-[13%] px-4 py-4 text-right font-black text-xs text-slate-600">الأشعة</th>
                  <th className="w-[24%] px-4 py-4 text-right font-black text-xs text-slate-600">الأفلام المستهلكة</th>
                  <th className="w-[14%] px-4 py-4 text-right font-black text-xs text-slate-600">وقت وتاريخ الإنجاز</th>
                  <th className="w-[10%] px-4 py-4 text-center font-black text-xs text-slate-600">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/70">
                {paginatedData.map((group, idx) => {
                  const cardIndex = (page - 1) * PAGE_SIZE + idx + 1;

                  return (
                    <tr
                      key={group.visit_number}
                      onClick={() => handleViewRecord(group)}
                      className="hover:bg-sky-50/30 cursor-pointer transition-colors border-b border-slate-100/70 last:border-0 group"
                    >
                      {/* # Number - 5% */}
                      <td className="w-[5%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                        {cardIndex}
                      </td>

                      {/* Patient Details - 34% */}
                      <td className="w-[34%] px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 group-hover:scale-105 transition-transform bg-gradient-to-br from-sky-50 to-sky-100/80 text-sky-700 border border-sky-200/50">
                            {group.patient_name?.charAt(0) ?? '؟'}
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0 text-right" dir="rtl">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-black text-slate-800 text-sm group-hover:text-sky-700 transition-colors truncate">
                                {group.patient_name}
                              </span>
                              {Boolean(group.is_surgery) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                  <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                                  <span>عمليات</span>
                                </span>
                              )}
                              {(Boolean(group.is_external) || group.visit_number?.startsWith('EXT-')) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-teal-100/80 text-teal-800 border border-teal-200/80 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                  <Sparkles size={11} className="text-teal-600 shrink-0" strokeWidth={2.2} />
                                  <span>مريض خارجي</span>
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-bold text-slate-400 text-right mt-0.5 w-full" dir="rtl">
                              <span dir="ltr">{group.visit_number}</span>
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Total Scans (الفحوصات) - 13% (Clean, No border, No icon) */}
                      <td className="w-[13%] px-4 py-4 text-right">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 text-xs font-black">
                          {formatArabicScansCount(group.total_scans)}
                        </span>
                      </td>

                      {/* Consumed Films Badges - 24% */}
                      <td className="w-[24%] px-4 py-4 text-right">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {group.large_films > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700">
                              <Film size={11} className="text-indigo-500 shrink-0" />
                              <span>{group.large_films} كبير</span>
                            </span>
                          )}
                          {group.small_films > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-sky-50 text-sky-700">
                              <Film size={11} className="text-sky-500 shrink-0" />
                              <span>{group.small_films} صغير</span>
                            </span>
                          )}
                          {group.without_films > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700">
                              <ImageIcon size={11} className="text-slate-500 shrink-0" />
                              <span>{group.without_films} رقمي</span>
                            </span>
                          )}
                          {group.large_films === 0 && group.small_films === 0 && group.without_films === 0 && (
                            <span className="text-xs font-bold text-slate-400">—</span>
                          )}
                        </div>
                      </td>

                      {/* Date & Time - 14% (Two rows: Time directly under Date, aligned directly under the column header) */}
                      <td className="w-[14%] px-4 py-4 text-right">
                        <div className="space-y-0.5 text-right">
                          <div>
                            <span dir="ltr" className="text-xs font-bold text-slate-700 whitespace-nowrap inline-block">
                              {formatDateEn(group.date)}
                            </span>
                          </div>
                          <div>
                            <span dir="ltr" className="text-[11px] font-semibold text-slate-400 whitespace-nowrap inline-block">
                              {formatTimeEn(group.date)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Action Button - 10% */}
                      <td className="w-[10%] px-4 py-4 text-center">
                        <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => handleViewRecord(group)}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-black text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer"
                            title="تقرير الأشعة"
                          >
                            <Eye size={13} strokeWidth={2.2} />
                            <span>التقرير</span>
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

      {/* ── 5. Pagination (Matching Secretary & Lab Reports Style) ── */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center text-xs font-bold text-slate-500 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex-shrink-0 mt-2">
          <span>
            صفحة <span className="text-sky-700 font-black">{page}</span> من <span className="font-black">{totalPages}</span>
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

      {/* ── 6. Modals Integration (Patient Radiology Window) ── */}
      {selectedVisitId && (
        <PatientDetailPanel
          visitId={selectedVisitId}
          token={token}
          onClose={() => setSelectedVisitId(null)}
          onCompleted={() => fetchStats(true)}
          activeTab="completed"
          readOnly={true}
        />
      )}
    </div>
  );
};

// ── Main Radiology Dashboard (Used exclusively for Reports tab) ─────────────
const RadiologyRequests = () => {
  const { token } = useAuthStore();

  return <ReportsPanel token={token} />;
};

export default RadiologyRequests;
