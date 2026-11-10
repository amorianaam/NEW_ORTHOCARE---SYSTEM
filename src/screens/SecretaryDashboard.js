import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Users,
  Search,
  Filter,
  RefreshCcw,
  User,
  Phone,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Stethoscope,
  Printer,
  X,
  FileText,
  FlaskConical,
  Maximize,
  Minimize,
  LayoutDashboard,
  LayoutGrid,
  List,
  Crown,
  RotateCcw,
  Scissors,
  Eye
} from "lucide-react";
import { toast } from "react-toastify";
import axios from "axios";
import useAuthStore from "../store/useAuthStore";
import useSocketStore from "../store/useSocketStore";
import { CLINIC_LOGO_BASE64 } from "../assets/clinicLogo";
import { usePersistentState } from "../hooks/usePersistentState";
import HistoricEMRModal from "../components/HistoricEMRModal";
import SmartStatusBadge from "../components/common/SmartStatusBadge";
import { printPrescription } from "../utils/prescriptionPrint";

// ── Tabs Configuration ────────────────────────────────────────────────────────
const TABS = [
  {
    id: 'waiting',
    label: 'قاعة الانتظار',
    icon: Clock,
    title: 'قائمة الانتظار النشطة',
    subtitle: 'بانتظار الدخول للطبيب',
    indicatorColor: 'bg-sky-500',
    color: 'text-sky-600',
    bg: 'bg-sky-100',
    border: 'border-sky-200',
    activeTextColor: 'text-sky-700',
    activeBorder: 'border-b-sky-600',
    badgeClass: 'bg-sky-100 text-sky-700',
    avatarTheme: 'bg-gradient-to-br from-sky-50 to-sky-100/80 text-sky-700 border border-sky-200/50',
    hoverBorder: 'hover:border-sky-300 hover:shadow-sky-500/10',
    btnGradient: 'bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 shadow-sky-500/20',
  },
  {
    id: 'under_examination',
    label: 'قيد المعاينة',
    icon: Stethoscope,
    title: 'الحالات قيد المعاينة',
    subtitle: 'داخل العيادة السريرية حالياً',
    indicatorColor: 'bg-teal-500',
    color: 'text-teal-600',
    bg: 'bg-teal-100',
    border: 'border-teal-200',
    activeTextColor: 'text-teal-700',
    activeBorder: 'border-b-teal-600',
    badgeClass: 'bg-teal-100 text-teal-700',
    avatarTheme: 'bg-gradient-to-br from-teal-50 to-teal-100/80 text-teal-700 border border-teal-200/50',
    hoverBorder: 'hover:border-teal-300 hover:shadow-teal-500/10',
    btnGradient: 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-teal-500/20',
  },
  {
    id: 'active_investigations',
    label: 'فحوصات نشطة',
    icon: FlaskConical,
    title: 'متابعة الفحوصات النشطة',
    subtitle: 'في المختبر أو الأشعة قيد الإجراء',
    indicatorColor: 'bg-purple-500',
    color: 'text-purple-600',
    bg: 'bg-purple-100',
    border: 'border-purple-200',
    activeTextColor: 'text-purple-700',
    activeBorder: 'border-b-purple-600',
    badgeClass: 'bg-purple-100 text-purple-700',
    avatarTheme: 'bg-gradient-to-br from-purple-50 to-purple-100/80 text-purple-700 border border-purple-200/50',
    hoverBorder: 'hover:border-purple-300 hover:shadow-purple-500/10',
    btnGradient: 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-purple-500/20',
  },
  {
    id: 'ready_results',
    label: 'نتائج جاهزة',
    icon: AlertTriangle,
    title: 'الحالات جاهزة النتائج',
    subtitle: 'اكتملت الفحوصات بانتظار العودة للطبيب',
    indicatorColor: 'bg-amber-500',
    color: 'text-amber-600',
    bg: 'bg-amber-100',
    border: 'border-amber-200',
    activeTextColor: 'text-amber-700',
    activeBorder: 'border-b-amber-600',
    badgeClass: 'bg-amber-100 text-amber-700',
    avatarTheme: 'bg-gradient-to-br from-amber-50 to-amber-100/80 text-amber-700 border border-amber-200/50',
    hoverBorder: 'hover:border-amber-300 hover:shadow-amber-500/10',
    btnGradient: 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 shadow-amber-500/20',
  },
  {
    id: 'examined',
    label: 'تمت المعاينة',
    icon: CheckCircle2,
    title: 'سجل المعاينات المنجزة',
    subtitle: 'تمت معاينتهم اليوم بنجاح',
    indicatorColor: 'bg-emerald-500',
    color: 'text-emerald-600',
    bg: 'bg-emerald-100',
    border: 'border-emerald-200',
    activeTextColor: 'text-emerald-700',
    activeBorder: 'border-b-emerald-600',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    avatarTheme: 'bg-gradient-to-br from-emerald-50 to-emerald-100/80 text-emerald-700 border border-emerald-200/50',
    hoverBorder: 'hover:border-emerald-300 hover:shadow-emerald-500/10',
    btnGradient: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/20',
  },
];

