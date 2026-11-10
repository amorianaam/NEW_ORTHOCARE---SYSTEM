import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Phone,
  Calendar,
  Heart,
  AlertTriangle,
  Pill,
  ClipboardList,
  Clock,
  CheckCircle2,
  CreditCard,
  Stethoscope,
  ChevronLeft,
  RefreshCcw,
  Search,
  Filter,
} from "lucide-react";
import { toast } from "react-toastify";
import useAuthStore from "../store/useAuthStore";

// ─── Status Config ──────────────────────────────────────────────────
const VISIT_STATUS = {
  registered: {
    label: "تسجيل جديد",
    color: "bg-gray-100 text-gray-600",
    dot: "#9CA3AF",
  },
  pending_payment: {
    label: "قيد الدفع",
    color: "bg-amber-100 text-amber-700",
    dot: "#F59E0B",
  },
  waiting: {
    label: "انتظار الطبيب",
    color: "bg-sky-100 text-sky-700",
    dot: "#0EA5E9",
  },
  with_doctor: {
    label: "مع الطبيب",
    color: "bg-blue-100 text-blue-700",
    dot: "#2563EB",
  },
  awaiting_service_payment: {
    label: "انتظار دفع خدمات",
    color: "bg-orange-100 text-orange-700",
    dot: "#EA580C",
  },
  awaiting_lab: {
    label: "انتظار تحاليل",
    color: "bg-purple-100 text-purple-700",
    dot: "#9333EA",
  },
  awaiting_radiology: {
    label: "انتظار أشعة",
    color: "bg-violet-100 text-violet-700",
    dot: "#7C3AED",
  },
  completed_admin_pending_services: {
    label: "اكتمل - خدمات متبقية",
    color: "bg-yellow-100 text-yellow-700",
    dot: "#CA8A04",
  },
  transferred_to_center: {
    label: "محول للعمليات",
    color: "bg-pink-100 text-pink-700",
    dot: "#DB2777",
  },
  awaiting_surgery: {
    label: "بانتظار العملية",
    color: "bg-rose-100 text-rose-700",
    dot: "#E11D48",
  },
  post_surgery: {
    label: "ما بعد عملية",
    color: "bg-indigo-100 text-indigo-700",
    dot: "#4F46E5",
  },
  completed: {
    label: "مكتمل",
    color: "bg-emerald-100 text-emerald-700",
    dot: "#10B981",
  },
  cancelled: {
    label: "ملغي",
    color: "bg-red-100 text-red-700",
    dot: "#EF4444",
  },
  follow_up: {
    label: "متابعة",
    color: "bg-teal-100 text-teal-700",
    dot: "#14B8A6",
  },
};

// ─── Quick-filter tabs ──────────────────────────────────────────────
const FILTERS = [
  { key: "all", label: "الكل", icon: Filter },
  { key: "pending_payment", label: "قيد الدفع", icon: CreditCard },
  { key: "waiting", label: "انتظار الطبيب", icon: Clock },
  { key: "with_doctor", label: "مع الطبيب", icon: Stethoscope },
  { key: "completed", label: "مكتمل", icon: CheckCircle2 },
];

