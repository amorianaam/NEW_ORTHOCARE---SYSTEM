import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Printer, Maximize2, Minimize2, X, Layers, Calendar, User, Phone, CheckSquare, Square, Wallet, CreditCard, Check, Trash2, AlertCircle, History, Scissors, CheckCircle2, Clock, Receipt, TrendingUp, Sparkles, Activity, Plus, Minus, Crown, RotateCcw, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';
import taffyot from '../../../utils/taffyot';
import { toast } from 'react-toastify';
import useSocketStore from '../../../store/useSocketStore';

const buildLineItems = (invoice, settings, mode) => {
  const items = [];
  if (!invoice) return items;

  // 1. Entry Fee
  const isEntryUnpaid = invoice.visit && (
    invoice.visit.status === 'registered' || 
    !invoice.visit.entry_fee || 
    parseFloat(invoice.visit.entry_fee) === 0
  );

  if (invoice.visit && isEntryUnpaid && mode !== 'services') {
    const entryFeeAmount = parseFloat(settings?.entry_fee || 0);
    if (entryFeeAmount > 0) {
      items.push({
        id: 'entry_fee',
        type: 'entry_fee',
        name: 'رسوم المعاينة',
        department: 'الاستقبال',
        amount: entryFeeAmount,
        status: 'pending'
      });
    }
  }

  // 2. Labs
  if (invoice.labRequests && mode !== 'entry') {
    invoice.labRequests.forEach(r => {
      if (r.status === 'pending_payment') {
        items.push({
          id: `lab_${r.id}`,
          realId: r.id,
          type: 'lab',
          name: r.name,
          department: 'المختبر',
          amount: parseFloat(r.final_price || r.price || 0),
          basePrice: parseFloat(r.price || 0),
          discountAmount: parseFloat(r.discount_amount || 0),
          discountPct: parseFloat(r.discount_percentage || 0),
          isFree: r.is_free == 1,
          hasDiscount: parseFloat(r.discount_amount || 0) > 0 || parseFloat(r.discount_percentage || 0) > 0,
          status: 'pending'
        });
      }
    });
  }

  // 3. Radiology
  if (invoice.radiologyRequests && mode !== 'entry') {
    invoice.radiologyRequests.forEach(r => {
      if (r.status === 'pending_payment') {
        const priceWith = parseFloat(r.price_with_film || 0);
        const priceWithout = parseFloat(r.price_without_film || 0);
        const withFilm = r.with_film == 1 || r.with_film === true;
        const baseAmt = withFilm ? priceWith : priceWithout;
        const discountPct = parseFloat(r.discount_percentage || 0);
        let discountAmt = parseFloat(r.discount_amount || 0);
        const isFree = r.is_free == 1;
        let finalAmt = baseAmt;

        if (isFree) {
          finalAmt = 0;
          discountAmt = baseAmt;
        } else if (discountPct > 0) {
          discountAmt = (baseAmt * discountPct) / 100;
          finalAmt = Math.max(0, baseAmt - discountAmt);
        } else if (discountAmt > 0) {
          discountAmt = Math.min(baseAmt, discountAmt);
          finalAmt = Math.max(0, baseAmt - discountAmt);
        } else if (r.final_price !== undefined && r.final_price !== null && withFilm) {
          finalAmt = parseFloat(r.final_price);
        }

        items.push({
          id: `rad_${r.id}`,
          realId: r.id,
          type: 'radiology',
          name: r.name,
          department: 'الأشعة',
          withFilm: withFilm,
          price_with_film: priceWith,
          price_without_film: priceWithout,
          amount: finalAmt,
          basePrice: baseAmt,
          discountAmount: discountAmt,
          discountPct: discountPct,
          isFree: isFree,
          hasDiscount: discountAmt > 0 || discountPct > 0,
          status: 'pending'
        });
      }
    });
  }

  // 4. Clinical Services
  if (invoice.clinicalRequests && mode !== 'entry') {
    invoice.clinicalRequests.forEach(r => {
      if (r.status === 'pending_payment') {
        const finalAmt = parseFloat(r.final_price || r.price || 0);
        items.push({
          id: `clin_${r.id}`,
          realId: r.id,
          type: 'clinical',
          name: r.name,
          department: 'العيادة الطبية',
          amount: finalAmt,
          basePrice: parseFloat(r.price || 0),
          discountAmount: parseFloat(r.discount_amount || 0),
          discountPct: parseFloat(r.discount_percentage || 0),
          isFree: r.is_free == 1,
          hasDiscount: parseFloat(r.discount_amount || 0) > 0 || parseFloat(r.discount_percentage || 0) > 0,
          status: 'pending'
        });
      }
    });
  }

  return items;
};

