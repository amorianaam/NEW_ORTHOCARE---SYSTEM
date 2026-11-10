import React, { useState, useEffect, useCallback, useRef } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { createPortal } from 'react-dom';
import { Send, Plus, Minus, Trash2, Check, Download, Package, Info, MapPin, FileText, X, History, Eye, Search, Filter, ChevronRight, ChevronLeft, ChevronDown, AlertTriangle, Layers, Truck, Clock } from 'lucide-react';
import { toast } from 'react-toastify';
import { getSmartItemText } from '../../utils/arabicFormatters';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';
import TransactionDetailsModal, { DocumentPreviewOverlay } from '../../components/storeCommon/TransactionDetailsModal';
import BatchDetailsModal from '../../components/storeCommon/BatchDetailsModal';
import LimitExceededModal from '../../components/storeCommon/modals/LimitExceededModal';
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

const getCleanNotes = (rawNotes) => {
  if (!rawNotes) return '—';
  let clean = String(rawNotes);
  if (clean.includes('مرفق الفاتورة:')) {
    clean = clean.split('مرفق الفاتورة:')[0];
  }
  if (clean.includes('مرفق المستند:')) {
    clean = clean.split('مرفق المستند:')[0];
  }
  clean = clean.replace(/\|\s*مرفق.*$/gi, '');
  clean = clean.replace(/\|\s*$/, '').trim();
  return clean || '—';
};


  const DESTINATIONS = [
    { id: 'العيادة (الطبيب)' },
    { id: 'الاستقبال' },
    { id: 'المحاسب (الصندوق)' },
    { id: 'قسم المختبر' },
    { id: 'قسم الأشعة' },
    { id: 'تمريض العمليات' },
    { id: 'مخزن العمليات' },
    { id: 'المخزن العام' },
    { id: 'تالف' },
    { id: 'أخرى' }
  ];

