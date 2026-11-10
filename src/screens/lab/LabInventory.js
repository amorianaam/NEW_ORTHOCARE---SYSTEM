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
  FlaskConical
} from 'lucide-react';
import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';
import { getSocket, joinRoom } from '../../utils/socket';
import { LabPatientDetailPanel } from '../../components/lab/LabModals';
import BatchDetailsModal from '../../components/storeCommon/BatchDetailsModal';
import { InventoryWastageModal } from '../../components/storeCommon/ClinicalInventoryModals';
import { getSmartItemText } from '../../utils/arabicFormatters';

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
const formatQty = (val) => {
  const num = parseFloat(val);
  if (isNaN(num)) return '0';
  return Number(num.toFixed(4)).toString();
};

const getCategoryShortLabel = (cat, unit) => {
  if (cat === 'reagent') return 'محلول / كاشف';
  if (cat === 'tube') return 'أنبوبة سحب';
  return unit || 'مستهلك عام';
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

// ── English Date & Time Helpers (Matching Reports & Dashboard Standard) ──────
const formatDateEn = (isoStr) => {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return String(isoStr);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
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

export default function LabInventory() {
  const { token } = useAuthStore();

  // Active Tab
  const [activeTab, setActiveTab] = useState('stock'); // 'stock' | 'transfers' | 'audit_log'

  // Data States
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({
    totalItems: 0,
    lowStockCount: 0,
    negativeStockCount: 0,
    expiringSoonCount: 0,
    pendingTransfersCount: 0
  });
  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [transfersHistory, setTransfersHistory] = useState([]);
  const [consumptionLogs, setConsumptionLogs] = useState([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [consumablesByTest, setConsumablesByTest] = useState({});

  // Loadings
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [loadingTransfersHistory, setLoadingTransfersHistory] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [processingBatch, setProcessingBatch] = useState(null);

  // Batch Details Modal States (Matching General Store Receive.js)
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedHistoryBatch, setSelectedHistoryBatch] = useState(null);
  const [rejectingBatch, setRejectingBatch] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Filters for Stock Tab
  const [stockSearch, setStockSearch] = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState('all'); // 'all' | 'normal' | 'low' | 'expiring_soon' | 'negative'

  // Filters for Transfers History Section
  const [transferSearch, setTransferSearch] = useState('');
  const [transferStatusFilter, setTransferStatusFilter] = useState('all'); // 'all' | 'received' | 'rejected'
  const [showTransferStatusMenu, setShowTransferStatusMenu] = useState(false);
  const [transferDateFilter, setTransferDateFilter] = useState('all'); // 'all' | 'today' | 'week' | 'month' | 'custom'
  const [transferCustomRange, setTransferCustomRange] = useState({ start: '', end: '' });
  const [transferHistoryPage, setTransferHistoryPage] = useState(1);

  // Filters for Consumption Log Tab
  const [logSearch, setLogSearch] = useState('');
  const [logTriggerFilter, setLogTriggerFilter] = useState('all');
  const [showTriggerMenu, setShowTriggerMenu] = useState(false);
  const [dateFilter, setDateFilter] = useState('all'); // 'all' | 'today' | 'week' | 'month' | 'custom'
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [logPage, setLogPage] = useState(1);

  // Archive / Report Preview Modal
  const [selectedVisitId, setSelectedVisitId] = useState(null);

  // Modals
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
      const res = await fetch('/api/lab/inventory/items', {
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

  // ── 1b. Fetch BOM Consumables for Wastage by Test ───────────────────────────
  const fetchBomLinks = useCallback(async () => {
    try {
      const res = await fetch('/api/lab/inventory/test-consumables', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        const map = {};
        (data.consumables || []).forEach((c) => {
          if (!map[c.lab_test_id]) {
            map[c.lab_test_id] = {
              id: c.lab_test_id,
              name: c.test_name,
              items: []
            };
          }
          map[c.lab_test_id].items.push(c);
        });
        setConsumablesByTest(map);
      }
    } catch (err) {
      console.error('fetchBomLinks error:', err);
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

  // ── 2b. Fetch Incoming Transfers History (Received & Rejected) ─────────────
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

  // ── 3. Fetch Consumption Log with Temporal Filters ──────────────────────────
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

      queryParams.append('limit', '50000');
      queryParams.append('offset', '0');

      const res = await fetch(`/api/lab/inventory/consumption-log?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setConsumptionLogs(data.logs || data.data || []);
        setTotalLogs(data.total || 0);
      }
    } catch (err) {
      console.error('fetchConsumptionLogs error:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [token, logTriggerFilter, logSearch, dateFilter, customRange]);

  // Initial Data Fetch
  useEffect(() => {
    fetchInventory();
    fetchPendingTransfers();
    fetchBomLinks();
  }, [fetchInventory, fetchPendingTransfers, fetchBomLinks]);

  useEffect(() => {
    if (activeTab === 'transfers') {
      fetchTransfersHistory();
    } else if (activeTab === 'audit_log') {
      fetchConsumptionLogs();
    }
  }, [activeTab, fetchTransfersHistory, fetchConsumptionLogs]);

  // Socket Realtime Synchronization
  useEffect(() => {
    joinRoom('lab');
    const socket = getSocket();
    if (!socket) return;

    const handleInventoryUpdated = () => {
      fetchInventory();
      fetchPendingTransfers();
      fetchBomLinks();
      if (activeTab === 'transfers') fetchTransfersHistory();
      if (activeTab === 'audit_log') fetchConsumptionLogs();
    };

    const handleTransferSent = (data) => {
      fetchPendingTransfers();
      fetchInventory();
      if (activeTab === 'transfers') fetchTransfersHistory();
    };

    const handleTransferRevoked = (data) => {
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
  }, [fetchInventory, fetchPendingTransfers, fetchTransfersHistory, fetchConsumptionLogs, fetchBomLinks, activeTab]);

  // Action: Accept / Receive Batch
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

  // Action: Confirm Reject Batch (via BatchDetailsModal)
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

  // Action: Open Wastage Modal
  const handleOpenWastage = (preselectedItemId = '') => {
    setShowWastageItemMenu(false);
    setShowWastageReasonMenu(false);
    setWastageForm({
      wastage_mode: 'item',
      item_id: preselectedItemId || (items[0]?.id || ''),
      lab_test_id: '',
      quantity: '',
      reason: WASTAGE_REASONS[0],
      notes: ''
    });
    setIsWastageModalOpen(true);
  };

  // Action: Submit Wastage
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

  // Filtered Items for Stock Tab
  const filteredItems = useMemo(() => {
    const qStr = stockSearch.trim().toLowerCase();
    return items.filter((it) => {
      const itemName = String(it.name || '').toLowerCase();
      const itemUnit = String(it.unit || '').toLowerCase();
      const itemTypeLabel = getCategoryShortLabel(it.category, it.unit).toLowerCase();

      const matchSearch =
        qStr === '' ||
        itemName.includes(qStr) ||
        itemUnit.includes(qStr) ||
        itemTypeLabel.includes(qStr);

      const q = parseFloat(it.quantity) || 0;
      const min = parseFloat(it.min_quantity) || 0;
      const expiryInfo = getExpiryInfo(it.expiry_date);

      let matchStatus = true;
      if (stockStatusFilter === 'negative') {
        matchStatus = q < 0;
      } else if (stockStatusFilter === 'low') {
        matchStatus = q >= 0 && q <= min;
      } else if (stockStatusFilter === 'normal') {
        matchStatus = q > min && !expiryInfo.isExpired && !expiryInfo.isExpiringSoon;
      } else if (stockStatusFilter === 'expiring_soon') {
        matchStatus = expiryInfo.isExpired || expiryInfo.isExpiringSoon;
      }

      return matchSearch && matchStatus;
    });
  }, [items, stockSearch, stockStatusFilter]);

  // Filtered & Paginated Transfers History
  const filteredTransfersHistory = useMemo(() => {
    const qStr = transferSearch.trim().toLowerCase();
    if (!qStr) return transfersHistory;

    return transfersHistory.filter((batch) => {
      const sender = formatSenderName(batch).toLowerCase();
      if (sender.includes(qStr)) return true;

      return (batch.items || []).some((it) => {
        const name = String(it.item_name || it.name || '').toLowerCase();
        const unit = String(it.unit || it.item_unit || '').toLowerCase();
        const typeLabel = getCategoryShortLabel(it.category, it.unit || it.item_unit).toLowerCase();

        return name.includes(qStr) || unit.includes(qStr) || typeLabel.includes(qStr);
      });
    });
  }, [transfersHistory, transferSearch]);

  // Live count of items that are near expiry (<= 90 days) or already expired
  const expiringOrExpiredCount = useMemo(() => {
    if (!items || items.length === 0) return stats.expiringSoonCount || 0;
    return items.filter((it) => {
      const info = getExpiryInfo(it.expiry_date);
      return info.isExpired || info.isExpiringSoon;
    }).length;
  }, [items, stats.expiringSoonCount]);

  // Live count of items that are normal/safe (above min_quantity and not expired/expiring soon)
  const safeNormalItemsCount = useMemo(() => {
    return items.filter((it) => {
      const q = parseFloat(it.quantity) || 0;
      const min = parseFloat(it.min_quantity) || 0;
      const info = getExpiryInfo(it.expiry_date);
      return q > min && !info.isExpired && !info.isExpiringSoon;
    }).length;
  }, [items]);

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
      const itemTypeLabel = getCategoryShortLabel(log.category, log.resolved_unit || log.item_unit).toLowerCase();
      const labTestName = String(log.service_name || '').toLowerCase();
      const movementType = log.trigger_type === 'wastage' ? 'إتلاف اتلاف' : 'استهلاك';

      return (
        itemName.includes(qStr) ||
        itemUnit.includes(qStr) ||
        itemTypeLabel.includes(qStr) ||
        labTestName.includes(qStr) ||
        movementType.includes(qStr)
      );
    });
  }, [consumptionLogs, logSearch]);

  const isTabLoading =
    (activeTab === 'stock' && loadingItems) ||
    (activeTab === 'transfers' && loadingTransfersHistory) ||
    (activeTab === 'audit_log' && loadingLogs);

  // Contextual Quick Stats Cards (Per Tab — Strictly Operational & Non-Financial, with Auto-Hiding Zero Alert Cards)
  const statsCards = useMemo(() => {
    let cards = [];
    switch (activeTab) {
      case 'transfers': {
        const receivedBatches = filteredTransfersHistory.filter((b) => b.status !== 'rejected');
        const rejectedBatches = filteredTransfersHistory.filter((b) => b.status === 'rejected');
        const receivedTotalUnits = receivedBatches.reduce(
          (sum, b) => sum + (parseFloat(b.total_quantity) || 0),
          0
        );

        cards = [
          {
            id: 'tr_pending',
            label: 'شحنات معلقة بانتظار الاستلام',
            rawValue: pendingTransfers.length,
            value: pendingTransfers.length,
            unit: 'شحنة',
            sub:
              pendingTransfers.length > 0
                ? 'دفعات محولة من المخازن بانتظار المراجعة والتأكيد'
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
            id: 'tr_received_count',
            label: 'الشحنات المستلمة المؤكدة',
            rawValue: receivedBatches.length,
            value: receivedBatches.length,
            unit: 'شحنة',
            sub: 'دفعات تم فحصها وإضافتها لرصيد مخزن المختبر',
            icon: Check,
            color: 'text-purple-600',
            bg: 'bg-purple-100',
            border: 'border-purple-200',
            onClick: () => setTransferStatusFilter('received')
          },
          {
            id: 'tr_received_units',
            label: 'إجمالي الوحدات المستلمة',
            rawValue: Number(receivedTotalUnits.toFixed(2)),
            value: formatQty(receivedTotalUnits),
            unit: 'وحدة',
            sub: `مجموع الكميات الموردة عبر (${receivedBatches.length}) شحنة مستلمة`,
            icon: Layers,
            color: 'text-indigo-600',
            bg: 'bg-indigo-100',
            border: 'border-indigo-200',
            onClick: () => setTransferStatusFilter('received')
          },
          {
            id: 'tr_rejected',
            label: 'الشحنات المرفوضة والمرجعة',
            rawValue: rejectedBatches.length,
            value: rejectedBatches.length,
            unit: 'شحنة',
            sub:
              rejectedBatches.length > 0
                ? 'دفعات تم رفض استلامها وإعادتها للمخزن المرسل'
                : 'لا توجد شحنات مرفوضة ضمن الفترة المحددة',
            icon: ShieldAlert,
            color: 'text-rose-600',
            bg: 'bg-rose-100',
            border: 'border-rose-200',
            onClick: () => setTransferStatusFilter('rejected')
          }
        ];
        break;
      }

      case 'audit_log': {
        const consumptionLogsList = filteredConsumptionLogs.filter(
          (l) => l.trigger_type === 'procedure_consumption'
        );
        const wastageLogsList = filteredConsumptionLogs.filter(
          (l) => l.trigger_type === 'wastage'
        );
        const consumptionUnits = consumptionLogsList.reduce(
          (s, l) => s + Math.abs(parseFloat(l.qty_deducted) || 0),
          0
        );
        const wastageUnits = wastageLogsList.reduce(
          (s, l) => s + Math.abs(parseFloat(l.qty_deducted) || 0),
          0
        );
        const totalUnits = consumptionUnits + wastageUnits;
        const wastageRatio =
          totalUnits > 0 ? Number(((wastageUnits / totalUnits) * 100).toFixed(1)) : 0;

        cards = [
          {
            id: 'log_total',
            label: 'إجمالي حركات السجل',
            rawValue: filteredConsumptionLogs.length,
            value: filteredConsumptionLogs.length,
            unit: 'حركة',
            sub: 'مجموع عمليات السحب التلقائي وإتلاف المستهلكات',
            icon: FileText,
            color: 'text-indigo-600',
            bg: 'bg-indigo-100',
            border: 'border-indigo-200',
            onClick: () => setLogTriggerFilter('all')
          },
          {
            id: 'log_consumption',
            label: 'حركات الاستهلاك الفعلي',
            rawValue: consumptionLogsList.length,
            value: consumptionLogsList.length,
            unit: 'حركة',
            sub: `إجمالي الكميات المستهلكة للتحاليل: ${formatQty(consumptionUnits)} وحدة`,
            icon: ArrowUpRight,
            color: 'text-purple-600',
            bg: 'bg-purple-100',
            border: 'border-purple-200',
            onClick: () => setLogTriggerFilter('procedure_consumption')
          },
          {
            id: 'log_wastage',
            label: 'حركات الهدر والتوالف',
            rawValue: wastageLogsList.length,
            value: wastageLogsList.length,
            unit: 'حركة',
            sub: `إجمالي الكميات التالفة المسجلة: ${formatQty(wastageUnits)} وحدة`,
            icon: Trash2,
            color: 'text-rose-600',
            bg: 'bg-rose-100',
            border:
              wastageLogsList.length > 0
                ? 'border-rose-300 ring-2 ring-rose-300/30'
                : 'border-rose-200',
            onClick: () => setLogTriggerFilter('wastage')
          },
          {
            id: 'log_wastage_ratio',
            label: 'نسبة الهدر التشغيلي',
            rawValue: wastageUnits > 0 ? wastageRatio : 0,
            value: `${wastageRatio}%`,
            unit: '',
            sub: `نسبة التوالف من إجمالي (${formatQty(totalUnits)}) وحدة منصرفة`,
            icon: Activity,
            color: wastageRatio > 10 ? 'text-rose-600' : 'text-emerald-600',
            bg: wastageRatio > 10 ? 'bg-rose-100' : 'bg-emerald-100',
            border: wastageRatio > 10 ? 'border-rose-200' : 'border-emerald-200',
            onClick: () => setLogTriggerFilter('all')
          }
        ];
        break;
      }

      case 'stock':
      default: {
        cards = [
          {
            id: 'total',
            label: 'إجمالي أصناف القسم',
            rawValue: Number(stats.totalItems || 0),
            value: stats.totalItems,
            unit: 'صنف',
            sub: 'الأصناف والمستهلكات المعرّفة في مخزن المختبر',
            icon: Package,
            color: 'text-purple-600',
            bg: 'bg-purple-100',
            border: 'border-purple-200',
            onClick: () => {
              setActiveTab('stock');
              setStockStatusFilter('all');
            }
          },
          {
            id: 'normal',
            label: 'أصناف متوفرة وآمنة',
            rawValue: Number(safeNormalItemsCount || 0),
            value: safeNormalItemsCount,
            unit: 'صنف',
            sub: 'أرصدة كافية فوق الحد الأدنى وسارية الصلاحية',
            icon: Check,
            color: 'text-emerald-600',
            bg: 'bg-emerald-100',
            border: 'border-emerald-200',
            onClick: () => {
              setActiveTab('stock');
              setStockStatusFilter('normal');
            }
          }
        ];

        if ((stats.pendingTransfersCount || 0) > 0) {
          cards.push({
            id: 'pending',
            label: 'شحنات بانتظار الاستلام',
            rawValue: Number(stats.pendingTransfersCount || 0),
            value: stats.pendingTransfersCount,
            unit: 'شحنة',
            sub: 'دفعات محولة من المخازن بانتظار المراجعة والتأكيد',
            icon: ArrowDownRight,
            color: 'text-indigo-600',
            bg: 'bg-indigo-100',
            border: 'border-indigo-300 ring-2 ring-indigo-300/40',
            onClick: () => setActiveTab('transfers')
          });
        }

        if ((stats.lowStockCount || 0) > 0) {
          cards.push({
            id: 'low',
            label: 'أصناف منخفضة الرصيد',
            rawValue: Number(stats.lowStockCount || 0),
            value: stats.lowStockCount,
            unit: 'صنف',
            sub: 'بلغت الحد الأدنى وتتطلب إعادة التزويد',
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
          cards.push({
            id: 'expiring',
            label: 'قريبة الانتهاء أو منتهية',
            rawValue: Number(expiringOrExpiredCount || 0),
            value: expiringOrExpiredCount,
            unit: 'صنف',
            sub: 'أصناف منتهية الصلاحية أو أوشكت على الانتهاء',
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
          cards.push({
            id: 'negative',
            label: 'عجز المخزون (رصيد سالب)',
            rawValue: Number(stats.negativeStockCount || 0),
            value: stats.negativeStockCount,
            unit: 'صنف',
            sub: 'تم السحب منها للطوارئ وتتطلب تغذية عاجلة',
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
        break;
      }
    }

    return cards.filter((s) => isTabLoading || s.rawValue > 0);
  }, [
    activeTab,
    stats,
    expiringOrExpiredCount,
    safeNormalItemsCount,
    pendingTransfers,
    filteredTransfersHistory,
    filteredConsumptionLogs,
    isTabLoading
  ]);

  // Main Tabs Configuration
  const TABS = useMemo(
    () => [
      {
        id: 'stock',
        label: 'الأرصدة والمخزون الحالي',
        icon: Package,
        badgeCount: items.length
      },
      {
        id: 'transfers',
        label: 'الشحنات الواردة',
        icon: ArrowDownRight,
        badgeCount: stats.pendingTransfersCount
      },
      {
        id: 'audit_log',
        label: 'سجل الاستهلاك',
        icon: FileText
      }
    ],
    [items.length, stats.pendingTransfersCount]
  );

  const statsGridColsClass =
    statsCards.length === 1
      ? 'grid-cols-1 sm:max-w-[340px]'
      : statsCards.length === 2
      ? 'grid-cols-1 sm:grid-cols-2 sm:max-w-[694px]'
      : statsCards.length === 3
      ? 'grid-cols-1 sm:grid-cols-3'
      : statsCards.length === 4
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      : statsCards.length === 5
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6';

  return (
    <div className="space-y-6 w-full p-6" dir="rtl">
      {/* ── 1. Page Header Banner (Matching RadiologyInventory.js 100%) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 flex-shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-800 text-white flex items-center justify-center shadow-md shadow-purple-500/20">
            <Package size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800">مخزن ومستهلكات قسم المختبر</h1>
            <p className="text-sm font-bold text-gray-500 mt-0.5">
              متابعة أرصدة المحاليل والأنابيب، تأكيد استلام الشحنات المحولة، وسجل الاستهلاك والتلفيات
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleOpenWastage()}
            className="bg-white hover:bg-rose-50 border border-slate-200/90 text-rose-700 flex items-center gap-2 text-xs md:text-sm font-bold py-2.5 px-4 shadow-xs rounded-2xl transition-all hover:border-rose-300 active:scale-95 group cursor-pointer"
          >
            <Trash2 size={16} className="text-rose-600 group-hover:scale-110 transition-transform" />
            <span>تسجيل هدر / إتلاف</span>
          </button>
        </div>
      </div>

      {/* ── 2. Quick Stats Grid (Dynamic Contextual Non-Financial Cards) ──────── */}
      {statsCards.length > 0 && (
        <div className={`grid ${statsGridColsClass} gap-3.5 w-full flex-shrink-0`}>
          {statsCards.map((s, i) => (
            <div
              key={s.id || i}
              onClick={s.onClick}
              className={`p-4 rounded-2xl border ${s.border} bg-white shadow-2xs hover:shadow-xs transition-all duration-200 relative overflow-hidden flex flex-col justify-between isolate group cursor-pointer`}
            >
              <div
                className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${s.bg} to-transparent opacity-50 rounded-bl-full z-[-1] transition-transform duration-500 group-hover:scale-110`}
              />
              <div className="flex justify-between items-start mb-3">
                <div
                  className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center shadow-2xs transition-transform group-hover:scale-105`}
                >
                  <s.icon size={16} className={s.color} />
                </div>
                <span className={`text-xs font-bold ${s.color}`}>
                  {s.label}
                </span>
              </div>
              <div>
                {isTabLoading ? (
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
      )}

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
                توجد أصناف برصيد سالب نتيجة استمرار إجراء الفحوصات للمرضى بدون انقطاع — يرجى طلب شحنة جديدة من المخزن العام أو تأكيد الشحنات الواردة لإعادة موازنة الرصيد.
              </p>
            </div>
          </div>
          {stats.pendingTransfersCount > 0 && (
            <button
              onClick={() => setActiveTab('transfers')}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shrink-0 shadow-sm cursor-pointer"
            >
              عرض الشحنات الواردة
            </button>
          )}
        </div>
      )}

      {/* ── 3. Centered Workspace Tab Selector ────────────────────────────────── */}
      <div className="flex justify-center w-full">
        <div className="flex p-1.5 gap-2 bg-gray-100/90 backdrop-blur-md rounded-2xl border border-gray-200/80 max-w-3xl w-full shadow-xs overflow-x-auto no-scrollbar">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs md:text-sm font-black transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-white text-purple-700 shadow-sm border border-gray-100 border-b-purple-600'
                    : 'text-gray-500 hover:bg-white/50 hover:text-gray-700 border-transparent'
                }`}
              >
                <tab.icon size={15} />
                <span>{tab.label}</span>
                {typeof tab.badgeCount === 'number' && tab.badgeCount > 0 && (
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
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

      {/* ── TAB 1: CURRENT STOCK & BALANCES ───────────────────────────────────── */}
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
                  placeholder="بحث باسم الصنف أو نوع الصنف (الوحدة)..."
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
                    { id: 'negative', label: 'رصيد سالب (عجز)' }
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

          {/* Table Container: 100% Proportional Layout (5% + 34% + 16% + 15% + 14% + 16% = 100%) */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-right text-sm table-fixed whitespace-nowrap">
                <colgroup>
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '34%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '16%' }} />
                </colgroup>
                <thead className="bg-gradient-to-r from-slate-50/90 via-purple-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                  <tr>
                    <th className="w-[5%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                    <th className="w-[34%] px-4 py-4 text-right font-black text-xs text-slate-600">الصنف</th>
                    <th className="w-[16%] px-4 py-4 text-right font-black text-xs text-slate-600">نوع الصنف</th>
                    <th className="w-[15%] px-4 py-4 text-right font-black text-xs text-slate-600">الكمية الحالية</th>
                    <th className="w-[14%] px-4 py-4 text-right font-black text-xs text-slate-600">الحد الأدنى</th>
                    <th className="w-[16%] px-4 py-4 text-right font-black text-xs text-slate-600">تاريخ الانتهاء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/70 bg-white">
                  {loadingItems ? (
                    <tr>
                      <td colSpan="6" className="py-12 text-center text-slate-400 font-bold">
                        <RefreshCcw className="w-6 h-6 animate-spin mx-auto text-purple-500 mb-2" />
                        <span>جاري تحميل أصناف المخزون...</span>
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-12 text-center text-slate-400 font-bold">
                        <Package className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <span>لا توجد أصناف مطابقة للبحث أو الفلتر</span>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, index) => {
                      const q = parseFloat(item.quantity) || 0;
                      const min = parseFloat(item.min_quantity) || 0;
                      const isNegative = q < 0;
                      const isLow = !isNegative && q <= min;
                      const expiryInfo = getExpiryInfo(item.expiry_date);

                      return (
                        <tr key={item.id} className="hover:bg-purple-50/30 transition-colors border-b border-slate-100/70 last:border-0">
                          {/* 1. الترقيم (5%) */}
                          <td className="w-[5%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                            {index + 1}
                          </td>

                          {/* 2. الصنف (34%) */}
                          <td className="w-[34%] px-4 py-4 text-right">
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

                          {/* 3. نوع الصنف (16%) */}
                          <td className="w-[16%] px-4 py-4 text-right">
                            <span className="text-xs font-bold text-slate-600">
                              {getCategoryShortLabel(item.category, item.unit)}
                            </span>
                          </td>

                          {/* 4. الكمية الحالية (15%) */}
                          <td className="w-[15%] px-4 py-4 text-right">
                            <div className="flex items-baseline gap-1.5 justify-start">
                              <span
                                className={`text-base font-black ${
                                  isNegative
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

                          {/* 5. الحد الأدنى (14%) */}
                          <td className="w-[14%] px-4 py-4 text-right">
                            <div className="flex items-baseline gap-1 justify-start">
                              <span className="text-sm font-bold text-slate-700" dir="ltr">
                                {formatQty(min)}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-400">
                                {item.unit || ''}
                              </span>
                            </div>
                          </td>

                          {/* 6. تاريخ الانتهاء (16%) — date on top, borderless colored status text below */}
                          <td className="w-[16%] px-4 py-4 text-right">
                            <div className="flex flex-col gap-0.5 items-start">
                              <span
                                dir="ltr"
                                className={`text-xs font-bold whitespace-nowrap ${
                                  expiryInfo.isExpired
                                    ? 'text-red-600'
                                    : expiryInfo.isExpiringSoon
                                    ? 'text-orange-600'
                                    : 'text-slate-700'
                                }`}
                              >
                                {item.expiry_date ? formatDateEn(item.expiry_date) : '—'}
                              </span>
                              {expiryInfo.isExpired ? (
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

      {/* ── TAB 2: INCOMING TRANSFERS ─────────────────────────────────────────── */}
      {activeTab === 'transfers' && (
        <div className="space-y-4">
          {/* 1. PENDING INCOMING TRANSFERS SECTION */}
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
                    <p className="text-xs font-bold text-slate-500 mt-1">يجب مراجعة الدفعات الواردة وقبولها أو رفضها</p>
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
                <table className="w-full text-right">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-5 py-3 text-xs font-black text-slate-500">المصدر\المرسل</th>
                      <th className="px-5 py-3 text-xs font-black text-slate-500">الصنف</th>
                      <th className="px-5 py-3 text-xs font-black text-slate-500">الكمية</th>
                      <th className="px-5 py-3 text-xs font-black text-slate-500">تاريخ الإرسال</th>
                      <th className="px-5 py-3 text-xs font-black text-slate-500 text-left">الإجراءات</th>
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
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center gap-2 font-bold text-slate-700 text-sm">
                              <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                              <span>{formatSenderName(batch)}</span>
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className="font-bold text-slate-700 text-sm">
                              {getSmartItemText(batch.item_count || batch.items?.length || 0, batch.items?.[0]?.item_name || batch.items?.[0]?.name)}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className="font-bold text-slate-700 text-sm" dir="ltr">
                              +{parseFloat(pendingTotalQty).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="font-bold text-slate-700 text-sm">
                              {new Date(batch.sent_at).toLocaleDateString('en-GB')}
                            </div>
                            <div className="text-xs text-slate-400 font-semibold mt-0.5" dir="ltr">
                              {new Date(batch.sent_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-left">
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

          {/* 2. INCOMING TRANSFERS HISTORY FILTER TOOLBAR */}
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
                  placeholder="بحث باسم الصنف، نوع الصنف (الوحدة)، أو المصدر/المرسل..."
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
                            {transferStatusFilter === f.id && (
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

          {/* 3. INCOMING TRANSFERS HISTORY TABLE */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-sm whitespace-nowrap table-fixed">
                <thead className="bg-gradient-to-r from-slate-50/90 via-purple-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                  <tr>
                    <th className="w-[5%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                    <th className="w-[25%] px-4 py-4 text-right font-black text-xs text-slate-600">الصنف</th>
                    <th className="w-[12%] px-4 py-4 text-right font-black text-xs text-slate-600">نوع الصنف</th>
                    <th className="w-[10%] px-4 py-4 text-right font-black text-xs text-slate-600">الكمية</th>
                    <th className="w-[16%] px-4 py-4 text-right font-black text-xs text-slate-600">المصدر\المرسل</th>
                    <th className="w-[12%] px-4 py-4 text-right font-black text-xs text-slate-600">نوع الحركة</th>
                    <th className="w-[12%] px-4 py-4 text-right font-black text-xs text-slate-600">التاريخ</th>
                    <th className="w-[8%] px-3 py-4 text-center font-black text-xs text-slate-600">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/70 bg-white">
                  {loadingTransfersHistory && filteredTransfersHistory.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-12 text-center text-slate-400 font-bold">
                        <RefreshCcw className="w-6 h-6 animate-spin mx-auto text-purple-500 mb-2" />
                        <span>جاري تحميل سجل الشحنات الواردة...</span>
                      </td>
                    </tr>
                  ) : filteredTransfersHistory.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-12 text-center text-slate-400 font-bold">
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
                        <tr key={batch.batch_ref_key || batch.batch_ref} className="hover:bg-purple-50/30 transition-colors border-b border-slate-100/70 last:border-0">
                          {/* 1. الترقيم (5%) */}
                          <td className="w-[5%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                            {rowNumber}
                          </td>

                          {/* 2. الصنف / المحتوى (25%) */}
                          <td className="w-[25%] px-4 py-4 font-black text-slate-800 truncate" title={firstItem.item_name}>
                            {batch.item_count > 1 ? (
                              <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg text-xs font-black">
                                <Layers size={12} /> {getSmartItemText(batch.item_count, firstItem.item_name)}
                              </span>
                            ) : (
                              firstItem.item_name || '—'
                            )}
                          </td>

                          {/* 3. نوع الصنف (12%) */}
                          <td className="w-[12%] px-4 py-4 text-slate-600 font-bold text-xs">
                            {batch.item_count > 1
                              ? '-'
                              : getCategoryShortLabel(firstItem.category, firstItem.unit)}
                          </td>

                          {/* 4. الكمية (10%) */}
                          <td className="w-[10%] px-4 py-4 text-right">
                            <span
                              dir="ltr"
                              className={`font-black text-sm ${
                                isRejected ? 'text-rose-500 line-through opacity-75' : 'text-emerald-600'
                              }`}
                            >
                              +{parseFloat(batch.total_quantity || 0).toLocaleString()}
                            </span>
                          </td>

                          {/* 5. المصدر\المرسل (16%) */}
                          <td className="w-[16%] px-4 py-4 text-slate-700 font-bold text-sm truncate" title={cleanSender}>
                            {cleanSender}
                          </td>

                          {/* 6. نوع الحركة / الحالة (12%) */}
                          <td className="w-[12%] px-4 py-4">
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

                          {/* 7. التاريخ (12%) */}
                          <td className="w-[12%] px-4 py-4 text-right">
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

                          {/* 8. الإجراءات (8%) */}
                          <td className="w-[8%] px-3 py-4 text-center">
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

      {/* ── TAB 3: CONSUMPTION & WASTAGE LOG ──────────────────────────────────── */}
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
                  placeholder="بحث باسم الصنف، نوع الصنف، التحليل، أو نوع الحركة..."
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
                            {logTriggerFilter === f.id && (
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
                تم العثور على <span className="text-purple-700 font-black">{filteredConsumptionLogs.length}</span> من السجلات
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

          {/* Consumption Log Table: 100% Smart Proportional Layout (5% / 12% / 21% / 10% / 26% / 15% / 11%) */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-sm whitespace-nowrap table-fixed">
                <colgroup>
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '21%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '26%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '11%' }} />
                </colgroup>
                <thead className="bg-gradient-to-r from-slate-50/90 via-purple-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                  <tr>
                    <th style={{ width: '5%' }} className="w-[5%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                    <th style={{ width: '12%' }} className="w-[12%] px-3 py-4 text-center font-black text-xs text-slate-600">نوع الحركة</th>
                    <th style={{ width: '21%' }} className="w-[21%] px-4 py-4 text-right font-black text-xs text-slate-600">الصنف</th>
                    <th style={{ width: '10%' }} className="w-[10%] px-3 py-4 text-center font-black text-xs text-slate-600">الكمية</th>
                    <th style={{ width: '26%' }} className="w-[26%] px-4 py-4 text-right font-black text-xs text-slate-600">التحليل</th>
                    <th style={{ width: '15%' }} className="w-[15%] px-4 py-4 text-right font-black text-xs text-slate-600">وقت التنفيذ</th>
                    <th style={{ width: '11%' }} className="w-[11%] px-3 py-4 text-center font-black text-xs text-slate-600">معاينة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/70 bg-white">
                  {loadingLogs ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-slate-400 font-bold">
                        <RefreshCcw className="w-6 h-6 animate-spin mx-auto text-purple-500 mb-2" />
                        <span>جاري تحميل سجل الاستهلاك...</span>
                      </td>
                    </tr>
                  ) : filteredConsumptionLogs.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-slate-400 font-bold">
                        <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <span>لا توجد حركات استهلاك مسجلة ضمن هذه المعايير</span>
                      </td>
                    </tr>
                  ) : (
                    filteredConsumptionLogs.map((log, index) => {
                      const qty = parseFloat(log.qty_deducted) || 0;
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
                          {/* 1. الترقيم (5%) */}
                          <td style={{ width: '5%' }} className="w-[5%] px-3 py-4 text-center font-black text-slate-400 text-xs align-middle">
                            {rowNumber}
                          </td>

                          {/* 2. نوع الحركة (12%) */}
                          <td style={{ width: '12%' }} className="w-[12%] px-3 py-4 text-center whitespace-nowrap align-middle">
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

                          {/* 3. الصنف (21%) */}
                          <td style={{ width: '21%' }} className="w-[21%] px-4 py-4 text-right align-middle">
                            <span className="font-bold text-slate-800 text-sm leading-snug truncate block" title={log.item_name}>
                              {log.item_name}
                            </span>
                          </td>

                          {/* 4. الكمية (10%) */}
                          <td style={{ width: '10%' }} className="w-[10%] px-3 py-4 text-center align-middle">
                            <span dir="ltr" className="inline-block text-sm font-black text-rose-600">
                              {`-${formatQty(Math.abs(qty))}`}
                            </span>
                          </td>

                          {/* 5. التحليل (26%) */}
                          <td style={{ width: '26%' }} className="w-[26%] px-4 py-4 text-right align-middle">
                            {isWastage && wastageInfo ? (
                              <div
                                style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}
                                className="flex flex-col gap-1 min-w-0 text-right whitespace-normal break-words"
                                dir="rtl"
                              >
                                <div className="leading-relaxed">
                                  <span className="text-xs font-black text-rose-600 ml-1.5">
                                    سبب التلف:
                                  </span>
                                  <span className="font-bold text-slate-800 text-sm">
                                    {wastageInfo.reason}
                                  </span>
                                </div>
                                {wastageInfo.note && (
                                  <div className="leading-relaxed">
                                    <span className="text-xs font-black text-rose-600 ml-1.5">
                                      الملاحظة:
                                    </span>
                                    <span className="font-bold text-slate-800 text-sm">
                                      {wastageInfo.note}
                                    </span>
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
                                    <span
                                      className="font-bold text-slate-800 text-sm leading-snug truncate"
                                      title={s.name}
                                    >
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

                          {/* 6. وقت التنفيذ (15%) */}
                          <td style={{ width: '15%' }} className="w-[15%] px-4 py-4 text-right align-middle">
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

                          {/* 7. معاينة (11%) */}
                          <td style={{ width: '11%' }} className="w-[11%] px-3 py-4 text-center align-middle">
                            {log.visit_id ? (
                              <button
                                type="button"
                                onClick={() => setSelectedVisitId(log.visit_id)}
                                className="inline-flex items-center justify-center p-2 text-purple-700 bg-purple-50 hover:bg-purple-600 hover:text-white rounded-xl border border-purple-100 shadow-xs active:scale-95 transition-all cursor-pointer"
                                title="معاينة التقرير"
                              >
                                <Eye size={15} strokeWidth={2.2} />
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

      {/* ── MODAL: REPORT & PATIENT DETAIL PANEL (ARCHIVE PREVIEW) ────────────── */}
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

      {/* ── MODAL: MANUAL WASTAGE / DAMAGE LOGGING ── */}
      <InventoryWastageModal
        isOpen={isWastageModalOpen}
        onClose={() => setIsWastageModalOpen(false)}
        storeType="lab"
        activeItemsList={items}
        wastageForm={wastageForm}
        setWastageForm={setWastageForm}
        wastageReasons={WASTAGE_REASONS}
        submitting={submittingWastage}
        onSubmit={handleSubmitWastage}
      />

      {/* ── MODAL: PENDING INCOMING BATCH DETAILS (ACCEPT / REJECT) ────────────── */}
      <BatchDetailsModal
        mode="inbound"
        themeColor="emerald"
        hideFinancials={true}
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

      {/* ── MODAL: HISTORICAL INCOMING BATCH DETAILS (READ-ONLY) ───────────────── */}
      <BatchDetailsModal
        mode="inbound"
        themeColor="emerald"
        hideFinancials={true}
        readOnly={true}
        isOpen={!!selectedHistoryBatch}
        onClose={() => setSelectedHistoryBatch(null)}
        batch={selectedHistoryBatch}
      />
    </div>
  );
}
