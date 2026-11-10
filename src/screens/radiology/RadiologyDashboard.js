import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  Radiation,
  Search,
  CheckCircle,
  CheckCircle2,
  Film,
  Image as ImageIcon,
  Clock,
  CheckSquare,
  LayoutGrid,
  List,
  Scissors,
  X,
  FileText,
  Sparkles
} from "lucide-react";
import { toast } from "react-toastify";
import useAuthStore from "../../store/useAuthStore";
import useSocketStore from "../../store/useSocketStore";
import { usePersistentState } from "../../hooks/usePersistentState";
import { PatientDetailPanel } from "../../components/radiology/RadiologyModals";
import { getSocket } from "../../utils/socket";
import { getCurrentShiftDate } from "../../utils/shiftHelpers";
import { formatArabicScansStatus } from "../../utils/arabicFormatters";

// ── Format Date/Time Helper in English (Matching Laboratory Dashboard) ─────
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
  const time = `${pad(hours)}:${minutes} ${ampm}`;

  return `${date} - ${time}`;
};

// ── Tabs Configuration ───────────────────────────────────────────────────────
const TABS = [
  {
    id: 'pending',
    label: 'الطلبات الواردة',
    title: 'طلبات الأشعة الواردة',
    subtitle: 'بانتظار التحويل لغرفة التصوير',
    icon: Clock,
    color: 'text-sky-600',
    bg: 'bg-sky-100',
    border: 'border-sky-200',
    activeTextColor: 'text-sky-700',
    activeBorder: 'border-b-sky-600',
    badgeClass: 'bg-sky-100 text-sky-700',
    indicatorColor: 'bg-sky-500',
    avatarTheme: 'bg-gradient-to-br from-sky-50 to-sky-100/80 text-sky-700 border border-sky-200/50',
    hoverBorder: 'hover:border-sky-300 hover:shadow-sky-500/10',
  },
  {
    id: 'in_progress',
    label: 'قيد الإجراء',
    title: 'الفحوصات الإشعاعية قيد الإجراء',
    subtitle: 'في غرفة التصوير وجاري التقاط وتجهيز الصور',
    icon: Radiation,
    color: 'text-violet-600',
    bg: 'bg-violet-100',
    border: 'border-violet-200',
    activeTextColor: 'text-violet-700',
    activeBorder: 'border-b-violet-600',
    badgeClass: 'bg-violet-100 text-violet-700',
    indicatorColor: 'bg-violet-500',
    avatarTheme: 'bg-gradient-to-br from-violet-50 to-violet-100/80 text-violet-700 border border-violet-200/50',
    hoverBorder: 'hover:border-violet-300 hover:shadow-violet-500/10',
  },
  {
    id: 'completed',
    label: 'فحوصات مكتملة',
    title: 'سجل الفحوصات الإشعاعية المنجزة اليوم',
    subtitle: 'تم توثيق النتائج وطباعة أو حفظ الأشعة',
    icon: CheckSquare,
    color: 'text-emerald-600',
    bg: 'bg-emerald-100',
    border: 'border-emerald-200',
    activeTextColor: 'text-emerald-700',
    activeBorder: 'border-b-emerald-600',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    indicatorColor: 'bg-emerald-500',
    avatarTheme: 'bg-gradient-to-br from-emerald-50 to-emerald-100/80 text-emerald-700 border border-emerald-200/50',
    hoverBorder: 'hover:border-emerald-300 hover:shadow-emerald-500/10',
  },
];

