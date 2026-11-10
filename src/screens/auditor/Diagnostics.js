import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FlaskConical, Radiation, Calendar, TrendingUp, BarChart2
} from 'lucide-react';
import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';

const DiagnosticsReport = () => {
  const { token } = useAuthStore();
  const [activeTab, setActiveTab] = useState('labs'); // 'labs' | 'rads'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/reports/diagnostics';
      if (startDate && endDate) {
        url += `?startDate=${startDate}&endDate=${endDate}`;
      }
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const resData = await res.json();
      setData(resData);
    } catch {
      toast.error('فشل تحميل تقرير الخدمات التشخيصية');
    } finally {
      setLoading(false);
    }
  }, [token, startDate, endDate]);

  useEffect(() => {
    fetchDiagnostics();
  }, [fetchDiagnostics]);

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FlaskConical className="text-slate-900" size={28} /> تقرير الخدمات التشخيصية
        </h1>
        <p className="text-gray-500 mt-1">تتبع كافة التحاليل المخبرية وصور الأشعة المنفذة مع الرسوم وحجم الطلبات</p>
      </div>

      {/* Date Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-gray-400" />
          <span className="text-sm font-bold text-gray-600">الفترة الزمنية:</span>
        </div>
        <div className="flex items-center gap-3">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-base text-sm" />
          <span className="text-gray-400">إلى</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-base text-sm" />
        </div>
        {(startDate || endDate) && (
          <button onClick={() => { setStartDate(''); setEndDate(''); }} className="text-sm font-bold text-red-500 hover:text-red-700">إعادة تعيين</button>
        )}
      </div>

      {/* Top 10 Analytics Rows */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Top Labs */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold text-slate-800 text-base mb-4 flex items-center gap-2 border-b border-gray-50 pb-2">
            <BarChart2 size={18} className="text-purple-600" /> أكثر 10 تحاليل طلباً
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead>
                <tr className="text-gray-400 border-b border-gray-50">
                  <th className="py-2 font-bold">اسم التحليل</th>
                  <th className="py-2 font-bold">مرات الطلب</th>
                  <th className="py-2 font-bold">إجمالي الإيرادات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan="3" className="py-4 text-center text-gray-400 animate-pulse">جاري التحميل...</td></tr>
                ) : data?.topLabs?.length === 0 ? (
                  <tr><td colSpan="3" className="py-4 text-center text-gray-400">لا توجد بيانات</td></tr>
                ) : (
                  data?.topLabs?.map((lab, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50">
                      <td className="py-2.5 font-bold text-gray-900">{lab.test_name}</td>
                      <td className="py-2.5 text-slate-600 font-bold">{lab.count} مرات</td>
                      <td className="py-2.5 text-emerald-600 font-black">{parseFloat(lab.revenue).toLocaleString()} YER</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Radiologies */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="font-bold text-slate-800 text-base mb-4 flex items-center gap-2 border-b border-gray-50 pb-2">
            <BarChart2 size={18} className="text-blue-600" /> أكثر 10 فحوصات أشعة طلباً
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead>
                <tr className="text-gray-400 border-b border-gray-50">
                  <th className="py-2 font-bold">اسم الأشعة</th>
                  <th className="py-2 font-bold">مرات الطلب</th>
                  <th className="py-2 font-bold">إجمالي الإيرادات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan="3" className="py-4 text-center text-gray-400 animate-pulse">جاري التحميل...</td></tr>
                ) : data?.topRadiologies?.length === 0 ? (
                  <tr><td colSpan="3" className="py-4 text-center text-gray-400">لا توجد بيانات</td></tr>
                ) : (
                  data?.topRadiologies?.map((rad, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50">
                      <td className="py-2.5 font-bold text-gray-900">{rad.test_name}</td>
                      <td className="py-2.5 text-slate-600 font-bold">{rad.count} مرات</td>
                      <td className="py-2.5 text-emerald-600 font-black">{parseFloat(rad.revenue).toLocaleString()} YER</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Main Logs Area */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100 bg-gray-50/50">
          <button
            onClick={() => setActiveTab('labs')}
            className={`px-6 py-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'labs'
                ? 'border-slate-900 text-slate-900 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/50'
            }`}
          >
            <FlaskConical size={16} /> سجل التحاليل الطبية
          </button>
          <button
            onClick={() => setActiveTab('rads')}
            className={`px-6 py-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'rads'
                ? 'border-slate-900 text-slate-900 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/50'
            }`}
          >
            <Radiation size={16} /> سجل فحوصات الأشعة
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="h-40 bg-gray-50 rounded-xl animate-pulse" />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
              >
                {activeTab === 'labs' ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="px-6 py-3.5 font-bold">التاريخ</th>
                          <th className="px-6 py-3.5 font-bold">المريض</th>
                          <th className="px-6 py-3.5 font-bold">اسم التحليل</th>
                          <th className="px-6 py-3.5 font-bold">السعر</th>
                          <th className="px-6 py-3.5 font-bold">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data?.labs?.length === 0 ? (
                          <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-400">لا توجد تحاليل منفذة في الفترة المحددة</td></tr>
                        ) : (
                          data?.labs?.map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-6 py-4 text-gray-500">{new Date(row.date).toLocaleString('ar-EG')}</td>
                              <td className="px-6 py-4 font-bold text-gray-900">{row.patient_name}</td>
                              <td className="px-6 py-4 font-bold text-purple-700">{row.test_name}</td>
                              <td className="px-6 py-4 font-bold text-emerald-600">{parseFloat(row.price).toLocaleString()} YER</td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-0.5 text-xs font-bold rounded-lg ${
                                  row.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {row.status === 'completed' ? 'مكتمل' : 'قيد الانتظار'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="px-6 py-3.5 font-bold">التاريخ</th>
                          <th className="px-6 py-3.5 font-bold">المريض</th>
                          <th className="px-6 py-3.5 font-bold">اسم الأشعة</th>
                          <th className="px-6 py-3.5 font-bold">النوع</th>
                          <th className="px-6 py-3.5 font-bold">السعر</th>
                          <th className="px-6 py-3.5 font-bold">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data?.radiologies?.length === 0 ? (
                          <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-400">لا توجد فحوصات أشعة منفذة في الفترة المحددة</td></tr>
                        ) : (
                          data?.radiologies?.map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-6 py-4 text-gray-500">{new Date(row.date).toLocaleString('ar-EG')}</td>
                              <td className="px-6 py-4 font-bold text-gray-900">{row.patient_name}</td>
                              <td className="px-6 py-4 font-bold text-blue-700">{row.test_name}</td>
                              <td className="px-6 py-4 text-slate-500">{row.with_film ? 'مع فيلم' : 'بدون فيلم'}</td>
                              <td className="px-6 py-4 font-bold text-emerald-600">{parseFloat(row.price).toLocaleString()} YER</td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-0.5 text-xs font-bold rounded-lg ${
                                  row.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {row.status === 'completed' ? 'مكتمل' : 'قيد الانتظار'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

    </div>
  );
};

export default DiagnosticsReport;
