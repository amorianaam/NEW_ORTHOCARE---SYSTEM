import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, Calendar, Search, FileSpreadsheet, Printer, 
  ArrowUpRight, ArrowDownRight, ClipboardList, Coins
} from 'lucide-react';
import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';

const FinancialReport = () => {
  const { token } = useAuthStore();
  const [activeTab, setActiveTab] = useState('visits'); // 'visits' | 'labs' | 'rads' | 'surgeries' | 'general'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchFinancials = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/reports/financial';
      if (startDate && endDate) {
        url += `?startDate=${startDate}&endDate=${endDate}`;
      }
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const resData = await res.json();
      setData(resData);
    } catch {
      toast.error('فشل تحميل البيانات المالية');
    } finally {
      setLoading(false);
    }
  }, [token, startDate, endDate]);

  useEffect(() => {
    fetchFinancials();
  }, [fetchFinancials]);

  // Calculate currency summaries
  const getSummary = (type, category) => {
    return data?.summaries?.find(s => s.type === type && s.category === category)?.total || 0;
  };

  const getSumByType = (type, curr) => {
    return data?.summaries?.filter(s => s.type === type && s.currency === curr).reduce((acc, s) => acc + parseFloat(s.total || 0), 0) || 0;
  };

  const currencies = ['YER'];

  const TABS = [
    { id: 'visits', label: 'رسوم الزيارات', count: data?.details?.visitFees?.length || 0 },
    { id: 'labs', label: 'التحاليل الطبية', count: data?.details?.labs?.length || 0 },
    { id: 'rads', label: 'الأشعة التشخيصية', count: data?.details?.radiologies?.length || 0 },
    { id: 'surgeries', label: 'دفعات العمليات', count: data?.details?.surgeries?.length || 0 },
    { id: 'general', label: 'المعاملات النقدية الأخرى', count: data?.details?.general?.length || 0 },
  ];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="text-slate-900" size={28} /> التقرير المالي الشامل
          </h1>
          <p className="text-gray-500 mt-1">متابعة كافة التحصيلات والصرفيات في المنظومة مع تفاصيل القيود</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="btn-secondary flex items-center gap-2">
            <Printer size={16} /> طباعة التقرير
          </button>
        </div>
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

      {/* Currency Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {currencies.map(curr => {
          // Total Income for currency
          let totalInc = getSumByType('income', curr);
          // If YER, manually sum up YER items from sub-queries that are in other tables
          if (curr === 'YER') {
            const sumVisits = data?.details?.visitFees?.reduce((acc, v) => acc + parseFloat(v.amount || 0), 0) || 0;
            const sumLabs = data?.details?.labs?.reduce((acc, l) => acc + parseFloat(l.amount || 0), 0) || 0;
            const sumRads = data?.details?.radiologies?.reduce((acc, r) => acc + parseFloat(r.amount || 0), 0) || 0;
            totalInc += sumVisits + sumLabs + sumRads;
          }
          // Add surgeries paid in this currency
          const sumSurg = data?.details?.surgeries?.filter(s => s.currency === curr).reduce((acc, s) => acc + parseFloat(s.amount || 0), 0) || 0;
          totalInc += sumSurg;

          const totalExp = getSumByType('expense', curr) + (curr === 'YER' ? (data?.details?.general?.filter(g => g.type === 'expense').reduce((acc, g) => acc + parseFloat(g.amount || 0), 0) || 0) : 0);
          const netProfit = totalInc - totalExp;

          return (
            <div key={curr} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-bl-full -z-10 flex items-center justify-center">
                <Coins className="text-slate-200/50 absolute top-4 right-4" size={24} />
              </div>
              <h3 className="font-bold text-slate-800 text-lg mb-4 border-b border-slate-100 pb-2">الريال اليمني (YER)</h3>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 font-bold flex items-center gap-1"><ArrowUpRight size={16} className="text-emerald-500"/> إجمالي التحصيلات:</span>
                  <span className="font-bold text-emerald-600">{totalInc.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 font-bold flex items-center gap-1"><ArrowDownRight size={16} className="text-red-500"/> إجمالي الصرفيات:</span>
                  <span className="font-bold text-red-600">{totalExp.toLocaleString()}</span>
                </div>
                <div className="border-t border-gray-50 pt-3 flex justify-between items-center">
                  <span className="text-gray-800 font-bold">صافي الدخل:</span>
                  <span className={`text-lg font-black ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {netProfit.toLocaleString()} {curr}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100 bg-gray-50/50 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-slate-900 text-slate-900 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/50'
              }`}
            >
              {tab.label}
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs">{tab.count}</span>
            </button>
          ))}
        </div>

        {/* Tab Contents */}
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
                {/* ── Visits Tab ── */}
                {activeTab === 'visits' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {data?.details?.visitFees?.length === 0 ? (
                      <div className="col-span-full py-12 text-center text-gray-400 font-bold bg-slate-50 rounded-2xl border border-slate-100">لا توجد بيانات</div>
                    ) : (
                      data?.details?.visitFees?.map((row, idx) => (
                        <div key={idx} className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                          <div className="absolute top-0 right-0 w-1 h-full bg-emerald-500" />
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <p className="font-black text-slate-800 text-lg">{row.full_name}</p>
                              <p className="text-xs font-bold text-emerald-600 bg-emerald-50 inline-block px-2 py-0.5 rounded-md mt-1">زيارة #{row.visit_number}</p>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400">{new Date(row.created_at).toLocaleDateString('ar-EG')}</span>
                          </div>
                          <div className="flex items-end justify-between mt-4">
                            <div>
                              <p className="text-[10px] text-gray-400 font-bold mb-0.5">المحاسب: {row.cashier_name || 'تلقائي'}</p>
                            </div>
                            <p className="font-black text-emerald-600 text-xl">+{parseFloat(row.amount).toLocaleString()} <span className="text-[10px] text-emerald-400">YER</span></p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ── Labs Tab ── */}
                {activeTab === 'labs' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {data?.details?.labs?.length === 0 ? (
                      <div className="col-span-full py-12 text-center text-gray-400 font-bold bg-slate-50 rounded-2xl border border-slate-100">لا توجد بيانات</div>
                    ) : (
                      data?.details?.labs?.map((row, idx) => (
                        <div key={idx} className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                          <div className="absolute top-0 right-0 w-1 h-full bg-blue-500" />
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <p className="font-black text-slate-800 text-lg">{row.full_name}</p>
                              <p className="text-xs font-bold text-blue-600 bg-blue-50 inline-block px-2 py-0.5 rounded-md mt-1">{row.service_name}</p>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400">{new Date(row.created_at).toLocaleDateString('ar-EG')}</span>
                          </div>
                          <div className="flex items-end justify-between mt-4">
                            <div>
                              <p className="text-[10px] text-gray-400 font-bold mb-0.5">زيارة #{row.visit_number}</p>
                            </div>
                            <p className="font-black text-emerald-600 text-xl">+{parseFloat(row.amount).toLocaleString()} <span className="text-[10px] text-emerald-400">YER</span></p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ── Radiologies Tab ── */}
                {activeTab === 'rads' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {data?.details?.radiologies?.length === 0 ? (
                      <div className="col-span-full py-12 text-center text-gray-400 font-bold bg-slate-50 rounded-2xl border border-slate-100">لا توجد بيانات</div>
                    ) : (
                      data?.details?.radiologies?.map((row, idx) => (
                        <div key={idx} className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                          <div className="absolute top-0 right-0 w-1 h-full bg-purple-500" />
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <p className="font-black text-slate-800 text-lg">{row.full_name}</p>
                              <p className="text-xs font-bold text-purple-600 bg-purple-50 inline-block px-2 py-0.5 rounded-md mt-1">{row.service_name}</p>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400">{new Date(row.created_at).toLocaleDateString('ar-EG')}</span>
                          </div>
                          <div className="flex items-end justify-between mt-4">
                            <div>
                              <p className="text-[10px] text-gray-400 font-bold mb-0.5">زيارة #{row.visit_number} · {row.with_film ? 'مع فيلم' : 'بدون فيلم'}</p>
                            </div>
                            <p className="font-black text-emerald-600 text-xl">+{parseFloat(row.amount).toLocaleString()} <span className="text-[10px] text-emerald-400">YER</span></p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ── Surgeries Tab ── */}
                {activeTab === 'surgeries' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {data?.details?.surgeries?.length === 0 ? (
                      <div className="col-span-full py-12 text-center text-gray-400 font-bold bg-slate-50 rounded-2xl border border-slate-100">لا توجد بيانات</div>
                    ) : (
                      data?.details?.surgeries?.map((row, idx) => (
                        <div key={idx} className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                          <div className="absolute top-0 right-0 w-1 h-full bg-indigo-500" />
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <p className="font-black text-slate-800 text-lg">{row.full_name}</p>
                              <p className="text-xs font-bold text-indigo-600 bg-indigo-50 inline-block px-2 py-0.5 rounded-md mt-1">{row.surgery_type}</p>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400">{new Date(row.created_at).toLocaleDateString('ar-EG')}</span>
                          </div>
                          <div className="flex items-end justify-between mt-4">
                            <div>
                              <p className="text-[10px] text-gray-400 font-bold mb-0.5">المحاسب: {row.cashier_name}</p>
                            </div>
                            <p className="font-black text-emerald-600 text-xl">+{parseFloat(row.amount).toLocaleString()} <span className="text-[10px] text-emerald-400">YER</span></p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ── General Transactions Tab ── */}
                {activeTab === 'general' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {data?.details?.general?.length === 0 ? (
                      <div className="col-span-full py-12 text-center text-gray-400 font-bold bg-slate-50 rounded-2xl border border-slate-100">لا توجد بيانات</div>
                    ) : (
                      data?.details?.general?.map((row, idx) => (
                        <div key={idx} className={`bg-white border ${row.type === 'income' ? 'border-emerald-100' : 'border-red-100'} p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group`}>
                          <div className={`absolute top-0 right-0 w-1 h-full ${row.type === 'income' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <p className="font-bold text-slate-800 text-sm leading-relaxed">{row.description}</p>
                              <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold mt-2 ${
                                row.type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                              }`}>
                                {row.category === 'refund' ? 'استرجاع مالي' : row.type === 'income' ? 'قبض عام' : 'صرف عام'}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 shrink-0 mr-2">{new Date(row.created_at).toLocaleDateString('ar-EG')}</span>
                          </div>
                          <div className="flex items-end justify-between mt-4">
                            <div>
                              <p className="text-[10px] text-gray-400 font-bold mb-0.5">بواسطة: {row.cashier_name}</p>
                            </div>
                            <p className={`font-black text-xl ${row.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                              {row.type === 'income' ? '+' : '-'}{parseFloat(row.amount).toLocaleString()} <span className="text-[10px] uppercase opacity-70">YER</span>
                            </p>
                          </div>
                        </div>
                      ))
                    )}
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

export default FinancialReport;
