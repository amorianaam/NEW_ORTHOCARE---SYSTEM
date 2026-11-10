import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import {
  X,
  Maximize2,
  Minimize2,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  Minus,
  Trash2,
  Edit3,
  Scissors,
  History,
  Eye,
  Pill,
  Wallet,
  DollarSign,
  Package,
  Check,
  Save,
  ChevronDown,
  ChevronRight,
  User,
  Phone,
  FileText,
  FlaskConical,
  Radiation,
  Stethoscope,
  Film,
  Image as ImageIcon,
  Printer,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
  Tag,
  Layers,
  ArrowRight
} from 'lucide-react';
import ClinicalResultViewerModal from '../common/ClinicalResultViewerModal';
import ConfirmDeleteModal from '../common/ConfirmDeleteModal';
import { toEnglishDigits, resolveFileUrl } from '../../utils/emrHelpers';
import { formatArabicQuantity } from '../../utils/arabicFormatters';

// ── Status Configs ───────────────────────────────────────────────────
const STATUS_CONFIG = {
  planned: {
    label: 'بانتظار التسعير',
    bg: 'bg-sky-50 text-sky-700 border-sky-200/80',
    dot: 'bg-sky-500'
  },
  scheduled: {
    label: 'مجدولة — بانتظار السداد',
    bg: 'bg-amber-50 text-amber-700 border-amber-200/80',
    dot: 'bg-amber-500 animate-pulse'
  },
  ready: {
    label: 'جاهز للعملية ✓',
    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    dot: 'bg-emerald-500'
  },
  post_op: {
    label: 'جارٍ تنفيذ العملية',
    bg: 'bg-violet-50 text-violet-700 border-violet-200/80',
    dot: 'bg-violet-500 animate-pulse'
  },
  completed: {
    label: 'مكتملة ومغلقة',
    bg: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400'
  }
};