const UnifiedPaymentModal = ({ visitId, visitData, token, onClose, onPaid, onOpenLedger, mode = 'both' }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lineItems, setLineItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' or 'bank_transfer'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancelConfirmId, setCancelConfirmId] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [surgeryInstallment, setSurgeryInstallment] = useState('');
  const [surgeryPayments, setSurgeryPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [isSurgeryRecordOpen, setIsSurgeryRecordOpen] = useState(true);

  const displayDate = visitData?.created_at || Date.now();
  const modalTitle = `فاتورة الدفع - (${visitData?.full_name || '...'})`;

  const modalMountTime = useRef(Date.now());
  const latestCashierUpdate = useSocketStore(state => state.latestCashierUpdate);

  useEffect(() => {
    let isMounted = true;
    
    if (mode === 'surgery') {
      setLoading(false);
      setLoadingPayments(true);
      fetch(`/api/cashier/surgery/${visitId}/payments`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (isMounted) {
          setSurgeryPayments(Array.isArray(data) ? data : []);
          setLoadingPayments(false);
        }
      })
      .catch(err => {
        console.error('Failed to fetch surgery payments', err);
        if (isMounted) setLoadingPayments(false);
      });

      return () => { isMounted = false; };
    }

    setLoading(true);
    
    Promise.all([
      fetch('/api/settings', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : {}),
      fetch(`/api/cashier/visit/${visitId}/invoice`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null)
    ])
    .then(([settings, invoice]) => {
      if (!isMounted) return;
      if (!invoice) {
        setError(true);
        setLoading(false);
        return;
      }
      
      const items = buildLineItems(invoice, settings, mode);
      const defaultSelected = new Set(items.map(i => i.id));
      
      setLineItems(items);
      setSelectedItems(defaultSelected);
      setLoading(false);
    })
    .catch(() => {
      if (isMounted) {
        setError(true);
        setLoading(false);
      }
    });
    
    return () => { isMounted = false; };
  }, [visitId, token, mode]);

  // Non-destructive silent sync when latestCashierUpdate fires
  const silentSyncInvoice = useCallback(async () => {
    if (!visitId || !token) return;

    if (mode === 'surgery') {
      try {
        const res = await fetch(`/api/cashier/surgery/${visitId}/payments`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSurgeryPayments(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Failed to silent sync surgery payments', err);
      }
      return;
    }

    try {
      const [settingsRes, invoiceRes] = await Promise.all([
        fetch('/api/settings', { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/cashier/visit/${visitId}/invoice`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (!invoiceRes.ok) return;
      const settings = settingsRes.ok ? await settingsRes.json() : {};
      const invoice = await invoiceRes.json();
      if (!invoice) return;

      const freshItems = buildLineItems(invoice, settings, mode);

      setLineItems(prevItems => {
        const existingMap = new Map(prevItems.map(i => [i.id, i]));
        let hasNew = false;

        const merged = freshItems.map(fresh => {
          const existing = existingMap.get(fresh.id);
          if (existing) {
            return {
              ...fresh,
              withFilm: existing.withFilm,
              amount: existing.withFilm !== undefined
                ? (existing.withFilm ? fresh.price_with_film : fresh.price_without_film)
                : existing.amount,
              discountAmount: existing.discountAmount,
              discountPct: existing.discountPct,
              hasDiscount: existing.hasDiscount
            };
          }
          hasNew = true;
          return fresh;
        });

        setSelectedItems(prevSelected => {
          const nextSelected = new Set(prevSelected);
          freshItems.forEach(f => {
            if (!existingMap.has(f.id)) {
              nextSelected.add(f.id);
            }
          });
          return nextSelected;
        });

        if (hasNew) {
          toast.info('تم تحديث الفاتورة تلقائياً بإضافة خدمات جديدة من الطبيب', { autoClose: 3500 });
        }

        return merged;
      });
    } catch (err) {
      console.error('Silent invoice sync error:', err);
    }
  }, [visitId, token, mode]);

  useEffect(() => {
    if (latestCashierUpdate?.timestamp && latestCashierUpdate.timestamp > modalMountTime.current) {
      silentSyncInvoice();
    }
  }, [latestCashierUpdate, silentSyncInvoice]);

  const toggleItem = (id) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFilm = (e, itemId) => {
    e.stopPropagation();
    setLineItems(prev => prev.map(item => {
      if (item.id === itemId && item.type === 'radiology') {
        const newWithFilm = !item.withFilm;
        const basePrice = parseFloat(newWithFilm ? item.price_with_film : item.price_without_film) || 0;
        let newAmount = basePrice;
        let newDiscountAmount = 0;

        if (item.isFree) {
          newAmount = 0;
          newDiscountAmount = basePrice;
        } else if (item.discountPct > 0) {
          newDiscountAmount = (basePrice * item.discountPct) / 100;
          newAmount = Math.max(0, basePrice - newDiscountAmount);
        } else if (item.discountAmount > 0) {
          newDiscountAmount = Math.min(basePrice, item.discountAmount);
          newAmount = Math.max(0, basePrice - newDiscountAmount);
        }

        return {
          ...item,
          withFilm: newWithFilm,
          basePrice: basePrice,
          discountAmount: newDiscountAmount,
          amount: newAmount
        };
      }
      return item;
    }));
  };
  
  

  const handleCancelService = async (item) => {
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/cashier/service/${item.type}/${item.realId}/cancel`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      
      setLineItems(prev => prev.filter(i => i.id !== item.id));
      setSelectedItems(prev => {
        const s = new Set(prev);
        s.delete(item.id);
        return s;
      });
      setCancelConfirmId(null);
      toast.success('تم إلغاء الخدمة بنجاح');
    } catch {
      toast.error('حدث خطأ أثناء إلغاء الخدمة');
    } finally {
      setIsCancelling(false);
    }
  };
  
  const toggleAll = () => {
    if (selectedItems.size === lineItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(lineItems.map(i => i.id)));
    }
  };

  const subtotal = useMemo(() => {
    if (mode === 'surgery') return parseFloat(surgeryInstallment) || 0;
    return lineItems.reduce((sum, item) => {
      if (selectedItems.has(item.id)) return sum + item.amount;
      return sum;
    }, 0);
  }, [lineItems, selectedItems, mode, surgeryInstallment]);

  const handleUnifiedPayment = async () => {
    if (mode === 'surgery') {
      if (!surgeryInstallment || isNaN(surgeryInstallment) || surgeryInstallment <= 0) {
        toast.warning('يرجى إدخال مبلغ الدفعة بشكل صحيح');
        return;
      }
      setIsSubmitting(true);
      try {
        const res = await fetch(`/api/cashier/surgery/${visitId}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ amount: surgeryInstallment, payment_method: paymentMethod })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.message || 'فشل تسديد الدفعة');
        toast.success('تم تسديد الدفعة الجراحية بنجاح');
        if (onPaid) onPaid();
        if (onClose) onClose();
      } catch (err) {
        toast.error(err.message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (selectedItems.size === 0) {
      toast.warning('يرجى تحديد بند واحد على الأقل للدفع');
      return;
    }
    
    setIsSubmitting(true);
    const apiCalls = [];
    const callNames = [];

    // 1. Entry Fee Check
    const entryItem = lineItems.find(i => i.type === 'entry_fee' && selectedItems.has(i.id));
    if (entryItem) {
      apiCalls.push(
        fetch(`/api/cashier/visit/${visitId}/pay-entry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ amount: entryItem.amount, discountAmount: 0, discountReason: '', payment_method: paymentMethod })
        }).then(async r => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.message || 'فشل تحصيل رسوم المعاينة');
          return d;
        })
      );
      callNames.push('رسوم المعاينة');
    }

    // 2. Services Check
    const labIds = lineItems.filter(i => i.type === 'lab' && selectedItems.has(i.id)).map(i => i.realId);
    const radItems = lineItems.filter(i => i.type === 'radiology' && selectedItems.has(i.id)).map(i => ({ id: i.realId, withFilm: i.withFilm || false }));
    const clinicalIds = lineItems.filter(i => i.type === 'clinical' && selectedItems.has(i.id)).map(i => i.realId);
    
    if (labIds.length > 0 || radItems.length > 0 || clinicalIds.length > 0) {
      apiCalls.push(
        fetch(`/api/cashier/visit/${visitId}/pay-services`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ labIds, radiologyItems: radItems, clinicalIds, discount: { amount: 0, reason: '' }, payment_method: paymentMethod })
        }).then(async r => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.message || 'فشل تحصيل الخدمات');
          return d;
        })
      );
      callNames.push('الخدمات الطبية والسريرية');
    }

    if (apiCalls.length === 0) {
      setIsSubmitting(false);
      return;
    }

    try {
      const results = await Promise.allSettled(apiCalls);
      const errors = [];
      const successes = [];

      results.forEach((res, idx) => {
        if (res.status === 'rejected') {
          errors.push(`${callNames[idx]}: ${res.reason.message || res.reason}`);
        } else {
          successes.push(callNames[idx]);
        }
      });

      if (errors.length > 0) {
        if (successes.length > 0) {
          toast.warning(`تم تحصيل ${successes.join(' و ')}، لكن فشل: ${errors.join('، ')}`);
          onPaid && onPaid();
          window.dispatchEvent(new Event('cashier_update'));
        } else {
          toast.error(`فشلت عملية الدفع: ${errors.join('، ')}`);
        }
      } else {
        toast.success('تم تحصيل جميع المستحقات بنجاح');
        onPaid && onPaid();
        window.dispatchEvent(new Event('cashier_update'));
        onClose();
      }
    } catch (e) {
      toast.error('حدث خطأ أثناء معالجة الطلب');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Surgery calculations & helpers
  const fullPrice = parseFloat(visitData?.full_price || 0);
  const discountAmount = parseFloat(visitData?.discount_amount || 0);
  const netPrice = Math.max(0, fullPrice - discountAmount);
  const paymentsSum = surgeryPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const paidAmount = surgeryPayments.length > 0 ? paymentsSum : parseFloat(visitData?.paid_amount || 0);
  const remainingAmount = Math.max(0, netPrice - paidAmount);
  const progressPercent = netPrice > 0 ? Math.min(100, Math.round((paidAmount / netPrice) * 100)) : 0;
  const hasPartialPayment = paidAmount > 0;
  const latestPayment = surgeryPayments && surgeryPayments.length > 0 ? surgeryPayments[0] : null;

  const formatDateTime = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const dateFormatted = d.toLocaleDateString('en-GB');
    const timeFormatted = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${dateFormatted} - ${timeFormatted}`;
  };

  const formatPaymentsCount = (count) => {
    if (!count || count <= 0) return '0 دفعة';
    if (count === 1) return 'دفعة واحدة';
    if (count === 2) return 'دفعتان';
    if (count >= 3 && count <= 10) return `${count} دفعات`;
    return `${count} دفعة`;
  };

  const isExempt = Boolean(
    visitData?.is_exempt === 1 || 
    visitData?.is_exempt === true || 
    visitData?.is_exempted === 1 || 
    visitData?.is_exempted === true
  );

  const isFollowUp = Boolean(
    visitData?.is_follow_up === 1 || 
    visitData?.is_follow_up === true
  );

  const isSurgery = Boolean(
    mode === 'surgery' ||
    visitData?.is_surgery === 1 ||
    visitData?.is_surgery === true ||
    visitData?.has_surgery === 1 ||
    visitData?.has_surgery === true ||
    visitData?.has_surgeries === 1 ||
    visitData?.has_surgeries === true ||
    visitData?.status === 'transferred_to_center' ||
    (Array.isArray(visitData?.surgeries) && visitData.surgeries.length > 0)
  );

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
      {/* Background Overlay */}
      <div className="absolute inset-0" onClick={onClose} />
      
      {/* Modal Container */}
      <div className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/60 ${isFullscreen ? 'w-[98vw] h-[98vh] rounded-[2.5rem]' : 'w-full max-w-5xl h-[85vh] rounded-[2rem]'}`}>
        
        {/* Top Title Bar & Controls (Emerald DNA) */}
        <div className="px-5 py-2.5 flex items-center justify-between flex-shrink-0 shadow-md text-white transition-colors duration-300 bg-gradient-to-r from-teal-700 via-emerald-600 to-teal-700 z-30">
          <div className="flex items-center gap-2">
            <Layers size={16} />
            <span className="text-xs font-black tracking-wide drop-shadow-sm">
              {modalTitle}
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            {typeof onOpenLedger === 'function' && (visitData?.patient_id || visitData?.id) && (
              <button
                type="button"
                onClick={() => onOpenLedger(visitData.patient_id || visitData.id)}
                className="h-7 px-2.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all shadow-sm text-xs font-black flex items-center gap-1.5 active:scale-95 cursor-pointer"
                title="فتح السجل المالي للمريض"
              >
                <History size={14} strokeWidth={2.2} />
                <span>السجل المالي</span>
              </button>
            )}
            <div className="w-px h-5 bg-white/30 mx-1 hidden sm:block"></div>
            <button onClick={() => window.print()} className="w-7 h-7 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all shadow-sm" title="طباعة الفاتورة">
              <Printer size={15} />
            </button>
            <button onClick={() => setIsFullscreen(!isFullscreen)} className="w-7 h-7 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all shadow-sm hidden sm:flex" title={isFullscreen ? 'تصغير' : 'تكبير'}>
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white hover:text-red-100 rounded-lg transition-all shadow-sm">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Sticky Identity Header (Matching FinancialRecordModal & PatientEMRModal) */}
        <div className={`bg-white ${isFullscreen ? 'px-6 sm:px-8 py-3.5 sm:py-4' : 'px-5 sm:px-6 py-3.5'} flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-100 shrink-0 z-20`}>
          <div className={`flex items-center ${isFullscreen ? 'gap-3.5 sm:gap-4' : 'gap-3 sm:gap-3.5'}`}>
            <div className={`${isFullscreen ? 'w-12 h-12 sm:w-13 sm:h-13 rounded-xl' : 'w-11 h-11 sm:w-12 sm:h-12 rounded-xl'} bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center text-teal-600 shadow-inner border border-teal-100/60 shrink-0`}>
              <User size={isFullscreen ? 22 : 20} strokeWidth={1.8} className="sm:hidden" />
              <User size={isFullscreen ? 24 : 22} strokeWidth={1.8} className="hidden sm:block" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center flex-wrap gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-800 tracking-tight leading-none">
                  {visitData?.full_name || '...'}
                </h2>
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
                  <User size={11}/> {visitData?.patient_id || visitData?.id || '...'}
                </span>
                {((visitData?.gender) || (visitData?.age)) && (
                  <span className="flex items-center gap-1 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md font-black text-slate-600 bg-slate-100/80 border border-slate-200/60">
                    {visitData?.gender ? (visitData.gender === 'male' || visitData.gender === 'ذكر' ? 'ذكر' : 'أنثى') : ''}
                    {visitData?.gender && visitData?.age ? ' — ' : ''}
                    {visitData?.age ? `${visitData.age} سنة` : ''}
                  </span>
                )}
                {(() => {
                  const rawPhone = visitData?.phone;
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
          
          {/* Plain Text Date & Visit ID */}
          <div className={`flex flex-col items-start md:items-end ${isFullscreen ? 'gap-1.5' : 'gap-1'} self-stretch md:self-auto`}>
            <div className={`flex items-center gap-1.5 text-slate-500 font-bold ${isFullscreen ? 'text-xs sm:text-sm' : 'text-xs'}`}>
              <Calendar size={isFullscreen ? 15 : 13} className="text-teal-600 opacity-80" />
              <span dir="ltr">{new Date(displayDate).toLocaleDateString('en-GB')}</span>
              <span className="text-slate-300 mx-0.5">•</span>
              <span dir="ltr">{new Date(displayDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
            </div>
            
            {visitData && (
              <div className={`flex items-center gap-1 ${isFullscreen ? 'text-xs font-black' : 'text-[10px] sm:text-[11px] font-black'} text-slate-400`}>
                <span>معرف الزيارة:</span>
                <span className="text-slate-600 font-bold" dir="ltr">{visitData.visit_number || visitData.visit_id || visitData.id}</span>
              </div>
            )}

            {/* Financial Status Pill for Surgery / Partial payment */}
            {mode === 'surgery' && (
              remainingAmount <= 0 ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-2xs select-none">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  <span className="text-xs font-black">تم السداد بالكامل</span>
                </div>
              ) : hasPartialPayment ? (
                <div className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg bg-emerald-50 border border-emerald-200/80 text-emerald-800 shadow-2xs select-none pt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-[10px] sm:text-[11px] font-black text-emerald-700">المدفوع مسبقاً:</span>
                  <span className="text-xs sm:text-sm font-black tracking-tight text-emerald-800" dir="ltr">
                    {paidAmount.toLocaleString('en-US')}
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-bold text-emerald-600">ر.ي</span>
                </div>
              ) : null
            )}
          </div>
        </div>

        {/* Surgery Mode Content */}
        {mode === 'surgery' ? (
          <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-6 custom-scrollbar space-y-5">
            
            {/* 1. قسم سجل العمليات الجراحية الموحد (مطابق تماماً لتصميم السجل المالي) */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all">
              {/* شريط عنوان القسم الرئيسي (Section Header with Accordion) */}
              <div 
                onClick={() => setIsSurgeryRecordOpen(prev => !prev)}
                className="px-5 py-4 bg-gradient-to-r from-slate-50 via-indigo-50/30 to-slate-50 flex items-center justify-between gap-3 flex-wrap border-b border-indigo-100/70 cursor-pointer select-none hover:bg-slate-100/60 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700 shadow-2xs border border-indigo-200/70">
                    <Scissors size={16} />
                  </div>
                  <span className="text-sm font-black text-slate-800 tracking-tight">
                    سجل العمليات الجراحية
                  </span>
                  <span className="text-[11px] px-2.5 py-0.5 font-extrabold rounded-full border tabular-nums tracking-tight bg-indigo-50 text-indigo-800 border-indigo-200/90 shadow-2xs">
                    عملية جراحية
                  </span>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  {/* إجمالي الرسوم */}
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold bg-indigo-50/80 text-indigo-700 border-indigo-200/70 shadow-2xs">
                    <span className="text-slate-500 font-medium">إجمالي الرسوم:</span>
                    <span className="font-extrabold tabular-nums tracking-tight text-sm text-indigo-700">
                      {Math.round(netPrice).toLocaleString('en-US')}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                  </div>

                  {/* أيقونة فتح وإغلاق القائمة المنسدلة */}
                  <div className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200/70 flex items-center justify-center text-slate-500 hover:text-slate-700 shadow-2xs">
                    <ChevronDown
                      size={16}
                      className={`transition-transform duration-200 ${isSurgeryRecordOpen ? 'rotate-180' : ''}`}
                    />
                  </div>
                </div>
              </div>

              {/* جسم القسم - بطاقة العملية الجراحية كقائمة منسدلة */}
              {isSurgeryRecordOpen && (
                <div className="p-4 sm:p-5 flex flex-col gap-4 bg-slate-50/40">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-indigo-300 transition-all overflow-hidden flex flex-col">
                    
                    {/* ── 1. رأس بطاقة العملية: الأيقونة + اسم العملية + الخصم (يمين) & التاريخ والحالة (يسار) ── */}
                    <div className="px-5 py-3.5 bg-gradient-to-r from-slate-50 via-indigo-50/20 to-slate-50 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                      {/* الطرف الأيمن: أيقونة العملية + اسم العملية + الخصم إن وجد */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200/70 flex items-center justify-center shrink-0 shadow-2xs">
                          <Scissors size={18} strokeWidth={2.2} />
                        </div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="font-black text-slate-800 text-sm sm:text-base leading-tight">
                            {visitData?.surgery_type || visitData?.name || 'عملية جراحية'}
                          </h3>
                          {discountAmount > 0 && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              خصم: {discountAmount.toLocaleString('en-US')} ر.ي
                            </span>
                          )}
                        </div>
                      </div>

                      {/* الطرف الأيسر: التاريخ وإشارة اكتمال السداد بالكامل إن اكتملت */}
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {remainingAmount <= 0 && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                            <CheckCircle2 size={13} className="text-emerald-600" />
                            تم السداد بالكامل (100%)
                          </span>
                        )}
                        <span className="text-xs text-slate-500 font-medium">
                          التاريخ: <span className="font-semibold text-slate-700" dir="ltr">
                            {visitData?.scheduled_date 
                              ? new Date(visitData.scheduled_date).toLocaleDateString('en-GB') 
                              : (visitData?.created_at ? new Date(visitData.created_at).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'))}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* ── 2. جدول حركات وسندات السداد المسجلة لهذه العملية ── */}
                    <div className="p-4 sm:p-5 bg-slate-50/50 flex flex-col gap-3">
                      {/* عرض عنوان القسم فقط في حال وجود قيمة مع تفقيط سليم للعداد */}
                      {surgeryPayments.length > 0 && (
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-700">
                              حركات وسندات السداد المسجلة لهذه العملية
                            </span>
                            <span className="text-[10px] font-black bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full border border-indigo-200">
                              {formatPaymentsCount(surgeryPayments.length)}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-slate-500">
                            إجمالي المدفوع: <span className="font-extrabold text-slate-800" dir="ltr">{paidAmount.toLocaleString('en-US')}</span> ر.ي
                          </span>
                        </div>
                      )}

                      {/* حالة عدم وجود دفعات سابقة: حقل الملاحظة بدون أيقونة */}
                      {surgeryPayments.length === 0 ? (
                        <div className="py-3.5 px-4 bg-white rounded-xl border border-dashed border-slate-200 text-center">
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
                              {surgeryPayments.map((p, pIdx) => (
                                <tr key={p.id || pIdx} className="hover:bg-slate-50/60 transition-colors">
                                  <td className="px-4 py-3 text-center font-black text-slate-400 font-mono text-xs">
                                    {pIdx + 1}
                                  </td>
                                  <td className="px-4 py-3 font-bold text-slate-800 whitespace-pre-wrap break-words">
                                    <div className="flex flex-col gap-0.5">
                                      <span>{p.description || p.notes || (p.receipt_number ? `سند قبض #${p.receipt_number}` : `سداد دفعة - ${visitData?.surgery_type || visitData?.name || 'عملية جراحية'}`)}</span>
                                      <span className="text-[10px] text-slate-400 font-medium">
                                        {taffyot(parseFloat(p.amount || 0)).replace(/(ريالاً يمنياً|ريال يمني|فقط|لا غير|-)/g, '').trim()} ريال يمني.
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5 font-bold text-slate-700">
                                      {p.payment_method === 'bank_transfer' ? (
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
                                        {p.payment_date || p.created_at ? new Date(p.payment_date || p.created_at).toLocaleDateString('en-GB') : '—'}
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-medium" dir="ltr">
                                        {p.payment_date || p.created_at ? new Date(p.payment_date || p.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 font-extrabold tabular-nums tracking-tight text-indigo-700 text-sm">
                                    <span dir="ltr">{parseFloat(p.amount || 0).toLocaleString('en-US')}</span>
                                    <span className="text-[10px] font-bold text-slate-400 mr-1">ر.ي</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}
            </div>

            {/* 2. قسم تحصيل وسداد الرسوم (Payment Form or All-Paid Banner) */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              {remainingAmount > 0 ? (
                <>
                  <div className="px-5 py-3.5 bg-gradient-to-r from-slate-50 via-emerald-50/20 to-slate-50 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/70 flex items-center justify-center shrink-0 shadow-2xs">
                        <Wallet size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-black text-slate-800">تحصيل وسداد رسوم العملية</h4>
                        <p className="text-[10px] text-slate-400 font-medium">حدد المبلغ وطريقة التحصيل لإصدار سند القبض</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold shadow-2xs">
                      <span className="text-slate-500 font-medium">المتبقي المطلوب:</span>
                      <span className="font-extrabold tabular-nums" dir="ltr">{remainingAmount.toLocaleString('en-US')}</span>
                      <span className="text-[10px] text-slate-400">ر.ي</span>
                    </div>
                  </div>

                  <div className="p-4 sm:p-5 space-y-4">
                    {/* صف حقل المبلغ المراد سداده مع تفقيط المبلغ نصاً بنفس الصف */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/60">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <label htmlFor="surgery_installment" className="text-xs font-bold text-slate-700 whitespace-nowrap">
                          المبلغ المراد سداده:
                        </label>

                        {/* تصميم stepper حقل المبلغ */}
                        <div className="relative flex items-center h-[38px] w-48 sm:w-52 bg-white border border-slate-200 rounded-xl overflow-hidden focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all shadow-2xs group shrink-0">
                          {/* زر الإنقاص (-) في الطرف الأيمن */}
                          <button
                            type="button"
                            tabIndex="-1"
                            onClick={() => {
                              const current = parseFloat(surgeryInstallment) || 0;
                              const step = current > 10000 ? 5000 : 1000;
                              const nextVal = Math.max(0, current - step);
                              setSurgeryInstallment(nextVal > 0 ? nextVal.toString() : '');
                            }}
                            disabled={!surgeryInstallment || parseFloat(surgeryInstallment) <= 0}
                            className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors shrink-0 cursor-pointer"
                            title="إنقاص المبلغ"
                          >
                            <Minus size={14} strokeWidth={3} />
                          </button>

                          {/* حقل الإدخال مع اختصار ر.ي */}
                          <div className="flex-1 flex items-center justify-center gap-1 h-full px-1" dir="ltr">
                            <span className="text-[10px] font-bold text-slate-400 pointer-events-none select-none">
                              ر.ي
                            </span>
                            <input
                              id="surgery_installment"
                              type="text"
                              inputMode="numeric"
                              value={surgeryInstallment ? Number(surgeryInstallment).toLocaleString('en-US') : ''}
                              onChange={(e) => {
                                const clean = e.target.value.replace(/[^0-9]/g, '');
                                if (!clean) setSurgeryInstallment('');
                                else setSurgeryInstallment(Math.min(Number(clean), remainingAmount).toString());
                              }}
                              placeholder="0"
                              className="w-24 sm:w-28 text-center bg-transparent text-xs font-black text-slate-800 focus:outline-none"
                            />
                          </div>

                          {/* زر الزيادة (+) في الطرف الأيسر */}
                          <button
                            type="button"
                            tabIndex="-1"
                            onClick={() => {
                              const current = parseFloat(surgeryInstallment) || 0;
                              const step = current >= 10000 ? 5000 : 1000;
                              const nextVal = Math.min(remainingAmount, current + step);
                              setSurgeryInstallment(nextVal.toString());
                            }}
                            disabled={parseFloat(surgeryInstallment || 0) >= remainingAmount}
                            className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors shrink-0 cursor-pointer"
                            title="زيادة المبلغ"
                          >
                            <Plus size={14} strokeWidth={3} />
                          </button>
                        </div>

                        {/* عرض المبلغ كتابة بجوار الحقل مباشرة */}
                        {parseFloat(surgeryInstallment || 0) > 0 ? (
                          <div className="text-xs font-bold text-emerald-700 bg-emerald-50/80 border border-emerald-100/80 px-3 py-1.5 rounded-lg shrink-0">
                            <span>{taffyot(parseFloat(surgeryInstallment)).replace(/(ريالاً يمنياً|ريال يمني|فقط|لا غير|-)/g, '').trim()} ريال يمني.</span>
                          </div>
                        ) : (
                          <div className="text-[11px] font-medium text-slate-400 shrink-0 select-none">
                            أدخل المبلغ أو اضغط على تغطية المبلغ
                          </div>
                        )}
                      </div>

                      {/* زر تغطية المبلغ */}
                      <button
                        type="button"
                        onClick={() => setSurgeryInstallment(remainingAmount.toString())}
                        className="px-3.5 py-1.5 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 rounded-lg transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs self-start sm:self-auto"
                        title="تغطية كامل المبلغ المستحق"
                      >
                        <Sparkles size={13} className="text-teal-600" />
                        <span>تغطية المبلغ</span>
                      </button>
                    </div>

                    {/* قسم طريقة الدفع وزر تأكيد السداد في نفس الصف */}
                    <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50/70 border border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* اليمين: عنوان طريقة الدفع + أزرار الاختيار بجانبه مباشرة مثل نافذة دفع الخدمات */}
                      <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                            <Wallet size={15} />
                          </div>
                          <h4 className="text-xs font-bold text-slate-700 whitespace-nowrap">طريقة الدفع:</h4>
                        </div>

                        {/* خيارات طريقة الدفع (نقداً - حوالة) كشريط مدمج بجانب العنوان */}
                        <div className="flex bg-slate-200/60 p-1 rounded-xl w-56 sm:w-60">
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('cash')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              paymentMethod === 'cash' 
                                ? 'bg-white text-emerald-700 shadow-xs font-black' 
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            <Wallet size={13} />
                            <span>نقداً (كاش)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('bank_transfer')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              paymentMethod === 'bank_transfer' 
                                ? 'bg-white text-emerald-700 shadow-xs font-black' 
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            <CreditCard size={13} />
                            <span>حوالة / بنكي</span>
                          </button>
                        </div>
                      </div>

                      {/* اليسار: زر تأكيد السداد بتصميم وتنسيق وحجم مطور */}
                      <div className="shrink-0 self-stretch sm:self-auto">
                        <button
                          type="button"
                          onClick={handleUnifiedPayment}
                          disabled={isSubmitting || !surgeryInstallment || parseFloat(surgeryInstallment) <= 0}
                          className="w-full sm:w-auto h-11 px-6 rounded-xl bg-gradient-to-l from-teal-600 via-emerald-600 to-teal-600 hover:from-teal-700 hover:to-emerald-700 text-white font-black text-xs sm:text-sm transition-all shadow-[0_3px_12px_rgba(16,185,129,0.30)] hover:shadow-[0_5px_18px_rgba(16,185,129,0.40)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100 flex items-center justify-center gap-2.5 cursor-pointer active:scale-95"
                          title="تأكيد تحصيل المبلغ وإصدار السند"
                        >
                          {isSubmitting ? (
                            <div className="flex items-center gap-2">
                              <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                              <span className="font-bold text-xs">جاري المعالجة...</span>
                            </div>
                          ) : (
                            <>
                              <Check size={16} strokeWidth={2.8} className="shrink-0" />
                              <span>تأكيد الدفع</span>
                              {parseFloat(surgeryInstallment || 0) > 0 && (
                                <span 
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-black/20 text-white font-black text-xs sm:text-sm tabular-nums shadow-inner" 
                                  dir="ltr"
                                >
                                  <span>{parseFloat(surgeryInstallment).toLocaleString('en-US')}</span>
                                  <span className="text-[10px] text-emerald-100 font-bold">ر.ي</span>
                                </span>
                              )}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-6 bg-emerald-50/50 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-2xs">
                    <CheckCircle2 size={24} />
                  </div>
                  <h4 className="font-black text-emerald-800 text-sm sm:text-base">تم سداد تكلفة العملية بالكامل</h4>
                  <p className="text-xs text-emerald-600 font-medium max-w-md mx-auto">
                    تم استيفاء جميع الرسوم المقررة لهذه العملية الجراحية بنجاح، ولا توجد أي مبالغ مستحقة.
                  </p>
                </div>
              )}
            </div>

          </div>
        ) : (
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row-reverse bg-[#f8fafc]">
          {/* Cart Pane (Now on the Left in RTL due to flex-row-reverse) */}
          <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-6 lg:p-8 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-xl shadow-sm animate-pulse" />)}
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full text-red-400 font-bold text-sm">حدث خطأ أثناء جلب البيانات</div>
            ) : lineItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 bg-slate-100 text-slate-300 rounded-full flex items-center justify-center mb-4">
                  <Layers size={32} />
                </div>
                <h3 className="text-slate-600 font-bold text-lg mb-1">لا توجد خدمات معلقة</h3>
                <p className="text-slate-400 font-medium text-sm">تم إلغاء جميع الطلبات أو لا توجد خدمات تحتاج للدفع حالياً.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
                  <h3 className="font-bold text-slate-700 text-base">بنود الفاتورة</h3>
                  <button onClick={toggleAll} className="text-xs font-bold text-teal-600 hover:text-teal-700 bg-teal-50 px-3 py-1.5 rounded-lg transition-colors">
                    {selectedItems.size === lineItems.length ? 'إلغاء التحديد' : 'تحديد الكل'}
                  </button>
                </div>
                <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden shadow-sm">
                  {lineItems.map((item) => {
                    const isSelected = selectedItems.has(item.id);
                    return (
                      <div key={item.id} className="flex flex-col border-b border-gray-100/80 last:border-0">
                        <div 
                          onClick={() => toggleItem(item.id)}
                          className={`group flex items-center p-4 cursor-pointer transition-all hover:bg-slate-50 relative ${isSelected ? 'bg-emerald-50/40' : ''}`}
                        >
                          {isSelected && <div className="absolute right-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-r-md"></div>}
                          
                          <div className="mr-2 ml-4 shrink-0 transition-colors duration-200">
                            {isSelected ? (
                              <div className="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center text-white shadow-sm">
                                <Check size={14} strokeWidth={3} />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded border-2 border-slate-300 group-hover:border-emerald-400 bg-white"></div>
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <p className={`font-bold truncate text-sm transition-colors duration-200 ${isSelected ? 'text-emerald-700' : 'text-slate-700'}`}>
                              {item.name}
                            </p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors ${
  item.type === 'clinical' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70' :
  item.type === 'lab' ? 'bg-sky-50 text-sky-700 border border-sky-200/70' :
  item.type === 'radiology' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/70' :
  'bg-slate-100 text-slate-600 border border-slate-200/70'
}`}>
  {item.department}
</span>
                              {item.type === 'radiology' && (
                                <div onClick={(e) => e.stopPropagation()} className="flex items-center">
                                  <label className="flex items-center gap-1.5 cursor-pointer px-1 transition-opacity hover:opacity-80">
                                    <div className="relative flex items-center">
                                      <input type="checkbox" className="sr-only" checked={item.withFilm} onChange={(e) => toggleFilm(e, item.id)} />
                                      <div className={`block w-7 h-4 rounded-full transition-colors ${item.withFilm ? 'bg-teal-500' : 'bg-slate-300'}`}></div>
                                      <div className={`absolute top-[2px] bg-white w-3 h-3 rounded-full transition-all shadow-sm`} style={{ right: item.withFilm ? '1rem' : '2px' }}></div>
                                    </div>
                                    <span className={`text-[11px] font-bold transition-colors ${item.withFilm ? 'text-slate-900' : 'text-slate-400'}`}>مع طباعة فيلم</span>
                                  </label>
                                </div>
                              )}
                            </div>
                            
                            {/* Discount Details Moved Here */}
                            {item.hasDiscount && !item.isFree && (
                              <div className="mt-0.5 flex items-center gap-0.5 text-[8px] text-slate-400 whitespace-nowrap overflow-hidden tracking-tighter">
                                <span className="w-1 h-1 rounded-full bg-emerald-400/80 shrink-0 mr-0.5"></span>
                                <span className="shrink-0">يشمل خصم</span>
                                {item.discountPct > 0 && <span className="font-bold text-emerald-600/90 shrink-0">({item.discountPct}%)</span>}
                                <span className="shrink-0">بقيمة</span>
                                <span className="font-bold text-emerald-600/90 shrink-0">{item.discountAmount.toLocaleString('ar')} <span className="text-[7px] uppercase font-bold text-emerald-500/70">ر.ي</span></span>
                                <span className="shrink-0 mx-0.5 text-slate-300">من الأصل</span>
                                <span className="font-bold text-slate-400/80 line-through shrink-0">{item.basePrice.toLocaleString('ar')} <span className="text-[7px] uppercase font-bold">ر.ي</span></span>
                              </div>
                            )}
                          </div>
                          
                          <div className="shrink-0 text-left flex flex-col items-end justify-center">
                            <div className="flex items-baseline gap-1">
                              <span className={`font-black text-base transition-colors duration-200 ${isSelected ? (item.isFree ? 'text-emerald-600' : 'text-slate-800') : (item.isFree ? 'text-emerald-500/80' : 'text-slate-500')}`}>
                                {item.isFree ? 'مجاني' : item.amount.toLocaleString('ar')}
                              </span>
                              {!item.isFree && <span className="text-[10px] text-slate-400 font-bold">ر.ي</span>}
                            </div>
                          </div>
                          
                          {/* Trash Icon */}
                          {item.type !== 'entry_fee' ? (
                            <div className="mr-8 pr-6 border-r border-slate-200/60 flex items-center justify-center">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCancelConfirmId(cancelConfirmId === item.id ? null : item.id);
                                }}
                                className={`p-2 rounded-lg transition-all ${cancelConfirmId === item.id ? 'bg-red-100 text-red-600' : 'text-slate-400 hover:bg-red-50 hover:text-red-500'}`}
                                title="إلغاء الخدمة"
                              >
                                <Trash2 size={18} strokeWidth={2.5} />
                              </button>
                            </div>
                          ) : (
                            <div className="w-[4.5rem]"></div>
                          )}
                        </div>

                        {/* Inline Warning Banner */}
                        {cancelConfirmId === item.id && (
                          <div className="bg-red-50 border-t border-red-100 px-4 py-3 flex items-center justify-between animate-in slide-in-from-top-2 duration-200">
                            <div className="flex items-center gap-2 text-red-600">
                              <AlertCircle size={16} />
                              <span className="text-sm font-semibold">هل تريد إلغاء هذه الخدمة؟</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => setCancelConfirmId(null)}
                                disabled={isCancelling}
                                className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                              >
                                تراجع
                              </button>
                              <button 
                                onClick={() => handleCancelService(item)}
                                disabled={isCancelling}
                                className="px-3 py-1.5 text-xs font-bold text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors flex items-center gap-1.5"
                              >
                                {isCancelling ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : null}
                                تأكيد الإلغاء
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Summary Pane (Now on the Right in RTL due to flex-row-reverse) */}
          <div className="w-full lg:w-[22rem] shrink-0 bg-white lg:border-l border-t lg:border-t-0 border-slate-200/60 p-5 lg:p-7 flex flex-col justify-between z-10 shadow-[4px_0_15px_rgba(0,0,0,0.02)]">
            <div>
              <h3 className="font-bold text-slate-700 text-base mb-5">ملخص الدفع</h3>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 mb-5 relative overflow-hidden">
                <div className="absolute -left-4 -top-4 w-16 h-16 bg-emerald-100 rounded-full blur-2xl opacity-50"></div>
                <div className="flex items-center justify-between relative z-10 mb-2">
                  <p className="text-sm font-bold text-slate-600">الإجمالي المطلوب</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-emerald-600 tracking-tight">{subtotal.toLocaleString('ar')}</span>
                    <span className="text-[10px] font-bold text-emerald-600/70">ر.ي</span>
                  </div>
                </div>
                {subtotal > 0 && (
                  <div className="relative z-10 pt-3 border-t border-slate-200/60">
                    <p className="text-[11.5px] font-bold text-slate-500 leading-relaxed text-center">
                      {taffyot(subtotal).replace(/(ريالاً يمنياً|ريال يمني|فقط|لا غير|-)/g, '').trim()} ريال يمني.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-600 font-medium px-1">
                  <span>البنود المحددة للدفع</span>
                  <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">{selectedItems.size} من {lineItems.length}</span>
                </div>
              </div>
            </div>
            
            <div className="mt-6">
               <div className="mb-4">
                 <p className="text-[11px] font-bold text-slate-500 mb-2 px-1">طريقة الدفع</p>
                 <div className="flex bg-slate-100/80 p-1 rounded-lg">
                   <button 
                     onClick={() => setPaymentMethod('cash')}
                     className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold transition-all ${paymentMethod === 'cash' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                   >
                     <Wallet size={14} /> نقداً
                   </button>
                   <button 
                     onClick={() => setPaymentMethod('bank_transfer')}
                     className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold transition-all ${paymentMethod === 'bank_transfer' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                   >
                     <CreditCard size={14} /> تحويل بنكي
                   </button>
                 </div>
               </div>

               <button 
                 onClick={handleUnifiedPayment} 
                 disabled={isSubmitting || subtotal === 0}
                 className="w-full py-3.5 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-500 hover:from-teal-700 hover:to-emerald-600 text-white font-black transition-all shadow-[0_4px_15px_rgba(16,185,129,0.25)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.35)] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 text-base"
               >
                 {isSubmitting ? (
                   <span className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                 ) : (
                   <>دفع {subtotal.toLocaleString('ar')} ريال</>
                 )}
               </button>
            </div>
          </div>
        </div>
        )}

      </div>


    </div>
  );

  return createPortal(modalContent, document.body);
};

export default UnifiedPaymentModal;
