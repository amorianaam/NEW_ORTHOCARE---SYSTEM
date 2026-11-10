import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePersistentState } from "../hooks/usePersistentState";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Users,
  Search,
  Scissors,
  CheckCircle,
  Stethoscope,
  Grid,
  List,
  Eye,
  Layers,
  Crown,
  RotateCcw,
  Plus,
  X
} from "lucide-react";
import { toast } from "react-toastify";
import axios from "axios";
import useAuthStore from "../store/useAuthStore";
import useSocketStore from "../store/useSocketStore";
import { getSocket } from "../utils/socket";
import PatientQueueCard from "../components/common/PatientQueueCard";
import PatientEMRModal from "../components/common/PatientEMRModal";
import SmartOrderModal from "../components/common/SmartOrderModal";
import SmartStatusBadge from "../components/common/SmartStatusBadge";

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function DoctorQueue() {
  const { token, user } = useAuthStore();
  const lastFetchRef = useRef(0);
  const latestPatientEvent = useSocketStore(state => state.latestPatientEvent);
  const latestLabEvent = useSocketStore(state => state.latestLabEvent);
  const latestRadiologyEvent = useSocketStore(state => state.latestRadiologyEvent);
  const latestSilentUpdate = useSocketStore(state => state.latestSilentUpdate);
  const latestCashierUpdate = useSocketStore(state => state.latestCashierUpdate);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const location = useLocation();
  const navigate = useNavigate();

  // ── Core queue state ───────────────────────────────────────────────────────
  const [queue, setQueue] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workspaceTab, setWorkspaceTab] = useState("waiting_list");
  const [layoutMode, setLayoutMode] = usePersistentState('global_layout_preference', "grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Catalogs & favorites (fed to SmartOrderModal) ─────────────────────────
  const [catalogs, setCatalogs] = useState({
    lab: [], radiology: [], clinical: [], prep: [], medications: [],
  });
  const [favoriteTests, setFavoriteTests] = useState([]);
  const [favoriteMeds, setFavoriteMeds] = useState([]);
  const [bundles, setBundles] = useState([]);

  // ── Patient EMR data (passed as props to PatientEMRModal) ─────────────────
  const [patientHistory, setPatientHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [prescriptionItems, setPrescriptionItems] = useState([]);

  // ── Modal state ────────────────────────────────────────────────────────────
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Data Fetching
  // ─────────────────────────────────────────────────────────────────────────
  const fetchQueue = useCallback(async () => {
    try {
      const res = await axios.get("/api/doctor/queue", { headers });
      setQueue(Array.isArray(res.data) ? res.data : []);
      lastFetchRef.current = Date.now();
    } catch {
      toast.error("فشل تحميل قائمة الانتظار");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchCatalogs = useCallback(async () => {
    try {
      const [lab, rad, clin, prep, meds] = await Promise.all([
        axios.get("/api/catalog/lab", { headers }),
        axios.get("/api/catalog/radiology", { headers }),
        axios.get("/api/admin/catalog/clinical-services", { headers }),
        axios.get("/api/admin/catalog/surgery-prep", { headers }),
        axios.get("/api/admin/catalog/medications", { headers }),
      ]);
      setCatalogs({
        lab:       lab.data  || [],
        radiology: rad.data  || [],
        clinical:  clin.data || [],
        prep:      prep.data || [],
        medications: meds.data || [],
      });
    } catch {
      // Failed to load catalogs
    }
  }, [token]);

  const fetchFavorites = useCallback(async () => {
    try {
      const [testsRes, bundlesRes, medsRes] = await Promise.all([
        axios.get("/api/doctor/favorites/tests",   { headers }),
        axios.get("/api/doctor/favorites/bundles", { headers }),
        axios.get("/api/doctor/favorites/medications", { headers }),
      ]);
      setFavoriteTests(testsRes.data  || []);
      setBundles(bundlesRes.data || []);
      setFavoriteMeds(medsRes.data || []);
    } catch (err) {
      // Failed to load favorites
    }
  }, [headers]);

  useEffect(() => {
    fetchQueue();
    fetchCatalogs();
    if (token) fetchFavorites();
  }, [fetchQueue, fetchCatalogs, fetchFavorites, token]);

  // Zustand store live updates
  const lastEventTsRef = useRef({ patient: 0, lab: 0, rad: 0, silent: 0, cashier: 0 });

  useEffect(() => {
    if (latestPatientEvent?.timestamp && latestPatientEvent.timestamp > lastEventTsRef.current.patient) {
      lastEventTsRef.current.patient = latestPatientEvent.timestamp;
      fetchQueue(true); // silent fetch
    }
  }, [latestPatientEvent, fetchQueue]);

  useEffect(() => {
    if (latestLabEvent?.timestamp && latestLabEvent.timestamp > lastEventTsRef.current.lab) {
      lastEventTsRef.current.lab = latestLabEvent.timestamp;
      fetchQueue(true);
    }
  }, [latestLabEvent, fetchQueue]);

  useEffect(() => {
    if (latestRadiologyEvent?.timestamp && latestRadiologyEvent.timestamp > lastEventTsRef.current.rad) {
      lastEventTsRef.current.rad = latestRadiologyEvent.timestamp;
      fetchQueue(true);
    }
  }, [latestRadiologyEvent, fetchQueue]);

  useEffect(() => {
    if (latestSilentUpdate?.timestamp && latestSilentUpdate.timestamp > lastEventTsRef.current.silent) {
      lastEventTsRef.current.silent = latestSilentUpdate.timestamp;
      if (latestSilentUpdate.type === 'cancellation') {
        const cancelledVisitId = String(latestSilentUpdate.visitId || '');
        const cancelledPatientId = String(latestSilentUpdate.patientId || '');
        if (
          active &&
          (
            (cancelledVisitId && String(active.visitId || active.id) === cancelledVisitId) ||
            (cancelledPatientId && String(active.patient_id || active.patientId) === cancelledPatientId)
          )
        ) {
          setActive(null);
          setIsOrderModalOpen(false);
          toast.warning('تم سحب وإغلاق ملف المريض لأن الزيارة تم إلغاؤها واسترداد رسومها');
        }
      }
      fetchQueue(true);
    }
  }, [latestSilentUpdate, fetchQueue, active]);

  useEffect(() => {
    if (latestCashierUpdate?.timestamp && latestCashierUpdate.timestamp > lastEventTsRef.current.cashier) {
      lastEventTsRef.current.cashier = latestCashierUpdate.timestamp;
      fetchQueue(true);
    }
  }, [latestCashierUpdate, fetchQueue]);

  // ─────────────────────────────────────────────────────────────────────────
  // Patient Selection & EMR data loading
  // ─────────────────────────────────────────────────────────────────────────
  const handleSelectPatient = async (visit, isReadOnly = false) => {
    setActive({ ...visit, is_readonly: isReadOnly });
    setSelectedVisit(null);
    setPrescriptionItems([]);
    setPatientHistory([]);

    // Transition visit to "with_doctor" status
    const validStatuses = [
      "waiting", "awaiting_lab", "awaiting_radiology",
      "pending_payment", "awaiting_service_payment",
      "completed",
    ];
    if (!isReadOnly && validStatuses.includes(visit.status)) {
      try {
        await axios.put(`/api/doctor/visit/${visit.visitId}/start`, {}, { headers });
        setQueue(q =>
          q.map(v => v.visitId === visit.visitId ? { ...v, status: "with_doctor" } : v)
        );
        const socket = getSocket();
        if (socket && visit.visitId) {
          socket.emit('doctor:open-visit', {
            visitId: visit.visitId,
            userId: user?.id
          });
        }
      } catch { /* non-critical */ }
    }

    // Load patient history
    try {
      setHistoryLoading(true);
      const res = await axios.get(
        `/api/doctor/patient/${visit.patient_id}/history`, { headers }
      );
      const history = Array.isArray(res.data) ? res.data : [];
      setPatientHistory(history);
      // Auto-select the matching current visit or the most recent visit
      if (history.length > 0) {
        const matchingCurrent = history.find(h => String(h.id || h.visitId) === String(visit.visitId || visit.id));
        const initialVisit = matchingCurrent || history[0];
        setSelectedVisit(initialVisit);
        if (initialVisit.prescriptionItems && Array.isArray(initialVisit.prescriptionItems) && initialVisit.prescriptionItems.length > 0) {
          setPrescriptionItems(initialVisit.prescriptionItems);
        }
      }
    } catch {
      setPatientHistory([]);
    } finally {
      setHistoryLoading(false);
    }

    // Load existing prescription for this visit if not already loaded from history
    try {
      const prescRes = await axios.get(
        `/api/doctor/visit/${visit.visitId}/prescription`, { headers }
      );
      if (prescRes.data?.items?.length > 0) {
        setPrescriptionItems(prescRes.data.items);
      }
    } catch { /* no prescription yet */ }
  };

  const handleSelectVisit = async (v) => {
    setSelectedVisit(v);
    if (!v) {
      setPrescriptionItems([]);
      return;
    }
    if (v.prescriptionItems && Array.isArray(v.prescriptionItems) && v.prescriptionItems.length > 0) {
      setPrescriptionItems(v.prescriptionItems);
      return;
    }
    const vId = v.visitId || v.id;
    try {
      const prescRes = await axios.get(`/api/doctor/visit/${vId}/prescription`, { headers });
      setPrescriptionItems(prescRes.data?.items || []);
    } catch {
      setPrescriptionItems([]);
    }
  };

  const refreshPatientHistory = async () => {
    if (!active) return;
    try {
      const res = await axios.get(
        `/api/doctor/patient/${active.patient_id}/history`, { headers }
      );
      const history = Array.isArray(res.data) ? res.data : [];
      setPatientHistory(history);
      if (selectedVisit) {
        const updatedVisit = history.find(v => String(v.id || v.visitId) === String(selectedVisit.id || selectedVisit.visitId));
        if (updatedVisit) {
          setSelectedVisit(updatedVisit);
          if (updatedVisit.prescriptionItems && Array.isArray(updatedVisit.prescriptionItems)) {
            setPrescriptionItems(updatedVisit.prescriptionItems);
          }
        }
      }
    } catch {
      console.error('فشل التحديث الصامت للسجل التاريخي');
    }
  };

  // ── Smart Router Radar (Auto-open VIP Cases) ───────────────────────────────
  useEffect(() => {
    if (!loading && location.state?.autoOpenVisitId) {
      const targetVisit = queue.find(v => v.visitId === location.state.autoOpenVisitId);
      if (targetVisit) {
        handleSelectPatient(targetVisit);
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [loading, location.state, queue, navigate, location.pathname]);


  // ── Presence cleanup hook: revert with_doctor when component unmounts or changes active visit
  useEffect(() => {
    const currentVisitId = active?.visitId;
    return () => {
      if (currentVisitId) {
        const socket = getSocket();
        if (socket) {
          socket.emit('doctor:close-visit', { visitId: currentVisitId });
        }
      }
    };
  }, [active?.visitId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Visit Actions
  // ─────────────────────────────────────────────────────────────────────────
  const handleCloseVisit = async () => {
    if (!active) return;
    setSubmitting(true);
    try {
      await axios.put(`/api/doctor/visit/${active.visitId}/close`, {}, { headers });
      toast.success("تم إغلاق الزيارة بنجاح");
      const socket = getSocket();
      if (socket && active.visitId) {
        socket.emit('doctor:close-visit', { visitId: active.visitId });
      }
      setActive(null);
      fetchQueue();
    } catch (err) {
      const serverMsg = err?.response?.data?.message;
      const details   = err?.response?.data?.details;
      let toastMsg = serverMsg || "فشل إغلاق الزيارة";
      if (details) {
        const parts = [];
        if (details.pendingLabs      > 0) parts.push(`${details.pendingLabs} تحليل معلق`);
        if (details.pendingRads      > 0) parts.push(`${details.pendingRads} أشعة معلقة`);
        if (details.pendingClinicals > 0) parts.push(`${details.pendingClinicals} خدمة سريرية معلقة`);
        if (parts.length) toastMsg += ` (${parts.join(' · ')})`;
      }
      toast.error(toastMsg, { autoClose: 6000 });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReferSurgery = async () => {
    if (!active) return;
    setSubmitting(true);
    try {
      await axios.put(`/api/doctor/visit/${active.visitId}/refer-surgery`, {}, { headers });
      toast.success("تم إحالة المريض للعمليات");
      setActive(null);
      fetchQueue();
    } catch {
      toast.error("فشل الإحالة");
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel a single service order (lab / radiology / clinical)
  const handleCancelOrder = async (itemId, itemType, item) => {
    const resolvedType = itemType 
      || item?.categoryKey 
      || item?.svcType
      || (item?.lab_test_id ? 'lab' : item?.radiology_test_id ? 'radiology' : item?.service_id ? 'clinical' : null);
    if (!resolvedType || !itemId) {
      toast.error("تعذر تحديد نوع الطلب لإلغائه");
      return;
    }
    try {
      await axios.delete(`/api/doctor/order-service/${resolvedType}/${itemId}`, { headers });
      toast.success("تم إلغاء الطلب بنجاح");
      // Reload patient history to reflect the cancelled item
      if (active?.patient_id) {
        try {
          const res = await axios.get(
            `/api/doctor/patient/${active.patient_id}/history`, { headers }
          );
          const history = Array.isArray(res.data) ? res.data : [];
          setPatientHistory(history);
          // Re-select the same visit to refresh the table
          if (selectedVisit) {
            const refreshed = history.find(
              v => String(v.id) === String(selectedVisit.id)
            );
            if (refreshed) setSelectedVisit(refreshed);
          }
        } catch { /* non-critical */ }
      }
    } catch (err) {
      const msg = err?.response?.data?.message || "فشل إلغاء الطلب";
      toast.error(msg);
    }
  };

  const toggleFavoriteTest = async (item, svcType) => {
    const isFav = favoriteTests.some(
      f => f.test_id === item.id && f.test_type === svcType
    );
    try {
      if (isFav) {
        await axios.delete(
          `/api/doctor/favorites/tests/type/${svcType}/id/${item.id}`, { headers }
        );
      } else {
        await axios.post(
          "/api/doctor/favorites/tests",
          { testId: item.id, testType: svcType },
          { headers }
        );
      }
      const res = await axios.get("/api/doctor/favorites/tests", { headers });
      setFavoriteTests(res.data || []);
    } catch {
      toast.error("فشل تحديث المفضلة");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Queue List Segmentation
  // ─────────────────────────────────────────────────────────────────────────
  const hasActiveOrders = useCallback((v) => {
    const activeLabs = (v.labRequests || []).filter(r => r.status !== "cancelled" && r.status !== "refunded");
    const activeRads = (v.radiologyRequests || []).filter(r => r.status !== "cancelled" && r.status !== "refunded");
    const activeClins = (v.clinicalRequests || []).filter(r => r.status !== "cancelled" && r.status !== "refunded" && r.status !== "completed");
    return activeLabs.length > 0 || activeRads.length > 0 || activeClins.length > 0;
  }, []);

  const activeWaitingList = useMemo(() => queue.filter(v =>
    v.status !== "completed" && v.status !== "cancelled" &&
    !hasActiveOrders(v)
  ), [queue, hasActiveOrders]);

  const pendingTrackingList = useMemo(() => queue.filter(v =>
    v.status !== "completed" && v.status !== "cancelled" &&
    hasActiveOrders(v)
  ), [queue, hasActiveOrders]);

  const completedList = useMemo(() => queue.filter(v => v.status === "completed"), [queue]);

  const filteredPatients = useMemo(() => {
    const list =
      workspaceTab === "waiting_list"    ? activeWaitingList  :
      workspaceTab === "pending_tracking"? pendingTrackingList :
      completedList;
    if (!searchTerm) return list;
    const q = searchTerm.toLowerCase();
    return list.filter(v =>
      v.full_name?.toLowerCase().includes(q) ||
      v.visit_number?.toLowerCase().includes(q) ||
      (v.phone && String(v.phone).toLowerCase().includes(q))
    );
  }, [workspaceTab, searchTerm, activeWaitingList, pendingTrackingList, completedList]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6" dir="rtl">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <Stethoscope size={20} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-gray-800 flex items-center gap-2">
              مساحة العمل السريرية اليومية
            </h1>
            <p className="text-xs text-gray-400 mt-0.5 font-semibold">
              إدارة قائمة الانتظار، طلبات الخدمات، وتتبع نتائج الفحوصات والزيارات الجارية لحظياً.
            </p>
          </div>
        </div>
      </div>

      {/* ── Centered Workspace Tab Selector ──────────────────────────────── */}
      <div className="flex justify-center w-full">
        <div className="flex p-1.5 gap-2 bg-gray-100/90 backdrop-blur-md rounded-2xl border border-gray-200/80 max-w-2xl w-full shadow-xs">
          {[
            { id: "waiting_list",    label: "قائمة الانتظار",    count: activeWaitingList.length,   color: "bg-blue-100 text-blue-700",     activeBorder: "border-b-blue-600"   },
            { id: "pending_tracking",label: "متابعة الإجراءات",   count: pendingTrackingList.length, color: "bg-rose-100 text-rose-700",     activeBorder: "border-b-rose-600"   },
            { id: "completed_list",  label: "تمت المعاينة",       count: completedList.length,       color: "bg-emerald-100 text-emerald-700", activeBorder: "border-b-emerald-600" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setWorkspaceTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-black transition-all border-b-2 ${
                workspaceTab === tab.id
                  ? `bg-white text-blue-700 shadow-sm border border-gray-100 ${tab.activeBorder}`
                  : "text-gray-500 hover:bg-white/50 hover:text-gray-700 border-transparent"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${tab.color}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sub-header: Tab Title, Info & Cashier-Style Search Bar ────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2 flex-shrink-0">
        <div>
          <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
            <span className={`w-1.5 h-6 rounded-full ${
              workspaceTab === "waiting_list" ? "bg-blue-500" :
              workspaceTab === "pending_tracking" ? "bg-rose-500" :
              "bg-emerald-500"
            }`} />
            {workspaceTab === "waiting_list" ? "قائمة الانتظار النشطة" :
             workspaceTab === "pending_tracking" ? "متابعة إجراءات المرضى" :
             "سجل المعاينات المكتملة"}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5 font-semibold">
            {searchTerm
              ? `${filteredPatients.length} من أصل ${
                  workspaceTab === "waiting_list" ? activeWaitingList.length :
                  workspaceTab === "pending_tracking" ? pendingTrackingList.length :
                  completedList.length
                } مريض`
              : `${
                  workspaceTab === "waiting_list" ? activeWaitingList.length :
                  workspaceTab === "pending_tracking" ? pendingTrackingList.length :
                  completedList.length
                } مريض ${
                  workspaceTab === "waiting_list" ? "بانتظار المعاينة" :
                  workspaceTab === "pending_tracking" ? "قيد المتابعة" :
                  "تمت معاينتهم"
                }`}
          </p>
        </div>

        {/* ── Search Input (Cashier EntryFeesTab Style) & Layout Switcher ── */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-80 md:w-96">
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
              <Search size={16} strokeWidth={2.2} />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث بالاسم، رقم الهاتف، أو رقم الزيارة..."
              className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-blue-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200/60 shadow-xs transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
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
              onClick={() => setLayoutMode("grid")}
              className={`p-1.5 rounded-lg transition-all ${
                layoutMode === "grid" ? "bg-white text-blue-700 shadow-sm" : "text-gray-400 hover:text-gray-600"
              }`}
              title="عرض كشبكة"
            >
              <Grid size={16} />
            </button>
            <button
              onClick={() => setLayoutMode("list")}
              className={`p-1.5 rounded-lg transition-all ${
                layoutMode === "list" ? "bg-white text-blue-700 shadow-sm" : "text-gray-400 hover:text-gray-600"
              }`}
              title="عرض كقائمة"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Patient Cards / Table ─────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-300">
            {searchTerm ? <Search size={32} strokeWidth={1.5} /> : <Users size={32} strokeWidth={1.5} />}
          </div>
          <h3 className="text-base font-black text-gray-700">
            {searchTerm ? `لا توجد نتائج مطابقة للبحث "${searchTerm}"` : "لا توجد حالات في هذه القائمة حالياً"}
          </h3>
          <p className="text-gray-400 text-xs mt-1.5 font-semibold">
            {searchTerm ? "تأكد من كتابة الاسم أو رقم الملف بشكل صحيح." : "تأكد من اختيار التبويب الصحيح أو انتظر وصول حالات جديدة."}
          </p>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="mt-3 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 transition-colors"
            >
              مسح كلمة البحث
            </button>
          )}
        </div>
      ) : layoutMode === "grid" ? (
        /* ── Grid Mode ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPatients.map((visit, idx) => (
            <PatientQueueCard
              key={visit.visitId}
              index={idx + 1}
              visit={visit}
              workspaceTab={workspaceTab}
              onClick={() => handleSelectPatient(visit)}
              colorTheme={
                workspaceTab === "waiting_list"     ? "blue"    :
                workspaceTab === "pending_tracking" ? "rose"    :
                "emerald"
              }
            />
          ))}
        </div>
      ) : (
        /* ── List Mode ── */
        <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap table-fixed">
              <thead className="bg-gradient-to-r from-slate-50/90 via-blue-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                <tr>
                  <th className="w-[5%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                  <th className="w-[31%] px-4 py-4 text-right font-black text-xs text-slate-600">المريض</th>
                  <th className="w-[15%] px-4 py-4 text-center font-black text-xs text-slate-600">إجمالي الزيارات</th>
                  <th className="w-[18%] px-4 py-4 text-right font-black text-xs text-slate-600">وقت وتاريخ التسجيل</th>
                  <th className="w-[16%] px-4 py-4 text-center font-black text-xs text-slate-600">الحالة</th>
                  <th className="w-[15%] px-4 py-4 text-center font-black text-xs text-slate-600">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/70">
                {filteredPatients.map((visit, idx) => {
                  const dateFormatted = visit.created_at
                    ? `${new Date(visit.created_at).toLocaleDateString("en-GB")} - ${new Date(visit.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}`
                    : "--";

                  return (
                    <tr
                      key={visit.visitId}
                      onClick={() => handleSelectPatient(visit)}
                      className="hover:bg-blue-50/30 cursor-pointer transition-colors border-b border-slate-100/70 last:border-0 group"
                    >
                      {/* # Number */}
                      <td className="w-[5%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                        {idx + 1}
                      </td>

                      {/* Patient Details */}
                      <td className="w-[31%] px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 group-hover:scale-105 transition-transform ${
                              workspaceTab === "waiting_list"
                                ? "bg-gradient-to-br from-blue-50 to-blue-100/80 text-blue-700 border border-blue-200/50"
                                : workspaceTab === "pending_tracking"
                                ? "bg-gradient-to-br from-rose-50 to-rose-100/80 text-rose-700 border border-rose-200/50"
                                : "bg-gradient-to-br from-emerald-50 to-emerald-100/80 text-emerald-700 border border-emerald-200/50"
                            }`}
                          >
                            {visit.full_name?.charAt(0)}
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0 text-right" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-black text-slate-800 text-sm group-hover:text-blue-700 transition-colors truncate">
                                {visit.full_name}
                              </span>
                              {Boolean(visit.is_follow_up) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-emerald-100/75 text-emerald-700 border border-emerald-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                  <RotateCcw size={11} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                                  <span>مراجعة</span>
                                </span>
                              )}
                              {Boolean(visit.is_exempt) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-amber-100/75 text-amber-700 border border-amber-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                  <Crown size={11} className="text-amber-600 shrink-0" strokeWidth={2.2} />
                                  <span>إعفاء</span>
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
                      <td className="w-[15%] px-4 py-4 text-center">
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
                      <td className="w-[18%] px-4 py-4 text-right">
                        <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                          {dateFormatted}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="w-[16%] px-4 py-4 text-center">
                        <div className="flex items-center justify-center">
                          {workspaceTab === "waiting_list" ? (
                            <SmartStatusBadge visit={{ ...visit, status: "waiting" }} role="doctor" />
                          ) : workspaceTab === "completed_list" ? (
                            <SmartStatusBadge visit={{ ...visit, status: "completed" }} role="doctor" />
                          ) : (
                            <SmartStatusBadge visit={visit} role="doctor" />
                          )}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="w-[15%] px-4 py-4 text-center">
                        <div className="flex items-center justify-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectPatient(visit);
                            }}
                            className="px-4 py-2 font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-500/20 hover:shadow-md hover:shadow-blue-500/30"
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

      {/* ── PatientEMRModal ──────────────────────────────────────────────── */}
      {active && (
        <PatientEMRModal
          isOpen={!!active}
          onClose={() => { setActive(null); fetchQueue(); }}
          closeOnBackdropClick={false}
          patient={active}
          readOnly={active.is_readonly || active.status === 'cancelled' || selectedVisit?.status === 'cancelled'}
          patientHistory={patientHistory}
          selectedVisit={selectedVisit}
          onSelectVisit={handleSelectVisit}
          onRefresh={() => { refreshPatientHistory(); fetchQueue(true); }}
          prescriptionItems={prescriptionItems}
          onFinishVisit={active.is_readonly || active.status === 'cancelled' || selectedVisit?.status === 'cancelled' ? null : handleCloseVisit}
          onReferToSurgery={!active.is_readonly && active.status !== 'cancelled' && selectedVisit?.status !== 'cancelled' ? handleReferSurgery : undefined}
          onCancelOrder={!active.is_readonly && active.status !== 'cancelled' && selectedVisit?.status !== 'cancelled' ? handleCancelOrder : undefined}
          onRequestServices={!active.is_readonly && active.status !== 'cancelled' && selectedVisit?.status !== 'cancelled' ? () => setIsOrderModalOpen(true) : undefined}
          visit={active}
          favoriteMeds={favoriteMeds}
          catalogs={catalogs}
          onPrescriptionSave={() => fetchQueue()}
          renderActiveActions={
            !active.is_readonly && active.status !== 'cancelled' && selectedVisit?.status !== 'cancelled'
              ? () => (
                  <button
                    onClick={() => setIsOrderModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:from-blue-800 active:to-indigo-800 text-white font-black text-xs rounded-xl transition-all shadow-xs hover:shadow-sm active:scale-95 whitespace-nowrap cursor-pointer"
                  >
                    <Plus size={13} strokeWidth={2.5} />
                    <span>طلب خدمات</span>
                  </button>
                )
              : null
          }
        />
      )}

      {/* ── SmartOrderModal ──────────────────────────────────────────────── */}
      <SmartOrderModal
        isOpen={isOrderModalOpen}
        onClose={() => {
          setIsOrderModalOpen(false);
          // Refresh queue after orders submitted so pending_tracking updates
          if (active) fetchQueue();
        }}
        closeOnBackdropClick={false}
        onOrderSuccess={() => refreshPatientHistory()}
        visit={selectedVisit ? { ...active, ...selectedVisit, full_name: active?.full_name || selectedVisit?.full_name, patient_name: active?.patient_name || selectedVisit?.patient_name, is_exempt: active?.is_exempt ?? selectedVisit?.is_exempt } : active}
        catalogs={catalogs}
        favoriteTests={favoriteTests}
        bundles={bundles}
        onToggleFavorite={toggleFavoriteTest}
        token={token}
      />
    </div>
  );
}
