import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Package,
  AlertTriangle,
  ShieldAlert,
  Search,
  RefreshCcw,
  Trash2,
  FileText,
  AlertOctagon,
  ArrowDownRight,
  ArrowUpRight,
  Info,
  Check,
  X,
  Truck,
  Eye,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Activity,
  History,
  Layers,
  Plus,
  Minus,
  Clock,
  Edit2,
  SlidersHorizontal,
  Power,
  Calendar,
  FlaskConical,
  Link2,
  Maximize2,
  Minimize2,
  TrendingUp,
  DollarSign,
  Wallet,
  Calculator,
  Percent,
  Award
} from 'lucide-react';
import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';
import { getSocket, joinRoom } from '../../utils/socket';
import { LabPatientDetailPanel } from '../../components/lab/LabModals';
import BatchDetailsModal from '../../components/storeCommon/BatchDetailsModal';
import {
  InventoryItemModal,
  StockAdjustmentModal,
  DeleteOrToggleItemModal,
  InventoryWastageModal
} from '../../components/storeCommon/ClinicalInventoryModals';
import taffyot from '../../utils/taffyot';
import {
  getSmartItemText,
  formatLabConsumableRate,
  formatLabConsumableRateText,
  formatArabicTestsCount,
  formatArabicLabUnitQty
} from '../../utils/arabicFormatters';