export default function SecretaryDashboard() {
  const { token } = useAuthStore();
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("waiting");
  const [layoutMode, setLayoutMode] = usePersistentState('global_layout_preference', 'grid');

  // Modals
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [selectedPatientForModal, setSelectedPatientForModal] = useState(null);
  const [isPrescriptionFullscreen, setIsPrescriptionFullscreen] = usePersistentState('secretary_prescription_fullscreen', false);

  const latestPatientEvent = useSocketStore(state => state.latestPatientEvent);
  const latestSecretaryEvent = useSocketStore(state => state.latestSecretaryEvent);
  const latestSilentUpdate = useSocketStore(state => state.latestSilentUpdate);
  const lastFetchRef = useRef(0);

  // ── Format Date/Time Helper in English (Doctor Queue Style) ────────────────
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

  // ── Format Phone Number Helper (Yemeni/Mobile Format) ─────────────────────
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

  const fetchData = useCallback(async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    try {
      const res = await axios.get("/api/doctor/queue", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const vData = Array.isArray(res.data) ? res.data : [];
      setVisits(vData);
      lastFetchRef.current = Date.now();
    } catch {
      if (!isPolling) toast.error("فشل تحميل البيانات");
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [token]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Deep Hydration trigger (Optimistic State Mutation for Doctor queue events)
  useEffect(() => {
    if (!latestPatientEvent || latestPatientEvent.timestamp <= lastFetchRef.current) return;

    if (latestPatientEvent.visitId && latestPatientEvent.status) {
      const targetId = Number(latestPatientEvent.visitId);
      let found = false;
      setVisits(prev => {
        const next = prev.map(v => {
          if (Number(v.visitId) === targetId || Number(v.id) === targetId) {
            found = true;
            return { ...v, status: latestPatientEvent.status };
          }
          return v;
        });
        if (!found) fetchData(true);
        return next;
      });
    } else {
      fetchData(true);
    }
  }, [latestPatientEvent?.timestamp, fetchData]);

  // Secretary Real-Time Optimistic UI Mutations (Zero-Refetch Fast Path)
  useEffect(() => {
    if (!latestSecretaryEvent || latestSecretaryEvent.timestamp <= lastFetchRef.current) return;

    const { type, visitId, status } = latestSecretaryEvent;
    if (!visitId) {
      fetchData(true);
      return;
    }

    const targetId = Number(visitId);

    if (type === 'status_changed') {
      let found = false;
      setVisits(prev => {
        const next = prev.map(v => {
          if (Number(v.visitId) === targetId || Number(v.id) === targetId) {
            found = true;
            return { ...v, status };
          }
          return v;
        });
        if (!found) fetchData(true);
        return next;
      });
    } else if (type === 'lab_ready') {
      let found = false;
      setVisits(prev => {
        const next = prev.map(v => {
          if (Number(v.visitId) === targetId || Number(v.id) === targetId) {
            found = true;
            return {
              ...v,
              labRequests: (v.labRequests || []).map(r =>
                r.status !== 'cancelled' && r.status !== 'refunded'
                  ? { ...r, status: 'completed' }
                  : r
              )
            };
          }
          return v;
        });
        if (!found) fetchData(true);
        return next;
      });
    } else if (type === 'radiology_ready') {
      let found = false;
      setVisits(prev => {
        const next = prev.map(v => {
          if (Number(v.visitId) === targetId || Number(v.id) === targetId) {
            found = true;
            return {
              ...v,
              radiologyRequests: (v.radiologyRequests || []).map(r =>
                r.status !== 'cancelled' && r.status !== 'refunded'
                  ? { ...r, status: 'completed' }
                  : r
              )
            };
          }
          return v;
        });
        if (!found) fetchData(true);
        return next;
      });
    } else if (type === 'patient_registered' || type === 'patient_queued') {
      setVisits(prev => {
        const exists = prev.some(v => Number(v.visitId) === targetId || Number(v.id) === targetId);
        if (!exists) {
          fetchData(true);
        }
        return prev;
      });
    } else {
      fetchData(true);
    }
  }, [latestSecretaryEvent?.timestamp, fetchData]);

  // Handle Cancellation / System-wide updates
  useEffect(() => {
    if (!latestSilentUpdate || latestSilentUpdate.timestamp <= lastFetchRef.current) return;
    if (latestSilentUpdate.type === 'cancellation') {
      fetchData(true);
    }
  }, [latestSilentUpdate?.timestamp, fetchData]);

  // Filter and derive data (Canonical Disjoint 5-State Partition Machine)
  const processedVisits = useMemo(() => {
    return visits.map(v => {
      // 1. Diagnostic & Clinical Requests
      const diagnosticRequests = [
        ...(v.labRequests || []),
        ...(v.radiologyRequests || [])
      ].filter(r => r && r.status !== 'cancelled' && r.status !== 'refunded');

      const allActiveOrders = [
        ...(v.labRequests || []),
        ...(v.radiologyRequests || []),
        ...(v.clinicalRequests || [])
      ].filter(r => r && r.status !== 'cancelled' && r.status !== 'refunded');

      const hasDiagnosticOrders = diagnosticRequests.length > 0;
      const hasPendingDiagnostics = allActiveOrders.some(r => 
        ['pending', 'pending_payment', 'paid', 'in_progress', 'result_uploaded'].includes(r.status)
      );
      const allDiagnosticsCompleted = hasDiagnosticOrders && diagnosticRequests.every(r => r.status === 'completed');

      // 2. Canonical Disjoint 5-State Machine
      let tabState = 'waiting';
      if (v.status === 'completed') {
        tabState = 'examined';
      } else if (v.status === 'cancelled') {
        tabState = 'cancelled';
      } else if (v.status === 'with_doctor') {
        tabState = 'under_examination';
      } else if (hasPendingDiagnostics) {
        tabState = 'active_investigations';
      } else if (allDiagnosticsCompleted) {
        tabState = 'ready_results';
      } else {
        tabState = 'waiting';
      }

      return {
        ...v,
        tabState,
        hasPendingDiagnostics,
        allDiagnosticsCompleted,
        hasActiveInvestigations: hasPendingDiagnostics,
        hasReadyResults: allDiagnosticsCompleted,
        locationState: tabState,
        isWaiting: tabState === 'waiting',
        isUnderExamination: tabState === 'under_examination',
        isExamined: tabState === 'examined'
      };
    });
  }, [visits]);

  // Dashboard Stats (Disjoint Partition Count)
  const stats = useMemo(() => ({
    waiting: processedVisits.filter(v => v.tabState === 'waiting').length,
    underExamination: processedVisits.filter(v => v.tabState === 'under_examination').length,
    activeInvestigations: processedVisits.filter(v => v.tabState === 'active_investigations').length,
    readyResults: processedVisits.filter(v => v.tabState === 'ready_results').length,
    examined: processedVisits.filter(v => v.tabState === 'examined').length,
    cancelled: processedVisits.filter(v => v.tabState === 'cancelled').length,
    total: processedVisits.filter(v => v.tabState !== 'cancelled').length
  }), [processedVisits]);

  // Filtered visits based on query and active filter
  const filtered = useMemo(() => {
    return processedVisits.filter(v => {
      const q = query.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, '');
      const matchQuery = !q || 
        (v.full_name || '').toLowerCase().includes(q) || 
        (v.phone && (String(v.phone).includes(q) || (qDigits && String(v.phone).replace(/\D/g, '').includes(qDigits)))) ||
        String(v.visit_number || v.visitId || v.id || '').toLowerCase().includes(q);
        
      const matchFilter = v.tabState === activeFilter;

      return matchQuery && matchFilter;
    });
  }, [processedVisits, query, activeFilter]);

  // Active tab configuration
  const currentTabConfig = useMemo(() => {
    return TABS.find(t => t.id === activeFilter) || TABS[0];
  }, [activeFilter]);

  const currentTabTotalCount = useMemo(() => {
    if (activeFilter === 'waiting') return stats.waiting;
    if (activeFilter === 'under_examination') return stats.underExamination;
    if (activeFilter === 'active_investigations') return stats.activeInvestigations;
    if (activeFilter === 'ready_results') return stats.readyResults;
    if (activeFilter === 'examined') return stats.examined;
    return 0;
  }, [activeFilter, stats]);

  const handlePrintPrescription = () => {
    if (!selectedVisit) return;
    const current = selectedVisit;
    setSelectedVisit(null);
    printPrescription({
      patient: current,
      visit: current,
      items: current.prescription,
      onAfterPrint: () => {
        setSelectedVisit(null);
      }
    });
  };

  return (
    <div className="space-y-6 w-full" dir="rtl">
      
      {/* ── 1. Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 flex-shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 text-white flex items-center justify-center shadow-md shadow-teal-500/20">
            <LayoutDashboard size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800">لوحة تحكم الاستقبال</h1>
            <p className="text-sm font-bold text-gray-500 mt-0.5">
              متابعة سير قاعة الانتظار، تدفق المرضى، وتتبع جاهزية نتائج الفحوصات الطبية لحظياً
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white px-4 py-2.5 rounded-2xl border border-gray-100 shadow-sm text-sm font-bold text-gray-600">
            إجمالي المرضى: <span className="text-teal-700 font-black text-lg">{stats.total}</span>
          </div>
        </div>
      </div>

      {/* ── 2. Quick Stats Grid (Doctor Dashboard Style - 4 Cards) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full flex-shrink-0">
        {[
          {
            label: "قاعة الانتظار",
            value: stats.waiting,
            unit: "مريض",
            sub: "بانتظار الدخول للطبيب",
            icon: Clock,
            color: "text-sky-600",
            bg: "bg-sky-100",
            border: "border-sky-200",
          },
          {
            label: "فحوصات نشطة",
            value: stats.activeInvestigations,
            unit: "مريض",
            sub: "في المختبر أو الأشعة",
            icon: FlaskConical,
            color: "text-purple-600",
            bg: "bg-purple-100",
            border: "border-purple-200",
          },
          {
            label: "نتائج جاهزة",
            value: stats.readyResults,
            unit: "مريض",
            sub: "جاهزون للعودة للطبيب",
            icon: AlertTriangle,
            color: "text-amber-600",
            bg: "bg-amber-100",
            border: "border-amber-200",
          },
          {
            label: "تمت المعاينة",
            value: stats.examined,
            unit: "مريض",
            sub: "اكتملت معاينتهم اليوم",
            icon: CheckCircle2,
            color: "text-emerald-600",
            bg: "bg-emerald-100",
            border: "border-emerald-200",
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

      {/* ── 3. Centered Workspace Tab Selector (Doctor Queue Style) ── */}
      <div className="flex justify-center w-full">
        <div className="flex p-1.5 gap-2 bg-gray-100/90 backdrop-blur-md rounded-2xl border border-gray-200/80 max-w-4xl w-full shadow-xs overflow-x-auto no-scrollbar">
          {TABS.map(tab => {
            let badgeVal = 0;
            if (tab.id === 'waiting') badgeVal = stats.waiting;
            if (tab.id === 'under_examination') badgeVal = stats.underExamination;
            if (tab.id === 'active_investigations') badgeVal = stats.activeInvestigations;
            if (tab.id === 'ready_results') badgeVal = stats.readyResults;
            if (tab.id === 'examined') badgeVal = stats.examined;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs md:text-sm font-black transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  activeFilter === tab.id
                    ? `bg-white ${tab.activeTextColor} shadow-sm border border-gray-100 ${tab.activeBorder}`
                    : "text-gray-500 hover:bg-white/50 hover:text-gray-700 border-transparent"
                }`}
              >
                <tab.icon size={15} />
                <span>{tab.label}</span>
                {badgeVal > 0 && (
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${tab.badgeClass}`}>
                    {badgeVal}
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
              ? `${filtered.length} من أصل ${currentTabTotalCount} مريض`
              : `${currentTabTotalCount} مريض ${currentTabConfig.subtitle}`}
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
              placeholder="بحث بالاسم، رقم الهاتف، أو معرف الزيارة..."
              className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-teal-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-200/60 shadow-xs transition-all"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                title="مسح البحث"
              >
                <div className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                  <X size={12} strokeWidth={2.5} />
                </div>
              </button>
            )}
          </div>

          <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shrink-0">
            <button
              type="button"
              onClick={() => setLayoutMode("grid")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                layoutMode === "grid" ? "bg-white text-teal-700 shadow-sm" : "text-gray-400 hover:text-gray-600"
              }`}
              title="عرض كشبكة"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode("list")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                layoutMode === "list" ? "bg-white text-teal-700 shadow-sm" : "text-gray-400 hover:text-gray-600"
              }`}
              title="عرض كقائمة"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── 5. Patients Content (Grid / List Mode) ── */}
      {loading ? (
        <div className="flex justify-center items-center p-16 bg-white rounded-3xl border border-gray-100 shadow-sm">
          <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-300">
            {query ? <Search size={32} strokeWidth={1.5} /> : <Users size={32} strokeWidth={1.5} />}
          </div>
          <h3 className="text-base font-black text-gray-700">
            {query ? `لا توجد نتائج مطابقة للبحث "${query}"` : "لا توجد حالات في هذه القائمة حالياً"}
          </h3>
          <p className="text-gray-400 text-xs mt-1.5 font-semibold">
            {query ? "تأكد من كتابة الاسم أو رقم الهاتف أو معرف الزيارة بشكل صحيح." : "تأكد من اختيار التبويب المطلوب أو انتظر وصول حالات جديدة."}
          </p>
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-3 text-xs font-bold text-teal-600 hover:text-teal-700 bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-100 transition-colors"
            >
              مسح كلمة البحث
            </button>
          )}
        </div>
      ) : layoutMode === "grid" ? (
        /* ── Grid Mode (مطابق لتخطيط وتصميم بطاقة قائمة الانتظار في مستخدم الطبيب) ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((v, idx) => {
            const dateFormatted = formatDateTimeEn(v.created_at);
            const isResultsReady = v.tabState === 'ready_results';

            return (
              <div
                key={v.visitId || idx}
                onClick={() => setSelectedPatientForModal({ id: v.patient_id, patient_id: v.patient_id, full_name: v.full_name, age: v.age, gender: v.gender, phone: v.phone, visit_number: v.visit_number, visitId: v.visitId, is_exempt: v.is_exempt, is_follow_up: v.is_follow_up, is_surgery: v.is_surgery, created_at: v.created_at })}
                className={`bg-white rounded-3xl border border-slate-100/90 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${currentTabConfig.hoverBorder} flex flex-col justify-between p-5 select-none shadow-[0_4px_20px_rgb(0,0,0,0.03)] group`}
                dir="rtl"
              >
                {/* Top: Avatar + Patient Name + Visit ID + Index Counter */}
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={`w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center font-black text-base transition-transform group-hover:scale-105 shadow-xs ${currentTabConfig.avatarTheme}`}>
                      {v.full_name?.charAt(0) ?? '؟'}
                    </div>
                    <div className="min-w-0 flex-1 text-right" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                      <div className="flex items-center gap-1 flex-wrap">
                        <h3 className="font-black text-slate-800 text-sm leading-tight group-hover:text-teal-700 transition-colors truncate">
                          {v.full_name || 'مريض غير معروف'}
                        </h3>
                        {Boolean(v.is_follow_up) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-emerald-100/75 text-emerald-700 border border-emerald-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                            <RotateCcw size={11} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                            <span>مراجعة</span>
                          </span>
                        )}
                        {Boolean(v.is_exempt) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-amber-100/75 text-amber-700 border border-amber-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                            <Crown size={11} className="text-amber-600 shrink-0" strokeWidth={2.2} />
                            <span>إعفاء</span>
                          </span>
                        )}
                        {Boolean(v.is_surgery || v.has_surgeries || v.has_surgery || v.status === 'transferred_to_center' || (Array.isArray(v.surgeries) && v.surgeries.length > 0)) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                            <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                            <span>عمليات</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-bold text-slate-400 text-right mt-1 w-full" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                        <span dir="ltr">{v.visit_number || v.visitId}</span>
                      </p>
                    </div>
                  </div>

                  {/* Index Counter Badge */}
                  <span className="text-xs font-black text-slate-400 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100 flex-shrink-0">
                    {idx + 1}
                  </span>
                </div>

                {/* Bottom Metadata: Date/Time + Status Badge */}
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100/80 gap-2">
                  <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                    {dateFormatted}
                  </span>

                  <div className="flex items-center gap-2">
                    {activeFilter === 'ready_results' || isResultsReady ? (
                      <span className="inline-flex items-center rounded-xl border font-bold shadow-xs whitespace-nowrap select-none transition-all bg-amber-100/90 text-amber-800 border-amber-300/80 text-[11px] px-2.5 py-1 gap-1.5">
                        <span className="relative flex h-2 w-2 flex-shrink-0">
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                        </span>
                        <span>مستعد للدخول</span>
                      </span>
                    ) : (
                      <SmartStatusBadge visit={v} role="secretary" />
                    )}
                    
                    {v.prescription && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVisit(v);
                        }}
                        className="p-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-xl transition-colors"
                        title="معاينة وطباعة الروشتة"
                      >
                        <Printer size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── List Mode (تقسيم نسبي ذكي للأعمدة بنسبة 100%) ── */
        <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap table-fixed">
              <thead className="bg-gradient-to-r from-slate-50/90 via-teal-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                <tr>
                  <th className="w-[5%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                  <th className="w-[32%] px-4 py-4 text-right font-black text-xs text-slate-600">المريض</th>
                  <th className="w-[16%] px-4 py-4 text-right font-black text-xs text-slate-600">رقم الهاتف</th>
                  <th className="w-[19%] px-4 py-4 text-right font-black text-xs text-slate-600">وقت وتاريخ التسجيل</th>
                  <th className="w-[14%] px-4 py-4 text-center font-black text-xs text-slate-600">الحالة</th>
                  <th className="w-[14%] px-4 py-4 text-center font-black text-xs text-slate-600">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/70">
                {filtered.map((v, idx) => {
                  const dateFormatted = formatDateTimeEn(v.created_at);
                  const isResultsReady = v.tabState === 'ready_results';

                  return (
                    <tr
                      key={v.visitId || idx}
                      onClick={() => setSelectedPatientForModal({ id: v.patient_id, patient_id: v.patient_id, full_name: v.full_name, age: v.age, gender: v.gender, phone: v.phone, visit_number: v.visit_number, visitId: v.visitId, is_exempt: v.is_exempt, is_follow_up: v.is_follow_up, is_surgery: v.is_surgery, created_at: v.created_at })}
                      className="hover:bg-teal-50/30 cursor-pointer transition-colors border-b border-slate-100/70 last:border-0 group"
                    >
                      {/* # Number */}
                      <td className="w-[5%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                        {idx + 1}
                      </td>

                      {/* Patient Details with Avatar and Visit Number */}
                      <td className="w-[32%] px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 group-hover:scale-105 transition-transform ${currentTabConfig.avatarTheme}`}
                          >
                            {v.full_name?.charAt(0) ?? '؟'}
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0 text-right" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-black text-slate-800 text-sm group-hover:text-teal-700 transition-colors truncate">
                                {v.full_name}
                              </span>
                              {Boolean(v.is_follow_up) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-emerald-100/75 text-emerald-700 border border-emerald-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                  <RotateCcw size={11} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                                  <span>مراجعة</span>
                                </span>
                              )}
                              {Boolean(v.is_exempt) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-amber-100/75 text-amber-700 border border-amber-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                  <Crown size={11} className="text-amber-600 shrink-0" strokeWidth={2.2} />
                                  <span>إعفاء</span>
                                </span>
                              )}
                              {Boolean(v.is_surgery || v.has_surgeries || v.has_surgery || v.status === 'transferred_to_center' || (Array.isArray(v.surgeries) && v.surgeries.length > 0)) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                  <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                                  <span>عمليات</span>
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-bold text-slate-400 text-right mt-0.5 w-full" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                              <span dir="ltr">{v.visit_number || v.visitId}</span>
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Phone Number */}
                      <td className="w-[16%] px-4 py-4 text-right">
                        <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                          {v.phone ? formatPhoneNumber(v.phone) : '—'}
                        </span>
                      </td>

                      {/* Date & Time */}
                      <td className="w-[19%] px-4 py-4 text-right">
                        <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                          {dateFormatted}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="w-[14%] px-4 py-4 text-center">
                        <div className="flex items-center justify-center">
                          {activeFilter === 'ready_results' || isResultsReady ? (
                            <span className="inline-flex items-center rounded-xl border font-bold shadow-xs whitespace-nowrap select-none transition-all bg-amber-100/90 text-amber-800 border-amber-300/80 text-[11px] px-2.5 py-1 gap-1.5">
                              <span className="relative flex h-2 w-2 flex-shrink-0">
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                              </span>
                              <span>مستعد للدخول</span>
                            </span>
                          ) : (
                            <SmartStatusBadge visit={v} role="secretary" />
                          )}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="w-[14%] px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {v.prescription && (
                            <button
                              type="button"
                              onClick={() => setSelectedVisit(v)}
                              className="p-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200/60 rounded-xl transition-colors shrink-0"
                              title="معاينة الروشتة"
                            >
                              <Printer size={13} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedPatientForModal({ id: v.patient_id, patient_id: v.patient_id, full_name: v.full_name, age: v.age, gender: v.gender, phone: v.phone, visit_number: v.visit_number, visitId: v.visitId, is_exempt: v.is_exempt, is_follow_up: v.is_follow_up, is_surgery: v.is_surgery, created_at: v.created_at })}
                            className="px-3.5 py-1.5 font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs active:scale-95 whitespace-nowrap bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white shadow-teal-500/20 hover:shadow-md hover:shadow-teal-500/30 cursor-pointer"
                            title="فتح الملف الطبي للمريض"
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
      )}

      {/* ── 6. Prescription Modal ── */}
      {selectedVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-200">
          <div className={`bg-white shadow-2xl overflow-hidden flex flex-col transition-all duration-300 animate-in zoom-in-95 duration-200 ${
            isPrescriptionFullscreen ? 'w-screen h-screen rounded-none' : 'w-full max-w-3xl max-h-[90vh] rounded-3xl'
          }`}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3 text-teal-700">
                <FileText size={24} />
                <h2 className="text-lg font-black">معاينة الروشتة الدوائية</h2>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setIsPrescriptionFullscreen(!isPrescriptionFullscreen)} className="p-2 bg-gray-200/50 hover:bg-gray-200 rounded-xl text-gray-500 transition-colors">
                  {isPrescriptionFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                </button>
                <button onClick={() => setSelectedVisit(null)} className="p-2 bg-gray-200/50 hover:bg-gray-200 rounded-xl text-gray-500 transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm max-w-2xl mx-auto relative overflow-hidden">
                {/* Header Banner matching Invoice */}
                <div className="border-b-2 border-sky-600 pb-3 mb-4 text-center">
                  <h2 className="text-sm sm:text-base font-black text-sky-950 mb-2">مركز الدكتور أحمد أنعم لجراحة العظام والمفاصل والتشوهات</h2>
                  <div className="flex items-center justify-between gap-2 text-right">
                    <div className="text-center w-1/3">
                      <p className="text-xs font-black text-sky-950">إشراف د/ أحمد أنعم</p>
                      <p className="text-[10px] font-bold text-slate-500">إستشاري أمراض وجراحة العظام</p>
                    </div>
                    <div className="flex flex-col items-center justify-center w-1/3">
                      <img 
                        src={CLINIC_LOGO_BASE64} 
                        alt="شعار المركز" 
                        className="w-12 h-12 object-contain mb-1" 
                      />
                      <span className="inline-block bg-sky-600 text-white text-[10px] font-black px-3 py-0.5 rounded-full">
                        الوصفة الطبية
                      </span>
                    </div>
                    <div className="text-center w-1/3">
                      <p className="text-xs font-black text-sky-950">د/ هيثم أنعم</p>
                      <p className="text-[10px] font-bold text-slate-500">إستشاري أمراض وجراحة العظام</p>
                    </div>
                  </div>
                </div>

                {/* Patient Meta Strip (Matching Invoice: Name, Rx No, Date - No Age/Gender) */}
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 mb-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-500">اسم المريض:</span>
                    <span className="font-black text-sky-950">{selectedVisit.full_name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-500">رقم الروشتة:</span>
                    <span className="font-black text-sky-700" dir="ltr">RX-{selectedVisit.visit_number || selectedVisit.id || '000'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-500">تاريخ الطباعة:</span>
                    <span className="font-black text-slate-700" dir="ltr">{new Date().toLocaleDateString('en-GB')}</span>
                  </div>
                </div>

                {/* Medications Table / List with Smart Proportions */}
                <div>
                  {selectedVisit.prescription ? (
                    <div className="mt-2">
                      {typeof selectedVisit.prescription === 'string' ? (
                        <div className="text-sm font-medium whitespace-pre-wrap leading-relaxed text-slate-800 bg-slate-50 p-4 rounded-xl border border-slate-100">
                          {selectedVisit.prescription}
                        </div>
                      ) : Array.isArray(selectedVisit.prescription) && selectedVisit.prescription.length > 0 ? (
                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                          <table className="w-full text-right text-xs whitespace-nowrap table-fixed">
                            <colgroup>
                              <col style={{ width: '5%' }} />
                              <col style={{ width: '30%' }} />
                              <col style={{ width: '15%' }} />
                              <col style={{ width: '15%' }} />
                              <col style={{ width: '20%' }} />
                              <col style={{ width: '15%' }} />
                            </colgroup>
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>
                                <th className="px-2 py-2 text-center text-slate-500 font-bold">#</th>
                                <th className="px-3 py-2 text-slate-500 font-bold">اسم الدواء والعلاج</th>
                                <th className="px-2 py-2 text-center text-slate-500 font-bold">الجرعة</th>
                                <th className="px-2 py-2 text-center text-slate-500 font-bold">التكرار</th>
                                <th className="px-2 py-2 text-center text-slate-500 font-bold">التعليمات</th>
                                <th className="px-2 py-2 text-center text-slate-500 font-bold">المدة</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {selectedVisit.prescription.map((rx, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50">
                                  <td className="px-2 py-2 text-center font-bold text-slate-400">{idx + 1}</td>
                                  <td className="px-3 py-2 font-bold text-slate-800">
                                    {rx.medication_name}
                                  </td>
                                  <td className="px-2 py-2 text-center font-bold text-slate-600">{rx.dosage || '—'}</td>
                                  <td className="px-2 py-2 text-center font-bold text-slate-600">{rx.frequency || '—'}</td>
                                  <td className="px-2 py-2 text-center font-medium text-slate-600 truncate" title={rx.instructions}>
                                    {rx.instructions || '—'}
                                  </td>
                                  <td className="px-2 py-2 text-center font-bold text-slate-600 whitespace-nowrap">
                                    {rx.duration || '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-slate-400 py-10 text-center font-bold text-xs">لم يتم تسجيل أدوية في هذه الزيارة</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-400 py-10 text-center font-bold text-xs">لم يتم تسجيل أدوية في هذه الزيارة</p>
                  )}
                </div>

                {/* Footer Strip */}
                <div className="border-t border-slate-200 pt-3 mt-6 text-center text-[10px] text-slate-400 font-bold">
                  الجمهورية اليمنية - تعز - شارع جمال - مقابل مطعم السعيد - فوق (الصيدلية المركزية)
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
              <button onClick={() => setSelectedVisit(null)} className="btn-secondary px-6">إلغاء</button>
              <button onClick={handlePrintPrescription} className="btn-primary px-8 flex items-center gap-2 bg-sky-600 hover:bg-sky-700">
                <Printer size={18} /> طباعة الآن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 7. Historic EMR Modal ── */}
      {selectedPatientForModal && (
        <HistoricEMRModal 
          patient={selectedPatientForModal} 
          onClose={() => setSelectedPatientForModal(null)} 
          token={token} 
          hideFinancials={true}
        />
      )}
    </div>
  );
}
