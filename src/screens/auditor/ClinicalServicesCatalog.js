import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Stethoscope, Plus, Search, Edit2, Trash2, Check, X, Folder, Layers } from 'lucide-react';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion';
import useAuthStore from '../../store/useAuthStore';

export default function ClinicalServicesCatalog() {
  const { token } = useAuthStore();
  const headers = { Authorization: `Bearer ${token}` };
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('services'); // 'services' | 'categories'

  // Modal states
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [isSvcModalOpen, setIsSvcModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [catsRes, svcsRes] = await Promise.all([
        axios.get('/api/admin/catalog/clinical-categories', { headers }),
        axios.get('/api/admin/catalog/clinical-services', { headers })
      ]);
      setCategories(catsRes.data);
      setServices(svcsRes.data);
    } catch (err) {
      toast.error('خطأ في جلب البيانات');
    } finally {
      setLoading(false);
    }
  };

  // ── Category Actions ──
  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!formData.name) return toast.warning('الاسم مطلوب');
    try {
      if (editItem) {
        await axios.put(`/api/admin/catalog/clinical-categories/${editItem.id}`, formData, { headers });
        toast.success('تم التحديث');
      } else {
        await axios.post('/api/admin/catalog/clinical-categories', formData, { headers });
        toast.success('تمت الإضافة');
      }
      setIsCatModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطأ في الحفظ');
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا القسم نهائياً؟ سيتم إلغاء ربط الخدمات به.')) return;
    try {
      await axios.delete(`/api/admin/catalog/clinical-categories/${id}`, { headers });
      toast.success('تم حذف القسم بنجاح');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطأ في حذف القسم');
    }
  };

  // ── Service Actions ──
  const handleSaveService = async (e) => {
    e.preventDefault();
    if (!formData.name || formData.price === '') return toast.warning('الاسم والسعر مطلوبان');
    try {
      if (editItem) {
        await axios.put(`/api/admin/catalog/clinical-services/${editItem.id}`, formData, { headers });
        toast.success('تم التحديث');
      } else {
        await axios.post('/api/admin/catalog/clinical-services', formData, { headers });
        toast.success('تمت الإضافة');
      }
      setIsSvcModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطأ في الحفظ');
    }
  };

  const handleDeleteService = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الخدمة نهائياً؟')) return;
    try {
      await axios.delete(`/api/admin/catalog/clinical-services/${id}`, { headers });
      toast.success('تم حذف الخدمة بنجاح');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطأ في حذف الخدمة');
    }
  };

  const filteredServices = useMemo(() => {
    if (!searchTerm) return services;
    return services.filter(s => 
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (s.category_name && s.category_name.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [services, searchTerm]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Stethoscope className="text-emerald-600" />
            الخدمات السريرية
          </h1>
          <p className="text-sm text-gray-500 mt-1">إدارة الإجراءات والخدمات الطبية داخل العيادة مثل الجبائر وإزالة الغرز</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('services')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'services' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}
          >
            الخدمات
          </button>
          <button 
            onClick={() => setActiveTab('categories')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'categories' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}
          >
            الأقسام
          </button>
        </div>
      </div>

      {activeTab === 'services' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex gap-4">
            <div className="relative flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-2">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="بحث في الخدمات..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-transparent border-none focus:ring-0 pr-10 text-sm font-semibold text-gray-700"
              />
            </div>
            <button 
              onClick={() => { setEditItem(null); setFormData({ category_id: categories[0]?.id || '', name: '', price: '', is_active: true }); setIsSvcModalOpen(true); }}
              className="btn-primary bg-emerald-600 hover:bg-emerald-700 border-none flex items-center gap-2 shadow-sm whitespace-nowrap"
            >
              <Plus size={18} /> إضافة خدمة
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-right">
              <thead className="bg-gray-50/50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-sm font-bold text-gray-700">القسم</th>
                  <th className="px-6 py-4 text-sm font-bold text-gray-700">اسم الخدمة</th>
                  <th className="px-6 py-4 text-sm font-bold text-gray-700">السعر (ريال يمني)</th>
                  <th className="px-6 py-4 text-sm font-bold text-gray-700">الحالة</th>
                  <th className="px-6 py-4 text-sm font-bold text-gray-700 w-32">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan="5" className="p-8 text-center"><div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div></td></tr>
                ) : filteredServices.length === 0 ? (
                  <tr><td colSpan="5" className="p-8 text-center text-gray-500 font-semibold">لا يوجد خدمات</td></tr>
                ) : (
                  filteredServices.map(item => (
                    <tr key={item.id} className="hover:bg-emerald-50/30 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-500 font-semibold">
                        <span className="flex items-center gap-1.5"><Layers size={14} className="text-gray-400"/> {item.category_name || 'بدون قسم'}</span>
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-800">{item.name}</td>
                      <td className="px-6 py-4 font-bold text-emerald-700">{item.price}</td>
                      <td className="px-6 py-4">
                        {item.is_active ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700"><Check size={14} /> نشط</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-700"><X size={14} /> موقوف</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => { setEditItem(item); setFormData({ category_id: item.category_id || '', name: item.name, price: item.price, is_active: !!item.is_active }); setIsSvcModalOpen(true); }}
                            className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-emerald-100 hover:text-emerald-600 transition-colors"
                            title="تعديل"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDeleteService(item.id)}
                            className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600 transition-colors"
                            title="حذف"
                          >
                            <Trash2 size={16} />
                          </button>
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
            <button 
              onClick={() => { setEditItem(null); setFormData({ name: '' }); setIsCatModalOpen(true); }}
              className="btn-primary bg-emerald-600 hover:bg-emerald-700 border-none flex items-center gap-2 shadow-sm"
            >
              <Plus size={18} /> إضافة قسم
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? (
              <div className="col-span-full p-8 text-center"><div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div></div>
            ) : categories.length === 0 ? (
              <div className="col-span-full p-8 text-center text-gray-500 font-semibold bg-white rounded-2xl border border-gray-100">لا يوجد أقسام</div>
            ) : (
              categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-emerald-200 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <Folder size={18} />
                    </div>
                    <span className="font-bold text-gray-800">{cat.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => { setEditItem(cat); setFormData({ name: cat.name }); setIsCatModalOpen(true); }}
                      className="p-2 text-gray-400 hover:text-emerald-600 transition-colors"
                      title="تعديل"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                      title="حذف"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}

      {/* Category Modal */}
      {isCatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" dir="rtl">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                <Folder size={18} className="text-emerald-600" />
                {editItem ? 'تعديل القسم' : 'إضافة قسم جديد'}
              </h3>
              <button onClick={() => setIsCatModalOpen(false)} className="text-gray-400 hover:text-red-500"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveCategory} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">الاسم</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="input-base" autoFocus required/>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="submit" className="btn-primary bg-emerald-600 hover:bg-emerald-700 border-none flex-1">حفظ</button>
                <button type="button" onClick={() => setIsCatModalOpen(false)} className="px-4 py-2 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200">إلغاء</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Service Modal */}
      {isSvcModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" dir="rtl">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                <Layers size={18} className="text-emerald-600" />
                {editItem ? 'تعديل الخدمة' : 'إضافة خدمة جديدة'}
              </h3>
              <button onClick={() => setIsSvcModalOpen(false)} className="text-gray-400 hover:text-red-500"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveService} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">القسم</label>
                <select value={formData.category_id} onChange={e => setFormData({...formData, category_id: e.target.value})} className="input-base text-sm font-semibold text-gray-700">
                  <option value="">بدون قسم</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">اسم الخدمة</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="input-base" required/>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">السعر (ريال يمني)</label>
                <input type="number" min="0" step="1" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="input-base" required/>
              </div>
              {editItem && (
                <label className="flex items-center gap-2 cursor-pointer bg-gray-50 p-3 rounded-xl border border-gray-200 mt-2">
                  <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} className="w-4 h-4 accent-emerald-600"/>
                  <span className="text-sm font-bold text-gray-700">الخدمة نشطة</span>
                </label>
              )}
              <div className="pt-4 flex gap-3">
                <button type="submit" className="btn-primary bg-emerald-600 hover:bg-emerald-700 border-none flex-1">حفظ</button>
                <button type="button" onClick={() => setIsSvcModalOpen(false)} className="px-4 py-2 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200">إلغاء</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
