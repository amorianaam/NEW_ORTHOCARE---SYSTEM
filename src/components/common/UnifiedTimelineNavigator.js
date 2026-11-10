import React, { useState, useEffect, useRef } from 'react';
import { History, ArrowLeft, ArrowRight, Calendar, ChevronDown, RotateCcw, Crown } from 'lucide-react';

const SmartVisitSelector = ({ patientHistory, selectedVisit, onSelectVisit, theme = 'indigo', isMaximized = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const colors = theme === 'teal' 
    ? { icon: 'text-teal-500', borderHover: 'hover:border-teal-300', borderActive: 'border-teal-100', bgActive: 'bg-teal-50', textActive: 'text-teal-700', bgDot: 'bg-teal-600' }
    : theme === 'sky'
    ? { icon: 'text-sky-500', borderHover: 'hover:border-sky-300', borderActive: 'border-sky-100', bgActive: 'bg-sky-50', textActive: 'text-sky-700', bgDot: 'bg-sky-600' }
    : { icon: 'text-indigo-500', borderHover: 'hover:border-indigo-300', borderActive: 'border-indigo-100', bgActive: 'bg-indigo-50', textActive: 'text-indigo-700', bgDot: 'bg-indigo-600' };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-xl text-xs border border-slate-200 hover:border-slate-300 shadow-2xs transition-all outline-none cursor-pointer active:scale-95"
      >
        <Calendar size={13} className={`${colors.icon} shrink-0`} />
        
        {selectedVisit ? (() => {
          const d = new Date(selectedVisit.created_at || Date.now());
          const vId = selectedVisit.visit_number || selectedVisit.id || selectedVisit.visitId;
          const isFollowUp = Boolean(selectedVisit.is_follow_up === 1 || selectedVisit.is_follow_up === true);
          const isExempt = Boolean(selectedVisit.is_exempt === 1 || selectedVisit.is_exempt === true);

          return (
            <div className="flex items-center gap-2 text-[11px] font-bold">
              {vId && (
                <span className="text-[10px] font-black font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200/70" dir="ltr">
                  {vId}
                </span>
              )}
              {/* Date and Time Side by Side */}
              <div className="flex items-center gap-1.5 text-slate-600" dir="ltr">
                <span>{d.toLocaleDateString('en-GB')}</span>
                <span className="text-slate-300 select-none">•</span>
                <span className="text-[10px] text-slate-500 font-medium">{d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
              </div>
              {/* Type Badge if applicable */}
              {isFollowUp && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200/70 select-none">
                  <RotateCcw size={9} className="text-emerald-600" />
                  <span>مراجعة</span>
                </span>
              )}
              {isExempt && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200/70 select-none">
                  <Crown size={9} className="text-amber-600" />
                  <span>إعفاء</span>
                </span>
              )}
            </div>
          );
        })() : (
          <span className="font-bold text-slate-500 whitespace-nowrap text-[11px]">
            كل الزيارات...
          </span>
        )}

        <ChevronDown size={11} className={`text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={`absolute top-full right-auto left-0 mt-1.5 bg-white border border-slate-200/90 rounded-2xl shadow-[0_14px_38px_rgba(0,0,0,0.12)] z-[200] min-w-[340px] sm:min-w-[390px] max-h-64 overflow-y-auto p-1.5 space-y-1`}>
          {patientHistory.map((v) => {
            const isActive = selectedVisit ? (String(selectedVisit.id || selectedVisit.visitId) === String(v.id || v.visitId)) : false;
            const isCancelled = v.status === 'cancelled';
            const isFollowUp = Boolean(v.is_follow_up === 1 || v.is_follow_up === true);
            const isExempt = Boolean(v.is_exempt === 1 || v.is_exempt === true);
            const vId = v.visit_number || v.id || v.visitId;

            return (
              <button
                key={v.id || v.visitId}
                onClick={() => {
                  if (onSelectVisit) onSelectVisit(v);
                  setIsOpen(false);
                }}
                className={`w-full text-right px-3 py-2.5 rounded-xl transition-all flex items-center justify-between gap-3 group cursor-pointer ${
                  isActive 
                    ? `${colors.bgActive} border ${colors.borderActive} shadow-xs` 
                    : isCancelled 
                    ? 'opacity-65 bg-slate-50/70 hover:bg-slate-100 border border-transparent' 
                    : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                {/* Right in RTL: Indicator Dot + Visit ID + Date & Time Side by Side */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 transition-transform ${
                    isActive 
                      ? `${colors.bgDot} scale-125 ring-4 ring-slate-100` 
                      : isCancelled 
                      ? 'bg-slate-300' 
                      : 'bg-slate-300 group-hover:bg-slate-400'
                  }`} />
                  
                  <div className="flex items-center gap-2 min-w-0">
                    {vId && (
                      <span 
                        className={`text-[10px] font-black px-1.5 py-0.5 rounded-md font-mono shrink-0 transition-colors ${
                          isActive 
                            ? 'bg-white text-slate-800 shadow-2xs border border-slate-200/80' 
                            : 'bg-slate-100/90 text-slate-600 group-hover:bg-slate-200/70'
                        }`} 
                        dir="ltr"
                      >
                        {vId}
                      </span>
                    )}

                    {/* Date and Time Side by Side */}
                    <div className="flex items-center gap-1.5 text-[11px] font-bold shrink-0" dir="ltr">
                      <span className={isActive ? colors.textActive : 'text-slate-700'}>
                        {new Date(v.created_at || Date.now()).toLocaleDateString('en-GB')}
                      </span>
                      <span className="text-slate-300 font-normal select-none">•</span>
                      <span className={`text-[10px] ${isActive ? colors.textActive : 'text-slate-400'} font-medium`}>
                        {new Date(v.created_at || Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Left in RTL: Type Badge (rendered only if special, normal remains clean) */}
                <div className="shrink-0 flex items-center gap-1">
                  {isFollowUp && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200/70 shadow-2xs select-none">
                      <RotateCcw size={10} className="text-emerald-600 shrink-0" />
                      <span>مراجعة</span>
                    </span>
                  )}
                  {isExempt && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200/70 shadow-2xs select-none">
                      <Crown size={10} className="text-amber-600 shrink-0" />
                      <span>إعفاء</span>
                    </span>
                  )}
                  {isCancelled && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 shadow-2xs select-none">
                      <span>ملغية</span>
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default function UnifiedTimelineNavigator({ patientHistory, selectedVisit, onSelectVisit, visit, theme = 'indigo', isMaximized = false }) {
  if (!patientHistory || patientHistory.length <= 1) return null;
  const colors = theme === 'teal'
    ? { bgIcon: 'bg-teal-100', textIcon: 'text-teal-600', textLabel: 'text-teal-800', btn: 'border-teal-200 text-teal-700 hover:bg-teal-600 hover:border-teal-600 hover:text-white' }
    : theme === 'sky'
    ? { bgIcon: 'bg-sky-100', textIcon: 'text-sky-600', textLabel: 'text-sky-800', btn: 'border-sky-200 text-sky-700 hover:bg-sky-600 hover:border-sky-600 hover:text-white' }
    : { bgIcon: 'bg-indigo-100', textIcon: 'text-indigo-600', textLabel: 'text-indigo-800', btn: 'border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:border-indigo-600 hover:text-white' };

  const activeId = selectedVisit?.id || selectedVisit?.visitId || visit?.id || visit?.visitId;
  const currentIndex = activeId ? patientHistory.findIndex(v => String(v.id || v.visitId) === String(activeId)) : -1;

  const newerCount = currentIndex !== -1 ? currentIndex : 0;
  const olderCount = currentIndex !== -1 ? patientHistory.length - 1 - currentIndex : 0;
  const hasNewer = newerCount > 0;
  const hasOlder = olderCount > 0;

  const newerVisit = hasNewer ? patientHistory[currentIndex - 1] : null;
  const olderVisit = hasOlder ? patientHistory[currentIndex + 1] : null;

  // Build the smart contextual message
  let message = "";
  if (currentIndex === -1) {
    message = `إجمالي الزيارات المسجلة: ${patientHistory.length}`;
  } else if (hasNewer && hasOlder) {
    message = `زيارات أحدث (${newerCount}) وسابقة (${olderCount}) لهذا المريض`;
  } else if (hasNewer) {
    message = newerCount === 1 ? "توجد زيارة أحدث مسجلة لهذا المريض" : `توجد زيارات أحدث (${newerCount}) مسجلة لهذا المريض`;
  } else if (hasOlder) {
    message = olderCount === 1 ? "توجد زيارة سابقة مسجلة لهذا المريض" : `توجد زيارات سابقة (${olderCount}) مسجلة لهذا المريض`;
  } else {
    message = "لا توجد زيارات أخرى مسجلة لهذا المريض";
  }

  return (
    <div className={`flex items-center justify-between gap-2 bg-slate-50 border-b border-slate-200 ${isMaximized ? 'px-6 sm:px-8 py-2.5' : 'px-4 py-2'} flex-shrink-0`}>
      {/* LEFT: Icon + contextual message */}
      <div className="flex items-center gap-2 min-w-0">
        <div className={`p-1.5 ${colors.bgIcon} rounded-lg ${colors.textIcon} flex-shrink-0`}>
          <History size={isMaximized ? 15 : 13} />
        </div>
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className={`${isMaximized ? 'text-xs' : 'text-[10px]'} font-black ${colors.textLabel} whitespace-nowrap`}>تاريخ طبي:</span>
          <span className={`${isMaximized ? 'text-xs' : 'text-[10px]'} font-bold text-gray-500 truncate`}>{message}</span>
        </div>
      </div>

      {/* RIGHT: Navigation arrows + selector */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {hasNewer && (
          <button
            onClick={() => onSelectVisit && onSelectVisit(newerVisit)}
            className={`flex items-center gap-1 ${isMaximized ? 'px-2.5 py-1.5 text-xs rounded-xl' : 'px-2 py-1 text-[10px] rounded-lg'} bg-white border ${colors.btn} font-black transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap`}
          >
            أحدث <ArrowLeft size={isMaximized ? 14 : 12} />
          </button>
        )}
        {hasOlder && (
          <button
            onClick={() => onSelectVisit && onSelectVisit(olderVisit)}
            className={`flex items-center gap-1 ${isMaximized ? 'px-2.5 py-1.5 text-xs rounded-xl' : 'px-2 py-1 text-[10px] rounded-lg'} bg-white border ${colors.btn} font-black transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap`}
          >
            <ArrowRight size={isMaximized ? 14 : 12} /> سابقة
          </button>
        )}
        <SmartVisitSelector
          patientHistory={patientHistory}
          selectedVisit={selectedVisit}
          onSelectVisit={onSelectVisit}
          theme={theme}
          isMaximized={isMaximized}
        />
      </div>
    </div>
  );
}
