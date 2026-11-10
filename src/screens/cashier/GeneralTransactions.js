import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus, ArrowUpRight, ArrowDownLeft, RotateCcw,
  X, Check, Wallet, Search, FileText, User, TrendingUp,
  TrendingDown, Layers, AlertCircle, Tag, Clock, Activity,
  ChevronDown, RefreshCcw, SlidersHorizontal, Info,
  Calendar, CreditCard, Download
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';
import FinancialRecordModal from '../../components/common/FinancialRecordModal';
import { AddTransactionModal, TransactionDetailsModal } from '../../components/cashier/modals';
import {
  isServiceIncome,
  ROLE_LABEL,
  cleanDescription,
  formatCurrency,
  formatCurrencyInteger,
  formatDateEn,
  formatTimeEn,
  formatTafqeet,
  parseRefundDetails,
  getTransactionCategoryLabel,
  parseServiceOrSurgery,
} from '../../components/cashier/cashierConstants';
import { getCurrentShiftDate } from '../../utils/shiftHelpers';


const GeneralTransactions = () => {
  const { token } = useAuthStore();
  const latestCashierUpdate = useSocketStore(state => state.latestCashierUpdate);
  const lastFetchRef = useRef(0);

  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  // Filters & Search
  const [period, setPeriod]             = useState('all'); // 'all' | 'today' | 'week' | 'month' | 'custom'
  const [from, setFrom]                 = useState('');
  const [to, setTo]                     = useState('');
  const [activeTab, setActiveTab]       = useState('all'); // 'all' | 'income' | 'expense' | 'refunds'
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all'); // 'all' | 'cash' | 'bank_transfer'
  const [showPaymentMethodMenu, setShowPaymentMethodMenu] = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');

  // Modals State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalType, setAddModalType] = useState('income');
  const [selectedTx, setSelectedTx]     = useState(null);

  // Patient Financial Record Modal State
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [recordData, setRecordData]               = useState(null);
  const [recordLoading, setRecordLoading]         = useState(false);


  // Dual-Mode Fetcher (Initial + Silent Real-Time Sync)
  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      setError(false);
      let url = `/api/cashier/general-transactions?period=${period}`;
      if (period === 'custom' && from && to) url += `&from=${from}&to=${to}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
      lastFetchRef.current = Date.now();
    } catch {
      if (!isSilent) {
        setError(true);
        toast.error('فشل تحميل بيانات الإيرادات والمصروفات');
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [token, period, from, to]);

  useEffect(() => {
    if (period !== 'custom' || (period === 'custom' && from && to)) {
      fetchData(false);
    }
  }, [fetchData, period, from, to]);

  const fetchPatientRecord = useCallback(async (patientId, isSilent = false) => {
    if (!patientId) return;
    setSelectedPatientId(patientId);
    if (!isSilent) setRecordLoading(true);
    try {
      const res = await fetch(`/api/cashier/archive/patient/${patientId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setRecordData(await res.json());
      } else if (!isSilent) {
        toast.error('تعذر جلب السجل المالي للمريض');
      }
    } catch {
      if (!isSilent) toast.error('خطأ في الاتصال بالخادم');
    } finally {
      if (!isSilent) setRecordLoading(false);
    }
  }, [token]);

  // Real-Time Silent Sync Bridge
  useEffect(() => {
    if (latestCashierUpdate?.timestamp && latestCashierUpdate.timestamp > lastFetchRef.current) {
      fetchData(true);
      if (selectedPatientId) {
        fetchPatientRecord(selectedPatientId, true);
      }
    }
  }, [latestCashierUpdate, fetchData, selectedPatientId, fetchPatientRecord]);

  const handleOpenAddModal = (defaultType = 'income') => {
    setAddModalType(defaultType);
    setShowAddModal(true);
  };


  // KPI Metrics & Counts
  const stats = useMemo(() => {
    let income = 0, expense = 0, refunds = 0;
    let cashIncome = 0, bankIncome = 0;
    let cashExpense = 0, bankExpense = 0;
    let cashRefunds = 0, bankRefunds = 0;
    let incomeCount = 0, expenseCount = 0, refundCount = 0;

    rows.forEach(r => {
      const amt = parseFloat(r.amount || 0);
      const isRef = Number(r.is_refund) === 1 || r.category === 'refund';
      const isBank = r.payment_method === 'bank_transfer';
      if (isRef) {
        refunds += amt;
        refundCount++;
        if (isBank) bankRefunds += amt;
        else cashRefunds += amt;
      } else if (r.type === 'income') {
        income += amt;
        incomeCount++;
        if (isBank) bankIncome += amt;
        else cashIncome += amt;
      } else if (r.type === 'expense') {
        expense += amt;
        expenseCount++;
        if (isBank) bankExpense += amt;
        else cashExpense += amt;
      }
    });

    const netBalance = income - expense - refunds;
    const cashNet = cashIncome - cashExpense - cashRefunds;
    const bankNet = bankIncome - bankExpense - bankRefunds;

    return {
      totalIncome: income,
      cashIncome,
      bankIncome,
      totalExpense: expense,
      cashExpense,
      bankExpense,
      totalRefunds: refunds,
      cashRefunds,
      bankRefunds,
      netBalance,
      cashNet,
      bankNet,
      incomeCount,
      expenseCount,
      refundCount,
      allCount: rows.length
    };
  }, [rows]);

  const statsCards = useMemo(() => [
    {
      id: 'income',
      label: 'إجمالي الإيرادات',
      value: formatCurrencyInteger(stats.totalIncome),
      unit: 'ر.ي',
      sub: `إجمالي الإيرادات (${stats.incomeCount}) حركة إيداع`,
      breakdown: {
        cash: formatCurrencyInteger(Math.abs(stats.cashIncome)),
        bank: formatCurrencyInteger(Math.abs(stats.bankIncome)),
        cashLabel: 'نقداً',
        bankLabel: 'بنكي',
      },
      icon: TrendingUp,
      color: 'text-emerald-600',
      bg: 'bg-emerald-100',
      border: activeTab === 'income' ? 'border-emerald-300 ring-2 ring-emerald-300/40' : 'border-emerald-200',
      valColor: 'text-gray-800',
      onClick: () => setActiveTab(activeTab === 'income' ? 'all' : 'income')
    },
    {
      id: 'expense',
      label: 'المصروفات العامة',
      value: formatCurrencyInteger(stats.totalExpense),
      unit: 'ر.ي',
      sub: `إجمالي المصروفات (${stats.expenseCount}) حركة صرف`,
      breakdown: {
        cash: formatCurrencyInteger(Math.abs(stats.cashExpense)),
        bank: formatCurrencyInteger(Math.abs(stats.bankExpense)),
        cashLabel: 'نقداً',
        bankLabel: 'بنكي',
      },
      icon: TrendingDown,
      color: 'text-amber-600',
      bg: 'bg-amber-100',
      border: activeTab === 'expense' ? 'border-amber-300 ring-2 ring-amber-300/40' : 'border-amber-200',
      valColor: 'text-gray-800',
      onClick: () => setActiveTab(activeTab === 'expense' ? 'all' : 'expense')
    },
    {
      id: 'refunds',
      label: 'الاستردادات',
      value: formatCurrencyInteger(stats.totalRefunds),
      unit: 'ر.ي',
      sub: `إجمالي المبلغ المسترد (${stats.refundCount}) حركة استرداد`,
      breakdown: {
        cash: formatCurrencyInteger(Math.abs(stats.cashRefunds)),
        bank: formatCurrencyInteger(Math.abs(stats.bankRefunds)),
        cashLabel: 'نقداً',
        bankLabel: 'بنكي',
      },
      icon: RotateCcw,
      color: 'text-rose-600',
      bg: 'bg-rose-100',
      border: activeTab === 'refunds' ? 'border-rose-300 ring-2 ring-rose-300/40' : 'border-rose-200',
      valColor: 'text-gray-800',
      onClick: () => setActiveTab(activeTab === 'refunds' ? 'all' : 'refunds')
    },
    {
      id: 'net',
      label: 'الرصيد الصافي',
      value: formatCurrencyInteger(stats.netBalance),
      unit: 'ر.ي',
      sub: `بعد خصم المصروفات والاستردادات (${stats.allCount}) حركة`,
      breakdown: {
        cash: formatCurrencyInteger(Math.abs(stats.cashNet)),
        bank: formatCurrencyInteger(Math.abs(stats.bankNet)),
        cashLabel: 'نقداً',
        bankLabel: 'بنكي',
      },
      icon: Wallet,
      color: stats.netBalance >= 0 ? 'text-sky-600' : 'text-rose-600',
      bg: stats.netBalance >= 0 ? 'bg-sky-100' : 'bg-rose-100',
      border: activeTab === 'all' ? 'border-sky-200' : (stats.netBalance >= 0 ? 'border-sky-200' : 'border-rose-300'),
      valColor: stats.netBalance >= 0 ? 'text-emerald-700' : 'text-rose-600',
      onClick: () => setActiveTab('all')
    },
  ], [stats, activeTab]);

  const visibleCards = useMemo(() => {
    return statsCards.filter(s => {
      if (loading) return true;
      if (s.id === 'income') return Number(stats.totalIncome || 0) > 0 || Number(stats.incomeCount || 0) > 0;
      if (s.id === 'expense') return Number(stats.totalExpense || 0) > 0 || Number(stats.expenseCount || 0) > 0;
      if (s.id === 'refunds') return Number(stats.totalRefunds || 0) > 0 || Number(stats.refundCount || 0) > 0;
      if (s.id === 'net') return Number(stats.allCount || 0) > 0;
      return false;
    });
  }, [statsCards, stats, loading]);

  const gridColsClass =
    visibleCards.length === 1 ? 'grid-cols-1 sm:max-w-[340px]' :
    visibleCards.length === 2 ? 'grid-cols-1 sm:grid-cols-2 sm:max-w-[694px]' :
    visibleCards.length === 3 ? 'grid-cols-1 sm:grid-cols-3' :
    'grid-cols-2 md:grid-cols-4';

  // Filtered Rows (Type Dropdown + Payment Method + Search Query)
  const filteredRows = useMemo(() => {
    let list = rows;
    if (activeTab === 'income') {
      list = list.filter(r => r.type === 'income' && !(Number(r.is_refund) === 1 || r.category === 'refund'));
    } else if (activeTab === 'expense') {
      list = list.filter(r => r.type === 'expense' && !(Number(r.is_refund) === 1 || r.category === 'refund'));
    } else if (activeTab === 'refunds') {
      list = list.filter(r => Number(r.is_refund) === 1 || r.category === 'refund');
    }

    if (paymentMethodFilter === 'cash') {
      list = list.filter((r) => r.payment_method !== 'bank_transfer');
    } else if (paymentMethodFilter === 'bank_transfer') {
      list = list.filter((r) => r.payment_method === 'bank_transfer');
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.trim().toLowerCase();
    return list.filter(r => {
      const catName = (getTransactionCategoryLabel(r) || '').toLowerCase();
      const descText = (r.description || '').toLowerCase();
      const reasonText = (r.refund_reason || '').toLowerCase();
      const cashier = (r.cashier_name || '').toLowerCase();
      const roleName = (ROLE_LABEL[r.cashier_role] || 'المحاسب').toLowerCase();
      const patient = (r.patient_name || '').toLowerCase();
      const methodText = (r.payment_method === 'bank_transfer' ? 'بنكي تحويل شبكة' : 'نقداً نقدي كاش').toLowerCase();
      const amtStr = String(r.amount || '');
      const idStr = String(r.id || '');
      return (
        catName.includes(q) ||
        descText.includes(q) ||
        reasonText.includes(q) ||
        cashier.includes(q) ||
        roleName.includes(q) ||
        patient.includes(q) ||
        methodText.includes(q) ||
        amtStr.includes(q) ||
        idStr.includes(q)
      );
    });
  }, [rows, activeTab, paymentMethodFilter, searchQuery]);

  // ── Export to Excel (مطابق لصفحة لوحة التحكم في مستخدم الطبيب مع التفقيط والتنسيق المحاسبي) ──

  const exportToExcel = async () => {
    if (!filteredRows || filteredRows.length === 0) {
      toast.warning('لا توجد بيانات للتصدير في هذه التصفية');
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();

      let baseFileName = 'سجل_الإيرادات_والمصروفات_العامة';
      let sheetTitle = 'الإيرادات والمصروفات العامة';

      if (activeTab === 'income') {
        baseFileName = 'سجل_الإيرادات_العامة';
        sheetTitle = 'سجل الإيرادات العامة';
      } else if (activeTab === 'expense') {
        baseFileName = 'سجل_المصروفات_العامة';
        sheetTitle = 'سجل المصروفات العامة';
      } else if (activeTab === 'refunds') {
        baseFileName = 'سجل_الاستردادات_النقدية';
        sheetTitle = 'سجل الاستردادات النقدية';
      }

      const sheet = workbook.addWorksheet(sheetTitle);
      sheet.views = [{ rightToLeft: true }];

      // Columns definition (8 أعمدة متناسقة مطابقة للجدول)
      sheet.columns = [
        { header: '#', key: 'seq', width: 8 },
        { header: 'نوع الحركة', key: 'type', width: 18 },
        { header: 'الفئة التصنيفية', key: 'category', width: 26 },
        { header: 'البيان / تفاصيل الخدمة والسبب', key: 'description', width: 44 },
        { header: 'طريقة الدفع', key: 'payment_method', width: 16 },
        { header: 'المبلغ المالي', key: 'amount', width: 22 },
        { header: 'الموظف المنفذ', key: 'cashier', width: 24 },
        { header: 'التاريخ والوقت', key: 'datetime', width: 24 },
      ];

      // Style Header row (Sky-600)
      sheet.getRow(1).eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0284C7' },
        };
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 12 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });
      sheet.getRow(1).height = 28;

      let exportIncome = 0;
      let exportExpense = 0;
      let exportRefunds = 0;

      filteredRows.forEach((r, idx) => {
        const isRefund = Number(r.is_refund) === 1 || r.category === 'refund';
        const isIncome = r.type === 'income' && !isRefund;
        const amt = parseFloat(r.amount || 0);

        if (isRefund) exportRefunds += amt;
        else if (isIncome) exportIncome += amt;
        else exportExpense += amt;

        const typeLabel = isRefund
          ? 'استرداد نقدي'
          : isServiceIncome(r)
          ? 'إيراد خدمات'
          : isIncome
          ? 'إيراد عام'
          : 'مصروف عام';
        const catLabel = getTransactionCategoryLabel(r);

        // 4. في حالة الاسترداد: عرض كل حقل بشكل منفصل (اسم المريض - الخدمة - السبب)
        let descText = '';
        let lineCount = 1;
        if (isRefund) {
          const refundInfo = parseRefundDetails(r);
          const parts = [];
          if (refundInfo?.patientName) parts.push(`اسم المريض: ${refundInfo.patientName}`);
          if (refundInfo?.service) parts.push(`الخدمة: ${refundInfo.service}`);
          if (refundInfo?.reason) parts.push(`السبب: ${refundInfo.reason}`);

          if (parts.length > 0) {
            descText = parts.join('\n');
            lineCount = parts.length;
          } else {
            descText = r.description || 'استرداد نقدي';
          }
        } else {
          const serviceInfo = parseServiceOrSurgery(r);
          const parts = [];
          if (r.patient_name) parts.push(`المريض: ${r.patient_name}`);
          if (serviceInfo.isSurgery && serviceInfo.name) {
            parts.push(`عملية: ${serviceInfo.name}`);
          } else if (serviceInfo.isService && serviceInfo.name) {
            parts.push(`الخدمة: ${serviceInfo.name}`);
          }
          if (serviceInfo.notes) {
            parts.push(serviceInfo.notes);
          } else if (!serviceInfo.isService && r.description) {
            const desc = cleanDescription(r.description);
            if (desc) parts.push(desc);
          }
          descText = parts.length > 0 ? parts.join('\n') : '—';
          lineCount = parts.length;
        }

        const methodLabel = r.payment_method === 'bank_transfer' ? 'تحويل بنكي' : 'نقداً';
        const cashierText = `${r.cashier_name || 'المحاسب'} (${ROLE_LABEL[r.cashier_role] || 'المحاسب'})`;
        const dateText = `${formatDateEn(r.created_at)} - ${formatTimeEn(r.created_at)}`;
        // 1. ازالة إشارة + و - من حقل المبلغ المالي
        const amountDisplay = `${Math.round(amt).toLocaleString('en-US')} ر.ي`;

        const addedRow = sheet.addRow({
          seq: idx + 1,
          type: typeLabel,
          category: catLabel,
          description: descText,
          payment_method: methodLabel,
          amount: amountDisplay,
          cashier: cashierText,
          datetime: dateText,
        });

        // ضبط الارتفاع ديناميكياً لاستيعاب سطور تفاصيل الاسترداد بشكل منفصل وأنيق
        addedRow.height = lineCount >= 3 ? 48 : lineCount === 2 ? 36 : 24;
      });

      // Style Data rows
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.eachCell((cell, colNumber) => {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            };

            // Column 4 (البيان / تفاصيل الخدمة والسبب): محاذاة يمين مع التفاف النص
            if (colNumber === 4) {
              cell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1, wrapText: true };
            }

            // Column 6 (المبلغ المالي): خط عريض
            if (colNumber === 6) {
              cell.font = { bold: true, color: { argb: 'FF1E293B' } };
            }
          });
        }
      });

      // ─── Total Summary Row (مطابق للوحة تحكم الطبيب مع تحسين وتوسيع الحقول وبدون إشارات أو كلمة سالب) ───
      const netTotal = exportIncome - exportExpense - exportRefunds;
      const relevantTotal =
        activeTab === 'income'
          ? exportIncome
          : activeTab === 'expense'
          ? exportExpense
          : activeTab === 'refunds'
          ? exportRefunds
          : netTotal;

      sheet.addRow([]); // Spacing row

      const totalRowNumber = sheet.rowCount + 1;
      const totalRow = sheet.getRow(totalRowNumber);
      totalRow.height = 34;

      // 3. تحسين وتوسيع حقل عنوان الإجمالي (Col A:B مدمج بعرض 26)
      sheet.mergeCells(`A${totalRowNumber}:B${totalRowNumber}`);
      const labelCell = sheet.getCell(`A${totalRowNumber}`);
      labelCell.value =
        activeTab === 'income'
          ? 'إجمالي الإيرادات:'
          : activeTab === 'expense'
          ? 'إجمالي المصروفات:'
          : activeTab === 'refunds'
          ? 'إجمالي الاستردادات:'
          : 'صافي الرصيد:';
      labelCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      labelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0284C7' },
      };
      labelCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // 2. المبلغ رقماً بدون إشارة + أو - (Col C بعرض 26)
      const numCell = sheet.getCell(`C${totalRowNumber}`);
      numCell.value = `${Math.round(Math.abs(relevantTotal)).toLocaleString('en-US')} ر.ي`;
      numCell.font = { bold: true, size: 12, color: { argb: 'FF1E293B' } };
      numCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      numCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // 2 & 3. المبلغ كتابةً بدون نص "سالب" مدمج عبر الأعمدة (Col D:H بعرض 130)
      sheet.mergeCells(`D${totalRowNumber}:H${totalRowNumber}`);
      const spelledCell = sheet.getCell(`D${totalRowNumber}`);
      const tafqeetText =
        Math.abs(relevantTotal) > 0
          ? formatTafqeet(Math.abs(relevantTotal))
          : 'صفر ريال يمني لا غير.';
      spelledCell.value = tafqeetText;
      spelledCell.font = { bold: true, size: 11, color: { argb: 'FF334155' } };
      spelledCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      };
      spelledCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };

      // أطر محاسبية عريضة ومزدوجة في الأسفل عبر كافة الأعمدة الثمانية
      for (let col = 1; col <= 8; col++) {
        sheet.getRow(totalRowNumber).getCell(col).border = {
          top: { style: 'medium', color: { argb: 'FF0284C7' } },
          bottom: { style: 'double', color: { argb: 'FF0284C7' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const filename = `${baseFileName}_${getCurrentShiftDate()}.xlsx`;
      saveAs(new Blob([buffer]), filename);
      toast.success('تم تصدير ملف الإكسل بنجاح');
    } catch (err) {
      console.error(err);
      toast.error('فشل في تصدير ملف الإكسل');
    }
  };

  return (
    <div className="space-y-6 w-full" dir="rtl">
      {/* ── 1. Page Header Banner (Matching RadiologyInventoryAdmin.js) ──────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 flex-shrink-0 print:hidden">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-600 to-blue-800 text-white flex items-center justify-center shadow-md shadow-sky-500/20 shrink-0">
            <Wallet size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
              الإيرادات والمصروفات العامة
              <span className="relative flex h-3 w-3" title="متصل بالشبكة المحلية">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </h1>
            <p className="text-sm font-bold text-gray-500 mt-0.5">
              تسجيل وإدارة الحركات المالية العامة للعيادة، المصروفات التشغيلية، والاستردادات النقدية
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={exportToExcel}
            className="px-4 py-2.5 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-all font-bold rounded-2xl text-xs md:text-sm flex items-center gap-2 shadow-xs cursor-pointer active:scale-95"
            title="تصدير البيانات المعروضة في القائمة إلى ملف Excel"
          >
            <Download size={16} strokeWidth={2.2} />
            <span>تصدير كـ Excel</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenAddModal('income')}
            className="bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 text-white flex items-center gap-2 text-xs md:text-sm font-black py-2.5 px-4 shadow-sm shadow-sky-600/20 rounded-2xl transition-all active:scale-95 cursor-pointer"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>إضافة حركة مالية</span>
          </button>
        </div>
      </div>

      {/* ── 2. Contextual Quick Stats Grid (Matching Store Items Adaptive Grid & Zero-Suppression) ── */}
      {visibleCards.length > 0 && (
        <div className={`grid ${gridColsClass} gap-3.5 w-full flex-shrink-0`}>
          {visibleCards.map((s, i) => (
            <div
              key={s.id || i}
              onClick={s.onClick}
              className={`p-4 rounded-2xl border ${s.border} bg-white shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden flex flex-col justify-between isolate group cursor-pointer`}
            >
              <div
                className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${s.bg} to-transparent opacity-50 rounded-bl-full z-[-1] transition-transform duration-500 group-hover:scale-110`}
              />
              <div className="flex justify-between items-center mb-3">
                <div
                  className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center shadow-sm transition-transform group-hover:scale-105`}
                >
                  <s.icon size={16} className={s.color} />
                </div>
                <span className={`text-xs font-bold ${s.color}`}>
                  {s.label}
                </span>
              </div>
              <div>
                {loading ? (
                  <div className="space-y-2">
                    <div className="h-7 bg-gray-100 rounded-lg animate-pulse w-24 mr-auto"></div>
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-32 mr-auto"></div>
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-col gap-2">
                      <div className="h-3.5 bg-gray-50 rounded animate-pulse w-full"></div>
                      <div className="h-3.5 bg-gray-50 rounded animate-pulse w-full"></div>
                    </div>
                  </div>
                ) : (
                  <>
                    <p
                      className={`text-xl font-black ${s.valColor || 'text-gray-800'} flex items-baseline justify-end gap-1.5 transition-opacity duration-200`}
                      dir="ltr"
                    >
                      {s.unit ? <span className="text-xs font-bold text-gray-400 uppercase">{s.unit}</span> : null}
                      <span>{s.value}</span>
                    </p>
                    {s.sub ? (
                      <p className="text-[10px] text-gray-400 font-semibold mt-1 truncate text-right" title={s.sub} dir="rtl">
                        {s.sub}
                      </p>
                    ) : null}

                    {/* Cash vs Bank Breakdown (Two Clean Rows, Borderless, Unified Typography) */}
                    {s.breakdown && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100/90 flex flex-col gap-1.5" dir="rtl">
                        {/* Row 1: نقداً */}
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-slate-500 font-bold">
                            <Wallet size={12} className="text-slate-400 shrink-0" strokeWidth={2.2} />
                            <span className="text-xs font-bold text-slate-600">نقداً</span>
                          </div>
                          <div className="flex items-baseline gap-1" dir="ltr">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">ر.ي</span>
                            <span className="text-xs font-black tabular-nums text-slate-800">
                              {String(s.breakdown.cash).replace(/^[+-]/, '').trim()}
                            </span>
                          </div>
                        </div>

                        {/* Row 2: بنكي */}
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-slate-500 font-bold">
                            <CreditCard size={12} className="text-blue-500 shrink-0" strokeWidth={2.2} />
                            <span className="text-xs font-bold text-slate-600">بنكي</span>
                          </div>
                          <div className="flex items-baseline gap-1" dir="ltr">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">ر.ي</span>
                            <span className="text-xs font-black tabular-nums text-slate-800">
                              {String(s.breakdown.bank).replace(/^[+-]/, '').trim()}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 3. Advanced Filter Toolbar (Matching RadiologyInventoryAdmin.js) ──── */}
      <div className="space-y-4">
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4 flex-shrink-0 print:hidden">
          <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4">
            {/* Search Bar */}
            <div className="relative w-full xl:w-96">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                <Search size={16} strokeWidth={2.2} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث في البيان، الفئة، الموظف المنفذ، أو المبلغ..."
                className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-sky-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200/60 shadow-xs transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
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
              {/* Time Filter Pills */}
              <div className="flex gap-1 bg-gray-100/90 p-1.5 rounded-2xl text-xs font-bold text-gray-500 overflow-x-auto">
                {[
                  { id: 'all',    label: 'الكل' },
                  { id: 'today',  label: 'اليوم' },
                  { id: 'week',   label: 'هذا الأسبوع' },
                  { id: 'month',  label: 'هذا الشهر' },
                  { id: 'custom', label: 'تاريخ مخصص' }
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setPeriod(f.id)}
                    className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-bold cursor-pointer ${
                      period === f.id
                        ? 'bg-white text-sky-800 shadow-xs font-black'
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
                  onClick={() => setShowTypeMenu(!showTypeMenu)}
                  className={`h-10 px-3.5 rounded-2xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                    activeTab !== 'all'
                      ? 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
                      : 'bg-white text-slate-600 border-slate-200/90 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  <Activity size={14} className={activeTab !== 'all' ? 'text-sky-600' : 'text-slate-400'} />
                  <span>
                    {activeTab === 'all'
                      ? 'نوع الحركة'
                      : activeTab === 'income'
                      ? 'الإيرادات'
                      : activeTab === 'expense'
                      ? 'المصروفات'
                      : 'الاستردادات'}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-slate-400 transition-transform duration-200 ${showTypeMenu ? 'rotate-180' : ''}`}
                  />
                </button>

                {showTypeMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowTypeMenu(false)} />
                    <div className="absolute top-full left-0 mt-1.5 w-48 bg-white border border-slate-100 shadow-xl rounded-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 p-1.5 space-y-1">
                      {[
                        { id: 'all',     label: 'جميع الحركات', icon: Activity },
                        { id: 'income',  label: 'الإيرادات',     icon: ArrowDownLeft },
                        { id: 'expense', label: 'المصروفات',     icon: ArrowUpRight },
                        { id: 'refunds', label: 'الاستردادات',   icon: RotateCcw },
                      ].map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setActiveTab(f.id);
                            setShowTypeMenu(false);
                          }}
                          className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between cursor-pointer ${
                            activeTab === f.id
                              ? 'bg-sky-50 text-sky-700 font-black'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <f.icon size={13} className={activeTab === f.id ? 'text-sky-600' : 'text-slate-400'} />
                            <span>{f.label}</span>
                          </div>
                          {activeTab === f.id && <span className="w-1.5 h-1.5 rounded-full bg-sky-600" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Payment Method Dropdown */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPaymentMethodMenu(!showPaymentMethodMenu)}
                  className={`h-10 px-3.5 rounded-2xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                    paymentMethodFilter !== 'all'
                      ? 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
                      : 'bg-white text-slate-600 border-slate-200/90 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  <CreditCard size={14} className={paymentMethodFilter !== 'all' ? 'text-sky-600' : 'text-slate-400'} />
                  <span>
                    {paymentMethodFilter === 'all'
                      ? 'طريقة الدفع'
                      : paymentMethodFilter === 'cash'
                      ? 'نقداً'
                      : 'تحويل بنكي'}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-slate-400 transition-transform duration-200 ${showPaymentMethodMenu ? 'rotate-180' : ''}`}
                  />
                </button>

                {showPaymentMethodMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowPaymentMethodMenu(false)} />
                    <div className="absolute top-full left-0 mt-1.5 w-44 bg-white border border-slate-100 shadow-xl rounded-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 p-1.5 space-y-1">
                      {[
                        { id: 'all',           label: 'جميع طرق الدفع', icon: CreditCard },
                        { id: 'cash',          label: 'نقداً',           icon: Wallet },
                        { id: 'bank_transfer', label: 'تحويل بنكي',     icon: CreditCard },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setPaymentMethodFilter(m.id);
                            setShowPaymentMethodMenu(false);
                          }}
                          className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between cursor-pointer ${
                            paymentMethodFilter === m.id
                              ? 'bg-sky-50 text-sky-700 font-black'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <m.icon size={13} className={paymentMethodFilter === m.id ? 'text-sky-600' : 'text-slate-400'} />
                            <span>{m.label}</span>
                          </div>
                          {paymentMethodFilter === m.id && <span className="w-1.5 h-1.5 rounded-full bg-sky-600" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Custom Date Range Picker */}
          {period === 'custom' && (
            <div className="p-4 bg-sky-50/40 rounded-2xl border border-sky-100/80 flex flex-wrap gap-4 items-center animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-sky-800">من تاريخ:</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-sky-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-sky-500 cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-sky-800">إلى تاريخ:</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-sky-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-sky-500 cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-2 mr-auto">
                <button
                  type="button"
                  onClick={() => {
                    setFrom('');
                    setTo('');
                    setPeriod('all');
                  }}
                  className="px-4 py-1.5 text-xs bg-white text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl font-bold border border-slate-200 transition-colors cursor-pointer"
                >
                  إعادة تعيين
                </button>
                <button
                  type="button"
                  onClick={() => fetchData(false)}
                  disabled={!from || !to}
                  className="px-4 py-1.5 bg-sky-600 text-white rounded-xl font-bold text-xs hover:bg-sky-700 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
                >
                  تطبيق الفلتر
                </button>
              </div>
            </div>
          )}

          {/* Counter & Reset Filters */}
          <div className="flex justify-between items-center pt-3 border-t border-gray-100/80 text-xs font-semibold text-slate-500">
            <span>
              تم العثور على <span className="text-sky-700 font-black">{filteredRows.length}</span> من السجلات
            </span>
            {(period !== 'all' || activeTab !== 'all' || paymentMethodFilter !== 'all' || searchQuery.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveTab('all');
                  setPaymentMethodFilter('all');
                  setPeriod('all');
                  setFrom('');
                  setTo('');
                }}
                className="text-[11px] font-bold text-sky-600 hover:text-sky-700 hover:underline cursor-pointer flex items-center gap-1"
              >
                <X size={12} />
                <span>إعادة تعيين كافة الفلاتر</span>
              </button>
            )}
          </div>
        </div>

        {/* ── 4. Proportional Financial Ledger Table (100%: 5% / 12% / 15% / 30% / 13% / 13% / 12%) ── */}
        {error ? (
          <div className="flex flex-col justify-center items-center h-64 text-gray-400 bg-white rounded-3xl border border-rose-100 shadow-sm gap-4">
            <AlertCircle className="text-rose-400" size={48} />
            <p className="text-lg font-bold text-gray-600">تعذر تحميل سجل الحركات المالية</p>
            <button
              type="button"
              onClick={() => fetchData(false)}
              className="px-6 py-2 bg-rose-50 text-rose-600 font-bold rounded-xl hover:bg-rose-100 transition-colors cursor-pointer"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-sm whitespace-nowrap table-fixed">
                <colgroup>
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>
                <thead className="bg-gradient-to-r from-slate-50/90 via-sky-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                  <tr>
                    <th className="w-[4%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                    <th className="w-[10%] px-3 py-4 text-center font-black text-xs text-slate-600">نوع الحركة</th>
                    <th className="w-[14%] px-4 py-4 text-right font-black text-xs text-slate-600">الفئة التصنيفية</th>
                    <th className="w-[28%] px-4 py-4 text-right font-black text-xs text-slate-600">البيان / تفاصيل الخدمة والسبب</th>
                    <th className="w-[9%] px-3 py-4 text-center font-black text-xs text-slate-600">طريقة الدفع</th>
                    <th className="w-[12%] px-4 py-4 text-center font-black text-xs text-slate-600">المبلغ</th>
                    <th className="w-[11%] px-4 py-4 text-right font-black text-xs text-slate-600">الموظف المنفذ</th>
                    <th className="w-[12%] px-4 py-4 text-right font-black text-xs text-slate-600">التاريخ والوقت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/70 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan="8" className="py-12 text-center text-slate-400 font-bold">
                        <div className="flex justify-center items-center h-16">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
                        </div>
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-14 text-center text-slate-400 font-bold">
                        <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <span>
                          {searchQuery
                            ? `لا توجد حركات مالية مطابقة للبحث "${searchQuery}"`
                            : 'لا توجد حركات مالية مسجلة ضمن هذه المعايير'}
                        </span>
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((r, i) => {
                      const isRefund = Number(r.is_refund) === 1 || r.category === 'refund';
                      const isIncome = r.type === 'income' && !isRefund;
                      const amt = parseFloat(r.amount || 0);
                      const refundInfo = isRefund ? parseRefundDetails(r) : null;
                      const serviceInfo = !isRefund ? parseServiceOrSurgery(r) : null;

                      return (
                        <tr
                          key={r.id || i}
                          onClick={() => setSelectedTx(r)}
                          className="hover:bg-sky-50/30 cursor-pointer transition-colors border-b border-slate-100/70 last:border-0"
                        >
                          {/* 1. الترقيم (4%) */}
                          <td className="w-[4%] px-3 py-4 text-center font-black text-slate-400 text-xs align-middle">
                            {i + 1}
                          </td>

                          {/* 2. نوع الحركة (10%) */}
                          <td className="w-[10%] px-3 py-4 text-center whitespace-nowrap align-middle">
                            {isRefund ? (
                              <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100/60 shadow-2xs">
                                <RotateCcw size={12} strokeWidth={2.2} />
                                <span>استرداد</span>
                              </span>
                            ) : isServiceIncome(r) ? (
                              <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100/60 shadow-2xs">
                                <ArrowDownLeft size={12} strokeWidth={2.2} />
                                <span>إيراد خدمات</span>
                              </span>
                            ) : isIncome ? (
                              <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-teal-50 text-teal-700 border border-teal-100/60 shadow-2xs">
                                <ArrowDownLeft size={12} strokeWidth={2.2} />
                                <span>إيراد عام</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100/60 shadow-2xs">
                                <ArrowUpRight size={12} strokeWidth={2.2} />
                                <span>مصروف</span>
                              </span>
                            )}
                          </td>

                          {/* 3. الفئة التصنيفية (14%) */}
                          <td className="w-[14%] px-4 py-4 text-right align-middle">
                            <span className="font-bold text-slate-800 text-sm leading-snug truncate block" title={getTransactionCategoryLabel(r)}>
                              {getTransactionCategoryLabel(r)}
                            </span>
                          </td>

                          {/* 4. البيان / تفاصيل الخدمة والسبب (28%) */}
                          <td className="w-[28%] px-4 py-4 text-right align-middle">
                            {isRefund && refundInfo ? (
                              <div
                                style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}
                                className="flex flex-col gap-1.5 min-w-0 text-right whitespace-normal break-words"
                                dir="rtl"
                              >
                                {(refundInfo.patientName || r.patient_name) && (
                                  <div className="flex flex-col items-start gap-0.5">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200/70 text-xs font-black shadow-2xs">
                                      <User size={11} className="text-sky-600 shrink-0" />
                                      <span>{refundInfo.patientName || r.patient_name}</span>
                                    </span>
                                    {(r.visit_number || r.visit_id) && (
                                      <div className="flex items-center justify-start pr-1">
                                        <span
                                          className="font-bold text-[11px] text-slate-500 tracking-wide"
                                          dir="ltr"
                                        >
                                          {r.visit_number || r.visit_id}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {refundInfo.service && (
                                  <div className="leading-relaxed">
                                    <span className="text-xs font-black text-indigo-600 ml-1.5">الخدمة:</span>
                                    <span className="font-bold text-slate-800 text-sm">{refundInfo.service}</span>
                                  </div>
                                )}
                                {refundInfo.reason && (
                                  <div className="leading-relaxed">
                                    <span className="text-xs font-black text-rose-600 ml-1.5">السبب:</span>
                                    <span className="font-bold text-slate-800 text-sm">{refundInfo.reason}</span>
                                  </div>
                                )}
                                {!refundInfo.patientName && !r.patient_name && !refundInfo.service && !refundInfo.reason && (
                                  <span className="text-xs font-bold text-slate-400">—</span>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1.5 min-w-0 text-right">
                                {r.patient_name && (
                                  <div className="flex flex-col items-start gap-0.5">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200/70 text-xs font-black shadow-2xs">
                                      <User size={11} className="text-sky-600 shrink-0" />
                                      <span>{r.patient_name}</span>
                                    </span>
                                    {(r.visit_number || r.visit_id) && (
                                      <div className="flex items-center justify-start pr-1">
                                        <span
                                          className="font-bold text-[11px] text-slate-500 tracking-wide"
                                          dir="ltr"
                                        >
                                          {r.visit_number || r.visit_id}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {serviceInfo?.isSurgery && serviceInfo.name ? (
                                  <div className="leading-relaxed">
                                    <span className="text-xs font-black text-purple-600 ml-1.5">عملية:</span>
                                    <span className="font-bold text-slate-800 text-sm">{serviceInfo.name}</span>
                                  </div>
                                ) : serviceInfo?.isService && serviceInfo.name ? (
                                  <div className="leading-relaxed">
                                    <span className="text-xs font-black text-indigo-600 ml-1.5">الخدمة:</span>
                                    <span className="font-bold text-slate-800 text-sm">{serviceInfo.name}</span>
                                  </div>
                                ) : null}
                                {serviceInfo?.notes ? (
                                  <div
                                    style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}
                                    className="font-semibold text-slate-600 text-xs leading-relaxed whitespace-normal break-words"
                                    title={serviceInfo.notes}
                                  >
                                    {serviceInfo.notes}
                                  </div>
                                ) : !serviceInfo?.isService && r.description ? (
                                  <div
                                    style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}
                                    className="font-bold text-slate-800 text-sm leading-relaxed whitespace-normal break-words"
                                    title={cleanDescription(r.description)}
                                  >
                                    {cleanDescription(r.description)}
                                  </div>
                                ) : !r.patient_name && !serviceInfo?.name ? (
                                  <span className="text-xs font-bold text-slate-400">—</span>
                                ) : null}
                              </div>
                            )}
                          </td>

                          {/* 5. طريقة الدفع (9%) */}
                          <td className="w-[9%] px-3 py-4 text-center whitespace-nowrap align-middle">
                            {r.payment_method === 'bank_transfer' ? (
                              <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/70 shadow-2xs">
                                <CreditCard size={12} strokeWidth={2.2} className="text-blue-600 shrink-0" />
                                <span>بنكي</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs">
                                <Wallet size={12} strokeWidth={2.2} className="text-slate-600 shrink-0" />
                                <span>نقداً</span>
                              </span>
                            )}
                          </td>

                          {/* 6. المبلغ (12% — Currency on Left of Number) */}
                          <td className="w-[12%] px-4 py-4 text-center align-middle">
                            <span className="inline-flex items-baseline justify-center gap-1.5" dir="ltr">
                              <span className="text-xs font-bold text-slate-400">ر.ي</span>
                              <span
                                className={`text-base font-black tracking-tight ${
                                  isRefund
                                    ? 'text-rose-600'
                                    : isIncome
                                    ? 'text-emerald-600'
                                    : 'text-amber-700'
                                }`}
                              >
                                {isIncome ? '+' : '-'}{formatCurrency(amt)}
                              </span>
                            </span>
                          </td>

                          {/* 7. الموظف المنفذ (11% — Name + Role without Icon) */}
                          <td className="w-[11%] px-4 py-4 text-right align-middle">
                            <div className="flex flex-col gap-0.5 text-right">
                              <span className="text-xs font-bold text-slate-800 truncate block" title={r.cashier_name}>
                                {r.cashier_name || 'غير معروف'}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-400 truncate block">
                                {ROLE_LABEL[r.cashier_role] || 'المحاسب'}
                              </span>
                            </div>
                          </td>

                          {/* 8. التاريخ والوقت (12%) */}
                          <td className="w-[12%] px-4 py-4 text-right align-middle">
                            <div className="space-y-0.5 text-right">
                              <div>
                                <span dir="ltr" className="text-xs font-bold text-slate-700 whitespace-nowrap inline-block">
                                  {formatDateEn(r.created_at)}
                                </span>
                              </div>
                              <div>
                                <span dir="ltr" className="text-[11px] font-semibold text-slate-400 whitespace-nowrap inline-block">
                                  {formatTimeEn(r.created_at)}
                                </span>
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
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          1. ADD TRANSACTION MODAL (إضافة حركة مالية جديدة — Modular Component)
         ══════════════════════════════════════════════════════════════════ */}
      <AddTransactionModal
        isOpen={showAddModal}
        initialType={addModalType}
        token={token}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => fetchData(true)}
      />

      {/* ══════════════════════════════════════════════════════════════════
          2. TRANSACTION DETAILS MODAL (تفاصيل الحركة المالية — Unified Design)
         ══════════════════════════════════════════════════════════════════ */}
      {selectedTx && (
        <TransactionDetailsModal
          transaction={selectedTx}
          onClose={() => setSelectedTx(null)}
          onOpenPatientRecord={(pid) => fetchPatientRecord(pid)}
          title="تفاصيل الحركة المالية — الخزينة العامة"
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          3. PATIENT FINANCIAL RECORD MODAL
         ══════════════════════════════════════════════════════════════════ */}
      {selectedPatientId && (
        <FinancialRecordModal
          token={token}
          recordData={recordData}
          recordLoading={recordLoading}
          onRefresh={() => fetchPatientRecord(selectedPatientId, true)}
          onClose={() => {
            setSelectedPatientId(null);
            setRecordData(null);
          }}
        />
      )}
    </div>
  );
};

export default GeneralTransactions;
