import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ArrowDownRight, ArrowUpRight, Package, AlertTriangle, Clock, Activity, FileText, CheckCircle, Search, Filter, Calendar, TrendingUp, TrendingDown, DollarSign, Archive, Download, BellRing, Plus, Minus, Layers, LayoutDashboard, Eye , ChevronRight, ChevronLeft, X, ChevronDown } from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';
import TransactionDetailsModal from '../../components/storeCommon/TransactionDetailsModal';
import taffyot from '../../utils/taffyot';

const formatTafqeet = (val) => {
  const num = parseFloat(val);
  if (!num || num <= 0) return '';
  const cleaned = taffyot(num)
    .replace(/(ريالاً يمنياً|ريال يمني|فقط|لا غير|-)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? `${cleaned} ريال يمني.` : '';
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const [stats, setStats] = useState(null);

  const CARDS = [
    {
      label: 'إجمالي الأصناف',
      rawValue: Number(stats?.totalItems || 0),
      value: (stats?.totalItems || 0).toLocaleString('en-US'),
      unit: 'صنف',
      sub: 'إجمالي الأصناف المعرّفة في المخزن',
      icon: Package,
      color: 'text-indigo-600',
      valColor: 'text-indigo-700',
      bg: 'bg-indigo-100',
      border: 'border-indigo-200'
    },
    {
      label: 'أصناف تحت الحد الأدنى',
      rawValue: Number(stats?.lowStock || 0),
      value: (stats?.lowStock || 0).toLocaleString('en-US'),
      unit: 'صنف',
      sub: 'أرصدة منخفضة تتطلب إعادة التوريد',
      icon: AlertTriangle,
      color: 'text-rose-600',
      valColor: 'text-rose-700',
      bg: 'bg-rose-100',
      border: 'border-rose-200'
    },
    {
      label: 'أصناف وشيكة الانتهاء',
      rawValue: Number(stats?.expiringCount || 0),
      value: (stats?.expiringCount || 0).toLocaleString('en-US'),
      unit: 'صنف',
      sub: 'أصناف منتهية أو تقترب من انتهاء الصلاحية',
      icon: Clock,
      color: 'text-amber-600',
      valColor: 'text-amber-700',
      bg: 'bg-amber-100',
      border: 'border-amber-200'
    },
    {
      label: 'إجمالي القيمة المالية',
      rawValue: Math.round(parseFloat(stats?.totalValue || 0)),
      value: Math.round(parseFloat(stats?.totalValue || 0)).toLocaleString('en-US'),
      unit: 'ر.ي',
      sub: 'التقييم المالي الإجمالي للمخزون الحالي',
      icon: TrendingUp,
      color: 'text-emerald-600',
      valColor: 'text-emerald-700',
      bg: 'bg-emerald-100',
      border: 'border-emerald-200'
    },
  ].filter(s => s.rawValue > 0);
  const [loading, setLoading] = useState(true);
  
  // Transactions Ledger State
  const [txPage, setTxPage] = useState(1);
  const [txDateFilter, setTxDateFilter] = useState('all');
  const [txTypeFilter, setTxTypeFilter] = useState('all');
  const [showTxTypeMenu, setShowTxTypeMenu] = useState(false);
  const [txData, setTxData] = useState([]);
  const [txPagination, setTxPagination] = useState({ page: 1, totalPages: 1 });
  const [txStats, setTxStats] = useState({ totalReceived: 0, totalIssued: 0, receivedCount: 0, issuedCount: 0 });
  const [txLoading, setTxLoading] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  
  // Custom Date States
  const [txStartDate, setTxStartDate] = useState('');
  const [txEndDate, setTxEndDate] = useState('');
  const [txSearch, setTxSearch] = useState('');

  // Filtered transactions for search and counters
  const filteredTransactions = useMemo(() => {
    return (txData || []).filter(tx => {
      if (!txSearch) return true;
      const q = txSearch.toLowerCase();
      return (
        tx.item_name?.toLowerCase().includes(q) ||
        tx.source_entity?.toLowerCase().includes(q) ||
        tx.destination_entity?.toLowerCase().includes(q) ||
        tx.item_unit?.toLowerCase().includes(q)
      );
    });
  }, [txData, txSearch]);

  const txReceivedCount = useMemo(() => filteredTransactions.filter(t => t.transaction_type === 'in').length, [filteredTransactions]);
  const txIssuedCount = useMemo(() => filteredTransactions.filter(t => t.transaction_type === 'out').length, [filteredTransactions]);

  const lastFetchRef = useRef(0);
  const latestSilentUpdate = useSocketStore(s => s.latestSilentUpdate);

  const fetchStats = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchRef.current < 2000) return;
    lastFetchRef.current = now;
    try {
      const res = await fetch('/api/inventory/general/dashboard', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setStats(data);
      } else {
        toast.error('تعذر تحميل بيانات لوحة التحكم، يرجى التحقق من الاتصال بالخادم.', { toastId: 'dashboard-load-error' });
      }
    } catch {
      toast.error('تعذر تحميل بيانات لوحة التحكم، يرجى التحقق من الاتصال بالخادم.', { toastId: 'dashboard-load-error' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleExportLowStock = async () => {
    try {
      const itemsToExport = stats?.lowStockItems || [];
      if (itemsToExport.length === 0) {
        toast.info('لا توجد بيانات للتصدير');
        return;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'نظام إدارة العيادة';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('أصناف_تحت_الحد_الأدنى', {
        views: [{ rightToLeft: true }],
      });

      sheet.columns = [
        { header: '#', key: 'seq', width: 8 },
        { header: 'اسم الصنف', key: 'name', width: 34 },
        { header: 'نوع الصنف', key: 'unit', width: 18 },
        { header: 'الحالة', key: 'status', width: 22 },
        { header: 'الكمية الحالية', key: 'quantity', width: 18 },
        { header: 'الحد الأدنى', key: 'min_quantity', width: 18 },
        { header: 'القيمة الإجمالية', key: 'total_value', width: 24 },
      ];

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 28;

      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0284C7' },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });

      let totalFinancialValue = 0;

      itemsToExport.forEach((item, idx) => {
        const currentQty = parseInt(item.quantity, 10) || 0;
        const minQty = parseInt(item.min_quantity, 10) || 0;
        const costPrice = parseFloat(item.cost_price) || 0;
        const itemTotalVal = currentQty * costPrice;
        totalFinancialValue += itemTotalVal;
        const isOut = currentQty <= 0;

        const addedRow = sheet.addRow({
          seq: idx + 1,
          name: item.name || '-',
          unit: item.unit || '-',
          status: isOut ? 'نفدت الكمية' : 'تحت الحد الأدنى',
          quantity: currentQty,
          min_quantity: minQty,
          total_value: `${Math.round(itemTotalVal).toLocaleString('en-US')} ر.ي`,
        });
        addedRow.height = 24;
      });

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

            if (colNumber === 2 || colNumber === 6 || colNumber === 7) {
              cell.font = { bold: true, color: { argb: 'FF1E293B' } };
            }
            if (colNumber === 4 || colNumber === 5) {
              cell.font = { bold: true, color: { argb: 'FFE11D48' } };
            }
          });
        }
      });

      // Total Financial Value Summary Row
      sheet.addRow([]);
      const totalRowNum = sheet.rowCount + 1;
      const totalRow = sheet.getRow(totalRowNum);
      totalRow.height = 34;

      sheet.mergeCells(`A${totalRowNum}:B${totalRowNum}`);
      const labelCell = sheet.getCell(`A${totalRowNum}`);
      labelCell.value = 'إجمالي القيمة المالية:';
      labelCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      labelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0284C7' },
      };
      labelCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const numCell = sheet.getCell(`C${totalRowNum}`);
      numCell.value = `${Math.round(Math.abs(totalFinancialValue)).toLocaleString('en-US')} ر.ي`;
      numCell.font = { bold: true, size: 12, color: { argb: 'FF1E293B' } };
      numCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      numCell.alignment = { horizontal: 'center', vertical: 'middle' };

      sheet.mergeCells(`D${totalRowNum}:G${totalRowNum}`);
      const spelledCell = sheet.getCell(`D${totalRowNum}`);
      spelledCell.value =
        Math.abs(totalFinancialValue) > 0
          ? formatTafqeet(Math.abs(totalFinancialValue))
          : 'صفر ريال يمني لا غير.';
      spelledCell.font = { bold: true, size: 11, color: { argb: 'FF334155' } };
      spelledCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      };
      spelledCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };

      for (let col = 1; col <= 7; col++) {
        totalRow.getCell(col).border = {
          top: { style: 'medium', color: { argb: 'FF0284C7' } },
          bottom: { style: 'double', color: { argb: 'FF0284C7' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      saveAs(blob, `تقرير_أصناف_تحت_الحد_الأدنى_${new Date().toLocaleDateString('en-CA')}.xlsx`);
      toast.success('تم تصدير قائمة الأصناف تحت الحد الأدنى بنجاح');
    } catch (err) {
      console.error('Export Low Stock Error:', err);
      toast.error('حدث خطأ أثناء تصدير ملف الإكسيل');
    }
  };

  const handleExportExpiring = async () => {
    try {
      const itemsToExport = stats?.expiringItems || [];
      if (itemsToExport.length === 0) {
        toast.info('لا توجد بيانات للتصدير');
        return;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'نظام إدارة العيادة';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('أصناف_وشيكة_أو_منتهية', {
        views: [{ rightToLeft: true }],
      });

      sheet.columns = [
        { header: '#', key: 'seq', width: 8 },
        { header: 'اسم الصنف', key: 'name', width: 34 },
        { header: 'نوع الصنف', key: 'unit', width: 18 },
        { header: 'حالة الصلاحية', key: 'status', width: 24 },
        { header: 'الكمية الحالية', key: 'quantity', width: 18 },
        { header: 'تاريخ الانتهاء', key: 'expiry_date', width: 20 },
        { header: 'القيمة الإجمالية', key: 'total_value', width: 24 },
      ];

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 28;

      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0284C7' },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });

      let totalFinancialValue = 0;

      itemsToExport.forEach((item, idx) => {
        const daysLeft = Math.ceil((new Date(item.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
        const isExpired = daysLeft <= 0;
        const currentQty = parseInt(item.quantity, 10) || 0;
        const costPrice = parseFloat(item.cost_price) || 0;
        const itemTotalVal = currentQty * costPrice;
        totalFinancialValue += itemTotalVal;

        const addedRow = sheet.addRow({
          seq: idx + 1,
          name: item.name || '-',
          unit: item.unit || '-',
          status: isExpired ? 'منتهي الصلاحية' : `ينتهي خلال ${daysLeft} يوم`,
          quantity: currentQty,
          expiry_date: item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-GB') : 'غير محدد',
          total_value: `${Math.round(itemTotalVal).toLocaleString('en-US')} ر.ي`,
        });
        addedRow.height = 24;
      });

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          const isRowExpired = row.getCell(4).value === 'منتهي الصلاحية';
          row.eachCell((cell, colNumber) => {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            };

            if (colNumber === 2 || colNumber === 6 || colNumber === 7) {
              cell.font = { bold: true, color: { argb: 'FF1E293B' } };
            }
            if (colNumber === 4 || colNumber === 5) {
              cell.font = { bold: true, color: { argb: isRowExpired ? 'FFE11D48' : 'FFD97706' } };
            }
          });
        }
      });

      // Total Financial Value Summary Row
      sheet.addRow([]);
      const totalRowNum = sheet.rowCount + 1;
      const totalRow = sheet.getRow(totalRowNum);
      totalRow.height = 34;

      sheet.mergeCells(`A${totalRowNum}:B${totalRowNum}`);
      const labelCell = sheet.getCell(`A${totalRowNum}`);
      labelCell.value = 'إجمالي القيمة المالية:';
      labelCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      labelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0284C7' },
      };
      labelCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const numCell = sheet.getCell(`C${totalRowNum}`);
      numCell.value = `${Math.round(Math.abs(totalFinancialValue)).toLocaleString('en-US')} ر.ي`;
      numCell.font = { bold: true, size: 12, color: { argb: 'FF1E293B' } };
      numCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      numCell.alignment = { horizontal: 'center', vertical: 'middle' };

      sheet.mergeCells(`D${totalRowNum}:G${totalRowNum}`);
      const spelledCell = sheet.getCell(`D${totalRowNum}`);
      spelledCell.value =
        Math.abs(totalFinancialValue) > 0
          ? formatTafqeet(Math.abs(totalFinancialValue))
          : 'صفر ريال يمني لا غير.';
      spelledCell.font = { bold: true, size: 11, color: { argb: 'FF334155' } };
      spelledCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      };
      spelledCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };

      for (let col = 1; col <= 7; col++) {
        totalRow.getCell(col).border = {
          top: { style: 'medium', color: { argb: 'FF0284C7' } },
          bottom: { style: 'double', color: { argb: 'FF0284C7' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      saveAs(blob, `تقرير_أصناف_وشيكة_الانتهاء_${new Date().toLocaleDateString('en-CA')}.xlsx`);
      toast.success('تم تصدير قائمة الأصناف وشيكة الانتهاء بنجاح');
    } catch (err) {
      console.error('Export Expiring Error:', err);
      toast.error('حدث خطأ أثناء تصدير ملف الإكسيل');
    }
  };

  useEffect(() => {
    if (latestSilentUpdate?.type === 'inventory') fetchStats();
  }, [latestSilentUpdate, fetchStats]);

  const fetchTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      let queryUrl = `/api/inventory/general/dashboard/transactions?page=1&limit=10000&dateFilter=${txDateFilter}&typeFilter=${txTypeFilter}&grouped=false`;
      if (txDateFilter === 'custom' && txStartDate && txEndDate) {
        queryUrl += `&startDate=${txStartDate}&endDate=${txEndDate}`;
      }
      const res = await fetch(queryUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setTxData(data.transactions);
        setTxPagination(data.pagination);
        setTxStats(data.stats);
      } else {
        toast.error('تعذر تحميل بيانات لوحة التحكم، يرجى التحقق من الاتصال بالخادم.', { toastId: 'dashboard-load-error' });
      }
    } catch {
      toast.error('تعذر تحميل بيانات لوحة التحكم، يرجى التحقق من الاتصال بالخادم.', { toastId: 'dashboard-load-error' });
    } finally {
      setTxLoading(false);
    }
  }, [token, txPage, txDateFilter, txTypeFilter, txStartDate, txEndDate]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  useEffect(() => {
    if (latestSilentUpdate?.type === 'inventory') fetchTransactions();
  }, [latestSilentUpdate, fetchTransactions]);

  const handleExportTransactions = async () => {
    try {
      if (!filteredTransactions || filteredTransactions.length === 0) {
        toast.info('لا توجد بيانات متاحة للتصدير في القائمة الحالية');
        return;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'نظام إدارة العيادة';
      workbook.created = new Date();

      const sheetName =
        txTypeFilter === 'in'
          ? 'سجل_حركات_الإستلام'
          : txTypeFilter === 'out'
          ? 'سجل_حركات_الصرف'
          : 'سجل_الإجراءات';

      const baseFileName =
        txTypeFilter === 'in'
          ? 'تقرير_حركات_الإستلام'
          : txTypeFilter === 'out'
          ? 'تقرير_حركات_الصرف'
          : 'تقرير_سجل_الإجراءات_الشامل';

      const sheet = workbook.addWorksheet(sheetName, {
        views: [{ rightToLeft: true }],
      });

      sheet.columns = [
        { header: '#', key: 'seq', width: 8 },
        { header: 'نوع الحركة', key: 'type', width: 16 },
        { header: 'الصنف', key: 'item_name', width: 32 },
        { header: 'نوع الصنف', key: 'item_unit', width: 16 },
        { header: 'الكمية', key: 'quantity', width: 16 },
        { header: 'القيمة', key: 'value', width: 22 },
        { header: 'المصدر / الوجهة', key: 'entity', width: 28 },
        { header: 'التاريخ', key: 'datetime', width: 24 },
      ];

      // Royal blue header (matching CashierReports.js)
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 28;

      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0284C7' },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });

      let exportReceivedValue = 0;
      let exportIssuedValue = 0;

      filteredTransactions.forEach((tx, idx) => {
        const isIn = tx.transaction_type === 'in';
        const qty = parseInt(tx.total_quantity || tx.quantity || 0, 10);
        const val = Number(tx.total_value || 0);
        if (isIn) {
          exportReceivedValue += val;
        } else {
          exportIssuedValue += val;
        }

        const typeLabel = isIn ? 'إستلام' : 'صرف';
        const qtyDisplay = `${isIn ? '+' : '-'}${qty.toLocaleString('en-US')}`;
        const valDisplay = `${Math.round(val).toLocaleString('en-US')} ر.ي`;
        const entityText = (isIn ? tx.source_entity : tx.destination_entity) || '-';
        const dateText = `${new Date(tx.created_at).toLocaleDateString('en-GB')} - ${new Date(tx.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;

        const addedRow = sheet.addRow({
          seq: idx + 1,
          type: typeLabel,
          item_name: tx.item_name || '-',
          item_unit: tx.item_unit || '-',
          quantity: qtyDisplay,
          value: valDisplay,
          entity: entityText,
          datetime: dateText,
        });

        addedRow.height = 24;
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

            if (colNumber === 3) {
              cell.font = { bold: true, color: { argb: 'FF1E293B' } };
            }

            if (colNumber === 5) {
              const valStr = String(cell.value || '');
              cell.font = {
                bold: true,
                color: { argb: valStr.startsWith('+') ? 'FF059669' : 'FFE11D48' },
              };
            }

            if (colNumber === 6) {
              cell.font = { bold: true, color: { argb: 'FF1E293B' } };
            }
          });
        }
      });

      // Total Summary Rows (إجمالي قيمة الاستلامات + إجمالي قيمة المصروفات)
      sheet.addRow([]); // Spacing row

      const addSummaryRow = (label, amountVal, isFirst, isLast) => {
        const rowNumber = sheet.rowCount + 1;
        const row = sheet.getRow(rowNumber);
        row.height = 34;

        sheet.mergeCells(`A${rowNumber}:B${rowNumber}`);
        const labelCell = sheet.getCell(`A${rowNumber}`);
        labelCell.value = label;
        labelCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
        labelCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0284C7' },
        };
        labelCell.alignment = { horizontal: 'center', vertical: 'middle' };

        const numCell = sheet.getCell(`C${rowNumber}`);
        numCell.value = `${Math.round(Math.abs(amountVal)).toLocaleString('en-US')} ر.ي`;
        numCell.font = { bold: true, size: 12, color: { argb: 'FF1E293B' } };
        numCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' },
        };
        numCell.alignment = { horizontal: 'center', vertical: 'middle' };

        sheet.mergeCells(`D${rowNumber}:H${rowNumber}`);
        const spelledCell = sheet.getCell(`D${rowNumber}`);
        const tafqeetText =
          Math.abs(amountVal) > 0
            ? formatTafqeet(Math.abs(amountVal))
            : 'صفر ريال يمني لا غير.';
        spelledCell.value = tafqeetText;
        spelledCell.font = { bold: true, size: 11, color: { argb: 'FF334155' } };
        spelledCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
        spelledCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };

        for (let col = 1; col <= 8; col++) {
          row.getCell(col).border = {
            top: isFirst
              ? { style: 'medium', color: { argb: 'FF0284C7' } }
              : { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: isLast
              ? { style: 'double', color: { argb: 'FF0284C7' } }
              : { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          };
        }
      };

      addSummaryRow('إجمالي قيمة الاستلامات:', exportReceivedValue, true, false);
      addSummaryRow('إجمالي قيمة المصروفات:', exportIssuedValue, false, true);

      const buffer = await workbook.xlsx.writeBuffer();
      const filename = `${baseFileName}_${new Date().toLocaleDateString('en-CA')}.xlsx`;
      saveAs(new Blob([buffer]), filename);
      toast.success('تم تصدير ملف الإكسل بنجاح');
    } catch {
      toast.error('تعذر تصدير سجل الحركات، يرجى التحقق من الاتصال بالخادم.', { toastId: 'export-tx-error' });
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-6" dir="rtl">
        {[1,2,3].map(i => <div key={i} className="h-32 bg-white rounded-2xl animate-pulse" />)}
        <div className="col-span-3 h-64 bg-white rounded-2xl animate-pulse mt-6" />
      </div>
    );
  }


  return (
    <div className="min-h-full flex flex-col space-y-6 pb-12" dir="rtl">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-800 text-white flex items-center justify-center shadow-lg">
            <LayoutDashboard size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800">لوحة تحكم المخزن العام</h1>
            <p className="text-sm font-bold text-gray-500 mt-0.5">مراقبة المخزون، الحركات، والتقييم المالي</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/general-store/receive')} className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-xl text-sm font-bold hover:bg-gray-900 transition-colors shadow-sm">
            <Plus size={16} /> إستلام جديد
          </button>
          <button onClick={() => navigate('/general-store/issue')} className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm">
            <Minus size={16} /> صرف للأقسام
          </button>
        </div>
      </div>

      {/* ── Quick Stats Grid (Accountant-Style) ── */}
      {CARDS.length > 0 && (
        <div className={`grid ${
          CARDS.length === 1 ? 'grid-cols-1 sm:max-w-[340px]' :
          CARDS.length === 2 ? 'grid-cols-1 sm:grid-cols-2 sm:max-w-[694px]' :
          CARDS.length === 3 ? 'grid-cols-1 sm:grid-cols-3' :
          'grid-cols-2 md:grid-cols-4'
        } gap-3.5 flex-shrink-0`}>
          {CARDS.map((s, i) => (
            <div key={i} className={`p-4 rounded-2xl border ${s.border} bg-white shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden flex flex-col justify-between isolate group`}>
              <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${s.bg} to-transparent opacity-50 rounded-bl-full z-[-1] transition-transform duration-500 group-hover:scale-110`} />
              <div className="flex justify-between items-center mb-3">
                <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center shadow-sm transition-transform group-hover:scale-105`}>
                  <s.icon size={16} className={s.color} />
                </div>
                <span className={`text-xs font-bold ${s.color}`}>
                  {s.label}
                </span>
              </div>
              <div>
                <p className={`text-xl font-black ${s.valColor || 'text-gray-800'} flex items-baseline justify-end gap-1.5`} dir="ltr">
                  {s.unit ? <span className="text-xs font-bold text-gray-400 uppercase">{s.unit}</span> : null}
                  <span>{s.value}</span>
                </p>
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

      {/* ── Dual Alerts Panels (Middle Row) ── */}
      {((stats?.lowStockItems && stats.lowStockItems.length > 0) || (stats?.expiringItems && stats.expiringItems.length > 0)) && (() => {
        const hasLowStock = Array.isArray(stats?.lowStockItems) && stats.lowStockItems.length > 0;
        const hasExpiring = Array.isArray(stats?.expiringItems) && stats.expiringItems.length > 0;

        return (
          <div className="grid grid-cols-1 gap-6 flex-shrink-0">
            
            {/* First Panel: Low Stock Alerts */}
            {hasLowStock && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 flex flex-col overflow-hidden max-h-[360px]">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-l from-rose-50/40 via-white to-white sticky top-0 z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 shadow-sm">
                      <BellRing size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-gray-800 text-sm">أصناف تحت الحد الأدنى</h3>
                        <span className="bg-rose-100 text-rose-700 py-0.5 px-2.5 rounded-full text-xs font-black border border-rose-200/60">
                          {stats.lowStockItems.length}
                        </span>
                      </div>
                      <p className="text-[11px] font-bold text-gray-400 mt-0.5">أصناف وصلت أو قاربت على النفاد وتتطلب إعادة توريد</p>
                    </div>
                  </div>
                  <button
                    onClick={handleExportLowStock}
                    title="تصدير القائمة"
                    className="text-gray-500 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50/50 transition-all bg-white p-2 rounded-xl shadow-2xs border border-gray-200 cursor-pointer"
                  >
                    <Download size={15} />
                  </button>
                </div>

                <div className="p-4 flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-3.5 content-start">
                  {stats.lowStockItems.map((item) => {
                    const currentQty = parseInt(item.quantity, 10) || 0;
                    const minQty = parseInt(item.min_quantity, 10) || 0;
                    const isOut = currentQty <= 0;

                    return (
                      <div
                        key={item.id}
                        className="relative overflow-hidden isolate flex items-center justify-between gap-3 p-4 rounded-2xl border border-rose-200 bg-white shadow-sm hover:shadow-md transition-all duration-200 group"
                      >
                        <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br bg-rose-100 to-transparent opacity-50 rounded-bl-full z-[-1] transition-transform duration-500 group-hover:scale-110" />

                        {/* Right: Item Icon + 2-Row Info (Name+Unit on top, Status on bottom) */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0 text-rose-600 shadow-sm transition-transform group-hover:scale-105">
                            <AlertTriangle size={18} />
                          </div>
                          <div className="flex flex-col justify-center gap-1.5 min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0 h-5">
                              <p className="font-black text-gray-800 text-sm truncate leading-none" title={item.name}>
                                {item.name}
                              </p>
                              {item.unit && (
                                <span className="text-xs font-bold text-gray-400 shrink-0 leading-none">
                                  {item.unit}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center h-5">
                              <p className="text-[11px] font-bold text-rose-600 leading-none">
                                {isOut ? 'نفدت الكمية' : 'تحت الحد الأدنى'}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Left: Two Aligned Rows (Current Qty on top, Min Qty on bottom) + Icon Action Button */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex flex-col justify-center gap-1.5 text-xs pl-3 border-l border-rose-100">
                            <div className="flex items-center justify-between gap-2.5 whitespace-nowrap h-5">
                              <span className="text-[11px] text-rose-600 font-bold leading-none">الكمية الحالية:</span>
                              <span className="text-xs font-black text-rose-700 leading-none">
                                {currentQty}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2.5 whitespace-nowrap h-5">
                              <span className="text-[11px] text-gray-900 font-bold leading-none">الحد الأدنى:</span>
                              <span className="text-xs font-black text-gray-900 leading-none">
                                {minQty}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => navigate('/general-store/receive')}
                            className="w-9 h-9 flex items-center justify-center bg-gray-50 text-gray-500 rounded-xl hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all duration-200 border border-gray-200/80 shadow-2xs shrink-0 cursor-pointer"
                            title="توريد جديد"
                          >
                            <Plus size={16} strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Second Panel: Expiring Soon */}
            {hasExpiring && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 flex flex-col overflow-hidden max-h-[360px]">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-l from-amber-50/40 via-white to-white sticky top-0 z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 shadow-sm">
                      <Clock size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-gray-800 text-sm">أصناف وشيكة على الانتهاء أو منتهية</h3>
                        <span className="bg-amber-100 text-amber-800 py-0.5 px-2.5 rounded-full text-xs font-black border border-amber-200/60">
                          {stats.expiringItems.length}
                        </span>
                      </div>
                      <p className="text-[11px] font-bold text-gray-400 mt-0.5">أصناف تتطلب متابعة تاريخ الصلاحية أو الصرف العاجل</p>
                    </div>
                  </div>
                  <button
                    onClick={handleExportExpiring}
                    title="تصدير القائمة"
                    className="text-gray-500 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50/50 transition-all bg-white p-2 rounded-xl shadow-2xs border border-gray-200 cursor-pointer"
                  >
                    <Download size={15} />
                  </button>
                </div>

                <div className="p-4 flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-3.5 content-start">
                  {stats.expiringItems.map((item) => {
                    const daysLeft = Math.ceil((new Date(item.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
                    const isExpired = daysLeft <= 0;
                    const currentQty = parseInt(item.quantity, 10) || 0;

                    return (
                      <div
                        key={item.id}
                        className={`relative overflow-hidden isolate flex items-center justify-between gap-3 p-4 rounded-2xl border ${
                          isExpired ? 'border-rose-200' : 'border-amber-200'
                        } bg-white shadow-sm hover:shadow-md transition-all duration-200 group`}
                      >
                        <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${isExpired ? 'bg-rose-100' : 'bg-amber-100'} to-transparent opacity-50 rounded-bl-full z-[-1] transition-transform duration-500 group-hover:scale-110`} />

                        {/* Right: Item Icon + 2-Row Info (Name+Unit on top, Expiry Status on bottom) */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105 ${
                            isExpired
                              ? 'bg-rose-100 text-rose-600'
                              : 'bg-amber-100 text-amber-600'
                          }`}>
                            <Clock size={18} />
                          </div>
                          <div className="flex flex-col justify-center gap-1.5 min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0 h-5">
                              <p className="font-black text-gray-800 text-sm truncate leading-none" title={item.name}>
                                {item.name}
                              </p>
                              {item.unit && (
                                <span className="text-xs font-bold text-gray-400 shrink-0 leading-none">
                                  {item.unit}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center h-5">
                              <p className={`text-[11px] font-bold leading-none ${isExpired ? 'text-rose-600' : 'text-amber-600'}`}>
                                {isExpired ? 'منتهي الصلاحية' : `ينتهي خلال ${daysLeft} يوم`}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Left: Two Aligned Rows (Current Qty on top, Expiry Date on bottom) + Icon Action Button */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className={`flex flex-col justify-center gap-1.5 text-xs pl-3 border-l ${isExpired ? 'border-rose-100' : 'border-amber-100'}`}>
                            <div className="flex items-center justify-between gap-2.5 whitespace-nowrap h-5">
                              <span className={`text-[11px] font-bold leading-none ${isExpired ? 'text-rose-600' : 'text-amber-600'}`}>
                                الكمية الحالية:
                              </span>
                              <span className={`text-xs font-black leading-none ${isExpired ? 'text-rose-700' : 'text-amber-700'}`}>
                                {currentQty}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2.5 whitespace-nowrap h-5">
                              <span className="text-[11px] text-gray-900 font-bold leading-none">تاريخ الانتهاء:</span>
                              <span className="text-xs font-black text-gray-900 leading-none" dir="ltr">
                                {new Date(item.expiry_date).toLocaleDateString('en-GB')}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => navigate('/general-store/issue')}
                            className="w-9 h-9 flex items-center justify-center bg-gray-50 text-gray-500 rounded-xl hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-all duration-200 border border-gray-200/80 shadow-2xs shrink-0 cursor-pointer"
                            title="صرف عاجل"
                          >
                            <Minus size={16} strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Full Width Ledger (Unified Module) ── */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 overflow-hidden flex-shrink-0 flex flex-col">
        
        {/* Sticky Header */}
        <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-gray-100 p-6 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-5">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-100 text-indigo-600 flex items-center justify-center shadow-inner">
               <Layers size={22} />
             </div>
             <div>
               <h3 className="text-xl font-black text-gray-800">سجل الإجراءات</h3>
               <p className="text-slate-500 text-sm font-bold mt-0.5">تتبع حركات المخزون من إستلام وصرف</p>
             </div>
          </div>
          
          <div className="flex items-center gap-3 w-full xl:w-auto">
            <button onClick={handleExportTransactions} className="px-5 py-2.5 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors font-bold rounded-xl text-xs flex items-center gap-2 shadow-sm shrink-0 w-full xl:w-auto justify-center">
              <Download size={16} /> تصدير كـ Excel
            </button>
          </div>
        </div>

        {/* Ledger Body (Filters + Stats + Table) */}
        <div className="p-6 bg-slate-50/30 space-y-6">
          
          {/* Filters Bar (Matching CashierReports.js) */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4 flex-shrink-0">
            <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4">
              
              {/* Search Bar */}
              <div className="relative w-full xl:w-96">
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                    <Search size={16} strokeWidth={2.2} />
                  </div>
                  <input
                    type="text"
                    placeholder="بحث في السجل (الصنف، المصدر...)"
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                    className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-emerald-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-200/60 shadow-xs transition-all"
                  />
                  {txSearch && (
                    <button
                      type="button"
                      onClick={() => setTxSearch('')}
                      className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                      title="مسح البحث"
                    >
                      <div className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                        <X size={12} strokeWidth={2.5} />
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* Time Filter Tabs + Movement Type Dropdown */}
              <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto justify-between xl:justify-end">
                {/* Time Filter Tabs */}
                <div className="flex gap-1 bg-gray-100/90 p-1.5 rounded-2xl text-xs font-bold text-gray-500 overflow-x-auto">
                  {[
                    { id: 'all', label: 'الكل' },
                    { id: 'today', label: 'اليوم' },
                    { id: '7days', label: 'هذا الأسبوع' },
                    { id: '30days', label: 'هذا الشهر' },
                    { id: 'custom', label: 'تاريخ مخصص' },
                  ].map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => { setTxDateFilter(f.id); setTxPage(1); }}
                      className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-bold cursor-pointer ${
                        txDateFilter === f.id
                          ? 'bg-white text-emerald-800 shadow-xs font-black'
                          : 'hover:bg-white/40 text-gray-600'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Movement Type Dropdown (مثل قائمة نوع الحركة في صفحة التقارير المالية) */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowTxTypeMenu(!showTxTypeMenu)}
                    className={`h-10 px-3.5 rounded-2xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                      txTypeFilter !== 'all'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-white text-slate-600 border-slate-200/90 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <Activity size={14} className={txTypeFilter !== 'all' ? 'text-emerald-600' : 'text-slate-400'} />
                    <span>
                      {txTypeFilter === 'all'
                        ? 'نوع الحركة'
                        : txTypeFilter === 'in'
                        ? 'حركات إستلام'
                        : 'حركات صرف'}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`text-slate-400 transition-transform duration-200 ${showTxTypeMenu ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {showTxTypeMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowTxTypeMenu(false)} />
                      <div className="absolute top-full left-0 mt-1.5 w-44 bg-white border border-slate-100 shadow-xl rounded-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 p-1.5 space-y-1">
                        {[
                          { id: 'all', label: 'جميع الحركات', icon: Activity },
                          { id: 'in', label: 'حركات إستلام', icon: ArrowDownToLine },
                          { id: 'out', label: 'حركات صرف', icon: ArrowUpFromLine },
                        ].map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => {
                              setTxTypeFilter(f.id);
                              setShowTxTypeMenu(false);
                              setTxPage(1);
                            }}
                            className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between cursor-pointer ${
                              txTypeFilter === f.id
                                ? 'bg-emerald-50 text-emerald-700 font-black'
                                : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <f.icon size={13} className={txTypeFilter === f.id ? 'text-emerald-600' : 'text-slate-400'} />
                              <span>{f.label}</span>
                            </div>
                            {txTypeFilter === f.id && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Custom Date Range Picker */}
            {txDateFilter === 'custom' && (
              <div className="p-4 bg-emerald-50/40 rounded-2xl border border-emerald-100/80 flex flex-wrap gap-4 items-center animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-800">من تاريخ:</span>
                  <input 
                    type="date" 
                    value={txStartDate} 
                    onChange={e => setTxStartDate(e.target.value)} 
                    className="px-3 py-1.5 bg-white border border-emerald-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-800">إلى تاريخ:</span>
                  <input 
                    type="date" 
                    value={txEndDate} 
                    onChange={e => setTxEndDate(e.target.value)} 
                    className="px-3 py-1.5 bg-white border border-emerald-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2 mr-auto">
                  <button 
                    type="button"
                    onClick={() => { setTxStartDate(''); setTxEndDate(''); setTxDateFilter('all'); setTxPage(1); }}
                    className="px-4 py-1.5 text-xs bg-white text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl font-bold border border-slate-200 transition-colors cursor-pointer"
                  >
                    إعادة تعيين
                  </button>
                  <button 
                    type="button"
                    onClick={() => setTxPage(1)} 
                    disabled={!txStartDate || !txEndDate}
                    className="px-4 py-1.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    تطبيق الفلتر
                  </button>
                </div>
              </div>
            )}

            {/* Results Counter & Reset Filters */}
            <div className="flex justify-between items-center pt-3 border-t border-gray-100/80 text-xs font-semibold text-slate-500">
              <span>
                تم العثور على <span className="text-emerald-700 font-black">{filteredTransactions.length}</span> من الحركات
                {txTypeFilter === 'all' && (
                  <span className="text-slate-500 font-semibold mr-1.5">
                    (<span className="text-emerald-600 font-bold">+{txReceivedCount} إستلام</span> — <span className="text-amber-600 font-bold">-{txIssuedCount} صرف</span>)
                  </span>
                )}
              </span>
              {(txDateFilter !== 'all' || txTypeFilter !== 'all' || txSearch.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setTxSearch('');
                    setTxTypeFilter('all');
                    setTxDateFilter('all');
                    setTxStartDate('');
                    setTxEndDate('');
                    setTxPage(1);
                  }}
                  className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <X size={12} />
                  <span>إعادة تعيين كافة الفلاتر</span>
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto min-h-[300px]">
            {txLoading ? (
              <div className="flex justify-center items-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800"></div>
              </div>
            ) : (
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-3.5 text-center font-black w-12">#</th>
                    <th className="px-4 py-3.5 text-right font-black whitespace-nowrap">نوع الحركة</th>
                    <th className="px-4 py-3.5 text-right font-black">الصنف</th>
                    <th className="px-4 py-3.5 text-right font-black">نوع الصنف</th>
                    <th className="px-4 py-3.5 text-right font-black">الكمية</th>
                    <th className="px-4 py-3.5 text-right font-black">القيمة</th>
                    <th className="px-4 py-3.5 text-right font-black">المصدر / الوجهة</th>
                    <th className="px-4 py-3.5 text-right font-black">التاريخ</th>
                    <th className="px-4 py-3.5 text-center font-black w-16">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredTransactions.length === 0 ? (
                    <tr><td colSpan="9" className="p-12 text-center text-gray-400 font-bold">لا توجد حركات مسجلة مطابقة للبحث</td></tr>
                  ) : (
                    filteredTransactions.map((tx, idx) => (
                      <tr key={tx.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-3 py-3.5 text-center font-bold text-xs text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                            tx.transaction_type === 'in' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100/60' : 'bg-rose-50 text-rose-700 border border-rose-100/60'
                          }`}>
                            {tx.transaction_type === 'in' ? <ArrowDownRight size={14}/> : <ArrowUpRight size={14}/>}
                            {tx.transaction_type === 'in' ? 'إستلام' : 'صرف'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-black text-gray-800">{tx.item_name}</td>
                        <td className="px-4 py-3.5 text-gray-500 font-bold text-xs">{tx.item_unit || '-'}</td>
                        <td className="px-4 py-3.5 text-right">
                          <span dir="ltr" className={`font-black text-base ${tx.transaction_type === 'in' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {tx.transaction_type === 'in' ? '+' : '-'}{parseInt(tx.total_quantity || tx.quantity, 10).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-bold text-gray-700">
                          {Number(tx.total_value || 0).toLocaleString()} <span className="text-[10px] text-gray-400">ر.ي</span>
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 font-bold max-w-[150px] truncate" title={tx.transaction_type === 'in' ? tx.source_entity : tx.destination_entity}>
                          {tx.transaction_type === 'in' ? tx.source_entity : tx.destination_entity}
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 font-bold">
                          <span dir="ltr">{new Date(tx.created_at).toLocaleDateString('en-GB')} - {new Date(tx.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <button 
                            onClick={() => setSelectedTransaction({ ...tx, is_single_view: true })}
                            className="p-2 text-slate-600 hover:text-white bg-slate-100 hover:bg-slate-700 rounded-xl transition-all border border-slate-200/80 shadow-sm cursor-pointer"
                            title="عرض التفاصيل"
                          >
                            <Eye size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
            </div>
          </div>
        </div>
      </div>

      <TransactionDetailsModal 
        isOpen={!!selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        transaction={selectedTransaction}
      />
    </div>
  );
};

export default Dashboard;