// ── Main Radiology Dashboard Component ───────────────────────────────────────
const RadiologyDashboard = () => {
  const { token } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "pending";
  const [tabRequests, setTabRequests] = useState({
    pending: [],
    in_progress: [],
    completed: []
  });
  const [initialLoading, setInitialLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [layoutMode, setLayoutMode] = usePersistentState('rad_layout_preference', 'grid');
  const [dailyStats, setDailyStats] = useState({
    largeFilms: 0,
    smallFilms: 0,
    digitalSaves: 0,
    totalCompleted: 0,
    totalToday: 0,
    completedScans: 0
  });
  const [tabCounters, setTabCounters] = useState({ pending: 0, in_progress: 0, completed: 0 });

  const latestSilentUpdate = useSocketStore(state => state.latestSilentUpdate);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const fetchAllData = useCallback(async (signal, isInitial = false) => {
    if (isInitial) setInitialLoading(true);
    try {
      const today = getCurrentShiftDate();
      const [pendingRes, inProgRes, compRes, statsRes] = await Promise.all([
        fetch('/api/radiology/requests?tab=pending', { headers, signal }),
        fetch('/api/radiology/requests?tab=in_progress', { headers, signal }),
        fetch(`/api/radiology/requests?tab=completed&startDate=${today}&endDate=${today}`, { headers, signal }),
        fetch(`/api/radiology/stats?startDate=${today}&endDate=${today}&quickStats=1`, { headers, signal }),
      ]);

      const [pArr, ipArr, cArr, statsData] = await Promise.all([
        pendingRes.ok ? pendingRes.json() : [],
        inProgRes.ok ? inProgRes.json() : [],
        compRes.ok ? compRes.json() : [],
        statsRes.ok ? statsRes.json() : null,
      ]);

      setTabRequests({
        pending: pArr,
        in_progress: ipArr,
        completed: cArr
      });

      if (statsData) {
        setDailyStats({
          largeFilms: statsData.summary?.large_films || 0,
          smallFilms: statsData.summary?.small_films || 0,
          digitalSaves: statsData.summary?.without_film || 0,
          totalCompleted: statsData.summary?.total_operations || 0,
          totalToday: statsData.summary?.total_scans || (pArr.length + ipArr.length + cArr.length),
          completedScans: statsData.summary?.completed_scans || statsData.summary?.total_operations || cArr.length || 0
        });
        if (statsData.tabCounters) {
          setTabCounters(statsData.tabCounters);
        } else {
          setTabCounters({
            pending: pArr.length,
            in_progress: ipArr.length,
            completed: cArr.length
          });
        }
      } else {
        setTabCounters({
          pending: pArr.length,
          in_progress: ipArr.length,
          completed: cArr.length
        });
      }
    } catch (err) {
      if (err.name !== 'AbortError' && isInitial) {
        toast.error("فشل تحميل بيانات الأشعة");
      }
    } finally {
      if (isInitial) setInitialLoading(false);
    }
  }, [headers]);

  // Initial load
  useEffect(() => {
    const controller = new AbortController();
    fetchAllData(controller.signal, true);
    return () => controller.abort();
  }, [fetchAllData]);

  // Silent update trigger from socket store
  useEffect(() => {
    if (latestSilentUpdate?.timestamp) {
      fetchAllData(undefined, false);
    }
  }, [latestSilentUpdate?.timestamp, fetchAllData]);

  // Direct socket listeners for instant, lightning-fast reactivity
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleLiveSync = () => {
      fetchAllData(undefined, false);
    };

    socket.on('radiology:updated', handleLiveSync);
    socket.on('request:new', handleLiveSync);
    socket.on('request:update', handleLiveSync);
    socket.on('radiology:completed', handleLiveSync);
    socket.on('cashier:update', handleLiveSync);
    socket.on('patient:waiting', handleLiveSync);
    socket.on('patient:updated', handleLiveSync);

    return () => {
      socket.off('radiology:updated', handleLiveSync);
      socket.off('request:new', handleLiveSync);
      socket.off('request:update', handleLiveSync);
      socket.off('radiology:completed', handleLiveSync);
      socket.off('cashier:update', handleLiveSync);
      socket.off('patient:waiting', handleLiveSync);
      socket.off('patient:updated', handleLiveSync);
    };
  }, [fetchAllData]);

  const handleStartAll = useCallback(async (visitId) => {
    // Optimistic Update: instantly move from pending to in_progress
    setTabRequests(prev => {
      const movingItem = prev.pending.find(r => r.visit_id === visitId);
      return {
        ...prev,
        pending: prev.pending.filter(r => r.visit_id !== visitId),
        in_progress: movingItem ? [movingItem, ...prev.in_progress] : prev.in_progress
      };
    });
    try {
      const res = await fetch(`/api/radiology/visit/${visitId}/start-all`, {
        method: "PUT",
        headers,
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(d.message || "تم تحويل المريض لغرفة التصوير وبدء الفحص");
        fetchAllData(undefined, false);
      } else {
        toast.error(d.message);
        fetchAllData(undefined, false);
      }
    } catch {
      toast.error("فشل التنفيذ");
      fetchAllData(undefined, false);
    }
  }, [headers, fetchAllData]);

  const currentRequests = useMemo(() => {
    return tabRequests[activeTab] || [];
  }, [tabRequests, activeTab]);

  const currentTabConfig = useMemo(() => {
    return TABS.find(t => t.id === activeTab) || TABS[0];
  }, [activeTab]);

  const filtered = useMemo(() => {
    if (!query.trim()) return currentRequests;
    const q = query.trim().toLowerCase();
    return currentRequests.filter(
      (r) =>
        (r.full_name || '').toLowerCase().includes(q) ||
        String(r.visit_number || r.visit_id || '').toLowerCase().includes(q)
    );
  }, [currentRequests, query]);

  const emptyState = useMemo(() => {
    if (query) return { icon: Radiation, title: 'لا توجد سجلات مطابقة', desc: 'لم يتم العثور على مرضى بهذا الاسم أو الرقم المرجعي للزيارة.' };
    switch (activeTab) {
      case 'pending': return { icon: Clock, title: 'لا توجد طلبات واردة', desc: 'جميع طلبات الأشعة تم تحويلها ولا يوجد مرضى بانتظار التصوير.' };
      case 'in_progress': return { icon: Radiation, title: 'لا توجد فحوصات قيد الإجراء', desc: 'لا توجد فحوصات إشعاعية جارية حالياً في غرفة التصوير.' };
      case 'completed': return { icon: CheckSquare, title: 'لا توجد فحوصات منجزة اليوم', desc: 'لم يتم توثيق واعتماد أي نتائج إشعاعية لهذا اليوم بعد.' };
      default: return { icon: Radiation, title: 'لا توجد سجلات', desc: 'القائمة فارغة حالياً.' };
    }
  }, [activeTab, query]);

  // 4 Cards Quick Stats (Matching Laboratory Dashboard Layout)
  const statsCards = useMemo(() => [
    { 
      label: 'إجمالي الأشعة اليوم', 
      value: dailyStats.totalToday, 
      unit: 'أشعة', 
      breakdown: {
        large: dailyStats.largeFilms,
        small: dailyStats.smallFilms,
        noPrint: dailyStats.digitalSaves,
      },
      sub: `${dailyStats.largeFilms} كبيرة • ${dailyStats.smallFilms} صغيرة • ${dailyStats.digitalSaves} بدون طباعة`, 
      icon: Radiation, 
      color: 'text-sky-600', 
      bg: 'bg-sky-100', 
      border: 'border-sky-200' 
    },
    { 
      label: 'الطلبات الواردة', 
      value: tabCounters.pending || tabRequests.pending?.length || 0, 
      unit: 'طلب', 
      sub: 'بانتظار التحويل لغرفة التصوير', 
      icon: Clock, 
      color: 'text-indigo-600', 
      bg: 'bg-indigo-100', 
      border: 'border-indigo-200' 
    },
    { 
      label: 'قيد الإجراء', 
      value: tabCounters.in_progress || tabRequests.in_progress?.length || 0, 
      unit: 'طلب', 
      sub: 'في غرفة التصوير وجاري تجهيزها', 
      icon: Radiation, 
      color: 'text-violet-600', 
      bg: 'bg-violet-100', 
      border: 'border-violet-200' 
    },
    { 
      label: 'أشعة مكتملة', 
      value: dailyStats.completedScans || dailyStats.totalCompleted || tabCounters.completed || 0, 
      unit: 'أشعة', 
      sub: 'تم توثيق واعتماد نتائجها اليوم', 
      icon: CheckCircle2, 
      color: 'text-emerald-600', 
      bg: 'bg-emerald-100', 
      border: 'border-emerald-200' 
    },
  ], [dailyStats, tabCounters, tabRequests]);

  return (
    <div className="space-y-6 w-full p-6" dir="rtl">
      {/* ── 1. Page Header Banner (Matching LaboratoryDashboard Style) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 flex-shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-600 to-blue-800 text-white flex items-center justify-center shadow-md shadow-sky-500/20">
            <Radiation size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800">قسم الأشعة والتصوير الطبي</h1>
            <p className="text-sm font-bold text-gray-500 mt-0.5">
              إدارة ومتابعة الفحوصات الإشعاعية، تجهيز وطباعة الأفلام، وتوثيق التقارير الطبية لحظياً
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white px-4 py-2.5 rounded-2xl border border-gray-100 shadow-sm text-sm font-bold text-gray-600">
            إجمالي الأشعة اليوم: <span className="text-sky-700 font-black text-lg">{dailyStats.totalToday}</span>
          </div>
        </div>
      </div>

      {/* ── 2. Quick Stats Grid (4 Cards like Laboratory & Secretary Dashboard) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full flex-shrink-0">
        {statsCards.map((s, i) => (
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
              {initialLoading ? (
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
              {s.breakdown ? (
                <div className="flex items-center gap-1 mt-1 text-[10px] font-bold text-gray-500 flex-wrap justify-end" dir="rtl">
                  <span className="text-indigo-600 font-black">{s.breakdown.large} كبيرة</span>
                  <span className="text-gray-300">•</span>
                  <span className="text-cyan-600 font-black">{s.breakdown.small} صغيرة</span>
                  <span className="text-gray-300">•</span>
                  <span className="text-violet-600 font-black">{s.breakdown.noPrint} بدون طباعة</span>
                </div>
              ) : s.sub ? (
                <p className="text-[10px] text-gray-400 font-semibold mt-1 truncate" title={s.sub}>
                  {s.sub}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* ── 3. Centered Workspace Tab Selector (Doctor Queue, Secretary & Lab Style) ── */}
      <div className="flex justify-center w-full">
        <div className="flex p-1.5 gap-2 bg-gray-100/90 backdrop-blur-md rounded-2xl border border-gray-200/80 max-w-3xl w-full shadow-xs overflow-x-auto no-scrollbar">
          {TABS.map(tab => {
            const badgeCount = (tabCounters && typeof tabCounters[tab.id] === 'number')
              ? tabCounters[tab.id]
              : (tabRequests[tab.id]?.length || 0);

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSearchParams({ tab: tab.id })}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs md:text-sm font-black transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? `bg-white ${tab.activeTextColor} shadow-sm border border-gray-100 ${tab.activeBorder}`
                    : "text-gray-500 hover:bg-white/50 hover:text-gray-700 border-transparent"
                }`}
              >
                <tab.icon size={15} />
                <span>{tab.label}</span>
                {badgeCount > 0 && (
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${tab.badgeClass}`}>
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 4. Sub-header: Tab Title, Info & Search Bar, Layout Switcher ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2 flex-shrink-0">
        <div>
          <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
            <span className={`w-1.5 h-6 rounded-full ${currentTabConfig.indicatorColor}`} />
            {currentTabConfig.title}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5 font-semibold">
            {query
              ? `${filtered.length} من أصل ${currentRequests.length} طلب`
              : `${currentRequests.length} مريض ${currentTabConfig.subtitle}`}
          </p>
        </div>

        {/* Search Input & Layout Switcher */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-80 md:w-96">
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
              <Search size={16} strokeWidth={2.2} />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث بالاسم أو الرقم المرجعي للزيارة..."
              className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-sky-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200/60 shadow-xs transition-all"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                title="مسح البحث"
              >
                <div className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                  <X size={12} strokeWidth={2.5} />
                </div>
              </button>
            )}
          </div>

          {/* Layout Switcher */}
          <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shrink-0">
            <button
              type="button"
              onClick={() => setLayoutMode("grid")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                layoutMode === "grid" ? "bg-white text-sky-700 shadow-sm" : "text-gray-400 hover:text-gray-600"
              }`}
              title="عرض كشبكة"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode("list")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                layoutMode === "list" ? "bg-white text-sky-700 shadow-sm" : "text-gray-400 hover:text-gray-600"
              }`}
              title="عرض كقائمة"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── 5. Main Content Area (Grid or List Layout) ── */}
      {initialLoading ? (
        /* Loading Skeletons */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 bg-white rounded-3xl border border-slate-100 p-5 shadow-xs animate-pulse flex flex-col justify-between">
              <div className="flex gap-3">
                <div className="w-11 h-11 bg-slate-100 rounded-2xl" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-slate-100 rounded-md w-3/4" />
                  <div className="h-3 bg-slate-100 rounded-md w-1/2" />
                </div>
              </div>
              <div className="h-8 bg-slate-100 rounded-xl" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.03)] p-12 text-center flex flex-col items-center justify-center min-h-[320px]">
          <div className="w-16 h-16 bg-sky-50 text-sky-600 rounded-3xl flex items-center justify-center mb-3.5 shadow-inner">
            <emptyState.icon size={30} strokeWidth={1.8} />
          </div>
          <h3 className="text-lg font-black text-slate-800">{emptyState.title}</h3>
          <p className="text-xs font-semibold text-slate-400 mt-1 max-w-sm">{emptyState.desc}</p>
        </div>
      ) : layoutMode === "grid" ? (
        /* ── Grid Mode ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((v, idx) => {
            const dateFormatted = formatDateTimeEn(v.requested_at);
            const totalTestsCount = v.total_tests || 0;
            const filmsCount = v.tests_with_film || 0;

            return (
              <div
                key={v.visit_id || idx}
                onClick={() => setSelected(v.visit_id)}
                className={`bg-white rounded-3xl border border-slate-100/90 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${currentTabConfig.hoverBorder} flex flex-col justify-between p-5 select-none shadow-[0_4px_20px_rgb(0,0,0,0.03)] group`}
                dir="rtl"
              >
                {/* Top: Avatar + Name + Badges + Visit Number + Index Counter */}
                <div>
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={`w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center font-black text-base transition-transform group-hover:scale-105 shadow-xs ${currentTabConfig.avatarTheme}`}>
                        {v.full_name?.charAt(0) ?? '؟'}
                      </div>
                      <div className="min-w-0 flex-1 text-right" dir="rtl">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-black text-slate-800 text-sm leading-tight group-hover:text-sky-700 transition-colors truncate">
                            {v.full_name || 'مريض غير معروف'}
                          </h3>
                          {Boolean(v.is_surgery) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10.5px] rounded-lg font-black bg-purple-50 text-purple-700 border border-purple-200/80 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                              <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                              <span>عمليات</span>
                            </span>
                          )}
                          {(Boolean(v.is_external) || v.visit_number?.startsWith('EXT-')) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10.5px] rounded-lg font-black bg-teal-50 text-teal-800 border border-teal-200/80 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                              <Sparkles size={11} className="text-teal-600 shrink-0" strokeWidth={2.2} />
                              <span>مريض خارجي</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-bold text-slate-400 text-right mt-1 w-full" dir="rtl">
                          <span dir="ltr">{v.visit_number}</span>
                        </p>
                      </div>
                    </div>

                    {/* Index Counter Badge */}
                    <span className="text-xs font-black text-slate-400 px-2 py-0.5 bg-slate-50/80 rounded-lg border border-slate-100 flex-shrink-0 shadow-2xs">
                      {idx + 1}
                    </span>
                  </div>

                  {/* Middle Details: Tests summary (Matching Lab Status Field Style) */}
                  <div className="flex flex-wrap items-center gap-2 mt-3.5 pt-3 border-t border-slate-100/90">
                    {activeTab === 'pending' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full font-bold bg-sky-50 text-sky-700 border border-sky-200/70 shadow-2xs whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0 animate-pulse" />
                        <span>{formatArabicScansStatus(totalTestsCount, 'pending')}</span>
                      </span>
                    )}

                    {activeTab === 'in_progress' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full font-bold bg-violet-50 text-violet-700 border border-violet-200/70 shadow-2xs whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0 animate-pulse" />
                        <span>{formatArabicScansStatus(totalTestsCount, 'in_progress')}</span>
                      </span>
                    )}

                    {activeTab === 'completed' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70 shadow-2xs whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        <span>{formatArabicScansStatus(totalTestsCount, 'completed')}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Metadata: Date/Time + Action Button */}
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100/80 gap-2">
                  <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                    {dateFormatted}
                  </span>

                  <div className="flex items-center gap-2">
                    {activeTab === "pending" ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartAll(v.visit_id);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-black text-white bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 rounded-xl shadow-xs shadow-sky-500/20 active:scale-95 transition-all cursor-pointer"
                        title="تحويل لغرفة التصوير وبدء الفحص"
                      >
                        <CheckCircle size={13} strokeWidth={2.2} />
                        <span>تحويل للتصوير</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(v.visit_id);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-black text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200/60 rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer"
                        title="فتح الملف وتوثيق النتائج"
                      >
                        <FileText size={13} strokeWidth={2.2} />
                        <span>{activeTab === 'completed' ? 'عرض النتائج' : 'توثيق النتائج'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── List Mode ── */
        <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap table-fixed">
              <thead className="bg-gradient-to-r from-slate-50/90 via-sky-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                <tr>
                  <th className="w-[5%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                  <th className="w-[44%] px-4 py-4 text-right font-black text-xs text-slate-600">المريض</th>
                  <th className="w-[16%] px-3 py-4 text-center font-black text-xs text-slate-600">الأشعة</th>
                  <th className="w-[20%] px-3 py-4 text-center font-black text-xs text-slate-600">
                    {activeTab === 'completed' ? 'وقت وتاريخ الإنجاز' : 'وقت وتاريخ الطلب'}
                  </th>
                  <th className="w-[15%] px-3 py-4 text-center font-black text-xs text-slate-600">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/70">
                {filtered.map((v, idx) => {
                  const dateFormatted = formatDateTimeEn(v.requested_at);
                  const totalTestsCount = v.total_tests || 0;

                  return (
                    <tr
                      key={v.visit_id || idx}
                      onClick={() => setSelected(v.visit_id)}
                      className="hover:bg-sky-50/30 cursor-pointer transition-colors border-b border-slate-100/70 last:border-0 group"
                    >
                      {/* # Number */}
                      <td className="w-[5%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                        {idx + 1}
                      </td>

                      {/* Patient Details */}
                      <td className="w-[44%] px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 group-hover:scale-105 transition-transform ${currentTabConfig.avatarTheme}`}>
                            {v.full_name?.charAt(0) ?? '؟'}
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0 text-right" dir="rtl">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-black text-slate-800 text-sm group-hover:text-sky-700 transition-colors truncate">
                                {v.full_name}
                              </span>
                              {Boolean(v.is_surgery) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10.5px] rounded-lg font-black bg-purple-50 text-purple-700 border border-purple-200/80 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                  <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                                  <span>عمليات</span>
                                </span>
                              )}
                              {(Boolean(v.is_external) || v.visit_number?.startsWith('EXT-')) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10.5px] rounded-lg font-black bg-teal-50 text-teal-800 border border-teal-200/80 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                  <Sparkles size={11} className="text-teal-600 shrink-0" strokeWidth={2.2} />
                                  <span>مريض خارجي</span>
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-bold text-slate-400 text-right mt-0.5 w-full" dir="rtl">
                              <span dir="ltr">{v.visit_number}</span>
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Total Tests by Tab (حقل الفحوصات - Matching Lab Status Field Style) */}
                      <td className="w-[16%] px-3 py-4 text-center align-middle">
                        <div className="flex items-center justify-center">
                          {activeTab === 'pending' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full font-bold bg-sky-50 text-sky-700 border border-sky-200/70 shadow-2xs whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0 animate-pulse" />
                              <span>{formatArabicScansStatus(totalTestsCount, 'pending')}</span>
                            </span>
                          )}
                          {activeTab === 'in_progress' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full font-bold bg-violet-50 text-violet-700 border border-violet-200/70 shadow-2xs whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0 animate-pulse" />
                              <span>{formatArabicScansStatus(totalTestsCount, 'in_progress')}</span>
                            </span>
                          )}
                          {activeTab === 'completed' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70 shadow-2xs whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              <span>{formatArabicScansStatus(totalTestsCount, 'completed')}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Date & Time */}
                      <td className="w-[20%] px-3 py-4 text-center">
                        <div className="flex items-center justify-center">
                          <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                            {dateFormatted}
                          </span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="w-[15%] px-3 py-4 text-center">
                        <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {activeTab === 'pending' ? (
                            <button
                              type="button"
                              onClick={() => handleStartAll(v.visit_id)}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-black text-white bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 rounded-xl shadow-xs shadow-sky-500/20 active:scale-95 transition-all cursor-pointer"
                              title="تحويل لغرفة التصوير وبدء الفحص"
                            >
                              <CheckCircle size={13} strokeWidth={2.2} />
                              <span>تحويل للتصوير</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSelected(v.visit_id)}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-black text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200/60 rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer"
                            >
                              <FileText size={13} strokeWidth={2.2} />
                              <span>{activeTab === 'completed' ? 'عرض النتائج' : 'توثيق النتائج'}</span>
                            </button>
                          )}
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

      {/* Patient Detail Panel */}
      {selected && (
        <PatientDetailPanel
          visitId={selected.visit_id || selected}
          token={token}
          activeTab={activeTab}
          onStartAll={handleStartAll}
          onClose={() => {
            setSelected(null);
            fetchAllData(undefined, false);
          }}
          onCompleted={() => {
            fetchAllData(undefined, false);
          }}
        />
      )}
    </div>
  );
};

export default RadiologyDashboard;
