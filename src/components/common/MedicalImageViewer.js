import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Plus,
  Minus,
  RotateCw,
  RefreshCw,
  Layers,
  FileText,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Download
} from "lucide-react";
import { saveAs } from "file-saver";
import { toast } from "react-toastify";

/**
 * Intelligent helper to clean machine-generated filenames into human-friendly clinical labels
 */
export const getCleanAttachmentLabel = (file, idx) => {
  if (!file) return `مرفق ${idx + 1}`;
  const rawName = (file.name || "").trim();
  const isPdf = Boolean(file.isPdf || rawName.toLowerCase().endsWith(".pdf"));

  if (!rawName) {
    return isPdf ? `تقرير ${idx + 1}` : `صورة ${idx + 1}`;
  }

  // Remove file extension
  const withoutExt = rawName.replace(/\.(png|jpe?g|webp|gif|bmp|pdf|tiff?)$/i, "").trim();

  // Check if machine-generated timestamp, hash, uuid, or upload slug
  const isMachinePattern =
    /^\d{8,}/.test(withoutExt) ||
    /^[0-9a-fA-F]{8,}/.test(withoutExt) ||
    /^upload[_\-]/i.test(withoutExt) ||
    /^temp[_\-]/i.test(withoutExt) ||
    /^blob[_\-]/i.test(withoutExt) ||
    /^image[_\-]\d+/i.test(withoutExt);

  if (isMachinePattern || !withoutExt) {
    return isPdf ? `تقرير ${idx + 1}` : `صورة ${idx + 1}`;
  }

  // Replace underscores with clean spaces
  return withoutExt.replace(/_+/g, " ");
};

/**
 * Intelligent helper to save a file by prompting the user with a native
 * "Save As" (حفظ باسم) dialog to select destination path on disk.
 */
export const saveFileWithPicker = async (url, defaultName = "file", isPdf = false) => {
  if (!url) return;

  try {
    const res = await fetch(url);
    const blob = await res.blob();

    // Determine clean filename and extension
    let filename = (defaultName || "").trim();
    if (isPdf) {
      if (!filename.toLowerCase().endsWith(".pdf")) {
        filename = `${filename || "clinical-report"}.pdf`;
      }
    } else {
      if (!/\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(filename)) {
        filename = `${filename || "medical-image"}.jpg`;
      }
    }

    // 1. File System Access API (showSaveFilePicker) opens native OS Save As dialog
    if (typeof window !== "undefined" && window.showSaveFilePicker) {
      let acceptMap = {};
      let desc = "ملف طبي";

      if (isPdf) {
        desc = "مستند تقرير طبي (PDF)";
        acceptMap = { "application/pdf": [".pdf"] };
      } else if (filename.toLowerCase().endsWith(".png")) {
        desc = "صورة طبية (PNG)";
        acceptMap = { "image/png": [".png"] };
      } else if (filename.toLowerCase().endsWith(".webp")) {
        desc = "صورة طبية (WEBP)";
        acceptMap = { "image/webp": [".webp"] };
      } else {
        desc = "صورة طبية (JPEG)";
        acceptMap = { "image/jpeg": [".jpg", ".jpeg"] };
      }

      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: desc,
              accept: acceptMap
            }
          ]
        });

        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        toast.success("تم حفظ الملف بنجاح في المسار المحدد");
        return;
      } catch (pickerErr) {
        // If user cancelled the file picker dialog, do not fallback or error
        if (pickerErr.name === "AbortError") {
          return;
        }
        console.warn("showSaveFilePicker failed, falling back to saveAs:", pickerErr);
      }
    }

    // 2. Fallback: file-saver saveAs
    saveAs(blob, filename);
    toast.success("تم بدء حفظ الملف");
  } catch (err) {
    console.error("Save file error:", err);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = defaultName || (isPdf ? "report.pdf" : "image.jpg");
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast.error("تعذر حفظ الملف");
    }
  }
};

