import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import axios from "axios";
import {
  Users,
  Activity,
  Wallet,
  Stethoscope,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Radiation,
  LayoutDashboard,
  Receipt,
  Layers,
  CheckCircle2,
  Download,
  Scissors,
  TrendingUp,
  TrendingDown,
  RotateCcw,
  Tag,
  ArrowDownLeft,
  ArrowUpRight,
  Eye,
  Calendar,
  CreditCard,
  ChevronDown,
  Check,
  FolderOpen,
  Sparkles
} from "lucide-react";
import { toast } from "react-toastify";
import useAuthStore from "../../store/useAuthStore";
import useSocketStore from "../../store/useSocketStore";
import { useNavigate } from "react-router-dom";
import taffyot from "../../utils/taffyot";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { getCurrentShiftDate } from "../../utils/shiftHelpers";
import PatientEMRModal from "../../components/common/PatientEMRModal";
import FinancialRecordModal from "../../components/common/FinancialRecordModal";
import { TransactionDetailsModal } from "../../components/cashier/modals";
import {
  cleanDescription,
  formatCurrency,
  formatDateEn,
  formatTimeEn,
  getTransactionCategoryLabel,
  isServiceIncome,
  parseRefundDetails,
  parseServiceOrSurgery
} from "../../components/cashier/cashierConstants";

