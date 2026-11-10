import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Check, Wallet, Search, FileText, User, Layers, AlertCircle,
  Tag, ChevronDown, RefreshCcw, SlidersHorizontal,
  Maximize2, Minimize2, Calendar, CreditCard, RotateCcw,
  ArrowUpRight, ArrowDownLeft, Plus, Minus,
  FlaskConical, Sparkles, Phone, Film, Lock, Activity
} from 'lucide-react';
import { toast } from 'react-toastify';
import {
  INCOME_TYPES,
  EXPENSE_TYPES,
  CAT_LABEL,
  getServiceTypeBadge,
  sanitizeDecimalInput,
  formatCurrency,
  formatDateEn,
  formatTimeEn,
  formatAmountInput,
  formatTafqeet,
} from '../cashierConstants';

const AddTransactionModal = ({
  isOpen,
  initialType = 'income',
  token,
  onClose,
  onSuccess,
}) => {
  const [saving, setSaving] = useState(false);
  const [isAddModalFullscreen, setIsAddModalFullscreen] = useState(false);

  // Form state
  const [txType, setTxType] = useState('income'); // income | expense
  const [category, setCategory] = useState('');
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'bank_transfer'
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');

  // Refund Process State (Strict Accounting Constraints)
  const [refundablePatients, setRefundablePatients] = useState([]);
  const [loadingRefundablePatients, setLoadingRefundablePatients] = useState(false);
  const [searchPatientText, setSearchPatientText] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);

  const [refundableServices, setRefundableServices] = useState([]);
  const [loadingRefundableServices, setLoadingRefundableServices] = useState(false);
  const [selectedRefundService, setSelectedRefundService] = useState(null);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  const [refundService, setRefundService] = useState('');

  // External Service State (الخدمات الخارجية للمرضى الخارجيين)
  const [extPatientName, setExtPatientName] = useState('');
  const [extPatientPhone, setExtPatientPhone] = useState('');
  const [extServiceDept, setExtServiceDept] = useState('lab'); // 'lab' | 'radiology'
  const [extWithFilm, setExtWithFilm] = useState(true);
  const [selectedExtService, setSelectedExtService] = useState(null);
  const [showExtServiceDropdown, setShowExtServiceDropdown] = useState(false);
  const [extServiceSearch, setExtServiceSearch] = useState('');
  const [labCatalog, setLabCatalog] = useState([]);
  const [radiologyCatalog, setRadiologyCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const extServiceRef = useRef(null);

  // Auto-expanding Textarea Ref (Description / Reason)
  const descTextareaRef = useRef(null);

  const isExternalService = category === 'external_lab' || category === 'external_radiology' || category === 'external_service';
  const modalMode = category === 'refund' ? 'refund' : txType === 'expense' ? 'expense' : 'income';

  const availableRefundAmount = useMemo(() => {
    if (modalMode !== 'refund' || !selectedPatient) return 0;
    if (loadingRefundableServices) {
      return parseFloat(selectedPatient.net_refundable_balance) || 0;
    }
    if (Array.isArray(refundableServices)) {
      return refundableServices.reduce((acc, s) => acc + (parseFloat(s.price) || 0), 0);
    }
    return parseFloat(selectedPatient.net_refundable_balance) || 0;
  }, [modalMode, selectedPatient, refundableServices, loadingRefundableServices]);
  const catOptions = useMemo(
    () => (txType === 'income' ? INCOME_TYPES : EXPENSE_TYPES.filter(t => t.value !== 'refund')),
    [txType]
  );

  const resetAddForm = useCallback(() => {
    setAmount('');
    setDesc('');
    setCategory('');
    setPaymentMethod('cash');
    setSelectedPatient(null);
    setSearchPatientText('');
    setRefundService('');
    setSelectedRefundService(null);
    setRefundableServices([]);
    setShowPatientDropdown(false);
    setShowCategoryMenu(false);
    setShowServiceDropdown(false);
    setExtPatientName('');
    setExtPatientPhone('');
    setExtServiceDept('lab');
    setExtWithFilm(true);
    setSelectedExtService(null);
    setShowExtServiceDropdown(false);
    setExtServiceSearch('');
  }, []);

  const handleClose = useCallback(() => {
    setShowCategoryMenu(false);
    setShowPatientDropdown(false);
    setShowServiceDropdown(false);
    setShowExtServiceDropdown(false);
    onClose?.();
  }, [onClose]);

  const fetchCatalogs = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const [labRes, radRes] = await Promise.all([
        fetch('/api/catalog/lab', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/catalog/radiology', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (labRes.ok) {
        const labs = await labRes.json();
        setLabCatalog(Array.isArray(labs) ? labs : []);
      }
      if (radRes.ok) {
        const rads = await radRes.json();
        setRadiologyCatalog(Array.isArray(rads) ? rads : []);
      }
    } catch {
      toast.error('تعذر تحميل دليل الخدمات الطبية');
    } finally {
      setLoadingCatalog(false);
    }
  }, [token]);

  useEffect(() => {
    if (category === 'external_lab') {
      setExtServiceDept('lab');
    } else if (category === 'external_radiology') {
      setExtServiceDept('radiology');
    }
  }, [category]);

  useEffect(() => {
    if (isOpen && isExternalService) {
      fetchCatalogs();
    }
  }, [isOpen, isExternalService, fetchCatalogs]);

  // Recalculate amount whenever selected external service, department, or film option changes
  useEffect(() => {
    if (isExternalService && selectedExtService) {
      if (extServiceDept === 'lab') {
        setAmount(String(selectedExtService.price || 0));
      } else {
        const p = extWithFilm
          ? (selectedExtService.price_with_film || selectedExtService.price || 0)
          : (selectedExtService.price_without_film || selectedExtService.price || 0);
        setAmount(String(p));
      }
    }
  }, [isExternalService, selectedExtService, extWithFilm, extServiceDept]);

  // Close external service dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (extServiceRef.current && !extServiceRef.current.contains(e.target)) {
        setShowExtServiceDropdown(false);
      }
    };
    if (showExtServiceDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExtServiceDropdown]);

  const fetchRefundablePatients = useCallback(async (query = '') => {
    setLoadingRefundablePatients(true);
    try {
      const url = `/api/cashier/refundable-patients${query ? `?q=${encodeURIComponent(query)}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('فشل جلب المرضى المؤهلين');
      const data = await res.json();
      setRefundablePatients(Array.isArray(data) ? data : []);
    } catch {
      toast.error('تعذر جلب قائمة المرضى المؤهلين للاسترداد');
      setRefundablePatients([]);
    } finally {
      setLoadingRefundablePatients(false);
    }
  }, [token]);

  const fetchRefundableServices = useCallback(async (visitId) => {
    if (!visitId) {
      setRefundableServices([]);
      return;
    }
    setLoadingRefundableServices(true);
    try {
      const res = await fetch(`/api/cashier/visit-refundable-services/${visitId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('فشل جلب الخدمات المؤهلة');
      const data = await res.json();
      setRefundableServices(Array.isArray(data) ? data : []);
    } catch {
      toast.error('تعذر جلب الخدمات القابلة للاسترداد لهذه الزيارة');
      setRefundableServices([]);
    } finally {
      setLoadingRefundableServices(false);
    }
  }, [token]);

  useEffect(() => {
    if (isOpen) {
      const defaultType = initialType || 'income';
      setTxType(defaultType === 'refund' ? 'expense' : defaultType);
      resetAddForm();
      if (defaultType === 'refund') {
        setTxType('expense');
        setCategory('refund');
        fetchRefundablePatients();
      }
    }
  }, [isOpen, initialType, resetAddForm, fetchRefundablePatients]);

  useEffect(() => {
    if (category === 'refund' && isOpen) {
      fetchRefundablePatients();
    }
  }, [category, isOpen, fetchRefundablePatients]);

  // Auto-resize flexible textarea (Description / Reason)
  useEffect(() => {
    const el = descTextareaRef.current;
    if (el) {
      const baseH = 68;
      el.style.minHeight = `${baseH}px`;
      el.style.height = `${baseH}px`;
      if (el.scrollHeight > baseH + 6) {
        el.style.height = `${el.scrollHeight + 2}px`;
      }
    }
  }, [desc, isOpen, modalMode, isAddModalFullscreen]);

  const numericInputAmount =
    modalMode === 'refund'
      ? parseFloat(selectedRefundService?.price) || 0
      : parseFloat(String(amount).replace(/,/g, '')) || 0;

  const handleAdd = async (e) => {
    e.preventDefault();
    const numericAmount = category === 'refund'
      ? (parseFloat(selectedRefundService?.price) || 0)
      : parseFloat(String(amount).replace(/,/g, ''));
    if (!category) {
      return toast.warning('يرجى اختيار الفئة التصنيفية');
    }

    if (isExternalService) {
      if (!extPatientName.trim()) {
        return toast.warning('يرجى إدخال اسم المريض الخارجي');
      }
      if (!selectedExtService) {
        return toast.warning('يرجى اختيار الخدمة المطلوبة');
      }
      if (numericAmount <= 0) {
        return toast.warning('يرجى التأكد من سعر الخدمة المحددة');
      }
    } else {
      if (!numericAmount || numericAmount <= 0) {
        return toast.warning(
          category === 'refund'
            ? 'يرجى اختيار الخدمة المراد استردادها'
            : 'يرجى إدخال مبلغ صحيح أكبر من الصفر'
        );
      }
      if (!desc.trim()) {
        return toast.warning(
          category === 'refund'
            ? 'يرجى إدخال سبب الاسترداد لتوثيق العملية المالية'
            : 'يرجى إدخال البيان / الملاحظات التوضيحية للحركة المالية'
        );
      }
    }

    if (category === 'refund') {
      if (!selectedPatient) {
        return toast.warning('يرجى تحديد المريض المرتبط بعملية الاسترداد');
      }
      if (!selectedRefundService) {
        return toast.warning('يرجى اختيار الخدمة المراد استردادها');
      }
      const maxPrice = parseFloat(selectedRefundService.price) || 0;
      if (numericAmount > maxPrice) {
        return toast.warning(`مبلغ الاسترداد لا يمكن أن يتجاوز قيمة الخدمة (${formatCurrency(maxPrice)} ر.ي)`);
      }
      const netBal = availableRefundAmount;
      if (numericAmount > netBal) {
        return toast.warning(`مبلغ الاسترداد يتجاوز الرصيد الصافي المتاح للزيارة (${formatCurrency(netBal)} ر.ي)`);
      }
    }

    setSaving(true);

    let finalDesc = desc.trim();
    if (category === 'refund') {
      const sName = selectedRefundService?.service_name || refundService.trim() || 'خدمة طبية';
      finalDesc = sName;
    } else if (isExternalService) {
      finalDesc = desc.trim() ? desc.trim() : null;
    }

    try {
      const res = await fetch('/api/cashier/general-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: txType,
          category,
          amount: numericAmount,
          payment_method: paymentMethod,
          description: finalDesc,
          refund_reason: category === 'refund' && desc.trim() ? desc.trim() : null,
          patient_id: category === 'refund' && selectedPatient ? selectedPatient.id : null,
          visit_id: category === 'refund' && selectedPatient ? selectedPatient.visit_id : null,
          service_id: category === 'refund' ? selectedRefundService?.item_id : (isExternalService ? selectedExtService?.id : null),
          service_type: category === 'refund' ? selectedRefundService?.item_type : (category === 'external_radiology' ? 'radiology' : category === 'external_lab' ? 'lab' : extServiceDept),
          external_patient_name: isExternalService ? extPatientName.trim() : null,
          external_patient_phone: isExternalService && extPatientPhone.trim() ? extPatientPhone.trim() : null,
          with_film: (category === 'external_radiology' || extServiceDept === 'radiology') ? extWithFilm : false,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'تم تسجيل الحركة المالية بنجاح');
        resetAddForm();
        handleClose();
        onSuccess?.();
      } else {
        toast.error(data.message || 'حدث خطأ أثناء حفظ العملية');
      }
    } catch {
      toast.error('تعذر الاتصال بالخادم');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99990] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300 print:hidden"
      dir="rtl"
    >
      {/* Backdrop: Closes internal dropdowns only */}
      <div
        className="absolute inset-0"
        onClick={() => {
          setShowCategoryMenu(false);
          setShowPatientDropdown(false);
        }}
      />

      <div
        onClick={() => {
          setShowCategoryMenu(false);
          setShowPatientDropdown(false);
          setShowServiceDropdown(false);
        }}
        className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-white/60 ${
          isAddModalFullscreen
            ? 'w-[98vw] h-[98vh] rounded-[2.5rem]'
            : 'w-full max-w-5xl max-h-[90vh] rounded-[2rem]'
        }`}
      >
        {/* Top Title Bar & Window Controls (Responsive to Small / Large Modal Size) */}
        <div
          className={`${
            isAddModalFullscreen ? 'px-6 py-3' : 'px-5 py-2.5'
          } flex items-center justify-between flex-shrink-0 shadow-md text-white transition-all duration-300 z-30 ${
            modalMode === 'income'
              ? 'bg-gradient-to-r from-teal-700 via-emerald-600 to-teal-700'
              : modalMode === 'refund'
              ? 'bg-gradient-to-r from-rose-700 via-rose-600 to-red-700'
              : 'bg-gradient-to-r from-amber-700 via-amber-600 to-orange-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Layers size={isAddModalFullscreen ? 18 : 16} />
            <span
              className={`${
                isAddModalFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
              } font-black tracking-wide drop-shadow-sm`}
            >
              إضافة حركة مالية جديدة — الخزينة العامة
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setIsAddModalFullscreen((prev) => !prev)}
              className={`${
                isAddModalFullscreen ? 'w-8 h-8' : 'w-7 h-7'
              } flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all shadow-sm hidden sm:flex cursor-pointer`}
              title={isAddModalFullscreen ? 'تصغير النافذة' : 'تكبير النافذة'}
            >
              {isAddModalFullscreen ? (
                <Minimize2 size={isAddModalFullscreen ? 16 : 15} />
              ) : (
                <Maximize2 size={isAddModalFullscreen ? 16 : 15} />
              )}
            </button>
            <div className="w-px h-5 bg-white/30 mx-0.5 hidden sm:block" />
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className={`${
                isAddModalFullscreen ? 'w-8 h-8' : 'w-7 h-7'
              } flex items-center justify-center bg-white/20 hover:bg-white/30 text-white hover:text-red-100 rounded-lg transition-all shadow-sm cursor-pointer disabled:opacity-50`}
              title="إغلاق النافذة"
            >
              <X size={isAddModalFullscreen ? 18 : 16} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Modal Info Banner / Quick Header Details */}
        <div
          className={`${
            isAddModalFullscreen ? 'px-6 py-4' : 'px-5 py-3'
          } bg-white border-b border-slate-200/80 flex items-center justify-between gap-4 flex-shrink-0 transition-all`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`rounded-xl flex items-center justify-center shadow-xs ${
                isAddModalFullscreen ? 'w-10 h-10' : 'w-8 h-8'
              } ${
                modalMode === 'income'
                  ? 'bg-emerald-100/80 text-emerald-700'
                  : modalMode === 'refund'
                  ? 'bg-rose-100/80 text-rose-700'
                  : 'bg-amber-100/80 text-amber-700'
              }`}
            >
              {modalMode === 'income' ? (
                <ArrowDownLeft size={isAddModalFullscreen ? 20 : 16} strokeWidth={2.4} />
              ) : modalMode === 'refund' ? (
                <RotateCcw size={isAddModalFullscreen ? 20 : 16} strokeWidth={2.4} />
              ) : (
                <ArrowUpRight size={isAddModalFullscreen ? 20 : 16} strokeWidth={2.4} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  className={`font-black text-slate-800 ${
                    isAddModalFullscreen ? 'text-base sm:text-lg' : 'text-sm sm:text-base'
                  }`}
                >
                  إضافة حركة مالية جديدة
                </h2>
                <span
                  className={`inline-flex items-center rounded-lg font-black border ${
                    isAddModalFullscreen
                      ? 'px-3 py-1 text-xs'
                      : 'px-2.5 py-0.5 text-[10px] sm:text-[11px]'
                  } ${
                    modalMode === 'income'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
                      : modalMode === 'refund'
                      ? 'bg-rose-50 text-rose-700 border-rose-200/70'
                      : 'bg-amber-50 text-amber-700 border-amber-200/70'
                  }`}
                >
                  {modalMode === 'income'
                    ? 'إيداع في الخزينة (+)'
                    : modalMode === 'refund'
                    ? 'استرداد نقدي (-)'
                    : 'مصروف تشغيلي (-)'}
                </span>
              </div>
              <p
                className={`text-slate-500 font-semibold truncate ${
                  isAddModalFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
                }`}
              >
                {modalMode === 'income'
                  ? 'تسجيل مقبوضات أو إيرادات عامة وتوثيقها مباشرة في الخزينة'
                  : modalMode === 'refund'
                  ? 'تسجيل استرداد نقدي لمريض مع توثيق الخدمة وسبب الاسترداد'
                  : 'تسجيل مصروف تشغيلي أو مشتريات طارئة من الخزينة العامة'}
              </p>
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
            <div
              className={`flex items-center gap-1.5 text-slate-500 font-bold ${
                isAddModalFullscreen ? 'text-sm' : 'text-xs'
              }`}
            >
              <Calendar
                size={isAddModalFullscreen ? 16 : 14}
                className={
                  modalMode === 'income'
                    ? 'text-emerald-600 opacity-80'
                    : modalMode === 'refund'
                    ? 'text-rose-600 opacity-80'
                    : 'text-amber-600 opacity-80'
                }
              />
              <span dir="ltr">{formatDateEn(new Date().toISOString())}</span>
              <span className="text-slate-300 mx-0.5">•</span>
              <span dir="ltr">{formatTimeEn(new Date().toISOString())}</span>
            </div>
            {modalMode === 'refund' && selectedPatient && (
              <div
                className={`flex items-center gap-1 font-black text-slate-400 ${
                  isAddModalFullscreen ? 'text-xs' : 'text-[11px]'
                }`}
              >
                <span>معرف الزيارة:</span>
                <span className="text-slate-600" dir="ltr">
                  {selectedPatient.latest_visit_number || '—'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Form Body (Fills Full Width & Height in Fullscreen — Compact in Normal Mode) */}
        <form onSubmit={handleAdd} className="flex flex-col flex-1 overflow-hidden">
          <div
            className={`flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50 transition-all ${
              isAddModalFullscreen ? 'p-6 sm:p-8 flex flex-col' : 'p-4 sm:p-5'
            }`}
          >
            <div
              className={`w-full max-w-none transition-all ${
                isAddModalFullscreen ? 'flex-1 flex flex-col gap-5' : 'space-y-3.5'
              }`}
            >
              {/* 1. الصف الأول: قسم نوع العملية المالية + قسم الفئة التصنيفية (أو المريض المستفيد) بنفس الصف */}
              <div
                className={`bg-white rounded-xl border border-slate-200/60 shadow-xs shrink-0 transition-all ${
                  isAddModalFullscreen ? 'p-5 sm:p-6' : 'p-3.5 sm:p-4'
                }`}
              >
                <div
                  className={`grid grid-cols-1 lg:grid-cols-12 items-start ${
                    isAddModalFullscreen ? 'gap-5 sm:gap-6' : 'gap-3.5 sm:gap-4'
                  }`}
                >
                  {/* أ. قسم نوع العملية المالية (مدمج وأنيق ويتجاوب مع حجم النافذة) */}
                  <div className="lg:col-span-6">
                    <label
                      className={`font-bold text-slate-700 flex items-center gap-1.5 ${
                        isAddModalFullscreen ? 'h-6 text-xs sm:text-sm mb-2.5' : 'h-5 text-xs mb-1.5'
                      }`}
                    >
                      <SlidersHorizontal
                        size={isAddModalFullscreen ? 15 : 13}
                        className={
                          modalMode === 'income'
                            ? 'text-emerald-600'
                            : modalMode === 'refund'
                            ? 'text-rose-600'
                            : 'text-amber-600'
                        }
                      />
                      <span>نوع العملية المالية</span>
                    </label>

                    <div
                      className={`grid grid-cols-3 gap-1.5 p-1 bg-slate-100/80 border border-slate-200/70 rounded-xl transition-all ${
                        isAddModalFullscreen ? 'h-11' : 'h-[36px]'
                      }`}
                    >
                      {[
                        {
                          id: 'income',
                          label: 'إيراد عام',
                          icon: ArrowDownLeft,
                          activeClass: 'bg-emerald-600 text-white shadow-2xs font-black',
                          onSelect: () => {
                            setTxType('income');
                            setCategory('');
                            setShowCategoryMenu(false);
                            setShowPatientDropdown(false);
                            setShowServiceDropdown(false);
                            setSelectedPatient(null);
                            setSelectedRefundService(null);
                            setRefundService('');
                            setRefundableServices([]);
                            setAmount('');
                          }
                        },
                        {
                          id: 'expense',
                          label: 'مصروف عام',
                          icon: ArrowUpRight,
                          activeClass: 'bg-amber-600 text-white shadow-2xs font-black',
                          onSelect: () => {
                            setTxType('expense');
                            setCategory('');
                            setShowCategoryMenu(false);
                            setShowPatientDropdown(false);
                            setShowServiceDropdown(false);
                            setSelectedPatient(null);
                            setSelectedRefundService(null);
                            setRefundService('');
                            setRefundableServices([]);
                            setAmount('');
                          }
                        },
                        {
                          id: 'refund',
                          label: 'استرداد نقدي',
                          icon: RotateCcw,
                          activeClass: 'bg-rose-600 text-white shadow-2xs font-black',
                          onSelect: () => {
                            setTxType('expense');
                            setCategory('refund');
                            setShowCategoryMenu(false);
                            setShowPatientDropdown(false);
                            setShowServiceDropdown(false);
                            setSelectedPatient(null);
                            setSelectedRefundService(null);
                            setRefundService('');
                            setRefundableServices([]);
                            setAmount('');
                            fetchRefundablePatients();
                          }
                        }
                      ].map((m) => {
                        const IconComp = m.icon;
                        const isActive = modalMode === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={m.onSelect}
                            className={`h-full rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 px-2 ${
                              isAddModalFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
                            } ${
                              isActive
                                ? m.activeClass
                                : 'text-slate-600 font-bold hover:text-slate-800 hover:bg-white/60'
                            }`}
                          >
                            <IconComp
                              size={isAddModalFullscreen ? 15 : 13}
                              strokeWidth={2.4}
                              className="shrink-0"
                            />
                            <span className="truncate">{m.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ب. قسم الفئة التصنيفية (أو المريض المستفيد في وضع الاسترداد) بنفس الصف */}
                  {modalMode !== 'refund' ? (
                    <div
                      className="lg:col-span-6 relative"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label
                        className={`font-bold text-slate-700 flex items-center gap-1.5 ${
                          isAddModalFullscreen ? 'h-6 text-xs sm:text-sm mb-2.5' : 'h-5 text-xs mb-1.5'
                        }`}
                      >
                        <Tag
                          size={isAddModalFullscreen ? 15 : 13}
                          className={modalMode === 'income' ? 'text-emerald-600' : 'text-amber-600'}
                        />
                        <span>الفئة التصنيفية *</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => {
                          setShowCategoryMenu((prev) => !prev);
                          setShowPatientDropdown(false);
                        }}
                        className={`w-full px-3.5 bg-slate-50/70 hover:bg-white border rounded-xl font-bold flex items-center justify-between gap-2 shadow-2xs transition-all cursor-pointer ${
                          isAddModalFullscreen ? 'h-11 text-xs sm:text-sm' : 'h-[36px] text-xs'
                        } ${
                          showCategoryMenu
                            ? modalMode === 'income'
                              ? 'bg-white border-emerald-500 ring-1 ring-emerald-500'
                              : 'bg-white border-amber-500 ring-1 ring-amber-500'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {category ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                modalMode === 'income' ? 'bg-emerald-500' : 'bg-amber-500'
                              }`}
                            />
                            <span className="font-black text-slate-800 truncate">
                              {CAT_LABEL[category] || category}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-semibold">-- اختر الفئة التصنيفية --</span>
                        )}
                        <ChevronDown
                          size={isAddModalFullscreen ? 16 : 14}
                          className={`text-slate-400 shrink-0 transition-transform duration-200 ${
                            showCategoryMenu
                              ? modalMode === 'income'
                                ? 'rotate-180 text-emerald-600'
                                : 'rotate-180 text-amber-600'
                              : ''
                          }`}
                        />
                      </button>

                      {showCategoryMenu && (
                        <div className="absolute right-0 left-0 top-full mt-1 bg-white border border-slate-200/90 rounded-xl shadow-[0_12px_28px_rgba(15,23,42,0.12)] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                          {catOptions.map((opt) => {
                            const isSelected = category === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  const val = opt.value;
                                  setCategory(val);
                                  setShowCategoryMenu(false);
                                  if (val === 'external_lab') {
                                    setExtServiceDept('lab');
                                    setSelectedExtService(null);
                                    setAmount('');
                                    setExtServiceSearch('');
                                  } else if (val === 'external_radiology') {
                                    setExtServiceDept('radiology');
                                    setSelectedExtService(null);
                                    setAmount('');
                                    setExtServiceSearch('');
                                  } else if (val !== 'external_service') {
                                    setSelectedExtService(null);
                                    setExtPatientName('');
                                    setExtPatientPhone('');
                                  }
                                }}
                                className={`w-full px-3 py-2 rounded-lg flex items-center justify-between gap-2 transition-all cursor-pointer mb-0.5 last:mb-0 ${
                                  isAddModalFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
                                } ${
                                  isSelected
                                    ? modalMode === 'income'
                                      ? 'bg-emerald-50/90 text-emerald-700 font-black border border-emerald-200/60'
                                      : 'bg-amber-50/90 text-amber-700 font-black border border-amber-200/60'
                                    : 'text-slate-700 font-bold hover:bg-slate-50 border border-transparent'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                      isSelected
                                        ? modalMode === 'income'
                                          ? 'bg-emerald-500'
                                          : 'bg-amber-500'
                                        : 'bg-slate-300'
                                    }`}
                                  />
                                  <span className="truncate">{opt.label}</span>
                                </div>
                                {isSelected && (
                                  <Check
                                    size={isAddModalFullscreen ? 15 : 13}
                                    className={`shrink-0 ${
                                      modalMode === 'income' ? 'text-emerald-600' : 'text-amber-600'
                                    }`}
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* المريض المستفيد (المرضى المؤهلون للاسترداد فقط) */
                    <div
                      className="lg:col-span-6 relative"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between">
                        <label
                          className={`font-bold text-slate-700 flex items-center gap-1.5 ${
                            isAddModalFullscreen ? 'h-6 text-xs sm:text-sm mb-2.5' : 'h-5 text-xs mb-1.5'
                          }`}
                        >
                          <User size={isAddModalFullscreen ? 15 : 13} className="text-rose-600" />
                          <span>المريض المستفيد *</span>
                        </label>
                        {selectedPatient && (
                          <span
                            className={`font-black text-rose-600 ${
                              isAddModalFullscreen ? 'text-xs' : 'text-[11px]'
                            }`}
                          >
                            المتاح: {formatCurrency(availableRefundAmount)} ر.ي
                          </span>
                        )}
                      </div>

                      <div
                        onClick={() => {
                          setShowPatientDropdown((prev) => !prev);
                          setShowCategoryMenu(false);
                          setShowServiceDropdown(false);
                        }}
                        className={`w-full px-3.5 bg-slate-50/70 hover:bg-white border rounded-xl font-bold flex items-center justify-between gap-2 shadow-2xs transition-all cursor-pointer ${
                          isAddModalFullscreen ? 'h-11 text-xs sm:text-sm' : 'h-[36px] text-xs'
                        } ${
                          showPatientDropdown
                            ? 'bg-white border-rose-500 ring-1 ring-rose-500'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {selectedPatient ? (
                          <div className="flex items-center justify-between w-full gap-2 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                              <span className="font-black text-slate-800 truncate">
                                {selectedPatient.full_name}
                              </span>
                              {(selectedPatient.latest_visit_number || selectedPatient.visit_number) && (
                                <span
                                  dir="ltr"
                                  className="text-[11px] font-mono font-semibold text-slate-400 shrink-0"
                                  title="معرف الزيارة"
                                >
                                  {selectedPatient.latest_visit_number || selectedPatient.visit_number}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPatient(null);
                                setSelectedRefundService(null);
                                setRefundService('');
                                setRefundableServices([]);
                                setAmount('');
                              }}
                              className="w-4 h-4 rounded bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors shrink-0"
                              title="إزالة المريض"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-semibold">-- اختر المريض (المؤهلون للاسترداد) --</span>
                        )}
                        <ChevronDown
                          size={isAddModalFullscreen ? 16 : 14}
                          className={`text-slate-400 shrink-0 transition-transform duration-200 ${
                            showPatientDropdown ? 'rotate-180 text-rose-500' : ''
                          }`}
                        />
                      </div>

                      {showPatientDropdown && (
                        <div className="absolute right-0 left-0 top-full mt-1 bg-white border border-slate-200/90 rounded-xl shadow-[0_12px_28px_rgba(15,23,42,0.12)] p-1.5 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                          <div className="pb-1.5 mb-1 border-b border-slate-100">
                            <div className="relative flex items-center">
                              <Search size={13} className="absolute right-2.5 text-slate-400 pointer-events-none" />
                              <input
                                type="text"
                                autoFocus
                                value={searchPatientText}
                                onChange={(e) => setSearchPatientText(e.target.value)}
                                className={`w-full pr-7 pl-2.5 bg-slate-50/70 focus:bg-white border border-slate-200/90 rounded-lg text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-rose-500 transition-colors ${
                                  isAddModalFullscreen ? 'h-9' : 'h-8'
                                }`}
                                placeholder="ابحث باسم المريض أو معرف الزيارة..."
                              />
                            </div>
                          </div>
                          <div
                            className={`overflow-y-auto custom-scrollbar space-y-0.5 ${
                              isAddModalFullscreen ? 'max-h-64' : 'max-h-44'
                            }`}
                          >
                            {loadingRefundablePatients ? (
                              <div className="py-3 text-center text-xs text-slate-400 font-bold flex items-center justify-center gap-2">
                                <RefreshCcw size={12} className="animate-spin text-rose-500" />
                                <span>جاري تحميل قائمة المرضى المؤهلين...</span>
                              </div>
                            ) : refundablePatients.length === 0 ? (
                              <div className="py-3 px-2 text-center text-xs text-slate-400 font-bold leading-relaxed">
                                لا يوجد مرضى مؤهلون للاسترداد حالياً
                                <span className="block text-[10px] text-slate-400 font-normal mt-0.5">
                                  (خلال آخر 7 أيام وبذمة مالية موجبة)
                                </span>
                              </div>
                            ) : (
                              refundablePatients
                                .filter((p) => {
                                  if (!searchPatientText.trim()) return true;
                                  const term = searchPatientText.trim().toLowerCase();
                                  return (
                                    p.full_name?.toLowerCase().includes(term) ||
                                    String(p.latest_visit_number || p.visit_number || '').toLowerCase().includes(term) ||
                                    String(p.phone || '').includes(term) ||
                                    String(p.id || '').includes(term)
                                  );
                                })
                                .map((p) => {
                                  const isSelected = selectedPatient?.id === p.id;
                                  return (
                                    <button
                                      key={p.visit_id ? `${p.id}-${p.visit_id}` : p.id}
                                      type="button"
                                      onClick={() => {
                                        setSelectedPatient(p);
                                        setShowPatientDropdown(false);
                                        setSearchPatientText('');
                                        setSelectedRefundService(null);
                                        setRefundService('');
                                        setAmount('');
                                        if (p.visit_id) {
                                          fetchRefundableServices(p.visit_id);
                                        }
                                      }}
                                      className={`w-full px-3 py-2 rounded-lg flex items-center justify-between gap-2 transition-all cursor-pointer mb-0.5 last:mb-0 ${
                                        isAddModalFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
                                      } ${
                                        isSelected
                                          ? 'bg-rose-50/90 text-rose-700 font-black border border-rose-200/60'
                                          : 'text-slate-700 font-bold hover:bg-slate-50 border border-transparent'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <span
                                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                            isSelected ? 'bg-rose-500' : 'bg-slate-300'
                                          }`}
                                        />
                                        <div className="flex flex-col items-start min-w-0 text-right gap-0.5">
                                          <span className="truncate w-full leading-snug">{p.full_name}</span>
                                          <div className="flex items-center gap-2">
                                            <span
                                              dir="ltr"
                                              className={`text-[10px] font-mono font-semibold leading-none ${
                                                isSelected ? 'text-rose-500' : 'text-slate-400'
                                              }`}
                                            >
                                              {p.latest_visit_number || p.visit_number}
                                            </span>
                                            {p.visit_created_at && (
                                              <span className="text-[10px] text-slate-400 font-normal">
                                                {formatDateEn(p.visit_created_at)}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span
                                          className={`font-black text-rose-600 ${
                                            isAddModalFullscreen ? 'text-xs' : 'text-[11px]'
                                          }`}
                                        >
                                          المتاح: {formatCurrency(p.net_refundable_balance)} ر.ي
                                        </span>
                                        {isSelected && (
                                          <Check size={14} className="text-rose-600 shrink-0" />
                                        )}
                                      </div>
                                    </button>
                                  );
                                })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 1.5. قسم الخدمات الخارجية: تفاصيل المريض الخارجي والفحص المطلوب */}
              {isExternalService && (
                <div
                  className={`bg-white rounded-2xl border shadow-xs shrink-0 transition-all ${
                    extServiceDept === 'lab'
                      ? 'border-purple-200/80 bg-gradient-to-b from-purple-50/20 to-white'
                      : 'border-sky-200/80 bg-gradient-to-b from-sky-50/20 to-white'
                  } ${
                    isAddModalFullscreen ? 'p-5 sm:p-6 space-y-4' : 'p-3.5 sm:p-4 space-y-3'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* عنوان القسم وشارة التوضيح */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center font-black transition-colors ${
                          extServiceDept === 'lab'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-sky-100 text-sky-700'
                        }`}
                      >
                        {extServiceDept === 'lab' ? (
                          <FlaskConical size={14} strokeWidth={2.4} />
                        ) : (
                          <Activity size={14} strokeWidth={2.4} />
                        )}
                      </div>
                      <div>
                        <h4 className="font-black text-slate-800 text-xs sm:text-sm">
                          {extServiceDept === 'lab'
                            ? 'بيانات المريض الخارجي والتحليل المطلوب'
                            : 'بيانات المريض الخارجي وفحص الأشعة المطلوب'}
                        </h4>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] sm:text-xs font-black shadow-2xs border ${
                        extServiceDept === 'lab'
                          ? 'bg-purple-50 text-purple-700 border-purple-200/70'
                          : 'bg-sky-50 text-sky-700 border-sky-200/70'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                      <span>{extServiceDept === 'lab' ? 'تحاليل مخبرية خارجية' : 'فحوصات أشعة خارجية'}</span>
                    </span>
                  </div>

                  {/* الصف الأول داخل القسم: اسم المريض الخارجي (8 أعمدة) + رقم الهاتف (4 أعمدة) */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
                    {/* 1. اسم المريض الخارجي */}
                    <div className="lg:col-span-8">
                      <label
                        className={`font-bold text-slate-700 flex items-center gap-1.5 ${
                          isAddModalFullscreen ? 'h-6 text-xs sm:text-sm mb-2' : 'h-5 text-xs mb-1.5'
                        }`}
                      >
                        <User size={isAddModalFullscreen ? 15 : 13} className={extServiceDept === 'lab' ? 'text-purple-600' : 'text-sky-600'} />
                        <span>اسم المريض الخارجي</span>
                        <span className="text-rose-500 font-black">*</span>
                      </label>
                      <div
                        className={`relative flex items-center border rounded-xl overflow-hidden transition-all shadow-xs px-3 gap-2 group bg-white border-slate-200 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 ${
                          isAddModalFullscreen ? 'h-11' : 'h-[38px]'
                        }`}
                      >
                        <div className="shrink-0 text-slate-400 group-focus-within:text-emerald-600 transition-colors">
                          <User size={15} />
                        </div>
                        <input
                          type="text"
                          required
                          value={extPatientName}
                          onChange={(e) => setExtPatientName(e.target.value)}
                          placeholder="اسم المريض الخارجي الرباعي..."
                          className="flex-1 w-full bg-transparent text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none py-1"
                        />
                        {extPatientName && (
                          <button
                            type="button"
                            onClick={() => setExtPatientName('')}
                            className="shrink-0 w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                            title="مسح الاسم"
                          >
                            <X size={11} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 2. رقم الهاتف */}
                    <div className="lg:col-span-4">
                      <label
                        className={`font-bold text-slate-700 flex items-center gap-1.5 ${
                          isAddModalFullscreen ? 'h-6 text-xs sm:text-sm mb-2' : 'h-5 text-xs mb-1.5'
                        }`}
                      >
                        <Phone size={isAddModalFullscreen ? 15 : 13} className={extServiceDept === 'lab' ? 'text-purple-600' : 'text-sky-600'} />
                        <span>رقم الهاتف</span>
                        <span className="text-slate-400 text-[10px] font-normal">(اختياري)</span>
                      </label>
                      <div
                        className={`relative flex items-center border rounded-xl overflow-hidden transition-all shadow-xs px-3 gap-2 group ${
                          isAddModalFullscreen ? 'h-11' : 'h-[38px]'
                        } ${
                          extPatientPhone && extPatientPhone.length >= 2 && !['77', '73', '71', '78', '70'].includes(extPatientPhone.slice(0, 2))
                            ? 'bg-white border-rose-300 focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500'
                            : 'bg-white border-slate-200 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500'
                        }`}
                        dir="ltr"
                      >
                        <div className="shrink-0">
                          <Phone
                            size={14}
                            className={
                              extPatientPhone && extPatientPhone.length >= 2 && !['77', '73', '71', '78', '70'].includes(extPatientPhone.slice(0, 2))
                                ? 'text-rose-500'
                                : 'text-slate-400 group-focus-within:text-emerald-600 transition-colors'
                            }
                          />
                        </div>
                        <input
                          type="tel"
                          dir="ltr"
                          maxLength={9}
                          placeholder="77xxxxxxx"
                          value={extPatientPhone}
                          onChange={(e) => {
                            const eng = e.target.value.replace(/\D/g, '');
                            if (eng.length <= 9) setExtPatientPhone(eng);
                          }}
                          className="flex-1 w-full bg-transparent text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none py-1 text-left"
                        />
                        {extPatientPhone && extPatientPhone.length >= 2 && (
                          <div className="shrink-0">
                            {['77', '73', '71', '78', '70'].includes(extPatientPhone.slice(0, 2)) ? (
                              <div
                                className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-600"
                                title="بادئة صحيحة"
                              >
                                <Check size={11} strokeWidth={3} />
                              </div>
                            ) : (
                              <div
                                className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center text-rose-600"
                                title="البادئة يجب أن تبدأ بـ 77، 73، 71، 78، 70"
                              >
                                <X size={11} strokeWidth={3} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* الصف الثاني داخل القسم: اسم الخدمة المطلوبة + خيار طباعة الأشعة (فقط للأشعة) */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
                    {/* حقل اسم الخدمة المطلوبة */}
                    <div
                      ref={extServiceRef}
                      className={`relative ${
                        extServiceDept === 'radiology' ? 'lg:col-span-7' : 'lg:col-span-12'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <label
                          className={`font-bold text-slate-700 flex items-center gap-1.5 ${
                            isAddModalFullscreen ? 'h-6 text-xs sm:text-sm' : 'h-5 text-xs'
                          }`}
                        >
                          <Tag
                            size={isAddModalFullscreen ? 15 : 13}
                            className={extServiceDept === 'lab' ? 'text-purple-600' : 'text-sky-600'}
                          />
                          <span>
                            {extServiceDept === 'lab' ? 'اسم التحليل المخبري' : 'اسم فحص الأشعة'}
                          </span>
                          <span className="text-rose-500 font-black">*</span>
                        </label>
                      </div>

                      {/* زر فتح القائمة المنسدلة للخدمات */}
                      <div
                        onClick={() => setShowExtServiceDropdown((prev) => !prev)}
                        className={`w-full px-3.5 bg-slate-50/70 hover:bg-white border rounded-xl font-bold flex items-center justify-between gap-2 shadow-2xs transition-all cursor-pointer ${
                          isAddModalFullscreen ? 'h-11 text-xs sm:text-sm' : 'h-[38px] text-xs'
                        } ${
                          showExtServiceDropdown
                            ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/20'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {selectedExtService ? (
                          <div className="flex items-center justify-between w-full gap-2 min-w-0">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                              <span className="font-black text-slate-800 truncate text-xs sm:text-sm">
                                {selectedExtService.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedExtService(null);
                                  setAmount('');
                                }}
                                className="w-5 h-5 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                                title="إلغاء اختيار الخدمة"
                              >
                                <X size={11} strokeWidth={2.5} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-semibold truncate text-xs sm:text-sm">
                            -- اضغط لاختيار {extServiceDept === 'lab' ? 'التحليل المخبري المطلوب' : 'فحص الأشعة المطلوب'} --
                          </span>
                        )}
                        <ChevronDown
                          size={isAddModalFullscreen ? 16 : 14}
                          className={`text-slate-400 shrink-0 transition-transform duration-200 ${
                            showExtServiceDropdown ? 'rotate-180 text-emerald-600' : ''
                          }`}
                        />
                      </div>

                      {/* القائمة المنسدلة للخدمات */}
                      {showExtServiceDropdown && (
                        <div className="absolute right-0 left-0 top-[calc(100%+6px)] bg-white border border-slate-200/90 rounded-2xl shadow-[0_20px_35px_-10px_rgba(15,23,42,0.12),0_0_1px_1px_rgba(15,23,42,0.05)] p-2 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                          {/* حقل البحث في القائمة بتصميم فسيح ومريح */}
                          <div className="pb-2 mb-2 border-b border-slate-100">
                            <div className="relative flex items-center h-9 sm:h-10 bg-slate-50/90 focus-within:bg-white border border-slate-200/90 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 rounded-xl px-3 gap-2.5 transition-all shadow-2xs group">
                              <Search size={15} className="text-slate-400 group-focus-within:text-emerald-600 shrink-0 transition-colors" />
                              <input
                                type="text"
                                autoFocus
                                value={extServiceSearch}
                                onChange={(e) => setExtServiceSearch(e.target.value)}
                                placeholder={`ابحث باسم ${extServiceDept === 'lab' ? 'التحليل المخبري' : 'فحص الأشعة'}...`}
                                className="flex-1 w-full bg-transparent text-xs sm:text-sm font-bold text-slate-800 placeholder-slate-400 focus:outline-none py-1"
                              />
                              {extServiceSearch && (
                                <button
                                  type="button"
                                  onClick={() => setExtServiceSearch('')}
                                  className="shrink-0 w-5 h-5 rounded-full bg-slate-200/80 hover:bg-slate-300 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                                  title="مسح نص البحث"
                                >
                                  <X size={11} strokeWidth={2.5} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* قائمة العناصر */}
                          <div
                            className={`overflow-y-auto custom-scrollbar space-y-1 ${
                              isAddModalFullscreen ? 'max-h-60' : 'max-h-48'
                            }`}
                          >
                            {loadingCatalog ? (
                              <div className="py-6 text-center text-xs text-slate-400 font-bold flex items-center justify-center gap-2">
                                <RefreshCcw size={14} className="animate-spin text-emerald-500" />
                                <span>جاري تحميل قائمة الخدمات...</span>
                              </div>
                            ) : (
                              (() => {
                                const list = (extServiceDept === 'lab' ? labCatalog : radiologyCatalog)
                                  .filter((item) => {
                                    if (!extServiceSearch.trim()) return true;
                                    const q = extServiceSearch.trim().toLowerCase();
                                    return (
                                      (item.name || '').toLowerCase().includes(q) ||
                                      (item.category_name || '').toLowerCase().includes(q)
                                    );
                                  });

                                if (list.length === 0) {
                                  return (
                                    <div className="py-6 text-center text-xs text-slate-400 font-bold">
                                      لا توجد خدمات مطابقة لبحثك
                                    </div>
                                  );
                                }

                                return list.map((item) => {
                                  const isSelected = selectedExtService?.id === item.id;
                                  const itemPrice =
                                    extServiceDept === 'lab'
                                      ? item.price
                                      : extWithFilm
                                      ? (item.price_with_film || item.price)
                                      : (item.price_without_film || item.price);

                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() => {
                                        setSelectedExtService(item);
                                        setShowExtServiceDropdown(false);
                                        setExtServiceSearch('');
                                        setAmount(String(itemPrice || 0));
                                      }}
                                      className={`w-full px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 transition-all cursor-pointer mb-0.5 last:mb-0 text-xs sm:text-sm ${
                                        isSelected
                                          ? 'bg-emerald-50 text-emerald-800 font-black border border-emerald-200/90 shadow-2xs'
                                          : 'text-slate-700 font-bold hover:bg-slate-50 border border-transparent'
                                      }`}
                                    >
                                      {/* اسم الخدمة فقط بدون أي شارة للقسم */}
                                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                        <span
                                          className={`w-2 h-2 rounded-full shrink-0 ${
                                            isSelected
                                              ? 'bg-emerald-600 ring-2 ring-emerald-200'
                                              : 'bg-slate-300'
                                          }`}
                                        />
                                        <span className="truncate font-black text-slate-800">{item.name}</span>
                                      </div>

                                      {/* السعر وعلامة الاختيار */}
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="font-black text-emerald-600 text-xs sm:text-sm tabular-nums">
                                          {formatCurrency(itemPrice)} <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                                        </span>
                                        {isSelected && (
                                          <Check size={14} className="text-emerald-600 shrink-0" strokeWidth={2.5} />
                                        )}
                                      </div>
                                    </button>
                                  );
                                });
                              })()
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* حقل نوع طباعة الأشعة (بعد حقل الخدمات في نفس الصف) */}
                    {extServiceDept === 'radiology' && (
                      <div className="lg:col-span-5 animate-in fade-in duration-200">
                        <label
                          className={`font-bold text-slate-700 flex items-center gap-1.5 ${
                            isAddModalFullscreen ? 'h-6 text-xs sm:text-sm mb-2' : 'h-5 text-xs mb-1.5'
                          }`}
                        >
                          <Film size={isAddModalFullscreen ? 15 : 13} className="text-sky-600" />
                          <span>نوع طباعة الأشعة</span>
                          <span className="text-rose-500 font-black">*</span>
                        </label>
                        <div
                          className={`grid grid-cols-2 gap-1.5 p-1 bg-slate-100/80 border border-slate-200/70 rounded-xl transition-all ${
                            isAddModalFullscreen ? 'h-11' : 'h-[38px]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setExtWithFilm(true)}
                            className={`h-full rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 px-2 ${
                              isAddModalFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
                            } ${
                              extWithFilm
                                ? 'bg-emerald-600 text-white shadow-2xs font-black'
                                : 'text-slate-600 font-bold hover:text-slate-800 hover:bg-white/60'
                            }`}
                          >
                            <Film size={13} strokeWidth={2.4} className="shrink-0" />
                            <span>مع فيلم</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setExtWithFilm(false)}
                            className={`h-full rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 px-2 ${
                              isAddModalFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
                            } ${
                              !extWithFilm
                                ? 'bg-emerald-600 text-white shadow-2xs font-black'
                                : 'text-slate-600 font-bold hover:text-slate-800 hover:bg-white/60'
                            }`}
                          >
                            <span>بدون فيلم (تقرير)</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 2. الصف الثاني: طريقة الدفع + حقل المبلغ والتفقيط (تصميم وتخطيط موحد) + حقل الخدمة المسترجعة أسفلهما في وضع الاسترداد */}
              <div
                className={`bg-white rounded-xl border border-slate-200/60 shadow-xs shrink-0 transition-all ${
                  isAddModalFullscreen ? 'p-5 sm:p-6' : 'p-3.5 sm:p-4'
                }`}
              >
                {/* أ. الصف العلوي الموحد: طريقة الدفع (4 أعمدة) + المبلغ المالي / المسترد (8 أعمدة) */}
                <div
                  className={`grid grid-cols-1 lg:grid-cols-12 items-start ${
                    isAddModalFullscreen ? 'gap-5 sm:gap-6' : 'gap-3.5 sm:gap-4'
                  }`}
                >
                  {/* 1. طريقة الدفع (نقداً - بنكي) — بلون نوع العملية عند التحديد وبدون الأسود والأزرق */}
                  <div className="lg:col-span-4">
                    <label
                      className={`font-bold text-slate-700 flex items-center gap-1.5 ${
                        isAddModalFullscreen ? 'h-6 text-xs sm:text-sm mb-2.5' : 'h-5 text-xs mb-1.5'
                      }`}
                    >
                      <CreditCard
                        size={isAddModalFullscreen ? 15 : 13}
                        className={
                          modalMode === 'income'
                            ? 'text-emerald-600'
                            : modalMode === 'refund'
                            ? 'text-rose-600'
                            : 'text-amber-600'
                        }
                      />
                      <span>طريقة الدفع *</span>
                    </label>

                    <div
                      className={`grid grid-cols-2 gap-1.5 p-1 bg-slate-100/80 border border-slate-200/70 rounded-xl transition-all ${
                        isAddModalFullscreen ? 'h-11' : 'h-[36px]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cash')}
                        className={`h-full rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 px-2 ${
                          isAddModalFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
                        } ${
                          paymentMethod === 'cash'
                            ? modalMode === 'income'
                              ? 'bg-emerald-600 text-white shadow-2xs font-black'
                              : modalMode === 'refund'
                              ? 'bg-rose-600 text-white shadow-2xs font-black'
                              : 'bg-amber-600 text-white shadow-2xs font-black'
                            : 'text-slate-600 font-bold hover:text-slate-800 hover:bg-white/60'
                        }`}
                      >
                        <Wallet size={isAddModalFullscreen ? 15 : 13} strokeWidth={2.4} className="shrink-0" />
                        <span>نقداً</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('bank_transfer')}
                        className={`h-full rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 px-2 ${
                          isAddModalFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
                        } ${
                          paymentMethod === 'bank_transfer'
                            ? modalMode === 'income'
                              ? 'bg-emerald-600 text-white shadow-2xs font-black'
                              : modalMode === 'refund'
                              ? 'bg-rose-600 text-white shadow-2xs font-black'
                              : 'bg-amber-600 text-white shadow-2xs font-black'
                            : 'text-slate-600 font-bold hover:text-slate-800 hover:bg-white/60'
                        }`}
                      >
                        <CreditCard size={isAddModalFullscreen ? 15 : 13} strokeWidth={2.4} className="shrink-0" />
                        <span>بنكي</span>
                      </button>
                    </div>
                  </div>

                  {/* 2. في وضع الاسترداد: حقل الخدمة المسترجعة بدلاً من حقل المبلغ | في الإيراد والمصروف: حقل المبلغ المالي والتفقيط */}
                  {modalMode === 'refund' ? (
                    <div className="lg:col-span-8 relative" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between">
                        <label
                          className={`font-bold text-slate-700 flex items-center gap-1.5 ${
                            isAddModalFullscreen ? 'h-6 text-xs sm:text-sm mb-2.5' : 'h-5 text-xs mb-1.5'
                          }`}
                        >
                          <Tag size={isAddModalFullscreen ? 15 : 13} className="text-rose-600" />
                          <span>الخدمة المسترجعة *</span>
                        </label>
                        {selectedRefundService && (
                          <span
                            className={`font-black text-rose-600 ${
                              isAddModalFullscreen ? 'text-xs' : 'text-[11px]'
                            }`}
                          >
                            مبلغ الاسترداد: {formatCurrency(selectedRefundService.price)} ر.ي
                          </span>
                        )}
                      </div>

                      {!selectedPatient ? (
                        <div
                          className={`w-full px-3.5 bg-slate-50/70 border border-slate-200 rounded-xl text-slate-400 font-semibold flex items-center justify-between select-none ${
                            isAddModalFullscreen ? 'h-11 text-xs sm:text-sm' : 'h-[36px] text-xs'
                          }`}
                        >
                          <span>-- اختر المريض أولاً لعرض الخدمات المؤهلة --</span>
                          <ChevronDown size={isAddModalFullscreen ? 16 : 14} className="text-slate-300" />
                        </div>
                      ) : loadingRefundableServices ? (
                        <div
                          className={`w-full px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-bold flex items-center gap-2 select-none ${
                            isAddModalFullscreen ? 'h-11 text-xs sm:text-sm' : 'h-[36px] text-xs'
                          }`}
                        >
                          <RefreshCcw size={13} className="animate-spin text-rose-500" />
                          <span>جاري جلب الخدمات المؤهلة للاسترداد...</span>
                        </div>
                      ) : refundableServices.length === 0 ? (
                        <div
                          className={`w-full px-3 bg-amber-50/90 border border-amber-200/90 rounded-xl text-amber-900 font-bold flex items-center gap-2 select-none ${
                            isAddModalFullscreen ? 'h-11 text-xs sm:text-sm' : 'h-[36px] text-xs'
                          }`}
                        >
                          <AlertCircle size={15} className="text-amber-600 shrink-0" />
                          <span className="truncate">لا توجد خدمات قابلة للاسترداد لهذه الزيارة</span>
                        </div>
                      ) : (
                        <div className="relative">
                          <div
                            onClick={() => {
                              setShowServiceDropdown((prev) => !prev);
                              setShowPatientDropdown(false);
                              setShowCategoryMenu(false);
                            }}
                            className={`w-full px-3.5 bg-slate-50/70 hover:bg-white border rounded-xl font-bold flex items-center justify-between gap-2 shadow-2xs transition-all cursor-pointer ${
                              isAddModalFullscreen ? 'h-11 text-xs sm:text-sm' : 'h-[36px] text-xs'
                            } ${
                              showServiceDropdown
                                ? 'bg-white border-rose-500 ring-1 ring-rose-500'
                                : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {selectedRefundService ? (
                              <div className="flex items-center justify-between w-full gap-2 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-black shrink-0 border ${getServiceTypeBadge(
                                      selectedRefundService.item_type
                                    )}`}
                                  >
                                    {selectedRefundService.category_label}
                                  </span>
                                  <span className="font-black text-slate-800 truncate">
                                    {selectedRefundService.service_name}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedRefundService(null);
                                    setRefundService('');
                                    setAmount('');
                                  }}
                                  className="w-4 h-4 rounded bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors shrink-0"
                                  title="إلغاء اختيار الخدمة"
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-semibold truncate">
                                -- اختر الخدمة المسترجعة ({refundableServices.length} متاحة) --
                              </span>
                            )}
                            <ChevronDown
                              size={isAddModalFullscreen ? 16 : 14}
                              className={`text-slate-400 shrink-0 transition-transform duration-200 ${
                                showServiceDropdown ? 'rotate-180 text-rose-500' : ''
                              }`}
                            />
                          </div>

                          {showServiceDropdown && (
                            <div className="absolute right-0 left-0 top-full mt-1 bg-white border border-slate-200/90 rounded-xl shadow-[0_12px_28px_rgba(15,23,42,0.12)] p-1.5 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                              <div
                                className={`overflow-y-auto custom-scrollbar space-y-0.5 ${
                                  isAddModalFullscreen ? 'max-h-56' : 'max-h-40'
                                }`}
                              >
                                {refundableServices.map((s) => {
                                  const isSelected =
                                    selectedRefundService?.item_id === s.item_id &&
                                    selectedRefundService?.item_type === s.item_type;
                                  return (
                                    <button
                                      key={`${s.item_type}-${s.item_id}`}
                                      type="button"
                                      onClick={() => {
                                        setSelectedRefundService(s);
                                        setRefundService(s.service_name);
                                        setAmount(String(s.price));
                                        setShowServiceDropdown(false);
                                      }}
                                      className={`w-full px-3 py-2 rounded-lg flex items-center justify-between gap-2 transition-all cursor-pointer mb-0.5 last:mb-0 ${
                                        isAddModalFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
                                      } ${
                                        isSelected
                                          ? 'bg-rose-50/90 text-rose-700 font-black border border-rose-200/60'
                                          : 'text-slate-700 font-bold hover:bg-slate-50 border border-transparent'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <span
                                          className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 border ${getServiceTypeBadge(
                                            s.item_type
                                          )}`}
                                        >
                                          {s.category_label}
                                        </span>
                                        <span className="truncate leading-snug">{s.service_name}</span>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span
                                          className={`font-black text-rose-600 ${
                                            isAddModalFullscreen ? 'text-xs' : 'text-[11px]'
                                          }`}
                                        >
                                          {formatCurrency(s.price)} ر.ي
                                        </span>
                                        {isSelected && (
                                          <Check size={14} className="text-rose-600 shrink-0" />
                                        )}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* في الإيراد والمصروف: حقل المبلغ المالي + التفقيط */
                    <div className="lg:col-span-8">
                      <div
                        className={`flex items-center justify-between ${
                          isAddModalFullscreen ? 'h-6 mb-2.5' : 'h-5 mb-1.5'
                        }`}
                      >
                        <label
                          htmlFor="tx_amount_input"
                          className={`font-bold text-slate-700 flex items-center gap-1.5 ${
                            isAddModalFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
                          }`}
                        >
                          <Wallet
                            size={isAddModalFullscreen ? 15 : 13}
                            className={modalMode === 'income' ? 'text-emerald-600' : 'text-amber-600'}
                          />
                          <span>المبلغ المالي *</span>
                        </label>
                      </div>

                      <div
                        className={`flex items-center flex-nowrap ${
                          isAddModalFullscreen ? 'gap-4' : 'gap-3'
                        }`}
                      >
                        {/* حقل المبلغ */}
                        {isExternalService ? (
                          <div
                            className={`relative flex items-center bg-slate-100/90 border border-slate-200 rounded-xl overflow-hidden transition-all shadow-2xs shrink-0 select-none ${
                              isAddModalFullscreen
                                ? 'h-11 w-64 sm:w-80'
                                : 'h-[36px] w-56 sm:w-64'
                            }`}
                          >
                            <div className="w-10 h-full flex items-center justify-center text-emerald-600 bg-emerald-50/70 border-l border-emerald-200/60 shrink-0">
                              <Lock size={isAddModalFullscreen ? 15 : 13} />
                            </div>
                            <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5 h-full px-1.5" dir="ltr">
                              <span
                                className={`${
                                  isAddModalFullscreen ? 'text-[11px]' : 'text-[10px]'
                                } font-bold text-slate-400 pointer-events-none select-none shrink-0`}
                              >
                                ر.ي
                              </span>
                              <input
                                id="tx_amount_input"
                                type="text"
                                readOnly
                                value={formatAmountInput(amount)}
                                placeholder="0"
                                className={`w-full min-w-0 text-center bg-transparent font-black text-emerald-800 focus:outline-none tabular-nums cursor-default ${
                                  isAddModalFullscreen ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'
                                }`}
                              />
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`relative flex items-center bg-slate-50/70 hover:bg-white focus-within:bg-white border border-slate-200 rounded-xl overflow-hidden transition-all shadow-2xs group shrink-0 ${
                              isAddModalFullscreen
                                ? 'h-11 w-64 sm:w-80'
                                : 'h-[36px] w-56 sm:w-64'
                            } ${
                              modalMode === 'income'
                                ? 'focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500'
                                : 'focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500'
                            }`}
                          >
                            <button
                              type="button"
                              tabIndex="-1"
                              onClick={() => {
                                const current = parseFloat(String(amount).replace(/,/g, '')) || 0;
                                const step = current > 10000 ? 5000 : 1000;
                                const nextVal = Math.max(0, current - step);
                                setAmount(nextVal > 0 ? nextVal.toString() : '');
                              }}
                              disabled={!amount || (parseFloat(String(amount).replace(/,/g, '')) || 0) <= 0}
                              className={`${
                                isAddModalFullscreen ? 'w-10 sm:w-11' : 'w-8 sm:w-9'
                              } h-full flex items-center justify-center text-slate-400 disabled:opacity-30 disabled:hover:bg-transparent transition-colors shrink-0 cursor-pointer border-l border-slate-200/60 ${
                                modalMode === 'income'
                                  ? 'hover:text-emerald-600 hover:bg-emerald-50'
                                  : 'hover:text-amber-600 hover:bg-amber-50'
                              }`}
                              title="إنقاص المبلغ"
                            >
                              <Minus size={isAddModalFullscreen ? 15 : 12} strokeWidth={3} />
                            </button>

                            <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5 h-full px-1.5" dir="ltr">
                              <span
                                className={`${
                                  isAddModalFullscreen ? 'text-[11px]' : 'text-[10px]'
                                } font-bold text-slate-400 pointer-events-none select-none shrink-0`}
                              >
                                ر.ي
                              </span>
                              <input
                                id="tx_amount_input"
                                type="text"
                                inputMode="decimal"
                                lang="en"
                                dir="ltr"
                                required
                                value={formatAmountInput(amount)}
                                onChange={(e) => {
                                  const raw = sanitizeDecimalInput(e.target.value);
                                  setAmount(raw);
                                }}
                                placeholder="0"
                                className={`w-full min-w-0 text-center bg-transparent font-black text-slate-800 focus:outline-none tabular-nums ${
                                  isAddModalFullscreen ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'
                                }`}
                              />
                            </div>

                            <button
                              type="button"
                              tabIndex="-1"
                              onClick={() => {
                                const current = parseFloat(String(amount).replace(/,/g, '')) || 0;
                                const step = current >= 10000 ? 5000 : 1000;
                                const nextVal = current + step;
                                setAmount(nextVal.toString());
                              }}
                              className={`${
                                isAddModalFullscreen ? 'w-10 sm:w-11' : 'w-8 sm:w-9'
                              } h-full flex items-center justify-center text-slate-400 transition-colors shrink-0 cursor-pointer border-r border-slate-200/60 ${
                                modalMode === 'income'
                                  ? 'hover:text-emerald-600 hover:bg-emerald-50'
                                  : 'hover:text-amber-600 hover:bg-amber-50'
                              }`}
                              title="زيادة المبلغ"
                            >
                              <Plus size={isAddModalFullscreen ? 15 : 12} strokeWidth={3} />
                            </button>
                          </div>
                        )}

                        {/* عرض المبلغ كتابةً */}
                        {numericInputAmount > 0 ? (
                          <span
                            className={`flex-1 min-w-0 whitespace-nowrap overflow-x-auto no-scrollbar font-bold leading-none ${
                              isAddModalFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
                            } ${
                              modalMode === 'income' ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {formatTafqeet(numericInputAmount)}
                          </span>
                        ) : (
                          <span
                            className={`flex-1 min-w-0 truncate text-slate-400 font-medium select-none ${
                              isAddModalFullscreen ? 'text-xs' : 'text-[11px]'
                            }`}
                          >
                            أدخل قيمة المبلغ ليتم عرضه كتابةً تلقائياً
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. الصف الثالث: البيان / الملاحظات التوضيحية (أو سبب الاسترداد) — إجباري ويتمدد مع النص */}
              <div
                className={`bg-white rounded-xl border border-slate-200/60 shadow-xs shrink-0 transition-all ${
                  isAddModalFullscreen
                    ? 'p-5 sm:p-6 space-y-2.5'
                    : 'p-3.5 sm:p-4 space-y-2'
                }`}
              >
                <div className="flex items-center justify-between shrink-0">
                  <label
                    htmlFor="tx_desc_input"
                    className={`font-bold text-slate-700 flex items-center gap-1.5 ${
                      isAddModalFullscreen ? 'h-6 text-xs sm:text-sm' : 'h-5 text-xs'
                    }`}
                  >
                    <FileText
                      size={isAddModalFullscreen ? 15 : 13}
                      className={
                        modalMode === 'income'
                          ? 'text-emerald-600'
                          : modalMode === 'refund'
                          ? 'text-rose-600'
                          : 'text-amber-600'
                      }
                    />
                    <span>
                      {modalMode === 'refund'
                        ? 'سبب الاسترداد *'
                        : isExternalService
                        ? 'البيان / الملاحظات التوضيحية (اختياري)'
                        : 'البيان / الملاحظات التوضيحية *'}
                    </span>
                  </label>
                </div>
                <textarea
                  id="tx_desc_input"
                  ref={descTextareaRef}
                  rows={2}
                  required={!isExternalService}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder={
                    isExternalService
                      ? 'أدخل ملاحظات أو بيان إضافي للحركة المالية (اختياري)...'
                      : modalMode === 'refund'
                      ? 'اكتب سبب الاسترداد بوضوح لتوثيقه في السجل المالي...'
                      : 'أدخل وصفاً واضحاً أو تفاصيل إضافية للحركة المالية...'
                  }
                  className={`w-full min-h-[68px] p-3 bg-slate-50/70 focus:bg-white shadow-2xs rounded-xl text-slate-700 font-semibold leading-relaxed focus:outline-none border border-slate-200 transition-all overflow-hidden resize-none placeholder-slate-400 block ${
                    isAddModalFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
                  } ${
                    modalMode === 'income'
                      ? 'focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                      : modalMode === 'refund'
                      ? 'focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                      : 'focus:border-amber-500 focus:ring-1 focus:ring-amber-500'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Modal Footer (Scales with Small / Large Modal Size) */}
          <div
            className={`${
              isAddModalFullscreen ? 'px-7 sm:px-9 py-4' : 'px-5 sm:px-6 py-3'
            } bg-white border-t border-slate-200/80 flex items-center justify-between gap-3 flex-shrink-0 transition-all`}
          >
            <div
              className={`hidden sm:flex items-center gap-1.5 font-bold text-slate-500 ${
                isAddModalFullscreen ? 'text-xs sm:text-sm' : 'text-xs'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  modalMode === 'income'
                    ? 'bg-emerald-500'
                    : modalMode === 'refund'
                    ? 'bg-rose-500'
                    : 'bg-amber-500'
                }`}
              />
              <span>
                {isExternalService
                  ? selectedExtService && extPatientName.trim()
                    ? `طلب خارجي: ${selectedExtService.name} — المريض: ${extPatientName.trim()}`
                    : 'يرجى إدخال اسم المريض الخارجي واختيار الخدمة المطلوبة'
                  : category && numericInputAmount > 0 && desc.trim() && (modalMode !== 'refund' || (selectedPatient && selectedRefundService))
                  ? `التصنيف المحدد: ${CAT_LABEL[category] || category}`
                  : 'يرجى استكمال الحقول المطلوبة لتفعيل زر الحفظ'}
              </span>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleClose}
                disabled={saving}
                className={`${
                  isAddModalFullscreen ? 'px-6 py-3 text-xs sm:text-sm' : 'px-5 py-2.5 text-xs'
                } rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer active:scale-95 disabled:opacity-50`}
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={
                  saving ||
                  !category ||
                  numericInputAmount <= 0 ||
                  (category === 'refund' &&
                    (!desc.trim() || !selectedPatient || !selectedRefundService || refundableServices.length === 0)) ||
                  (isExternalService &&
                    (!extPatientName.trim() || !selectedExtService)) ||
                  (category !== 'refund' && !isExternalService && !desc.trim())
                }
                className={`${
                  isAddModalFullscreen ? 'px-7 py-3 text-xs sm:text-sm' : 'px-6 py-2.5 text-xs'
                } bg-gradient-to-l text-white rounded-xl font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer ${
                  modalMode === 'income'
                    ? 'from-teal-600 to-emerald-500 hover:from-teal-700 hover:to-emerald-600 shadow-emerald-600/20'
                    : modalMode === 'refund'
                    ? 'from-rose-600 to-red-500 hover:from-rose-700 hover:to-red-600 shadow-rose-600/20'
                    : 'from-amber-600 to-orange-500 hover:from-amber-700 hover:to-orange-600 shadow-amber-600/20'
                }`}
              >
                {saving ? (
                  <RefreshCcw size={isAddModalFullscreen ? 16 : 14} className="animate-spin" />
                ) : (
                  <Check size={isAddModalFullscreen ? 16 : 14} strokeWidth={2.5} />
                )}
                <span>
                  {isExternalService
                    ? 'تسجيل الخدمة وإرسالها للقسم'
                    : modalMode === 'income'
                    ? 'تسجيل الإيراد المالي'
                    : modalMode === 'refund'
                    ? 'تأكيد عملية الاسترداد'
                    : 'تسجيل المصروف العام'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default AddTransactionModal;
