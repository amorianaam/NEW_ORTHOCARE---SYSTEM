import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { usePersistentState } from '../../hooks/usePersistentState';
import { 
  Eye, X, Pencil, SendHorizontal, Clock, History, FlaskConical, Pill, Printer, 
  Maximize2, Minimize2, User, Phone, Radiation, Stethoscope, CheckCircle, Calendar, 
  Crown, RotateCcw, Scissors, Layers, FileText, AlertCircle, ChevronDown, Film, Image as ImageIcon
} from "lucide-react";
import axios from "axios";
import useAuthStore from '../../store/useAuthStore';
import { toast } from "react-toastify";
import useSocketStore from '../../store/useSocketStore';
import { RadiologyResultDetailsModal } from "../radiology/RadiologyModals";
import { LabResultDetailsModal } from "../lab/LabModals";
import ClinicalResultViewerModal from './ClinicalResultViewerModal';
import UnifiedTimelineNavigator from './UnifiedTimelineNavigator';
import { printPrescription } from '../../utils/prescriptionPrint';
import { toEnglishDigits, resolveFileUrl, groupLabsBySharedResult, getFilmTypeBadgeInfo, getBalancedRadiologyRows } from '../../utils/emrHelpers';

const formatCountUnit = (count, unit) => {
  if (unit === 'تحليل') {
    return count === 1 ? 'تحليل واحد' : count === 2 ? 'تحليلان' : count >= 3 && count <= 10 ? `${count} تحاليل` : `${count} تحليل`;
  }
  if (unit === 'فحص') {
    return count === 1 ? 'فحص واحد' : count === 2 ? 'فحصان' : count >= 3 && count <= 10 ? `${count} فحوصات` : `${count} فحص`;
  }
  if (unit === 'خدمة') {
    return count === 1 ? 'خدمة واحدة' : count === 2 ? 'خدمتان' : count >= 3 && count <= 10 ? `${count} خدمات` : `${count} خدمة`;
  }
  if (unit === 'تقرير') {
    return count === 1 ? 'تقرير واحد' : count === 2 ? 'تقريران' : count >= 3 && count <= 10 ? `${count} تقارير` : `${count} تقرير`;
  }
  return `${count} ${unit}`;
};

const groupRadByFilm = (rads) => {
  const groups = {};
  const sizeMap = { 'large': 'كبير', 'small': 'صغير', 'medium': 'وسط' };

  rads.forEach((r, idx) => {
    const key = r.radiology_film_id ? `film_${r.radiology_film_id}` : `standalone_${idx}`;

    if (!groups[key]) {
      let translatedSize = r.film_size ? (sizeMap[r.film_size.toLowerCase()] || r.film_size) : '';
      groups[key] = {
        ...r,
        names: [r.name],
        t: 'أشعة',
        c: 'bg-rose-50 text-rose-700 border-rose-100',
        film_type: (r.with_film === 0 || r.with_film === false)
          ? 'بدون فيلم'
          : (translatedSize ? `فيلم ${translatedSize}` : 'فيلم مجمّع'),
        items: []
      };
    } else {
      groups[key].names.push(r.name);
    }
    
    groups[key].items.push(r);
    
    if (r.result_notes && !groups[key].result_notes) groups[key].result_notes = r.result_notes;
    if (r.result_file && !groups[key].result_file) groups[key].result_file = r.result_file;
  });

  return Object.values(groups);
};

const STATUS_CONFIG = {
  completed: {
    label: 'مكتملة',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
    dotClass: 'bg-emerald-500',
  },
  paid: {
    label: 'في انتظار التنفيذ',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200/70',
    dotClass: 'bg-purple-500 animate-pulse',
  },
  in_progress: {
    label: 'قيد التنفيذ',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200/70',
    dotClass: 'bg-teal-500 animate-pulse',
  },
  pending_payment: {
    label: 'في انتظار الدفع',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200/70',
    dotClass: 'bg-amber-500 animate-pulse',
  },
  pending: {
    label: 'معلّقة',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200/70',
    dotClass: 'bg-amber-400',
  },
  refunded: {
    label: 'مستردة',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200/70',
    dotClass: 'bg-rose-500',
  },
  cancelled: {
    label: 'ملغاة',
    badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
    dotClass: 'bg-slate-400',
  },
};

