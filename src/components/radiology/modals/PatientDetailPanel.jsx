import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText, X, UploadCloud, Eye, Trash2, CheckCircle, Minimize2, Maximize2,
  Check, LayoutGrid, List, Plus, Film, Image as ImageIcon, Edit, Radiation,
  Calendar, Activity, CheckSquare, AlertCircle
} from 'lucide-react';
import { toast } from 'react-toastify';
import { getSocket } from '../../utils/socket';
// ── Patient Detail Panel (Centered Modal) ──────────────────────────
const PatientDetailPanel = ({ visitId, token, onClose, onCompleted, onStartAll, isCompletedTab, isPendingTab }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadingItem, setUploadingItem] = useState(null);
  const [groupingMode, setGroupingMode] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() => localStorage.getItem("radiologyFullscreen") === "true");
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("radiologyViewMode") || "grid");
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, filmId: null });

  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    localStorage.setItem("radiologyFullscreen", isFullscreen);
  }, [isFullscreen]);

  useEffect(() => {
    localStorage.setItem("radiologyViewMode", viewMode);
  }, [viewMode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/radiology/visit/${visitId}`, { headers: { Authorization: `Bearer ${token}` } });
      setData(await res.json());
    } catch {
      toast.error("فشل تحميل التفاصيل");
    } finally {
      setLoading(false);
    }
  }, [visitId, token]);

  useEffect(() => { load(); }, [load]);

  const handleDeleteFilm = async (filmId) => {
    setDeleteConfirm({ isOpen: true, filmId });
  };

  const confirmDeleteFilm = async () => {
    const filmId = deleteConfirm.filmId;
    if (!filmId) return;
    try {
      await fetch(`/api/radiology/films/${filmId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      toast.success("تم حذف الفيلم وفك ارتباط الفحوصات");
      const socket = getSocket();
      socket.emit("radiology:updated", { visitId });
      load();
    } catch {
      toast.error("فشل الحذف");
    } finally {
      setDeleteConfirm({ isOpen: false, filmId: null });
    }
  };

  const handleSafeClose = () => {
    onClose();
  };

  const handleFinishPatient = async () => {
    setCompleting(true);
    try {
      const res = await fetch(`/api/radiology/visit/${visitId}/complete`, { method: "PUT", headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (res.ok) {
        toast.success(d.message);
        onCompleted();
        onClose();
        return;
      } else toast.error(d.message);
    } catch {
      toast.error("تعذر الاتصال");
    } finally {
      if (isMountedRef.current) {
        setCompleting(false);
      }
    }
  };

  const handleStartIndividualRequest = async (requestId) => {
    try {
      const res = await fetch(`/api/radiology/request/${requestId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "in_progress" }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success("تم تحويل الفحص لغرفة التصوير بنجاح");
        const socket = getSocket();
        socket.emit("radiology:updated", { visitId });
        load();
      } else toast.error(d.message);
    } catch {
      toast.error("فشل التنفيذ");
    }
  };

  const handleDeliverRequest = async (requestId) => {
    try {
      const res = await fetch(`/api/radiology/request/${requestId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'completed' }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success('تم تسليم النتيجة بنجاح');
        const socket = getSocket();
        socket.emit('radiology:updated', { visitId });
        load();
      } else toast.error(d.message);
    } catch {
      toast.error('فشل التنفيذ');
    }
  };

  const handleDeliverFilm = async (filmId) => {
    const filmReqs = requests.filter(r => r.radiology_film_id === filmId);
    
    try {
      await Promise.all(filmReqs.map(req =>
        fetch(`/api/radiology/request/${req.id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: 'completed' }),
        })
      ));
      
      toast.success('تم تسليم نتيجة الفيلم بنجاح');
      const socket = getSocket();
      socket.emit('radiology:updated', { visitId });
      load();
    } catch {
      toast.error('فشل التنفيذ');
    }
  };

  const requests = useMemo(() => data?.requests || [], [data?.requests]);
  const films = useMemo(() => data?.films || [], [data?.films]);
  
  const workspaceRequests = useMemo(() => {
    let list = [...requests];
    if (isPendingTab) {
      list = list.filter(r => r.status === "paid");
    } else if (isCompletedTab) {
      list = list.filter(r => r.status === "completed");
    } else {
      list = list.filter(r => r.status !== "completed");
    }

    // Phase 2: Smart Sorting for the workspace
    return list.sort((a, b) => {
      // 1. Orphaned Scans (needs film but not grouped)
      const aIsOrphaned = a.with_film === 1 && !a.radiology_film_id;
      const bIsOrphaned = b.with_film === 1 && !b.radiology_film_id;
      
      if (aIsOrphaned && !bIsOrphaned) return -1;
      if (!aIsOrphaned && bIsOrphaned) return 1;

      // 2. Ready for Delivery Scans (result uploaded but not delivered)
      const aIsReady = (a.result_file || a.result_notes) && a.status !== "completed";
      const bIsReady = (b.result_file || b.result_notes) && b.status !== "completed";
      
      if (aIsReady && !bIsReady) return -1;
      if (!aIsReady && bIsReady) return 1;

      // 3. Default fallback (by ID) to keep list stable
      return a.id - b.id;
    });
  }, [requests, isPendingTab, isCompletedTab]);

  const { unassignedFilmsCount, isAllDone, hasPending } = useMemo(() => ({
    unassignedFilmsCount: requests.filter((r) => r.with_film === 1 && !r.radiology_film_id).length,
    isAllDone: requests.length > 0 && requests.every((r) => r.status === "completed"),
    hasPending: requests.some((r) => r.status === "paid")
  }), [requests]);

  const handleUploadClose = useCallback(() => setUploadingItem(null), []);
  
  const handleUploaded = useCallback(() => {
    setUploadingItem(null);
    load();
  }, [load]);

  const handleGroupingClose = useCallback(() => setGroupingMode(false), []);
  const handleGrouped = useCallback(() => { setGroupingMode(false); load(); }, [load]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
      <div className="absolute inset-0" onClick={handleSafeClose} />

      <div className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] ${isFullscreen ? 'w-[98vw] h-[98vh] rounded-[2.5rem] border border-white' : 'w-full max-w-6xl h-[88vh] rounded-[2.5rem] border border-white/60'}`}>
        
        {/* Out of the Box Premium Header - Restored Colors */}
        <div className="relative px-6 py-5 flex items-center justify-between flex-shrink-0 bg-gradient-to-br from-[#FFEDD5] to-[#FED7AA]">
          {/* Subtle overlay texture */}
          <div className="absolute inset-0 bg-white/20 mix-blend-overlay"></div>
          
          <div className="flex items-center gap-5 relative z-10">
            {/* Avatar block */}
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-orange-600 font-black text-2xl border border-orange-100">
                {data?.visit?.full_name?.charAt(0) || <Radiation size={24} />}
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-400 border-2 border-white rounded-full"></div>
            </div>

            <div className="flex flex-col">
              <h2 className="font-black text-slate-800 text-xl tracking-tight">
                {data?.visit?.full_name || "جاري تحميل البيانات..."}
              </h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="bg-white/60 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm backdrop-blur-sm border border-white/50">
                  {data?.visit?.visit_number}
                </span>
                <span className="bg-white/60 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm backdrop-blur-sm border border-white/50 flex items-center gap-1">
                  <Calendar size={12}/> {data?.visit?.age} سنة
                </span>
                <span className="bg-white/60 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm backdrop-blur-sm border border-white/50">
                  {data?.visit?.gender === 'male' ? 'ذكر' : 'أنثى'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 relative z-10">
            {/* Quick Actions in Header */}
            {hasPending && (
              <button onClick={() => { onStartAll(visitId); onClose(); }} className="mr-4 hidden sm:flex text-xs font-black items-center gap-1.5 px-4 py-2.5 rounded-xl transition-all shadow-sm bg-orange-600 hover:bg-orange-700 text-white active:scale-95">
                <Activity size={14} /> تنفيذ كافة الدراسات الإشعاعية
              </button>
            )}
            
            <div className="w-px h-8 bg-orange-900/10 mx-2 hidden sm:block"></div>

            <button onClick={() => setIsFullscreen(!isFullscreen)} className="w-10 h-10 flex items-center justify-center bg-white/40 hover:bg-white/60 text-orange-900 rounded-xl transition-all backdrop-blur-sm shadow-sm" title={isFullscreen ? "تصغير" : "ملء الشاشة"}>
              {isFullscreen ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}
            </button>
            <button onClick={handleSafeClose} className="w-10 h-10 flex items-center justify-center bg-white/40 hover:bg-red-50 hover:text-red-600 text-orange-900 rounded-xl transition-all backdrop-blur-sm shadow-sm">
              <X size={18}/>
            </button>
          </div>
        </div>

        {/* Super Premium Body */}
        <div className="flex-1 flex overflow-hidden relative">
          
          {loading ? (
            <div className="p-8 w-full h-full flex items-center justify-center">
              <div className="animate-spin w-10 h-10 border-4 border-orange-200 border-t-orange-600 rounded-full"></div>
            </div>
          ) : (
            <div className="flex flex-1 w-full h-full">
              
              {/* Left Column: Requests Workspace */}
              <div className={`flex flex-col h-full bg-white transition-all duration-300 ${isPendingTab ? "w-full" : "w-full lg:w-3/5 xl:w-2/3 border-l border-slate-100"}`}>
                
                {/* Workspace Toolbar */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-white z-10">
                  <div className="flex flex-col">
                    <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                      <LayoutGrid size={18} className="text-orange-500" />
                      مساحة عمل الدراسات الإشعاعية
                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-black">{requests.length}</span>
                    </h3>
                  </div>
                  <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                    <button onClick={() => setViewMode("list")} className={`p-1.5 rounded-lg transition-all ${viewMode === "list" ? "bg-white text-orange-600 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-600"}`}>
                      <List size={14} />
                    </button>
                    <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded-lg transition-all ${viewMode === "grid" ? "bg-white text-orange-600 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-600"}`}>
                      <LayoutGrid size={14} />
                    </button>
                  </div>
                </div>

                {/* Workspace Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/30">
                  {workspaceRequests.length === 0 ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 opacity-80 transition-opacity duration-300">
                      <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                        <LayoutGrid size={32} className="text-slate-300" />
                      </div>
                      <p className="font-bold text-sm text-slate-500">لا توجد دراسات في هذا القسم</p>
                    </div>
                  ) : (
                    <div className={`${viewMode === "grid" ? `grid grid-cols-1 sm:grid-cols-2 ${isPendingTab ? "lg:grid-cols-3" : "xl:grid-cols-2"} gap-6` : "flex flex-col gap-3 max-w-4xl mx-auto"}`}>
                      {workspaceRequests.map((req) => {
                      const isGrouped = req.with_film === 1 && req.radiology_film_id;
                      const isCompleted = req.status === "completed";
                      const isInProgress = req.status === "in_progress";
                      const isResultUploaded = req.result_file || req.result_notes;
                      const isReadyForDelivery = isResultUploaded && !isCompleted;

                      // Phase 2: Business Rule A & B
                      // Rule A: Scan requires a film → can ONLY be delivered if already linked to one.
                      // Rule B: Digital Save (with_film !== 1) → can always be delivered individually.
                      const canDeliverIndividually = req.with_film !== 1 || (req.with_film === 1 && req.radiology_film_id);
                      
                      return (
                        <div key={req.id} className={`group relative bg-white rounded-[1.25rem] p-4 transition-all duration-300 hover:shadow-lg border ${isCompleted ? "border-emerald-100" : isReadyForDelivery ? "border-blue-100" : isInProgress ? "border-purple-100" : "border-slate-100 hover:border-orange-200"} ${viewMode === "list" ? "flex flex-row items-center gap-4" : "flex flex-col min-h-[170px]"}`}>
                          
                          {/* Left-side accent line for list, Top for grid */}
                          {viewMode === "grid" && (
                            <div className={`absolute top-0 right-0 w-full h-1.5 rounded-t-[1.25rem] ${isCompleted ? "bg-emerald-400" : isReadyForDelivery ? "bg-blue-400" : isInProgress ? "bg-purple-400" : "bg-gradient-to-r from-orange-400 to-orange-300"}`}></div>
                          )}
                          {viewMode === "list" && (
                            <div className={`absolute top-0 right-0 w-1.5 h-full rounded-r-[1.25rem] ${isCompleted ? "bg-emerald-400" : isReadyForDelivery ? "bg-blue-400" : isInProgress ? "bg-purple-400" : "bg-gradient-to-b from-orange-400 to-orange-300"}`}></div>
                          )}

                          <div className={`flex-1 flex ${viewMode === "list" ? "items-center justify-between pl-2 pr-4" : "flex-col justify-start pt-1"}`}>
                            
                            <div className={`flex ${viewMode === "list" ? "items-center gap-5 flex-1" : "justify-between items-start mb-3"}`}>
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isCompleted ? "bg-emerald-50 text-emerald-500" : isReadyForDelivery ? "bg-blue-50 text-blue-500" : isInProgress ? "bg-purple-50 text-purple-500" : "bg-orange-50 text-orange-500"}`}>
                                  <Activity size={16} />
                                </div>
                                <h4 className="font-black text-slate-800 text-[13px] sm:text-sm leading-relaxed line-clamp-2" title={req.name}>
                                  {req.name}
                                </h4>
                              </div>
                              
                              <div className={`shrink-0 ${viewMode === "list" ? "mr-4" : ""}`}>
                                <span className={`text-[10px] font-black px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm border ${isCompleted ? "text-emerald-700 bg-emerald-50 border-emerald-100" : isReadyForDelivery ? "text-blue-700 bg-blue-50 border-blue-100" : isInProgress ? "text-purple-700 bg-purple-50 border-purple-100" : "text-orange-700 bg-orange-50 border-orange-100"}`}>
                                  {isCompleted && <CheckCircle size={12} />}
                                  {isCompleted ? "مكتمل" : isReadyForDelivery ? "جاهز للتسليم" : isInProgress ? "قيد الإجراء" : "قيد الانتظار"}
                                </span>
                              </div>
                            </div>
                            
                            <div className={`flex items-center gap-2 mt-auto ${viewMode === "list" ? "shrink-0 mr-4" : "mb-3"}`}>
                              {req.with_film === 1 ? (
                                <span className={`text-[10.5px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 ${req.radiology_film_id ? "bg-slate-100 text-slate-600 border border-slate-200" : "bg-rose-50 text-rose-600 border border-rose-100"}`}>
                                  <Film size={12} className={req.radiology_film_id ? "text-slate-400" : "text-rose-500"} /> 
                                  {req.radiology_film_id ? "مُدرج بفيلم" : "يحتاج فيلم للطباعة"}
                                </span>
                              ) : (
                                <span className="text-[10.5px] bg-slate-50 text-slate-500 px-2.5 py-1.5 border border-slate-200 rounded-lg font-bold flex items-center gap-1.5">
                                  <ImageIcon size={12} className="text-slate-400" /> 
                                  حفظ رقمي (بدون طباعة)
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Beautiful Action Buttons */}
                          <div className={`flex gap-2 ${viewMode === "list" ? "shrink-0" : "mt-2 pt-3 border-t border-slate-100"}`}>
                            {req.status === "paid" && (
                                <button onClick={() => handleStartIndividualRequest(req.id)} className="w-full text-xs font-black text-orange-600 bg-orange-50 hover:bg-orange-600 hover:text-white ring-1 ring-orange-200 hover:ring-transparent py-2.5 rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 shadow-sm hover:shadow-orange-500/20">
                                  <Activity size={14} /> تنفيذ الدراسة
                                </button>
                            )}
                            
                            {req.status !== "paid" && !isGrouped && (
                              <div className="flex w-full gap-2">
                                {/* Only show Result upload/edit if it does NOT require a film */}
                                {req.with_film !== 1 && (
                                  <button onClick={() => setUploadingItem({ type: "request", item: req })} className={`flex-1 text-[11px] font-black py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 border ${isCompleted ? "bg-white border-emerald-200 text-emerald-600 hover:bg-emerald-50" : isReadyForDelivery ? "bg-white border-blue-200 text-blue-600 hover:bg-blue-50" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
                                    {isCompleted ? <><Edit size={14} /> تعديل النتيجة</> : <><UploadCloud size={14} /> {isResultUploaded ? "تعديل النتيجة" : "رفع النتيجة"}</>}
                                  </button>
                                )}
                                
                                {isReadyForDelivery && canDeliverIndividually && (
                                  <button
                                    onClick={() => handleDeliverRequest(req.id)}
                                    className="flex-1 text-[11px] font-black bg-emerald-600 text-white hover:bg-emerald-700 py-2.5 px-3 rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5"
                                  >
                                    <CheckCircle size={14} /> إنهاء وتسليم
                                  </button>
                                )}
                                
                                {req.with_film === 1 && !canDeliverIndividually && (
                                  <div
                                    title="يجب إدراج هذه الدراسة في فيلم أولاً، وسيتم رفع النتيجة للفيلم."
                                    className="flex-1 text-[11px] font-bold bg-slate-50 text-slate-400 py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 border border-slate-200 border-dashed"
                                  >
                                    <AlertCircle size={14} /> بانتظار إدراجها بفيلم
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {req.status !== "paid" && isGrouped && (
                               <div className="w-full text-[11px] font-bold text-slate-500 bg-slate-50 py-2.5 rounded-xl text-center border border-slate-200 border-dashed flex items-center justify-center gap-1.5">
                                 <Film size={14} className="text-slate-400" /> مرتبط ومُدرج ضمن فيلم
                               </div>
                            )}
                          </div>

                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              </div>

              {/* Right Column: Films Studio (Visible if not pending) */}
              {!isPendingTab && (
                <div className="hidden lg:flex w-2/5 xl:w-1/3 flex-col bg-slate-50 relative overflow-hidden">
                  
                  {/* Studio Header */}
                  <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200/60 bg-slate-100/50 relative z-10">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-orange-100 text-orange-600 rounded-lg">
                        <Film size={16} />
                      </div>
                      <span className="font-black text-sm text-slate-800">أستوديو الأفلام</span>
                    </div>
                    {unassignedFilmsCount > 0 && (
                      <button onClick={() => setGroupingMode(true)} className="text-xs font-black bg-orange-500 text-white hover:bg-orange-600 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm shadow-orange-500/20">
                        <Plus size={14} /> فيلم جديد
                      </button>
                    )}
                  </div>

                  {/* Studio Content */}
                  <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4 relative z-10">
                    {films.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                          <Film size={32} className="text-slate-300" />
                        </div>
                        <p className="font-bold text-sm text-slate-500">لا توجد أفلام مجمعة</p>
                        <p className="text-xs text-slate-400 mt-1 text-center max-w-[200px]">قم بإضافة فيلم لتجميع الفحوصات ذات الصلة وطباعتها معاً.</p>
                      </div>
                    ) : (
                      films.map((f) => {
                        const filmRequests = requests.filter(r => r.radiology_film_id === f.id);
                        const isFilmCompleted = filmRequests.length > 0 && filmRequests.every(r => r.status === "completed");
                        const isFilmResultUploaded = filmRequests.length > 0 && (
                          filmRequests.some(r => r.result_file || r.result_notes)
                        );
                        const isFilmReadyForDelivery = isFilmResultUploaded && !isFilmCompleted;
                        
                        return (
                        <div key={f.id} className={`bg-white p-4 rounded-[1.5rem] border ${isFilmReadyForDelivery ? 'border-blue-200' : 'border-slate-200'} shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col justify-between`}>
                          {/* Top accent */}
                          <div className={`absolute top-0 right-0 w-full h-1 ${isFilmReadyForDelivery ? 'bg-blue-400' : 'bg-slate-800'}`}></div>

                          <div>
                            <div className="flex justify-between items-start mb-4 gap-2">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-10 h-10 rounded-xl ${f.film_size === "large" ? "bg-orange-50 text-orange-600 border border-orange-100" : "bg-blue-50 text-blue-600 border border-blue-100"} flex items-center justify-center font-black text-sm shadow-sm shrink-0`}>
                                  {f.film_size === "large" ? "L" : "S"}
                                </div>
                                <div className="min-w-0 flex flex-col justify-center">
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-extrabold text-slate-800 text-sm truncate">
                                      فيلم {f.film_size === "large" ? "كبير" : "صغير"}
                                    </p>
                                    {isFilmReadyForDelivery && (
                                      <span className="flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded text-blue-700 bg-blue-50 border border-blue-100 shadow-[0_1px_2px_rgba(0,0,0,0.05)] whitespace-nowrap">
                                        <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse shrink-0"></span>
                                        جاهز
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1 mt-0.5">
                                    <CheckSquare size={10} /> {filmRequests.length} دراسات
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button onClick={() => setGroupingMode(f)} className="text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 p-1.5 rounded-lg transition-colors border border-transparent hover:border-blue-100" title="تحديث وتعديل محتوى الفيلم">
                                  <Edit size={14} />
                                </button>
                                <button onClick={() => handleDeleteFilm(f.id)} className="text-slate-400 hover:text-red-600 bg-slate-50 hover:bg-red-50 p-1.5 rounded-lg transition-colors border border-transparent hover:border-red-100" title="فك ارتباط الفيلم وحذف التجميع">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                            
                            <div className="space-y-1.5 mb-4 bg-slate-50/50 p-3 rounded-xl border border-slate-100/50">
                              {filmRequests.map((fr, idx) => (
                                <p key={idx} className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5 truncate">
                                  <span className="w-1 h-1 rounded-full bg-slate-400 flex-shrink-0" /> {fr.name}
                                </p>
                              ))}
                            </div>
                          </div>
                          
                          <div className="flex gap-2">
                            <button onClick={() => setUploadingItem({ type: "film", item: f })} className={`flex-1 text-[11px] font-bold py-2 rounded-xl transition-all flex justify-center items-center gap-1.5 ${isFilmResultUploaded ? "bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50" : "bg-slate-800 text-white hover:bg-slate-900 border-2 border-slate-800 hover:shadow-md"}`}>
                              {isFilmCompleted ? (
                                <><Edit size={14} /> تعديل النتيجة</>
                              ) : isFilmResultUploaded ? (
                                <><Edit size={14} /> تعديل النتيجة</>
                              ) : (
                                <><UploadCloud size={14} /> إرفاق النتيجة</>
                              )}
                            </button>
                            {isFilmReadyForDelivery && (
                              <button onClick={() => handleDeliverFilm(f.id)} className="text-[11px] font-black bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-lg px-3 py-2 rounded-xl transition-all flex items-center gap-1 whitespace-nowrap">
                                تسليم <CheckCircle size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      )})
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating Action Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-100 flex justify-between items-center z-20">
          <div className="text-xs font-bold text-slate-400 hidden sm:block">
            {isAllDone ? "🎉 جميع الفحوصات مكتملة" : "يرجى استكمال جميع الفحوصات لإنهاء الملف"}
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button onClick={onClose} className="flex-1 sm:flex-none bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 font-black py-2.5 px-6 rounded-xl transition-all">
              إغلاق
            </button>
            
            {!isCompletedTab && !hasPending && (
              <button onClick={handleFinishPatient} disabled={completing || !isAllDone} className={`flex-1 sm:flex-none font-black py-2.5 px-8 rounded-xl transition-all flex items-center justify-center gap-2 ${isAllDone ? "bg-slate-800 hover:bg-slate-900 text-white shadow-lg shadow-slate-800/20" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
                {completing ? <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full inline-block" /> : <CheckCircle size={16} />}
                إنهاء وتسليم الملف
              </button>
            )}
          </div>
        </div>

      </div>

      {uploadingItem && (
        <UploadResultModal
          endpoint={
            uploadingItem.type === "film"
              ? `/api/radiology/films/${uploadingItem.item.id}/result`
              : `/api/radiology/request/${uploadingItem.item.id}/result`
          }
          initialNotes={
            uploadingItem.type === "film"
              ? requests.find(r => r.radiology_film_id === uploadingItem.item.id)?.result_notes ?? ""
              : uploadingItem.item.result_notes ?? ""
          }
          initialFiles={
            uploadingItem.type === "film"
              ? requests.find(r => r.radiology_film_id === uploadingItem.item.id)?.result_file ?? null
              : uploadingItem.item.result_file ?? null
          }
          token={token}
          onClose={handleUploadClose}
          onUploaded={handleUploaded}
        />
      )}
      {groupingMode && (
        <FilmGroupingModal
          visitId={visitId}
          requests={requests}
          token={token}
          initialFilm={typeof groupingMode === "object" ? groupingMode : null}
          onClose={handleGroupingClose}
          onGrouped={handleGrouped}
        />
      )}
      
      {/* Delete Confirmation Modal */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 z-[1020] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                            <div className="bg-white rounded-3xl shadow-luxury overflow-hidden flex flex-col border border-slate-100 animate-in zoom-in-95 transition-all duration-300 w-full max-w-md" dir="rtl">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2">
                <Trash2 size={32} />
              </div>
              <h3 className="font-extrabold text-lg text-slate-800">تأكيد الحذف</h3>
              <p className="text-slate-500 text-sm font-semibold leading-relaxed">
                هل أنت متأكد من فك ارتباط هذا الفيلم وحذفه؟
              </p>
              <div className="bg-orange-50 text-orange-700 p-3 rounded-xl text-xs font-bold border border-orange-100 flex items-start gap-2 text-right mt-2 shadow-sm">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                حذف الفيلم سيؤدي إلى إرجاع جميع الفحوصات المنجزة المرتبطة به لحالة "قيد الإجراء" وإلغاء تسليمها.
              </div>
            </div>
            <div className="flex gap-3 p-4 bg-slate-50/50 border-t border-slate-150">
              <button 
                onClick={() => setDeleteConfirm({ isOpen: false, filmId: null })}
                className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-sm transition-colors"
              >
                إلغاء
              </button>
              <button 
                onClick={confirmDeleteFilm}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-black rounded-xl text-sm shadow-md transition-colors"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

    </div>,
    document.body
  );
};


export default PatientDetailPanel;