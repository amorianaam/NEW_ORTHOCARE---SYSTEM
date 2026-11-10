import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  FlaskConical,
  Search,
  CheckCircle,
  CheckCircle2,
  Clock,
  CheckSquare,
  LayoutGrid,
  List,
  Scissors,
  User,
  X,
  FileText,
  Users,
  Sparkles
} from "lucide-react";
import { toast } from "react-toastify";
import useAuthStore from "../../store/useAuthStore";
import useSocketStore from "../../store/useSocketStore";
import { usePersistentState } from "../../hooks/usePersistentState";
import { LabPatientDetailPanel } from "../../components/lab/LabModals";
import { getSocket } from "../../utils/socket";
import { getCurrentShiftDate } from "../../utils/shiftHelpers";
import { formatArabicTestsStatus } from "../../utils/arabicFormatters";

// ── Format Date/Time Helper in English (Doctor Queue & Dashboard Style) ─────
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
    title: 'الطلبات المخبرية الواردة',
    subtitle: 'بانتظار استلام العينات',
    icon: Clock,
    color: 'text-indigo-600',
    bg: 'bg-indigo-100',
    border: 'border-indigo-200',
    activeTextColor: 'text-indigo-700',
    activeBorder: 'border-b-indigo-600',
    badgeClass: 'bg-indigo-100 text-indigo-700',
    indicatorColor: 'bg-indigo-500',
    avatarTheme: 'bg-gradient-to-br from-indigo-50 to-indigo-100/80 text-indigo-700 border border-indigo-200/50',
    hoverBorder: 'hover:border-indigo-300 hover:shadow-indigo-500/10',
  },
  {
    id: 'in_progress',
    label: 'قيد الإجراء',
    title: 'التحاليل قيد الإجراء',
    subtitle: 'عينات مستلمة جاري فحصها',
    icon: FlaskConical,
    color: 'text-purple-600',
    bg: 'bg-purple-100',
    border: 'border-purple-200',
    activeTextColor: 'text-purple-700',
    activeBorder: 'border-b-purple-600',
    badgeClass: 'bg-purple-100 text-purple-700',
    indicatorColor: 'bg-purple-500',
    avatarTheme: 'bg-gradient-to-br from-purple-50 to-purple-100/80 text-purple-700 border border-purple-200/50',
    hoverBorder: 'hover:border-purple-300 hover:shadow-purple-500/10',
  },
  {
    id: 'completed',
    label: 'تحاليل منجزة',
    title: 'سجل التحاليل المنجزة اليوم',
    subtitle: 'تم توثيق واعتماد نتائجها',
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

// ── Main Dashboard Component ─────────────────────────────────────────────────
const LaboratoryDashboard = () => {
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
  const [layoutMode, setLayoutMode] = usePersistentState('lab_layout_preference', 'grid');
  const [dailyStats, setDailyStats] = useState({ totalRequests: 0, completed: 0, pending: 0 });
  const [tabCounters, setTabCounters] = useState({ pending: 0, in_progress: 0, completed: 0 });
  
  const latestLabEvent = useSocketStore(state => state.latestLabEvent);
  const latestSilentUpdate = useSocketStore(state => state.latestSilentUpdate);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const fetchAllData = useCallback(async (signal, isInitial = false) => {
    if (isInitial) setInitialLoading(true);
    try {
      const today = getCurrentShiftDate();
      const [resPending, resInProgress, resCompleted, resStats] = await Promise.all([
        fetch('/api/lab/requests?tab=pending', { headers, signal }),
        fetch('/api/lab/requests?tab=in_progress', { headers, signal }),
        fetch(`/api/lab/requests?tab=completed&startDate=${today}&endDate=${today}`, { headers, signal }),
        fetch(`/api/lab/stats?startDate=${today}&endDate=${today}`, { headers, signal })
      ]);

      const [pendingData, inProgressData, completedData, statsData] = await Promise.all([
        resPending.ok ? resPending.json() : [],
        resInProgress.ok ? resInProgress.json() : [],
        resCompleted.ok ? resCompleted.json() : [],
        resStats.ok ? resStats.json() : null
      ]);

      const pArr = Array.isArray(pendingData) ? pendingData : [];
      const ipArr = Array.isArray(inProgressData) ? inProgressData : [];
      const cArr = Array.isArray(completedData) ? completedData : [];

      setTabRequests({
        pending: pArr,
        in_progress: ipArr,
        completed: cArr
      });

      if (statsData) {
        setDailyStats({
          totalRequests: statsData.summary?.total_requests || 0,
          completed: statsData.summary?.completed || 0,
          pending: statsData.summary?.pending || 0,
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
        toast.error("فشل تحميل بيانات المختبر");
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

  // Real-time store updates (silent background refresh)
  useEffect(() => {
    if (latestLabEvent?.id || latestSilentUpdate?.timestamp) {
      fetchAllData(undefined, false);
    }
  }, [latestLabEvent?.id, latestSilentUpdate?.timestamp, fetchAllData]);

  // Direct socket listeners for instant, lightning-fast reactivity
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleLiveSync = () => {
      fetchAllData(undefined, false);
    };

    socket.on('lab:update', handleLiveSync);
    socket.on('request:new', handleLiveSync);
    socket.on('request:update', handleLiveSync);
    socket.on('lab:completed', handleLiveSync);
    socket.on('cashier:update', handleLiveSync);
    socket.on('patient:waiting', handleLiveSync);
    socket.on('patient:updated', handleLiveSync);

    return () => {
      socket.off('lab:update', handleLiveSync);
      socket.off('request:new', handleLiveSync);
      socket.off('request:update', handleLiveSync);
      socket.off('lab:completed', handleLiveSync);
      socket.off('cashier:update', handleLiveSync);
      socket.off('patient:waiting', handleLiveSync);
      socket.off('patient:updated', handleLiveSync);
    };
  }, [fetchAllData]);

  const handleStartAll = useCallback(async (visitId) => {
    // Optimistic Update
    setTabRequests(prev => ({
      ...prev,
      pending: prev.pending.filter(r => r.visit_id !== visitId)
    }));
    try {
      const res = await fetch(`/api/lab/visit/${visitId}/start-all`, {
        method: "PUT",
        headers,
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(d.message || "تم استلام العينات وبدء الفحص");
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

  const filtered = useMemo(() => currentRequests.filter(
    (r) =>
      !query || 
      (r.full_name || '').toLowerCase().includes(query.toLowerCase()) || 
      String(r.visit_number || '').toLowerCase().includes(query.toLowerCase()),
  ), [currentRequests, query]);

  // Active Tab Configuration
  const currentTabConfig = useMemo(() => {
    return TABS.find(t => t.id === activeTab) || TABS[0];
  }, [activeTab]);

  // Quick Stats Cards (Matching Secretary Dashboard 4-card Layout)
  const statsCards = useMemo(() => [
    { 
      label: 'الطلبات الواردة', 
      value: tabCounters.pending || 0, 
      unit: 'طلب', 
      sub: 'بانتظار استلام العينات', 
      icon: Clock, 
      color: 'text-indigo-600', 
      bg: 'bg-indigo-100', 
      border: 'border-indigo-200' 
    },
    { 
      label: 'قيد الإجراء', 
      value: tabCounters.in_progress || 0, 
      unit: 'طلب', 
      sub: 'تحاليل جارية في المختبر', 
      icon: FlaskConical, 
      color: 'text-purple-600', 
      bg: 'bg-purple-100', 
      border: 'border-purple-200' 
    },
    { 
      label: 'تحاليل منجزة', 
      value: dailyStats.completed || 0, 
      unit: 'فحص', 
      sub: 'تم اعتماد نتائجها اليوم', 
      icon: CheckCircle2, 
      color: 'text-emerald-600', 
      bg: 'bg-emerald-100', 
      border: 'border-emerald-200' 
    },
    { 
      label: 'إجمالي الفحوصات اليوم', 
      value: dailyStats.totalRequests || 0, 
      unit: 'فحص', 
      sub: 'كافة طلبات اليوم المسجلة', 
      icon: FlaskConical, 
      color: 'text-violet-600', 
      bg: 'bg-violet-100', 
      border: 'border-violet-200' 
    },
  ], [tabCounters, dailyStats]);

  return (
    <div className="space-y-6 w-full p-6" dir="rtl">
      {/* ── 1. Page Header Banner (Matching SecretaryDashboard Style) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 flex-shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-800 text-white flex items-center justify-center shadow-md shadow-violet-500/20">
            <FlaskConical size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800">قسم المختبر والتحاليل الطبية</h1>
            <p className="text-sm font-bold text-gray-500 mt-0.5">
              إدارة ومتابعة طلبات التحاليل المخبرية، استلام العينات، وتوثيق النتائج الطبية لحظياً
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white px-4 py-2.5 rounded-2xl border border-gray-100 shadow-sm text-sm font-bold text-gray-600">
            إجمالي الفحوصات اليوم: <span className="text-violet-700 font-black text-lg">{dailyStats.totalRequests}</span>
          </div>
        </div>
      </div>

      {/* ── 2. Quick Stats Grid (4 Cards like Secretary Dashboard) ── */}
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
              {s.sub && (
                <p className="text-[10px] text-gray-400 font-semibold mt-1 truncate" title={s.sub}>
                  {s.sub}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── 3. Centered Workspace Tab Selector (Doctor Queue & Secretary Style) ── */}
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
              className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-violet-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200/60 shadow-xs transition-all"
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
                layoutMode === "grid" ? "bg-white text-violet-700 shadow-sm" : "text-gray-400 hover:text-gray-600"
              }`}
              title="عرض كشبكة"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode("list")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                layoutMode === "list" ? "bg-white text-violet-700 shadow-sm" : "text-gray-400 hover:text-gray-600"
              }`}
              title="عرض كقائمة"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── 5. Patients Content (Grid / List Mode) ── */}
      {initialLoading ? (
        <div className="flex justify-center items-center p-16 bg-white rounded-3xl border border-gray-100 shadow-sm">
          <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-300">
            {query ? <Search size={32} strokeWidth={1.5} /> : <Users size={32} strokeWidth={1.5} />}
          </div>
          <h3 className="text-base font-black text-gray-700">
            {query ? `لا توجد نتائج مطابقة للبحث "${query}"` : "لا توجد طلبات في هذه القائمة حالياً"}
          </h3>
          <p className="text-gray-400 text-xs mt-1.5 font-semibold">
            {query ? "تأكد من كتابة الاسم أو الرقم المرجعي للزيارة بشكل صحيح." : "تأكد من اختيار التبويب المطلوب أو انتظر وصول طلبات جديدة."}
          </p>
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-3 text-xs font-bold text-violet-600 hover:text-violet-700 bg-violet-50 px-3 py-1.5 rounded-lg border border-violet-100 transition-colors cursor-pointer"
            >
              مسح كلمة البحث
            </button>
          )}
        </div>
      ) : layoutMode === "grid" ? (
        /* ── Grid Mode ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((v, idx) => {
            const dateFormatted = formatDateTimeEn(v.requested_at);
            const tabTestsCount = v.total_tab_tests || 0;
            const completedCount = v.total_completed_tests || 0;

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
                        <div className="flex items-center gap-1 flex-wrap">
                          <h3 className="font-black text-slate-800 text-sm leading-tight group-hover:text-violet-700 transition-colors truncate">
                            {v.full_name || 'مريض غير معروف'}
                          </h3>
                          {Boolean(v.is_surgery) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                              <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                              <span>عمليات</span>
                            </span>
                          )}
                          {(Boolean(v.is_external) || v.visit_number?.startsWith('EXT-')) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-teal-100/80 text-teal-800 border border-teal-200/80 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
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
                    <span className="text-xs font-black text-slate-400 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100 flex-shrink-0">
                      {idx + 1}
                    </span>
                  </div>

                  {/* Middle Details: Tests summary (Age and Gender Removed) */}
                  <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-slate-100/80">
                    {activeTab === 'pending' && (
                      <span className="text-[11px] font-bold bg-violet-50 text-violet-700 px-2.5 py-1 rounded-lg border border-violet-200/60 flex items-center gap-1.5">
                        <Clock size={12} />
                        <span>{formatArabicTestsStatus(tabTestsCount, 'pending')}</span>
                      </span>
                    )}

                    {activeTab === 'in_progress' && (
                      <span className="text-[11px] font-bold bg-purple-50 text-purple-700 px-2.5 py-1 rounded-lg border border-purple-200/60 flex items-center gap-1.5">
                        <FlaskConical size={12} />
                        <span>{formatArabicTestsStatus(tabTestsCount, 'in_progress')}</span>
                      </span>
                    )}

                    {activeTab === 'completed' && (
                      <span className="text-[11px] font-bold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg border border-emerald-200/60 flex items-center gap-1.5">
                        <CheckCircle size={12} />
                        <span>{formatArabicTestsStatus(completedCount, 'completed')}</span>
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
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-black text-white bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 rounded-xl shadow-xs shadow-violet-500/20 active:scale-95 transition-all cursor-pointer"
                        title="استلام العينات وبدء الفحص"
                      >
                        <CheckCircle size={13} strokeWidth={2.2} />
                        <span>استلام العينات</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(v.visit_id);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-black text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200/60 rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer"
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
              <thead className="bg-gradient-to-r from-slate-50/90 via-violet-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                <tr>
                  <th className="w-[5%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                  <th className="w-[44%] px-4 py-4 text-right font-black text-xs text-slate-600">المريض</th>
                  <th className="w-[16%] px-3 py-4 text-center font-black text-xs text-slate-600">التحاليل</th>
                  <th className="w-[20%] px-3 py-4 text-center font-black text-xs text-slate-600">
                    {activeTab === 'completed' ? 'وقت وتاريخ الإنجاز' : 'وقت وتاريخ الطلب'}
                  </th>
                  <th className="w-[15%] px-3 py-4 text-center font-black text-xs text-slate-600">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/70">
                {filtered.map((v, idx) => {
                  const dateFormatted = formatDateTimeEn(v.requested_at);
                  const tabTestsCount = v.total_tab_tests || 0;
                  const completedCount = v.total_completed_tests || 0;

                  return (
                    <tr
                      key={v.visit_id || idx}
                      onClick={() => setSelected(v.visit_id)}
                      className="hover:bg-violet-50/30 cursor-pointer transition-colors border-b border-slate-100/70 last:border-0 group"
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
                              <span className="font-black text-slate-800 text-sm group-hover:text-violet-700 transition-colors truncate">
                                {v.full_name}
                              </span>
                              {Boolean(v.is_surgery) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                  <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                                  <span>عمليات</span>
                                </span>
                              )}
                              {(Boolean(v.is_external) || v.visit_number?.startsWith('EXT-')) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-teal-100/80 text-teal-800 border border-teal-200/80 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
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

                      {/* Total Tests by Tab (حقل التحاليل - Matching LabModals Status Style) */}
                      <td className="w-[16%] px-3 py-4 text-center align-middle">
                        <div className="flex items-center justify-center">
                          {activeTab === 'pending' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full font-bold bg-purple-50 text-purple-700 border border-purple-200/70 shadow-2xs whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0 animate-pulse" />
                              <span>{formatArabicTestsStatus(tabTestsCount, 'pending')}</span>
                            </span>
                          )}
                          {activeTab === 'in_progress' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full font-bold bg-teal-50 text-teal-700 border border-teal-200/70 shadow-2xs whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0 animate-pulse" />
                              <span>{formatArabicTestsStatus(tabTestsCount, 'in_progress')}</span>
                            </span>
                          )}
                          {activeTab === 'completed' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70 shadow-2xs whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              <span>{formatArabicTestsStatus(completedCount, 'completed')}</span>
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
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-black text-white bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 rounded-xl shadow-xs shadow-violet-500/20 active:scale-95 transition-all cursor-pointer"
                              title="استلام العينات وبدء الفحص"
                            >
                              <CheckCircle size={13} strokeWidth={2.2} />
                              <span>استلام العينات</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSelected(v.visit_id)}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-black text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200/60 rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer"
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

      {/* Slide-over Patient Detail Panel for entering / viewing results */}
      {selected && (
        <LabPatientDetailPanel
          visitId={selected}
          token={token}
          isCompletedTab={activeTab === "completed"}
          isPendingTab={activeTab === "pending"}
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

export default LaboratoryDashboard;
