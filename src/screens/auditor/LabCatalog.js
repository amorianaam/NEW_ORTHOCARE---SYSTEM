import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { FlaskConical, Plus, Search, Edit2, Trash2, X, Folder, RefreshCcw, Link2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '../../store/useAuthStore';
import { LabTestConsumablesModal } from './LabInventoryAdmin';
import { formatLabConsumableRate } from '../../utils/arabicFormatters';

export default function LabCatalog() {
  const { token } = useAuthStore();
  const headers = { Authorization: `Bearer ${token}` };
  const [categories, setCategories] = useState([]);
  const [tests, setTests] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [consumablesByTest, setConsumablesByTest] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('tests');

  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  // BOM Recipe Manager Modal State
  const [bomModalOpen, setBomModalOpen] = useState(false);
  const [bomTargetTest, setBomTargetTest] = useState(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [catsRes, testsRes, invRes, bomRes] = await Promise.all([
        axios.get('/api/admin/catalog/lab-categories', { headers }),
        axios.get('/api/admin/catalog/lab-tests', { headers }),
        axios.get('/api/lab/inventory/items?includeInactive=true', { headers }).catch(() => ({ data: { items: [] } })),
        axios.get('/api/lab/inventory/test-consumables', { headers }).catch(() => ({ data: { consumables: [] } }))
      ]);
      setCategories(Array.isArray(catsRes.data) ? catsRes.data : []);
      setTests(Array.isArray(testsRes.data) ? testsRes.data : []);
      setInventoryItems(invRes.data?.items || []);

      const map = {};
      (bomRes.data?.consumables || []).forEach((c) => {
        if (!map[c.lab_test_id]) map[c.lab_test_id] = [];
        map[c.lab_test_id].push(c);
      });
      setConsumablesByTest(map);
    } catch (err) { toast.error('خطأ في جلب البيانات'); }
    finally { setLoading(false); }
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!formData.name) return toast.warning('الاسم مطلوب');
    setSaving(true);
    try {
      if (editItem) {
        await axios.put(`/api/admin/catalog/lab-categories/${editItem.id}`, formData, { headers });
        toast.success('تم التحديث');
      } else {
        await axios.post('/api/admin/catalog/lab-categories', formData, { headers });
        toast.success('تمت الإضافة');
      }
      setIsCatModalOpen(false);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'خطأ في الحفظ'); }
    finally { setSaving(false); }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا القسم؟ سيتم إلغاء ربط التحاليل به.')) return;
    try {
      await axios.delete(`/api/admin/catalog/lab-categories/${id}`, { headers });
      toast.success('تم الحذف');
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'خطأ في الحذف'); }
  };

  const handleSaveTest = async (e) => {
    e.preventDefault();
    if (!formData.name || formData.price === undefined || formData.price === '') return toast.warning('الاسم والسعر مطلوبان');
    setSaving(true);
    try {
      if (editItem) {
        await axios.put(`/api/admin/catalog/lab-tests/${editItem.id}`, formData, { headers });
        toast.success('تم التحديث');
      } else {
        await axios.post('/api/admin/catalog/lab-tests', formData, { headers });
        toast.success('تمت الإضافة');
      }
      setIsTestModalOpen(false);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'خطأ في الحفظ'); }
    finally { setSaving(false); }
  };

  const handleDeleteTest = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا التحليل؟')) return;
    try {
      await axios.delete(`/api/admin/catalog/lab-tests/${id}`, { headers });
      toast.success('تم الحذف');
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'خطأ في الحذف'); }
  };

  const filteredTests = useMemo(() => {
    if (!searchTerm) return tests;
    return tests.filter(t =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.category_name && t.category_name.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [tests, searchTerm]);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FlaskConical className="text-blue-600" /> كتالوج التحاليل المخبرية
          </h1>
          <p className="text-sm text-gray-500 mt-1">إدارة أقسام وأسعار التحاليل المخبرية وربطها بمستهلكات المخزن (BOM)</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button onClick={() => setActiveTab('tests')} className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'tests' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>التحاليل</button>
            <button onClick={() => setActiveTab('categories')} className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'categories' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>الأقسام</button>
          </div>
          <button onClick={fetchData} className="p-2 bg-gray-100 rounded-xl text-gray-600 hover:bg-gray-200 transition-colors"><RefreshCcw size={18}/></button>
        </div>
      </div>

      {activeTab === 'tests' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex gap-4">
            <div className="relative flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-2">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input type="text" placeholder="بحث في التحاليل..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-transparent border-none focus:ring-0 pr-10 text-sm font-semibold text-gray-700" />
            </div>
            <button onClick={() => { setEditItem(null); setFormData({ category_id: '', name: '', price: '', is_active: true }); setIsTestModalOpen(true); }} className="btn-primary bg-blue-600 hover:bg-blue-700 border-none flex items-center gap-2 shadow-sm whitespace-nowrap">
              <Plus size={18} /> إضافة تحليل
            </button>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="w-full overflow-x-auto">
              <table className="w-full text-right table-fixed min-w-[820px]">
                <thead className="bg-gray-50/50 border-b border-gray-100">
                  <tr>
                    <th style={{ width: '16%' }} className="w-[16%] px-6 py-4 text-sm font-bold text-gray-700">القسم</th>
                    <th style={{ width: '26%' }} className="w-[26%] px-6 py-4 text-sm font-bold text-gray-700">اسم التحليل</th>
                    <th style={{ width: '14%' }} className="w-[14%] px-4 py-4 text-sm font-bold text-gray-700">السعر (ريال يمني)</th>
                    <th style={{ width: '32%' }} className="w-[32%] px-4 py-4 text-sm font-bold text-gray-700">المستهلكات المرتبطة</th>
                    <th style={{ width: '12%' }} className="w-[12%] px-4 py-4 text-sm font-bold text-gray-700 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan="5" className="p-8 text-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div></td></tr>
                  ) : filteredTests.length === 0 ? (
                    <tr><td colSpan="5" className="p-8 text-center text-gray-500 font-semibold">لا يوجد تحاليل</td></tr>
                  ) : (
                    filteredTests.map(item => {
                      const linkedConsumables = consumablesByTest[item.id] || [];
                      return (
                        <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                          <td className="w-[16%] px-6 py-4 text-sm text-gray-500 font-semibold truncate">{item.category_name || 'بدون قسم'}</td>
                          <td className="w-[26%] px-6 py-4 font-bold text-gray-800 truncate" title={item.name}>{item.name}</td>
                          <td className="w-[14%] px-4 py-4 font-bold text-blue-700 font-mono" dir="ltr">{Number(item.price || 0).toLocaleString()}</td>
                          <td className="w-[32%] px-4 py-4">
                            {linkedConsumables.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setBomTargetTest(item);
                                  setBomModalOpen(true);
                                }}
                                className="group bg-transparent border-0 p-0 text-right flex flex-col items-start gap-1 max-w-full cursor-pointer"
                                title="اضغط لتعديل المستهلكات المرتبطة بهذا التحليل"
                              >
                                {linkedConsumables.map((c) => (
                                  <div
                                    key={c.id || c.lab_item_id}
                                    className="inline-flex flex-wrap items-center gap-1.5 text-xs leading-relaxed max-w-full"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 group-hover:bg-violet-600 shrink-0 transition-colors" />
                                    <span className="font-bold text-gray-800 group-hover:text-violet-700 transition-colors truncate">
                                      {c.item_name}
                                    </span>
                                    <span className="text-gray-500 font-semibold group-hover:text-violet-600/80 transition-colors shrink-0">
                                      {formatLabConsumableRate(c)}
                                    </span>
                                  </div>
                                ))}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setBomTargetTest(item);
                                  setBomModalOpen(true);
                                }}
                                className="bg-transparent border-0 p-0 inline-flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-violet-600 transition-colors cursor-pointer"
                              >
                                <Link2 size={13} className="shrink-0" />
                                <span>ربط مستهلكات +</span>
                              </button>
                            )}
                          </td>
                          <td className="w-[12%] px-4 py-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setBomTargetTest(item);
                                  setBomModalOpen(true);
                                }}
                                className="p-2 rounded-xl bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors cursor-pointer"
                                title="المستهلكات المرتبطة (وصفة الاستهلاك)"
                              >
                                <Link2 size={14} />
                              </button>
                              <button onClick={() => { setEditItem(item); setFormData({ category_id: item.category_id || '', name: item.name, price: item.price, is_active: !!item.is_active }); setIsTestModalOpen(true); }} className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600 transition-colors"><Edit2 size={14}/></button>
                              <button onClick={() => handleDeleteTest(item.id)} className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600 transition-colors"><Trash2 size={14}/></button>
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
        </motion.div>
      )}

      {activeTab === 'categories' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 max-w-3xl mx-auto">
          <div className="flex justify-end">
            <button onClick={() => { setEditItem(null); setFormData({ name: '' }); setIsCatModalOpen(true); }} className="btn-primary bg-blue-600 hover:bg-blue-700 border-none flex items-center gap-2 shadow-sm">
              <Plus size={18}/> إضافة قسم
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? (
              <div className="col-span-full p-8 text-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div></div>
            ) : categories.length === 0 ? (
              <div className="col-span-full p-8 text-center text-gray-500 font-semibold bg-white rounded-2xl border border-gray-100">لا يوجد أقسام</div>
            ) : (
              categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-blue-200 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><Folder size={18}/></div>
                    <div>
                      <span className="font-bold text-gray-800">{cat.name}</span>
                      <p className="text-xs text-gray-400">{tests.filter(t => t.category_id === cat.id).length} تحليل</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditItem(cat); setFormData({ name: cat.name }); setIsCatModalOpen(true); }} className="p-2 text-gray-400 hover:text-blue-600 transition-colors"><Edit2 size={16}/></button>
                    <button onClick={() => handleDeleteCategory(cat.id)} className="p-2 text-gray-400 hover:text-red-600 transition-colors"><Trash2 size={16}/></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}

      {/* Category Modal */}
      <AnimatePresence>
        {isCatModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" dir="rtl">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
              <div className="flex justify-between items-center p-5 border-b border-gray-100">
                <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Folder size={18} className="text-blue-600"/> {editItem ? 'تعديل القسم' : 'إضافة قسم جديد'}</h3>
                <button onClick={() => setIsCatModalOpen(false)} className="text-gray-400 hover:text-red-500"><X size={20}/></button>
              </div>
              <form onSubmit={handleSaveCategory} className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">اسم القسم</label>
                  <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="input-base" autoFocus required/>
                </div>
                <div className="pt-2 flex gap-3">
                  <button type="submit" disabled={saving} className="btn-primary bg-blue-600 hover:bg-blue-700 border-none flex-1">{saving ? 'جاري الحفظ...' : 'حفظ'}</button>
                  <button type="button" onClick={() => setIsCatModalOpen(false)} className="px-4 py-2 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200">إلغاء</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Test Modal */}
      <AnimatePresence>
        {isTestModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" dir="rtl">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
              <div className="flex justify-between items-center p-5 border-b border-gray-100">
                <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2"><FlaskConical size={18} className="text-blue-600"/> {editItem ? 'تعديل التحليل' : 'إضافة تحليل جديد'}</h3>
                <button onClick={() => setIsTestModalOpen(false)} className="text-gray-400 hover:text-red-500"><X size={20}/></button>
              </div>
              <form onSubmit={handleSaveTest} className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">القسم</label>
                  <select value={formData.category_id || ''} onChange={e => setFormData({...formData, category_id: e.target.value})} className="input-base">
                    <option value="">بدون قسم</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">اسم التحليل</label>
                  <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="input-base" required/>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">السعر (ريال يمني)</label>
                  <input type="number" min="0" step="1" value={formData.price || ''} onChange={e => setFormData({...formData, price: e.target.value})} className="input-base" required/>
                </div>
                <div className="pt-2 flex gap-3">
                  <button type="submit" disabled={saving} className="btn-primary bg-blue-600 hover:bg-blue-700 border-none flex-1">{saving ? 'جاري الحفظ...' : 'حفظ'}</button>
                  <button type="button" onClick={() => setIsTestModalOpen(false)} className="px-4 py-2 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200">إلغاء</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* BOM Recipe Manager Modal */}
      <LabTestConsumablesModal
        isOpen={bomModalOpen}
        onClose={() => setBomModalOpen(false)}
        test={bomTargetTest}
        initialTest={bomTargetTest}
        allTests={tests}
        inventoryItems={inventoryItems}
        initialLinks={bomTargetTest ? consumablesByTest[bomTargetTest.id] || [] : []}
        token={token}
        onSaved={fetchData}
      />
    </div>
  );
}