export default function HistoricEMRModal({
  patient,
  onClose,
  token,
  onEditPatient,
  onSendReview,
  sendingReview,
  closeOnBackdropClick = true,
  initialVisitId = null,
}) {
  const [patientHistory, setPatientHistory] = useState([]);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [emrTab, setEmrTab] = usePersistentState('emr_last_tab', 'orders');
  const [prescriptionItems, setPrescriptionItems] = useState([]);
  const [loadingPrescription, setLoadingPrescription] = useState(false);
  const [isFullscreen, setIsFullscreen] = usePersistentState('secretary_modal_maximized_preference', false);

  const activeTab = emrTab;

  const isVisitCancelled = Boolean(
    (selectedVisit && (selectedVisit.status === 'cancelled' || selectedVisit.visit_status === 'cancelled' || selectedVisit.visit_status === 'financial_cancelled')) ||
    (!selectedVisit && (patient?.status === 'cancelled' || patient?.visit_status === 'cancelled' || patient?.visit_status === 'financial_cancelled'))
  );

  // Document preview modal states
  const [previewFile, setPreviewFile] = useState("");
  const [previewFileName, setPreviewFileName] = useState("");
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [resolvedPreview, setResolvedPreview] = useState(null);
  const [viewLabResult, setViewLabResult] = useState(null);
  const [viewRadResult, setViewRadResult] = useState(null);
  const [activeResultViewer, setActiveResultViewer] = useState({
    isOpen: false,
    results: [],
    currentIndex: 0
  });
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  const [eligibility, setEligibility] = useState(null);
  const [loadingEligibility, setLoadingEligibility] = useState(false);

  // ── Collapsible Sections State (Orders & Results) ──
  const [openOrderSections, setOpenOrderSections] = useState({
    lab: false,
    radiology: false,
    clinical: false,
  });
  const [openResultSections, setOpenResultSections] = useState({
    lab: false,
    radiology: false,
    clinical: false,
  });

  const toggleOrderSection = (key) => {
    setOpenOrderSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleResultSection = (key) => {
    setOpenResultSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    if (!previewFile) {
      setResolvedPreview(null);
      return;
    }
    const resolved = resolveFileUrl(previewFile);
    setResolvedPreview(resolved);

    return () => {
      if (resolved && resolved.url && resolved.url.startsWith('blob:')) {
        URL.revokeObjectURL(resolved.url);
      }
    };
  }, [previewFile]);

  const latestPatientEvent = useSocketStore(state => state.latestPatientEvent);
  const latestSilentUpdate = useSocketStore(state => state.latestSilentUpdate);
  const lastFetchRef = useRef(0);

  const openPreview = (file, name) => {
    setPreviewFile(file);
    setPreviewFileName(name);
    setIsPreviewModalOpen(true);
  };

  const fetchHistory = async () => {
    if (!patient) return;
    try {
      const res = await axios.get(`/api/doctor/patient/${patient.id}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      let history = Array.isArray(res.data) ? [...res.data] : [];
      const isInitialCancelled = patient?.status === 'cancelled' || patient?.visit_status === 'cancelled' || patient?.visit_status === 'financial_cancelled';
      const patientVisitId = patient.visitId || patient.id;
      if (isInitialCancelled) {
        const exists = history.some(v => String(v.id) === String(patientVisitId));
        if (!exists) {
          const cancelledVisitObj = {
            id: patientVisitId,
            visit_number: patient.visit_number || '—',
            created_at: patient.created_at || new Date().toISOString(),
            status: 'cancelled',
            closed_at: null,
            is_exempt: patient.is_exempt,
            is_follow_up: patient.is_follow_up,
            is_surgery: patient.is_surgery,
            labTests: [],
            radiologyTests: [],
            clinicalServices: [],
            surgeries: []
          };
          history = [cancelledVisitObj, ...history];
        }
      }
      setPatientHistory(history);
      if (initialVisitId && history.length > 0) {
        const cleanTarget = String(initialVisitId).replace(/^#+/, '').trim().toLowerCase();
        const matched = history.find(v => 
          String(v.visit_number || '').replace(/^#+/, '').trim().toLowerCase() === cleanTarget ||
          String(v.id || '').trim().toLowerCase() === cleanTarget
        );
        setSelectedVisit(matched || history[0]);
      } else if (!selectedVisit && history.length > 0) {
        setSelectedVisit(history[0]);
      } else if (selectedVisit) {
        const updatedVisit = history.find(v => v.id === selectedVisit.id);
        if (updatedVisit) setSelectedVisit(updatedVisit);
      }
      lastFetchRef.current = Date.now();
    } catch {
      toast.error("فشل تحميل تاريخ المريض");
    }
  };

  const fetchEligibility = async () => {
    const patientId = patient?.id || patient?.patient_id;
    if (!patientId) {
      setEligibility(null);
      return;
    }
    setLoadingEligibility(true);
    try {
      const activeToken = token || (typeof useAuthStore === 'function' ? useAuthStore.getState?.()?.token : null);
      const res = await axios.get(`/api/patients/${patientId}/follow-up-eligibility`, {
        headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {}
      });
      setEligibility(res.data);
    } catch (err) {
      console.error("Failed to fetch follow up eligibility:", err);
      setEligibility(null);
    } finally {
      setLoadingEligibility(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchEligibility();
  }, [patient, token]);

  useEffect(() => {
    if (latestPatientEvent?.timestamp && latestPatientEvent.timestamp > lastFetchRef.current) {
      if (latestPatientEvent.patientId === patient?.id || latestPatientEvent.patient_id === patient?.id) {
        fetchHistory();
        fetchEligibility();
      }
    }
  }, [latestPatientEvent, patient]);

  useEffect(() => {
    if (latestSilentUpdate?.timestamp && latestSilentUpdate.timestamp > lastFetchRef.current) {
      if (
        !latestSilentUpdate.patientId ||
        String(latestSilentUpdate.patientId) === String(patient?.id) ||
        (latestSilentUpdate.visitId && patientHistory.some(v => String(v.id || v.visitId) === String(latestSilentUpdate.visitId)))
      ) {
        lastFetchRef.current = Date.now();
        fetchHistory();
        fetchEligibility();
      }
    }
  }, [latestSilentUpdate, patient, patientHistory]);

  useEffect(() => {
    if (sendingReview === null) {
      fetchEligibility();
    }
  }, [sendingReview]);

  useEffect(() => {
    if (selectedVisit?.id) {
      setLoadingPrescription(true);
      axios.get(`/api/doctor/visit/${selectedVisit.id}/prescription`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => {
          if (res.data && Array.isArray(res.data.items)) {
            setPrescriptionItems(res.data.items);
          } else if (Array.isArray(res.data)) {
            setPrescriptionItems(res.data);
          } else {
            setPrescriptionItems([]);
          }
        })
        .catch(() => setPrescriptionItems([]))
        .finally(() => setLoadingPrescription(false));
    } else {
      setPrescriptionItems([]);
    }
  }, [selectedVisit?.id, token]);

  const handleSelectVisit = (visit) => {
    setSelectedVisit(visit);
    setEmrTab('orders');
  };

  const handlePrintPrescription = () => {
    if (!selectedVisit) return;
    printPrescription({
      patient,
      visit: selectedVisit,
      items: prescriptionItems
    });
  };

  const statusBadge = (status) => {
    const config = STATUS_CONFIG[status] || {
      label: status || 'غير محدد',
      badgeClass: 'bg-slate-50 text-slate-600 border-slate-200',
      dotClass: 'bg-slate-400',
    };

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full font-bold border shadow-2xs whitespace-nowrap ${config.badgeClass}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dotClass}`} />
        <span>{config.label}</span>
      </span>
    );
  };

  const targetVisitForServices = selectedVisit || patient;
  const currentLabs = 
    targetVisitForServices?.labTests || 
    targetVisitForServices?.lab_tests || 
    targetVisitForServices?.labRequests || 
    [];

  const currentRads = 
    targetVisitForServices?.radiologyTests || 
    targetVisitForServices?.radiology_tests || 
    targetVisitForServices?.radiologyRequests || 
    [];

  const currentClinics = 
    targetVisitForServices?.clinicalServices || 
    targetVisitForServices?.clinical_services || 
    targetVisitForServices?.clinicalRequests || 
    [];

  const pendingLabsCount = currentLabs.filter(
    r => !['completed', 'cancelled', 'refunded'].includes(r.status)
  ).length;

  const pendingRadsCount = currentRads.filter(
    r => !['completed', 'cancelled', 'refunded'].includes(r.status)
  ).length;

  const pendingClinicsCount = currentClinics.filter(
    r => !['completed', 'cancelled', 'refunded'].includes(r.status)
  ).length;

  const totalPendingServices = pendingLabsCount + pendingRadsCount + pendingClinicsCount;
  const hasPendingServices = totalPendingServices > 0;

  if (!patient) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
        {/* Background Overlay */}
        <div className="absolute inset-0" onClick={closeOnBackdropClick ? onClose : undefined} />
        
        {/* Modal Container */}
        <div className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/60 ${isFullscreen ? 'w-[98vw] h-[98vh] rounded-[2.5rem]' : 'w-full max-w-5xl h-full max-h-[90vh] rounded-[2rem]'}`}>
          
          {/* Top Control Bar (Teal Primary Theme) */}
          <div className={`${isFullscreen ? 'px-6 sm:px-8 py-3' : 'px-5 py-2.5'} flex items-center justify-between flex-shrink-0 shadow-md text-white transition-colors duration-300 bg-gradient-to-r from-teal-700 via-teal-600 to-teal-700 z-30`}>
            <div className="flex items-center gap-2">
              <Layers size={isFullscreen ? 18 : 16} />
              <span className={`${isFullscreen ? 'text-xs sm:text-sm' : 'text-xs'} font-black tracking-wide drop-shadow-sm`}>
                الملف الطبي الشامل للمريض ({patient?.full_name || '...'})
              </span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              {onEditPatient && (
                <button
                  onClick={() => onEditPatient(patient)}
                  className={`${isFullscreen ? 'h-8 px-3 text-xs sm:text-sm' : 'h-7 px-2.5 text-xs'} flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white hover:text-amber-100 rounded-lg transition-all shadow-sm font-black cursor-pointer active:scale-95`}
                  title="تعديل بيانات المريض"
                >
                  <Pencil size={isFullscreen ? 13 : 12} strokeWidth={2.2} />
                  <span>تعديل</span>
                </button>
              )}
              {hasPendingServices && (
                <div
                  className={`${isFullscreen ? 'h-8 px-3.5 text-xs sm:text-sm' : 'h-7 px-2.5 text-xs'} flex items-center gap-1.5 bg-white/20 text-white rounded-lg font-black shadow-sm select-none`}
                  title={`توجد ${totalPendingServices} خدمات معلقة لم تكتمل بعد`}
                >
                  <Clock size={isFullscreen ? 14 : 13} strokeWidth={2.2} className="text-white animate-spin" />
                  <span>بانتظار ${totalPendingServices} خدمة</span>
                </div>
              )}
              {(onEditPatient || hasPendingServices) && <div className="w-px h-4 bg-white/25 mx-0.5" />}
              <button 
                onClick={() => setIsFullscreen(!isFullscreen)} 
                className={`${isFullscreen ? 'w-8 h-8' : 'w-7 h-7'} flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all shadow-sm cursor-pointer active:scale-95`} 
                title={isFullscreen ? 'تصغير' : 'تكبير'}
              >
                {isFullscreen ? <Minimize2 size={isFullscreen ? 16 : 15} /> : <Maximize2 size={isFullscreen ? 16 : 15} />}
              </button>
              <button 
                onClick={onClose} 
                className={`${isFullscreen ? 'w-8 h-8' : 'w-7 h-7'} flex items-center justify-center bg-white/20 hover:bg-white/30 text-white hover:text-red-100 rounded-lg transition-all shadow-sm cursor-pointer active:scale-95`} 
                title="إغلاق"
              >
                <X size={isFullscreen ? 16 : 15} />
              </button>
            </div>
          </div>

          {/* Modal Header — Personal Info (Doctor EMR Style) */}
          {(() => {
            const displayVisit = selectedVisit || patient;
            const isExempt = Boolean(displayVisit?.is_exempt === 1 || displayVisit?.is_exempt === true);
            const isFollowUp = Boolean(displayVisit?.is_follow_up === 1 || displayVisit?.is_follow_up === true);
            const isSurgery = Boolean(
              displayVisit?.is_surgery || 
              displayVisit?.has_surgery || 
              displayVisit?.has_surgeries || 
              displayVisit?.status === 'transferred_to_center' || 
              (Array.isArray(displayVisit?.surgeries) && displayVisit.surgeries.length > 0)
            );

            return (
              <div className={`bg-white ${isFullscreen ? 'px-6 sm:px-8 py-3.5 sm:py-4' : 'px-5 sm:px-6 py-3.5'} flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-100 shrink-0 z-20`}>
                {/* Right: Avatar + Name + Chips + Sub-metadata */}
                <div className={`flex items-center ${isFullscreen ? 'gap-3.5 sm:gap-4' : 'gap-3 sm:gap-3.5'}`}>
                  <div className={`${isFullscreen ? 'w-12 h-12 sm:w-13 sm:h-13 rounded-xl' : 'w-11 h-11 sm:w-12 sm:h-12 rounded-xl'} bg-gradient-to-br from-teal-50 to-teal-100 flex items-center justify-center text-teal-700 shadow-inner border border-teal-100/60 shrink-0`}>
                    <User size={isFullscreen ? 22 : 20} strokeWidth={1.8} className="sm:hidden" />
                    <User size={isFullscreen ? 24 : 22} strokeWidth={1.8} className="hidden sm:block" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <h2 className="text-base sm:text-lg font-black text-slate-800 tracking-tight leading-none">
                        {patient?.full_name || displayVisit?.full_name || '...'}
                      </h2>
                      {isExempt && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-amber-100/70 text-amber-700 border border-amber-200/60 shadow-2xs select-none">
                          <Crown size={11} className="text-amber-600 shrink-0" />
                          <span>إعفاء</span>
                        </span>
                      )}
                      {isFollowUp && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-emerald-100/70 text-emerald-700 border border-emerald-200/60 shadow-2xs select-none">
                          <RotateCcw size={11} className="text-emerald-600 shrink-0" />
                          <span>مراجعة</span>
                        </span>
                      )}
                      {isSurgery && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/70 text-purple-700 border border-purple-200/60 shadow-2xs select-none">
                          <Scissors size={11} className="text-purple-600 shrink-0" />
                          <span>عمليات</span>
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-0.5">
                      <span className="flex items-center gap-1 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md font-black text-slate-500 bg-slate-100/80 border border-slate-200/60" dir="ltr">
                        <User size={11}/> {patient?.id || patient?.patient_id || displayVisit?.patient_id || '...'}
                      </span>
                      {((patient?.gender || displayVisit?.gender) || (patient?.age || displayVisit?.age)) && (
                        <span className="flex items-center gap-1 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md font-black text-slate-600 bg-slate-100/80 border border-slate-200/60">
                          {(patient?.gender || displayVisit?.gender) ? ((patient?.gender || displayVisit?.gender) === 'male' || (patient?.gender || displayVisit?.gender) === 'ذكر' ? 'ذكر' : 'أنثى') : ''}
                          {(patient?.gender || displayVisit?.gender) && (patient?.age || displayVisit?.age) ? ' — ' : ''}
                          {(patient?.age || displayVisit?.age) ? `${patient?.age || displayVisit?.age} سنة` : ''}
                        </span>
                      )}
                      {(() => {
                        const rawPhone = patient?.phone || displayVisit?.phone;
                        const hasPhone = rawPhone && String(rawPhone).trim() !== '' && rawPhone !== 'بدون هاتف' && rawPhone !== '-' && rawPhone !== '—';
                        if (!hasPhone) return null;
                        return (
                          <span className="flex items-center gap-1 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md font-black text-teal-700 bg-teal-50 border border-teal-100/60">
                            <Phone size={11}/> <span dir="ltr">{rawPhone}</span>
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Left: Plain Text Date & Visit ID & Action Buttons */}
                <div className={`flex flex-col items-start md:items-end ${isFullscreen ? 'gap-1.5' : 'gap-1'} self-stretch md:self-auto`}>
                  <div className={`flex items-center gap-1.5 text-slate-500 font-bold ${isFullscreen ? 'text-xs sm:text-sm' : 'text-xs'}`}>
                    <Calendar size={isFullscreen ? 15 : 13} className="text-teal-600 opacity-80" />
                    <span dir="ltr">{new Date(displayVisit?.created_at || Date.now()).toLocaleDateString('en-GB')}</span>
                    <span className="text-slate-300 mx-0.5">•</span>
                    <span dir="ltr">{new Date(displayVisit?.created_at || Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                  </div>
                  
                  <div className={`flex items-center gap-1 ${isFullscreen ? 'text-xs font-black' : 'text-[10px] sm:text-[11px] font-black'} text-slate-400`}>
                    <span>معرف الزيارة:</span>
                    <span className="text-slate-600 font-bold" dir="ltr">{displayVisit?.visit_number || displayVisit?.id || displayVisit?.visitId || '—'}</span>
                  </div>

                  {onSendReview && !isExempt && !isFollowUp && selectedVisit?.status !== 'cancelled' && eligibility?.eligible && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {(() => {
                        const visitIsCancelled = selectedVisit?.status === 'cancelled';
                        return (
                          <button
                            onClick={(e) => onSendReview(e, { ...patient, eligibility })}
                            disabled={sendingReview === patient.id || visitIsCancelled}
                            title={visitIsCancelled ? 'لا يمكن تسجيل مراجعة لزيارة ملغاة' : undefined}
                            className={`text-[11px] font-black flex items-center gap-1 px-3 py-1.5 shadow-2xs rounded-xl transition-all whitespace-nowrap text-white cursor-pointer ${
                              visitIsCancelled
                                ? 'opacity-40 cursor-not-allowed bg-slate-400'
                                : 'bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 active:scale-95'
                            }`}
                          >
                            {sendingReview === patient.id ? <span className="animate-spin w-3 h-3 border-2 border-white/30 border-t-white rounded-full inline-block" /> : <SendHorizontal size={11}/>}
                            تسجيل مراجعة مجانية
                          </button>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Explanatory Message Banner for Cancelled Visit */}
          {Boolean(isVisitCancelled) && (
            <div className={`bg-rose-50/95 border-b border-rose-200/90 ${isFullscreen ? 'px-6 sm:px-8 py-3' : 'px-5 sm:px-6 py-2.5'} flex items-center justify-between gap-3 text-rose-800 flex-shrink-0 shadow-2xs`}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0 text-rose-600 shadow-xs">
                  <AlertCircle size={18} strokeWidth={2.2} />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                  <span className="text-xs sm:text-sm font-black text-rose-900">الزيارة ملغية:</span>
                  <span className="text-[11px] sm:text-xs font-semibold text-rose-700">
                    تم إلغاء هذه الزيارة، ولا يمكن إضافة أو تعديل أو تنفيذ أي خدمات أو فحوصات أو إجراءات طبية عليها.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Core Modal Content */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            <UnifiedTimelineNavigator 
              patientHistory={patientHistory} 
              selectedVisit={selectedVisit} 
              onSelectVisit={handleSelectVisit} 
              theme="teal" 
              isMaximized={isFullscreen}
            />

            {/* Centered Tab Selector (Doctor Queue Style) */}
            <div className="flex flex-col md:flex-row justify-center items-center border-b border-gray-150 px-4 py-2 bg-gray-50/50 flex-shrink-0 gap-3">
              <div className="flex justify-center gap-2 text-xs font-bold text-gray-500 overflow-x-auto w-full pb-1 md:pb-0">
                {[
                  { id: 'orders', label: 'الخدمات والفحوصات', icon: FlaskConical },
                  { id: 'results', label: 'النتائج', icon: Eye },
                  { id: 'prescription', label: 'الروشتة', icon: Pill }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setEmrTab(tab.id)}
                    className={`flex items-center gap-1.5 px-6 py-2.5 rounded-xl transition-all whitespace-nowrap text-xs cursor-pointer ${
                      emrTab === tab.id
                        ? 'bg-white text-teal-700 shadow-sm border border-teal-100 ring-1 ring-teal-50 font-black'
                        : 'hover:bg-gray-100 text-gray-500 font-bold'
                    }`}
                  >
                    <tab.icon size={15} />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scroll Body */}
            <div className="flex-1 overflow-y-auto bg-slate-50 min-h-0">
              <div className={`${isFullscreen ? 'w-full max-w-[1720px] mx-auto px-6 sm:px-8 lg:px-10 py-6' : 'p-6 max-w-5xl mx-auto w-full'}`}>
                {!selectedVisit ? (
                  <div className="text-center py-20 text-gray-400 text-xs font-bold">
                    {isVisitCancelled ? 'الزيارة ملغية ولا تتوفر بيانات طبية لعرضها.' : 'قم باختيار زيارة من الشريط الزمني لعرض تفاصيلها الطبية.'}
                  </div>
                ) : (
                  <div>
                    {/* ── TAB 1: UNIFIED SERVICES & INVESTIGATIONS ── */}
                    {activeTab === 'orders' && (
                      <div className="space-y-4 modal-overlay-anim">
                        {(() => {
                          const labs    = selectedVisit?.labTests || selectedVisit?.lab_tests || selectedVisit?.labRequests || [];
                          const rads    = selectedVisit?.radiologyTests || selectedVisit?.radiology_tests || selectedVisit?.radiologyRequests || [];
                          const clinics = selectedVisit?.clinicalServices || selectedVisit?.clinical_services || selectedVisit?.clinicalRequests || [];

                          const allItems = [
                            ...labs.map(r => ({ ...r, categoryKey: 'lab', typeLabel: 'مختبر' })),
                            ...rads.map(r => ({ ...r, categoryKey: 'radiology', typeLabel: 'أشعة' })),
                            ...clinics.map(r => ({ ...r, categoryKey: 'clinical', typeLabel: 'خدمة سريرية' }))
                          ];

                          const categoryPriority = {
                            lab: 1,
                            radiology: 2,
                            clinical: 3
                          };

                          const sortedItems = [...allItems].sort((a, b) => {
                            const pA = categoryPriority[a.categoryKey] || 99;
                            const pB = categoryPriority[b.categoryKey] || 99;
                            if (pA !== pB) return pA - pB;
                            const dateA = new Date(a.requested_at || a.created_at || a.date || 0).getTime();
                            const dateB = new Date(b.requested_at || b.created_at || b.date || 0).getTime();
                            return dateB - dateA;
                          });

                          if (sortedItems.length === 0) {
                            return (
                              <div className="space-y-3 mt-4">
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col items-center justify-center py-12 px-4 text-center">
                                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3.5 shadow-xs border ${
                                    isVisitCancelled 
                                      ? 'bg-rose-50 text-rose-600 border-rose-200/70' 
                                      : 'bg-gradient-to-br from-slate-50 to-teal-50/80 border-teal-100/60 text-teal-600'
                                  }`}>
                                    {isVisitCancelled ? <AlertCircle size={26} strokeWidth={1.8} /> : <FileText size={26} strokeWidth={1.8} />}
                                  </div>
                                  <h3 className="text-sm sm:text-base font-black text-slate-800 mb-1 tracking-tight">
                                    {isVisitCancelled ? 'الزيارة ملغية' : 'لا توجد خدمات أو فحوصات مسجلة'}
                                  </h3>
                                  <p className="text-xs max-w-sm font-semibold text-slate-400 leading-relaxed">
                                    {isVisitCancelled
                                      ? 'تم إلغاء هذه الزيارة، ولن يتم تسجيل أو تقديم أي خدمات أو فحوصات لها.'
                                      : 'لا توجد أي تحاليل مخبرية، فحوصات أشعة، أو خدمات سريرية مسجلة في هذا السجل.'}
                                  </p>
                                </div>
                              </div>
                            );
                          }

                          const sortSectionItems = (items) => {
                            return [...items].sort((a, b) => {
                              const isInactiveA = a.status === 'refunded' || a.status === 'cancelled' ? 1 : 0;
                              const isInactiveB = b.status === 'refunded' || b.status === 'cancelled' ? 1 : 0;
                              if (isInactiveA !== isInactiveB) return isInactiveA - isInactiveB;
                              const dateA = new Date(a.requested_at || a.created_at || a.date || 0).getTime();
                              const dateB = new Date(b.requested_at || b.created_at || b.date || 0).getTime();
                              if (dateB !== dateA) return dateB - dateA;
                              return (b.id || 0) - (a.id || 0);
                            });
                          };

                          const orderSections = [
                            {
                              key: 'lab',
                              title: 'قسم المختبر',
                              countUnit: 'تحليل',
                              itemColHeader: 'التحليل',
                              icon: FlaskConical,
                              items: sortSectionItems(labs),
                              color: {
                                border: 'border-purple-200/90 hover:border-purple-300',
                                headerBg: 'bg-gradient-to-r from-purple-50/80 via-white to-purple-50/40',
                                iconBox: 'bg-purple-100 text-purple-700 border border-purple-200/70',
                                badge: 'bg-purple-50 text-purple-800 border-purple-200/90 shadow-2xs',
                              }
                            },
                            {
                              key: 'radiology',
                              title: 'قسم الأشعة',
                              countUnit: 'فحص',
                              itemColHeader: 'الأشعة',
                              icon: Radiation,
                              items: sortSectionItems(rads),
                              color: {
                                border: 'border-sky-200/90 hover:border-sky-300',
                                headerBg: 'bg-gradient-to-r from-sky-50/80 via-white to-sky-50/40',
                                iconBox: 'bg-sky-100 text-sky-700 border border-sky-200/70',
                                badge: 'bg-sky-50 text-sky-800 border-sky-200/90 shadow-2xs',
                              }
                            },
                            {
                              key: 'clinical',
                              title: 'قسم الخدمات السريرية',
                              countUnit: 'خدمة',
                              itemColHeader: 'الخدمة',
                              icon: Stethoscope,
                              items: sortSectionItems(clinics),
                              color: {
                                border: 'border-teal-200/90 hover:border-teal-300',
                                headerBg: 'bg-gradient-to-r from-teal-50/80 via-white to-teal-50/40',
                                iconBox: 'bg-teal-100 text-teal-700 border border-teal-200/70',
                                badge: 'bg-teal-50 text-teal-800 border-teal-200/90 shadow-2xs',
                              }
                            }
                          ];

                          const totalOrdersCount = allItems.filter(i => i.status !== 'refunded' && i.status !== 'cancelled').length;

                          return (
                            <div className="space-y-4">
                              {/* Floating Header */}
                              <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-teal-100/80 rounded-lg text-teal-700 shadow-sm">
                                    <FlaskConical size={16} />
                                  </div>
                                  <h3 className="text-sm font-black text-slate-700">الخدمات والفحوصات</h3>
                                  <span className="text-xs px-2.5 py-0.5 font-extrabold bg-teal-50 text-teal-700 rounded-full border border-teal-200/60 tabular-nums tracking-tight">
                                    {formatCountUnit(totalOrdersCount, 'خدمة')}
                                  </span>
                                </div>
                              </div>

                              {/* 3 Collapsible Department Accordions */}
                              <div className="space-y-3">
                                {orderSections.filter(sec => sec.items.length > 0).map((sec) => {
                                  const isOpen = Boolean(openOrderSections[sec.key]);
                                  const IconComponent = sec.icon;
                                  const count = sec.items.filter(i => i.status !== 'refunded' && i.status !== 'cancelled').length;

                                  return (
                                    <div
                                      key={sec.key}
                                      className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-xs ${sec.color.border}`}
                                    >
                                      {/* Accordion Header Bar */}
                                      <div
                                        onClick={() => toggleOrderSection(sec.key)}
                                        className={`w-full flex items-center justify-between px-4 py-3 cursor-pointer select-none transition-colors ${sec.color.headerBg}`}
                                      >
                                        <div className="flex items-center gap-2.5">
                                          <div className={`p-2 rounded-xl shadow-2xs ${sec.color.iconBox}`}>
                                            <IconComponent size={16} />
                                          </div>
                                          <span className="text-sm font-black text-slate-800 tracking-tight">
                                            {sec.title}
                                          </span>
                                          {/* Section Counter Badge */}
                                          <span className={`text-[11px] px-2.5 py-0.5 font-extrabold rounded-full border tabular-nums tracking-tight ${sec.color.badge}`}>
                                            {formatCountUnit(count, sec.countUnit)}
                                          </span>
                                        </div>

                                        <div className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-700 shadow-2xs">
                                          <ChevronDown
                                            size={16}
                                            className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                                          />
                                        </div>
                                      </div>

                                      {/* Accordion Body */}
                                      {isOpen && (
                                        <div className="border-t border-slate-100">
                                          {sec.items.length === 0 ? (
                                            <div className="py-6 px-4 text-center">
                                              <p className="text-xs font-semibold text-slate-400">
                                                لا توجد عناصر مسجلة في {sec.title}
                                              </p>
                                            </div>
                                          ) : (
                                            <div className="w-full overflow-x-auto">
                                              <table className="w-full text-right text-sm whitespace-nowrap table-fixed">
                                                <thead className="bg-slate-50/80 border-b border-slate-200">
                                                  <tr>
                                                    <th style={{ width: '5%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">#</th>
                                                    <th style={{ width: '55%' }} className="px-4 py-3.5 text-xs font-bold text-slate-500 text-right">{sec.itemColHeader}</th>
                                                    <th style={{ width: '18%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">الحالة</th>
                                                    <th style={{ width: '22%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">التاريخ والوقت</th>
                                                  </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-slate-100">
                                                  {sec.items.map((item, index) => {
                                                    const isRadNoFilm = item.categoryKey === 'radiology' && (item.with_film === false || item.with_film === 0 || item.withFilm === false);
                                                    const itemDate = item.requested_at || item.created_at || item.date || selectedVisit?.created_at;
                                                    const isCancelled = item.status === 'cancelled';
                                                    const isRefunded = item.status === 'refunded';

                                                    return (
                                                      <tr 
                                                        key={item.id || `${item.categoryKey}_${index}`} 
                                                        className={`transition-all duration-200 ${
                                                          isCancelled 
                                                            ? 'opacity-60 bg-slate-50/80 hover:bg-slate-100/50 print:opacity-50' 
                                                            : isRefunded
                                                              ? 'opacity-50 bg-slate-50/50 hover:bg-slate-100/60 hover:opacity-85'
                                                              : 'hover:bg-slate-50/50'
                                                        }`}
                                                      >
                                                        <td className={`px-3 py-3 text-xs font-black text-center align-middle ${isCancelled || isRefunded ? 'text-slate-300' : 'text-slate-400'}`}>
                                                          {index + 1}
                                                        </td>
                                                        <td className="px-4 py-3 font-semibold text-slate-800 align-middle">
                                                          <div className="flex items-center flex-wrap gap-1.5">
                                                            <span className={`text-sm ${
                                                              isCancelled 
                                                                ? 'line-through text-slate-400 font-medium' 
                                                                : isRefunded
                                                                  ? 'font-bold text-slate-700'
                                                                  : 'font-bold text-slate-800'
                                                            }`}>
                                                              {item.name || item.test_name || item.service_name || 'خدمة غير محددة'}
                                                            </span>
                                                            {isRadNoFilm && (
                                                              <span className="text-xs font-semibold text-slate-500 shrink-0">
                                                                (بدون فيلم)
                                                              </span>
                                                            )}
                                                            {isCancelled && (
                                                              <span 
                                                                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-black bg-slate-100 text-slate-500 border border-slate-200 shadow-xs shrink-0 select-none"
                                                                title="تم إلغاء هذه الخدمة"
                                                              >
                                                                ملغاة
                                                              </span>
                                                            )}
                                                          </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-center align-middle">
                                                          {statusBadge(item.status)}
                                                        </td>
                                                        <td className="px-3 py-3 text-center align-middle">
                                                          <div className={`flex flex-col items-center ${isCancelled ? 'opacity-70' : ''}`}>
                                                            <span className={`text-xs font-bold ${isCancelled ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-700'}`} dir="ltr">
                                                              {itemDate ? new Date(itemDate).toLocaleDateString('en-GB') : '—'}
                                                            </span>
                                                            {itemDate && (
                                                              <span className="text-[10px] font-bold text-slate-400" dir="ltr">
                                                                {new Date(itemDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                              </span>
                                                            )}
                                                          </div>
                                                        </td>
                                                      </tr>
                                                    );
                                                  })}
                                                </tbody>
                                              </table>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* ── TAB 2: UNIFIED RESULTS ── */}
                    {emrTab === 'results' && (
                      <div className="space-y-4 modal-overlay-anim">
                        {(() => {
                          const labs    = (selectedVisit?.labTests || selectedVisit?.lab_tests || selectedVisit?.labRequests || []).filter(t => t.status === 'completed');
                          const rads    = (selectedVisit?.radiologyTests || selectedVisit?.radiology_tests || selectedVisit?.radiologyRequests || []).filter(t => t.status === 'completed' || t.result_notes || t.result_file);
                          const clinics = (selectedVisit?.clinicalServices || selectedVisit?.clinical_services || selectedVisit?.clinicalRequests || []).filter(t => t.status === 'completed' || t.result_notes || t.result_file);
                          
                          if (labs.length === 0 && rads.length === 0 && clinics.length === 0) {
                            return (
                              <div className="space-y-3 mt-4">
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col items-center justify-center py-12 px-4 text-center">
                                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3.5 shadow-xs border ${
                                    isVisitCancelled 
                                      ? 'bg-rose-50 text-rose-600 border-rose-200/70' 
                                      : 'bg-gradient-to-br from-slate-50 to-teal-50/80 border-teal-100/60 text-teal-600'
                                  }`}>
                                    {isVisitCancelled ? <AlertCircle size={26} strokeWidth={1.8} /> : <Eye size={26} strokeWidth={1.8} />}
                                  </div>
                                  <h3 className="text-sm sm:text-base font-black text-slate-800 mb-1 tracking-tight">
                                    {isVisitCancelled ? 'الزيارة ملغية' : 'لا توجد نتائج مسجلة'}
                                  </h3>
                                  <p className="text-xs max-w-sm font-semibold text-slate-400 leading-relaxed">
                                    {isVisitCancelled
                                      ? 'الزيارة ملغية ولا توجد نتائج أو تقارير طبية مرفوعة.'
                                      : 'لا توجد أي نتائج تحاليل مخبرية أو تقارير أشعة مرفوعة لهذه الزيارة حتى الآن.'}
                                  </p>
                                </div>
                              </div>
                            );
                          }

                          // Build unified results collection for cross-department navigation
                          const rawAllVisitResults = [];

                          // Priority 1: Laboratory results (grouped by shared result when applicable)
                          const labGroups = groupLabsBySharedResult(labs);
                          labGroups.forEach(g => {
                            rawAllVisitResults.push(g);
                          });

                          const labResultRows = labs.map((t, idx) => {
                            const matchedGroup = labGroups.find(g => 
                              g.items && g.items.some(item => String(item.id) === String(t.id))
                            ) || t;

                            return {
                              ...t,
                              id: t.id || `lab_${idx}`,
                              name: t.name || t.test_name || 'تحليل مخبري',
                              categoryKey: 'lab',
                              typeLabel: 'مختبر',
                              date: t.performed_at || t.completed_at || t.updated_at || t.created_at || selectedVisit?.created_at,
                              result_notes: t.result_notes,
                              result_file: t.result_file,
                              targetGroup: matchedGroup
                            };
                          });

                          // Priority 2: Radiology results (grouped by film)
                          const radGroups = groupRadByFilm(rads);
                          const radResultRows = radGroups.map((g, idx) => {
                            const mainItem = g.items[0] || {};
                            const names = g.items.map(i => i.name || i.radiology_name).filter(Boolean).join(' + ');
                            const item = {
                              ...mainItem,
                              id: mainItem.id || `rad_grp_${idx}`,
                              name: names || mainItem.name || mainItem.radiology_name || 'فحص أشعة',
                              film_type: g.film_type,
                              items: g.items,
                              categoryKey: 'radiology',
                              typeLabel: 'أشعة',
                              date: mainItem.performed_at || mainItem.completed_at || mainItem.updated_at || mainItem.created_at || selectedVisit?.created_at,
                              result_notes: g.result_notes || mainItem.result_notes,
                              result_file: g.result_file || mainItem.result_file
                            };
                            rawAllVisitResults.push(item);
                            return item;
                          });

                          // Priority 3: Clinical Services
                          const clinicResultRows = clinics.map((c, idx) => {
                            const item = {
                              ...c,
                              id: c.id || `clinic_${idx}`,
                              name: c.name || c.service_name || 'خدمة سريرية',
                              categoryKey: 'clinical',
                              typeLabel: 'خدمة سريرية',
                              date: c.performed_at || c.completed_at || c.updated_at || c.created_at || selectedVisit?.created_at,
                              result_notes: c.result_notes,
                              result_file: c.result_file || c.file_url || c.attachment
                            };
                            rawAllVisitResults.push(item);
                            return item;
                          });

                          // Unified traversal open handler
                          const openUnifiedResultModal = (targetItem) => {
                            const targetIdx = rawAllVisitResults.findIndex(r => String(r.id) === String(targetItem.id));
                            setActiveResultViewer({
                              isOpen: true,
                              results: rawAllVisitResults,
                              currentIndex: targetIdx >= 0 ? targetIdx : 0
                            });
                          };

                          labResultRows.forEach(r => { r.onPreview = () => openUnifiedResultModal(r.targetGroup || r); });
                          radResultRows.forEach(r => { r.onPreview = () => openUnifiedResultModal(r); });
                          clinicResultRows.forEach(r => { r.onPreview = () => openUnifiedResultModal(r); });

                          const resultSections = [
                            {
                              key: 'lab',
                              title: 'قسم المختبر',
                              countUnit: 'تحليل',
                              itemColHeader: 'التحليل',
                              icon: FlaskConical,
                              items: labResultRows,
                              color: {
                                border: 'border-purple-200/90 hover:border-purple-300',
                                headerBg: 'bg-gradient-to-r from-purple-50/80 via-white to-purple-50/40',
                                iconBox: 'bg-purple-100 text-purple-700 border border-purple-200/70',
                                badge: 'bg-purple-50 text-purple-800 border-purple-200/90 shadow-2xs',
                              }
                            },
                            {
                              key: 'radiology',
                              title: 'قسم الأشعة',
                              countUnit: 'فحص',
                              itemColHeader: 'الأشعة',
                              icon: Radiation,
                              items: radResultRows,
                              color: {
                                border: 'border-sky-200/90 hover:border-sky-300',
                                headerBg: 'bg-gradient-to-r from-sky-50/80 via-white to-sky-50/40',
                                iconBox: 'bg-sky-100 text-sky-700 border border-sky-200/70',
                                badge: 'bg-sky-50 text-sky-800 border-sky-200/90 shadow-2xs',
                              }
                            },
                            {
                              key: 'clinical',
                              title: 'قسم الخدمات السريرية',
                              countUnit: 'خدمة',
                              itemColHeader: 'الخدمة',
                              icon: Stethoscope,
                              items: clinicResultRows,
                              color: {
                                border: 'border-teal-200/90 hover:border-teal-300',
                                headerBg: 'bg-gradient-to-r from-teal-50/80 via-white to-teal-50/40',
                                iconBox: 'bg-teal-100 text-teal-700 border border-teal-200/70',
                                badge: 'bg-teal-50 text-teal-800 border-teal-200/90 shadow-2xs',
                              }
                            }
                          ];

                          const radTestsCount = radResultRows.reduce((sum, r) => sum + (Array.isArray(r.items) && r.items.length > 0 ? r.items.length : 1), 0);
                          const totalResultsCount = labResultRows.length + radTestsCount + clinicResultRows.length;

                          return (
                            <div className="space-y-4">
                              {/* Floating Header */}
                              <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-teal-100/80 rounded-lg text-teal-700 shadow-sm">
                                    <Eye size={16} />
                                  </div>
                                  <h3 className="text-sm font-black text-slate-700">نتائج التقارير</h3>
                                  <span className="text-xs px-2.5 py-0.5 font-extrabold bg-teal-50 text-teal-700 rounded-full border border-teal-200/60 tabular-nums tracking-tight">
                                    {formatCountUnit(totalResultsCount, 'تقرير')}
                                  </span>
                                </div>
                              </div>

                              {/* 3 Collapsible Department Accordions for Results */}
                              <div className="space-y-3">
                                {resultSections.filter(sec => sec.items.length > 0).map((sec) => {
                                  const isOpen = Boolean(openResultSections[sec.key]);
                                  const IconComponent = sec.icon;
                                  const count = sec.key === 'radiology'
                                    ? sec.items.reduce((sum, row) => {
                                        if (row.status === 'refunded' || row.status === 'cancelled') return sum;
                                        return sum + (Array.isArray(row.items) && row.items.length > 0 ? row.items.length : 1);
                                      }, 0)
                                    : sec.items.filter(i => i.status !== 'refunded' && i.status !== 'cancelled').length;

                                  return (
                                    <div
                                      key={sec.key}
                                      className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-xs ${sec.color.border}`}
                                    >
                                      {/* Accordion Header Bar */}
                                      <div
                                        onClick={() => toggleResultSection(sec.key)}
                                        className={`w-full flex items-center justify-between px-4 py-3 cursor-pointer select-none transition-colors ${sec.color.headerBg}`}
                                      >
                                        <div className="flex items-center gap-2.5">
                                          <div className={`p-2 rounded-xl shadow-2xs ${sec.color.iconBox}`}>
                                            <IconComponent size={16} />
                                          </div>
                                          <span className="text-sm font-black text-slate-800 tracking-tight">
                                            {sec.title}
                                          </span>
                                          {/* Section Counter Badge */}
                                          <span className={`text-[11px] px-2.5 py-0.5 font-extrabold rounded-full border tabular-nums tracking-tight ${sec.color.badge}`}>
                                            {formatCountUnit(count, sec.countUnit)}
                                          </span>
                                        </div>

                                        <div className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-700 shadow-2xs">
                                          <ChevronDown
                                            size={16}
                                            className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                                          />
                                        </div>
                                      </div>

                                      {/* Accordion Body */}
                                      {isOpen && (
                                        <div className="border-t border-slate-100">
                                          {sec.items.length === 0 ? (
                                            <div className="py-6 px-4 text-center">
                                              <p className="text-xs font-semibold text-slate-400">
                                                لا توجد نتائج مسجلة في {sec.title}
                                              </p>
                                            </div>
                                          ) : (
                                            <div className="w-full overflow-x-auto">
                                              {sec.key === 'radiology' ? (
                                                <table className="w-full text-right text-sm whitespace-nowrap table-fixed">
                                                  <thead className="bg-slate-50/80 border-b border-slate-200">
                                                    <tr>
                                                      <th style={{ width: '5%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">#</th>
                                                      <th style={{ width: '53%' }} className="px-4 py-3.5 text-xs font-bold text-slate-500 text-right">فحص الأشعة</th>
                                                      <th style={{ width: '16%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">نوع الفيلم</th>
                                                      <th style={{ width: '16%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">التاريخ والوقت</th>
                                                      <th style={{ width: '10%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">النتيجة</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody className="bg-white divide-y divide-slate-100">
                                                    {sec.items.map((row, index) => {
                                                      const hasReportOrFile = Boolean(row.result_file || row.file_url || row.attachment || row.result_notes);
                                                      const testNames = (Array.isArray(row.items) && row.items.length > 0)
                                                        ? row.items.map(i => i.name || i.radiology_name || 'فحص أشعة').filter(Boolean)
                                                        : (row.name ? row.name.split('+').map(s => s.trim()).filter(Boolean) : ['فحص أشعة']);
                                                      const filmBadge = getFilmTypeBadgeInfo(row);

                                                      return (
                                                        <tr key={row.id || `${row.categoryKey}_${index}`} className="hover:bg-slate-50/50 transition-colors">
                                                          <td className="px-3 py-3 text-xs font-black text-slate-400 text-center align-middle">
                                                            {index + 1}
                                                          </td>
                                                          <td style={{ width: '53%' }} className="px-4 py-3 align-middle">
                                                            {(() => {
                                                              const balancedRows = getBalancedRadiologyRows(testNames, isFullscreen);

                                                              return (
                                                                <div className="flex flex-col gap-1.5 py-0.5 max-w-full">
                                                                  {balancedRows.map((rowItems, rIdx) => (
                                                                    <div key={rIdx} className="flex items-center gap-2 flex-wrap">
                                                                      {rowItems.map((itemName, itemIdx) => (
                                                                        <div
                                                                          key={itemIdx}
                                                                          className={`inline-flex items-center w-fit ${
                                                                            isFullscreen ? 'max-w-[280px]' : 'max-w-[210px]'
                                                                          } px-2.5 py-1 rounded-xl bg-slate-50/90 hover:bg-sky-50/60 border border-slate-200/90 hover:border-sky-300/80 text-slate-800 font-bold shadow-2xs transition-all min-w-0 cursor-default`}
                                                                          title={itemName}
                                                                        >
                                                                          <span className="text-xs font-bold leading-snug truncate">
                                                                            {itemName}
                                                                          </span>
                                                                        </div>
                                                                      ))}
                                                                    </div>
                                                                  ))}
                                                                </div>
                                                             );
                                                            })()}
                                                          </td>
                                                          <td className="px-3 py-3 text-center align-middle">
                                                            <span className={`inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-2xs select-none ${filmBadge.badgeClass}`}>
                                                              {filmBadge.iconType === 'image' ? (
                                                                <ImageIcon size={12} className={`${filmBadge.iconClass} shrink-0`} />
                                                              ) : (
                                                                <Film size={12} className={`${filmBadge.iconClass} shrink-0`} />
                                                              )}
                                                              <span>{filmBadge.label}</span>
                                                            </span>
                                                          </td>
                                                          <td className="px-3 py-3 text-center align-middle">
                                                            <div className="flex flex-col items-center">
                                                              <span className="text-xs font-bold text-slate-700" dir="ltr">
                                                                {row.date ? new Date(row.date).toLocaleDateString('en-GB') : '—'}
                                                              </span>
                                                              {row.date && (
                                                                <span className="text-[10px] font-bold text-slate-400" dir="ltr">
                                                                  {new Date(row.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                                </span>
                                                              )}
                                                            </div>
                                                          </td>
                                                          <td className="px-3 py-3 text-center align-middle">
                                                            {hasReportOrFile ? (
                                                              <button
                                                                type="button"
                                                                onClick={() => row.onPreview()}
                                                                className="w-8 h-8 rounded-xl inline-flex items-center justify-center text-teal-700 bg-teal-50 hover:bg-teal-100 hover:text-teal-800 border border-teal-200/70 transition-all cursor-pointer shadow-2xs active:scale-95 mx-auto group"
                                                                title="عرض النتيجة والتقرير"
                                                                aria-label="عرض النتيجة والتقرير"
                                                              >
                                                                <FileText size={15} className="text-teal-600 group-hover:scale-110 transition-transform" />
                                                              </button>
                                                            ) : (
                                                              <span className="text-slate-300 font-bold text-xs">—</span>
                                                            )}
                                                          </td>
                                                        </tr>
                                                      );
                                                    })}
                                                  </tbody>
                                                </table>
                                              ) : sec.key === 'clinical' ? (
                                                <table className="w-full text-right text-sm whitespace-nowrap table-fixed">
                                                  <thead className="bg-slate-50/80 border-b border-slate-200">
                                                    <tr>
                                                      <th style={{ width: '6%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">#</th>
                                                      <th style={{ width: '68%' }} className="px-4 py-3.5 text-xs font-bold text-slate-500 text-right">الخدمة السريرية</th>
                                                      <th style={{ width: '26%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">التاريخ والوقت</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody className="bg-white divide-y divide-slate-100">
                                                    {sec.items.map((row, index) => (
                                                      <tr key={row.id || `${row.categoryKey}_${index}`} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-3 py-3 text-xs font-black text-slate-400 text-center align-middle">
                                                          {index + 1}
                                                        </td>
                                                        <td className="px-4 py-3 font-semibold text-slate-800 align-middle">
                                                          <span className="font-bold text-slate-800 text-sm leading-snug">
                                                            {row.name}
                                                          </span>
                                                        </td>
                                                        <td className="px-3 py-3 text-center align-middle">
                                                          <div className="flex flex-col items-center">
                                                            <span className="text-xs font-bold text-slate-700" dir="ltr">
                                                              {row.date ? new Date(row.date).toLocaleDateString('en-GB') : '—'}
                                                            </span>
                                                            {row.date && (
                                                              <span className="text-[10px] font-bold text-slate-400" dir="ltr">
                                                                {new Date(row.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                              </span>
                                                            )}
                                                          </div>
                                                        </td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              ) : (
                                                <table className="w-full text-right text-sm whitespace-nowrap table-fixed">
                                                  <thead className="bg-slate-50/80 border-b border-slate-200">
                                                    <tr>
                                                      <th style={{ width: '5%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">#</th>
                                                      <th style={{ width: '67%' }} className="px-4 py-3.5 text-xs font-bold text-slate-500 text-right">التحليل المخبري</th>
                                                      <th style={{ width: '18%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">التاريخ والوقت</th>
                                                      <th style={{ width: '10%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">النتيجة</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody className="bg-white divide-y divide-slate-100">
                                                    {sec.items.map((row, index) => {
                                                      const hasReportOrFile = Boolean(row.result_file || row.file_url || row.attachment || row.result_notes);
                                                      const isShared = Boolean(row.targetGroup && row.targetGroup.tests && row.targetGroup.tests.length > 1);

                                                      return (
                                                        <tr key={row.id || `${row.categoryKey}_${index}`} className="hover:bg-slate-50/50 transition-colors">
                                                          <td className="px-3 py-3 text-xs font-black text-slate-400 text-center align-middle">
                                                            {index + 1}
                                                          </td>
                                                          <td className="px-4 py-3 align-middle">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                              <span className="font-bold text-slate-800 text-sm leading-snug">
                                                                {row.name}
                                                              </span>
                                                              {isShared && (
                                                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200/80 shadow-2xs">
                                                                  <FlaskConical size={11} className="text-purple-600" />
                                                                  <span>نتيجة مشتركة</span>
                                                                </span>
                                                              )}
                                                            </div>
                                                          </td>
                                                          <td className="px-3 py-3 text-center align-middle">
                                                            <div className="flex flex-col items-center">
                                                              <span className="text-xs font-bold text-slate-700" dir="ltr">
                                                                {row.date ? new Date(row.date).toLocaleDateString('en-GB') : '—'}
                                                              </span>
                                                              {row.date && (
                                                                <span className="text-[10px] font-bold text-slate-400" dir="ltr">
                                                                  {new Date(row.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                                </span>
                                                              )}
                                                            </div>
                                                          </td>
                                                          <td className="px-3 py-3 text-center align-middle">
                                                            {hasReportOrFile ? (
                                                              <button
                                                                type="button"
                                                                onClick={() => row.onPreview()}
                                                                className="w-8 h-8 rounded-xl inline-flex items-center justify-center text-teal-700 bg-teal-50 hover:bg-teal-100 hover:text-teal-800 border border-teal-200/70 transition-all cursor-pointer shadow-2xs active:scale-95 mx-auto group"
                                                                title="عرض النتيجة والتقرير"
                                                                aria-label="عرض النتيجة والتقرير"
                                                              >
                                                                <FileText size={15} className="text-teal-600 group-hover:scale-110 transition-transform" />
                                                              </button>
                                                            ) : (
                                                              <span className="text-slate-300 font-bold text-xs">—</span>
                                                            )}
                                                          </td>
                                                        </tr>
                                                      );
                                                    })}
                                                  </tbody>
                                                </table>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* ── TAB 3: PRESCRIPTION ── */}
                    {emrTab === 'prescription' && (
                      <div className="space-y-3 modal-overlay-anim">
                        {Array.isArray(prescriptionItems) && prescriptionItems.length > 0 && (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-teal-100/80 rounded-lg text-teal-700 shadow-sm">
                                <Pill size={16} />
                              </div>
                              <h3 className="text-sm font-black text-slate-700">الأدوية والتوجيهات الطبية</h3>
                              <span className="text-xs font-black bg-teal-50 text-teal-700 px-2.5 py-0.5 rounded-full border border-teal-200/60 font-mono">
                                {prescriptionItems.length}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={handlePrintPrescription}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl transition-all font-black text-xs shadow-xs hover:shadow-sm active:scale-95 cursor-pointer"
                                title="طباعة الروشتة الطبية الرسمية (A5)"
                              >
                                <Printer size={14} />
                                <span>طباعة الروشتة</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Meds Table Container */}
                        <div id="print-area" className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                          {loadingPrescription ? (
                            <div className="flex justify-center items-center py-16">
                              <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                          ) : Array.isArray(prescriptionItems) && prescriptionItems.length > 0 ? (
                            <div className="w-full overflow-x-auto">
                              <table className="w-full text-right text-sm whitespace-nowrap table-fixed">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                  <tr>
                                    <th style={{ width: '5%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">#</th>
                                    <th style={{ width: '30%' }} className="px-4 py-3.5 text-xs font-bold text-slate-500 text-right">اسم الدواء والعلاج</th>
                                    <th style={{ width: '15%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">الجرعة</th>
                                    <th style={{ width: '15%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">التكرار</th>
                                    <th style={{ width: '20%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">التعليمات</th>
                                    <th style={{ width: '15%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">المدة</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                  {prescriptionItems.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                                      <td className="px-3 py-3 font-black text-slate-400 text-center text-xs align-middle">
                                        {idx + 1}
                                      </td>
                                      <td className="px-4 py-3 font-bold text-slate-800 text-sm align-middle">
                                        {item.medication_name}
                                      </td>
                                      <td className="px-3 py-3 text-center font-bold text-slate-700 text-xs align-middle">
                                        {toEnglishDigits(item.dosage) || '—'}
                                      </td>
                                      <td className="px-3 py-3 text-center font-bold text-slate-700 text-xs align-middle">
                                        {toEnglishDigits(item.frequency) || '—'}
                                      </td>
                                      <td className="px-3 py-3 text-center font-bold text-slate-700 text-xs align-middle">
                                        {item.instructions ? (
                                          <span className="truncate max-w-[240px] block mx-auto text-center font-bold text-slate-700 text-xs" title={item.instructions}>
                                            {toEnglishDigits(item.instructions)}
                                          </span>
                                        ) : (
                                          <span className="text-slate-300 font-bold text-xs">—</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-3 text-center font-bold text-slate-700 text-xs align-middle whitespace-nowrap">
                                        {toEnglishDigits(item.duration) || '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="text-center py-16 text-gray-400 text-xs font-bold">
                              {isVisitCancelled ? 'الزيارة ملغية — لا توجد وصفة طبية مسجلة لهذه الزيارة.' : 'لم يتم تسجيل أي أدوية أو وصفات علاجية لهذه الزيارة.'}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Document preview modal */}
      {isPreviewModalOpen && (
        <div
          style={{ zIndex: 100005 }}
          className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md modal-overlay-anim"
          dir="rtl"
        >
          <div
            className={`bg-white rounded-3xl shadow-luxury flex flex-col overflow-hidden animate-scale-in transition-all duration-300 border border-gray-100 ${isPreviewMaximized ? 'w-[98vw] h-[98vh]' : 'w-full max-w-4xl h-[80vh]'}`}
          >
            {/* Header */}
            <div className="flex justify-between items-center p-5 border-b border-gray-100 flex-shrink-0 bg-gray-50/50">
              <div>
                <h3 className="font-extrabold text-sm text-gray-800 flex items-center gap-2">
                  <Eye size={18} className="text-teal-600 animate-pulse" /> معاينة التقرير الطبي
                </h3>
                <p className="text-xs text-gray-400 mt-0.5 font-semibold">
                  {previewFileName}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsPreviewMaximized(!isPreviewMaximized)} 
                  className="p-2 bg-gray-200 text-gray-600 rounded-xl hover:bg-teal-500 hover:text-white transition-colors cursor-pointer"
                >
                  {isPreviewMaximized ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                </button>
                <button
                  onClick={() => {
                    setIsPreviewModalOpen(false);
                    setPreviewFile("");
                    setPreviewFileName("");
                  }}
                  className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Viewer Area */}
            <div className="flex-1 bg-gray-100/50 p-6 overflow-hidden flex items-center justify-center min-h-0">
              {(() => {
                if (!resolvedPreview) return null;

                if (resolvedPreview.isPdf) {
                  return (
                    <iframe
                      src={resolvedPreview.url}
                      className="w-full h-full rounded-2xl border border-gray-200 shadow-sm"
                      title="PDF Medical Report Preview"
                    />
                  );
                }
                return (
                  <div className="w-full h-full overflow-auto flex items-center justify-center p-2">
                    <img
                      src={resolvedPreview.url}
                      alt="Medical Report Preview"
                      className="max-w-full max-h-full object-contain rounded-2xl shadow-md border border-gray-200"
                    />
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 flex-shrink-0 bg-gray-50/50 flex justify-end">
              <button
                onClick={() => {
                  setIsPreviewModalOpen(false);
                  setPreviewFile("");
                  setPreviewFileName("");
                }}
                className="px-6 py-2.5 rounded-xl font-bold text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors cursor-pointer"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified PACS-Grade Clinical Result Viewer Modal */}
      {activeResultViewer.isOpen && (
        <ClinicalResultViewerModal
          isOpen={activeResultViewer.isOpen}
          results={activeResultViewer.results}
          initialIndex={activeResultViewer.currentIndex}
          patientName={patient?.name || patient?.full_name}
          visitNumber={selectedVisit?.visit_number || selectedVisit?.id}
          theme="secretary"
          onClose={() => setActiveResultViewer(prev => ({ ...prev, isOpen: false }))}
        />
      )}

      {/* Lab Result Details Modal */}
      {viewLabResult && (
        <LabResultDetailsModal
          isOpen={true}
          onClose={() => setViewLabResult(null)}
          request={viewLabResult}
        />
      )}

      {/* Radiology Result Details Modal */}
      {viewRadResult && (
        <RadiologyResultDetailsModal
          isOpen={true}
          onClose={() => setViewRadResult(null)}
          request={viewRadResult}
        />
      )}
    </>,
    document.body
  );
}
