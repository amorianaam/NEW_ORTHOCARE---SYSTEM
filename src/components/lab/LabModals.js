import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  FileText, X, UploadCloud, Eye, Trash2, CheckCircle, Minimize2, Maximize2,
  LayoutGrid, List, Activity, FlaskConical, AlertCircle, Edit, Calendar, ExternalLink,
  Clock, User, Scissors
} from "lucide-react";
import { toast } from "react-toastify";
import { getSocket } from "../../utils/socket";
import useSocketStore from "../../store/useSocketStore";
import MedicalImageViewer from "../common/MedicalImageViewer";
import ClinicalResultViewerModal from "../common/ClinicalResultViewerModal";
import { formatArabicPendingLabBadge, formatArabicPendingLabTitle } from "../../utils/arabicFormatters";
import { groupLabsBySharedResult } from "../../utils/emrHelpers";
import { getServerBaseUrl } from "../../utils/apiConfig";

// ── Resolves any file object to a usable URL via LAN Server Gateway ──
const resolveFileUrl = (file) => {
  if (!file) return null;
  if (file.previewUrl) return file.previewUrl;
  if (file.url) {
    if (file.url.startsWith('http') || file.url.startsWith('blob:') || file.url.startsWith('data:')) {
      return file.url;
    }
    const base = getServerBaseUrl();
    const cleanPath = file.url.startsWith('/') ? file.url : `/${file.url}`;
    return `${base}${cleanPath}`;
  }
  return file.base64 || null;
};