const IssueStock = () => {
  const { token } = useAuthStore();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ destination: '', notes: '', document: null });
  const [issuedItems, setIssuedItems] = useState([{ id: Date.now(), item_id: '', search_name: '', selected_unit: '', available_units: [], quantity: '' }]);
  const [openUnitDropdownIndex, setOpenUnitDropdownIndex] = useState(null);
  const [saving, setSaving] = useState(false);
  const lastFetchRef = useRef(0);
  const fileInputRef = useRef(null);
  const destRef = useRef(null);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [isDestOpen, setIsDestOpen] = useState(false);
  const [quantityWarning, setQuantityWarning] = useState(null);
  const latestSilentUpdate = useSocketStore(s => s.latestSilentUpdate);

  // --- LEDGER STATE ---
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerData, setLedgerData] = useState([]);
  const [ledgerTotalPages, setLedgerTotalPages] = useState(1);
  const [ledgerTotalItems, setLedgerTotalItems] = useState(0);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [showItemMenu, setShowItemMenu] = useState(false);
  const [itemDropdownSearch, setItemDropdownSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  
  // --- PENDING OUTBOUND STATE ---
  const [pendingOutbound, setPendingOutbound] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [processingRevoke, setProcessingRevoke] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  
  const fetchPendingOutbound = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/or/transfers/pending-outbound', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setPendingOutbound(data || []);
      }
    } catch (error) {
      console.error('Error fetching pending outbound transfers:', error);
    } finally {
      setPendingLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPendingOutbound();
  }, [fetchPendingOutbound]);

  useEffect(() => {
    if (['transfer', 'revoke', 'inventory'].includes(latestSilentUpdate?.type)) {
      fetchPendingOutbound();
    }
  }, [latestSilentUpdate, fetchPendingOutbound]);

  const handleRevokeBatch = async (batchRefKey) => {
    setProcessingRevoke(batchRefKey);
    try {
      const res = await fetch(`/api/inventory/or/transfers/batch/${batchRefKey}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'حدث خطأ أثناء الإلغاء');
      
      toast.success('تم إلغاء وسحب الشحنة بنجاح');
      setSelectedBatch(null);
      fetchPendingOutbound();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setProcessingRevoke(null);
    }
  };
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [itemSearchText, setItemSearchText] = useState('');

  const abortControllerRef = useRef(null);

  const fetchLedger = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLedgerLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: ledgerPage,
        limit: 10000,
        typeFilter: 'out',
        search: searchQuery,
        itemId: itemFilter,
        dateFilter: dateFilter !== 'all' ? dateFilter : ''
      });
      if (dateFilter === 'custom') {
        if (startDate) queryParams.append('startDate', startDate);
        if (endDate) queryParams.append('endDate', endDate);
      }
      const res = await fetch(`/api/inventory/or/dashboard/transactions?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal
      });
      const data = await res.json();
      if (res.ok) {
        setLedgerData(data.transactions || []);
        setLedgerTotalPages(data.pagination?.totalPages || 1);
        setLedgerTotalItems(data.pagination?.totalItems || 0);
      } else {
        toast.error('تعذر تحميل بيانات سجل الصرف، يرجى التحقق من الاتصال بالخادم.', { toastId: 'issue-load-error' });
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        toast.error('تعذر تحميل بيانات سجل الصرف، يرجى التحقق من الاتصال بالخادم.', { toastId: 'issue-load-error' });
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setLedgerLoading(false);
      }
    }
  }, [ledgerPage, searchQuery, itemFilter, dateFilter, startDate, endDate, token]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  useEffect(() => {
    setLedgerPage(1);
  }, [searchQuery, itemFilter, dateFilter]);

  const handleExportExcel = async () => {
    try {
      if (!ledgerData || ledgerData.length === 0) {
        toast.info('لا توجد بيانات متاحة للتصدير في القائمة الحالية');
        return;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'نظام إدارة العيادة';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('سجل_الصرف', {
        views: [{ rightToLeft: true }],
      });

      sheet.columns = [
        { header: '#', key: 'seq', width: 8 },
        { header: 'الصنف', key: 'item_name', width: 32 },
        { header: 'نوع الصنف / الوحدة', key: 'item_unit', width: 18 },
        { header: 'الكمية المصروفة', key: 'quantity', width: 18 },
        { header: 'القيمة المالية', key: 'value', width: 22 },
        { header: 'الجهة / القسم المستلم', key: 'destination_entity', width: 28 },
        { header: 'تاريخ الصرف', key: 'created_at', width: 24 },
        { header: 'ملاحظات', key: 'notes', width: 34 },
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

      let totalIssuedValue = 0;
      let totalIssuedQty = 0;

      ledgerData.forEach((tx, idx) => {
        const qty = parseInt(tx.total_quantity || tx.quantity || 0, 10);
        const val = Number(tx.total_value || 0);
        totalIssuedValue += val;
        totalIssuedQty += qty;

        const itemName = tx.items_count > 1 ? getSmartItemText(tx.items_count) : (tx.item_name || '—');
        const itemUnit = tx.items_count > 1 ? 'متعدد' : (tx.item_unit || '—');
        const dateText = `${new Date(tx.created_at).toLocaleDateString('en-GB')} - ${new Date(tx.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;

        const addedRow = sheet.addRow({
          seq: idx + 1,
          item_name: itemName,
          item_unit: itemUnit,
          quantity: `-${qty.toLocaleString('en-US')}`,
          value: `${Math.round(val).toLocaleString('en-US')} ر.ي`,
          destination_entity: tx.destination_entity || '—',
          created_at: dateText,
          notes: getCleanNotes(tx.notes),
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

            if (colNumber === 2) {
              cell.font = { bold: true, color: { argb: 'FF1E293B' } };
            }
            if (colNumber === 4) {
              cell.font = { bold: true, color: { argb: 'FFE11D48' } };
            }
            if (colNumber === 5) {
              cell.font = { bold: true, color: { argb: 'FF0284C7' } };
            }
          });
        }
      });

      sheet.addRow([]);

      const addSummaryRow = (label, mainVal, detailText, isFirst, isLast, mainValColor = 'FF1E293B') => {
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
        numCell.value = mainVal;
        numCell.font = { bold: true, size: 12, color: { argb: mainValColor } };
        numCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' },
        };
        numCell.alignment = { horizontal: 'center', vertical: 'middle' };

        sheet.mergeCells(`D${rowNumber}:H${rowNumber}`);
        const detailCell = sheet.getCell(`D${rowNumber}`);
        detailCell.value = detailText;
        detailCell.font = { bold: true, size: 11, color: { argb: 'FF334155' } };
        detailCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
        detailCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };

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

      const tafqeetText =
        Math.round(Math.abs(totalIssuedValue)) > 0
          ? formatTafqeet(Math.abs(totalIssuedValue))
          : 'صفر ريال يمني لا غير.';

      addSummaryRow(
        'إجمالي القيمة المالية:',
        `${Math.round(Math.abs(totalIssuedValue)).toLocaleString('en-US')} ر.ي`,
        tafqeetText,
        true,
        false,
        'FF0284C7'
      );

      addSummaryRow(
        'إجمالي عمليات الصرف:',
        `${ledgerData.length} عملية صرف`,
        `إجمالي الكميات المصروفة: ${totalIssuedQty.toLocaleString('en-US')} وحدة`,
        false,
        true,
        'FF1E293B'
      );

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      saveAs(blob, `تقرير_سجل_صرف_مخزن_العمليات_${new Date().toLocaleDateString('en-CA')}.xlsx`);
      toast.success('تم تصدير سجل الصرف بنجاح');
    } catch (err) {
      console.error('Export Issue Error:', err);
      toast.error('حدث خطأ أثناء تصدير ملف الإكسيل');
    }
  };

  const fetchItems = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchRef.current < 2000) return;
    lastFetchRef.current = now;
    try {
      const res = await fetch('/api/inventory/or/items', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setItems(Array.isArray(data) ? data.filter(i => i.quantity > 0) : []);
    } catch {
      toast.error('تعذر تحميل بيانات سجل الصرف، يرجى التحقق من الاتصال بالخادم.', { toastId: 'issue-load-error' });
    }
  }, [token]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    if (latestSilentUpdate?.type === 'inventory') {
      fetchItems();
      fetchLedger();
    }
  }, [latestSilentUpdate, fetchItems, fetchLedger]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (destRef.current && !destRef.current.contains(event.target)) {
        setIsDestOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddItem = () => {
    setIssuedItems([...issuedItems, { id: Date.now() + Math.random(), item_id: '', search_name: '', selected_unit: '', available_units: [], quantity: '' }]);
  };

  const handleRemoveItem = (index) => {
    if (issuedItems.length === 1) {
      // If it's the only item, just clear it instead of removing it completely
      const newItems = [...issuedItems];
      newItems[0] = { id: Date.now() + Math.random(), item_id: '', search_name: '', selected_unit: '', available_units: [], quantity: '' };
      setIssuedItems(newItems);
    } else {
      setIssuedItems(issuedItems.filter((_, i) => i !== index));
    }
  };

  const handleChange = (index, field, value) => {
    const newItems = [...issuedItems];
    newItems[index][field] = value;
    setIssuedItems(newItems);
  };

  const handleItemSearchChange = (index, value) => {
    const newItems = [...issuedItems];
    const item = newItems[index];
    item.search_name = value;
    
    const matchedItems = items.filter(i => i.name.trim().toLowerCase() === value.trim().toLowerCase());
    
    if (matchedItems.length === 0) {
      item.item_id = '';
      item.selected_unit = '';
      item.available_units = [];
    } else if (matchedItems.length === 1) {
      item.item_id = matchedItems[0].id;
      item.selected_unit = matchedItems[0].unit || 'بدون نوع';
      item.available_units = [{ unit: matchedItems[0].unit || 'بدون نوع', quantity: matchedItems[0].quantity }];
    } else {
      item.item_id = ''; 
      item.selected_unit = '';
      item.available_units = matchedItems.map(i => ({ unit: i.unit || 'بدون نوع', quantity: i.quantity }));
    }
    
    setIssuedItems(newItems);
  };

  const handleUnitChange = (index, unitValue) => {
    const newItems = [...issuedItems];
    const item = newItems[index];
    item.selected_unit = unitValue;
    
    const exactMatch = items.find(i => 
      i.name.trim().toLowerCase() === item.search_name.trim().toLowerCase() && 
      (i.unit || 'بدون نوع').trim().toLowerCase() === unitValue.trim().toLowerCase()
    );
    item.item_id = exactMatch ? exactMatch.id : '';
    
    setIssuedItems(newItems);
  };

  const handleSubmit = async () => {
    if (!form.destination) return toast.error('الرجاء اختيار الجهة المستفيدة');
    
    if ((form.destination === 'تالف' || form.destination === 'أخرى') && !form.notes.trim()) {
      return toast.error(`يجب كتابة الملاحظات أو سبب الصرف عند اختيار "${form.destination}"`);
    }

    const validItems = issuedItems
      .filter(i => i.item_id && parseFloat(i.quantity) > 0)
      .map(i => ({ ...i, quantity: parseFloat(i.quantity) || 0 }));

    if (validItems.length === 0) return toast.error('الرجاء إدخال صنف واحد على الأقل بكمية صحيحة');

    // Check quantities
    for (let it of validItems) {
      const dbItem = items.find(i => i.id == it.item_id);
      if (dbItem && parseFloat(it.quantity) > parseFloat(dbItem.quantity)) {
        setQuantityWarning({
          itemName: dbItem.name,
          requested: it.quantity,
          available: dbItem.quantity
        });
        return;
      }
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('destination', form.destination);
      if (form.notes) formData.append('notes', form.notes);
      formData.append('items', JSON.stringify(validItems));
      if (form.document) {
        formData.append('document', form.document);
      }

      const res = await fetch('/api/inventory/or/issue', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setIssuedItems([{ id: Date.now(), item_id: '', search_name: '', selected_unit: '', available_units: [], quantity: '' }]);
        setForm({ destination: '', notes: '', document: null });
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchItems();
        fetchLedger();
        fetchPendingOutbound();
      } else {
        toast.error(data.message);
      }
    } catch {
      toast.error('تعذر حفظ عملية الصرف، يرجى التحقق من الاتصال بالخادم.', { toastId: 'issue-submit-error' });
    } finally {
      setSaving(false);
    }
  };


  return (
    <div dir="rtl" className="space-y-6 pb-12">

      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-800 text-white flex items-center justify-center shadow-lg">
            <Send size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800">صرف مواد للأقسام</h1>
            <p className="text-sm font-bold text-gray-500 mt-0.5">توزيع وصرف المواد من مخزن العمليات للجهات المستفيدة</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white border border-gray-200 px-4 py-1.5 rounded-xl text-center flex items-center gap-3 shadow-sm min-w-[160px]">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
              <Package size={16} />
            </div>
            <div className="text-right">
              <span className="text-[10px] block font-black text-gray-500">الأصناف المحددة</span>
              <span className="text-sm font-black text-amber-600">{issuedItems.filter(i => i.item_id).length} أصناف</span>
            </div>
          </div>
        </div>
      </div>

      {/* PENDING OUTBOUND TRANSFERS SECTION */}
      {!pendingLoading && pendingOutbound && pendingOutbound.length > 0 && (
      <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-200/80 mb-6 relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500"></div>
        
        <div className="p-5 border-b border-slate-100 bg-amber-50/30 flex items-center justify-between mb-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-inner">
              <Truck size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">الشحنات الصادرة المعلقة (إلى {[...new Set(pendingOutbound.map(b => b.destination_name).filter(Boolean))].join('، ') || 'المخزن العام'})</h2>
              <p className="text-xs font-bold text-slate-500 mt-1">بانتظار تأكيد الاستلام من الجهات المستفيدة</p>
            </div>
          </div>
          <div className="bg-amber-100 text-amber-700 px-3 py-1 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm border border-amber-200/50">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            {pendingOutbound?.length || 0} شحنات معلقة
          </div>
        </div>

        <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-5 py-3 text-xs font-black text-slate-500">الوجهة المستفيدة</th>
                  <th className="px-5 py-3 text-xs font-black text-slate-500">المحتوى</th>
                  <th className="px-5 py-3 text-xs font-black text-slate-500">تاريخ الإرسال</th>
                  <th className="px-5 py-3 text-xs font-black text-slate-500">إجمالي القيمة</th>
                  <th className="px-5 py-3 text-xs font-black text-slate-500 text-left">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingOutbound.map((batch) => {
                  const grandTotal = batch.items?.reduce((sum, item) => sum + ((parseFloat(item.sent_quantity) || 0) * (parseFloat(item.cost_price) || 0)), 0) || 0;
                  return (
                  <tr key={batch.batch_ref_key} className="hover:bg-amber-50/30 transition-colors group">
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-2 font-bold text-slate-700 text-sm">
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        <span>{batch.destination_name || 'المخزن العام'}</span>
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200">
                        <Package size={14} />
                        {getSmartItemText(batch.item_count, batch.items?.[0]?.item_name || batch.items?.[0]?.name)}
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
                    <td className="px-5 py-4">
                      <span className="font-bold text-emerald-600 text-sm">{grandTotal.toLocaleString()}</span>
                      <span className="text-[10px] text-slate-400 font-bold mr-1">ر.ي</span>
                    </td>
                    <td className="px-5 py-4 text-left">
                      <button 
                        onClick={() => setSelectedBatch(batch)}
                        className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-colors"
                      >
                        <Eye size={14} className="text-slate-400" />
                        عرض التفاصيل
                      </button>
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
      </div>
      )}


      <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
        <div className="flex items-center gap-2.5 pb-3 mb-4 border-b border-slate-50">
          <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 border border-amber-100/50">
            <MapPin size={15} />
          </div>
          <h2 className="font-black text-sm text-slate-800">وجهة الصرف</h2>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 items-end bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
          
          <div className="w-full md:w-64 shrink-0 relative" ref={destRef}>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5">الجهة المستفيدة <span className="text-red-500">*</span></label>
            <div 
              onClick={() => setIsDestOpen(!isDestOpen)}
              className={`w-full bg-white border ${isDestOpen ? 'border-amber-500 ring-1 ring-amber-500' : 'border-slate-200 hover:border-amber-300'} rounded-xl px-3 py-2 text-xs font-bold text-slate-700 transition-all h-[38px] cursor-pointer flex items-center justify-between group`}
            >
              <div className="flex items-center gap-2">
                {form.destination ? (
                  <span className="text-slate-800">{form.destination}</span>
                ) : (
                  <span className="text-slate-400">-- اختر الجهة المستفيدة --</span>
                )}
              </div>
              <ChevronDown size={14} className={`text-slate-400 group-hover:text-amber-500 transition-transform duration-300 ${isDestOpen ? 'rotate-180' : ''}`} />
            </div>
            
            {isDestOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden z-50 animate-fade-in origin-top">
                <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
                  {DESTINATIONS.map((d) => (
                    <div 
                      key={d.id}
                      onClick={() => {
                        setForm({...form, destination: d.id});
                        setIsDestOpen(false);
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                        form.destination === d.id 
                          ? 'bg-amber-50 text-amber-700' 
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{d.id}</span>
                      {form.destination === d.id && <Check size={14} className="mr-auto text-amber-500" />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 w-full">
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5">ملاحظات أو سبب الصرف {(form.destination === 'تالف' || form.destination === 'أخرى') && <span className="text-red-500">*</span>}</label>
            <input type="text" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all h-[38px]" 
              placeholder="مثال: صرف دوري لشهر كذا..." />
          </div>

          <div className="flex-1 w-full">
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5">مستند الصرف (صورة أو PDF)</label>
            <input 
              type="file" 
              accept="image/*,.pdf" 
              ref={fileInputRef}
              onChange={e => {
                if (e.target.files && e.target.files[0]) {
                  setForm({...form, document: e.target.files[0]});
                }
              }}
              className="hidden" 
            />
            {form.document ? (
              <div className="flex items-center justify-between bg-white border border-amber-200 rounded-xl px-2 shadow-sm transition-all h-[38px]">
                <div 
                  className="flex items-center gap-2 overflow-hidden flex-1 cursor-pointer group"
                  onClick={() => setShowFilePreview(true)}
                  title="انقر لمعاينة الملف"
                >
                  <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 shrink-0 overflow-hidden">
                    {form.document.type.startsWith('image/') ? (
                      <img src={URL.createObjectURL(form.document)} className="w-full h-full object-cover group-hover:scale-110 transition-transform" alt="Preview" />
                    ) : (
                      <FileText size={14} />
                    )}
                  </div>
                                    <span className="text-[11px] font-bold text-slate-700 truncate group-hover:text-amber-600 transition-colors" dir="ltr">{form.document.name}</span>
                </div>
                <button 
                  onClick={() => {
                    setForm({...form, document: null});
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-[38px] flex items-center justify-center gap-2 bg-slate-50 hover:bg-amber-50 border border-dashed border-slate-300 hover:border-amber-300 rounded-xl text-xs font-bold text-slate-500 hover:text-amber-700 transition-all shadow-sm"
              >
                <Plus size={14} /> إرفاق ملف
              </button>
            )}
          </div>
        </div>

        {(form.destination === 'المخزن العام' || form.destination === 'قسم الأشعة' || form.destination === 'قسم الاشعة' || form.destination === 'قسم المختبر') && (
          <div className="mt-4 p-3 bg-amber-50/80 border border-amber-200 text-amber-700 rounded-xl flex items-start gap-2 text-xs font-semibold">
            <Info size={16} className="mt-0.5 shrink-0" />
            <p>عند الصرف لـ{form.destination}، سيتم إنشاء <strong>"إشعار إستلام إلكتروني"</strong> ولن تضاف للمخزن لديهم حتى يؤكد المستلم استلامها.</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 mt-6">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 border border-amber-100/50">
              <Package size={15} />
            </div>
            <h2 className="font-black text-sm text-slate-800">الأصناف المنصرفة</h2>
          </div>
          <button onClick={handleAddItem} className="bg-amber-50 text-amber-700 border-none hover:bg-amber-100 flex items-center gap-2 text-[11px] font-black py-2 px-4 rounded-xl transition-all shadow-sm">
            <Plus size={14} /> إضافة صنف
          </button>
        </div>

        <datalist id="items-datalist">
          {[...new Set(items.map(i => i.name))].map((name, idx) => <option key={idx} value={name} />)}
        </datalist>

        <div className="space-y-4">
          {issuedItems.map((item, index) => {
            const selectedItem = items.find(i => i.id == item.item_id);
            const available = selectedItem ? parseInt(selectedItem.quantity, 10) : 0;
            const unit = selectedItem ? selectedItem.unit : '';

            return (
              <div key={item.id} className="flex flex-col md:flex-row items-end gap-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100 hover:border-amber-200 transition-colors shadow-sm">
                
                <div className="w-full md:w-[35%] shrink-0">
                  <div className="flex items-center justify-between mb-1.5 px-1">
                    <label className="block text-[11px] font-bold text-slate-500">بحث واختيار الصنف</label>
                    {item.item_id ? (
                      <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100/50">
                        <Check size={12} /> متوفر
                      </span>
                    ) : item.search_name && item.available_units?.length > 1 ? (
                      <span className="text-[10px] font-bold text-orange-600 flex items-center gap-1 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100/50">
                        <Info size={12} /> اختر النوع
                      </span>
                    ) : item.search_name ? (
                      <span className="text-[10px] font-bold text-red-500 flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded-md border border-red-100/50">
                        <X size={12} /> غير موجود
                      </span>
                    ) : null}
                  </div>
                  <input 
                    list="items-datalist" 
                    value={item.search_name || ''} 
                    onChange={e => handleItemSearchChange(index, e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all h-[38px]" 
                    placeholder="اكتب للبحث عن الصنف..."
                  />
                </div>

                <div className="w-full md:w-32 shrink-0 relative">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 px-1">نوع الصنف</label>
                  {(!item.available_units || item.available_units.length <= 1) ? (
                    <input
                      type="text"
                      disabled
                      value={item.selected_unit || ''}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 cursor-not-allowed transition-all h-[38px]"
                      placeholder="-"
                    />
                  ) : (
                    <div className="relative">
                      <div 
                        onClick={() => setOpenUnitDropdownIndex(openUnitDropdownIndex === index ? null : index)}
                        className={`w-full bg-white border ${openUnitDropdownIndex === index ? 'border-amber-500 ring-1 ring-amber-500' : 'border-slate-200 hover:border-amber-300'} rounded-xl px-3 py-2 text-[11px] font-bold text-slate-700 transition-all h-[38px] cursor-pointer flex items-center justify-between group`}
                      >
                        <span className="truncate">{item.selected_unit || 'اختر...'}</span>
                        <ChevronDown size={14} className={`text-slate-400 group-hover:text-amber-500 transition-transform duration-200 ${openUnitDropdownIndex === index ? 'rotate-180 text-amber-500' : ''}`} />
                      </div>
                      
                      {openUnitDropdownIndex === index && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setOpenUnitDropdownIndex(null)}></div>
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden z-50 animate-fade-in origin-top">
                            <div className="max-h-48 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
                              {item.available_units.map((u, i) => (
                                <div 
                                  key={i} 
                                  onClick={() => {
                                    handleUnitChange(index, u.unit);
                                    setOpenUnitDropdownIndex(null);
                                  }}
                                  className={`px-3 py-2 text-[11px] font-bold rounded-xl cursor-pointer transition-all flex items-center justify-between border ${item.selected_unit === u.unit ? 'bg-amber-50 text-amber-700 border-amber-200/60' : 'text-slate-600 border-transparent hover:bg-amber-50/40 hover:text-amber-600 hover:border-amber-200/40'}`}
                                >
                                  <span className="truncate">{u.unit}</span>
                                  {item.selected_unit === u.unit && <Check size={14} />}
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="w-full md:w-32 shrink-0">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 px-1">الكمية</label>
                  <div className="relative flex items-center h-[38px] bg-white border border-slate-200 rounded-xl overflow-hidden focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500 transition-all shadow-sm group">
                    <button 
                      type="button"
                      tabIndex="-1"
                      onClick={() => handleChange(index, 'quantity', Math.max(1, (parseInt(item.quantity || 0) - 1)))}
                      className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                    >
                      <Minus size={14} strokeWidth={3} />
                    </button>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      dir="ltr"
                      value={item.quantity} 
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        handleChange(index, 'quantity', val);
                      }}
                      className="flex-1 w-full min-w-0 bg-transparent text-xs font-black text-slate-700 text-center focus:outline-none" 
                      placeholder="0" 
                    />
                    <button 
                      type="button"
                      tabIndex="-1"
                      onClick={() => handleChange(index, 'quantity', (parseInt(item.quantity || 0) + 1))}
                      className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                    >
                      <Plus size={14} strokeWidth={3} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-2.5 w-full md:w-auto shrink-0 md:mr-2">
                  <div className={`h-[38px] flex items-center justify-center gap-1.5 px-4 rounded-xl border-none shrink-0 w-full md:w-auto transition-colors ${available < item.quantity ? 'bg-red-50' : 'bg-amber-50'}`}>
                    <span className={`text-[11px] font-bold ${available < item.quantity ? 'text-red-600/80' : 'text-amber-600/80'}`}>المتوفر:</span>
                    <span className={`font-black text-[13px] ${available < item.quantity ? 'text-red-700' : 'text-amber-700'}`} dir="ltr">
                      {available}
                    </span>
                  </div>
                </div>

                <div className="flex items-center w-full md:w-auto flex-1 justify-end shrink-0">
                  <button onClick={() => handleRemoveItem(index)} disabled={issuedItems.length === 1 && !item.search_name && !item.quantity}
                    title="حذف الصنف"
                    className="w-full md:w-10 h-[38px] flex items-center justify-center rounded-xl bg-white border border-red-100 text-red-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 disabled:opacity-50 transition-all shrink-0 shadow-sm mt-4 md:mt-0">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 pt-5 border-t border-slate-100 flex items-center justify-end">
          <button onClick={handleSubmit} disabled={saving}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black py-2.5 px-8 rounded-xl text-sm shadow-md shadow-amber-200/50 flex items-center justify-center gap-2 transition-all w-full md:w-auto">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
            اعتماد وصرف
          </button>
        </div>
      </div>

      
      {/* ========================================= */}
      {/* 2. BOTTOM SECTION: HISTORICAL LEDGER      */}
      {/* ========================================= */}
      <div className="mt-8 pt-8 border-t border-slate-200">
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 border border-slate-200 shadow-sm">
                <History size={20} />
              </div>
              <h2 className="text-lg font-black text-slate-800">
                سجل الصرف
                {ledgerTotalItems > 0 && <span className="mr-2 text-[11px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">(تم العثور على {ledgerTotalItems} عملية صرف)</span>}
              </h2>
            </div>
            
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={ledgerLoading || ledgerData.length === 0}
              className="bg-white text-amber-600 hover:bg-amber-50 hover:text-amber-700 font-black text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all border border-amber-200/60 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed self-start sm:self-auto"
              title="تصدير سجل الصرف كـ Excel"
            >
              <Download size={15} strokeWidth={2.5} />
              <span>تصدير كـ Excel</span>
            </button>
          </div>

          {/* --- FILTER BAR (Matching CashierReports.js) --- */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4 mb-4 flex-shrink-0">
            <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4">
              
              {/* Search by Receipt / Employee */}
              <div className="relative w-full xl:w-96">
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                    <Search size={16} strokeWidth={2.2} />
                  </div>
                  <input
                    type="text"
                    placeholder="بحث برقم الإيصال، الموظف، الصنف..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-amber-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-200/60 shadow-xs transition-all"
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
              </div>

              {/* Time Filter Tabs + Items Dropdown */}
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
                      onClick={() => { setDateFilter(f.id); setLedgerPage(1); }}
                      className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-bold cursor-pointer ${
                        dateFilter === f.id
                          ? 'bg-white text-amber-800 shadow-xs font-black'
                          : 'hover:bg-white/40 text-gray-600'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Items Dropdown (مثل قائمة نوع الحركة في صفحة لوحة التحكم) */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowItemMenu(!showItemMenu)}
                    className={`h-10 px-3.5 rounded-2xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                      itemFilter
                        ? 'bg-amber-50 border-amber-300 text-amber-800 font-black'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Package size={14} className={itemFilter ? 'text-amber-600' : 'text-slate-500'} />
                    <span className="max-w-[130px] truncate">
                      {itemFilter ? (items.find(i => i.id == itemFilter)?.name || 'صنف محدد') : 'الأصناف: الكل'}
                    </span>
                    <ChevronDown size={14} className={`transition-transform duration-200 text-slate-400 ${showItemMenu ? 'rotate-180' : ''}`} />
                  </button>

                  {showItemMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowItemMenu(false)} />
                      <div className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                        <div className="relative mb-2">
                          <input
                            type="text"
                            placeholder="بحث في الأصناف..."
                            value={itemDropdownSearch}
                            onChange={(e) => setItemDropdownSearch(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-amber-500"
                            autoFocus
                          />
                        </div>
                        <div className="max-h-56 overflow-y-auto space-y-0.5 custom-scrollbar">
                          <button
                            type="button"
                            onClick={() => {
                              setItemFilter('');
                              setItemSearchText('');
                              setShowItemMenu(false);
                              setLedgerPage(1);
                            }}
                            className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between cursor-pointer ${
                              !itemFilter ? 'bg-amber-50 text-amber-700 font-black' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <span>جميع الأصناف</span>
                            {!itemFilter && <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />}
                          </button>
                          {items
                            .filter(item => !itemDropdownSearch || item.name.toLowerCase().includes(itemDropdownSearch.toLowerCase()))
                            .map(item => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  setItemFilter(item.id);
                                  setItemSearchText(item.name);
                                  setShowItemMenu(false);
                                  setLedgerPage(1);
                                }}
                                className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between cursor-pointer ${
                                  itemFilter == item.id ? 'bg-amber-50 text-amber-700 font-black' : 'text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                <span className="truncate">{item.name}</span>
                                {itemFilter == item.id && <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />}
                              </button>
                            ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Custom Date Range Picker */}
            {dateFilter === 'custom' && (
              <div className="p-4 bg-amber-50/40 rounded-2xl border border-amber-100/80 flex flex-wrap gap-4 items-center animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-800">من تاريخ:</span>
                  <input 
                    type="date" 
                    value={startDate} 
                    onChange={e => setStartDate(e.target.value)} 
                    className="px-3 py-1.5 bg-white border border-amber-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-800">إلى تاريخ:</span>
                  <input 
                    type="date" 
                    value={endDate} 
                    onChange={e => setEndDate(e.target.value)} 
                    className="px-3 py-1.5 bg-white border border-amber-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2 mr-auto">
                  <button 
                    type="button"
                    onClick={() => { setStartDate(''); setEndDate(''); setDateFilter('all'); setLedgerPage(1); }}
                    className="px-4 py-1.5 text-xs bg-white text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl font-bold border border-slate-200 transition-colors cursor-pointer"
                  >
                    إعادة تعيين
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setLedgerPage(1); fetchLedger(); }} 
                    disabled={!startDate || !endDate}
                    className="px-4 py-1.5 bg-amber-600 text-white rounded-xl font-bold text-xs hover:bg-amber-700 shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    تطبيق الفلتر
                  </button>
                </div>
              </div>
            )}

            {/* Results Counter & Reset Filters */}
            <div className="flex justify-between items-center pt-3 border-t border-gray-100/80 text-xs font-semibold text-slate-500">
              <span>
                تم العثور على <span className="text-amber-700 font-black">{ledgerTotalItems}</span> من عمليات الصرف
              </span>
              {(dateFilter !== 'all' || itemFilter || searchQuery.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setItemFilter('');
                    setItemSearchText('');
                    setItemDropdownSearch('');
                    setShowItemMenu(false);
                    setDateFilter('all');
                    setStartDate('');
                    setEndDate('');
                    setLedgerPage(1);
                  }}
                  className="text-[11px] font-bold text-amber-600 hover:text-amber-700 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <X size={12} />
                  <span>إعادة تعيين كافة الفلاتر</span>
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto min-h-[300px] rounded-2xl border border-slate-200">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-4 text-center font-black w-[5%]">#</th>
                  <th className="px-5 py-4 text-right font-black w-[27%]">الصنف</th>
                  <th className="px-5 py-4 text-right font-black w-[12%]">نوع الصنف</th>
                  <th className="px-5 py-4 text-right font-black w-[15%]">الكمية</th>
                  <th className="px-5 py-4 text-right font-black w-[18%]">الجهة / القسم</th>
                  <th className="px-5 py-4 text-right font-black w-[18%]">التاريخ</th>
                  <th className="px-5 py-4 text-center font-black w-[5%]">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {ledgerLoading && ledgerData.length === 0 ? (
                  <tr><td colSpan="7" className="p-12 text-center text-slate-400 font-bold">جاري التحميل...</td></tr>
                ) : ledgerData.length === 0 ? (
                  <tr><td colSpan="7" className="p-12 text-center text-slate-400 font-bold">لا يوجد عمليات صرف حديثة</td></tr>
                ) : (
                  ledgerData.map((tx, idx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3 py-4 text-center font-bold text-xs text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="px-5 py-4 font-black text-slate-800 truncate max-w-[250px]" title={tx.item_name}>
                        {tx.items_count > 1 ? (
                          <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-lg text-xs font-black">
                            <Layers size={12} /> {getSmartItemText(tx.items_count)}
                          </span>
                        ) : (
                          tx.item_name
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-500 font-bold text-xs">{tx.items_count > 1 ? '-' : (tx.item_unit || '-')}</td>
                      <td className="px-5 py-4 text-right">
                        <span dir="ltr" className="font-black text-amber-600 text-base">
                          -{parseInt(tx.total_quantity || tx.quantity, 10).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-600 font-bold max-w-[180px] truncate" title={tx.destination_entity || 'غير محدد'}>
                        {tx.destination_entity || 'غير محدد'}
                      </td>
                      <td className="px-5 py-4 text-slate-500 font-bold">
                        <span dir="ltr">{new Date(tx.created_at).toLocaleDateString('en-GB')} - {new Date(tx.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <button 
                          className="p-2 text-amber-600 hover:text-white bg-amber-50 hover:bg-amber-600 rounded-xl transition-all border border-amber-100 shadow-sm"
                          title="عرض التفاصيل"
                          onClick={() => setSelectedTransaction(tx)}
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </div>
      </div>
      
      
      <BatchDetailsModal mode="outbound" themeColor="amber"
        isOpen={!!selectedBatch}
        onClose={() => setSelectedBatch(null)}
        batch={selectedBatch}
        onRevoke={handleRevokeBatch}
        isProcessing={processingRevoke === selectedBatch?.batch_ref_key}
      />

      <TransactionDetailsModal storeType="or"
        isOpen={!!selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        transaction={selectedTransaction}
      />
      {showFilePreview && form.document && (
        <DocumentPreviewOverlay 
          fileUrl={URL.createObjectURL(form.document)} 
          fileType={form.document.type}
          onClose={() => setShowFilePreview(false)} 
        />
      )}

      {/* Modal for Quantity Warning */}
      <LimitExceededModal 
        quantityWarning={quantityWarning} 
        onClose={() => setQuantityWarning(null)} 
      />
    </div>
  );
};

export default IssueStock;
