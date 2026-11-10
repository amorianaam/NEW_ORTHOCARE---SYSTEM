import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Scissors, Calendar, Search, ClipboardList, Info, 
  DollarSign, Package, TrendingUp, X
} from 'lucide-react';
import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';

const SurgeryReport = () => {
  const { token } = useAuthStore();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [surgeries, setSurgeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSurgery, setSelectedSurgery] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [details, setDetails] = useState(null);

  const fetchSurgeries = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/reports/surgery-performance';
      if (startDate && endDate) {
        url += `?startDate=${startDate}&endDate=${endDate}`;
      }
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSurgeries(data);
    } catch {
      toast.error('فشل تحميل تقرير العمليات');
    } finally {
      setLoading(false);
    }
  }, [token, startDate, endDate]);

  useEffect(() => {
    fetchSurgeries();
  }, [fetchSurgeries]);

  const viewSurgeryDetails = async (surg) => {
    setSelectedSurgery(surg);
    setDetailsLoading(true);
    setDetails(null);
    try {
      // Fetch specific surgery details (materials, expenses)
      const res = await fetch(`/api/reports/surgery-details/${surg.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setDetails(data);
    } catch {
      toast.error('فشل تحميل تفاصيل العملية');
    } finally {
      setDetailsLoading(false);
    }
  };

  // Aggregated KPIs
  const totalRevenues = surgeries.reduce((acc, s) => acc + parseFloat(s.full_price || 0), 0);
  const totalMatCosts = surgeries.reduce((acc, s) => acc + parseFloat(s.materials_cost || 0), 0);
  const totalExpCosts = surgeries.reduce((acc, s) => acc + parseFloat(s.other_expenses || 0), 0);
  const totalCosts = totalMatCosts + totalExpCosts;
  const netProfit = totalRevenues - totalCosts;
  const marginPercent = totalRevenues > 0 ? ((netProfit / totalRevenues) * 100).toFixed(1) : 0;

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Scissors className="text-slate-900" size={28} /> تقرير ربحية العمليات الجراحية
        </h1>
        <p className="text-gray-500 mt-1">تحليل تكاليف وأرباح العمليات الجراحية المنفذة بدقة بالغة</p>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-sm font-bold text-gray-500">إجمالي إيرادات العمليات</p>
          <p className="text-2xl font-black text-slate-900 mt-2">{totalRevenues.toLocaleString()} YER</p>
          <p className="text-xs text-gray-400 mt-1">القيم الكلية المسعرة للمرضى</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-sm font-bold text-gray-500">تكلفة المواد المستهلكة</p>
          <p className="text-2xl font-black text-red-600 mt-2">{totalMatCosts.toLocaleString()} YER</p>
          <p className="text-xs text-gray-400 mt-1">تكلفة الشرائح والمسامير والمستهلكات</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-sm font-bold text-gray-500">الأجور والتكاليف الأخرى</p>
          <p className="text-2xl font-black text-red-500 mt-2">{totalExpCosts.toLocaleString()} YER</p>
          <p className="text-xs text-gray-400 mt-1">أتعاب الجراحين والمساعدين والمصاريف</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-sm font-bold text-gray-500">صافي الأرباح الفعلية</p>
          <p className="text-2xl font-black text-emerald-600 mt-2">{netProfit.toLocaleString()} YER</p>
          <p className="text-xs text-emerald-500 font-bold mt-1">نسبة هامش الربح: {marginPercent}%</p>
        </div>
      </div>

      {/* Surgeries List (Card Based) */}
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/40 shadow-xl shadow-slate-200/40 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
            <ClipboardList className="text-indigo-600" size={24} /> سجل العمليات
          </h3>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl">{surgeries.length} عملية</span>
        </div>
        
        {loading ? (
          <div className="flex justify-center py-12"><span className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"/></div>
        ) : surgeries.length === 0 ? (
          <div className="text-center py-12 text-slate-400 font-bold bg-slate-50/50 rounded-2xl border border-slate-100">لا توجد عمليات مسجلة في هذه الفترة</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {surgeries.map(s => {
              const sProfit = parseFloat(s.full_price) - (parseFloat(s.materials_cost) + parseFloat(s.other_expenses));
              const sMargin = parseFloat(s.full_price) > 0 ? ((sProfit / parseFloat(s.full_price)) * 100).toFixed(0) : 0;
              return (
                <div key={s.id} className="group relative overflow-hidden bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-xl hover:shadow-indigo-100 hover:border-indigo-100 transition-all">
                  {/* Decorative background blur */}
                  <div className="absolute -left-10 -top-10 w-32 h-32 bg-indigo-50 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  
                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <div>
                      <h4 className="font-black text-slate-800 text-lg">{s.full_name}</h4>
                      <p className="text-xs font-bold text-indigo-600 mt-1 bg-indigo-50 inline-block px-2 py-0.5 rounded-md">{s.surgery_type}</p>
                    </div>
                    <div className="text-left">
                      <span className="text-[10px] font-bold text-slate-400 block">{new Date(s.created_at).toLocaleDateString('ar-EG')}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4 relative z-10">
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100/50">
                      <span className="text-[10px] text-slate-500 block font-bold mb-1">الإيراد الكلي</span>
                      <span className="font-black text-slate-700">{parseFloat(s.full_price).toLocaleString()} <span className="text-[10px] text-slate-400">YER</span></span>
                    </div>
                    <div className="bg-red-50/50 rounded-xl p-3 border border-red-50/50">
                      <span className="text-[10px] text-red-500 block font-bold mb-1">إجمالي التكاليف</span>
                      <span className="font-black text-red-600">{(parseFloat(s.materials_cost) + parseFloat(s.other_expenses)).toLocaleString()} <span className="text-[10px] text-red-400">YER</span></span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-50 relative z-10">
                    <div>
                      <span className="text-[10px] text-emerald-600 block font-bold mb-0.5">صافي الربح ({sMargin}%)</span>
                      <span className="font-black text-emerald-600 text-lg">{sProfit.toLocaleString()} <span className="text-xs text-emerald-400">YER</span></span>
                    </div>
                    <button 
                      onClick={() => viewSurgeryDetails(s)}
                      className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-600 transition-colors shadow-md shadow-slate-200"
                    >
                      <Info size={14} /> عرض التكاليف
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Drill-down Detail Modal */}
      <AnimatePresence>
        {selectedSurgery && (
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
                  <h3 className="font-bold text-lg">تفاصيل تكلفة وأرباح العملية</h3>
                  <p className="text-xs text-slate-300 mt-1">{selectedSurgery.surgery_type} · المريض: {selectedSurgery.full_name}</p>
                </div>
                <button onClick={() => setSelectedSurgery(null)} className="p-1 rounded-lg hover:bg-white/10 text-white/80">
                  <X size={20} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-right" dir="rtl">
                {detailsLoading ? (
                  <div className="h-40 bg-gray-50 rounded-xl animate-pulse flex items-center justify-center text-gray-400 font-bold">جاري تحميل التفاصيل...</div>
                ) : (
                  <>
                    {/* Summary Row */}
                    <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-xs text-gray-400 font-bold">الإيراد الكلي</span>
                        <p className="text-lg font-black text-slate-800">{parseFloat(selectedSurgery.full_price).toLocaleString()} YER</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400 font-bold">إجمالي المصاريف والمواد</span>
                        <p className="text-lg font-black text-red-600">{(parseFloat(selectedSurgery.materials_cost) + parseFloat(selectedSurgery.other_expenses)).toLocaleString()} YER</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400 font-bold">الربح الصافي</span>
                        <p className="text-lg font-black text-emerald-600">
                          {(parseFloat(selectedSurgery.full_price) - (parseFloat(selectedSurgery.materials_cost) + parseFloat(selectedSurgery.other_expenses))).toLocaleString()} YER
                        </p>
                      </div>
                    </div>

                    {/* Materials Used */}
                    <div>
                      <h4 className="font-bold text-slate-900 text-base mb-3 flex items-center gap-2">
                        <Package size={18} className="text-purple-600" /> المواد والمستلزمات الطبية المستهلكة
                      </h4>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                          <tr>
                            <th className="py-2 px-4 text-right font-bold">الصنف</th>
                            <th className="py-2 px-4 text-right font-bold">الكمية</th>
                            <th className="py-2 px-4 text-right font-bold">سعر الشراء</th>
                            <th className="py-2 px-4 text-right font-bold">التكلفة الإجمالية</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {details?.materials?.length === 0 ? (
                            <tr><td colSpan="4" className="py-4 text-center text-gray-400">لا توجد مواد مسجلة مستخدمة</td></tr>
                          ) : (
                            details?.materials?.map((mat, idx) => (
                              <tr key={idx}>
                                <td className="py-3 px-4 font-bold text-slate-800">{mat.item_name}</td>
                                <td className="py-3 px-4 text-slate-600">{mat.quantity} {mat.unit}</td>
                                <td className="py-3 px-4 text-slate-600">{parseFloat(mat.cost_price).toLocaleString()} YER</td>
                                <td className="py-3 px-4 font-bold text-red-500">{parseFloat(mat.total_cost).toLocaleString()} YER</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Labour and other Expenses */}
                    <div>
                      <h4 className="font-bold text-slate-900 text-base mb-3 flex items-center gap-2">
                        <DollarSign size={18} className="text-amber-500" /> الأجور والمصاريف الإضافية
                      </h4>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                          <tr>
                            <th className="py-2 px-4 text-right font-bold">نوع المصروف/الأجر</th>
                            <th className="py-2 px-4 text-right font-bold">القيمة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {details?.expenses?.length === 0 ? (
                            <tr><td colSpan="2" className="py-4 text-center text-gray-400">لا توجد مصاريف إضافية مسجلة</td></tr>
                          ) : (
                            details?.expenses?.map((exp, idx) => (
                              <tr key={idx}>
                                <td className="py-3 px-4 font-bold text-slate-800">{exp.description}</td>
                                <td className="py-3 px-4 font-bold text-red-500">{parseFloat(exp.amount).toLocaleString()} YER</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

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

export default SurgeryReport;
