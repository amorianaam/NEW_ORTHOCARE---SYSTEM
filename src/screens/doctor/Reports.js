import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { createPortal } from 'react-dom';
import PatientQueueCard from '../../components/common/PatientQueueCard';
import PatientEMRModal from '../../components/common/PatientEMRModal';
import {
  TrendingUp, Users, Tag, Award, Calendar, RefreshCcw,
  Layers, FlaskConical, Radiation, ShieldAlert, Eye, X, BookOpen, Clock,
  ArrowUpRight, Printer, CheckCircle, LayoutGrid, List,
  Search, User, Phone, Maximize2, Minimize2, Download, ChevronLeft, ChevronRight, Crown, RotateCcw, Scissors
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';
import taffyot from '../../utils/taffyot';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { getCurrentShiftDate, getShiftWeekStartDate, getShiftMonthStartDate, formatShiftDate } from '../../utils/shiftHelpers';

export default function DoctorReports() {
  const { token } = useAuthStore();
  const headers = { Authorization: `Bearer ${token}` };

  // Data States
  const [completedCases, setCompletedCases] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [exemptions, setExemptions] = useState([]);
  const [vipExemptions, setVipExemptions] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const isInitialMount = useRef(true);

  // Filters & Tabs
  const [dateFilter, setDateFilter] = useState('all'); // 'all' | 'today' | 'week' | 'month' | 'custom'
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [activeTab, setActiveTab] = useState('cases'); // 'cases' | 'discounts' | 'exemptions'
  const [viewMode, setViewMode] = usePersistentState('global_layout_preference', 'list'); // 'list' | 'grid'
  const [selectedCase, setSelectedCase] = useState(null);
  const [isMaximized, setIsMaximized] = usePersistentState('doctor_modal_maximized_preference', false);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected EMR Patient View
  const [selectedEMRPatient, setSelectedEMRPatient] = useState(null);
  const [patientHistory, setPatientHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedEMRVisit, setSelectedEMRVisit] = useState(null);
  const [prescriptionItems, setPrescriptionItems] = useState([]);
  const [loadingPrescription, setLoadingPrescription] = useState(false);
  const [emrTab, setEmrTab] = useState('timeline');



  // ─── Historic EMR Loading ─────────────────────────────────────────
  const handleOpenEMR = async (patient) => {
    const patientId = patient.patient_id || patient.id;
    const patientFullName = patient.full_name || patient.patient_name || patient.name || '';
    const normalizedPatient = {
      ...patient,
      id: patientId,
      patient_id: patientId,
      full_name: patientFullName,
      name: patientFullName,
    };

    setSelectedEMRPatient(normalizedPatient);
    setPatientHistory([]);
    setSelectedEMRVisit(null);
    setPrescriptionItems([]);
    setEmrTab('timeline');

    try {
      setHistoryLoading(true);
      const res = await axios.get(`/api/doctor/patient/${patientId}/history`, { headers });
      const visits = Array.isArray(res.data) ? res.data : [];
      setPatientHistory(visits);
      
      // Auto-select matching visit if possible, or latest visit
      if (visits.length > 0) {
        const targetVisitId = patient.visit_id || patient.visitId;
        const targetVisitNumber = patient.visit_number;
        const matchingVisit = visits.find(v => (targetVisitId && v.id === targetVisitId) || (targetVisitNumber && v.visit_number === targetVisitNumber)) || visits[0];
        handleSelectVisit(matchingVisit);
      }
    } catch {
      toast.error('فشل تحميل السجل التاريخي للمريض');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSelectVisit = async (visit) => {
    setSelectedEMRVisit(visit);
    setPrescriptionItems([]);
    setLoadingPrescription(true);

    try {
      const prescRes = await axios.get(`/api/doctor/visit/${visit.id}/prescription`, { headers });
      if (prescRes.data && prescRes.data.items) {
        setPrescriptionItems(prescRes.data.items);
      }
    } catch {
      setPrescriptionItems([]);
    } finally {
      setLoadingPrescription(false);
    }
  };

  const handlePrintPrescription = () => {
    if (!selectedEMRVisit) return;
    const printContent = document.getElementById('print-area').innerHTML;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>طباعة الوصفة الطبية</title>
          <style>
            body { font-family: 'Arial', sans-serif; direction: rtl; text-align: right; padding: 40px; }
            .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; text-align: center; }
            .title { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
            .patient-info { display: grid; grid-cols: 2; gap: 15px; margin-bottom: 30px; background: #f9f9f9; padding: 15px; border-radius: 8px; }
            .rx-title { font-size: 20px; font-weight: bold; color: #1e3a8a; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 15px; }
            .item { margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #eee; }
            .footer { margin-top: 50px; text-align: center; border-top: 1px solid #ddd; padding-top: 15px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          ${printContent}
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ─── Format Date/Time Helper in English (Doctor Dashboard Style) ──
  const formatDateTimeEn = (isoStr) => {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);

    const pad = (n) => n.toString().padStart(2, '0');
    const date = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;

    let hours = d.getHours();
    const minutes = pad(d.getMinutes());
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const time = `${pad(hours)}:${minutes} ${ampm}`;

    return `${date} - ${time}`;
  };

  const cleanTaffyot = (amount) => {
    if (!amount || amount <= 0) return 'صفر ريال يمني.';
    return `${taffyot(amount).replace(/(ريالاً يمنياً|ريال يمني|فقط|لا غير|-)/g, '').trim()} ريال يمني.`;
  };

  // ─── Export Functions (ExcelJS) ─────────────────────────────────────────────
  
  // 1. Export Full Archive (Cases)
  const exportCasesToExcel = async () => {
    if (!filteredCompletedCases || filteredCompletedCases.length === 0) {
      toast.warning('لا توجد بيانات للتصدير');
      return;
    }
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('السجل الطبي المجاني');
    sheet.views = [{ rightToLeft: true }];
    
    // Header (تحسين نصوص عناوين حقول الأسعار)
    sheet.columns = [
      { header: 'معرف الزيارة', key: 'visit_number', width: 18 },
      { header: 'اسم المريض', key: 'full_name', width: 28 },
      { header: 'حالة الزيارة', key: 'status', width: 16 },
      { header: 'وقت وتاريخ الزيارة', key: 'visit_date', width: 24 },
      { header: 'الخدمات المقدمة', key: 'services_provided', width: 36 },
      { header: 'إجمالي قيمة الفاتورة', key: 'total_invoice', width: 22 },
      { header: 'إجمالي الخصم الممنوح', key: 'total_discount', width: 22 }
    ];

    // Style Header
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; // Primary Blue
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 12 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });
    sheet.getRow(1).height = 28;

    let grandTotalDiscount = 0;

    // Add Rows
    filteredCompletedCases.forEach(c => {
      const labs = c.labRequests || [];
      const rads = c.radiologyRequests || [];
      const clinics = c.clinicalRequests || [];
      
      let servicesTextArray = ['رسوم معاينة'];
      if (labs.length > 0) servicesTextArray.push(`مختبر (${labs.length})`);
      if (rads.length > 0) servicesTextArray.push(`أشعة (${rads.length})`);
      if (clinics.length > 0) servicesTextArray.push(`سريرية (${clinics.length})`);
      const servicesText = servicesTextArray.join('، ');

      const allServices = [...labs, ...rads, ...clinics];
      const servicesOriginalPrice = allServices.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);
      const servicesDiscount = allServices.reduce((sum, s) => sum + (parseFloat(s.discount_amount) || 0), 0);

      const consultationFee = parseFloat(c.consultation_fee) || 0;
      const consultationDiscount = c.is_exempt ? consultationFee : 0;

      const totalInvoice = servicesOriginalPrice + consultationFee;
      const totalDiscount = servicesDiscount + consultationDiscount;

      grandTotalDiscount += totalDiscount;

      sheet.addRow({
        visit_number: c.visit_number || c.visit_id || c.id || '—',
        full_name: c.full_name || c.patient_name || '—',
        status: c.status === 'completed' ? 'مكتملة' : c.status === 'paid' ? 'مدفوعة' : 'غير مكتملة',
        visit_date: formatDateTimeEn(c.created_at),
        services_provided: servicesText,
        total_invoice: `YER ${Math.round(totalInvoice).toLocaleString('en-US')}`,
        total_discount: `YER ${Math.round(totalDiscount).toLocaleString('en-US')}`
      });
    });

    // Style All cells
    sheet.eachRow((row, rowNumber) => {
      if(rowNumber > 1) {
        row.height = 22;
        row.eachCell((cell, colNumber) => {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
          
          // Style financial columns with standard field text color
          if ([6, 7].includes(colNumber)) {
            cell.font = { bold: true, color: { argb: 'FF1E293B' } };
          }
        });
      }
    });

    // ─── Total Summary Row (بارز، المبلغ رقماً يعرض أولاً ثم كتابة، بمسافات وتخطيط متناسق) ───
    sheet.addRow([]);
    const totalRowNumber = sheet.rowCount + 1;
    sheet.getRow(totalRowNumber).height = 32;

    // 1. حقل عنوان الإجمالي (Col A)
    const labelCell = sheet.getCell(`A${totalRowNumber}`);
    labelCell.value = 'إجمالي الإعفاءات:';
    labelCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    labelCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };
    labelCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // 2. حقل المبلغ رقماً أولاً (Col B - بنفس لون خط الحقول)
    const numCell = sheet.getCell(`B${totalRowNumber}`);
    numCell.value = `YER ${Math.round(grandTotalDiscount).toLocaleString('en-US')}`;
    numCell.font = { bold: true, size: 12, color: { argb: 'FF1E293B' } };
    numCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
    numCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // 3. حقل المبلغ كتابةً ثانياً (Col C:G مدمج عبر الأعمدة المتبقية)
    sheet.mergeCells(`C${totalRowNumber}:G${totalRowNumber}`);
    const spelledCell = sheet.getCell(`C${totalRowNumber}`);
    spelledCell.value = cleanTaffyot(Math.round(grandTotalDiscount));
    spelledCell.font = { bold: true, size: 11, color: { argb: 'FF334155' } };
    spelledCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF8FAFC' },
    };
    spelledCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };

    // Accounting borders across all 7 columns
    for (let col = 1; col <= 7; col++) {
      sheet.getRow(totalRowNumber).getCell(col).border = {
        top: { style: 'medium', color: { argb: 'FF2563EB' } },
        bottom: { style: 'double', color: { argb: 'FF2563EB' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `السجل_الطبي_المجاني_${new Date().toLocaleDateString('en-CA')}.xlsx`);
  };

  // 2. Export Discounts/Exemptions
  const exportDiscountsToExcel = async (data, title) => {
    if (!data || data.length === 0) {
      toast.warning('لا توجد بيانات للتصدير');
      return;
    }
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(title);
    sheet.views = [{ rightToLeft: true }];
    
    const isExemptSheet = title.includes('إعفاء') || title.includes('VIP');
    const totalColsCount = isExemptSheet ? 7 : 8;
    const endColLetter = isExemptSheet ? 'G' : 'H';

    // Header (تحسين نصوص عناوين حقول الأسعار)
    sheet.columns = isExemptSheet ? [
      { header: 'معرف الزيارة', key: 'visit_id', width: 18 },
      { header: 'اسم المريض', key: 'patient_name', width: 28 },
      { header: 'الخدمة المعفاة', key: 'service_name', width: 32 },
      { header: 'القسم', key: 'category', width: 16 },
      { header: 'وقت وتاريخ الإجراء', key: 'created_at', width: 24 },
      { header: 'السعر الأساسي', key: 'price', width: 20 },
      { header: 'القيمة المعفاة', key: 'discount', width: 24 }
    ] : [
      { header: 'معرف الزيارة', key: 'visit_id', width: 18 },
      { header: 'اسم المريض', key: 'patient_name', width: 28 },
      { header: 'الخدمة المعفاة / المخصومة', key: 'service_name', width: 32 },
      { header: 'القسم', key: 'category', width: 16 },
      { header: 'وقت وتاريخ الإجراء', key: 'created_at', width: 24 },
      { header: 'السعر الأساسي', key: 'price', width: 20 },
      { header: 'قيمة الخصم', key: 'discount', width: 24 },
      { header: 'المبلغ المحصل', key: 'final', width: 20 }
    ];

    // Style Header
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; 
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 12 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });
    sheet.getRow(1).height = 28;

    let totalDiscountAmount = 0;

    // Add Rows
    data.forEach(c => {
      let cat = 'أخرى';
      if (c.type === 'lab') cat = 'مختبر';
      if (c.type === 'radiology') cat = 'أشعة';
      if (c.type === 'clinical') cat = 'سريرية';
      if (!c.type) cat = 'معاينة';

      const dateVal = c.date || c.created_at || c.closed_at;
      const originalPrice = parseFloat(c.original_price || c.consultation_fee || c.price || 0);
      const isFree = c.is_free === 1 || isExemptSheet || c.is_exempt === 1;
      
      let discountAmount = 0;
      let discountText = '';
      let finalPrice = 0;

      if (isFree) {
         discountAmount = originalPrice;
         discountText = `YER ${Math.round(originalPrice).toLocaleString('en-US')}`;
         finalPrice = 0;
      } else {
         discountAmount = parseFloat(c.discount_amount || 0);
         discountText = `YER ${Math.round(discountAmount).toLocaleString('en-US')}${c.discount_percentage ? ` (%${c.discount_percentage})` : ''}`;
         finalPrice = parseFloat(c.final_price || originalPrice);
      }

      totalDiscountAmount += discountAmount;

      const visitId = c.visit_number || c.visit_id || c.visitId || c.id || '—';

      const rowObj = {
        visit_id: visitId,
        patient_name: c.patient_name || c.full_name || '—',
        service_name: c.isVip ? 'رسوم المعاينة' : (c.service_name || 'رسوم معاينة'),
        category: cat,
        created_at: formatDateTimeEn(dateVal),
        price: `YER ${Math.round(originalPrice).toLocaleString('en-US')}`,
        discount: discountText
      };

      if (!isExemptSheet) {
        rowObj.final = `YER ${Math.round(finalPrice).toLocaleString('en-US')}`;
      }

      sheet.addRow(rowObj);
    });

    // Style All cells
    sheet.eachRow((row, rowNumber) => {
      if(rowNumber > 1) {
        row.height = 22;
        row.eachCell((cell, colNumber) => {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
          
          if ((isExemptSheet ? [6, 7] : [6, 7, 8]).includes(colNumber)) {
            cell.font = { bold: true, color: { argb: 'FF1E293B' } };
          }
        });
      }
    });

    // ─── Total Summary Row (بارز، المبلغ رقماً أولاً ثم كتابة، بمسافات وتخطيط متناسق) ───
    if (totalDiscountAmount > 0) {
      sheet.addRow([]);
      const totalRowNumber = sheet.rowCount + 1;
      sheet.getRow(totalRowNumber).height = 32;

      const labelCell = sheet.getCell(`A${totalRowNumber}`);
      labelCell.value = isExemptSheet ? 'إجمالي الإعفاءات:' : 'إجمالي الخصومات:';
      labelCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      labelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' },
      };
      labelCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const numCell = sheet.getCell(`B${totalRowNumber}`);
      numCell.value = `YER ${Math.round(totalDiscountAmount).toLocaleString('en-US')}`;
      numCell.font = { bold: true, size: 12, color: { argb: 'FF1E293B' } };
      numCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      numCell.alignment = { horizontal: 'center', vertical: 'middle' };

      sheet.mergeCells(`C${totalRowNumber}:${endColLetter}${totalRowNumber}`);
      const spelledCell = sheet.getCell(`C${totalRowNumber}`);
      spelledCell.value = cleanTaffyot(Math.round(totalDiscountAmount));
      spelledCell.font = { bold: true, size: 11, color: { argb: 'FF334155' } };
      spelledCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      };
      spelledCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };

      for (let col = 1; col <= totalColsCount; col++) {
        sheet.getRow(totalRowNumber).getCell(col).border = {
          top: { style: 'medium', color: { argb: 'FF2563EB' } },
          bottom: { style: 'double', color: { argb: 'FF2563EB' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${title.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('en-CA')}.xlsx`);
  };

  // 3. Export Single Patient (Modal)
  const exportModalToExcel = async () => {
    if (!selectedCase) return;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`ملف المريض ${selectedCase.patient_id || ''}`);

    // Set right-to-left layout
    sheet.views = [{ rightToLeft: true }];
    sheet.columns = [
      { key: 'A', width: 8 },
      { key: 'B', width: 32 },
      { key: 'C', width: 18 },
      { key: 'D', width: 25 },
      { key: 'E', width: 20 },
      { key: 'F', width: 20 }
    ];

    // --- Personal Information Section ---
    sheet.mergeCells('A1:F1');
    sheet.getCell('A1').value = 'البيانات الشخصية للمريض';
    sheet.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // slate-800
    sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    sheet.getCell('A2').value = 'رقم الملف:';
    sheet.getCell('B2').value = selectedCase.patient_id || '—';
    sheet.getCell('D2').value = 'الاسم الكامل:';
    sheet.getCell('E2').value = selectedCase.full_name || '—';

    sheet.getCell('A3').value = 'العمر:';
    sheet.getCell('B3').value = selectedCase.age || '—';
    sheet.getCell('D3').value = 'الجنس:';
    sheet.getCell('E3').value = selectedCase.gender === 'male' ? 'ذكر' : 'أنثى';

    sheet.getCell('A4').value = 'رقم الهاتف:';
    sheet.getCell('B4').value = selectedCase.phone || '—';
    sheet.getCell('D4').value = 'تاريخ الزيارة:';
    sheet.getCell('E4').value = formatDateTimeEn(selectedCase.created_at);

    // Style Personal Info Cells with Borders
    for (let r = 2; r <= 4; r++) {
      sheet.getRow(r).height = 25;
      ['A', 'B', 'C', 'D', 'E', 'F'].forEach(c => {
        sheet.getCell(`${c}${r}`).border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
        sheet.getCell(`${c}${r}`).alignment = { vertical: 'middle', horizontal: 'center' };
      });
    }

    ['A2','D2','A3','D3','A4','D4'].forEach(cell => {
      sheet.getCell(cell).font = { bold: true, color: { argb: 'FF475569' } };
      sheet.getCell(cell).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    });
    
    ['B2','E2','B3','E3','B4','E4'].forEach(cell => {
      sheet.getCell(cell).font = { bold: true, color: { argb: 'FF2563EB' } };
    });

    // --- Financial Services Section ---
    sheet.mergeCells('A6:F6');
    sheet.getCell('A6').value = 'الخدمات والمعاملات المالية للزيارة';
    sheet.getCell('A6').font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getCell('A6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; // primary blue
    sheet.getCell('A6').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(6).height = 28;

    // Table Header (تحسين نصوص عناوين حقول الأسعار)
    sheet.getRow(7).values = ['#', 'الخدمة الطبية', 'القسم / الجهة', 'وقت وتاريخ الإجراء', 'السعر الأساسي', 'المبلغ المحصل'];
    sheet.getRow(7).height = 25;
    sheet.getRow(7).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FF334155' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; // slate-100
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });

    const allItems = [
      ...(selectedCase.labRequests || []).map(r => ({ ...r, typeLabel: 'مختبر' })),
      ...(selectedCase.radiologyRequests || []).map(r => ({ ...r, typeLabel: 'أشعة' })),
      ...(selectedCase.clinicalRequests || []).map(r => ({ ...r, typeLabel: 'خدمة سريرية' }))
    ];

    let startRow = 8;
    let excelRowNum = 1;
    if (allItems.length === 0 && !selectedCase.is_exempt) {
      sheet.mergeCells(`A${startRow}:F${startRow}`);
      sheet.getCell(`A${startRow}`).value = 'لا توجد بيانات مسجلة';
      sheet.getCell(`A${startRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getCell(`A${startRow}`).font = { bold: true, color: { argb: 'FF94A3B8' } };
      startRow++;
    } else {
      // If VIP, add consultation fee exemption
      if (selectedCase.is_exempt) {
        const fee = Math.round(Number(selectedCase.consultation_fee || 0));
        sheet.getRow(startRow).values = [
          excelRowNum++,
          'رسوم المعاينة والكشف',
          'خدمة سريرية',
          formatDateTimeEn(selectedCase.closed_at || selectedCase.created_at),
          `YER ${fee.toLocaleString('en-US')}`,
          'إعفاء كلي'
        ];
        sheet.getRow(startRow).alignment = { horizontal: 'center', vertical: 'middle' };
        startRow++;
      }

      allItems.forEach(item => {
        const itemDate = item.requested_at || item.created_at || selectedCase.closed_at || selectedCase.created_at;
        const originalPrice = Math.round(Number(item.price || 0));
        const finalPrice = Math.round(Number(item.final_price || item.price || 0));
        const isFree = Boolean(item.is_free === 1 || item.is_free === true);

        sheet.getRow(startRow).values = [
          excelRowNum++,
          item.name || item.service_name || item.test_name,
          item.typeLabel,
          formatDateTimeEn(itemDate),
          `YER ${originalPrice.toLocaleString('en-US')}`,
          isFree ? 'إعفاء كلي' : `YER ${finalPrice.toLocaleString('en-US')}`
        ];
        sheet.getRow(startRow).alignment = { horizontal: 'center', vertical: 'middle' };
        startRow++;
      });
    }

    // Apply borders to table rows
    for(let r = 8; r < startRow; r++) {
      sheet.getRow(r).height = 22;
      sheet.getRow(r).eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
        if (colNumber === 1) cell.font = { bold: true, color: { argb: 'FF94A3B8' } };
        if (colNumber === 5) cell.font = { bold: true, color: { argb: 'FF64748B' } };
        if (colNumber === 6) cell.font = { bold: true, color: { argb: 'FF1E293B' } };
      });
    }

    // Totals Footer (بارز، المبلغ رقماً يعرض أولاً ثم كتابة، بمسافات وتخطيط متناسق)
    const vipDiscount = selectedCase.is_exempt === 1 ? parseFloat(selectedCase.consultation_fee || 0) : 0;
    const servicesDiscount = allItems.reduce((acc, curr) => acc + (parseFloat(curr.discount_amount) || 0), 0);
    const totalExempted = Math.round(vipDiscount + servicesDiscount);

    if (totalExempted > 0) {
      sheet.addRow([]);
      const totalRowNumber = sheet.rowCount + 1;
      sheet.getRow(totalRowNumber).height = 32;

      // 1. حقل عنوان الإجمالي (Col A)
      const labelCell = sheet.getCell(`A${totalRowNumber}`);
      labelCell.value = 'إجمالي الإعفاء:';
      labelCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      labelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' },
      };
      labelCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // 2. حقل المبلغ رقماً أولاً (Col B - بنفس لون خط الحقول)
      const numCell = sheet.getCell(`B${totalRowNumber}`);
      numCell.value = `YER ${Math.round(totalExempted).toLocaleString('en-US')}`;
      numCell.font = { bold: true, size: 12, color: { argb: 'FF1E293B' } };
      numCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      numCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // 3. حقل المبلغ كتابةً ثانياً (Col C:F مدمج)
      sheet.mergeCells(`C${totalRowNumber}:F${totalRowNumber}`);
      const spelledCell = sheet.getCell(`C${totalRowNumber}`);
      spelledCell.value = cleanTaffyot(Math.round(totalExempted));
      spelledCell.font = { bold: true, size: 11, color: { argb: 'FF334155' } };
      spelledCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      };
      spelledCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };

      for (let col = 1; col <= 6; col++) {
        sheet.getRow(totalRowNumber).getCell(col).border = {
          top: { style: 'medium', color: { argb: 'FF2563EB' } },
          bottom: { style: 'double', color: { argb: 'FF2563EB' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `ملف_المريض_${selectedCase.patient_id}_${new Date().toLocaleDateString('en-CA')}.xlsx`);
  };

  // ─── Filter Logic ─────────────────────────────────────────────
  const filteredCompletedCases = useMemo(() => {
    const validCases = completedCases.filter(c => c.is_follow_up !== 1 && c.is_follow_up !== true);
    if (!searchQuery) return validCases;
    const lower = searchQuery.toLowerCase();
    return validCases.filter(c => 
      c.full_name?.toLowerCase().includes(lower) || 
      String(c.visit_number || c.visit_id || c.id || '').toLowerCase().includes(lower) ||
      (c.phone && String(c.phone).includes(lower))
    );
  }, [completedCases, searchQuery]);

  const filteredDiscounts = useMemo(() => {
    if (!searchQuery) return discounts;
    const lower = searchQuery.toLowerCase();
    return discounts.filter(c => 
      c.patient_name?.toLowerCase().includes(lower) || 
      c.service_name?.toLowerCase().includes(lower) ||
      String(c.visit_number || c.visit_id || '').toLowerCase().includes(lower) ||
      (c.phone && String(c.phone).includes(lower))
    );
  }, [discounts, searchQuery]);

  const filteredExemptions = useMemo(() => {
    if (!searchQuery) return exemptions;
    const lower = searchQuery.toLowerCase();
    return exemptions.filter(c => 
      c.patient_name?.toLowerCase().includes(lower) || 
      c.service_name?.toLowerCase().includes(lower) ||
      String(c.visit_number || c.visit_id || '').toLowerCase().includes(lower)
    );
  }, [exemptions, searchQuery]);

  const filteredVipExemptions = useMemo(() => {
    if (!searchQuery) return vipExemptions;
    const lower = searchQuery.toLowerCase();
    return vipExemptions.filter(c => 
      c.full_name?.toLowerCase().includes(lower) || 
      String(c.visit_number || c.visit_id || c.id || '').toLowerCase().includes(lower) ||
      (c.phone && String(c.phone).includes(lower))
    );
  }, [vipExemptions, searchQuery]);

  // --- Combined Exemptions (VIP + Regular) ---
  const combinedExemptions = useMemo(() => {
    const vips = filteredVipExemptions.map(v => ({ ...v, isVip: true }));
    const regulars = filteredExemptions.map(r => ({ ...r, isVip: false }));
    const all = [...vips, ...regulars];
    all.sort((a, b) => new Date(b.closed_at || b.created_at || b.date).getTime() - new Date(a.closed_at || a.created_at || a.date).getTime());
    return all;
  }, [filteredVipExemptions, filteredExemptions]);

  // ─── Fetch Analytical Reports ────────────────────────────────────
  const fetchReports = useCallback(async (isInitial = false) => {
    // If custom is selected but user hasn't chosen both start and end, do not fetch yet
    if (dateFilter === 'custom' && (!customRange.start || !customRange.end)) {
      return;
    }

    if (isInitial) {
      setInitialLoading(true);
    } else {
      setIsFiltering(true);
    }

    try {
      let url = '/api/doctor/reports/analytical';
      if (dateFilter === 'custom') {
        url += `?startDate=${customRange.start}&endDate=${customRange.end}`;
      } else if (dateFilter !== 'all') {
        const today = getCurrentShiftDate();
        let start = today;
        if (dateFilter === 'week') {
          start = formatShiftDate(getShiftWeekStartDate());
        } else if (dateFilter === 'month') {
          start = formatShiftDate(getShiftMonthStartDate());
        }
        url += `?startDate=${start}&endDate=${today}`;
      }

      const res = await axios.get(url, { headers });
      setCompletedCases(res.data.completedCases || []);
      setDiscounts(res.data.discounts || []);
      setExemptions(res.data.exemptions || []);
      setVipExemptions(res.data.vipExemptions || []);
    } catch {
      toast.error('فشل في جلب التقارير التحليلية');
    } finally {
      setInitialLoading(false);
      setIsFiltering(false);
    }
  }, [token, dateFilter, customRange]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      fetchReports(true);
    } else {
      fetchReports(false);
    }
  }, [fetchReports]);

  // Reset Filters
  const handleResetFilters = () => {
    setDateFilter('all');
    setCustomRange({ start: '', end: '' });
    setSearchQuery('');
    toast.info('تم إعادة تعيين فلاتر التقارير');
  };

  // ─── Calculations & Taffyot Spellers ──────────────────────────────
  const totalDiscounts = useMemo(() => {
    return discounts.reduce((sum, item) => sum + (parseFloat(item.discount_amount) || 0), 0);
  }, [discounts]);

  const spelledDiscounts = useMemo(() => {
    return taffyot(totalDiscounts);
  }, [totalDiscounts]);

  const totalExemptions = useMemo(() => {
    return exemptions.reduce((sum, item) => sum + (parseFloat(item.original_price) || 0), 0);
  }, [exemptions]);

  const spelledExemptions = useMemo(() => {
    return taffyot(totalExemptions);
  }, [totalExemptions]);

  const totalExemptedConsultations = useMemo(() => {
    return vipExemptions.reduce((sum, c) => sum + (Number(c.consultation_fee) || 0), 0);
  }, [vipExemptions]);

  const spelledConsultations = useMemo(() => taffyot(totalExemptedConsultations), [totalExemptedConsultations]);

  const currentTabTotal = useMemo(() => {
    if (activeTab === 'cases') return filteredCompletedCases.length;
    if (activeTab === 'discounts') return filteredDiscounts.length;
    return combinedExemptions.length;
  }, [activeTab, filteredCompletedCases.length, filteredDiscounts.length, combinedExemptions.length]);

  return (
    <div className="space-y-6 w-full" dir="rtl">
      {/* Banner */}
      <div className="bg-gradient-to-l from-slate-50 to-blue-50/30 rounded-2xl border border-slate-100 p-6 shadow-sm mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 w-full">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white border border-slate-100 text-blue-600 flex items-center justify-center shadow-sm">
            <TrendingUp size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800">التقارير الطبية والتحليلات البيانية</h1>
            <p className="text-slate-500 text-sm font-semibold mt-1">تتبع أداء الحالات المنجزة والخصومات الممنوحة وقيم الإعفاءات الإنسانية (VIP)</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => {
            if (activeTab === 'cases') exportCasesToExcel();
            else if (activeTab === 'discounts') exportDiscountsToExcel(filteredDiscounts, 'الخصومات');
            else exportDiscountsToExcel(combinedExemptions, 'الإعفاءات وحالات VIP');
          }} className="px-5 py-2.5 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors font-bold rounded-xl text-xs flex items-center gap-2 shadow-sm">
            <Download size={16} /> تصدير كـ Excel
          </button>
        </div>
      </div>

      {/* Quick Stats Grid (Cashier Dashboard Style) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full flex-shrink-0">
        {[
          {
            label: 'إجمالي الحالات المنجزة',
            value: filteredCompletedCases.length,
            rawValue: filteredCompletedCases.length,
            unit: 'حالة',
            sub: searchQuery ? `تصفية البحث: ${filteredCompletedCases.length}` : 'الحالات المنجزة وإعفاءات VIP',
            icon: Users,
            color: 'text-indigo-600',
            bg: 'bg-indigo-100',
            border: 'border-indigo-200'
          },
          {
            label: 'إجمالي الخصومات',
            value: Math.round(totalDiscounts).toLocaleString('en-US'),
            rawValue: totalDiscounts,
            unit: 'ر.ي',
            sub: totalDiscounts > 0 ? spelledDiscounts : null,
            icon: Tag,
            color: 'text-sky-600',
            bg: 'bg-sky-100',
            border: 'border-sky-200'
          },
          {
            label: 'إعفاءات الخدمات (VIP)',
            value: Math.round(totalExemptions).toLocaleString('en-US'),
            rawValue: totalExemptions,
            unit: 'ر.ي',
            sub: totalExemptions > 0 ? spelledExemptions : null,
            icon: Award,
            color: 'text-emerald-600',
            bg: 'bg-emerald-100',
            border: 'border-emerald-200'
          },
          {
            label: 'رسوم معاينة معفاة',
            value: Math.round(totalExemptedConsultations).toLocaleString('en-US'),
            rawValue: totalExemptedConsultations,
            unit: 'ر.ي',
            sub: totalExemptedConsultations > 0 ? spelledConsultations : null,
            icon: ShieldAlert,
            color: 'text-amber-600',
            bg: 'bg-amber-100',
            border: 'border-amber-200'
          }
        ]
          .filter(s => Number(s.rawValue || 0) > 0)
          .map((s, i) => (
          <div key={i} className={`p-4 rounded-2xl border ${s.border} bg-white shadow-sm hover:shadow-md transition-shadow duration-200 relative overflow-hidden flex flex-col justify-between isolate group`}>
            <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${s.bg} to-transparent opacity-50 rounded-bl-full z-[-1] transition-transform duration-500 group-hover:scale-110`} />
            <div className="flex justify-between items-start mb-3">
              <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center shadow-sm transition-transform group-hover:scale-105`}>
                <s.icon size={16} className={s.color} />
              </div>
              <span className={`text-xs font-bold ${s.color}`}>
                {s.label}
              </span>
            </div>
            <div>
              {initialLoading ? (
                <div className="h-7 bg-gray-100 rounded-lg animate-pulse w-24"></div>
              ) : (
                <p className={`text-xl font-black text-gray-800 flex items-baseline justify-end gap-1.5 transition-opacity duration-200 ${isFiltering ? 'opacity-50' : 'opacity-100'}`} dir="ltr">
                  <span className="text-xs font-bold text-gray-400 uppercase">{s.unit}</span>
                  <span>{s.value}</span>
                </p>
              )}
              {s.sub && (
                <p className="text-[10px] text-gray-400 font-semibold mt-1 truncate" title={s.sub}>
                  {s.sub}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Advanced Filter Toolbar */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4 w-full">
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          {/* Search bar (Right side in RTL) */}
          <div className="relative w-full md:w-80">
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
              <Search size={16} strokeWidth={2.2} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="بحث بالاسم، رقم الهاتف، أو معرف الزيارة..."
              className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-blue-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200/60 shadow-xs transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                title="مسح البحث"
              >
                <div className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                  <X size={12} strokeWidth={2.5} />
                </div>
              </button>
            )}
          </div>

          {/* Temporal filter tabs & Controls (Left side in RTL) */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex gap-1 bg-gray-100/90 p-1.5 rounded-2xl text-xs font-bold text-gray-500 overflow-x-auto">
              {[
                { id: 'all', label: 'الكل' },
                { id: 'today', label: 'اليوم' },
                { id: 'week', label: 'هذا الأسبوع' },
                { id: 'month', label: 'هذا الشهر' },
                { id: 'custom', label: 'تاريخ مخصص' },
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setDateFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-bold ${
                    dateFilter === f.id ? 'bg-white text-blue-700 shadow-xs' : 'hover:bg-white/40'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* View Mode Toggle (Active for Cases Tab) */}
            {activeTab === 'cases' && (
              <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === 'grid' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                  }`}
                  title="عرض كشبكة"
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === 'list' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                  }`}
                  title="عرض كقائمة"
                >
                  <List size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {dateFilter === 'custom' && (
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-wrap gap-4 items-center animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500">من:</span>
              <input
                type="date"
                value={customRange.start}
                onChange={e => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none text-gray-700 focus:border-blue-500 transition-colors cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500">إلى:</span>
              <input
                type="date"
                value={customRange.end}
                onChange={e => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none text-gray-700 focus:border-blue-500 transition-colors cursor-pointer"
              />
            </div>
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-4 py-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-bold mr-auto transition-colors"
            >
              إعادة تعيين
            </button>
          </div>
        )}

        {/* Bottom stats summary row */}
        <div className="flex justify-between items-center pt-2 border-t border-gray-50 text-xs font-semibold text-gray-500">
          <span>
            {searchQuery ? `تصفية البحث: ${currentTabTotal} سجل` : `إجمالي السجلات: ${currentTabTotal} سجل`}
          </span>
          {isFiltering && (
            <span className="flex items-center gap-1.5 text-blue-600 font-bold">
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              جاري تحديث السجلات...
            </span>
          )}
        </div>
      </div>

      {/* Tabs Menu (Centered) */}
      <div className="flex justify-center items-center my-3 w-full">
        <div className="flex border border-gray-100 bg-white p-2 gap-1.5 text-xs font-bold text-gray-500 rounded-3xl shadow-xs overflow-x-auto no-scrollbar">
          {[
            { id: 'cases', label: 'السجل الطبي الشامل', icon: BookOpen },
            { id: 'discounts', label: 'بيان الخصومات المالية', icon: Tag },
            { id: 'exemptions', label: 'سجل إعفاءات وحالات الـ VIP', icon: ShieldAlert }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-700 border border-blue-100 shadow-xs'
                  : 'hover:bg-gray-50 text-gray-500'
              }`}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Detailed Reports Render */}
      {initialLoading ? (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-20 flex flex-col items-center justify-center gap-3 min-h-[480px] w-full">
          <div className="w-9 h-9 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-bold text-gray-400">جاري تحميل السجلات والبيانات الطبية...</span>
        </div>
      ) : (
        <div className="relative bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden min-h-[480px] w-full">
          {isFiltering && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[1.5px] z-20 flex items-center justify-center transition-all animate-fade-in">
              <div className="flex items-center gap-3 px-5 py-2.5 bg-white/95 rounded-2xl shadow-lg border border-slate-100 text-xs font-black text-blue-700">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span>جاري تحديث السجلات والتقارير...</span>
              </div>
            </div>
          )}

          <div className={`transition-opacity duration-200 ${isFiltering ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          
          {/* TAB 1: CASES */}
          {activeTab === 'cases' && (
            viewMode === 'list' ? (
              <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap table-fixed">
                  <thead className="bg-gradient-to-r from-slate-50/90 via-blue-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                    <tr>
                      <th className="w-[6%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                      <th className="w-[42%] px-4 py-4 text-right font-black text-xs text-slate-600">المريض</th>
                      <th className="w-[24%] px-4 py-4 text-right font-black text-xs text-slate-600">وقت وتاريخ المعاينة</th>
                      <th className="w-[14%] px-4 py-4 text-center font-black text-xs text-slate-600">الخدمات والإجراءات</th>
                      <th className="w-[14%] px-4 py-4 text-center font-black text-xs text-slate-600">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/70">
                    {filteredCompletedCases.length === 0 ? (
                      <tr>
                        <td colSpan="5" onClick={(e) => e.stopPropagation()} className="p-20 text-center text-gray-400 font-bold">
                          <div className="flex flex-col items-center justify-center gap-3">
                            <BookOpen size={48} className="text-gray-300" strokeWidth={1.5} />
                            <p>لا يوجد حالات منجزة في هذه الفترة.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredCompletedCases.map((item, idx) => {
                        const servicesCount = 1 + (item.labRequests?.length || 0) + (item.radiologyRequests?.length || 0) + (item.clinicalRequests?.length || 0);
                        const isVIP = Boolean(item.is_exempt === 1);
                        const isFollowUp = Boolean(item.is_follow_up === 1);
                        const visitNumber = item.visit_number || item.visit_id || item.id;
                        const dateFormatted = (item.closed_at || item.created_at)
                          ? `${new Date(item.closed_at || item.created_at).toLocaleDateString("en-GB")} - ${new Date(item.closed_at || item.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}`
                          : "--";

                        return (
                          <tr
                            key={item.id || idx}
                            onClick={() => handleOpenEMR(item)}
                            className="hover:bg-blue-50/30 cursor-pointer transition-colors border-b border-slate-100/70 last:border-0 group"
                          >
                            {/* # Number */}
                            <td className="w-[6%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                              {idx + 1}
                            </td>

                            {/* Patient Details */}
                            <td className="w-[42%] px-4 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 group-hover:scale-105 transition-transform bg-gradient-to-br from-blue-50 to-blue-100/80 text-blue-700 border border-blue-200/50">
                                  {item.full_name?.charAt(0) ?? '؟'}
                                </div>
                                <div className="flex flex-col gap-0.5 min-w-0 text-right" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-black text-slate-800 text-sm group-hover:text-blue-700 transition-colors truncate">
                                      {item.full_name}
                                    </span>
                                    {isFollowUp && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-emerald-100/75 text-emerald-700 border border-emerald-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                        <RotateCcw size={11} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                                        <span>مراجعة</span>
                                      </span>
                                    )}
                                    {isVIP && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-amber-100/75 text-amber-700 border border-amber-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                        <Crown size={11} className="text-amber-600 shrink-0" strokeWidth={2.2} />
                                        <span>إعفاء</span>
                                      </span>
                                    )}
                                    {Boolean(item.is_surgery || item.has_surgery || item.has_surgeries || item.status === 'transferred_to_center' || (Array.isArray(item.surgeries) && item.surgeries.length > 0)) && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                        <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                                        <span>عمليات</span>
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] font-bold text-slate-400 text-right mt-0.5 w-full" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                                    <span dir="ltr">{visitNumber}</span>
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Date and Time */}
                            <td className="w-[24%] px-4 py-4 text-right">
                              <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                                {dateFormatted}
                              </span>
                            </td>

                            {/* Services Badge */}
                            <td className="w-[14%] px-4 py-4 text-center">
                              <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-xl text-xs font-black inline-block">
                                {servicesCount} خدمات
                              </span>
                            </td>

                            {/* Action Button */}
                            <td className="w-[14%] px-4 py-4 text-center">
                              <div className="flex items-center justify-center">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCase(item);
                                  }}
                                  className="px-3.5 py-1.5 font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-500/20 hover:shadow-md hover:shadow-blue-500/30"
                                >
                                  <Eye size={13} strokeWidth={2.5} />
                                  <span>استعراض الملف</span>
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
              </>
            ) : (
              <>
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 bg-slate-50/50">
                {filteredCompletedCases.length === 0 ? (
                  <div className="col-span-full py-20 flex flex-col items-center justify-center gap-3 text-gray-400 font-bold">
                    <BookOpen size={48} className="text-gray-300" strokeWidth={1.5} />
                    <p>لا يوجد حالات منجزة في هذه الفترة.</p>
                  </div>
                ) : (
                  filteredCompletedCases.map((item, idx) => (
                    <PatientQueueCard
                      key={item.id || idx}
                      index={idx + 1}
                      visit={{
                        ...item,
                        visit_number: item.visit_number || item.visit_id || item.id,
                        created_at: item.closed_at || item.created_at,
                        is_exempt: item.is_exempt === 1,
                        is_follow_up: item.is_follow_up === 1,
                      }}
                      onClick={() => handleOpenEMR(item)}
                      colorTheme="blue"
                      hideStatus={true}
                      actionLabel="استعراض الملف"
                      actionIcon={<Eye size={13} strokeWidth={2.5} />}
                      onActionClick={() => setSelectedCase(item)}
                    />
                  ))
                )}
              </div>
              </>
            )
          )}

          {/* TAB 2: DISCOUNTS (List View Only) */}
          {activeTab === 'discounts' && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap table-fixed">
                  <thead className="bg-gradient-to-r from-slate-50/90 via-blue-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                    <tr>
                      <th className="w-[4%] px-2 py-4 text-center font-black text-xs text-slate-400">#</th>
                      <th className="w-[24%] px-4 py-4 text-right font-black text-xs text-slate-600">المريض</th>
                      <th className="w-[20%] px-4 py-4 text-right font-black text-xs text-slate-600">الخدمة</th>
                      <th className="w-[10%] px-3 py-4 text-center font-black text-xs text-slate-600">القسم</th>
                      <th className="w-[15%] px-4 py-4 text-right font-black text-xs text-slate-600">الوقت والتاريخ</th>
                      <th className="w-[9%] px-3 py-4 text-center font-black text-xs text-slate-600">السعر الأساسي</th>
                      <th className="w-[8%] px-3 py-4 text-center font-black text-xs text-slate-600">الخصم</th>
                      <th className="w-[10%] px-3 py-4 text-center font-black text-xs text-slate-600">السعر المعتمد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/70">
                    {filteredDiscounts.length === 0 ? (
                      <tr>
                        <td colSpan="8" onClick={(e) => e.stopPropagation()} className="p-20 text-center text-gray-400 font-bold">
                          <div className="flex flex-col items-center justify-center gap-3">
                            <Tag size={48} className="text-gray-300" strokeWidth={1.5} />
                            <p>لا يوجد خصومات ممنوحة في هذه الفترة.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredDiscounts.map((item, idx) => {
                        const visitId = item.visit_number || item.visit_id || item.id || "—";
                        const dateFormatted = item.date
                          ? `${new Date(item.date).toLocaleDateString("en-GB")} - ${new Date(item.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}`
                          : "--";
                        const originalPrice = Math.round(Number(item.original_price) || 0).toLocaleString('en-US');
                        const discountPercent = Math.round(Number(item.discount_percentage) || 0);
                        const finalPrice = Math.round(Number(item.final_price) || 0).toLocaleString('en-US');

                        return (
                          <tr key={idx} onClick={() => handleOpenEMR(item)} className="hover:bg-blue-50/30 cursor-pointer transition-colors border-b border-slate-100/70 last:border-0 group">
                            {/* # Number */}
                            <td className="w-[4%] px-2 py-4 text-center font-black text-slate-400 text-xs">
                              {idx + 1}
                            </td>

                            {/* Patient Details with Visit ID underneath (matching Patient Queue) */}
                            <td className="w-[24%] px-4 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 group-hover:scale-105 transition-transform bg-gradient-to-br from-blue-50 to-blue-100/80 text-blue-700 border border-blue-200/50">
                                  {(item.full_name || item.patient_name)?.charAt(0) ?? '؟'}
                                </div>
                                <div className="flex flex-col gap-0.5 min-w-0 text-right" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-black text-slate-800 text-sm group-hover:text-blue-700 transition-colors truncate">
                                      {item.full_name || item.patient_name}
                                    </span>
                                    {Boolean(item.is_follow_up) && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-emerald-100/75 text-emerald-700 border border-emerald-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                        <RotateCcw size={11} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                                        <span>مراجعة</span>
                                      </span>
                                    )}
                                    {Boolean(item.is_exempt) && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-amber-100/75 text-amber-700 border border-amber-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                        <Crown size={11} className="text-amber-600 shrink-0" strokeWidth={2.2} />
                                        <span>إعفاء</span>
                                      </span>
                                    )}
                                    {Boolean(item.is_surgery || item.has_surgery || item.has_surgeries || item.status === 'transferred_to_center' || (Array.isArray(item.surgeries) && item.surgeries.length > 0)) && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                        <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                                        <span>عمليات</span>
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] font-bold text-slate-400 text-right mt-0.5 w-full" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                                    <span dir="ltr">{visitId}</span>
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Service (After Patient) */}
                            <td className="w-[20%] px-4 py-4 text-right">
                              <span className="font-extrabold text-slate-700 block text-xs truncate" title={item.service_name}>
                                {item.service_name}
                                {item.type === 'radiology' && (item.with_film === false || item.with_film === 0 || item.withFilm === false) && (
                                  <span className="text-xs font-semibold text-slate-500 mr-1.5 font-normal">
                                    (بدون فيلم)
                                  </span>
                                )}
                              </span>
                            </td>

                            {/* Department (القسم: بلا إطار وبلا أيقونة - متطابق مع لوحة التحكم) */}
                            <td className="w-[10%] px-3 py-4 text-center">
                              {item.type === "lab" && (
                                <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-xl">
                                  مختبر
                                </span>
                              )}
                              {item.type === "radiology" && (
                                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-xl">
                                  أشعة
                                </span>
                              )}
                              {item.type === "clinical" && (
                                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl">
                                  سريرية
                                </span>
                              )}
                              {item.type === "surgery" && (
                                <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-xl">
                                  عمليات
                                </span>
                              )}
                            </td>

                            {/* Date & Time */}
                            <td className="w-[15%] px-4 py-4 text-right">
                              <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                                {dateFormatted}
                              </span>
                            </td>

                            {/* Original Price */}
                            <td className="w-[9%] px-3 py-4 text-center">
                              <span className="text-sm font-black text-slate-400 line-through decoration-red-300 decoration-1 inline-flex items-center gap-1" dir="ltr">
                                <span className="text-xs font-bold text-slate-400">ر.ي</span>
                                <span>{originalPrice}</span>
                              </span>
                            </td>

                            {/* Discount Percentage Only */}
                            <td className="w-[8%] px-3 py-4 text-center">
                              <span className="text-xs font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100" dir="ltr">
                                {discountPercent}%
                              </span>
                            </td>

                            {/* Approved Final Price */}
                            <td className="w-[10%] px-3 py-4 text-center">
                              <span className="text-sm font-black text-emerald-700 inline-flex items-center gap-1" dir="ltr">
                                <span className="text-xs font-bold text-emerald-600">ر.ي</span>
                                <span>{finalPrice}</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* TAB 3: EXEMPTIONS (List View Only) */}
          {activeTab === 'exemptions' && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap table-fixed">
                  <thead className="bg-gradient-to-r from-slate-50/90 via-blue-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                    <tr>
                      <th className="w-[5%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                      <th className="w-[32%] px-4 py-4 text-right font-black text-xs text-slate-600">المريض</th>
                      <th className="w-[24%] px-4 py-4 text-right font-black text-xs text-slate-600">الخدمة المعفاة</th>
                      <th className="w-[11%] px-3 py-4 text-center font-black text-xs text-slate-600">القسم</th>
                      <th className="w-[15%] px-4 py-4 text-right font-black text-xs text-slate-600">الوقت والتاريخ</th>
                      <th className="w-[13%] px-4 py-4 text-center font-black text-xs text-slate-600">القيمة المعفاة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/70">
                    {combinedExemptions.length === 0 ? (
                      <tr>
                        <td colSpan="6" onClick={(e) => e.stopPropagation()} className="p-20 text-center text-gray-400 font-bold">
                          <div className="flex flex-col items-center justify-center gap-3">
                            <ShieldAlert size={48} className="text-gray-300" strokeWidth={1.5} />
                            <p>لا يوجد تحويلات مجانية أو إعفاءات في هذه الفترة.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      combinedExemptions.map((item, idx) => {
                        const patientName = item.isVip ? item.full_name : item.patient_name;
                        const visitNumber = item.visit_number || item.visit_id || item.patient_id || item.id || "—";
                        const rawDate = item.closed_at || item.created_at || item.date;
                        const dateFormatted = rawDate
                          ? `${new Date(rawDate).toLocaleDateString("en-GB")} - ${new Date(rawDate).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}`
                          : "--";
                        const exemptionValNum = Math.round(Number(item.isVip ? (item.consultation_fee || 0) : (item.original_price || 0)));
                        const formattedExemptionValue = exemptionValNum.toLocaleString('en-US');

                        return (
                          <tr key={idx} onClick={() => handleOpenEMR(item)} className="hover:bg-blue-50/30 cursor-pointer transition-colors border-b border-slate-100/70 last:border-0 group">
                            {/* # Number */}
                            <td className="w-[5%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                              {idx + 1}
                            </td>

                            {/* Patient Details with Visit ID underneath (matching Patient Queue) */}
                            <td className="w-[32%] px-4 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 group-hover:scale-105 transition-transform bg-gradient-to-br from-emerald-50 to-emerald-100/80 text-emerald-700 border border-emerald-200/50">
                                  {patientName?.charAt(0) ?? '؟'}
                                </div>
                                <div className="flex flex-col gap-0.5 min-w-0 text-right" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-black text-slate-800 text-sm group-hover:text-emerald-700 transition-colors truncate">
                                      {patientName}
                                    </span>
                                    {Boolean(item.is_follow_up || item.isFollowUp) && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-emerald-100/75 text-emerald-700 border border-emerald-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                        <RotateCcw size={11} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                                        <span>مراجعة</span>
                                      </span>
                                    )}
                                    {(item.isVip || Boolean(item.is_exempt)) && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-amber-100/75 text-amber-700 border border-amber-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                        <Crown size={11} className="text-amber-600 shrink-0" strokeWidth={2.2} />
                                        <span>إعفاء</span>
                                      </span>
                                    )}
                                    {Boolean(item.is_surgery || item.has_surgery || item.has_surgeries || item.status === 'transferred_to_center' || (Array.isArray(item.surgeries) && item.surgeries.length > 0)) && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                        <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                                        <span>عمليات</span>
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] font-bold text-slate-400 text-right mt-0.5 w-full" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                                    <span dir="ltr">{visitNumber}</span>
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Exempted Service */}
                            <td className="w-[24%] px-4 py-4 text-right">
                              {item.isVip ? (
                                <span className="font-extrabold text-slate-700 block text-xs">رسوم المعاينة</span>
                              ) : (
                                <span className="font-extrabold text-slate-700 block text-xs truncate" title={item.service_name}>
                                  {item.service_name}
                                  {item.type === 'radiology' && (item.with_film === false || item.with_film === 0 || item.withFilm === false) && (
                                    <span className="text-xs font-semibold text-slate-500 mr-1.5 font-normal">
                                      (بدون فيلم)
                                    </span>
                                  )}
                                </span>
                              )}
                            </td>

                            {/* Department (القسم: بلا إطار وبلا أيقونة - متطابق مع لوحة التحكم) */}
                            <td className="w-[11%] px-3 py-4 text-center">
                              {item.isVip ? (
                                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl">
                                  سريرية
                                </span>
                              ) : (
                                <>
                                  {item.type === "lab" && (
                                    <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-xl">
                                      مختبر
                                    </span>
                                  )}
                                  {item.type === "radiology" && (
                                    <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-xl">
                                      أشعة
                                    </span>
                                  )}
                                  {item.type === "clinical" && (
                                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl">
                                      سريرية
                                    </span>
                                  )}
                                  {item.type === "surgery" && (
                                    <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-xl">
                                      عمليات
                                    </span>
                                  )}
                                </>
                              )}
                            </td>

                            {/* Date & Time */}
                            <td className="w-[15%] px-4 py-4 text-right">
                              <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
                                {dateFormatted}
                              </span>
                            </td>

                            {/* Exempted Value */}
                            <td className="w-[13%] px-4 py-4 text-center">
                              <span className="text-sm font-black text-rose-600 inline-flex items-center gap-1" dir="ltr">
                                <span className="text-xs font-bold text-rose-500">ر.ي</span>
                                <span>{formattedExemptionValue}</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          </div>
        </div>
      )}

      {/* ─── READ-ONLY DRILL DOWN EMR MODAL ─── */}
      {selectedCase && createPortal((
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
          {/* Background Overlay */}
          <div className="absolute inset-0" onClick={() => setSelectedCase(null)} />
          
          {/* Modal Container */}
          <div className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/60 ${isMaximized ? 'w-[98vw] h-[98vh] rounded-[2.5rem]' : 'w-full max-w-5xl h-full max-h-[90vh] rounded-[2rem]'}`}>
              
            {/* Top Title Bar & Controls (Doctor Primary Blue Theme) */}
            <div className="px-5 py-2.5 flex items-center justify-between flex-shrink-0 shadow-md text-white transition-colors duration-300 bg-gradient-to-r from-blue-700 via-blue-600 to-blue-700 z-30">
              <div className="flex items-center gap-2">
                <Layers size={16} />
                <span className="text-xs font-black tracking-wide drop-shadow-sm">
                  السجل المجاني المؤرشف للمريض ({selectedCase.full_name || '...'}) — للقراءة فقط
                </span>
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <button onClick={() => setIsMaximized(!isMaximized)} className="w-7 h-7 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all shadow-sm" title={isMaximized ? 'تصغير' : 'تكبير'}>
                  {isMaximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
                <button onClick={() => setSelectedCase(null)} className="w-7 h-7 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white hover:text-red-100 rounded-lg transition-all shadow-sm" title="إغلاق">
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* HEADER (Compact & Refined Personal Data Section) */}
            <div className="bg-white px-5 sm:px-6 py-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-100 shrink-0 z-20">
              <div className="flex items-center gap-3 sm:gap-3.5">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-slate-50 to-sky-100 flex items-center justify-center text-sky-600 shadow-inner border border-sky-100/60 shrink-0">
                  <User size={20} strokeWidth={1.8} className="sm:hidden" />
                  <User size={22} strokeWidth={1.8} className="hidden sm:block" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center flex-wrap gap-2">
                    <h2 className="text-base sm:text-lg font-black text-slate-800 tracking-tight leading-none">
                      {selectedCase.full_name || '...'}
                    </h2>
                    {Boolean(selectedCase.is_exempt) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-100/75 text-amber-700 border border-amber-200/70 select-none shadow-2xs leading-none whitespace-nowrap">
                        <Crown size={11} className="text-amber-600 shrink-0" strokeWidth={2.2} />
                        <span>إعفاء</span>
                      </span>
                    )}
                    {Boolean(selectedCase.is_follow_up) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-100/75 text-emerald-700 border border-emerald-200/70 select-none shadow-2xs leading-none whitespace-nowrap">
                        <RotateCcw size={11} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                        <span>مراجعة</span>
                      </span>
                    )}
                    {Boolean(selectedCase.is_surgery || selectedCase.has_surgery || selectedCase.has_surgeries || selectedCase.status === 'transferred_to_center' || (Array.isArray(selectedCase.surgeries) && selectedCase.surgeries.length > 0)) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none shadow-2xs leading-none whitespace-nowrap">
                        <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                        <span>عمليات</span>
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-0.5">
                    <span className="flex items-center gap-1 text-[10px] sm:text-[11px] font-black text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded-md border border-slate-200/60" dir="ltr">
                      <User size={11}/> {selectedCase.patient_id || selectedCase.id || '...'}
                    </span>
                    {(selectedCase.gender || selectedCase.age) && (
                      <span className="flex items-center gap-1 text-[10px] sm:text-[11px] font-black text-slate-600 bg-slate-100/80 px-2 py-0.5 rounded-md border border-slate-200/60">
                        {selectedCase.gender ? (selectedCase.gender === 'male' || selectedCase.gender === 'ذكر' ? 'ذكر' : 'أنثى') : ''}
                        {selectedCase.gender && selectedCase.age ? ' — ' : ''}
                        {selectedCase.age ? `${selectedCase.age} سنة` : ''}
                      </span>
                    )}
                    {(() => {
                      const rawPhone = selectedCase.phone;
                      const hasPhone = rawPhone && String(rawPhone).trim() !== '' && rawPhone !== 'بدون هاتف' && rawPhone !== '-' && rawPhone !== '—';
                      if (!hasPhone) return null;
                      return (
                        <span className="flex items-center gap-1 text-[10px] sm:text-[11px] font-black text-sky-600 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100/60">
                          <Phone size={11}/> <span dir="ltr">{rawPhone}</span>
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
              
              {/* Plain Text Date, Visit ID, Badges & Export to Excel */}
              <div className="flex flex-col items-start md:items-end gap-1 self-stretch md:self-auto">
                <div className="flex items-center gap-1.5 text-slate-500 font-bold text-xs">
                  <Calendar size={13} className="text-sky-600 opacity-80" />
                  <span dir="ltr">{new Date(selectedCase.closed_at || selectedCase.created_at).toLocaleDateString('en-GB')}</span>
                  <span className="text-slate-300 mx-0.5">•</span>
                  <span dir="ltr">{new Date(selectedCase.closed_at || selectedCase.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                </div>
                
                <div className="flex items-center gap-1.5 text-slate-500 font-bold text-xs">
                  <span>معرف الزيارة:</span>
                  <span className="text-slate-600 font-bold" dir="ltr">{selectedCase.visit_number || selectedCase.visit_id || selectedCase.id}</span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                  <button
                    onClick={exportModalToExcel}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 hover:border-emerald-300 rounded-lg text-[11px] font-bold transition-all shadow-xs border border-slate-200 cursor-pointer active:scale-95"
                    title="تصدير بيانات وخدمات الحالة كـ Excel"
                  >
                    <Download size={12} className="text-emerald-600" />
                    <span>تصدير كـ Excel</span>
                  </button>
                </div>
              </div>
            </div>

            {/* CONTENT */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar flex flex-col items-center">
              <div className="w-full space-y-6">

                {/* Services Ordered */}
                {(() => {
                  const allItems = [
                    ...(selectedCase.labRequests || []).map(r => ({ ...r, typeLabel: 'مختبر' })),
                    ...(selectedCase.radiologyRequests || []).map(r => ({ ...r, typeLabel: 'أشعة' })),
                    ...(selectedCase.clinicalRequests || []).map(r => ({ ...r, typeLabel: 'خدمة سريرية' }))
                  ];
                  const vipDiscount = selectedCase.is_exempt === 1 ? parseFloat(selectedCase.consultation_fee || 0) : 0;
                  const servicesDiscount = allItems.reduce((acc, curr) => acc + (parseFloat(curr.discount_amount) || 0), 0);
                  const totalExempted = vipDiscount + servicesDiscount;
                  const totalItemsCount = allItems.length + (selectedCase.is_exempt === 1 ? 1 : 0);

                  return (
                    <div className="space-y-2.5 w-full">
                      {/* Floating Header Outside List (like Patient EMR Modal) */}
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-sky-100/80 rounded-lg text-sky-600 shadow-xs">
                            <Layers size={16} />
                          </div>
                          <h3 className="text-sm font-black text-slate-700">الخدمات المطلوبة والمسددة</h3>
                          <span className="text-xs px-2.5 py-0.5 font-black bg-sky-50 text-sky-700 rounded-full border border-sky-200/60">
                            {totalItemsCount}
                          </span>
                        </div>
                      </div>

                      {/* Card Container for Table & Summary */}
                      <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="w-full overflow-x-auto">
                          <table className="w-full text-right text-sm whitespace-nowrap table-fixed">
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>
                                <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[5%] text-center">#</th>
                                <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[35%] text-right">اسم الخدمة</th>
                                <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[12%] text-right">الجهة</th>
                                <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[18%] text-right">التاريخ والوقت</th>
                                <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[15%] text-right">السعر الأساسي</th>
                                <th className="px-5 py-3.5 text-xs font-bold text-slate-500 w-[15%] text-right">السعر المعتمد</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-100">
                              {allItems.length === 0 && !selectedCase.is_exempt ? (
                                <tr>
                                  <td colSpan="6" className="p-12 text-center text-gray-400 font-bold">
                                    <div className="flex flex-col items-center gap-2">
                                      <ShieldAlert size={32} className="text-gray-300" strokeWidth={1.5}/>
                                      <span>لم يتم طلب أي خدمات في هذه الزيارة.</span>
                                    </div>
                                  </td>
                                </tr>
                              ) : (
                                <>
                                  {selectedCase.is_exempt === 1 && (
                                    <tr className="hover:bg-slate-50/50 transition-colors">
                                      <td className="px-5 py-3 font-black text-slate-400 text-center text-xs align-middle">1</td>
                                      <td className="px-5 py-3 font-semibold text-slate-800 align-middle whitespace-pre-wrap break-words max-w-[250px]">
                                        <span className="font-bold text-slate-800 text-sm">رسوم المعاينة والكشف</span>
                                      </td>
                                      <td className="px-5 py-3 align-middle">
                                        <span className="font-semibold text-slate-600 text-xs">خدمة سريرية</span>
                                      </td>
                                      <td className="px-5 py-3 align-middle">
                                        <div className="flex flex-col">
                                          <span className="text-sm font-bold text-slate-700" dir="ltr">
                                            {new Date(selectedCase.closed_at || selectedCase.created_at).toLocaleDateString('en-GB')}
                                          </span>
                                          <span className="text-[10px] font-bold text-slate-400" dir="ltr">
                                            {new Date(selectedCase.closed_at || selectedCase.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-5 py-3 align-middle">
                                        <div className="flex items-center gap-1">
                                          <span className="text-sm font-black text-slate-400 line-through decoration-red-300 decoration-1" dir="ltr">
                                            {Math.round(Number(selectedCase.consultation_fee || 0)).toLocaleString('en-US')}
                                          </span>
                                          <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                                        </div>
                                      </td>
                                      <td className="px-5 py-3 align-middle">
                                        <span className="font-black text-indigo-600 text-sm">مجانًا</span>
                                      </td>
                                    </tr>
                                  )}
                                  {allItems.map((item, idx) => {
                                    const rowNum = (selectedCase.is_exempt === 1 ? 1 : 0) + idx + 1;
                                    const itemDate = item.requested_at || item.created_at || selectedCase.closed_at || selectedCase.created_at;
                                    const originalPrice = Math.round(Number(item.price || 0));
                                    const finalPrice = Math.round(Number(item.final_price || item.price || 0));
                                    const isFree = Boolean(item.is_free === 1 || item.is_free === true);

                                    return (
                                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-5 py-3 font-black text-slate-400 text-center text-xs align-middle">{rowNum}</td>
                                        <td className="px-5 py-3 font-semibold text-slate-800 align-middle whitespace-pre-wrap break-words max-w-[250px]">
                                          <div className="flex items-center flex-wrap gap-2">
                                            <span className="font-bold text-slate-800 text-sm">{item.name || item.service_name || item.test_name}</span>
                                            {item.typeLabel === 'أشعة' && (item.with_film === false || item.with_film === 0 || item.withFilm === false) && (
                                              <span className="text-xs font-semibold text-slate-500 mr-1.5">
                                                (بدون فيلم)
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-5 py-3 align-middle">
                                          <span className="font-semibold text-slate-600 text-xs">{item.typeLabel}</span>
                                        </td>
                                        <td className="px-5 py-3 align-middle">
                                          <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-700" dir="ltr">
                                              {new Date(itemDate).toLocaleDateString('en-GB')}
                                            </span>
                                            <span className="text-[10px] font-bold text-slate-400" dir="ltr">
                                              {new Date(itemDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                            </span>
                                          </div>
                                        </td>
                                        <td className="px-5 py-3 align-middle">
                                          <div className="flex items-center gap-1">
                                            <span className={`text-sm font-black ${isFree || item.discount_amount > 0 ? 'text-slate-400 line-through decoration-red-300 decoration-1' : 'text-slate-700'}`} dir="ltr">
                                              {originalPrice.toLocaleString('en-US')}
                                            </span>
                                            <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                                          </div>
                                        </td>
                                        <td className="px-5 py-3 align-middle">
                                          {isFree ? (
                                            <span className="font-black text-indigo-600 text-sm">مجانًا</span>
                                          ) : (
                                            <div className="flex items-center gap-1 text-slate-800">
                                              <span className="font-black text-indigo-600 text-sm tracking-tight" dir="ltr">
                                                {finalPrice.toLocaleString('en-US')}
                                              </span>
                                              <span className="text-[10px] font-bold text-slate-400">ر.ي</span>
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </>
                              )}
                            </tbody>
                          </table>
                        </div>

                        {totalExempted > 0 && (() => {
                          const roundedExempted = Math.round(totalExempted);
                          const bgClass = 'bg-emerald-50/50 border-emerald-100/60';
                          const textClass = 'text-emerald-800';
                          const numberClass = 'text-emerald-700';
                          const currencyClass = 'text-emerald-600';
                          const taffyotClass = 'text-emerald-700/70 border-emerald-200/60';

                          return (
                            <div className={`flex items-center justify-between px-6 py-4 border-t mt-auto ${bgClass}`}>
                              <span className={`text-xs font-bold ${textClass}`}>إجمالي القيمة المعفاة / الخصومات:</span>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-base font-black tracking-tight ${numberClass}`} dir="ltr">
                                  {roundedExempted.toLocaleString('en-US')}
                                </span>
                                <span className={`text-[10px] font-bold ${currencyClass}`}>ر.ي</span>
                                {roundedExempted > 0 && (
                                  <span className={`text-xs font-bold mr-1.5 pr-2 border-r ${taffyotClass}`}>
                                    {taffyot(roundedExempted).replace(/(ريالاً يمنياً|ريال يمني|فقط|لا غير|-)/g, '').trim()} ريال يمني.
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ─── HISTORIC READ-ONLY EMR MODAL ─── */}
      <PatientEMRModal
        isOpen={!!selectedEMRPatient}
        onClose={() => setSelectedEMRPatient(null)}
        patient={selectedEMRPatient}
        visit={selectedEMRVisit || selectedEMRPatient}
        readOnly={true}
        isArchiveScreen={true}
        historyLoading={historyLoading}
        patientHistory={patientHistory}
        selectedVisit={selectedEMRVisit}
        onSelectVisit={handleSelectVisit}
        prescriptionItems={prescriptionItems}
        loadingPrescription={loadingPrescription}
        onPrintPrescription={handlePrintPrescription}
      />

    </div>
  );
}
