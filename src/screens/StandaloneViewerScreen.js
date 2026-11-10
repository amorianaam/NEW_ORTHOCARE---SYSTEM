import React, { useState, useEffect, useCallback, useRef } from "react";
import MedicalImageViewer, { getCleanAttachmentLabel, saveFileWithPicker } from "../components/common/MedicalImageViewer";
import {
  FileText,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  Layers
} from "lucide-react";

/**
 * StandaloneViewerScreen - Dedicated Diagnostic PACS Workstation Window
 * Fills 100% of the window without extra headers or bloat.
 * Matches original window titlebar using document.title = filename.
 */
export default function StandaloneViewerScreen() {
  const [files, setFiles] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const pdfTabsScrollRef = useRef(null);
  const pdfActiveTabRef = useRef(null);

  // Load files from localStorage or URL parameters
  useEffect(() => {
    let initialFiles = [];
    let initialIdx = 0;

    try {
      const stored = localStorage.getItem("standalone_viewer_payload");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed.attachments) && parsed.attachments.length > 0) {
          initialFiles = parsed.attachments;
          initialIdx = typeof parsed.initialIndex === "number" ? parsed.initialIndex : 0;
        }
      }
    } catch (err) {
      console.warn("Could not read standalone_viewer_payload", err);
    }

    if (initialFiles.length === 0) {
      const params = new URLSearchParams(window.location.search);
      const fileUrl = params.get("fileUrl") || params.get("url");
      const fileName = params.get("fileName") || params.get("name") || "medical-image.jpg";
      const isPdf = params.get("isPdf") === "1" || fileName.toLowerCase().endsWith(".pdf");
      const idxParam = parseInt(params.get("index") || "0", 10);
      if (fileUrl) {
        initialFiles = [{ id: 0, name: fileName, url: fileUrl, isPdf }];
        initialIdx = isNaN(idxParam) ? 0 : idxParam;
      }
    }

    if (initialFiles.length > 0) {
      setFiles(initialFiles);
      setActiveIndex(Math.min(Math.max(initialIdx, 0), initialFiles.length - 1));
    }
  }, []);

  const activeFile = files[activeIndex] || files[0] || null;

  // Dynamically update document.title to match the original filename exactly as in native window
  useEffect(() => {
    if (activeFile?.name) {
      document.title = activeFile.name;
    }
  }, [activeFile]);

  // Auto-scroll active tab into view in PDF ribbon
  useEffect(() => {
    if (pdfActiveTabRef.current) {
      pdfActiveTabRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center"
      });
    }
  }, [activeIndex]);

  // Navigation handlers (in RTL: ChevronRight / ArrowRight = previous, ChevronLeft / ArrowLeft = next)
  const handleNextAttachment = useCallback(() => {
    if (files.length <= 1) return;
    setActiveIndex((prev) => (prev < files.length - 1 ? prev + 1 : 0));
  }, [files.length]);

  const handlePrevAttachment = useCallback(() => {
    if (files.length <= 1) return;
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : files.length - 1));
  }, [files.length]);

  // Keyboard navigation: ArrowRight = previous, ArrowLeft = next, Escape = close window
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (files.length > 1) {
          handlePrevAttachment();
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (files.length > 1) {
          handleNextAttachment();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        window.close();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [files.length, handleNextAttachment, handlePrevAttachment]);

  if (!activeFile) {
    return (
      <div className="w-screen h-screen bg-[#090d16] flex items-center justify-center text-slate-400 font-bold text-sm">
        جاري تحميل الملف...
      </div>
    );
  }

  return (
    <div className="w-screen h-screen min-h-0 bg-[#090d16] flex flex-col overflow-hidden select-none">
      {activeFile.isPdf ? (
        <div className="w-full h-full flex flex-col bg-slate-900">
          {/* Unified Single Ribbon for PDF Viewer in Standalone Window */}
          <div
            className="h-10 px-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0 select-none z-10 gap-3"
            dir="ltr"
          >
            {/* Controls: Badge & Save As */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-bold text-xs flex items-center gap-1">
                <FileText size={12} />
                <span>PDF</span>
              </span>

              <div className="w-[1px] h-4 bg-slate-800 mx-0.5" />

              <button
                type="button"
                onClick={() => saveFileWithPicker(activeFile?.url, activeFile?.name, true)}
                title="حفظ ملف PDF باسم (Save As)..."
                className="p-1 rounded-md hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center"
              >
                <Download size={14} />
              </button>
            </div>

            {/* Attachments Selector Tabs with Ribbon Navigation */}
            {files.length > 1 && (
              <div className="flex items-center gap-1.5 select-none min-w-0" dir="rtl">
                {/* Attachment Count Badge */}
                <div className="flex items-center gap-1 text-[11px] font-bold text-slate-300 ml-1 shrink-0">
                  <Layers size={13} className="text-blue-400" />
                  <span className="hidden sm:inline">المرفقات:</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] tabular-nums font-bold border border-slate-700/60">
                    {activeIndex + 1}/{files.length}
                  </span>
                </div>

                {/* Ribbon Navigation Arrows */}
                <div className="flex items-center gap-0.5 shrink-0 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/50">
                  <button
                    type="button"
                    onClick={handlePrevAttachment}
                    title={`المرفق السابق (${activeIndex === 0 ? files.length : activeIndex}/${files.length})`}
                    className="p-1 rounded-md hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer active:scale-95"
                  >
                    <ChevronRight size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextAttachment}
                    title={`المرفق التالي (${activeIndex === files.length - 1 ? 1 : activeIndex + 2}/${files.length})`}
                    className="p-1 rounded-md hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer active:scale-95"
                  >
                    <ChevronLeft size={13} />
                  </button>
                </div>

                {/* Scrollable Tabs List */}
                <div
                  ref={pdfTabsScrollRef}
                  className="flex items-center gap-1.5 overflow-x-auto select-none min-w-0 scroll-smooth no-scrollbar py-0.5"
                >
                  {files.map((file, idx) => {
                    const isActive = activeIndex === idx;
                    const label = getCleanAttachmentLabel(file, idx);
                    const isPdf = Boolean(file.isPdf || (file.name && file.name.toLowerCase().endsWith(".pdf")));

                    return (
                      <button
                        key={file.id || idx}
                        ref={isActive ? pdfActiveTabRef : null}
                        type="button"
                        onClick={() => setActiveIndex(idx)}
                        title={file.name || `مرفق ${idx + 1}`}
                        className={`px-2.5 py-0.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 max-w-[120px] sm:max-w-[150px] md:max-w-[180px] ${
                          isActive
                            ? "bg-blue-600 text-white shadow-xs"
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

          {/* PDF iframe frame with Floating Navigation Arrows */}
          <div className="flex-1 w-full h-full p-2 bg-slate-900 relative">
            {files.length > 1 && (
              <>
                {/* Right Arrow (Previous Attachment in RTL) */}
                <button
                  type="button"
                  onClick={handlePrevAttachment}
                  title={`المرفق السابق (${activeIndex === 0 ? files.length : activeIndex} / ${files.length})`}
                  className="absolute top-1/2 -translate-y-1/2 right-4 z-30 w-10 h-10 rounded-full bg-slate-900/75 hover:bg-slate-800 text-white/90 hover:text-white border border-slate-700/80 hover:border-slate-500/80 backdrop-blur-md shadow-xl flex items-center justify-center transition-colors duration-200 cursor-pointer select-none"
                >
                  <ChevronRight size={22} className="stroke-[2.2]" />
                </button>

                {/* Left Arrow (Next Attachment in RTL) */}
                <button
                  type="button"
                  onClick={handleNextAttachment}
                  title={`المرفق التالي (${activeIndex === files.length - 1 ? 1 : activeIndex + 2} / ${files.length})`}
                  className="absolute top-1/2 -translate-y-1/2 left-4 z-30 w-10 h-10 rounded-full bg-slate-900/75 hover:bg-slate-800 text-white/90 hover:text-white border border-slate-700/80 hover:border-slate-500/80 backdrop-blur-md shadow-xl flex items-center justify-center transition-colors duration-200 cursor-pointer select-none"
                >
                  <ChevronLeft size={22} className="stroke-[2.2]" />
                </button>
              </>
            )}

            <iframe
              key={activeFile.url}
              src={activeFile.url}
              className="w-full h-full rounded-xl border border-slate-700/60 bg-white shadow-lg"
              title={activeFile.name || "Clinical PDF Report"}
            />
          </div>
        </div>
      ) : (
        <MedicalImageViewer
          key={activeIndex}
          src={activeFile?.url}
          alt={activeFile?.name || "Medical Image"}
          showControls={true}
          attachments={files}
          activeAttachmentIndex={activeIndex}
          onSelectAttachment={setActiveIndex}
          activeTabClass="bg-blue-600 text-white shadow-xs"
          layerIconClass="text-blue-400"
        />
      )}
    </div>
  );
}
