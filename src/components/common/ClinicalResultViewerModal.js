import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Maximize2,
  Minimize2,
  ExternalLink,
  FileText,
  FlaskConical,
  Radiation,
  Stethoscope,
  Calendar,
  Layers,
  Image as ImageIcon,
  AlertCircle,
  Copy,
  Check,
  Download
} from "lucide-react";
import { toast } from "react-toastify";
import MedicalImageViewer, { getCleanAttachmentLabel, saveFileWithPicker } from "./MedicalImageViewer";
import { resolveFileUrl } from "../../utils/emrHelpers";
import { getServerBaseUrl } from "../../utils/apiConfig";
import useAuthStore from "../../store/useAuthStore";

// Dynamic LAN Server Gateway Base URL for resolving relative file paths in Electron / Web
const getBackendUrl = () => getServerBaseUrl();

// Role & Department Adaptive Themes
const THEMES = {
  secretary: {
    key: "secretary",
    headerGradient: "bg-gradient-to-r from-teal-700 via-teal-600 to-teal-700",
    headerIconColor: "text-teal-100",
    reportIconBox: "bg-teal-50 text-teal-600 border border-teal-100 shadow-2xs",
    hoverText: "hover:text-teal-600",
    activeTab: "bg-teal-600 text-white shadow-xs",
    layerIcon: "text-teal-400",
    accentBadge: "bg-teal-50 text-teal-700 border border-teal-200/70 shadow-2xs",
    accentBadgeIcon: "text-teal-500"
  },
  radiology: {
    key: "radiology",
    headerGradient: "bg-gradient-to-r from-sky-700 via-blue-600 to-blue-800",
    headerIconColor: "text-sky-100",
    reportIconBox: "bg-sky-50 text-sky-600 border border-sky-100 shadow-2xs",
    hoverText: "hover:text-sky-600",
    activeTab: "bg-sky-600 text-white shadow-xs",
    layerIcon: "text-sky-400",
    accentBadge: "bg-sky-50 text-sky-700 border border-sky-200/70 shadow-2xs",
    accentBadgeIcon: "text-sky-500"
  },
  lab: {
    key: "lab",
    headerGradient: "bg-gradient-to-r from-purple-800 via-purple-700 to-indigo-800",
    headerIconColor: "text-purple-100",
    reportIconBox: "bg-purple-50 text-purple-600 border border-purple-100 shadow-2xs",
    hoverText: "hover:text-purple-600",
    activeTab: "bg-purple-600 text-white shadow-xs",
    layerIcon: "text-purple-400",
    accentBadge: "bg-purple-50 text-purple-700 border border-purple-200/70 shadow-2xs",
    accentBadgeIcon: "text-purple-500"
  },
  doctor: {
    key: "doctor",
    headerGradient: "bg-gradient-to-r from-blue-700 via-blue-600 to-blue-700",
    headerIconColor: "text-blue-100",
    reportIconBox: "bg-blue-50 text-blue-600 border border-blue-100 shadow-2xs",
    hoverText: "hover:text-blue-600",
    activeTab: "bg-blue-600 text-white shadow-xs",
    layerIcon: "text-blue-400",
    accentBadge: "bg-blue-50 text-blue-700 border border-blue-200/70 shadow-2xs",
    accentBadgeIcon: "text-blue-500"
  }
};

// ── Smart Arabic Tafqeet Helpers ─────────────────────────────────────────────
const formatLabCount = (count) => {
  if (count === 1) return "تحليل مشمول";
  if (count === 2) return "تحليلان مشمولان";
  if (count >= 3 && count <= 10) return `${count} تحاليل مشمولة`;
  return `${count} تحليلاً مشمولاً`;
};

const formatRadCount = (count) => {
  if (count === 1) return "فحص واحد";
  if (count === 2) return "فحصان مشمولان";
  if (count >= 3 && count <= 10) return `${count} فحوصات`;
  return `${count} فحصاً`;
};

const formatOverflowCount = (count) => {
  if (count === 1) return "+تحليل آخر";
  if (count === 2) return "+تحليلان آخران";
  if (count >= 3 && count <= 10) return `+${count} تحاليل أخرى`;
  return `+${count} تحليلاً آخر`;
};

/**
 * ClinicalResultViewerModal - Professional Medical Results Workstation
 * Unified diagnostic viewer for Lab, Radiology, and Clinical Services.
 * Features:
 * - Top titlebar: Patient name & department, centered inverted carousel navigation (< 2 / 5 >), and window controls
 * - Adaptive role theming (Secretary Teal, Radiology Sky/Blue, Lab Purple, Doctor Blue)
 * - Adaptive modal sizing (spacious document view for text-only, responsive canvas for media)
 * - Main sub-header: 2-column radiology test grid with blue dots (reverted full font size),
 *   EMR-styled date/time, film size badge & test count underneath date
 * - Unified single attachment ribbon: controls and multi-attachment tabs on the same row with zero double-stacking
 * - Fullscreen / maximize toggle located in attachment controls toolbar
 * - Right-positioned collapsible report sidebar with matching header styling to text-only report
 * - Flexible height notes field adapting naturally to text content in both views
 * - Seamless keyboard navigation (ArrowRight = Ascending/Next, ArrowLeft = Descending/Prev, Escape = Close)
 */
