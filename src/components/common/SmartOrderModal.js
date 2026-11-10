import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Search, Star, Trash2, FlaskConical, Radiation, Layers,
  Stethoscope, Grid, List, Maximize2, Minimize2, Save,
  Crown, ChevronLeft, ChevronDown, Filter, CheckCircle, Plus, Minus
} from 'lucide-react';
import { toast } from 'react-toastify';
import axios from 'axios';
import taffyot from '../../utils/taffyot';

// ─────────────────────────────────────────────────────────────────────────────
// Number & Currency Helpers (Whole numbers only, comma thousands, (ر.ي))
// ─────────────────────────────────────────────────────────────────────────────
// Helper: Convert Eastern Arabic numerals to standard English digits
const toEnglishDigits = (str) => {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
};

const toInt = (val) => {
  if (val === null || val === undefined) return 0;
  const clean = toEnglishDigits(val);
  if (clean === '' || isNaN(Number(clean))) return 0;
  return Math.round(Number(clean));
};

const formatPrice = (amount) => {
  const val = toInt(amount);
  return val.toLocaleString('en-US');
};

const renderPriceBadge = (amount, isVIP = false, isFree = false) => {
  if (isVIP || isFree) {
    return <span className="font-black text-indigo-600 text-xs">مجاني</span>;
  }
  return (
    <span className="inline-flex items-baseline gap-1 font-black text-xs text-slate-800" dir="ltr">
      <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
      <span>{formatPrice(amount)}</span>
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: compute final_price from a service item
// ─────────────────────────────────────────────────────────────────────────────
function calcFinal(svc) {
  const basePrice = toInt(svc.price);
  if (svc.is_free) {
    return { discount_amount: basePrice, final_price: 0 };
  }
  const pct = Math.min(100, Math.max(0, toInt(svc.discount_percentage)));
  const discount_amount = toInt((basePrice * pct) / 100);
  const final_price = Math.max(0, basePrice - discount_amount);
  return { discount_amount, final_price };
}

// ─────────────────────────────────────────────────────────────────────────────
// Department Badges Helper (Color thematic standards)
// ─────────────────────────────────────────────────────────────────────────────
const getDeptBadgeClass = (svcType) => {
  if (svcType === 'lab') {
    return 'text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-xl';
  }
  if (svcType === 'radiology') {
    return 'text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-xl';
  }
  return 'text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl';
};

// ─────────────────────────────────────────────────────────────────────────────
// Smart Pluralization Helper (Arabic grammar standards: مفرد، مثنى، جمع قلة، جمع كثرة)
// ─────────────────────────────────────────────────────────────────────────────
const renderSmartCounter = (count, dept) => {
  const isLab = dept === 'lab';
  const isRad = dept === 'radiology';
  const isBundle = dept === 'bundles';

  if (!count || count === 0) {
    let emptyText = 'لا توجد خدمات';
    if (isLab) emptyText = 'لا توجد تحاليل';
    else if (isRad) emptyText = 'لا توجد فحوصات';
    else if (isBundle) emptyText = 'لا توجد باقات';
    return <span className="text-xs font-bold text-slate-400">{emptyText}</span>;
  }

  // 1 = خدمة واحدة أو تحليل واحد أو فحص واحد أو باقة واحدة
  if (count === 1) {
    let text = 'خدمة واحدة';
    if (isLab) text = 'تحليل واحد';
    else if (isRad) text = 'فحص واحد';
    else if (isBundle) text = 'باقة واحدة';
    return (
      <span className="text-xs font-black text-blue-700 tracking-tight">
        {text}
      </span>
    );
  }

  // 2 = خدمتان أو تحليلان أو فحصان أو باقتان
  if (count === 2) {
    let text = 'خدمتان';
    if (isLab) text = 'تحليلان';
    else if (isRad) text = 'فحصان';
    else if (isBundle) text = 'باقتان';
    return (
      <span className="text-xs font-black text-blue-700 tracking-tight">
        {text}
      </span>
    );
  }

  const num = toEnglishDigits(count);
  const numSpan = (
    <span className="text-xs font-black text-blue-700 tabular-nums tracking-tight" dir="ltr">
      {num}
    </span>
  );

  // 3 إلى 10 = X خدمات (مثال: 5 خدمات، 5 تحاليل، 4 فحوصات، 3 باقات)
  if (count >= 3 && count <= 10) {
    let plural = 'خدمات';
    if (isLab) plural = 'تحاليل';
    else if (isRad) plural = 'فحوصات';
    else if (isBundle) plural = 'باقات';
    return (
      <div className="flex items-center gap-1">
        {numSpan}
        <span className="text-xs font-bold text-slate-600">{plural}</span>
      </div>
    );
  }

  // 11 فأكثر = X خدمة (مثال: 12 خدمة، 15 تحليل، 20 فحص، 12 باقة)
  let singular = 'خدمة';
  if (isLab) singular = 'تحليل';
  else if (isRad) singular = 'فحص';
  else if (isBundle) singular = 'باقة';
  return (
    <div className="flex items-center gap-1">
      {numSpan}
      <span className="text-xs font-bold text-slate-600">{singular}</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Dept metadata (Unified Theme matching DoctorQueue tabs)
// ─────────────────────────────────────────────────────────────────────────────
const DEPTS = [
  { 
    id: 'lab',       
    label: 'التحاليل المخبرية', 
    Icon: FlaskConical,
    activeClasses: 'bg-white text-purple-700 shadow-xs border border-purple-300 ring-2 ring-purple-100/80 font-black',
    activeIconClass: 'text-purple-600',
    inactiveClasses: 'text-slate-600 hover:text-purple-700 hover:bg-purple-50/60 font-bold',
    inactiveIconClass: 'text-slate-400 group-hover:text-purple-500',
  },
  { 
    id: 'radiology', 
    label: 'الأشعة التشخيصية',  
    Icon: Radiation,
    activeClasses: 'bg-white text-blue-700 shadow-xs border border-blue-300 ring-2 ring-blue-100/80 font-black',
    activeIconClass: 'text-blue-600',
    inactiveClasses: 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/60 font-bold',
    inactiveIconClass: 'text-slate-400 group-hover:text-blue-500',
  },
  { 
    id: 'clinical',  
    label: 'الخدمات السريرية',   
    Icon: Layers,
    activeClasses: 'bg-white text-emerald-700 shadow-xs border border-emerald-300 ring-2 ring-emerald-100/80 font-black',
    activeIconClass: 'text-emerald-600',
    inactiveClasses: 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50/60 font-bold',
    inactiveIconClass: 'text-slate-400 group-hover:text-emerald-500',
  },
  { 
    id: 'bundles',   
    label: 'الباقات الجاهزة',    
    Icon: Crown,
    activeClasses: 'bg-white text-blue-700 shadow-xs border border-blue-300 ring-2 ring-blue-100/80 font-black',
    activeIconClass: 'text-blue-600 fill-blue-100',
    inactiveClasses: 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/60 font-bold',
    inactiveIconClass: 'text-slate-400 group-hover:text-blue-500',
  },
  { 
    id: 'favorites', 
    label: 'المفضلة',            
    Icon: Star,
    activeClasses: 'bg-white text-amber-700 shadow-xs border border-amber-300 ring-2 ring-amber-100/80 font-black',
    activeIconClass: 'text-amber-500 fill-amber-400',
    inactiveClasses: 'text-slate-600 hover:text-amber-700 hover:bg-amber-50/60 font-bold',
    inactiveIconClass: 'text-slate-400 group-hover:text-amber-500',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Bundle Card Component (Styled to match PatientsArchive card standards)
// ─────────────────────────────────────────────────────────────────────────────
const BundleCard = ({ bundle, catalogs, onImport, isVIP, viewMode }) => {
  const [expanded, setExpanded] = useState(false);

  const resolvedItems = useMemo(() => {
    return (bundle.items || []).map(bi => {
      const arr = catalogs[bi.test_type] || [];
      const found = arr.find(c => c.id === bi.test_id);
      return found ? { ...found, svcType: bi.test_type } : null;
    }).filter(Boolean);
  }, [bundle.items, catalogs]);

  const totalOriginal = useMemo(() => {
    return toInt(resolvedItems.reduce((acc, curr) => {
      const p = curr.svcType === 'radiology' ? (curr.price_with_film ?? curr.price) : curr.price;
      return acc + toInt(p);
    }, 0));
  }, [resolvedItems]);

  if (viewMode === 'list') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 hover:border-blue-300 hover:shadow-xs p-3.5 flex flex-col gap-2 transition-all shadow-[0_2px_10px_rgb(0,0,0,0.02)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <h3 className="font-black text-sm text-slate-800 truncate" title={bundle.name}>
              {bundle.name}
            </h3>
            <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 shrink-0">
              {resolvedItems.length} خدمات مشمولة
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
            >
              <span>{expanded ? 'إخفاء' : 'عرض المحتويات'}</span>
              <ChevronDown size={13} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            </button>
            <div className="text-xs font-black text-slate-800">
              {renderPriceBadge(totalOriginal, isVIP)}
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onImport(); }}
              className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black shadow-xs hover:shadow-sm transition-all cursor-pointer active:scale-95"
            >
              إضافة الباقة
            </button>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-slate-100 pt-2.5 mt-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 animate-in fade-in duration-150">
            {resolvedItems.map((svc, idx) => {
              const p = svc.svcType === 'radiology' ? (svc.price_with_film ?? svc.price) : svc.price;
              return (
                <div key={idx} className="flex justify-between items-center py-1.5 px-2.5 bg-slate-50 rounded-xl border border-slate-200/60 text-xs">
                  <span className="font-bold text-slate-700 truncate">{svc.name}</span>
                  <div>{renderPriceBadge(p, isVIP)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-100/90 hover:border-blue-300 hover:shadow-md cursor-pointer transition-all duration-300 flex flex-col justify-between p-4 sm:p-5 select-none shadow-[0_4px_20px_rgb(0,0,0,0.03)] group">
      {/* Top: Name, Services Count Chip, Add Button */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-black text-slate-800 text-sm leading-snug group-hover:text-blue-700 transition-colors line-clamp-2">
            {bundle.name}
          </h3>
          <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-100 mt-2 inline-block shadow-2xs">
            {resolvedItems.length} خدمات مشمولة
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onImport(); }}
          className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black shadow-xs hover:shadow-sm transition-all cursor-pointer active:scale-95 shrink-0"
        >
          إضافة الباقة
        </button>
      </div>

      {/* Bottom: Expand Toggle & Total Price */}
      <div 
        className="flex items-center justify-between pt-3.5 mt-3.5 border-t border-slate-100/80 gap-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[11px] font-black text-slate-500 hover:text-slate-700 flex items-center gap-1">
          <span>{expanded ? 'إخفاء التفاصيل' : 'عرض المحتويات'}</span>
          <ChevronDown size={13} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </span>
        {totalOriginal > 0 && (
          <div className="text-xs font-black text-slate-800 flex items-center gap-1">
            <span className="text-[11px] font-bold text-slate-400">الإجمالي:</span>
            {renderPriceBadge(totalOriginal, isVIP)}
          </div>
        )}
      </div>

      {/* Expanded Items */}
      {expanded && (
        <div className="border-t border-slate-100/80 bg-slate-50/50 p-2.5 mt-3 rounded-2xl space-y-1.5 animate-in fade-in duration-200">
          {resolvedItems.map((svc, idx) => {
            const p = svc.svcType === 'radiology' ? (svc.price_with_film ?? svc.price) : svc.price;
            return (
              <div key={idx} className="flex justify-between items-center py-1.5 px-2.5 bg-white rounded-xl border border-slate-200/60 shadow-2xs text-xs">
                <span className="font-bold text-slate-700 truncate">{svc.name}</span>
                <div>{renderPriceBadge(p, isVIP)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SmartFilterDropdown Component (Clean Categories without internal search)
// ─────────────────────────────────────────────────────────────────────────────
const SmartFilterDropdown = ({ options, selectedCat, onSelectCat }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (name) => {
    onSelectCat(name);
    setIsOpen(false);
  };

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-[34px] px-3 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-2xs ${
          isOpen || selectedCat !== ''
            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 font-black'
            : 'bg-white text-slate-600 border-slate-200/90 hover:bg-slate-50 hover:text-slate-800'
        }`}
      >
        <Filter
          size={13}
          className={selectedCat !== '' ? 'text-blue-600' : 'text-slate-400'}
        />
        <span className="truncate max-w-[130px]">
          {selectedCat === '' ? 'كافة التصنيفات' : selectedCat}
        </span>
        <ChevronDown
          size={13}
          className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-600' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1.5 w-60 bg-white border border-slate-100 shadow-xl rounded-2xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 p-1.5 space-y-1">
          <div className="max-h-60 overflow-y-auto scrollbar-thin space-y-1">
            {options.length === 0 ? (
              <div className="py-3 text-center text-xs font-bold text-slate-400">لا توجد تصنيفات متاحة</div>
            ) : (
              options.map(opt => {
                const isSelected = selectedCat === opt.name;
                return (
                  <button
                    type="button"
                    key={opt.name}
                    onClick={() => handleSelect(opt.name)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-right transition-colors rounded-xl text-xs cursor-pointer ${
                      isSelected 
                        ? 'bg-blue-50 text-blue-700 font-black' 
                        : 'text-slate-600 hover:bg-slate-50 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {isSelected ? (
                        <CheckCircle size={13} className="text-blue-600 shrink-0" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                      )}
                      <span className="truncate">{opt.name === '' ? 'كافة التصنيفات' : opt.name}</span>
                    </div>
                    {opt.count !== undefined && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold shrink-0 ${
                        isSelected ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {opt.count}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SmartOrderModal
// ─────────────────────────────────────────────────────────────────────────────
export default function SmartOrderModal({
  isOpen,
  onClose,
  visit,
  catalogs = { lab: [], radiology: [], clinical: [] },
  favoriteTests = [],
  bundles = [],
  onToggleFavorite,
  onOrderSubmit,
  onOrderSuccess,
  token,
  closeOnBackdropClick = true,
}) {
  // ── Guards & Personal Data ───────────────────────────────────────────────────
  const displayVisit = visit || {};
  const isVIP = Boolean(displayVisit.is_exempt === true || displayVisit.is_exempt === 1);
  const patientName = 
    displayVisit.full_name || 
    displayVisit.patient_name || 
    displayVisit.name || 
    displayVisit.patient?.full_name || 
    displayVisit.patient?.patient_name || 
    displayVisit.patient?.name || 
    '';

  // ── State ───────────────────────────────────────────────────────────────────
  const [basket, setBasket]             = useState([]);
  const [activeDept, setActiveDept]     = useState('lab');
  const [activeCat, setActiveCat]       = useState('');
  const [searchTerm, setSearchTerm]     = useState('');
  const [viewMode, setViewMode]         = useState('grid');   // 'grid' | 'list'
  const [isMaximized, setIsMaximized]   = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [basketOpen, setBasketOpen]     = useState(true);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setBasket([]);
      setActiveDept('lab');
      setSearchTerm('');
      setIsMaximized(false);
    }
  }, [isOpen]);

  // ── Categorized catalog ──────────────────────────────────────────────────────
  const categorized = useMemo(() => {
    const group = (items, type) => {
      const map = {};
      (items || []).forEach(item => {
        const cat = item.category_name || (type === 'lab' ? 'تحاليل عامة' : type === 'radiology' ? 'أشعة عامة' : 'خدمات عامة');
        if (!map[cat]) map[cat] = { name: cat, items: [] };
        map[cat].items.push({ ...item, svcType: type });
      });
      return Object.values(map);
    };
    return {
      lab:       group(catalogs.lab,      'lab'),
      radiology: group(catalogs.radiology, 'radiology'),
      clinical:  group(catalogs.clinical,  'clinical'),
    };
  }, [catalogs]);

  // Reset activeCat when dept changes
  useEffect(() => {
    setActiveCat('');
  }, [activeDept]);

  // ── Display items ────────────────────────────────────────────────────────────
  const allDeptItems = useMemo(() => {
    if (activeDept === 'bundles') {
      return bundles;
    }
    if (activeDept === 'favorites') {
      return [
        ...catalogs.lab.filter(i => favoriteTests.some(f => f.test_id === i.id && f.test_type === 'lab')).map(i => ({ ...i, svcType: 'lab' })),
        ...catalogs.radiology.filter(i => favoriteTests.some(f => f.test_id === i.id && f.test_type === 'radiology')).map(i => ({ ...i, svcType: 'radiology' })),
        ...catalogs.clinical.filter(i => favoriteTests.some(f => f.test_id === i.id && f.test_type === 'clinical')).map(i => ({ ...i, svcType: 'clinical' })),
      ];
    }
    return (categorized[activeDept] || []).flatMap(c => c.items);
  }, [activeDept, categorized, catalogs, favoriteTests, bundles]);

  const filterOptions = useMemo(() => {
    if (activeDept === 'favorites') {
      return [
        { name: '', count: allDeptItems.length },
        { name: 'التحاليل المخبرية' },
        { name: 'الأشعة التشخيصية' },
        { name: 'الخدمات السريرية' }
      ];
    }
    if (activeDept === 'bundles') {
      return [];
    }
    const cats = categorized[activeDept] || [];
    return [
      { name: '', count: allDeptItems.length },
      ...cats.map(c => ({ name: c.name, count: c.items?.length || 0 }))
    ];
  }, [activeDept, categorized, allDeptItems]);

  const displayItems = useMemo(() => {
    let items = allDeptItems;

    // Filter by category
    if (activeCat !== '') {
      if (activeDept === 'favorites') {
        const typeMap = {
          'التحاليل المخبرية': 'lab',
          'الأشعة التشخيصية': 'radiology',
          'الخدمات السريرية': 'clinical'
        };
        const stype = typeMap[activeCat];
        if (stype) items = items.filter(i => i.svcType === stype);
      } else if (activeDept !== 'bundles') {
        items = items.filter(i => {
          const catName = i.category_name || (i.svcType === 'lab' ? 'تحاليل عامة' : i.svcType === 'radiology' ? 'أشعة عامة' : 'خدمات عامة');
          return catName === activeCat;
        });
      }
    }

    // Filter by search
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      items = items.filter(i =>
        i.name?.toLowerCase().includes(q) ||
        i.category_name?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [searchTerm, activeDept, activeCat, allDeptItems]);

  // ── Basket helpers ───────────────────────────────────────────────────────────
  const buildItem = useCallback((svc) => {
    const basePrice = toInt(svc.svcType === 'radiology' ? (svc.price_with_film ?? svc.price) : svc.price);
    const base = {
      ...svc,
      price: basePrice,
      price_with_film: svc.price_with_film !== undefined ? toInt(svc.price_with_film) : undefined,
      price_without_film: svc.price_without_film !== undefined ? toInt(svc.price_without_film) : undefined,
      withFilm: svc.svcType === 'radiology' ? true : undefined,
      discount_percentage: isVIP ? 100 : 0,
      is_free: isVIP ? true : false,
    };
    const { discount_amount, final_price } = calcFinal(base);
    return { ...base, discount_amount, final_price };
  }, [isVIP]);

  const addItem = useCallback((svc) => {
    if (basket.some(s => s.id === svc.id && s.svcType === svc.svcType)) return;
    setBasket(prev => [...prev, buildItem(svc)]);
  }, [basket, buildItem]);

  const removeItem = (idx) => setBasket(prev => prev.filter((_, i) => i !== idx));

  const clearBasket = () => setBasket([]);

  const updateItem = (idx, field, val) => {
    if (isVIP && field !== 'withFilm') return; // VIP: only withFilm can be toggled
    setBasket(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      let updated = { ...s };

      if (field === 'discount_percentage') {
        const parsed = val === '' ? '' : Math.min(100, Math.max(0, toInt(val)));
        updated.discount_percentage = parsed;
      } else if (field === 'withFilm') {
        updated.withFilm = val;
        updated.price = val
          ? toInt(s.price_with_film ?? s.price)
          : toInt(s.price_without_film ?? s.price);
      } else if (field === 'is_free') {
        updated.is_free = val;
        if (!val && updated.svcType === 'radiology') {
          updated.withFilm = true;
          updated.price = toInt(s.price_with_film ?? s.price);
        }
      } else {
        updated[field] = val;
      }

      const { discount_amount, final_price } = calcFinal(updated);
      return { ...updated, discount_amount, final_price };
    }));
  };

  // ── Bundle import ────────────────────────────────────────────────────────────
  const handleImportBundle = (bundle) => {
    if (!bundle?.items?.length) return;
    bundle.items.forEach(item => {
      const dept = item.test_type;
      const catalogArr = catalogs[dept] || [];
      const found = catalogArr.find(c => c.id === item.test_id);
      if (!found) return;
      const svc = { ...found, svcType: dept };
      if (!basket.some(s => s.id === svc.id && s.svcType === dept)) {
        setBasket(prev => [...prev, buildItem(svc)]);
      }
    });
    toast.success(`تم إدراج باقة "${bundle.name}"`);
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!basket.length) return toast.warning('لم تقم بتحديد خدمات');
    setSubmitting(true);
    try {
      const normalizeItem = (s) => ({
        ...s,
        discount_percentage: Number(s.discount_percentage) || 0,
      });
      const payload = {
        labTests:        basket.filter(s => s.svcType === 'lab').map(normalizeItem),
        radiologyTests:  basket.filter(s => s.svcType === 'radiology').map(normalizeItem),
        clinicalServices: basket.filter(s => s.svcType === 'clinical').map(normalizeItem),
      };
      if (onOrderSubmit) {
        await onOrderSubmit(payload);
      } else {
        const headers = { Authorization: `Bearer ${token}` };
        const visitId = displayVisit.visitId || displayVisit.id;
        await axios.post(`/api/doctor/visit/${visitId}/order-services`, payload, { headers });
        toast.success('تم إرسال الطلبات بنجاح');
        if (onOrderSuccess) onOrderSuccess();
      }
      setBasket([]);
      onClose();
    } catch {
      toast.error('خطأ في إرسال الطلبات');
    } finally {
      setSubmitting(false);
    }
  };

  const totalFinal = useMemo(() => {
    return toInt(basket.reduce((sum, s) => sum + (toInt(s.final_price) || 0), 0));
  }, [basket]);

  if (!isOpen) return null;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300"
      dir="rtl"
    >
      {/* Background Overlay */}
      <div className="absolute inset-0" onClick={closeOnBackdropClick ? onClose : undefined} />

      {/* Modal Container */}
      <div
        className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/60 ${
          isMaximized ? 'w-[98vw] h-[98vh] rounded-[2.5rem]' : 'w-full max-w-5xl h-full max-h-[90vh] rounded-[2rem]'
        }`}
      >

        {/* ── TOP CONTROL BAR (Doctor Royal Blue Theme) ───────────────────────── */}
        <div className={`${isMaximized ? 'px-6 sm:px-8 py-3' : 'px-5 py-2.5'} flex items-center justify-between flex-shrink-0 shadow-md text-white transition-colors duration-300 bg-gradient-to-r from-blue-700 via-blue-600 to-blue-700 z-30`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <Stethoscope size={isMaximized ? 18 : 16} className="shrink-0" />
            <span className={`${isMaximized ? 'text-xs sm:text-sm' : 'text-xs'} font-black tracking-wide drop-shadow-sm truncate`}>
              كتالوج الخدمات والفحوصات لطلب خدمات للمريض {patientName ? `(${patientName})` : ''}
            </span>
            {isVIP && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 inline-flex items-center gap-1 shadow-xs shrink-0">
                <Crown size={10} className="fill-amber-950" />
                <span>إعفاء VIP</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* View Mode Switcher */}
            <div className="flex bg-white/15 p-0.5 rounded-lg border border-white/20 gap-0.5">
              <button 
                type="button"
                onClick={() => setViewMode('grid')} 
                className={`p-1.5 rounded-md transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-white text-blue-700 shadow-sm font-black' : 'text-white/80 hover:text-white hover:bg-white/10'}`} 
                title="عرض شبكي"
              >
                <Grid size={14} />
              </button>
              <button 
                type="button"
                onClick={() => setViewMode('list')} 
                className={`p-1.5 rounded-md transition-all cursor-pointer ${viewMode === 'list' ? 'bg-white text-blue-700 shadow-sm font-black' : 'text-white/80 hover:text-white hover:bg-white/10'}`} 
                title="عرض قائمة"
              >
                <List size={14} />
              </button>
            </div>

            <div className="w-px h-4 bg-white/25 mx-1" />

            {/* Maximize/Minimize */}
            <button 
              type="button"
              onClick={() => setIsMaximized(!isMaximized)} 
              className={`${isMaximized ? 'w-8 h-8' : 'w-7 h-7'} flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all shadow-sm cursor-pointer active:scale-95`} 
              title={isMaximized ? 'تصغير' : 'تكبير'}
            >
              {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {/* Close */}
            <button 
              type="button"
              onClick={onClose} 
              className={`${isMaximized ? 'w-8 h-8' : 'w-7 h-7'} flex items-center justify-center bg-white/20 hover:bg-white/30 text-white hover:text-red-100 rounded-lg transition-all shadow-sm cursor-pointer active:scale-95`} 
              title="إغلاق"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── DEPARTMENT TABS BAR (Centered, Adaptive & Professional Segmented Control) ── */}
        <div className={`bg-white border-b border-slate-200/80 ${isMaximized ? 'py-3 px-6' : 'py-2 px-4 sm:px-6'} flex-shrink-0 z-20 flex items-center justify-center`}>
          <div className={`inline-flex items-center bg-slate-100/90 backdrop-blur-md border border-slate-200/80 shadow-2xs overflow-x-auto scrollbar-none max-w-full ${
            isMaximized ? 'p-1.5 gap-2 rounded-[1.35rem]' : 'p-1 gap-1.5 rounded-2xl'
          }`}>
            {DEPTS.map(dept => {
              const isActive = activeDept === dept.id;
              return (
                <button
                  key={dept.id}
                  type="button"
                  onClick={() => { setActiveDept(dept.id); setSearchTerm(''); }}
                  className={`flex items-center transition-all cursor-pointer whitespace-nowrap group ${
                    isMaximized 
                      ? 'py-2.5 px-5 sm:px-6 text-sm sm:text-base gap-2.5 rounded-2xl' 
                      : 'py-2 px-3.5 sm:px-4 text-xs sm:text-sm gap-2 rounded-xl'
                  } ${isActive ? dept.activeClasses : dept.inactiveClasses}`}
                >
                  <dept.Icon 
                    size={isMaximized ? 17 : 15} 
                    className={`shrink-0 transition-colors ${isActive ? dept.activeIconClass : dept.inactiveIconClass}`} 
                  />
                  <span>{dept.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── TOOLBAR: Search & Category Filter on Right, Counter Capsule on Left ── */}
        <div className="px-4 sm:px-6 py-2.5 flex-shrink-0 border-b border-slate-200/80 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Right: Search Input & Category Dropdown */}
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              {/* Search Bar */}
              <div className="relative w-full max-w-xs sm:max-w-sm">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                  <Search size={14} strokeWidth={2.2} />
                </div>
                <input
                  type="text"
                  placeholder="بحث بالاسم أو كود الخدمة..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-blue-500 rounded-xl pr-9 pl-8 py-1.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-2xs transition-all h-[34px]"
                />
                {searchTerm && (
                  <button 
                    type="button"
                    onClick={() => setSearchTerm('')} 
                    className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    title="مسح البحث"
                  >
                    <div className="w-4 h-4 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                      <X size={10} strokeWidth={2.5} />
                    </div>
                  </button>
                )}
              </div>

              {/* Category Dropdown (Next to search input) */}
              {filterOptions.length > 0 && (
                <SmartFilterDropdown 
                  options={filterOptions} 
                  selectedCat={activeCat} 
                  onSelectCat={setActiveCat} 
                />
              )}
            </div>

            {/* Left: Available Services Counter Capsule (With Frame, Icon, Definition Text & Smart Pluralized Unit) */}
            <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
              <div className="bg-white px-3.5 py-1.5 rounded-xl border border-slate-200/80 shadow-2xs text-xs font-bold text-slate-600 flex items-center gap-2 h-[34px]">
                <Layers size={14} className="text-blue-600 shrink-0" />
                <span>الخدمات المتاحة:</span>
                {renderSmartCounter(displayItems.length, activeDept)}
              </div>
            </div>
          </div>
        </div>

        {/* ── BODY: Content Grid / List & Basket ────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white">

          {/* Items grid / list */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 scrollbar-thin bg-slate-50/30">
            {displayItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
                <Layers size={36} className="mb-2 text-slate-300" />
                <p className="text-xs font-bold text-slate-600">لا توجد خدمات مطابقة للبحث أو القسم المحدد</p>
                <p className="text-[11px] text-slate-400 mt-0.5">يرجى التأكد من كلمة البحث أو الفلتر المختار</p>
              </div>
            ) : viewMode === 'list' && activeDept !== 'bundles' ? (
              /* ── LIST VIEW: Proportional Layout Table (100% Exact Distribution) ── */
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                <table className="w-full text-right text-xs border-collapse table-fixed">
                  <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-black">
                    <tr>
                      <th style={{ width: '6%' }} className="px-3 py-3 text-center">تحديد</th>
                      <th style={{ width: activeDept === 'favorites' ? '26%' : '32%' }} className="px-4 py-3 text-right">اسم الخدمة</th>
                      <th style={{ width: activeDept === 'favorites' ? '22%' : '28%' }} className="px-3 py-3 text-center">التصنيف</th>
                      {activeDept === 'favorites' && (
                        <th style={{ width: '18%' }} className="px-3 py-3 text-center">القسم</th>
                      )}
                      <th style={{ width: activeDept === 'favorites' ? '20%' : '26%' }} className="px-3 py-3 text-center">سعر الخدمة</th>
                      <th style={{ width: '8%' }} className="px-3 py-3 text-center">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {displayItems.map((item) => {
                      const isChecked = basket.some(s => s.id === item.id && s.svcType === item.svcType);
                      const isStarred = favoriteTests.some(f => f.test_id === item.id && f.test_type === item.svcType);
                      const itemPrice = toInt(item.svcType === 'radiology' ? (item.price_with_film ?? item.price) : item.price);
                      const deptLabel = item.svcType === 'lab' ? 'مختبر' : item.svcType === 'radiology' ? 'أشعة' : 'خدمة سريرية';

                      const toggleItem = () => {
                        if (isChecked) {
                          setBasket(p => p.filter(s => !(s.id === item.id && s.svcType === item.svcType)));
                        } else {
                          addItem(item);
                        }
                      };

                      return (
                        <tr
                          key={`${item.svcType}_${item.id}`}
                          onClick={toggleItem}
                          className={`cursor-pointer transition-colors ${
                            isChecked ? 'bg-blue-50/40 text-blue-950 font-bold' : 'hover:bg-slate-50/70 text-slate-700'
                          }`}
                        >
                          {/* Selection Checkbox */}
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={toggleItem}
                              onClick={e => e.stopPropagation()}
                              className="w-4 h-4 rounded accent-blue-600 text-blue-600 cursor-pointer"
                            />
                          </td>

                          {/* Service Name (starts from right without change) */}
                          <td className="px-4 py-3 text-right">
                            <span className="font-black text-xs sm:text-sm text-slate-800 line-clamp-1">
                              {item.name}
                            </span>
                          </td>

                          {/* Category (Before Dept - Centered) */}
                          <td className="px-3 py-3 text-center">
                            <span className="text-xs font-semibold text-slate-500 truncate block text-center">
                              {item.category_name || (item.svcType === 'lab' ? 'تحاليل عامة' : item.svcType === 'radiology' ? 'أشعة عامة' : 'خدمات عامة')}
                            </span>
                          </td>

                          {/* Dept (After Category, Only in favorites tab - Centered) */}
                          {activeDept === 'favorites' && (
                            <td className="px-3 py-3 text-center">
                              <span className={`inline-flex items-center ${getDeptBadgeClass(item.svcType)}`}>
                                {item.svcType === 'lab' ? 'مختبر' : item.svcType === 'radiology' ? 'أشعة' : 'سريرية'}
                              </span>
                            </td>
                          )}

                          {/* Price */}
                          <td className="px-3 py-3 text-center">
                            {renderPriceBadge(itemPrice, isVIP)}
                          </td>

                          {/* Action (Favorite Toggle) */}
                          <td className="px-3 py-3 text-center">
                            {onToggleFavorite && (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); onToggleFavorite(item, item.svcType); }}
                                className={`p-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center ${
                                  isStarred ? 'text-amber-500 bg-amber-50' : 'text-slate-300 hover:text-amber-500 hover:bg-slate-50'
                                }`}
                                title={isStarred ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                              >
                                <Star size={14} fill={isStarred ? 'currentColor' : 'none'} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* ── GRID VIEW (Exactly 3 Cards Per Row matching PatientsArchive) ── */
              <div className={`gap-3 sm:gap-4 ${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 items-stretch' : 'flex flex-col gap-2.5'}`}>
                {displayItems.map((item, idx) => {
                  if (activeDept === 'bundles') {
                    return (
                      <BundleCard 
                        key={`bundle_${item.id || idx}`}
                        bundle={item}
                        catalogs={catalogs}
                        onImport={() => handleImportBundle(item)}
                        isVIP={isVIP}
                        viewMode={viewMode}
                      />
                    );
                  }

                  const isChecked = basket.some(s => s.id === item.id && s.svcType === item.svcType);
                  const isStarred = favoriteTests.some(f => f.test_id === item.id && f.test_type === item.svcType);
                  const itemPrice = toInt(item.svcType === 'radiology' ? (item.price_with_film ?? item.price) : item.price);
                  const deptLabel = item.svcType === 'lab' ? 'مختبر' : item.svcType === 'radiology' ? 'أشعة' : 'خدمة سريرية';

                  const toggleItem = () => {
                    if (isChecked) {
                      setBasket(p => p.filter(s => !(s.id === item.id && s.svcType === item.svcType)));
                    } else {
                      addItem(item);
                    }
                  };

                  let themeBorder = 'border-slate-100/90 hover:border-blue-300 hover:shadow-blue-500/10';
                  if (isChecked) {
                    themeBorder = 'border-blue-400 bg-blue-50/20 ring-1 ring-blue-400/30 shadow-xs';
                  }

                  return (
                    <div
                      key={`${item.svcType}_${item.id}`}
                      onClick={toggleItem}
                      className={`bg-white rounded-3xl border cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md flex flex-col justify-between p-4 sm:p-5 select-none shadow-[0_4px_20px_rgb(0,0,0,0.03)] group ${themeBorder}`}
                    >
                      {/* Top: Checkbox, Service Name, Favorite Star */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={toggleItem}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 rounded accent-blue-600 text-blue-600 cursor-pointer mt-0.5 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <h3 className="font-black text-slate-800 text-sm leading-snug group-hover:text-blue-700 transition-colors line-clamp-2" title={item.name}>
                              {item.name}
                            </h3>
                          </div>
                        </div>

                        {onToggleFavorite && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); onToggleFavorite(item, item.svcType); }}
                            className={`p-1.5 rounded-xl shrink-0 transition-all cursor-pointer ${
                              isStarred ? 'text-amber-500 bg-amber-50' : 'text-slate-300 hover:text-amber-500 hover:bg-slate-50'
                            }`}
                            title={isStarred ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                          >
                            <Star size={14} fill={isStarred ? 'currentColor' : 'none'} />
                          </button>
                        )}
                      </div>

                      {/* Bottom row: Category & Price on the same row (With Dept if in Favorites) */}
                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100/80 gap-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="text-[11px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200/50 truncate max-w-[150px]">
                            {item.category_name || (item.svcType === 'lab' ? 'تحاليل عامة' : item.svcType === 'radiology' ? 'أشعة عامة' : 'خدمات عامة')}
                          </span>
                          {/* Only show Dept if in favorites tab */}
                          {activeDept === 'favorites' && (
                            <span className={`inline-flex items-center shrink-0 ${getDeptBadgeClass(item.svcType)}`}>
                              {item.svcType === 'lab' ? 'مختبر' : item.svcType === 'radiology' ? 'أشعة' : 'سريرية'}
                            </span>
                          )}
                        </div>
                        <div className="shrink-0">
                          {renderPriceBadge(itemPrice, isVIP)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── BASKET TABLE ──────────────────────────────────────────────── */}
          {basket.length > 0 && (
            <div className="flex-shrink-0 border-t border-slate-200 bg-white max-h-64 flex flex-col shadow-inner">
              {/* Basket header */}
              <div className="flex justify-between items-center px-4 sm:px-6 py-2 border-b border-slate-100 bg-slate-50/70 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setBasketOpen(o => !o)}
                  className="flex items-center gap-2 text-xs font-black text-blue-900 cursor-pointer"
                >
                  <span className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center text-[10px] font-black shadow-xs">
                    {basket.length}
                  </span>
                  <span>سلة الطلبات المحددة</span>
                  <ChevronLeft size={14} className={`text-slate-400 transition-transform duration-200 ${basketOpen ? '-rotate-90' : ''}`} />
                </button>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={clearBasket}
                    className="flex items-center gap-1.5 text-[11px] font-black text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-xl border border-transparent hover:border-rose-200 transition-all cursor-pointer active:scale-95"
                    title="مسح السلة بالكامل"
                  >
                    <Trash2 size={12} />
                    <span>مسح الكل</span>
                  </button>
                </div>
              </div>

              {basketOpen && (
                <div className="overflow-y-auto flex-1 scrollbar-thin">
                  <table className="w-full text-right text-xs border-collapse table-fixed">
                    <thead className="bg-slate-50 text-slate-600 font-black sticky top-0 border-b border-slate-200 z-10">
                      <tr>
                        <th style={{ width: '4%' }} className="px-2 py-2.5 text-center">#</th>
                        <th style={{ width: isVIP ? '32%' : '24%' }} className="px-3 py-2.5 text-right">اسم الخدمة</th>
                        <th style={{ width: isVIP ? '14%' : '11%' }} className="px-3 py-2.5 text-center">القسم</th>
                        <th style={{ width: isVIP ? '18%' : '15%' }} className="px-3 py-2.5 text-center">السعر الأساسي</th>
                        {!isVIP && <th style={{ width: '18%' }} className="px-2 py-2.5 text-center">الخصم</th>}
                        {!isVIP && <th style={{ width: '8%' }} className="px-2 py-2.5 text-center">مجاني</th>}
                        {isVIP  && <th style={{ width: '14%' }} className="px-3 py-2.5 text-center">حالة الإعفاء</th>}
                        <th style={{ width: isVIP ? '13%' : '15%' }} className="px-3 py-2.5 text-center font-black text-blue-700">السعر المعتمد</th>
                        <th style={{ width: '5%' }} className="px-2 py-2.5 text-center">حذف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {basket.map((svc, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-2 py-2 text-center text-slate-400 font-bold">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <p className="font-bold text-slate-800 line-clamp-1">{svc.name}</p>
                            {/* Radiology Film toggle (For Exempt / VIP or Free services) */}
                            {svc.svcType === 'radiology' && (isVIP || svc.is_free) && (
                              <label className={`flex items-center gap-1.5 mt-1 text-[10px] font-bold cursor-pointer select-none ${
                                isVIP ? 'text-amber-700' : 'text-emerald-700'
                              }`}>
                                <input
                                  type="checkbox"
                                  checked={svc.withFilm ?? true}
                                  onChange={e => updateItem(idx, 'withFilm', e.target.checked)}
                                  className={`${isVIP ? 'accent-amber-600' : 'accent-emerald-600'} w-3 h-3 cursor-pointer`}
                                />
                                <span>{svc.withFilm ? 'مع فيلم' : 'بدون فيلم'} ({isVIP ? 'إعفاء VIP' : 'إعفاء مجاني'})</span>
                              </label>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex items-center ${getDeptBadgeClass(svc.svcType)}`}>
                              {svc.svcType === 'lab' ? 'مختبر' : svc.svcType === 'radiology' ? 'أشعة' : 'سريرية'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center text-slate-600 font-bold">
                            <div className="flex items-baseline justify-center gap-1" dir="ltr">
                              <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                              <span className="text-xs font-bold text-slate-700">{formatPrice(svc.price)}</span>
                            </div>
                          </td>
                          {/* Discount Stepper (+ / -) like Age Field in VIPCases — HIDDEN for VIP */}
                          {!isVIP && (
                            <td className="px-2 py-2 text-center">
                              <div className="relative flex items-center h-[30px] w-24 mx-auto bg-white border border-gray-200 rounded-xl overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all shadow-2xs group">
                                <button
                                  type="button"
                                  tabIndex="-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const current = parseInt(toEnglishDigits(svc.discount_percentage || 0), 10) || 0;
                                    const nextVal = Math.max(0, current - 5);
                                    updateItem(idx, 'discount_percentage', nextVal > 0 ? nextVal : '');
                                  }}
                                  disabled={svc.is_free || !(parseInt(toEnglishDigits(svc.discount_percentage || 0), 10) > 0)}
                                  className="w-7 h-full flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:pointer-events-none transition-colors shrink-0 cursor-pointer"
                                  title="إنقاص"
                                >
                                  <Minus size={13} strokeWidth={3} />
                                </button>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  dir="ltr"
                                  value={svc.discount_percentage && Number(svc.discount_percentage) > 0 ? toEnglishDigits(svc.discount_percentage) : ''}
                                  onChange={(e) => {
                                    const clean = toEnglishDigits(e.target.value).replace(/\D/g, '');
                                    if (clean === '' || parseInt(clean, 10) === 0) {
                                      updateItem(idx, 'discount_percentage', '');
                                    } else {
                                      updateItem(idx, 'discount_percentage', Math.min(100, Math.max(0, parseInt(clean, 10))));
                                    }
                                  }}
                                  disabled={svc.is_free}
                                  className="flex-1 w-full min-w-0 bg-transparent text-xs font-black text-slate-800 text-center focus:outline-none placeholder:text-slate-400 placeholder:font-black tracking-tight"
                                  placeholder="0"
                                />
                                <button
                                  type="button"
                                  tabIndex="-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const current = parseInt(toEnglishDigits(svc.discount_percentage || 0), 10) || 0;
                                    updateItem(idx, 'discount_percentage', Math.min(100, current + 5));
                                  }}
                                  disabled={svc.is_free || (parseInt(toEnglishDigits(svc.discount_percentage || 0), 10) || 0) >= 100}
                                  className="w-7 h-full flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:pointer-events-none transition-colors shrink-0 cursor-pointer"
                                  title="زيادة"
                                >
                                  <Plus size={13} strokeWidth={3} />
                                </button>
                              </div>
                            </td>
                          )}
                          {/* Free checkbox — HIDDEN for VIP */}
                          {!isVIP && (
                            <td className="px-2 py-2 text-center">
                              <label className="flex items-center justify-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={svc.is_free}
                                  onChange={e => updateItem(idx, 'is_free', e.target.checked)}
                                  className="accent-emerald-600 w-3.5 h-3.5 cursor-pointer"
                                />
                                <span className="text-[10px] font-black text-emerald-700">مجاني</span>
                              </label>
                            </td>
                          )}
                          {/* VIP badge instead */}
                          {isVIP && (
                            <td className="px-3 py-2 text-center">
                              <span className="text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200/60 px-2 py-0.5 rounded-lg inline-flex items-center gap-1">
                                <Crown size={9} className="fill-amber-400" /> إعفاء تلقائي
                              </span>
                            </td>
                          )}
                          <td className="px-3 py-2 text-center font-black">
                            {svc.is_free ? (
                              <span className="text-indigo-600 font-black text-xs">مجاني</span>
                            ) : (
                              <div className="flex items-baseline justify-center gap-1" dir="ltr">
                                <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                                <span className={`text-xs font-black ${svc.final_price < svc.price ? 'text-indigo-700' : 'text-slate-800'}`}>
                                  {formatPrice(svc.final_price)}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button 
                              type="button"
                              onClick={() => removeItem(idx)} 
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="حذف من السلة"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3 border-t border-slate-200 bg-white flex-shrink-0 z-20">
          <div className="text-right">
            {basket.length > 0 && (
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                {!isVIP ? (
                  <div className="flex items-center gap-2 sm:gap-2.5">
                    <span className={`${isMaximized ? 'text-sm' : 'text-xs sm:text-sm'} font-bold text-emerald-800`}>
                      الإجمالي النهائي:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`${isMaximized ? 'text-lg sm:text-xl' : 'text-base sm:text-lg'} font-black tracking-tight text-emerald-700`}>
                        {formatPrice(totalFinal)}
                      </span>
                      <span className={`${isMaximized ? 'text-xs' : 'text-[10px] sm:text-xs'} font-bold text-emerald-600`}>
                        ر.ي
                      </span>
                      {totalFinal > 0 && (
                        <span className={`${isMaximized ? 'text-sm mr-2 pr-2.5' : 'text-xs mr-1.5 pr-2'} font-bold text-emerald-700/70 border-r border-emerald-200/80 hidden md:inline-block`}>
                          {taffyot(totalFinal).replace(/(ريالاً يمنياً|ريال يمني|فقط|لا غير|-)/g, '').trim()} ريال يمني.
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm font-black text-indigo-700">
                    <Crown size={14} className="fill-indigo-400" />
                    <span>إجمالي المبلغ معفى بالكامل (مجاني)</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 sm:px-5 py-2 sm:py-2.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer active:scale-95 shadow-2xs"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || basket.length === 0}
              className="px-5 sm:px-6 py-2 sm:py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Save size={15} />
              <span>{submitting ? 'جاري الإرسال...' : 'إرسال الطلبات'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