const SERVICE_STATUS_CONFIG = {
  completed: { label: 'مكتملة', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/70', dot: 'bg-emerald-500' },
  paid: { label: 'في انتظار التنفيذ', bg: 'bg-purple-50 text-purple-700 border-purple-200/70', dot: 'bg-purple-500 animate-pulse' },
  in_progress: { label: 'قيد التنفيذ', bg: 'bg-blue-50 text-blue-700 border-blue-200/70', dot: 'bg-blue-500 animate-pulse' },
  pending_payment: { label: 'بانتظار الدفع', bg: 'bg-amber-50 text-amber-700 border-amber-200/70', dot: 'bg-amber-500' },
  pending: { label: 'معلّقة', bg: 'bg-amber-50 text-amber-700 border-amber-200/70', dot: 'bg-amber-400' },
  refunded: { label: 'مستردة', bg: 'bg-rose-50 text-rose-700 border-rose-200/70', dot: 'bg-rose-500' },
  cancelled: { label: 'ملغاة', bg: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-400' }
};

// ── Helper Formatter ────────────────────────────────────────────────
const formatYER = (val) => {
  const rounded = Math.round(Number(val) || 0);
  return `${rounded.toLocaleString('en-US')} ر.ي`;
};

const cleanPriceVal = (p) => {
  if (p === null || p === undefined || p === '') return '';
  const n = parseFloat(toEnglishDigits(String(p)).replace(/,/g, ''));
  return (!isNaN(n) && n > 0) ? String(Math.round(n)) : '';
};

const formatPriceWithCommas = (val) => {
  if (val === null || val === undefined || val === '') return '';
  const clean = String(val).replace(/,/g, '').trim();
  const num = parseFloat(clean);
  if (isNaN(num) || num <= 0) return '';
  return Math.round(num).toLocaleString('en-US');
};

// ── Main SurgeryDetailModal Component ───────────────────────────────
export default function SurgeryDetailModal({ surgeryRow, token, onClose, onRefresh }) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState('surgery');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [patientHistory, setPatientHistory] = useState([]);

  // Pricing & Scheduling Form State
  const [surgeryType, setSurgeryType] = useState(surgeryRow?.surgery_type || '');
  const [price, setPrice] = useState(() => cleanPriceVal(surgeryRow?.full_price));
  const [scheduledDate, setScheduledDate] = useState(
    surgeryRow?.scheduled_date ? surgeryRow.scheduled_date.slice(0, 16) : ''
  );
  const [savingPrice, setSavingPrice] = useState(false);
  const [isEditingSurgery, setIsEditingSurgery] = useState(false);

  // Inventory Materials State
  const [inventory, setInventory] = useState([]);
  const [searchInv, setSearchInv] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [qty, setQty] = useState('');
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [deletingMaterialId, setDeletingMaterialId] = useState(null);

  // Additional Expenses State
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [addingExpense, setAddingExpense] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState(null);

  // Pre-Op Diagnostics State
  const [showAddDiag, setShowAddDiag] = useState(false);
  const [diagType, setDiagType] = useState('lab');
  const [diagTestName, setDiagTestName] = useState('');
  const [diagWithFilm, setDiagWithFilm] = useState(true);
  const [addingDiag, setAddingDiag] = useState(false);

  // Collapsible Accordions in Services & Results Tabs
  const [openServiceSections, setOpenServiceSections] = useState({ lab: true, radiology: true, clinical: true });
  const [openResultSections, setOpenResultSections] = useState({ lab: true, radiology: true, clinical: true });

  // Collapsible Accordions in Surgery Tab (Materials & Expenses)
  const [openSurgerySections, setOpenSurgerySections] = useState({ materials: true, expenses: true });

  const toggleSurgerySection = (key) => {
    setOpenSurgerySections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Unified Diagnostic Result Viewer Modal State
  const [activeResultViewer, setActiveResultViewer] = useState({
    isOpen: false,
    results: [],
    currentIndex: 0
  });

  const toggleServiceSection = (key) => {
    setOpenServiceSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleResultSection = (key) => {
    setOpenResultSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Load Surgery Details and Patient Visits ─────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch surgery specific details
      const res = await fetch(`/api/surgery/${surgeryRow.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('فشل تحميل تفاصيل العملية');
      const d = await res.json();
      setData(d);
      setPrice(cleanPriceVal(d.surgery?.full_price));
      setSurgeryType(d.surgery?.surgery_type || '');
      setScheduledDate(d.surgery?.scheduled_date ? d.surgery.scheduled_date.slice(0, 16) : '');

      // 2. Fetch patient EMR history (all visits, services, results, and prescriptions)
      const patientId = d.surgery?.patient_id || surgeryRow?.patient_id;
      if (patientId) {
        try {
          const histRes = await fetch(`/api/doctor/patient/${patientId}/history`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (histRes.ok) {
            const histData = await histRes.json();
            setPatientHistory(Array.isArray(histData) ? histData : []);
          }
        } catch {
          // Non-blocking error for EMR history
        }
      }

      // 3. Fetch inventory items
      try {
        const invRes = await fetch('/api/surgery/inventory/items', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (invRes.ok) {
          const invData = await invRes.json();
          setInventory(Array.isArray(invData) ? invData : []);
        }
      } catch {
        // Non-blocking
      }
    } catch {
      toast.error('فشل تحميل بيانات العملية الجراحية');
    } finally {
      setLoading(false);
    }
  }, [surgeryRow.id, surgeryRow.patient_id, token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Matching visit for this surgery
  const currentVisit = useMemo(() => {
    if (!patientHistory || patientHistory.length === 0) return null;
    const vId = data?.surgery?.visit_id || surgeryRow?.visit_id;
    if (vId) {
      const found = patientHistory.find((v) => String(v.id) === String(vId));
      if (found) return found;
    }
    return patientHistory[0] || null;
  }, [patientHistory, data, surgeryRow]);

  // Financial Calculations
  const fullPrice = parseFloat(data?.surgery?.full_price || 0);
  const materialsCost = data?.materials?.reduce((acc, m) => acc + parseFloat(m.total_cost || 0), 0) || 0;
  const expensesCost = data?.expenses?.reduce((acc, e) => acc + parseFloat(e.amount || 0), 0) || 0;
  const totalCosts = materialsCost + expensesCost;
  const totalPaidYer =
    data?.payments?.reduce((acc, p) => acc + parseFloat(p.amount || 0) * (parseFloat(p.exchange_rate) || 1), 0) || 0;
  const remainingYer = Math.max(0, fullPrice - totalPaidYer);
  const netProfit = totalPaidYer - totalCosts;



  // ── Actions ────────────────────────────────────────────────────────
  const handlePriceSurgery = async () => {
    const cleanPrice = Math.round(Number(toEnglishDigits(String(price)).replace(/,/g, ''))) || 0;
    if (!surgeryType || cleanPrice <= 0) {
      return toast.error('الرجاء إدخال نوع وسعر العملية بشكل صحيح');
    }
    setSavingPrice(true);
    try {
      const res = await fetch(`/api/surgery/${surgeryRow.id}/price`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ surgery_type: surgeryType, full_price: cleanPrice, scheduled_date: scheduledDate })
      });
      if (res.ok) {
        toast.success('تم تسعير العملية وجدولتها وإرسالها للصندوق');
        setIsEditingSurgery(false);
        if (onRefresh) onRefresh();
        loadData();
      } else {
        const err = await res.json();
        toast.error(err.message || 'فشل حفظ التسعير');
      }
    } catch {
      toast.error('خطأ في الاتصال بالخادم');
    } finally {
      setSavingPrice(false);
    }
  };

  const handleCancelEditSurgery = () => {
    setSurgeryType(data?.surgery?.surgery_type || surgeryRow?.surgery_type || '');
    setPrice(cleanPriceVal(data?.surgery?.full_price || surgeryRow?.full_price));
    setScheduledDate(
      (data?.surgery?.scheduled_date || surgeryRow?.scheduled_date)
        ? (data?.surgery?.scheduled_date || surgeryRow?.scheduled_date).slice(0, 16)
        : ''
    );
    setIsEditingSurgery(false);
  };

  // Standardized Delete Confirmation Modal State
  const [confirmDeleteModal, setConfirmDeleteModal] = useState({
    isOpen: false,
    type: null, // 'material' | 'expense'
    id: null,
    itemName: '',
    details: null
  });
  const [isDeleting, setIsDeleting] = useState(false);

  const promptDeleteMaterial = (material) => {
    setConfirmDeleteModal({
      isOpen: true,
      type: 'material',
      id: material.id,
      itemName: material.name || 'المادة المستهلكة',
      details: {
        qty: Math.round(Number(material.quantity) || 0),
        unit: material.unit || 'قطعة',
        cost: material.cost_price || 0
      }
    });
  };

  const promptDeleteExpense = (expense) => {
    setConfirmDeleteModal({
      isOpen: true,
      type: 'expense',
      id: expense.id,
      itemName: expense.description || 'بند التكلفة الإضافية',
      details: {
        amount: expense.amount || 0
      }
    });
  };

  const handleExecuteDelete = async () => {
    if (!confirmDeleteModal.isOpen || !confirmDeleteModal.id) return;
    setIsDeleting(true);
    const { type, id } = confirmDeleteModal;
    try {
      if (type === 'material') {
        const res = await fetch(`/api/surgery/${surgeryRow.id}/material/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const d = await res.json();
          toast.success(d.message || 'تم حذف المادة واسترجاع رصيدها لمخزن العمليات');
          setConfirmDeleteModal({ isOpen: false, type: null, id: null, itemName: '', details: null });
          loadData();
          if (onRefresh) onRefresh();
        } else {
          const err = await res.json();
          toast.error(err.message || 'فشل حذف المادة');
        }
      } else if (type === 'expense') {
        const res = await fetch(`/api/surgery/${surgeryRow.id}/expense/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const d = await res.json();
          toast.success(d.message || 'تم حذف التكلفة بنجاح');
          setConfirmDeleteModal({ isOpen: false, type: null, id: null, itemName: '', details: null });
          loadData();
          if (onRefresh) onRefresh();
        } else {
          const err = await res.json();
          toast.error(err.message || 'فشل حذف التكلفة');
        }
      }
    } catch {
      toast.error('خطأ في الاتصال بالخادم أثناء تنفيذ الحذف');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    try {
      const res = await fetch(`/api/surgery/${surgeryRow.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        toast.success('تم تحديث حالة العملية بنجاح');
        if (onRefresh) onRefresh();
        loadData();
      } else {
        const err = await res.json();
        toast.error(err.message || 'فشل تحديث الحالة');
      }
    } catch {
      toast.error('خطأ في الاتصال بالخادم');
    }
  };

  const handleComplete = async () => {
    try {
      const res = await fetch(`/api/surgery/${surgeryRow.id}/complete`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('تم إنهاء العملية وإغلاق الملف بنجاح');
        if (onRefresh) onRefresh();
        loadData();
      } else {
        const err = await res.json();
        toast.error(err.message || 'فشل إنهاء العملية');
      }
    } catch {
      toast.error('خطأ في الاتصال بالخادم');
    }
  };

  const handleAddMaterial = async () => {
    const cleanQty = Math.round(Number(toEnglishDigits(String(qty)))) || 0;
    if (!selectedItem || cleanQty <= 0) {
      return toast.error('الرجاء اختيار مادة وتحديد كمية صحيحة (عدد صحيح)');
    }
    const itemStock = Math.round(Number(selectedItem.quantity) || 0);
    if (itemStock <= 0) {
      return toast.error('هذا الصنف نفد من مخزن العمليات ولا يمكن صرفه');
    }
    if (cleanQty > itemStock) {
      return toast.error(`الكمية المطلوبة (${cleanQty}) تتجاوز الرصيد المتاح في مخزن العمليات (${itemStock})`);
    }
    setAddingMaterial(true);
    try {
      const res = await fetch(`/api/surgery/${surgeryRow.id}/material`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ inventory_item_id: selectedItem.id, quantity: cleanQty })
      });
      if (res.ok) {
        toast.success('تم صرف واستهلاك المادة من مخزن العمليات وتوثيق حركة الصرف بنجاح');
        setSearchInv('');
        setSelectedItem(null);
        setQty('');
        loadData();
      } else {
        const err = await res.json();
        toast.error(err.message || 'فشل صرف المادة');
      }
    } catch {
      toast.error('خطأ في الاتصال بالخادم أثناء صرف المادة');
    } finally {
      setAddingMaterial(false);
    }
  };

  const handleAddExpense = async () => {
    const cleanAmt = Math.round(Number(toEnglishDigits(String(expenseAmount)).replace(/,/g, ''))) || 0;
    if (!expenseDesc || cleanAmt <= 0) {
      return toast.error('الرجاء إدخال وصف ومبلغ صحيح للتكلفة');
    }
    setAddingExpense(true);
    try {
      const res = await fetch(`/api/surgery/${surgeryRow.id}/expense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ description: expenseDesc, amount: cleanAmt })
      });
      if (res.ok) {
        toast.success('تم إضافة التكلفة بنجاح');
        setExpenseDesc('');
        setExpenseAmount('');
        loadData();
      } else {
        const err = await res.json();
        toast.error(err.message || 'فشل إضافة التكلفة');
      }
    } catch {
      toast.error('خطأ في الاتصال');
    } finally {
      setAddingExpense(false);
    }
  };

  const filteredInv = useMemo(() => {
    if (!searchInv) return [];
    return inventory.filter((i) => i.name.toLowerCase().includes(searchInv.toLowerCase()));
  }, [inventory, searchInv]);

  // Material Selection & Stock Constraints
  const availableStock = useMemo(() => {
    return selectedItem ? Math.round(Number(selectedItem.quantity) || 0) : 0;
  }, [selectedItem]);

  const currentQtyNum = useMemo(() => {
    return Math.round(Number(toEnglishDigits(String(qty || '0')))) || 0;
  }, [qty]);

  const isExceedingStock = Boolean(selectedItem && currentQtyNum > availableStock);
  const isStockZero = Boolean(selectedItem && availableStock <= 0);
  const remainingAfterConsumption = Math.max(0, availableStock - currentQtyNum);

  // Services aggregation from visit
  const visitLabs = currentVisit?.labTests || currentVisit?.lab_tests || [];
  const visitRads = currentVisit?.radiologyTests || currentVisit?.radiology_tests || [];
  const visitClinics = currentVisit?.clinicalServices || currentVisit?.clinical_services || [];
  const visitMeds = currentVisit?.prescriptionItems || currentVisit?.prescription || [];

  // Pre-op diagnostics directly linked to this surgery
  const preOpLabs = data?.diagnosticServices?.labs || [];
  const preOpRads = data?.diagnosticServices?.rads || [];

  // Completed results aggregation for Results Tab
  const completedLabs = visitLabs.filter((t) => t.status === 'completed' || t.result_notes || t.result_file);
  const completedRads = visitRads.filter((t) => t.status === 'completed' || t.result_notes || t.result_file);
  const completedClinics = visitClinics.filter((t) => t.status === 'completed' || t.result_notes);

  // Unified Results Viewer Navigation
  const allViewerResults = useMemo(() => {
    const list = [];
    completedLabs.forEach((t) => {
      list.push({
        ...t,
        id: `lab_${t.id}`,
        name: t.name || t.test_name || 'تحليل مخبري',
        categoryKey: 'lab',
        typeLabel: 'مختبر',
        date: t.performed_at || t.completed_at || t.requested_at,
        result_notes: t.result_notes,
        result_file: t.result_file
      });
    });
    completedRads.forEach((t) => {
      list.push({
        ...t,
        id: `rad_${t.id}`,
        name: t.name || t.radiology_name || 'فحص أشعة',
        categoryKey: 'radiology',
        typeLabel: 'أشعة',
        date: t.performed_at || t.completed_at || t.requested_at,
        result_notes: t.result_notes,
        result_file: t.result_file
      });
    });
    completedClinics.forEach((t) => {
      list.push({
        ...t,
        id: `clin_${t.id}`,
        name: t.name || t.service_name || 'خدمة سريرية',
        categoryKey: 'clinical',
        typeLabel: 'خدمة سريرية',
        date: t.performed_at || t.completed_at || t.created_at,
        result_notes: t.result_notes,
        result_file: t.result_file
      });
    });
    return list;
  }, [completedLabs, completedRads, completedClinics]);

  const openUnifiedViewer = (targetId) => {
    const idx = allViewerResults.findIndex((r) => String(r.id) === String(targetId));
    setActiveResultViewer({
      isOpen: true,
      results: allViewerResults,
      currentIndex: idx >= 0 ? idx : 0
    });
  };

  const handlePrintPrescription = () => {
    window.print();
  };

  const surgeryInfo = data?.surgery || surgeryRow;
  const statusKey = surgeryInfo.status || 'planned';
  const statusCfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.planned;
  const isPlannedAndUnpriced = statusKey === 'planned' && (!surgeryType?.trim() || !price || Number(price) <= 0);

  return (
    <>
      {createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300"
          dir="rtl"
        >
          {/* Background Overlay */}
          <div className="absolute inset-0" onClick={onClose} />

          {/* Modal Container */}
          <div
            className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/60 ${
              isMaximized
                ? 'w-[98vw] h-[98vh] rounded-[2.5rem]'
                : 'w-full max-w-5xl h-full max-h-[92vh] rounded-[2rem]'
            }`}
          >
            {/* ── Top Control Bar (Purple Surgical Gradient) ─────────── */}
            <div
              className={`${
                isMaximized ? 'px-6 sm:px-8 py-3' : 'px-5 py-2.5'
              } flex items-center justify-between flex-shrink-0 shadow-md text-white transition-colors duration-300 bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-700 z-30`}
            >
              <div className="flex items-center gap-2">
                <Scissors size={isMaximized ? 18 : 16} />
                <span className={`${isMaximized ? 'text-xs sm:text-sm' : 'text-xs'} font-black tracking-wide drop-shadow-sm`}>
                  إدارة ومتابعة ملف العملية الجراحية ({surgeryInfo.full_name || '...'})
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setIsMaximized(!isMaximized)}
                  className={`${
                    isMaximized ? 'w-8 h-8' : 'w-7 h-7'
                  } flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all shadow-sm cursor-pointer active:scale-95`}
                  title={isMaximized ? 'تصغير' : 'تكبير'}
                >
                  {isMaximized ? (
                    <Minimize2 size={isMaximized ? 16 : 15} />
                  ) : (
                    <Maximize2 size={isMaximized ? 16 : 15} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className={`${
                    isMaximized ? 'w-8 h-8' : 'w-7 h-7'
                  } flex items-center justify-center bg-white/20 hover:bg-white/30 text-white hover:text-red-100 rounded-lg transition-all shadow-sm cursor-pointer active:scale-95`}
                  title="إغلاق"
                >
                  <X size={isMaximized ? 16 : 15} />
                </button>
              </div>
            </div>

            {/* ── Persistent Patient Header Strip (STRICT: ZERO MEDICAL ALERTS) ── */}
            <div
              className={`bg-white ${
                isMaximized ? 'px-6 sm:px-8 py-3.5 sm:py-4' : 'px-5 sm:px-6 py-3.5'
              } flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-100 shrink-0 z-20`}
            >
              <div className={`flex items-center ${isMaximized ? 'gap-3.5 sm:gap-4' : 'gap-3 sm:gap-3.5'}`}>
                <div
                  className={`${
                    isMaximized ? 'w-12 h-12 sm:w-13 sm:h-13 rounded-xl' : 'w-11 h-11 sm:w-12 sm:h-12 rounded-xl'
                  } bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center text-purple-600 shadow-inner border border-purple-100/60 shrink-0`}
                >
                  <User size={isMaximized ? 24 : 22} strokeWidth={1.8} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center flex-wrap gap-2">
                    <h2 className="text-base sm:text-lg font-black text-slate-800 tracking-tight leading-none">
                      {surgeryInfo.full_name || '...'}
                    </h2>

                    {/* Surgical Badges */}
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] rounded-full font-black bg-purple-100/70 text-purple-700 border border-purple-200/60 shadow-2xs select-none">
                      <Scissors size={11} className="text-purple-600 shrink-0" />
                      <span>عمليات</span>
                    </span>

                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] rounded-full font-bold border shadow-2xs ${statusCfg.bg}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusCfg.dot}`} />
                      <span>{statusCfg.label}</span>
                    </span>

                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-0.5">
                    {/* Patient ID */}
                    <span
                      className="flex items-center gap-1 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md font-black text-slate-500 bg-slate-100/80 border border-slate-200/60"
                      dir="ltr"
                    >
                      <User size={11} /> {surgeryInfo.patient_id || '...'}
                    </span>

                    {/* Gender & Age */}
                    {(surgeryInfo.gender || surgeryInfo.age) && (
                      <span className="flex items-center gap-1 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md font-black text-slate-600 bg-slate-100/80 border border-slate-200/60">
                        {surgeryInfo.gender === 'male' || surgeryInfo.gender === 'ذكر' ? 'ذكر' : 'أنثى'}
                        {surgeryInfo.gender && surgeryInfo.age ? ' — ' : ''}
                        {surgeryInfo.age ? `${surgeryInfo.age} سنة` : ''}
                      </span>
                    )}

                    {/* Phone */}
                    {surgeryInfo.phone && surgeryInfo.phone !== '—' && (
                      <span className="flex items-center gap-1 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md font-black text-sky-600 bg-sky-50 border border-sky-100/60">
                        <Phone size={11} /> <span dir="ltr">{surgeryInfo.phone}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Date, Visit ID & Timing */}
              <div
                className={`flex flex-col items-start md:items-end ${
                  isMaximized ? 'gap-1.5' : 'gap-1'
                } self-stretch md:self-auto`}
              >
                <div
                  className={`flex items-center gap-1.5 text-slate-500 font-bold ${
                    isMaximized ? 'text-xs sm:text-sm' : 'text-xs'
                  }`}
                >
                  <Calendar size={isMaximized ? 15 : 13} className="text-purple-600 opacity-80" />
                  <span dir="ltr">
                    {new Date(surgeryInfo.created_at || Date.now()).toLocaleDateString('en-GB')}
                  </span>
                  <span className="text-slate-300 mx-0.5">•</span>
                  <span dir="ltr">
                    {new Date(surgeryInfo.created_at || Date.now()).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </span>
                </div>

                <div
                  className={`flex items-center gap-1 ${
                    isMaximized ? 'text-xs font-black' : 'text-[10px] sm:text-[11px] font-black'
                  } text-slate-400`}
                >
                  <span>معرف الزيارة:</span>
                  <span className="text-slate-600 font-bold" dir="ltr">
                    {surgeryInfo.visit_number || currentVisit?.visit_number || '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* ── 5-Tab Segmented Pill Navigation ─────────────────────── */}
            <div className="flex justify-center items-center border-b border-gray-150 px-4 py-2 bg-gray-50/50 flex-shrink-0">
              <div className="flex justify-center gap-2 text-xs font-bold text-gray-500 overflow-x-auto w-full pb-1 md:pb-0">
                {[
                  { id: 'surgery', label: 'العملية الجراحية', icon: Scissors },
                  ...(visitLabs.length + visitRads.length + visitClinics.length > 0
                    ? [{ id: 'services', label: 'الخدمات والفحوصات', icon: History, count: visitLabs.length + visitRads.length + visitClinics.length }]
                    : []),
                  ...(completedLabs.length + completedRads.length + completedClinics.length > 0
                    ? [{ id: 'results', label: 'النتائج والتقارير', icon: Eye, count: completedLabs.length + completedRads.length + completedClinics.length }]
                    : []),
                  { id: 'prescription', label: 'الروشتة', icon: Pill, count: visitMeds.length },
                  { id: 'financials', label: 'الملخص المالي', icon: Wallet }
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all whitespace-nowrap text-xs cursor-pointer ${
                        isActive
                          ? 'bg-white text-purple-700 shadow-sm border border-purple-100 ring-1 ring-purple-50 font-black'
                          : 'hover:bg-gray-100 text-gray-500 font-bold'
                      }`}
                    >
                      <Icon size={15} />
                      <span>{tab.label}</span>
                      {tab.count !== undefined && tab.count > 0 && (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                            isActive
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Scrollable Tab Body ─────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto bg-slate-50 min-h-0">
              <div
                className={`${
                  isMaximized
                    ? 'w-full max-w-[1720px] mx-auto px-6 sm:px-8 lg:px-10 py-6'
                    : 'p-6'
                } space-y-6`}
              >
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-24">
                    <div className="w-10 h-10 border-3 border-purple-600 border-t-transparent rounded-full animate-spin mb-3" />
                    <span className="text-xs font-bold text-slate-500">جاري تحميل بيانات العملية...</span>
                  </div>
                ) : (
                  <>
                    {/* ═════════════════════════════════════════════════════ */}
                    {/* ✂️ TAB 1: SURGERY CORE (العملية الجراحية)           */}
                    {/* ═════════════════════════════════════════════════════ */}
                    {activeTab === 'surgery' && (
                      <div className="space-y-6 animate-in fade-in duration-200">
                        {/* 1. Surgery Control & Scheduling Card */}
                        <div className="bg-white rounded-2xl shadow-xs border border-purple-100 overflow-hidden">
                          <div className="bg-gradient-to-r from-purple-50/80 via-white to-purple-50/40 px-5 py-3.5 border-b border-purple-100 flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="p-2 rounded-xl bg-purple-100 text-purple-700 border border-purple-200/70 shadow-2xs">
                                <Scissors size={16} />
                              </div>
                              <h3 className="font-black text-slate-800 text-sm">
                                إدارة وجدولة العملية الجراحية
                              </h3>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${statusCfg.bg}`}>
                                {statusCfg.label}
                              </span>
                              {statusKey !== 'completed' && !isEditingSurgery && (
                                <button
                                  type="button"
                                  onClick={() => setIsEditingSurgery(true)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200/90 rounded-xl font-black text-xs transition-all shadow-2xs active:scale-95 cursor-pointer"
                                  title="تعديل بيانات وجدولة العملية"
                                >
                                  <Edit3 size={13} />
                                  <span>تعديل</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Read-Only Table View vs Interactive Edit Form */}
                          {!isEditingSurgery ? (
                            <div className="p-0 overflow-x-auto">
                              <table className="w-full text-right text-xs">
                                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold">
                                  <tr>
                                    <th className="px-5 py-3.5 w-[45%] text-right">نوع واسم العملية الجراحية</th>
                                    <th className="px-4 py-3.5 w-[25%] text-center whitespace-nowrap">رسوم العملية</th>
                                    <th className="px-5 py-3.5 w-[30%] text-center whitespace-nowrap">الموعد المجدول</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td className="px-5 py-4 font-black text-slate-800 text-sm">
                                      {surgeryType ? (
                                        <span className="leading-snug">{surgeryType}</span>
                                      ) : (
                                        <span className="text-slate-400 font-bold text-xs italic">لم يتم تحديد نوع العملية بعد</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-4 text-center font-black text-purple-700 text-sm whitespace-nowrap">
                                      {price && Number(price) > 0 ? (
                                        formatYER(price)
                                      ) : (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                          بانتظار التسعير
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-5 py-4 text-center font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                                      {scheduledDate ? (
                                        <span className="inline-flex items-center gap-1.5 text-xs">
                                          <Calendar size={13} className="text-purple-600" />
                                          <span>
                                            {new Date(scheduledDate).toLocaleDateString('en-GB')} ·{' '}
                                            {new Date(scheduledDate).toLocaleTimeString('en-US', {
                                              hour: '2-digit',
                                              minute: '2-digit',
                                              hour12: true
                                            })}
                                          </span>
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 font-normal text-xs" dir="rtl">غير محدد</span>
                                      )}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="p-5 space-y-4">
                              <div className="flex flex-col md:flex-row gap-3.5 items-end">
                                {/* Surgery Name — 50% Proportional Width */}
                                <div className="w-full md:w-[50%]">
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                    نوع واسم العملية الجراحية
                                  </label>
                                  <input
                                    type="text"
                                    disabled={statusKey === 'completed'}
                                    value={surgeryType}
                                    onChange={(e) => setSurgeryType(e.target.value)}
                                    className="w-full h-11 bg-white border border-slate-200/90 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 rounded-xl px-3.5 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none transition-all shadow-2xs disabled:opacity-60"
                                    placeholder="مثال: تثبيت كسر الفخذ بشريحة ومسامير"
                                  />
                                </div>

                                {/* Price — 28% Proportional Width (Rendered directly after Surgery Name) */}
                                <div className="w-full md:w-[28%]">
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                                    <Wallet size={13} className="text-purple-600" />
                                    <span>رسوم العملية</span>
                                  </label>
                                  <div
                                    className={`relative flex items-center h-11 bg-white border border-slate-200/90 rounded-xl overflow-hidden focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-100 transition-all shadow-2xs group ${
                                      statusKey === 'completed' ? 'opacity-60 pointer-events-none' : ''
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const cur = parseFloat(toEnglishDigits(String(price ?? '').replace(/,/g, ''))) || 0;
                                        const step = cur >= 10000 ? 5000 : cur >= 1000 ? 1000 : 500;
                                        const nextVal = Math.max(0, cur - step);
                                        setPrice(nextVal > 0 ? String(nextVal) : '');
                                      }}
                                      disabled={
                                        (parseFloat(toEnglishDigits(String(price ?? '').replace(/,/g, ''))) || 0) <= 0 ||
                                        statusKey === 'completed'
                                      }
                                      className="w-9 h-full flex items-center justify-center text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer shrink-0 disabled:opacity-35 disabled:pointer-events-none"
                                      title="إنقاص الرسوم"
                                    >
                                      <Minus size={13} strokeWidth={3} />
                                    </button>
                                    <div className="flex-1 relative flex items-center justify-center h-full min-w-0">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        lang="en"
                                        dir="ltr"
                                        disabled={statusKey === 'completed'}
                                        value={formatPriceWithCommas(price)}
                                        onChange={(e) => {
                                          const raw = toEnglishDigits(e.target.value).replace(/\D/g, '');
                                          setPrice(raw);
                                        }}
                                        className="w-full h-full bg-transparent text-sm font-black text-slate-800 text-center focus:outline-none tabular-nums px-6"
                                        placeholder="0"
                                      />
                                      <span className="absolute left-2 text-[10px] font-black text-slate-400 pointer-events-none select-none">
                                        ر.ي
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const cur = parseFloat(toEnglishDigits(String(price ?? '').replace(/,/g, ''))) || 0;
                                        const step = cur >= 10000 ? 5000 : 1000;
                                        setPrice(String(cur + step));
                                      }}
                                      disabled={statusKey === 'completed'}
                                      className="w-9 h-full flex items-center justify-center text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer shrink-0 disabled:opacity-35 disabled:pointer-events-none"
                                      title="زيادة الرسوم"
                                    >
                                      <Plus size={13} strokeWidth={3} />
                                    </button>
                                  </div>
                                </div>

                                {/* Scheduled Date — 22% Proportional Width (Reverted to Standard Native Picker) */}
                                <div className="w-full md:w-[22%]">
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                                    <Calendar size={13} className="text-purple-600" />
                                    <span>الموعد المجدول</span>
                                  </label>
                                  <input
                                    type="datetime-local"
                                    disabled={statusKey === 'completed'}
                                    value={scheduledDate}
                                    onChange={(e) => setScheduledDate(e.target.value)}
                                    className="w-full h-11 bg-white border border-slate-200/90 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 rounded-xl px-3 text-xs font-bold text-slate-800 outline-none transition-all shadow-2xs tabular-nums disabled:opacity-60"
                                  />
                                </div>
                              </div>

                              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                                <button
                                  type="button"
                                  onClick={handleCancelEditSurgery}
                                  disabled={savingPrice}
                                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-xl transition-all cursor-pointer"
                                >
                                  إلغاء
                                </button>
                                <button
                                  type="button"
                                  onClick={handlePriceSurgery}
                                  disabled={savingPrice}
                                  className="inline-flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                                >
                                  {savingPrice ? (
                                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Save size={14} />
                                  )}
                                  <span>حفظ التعديلات</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Informational Status Notices */}
                          {statusKey === 'scheduled' && (
                            <div className="p-3 bg-amber-50 text-amber-900 text-xs font-bold border-t border-amber-100 flex items-center gap-2">
                              <Clock size={15} className="text-amber-600 shrink-0" />
                              <span>تم إرسال العملية للصندوق. المريض في انتظار إتمام السداد أو الدفعة المقدمة للانتقال لحالة "جاهز للعملية".</span>
                            </div>
                          )}

                          {statusKey === 'ready' && (
                            <div className="p-3 bg-emerald-50 text-emerald-900 text-xs font-bold border-t border-emerald-100 flex items-center gap-2">
                              <CheckCircle size={15} className="text-emerald-600 shrink-0" />
                              <span>المريض أتم الدفع وهو جاهز الآن لبدء العملية في غرفة العمليات.</span>
                            </div>
                          )}

                          {statusKey === 'post_op' && (
                            <div className="p-3 bg-purple-50 text-purple-900 text-xs font-bold border-t border-purple-100 flex items-center gap-2">
                              <Scissors size={15} className="text-purple-600 shrink-0" />
                              <span>تم إجراء العملية. يمكنك تسجيل المواد المستهلكة والتكاليف الإضافية قبل إنهاء الملف.</span>
                            </div>
                          )}

                          {statusKey === 'completed' && (
                            <div className="p-3 bg-slate-100 text-slate-700 text-xs font-bold border-t border-slate-200 flex items-center gap-2">
                              <CheckCircle size={15} className="text-emerald-600 shrink-0" />
                              <span>تم إنهاء العملية وإغلاق الملف بنجاح. السجل متاح الآن للقراءة والمراجعة المحاسبية.</span>
                            </div>
                          )}
                        </div>

                        {/* 2. Pre-Op Diagnostics Section — hidden when empty */}
                        {(preOpLabs.length > 0 || preOpRads.length > 0) && (
                        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
                          <div className="bg-gradient-to-r from-sky-50/80 via-white to-sky-50/40 px-5 py-3.5 border-b border-sky-100 flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="p-2 rounded-xl bg-sky-100 text-sky-700 border border-sky-200/70 shadow-2xs">
                                <FlaskConical size={16} />
                              </div>
                              <span className="font-black text-slate-800 text-sm">
                                الفحوصات والتحاليل المرتبطة بالعملية (ما قبل الجراحة)
                              </span>
                              <span className="text-[11px] px-2.5 py-0.5 font-extrabold rounded-full bg-sky-50 text-sky-800 border border-sky-200">
                                {preOpLabs.length + preOpRads.length} فحص
                              </span>
                            </div>
                          </div>

                          <div className="p-0 overflow-x-auto">
                            <table className="w-full text-right text-xs">
                              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold">
                                <tr>
                                  <th className="px-4 py-3 w-12 text-center">#</th>
                                  <th className="px-5 py-3">اسم الفحص أو التحليل</th>
                                  <th className="px-4 py-3 w-32 text-center">القسم</th>
                                  <th className="px-4 py-3 w-36 text-center">الحالة</th>
                                  <th className="px-4 py-3 w-28 text-center">التقرير / النتيجة</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {preOpLabs.length === 0 && preOpRads.length === 0 ? (
                                  <tr>
                                    <td colSpan="5" className="text-center py-8 text-slate-400 font-bold">
                                      لا توجد فحوصات ما قبل الجراحة مرتبطة مباشرة برقم هذه العملية
                                    </td>
                                  </tr>
                                ) : (
                                  <>
                                    {preOpLabs.map((l, idx) => (
                                      <tr key={`lab_${l.id}`} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-3 text-center font-bold text-slate-400">{idx + 1}</td>
                                        <td className="px-5 py-3 font-bold text-slate-800">{l.name || 'تحليل مخبري'}</td>
                                        <td className="px-4 py-3 text-center">
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                            مختبر
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            {l.status === 'completed' ? 'مكتملة' : 'في انتظار التنفيذ'}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          {l.result_notes || l.result_file ? (
                                            <button
                                              type="button"
                                              onClick={() => openUnifiedViewer(`lab_${l.id}`)}
                                              className="p-1.5 rounded-lg text-purple-700 hover:bg-purple-50 border border-purple-200 inline-flex items-center justify-center cursor-pointer transition-colors"
                                              title="عرض النتيجة"
                                            >
                                              <FileText size={14} />
                                            </button>
                                          ) : (
                                            <span className="text-slate-300 font-bold">—</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                    {preOpRads.map((r, idx) => (
                                      <tr key={`rad_${r.id}`} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-3 text-center font-bold text-slate-400">
                                          {preOpLabs.length + idx + 1}
                                        </td>
                                        <td className="px-5 py-3 font-bold text-slate-800">{r.name || 'فحص أشعة'}</td>
                                        <td className="px-4 py-3 text-center">
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                                            أشعة
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            {r.status === 'completed' ? 'مكتملة' : 'في انتظار التنفيذ'}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          {r.result_notes || r.result_file ? (
                                            <button
                                              type="button"
                                              onClick={() => openUnifiedViewer(`rad_${r.id}`)}
                                              className="p-1.5 rounded-lg text-sky-700 hover:bg-sky-50 border border-sky-200 inline-flex items-center justify-center cursor-pointer transition-colors"
                                              title="عرض النتيجة"
                                            >
                                              <FileText size={14} />
                                            </button>
                                          ) : (
                                            <span className="text-slate-300 font-bold">—</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        )}

                        {/* 3 & 4. Materials & Expenses Sections — hidden when surgery is planned & unpriced */}
                        {!isPlannedAndUnpriced && (
                          <>
                            {/* 3. OR Materials Dispensing Section */}
                            <div className="bg-white rounded-2xl shadow-xs border border-purple-100 overflow-hidden">
                              <div
                                onClick={() => toggleSurgerySection('materials')}
                                className={`w-full flex items-center justify-between px-5 py-3.5 cursor-pointer select-none transition-colors bg-gradient-to-r from-purple-50/80 via-white to-purple-50/40 hover:bg-purple-50/90 flex-wrap gap-2 ${
                                  openSurgerySections.materials ? 'border-b border-purple-100' : ''
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="p-2 rounded-xl bg-purple-100 text-purple-700 border border-purple-200/70 shadow-2xs">
                                    <Package size={16} />
                                  </div>
                                  <span className="font-black text-slate-800 text-sm">
                                    المواد والمستلزمات المستهلكة (من مخزن العمليات)
                                  </span>
                                  <span className="text-[11px] px-2.5 py-0.5 font-bold rounded-full bg-purple-100/70 text-purple-700 border border-purple-200/70 shadow-2xs">
                                    {data?.materials?.length || 0} أصناف
                                  </span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-black text-purple-800 bg-purple-100/70 px-3 py-1 rounded-xl border border-purple-200">
                                    إجمالي تكلفة المواد: {formatYER(materialsCost)}
                                  </span>
                                  <div className="w-7 h-7 rounded-lg bg-white/80 border border-purple-200/70 flex items-center justify-center text-purple-700 shadow-2xs">
                                    <ChevronDown
                                      size={16}
                                      className={`transition-transform duration-200 ${
                                        openSurgerySections.materials ? 'rotate-180' : ''
                                      }`}
                                    />
                                  </div>
                                </div>
                              </div>

                              {openSurgerySections.materials && (
                                <div className="animate-in fade-in duration-150">

                          {statusKey !== 'completed' && (
                            <div className="p-4 bg-slate-50/80 border-b border-slate-100">
                              <label className="block text-xs font-bold text-slate-700 mb-2">
                                إضافة وصرف مادة من مخزن العمليات
                              </label>
                              <div className="flex flex-col md:flex-row gap-3 items-center">
                                {/* Search and Selection — 58% Proportional Width */}
                                <div className="w-full md:w-[58%] relative">
                                  {selectedItem ? (
                                    <div className="flex items-center justify-between h-11 px-3.5 bg-purple-50/70 border border-purple-200 rounded-xl shadow-2xs">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <Package size={16} className="text-purple-600 shrink-0" />
                                        <span className="font-black text-slate-800 text-xs truncate">
                                          {selectedItem.name}
                                        </span>
                                        <span className="text-[10px] font-bold text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded-md border border-purple-200 shrink-0">
                                          المتاح: {formatArabicQuantity(Math.round(Number(selectedItem.quantity) || 0), selectedItem.unit)}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedItem(null);
                                          setSearchInv('');
                                          setQty('1');
                                        }}
                                        className="w-7 h-7 rounded-lg hover:bg-purple-200/60 text-purple-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                                        title="إلغاء الاختيار والبحث من جديد"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="relative flex items-center">
                                      <input
                                        type="text"
                                        value={searchInv}
                                        onChange={(e) => {
                                          setSearchInv(e.target.value);
                                          setSelectedItem(null);
                                        }}
                                        placeholder="ابحث عن مادة أو مستلزم في مخزن العمليات..."
                                        className="w-full h-11 pr-9 pl-3.5 bg-white border border-slate-200/90 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 outline-none transition-all shadow-2xs"
                                      />
                                      <Search size={15} className="absolute right-3 text-slate-400 pointer-events-none" />
                                    </div>
                                  )}

                                  {searchInv && !selectedItem && filteredInv.length > 0 && (
                                    <div className="absolute right-0 left-0 top-full mt-1.5 bg-white border border-slate-200/90 rounded-2xl shadow-[0_12px_32px_rgba(15,23,42,0.12)] p-1.5 z-50 max-h-56 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
                                      {filteredInv.map((inv) => {
                                        const stockNum = Math.round(Number(inv.quantity) || 0);
                                        const isOutOfStock = stockNum <= 0;
                                        return (
                                          <div
                                            key={inv.id}
                                            onClick={() => {
                                              if (isOutOfStock) return;
                                              setSelectedItem(inv);
                                              setSearchInv('');
                                              setQty('1');
                                            }}
                                            className={`px-3.5 py-2.5 rounded-xl border flex justify-between items-center transition-all text-xs mb-0.5 last:mb-0 group ${
                                              isOutOfStock
                                                ? 'bg-slate-50/70 border-slate-200/50 cursor-not-allowed opacity-60'
                                                : 'cursor-pointer hover:bg-purple-50/80 border-transparent hover:border-purple-200/60'
                                            }`}
                                          >
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                              <span
                                                className={`w-2 h-2 rounded-full shrink-0 ${
                                                  isOutOfStock ? 'bg-rose-400' : 'bg-purple-500 group-hover:scale-125 transition-transform'
                                                }`}
                                              />
                                              <span className={`font-bold truncate ${isOutOfStock ? 'text-slate-500' : 'text-slate-800'}`}>
                                                {inv.name}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                              {isOutOfStock ? (
                                                <span className="text-[10px] font-black text-rose-700 bg-rose-100/90 px-2.5 py-0.5 rounded-lg border border-rose-300">
                                                  نفد من المخزن (0) - غير متاح للصرف
                                                </span>
                                              ) : (
                                                <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-lg border border-purple-200/70 shadow-2xs">
                                                  المتاح: {formatArabicQuantity(stockNum, inv.unit)}
                                                </span>
                                              )}
                                              <span className="text-[11px] font-black text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200/60">
                                                {formatYER(inv.cost_price)}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>

                                {/* Quantity Stepper — 18% Proportional Width */}
                                <div className="w-full md:w-[18%]">
                                  <div className="relative flex items-center h-11 bg-white border border-slate-200/90 rounded-xl overflow-hidden focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-100 transition-all shadow-2xs group">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const cur = parseInt(toEnglishDigits(String(qty || '1'))) || 1;
                                        setQty(String(Math.max(1, cur - 1)));
                                      }}
                                      disabled={currentQtyNum <= 1}
                                      className="w-9 h-full flex items-center justify-center text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer shrink-0 disabled:opacity-35 disabled:pointer-events-none"
                                      title="إنقاص الكمية"
                                    >
                                      <Minus size={13} strokeWidth={3} />
                                    </button>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      lang="en"
                                      dir="ltr"
                                      step="1"
                                      value={toEnglishDigits(String(qty))}
                                      onChange={(e) => {
                                        const raw = toEnglishDigits(e.target.value).replace(/\D/g, '');
                                        if (!raw) {
                                          setQty('');
                                          return;
                                        }
                                        const val = parseInt(raw, 10);
                                        if (selectedItem && availableStock > 0 && val > availableStock) {
                                          setQty(String(availableStock));
                                          toast.warning(`الحد الأقصى المتاح للصرف في المخزن هو ${formatArabicQuantity(availableStock, selectedItem.unit)}`);
                                        } else {
                                          setQty(String(val));
                                        }
                                      }}
                                      className="flex-1 w-full min-w-0 bg-transparent text-sm font-black text-slate-800 text-center focus:outline-none tabular-nums"
                                      placeholder="1"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const cur = parseInt(toEnglishDigits(String(qty || '0'))) || 0;
                                        if (selectedItem && availableStock > 0 && cur >= availableStock) {
                                          toast.warning(`الحد الأقصى المتاح للصرف في المخزن هو ${formatArabicQuantity(availableStock, selectedItem.unit)}`);
                                          return;
                                        }
                                        setQty(String(cur + 1));
                                      }}
                                      disabled={Boolean(selectedItem && (availableStock <= 0 || currentQtyNum >= availableStock))}
                                      className="w-9 h-full flex items-center justify-center text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer shrink-0 disabled:opacity-35 disabled:pointer-events-none"
                                      title="زيادة الكمية"
                                    >
                                      <Plus size={13} strokeWidth={3} />
                                    </button>
                                  </div>
                                </div>

                                {/* Add Button — 24% Proportional Width */}
                                <div className="w-full md:w-[24%]">
                                  <button
                                    type="button"
                                    onClick={handleAddMaterial}
                                    disabled={addingMaterial || !selectedItem || isStockZero || isExceedingStock || currentQtyNum <= 0}
                                    className="w-full h-11 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                                  >
                                    {addingMaterial ? (
                                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <Plus size={15} />
                                    )}
                                    <span>إضافة واستهلاك</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="p-0 overflow-x-auto">
                            <table className="w-full text-right text-xs">
                              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold">
                                <tr>
                                  <th className="px-4 py-3 w-[5%] text-center">#</th>
                                  <th className="px-5 py-3 w-[43%] text-right">اسم المادة والمستلزم</th>
                                  <th className="px-4 py-3 w-[14%] text-center whitespace-nowrap">الكمية المصروفة</th>
                                  <th className="px-4 py-3 w-[14%] text-center whitespace-nowrap">سعر التكلفة</th>
                                  <th className="px-4 py-3 w-[14%] text-center whitespace-nowrap">إجمالي التكلفة</th>
                                  <th className="px-4 py-3 w-[10%] text-center whitespace-nowrap">الإجراء</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {!data?.materials || data.materials.length === 0 ? (
                                  <tr>
                                    <td colSpan="6" className="text-center py-8 text-slate-400 font-bold">
                                      لم يتم تسجيل أي مواد مستهلكة للعملية حتى الآن
                                    </td>
                                  </tr>
                                ) : (
                                  data.materials.map((m, idx) => (
                                    <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="px-4 py-3 text-center font-bold text-slate-400">{idx + 1}</td>
                                      <td className="px-5 py-3 font-bold text-slate-800">{m.name}</td>
                                      <td className="px-4 py-3 text-center font-bold text-slate-700 whitespace-nowrap">
                                        {formatArabicQuantity(Math.round(Number(m.quantity) || 0), m.unit)}
                                      </td>
                                      <td className="px-4 py-3 text-center font-bold text-slate-700 whitespace-nowrap">
                                        {formatYER(m.cost_price)}
                                      </td>
                                      <td className="px-5 py-3 text-center font-black text-purple-700 whitespace-nowrap">
                                        {formatYER(m.total_cost)}
                                      </td>
                                      <td className="px-4 py-3 text-center whitespace-nowrap">
                                        {statusKey !== 'completed' ? (
                                          <button
                                            type="button"
                                            onClick={() => promptDeleteMaterial(m)}
                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center"
                                            title="حذف واسترجاع للمخزن"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        ) : (
                                          <span className="text-slate-300 font-bold">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 4. Additional Expenses Section */}
                    <div className="bg-white rounded-2xl shadow-xs border border-rose-100 overflow-hidden">
                      <div
                        onClick={() => toggleSurgerySection('expenses')}
                        className={`w-full flex items-center justify-between px-5 py-3.5 cursor-pointer select-none transition-colors bg-gradient-to-r from-rose-50/80 via-white to-rose-50/40 hover:bg-rose-50/90 flex-wrap gap-2 ${
                          openSurgerySections.expenses ? 'border-b border-rose-100' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-rose-100 text-rose-700 border border-rose-200/70 shadow-2xs">
                            <DollarSign size={16} />
                          </div>
                          <span className="font-black text-slate-800 text-sm">
                            المصاريف الإضافية والأجور (أجر تخدير، جراح مساعد، أخرى)
                          </span>
                          <span className="text-[11px] px-2.5 py-0.5 font-bold rounded-full bg-rose-100/70 text-rose-700 border border-rose-200/70 shadow-2xs">
                            {data?.expenses?.length || 0} بنود
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-rose-800 bg-rose-100/70 px-3 py-1 rounded-xl border border-rose-200">
                            إجمالي المصاريف: {formatYER(expensesCost)}
                          </span>
                          <div className="w-7 h-7 rounded-lg bg-white/80 border border-rose-200/70 flex items-center justify-center text-rose-700 shadow-2xs">
                            <ChevronDown
                              size={16}
                              className={`transition-transform duration-200 ${
                                openSurgerySections.expenses ? 'rotate-180' : ''
                              }`}
                            />
                          </div>
                        </div>
                      </div>

                      {openSurgerySections.expenses && (
                        <div className="animate-in fade-in duration-150">

                          {statusKey !== 'completed' && (
                            <div className="p-4 bg-slate-50/80 border-b border-slate-100">
                              <label className="block text-xs font-bold text-slate-700 mb-2">
                                إضافة تكلفة أو مصروف إضافي
                              </label>
                              <div className="flex flex-col md:flex-row gap-3 items-center">
                                {/* Expense Description — 54% Proportional Width */}
                                <div className="w-full md:w-[54%]">
                                  <input
                                    type="text"
                                    value={expenseDesc}
                                    onChange={(e) => setExpenseDesc(e.target.value)}
                                    placeholder="وصف وبيان التكلفة (مثال: أجر طبيب التخدير / مساعد جراح)..."
                                    className="w-full h-11 bg-white border border-slate-200/90 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 rounded-xl px-3.5 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none transition-all shadow-2xs"
                                  />
                                </div>

                                {/* Amount Stepper — 26% Proportional Width */}
                                <div className="w-full md:w-[26%]">
                                  <div
                                    className="relative flex items-center h-11 bg-white border border-slate-200/90 rounded-xl overflow-hidden focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-100 transition-all shadow-2xs group"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const cur = parseFloat(toEnglishDigits(String(expenseAmount ?? '').replace(/,/g, ''))) || 0;
                                        const step = cur >= 10000 ? 5000 : cur >= 1000 ? 1000 : 500;
                                        const nextVal = Math.max(0, cur - step);
                                        setExpenseAmount(nextVal > 0 ? String(nextVal) : '');
                                      }}
                                      disabled={
                                        (parseFloat(toEnglishDigits(String(expenseAmount ?? '').replace(/,/g, ''))) || 0) <= 0
                                      }
                                      className="w-9 h-full flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0 disabled:opacity-35 disabled:pointer-events-none"
                                      title="إنقاص المبلغ"
                                    >
                                      <Minus size={13} strokeWidth={3} />
                                    </button>
                                    <div className="flex-1 relative flex items-center justify-center h-full min-w-0">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        lang="en"
                                        dir="ltr"
                                        value={formatPriceWithCommas(expenseAmount)}
                                        onChange={(e) => {
                                          const raw = toEnglishDigits(e.target.value).replace(/\D/g, '');
                                          setExpenseAmount(raw);
                                        }}
                                        className="w-full h-full bg-transparent text-sm font-black text-slate-800 text-center focus:outline-none tabular-nums px-6"
                                        placeholder="0"
                                      />
                                      <span className="absolute left-2 text-[10px] font-black text-slate-400 pointer-events-none select-none">
                                        ر.ي
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const cur = parseFloat(toEnglishDigits(String(expenseAmount ?? '').replace(/,/g, ''))) || 0;
                                        const step = cur >= 10000 ? 5000 : 1000;
                                        setExpenseAmount(String(cur + step));
                                      }}
                                      className="w-9 h-full flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                                      title="زيادة المبلغ"
                                    >
                                      <Plus size={13} strokeWidth={3} />
                                    </button>
                                  </div>
                                </div>

                                {/* Add Button — 20% Proportional Width */}
                                <div className="w-full md:w-[20%]">
                                  <button
                                    type="button"
                                    onClick={handleAddExpense}
                                    disabled={addingExpense}
                                    className="w-full h-11 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-black text-xs rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                                  >
                                    {addingExpense ? (
                                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <Plus size={15} />
                                    )}
                                    <span>إضافة التكلفة</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="p-0 overflow-x-auto">
                            <table className="w-full text-right text-xs">
                              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold">
                                <tr>
                                  <th className="px-4 py-3 w-[5%] text-center">#</th>
                                  <th className="px-5 py-3 w-[47%] text-right">بيان ووصف المصروف</th>
                                  <th className="px-4 py-3 w-[20%] text-center whitespace-nowrap">المبلغ</th>
                                  <th className="px-4 py-3 w-[18%] text-center whitespace-nowrap">التاريخ والوقت</th>
                                  <th className="px-4 py-3 w-[10%] text-center whitespace-nowrap">الإجراء</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {!data?.expenses || data.expenses.length === 0 ? (
                                  <tr>
                                    <td colSpan="5" className="text-center py-8 text-slate-400 font-bold">
                                      لا توجد تكاليف إضافية مسجلة لهذه العملية
                                    </td>
                                  </tr>
                                ) : (
                                  data.expenses.map((e, idx) => (
                                    <tr key={e.id} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="px-4 py-3 text-center font-bold text-slate-400">{idx + 1}</td>
                                      <td className="px-5 py-3 font-bold text-slate-800">{e.description}</td>
                                      <td className="px-4 py-3 text-center font-black text-rose-700">
                                        {formatYER(e.amount)}
                                      </td>
                                      <td className="px-4 py-3 text-center font-bold text-slate-500" dir="ltr">
                                        {new Date(e.created_at || Date.now()).toLocaleDateString('en-GB')} ·{' '}
                                        {new Date(e.created_at || Date.now()).toLocaleTimeString('en-US', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          hour12: true
                                        })}
                                      </td>
                                      <td className="px-4 py-3 text-center whitespace-nowrap">
                                        {statusKey !== 'completed' ? (
                                          <button
                                            type="button"
                                            onClick={() => promptDeleteExpense(e)}
                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center"
                                            title="حذف التكلفة"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        ) : (
                                          <span className="text-slate-300 font-bold">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                        )}
                      </div>
                    )}

                    {/* ═════════════════════════════════════════════════════ */}
                    {/* 📋 TAB 2: SERVICES & TESTS (الخدمات والفحوصات)       */}
                    {/* ═════════════════════════════════════════════════════ */}
                    {activeTab === 'services' && (
                      <div className="space-y-4 animate-in fade-in duration-200">
                        {/* Summary Header */}
                        <div className="flex items-center justify-between px-1">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-sky-100 rounded-lg text-sky-600 shadow-sm">
                              <History size={16} />
                            </div>
                            <h3 className="text-sm font-black text-slate-800">
                              الخدمات والفحوصات الطبية المرتبطة بالزيارة
                            </h3>
                            <span className="text-xs px-2.5 py-0.5 font-extrabold bg-sky-50 text-sky-700 rounded-full border border-sky-200/60">
                              {visitLabs.length + visitRads.length + visitClinics.length} خدمة مسجلة
                            </span>
                          </div>
                        </div>

                        {/* Collapsible Department Accordions — hide empty departments */}
                        {[
                          {
                            key: 'lab',
                            title: 'قسم المختبر والتحاليل',
                            items: visitLabs,
                            icon: FlaskConical,
                            color: {
                              border: 'border-purple-200/90',
                              headerBg: 'bg-gradient-to-r from-purple-50/80 via-white to-purple-50/40',
                              iconBox: 'bg-purple-100 text-purple-700',
                              badge: 'bg-purple-50 text-purple-800 border-purple-200'
                            }
                          },
                          {
                            key: 'radiology',
                            title: 'قسم الأشعة والتصوير الطبي',
                            items: visitRads,
                            icon: Radiation,
                            color: {
                              border: 'border-sky-200/90',
                              headerBg: 'bg-gradient-to-r from-sky-50/80 via-white to-sky-50/40',
                              iconBox: 'bg-sky-100 text-sky-700',
                              badge: 'bg-sky-50 text-sky-800 border-sky-200'
                            }
                          },
                          {
                            key: 'clinical',
                            title: 'قسم الخدمات السريرية والتمريضية',
                            items: visitClinics,
                            icon: Stethoscope,
                            color: {
                              border: 'border-teal-200/90',
                              headerBg: 'bg-gradient-to-r from-teal-50/80 via-white to-teal-50/40',
                              iconBox: 'bg-teal-100 text-teal-700',
                              badge: 'bg-teal-50 text-teal-800 border-teal-200'
                            }
                          }
                        ]
                          .filter((sec) => sec.items.length > 0)
                          .map((sec) => {
                          const isOpen = Boolean(openServiceSections[sec.key]);
                          const Icon = sec.icon;
                          return (
                            <div
                              key={sec.key}
                              className={`bg-white rounded-2xl border overflow-hidden shadow-xs transition-all ${sec.color.border}`}
                            >
                              <div
                                onClick={() => toggleServiceSection(sec.key)}
                                className={`w-full flex items-center justify-between px-4 py-3 cursor-pointer select-none transition-colors ${sec.color.headerBg}`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className={`p-2 rounded-xl shadow-2xs ${sec.color.iconBox}`}>
                                    <Icon size={16} />
                                  </div>
                                  <span className="text-sm font-black text-slate-800">{sec.title}</span>
                                  <span className={`text-[11px] px-2.5 py-0.5 font-extrabold rounded-full border ${sec.color.badge}`}>
                                    {sec.items.length} خدمة
                                  </span>
                                </div>
                                <div className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200 flex items-center justify-center text-slate-500">
                                  <ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                                </div>
                              </div>

                              {isOpen && (
                                <div className="border-t border-slate-100 overflow-x-auto">
                                  {sec.items.length === 0 ? (
                                    <div className="py-6 px-4 text-center">
                                      <p className="text-xs font-bold text-slate-400">لا توجد خدمات مسجلة في {sec.title}</p>
                                    </div>
                                  ) : (
                                    <table className="w-full text-right text-xs">
                                      <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold">
                                        <tr>
                                          <th className="px-4 py-3 w-12 text-center">#</th>
                                          <th className="px-5 py-3">اسم الخدمة / الفحص</th>
                                          <th className="px-4 py-3 w-40 text-center">تاريخ ووقت الطلب</th>
                                          <th className="px-4 py-3 w-32 text-center">السعر المعتمد</th>
                                          <th className="px-4 py-3 w-36 text-center">الحالة</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {sec.items.map((item, idx) => {
                                          const itemDate = item.requested_at || item.created_at;
                                          const cfg = SERVICE_STATUS_CONFIG[item.status] || {
                                            label: item.status || 'غير محدد',
                                            bg: 'bg-slate-50 text-slate-600 border-slate-200',
                                            dot: 'bg-slate-400'
                                          };
                                          return (
                                            <tr key={item.id || idx} className="hover:bg-slate-50/50 transition-colors">
                                              <td className="px-4 py-3 text-center font-bold text-slate-400">{idx + 1}</td>
                                              <td className="px-5 py-3 font-bold text-slate-800">
                                                {item.name || item.test_name || item.service_name || 'خدمة غير محددة'}
                                              </td>
                                              <td className="px-4 py-3 text-center font-bold text-slate-600" dir="ltr">
                                                {itemDate
                                                  ? `${new Date(itemDate).toLocaleDateString('en-GB')} · ${new Date(itemDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`
                                                  : '—'}
                                              </td>
                                              <td className="px-4 py-3 text-center font-bold text-slate-800">
                                                {item.is_free ? (
                                                  <span className="text-indigo-600 font-black">مجاني</span>
                                                ) : (
                                                  formatYER(item.final_price !== undefined ? item.final_price : item.price)
                                                )}
                                              </td>
                                              <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg}`}>
                                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                                                  <span>{cfg.label}</span>
                                                </span>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* ═════════════════════════════════════════════════════ */}
                    {/* 👁️ TAB 3: RESULTS & REPORTS (النتائج والتقارير)      */}
                    {/* ═════════════════════════════════════════════════════ */}
                    {activeTab === 'results' && (
                      <div className="space-y-6 animate-in fade-in duration-200">
                        {/* 1. Operation Summary & Report Card */}
                        <div className="bg-white rounded-2xl shadow-xs border border-purple-100 overflow-hidden">
                          <div className="bg-gradient-to-r from-purple-50/80 via-white to-purple-50/40 px-5 py-3.5 border-b border-purple-100 flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="p-2 rounded-xl bg-purple-100 text-purple-700 border border-purple-200/70 shadow-2xs">
                                <FileText size={16} />
                              </div>
                              <span className="font-black text-slate-800 text-sm">
                                ملخص تقرير العملية الجراحية
                              </span>
                            </div>
                            <span className={`text-xs font-bold px-3 py-1 rounded-xl border ${statusCfg.bg}`}>
                              الحالة: {statusCfg.label}
                            </span>
                          </div>
                          <div className="p-5 space-y-4">
                            {/* Surgery Name, Fee, Schedule */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                              <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-100 flex flex-col justify-between">
                                <span className="text-[10px] font-bold text-slate-400 block mb-1">اسم ونوع العملية</span>
                                <span className="text-xs font-black text-slate-800 leading-snug">
                                  {surgeryInfo.surgery_type || 'لم يحدد'}
                                </span>
                              </div>
                              <div className="p-3.5 bg-purple-50/50 rounded-xl border border-purple-100/80 flex flex-col justify-between">
                                <span className="text-[10px] font-bold text-purple-600 block mb-1">رسوم العملية</span>
                                <span className="text-xs font-black text-purple-900 tracking-tight">
                                  {formatYER(fullPrice || surgeryInfo.full_price || 0)}
                                </span>
                              </div>
                              <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-100 flex flex-col justify-between">
                                <span className="text-[10px] font-bold text-slate-400 block mb-1">الموعد المجدول</span>
                                <span className="text-xs font-bold text-slate-700" dir="ltr">
                                  {surgeryInfo.scheduled_date ? new Date(surgeryInfo.scheduled_date).toLocaleString('en-GB') : 'لم يجدول'}
                                </span>
                              </div>
                            </div>

                            {/* Surgery Notes & Report Attachments */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <FileText size={14} className="text-purple-600" />
                                  <span className="text-xs font-black text-slate-700">ملاحظات وتقرير العملية الجراحية</span>
                                </div>
                                {(surgeryInfo.report_file || surgeryInfo.attachments) && (
                                  <span className="text-[10px] font-bold text-purple-700 bg-purple-100/70 px-2.5 py-0.5 rounded-full border border-purple-200">
                                    يوجد مرفقات
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-medium text-slate-600 leading-relaxed whitespace-pre-wrap bg-white p-3 rounded-lg border border-slate-200/60">
                                {surgeryInfo.notes || surgeryInfo.report_notes || surgeryInfo.operation_notes || 'لا توجد ملاحظات سريرية مدونة للعملية حتى الآن.'}
                              </p>
                              {(surgeryInfo.report_file || surgeryInfo.attachments) && (
                                <div className="pt-1 flex flex-wrap items-center gap-2">
                                  <span className="text-[11px] font-bold text-slate-500">المرفقات:</span>
                                  {surgeryInfo.report_file && (
                                    <a
                                      href={resolveFileUrl(surgeryInfo.report_file)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors"
                                    >
                                      <FileText size={13} />
                                      <span>عرض ملف التقرير</span>
                                      <ExternalLink size={11} />
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 2. Diagnostic Results Sections (Lab & Radiology) — hide empty sections */}
                        {[
                          {
                            key: 'lab',
                            title: 'نتائج التحاليل المخبرية المعتمدة',
                            items: completedLabs,
                            icon: FlaskConical,
                            color: {
                              border: 'border-purple-200/90',
                              headerBg: 'bg-gradient-to-r from-purple-50/80 via-white to-purple-50/40',
                              iconBox: 'bg-purple-100 text-purple-700',
                              badge: 'bg-purple-50 text-purple-800 border-purple-200'
                            }
                          },
                          {
                            key: 'radiology',
                            title: 'تقارير وصور الأشعة المعتمدة',
                            items: completedRads,
                            icon: Radiation,
                            color: {
                              border: 'border-sky-200/90',
                              headerBg: 'bg-gradient-to-r from-sky-50/80 via-white to-sky-50/40',
                              iconBox: 'bg-sky-100 text-sky-700',
                              badge: 'bg-sky-50 text-sky-800 border-sky-200'
                            }
                          }
                        ]
                          .filter((sec) => sec.items.length > 0)
                          .map((sec) => {
                          const isOpen = Boolean(openResultSections[sec.key]);
                          const Icon = sec.icon;
                          return (
                            <div
                              key={sec.key}
                              className={`bg-white rounded-2xl border overflow-hidden shadow-xs transition-all ${sec.color.border}`}
                            >
                              <div
                                onClick={() => toggleResultSection(sec.key)}
                                className={`w-full flex items-center justify-between px-4 py-3 cursor-pointer select-none transition-colors ${sec.color.headerBg}`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className={`p-2 rounded-xl shadow-2xs ${sec.color.iconBox}`}>
                                    <Icon size={16} />
                                  </div>
                                  <span className="text-sm font-black text-slate-800">{sec.title}</span>
                                  <span className={`text-[11px] px-2.5 py-0.5 font-extrabold rounded-full border ${sec.color.badge}`}>
                                    {sec.items.length} نتيجة متوفرة
                                  </span>
                                </div>
                                <div className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200 flex items-center justify-center text-slate-500">
                                  <ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                                </div>
                              </div>

                              {isOpen && (
                                <div className="border-t border-slate-100 overflow-x-auto">
                                  {sec.items.length === 0 ? (
                                    <div className="py-6 px-4 text-center">
                                      <p className="text-xs font-bold text-slate-400">لا توجد نتائج مرفوعة حالياً</p>
                                    </div>
                                  ) : (
                                    <table className="w-full text-right text-xs">
                                      <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold">
                                        <tr>
                                          <th className="px-4 py-3 w-12 text-center">#</th>
                                          <th className="px-5 py-3">اسم الفحص</th>
                                          <th className="px-4 py-3 w-40 text-center">تاريخ الإنجاز</th>
                                          <th className="px-5 py-3">ملاحظات ومخرجات النتيجة</th>
                                          <th className="px-4 py-3 w-28 text-center">عرض التقرير</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {sec.items.map((row, idx) => {
                                          const rowDate = row.performed_at || row.completed_at || row.created_at;
                                          return (
                                            <tr key={row.id || idx} className="hover:bg-slate-50/50 transition-colors">
                                              <td className="px-4 py-3 text-center font-bold text-slate-400">{idx + 1}</td>
                                              <td className="px-5 py-3 font-bold text-slate-800">
                                                {row.name || row.test_name || row.radiology_name}
                                              </td>
                                              <td className="px-4 py-3 text-center font-bold text-slate-600" dir="ltr">
                                                {rowDate
                                                  ? new Date(rowDate).toLocaleDateString('en-GB')
                                                  : '—'}
                                              </td>
                                              <td className="px-5 py-3 text-slate-700 font-bold max-w-xs truncate">
                                                {row.result_notes || 'يوجد تقرير ومرفقات طبية'}
                                              </td>
                                              <td className="px-4 py-3 text-center">
                                                <button
                                                  type="button"
                                                  onClick={() => openUnifiedViewer(`${sec.key}_${row.id}`)}
                                                  className="inline-flex items-center justify-center p-2 rounded-xl text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-all cursor-pointer shadow-2xs active:scale-95"
                                                  title="فتح التقرير والمرفقات في نافذة مخصصة"
                                                >
                                                  <FileText size={15} />
                                                </button>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* ═════════════════════════════════════════════════════ */}
                    {/* 💊 TAB 4: PRESCRIPTION (الروشتة)                    */}
                    {/* ═════════════════════════════════════════════════════ */}
                    {activeTab === 'prescription' && (
                      <div className="space-y-4 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between px-1">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-indigo-100 rounded-lg text-indigo-600 shadow-sm">
                              <Pill size={16} />
                            </div>
                            <h3 className="text-sm font-black text-slate-800">
                              الوصفة الطبية المقررة للمريض
                            </h3>
                            <span className="text-xs px-2.5 py-0.5 font-extrabold bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200/60">
                              {visitMeds.length} أدوية
                            </span>
                          </div>

                          {visitMeds.length > 0 && (
                            <button
                              type="button"
                              onClick={handlePrintPrescription}
                              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 shadow-2xs transition-all cursor-pointer"
                            >
                              <Printer size={14} className="text-indigo-600" />
                              <span>طباعة الروشتة</span>
                            </button>
                          )}
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                          {visitMeds.length === 0 ? (
                            <div className="py-12 px-4 text-center">
                              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-indigo-500 border border-indigo-100">
                                <Pill size={22} />
                              </div>
                              <h4 className="text-sm font-black text-slate-800 mb-1">
                                لا توجد أدوية مقررة مسجلة في هذه الزيارة
                              </h4>
                              <p className="text-xs text-slate-400 font-bold">
                                لم يتم تحرير وصفة طبية من قبل الطبيب المعالج لهذه الزيارة حتى الآن.
                              </p>
                            </div>
                          ) : (
                            <div className="w-full overflow-x-auto">
                              <table className="w-full text-right text-xs">
                                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold">
                                  <tr>
                                    <th className="px-4 py-3.5 w-12 text-center">#</th>
                                    <th className="px-5 py-3.5">اسم الدواء</th>
                                    <th className="px-4 py-3.5 w-32 text-center">الجرعة</th>
                                    <th className="px-4 py-3.5 w-40 text-center">التكرار</th>
                                    <th className="px-5 py-3.5 text-center">التوجيهات والتعليمات</th>
                                    <th className="px-4 py-3.5 w-32 text-center">المدة</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {visitMeds.map((med, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="px-4 py-3 text-center font-bold text-slate-400">{idx + 1}</td>
                                      <td className="px-5 py-3 font-bold text-slate-800">
                                        <div className="flex items-center gap-2">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                          <span className="font-bold text-slate-800 text-xs">
                                            {med.medication_name || med.name}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-center font-bold text-slate-700">
                                        {toEnglishDigits(med.dosage) || '—'}
                                      </td>
                                      <td className="px-4 py-3 text-center font-bold text-slate-700">
                                        {toEnglishDigits(med.frequency) || '—'}
                                      </td>
                                      <td className="px-5 py-3 text-center font-bold text-slate-700">
                                        {toEnglishDigits(med.instructions) || '—'}
                                      </td>
                                      <td className="px-4 py-3 text-center font-bold text-slate-700">
                                        {toEnglishDigits(med.duration) || '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ═════════════════════════════════════════════════════ */}
                    {/* 💰 TAB 5: FINANCIAL SUMMARY (الملخص المالي)         */}
                    {/* ═════════════════════════════════════════════════════ */}
                    {activeTab === 'financials' && (
                      <div className="space-y-6 animate-in fade-in duration-200">
                        {/* Executive KPI Grid — hidden when value is zero */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {/* 1. Full Price */}
                          {fullPrice > 0 && (
                            <div className="bg-white rounded-2xl p-5 border border-blue-100 shadow-xs flex items-center gap-4 transition-all hover:shadow-sm">
                              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0 shadow-2xs">
                                <Tag size={22} />
                              </div>
                              <div>
                                <span className="text-[11px] font-bold text-slate-500 block mb-0.5">
                                  إجمالي رسوم العملية
                                </span>
                                <span className="text-lg font-black text-blue-900 tracking-tight">
                                  {formatYER(fullPrice)}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* 2. Total Paid */}
                          {totalPaidYer > 0 && (
                            <div className="bg-white rounded-2xl p-5 border border-emerald-100 shadow-xs flex items-center gap-4 transition-all hover:shadow-sm">
                              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0 shadow-2xs">
                                <CheckCircle size={22} />
                              </div>
                              <div>
                                <span className="text-[11px] font-bold text-slate-500 block mb-0.5">
                                  إجمالي المدفوعات المسددة
                                </span>
                                <span className="text-lg font-black text-emerald-700 tracking-tight">
                                  {formatYER(totalPaidYer)}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* 3. Remaining */}
                          {remainingYer > 0 && (
                            <div className="bg-white rounded-2xl p-5 border border-amber-100 shadow-xs flex items-center gap-4 transition-all hover:shadow-sm">
                              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0 shadow-2xs">
                                <Clock size={22} />
                              </div>
                              <div>
                                <span className="text-[11px] font-bold text-slate-500 block mb-0.5">
                                  المبلغ المتبقي على المريض
                                </span>
                                <span className="text-lg font-black text-amber-700 tracking-tight">
                                  {formatYER(remainingYer)}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* 4. Materials Cost — hidden if 0 */}
                          {materialsCost > 0 && (
                            <div className="bg-white rounded-2xl p-5 border border-purple-100 shadow-xs flex items-center gap-4 transition-all hover:shadow-sm">
                              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center shrink-0 shadow-2xs">
                                <Package size={22} />
                              </div>
                              <div>
                                <span className="text-[11px] font-bold text-slate-500 block mb-0.5">
                                  تكلفة المواد والمستلزمات
                                </span>
                                <span className="text-lg font-black text-purple-700 tracking-tight">
                                  {formatYER(materialsCost)}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* 5. Additional Expenses — hidden if 0 */}
                          {expensesCost > 0 && (
                            <div className="bg-white rounded-2xl p-5 border border-rose-100 shadow-xs flex items-center gap-4 transition-all hover:shadow-sm">
                              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0 shadow-2xs">
                                <DollarSign size={22} />
                              </div>
                              <div>
                                <span className="text-[11px] font-bold text-slate-500 block mb-0.5">
                                  المصاريف الإضافية والأجور
                                </span>
                                <span className="text-lg font-black text-rose-700 tracking-tight">
                                  {formatYER(expensesCost)}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* 6. Net Profit — primary summary KPI */}
                          <div
                            className={`rounded-2xl p-5 border shadow-xs flex items-center gap-4 transition-all hover:shadow-sm ${
                              netProfit >= 0
                                ? 'bg-gradient-to-br from-emerald-50/70 to-teal-50/40 border-emerald-200'
                                : 'bg-gradient-to-br from-rose-50/70 to-red-50/40 border-rose-200'
                            }`}
                          >
                            <div
                              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-2xs ${
                                netProfit >= 0
                                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                  : 'bg-rose-100 text-rose-700 border-rose-200'
                              }`}
                            >
                              <Wallet size={22} />
                            </div>
                            <div>
                              <span className="text-[11px] font-bold text-slate-500 block mb-0.5">
                                صافي أرباح العملية الجراحية
                              </span>
                              <span
                                className={`text-xl font-black tracking-tight ${
                                  netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                {netProfit >= 0 ? '+' : ''}
                                {formatYER(netProfit)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Cashier Payment Transactions Table */}
                        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
                          <div className="bg-slate-50/80 px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                            <h4 className="font-black text-slate-800 text-sm flex items-center gap-2">
                              <CheckCircle size={16} className="text-emerald-600" />
                              <span>سجل سندات القبض والدفعات المسددة من الصندوق</span>
                            </h4>
                            <span className="text-xs font-bold text-slate-500">
                              {data?.payments?.length || 0} سندات مسجلة
                            </span>
                          </div>

                          <div className="p-0 overflow-x-auto">
                            <table className="w-full text-right text-xs">
                              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold">
                                <tr>
                                  <th className="px-4 py-3 w-12 text-center">#</th>
                                  <th className="px-5 py-3">رقم السند / المرجع</th>
                                  <th className="px-4 py-3 text-center">المبلغ</th>
                                  <th className="px-4 py-3 text-center">طريقة الدفع</th>
                                  <th className="px-4 py-3 text-center">المحصّل</th>
                                  <th className="px-5 py-3 text-center">التاريخ والوقت</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {!data?.payments || data.payments.length === 0 ? (
                                  <tr>
                                    <td colSpan="6" className="text-center py-8 text-slate-400 font-bold">
                                      لا توجد دفعات مسددة مسجلة في الصندوق لهذه العملية حتى الآن
                                    </td>
                                  </tr>
                                ) : (
                                  data.payments.map((p, idx) => {
                                    return (
                                      <tr key={p.id || idx} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-3 text-center font-bold text-slate-400">{idx + 1}</td>
                                        <td className="px-5 py-3 font-bold text-slate-800" dir="ltr">
                                          {p.receipt_number ? `#${p.receipt_number}` : p.reference_number || (p.id ? `#${p.id}` : '—')}
                                        </td>
                                        <td className="px-4 py-3 text-center font-black text-emerald-700">
                                          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200/70 px-2.5 py-1 rounded-lg inline-block">
                                            {formatYER(p.amount)}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                            <Wallet size={11} className="text-slate-500 shrink-0" />
                                            <span>{p.payment_method === 'bank' ? 'تحويل بنكي' : 'نقداً'}</span>
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-center font-bold text-slate-700">
                                          {p.received_by_name || p.received_by || 'أمين الصندوق'}
                                        </td>
                                        <td className="px-5 py-3 text-center font-bold text-slate-600 text-[11px]" dir="ltr">
                                          {new Date(p.created_at || p.payment_date || Date.now()).toLocaleDateString('en-GB')} ·{' '}
                                          {new Date(p.created_at || p.payment_date || Date.now()).toLocaleTimeString('en-US', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            hour12: true
                                          })}
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
                  </>
                )}
              </div>
            </div>

            {/* ── Persistent Bottom Footer Strip ─────────────────────── */}
            <div className="bg-white border-t border-slate-200 px-6 py-3.5 flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
              <div className="flex items-center gap-4 text-xs">
                <span className="font-bold text-slate-500">
                  صافي العملية:{' '}
                  <strong className={netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                    {netProfit >= 0 ? '+' : ''}
                    {formatYER(netProfit)}
                  </strong>
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-bold text-slate-500">
                  المتبقي:{' '}
                  <strong className={remainingYer > 0 ? 'text-amber-700' : 'text-slate-700'}>
                    {formatYER(remainingYer)}
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Ready status -> Start surgery */}
                {statusKey === 'ready' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('post_op')}
                    className="inline-flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <CheckCircle size={15} />
                    <span>بدء العملية (تحويل لحالة ما بعد العملية)</span>
                  </button>
                )}

                {/* Post_op status -> Complete surgery */}
                {statusKey === 'post_op' && (
                  <button
                    type="button"
                    onClick={handleComplete}
                    className="inline-flex items-center gap-2 px-5 py-2 bg-gray-900 hover:bg-black text-white font-black text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <Check size={15} />
                    <span>إنهاء العملية وإغلاق الملف</span>
                  </button>
                )}

                {/* Planned & Unpriced -> Quick action to start pricing */}
                {statusKey === 'planned' && isPlannedAndUnpriced && !isEditingSurgery && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('surgery');
                      setIsEditingSurgery(true);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <Edit3 size={15} />
                    <span>تسعير وجدولة العملية</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs transition-colors cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Unified Diagnostic Result Viewer Modal Mount ──────────────── */}
      {activeResultViewer.isOpen && (
        <ClinicalResultViewerModal
          isOpen={activeResultViewer.isOpen}
          onClose={() => setActiveResultViewer((prev) => ({ ...prev, isOpen: false }))}
          results={activeResultViewer.results}
          initialIndex={activeResultViewer.currentIndex}
          patientName={surgeryInfo.full_name || ''}
          visitNumber={surgeryInfo.visit_number || currentVisit?.visit_number || ''}
          theme="doctor"
        />
      )}

      {/* ── Standardized Confirm Delete Modal ───────────────────────── */}
      <ConfirmDeleteModal
        isOpen={confirmDeleteModal.isOpen}
        onClose={() => !isDeleting && setConfirmDeleteModal({ isOpen: false, type: null, id: null, itemName: '', details: null })}
        onConfirm={handleExecuteDelete}
        itemName={confirmDeleteModal.itemName}
        loading={isDeleting}
        title={
          confirmDeleteModal.type === 'material'
            ? 'حذف مادة مستهلكة واسترجاع الرصيد'
            : 'حذف بند تكلفة إضافية'
        }
        subtitle={
          confirmDeleteModal.type === 'material'
            ? 'إلغاء استهلاك المادة وإعادة رصيدها لمخزن العمليات'
            : 'إلغاء التكلفة من الحساب المالي للعملية'
        }
        bodyTitle={
          confirmDeleteModal.type === 'material'
            ? 'تأكيد حذف المادة واسترجاعها للمخزن؟'
            : 'تأكيد حذف بند التكلفة؟'
        }
        bodyDescription={
          confirmDeleteModal.type === 'material' ? (
            <>
              سيتم حذف المادة <span className="text-purple-600 font-black px-1">{confirmDeleteModal.itemName}</span> 
              بكمية <span className="text-slate-800 font-black px-1">{formatArabicQuantity(confirmDeleteModal.details?.qty || 0, confirmDeleteModal.details?.unit)}</span> 
              من سجل استهلاك هذه العملية، وإعادة كامل الكمية فوراً إلى رصيد مخزن العمليات وتوثيق حركة إرجاع رسمية في سجل الحركات المخزنية.
            </>
          ) : (
            <>
              سيتم حذف بند التكلفة <span className="text-purple-600 font-black px-1">{confirmDeleteModal.itemName}</span> 
              بمبلغ <span className="text-slate-800 font-black px-1">{formatYER(confirmDeleteModal.details?.amount || 0)}</span> 
              بشكل نهائي من قائمة مصاريف العملية وتحديث إجمالي التكاليف.
            </>
          )
        }
        confirmLabel={
          confirmDeleteModal.type === 'material' ? 'تأكيد الحذف والاسترجاع' : 'تأكيد حذف التكلفة'
        }
        loadingLabel={
          confirmDeleteModal.type === 'material' ? 'جاري الاسترجاع...' : 'جاري الحذف...'
        }
      />
    </>
  );
}
