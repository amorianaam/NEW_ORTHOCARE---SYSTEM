import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Radiation, FlaskConical, RotateCcw, AlertCircle, Check, Printer, Clock, X, Tag } from 'lucide-react';
import { toast } from 'react-toastify';
import taffyot from '../../utils/taffyot';

const InvoicePanel = ({ visitId, visitData, token, onClose, onPaid, onPatientClick }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [invoice, setInvoice]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [radFilm, setRadFilm]     = useState({});
  const [saving, setSaving]       = useState(false);
  const [refundModal, setRefundModal] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/cashier/visit/${visitId}/invoice`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(d => {
        setInvoice(d);
        const fm = {};
        (d.radiologyRequests||[]).forEach(r=>{ fm[r.id]=true; });
        setRadFilm(fm);
      })
      .catch(()=>toast.error('فشل تحميل الفاتورة'))
      .finally(()=>setLoading(false));
  }, [visitId, token]);

  useEffect(()=>{ load(); }, [load]);

  const unpaidLabs = (invoice?.labRequests || []).filter(r => r.status === 'pending_payment');
  const unpaidRads = (invoice?.radiologyRequests || []).filter(r => r.status === 'pending_payment');
  const paidLabs = (invoice?.labRequests || []).filter(r => r.status !== 'pending_payment' && r.status !== 'refunded');
  const paidRads = (invoice?.radiologyRequests || []).filter(r => r.status !== 'pending_payment' && r.status !== 'refunded');

  const hasUnpaid = unpaidLabs.length > 0 || unpaidRads.length > 0;
  const hasPaid = paidLabs.length > 0 || paidRads.length > 0;

  const totalUnpaid = unpaidLabs.reduce((sum, r) => sum + parseFloat(r.final_price ?? r.price ?? 0), 0) +
                      unpaidRads.reduce((sum, r) => {
                        const filmPrice = radFilm[r.id] !== false
                          ? parseFloat(r.price_with_film || 0)
                          : parseFloat(r.price_without_film || 0);
                        const discountedPrice = filmPrice - parseFloat(r.discount_amount || 0);
                        return sum + Math.max(0, discountedPrice);
                      }, 0);

  const handlePayBatch = async (labIds, radItems) => {
    if (!labIds.length && !radItems.length) return toast.warning('لم يتم تحديد خدمات للدفع');
    setSaving(true);
    try {
      const res = await fetch(`/api/cashier/visit/${visitId}/pay-services`, {
        method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body: JSON.stringify({ labIds, radiologyItems: radItems, discount:{amount:0,reason:''} }),
      });
      const d = await res.json();
      if (res.ok) { toast.success(d.message); onPaid(); load(); }
      else toast.error(d.message);
    } catch (e) { toast.error('تعذر الاتصال'); }
    finally { setSaving(false); }
  };

  const handlePaySingleLab = (id) => handlePayBatch([id], []);
  const handlePaySingleRad = (id) => handlePayBatch([], [{id, withFilm: radFilm[id] !== false}]);
  const handlePayAll = () => {
    handlePayBatch(unpaidLabs.map(r=>r.id), unpaidRads.map(r=>({id:r.id, withFilm: radFilm[r.id] !== false})));
  };

  const handleRefundService = async (type, id, reason) => {
    const url = type==='lab'
      ? `/api/cashier/service-lab/${id}/refund`
      : `/api/cashier/service-radiology/${id}/refund`;
    try {
      const res = await fetch(url, {
        method:'PUT', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({reason})
      });
      const d = await res.json();
      if (res.ok) { toast.success(d.message); load(); onPaid(); }
      else toast.error(d.message);
    } catch (e) { toast.error('تعذر الاتصال'); }
    setRefundModal(null);
  };

  const handlePrint = () => {
    if (!invoice) return;
    const win = window.open('', '_blank');
    const html = `
      <html dir="rtl">
        <head>
          <title>فاتورة خدمات طبية - ${visitData?.full_name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap');
            body { font-family: 'Tajawal', sans-serif; padding: 40px; color: #1e293b; max-width: 800px; margin: auto; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px dashed #cbd5e1; padding-bottom: 20px; }
            .header h2 { margin: 0; color: #0f172a; font-size: 28px; font-weight: 800; }
            .header p { margin: 5px 0; color: #64748b; font-size: 16px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px; background: #f8fafc; padding: 20px; border-radius: 12px; }
            .info-item { font-size: 15px; }
            .info-item strong { color: #475569; display: inline-block; width: 100px; }
            table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 15px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
            th, td { padding: 12px 15px; text-align: right; border-bottom: 1px solid #e2e8f0; }
            th { background-color: #f1f5f9; font-weight: 700; color: #334155; }
            tr:last-child td { border-bottom: none; }
            .total-box { margin-top: 30px; background: #0f172a; color: white; padding: 20px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; }
            .total-box span { font-size: 18px; font-weight: bold; }
            .total-box .amount { font-size: 24px; color: #10b981; }
            @media print { button { display: none; } body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            ${(invoice.labRequests||[]).map(r => `<tr><td>${r.name} <span style="color:#64748b;font-size:12px;">(تحليل)</span></td><td>${r.price}</td><td style="color:${r.status==='paid'?'#10b981':'#ef4444'}">${r.status==='paid'?'مدفوع':'غير مدفوع'}</td></tr>`).join('')}
            ${(invoice.radiologyRequests||[]).map(r => `<tr><td>${r.name} <span style="color:#64748b;font-size:12px;">(أشعة)</span></td><td>${r.price_without_film}</td><td style="color:${r.status==='paid'?'#10b981':'#ef4444'}">${r.status==='paid'?'مدفوع':'غير مدفوع'}</td></tr>`).join('')}
          </table>
          <div class="total-box">
            <span>إجمالي الفاتورة المطلوبة</span>
            <div class="amount">${totalUnpaid.toLocaleString('ar')} YER</div>
          </div>
          <button onclick="window.print()" style="margin-top: 30px; width: 100%; padding: 15px; background: #2563EB; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 18px; font-weight: bold; font-family: 'Tajawal', sans-serif;">طباعة السند</button>
        </body>
      </html>
    `;
    win.document.write(html);
    win.document.close();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 print:hidden" dir="rtl">
        <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div 
          initial={{opacity:0, scale:0.95, y:20}} 
          animate={{opacity:1, scale:1, y:0}} 
          exit={{opacity:0, scale:0.95, y:20}}
          transition={{type:'spring', stiffness:300, damping:28}}
          className={`relative bg-white shadow-2xl flex flex-col overflow-hidden transition-all duration-300 border border-slate-100 rounded-3xl ${isExpanded ? 'w-full h-full max-w-7xl' : 'w-full max-w-3xl h-[85vh]'}`}
        >

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-6 border-b-2 border-dashed border-gray-200"
          style={{background:'#f8fafc', backgroundImage: 'radial-gradient(#e2e8f0 1px, transparent 1px)', backgroundSize: '20px 20px'}}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 font-black shadow-inner border border-blue-200">
              {visitData?.full_name?.charAt(0)}
            </div>
            <div>
              <p className="font-bold text-gray-800 text-base">{visitData?.full_name}</p>
              <p className="text-xs text-gray-500 font-bold bg-white px-2 py-0.5 rounded-md inline-block border border-gray-200 mt-1">{visitData?.visit_number}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handlePrint} className="p-2 rounded-xl hover:bg-blue-100 text-blue-600 transition-colors" title="طباعة الفاتورة">
              <Printer size={18}/>
            </button>
            <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 rounded-xl hover:bg-slate-200 text-slate-600 transition-colors" title={isExpanded ? 'تصغير' : 'تكبير'}>
              {isExpanded ? (
                <Check size={14} />
              ) : (
                <Check size={14} />
              )}
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-rose-100 hover:text-rose-600 text-slate-400 transition-colors bg-white shadow-sm border border-gray-100">
              <X size={20} strokeWidth={2.5}/>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-8 bg-slate-50/50">
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse"/>)}</div>
          ) : (
            <>
              {invoice?.visit?.entry_fee>0 && (
                <div className="flex justify-between items-center px-4 py-3 bg-emerald-50 rounded-xl border border-emerald-200 shadow-sm">
                  <span className="text-sm font-bold text-emerald-800">✓ رسوم المعاينة الطبي مدفوع</span>
                  <span className="font-black text-emerald-700">{invoice.visit.entry_fee} ريال يمني</span>
                </div>
              )}

                            {/* Unpaid Services */}
              {hasUnpaid && (
                <div className="space-y-4">
                  <h3 className="font-extrabold text-gray-800 flex items-center gap-2 text-lg">
                    <span className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]"></span> الخدمات الحاجة إلى دفع
                  </h3>
                  <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-sm text-right">
                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-3">الخدمة</th>
                          <th className="px-4 py-3">القسم</th>
                          <th className="px-4 py-3">القيمة</th>
                          <th className="px-4 py-3 text-center w-32">إجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {unpaidLabs.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-bold text-gray-800">
                              <div className="flex items-center gap-2">
                                <span className="bg-orange-50 text-orange-600 p-1.5 rounded-lg border border-orange-100"><Check size={14} /></span>
                                {r.name}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-bold text-sky-600">{r.category_name || 'قسم المختبر'}</td>
                            <td className="px-4 py-3">
                              <span className="font-black text-orange-600">{r.price} <span className="text-[10px] text-orange-400">YER</span></span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => handlePaySingleLab(r.id)} disabled={saving} className="px-4 py-1.5 bg-orange-500 text-white font-bold rounded-xl shadow-sm hover:bg-orange-600 transition-colors inline-flex items-center gap-2">
                                <Check size={14} /> تنفيذ ودفع
                              </button>
                            </td>
                          </tr>
                        ))}
                        {unpaidRads.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-bold text-gray-800">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="bg-sky-50 text-sky-600 p-1.5 rounded-lg border border-sky-100"><Check size={14} /></span>
                                  {r.name}
                                </div>
                                <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 inline-flex w-max ml-10">
                                  <button onClick={() => setRadFilm(f=>({...f,[r.id]:true}))} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-colors ${radFilm[r.id]!==false ? 'bg-sky-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>مع فيلم</button>
                                  <button onClick={() => setRadFilm(f=>({...f,[r.id]:false}))} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-colors ${radFilm[r.id]===false ? 'bg-sky-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>بدون فيلم</button>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-bold text-sky-600 align-top pt-5">قسم الأشعة</td>
                            <td className="px-4 py-3 align-top pt-5">
                              <span className="font-black text-sky-700">{radFilm[r.id]!==false ? r.price_with_film : r.price_without_film} <span className="text-[10px] text-sky-400">YER</span></span>
                            </td>
                            <td className="px-4 py-3 text-center align-top pt-4">
                              <button onClick={() => handlePaySingleRad(r.id)} disabled={saving} className="px-4 py-1.5 bg-sky-600 text-white font-bold rounded-xl shadow-sm hover:bg-sky-700 transition-colors inline-flex items-center gap-2">
                                <Check size={14} /> تنفيذ ودفع
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Paid Services */}
              {hasPaid && (
                <div className="space-y-4">
                  <h3 className="font-extrabold text-gray-800 flex items-center gap-2 text-lg">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span> الخدمات المدفوعة
                  </h3>
                  <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-sm text-right">
                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-3">الخدمة</th>
                          <th className="px-4 py-3">القسم</th>
                          <th className="px-4 py-3">القيمة</th>
                          <th className="px-4 py-3 text-center">الحالة</th>
                          <th className="px-4 py-3 text-center w-28">إجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {paidLabs.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-bold text-gray-600">
                              <div className="flex items-center gap-2 opacity-80">
                                <span className="bg-gray-50 text-gray-400 p-1.5 rounded-lg border border-gray-100"><Check size={14} /></span>
                                {r.name}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-bold text-sky-600 opacity-80">{r.category_name || 'قسم المختبر'}</td>
                            <td className="px-4 py-3">
                              <span className="font-bold text-gray-400 line-through">{r.price} <span className="text-[10px]">YER</span></span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-block px-3 py-1 rounded-lg text-[10px] font-bold border shadow-sm ${r.status==='completed'?'bg-emerald-50 text-emerald-700 border-emerald-100':r.status==='in_progress'?'bg-blue-50 text-blue-700 border-blue-100':'bg-amber-50 text-amber-700 border-amber-100'}`}>
                                {r.status==='completed'?'مكتملة':r.status==='in_progress'?'قيد التنفيذ':'قيد الانتظار'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {r.status === 'paid' && (
                                <button onClick={() => setRefundModal({type:'lab', id: r.id})} className="px-3 py-1.5 bg-white border border-red-200 text-red-600 font-bold text-[10px] rounded-lg hover:bg-red-50 transition-colors shadow-sm">
                                  استرداد
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {paidRads.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-bold text-gray-600">
                              <div className="flex items-center gap-2 opacity-80">
                                <span className="bg-gray-50 text-gray-400 p-1.5 rounded-lg border border-gray-100"><Check size={14} /></span>
                                {r.name}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-bold text-sky-600 opacity-80">قسم الأشعة</td>
                            <td className="px-4 py-3">
                              <span className="font-bold text-gray-400 line-through">{r.price_without_film} <span className="text-[10px]">YER</span></span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-block px-3 py-1 rounded-lg text-[10px] font-bold border shadow-sm ${r.status==='completed'?'bg-emerald-50 text-emerald-700 border-emerald-100':r.status==='in_progress'?'bg-blue-50 text-blue-700 border-blue-100':'bg-amber-50 text-amber-700 border-amber-100'}`}>
                                {r.status==='completed'?'مكتملة':r.status==='in_progress'?'قيد التنفيذ':'قيد الانتظار'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {r.status === 'paid' && (
                                <button onClick={() => setRefundModal({type:'rad', id: r.id})} className="px-3 py-1.5 bg-white border border-red-200 text-red-600 font-bold text-[10px] rounded-lg hover:bg-red-50 transition-colors shadow-sm">
                                  استرداد
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {!hasUnpaid && !hasPaid && (
                <div className="text-center py-10 opacity-50 font-bold">لا توجد خدمات لهذا المريض.</div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-gray-200 bg-white z-20 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
          {hasUnpaid && (
            <div className="mb-5">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-bold text-gray-500 uppercase tracking-wide">الإجمالي للخدمات الحاجة للدفع:</span>
                <span className="text-3xl font-black text-slate-800 tracking-tight">{totalUnpaid.toLocaleString('ar')} <span className="text-sm text-gray-400 font-bold">YER</span></span>
              </div>
              <button onClick={handlePayAll} disabled={saving||loading}
                className="w-full py-4 rounded-2xl bg-gradient-to-l from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-black transition-all shadow-[0_4px_15px_rgba(16,185,129,0.3)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.4)] hover:-translate-y-0.5 flex items-center justify-center gap-2 text-lg">
                {saving?<span className="animate-spin w-6 h-6 border-4 border-white/30 border-t-white rounded-full"/>:<Check strokeWidth={3} size={24}/>}
                دفع الكل
              </button>
            </div>
          )}
          <button onClick={() => { onClose(); onPatientClick && onPatientClick(visitData.patient_id); }} className="w-full py-3.5 bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold border border-sky-100 rounded-2xl transition-colors flex items-center justify-center gap-2">
            <FileText size={20} /> عرض ملف المريض المالي
          </button>
        </div>
        </motion.div>
      </div>

      {/* Refund Modal */}
      <AnimatePresence>
        {refundModal && (
          <RefundModal
            title={refundModal.type==='all' ? 'استرداد كامل' : 'استرداد هذه الخدمة'}
            onClose={()=>setRefundModal(null)}
            onConfirm={reason=>{
              handleRefundService(refundModal.type, refundModal.id, reason);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
};

// ── Main Screen ────────────────────────────────────────────────────


export default InvoicePanel;
