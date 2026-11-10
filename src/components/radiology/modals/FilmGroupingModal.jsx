import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText, X, UploadCloud, Eye, Trash2, CheckCircle, Minimize2, Maximize2,
  Check, LayoutGrid, List, Plus, Film, Image as ImageIcon, Edit, Radiation,
  Calendar, Activity, CheckSquare, AlertCircle
} from 'lucide-react';
import { toast } from 'react-toastify';
import { getSocket } from '../../utils/socket';
// ── Film Grouping Modal ───────────────────────────────────────────
const FilmGroupingModal = ({ visitId, requests, token, onClose, onGrouped, initialFilm }) => {
  const [filmSize, setFilmSize] = useState(initialFilm ? initialFilm.film_size : "large");
  
  const currentLinkedReqs = initialFilm ? requests.filter(r => r.radiology_film_id === initialFilm.id) : [];
  const [selectedReqs, setSelectedReqs] = useState(currentLinkedReqs.map(r => r.id));
  const [saving, setSaving] = useState(false);

  const unassigned = requests.filter((r) => r.with_film === 1 && (!r.radiology_film_id || (initialFilm && r.radiology_film_id === initialFilm.id)));
  const maxSlots = filmSize === "large" ? 3 : 2;

  const handleSave = async () => {
    if (selectedReqs.length === 0) return toast.error("يجب تحديد دراسة إشعاعية واحدة على الأقل");
    if (selectedReqs.length > maxSlots) return toast.error(`الحد الأقصى لحجم الفيلم هو ${maxSlots}`);

    setSaving(true);
    try {
      if (initialFilm) {
        await fetch(`/api/radiology/films/${initialFilm.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      const res = await fetch(`/api/radiology/visit/${visitId}/films`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filmSize, requestIds: selectedReqs }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(d.message);
        onGrouped();
        onClose();
      } else toast.error(d.message);
    } catch {
      toast.error("خطأ في الاتصال الخادم");
    } finally {
      setSaving(false);
    }
  };

  const toggleSelection = (id) => {
    if (selectedReqs.includes(id)) {
      setSelectedReqs(selectedReqs.filter((r) => r !== id));
    } else {
      if (selectedReqs.length >= maxSlots) {
         toast.info(`الفيلم ممتلئ! (الحد الأقصى ${maxSlots})`);
         return;
      }
      setSelectedReqs([...selectedReqs, id]);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className="relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] w-full max-w-5xl h-[80vh] rounded-[2.5rem] border border-white/60">
        
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between flex-shrink-0 bg-white border-b border-slate-100 z-20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center font-black shadow-inner border border-orange-100">
              <LayoutGrid size={24} />
            </div>
            <div>
              <h2 className="font-black text-slate-800 text-xl tracking-tight">أستوديو تحضير الأفلام الطبية</h2>
              <p className="text-slate-500 font-medium text-xs mt-1">قم بتحديد حجم الفيلم وتوزيع الدراسات الإشعاعية عليه بدقة.</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-xl transition-all border border-slate-200">
            <X size={18}/>
          </button>
        </div>

        {/* Dual-Pane Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Left Pane: Available Scans */}
          <div className="w-full md:w-1/2 flex flex-col bg-white border-l border-slate-100 relative z-10 h-full">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-slate-700 text-sm flex items-center gap-2">
                <List size={16} className="text-slate-400" />
                الدراسات المتاحة للتجميع
              </h3>
              <span className="bg-white border border-slate-200 text-slate-600 font-black text-[10px] px-2 py-0.5 rounded-lg">
                {unassigned.length} متاح
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-slate-50/50">
              {unassigned.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-emerald-600 bg-emerald-50/50 rounded-2xl border border-emerald-100/50">
                  <CheckCircle size={32} className="mb-3 opacity-80" />
                  <p className="font-black text-sm">جميع الدراسات مكتملة الإدراج</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {unassigned.map((r) => {
                    const isSelected = selectedReqs.includes(r.id);
                    return (
                      <div 
                        key={r.id} 
                        onClick={() => toggleSelection(r.id)} 
                        className={`group cursor-pointer flex items-center justify-between p-4 rounded-2xl border-2 transition-all duration-200 ${isSelected ? "border-orange-500 bg-orange-50/30 shadow-sm" : "border-slate-100 bg-white hover:border-orange-200 hover:shadow-sm"}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded flex items-center justify-center border-2 transition-colors ${isSelected ? "bg-orange-500 border-orange-500 text-white" : "border-slate-200 bg-slate-50 group-hover:border-orange-300"}`}>
                            {isSelected && <Check size={14} strokeWidth={3} />}
                          </div>
                          <span className={`font-bold text-sm ${isSelected ? "text-orange-900" : "text-slate-700"}`}>
                            {r.name}
                          </span>
                        </div>
                        {!isSelected && (
                           <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-orange-50 text-orange-600 p-1.5 rounded-lg">
                             <Plus size={16} />
                           </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Pane: Visual Canvas */}
          <div className="w-full md:w-1/2 flex flex-col bg-slate-100 relative h-full">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-slate-100 pointer-events-none"></div>
            
            <div className="px-6 py-4 bg-white/60 backdrop-blur-sm border-b border-slate-200 flex items-center justify-between z-10">
              <div className="flex flex-col">
                <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                  <Film size={16} className="text-orange-500" />
                  محتوى الفيلم الحالي
                </h3>
                <span className="text-xs font-bold text-slate-500 mt-1">
                  عدد الدراسات المدرجة: <span className="text-orange-600 font-black">{selectedReqs.length}</span> / {maxSlots}
                </span>
              </div>
              
              <div className="flex bg-slate-200/50 p-1 rounded-xl">
                <button onClick={() => { setFilmSize("small"); setSelectedReqs([]); }} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${filmSize === "small" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  فيلم S
                </button>
                <button onClick={() => { setFilmSize("large"); setSelectedReqs([]); }} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${filmSize === "large" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  فيلم L
                </button>
              </div>
            </div>

            <div className="flex-1 p-6 sm:p-10 flex items-center justify-center relative z-10 overflow-y-auto custom-scrollbar">
              {/* Film Visualizer */}
              <div className="w-full max-w-xs bg-slate-800 rounded-lg p-2 shadow-2xl flex flex-col gap-2 transition-all duration-300 h-[280px]">
                <div className="flex justify-between items-center px-2 py-1 mb-1">
                  <div className="flex gap-1">
                    {[1,2,3,4].map(i => <div key={i} className="w-2 h-2 rounded-sm bg-white/20"></div>)}
                  </div>
                  <span className="text-white/40 font-black text-[10px] tracking-widest">{filmSize === "large" ? "LARGE FILM" : "SMALL FILM"}</span>
                  <div className="flex gap-1">
                    {[1,2,3,4].map(i => <div key={i} className="w-2 h-2 rounded-sm bg-white/20"></div>)}
                  </div>
                </div>

                {/* Slots */}
                {Array.from({ length: maxSlots }).map((_, idx) => {
                  const reqId = selectedReqs[idx];
                  const req = reqId ? unassigned.find(r => r.id === reqId) : null;
                  
                  return (
                    <div key={idx} onClick={() => reqId && toggleSelection(reqId)} className={`flex-1 rounded border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center gap-2 ${req ? "border-transparent bg-slate-900/80 cursor-pointer hover:bg-red-500/20 group relative overflow-hidden" : "border-slate-600 bg-slate-800/50"}`}>
                       {req ? (
                         <>
                           <ImageIcon size={24} className="text-slate-400 group-hover:text-red-400 transition-colors" />
                           <span className="font-bold text-white text-xs px-4 text-center">{req.name}</span>
                           <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                             <Trash2 size={24} className="text-red-500" />
                           </div>
                         </>
                       ) : (
                         <>
                           <Plus size={20} className="text-slate-600" />
                           <span className="font-bold text-slate-500 text-[10px]">فتحة فارغة</span>
                         </>
                       )}
                    </div>
                  );
                })}
                
                <div className="flex justify-between items-center px-2 py-1 mt-1">
                  <div className="flex gap-1">
                    {[1,2,3,4].map(i => <div key={i} className="w-2 h-2 rounded-sm bg-white/20"></div>)}
                  </div>
                  <div className="flex gap-1">
                    {[1,2,3,4].map(i => <div key={i} className="w-2 h-2 rounded-sm bg-white/20"></div>)}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-white border-t border-slate-200 flex justify-between items-center z-10 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
               <div className="text-xs font-bold text-slate-400 hidden sm:block">
                 تم تحديد <span className="text-orange-600 font-black">{selectedReqs.length}</span> من أصل <span className="text-slate-600 font-black">{maxSlots}</span>
               </div>
               <div className="flex gap-3 w-full sm:w-auto">
                 <button onClick={onClose} className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-slate-500 hover:bg-slate-100 font-black text-sm transition-colors border border-slate-200 bg-white">
                   إلغاء
                 </button>
                 <button onClick={handleSave} disabled={saving || selectedReqs.length === 0} className="flex-1 sm:flex-none px-8 py-2.5 rounded-xl bg-orange-600 text-white font-black text-sm hover:bg-orange-700 transition-all shadow-md shadow-orange-600/20 disabled:opacity-50 disabled:shadow-none">
                   {saving ? "جاري الحفظ..." : "اعتماد الفيلم المطبوع"}
                 </button>
               </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>,
    document.body
  );
};


export default FilmGroupingModal;