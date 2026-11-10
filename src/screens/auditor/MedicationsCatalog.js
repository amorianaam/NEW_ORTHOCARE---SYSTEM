import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Pill, Plus, Search, Edit2, Trash2, Check, X, ShieldAlert } from 'lucide-react';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion';
import useAuthStore from '../../store/useAuthStore';

export default function MedicationsCatalog() {
  const { token } = useAuthStore();
  const headers = { Authorization: `Bearer ${token}` };
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState({ name: '', is_active: true });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/admin/catalog/medications', { headers });
      setMedications(res.data);
    } catch (err) {
      toast.error('خطأ في جلب الأدوية');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name) return toast.warning('اسم الدواء مطلوب');

    try {
      if (editItem) {
        await axios.put(`/api/admin/catalog/medications/${editItem.id}`, formData, { headers });
        toast.success('تم التحديث');
      } else {
        await axios.post('/api/admin/catalog/medications', formData, { headers });
        toast.success('تمت الإضافة');
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطأ في الحفظ');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الدواء نهائياً؟')) return;
    try {
      await axios.delete(`/api/admin/catalog/medications/${id}`, { headers });
      toast.success('تم حذف الدواء بنجاح');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطأ في حذف الدواء');
    }
  };

  const filtered = useMemo(() => {
    if (!searchTerm) return medications;
    return medications.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [medications, searchTerm]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Pill className="text-blue-600" />
            دليل الأدوية
          </h1>
          <p className="text-sm text-gray-500 mt-1">إدارة قائمة الأدوية المستخدمة في الوصفات الطبية (الروشتة)</p>
        </div>
        <button 
          onClick={() => { setEditItem(null); setFormData({ name: '', is_active: true }); setIsModalOpen(true); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} /> إضافة دواء
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex bg-white p-3 rounded-xl shadow-sm border border-gray-100">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="بحث عن دواء..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input-base w-full pr-10"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-gray-50/50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">#</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">اسم الدواء</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">الحالة</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700 w-32">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan="4" className="p-8 text-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="4" className="p-8 text-center text-gray-500 font-semibold">لا يوجد أدوية</td></tr>
              ) : (
                filtered.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-500">{idx + 1}</td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-gray-800">{item.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      {item.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700">
                          <Check size={14} /> نشط
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-700">
                          <X size={14} /> موقوف
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => { setEditItem(item); setFormData({ name: item.name, is_active: !!item.is_active }); setIsModalOpen(true); }}
                          className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600 transition-colors"
                          title="تعديل"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id)}
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
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" dir="rtl">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
          >
            <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                {editItem ? <Edit2 size={18} className="text-blue-600" /> : <Plus size={18} className="text-blue-600" />}
                {editItem ? 'تعديل دواء' : 'إضافة دواء'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">اسم الدواء <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="input-base"
                  placeholder="مثال: Paracetamol 500mg"
                  autoFocus
                />
              </div>
              {editItem && (
                <div>
                  <label className="flex items-center gap-2 cursor-pointer bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <input 
                      type="checkbox" 
                      checked={formData.is_active}
                      onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span className="text-sm font-bold text-gray-700">الدواء نشط ومتاح للاستخدام</span>
                  </label>
                </div>
              )}
              <div className="pt-4 flex gap-3">
                <button type="submit" className="btn-primary flex-1">حفظ</button>
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">إلغاء</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
