import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, Search, Calendar, Info, Heart, ShieldAlert, 
  FlaskConical, Radiation, Wallet, Scissors, X
} from 'lucide-react';
import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';

const PatientsReport = () => {
  const { token } = useAuthStore();
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldown, setDrilldown] = useState(null);

  const fetchVisits = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/reports/patients-visits';
      const params = [];
      if (startDate && endDate) params.push(`startDate=${startDate}&endDate=${endDate}`);
      if (search) params.push(`search=${encodeURIComponent(search)}`);
      
      if (params.length > 0) {
        url += `?${params.join('&')}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setVisits(data);
    } catch {
      toast.error('فشل تحميل تقرير المرضى والزيارات');
    } finally {
      setLoading(false);
    }
  }, [token, search, startDate, endDate]);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  const viewVisitDetails = async (v) => {
    setSelectedVisit(v);
    setDrilldownLoading(true);
    setDrilldown(null);
    try {
      const res = await fetch(`/api/reports/patients-visits/${v.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setDrilldown(data);
    } catch {
      toast.error('فشل تحميل الملف التفصيلي للزيارة');
    } finally {
      setDrilldownLoading(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users className="text-slate-900" size={28} /> تقرير سجل الزيارات والمرضى
        </h1>
        <p className="text-gray-500 mt-1">عرض تفصيلي لكل مريض وكل زيارة طبية مع كافة الفحوصات والمدفوعات المرتبطة</p>
      </div>

      {/* Filter Row */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative w-full">
            <Search className="absolute right-3 top-3 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="البحث باسم المريض، رقم الزيارة، أو الهاتف..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="input-base pr-10 text-sm w-full"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Calendar size={18} className="text-gray-400" />
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-base text-sm" />
          <span className="text-gray-400">إلى</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-base text-sm" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-6 py-3.5 font-bold">تاريخ الزيارة</th>
                <th className="px-6 py-3.5 font-bold">رقم الزيارة</th>
                <th className="px-6 py-3.5 font-bold">اسم المريض</th>
                <th className="px-6 py-3.5 font-bold">العمر/الجنس</th>
                <th className="px-6 py-3.5 font-bold">الجهة</th>
                <th className="px-6 py-3.5 font-bold">الحالة</th>
                <th className="px-6 py-3.5 font-bold">الدكتور</th>
                <th className="px-6 py-3.5 font-bold">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="8" className="px-6 py-8 text-center text-gray-400 animate-pulse">جاري تحميل السجلات...</td></tr>
              ) : visits.length === 0 ? (
                <tr><td colSpan="8" className="px-6 py-8 text-center text-gray-400">لا توجد زيارات مطابقة</td></tr>
              ) : (
                visits.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 text-gray-500">{new Date(v.created_at).toLocaleDateString('ar-EG')}</td>
                    <td className="px-6 py-4 font-bold text-gray-800">{v.visit_number}</td>
                    <td className="px-6 py-4 font-bold text-gray-900">{v.full_name}</td>
                    <td className="px-6 py-4 text-slate-600">{v.age} سنة / {v.gender === 'male' ? 'ذكر' : 'أنثى'}</td>
                    <td className="px-6 py-4 font-bold text-blue-700">{v.entity === 'clinic' ? 'العيادة' : 'المركز'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-lg ${
                        v.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                        v.status === 'pending_payment' ? 'bg-amber-50 text-amber-700' :
                        v.status === 'cancelled' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {v.status === 'completed' ? 'مكتمل' :
                         v.status === 'pending_payment' ? 'انتظار الدفع' :
                         v.status === 'cancelled' ? 'ملغي' : v.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700 font-bold">{v.doctor_name || '-'}</td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => viewVisitDetails(v)}
                        className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-all"
                      >
                        <Info size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drill-down Medical Profile Modal */}
      <AnimatePresence>
        {selectedVisit && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-900 text-white">
                <div>
                  <h3 className="font-bold text-lg">ملف تفاصيل المريض والزيارة</h3>
                  <p className="text-xs text-slate-300 mt-1">رقم الزيارة: {selectedVisit.visit_number} · اسم المريض: {selectedVisit.full_name}</p>
                </div>
                <button onClick={() => setSelectedVisit(null)} className="p-1 rounded-lg hover:bg-white/10 text-white/80">
                  <X size={20} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-right" dir="rtl">
                {drilldownLoading ? (
                  <div className="h-40 bg-gray-50 rounded-xl animate-pulse flex items-center justify-center text-gray-400 font-bold">جاري تحميل ملف المريض...</div>
                ) : (
                  <>
                    {/* Patient Core Profile */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="flex items-start gap-2.5">
                        <Heart className="text-red-500 mt-1 flex-shrink-0" size={18} />
                        <div>
                          <p className="text-xs text-gray-400 font-bold">الأمراض المزمنة</p>
                          <p className="text-sm font-bold text-slate-800 mt-1">{drilldown?.visit?.chronic_diseases || 'لا توجد'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <ShieldAlert className="text-amber-500 mt-1 flex-shrink-0" size={18} />
                        <div>
                          <p className="text-xs text-gray-400 font-bold">الحساسيات</p>
                          <p className="text-sm font-bold text-slate-800 mt-1">{drilldown?.visit?.allergies || 'لا توجد'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <Info className="text-blue-500 mt-1 flex-shrink-0" size={18} />
                        <div>
                          <p className="text-xs text-gray-400 font-bold">الأدوية الحالية</p>
                          <p className="text-sm font-bold text-slate-800 mt-1">{drilldown?.visit?.current_medications || 'لا توجد'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Labs and Radiologies ordered */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Labs */}
                      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                        <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-1.5 border-b border-gray-50 pb-2">
                          <FlaskConical size={16} className="text-purple-600" /> التحاليل الطبية بالزيارة
                        </h4>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400 border-b border-gray-50 text-right">
                              <th className="py-2 font-bold">التحليل</th>
                              <th className="py-2 font-bold">السعر</th>
                              <th className="py-2 font-bold">النتيجة</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {drilldown?.labs?.length === 0 ? (
                              <tr><td colSpan="3" className="py-3 text-center text-gray-400">لا توجد تحاليل مطلوبة</td></tr>
                            ) : (
                              drilldown?.labs?.map(lab => (
                                <tr key={lab.id}>
                                  <td className="py-2.5 font-bold text-gray-800">{lab.test_name}</td>
                                  <td className="py-2.5 font-bold text-emerald-600">{parseFloat(lab.price).toLocaleString()} YER</td>
                                  <td className="py-2.5">
                                    <span className={`px-2 py-0.5 rounded-lg font-bold ${
                                      lab.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                                    }`}>
                                      {lab.status === 'completed' ? 'جاهزة' : 'قيد الانتظار'}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Radiology */}
                      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                        <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-1.5 border-b border-gray-50 pb-2">
                          <Radiation size={16} className="text-blue-600" /> الفحوصات والأشعة بالزيارة
                        </h4>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400 border-b border-gray-50 text-right">
                              <th className="py-2 font-bold">الأشعة</th>
                              <th className="py-2 font-bold">النوع</th>
                              <th className="py-2 font-bold">السعر</th>
                              <th className="py-2 font-bold">النتيجة</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {drilldown?.radiologies?.length === 0 ? (
                              <tr><td colSpan="4" className="py-3 text-center text-gray-400">لا توجد أشعة مطلوبة</td></tr>
                            ) : (
                              drilldown?.radiologies?.map(rad => (
                                <tr key={rad.id}>
                                  <td className="py-2.5 font-bold text-gray-800">{rad.test_name}</td>
                                  <td className="py-2.5 text-gray-500">{rad.with_film ? 'مع فيلم' : 'بدون فيلم'}</td>
                                  <td className="py-2.5 font-bold text-emerald-600">{parseFloat(rad.price).toLocaleString()} YER</td>
                                  <td className="py-2.5">
                                    <span className={`px-2 py-0.5 rounded-lg font-bold ${
                                      rad.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                                    }`}>
                                      {rad.status === 'completed' ? 'جاهزة' : 'قيد الانتظار'}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                    </div>

                    {/* Financial Transactions */}
                    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                      <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-1.5 border-b border-gray-50 pb-2">
                        <Wallet size={16} className="text-emerald-600" /> إيصالات الدفع والتحصيلات المالية بالزيارة
                      </h4>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400 border-b border-gray-50 text-right">
                            <th className="py-2 font-bold">البيان</th>
                            <th className="py-2 font-bold">المبلغ</th>
                            <th className="py-2 font-bold">نوع العملية</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {drilldown?.payments?.length === 0 ? (
                            <tr><td colSpan="3" className="py-3 text-center text-gray-400">لا توجد مدفوعات مسجلة لهذه الزيارة</td></tr>
                          ) : (
                            drilldown?.payments?.map(pay => (
                              <tr key={pay.id}>
                                <td className="py-2.5 text-gray-800 font-bold">{pay.description}</td>
                                <td className="py-2.5 font-black text-emerald-600">+{parseFloat(pay.amount).toLocaleString()} {pay.currency}</td>
                                <td className="py-2.5">
                                  <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-lg bg-emerald-50 text-emerald-700">تحصيل</span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Linked Surgery (if any) */}
                    {drilldown?.surgeries?.length > 0 && (
                      <div className="bg-purple-50 rounded-xl border border-purple-100 p-4">
                        <h4 className="font-bold text-purple-900 text-sm mb-2 flex items-center gap-1.5">
                          <Scissors size={16} /> هذه الزيارة مرتبطة بعملية جراحية مجدولة
                        </h4>
                        <div className="text-xs text-purple-800 space-y-1">
                          <p><strong>نوع العملية:</strong> {drilldown.surgeries[0].surgery_type}</p>
                          <p><strong>سعر العملية الكلي:</strong> {parseFloat(drilldown.surgeries[0].full_price).toLocaleString()} {drilldown.surgeries[0].currency}</p>
                          <p><strong>الحالة:</strong> {drilldown.surgeries[0].status === 'completed' ? 'مكتملة' : 'قيد التحضير/الجدولة'}</p>
                        </div>
                      </div>
                    )}

                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PatientsReport;
