import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Users, Scissors, DollarSign, Activity, TrendingUp, 
  ArrowUpRight, ArrowDownRight, Clock, Award
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const CUSTOM_TOOLTIP = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-3 text-sm" dir="rtl">
      <p className="font-bold text-gray-700 mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {parseFloat(p.value).toLocaleString('ar-EG')}
        </p>
      ))}
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, sub, color, onClick }) => (
  <motion.div 
    whileHover={{ y: -5, scale: 1.02 }} 
    onClick={onClick}
    className="relative overflow-hidden bg-white/80 backdrop-blur-xl border border-white/40 p-6 rounded-3xl shadow-xl shadow-slate-200/40 cursor-pointer transition-all group"
  >
    <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full ${color} opacity-10 blur-2xl group-hover:opacity-20 transition-opacity`} />
    <div className={`absolute -left-6 -bottom-6 w-24 h-24 rounded-full ${color} opacity-10 blur-2xl group-hover:opacity-20 transition-opacity`} />
    
    <div className="flex items-center justify-between relative z-10">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${color} text-white shadow-lg`}>
        <Icon size={24} />
      </div>
      <span className="text-gray-300 group-hover:text-gray-600 transition-colors bg-white/50 p-2 rounded-xl backdrop-blur-md">
        <ArrowUpRight size={20} />
      </span>
    </div>
    <div className="relative z-10 mt-5">
      <p className="text-3xl font-black text-slate-800 tracking-tight">{value}</p>
      <p className="text-sm font-bold text-slate-500 mt-2">{label}</p>
      {sub && <p className="text-xs font-semibold text-slate-400 mt-1">{sub}</p>}
    </div>
  </motion.div>
);

