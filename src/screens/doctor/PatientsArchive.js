import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { usePersistentState } from "../../hooks/usePersistentState";
import PatientQueueCard from "../../components/common/PatientQueueCard";
import PatientEMRModal from "../../components/common/PatientEMRModal";
import {
  Search,
  List,
  Grid,
  History,
  ChevronRight,
  ChevronLeft,
  Crown,
  RotateCcw,
  Scissors,
  Eye,
  X,
  FolderOpen,
  CalendarCheck,
  UserCheck,
  Filter,
  Users,
  ChevronDown,
  Check,
} from "lucide-react";
import { toast } from "react-toastify";
import Fuse from "fuse.js";
import axios from "axios";
import useAuthStore from "../../store/useAuthStore";
import useSocketStore from "../../store/useSocketStore";
import { useLocation } from "react-router-dom";
import { toYemenDate, getShiftStartOfDay, getShiftEndOfDay, getShiftWeekStartDate, getShiftMonthStartDate } from "../../utils/shiftHelpers";

const PAGE_SIZE = 20;

const toEnglishDigits = (val) =>
  String(val ?? "")
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٫،]/g, ".");

const getMatchedVisit = (patient, searchQ) => {
  if (!searchQ || (!patient?.all_visit_numbers && !patient?.visit_number))
    return null;
  const rawClean = toEnglishDigits(searchQ.trim());
  const cleanQ = rawClean.replace(/^#+/, "").trim().toLowerCase();
  if (!cleanQ) return null;

  // If search query directly matches displayed visit_number, no need for previous visit indicator
  const latestClean = String(patient.visit_number || patient.visit_id || "")
    .replace(/^#+/, "")
    .trim()
    .toLowerCase();
  if (latestClean && latestClean === cleanQ) {
    return null;
  }

  // Check all previous visit numbers / ids
  const combinedVisits =
    `${patient.all_visit_numbers || ""}, ${patient.all_visit_ids || ""}`
      .split(/[,\s]+/)
      .map((v) => v.replace(/^#+/, "").trim())
      .filter(Boolean);

  const matched = combinedVisits.find(
    (v) =>
      v.toLowerCase() === cleanQ ||
      (cleanQ.length >= 2 && v.toLowerCase().includes(cleanQ)),
  );
  return matched ? matched.replace(/^#+/, "") : null;
};

export default function PatientsArchive() {
  const { token } = useAuthStore();
  const headers = { Authorization: `Bearer ${token}` };

  // Core Data
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  const latestPatientEvent = useSocketStore(
    (state) => state.latestPatientEvent,
  );
  const lastFetchRef = useRef(0);
  const location = useLocation();

  // Search & Filters
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all"); // 'all' | 'today' | 'week' | 'month' | 'custom'
  const [caseTypeFilter, setCaseTypeFilter] = useState("all"); // 'all' | 'surgeries' | 'exempt' | 'review' | 'regular'
  const [showCaseTypeMenu, setShowCaseTypeMenu] = useState(false);
  const [customRange, setCustomRange] = useState({ start: "", end: "" });
  const [layoutMode, setLayoutMode] = usePersistentState(
    "global_layout_preference",
    "grid",
  ); // 'grid' | 'list'
  const [page, setPage] = useState(1);

  // Selected EMR Patient View
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientHistory, setPatientHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [prescriptionItems, setPrescriptionItems] = useState([]);
  const [loadingPrescription, setLoadingPrescription] = useState(false);

  // ─── Fetch All Patients ──────────────────────────────────────────
  const fetchPatients = useCallback(
    async (silent = false) => {
      if (!silent && patients.length === 0) setLoading(true);
      try {
        const res = await axios.get("/api/patients", { headers });
        setPatients(Array.isArray(res.data) ? res.data : []);
        lastFetchRef.current = Date.now();
      } catch {
        if (!silent) toast.error("فشل تحميل أرشيف المرضى");
      } finally {
        if (!silent || loading) setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  useEffect(() => {
    if (
      latestPatientEvent?.timestamp &&
      latestPatientEvent.timestamp > lastFetchRef.current
    ) {
      fetchPatients(true);
    }
  }, [latestPatientEvent]);

  useEffect(() => {
    if (location.state?.autoOpenPatientId && patients.length > 0) {
      const patientToOpen = patients.find(
        (p) => p.id === location.state.autoOpenPatientId,
      );
      if (patientToOpen) {
        setSelectedPatient(patientToOpen);
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, patients]);

  // ─── 1. Temporal/Date Filtering (Day begins at 03:00 AM Yemen Time) ──
  const timeFilteredPatients = useMemo(() => {
    let result = patients;
    const now = new Date();

    if (dateFilter === "today") {
      const shiftStart = getShiftStartOfDay(now);
      const shiftEnd = getShiftEndOfDay(now);
      result = result.filter((p) => {
        if (p.today_visits_count > 0) return true;
        const rawDate = p.last_visit_date || p.created_at;
        if (!rawDate) return false;
        const pDate = toYemenDate(rawDate);
        return pDate >= shiftStart && pDate <= shiftEnd;
      });
    } else if (dateFilter === "week") {
      const shiftEnd = getShiftEndOfDay(now);
      const shiftWeekStart = getShiftWeekStartDate(now);
      result = result.filter((p) => {
        const rawDate = p.last_visit_date || p.created_at;
        if (!rawDate) return false;
        const pDate = toYemenDate(rawDate);
        return pDate >= shiftWeekStart && pDate <= shiftEnd;
      });
    } else if (dateFilter === "month") {
      const shiftEnd = getShiftEndOfDay(now);
      const shiftMonthStart = getShiftMonthStartDate(now);
      result = result.filter((p) => {
        const rawDate = p.last_visit_date || p.created_at;
        if (!rawDate) return false;
        const pDate = toYemenDate(rawDate);
        return pDate >= shiftMonthStart && pDate <= shiftEnd;
      });
    } else if (
      dateFilter === "custom" &&
      customRange.start &&
      customRange.end
    ) {
      const [sY, sM, sD] = customRange.start.split("-").map(Number);
      const start = new Date(sY, sM - 1, sD, 3, 0, 0, 0);

      const [eY, eM, eD] = customRange.end.split("-").map(Number);
      const end = new Date(eY, eM - 1, eD + 1, 2, 59, 59, 999);

      result = result.filter((p) => {
        const rawDate = p.last_visit_date || p.created_at;
        if (!rawDate) return false;
        const pDate = toYemenDate(rawDate);
        return pDate >= start && pDate <= end;
      });
    }

    return result;
  }, [patients, dateFilter, customRange]);

  // ─── 2. Quick KPIs & Statistics (derived from timeFilteredPatients) ──
  const stats = useMemo(() => {
    const list = timeFilteredPatients;
    let totalVisits = 0;
    let regularVisits = 0;
    let reviewVisits = 0;
    let exemptVisits = 0;

    list.forEach((p) => {
      const tv = Number(p.total_visits) || 1;
      const reg =
        Number(p.regular_visits_count) ||
        (Number(p.is_exempt) || Number(p.is_follow_up) ? 0 : 1);
      const rev = Number(p.reviews_count) || (Number(p.is_follow_up) ? 1 : 0);
      const ex = Number(p.exempts_count) || (Number(p.is_exempt) ? 1 : 0);

      totalVisits += tv;
      regularVisits += reg;
      reviewVisits += rev;
      exemptVisits += ex;
    });

    return {
      total: list.length,
      totalVisits,
      regularVisits,
      reviewVisits,
      exemptVisits,
    };
  }, [timeFilteredPatients]);

  // ─── 3. Helper Functions & Counts for Case Type Filtering ─────────
  const isPatientSurgery = useCallback((p) => {
    if (
      Number(p.is_surgery) === 1 ||
      p.visit_status === "transferred_to_center" ||
      p.status === "transferred_to_center"
    ) {
      return true;
    }
    if (dateFilter === "all" && Number(p.surgeries_count) > 0) return true;
    return false;
  }, [dateFilter]);

  const isPatientExempt = useCallback((p) => {
    if (Number(p.is_exempt) === 1) return true;
    if (dateFilter === "all" && Number(p.exempts_count) > 0) return true;
    return false;
  }, [dateFilter]);

  const isPatientReview = useCallback((p) => {
    if (Number(p.is_follow_up) === 1) return true;
    if (dateFilter === "all" && Number(p.reviews_count) > 0) return true;
    return false;
  }, [dateFilter]);

  const isPatientRegular = useCallback((p) => {
    return !isPatientSurgery(p) && !isPatientExempt(p) && !isPatientReview(p);
  }, [isPatientSurgery, isPatientExempt, isPatientReview]);

  const caseTypeMenuOptions = useMemo(
    () => [
      { id: "all", label: "كافة الحالات", icon: Users },
      { id: "surgeries", label: "مرضى العمليات", icon: Scissors },
      { id: "exempt", label: "حالات الإعفاء", icon: Crown },
      { id: "review", label: "حالات المراجعة", icon: RotateCcw },
      { id: "regular", label: "الحالات النظامية", icon: UserCheck },
    ],
    [],
  );

  // ─── 4. Case Type & Search Query Filter (applied on timeFilteredPatients) ────────
  const filteredPatients = useMemo(() => {
    let result = timeFilteredPatients;

    if (caseTypeFilter === "surgeries") {
      result = result.filter(isPatientSurgery);
    } else if (caseTypeFilter === "exempt") {
      result = result.filter(isPatientExempt);
    } else if (caseTypeFilter === "review") {
      result = result.filter(isPatientReview);
    } else if (caseTypeFilter === "regular") {
      result = result.filter(isPatientRegular);
    }

    if (query.trim()) {
      const rawClean = toEnglishDigits(query.trim());
      const cleanQ = rawClean.replace(/^#+/, "").trim();
      const cleanQLower = cleanQ.toLowerCase();

      const directMatches = new Set();
      const directList = [];

      result.forEach((p) => {
        const allVisitsStr =
          `${p.visit_number || ""} ${p.visit_id || ""} ${p.all_visit_numbers || ""} ${p.all_visit_ids || ""}`.toLowerCase();
        const visitTokens = allVisitsStr.split(/[,\s]+/).filter(Boolean);
        const hasVisitMatch = visitTokens.some(
          (v) =>
            v === cleanQLower ||
            (cleanQLower.length >= 2 && v.includes(cleanQLower)),
        );

        const phoneStr = String(p.phone || "").replace(/\s+/g, "");
        const hasPhoneMatch = phoneStr.includes(cleanQLower);

        const nameStr = String(p.full_name || "").toLowerCase();
        const hasNameMatch = nameStr.includes(cleanQLower);

        if (hasVisitMatch || hasPhoneMatch || hasNameMatch) {
          directMatches.add(p.id);
          directList.push(p);
        }
      });

      const fuse = new Fuse(result, {
        keys: [
          { name: "full_name", weight: 0.4 },
          { name: "visit_number", weight: 0.3 },
          { name: "all_visit_numbers", weight: 0.35 },
          { name: "phone", weight: 0.25 },
        ],
        threshold: 0.35,
      });
      const fuzzyResults = fuse.search(cleanQ).map((r) => r.item);

      const combined = [...directList];
      fuzzyResults.forEach((item) => {
        if (!directMatches.has(item.id)) {
          combined.push(item);
        }
      });
      result = combined;
    }

    return result;
  }, [
    timeFilteredPatients,
    caseTypeFilter,
    query,
    isPatientSurgery,
    isPatientExempt,
    isPatientReview,
    isPatientRegular,
  ]);

  // Pagination
  const totalPages = Math.ceil(filteredPatients.length / PAGE_SIZE);
  const paginatedPatients = useMemo(() => {
    return filteredPatients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [filteredPatients, page]);

  // Reset all filters
  const handleResetFilters = () => {
    setQuery("");
    setDateFilter("all");
    setCaseTypeFilter("all");
    setShowCaseTypeMenu(false);
    setCustomRange({ start: "", end: "" });
    setPage(1);
    toast.info("تم إعادة تعيين فلاتر البحث");
  };

  // ─── Historic EMR Loading ─────────────────────────────────────────
  const handleOpenEMR = async (patient, targetVisitNumberOrId = null) => {
    setSelectedPatient(patient);
    setPatientHistory([]);
    setSelectedVisit(null);
    setPrescriptionItems([]);

    try {
      setHistoryLoading(true);
      const res = await axios.get(`/api/doctor/patient/${patient.id}/history`, {
        headers,
      });
      const visits = Array.isArray(res.data) ? res.data : [];
      setPatientHistory(visits);

      // Auto-select target visit if searched, otherwise the latest visit
      if (visits.length > 0) {
        let target = visits[0];
        if (targetVisitNumberOrId) {
          const cleanTarget = String(targetVisitNumberOrId)
            .replace(/^#+/, "")
            .trim()
            .toLowerCase();
          const matched = visits.find(
            (v) =>
              String(v.visit_number || "")
                .replace(/^#+/, "")
                .trim()
                .toLowerCase() === cleanTarget ||
              String(v.id || "")
                .trim()
                .toLowerCase() === cleanTarget,
          );
          if (matched) target = matched;
        }
        handleSelectVisit(target);
      }
    } catch {
      toast.error("فشل تحميل السجل التاريخي للمريض");
    } finally {
      setHistoryLoading(false);
    }
  };

  const refreshPatientHistory = async () => {
    if (!selectedPatient) return;
    try {
      const res = await axios.get(
        `/api/doctor/patient/${selectedPatient.id}/history`,
        { headers },
      );
      const visits = Array.isArray(res.data) ? res.data : [];
      setPatientHistory(visits);
      if (selectedVisit) {
        const updatedVisit = visits.find((v) => v.id === selectedVisit.id);
        if (updatedVisit) setSelectedVisit(updatedVisit);
      }
    } catch {
      console.error("فشل التحديث الصامت للسجل التاريخي");
    }
  };

  const handleSelectVisit = async (visit) => {
    setSelectedVisit(visit);
    setPrescriptionItems([]);
    setLoadingPrescription(true);

    try {
      const prescRes = await axios.get(
        `/api/doctor/visit/${visit.id}/prescription`,
        { headers },
      );
      if (prescRes.data && prescRes.data.items) {
        setPrescriptionItems(prescRes.data.items);
      }
    } catch {
      setPrescriptionItems([]);
    } finally {
      setLoadingPrescription(false);
    }
  };

  const handlePrintPrescription = () => {
    if (!selectedVisit) return;
    const printContent = document.getElementById("print-area").innerHTML;
    const originalContent = document.body.innerHTML;

    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html>
        <head>
          <title>طباعة الوصفة الطبية</title>
          <style>
            body { font-family: 'Arial', sans-serif; direction: rtl; text-align: right; padding: 40px; }
            .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; text-align: center; }
            .title { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
            .patient-info { display: grid; grid-cols: 2; gap: 15px; margin-bottom: 30px; background: #f9f9f9; padding: 15px; border-radius: 8px; }
            .rx-title { font-size: 20px; font-weight: bold; color: #1e3a8a; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 15px; }
            .item { margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #eee; }
            .footer { margin-top: 50px; text-align: center; border-top: 1px solid #ddd; padding-top: 15px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          ${printContent}
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* ── 1. Page Header Banner (Matching Secretary PatientsList & Doctor Blue Palette) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 flex-shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-800 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <History size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800">
              أرشيف المرضى والزيارات السابقة
            </h1>
            <p className="text-sm font-bold text-gray-500 mt-0.5">
              البحث في السجلات الطبية التاريخية، متابعة الحالات السابقة،
              واستعراض ملفات المرضى
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white px-4 py-2 rounded-2xl border border-slate-200/80 shadow-xs text-sm font-bold text-slate-600 flex items-center gap-2">
            <FolderOpen size={16} className="text-blue-600 shrink-0" />
            <span>إجمالي ملفات المرضى:</span>
            <span className="text-blue-700 font-black text-lg" dir="ltr">
              {stats.total.toLocaleString("en-US")}
            </span>
            <span className="text-xs font-bold text-slate-400">ملف</span>
          </div>
        </div>
      </div>

      {/* ── 2. Quick Stats Grid (Doctor Dashboard Style) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full flex-shrink-0">
        {[
          {
            label: "إجمالي الزيارات",
            value: stats.totalVisits,
            unit: "زيارة",
            sub: ` كافة الزيارات والمعاينات لـ ${stats.total} مريض`,
            icon: CalendarCheck,
            color: "text-purple-600",
            bg: "bg-purple-100",
            border: "border-purple-200",
          },
          {
            label: "الكشوفات النظامية",
            value: stats.regularVisits,
            unit: "زيارة",
            sub: "معاينات مسددة لرسوم دخول العيادة",
            icon: UserCheck,
            color: "text-blue-600",
            bg: "bg-blue-100",
            border: "border-blue-200",
          },
          {
            label: "المراجعات الطبية",
            value: stats.reviewVisits,
            unit: "مراجعة",
            sub: "مراجعات لمتابعة الخطة العلاجية",
            icon: RotateCcw,
            color: "text-emerald-600",
            bg: "bg-emerald-100",
            border: "border-emerald-200",
          },
          {
            label: "حالات الإعفاء",
            value: stats.exemptVisits,
            unit: "إعفاء",
            sub: "معاينات إنسانية معفاة بقرار الطبيب",
            icon: Crown,
            color: "text-amber-600",
            bg: "bg-amber-100",
            border: "border-amber-200",
          },
        ]
          .filter((s) => Number(s.value || 0) > 0)
          .map((s, i) => (
          <div
            key={i}
            className={`p-4 rounded-2xl border ${s.border} bg-white shadow-sm hover:shadow-md transition-shadow duration-200 relative overflow-hidden flex flex-col justify-between isolate group`}>
            <div
              className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${s.bg} to-transparent opacity-50 rounded-bl-full z-[-1] transition-transform duration-500 group-hover:scale-110`}
            />
            <div className="flex justify-between items-start mb-3">
              <div
                className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center shadow-sm transition-transform group-hover:scale-105`}>
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
                  dir="ltr">
                  <span className="text-xs font-bold text-gray-400 uppercase">
                    {s.unit}
                  </span>
                  <span>{s.value}</span>
                </p>
              )}
              {s.sub && (
                <p
                  className="text-[10px] text-gray-400 font-semibold mt-1 truncate"
                  title={s.sub}>
                  {s.sub}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Advanced Filter Toolbar */}
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
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="بحث بالاسم، رقم الهاتف، أو رقم الزيارة..."
              className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-blue-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200/60 shadow-xs transition-all"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  setPage(1);
                }}
                className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                title="مسح البحث">
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
                { id: "all", label: "الكل" },
                { id: "today", label: "اليوم" },
                { id: "week", label: "هذا الأسبوع" },
                { id: "month", label: "هذا الشهر" },
                { id: "custom", label: "تاريخ مخصص" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setDateFilter(f.id);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-bold ${
                    dateFilter === f.id
                      ? "bg-white text-blue-700 shadow-xs"
                      : "hover:bg-white/40"
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Case Type Dropdown (مطابق لقائمة نوع الحركة في صفحة التقارير المالية للمحاسب) */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowCaseTypeMenu(!showCaseTypeMenu)}
                className={`h-10 px-3.5 rounded-2xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                  caseTypeFilter !== "all"
                    ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                    : "bg-white text-slate-600 border-slate-200/90 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                {(() => {
                  const ActiveIcon =
                    caseTypeFilter === "surgeries"
                      ? Scissors
                      : caseTypeFilter === "exempt"
                      ? Crown
                      : caseTypeFilter === "review"
                      ? RotateCcw
                      : caseTypeFilter === "regular"
                      ? UserCheck
                      : Users;
                  return (
                    <ActiveIcon
                      size={14}
                      className={
                        caseTypeFilter !== "all"
                          ? "text-blue-600"
                          : "text-slate-400"
                      }
                    />
                  );
                })()}
                <span>
                  {caseTypeFilter === "all"
                    ? "نوع الحالة"
                    : caseTypeFilter === "surgeries"
                    ? "مرضى العمليات"
                    : caseTypeFilter === "exempt"
                    ? "حالات الإعفاء"
                    : caseTypeFilter === "review"
                    ? "حالات المراجعة"
                    : "الحالات النظامية"}
                </span>
                <ChevronDown
                  size={14}
                  className={`text-slate-400 transition-transform duration-200 ${
                    showCaseTypeMenu ? "rotate-180" : ""
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
                    {caseTypeMenuOptions.map((item) => (
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
                            ? "bg-blue-50 text-blue-700 font-black"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <item.icon
                            size={13}
                            className={
                              caseTypeFilter === item.id
                                ? "text-blue-600"
                                : "text-slate-400"
                            }
                          />
                          <span>{item.label}</span>
                        </div>
                        {caseTypeFilter === item.id && (
                          <Check size={13} className="text-blue-600 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shrink-0">
              <button
                onClick={() => setLayoutMode("grid")}
                className={`p-1.5 rounded-lg transition-all ${
                  layoutMode === "grid"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title="عرض كشبكة">
                <Grid size={16} />
              </button>
              <button
                onClick={() => setLayoutMode("list")}
                className={`p-1.5 rounded-lg transition-all ${
                  layoutMode === "list"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title="عرض كقائمة">
                <List size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {dateFilter === "custom" && (
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-wrap gap-4 items-center animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500">من:</span>
              <input
                type="date"
                value={customRange.start}
                onChange={(e) =>
                  setCustomRange({ ...customRange, start: e.target.value })
                }
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none text-gray-700"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500">إلى:</span>
              <input
                type="date"
                value={customRange.end}
                onChange={(e) =>
                  setCustomRange({ ...customRange, end: e.target.value })
                }
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none text-gray-700"
              />
            </div>
            <button
              onClick={handleResetFilters}
              className="px-4 py-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-bold mr-auto">
              إعادة تعيين
            </button>
          </div>
        )}

        <div className="flex justify-between items-center pt-2 border-t border-gray-50 text-xs font-semibold text-gray-500">
          <span>
            {query || caseTypeFilter !== "all"
              ? `${filteredPatients.length} من أصل ${patients.length} مريض`
              : `إجمالي الأرشيف: ${filteredPatients.length} مريض`}
          </span>
        </div>
      </div>

      {/* Grid or List of Patients */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-300">
            {query ? (
              <Search size={32} strokeWidth={1.5} />
            ) : (
              <History size={32} strokeWidth={1.5} />
            )}
          </div>
          <h3 className="text-base font-black text-gray-700">
            {query
              ? `لا توجد نتائج مطابقة للبحث "${query}"`
              : "لا توجد سجلات في الأرشيف تطابق معيار التصفية المحدد"}
          </h3>
          <p className="text-gray-400 text-xs mt-1.5 font-semibold">
            {query
              ? "تأكد من كتابة الاسم أو رقم الهاتف أو معرف الزيارة بدقة."
              : "تأكد من ضبط نطاق التاريخ بشكل مناسب أو اضغط إعادة تعيين."}
          </p>
          {(query || dateFilter !== "all" || caseTypeFilter !== "all") && (
            <button
              onClick={handleResetFilters}
              className="mt-3 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 transition-colors">
              إعادة تعيين الفلاتر والبحث
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {layoutMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {paginatedPatients.map((p, idx) => {
                const matchedVisit = getMatchedVisit(p, query);
                return (
                  <PatientQueueCard
                    key={p.id}
                    index={(page - 1) * PAGE_SIZE + idx + 1}
                    visit={{
                      ...p,
                      visit_number:
                        p.visit_number ||
                        p.visit_id ||
                        p.latest_visit_id ||
                        p.id,
                      created_at: p.last_visit_date || p.created_at,
                      is_exempt: Boolean(p.is_exempt),
                      is_follow_up: Boolean(p.is_follow_up),
                      is_surgery: Boolean(
                        p.is_surgery ||
                        p.visit_status === "transferred_to_center" ||
                        p.status === "transferred_to_center",
                      ),
                      matchedVisit: matchedVisit,
                      matchedVisitTheme: "sky",
                    }}
                    onClick={() => handleOpenEMR(p, matchedVisit)}
                    colorTheme="blue"
                    hideStatus={true}
                    actionLabel="استعراض الملف"
                  />
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap table-fixed">
                  <thead className="bg-gradient-to-r from-slate-50/90 via-blue-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                    <tr>
                      <th className="w-[5%] px-3 py-4 text-center font-black text-xs text-slate-400">
                        #
                      </th>
                      <th className="w-[36%] px-4 py-4 text-right font-black text-xs text-slate-600">
                        المريض
                      </th>
                      <th className="w-[16%] px-4 py-4 text-center font-black text-xs text-slate-600">
                        إجمالي الزيارات
                      </th>
                      <th className="w-[25%] px-4 py-4 text-right font-black text-xs text-slate-600">
                        وقت وتاريخ التسجيل
                      </th>
                      <th className="w-[18%] px-4 py-4 text-center font-black text-xs text-slate-600">
                        الإجراء
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/70">
                    {paginatedPatients.map((p, idx) => {
                      const isVIP = Boolean(p.is_exempt);
                      const isFollowUp = Boolean(p.is_follow_up);
                      const isSurgery = Boolean(
                        p.is_surgery ||
                        p.visit_status === "transferred_to_center" ||
                        p.status === "transferred_to_center",
                      );
                      const visitNumber =
                        p.visit_number ||
                        p.visit_id ||
                        p.latest_visit_id ||
                        p.id;
                      const matchedVisit = getMatchedVisit(p, query);
                      const dateFormatted =
                        p.last_visit_date || p.created_at
                          ? `${new Date(p.last_visit_date || p.created_at).toLocaleDateString("en-GB")} - ${new Date(p.last_visit_date || p.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}`
                          : "--";
                      return (
                        <tr
                          key={p.id}
                          onClick={() => handleOpenEMR(p, matchedVisit)}
                          className="hover:bg-blue-50/30 cursor-pointer transition-colors border-b border-slate-100/70 last:border-0 group">
                          {/* # Number */}
                          <td className="w-[5%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                            {(page - 1) * PAGE_SIZE + idx + 1}
                          </td>

                          {/* Patient Details */}
                          <td className="w-[36%] px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 group-hover:scale-105 transition-transform bg-gradient-to-br from-blue-50 to-blue-100/80 text-blue-700 border border-blue-200/50">
                                {p.full_name?.charAt(0) ?? "؟"}
                              </div>
                              <div
                                className="flex flex-col gap-0.5 min-w-0 text-right"
                                dir="rtl"
                                style={{
                                  textAlign: "right",
                                  direction: "rtl",
                                }}>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-black text-slate-800 text-sm group-hover:text-blue-700 transition-colors truncate">
                                    {p.full_name}
                                  </span>
                                  {isFollowUp && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-emerald-100/75 text-emerald-700 border border-emerald-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                      <RotateCcw
                                        size={11}
                                        className="text-emerald-600 shrink-0"
                                        strokeWidth={2.2}
                                      />
                                      <span>مراجعة</span>
                                    </span>
                                  )}
                                  {isVIP && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-amber-100/75 text-amber-700 border border-amber-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                      <Crown
                                        size={11}
                                        className="text-amber-600 shrink-0"
                                        strokeWidth={2.2}
                                      />
                                      <span>إعفاء</span>
                                    </span>
                                  )}
                                  {isSurgery && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                      <Scissors
                                        size={11}
                                        className="text-purple-600 shrink-0"
                                        strokeWidth={2.2}
                                      />
                                      <span>عمليات</span>
                                    </span>
                                  )}
                                </div>
                                <div
                                  className="flex items-center gap-1.5 flex-wrap mt-0.5"
                                  dir="rtl"
                                  style={{
                                    textAlign: "right",
                                    direction: "rtl",
                                  }}>
                                  <span
                                    className="text-[11px] font-bold text-slate-400"
                                    dir="ltr">
                                    {visitNumber}
                                  </span>
                                  {matchedVisit && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-50 text-sky-700 border border-sky-200/80 shadow-2xs select-none leading-none">
                                      <History
                                        size={10}
                                        className="text-sky-600 shrink-0"
                                        strokeWidth={2.2}
                                      />
                                      <span>زيارة سابقة:</span>
                                      <span
                                        dir="ltr"
                                        className="font-black">
                                        {matchedVisit}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Total Visits */}
                          <td className="w-[16%] px-4 py-4 text-center">
                            {Number(p.total_visits) > 1 ? (
                              <span
                                className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100/90 text-slate-700 border border-slate-200/50 cursor-help"
                                title={
                                  p.all_visit_numbers
                                    ? `معرفات الزيارات: ${p.all_visit_numbers}`
                                    : undefined
                                }>
                                {Number(p.total_visits) === 2
                                  ? "زيارتان"
                                  : `${p.total_visits} زيارات`}
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-slate-400">
                                زيارة واحدة
                              </span>
                            )}
                          </td>

                          {/* Date and Time */}
                          <td className="w-[25%] px-4 py-4 text-right">
                            <span
                              className="text-xs font-bold text-slate-700 whitespace-nowrap"
                              dir="ltr">
                              {dateFormatted}
                            </span>
                          </td>

                          {/* Action Button */}
                          <td className="w-[18%] px-4 py-4 text-center">
                            <div className="flex items-center justify-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEMR(p, matchedVisit);
                                }}
                                className="px-4 py-2 font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-500/20 hover:shadow-md hover:shadow-blue-500/30">
                                <Eye size={13} strokeWidth={2.5} />
                                <span>استعراض الملف</span>
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

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center text-xs font-bold text-gray-500 bg-gray-50/50 p-4 rounded-2xl border">
              <span>
                صفحة {page} من {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-2 bg-white border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50 transition-colors"
                  title="السابق">
                  <ChevronRight size={18} className="text-gray-600" />
                </button>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-2 bg-white border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50 transition-colors"
                  title="التالي">
                  <ChevronLeft size={18} className="text-gray-600" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── HISTORIC READ-ONLY EMR MODAL ─── */}
      <PatientEMRModal
        isOpen={!!selectedPatient}
        onClose={() => setSelectedPatient(null)}
        patient={selectedPatient}
        visit={selectedVisit || selectedPatient}
        readOnly={true}
        isArchiveScreen={true}
        historyLoading={historyLoading}
        patientHistory={patientHistory}
        selectedVisit={selectedVisit}
        onSelectVisit={handleSelectVisit}
        onRefresh={refreshPatientHistory}
        prescriptionItems={prescriptionItems}
        loadingPrescription={loadingPrescription}
        onPrintPrescription={handlePrintPrescription}
      />
    </div>
  );
}