// ── Shared Result Preview Modal ──────────────────────────────────────
export const SharedResultPreviewModal = ({ file, onClose }) => {
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  if (!file) return null;

  const previewUrl = resolveFileUrl(file);

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300" dir="rtl">
      <div className={`bg-white rounded-3xl shadow-luxury flex flex-col overflow-hidden transition-all duration-300 ${isPreviewMaximized ? 'w-[98vw] h-[98vh]' : 'w-full max-w-4xl h-[80vh]'}`}>
        <div className="flex justify-between items-center p-4 border-b bg-slate-50 flex-shrink-0">
          <h3 className="font-black text-slate-800">عرض المرفق: {file.name}</h3>
          <div className="flex items-center gap-2">
            {previewUrl && (
              <a 
                href={previewUrl} 
                target="_blank" 
                rel="noreferrer"
                className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors text-xs font-bold flex items-center gap-1.5"
              >
                <ExternalLink size={14} /> فتح في نافذة مستقلة
              </a>
            )}
            <button onClick={() => setIsPreviewMaximized(!isPreviewMaximized)} className="p-2 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-800 hover:text-white transition-colors">
              {isPreviewMaximized ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
            <button onClick={onClose} className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-100 flex items-center justify-center overflow-hidden p-4 relative">
          {!resolveFileUrl(file) ? (
            <div className="text-center text-slate-500 font-bold p-8">جاري التحميل أو الملف غير متاح للمعاينة.</div>
          ) : (file.type === "application/pdf" || (file.base64 && file.base64.startsWith("data:application/pdf"))) ? (
            <iframe
              src={resolveFileUrl(file)}
              className="w-full h-full rounded-xl border border-slate-200 bg-white shadow-inner"
              title="Document Preview"
            />
          ) : (
            <MedicalImageViewer
              src={resolveFileUrl(file)}
              alt={file.name || "Medical Result"}
              showControls={true}
              onFullscreen={() => setIsPreviewMaximized((prev) => !prev)}
              isFullscreen={isPreviewMaximized}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ── Lab Result Details Modal ──────────────────────────────────────
export const LabResultDetailsModal = ({ request, onClose }) => {
  const [previewFile, setPreviewFile] = useState(null);
  
  let files = [];
  try {
    if (typeof request.result_file === 'string') {
      if (request.result_file.startsWith('[')) {
        files = JSON.parse(request.result_file);
      } else if (request.result_file) {
        files = [{ base64: request.result_file, name: 'نتيجة الفحص', type: 'application/pdf' }];
      }
    } else if (Array.isArray(request.result_file)) {
      files = request.result_file;
    }
  } catch {}

  return createPortal(
    <div className="fixed inset-0 z-[100002] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] w-full max-w-4xl h-auto max-h-[85vh] rounded-[2.5rem] border border-white/60">
        
        <div className="px-6 py-5 flex items-center justify-between bg-white border-b border-slate-100 z-20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center shadow-sm border border-emerald-100">
              <CheckCircle size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800">نتيجة التحليل المخبري</h2>
              <p className="text-sm font-bold text-slate-500 mt-0.5">{request.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors flex items-center justify-center">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-8">
          <div className="w-full flex flex-col gap-3">
            <label className="text-base font-black text-slate-700 flex items-center gap-2">
              <FileText size={18} className="text-emerald-500" />
              الملاحظات والنتائج النصية
            </label>
            <div className="w-full bg-white border-2 border-slate-100 rounded-2xl p-4 sm:p-5 text-slate-700 font-semibold leading-loose shadow-sm text-[15px]">
              {request.result_notes ? (
                <div className="whitespace-pre-wrap break-words">{request.result_notes}</div>
              ) : (
                <div className="py-6 flex items-center justify-center text-slate-400 italic text-sm">لا توجد ملاحظات نصية مسجلة.</div>
              )}
            </div>
          </div>
          
          <div className="w-full flex flex-col gap-3">
            <label className="text-base font-black text-slate-700 flex items-center gap-2">
              <UploadCloud size={18} className="text-emerald-500" />
              الملفات والمرفقات
            </label>
            <div className="flex flex-col gap-3">
              {files.length === 0 && (
                <div className="w-full py-8 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 font-bold text-sm">
                  لا توجد ملفات مرفقة
                </div>
              )}
              {files.map((file, idx) => (
                <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group" onClick={() => setPreviewFile(file)}>
                  <div className="flex items-center gap-4 overflow-hidden pr-2">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden group-hover:bg-emerald-50 transition-colors">
                      {(file.type && file.type.startsWith("image/")) || (file.base64 && file.base64.startsWith("data:image/")) ? (
                        <img src={resolveFileUrl(file)} alt="preview" className="w-full h-full object-cover" />
                      ) : (
                        <FileText size={22} className="text-slate-400 group-hover:text-emerald-500 transition-colors" />
                      )}
                    </div>
                    <span className="text-sm font-bold text-slate-700 line-clamp-2 break-all group-hover:text-emerald-700 transition-colors">{file.name || 'ملف مرفق'}</span>
                  </div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-emerald-600 group-hover:bg-emerald-100 transition-colors shrink-0">
                    <Eye size={20} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {previewFile && <SharedResultPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
      </div>
    </div>,
    document.body
  );
};


// ── Upload Result Modal (Lab - Mode B) ───────────────────────────────────────────
export const LabUploadResultModal = ({ 
  isEditMode, 
  endpoint, 
  bulkEndpoint,
  visitId,
  allVisitTests = [],
  uploadingItem,
  initialNotes = "", 
  initialFiles, 
  token, 
  onClose, 
  onUploaded, 
  closeOnBackdropClick = false 
}) => {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const eligibleTests = useMemo(() => {
    return (allVisitTests || []).filter(t => t && t.status && t.status !== 'paid');
  }, [allVisitTests]);
  const isBulk = applyToAll && eligibleTests.length > 1;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [notes]);

  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    return () => {
      filesRef.current.forEach(f => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
  }, []);

  useEffect(() => {
    if (initialFiles) {
      try {
        if (typeof initialFiles === 'string') {
          if (initialFiles.trim().startsWith('[')) {
            setFiles(JSON.parse(initialFiles));
          } else {
            setFiles([{ name: 'ملف النتيجة المحفوظ', base64: initialFiles, type: 'application/pdf' }]);
          }
        } else if (Array.isArray(initialFiles)) {
          setFiles(initialFiles);
        } else {
          setFiles([]);
        }
      } catch (e) {
        setFiles([]);
      }
    } else {
      setFiles([]);
    }
  }, [initialFiles]);

  const processFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const selected = Array.from(fileList);
    const validFiles = [];
    selected.forEach(file => {
      if (file.size > 15 * 1024 * 1024) {
        toast.error(`الملف ${file.name} يتجاوز الحجم المسموح (15MB)`);
      } else {
        const isSupported = file.type.startsWith("image/") || file.type === "application/pdf" || /\.(jpg|jpeg|png|webp|pdf)$/i.test(file.name);
        if (!isSupported) {
          toast.error(`الملف ${file.name} غير مدعوم، يرجى اختيار صور أو ملفات PDF`);
        } else {
          if (file.type.startsWith("image/") || file.type === "application/pdf") {
            file.previewUrl = URL.createObjectURL(file);
          }
          validFiles.push(file);
        }
      }
    });
    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer && e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (e, idx) => {
    e.stopPropagation();
    setFiles(prev => {
      const newFiles = [...prev];
      if (newFiles[idx].previewUrl) URL.revokeObjectURL(newFiles[idx].previewUrl);
      newFiles.splice(idx, 1);
      return newFiles;
    });
  };

  const handleSave = async () => {
    if (files.length === 0 && !notes)
      return toast.error("يجب إرفاق ملف أو كتابة تقرير");
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("resultNotes", notes);

      const existingFiles = [];
      files.forEach(f => {
        if (f instanceof File) {
          formData.append("files", f); // binary upload via Multer
        } else {
          existingFiles.push(f); // preserve existing server files
        }
      });

      if (existingFiles.length > 0) {
        formData.append("existingFiles", JSON.stringify(existingFiles));
      }

      const targetEndpoint = (isBulk && bulkEndpoint) ? bulkEndpoint : endpoint;

      if (isBulk) {
        const targetIds = eligibleTests.map(t => t.id);
        if (targetIds.length > 0) {
          formData.append("targetTestIds", JSON.stringify(targetIds));
        }
      }

      const res = await fetch(targetEndpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }, // NO Content-Type header — let browser set multipart boundary
        body: formData,
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "فشل الحفظ");

      toast.success(d.message || (isBulk ? "تم حفظ واعتماد النتيجة للتحاليل الجارية بنجاح" : "تم حفظ النتيجة بنجاح"));
      onUploaded();
    } catch (err) {
      toast.error(err.message || "حدث خطأ أثناء حفظ النتيجة");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100002] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
      {/* Background Overlay: closeOnBackdropClick is disabled so clicking outside does not close */}
      <div className="absolute inset-0" onClick={closeOnBackdropClick ? onClose : undefined} />
      <div className="relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] w-full max-w-2xl sm:max-w-3xl h-auto max-h-[90vh] rounded-[2rem] sm:rounded-[2.5rem] border border-white/60">
        <div className="px-6 py-4 sm:py-5 flex items-center justify-between bg-white border-b border-slate-100 z-20 flex-shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center font-black shadow-inner border border-violet-100/80">
              <FileText size={22} />
            </div>
            <div>
              <h2 className="font-black text-slate-800 text-base sm:text-lg tracking-tight">
                {isEditMode ? "تعديل النتيجة والتقرير المخبري" : "إرفاق النتيجة والتقرير المخبري"}
              </h2>
              <p className="text-slate-500 font-medium text-xs mt-0.5">
                اكتب التقرير المخبري وارفق ملفات النتائج الصادرة عن الأجهزة
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-xl transition-all border border-slate-200 cursor-pointer active:scale-95"
            title="إغلاق النافذة"
          >
            <X size={18}/>
          </button>
        </div>

        {/* ── Scrollable Body: Bulk Option on Top, Report Section, File Upload Section ── */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 custom-scrollbar bg-slate-50/50 flex flex-col gap-5">
          {/* خيار تطبيق النتيجة والتقرير على جميع التحاليل الجارية (Bulk Sharing Option - Top) */}
          {eligibleTests && eligibleTests.length > 1 && (
            <div 
              onClick={() => setApplyToAll(!applyToAll)}
              className={`p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 cursor-pointer select-none flex items-center justify-between gap-3 ${
                applyToAll 
                  ? "bg-gradient-to-r from-violet-50 via-purple-50 to-violet-50 border-violet-300 shadow-xs" 
                  : "bg-white border-slate-200 hover:border-violet-200 hover:bg-violet-50/20"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all shrink-0 ${
                  applyToAll 
                    ? "bg-violet-600 border-violet-600 text-white shadow-xs" 
                    : "border-slate-300 bg-white"
                }`}>
                  {applyToAll && <CheckCircle size={14} className="stroke-[2.5]" />}
                </div>
                
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className={`text-xs sm:text-sm font-black transition-colors ${
                      applyToAll ? "text-violet-900" : "text-slate-700"
                    }`}>
                      تطبيق هذه النتيجة والتقرير على جميع التحاليل الجارية
                    </span>
                    
                    <span className={`inline-flex items-center gap-1.5 text-xs font-black px-3 py-0.5 rounded-full border shadow-2xs transition-colors ${
                      applyToAll 
                        ? "bg-violet-200/80 text-violet-900 border-violet-300" 
                        : "bg-violet-100 text-violet-800 border-violet-200/90"
                    }`}>
                      <span>{eligibleTests.length}</span>
                      <span>تحاليل جارية</span>
                    </span>
                  </div>
                  {allVisitTests.some(t => t.status === 'paid') && (
                    <span className="text-[11px] text-slate-400 font-medium mt-0.5">
                      (مستثنى منها التحاليل التي في قائمة الانتظار ولم تُبدأ بعد)
                    </span>
                  )}
                </div>
              </div>

              <span className={`text-[11px] font-black px-2.5 py-1 rounded-xl shrink-0 transition-all ${
                applyToAll 
                  ? "bg-violet-600 text-white shadow-xs" 
                  : "bg-slate-100 text-slate-400"
              }`}>
                {applyToAll ? "مُفعَّل" : "معطَّل"}
              </span>
            </div>
          )}

          {allVisitTests && allVisitTests.length > 1 && eligibleTests.length <= 1 && (
            <div className="p-3 sm:p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-amber-800 text-xs flex items-center gap-2.5 select-none">
              <AlertCircle size={16} className="text-amber-600 shrink-0" />
              <span className="font-semibold leading-relaxed">
                توجد تحاليل أخرى للمريض في قائمة الانتظار؛ لتطبيق النتيجة عليها جماعياً يجب استلامها وبدء تنفيذها أولاً بواسطة الفني.
              </span>
            </div>
          )}

          {/* 1. قسم كتابة التقرير (Top Section) */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center">
                  <FileText size={14} />
                </div>
                <span>كتابة التقرير المخبري والتشخيص</span>
              </label>
              <span className="text-[11px] font-bold text-slate-400">
                اختياري إذا تم إرفاق ملف
              </span>
            </div>
            <div className="relative w-full">
              <textarea
                ref={textareaRef}
                autoFocus
                rows={3}
                className="w-full bg-white shadow-2xs rounded-2xl p-4 text-slate-700 font-medium text-xs sm:text-sm leading-relaxed focus:ring-2 focus:ring-violet-500 focus:border-violet-500 border border-slate-200 transition-all resize-none placeholder-slate-300 custom-scrollbar min-h-[95px]"
                placeholder="اكتب التقرير والتشخيص والقيم المخبرية هنا..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* 2. قسم إرفاق ملفات النتائج (صور أو PDF) - أسفل قسم كتابة التقارير */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center">
                  <UploadCloud size={14} />
                </div>
                <span>إرفاق ملفات النتائج (صور أو PDF)</span>
              </label>
              {files.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-black text-violet-800 bg-violet-100/90 px-3 py-1 rounded-full border border-violet-200 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-600 animate-pulse" />
                  <span>{files.length} {files.length === 1 ? 'ملف مرفق' : 'ملفات مرفقة'}</span>
                </span>
              )}
            </div>

            <input type="file" multiple accept="image/*, application/pdf" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            
            {/* Drag & Drop Box */}
            <div 
              onClick={() => fileInputRef.current.click()} 
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`w-full border-dashed border-2 transition-all p-4 sm:p-5 rounded-2xl flex flex-col items-center justify-center gap-2.5 cursor-pointer group ${
                isDragging 
                  ? "border-violet-500 bg-violet-100/70 scale-[1.01] shadow-md ring-4 ring-violet-400/20" 
                  : "border-slate-200 hover:border-violet-400 bg-white hover:bg-violet-50/40 shadow-2xs hover:shadow-xs"
              }`}
            >
              <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xs ${
                isDragging ? "bg-violet-600 text-white scale-110 shadow-violet-200" : "bg-violet-50 text-violet-600 group-hover:scale-110"
              }`}>
                <UploadCloud size={22} className={isDragging ? "animate-bounce" : ""} />
              </div>
              <div className="text-center">
                <p className={`font-black text-xs sm:text-sm transition-colors ${
                  isDragging ? "text-violet-800 text-sm font-extrabold" : "text-slate-700 group-hover:text-violet-700"
                }`}>
                  {isDragging ? (
                    "أفلت الملفات الآن لرفعها مباشرة"
                  ) : (
                    <>اسحب وأفلت الملفات هنا، أو <span className="text-violet-600 underline underline-offset-2">تصفح جهازك</span></>
                  )}
                </p>
                <p className="font-bold text-slate-400 text-[10px] sm:text-[11px] mt-0.5">
                  يدعم صور الأجهزة المخبرية (JPG, PNG) وملفات التقارير (PDF) حتى 15 ميجابايت
                </p>
              </div>
            </div>

            {/* Uploaded Files Grid */}
            {files.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[160px] overflow-y-auto custom-scrollbar p-0.5 mt-1">
                {files.map((file, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs hover:border-violet-300 transition-all group"
                  >
                    <div 
                      className="flex items-center gap-2.5 overflow-hidden cursor-pointer flex-1 min-w-0" 
                      onClick={() => setPreviewFile(file)}
                      title="انقر للمعاينة"
                    >
                      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-100">
                        {(file.type && file.type.startsWith("image/")) || (file.base64 && file.base64.startsWith("data:image/")) ? (
                          <img src={resolveFileUrl(file)} alt="preview" className="w-full h-full object-cover" />
                        ) : (
                          <FileText size={16} className="text-violet-600" />
                        )}
                      </div>
                      <span className="text-xs font-bold text-slate-700 truncate block flex-1" title={file.name}>
                        {file.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 mr-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setPreviewFile(file); }} 
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer active:scale-95"
                        title="معاينة الملف"
                      >
                        <Eye size={14} />
                      </button>
                      <button 
                        onClick={(e) => removeFile(e, idx)} 
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer active:scale-95"
                        title="حذف الملف"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Modal Footer ── */}
        <div className="p-4 sm:p-5 bg-white border-t border-slate-100 flex items-center justify-end gap-3 rounded-b-[2rem] sm:rounded-b-[2.5rem] flex-shrink-0">
          <button 
            onClick={onClose} 
            className="px-5 sm:px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer active:scale-95"
          >
            إلغاء
          </button>
          <button 
            onClick={handleSave} 
            disabled={saving} 
            className="px-6 sm:px-8 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-violet-600 hover:bg-violet-700 hover:shadow-lg hover:shadow-violet-600/25 transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle size={16} />}
            <span>{isBulk ? `حفظ واعتماد النتيجة (${eligibleTests.length} تحاليل جارية)` : "حفظ واعتماد النتيجة"}</span>
          </button>
        </div>
      </div>
      {previewFile && <SharedResultPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>,
    document.body
  );
};

// ── Helpers ─────────────────────────────────────────────────────────────
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

const formatDateEn = (isoStr) => {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '—';
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
};

const formatTimeEn = (isoStr) => {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '—';
  const pad = (n) => n.toString().padStart(2, '0');
  let hours = d.getHours();
  const minutes = pad(d.getMinutes());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${pad(hours)}:${minutes} ${ampm}`;
};

// ── Patient Detail Panel ────────────────────────────────────────────────
export const LabPatientDetailPanel = ({ visitId, token, isCompletedTab, isPendingTab, onStartAll, onClose, onCompleted, isArchiveMode = false, readOnly = false }) => {
  const isArchive = isArchiveMode || readOnly;
  const isInProgressTab = !isPendingTab && !isCompletedTab && !isArchive;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(
    () => localStorage.getItem("labFullscreen") === "true"
  );
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem("labViewMode") || "grid"
  );
  const [uploadingItem, setUploadingItem] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [viewResultItem, setViewResultItem] = useState(null);

  useEffect(() => {
    localStorage.setItem("labFullscreen", isFullscreen);
  }, [isFullscreen]);

  useEffect(() => {
    localStorage.setItem("labViewMode", viewMode);
  }, [viewMode]);

  const latestLabEvent = useSocketStore(state => state.latestLabEvent);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/lab/visit/${visitId}`, { headers: { Authorization: `Bearer ${token}` } });
      setData(await res.json());
    } catch {
      toast.error("فشل تحميل التفاصيل");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [visitId, token]);

  useEffect(() => { load(false); }, [load]);

  useEffect(() => {
    if (latestLabEvent?.id) {
      if (!latestLabEvent.visitId || latestLabEvent.visitId === visitId) {
        load(true);
      }
    }
  }, [latestLabEvent?.id, latestLabEvent?.visitId, visitId, load]);

  const handleFinishPatient = async () => {
    setCompleting(true);
    try {
      const res = await fetch(`/api/lab/visit/${visitId}/complete`, { method: "PUT", headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (res.ok) {
        toast.success(d.message);
        if (onCompleted) onCompleted();
        onClose();
        return;
      } else toast.error(d.message);
    } catch {
      toast.error("تعذر الاتصال");
    } finally {
      setCompleting(false);
    }
  };

  const handleStartIndividualRequest = async (requestId) => {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        requests: prev.requests.map(r => r.id === requestId ? { ...r, status: 'in_progress' } : r)
      };
    });
    
    try {
      const res = await fetch(`/api/lab/request/${requestId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "in_progress" }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success("تم استلام العينة وبدء الفحص");
        const socket = getSocket();
        if (socket) socket.emit("lab:update", { visitId });
        load(true);
        if (onCompleted) onCompleted();
      } else {
        toast.error(d.message);
        load(true);
      }
    } catch {
      toast.error("فشل التنفيذ");
      load(true);
    }
  };

  const handleDeliverRequest = async (requestId) => {
    try {
      const res = await fetch(`/api/lab/request/${requestId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'completed' }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success('تم تسليم النتيجة بنجاح');
        const socket = getSocket();
        if (socket) socket.emit('lab:update', { visitId });
        load(true);
        if (onCompleted) onCompleted();
      } else toast.error(d.message);
    } catch {
      toast.error('فشل التنفيذ');
    }
  };

  const requests = useMemo(() => data?.requests || [], [data?.requests]);
  
  const workspaceRequests = useMemo(() => {
    let list = [...requests];
    if (isArchive) {
      // In archive/reports mode: show all requests without exclusion
    } else if (isPendingTab) {
      list = list.filter(r => r.status === "paid");
    } else if (isCompletedTab) {
      list = list.filter(r => r.status === "completed");
    } else {
      list = list.filter(r => r.status === "in_progress" || r.status === "result_uploaded");
    }

    return list.sort((a, b) => {
      if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
      if (a.status !== 'in_progress' && b.status === 'in_progress') return 1;
      if (a.status === 'paid' && b.status !== 'paid') return -1;
      if (a.status !== 'paid' && b.status === 'paid') return 1;
      return a.id - b.id;
    });
  }, [requests, isPendingTab, isCompletedTab, isArchive]);

  const { isAllDone } = useMemo(() => ({
    isAllDone: workspaceRequests.length > 0 && workspaceRequests.every((r) => r.status === "completed" || r.status === "result_uploaded"),
  }), [workspaceRequests]);

  const pendingLabCount = useMemo(() => {
    return requests.filter(r => r.status === 'paid' || r.status === 'in_progress' || r.status === 'result_uploaded').length;
  }, [requests]);

  const labResultsList = useMemo(() => {
    const completedOrUploaded = requests.filter(
      r => r.result_file || r.result_notes || r.status === 'completed' || r.status === 'result_uploaded'
    );
    return groupLabsBySharedResult(completedOrUploaded);
  }, [requests]);

  const labViewerInitialIndex = useMemo(() => {
    if (!viewResultItem || labResultsList.length === 0) return 0;
    const foundIdx = labResultsList.findIndex(g => 
      String(g.id) === String(viewResultItem.id) ||
      (Array.isArray(g.items) && g.items.some(item => String(item.id) === String(viewResultItem.id))) ||
      g.name === viewResultItem.name
    );
    return foundIdx >= 0 ? foundIdx : 0;
  }, [viewResultItem, labResultsList]);

  // خريطة شارات الفحوصات المشتركة للتمييز الذكي بين مجموعات النتائج
  const sharedBadgeMap = useMemo(() => {
    const map = new Map();
    const sharedGroups = labResultsList.filter(g => g.isShared);
    if (sharedGroups.length === 0) return map;

    const isMultiGroup = sharedGroups.length > 1;

    const groupThemes = [
      {
        badgeClass: 'bg-purple-50 text-purple-700 border-purple-200/80 hover:bg-purple-100/70',
        dotClass: 'bg-purple-500',
        label: isMultiGroup ? 'مشترك' : 'نتيجة مشتركة'
      },
      {
        badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200/80 hover:bg-indigo-100/70',
        dotClass: 'bg-indigo-500',
        label: isMultiGroup ? 'مشترك' : 'نتيجة مشتركة'
      },
      {
        badgeClass: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200/80 hover:bg-fuchsia-100/70',
        dotClass: 'bg-fuchsia-500',
        label: isMultiGroup ? 'مشترك' : 'نتيجة مشتركة'
      },
      {
        badgeClass: 'bg-teal-50 text-teal-700 border-teal-200/80 hover:bg-teal-100/70',
        dotClass: 'bg-teal-500',
        label: isMultiGroup ? 'مشترك' : 'نتيجة مشتركة'
      }
    ];

    sharedGroups.forEach((group, grpIdx) => {
      const theme = groupThemes[grpIdx % groupThemes.length];
      const groupItems = group.items || [];

      groupItems.forEach(item => {
        const partnerNames = groupItems
          .filter(other => String(other.id) !== String(item.id))
          .map(other => other.name || other.test_name)
          .filter(Boolean);

        const partnerText = partnerNames.length > 0
          ? partnerNames.join('، ')
          : (item.name || 'فحص آخر');

        const tooltip = `نتيجة مشتركة مع: (${partnerText})`;

        map.set(String(item.id), {
          label: theme.label,
          tooltip,
          badgeClass: theme.badgeClass,
          dotClass: theme.dotClass,
          groupIndex: grpIdx,
          isMultiGroup,
          partnerNames
        });
      });
    });

    return map;
  }, [labResultsList]);

  const handleUploadClose = useCallback(() => setUploadingItem(null), []);
  const handleUploaded = useCallback(() => {
    setUploadingItem(null);
    load(true);
    if (onCompleted) onCompleted();
  }, [load, onCompleted]);

  const visit = data?.visit;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
      <div className="absolute inset-0" onClick={onClose} />

      <div className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/60 ${isFullscreen ? 'w-[98vw] h-[98vh] rounded-[2.5rem]' : 'w-full max-w-5xl h-full max-h-[90vh] rounded-[2rem]'}`}>
        
        {/* ── Top Control Bar (Violet/Purple Lab Theme - Matching Secretary HistoricEMR) ── */}
        <div className={`${isFullscreen ? 'px-6 sm:px-8 py-3' : 'px-5 py-2.5'} flex items-center justify-between flex-shrink-0 shadow-md text-white transition-colors duration-300 bg-gradient-to-r from-violet-700 via-purple-700 to-violet-800 z-30`}>
          <div className="flex items-center gap-2">
            <FlaskConical size={isFullscreen ? 18 : 16} />
            <span className={`${isFullscreen ? 'text-xs sm:text-sm' : 'text-xs'} font-black tracking-wide drop-shadow-sm`}>
              {isArchive ? 'أرشيف التحاليل المخبرية للمريض' : 'التحاليل المخبرية للمريض'} ({visit?.full_name || '...'})
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Pending Tests Counter Badge: Matching Secretary HistoricEMR with animate-spin icon */}
            {pendingLabCount > 0 && (
              <div
                className={`${isFullscreen ? 'h-8 px-3.5 text-xs sm:text-sm' : 'h-7 px-2.5 text-xs'} flex items-center gap-1.5 bg-white/20 text-white rounded-lg font-black shadow-sm select-none`}
                title={formatArabicPendingLabTitle(pendingLabCount)}
              >
                <Clock size={isFullscreen ? 14 : 13} strokeWidth={2.2} className="text-white animate-spin" />
                <span>{formatArabicPendingLabBadge(pendingLabCount)}</span>
              </div>
            )}

            {/* View Switcher: Icons only beside control buttons */}
            <div className="flex bg-black/15 p-0.5 rounded-lg border border-white/20">
              <button 
                onClick={() => setViewMode("list")} 
                className={`${isFullscreen ? 'w-7 h-7' : 'w-6 h-6'} flex items-center justify-center rounded-md transition-all cursor-pointer ${viewMode === "list" ? "bg-white text-violet-700 shadow-sm" : "text-white/70 hover:text-white"}`}
                title="عرض كقائمة"
              >
                <List size={isFullscreen ? 15 : 13} />
              </button>
              <button 
                onClick={() => setViewMode("grid")} 
                className={`${isFullscreen ? 'w-7 h-7' : 'w-6 h-6'} flex items-center justify-center rounded-md transition-all cursor-pointer ${viewMode === "grid" ? "bg-white text-violet-700 shadow-sm" : "text-white/70 hover:text-white"}`}
                title="عرض كشبكة"
              >
                <LayoutGrid size={isFullscreen ? 15 : 13} />
              </button>
            </div>

            <div className="w-px h-4 bg-white/25 mx-0.5" />

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

        {/* ── Modal Header: Personal Info (Secretary HistoricEMR Style, NO PHONE) ── */}
        <div className={`bg-white ${isFullscreen ? 'px-6 sm:px-8 py-3.5 sm:py-4' : 'px-5 sm:px-6 py-3.5'} flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-100 shrink-0 z-20`}>
          {/* Right: Avatar + Name + Surgery Badge + Chips */}
          <div className={`flex items-center ${isFullscreen ? 'gap-3.5 sm:gap-4' : 'gap-3 sm:gap-3.5'}`}>
            <div className={`${isFullscreen ? 'w-12 h-12 sm:w-13 sm:h-13 rounded-xl' : 'w-11 h-11 sm:w-12 sm:h-12 rounded-xl'} bg-gradient-to-br from-violet-50 to-purple-100 flex items-center justify-center text-violet-700 shadow-inner border border-violet-100/60 shrink-0`}>
              <User size={isFullscreen ? 22 : 20} strokeWidth={1.8} className="sm:hidden" />
              <User size={isFullscreen ? 24 : 22} strokeWidth={1.8} className="hidden sm:block" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center flex-wrap gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-800 tracking-tight leading-none">
                  {visit?.full_name || (loading ? "جاري التحميل..." : "—")}
                </h2>
                {Boolean(visit?.is_surgery) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/70 text-purple-700 border border-purple-200/60 shadow-2xs select-none">
                    <Scissors size={11} className="text-purple-600 shrink-0" />
                    <span>عمليات</span>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-0.5">
                <span className="flex items-center gap-1 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md font-black text-slate-500 bg-slate-100/80 border border-slate-200/60" dir="ltr">
                  <User size={11}/> {visit?.patient_id || visit?.id || '...'}
                </span>
                {(visit?.gender || visit?.age) && (
                  <span className="flex items-center gap-1 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md font-black text-slate-600 bg-slate-100/80 border border-slate-200/60">
                    {visit?.gender ? (visit.gender === 'male' || visit.gender === 'ذكر' ? 'ذكر' : 'أنثى') : ''}
                    {visit?.gender && visit?.age ? ' — ' : ''}
                    {visit?.age ? `${visit.age} سنة` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Left: Date & Time in English format & Visit Number */}
          <div className={`flex flex-col items-start md:items-end ${isFullscreen ? 'gap-1.5' : 'gap-1'} self-stretch md:self-auto`}>
            <div className={`flex items-center gap-1.5 text-slate-500 font-bold ${isFullscreen ? 'text-xs sm:text-sm' : 'text-xs'}`}>
              <Calendar size={isFullscreen ? 15 : 13} className="text-violet-600 opacity-80" />
              <span dir="ltr">{formatDateEn(visit?.created_at || Date.now())}</span>
              <span className="text-slate-300 mx-0.5">•</span>
              <span dir="ltr">{formatTimeEn(visit?.created_at || Date.now())}</span>
            </div>
            
            <div className={`flex items-center gap-1 ${isFullscreen ? 'text-xs font-black' : 'text-[10px] sm:text-[11px] font-black'} text-slate-400`}>
              <span>معرف الزيارة:</span>
              <span className="text-slate-700 font-bold" dir="ltr">{visit?.visit_number || visit?.visit_id || visit?.id || '—'}</span>
            </div>
          </div>
        </div>

        {/* ── Optional Alerts: Allergies & Chronic Diseases ── */}
        {(visit?.allergies || visit?.chronic_diseases) && (
          <div className="px-6 py-2.5 bg-slate-50/80 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2.5 shrink-0">
            {visit?.allergies && (
              <div className="bg-rose-50/80 border border-rose-100 rounded-xl px-3 py-2 flex items-center gap-2.5 shadow-2xs">
                <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertCircle size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-black text-rose-800 block">الحساسية</span>
                  <p className="text-xs font-bold text-rose-700 truncate">{visit.allergies}</p>
                </div>
              </div>
            )}
            {visit?.chronic_diseases && (
              <div className="bg-amber-50/80 border border-amber-100 rounded-xl px-3 py-2 flex items-center gap-2.5 shadow-2xs">
                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <Activity size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-black text-amber-800 block">الأمراض المزمنة</span>
                  <p className="text-xs font-bold text-amber-700 truncate">{visit.chronic_diseases}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Body: Requests List / Grid Workspace ── */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar bg-slate-50/40">
          {loading ? (
            <div className="p-12 w-full h-full flex items-center justify-center">
              <div className="animate-spin w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full"></div>
            </div>
          ) : workspaceRequests.length === 0 ? (
            <div className="w-full h-full min-h-[220px] flex flex-col items-center justify-center text-slate-400">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                <FlaskConical size={28} className="text-slate-300" />
              </div>
              <p className="font-black text-sm text-slate-500">لا توجد تحاليل في هذا القسم</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* ── Floating Header directly above the table/cards (Matching HistoricEMRModal) ── */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-violet-100/80 rounded-lg text-violet-700 shadow-sm">
                    <FlaskConical size={16} />
                  </div>
                  <h3 className="text-sm font-black text-slate-700">مساحة عمل التحاليل المخبرية</h3>
                  <span className="text-xs px-2.5 py-0.5 font-black bg-violet-50 text-violet-700 rounded-full border border-violet-200/60">
                    {workspaceRequests.length}
                  </span>
                </div>

                {!isArchive && isPendingTab && workspaceRequests.length > 0 && (
                  <button 
                    onClick={async () => {
                      if (onStartAll) {
                        await onStartAll(visitId);
                        onClose();
                      }
                    }}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white px-3.5 py-1.5 rounded-xl font-black text-xs shadow-xs hover:shadow-sm active:scale-95 transition-all cursor-pointer"
                    title="بدء جميع التحاليل لهذه الزيارة"
                  >
                    <CheckCircle size={14} strokeWidth={2.2} />
                    <span>بدء جميع التحاليل</span>
                  </button>
                )}
              </div>

              {viewMode === "list" ? (
                /* ── List Mode: Proportional Layout (100% Total) ── */
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-right text-sm whitespace-nowrap table-fixed">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th style={{ width: '5%' }} className="px-2 py-3.5 text-xs font-bold text-slate-500 text-center">#</th>
                          <th style={{ width: '37%' }} className="px-4 py-3.5 text-xs font-bold text-slate-500 text-right">اسم التحليل</th>
                          <th style={{ width: '20%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-right">القسم</th>
                          <th style={{ width: '15%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">الحالة</th>
                          <th style={{ width: '13%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">التاريخ والوقت</th>
                          <th style={{ width: '10%' }} className="px-2 py-3.5 text-xs font-bold text-slate-500 text-center">{isArchive ? 'النتائج' : 'الإجراء'}</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {workspaceRequests.map((req, idx) => {
                          const isCompleted = req.status === "completed";
                          const isInProgress = req.status === "in_progress";
                          const isResultUploaded = req.status === "result_uploaded";
                          const isPending = req.status === "paid";
                          const itemDate = (isCompletedTab || isCompleted || isResultUploaded)
                            ? (req.performed_at || req.requested_at || visit?.created_at)
                            : (req.requested_at || visit?.created_at);
                          const sharedBadge = sharedBadgeMap.get(String(req.id));

                          return (
                            <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                              {/* 1. الترقيم (5%) */}
                              <td style={{ width: '5%' }} className="px-2 py-3 text-xs font-black text-slate-400 text-center align-middle">
                                {idx + 1}
                              </td>
                              
                              {/* 2. اسم التحليل (37%) مع شارة الفحص المشترك والتلميح الذكي */}
                              <td style={{ width: '37%' }} className="px-4 py-3 align-middle">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-bold text-slate-800 text-sm truncate" title={req.name}>
                                    {req.name}
                                  </span>
                                  {sharedBadge && (
                                    <span
                                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border shadow-2xs shrink-0 select-none cursor-default transition-all ${sharedBadge.badgeClass}`}
                                      title={sharedBadge.tooltip}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sharedBadge.dotClass}`} />
                                      <span>{sharedBadge.label}</span>
                                    </span>
                                  )}
                                </div>
                              </td>
                              
                              {/* 3. القسم (20%) - عادي بدون إطار وبخط أنيق */}
                              <td style={{ width: '20%' }} className="px-3 py-3 text-right align-middle text-xs font-semibold text-slate-600 truncate">
                                {req.category_name || 'تحاليل عامة'}
                              </td>
                              
                              {/* 4. الحالة (15%) - نصوص محدثة بدقة مع نقطة ملونة */}
                              <td style={{ width: '15%' }} className="px-3 py-3 text-center align-middle">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full font-bold border shadow-2xs whitespace-nowrap ${
                                  isCompleted 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70' 
                                    : isResultUploaded 
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200/70' 
                                    : isInProgress 
                                    ? 'bg-teal-50 text-teal-700 border-teal-200/70' 
                                    : 'bg-purple-50 text-purple-700 border-purple-200/70'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    isCompleted 
                                      ? 'bg-emerald-500' 
                                      : isResultUploaded 
                                      ? 'bg-indigo-500' 
                                      : isInProgress 
                                      ? 'bg-teal-500 animate-pulse' 
                                      : 'bg-purple-500 animate-pulse'
                                  }`} />
                                  <span>
                                    {isCompleted ? 'تم التنفيذ' : isResultUploaded ? 'نتيجة محفوظة' : isInProgress ? 'قيد التنفيذ' : 'في انتظار التنفيذ'}
                                  </span>
                                </span>
                              </td>
                              
                              {/* 5. التاريخ والوقت (13%) - سطرين بدون أيقونة */}
                              <td style={{ width: '13%' }} className="px-3 py-3 text-center align-middle">
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
                              
                              {/* 6. الإجراء / النتائج (10%) */}
                              <td style={{ width: '10%' }} className="px-2 py-3 text-center align-middle">
                                <div className="flex items-center justify-center gap-1">
                                  {isArchive ? (
                                    (isCompleted || isResultUploaded || req.result_notes || req.result_file) ? (
                                      <button 
                                        onClick={() => setViewResultItem(req)}
                                        className="w-7 h-7 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/70 shadow-2xs flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                                        title="عرض النتيجة والتفاصيل"
                                      >
                                        <FileText size={13} />
                                      </button>
                                    ) : (
                                      <span className="text-slate-300 font-bold text-xs" title="لا توجد نتيجة مسجلة بعد">—</span>
                                    )
                                  ) : (
                                    <>
                                      {isPending && (
                                        <button 
                                          onClick={() => handleStartIndividualRequest(req.id)}
                                          className="w-7 h-7 rounded-lg text-white bg-violet-600 hover:bg-violet-700 shadow-2xs flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                                          title="استلام وبدء التحليل"
                                        >
                                          <Activity size={13} />
                                        </button>
                                      )}
                                      
                                      {isInProgress && (
                                        <button 
                                          onClick={() => setUploadingItem(req)}
                                          className="w-7 h-7 rounded-lg text-white bg-violet-600 hover:bg-violet-700 shadow-2xs flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                                          title="إدخال النتيجة"
                                        >
                                          <UploadCloud size={13} />
                                        </button>
                                      )}
                                      
                                      {isResultUploaded && (
                                        <>
                                          <button 
                                            onClick={() => setUploadingItem(req)}
                                            className="w-7 h-7 rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/70 shadow-2xs flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                                            title="تعديل النتيجة"
                                          >
                                            <Edit size={12} />
                                          </button>
                                          <button 
                                            onClick={() => handleDeliverRequest(req.id)}
                                            className="w-7 h-7 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 shadow-2xs flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                                            title="تسليم واعتماد النتيجة"
                                          >
                                            <CheckCircle size={12} />
                                          </button>
                                          <button 
                                            onClick={() => setViewResultItem(req)}
                                            className="w-7 h-7 rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 shadow-2xs flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                                            title="معاينة النتيجة"
                                          >
                                            <Eye size={12} />
                                          </button>
                                        </>
                                      )}
                                      
                                      {isCompleted && (
                                        <>
                                          <button 
                                            onClick={() => setViewResultItem(req)}
                                            className="w-7 h-7 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/70 shadow-2xs flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                                            title="عرض النتيجة والتفاصيل"
                                          >
                                            <FileText size={12} />
                                          </button>
                                          <button 
                                            onClick={() => setUploadingItem(req)}
                                            className="w-7 h-7 rounded-lg text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 shadow-2xs flex items-center justify-center active:scale-95 cursor-pointer"
                                            title="تعديل النتيجة"
                                          >
                                            <Edit size={12} />
                                          </button>
                                        </>
                                      )}
                                    </>
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
              ) : (
                /* ── Grid Mode: Matching Patient Cards in SecretaryDashboard ── */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {workspaceRequests.map((req, idx) => {
                    const isCompleted = req.status === "completed";
                    const isInProgress = req.status === "in_progress";
                    const isResultUploaded = req.status === "result_uploaded";
                    const isPending = req.status === "paid";
                    const itemDate = (isCompletedTab || isCompleted || isResultUploaded)
                      ? (req.performed_at || req.requested_at || visit?.created_at)
                      : (req.requested_at || visit?.created_at);
                    const sharedBadge = sharedBadgeMap.get(String(req.id));

                    return (
                      <div 
                        key={req.id} 
                        className="bg-white rounded-3xl border border-slate-100/90 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg flex flex-col justify-between p-5 select-none shadow-[0_4px_20px_rgb(0,0,0,0.03)] group"
                        dir="rtl"
                      >
                        {/* Top: Letter Avatar + Test Name + Shared Badge + Department + Index Counter */}
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className={`w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center font-black text-base transition-transform group-hover:scale-105 shadow-xs ${
                              isCompleted ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                              isResultUploaded ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                              isInProgress ? 'bg-teal-50 text-teal-700 border border-teal-100' :
                              'bg-purple-50 text-purple-700 border border-purple-100'
                            }`}>
                              {req.name?.charAt(0) || 'ت'}
                            </div>
                            <div className="min-w-0 flex-1 text-right">
                              <h4 className="font-black text-slate-800 text-sm leading-tight group-hover:text-violet-700 transition-colors truncate" title={req.name}>
                                {req.name}
                              </h4>
                              <p className="text-xs font-semibold text-slate-500 mt-1">
                                {req.category_name || 'تحاليل عامة'}
                              </p>
                            </div>
                          </div>

                          {/* Index Counter Badge */}
                          <span className="text-xs font-black text-slate-400 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100 flex-shrink-0">
                            {idx + 1}
                          </span>
                        </div>

                        {/* Middle: Date/Time + Status Badge & Shared Badge */}
                        <div className="flex items-center justify-between pt-3.5 mt-3.5 border-t border-slate-100/80 gap-2">
                          <div className="flex flex-col text-right" dir="ltr">
                            <span className="text-xs font-bold text-slate-700">
                              {itemDate ? new Date(itemDate).toLocaleDateString('en-GB') : '—'}
                            </span>
                            {itemDate && (
                              <span className="text-[10px] font-bold text-slate-400">
                                {new Date(itemDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-1.5">
                            {sharedBadge && (
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border shadow-2xs shrink-0 select-none cursor-default transition-all ${sharedBadge.badgeClass}`}
                                title={sharedBadge.tooltip}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sharedBadge.dotClass}`} />
                                <span>{sharedBadge.label}</span>
                              </span>
                            )}
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full font-bold border shadow-2xs whitespace-nowrap ${
                              isCompleted ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70' :
                              isResultUploaded ? 'bg-indigo-50 text-indigo-700 border-indigo-200/70' :
                              isInProgress ? 'bg-teal-50 text-teal-700 border-teal-200/70' :
                              'bg-purple-50 text-purple-700 border-purple-200/70'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                isCompleted ? 'bg-emerald-500' :
                                isResultUploaded ? 'bg-indigo-500' :
                                isInProgress ? 'bg-teal-500 animate-pulse' :
                                'bg-purple-500 animate-pulse'
                              }`} />
                              <span>
                                {isCompleted ? 'تم التنفيذ' : isResultUploaded ? 'نتيجة محفوظة' : isInProgress ? 'قيد التنفيذ' : 'في انتظار التنفيذ'}
                              </span>
                            </span>
                          </div>
                        </div>

                        {/* Bottom: Action Buttons */}
                        <div className="mt-3.5 pt-3 border-t border-slate-100">
                          {isArchive ? (
                            (isCompleted || isResultUploaded || req.result_notes || req.result_file) ? (
                              <button 
                                onClick={() => setViewResultItem(req)}
                                className="w-full py-2 px-3 rounded-xl text-xs font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/70 transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shadow-2xs"
                              >
                                <FileText size={13} />
                                <span>عرض النتيجة</span>
                              </button>
                            ) : (
                              <div className="text-center py-1.5 text-slate-400 text-xs font-bold bg-slate-50 rounded-xl border border-slate-100">
                                بانتظار إدخال النتيجة
                              </div>
                            )
                          ) : (
                            <>
                              {isPending && (
                                <button 
                                  onClick={() => handleStartIndividualRequest(req.id)}
                                  className="w-full py-2 px-4 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 transition-all shadow-xs flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                                >
                                  <Activity size={14} />
                                  <span>استلام وبدء التحليل</span>
                                </button>
                              )}

                              {isInProgress && (
                                <button 
                                  onClick={() => setUploadingItem(req)}
                                  className="w-full py-2 px-4 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 transition-all shadow-xs flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                                >
                                  <UploadCloud size={14} />
                                  <span>إدخال النتيجة</span>
                                </button>
                              )}

                              {isResultUploaded && (
                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => setUploadingItem(req)}
                                    className="flex-1 py-1.5 px-2.5 rounded-xl text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/70 transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                                  >
                                    <Edit size={13} />
                                    <span>تعديل</span>
                                  </button>
                                  <button 
                                    onClick={() => handleDeliverRequest(req.id)}
                                    className="flex-1 py-1.5 px-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer shadow-xs"
                                  >
                                    <CheckCircle size={13} />
                                    <span>تسليم</span>
                                  </button>
                                  <button 
                                    onClick={() => setViewResultItem(req)}
                                    className="w-8 h-8 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all flex items-center justify-center active:scale-95 cursor-pointer shrink-0"
                                    title="معاينة"
                                  >
                                    <Eye size={14} />
                                  </button>
                                </div>
                              )}

                              {isCompleted && (
                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => setViewResultItem(req)}
                                    className="flex-1 py-1.5 px-2.5 rounded-xl text-xs font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/70 transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                                  >
                                    <FileText size={13} />
                                    <span>عرض النتيجة</span>
                                  </button>
                                  <button 
                                    onClick={() => setUploadingItem(req)}
                                    className="py-1.5 px-2.5 rounded-xl text-xs font-black text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                                    title="تعديل النتيجة"
                                  >
                                    <Edit size={13} />
                                    <span>تعديل</span>
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Floating Action Footer ── */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-100 flex justify-between items-center z-20 flex-shrink-0">
          <div className="text-xs font-bold text-slate-400 hidden sm:block flex-1">
            {isArchive ? (
              <span className="flex items-center gap-2 text-violet-600">
                <FlaskConical size={15}/> أرشيف الزيارة — استعراض وتدقيق كافة التحاليل والنتائج المرفقة.
              </span>
            ) : isPendingTab ? (
              <span className="flex items-center gap-2 text-indigo-600"><AlertCircle size={15}/> ابدأ جميع التحاليل لبدء العمل على عينات المريض.</span>
            ) : isCompletedTab ? (
              <span className="flex items-center gap-2 text-emerald-600"><CheckCircle size={15}/> هذه الزيارة مكتملة. يمكنك تعديل النتائج إذا لزم الأمر.</span>
            ) : isAllDone ? (
              <span className="flex items-center gap-2 text-emerald-600"><CheckCircle size={15}/> تم تسليم جميع النتائج. يمكنك الآن إنهاء الزيارة لإشعار الطبيب.</span>
            ) : (
              <span className="flex items-center gap-2 text-violet-600"><AlertCircle size={15}/> يجب إكمال واعتماد نتائج جميع التحاليل قبل إنهاء الزيارة.</span>
            )}
          </div>
          
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button 
              onClick={onClose} 
              className="flex-1 sm:flex-none bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 font-black py-2 px-5 rounded-xl transition-all active:scale-95 cursor-pointer text-xs sm:text-sm"
            >
              إغلاق
            </button>
            
            {!isArchive && !isCompletedTab && !isPendingTab && (
              <button 
                onClick={handleFinishPatient} 
                disabled={!isAllDone || completing} 
                className={`flex-1 sm:flex-none font-black py-2 px-6 rounded-xl transition-all flex items-center justify-center gap-2 text-xs sm:text-sm active:scale-95 cursor-pointer ${
                  isAllDone 
                    ? "bg-slate-800 hover:bg-slate-900 text-white shadow-md shadow-slate-800/20" 
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}
              >
                {completing ? <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full inline-block" /> : <CheckCircle size={15} />}
                <span>إنهاء وتسليم الملف</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {uploadingItem && (
        <LabUploadResultModal
          closeOnBackdropClick={false}
          isEditMode={uploadingItem.status === 'result_uploaded' || uploadingItem.status === 'completed'}
          endpoint={`/api/lab/request/${uploadingItem.id}/result`}
          bulkEndpoint={`/api/lab/visit/${visitId}/bulk-result`}
          visitId={visitId}
          allVisitTests={requests}
          uploadingItem={uploadingItem}
          initialNotes={uploadingItem.result_notes || ""}
          initialFiles={uploadingItem.result_file || null}
          token={token}
          onClose={handleUploadClose}
          onUploaded={handleUploaded}
        />
      )}
      {viewResultItem && (
        <ClinicalResultViewerModal 
          isOpen={Boolean(viewResultItem)}
          results={labResultsList.length > 0 ? labResultsList : groupLabsBySharedResult([{ ...viewResultItem, categoryKey: 'lab' }])}
          initialIndex={labViewerInitialIndex}
          patientName={data?.patient?.name || data?.patient_name || data?.full_name || ''}
          visitNumber={data?.patient?.visit_number || visitId}
          theme="lab"
          onClose={() => setViewResultItem(null)} 
        />
      )}
    </div>,
    document.body
  );
};

