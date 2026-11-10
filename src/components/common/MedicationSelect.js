import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, Pill, X } from 'lucide-react';

const MedicationSelect = ({ value, onChange, options, placeholder, disabled, theme = 'blue', className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef(null);

  const themeColors = {
    focusBorder: theme === 'indigo' ? 'focus:border-indigo-500' : 'focus:border-blue-500',
    focusRing: theme === 'indigo' ? 'focus:ring-indigo-100' : 'focus:ring-blue-100',
    hoverBg: theme === 'indigo' ? 'hover:bg-indigo-50/70 hover:text-indigo-800' : 'hover:bg-blue-50/70 hover:text-blue-800',
    activeBg: theme === 'indigo' ? 'bg-indigo-50 text-indigo-700 font-black' : 'bg-blue-50 text-blue-700 font-black',
    iconColor: theme === 'indigo' ? 'text-indigo-600' : 'text-blue-600',
    avatarBg: theme === 'indigo' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'
  };

  useEffect(() => {
    setSearchTerm(value || '');
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const filteredOptions = (options || []).filter(opt => 
    opt && opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (val) => {
    onChange(val);
    setSearchTerm(val);
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setSearchTerm('');
  };

  return (
    <div ref={wrapperRef} className={`relative w-full ${className}`} dir="rtl">
      <div className="relative flex items-center group">
        {/* Right Search Icon */}
        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-600 transition-colors">
          <Search size={15} strokeWidth={2.2} />
        </div>

        {/* Input Field */}
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          disabled={disabled}
          placeholder={placeholder || "ابحث عن دواء أو اكتب الاسم مباشرة..."}
          className={`w-full bg-slate-50/80 hover:bg-white focus:bg-white border border-slate-200 ${themeColors.focusBorder} focus:ring-2 ${themeColors.focusRing} rounded-xl pr-9 pl-14 py-2.5 text-xs font-bold text-slate-800 transition-all outline-none placeholder:text-slate-400 placeholder:font-semibold shadow-2xs`}
        />

        {/* Left Action Buttons (Clear & Chevron) */}
        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center gap-1">
          {searchTerm && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              title="مسح"
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          )}
          <button
            type="button"
            onClick={() => !disabled && setIsOpen(!isOpen)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <ChevronDown 
              size={15} 
              className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Dropdown Options */}
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-2 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] p-2 max-h-64 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
          {filteredOptions.length > 0 ? (
            <div className="space-y-1">
              {filteredOptions.map((opt, i) => {
                const isSelected = value === opt;
                return (
                  <div 
                    key={i}
                    onClick={() => handleSelect(opt)}
                    className={`px-3 py-2 rounded-xl cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                      isSelected ? themeColors.activeBg : `${themeColors.hoverBg} text-slate-700`
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${themeColors.avatarBg}`}>
                        <Pill size={14} />
                      </div>
                      <span className="text-xs font-bold truncate leading-relaxed">{opt}</span>
                    </div>
                    {isSelected && <Check size={16} className={`${themeColors.iconColor} shrink-0`} strokeWidth={2.5} />}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-5 flex flex-col items-center justify-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100">
                <Pill size={20} />
              </div>
              <p className="text-xs font-bold text-slate-700">الدواء غير مدرج في الدليل الدوائي</p>
              <p className="text-[10px] font-semibold text-slate-400">سيتم حفظ ما كتبته كاسم دواء مخصص للمفضلة</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MedicationSelect;
