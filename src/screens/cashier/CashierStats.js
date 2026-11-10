import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, Wallet, TrendingDown, RotateCcw,
  BarChart2, RefreshCcw, Calendar, Users,
  ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, Tooltip,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend
} from 'recharts';
import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';

// ── KPI Card ──────────────────────────────────────────────────────
const KpiCard = ({ icon: Icon, label, value, sub, color, trend }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 relative overflow-hidden group hover:shadow-md transition-shadow"
  >
    {/* Decorative background element */}
    <div className="absolute -left-6 -top-6 text-gray-50/50 -z-10 group-hover:scale-110 transition-transform duration-500 rotate-[-15deg]">
      <Icon size={120} />
    </div>
    
    <div className="flex items-start justify-between mb-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner ${color}`}>
        <Icon size={24} className="text-white" />
      </div>
      {trend !== undefined && (
        <span className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${
          trend >= 0 ? 'bg-sky-50 text-sky-700 border-sky-100' : 'bg-red-50 text-red-600 border-red-100'
        }`}>
          {trend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {Math.abs(trend)}%
        </span>
      )}
    </div>
    <p className="text-3xl font-black text-slate-800 tracking-tight">{value} <span className="text-sm font-bold text-gray-400 tracking-normal">YER</span></p>
    <p className="text-sm font-bold text-gray-500 mt-2">{label}</p>
    {sub && <p className="text-xs text-gray-400 mt-1 bg-gray-50/80 inline-block px-2 py-0.5 rounded-lg border border-gray-100">{sub}</p>}
  </motion.div>
);

// ── Category Label Map ────────────────────────────────────────────
const CAT_LABELS = {
  entry_fee: 'رسوم المعاينة',
  lab: 'تحاليل',
  radiology: 'أشعة',
  surgery_payment: 'عمليات',
  other: 'أخرى',
};

const PIE_COLORS = ['#2563EB', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444'];

const PERIODS = [
  { key: 'today', label: 'اليوم' },
  { key: 'week',  label: 'أسبوع' },
  { key: 'month', label: 'شهر' },
  { key: 'year',  label: 'سنة' },
];

const CashierStats = () => {
  const { token } = useAuthStore();
  const { latestSilentUpdate } = useSocketStore();
  const [summary, setSummary]       = useState(null);
  const [detail, setDetail]         = useState(null);
  const [period, setPeriod]         = useState('today');
  const [loading, setLoading]       = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/cashier/stats/summary', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSummary(data);
    } catch { toast.error('فشل تحميل الإحصائيات'); }
    finally { setLoading(false); }
  }, [token]);

  const fetchDetail = useCallback(async () => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/cashier/stats/transactions?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setDetail(data);
    } catch { toast.error('فشل تحميل التفاصيل'); }
    finally { setLoadingDetail(false); }
  }, [token, period]);

  useEffect(() => { 
    fetchSummary(); 
    fetchDetail();
    
  }, [fetchSummary, fetchDetail, token]);

  // Format chart date
  const formatDay = (d) => d ? new Date(d).toLocaleDateString('ar', { month: 'short', day: 'numeric' }) : '';

  const kpis = summary ? [
    {
      icon: Wallet, label: 'إجمالي الصندوق (كل الوقت)',
      value: parseFloat(summary.totalBox || 0).toLocaleString('ar'),
      color: 'bg-gradient-to-br from-blue-500 to-blue-700', sub: `اليوم: +${parseFloat(summary.todayIncome || 0).toLocaleString('ar')} YER`
    },
    {
      icon: TrendingUp, label: 'الرصيد المتاح',
      value: parseFloat(summary.availableCash || 0).toLocaleString('ar'),
      color: 'bg-gradient-to-br from-emerald-500 to-emerald-700',
    },
    {
      icon: TrendingDown, label: 'إجمالي المصروفات',
      value: parseFloat(summary.totalExpenses || 0).toLocaleString('ar'),
      color: 'bg-gradient-to-br from-amber-400 to-amber-600',
    },
    {
      icon: RotateCcw, label: 'المبالغ المستردة',
      value: parseFloat(summary.totalRefunds || 0).toLocaleString('ar'),
      color: 'bg-gradient-to-br from-red-500 to-red-700',
    },
  ] : [];

  const TRANS_TYPE = {
    income:  { label: 'دخل',    badge: 'bg-sky-100 text-sky-700', arrow: '↑' },
    expense: { label: 'مصروف', badge: 'bg-red-100 text-red-700',         arrow: '↓' },
  };

  useEffect(() => {
    if (latestSilentUpdate?.type === "cashier") {
      if (typeof fetchData === "function") fetchData();
      if (typeof fetchSummary === "function") fetchSummary();
      if (typeof fetchDetail === "function") fetchDetail();
      if (typeof fetchPatients === "function") fetchPatients();
      if (typeof fetchReports === "function") fetchReports();
      if (typeof fetchSurgeries === "function") fetchSurgeries();
    }
  }, [latestSilentUpdate]);

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Wallet className="text-blue-600" size={28} /> إحصائيات المحاسب
          </h1>
          <p className="text-sm font-bold text-gray-500 mt-1">{summary ? `${summary.todayVisits} زيارة مسجلة اليوم` : '...'}</p>
        </div>
        <button onClick={() => { fetchSummary(); fetchDetail(); }}
          disabled={loading}
          className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} /> تحديث
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {loading
          ? [1,2,3,4].map(i => <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />)
          : kpis.map((k, i) => (
            <motion.div key={k.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <KpiCard {...k} />
            </motion.div>
          ))
        }
      </div>

      {/* Period Filter */}
      <div className="flex gap-2 mb-5">
        <span className="flex items-center gap-1.5 text-sm text-gray-500 font-semibold ml-1">
          <Calendar size={15} /> الفترة:
        </span>
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              period === p.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        {/* Area Chart */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="font-bold text-gray-800 mb-4 text-sm">الإيرادات والمصروفات</p>
          {loadingDetail ? (
            <div className="h-48 bg-gray-50 rounded-xl animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={detail?.chartData || []}>
                <defs>
                  <linearGradient id="income" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#2563EB" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#EF4444" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v, n) => [`${v} YER`, n === 'income' ? 'إيرادات' : 'مصروفات']}
                  labelFormatter={formatDay}
                />
                <Area type="monotone" dataKey="income"  stroke="#2563EB" strokeWidth={2} fill="url(#income)" />
                <Area type="monotone" dataKey="expense" stroke="#EF4444" strokeWidth={2} fill="url(#expense)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie Chart */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="font-bold text-gray-800 mb-4 text-sm">توزيع الإيرادات</p>
          {loadingDetail ? (
            <div className="h-48 bg-gray-50 rounded-xl animate-pulse" />
          ) : detail?.breakdown?.length ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={detail.breakdown} dataKey="total" nameKey="category" cx="50%" cy="50%"
                    outerRadius={65} innerRadius={35} paddingAngle={3}>
                    {detail.breakdown.map((entry, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, n) => [`${v} YER`, CAT_LABELS[n] || n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {detail.breakdown.map((item, i) => (
                  <div key={item.category} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      {CAT_LABELS[item.category] || item.category}
                    </span>
                    <span className="font-bold text-gray-800">{item.total} YER</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">لا توجد بيانات</div>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="font-bold text-gray-800 text-sm">سجل الحركات المالية</p>
          <span className="text-xs text-gray-400">{detail?.transactions?.length || 0} حركة</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['التاريخ', 'النوع', 'الفئة', 'المريض', 'المبلغ', 'المحاسب'].map(h => (
                  <th key={h} className="text-right px-4 py-3 text-xs font-bold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingDetail ? (
                [1,2,3,4].map(i => (
                  <tr key={i} className="border-b border-gray-50">
                    {[1,2,3,4,5,6].map(j => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : (detail?.transactions || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-gray-400 text-sm">لا توجد حركات في هذه الفترة</td>
                </tr>
              ) : (detail?.transactions || []).map((t, i) => {
                const cfg = TRANS_TYPE[t.type] || TRANS_TYPE.income;
                return (
                  <tr key={t.id || i} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(t.created_at).toLocaleDateString('ar', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                        {cfg.arrow} {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{CAT_LABELS[t.category] || t.category}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-800">{t.patient_name || '—'}</td>
                    <td className={`px-4 py-3 font-bold text-sm ${
                      t.type === 'income' ? 'text-sky-700' : 'text-red-600'
                    }`}>
                      {t.type === 'income' ? '+' : '-'}{parseFloat(t.amount).toLocaleString('ar')} YER
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{t.cashier_name || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CashierStats;