/**
 * MedicalImageViewer - Clinical PACS Diagnostic Image Viewer
 * Features:
 * - Unified top docked toolbar containing image tools (Zoom, Pan, Rotate, Reset)
 *   and attachment selector tabs on the opposite side of the same row.
 * - Hardware-accelerated zoom (0.5x - 8x), smooth pointer panning, and 90° rotation.
 * - Dual-zone attachment navigation: ribbon arrows + floating side buttons on canvas edges.
 * - Intelligent filename formatting and truncation with active tab auto-scrolling.
 */
export default function MedicalImageViewer({
  src,
  alt = "Medical Image",
  className = "",
  showControls = true,
  attachments = [],
  activeAttachmentIndex = 0,
  onSelectAttachment = null,
  activeTabClass = "bg-blue-600 text-white shadow-xs",
  layerIconClass = "text-blue-400"
}) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const positionStartRef = useRef({ x: 0, y: 0 });
  const tabsScrollRef = useRef(null);
  const activeTabRef = useRef(null);

  // Auto-scroll active tab into view in ribbon
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center"
      });
    }
  }, [activeAttachmentIndex]);

  // Attachment navigation handlers (in RTL: ChevronRight = previous, ChevronLeft = next)
  const handleNextAttachment = useCallback(() => {
    if (!attachments || attachments.length <= 1 || !onSelectAttachment) return;
    const nextIdx = activeAttachmentIndex < attachments.length - 1 ? activeAttachmentIndex + 1 : 0;
    onSelectAttachment(nextIdx);
  }, [attachments, activeAttachmentIndex, onSelectAttachment]);

  const handlePrevAttachment = useCallback(() => {
    if (!attachments || attachments.length <= 1 || !onSelectAttachment) return;
    const prevIdx = activeAttachmentIndex > 0 ? activeAttachmentIndex - 1 : attachments.length - 1;
    onSelectAttachment(prevIdx);
  }, [attachments, activeAttachmentIndex, onSelectAttachment]);

  // Save As active image handler (prompts user to pick folder & filename)
  const handleDownload = useCallback(() => {
    if (!src) return;
    const currentAttachment = attachments?.[activeAttachmentIndex];
    const fallbackName = typeof alt === "string" && alt ? alt : "medical-image";
    const downloadName = currentAttachment?.name || fallbackName;
    saveFileWithPicker(src, downloadName, false);
  }, [src, attachments, activeAttachmentIndex, alt]);

  // Reset transforms whenever src changes
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  }, [src]);

  // Zoom handlers
  const handleZoom = useCallback((delta, clientX = null, clientY = null) => {
    setScale((prevScale) => {
      const nextScale = Math.min(Math.max(prevScale + delta, 0.5), 8);
      if (nextScale === prevScale) return prevScale;

      if (clientX !== null && clientY !== null && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const offsetX = clientX - (rect.left + rect.width / 2);
        const offsetY = clientY - (rect.top + rect.height / 2);
        const factor = nextScale / prevScale - 1;

        setPosition((prevPos) => ({
          x: prevPos.x - offsetX * factor,
          y: prevPos.y - offsetY * factor
        }));
      }

      return nextScale;
    });
  }, []);

  const handleZoomIn = () => handleZoom(0.35);
  const handleZoomOut = () => handleZoom(-0.35);

  const handleRotateCW = () => setRotation((prev) => (prev + 90) % 360);

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  };

  // Double click toggles between 1x and 2.5x zoom
  const handleDoubleClick = (e) => {
    if (scale > 1.2) {
      handleReset();
    } else {
      handleZoom(1.5, e.clientX, e.clientY);
    }
  };

  // Wheel listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const zoomDelta = e.deltaY < 0 ? 0.25 : -0.25;
      handleZoom(zoomDelta, e.clientX, e.clientY);
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [handleZoom]);

  // Pointer drag events for smooth panning
  const handlePointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    positionStartRef.current = { ...position };
    if (e.currentTarget.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPosition({
      x: positionStartRef.current.x + dx,
      y: positionStartRef.current.y + dy
    });
  };

  const handlePointerUp = (e) => {
    if (isDragging) {
      setIsDragging(false);
      if (e.currentTarget.releasePointerCapture) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
    }
  };

  const transformStyle = {
    transform: `translate3d(${position.x}px, ${position.y}px, 0px) scale(${scale}) rotate(${rotation}deg)`,
    transformOrigin: "center center",
    transition: isDragging ? "none" : "transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
    willChange: "transform"
  };

  return (
    <div
      className={`relative flex flex-col w-full h-full min-h-0 overflow-hidden select-none bg-[#090d16] ${className}`}
    >
      {/* 1. Dedicated Unified Toolbar (Single Row: Controls + Fullscreen on one side, Attachments on other side) */}
      {showControls && (
        <div
          className="h-10 px-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0 select-none z-10 gap-3"
          dir="ltr"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Controls Group */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Save As Image (نقل زر التنزيل إلى يسار زر التكبير والتصغير ليكون آخر زر) */}
            <button
              type="button"
              onClick={handleDownload}
              title="حفظ الصورة باسم (Save As)..."
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer active:scale-95"
            >
              <Download size={14} />
            </button>

            <div className="w-[1px] h-4 bg-slate-800 mx-1" />

            {/* Zoom Out (-) */}
            <button
              type="button"
              onClick={handleZoomOut}
              title="تصغير (-)"
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer active:scale-95"
            >
              <Minus size={15} className="stroke-[2.5]" />
            </button>

            {/* Current Scale Percentage Badge (خط عربي عريض واضح بدون font-mono) */}
            <button
              type="button"
              onClick={handleReset}
              title="إعادة ضبط المقياس (100%)"
              className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-black transition-colors cursor-pointer tabular-nums"
            >
              {Math.round(scale * 100)}%
            </button>

            {/* Zoom In (+) */}
            <button
              type="button"
              onClick={handleZoomIn}
              title="تكبير (+)"
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer active:scale-95"
            >
              <Plus size={15} className="stroke-[2.5]" />
            </button>

            <div className="w-[1px] h-4 bg-slate-800 mx-1" />

            {/* Rotate Clockwise (تدوير باتجاه عقارب الساعة فقط) */}
            <button
              type="button"
              onClick={handleRotateCW}
              title="تدوير 90° باتجاه عقارب الساعة"
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer active:scale-95"
            >
              <RotateCw size={15} />
            </button>

            <div className="w-[1px] h-4 bg-slate-800 mx-1" />

            {/* Reset All */}
            <button
              type="button"
              onClick={handleReset}
              title="إعادة ضبط الموضع والتكبير"
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer active:scale-95"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {/* Opposite side: Multiple Attachments Selector Tabs with Ribbon Navigation */}
          {attachments && attachments.length > 1 && (
            <div className="flex items-center gap-1.5 select-none min-w-0" dir="rtl">
              {/* Attachment Count Badge */}
              <div className="flex items-center gap-1 text-[11px] font-bold text-slate-300 ml-1 shrink-0">
                <Layers size={13} className={layerIconClass} />
                <span className="hidden sm:inline">المرفقات:</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] tabular-nums font-bold border border-slate-700/60">
                  {activeAttachmentIndex + 1}/{attachments.length}
                </span>
              </div>

              {/* Ribbon Navigation Arrows */}
              <div className="flex items-center gap-0.5 shrink-0 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/50">
                <button
                  type="button"
                  onClick={handlePrevAttachment}
                  title={`المرفق السابق (${activeAttachmentIndex === 0 ? attachments.length : activeAttachmentIndex}/${attachments.length})`}
                  className="p-1 rounded-md hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer active:scale-95"
                >
                  <ChevronRight size={13} />
                </button>
                <button
                  type="button"
                  onClick={handleNextAttachment}
                  title={`المرفق التالي (${activeAttachmentIndex === attachments.length - 1 ? 1 : activeAttachmentIndex + 2}/${attachments.length})`}
                  className="p-1 rounded-md hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer active:scale-95"
                >
                  <ChevronLeft size={13} />
                </button>
              </div>

              {/* Scrollable Tabs List */}
              <div
                ref={tabsScrollRef}
                className="flex items-center gap-1.5 overflow-x-auto select-none min-w-0 scroll-smooth no-scrollbar py-0.5"
              >
                {attachments.map((file, idx) => {
                  const isActive = activeAttachmentIndex === idx;
                  const label = getCleanAttachmentLabel(file, idx);
                  const isPdf = Boolean(file.isPdf || (file.name && file.name.toLowerCase().endsWith(".pdf")));

                  return (
                    <button
                      key={file.id || idx}
                      ref={isActive ? activeTabRef : null}
                      type="button"
                      onClick={() => onSelectAttachment && onSelectAttachment(idx)}
                      title={file.name || `مرفق ${idx + 1}`}
                      className={`px-2.5 py-0.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 max-w-[120px] sm:max-w-[150px] md:max-w-[180px] ${
                        isActive
                          ? activeTabClass
                          : "bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 border border-slate-700/50"
                      }`}
                    >
                      <span className="font-mono text-[10px] opacity-75 shrink-0">#{idx + 1}</span>
                      {isPdf ? (
                        <FileText size={11} className="shrink-0" />
                      ) : (
                        <ImageIcon size={11} className="shrink-0" />
                      )}
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Image Viewport with Dual-Zone Navigation */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        className="flex-1 w-full h-full min-h-0 relative overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none" }}
      >
        {/* Grid Pattern */}
        <div
          className="absolute inset-0 pointer-events-none opacity-15"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)",
            backgroundSize: "28px 28px"
          }}
        />

        {/* Floating Viewport Navigation Arrows */}
        {attachments && attachments.length > 1 && (
          <>
            {/* Right Arrow (Previous Attachment in RTL) */}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handlePrevAttachment();
              }}
              title={`المرفق السابق (${activeAttachmentIndex === 0 ? attachments.length : activeAttachmentIndex} / ${attachments.length})`}
              className="absolute top-1/2 -translate-y-1/2 right-3 z-30 w-10 h-10 rounded-full bg-slate-900/75 hover:bg-slate-800 text-white/90 hover:text-white border border-slate-700/80 hover:border-slate-500/80 backdrop-blur-md shadow-xl flex items-center justify-center transition-colors duration-200 cursor-pointer select-none"
            >
              <ChevronRight size={22} className="stroke-[2.2]" />
            </button>

            {/* Left Arrow (Next Attachment in RTL) */}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleNextAttachment();
              }}
              title={`المرفق التالي (${activeAttachmentIndex === attachments.length - 1 ? 1 : activeAttachmentIndex + 2} / ${attachments.length})`}
              className="absolute top-1/2 -translate-y-1/2 left-3 z-30 w-10 h-10 rounded-full bg-slate-900/75 hover:bg-slate-800 text-white/90 hover:text-white border border-slate-700/80 hover:border-slate-500/80 backdrop-blur-md shadow-xl flex items-center justify-center transition-colors duration-200 cursor-pointer select-none"
            >
              <ChevronLeft size={22} className="stroke-[2.2]" />
            </button>
          </>
        )}

        {/* Main Image Layer with Illuminated Diagnostic Radiograph Frame */}
        <div className="relative flex items-center justify-center w-full h-full pointer-events-none">
          <img
            src={src}
            alt={alt}
            style={transformStyle}
            className="max-w-[95%] max-h-[95%] object-contain select-none rounded-lg shadow-[0_8px_30px_rgba(0,0,0,0.7)] ring-1 ring-white/15"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