const Dashboard = () => {
  const { token } = useAuthStore();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reports/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(resData => {
        setData(resData);
      })
      .catch(() => toast.error('فشل تحميل لوحة البيانات'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <div className="grid grid-cols-4 gap-6 p-6"><div className="h-40 bg-white rounded-2xl animate-pulse col-span-4" /></div>;
  }

  // Calculate currency total revenues
  const revYER = data?.kpis?.revenue?.find(r => r.currency === 'YER')?.total || 0;

  // Chart Data preparation
  const chartData = [
    { name: 'المبالغ المالية (YER)', إيرادات: revYER, مصروفات: data?.kpis?.expenses?.find(e => e.currency === 'YER')?.total || 0 }
  ];

  return (
    <div dir="rtl" className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Award className="text-slate-900" size={32} /> لوحة التحكم التنفيذية
        </h1>
        <p className="text-gray-500 mt-1.5">نظرة عامة ورقابة شاملة على كافة عمليات العيادة والمركز والمخازن</p>
      </div>

      {/* Top Cards KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          icon={Users} 
          label="إجمالي المرضى" 
          value={data?.kpis?.totalPatients || 0} 
          sub="كافة الحالات المسجلة بالمنظومة" 
          color="bg-slate-900" 
          onClick={() => navigate('/auditor/patients')} 
        />
        <StatCard 
          icon={Scissors} 
          label="إجمالي العمليات الجراحية" 
          value={data?.kpis?.totalSurgeries || 0} 
          sub="بين مخططة، ومجدولة، ومنفذة" 
          color="bg-purple-600" 
          onClick={() => navigate('/auditor/surgery')} 
        />
        <StatCard 
          icon={DollarSign} 
          label="إيرادات الصندوق" 
          value={`${parseFloat(revYER).toLocaleString()} YER`}
          sub="إجمالي الإيرادات بالريال اليمني" 
          color="bg-emerald-600" 
          onClick={() => navigate('/auditor/financial')} 
        />
        <StatCard 
          icon={TrendingUp} 
          label="قيمة أصول المخازن" 
          value={`${parseFloat(data?.kpis?.inventoryValue || 0).toLocaleString()} YER`} 
          sub="القيمة المالية للمخزون العام والعمليات" 
          color="bg-blue-600" 
          onClick={() => navigate('/auditor/inventory')} 
        />
      </div>

      {/* Chart Rows */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-800 text-lg">مقارنة الإيرادات والمصروفات بالريال اليمني</h3>
            <div className="flex gap-4 text-xs font-semibold">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-600" />إيرادات</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500" />مصروفات</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} barSize={40}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6B7280', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CUSTOM_TOOLTIP />} />
              <Bar dataKey="إيرادات" name="الإيرادات" fill="#10B981" radius={[6, 6, 0, 0]} />
              <Bar dataKey="مصروفات" name="المصروفات" fill="#EF4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Diagnostic Distribution */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-gray-800 text-lg mb-6">توزيع الحالات المالية</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 font-bold">رسوم كشفية (YER)</span>
                <span className="font-bold text-slate-800">نشط</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 font-bold">العمليات الجراحية</span>
                <span className="font-bold text-purple-600">نشط</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 font-bold">الخدمات المخبرية والأشعة</span>
                <span className="font-bold text-emerald-600">نشط</span>
              </div>
            </div>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mt-6">
            <p className="text-xs text-slate-500 font-bold mb-1">الربط اللحظي</p>
            <p className="text-sm font-semibold text-slate-700">النظام مربوط بالـ Sockets ويقوم بتحديث البيانات لحظياً دون الحاجة لتحديث الصفحة.</p>
          </div>
        </div>

      </div>

      {/* Recent Activity Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Recent Payments */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-800 text-lg mb-4 flex items-center gap-2">
            <Clock size={20} className="text-emerald-600" /> آخر 10 معاملات مالية بالصندوق
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="text-gray-400 border-b border-gray-50">
                  <th className="py-2.5 font-bold">المريض</th>
                  <th className="py-2.5 font-bold">القسم</th>
                  <th className="py-2.5 font-bold">المبلغ</th>
                  <th className="py-2.5 font-bold">النوع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data?.recent?.payments?.map(pay => (
                  <tr key={pay.id} className="hover:bg-gray-50/50">
                    <td className="py-3 font-bold text-gray-900">{pay.full_name || 'عام'}</td>
                    <td className="py-3 text-gray-500">
                      {pay.category === 'entry_fee' ? 'رسوم زيارة' :
                       pay.category === 'lab' ? 'تحليل' :
                       pay.category === 'radiology' ? 'أشعة' :
                       pay.category === 'surgery_payment' ? 'دفعة عملية' : 'عام'}
                    </td>
                    <td className={`py-3 font-bold ${pay.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {pay.type === 'income' ? '+' : '-'}{parseFloat(pay.amount).toLocaleString()} YER
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-lg ${
                        pay.type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {pay.type === 'income' ? 'قبض' : 'صرف'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Surgeries */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-800 text-lg mb-4 flex items-center gap-2">
            <Activity size={20} className="text-purple-600" /> آخر 5 عمليات جراحية مسجلة
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="text-gray-400 border-b border-gray-50">
                  <th className="py-2.5 font-bold">المريض</th>
                  <th className="py-2.5 font-bold">العملية</th>
                  <th className="py-2.5 font-bold">السعر الكلي</th>
                  <th className="py-2.5 font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data?.recent?.surgeries?.map(surg => (
                  <tr key={surg.id} className="hover:bg-gray-50/50">
                    <td className="py-3 font-bold text-gray-900">{surg.full_name}</td>
                    <td className="py-3 text-gray-500">{surg.surgery_type}</td>
                    <td className="py-3 font-bold text-purple-700">{parseFloat(surg.full_price).toLocaleString()} YER</td>
                    <td className="py-3">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${
                        surg.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                        surg.status === 'ready' ? 'bg-blue-50 text-blue-700' :
                        surg.status === 'scheduled' ? 'bg-amber-50 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {surg.status === 'completed' ? 'مكتملة' :
                         surg.status === 'ready' ? 'جاهزة' :
                         surg.status === 'scheduled' ? 'مجدولة' : 'تحت التحضير'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
