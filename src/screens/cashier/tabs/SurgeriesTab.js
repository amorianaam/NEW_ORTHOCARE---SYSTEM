import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Scissors, AlertCircle, CreditCard, Search, X, Check
} from 'lucide-react';
import { toast } from 'react-toastify';
import useAuthStore from '../../../store/useAuthStore';
import useSocketStore from '../../../store/useSocketStore';

// ── Payment Status Helper ──────────────────────────────────────────
const getPaymentStatus = (surgery) => {
  const fullPrice = parseFloat(surgery.full_price || 0);
  const discount = parseFloat(surgery.discount_amount || 0);
  const netPrice = Math.max(0, fullPrice - discount);
  const paid = parseFloat(surgery.paid_amount || 0);
  const rem = parseFloat(
    surgery.remaining_amount !== undefined && surgery.remaining_amount !== null
      ? surgery.remaining_amount
      : (netPrice - paid)
  );

  if (paid > 0 && rem <= 0) {
    return {
      key: 'paid',
      label: 'تم التسديد',
      bg: 'bg-emerald-50/90 text-emerald-700 border-emerald-200/80',
      dot: 'bg-emerald-500',
      pulse: false,
      rem,
      paid
    };
  } else if (paid > 0 && rem > 0) {
    return {
      key: 'partial',
      label: 'تم تسديد دفعة',
      bg: 'bg-amber-50/90 text-amber-700 border-amber-200/80',
      dot: 'bg-amber-500',
      pulse: true,
      rem,
      paid
    };
  } else {
    return {
      key: 'unpaid',
      label: 'لم يتم التسديد',
      bg: 'bg-rose-50/90 text-rose-700 border-rose-200/80',
      dot: 'bg-rose-500',
      pulse: true,
      rem,
      paid
    };
  }
};

