import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Package,
  AlertTriangle,
  RefreshCcw,
  Trash2,
  FileText,
  Info,
  Check,
  X,
  ChevronDown,
  Plus,
  Minus,
  Edit2,
  SlidersHorizontal,
  Power,
  Calendar
} from 'lucide-react';

// ── Shared Numeric & Decimal Helpers ─────────────────────────────────────────
export const toEnglishDigits = (val) =>
  String(val ?? '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٫,،]/g, '.');

export const sanitizeDecimalInput = (val) => {
  const normalized = toEnglishDigits(String(val ?? '').replace(/,/g, '')).replace(/[^0-9.]/g, '');
  const parts = normalized.split('.');
  if (parts.length <= 2) return normalized;
  return `${parts[0]}.${parts.slice(1).join('')}`;
};

export const formatQty = (val) => {
  const num = parseFloat(String(val ?? '').replace(/,/g, ''));
  if (isNaN(num)) return '0';
  return Number(num.toFixed(4)).toString();
};

export const formatPriceWithCommas = (val) => {
  if (val === null || val === undefined || val === '') return '';
  const rawStr = String(val).replace(/,/g, '');
  const clean = toEnglishDigits(rawStr).replace(/[^0-9.]/g, '');
  if (!clean) return '';
  const parts = clean.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
};

// ── Store Theme Configurations ───────────────────────────────────────────────
const STORE_THEMES = {
  lab: {
    storeName: 'مخزن المختبر',
    deptName: 'قسم المختبر',
    headerIconBg: 'from-purple-50 to-purple-100/80 text-purple-600 border-purple-200/60',
    adjustHeaderIconBg: 'from-purple-50 to-indigo-100/80 text-purple-700 border-purple-200/60',
    adjustSubtitleText: 'text-purple-700',
    labelIconBg: 'bg-purple-100/80 text-purple-600',
    calendarIcon: 'text-purple-600',
    inputFocus: 'focus:border-purple-500 focus:ring-2 focus:ring-purple-500/15',
    stepperFocus: 'focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500/15',
    stepperBtnHover: 'hover:text-purple-600 hover:bg-purple-50',
    dropdownActiveBorder: 'border-purple-500 ring-2 ring-purple-500/15',
    dropdownChevronActive: 'rotate-180 text-purple-500',
    dropdownItemSelected: 'bg-purple-50/90 text-purple-700 font-black border border-purple-200/60',
    dropdownCheck: 'text-purple-600',
    dropdownDotSelected: 'bg-purple-600',
    submitBtn: 'from-purple-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 shadow-purple-600/20',
    adjustResultCardBg: 'bg-purple-50/40 border-purple-200/70',
    adjustResultLabel: 'text-purple-700',
    adjustModeSetActive: 'bg-purple-50/90 border-purple-500 text-purple-900 ring-2 ring-purple-500/15 shadow-xs',
    adjustModeSetIconActive: 'bg-purple-600 text-white shadow-xs shadow-purple-600/25',
    adjustModeSetSubActive: 'text-purple-600',
    adjustReasonBorderFilled: 'border-purple-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/15',
    namePlaceholder: 'مثال: أنابيب سحب دم EDTA أو محلول CBC Diluent...',
    addSubtitle: 'تعريف محلول أو أنبوبة أو مستهلك جديد في مخزن المختبر مع ضبط حد الأمان للتنبيه'
  },
  radiology: {
    storeName: 'مخزن الأشعة',
    deptName: 'قسم الأشعة',
    headerIconBg: 'from-sky-50 to-sky-100/80 text-sky-600 border-sky-200/60',
    adjustHeaderIconBg: 'from-sky-50 to-indigo-100/80 text-sky-700 border-sky-200/60',
    adjustSubtitleText: 'text-sky-700',
    labelIconBg: 'bg-sky-100/80 text-sky-600',
    calendarIcon: 'text-sky-600',
    inputFocus: 'focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15',
    stepperFocus: 'focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/15',
    stepperBtnHover: 'hover:text-sky-600 hover:bg-sky-50',
    dropdownActiveBorder: 'border-sky-500 ring-2 ring-sky-500/15',
    dropdownChevronActive: 'rotate-180 text-sky-500',
    dropdownItemSelected: 'bg-sky-50/90 text-sky-700 font-black border border-sky-200/60',
    dropdownCheck: 'text-sky-600',
    dropdownDotSelected: 'bg-sky-600',
    submitBtn: 'from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 shadow-sky-600/20',
    adjustResultCardBg: 'bg-sky-50/40 border-sky-200/70',
    adjustResultLabel: 'text-sky-700',
    adjustModeSetActive: 'bg-sky-50/90 border-sky-500 text-sky-900 ring-2 ring-sky-500/15 shadow-xs',
    adjustModeSetIconActive: 'bg-sky-600 text-white shadow-xs shadow-sky-600/25',
    adjustModeSetSubActive: 'text-sky-600',
    adjustReasonBorderFilled: 'border-sky-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15',
    namePlaceholder: 'مثال: أفلام أشعة حجم كبير 14×17 أو مستهلكات طباعة...',
    addSubtitle: 'تعريف فيلم أو مستهلك جديد في مخزن الأشعة مع ضبط حد الأمان للتنبيه'
  }
};

const getDotColorClass = (optId) => {
  if (optId === 'reagent' || optId === 'large') return 'bg-indigo-500';
  if (optId === 'tube') return 'bg-purple-500';
  if (optId === 'small') return 'bg-sky-500';
  return 'bg-slate-400';
};

// ═════════════════════════════════════════════════════════════════════════════
// 1. UNIFIED ADD / EDIT INVENTORY ITEM MODAL
// ═════════════════════════════════════════════════════════════════════════════
export function InventoryItemModal({
  isOpen,
  onClose,
  storeType = 'lab',
  editingItem,
  itemForm,
  setItemForm,
  onSubmit,
  submitting = false,
  items = [],
  classificationOptions = [],
  classificationKey = 'category',
  unitOptions = []
}) {
  const theme = STORE_THEMES[storeType] || STORE_THEMES.lab;
  const [showClassMenu, setShowClassMenu] = useState(false);
  const [showUnitMenu, setShowUnitMenu] = useState(false);
  const [isUnitTyping, setIsUnitTyping] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShowClassMenu(false);
      setShowUnitMenu(false);
      setIsUnitTyping(false);
    }
  }, [isOpen, editingItem]);

  // All previous units used in inventory + standard unitOptions (deduplicated)
  const allAvailableUnits = useMemo(() => {
    const seen = new Set();
    const result = [];
    const addUnit = (u) => {
      const clean = String(u || '').trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(clean);
      }
    };
    items.forEach((it) => addUnit(it.unit));
    unitOptions.forEach((u) => addUnit(u));
    return result;
  }, [items, unitOptions]);

  // Smart unit options: show all previous units on click/focus, and filter immediately when typing
  const filteredUnitOptions = useMemo(() => {
    const q = String(itemForm?.unit || '').trim().toLowerCase();
    if (!isUnitTyping || !q) return allAvailableUnits;
    return allAvailableUnits.filter((u) => u.toLowerCase().includes(q));
  }, [allAvailableUnits, itemForm?.unit, isUnitTyping]);

  if (!isOpen) return null;

  const selectedClassificationValue = itemForm?.[classificationKey];
  const selectedClassificationLabel =
    classificationOptions.find((o) => o.id === selectedClassificationValue)?.label ||
    'مستهلك عام / أخرى';

  const handleCloseMenus = () => {
    setShowClassMenu(false);
    setShowUnitMenu(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99990] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-md animate-in fade-in duration-300"
      dir="rtl"
    >
      {/* Backdrop: Closes internal dropdown menus only, does NOT close the modal */}
      <div className="absolute inset-0" onClick={handleCloseMenus} />

      <div
        onClick={handleCloseMenus}
        className="relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-300 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.12)] w-full max-w-xl sm:max-w-2xl h-auto max-h-[92vh] rounded-[2rem] border border-white/60"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 sm:py-5 flex items-center justify-between bg-white border-b border-slate-100 z-20 flex-shrink-0">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${theme.headerIconBg} flex items-center justify-center shadow-inner border shrink-0`}
            >
              {editingItem ? <Edit2 size={20} strokeWidth={2.2} /> : <Plus size={20} strokeWidth={2.5} />}
            </div>
            <div>
              <h2 className="font-black text-slate-800 text-base sm:text-lg tracking-tight leading-snug">
                {editingItem ? 'تعديل بيانات الصنف' : `إضافة صنف جديد ل${theme.storeName}`}
              </h2>
              <p className="text-slate-500 font-semibold text-xs mt-0.5">
                {editingItem
                  ? 'تحديث اسم الصنف، وحدة القياس، السعر، حد الأمان، أو تاريخ الصلاحية'
                  : theme.addSubtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              handleCloseMenus();
              onClose();
            }}
            disabled={submitting}
            className="w-9 h-9 flex items-center justify-center bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 hover:border-rose-100 rounded-xl transition-all border border-slate-200/80 shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
            title="إغلاق النافذة"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={onSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar bg-slate-50/40 space-y-5">
            {/* Row 1: Item Name */}
            <div className="flex flex-col gap-2">
              <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2">
                <div className={`w-6 h-6 rounded-lg ${theme.labelIconBg} flex items-center justify-center`}>
                  <Package size={13} />
                </div>
                <span>اسم الصنف *</span>
              </label>
              <input
                type="text"
                required
                value={itemForm.name}
                onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                placeholder={theme.namePlaceholder}
                className={`w-full h-11 px-4 bg-white border border-slate-200/90 ${theme.inputFocus} rounded-2xl text-xs sm:text-sm font-bold text-slate-800 placeholder-slate-400 outline-none shadow-2xs transition-all`}
              />
            </div>

            {/* Row 2: Classification (Custom Dropdown) + Smart Unit Input */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              {/* Classification Dropdown */}
              <div
                className="sm:col-span-7 flex flex-col gap-2 relative"
                onClick={(e) => e.stopPropagation()}
              >
                <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2 h-6">
                  <span>تصنيف الصنف في النظام</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowClassMenu((prev) => !prev);
                    setShowUnitMenu(false);
                  }}
                  className={`w-full h-11 px-3.5 bg-white border rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-between gap-2 shadow-2xs transition-all cursor-pointer ${
                    showClassMenu
                      ? theme.dropdownActiveBorder
                      : 'border-slate-200/90 hover:border-slate-300'
                  }`}
                >
                  <span className="font-black text-slate-800 truncate">
                    {selectedClassificationLabel}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 shrink-0 transition-transform duration-200 ${
                      showClassMenu ? theme.dropdownChevronActive : ''
                    }`}
                  />
                </button>

                {showClassMenu && (
                  <div className="absolute right-0 left-0 top-full mt-1.5 bg-white border border-slate-200/90 rounded-2xl shadow-[0_12px_32px_rgba(15,23,42,0.12)] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                    {classificationOptions.map((opt) => {
                      const isSelected = selectedClassificationValue === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setItemForm({
                              ...itemForm,
                              [classificationKey]: opt.id
                            });
                            setShowClassMenu(false);
                          }}
                          className={`w-full px-3 py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-2 transition-all cursor-pointer mb-0.5 last:mb-0 ${
                            isSelected
                              ? theme.dropdownItemSelected
                              : 'text-slate-700 font-bold hover:bg-slate-50 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${getDotColorClass(opt.id)}`}
                            />
                            <span className="truncate">{opt.label}</span>
                          </div>
                          {isSelected && <Check size={14} className={`${theme.dropdownCheck} shrink-0`} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Smart Unit Input (All Previous Units on Click + Instant Filtering on Type) */}
              <div
                className="sm:col-span-5 flex flex-col gap-2 relative"
                onClick={(e) => e.stopPropagation()}
              >
                <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2 h-6">
                  <span>وحدة القياس *</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    required
                    value={itemForm.unit}
                    onClick={() => {
                      setIsUnitTyping(false);
                      setShowUnitMenu(true);
                      setShowClassMenu(false);
                    }}
                    onFocus={() => {
                      setIsUnitTyping(false);
                      setShowUnitMenu(true);
                      setShowClassMenu(false);
                    }}
                    onChange={(e) => {
                      setItemForm({ ...itemForm, unit: e.target.value });
                      setIsUnitTyping(true);
                      setShowUnitMenu(true);
                      setShowClassMenu(false);
                    }}
                    placeholder="اضغط للاختيار أو اكتب للبحث..."
                    className={`w-full h-11 pr-4 pl-10 bg-white border rounded-2xl text-xs sm:text-sm font-black text-slate-800 placeholder-slate-400 outline-none shadow-2xs transition-all ${
                      showUnitMenu
                        ? theme.dropdownActiveBorder
                        : `border-slate-200/90 ${theme.inputFocus}`
                    }`}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      setIsUnitTyping(false);
                      setShowUnitMenu((prev) => !prev);
                      setShowClassMenu(false);
                    }}
                    className={`absolute left-1.5 w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 ${theme.stepperBtnHover} transition-colors cursor-pointer`}
                    title="عرض قائمة وحدات القياس"
                  >
                    <ChevronDown
                      size={16}
                      className={`transition-transform duration-200 ${
                        showUnitMenu ? theme.dropdownChevronActive : ''
                      }`}
                    />
                  </button>
                </div>

                {showUnitMenu && filteredUnitOptions.length > 0 && (
                  <div className="absolute right-0 left-0 top-full mt-1.5 bg-white border border-slate-200/90 rounded-2xl shadow-[0_12px_32px_rgba(15,23,42,0.12)] p-1.5 z-50 max-h-52 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
                    {filteredUnitOptions.map((unitOpt) => {
                      const isSelected =
                        String(itemForm.unit || '').trim().toLowerCase() ===
                        unitOpt.toLowerCase();
                      return (
                        <button
                          key={unitOpt}
                          type="button"
                          onClick={() => {
                            setItemForm({ ...itemForm, unit: unitOpt });
                            setIsUnitTyping(false);
                            setShowUnitMenu(false);
                          }}
                          className={`w-full px-3 py-2 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-2 transition-all cursor-pointer mb-0.5 last:mb-0 ${
                            isSelected
                              ? theme.dropdownItemSelected
                              : 'text-slate-700 font-bold hover:bg-slate-50 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                isSelected ? theme.dropdownDotSelected : 'bg-slate-300'
                              }`}
                            />
                            <span className="truncate">{unitOpt}</span>
                          </div>
                          {isSelected && <Check size={14} className={`${theme.dropdownCheck} shrink-0`} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Row 3: Initial Quantity (When Creating) + Price (cost_price) + Safety Limit (min_quantity) + Expiry Date */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              {!editingItem && (
                <div className="sm:col-span-6 flex flex-col gap-2">
                  <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2 h-6">
                    <span>الرصيد الافتتاحي</span>
                  </label>
                  <div
                    className={`relative flex items-center h-11 bg-white border border-slate-200/90 rounded-2xl overflow-hidden ${theme.stepperFocus} transition-all shadow-2xs group`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        const cur = parseFloat(toEnglishDigits(itemForm.quantity)) || 0;
                        setItemForm({ ...itemForm, quantity: formatQty(Math.max(0, cur - 1)) });
                      }}
                      disabled={(parseFloat(toEnglishDigits(itemForm.quantity)) || 0) <= 0}
                      className={`w-10 h-full flex items-center justify-center text-slate-400 ${theme.stepperBtnHover} transition-colors cursor-pointer shrink-0 disabled:opacity-35 disabled:pointer-events-none`}
                      title="إنقاص"
                    >
                      <Minus size={14} strokeWidth={3} />
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      lang="en"
                      dir="ltr"
                      value={toEnglishDigits(itemForm.quantity)}
                      onChange={(e) => {
                        const raw = sanitizeDecimalInput(e.target.value);
                        setItemForm({ ...itemForm, quantity: raw });
                      }}
                      onBlur={() => {
                        const num = parseFloat(toEnglishDigits(itemForm.quantity));
                        setItemForm({
                          ...itemForm,
                          quantity: isNaN(num) || num < 0 ? '0' : formatQty(num)
                        });
                      }}
                      className="flex-1 w-full min-w-0 bg-transparent text-sm font-black text-slate-700 text-center focus:outline-none tabular-nums"
                      placeholder="0"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const cur = parseFloat(toEnglishDigits(itemForm.quantity)) || 0;
                        setItemForm({ ...itemForm, quantity: formatQty(cur + 1) });
                      }}
                      className={`w-10 h-full flex items-center justify-center text-slate-400 ${theme.stepperBtnHover} transition-colors cursor-pointer shrink-0`}
                      title="زيادة"
                    >
                      <Plus size={14} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              )}

              {/* Unit Price (cost_price): Optional on Add, Mandatory > 0 on Edit */}
              <div className={`${editingItem ? 'sm:col-span-4' : 'sm:col-span-6'} flex flex-col gap-2`}>
                <div className="flex items-center justify-between h-6">
                  <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-1.5">
                    <span>سعر الصنف</span>
                  </label>
                  {!editingItem && (
                    <span className="text-[11px] font-bold text-slate-400">اختياري</span>
                  )}
                </div>
                <div
                  className={`relative flex items-center h-11 bg-white border border-slate-200/90 rounded-2xl overflow-hidden ${theme.stepperFocus} transition-all shadow-2xs group`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      const cur = parseFloat(toEnglishDigits(String(itemForm.cost_price ?? '').replace(/,/g, ''))) || 0;
                      const minVal = editingItem ? 1 : 0;
                      const nextVal = Math.max(minVal, cur - 1);
                      setItemForm({
                        ...itemForm,
                        cost_price: !editingItem && nextVal === 0 ? '' : formatQty(nextVal)
                      });
                    }}
                    disabled={
                      (parseFloat(toEnglishDigits(String(itemForm.cost_price ?? '').replace(/,/g, ''))) || 0) <=
                      (editingItem ? 1 : 0)
                    }
                    className={`w-10 h-full flex items-center justify-center text-slate-400 ${theme.stepperBtnHover} transition-colors cursor-pointer shrink-0 disabled:opacity-35 disabled:pointer-events-none`}
                    title="إنقاص"
                  >
                    <Minus size={14} strokeWidth={3} />
                  </button>
                  <div className="flex-1 relative flex items-center justify-center h-full min-w-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      lang="en"
                      dir="ltr"
                      required={!!editingItem}
                      value={formatPriceWithCommas(itemForm.cost_price)}
                      onChange={(e) => {
                        const raw = sanitizeDecimalInput(e.target.value);
                        setItemForm({ ...itemForm, cost_price: raw });
                      }}
                      onBlur={() => {
                        const rawStr = String(itemForm.cost_price ?? '').replace(/,/g, '').trim();
                        if (!rawStr) {
                          setItemForm({ ...itemForm, cost_price: '' });
                          return;
                        }
                        const num = parseFloat(toEnglishDigits(rawStr));
                        if (isNaN(num) || num < 0 || (!editingItem && num === 0)) {
                          setItemForm({ ...itemForm, cost_price: '' });
                        } else {
                          setItemForm({ ...itemForm, cost_price: formatQty(num) });
                        }
                      }}
                      className="w-full h-full bg-transparent text-sm font-black text-slate-700 text-center focus:outline-none tabular-nums"
                      placeholder="0"
                    />
                    <span className="absolute left-1 sm:left-2 text-[10px] font-black text-slate-400 pointer-events-none select-none">
                      ر.ي
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = parseFloat(toEnglishDigits(String(itemForm.cost_price ?? '').replace(/,/g, ''))) || 0;
                      setItemForm({ ...itemForm, cost_price: formatQty(cur + 1) });
                    }}
                    className={`w-10 h-full flex items-center justify-center text-slate-400 ${theme.stepperBtnHover} transition-colors cursor-pointer shrink-0`}
                    title="زيادة"
                  >
                    <Plus size={14} strokeWidth={3} />
                  </button>
                </div>
              </div>

              {/* Safety Limit (min_quantity) */}
              <div className={`${editingItem ? 'sm:col-span-4' : 'sm:col-span-6'} flex flex-col gap-2`}>
                <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2 h-6">
                  <span>حد الأمان (التنبيه)</span>
                </label>
                <div
                  className={`relative flex items-center h-11 bg-white border border-slate-200/90 rounded-2xl overflow-hidden ${theme.stepperFocus} transition-all shadow-2xs group`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      const cur = parseFloat(toEnglishDigits(itemForm.min_quantity)) || 0;
                      setItemForm({ ...itemForm, min_quantity: formatQty(Math.max(0, cur - 1)) });
                    }}
                    disabled={(parseFloat(toEnglishDigits(itemForm.min_quantity)) || 0) <= 0}
                    className={`w-10 h-full flex items-center justify-center text-slate-400 ${theme.stepperBtnHover} transition-colors cursor-pointer shrink-0 disabled:opacity-35 disabled:pointer-events-none`}
                    title="إنقاص"
                  >
                    <Minus size={14} strokeWidth={3} />
                  </button>
                  <input
                    type="text"
                    inputMode="decimal"
                    lang="en"
                    dir="ltr"
                    value={toEnglishDigits(itemForm.min_quantity)}
                    onChange={(e) => {
                      const raw = sanitizeDecimalInput(e.target.value);
                      setItemForm({ ...itemForm, min_quantity: raw });
                    }}
                    onBlur={() => {
                      const num = parseFloat(toEnglishDigits(itemForm.min_quantity));
                      setItemForm({
                        ...itemForm,
                        min_quantity: isNaN(num) || num < 0 ? '0' : formatQty(num)
                      });
                    }}
                    className="flex-1 w-full min-w-0 bg-transparent text-sm font-black text-slate-700 text-center focus:outline-none tabular-nums"
                    placeholder="5"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const cur = parseFloat(toEnglishDigits(itemForm.min_quantity)) || 0;
                      setItemForm({ ...itemForm, min_quantity: formatQty(cur + 1) });
                    }}
                    className={`w-10 h-full flex items-center justify-center text-slate-400 ${theme.stepperBtnHover} transition-colors cursor-pointer shrink-0`}
                    title="زيادة"
                  >
                    <Plus size={14} strokeWidth={3} />
                  </button>
                </div>
              </div>

              {/* Expiry Date */}
              <div className={`${editingItem ? 'sm:col-span-4' : 'sm:col-span-6'} flex flex-col gap-2`}>
                <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2 h-6">
                  <Calendar size={14} className={theme.calendarIcon} />
                  <span>تاريخ الصلاحية (اختياري)</span>
                </label>
                <input
                  type="date"
                  value={itemForm.expiry_date}
                  onChange={(e) => setItemForm({ ...itemForm, expiry_date: e.target.value })}
                  className={`w-full h-11 px-3.5 bg-white border border-slate-200/90 ${theme.inputFocus} rounded-2xl text-xs sm:text-sm font-bold text-slate-800 outline-none shadow-2xs transition-all cursor-pointer`}
                />
              </div>
            </div>

            {/* Row 4: Description */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-lg ${theme.labelIconBg} flex items-center justify-center`}>
                    <FileText size={13} />
                  </div>
                  <span>وصف أو ملاحظات الصنف</span>
                </label>
                <span className="text-[11px] font-bold text-slate-400">اختياري</span>
              </div>
              <textarea
                rows={2}
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                placeholder="أضف أي مواصفات فنية أو ملاحظات حول الصنف..."
                className={`w-full bg-white shadow-2xs rounded-2xl p-3.5 text-slate-700 font-semibold text-xs sm:text-sm leading-relaxed focus:outline-none border border-slate-200/90 ${theme.inputFocus} transition-all resize-none placeholder-slate-400`}
              />
            </div>
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-end gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                handleCloseMenus();
                onClose();
              }}
              disabled={submitting}
              className="px-5 sm:px-6 py-2.5 rounded-xl font-black text-xs sm:text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-6 sm:px-7 py-2.5 bg-gradient-to-r ${theme.submitBtn} text-white rounded-xl font-black text-xs sm:text-sm transition-all flex items-center gap-2 shadow-md active:scale-95 disabled:opacity-50 cursor-pointer`}
            >
              {submitting ? (
                <RefreshCcw size={15} className="animate-spin" />
              ) : (
                <Check size={15} strokeWidth={2.5} />
              )}
              <span>{editingItem ? 'حفظ التعديلات' : 'إضافة الصنف للمخزن'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. UNIFIED STOCK ADJUSTMENT MODAL
// ═════════════════════════════════════════════════════════════════════════════
export function StockAdjustmentModal({
  adjustingItem,
  onClose,
  storeType = 'lab',
  adjustForm,
  setAdjustForm,
  onSubmit,
  submitting = false
}) {
  const theme = STORE_THEMES[storeType] || STORE_THEMES.lab;

  if (!adjustingItem) return null;

  const curQty = parseFloat(adjustingItem.quantity) || 0;
  const rawQtyStr = toEnglishDigits(adjustForm.quantity ?? '').trim();
  const hasQtyInput = rawQtyStr !== '' && !isNaN(parseFloat(rawQtyStr));
  const inputVal = hasQtyInput ? parseFloat(rawQtyStr) : 0;
  const resultingQty = !hasQtyInput
    ? curQty
    : Number(
        (
          adjustForm.mode === 'add'
            ? curQty + inputVal
            : adjustForm.mode === 'deduct'
            ? curQty - inputVal
            : inputVal
        ).toFixed(4)
      );
  const diffQty = Number((resultingQty - curQty).toFixed(4));

  return createPortal(
    <div
      className="fixed inset-0 z-[99990] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-md animate-in fade-in duration-300"
      dir="rtl"
    >
      {/* Backdrop: Does NOT close modal on click */}
      <div className="absolute inset-0" />

      <div className="relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-300 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.12)] w-full max-w-xl rounded-[2rem] border border-white/60">
        {/* Header */}
        <div className="px-6 py-4 sm:py-5 flex items-center justify-between bg-white border-b border-slate-100 z-20 flex-shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${theme.adjustHeaderIconBg} flex items-center justify-center shadow-inner border shrink-0`}
            >
              <SlidersHorizontal size={20} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h2 className="font-black text-slate-800 text-base sm:text-lg tracking-tight leading-snug">
                تسوية وتعديل رصيد الصنف
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <p className={`${theme.adjustSubtitleText} font-extrabold text-xs sm:text-sm truncate`}>
                  {adjustingItem.name}
                </p>
                {adjustingItem.unit && (
                  <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200/70 shrink-0">
                    {adjustingItem.unit}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="w-9 h-9 flex items-center justify-center bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 hover:border-rose-100 rounded-xl transition-all border border-slate-200/80 shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50 shrink-0"
            title="إغلاق النافذة"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-5 sm:p-6 bg-slate-50/40 space-y-5">
            {/* Current vs Resulting Balance Summary Cards */}
            <div className="grid grid-cols-2 gap-3.5">
              {/* Current Balance Card */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between">
                <span className="text-xs font-extrabold text-slate-500 block">
                  الرصيد الحالي بالنظام
                </span>
                <div className="flex items-baseline gap-1.5 mt-2">
                  <span
                    dir="ltr"
                    className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight tabular-nums"
                  >
                    {formatQty(curQty)}
                  </span>
                  <span className="text-xs font-bold text-slate-400">
                    {adjustingItem.unit || 'وحدة'}
                  </span>
                </div>
              </div>

              {/* Resulting Balance Card */}
              <div
                className={`p-4 rounded-2xl border shadow-2xs flex flex-col justify-between transition-colors ${
                  resultingQty < 0
                    ? 'bg-rose-50/50 border-rose-200/80'
                    : theme.adjustResultCardBg
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-xs font-extrabold ${theme.adjustResultLabel}`}>
                    الرصيد بعد التسوية
                  </span>
                  {diffQty !== 0 && (
                    <span
                      dir="ltr"
                      className={`text-[11px] font-black px-2 py-0.5 rounded-lg border ${
                        diffQty > 0
                          ? 'bg-emerald-100/80 text-emerald-700 border-emerald-200'
                          : 'bg-rose-100/80 text-rose-700 border-rose-200'
                      }`}
                    >
                      {diffQty > 0 ? `+${formatQty(diffQty)}` : formatQty(diffQty)}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5 mt-2">
                  <span
                    dir="ltr"
                    className={`text-xl sm:text-2xl font-black tracking-tight tabular-nums ${
                      resultingQty < 0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    {formatQty(resultingQty)}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    {adjustingItem.unit || 'وحدة'}
                  </span>
                </div>
              </div>
            </div>

            {/* Redesigned Adjustment Mode Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2 h-6">
                <div className={`w-6 h-6 rounded-lg ${theme.labelIconBg} flex items-center justify-center`}>
                  <SlidersHorizontal size={13} />
                </div>
                <span>نوع عملية التعديل</span>
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  {
                    id: 'set',
                    label: 'الرصيد الفعلي',
                    sub: 'تعيين رصيد جديد',
                    icon: SlidersHorizontal,
                    activeCard: theme.adjustModeSetActive,
                    activeIcon: theme.adjustModeSetIconActive,
                    activeSub: theme.adjustModeSetSubActive
                  },
                  {
                    id: 'add',
                    label: 'إضافة كمية',
                    sub: 'توريد / زيادة (+)',
                    icon: Plus,
                    activeCard: 'bg-emerald-50/90 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/15 shadow-xs',
                    activeIcon: 'bg-emerald-600 text-white shadow-xs shadow-emerald-600/25',
                    activeSub: 'text-emerald-600'
                  },
                  {
                    id: 'deduct',
                    label: 'خصم كمية',
                    sub: 'صرف / إنقاص (-)',
                    icon: Minus,
                    activeCard: 'bg-rose-50/90 border-rose-500 text-rose-900 ring-2 ring-rose-500/15 shadow-xs',
                    activeIcon: 'bg-rose-600 text-white shadow-xs shadow-rose-600/25',
                    activeSub: 'text-rose-600'
                  }
                ].map((m) => {
                  const IconComp = m.icon;
                  const isActive = adjustForm.mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        setAdjustForm({
                          ...adjustForm,
                          mode: m.id,
                          quantity: ''
                        })
                      }
                      className={`p-2.5 sm:px-3 sm:py-2.5 rounded-2xl border transition-all cursor-pointer flex items-center gap-2.5 text-right ${
                        isActive
                          ? m.activeCard
                          : 'bg-white border-slate-200/90 text-slate-700 hover:border-slate-300 hover:bg-slate-50/80 shadow-2xs'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                          isActive ? m.activeIcon : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <IconComp size={15} strokeWidth={2.6} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black leading-tight truncate">{m.label}</div>
                        <div
                          className={`text-[10px] font-bold mt-0.5 truncate ${
                            isActive ? m.activeSub : 'text-slate-400'
                          }`}
                        >
                          {m.sub}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quantity Stepper Row */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between h-6">
                <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2">
                  <span>
                    {adjustForm.mode === 'set'
                      ? 'الرصيد الفعلي الجديد'
                      : adjustForm.mode === 'add'
                      ? 'الكمية المراد إضافتها'
                      : 'الكمية المراد خصمها'}
                  </span>
                </label>
                {adjustingItem.unit && (
                  <span className="text-[11px] font-bold text-slate-400">
                    الوحدة: {adjustingItem.unit}
                  </span>
                )}
              </div>
              <div
                className={`relative flex items-center h-11 bg-white border border-slate-200/90 rounded-2xl overflow-hidden ${theme.stepperFocus} transition-all shadow-2xs group`}
              >
                <button
                  type="button"
                  onClick={() => {
                    const baseVal = hasQtyInput
                      ? inputVal
                      : adjustForm.mode === 'set'
                      ? curQty
                      : 0;
                    const minAllowed = adjustForm.mode === 'set' ? -9999 : 0;
                    const nextVal = Math.max(minAllowed, baseVal - 1);
                    setAdjustForm({
                      ...adjustForm,
                      quantity: adjustForm.mode !== 'set' && nextVal <= 0 ? '' : formatQty(nextVal)
                    });
                  }}
                  disabled={adjustForm.mode !== 'set' && (!hasQtyInput || inputVal <= 0)}
                  className={`w-11 h-full flex items-center justify-center text-slate-400 ${theme.stepperBtnHover} transition-colors cursor-pointer shrink-0 disabled:opacity-35 disabled:pointer-events-none`}
                  title="إنقاص"
                >
                  <Minus size={14} strokeWidth={3} />
                </button>

                <input
                  type="text"
                  inputMode="decimal"
                  lang="en"
                  dir="ltr"
                  value={toEnglishDigits(adjustForm.quantity ?? '')}
                  onChange={(e) => {
                    const raw = toEnglishDigits(e.target.value).replace(/[^0-9.-]/g, '');
                    setAdjustForm({ ...adjustForm, quantity: raw });
                  }}
                  onBlur={() => {
                    const trimmed = toEnglishDigits(adjustForm.quantity ?? '').trim();
                    if (!trimmed) {
                      setAdjustForm({ ...adjustForm, quantity: '' });
                      return;
                    }
                    const num = parseFloat(trimmed);
                    if (isNaN(num)) {
                      setAdjustForm({ ...adjustForm, quantity: '' });
                    } else if (adjustForm.mode !== 'set' && num <= 0) {
                      setAdjustForm({ ...adjustForm, quantity: '' });
                    } else {
                      setAdjustForm({ ...adjustForm, quantity: formatQty(num) });
                    }
                  }}
                  className="flex-1 w-full min-w-0 bg-transparent text-sm font-black text-slate-700 text-center focus:outline-none tabular-nums"
                  placeholder="0"
                />

                <button
                  type="button"
                  onClick={() => {
                    const baseVal = hasQtyInput
                      ? inputVal
                      : adjustForm.mode === 'set'
                      ? curQty
                      : 0;
                    setAdjustForm({ ...adjustForm, quantity: formatQty(baseVal + 1) });
                  }}
                  className={`w-11 h-full flex items-center justify-center text-slate-400 ${theme.stepperBtnHover} transition-colors cursor-pointer shrink-0`}
                  title="زيادة"
                >
                  <Plus size={14} strokeWidth={3} />
                </button>
              </div>
            </div>

            {/* Mandatory Reason / Note */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-lg ${theme.labelIconBg} flex items-center justify-center`}>
                    <FileText size={13} />
                  </div>
                  <span>سبب التسوية / ملاحظة</span>
                </label>
                <span className="text-[11px] font-black text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200/70">
                  إجباري *
                </span>
              </div>
              <input
                type="text"
                required
                value={adjustForm.reason}
                onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                placeholder="يرجى كتابة سبب التسوية (مثال: جرد فعلي ومطابقة رصيد القسم)..."
                className={`w-full h-11 px-4 bg-white border rounded-2xl text-xs sm:text-sm font-bold text-slate-800 outline-none shadow-2xs transition-all placeholder-slate-400 ${
                  !adjustForm.reason.trim()
                    ? `border-slate-200/90 ${theme.inputFocus}`
                    : theme.adjustReasonBorderFilled
                }`}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 sm:px-6 py-2.5 rounded-xl font-black text-xs sm:text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-6 sm:px-7 py-2.5 bg-gradient-to-r ${theme.submitBtn} text-white rounded-xl font-black text-xs sm:text-sm transition-all flex items-center gap-2 shadow-md active:scale-95 disabled:opacity-50 cursor-pointer`}
            >
              {submitting ? (
                <RefreshCcw size={15} className="animate-spin" />
              ) : (
                <Check size={15} strokeWidth={2.5} />
              )}
              <span>اعتماد تسوية الرصيد</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. UNIFIED DELETE / TOGGLE ACTIVE CONFIRMATION MODAL
// ═════════════════════════════════════════════════════════════════════════════
export function DeleteOrToggleItemModal({
  deletingItem,
  onClose,
  storeType = 'lab',
  onConfirm,
  submitting = false
}) {
  const theme = STORE_THEMES[storeType] || STORE_THEMES.lab;

  if (!deletingItem) return null;

  const qty = parseFloat(deletingItem.quantity) || 0;
  const isActive = Number(deletingItem.is_active) !== 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[99990] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-in fade-in duration-200"
      dir="rtl"
    >
      {/* Backdrop: Does NOT close modal on click */}
      <div className="absolute inset-0" />

      <div className="relative z-10 bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3.5">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              isActive
                ? 'bg-rose-50 text-rose-600 border border-rose-200/60'
                : 'bg-emerald-50 text-emerald-600 border border-emerald-200/60'
            }`}
          >
            {isActive ? <Trash2 size={22} /> : <Power size={22} />}
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-base">
              {isActive ? 'تأكيد حذف / إيقاف الصنف' : 'إعادة تفعيل الصنف'}
            </h3>
            <p className="text-xs font-bold text-slate-500 mt-0.5">{deletingItem.name}</p>
          </div>
        </div>

        {!isActive ? (
          <p className="text-xs font-semibold text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-200/60">
            سيتم إعادة تفعيل هذا الصنف ليظهر مجدداً ضمن قائمة أصناف {theme.deptName} النشطة.
          </p>
        ) : qty !== 0 ? (
          <div className="bg-amber-50 border border-amber-200/70 rounded-2xl p-3.5 space-y-1.5">
            <p className="text-xs font-black text-amber-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              لا يمكن حذف هذا الصنف حالياً
            </p>
            <p className="text-xs font-semibold text-amber-700 leading-relaxed">
              يحتوي المخزون حالياً على{' '}
              <span className="font-black" dir="ltr">
                {formatQty(qty)}
              </span>{' '}
              {deletingItem.unit || 'وحدة'} من هذا الصنف. يجب تصفير الرصيد أولاً عبر{' '}
              <strong>تسوية الرصيد</strong> ثم إعادة المحاولة.
            </p>
          </div>
        ) : (
          <p className="text-xs font-semibold text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-200/60">
            سيتم حذف الصنف نهائياً إذا لم يكن مرتبطاً بحركات سابقة، أو إيقاف تنشيطه تلقائياً للحفاظ على سلامة سجل الاستهلاك والشحنات.
          </p>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl text-xs font-black text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            {qty !== 0 && isActive ? 'إغلاق' : 'إلغاء'}
          </button>
          {(qty === 0 || !isActive) && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={submitting}
              className={`px-6 py-2.5 rounded-xl text-xs font-black text-white flex items-center gap-2 shadow-sm transition-all cursor-pointer ${
                isActive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {submitting && <RefreshCcw size={14} className="animate-spin" />}
              <span>{isActive ? 'تأكيد الحذف / الإيقاف' : 'تأكيد التفعيل'}</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. UNIFIED MANUAL WASTAGE / DAMAGE LOGGING MODAL
// ═════════════════════════════════════════════════════════════════════════════
export function InventoryWastageModal({
  isOpen,
  onClose,
  storeType = 'lab',
  items = [],
  activeItemsList = [],
  wastageForm,
  setWastageForm,
  wastageReasons = [],
  onSubmit,
  submitting = false
}) {
  const theme = STORE_THEMES[storeType] || STORE_THEMES.lab;
  const [showItemMenu, setShowItemMenu] = useState(false);
  const [showReasonMenu, setShowReasonMenu] = useState(false);

  const availableItems = useMemo(() => {
    const source = activeItemsList && activeItemsList.length > 0 ? activeItemsList : items;
    return (source || []).filter((it) => Number(it.is_active ?? 1) !== 0);
  }, [activeItemsList, items]);

  useEffect(() => {
    if (isOpen) {
      setShowItemMenu(false);
      setShowReasonMenu(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedItem = availableItems.find((it) => String(it.id) === String(wastageForm.item_id));
  const selectedQty = selectedItem ? formatQty(selectedItem.quantity) : '0';

  const handleCloseMenus = () => {
    setShowItemMenu(false);
    setShowReasonMenu(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99990] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-md animate-in fade-in duration-300"
      dir="rtl"
    >
      {/* Backdrop: Closes internal dropdown menus only, does NOT close the modal */}
      <div className="absolute inset-0" onClick={handleCloseMenus} />

      <div
        onClick={handleCloseMenus}
        className="relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-300 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.12)] w-full max-w-xl sm:max-w-2xl h-auto max-h-[90vh] rounded-[2rem] border border-white/60"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 sm:py-5 flex items-center justify-between bg-white border-b border-slate-100 z-20 flex-shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-50 to-rose-100/80 text-rose-600 flex items-center justify-center shadow-inner border border-rose-200/60 shrink-0">
              <Trash2 size={20} strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="font-black text-slate-800 text-base sm:text-lg tracking-tight leading-snug">
                تسجيل هدر / إتلاف أصناف
              </h2>
              <p className="text-slate-500 font-semibold text-xs mt-0.5">
                خصم الكميات التالفة من {theme.storeName} وتوثيقها في سجل الاستهلاك
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              handleCloseMenus();
              onClose();
            }}
            disabled={submitting}
            className="w-9 h-9 flex items-center justify-center bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 hover:border-rose-100 rounded-xl transition-all border border-slate-200/80 shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
            title="إغلاق النافذة"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={onSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar bg-slate-50/40 space-y-5">
            {/* Row 1: Select Item + Damaged Quantity */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              {/* Select Single Item */}
              <div
                className="sm:col-span-8 flex flex-col gap-2 relative"
                onClick={(e) => e.stopPropagation()}
              >
                <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2 h-6">
                  <div className="w-6 h-6 rounded-lg bg-rose-100/80 text-rose-600 flex items-center justify-center">
                    <Package size={13} />
                  </div>
                  <span>الصنف المراد خصمه</span>
                </label>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowItemMenu((prev) => !prev);
                      setShowReasonMenu(false);
                    }}
                    className={`w-full h-11 px-3.5 bg-white border rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-between gap-2 shadow-2xs transition-all cursor-pointer ${
                      showItemMenu
                        ? 'border-rose-500 ring-2 ring-rose-500/15'
                        : 'border-slate-200/90 hover:border-slate-300'
                    }`}
                  >
                    {selectedItem ? (
                      <div className="flex items-center justify-between w-full gap-2 min-w-0">
                        <span className="font-black text-slate-800 truncate">
                          {selectedItem.name}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500 bg-slate-100/90 px-2 py-0.5 rounded-lg border border-slate-200/70 shrink-0">
                          الكمية:{' '}
                          <span dir="ltr" className="font-black text-slate-700">
                            {selectedQty}
                          </span>{' '}
                          {selectedItem.unit || ''}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 font-bold">-- اختر الصنف --</span>
                    )}
                    <ChevronDown
                      size={16}
                      className={`text-slate-400 shrink-0 transition-transform duration-200 ${
                        showItemMenu ? 'rotate-180 text-rose-500' : ''
                      }`}
                    />
                  </button>

                  {showItemMenu && (
                    <div className="absolute right-0 left-0 top-full mt-1.5 bg-white border border-slate-200/90 rounded-2xl shadow-[0_12px_32px_rgba(15,23,42,0.12)] p-1.5 z-50 max-h-52 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
                      {availableItems.length === 0 ? (
                        <div className="py-4 text-center text-xs font-bold text-slate-400">
                          لا توجد أصناف نشطة في المخزن
                        </div>
                      ) : (
                        availableItems.map((it) => {
                          const isSelected = String(it.id) === String(wastageForm.item_id);
                          const numQty = parseFloat(it.quantity) || 0;
                          return (
                            <button
                              key={it.id}
                              type="button"
                              onClick={() => {
                                setWastageForm({ ...wastageForm, item_id: String(it.id) });
                                setShowItemMenu(false);
                              }}
                              className={`w-full px-3 py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-2 transition-all cursor-pointer mb-0.5 last:mb-0 ${
                                isSelected
                                  ? 'bg-rose-50/90 text-rose-700 font-black border border-rose-200/60'
                                  : 'text-slate-700 font-bold hover:bg-slate-50 border border-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                    isSelected
                                      ? 'bg-rose-500'
                                      : numQty <= 0
                                      ? 'bg-rose-400'
                                      : 'bg-emerald-400'
                                  }`}
                                />
                                <span className="truncate">{it.name}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${
                                    numQty <= 0
                                      ? 'bg-rose-50 text-rose-600 border-rose-200/60'
                                      : isSelected
                                      ? 'bg-white text-rose-700 border-rose-200/70'
                                      : 'bg-slate-100/80 text-slate-600 border-slate-200/60'
                                  }`}
                                >
                                  الكمية:{' '}
                                  <span dir="ltr" className="font-black">
                                    {formatQty(numQty)}
                                  </span>{' '}
                                  {it.unit || ''}
                                </span>
                                {isSelected && <Check size={14} className="text-rose-600 shrink-0" />}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Damaged Quantity (Decimal Stepper) */}
              <div className="sm:col-span-4 flex flex-col gap-2">
                <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2 h-6">
                  <span>الكمية التالفة</span>
                </label>
                <div className="relative flex items-center h-11 bg-white border border-slate-200/90 rounded-2xl overflow-hidden focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-500/15 transition-all shadow-2xs group">
                  <button
                    type="button"
                    onClick={() => {
                      const current = parseFloat(toEnglishDigits(wastageForm.quantity)) || 0;
                      const next =
                        current <= 1
                          ? Number((current - 0.1).toFixed(4))
                          : Number((current - 1).toFixed(4));
                      setWastageForm({
                        ...wastageForm,
                        quantity: next <= 0 ? '' : formatQty(next)
                      });
                    }}
                    disabled={(parseFloat(toEnglishDigits(wastageForm.quantity)) || 0) <= 0}
                    className="w-10 h-full flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0 disabled:opacity-35 disabled:pointer-events-none"
                    title="إنقاص"
                  >
                    <Minus size={14} strokeWidth={3} />
                  </button>

                  <input
                    type="text"
                    inputMode="decimal"
                    lang="en"
                    dir="ltr"
                    value={toEnglishDigits(wastageForm.quantity ?? '')}
                    onChange={(e) => {
                      const raw = sanitizeDecimalInput(e.target.value);
                      setWastageForm({
                        ...wastageForm,
                        quantity: raw
                      });
                    }}
                    onBlur={() => {
                      const rawStr = toEnglishDigits(wastageForm.quantity ?? '').trim();
                      if (!rawStr) {
                        setWastageForm({ ...wastageForm, quantity: '' });
                        return;
                      }
                      const num = parseFloat(rawStr);
                      if (isNaN(num) || num <= 0) {
                        setWastageForm({ ...wastageForm, quantity: '' });
                      } else {
                        setWastageForm({ ...wastageForm, quantity: formatQty(num) });
                      }
                    }}
                    className="flex-1 w-full min-w-0 bg-transparent text-sm font-black text-slate-700 text-center focus:outline-none tabular-nums"
                    placeholder="0"
                    required
                  />

                  <button
                    type="button"
                    onClick={() => {
                      const current = parseFloat(toEnglishDigits(wastageForm.quantity)) || 0;
                      setWastageForm({ ...wastageForm, quantity: formatQty(current + 1) });
                    }}
                    className="w-10 h-full flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                    title="زيادة"
                  >
                    <Plus size={14} strokeWidth={3} />
                  </button>
                </div>
              </div>
            </div>

            {/* Row 2: Wastage Reason */}
            <div
              className="flex flex-col gap-2 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-rose-100/80 text-rose-600 flex items-center justify-center">
                  <AlertTriangle size={13} />
                </div>
                <span>سبب التلف / الهدر</span>
              </label>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowReasonMenu((prev) => !prev);
                    setShowItemMenu(false);
                  }}
                  className={`w-full h-11 px-3.5 bg-white border rounded-2xl text-xs sm:text-sm font-bold text-slate-800 flex items-center justify-between gap-2 shadow-2xs transition-all cursor-pointer ${
                    showReasonMenu
                      ? 'border-rose-500 ring-2 ring-rose-500/15'
                      : 'border-slate-200/90 hover:border-slate-300'
                  }`}
                >
                  <span className="truncate font-black text-slate-800">
                    {wastageForm.reason}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 shrink-0 transition-transform duration-200 ${
                      showReasonMenu ? 'rotate-180 text-rose-500' : ''
                    }`}
                  />
                </button>

                {showReasonMenu && (
                  <div className="absolute right-0 left-0 top-full mt-1.5 bg-white border border-slate-200/90 rounded-2xl shadow-[0_12px_32px_rgba(15,23,42,0.12)] p-1.5 z-50 max-h-56 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
                    {wastageReasons.map((reasonOption) => {
                      const isSelected = wastageForm.reason === reasonOption;
                      return (
                        <button
                          key={reasonOption}
                          type="button"
                          onClick={() => {
                            setWastageForm({ ...wastageForm, reason: reasonOption });
                            setShowReasonMenu(false);
                          }}
                          className={`w-full px-3 py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-2 transition-all cursor-pointer mb-0.5 last:mb-0 ${
                            isSelected
                              ? 'bg-rose-50/90 text-rose-700 font-black border border-rose-200/60'
                              : 'text-slate-700 font-bold hover:bg-slate-50 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                isSelected ? 'bg-rose-500' : 'bg-slate-300'
                              }`}
                            />
                            <span className="truncate">{reasonOption}</span>
                          </div>
                          {isSelected && <Check size={14} className="text-rose-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Row 3: Notes (Mandatory when reason === 'أخرى') */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs sm:text-sm font-black text-slate-700 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-rose-100/80 text-rose-600 flex items-center justify-center">
                    <FileText size={13} />
                  </div>
                  <span>ملاحظات توضيحية إضافية</span>
                </label>
                {wastageForm.reason === 'أخرى' ? (
                  <span className="text-[11px] font-black text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200/70">
                    إجباري *
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-slate-400">اختياري</span>
                )}
              </div>
              <textarea
                rows={3}
                value={wastageForm.notes}
                onChange={(e) => setWastageForm({ ...wastageForm, notes: e.target.value })}
                required={wastageForm.reason === 'أخرى'}
                placeholder={
                  wastageForm.reason === 'أخرى'
                    ? 'يرجى كتابة سبب التلف بالتفصيل (إجباري)...'
                    : 'اكتب أي تفاصيل مساعدة لتدقيق الهدر...'
                }
                className={`w-full bg-white shadow-2xs rounded-2xl p-3.5 text-slate-700 font-semibold text-xs sm:text-sm leading-relaxed focus:outline-none focus:ring-2 transition-all resize-none placeholder-slate-400 border ${
                  wastageForm.reason === 'أخرى' && !wastageForm.notes.trim()
                    ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/15'
                    : 'border-slate-200/90 focus:border-rose-500 focus:ring-rose-500/15'
                }`}
              />
            </div>

            {/* Info Notice Banner */}
            <div className="bg-amber-50/80 px-4 py-3 rounded-2xl border border-amber-200/70 text-amber-800 text-xs font-bold flex items-center gap-2.5 shadow-2xs">
              <Info size={16} className="text-amber-600 shrink-0" />
              <span className="leading-relaxed">
                سيتم خصم الكمية فوراً من رصيد {theme.storeName}، وتوثيق العملية في سجل الاستهلاك باسم المستخدم وتوقيت الخصم.
              </span>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-end gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                handleCloseMenus();
                onClose();
              }}
              disabled={submitting}
              className="px-5 sm:px-6 py-2.5 rounded-xl font-black text-xs sm:text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 sm:px-7 py-2.5 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-700 hover:to-red-800 text-white rounded-xl font-black text-xs sm:text-sm transition-all flex items-center gap-2 shadow-md shadow-rose-600/20 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <RefreshCcw size={15} className="animate-spin" />
              ) : (
                <Trash2 size={15} strokeWidth={2.2} />
              )}
              <span>تأكيد خصم التالف</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
