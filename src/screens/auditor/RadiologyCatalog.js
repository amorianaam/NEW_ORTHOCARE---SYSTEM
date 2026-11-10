import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Radiation, Plus, Search, Edit2, Trash2, Check, X, Folder, RefreshCcw } from 'lucide-react';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '../../store/useAuthStore';

export default function RadiologyCatalog() {
  const { token } = useAuthStore();
  const headers = { Authorization: `Bearer ${token}` };
  const [categories, setCategories] = useState([]);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('tests');

  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [catsRes, testsRes] = await Promise.all([
        axios.get('/api/admin/catalog/radiology-categories', { headers }),
        axios.get('/api/admin/catalog/radiology-tests', { headers })
      ]);
      setCategories(Array.isArray(catsRes.data) ? catsRes.data : []);
      setTests(Array.isArray(testsRes.data) ? testsRes.data : []);
    } catch (err) { toast.error('خطأ في جلب البيانات'); }
    finally { setLoading(false); }
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!formData.name) return toast.warning('الاسم مطلوب');
    setSaving(true);
    try {
      if (editItem) {
        await axios.put(`/api/admin/catalog/radiology-categories/${editItem.id}`, formData, { headers });
        toast.success('تم التحديث');
      } else {
        await axios.post('/api/admin/catalog/radiology-categories', formData, { headers });
        toast.success('تمت الإضافة');
      }
      setIsCatModalOpen(false);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'خطأ في الحفظ'); }
    finally { setSaving(false); }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا القسم؟ سيتم إلغاء ربط الفحوصات به.')) return;
    try {
      await axios.delete(`/api/admin/catalog/radiology-categories/${id}`, { headers });
      toast.success('تم الحذف');
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'خطأ في الحذف'); }
  };

  const handleSaveTest = async (e) => {
    e.preventDefault();
    if (!formData.name || formData.price_with_film === undefined || formData.price_with_film === '') return toast.warning('الاسم والسعر مع فيلم مطلوبان');
    setSaving(true);
    const payload = { ...formData, price: formData.price_with_film };
    try {
      if (editItem) {
        await axios.put(`/api/admin/catalog/radiology-tests/${editItem.id}`, payload, { headers });
        toast.success('تم التحديث');
      } else {
        await axios.post('/api/admin/catalog/radiology-tests', payload, { headers });
        toast.success('تمت الإضافة');
      }
      setIsTestModalOpen(false);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'خطأ في الحفظ'); }
    finally { setSaving(false); }
  };

  const handleDeleteTest = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الفحص؟')) return;
    try {
      await axios.delete(`/api/admin/catalog/radiology-tests/${id}`, { headers });
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
            <Radiation className="text-purple-600" /> كتالوج الأشعة التشخيصية
          </h1>
          <p className="text-sm text-gray-500 mt-1">إدارة أقسام وأسعار فحوصات الأشعة التشخيصية</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button onClick={() => setActiveTab('tests')} className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'tests' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>الفحوصات</button>
            <button onClick={() => setActiveTab('categories')} className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'categories' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>الأقسام</button>
          </div>
          <button onClick={fetchData} className="p-2 bg-gray-100 rounded-xl text-gray-600 hover:bg-gray-200 transition-colors"><RefreshCcw size={18}/></button>
        </div>
      </div>

      {activeTab === 'tests' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex gap-4">
            <div className="relative flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-2">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input type="text" placeholder="بحث في فحوصات الأشعة..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-transparent border-none focus:ring-0 pr-10 text-sm font-semibold text-gray-700" />
            </div>
            <button onClick={() => { setEditItem(null); setFormData({ category_id: '', name: '', price_with_film: '', price_without_film: '', is_active: true }); setIsTestModalOpen(true); }} className="btn-primary bg-purple-600 hover:bg-purple-700 border-none flex items-center gap-2 shadow-sm whitespace-nowrap">
              <Plus size={18} /> إضافة فحص
            </button>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-right">
              <thead className="bg-gray-50/50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-sm font-bold text-gray-700">القسم</th>
                  <th className="px-6 py-4 text-sm font-bold text-gray-700">اسم الفحص</th>
                  <th className="px-6 py-4 text-sm font-bold text-gray-700">مع فيلم</th>
                  <th className="px-6 py-4 text-sm font-bold text-gray-700">بدون فيلم</th>
                  <th className="px-6 py-4 text-sm font-bold text-gray-700">الحالة</th>
                  <th className="px-6 py-4 text-sm font-bold text-gray-700 w-28">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan="6" className="p-8 text-center"><div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div></td></tr>
                ) : filteredTests.length === 0 ? (
                  <tr><td colSpan="6" className="p-8 text-center text-gray-500 font-semibold">لا يوجد فحوصات</td></tr>
                ) : (
                  filteredTests.map(item => (
                    <tr key={item.id} className="hover:bg-purple-50/30 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-500 font-semibold">{item.category_name || 'بدون قسم'}</td>
                      <td className="px-6 py-4 font-bold text-gray-800">{item.name}</td>
                      <td className="px-6 py-4 font-bold text-purple-700">{item.price || item.price_with_film}</td>
                      <td className="px-6 py-4 font-bold text-purple-500">{item.price_without_film ?? '—'}</td>
                      <td className="px-6 py-4">
                        {item.is_active ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700"><Check size={12}/> نشط</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-700"><X size={12}/> موقوف</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          <button onClick={() => { setEditItem(item); setFormData({ category_id: item.category_id || '', name: item.name, price_with_film: item.price || item.price_with_film, price_without_film: item.price_without_film ?? '', is_active: !!item.is_active }); setIsTestModalOpen(true); }} className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-purple-100 hover:text-purple-600 transition-colors"><Edit2 size={14}/></button>
                          <button onClick={() => handleDeleteTest(item.id)} className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600 transition-colors"><Trash2 size={14}/></button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {activeTab === 'categories' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 max-w-3xl mx-auto">
          <div className="flex justify-end">
            <button onClick={() => { setEditItem(null); setFormData({ name: '' }); setIsCatModalOpen(true); }} className="btn-primary bg-purple-600 hover:bg-purple-700 border-none flex items-center gap-2 shadow-sm">
              <Plus size={18}/> إضافة قسم
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? (
              <div className="col-span-full p-8 text-center"><div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div></div>
            ) : categories.length === 0 ? (
              <div className="col-span-full p-8 text-center text-gray-500 font-semibold bg-white rounded-2xl border border-gray-100">لا يوجد أقسام</div>
            ) : (
              categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-purple-200 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center"><Folder size={18}/></div>
                    <div>
                      <span className="font-bold text-gray-800">{cat.name}</span>
                      <p className="text-xs text-gray-400">{tests.filter(t => t.category_id === cat.id).length} فحص</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditItem(cat); setFormData({ name: cat.name }); setIsCatModalOpen(true); }} className="p-2 text-gray-400 hover:text-purple-600 transition-colors"><Edit2 size={16}/></button>
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
                <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Folder size={18} className="text-purple-600"/> {editItem ? 'تعديل القسم' : 'إضافة قسم جديد'}</h3>
                <button onClick={() => setIsCatModalOpen(false)} className="text-gray-400 hover:text-red-500"><X size={20}/></button>
              </div>
              <form onSubmit={handleSaveCategory} className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">اسم القسم</label>
                  <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="input-base" autoFocus required/>
                </div>
                <div className="pt-2 flex gap-3">
                  <button type="submit" disabled={saving} className="btn-primary bg-purple-600 hover:bg-purple-700 border-none flex-1">{saving ? 'جاري الحفظ...' : 'حفظ'}</button>
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
                <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Radiation size={18} className="text-purple-600"/> {editItem ? 'تعديل الفحص' : 'إضافة فحص جديد'}</h3>
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
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">اسم الفحص</label>
                  <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="input-base" required/>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">السعر مع فيلم (ريال يمني)</label>
                  <input type="number" min="0" step="1" value={formData.price_with_film || ''} onChange={e => setFormData({...formData, price_with_film: e.target.value})} className="input-base" required/>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">السعر بدون فيلم (ريال يمني)</label>
                  <input type="number" min="0" step="1" value={formData.price_without_film || ''} onChange={e => setFormData({...formData, price_without_film: e.target.value})} className="input-base"/>
                </div>
                {editItem && (
                  <label className="flex items-center gap-2 cursor-pointer bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} className="w-4 h-4 accent-purple-600"/>
                    <span className="text-sm font-bold text-gray-700">الفحص نشط</span>
                  </label>
                )}
                <div className="pt-2 flex gap-3">
                  <button type="submit" disabled={saving} className="btn-primary bg-purple-600 hover:bg-purple-700 border-none flex-1">{saving ? 'جاري الحفظ...' : 'حفظ'}</button>
                  <button type="button" onClick={() => setIsTestModalOpen(false)} className="px-4 py-2 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200">إلغاء</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
