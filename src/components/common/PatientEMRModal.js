import React, { useState, useEffect, useRef } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';
import { RadiologyResultDetailsModal } from "../../components/radiology/RadiologyModals";
import { LabResultDetailsModal } from "../../components/lab/LabModals";
import ClinicalResultViewerModal from './ClinicalResultViewerModal';
import MedicationSelect from '../MedicationSelect';
import UnifiedTimelineNavigator from './UnifiedTimelineNavigator';
import { 
  X, History, FlaskConical, Eye, Pill, AlertCircle, Clock, Crown, Maximize2, Minimize2, Calendar, CheckCircle, Trash2,
  Plus, Stethoscope, RotateCcw, Scissors, Lock, FileText, Sparkles, Film, Image as ImageIcon,
  Trash, Search, ChevronDown, Star, Phone, User, Layers, ArrowLeft, ExternalLink, Radiation } from 'lucide-react';
import taffyot from '../../utils/taffyot';
import { toEnglishDigits, resolveFileUrl, groupLabsBySharedResult, getFilmTypeBadgeInfo, getBalancedRadiologyRows } from '../../utils/emrHelpers';
import { getServerBaseUrl } from '../../utils/apiConfig';

const groupRadByFilm = (rads) => {
  const groups = {};
  const sizeMap = { 'large': 'كبير', 'small': 'صغير', 'medium': 'وسط' };
  
  rads.forEach((r, idx) => {
    const key = r.radiology_film_id ? `film_${r.radiology_film_id}` : `standalone_${idx}`;
    
    if (!groups[key]) {
      let translatedSize = r.film_size ? (sizeMap[r.film_size.toLowerCase()] || r.film_size) : '';
      groups[key] = {
        film_type: (r.with_film === 0 || r.with_film === false) 
          ? 'بدون فيلم' 
          : (translatedSize ? `فيلم ${translatedSize}` : 'فيلم مجمّع'),
        items: [],
        result_notes: r.result_notes,
        result_file: r.result_file
      };
    }
    
    groups[key].items.push(r);
    
    if (r.result_notes && !groups[key].result_notes) groups[key].result_notes = r.result_notes;
    if (r.result_file && !groups[key].result_file) groups[key].result_file = r.result_file;
  });
  
  return Object.values(groups);
};

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


