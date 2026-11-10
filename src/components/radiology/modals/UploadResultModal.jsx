import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText, X, UploadCloud, Eye, Trash2, CheckCircle
} from 'lucide-react';
import { toast } from 'react-toastify';
import SharedResultPreviewModal from './SharedResultPreviewModal';
import { getServerBaseUrl } from '../../utils/apiConfig';

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

// ── Upload Result Modal (Matching Lab Luxury Modal) ───────────────────────────────────────────
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

export default UploadResultModal;