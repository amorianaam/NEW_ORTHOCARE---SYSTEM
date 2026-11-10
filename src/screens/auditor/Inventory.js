import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Warehouse, Package, ClipboardList, Info, 
  ChevronLeft, ArrowUpRight, ArrowDownRight, RefreshCw, X
} from 'lucide-react';
import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';

const InventoryReport = () => {
  const { token } = useAuthStore();
  const [storeType, setStoreType] = useState('general'); // 'general' | 'or'
  const [items, setItems] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedItem, setSelectedItem] = useState(null);
  const [itemHistory, setItemHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/inventory?storeType=${storeType}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setItems(data.items);
      setTransfers(data.transfers);
    } catch {
      toast.error('فشل تحميل تقارير المخازن');
    } finally {
      setLoading(false);
    }
  }, [token, storeType]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const viewItemHistory = async (item) => {
    setSelectedItem(item);
    setHistoryLoading(true);
    setItemHistory([]);
    try {
      const res = await fetch(`/api/reports/inventory/item/${item.id}?storeType=${storeType}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setItemHistory(data);
    } catch {
      toast.error('فشل تحميل حركة الصنف المحددة');
    } finally {
      setHistoryLoading(false);
    }
  };

  // KPI aggregates
  const totalItemsCount = items.length;
  const lowStockCount = items.filter(item => parseFloat(item.quantity) <= parseFloat(item.min_quantity)).length;
  const totalInventoryVal = items.reduce((acc, item) => acc + parseFloat(item.quantity) * parseFloat(item.cost_price), 0);

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Warehouse className="text-slate-900" size={28} /> التقرير المخزني المزدوج
          </h1>
          <p className="text-gray-500 mt-1">رقابة شاملة على أرصدة وحركات المخزن العام ومخزن العمليات والتحويلات البينية</p>
        </div>
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          <button 
            onClick={() => setStoreType('general')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              storeType === 'general' ? 'bg-slate-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            المخزن العام
          </button>
          <button 
            onClick={() => setStoreType('or')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              storeType === 'or' ? 'bg-slate-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            مخزن العمليات (OR Store)
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-sm font-bold text-gray-500">إجمالي عدد الأصناف الفريدة</p>
          <p className="text-2xl font-black text-slate-900 mt-2">{totalItemsCount} أصناف</p>
          <p className="text-xs text-gray-400 mt-1">المسجلة في هذا القسم حالياً</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-sm font-bold text-gray-500">أصناف شارفت على النفاد (حرجة)</p>
          <p className={`text-2xl font-black mt-2 ${lowStockCount > 0 ? 'text-red-500 animate-pulse' : 'text-slate-900'}`}>{lowStockCount} أصناف</p>
          <p className="text-xs text-gray-400 mt-1">الرصيد الفعلي أقل من حد الأمان</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-sm font-bold text-gray-500">القيمة المالية الكلية للمخزون</p>
          <p className="text-2xl font-black text-emerald-600 mt-2">{totalInventoryVal.toLocaleString()} YER</p>
          <p className="text-xs text-gray-400 mt-1">إجمالي (الكمية × تكلفة الشراء الكلي)</p>
        </div>
      </div>

      {/* Items List Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Inventory Items */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-800 text-lg">أرصدة الأصناف الحالية</h3>
            <span className="text-xs text-gray-400 font-bold">انقر على الصنف لمتابعة تفاصيل حركة الكرت بالكامل</span>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-6 py-3 font-bold">اسم الصنف العلمي</th>
                  <th className="px-6 py-3 font-bold">الرصيد الفعلي</th>
                  <th className="px-6 py-3 font-bold">سعر الشراء</th>
                  <th className="px-6 py-3 font-bold">حد الأمان</th>
                  <th className="px-6 py-3 font-bold">تتبع الكرت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-400 animate-pulse">جاري التحميل...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-400">لا توجد أصناف مسجلة</td></tr>
                ) : (
                  items.map(item => {
                    const isLow = parseFloat(item.quantity) <= parseFloat(item.min_quantity);
                    return (
                      <tr 
                        key={item.id} 
                        onClick={() => viewItemHistory(item)}
                        className={`hover:bg-gray-50/70 cursor-pointer ${isLow ? 'bg-red-50/20' : ''}`}
                      >
                        <td className="px-6 py-4 font-bold text-slate-800">{item.name}</td>
                        <td className={`px-6 py-4 font-black ${isLow ? 'text-red-600' : 'text-slate-700'}`}>
                          {parseFloat(item.quantity).toLocaleString()} {item.unit}
                          {isLow && <span className="mr-2 text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded">شبه نافد</span>}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{parseFloat(item.cost_price).toLocaleString()} YER</td>
                        <td className="px-6 py-4 text-gray-400">{item.min_quantity} {item.unit}</td>
                        <td className="px-6 py-4">
                          <ChevronLeft size={16} className="text-gray-300" />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Transfers Log */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-gray-800 text-lg mb-4 flex items-center gap-2 border-b border-gray-50 pb-2">
              <ClipboardList size={18} className="text-purple-600" /> آخر 20 قيد تحويل مخزني
            </h3>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
              {loading ? (
                <div className="text-center py-8 text-gray-400 animate-pulse">جاري التحميل...</div>
              ) : transfers.length === 0 ? (
                <div className="text-center py-8 text-gray-400">لا توجد عمليات تحويل مسجلة</div>
              ) : (
                transfers.map(tr => (
                  <div key={tr.id} className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-xs">
                    <div className="flex justify-between items-center mb-2">
                      <span className={`px-2 py-0.5 font-bold rounded-lg ${
                        tr.status === 'received' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {tr.status === 'received' ? 'مكتمل الاستلام' : 'معلق بقيد الانتظار'}
                      </span>
                      <span className="text-gray-400 font-semibold">{new Date(tr.sent_at).toLocaleDateString('ar-EG')}</span>
                    </div>
                    <p className="font-bold text-gray-800 mb-1">الكمية المحولة: {tr.sent_quantity}</p>
                    <p className="text-gray-500">
                      <strong>المرسل:</strong> {tr.sender_name || 'مسؤول المخزن العام'} <br />
                      <strong>المستلم:</strong> {tr.receiver_name || 'مسؤول مخزن العمليات'}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Item History Modal */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-900 text-white">
                <div>
                  <h3 className="font-bold text-lg">سجل حركة صنف: {selectedItem.name}</h3>
                  <p className="text-xs text-slate-300 mt-1">الرصيد الفعلي: {selectedItem.quantity} {selectedItem.unit}</p>
                </div>
                <button onClick={() => setSelectedItem(null)} className="p-1 rounded-lg hover:bg-white/10 text-white/80">
                  <X size={20} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto space-y-4 flex-1 text-right" dir="rtl">
                {historyLoading ? (
                  <div className="h-40 flex items-center justify-center text-gray-400 animate-pulse font-bold">جاري تحميل سجل الكرت...</div>
                ) : itemHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 font-bold">لم تُسجل حركات سابقة على هذا الصنف بعد.</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="py-2 px-3 text-right font-bold">التاريخ</th>
                        <th className="py-2 px-3 text-right font-bold">الحركة</th>
                        <th className="py-2 px-3 text-right font-bold">الكمية</th>
                        <th className="py-2 px-3 text-right font-bold">سعر الوحدة</th>
                        <th className="py-2 px-3 text-right font-bold">المسؤول</th>
                        <th className="py-2 px-3 text-right font-bold">ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {itemHistory.map(row => (
                        <tr key={row.id}>
                          <td className="py-2.5 px-3 text-gray-500">{new Date(row.created_at).toLocaleString('ar-EG')}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-lg font-bold ${
                              row.transaction_type === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                            }`}>
                              {row.transaction_type === 'in' ? 'وارد' : 'صادر'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-800">{row.quantity}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-700">{parseFloat(row.unit_price || 0).toLocaleString()} YER</td>
                          <td className="py-2.5 px-3 text-gray-500">{row.performed_by_name || 'تلقائي'}</td>
                          <td className="py-2.5 px-3 text-gray-400 italic max-w-xs truncate" title={row.notes}>{row.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default InventoryReport;
