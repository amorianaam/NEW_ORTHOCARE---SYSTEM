import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Package, Plus, Edit2, Check, X, FlaskConical, Radiation, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '../../store/useAuthStore';

export default function SurgeryPrepCatalog() {
  const { token } = useAuthStore();
  const headers = { Authorization: `Bearer ${token}` };
  const [packages, setPackages] = useState([]);
  const [labTests, setLabTests] = useState([]);
  const [radTests, setRadTests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isPkgModalOpen, setIsPkgModalOpen] = useState(false);
  const [editPkg, setEditPkg] = useState(null);
  const [pkgName, setPkgName] = useState('');
  const [pkgActive, setPkgActive] = useState(true);

  const [expandedPkg, setExpandedPkg] = useState(null);
  
  // Add item state
  const [itemType, setItemType] = useState('lab');
  const [itemId, setItemId] = useState('');

  useEffect(() => {
    fetchData();
    fetchCatalogs();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/admin/catalog/surgery-prep', { headers });
      setPackages(res.data);
    } catch (err) {
      toast.error('خطأ في جلب باقات العمليات');
    } finally {
      setLoading(false);
    }
  };

  const fetchCatalogs = async () => {
    try {
      const [lRes, rRes] = await Promise.all([
        axios.get('/api/catalog/lab', { headers }),
        axios.get('/api/catalog/radiology', { headers })
      ]);
      setLabTests(lRes.data);
      setRadTests(rRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSavePackage = async (e) => {
    e.preventDefault();
    if (!pkgName) return toast.warning('اسم الباقة مطلوب');
    try {
      if (editPkg) {
        await axios.put(`/api/admin/catalog/surgery-prep/${editPkg.id}`, { name: pkgName, is_active: pkgActive }, { headers });
        toast.success('تم التحديث');
      } else {
        await axios.post('/api/admin/catalog/surgery-prep', { name: pkgName }, { headers });
        toast.success('تمت الإضافة');
      }
      setIsPkgModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطأ في الحفظ');
    }
  };

  const handleDeletePackage = async (pkgId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الباقة نهائياً؟')) return;
    try {
      await axios.delete(`/api/admin/catalog/surgery-prep/${pkgId}`, { headers });
      toast.success('تم حذف الباقة بنجاح');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطأ في حذف الباقة');
    }
  };

  const handleAddItem = async (pkgId) => {
    if (!itemId) return toast.warning('يجب اختيار الخدمة أولاً');
    try {
      await axios.post('/api/admin/catalog/surgery-prep-items', {
        package_id: pkgId,
        item_type: itemType,
        item_id: itemId
      }, { headers });
      toast.success('تمت إضافة الخدمة للباقة');
      setItemId('');
      fetchData();
    } catch (err) {
      toast.error('خطأ في الإضافة');
    }
  };

  const handleRemoveItem = async (itemId) => {
    try {
      await axios.delete(`/api/admin/catalog/surgery-prep-items/${itemId}`, { headers });
      toast.success('تم إزالة الخدمة');
      fetchData();
    } catch (err) {
      toast.error('خطأ في الحذف');
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Package className="text-purple-600" />
            باقات تجهيز العمليات
          </h1>
          <p className="text-sm text-gray-500 mt-1">تجهيز باقات مسبقة تحتوي على تحاليل وأشعة تُطلب كحزمة واحدة لتجهيز المريض للعملية</p>
        </div>
        <button 
          onClick={() => { setEditPkg(null); setPkgName(''); setPkgActive(true); setIsPkgModalOpen(true); }}
          className="btn-primary bg-purple-600 hover:bg-purple-700 border-none flex items-center gap-2"
        >
          <Plus size={18} /> إضافة باقة
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div></div>
      ) : packages.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-100">
          <Package className="mx-auto text-gray-300 mb-3" size={48} />
          <h3 className="text-lg font-bold text-gray-700">لا يوجد باقات حالياً</h3>
          <p className="text-gray-500 text-sm mt-1">قم بإضافة باقة جديدة للبدء بتنظيم الخدمات.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {packages.map(pkg => (
            <div key={pkg.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div 
                className="flex items-center justify-between p-4 bg-gray-50/50 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedPkg(expandedPkg === pkg.id ? null : pkg.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pkg.is_active ? 'bg-purple-100 text-purple-600' : 'bg-gray-200 text-gray-500'}`}>
                    <Package size={20} />
                  </div>
                  <div>
                    <h3 className={`font-bold ${pkg.is_active ? 'text-gray-800' : 'text-gray-400'}`}>{pkg.name}</h3>
                    <p className="text-xs text-gray-500">{pkg.items?.length || 0} خدمات مدرجة</p>
                  </div>
                </div>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <button 
                    onClick={() => { setEditPkg(pkg); setPkgName(pkg.name); setPkgActive(!!pkg.is_active); setIsPkgModalOpen(true); }}
                    className="p-2 text-gray-400 hover:text-purple-600 transition-colors rounded-lg hover:bg-purple-50"
                    title="تعديل"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => handleDeletePackage(pkg.id)}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
                    title="حذف"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {expandedPkg === pkg.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="p-4 bg-white space-y-4">
                      {/* Items List */}
                      <div className="space-y-2">
                        {pkg.items?.length === 0 ? (
                          <div className="text-center py-4 text-sm text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                            لا يوجد خدمات في هذه الباقة
                          </div>
                        ) : (
                          pkg.items?.map(item => (
                            <div key={item.id} className="flex items-center justify-between p-2.5 rounded-xl border border-gray-100 bg-white shadow-sm">
                              <div className="flex items-center gap-2">
                                {item.item_type === 'lab' ? <FlaskConical size={16} className="text-blue-500"/> : <Radiation size={16} className="text-rose-500"/>}
                                <span className="text-sm font-bold text-gray-700">{item.item_name}</span>
                              </div>
                              <button onClick={() => handleRemoveItem(item.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 size={15} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Add Item Form */}
                      <div className="pt-3 border-t border-gray-100">
                        <p className="text-xs font-bold text-gray-500 mb-2">إضافة خدمة للباقة</p>
                        <div className="flex gap-2">
                          <select 
                            value={itemType} 
                            onChange={e => { setItemType(e.target.value); setItemId(''); }}
                            className="input-base text-sm py-2 px-2 w-28"
                          >
                            <option value="lab">تحليل</option>
                            <option value="radiology">أشعة</option>
                          </select>
                          
                          <select 
                            value={itemId} 
                            onChange={e => setItemId(e.target.value)}
                            className="input-base text-sm py-2 px-2 flex-1 font-semibold text-gray-700"
                          >
                            <option value="">اختر الخدمة...</option>
                            {itemType === 'lab' 
                              ? labTests.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                              : radTests.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                            }
                          </select>
                          
                          <button 
                            onClick={() => handleAddItem(pkg.id)}
                            disabled={!itemId}
                            className="px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors disabled:opacity-50"
                          >
                            <Plus size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}

      {/* Package Modal */}
      {isPkgModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" dir="rtl">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                <Package size={18} className="text-purple-600" />
                {editPkg ? 'تعديل الباقة' : 'إضافة باقة جديدة'}
              </h3>
              <button onClick={() => setIsPkgModalOpen(false)} className="text-gray-400 hover:text-red-500"><X size={20} /></button>
            </div>
            <form onSubmit={handleSavePackage} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">اسم الباقة</label>
                <input type="text" value={pkgName} onChange={e => setPkgName(e.target.value)} className="input-base" autoFocus required/>
              </div>
              {editPkg && (
                <label className="flex items-center gap-2 cursor-pointer bg-gray-50 p-3 rounded-xl border border-gray-200 mt-2">
                  <input type="checkbox" checked={pkgActive} onChange={e => setPkgActive(e.target.checked)} className="w-4 h-4 accent-purple-600"/>
                  <span className="text-sm font-bold text-gray-700">الباقة نشطة</span>
                </label>
              )}
              <div className="pt-4 flex gap-3">
                <button type="submit" className="btn-primary bg-purple-600 hover:bg-purple-700 border-none flex-1">حفظ</button>
                <button type="button" onClick={() => setIsPkgModalOpen(false)} className="px-4 py-2 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200">إلغاء</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
