import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Edit2, Edit3, Trash2, Package, PackagePlus, Info, Activity, Clock, FileText, ArrowDownRight, ArrowUpRight, AlignLeft, Calendar, Tag, AlertTriangle, AlertCircle, CircleDollarSign, Maximize2, Minimize2, Plus, Minus, Check } from 'lucide-react';
import { toast } from 'react-toastify';
import TransactionDetailsModal from './TransactionDetailsModal';
import ConfirmDeleteModal from '../ConfirmDeleteModal';
import taffyot from '../../utils/taffyot';

const ItemDetailsModal = ({ item, onClose, token, onEdit, onDelete, fetchItems, storeType = 'general' }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [movements, setMovements] = useState([]);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null); // For TransactionDetailsModal
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, loading: false });
  const [isFullscreen, setIsFullscreen] = useState(() => {
    return localStorage.getItem("itemDetailsModalFullscreen") === "true";
  });

  useEffect(() => {
    localStorage.setItem("itemDetailsModalFullscreen", isFullscreen);
  }, [isFullscreen]);

  useEffect(() => {
    if (activeTab === 'movements' && movements.length === 0) fetchMovements();
    if (activeTab === 'audit' && audits.length === 0) fetchAudits();
  }, [activeTab]);

  const fetchMovements = async () => {
    setLoading(true);
    const basePath = storeType === 'or' ? '/api/inventory/or/items' : '/api/inventory/general/items';
    try {
      const res = await fetch(`${basePath}/${item.id}/movements`, { headers: { Authorization: `Bearer ${token}` }});
      if (res.ok) setMovements(await res.json());
    } catch { toast.error('تعذر تحميل سجل حركة المخزون للصنف، يرجى التحقق من الاتصال بالخادم.', { toastId: 'item-movements-error' }); }
    setLoading(false);
  };

  const fetchAudits = async () => {
    setLoading(true);
    const basePath = storeType === 'or' ? '/api/inventory/or/items' : '/api/inventory/general/items';
    try {
      const res = await fetch(`${basePath}/${item.id}/audit`, { headers: { Authorization: `Bearer ${token}` }});
      if (res.ok) setAudits(await res.json());
    } catch { toast.error('تعذر تحميل سجل التعديلات للصنف، يرجى التحقق من الاتصال بالخادم.', { toastId: 'item-audits-error' }); }
    setLoading(false);
  };

  const confirmDelete = async () => {
    setDeleteModal({ isOpen: true, loading: true });
    const basePath = storeType === 'or' ? '/api/inventory/or/items' : '/api/inventory/general/items';
    try {
      const res = await fetch(`${basePath}/${item.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        fetchItems();
        onClose();
      } else {
        toast.error(data.message);
      }
    } catch { toast.error('تعذر حذف الصنف، يرجى التحقق من الاتصال بالخادم.', { toastId: 'item-delete-error' }); }
    setDeleteModal({ isOpen: false, loading: false });
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className={`relative z-10 bg-slate-50 flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] ${isFullscreen ? 'w-[98vw] h-[98vh] rounded-[2.5rem] border border-white' : 'w-full max-w-5xl h-full max-h-[90vh] rounded-[2rem] border border-white/60'}`}>
        
        {/* HEADER */}
        <div className="bg-white px-8 py-6 flex items-start justify-between border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-[1.5rem] bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center text-indigo-600 shadow-inner border border-indigo-100/50">
              <Package size={36} strokeWidth={1.5} />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-slate-800 tracking-tight leading-none">{item.name}</h2>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs font-black text-slate-500 bg-slate-100/80 px-2.5 py-1.5 rounded-lg border border-slate-200/60" dir="ltr">#{item.id}</span>
                <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-100/60">{item.unit || 'بدون وحدة'}</span>
                <span className="text-xs font-black text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-100/60">
                  متوفر: <span dir="ltr">{parseFloat(item.quantity).toLocaleString()}</span>
                </span>
                
                {/* Status Badges */}
                {(() => {
                  const qty = parseFloat(item.quantity);
                  const minQty = parseFloat(item.min_quantity);
                  let badges = [];

                  if (qty <= 0) {
                    badges.push({ id: 'out', text: 'نفذت الكمية', className: 'bg-rose-100 text-rose-700 border-rose-200/60' });
                  } else if (qty <= minQty) {
                    badges.push({ id: 'low', text: 'تحت الحد الأدنى', className: 'bg-amber-100 text-amber-700 border-amber-200/60' });
                  }

                  if (item.expiry_date) {
                    const today = new Date();
                    const expDate = new Date(item.expiry_date);
                    const daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
                    
                    if (daysLeft < 0) {
                      badges.push({ id: 'exp', text: 'منتهي الصلاحية', className: 'bg-rose-100 text-rose-700 border-rose-200/60' });
                    } else if (daysLeft <= 90) {
                      badges.push({ id: 'exp-soon', text: 'قارب على الانتهاء', className: 'bg-orange-100 text-orange-700 border-orange-200/60' });
                    }
                  }

                  return badges.map(b => (
                    <span key={b.id} className={`text-[11px] font-black px-2.5 py-1.5 rounded-lg border ${b.className}`}>
                      {b.text}
                    </span>
                  ));
                })()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onEdit(item)}
              className={`${
                isFullscreen ? 'w-9 h-9' : 'w-8 h-8'
              } flex items-center justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all border border-emerald-100 shadow-2xs cursor-pointer active:scale-95`}
              title="تعديل"
            >
              <Edit2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (parseFloat(item.quantity) > 0) {
                  toast.error('تعذر الحذف: يتوفر رصيد مخزني حالي لهذا الصنف. يُرجى أولاً تصفير الكمية (عبر شاشة الصرف) لتتمكن من حذفه.', { toastId: 'item-delete-stock-error' });
                } else {
                  setDeleteModal({ isOpen: true, loading: false });
                }
              }}
              className={`${
                isFullscreen ? 'w-9 h-9' : 'w-8 h-8'
              } flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition-all border border-red-100 shadow-2xs cursor-pointer active:scale-95`}
              title="حذف"
            >
              <Trash2 size={16} />
            </button>
            <div className="w-px h-6 bg-slate-200/80 mx-1"></div>
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={`${
                isFullscreen ? 'w-9 h-9' : 'w-8 h-8'
              } flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-xl transition-all border border-slate-200/80 shadow-2xs cursor-pointer active:scale-95`}
              title={isFullscreen ? 'تصغير النافذة' : 'تكبير النافذة'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`${
                isFullscreen ? 'w-9 h-9' : 'w-8 h-8'
              } flex items-center justify-center bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100 rounded-xl transition-all border border-slate-200/80 shadow-2xs cursor-pointer active:scale-95`}
              title="إغلاق"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* TABS */}
        <div className="flex justify-center gap-6 px-6 bg-white border-b border-slate-100 shrink-0">
          <button onClick={() => setActiveTab('overview')} className={`px-2 py-3.5 text-sm font-black border-b-[3px] transition-all ${activeTab === 'overview' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            النظرة العامة
          </button>
          <button onClick={() => setActiveTab('movements')} className={`px-2 py-3.5 text-sm font-black border-b-[3px] transition-all ${activeTab === 'movements' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            حركة المخزون
          </button>
          <button onClick={() => setActiveTab('audit')} className={`px-2 py-3.5 text-sm font-black border-b-[3px] transition-all ${activeTab === 'audit' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            سجل التعديلات
          </button>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
              
              {/* --- Section 1: Item & Control Data --- */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <div className="p-1.5 bg-indigo-100/80 rounded-lg text-indigo-600 shadow-sm"><Package size={16} /></div>
                  <h3 className="text-sm font-black text-slate-700">بيانات ومحددات الصنف</h3>
                </div>
                
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-right text-sm whitespace-nowrap">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-5 py-3.5 text-xs font-black text-slate-500 w-[10%]">ID</th>
                          <th className="px-5 py-3.5 text-xs font-black text-slate-500 w-[30%]">الصنف</th>
                          <th className="px-5 py-3.5 text-xs font-black text-slate-500 w-[15%]">نوع الصنف</th>
                          <th className="px-5 py-3.5 text-xs font-black text-slate-500 w-[15%]">الحد الأدنى للتنبيه</th>
                          <th className="px-5 py-3.5 text-xs font-black text-slate-500 w-[15%]">تاريخ الانتهاء</th>
                          <th className="px-5 py-3.5 text-xs font-black text-slate-500 w-[15%]">تاريخ الإضافة</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        <tr className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-4">
                            <span className="font-mono text-sm font-black text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200" dir="ltr">#{item.id}</span>
                          </td>
                          <td className="px-5 py-4 font-black text-base text-slate-800 truncate max-w-[200px]" title={item.name}>
                            {item.name}
                          </td>
                          <td className="px-5 py-4 font-bold text-slate-600">
                            {item.unit || 'بدون نوع'}
                          </td>
                          <td className="px-5 py-4">
                            <span className="font-black text-base text-amber-500" dir="ltr">{parseFloat(item.min_quantity || 0).toLocaleString()}</span>
                          </td>
                          <td className="px-5 py-4 align-middle">
                            {item.expiry_date ? (
                              <div className="flex items-center gap-1.5 bg-rose-50 px-2 py-1 rounded-md border border-rose-100 w-fit">
                                <Calendar size={13} className="text-rose-400" />
                                <span className="text-xs font-bold text-rose-700" dir="ltr">{new Date(item.expiry_date).toLocaleDateString('en-GB')}</span>
                              </div>
                            ) : (
                              <span className="text-slate-300 font-bold">—</span>
                            )}
                          </td>
                          <td className="px-5 py-4 align-middle">
                            {item.created_at ? (
                              <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 w-fit">
                                <Calendar size={13} className="text-slate-400" />
                                <span className="text-xs font-bold text-slate-700" dir="ltr">{new Date(item.created_at).toLocaleDateString('en-GB')}</span>
                              </div>
                            ) : (
                              <span className="text-slate-300 font-bold">—</span>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* --- Section 2: Financial & Stock Data --- */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <div className="p-1.5 bg-emerald-100/80 rounded-lg text-emerald-600 shadow-sm"><Activity size={16} /></div>
                  <h3 className="text-sm font-black text-slate-700">البيانات المالية والمخزنية</h3>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Quantity Card */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col relative overflow-hidden group hover:border-emerald-200 transition-colors">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-50 rounded-bl-full -z-0 opacity-50 group-hover:scale-110 transition-transform"></div>
                    <span className="text-[11px] font-bold text-slate-500 mb-1 z-10">الكمية المتوفرة</span>
                    <div className="flex items-end gap-1.5 z-10 mt-1">
                      <span className="font-black text-2xl tracking-tight text-emerald-600" dir="ltr">{parseFloat(item.quantity).toLocaleString()}</span>
                      <span className="text-xs font-bold text-slate-500 mb-1">{item.unit || 'وحدة'}</span>
                    </div>
                  </div>

                  {/* Unit Price Card */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col relative overflow-hidden group hover:border-blue-200 transition-colors">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -z-0 opacity-50 group-hover:scale-110 transition-transform"></div>
                    <span className="text-[11px] font-bold text-slate-500 mb-1 z-10">سعر الوحدة</span>
                    <div className="flex items-end gap-1.5 z-10 mt-1">
                      <span className="font-black text-2xl tracking-tight text-slate-700" dir="ltr">{parseFloat(item.cost_price).toLocaleString()}</span>
                      <span className="text-[10px] font-black text-slate-400 mb-1.5">ر.ي</span>
                    </div>
                  </div>

                  {/* Total Value Card */}
                  <div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-100 p-4 shadow-sm flex flex-col relative overflow-hidden group hover:border-indigo-200 transition-colors">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-100/50 rounded-bl-full -z-0 group-hover:scale-110 transition-transform"></div>
                    <span className="text-[11px] font-bold text-indigo-800/70 mb-1 z-10">القيمة الإجمالية</span>
                    <div className="flex items-end gap-1.5 z-10 mt-1">
                      <span className="font-black text-2xl tracking-tight text-indigo-700" dir="ltr">{(parseFloat(item.quantity) * parseFloat(item.cost_price)).toLocaleString()}</span>
                      <span className="text-[10px] font-black text-indigo-500 mb-1.5">ر.ي</span>
                    </div>
                    <span className="text-[10px] font-bold text-indigo-400/80 leading-tight mt-1.5 block whitespace-normal z-10">
                      {taffyot(parseFloat(item.quantity) * parseFloat(item.cost_price))}
                    </span>
                  </div>
                </div>
              </div>



              {/* --- Section 4: Description (Only if exists) --- */}
              {item.description && item.description.trim() !== '' && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-2 px-1">
                    <div className="p-1.5 bg-slate-100/80 rounded-lg text-slate-500 shadow-sm"><AlignLeft size={16} /></div>
                    <h3 className="text-sm font-black text-slate-700">الوصف التفصيلي</h3>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm text-sm font-bold text-slate-600 leading-relaxed">
                    {item.description}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: MOVEMENTS */}
          {activeTab === 'movements' && (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-2 px-1">
                <div className="p-1.5 bg-indigo-100/80 rounded-lg text-indigo-600 shadow-sm"><Activity size={16} /></div>
                <h3 className="text-sm font-black text-slate-700">سجل حركات المخزون</h3>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
              {loading ? (
                <div className="p-8 text-center text-slate-400 flex flex-col items-center"><Activity className="animate-spin mb-2" size={24}/> جاري التحميل...</div>
              ) : movements.length === 0 ? (
                <div className="p-8 text-center text-slate-400 flex flex-col items-center"><Package className="mb-2 opacity-20" size={32}/> لا توجد حركات مسجلة</div>
              ) : (
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-right text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-5 py-3.5 text-xs font-black text-slate-500 w-[15%]">نوع الحركة</th>
                        <th className="px-5 py-3.5 text-xs font-black text-slate-500 w-[15%]">نوع الصنف</th>
                        <th className="px-5 py-3.5 text-xs font-black text-slate-500 w-[15%] text-right">الكمية</th>
                        <th className="px-5 py-3.5 text-xs font-black text-slate-500 w-[30%]">الجهة / المورد</th>
                        <th className="px-5 py-3.5 text-xs font-black text-slate-500 w-[15%]">التاريخ</th>
                        <th className="px-5 py-3.5 text-xs font-black text-slate-500 text-center w-[10%]">التفاصيل</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {movements.map(m => (
                        <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                              m.transaction_type === 'in' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100/60' : 'bg-rose-50 text-rose-700 border border-rose-100/60'
                            }`}>
                              {m.transaction_type === 'in' ? <ArrowDownRight size={14}/> : <ArrowUpRight size={14}/>}
                              {m.transaction_type === 'in' ? 'إستلام' : 'صرف'}
                            </span>
                          </td>
                          <td className="px-5 py-4 font-bold text-slate-600">{item.unit || '-'}</td>
                          <td className="px-5 py-4 text-right">
                            <span className={`font-black text-base ${m.transaction_type === 'in' ? 'text-emerald-600' : 'text-rose-600'}`} dir="ltr">
                              {m.transaction_type === 'in' ? '+' : '-'}{parseFloat(m.quantity).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-5 py-4 font-bold text-slate-600 max-w-[200px] truncate" title={m.transaction_type === 'in' ? m.source_entity : m.destination_entity}>
                            {m.transaction_type === 'in' ? m.source_entity : m.destination_entity}
                          </td>
                          <td className="px-5 py-4 align-top">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 w-fit">
                                <Calendar size={13} className="text-slate-400" />
                                <span className="text-xs font-bold text-slate-700" dir="ltr">{new Date(m.created_at).toLocaleDateString('en-GB')}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <button onClick={() => setSelectedTx(m)} className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 p-2 rounded-xl transition-colors border border-indigo-100" title="التفاصيل الكاملة">
                              <FileText size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              </div>
            </div>
          )}

          {/* TAB 3: AUDITS */}
          {activeTab === 'audit' && (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-2 px-1">
                <div className="p-1.5 bg-indigo-100/80 rounded-lg text-indigo-600 shadow-sm"><Clock size={16} /></div>
                <h3 className="text-sm font-black text-slate-700">سجل التعديلات</h3>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
              {loading ? (
                <div className="p-8 text-center text-slate-400 flex flex-col items-center"><Activity className="animate-spin mb-2" size={24}/> جاري التحميل...</div>
              ) : audits.length === 0 ? (
                <div className="p-8 text-center text-slate-400 flex flex-col items-center"><Clock className="mb-2 opacity-20" size={32}/> لا توجد تعديلات مسجلة</div>
              ) : (
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-right text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-5 py-3.5 text-xs font-bold text-slate-500">نوع التعديل</th>
                        <th className="px-5 py-3.5 text-xs font-bold text-slate-500">البيانات السابقة</th>
                        <th className="px-5 py-3.5 text-xs font-bold text-slate-500">البيانات الجديدة</th>
                        <th className="px-5 py-3.5 text-xs font-bold text-slate-500">تاريخ إجراء التعديل</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {audits.flatMap(a => {
                        const changes = typeof a.changes === 'string' ? JSON.parse(a.changes) : (a.changes || {});
                        
                        const translateField = (field) => {
                          const map = {
                            'name': 'اسم الصنف',
                            'unit': 'النوع',
                            'quantity': 'الكمية',
                            'min_quantity': 'الحد الأدنى للتنبيه',
                            'cost_price': 'سعر الوحدة',
                            'description': 'الوصف التفصيلي',
                            'expiry_date': 'تاريخ الانتهاء',
                            'is_active': 'حالة التفعيل',
                          };
                          return map[field] || field;
                        };

                        if (a.action === 'DELETE') {
                          return [(
                            <tr key={`${a.id}-del`} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-5 py-4">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100/60">
                                  <Trash2 size={14}/> حذف الصنف
                                </span>
                              </td>
                              <td className="px-5 py-4 font-bold text-slate-400">—</td>
                              <td className="px-5 py-4 font-bold text-rose-600">تم حذف الصنف من النظام</td>
                              <td className="px-5 py-4 align-top">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 w-fit">
                                    <Calendar size={13} className="text-slate-400" />
                                    <span className="text-xs font-bold text-slate-700" dir="ltr">{new Date(a.created_at).toLocaleDateString('en-GB')} {new Date(a.created_at).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'})}</span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )];
                        }

                        // UPDATE
                        return Object.entries(changes).map(([k, v]) => {
                          const isPrice = k === 'cost_price';
                          
                          const formatVal = (val, isOld) => {
                            if (!val && val !== 0) return 'فارغ';
                            if (isPrice) {
                              const parsed = parseInt(val, 10) || 0;
                              return (
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1.5">
                                    <span dir="ltr" className={`text-base font-black ${isOld ? 'line-through decoration-rose-300' : ''}`}>{parsed.toLocaleString('en-US')}</span>
                                    <span className="text-[10px] font-bold opacity-70">ر.ي</span>
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-400 leading-tight">{taffyot(parsed)}</span>
                                </div>
                              );
                            }
                            return <span className={isOld ? 'line-through decoration-rose-300' : ''}>{val}</span>;
                          };

                          return (
                            <tr key={`${a.id}-${k}`} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-5 py-4 align-top">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100/60">
                                  <Edit2 size={14}/> تعديل {translateField(k)}
                                </span>
                              </td>
                              <td className="px-5 py-4 font-black text-rose-500 align-top max-w-[200px] whitespace-pre-wrap break-words">
                                {formatVal(v.old, true)}
                              </td>
                              <td className="px-5 py-4 font-black text-emerald-600 align-top max-w-[200px] whitespace-pre-wrap break-words">
                                {formatVal(v.new, false)}
                              </td>
                              <td className="px-5 py-4 align-top">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 w-fit">
                                    <Calendar size={13} className="text-slate-400" />
                                    <span className="text-xs font-bold text-slate-700" dir="ltr">{new Date(a.created_at).toLocaleDateString('en-GB')} {new Date(a.created_at).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'})}</span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              </div>
            </div>
          )}
          
        </div>
      </div>

      {selectedTx && (
        <TransactionDetailsModal
          isOpen={true}
          transaction={selectedTx}
          onClose={() => setSelectedTx(null)}
          token={token}
        />
      )}

      <ConfirmDeleteModal 
        isOpen={deleteModal.isOpen}
        loading={deleteModal.loading}
        itemName={item.name}
        onClose={() => setDeleteModal({ isOpen: false, loading: false })}
        onConfirm={confirmDelete}
      />
    </div>,
    document.body
  );
};

export default ItemDetailsModal;

export const ItemEditModal = ({ item, items, onClose, onSaved, token, storeType = 'general' }) => {
  const [form, setForm] = useState(item || {
    name: '', description: '', unit: '', min_quantity: 10, cost_price: 0, expiry_date: '', is_manufactured: false
  });
  const [saving, setSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const descRef = useRef(null);

  const isDuplicate = items?.some(i => 
    i.name.trim().toLowerCase() === form.name.trim().toLowerCase() && 
    (i.unit || '').trim().toLowerCase() === (form.unit || '').trim().toLowerCase() && 
    i.id !== item?.id
  );

  const uniqueUnits = useMemo(() => {
    if (!items) return [];
    return [...new Set(items.map(i => i.unit).filter(Boolean))];
  }, [items]);

  useEffect(() => {
    if (descRef.current) {
      descRef.current.style.height = 'auto';
      const scrollHeight = descRef.current.scrollHeight;
      descRef.current.style.height = Math.max(38, scrollHeight) + 'px';
    }
  }, [form.description]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const basePath = storeType === 'or' ? '/api/inventory/or/items' : '/api/inventory/general/items';
      const url = item 
        ? `${basePath}/${item.id}`
        : `${basePath}`;
      const method = item ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        onSaved();
      } else {
        toast.error(data.message);
      }
    } catch {
      toast.error('تعذر حفظ بيانات الصنف، يرجى التحقق من الاتصال بالخادم.', { toastId: 'item-save-error' });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
      <div className="absolute inset-0" onClick={onClose} />
      <div className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] ${
        isFullscreen
          ? 'w-[98vw] h-[98vh] rounded-[2.5rem] border border-white'
          : 'w-full max-w-4xl h-auto max-h-[90vh] rounded-[2rem] border border-white/60'
      }`}>
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between bg-white border-b border-slate-100 z-20 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner ${
                item ? 'bg-gradient-to-br from-amber-50 to-amber-100 text-amber-600 border border-amber-200/50' : 'bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600 border border-emerald-200/50'
              }`}>
              {item ? <Edit3 size={20} /> : <PackagePlus size={20} />}
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 tracking-tight">{item ? 'تعديل بيانات الصنف' : 'إضافة صنف جديد'}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                 <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${item ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                   {item ? 'وضع التعديل' : 'وضع الإضافة'}
                 </span>
                 <p className="text-[11px] font-bold text-slate-500">إدارة المخزون العام</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setIsFullscreen(f => !f)} className="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-lg transition-all border border-slate-200 shadow-sm">
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100 rounded-lg transition-all border border-slate-200 shadow-sm">
              <X size={16} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar flex flex-col items-center">
          <div className={`w-full space-y-6 pb-2 transition-all duration-300 ${isFullscreen ? 'max-w-7xl' : 'max-w-4xl'}`}>
            
            {/* Section 1: Item Identity */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div className="p-1.5 bg-indigo-100/80 rounded-lg text-indigo-600 shadow-sm"><Info size={16} /></div>
                <h3 className="text-sm font-black text-slate-700">بيانات الصنف الأساسية</h3>
              </div>
              
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-4 lg:p-5">
                
                <datalist id="units-datalist">
                  {uniqueUnits.map((u, idx) => <option key={idx} value={u} />)}
                </datalist>

                <div className="flex flex-col gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 items-start">
                    <div className="w-full">
                      <label htmlFor="item_name" className="block text-[11px] font-bold text-slate-500 mb-1.5 px-1">اسم الصنف <span className="text-red-500">*</span></label>
                      <input id="item_name" required value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                        className={`w-full bg-white border ${isDuplicate ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500'} rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 transition-all h-[38px]`} 
                        placeholder="اسم الصنف (علمي / تجاري)" />
                      {isDuplicate && <p className="text-red-500 text-[10px] mt-1.5 font-bold flex items-center gap-1 px-1"><AlertCircle size={10} /> الصنف بنفس نوع الوحدة موجود مسبقاً</p>}
                    </div>

                    <div className="w-full">
                      <label htmlFor="item_unit" className="block text-[11px] font-bold text-slate-500 mb-1.5 px-1">نوع الصنف <span className="text-red-500">*</span></label>
                      <input id="item_unit" list="units-datalist" required value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all h-[38px]" 
                        placeholder="ابحث أو اضف نوع (علبة، قطعة...)" />
                    </div>
                  </div>

                  <div className="w-full">
                    <label htmlFor="item_desc" className="block text-[11px] font-bold text-slate-500 mb-1.5 px-1">الوصف</label>
                    <textarea id="item_desc" ref={descRef} rows={2} value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all custom-scrollbar resize-none min-h-[50px]" 
                      placeholder="وصف إضافي أو تركيز الدواء..." />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Inventory & Pricing */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div className="p-1.5 bg-amber-100/80 rounded-lg text-amber-600 shadow-sm"><Package size={16} /></div>
                <h3 className="text-sm font-black text-slate-700">المخزون والتسعير</h3>
              </div>
              
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-4 lg:p-5">

                <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6 items-end bg-slate-50/50 p-4 rounded-2xl border border-slate-100 ${storeType === 'or' ? 'md:grid-cols-4' : ''}`}>
                  <div className="w-full">
                    <label htmlFor="item_price" className="block text-[11px] font-bold text-slate-500 mb-1.5 px-1">سعر الوحدة <span className="text-red-500">*</span></label>
                    <div className="relative flex items-center h-[38px] bg-white border border-slate-200 rounded-xl overflow-hidden focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all shadow-sm group">
                      <button type="button" tabIndex="-1" onClick={() => setForm({...form, cost_price: Math.max(0, parseInt(form.cost_price || 0) - 1)})} className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors shrink-0">
                        <Minus size={14} strokeWidth={3} />
                      </button>
                      <div className="flex-1 relative flex items-center justify-center h-full">
                        <input id="item_price" required type="text" inputMode="numeric" dir="ltr" value={form.cost_price ? Number(form.cost_price).toLocaleString('en-US') : ''} onChange={e => { const val = e.target.value.replace(/[^0-9]/g, ''); setForm({...form, cost_price: val}); }} className="w-full h-full bg-transparent text-xs font-black text-slate-700 text-center focus:outline-none" placeholder="0" />
                        <span className="absolute left-1 sm:left-2 text-[10px] font-black text-slate-400 pointer-events-none">ر.ي</span>
                      </div>
                      <button type="button" tabIndex="-1" onClick={() => setForm({...form, cost_price: parseInt(form.cost_price || 0) + 1})} className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors shrink-0">
                        <Plus size={14} strokeWidth={3} />
                      </button>
                    </div>
                  </div>

                  <div className="w-full">
                    <label htmlFor="item_min" className="block text-[11px] font-bold text-slate-500 mb-1.5 px-1">الحد الأدنى للتنبيه <span className="text-red-500">*</span></label>
                    <div className="relative flex items-center h-[38px] bg-white border border-slate-200 rounded-xl overflow-hidden focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all shadow-sm group">
                      <button type="button" tabIndex="-1" onClick={() => setForm({...form, min_quantity: Math.max(0, parseInt(form.min_quantity || 0) - 1)})} className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                        <Minus size={14} strokeWidth={3} />
                      </button>
                      <input id="item_min" required type="text" inputMode="numeric" dir="ltr" value={form.min_quantity ? Number(form.min_quantity).toLocaleString('en-US') : ''} onChange={e => { const val = e.target.value.replace(/[^0-9]/g, ''); setForm({...form, min_quantity: val}); }} className="flex-1 w-full min-w-0 bg-transparent text-xs font-black text-slate-700 text-center focus:outline-none" placeholder="0" />
                      <button type="button" tabIndex="-1" onClick={() => setForm({...form, min_quantity: parseInt(form.min_quantity || 0) + 1})} className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                        <Plus size={14} strokeWidth={3} />
                      </button>
                    </div>
                  </div>

                  <div className="w-full">
                    <label htmlFor="item_expiry" className="block text-[11px] font-bold text-slate-500 mb-1.5 px-1">تاريخ الانتهاء (اختياري)</label>
                    <input id="item_expiry" type="date" value={form.expiry_date ? form.expiry_date.split('T')[0] : ''} onChange={e => setForm({...form, expiry_date: e.target.value})}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all h-[38px] cursor-pointer" dir="ltr" />
                  </div>
                </div>

                {storeType === 'or' && (
                  <div className="mt-4 flex items-center gap-2 px-1">
                    <input type="checkbox" id="is_manufactured" checked={form.is_manufactured} onChange={e => setForm({...form, is_manufactured: e.target.checked})} className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer" />
                    <label htmlFor="is_manufactured" className="text-xs font-bold text-slate-700 cursor-pointer">مادة محولة/مصنعة</label>
                  </div>
                )}

                {/* Horizontal Footer for Total - Only shown on Edit when quantity > 0 */}
                {item && parseFloat(item.quantity || 0) > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 bg-gradient-to-l from-emerald-50 to-teal-50/50 border border-emerald-100/60 rounded-2xl mt-6 shadow-sm gap-4">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-50 shrink-0">
                        <Activity size={18} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-emerald-900">تقييم المخزون الحالي</h4>
                        <p className="text-[10px] font-bold text-emerald-600/80 mt-0.5">
                          الكمية المتوفرة: <span className="font-black text-emerald-700 mx-0.5" dir="ltr">{parseFloat(item.quantity).toLocaleString('en-US')}</span> {form.unit || 'وحدة'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:items-end justify-center bg-white px-4 py-2 rounded-xl shadow-sm border border-emerald-100/50 w-full sm:w-auto shrink-0">
                      <div className="flex items-center justify-between sm:justify-end gap-3 w-full">
                        <span className="text-[10px] font-bold text-emerald-600/70">القيمة الإجمالية:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-lg font-black tracking-tight text-emerald-700" dir="ltr">
                            {(parseInt(form.cost_price || 0) * parseFloat(item.quantity || 0)).toLocaleString('en-US')}
                          </span>
                          <span className="text-xs font-black text-emerald-600">ر.ي</span>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 leading-tight mt-0.5 text-right w-full block whitespace-normal">
                        {taffyot(parseInt(form.cost_price || 0) * parseFloat(item.quantity || 0))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={onClose} 
                className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 rounded-xl text-xs font-black transition-colors shadow-sm">
                إلغاء
              </button>
              <button type="submit" disabled={saving || isDuplicate} 
                className="px-6 py-2.5 bg-emerald-600 border border-emerald-600 text-white hover:bg-emerald-700 hover:border-emerald-700 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                {saving ? <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"/> : <Check size={16}/>}
                حفظ البيانات
              </button>
            </div>
            
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};



const ItemModal = ({ item, items, onClose, onSaved, token }) => {
  const [form, setForm] = useState(item || {
    name: '', description: '', unit: '', min_quantity: 10, cost_price: 0, expiry_date: ''
  });
  const [saving, setSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const descRef = useRef(null);

  const isDuplicate = items?.some(i => 
    i.name.trim().toLowerCase() === form.name.trim().toLowerCase() && 
    (i.unit || '').trim().toLowerCase() === (form.unit || '').trim().toLowerCase() && 
    i.id !== item?.id
  );

  const uniqueUnits = useMemo(() => {
    if (!items) return [];
    return [...new Set(items.map(i => i.unit).filter(Boolean))];
  }, [items]);

  useEffect(() => {
    if (descRef.current) {
      descRef.current.style.height = 'auto';
      const scrollHeight = descRef.current.scrollHeight;
      descRef.current.style.height = Math.max(38, scrollHeight) + 'px';
    }
  }, [form.description]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = item 
        ? `/api/inventory/general/items/${item.id}`
        : `/api/inventory/general/items`;
      const method = item ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        onSaved();
      } else {
        toast.error(data.message);
      }
    } catch {
      toast.error('تعذر الاتصال بالخادم');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/50 backdrop-blur-md animate-in fade-in duration-300" dir="rtl">
      <div className="absolute inset-0" onClick={onClose} />
      <div className={`relative z-10 bg-[#f8fafc] flex flex-col overflow-hidden transition-all duration-500 animate-in zoom-in-95 shadow-[0_20px_50px_rgba(0,0,0,0.1)] ${
        isFullscreen
          ? 'w-[98vw] h-[98vh] rounded-[2.5rem] border border-white'
          : 'w-full max-w-4xl h-auto max-h-[90vh] rounded-[2rem] border border-white/60'
      }`}>
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between bg-white border-b border-slate-100 z-20 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner ${
                item ? 'bg-gradient-to-br from-amber-50 to-amber-100 text-amber-600 border border-amber-200/50' : 'bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600 border border-emerald-200/50'
              }`}>
              {item ? <Edit3 size={20} /> : <PackagePlus size={20} />}
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 tracking-tight">{item ? 'تعديل بيانات الصنف' : 'إضافة صنف جديد'}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                 <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${item ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                   {item ? 'وضع التعديل' : 'وضع الإضافة'}
                 </span>
                 <p className="text-[11px] font-bold text-slate-500">إدارة المخزون العام</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setIsFullscreen(f => !f)} className="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-lg transition-all border border-slate-200 shadow-sm">
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100 rounded-lg transition-all border border-slate-200 shadow-sm">
              <X size={16} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar flex flex-col items-center">
          <div className={`w-full space-y-6 pb-2 transition-all duration-300 ${isFullscreen ? 'max-w-7xl' : 'max-w-4xl'}`}>
            
            {/* Section 1: Item Identity */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div className="p-1.5 bg-indigo-100/80 rounded-lg text-indigo-600 shadow-sm"><Info size={16} /></div>
                <h3 className="text-sm font-black text-slate-700">بيانات الصنف الأساسية</h3>
              </div>
              
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-4 lg:p-5">
                
                <datalist id="units-datalist">
                  {uniqueUnits.map((u, idx) => <option key={idx} value={u} />)}
                </datalist>

                <div className="flex flex-col gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 items-start">
                    <div className="w-full">
                      <label htmlFor="item_name" className="block text-[11px] font-bold text-slate-500 mb-1.5 px-1">اسم الصنف <span className="text-red-500">*</span></label>
                      <input id="item_name" required value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                        className={`w-full bg-white border ${isDuplicate ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500'} rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 transition-all h-[38px]`} 
                        placeholder="اسم الصنف (علمي / تجاري)" />
                      {isDuplicate && <p className="text-red-500 text-[10px] mt-1.5 font-bold flex items-center gap-1 px-1"><AlertCircle size={10} /> الصنف بنفس نوع الوحدة موجود مسبقاً</p>}
                    </div>

                    <div className="w-full">
                      <label htmlFor="item_unit" className="block text-[11px] font-bold text-slate-500 mb-1.5 px-1">نوع الصنف <span className="text-red-500">*</span></label>
                      <input id="item_unit" list="units-datalist" required value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all h-[38px]" 
                        placeholder="ابحث أو اضف نوع (علبة، قطعة...)" />
                    </div>
                  </div>

                  <div className="w-full">
                    <label htmlFor="item_desc" className="block text-[11px] font-bold text-slate-500 mb-1.5 px-1">الوصف</label>
                    <textarea id="item_desc" ref={descRef} rows={2} value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all custom-scrollbar resize-none min-h-[50px]" 
                      placeholder="وصف إضافي أو تركيز الدواء..." />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Inventory & Pricing */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div className="p-1.5 bg-amber-100/80 rounded-lg text-amber-600 shadow-sm"><Package size={16} /></div>
                <h3 className="text-sm font-black text-slate-700">المخزون والتسعير</h3>
              </div>
              
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-4 lg:p-5">

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6 items-end bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                  <div className="w-full">
                    <label htmlFor="item_price" className="block text-[11px] font-bold text-slate-500 mb-1.5 px-1">سعر الوحدة <span className="text-red-500">*</span></label>
                    <div className="relative flex items-center h-[38px] bg-white border border-slate-200 rounded-xl overflow-hidden focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all shadow-sm group">
                      <button type="button" tabIndex="-1" onClick={() => setForm({...form, cost_price: Math.max(0, parseInt(form.cost_price || 0) - 1)})} className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors shrink-0">
                        <Minus size={14} strokeWidth={3} />
                      </button>
                      <div className="flex-1 relative flex items-center justify-center h-full">
                        <input id="item_price" required type="text" inputMode="numeric" dir="ltr" value={form.cost_price ? Number(form.cost_price).toLocaleString('en-US') : ''} onChange={e => { const val = e.target.value.replace(/[^0-9]/g, ''); setForm({...form, cost_price: val}); }} className="w-full h-full bg-transparent text-xs font-black text-slate-700 text-center focus:outline-none" placeholder="0" />
                        <span className="absolute left-1 sm:left-2 text-[10px] font-black text-slate-400 pointer-events-none">ر.ي</span>
                      </div>
                      <button type="button" tabIndex="-1" onClick={() => setForm({...form, cost_price: parseInt(form.cost_price || 0) + 1})} className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors shrink-0">
                        <Plus size={14} strokeWidth={3} />
                      </button>
                    </div>
                  </div>

                  <div className="w-full">
                    <label htmlFor="item_min" className="block text-[11px] font-bold text-slate-500 mb-1.5 px-1">الحد الأدنى للتنبيه <span className="text-red-500">*</span></label>
                    <div className="relative flex items-center h-[38px] bg-white border border-slate-200 rounded-xl overflow-hidden focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all shadow-sm group">
                      <button type="button" tabIndex="-1" onClick={() => setForm({...form, min_quantity: Math.max(0, parseInt(form.min_quantity || 0) - 1)})} className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                        <Minus size={14} strokeWidth={3} />
                      </button>
                      <input id="item_min" required type="text" inputMode="numeric" dir="ltr" value={form.min_quantity ? Number(form.min_quantity).toLocaleString('en-US') : ''} onChange={e => { const val = e.target.value.replace(/[^0-9]/g, ''); setForm({...form, min_quantity: val}); }} className="flex-1 w-full min-w-0 bg-transparent text-xs font-black text-slate-700 text-center focus:outline-none" placeholder="0" />
                      <button type="button" tabIndex="-1" onClick={() => setForm({...form, min_quantity: parseInt(form.min_quantity || 0) + 1})} className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                        <Plus size={14} strokeWidth={3} />
                      </button>
                    </div>
                  </div>

                  <div className="w-full">
                    <label htmlFor="item_expiry" className="block text-[11px] font-bold text-slate-500 mb-1.5 px-1">تاريخ الانتهاء (اختياري)</label>
                    <input id="item_expiry" type="date" value={form.expiry_date ? form.expiry_date.split('T')[0] : ''} onChange={e => setForm({...form, expiry_date: e.target.value})}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all h-[38px] cursor-pointer" dir="ltr" />
                  </div>
                </div>

                {/* Horizontal Footer for Total - Only shown on Edit when quantity > 0 */}
                {item && parseFloat(item.quantity || 0) > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 bg-gradient-to-l from-emerald-50 to-teal-50/50 border border-emerald-100/60 rounded-2xl mt-6 shadow-sm gap-4">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-50 shrink-0">
                        <Activity size={18} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-emerald-900">تقييم المخزون الحالي</h4>
                        <p className="text-[10px] font-bold text-emerald-600/80 mt-0.5">
                          الكمية المتوفرة: <span className="font-black text-emerald-700 mx-0.5" dir="ltr">{parseFloat(item.quantity).toLocaleString('en-US')}</span> {form.unit || 'وحدة'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:items-end justify-center bg-white px-4 py-2 rounded-xl shadow-sm border border-emerald-100/50 w-full sm:w-auto shrink-0">
                      <div className="flex items-center justify-between sm:justify-end gap-3 w-full">
                        <span className="text-[10px] font-bold text-emerald-600/70">القيمة الإجمالية:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-lg font-black tracking-tight text-emerald-700" dir="ltr">
                            {(parseInt(form.cost_price || 0) * parseFloat(item.quantity || 0)).toLocaleString('en-US')}
                          </span>
                          <span className="text-xs font-black text-emerald-600">ر.ي</span>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 leading-tight mt-0.5 text-right w-full block whitespace-normal">
                        {taffyot(parseInt(form.cost_price || 0) * parseFloat(item.quantity || 0))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={onClose} 
                className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 rounded-xl text-xs font-black transition-colors shadow-sm">
                إلغاء
              </button>
              <button type="submit" disabled={saving || isDuplicate} 
                className="px-6 py-2.5 bg-emerald-600 border border-emerald-600 text-white hover:bg-emerald-700 hover:border-emerald-700 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                {saving ? <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"/> : <Check size={16}/>}
                حفظ البيانات
              </button>
            </div>
            
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export { ItemModal };