const toEnglishDigits = (val) =>
  String(val ?? '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٫,،]/g, '.');

const sanitizeDecimalInput = (val) => {
  const normalized = toEnglishDigits(val).replace(/[^0-9.]/g, '');
  const parts = normalized.split('.');
  if (parts.length <= 2) return normalized;
  return `${parts[0]}.${parts.slice(1).join('')}`;
};

// ── Clean Decimal Formatter for Lab Quantities (DECIMAL(12,4)) ──────────────
export const formatQty = (val) => {
  const num = parseFloat(val);
  if (isNaN(num)) return '0';
  return Number(num.toFixed(4)).toString();
};

// ── Clean Currency Formatter (YER) ──────────────────────────────────────────
const formatCurrency = (val) => {
  const num = parseFloat(val);
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

// ── Expiry Status & Remaining Time Helper ────────────────────────────────────
const getExpiryInfo = (expiryDateStr) => {
  if (!expiryDateStr) {
    return { isExpired: false, isExpiringSoon: false, daysLeft: null, remainingText: '' };
  }
  const exp = new Date(expiryDateStr);
  if (isNaN(exp.getTime())) {
    return { isExpired: false, isExpiringSoon: false, daysLeft: null, remainingText: '' };
  }
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const expStart = new Date(exp);
  expStart.setHours(0, 0, 0, 0);

  const daysLeft = Math.ceil((expStart - todayStart) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) {
    return {
      isExpired: true,
      isExpiringSoon: false,
      daysLeft,
      remainingText: daysLeft === 0 ? 'ينتهي اليوم' : 'منتهي الصلاحية'
    };
  }

  if (daysLeft <= 90) {
    let remainingText = '';
    if (daysLeft === 1) {
      remainingText = 'متبقي يوم واحد';
    } else if (daysLeft === 2) {
      remainingText = 'متبقي يومان';
    } else if (daysLeft >= 3 && daysLeft <= 10) {
      remainingText = `متبقي ${daysLeft} أيام`;
    } else {
      remainingText = `متبقي ${daysLeft} يوم`;
    }
    return {
      isExpired: false,
      isExpiringSoon: true,
      daysLeft,
      remainingText
    };
  }

  return { isExpired: false, isExpiringSoon: false, daysLeft, remainingText: '' };
};

const WASTAGE_REASONS = [
  'تلف العينة / تخثر الدم (Hemolysis / Clotted)',
  'إعادة التحليل للتأكيد (Repeat Test)',
  'معايرة الأجهزة وضبط الجودة (Calibration / QC)',
  'انسكاب المحلول أو كسر الأنبوب',
  'انتهاء صلاحية المحلول بعد الفتح',
  'عيب مصنعي في المستهلكات',
  'سوء تخزين / تلف حرارة',
  'أخرى'
];

const CATEGORY_OPTIONS = [
  { id: 'reagent', label: 'محلول / كاشف مخبري (Reagent)', shortLabel: 'محلول / كاشف', defaultUnit: 'عبوة' },
  { id: 'tube', label: 'أنبوبة سحب دم (Blood Tube)', shortLabel: 'أنبوبة سحب', defaultUnit: 'أنبوبة' },
  { id: 'consumable', label: 'مستهلك عام / أخرى', shortLabel: 'مستهلك عام', defaultUnit: 'قطعة' }
];

const UNIT_OPTIONS = ['أنبوبة', 'عبوة', 'شريط', 'علبة', 'كيت (Kit)', 'مل (mL)', 'قطعة', 'وحدة', 'لتر'];

const getCategoryShortLabel = (cat, unit) => {
  if (cat === 'reagent') return 'محلول / كاشف';
  if (cat === 'tube') return 'أنبوبة سحب';
  return unit || 'مستهلك عام';
};

// ── English Date & Time Helpers ──────────────────────────────────────────────
const formatDateEn = (isoStr) => {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return String(isoStr);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
};

const toInputDateValue = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatTimeEn = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => n.toString().padStart(2, '0');
  let hours = d.getHours();
  const minutes = pad(d.getMinutes());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${pad(hours)}:${minutes} ${ampm}`;
};

const LOG_PAGE_SIZE = 25;
const TRANSFERS_HISTORY_PAGE_SIZE = 10;

const formatSenderName = (batch) => {
  if (!batch) return 'المخزن العام';
  if (batch.from_store === 'or') return 'مخزن العمليات';
  if (batch.from_store === 'general') return 'المخزن العام';
  const raw = batch.store_name || batch.sender_name || batch.sent_by_name || 'المخزن العام';
  return String(raw).replace(/\s*\([^)]*\)\s*/g, '').trim() || 'المخزن العام';
};

const parseWastageDetails = (log) => {
  const raw = String(log?.notes || '').trim();
  if (!raw) {
    return { reason: 'تلف / هدر مصنعي', note: '' };
  }
  const parts = raw.split(' - ');
  return {
    reason: parts[0]?.trim() || 'تلف / هدر مصنعي',
    note: parts.slice(1).join(' - ').trim()
  };
};

// ══════════════════════════════════════════════════════════════════════════════
// SHARED BOM RECIPE MODAL (Matches LabPatientDetailPanel 100%)
// ══════════════════════════════════════════════════════════════════════════════
export function LabTestConsumablesModal({
  isOpen,
  onClose,
  test,
  initialTest,
  inventoryItems = [],
  initialLinks = [],
  token,
  onSaved
}) {
  const storeToken = useAuthStore((s) => s.token);
  const activeToken = token || storeToken;
  const activeTest = test || initialTest;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  // Independent Add / Edit Section State (Hidden by default)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [draftItemId, setDraftItemId] = useState('');
  const [draftMode, setDraftMode] = useState('per_test');
  const [draftQtyPerTest, setDraftQtyPerTest] = useState('1');
  const [draftTestsPerUnit, setDraftTestsPerUnit] = useState('100');
  const [openItemDropdown, setOpenItemDropdown] = useState(false);
  const [openModeDropdown, setOpenModeDropdown] = useState(false);
  const [itemSearchTerm, setItemSearchTerm] = useState('');

  const activeInventory = useMemo(
    () => inventoryItems.filter((it) => Number(it.is_active) !== 0),
    [inventoryItems]
  );

  const filteredDropdownInventory = useMemo(() => {
    const q = itemSearchTerm.trim().toLowerCase();
    if (!q) return activeInventory;
    return activeInventory.filter(
      (it) =>
        (it.name || '').toLowerCase().includes(q) ||
        (it.unit || '').toLowerCase().includes(q)
    );
  }, [activeInventory, itemSearchTerm]);

  useEffect(() => {
    if (isOpen && activeTest) {
      setIsFormOpen(false);
      setOpenItemDropdown(false);
      setOpenModeDropdown(false);
      setItemSearchTerm('');
      setEditingIdx(null);

      const mappedRows =
        Array.isArray(initialLinks) && initialLinks.length > 0
          ? initialLinks.map((link) => ({
              lab_item_id: String(link.lab_item_id || ''),
              item_name: link.item_name || '',
              item_category: link.item_category || '',
              item_unit: link.item_unit || '',
              consumption_mode: link.consumption_mode || 'per_test',
              quantity_per_test:
                link.consumption_mode === 'per_unit_yield'
                  ? '1'
                  : formatQty(link.quantity_per_test ?? 1),
              tests_per_unit:
                link.consumption_mode === 'per_unit_yield'
                  ? String(parseInt(link.tests_per_unit, 10) || 100)
                  : '100'
            }))
          : [];

      setRows(mappedRows);
      setDraftItemId('');
      setDraftMode('per_test');
      setDraftQtyPerTest('1');
      setDraftTestsPerUnit('100');
    }
  }, [isOpen, activeTest, initialLinks]);

  if (!isOpen || !activeTest) return null;

  const getItemTypeLabel = (category) => {
    if (category === 'reagent') return 'محلول / كاشف';
    if (category === 'tube') return 'أنبوبة سحب';
    return 'مستهلك عام';
  };

  const draftSelectedItem =
    activeInventory.find((it) => String(it.id) === String(draftItemId)) ||
    inventoryItems.find((it) => String(it.id) === String(draftItemId));

  const draftIsYield = draftMode === 'per_unit_yield';
  const draftYieldVal = parseInt(toEnglishDigits(draftTestsPerUnit), 10) || 0;
  const draftQtyVal = parseFloat(toEnglishDigits(draftQtyPerTest)) || 0;
  const draftComputedDeduction =
    draftIsYield && draftYieldVal > 0
      ? formatQty(1 / draftYieldVal)
      : formatQty(draftQtyVal || 0);

  const draftRatePreview = draftSelectedItem
    ? formatLabConsumableRateText({
        consumption_mode: draftMode,
        tests_per_unit: draftYieldVal || 1,
        quantity_per_test: draftQtyVal || 1,
        item_unit: draftSelectedItem.unit || 'وحدة'
      })
    : '';

  const resetDraftForm = () => {
    setIsFormOpen(false);
    setEditingIdx(null);
    setDraftItemId('');
    setDraftMode('per_test');
    setDraftQtyPerTest('1');
    setDraftTestsPerUnit('100');
    setOpenItemDropdown(false);
    setOpenModeDropdown(false);
    setItemSearchTerm('');
  };

  const handleOpenAddForm = () => {
    setEditingIdx(null);
    setDraftItemId('');
    setDraftMode('per_test');
    setDraftQtyPerTest('1');
    setDraftTestsPerUnit('100');
    setOpenItemDropdown(false);
    setOpenModeDropdown(false);
    setItemSearchTerm('');
    setIsFormOpen(true);
  };

  const handleStartEditRow = (idx) => {
    const row = rows[idx];
    if (!row) return;
    setEditingIdx(idx);
    setDraftItemId(String(row.lab_item_id || ''));
    setDraftMode(row.consumption_mode || 'per_test');
    setDraftQtyPerTest(String(row.quantity_per_test || '1'));
    setDraftTestsPerUnit(String(row.tests_per_unit || '100'));
    setOpenItemDropdown(false);
    setOpenModeDropdown(false);
    setIsFormOpen(true);
  };

  const handleRemoveRow = (idx) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) {
      resetDraftForm();
    } else if (editingIdx !== null && editingIdx > idx) {
      setEditingIdx(editingIdx - 1);
    }
  };

  const handleApplyDraftRow = () => {
    const itemId = parseInt(draftItemId, 10);
    if (!itemId) {
      return toast.warning('يرجى اختيار الصنف من مخزن المختبر أولاً');
    }

    const duplicateIdx = rows.findIndex(
      (r, i) => i !== editingIdx && parseInt(r.lab_item_id, 10) === itemId
    );
    if (duplicateIdx !== -1) {
      return toast.warning('هذا الصنف مضاف مسبقاً في قائمة المستهلكات المرتبطة بهذا التحليل');
    }

    if (draftMode === 'per_unit_yield') {
      const yieldCount = parseInt(toEnglishDigits(draftTestsPerUnit), 10);
      if (isNaN(yieldCount) || yieldCount <= 0) {
        return toast.warning('يرجى إدخال عدد تحاليل صحيح أكبر من الصفر');
      }
      const updatedRow = {
        lab_item_id: String(itemId),
        item_name: draftSelectedItem?.name || '',
        item_category: draftSelectedItem?.category || 'reagent',
        item_unit: draftSelectedItem?.unit || 'عبوة',
        consumption_mode: 'per_unit_yield',
        tests_per_unit: String(yieldCount),
        quantity_per_test: formatQty(1 / yieldCount)
      };

      if (editingIdx !== null) {
        setRows((prev) => prev.map((r, i) => (i === editingIdx ? updatedRow : r)));
        toast.info('تم تحديث بيانات المستهلك في القائمة');
      } else {
        setRows((prev) => [...prev, updatedRow]);
      }
      resetDraftForm();
    } else {
      const qty = parseFloat(toEnglishDigits(draftQtyPerTest));
      if (isNaN(qty) || qty <= 0) {
        return toast.warning('يرجى إدخال كمية خصم صحيحة أكبر من الصفر');
      }
      const updatedRow = {
        lab_item_id: String(itemId),
        item_name: draftSelectedItem?.name || '',
        item_category: draftSelectedItem?.category || 'consumable',
        item_unit: draftSelectedItem?.unit || 'وحدة',
        consumption_mode: 'per_test',
        quantity_per_test: formatQty(qty),
        tests_per_unit: '100'
      };

      if (editingIdx !== null) {
        setRows((prev) => prev.map((r, i) => (i === editingIdx ? updatedRow : r)));
        toast.info('تم تحديث بيانات المستهلك في القائمة');
      } else {
        setRows((prev) => [...prev, updatedRow]);
      }
      resetDraftForm();
    }
  };

  const handleSave = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    let effectiveRows = [...rows];
    const pendingItemId = isFormOpen ? parseInt(draftItemId, 10) : 0;
    if (pendingItemId > 0) {
      const isDuplicate = effectiveRows.some(
        (r, i) => i !== editingIdx && parseInt(r.lab_item_id, 10) === pendingItemId
      );
      if (!isDuplicate) {
        if (draftMode === 'per_unit_yield') {
          const yieldCount = parseInt(toEnglishDigits(draftTestsPerUnit), 10);
          if (!isNaN(yieldCount) && yieldCount > 0) {
            const committed = {
              lab_item_id: String(pendingItemId),
              consumption_mode: 'per_unit_yield',
              tests_per_unit: String(yieldCount),
              quantity_per_test: formatQty(1 / yieldCount)
            };
            if (editingIdx !== null) {
              effectiveRows = effectiveRows.map((r, i) => (i === editingIdx ? committed : r));
            } else {
              effectiveRows.push(committed);
            }
          }
        } else {
          const qty = parseFloat(toEnglishDigits(draftQtyPerTest));
          if (!isNaN(qty) && qty > 0) {
            const committed = {
              lab_item_id: String(pendingItemId),
              consumption_mode: 'per_test',
              quantity_per_test: formatQty(qty),
              tests_per_unit: '100'
            };
            if (editingIdx !== null) {
              effectiveRows = effectiveRows.map((r, i) => (i === editingIdx ? committed : r));
            } else {
              effectiveRows.push(committed);
            }
          }
        }
      }
    }

    const seen = new Set();
    const payloadItems = [];

    for (let i = 0; i < effectiveRows.length; i++) {
      const r = effectiveRows[i];
      const itemId = parseInt(r.lab_item_id, 10);
      if (!itemId) {
        return toast.warning(`يرجى اختيار الصنف في السطر رقم ${i + 1}`);
      }
      if (seen.has(itemId)) {
        return toast.warning('لا يمكن تكرار نفس الصنف أكثر من مرة في نفس التحليل');
      }
      seen.add(itemId);

      if (r.consumption_mode === 'per_unit_yield') {
        const yieldCount = parseInt(toEnglishDigits(r.tests_per_unit), 10);
        if (isNaN(yieldCount) || yieldCount <= 0) {
          return toast.warning(`يرجى إدخال سعة عبوة صحيحة أكبر من الصفر في السطر رقم ${i + 1}`);
        }
        payloadItems.push({
          lab_item_id: itemId,
          consumption_mode: 'per_unit_yield',
          tests_per_unit: yieldCount,
          quantity_per_test: Number((1 / yieldCount).toFixed(4))
        });
      } else {
        const qty = parseFloat(toEnglishDigits(r.quantity_per_test));
        if (isNaN(qty) || qty <= 0) {
          return toast.warning(`يرجى إدخال كمية خصم صحيحة أكبر من الصفر في السطر رقم ${i + 1}`);
        }
        payloadItems.push({
          lab_item_id: itemId,
          consumption_mode: 'per_test',
          quantity_per_test: qty,
          tests_per_unit: null
        });
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/lab/inventory/test-consumables/${activeTest.id}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          lab_test_id: activeTest.id,
          consumables: payloadItems,
          items: payloadItems
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'تم حفظ المستهلكات المرتبطة بالتحليل بنجاح');
        if (onSaved) onSaved();
        onClose();
      } else {
        toast.error(data.message || 'فشل حفظ المستهلكات المرتبطة');
      }
    } catch (err) {
      console.error('LabTestConsumablesModal save error:', err);
      toast.error('خطأ في الاتصال بالخادم');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-[99999] flex items-center justify-center ${
        isFullscreen ? 'p-2 sm:p-3' : 'p-4 sm:p-6 lg:p-8'
      } bg-black/50 backdrop-blur-md animate-in fade-in duration-300`}
      dir="rtl"
    >
      {/* Backdrop — Clicking outside does NOT close the modal */}
      <div
        className="absolute inset-0"
        onClick={() => {
          setOpenItemDropdown(false);
          setOpenModeDropdown(false);
        }}
      />

      <div
        onClick={() => {
          setOpenItemDropdown(false);
          setOpenModeDropdown(false);
        }}
        className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/60 ${
          isFullscreen
            ? 'w-[98vw] h-[98vh] rounded-[2.5rem]'
            : 'w-full max-w-5xl h-full max-h-[90vh] rounded-[2rem]'
        }`}
      >
        {/* ── Top Control Bar (Matching LabPatientDetailPanel 100%) ── */}
        <div
          className={`${
            isFullscreen ? 'px-6 sm:px-8 py-3' : 'px-5 py-2.5'
          } flex items-center justify-between flex-shrink-0 shadow-md text-white transition-all duration-300 bg-gradient-to-r from-violet-700 via-purple-700 to-violet-800 z-30`}
        >
          <div className="flex items-center gap-2">
            <FlaskConical size={isFullscreen ? 18 : 16} />
            <span
              className={`${
                isFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
              } font-black tracking-wide drop-shadow-sm`}
            >
              المستهلكات المرتبطة بالتحليل ({activeTest?.name || '—'})
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <div
              className={`${
                isFullscreen ? 'h-8 px-3.5 text-xs sm:text-sm' : 'h-7 px-2.5 text-xs'
              } flex items-center gap-1.5 bg-white/20 text-white rounded-lg font-black shadow-sm select-none transition-all`}
            >
              <Link2 size={isFullscreen ? 14 : 13} strokeWidth={2.2} className="text-white" />
              <span>{getSmartItemText(rows.length, rows[0]?.item_name)}</span>
            </div>

            <div className="w-px h-4 bg-white/25 mx-0.5" />

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={`${
                isFullscreen ? 'w-8 h-8' : 'w-7 h-7'
              } flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all shadow-sm cursor-pointer active:scale-95`}
              title={isFullscreen ? 'تصغير' : 'تكبير'}
            >
              {isFullscreen ? (
                <Minimize2 size={isFullscreen ? 16 : 15} />
              ) : (
                <Maximize2 size={isFullscreen ? 16 : 15} />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!saving) onClose();
              }}
              className={`${
                isFullscreen ? 'w-8 h-8' : 'w-7 h-7'
              } flex items-center justify-center bg-white/20 hover:bg-white/30 text-white hover:text-red-100 rounded-lg transition-all shadow-sm cursor-pointer active:scale-95`}
              title="إغلاق"
            >
              <X size={isFullscreen ? 16 : 15} />
            </button>
          </div>
        </div>

        {/* ── Top Header Section (Test Name & Category in Title, No Badge) ── */}
        <div
          className={`bg-white ${
            isFullscreen ? 'px-6 sm:px-8 py-4 sm:py-4.5' : 'px-5 sm:px-6 py-3.5'
          } flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-100 shrink-0 z-20 transition-all duration-300`}
        >
          {/* Right: Icon + Test Name & Category in Section Title + Description */}
          <div className={`flex items-center ${isFullscreen ? 'gap-4' : 'gap-3 sm:gap-3.5'}`}>
            <div
              className={`${
                isFullscreen
                  ? 'w-12 h-12 sm:w-13 sm:h-13 rounded-2xl'
                  : 'w-11 h-11 sm:w-12 sm:h-12 rounded-xl'
              } bg-gradient-to-br from-violet-50 to-purple-100 flex items-center justify-center text-violet-700 shadow-inner border border-violet-100/60 shrink-0 transition-all`}
            >
              <FlaskConical size={isFullscreen ? 24 : 22} strokeWidth={1.8} />
            </div>
            <div className="space-y-1">
              <h2
                className={`${
                  isFullscreen ? 'text-lg sm:text-xl' : 'text-base sm:text-lg'
                } font-black text-slate-800 tracking-tight leading-none transition-all flex items-center flex-wrap gap-1.5`}
              >
                <span dir="auto">{activeTest?.name || '—'}</span>
                <span className="text-slate-300 font-normal">—</span>
                <span
                  dir="auto"
                  className={`text-violet-700 font-bold ${
                    isFullscreen ? 'text-base sm:text-lg' : 'text-sm sm:text-base'
                  }`}
                >
                  {activeTest?.category_name || 'تحاليل عامة'}
                </span>
              </h2>
              <p
                className={`${
                  isFullscreen ? 'text-xs sm:text-[13px]' : 'text-xs'
                } font-semibold text-slate-500`}
              >
                إدارة وضبط المواد والمحاليل المخبرية التي تُخصم تلقائياً من المخزن عند بدء تنفيذ التحليل
              </p>
            </div>
          </div>

          {/* Left: Trigger Button to Open Independent Add Section */}
          <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
            <button
              type="button"
              onClick={handleOpenAddForm}
              disabled={activeInventory.length === 0}
              className={`flex items-center gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white ${
                isFullscreen ? 'h-10 px-5 text-xs sm:text-[13px]' : 'h-9 px-4 text-xs'
              } rounded-xl font-black shadow-xs hover:shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-40`}
              title="ربط مستهلك أو محلول جديد بهذا التحليل"
            >
              <Plus size={isFullscreen ? 16 : 15} strokeWidth={2.5} />
              <span>ربط استهلاك</span>
            </button>
          </div>
        </div>

        {/* ── Body Workspace ── */}
        <div
          className={`flex-1 overflow-y-auto ${
            isFullscreen ? 'p-6 sm:p-8 space-y-6' : 'p-5 sm:p-6 space-y-5'
          } custom-scrollbar bg-slate-50/40 transition-all duration-300`}
        >
          {/* ── Independent Add / Edit Section (Hidden unless "ربط استهلاك" or "تعديل" is clicked) ── */}
          {isFormOpen && (
            <div
              className={`${
                isFullscreen ? 'space-y-3' : 'space-y-2.5'
              } animate-in fade-in slide-in-from-top-2 duration-200`}
            >
              {/* Floating Section Header */}
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`${
                      isFullscreen ? 'p-2' : 'p-1.5'
                    } bg-violet-100/80 rounded-lg text-violet-700 shadow-sm`}
                  >
                    {editingIdx !== null ? (
                      <Edit2 size={isFullscreen ? 16 : 15} />
                    ) : (
                      <Plus size={isFullscreen ? 16 : 15} />
                    )}
                  </div>
                  <h3
                    className={`${
                      isFullscreen ? 'text-sm sm:text-base' : 'text-sm'
                    } font-black text-slate-700`}
                  >
                    {editingIdx !== null
                      ? `تعديل بيانات الاستهلاك المرتبط (#${editingIdx + 1})`
                      : 'ربط استهلاك جديد بالتحليل'}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={resetDraftForm}
                  className={`${
                    isFullscreen ? 'w-8 h-8' : 'w-7 h-7'
                  } rounded-lg bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-500 border border-slate-200/80 flex items-center justify-center transition-all cursor-pointer active:scale-95`}
                  title="إغلاق قسم الإضافة والتعديل"
                >
                  <X size={isFullscreen ? 15 : 14} />
                </button>
              </div>

              {/* Independent Add / Edit Card — Smart Proportional Layout (44% + 28% + 16% + 12% = 100%) */}
              <div
                className={`bg-white rounded-2xl border border-slate-200 ${
                  isFullscreen ? 'p-5 sm:p-6' : 'p-4'
                } shadow-sm transition-all`}
              >
                <div
                  className={`grid grid-cols-1 md:grid-cols-[44fr_28fr_16fr_12fr] ${
                    isFullscreen ? 'gap-4' : 'gap-3'
                  } items-end`}
                >
                  {/* 1. Select Lab Item (44%) */}
                  <div
                    className="w-full relative min-w-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <label
                      className={`block ${
                        isFullscreen ? 'text-xs mb-2' : 'text-[11px] mb-1.5'
                      } font-bold text-slate-500 px-1`}
                    >
                      الصنف المخبري
                    </label>
                    <div
                      onClick={() => {
                        setOpenItemDropdown(!openItemDropdown);
                        setOpenModeDropdown(false);
                      }}
                      className={`w-full ${
                        isFullscreen ? 'h-[42px] px-3.5' : 'h-[38px] px-3'
                      } bg-white border ${
                        openItemDropdown
                          ? 'border-violet-500 ring-1 ring-violet-500'
                          : 'border-slate-200 hover:border-violet-300'
                      } rounded-xl text-xs font-bold text-slate-700 transition-all shadow-sm cursor-pointer flex items-center justify-between gap-2 group`}
                    >
                      {draftSelectedItem ? (
                        <div className="flex items-center justify-between gap-2 flex-1 min-w-0">
                          <span
                            className={`font-bold text-slate-800 ${
                              isFullscreen ? 'text-sm sm:text-[15px]' : 'text-xs sm:text-[13px]'
                            } truncate`}
                          >
                            {draftSelectedItem.name}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-lg shrink-0">
                            <span dir="ltr">{formatQty(draftSelectedItem.quantity)}</span>
                            {draftSelectedItem.unit && <span>{draftSelectedItem.unit}</span>}
                          </span>
                        </div>
                      ) : (
                        <span
                          className={`text-slate-400 font-bold ${
                            isFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
                          } truncate`}
                        >
                          اختر الصنف المخبري من القائمة...
                        </span>
                      )}
                      <ChevronDown
                        size={isFullscreen ? 15 : 14}
                        className={`text-slate-400 group-hover:text-violet-500 shrink-0 transition-transform duration-200 ${
                          openItemDropdown ? 'rotate-180 text-violet-600' : ''
                        }`}
                      />
                    </div>

                    {openItemDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
                        <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                          <div className="relative">
                            <Search
                              size={14}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                            />
                            <input
                              type="text"
                              value={itemSearchTerm}
                              onChange={(e) => setItemSearchTerm(e.target.value)}
                              placeholder="ابحث باسم الصنف أو الوحدة..."
                              className="w-full h-8 pr-9 pl-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="max-h-56 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
                          {filteredDropdownInventory.length === 0 ? (
                            <div className="py-6 text-center text-xs font-bold text-slate-400">
                              لا توجد أصناف مطابقة للبحث
                            </div>
                          ) : (
                            filteredDropdownInventory.map((it) => {
                              const isSel = String(it.id) === String(draftItemId);
                              const isAlreadyLinked = rows.some(
                                (r, i) =>
                                  i !== editingIdx && String(r.lab_item_id) === String(it.id)
                              );
                              return (
                                <div
                                  key={it.id}
                                  onClick={() => {
                                    setDraftItemId(String(it.id));
                                    if (editingIdx === null) {
                                      setDraftMode(
                                        it.category === 'reagent' ? 'per_unit_yield' : 'per_test'
                                      );
                                    }
                                    setOpenItemDropdown(false);
                                    setItemSearchTerm('');
                                  }}
                                  className={`px-3 py-2 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-2.5 border ${
                                    isSel
                                      ? 'bg-violet-50 text-violet-700 border-violet-200/60'
                                      : isAlreadyLinked
                                      ? 'bg-slate-50/60 text-slate-400 border-transparent hover:bg-slate-100/60'
                                      : 'text-slate-700 border-transparent hover:bg-violet-50/40 hover:border-violet-200/40'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span
                                      className={`font-bold ${
                                        isFullscreen ? 'text-sm sm:text-[15px]' : 'text-xs sm:text-[13px]'
                                      } truncate`}
                                    >
                                      {it.name}
                                    </span>
                                    {isAlreadyLinked && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200/80 text-slate-600 font-bold shrink-0">
                                        مضاف
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-lg">
                                      <span dir="ltr">{formatQty(it.quantity)}</span>
                                      {it.unit && <span>{it.unit}</span>}
                                    </span>
                                    {isSel && (
                                      <Check size={14} className="text-violet-600 shrink-0" />
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. Consumption Mode (28% — Expanded for comfortable display) */}
                  <div
                    className="w-full relative min-w-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <label
                      className={`block ${
                        isFullscreen ? 'text-xs mb-2' : 'text-[11px] mb-1.5'
                      } font-bold text-slate-500 px-1`}
                    >
                      طريقة الاحتساب
                    </label>
                    <div
                      onClick={() => {
                        setOpenModeDropdown(!openModeDropdown);
                        setOpenItemDropdown(false);
                      }}
                      className={`w-full ${
                        isFullscreen ? 'h-[42px] px-3.5 text-xs sm:text-[13px]' : 'h-[38px] px-3 text-xs'
                      } bg-white border ${
                        openModeDropdown
                          ? 'border-violet-500 ring-1 ring-violet-500'
                          : 'border-slate-200 hover:border-violet-300'
                      } rounded-xl font-bold text-slate-700 transition-all shadow-sm cursor-pointer flex items-center justify-between gap-2 group`}
                    >
                      <span className="truncate">
                        {draftIsYield ? 'سعة العبوة (عدد التحاليل)' : 'خصم مباشر لكل تحليل'}
                      </span>
                      <ChevronDown
                        size={isFullscreen ? 15 : 14}
                        className={`text-slate-400 group-hover:text-violet-500 shrink-0 transition-transform duration-200 ${
                          openModeDropdown ? 'rotate-180 text-violet-600' : ''
                        }`}
                      />
                    </div>

                    {openModeDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden z-50 p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-150">
                        {[
                          { id: 'per_test', label: 'خصم مباشر لكل تحليل' },
                          { id: 'per_unit_yield', label: 'سعة العبوة (عدد التحاليل)' }
                        ].map((m) => {
                          const isSel = draftMode === m.id;
                          return (
                            <div
                              key={m.id}
                              onClick={() => {
                                setDraftMode(m.id);
                                setOpenModeDropdown(false);
                              }}
                              className={`px-3 py-2 text-xs font-bold rounded-xl cursor-pointer transition-all flex items-center justify-between border ${
                                isSel
                                  ? 'bg-violet-50 text-violet-700 border-violet-200/60'
                                  : 'text-slate-600 border-transparent hover:bg-violet-50/40 hover:text-violet-600 hover:border-violet-200/40'
                              }`}
                            >
                              <span>{m.label}</span>
                              {isSel && <Check size={14} className="text-violet-600 shrink-0" />}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 3. Quantity / Tests Count Stepper (16% — Matches Receive.js Quantity Field 100%) */}
                  <div className="w-full min-w-0">
                    <label
                      className={`block ${
                        isFullscreen ? 'text-xs mb-2' : 'text-[11px] mb-1.5'
                      } font-bold text-slate-500 px-1 truncate`}
                    >
                      {draftIsYield ? 'عدد التحاليل للعبوة' : 'الكمية لكل تحليل'}
                    </label>
                    <div
                      className={`relative flex items-center ${
                        isFullscreen ? 'h-[42px]' : 'h-[38px]'
                      } bg-white border border-slate-200 rounded-xl overflow-hidden focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500 transition-all shadow-sm group`}
                    >
                      <button
                        type="button"
                        tabIndex="-1"
                        onClick={() => {
                          if (draftIsYield) {
                            const cur = parseInt(toEnglishDigits(draftTestsPerUnit), 10) || 10;
                            setDraftTestsPerUnit(String(Math.max(1, cur - (cur > 10 ? 10 : 1))));
                          } else {
                            const cur = parseFloat(toEnglishDigits(draftQtyPerTest)) || 1;
                            setDraftQtyPerTest(formatQty(Math.max(0.1, cur - 1)));
                          }
                        }}
                        className={`${
                          isFullscreen ? 'w-9' : 'w-8'
                        } h-full flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer shrink-0`}
                      >
                        <Minus size={14} strokeWidth={3} />
                      </button>

                      <input
                        type="text"
                        inputMode="decimal"
                        dir="ltr"
                        value={toEnglishDigits(draftIsYield ? draftTestsPerUnit : draftQtyPerTest)}
                        onChange={(e) => {
                          const raw = toEnglishDigits(e.target.value).replace(/[^0-9.]/g, '');
                          if (draftIsYield) {
                            setDraftTestsPerUnit(raw.replace(/\./g, ''));
                          } else {
                            setDraftQtyPerTest(raw);
                          }
                        }}
                        className={`flex-1 w-full min-w-0 bg-transparent ${
                          isFullscreen ? 'text-xs sm:text-[13px]' : 'text-xs'
                        } font-black text-slate-700 text-center focus:outline-none`}
                        placeholder="0"
                      />

                      <button
                        type="button"
                        tabIndex="-1"
                        onClick={() => {
                          if (draftIsYield) {
                            const cur = parseInt(toEnglishDigits(draftTestsPerUnit), 10) || 0;
                            setDraftTestsPerUnit(String(cur + (cur >= 10 ? 10 : 1)));
                          } else {
                            const cur = parseFloat(toEnglishDigits(draftQtyPerTest)) || 0;
                            setDraftQtyPerTest(formatQty(cur + 1));
                          }
                        }}
                        className={`${
                          isFullscreen ? 'w-9' : 'w-8'
                        } h-full flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer shrink-0`}
                      >
                        <Plus size={14} strokeWidth={3} />
                      </button>
                    </div>
                  </div>

                  {/* 4. Add / Update Button (12% — Proportional & Compact) */}
                  <div className="w-full min-w-0">
                    <button
                      type="button"
                      onClick={handleApplyDraftRow}
                      className={`w-full ${
                        isFullscreen ? 'h-[42px] text-xs sm:text-[13px]' : 'h-[38px] text-xs'
                      } px-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black flex items-center justify-center gap-1.5 shadow-sm shadow-violet-500/15 transition-all cursor-pointer active:scale-95`}
                    >
                      {editingIdx !== null ? (
                        <Check size={isFullscreen ? 15 : 14} strokeWidth={2.5} />
                      ) : (
                        <Plus size={isFullscreen ? 15 : 14} strokeWidth={2.5} />
                      )}
                      <span>{editingIdx !== null ? 'تحديث' : 'إضافة'}</span>
                    </button>
                  </div>
                </div>

                {/* Live Summary Bar Below Input Fields */}
                {draftSelectedItem && (
                  <div
                    className={`${
                      isFullscreen ? 'mt-4 pt-3.5' : 'mt-3.5 pt-3'
                    } border-t border-slate-100 animate-in fade-in duration-150`}
                  >
                    <div
                      className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-violet-50/60 border border-violet-200/70 rounded-xl ${
                        isFullscreen ? 'px-4 py-2.5 text-xs sm:text-[13px]' : 'px-3.5 py-2 text-xs'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-violet-600 shrink-0" />
                        <span
                          className={`font-bold text-slate-800 ${
                            isFullscreen ? 'text-sm sm:text-[15px]' : 'text-xs sm:text-[13px]'
                          }`}
                        >
                          {draftSelectedItem.name}:
                        </span>
                        <span className="font-bold text-violet-800">{draftRatePreview}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 font-bold">
                          الخصم التلقائي لكل فحص:
                        </span>
                        <span className="inline-flex items-center gap-1 font-bold text-violet-800">
                          <span dir="ltr">-{draftComputedDeduction}</span>
                          <span>{draftSelectedItem.unit || 'وحدة'}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Linked Consumables Table Section ── */}
          <div className={isFullscreen ? 'space-y-3.5' : 'space-y-3'}>
            {/* Floating Header directly above the table */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div
                  className={`${
                    isFullscreen ? 'p-2' : 'p-1.5'
                  } bg-violet-100/80 rounded-lg text-violet-700 shadow-sm`}
                >
                  <FlaskConical size={isFullscreen ? 17 : 16} />
                </div>
                <h3
                  className={`${
                    isFullscreen ? 'text-sm sm:text-base' : 'text-sm'
                  } font-black text-slate-700`}
                >
                  قائمة المواد والمستهلكات المرتبطة
                </h3>
                <span className="text-xs px-2.5 py-0.5 font-black bg-violet-50 text-violet-700 rounded-full border border-violet-200/60 font-mono">
                  {rows.length}
                </span>
              </div>
            </div>

            {rows.length === 0 ? (
              <div
                className={`w-full ${
                  isFullscreen ? 'min-h-[280px] p-10' : 'min-h-[220px] p-8'
                } bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col items-center justify-center text-slate-400 text-center`}
              >
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                  <Package size={28} className="text-slate-300" />
                </div>
                <p className="font-black text-sm text-slate-600">
                  لا توجد مستهلكات مرتبطة بهذا التحليل حالياً
                </p>
                <p className="text-xs font-semibold text-slate-400 mt-1 max-w-md">
                  اضغط على زر «ربط استهلاك» في أعلى النافذة لإضافة المواد أو المحاليل المرتبطة بهذا التحليل
                </p>
              </div>
            ) : (
              /* ── Proportional Layout Table (100% Total: 5% + 24% + 14% + 14% + 14% + 19% + 10%) ── */
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-right text-sm whitespace-nowrap table-fixed min-w-[760px]">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th
                          style={{ width: '5%' }}
                          className={`w-[5%] px-2 ${
                            isFullscreen ? 'py-4 text-xs sm:text-[13px]' : 'py-3.5 text-xs'
                          } font-bold text-slate-500 text-center`}
                        >
                          #
                        </th>
                        <th
                          style={{ width: '24%' }}
                          className={`w-[24%] px-4 ${
                            isFullscreen ? 'py-4 text-xs sm:text-[13px]' : 'py-3.5 text-xs'
                          } font-bold text-slate-500 text-right`}
                        >
                          اسم الصنف
                        </th>
                        <th
                          style={{ width: '14%' }}
                          className={`w-[14%] px-3 ${
                            isFullscreen ? 'py-4 text-xs sm:text-[13px]' : 'py-3.5 text-xs'
                          } font-bold text-slate-500 text-right`}
                        >
                          نوع الصنف
                        </th>
                        <th
                          style={{ width: '14%' }}
                          className={`w-[14%] px-3 ${
                            isFullscreen ? 'py-4 text-xs sm:text-[13px]' : 'py-3.5 text-xs'
                          } font-bold text-slate-500 text-center`}
                        >
                          طريقة الاحتساب
                        </th>
                        <th
                          style={{ width: '14%' }}
                          className={`w-[14%] px-3 ${
                            isFullscreen ? 'py-4 text-xs sm:text-[13px]' : 'py-3.5 text-xs'
                          } font-bold text-slate-500 text-center`}
                        >
                          الخصم التلقائي
                        </th>
                        <th
                          style={{ width: '19%' }}
                          className={`w-[19%] px-3 ${
                            isFullscreen ? 'py-4 text-xs sm:text-[13px]' : 'py-3.5 text-xs'
                          } font-bold text-slate-500 text-right`}
                        >
                          كفاية الوحدة
                        </th>
                        <th
                          style={{ width: '10%' }}
                          className={`w-[10%] px-2 ${
                            isFullscreen ? 'py-4 text-xs sm:text-[13px]' : 'py-3.5 text-xs'
                          } font-bold text-slate-500 text-center`}
                        >
                          الإجراء
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {rows.map((row, idx) => {
                        const selectedItem =
                          activeInventory.find(
                            (it) => String(it.id) === String(row.lab_item_id)
                          ) ||
                          inventoryItems.find(
                            (it) => String(it.id) === String(row.lab_item_id)
                          );
                        const itemName = selectedItem?.name || row.item_name || 'صنف مخبري';
                        const itemUnit = (selectedItem?.unit || row.item_unit || 'وحدة').trim();
                        const isYield = row.consumption_mode === 'per_unit_yield';
                        const yieldVal = parseInt(toEnglishDigits(row.tests_per_unit), 10) || 1;
                        const qtyVal = parseFloat(toEnglishDigits(row.quantity_per_test)) || 1;
                        const computedDeduction =
                          isYield && yieldVal > 0
                            ? formatQty(1 / yieldVal)
                            : formatQty(qtyVal);

                        const rateSummaryText = formatLabConsumableRateText({
                          consumption_mode: row.consumption_mode,
                          tests_per_unit: yieldVal,
                          quantity_per_test: qtyVal,
                          item_unit: itemUnit
                        });

                        const isBeingEdited = isFormOpen && editingIdx === idx;

                        return (
                          <tr
                            key={row.lab_item_id || idx}
                            className={`transition-colors ${
                              isBeingEdited
                                ? 'bg-violet-50/70 hover:bg-violet-50'
                                : 'hover:bg-slate-50/50'
                            }`}
                          >
                            {/* 1. الترقيم (5%) */}
                            <td
                              style={{ width: '5%' }}
                              className={`w-[5%] px-2 ${
                                isFullscreen ? 'py-3.5 sm:py-4' : 'py-3'
                              } text-xs font-black text-slate-400 text-center align-middle font-mono`}
                            >
                              {idx + 1}
                            </td>

                            {/* 2. اسم الصنف (24%) */}
                            <td
                              style={{ width: '24%' }}
                              className={`w-[24%] px-4 ${
                                isFullscreen ? 'py-3.5 sm:py-4' : 'py-3'
                              } font-semibold text-slate-800 align-middle truncate`}
                              title={itemName}
                            >
                              <span
                                className={`font-bold text-slate-800 ${
                                  isFullscreen ? 'text-sm sm:text-[15px]' : 'text-sm'
                                }`}
                              >
                                {itemName}
                              </span>
                            </td>

                            {/* 3. نوع الصنف — يعرض نوع الوحدة (14%) */}
                            <td
                              style={{ width: '14%' }}
                              className={`w-[14%] px-3 ${
                                isFullscreen ? 'py-3.5 sm:py-4 text-xs sm:text-[13px]' : 'py-3 text-xs'
                              } text-right align-middle font-bold text-slate-600 truncate`}
                            >
                              {itemUnit}
                            </td>

                            {/* 4. طريقة الاحتساب (14%) */}
                            <td
                              style={{ width: '14%' }}
                              className={`w-[14%] px-3 ${
                                isFullscreen ? 'py-3.5 sm:py-4' : 'py-3'
                              } text-center align-middle`}
                            >
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 ${
                                  isFullscreen ? 'text-[11px] sm:text-xs' : 'text-[11px]'
                                } rounded-full font-bold border shadow-2xs whitespace-nowrap ${
                                  isYield
                                    ? 'bg-purple-50 text-purple-700 border-purple-200/70'
                                    : 'bg-teal-50 text-teal-700 border-teal-200/70'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    isYield ? 'bg-purple-500' : 'bg-teal-500'
                                  }`}
                                />
                                <span>{isYield ? 'سعة العبوة' : 'خصم مباشر'}</span>
                              </span>
                            </td>

                            {/* 5. الخصم التلقائي — خط وحجم موحد (14%) */}
                            <td
                              style={{ width: '14%' }}
                              className={`w-[14%] px-3 ${
                                isFullscreen ? 'py-3.5 sm:py-4' : 'py-3'
                              } text-center align-middle`}
                            >
                              <div
                                className={`inline-flex items-center justify-center gap-1 ${
                                  isFullscreen ? 'text-xs sm:text-[13px]' : 'text-xs'
                                } font-bold text-violet-700`}
                              >
                                <span dir="ltr">-{computedDeduction}</span>
                                <span>{itemUnit}</span>
                              </div>
                            </td>

                            {/* 6. كفاية الوحدة (19%) */}
                            <td
                              style={{ width: '19%' }}
                              className={`w-[19%] px-3 ${
                                isFullscreen ? 'py-3.5 sm:py-4 text-xs sm:text-[13px]' : 'py-3 text-xs'
                              } text-right align-middle font-bold text-slate-600 truncate`}
                              title={rateSummaryText}
                            >
                              {rateSummaryText}
                            </td>

                            {/* 7. الإجراء (10%) */}
                            <td
                              style={{ width: '10%' }}
                              className={`w-[10%] px-2 ${
                                isFullscreen ? 'py-3.5 sm:py-4' : 'py-3'
                              } text-center align-middle`}
                            >
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditRow(idx)}
                                  className={`${
                                    isFullscreen ? 'w-8 h-8' : 'w-7 h-7'
                                  } rounded-lg border shadow-2xs flex items-center justify-center active:scale-95 transition-all cursor-pointer ${
                                    isBeingEdited
                                      ? 'bg-violet-600 text-white border-violet-600'
                                      : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200/70'
                                  }`}
                                  title="تعديل هذا المستهلك"
                                >
                                  <Edit2 size={isFullscreen ? 13 : 12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRow(idx)}
                                  className={`${
                                    isFullscreen ? 'w-8 h-8' : 'w-7 h-7'
                                  } rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/70 shadow-2xs flex items-center justify-center active:scale-95 transition-all cursor-pointer`}
                                  title="إزالة الصنف من التحليل"
                                >
                                  <Trash2 size={isFullscreen ? 13 : 12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Floating Action Footer ── */}
        <div
          className={`${
            isFullscreen ? 'px-6 sm:px-8 py-4' : 'px-5 sm:px-6 py-3.5'
          } bg-white border-t border-slate-100 flex justify-between items-center z-20 flex-shrink-0 transition-all`}
        >
          <div
            className={`${
              isFullscreen ? 'text-xs sm:text-[13px]' : 'text-xs'
            } font-bold text-slate-400 hidden sm:block flex-1`}
          >
            <span className="flex items-center gap-2 text-violet-600">
              <FlaskConical size={isFullscreen ? 16 : 15} />
              <span>
                عند استلام العينة وبدء التحليل في شاشة المختبر، سيقوم النظام تلقائياً بخصم المقادير المحددة أعلاه لكل طلب تحليل.
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className={`flex-1 sm:flex-none ${
                isFullscreen ? 'h-11 px-6 text-sm' : 'h-10 px-5 text-xs sm:text-sm'
              } bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50 font-black rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center disabled:opacity-50`}
            >
              إغلاق
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={`flex-1 sm:flex-none ${
                isFullscreen ? 'h-11 px-7 text-sm' : 'h-10 px-6 text-xs sm:text-sm'
              } rounded-xl font-black text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-md shadow-violet-500/20 hover:shadow-lg hover:shadow-violet-500/30 border border-violet-500/30 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {saving ? (
                <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full inline-block" />
              ) : (
                <Check size={isFullscreen ? 17 : 16} strokeWidth={2.5} />
              )}
              <span>حفظ المستهلكات المرتبطة</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT: LabInventoryAdmin (1:1 Clone of RadiologyInventoryAdmin)
// ══════════════════════════════════════════════════════════════════════════════
export default function LabInventoryAdmin() {
  const { token } = useAuthStore();

  // Active Tab
  const [activeTab, setActiveTab] = useState('stock'); // 'stock' | 'bom' | 'transfers' | 'audit_log' | 'analytics'

  // Data States
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({
    totalItems: 0,
    lowStockCount: 0,
    negativeStockCount: 0,
    expiringSoonCount: 0,
    totalInventoryValue: 0,
    lowStockValue: 0,
    expiringStockValue: 0,
    negativeDeficitValue: 0,
    pendingTransfersCount: 0
  });
  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [transfersHistory, setTransfersHistory] = useState([]);
  const [consumptionLogs, setConsumptionLogs] = useState([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [logSummary, setLogSummary] = useState({
    total: 0,
    total_consumption_cost: 0,
    total_wastage_cost: 0,
    total_deducted_cost: 0,
    consumption_count: 0,
    wastage_count: 0,
    wastage_ratio_percent: 0
  });

  // BOM Data States
  const [labTests, setLabTests] = useState([]);
  const [consumablesByTest, setConsumablesByTest] = useState({});
  const [bomStats, setBomStats] = useState({
    totalTestsCount: 0,
    linkedTestsCount: 0,
    unlinkedTestsCount: 0,
    avgBomCost: 0,
    avgProfitMarginPercent: 0,
    lowMarginTestsCount: 0
  });
  const [loadingBom, setLoadingBom] = useState(false);
  const [bomSearch, setBomSearch] = useState('');
  const [bomStatusFilter, setBomStatusFilter] = useState('all'); // 'all' | 'linked' | 'unlinked'
  const [bomTargetTest, setBomTargetTest] = useState(null);

  // Financial & Operational Analytics States (Tab 5)
  const [analyticsTests, setAnalyticsTests] = useState([]);
  const [analyticsSummary, setAnalyticsSummary] = useState({
    total_tests_count: 0,
    active_executed_tests_count: 0,
    total_completed_executions: 0,
    total_paid_executions: 0,
    total_free_executions: 0,
    total_gross_revenue: 0,
    total_discounts: 0,
    total_net_revenue: 0,
    total_procedure_cogs: 0,
    total_test_wastage_cost: 0,
    unallocated_wastage_cost: 0,
    unallocated_wastage_count: 0,
    total_wastage_cost: 0,
    total_cogs_and_wastage: 0,
    net_operating_profit: 0,
    overall_profit_margin_percent: 0
  });
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsSearch, setAnalyticsSearch] = useState('');
  const [analyticsDateFilter, setAnalyticsDateFilter] = useState('all'); // 'all' | 'today' | 'week' | 'month' | 'custom'
  const [analyticsCustomRange, setAnalyticsCustomRange] = useState({ start: '', end: '' });
  const [analyticsMarginFilter, setAnalyticsMarginFilter] = useState('all'); // 'all' | 'executed' | 'high' | 'medium' | 'low'
  const [showAnalyticsMarginMenu, setShowAnalyticsMarginMenu] = useState(false);

  // Loadings
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [loadingTransfersHistory, setLoadingTransfersHistory] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [processingBatch, setProcessingBatch] = useState(null);

  // Batch Details Modal States
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedHistoryBatch, setSelectedHistoryBatch] = useState(null);
  const [rejectingBatch, setRejectingBatch] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Filters for Stock Tab
  const [stockSearch, setStockSearch] = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState('all'); // 'all' | 'normal' | 'low' | 'expiring_soon' | 'negative' | 'inactive'

  // Filters for Transfers History Section
  const [transferSearch, setTransferSearch] = useState('');
  const [transferStatusFilter, setTransferStatusFilter] = useState('all'); // 'all' | 'received' | 'rejected'
  const [showTransferStatusMenu, setShowTransferStatusMenu] = useState(false);
  const [transferDateFilter, setTransferDateFilter] = useState('all');
  const [transferCustomRange, setTransferCustomRange] = useState({ start: '', end: '' });
  const [transferHistoryPage, setTransferHistoryPage] = useState(1);

  // Filters for Consumption Log Tab
  const [logSearch, setLogSearch] = useState('');
  const [logTriggerFilter, setLogTriggerFilter] = useState('all');
  const [showTriggerMenu, setShowTriggerMenu] = useState(false);
  const [dateFilter, setDateFilter] = useState('all');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [logPage, setLogPage] = useState(1);

  // Archive / Report Preview Modal
  const [selectedVisitId, setSelectedVisitId] = useState(null);

  // ── Admin Item Add / Edit Modal States ────────────────────────────────────
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showUnitMenu, setShowUnitMenu] = useState(false);
  const [isUnitTyping, setIsUnitTyping] = useState(false);
  const [submittingItem, setSubmittingItem] = useState(false);
  const [itemForm, setItemForm] = useState({
    name: '',
    description: '',
    category: 'reagent',
    unit: 'عبوة',
    quantity: '0',
    min_quantity: '5',
    cost_price: '',
    expiry_date: '',
    is_active: 1
  });

  // All previous units used in inventory + standard UNIT_OPTIONS (deduplicated)
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
    UNIT_OPTIONS.forEach((u) => addUnit(u));
    return result;
  }, [items]);

  // Smart unit options: show all previous units on click/focus, and filter immediately when typing
  const filteredUnitOptions = useMemo(() => {
    const q = String(itemForm.unit || '').trim().toLowerCase();
    if (!isUnitTyping || !q) return allAvailableUnits;
    return allAvailableUnits.filter((u) => u.toLowerCase().includes(q));
  }, [allAvailableUnits, itemForm.unit, isUnitTyping]);

  // ── Admin Stock Adjustment Modal States ───────────────────────────────────
  const [adjustingItem, setAdjustingItem] = useState(null);
  const [adjustForm, setAdjustForm] = useState({
    mode: 'set', // 'set' | 'add' | 'deduct'
    quantity: '',
    reason: ''
  });
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  // ── Admin Delete / Toggle Active Confirmation Modal ───────────────────────
  const [deletingItem, setDeletingItem] = useState(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);

  // ── Manual Wastage Modal States ───────────────────────────────────────────
  const [isWastageModalOpen, setIsWastageModalOpen] = useState(false);
  const [showWastageItemMenu, setShowWastageItemMenu] = useState(false);
  const [showWastageReasonMenu, setShowWastageReasonMenu] = useState(false);
  const [wastageForm, setWastageForm] = useState({
    wastage_mode: 'item', // 'item' | 'test'
    item_id: '',
    lab_test_id: '',
    quantity: '',
    reason: WASTAGE_REASONS[0],
    notes: ''
  });
  const [submittingWastage, setSubmittingWastage] = useState(false);

  // ── 1. Fetch Inventory Items & Real-time Stats ──────────────────────────────
  const fetchInventory = useCallback(async () => {
    setLoadingItems(true);
    try {
      const res = await fetch('/api/lab/inventory/items?includeInactive=true', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setItems(data.items || []);
        if (data.stats) {
          setStats(data.stats);
        }
      } else {
        toast.error(data.message || 'فشل تحميل المخزون');
      }
    } catch (err) {
      console.error('fetchInventory error:', err);
      toast.error('خطأ في الاتصال بالخادم');
    } finally {
      setLoadingItems(false);
    }
  }, [token]);

  // ── 1b. Fetch Lab Tests & BOM Consumables ───────────────────────────────────
  const fetchBomData = useCallback(async () => {
    setLoadingBom(true);
    try {
      const [testsRes, bomRes] = await Promise.all([
        fetch('/api/admin/catalog/lab-tests', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/lab/inventory/test-consumables', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const testsData = await testsRes.json();
      const bomData = await bomRes.json();

      if (bomRes.ok) {
        const map = {};
        (bomData.consumables || []).forEach((c) => {
          if (!map[c.lab_test_id]) map[c.lab_test_id] = [];
          map[c.lab_test_id].push(c);
        });
        setConsumablesByTest(map);
        if (bomData.bomStats) {
          setBomStats(bomData.bomStats);
        }
      }

      if (testsRes.ok) {
        const bomTestsMap = new Map();
        (bomData?.tests || []).forEach((bt) => bomTestsMap.set(bt.id, bt));
        const rawTests = Array.isArray(testsData) ? testsData : [];
        const enrichedTests = rawTests.map((t) => {
          const bt = bomTestsMap.get(t.id);
          return bt
            ? {
                ...t,
                operational_cost: bt.operational_cost ?? 0,
                profit_per_test: bt.profit_per_test ?? (parseFloat(t.price) || 0),
                profit_margin_percent: bt.profit_margin_percent ?? 100
              }
            : t;
        });
        setLabTests(enrichedTests);
      } else if (bomRes.ok && Array.isArray(bomData.tests)) {
        setLabTests(bomData.tests);
      }
    } catch (err) {
      console.error('fetchBomData error:', err);
    } finally {
      setLoadingBom(false);
    }
  }, [token]);

  // ── 2. Fetch Pending Incoming Transfers ─────────────────────────────────────
  const fetchPendingTransfers = useCallback(async () => {
    setLoadingTransfers(true);
    try {
      const res = await fetch('/api/lab/inventory/transfers/pending', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setPendingTransfers(Array.isArray(data) ? data : []);
      } else {
        toast.error(data.message || 'فشل تحميل الشحنات الواردة');
      }
    } catch (err) {
      console.error('fetchPendingTransfers error:', err);
    } finally {
      setLoadingTransfers(false);
    }
  }, [token]);

  // ── 2b. Fetch Incoming Transfers History ────────────────────────────────────
  const fetchTransfersHistory = useCallback(async () => {
    setLoadingTransfersHistory(true);
    try {
      const queryParams = new URLSearchParams();
      if (transferStatusFilter !== 'all') queryParams.append('status', transferStatusFilter);
      if (transferSearch.trim()) queryParams.append('search', transferSearch.trim());

      if (transferDateFilter === 'custom' && transferCustomRange.start && transferCustomRange.end) {
        queryParams.append('startDate', transferCustomRange.start);
        queryParams.append('endDate', transferCustomRange.end);
      } else if (transferDateFilter !== 'all') {
        const now = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        const format = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        let start = '';
        if (transferDateFilter === 'today') {
          start = format(now);
        } else if (transferDateFilter === 'week') {
          const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          start = format(past);
        } else if (transferDateFilter === 'month') {
          const past = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          start = format(past);
        }
        queryParams.append('startDate', start);
        queryParams.append('endDate', format(now));
      }

      const res = await fetch(`/api/lab/inventory/transfers/history?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setTransfersHistory(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('fetchTransfersHistory error:', err);
    } finally {
      setLoadingTransfersHistory(false);
    }
  }, [token, transferStatusFilter, transferSearch, transferDateFilter, transferCustomRange]);

  // ── 3. Fetch Consumption Log ────────────────────────────────────────────────
  const fetchConsumptionLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const queryParams = new URLSearchParams();
      if (logTriggerFilter !== 'all') queryParams.append('trigger_type', logTriggerFilter);
      if (logSearch.trim()) queryParams.append('search', logSearch.trim());

      if (dateFilter === 'custom' && customRange.start && customRange.end) {
        queryParams.append('startDate', customRange.start);
        queryParams.append('endDate', customRange.end);
      } else if (dateFilter !== 'all') {
        const now = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        const format = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        let start = '';
        if (dateFilter === 'today') {
          start = format(now);
        } else if (dateFilter === 'week') {
          const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          start = format(past);
        } else if (dateFilter === 'month') {
          const past = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          start = format(past);
        }
        queryParams.append('startDate', start);
        queryParams.append('endDate', format(now));
      }

      queryParams.append('limit', '10000');
      queryParams.append('offset', '0');

      const res = await fetch(`/api/lab/inventory/consumption-log?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setConsumptionLogs(data.logs || data.data || []);
        setTotalLogs(data.total || 0);
        if (data.summary) {
          setLogSummary(data.summary);
        }
      }
    } catch (err) {
      console.error('fetchConsumptionLogs error:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [token, logTriggerFilter, logSearch, dateFilter, customRange]);

  // ── 4. Fetch Financial & Operational Analytics (Tab 5) ──────────────────────
  const fetchFinancialAnalytics = useCallback(async () => {
    setLoadingAnalytics(true);
    try {
      const queryParams = new URLSearchParams();
      if (analyticsDateFilter === 'custom' && analyticsCustomRange.start && analyticsCustomRange.end) {
        queryParams.append('startDate', analyticsCustomRange.start);
        queryParams.append('endDate', analyticsCustomRange.end);
      } else if (analyticsDateFilter !== 'all') {
        const now = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        const format = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        let start = '';
        if (analyticsDateFilter === 'today') {
          start = format(now);
        } else if (analyticsDateFilter === 'week') {
          const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          start = format(past);
        } else if (analyticsDateFilter === 'month') {
          const past = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          start = format(past);
        }
        queryParams.append('startDate', start);
        queryParams.append('endDate', format(now));
      }

      const res = await fetch(`/api/lab/inventory/financial-analytics?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setAnalyticsTests(Array.isArray(data.tests) ? data.tests : []);
        if (data.summary) {
          setAnalyticsSummary(data.summary);
        }
      } else {
        toast.error(data.message || 'فشل تحميل التحليل المالي والتشغيلي');
      }
    } catch (err) {
      console.error('fetchFinancialAnalytics error:', err);
    } finally {
      setLoadingAnalytics(false);
    }
  }, [token, analyticsDateFilter, analyticsCustomRange]);

  // Initial Data Fetch
  useEffect(() => {
    fetchInventory();
    fetchPendingTransfers();
    fetchBomData();
  }, [fetchInventory, fetchPendingTransfers, fetchBomData]);

  useEffect(() => {
    if (activeTab === 'transfers') {
      fetchTransfersHistory();
    } else if (activeTab === 'audit_log') {
      fetchConsumptionLogs();
    } else if (activeTab === 'bom') {
      fetchBomData();
    } else if (activeTab === 'analytics') {
      fetchFinancialAnalytics();
    }
  }, [activeTab, fetchTransfersHistory, fetchConsumptionLogs, fetchBomData, fetchFinancialAnalytics]);

  // Socket Realtime Synchronization
  useEffect(() => {
    joinRoom('auditor');
    const socket = getSocket();
    if (!socket) return;

    const handleInventoryUpdated = () => {
      fetchInventory();
      fetchPendingTransfers();
      fetchBomData();
      if (activeTab === 'transfers') fetchTransfersHistory();
      if (activeTab === 'audit_log') fetchConsumptionLogs();
      if (activeTab === 'analytics') fetchFinancialAnalytics();
    };

    const handleTransferSent = (data) => {
      const senderStore = data?.sender_name || (data?.from_store === 'or' ? 'مخزن العمليات' : 'المخزن العام');
      toast.info(`📦 شحنة جديدة واردة لقسم المختبر من ${senderStore} (${data?.item_count || 1} أصناف)`, {
        icon: '📦'
      });
      fetchPendingTransfers();
      fetchInventory();
      if (activeTab === 'transfers') fetchTransfersHistory();
    };

    const handleTransferRevoked = (data) => {
      const senderStore = data?.sender_name || 'المخزن المرسل';
      toast.info(`تم إلغاء وسحب الشحنة (${data?.batch_ref || ''}) من قبل ${senderStore}`);
      setSelectedBatch((prev) => (prev?.batch_ref === data?.batch_ref ? null : prev));
      fetchPendingTransfers();
      fetchInventory();
      if (activeTab === 'transfers') fetchTransfersHistory();
    };

    socket.on('inventory:updated', handleInventoryUpdated);
    socket.on('transfer:sent', handleTransferSent);
    socket.on('transfer:revoked', handleTransferRevoked);

    return () => {
      socket.off('inventory:updated', handleInventoryUpdated);
      socket.off('transfer:sent', handleTransferSent);
      socket.off('transfer:revoked', handleTransferRevoked);
    };
  }, [fetchInventory, fetchPendingTransfers, fetchTransfersHistory, fetchConsumptionLogs, fetchBomData, fetchFinancialAnalytics, activeTab]);

  // ── Action: Open Add / Edit Item Modal ──────────────────────────────────────
  const handleOpenAddItem = () => {
    setEditingItem(null);
    setShowCategoryMenu(false);
    setShowUnitMenu(false);
    setIsUnitTyping(false);
    setItemForm({
      name: '',
      description: '',
      category: 'reagent',
      unit: '',
      quantity: '0',
      min_quantity: '5',
      cost_price: '',
      expiry_date: '',
      is_active: 1
    });
    setIsItemModalOpen(true);
  };

  const handleOpenEditItem = (item) => {
    setEditingItem(item);
    setShowCategoryMenu(false);
    setShowUnitMenu(false);
    setIsUnitTyping(false);
    setItemForm({
      name: item.name || '',
      description: item.description || '',
      category: item.category || 'consumable',
      unit: item.unit || '',
      quantity: formatQty(item.quantity),
      min_quantity: formatQty(item.min_quantity),
      cost_price: Number(item.cost_price) > 0 ? formatQty(item.cost_price) : '',
      expiry_date: toInputDateValue(item.expiry_date),
      is_active: Number(item.is_active) === 0 ? 0 : 1
    });
    setIsItemModalOpen(true);
  };

  const handleSubmitItem = async (e) => {
    e.preventDefault();
    const cleanName = itemForm.name.trim();
    const cleanUnit = (itemForm.unit || '').trim();
    if (!cleanName) {
      return toast.warning('يرجى إدخال اسم الصنف');
    }
    if (!cleanUnit) {
      return toast.warning('يرجى إدخال وحدة القياس');
    }

    // Prevent adding/updating an item that already exists unless the unit is different
    const duplicateItem = items.find(
      (it) =>
        (!editingItem || Number(it.id) !== Number(editingItem.id)) &&
        String(it.name || '').trim().toLowerCase() === cleanName.toLowerCase() &&
        String(it.unit || '').trim().toLowerCase() === cleanUnit.toLowerCase()
    );
    if (duplicateItem) {
      return toast.warning('يوجد صنف مسجل بالفعل بنفس الاسم ونفس وحدة القياس! يجب اختلاف وحدة القياس لإضافته.');
    }

    const parsedMin = parseFloat(toEnglishDigits(itemForm.min_quantity));
    const parsedQty = parseFloat(toEnglishDigits(itemForm.quantity));
    const parsedCost = parseFloat(toEnglishDigits(String(itemForm.cost_price ?? '').replace(/,/g, '')));

    if (editingItem && (isNaN(parsedCost) || parsedCost <= 0)) {
      return toast.warning('يرجى إدخال سعر للصنف أعلى من 0 عند تعديل بيانات الصنف');
    }

    setSubmittingItem(true);
    try {
      const url = editingItem
        ? `/api/lab/inventory/items/${editingItem.id}`
        : '/api/lab/inventory/items';
      const method = editingItem ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: cleanName,
          description: itemForm.description.trim(),
          category: itemForm.category,
          unit: cleanUnit,
          quantity: isNaN(parsedQty) ? 0 : parsedQty,
          min_quantity: isNaN(parsedMin) ? 5 : Math.max(0, parsedMin),
          cost_price: isNaN(parsedCost) || parsedCost < 0 ? 0 : parsedCost,
          expiry_date: itemForm.expiry_date || null,
          is_active: itemForm.is_active
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || (editingItem ? 'تم تحديث بيانات الصنف بنجاح' : 'تم إضافة الصنف بنجاح'));
        setIsItemModalOpen(false);
        setEditingItem(null);
        fetchInventory();
        fetchBomData();
        if (activeTab === 'analytics') fetchFinancialAnalytics();
      } else {
        toast.error(data.message || 'فشل حفظ بيانات الصنف');
      }
    } catch (err) {
      console.error('handleSubmitItem error:', err);
      toast.error('خطأ في الاتصال بالخادم');
    } finally {
      setSubmittingItem(false);
    }
  };

  // ── Action: Open Stock Adjustment Modal ─────────────────────────────────────
  const handleOpenAdjustStock = (item) => {
    setAdjustingItem(item);
    setAdjustForm({
      mode: 'set',
      quantity: '',
      reason: ''
    });
  };

  const handleSubmitAdjustStock = async (e) => {
    e.preventDefault();
    if (!adjustingItem) return;

    const cleanStr = toEnglishDigits(adjustForm.quantity).trim();
    const parsedVal = parseFloat(cleanStr);
    if (isNaN(parsedVal)) {
      return toast.warning('يرجى إدخال كمية صحيحة');
    }
    if ((adjustForm.mode === 'add' || adjustForm.mode === 'deduct') && parsedVal <= 0) {
      return toast.warning('يرجى إدخال كمية أكبر من الصفر للإضافة أو الخصم');
    }
    if (!String(adjustForm.reason || '').trim()) {
      return toast.warning('يرجى إدخال سبب التسوية / الملاحظة (حقل إجباري)');
    }

    setSubmittingAdjust(true);
    try {
      const res = await fetch(`/api/lab/inventory/items/${adjustingItem.id}/adjust`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mode: adjustForm.mode,
          quantity: parsedVal,
          reason: adjustForm.reason.trim()
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'تم تعديل رصيد الصنف بنجاح');
        setAdjustingItem(null);
        fetchInventory();
      } else {
        toast.error(data.message || 'فشل تعديل رصيد الصنف');
      }
    } catch (err) {
      console.error('handleSubmitAdjustStock error:', err);
      toast.error('خطأ في الاتصال بالخادم');
    } finally {
      setSubmittingAdjust(false);
    }
  };

  // ── Action: Delete or Toggle Active Status ──────────────────────────────────
  const handleConfirmDeleteOrToggle = async () => {
    if (!deletingItem) return;
    setSubmittingDelete(true);
    try {
      const res = await fetch(`/api/lab/inventory/items/${deletingItem.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'تم تنفيذ الإجراء بنجاح');
        setDeletingItem(null);
        fetchInventory();
      } else {
        toast.error(data.message || 'فشل تنفيذ الإجراء');
      }
    } catch (err) {
      console.error('handleConfirmDeleteOrToggle error:', err);
      toast.error('خطأ في الاتصال بالخادم');
    } finally {
      setSubmittingDelete(false);
    }
  };

  // ── Action: Accept / Receive Batch ──────────────────────────────────────────
  const handleAcceptBatch = async (batchRefKey) => {
    setProcessingBatch(batchRefKey);
    try {
      const res = await fetch(`/api/lab/inventory/transfers/batch/${batchRefKey}/receive`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'تم تأكيد استلام الشحنة بنجاح');
        setSelectedBatch(null);
        fetchPendingTransfers();
        fetchTransfersHistory();
        fetchInventory();
      } else {
        toast.error(data.message || 'فشل تأكيد الاستلام');
      }
    } catch (err) {
      console.error('handleAcceptBatch error:', err);
      toast.error('حدث خطأ في الاتصال بالخادم');
    } finally {
      setProcessingBatch(null);
    }
  };

  // ── Action: Reject Batch ────────────────────────────────────────────────────
  const handleRejectBatch = async (batchRefKey) => {
    if (!rejectionReason.trim()) {
      return toast.warning('يرجى كتابة سبب رفض الشحنة');
    }

    setProcessingBatch(batchRefKey);
    try {
      const res = await fetch(`/api/lab/inventory/transfers/batch/${batchRefKey}/reject`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: rejectionReason.trim(), rejection_reason: rejectionReason.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        toast.info(data.message || 'تم رفض الشحنة الواردة وإعادتها للمخزن المرسل');
        setSelectedBatch(null);
        setRejectingBatch(null);
        setRejectionReason('');
        fetchPendingTransfers();
        fetchTransfersHistory();
        fetchInventory();
      } else {
        toast.error(data.message || 'فشل رفض الشحنة');
      }
    } catch (err) {
      console.error('handleRejectBatch error:', err);
      toast.error('حدث خطأ في الاتصال بالخادم');
    } finally {
      setProcessingBatch(null);
    }
  };

  // ── Action: Open & Submit Wastage Modal ─────────────────────────────────────
  const activeItemsList = useMemo(
    () => items.filter((it) => Number(it.is_active) !== 0),
    [items]
  );

  const testsWithBom = useMemo(
    () => labTests.filter((t) => (consumablesByTest[t.id] || []).length > 0),
    [labTests, consumablesByTest]
  );

  const handleOpenWastage = (preselectedItemId = '') => {
    setShowWastageItemMenu(false);
    setShowWastageReasonMenu(false);
    setWastageForm({
      wastage_mode: 'item',
      item_id: preselectedItemId || (activeItemsList[0]?.id || ''),
      lab_test_id: '',
      quantity: '',
      reason: WASTAGE_REASONS[0],
      notes: ''
    });
    setIsWastageModalOpen(true);
  };

  const handleSubmitWastage = async (e) => {
    e.preventDefault();
    const qty = parseFloat(toEnglishDigits(wastageForm.quantity));
    if (!wastageForm.item_id) {
      return toast.warning('يرجى تحديد الصنف المراد تسجيل هدر له');
    }
    if (isNaN(qty) || qty <= 0) {
      return toast.warning('يرجى إدخال كمية تالفة صحيحة أكبر من الصفر');
    }
    if (wastageForm.reason === 'أخرى' && !wastageForm.notes.trim()) {
      return toast.warning('يرجى كتابة الملاحظات التوضيحية عند اختيار سبب التلف (أخرى)');
    }

    setSubmittingWastage(true);
    try {
      const payload = {
        item_id: wastageForm.item_id,
        quantity: qty,
        reason: wastageForm.reason,
        notes: wastageForm.notes.trim()
      };

      const res = await fetch('/api/lab/inventory/wastage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'تم تسجيل الهدر وخصم الكمية بنجاح');
        setIsWastageModalOpen(false);
        setShowWastageItemMenu(false);
        setShowWastageReasonMenu(false);
        fetchInventory();
        if (activeTab === 'audit_log') fetchConsumptionLogs();
      } else {
        toast.error(data.message || 'فشل تسجيل الهدر');
      }
    } catch (err) {
      console.error('handleSubmitWastage error:', err);
      toast.error('حدث خطأ في الاتصال بالخادم');
    } finally {
      setSubmittingWastage(false);
    }
  };

  // Check if any inactive items exist
  const hasInactiveItems = useMemo(
    () => items.some((it) => Number(it.is_active) === 0),
    [items]
  );

  // Filtered Items for Stock Tab
  const filteredItems = useMemo(() => {
    const qStr = stockSearch.trim().toLowerCase();
    return items.filter((it) => {
      const itemName = String(it.name || '').toLowerCase();
      const itemUnit = String(it.unit || '').toLowerCase();
      const itemDesc = String(it.description || '').toLowerCase();
      const itemTypeLabel = getCategoryShortLabel(it.category, it.unit).toLowerCase();

      const matchSearch =
        qStr === '' ||
        itemName.includes(qStr) ||
        itemUnit.includes(qStr) ||
        itemDesc.includes(qStr) ||
        itemTypeLabel.includes(qStr);

      const isActive = Number(it.is_active) !== 0;
      const q = parseFloat(it.quantity) || 0;
      const min = parseFloat(it.min_quantity) || 0;
      const expiryInfo = getExpiryInfo(it.expiry_date);

      let matchStatus = true;
      if (stockStatusFilter === 'inactive') {
        matchStatus = !isActive;
      } else if (stockStatusFilter === 'negative') {
        matchStatus = isActive && q < 0;
      } else if (stockStatusFilter === 'low') {
        matchStatus = isActive && q >= 0 && q <= min;
      } else if (stockStatusFilter === 'normal') {
        matchStatus = isActive && q > min && !expiryInfo.isExpired && !expiryInfo.isExpiringSoon;
      } else if (stockStatusFilter === 'expiring_soon') {
        matchStatus = isActive && (expiryInfo.isExpired || expiryInfo.isExpiringSoon);
      }

      return matchSearch && matchStatus;
    });
  }, [items, stockSearch, stockStatusFilter]);

  // Filtered Lab Tests for BOM Tab
  const filteredBomTests = useMemo(() => {
    const qStr = bomSearch.trim().toLowerCase();
    return labTests.filter((t) => {
      const links = consumablesByTest[t.id] || [];
      const isLinked = links.length > 0;
      if (bomStatusFilter === 'linked' && !isLinked) return false;
      if (bomStatusFilter === 'unlinked' && isLinked) return false;

      if (!qStr) return true;
      const nameMatch = String(t.name || '').toLowerCase().includes(qStr);
      const catMatch = String(t.category_name || '').toLowerCase().includes(qStr);
      const itemMatch = links.some((l) => String(l.item_name || '').toLowerCase().includes(qStr));
      return nameMatch || catMatch || itemMatch;
    });
  }, [labTests, consumablesByTest, bomSearch, bomStatusFilter]);

  // Filtered & Paginated Transfers History
  const filteredTransfersHistory = useMemo(() => {
    const qStr = transferSearch.trim().toLowerCase();
    if (!qStr) return transfersHistory;

    return transfersHistory.filter((batch) => {
      const sender = formatSenderName(batch).toLowerCase();
      const actionBy = String(batch.action_by_name || '').toLowerCase();
      if (sender.includes(qStr) || actionBy.includes(qStr)) return true;

      return (batch.items || []).some((it) => {
        const name = String(it.item_name || it.name || '').toLowerCase();
        const unit = String(it.unit || it.item_unit || '').toLowerCase();
        const typeLabel = getCategoryShortLabel(it.category, it.unit || it.item_unit).toLowerCase();
        return name.includes(qStr) || unit.includes(qStr) || typeLabel.includes(qStr);
      });
    });
  }, [transfersHistory, transferSearch]);

  const paginatedTransfersHistory = useMemo(() => {
    const start = (transferHistoryPage - 1) * TRANSFERS_HISTORY_PAGE_SIZE;
    return filteredTransfersHistory.slice(start, start + TRANSFERS_HISTORY_PAGE_SIZE);
  }, [filteredTransfersHistory, transferHistoryPage]);

  const totalTransferHistoryPages = Math.ceil(filteredTransfersHistory.length / TRANSFERS_HISTORY_PAGE_SIZE) || 1;

  // Live count of active items that are near expiry (<= 90 days) or already expired
  const expiringOrExpiredCount = useMemo(() => {
    if (!activeItemsList || activeItemsList.length === 0) return stats.expiringSoonCount || 0;
    return activeItemsList.filter((it) => {
      const info = getExpiryInfo(it.expiry_date);
      return info.isExpired || info.isExpiringSoon;
    }).length;
  }, [activeItemsList, stats.expiringSoonCount]);

  // Filtered Analytics Tests & Filtered Grand Totals (Tab 5)
  const filteredAnalyticsTests = useMemo(() => {
    const qStr = analyticsSearch.trim().toLowerCase();
    return analyticsTests.filter((t) => {
      if (analyticsMarginFilter === 'executed' && !(t.total_executions > 0 || t.total_cogs > 0)) {
        return false;
      }
      if (analyticsMarginFilter === 'high' && !(t.profit_margin_percent > 50)) {
        return false;
      }
      if (
        analyticsMarginFilter === 'medium' &&
        !(t.profit_margin_percent >= 20 && t.profit_margin_percent <= 50)
      ) {
        return false;
      }
      if (analyticsMarginFilter === 'low' && !(t.profit_margin_percent < 20)) {
        return false;
      }

      if (!qStr) return true;
      const nameMatch = String(t.test_name || '').toLowerCase().includes(qStr);
      const catMatch = String(t.category_name || '').toLowerCase().includes(qStr);
      return nameMatch || catMatch;
    });
  }, [analyticsTests, analyticsSearch, analyticsMarginFilter]);

  const filteredAnalyticsTotals = useMemo(() => {
    let executions = 0;
    let paidExecutions = 0;
    let freeExecutions = 0;
    let grossRevenue = 0;
    let discounts = 0;
    let revenue = 0;
    let procedureCogs = 0;
    let testWastage = 0;

    filteredAnalyticsTests.forEach((t) => {
      executions += Number(t.total_executions || 0);
      paidExecutions += Number(t.paid_executions || 0);
      freeExecutions += Number(t.free_executions || 0);
      grossRevenue += parseFloat(t.gross_revenue) || 0;
      discounts += parseFloat(t.total_discounts) || 0;
      revenue += parseFloat(t.total_revenue) || 0;
      procedureCogs += parseFloat(t.effective_procedure_cogs) || 0;
      testWastage += parseFloat(t.wastage_cost) || 0;
    });

    const isUnfilteredView = !analyticsSearch.trim() && analyticsMarginFilter === 'all';
    const unallocWastage = isUnfilteredView
      ? parseFloat(analyticsSummary.unallocated_wastage_cost) || 0
      : 0;
    const totalCogs = Number((procedureCogs + testWastage + unallocWastage).toFixed(2));
    const totalRevenue = Number(revenue.toFixed(2));
    const netProfit = Number((totalRevenue - totalCogs).toFixed(2));
    const marginPercent =
      totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(1)) : 0;

    return {
      executions,
      paidExecutions,
      freeExecutions,
      grossRevenue: Number(grossRevenue.toFixed(2)),
      discounts: Number(discounts.toFixed(2)),
      totalRevenue,
      procedureCogs: Number(procedureCogs.toFixed(2)),
      testWastage: Number(testWastage.toFixed(2)),
      unallocWastage: Number(unallocWastage.toFixed(2)),
      totalCogs,
      netProfit,
      marginPercent
    };
  }, [filteredAnalyticsTests, analyticsSearch, analyticsMarginFilter, analyticsSummary]);

  // Contextual Quick Stats Cards (Dynamically adapts to activeTab)
  const statsCards = useMemo(() => {
    const sumBatchItemsValue = (batch) =>
      (batch?.items || []).reduce((acc, it) => {
        const qty = parseFloat(it.sent_quantity ?? it.quantity) || 0;
        const price = parseFloat(it.cost_price ?? it.unit_price) || 0;
        return acc + qty * price;
      }, 0);

    switch (activeTab) {
      case 'bom': {
        const linkedCount = bomStats.linkedTestsCount || testsWithBom.length;
        const totalCount = bomStats.totalTestsCount || labTests.length;
        const unlinkedCount =
          bomStats.unlinkedTestsCount || Math.max(0, totalCount - linkedCount);
        const lowMarginCount = bomStats.lowMarginTestsCount || 0;

        return [
          {
            id: 'bom_linked',
            label: 'تحاليل مربوطة بوصفات',
            value: linkedCount,
            unit: 'تحليل',
            sub: `من أصل (${totalCount}) تحليل معرّف في دليل المختبر`,
            icon: FlaskConical,
            color: 'text-purple-600',
            bg: 'bg-purple-100',
            border: 'border-purple-200',
            onClick: () => setBomStatusFilter('linked')
          },
          {
            id: 'bom_avg_margin',
            label: 'متوسط هامش الربح القياسي',
            value: `${bomStats.avgProfitMarginPercent || 0}%`,
            unit: '',
            sub: 'متوسط العائد المعياري مقارنة بسعر البيع في الدليل',
            icon: Percent,
            color:
              (bomStats.avgProfitMarginPercent || 0) >= 50
                ? 'text-emerald-600'
                : (bomStats.avgProfitMarginPercent || 0) >= 20
                ? 'text-amber-600'
                : 'text-rose-600',
            bg:
              (bomStats.avgProfitMarginPercent || 0) >= 50
                ? 'bg-emerald-100'
                : (bomStats.avgProfitMarginPercent || 0) >= 20
                ? 'bg-amber-100'
                : 'bg-rose-100',
            border:
              (bomStats.avgProfitMarginPercent || 0) >= 50
                ? 'border-emerald-200'
                : (bomStats.avgProfitMarginPercent || 0) >= 20
                ? 'border-amber-200'
                : 'border-rose-200',
            onClick: () => setBomStatusFilter('linked')
          },
          {
            id: 'bom_unlinked',
            label: 'تحاليل غير مربوطة',
            value: unlinkedCount,
            unit: 'تحليل',
            sub:
              unlinkedCount > 0
                ? 'تحاليل لم تُربط بمستهلكات مخزنية بعد'
                : 'جميع التحاليل مربوطة بوصفات استهلاك',
            icon: AlertTriangle,
            color: 'text-amber-600',
            bg: 'bg-amber-100',
            border: 'border-amber-200',
            onClick: () => setBomStatusFilter('unlinked')
          },
          {
            id: 'bom_low_margin',
            label: 'ربحية حرجة (< 20%)',
            value: lowMarginCount,
            unit: 'تحليل',
            sub:
              lowMarginCount > 0
                ? 'تحاليل تكلفتها التشغيلية مرتفعة مقارنة بسعر البيع'
                : 'جميع الوصفات المربوطة تحقق هامش ربح آمن',
            icon: ShieldAlert,
            color: 'text-rose-600',
            bg: 'bg-rose-100',
            border:
              lowMarginCount > 0
                ? 'border-rose-300 ring-2 ring-rose-300/40'
                : 'border-rose-200',
            onClick: () => setBomStatusFilter('linked')
          }
        ];
      }

      case 'transfers': {
        const pendingVal = pendingTransfers.reduce((s, b) => s + sumBatchItemsValue(b), 0);
        const receivedBatches = filteredTransfersHistory.filter((b) => b.status !== 'rejected');
        const rejectedBatches = filteredTransfersHistory.filter((b) => b.status === 'rejected');
        const receivedVal = receivedBatches.reduce((s, b) => s + sumBatchItemsValue(b), 0);
        const rejectedVal = rejectedBatches.reduce((s, b) => s + sumBatchItemsValue(b), 0);

        return [
          {
            id: 'tr_pending',
            label: 'شحنات معلقة بانتظار الاستلام',
            value: pendingTransfers.length,
            unit: 'شحنة',
            sub:
              pendingTransfers.length > 0
                ? `بقيمة إجمالية معلقة: ${formatCurrency(pendingVal)} ر.ي`
                : 'لا توجد شحنات معلقة بانتظار المراجعة حالياً',
            icon: Truck,
            color: 'text-emerald-600',
            bg: 'bg-emerald-100',
            border:
              pendingTransfers.length > 0
                ? 'border-emerald-300 ring-2 ring-emerald-300/40'
                : 'border-emerald-200',
            onClick: () => setTransferStatusFilter('all')
          },
          {
            id: 'tr_received_val',
            label: 'إجمالي قيمة الشحنات المستلمة',
            value: formatCurrency(receivedVal),
            unit: 'ر.ي',
            sub: `التكلفة المالية للتوريدات المؤكدة (${receivedBatches.length} شحنة)`,
            icon: Wallet,
            color: 'text-purple-600',
            bg: 'bg-purple-100',
            border: 'border-purple-200',
            onClick: () => setTransferStatusFilter('received')
          },
          {
            id: 'tr_received_count',
            label: 'الشحنات المستلمة المؤكدة',
            value: receivedBatches.length,
            unit: 'شحنة',
            sub: 'دفعات تم فحصها وإضافتها لرصيد مخزن المختبر',
            icon: Check,
            color: 'text-indigo-600',
            bg: 'bg-indigo-100',
            border: 'border-indigo-200',
            onClick: () => setTransferStatusFilter('received')
          },
          {
            id: 'tr_rejected',
            label: 'الشحنات المرفوضة والمرجعة',
            value: rejectedBatches.length,
            unit: 'شحنة',
            sub:
              rejectedBatches.length > 0
                ? `بقيمة مستردة للمخزن المرسل: ${formatCurrency(rejectedVal)} ر.ي`
                : 'لا توجد شحنات مرفوضة ضمن الفترة المحددة',
            icon: ShieldAlert,
            color: 'text-rose-600',
            bg: 'bg-rose-100',
            border: 'border-rose-200',
            onClick: () => setTransferStatusFilter('rejected')
          }
        ];
      }

      case 'audit_log': {
        const wastageRatio = logSummary.wastage_ratio_percent || 0;
        return [
          {
            id: 'log_cogs',
            label: 'تكلفة استهلاك التحاليل (COGS)',
            value: formatCurrency(logSummary.total_consumption_cost),
            unit: 'ر.ي',
            sub: `إجمالي تكلفة المستهلكات لعدد (${logSummary.consumption_count || 0}) حركة تحليل`,
            icon: Activity,
            color: 'text-purple-600',
            bg: 'bg-purple-100',
            border: 'border-purple-200',
            onClick: () => {
              setLogTriggerFilter('procedure_consumption');
              setLogPage(1);
            }
          },
          {
            id: 'log_wastage',
            label: 'إجمالي خسائر الهدر والتوالف',
            value: formatCurrency(logSummary.total_wastage_cost),
            unit: 'ر.ي',
            sub: `قيمة التوالف والإعادات لعدد (${logSummary.wastage_count || 0}) حركة إتلاف`,
            icon: Trash2,
            color: 'text-rose-600',
            bg: 'bg-rose-100',
            border:
              (logSummary.total_wastage_cost || 0) > 0
                ? 'border-rose-300 ring-2 ring-rose-300/30'
                : 'border-rose-200',
            onClick: () => {
              setLogTriggerFilter('wastage');
              setLogPage(1);
            }
          },
          {
            id: 'log_total_deducted',
            label: 'إجمالي التكلفة المخصومة',
            value: formatCurrency(logSummary.total_deducted_cost),
            unit: 'ر.ي',
            sub: 'مجموع تكاليف الاستهلاك الفعلي والهدر المسجل',
            icon: Wallet,
            color: 'text-indigo-600',
            bg: 'bg-indigo-100',
            border: 'border-indigo-200',
            onClick: () => {
              setLogTriggerFilter('all');
              setLogPage(1);
            }
          },
          {
            id: 'log_wastage_ratio',
            label: 'نسبة الهدر من إجمالي الصرف',
            value: `${wastageRatio}%`,
            unit: '',
            sub: `من إجمالي (${logSummary.total || totalLogs}) حركة مخزنية مسجلة`,
            icon: Percent,
            color: wastageRatio > 10 ? 'text-rose-600' : 'text-emerald-600',
            bg: wastageRatio > 10 ? 'bg-rose-100' : 'bg-emerald-100',
            border: wastageRatio > 10 ? 'border-rose-200' : 'border-emerald-200',
            onClick: () => {
              setLogTriggerFilter('all');
              setLogPage(1);
            }
          }
        ];
      }

      case 'analytics': {
        const netProfit = analyticsSummary.net_operating_profit || 0;
        return [
          {
            id: 'an_revenue',
            label: 'إجمالي إيرادات التحاليل',
            value: formatCurrency(analyticsSummary.total_net_revenue),
            unit: 'ر.ي',
            sub: `صافي الإيراد المحصل (قبل الخصم: ${formatCurrency(analyticsSummary.total_gross_revenue)} ر.ي)`,
            icon: DollarSign,
            color: 'text-emerald-600',
            bg: 'bg-emerald-100',
            border: 'border-emerald-200',
            onClick: () => setAnalyticsMarginFilter('executed')
          },
          {
            id: 'an_cogs',
            label: 'إجمالي تكلفة المستهلكات (COGS)',
            value: formatCurrency(analyticsSummary.total_cogs_and_wastage),
            unit: 'ر.ي',
            sub: `استهلاك: ${formatCurrency(analyticsSummary.total_procedure_cogs)} ر.ي | هدر: ${formatCurrency(analyticsSummary.total_wastage_cost)} ر.ي`,
            icon: Calculator,
            color: 'text-rose-600',
            bg: 'bg-rose-100',
            border: 'border-rose-200',
            onClick: () => setAnalyticsMarginFilter('all')
          },
          {
            id: 'an_profit',
            label: 'صافي الربح التشغيلي للمختبر',
            value: formatCurrency(netProfit),
            unit: 'ر.ي',
            sub: 'العائد الصافي بعد خصم كافة المستهلكات والتوالف',
            icon: TrendingUp,
            color: netProfit >= 0 ? 'text-purple-600' : 'text-rose-600',
            bg: netProfit >= 0 ? 'bg-purple-100' : 'bg-rose-100',
            border: netProfit >= 0 ? 'border-purple-200' : 'border-rose-300',
            onClick: () => setAnalyticsMarginFilter('high')
          },
          {
            id: 'an_execs',
            label: 'إجمالي الفحوصات المنفذة',
            value: analyticsSummary.total_completed_executions || 0,
            unit: 'تحليل',
            sub: `مدفوع: ${analyticsSummary.total_paid_executions || 0} | مجاني/معفى: ${analyticsSummary.total_free_executions || 0}`,
            icon: Award,
            color: 'text-indigo-600',
            bg: 'bg-indigo-100',
            border: 'border-indigo-200',
            onClick: () => setAnalyticsMarginFilter('executed')
          }
        ];
      }

      case 'stock':
      default: {
        const stockCards = [
          {
            id: 'stock_val',
            label: 'إجمالي القيمة السوقية للمخزون',
            value: formatCurrency(stats.totalInventoryValue),
            unit: 'ر.ي',
            sub: `تقييم الأرصدة المتوفرة (${stats.totalItems} صنف نشط)`,
            icon: Wallet,
            color: 'text-purple-600',
            bg: 'bg-purple-100',
            border: 'border-purple-200',
            onClick: () => {
              setActiveTab('stock');
              setStockStatusFilter('all');
            }
          },
          {
            id: 'total',
            label: 'إجمالي أصناف القسم',
            value: stats.totalItems,
            unit: 'صنف',
            sub: 'الأصناف والمحاليل المعرّفة في مخزن المختبر',
            icon: Package,
            color: 'text-indigo-600',
            bg: 'bg-indigo-100',
            border: 'border-indigo-200',
            onClick: () => {
              setActiveTab('stock');
              setStockStatusFilter('all');
            }
          }
        ];

        if ((stats.lowStockCount || 0) > 0) {
          stockCards.push({
            id: 'low',
            label: 'أصناف منخفضة الرصيد',
            value: stats.lowStockCount,
            unit: 'صنف',
            sub: `قيمتها: ${formatCurrency(stats.lowStockValue)} ر.ي — تتطلب تزويد`,
            icon: AlertTriangle,
            color: 'text-amber-600',
            bg: 'bg-amber-100',
            border: 'border-amber-200',
            onClick: () => {
              setActiveTab('stock');
              setStockStatusFilter('low');
            }
          });
        }

        if ((expiringOrExpiredCount || 0) > 0) {
          stockCards.push({
            id: 'expiring',
            label: 'قريبة الانتهاء أو منتهية',
            value: expiringOrExpiredCount,
            unit: 'صنف',
            sub: `قيمة معرضة للخطر: ${formatCurrency(stats.expiringStockValue)} ر.ي`,
            icon: Clock,
            color: 'text-orange-600',
            bg: 'bg-orange-100',
            border: 'border-orange-300 ring-2 ring-orange-300/30',
            onClick: () => {
              setActiveTab('stock');
              setStockStatusFilter('expiring_soon');
            }
          });
        }

        if ((stats.negativeStockCount || 0) > 0) {
          stockCards.push({
            id: 'negative',
            label: 'عجز المخزون (رصيد سالب)',
            value: stats.negativeStockCount,
            unit: 'صنف',
            sub: `قيمة العجز: ${formatCurrency(stats.negativeDeficitValue)} ر.ي — تتطلب تغذية`,
            icon: ShieldAlert,
            color: 'text-rose-600',
            bg: 'bg-rose-100',
            border: 'border-rose-300 ring-2 ring-rose-300/40',
            onClick: () => {
              setActiveTab('stock');
              setStockStatusFilter('negative');
            }
          });
        }

        return stockCards;
      }
    }
  }, [
    activeTab,
    stats,
    expiringOrExpiredCount,
    bomStats,
    testsWithBom.length,
    labTests.length,
    pendingTransfers,
    filteredTransfersHistory,
    logSummary,
    totalLogs,
    analyticsSummary
  ]);

  // Filtered Consumption Logs
  const filteredConsumptionLogs = useMemo(() => {
    const validLogs = consumptionLogs.filter(
      (log) => log.trigger_type !== 'reversal' && !(parseFloat(log.qty_deducted) < 0)
    );
    const qStr = logSearch.trim().toLowerCase();
    if (!qStr) return validLogs;

    return validLogs.filter((log) => {
      const itemName = String(log.item_name || '').toLowerCase();
      const itemUnit = String(log.resolved_unit || log.item_unit || '').toLowerCase();
      const techName = String(log.technician_name || '').toLowerCase();
      const itemTypeLabel = getCategoryShortLabel(log.category, log.resolved_unit || log.item_unit).toLowerCase();
      const labTestName = String(log.service_name || '').toLowerCase();
      const movementType = log.trigger_type === 'wastage' ? 'إتلاف اتلاف' : 'استهلاك';

      return (
        itemName.includes(qStr) ||
        itemUnit.includes(qStr) ||
        techName.includes(qStr) ||
        itemTypeLabel.includes(qStr) ||
        labTestName.includes(qStr) ||
        movementType.includes(qStr)
      );
    });
  }, [consumptionLogs, logSearch]);

  // Main Tabs Configuration (5 Tabs)
  const TABS = useMemo(
    () => [
      {
        id: 'stock',
        label: 'إدارة الأصناف والمخزون',
        icon: Package,
        badgeCount: items.length
      },
      {
        id: 'bom',
        label: 'وصفات التحاليل',
        icon: FlaskConical,
        badgeCount: testsWithBom.length
      },
      {
        id: 'transfers',
        label: 'الشحنات الواردة',
        icon: ArrowDownRight,
        badgeCount: stats.pendingTransfersCount
      },
      {
        id: 'audit_log',
        label: 'سجل الاستهلاك والهدر',
        icon: FileText
      },
      {
        id: 'analytics',
        label: 'التحليل المالي والتشغيلي',
        icon: TrendingUp
      }
    ],
    [items.length, testsWithBom.length, stats.pendingTransfersCount]
  );

  const totalLogPages = Math.ceil(totalLogs / LOG_PAGE_SIZE) || 1;

  const statsGridColsClass =
    statsCards.length === 1
      ? 'grid-cols-1'
      : statsCards.length === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : statsCards.length === 3
      ? 'grid-cols-1 sm:grid-cols-3'
      : statsCards.length === 4
      ? 'grid-cols-2 md:grid-cols-4'
      : 'grid-cols-2 md:grid-cols-5';

  return (
    <div className="space-y-6 w-full p-6" dir="rtl">
      {/* ── 1. Page Header Banner (Exact 1:1 Match with RadiologyInventoryAdmin) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 flex-shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-800 text-white flex items-center justify-center shadow-md shadow-purple-500/20">
            <Package size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800">إدارة مخزن ومستهلكات المختبر</h1>
            <p className="text-sm font-bold text-gray-500 mt-0.5">
              التحكم بأصناف وأرصدة القسم، تقييم تكلفة الوصفات، وتحليل الإيرادات وتكلفة المستهلكات (COGS)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenAddItem}
            className="bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white flex items-center gap-2 text-xs md:text-sm font-black py-2.5 px-4 shadow-sm shadow-purple-600/20 rounded-2xl transition-all active:scale-95 cursor-pointer"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>إضافة صنف جديد</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenWastage()}
            className="bg-white hover:bg-rose-50 border border-slate-200/90 text-rose-700 flex items-center gap-2 text-xs md:text-sm font-bold py-2.5 px-4 shadow-xs rounded-2xl transition-all hover:border-rose-300 active:scale-95 group cursor-pointer"
          >
            <Trash2 size={16} className="text-rose-600 group-hover:scale-110 transition-transform" />
            <span>تسجيل هدر / إتلاف</span>
          </button>
        </div>
      </div>

      {/* ── 2. Contextual Quick Stats Grid (Dynamic 2, 3, 4, or 5 Cards) ──────── */}
      <div className={`grid ${statsGridColsClass} gap-3.5 w-full flex-shrink-0`}>
        {statsCards.map((s, i) => (
          <div
            key={s.id || i}
            onClick={s.onClick}
            className={`p-4 rounded-2xl border ${s.border} bg-white shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden flex flex-col justify-between isolate group cursor-pointer`}
          >
            <div
              className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${s.bg} to-transparent opacity-50 rounded-bl-full z-[-1] transition-transform duration-500 group-hover:scale-110`}
            />
            <div className="flex justify-between items-start mb-3">
              <div
                className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center shadow-sm transition-transform group-hover:scale-105`}
              >
                <s.icon size={16} className={s.color} />
              </div>
              <span
                className={`text-[11px] font-bold ${s.color} px-2.5 py-1 bg-white/80 backdrop-blur rounded-lg shadow-sm border border-white/50`}
              >
                {s.label}
              </span>
            </div>
            <div>
              {(activeTab === 'stock' && loadingItems) ||
              (activeTab === 'bom' && loadingBom) ||
              (activeTab === 'audit_log' && loadingLogs) ||
              (activeTab === 'analytics' && loadingAnalytics) ? (
                <div className="h-7 bg-gray-100 rounded-lg animate-pulse w-24"></div>
              ) : (
                <p
                  className="text-xl font-black text-gray-800 flex items-baseline justify-end gap-1.5 transition-opacity duration-200"
                  dir="ltr"
                >
                  {s.unit ? <span className="text-xs font-bold text-gray-400 uppercase">{s.unit}</span> : null}
                  <span>{s.value}</span>
                </p>
              )}
              {s.sub ? (
                <p className="text-[10px] text-gray-400 font-semibold mt-1 truncate text-right" title={s.sub} dir="rtl">
                  {s.sub}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* ── Emergency Negative Stock Banner (If applicable) ───────────────────── */}
      {stats.negativeStockCount > 0 && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-center justify-between gap-3 text-rose-800 shadow-sm animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
              <AlertOctagon className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-sm md:text-base">
                تنبيه عجز بالمخزون ({stats.negativeStockCount} أصناف برصيد سالب)
              </h4>
              <p className="text-xs text-rose-700 mt-0.5 font-semibold">
                توجد أصناف برصيد سالب نتيجة استمرار إجراء التحاليل للمرضى بدون انقطاع — يمكنك تسوية الرصيد مباشرة أو تأكيد الشحنات الواردة لإعادة موازنة الرصيد.
              </p>
            </div>
          </div>
          {stats.pendingTransfersCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('transfers')}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shrink-0 shadow-sm cursor-pointer"
            >
              عرض الشحنات الواردة
            </button>
          )}
        </div>
      )}

      {/* ── 3. Workspace Tab Selector (Proportional 5-Tab Layout & Balanced Spacing) ── */}
      <div className="w-full">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 p-2 gap-2.5 bg-slate-100/90 backdrop-blur-md rounded-2xl border border-slate-200/80 w-full shadow-xs">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs md:text-sm font-black transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-white text-purple-700 shadow-sm border border-gray-100 border-b-purple-600'
                    : 'text-slate-600 hover:bg-white/60 hover:text-slate-800 border-transparent'
                }`}
              >
                <tab.icon size={16} className="shrink-0" />
                <span>{tab.label}</span>
                {typeof tab.badgeCount === 'number' && tab.badgeCount > 0 && (
                  <span
                    className={`text-[11px] font-black px-2 py-0.5 rounded-full leading-none shrink-0 ${
                      tab.id === 'transfers'
                        ? 'bg-emerald-100 text-emerald-700 animate-pulse'
                        : isActive
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {tab.badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── TAB 1: ITEM & STOCK CONTROL ───────────────────────────────────────── */}
      {activeTab === 'stock' && (
        <div className="space-y-4">
          {/* Filter Toolbar */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4 flex-shrink-0">
            <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4">
              {/* Search Bar */}
              <div className="relative w-full xl:w-96">
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                  <Search size={16} strokeWidth={2.2} />
                </div>
                <input
                  type="text"
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  placeholder="بحث باسم الصنف، الوصف، أو نوع الصنف (الوحدة)..."
                  className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-purple-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200/60 shadow-xs transition-all"
                />
                {stockSearch && (
                  <button
                    type="button"
                    onClick={() => setStockSearch('')}
                    className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    title="مسح البحث"
                  >
                    <div className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                      <X size={12} strokeWidth={2.5} />
                    </div>
                  </button>
                )}
              </div>

              {/* Status Filter Tabs */}
              <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto justify-between xl:justify-end">
                <div className="flex gap-1 bg-gray-100/90 p-1.5 rounded-2xl text-xs font-bold text-gray-500 overflow-x-auto">
                  {[
                    { id: 'all', label: 'الكل' },
                    { id: 'normal', label: 'متوفر' },
                    { id: 'low', label: 'منخفض الرصيد' },
                    { id: 'expiring_soon', label: 'قريب الانتهاء / منتهي' },
                    { id: 'negative', label: 'رصيد سالب (عجز)' },
                    ...(hasInactiveItems ? [{ id: 'inactive', label: 'موقوف' }] : [])
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setStockStatusFilter(t.id)}
                      className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-bold cursor-pointer ${
                        stockStatusFilter === t.id
                          ? 'bg-white text-purple-800 shadow-xs font-black'
                          : 'hover:bg-white/40 text-gray-600'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Counter & Reset Filters */}
            <div className="flex justify-between items-center pt-3 border-t border-gray-100/80 text-xs font-semibold text-slate-500">
              <span>
                تم العثور على <span className="text-purple-700 font-black">{filteredItems.length}</span> من السجلات
              </span>
              {(stockStatusFilter !== 'all' || stockSearch.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setStockSearch('');
                    setStockStatusFilter('all');
                  }}
                  className="text-[11px] font-bold text-purple-600 hover:text-purple-700 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <X size={12} />
                  <span>إعادة تعيين كافة الفلاتر</span>
                </button>
              )}
            </div>
          </div>

          {/* Table Container: 100% Proportional Layout (4% + 19% + 9% + 11% + 11% + 12% + 8% + 15% + 11% = 100%) */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-right text-sm table-fixed whitespace-nowrap">
                <colgroup>
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '19%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '11%' }} />
                </colgroup>
                <thead className="bg-gradient-to-r from-slate-50/90 via-purple-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                  <tr>
                    <th className="w-[4%] px-3 py-4 text-center font-black text-xs text-slate-400 font-mono">#</th>
                    <th className="w-[19%] px-4 py-4 text-right font-black text-xs text-slate-600">الصنف</th>
                    <th className="w-[9%] px-3 py-4 text-right font-black text-xs text-slate-600">نوع الصنف</th>
                    <th className="w-[11%] px-3 py-4 text-right font-black text-xs text-slate-600">الكمية الحالية</th>
                    <th className="w-[11%] px-3 py-4 text-right font-black text-xs text-slate-600">سعر التكلفة</th>
                    <th className="w-[12%] px-3 py-4 text-right font-black text-xs text-slate-600">إجمالي القيمة</th>
                    <th className="w-[8%] px-3 py-4 text-right font-black text-xs text-slate-600">حد الأمان</th>
                    <th className="w-[15%] px-3 py-4 text-right font-black text-xs text-slate-600">تاريخ الانتهاء</th>
                    <th className="w-[11%] px-3 py-4 text-center font-black text-xs text-slate-600">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/70 bg-white">
                  {loadingItems ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-slate-400 font-bold">
                        <RefreshCcw className="w-6 h-6 animate-spin mx-auto text-purple-500 mb-2" />
                        <span>جاري تحميل أصناف المخزون...</span>
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-slate-400 font-bold">
                        <Package className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <span>لا توجد أصناف مطابقة للبحث أو الفلتر</span>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, index) => {
                      const isActive = Number(item.is_active) !== 0;
                      const q = parseFloat(item.quantity) || 0;
                      const min = parseFloat(item.min_quantity) || 0;
                      const costPrice = parseFloat(item.cost_price) || 0;
                      const totalValue = q * costPrice;
                      const isNegative = q < 0;
                      const isLow = !isNegative && q <= min;
                      const expiryInfo = getExpiryInfo(item.expiry_date);

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-purple-50/30 transition-colors border-b border-slate-100/70 last:border-0 ${
                            !isActive ? 'opacity-60 bg-slate-50/40' : ''
                          }`}
                        >
                          {/* 1. الترقيم (4%) */}
                          <td className="w-[4%] px-3 py-4 text-center font-black text-slate-400 text-xs font-mono">
                            {index + 1}
                          </td>

                          {/* 2. الصنف (19%) */}
                          <td className="w-[19%] px-4 py-4 text-right">
                            <div className="flex flex-col gap-0.5 min-w-0 text-right">
                              <span className="font-black text-slate-800 text-sm truncate" title={item.name}>
                                {item.name}
                              </span>
                              {item.description && (
                                <span className="text-[11px] font-semibold text-slate-400 truncate" title={item.description}>
                                  {item.description}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 3. نوع الصنف (9%) */}
                          <td className="w-[9%] px-3 py-4 text-right">
                            <span className="text-xs font-bold text-slate-600">
                              {getCategoryShortLabel(item.category, item.unit)}
                            </span>
                          </td>

                          {/* 4. الكمية الحالية (11%) */}
                          <td className="w-[11%] px-3 py-4 text-right">
                            <div className="flex items-baseline gap-1 justify-start">
                              <span
                                className={`text-base font-black ${
                                  !isActive
                                    ? 'text-slate-500'
                                    : isNegative
                                    ? 'text-rose-600'
                                    : isLow
                                    ? 'text-amber-600'
                                    : 'text-emerald-600'
                                }`}
                                dir="ltr"
                              >
                                {formatQty(q)}
                              </span>
                              <span className="text-[11px] font-bold text-slate-400">
                                {item.unit || ''}
                              </span>
                            </div>
                          </td>

                          {/* 5. سعر التكلفة (11%) */}
                          <td className="w-[11%] px-3 py-4 text-right">
                            {costPrice > 0 ? (
                              <div className="flex items-baseline gap-1.5 justify-start">
                                <span className="text-base font-black text-slate-800 tracking-tight" dir="ltr">
                                  {formatCurrency(costPrice)}
                                </span>
                                <span className="text-xs font-bold text-slate-400">ر.ي</span>
                              </div>
                            ) : (
                              <span className="text-xs font-bold text-slate-300">—</span>
                            )}
                          </td>

                          {/* 6. إجمالي القيمة (12%) */}
                          <td className="w-[12%] px-3 py-4 text-right">
                            {costPrice > 0 ? (
                              <div className="flex items-baseline gap-1.5 justify-start">
                                <span
                                  className={`text-base font-black tracking-tight ${
                                    isNegative ? 'text-rose-600' : 'text-purple-700'
                                  }`}
                                  dir="ltr"
                                >
                                  {formatCurrency(totalValue)}
                                </span>
                                <span className="text-xs font-bold text-slate-400">ر.ي</span>
                              </div>
                            ) : (
                              <span className="text-xs font-bold text-slate-300">—</span>
                            )}
                          </td>

                          {/* 7. حد الأمان (8%) */}
                          <td className="w-[8%] px-3 py-4 text-right">
                            <div className="flex items-baseline gap-1 justify-start">
                              <span className="text-sm font-black text-slate-600" dir="ltr">
                                {formatQty(min)}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400">
                                {item.unit || ''}
                              </span>
                            </div>
                          </td>

                          {/* 8. تاريخ الانتهاء (15%) — date on top, borderless colored status text below */}
                          <td className="w-[15%] px-3 py-4 text-right">
                            <div className="flex flex-col gap-0.5 items-start">
                              <span
                                dir="ltr"
                                className={`text-xs font-bold whitespace-nowrap ${
                                  !isActive
                                    ? 'text-slate-500'
                                    : expiryInfo.isExpired
                                    ? 'text-red-600'
                                    : expiryInfo.isExpiringSoon
                                    ? 'text-orange-600'
                                    : 'text-slate-700'
                                }`}
                              >
                                {item.expiry_date ? formatDateEn(item.expiry_date) : '—'}
                              </span>
                              {!isActive ? (
                                <span className="text-[11px] font-extrabold text-slate-500">
                                  موقوف
                                </span>
                              ) : expiryInfo.isExpired ? (
                                <span className="text-[11px] font-extrabold text-red-600">
                                  منتهي الصلاحية
                                </span>
                              ) : expiryInfo.isExpiringSoon ? (
                                <span className="text-[11px] font-extrabold text-orange-600">
                                  قريب ({expiryInfo.remainingText})
                                </span>
                              ) : null}
                            </div>
                          </td>

                          {/* 9. الإجراءات (11%) */}
                          <td className="w-[11%] px-3 py-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenAdjustStock(item)}
                                className="p-2 rounded-xl bg-purple-50 hover:bg-purple-600 text-purple-700 hover:text-white border border-purple-200/70 transition-all shadow-2xs cursor-pointer active:scale-95"
                                title="تسوية / تعديل الرصيد"
                              >
                                <SlidersHorizontal size={14} strokeWidth={2.2} />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenEditItem(item)}
                                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-800 text-slate-600 hover:text-white border border-slate-200/80 transition-all shadow-2xs cursor-pointer active:scale-95"
                                title="تعديل بيانات الصنف"
                              >
                                <Edit2 size={14} strokeWidth={2.2} />
                              </button>

                              <button
                                type="button"
                                onClick={() => setDeletingItem(item)}
                                className={`p-2 rounded-xl border transition-all shadow-2xs cursor-pointer active:scale-95 ${
                                  isActive
                                    ? 'bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border-rose-200/70'
                                    : 'bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border-emerald-200/70'
                                }`}
                                title={isActive ? 'حذف أو إيقاف الصنف' : 'إعادة تفعيل الصنف'}
                              >
                                {isActive ? (
                                  <Trash2 size={14} strokeWidth={2.2} />
                                ) : (
                                  <Power size={14} strokeWidth={2.2} />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: BOM RECIPE MANAGER (With BOM Valuation & Profit Margin) ───── */}
      {activeTab === 'bom' && (
        <div className="space-y-4">
          {/* Filter Toolbar */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4 flex-shrink-0">
            <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4">
              {/* Search Bar */}
              <div className="relative w-full xl:w-96">
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                  <Search size={16} strokeWidth={2.2} />
                </div>
                <input
                  type="text"
                  value={bomSearch}
                  onChange={(e) => setBomSearch(e.target.value)}
                  placeholder="بحث باسم التحليل، القسم، أو الصنف المرتبط..."
                  className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-purple-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200/60 shadow-xs transition-all"
                />
                {bomSearch && (
                  <button
                    type="button"
                    onClick={() => setBomSearch('')}
                    className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    title="مسح البحث"
                  >
                    <div className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                      <X size={12} strokeWidth={2.5} />
                    </div>
                  </button>
                )}
              </div>

              {/* BOM Status Filter Tabs */}
              <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto justify-between xl:justify-end">
                <div className="flex gap-1 bg-gray-100/90 p-1.5 rounded-2xl text-xs font-bold text-gray-500 overflow-x-auto">
                  {[
                    { id: 'all', label: 'جميع التحاليل' },
                    { id: 'linked', label: 'مرتبطة بمستهلكات' },
                    { id: 'unlinked', label: 'غير مرتبطة بعد' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setBomStatusFilter(t.id)}
                      className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-bold cursor-pointer ${
                        bomStatusFilter === t.id
                          ? 'bg-white text-purple-800 shadow-xs font-black'
                          : 'hover:bg-white/40 text-gray-600'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Counter & Reset Filters */}
            <div className="flex justify-between items-center pt-3 border-t border-gray-100/80 text-xs font-semibold text-slate-500">
              <span>
                تم العثور على <span className="text-purple-700 font-black">{filteredBomTests.length}</span> من التحاليل
              </span>
              {(bomStatusFilter !== 'all' || bomSearch.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setBomSearch('');
                    setBomStatusFilter('all');
                  }}
                  className="text-[11px] font-bold text-purple-600 hover:text-purple-700 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <X size={12} />
                  <span>إعادة تعيين كافة الفلاتر</span>
                </button>
              )}
            </div>
          </div>

          {/* BOM Table Container: 100% Proportional Layout (4% + 18% + 11% + 10% + 10% + 11% + 27% + 9% = 100%) */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-right text-sm table-fixed whitespace-nowrap">
                <colgroup>
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '27%' }} />
                  <col style={{ width: '9%' }} />
                </colgroup>
                <thead className="bg-gradient-to-r from-slate-50/90 via-purple-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                  <tr>
                    <th style={{ width: '4%' }} className="w-[4%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                    <th style={{ width: '18%' }} className="w-[18%] px-4 py-4 text-right font-black text-xs text-slate-600">اسم التحليل</th>
                    <th style={{ width: '11%' }} className="w-[11%] px-3 py-4 text-right font-black text-xs text-slate-600">القسم</th>
                    <th style={{ width: '10%' }} className="w-[10%] px-3 py-4 text-right font-black text-xs text-slate-600">سعر التحليل</th>
                    <th style={{ width: '10%' }} className="w-[10%] px-3 py-4 text-right font-black text-xs text-slate-600">تكلفة الوصفة</th>
                    <th style={{ width: '11%' }} className="w-[11%] px-3 py-4 text-center font-black text-xs text-slate-600">هامش الربح %</th>
                    <th style={{ width: '27%' }} className="w-[27%] px-4 py-4 text-right font-black text-xs text-slate-600">المستهلكات المرتبطة</th>
                    <th style={{ width: '9%' }} className="w-[9%] px-3 py-4 text-center font-black text-xs text-slate-600">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/70 bg-white">
                  {loadingBom ? (
                    <tr>
                      <td colSpan="8" className="py-12 text-center text-slate-400 font-bold">
                        <RefreshCcw className="w-6 h-6 animate-spin mx-auto text-purple-500 mb-2" />
                        <span>جاري تحميل وصفات التحاليل...</span>
                      </td>
                    </tr>
                  ) : filteredBomTests.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-12 text-center text-slate-400 font-bold">
                        <FlaskConical className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <span>لا توجد تحاليل مطابقة للبحث أو الفلتر</span>
                      </td>
                    </tr>
                  ) : (
                    filteredBomTests.map((test, index) => {
                      const links = consumablesByTest[test.id] || [];
                      const testPrice = parseFloat(test.price) || 0;
                      const calcOpCost =
                        links.length > 0
                          ? Number(
                              links
                                .reduce((sum, l) => {
                                  if (l.item_cost_per_test !== undefined) {
                                    return sum + (parseFloat(l.item_cost_per_test) || 0);
                                  }
                                  const itemObj = items.find((it) => Number(it.id) === Number(l.lab_item_id));
                                  const unitCost = parseFloat(l.item_cost_price ?? itemObj?.cost_price) || 0;
                                  const effQty =
                                    l.consumption_mode === 'per_unit_yield' && parseFloat(l.tests_per_unit) > 0
                                      ? 1 / parseFloat(l.tests_per_unit)
                                      : parseFloat(l.quantity_per_test) || 1;
                                  return sum + effQty * unitCost;
                                }, 0)
                                .toFixed(2)
                            )
                          : Number(parseFloat(test.operational_cost || 0).toFixed(2));
                      const profitPerTest = Number((testPrice - calcOpCost).toFixed(2));
                      const marginPct =
                        testPrice > 0 ? Number(((profitPerTest / testPrice) * 100).toFixed(1)) : 0;

                      return (
                        <tr
                          key={test.id}
                          className="hover:bg-purple-50/30 transition-colors border-b border-slate-100/70 last:border-0"
                        >
                          {/* 1. # (4%) */}
                          <td style={{ width: '4%' }} className="w-[4%] px-3 py-4 text-center font-black text-slate-400 text-xs align-middle">
                            {index + 1}
                          </td>

                          {/* 2. اسم التحليل (18%) */}
                          <td style={{ width: '18%' }} className="w-[18%] px-4 py-4 text-right align-middle">
                            <span className="font-black text-slate-800 text-sm truncate block" title={test.name}>
                              {test.name}
                            </span>
                          </td>

                          {/* 3. القسم (11%) */}
                          <td style={{ width: '11%' }} className="w-[11%] px-3 py-4 text-right align-middle">
                            <span className="text-xs font-bold text-slate-600 truncate block">
                              {test.category_name || 'تحاليل عامة'}
                            </span>
                          </td>

                          {/* 4. سعر التحليل (10%) */}
                          <td style={{ width: '10%' }} className="w-[10%] px-3 py-4 text-right align-middle">
                            <div className="flex items-baseline gap-1.5 justify-start">
                              <span className="text-base font-black text-slate-800 tracking-tight" dir="ltr">
                                {formatCurrency(testPrice)}
                              </span>
                              <span className="text-xs font-bold text-slate-400">ر.ي</span>
                            </div>
                          </td>

                          {/* 5. تكلفة الوصفة (10%) */}
                          <td style={{ width: '10%' }} className="w-[10%] px-3 py-4 text-right align-middle">
                            {links.length > 0 ? (
                              <div className="flex items-baseline gap-1.5 justify-start">
                                <span className="text-base font-black text-purple-700 tracking-tight" dir="ltr">
                                  {formatCurrency(calcOpCost)}
                                </span>
                                <span className="text-xs font-bold text-slate-400">ر.ي</span>
                              </div>
                            ) : (
                              <span className="text-xs font-bold text-slate-300">—</span>
                            )}
                          </td>

                          {/* 6. هامش الربح % (11%) */}
                          <td style={{ width: '11%' }} className="w-[11%] px-3 py-4 text-center align-middle">
                            {links.length === 0 ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-50 text-slate-400 border border-slate-200/70">
                                غير مربوط
                              </span>
                            ) : (
                              <div
                                className="inline-flex flex-col items-center gap-0.5"
                                title={`صافي الربح للتحليل: ${formatCurrency(profitPerTest)} ر.ي`}
                              >
                                <span
                                  dir="ltr"
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black border shadow-2xs ${
                                    marginPct > 50
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                                      : marginPct >= 20
                                      ? 'bg-amber-50 text-amber-700 border-amber-200/80'
                                      : 'bg-rose-50 text-rose-700 border-rose-200/80'
                                  }`}
                                >
                                  <span>{marginPct}%</span>
                                </span>
                              </div>
                            )}
                          </td>

                          {/* 7. المستهلكات المرتبطة (27%) */}
                          <td style={{ width: '27%' }} className="w-[27%] px-4 py-4 text-right align-middle">
                            {links.length === 0 ? (
                              <span className="text-xs font-bold text-slate-400">
                                غير مرتبط بمستهلكات
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setBomTargetTest(test)}
                                className="group bg-transparent border-0 p-0 text-right flex flex-col items-start gap-1 max-w-full cursor-pointer"
                                title="اضغط لضبط وصفة المستهلكات"
                              >
                                {links.map((l) => (
                                  <div
                                    key={l.id || l.lab_item_id}
                                    className="inline-flex flex-wrap items-center gap-1.5 text-xs leading-relaxed max-w-full"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 group-hover:bg-violet-600 shrink-0 transition-colors" />
                                    <span className="font-bold text-slate-800 group-hover:text-purple-700 transition-colors truncate">
                                      {l.item_name}
                                    </span>
                                    <span className="text-slate-500 font-semibold group-hover:text-purple-600/80 transition-colors shrink-0">
                                      {formatLabConsumableRate(l)}
                                    </span>
                                  </div>
                                ))}
                              </button>
                            )}
                          </td>

                          {/* 8. الإجراءات (9%) */}
                          <td style={{ width: '9%' }} className="w-[9%] px-3 py-4 text-center align-middle">
                            <button
                              type="button"
                              onClick={() => setBomTargetTest(test)}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-600 text-purple-700 hover:text-white border border-purple-200/70 text-xs font-black transition-all shadow-2xs cursor-pointer active:scale-95"
                            >
                              <Link2 size={13} strokeWidth={2.2} />
                              <span>الوصفة</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: INCOMING TRANSFERS & HANDSHAKE ─────────────────────────────── */}
      {activeTab === 'transfers' && (
        <div className="space-y-4">
          {/* 1. Pending Incoming Transfers Section (Hidden when no pending transfers) */}
          {!loadingTransfers && pendingTransfers && pendingTransfers.length > 0 && (
            <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-200/80 mb-6 relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-500"></div>

              <div className="p-5 border-b border-slate-100 bg-emerald-50/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-inner">
                    <Truck size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-800">الشحنات الواردة المعلقة</h2>
                    <p className="text-xs font-bold text-slate-500 mt-1">
                      يجب مراجعة الدفعات المحولة لقسم المختبر وقبولها أو رفضها
                    </p>
                  </div>
                </div>
                <div className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm border border-emerald-200/50">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  {pendingTransfers.length} دفعات معلقة
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm table-fixed whitespace-nowrap">
                  <colgroup>
                    <col style={{ width: '24%' }} />
                    <col style={{ width: '30%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '14%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="w-[24%] px-5 py-3 text-xs font-black text-slate-500">المصدر\المرسل</th>
                      <th className="w-[30%] px-5 py-3 text-xs font-black text-slate-500">الصنف</th>
                      <th className="w-[14%] px-5 py-3 text-xs font-black text-slate-500">الكمية</th>
                      <th className="w-[18%] px-5 py-3 text-xs font-black text-slate-500">تاريخ الإرسال</th>
                      <th className="w-[14%] px-5 py-3 text-xs font-black text-slate-500 text-left">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingTransfers.map((batch) => {
                      const pendingTotalQty =
                        batch.total_quantity ??
                        (batch.items?.reduce(
                          (sum, it) => sum + (parseFloat(it.sent_quantity ?? it.quantity) || 0),
                          0
                        ) || 0);

                      return (
                        <tr key={batch.batch_ref_key || batch.batch_ref} className="hover:bg-emerald-50/30 transition-colors group">
                          <td className="w-[24%] px-5 py-4 truncate">
                            <span className="font-bold text-slate-700 text-sm">{formatSenderName(batch)}</span>
                          </td>
                          <td className="w-[30%] px-5 py-4 truncate">
                            <span className="font-bold text-slate-700 text-sm">
                              {getSmartItemText(batch.item_count || batch.items?.length || 0, batch.items?.[0]?.item_name || batch.items?.[0]?.name)}
                            </span>
                          </td>
                          <td className="w-[14%] px-5 py-4">
                            <span className="font-bold text-slate-700 text-sm" dir="ltr">
                              +{parseFloat(pendingTotalQty).toLocaleString()}
                            </span>
                          </td>
                          <td className="w-[18%] px-5 py-4">
                            <div className="font-bold text-slate-700 text-sm">
                              {new Date(batch.sent_at).toLocaleDateString('en-GB')}
                            </div>
                            <div className="text-xs text-slate-400 font-semibold mt-0.5" dir="ltr">
                              {new Date(batch.sent_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td className="w-[14%] px-5 py-4 text-left">
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingBatch(null);
                                setRejectionReason('');
                                setSelectedBatch({
                                  ...batch,
                                  sender_name: formatSenderName(batch),
                                  store_name: formatSenderName(batch)
                                });
                              }}
                              className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
                            >
                              <Eye size={14} className="text-slate-400" />
                              عرض التفاصيل
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2. Incoming Transfers History Filter Toolbar */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4 flex-shrink-0">
            <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4">
              {/* Search Bar */}
              <div className="relative w-full xl:w-96">
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                  <Search size={16} strokeWidth={2.2} />
                </div>
                <input
                  type="text"
                  value={transferSearch}
                  onChange={(e) => {
                    setTransferSearch(e.target.value);
                    setTransferHistoryPage(1);
                  }}
                  placeholder="بحث باسم الصنف، المصدر، أو الموظف المستلم..."
                  className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-purple-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200/60 shadow-xs transition-all"
                />
                {transferSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setTransferSearch('');
                      setTransferHistoryPage(1);
                    }}
                    className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    title="مسح البحث"
                  >
                    <div className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                      <X size={12} strokeWidth={2.5} />
                    </div>
                  </button>
                )}
              </div>

              {/* Temporal Filter Tabs + Movement Type Dropdown */}
              <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto justify-between xl:justify-end">
                <div className="flex gap-1 bg-gray-100/90 p-1.5 rounded-2xl text-xs font-bold text-gray-500 overflow-x-auto">
                  {[
                    { id: 'all', label: 'الكل' },
                    { id: 'today', label: 'اليوم' },
                    { id: 'week', label: 'هذا الأسبوع' },
                    { id: 'month', label: 'هذا الشهر' },
                    { id: 'custom', label: 'تاريخ مخصص' }
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setTransferDateFilter(f.id);
                        setTransferHistoryPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-bold cursor-pointer ${
                        transferDateFilter === f.id
                          ? 'bg-white text-purple-800 shadow-xs font-black'
                          : 'hover:bg-white/40 text-gray-600'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Movement Type Dropdown */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowTransferStatusMenu(!showTransferStatusMenu)}
                    className={`h-10 px-3.5 rounded-2xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                      transferStatusFilter !== 'all'
                        ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                        : 'bg-white text-slate-600 border-slate-200/90 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <Activity size={14} className={transferStatusFilter !== 'all' ? 'text-purple-600' : 'text-slate-400'} />
                    <span>
                      {transferStatusFilter === 'all'
                        ? 'نوع الحركة'
                        : transferStatusFilter === 'received'
                        ? 'تم الاستلام'
                        : 'مرفوضة'}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`text-slate-400 transition-transform duration-200 ${showTransferStatusMenu ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {showTransferStatusMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowTransferStatusMenu(false)} />
                      <div className="absolute top-full left-0 mt-1.5 w-48 bg-white border border-slate-100 shadow-xl rounded-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 p-1.5 space-y-1">
                        {[
                          { id: 'all', label: 'جميع الحركات', icon: Activity },
                          { id: 'received', label: 'تم الاستلام', icon: Check },
                          { id: 'rejected', label: 'مرفوضة', icon: X }
                        ].map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => {
                              setTransferStatusFilter(f.id);
                              setShowTransferStatusMenu(false);
                              setTransferHistoryPage(1);
                            }}
                            className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between cursor-pointer ${
                              transferStatusFilter === f.id
                                ? 'bg-purple-50 text-purple-700 font-black'
                                : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <f.icon size={13} className={transferStatusFilter === f.id ? 'text-purple-600' : 'text-slate-400'} />
                              <span>{f.label}</span>
                            </div>
                            {transferStatusFilter === f.id && <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Custom Date Range Picker */}
            {transferDateFilter === 'custom' && (
              <div className="p-4 bg-purple-50/40 rounded-2xl border border-purple-100/80 flex flex-wrap gap-4 items-center animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-purple-800">من تاريخ:</span>
                  <input
                    type="date"
                    value={transferCustomRange.start}
                    onChange={(e) => {
                      setTransferCustomRange({ ...transferCustomRange, start: e.target.value });
                      setTransferHistoryPage(1);
                    }}
                    className="px-3 py-1.5 bg-white border border-purple-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-purple-500 cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-purple-800">إلى تاريخ:</span>
                  <input
                    type="date"
                    value={transferCustomRange.end}
                    onChange={(e) => {
                      setTransferCustomRange({ ...transferCustomRange, end: e.target.value });
                      setTransferHistoryPage(1);
                    }}
                    className="px-3 py-1.5 bg-white border border-purple-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-purple-500 cursor-pointer"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTransferCustomRange({ start: '', end: '' });
                    setTransferDateFilter('all');
                    setTransferHistoryPage(1);
                  }}
                  className="px-4 py-1.5 text-xs bg-white text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl font-bold mr-auto border border-slate-200 transition-colors cursor-pointer"
                >
                  إعادة تعيين
                </button>
              </div>
            )}

            {/* Counter */}
            <div className="flex justify-between items-center pt-3 border-t border-gray-100/80 text-xs font-semibold text-slate-500">
              <span>
                تم العثور على <span className="text-purple-700 font-black">{filteredTransfersHistory.length}</span> من السجلات
              </span>
              {(transferDateFilter !== 'all' || transferStatusFilter !== 'all' || transferSearch.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setTransferSearch('');
                    setTransferStatusFilter('all');
                    setTransferDateFilter('all');
                    setTransferCustomRange({ start: '', end: '' });
                    setTransferHistoryPage(1);
                  }}
                  className="text-[11px] font-bold text-purple-600 hover:text-purple-700 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <X size={12} />
                  <span>إعادة تعيين كافة الفلاتر</span>
                </button>
              )}
            </div>
          </div>

          {/* 3. Incoming Transfers History Table (5% + 21% + 10% + 9% + 14% + 13% + 10% + 11% + 7% = 100%) */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-sm whitespace-nowrap table-fixed">
                <colgroup>
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '21%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '7%' }} />
                </colgroup>
                <thead className="bg-gradient-to-r from-slate-50/90 via-purple-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                  <tr>
                    <th className="w-[5%] px-3 py-4 text-center font-black text-xs text-slate-400 font-mono">#</th>
                    <th className="w-[21%] px-4 py-4 text-right font-black text-xs text-slate-600">الصنف</th>
                    <th className="w-[10%] px-4 py-4 text-right font-black text-xs text-slate-600">نوع الصنف</th>
                    <th className="w-[9%] px-4 py-4 text-right font-black text-xs text-slate-600">الكمية</th>
                    <th className="w-[14%] px-4 py-4 text-right font-black text-xs text-slate-600">المصدر\المرسل</th>
                    <th className="w-[13%] px-4 py-4 text-right font-black text-xs text-slate-600">المستلم / الرافض</th>
                    <th className="w-[10%] px-4 py-4 text-right font-black text-xs text-slate-600">نوع الحركة</th>
                    <th className="w-[11%] px-4 py-4 text-right font-black text-xs text-slate-600">التاريخ</th>
                    <th className="w-[7%] px-3 py-4 text-center font-black text-xs text-slate-600">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/70 bg-white">
                  {loadingTransfersHistory && filteredTransfersHistory.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-slate-400 font-bold">
                        <RefreshCcw className="w-6 h-6 animate-spin mx-auto text-purple-500 mb-2" />
                        <span>جاري تحميل سجل الشحنات الواردة...</span>
                      </td>
                    </tr>
                  ) : filteredTransfersHistory.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-slate-400 font-bold">
                        <History className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <span>لا توجد شحنات واردة سابقة مطابقة للبحث</span>
                      </td>
                    </tr>
                  ) : (
                    filteredTransfersHistory.map((batch, index) => {
                      const isRejected = batch.status === 'rejected';
                      const firstItem = batch.items?.[0] || {};
                      const rowNumber = index + 1;
                      const cleanSender = formatSenderName(batch);

                      return (
                        <tr
                          key={batch.batch_ref_key || batch.batch_ref}
                          className="hover:bg-purple-50/30 transition-colors border-b border-slate-100/70 last:border-0"
                        >
                          {/* 1. الترقيم (5%) */}
                          <td className="w-[5%] px-3 py-4 text-center font-black text-slate-400 text-xs font-mono">
                            {rowNumber}
                          </td>

                          {/* 2. الصنف (21%) */}
                          <td className="w-[21%] px-4 py-4 font-black text-slate-800 truncate" title={firstItem.item_name}>
                            {batch.item_count > 1 ? (
                              <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg text-xs font-black">
                                <Layers size={12} /> {getSmartItemText(batch.item_count, firstItem.item_name)}
                              </span>
                            ) : (
                              firstItem.item_name || '—'
                            )}
                          </td>

                          {/* 3. نوع الصنف (10%) */}
                          <td className="w-[10%] px-4 py-4 text-slate-600 font-bold text-xs">
                            {batch.item_count > 1
                              ? '-'
                              : getCategoryShortLabel(firstItem.category, firstItem.unit)}
                          </td>

                          {/* 4. الكمية (9%) */}
                          <td className="w-[9%] px-4 py-4 text-right">
                            <span
                              dir="ltr"
                              className={`font-black text-sm ${
                                isRejected ? 'text-rose-500 line-through opacity-75' : 'text-emerald-600'
                              }`}
                            >
                              +{parseFloat(batch.total_quantity || 0).toLocaleString()}
                            </span>
                          </td>

                          {/* 5. المصدر\المرسل (14%) */}
                          <td className="w-[14%] px-4 py-4 text-slate-700 font-bold text-sm truncate" title={cleanSender}>
                            {cleanSender}
                          </td>

                          {/* 6. المستلم / الرافض (13%) */}
                          <td className="w-[13%] px-4 py-4 text-slate-700 font-bold text-xs truncate" title={batch.action_by_name}>
                            {batch.action_by_name || 'قسم المختبر'}
                          </td>

                          {/* 7. نوع الحركة (10%) */}
                          <td className="w-[10%] px-4 py-4">
                            {isRejected ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100/60 shadow-2xs">
                                مرفوضة
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100/60 shadow-2xs">
                                تم الاستلام
                              </span>
                            )}
                          </td>

                          {/* 8. التاريخ (11%) */}
                          <td className="w-[11%] px-4 py-4 text-right">
                            <div className="space-y-0.5 text-right">
                              <div>
                                <span dir="ltr" className="text-xs font-bold text-slate-700 whitespace-nowrap inline-block">
                                  {formatDateEn(batch.resolved_at || batch.sent_at)}
                                </span>
                              </div>
                              <div>
                                <span dir="ltr" className="text-[11px] font-semibold text-slate-400 whitespace-nowrap inline-block">
                                  {formatTimeEn(batch.resolved_at || batch.sent_at)}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 9. الإجراءات (7%) */}
                          <td className="w-[7%] px-3 py-4 text-center">
                            <button
                              type="button"
                              className="p-2 text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 rounded-xl transition-all border border-indigo-100 shadow-sm cursor-pointer"
                              title="عرض التفاصيل"
                              onClick={() =>
                                setSelectedHistoryBatch({
                                  ...batch,
                                  sender_name: cleanSender,
                                  store_name: cleanSender
                                })
                              }
                            >
                              <Eye size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: CONSUMPTION & WASTAGE LOG ──────────────────────────────────── */}
      {activeTab === 'audit_log' && (
        <div className="space-y-4">
          {/* Advanced Filter Toolbar */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4 flex-shrink-0">
            <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4">
              {/* Search Bar */}
              <div className="relative w-full xl:w-96">
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                  <Search size={16} strokeWidth={2.2} />
                </div>
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => {
                    setLogSearch(e.target.value);
                    setLogPage(1);
                  }}
                  placeholder="بحث باسم الصنف، التحليل، نوع الحركة، أو الموظف..."
                  className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-purple-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200/60 shadow-xs transition-all"
                />
                {logSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogSearch('');
                      setLogPage(1);
                    }}
                    className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    title="مسح البحث"
                  >
                    <div className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                      <X size={12} strokeWidth={2.5} />
                    </div>
                  </button>
                )}
              </div>

              {/* Temporal Filter Tabs + Movement Type Dropdown */}
              <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto justify-between xl:justify-end">
                <div className="flex gap-1 bg-gray-100/90 p-1.5 rounded-2xl text-xs font-bold text-gray-500 overflow-x-auto">
                  {[
                    { id: 'all', label: 'الكل' },
                    { id: 'today', label: 'اليوم' },
                    { id: 'week', label: 'هذا الأسبوع' },
                    { id: 'month', label: 'هذا الشهر' },
                    { id: 'custom', label: 'تاريخ مخصص' }
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setDateFilter(f.id);
                        setLogPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-bold cursor-pointer ${
                        dateFilter === f.id
                          ? 'bg-white text-purple-800 shadow-xs font-black'
                          : 'hover:bg-white/40 text-gray-600'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Movement Type Dropdown */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowTriggerMenu(!showTriggerMenu)}
                    className={`h-10 px-3.5 rounded-2xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                      logTriggerFilter !== 'all'
                        ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                        : 'bg-white text-slate-600 border-slate-200/90 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <Activity size={14} className={logTriggerFilter !== 'all' ? 'text-purple-600' : 'text-slate-400'} />
                    <span>
                      {logTriggerFilter === 'all'
                        ? 'نوع الحركة'
                        : logTriggerFilter === 'procedure_consumption'
                        ? 'استهلاك'
                        : 'إتلاف'}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`text-slate-400 transition-transform duration-200 ${showTriggerMenu ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {showTriggerMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowTriggerMenu(false)} />
                      <div className="absolute top-full left-0 mt-1.5 w-48 bg-white border border-slate-100 shadow-xl rounded-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 p-1.5 space-y-1">
                        {[
                          { id: 'all', label: 'جميع الحركات', icon: Activity },
                          { id: 'procedure_consumption', label: 'استهلاك', icon: ArrowUpRight },
                          { id: 'wastage', label: 'إتلاف', icon: Trash2 }
                        ].map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => {
                              setLogTriggerFilter(f.id);
                              setShowTriggerMenu(false);
                              setLogPage(1);
                            }}
                            className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between cursor-pointer ${
                              logTriggerFilter === f.id
                                ? 'bg-purple-50 text-purple-700 font-black'
                                : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <f.icon size={13} className={logTriggerFilter === f.id ? 'text-purple-600' : 'text-slate-400'} />
                              <span>{f.label}</span>
                            </div>
                            {logTriggerFilter === f.id && <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Custom Date Range Picker */}
            {dateFilter === 'custom' && (
              <div className="p-4 bg-purple-50/40 rounded-2xl border border-purple-100/80 flex flex-wrap gap-4 items-center animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-purple-800">من تاريخ:</span>
                  <input
                    type="date"
                    value={customRange.start}
                    onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })}
                    className="px-3 py-1.5 bg-white border border-purple-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-purple-500 cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-purple-800">إلى تاريخ:</span>
                  <input
                    type="date"
                    value={customRange.end}
                    onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })}
                    className="px-3 py-1.5 bg-white border border-purple-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-purple-500 cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2 mr-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomRange({ start: '', end: '' });
                      setDateFilter('all');
                      setLogPage(1);
                    }}
                    className="px-4 py-1.5 text-xs bg-white text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl font-bold border border-slate-200 transition-colors cursor-pointer"
                  >
                    إعادة تعيين
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLogPage(1);
                      fetchConsumptionLogs();
                    }}
                    disabled={!customRange.start || !customRange.end}
                    className="px-4 py-1.5 bg-purple-600 text-white rounded-xl font-bold text-xs hover:bg-purple-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
                  >
                    تطبيق الفلتر
                  </button>
                </div>
              </div>
            )}

            {/* Counter */}
            <div className="flex justify-between items-center pt-3 border-t border-gray-100/80 text-xs font-semibold text-slate-500">
              <span>
                تم العثور على <span className="text-purple-700 font-black">{logSearch.trim() ? filteredConsumptionLogs.length : totalLogs}</span> من السجلات
              </span>
              {(dateFilter !== 'all' || logTriggerFilter !== 'all' || logSearch.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setLogSearch('');
                    setLogTriggerFilter('all');
                    setDateFilter('all');
                    setCustomRange({ start: '', end: '' });
                    setLogPage(1);
                  }}
                  className="text-[11px] font-bold text-purple-600 hover:text-purple-700 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <X size={12} />
                  <span>إعادة تعيين كافة الفلاتر</span>
                </button>
              )}
            </div>
          </div>

          {/* Consumption Log Table: 100% Proportional Layout (4% / 9% / 16% / 8% / 11% / 22% / 11% / 11% / 8%) */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-sm whitespace-nowrap table-fixed">
                <colgroup>
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '8%' }} />
                </colgroup>
                <thead className="bg-gradient-to-r from-slate-50/90 via-purple-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                  <tr>
                    <th className="w-[4%] px-3 py-4 text-center font-black text-xs text-slate-400 font-mono">#</th>
                    <th className="w-[9%] px-3 py-4 text-center font-black text-xs text-slate-600">نوع الحركة</th>
                    <th className="w-[16%] px-4 py-4 text-right font-black text-xs text-slate-600">الصنف</th>
                    <th className="w-[8%] px-3 py-4 text-center font-black text-xs text-slate-600">الكمية</th>
                    <th className="w-[11%] px-3 py-4 text-center font-black text-xs text-slate-600">التكلفة المالية</th>
                    <th className="w-[22%] px-4 py-4 text-right font-black text-xs text-slate-600">التحليل / سبب التلف</th>
                    <th className="w-[11%] px-4 py-4 text-right font-black text-xs text-slate-600">الموظف المنفذ</th>
                    <th className="w-[11%] px-4 py-4 text-right font-black text-xs text-slate-600">وقت التنفيذ</th>
                    <th className="w-[8%] px-3 py-4 text-center font-black text-xs text-slate-600">معاينة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/70 bg-white">
                  {loadingLogs ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-slate-400 font-bold">
                        <RefreshCcw className="w-6 h-6 animate-spin mx-auto text-purple-500 mb-2" />
                        <span>جاري تحميل سجل الاستهلاك...</span>
                      </td>
                    </tr>
                  ) : filteredConsumptionLogs.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-slate-400 font-bold">
                        <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <span>لا توجد حركات استهلاك مسجلة ضمن هذه المعايير</span>
                      </td>
                    </tr>
                  ) : (
                    filteredConsumptionLogs.map((log, index) => {
                      const qty = parseFloat(log.qty_deducted) || 0;
                      const unitCost = parseFloat(log.unit_cost) || 0;
                      const totalCost = parseFloat(log.total_cost) || 0;
                      const isWastage = log.trigger_type === 'wastage';
                      const wastageInfo = isWastage ? parseWastageDetails(log) : null;
                      const testsList =
                        !isWastage && Array.isArray(log.tests) && log.tests.length > 0
                          ? log.tests
                          : !isWastage && log.service_name
                          ? String(log.service_name)
                              .split(/\s*(?:،|\+)\s*/)
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .map((name) => ({ name }))
                          : [];
                      const rowNumber = index + 1;

                      return (
                        <tr key={log.id} className="hover:bg-purple-50/30 transition-colors border-b border-slate-100/70 last:border-0">
                          {/* 1. الترقيم (4%) */}
                          <td className="w-[4%] px-3 py-4 text-center font-black text-slate-400 text-xs font-mono align-middle">
                            {rowNumber}
                          </td>

                          {/* 2. نوع الحركة (9%) */}
                          <td className="w-[9%] px-3 py-4 text-center whitespace-nowrap align-middle">
                            {isWastage ? (
                              <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100/60 shadow-2xs">
                                <Trash2 size={12} strokeWidth={2.2} />
                                <span>إتلاف</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-50 text-purple-700 border border-purple-100/60 shadow-2xs">
                                <ArrowUpRight size={12} strokeWidth={2.2} />
                                <span>استهلاك</span>
                              </span>
                            )}
                          </td>

                          {/* 3. الصنف (16%) */}
                          <td className="w-[16%] px-4 py-4 text-right align-middle">
                            <span className="font-bold text-slate-800 text-sm leading-snug truncate block" title={log.item_name}>
                              {log.item_name}
                            </span>
                          </td>

                          {/* 4. الكمية (8%) */}
                          <td className="w-[8%] px-3 py-4 text-center align-middle">
                            <span dir="ltr" className="inline-block text-base font-black tracking-tight text-rose-600">
                              {`-${formatQty(Math.abs(qty))}`}
                            </span>
                          </td>

                          {/* 5. التكلفة المالية (11%) */}
                          <td
                            className="w-[11%] px-3 py-4 text-center align-middle"
                            title={unitCost > 0 ? `سعر الوحدة وقت الخصم: ${formatCurrency(unitCost)} ر.ي` : ''}
                          >
                            {totalCost > 0 ? (
                              isWastage ? (
                                <span className="inline-flex items-baseline gap-1.5 px-3 py-1 rounded-xl bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs">
                                  <span dir="ltr" className="text-base font-black tracking-tight">
                                    {formatCurrency(totalCost)}
                                  </span>
                                  <span className="text-xs font-bold text-rose-500">ر.ي</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-baseline gap-1.5">
                                  <span dir="ltr" className="text-base font-black tracking-tight text-slate-800">
                                    {formatCurrency(totalCost)}
                                  </span>
                                  <span className="text-xs font-bold text-slate-400">ر.ي</span>
                                </span>
                              )
                            ) : (
                              <span className="text-xs font-bold text-slate-300">—</span>
                            )}
                          </td>

                          {/* 6. التحليل / سبب التلف (22%) */}
                          <td className="w-[22%] px-4 py-4 text-right align-middle">
                            {isWastage && wastageInfo ? (
                              <div
                                style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}
                                className="flex flex-col gap-1 min-w-0 text-right whitespace-normal break-words"
                                dir="rtl"
                              >
                                <div className="leading-relaxed">
                                  <span className="text-xs font-black text-rose-600 ml-1.5">سبب التلف:</span>
                                  <span className="font-bold text-slate-800 text-sm">{wastageInfo.reason}</span>
                                </div>
                                {wastageInfo.note && (
                                  <div className="leading-relaxed">
                                    <span className="text-xs font-black text-rose-600 ml-1.5">الملاحظة:</span>
                                    <span className="font-bold text-slate-800 text-sm">{wastageInfo.note}</span>
                                  </div>
                                )}
                              </div>
                            ) : testsList.length > 1 ? (
                              <div
                                style={{ gridTemplateColumns: 'repeat(2, minmax(0, max-content))' }}
                                className="grid items-center gap-x-3 gap-y-1 py-0.5 max-w-full"
                              >
                                {testsList.map((s, sIdx) => (
                                  <div key={sIdx} className="flex items-center gap-1.5 min-w-0">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-purple-500" />
                                    <span className="font-bold text-slate-800 text-sm leading-snug truncate" title={s.name}>
                                      {s.name}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : testsList.length === 1 ? (
                              <span className="font-bold text-slate-800 text-sm leading-snug truncate block" title={testsList[0].name}>
                                {testsList[0].name}
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-slate-400">—</span>
                            )}
                          </td>

                          {/* 7. الموظف المنفذ (11%) */}
                          <td className="w-[11%] px-4 py-4 text-right align-middle">
                            <span className="text-xs font-bold text-slate-700 truncate block" title={log.technician_name}>
                              {log.technician_name || 'فني المختبر'}
                            </span>
                          </td>

                          {/* 8. وقت التنفيذ (11%) */}
                          <td className="w-[11%] px-4 py-4 text-right align-middle">
                            <div className="space-y-0.5 text-right">
                              <div>
                                <span dir="ltr" className="text-xs font-bold text-slate-700 whitespace-nowrap inline-block">
                                  {formatDateEn(log.performed_at)}
                                </span>
                              </div>
                              <div>
                                <span dir="ltr" className="text-[11px] font-semibold text-slate-400 whitespace-nowrap inline-block">
                                  {formatTimeEn(log.performed_at)}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 9. معاينة (8%) */}
                          <td className="w-[8%] px-3 py-4 text-center align-middle">
                            {log.visit_id ? (
                              <button
                                type="button"
                                onClick={() => setSelectedVisitId(log.visit_id)}
                                className="p-2 text-purple-600 hover:text-white bg-purple-50 hover:bg-purple-600 rounded-xl transition-all border border-purple-100 shadow-sm cursor-pointer active:scale-95"
                                title="معاينة التقرير"
                                aria-label="معاينة التقرير"
                              >
                                <Eye size={16} />
                              </button>
                            ) : (
                              <span className="text-xs font-bold text-slate-300 select-none">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 5: FINANCIAL & OPERATIONAL ANALYTICS (REVENUE VS. COGS) ──────── */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          {/* Analytics Filter Toolbar */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4 flex-shrink-0">
            <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4">
              {/* Search Bar */}
              <div className="relative w-full xl:w-96">
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                  <Search size={16} strokeWidth={2.2} />
                </div>
                <input
                  type="text"
                  value={analyticsSearch}
                  onChange={(e) => setAnalyticsSearch(e.target.value)}
                  placeholder="بحث باسم التحليل أو القسم..."
                  className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-purple-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200/60 shadow-xs transition-all"
                />
                {analyticsSearch && (
                  <button
                    type="button"
                    onClick={() => setAnalyticsSearch('')}
                    className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    title="مسح البحث"
                  >
                    <div className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                      <X size={12} strokeWidth={2.5} />
                    </div>
                  </button>
                )}
              </div>

              {/* Temporal Filter Tabs + Profitability Dropdown Menu */}
              <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto justify-between xl:justify-end">
                {/* Date Range Tabs */}
                <div className="flex gap-1 bg-gray-100/90 p-1.5 rounded-2xl text-xs font-bold text-gray-500 overflow-x-auto">
                  {[
                    { id: 'all', label: 'الكل' },
                    { id: 'today', label: 'اليوم' },
                    { id: 'week', label: 'هذا الأسبوع' },
                    { id: 'month', label: 'هذا الشهر' },
                    { id: 'custom', label: 'تاريخ مخصص' }
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setAnalyticsDateFilter(f.id)}
                      className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-bold cursor-pointer ${
                        analyticsDateFilter === f.id
                          ? 'bg-white text-purple-800 shadow-xs font-black'
                          : 'hover:bg-white/40 text-gray-600'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Profitability & Execution Filter Dropdown Menu */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowAnalyticsMarginMenu(!showAnalyticsMarginMenu)}
                    className={`h-10 px-3.5 rounded-2xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                      analyticsMarginFilter !== 'all'
                        ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                        : 'bg-white text-slate-600 border-slate-200/90 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <TrendingUp
                      size={14}
                      className={analyticsMarginFilter !== 'all' ? 'text-purple-600' : 'text-slate-400'}
                    />
                    <span>
                      {analyticsMarginFilter === 'all'
                        ? 'كافة التحاليل'
                        : analyticsMarginFilter === 'executed'
                        ? 'المنفذة فقط'
                        : analyticsMarginFilter === 'high'
                        ? 'ربحية عالية (> 50%)'
                        : analyticsMarginFilter === 'medium'
                        ? 'ربحية متوسطة (20% - 50%)'
                        : 'ربحية حرجة (< 20%)'}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`text-slate-400 transition-transform duration-200 ${
                        showAnalyticsMarginMenu ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {showAnalyticsMarginMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowAnalyticsMarginMenu(false)}
                      />
                      <div className="absolute top-full left-0 mt-1.5 w-56 bg-white border border-slate-100 shadow-xl rounded-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 p-1.5 space-y-1">
                        {[
                          { id: 'all', label: 'كافة التحاليل', icon: Layers },
                          { id: 'executed', label: 'المنفذة فقط', icon: Check },
                          { id: 'high', label: 'ربحية عالية (> 50%)', icon: TrendingUp },
                          { id: 'medium', label: 'ربحية متوسطة (20% - 50%)', icon: Percent },
                          { id: 'low', label: 'ربحية حرجة (< 20%)', icon: ShieldAlert }
                        ].map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setAnalyticsMarginFilter(m.id);
                              setShowAnalyticsMarginMenu(false);
                            }}
                            className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between cursor-pointer ${
                              analyticsMarginFilter === m.id
                                ? 'bg-purple-50 text-purple-700 font-black'
                                : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <m.icon
                                size={13}
                                className={
                                  analyticsMarginFilter === m.id ? 'text-purple-600' : 'text-slate-400'
                                }
                              />
                              <span>{m.label}</span>
                            </div>
                            {analyticsMarginFilter === m.id && (
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Custom Date Range Picker */}
            {analyticsDateFilter === 'custom' && (
              <div className="p-4 bg-purple-50/40 rounded-2xl border border-purple-100/80 flex flex-wrap gap-4 items-center animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-purple-800">من تاريخ:</span>
                  <input
                    type="date"
                    value={analyticsCustomRange.start}
                    onChange={(e) =>
                      setAnalyticsCustomRange({ ...analyticsCustomRange, start: e.target.value })
                    }
                    className="px-3 py-1.5 bg-white border border-purple-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-purple-500 cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-purple-800">إلى تاريخ:</span>
                  <input
                    type="date"
                    value={analyticsCustomRange.end}
                    onChange={(e) =>
                      setAnalyticsCustomRange({ ...analyticsCustomRange, end: e.target.value })
                    }
                    className="px-3 py-1.5 bg-white border border-purple-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-purple-500 cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2 mr-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setAnalyticsCustomRange({ start: '', end: '' });
                      setAnalyticsDateFilter('all');
                    }}
                    className="px-4 py-1.5 text-xs bg-white text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl font-bold border border-slate-200 transition-colors cursor-pointer"
                  >
                    إعادة تعيين
                  </button>
                  <button
                    type="button"
                    onClick={fetchFinancialAnalytics}
                    disabled={!analyticsCustomRange.start || !analyticsCustomRange.end}
                    className="px-4 py-1.5 bg-purple-600 text-white rounded-xl font-bold text-xs hover:bg-purple-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
                  >
                    تطبيق الفلتر
                  </button>
                </div>
              </div>
            )}

            {/* Counter & Reset Filters */}
            <div className="flex justify-between items-center pt-3 border-t border-gray-100/80 text-xs font-semibold text-slate-500">
              <span>
                تم العثور على <span className="text-purple-700 font-black">{filteredAnalyticsTests.length}</span> من التحاليل
              </span>
              {(analyticsDateFilter !== 'all' ||
                analyticsMarginFilter !== 'all' ||
                analyticsSearch.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setAnalyticsSearch('');
                    setAnalyticsMarginFilter('all');
                    setAnalyticsDateFilter('all');
                    setAnalyticsCustomRange({ start: '', end: '' });
                  }}
                  className="text-[11px] font-bold text-purple-600 hover:text-purple-700 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <X size={12} />
                  <span>إعادة تعيين كافة الفلاتر</span>
                </button>
              )}
            </div>
          </div>

          {/* Analytics Table: 100% Proportional Layout (4% + 20% + 14% + 12% + 13% + 13% + 12% + 12% = 100%) */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-right text-sm table-fixed whitespace-nowrap">
                <colgroup>
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>
                <thead className="bg-gradient-to-r from-slate-50/90 via-purple-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                  <tr>
                    <th style={{ width: '4%' }} className="w-[4%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                    <th style={{ width: '20%' }} className="w-[20%] px-4 py-4 text-right font-black text-xs text-slate-600">اسم التحليل والقسم</th>
                    <th style={{ width: '14%' }} className="w-[14%] px-3 py-4 text-right font-black text-xs text-slate-600">سعر التحليل وتكلفة الوصفة</th>
                    <th style={{ width: '12%' }} className="w-[12%] px-3 py-4 text-center font-black text-xs text-slate-600">مرات التنفيذ</th>
                    <th style={{ width: '13%' }} className="w-[13%] px-3 py-4 text-right font-black text-xs text-slate-600">إجمالي الإيرادات</th>
                    <th style={{ width: '13%' }} className="w-[13%] px-3 py-4 text-right font-black text-xs text-slate-600">إجمالي COGS</th>
                    <th style={{ width: '12%' }} className="w-[12%] px-3 py-4 text-right font-black text-xs text-slate-600">صافي الربح</th>
                    <th style={{ width: '12%' }} className="w-[12%] px-3 py-4 text-center font-black text-xs text-slate-600">هامش الربح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/70 bg-white">
                  {loadingAnalytics ? (
                    <tr>
                      <td colSpan="8" className="py-12 text-center text-slate-400 font-bold">
                        <RefreshCcw className="w-6 h-6 animate-spin mx-auto text-purple-500 mb-2" />
                        <span>جاري احتساب التحليل المالي والتشغيلي للمختبر...</span>
                      </td>
                    </tr>
                  ) : filteredAnalyticsTests.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-12 text-center text-slate-400 font-bold">
                        <TrendingUp className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <span>لا توجد تحاليل مطابقة لمعايير الفلترة المحددة</span>
                      </td>
                    </tr>
                  ) : (
                    filteredAnalyticsTests.map((t, index) => {
                      const margin = Number(t.profit_margin_percent || 0);
                      const clampedBarWidth = Math.max(0, Math.min(100, Math.round(margin)));
                      const hasExecs = Number(t.total_executions || 0) > 0;

                      return (
                        <tr
                          key={t.lab_test_id}
                          className="hover:bg-purple-50/30 transition-colors border-b border-slate-100/70 last:border-0"
                        >
                          {/* 1. # (4%) */}
                          <td style={{ width: '4%' }} className="w-[4%] px-3 py-4 text-center font-black text-slate-400 text-xs align-middle">
                            {index + 1}
                          </td>

                          {/* 2. اسم التحليل والقسم (20%) */}
                          <td style={{ width: '20%' }} className="w-[20%] px-4 py-4 text-right align-middle">
                            <div className="flex flex-col gap-1 min-w-0 items-start">
                              <span className="font-black text-slate-800 text-sm truncate max-w-full" title={t.test_name}>
                                {t.test_name}
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-100/80">
                                {t.category_name || 'عام'}
                              </span>
                            </div>
                          </td>

                          {/* 3. سعر التحليل وتكلفة الوصفة (14%) */}
                          <td style={{ width: '14%' }} className="w-[14%] px-3 py-4 text-right align-middle">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-[11px] text-slate-400 font-bold">السعر:</span>
                                <span dir="ltr" className="text-sm font-black text-slate-800 tracking-tight">
                                  {formatCurrency(t.catalog_price)}
                                </span>
                                <span className="text-[11px] font-bold text-slate-400">ر.ي</span>
                              </div>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-[11px] text-slate-400 font-bold">الوصفة:</span>
                                {t.consumables_count > 0 ? (
                                  <>
                                    <span dir="ltr" className="text-sm font-black text-purple-700 tracking-tight">
                                      {formatCurrency(t.standard_bom_cost)}
                                    </span>
                                    <span className="text-[11px] font-bold text-slate-400">ر.ي</span>
                                  </>
                                ) : (
                                  <span className="text-xs font-bold text-slate-400">غير مربوط</span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 4. مرات التنفيذ (12%) */}
                          <td style={{ width: '12%' }} className="w-[12%] px-3 py-4 text-center align-middle">
                            <div className="flex flex-col items-center gap-0.5">
                              <span
                                className={`inline-flex items-baseline gap-1.5 px-3 py-1 rounded-xl border ${
                                  hasExecs
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200/70'
                                    : 'bg-slate-50 text-slate-400 border-slate-200/60'
                                }`}
                              >
                                <span dir="ltr" className="text-sm font-black tracking-tight">
                                  {t.total_executions}
                                </span>
                                <span className="text-xs font-bold">تحليل</span>
                              </span>
                              {Number(t.paid_executions) > 0 && (
                                <span className="text-[11px] font-bold text-slate-500">
                                  مدفوع: <span className="font-black text-slate-700">{t.paid_executions}</span>
                                </span>
                              )}
                              {Number(t.free_executions) > 0 && (
                                <span className="text-[11px] font-bold text-slate-500">
                                  مجاني: <span className="font-black text-amber-600">{t.free_executions}</span>
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 5. إجمالي الإيرادات (13%) */}
                          <td style={{ width: '13%' }} className="w-[13%] px-3 py-4 text-right align-middle">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-baseline gap-1.5">
                                <span
                                  dir="ltr"
                                  className={`text-base font-black tracking-tight ${
                                    t.total_revenue > 0 ? 'text-emerald-600' : 'text-slate-400'
                                  }`}
                                >
                                  {formatCurrency(t.total_revenue)}
                                </span>
                                <span className="text-xs font-bold text-slate-400">ر.ي</span>
                              </div>
                              {t.total_discounts > 0 && (
                                <span className="text-[11px] font-bold text-amber-600">
                                  إعفاء: {formatCurrency(t.total_discounts)} ر.ي
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 6. إجمالي COGS (13%) */}
                          <td style={{ width: '13%' }} className="w-[13%] px-3 py-4 text-right align-middle">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-baseline gap-1.5">
                                <span
                                  dir="ltr"
                                  className={`text-base font-black tracking-tight ${
                                    t.total_cogs > 0 ? 'text-rose-600' : 'text-slate-400'
                                  }`}
                                >
                                  {formatCurrency(t.total_cogs)}
                                </span>
                                <span className="text-xs font-bold text-slate-400">ر.ي</span>
                              </div>
                              {t.wastage_cost > 0 ? (
                                <span className="text-[11px] font-bold text-rose-500">
                                  منها هدر: {formatCurrency(t.wastage_cost)} ر.ي
                                </span>
                              ) : t.is_estimated_cogs ? (
                                <span className="text-[11px] font-semibold text-slate-400">
                                  (تقديري حسب الوصفة)
                                </span>
                              ) : null}
                            </div>
                          </td>

                          {/* 7. صافي الربح (12%) */}
                          <td style={{ width: '12%' }} className="w-[12%] px-3 py-4 text-right align-middle">
                            <div className="flex items-baseline gap-1.5">
                              <span
                                dir="ltr"
                                className={`text-base font-black tracking-tight ${
                                  t.net_profit > 0
                                    ? 'text-emerald-700'
                                    : t.net_profit < 0
                                    ? 'text-rose-600'
                                    : 'text-slate-500'
                                }`}
                              >
                                {formatCurrency(t.net_profit)}
                              </span>
                              <span className="text-xs font-bold text-slate-400">ر.ي</span>
                            </div>
                          </td>

                          {/* 8. هامش الربح (12%) */}
                          <td style={{ width: '12%' }} className="w-[12%] px-3 py-4 text-center align-middle">
                            <div className="flex flex-col items-center gap-1.5 w-full">
                              <span
                                dir="ltr"
                                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black border shadow-2xs ${
                                  margin > 50
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                                    : margin >= 20
                                    ? 'bg-amber-50 text-amber-700 border-amber-200/80'
                                    : 'bg-rose-50 text-rose-700 border-rose-200/80'
                                }`}
                              >
                                {margin}%
                              </span>
                              <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    margin > 50
                                      ? 'bg-emerald-500'
                                      : margin >= 20
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500'
                                  }`}
                                  style={{ width: `${clampedBarWidth}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Grand Totals Footer Bar with Arabic Tafqeet */}
            {!loadingAnalytics && filteredAnalyticsTests.length > 0 && (
              <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white p-5 border-t border-purple-800/40">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  {/* Totals Summary Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 w-full lg:w-auto">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold text-purple-200/80">إجمالي مرات التنفيذ</span>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span dir="ltr" className="text-xl font-black tracking-tight text-white">
                          {filteredAnalyticsTotals.executions}
                        </span>
                        <span className="text-xs font-bold text-purple-300">تحليل مكتمل</span>
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold text-emerald-200/90">إجمالي الإيرادات المحصلة</span>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span dir="ltr" className="text-xl font-black tracking-tight text-emerald-400">
                          {formatCurrency(filteredAnalyticsTotals.totalRevenue)}
                        </span>
                        <span className="text-xs font-bold text-emerald-300/80">ر.ي</span>
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold text-rose-200/90">إجمالي تكلفة المستهلكات والهدر (COGS)</span>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span dir="ltr" className="text-xl font-black tracking-tight text-rose-400">
                          {formatCurrency(filteredAnalyticsTotals.totalCogs)}
                        </span>
                        <span className="text-xs font-bold text-rose-300/80">ر.ي</span>
                      </div>
                      {filteredAnalyticsTotals.unallocWastage > 0 && (
                        <span className="text-[10px] font-semibold text-rose-300/80">
                          (شامل هدر عام: {formatCurrency(filteredAnalyticsTotals.unallocWastage)} ر.ي)
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold text-amber-200/90">صافي الربح التشغيلي ({filteredAnalyticsTotals.marginPercent}%)</span>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span
                          dir="ltr"
                          className={`text-2xl font-black tracking-tight ${
                            filteredAnalyticsTotals.netProfit >= 0 ? 'text-amber-300' : 'text-rose-400'
                          }`}
                        >
                          {formatCurrency(filteredAnalyticsTotals.netProfit)}
                        </span>
                        <span className="text-xs font-bold text-amber-200/80">ر.ي</span>
                      </div>
                    </div>
                  </div>

                  {/* Arabic Tafqeet Box */}
                  <div className="w-full lg:w-auto bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl px-4 py-3 flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-purple-200">
                      {filteredAnalyticsTotals.netProfit >= 0
                        ? 'تفقيط صافي الربح التشغيلي:'
                        : 'تفقيط صافي العجز / الخسارة التشغيلية:'}
                    </span>
                    <span className="text-xs sm:text-sm font-black text-amber-300 leading-relaxed">
                      {Math.abs(Math.round(filteredAnalyticsTotals.netProfit)) > 0
                        ? `فقط ${taffyot(Math.abs(Math.round(filteredAnalyticsTotals.netProfit)))} ريال يمني لا غير`
                        : 'صفر ريال يمني'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL A: ADD / EDIT ITEM MODAL (ADMIN) ── */}
      <InventoryItemModal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        storeType="lab"
        editingItem={editingItem}
        itemForm={itemForm}
        setItemForm={setItemForm}
        classificationOptions={CATEGORY_OPTIONS}
        classificationKey="category"
        classificationLabel="تصنيف الصنف في النظام"
        items={items}
        submitting={submittingItem}
        onSubmit={handleSubmitItem}
      />

      {/* ── MODAL B: STOCK ADJUSTMENT MODAL (ADMIN) ──────────────────────────── */}
      <StockAdjustmentModal
        adjustingItem={adjustingItem}
        onClose={() => setAdjustingItem(null)}
        storeType="lab"
        adjustForm={adjustForm}
        setAdjustForm={setAdjustForm}
        submitting={submittingAdjust}
        onSubmit={handleSubmitAdjustStock}
      />

      {/* ── MODAL C: DELETE / TOGGLE ITEM CONFIRMATION ───────────────────────── */}
      <DeleteOrToggleItemModal
        deletingItem={deletingItem}
        onClose={() => setDeletingItem(null)}
        storeType="lab"
        submitting={submittingDelete}
        onConfirm={handleConfirmDeleteOrToggle}
      />

      {/* ── MODAL D: REPORT & PATIENT DETAIL PANEL (ARCHIVE PREVIEW) ─────────── */}
      {selectedVisitId && (
        <LabPatientDetailPanel
          visitId={selectedVisitId}
          token={token}
          onClose={() => setSelectedVisitId(null)}
          onCompleted={() => fetchConsumptionLogs()}
          isCompletedTab={true}
          readOnly={true}
        />
      )}

      {/* ── MODAL E: MANUAL WASTAGE / DAMAGE LOGGING ── */}
      <InventoryWastageModal
        isOpen={isWastageModalOpen}
        onClose={() => setIsWastageModalOpen(false)}
        storeType="lab"
        activeItemsList={activeItemsList}
        wastageForm={wastageForm}
        setWastageForm={setWastageForm}
        wastageReasons={WASTAGE_REASONS}
        submitting={submittingWastage}
        onSubmit={handleSubmitWastage}
      />

      {/* ── MODAL F: PENDING INCOMING BATCH DETAILS (ACCEPT / REJECT) ─────────── */}
      <BatchDetailsModal
        mode="inbound"
        themeColor="emerald"
        hideFinancials={false}
        isOpen={!!selectedBatch}
        onClose={() => {
          setSelectedBatch(null);
          setRejectingBatch(null);
          setRejectionReason('');
        }}
        batch={selectedBatch}
        onAccept={handleAcceptBatch}
        onReject={handleRejectBatch}
        isProcessing={processingBatch === (selectedBatch?.batch_ref_key || selectedBatch?.batch_ref)}
        rejectingBatch={rejectingBatch}
        setRejectingBatch={setRejectingBatch}
        rejectionReason={rejectionReason}
        setRejectionReason={setRejectionReason}
      />

      {/* ── MODAL G: HISTORICAL INCOMING BATCH DETAILS (READ-ONLY) ────────────── */}
      <BatchDetailsModal
        mode="inbound"
        themeColor="emerald"
        hideFinancials={false}
        readOnly={true}
        isOpen={!!selectedHistoryBatch}
        onClose={() => setSelectedHistoryBatch(null)}
        batch={selectedHistoryBatch}
      />

      {/* ── MODAL H: BOM RECIPE MODAL ─────────────────────────────────────────── */}
      <LabTestConsumablesModal
        isOpen={!!bomTargetTest}
        onClose={() => setBomTargetTest(null)}
        test={bomTargetTest}
        inventoryItems={items}
        initialLinks={bomTargetTest ? consumablesByTest[bomTargetTest.id] || [] : []}
        token={token}
        onSaved={() => {
          fetchBomData();
          fetchInventory();
        }}
      />
    </div>
  );
}
