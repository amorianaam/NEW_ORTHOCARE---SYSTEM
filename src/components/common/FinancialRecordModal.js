import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Printer, Maximize2, Minimize2, X, History, ArrowUpRight, ArrowDownLeft, FileText, User, Phone, Hash, Layers, Calendar, Scissors, Clock, CheckCircle2, XCircle, AlertCircle, Crown, RotateCcw, Wallet, CreditCard, ChevronDown, FlaskConical, Radiation, Stethoscope, Sparkles, FolderOpen } from 'lucide-react';
import { createPortal } from 'react-dom';
import UnifiedTimelineNavigator from './UnifiedTimelineNavigator';
import taffyot from '../../utils/taffyot';
import useAuthStore from '../../store/useAuthStore';
import InvoicePrintModal from '../cashier/modals/InvoicePrintModal';

const CATEGORY_MAP = {
  entry_fee: 'رسوم معاينة',
  lab: 'مختبر',
  radiology: 'أشعة',
  clinical: 'خدمة سريرية',
  surgery_payment: 'عملية',
  emergency: 'طوارئ',
  dental: 'أسنان',
  refund: 'استرداد مالي',
  external_lab: 'مختبر',
  external_radiology: 'أشعة',
  external_service: 'خدمة خارجية',
  other: 'أخرى'
};