export default function ClinicalResultViewerModal({
  isOpen = true,
  onClose,
  results = [],
  initialIndex = 0,
  patientName = "",
  visitNumber = "",
  theme = null
}) {
  const authUser = useAuthStore((state) => state.user);
  const currentThemeKey = theme || authUser?.role || "doctor";
  const themeStyles = THEMES[currentThemeKey] || THEMES.doctor;

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isReportCollapsed, setIsReportCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAllTestsPopover, setShowAllTestsPopover] = useState(false);
  const popoverRef = useRef(null);
  const pdfTabsScrollRef = useRef(null);
  const pdfActiveTabRef = useRef(null);

  // Auto-scroll active tab into view in PDF ribbon
  useEffect(() => {
    if (pdfActiveTabRef.current) {
      pdfActiveTabRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center"
      });
    }
  }, [activeFileIndex]);

  // Sync initialIndex when modal opens or results change
  useEffect(() => {
    if (initialIndex >= 0 && initialIndex < results.length) {
      setCurrentIndex(initialIndex);
      setActiveFileIndex(0);
      setShowAllTestsPopover(false);
    }
  }, [initialIndex, results.length]);

  // Reset active file tab whenever navigating to a different result
  useEffect(() => {
    setActiveFileIndex(0);
    setShowAllTestsPopover(false);
  }, [currentIndex]);

  // Close overflow popover on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setShowAllTestsPopover(false);
      }
    };
    if (showAllTestsPopover) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAllTestsPopover]);

  const totalResults = results.length;
  const currentResult = results[currentIndex] || null;

  // Department metadata and styling
  const deptInfo = useMemo(() => {
    if (!currentResult) {
      return {
        label: "نتيجة فحص",
        deptName: "الفحوصات الطبية",
        icon: FileText,
        iconBoxClass: "bg-slate-100 text-slate-700 border-slate-200/80 shadow-slate-100"
      };
    }
    const cat = currentResult.categoryKey || "generic";
    if (cat === "lab") {
      return {
        label: "المختبر الطبي",
        deptName: "المختبر",
        icon: FlaskConical,
        iconBoxClass: "bg-purple-50 text-purple-700 border-purple-200/80 shadow-purple-100"
      };
    }
    if (cat === "radiology") {
      return {
        label: "قسم الأشعة",
        deptName: "الأشعة",
        icon: Radiation,
        iconBoxClass: "bg-sky-50 text-sky-700 border-sky-200/80 shadow-sky-100"
      };
    }
    return {
      label: "خدمة سريرية",
      deptName: "الخدمات السريرية",
      icon: Stethoscope,
      iconBoxClass: "bg-teal-50 text-teal-700 border-teal-200/80 shadow-teal-100"
    };
  }, [currentResult]);

  // Normalize attached files into an array: [{ name, url, isPdf, type }]
  const attachedFiles = useMemo(() => {
    if (!currentResult) return [];

    let rawList = [];
    const source = currentResult.result_file || currentResult.file_url || currentResult.attachment;

    if (!source) return [];

    try {
      if (typeof source === "string") {
        const trimmed = source.trim();
        if (trimmed.startsWith("[")) {
          rawList = JSON.parse(trimmed);
        } else if (trimmed.startsWith("{")) {
          rawList = [JSON.parse(trimmed)];
        } else {
          rawList = [{ name: currentResult.name || "الملف المرفق", url: trimmed, base64: trimmed }];
        }
      } else if (Array.isArray(source)) {
        rawList = source;
      } else if (typeof source === "object") {
        rawList = [source];
      }
    } catch {
      rawList = [{ name: currentResult.name || "الملف المرفق", url: source }];
    }

    return rawList
      .map((item, idx) => {
        const resolved = resolveFileUrl(item.url || item.base64 || item.data || item);
        let url = resolved?.url || item.url || item.previewUrl || item.base64 || null;
        if (url && !url.startsWith("http") && !url.startsWith("blob:") && !url.startsWith("data:")) {
          const base = getBackendUrl();
          const cleanPath = url.startsWith('/') ? url : `/${url}`;
          url = `${base}${cleanPath}`;
        }
        const isPdf =
          resolved?.isPdf ||
          (item.type && item.type.includes("pdf")) ||
          (url && url.toLowerCase().includes(".pdf")) ||
          (item.name && item.name.toLowerCase().endsWith(".pdf"));

        return {
          id: idx,
          name: item.name || `مرفق ${idx + 1}`,
          url,
          isPdf: Boolean(isPdf),
          type: item.type || (isPdf ? "application/pdf" : "image/jpeg")
        };
      })
      .filter((f) => Boolean(f.url));
  }, [currentResult]);

  const activeFile = attachedFiles[activeFileIndex] || attachedFiles[0] || null;
  const hasFiles = attachedFiles.length > 0;
  const hasNotes = Boolean(currentResult?.result_notes && currentResult.result_notes.trim());

  // Film type analysis: Check if "بدون فيلم" or an actual film size (كبير / صغير / وسط)
  const isWithoutFilm = useMemo(() => {
    if (!currentResult) return false;
    const ft = String(currentResult.film_type || "").trim();
    return ft === "بدون فيلم" || currentResult.with_film === 0 || currentResult.with_film === false;
  }, [currentResult]);

  const filmSizeLabel = useMemo(() => {
    if (!currentResult || isWithoutFilm) return null;
    return currentResult.film_type || currentResult.film_size || null;
  }, [currentResult, isWithoutFilm]);

  // Robust test items extraction (from items array, +, comma, arabic comma, or newline)
  const radiologyItems = useMemo(() => {
    if (!currentResult) return [];
    if (Array.isArray(currentResult.items) && currentResult.items.length > 0) {
      const parsed = currentResult.items
        .map((i) => (typeof i === "string" ? i : i.name || i.radiology_name || i.test_name))
        .filter(Boolean);
      if (parsed.length > 0) return parsed;
    }
    const rawName = currentResult.name || "";
    if (rawName.includes("+")) {
      return rawName.split("+").map((s) => s.trim()).filter(Boolean);
    }
    if (rawName.includes("،")) {
      return rawName.split("،").map((s) => s.trim()).filter(Boolean);
    }
    if (rawName.includes(",") && !rawName.includes("http")) {
      return rawName.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (rawName.includes("\n")) {
      return rawName.split("\n").map((s) => s.trim()).filter(Boolean);
    }
    return [rawName || (deptInfo.deptName === "المختبر" ? "تحليل مخبري" : "تقرير فحص طبي")];
  }, [currentResult, deptInfo]);

  const isLab = deptInfo.deptName === "المختبر" || currentResult?.categoryKey === "lab";
  const isSharedLab = isLab && (currentResult?.isShared || radiologyItems.length > 1);

  // Modal adaptive size class based on content and maximized state
  const modalSizeClass = useMemo(() => {
    if (isMaximized) return "w-[98vw] h-[98vh] rounded-[2rem]";
    if (!hasFiles) {
      // Text-only report in normal / minimized mode: matches PatientEMRModal scale exactly
      return "w-full max-w-5xl h-full max-h-[90vh] rounded-[2rem]";
    }
    if (!hasNotes || isReportCollapsed) {
      // Media-only (no reports) or when report drawer is collapsed: identical size to text-only mode
      return "w-full max-w-5xl h-full max-h-[90vh] rounded-[2rem]";
    }
    // Both media and report: full workstation
    return "w-full max-w-6xl sm:max-w-7xl h-full max-h-[90vh] rounded-[2rem]";
  }, [isMaximized, hasFiles, hasNotes, isReportCollapsed]);

  // Carousel Navigation Handlers
  // Ascending (التالي / زيادة الرقم)
  const handleNext = useCallback(() => {
    if (totalResults <= 1) return;
    setCurrentIndex((prev) => (prev < totalResults - 1 ? prev + 1 : 0));
  }, [totalResults]);

  // Descending (السابق / نقصان الرقم)
  const handlePrev = useCallback(() => {
    if (totalResults <= 1) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : totalResults - 1));
  }, [totalResults]);

  // Attachment navigation handlers (in RTL: ChevronRight = previous, ChevronLeft = next)
  const handleNextFile = useCallback(() => {
    if (attachedFiles.length <= 1) return;
    setActiveFileIndex((prev) => (prev < attachedFiles.length - 1 ? prev + 1 : 0));
  }, [attachedFiles.length]);

  const handlePrevFile = useCallback(() => {
    if (attachedFiles.length <= 1) return;
    setActiveFileIndex((prev) => (prev > 0 ? prev - 1 : attachedFiles.length - 1));
  }, [attachedFiles.length]);

  // Keyboard navigation listener:
  // - If multiple attachments exist for the current test (attachedFiles.length > 1):
  //   ArrowRight / ArrowLeft navigate between attachments of the current test.
  // - If no attachments or single attachment (attachedFiles.length <= 1):
  //   ArrowRight / ArrowLeft navigate between tests/results (handleNext / handlePrev).
  // - Ctrl+Arrow or Alt+Arrow directly navigates between tests at all times.
  // - Escape closes modal.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;

      // Allow Ctrl+Arrow or Alt+Arrow to navigate between tests directly at all times
      if (e.ctrlKey || e.altKey) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          handlePrev();
          return;
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          handleNext();
          return;
        }
      }

      // Standard Arrow keys:
      // > (ArrowRight): ينتقل إلى السابق أو يرجع إلى الخلف
      // < (ArrowLeft): ينتقل إلى التالي أو يتقدم إلى الأمام
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (attachedFiles.length > 1) {
          handlePrevFile();
        } else {
          handlePrev();
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (attachedFiles.length > 1) {
          handleNextFile();
        } else {
          handleNext();
        }
      } else if (e.key === "PageUp") {
        e.preventDefault();
        if (attachedFiles.length > 1) {
          handlePrevFile();
        } else {
          handlePrev();
        }
      } else if (e.key === "PageDown") {
        e.preventDefault();
        if (attachedFiles.length > 1) {
          handleNextFile();
        } else {
          handleNext();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleNext, handlePrev, handleNextFile, handlePrevFile, attachedFiles.length, onClose]);

  // Copy clinical notes to clipboard
  const handleCopyNotes = () => {
    if (!currentResult?.result_notes) return;
    navigator.clipboard.writeText(currentResult.result_notes).then(() => {
      setCopied(true);
      toast.success("تم نسخ نص التقرير الطبي بنجاح");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Open standalone PACS viewer window with all current attachments
  const handleOpenStandalone = (e) => {
    e.preventDefault();
    if (!activeFile?.url) return;

    const payload = {
      attachments: attachedFiles,
      initialIndex: activeFileIndex,
      title: activeFile.name || "medical-image"
    };

    try {
      localStorage.setItem("standalone_viewer_payload", JSON.stringify(payload));
    } catch (err) {
      console.warn("Failed to set standalone_viewer_payload", err);
    }

    const params = new URLSearchParams({
      index: String(activeFileIndex),
      fileUrl: activeFile.url,
      fileName: activeFile.name || "",
      isPdf: activeFile.isPdf ? "1" : "0"
    });

    const isFileProto = typeof window !== "undefined" && window.location?.protocol === "file:";
    const targetUrl = isFileProto ? `#/standalone-viewer?${params.toString()}` : `/standalone-viewer?${params.toString()}`;
    window.open(targetUrl, "_blank");
  };

  if (!isOpen || !currentResult) return null;

  const DeptIcon = deptInfo.icon;

  return createPortal(
    <div
      className="fixed inset-0 z-[100010] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200"
      dir="rtl"
    >
      {/* Background click dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Main Modal Shell (Adaptive dimensions) */}
      <div
        className={`relative z-10 bg-white shadow-2xl flex flex-col overflow-hidden transition-all duration-300 border border-slate-200/90 ring-1 ring-slate-900/10 ${modalSizeClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 1. Top Control Bar (ترويسة النافذة): Title + Centered Carousel Navigator + Window Controls ── */}
        <div className={`relative px-5 py-2.5 sm:px-6 sm:py-2.5 flex items-center justify-between flex-shrink-0 shadow-md text-white transition-colors duration-300 ${themeStyles.headerGradient} z-30 select-none`}>
          {/* Right Section: Title with Patient Name and Department + Shared Lab Badge */}
          <div className="flex items-center gap-2 min-w-0 pr-1 max-w-[42%]">
            <DeptIcon size={16} className={`${themeStyles.headerIconColor} shrink-0`} />
            <span className="text-xs sm:text-sm font-black tracking-wide drop-shadow-sm truncate">
              {patientName ? (
                <>نتائج قسم {deptInfo.deptName} للمريض ({patientName})</>
              ) : (
                <>نتائج قسم {deptInfo.deptName}</>
              )}
            </span>
            {isSharedLab && (
              <span className="px-2 py-0.5 rounded-md bg-white/20 text-white font-bold text-[10px] sm:text-xs shrink-0 border border-white/25 shadow-xs">
                نتيجة مشتركة
              </span>
            )}
          </div>

          {/* Center Section: Centered Carousel Navigator (> / Right = السابق / رجوع للخلف, < / Left = التالي / تقدم للأمام) */}
          {totalResults > 1 && (
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/15 hover:bg-white/20 backdrop-blur-md p-0.5 rounded-xl border border-white/25 shadow-xs transition-colors">
              {/* Right Button (> / يشير إلى اليمين / Previous / السابق) */}
              <button
                type="button"
                onClick={handlePrev}
                title="الفحص السابق (رجوع للخلف - سهم يمين >)"
                className="p-1 rounded-lg hover:bg-white/25 text-white transition-all cursor-pointer active:scale-95"
              >
                <ChevronRight size={15} />
              </button>

              {/* Counter Badge */}
              <div className="min-w-[60px] px-2.5 py-0.5 bg-black/20 rounded-lg text-xs font-black text-white tabular-nums flex items-center justify-center gap-1 select-none">
                <span>{currentIndex + 1}</span>
                <span className="text-white/40">/</span>
                <span className="text-white/80">{totalResults}</span>
              </div>

              {/* Left Button (< / يشير إلى اليسار / Next / التالي) */}
              <button
                type="button"
                onClick={handleNext}
                title="الفحص التالي (تقدم للأمام - سهم يسار <)"
                className="p-1 rounded-lg hover:bg-white/25 text-white transition-all cursor-pointer active:scale-95"
              >
                <ChevronLeft size={15} />
              </button>
            </div>
          )}

          {/* Left Section: Window Control Actions (External Link with Text + Maximize/Minimize + Close) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 pl-1">
            {/* External File Link with Text */}
            {activeFile?.url && (
              <a
                href={`/standalone-viewer?index=${activeFileIndex}&fileUrl=${encodeURIComponent(activeFile.url)}&fileName=${encodeURIComponent(activeFile.name || "")}&isPdf=${activeFile.isPdf ? "1" : "0"}`}
                target="_blank"
                rel="noreferrer"
                onClick={handleOpenStandalone}
                title="فتح المرفق في نافذة مستقلة"
                className="h-7 sm:h-8 px-2.5 sm:px-3 flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white rounded-lg transition-all shadow-xs font-bold text-xs cursor-pointer active:scale-95 whitespace-nowrap"
              >
                <ExternalLink size={13} className="shrink-0" />
                <span>فتح في نافذة مستقلة</span>
              </a>
            )}

            {/* Window Maximize / Minimize Button */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? "تصغير النافذة" : "تكبير النافذة"}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-white/15 hover:bg-white/25 text-white rounded-lg transition-all shadow-xs cursor-pointer active:scale-95"
            >
              {isMaximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              title="إغلاق (Esc)"
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-white/15 hover:bg-rose-600 text-white rounded-lg transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── 2. Main Sub-Header (القسم الرئيسي): Compact Diagnostic Capsules without Dots, EMR Date/Time ── */}
        <header className="px-5 py-3 sm:px-6 sm:py-3.5 bg-white border-b border-slate-200/90 shrink-0 select-none flex items-center justify-between gap-4 z-40 relative shadow-2xs">
          
          {/* Right Section: Squircle Icon + Compact Diagnostic Capsules (No Dots, Refined Borders) */}
          <div className="flex items-center gap-3.5 flex-1 min-w-0 pr-1">
            {/* Department Squircle Icon */}
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs border ${deptInfo.iconBoxClass}`}>
              <DeptIcon size={21} strokeWidth={2.2} />
            </div>

            {/* Test Details: Diagnostic Badges (Scaled up, 6 per row when maximized, with Smart Overflow Popover for Shared Labs) */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              {radiologyItems.length > 1 ? (
                <div className={`flex items-center flex-wrap ${isMaximized ? 'gap-2 sm:gap-2.5' : 'gap-1.5 sm:gap-2'} max-w-full py-0.5`}>
                  {/* Badges: Limit to visibleCount when shared lab has many items */}
                  {(() => {
                    const maxVisible = isSharedLab ? (isMaximized ? 6 : 4) : radiologyItems.length;
                    const visibleItems = radiologyItems.slice(0, maxVisible);
                    const hiddenCount = radiologyItems.length - maxVisible;

                    return (
                      <>
                        {visibleItems.map((itemName, idx) => (
                          <div
                            key={idx}
                            className={`inline-flex items-center ${
                              isMaximized
                                ? 'px-3.5 py-1.5 sm:px-4 sm:py-1.5 rounded-xl'
                                : 'px-3 py-1 sm:py-1.5 rounded-xl'
                            } ${
                              isSharedLab
                                ? 'bg-purple-50/70 hover:bg-purple-100/70 border border-purple-200/90 hover:border-purple-300 text-purple-950 font-bold'
                                : 'bg-slate-50 hover:bg-sky-50/50 border border-slate-200/90 hover:border-sky-300 text-slate-800 font-bold'
                            } shadow-2xs transition-all min-w-0 cursor-default`}
                          >
                            <span
                              className={`${
                                isMaximized
                                  ? 'text-sm sm:text-base font-bold max-w-[180px] sm:max-w-[200px] xl:max-w-[230px]'
                                  : 'text-xs sm:text-sm font-bold max-w-[240px] sm:max-w-[300px]'
                              } leading-snug truncate`}
                              title={itemName}
                            >
                              {itemName}
                            </span>
                          </div>
                        ))}

                        {/* Smart Overflow Button & Popover for extra tests */}
                        {hiddenCount > 0 && (
                          <div className="relative inline-block" ref={popoverRef}>
                            <button
                              type="button"
                              onClick={() => setShowAllTestsPopover((prev) => !prev)}
                              className={`inline-flex items-center gap-1.5 ${
                                isMaximized
                                  ? 'px-3.5 py-1.5 text-xs sm:text-sm rounded-xl'
                                  : 'px-2.5 py-1 sm:py-1.5 text-xs rounded-xl'
                              } bg-purple-100/90 hover:bg-purple-200 text-purple-900 border border-purple-300/90 font-bold shadow-2xs transition-all cursor-pointer active:scale-95`}
                            >
                              <span>{formatOverflowCount(hiddenCount)}</span>
                              <ChevronDown
                                size={12}
                                className={`transition-transform duration-200 ${
                                  showAllTestsPopover ? 'rotate-180' : ''
                                }`}
                              />
                            </button>

                            {/* Dropdown Popover */}
                            {showAllTestsPopover && (
                              <div
                                className="absolute top-full right-0 mt-2 w-72 sm:w-80 max-h-72 bg-white border border-slate-200 shadow-2xl rounded-2xl z-[100] overflow-hidden flex flex-col animate-in fade-in zoom-in-95"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                                    <FlaskConical size={14} className="text-purple-600" />
                                    <span>جميع التحاليل المشتركة ({radiologyItems.length})</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setShowAllTestsPopover(false)}
                                    className="w-5 h-5 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                                <div className="p-2 overflow-y-auto custom-scrollbar flex flex-col gap-1 max-h-56">
                                  {radiologyItems.map((itemName, idx) => (
                                    <div
                                      key={idx}
                                      dir="ltr"
                                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-purple-50/70 text-slate-700 hover:text-purple-900 transition-colors text-xs font-bold text-left justify-start"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                                      <span className="truncate">{itemName}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {isWithoutFilm && (
                    <span className={`font-semibold text-slate-400 shrink-0 mr-1 ${isMaximized ? 'text-xs sm:text-sm' : 'text-xs'}`}>
                      (بدون فيلم)
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className={`${isMaximized ? 'text-base sm:text-lg lg:text-xl' : 'text-sm sm:text-base'} font-black text-slate-900 tracking-tight leading-snug`}>
                    {radiologyItems[0] || currentResult.name || (isLab ? "تحليل مخبري" : "تقرير فحص طبي")}
                  </h2>
                  {isWithoutFilm && (
                    <span className="text-xs font-semibold text-slate-400 shrink-0 mr-0.5">
                      (بدون فيلم)
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Left Section: EMR-styled Date/Time + Film Size & Test Count Underneath */}
          <div className="flex flex-col items-end gap-1 shrink-0 select-none">
            {/* Top Line: Date & Time in EMR format */}
            {currentResult.date && (
              <div className="flex items-center gap-1.5 text-slate-500 font-bold text-xs">
                <Calendar size={13} className="text-sky-600 opacity-80" />
                <span dir="ltr">{new Date(currentResult.date).toLocaleDateString("en-GB")}</span>
                <span className="text-slate-300 mx-0.5">•</span>
                <span dir="ltr">{new Date(currentResult.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}</span>
              </div>
            )}

            {/* Bottom Line: Film Size Badge / Lab Shared Badges Underneath */}
            <div className="flex items-center gap-2 mt-0.5">
              {filmSizeLabel && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-sky-50 text-sky-800 border border-sky-200/80 shadow-2xs">
                  <Layers size={11} className="text-sky-600" />
                  <span>{filmSizeLabel}</span>
                </span>
              )}
              {isSharedLab ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-lg border border-purple-200/80 shadow-2xs">
                  <FlaskConical size={11} className="text-purple-600" />
                  <span>{formatLabCount(radiologyItems.length)}</span>
                </span>
              ) : (
                radiologyItems.length > 1 && (
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${themeStyles.accentBadge}`}>
                    <Layers size={11} className={themeStyles.accentBadgeIcon} />
                    <span>{formatRadCount(radiologyItems.length)}</span>
                  </span>
                )
              )}
            </div>
          </div>
        </header>

        {/* ── 3. Content Body (Report Sidebar on RIGHT, Media on LEFT, or Full-Width Document View) ── */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden bg-slate-100 relative">
          
          {/* ── A. Clinical Report Section (Right Side in RTL or Full Width) ── */}
          {hasNotes || !hasFiles ? (
            hasFiles ? (
              /* Collapsible Sidebar (when both files and notes exist) */
              <aside
                className={`relative flex flex-col bg-white border-l border-slate-200/90 transition-all duration-300 ease-in-out shrink-0 order-1 ${
                  isReportCollapsed
                    ? "w-0 border-0"
                    : "w-full md:w-[380px] lg:w-[420px] h-full"
                }`}
              >
                {/* Collapse/Expand Toggle Arrow Button */}
                <button
                  type="button"
                  onClick={() => setIsReportCollapsed(!isReportCollapsed)}
                  title={isReportCollapsed ? "إظهار التقرير والملاحظات" : "طي التقرير والملاحظات"}
                  className={`absolute top-11 w-8 h-8 bg-white hover:bg-slate-100 border border-slate-300 hover:border-slate-400 rounded-full flex items-center justify-center text-slate-700 ${themeStyles.hoverText} shadow-md hover:shadow-lg z-20 transition-colors duration-200 cursor-pointer ${
                    isReportCollapsed
                      ? "right-2 left-auto"
                      : "-left-4 right-auto"
                  }`}
                >
                  {isReportCollapsed ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
                </button>

                {/* Inner wrapper with fixed width to avoid layout jumping during folding */}
                <div className="w-[380px] lg:w-[420px] max-w-full h-full flex flex-col overflow-hidden">
                  {/* Report Panel Header (Identical design to report-only view) */}
                  <div className="px-5 py-3.5 flex items-center justify-between border-b border-slate-200/80 bg-white shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${themeStyles.reportIconBox}`}>
                        <FileText size={17} />
                      </div>
                      <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                        التقرير والملاحظات السريرية
                      </h3>
                    </div>
                  </div>

                  {/* Scrollable Report Body with Flexible Height Notes Field */}
                  <div className="flex-1 p-5 overflow-y-auto custom-scrollbar flex flex-col">
                    <div className="relative w-full h-auto bg-slate-50/70 border border-slate-200/90 rounded-2xl p-5 text-slate-800 font-medium leading-relaxed text-sm shadow-2xs whitespace-pre-wrap break-words select-text">
                      {/* Copy Button Icon at Top-Left of Notes Field */}
                      {currentResult.result_notes && (
                        <button
                          type="button"
                          onClick={handleCopyNotes}
                          title={copied ? "تم النسخ بنجاح" : "نسخ نص التقرير"}
                          className={`absolute top-3 left-3 z-10 w-8 h-8 rounded-xl bg-white/90 hover:bg-white text-slate-400 ${themeStyles.hoverText} border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all active:scale-95 cursor-pointer flex items-center justify-center backdrop-blur-xs`}
                        >
                          {copied ? (
                            <Check size={14} className="text-emerald-600 stroke-[2.5]" />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                      )}

                      {/* Notes Content */}
                      {currentResult.result_notes ? (
                        <div className="pt-0.5 pl-8">
                          {currentResult.result_notes}
                        </div>
                      ) : (
                        <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2 text-center">
                          <AlertCircle size={28} className="text-slate-300 stroke-[1.75]" />
                          <span className="text-xs font-bold text-slate-500">
                            لا توجد ملاحظات نصية مسجلة لهذا الفحص.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </aside>
            ) : (
              /* Enhanced Full-Width Document View when NO files exist (Matches PatientEMRModal scale & presence) */
              <div className="w-full flex-1 min-h-0 p-5 sm:p-6 md:p-8 flex flex-col gap-4 overflow-y-auto custom-scrollbar bg-slate-50/50">
                {/* 1. Distinct Section Header Bar (Separated from the notes field) */}
                <div className="w-full flex items-center justify-between pb-3.5 border-b border-slate-200/80 shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${themeStyles.reportIconBox}`}>
                      <FileText size={17} />
                    </div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                      التقرير والملاحظات السريرية
                    </h3>
                  </div>
                </div>

                {/* 2. Full-Width Flexible-Height Notes Field with Matching Top-Left Copy Button */}
                <div className="relative w-full h-auto bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 text-slate-800 font-medium leading-relaxed text-sm sm:text-base shadow-sm whitespace-pre-wrap break-words select-text">
                  {/* Matching Copy Button Icon at Top-Left */}
                  {currentResult.result_notes && (
                    <button
                      type="button"
                      onClick={handleCopyNotes}
                      title={copied ? "تم النسخ بنجاح" : "نسخ نص التقرير"}
                      className={`absolute top-3.5 left-3.5 z-10 w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-400 ${themeStyles.hoverText} border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all active:scale-95 cursor-pointer flex items-center justify-center backdrop-blur-xs`}
                    >
                      {copied ? (
                        <Check size={14} className="text-emerald-600 stroke-[2.5]" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  )}

                  {/* Notes Content */}
                  {currentResult.result_notes ? (
                    <div className="pl-9">
                      {currentResult.result_notes}
                    </div>
                  ) : (
                    <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2 text-center">
                      <AlertCircle size={28} className="text-slate-300 stroke-[1.75]" />
                      <span className="text-xs font-bold text-slate-500">
                        لا توجد ملاحظات نصية مسجلة لهذا الفحص.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          ) : null}

          {/* ── B. Media Viewport (Left Side in RTL) ── */}
          {hasFiles && (
            <main className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-[#090d16] order-2 relative">
              {/* Viewport: PDF or Diagnostic PACS Canvas */}
              <div className="flex-1 w-full h-full min-h-0 relative overflow-hidden flex flex-col">
                {activeFile?.isPdf ? (
                  <div className="w-full h-full flex flex-col bg-slate-900">
                    {/* Unified Single Ribbon for PDF Viewer */}
                    <div
                      className="h-10 px-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0 select-none z-10 gap-3"
                      dir="ltr"
                    >
                      {/* Controls: Badge & Download */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-bold text-xs flex items-center gap-1">
                          <FileText size={12} />
                          <span>PDF</span>
                        </span>

                        <div className="w-[1px] h-4 bg-slate-800 mx-0.5" />

                        {/* Save As PDF */}
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
                      {attachedFiles.length > 1 && (
                        <div className="flex items-center gap-1.5 select-none min-w-0" dir="rtl">
                          {/* Attachment Count Badge */}
                          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-300 ml-1 shrink-0">
                            <Layers size={13} className={themeStyles.layerIcon} />
                            <span className="hidden sm:inline">المرفقات:</span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] tabular-nums font-bold border border-slate-700/60">
                              {activeFileIndex + 1}/{attachedFiles.length}
                            </span>
                          </div>

                          {/* Ribbon Navigation Arrows */}
                          <div className="flex items-center gap-0.5 shrink-0 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/50">
                            <button
                              type="button"
                              onClick={handlePrevFile}
                              title={`المرفق السابق (${activeFileIndex === 0 ? attachedFiles.length : activeFileIndex}/${attachedFiles.length})`}
                              className="p-1 rounded-md hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer active:scale-95"
                            >
                              <ChevronRight size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={handleNextFile}
                              title={`المرفق التالي (${activeFileIndex === attachedFiles.length - 1 ? 1 : activeFileIndex + 2}/${attachedFiles.length})`}
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
                            {attachedFiles.map((file, idx) => {
                              const isActive = activeFileIndex === idx;
                              const label = getCleanAttachmentLabel(file, idx);
                              const isPdf = Boolean(file.isPdf || (file.name && file.name.toLowerCase().endsWith(".pdf")));

                              return (
                                <button
                                  key={file.id || idx}
                                  ref={isActive ? pdfActiveTabRef : null}
                                  type="button"
                                  onClick={() => setActiveFileIndex(idx)}
                                  title={file.name || `مرفق ${idx + 1}`}
                                  className={`px-2.5 py-0.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 max-w-[120px] sm:max-w-[150px] md:max-w-[180px] ${
                                    isActive
                                      ? themeStyles.activeTab
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
                      {attachedFiles.length > 1 && (
                        <>
                          {/* Right Arrow (Previous Attachment in RTL) */}
                          <button
                            type="button"
                            onClick={handlePrevFile}
                            title={`المرفق السابق (${activeFileIndex === 0 ? attachedFiles.length : activeFileIndex} / ${attachedFiles.length})`}
                            className="absolute top-1/2 -translate-y-1/2 right-4 z-30 w-10 h-10 rounded-full bg-slate-900/75 hover:bg-slate-800 text-white/90 hover:text-white border border-slate-700/80 hover:border-slate-500/80 backdrop-blur-md shadow-xl flex items-center justify-center transition-colors duration-200 cursor-pointer select-none"
                          >
                            <ChevronRight size={22} className="stroke-[2.2]" />
                          </button>

                          {/* Left Arrow (Next Attachment in RTL) */}
                          <button
                            type="button"
                            onClick={handleNextFile}
                            title={`المرفق التالي (${activeFileIndex === attachedFiles.length - 1 ? 1 : activeFileIndex + 2} / ${attachedFiles.length})`}
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
                    key={currentResult?.id || currentIndex}
                    src={activeFile?.url}
                    alt={activeFile?.name || currentResult.name}
                    showControls={true}
                    attachments={attachedFiles}
                    activeAttachmentIndex={activeFileIndex}
                    onSelectAttachment={setActiveFileIndex}
                    activeTabClass={themeStyles.activeTab}
                    layerIconClass={themeStyles.layerIcon}
                  />
                )}
              </div>
            </main>
          )}

        </div>
      </div>
    </div>,
    document.body
  );
}