// ─────────────────────────────────────────────────────────────────────────────
// RxFavoritesDropdown Component
// ─────────────────────────────────────────────────────────────────────────────
const RxFavoritesDropdown = ({ favoriteMeds, onSelect, isMaximized = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredMeds = (favoriteMeds || []).filter(fav => 
    fav.medication_name && fav.medication_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs min-w-[160px] bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl font-black text-slate-700 transition-all focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 justify-between shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Star size={14} className="text-amber-500 fill-amber-400 flex-shrink-0" />
          <span className="truncate">إضافة من المفضلة</span>
        </div>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 sm:w-80 max-w-[calc(100vw-2.5rem)] bg-white border border-slate-200 shadow-2xl rounded-2xl z-[60] overflow-hidden flex flex-col animate-scale-in">
          {/* Enhanced Search Input */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/80">
            <div className="relative flex items-center">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
              <input
                type="text"
                autoFocus
                placeholder="ابحث باسم الدواء..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
                className="w-full pr-8 pl-8 py-2 text-xs font-bold bg-white border border-slate-200/90 hover:border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/80 rounded-xl outline-none text-slate-800 placeholder-slate-400 shadow-2xs transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSearch(''); }}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="مسح البحث"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Meds List */}
          <div className="max-h-64 overflow-y-auto custom-scrollbar bg-white">
            {filteredMeds.length === 0 ? (
              <div className="p-6 text-center flex flex-col items-center justify-center">
                <Star size={24} className="text-slate-200 mb-2" />
                <span className="text-xs text-slate-400 font-bold">لا يوجد دواء مطابق</span>
              </div>
            ) : (
              <div className="p-1.5 space-y-1">
                {filteredMeds.map(fav => (
                  <button
                    key={fav.id}
                    type="button"
                    onClick={() => {
                      onSelect(fav);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className="w-full flex flex-col items-start px-3 py-2 text-right transition-all hover:bg-indigo-50/80 rounded-xl group border border-transparent hover:border-indigo-100/80 cursor-pointer"
                  >
                    <span className="text-xs font-black text-slate-800 group-hover:text-indigo-700 truncate w-full text-right">
                      {fav.medication_name}
                    </span>
                    {(fav.dosage || fav.frequency || fav.duration) && (
                      <div className="flex items-center flex-wrap gap-1.5 mt-1 text-right">
                        {fav.dosage && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 group-hover:bg-indigo-100/80 border border-indigo-100/60 text-[10px] font-black font-mono tracking-tight" dir="ltr">
                            {toEnglishDigits(fav.dosage)}
                          </span>
                        )}
                        {fav.frequency && (
                          <span className="inline-flex items-center text-[10px] font-bold text-slate-500 group-hover:text-indigo-600">
                            {fav.dosage && <span className="text-slate-300 ml-1.5">•</span>}
                            {toEnglishDigits(fav.frequency)}
                          </span>
                        )}
                        {fav.duration && (
                          <span className="inline-flex items-center text-[10px] font-semibold text-slate-400 group-hover:text-indigo-500">
                            {(fav.dosage || fav.frequency) && <span className="text-slate-300 ml-1.5">•</span>}
                            {toEnglishDigits(fav.duration)}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};




export default function PatientEMRModal({

  isOpen,
  onClose,
  patient,
  readOnly = false,
  isArchiveScreen = false,
  historyLoading = false,
  patientHistory = [],
  selectedVisit = null,
  onSelectVisit,
  prescriptionItems = [],
  loadingPrescription = false,
  onPrintPrescription,
  onFinishVisit,
  onReferToSurgery,
  renderActiveActions,
  onRequestServices,
  startMaximized = false,
  onCancelOrder,
  visit = null,
  favoriteMeds = [],
  catalogs = {},
  onPrescriptionSave,
  onRefresh,
  closeOnBackdropClick = true,
}) {
  const latestPatientEvent = useSocketStore(state => state.latestPatientEvent);
  const latestLabEvent = useSocketStore(state => state.latestLabEvent);
  const latestRadiologyEvent = useSocketStore(state => state.latestRadiologyEvent);
  const latestSilentUpdate = useSocketStore(state => state.latestSilentUpdate);
  const lastFetchRef = useRef(0);
  
  const [emrTab, setEmrTab] = usePersistentState('emr_active_tab', 'timeline');
  const [isMaximized, setIsMaximized] = useState(startMaximized);
  const [previewFile, setPreviewFile] = useState(null);
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  const [resolvedPreview, setResolvedPreview] = useState(null);

  // ── Collapsible Sections State (Services, Results & Discounts) ──
  const [openServiceSections, setOpenServiceSections] = useState({
    lab: false,
    radiology: false,
    clinical: false,
  });
  const [openResultSections, setOpenResultSections] = useState({
    lab: false,
    radiology: false,
    clinical: false,
  });
  const [openDiscountsSection, setOpenDiscountsSection] = useState(false);

  const toggleServiceSection = (key) => {
    setOpenServiceSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleResultSection = (key) => {
    setOpenResultSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleDiscountsSection = () => {
    setOpenDiscountsSection(prev => !prev);
  };


  // ── Time Machine Logic ──
  const activeVisitId = visit?.visitId || visit?.id;
  const selectedVisitId = selectedVisit?.id || selectedVisit?.visitId;
  const isHistoricalView = Boolean(selectedVisitId && activeVisitId && String(selectedVisitId) !== String(activeVisitId));
  const showArchiveHeader = isHistoricalView || isArchiveScreen;
  const isVisitCancelled = Boolean(
    (selectedVisit && (selectedVisit.status === 'cancelled' || selectedVisit.visit_status === 'cancelled')) ||
    (!selectedVisit && (visit?.status === 'cancelled' || visit?.visit_status === 'cancelled' || patient?.status === 'cancelled' || patient?.visit_status === 'cancelled'))
  );
  const effectiveReadOnly = readOnly || showArchiveHeader || isVisitCancelled;

  const currentIndex = patientHistory?.findIndex(v => String(v.id || v.visitId) === String(selectedVisit?.id || selectedVisit?.visitId || visit?.id || visit?.visitId));
  const hasNewerVisit = currentIndex > 0;
  const newerVisit = hasNewerVisit ? patientHistory[currentIndex - 1] : null;

  const currentVisitForType = selectedVisit || visit || patient;
  let visitTypeLabel = "زيارة جديدة";
  if (Boolean(currentVisitForType?.is_follow_up === 1 || currentVisitForType?.is_follow_up === true)) {
    visitTypeLabel = "مراجعة";
  }

  // ── Results Availability Guard ──
  const completedLabs = (selectedVisit?.labTests || selectedVisit?.lab_tests || []).filter(t => t.status === 'completed');
  const completedRads = (selectedVisit?.radiologyTests || selectedVisit?.radiology_tests || []).filter(t => t.status === 'completed' || t.result_notes);
  const completedClinics = (selectedVisit?.clinicalServices || selectedVisit?.clinical_services || []).filter(t => t.status === 'completed' || t.result_notes);
  const hasResults = Boolean(selectedVisit && (completedLabs.length > 0 || completedRads.length > 0 || completedClinics.length > 0));

  useEffect(() => {
    if (emrTab === 'results' && !hasResults) {
      setEmrTab('timeline');
    }
  }, [hasResults, emrTab, setEmrTab]);

  // ── Rx Form State ──
  const { token } = useAuthStore();
  const headers = { Authorization: `Bearer ${token}` };
  const [rxItems, setRxItems] = useState([]);
  const canEditVisit = true;

  useEffect(() => {
    if (latestPatientEvent?.timestamp && latestPatientEvent.timestamp > lastFetchRef.current) {
      if (latestPatientEvent.patientId === patient?.id || latestPatientEvent.patient_id === patient?.id) {
        lastFetchRef.current = Date.now();
        if (onRefresh) onRefresh();
      }
    }
  }, [latestPatientEvent, patient, onRefresh]);

  // ── Live hydration for lab & radiology results ──
  useEffect(() => {
    const visitId = visit?.visitId || visit?.id;
    if (!visitId || !latestLabEvent?.timestamp) return;
    if (latestLabEvent.timestamp > lastFetchRef.current) {
      if (!latestLabEvent.visitId || String(latestLabEvent.visitId) === String(visitId)) {
        lastFetchRef.current = Date.now();
        if (onRefresh) onRefresh();
      }
    }
  }, [latestLabEvent, visit, onRefresh]);

  useEffect(() => {
    const visitId = visit?.visitId || visit?.id;
    if (!visitId || !latestRadiologyEvent?.timestamp) return;
    if (latestRadiologyEvent.timestamp > lastFetchRef.current) {
      if (!latestRadiologyEvent.visitId || String(latestRadiologyEvent.visitId) === String(visitId)) {
        lastFetchRef.current = Date.now();
        if (onRefresh) onRefresh();
      }
    }
  }, [latestRadiologyEvent, visit, onRefresh]);

  useEffect(() => {
    const visitId = visit?.visitId || visit?.id;
    if (!visitId || !latestSilentUpdate?.timestamp) return;
    if (latestSilentUpdate.timestamp > lastFetchRef.current) {
      if (!latestSilentUpdate.visitId || String(latestSilentUpdate.visitId) === String(visitId)) {
        lastFetchRef.current = Date.now();
        if (onRefresh) onRefresh();
      }
    }
  }, [latestSilentUpdate, visit, onRefresh]);

  const [labTests, setLabTests] = useState([]);
  const [radiologyTests, setRadiologyTests] = useState([]);
  const [viewLabResult, setViewLabResult] = useState(null);
  const [viewRadResult, setViewRadResult] = useState(null);
  const [activeResultViewer, setActiveResultViewer] = useState({
    isOpen: false,
    results: [],
    currentIndex: 0
  });
  const [rxMedName, setRxMedName] = useState('');
  const [rxDosage, setRxDosage] = useState('');
  const [rxFrequency, setRxFrequency] = useState('');
  const [rxDuration, setRxDuration] = useState('');
  const [rxInstructions, setRxInstructions] = useState('');
  const [savingRx, setSavingRx] = useState(false);
  const [favSearch, setFavSearch] = useState('');
  const [executingServiceId, setExecutingServiceId] = useState(null);
  const [executedServiceIds, setExecutedServiceIds] = useState(() => new Set());

  useEffect(() => {
    setExecutedServiceIds(new Set());
  }, [selectedVisit?.id]);

  const handleExecuteClinicalService = async (serviceId, serviceName) => {
    setExecutingServiceId(serviceId);
    try {
      const res = await axios.put(
        `/api/doctor/clinical-service/${serviceId}/complete`,
        {},
        { headers }
      );
      toast.success(res.data?.message || `تم تنفيذ خدمة ${serviceName || ''} بنجاح`);

      setExecutedServiceIds(prev => new Set([...prev, serviceId]));

      // Update local selectedVisit state immediately
      if (selectedVisit) {
        const updateClins = (clins = []) => clins.map(c => 
          c.id === serviceId ? { ...c, status: 'completed', performed_at: new Date().toISOString() } : c
        );
        if (selectedVisit.clinicalServices) {
          selectedVisit.clinicalServices = updateClins(selectedVisit.clinicalServices);
        }
        if (selectedVisit.clinical_services) {
          selectedVisit.clinical_services = updateClins(selectedVisit.clinical_services);
        }
      }

      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل تنفيذ الخدمة السريرية');
    } finally {
      setExecutingServiceId(null);
    }
  };

  const syncRxItems = async (itemsToSync) => {
    setSavingRx(true);
    try {
      const vId = visit?.visitId || visit?.id || patient?.visitId;
      await axios.post(
        `/api/doctor/visit/${vId}/prescription`,
        { items: itemsToSync },
        { headers }
      );
      if (onPrescriptionSave) onPrescriptionSave(itemsToSync);
    } catch {
      toast.error('فشل حفظ الوصفة الطبية في الخلفية');
    } finally {
      setSavingRx(false);
    }
  };

  useEffect(() => {
    if (prescriptionItems && prescriptionItems.length > 0) {
      setRxItems(prescriptionItems);
    } else {
      setRxItems([]);
    }
  }, [prescriptionItems, selectedVisit]);


  const handleAddRxItem = () => {
    if (!rxMedName.trim()) {
      toast.error('الرجاء إدخال اسم الدواء');
      return;
    }
    const newItem = {
      medication_name: rxMedName.trim(),
      dosage: toEnglishDigits(rxDosage.trim()),
      frequency: toEnglishDigits(rxFrequency.trim()),
      duration: toEnglishDigits(rxDuration.trim()),
      instructions: toEnglishDigits(rxInstructions.trim())
    };
    const updatedItems = [...rxItems, newItem];
    setRxItems(updatedItems);
    syncRxItems(updatedItems);
    setRxMedName(''); setRxDosage(''); setRxFrequency(''); setRxDuration(''); setRxInstructions('');
  };




  useEffect(() => {
    if (!previewFile) {
      setResolvedPreview(null);
      return;
    }
    const rawFile = previewFile.file_url || previewFile.result_file || previewFile.attachment;
    const resolved = resolveFileUrl(rawFile);
    setResolvedPreview(resolved);

    return () => {
      if (resolved && resolved.url && resolved.url.startsWith('blob:')) {
        URL.revokeObjectURL(resolved.url);
      }
    };
  }, [previewFile]);

  // ── Pending Services Calculation (Guardrail for "End Examination") ──
  const isCurrentActiveVisit = Boolean(
    !selectedVisit || !activeVisitId || String(selectedVisit.id) === String(activeVisitId)
  );
  const targetVisitForServices = (isCurrentActiveVisit && selectedVisit) ? selectedVisit : (visit || selectedVisit);

  const currentLabs = 
    targetVisitForServices?.labTests || 
    targetVisitForServices?.labRequests || 
    targetVisitForServices?.lab_tests || 
    visit?.labRequests || 
    [];

  const currentRads = 
    targetVisitForServices?.radiologyTests || 
    targetVisitForServices?.radiologyRequests || 
    targetVisitForServices?.radiology_tests || 
    visit?.radiologyRequests || 
    [];

  const currentClinics = 
    targetVisitForServices?.clinicalServices || 
    targetVisitForServices?.clinicalRequests || 
    targetVisitForServices?.clinical_services || 
    visit?.clinicalRequests || 
    [];

  const pendingLabsCount = currentLabs.filter(
    r => !['completed', 'cancelled', 'refunded'].includes(r.status)
  ).length;

  const pendingRadsCount = currentRads.filter(
    r => !['completed', 'cancelled', 'refunded'].includes(r.status)
  ).length;

  const pendingClinicsCount = currentClinics.filter(
    r => !['completed', 'cancelled', 'refunded'].includes(r.status) && !executedServiceIds.has(r.id)
  ).length;

  const totalPendingServices = pendingLabsCount + pendingRadsCount + pendingClinicsCount;
  const hasPendingServices = totalPendingServices > 0;

  if (!isOpen || !patient) return null;

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
          {/* Background Overlay */}
          <div className="absolute inset-0" onClick={closeOnBackdropClick ? onClose : undefined} />
          
          {/* Modal Container */}
          <div className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/60 ${isMaximized ? 'w-[98vw] h-[98vh] rounded-[2.5rem]' : 'w-full max-w-5xl h-full max-h-[90vh] rounded-[2rem]'}`}>
            
            {/* Top Control Bar (Doctor Primary Blue Theme matching Reports modal) */}
            <div className={`${isMaximized ? 'px-6 sm:px-8 py-3' : 'px-5 py-2.5'} flex items-center justify-between flex-shrink-0 shadow-md text-white transition-colors duration-300 bg-gradient-to-r from-blue-700 via-blue-600 to-blue-700 z-30`}>
              <div className="flex items-center gap-2">
                <Layers size={isMaximized ? 18 : 16} />
                <span className={`${isMaximized ? 'text-xs sm:text-sm' : 'text-xs'} font-black tracking-wide drop-shadow-sm`}>
                  {showArchiveHeader 
                    ? `السجل السريري المؤرشف للمريض (${patient?.full_name || patient?.name || '...'}) — للقراءة فقط`
                    : `الملف الطبي الشامل للمريض (${patient?.full_name || patient?.name || '...'})`}
                </span>
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                {!effectiveReadOnly && (
                  <>
                    {onReferToSurgery && (
                      <button 
                        onClick={onReferToSurgery} 
                        className={`${isMaximized ? 'h-8 px-3.5 text-xs sm:text-sm' : 'h-7 px-2.5 text-xs'} flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all shadow-sm font-black cursor-pointer active:scale-95`} 
                        title="تحويل المريض للعمليات"
                      >
                        <Scissors size={isMaximized ? 14 : 13} strokeWidth={2.2} />
                        <span>إحالة</span>
                      </button>
                    )}
                    {onFinishVisit && !hasPendingServices && (
                      <button 
                        onClick={onFinishVisit} 
                        className={`${isMaximized ? 'h-8 px-3.5 text-xs sm:text-sm' : 'h-7 px-2.5 text-xs'} flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white hover:text-emerald-100 rounded-lg transition-all shadow-sm font-black cursor-pointer active:scale-95`} 
                        title="إنهاء المعاينة"
                      >
                        <CheckCircle size={isMaximized ? 14 : 13} strokeWidth={2.2} />
                        <span>إنهاء</span>
                      </button>
                    )}
                  </>
                )}
                {hasPendingServices && (
                  <div
                    className={`${isMaximized ? 'h-8 px-3.5 text-xs sm:text-sm' : 'h-7 px-2.5 text-xs'} flex items-center gap-1.5 bg-white/20 text-white rounded-lg font-black shadow-sm select-none`}
                    title={`توجد ${totalPendingServices} خدمات معلقة لم تكتمل بعد`}
                  >
                    <Clock size={isMaximized ? 14 : 13} strokeWidth={2.2} className="text-white animate-spin" />
                    <span>بانتظار {totalPendingServices} خدمة</span>
                  </div>
                )}
                {((!effectiveReadOnly && (onReferToSurgery || onFinishVisit)) || hasPendingServices) && (
                  <div className="w-px h-4 bg-white/25 mx-0.5" />
                )}
                <button onClick={() => setIsMaximized(!isMaximized)} className={`${isMaximized ? 'w-8 h-8' : 'w-7 h-7'} flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all shadow-sm cursor-pointer active:scale-95`} title={isMaximized ? 'تصغير' : 'تكبير'}>
                  {isMaximized ? <Minimize2 size={isMaximized ? 16 : 15} /> : <Maximize2 size={isMaximized ? 16 : 15} />}
                </button>
                <button onClick={onClose} className={`${isMaximized ? 'w-8 h-8' : 'w-7 h-7'} flex items-center justify-center bg-white/20 hover:bg-white/30 text-white hover:text-red-100 rounded-lg transition-all shadow-sm cursor-pointer active:scale-95`} title="إغلاق">
                  <X size={isMaximized ? 16 : 15} />
                </button>
              </div>
            </div>

            {/* Modal Header — Matching Archived Record Modal Spacing & Layout */}
            {(() => {
              const displayVisit = selectedVisit || visit || patient;
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
                <div className={`bg-white ${isMaximized ? 'px-6 sm:px-8 py-3.5 sm:py-4' : 'px-5 sm:px-6 py-3.5'} flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-100 shrink-0 z-20`}>
                  <div className={`flex items-center ${isMaximized ? 'gap-3.5 sm:gap-4' : 'gap-3 sm:gap-3.5'}`}>
                    <div className={`${isMaximized ? 'w-12 h-12 sm:w-13 sm:h-13 rounded-xl' : 'w-11 h-11 sm:w-12 sm:h-12 rounded-xl'} bg-gradient-to-br from-slate-50 to-sky-100 flex items-center justify-center text-sky-600 shadow-inner border border-sky-100/60 shrink-0`}>
                      <User size={isMaximized ? 22 : 20} strokeWidth={1.8} className="sm:hidden" />
                      <User size={isMaximized ? 24 : 22} strokeWidth={1.8} className="hidden sm:block" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center flex-wrap gap-2">
                        <h2 className="text-base sm:text-lg font-black text-slate-800 tracking-tight leading-none">
                          {patient?.full_name || patient?.patient_name || patient?.name || displayVisit?.full_name || visit?.full_name || '...'}
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
                          <User size={11}/> {
                            typeof (patient?.id) === 'object' && patient?.id !== null
                              ? (patient?.id?.id || patient?.id?.patient_id || '...')
                              : (patient?.id || patient?.patient_id || displayVisit?.patient_id || visit?.patient_id || '...')
                          }
                        </span>
                        {((patient?.gender || displayVisit?.gender || visit?.gender) || (patient?.age || displayVisit?.age || visit?.age)) && (
                          <span className="flex items-center gap-1 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md font-black text-slate-600 bg-slate-100/80 border border-slate-200/60">
                            {(patient?.gender || displayVisit?.gender || visit?.gender) ? ((patient?.gender || displayVisit?.gender || visit?.gender) === 'male' || (patient?.gender || displayVisit?.gender || visit?.gender) === 'ذكر' ? 'ذكر' : 'أنثى') : ''}
                            {(patient?.gender || displayVisit?.gender || visit?.gender) && (patient?.age || displayVisit?.age || visit?.age) ? ' — ' : ''}
                            {(patient?.age || displayVisit?.age || visit?.age) ? `${patient?.age || displayVisit?.age || visit?.age} سنة` : ''}
                          </span>
                        )}
                        {(() => {
                          const rawPhone = patient?.phone || displayVisit?.phone || visit?.phone;
                          const hasPhone = rawPhone && String(rawPhone).trim() !== '' && rawPhone !== 'بدون هاتف' && rawPhone !== '-' && rawPhone !== '—';
                          if (!hasPhone) return null;
                          return (
                            <span className="flex items-center gap-1 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md font-black text-sky-600 bg-sky-50 border border-sky-100/60">
                              <Phone size={11}/> <span dir="ltr">{rawPhone}</span>
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Plain Text Date, Visit ID & Actions */}
                  <div className={`flex flex-col items-start md:items-end ${isMaximized ? 'gap-1.5' : 'gap-1'} self-stretch md:self-auto`}>
                    <div className={`flex items-center gap-1.5 text-slate-500 font-bold ${isMaximized ? 'text-xs sm:text-sm' : 'text-xs'}`}>
                      <Calendar size={isMaximized ? 15 : 13} className="text-sky-600 opacity-80" />
                      <span dir="ltr">{new Date(displayVisit?.created_at || Date.now()).toLocaleDateString('en-GB')}</span>
                      <span className="text-slate-300 mx-0.5">•</span>
                      <span dir="ltr">{new Date(displayVisit?.created_at || Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                    </div>
                    
                    <div className={`flex items-center gap-1 ${isMaximized ? 'text-xs font-black' : 'text-[10px] sm:text-[11px] font-black'} text-slate-400`}>
                      <span>معرف الزيارة:</span>
                      <span className="text-slate-600 font-bold" dir="ltr">{displayVisit?.visit_number || displayVisit?.id || displayVisit?.visitId || '—'}</span>
                    </div>

                    {!effectiveReadOnly && renderActiveActions && (
                      <div className="mt-0.5">
                        {renderActiveActions()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

          {/* Explanatory Message Banner for Cancelled Visit */}
          {Boolean(isVisitCancelled) && (
            <div className={`bg-rose-50/95 border-b border-rose-200/90 ${isMaximized ? 'px-6 sm:px-8 py-3' : 'px-5 sm:px-6 py-2.5'} flex items-center justify-between gap-3 text-rose-800 flex-shrink-0 shadow-2xs`}>
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
            onSelectVisit={onSelectVisit} 
            visit={visit} 
            isMaximized={isMaximized}
          />
          {/* Tab bar and Global Actions */}
          <div className="flex flex-col md:flex-row justify-center items-center border-b border-gray-150 px-4 py-2 bg-gray-50/50 flex-shrink-0 gap-3">
            <div className="flex justify-center gap-2 text-xs font-bold text-gray-500 overflow-x-auto w-full pb-1 md:pb-0">
              {[
                { id: 'timeline', label: 'الخدمات والفحوصات', icon: History },
                ...(hasResults ? [{ id: 'results', label: 'النتائج', icon: Eye }] : []),
                { id: 'prescription', label: 'الخطة العلاجية', icon: Pill }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setEmrTab(tab.id)}
                  className={`flex items-center gap-1.5 px-6 py-2.5 rounded-xl transition-all whitespace-nowrap text-xs ${
                    emrTab === tab.id
                      ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100 ring-1 ring-indigo-50 font-black'
                      : 'hover:bg-gray-100 text-gray-500 font-bold'
                  }`}
                >
                  <tab.icon size={15} />
                  {tab.label}
                </button>
              ))}
            </div>

            
          </div>

          {/* Scroll Content */}
          <div className="flex-1 overflow-y-auto bg-slate-50 min-h-0">
            <div className={`${isMaximized ? 'w-full max-w-[1720px] mx-auto px-6 sm:px-8 lg:px-10 py-6' : 'p-6'}`}>
              {!selectedVisit ? (
                <div className="text-center py-20 text-gray-400 text-xs font-bold">
                  قم باختيار زيارة من القائمة اليمنى لعرض تفاصيلها الطبية المؤرشفة.
                </div>
              ) : (
                <div>
                  {/* ═════════════════════════════════════════════════════════════════ */}
                  {/* 🩺 PROMINENT CLINICAL SERVICES EXECUTION HERO SECTION          */}
                  {/* ═════════════════════════════════════════════════════════════════ */}
                  {(() => {
                    const currentClinics = selectedVisit?.clinicalServices || selectedVisit?.clinical_services || [];
                    const pendingExec = currentClinics.filter(c => c.status === 'paid' && !executedServiceIds.has(c.id));
                    if (pendingExec.length === 0) return null;

                    return (
                      <div className="bg-white rounded-2xl border border-purple-200 shadow-sm ring-1 ring-purple-100/70 overflow-hidden mb-6 transition-all duration-300">
                        {/* Top Header Bar */}
                        <div className="px-6 py-4 bg-gradient-to-r from-purple-50/90 via-indigo-50/40 to-purple-50/90 border-b border-purple-100 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-sm flex-shrink-0">
                              <Stethoscope size={16} />
                            </div>
                            <div className="flex items-center gap-2.5">
                              <h3 className="font-extrabold text-xs md:text-sm text-gray-800">
                                تنفيذ الخدمات السريرية المطلوبة
                              </h3>
                              <span className="bg-purple-100 text-purple-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-purple-200">
                                {pendingExec.length}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-purple-700 bg-white/90 border border-purple-200 px-3 py-1 rounded-lg shadow-xs">
                            بانتظار إجراء الطبيب
                          </span>
                        </div>

                        {/* 3-Column Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-right text-xs border-collapse bg-white">
                            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold text-xs">
                              <tr>
                                <th className="px-4 py-3.5 w-14 text-center">#</th>
                                <th className="px-5 py-3.5">اسم الخدمة</th>
                                <th className="px-5 py-3.5 w-64 text-center">تاريخ ووقت الطلب</th>
                                <th className="px-5 py-3.5 w-44 text-center">الإجراء</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {pendingExec.map((srv, idx) => {
                                const dateObj = srv.created_at ? new Date(srv.created_at) : null;
                                const reqDate = dateObj
                                  ? dateObj.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' })
                                  : '—';
                                const reqTime = dateObj
                                  ? dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
                                  : '';

                                return (
                                  <tr key={srv.id || idx} className="hover:bg-purple-50/25 transition-colors">
                                    <td className="px-4 py-3.5 text-center font-bold text-gray-400">{idx + 1}</td>
                                    <td className="px-5 py-3.5 align-middle">
                                      <span className="inline-flex items-center px-3 py-1.5 bg-purple-50 border border-purple-100 text-purple-900 rounded-xl text-xs font-black">
                                        {srv.name}
                                      </span>
                                    </td>
                                    <td className="px-5 py-3.5 text-center align-middle">
                                      <span className="inline-flex items-center justify-center px-3 py-1.5 bg-slate-50 border border-slate-200/80 text-slate-700 text-xs font-bold tracking-wide rounded-xl" dir="ltr">
                                        {reqDate} · {reqTime}
                                      </span>
                                    </td>
                                    <td className="px-5 py-3.5 text-center align-middle">
                                      {!effectiveReadOnly ? (
                                        <button
                                          onClick={() => handleExecuteClinicalService(srv.id, srv.name)}
                                          disabled={executingServiceId === srv.id}
                                          className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-sm hover:shadow transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
                                        >
                                          {executingServiceId === srv.id ? (
                                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                          ) : (
                                            <CheckCircle size={14} className="text-white" />
                                          )}
                                          <span>تنفيذ الخدمة</span>
                                        </button>
                                      ) : (
                                        <span className="text-gray-300 font-bold">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── TIMELINE TAB (Unified Services & Lab/Rad/Clinical Orders) ── */}
                  {emrTab === 'timeline' && (
                    <div className="space-y-5 modal-overlay-anim">
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
                            badgeClass: 'bg-blue-50 text-blue-700 border-blue-200/70',
                            dotClass: 'bg-blue-500 animate-pulse',
                          },
                          pending_payment: {
                            label: 'بانتظار الدفع',
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

                        const statusBadge = (status) => {
                          const config = STATUS_CONFIG[status] || {
                            label: status || 'غير محدد',
                            badgeClass: 'bg-slate-50 text-slate-600 border-slate-200',
                            dotClass: 'bg-slate-400',
                          };

                          return (
                            <span className={`inline-flex items-center gap-1.5 ${isMaximized ? 'px-3 py-1.5 text-xs' : 'px-2.5 py-1 text-[11px]'} rounded-full font-bold border shadow-2xs whitespace-nowrap ${config.badgeClass}`}>
                              <span className={`${isMaximized ? 'w-2 h-2' : 'w-1.5 h-1.5'} rounded-full shrink-0 ${config.dotClass}`} />
                              <span>{config.label}</span>
                            </span>
                          );
                        };

                        // ── Cancel-eligibility guard ──
                        const canCancelOrder = (item) => {
                          const isFree = item.is_free === true || item.is_free === 1 || parseFloat(item.final_price || item.price || 0) === 0;
                          const isNotExecuted = item.status === 'pending' || (isFree && item.status === 'paid');
                          const isAwaitingPayment = item.status === 'pending_payment';
                          return (isFree && isNotExecuted) || (!isFree && isAwaitingPayment);
                        };

                        if (sortedItems.length === 0) {
                          return (
                            <div className="space-y-3 mt-4">
                              <div className="pt-1">
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                    <div className="w-14 h-14 bg-gradient-to-br from-slate-50 to-blue-50/80 rounded-2xl flex items-center justify-center mb-3.5 shadow-xs border border-blue-100/60 text-blue-500">
                                      <FileText size={26} strokeWidth={1.8} />
                                    </div>
                                    <h3 className="text-sm sm:text-base font-black text-slate-800 mb-1 tracking-tight">
                                      لا توجد خدمات أو فحوصات مسجلة
                                    </h3>
                                    <p className="text-xs max-w-sm font-semibold text-slate-400 leading-relaxed">
                                      {effectiveReadOnly
                                        ? 'لا توجد أي تحاليل مخبرية، فحوصات أشعة، أو خدمات سريرية مسجلة في هذا السجل المؤرشف.'
                                        : 'لا توجد أي تحاليل مخبرية، فحوصات أشعة، أو خدمات سريرية مطلوبة لهذه الزيارة حتى الآن.'
                                      }
                                    </p>

                                    {!effectiveReadOnly && (onRequestServices || renderActiveActions) && (
                                      <div className="mt-4">
                                        <button
                                          onClick={() => {
                                            if (typeof onRequestServices === 'function') {
                                              onRequestServices();
                                            }
                                          }}
                                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs hover:shadow-sm hover:shadow-indigo-500/20 transition-all cursor-pointer group"
                                        >
                                          <Plus size={14} strokeWidth={2.5} className="group-hover:rotate-90 transition-transform duration-200" />
                                          <span>طلب خدمات وفحوصات</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        // Calculations for totals & separate free/discounted items section
                        const calcItemFinalPrice = (item) => {
                          if (item.status === 'cancelled' || item.status === 'refunded') return 0;
                          const isFree = Boolean(item.is_free === 1 || item.is_free === true || parseFloat(item.final_price ?? item.price ?? 0) === 0);
                          return isFree ? 0 : (parseFloat(item.final_price ?? item.price ?? 0) || 0);
                        };

                        const calcSectionTotal = (items) => items.reduce((acc, curr) => acc + calcItemFinalPrice(curr), 0);

                        const labTotal = calcSectionTotal(labs);
                        const radTotal = calcSectionTotal(rads);
                        const clinicTotal = calcSectionTotal(clinics);
                        const totalApprovedPrice = labTotal + radTotal + clinicTotal;

                        // Sort helper: active services first, refunded/cancelled at the end
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

                        const serviceSections = [
                          {
                            key: 'lab',
                            title: 'قسم المختبر',
                            countUnit: 'تحليل',
                            itemColHeader: 'التحليل',
                            icon: FlaskConical,
                            items: sortSectionItems(labs.map(i => ({ ...i, categoryKey: 'lab', svcType: 'lab' }))),
                            total: labTotal,
                            categoryKey: 'lab',
                            color: {
                              border: 'border-purple-200/90 hover:border-purple-300',
                              headerBg: 'bg-gradient-to-r from-purple-50/80 via-white to-purple-50/40',
                              iconBox: 'bg-purple-100 text-purple-700 border border-purple-200/70',
                              badge: 'bg-purple-50 text-purple-800 border-purple-200/90 shadow-2xs',
                              totalBg: 'bg-purple-50/90 border-purple-200/80 text-purple-900',
                              totalNum: 'text-purple-700',
                            }
                          },
                          {
                            key: 'radiology',
                            title: 'قسم الأشعة',
                            countUnit: 'فحص',
                            itemColHeader: 'الأشعة',
                            icon: Radiation,
                            items: sortSectionItems(rads.map(i => ({ ...i, categoryKey: 'radiology', svcType: 'radiology' }))),
                            total: radTotal,
                            categoryKey: 'radiology',
                            color: {
                              border: 'border-sky-200/90 hover:border-sky-300',
                              headerBg: 'bg-gradient-to-r from-sky-50/80 via-white to-sky-50/40',
                              iconBox: 'bg-sky-100 text-sky-700 border border-sky-200/70',
                              badge: 'bg-sky-50 text-sky-800 border-sky-200/90 shadow-2xs',
                              totalBg: 'bg-sky-50/90 border-sky-200/80 text-sky-900',
                              totalNum: 'text-sky-700',
                            }
                          },
                          {
                            key: 'clinical',
                            title: 'قسم الخدمات السريرية',
                            countUnit: 'خدمة',
                            itemColHeader: 'الخدمة',
                            icon: Stethoscope,
                            items: sortSectionItems(clinics.map(i => ({ ...i, categoryKey: 'clinical', svcType: 'clinical' }))),
                            total: clinicTotal,
                            categoryKey: 'clinical',
                            color: {
                              border: 'border-teal-200/90 hover:border-teal-300',
                              headerBg: 'bg-gradient-to-r from-teal-50/80 via-white to-teal-50/40',
                              iconBox: 'bg-teal-100 text-teal-700 border border-teal-200/70',
                              badge: 'bg-teal-50 text-teal-800 border-teal-200/90 shadow-2xs',
                              totalBg: 'bg-teal-50/90 border-teal-200/80 text-teal-900',
                              totalNum: 'text-teal-700',
                            }
                          }
                        ];

                        const consultationFee = (selectedVisit?.is_exempt === 1 || selectedVisit?.is_exempt === true)
                          ? parseFloat(selectedVisit?.consultation_fee || 0)
                          : 0;

                        const freeOrDiscountedItems = sortedItems.filter(item => {
                          if (item.status === 'cancelled' || item.status === 'refunded') return false;
                          const orig = parseFloat(item.price || item.cost || 0);
                          const final = parseFloat(item.final_price !== null && item.final_price !== undefined ? item.final_price : orig);
                          const disc = parseFloat(item.discount_amount || item.discount || 0);
                          const isFree = Boolean(item.is_free === 1 || item.is_free === true || final === 0);
                          return isFree || disc > 0 || orig > final;
                        });

                        const servicesDiscountTotal = freeOrDiscountedItems.reduce((acc, curr) => {
                          const orig = parseFloat(curr.price || curr.cost || 0);
                          const final = parseFloat(curr.final_price !== null && curr.final_price !== undefined ? curr.final_price : orig);
                          const disc = parseFloat(curr.discount_amount || curr.discount || 0);
                          const isFree = Boolean(curr.is_free === 1 || curr.is_free === true || final === 0);
                          if (isFree) return acc + orig;
                          return acc + Math.max(disc, orig - final);
                        }, 0);

                        const totalDiscountsAndExemptions = Math.round(consultationFee + servicesDiscountTotal);

                        return (
                          <div className="space-y-6">
                            {/* ── SECTION 1: ALL ORDERED SERVICES (COLLAPSIBLE ACCORDIONS) ── */}
                            <div className="space-y-4">
                                {/* Floating Header */}
                                <div className="flex items-center justify-between px-1">
                                  <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-sky-100/80 rounded-lg text-sky-600 shadow-sm">
                                      <History size={16} />
                                    </div>
                                    <h3 className="text-sm font-black text-slate-700">الخدمات والفحوصات</h3>
                                    <span className="text-xs px-2.5 py-0.5 font-extrabold bg-sky-50 text-sky-700 rounded-full border border-sky-200/60 tabular-nums tracking-tight">
                                      {formatCountUnit(sortedItems.filter(i => i.status !== 'refunded' && i.status !== 'cancelled').length, 'خدمة')}
                                    </span>
                                  </div>
                                </div>

                                {/* 3 Collapsible Department Accordions */}
                                <div className="space-y-3">
                                  {serviceSections.filter(sec => sec.items.length > 0).map((sec) => {
                                    const isOpen = Boolean(openServiceSections[sec.key]);
                                    const IconComponent = sec.icon;
                                    const hasActionCol = !effectiveReadOnly && Boolean(onCancelOrder);
                                    const count = sec.items.filter(i => i.status !== 'refunded' && i.status !== 'cancelled').length;

                                    return (
                                      <div
                                        key={sec.key}
                                        className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-xs ${sec.color.border}`}
                                      >
                                        {/* Accordion Header Bar */}
                                        <div
                                          onClick={() => toggleServiceSection(sec.key)}
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

                                          <div className="flex items-center gap-3">
                                            {/* Section subtotal (Always visible on header) */}
                                            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold ${sec.color.totalBg}`}>
                                              <span className="text-slate-500 font-medium">إجمالي المبلغ:</span>
                                              <span className={`font-extrabold tabular-nums tracking-tight text-sm ${sec.color.totalNum}`}>
                                                {Math.round(sec.total).toLocaleString('en-US')}
                                              </span>
                                              <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                                            </div>

                                            <div className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-700 shadow-2xs">
                                              <ChevronDown
                                                size={16}
                                                className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                                              />
                                            </div>
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
                                                      <th style={{ width: hasActionCol ? '45%' : '48%' }} className="px-4 py-3.5 text-xs font-bold text-slate-500 text-right">{sec.itemColHeader}</th>
                                                      <th style={{ width: '15%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">الحالة</th>
                                                      <th style={{ width: '20%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">التاريخ والوقت</th>
                                                      <th style={{ width: hasActionCol ? '10%' : '12%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">المبلغ</th>
                                                      {hasActionCol && (
                                                        <th style={{ width: '5%' }} className="px-2 py-3.5 text-xs font-bold text-slate-500 text-center">إجراء</th>
                                                      )}
                                                    </tr>
                                                  </thead>
                                                  <tbody className="bg-white divide-y divide-slate-100">
                                                    {sec.items.map((item, index) => {
                                                      const origPrice = Math.round(Number(item.price || item.cost || 0));
                                                      const finalPrice = Math.round(Number(item.final_price !== null && item.final_price !== undefined ? item.final_price : (item.price || 0)));
                                                      const discountAmount = Math.round(Number(item.discount_amount || item.discount || 0));
                                                      const isFree = Boolean(item.is_free === 1 || item.is_free === true || finalPrice === 0 || discountAmount >= origPrice);
                                                      const hasDiscount = !isFree && (discountAmount > 0 || origPrice > finalPrice);
                                                      const effectiveDiscount = Math.max(discountAmount, origPrice - finalPrice);
                                                      const discountPercent = origPrice > 0 ? Math.round((effectiveDiscount / origPrice) * 100) : 0;
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
                                                                  title="تم إلغاء هذه الخدمة ولم تُحتسب في الإجمالي النهائي"
                                                                >
                                                                  ملغاة (غير محسوبة)
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
                                                          <td className="px-3 py-3 text-center align-middle">
                                                            {isCancelled ? (
                                                              <div className="flex flex-col items-center gap-0.5">
                                                                <div className="flex items-baseline justify-center gap-1 text-slate-400 line-through decoration-slate-400/60" dir="ltr">
                                                                  <span className="text-[10px] font-bold">ر.ي</span>
                                                                  <span className="text-sm font-bold">
                                                                    {isFree ? 0 : finalPrice.toLocaleString('en-US')}
                                                                  </span>
                                                                </div>
                                                                <span className="text-[9px] font-bold text-slate-400">
                                                                  (غير محسوب)
                                                                </span>
                                                              </div>
                                                            ) : isFree ? (
                                                              <div className="flex flex-col items-center gap-0.5">
                                                                <span className="text-xs font-black text-indigo-600">مجاني</span>
                                                                {origPrice > 0 && (
                                                                  <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 font-bold line-through" dir="ltr">
                                                                    <span className="text-[9px] font-bold">ر.ي</span>
                                                                    <span>{origPrice.toLocaleString('en-US')}</span>
                                                                  </div>
                                                                )}
                                                              </div>
                                                            ) : (
                                                              <div className="flex flex-col items-center gap-0.5">
                                                                <div className="flex items-baseline justify-center gap-1" dir="ltr">
                                                                  <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                                                                  <span className={`text-sm sm:text-base font-black tracking-tight ${isRefunded ? 'text-slate-600' : 'text-slate-800'}`}>
                                                                    {finalPrice.toLocaleString('en-US')}
                                                                  </span>
                                                                </div>
                                                                {hasDiscount && (
                                                                  <div className="flex items-center justify-center gap-1 text-[10px]" dir="rtl">
                                                                    <span className="text-slate-500 font-bold text-[10px]">({discountPercent}%)</span>
                                                                    <div className="flex items-center gap-1 text-slate-400 font-semibold line-through" dir="ltr">
                                                                      <span className="text-[9px] font-bold">ر.ي</span>
                                                                      <span>{origPrice.toLocaleString('en-US')}</span>
                                                                    </div>
                                                                  </div>
                                                                )}
                                                              </div>
                                                            )}
                                                          </td>
                                                          {hasActionCol && (
                                                            <td className="px-2 py-3 text-center align-middle">
                                                              {canCancelOrder(item) ? (
                                                                <button
                                                                  onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onCancelOrder(item.id, item.categoryKey || sec.categoryKey || sec.key, item);
                                                                  }}
                                                                  title="إلغاء الطلب"
                                                                  className="p-1.5 rounded-lg text-rose-500 hover:text-white hover:bg-rose-500 border border-rose-200 hover:border-rose-500 transition-all cursor-pointer shadow-2xs active:scale-95 inline-flex items-center justify-center"
                                                                >
                                                                  <Trash2 size={13} />
                                                                </button>
                                                              ) : (
                                                                <span className="text-slate-300 font-bold text-xs" title="لا يمكن الإلغاء">—</span>
                                                              )}
                                                            </td>
                                                          )}
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

                                {/* Footer Summary - Approved Amount (Matching FinancialRecordModal final total style) */}
                                {(() => {
                                  const roundedTotal = Math.round(totalApprovedPrice);
                                  const bgClass = 'bg-emerald-50/50 border-emerald-100/60';
                                  const textClass = 'text-emerald-800';
                                  const numberClass = 'text-emerald-700';
                                  const currencyClass = 'text-emerald-600';
                                  const taffyotClass = 'text-emerald-700/70 border-emerald-200/60';

                                  return (
                                    <div className={`flex items-center justify-between px-6 py-3.5 border rounded-2xl shadow-xs mt-3 ${bgClass}`}>
                                      <span className={`text-xs font-bold ${textClass}`}>الإجمالي النهائي للخدمات:</span>
                                      <div className="flex items-center gap-1.5">
                                        <span className={`text-base sm:text-lg font-black tracking-tight ${numberClass}`}>
                                          {roundedTotal.toLocaleString('en-US')}
                                        </span>
                                        <span className={`text-[10px] font-bold ${currencyClass}`}>ر.ي</span>
                                        {roundedTotal > 0 && (
                                          <span className={`text-xs font-bold mr-1.5 pr-2 border-r ${taffyotClass}`}>
                                            {taffyot(roundedTotal).replace(/(ريالاً يمنياً|ريال يمني|فقط|لا غير|-)/g, '').trim()} ريال يمني.
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}
                            </div>

                            {/* ── SECTION 2: FREE SERVICES & DISCOUNTS ── */}
                            {(freeOrDiscountedItems.length > 0 || consultationFee > 0) && (
                              <div className="bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-xs border-amber-200/90 hover:border-amber-300 mt-5">
                                {/* Accordion Header Bar */}
                                <div
                                  onClick={toggleDiscountsSection}
                                  className="w-full flex items-center justify-between px-4 py-3 cursor-pointer select-none transition-colors bg-gradient-to-r from-amber-50/80 via-white to-amber-50/40"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-xl shadow-2xs bg-amber-100 text-amber-700 border border-amber-200/70">
                                      <Crown size={16} />
                                    </div>
                                    <span className="text-sm font-black text-slate-800 tracking-tight">
                                      الخدمات المجانية والخصومات الممنوحة
                                    </span>
                                    {/* Section Counter Badge */}
                                    <span className="text-[11px] px-2.5 py-0.5 font-extrabold rounded-full border tabular-nums tracking-tight bg-amber-50 text-amber-800 border-amber-200/90 shadow-2xs">
                                      {formatCountUnit((consultationFee > 0 ? 1 : 0) + freeOrDiscountedItems.length, 'خدمة')}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-3">
                                    {/* Section subtotal (Always visible on header) */}
                                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold bg-amber-50/80 text-amber-700 border-amber-200/70">
                                      <span className="text-slate-500 font-medium">إجمالي الممنوح:</span>
                                      <span className="font-extrabold tabular-nums tracking-tight text-sm text-amber-700">
                                        {Math.round(totalDiscountsAndExemptions).toLocaleString('en-US')}
                                      </span>
                                      <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                                    </div>

                                    <div className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-700 shadow-2xs">
                                      <ChevronDown
                                        size={16}
                                        className={`transition-transform duration-200 ${openDiscountsSection ? 'rotate-180' : ''}`}
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* Accordion Body */}
                                {openDiscountsSection && (
                                  <div className="border-t border-slate-100">
                                    <div className="w-full overflow-x-auto">
                                      <table className="w-full text-right text-sm whitespace-nowrap table-fixed">
                                        <thead className="bg-slate-50/80 border-b border-slate-200">
                                          <tr>
                                            <th style={{ width: '5%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">#</th>
                                            <th style={{ width: '35%' }} className="px-4 py-3.5 text-xs font-bold text-slate-500 text-right">اسم الخدمة</th>
                                            <th style={{ width: '13%' }} className="px-4 py-3.5 text-xs font-bold text-slate-500 text-right">القسم</th>
                                            <th style={{ width: '17%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">التاريخ والوقت</th>
                                            <th style={{ width: '15%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">السعر الأساسي</th>
                                            <th style={{ width: '15%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">السعر المعتمد</th>
                                          </tr>
                                        </thead>
                                      <tbody className="bg-white divide-y divide-slate-100">
                                        {/* Consultation fee if exempt */}
                                        {consultationFee > 0 && (
                                          <tr className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-3 py-3 text-xs font-black text-slate-400 text-center align-middle">1</td>
                                            <td className="px-4 py-3 text-sm align-middle font-bold text-slate-800">
                                              رسوم المعاينة والكشف
                                            </td>
                                            {/* القسم - كشارة */}
                                            <td className="px-4 py-3 text-right align-middle">
                                              <span className="inline-flex items-center text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl">
                                                سريرية
                                              </span>
                                            </td>
                                            <td className="px-3 py-3 text-center align-middle">
                                              <div className="flex flex-col items-center">
                                                <span className="text-xs font-bold text-slate-700" dir="ltr">
                                                  {selectedVisit?.created_at ? new Date(selectedVisit.created_at).toLocaleDateString('en-GB') : '—'}
                                                </span>
                                                {selectedVisit?.created_at && (
                                                  <span className="text-[10px] font-bold text-slate-400" dir="ltr">
                                                    {new Date(selectedVisit.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                  </span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="px-3 py-3 text-center align-middle">
                                              <div className="flex items-center justify-center gap-1 text-slate-400 line-through text-xs font-bold" dir="ltr">
                                                <span className="text-[10px] font-bold">ر.ي</span>
                                                <span className="text-xs">{Math.round(consultationFee).toLocaleString('en-US')}</span>
                                              </div>
                                            </td>
                                            <td className="px-3 py-3 text-center align-middle">
                                              <span className="font-black text-indigo-600 text-sm">مجاني</span>
                                            </td>
                                          </tr>
                                        )}

                                        {freeOrDiscountedItems.map((item, idx) => {
                                          const rowNum = (consultationFee > 0 ? 1 : 0) + idx + 1;
                                          const orig = Math.round(Number(item.price || item.cost || 0));
                                          const final = Math.round(Number(item.final_price !== null && item.final_price !== undefined ? item.final_price : orig));
                                          const disc = Math.round(Number(item.discount_amount || item.discount || 0));
                                          const isFree = Boolean(item.is_free === 1 || item.is_free === true || final === 0);
                                          const exemptedAmount = isFree ? orig : Math.max(disc, orig - final);
                                          const discountPercent = orig > 0 ? Math.round((exemptedAmount / orig) * 100) : 100;
                                          const isRadNoFilm = item.categoryKey === 'radiology' && (item.with_film === false || item.with_film === 0 || item.withFilm === false);
                                          const itemDate = item.requested_at || item.created_at || item.date || selectedVisit?.created_at;

                                          return (
                                            <tr key={item.id || `disc_${idx}`} className="hover:bg-slate-50/50 transition-colors">
                                              <td className="px-3 py-3 text-xs font-black text-slate-400 text-center align-middle">{rowNum}</td>
                                              <td className="px-4 py-3 align-middle font-bold text-slate-800 text-sm">
                                                <div className="flex items-center flex-wrap gap-1.5">
                                                  <span>{item.name || item.test_name || item.service_name || 'خدمة غير محددة'}</span>
                                                  {isRadNoFilm && (
                                                    <span className="text-xs font-semibold text-slate-500 shrink-0">
                                                      (بدون فيلم)
                                                    </span>
                                                  )}
                                                </div>
                                              </td>
                                              {/* القسم - كشارة */}
                                              <td className="px-4 py-3 text-right align-middle">
                                                {item.categoryKey === 'lab' ? (
                                                  <span className="inline-flex items-center text-xs font-bold text-blue-700 bg-purple-50 px-2.5 py-1 rounded-xl">
                                                    مختبر
                                                  </span>
                                                ) : item.categoryKey === 'radiology' ? (
                                                  <span className="inline-flex items-center text-xs font-bold text-rose-700 bg-blue-50 px-2.5 py-1 rounded-xl">
                                                    أشعة
                                                  </span>
                                                ) : (
                                                  <span className="inline-flex items-center text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl">
                                                    سريرية
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-3 py-3 text-center align-middle">
                                                <div className="flex flex-col items-center">
                                                  <span className="text-xs font-bold text-slate-700" dir="ltr">
                                                    {itemDate ? new Date(itemDate).toLocaleDateString('en-GB') : '—'}
                                                  </span>
                                                  {itemDate && (
                                                    <span className="text-[10px] font-bold text-slate-400" dir="ltr">
                                                      {new Date(itemDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                    </span>
                                                  )}
                                                </div>
                                              </td>
                                              <td className="px-3 py-3 text-center align-middle">
                                                <div className="flex items-center justify-center gap-1 text-slate-400 line-through text-xs font-bold" dir="ltr">
                                                  <span className="text-[10px] font-bold">ر.ي</span>
                                                  <span className="text-xs">{orig.toLocaleString('en-US')}</span>
                                                </div>
                                              </td>
                                              <td className="px-3 py-3 text-center align-middle">
                                                {isFree ? (
                                                  <span className="font-black text-indigo-600 text-sm">مجاني</span>
                                                ) : (
                                                  <div className="flex flex-col items-center gap-0.5">
                                                    <div className="flex items-baseline justify-center gap-1 text-slate-800" dir="ltr">
                                                      <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                                                      <span className="text-sm sm:text-base font-black tracking-tight text-slate-800">
                                                        {final.toLocaleString('en-US')}
                                                      </span>
                                                    </div>
                                                    <span className="text-[10px] font-bold text-slate-500">
                                                      خصم {discountPercent}%
                                                    </span>
                                                  </div>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Footer of Section 2 (Matching Section 1 & FinancialRecordModal style) */}
                                  {(() => {
                                    const roundedTotal = Math.round(totalDiscountsAndExemptions);
                                    const bgClass = 'bg-emerald-50/50 border-emerald-100/60';
                                    const textClass = 'text-emerald-800';
                                    const numberClass = 'text-emerald-700';
                                    const currencyClass = 'text-emerald-600';
                                    const taffyotClass = 'text-emerald-700/70 border-emerald-200/60';

                                    return (
                                      <div className={`flex items-center justify-between px-6 py-3.5 border-t mt-auto ${bgClass}`}>
                                        <span className={`text-xs font-bold ${textClass}`}>إجمالي القيمة المعفاة / الخصومات:</span>
                                        <div className="flex items-center gap-1.5">
                                          <span className={`text-base sm:text-lg font-black tracking-tight ${numberClass}`}>
                                            {roundedTotal.toLocaleString('en-US')}
                                          </span>
                                          <span className={`text-[10px] font-bold ${currencyClass}`}>ر.ي</span>
                                          {roundedTotal > 0 && (
                                            <span className={`text-xs font-bold mr-1.5 pr-2 border-r ${taffyotClass}`}>
                                              {taffyot(roundedTotal).replace(/(ريالاً يمنياً|ريال يمني|فقط|لا غير|-)/g, '').trim()} ريال يمني.
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* ── RESULTS TAB ── */}
                  {emrTab === 'results' && (
                    <div className="space-y-6 modal-overlay-anim">
                      {(() => {
                        const labs = (selectedVisit?.labTests || selectedVisit?.lab_tests || []).filter(t => t.status === 'completed');
                        const rads = (selectedVisit?.radiologyTests || selectedVisit?.radiology_tests || []).filter(t => t.status === 'completed' || t.result_notes);
                        const clinics = (selectedVisit?.clinicalServices || selectedVisit?.clinical_services || []).filter(t => t.status === 'completed' || t.result_notes);
                        
                        if (labs.length === 0 && rads.length === 0 && clinics.length === 0) {
                          return (
                            <div className="space-y-3 mt-4">
                              <div className="pt-1">
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                    <div className="w-14 h-14 bg-gradient-to-br from-slate-50 to-blue-50/80 rounded-2xl flex items-center justify-center mb-3.5 shadow-xs border border-blue-100/60 text-blue-500">
                                      <Eye size={26} strokeWidth={1.8} />
                                    </div>
                                    <h3 className="text-sm sm:text-base font-black text-slate-800 mb-1 tracking-tight">
                                      لا توجد نتائج مسجلة
                                    </h3>
                                    <p className="text-xs max-w-sm font-semibold text-slate-400 leading-relaxed">
                                      لا توجد أي نتائج تحاليل مخبرية أو تقارير أشعة مرفوعة لهذه الزيارة حتى الآن.
                                    </p>
                                  </div>
                                </div>
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

                        const labRows = labs.map((t, idx) => {
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

                        // Priority 2: Radiology results (grouped by film when applicable)
                        const radGroups = groupRadByFilm(rads);
                        const radRows = radGroups.map((g, idx) => {
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

                        // Priority 3: Clinical Services (if any completed or have result notes)
                        const clinicRows = clinics.map((c, idx) => {
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

                        // Attach open handler to each row
                        labRows.forEach(r => { r.onPreview = () => openUnifiedResultModal(r.targetGroup || r); });
                        radRows.forEach(r => { r.onPreview = () => openUnifiedResultModal(r); });
                        clinicRows.forEach(r => { r.onPreview = () => openUnifiedResultModal(r); });

                        // Results sections definition (Lab, Radiology, Clinical Services)
                        const resultSections = [
                          {
                            key: 'lab',
                            title: 'قسم المختبر',
                            countUnit: 'تحليل',
                            itemColHeader: 'التحليل',
                            icon: FlaskConical,
                            items: labRows,
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
                            items: radRows,
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
                            items: clinicRows,
                            color: {
                              border: 'border-teal-200/90 hover:border-teal-300',
                              headerBg: 'bg-gradient-to-r from-teal-50/80 via-white to-teal-50/40',
                              iconBox: 'bg-teal-100 text-teal-700 border border-teal-200/70',
                              badge: 'bg-teal-50 text-teal-800 border-teal-200/90 shadow-2xs',
                            }
                          }
                        ];

                        const radTestsCount = radRows.reduce((sum, r) => sum + (Array.isArray(r.items) && r.items.length > 0 ? r.items.length : 1), 0);
                        const totalResultsCount = labRows.length + radTestsCount + clinicRows.length;

                        return (
                          <div className="space-y-4">
                            {/* Floating Header matching Services & Tests style */}
                            <div className="flex items-center justify-between px-1">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-blue-100/80 rounded-lg text-blue-600 shadow-sm">
                                  <FileText size={16} />
                                </div>
                                <h3 className="text-sm font-black text-slate-700">نتائج التقارير</h3>
                                <span className="text-xs px-2.5 py-0.5 font-extrabold bg-blue-50 text-blue-700 rounded-full border border-blue-200/60 tabular-nums tracking-tight">
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
                                  ? sec.items.reduce((sum, row) => sum + (Array.isArray(row.items) && row.items.length > 0 ? row.items.length : 1), 0)
                                  : sec.items.length;

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
                                        {count === 0 ? (
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
                                                            const balancedRows = getBalancedRadiologyRows(testNames, isMaximized);

                                                            return (
                                                              <div className="flex flex-col gap-1.5 py-0.5 max-w-full">
                                                                {balancedRows.map((rowItems, rIdx) => (
                                                                  <div key={rIdx} className="flex items-center gap-2 flex-wrap">
                                                                    {rowItems.map((itemName, itemIdx) => (
                                                                      <div
                                                                        key={itemIdx}
                                                                        className={`inline-flex items-center w-fit ${
                                                                          isMaximized ? 'max-w-[280px]' : 'max-w-[210px]'
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
                                                              className="w-8 h-8 rounded-xl inline-flex items-center justify-center text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-800 border border-indigo-200/70 transition-all cursor-pointer shadow-2xs active:scale-95 mx-auto group"
                                                              title="عرض النتيجة والتقرير"
                                                              aria-label="عرض النتيجة والتقرير"
                                                            >
                                                              <FileText size={15} className="text-indigo-600 group-hover:scale-110 transition-transform" />
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
                                                              className="w-8 h-8 rounded-xl inline-flex items-center justify-center text-purple-700 bg-purple-50 hover:bg-purple-100 hover:text-purple-800 border border-purple-200/70 transition-all cursor-pointer shadow-2xs active:scale-95 mx-auto group"
                                                              title="عرض النتيجة والتقرير"
                                                              aria-label="عرض النتيجة والتقرير"
                                                            >
                                                              <FileText size={15} className="text-purple-600 group-hover:scale-110 transition-transform" />
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

                  {/* ── PRESCRIPTION TAB ── */}
                  {emrTab === 'prescription' && (
                    <div className="space-y-4 modal-overlay-anim">
                      {/* Datalists */}
                      <datalist id="dosage-suggestions">
                        <option value="125mg" />
                        <option value="250mg" />
                        <option value="500mg" />
                        <option value="1g" />
                        <option value="5ml" />
                        <option value="10ml" />
                        <option value="حبة واحدة" />
                      </datalist>
                      <datalist id="frequency-suggestions">
                        <option value="مرة واحدة يومياً" />
                        <option value="مرتين يومياً" />
                        <option value="3 مرات يومياً" />
                        <option value="4 مرات يومياً" />
                        <option value="كل 8 ساعات" />
                        <option value="كل 12 ساعة" />
                        <option value="عند اللزوم" />
                      </datalist>
                      <datalist id="duration-suggestions">
                        <option value="لمدة 3 أيام" />
                        <option value="لمدة 5 أيام" />
                        <option value="لمدة أسبوع" />
                        <option value="لمدة أسبوعين" />
                        <option value="لمدة شهر" />
                      </datalist>
                      <datalist id="instructions-suggestions">
                        <option value="بعد الأكل" />
                        <option value="قبل الأكل" />
                        <option value="على الريق" />
                        <option value="قبل النوم" />
                        <option value="مع كمية وافرة من الماء" />
                      </datalist>

                      {/* ── SECTION: الأدوية والتوجيهات الطبية (بلا إطار) ── */}
                      <div className="space-y-3">
                        {/* Floating Header matching Services & Tests style - Hidden in clinical record if no medications */}
                        {(!effectiveReadOnly || rxItems.length > 0) && (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-blue-100/80 rounded-lg text-blue-600 shadow-sm">
                                <Pill size={16} />
                              </div>
                              <h3 className="text-sm font-black text-slate-700">الأدوية والتوجيهات الطبية</h3>
                              <span className="text-xs px-2.5 py-0.5 font-black bg-blue-50 text-blue-700 rounded-full border border-blue-200/60 font-mono">
                                {rxItems.length}
                              </span>
                            </div>

                            {/* Actions: Favorites Quick-Select, Saving Indicator */}
                            <div className="flex items-center gap-2.5 flex-wrap">
                              {savingRx && (
                                <div className="text-xs text-indigo-600 flex items-center gap-1.5 font-bold">
                                  <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                  <span>جاري الحفظ...</span>
                                </div>
                              )}

                              {!effectiveReadOnly && favoriteMeds && favoriteMeds.length > 0 && (
                                <RxFavoritesDropdown 
                                  favoriteMeds={favoriteMeds} 
                                  onSelect={(fav) => {
                                    setRxMedName(fav.medication_name || '');
                                    setRxDosage(toEnglishDigits(fav.dosage) || '');
                                    setRxFrequency(toEnglishDigits(fav.frequency) || '');
                                    setRxDuration(toEnglishDigits(fav.duration) || '');
                                    setRxInstructions(toEnglishDigits(fav.instructions) || '');
                                  }} 
                                  isMaximized={isMaximized}
                                />
                              )}
                            </div>
                          </div>
                        )}

                        {/* Rx Input Form (When Editable) */}
                        {!effectiveReadOnly && (
                          <div className="space-y-3">
                            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 sm:gap-4 items-end">
                                <div className="sm:col-span-2 lg:col-span-4">
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                    اسم الدواء <span className="text-rose-500">*</span>
                                  </label>
                                  <MedicationSelect
                                    value={rxMedName}
                                    onChange={(val) => setRxMedName(val)}
                                    options={catalogs?.medications?.map(m => m.name || m.scientific_name).filter(Boolean) || []}
                                    placeholder="ابحث عن دواء أو اكتب الاسم..."
                                    theme="indigo"
                                  />
                                </div>
                                <div className="lg:col-span-2">
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5">الجرعة</label>
                                  <input 
                                    type="text"
                                    list="dosage-suggestions"
                                    value={rxDosage} 
                                    onChange={e => setRxDosage(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleAddRxItem(); }}
                                    className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none transition-all shadow-2xs"
                                    placeholder="500mg"
                                  />
                                </div>
                                <div className="lg:col-span-2">
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5">التكرار</label>
                                  <input 
                                    type="text"
                                    list="frequency-suggestions"
                                    value={rxFrequency} 
                                    onChange={e => setRxFrequency(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleAddRxItem(); }}
                                    className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none transition-all shadow-2xs"
                                    placeholder="مرتين يومياً"
                                  />
                                </div>
                                <div className="lg:col-span-2">
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5">التوجيهات</label>
                                  <input 
                                    type="text"
                                    list="instructions-suggestions"
                                    value={rxInstructions} 
                                    onChange={e => setRxInstructions(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleAddRxItem(); }}
                                    className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none transition-all shadow-2xs"
                                    placeholder="بعد الأكل"
                                  />
                                </div>
                                <div className="lg:col-span-2">
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5">المدة</label>
                                  <input 
                                    type="text"
                                    list="duration-suggestions"
                                    value={rxDuration} 
                                    onChange={e => setRxDuration(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleAddRxItem(); }}
                                    className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none transition-all shadow-2xs"
                                    placeholder="5 أيام"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* زر إضافة للوصفة - خارج بطاقة القسم بحجم مدمج وأنيق */}
                            {Boolean(rxMedName.trim()) && (
                              <div className="flex justify-end animate-in fade-in slide-in-from-top-2 duration-200 px-1 pt-0.5">
                                <button
                                  type="button"
                                  onClick={handleAddRxItem}
                                  className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white font-black rounded-xl shadow-xs hover:shadow-sm hover:shadow-indigo-500/20 transition-all cursor-pointer group"
                                  title="إضافة الدواء إلى قائمة الأدوية المقررة"
                                >
                                  <Plus size={14} strokeWidth={2.5} className="group-hover:rotate-90 transition-transform duration-200" />
                                  <span>إضافة للوصفة</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── SECTION: الأدوية المقررة (بدون عنوان أو عداد) ── */}
                        <div className="pt-1">
                          {/* Meds Table Container */}
                          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                            {loadingPrescription ? (
                              <div className="flex justify-center items-center py-16">
                                <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                              </div>
                            ) : rxItems.length > 0 ? (
                              <div className="w-full overflow-x-auto">
                                <table className="w-full text-right text-sm whitespace-nowrap table-fixed">
                                  <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                      <th style={{ width: '5%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">#</th>
                                      <th style={{ width: !effectiveReadOnly ? '32%' : '37%' }} className="px-4 py-3.5 text-xs font-bold text-slate-500 text-right">اسم الدواء</th>
                                      <th style={{ width: '13%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">الجرعة</th>
                                      <th style={{ width: '18%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">التكرار</th>
                                      <th style={{ width: '14%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">التوجيهات</th>
                                      <th style={{ width: '13%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">المدة</th>
                                      {!effectiveReadOnly && (
                                        <th style={{ width: '5%' }} className="px-2 py-3.5 text-xs font-bold text-slate-500 text-center">إجراء</th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-slate-100">
                                    {rxItems.map((item, idx) => (
                                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-3 py-3 text-xs font-black text-slate-400 text-center align-middle">
                                          {idx + 1}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-slate-800 align-middle">
                                          <div className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                            <span className="font-bold text-slate-800 text-sm">{item.medication_name}</span>
                                          </div>
                                        </td>
                                        <td className="px-3 py-3 text-center font-bold text-slate-700 align-middle text-xs">
                                          {toEnglishDigits(item.dosage) || '—'}
                                        </td>
                                        <td className="px-3 py-3 text-center font-bold text-slate-700 align-middle text-xs">
                                          {toEnglishDigits(item.frequency) || '—'}
                                        </td>
                                        <td className="px-3 py-3 text-center font-bold text-slate-700 align-middle text-xs">
                                          {item.instructions ? (
                                            <span className="truncate max-w-[240px] text-xs block mx-auto text-center font-bold text-slate-700" title={item.instructions}>
                                              {toEnglishDigits(item.instructions)}
                                            </span>
                                          ) : (
                                            <span className="text-slate-300 font-bold text-xs">—</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-3 text-center font-bold text-slate-700 align-middle text-xs">
                                          {toEnglishDigits(item.duration) || '—'}
                                        </td>
                                        {!effectiveReadOnly && (
                                          <td className="px-2 py-3 text-center align-middle">
                                            <button
                                              onClick={() => {
                                                const updated = rxItems.filter((_, i) => i !== idx);
                                                setRxItems(updated);
                                                syncRxItems(updated);
                                              }}
                                              className="p-1.5 rounded-lg text-rose-500 hover:text-white hover:bg-rose-500 border border-rose-200 hover:border-rose-500 transition-all cursor-pointer shadow-2xs active:scale-95 inline-flex items-center justify-center mx-auto"
                                              title="إزالة الدواء"
                                            >
                                              <Trash2 size={13} />
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                <div className="w-14 h-14 bg-gradient-to-br from-slate-50 to-blue-50/80 rounded-2xl flex items-center justify-center mb-3.5 shadow-xs border border-blue-100/60 text-blue-500">
                                  <Pill size={26} strokeWidth={1.8} />
                                </div>
                                <h3 className="text-sm sm:text-base font-black text-slate-800 mb-1 tracking-tight">
                                  لم يتم إقرار أي وصفات علاجية بعد
                                </h3>
                                <p className="text-xs max-w-sm font-semibold text-slate-400 leading-relaxed">
                                  {!effectiveReadOnly
                                    ? 'قم باختيار الأدوية من النموذج أعلاه أو من قائمة المفضلة السريعة لإضافتها إلى الخطة العلاجية للمريض.'
                                    : 'لا توجد أي أدوية أو وصفات علاجية مسجلة لهذه الزيارة المؤرشفة.'}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          </div>


        </div>
      </div>
    </div>,
        document.body
      )}

      {/* File Preview Sub-Modal */}
      {previewFile && createPortal(
        <div className="fixed inset-0 z-[100001] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 modal-overlay-anim" dir="rtl">
          <div className={`bg-white rounded-3xl shadow-luxury flex flex-col overflow-hidden animate-scale-in transition-all duration-300 ${isPreviewMaximized ? 'w-[98vw] h-[98vh]' : 'w-full max-w-4xl h-[80vh]'}`}>
            <div className="flex justify-between items-center p-4 border-b bg-gray-50 flex-shrink-0">
              <h3 className="font-black text-gray-800">عرض الملف: {previewFile.name}</h3>
              <div className="flex items-center gap-2">
                {(() => {
                  const rawUrl = resolvedPreview?.url || (typeof previewFile === 'string' ? previewFile : previewFile?.url);
                  const API_URL = getServerBaseUrl();
                  const fullUrl = rawUrl ? ((rawUrl.startsWith('http') || rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) ? rawUrl : `${API_URL}${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`) : null;
                  if (!fullUrl) return null;
                  return (
                    <a 
                      href={fullUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors text-xs font-bold flex items-center gap-1.5"
                    >
                      <ExternalLink size={14} /> فتح في نافذة مستقلة
                    </a>
                  );
                })()}
                <button onClick={() => setIsPreviewMaximized(!isPreviewMaximized)} className="p-2 bg-gray-200 text-gray-600 rounded-xl hover:bg-indigo-500 hover:text-white transition-colors">
                  {isPreviewMaximized ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                </button>
                <button onClick={() => setPreviewFile(null)} className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-gray-100 flex items-center justify-center overflow-hidden p-4 relative">
              {!resolvedPreview ? (
                <div className="text-center text-gray-500 font-bold p-8">لا يوجد ملف مرفق بصيغة مدعومة للعرض.</div>
              ) : resolvedPreview.isPdf ? (
                <iframe
                  key={resolvedPreview.url}
                  src={resolvedPreview.url}
                  className="w-full h-full rounded-xl border border-gray-200 bg-white"
                  title="Document Preview"
                />
              ) : (
                <div className="w-full h-full overflow-auto flex items-center justify-center">
                  <img
                    src={resolvedPreview.url}
                    className="max-w-full max-h-full object-contain rounded-2xl shadow-md"
                    alt="Medical Result"
                  />
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Unified PACS-Grade Clinical Result Viewer Modal */}
      {activeResultViewer.isOpen && (
        <ClinicalResultViewerModal
          isOpen={activeResultViewer.isOpen}
          results={activeResultViewer.results}
          initialIndex={activeResultViewer.currentIndex}
          patientName={patient?.name || patient?.full_name}
          visitNumber={selectedVisit?.visit_number || selectedVisit?.id}
          onClose={() => setActiveResultViewer(prev => ({ ...prev, isOpen: false }))}
        />
      )}

      {viewLabResult && (
        <LabResultDetailsModal request={viewLabResult} onClose={() => setViewLabResult(null)} />
      )}
      {viewRadResult && (
        <RadiologyResultDetailsModal request={viewRadResult} onClose={() => setViewRadResult(null)} />
      )}
    </>
  );
}