const STATUS_BADGE = {
  'paid':            { label: 'بانتظار التنفيذ', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  'in_progress':     { label: 'قيد التنفيذ',     color: 'bg-amber-50 text-amber-700 border-amber-200', pulse: true },
  'result_uploaded': { label: 'النتائج جاهزة',   color: 'bg-purple-50 text-purple-700 border-purple-200' },
  'completed':       { label: 'مكتملة',           color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'refunded':        { label: 'مُسترد',           color: 'bg-red-50 text-red-600 border-red-200' },
  'cancelled':       { label: 'ملغاة',            color: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const formatCountUnit = (count, unit) => {
  if (unit === 'مستحق') {
    return count === 1 ? 'مستحق واحد' : count === 2 ? 'مستحقان' : count >= 3 && count <= 10 ? `${count} مستحقات` : `${count} مستحق`;
  }
  if (unit === 'دفعة') {
    return count === 1 ? 'دفعة واحدة' : count === 2 ? 'دفعتان' : count >= 3 && count <= 10 ? `${count} دفعات` : `${count} دفعة`;
  }
  if (unit === 'مسترد') {
    return count === 1 ? 'مسترد واحد' : count === 2 ? 'مستردان' : count >= 3 && count <= 10 ? `${count} مستردات` : `${count} مسترد`;
  }
  if (unit === 'خدمة') {
    return count === 1 ? 'خدمة واحدة' : count === 2 ? 'خدمتان' : count >= 3 && count <= 10 ? `${count} خدمات` : `${count} خدمة`;
  }
  if (unit === 'تحليل') {
    return count === 1 ? 'تحليل واحد' : count === 2 ? 'تحليلان' : count >= 3 && count <= 10 ? `${count} تحاليل` : `${count} تحليل`;
  }
  if (unit === 'فحص') {
    return count === 1 ? 'فحص واحد' : count === 2 ? 'فحصان' : count >= 3 && count <= 10 ? `${count} فحوصات` : `${count} فحص`;
  }
  if (unit === 'عملية') {
    return count === 1 ? 'عملية واحدة' : count === 2 ? 'عمليتان' : count >= 3 && count <= 10 ? `${count} عمليات` : `${count} عملية`;
  }
  return `${count} ${unit}`;
};

const cleanFilmText = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/\s*\(?\s*مع\s*(?:طباعة\s*)?ف[يـ]?لم\s*\)?/g, '')
    .replace(/\s*\(?\s*مع\s*طباعة\s*\)?/g, '')
    .replace(/\s*\(?\s*(?:بلا|بدون)\s*(?:طباعة\s*)?ف[يـ]?لم\s*\)?/g, '')
    .replace(/\s*\(?\s*(?:بلا|بدون)\s*طباعة\s*\)?/g, '')
    .replace(/\s*\(?\s*رقمي\s*\)?/g, '')
    .trim();
};

const parseServiceDescription = (desc, amount) => {
  let text = 'بدون بيان';
  let isFree = parseFloat(amount) === 0;
  let isWithoutFilm = false;
  
  if (desc) {
    // 1. Remove any internal curly brace JSON/metadata
    text = desc.replace(/\{.*?\}/g, '').trim();
    
    // 2. Detect the verbose backend free-service pattern
    // e.g., "تحليل مجاني بواسطة الدكتور (السعر الأصلي: 2000.00) - RBS"
    const freeServiceRegex = /^.+?\(السعر الأصلي:\s*[\d.]+\)\s*-\s*(.+)$/;
    const match = text.match(freeServiceRegex);
    
    if (match && match[1]) {
      text = match[1].trim(); // Extract purely the service name
      isFree = true; // Safety override
    }

    // 3. Detect without film patterns
    if (
      /(?:بلا|بدون)\s*(?:طباعة\s*)?ف[يـ]?لم/.test(text) ||
      /(?:بلا|بدون)\s*طباعة/.test(text) ||
      /رقمي/.test(text)
    ) {
      isWithoutFilm = true;
    }

    // 4. Clean text from film tokens completely
    text = cleanFilmText(text);
  }

  if (text === 'رسم كشف' || text === 'رسم كشف طبي' || text === 'رسوم معاينة (كشف طبي)') {
    text = 'رسوم معاينة';
  }
  
  return {
    serviceName: text || 'عام',
    isFree: isFree,
    isWithoutFilm: isWithoutFilm
  };
};

const parseRefundDetails = (rawDesc, rawReason) => {
  let patientName = '';
  let service = '';
  let reason = '';

  const raw = rawDesc || rawReason || '';
  if (raw) {
    const fullRefundMatch = raw.match(/^استرداد كامل الخدمات\s*:\s*(.+)$/);
    if (fullRefundMatch) {
      return { patientName: '', service: 'كامل خدمات الزيارة', reason: rawReason || fullRefundMatch[1].trim() };
    }

    const cancelRefundMatch = raw.match(/^استرداد\s*:\s*(.+)$/);
    if (cancelRefundMatch && !raw.includes('استرداد للمريض')) {
      return { patientName: '', service: 'إلغاء زيارة', reason: rawReason || cancelRefundMatch[1].trim() };
    }

    const segments = raw.split(/\s+(?:-|—)\s+/);
    const leftover = [];

    segments.forEach((seg) => {
      const s = seg.trim();
      if (!s) return;

      const patientMatch = s.match(/^استرداد للمريض\s*:\s*(.+)$/);
      if (patientMatch) {
        if (!patientName) patientName = patientMatch[1].trim();
        return;
      }

      const serviceMatch = s.match(/^(?:الخدمة|خدمة)\s*:\s*(.+)$/);
      if (serviceMatch) {
        service = serviceMatch[1].trim();
        return;
      }

      const reasonMatch = s.match(/^(?:الملاحظات|ملاحظات|السبب|سبب الاسترداد|سبب)\s*:\s*(.+)$/);
      if (reasonMatch) {
        reason = reasonMatch[1].trim();
        return;
      }

      const genRefundMatch = s.match(/^استرداد مالي عام\s*:\s*(.+)$/);
      if (genRefundMatch) {
        reason = genRefundMatch[1].trim();
        return;
      }

      leftover.push(s);
    });

    if (!reason && leftover.length > 0) {
      reason = leftover.join(' — ').replace(/^استرداد للمريض\s*:\s*[^-—]+/, '').trim();
    }
  }

  if (!reason && rawReason) {
    const cleanRef = String(rawReason)
      .replace(/^استرداد للمريض\s*:\s*[^-—]+(?:\s*[-—]\s*)?/, '')
      .replace(/^(?:الخدمة|خدمة)\s*:\s*[^-—]+(?:\s*[-—]\s*)?/, '')
      .replace(/^استرداد مالي عام\s*:\s*/, '')
      .replace(/^(?:الملاحظات|ملاحظات|السبب|سبب الاسترداد|سبب)\s*:\s*/, '')
      .trim();
    if (cleanRef) {
      reason = cleanRef;
    }
  }

  if (reason) {
    reason = reason
      .replace(/^استرداد للمريض\s*:\s*[^-—]+(?:\s*[-—]\s*)?/, '')
      .replace(/^(?:الخدمة|خدمة)\s*:\s*[^-—]+(?:\s*[-—]\s*)?/, '')
      .replace(/^(?:الملاحظات|ملاحظات|السبب|سبب الاسترداد|سبب)\s*:\s*/, '')
      .trim();
  }

  return { patientName, service, reason };
};

const getCleanRefundReason = (t) => {
  if (!t.is_refund) return '';
  // 1. Direct field priority: check t.refund_reason first
  const directReason = t.refund_reason || t.reason;
  if (directReason && String(directReason).trim() && directReason !== '—' && directReason !== '-') {
    const cleaned = String(directReason)
      .replace(/^استرداد للمريض\s*:\s*[^-—]+(?:\s*[-—]\s*)?/, '')
      .replace(/^(?:الخدمة|خدمة)\s*:\s*[^-—]+(?:\s*[-—]\s*)?/, '')
      .replace(/^استرداد مالي عام\s*:\s*/, '')
      .replace(/^(?:الملاحظات|ملاحظات|السبب|سبب الاسترداد|سبب)\s*:\s*/, '')
      .trim();
    if (cleaned && cleaned !== '—' && cleaned !== '-') {
      return cleaned;
    }
  }

  // 2. Only parse description if it explicitly contains a reason label
  if (t.description && (t.description.includes('السبب:') || t.description.includes('سبب:') || t.description.includes('الملاحظات:'))) {
    const parsed = parseRefundDetails(t.description, t.refund_reason);
    if (parsed.reason) return parsed.reason;
  }

  return '';
};

const getCategoryLabel = (t) => {
  if (t.is_refund) {
    if (t.category === 'lab' || t.category === 'external_lab' || (t.description && t.description.includes('تحليل'))) return 'مختبر';
    if (t.category === 'radiology' || t.category === 'external_radiology' || (t.description && t.description.includes('أشعة'))) return 'أشعة';
    if (t.category === 'clinical' || (t.description && t.description.includes('سريرية'))) return 'خدمة سريرية';
    if (t.category === 'entry_fee') return 'رسوم معاينة';
    if (t.category === 'surgery_payment') return 'عملية';
    return 'استرداد مالي';
  }
  if (t.category === 'external_lab') return 'مختبر';
  if (t.category === 'external_radiology') return 'أشعة';
  return CATEGORY_MAP[t.category] || t.category || 'عام';
};

const renderDepartmentBadge = (categoryKeyOrLabel) => {
  const cat = String(categoryKeyOrLabel || '').trim();
  if (cat === 'lab' || cat === 'مختبر' || cat === 'external_lab') {
    return (
      <span className="inline-block text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-xl">
        مختبر
      </span>
    );
  }
  if (cat === 'radiology' || cat === 'أشعة' || cat === 'اشعة' || cat === 'external_radiology') {
    return (
      <span className="inline-block text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-xl">
        أشعة
      </span>
    );
  }
  if (cat === 'clinical' || cat === 'خدمة سريرية' || cat === 'سريرية' || cat === 'عيادة') {
    return (
      <span className="inline-block text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl">
        سريرية
      </span>
    );
  }
  if (cat === 'entry_fee' || cat === 'رسوم معاينة' || cat === 'معاينة') {
    return (
      <span className="inline-block text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl">
        معاينة
      </span>
    );
  }
  if (cat === 'surgery_payment' || cat === 'عملية' || cat === 'surgery') {
    return (
      <span className="inline-block text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-xl">
        عملية
      </span>
    );
  }
  return (
    <span className="inline-block text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-xl">
      {CATEGORY_MAP[cat] || cat || 'عام'}
    </span>
  );
};

const getServiceName = (t, recordData) => {
  let name = '';
  let isFree = parseFloat(t.amount) === 0;
  let isWithoutFilm = false;

  // 1. Direct explicit resolution: read from t.service_name or t.description via parseServiceDescription
  const rawTarget = (t.service_name && String(t.service_name).trim())
    ? String(t.service_name).trim()
    : (t.description && String(t.description).trim() ? String(t.description).trim() : '');

  if (rawTarget) {
    const parsed = parseServiceDescription(rawTarget, t.amount);
    name = parsed.serviceName;
    if (parsed.isWithoutFilm) isWithoutFilm = true;
    if (parsed.isFree) isFree = true;
  }

  // Detect film status from name if present
  if (name) {
    if (
      /(?:بلا|بدون)\s*(?:طباعة\s*)?ف[يـ]?لم/.test(name) ||
      /(?:بلا|بدون)\s*طباعة/.test(name) ||
      /رقمي/.test(name)
    ) {
      isWithoutFilm = true;
    }
    name = cleanFilmText(name);
  }

  // 2. Special cases: entry_fee
  if (t.category === 'entry_fee' && (!name || name === 'عام' || name === 'بدون بيان')) {
    return { serviceName: 'رسوم معاينة', isFree: false, isWithoutFilm: false };
  }

  // 3. If radiology, verify with_film flag by matching the actual test name (strictly avoiding visit_id spillage)
  if (t.category === 'radiology' || t.category === 'external_radiology' || (t.description && (t.description.includes('أشعة') || t.description.includes('اشعة')))) {
    if (!isWithoutFilm && (recordData?.serviceHistory || recordData?.pendingServices)) {
      const match = [...(recordData?.serviceHistory || []), ...(recordData?.pendingServices || [])].find(s => 
        (s.type === 'radiology' || s.radiology_test_id) && 
        s.name && name && (s.name.includes(name) || name.includes(s.name))
      );
      if (match && (match.with_film === 0 || match.with_film === false || match.withFilm === false)) {
        isWithoutFilm = true;
      }
    }
  }

  if (t.is_refund) {
    // 1. General refund transactions (created from GeneralTransactions or cashier general refund)
    if (
      t.category === 'refund' ||
      (t.description && (t.description.includes('استرداد للمريض') || t.description.includes('الخدمة:')))
    ) {
      const refundInfo = parseRefundDetails(t.description, t.refund_reason);
      if (refundInfo.service) {
        let cleanSrv = refundInfo.service;
        if (
          /(?:بلا|بدون)\s*(?:طباعة\s*)?ف[يـ]?لم/.test(cleanSrv) || 
          /(?:بلا|بدون)\s*طباعة/.test(cleanSrv) || 
          /رقمي/.test(cleanSrv)
        ) {
          isWithoutFilm = true;
        }
        cleanSrv = cleanFilmText(cleanSrv);
        return { serviceName: cleanSrv, isFree: false, isWithoutFilm };
      }
      return { serviceName: 'استرداد مالي عام', isFree: false, isWithoutFilm: false };
    }

    if (name.startsWith('استرداد تحليل') || name.startsWith('استرداد أشعة') || name.startsWith('استرداد خدمة سريرية')) {
      const match = recordData?.serviceHistory?.find(s => 
        s.status === 'refunded' && 
        String(s.visit_id) === String(t.visit_id) && 
        (Math.abs(parseFloat(s.final_price ?? s.price) - parseFloat(t.amount)) < 1)
      );
      if (match && match.name) {
        let cleanSrv = cleanFilmText(match.name);
        if (match.with_film === 0 || match.with_film === false || match.withFilm === false) {
          isWithoutFilm = true;
        }
        return { serviceName: cleanSrv, isFree: false, isWithoutFilm };
      }
      return { 
        serviceName: name.startsWith('استرداد تحليل') ? 'تحليل مخبري' : (name.startsWith('استرداد أشعة') ? 'فحص أشعة' : 'خدمة سريرية'), 
        isFree: false,
        isWithoutFilm: false
      };
    }
  }

  return {
    serviceName: name || 'عام',
    isFree: isFree,
    isWithoutFilm: isWithoutFilm
  };
};

const FinancialRecordModal = ({ recordData, recordLoading, onClose, token: tokenProp, onRefresh, onOpenCheckout, initialVisitId, readOnly = false, hideInvoicePrint = false, onOpenClinicalArchive = null }) => {
  const canShowInvoicePrint = !readOnly && !hideInvoicePrint;
  const { token: authToken } = useAuthStore();
  const token = authToken || tokenProp; // Always use the live store token; fallback to prop
  const [expandedRefundId, setExpandedRefundId] = useState(null); // composite key: `${s.id}_${s.type}`
  const [refundReason, setRefundReason] = useState('');
  const [isRefunding, setIsRefunding] = useState(false);

  const handleItemRefund = async (serviceId, serviceType) => {
    if (!refundReason.trim()) return;
    setIsRefunding(true);
    try {
      await axios.put(`/api/cashier/service-${serviceType}/${serviceId}/refund`, 
        { reason: refundReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('تم استرداد الخدمة بنجاح');
      setExpandedRefundId(null);
      setRefundReason('');
      if (typeof onRefresh === 'function') { onRefresh(); }
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || 'خطأ أثناء الاسترداد');
    } finally {
      setIsRefunding(false);
    }
  };

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [showInvoicePrintModal, setShowInvoicePrintModal] = useState(false);
  const [openSections, setOpenSections] = useState({
    payments: false,
    lab: false,
    radiology: false,
    clinical: false,
    surgeries: false,
    refunds: false,
  });

  const toggleSection = (key) => {
    setOpenSections(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const resolvedTargetVisit = useMemo(() => {
    if (!recordData?.visits || recordData.visits.length === 0) return null;
    if (selectedVisit) {
      const stillExists = recordData.visits.find(v => String(v.id) === String(selectedVisit.id));
      if (stillExists) return stillExists;
    }
    if (initialVisitId) {
      const matchingVisit = recordData.visits.find(v => 
        String(v.id) === String(initialVisitId) || 
        String(v.visit_number) === String(initialVisitId)
      );
      if (matchingVisit) return matchingVisit;
    }
    return recordData.visits[0];
  }, [recordData, initialVisitId, selectedVisit]);

  const activeVisit = selectedVisit || resolvedTargetVisit;

  useEffect(() => {
    if (resolvedTargetVisit && (!selectedVisit || !recordData?.visits?.some(v => String(v.id) === String(selectedVisit.id)))) {
      setSelectedVisit(resolvedTargetVisit);
    }
  }, [resolvedTargetVisit, selectedVisit, recordData]);

  if (!recordData && !recordLoading) return null;

  const isVisitCancelled = activeVisit?.status === 'cancelled' || activeVisit?.visit_status === 'cancelled' || activeVisit?.visit_status === 'financial_cancelled';

  const filteredTransactions = activeVisit 
    ? recordData.transactions.filter(t => {
        if (t.visit_id) {
          return String(t.visit_id) === String(activeVisit.id);
        }
        const tDate = new Date(t.created_at).toLocaleDateString('en-GB');
        const vDate = new Date(activeVisit.created_at).toLocaleDateString('en-GB');
        return tDate === vDate;
      })
    : recordData?.transactions || [];

  const filteredPending = activeVisit
    ? (recordData.pendingServices || []).filter(s => String(s.visit_id) === String(activeVisit.id))
    : recordData?.pendingServices || [];

  const filteredHistory = activeVisit
    ? (recordData.serviceHistory || []).filter(s => String(s.visit_id) === String(activeVisit.id))
    : recordData?.serviceHistory || [];

  const filteredSurgeries = activeVisit
    ? (recordData.surgeries || []).filter(s => String(s.visit_id) === String(activeVisit.id))
    : recordData?.surgeries || [];

  // 1. Separate Active Services from Refunded Services (Refunded and cancelled services excluded from active service history)
  const activeServiceHistory = filteredHistory.filter(s => s.status !== 'refunded' && s.status !== 'cancelled' && !(Boolean(s.is_free) && s.status === 'cancelled'));
  const refundedServices = filteredHistory.filter(s => s.status === 'refunded');

  // 2. Separate Income Payments from Refund Transactions (Exclude free non-monetary entries from payments section)
  const refundTransactions = filteredTransactions.filter(t => Number(t.is_refund) === 1 || t.category === 'refund');
  const paymentTransactions = filteredTransactions.filter(t => {
    if (Number(t.is_refund) === 1 || t.category === 'refund') return false;
    const amount = parseFloat(t.amount || 0);
    if (amount <= 0) return false;
    const parsed = parseServiceDescription(t.description, t.amount);
    if (parsed.isFree) return false;
    return true;
  });

  // 3. Build Unified Refunds List (for dedicated "المستردات" section)
  const refundsList = [];
  const matchedRefundedServiceKeys = new Set();

  refundTransactions.forEach(t => {
    const parsed = getServiceName(t, recordData);
    const cleanReason = getCleanRefundReason(t);
    const tAmount = parseFloat(t.amount || 0);

    const match = refundedServices.find(s => {
      const key = s.id + '_' + s.type;
      if (matchedRefundedServiceKeys.has(key)) return false;
      const sPrice = parseFloat(s.final_price ?? s.price ?? 0);
      const amountMatch = Math.abs(sPrice - tAmount) < 1;
      const nameMatch = s.name && parsed.serviceName && (s.name.includes(parsed.serviceName) || parsed.serviceName.includes(s.name));
      const catMatch = s.type === t.category;
      return (nameMatch && amountMatch) || (catMatch && amountMatch) || nameMatch;
    });

    if (match) {
      matchedRefundedServiceKeys.add(match.id + '_' + match.type);
    }

    let finalRefundReason = cleanReason || (match?.refund_reason && match.refund_reason !== '—' ? match.refund_reason : '') || '—';
    if (finalRefundReason && (finalRefundReason === match?.name || finalRefundReason === parsed.serviceName)) {
      finalRefundReason = (match?.refund_reason && match.refund_reason !== match.name) ? match.refund_reason : '—';
    }

    const isRadNoFilm = (getCategoryLabel(t) === 'أشعة' || t.category === 'radiology') && (
      match?.with_film === 0 || 
      match?.with_film === false || 
      match?.withFilm === false || 
      parsed.isWithoutFilm ||
      /(?:بلا|بدون)\s*(?:طباعة\s*)?ف[يـ]?لم/.test(t.description || '') ||
      /(?:بلا|بدون)\s*طباعة/.test(t.description || '') ||
      /رقمي/.test(t.description || '')
    );

    refundsList.push({
      id: t.id,
      name: cleanFilmText(match?.name || parsed.serviceName || 'استرداد مالي'),
      category: getCategoryLabel(t),
      amount: tAmount,
      paymentMethod: t.payment_method || match?.refund_payment_method || 'cash',
      refundReason: finalRefundReason,
      createdAt: t.created_at || match?.refunded_at,
      cashierName: t.cashier_name || 'المحاسب',
      isWithoutFilm: isRadNoFilm,
    });
  });

  refundedServices.forEach(s => {
    const key = s.id + '_' + s.type;
    if (!matchedRefundedServiceKeys.has(key)) {
      const sPrice = parseFloat(s.final_price ?? s.price ?? 0);
      let sReason = s.refund_reason || '—';
      if (sReason === s.name) sReason = '—';
      const isRadNoFilm = s.type === 'radiology' && (
        s.with_film === 0 || 
        s.with_film === false || 
        s.withFilm === false || 
        /(?:بلا|بدون)\s*(?:طباعة\s*)?ف[يـ]?لم/.test(s.name || '') ||
        /(?:بلا|بدون)\s*طباعة/.test(s.name || '') ||
        /رقمي/.test(s.name || '')
      );
      refundsList.push({
        id: `srv_${s.id}_${s.type}`,
        name: cleanFilmText(s.name),
        category: CATEGORY_MAP[s.type] || s.type,
        amount: sPrice,
        paymentMethod: s.refund_payment_method || 'cash',
        refundReason: sReason,
        createdAt: s.refunded_at || s.created_at,
        cashierName: 'المحاسب',
        isWithoutFilm: isRadNoFilm,
      });
    }
  });

  // 4. Mark Refunded Payments in "المدفوعات والتسديدات"
  const matchPool = refundsList.map(r => ({ ...r, matched: false }));

  const paymentsWithRefundStatus = paymentTransactions.map(t => {
    const parsed = getServiceName(t, recordData);
    const tAmount = parseFloat(t.amount || 0);
    const catLabel = getCategoryLabel(t);

    const matchedRefund = matchPool.find(r => {
      if (r.matched) return false;
      const nameMatch = r.name && parsed.serviceName && 
        (r.name.trim().toLowerCase() === parsed.serviceName.trim().toLowerCase() ||
         r.name.includes(parsed.serviceName) || parsed.serviceName.includes(r.name));
      const catMatch = r.category === catLabel || r.category === 'استرداد مالي';
      const amountMatch = Math.abs(r.amount - tAmount) < 1;

      return (nameMatch && amountMatch) || (nameMatch && catMatch) || (catMatch && amountMatch);
    });

    if (matchedRefund) {
      matchedRefund.matched = true;
      return {
        ...t,
        serviceName: parsed.serviceName,
        service_name: t.service_name || parsed.serviceName,
        categoryLabel: catLabel,
        isRefunded: true,
        refundReason: matchedRefund.refundReason,
        isWithoutFilm: Boolean(parsed.isWithoutFilm || matchedRefund.isWithoutFilm),
      };
    }

    return {
      ...t,
      serviceName: parsed.serviceName,
      service_name: t.service_name || parsed.serviceName,
      categoryLabel: catLabel,
      isRefunded: false,
      isWithoutFilm: Boolean(parsed.isWithoutFilm),
    };
  });

  const sortedPayments = [...paymentsWithRefundStatus].sort((a, b) => {
    const isInactiveA = a.isRefunded ? 1 : 0;
    const isInactiveB = b.isRefunded ? 1 : 0;
    if (isInactiveA !== isInactiveB) return isInactiveA - isInactiveB;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const activePayments = paymentsWithRefundStatus.filter(t => !t.isRefunded);
  const totalPaidAmount = activePayments.reduce((acc, t) => acc + parseFloat(t.amount || 0), 0);
  const totalRefundAmount = refundsList.reduce((acc, r) => acc + parseFloat(r.amount || 0), 0);
  const pendingTotal = filteredPending.reduce((acc, item) => acc + (parseFloat(item.price) || 0), 0);
  const servicesTotal = activeServiceHistory.reduce((acc, s) => {
    const eff = (s.final_price !== null && s.final_price !== undefined)
      ? parseFloat(s.final_price)
      : (Number(s.is_free) === 1 ? 0 : parseFloat(s.price || 0));
    return acc + (eff || 0);
  }, 0);

  // Department-specific history lists
  const activeLabHistory = activeServiceHistory.filter(s => s.type === 'lab');
  const activeRadHistory = activeServiceHistory.filter(s => s.type === 'radiology');
  const activeClinicalHistory = activeServiceHistory.filter(s => s.type === 'clinical');
  const surgeryPayments = paymentsWithRefundStatus.filter(t => 
    t.category === 'surgery_payment' || 
    t.category === 'surgery' || 
    Boolean(t.surgery_id) ||
    (t.description && t.description.includes('عملية'))
  );

  const labTotal = activeLabHistory.reduce((acc, s) => {
    const eff = (s.final_price !== null && s.final_price !== undefined)
      ? parseFloat(s.final_price)
      : (Number(s.is_free) === 1 ? 0 : parseFloat(s.price || 0));
    return acc + (eff || 0);
  }, 0);

  const radTotal = activeRadHistory.reduce((acc, s) => {
    const eff = (s.final_price !== null && s.final_price !== undefined)
      ? parseFloat(s.final_price)
      : (Number(s.is_free) === 1 ? 0 : parseFloat(s.price || 0));
    return acc + (eff || 0);
  }, 0);

  const clinicalTotal = activeClinicalHistory.reduce((acc, s) => {
    const eff = (s.final_price !== null && s.final_price !== undefined)
      ? parseFloat(s.final_price)
      : (Number(s.is_free) === 1 ? 0 : parseFloat(s.price || 0));
    return acc + (eff || 0);
  }, 0);

  const surgeryPaymentsTotal = surgeryPayments.reduce((acc, t) => {
    return acc + (t.isRefunded ? 0 : parseFloat(t.amount || 0));
  }, 0);

  // Determine Archive Status
  const latestVisit = recordData?.visits?.[0];
  
  const hasPaidTransactions = recordData?.transactions?.some(t => t.type === 'income' && parseFloat(t.amount) > 0) || false;

  const isArchived = latestVisit && 
    (latestVisit.status === 'completed' || latestVisit.status === 'cancelled') && 
    (Date.now() - new Date(latestVisit.created_at).getTime()) > 86400000;

  const modalTitle = `السجل المالي للمريض (${recordData?.patient?.full_name || '...'}) ${isArchived ? '— للقراءة فقط' : ''}`;
  const displayVisit = activeVisit || latestVisit;
  const displayDate = displayVisit?.created_at || Date.now();

  const isExempt = Boolean(
    displayVisit?.is_exempt === 1 || 
    displayVisit?.is_exempt === true || 
    displayVisit?.is_exempted === 1 || 
    displayVisit?.is_exempted === true
  );

  const isFollowUp = Boolean(
    displayVisit?.is_follow_up === 1 || 
    displayVisit?.is_follow_up === true
  );

  const isSurgery = Boolean(
    displayVisit?.is_surgery === 1 ||
    displayVisit?.is_surgery === true ||
    displayVisit?.has_surgery === 1 ||
    displayVisit?.has_surgery === true ||
    displayVisit?.has_surgeries === 1 ||
    displayVisit?.has_surgeries === true ||
    displayVisit?.status === 'transferred_to_center' ||
    (Array.isArray(displayVisit?.surgeries) && displayVisit.surgeries.length > 0)
  );

  const isExternal = Boolean(
    displayVisit?.is_external === 1 ||
    displayVisit?.is_external === true ||
    displayVisit?.visit_number?.startsWith('EXT-') ||
    (displayVisit?.entity === 'external') ||
    (recordData?.visits && recordData.visits.length > 0 && recordData.visits.every(v => v.visit_number?.startsWith('EXT-'))) ||
    recordData?.transactions?.some(t => t.category === 'external_lab' || t.category === 'external_radiology')
  );

  const modalContent = (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300 print:static print:inset-auto print:flex-col print:bg-white print:z-auto" dir="rtl">
      {/* Background Overlay */}
      <div className="absolute inset-0 print:hidden" onClick={onClose} />
      
      {/* Modal Container */}
      <div className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] print:shadow-none print:w-full print:max-w-none print:max-h-none print:rounded-none print:border-none border border-white/60 ${isFullscreen ? 'w-[98vw] h-[98vh] rounded-[2.5rem]' : 'w-full max-w-5xl h-full max-h-[90vh] rounded-[2rem]'}`}>
        
        {/* Top Title Bar & Controls */}
        <div className="px-5 py-2.5 flex items-center justify-between flex-shrink-0 shadow-md text-white transition-colors duration-300 bg-gradient-to-r from-teal-700 via-emerald-600 to-teal-700 print:hidden z-30">
          <div className="flex items-center gap-2">
            <Layers size={16} />
            <span className="text-xs font-black tracking-wide drop-shadow-sm">
              {modalTitle}
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            {!isExternal && onOpenClinicalArchive && (
              <button
                type="button"
                onClick={() => onOpenClinicalArchive(recordData?.patient || displayVisit)}
                className="h-7 px-2.5 flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all shadow-sm text-xs font-black cursor-pointer active:scale-95"
                title="فتح أرشيف ملف المريض"
              >
                <FolderOpen size={14} strokeWidth={2.2} />
                <span>أرشيف ملف المريض</span>
              </button>
            )}
            {canShowInvoicePrint && (
              <button 
                onClick={() => setShowInvoicePrintModal(true)} 
                className="w-7 h-7 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all shadow-sm cursor-pointer" 
                title="طباعة الفاتورة وسند القبض (A5)"
              >
                <Printer size={15} />
              </button>
            )}
            <div className="w-px h-5 bg-white/30 mx-1 hidden sm:block"></div>
            <button onClick={() => setIsFullscreen(!isFullscreen)} className="w-7 h-7 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all shadow-sm hidden sm:flex" title={isFullscreen ? 'تصغير' : 'تكبير'}>
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white hover:text-red-100 rounded-lg transition-all shadow-sm">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* HEADER — Matching PatientEMRModal Spacing & Layout */}
        <div className={`bg-white ${isFullscreen ? 'px-6 sm:px-8 py-3.5 sm:py-4' : 'px-5 sm:px-6 py-3.5'} flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-100 shrink-0 print:hidden z-20`}>
          <div className={`flex items-center ${isFullscreen ? 'gap-3.5 sm:gap-4' : 'gap-3 sm:gap-3.5'}`}>
            <div className={`${isFullscreen ? 'w-12 h-12 sm:w-13 sm:h-13 rounded-xl' : 'w-11 h-11 sm:w-12 sm:h-12 rounded-xl'} bg-gradient-to-br from-slate-50 to-sky-100 flex items-center justify-center text-sky-600 shadow-inner border border-sky-100/60 shrink-0`}>
              <User size={isFullscreen ? 22 : 20} strokeWidth={1.8} className="sm:hidden" />
              <User size={isFullscreen ? 24 : 22} strokeWidth={1.8} className="hidden sm:block" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center flex-wrap gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-800 tracking-tight leading-none">
                  {recordData?.patient?.full_name || '...'}
                </h2>
                {isExternal && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-teal-100/80 text-teal-800 border border-teal-200/80 select-none shrink-0 shadow-2xs leading-none whitespace-nowrap">
                    <Sparkles size={11} className="text-teal-600 shrink-0" strokeWidth={2.2} />
                    <span>مريض خارجي</span>
                  </span>
                )}
                {isExempt && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-amber-100/70 text-amber-700 border border-amber-200/60 shadow-2xs select-none">
                    <Crown size={11} className="text-amber-600 shrink-0" />
                    <span>إعفاء</span>
                  </span>
                )}
                {isFollowUp && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-emerald-100/70 text-emerald-700 border border-emerald-200/60 shadow-2xs select-none">
                    <RotateCcw size={11} className="text-emerald-600 shrink-0" />
                    <span>مراجعة</span>
                  </span>
                )}
                {isSurgery && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/70 text-purple-700 border border-purple-200/60 shadow-2xs select-none">
                    <Scissors size={11} className="text-purple-600 shrink-0" />
                    <span>عمليات</span>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-0.5">
                <span className="flex items-center gap-1 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md font-black text-slate-500 bg-slate-100/80 border border-slate-200/60" dir="ltr">
                  <User size={11}/> {recordData?.patient?.id || '...'}
                </span>
                {((recordData?.patient?.gender || displayVisit?.gender) || (recordData?.patient?.age || displayVisit?.age)) && (
                  <span className="flex items-center gap-1 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md font-black text-slate-600 bg-slate-100/80 border border-slate-200/60">
                    {(recordData?.patient?.gender || displayVisit?.gender) ? ((recordData?.patient?.gender || displayVisit?.gender) === 'male' || (recordData?.patient?.gender || displayVisit?.gender) === 'ذكر' ? 'ذكر' : 'أنثى') : ''}
                    {(recordData?.patient?.gender || displayVisit?.gender) && (recordData?.patient?.age || displayVisit?.age) ? ' — ' : ''}
                    {(recordData?.patient?.age || displayVisit?.age) ? `${recordData?.patient?.age || displayVisit?.age} سنة` : ''}
                  </span>
                )}
                {(() => {
                  const rawPhone = recordData?.patient?.phone || displayVisit?.phone;
                  const hasPhone = rawPhone && String(rawPhone).trim() !== '' && rawPhone !== 'بدون هاتف' && rawPhone !== '-' && rawPhone !== '—';
                  if (!hasPhone) return null;
                  return (
                    <span className="flex items-center gap-1 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md font-black text-sky-600 bg-sky-50 border border-sky-100/60">
                      <Phone size={11}/> <span dir="ltr">{rawPhone}</span>
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
          
          {/* Plain Text Date, Visit ID & Financial Totals */}
          <div className={`flex flex-col items-start md:items-end ${isFullscreen ? 'gap-1.5' : 'gap-1'} self-stretch md:self-auto`}>
            <div className={`flex items-center gap-1.5 text-slate-500 font-bold ${isFullscreen ? 'text-xs sm:text-sm' : 'text-xs'}`}>
              <Calendar size={isFullscreen ? 15 : 13} className="text-sky-600 opacity-80" />
              <span dir="ltr">{new Date(displayDate).toLocaleDateString('en-GB')}</span>
              <span className="text-slate-300 mx-0.5">•</span>
              <span dir="ltr">{new Date(displayDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
            </div>
            
            {displayVisit && (
              <div className={`flex items-center gap-1 ${isFullscreen ? 'text-xs font-black' : 'text-[10px] sm:text-[11px] font-black'} text-slate-400`}>
                <span>معرف الزيارة:</span>
                <span className="text-slate-600 font-bold" dir="ltr">{displayVisit.visit_number || displayVisit.id}</span>
              </div>
            )}

            {/* Financial Summary Badge (المدفوع) - Shown only if there is a positive value */}
            {totalPaidAmount > 0 && (
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap pt-0.5">
                <div className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg bg-emerald-50 border border-emerald-200/80 text-emerald-800 shadow-2xs select-none">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-[10px] sm:text-[11px] font-black text-emerald-700">المدفوع:</span>
                  <span className="text-xs sm:text-sm font-black tracking-tight text-emerald-800" dir="ltr">
                    {totalPaidAmount.toLocaleString('en-US')}
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-bold text-emerald-600">ر.ي</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Explanatory Message Banner for Cancelled Visit */}
        {Boolean(isVisitCancelled) && (
          <div className={`bg-rose-50/95 border-b border-rose-200/90 ${isFullscreen ? 'px-6 sm:px-8 py-3' : 'px-5 sm:px-6 py-2.5'} flex items-center justify-between gap-3 text-rose-800 flex-shrink-0 shadow-2xs print:hidden z-20`}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0 text-rose-600 shadow-xs">
                <AlertCircle size={18} strokeWidth={2.2} />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-black text-rose-900 leading-tight">
                  تنبيه: الزيارة ملغية
                </p>
                <p className="text-[11px] sm:text-xs font-bold text-rose-700/90 mt-0.5">
                  تم إلغاء هذه الزيارة، ولا يمكن إضافة أو تعديل أو تنفيذ أي خدمات أو فحوصات أو إجراءات طبية عليها.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Timeline Navigator Bar */}
        {!recordLoading && recordData && (
          <div className="bg-white border-b border-slate-100 z-10 flex-shrink-0">
             <UnifiedTimelineNavigator 
               patientHistory={recordData.visits || []} 
               selectedVisit={activeVisit} 
               onSelectVisit={setSelectedVisit} 
               theme="sky"
             />
          </div>
        )}

        {/* Printable Header (Visible only in print) */}
        <div className="hidden print:block text-center mb-8 border-b-2 border-slate-800 pb-4 mt-8">
          <h1 className="text-2xl font-black mb-2 text-slate-800">ORTHOCARE SYSTEM - السجل المالي</h1>
          {recordData?.patient && (
            <div className="flex justify-between text-sm font-bold mt-4 text-slate-700">
              <span>اسم المريض: {recordData.patient.full_name}</span>
              <span>رقم المريض: {recordData.patient.id}</span>
              <span>الهاتف: {recordData.patient.phone || '—'}</span>
            </div>
          )}
          {selectedVisit && (
             <div className="text-center mt-2 text-sm font-bold text-slate-600">
               تاريخ الزيارة: {new Date(selectedVisit.created_at).toLocaleDateString('en-GB')}
             </div>
          )}
          <p className="text-xs text-slate-500 mt-2">تاريخ الطباعة: {new Date().toLocaleString('en-GB')}</p>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar flex flex-col items-center print:bg-white print:overflow-visible print:p-0">
          {recordLoading ? (
             <div className="flex items-center justify-center h-48 w-full">
               <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin"></div>
             </div>
          ) : (
            <div className="w-full space-y-6 pb-6 print:pb-0">
              
              {/* --- States --- */}
              {(() => {
                const isEmpty = filteredPending.length === 0 && paymentTransactions.length === 0 && refundsList.length === 0 && activeServiceHistory.length === 0 && filteredSurgeries.length === 0;
                
                if (isVisitCancelled && isEmpty) {
                  return (
                    <div className="flex flex-col items-center justify-center p-10 sm:p-14 bg-red-50/30 rounded-3xl border-2 border-red-100 border-dashed m-4 mt-8">
                      <div className="w-16 h-16 bg-white border border-red-100 text-red-400 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                        <XCircle size={32} strokeWidth={1.5} />
                      </div>
                      <h3 className="text-base font-black text-slate-800 mb-1.5">الزيارة ملغية</h3>
                      <p className="text-xs font-bold text-slate-500 text-center max-w-sm leading-relaxed">
                        تم إلغاء هذه الزيارة بالكامل. لا توجد أي سجلات مالية لهذه الزيارة، ولا يمكن إجراء أي عمليات دفع أو تحصيل جديدة.
                      </p>
                    </div>
                  );
                }
                
                if (isVisitCancelled && !isEmpty) {
                  return null;
                }

                if (!isVisitCancelled && isEmpty) {
                  return (
                    <div className="flex flex-col items-center justify-center p-10 sm:p-14 bg-slate-50/50 rounded-3xl border-2 border-slate-200 border-dashed m-4 mt-8">
                      <div className="w-16 h-16 bg-white border border-slate-100 text-slate-300 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                        <FileText size={32} strokeWidth={1.5} />
                      </div>
                      <h3 className="text-base font-black text-slate-700 mb-1.5">لا يوجد أي سجل مالي</h3>
                      <p className="text-xs font-bold text-slate-500 text-center max-w-xs leading-relaxed">
                        لا توجد أي حركات مالية، مستحقات معلقة، خدمات سريرية، أو عمليات جراحية مسجلة.
                      </p>
                    </div>
                  );
                }

                return null;
              })()}
              {/* --- Top Action Bar: Print Invoice (A5) Button (عرض زر A5 في بداية النافذة قبل قسم الخدمات المعلقة) --- */}
              {canShowInvoicePrint && (
                <div className="flex items-center justify-end px-1 print:hidden">
                  <button
                    type="button"
                    onClick={() => setShowInvoicePrintModal(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black shadow-2xs hover:shadow-xs transition-all cursor-pointer active:scale-95 border border-emerald-400/30"
                    title="معاينة وطباعة فاتورة وسند قبض رسمي بمقاس A5"
                  >
                    <Printer size={13} />
                    <span>طباعة الفاتورة (A5)</span>
                  </button>
                </div>
              )}

{/* --- Section 0: Pending Dues (مستحقات معلقة - تصميم موحد غير منسدل مع زر دفع وتحصيل) --- */}
              {!readOnly && filteredPending.length > 0 && (
                <div className="bg-white rounded-2xl border border-amber-200/90 transition-all duration-200 overflow-hidden shadow-xs">
                  {/* Integrated Header Bar (Non-collapsible, always open) */}
                  <div className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-50/80 via-white to-amber-50/40 border-b border-amber-100/80">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-amber-100 text-amber-700 shadow-2xs">
                        <Layers size={16} />
                      </div>
                      <span className="text-sm font-black text-slate-800 tracking-tight">
                        مستحقات معلقة
                      </span>
                      <span className="text-[11px] px-2.5 py-0.5 font-extrabold rounded-full border tabular-nums tracking-tight bg-amber-50 text-amber-800 border-amber-200/90 shadow-2xs">
                        {formatCountUnit(filteredPending.length, 'مستحق')}
                      </span>
                    </div>

                    {/* Section subtotal badge */}
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold bg-amber-50/80 text-amber-700 border-amber-200/70 shadow-2xs">
                      <span className="text-slate-500 font-medium">إجمالي المبلغ المطلوب:</span>
                      <span className="font-extrabold tabular-nums tracking-tight text-sm text-amber-700">
                        {pendingTotal.toLocaleString('en-US')}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                    </div>
                  </div>
                  
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-right text-sm whitespace-nowrap table-fixed">
                      <thead className="bg-amber-50/40 border-b border-amber-100/80">
                        <tr>
                          <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[5%] text-center">#</th>
                          <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[38%] text-right">اسم الخدمة</th>
                          <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[12%] text-right">القسم</th>
                          <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[15%] text-right">الحالة</th>
                          <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[15%] text-right">المبلغ المطلوب</th>
                          <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[15%] text-center">إجراء</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {filteredPending.map((item, idx) => {
                          const isRadNoFilm = (item.type === 'radiology' || item.category === 'radiology') && (
                            item.with_film === 0 || 
                            item.with_film === false || 
                            item.withFilm === false || 
                            /(?:بلا|بدون)\s*(?:طباعة\s*)?ف[يـ]?لم/.test(item.name || '') ||
                            /(?:بلا|بدون)\s*طباعة/.test(item.name || '') ||
                            /رقمي/.test(item.name || '')
                          );
                          const displayName = cleanFilmText(item.name);

                          return (
                            <tr key={idx} className="hover:bg-amber-50/20 transition-colors">
                              <td className="px-5 py-3.5 font-black text-slate-400 text-center text-xs align-middle">{idx + 1}</td>
                              <td className="px-5 py-3.5 font-bold text-slate-800 whitespace-pre-wrap break-words max-w-[250px] align-middle">
                                <div className="flex items-center flex-wrap gap-1.5">
                                  <span>{displayName}</span>
                                  {isRadNoFilm && (
                                    <span className="text-xs font-semibold text-slate-500 shrink-0">
                                      (بدون فيلم)
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-5 py-3.5 align-middle">
                                {renderDepartmentBadge(item.type)}
                              </td>
                            <td className="px-5 py-3.5 align-middle">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                بانتظار الدفع
                              </span>
                            </td>
                            <td className="px-5 py-3.5 align-middle">
                              <div className="flex items-center gap-1 text-slate-800">
                                <span className="text-base font-extrabold tabular-nums tracking-tight text-slate-800" dir="ltr">
                                  {parseFloat(item.price).toLocaleString('en-US')}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 align-middle text-center">
                              {!isVisitCancelled && typeof onOpenCheckout === 'function' ? (
                                <button 
                                  onClick={() => {
                                    const visit = recordData?.visits?.find(v => String(v.id) === String(item.visit_id));
                                    onOpenCheckout(visit || item, item.type === 'entry_fee' ? 'entry' : 'both');
                                  }}
                                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1 w-max mx-auto active:scale-95"
                                >
                                  دفع وتحصيل
                                </button>
                              ) : (
                                <span className="text-xs font-bold text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pending Dues Footer with Taffyot */}
                  <div className="flex items-center justify-between px-6 py-3.5 border-t border-amber-100/80 mt-auto bg-amber-50/40 print:bg-transparent">
                    <span className="text-xs font-bold text-amber-800">إجمالي المستحقات المعلقة:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-base font-extrabold tabular-nums tracking-tight text-amber-700" dir="ltr">
                        {pendingTotal.toLocaleString('en-US')}
                      </span>
                      <span className="text-[10px] font-bold text-amber-600">ر.ي</span>
                      {pendingTotal > 0 && (
                        <span className="text-xs font-bold mr-1.5 pr-2 border-r text-amber-700/70 border-amber-200/60">
                          {taffyot(pendingTotal).replace(/(ريالاً يمنياً|ريال يمني|فقط|لا غير|-)/g, '').trim()} ريال يمني.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}



              {/* --- Section 1: Payments & Settlements (المدفوعات والتسديدات - قائمة منسدلة قابلة للطي) --- */}
              {paymentsWithRefundStatus.length > 0 && (
                <div className="space-y-1.5">
                  

                  <div className="bg-white rounded-2xl border border-emerald-200/90 transition-all duration-200 overflow-hidden shadow-xs">
                    {/* Accordion Header Bar */}
                    <div
                      onClick={() => toggleSection('payments')}
                      className="w-full flex items-center justify-between px-4 py-3 cursor-pointer select-none transition-colors bg-gradient-to-r from-emerald-50/80 via-white to-emerald-50/40 hover:from-emerald-100/80 hover:via-emerald-50/50 hover:to-emerald-100/60"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 shadow-2xs">
                          <FileText size={16} />
                        </div>
                        <span className="text-sm font-black text-slate-800 tracking-tight">
                          المدفوعات والتسديدات
                        </span>
                        {/* Section Counter Badge */}
                        <span className="text-[11px] px-2.5 py-0.5 font-extrabold rounded-full border tabular-nums tracking-tight bg-emerald-50 text-emerald-800 border-emerald-200/90 shadow-2xs">
                          {formatCountUnit(paymentsWithRefundStatus.filter(t => !t.isRefunded).length, 'دفعة')}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Section subtotal (Always visible on header) */}
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold bg-emerald-50/80 text-emerald-700 border-emerald-200/70 shadow-2xs">
                          <span className="text-slate-500 font-medium">إجمالي المبلغ:</span>
                          <span className="font-extrabold tabular-nums tracking-tight text-sm text-emerald-700">
                            {totalPaidAmount.toLocaleString('en-US')}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                        </div>

                        <div className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-700 shadow-2xs">
                          <ChevronDown
                            size={16}
                            className={`transition-transform duration-200 ${openSections.payments ? 'rotate-180' : ''}`}
                          />
                        </div>
                      </div>
                    </div>
                  
                  {/* Accordion Body */}
                  {openSections.payments && (
                    <div className="border-t border-slate-100 flex flex-col print:border-none print:shadow-none print:rounded-none">
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-right text-sm whitespace-nowrap table-fixed">
                      <thead className="bg-slate-50 border-b border-slate-200 print:bg-transparent print:border-slate-800">
                        <tr>
                          <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[5%] text-center">#</th>
                          <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[35%] text-right">اسم الخدمة</th>
                          <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[13%] text-right">القسم</th>
                          <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[15%] text-right">طريقة الدفع</th>
                          <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[17%] text-right">التاريخ والوقت</th>
                          <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[15%] text-right">المبلغ</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100 print:divide-slate-200">
                        {sortedPayments.length === 0 && (
                          <tr><td colSpan="6" className="px-5 py-6 text-center text-slate-400 font-bold text-sm">لا توجد مدفوعات مسجلة</td></tr>
                        )}
                        {sortedPayments.map((t, index) => {
                          const parsed = getServiceName(t, recordData);
                          const isRefunded = Boolean(t.isRefunded);

                          return (
                            <tr 
                              key={t.id || index} 
                              className={`transition-colors ${
                                isRefunded 
                                  ? 'opacity-50 bg-slate-50/50 hover:bg-slate-100/60 hover:opacity-85 print:opacity-50' 
                                  : 'hover:bg-slate-50/50'
                              }`}
                            >
                              {/* 0. الرقم (Index) */}
                              <td className={`px-5 py-3 font-black text-center text-xs align-middle ${isRefunded ? 'text-slate-300' : 'text-slate-400'}`}>
                                {index + 1}
                              </td>

                              {/* 1. اسم الخدمة */}
                              <td className="px-5 py-3 font-semibold text-slate-800 align-middle whitespace-pre-wrap break-words max-w-[250px]">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center flex-wrap gap-2">
                                    <span className="text-sm font-bold text-slate-800">
                                      {parsed.serviceName}
                                    </span>
                                    {Boolean(parsed.isWithoutFilm || t.isWithoutFilm) && (
                                      <span className="text-xs font-semibold text-slate-500 shrink-0">
                                        (بدون فيلم)
                                      </span>
                                    )}
                                    {parsed.isFree && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-50 text-amber-600 border border-amber-200/60 shadow-xs shrink-0">
                                        مجاني
                                      </span>
                                    )}
                                  </div>
                                  {isRefunded && t.refundReason && t.refundReason !== '—' && (
                                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                                      <span>سبب الاسترداد:</span>
                                      <span className="text-slate-500 font-semibold">{t.refundReason}</span>
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* 2. القسم */}
                              <td className="px-5 py-3 align-middle">
                                {renderDepartmentBadge(getCategoryLabel(t))}
                              </td>

                              {/* 3. طريقة الدفع */}
                              <td className="px-5 py-3 align-middle">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                  {t.payment_method === 'bank_transfer' ? (
                                    <>
                                      <CreditCard size={14} className={isRefunded ? 'text-slate-400' : 'text-sky-600'} />
                                      <span>تحويل بنكي</span>
                                    </>
                                  ) : (
                                    <>
                                      <Wallet size={14} className={isRefunded ? 'text-slate-400' : 'text-emerald-600'} />
                                      <span>نقداً</span>
                                    </>
                                  )}
                                </div>
                              </td>

                              {/* 4. التاريخ والوقت */}
                              <td className="px-5 py-3 align-middle">
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-slate-700" dir="ltr">
                                    {new Date(t.created_at).toLocaleDateString('en-GB')}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-400" dir="ltr">
                                    {new Date(t.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                  </span>
                                </div>
                              </td>

                              {/* 5. المبلغ */}
                              <td className="px-5 py-3 align-middle">
                                <div className="flex items-center gap-1">
                                  <span 
                                    className="text-base font-extrabold tabular-nums tracking-tight text-slate-800" 
                                    dir="ltr"
                                  >
                                    {parseFloat(t.amount).toLocaleString('en-US')}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-400">
                                    ر.ي
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Total Footer with Taffyot - Excludes Refunded Payments */}
                  {(() => {
                    const activePayments = paymentsWithRefundStatus.filter(t => !t.isRefunded);
                    const grandTotal = activePayments.reduce((acc, t) => acc + parseFloat(t.amount || 0), 0);
                    const refundedCount = paymentsWithRefundStatus.filter(t => t.isRefunded).length;
                    
                    const bgClass = 'bg-emerald-50/50 border-emerald-100/60';
                    const textClass = 'text-emerald-800';
                    const numberClass = 'text-emerald-700';
                    const currencyClass = 'text-emerald-600';
                    const taffyotClass = 'text-emerald-700/70 border-emerald-200/60';

                    return (
                      <div className={`flex items-center justify-between px-6 py-4 border-t mt-auto print:bg-transparent print:border-slate-800 print:border-t-2 ${bgClass}`}>
                        <div className="flex items-center gap-2.5">
                          <span className={`text-xs font-bold ${textClass}`}>إجمالي المدفوعات الصافية:</span>
                          {refundedCount > 0 && (
                            <span className="text-[11px] font-bold text-rose-700 bg-rose-50/90 px-2 py-0.5 rounded-full border border-rose-200/70">
                              تم استبعاد {refundedCount} {refundedCount === 1 ? 'حركة مستردة' : 'حركات مستردة'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-base font-extrabold tabular-nums tracking-tight ${numberClass}`} dir="ltr">{grandTotal.toLocaleString('en-US')}</span>
                          <span className={`text-[10px] font-bold ${currencyClass}`}>ر.ي</span>
                          {grandTotal > 0 && <span className={`text-xs font-bold mr-1.5 pr-2 border-r ${taffyotClass}`}>{taffyot(grandTotal).replace(/(ريالاً يمنياً|ريال يمني|فقط|لا غير|-)/g, '').trim()} ريال يمني.</span>}
                        </div>
                      </div>
                    );
                  })()}
                    </div>
                  )}
                </div>
              </div>
            )}

              {/* --- Section: Lab Services Record (سجل المختبر) --- */}
              {activeLabHistory.length > 0 && (
                <div className="bg-white rounded-2xl border border-purple-200/90 transition-all duration-200 overflow-hidden shadow-xs">
                  {/* Accordion Header Bar */}
                  <div
                    onClick={() => toggleSection('lab')}
                    className="w-full flex items-center justify-between px-4 py-3 cursor-pointer select-none transition-colors bg-gradient-to-r from-purple-50/80 via-white to-purple-50/40 hover:from-purple-100/80 hover:via-purple-50/50 hover:to-purple-100/60"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-purple-100 text-purple-700 shadow-2xs border border-purple-200/70">
                        <FlaskConical size={16} />
                      </div>
                      <span className="text-sm font-black text-slate-800 tracking-tight">
                        سجل المختبر
                      </span>
                      {/* Section Counter Badge */}
                      <span className="text-[11px] px-2.5 py-0.5 font-extrabold rounded-full border tabular-nums tracking-tight bg-purple-50 text-purple-800 border-purple-200/90 shadow-2xs">
                        {formatCountUnit(activeLabHistory.length, 'تحليل')}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Section subtotal */}
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold bg-purple-50/80 text-purple-700 border-purple-200/70 shadow-2xs">
                        <span className="text-slate-500 font-medium">إجمالي المبلغ:</span>
                        <span className="font-extrabold tabular-nums tracking-tight text-sm text-purple-700">
                          {Math.round(labTotal).toLocaleString('en-US')}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                      </div>

                      <div className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-700 shadow-2xs">
                        <ChevronDown
                          size={16}
                          className={`transition-transform duration-200 ${openSections.lab ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Accordion Body */}
                  {openSections.lab && (
                    <div className="border-t border-slate-100 flex flex-col print:border-none print:shadow-none print:rounded-none">
                      <div className="w-full overflow-x-auto">
                        <table className="w-full text-right text-sm whitespace-nowrap">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-12 text-center">#</th>
                              <th className="px-5 py-3.5 text-xs font-bold text-slate-500 min-w-[250px]">التحليل</th>
                              <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-44">الحالة</th>
                              <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-48">تاريخ الطلب</th>
                              <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-36">المبلغ</th>
                              {!readOnly && (
                                <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-32 text-center">إجراء</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-100">
                            {activeLabHistory.map((s, index) => {
                              const badge = STATUS_BADGE[s.status] || STATUS_BADGE['paid'];
                              const rowKey = `${s.id}_${s.type}`;
                              const effectiveAmount = (s.final_price !== null && s.final_price !== undefined)
                                ? parseFloat(s.final_price)
                                : (Number(s.is_free) === 1 ? 0 : parseFloat(s.price || 0));
                              const isFreeService = Number(s.is_free) === 1 || effectiveAmount <= 0;
                              const isExpanded = expandedRefundId === rowKey && !isFreeService;
                              const itemDate = s.requested_at || s.created_at;
                              const displayName = cleanFilmText(s.name);

                              return (
                                <React.Fragment key={'lab_' + index}>
                                  <tr className={`transition-colors ${isExpanded ? 'bg-red-50/40' : 'hover:bg-slate-50/50'}`}>
                                    <td className="px-5 py-4 font-black text-slate-400 text-center text-xs">{index + 1}</td>
                                    <td className="px-5 py-4 font-semibold text-slate-800 whitespace-pre-wrap break-words max-w-[250px]">
                                      <div className="flex items-center flex-wrap gap-2">
                                        <span className="font-bold text-slate-800 text-sm">{displayName}</span>
                                        {isFreeService && (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-50 text-amber-600 border border-amber-200/60 shadow-xs shrink-0">
                                            مجاني
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-5 py-4">
                                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${badge.color.split(' ').find(c => c.startsWith('text-')) || 'text-slate-600'}`}>
                                        {badge.pulse && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                                        {badge.label}
                                      </span>
                                    </td>
                                    <td className="px-5 py-4">
                                      <div className="flex flex-col">
                                        <span className="text-sm font-bold text-slate-700" dir="ltr">
                                          {itemDate ? new Date(itemDate).toLocaleDateString('en-GB') : '—'}
                                        </span>
                                        {itemDate && (
                                          <span className="text-[10px] font-bold text-slate-400" dir="ltr">
                                            {new Date(itemDate).toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit', hour12: true })}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-5 py-4">
                                      <div className="flex items-baseline gap-1 text-base font-extrabold tabular-nums tracking-tight text-slate-800">
                                        <span dir="ltr">{effectiveAmount.toLocaleString('en-US')}</span>
                                        <span className="text-[10px] text-slate-400 font-bold">ر.ي</span>
                                      </div>
                                      {effectiveAmount < parseFloat(s.price) && (
                                        <div className="text-[10px] text-slate-400 line-through font-semibold" dir="ltr">
                                          {parseFloat(s.price).toLocaleString('en-US')} ر.ي
                                        </div>
                                      )}
                                    </td>
                                    {!readOnly && (
                                      <td className="px-5 py-4 text-center">
                                        {isFreeService ? (
                                          <span className="text-slate-400 font-bold text-[9px] sm:text-[10px] block whitespace-nowrap text-center">
                                            لا يمكن الاسترداد (مجاني)
                                          </span>
                                        ) : s.status === 'paid' && !isVisitCancelled ? (
                                          <button
                                            onClick={() => {
                                              setExpandedRefundId(isExpanded ? null : rowKey);
                                              setRefundReason('');
                                            }}
                                            className={`font-bold text-xs px-3 py-1.5 rounded-lg border transition-colors ${isExpanded ? 'bg-red-100 text-red-700 border-red-300' : 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'}`}
                                          >
                                            {isExpanded ? 'إلغاء' : 'استرداد'}
                                          </button>
                                        ) : (s.status === 'in_progress' || s.status === 'completed' || s.status === 'result_uploaded') ? (
                                          <span className="text-slate-400 font-bold text-[9px] sm:text-[10px] block whitespace-nowrap text-center">
                                            لا يمكن الاسترداد ({s.status === 'in_progress' ? 'قيد التنفيذ' : 'مكتمل'})
                                          </span>
                                        ) : null}
                                      </td>
                                    )}
                                  </tr>

                                  {/* ── Inline Refund Expansion Row ── */}
                                  {!readOnly && isExpanded && (
                                    <tr className="bg-red-50/60 border-t border-red-100">
                                      <td colSpan={6} className="px-5 py-4">
                                        <div className="flex flex-col gap-3">
                                          <p className="text-xs font-bold text-red-700 flex items-center flex-wrap gap-1">
                                            <span>استرداد:</span>
                                            <span className="text-slate-700">{displayName}</span>
                                            <span className="text-slate-600 font-bold mr-1" dir="ltr">
                                              ({parseFloat(s.final_price ?? s.price).toLocaleString('en-US')} ر.ي)
                                            </span>
                                          </p>
                                          <textarea
                                            value={refundReason}
                                            onChange={(e) => {
                                              setRefundReason(e.target.value);
                                              e.target.style.height = 'auto';
                                              e.target.style.height = e.target.scrollHeight + 'px';
                                            }}
                                            rows={2}
                                            className="w-full bg-white border border-red-200 focus:border-red-400 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-300 transition-all resize-none overflow-hidden"
                                            placeholder="اكتب سبب الاسترداد (إلزامي)..."
                                            style={{ minHeight: '2.75rem' }}
                                            autoFocus
                                          />
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={() => { setExpandedRefundId(null); setRefundReason(''); }}
                                              disabled={isRefunding}
                                              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-lg border border-slate-200 transition-colors disabled:opacity-50"
                                            >
                                              إلغاء
                                            </button>
                                            <button
                                              onClick={() => handleItemRefund(s.id, s.type)}
                                              disabled={isRefunding || !refundReason.trim()}
                                              className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:hover:bg-red-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5"
                                            >
                                              {isRefunding
                                                ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> جاري الاسترداد...</>
                                                : 'تأكيد الاسترداد'
                                              }
                                            </button>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Footer with Taffyot */}
                      <div className="flex items-center justify-between px-6 py-3.5 border-t border-purple-100 mt-auto bg-purple-50/40 print:bg-transparent">
                        <span className="text-xs font-bold text-purple-900">إجمالي تحاليل المختبر:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-extrabold tabular-nums tracking-tight text-purple-700" dir="ltr">
                            {Math.round(labTotal).toLocaleString('en-US')}
                          </span>
                          <span className="text-[10px] font-bold text-purple-600">ر.ي</span>
                          {labTotal > 0 && (
                            <span className="text-xs font-bold mr-1.5 pr-2 border-r text-purple-700/70 border-purple-200/60">
                              {taffyot(labTotal).replace(/(ريالاً يمنياً|ريال يمني|فقط|لا غير|-)/g, '').trim()} ريال يمني.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* --- Section: Radiology Services Record (سجل الأشعة) --- */}
              {activeRadHistory.length > 0 && (
                <div className="bg-white rounded-2xl border border-sky-200/90 transition-all duration-200 overflow-hidden shadow-xs">
                  {/* Accordion Header Bar */}
                  <div
                    onClick={() => toggleSection('radiology')}
                    className="w-full flex items-center justify-between px-4 py-3 cursor-pointer select-none transition-colors bg-gradient-to-r from-sky-50/80 via-white to-sky-50/40 hover:from-sky-100/80 hover:via-sky-50/50 hover:to-sky-100/60"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-sky-100 text-sky-700 shadow-2xs border border-sky-200/70">
                        <Radiation size={16} />
                      </div>
                      <span className="text-sm font-black text-slate-800 tracking-tight">
                        سجل الأشعة
                      </span>
                      {/* Section Counter Badge */}
                      <span className="text-[11px] px-2.5 py-0.5 font-extrabold rounded-full border tabular-nums tracking-tight bg-sky-50 text-sky-800 border-sky-200/90 shadow-2xs">
                        {formatCountUnit(activeRadHistory.length, 'فحص')}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Section subtotal */}
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold bg-sky-50/80 text-sky-700 border-sky-200/70 shadow-2xs">
                        <span className="text-slate-500 font-medium">إجمالي المبلغ:</span>
                        <span className="font-extrabold tabular-nums tracking-tight text-sm text-sky-700">
                          {Math.round(radTotal).toLocaleString('en-US')}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                      </div>

                      <div className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-700 shadow-2xs">
                        <ChevronDown
                          size={16}
                          className={`transition-transform duration-200 ${openSections.radiology ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Accordion Body */}
                  {openSections.radiology && (
                    <div className="border-t border-slate-100 flex flex-col print:border-none print:shadow-none print:rounded-none">
                      <div className="w-full overflow-x-auto">
                        <table className="w-full text-right text-sm whitespace-nowrap">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-12 text-center">#</th>
                              <th className="px-5 py-3.5 text-xs font-bold text-slate-500 min-w-[250px]">الفحص</th>
                              <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-44">الحالة</th>
                              <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-48">تاريخ الطلب</th>
                              <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-36">المبلغ</th>
                              {!readOnly && (
                                <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-32 text-center">إجراء</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-100">
                            {activeRadHistory.map((s, index) => {
                              const badge = STATUS_BADGE[s.status] || STATUS_BADGE['paid'];
                              const rowKey = `${s.id}_${s.type}`;
                              const effectiveAmount = (s.final_price !== null && s.final_price !== undefined)
                                ? parseFloat(s.final_price)
                                : (Number(s.is_free) === 1 ? 0 : parseFloat(s.price || 0));
                              const isFreeService = Number(s.is_free) === 1 || effectiveAmount <= 0;
                              const isExpanded = expandedRefundId === rowKey && !isFreeService;
                              const itemDate = s.requested_at || s.created_at;
                              const isRadNoFilm = (s.type === 'radiology' || s.category === 'radiology') && (
                                s.with_film === 0 || 
                                s.with_film === false || 
                                s.withFilm === false || 
                                /(?:بلا|بدون)\s*(?:طباعة\s*)?ف[يـ]?لم/.test(s.name || '') ||
                                /(?:بلا|بدون)\s*طباعة/.test(s.name || '') ||
                                /رقمي/.test(s.name || '')
                              );
                              const displayName = cleanFilmText(s.name);

                              return (
                                <React.Fragment key={'rad_' + index}>
                                  <tr className={`transition-colors ${isExpanded ? 'bg-red-50/40' : 'hover:bg-slate-50/50'}`}>
                                    <td className="px-5 py-4 font-black text-slate-400 text-center text-xs">{index + 1}</td>
                                    <td className="px-5 py-4 font-semibold text-slate-800 whitespace-pre-wrap break-words max-w-[250px]">
                                      <div className="flex items-center flex-wrap gap-2">
                                        <span className="font-bold text-slate-800 text-sm">{displayName}</span>
                                        {isRadNoFilm && (
                                          <span className="text-xs font-semibold text-slate-500 shrink-0">
                                            (بدون فيلم)
                                          </span>
                                        )}
                                        {isFreeService && (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-50 text-amber-600 border border-amber-200/60 shadow-xs shrink-0">
                                            مجاني
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-5 py-4">
                                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${badge.color.split(' ').find(c => c.startsWith('text-')) || 'text-slate-600'}`}>
                                        {badge.pulse && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                                        {badge.label}
                                      </span>
                                    </td>
                                    <td className="px-5 py-4">
                                      <div className="flex flex-col">
                                        <span className="text-sm font-bold text-slate-700" dir="ltr">
                                          {itemDate ? new Date(itemDate).toLocaleDateString('en-GB') : '—'}
                                        </span>
                                        {itemDate && (
                                          <span className="text-[10px] font-bold text-slate-400" dir="ltr">
                                            {new Date(itemDate).toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit', hour12: true })}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-5 py-4">
                                      <div className="flex items-baseline gap-1 text-base font-extrabold tabular-nums tracking-tight text-slate-800">
                                        <span dir="ltr">{effectiveAmount.toLocaleString('en-US')}</span>
                                        <span className="text-[10px] text-slate-400 font-bold">ر.ي</span>
                                      </div>
                                      {effectiveAmount < parseFloat(s.price) && (
                                        <div className="text-[10px] text-slate-400 line-through font-semibold" dir="ltr">
                                          {parseFloat(s.price).toLocaleString('en-US')} ر.ي
                                        </div>
                                      )}
                                    </td>
                                    {!readOnly && (
                                      <td className="px-5 py-4 text-center">
                                        {isFreeService ? (
                                          <span className="text-slate-400 font-bold text-[9px] sm:text-[10px] block whitespace-nowrap text-center">
                                            لا يمكن الاسترداد (مجاني)
                                          </span>
                                        ) : s.status === 'paid' && !isVisitCancelled ? (
                                          <button
                                            onClick={() => {
                                              setExpandedRefundId(isExpanded ? null : rowKey);
                                              setRefundReason('');
                                            }}
                                            className={`font-bold text-xs px-3 py-1.5 rounded-lg border transition-colors ${isExpanded ? 'bg-red-100 text-red-700 border-red-300' : 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'}`}
                                          >
                                            {isExpanded ? 'إلغاء' : 'استرداد'}
                                          </button>
                                        ) : (s.status === 'in_progress' || s.status === 'completed' || s.status === 'result_uploaded') ? (
                                          <span className="text-slate-400 font-bold text-[9px] sm:text-[10px] block whitespace-nowrap text-center">
                                            لا يمكن الاسترداد ({s.status === 'in_progress' ? 'قيد التنفيذ' : 'مكتمل'})
                                          </span>
                                        ) : null}
                                      </td>
                                    )}
                                  </tr>

                                  {/* ── Inline Refund Expansion Row ── */}
                                  {!readOnly && isExpanded && (
                                    <tr className="bg-red-50/60 border-t border-red-100">
                                      <td colSpan={6} className="px-5 py-4">
                                        <div className="flex flex-col gap-3">
                                          <p className="text-xs font-bold text-red-700 flex items-center flex-wrap gap-1">
                                            <span>استرداد:</span>
                                            <span className="text-slate-700">{displayName}</span>
                                            {isRadNoFilm && (
                                              <span className="text-xs font-semibold text-slate-500 shrink-0">
                                                (بدون فيلم)
                                              </span>
                                            )}
                                            <span className="text-slate-600 font-bold mr-1" dir="ltr">
                                              ({parseFloat(s.final_price ?? s.price).toLocaleString('en-US')} ر.ي)
                                            </span>
                                          </p>
                                          <textarea
                                            value={refundReason}
                                            onChange={(e) => {
                                              setRefundReason(e.target.value);
                                              e.target.style.height = 'auto';
                                              e.target.style.height = e.target.scrollHeight + 'px';
                                            }}
                                            rows={2}
                                            className="w-full bg-white border border-red-200 focus:border-red-400 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-300 transition-all resize-none overflow-hidden"
                                            placeholder="اكتب سبب الاسترداد (إلزامي)..."
                                            style={{ minHeight: '2.75rem' }}
                                            autoFocus
                                          />
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={() => { setExpandedRefundId(null); setRefundReason(''); }}
                                              disabled={isRefunding}
                                              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-lg border border-slate-200 transition-colors disabled:opacity-50"
                                            >
                                              إلغاء
                                            </button>
                                            <button
                                              onClick={() => handleItemRefund(s.id, s.type)}
                                              disabled={isRefunding || !refundReason.trim()}
                                              className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:hover:bg-red-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5"
                                            >
                                              {isRefunding
                                                ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> جاري الاسترداد...</>
                                                : 'تأكيد الاسترداد'
                                              }
                                            </button>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Footer with Taffyot */}
                      <div className="flex items-center justify-between px-6 py-3.5 border-t border-sky-100 mt-auto bg-sky-50/40 print:bg-transparent">
                        <span className="text-xs font-bold text-sky-900">إجمالي فحوصات الأشعة:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-extrabold tabular-nums tracking-tight text-sky-700" dir="ltr">
                            {Math.round(radTotal).toLocaleString('en-US')}
                          </span>
                          <span className="text-[10px] font-bold text-sky-600">ر.ي</span>
                          {radTotal > 0 && (
                            <span className="text-xs font-bold mr-1.5 pr-2 border-r text-sky-700/70 border-sky-200/60">
                              {taffyot(radTotal).replace(/(ريالاً يمنياً|ريال يمني|فقط|لا غير|-)/g, '').trim()} ريال يمني.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* --- Section: Clinical Services Record (سجل الخدمات السريرية) --- */}
              {activeClinicalHistory.length > 0 && (
                <div className="bg-white rounded-2xl border border-teal-200/90 transition-all duration-200 overflow-hidden shadow-xs">
                  {/* Accordion Header Bar */}
                  <div
                    onClick={() => toggleSection('clinical')}
                    className="w-full flex items-center justify-between px-4 py-3 cursor-pointer select-none transition-colors bg-gradient-to-r from-teal-50/80 via-white to-teal-50/40 hover:from-teal-100/80 hover:via-teal-50/50 hover:to-teal-100/60"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-teal-100 text-teal-700 shadow-2xs border border-teal-200/70">
                        <Stethoscope size={16} />
                      </div>
                      <span className="text-sm font-black text-slate-800 tracking-tight">
                        سجل الخدمات السريرية
                      </span>
                      {/* Section Counter Badge */}
                      <span className="text-[11px] px-2.5 py-0.5 font-extrabold rounded-full border tabular-nums tracking-tight bg-teal-50 text-teal-800 border-teal-200/90 shadow-2xs">
                        {formatCountUnit(activeClinicalHistory.length, 'خدمة')}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Section subtotal */}
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold bg-teal-50/80 text-teal-700 border-teal-200/70 shadow-2xs">
                        <span className="text-slate-500 font-medium">إجمالي المبلغ:</span>
                        <span className="font-extrabold tabular-nums tracking-tight text-sm text-teal-700">
                          {Math.round(clinicalTotal).toLocaleString('en-US')}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                      </div>

                      <div className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-700 shadow-2xs">
                        <ChevronDown
                          size={16}
                          className={`transition-transform duration-200 ${openSections.clinical ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Accordion Body */}
                  {openSections.clinical && (
                    <div className="border-t border-slate-100 flex flex-col print:border-none print:shadow-none print:rounded-none">
                      <div className="w-full overflow-x-auto">
                        <table className="w-full text-right text-sm whitespace-nowrap">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-12 text-center">#</th>
                              <th className="px-5 py-3.5 text-xs font-bold text-slate-500 min-w-[250px]">الخدمة</th>
                              <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-44">الحالة</th>
                              <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-48">تاريخ الطلب</th>
                              <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-36">المبلغ</th>
                              {!readOnly && (
                                <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-32 text-center">إجراء</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-100">
                            {activeClinicalHistory.map((s, index) => {
                              const badge = STATUS_BADGE[s.status] || STATUS_BADGE['paid'];
                              const rowKey = `${s.id}_${s.type}`;
                              const effectiveAmount = (s.final_price !== null && s.final_price !== undefined)
                                ? parseFloat(s.final_price)
                                : (Number(s.is_free) === 1 ? 0 : parseFloat(s.price || 0));
                              const isFreeService = Number(s.is_free) === 1 || effectiveAmount <= 0;
                              const isExpanded = expandedRefundId === rowKey && !isFreeService;
                              const itemDate = s.requested_at || s.created_at;
                              const displayName = cleanFilmText(s.name);

                              return (
                                <React.Fragment key={'clin_' + index}>
                                  <tr className={`transition-colors ${isExpanded ? 'bg-red-50/40' : 'hover:bg-slate-50/50'}`}>
                                    <td className="px-5 py-4 font-black text-slate-400 text-center text-xs">{index + 1}</td>
                                    <td className="px-5 py-4 font-semibold text-slate-800 whitespace-pre-wrap break-words max-w-[250px]">
                                      <div className="flex items-center flex-wrap gap-2">
                                        <span className="font-bold text-slate-800 text-sm">{displayName}</span>
                                        {isFreeService && (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-50 text-amber-600 border border-amber-200/60 shadow-xs shrink-0">
                                            مجاني
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-5 py-4">
                                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${badge.color.split(' ').find(c => c.startsWith('text-')) || 'text-slate-600'}`}>
                                        {badge.pulse && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                                        {badge.label}
                                      </span>
                                    </td>
                                    <td className="px-5 py-4">
                                      <div className="flex flex-col">
                                        <span className="text-sm font-bold text-slate-700" dir="ltr">
                                          {itemDate ? new Date(itemDate).toLocaleDateString('en-GB') : '—'}
                                        </span>
                                        {itemDate && (
                                          <span className="text-[10px] font-bold text-slate-400" dir="ltr">
                                            {new Date(itemDate).toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit', hour12: true })}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-5 py-4">
                                      <div className="flex items-baseline gap-1 text-base font-extrabold tabular-nums tracking-tight text-slate-800">
                                        <span dir="ltr">{effectiveAmount.toLocaleString('en-US')}</span>
                                        <span className="text-[10px] text-slate-400 font-bold">ر.ي</span>
                                      </div>
                                      {effectiveAmount < parseFloat(s.price) && (
                                        <div className="text-[10px] text-slate-400 line-through font-semibold" dir="ltr">
                                          {parseFloat(s.price).toLocaleString('en-US')} ر.ي
                                        </div>
                                      )}
                                    </td>
                                    {!readOnly && (
                                      <td className="px-5 py-4 text-center">
                                        {isFreeService ? (
                                          <span className="text-slate-400 font-bold text-[9px] sm:text-[10px] block whitespace-nowrap text-center">
                                            لا يمكن الاسترداد (مجاني)
                                          </span>
                                        ) : s.status === 'paid' && !isVisitCancelled ? (
                                          <button
                                            onClick={() => {
                                              setExpandedRefundId(isExpanded ? null : rowKey);
                                              setRefundReason('');
                                            }}
                                            className={`font-bold text-xs px-3 py-1.5 rounded-lg border transition-colors ${isExpanded ? 'bg-red-100 text-red-700 border-red-300' : 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'}`}
                                          >
                                            {isExpanded ? 'إلغاء' : 'استرداد'}
                                          </button>
                                        ) : (s.status === 'in_progress' || s.status === 'completed' || s.status === 'result_uploaded') ? (
                                          <span className="text-slate-400 font-bold text-[9px] sm:text-[10px] block whitespace-nowrap text-center">
                                            لا يمكن الاسترداد ({s.status === 'in_progress' ? 'قيد التنفيذ' : 'مكتمل'})
                                          </span>
                                        ) : null}
                                      </td>
                                    )}
                                  </tr>

                                  {/* ── Inline Refund Expansion Row ── */}
                                  {!readOnly && isExpanded && (
                                    <tr className="bg-red-50/60 border-t border-red-100">
                                      <td colSpan={6} className="px-5 py-4">
                                        <div className="flex flex-col gap-3">
                                          <p className="text-xs font-bold text-red-700 flex items-center flex-wrap gap-1">
                                            <span>استرداد:</span>
                                            <span className="text-slate-700">{displayName}</span>
                                            <span className="text-slate-600 font-bold mr-1" dir="ltr">
                                              ({parseFloat(s.final_price ?? s.price).toLocaleString('en-US')} ر.ي)
                                            </span>
                                          </p>
                                          <textarea
                                            value={refundReason}
                                            onChange={(e) => {
                                              setRefundReason(e.target.value);
                                              e.target.style.height = 'auto';
                                              e.target.style.height = e.target.scrollHeight + 'px';
                                            }}
                                            rows={2}
                                            className="w-full bg-white border border-red-200 focus:border-red-400 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-300 transition-all resize-none overflow-hidden"
                                            placeholder="اكتب سبب الاسترداد (إلزامي)..."
                                            style={{ minHeight: '2.75rem' }}
                                            autoFocus
                                          />
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={() => { setExpandedRefundId(null); setRefundReason(''); }}
                                              disabled={isRefunding}
                                              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-lg border border-slate-200 transition-colors disabled:opacity-50"
                                            >
                                              إلغاء
                                            </button>
                                            <button
                                              onClick={() => handleItemRefund(s.id, s.type)}
                                              disabled={isRefunding || !refundReason.trim()}
                                              className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:hover:bg-red-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5"
                                            >
                                              {isRefunding
                                                ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> جاري الاسترداد...</>
                                                : 'تأكيد الاسترداد'
                                              }
                                            </button>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Footer with Taffyot */}
                      <div className="flex items-center justify-between px-6 py-3.5 border-t border-teal-100 mt-auto bg-teal-50/40 print:bg-transparent">
                        <span className="text-xs font-bold text-teal-900">إجمالي الخدمات السريرية:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-extrabold tabular-nums tracking-tight text-teal-700" dir="ltr">
                            {Math.round(clinicalTotal).toLocaleString('en-US')}
                          </span>
                          <span className="text-[10px] font-bold text-teal-600">ر.ي</span>
                          {clinicalTotal > 0 && (
                            <span className="text-xs font-bold mr-1.5 pr-2 border-r text-teal-700/70 border-teal-200/60">
                              {taffyot(clinicalTotal).replace(/(ريالاً يمنياً|ريال يمني|فقط|لا غير|-)/g, '').trim()} ريال يمني.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* --- Section: Surgeries Record & Integrated Payments (سجل العمليات الجراحية وحركات السداد المدمجة - قبل قسم المستردات) --- */}
              {(filteredSurgeries.length > 0 || surgeryPayments.length > 0) && (
                <div className="bg-white rounded-2xl border border-indigo-200/90 transition-all duration-200 overflow-hidden shadow-xs">
                  {/* Accordion Header Bar */}
                  <div 
                    onClick={() => toggleSection('surgeries')}
                    className="w-full flex items-center justify-between px-4 py-3.5 cursor-pointer select-none transition-colors bg-gradient-to-r from-indigo-50/80 via-white to-indigo-50/40 hover:from-indigo-100/80 hover:via-indigo-50/50 hover:to-indigo-100/60"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700 shadow-2xs border border-indigo-200/70">
                        <Scissors size={16} />
                      </div>
                      <span className="text-sm font-black text-slate-800 tracking-tight">
                        سجل العمليات الجراحية
                      </span>
                      <span className="text-[11px] px-2.5 py-0.5 font-extrabold rounded-full border tabular-nums tracking-tight bg-indigo-50 text-indigo-800 border-indigo-200/90 shadow-2xs">
                        {formatCountUnit(filteredSurgeries.length, 'عملية')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                      {/* Total Surgeries Fees & Paid Badges */}
                      {(() => {
                        const totalSurgeriesFees = filteredSurgeries.reduce((acc, s) => {
                          const net = parseFloat(s.full_price || 0) - parseFloat(s.discount_amount || 0);
                          return acc + (net > 0 ? net : 0);
                        }, 0);
                        const totalSurgeriesRemaining = filteredSurgeries.reduce((acc, s) => {
                          const net = parseFloat(s.full_price || 0) - parseFloat(s.discount_amount || 0);
                          const paid = parseFloat(s.paid_amount || 0);
                          return acc + Math.max(0, net - paid);
                        }, 0);
                        const isAllSurgeriesPaid = filteredSurgeries.length > 0 && totalSurgeriesRemaining <= 0;

                        return (
                          <>
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold bg-indigo-50/80 text-indigo-700 border-indigo-200/70 shadow-2xs">
                              <span className="text-slate-500 font-medium">إجمالي الرسوم:</span>
                              <span className="font-extrabold tabular-nums tracking-tight text-sm text-indigo-700">
                                {Math.round(totalSurgeriesFees).toLocaleString('en-US')}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                            </div>

                            {/* Total Paid Badge - only displayed if not fully paid */}
                            {!isAllSurgeriesPaid && (
                              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold bg-emerald-50/80 text-emerald-700 border-emerald-200/70 shadow-2xs">
                                <span className="text-slate-500 font-medium">إجمالي المسدد:</span>
                                <span className="font-extrabold tabular-nums tracking-tight text-sm text-emerald-700">
                                  {Math.round(surgeryPaymentsTotal).toLocaleString('en-US')}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                              </div>
                            )}
                          </>
                        );
                      })()}

                      {/* Accordion Toggle Chevron */}
                      <div className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-700 shadow-2xs">
                        <ChevronDown
                          size={16}
                          className={`transition-transform duration-200 ${openSections.surgeries ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Accordion Body - Surgery Cards */}
                  {openSections.surgeries && (
                    <div className="p-4 sm:p-5 flex flex-col gap-5 bg-slate-50/40 border-t border-indigo-100/80">
                      {filteredSurgeries.map((surgery, sIdx) => {
                        const netPrice = parseFloat(surgery.full_price || 0) - parseFloat(surgery.discount_amount || 0);
                        const paid = parseFloat(surgery.paid_amount || 0);
                        const remaining = Math.max(0, netPrice - paid);
                        const progressPct = netPrice > 0 ? Math.min(100, Math.max(0, (paid / netPrice) * 100)) : 0;
                        const discountAmount = parseFloat(surgery.discount_amount || 0);
                        const isFullyPaid = remaining <= 0;

                        // Find related payments for this specific surgery
                        const surgerySpecificPayments = paymentsWithRefundStatus.filter(t => 
                          (t.surgery_id && String(t.surgery_id) === String(surgery.surgery_id)) ||
                          (t.category === 'surgery_payment' && t.visit_id && String(t.visit_id) === String(surgery.visit_id))
                        );

                        return (
                          <div 
                            key={surgery.surgery_id || sIdx} 
                            className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-indigo-300 transition-all overflow-hidden flex flex-col"
                          >
                            {/* ── 1. Card Top Header: Icon + Surgery Name + Plain Date (Right) & Status / Action Button (Left) ── */}
                            <div className="px-5 py-3.5 bg-gradient-to-r from-slate-50 via-indigo-50/20 to-slate-50 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-3 flex-wrap">
                                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200/70 flex items-center justify-center shrink-0 shadow-2xs">
                                  <Scissors size={18} strokeWidth={2.2} />
                                </div>
                                <div className="flex items-center gap-2.5 flex-wrap">
                                  <h3 className="font-black text-slate-800 text-sm sm:text-base leading-tight">
                                    {surgery.surgery_type || 'عملية جراحية'}
                                  </h3>
                                  <span className="text-xs text-slate-400 font-bold">•</span>
                                  <span className="text-xs text-slate-500 font-medium">
                                    التاريخ: <span className="font-semibold text-slate-700" dir="ltr">{surgery.scheduled_date ? new Date(surgery.scheduled_date).toLocaleDateString('en-GB') : new Date(surgery.created_at).toLocaleDateString('en-GB')}</span>
                                  </span>
                                  {discountAmount > 0 && (
                                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                      خصم: {discountAmount.toLocaleString('en-US')} ر.ي
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Left Side: Status Capsule or Action Button */}
                              {isFullyPaid ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                                  <CheckCircle2 size={13} className="text-emerald-600" />
                                  تم السداد بالكامل (100%)
                                </span>
                              ) : remaining > 0 && !isVisitCancelled && !readOnly && typeof onOpenCheckout === 'function' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const surgeryVisit = recordData?.visits?.find(v => v.id === surgery.visit_id);
                                    onOpenCheckout({ 
                                      ...surgery, 
                                      id: surgery.surgery_id, 
                                      is_surgery: true, 
                                      visit_number: surgeryVisit?.visit_number 
                                    });
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold shadow-2xs transition-all shrink-0 cursor-pointer"
                                >
                                  <Wallet size={13} />
                                  <span>دفع الرسوم</span>
                                </button>
                              ) : remaining > 0 ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
                                  <Clock size={13} className="text-amber-600" />
                                  متبقي: {Math.round(remaining).toLocaleString('en-US')} ر.ي
                                </span>
                              ) : null}
                            </div>

                            {/* ── 2. Financial Metrics: Compact Paid & Remaining Cards (Only shown if NOT fully paid) ── */}
                            {!isFullyPaid && (
                              <div className="p-3.5 sm:p-4 border-b border-slate-100 bg-white">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {/* Paid Amount Card */}
                                  <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-emerald-50/50 border border-emerald-200/70">
                                    <div className="flex items-center gap-2">
                                      <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                                        <CheckCircle2 size={15} />
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs font-bold text-slate-700">المبلغ المسدد</span>
                                        <span className="text-xs font-extrabold text-emerald-700 tabular-nums">
                                          ({progressPct.toFixed(0)}%)
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-baseline gap-1">
                                      <span className="text-base font-black text-emerald-700 tracking-tight" dir="ltr">
                                        {paid.toLocaleString('en-US')}
                                      </span>
                                      <span className="text-[10px] font-bold text-emerald-600/70">ر.ي</span>
                                    </div>
                                  </div>

                                  {/* Remaining Amount Card */}
                                  <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border bg-rose-50/50 border-rose-200/70 text-rose-700">
                                    <div className="flex items-center gap-2">
                                      <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                                        <Clock size={15} />
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs font-bold text-slate-700">المبلغ المتبقي</span>
                                        <span className="text-xs font-extrabold tabular-nums text-rose-600">
                                          ({(100 - progressPct).toFixed(0)}%)
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-baseline gap-1">
                                      <span className="text-base font-black text-rose-600 tracking-tight" dir="ltr">
                                        {remaining.toLocaleString('en-US')}
                                      </span>
                                      <span className="text-[10px] font-bold text-rose-500/70">ر.ي</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* ── 3. Embedded Payment Movements Table for this Surgery (No Cashier Column) ── */}
                            <div className="p-4 sm:p-5 bg-slate-50/50 flex flex-col gap-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-slate-700">
                                    حركات وسندات السداد المسجلة لهذه العملية
                                  </span>
                                  <span className="text-[10px] font-black bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                                    {formatCountUnit(surgerySpecificPayments.filter(t => !t.isRefunded).length, 'دفعة')}
                                  </span>
                                </div>
                                {surgerySpecificPayments.length > 0 && (
                                  <span className="text-xs font-bold text-slate-500">
                                    إجمالي المدفوع: <span className="font-extrabold text-slate-800" dir="ltr">{paid.toLocaleString('en-US')}</span> ر.ي
                                  </span>
                                )}
                              </div>

                              {surgerySpecificPayments.length === 0 ? (
                                <div className="py-5 px-4 bg-white rounded-xl border border-dashed border-slate-200 text-center">
                                  <Clock size={20} className="text-slate-400 mx-auto mb-1.5" />
                                  <p className="text-xs font-bold text-slate-500">
                                    لم تسجل أي دفعات سداد نقدية أو بنكية لهذه العملية حتى الآن — بانتظار سداد الرسوم.
                                  </p>
                                </div>
                              ) : (
                                <div className="overflow-x-auto border border-slate-200/80 rounded-xl bg-white shadow-2xs">
                                  <table className="w-full text-right text-xs whitespace-nowrap table-fixed">
                                    <thead className="bg-slate-50 border-b border-slate-200/80">
                                      <tr>
                                        <th className="px-4 py-3 font-bold text-slate-500 w-[6%] text-center">#</th>
                                        <th className="px-4 py-3 font-bold text-slate-500 w-[42%] text-right">بيان الدفعة / السند</th>
                                        <th className="px-4 py-3 font-bold text-slate-500 w-[18%] text-right">طريقة الدفع</th>
                                        <th className="px-4 py-3 font-bold text-slate-500 w-[20%] text-right">التاريخ والوقت</th>
                                        <th className="px-4 py-3 font-bold text-slate-500 w-[14%] text-right">المبلغ المدفوع</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {surgerySpecificPayments.map((t, pIdx) => {
                                        const parsed = getServiceName(t, recordData);
                                        const isRefunded = Boolean(t.isRefunded);

                                        return (
                                          <tr 
                                            key={t.id || pIdx}
                                            className={`transition-colors ${
                                              isRefunded ? 'opacity-50 bg-slate-50/50 hover:bg-slate-100/60' : 'hover:bg-slate-50/60'
                                            }`}
                                          >
                                            <td className="px-4 py-3 text-center font-black text-slate-400 font-mono text-xs">
                                              {pIdx + 1}
                                            </td>
                                            <td className="px-4 py-3 font-bold text-slate-800 whitespace-pre-wrap break-words max-w-[240px]">
                                              <div className="flex flex-col gap-0.5">
                                                <span>{parsed.serviceName || t.description || 'سداد دفعة عملية'}</span>
                                                {isRefunded && t.refundReason && t.refundReason !== '—' && (
                                                  <span className="text-[10px] text-rose-600 font-bold">
                                                    مسترد: {t.refundReason}
                                                  </span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="px-4 py-3">
                                              <div className="flex items-center gap-1.5 font-bold text-slate-700">
                                                {t.payment_method === 'bank_transfer' ? (
                                                  <>
                                                    <CreditCard size={13} className="text-sky-600" />
                                                    <span>تحويل بنكي</span>
                                                  </>
                                                ) : (
                                                  <>
                                                    <Wallet size={13} className="text-emerald-600" />
                                                    <span>نقداً</span>
                                                  </>
                                                )}
                                              </div>
                                            </td>
                                            <td className="px-4 py-3 font-medium text-slate-600">
                                              <div className="flex flex-col">
                                                <span className="font-bold text-slate-700" dir="ltr">
                                                  {new Date(t.created_at).toLocaleDateString('en-GB')}
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-medium" dir="ltr">
                                                  {new Date(t.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                </span>
                                              </div>
                                            </td>
                                            <td className="px-4 py-3 font-extrabold tabular-nums tracking-tight text-indigo-700 text-sm">
                                              <span dir="ltr">{parseFloat(t.amount).toLocaleString('en-US')}</span>
                                              <span className="text-[10px] font-bold text-slate-400 mr-1">ر.ي</span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* --- Section: Refunds (المستردات - آخر قسم في النافذة) --- */}
              {refundsList.length > 0 && (
                <div className="bg-white rounded-2xl border border-rose-200/90 transition-all duration-200 overflow-hidden shadow-xs">
                  {/* Accordion Header Bar */}
                  <div
                    onClick={() => toggleSection('refunds')}
                    className="w-full flex items-center justify-between px-4 py-3 cursor-pointer select-none transition-colors bg-gradient-to-r from-rose-50/80 via-white to-rose-50/40 hover:from-rose-100/80 hover:via-rose-50/50 hover:to-rose-100/60"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-rose-100 text-rose-700 shadow-2xs">
                        <RotateCcw size={16} />
                      </div>
                      <span className="text-sm font-black text-slate-800 tracking-tight">
                        المستردات
                      </span>
                      {/* Section Counter Badge */}
                      <span className="text-[11px] px-2.5 py-0.5 font-extrabold rounded-full border tabular-nums tracking-tight bg-rose-50 text-rose-800 border-rose-200/90 shadow-2xs">
                        {formatCountUnit(refundsList.length, 'مسترد')}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Section subtotal (Always visible on header) */}
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold bg-rose-50/80 text-rose-700 border-rose-200/70 shadow-2xs">
                        <span className="text-slate-500 font-medium">إجمالي المبلغ:</span>
                        <span className="font-extrabold tabular-nums tracking-tight text-sm text-rose-700">
                          {totalRefundAmount.toLocaleString('en-US')}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                      </div>

                      <div className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-700 shadow-2xs">
                        <ChevronDown
                          size={16}
                          className={`transition-transform duration-200 ${openSections.refunds ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Accordion Body */}
                  {openSections.refunds && (
                    <div className="border-t border-rose-100 flex flex-col print:border-none print:shadow-none print:rounded-none">
                    <div className="w-full overflow-x-auto">
                      <table className="w-full text-right text-sm whitespace-nowrap table-fixed">
                        <thead className="bg-rose-50/50 border-b border-rose-100 print:bg-transparent print:border-slate-800">
                          <tr>
                            <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[5%] text-center">#</th>
                            <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[35%] text-right">الخدمة المستردة</th>
                            <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[13%] text-right">القسم</th>
                            <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[15%] text-right">طريقة الدفع</th>
                            <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[17%] text-right">تاريخ الاسترداد</th>
                            <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[15%] text-right">المبلغ المسترد</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-rose-50/60 print:divide-slate-200">
                          {refundsList.map((r, index) => (
                            <tr key={r.id || index} className="hover:bg-rose-50/30 transition-colors">
                              {/* 0. الرقم */}
                              <td className="px-5 py-3 font-black text-slate-400 text-center text-xs align-middle">
                                {index + 1}
                              </td>
                              {/* 1. الخدمة المستردة */}
                              <td className="px-5 py-3 font-semibold text-slate-800 align-middle whitespace-pre-wrap break-words max-w-[250px]">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center flex-wrap gap-1.5">
                                    <span className="font-bold text-slate-800 text-sm">{r.name}</span>
                                    {r.isWithoutFilm && (
                                      <span className="text-xs font-semibold text-slate-500 shrink-0">
                                        (بدون فيلم)
                                      </span>
                                    )}
                                  </div>
                                  {r.refundReason && r.refundReason !== '—' && (
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 w-fit">
                                      <span className="text-slate-400 font-medium">السبب:</span>
                                      <span>{r.refundReason}</span>
                                    </div>
                                  )}
                                </div>
                              </td>
                              {/* 2. القسم */}
                              <td className="px-5 py-3 align-middle">
                                {renderDepartmentBadge(r.category)}
                              </td>
                              {/* 3. طريقة الدفع */}
                              <td className="px-5 py-3 align-middle">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                  {r.paymentMethod === 'bank_transfer' ? (
                                    <>
                                      <CreditCard size={14} className="text-sky-600" />
                                      <span>تحويل بنكي</span>
                                    </>
                                  ) : (
                                    <>
                                      <Wallet size={14} className="text-emerald-600" />
                                      <span>نقداً</span>
                                    </>
                                  )}
                                </div>
                              </td>
                              {/* 4. تاريخ الاسترداد */}
                              <td className="px-5 py-3 align-middle">
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-slate-700" dir="ltr">
                                    {new Date(r.createdAt || Date.now()).toLocaleDateString('en-GB')}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-400" dir="ltr">
                                    {new Date(r.createdAt || Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                  </span>
                                </div>
                              </td>
                              {/* 5. المبلغ المسترد */}
                              <td className="px-5 py-3 align-middle">
                                <div className="flex items-center gap-1">
                                  <span className="text-base font-extrabold tabular-nums tracking-tight text-rose-600" dir="ltr">
                                    {parseFloat(r.amount || 0).toLocaleString('en-US')}
                                  </span>
                                  <span className="text-[10px] font-bold text-rose-400">
                                    ر.ي
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Refunds Footer with Taffyot */}
                    {(() => {
                      const totalRefunds = refundsList.reduce((acc, r) => acc + parseFloat(r.amount || 0), 0);
                      return (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-rose-100 mt-auto bg-rose-50/50 print:bg-transparent print:border-slate-800 print:border-t-2">
                          <span className="text-xs font-bold text-rose-800">إجمالي المبالغ المستردة:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-base font-extrabold tabular-nums tracking-tight text-rose-700" dir="ltr">
                              {totalRefunds.toLocaleString('en-US')}
                            </span>
                            <span className="text-[10px] font-bold text-rose-600">ر.ي</span>
                            {totalRefunds > 0 && (
                              <span className="text-xs font-bold mr-1.5 pr-2 border-r text-rose-700/70 border-rose-200/60">
                                {taffyot(totalRefunds).replace(/(ريالاً يمنياً|ريال يمني|فقط|لا غير|-)/g, '').trim()} ريال يمني.
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    </div>
                  )}
                </div>
              )}


            </div>
          )}
        </div>
      </div>
    </div>
  );

  

  return createPortal(
    <>
      {modalContent}
      {showInvoicePrintModal && (
        <InvoicePrintModal
          isOpen={showInvoicePrintModal}
          onClose={() => setShowInvoicePrintModal(false)}
          patient={recordData?.patient}
          visit={activeVisit || latestVisit}
          transactions={paymentsWithRefundStatus}
          recordData={recordData}
        />
      )}
    </>,
    document.body
  );

};

export default FinancialRecordModal;