const SurgeriesTab = ({ onPatientClick, onCheckout, onCountChange }) => {
  const { token } = useAuthStore();
  const latestCashierUpdate = useSocketStore(state => state.latestCashierUpdate);
  const [surgeries, setSurgeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const lastFetchRef = useRef(0);

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      setError(false);
      const res = await fetch('/api/cashier/surgeries', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSurgeries(Array.isArray(data) ? data : []);
      lastFetchRef.current = Date.now();
    } catch (e) {
      if (!isSilent) {
        setError(true);
        toast.error('فشل تحميل بيانات العمليات');
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [token]);

  // Initial Mount Fetch
  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  // Real-Time Silent Sync Bridge
  useEffect(() => {
    if (latestCashierUpdate?.timestamp && latestCashierUpdate.timestamp > lastFetchRef.current) {
      fetchData(true);
    }
  }, [latestCashierUpdate, fetchData]);

  // Synchronize count to parent tab badge
  useEffect(() => {
    if (typeof onCountChange === 'function') {
      onCountChange(surgeries.length);
    }
  }, [surgeries.length, onCountChange]);

  const filteredSurgeries = useMemo(() => {
    if (!searchQuery.trim()) return surgeries;
    const q = searchQuery.trim().toLowerCase();
    return surgeries.filter((s) => {
      const name = (s.full_name || '').toLowerCase();
      const phone = (s.phone || '').toLowerCase();
      const visitNumber = String(s.visit_number || s.visit_id || s.surgery_id || s.id || '').toLowerCase();
      const surgeryType = (s.surgery_type || '').toLowerCase();
      const statusObj = getPaymentStatus(s);
      return (
        name.includes(q) ||
        phone.includes(q) ||
        visitNumber.includes(q) ||
        surgeryType.includes(q) ||
        statusObj.label.toLowerCase().includes(q)
      );
    });
  }, [surgeries, searchQuery]);

  return (
    <div className="w-full flex-1 flex flex-col min-h-0" dir="rtl">
      {/* ── Header with Title, Counter & Search Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 flex-shrink-0">
        <div>
          <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
            <span className="w-1.5 h-6 bg-sky-500 rounded-full"></span> العمليات الجراحية
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {searchQuery
              ? `${filteredSurgeries.length} من أصل ${surgeries.length} عملية`
              : `إجمالي ${surgeries.length} عملية جراحية مسجلة`}
          </p>
        </div>

        {/* ── Search Input ── */}
        <div className="relative w-full sm:w-80 md:w-96">
          <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
            <Search size={16} strokeWidth={2.2} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم، رقم الهاتف، أو العملية..."
            className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-sky-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200/60 shadow-xs transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              title="مسح البحث"
              aria-label="مسح البحث"
            >
              <div className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                <X size={12} strokeWidth={2.5} />
              </div>
            </button>
          )}
        </div>
      </div>

      {/* ── Table Content ── */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {error ? (
          <div className="flex flex-col justify-center items-center h-64 text-gray-400 bg-white/90 backdrop-blur-md rounded-3xl border border-rose-100 shadow-sm gap-4">
            <AlertCircle className="text-rose-400" size={48} />
            <p className="text-lg font-bold text-gray-600">تعذر تحميل البيانات</p>
            <button
              onClick={() => fetchData()}
              className="px-6 py-2 bg-rose-50 text-rose-600 font-bold rounded-xl hover:bg-rose-100 transition-colors"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden mb-6 transition-all">
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-sm whitespace-nowrap table-fixed">
                <thead className="bg-gradient-to-r from-slate-50/90 via-sky-50/20 to-slate-50/90 text-slate-500 border-b border-slate-100/80">
                  <tr>
                    <th className="w-[5%] px-3 py-4 text-center font-black text-xs text-slate-400 whitespace-nowrap">#</th>
                    <th className="w-[27%] px-4 py-4 text-right font-black text-xs uppercase tracking-wider text-slate-600 whitespace-nowrap">اسم المريض</th>
                    <th className="w-[16%] px-4 py-4 text-right font-black text-xs uppercase tracking-wider text-slate-600 whitespace-nowrap">رقم الهاتف</th>
                    <th className="w-[18%] px-4 py-4 text-right font-black text-xs uppercase tracking-wider text-slate-600 whitespace-nowrap">نوع العملية</th>
                    <th className="w-[18%] px-4 py-4 text-center font-black text-xs uppercase tracking-wider text-slate-600 whitespace-nowrap">حالة الدفع</th>
                    <th className="w-[16%] px-4 py-4 text-center font-black text-xs uppercase tracking-wider text-slate-600 whitespace-nowrap">الدفع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/70">
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="p-12 text-center text-gray-400 font-bold">
                        <div className="flex justify-center items-center h-16">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
                        </div>
                      </td>
                    </tr>
                  ) : filteredSurgeries.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-16 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-3 text-slate-300">
                            {searchQuery ? <Search size={32} strokeWidth={1.5} /> : <Scissors size={32} strokeWidth={1.5} />}
                          </div>
                          <p className="text-sm font-bold text-slate-600">
                            {searchQuery
                              ? `لا توجد نتائج مطابقة للبحث "${searchQuery}"`
                              : 'لا توجد عمليات جراحية مسجلة حالياً'}
                          </p>
                          {searchQuery ? (
                            <button
                              onClick={() => setSearchQuery('')}
                              className="mt-2 text-xs font-bold text-sky-600 hover:text-sky-700 bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-100 transition-colors"
                            >
                              مسح كلمة البحث
                            </button>
                          ) : (
                            <p className="text-xs text-slate-400 mt-1">ستظهر هنا العمليات الجراحية المجدولة والمخططة للمرضى</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredSurgeries.map((s, index) => {
                      const paymentStatus = getPaymentStatus(s);

                      return (
                        <tr
                          key={s.surgery_id}
                          onClick={() => onCheckout && onCheckout(s)}
                          className="cursor-pointer hover:bg-sky-50/40 transition-colors border-b border-slate-100/70 last:border-0 group"
                        >
                          <td className="px-3 py-4 text-center font-black text-slate-400 text-xs">
                            {index + 1}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-50 to-sky-100/80 text-sky-700 flex items-center justify-center font-black text-sm border border-sky-200/50 shadow-xs shrink-0 group-hover:scale-105 transition-transform"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPatientClick && onPatientClick(s.patient_id, s.visit_id);
                                }}
                                title="عرض الملف المالي"
                              >
                                {s.full_name?.charAt(0)}
                              </div>
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <span
                                  className="font-black text-slate-800 text-sm group-hover:text-sky-700 transition-colors truncate"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onPatientClick && onPatientClick(s.patient_id, s.visit_id);
                                  }}
                                >
                                  {s.full_name}
                                </span>
                                <span className="text-[11px] font-bold text-slate-400" dir="ltr">
                                  {s.visit_number || s.visit_id || s.surgery_id}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span
                              className="text-xs font-bold text-slate-600 bg-slate-100/80 px-2 py-1 rounded-lg border border-slate-200/50"
                              dir="ltr"
                            >
                              {s.phone || '--'}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className="text-xs font-bold text-slate-700 bg-slate-100/70 px-2.5 py-1 rounded-lg border border-slate-200/60 truncate inline-block max-w-full">
                              {s.surgery_type || '--'}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex items-center justify-center">
                              <span
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border shadow-xs transition-all ${paymentStatus.bg}`}
                              >
                                <span className="relative flex h-2 w-2">
                                  {paymentStatus.pulse && (
                                    <span
                                      className={`animate-ping absolute inline-flex h-full w-full rounded-full ${paymentStatus.dot} opacity-75`}
                                    ></span>
                                  )}
                                  <span
                                    className={`relative inline-flex rounded-full h-2 w-2 ${paymentStatus.dot}`}
                                  ></span>
                                </span>
                                <span className="whitespace-nowrap">{paymentStatus.label}</span>
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex items-center justify-center">
                              {paymentStatus.key !== 'paid' ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCheckout && onCheckout(s);
                                  }}
                                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm shadow-amber-500/20 hover:shadow-md hover:shadow-amber-500/30 active:scale-95 whitespace-nowrap"
                                >
                                  <CreditCard size={13} />
                                  <span>تسديد الرسوم</span>
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCheckout && onCheckout(s);
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs transition-all flex items-center gap-1 border border-emerald-200/60 whitespace-nowrap"
                                  title="عرض سجل الدفعات"
                                >
                                  <Check size={13} strokeWidth={2.5} />
                                  <span>عرض الدفعات</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SurgeriesTab;
