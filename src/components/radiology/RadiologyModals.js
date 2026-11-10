import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  X,
  UploadCloud,
  Eye,
  Trash2,
  CheckCircle,
  Minimize2,
  Maximize2,
  Check,
  LayoutGrid,
  List,
  Plus,
  Film,
  Image as ImageIcon,
  Edit,
  Radiation,
  Calendar,
  Activity,
  CheckSquare,
  AlertCircle,
  ExternalLink,
  Clock,
  User,
  Scissors,
  Monitor,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { toast } from "react-toastify";
import { getSocket } from "../../utils/socket";
import MedicalImageViewer from "../common/MedicalImageViewer";
import ClinicalResultViewerModal from "../common/ClinicalResultViewerModal";
import { getBalancedRadiologyRows } from "../../utils/emrHelpers";
import { getServerBaseUrl } from "../../utils/apiConfig";
import {
  formatArabicPendingScansBadge,
  formatArabicPendingScansTitle
} from "../../utils/arabicFormatters";

// ── English Date & Time Helpers ──────────────────────────────────────
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

// ── Resolves any file object to a usable URL for <iframe> and <img> via LAN Server Gateway ──
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
const SharedResultPreviewModal = ({ file, onClose }) => {
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  if (!file) return null;

  const previewUrl = resolveFileUrl(file);

  return (
    <div className="fixed inset-0 z-[100020] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300" dir="rtl">
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
          ) : (file.type === "application/pdf" || ((file.base64 && file.base64.startsWith("data:application/pdf")) || (file.url && file.url.endsWith(".pdf")))) ? (
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


// ── Radiology Result Details Modal ──────────────────────────────────────
const RadiologyResultDetailsModal = ({ request, onClose }) => {
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
    <div className="fixed inset-0 z-[100015] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] w-full max-w-4xl h-auto max-h-[85vh] rounded-[2.5rem] border border-white/60">
        
        <div className="px-6 py-5 flex items-center justify-between bg-white border-b border-slate-100 z-20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center shadow-sm border border-blue-100">
              <CheckCircle size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800">التقرير الإشعاعي والنتائج</h2>
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
              <FileText size={18} className="text-blue-500" />
              الملاحظات والنتائج النصية
            </label>
            <div className="w-full h-auto bg-white border-2 border-slate-100 rounded-2xl p-5 text-slate-700 font-semibold leading-loose shadow-sm text-[14px]">
              {request.result_notes ? (
                <div className="whitespace-pre-wrap break-words">{request.result_notes}</div>
              ) : (
                <div className="py-6 flex items-center justify-center text-slate-400 italic">لا توجد ملاحظات نصية مسجلة.</div>
              )}
            </div>
          </div>
          
          <div className="w-full flex flex-col gap-3">
            <label className="text-base font-black text-slate-700 flex items-center gap-2">
              <UploadCloud size={18} className="text-blue-500" />
              الصور والمرفقات الرقمية
            </label>
            <div className="flex flex-col gap-3">
              {files.length === 0 && (
                <div className="w-full min-h-[120px] bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 font-bold">
                  لا توجد صور أو مرفقات
                </div>
              )}
              {files.map((file, idx) => (
                <div key={idx} className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group" onClick={() => setPreviewFile(file)}>
                  <div className="flex items-center gap-5 overflow-hidden">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden group-hover:bg-blue-50 transition-colors">
                      {(file.type && file.type.startsWith("image/")) || (file.base64 && file.base64.startsWith("data:image/")) || (file.url && (file.url.endsWith(".jpg") || file.url.endsWith(".png") || file.url.endsWith(".jpeg") || file.url.endsWith(".webp"))) ? (
                        <img src={resolveFileUrl(file)} alt="preview" className="w-full h-full object-cover" />
                      ) : (
                        <FileText size={22} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                      )}
                    </div>
                    <span className="text-sm font-bold text-slate-700 break-all line-clamp-2 group-hover:text-blue-700 transition-colors leading-snug">{file.name || 'ملف مرفق'}</span>
                  </div>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-blue-600 group-hover:bg-blue-100 transition-colors">
                    <Eye size={22} />
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

// ── Upload Result Modal ───────────────────────────────────────────
const UploadResultModal = ({ 
  isEditMode, 
  endpoint, 
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
  const [previewFile, setPreviewFile] = useState(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

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

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }, // NO Content-Type header — let browser set multipart boundary
        body: formData,
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "فشل الحفظ");

      toast.success("تم حفظ النتيجة بنجاح");
      onUploaded();
    } catch (err) {
      toast.error("حدث خطأ أثناء حفظ النتيجة");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100010] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
      {/* Background Overlay: closeOnBackdropClick is disabled so clicking outside does not close */}
      <div className="absolute inset-0" onClick={closeOnBackdropClick ? onClose : undefined} />
      <div className="relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] w-full max-w-2xl sm:max-w-3xl h-auto max-h-[90vh] rounded-[2rem] sm:rounded-[2.5rem] border border-white/60">
        
        {/* Header */}
        <div className="px-6 py-4 sm:py-5 flex items-center justify-between bg-white border-b border-slate-100 z-20 flex-shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black shadow-inner border border-blue-100/80">
              <FileText size={22} />
            </div>
            <div>
              <h2 className="font-black text-slate-800 text-base sm:text-lg tracking-tight">
                {isEditMode ? "تعديل النتيجة والتقرير الإشعاعي" : "إرفاق النتيجة والتقرير الإشعاعي"}
              </h2>
              <p className="text-slate-500 font-medium text-xs mt-0.5">
                اكتب التقرير الإشعاعي وارفق صور وملفات النتائج الصادرة عن الأجهزة
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

        {/* ── Scrollable Body: Report Section on Top, File Upload Section Below ── */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 custom-scrollbar bg-slate-50/50 flex flex-col gap-5">
          {/* 1. قسم كتابة التقرير (Top Section) */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <FileText size={14} />
                </div>
                <span>كتابة التقرير الإشعاعي والتشخيص</span>
              </label>
              <span className="text-[11px] font-bold text-slate-400">
                اختياري إذا تم إرفاق ملف أو صور
              </span>
            </div>
            <div className="relative w-full">
              <textarea
                ref={textareaRef}
                autoFocus
                rows={3}
                className="w-full bg-white shadow-2xs rounded-2xl p-4 text-slate-700 font-medium text-xs sm:text-sm leading-relaxed focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border border-slate-200 transition-all resize-none placeholder-slate-300 custom-scrollbar min-h-[95px]"
                placeholder="اكتب التقرير الإشعاعي والتشخيص الطبي هنا..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* 2. قسم إرفاق ملفات النتائج (صور أو PDF) - أسفل قسم كتابة التقارير */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <UploadCloud size={14} />
                </div>
                <span>إرفاق صور وملفات النتائج (صور أو PDF)</span>
              </label>
              {files.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs select-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse shrink-0" />
                  <span className="font-black" dir="ltr">{files.length}</span>
                  <span>{files.length === 1 ? 'ملف مرفق' : files.length === 2 ? 'ملفان مرفقان' : 'ملفات مرفقة'}</span>
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
                  ? "border-blue-500 bg-blue-100/70 scale-[1.01] shadow-md ring-4 ring-blue-400/20" 
                  : "border-slate-200 hover:border-blue-400 bg-white hover:bg-blue-50/40 shadow-2xs hover:shadow-xs"
              }`}
            >
              <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xs ${
                isDragging ? "bg-blue-600 text-white scale-110 shadow-blue-200" : "bg-blue-50 text-blue-600 group-hover:scale-110"
              }`}>
                <UploadCloud size={22} className={isDragging ? "animate-bounce" : ""} />
              </div>
              <div className="text-center">
                <p className={`font-black text-xs sm:text-sm transition-colors ${
                  isDragging ? "text-blue-800 text-sm font-extrabold" : "text-slate-700 group-hover:text-blue-700"
                }`}>
                  {isDragging ? (
                    "أفلت الملفات هنا لرفعها مباشرة"
                  ) : (
                    <>اسحب وأفلت الملفات هنا، أو <span className="text-blue-600 underline underline-offset-2">تصفح جهازك</span></>
                  )}
                </p>
                <p className="font-bold text-slate-400 text-[10px] sm:text-[11px] mt-0.5">
                  يدعم صور أجهزة الأشعة (JPG, PNG) وملفات التقارير (PDF) حتى 15 ميجابايت
                </p>
              </div>
            </div>

            {/* Uploaded Files Grid */}
            {files.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[160px] overflow-y-auto custom-scrollbar p-0.5 mt-1">
                {files.map((file, idx) => {
                  const isImage = (file.type && file.type.startsWith("image/")) || (file.base64 && file.base64.startsWith("data:image/")) || (file.url && (file.url.endsWith(".jpg") || file.url.endsWith(".png") || file.url.endsWith(".jpeg") || file.url.endsWith(".webp")));
                  return (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-all group"
                    >
                      <div 
                        className="flex items-center gap-2.5 overflow-hidden cursor-pointer flex-1 min-w-0" 
                        onClick={() => setPreviewFile(file)}
                        title="انقر للمعاينة"
                      >
                        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-100">
                          {isImage ? (
                            <img src={resolveFileUrl(file)} alt="preview" className="w-full h-full object-cover" />
                          ) : (
                            <FileText size={16} className="text-blue-600" />
                          )}
                        </div>
                        <span className="text-xs font-bold text-slate-700 truncate block flex-1" title={file.name}>
                          {file.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 mr-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setPreviewFile(file); }} 
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer active:scale-95"
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
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Modal Footer ── */}
        <div className="p-4 sm:p-5 bg-white border-t border-slate-100 flex items-center justify-end gap-3 rounded-b-[2rem] sm:rounded-b-[2.5rem] flex-shrink-0">
          <button 
            onClick={onClose} 
            disabled={saving}
            className="px-5 sm:px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          >
            إلغاء
          </button>
          <button 
            onClick={handleSave} 
            disabled={saving || (files.length === 0 && !notes)} 
            className="px-6 sm:px-8 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-blue-600 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/25 transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle size={16} />}
            <span>حفظ واعتماد النتيجة</span>
          </button>
        </div>
      </div>
      {previewFile && <SharedResultPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>,
    document.body
  );
};

// ── Film Grouping Modal ───────────────────────────────────────────
const FilmGroupingModal = ({ visitId, requests, token, onClose, onGrouped, initialFilm, closeOnBackdropClick = false }) => {
  const [filmSize, setFilmSize] = useState(initialFilm ? initialFilm.film_size : "large");
  
  const currentLinkedReqs = initialFilm ? requests.filter(r => r.radiology_film_id === initialFilm.id) : [];
  const [selectedReqs, setSelectedReqs] = useState(currentLinkedReqs.map(r => r.id));
  const [saving, setSaving] = useState(false);

  const unassigned = requests.filter((r) => r.status !== "paid" && r.with_film === 1 && (!r.radiology_film_id || (initialFilm && r.radiology_film_id === initialFilm.id)));
  const maxSlots = filmSize === "large" ? 6 : 2;

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
    <div className="fixed inset-0 z-[100010] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
      {/* Background Overlay: closeOnBackdropClick is disabled so clicking outside does not close */}
      <div className="absolute inset-0" onClick={closeOnBackdropClick ? onClose : undefined} />
      
      <div className="relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] w-full max-w-5xl h-[80vh] rounded-[2.5rem] border border-white/60">
        
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between flex-shrink-0 bg-white border-b border-slate-100 z-20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black shadow-inner border border-blue-100">
              <LayoutGrid size={24} />
            </div>
            <div>
              <h2 className="font-black text-slate-800 text-xl tracking-tight">أستوديو تحضير الأفلام الطبية</h2>
              <p className="text-slate-500 font-medium text-xs mt-1">قم بتحديد حجم الفيلم وتوزيع الدراسات الإشعاعية عليه بدقة.</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-xl transition-all border border-slate-200 cursor-pointer active:scale-95"
            title="إغلاق النافذة"
          >
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
                <div className="h-full flex flex-col items-center justify-center text-blue-600 bg-blue-50/50 rounded-2xl border border-blue-100/50">
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
                        className={`group cursor-pointer flex items-center justify-between p-4 rounded-2xl border-2 transition-all duration-200 ${isSelected ? "border-blue-500 bg-blue-50/30 shadow-sm" : "border-slate-100 bg-white hover:border-blue-200 hover:shadow-sm"}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded flex items-center justify-center border-2 transition-colors ${isSelected ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 bg-slate-50 group-hover:border-blue-300"}`}>
                            {isSelected && <Check size={14} strokeWidth={3} />}
                          </div>
                          <span className={`font-bold text-sm ${isSelected ? "text-blue-900" : "text-slate-700"}`}>
                            {r.name}
                          </span>
                        </div>
                        {!isSelected && (
                           <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-blue-50 text-blue-600 p-1.5 rounded-lg">
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
                  <Film size={16} className="text-blue-500" />
                  محتوى الفيلم الحالي
                </h3>
                <span className="text-xs font-bold text-slate-500 mt-1">
                  عدد الدراسات المدرجة: <span className="text-blue-600 font-black">{selectedReqs.length}</span> / {maxSlots}
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
              <div className="w-full max-w-xs bg-slate-800 rounded-lg p-2 shadow-2xl flex flex-col gap-2 transition-all duration-300 min-h-[280px] h-auto">
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
                <div className={filmSize === "large" ? "flex-1 grid grid-cols-2 gap-2" : "flex-1 flex flex-col gap-2"}>
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
                </div>
                
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
                 تم تحديد <span className="text-blue-600 font-black">{selectedReqs.length}</span> من أصل <span className="text-slate-600 font-black">{maxSlots}</span>
               </div>
               <div className="flex gap-3 w-full sm:w-auto">
                 <button onClick={onClose} className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-slate-500 hover:bg-slate-100 font-black text-sm transition-colors border border-slate-200 bg-white">
                   إلغاء
                 </button>
                 <button onClick={handleSave} disabled={saving || selectedReqs.length === 0} className="flex-1 sm:flex-none px-8 py-2.5 rounded-xl bg-blue-700 text-white font-black text-sm hover:bg-blue-800 transition-all shadow-md shadow-blue-700/20 disabled:opacity-50 disabled:shadow-none">
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

// ── Patient Detail Panel (Centered Modal) ──────────────────────────
const PatientDetailPanel = ({ visitId, token, onClose, onCompleted, onStartAll, activeTab = "completed", readOnly = false }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadingItem, setUploadingItem] = useState(null);
  const [viewResultItem, setViewResultItem] = useState(null);
  const [groupingMode, setGroupingMode] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() => localStorage.getItem("radiologyFullscreen") === "true");
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("radiologyViewMode") || "grid");
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, filmId: null });
  const [isStudioOpen, setIsStudioOpen] = useState(true);

  const isMountedRef = useRef(true);
  const initialWorkspaceLength = useRef(-1);

  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    localStorage.setItem("radiologyFullscreen", isFullscreen);
  }, [isFullscreen]);

  useEffect(() => {
    localStorage.setItem("radiologyViewMode", viewMode);
  }, [viewMode]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/radiology/visit/${visitId}`, { headers: { Authorization: `Bearer ${token}` } });
      setData(await res.json());
    } catch {
      toast.error("فشل تحميل التفاصيل");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [visitId, token]);

  useEffect(() => { load(false); }, [load]);

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
      if (socket) socket.emit("radiology:updated", { visitId });
      load(true);
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
        onCompleted?.();
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
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        requests: prev.requests.map(r => r.id === requestId ? { ...r, status: 'in_progress' } : r)
      };
    });
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
        if (socket) socket.emit("radiology:updated", { visitId });
        load(true);
        onCompleted?.();
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
      const res = await fetch(`/api/radiology/request/${requestId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'completed' }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success('تم تسليم النتيجة بنجاح');
        const socket = getSocket();
        if (socket) socket.emit('radiology:updated', { visitId });
        load(true);
        onCompleted?.();
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
      if (socket) socket.emit('radiology:updated', { visitId });
      load(true);
      onCompleted?.();
    } catch {
      toast.error('فشل التنفيذ');
    }
  };

  const requests = useMemo(() => data?.requests || [], [data?.requests]);
  const films = useMemo(() => data?.films || [], [data?.films]);
  const showStudio = !readOnly && activeTab !== "pending" && films.length > 0 && isStudioOpen;

  // Smart Arabic pluralization for scans counter in film card
  const getScansCountText = (count) => {
    if (count === 1) return "فحص واحد";
    if (count === 2) return "فحصان";
    if (count >= 3 && count <= 10) return `${count} فحوصات`;
    return `${count} فحصاً`;
  };

  // Smart Proportional Column Widths (Exact 100% total, adjusting dynamically based on studio visibility)
  const colWidths = useMemo(() => {
    return showStudio ? {
      num: '5%',
      name: '43%',
      status: '18%',
      date: '17%',
      action: '17%'
    } : {
      num: '4%',
      name: '50%',
      status: '15%',
      date: '15%',
      action: '16%'
    };
  }, [showStudio]);

  const archiveItems = useMemo(() => {
    if (!readOnly) return [];

    const list = requests.filter(r => activeTab === 'completed' ? r.status === 'completed' : true);
    const items = [];
    const processedFilmIds = new Set();
    const processedReqIds = new Set();

    // 1. Group requests by defined films
    films.forEach(film => {
      const filmRequests = list.filter(r => r.radiology_film_id === film.id);
      if (filmRequests.length > 0) {
        processedFilmIds.add(film.id);
        filmRequests.forEach(r => processedReqIds.add(r.id));

        const firstWithResult = filmRequests.find(r => r.result_file || r.result_notes);
        items.push({
          id: `film-${film.id}`,
          filmId: film.id,
          isFilm: true,
          filmSize: film.film_size, // 'large' or 'small'
          requests: filmRequests,
          name: filmRequests.map(r => r.name).join(' + '),
          category_name: filmRequests.map(r => r.category_name).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('، '),
          performed_at: filmRequests[0]?.performed_at || filmRequests[0]?.requested_at || film.created_at,
          result_notes: firstWithResult?.result_notes || null,
          result_file: firstWithResult?.result_file || null,
          hasResult: Boolean(firstWithResult)
        });
      }
    });

    // 2. Fallback: Any requests that have radiology_film_id but film was not in films array
    list.forEach(req => {
      if (req.radiology_film_id && !processedFilmIds.has(req.radiology_film_id)) {
        const siblingReqs = list.filter(r => r.radiology_film_id === req.radiology_film_id);
        siblingReqs.forEach(r => processedReqIds.add(r.id));
        processedFilmIds.add(req.radiology_film_id);

        const firstWithResult = siblingReqs.find(r => r.result_file || r.result_notes);
        items.push({
          id: `film-${req.radiology_film_id}`,
          filmId: req.radiology_film_id,
          isFilm: true,
          filmSize: 'large',
          requests: siblingReqs,
          name: siblingReqs.map(r => r.name).join(' + '),
          category_name: siblingReqs.map(r => r.category_name).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('، '),
          performed_at: siblingReqs[0]?.performed_at || siblingReqs[0]?.requested_at,
          result_notes: firstWithResult?.result_notes || null,
          result_file: firstWithResult?.result_file || null,
          hasResult: Boolean(firstWithResult)
        });
      }
    });

    // 3. Requests without film (digital or unlinked)
    list.forEach(req => {
      if (!processedReqIds.has(req.id)) {
        items.push({
          id: `req-${req.id}`,
          requestId: req.id,
          isFilm: false,
          filmSize: null,
          isDigital: req.with_film !== 1,
          requests: [req],
          name: req.name,
          category_name: req.category_name,
          performed_at: req.performed_at || req.requested_at,
          result_notes: req.result_notes,
          result_file: req.result_file,
          hasResult: Boolean(req.result_notes || req.result_file)
        });
      }
    });

    return items;
  }, [readOnly, requests, films, activeTab]);

  const totalArchiveScans = useMemo(() => {
    return archiveItems.reduce((sum, item) => sum + (item.requests?.length || 1), 0);
  }, [archiveItems]);

  const radiologyResultsList = useMemo(() => {
    if (readOnly) {
      return archiveItems.filter(item => item.hasResult).map(item => ({
        id: item.id,
        filmId: item.filmId,
        requestId: item.requestId,
        name: item.name,
        result_notes: item.result_notes,
        result_file: item.result_file,
        items: item.requests ? item.requests.map(r => r.name) : [item.name],
        categoryKey: 'radiology',
        film_type: item.isFilm ? (item.filmSize === 'large' ? 'كبير' : 'صغير') : 'بدون فيلم',
        date: item.performed_at
      }));
    }

    const list = [];
    const processedReqIds = new Set();
    const processedFilmIds = new Set();

    films.forEach(film => {
      const filmRequests = requests.filter(r => r.radiology_film_id === film.id);
      const withResult = filmRequests.find(r => r.result_file || r.result_notes);
      if (filmRequests.length > 0 && withResult) {
        processedFilmIds.add(film.id);
        filmRequests.forEach(r => processedReqIds.add(r.id));
        list.push({
          id: `film-${film.id}`,
          filmId: film.id,
          name: `فيلم ${film.film_size === 'large' ? 'كبير' : 'صغير'} (${filmRequests.map(r => r.name).join(' + ')})`,
          result_notes: withResult.result_notes,
          result_file: withResult.result_file,
          items: filmRequests.map(r => r.name),
          categoryKey: 'radiology',
          film_type: film.film_size === 'large' ? 'كبير' : 'صغير',
          date: withResult.performed_at || withResult.requested_at || film.created_at
        });
      }
    });

    requests.forEach(req => {
      if (!processedReqIds.has(req.id) && (req.result_file || req.result_notes)) {
        list.push({
          id: `req-${req.id}`,
          requestId: req.id,
          name: req.name,
          result_notes: req.result_notes,
          result_file: req.result_file,
          items: [req.name],
          categoryKey: 'radiology',
          film_type: req.with_film === 1 ? 'فيلم' : 'بدون فيلم',
          date: req.performed_at || req.requested_at
        });
      }
    });

    return list;
  }, [readOnly, archiveItems, films, requests]);

  const viewerInitialIndex = useMemo(() => {
    if (!viewResultItem || radiologyResultsList.length === 0) return 0;
    const foundIdx = radiologyResultsList.findIndex(r => 
      (viewResultItem.id && r.id === viewResultItem.id) ||
      (viewResultItem.filmId && r.filmId === viewResultItem.filmId) ||
      (viewResultItem.requestId && r.requestId === viewResultItem.requestId) ||
      (r.name === viewResultItem.name)
    );
    return foundIdx >= 0 ? foundIdx : 0;
  }, [viewResultItem, radiologyResultsList]);

  const workspaceRequests = useMemo(() => {
    let list = [...requests];
    if (activeTab === "pending") {
      list = list.filter(r => r.status === "paid");
    } else if (activeTab === "in_progress") {
      list = list.filter(r => r.status === "in_progress");
    } else if (activeTab === "completed") {
      list = list.filter(r => r.status === "completed");
    }

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

      return a.id - b.id;
    });
  }, [requests, activeTab]);

  const { unassignedFilmsCount, isAllDone, hasPending } = useMemo(() => ({
    unassignedFilmsCount: requests.filter((r) => r.status === "in_progress" && r.with_film === 1 && !r.radiology_film_id).length,
    isAllDone: requests.length > 0 && requests.every((r) => r.status === "completed"),
    hasPending: requests.some((r) => r.status === "paid")
  }), [requests]);

  const pendingRadCount = useMemo(() => {
    return requests.filter(r => r.status === 'paid' || r.status === 'in_progress').length;
  }, [requests]);

  useEffect(() => {
    if (!loading && data) {
      if (initialWorkspaceLength.current === -1) {
        initialWorkspaceLength.current = workspaceRequests.length;
      }
    }
  }, [loading, data, workspaceRequests.length]);

  useEffect(() => {
    if (!loading && data && initialWorkspaceLength.current > 0 && workspaceRequests.length === 0) {
      toast.info("تم نقل الفحص للتبويب التالي بنجاح");
    }
  }, [loading, data, workspaceRequests.length]);

  const handleUploadClose = useCallback(() => setUploadingItem(null), []);
  const handleUploaded = useCallback(() => {
    setUploadingItem(null);
    load(true);
    onCompleted?.();
  }, [load, onCompleted]);

  const handleGroupingClose = useCallback(() => setGroupingMode(false), []);
  const handleGrouped = useCallback(() => { 
    setGroupingMode(false); 
    setIsStudioOpen(true);
    load(true); 
  }, [load]);

  const visit = data?.visit;

  return createPortal(
    <div className="fixed inset-0 z-[99990] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
      <div className="absolute inset-0" onClick={handleSafeClose} />

      <div className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/60 ${isFullscreen ? 'w-[98vw] h-[98vh] rounded-[2.5rem]' : 'w-full max-w-5xl h-full max-h-[90vh] rounded-[2rem]'}`}>
        
        {/* ── Top Control Bar (Sky/Blue Radiology Theme - Matching Lab & Secretary HistoricEMR) ── */}
        <div className={`${isFullscreen ? 'px-6 sm:px-8 py-3' : 'px-5 py-2.5'} flex items-center justify-between flex-shrink-0 shadow-md text-white transition-colors duration-300 bg-gradient-to-r from-sky-700 via-blue-700 to-sky-800 z-30`}>
          <div className="flex items-center gap-2">
            <Radiation size={isFullscreen ? 18 : 16} />
            <span className={`${isFullscreen ? 'text-xs sm:text-sm' : 'text-xs'} font-black tracking-wide drop-shadow-sm`}>
              {readOnly 
                ? 'أرشيف الفحوصات الإشعاعية للمريض' 
                : 'الفحوصات الإشعاعية للمريض'} ({visit?.full_name || '...'})
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Pending Tests Counter Badge: Matching Lab & Secretary HistoricEMR with animate-spin icon */}
            {!readOnly && pendingRadCount > 0 && (
              <div
                className={`${isFullscreen ? 'h-8 px-3.5 text-xs sm:text-sm' : 'h-7 px-2.5 text-xs'} flex items-center gap-1.5 bg-white/20 text-white rounded-lg font-black shadow-sm select-none`}
                title={formatArabicPendingScansTitle(pendingRadCount)}
              >
                <Clock size={isFullscreen ? 14 : 13} strokeWidth={2.2} className="text-white animate-spin" />
                <span>{formatArabicPendingScansBadge(pendingRadCount)}</span>
              </div>
            )}

            {/* View Switcher: Icons only beside control buttons (Only in active workspace, not in archive) */}
            {!readOnly && (
              <div className="flex bg-black/15 p-0.5 rounded-lg border border-white/20">
                <button 
                  onClick={() => setViewMode("list")} 
                  className={`${isFullscreen ? 'w-7 h-7' : 'w-6 h-6'} flex items-center justify-center rounded-md transition-all cursor-pointer ${viewMode === "list" ? "bg-white text-sky-700 shadow-sm" : "text-white/70 hover:text-white"}`}
                  title="عرض كقائمة"
                >
                  <List size={isFullscreen ? 15 : 13} />
                </button>
                <button 
                  onClick={() => setViewMode("grid")} 
                  className={`${isFullscreen ? 'w-7 h-7' : 'w-6 h-6'} flex items-center justify-center rounded-md transition-all cursor-pointer ${viewMode === "grid" ? "bg-white text-sky-700 shadow-sm" : "text-white/70 hover:text-white"}`}
                  title="عرض كشبكة"
                >
                  <LayoutGrid size={isFullscreen ? 15 : 13} />
                </button>
              </div>
            )}

            <div className="w-px h-4 bg-white/25 mx-0.5" />

            <button 
              onClick={() => setIsFullscreen(!isFullscreen)} 
              className={`${isFullscreen ? 'w-8 h-8' : 'w-7 h-7'} flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all shadow-sm cursor-pointer active:scale-95`} 
              title={isFullscreen ? 'تصغير' : 'تكبير'}
            >
              {isFullscreen ? <Minimize2 size={isFullscreen ? 16 : 15} /> : <Maximize2 size={isFullscreen ? 16 : 15} />}
            </button>
            <button 
              onClick={handleSafeClose} 
              className={`${isFullscreen ? 'w-8 h-8' : 'w-7 h-7'} flex items-center justify-center bg-white/20 hover:bg-white/30 text-white hover:text-red-100 rounded-lg transition-all shadow-sm cursor-pointer active:scale-95`} 
              title="إغلاق"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Modal Header: Personal Info (Secretary & Lab Style, NO PHONE) ── */}
        <div className={`bg-white ${isFullscreen ? 'px-6 sm:px-8 py-3.5 sm:py-4' : 'px-5 sm:px-6 py-3.5'} flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-100 shrink-0 z-20`}>
          {/* Right: Avatar + Name + Surgery Badge + Chips */}
          <div className={`flex items-center ${isFullscreen ? 'gap-3.5 sm:gap-4' : 'gap-3 sm:gap-3.5'}`}>
            <div className={`${isFullscreen ? 'w-12 h-12 sm:w-13 sm:h-13 rounded-xl' : 'w-11 h-11 sm:w-12 sm:h-12 rounded-xl'} bg-gradient-to-br from-sky-50 to-blue-100 flex items-center justify-center text-sky-700 shadow-inner border border-sky-100/60 shrink-0`}>
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
                  <User size={11}/> {visit?.patient_id || visit?.visit_id || '...'}
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
              <Calendar size={isFullscreen ? 15 : 13} className="text-sky-600 opacity-80" />
              <span dir="ltr">{formatDateEn(visit?.created_at || Date.now())}</span>
              <span className="text-slate-300 mx-0.5">•</span>
              <span dir="ltr">{formatTimeEn(visit?.created_at || Date.now())}</span>
            </div>
            
            <div className={`flex items-center gap-1 ${isFullscreen ? 'text-xs font-black' : 'text-[10px] sm:text-[11px] font-black'} text-slate-400`}>
              <span>معرف الزيارة:</span>
              <span className="text-slate-700 font-bold" dir="ltr">{visit?.visit_number || visit?.visit_id || '—'}</span>
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

        {/* ── Body: Requests List / Grid Workspace (Read-only Archive vs Dashboard side-by-side) ── */}
        {readOnly ? (
          /* ── Read-only Archive Workspace (Single Scroll Container, Matching LabModal) ── */
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar bg-slate-50/40">
            {loading ? (
              <div className="p-12 w-full h-full flex items-center justify-center">
                <div className="animate-spin w-10 h-10 border-4 border-sky-200 border-t-sky-600 rounded-full"></div>
              </div>
            ) : archiveItems.length === 0 ? (
              <div className="w-full h-full min-h-[220px] flex flex-col items-center justify-center text-slate-400">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                  <Radiation size={28} className="text-slate-300" />
                </div>
                <p className="font-black text-sm text-slate-500">لا توجد فحوصات إشعاعية في هذا القسم</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* ── Floating Header directly above the table/cards ── */}
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-sky-100/80 rounded-lg text-sky-700 shadow-sm">
                      <Radiation size={16} />
                    </div>
                    <h3 className="text-sm font-black text-slate-700">مساحة عمل الفحوصات الإشعاعية</h3>
                    <span 
                      className="text-xs px-2.5 py-0.5 font-black bg-sky-50 text-sky-700 rounded-full border border-sky-200/60"
                      title="إجمالي الأشعة المنفذة"
                    >
                      {totalArchiveScans}
                    </span>
                  </div>
                </div>

                {/* ── Table: Proportional Layout (100% Total) ── */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-right text-sm whitespace-nowrap table-fixed">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th style={{ width: '5%' }} className="px-2 py-3.5 text-xs font-bold text-slate-500 text-center">#</th>
                          <th style={{ width: '53%' }} className="px-4 py-3.5 text-xs font-bold text-slate-500 text-right">الأشعة المنفذة</th>
                          <th style={{ width: '16%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">نوع الفيلم</th>
                          <th style={{ width: '16%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">التاريخ والوقت</th>
                          <th style={{ width: '10%' }} className="px-3 py-3.5 text-xs font-bold text-slate-500 text-center">النتيجة</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {archiveItems.map((item, idx) => {
                          const itemDate = item.performed_at || visit?.created_at;

                          return (
                            <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                              {/* 1. الترقيم (5%) */}
                              <td style={{ width: '5%' }} className="px-2 py-3.5 text-xs font-black text-slate-400 text-center align-middle">
                                {idx + 1}
                              </td>
                              
                              {/* 2. الأشعة المنفذة (53%) */}
                              <td style={{ width: '53%' }} className="px-4 py-3.5 align-middle">
                                {(() => {
                                  const testNames = (item.isFilm && Array.isArray(item.requests) && item.requests.length > 0)
                                    ? item.requests.map(r => r.name).filter(Boolean)
                                    : (item.name ? item.name.split('+').map(s => s.trim()).filter(Boolean) : []);

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

                              {/* 3. نوع الفيلم (16%) */}
                              <td style={{ width: '16%' }} className="px-3 py-3.5 text-center align-middle">
                                {item.isFilm ? (
                                  item.filmSize === 'large' ? (
                                    <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70 shadow-2xs">
                                      <Film size={12} className="text-indigo-500 shrink-0" />
                                      <span>كبير</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200/70 shadow-2xs">
                                      <Film size={12} className="text-sky-500 shrink-0" />
                                      <span>صغير</span>
                                    </span>
                                  )
                                ) : (
                                  <span className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200/70 shadow-2xs">
                                    <ImageIcon size={12} className="text-violet-500 shrink-0" />
                                    <span>بدون فيلم</span>
                                  </span>
                                )}
                              </td>
                              
                              {/* 4. التاريخ والوقت (16%) */}
                              <td style={{ width: '16%' }} className="px-3 py-3.5 text-center align-middle">
                                <div className="flex flex-col items-center" dir="ltr">
                                  <span className="text-xs font-bold text-slate-700">
                                    {formatDateEn(itemDate)}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-400">
                                    {formatTimeEn(itemDate)}
                                  </span>
                                </div>
                              </td>
                              
                              {/* 5. النتيجة (10%) */}
                              <td style={{ width: '10%' }} className="px-3 py-3.5 text-center align-middle">
                                {item.hasResult ? (
                                  <button 
                                    type="button"
                                    onClick={() => setViewResultItem({
                                      id: item.id,
                                      filmId: item.filmId,
                                      requestId: item.requestId,
                                      name: item.isFilm 
                                        ? `تقرير فيلم ${item.filmSize === 'large' ? 'كبير' : 'صغير'} (${item.requests.map(r => r.name).join(' + ')})` 
                                        : item.name,
                                      result_notes: item.result_notes,
                                      result_file: item.result_file
                                    })}
                                    className="w-8 h-8 rounded-xl inline-flex items-center justify-center text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200/70 transition-all cursor-pointer shadow-2xs active:scale-95 mx-auto"
                                    title="عرض النتيجة والتقرير"
                                  >
                                    <FileText size={15} className="text-sky-600" />
                                  </button>
                                ) : (
                                  <span className="text-xs font-bold text-slate-400">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Body: Requests List / Grid Workspace + Films Studio (Dashboard layout for technician) ── */
          <div className="flex-1 flex overflow-hidden relative">
            {loading ? (
              <div className="p-12 w-full h-full flex items-center justify-center">
                <div className="animate-spin w-10 h-10 border-4 border-sky-200 border-t-sky-600 rounded-full"></div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col lg:flex-row w-full h-full overflow-hidden">
                
                {/* ── 1. Scans Workspace (Takes all remaining width; full width when studio is hidden/collapsed) ── */}
                <div className="flex-1 min-w-0 flex flex-col h-full bg-slate-50/40 overflow-hidden">
                  
                  {/* Workspace Content (Scrollable with floating header directly on body, matching Archive) */}
                  <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
                    {workspaceRequests.length === 0 ? (
                      <div className="w-full h-full min-h-[220px] flex flex-col items-center justify-center text-slate-400">
                        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                          <Radiation size={28} className="text-slate-300" />
                        </div>
                        <p className="font-black text-sm text-slate-500">لا توجد فحوصات إشعاعية في هذا القسم</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* ── Floating Workspace Header directly on window body (Matching Archive) ── */}
                        <div className="flex items-center justify-between gap-2 px-1">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-sky-100/80 rounded-lg text-sky-700 shadow-sm shrink-0">
                              <Radiation size={16} />
                            </div>
                            <h3 className="text-sm font-black text-slate-700">مساحة عمل الفحوصات الإشعاعية</h3>
                            <span className="text-xs px-2.5 py-0.5 font-black bg-sky-50 text-sky-700 rounded-full border border-sky-200/60" dir="ltr">
                              {workspaceRequests.length}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {!readOnly && activeTab === "pending" && hasPending && (
                              <button 
                                type="button"
                                onClick={async () => {
                                  if (onStartAll) {
                                    await onStartAll(visitId);
                                    onClose();
                                  }
                                }}
                                className="h-8 px-3.5 flex items-center gap-1.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white rounded-xl font-black text-xs shadow-xs hover:shadow-sm active:scale-95 transition-all cursor-pointer shrink-0"
                                title="بدء جميع الفحوصات لهذه الزيارة"
                              >
                                <CheckCircle size={14} strokeWidth={2.2} />
                                <span>بدء جميع الفحوصات</span>
                              </button>
                            )}

                            {/* New Film Button when Studio is hidden or collapsed in in_progress tab */}
                            {!readOnly && activeTab === "in_progress" && !showStudio && unassignedFilmsCount > 0 && (
                              <button
                                type="button"
                                onClick={() => setGroupingMode(true)}
                                className="h-8 px-3.5 rounded-xl text-xs font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white transition-all inline-flex items-center justify-center gap-1.5 shadow-xs hover:shadow-sm active:scale-95 cursor-pointer shrink-0"
                                title="إنشاء فيلم جديد وتجميع الفحوصات"
                              >
                                <Plus size={14} strokeWidth={2.4} />
                                <span>اضافة فيلم</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {viewMode === "list" ? (
                          /* ── List Mode: Smart Proportional Layout (Exact 100% total) ── */
                          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                            <div className="w-full overflow-x-auto custom-scrollbar">
                              <table className="w-full text-right text-sm whitespace-nowrap table-fixed min-w-[650px] lg:min-w-full">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                  <tr>
                                    <th style={{ width: colWidths.num }} className="px-2 py-3.5 text-xs font-bold text-slate-500 text-center">#</th>
                                    <th style={{ width: colWidths.name }} className="px-3.5 py-3.5 text-xs font-bold text-slate-500 text-right">اسم الفحص الإشعاعي</th>
                                    <th style={{ width: colWidths.status }} className="px-2.5 py-3.5 text-xs font-bold text-slate-500 text-center">الحالة</th>
                                    <th style={{ width: colWidths.date }} className="px-2.5 py-3.5 text-xs font-bold text-slate-500 text-center">التاريخ والوقت</th>
                                    <th style={{ width: colWidths.action }} className="px-2 py-3.5 text-xs font-bold text-slate-500 text-center">الإجراء</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {workspaceRequests.map((req, idx) => {
                                      const isCompleted = req.status === "completed";
                                      const isInProgress = req.status === "in_progress";
                                      const isPending = req.status === "paid";
                                      const isResultUploaded = req.result_file || req.result_notes;
                                      const isReadyForDelivery = isResultUploaded && !isCompleted;
                                      const isGrouped = req.with_film === 1 && req.radiology_film_id;
                                      const linkedFilm = films.find(f => f.id === req.radiology_film_id);
                                      const itemDate = req.performed_at || req.requested_at || visit?.created_at;

                                      return (
                                        <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                                          {/* 1. الترقيم */}
                                          <td style={{ width: colWidths.num }} className="px-2 py-3.5 text-xs font-black text-slate-400 text-center align-middle">
                                            {idx + 1}
                                          </td>
                                          
                                          {/* 2. اسم الفحص مع شارة رقمي بجانب اسم الفحص */}
                                          <td style={{ width: colWidths.name }} className="px-3.5 py-3.5 align-middle">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span className="font-bold text-slate-800 text-sm leading-snug truncate" title={req.name} dir="ltr">
                                                {req.name}
                                              </span>
                                              {req.with_film !== 1 && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-violet-50 text-violet-700 border border-violet-200/70 shadow-2xs whitespace-nowrap select-none shrink-0">
                                                  <ImageIcon size={11} className="text-violet-500 shrink-0" />
                                                  <span>رقمي</span>
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                          
                                          {/* 3. الحالة - كبسولة أنيقة بنقطة ملونة مطابقة لنافذة المختبر */}
                                          <td style={{ width: colWidths.status }} className="px-2.5 py-3.5 text-center align-middle">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full font-bold border shadow-2xs whitespace-nowrap select-none ${
                                              isCompleted 
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70' 
                                                : isReadyForDelivery 
                                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200/70' 
                                                : isInProgress 
                                                ? 'bg-teal-50 text-teal-700 border-teal-200/70' 
                                                : 'bg-purple-50 text-purple-700 border-purple-200/70'
                                            }`}>
                                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                isCompleted 
                                                  ? 'bg-emerald-500' 
                                                  : isReadyForDelivery 
                                                  ? 'bg-indigo-500' 
                                                  : isInProgress 
                                                  ? 'bg-teal-500 animate-pulse' 
                                                  : 'bg-purple-500 animate-pulse'
                                              }`} />
                                              <span>
                                                {isCompleted ? 'تم التنفيذ' : isReadyForDelivery ? 'جاهز للتسليم' : isInProgress ? 'قيد التنفيذ' : 'في انتظار التنفيذ'}
                                              </span>
                                            </span>
                                          </td>
                                          
                                          {/* 4. التاريخ والوقت - سطرين بالإنجليزية */}
                                          <td style={{ width: colWidths.date }} className="px-2.5 py-3.5 text-center align-middle">
                                            <div className="flex flex-col items-center" dir="ltr">
                                              <span className="text-xs font-bold text-slate-700">
                                                {formatDateEn(itemDate)}
                                              </span>
                                              <span className="text-[10px] font-bold text-slate-400" dir="ltr">
                                                {formatTimeEn(itemDate)}
                                              </span>
                                            </div>
                                          </td>
                                          
                                          {/* 5. الإجراء - أيقونات مدمجة */}
                                          <td style={{ width: colWidths.action }} className="px-2 py-3.5 text-center align-middle">
                                        <div className="flex items-center justify-center gap-1">
                                          {isPending && (
                                            <button 
                                              onClick={() => handleStartIndividualRequest(req.id)}
                                              className="w-7 h-7 rounded-lg text-white bg-sky-600 hover:bg-sky-700 shadow-2xs flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                                              title="بدء الفحص ونقله لغرفة التصوير"
                                            >
                                              <Activity size={13} />
                                            </button>
                                          )}
                                          
                                          {isInProgress && (
                                            <>
                                              {req.with_film !== 1 && (
                                                <>
                                                  <button 
                                                    onClick={() => setUploadingItem({ type: "request", item: req })}
                                                    className="w-7 h-7 rounded-lg text-white bg-sky-600 hover:bg-sky-700 shadow-2xs flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                                                    title="إدخال النتيجة"
                                                  >
                                                    <UploadCloud size={13} />
                                                  </button>
                                                  {isReadyForDelivery && (
                                                    <>
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
                                                        title="معاينة التقرير"
                                                      >
                                                        <Eye size={12} />
                                                      </button>
                                                    </>
                                                  )}
                                                </>
                                              )}
                                              {req.with_film === 1 && (
                                                isGrouped ? (
                                                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
                                                    ضمن فيلم
                                                  </span>
                                                ) : (
                                                  <button 
                                                    onClick={() => setGroupingMode(true)}
                                                    className="w-7 h-7 rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/70 shadow-2xs flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                                                    title="إدراج في فيلم جديد"
                                                  >
                                                    <Plus size={13} />
                                                  </button>
                                                )
                                              )}
                                            </>
                                          )}
                                          
                                          {isCompleted && (
                                            <>
                                              <button 
                                                onClick={() => setViewResultItem(req)}
                                                className="w-7 h-7 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/70 shadow-2xs flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                                                title="عرض النتيجة والتقرير"
                                              >
                                                <FileText size={12} />
                                              </button>
                                              {req.with_film !== 1 && (
                                                <button 
                                                  onClick={() => setUploadingItem({ type: "request", item: req })}
                                                  className="w-7 h-7 rounded-lg text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 shadow-2xs flex items-center justify-center active:scale-95 cursor-pointer"
                                                  title="تعديل النتيجة"
                                                >
                                                  <Edit size={12} />
                                                </button>
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
                        /* ── Grid Mode: Responsive Cards (3 cards per row when studio is closed or in fullscreen) ── */
                        <div className={`grid gap-4 ${
                          (!isFullscreen && showStudio) 
                            ? "grid-cols-1 sm:grid-cols-2" 
                            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                        }`}>
                      {workspaceRequests.map((req, idx) => {
                        const isCompleted = req.status === "completed";
                        const isInProgress = req.status === "in_progress";
                        const isPending = req.status === "paid";
                        const isResultUploaded = req.result_file || req.result_notes;
                        const isReadyForDelivery = isResultUploaded && !isCompleted;
                        const isGrouped = req.with_film === 1 && req.radiology_film_id;
                        const linkedFilm = films.find(f => f.id === req.radiology_film_id);
                        const itemDate = req.performed_at || req.requested_at || visit?.created_at;

                        return (
                          <div 
                            key={req.id} 
                            className="bg-white rounded-3xl border border-slate-100/90 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg flex flex-col justify-between p-5 select-none shadow-[0_4px_20px_rgb(0,0,0,0.03)] group"
                            dir="rtl"
                          >
                            {/* Top: Icon Avatar + Scan Name + [رقمي] Badge + Index Counter */}
                            <div className="flex justify-between items-start gap-3">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className={`w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center font-black text-base transition-transform group-hover:scale-105 shadow-xs ${
                                  isCompleted ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                  isReadyForDelivery ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                                  isInProgress ? 'bg-teal-50 text-teal-700 border border-teal-100' :
                                  'bg-purple-50 text-purple-700 border border-purple-100'
                                }`}>
                                  {req.with_film === 1 ? <Film size={18} /> : <ImageIcon size={18} />}
                                </div>
                                <div className="min-w-0 flex-1 text-right">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="font-black text-slate-800 text-sm leading-tight group-hover:text-sky-700 transition-colors line-clamp-2" title={req.name} dir="ltr">
                                      {req.name}
                                    </h4>
                                    {req.with_film !== 1 && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-violet-50 text-violet-700 border border-violet-200/70 shadow-2xs whitespace-nowrap select-none">
                                        <ImageIcon size={10} className="text-violet-500 shrink-0" />
                                        <span>رقمي</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Index Counter Badge */}
                              <span className="text-xs font-black text-slate-400 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100 flex-shrink-0">
                                {idx + 1}
                              </span>
                            </div>

                            {/* Middle: Date/Time + Status Badge with Luminous Halo Indicator */}
                            <div className="flex items-center justify-between pt-3.5 mt-3.5 border-t border-slate-100/80 gap-2">
                              <div className="flex flex-col text-right" dir="ltr">
                                <span className="text-xs font-bold text-slate-700">
                                  {formatDateEn(itemDate)}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400">
                                  {formatTimeEn(itemDate)}
                                </span>
                              </div>

                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full font-bold border shadow-2xs whitespace-nowrap select-none ${
                                isCompleted ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70' :
                                isReadyForDelivery ? 'bg-indigo-50 text-indigo-700 border-indigo-200/70' :
                                isInProgress ? 'bg-teal-50 text-teal-700 border-teal-200/70' :
                                'bg-purple-50 text-purple-700 border-purple-200/70'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  isCompleted ? 'bg-emerald-500' :
                                  isReadyForDelivery ? 'bg-indigo-500' :
                                  isInProgress ? 'bg-teal-500 animate-pulse' :
                                  'bg-purple-500 animate-pulse'
                                }`} />
                                <span>
                                  {isCompleted ? 'تم التنفيذ' : isReadyForDelivery ? 'جاهز للتسليم' : isInProgress ? 'قيد التنفيذ' : 'في انتظار التنفيذ'}
                                </span>
                              </span>
                            </div>

                            {/* Bottom: Action Buttons */}
                            <div className="mt-3.5 pt-3 border-t border-slate-100">
                              {isPending && (
                                <button 
                                  type="button"
                                  onClick={() => handleStartIndividualRequest(req.id)}
                                  className="w-full py-2 px-4 rounded-xl text-xs font-black text-white bg-sky-600 hover:bg-sky-700 transition-all shadow-xs flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                                >
                                  <Activity size={14} />
                                  <span>تنفيذ الفحص</span>
                                </button>
                              )}

                              {isInProgress && (
                                req.with_film !== 1 ? (
                                  !isReadyForDelivery ? (
                                    <button 
                                      type="button"
                                      onClick={() => setUploadingItem({ type: "request", item: req })}
                                      className="w-full py-2 px-4 rounded-xl text-xs font-black text-white bg-sky-600 hover:bg-sky-700 transition-all shadow-xs flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                                    >
                                      <UploadCloud size={14} />
                                      <span>إرفاق النتيجة</span>
                                    </button>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <button 
                                        type="button"
                                        onClick={() => setUploadingItem({ type: "request", item: req })}
                                        className="flex-1 py-1.5 px-2.5 rounded-xl text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/70 transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                                      >
                                        <Edit size={13} />
                                        <span>تعديل</span>
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => handleDeliverRequest(req.id)}
                                        className="flex-1 py-1.5 px-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer shadow-xs"
                                      >
                                        <CheckCircle size={13} />
                                        <span>تسليم</span>
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => setViewResultItem(req)}
                                        className="w-8 h-8 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all flex items-center justify-center active:scale-95 cursor-pointer shrink-0"
                                        title="معاينة التقرير"
                                        aria-label="معاينة التقرير"
                                      >
                                        <Eye size={14} />
                                      </button>
                                    </div>
                                  )
                                ) : (
                                  isGrouped ? (
                                    <div className="w-full text-[11px] font-bold text-slate-500 bg-slate-50 py-2 rounded-xl text-center border border-slate-200 border-dashed flex items-center justify-center gap-1.5">
                                      مرتبط ومُدرج ضمن أستوديو الأفلام
                                    </div>
                                  ) : (
                                    <button 
                                      type="button"
                                      onClick={() => setGroupingMode(true)}
                                      className="w-full py-2 px-4 rounded-xl text-xs font-black text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/70 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                                    >
                                      <Plus size={14} />
                                      <span>إدراج في فيلم جديد</span>
                                    </button>
                                  )
                                )
                              )}

                              {isCompleted && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-slate-500">التقرير الإشعاعي:</span>
                                  <div className="flex items-center gap-1.5">
                                    <button 
                                      type="button"
                                      onClick={() => setViewResultItem(req)}
                                      className="w-8 h-8 rounded-xl inline-flex items-center justify-center text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200/70 transition-all cursor-pointer shadow-2xs active:scale-95"
                                      title="عرض النتيجة والتقرير"
                                      aria-label="عرض النتيجة والتقرير"
                                    >
                                      <FileText size={15} className="text-sky-600" />
                                    </button>
                                    {req.with_film !== 1 && (
                                      <button 
                                        type="button"
                                        onClick={() => setUploadingItem({ type: "request", item: req })}
                                        className="w-8 h-8 rounded-xl inline-flex items-center justify-center text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer shadow-2xs active:scale-95"
                                        title="تعديل النتيجة"
                                        aria-label="تعديل النتيجة"
                                      >
                                        <Edit size={13} />
                                      </button>
                                    )}
                                  </div>
                                </div>
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
          </div>

          {/* ── 2. Films Studio (Collapsible Side Column with Floating Header directly on Body) ── */}
          {!readOnly && activeTab !== "pending" && films.length > 0 && (
            <aside 
              className={`relative flex flex-col h-full bg-slate-50/70 border-r border-slate-200/80 transition-all duration-300 ease-in-out shrink-0 ${
                isStudioOpen 
                  ? "w-full lg:w-[310px] xl:w-[350px]" 
                  : "w-0 border-0"
              }`}
            >
              {/* Floating Toggle Arrow Button - Fully visible when closed, centered on border when open */}
              <button
                type="button"
                onClick={() => setIsStudioOpen(!isStudioOpen)}
                title={isStudioOpen ? "طي أستوديو الأفلام" : "إظهار أستوديو الأفلام"}
                className={`absolute top-16 w-8 h-8 bg-white border border-slate-300 rounded-full items-center justify-center text-slate-700 hover:text-blue-600 hover:border-blue-400 shadow-md z-40 transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer hidden lg:flex ${
                  isStudioOpen 
                    ? "-right-4 left-auto" 
                    : "left-3 right-auto shadow-lg"
                }`}
              >
                {isStudioOpen ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
              </button>

              {/* Inner wrapper with fixed width matching aside */}
              <div className="w-full lg:w-[310px] xl:w-[350px] max-w-full h-full flex flex-col overflow-hidden">
                {/* Studio Content (Scrollable with floating header directly on body, matching Archive) */}
                <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 custom-scrollbar space-y-3">
                  {/* Floating Films Studio Header directly on window body */}
                  <div className="flex items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1.5 bg-blue-100/80 rounded-lg text-blue-700 shadow-sm shrink-0">
                        <Film size={16} />
                      </div>
                      <h3 className="text-sm font-black text-slate-700 truncate">أستوديو الأفلام</h3>
                      <span className="text-xs px-2.5 py-0.5 font-black bg-blue-50 text-blue-700 rounded-full border border-blue-200/60 shrink-0" dir="ltr">
                        {films.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {activeTab === "in_progress" && unassignedFilmsCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setGroupingMode(true)}
                          className="h-8 px-3.5 rounded-xl text-xs font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white transition-all inline-flex items-center justify-center gap-1.5 shadow-xs hover:shadow-sm active:scale-95 cursor-pointer shrink-0"
                          title="إنشاء فيلم جديد وتجميع الفحوصات"
                        >
                          <Plus size={14} strokeWidth={2.4} />
                          <span>اضافة فيلم</span>
                        </button>
                      )}

                      {/* Mobile-only close button */}
                      <button
                        type="button"
                        onClick={() => setIsStudioOpen(false)}
                        className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-all cursor-pointer shrink-0"
                        title="إغلاق أستوديو الأفلام"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {films.length === 0 ? (
                    <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-slate-400">
                      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                        <Film size={28} className="text-slate-300" />
                      </div>
                      <p className="font-black text-sm text-slate-600">لا توجد أفلام مجمعة</p>
                      <p className="text-xs text-slate-400 mt-1 text-center max-w-[220px]">
                        قم بإضافة فيلم لتجميع الفحوصات ذات الصلة وطباعتها معاً.
                      </p>
                      {activeTab === "in_progress" && unassignedFilmsCount > 0 && (
                        <button
                          onClick={() => setGroupingMode(true)}
                          className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                        >
                          <Plus size={14} /> اضافة فيلم
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {films.map((f) => {
                        const filmRequests = requests.filter(r => r.radiology_film_id === f.id);
                        const isFilmCompleted = filmRequests.length > 0 && filmRequests.every(r => r.status === "completed");
                        const isFilmResultUploaded = filmRequests.length > 0 && filmRequests.some(r => r.result_file || r.result_notes);
                        const isFilmReadyForDelivery = isFilmResultUploaded && !isFilmCompleted;

                        return (
                          <div
                            key={f.id}
                            className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-2.5">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <div className={`w-10 h-10 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-xs transition-transform hover:scale-105 ${
                                    f.film_size === "large" 
                                      ? "bg-blue-50 text-blue-700 border border-blue-200/80" 
                                      : "bg-sky-50 text-sky-700 border border-sky-200/80"
                                  }`}>
                                    <Film size={18} />
                                  </div>
                                  <div className="min-w-0 flex-1 text-right">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <h4 className="font-black text-slate-800 text-sm leading-snug">
                                        فيلم {f.film_size === "large" ? "كبير" : "صغير"}
                                      </h4>
                                      <span className="text-xs font-bold text-slate-400">
                                        ({getScansCountText(filmRequests.length)})
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => setGroupingMode(f)}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all cursor-pointer"
                                    title="تعديل تجميع الفحوصات"
                                  >
                                    <Edit size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteFilm(f.id)}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                                    title="فك الارتباط وحذف الفيلم"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>

                              {/* 2 Scans Per Row Grid Layout - Rendered directly on the card body to maximize space */}
                              <div className="grid grid-cols-2 gap-2 my-2.5" dir="ltr">
                                {filmRequests.map((fr, idx) => (
                                  <div 
                                    key={idx} 
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50/90 hover:bg-blue-50/60 border border-slate-200/70 hover:border-blue-300 transition-all min-w-0 shadow-2xs group/cap ${
                                      filmRequests.length === 1 ? 'col-span-2' : ''
                                    }`}
                                    title={fr.name}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 group-hover/cap:bg-blue-600 shrink-0 shadow-2xs" />
                                    <span className="text-[11px] font-bold text-slate-700 group-hover/cap:text-slate-900 line-clamp-2 leading-snug break-words text-left flex-1" dir="ltr">
                                      {fr.name}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2.5 border-t border-slate-100">
                              {isFilmCompleted && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70 shadow-2xs whitespace-nowrap select-none shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                  <span>تم التنفيذ</span>
                                </span>
                              )}

                              <button 
                                onClick={() => setUploadingItem({ type: "film", item: f })}
                                className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer ${
                                  isFilmResultUploaded 
                                    ? "text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/70" 
                                    : "text-white bg-sky-600 hover:bg-sky-700 shadow-xs"
                                }`}
                              >
                                {isFilmResultUploaded ? <><Edit size={13} /><span>تعديل</span></> : <><UploadCloud size={13} /><span>إرفاق النتيجة</span></>}
                              </button>

                              {isFilmReadyForDelivery && (
                                <button 
                                  onClick={() => handleDeliverFilm(f.id)}
                                  className="py-1.5 px-3 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer shadow-xs whitespace-nowrap"
                                >
                                  <CheckCircle size={13} />
                                  <span>تسليم</span>
                                </button>
                              )}

                              {isFilmResultUploaded && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewResultItem({
                                      id: `film-${f.id}`,
                                      filmId: f.id,
                                      name: `تقرير فيلم ${f.film_size === 'large' ? 'كبير' : 'صغير'}`,
                                      result_notes: filmRequests.find(r => r.radiology_film_id === f.id)?.result_notes,
                                      result_file: filmRequests.find(r => r.radiology_film_id === f.id)?.result_file
                                    });
                                  }}
                                  className="w-8 h-8 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all flex items-center justify-center active:scale-95 cursor-pointer shrink-0"
                                  title="معاينة التقرير"
                                >
                                  <Eye size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </aside>
          )}

            </div>
          )}
        </div>
      )}

        {/* ── Floating Action Footer ── */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-100 flex justify-between items-center z-20 flex-shrink-0">
          <div className="text-xs font-bold text-slate-400 hidden sm:block flex-1">
            {readOnly ? (
              <span className="flex items-center gap-2 text-sky-700">
                <Radiation size={15} /> أرشيف الزيارة — استعراض وتدقيق كافة الفحوصات والتقارير الإشعاعية المرفقة.
              </span>
            ) : activeTab === "pending" ? (
              <span className="flex items-center gap-2 text-sky-600">
                <AlertCircle size={15} /> ابدأ جميع الفحوصات لتحويل المريض إلى غرفة التصوير الإشعاعي.
              </span>
            ) : activeTab === "completed" ? (
              <span className="flex items-center gap-2 text-emerald-600">
                <CheckCircle size={15} /> هذه الزيارة مكتملة. يمكنك استعراض وطباعة التقارير الإشعاعية.
              </span>
            ) : isAllDone ? (
              <span className="flex items-center gap-2 text-emerald-600">
                <CheckCircle size={15} /> تم تسليم جميع النتائج والأفلام. يمكنك الآن إنهاء وتسليم ملف المريض.
              </span>
            ) : (
              <span className="flex items-center gap-2 text-sky-600">
                <AlertCircle size={15} /> يرجى إكمال رفع وتسليم نتائج كافة الفحوصات والأفلام قبل إنهاء الملف.
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button 
              onClick={handleSafeClose} 
              className="flex-1 sm:flex-none bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 font-black py-2 px-5 rounded-xl transition-all active:scale-95 cursor-pointer text-xs sm:text-sm"
            >
              إغلاق
            </button>
            
            {!readOnly && activeTab !== "completed" && !hasPending && (
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
        <UploadResultModal
          isEditMode={
            uploadingItem.isEdit || 
            Boolean(
              uploadingItem.type === "film"
                ? requests.find(r => r.radiology_film_id === uploadingItem.item.id)?.result_notes || requests.find(r => r.radiology_film_id === uploadingItem.item.id)?.result_file
                : uploadingItem.item.result_notes || uploadingItem.item.result_file
            )
          }
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
          closeOnBackdropClick={false}
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
          closeOnBackdropClick={false}
        />
      )}
      {viewResultItem && (
        <ClinicalResultViewerModal
          isOpen={Boolean(viewResultItem)}
          results={radiologyResultsList.length > 0 ? radiologyResultsList : [viewResultItem]}
          initialIndex={viewerInitialIndex}
          patientName={data?.patient?.name || data?.patient_name || data?.full_name || ''}
          visitNumber={data?.patient?.visit_number || visitId}
          theme="radiology"
          onClose={() => setViewResultItem(null)}
        />
      )}
      
      {/* Delete Confirmation Modal */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 z-[100025] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-luxury overflow-hidden flex flex-col border border-slate-100 animate-in zoom-in-95 transition-all duration-300 w-full max-w-md" dir="rtl">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2">
                <Trash2 size={32} />
              </div>
              <h3 className="font-extrabold text-lg text-slate-800">تأكيد الحذف</h3>
              <p className="text-slate-500 text-sm font-semibold leading-relaxed">
                هل أنت متأكد من فك ارتباط هذا الفيلم وحذفه؟
              </p>
              <div className="bg-blue-50 text-blue-700 p-3 rounded-xl text-xs font-bold border border-blue-100 flex items-start gap-2 text-right mt-2 shadow-sm">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                حذف الفيلم سيؤدي إلى إرجاع جميع الفحوصات المنجزة المرتبطة به لحالة "قيد الإجراء" وإلغاء تسليمها.
              </div>
            </div>
            <div className="flex gap-3 p-4 bg-slate-50/50 border-t border-slate-150">
              <button 
                onClick={() => setDeleteConfirm({ isOpen: false, filmId: null })}
                className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-sm transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button 
                onClick={confirmDeleteFilm}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-black rounded-xl text-sm shadow-md transition-colors cursor-pointer"
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
export { UploadResultModal, FilmGroupingModal, PatientDetailPanel, SharedResultPreviewModal, RadiologyResultDetailsModal };

