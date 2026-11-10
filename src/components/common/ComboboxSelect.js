import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, Sparkles } from 'lucide-react';

/**
 * ComboboxSelect
 * A highly stylized, modern autocomplete component.
 * Displays options as a grid/flex of interactive chips instead of a boring vertical list.
 */
const ComboboxSelect = ({ 
  value, 
  onChange, 
  options, 
  placeholder, 
  disabled, 
  theme = 'blue',
  icon: Icon = null,
  emptyMessage = "أدخل قيمة مخصصة"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef(null);

  const themeColors = {
    focusBorder: theme === 'indigo' ? 'focus:border-indigo-400' : 'focus:border-blue-400',
    focusRing: theme === 'indigo' ? 'focus:ring-indigo-100' : 'focus:ring-blue-100',
    chipHover: theme === 'indigo' ? 'hover:bg-indigo-100 hover:text-indigo-700 hover:border-indigo-200' : 'hover:bg-blue-100 hover:text-blue-700 hover:border-blue-200',
    chipActive: theme === 'indigo' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200' : 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200',
    chipDefault: 'bg-white text-gray-600 border-gray-200',
    iconColor: theme === 'indigo' ? 'text-indigo-400' : 'text-blue-400'
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

  const filteredOptions = options.filter(opt => 
    opt && opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (val) => {
    onChange(val);
    setSearchTerm(val);
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative flex items-center group">
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
          placeholder={placeholder}
          className={`w-full bg-gray-50/80 border border-gray-200 focus:bg-white ${themeColors.focusBorder} focus:ring-2 ${themeColors.focusRing} rounded-xl pl-10 pr-9 py-2.5 text-sm font-bold text-gray-800 transition-all outline-none placeholder-gray-400 shadow-sm`}
          dir="rtl"
        />
        {Icon ? (
          <Icon size={16} className={`absolute right-3 pointer-events-none transition-colors ${isOpen ? themeColors.iconColor : 'text-gray-400'}`} />
        ) : (
          <Search size={16} className={`absolute right-3 pointer-events-none transition-colors ${isOpen ? themeColors.iconColor : 'text-gray-400'}`} />
        )}
        
        <div 
          className="absolute left-2 p-1.5 hover:bg-gray-200 rounded-lg cursor-pointer transition-colors"
          onClick={() => !disabled && setIsOpen(!isOpen)}
        >
          <ChevronDown 
            size={16} 
            className={`text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-2 bg-white/95 backdrop-blur-md border border-gray-150 rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] p-4 transform origin-top animate-in fade-in zoom-in-95 duration-200" dir="rtl">
          
          <div className="flex items-center gap-2 mb-3 px-1">
            <Sparkles size={14} className={themeColors.iconColor} />
            <span className="text-xs font-black text-gray-500 uppercase tracking-wider">اقتراحات سريعة</span>
          </div>

          <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto pb-1 scrollbar-hide">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, i) => {
                const isActive = value === opt;
                return (
                  <button
                    key={i}
                    onClick={() => handleSelect(opt)}
                    className={`px-3.5 py-1.5 rounded-xl border text-xs font-extrabold transition-all duration-200 flex items-center gap-1.5 transform hover:scale-[1.02] active:scale-95 ${isActive ? themeColors.chipActive : `${themeColors.chipDefault} ${themeColors.chipHover}`}`}
                  >
                    {opt}
                    {isActive && <Check size={12} strokeWidth={4} />}
                  </button>
                );
              })
            ) : (
              <div className="w-full py-6 flex flex-col items-center justify-center text-sm text-gray-500 text-center gap-2 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <span className="text-xl">✍️</span>
                <p className="font-bold text-gray-600">{emptyMessage}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ComboboxSelect;