export default function DoctorDashboard() {
  const { token, user } = useAuthStore();
  const navigate = useNavigate();

  // Data States
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);

  // Temporal Filter States (matching PatientsArchive.js)
  // Ordered: 'today' | 'week' | 'month' | 'all' | 'custom'
  const [dateFilter, setDateFilter] = useState("today");
  const [customRange, setCustomRange] = useState({ start: "", end: "" });

  // ─── Main Tabs & Sub-Filters State ──────────────────────────────────
  const [activeMainTab, setActiveMainTab] = useState("patient_payments"); // 'patient_payments' | 'treasury_ledger'

  // Tab 1: Patient Payments Ledger State
  const [patientPaymentsSearch, setPatientPaymentsSearch] = useState("");
  const [patientTypeFilter, setPatientTypeFilter] = useState("all"); // 'all' | 'clinic' | 'external'
  const [paymentsCurrentPage, setPaymentsCurrentPage] = useState(1);

  // Tab 2: Treasury Ledger State
  const [generalTxRows, setGeneralTxRows] = useState([]);
  const [generalTxLoading, setGeneralTxLoading] = useState(false);
  const [txSearch, setTxSearch] = useState("");
  const [txTypeFilter, setTxTypeFilter] = useState("all"); // 'all' | 'income' | 'expense' | 'refunds'
  const [txCurrentPage, setTxCurrentPage] = useState(1);

  // Modal States: Financial Record Modal (ReadOnly) & Clinical EMR Archive Modal
  const [selectedFinancialPatientId, setSelectedFinancialPatientId] = useState(null);
  const [selectedInitialVisitId, setSelectedInitialVisitId] = useState(null);
  const [financialRecordData, setFinancialRecordData] = useState(null);
  const [financialRecordLoading, setFinancialRecordLoading] = useState(false);

  const [selectedClinicalPatient, setSelectedClinicalPatient] = useState(null);
  const [selectedClinicalVisit, setSelectedClinicalVisit] = useState(null);
  const [clinicalPatientHistory, setClinicalPatientHistory] = useState([]);
  const [clinicalHistoryLoading, setClinicalHistoryLoading] = useState(false);
  const [clinicalPrescriptionItems, setClinicalPrescriptionItems] = useState([]);
  const [clinicalLoadingPrescription, setClinicalLoadingPrescription] = useState(false);

  const [selectedTxForDetails, setSelectedTxForDetails] = useState(null);
  const ITEMS_PER_PAGE = 20;

  const handleSelectClinicalVisit = useCallback(async (visit) => {
    setSelectedClinicalVisit(visit);
    setClinicalPrescriptionItems([]);
    if (!visit?.id) return;
    setClinicalLoadingPrescription(true);
    try {
      const prescRes = await axios.get(`/api/doctor/visit/${visit.id}/prescription`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (prescRes.data && Array.isArray(prescRes.data.items)) {
        setClinicalPrescriptionItems(prescRes.data.items);
      }
    } catch (err) {
      console.error("Failed to load prescription:", err);
    } finally {
      setClinicalLoadingPrescription(false);
    }
  }, [token]);

  const handleOpenClinicalArchive = useCallback(async (p) => {
    if (!p) return;
    const actualId = typeof p === "object" ? (p.id || p.patient_id) : p;
    const patientObj = typeof p === "object" ? p : { id: actualId };
    setSelectedClinicalPatient(patientObj);
    setClinicalPatientHistory([]);
    setSelectedClinicalVisit(null);
    setClinicalPrescriptionItems([]);
    setClinicalHistoryLoading(true);
    try {
      const res = await axios.get(`/api/doctor/patient/${actualId}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const visits = Array.isArray(res.data) ? res.data : [];
      setClinicalPatientHistory(visits);
      if (visits.length > 0) {
        handleSelectClinicalVisit(visits[0]);
      }
    } catch {
      toast.error("فشل تحميل السجل الطبي للمريض");
    } finally {
      setClinicalHistoryLoading(false);
    }
  }, [token, handleSelectClinicalVisit]);

  const openFinancialRecord = useCallback(async (patientId, targetVisitId = null) => {
    if (!patientId) return;
    setSelectedFinancialPatientId(patientId);
    setSelectedInitialVisitId(targetVisitId);
    setFinancialRecordLoading(true);
    setFinancialRecordData(null);
    try {
      const res = await axios.get(`/api/cashier/archive/patient/${patientId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data) {
        setFinancialRecordData(res.data);
      } else {
        toast.error("تعذر جلب السجل المالي للمريض");
      }
    } catch {
      toast.error("خطأ في الاتصال بالخادم لجلب السجل المالي");
    } finally {
      setFinancialRecordLoading(false);
    }
  }, [token]);

  const handleOpenMedicalRecord = handleOpenClinicalArchive;

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const latestPatientEvent = useSocketStore((state) => state.latestPatientEvent);
  const latestCashierUpdate = useSocketStore((state) => state.latestCashierUpdate);
  const lastFetchRef = useRef(0);
  const isInitialMount = useRef(true);

  // ─── Fetch Stats from Backend (خالية من الإعفاءات والخدمات المجانية) ────
  const fetchStats = useCallback(
    async (silent = false) => {
      if (dateFilter === "custom" && (!customRange.start || !customRange.end)) {
        return;
      }

      try {
        if (!silent && !stats) setLoading(true);
        if (!silent && stats) setIsFiltering(true);

        let url = `/api/doctor/dashboard-stats?period=${dateFilter}`;
        if (dateFilter === "custom") {
          url += `&startDate=${customRange.start}&endDate=${customRange.end}`;
        }

        const res = await axios.get(url, { headers });
        setStats(res.data);
        lastFetchRef.current = Date.now();
      } catch {
        if (!silent) toast.error("خطأ في تحميل إحصائيات لوحة التحكم");
      } finally {
        setLoading(false);
        setIsFiltering(false);
      }
    },
    [dateFilter, customRange, headers, stats]
  );

  // ─── Fetch General Transactions for Tab 2 ───────────────────────────
  const fetchGeneralTransactions = useCallback(
    async (silent = false) => {
      if (dateFilter === "custom" && (!customRange.start || !customRange.end)) {
        return;
      }
      try {
        if (!silent) setGeneralTxLoading(true);
        let url = `/api/cashier/general-transactions?period=${dateFilter}`;
        if (dateFilter === "custom") {
          url += `&from=${customRange.start}&to=${customRange.end || customRange.start}`;
        }
        const res = await axios.get(url, { headers });
        setGeneralTxRows(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error("Error fetching general transactions:", err);
      } finally {
        if (!silent) setGeneralTxLoading(false);
      }
    },
    [dateFilter, customRange, headers]
  );

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      fetchStats();
      fetchGeneralTransactions();
    } else {
      fetchStats();
      fetchGeneralTransactions();
    }
    setPaymentsCurrentPage(1);
    setTxCurrentPage(1);
  }, [dateFilter, customRange]);

  // Real-time Socket sync
  useEffect(() => {
    if (
      (latestPatientEvent?.timestamp && latestPatientEvent.timestamp > lastFetchRef.current) ||
      (latestCashierUpdate?.timestamp && latestCashierUpdate.timestamp > lastFetchRef.current)
    ) {
      fetchStats(true);
      fetchGeneralTransactions(true);
    }
  }, [latestPatientEvent, latestCashierUpdate, fetchStats, fetchGeneralTransactions]);

  // Reset Filters (for custom date range)
  const handleResetFilters = () => {
    setDateFilter("today");
    setCustomRange({ start: "", end: "" });
    setPatientPaymentsSearch("");
    setTxSearch("");
  };

  // ─── Extract Stats & Financial Metrics ──────────────────────────────
  const {
    patientsFlow = {},
    procedures = {},
    financial = {},
    executedServices = [],
  } = stats || {};

  const treasury = financial?.treasury || {
    netBalance: 0,
    cashNet: 0,
    bankNet: 0,
    totalIncome: 0,
    totalExpense: 0,
    totalRefunds: 0,
    incomeCount: 0,
    expenseCount: 0,
    refundCount: 0,
    allCount: 0,
    transactionsCount: 0,
  };

  const totalRevenue = treasury.totalIncome || financial?.totalRevenue || 0;
  const consultationIncome = financial?.consultationIncome || 0;
  const servicesIncome = financial?.servicesIncome || 0;
  const surgeryIncome = financial?.surgeryIncome || financial?.deptIncome?.surgery || 0;
  const generalIncome = financial?.generalIncome || financial?.deptIncome?.general || 0;
  const generalCount = financial?.generalCount || 0;
  const discountsValue = financial?.discounts || 0;
  const deptIncome = financial?.deptIncome || { lab: 0, radiology: 0, clinical: 0, surgery: 0, general: 0 };

  const consultationsCount = patientsFlow?.total || 0;
  const exemptCount = patientsFlow?.exemptCount ?? financial?.exemptCount ?? 0;
  const reviewCount = patientsFlow?.reviewCount ?? financial?.reviewCount ?? 0;
  const paidConsultationsCount =
    financial?.paidConsultationsCount ??
    patientsFlow?.paidTotal ??
    patientsFlow?.paidCount ??
    Math.max(0, consultationsCount - (exemptCount + reviewCount));

  const clinicExecutedServices = useMemo(
    () => executedServices.filter((s) => s.service_type !== "surgery"),
    [executedServices]
  );

  const freeServicesCount = procedures?.freeServicesCount ?? financial?.freeServicesCount ?? 0;
  const servicesCount = clinicExecutedServices.length || procedures?.paidCount || 0;
  const totalServicesCount =
    (procedures?.total && procedures.total >= servicesCount && procedures.total <= servicesCount + freeServicesCount + 5)
      ? procedures.total
      : (servicesCount + freeServicesCount);

  // Clean taffyot helper function (Smart & Professional formatting matching Central taffyot)
  const cleanTaffyot = (amount) => {
    const num = parseFloat(amount);
    if (!num || num <= 0) return "";
    const text = taffyot(num);
    if (!text || text === "صفر ريال يمني") return "";
    return text.endsWith(".") ? text : `${text}.`;
  };

  // Spelled revenue
  const spelledRevenue = useMemo(() => {
    return cleanTaffyot(totalRevenue);
  }, [totalRevenue]);

  // Department counts for Executed Services
  const deptCounts = useMemo(() => {
    return {
      all: executedServices.length,
      lab: executedServices.filter((s) => s.service_type === "lab").length,
      radiology: executedServices.filter((s) => s.service_type === "radiology").length,
      clinical: executedServices.filter((s) => s.service_type === "clinical").length,
      surgery: executedServices.filter((s) => s.service_type === "surgery").length,
    };
  }, [executedServices]);

  const totalDeptSum = useMemo(() => {
    return (
      consultationIncome +
      (deptIncome.lab || 0) +
      (deptIncome.radiology || 0) +
      (deptIncome.clinical || 0) +
      surgeryIncome +
      generalIncome
    );
  }, [consultationIncome, deptIncome, surgeryIncome, generalIncome]);

  // Spelled revenue for Section 4
  const spelledDeptRevenue = useMemo(() => {
    return cleanTaffyot(totalDeptSum || totalRevenue);
  }, [totalDeptSum, totalRevenue]);

  // Spelled expenses & refunds for Section 4
  const spelledDeptExpense = useMemo(() => {
    return cleanTaffyot(treasury.totalExpense);
  }, [treasury.totalExpense]);

  const spelledDeptRefunds = useMemo(() => {
    return cleanTaffyot(treasury.totalRefunds);
  }, [treasury.totalRefunds]);

  // Net Balance calculation for Section 4
  const grandNetBalance = useMemo(() => {
    const rev = totalDeptSum || totalRevenue || 0;
    return rev - (treasury.totalExpense || 0) - (treasury.totalRefunds || 0);
  }, [totalDeptSum, totalRevenue, treasury.totalExpense, treasury.totalRefunds]);

  const spelledDeptNet = useMemo(() => {
    return cleanTaffyot(grandNetBalance);
  }, [grandNetBalance]);

  // Total count of all executed services and income entries for Section 4
  const totalExecutedCount = useMemo(() => {
    return (
      paidConsultationsCount +
      (deptCounts?.lab || 0) +
      (deptCounts?.radiology || 0) +
      (deptCounts?.clinical || 0) +
      (deptCounts?.surgery || 0) +
      (generalCount || 0)
    );
  }, [paidConsultationsCount, deptCounts, generalCount]);

  // Income Breakdown Array for Section 4 Table (With Quantity & clean Taffyot & General Income)
  const incomeBreakdown = useMemo(() => {
    const calcPercent = (val) => (totalDeptSum > 0 ? (val / totalDeptSum) * 100 : 0);

    const list = [
      {
        id: "consultation",
        name: "رسوم المعاينة",
        desc: "رسوم كشف ومعاينات العيادة السريرية",
        countText: `${paidConsultationsCount} معاينة`,
        amount: consultationIncome,
        spelled: cleanTaffyot(consultationIncome),
        percent: calcPercent(consultationIncome),
        icon: Stethoscope,
      },
      {
        id: "lab",
        name: "المختبر",
        desc: "التحاليل والفحوصات المخبرية التشخيصية",
        countText: `${deptCounts.lab} خدمة`,
        amount: deptIncome.lab || 0,
        spelled: cleanTaffyot(deptIncome.lab || 0),
        percent: calcPercent(deptIncome.lab || 0),
        icon: FlaskConical,
      },
      {
        id: "radiology",
        name: "الأشعة",
        desc: "الأشعة التشخيصية والتصوير الطبي",
        countText: `${deptCounts.radiology} خدمة`,
        amount: deptIncome.radiology || 0,
        spelled: cleanTaffyot(deptIncome.radiology || 0),
        percent: calcPercent(deptIncome.radiology || 0),
        icon: Radiation,
      },
      {
        id: "clinical",
        name: "الخدمات السريرية",
        desc: "الإجراءات والخدمات التمريضية والجراحية الصغرى",
        countText: `${deptCounts.clinical} خدمة`,
        amount: deptIncome.clinical || 0,
        spelled: cleanTaffyot(deptIncome.clinical || 0),
        percent: calcPercent(deptIncome.clinical || 0),
        icon: Activity,
      },
      {
        id: "surgery",
        name: "العمليات الجراحية",
        desc: "رسوم ودفعات العمليات الجراحية المعتمدة",
        countText: `${deptCounts.surgery} خدمة`,
        amount: surgeryIncome,
        spelled: cleanTaffyot(surgeryIncome),
        percent: calcPercent(surgeryIncome),
        icon: Scissors,
      },
      {
        id: "general",
        name: "الإيرادات العامة والمتنوعة",
        desc: "سندات القبض العامة والإيرادات المتفرقة وتوريدات الخزينة",
        countText: `${generalCount} حركة`,
        amount: generalIncome,
        spelled: cleanTaffyot(generalIncome),
        percent: calcPercent(generalIncome),
        icon: Tag,
      },
    ];

    return list;
  }, [totalDeptSum, consultationIncome, deptIncome, surgeryIncome, generalIncome, generalCount, paidConsultationsCount, deptCounts]);

  // ─── Filtered Patient Payments (Tab 1) ──────────────────────────────
  const patientPayments = stats?.patientPayments || [];

  const filteredPatientPayments = useMemo(() => {
    let list = patientPayments;

    // Filter by patient type
    if (patientTypeFilter === "clinic") {
      list = list.filter((p) => !p.is_external && !String(p.visit_number || "").startsWith("EXT-"));
    } else if (patientTypeFilter === "external") {
      list = list.filter((p) => Boolean(p.is_external) || String(p.visit_number || "").startsWith("EXT-"));
    }

    // Search query
    const q = patientPaymentsSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const cleanVisitId = String(p.visit_number || p.visit_id || "").replace(/^#+/, "").toLowerCase();
        const pName = (p.patient_name || "").toLowerCase();
        return pName.includes(q) || cleanVisitId.includes(q);
      });
    }

    return list;
  }, [patientPayments, patientTypeFilter, patientPaymentsSearch]);

  const paymentsTotalPages = Math.ceil(filteredPatientPayments.length / ITEMS_PER_PAGE);
  const paginatedPatientPayments = useMemo(() => {
    const start = (paymentsCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredPatientPayments.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredPatientPayments, paymentsCurrentPage]);

  // ─── Filtered General Transactions (Tab 2) ──────────────────────────
  const filteredGeneralTx = useMemo(() => {
    let list = generalTxRows;

    // Filter by type
    if (txTypeFilter === "income") {
      list = list.filter((r) => r.type === "income" && Number(r.is_refund) !== 1 && r.category !== "refund");
    } else if (txTypeFilter === "expense") {
      list = list.filter((r) => r.type === "expense" && Number(r.is_refund) !== 1 && r.category !== "refund");
    } else if (txTypeFilter === "refunds") {
      list = list.filter((r) => Number(r.is_refund) === 1 || r.category === "refund");
    }

    // Search query
    const q = txSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const desc = (cleanDescription(r.description) || r.notes || "").toLowerCase();
        const cat = (getTransactionCategoryLabel(r) || "").toLowerCase();
        return desc.includes(q) || cat.includes(q);
      });
    }

    return list;
  }, [generalTxRows, txTypeFilter, txSearch]);

  const txTotalPages = Math.ceil(filteredGeneralTx.length / ITEMS_PER_PAGE);
  const paginatedGeneralTx = useMemo(() => {
    const start = (txCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredGeneralTx.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredGeneralTx, txCurrentPage]);

  // ─── Format Date/Time Helper in English (Reports.js Style) ───────────
  const formatDateTimeParts = (dateStr) => {
    if (!dateStr) return { date: "--", time: "", full: "--" };
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { date: "--", time: "", full: "--" };

    const pad = (n) => n.toString().padStart(2, "0");
    const date = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;

    let hours = d.getHours();
    const minutes = pad(d.getMinutes());
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    const time = `${pad(hours)}:${minutes} ${ampm}`;

    return { date, time, full: `${date} - ${time}` };
  };

  const formatDateTime = (dateStr) => formatDateTimeParts(dateStr).full;

  // ─── Export Financial Analysis to Excel (قسم التحليل المالي) ──
  const exportFinancialAnalysisToExcel = async () => {
    if (!incomeBreakdown || incomeBreakdown.length === 0) {
      toast.warning("لا توجد بيانات تحليل مالي للتصدير");
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("التحليل المالي");
      sheet.views = [{ rightToLeft: true }];

      sheet.columns = [
        { header: "الخدمات / القسم", key: "service_name", width: 30 },
        { header: "إجمالي الدخل (ر.ي)", key: "total_amount", width: 25 },
        { header: "المبلغ كتابةً (التفقيط)", key: "spelled", width: 50 },
      ];

      // Style Header row
      sheet.getRow(1).eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1D4ED8" }, // Deep Royal Blue
        };
        cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 12 };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "thin", color: { argb: "FFCBD5E1" } },
          left: { style: "thin", color: { argb: "FFCBD5E1" } },
          bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
          right: { style: "thin", color: { argb: "FFCBD5E1" } },
        };
      });
      sheet.getRow(1).height = 30;

      // Add Data rows (بدون عمود العدد وبدون عمود النسبة)
      incomeBreakdown.forEach((item) => {
        sheet.addRow({
          service_name: item.name || "—",
          total_amount: `YER ${Math.round(item.amount || 0).toLocaleString("en-US")}`,
          spelled: item.spelled || "—",
        });
      });

      // Style Data rows
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.height = 24;
          row.eachCell((cell, colNumber) => {
            cell.alignment = {
              vertical: "middle",
              horizontal: colNumber === 1 || colNumber === 3 ? "right" : "center",
            };
            cell.border = {
              top: { style: "thin", color: { argb: "FFE2E8F0" } },
              left: { style: "thin", color: { argb: "FFE2E8F0" } },
              bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
              right: { style: "thin", color: { argb: "FFE2E8F0" } },
            };
            if (colNumber === 2) {
              cell.font = { bold: true, color: { argb: "FF1E293B" } };
            }
          });
        }
      });

      // Add Grand Summary Rows (الإيرادات، المصروفات، المستردات، الصافي)
      sheet.addRow([]);

      const summaryRows = [
        {
          label: "إجمالي الإيرادات:",
          amount: Math.round(totalDeptSum || totalRevenue || 0),
          spelled: spelledDeptRevenue || cleanTaffyot(totalDeptSum || totalRevenue) || "—",
          headerBg: "FF1D4ED8", // Deep Royal Blue
          amountBg: "FFF1F5F9",
          isFinal: false,
        },
        {
          label: "إجمالي المصروفات:",
          amount: Math.round(treasury.totalExpense || 0),
          spelled: spelledDeptExpense || cleanTaffyot(treasury.totalExpense) || "—",
          headerBg: "FFF59E0B", // Amber
          amountBg: "FFFFFBEB",
          isFinal: false,
        },
        {
          label: "إجمالي المستردات:",
          amount: Math.round(treasury.totalRefunds || 0),
          spelled: spelledDeptRefunds || cleanTaffyot(treasury.totalRefunds) || "—",
          headerBg: "FFE11D48", // Rose
          amountBg: "FFFFF1F2",
          isFinal: false,
        },
        {
          label: "إجمالي الصافي:",
          amount: Math.round(grandNetBalance),
          spelled: spelledDeptNet || cleanTaffyot(grandNetBalance) || "—",
          headerBg: "FF047857", // Deep Emerald
          amountBg: "FFF0FDF4",
          isFinal: true,
        },
      ];

      summaryRows.forEach((sRow) => {
        const rowNumber = sheet.rowCount + 1;
        const row = sheet.getRow(rowNumber);
        row.height = 30;

        const labelCell = sheet.getCell(`A${rowNumber}`);
        labelCell.value = sRow.label;
        labelCell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
        labelCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: sRow.headerBg },
        };
        labelCell.alignment = { horizontal: "center", vertical: "middle" };

        const amountCell = sheet.getCell(`B${rowNumber}`);
        amountCell.value = `YER ${sRow.amount.toLocaleString("en-US")}`;
        amountCell.font = { bold: true, size: 11, color: { argb: "FF1E293B" } };
        amountCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: sRow.amountBg },
        };
        amountCell.alignment = { horizontal: "center", vertical: "middle" };

        const spelledCell = sheet.getCell(`C${rowNumber}`);
        spelledCell.value = sRow.spelled;
        spelledCell.font = { bold: true, size: 11, color: { argb: "FF334155" } };
        spelledCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
        spelledCell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };

        for (let col = 1; col <= 3; col++) {
          sheet.getRow(rowNumber).getCell(col).border = {
            top: { style: sRow.isFinal ? "medium" : "thin", color: { argb: sRow.isFinal ? "FF047857" : "FFE2E8F0" } },
            bottom: { style: sRow.isFinal ? "double" : "thin", color: { argb: sRow.isFinal ? "FF047857" : "FFE2E8F0" } },
            left: { style: "thin", color: { argb: "FFCBD5E1" } },
            right: { style: "thin", color: { argb: "FFCBD5E1" } },
          };
        }
      });

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `التحليل_المالي_${getCurrentShiftDate()}.xlsx`);
      toast.success("تم تصدير التحليل المالي بنجاح");
    } catch (err) {
      console.error("Failed to export financial analysis to Excel:", err);
      toast.error("حدث خطأ أثناء تصدير التحليل المالي كـ Excel");
    }
  };

  // ─── Export to Excel (سجل مدفوعات المرضى & سجل الإيرادات والمصروفات مع التفقيط) ──
  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();

    if (activeMainTab === "patient_payments") {
      if (!filteredPatientPayments || filteredPatientPayments.length === 0) {
        toast.warning("لا توجد بيانات مدفوعات للتصدير في هذه التصفية");
        return;
      }

      try {
        const sheet = workbook.addWorksheet("سجل مدفوعات المرضى");
        sheet.views = [{ rightToLeft: true }];

        sheet.columns = [
          { header: "معرف الزيارة", key: "visit_number", width: 18 },
          { header: "اسم المريض", key: "patient_name", width: 28 },
          { header: "نوع المريض", key: "patient_type", width: 16 },
          { header: "رسوم المعاينة", key: "consultation", width: 18 },
          { header: "المختبر", key: "lab", width: 18 },
          { header: "الأشعة", key: "radiology", width: 18 },
          { header: "الخدمات السريرية", key: "clinical", width: 18 },
          { header: "العمليات الجراحية", key: "surgery", width: 18 },
          { header: "إجمالي المدفوع", key: "total_paid", width: 22 },
        ];

        // Style Header row
        sheet.getRow(1).eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF2563EB" },
          };
          cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 12 };
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.border = {
            top: { style: "thin", color: { argb: "FFCBD5E1" } },
            left: { style: "thin", color: { argb: "FFCBD5E1" } },
            bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
            right: { style: "thin", color: { argb: "FFCBD5E1" } },
          };
        });
        sheet.getRow(1).height = 28;

        filteredPatientPayments.forEach((p) => {
          const isExt = Boolean(p.is_external) || String(p.visit_number || "").startsWith("EXT-");
          const cleanVisitId = String(p.visit_number || p.visit_id || "").replace(/^#+/, "");
          sheet.addRow({
            visit_number: cleanVisitId || "—",
            patient_name: p.patient_name || "—",
            patient_type: isExt ? "مريض خارجي" : "عيادة",
            consultation: p.consultation_paid ? `YER ${Math.round(p.consultation_paid).toLocaleString("en-US")}` : "—",
            lab: p.lab_paid ? `YER ${Math.round(p.lab_paid).toLocaleString("en-US")}` : "—",
            radiology: p.radiology_paid ? `YER ${Math.round(p.radiology_paid).toLocaleString("en-US")}` : "—",
            clinical: p.clinical_paid ? `YER ${Math.round(p.clinical_paid).toLocaleString("en-US")}` : "—",
            surgery: p.surgery_paid ? `YER ${Math.round(p.surgery_paid).toLocaleString("en-US")}` : "—",
            total_paid: `YER ${Math.round(p.total_paid || 0).toLocaleString("en-US")}`,
          });
        });

        // Style Data rows
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1) {
            row.height = 22;
            row.eachCell((cell, colNumber) => {
              cell.alignment = { vertical: "middle", horizontal: "center" };
              cell.border = {
                top: { style: "thin", color: { argb: "FFE2E8F0" } },
                left: { style: "thin", color: { argb: "FFE2E8F0" } },
                bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
                right: { style: "thin", color: { argb: "FFE2E8F0" } },
              };
              if (colNumber === 9) {
                cell.font = { bold: true, color: { argb: "FF1E293B" } };
              }
            });
          }
        });

        const totalSum = filteredPatientPayments.reduce((s, p) => s + (parseFloat(p.total_paid) || 0), 0);

        sheet.addRow([]);
        const totalRowNumber = sheet.rowCount + 1;
        const totalRow = sheet.getRow(totalRowNumber);
        totalRow.height = 32;

        const labelCell = sheet.getCell(`A${totalRowNumber}`);
        labelCell.value = "إجمالي المدفوع:";
        labelCell.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
        labelCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF2563EB" },
        };
        labelCell.alignment = { horizontal: "center", vertical: "middle" };

        const numCell = sheet.getCell(`B${totalRowNumber}`);
        numCell.value = `YER ${Math.round(totalSum).toLocaleString("en-US")}`;
        numCell.font = { bold: true, size: 12, color: { argb: "FF1E293B" } };
        numCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF1F5F9" },
        };
        numCell.alignment = { horizontal: "center", vertical: "middle" };

        sheet.mergeCells(`C${totalRowNumber}:I${totalRowNumber}`);
        const spelledCell = sheet.getCell(`C${totalRowNumber}`);
        spelledCell.value = cleanTaffyot(Math.round(totalSum));
        spelledCell.font = { bold: true, size: 11, color: { argb: "FF334155" } };
        spelledCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
        spelledCell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };

        for (let col = 1; col <= 9; col++) {
          sheet.getRow(totalRowNumber).getCell(col).border = {
            top: { style: "medium", color: { argb: "FF2563EB" } },
            bottom: { style: "double", color: { argb: "FF2563EB" } },
            left: { style: "thin", color: { argb: "FFCBD5E1" } },
            right: { style: "thin", color: { argb: "FFCBD5E1" } },
          };
        }

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `سجل_مدفوعات_المرضى_${getCurrentShiftDate()}.xlsx`);
        toast.success("تم تصدير سجل مدفوعات المرضى بنجاح");
      } catch (err) {
        console.error(err);
        toast.error("فشل في تصدير ملف الإكسل");
      }
    } else {
      // Treasury Ledger Export
      if (!filteredGeneralTx || filteredGeneralTx.length === 0) {
        toast.warning("لا توجد حركات خزانة للتصدير في هذه التصفية");
        return;
      }

      try {
        const sheet = workbook.addWorksheet("سجل الإيرادات والمصروفات");
        sheet.views = [{ rightToLeft: true }];

        sheet.columns = [
          { header: "نوع الحركة", key: "type_label", width: 18 },
          { header: "الفئة التصنيفية", key: "category", width: 24 },
          { header: "الملاحظات التوضيحية", key: "notes", width: 45 },
          { header: "المبلغ المالي", key: "amount", width: 22 },
          { header: "التاريخ والوقت", key: "date_time", width: 25 },
        ];

        sheet.getRow(1).eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF2563EB" },
          };
          cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 12 };
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.border = {
            top: { style: "thin", color: { argb: "FFCBD5E1" } },
            left: { style: "thin", color: { argb: "FFCBD5E1" } },
            bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
            right: { style: "thin", color: { argb: "FFCBD5E1" } },
          };
        });
        sheet.getRow(1).height = 28;

        filteredGeneralTx.forEach((r) => {
          const isRefund = Number(r.is_refund) === 1 || r.category === "refund";
          const isIncome = r.type === "income" && !isRefund;
          const typeLabel = isRefund
            ? "استرداد"
            : isServiceIncome(r)
            ? "إيراد خدمات"
            : isIncome
            ? "إيراد عام"
            : "مصروف";
          const refundInfo = isRefund ? parseRefundDetails(r) : null;
          let noteText = "";
          if (isRefund && refundInfo) {
            noteText = [
              refundInfo.service && `الخدمة: ${refundInfo.service}`,
              refundInfo.reason && `السبب: ${refundInfo.reason}`,
            ].filter(Boolean).join(" - ") || cleanDescription(r.description) || r.notes || "—";
          } else {
            noteText = cleanDescription(r.description) || r.notes || "—";
          }

          sheet.addRow({
            type_label: typeLabel,
            category: getTransactionCategoryLabel(r),
            notes: noteText,
            amount: `YER ${Math.round(r.amount || 0).toLocaleString("en-US")}`,
            date_time: formatDateTimeParts(r.created_at).full,
          });
        });

        sheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1) {
            row.height = 22;
            row.eachCell((cell, colNumber) => {
              cell.alignment = { vertical: "middle", horizontal: "center" };
              cell.border = {
                top: { style: "thin", color: { argb: "FFE2E8F0" } },
                left: { style: "thin", color: { argb: "FFE2E8F0" } },
                bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
                right: { style: "thin", color: { argb: "FFE2E8F0" } },
              };
              if (colNumber === 4) {
                cell.font = { bold: true, color: { argb: "FF1E293B" } };
              }
            });
          }
        });

        const totalTxSum = filteredGeneralTx.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

        sheet.addRow([]);
        const totalRowNumber = sheet.rowCount + 1;
        const totalRow = sheet.getRow(totalRowNumber);
        totalRow.height = 32;

        const labelCell = sheet.getCell(`A${totalRowNumber}`);
        labelCell.value = "إجمالي الحركات:";
        labelCell.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
        labelCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF2563EB" },
        };
        labelCell.alignment = { horizontal: "center", vertical: "middle" };

        const numCell = sheet.getCell(`B${totalRowNumber}`);
        numCell.value = `YER ${Math.round(totalTxSum).toLocaleString("en-US")}`;
        numCell.font = { bold: true, size: 12, color: { argb: "FF1E293B" } };
        numCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF1F5F9" },
        };
        numCell.alignment = { horizontal: "center", vertical: "middle" };

        sheet.mergeCells(`C${totalRowNumber}:E${totalRowNumber}`);
        const spelledCell = sheet.getCell(`C${totalRowNumber}`);
        spelledCell.value = cleanTaffyot(Math.round(totalTxSum));
        spelledCell.font = { bold: true, size: 11, color: { argb: "FF334155" } };
        spelledCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
        spelledCell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };

        for (let col = 1; col <= 5; col++) {
          sheet.getRow(totalRowNumber).getCell(col).border = {
            top: { style: "medium", color: { argb: "FF2563EB" } },
            bottom: { style: "double", color: { argb: "FF2563EB" } },
            left: { style: "thin", color: { argb: "FFCBD5E1" } },
            right: { style: "thin", color: { argb: "FFCBD5E1" } },
          };
        }

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `سجل_الإيرادات_والمصروفات_العامة_والمستردات_${getCurrentShiftDate()}.xlsx`);
        toast.success("تم تصدير سجل الإيرادات والمصروفات بنجاح");
      } catch (err) {
        console.error(err);
        toast.error("فشل في تصدير ملف الإكسل");
      }
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 w-full p-6" dir="rtl">
        <div className="h-16 bg-white rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-white rounded-3xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full" dir="rtl">
      
      {/* ── 1. Page Header (لون الطبيب الأساسي والزر الاحترافي) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 flex-shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <LayoutDashboard size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800">لوحة تحكم الطبيب</h1>
            <p className="text-sm font-bold text-gray-500 mt-0.5">
              متابعة سير المعاينات، مؤشرات الخدمات الطبية المنفذة، والتحليل المالي للإيرادات لحظياً
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/doctor/queue")}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-sm font-black shadow-md shadow-blue-500/25 hover:shadow-blue-500/35 transition-all cursor-pointer active:scale-95"
          >
            <Users size={17} strokeWidth={2.2} />
            <span>عرض قائمة الإنتظار</span>
          </button>
        </div>
      </div>

      {/* ── 2. Quick Stats Grid (Unified 1-to-1 with Cashier Reports) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full flex-shrink-0">
        {[
          {
            id: "income",
            label: "إجمالي الإيرادات",
            value: Math.round(treasury.totalIncome).toLocaleString("en-US"),
            rawValue: treasury.totalIncome,
            unit: "ر.ي",
            sub: `إجمالي الإيرادات (${treasury.incomeCount || 0}) حركة إيداع`,
            icon: TrendingUp,
            color: "text-emerald-600",
            bg: "bg-emerald-100",
            border: "border-emerald-200",
          },
          {
            id: "expense",
            label: "المصروفات العامة",
            value: Math.round(treasury.totalExpense).toLocaleString("en-US"),
            rawValue: treasury.totalExpense,
            unit: "ر.ي",
            sub: `إجمالي المصروفات (${treasury.expenseCount || 0}) حركة صرف`,
            icon: TrendingDown,
            color: "text-amber-600",
            bg: "bg-amber-100",
            border: "border-amber-200",
          },
          {
            id: "refunds",
            label: "الاستردادات",
            value: Math.round(treasury.totalRefunds).toLocaleString("en-US"),
            rawValue: treasury.totalRefunds,
            unit: "ر.ي",
            sub: `إجمالي المبلغ المسترد (${treasury.refundCount || 0}) حركة استرداد`,
            icon: RotateCcw,
            color: "text-rose-600",
            bg: "bg-rose-100",
            border: "border-rose-200",
          },
          {
            id: "net_balance",
            label: "الرصيد الصافي",
            value: Math.round(treasury.netBalance).toLocaleString("en-US"),
            rawValue: treasury.netBalance,
            unit: "ر.ي",
            sub: `بعد خصم المصروفات والاستردادات (${treasury.allCount || treasury.transactionsCount || 0}) حركة`,
            icon: Wallet,
            color: treasury.netBalance >= 0 ? "text-sky-600" : "text-rose-600",
            bg: treasury.netBalance >= 0 ? "bg-sky-100" : "bg-rose-100",
            border: treasury.netBalance >= 0 ? "border-sky-200" : "border-rose-300",
            valColor: treasury.netBalance >= 0 ? "text-emerald-700" : "text-rose-600",
          },
        ].map((s, i) => (
          <div
            key={i}
            className={`p-4 rounded-2xl border ${s.border} bg-white shadow-sm hover:shadow-md transition-shadow duration-200 relative overflow-hidden flex flex-col justify-between isolate group`}
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
              <span className={`text-xs font-bold ${s.color}`}>
                {s.label}
              </span>
            </div>
            <div>
              {isFiltering ? (
                <div className="h-7 bg-gray-100 rounded-lg animate-pulse w-24"></div>
              ) : (
                <p
                  className={`text-xl font-black ${s.valColor || "text-gray-800"} flex items-baseline justify-end gap-1.5 transition-opacity duration-200 ${
                    isFiltering ? "opacity-50" : "opacity-100"
                  }`}
                  dir="ltr"
                >
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

      {/* ── 3. فلتر الوقت مثل صفحة أرشيف المرضى (خيار الكل قبل مخصص، بلا حقل بحث، وزر إعادة التعيين مع المخصص فقط) ── */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4 w-full">
        <div className="flex items-center justify-center w-full">
          <div className="flex gap-1.5 bg-gray-100/90 p-1.5 rounded-2xl text-xs font-bold text-gray-500 overflow-x-auto">
            {[
              { id: "today", label: "اليوم" },
              { id: "week", label: "هذا الأسبوع" },
              { id: "month", label: "هذا الشهر" },
              { id: "all", label: "الكل" },
              { id: "custom", label: "تاريخ مخصص" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setDateFilter(f.id)}
                className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap text-xs font-bold cursor-pointer ${
                  dateFilter === f.id
                    ? "bg-white text-blue-700 shadow-xs"
                    : "hover:bg-white/40 text-slate-600"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Range Picker (يظهر فقط عند اختيار تاريخ مخصص ومعه زر إعادة التعيين أسفل الفلتر) */}
        {dateFilter === "custom" && (
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-wrap gap-4 items-center animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500">من:</span>
              <input
                type="date"
                value={customRange.start}
                onChange={(e) => setCustomRange((prev) => ({ ...prev, start: e.target.value }))}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none text-gray-700 focus:border-blue-500 transition-colors cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500">إلى:</span>
              <input
                type="date"
                value={customRange.end}
                onChange={(e) => setCustomRange((prev) => ({ ...prev, end: e.target.value }))}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none text-gray-700 focus:border-blue-500 transition-colors cursor-pointer"
              />
            </div>
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-4 py-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-bold mr-auto transition-colors cursor-pointer"
            >
              إعادة تعيين
            </button>
          </div>
        )}
      </div>

      {/* ── 4. التحليل المالي ── */}
      <div className="bg-white rounded-3xl p-5 md:p-6 border border-gray-100 shadow-sm space-y-5 w-full">
        {/* Header: Title & Excel Export Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs shrink-0">
              <Receipt size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-800">
                التحليل المالي
              </h3>
            </div>
          </div>

          {/* Excel Export Button (UI/UX Pro Max Emerald Style) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportFinancialAnalysisToExcel}
              className="px-4 py-2.5 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition-all font-bold rounded-xl text-xs flex items-center gap-2 shadow-xs cursor-pointer active:scale-95"
              title="تصدير جدول التحليل المالي كملف Excel"
            >
              <Download size={15} strokeWidth={2.2} />
              <span>تصدير كـ Excel</span>
            </button>
          </div>
        </div>

        {/* Table: Services, Quantity (العدد), Total Income (رقم يمين وكتابة يسار), Contribution % */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse table-fixed min-w-[720px]">
            <thead className="bg-slate-50/80 text-slate-600 font-black border-b border-slate-200/80">
              <tr>
                <th style={{ width: "22%" }} className="px-4 py-3 text-right">
                  الخدمات / القسم
                </th>
                <th style={{ width: "12%" }} className="px-3 py-3 text-center">
                  العدد
                </th>
                <th style={{ width: "50%" }} className="px-4 py-3 text-right">
                  إجمالي الدخل
                </th>
                <th style={{ width: "16%" }} className="px-4 py-3 text-center">
                  نسبة المساهمة
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {incomeBreakdown.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                  {/* 1. Services / Category (بدون وصف إضافي) */}
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 shadow-2xs">
                        <item.icon size={18} />
                      </div>
                      <span className="font-black text-xs sm:text-sm text-slate-800">
                        {item.name}
                      </span>
                    </div>
                  </td>

                  {/* 2. Quantity (العدد: مطابق لحقل الخدمات والإجراءات في السجل الطبي الشامل) */}
                  <td className="px-3 py-4 text-center">
                    <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-xl text-xs font-black inline-block">
                      {item.countText}
                    </span>
                  </td>

                  {/* 3. Total Income: Number on Right (VIP Style) & Spelled words on Left (Same Row) */}
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-slate-800 inline-flex items-center gap-1" dir="ltr">
                        <span className="text-xs font-bold text-slate-400">ر.ي</span>
                        <span>{Math.round(item.amount).toLocaleString("en-US")}</span>
                      </span>
                      {item.amount > 0 && (
                        <span className="text-xs font-bold text-slate-500 mr-2 pr-2.5 border-r border-slate-200">
                          {item.spelled}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 4. Contribution Percentage Section (خط النسبة متطابق مع إجمالي الدخل) */}
                  <td className="px-4 py-4 text-center">
                    <div className="flex items-center gap-2.5 justify-center">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden min-w-[36px]">
                        <div
                          className="h-full bg-gradient-to-l from-blue-600 to-indigo-600 rounded-full transition-all duration-700"
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                      <span className="text-xs sm:text-sm font-black text-slate-800 shrink-0" dir="ltr">
                        {item.percent.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* ── Table Footer: 4 Financial Summary Rows (الإيرادات، المصروفات، المستردات، الصافي) ── */}
            <tfoot className="border-t-2 border-slate-200/90 divide-y divide-slate-100 bg-white font-black">
              {/* Row 1: إجمالي الإيرادات */}
              <tr className="hover:bg-slate-50/60 transition-colors">
                {/* 1. Services / Category Total Label */}
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 shadow-2xs">
                      <Receipt size={18} />
                    </div>
                    <span className="font-black text-xs sm:text-sm text-slate-800">
                      إجمالي الإيرادات
                    </span>
                  </div>
                </td>

                {/* 2. Total Quantity (فارغ) */}
                <td className="px-3 py-4 text-center"></td>

                {/* 3. Grand Total Income (رقم ومبلغ مفقط بنص عادي مطابق لحقول الأقسام) */}
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black text-slate-800 inline-flex items-center gap-1" dir="ltr">
                      <span className="text-xs font-bold text-slate-400">ر.ي</span>
                      <span>{Math.round(totalDeptSum || totalRevenue).toLocaleString("en-US")}</span>
                    </span>
                    {Boolean(spelledDeptRevenue) && (
                      <span className="text-xs font-bold text-slate-500 mr-2 pr-2.5 border-r border-slate-200">
                        {spelledDeptRevenue}
                      </span>
                    )}
                  </div>
                </td>

                {/* 4. Ratio Cell (تمت إزالة شريط النسبة) */}
                <td className="px-4 py-4 text-center"></td>
              </tr>

              {/* Row 2: إجمالي المصروفات */}
              <tr className="hover:bg-slate-50/60 transition-colors">
                {/* 1. Label */}
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 shadow-2xs">
                      <TrendingDown size={18} />
                    </div>
                    <span className="font-black text-xs sm:text-sm text-slate-800">
                      إجمالي المصروفات
                    </span>
                  </div>
                </td>

                {/* 2. Quantity (فارغ) */}
                <td className="px-3 py-4 text-center"></td>

                {/* 3. Amount & Spelled */}
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black text-slate-800 inline-flex items-center gap-1" dir="ltr">
                      <span className="text-xs font-bold text-slate-400">ر.ي</span>
                      <span>{Math.round(treasury.totalExpense || 0).toLocaleString("en-US")}</span>
                    </span>
                    {Boolean(spelledDeptExpense) && (
                      <span className="text-xs font-bold text-slate-500 mr-2 pr-2.5 border-r border-slate-200">
                        {spelledDeptExpense}
                      </span>
                    )}
                  </div>
                </td>

                {/* 4. Ratio Cell (تمت إزالة شريط النسبة) */}
                <td className="px-4 py-4 text-center"></td>
              </tr>

              {/* Row 3: إجمالي المستردات */}
              <tr className="hover:bg-slate-50/60 transition-colors">
                {/* 1. Label */}
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 shadow-2xs">
                      <RotateCcw size={18} />
                    </div>
                    <span className="font-black text-xs sm:text-sm text-slate-800">
                      إجمالي المستردات
                    </span>
                  </div>
                </td>

                {/* 2. Quantity (فارغ) */}
                <td className="px-3 py-4 text-center"></td>

                {/* 3. Amount & Spelled */}
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black text-slate-800 inline-flex items-center gap-1" dir="ltr">
                      <span className="text-xs font-bold text-slate-400">ر.ي</span>
                      <span>{Math.round(treasury.totalRefunds || 0).toLocaleString("en-US")}</span>
                    </span>
                    {Boolean(spelledDeptRefunds) && (
                      <span className="text-xs font-bold text-slate-500 mr-2 pr-2.5 border-r border-slate-200">
                        {spelledDeptRefunds}
                      </span>
                    )}
                  </div>
                </td>

                {/* 4. Ratio Cell (تمت إزالة شريط النسبة) */}
                <td className="px-4 py-4 text-center"></td>
              </tr>

              {/* Row 4: إجمالي الصافي */}
              <tr className="hover:bg-slate-50/60 transition-colors">
                {/* 1. Label */}
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 shadow-2xs">
                      <Wallet size={18} />
                    </div>
                    <span className="font-black text-xs sm:text-sm text-slate-800">
                      إجمالي الصافي
                    </span>
                  </div>
                </td>

                {/* 2. Quantity (فارغ) */}
                <td className="px-3 py-4 text-center"></td>

                {/* 3. Amount & Spelled */}
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-black inline-flex items-center gap-1 ${grandNetBalance >= 0 ? "text-slate-800" : "text-rose-600"}`} dir="ltr">
                      <span className="text-xs font-bold text-slate-400">ر.ي</span>
                      <span>{Math.round(grandNetBalance).toLocaleString("en-US")}</span>
                    </span>
                    {Boolean(spelledDeptNet) && (
                      <span className="text-xs font-bold text-slate-500 mr-2 pr-2.5 border-r border-slate-200">
                        {spelledDeptNet}
                      </span>
                    )}
                  </div>
                </td>

                {/* 4. Ratio Cell (تمت إزالة شريط النسبة) */}
                <td className="px-4 py-4 text-center"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── 5. TABBED TRANSACTIONS & PAYMENTS SECTION ── */}
      <div className="flex flex-col sm:flex-row items-center justify-center w-full relative pt-4 flex-shrink-0 gap-3">
        
        {/* Main Tab Switches (Matching Analytical Reports Style & Upgraded Counter Typography) */}
        <div className="flex items-center gap-1.5 bg-white p-2 rounded-3xl shadow-xs border border-gray-100 overflow-x-auto no-scrollbar max-w-full">
          <button
            type="button"
            onClick={() => setActiveMainTab("patient_payments")}
            className={`px-5 py-2.5 rounded-2xl text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeMainTab === "patient_payments"
                ? "bg-blue-50 text-blue-700 border border-blue-100 shadow-xs font-black"
                : "text-slate-600 hover:text-slate-900 hover:bg-gray-50 font-bold"
            }`}
          >
            <Wallet size={16} strokeWidth={2.2} />
            <span>مدفوعات المرضى</span>
            <span
              className={`px-2 py-0.5 rounded-xl text-xs font-black transition-colors ${
                activeMainTab === "patient_payments"
                  ? "bg-blue-100/80 text-blue-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {filteredPatientPayments.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab("treasury_ledger")}
            className={`px-5 py-2.5 rounded-2xl text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeMainTab === "treasury_ledger"
                ? "bg-blue-50 text-blue-700 border border-blue-100 shadow-xs font-black"
                : "text-slate-600 hover:text-slate-900 hover:bg-gray-50 font-bold"
            }`}
          >
            <Layers size={16} strokeWidth={2.2} />
            <span>الإيرادات والمصروفات العامة</span>
            <span
              className={`px-2 py-0.5 rounded-xl text-xs font-black transition-colors ${
                activeMainTab === "treasury_ledger"
                  ? "bg-blue-100/80 text-blue-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {filteredGeneralTx.length}
            </span>
          </button>
        </div>

        {/* Excel Export Button (Positioned on the Left) */}
        <div className="sm:absolute sm:left-0 flex items-center">
          <button
            type="button"
            onClick={exportToExcel}
            className="px-4 py-2.5 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors font-bold rounded-xl text-xs flex items-center gap-2 shadow-sm cursor-pointer active:scale-95"
          >
            <Download size={15} />
            <span>تصدير كـ Excel</span>
          </button>
        </div>
      </div>

      {/* ── Main Tabbed Content Container ── */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden w-full">
        
        {/* ── TAB 1: سجل مدفوعات المرضى ── */}
        {activeMainTab === "patient_payments" && (
          <>
            {/* Toolbar */}
            <div className="p-5 border-b border-gray-100 space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                
                {/* Search Bar */}
                <div className="relative w-full md:w-80">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                    <Search size={16} strokeWidth={2.2} />
                  </div>
                  <input
                    type="text"
                    value={patientPaymentsSearch}
                    onChange={(e) => {
                      setPatientPaymentsSearch(e.target.value);
                      setPaymentsCurrentPage(1);
                    }}
                    placeholder="بحث بالاسم أو رقم الزيارة..."
                    className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-blue-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200/60 shadow-xs transition-all"
                  />
                  {patientPaymentsSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setPatientPaymentsSearch("");
                        setPaymentsCurrentPage(1);
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

                {/* Subfilter Tabs */}
                <div className="flex items-center gap-1 bg-gray-100/90 p-1.5 rounded-2xl text-xs font-bold text-gray-500">
                  {[
                    { id: "all", label: "الكل" },
                    { id: "clinic", label: "مرضى العيادة" },
                    { id: "external", label: "مرضى خارجيين" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setPatientTypeFilter(tab.id);
                        setPaymentsCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-bold cursor-pointer ${
                        patientTypeFilter === tab.id
                          ? "bg-white text-blue-700 shadow-xs"
                          : "hover:bg-white/40 text-slate-600"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Counter */}
              <div className="flex justify-between items-center pt-2 border-t border-gray-50 text-xs font-semibold text-gray-500">
                <span>
                  {patientPaymentsSearch
                    ? `${filteredPatientPayments.length} من أصل ${patientPayments.length} زيارة`
                    : `إجمالي الزيارات المسددة: ${filteredPatientPayments.length} زيارة`}
                </span>
              </div>
            </div>

            {/* Table or Empty State */}
            {filteredPatientPayments.length === 0 ? (
              <div className="p-14 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-14 h-14 rounded-3xl bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-300">
                  <Wallet size={28} />
                </div>
                <h3 className="text-sm font-black text-slate-700">لا توجد زيارات مسددة مطابقة</h3>
                <p className="text-xs font-semibold text-slate-400 max-w-sm">
                  لم يتم العثور على زيارات تحتوي على مدفوعات تطابق معيار التصفية أو البحث المحدد.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse table-fixed min-w-[850px]">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-black">
                    <tr>
                      <th style={{ width: "5%" }} className="px-3 py-3.5 text-center font-black text-xs text-slate-500">
                        #
                      </th>
                      <th style={{ width: "27%" }} className="px-4 py-3.5 text-right">
                        المريض
                      </th>
                      <th style={{ width: "11%" }} className="px-3 py-3.5 text-center">
                        رسوم المعاينة
                      </th>
                      <th style={{ width: "11%" }} className="px-3 py-3.5 text-center">
                        المختبر
                      </th>
                      <th style={{ width: "11%" }} className="px-3 py-3.5 text-center">
                        الأشعة
                      </th>
                      <th style={{ width: "11%" }} className="px-3 py-3.5 text-center">
                        الخدمات السريرية
                      </th>
                      <th style={{ width: "11%" }} className="px-3 py-3.5 text-center">
                        العمليات الجراحية
                      </th>
                      <th style={{ width: "13%" }} className="px-4 py-3.5 text-center">
                        إجمالي المدفوع
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {paginatedPatientPayments.map((p, idx) => {
                      const globalIdx = (paymentsCurrentPage - 1) * ITEMS_PER_PAGE + idx + 1;
                      const isExt = Boolean(p.is_external) || String(p.visit_number || "").startsWith("EXT-");
                      const cleanVisitId = String(p.visit_number || p.visit_id || "").replace(/^#+/, "");

                      // Breakdown tooltip text
                      const breakdownParts = [
                        p.consultation_paid > 0 && `رسوم المعاينة: ${Math.round(p.consultation_paid).toLocaleString("en-US")} ر.ي`,
                        p.lab_paid > 0 && `المختبر: ${Math.round(p.lab_paid).toLocaleString("en-US")} ر.ي`,
                        p.radiology_paid > 0 && `الأشعة: ${Math.round(p.radiology_paid).toLocaleString("en-US")} ر.ي`,
                        p.clinical_paid > 0 && `الخدمات السريرية: ${Math.round(p.clinical_paid).toLocaleString("en-US")} ر.ي`,
                        p.surgery_paid > 0 && `العمليات الجراحية: ${Math.round(p.surgery_paid).toLocaleString("en-US")} ر.ي`,
                      ].filter(Boolean).join(" + ") || "إجمالي المدفوع";

                      return (
                        <tr
                          key={`payment_${p.visit_id}_${idx}`}
                          onClick={() => openFinancialRecord(p.patient_id, p.visit_id)}
                          className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                          title="انقر لفتح الأرشيف المالي للخدمات المنفذة للمريض"
                        >
                          {/* 1. # Index (5%) */}
                          <td className="px-3 py-3.5 text-center text-slate-400 font-black text-xs">
                            {globalIdx}
                          </td>

                          {/* 2. Patient (27%) */}
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/80 text-blue-700 border border-blue-200/50 flex items-center justify-center font-black text-xs shrink-0 group-hover:scale-105 transition-transform">
                                {p.patient_name?.charAt(0) || "؟"}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="font-black text-xs sm:text-sm text-slate-800 truncate">
                                    {p.patient_name || "مريض بدون اسم"}
                                  </p>
                                  {isExt && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-teal-100/80 text-teal-800 border border-teal-200/80 select-none shrink-0 shadow-2xs leading-none whitespace-nowrap">
                                      <Sparkles size={11} className="text-teal-600 shrink-0" strokeWidth={2.2} />
                                      <span>مريض خارجي</span>
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] font-bold text-slate-400 mt-0.5" dir="ltr">
                                  {cleanVisitId}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* 3. Consultation Fee (11%) */}
                          <td className="px-3 py-3.5 text-center">
                            {p.consultation_paid > 0 ? (
                              <span className="text-sm font-black text-slate-800 inline-flex items-center gap-1" dir="ltr">
                                <span className="text-xs font-bold text-slate-400">ر.ي</span>
                                <span>{Math.round(p.consultation_paid).toLocaleString("en-US")}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300 font-bold">—</span>
                            )}
                          </td>

                          {/* 4. Lab (11%) */}
                          <td className="px-3 py-3.5 text-center">
                            {p.lab_paid > 0 ? (
                              <span className="text-sm font-black text-slate-800 inline-flex items-center gap-1" dir="ltr">
                                <span className="text-xs font-bold text-slate-400">ر.ي</span>
                                <span>{Math.round(p.lab_paid).toLocaleString("en-US")}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300 font-bold">—</span>
                            )}
                          </td>

                          {/* 5. Radiology (11%) */}
                          <td className="px-3 py-3.5 text-center">
                            {p.radiology_paid > 0 ? (
                              <span className="text-sm font-black text-slate-800 inline-flex items-center gap-1" dir="ltr">
                                <span className="text-xs font-bold text-slate-400">ر.ي</span>
                                <span>{Math.round(p.radiology_paid).toLocaleString("en-US")}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300 font-bold">—</span>
                            )}
                          </td>

                          {/* 6. Clinical (11%) */}
                          <td className="px-3 py-3.5 text-center">
                            {p.clinical_paid > 0 ? (
                              <span className="text-sm font-black text-slate-800 inline-flex items-center gap-1" dir="ltr">
                                <span className="text-xs font-bold text-slate-400">ر.ي</span>
                                <span>{Math.round(p.clinical_paid).toLocaleString("en-US")}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300 font-bold">—</span>
                            )}
                          </td>

                          {/* 7. Surgery (11%) */}
                          <td className="px-3 py-3.5 text-center">
                            {p.surgery_paid > 0 ? (
                              <span className="text-sm font-black text-slate-800 inline-flex items-center gap-1" dir="ltr">
                                <span className="text-xs font-bold text-slate-400">ر.ي</span>
                                <span>{Math.round(p.surgery_paid).toLocaleString("en-US")}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300 font-bold">—</span>
                            )}
                          </td>

                          {/* 8. Total Paid (13%) with Tooltip Breakdown (مطابق لخط وتنسيق باقي حقول المبالغ) */}
                          <td className="px-4 py-3.5 text-center" title={breakdownParts}>
                            <span className="text-sm font-black text-slate-800 inline-flex items-center gap-1" dir="ltr">
                              <span className="text-xs font-bold text-slate-400">ر.ي</span>
                              <span>{Math.round(p.total_paid || 0).toLocaleString("en-US")}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Footer */}
            {paymentsTotalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-gray-100 bg-gray-50/50">
                <span className="text-xs font-bold text-gray-500">
                  إجمالي الزيارات: {filteredPatientPayments.length} زيارة
                </span>
                <div className="flex items-center gap-2" dir="ltr">
                  <button
                    type="button"
                    onClick={() => setPaymentsCurrentPage((pg) => Math.max(1, pg - 1))}
                    disabled={paymentsCurrentPage === 1}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    title="السابق"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-xs font-bold text-gray-700 px-3">
                    صفحة {paymentsCurrentPage} من {paymentsTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPaymentsCurrentPage((pg) => Math.min(paymentsTotalPages, pg + 1))}
                    disabled={paymentsCurrentPage === paymentsTotalPages}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    title="التالي"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── TAB 2: سجل الإيرادات والمصروفات العامة والمستردات ── */}
        {activeMainTab === "treasury_ledger" && (
          <>
            {/* Toolbar */}
            <div className="p-5 border-b border-gray-100 space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                
                {/* Search Bar */}
                <div className="relative w-full md:w-80">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                    <Search size={16} strokeWidth={2.2} />
                  </div>
                  <input
                    type="text"
                    value={txSearch}
                    onChange={(e) => {
                      setTxSearch(e.target.value);
                      setTxCurrentPage(1);
                    }}
                    placeholder="بحث في الملاحظات أو الفئة..."
                    className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-blue-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200/60 shadow-xs transition-all"
                  />
                  {txSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setTxSearch("");
                        setTxCurrentPage(1);
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

                {/* Subfilter Movement Type Tabs */}
                <div className="flex items-center gap-1 bg-gray-100/90 p-1.5 rounded-2xl text-xs font-bold text-gray-500">
                  {[
                    { id: "all", label: "الكل" },
                    { id: "income", label: "الإيرادات" },
                    { id: "expense", label: "المصروفات" },
                    { id: "refunds", label: "الاستردادات" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setTxTypeFilter(tab.id);
                        setTxCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-bold cursor-pointer ${
                        txTypeFilter === tab.id
                          ? "bg-white text-blue-700 shadow-xs"
                          : "hover:bg-white/40 text-slate-600"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Counter */}
              <div className="flex justify-between items-center pt-2 border-t border-gray-50 text-xs font-semibold text-gray-500">
                <span>
                  {txSearch
                    ? `${filteredGeneralTx.length} من أصل ${generalTxRows.length} حركة`
                    : `إجمالي الحركات: ${filteredGeneralTx.length} حركة`}
                </span>
              </div>
            </div>

            {/* Table or Empty State */}
            {generalTxLoading ? (
              <div className="p-14 flex justify-center items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : filteredGeneralTx.length === 0 ? (
              <div className="p-14 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-14 h-14 rounded-3xl bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-300">
                  <Layers size={28} />
                </div>
                <h3 className="text-sm font-black text-slate-700">لا توجد حركات مطابقة</h3>
                <p className="text-xs font-semibold text-slate-400 max-w-sm">
                  لم يتم العثور على حركات خزانة تطابق معيار التصفية أو البحث المحدد.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse table-fixed min-w-[850px]">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-black">
                    <tr>
                      <th style={{ width: "5%" }} className="px-3 py-3.5 text-center font-black text-xs text-slate-500">
                        #
                      </th>
                      <th style={{ width: "13%" }} className="px-3 py-3.5 text-center">
                        نوع الحركة
                      </th>
                      <th style={{ width: "18%" }} className="px-4 py-3.5 text-right">
                        الفئة التصنيفية
                      </th>
                      <th style={{ width: "35%" }} className="px-4 py-3.5 text-right">
                        الملاحظات التوضيحية
                      </th>
                      <th style={{ width: "14%" }} className="px-4 py-3.5 text-center">
                        المبلغ المالي
                      </th>
                      <th style={{ width: "15%" }} className="px-3 py-3.5 text-center">
                        التاريخ والوقت
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {paginatedGeneralTx.map((r, idx) => {
                      const globalIdx = (txCurrentPage - 1) * ITEMS_PER_PAGE + idx + 1;
                      const isRefund = Number(r.is_refund) === 1 || r.category === "refund";
                      const isIncome = r.type === "income" && !isRefund;
                      const amt = parseFloat(r.amount || 0);
                      const refundInfo = isRefund ? parseRefundDetails(r) : null;
                      const serviceInfo = !isRefund ? parseServiceOrSurgery(r) : null;
                      const isExternalService = r.category === "external_lab" || r.category === "external_radiology" || r.category === "external_service";
                      const externalServiceName = r.service_name || serviceInfo?.serviceName || serviceInfo?.name;

                      return (
                        <tr
                          key={r.id || idx}
                          onClick={() => setSelectedTxForDetails(r)}
                          className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                          title="انقر لعرض تفاصيل الحركة"
                        >
                          {/* 1. # Index (5%) */}
                          <td className="px-3 py-3.5 text-center text-slate-400 font-black text-xs">
                            {globalIdx}
                          </td>

                          {/* 2. Movement Type (13%) */}
                          <td className="px-3 py-3.5 text-center">
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

                          {/* 3. Category (18%) */}
                          <td className="px-4 py-3.5 text-right">
                            <span className="font-bold text-slate-800 text-xs truncate block" title={getTransactionCategoryLabel(r)}>
                              {getTransactionCategoryLabel(r)}
                            </span>
                          </td>

                          {/* 4. Explanatory Notes (35%) - No patient name or visit number per directive */}
                          <td className="px-4 py-3.5 text-right">
                            {isRefund && refundInfo ? (
                              <div className="flex flex-col gap-1 min-w-0 text-right">
                                {refundInfo.service && (
                                  <div className="leading-snug">
                                    <span className="text-[11px] font-black text-indigo-600 ml-1">الخدمة:</span>
                                    <span className="font-bold text-slate-800 text-xs">{refundInfo.service}</span>
                                  </div>
                                )}
                                {refundInfo.reason && (
                                  <div className="leading-snug">
                                    <span className="text-[11px] font-black text-rose-600 ml-1">السبب:</span>
                                    <span className="font-semibold text-slate-700 text-xs">{refundInfo.reason}</span>
                                  </div>
                                )}
                                {!refundInfo.service && !refundInfo.reason && (
                                  <span className="text-xs text-slate-700 font-semibold truncate block">
                                    {cleanDescription(r.description) || r.notes || "—"}
                                  </span>
                                )}
                              </div>
                            ) : isExternalService ? (
                              <div className="text-xs font-bold text-slate-800 truncate" title={externalServiceName || cleanDescription(r.description) || r.notes || "—"}>
                                <span>{externalServiceName || cleanDescription(r.description) || r.notes || "—"}</span>
                              </div>
                            ) : (
                              <div className="text-xs font-semibold text-slate-700 truncate" title={cleanDescription(r.description) || r.notes || serviceInfo?.serviceName || "—"}>
                                {cleanDescription(r.description) || r.notes || serviceInfo?.serviceName || "—"}
                              </div>
                            )}
                          </td>

                          {/* 5. Amount (14%) */}
                          <td className="px-4 py-3.5 text-center">
                            <span
                              className={`text-sm font-black inline-flex items-center gap-1 ${
                                isRefund
                                  ? "text-rose-600"
                                  : isIncome
                                  ? "text-emerald-700"
                                  : "text-amber-700"
                              }`}
                              dir="ltr"
                            >
                              <span className="text-xs font-bold text-slate-400">ر.ي</span>
                              <span>{Math.round(amt).toLocaleString("en-US")}</span>
                            </span>
                          </td>

                          {/* 6. Date & Time (15%) */}
                          <td className="px-3 py-3.5 text-center">
                            <div className="flex flex-col items-center justify-center gap-0.5" dir="ltr">
                              <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
                                {formatDateTimeParts(r.created_at).date}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">
                                {formatDateTimeParts(r.created_at).time}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Footer */}
            {txTotalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-gray-100 bg-gray-50/50">
                <span className="text-xs font-bold text-gray-500">
                  إجمالي الحركات: {filteredGeneralTx.length} حركة
                </span>
                <div className="flex items-center gap-2" dir="ltr">
                  <button
                    type="button"
                    onClick={() => setTxCurrentPage((pg) => Math.max(1, pg - 1))}
                    disabled={txCurrentPage === 1}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    title="السابق"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-xs font-bold text-gray-700 px-3">
                    صفحة {txCurrentPage} من {txTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTxCurrentPage((pg) => Math.min(txTotalPages, pg + 1))}
                    disabled={txCurrentPage === txTotalPages}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    title="التالي"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modals: FinancialRecordModal (ReadOnly Archive), PatientEMRModal (Clinical EMR Archive) & TransactionDetailsModal ── */}
      {selectedFinancialPatientId && (
        <FinancialRecordModal
          recordData={financialRecordData}
          recordLoading={financialRecordLoading}
          onClose={() => {
            setSelectedFinancialPatientId(null);
            setFinancialRecordData(null);
          }}
          token={token}
          initialVisitId={selectedInitialVisitId}
          readOnly={true}
          hideInvoicePrint={true}
          onOpenClinicalArchive={handleOpenClinicalArchive}
        />
      )}

      {selectedClinicalPatient && (
        <PatientEMRModal
          isOpen={!!selectedClinicalPatient}
          onClose={() => setSelectedClinicalPatient(null)}
          patient={selectedClinicalPatient}
          visit={selectedClinicalVisit || selectedClinicalPatient}
          readOnly={true}
          isArchiveScreen={true}
          historyLoading={clinicalHistoryLoading}
          patientHistory={clinicalPatientHistory}
          selectedVisit={selectedClinicalVisit}
          onSelectVisit={handleSelectClinicalVisit}
          prescriptionItems={clinicalPrescriptionItems}
          loadingPrescription={clinicalLoadingPrescription}
        />
      )}

      {selectedTxForDetails && (
        <TransactionDetailsModal
          transaction={selectedTxForDetails}
          onClose={() => setSelectedTxForDetails(null)}
          onOpenPatientRecord={(patientId) => {
            const pid = typeof patientId === "object" ? (patientId?.id || patientId?.patient_id) : (patientId || selectedTxForDetails?.patient_id);
            setSelectedTxForDetails(null);
            if (pid) {
              openFinancialRecord(pid, selectedTxForDetails?.visit_id);
            }
          }}
        />
      )}
    </div>
  );
}