// ─── Visit Timeline Item ───────────────────────────────────────────
const VisitItem = ({ visit }) => {
  const cfg = VISIT_STATUS[visit.status] || {
    label: visit.status,
    color: "bg-gray-100 text-gray-600",
    dot: "#9CA3AF",
  };
  return (
    <div className="flex gap-3 relative">
      {/* Timeline connector */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ring-2 ring-white shadow"
          style={{ backgroundColor: cfg.dot }}
        />
        <div className="w-px flex-1 bg-gray-100 mt-1" />
      </div>
      <div className="pb-4 flex-1">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full ${cfg.color}`}>
              {cfg.label}
            </span>
            {visit.is_follow_up ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                مراجعة
              </span>
            ) : (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                جديد
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400 font-mono">
            {visit.visit_number}
          </span>
        </div>
        <div className="flex gap-3 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1">
            <Calendar size={11} />
            {visit.created_at
              ? new Date(visit.created_at).toLocaleDateString("ar", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "—"}
          </span>
          {visit.entry_fee > 0 && (
            <span className="text-emerald-600 font-semibold">
              رسم الدخول: {visit.entry_fee} ريال يمني
            </span>
          )}
          {visit.entity && (
            <span className="capitalize">
              {visit.entity === "clinic" ? " العيادة" : " المركز"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Patient Detail Panel ─────────────────────────────────────────
const PatientDetailPanel = ({ patient, onClose }) => {
  const [visits, setVisits] = useState([]);
  const [loadingVisits, setLoadingVisits] = useState(true);
  const { token } = useAuthStore();

  useEffect(() => {
    if (!patient) return;
    setLoadingVisits(true);
    fetch(`/api/patients/${patient.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setVisits(data.visits || []);
      })
      .catch(() => toast.error("فشل تحميل سجل الزيارات"))
      .finally(() => setLoadingVisits(false));
  }, [patient, token]);

  if (!patient) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="w-96 flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="px-5 py-4 border-b border-gray-100 flex items-center gap-3"
        style={{ background: "linear-gradient(135deg, #EFF6FF, #DBEAFE)" }}>
        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl font-bold shadow">
          {patient.full_name?.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 truncate">
            {patient.full_name}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {patient.age ? `${patient.age} سنة · ` : ""}
            {patient.gender === "male" ? "ذكر" : "أنثى"}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/60 text-gray-500 transition-colors flex-shrink-0">
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Scroll Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Contact */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
              <Phone size={10} /> الهاتف
            </p>
            <p className="text-sm font-semibold text-gray-800">
              {patient.phone || "—"}
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
              <Calendar size={10} /> تاريخ التسجيل
            </p>
            <p className="text-sm font-semibold text-gray-800">
              {patient.created_at
                ? new Date(patient.created_at).toLocaleDateString("ar")
                : "—"}
            </p>
          </div>
        </div>

        {/* Medical Alerts */}
        {patient.chronic_diseases && (
          <div className="rounded-xl p-3 bg-amber-50 border border-amber-200">
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800 mb-1.5">
              <Heart size={12} /> الأمراض المزمنة
            </p>
            <p className="text-sm text-amber-900 leading-relaxed">
              {patient.chronic_diseases}
            </p>
          </div>
        )}
        {patient.allergies && (
          <div className="rounded-xl p-3 bg-red-50 border border-red-200">
            <p className="flex items-center gap-1.5 text-xs font-bold text-red-800 mb-1.5">
              <AlertTriangle size={12} /> ⚠️ حساسيات
            </p>
            <p className="text-sm text-red-900 leading-relaxed">
              {patient.allergies}
            </p>
          </div>
        )}
        {patient.current_medications && (
          <div className="rounded-xl p-3 bg-blue-50 border border-blue-200">
            <p className="flex items-center gap-1.5 text-xs font-bold text-blue-800 mb-1.5">
              <Pill size={12} /> الأدوية الحالية
            </p>
            <p className="text-sm text-blue-900 leading-relaxed">
              {patient.current_medications}
            </p>
          </div>
        )}
        {!patient.chronic_diseases &&
          !patient.allergies &&
          !patient.current_medications && (
            <p className="text-xs text-gray-400 text-center py-1">
              لا توجد بيانات طبية مسجلة
            </p>
          )}

        {/* Visit History */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList size={14} className="text-gray-500" />
            <p className="text-sm font-bold text-gray-700">سجل الزيارات</p>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {visits.length}
            </span>
          </div>

          {loadingVisits ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-10 bg-gray-100 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : visits.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">
              لا توجد زيارات مسجلة
            </p>
          ) : (
            <div>
              {visits.map((v) => (
                <VisitItem key={v.id} visit={v} />
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────
const PatientsData = () => {
  const { token } = useAuthStore();
  const [patients, setPatients] = useState([]);
  const [visits, setVisits] = useState([]); // today's active visits for filtering
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Fetch all patients
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, vRes] = await Promise.all([
        fetch("/api/patients", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/patients/visits/today", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const pData = await pRes.json();
      const vData = vRes.ok ? await vRes.json() : [];
      setPatients(Array.isArray(pData) ? pData : []);
      setVisits(Array.isArray(vData) ? vData : []);
    } catch {
      toast.error("فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build a map: patient_id → latest visit status
  const visitMap = visits.reduce((acc, v) => {
    // Keep the most recent visit per patient
    if (
      !acc[v.patient_id] ||
      new Date(v.created_at) > new Date(acc[v.patient_id].created_at)
    ) {
      acc[v.patient_id] = v;
    }
    return acc;
  }, {});

  // Filter logic
  const filtered = patients.filter((p) => {
    const matchQuery =
      !query.trim() ||
      p.full_name?.toLowerCase().includes(query.toLowerCase()) ||
      (p.phone || "").includes(query);

    const latestVisit = visitMap[p.id];
    const matchFilter =
      activeFilter === "all" ||
      (latestVisit && latestVisit.status === activeFilter);

    return matchQuery && matchFilter;
  });

  // Count per filter
  const counts = FILTERS.reduce((acc, f) => {
    if (f.key === "all") {
      acc[f.key] = patients.length;
    } else {
      acc[f.key] = Object.values(visitMap).filter(
        (v) => v.status === f.key,
      ).length;
    }
    return acc;
  }, {});

  return (
    <div className="flex gap-4 h-[calc(100vh-128px)]" dir="rtl">
      {/* ── Main Area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">بيانات المرضى</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {filtered.length} نتيجة
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />{" "}
            تحديث
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3 flex-shrink-0">
          <Search
            size={15}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-base pr-9 text-sm"
            placeholder="ابحث بالاسم أو رقم الهاتف..."
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4 flex-shrink-0 overflow-x-auto pb-1 no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                activeFilter === f.key
                  ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}>
              <f.icon size={13} />
              {f.label}
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  activeFilter === f.key
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 text-gray-500"
                }`}>
                {counts[f.key] || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
              <tr>
                {[
                  "#",
                  "المريض",
                  "العمر",
                  "الجنس",
                  "الهاتف",
                  "حالة الزيارة",
                  "تفاصيل",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-right px-4 py-3 text-xs font-semibold text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5, 6].map((i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-gray-400">
                    <motion.div
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 2 }}>
                      <User size={36} className="mx-auto mb-3 opacity-20" />
                      <p className="text-sm">
                        {query
                          ? "لا توجد نتائج مطابقة"
                          : activeFilter !== "all"
                            ? "لا يوجد مرضى في هذه الحالة"
                            : "لا يوجد مرضى مسجلون"}
                      </p>
                    </motion.div>
                  </td>
                </tr>
              ) : (
                filtered.map((p, i) => {
                  const latestVisit = visitMap[p.id];
                  const statusCfg = latestVisit
                    ? VISIT_STATUS[latestVisit.status] || {
                        label: latestVisit.status,
                        color: "bg-gray-100 text-gray-500",
                      }
                    : null;

                  return (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => setSelectedPatient(p)}
                      className={`border-b border-gray-50 cursor-pointer transition-colors ${
                        selectedPatient?.id === p.id
                          ? "bg-blue-50"
                          : "hover:bg-gray-50/60"
                      }`}>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                        {p.id}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                            {p.full_name?.charAt(0)}
                          </div>
                          <span className="font-semibold text-gray-800 text-sm">
                            {p.full_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {p.age ? `${p.age} سنة` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            p.gender === "male"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-pink-100 text-pink-700"
                          }`}>
                          {p.gender === "male" ? "♂ ذكر" : "♀ أنثى"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-500 text-xs">
                        {p.phone || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {statusCfg ? (
                          <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusCfg.color}`}>
                            {statusCfg.label}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPatient(p);
                          }}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
                          عرض
                        </button>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Side Panel ── */}
      <AnimatePresence>
        {selectedPatient && (
          <PatientDetailPanel
            patient={selectedPatient}
            onClose={() => setSelectedPatient(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default PatientsData;
