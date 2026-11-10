import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import SearchInput from '../../components/common/SearchInput';
import { createPortal } from 'react-dom';
import {
  Star, Trash2, Plus, Search, FlaskConical, Radiation, Layers,
  Pill, Heart, Award, Check, X, Settings, FolderHeart, Info, Activity, RefreshCcw, Edit2, Maximize2, Minimize2, Grid, LayoutGrid, List, Clock, FileText
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';
import ComboboxSelect from '../../components/ComboboxSelect';
import MedicationSelect from '../../components/MedicationSelect';

export default function DoctorFavorites() {
  const { token } = useAuthStore();
  const headers = { Authorization: `Bearer ${token}` };

  // Tab State
  const [activeTab, setActiveTab] = useState('meds'); // 'meds' | 'tests' | 'bundles'

  // Data States
  const [favoriteMeds, setFavoriteMeds] = useState([]);
  const [favoriteTests, setFavoriteTests] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [catalogs, setCatalogs] = useState({ lab: [], radiology: [], clinical: [], medications: [] });
  const [loading, setLoading] = useState(true);

  // New Items Forms
  const [isCreatingBundle, setIsCreatingBundle] = useState(false);
  const [editingBundleId, setEditingBundleId] = useState(null);
  const [newBundleName, setNewBundleName] = useState('');
  const [selectedBundleItems, setSelectedBundleItems] = useState([]);
  const [bundleSearchTerm, setBundleSearchTerm] = useState('');

  // Meds & Tests Forms
  const [isAddingMed, setIsAddingMed] = useState(false);
  const [medData, setMedData] = useState({ name: '', dosage: '', frequency: '', duration: '', instructions: '' });
  const [isAddingTest, setIsAddingTest] = useState(false);
  const [testModalTab, setTestModalTab] = useState('lab');
  const [testSearchTerm, setTestSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, item: null, type: '', name: '' });
  const [editingFavTestId, setEditingFavTestId] = useState(null);
  const [selectedFavTestItem, setSelectedFavTestItem] = useState(null);
  
  // Global Modal UX
  const [isMaximized, setIsMaximized] = usePersistentState('doctor_modal_maximized_preference', false);

  // View Mode States
  const [medsViewMode, setMedsViewMode] = usePersistentState('global_layout_preference', 'grid');
  const [testsViewMode, setTestsViewMode] = usePersistentState('global_layout_preference', 'grid');
  const [testsSearchText, setTestsSearchText] = useState('');
  const [bundlesViewMode, setBundlesViewMode] = usePersistentState('global_layout_preference', 'grid');
  const [bundlesSearchText, setBundlesSearchText] = useState('');
  const [bundleModalTab, setBundleModalTab] = useState('lab');
  const [bundleModalViewMode, setBundleModalViewMode] = usePersistentState('global_layout_preference', 'grid');
  const [testModalViewMode, setTestModalViewMode] = usePersistentState('global_layout_preference', 'grid');

  // ─── English Digits Helper ──────────────────────────────────────────────
  const toEnglishDigits = (val) => {
    if (val === null || val === undefined) return '';
    return String(val).replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
  };

  // ─── Format Price (Integer, thousands separator, YER symbol on left) ────
  const getPriceNumber = (item) => {
    if (!item) return null;
    const raw = typeof item === 'object'
      ? (item.price ?? item.price_with_film ?? item.cost ?? item.test_price)
      : item;
    if (raw === null || raw === undefined || isNaN(Number(raw))) return null;
    return Math.round(Number(raw)).toLocaleString('en-US');
  };

  const formatPrice = (item) => {
    const num = getPriceNumber(item);
    if (!num) return '---';
    return `ر.ي ${num}`;
  };

  const renderPrice = (item, fallback = '---') => {
    const num = getPriceNumber(item);
    if (!num) return <span className="text-xs font-bold text-slate-400">{fallback}</span>;
    return (
      <span className="text-sm font-black text-rose-600 inline-flex items-center gap-1" dir="ltr">
        <span className="text-xs font-bold text-rose-500">ر.ي</span>
        <span>{num}</span>
      </span>
    );
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [meds, tests, bndls, labCat, radCat, clinCat, medCat] = await Promise.all([
        axios.get('/api/doctor/favorites/medications', { headers }),
        axios.get('/api/doctor/favorites/tests', { headers }),
        axios.get('/api/doctor/favorites/bundles', { headers }),
        axios.get('/api/catalog/lab', { headers }),
        axios.get('/api/catalog/radiology', { headers }),
        axios.get('/api/admin/catalog/clinical-services', { headers }),
        axios.get('/api/admin/catalog/medications', { headers })
      ]);
      setFavoriteMeds(meds.data || []);
      setFavoriteTests(tests.data || []);
      setBundles(bndls.data || []);
      setCatalogs({
        lab: labCat.data || [],
        radiology: radCat.data || [],
        clinical: clinCat.data || [],
        medications: medCat.data || []
      });
    } catch {
      toast.error('فشل في جلب المفضلات والإعدادات');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── CRUD Favorite Medications & Dosages ─────────────────────────
  const confirmDelete = async () => {
    const { item, type } = deleteConfirm;
    if (!item) return;
    try {
      if (type === 'med') {
        await axios.delete(`/api/doctor/favorites/medications/${item}`, { headers });
        toast.success('تمت إزالة الدواء بنجاح');
        setFavoriteMeds(prev => prev.filter(m => m.id !== item));
      } else if (type === 'test') {
        await axios.delete(`/api/doctor/favorites/tests/${item.id}`, { headers });
        toast.success('تم الحذف من المفضلة');
        setFavoriteTests(prev => prev.filter(t => t.id !== item.id));
      } else if (type === 'bundle') {
        await axios.delete(`/api/doctor/favorites/bundles/${item}`, { headers });
        toast.success('تم حذف الحزمة الطبية بنجاح');
        setBundles(prev => prev.filter(b => b.id !== item));
      }
      setDeleteConfirm({ isOpen: false, item: null, type: '', name: '' });
    } catch {
      toast.error('خطأ في الحذف');
    }
  };

  const handleDeleteFavMed = (id) => {
    setDeleteConfirm({ isOpen: true, item: id, type: 'med', name: favoriteMeds.find(m => m.id === id)?.medication_name || 'الدواء' });
  };

  const handleEditFavMed = (item) => {
    setMedData({
      name: item.medication_name,
      dosage: toEnglishDigits(item.dosage || ''),
      frequency: toEnglishDigits(item.frequency || ''),
      duration: item.duration || '',
      instructions: item.instructions || ''
    });
    setIsAddingMed(true);
  };

  // ─── CRUD Favorite Tests ─────────────────────────────────────────
  const handleDeleteFavTest = (item) => {
    setDeleteConfirm({ isOpen: true, item, type: 'test', name: item.name || 'الفحص' });
  };

  const handleAddFavMedSubmit = async (e) => {
    e.preventDefault();
    if (!medData.name.trim()) return toast.warning('الرجاء إدخال اسم الدواء');
    
    const matchedMed = catalogs.medications.find(m => m.name === medData.name || m.scientific_name === medData.name);
    
    try {
      await axios.post('/api/doctor/favorites/medications', {
        medicationName: medData.name,
        dosage: toEnglishDigits(medData.dosage),
        frequency: toEnglishDigits(medData.frequency),
        duration: medData.duration,
        instructions: medData.instructions
      }, { headers });
      toast.success('تمت حفظ بيانات الدواء بنجاح');
      setIsAddingMed(false);
      setMedData({ name: '', dosage: '', frequency: '', duration: '', instructions: '' });
      const meds = await axios.get('/api/doctor/favorites/medications', { headers });
      setFavoriteMeds(meds.data || []);
    } catch {
      toast.error('خطأ في إضافة الدواء');
    }
  };

  const handleEditFavTest = (item) => {
    setEditingFavTestId(item.id);
    setTestModalTab(item.test_type);
    setTestSearchTerm('');
    const matchedTest = catalogs[item.test_type]?.find(t => t.name === item.name);
    if(matchedTest) {
      setSelectedFavTestItem({ ...matchedTest, test_type: item.test_type, typeLabel: item.test_type === 'lab' ? 'مختبر' : item.test_type === 'radiology' ? 'أشعة' : 'خدمة' });
    }
    setIsAddingTest(true);
  };

  const handleAddFavTestSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFavTestItem) return toast.warning('الرجاء اختيار فحص من القائمة المرجعية');
    
    try {
      if (editingFavTestId) {
        await axios.delete(`/api/doctor/favorites/tests/${editingFavTestId}`, { headers });
      }
      await axios.post('/api/doctor/favorites/tests', {
        testId: selectedFavTestItem.id,
        testType: selectedFavTestItem.test_type
      }, { headers });
      toast.success(editingFavTestId ? 'تم تعديل الفحص بنجاح' : 'تمت إضافة الفحص للمفضلة بنجاح');
      setIsAddingTest(false);
      setTestSearchTerm('');
      setSelectedFavTestItem(null);
      setEditingFavTestId(null);
      const tests = await axios.get('/api/doctor/favorites/tests', { headers });
      setFavoriteTests(tests.data || []);
    } catch {
      toast.error('خطأ في حفظ الفحص');
    }
  };

  // ─── CRUD Bundle Packages ────────────────────────────────────────
  const handleToggleBundleSelection = (item, type) => {
    const targetId = item.test_id || item.id;
    const targetType = item.test_type || type;
    const exists = selectedBundleItems.some(s => s.test_id === targetId && s.test_type === targetType);
    if (exists) {
      setSelectedBundleItems(prev => prev.filter(s => !(s.test_id === targetId && s.test_type === targetType)));
    } else {
      setSelectedBundleItems(prev => [...prev, {
        test_id: item.id,
        test_type: type,
        name: item.name,
        price: item.price ?? item.price_with_film ?? item.cost ?? item.test_price,
        typeLabel: type === 'lab' ? 'المختبر' : type === 'radiology' ? 'الأشعة' : 'الخدمات السريرية'
      }]);
    }
  };

  const handleCreateBundleSubmit = async (e) => {
    e.preventDefault();
    if (!newBundleName.trim()) return toast.warning('الرجاء إدخال اسم الحزمة');
    if (selectedBundleItems.length === 0) return toast.warning('الرجاء تحديد فحص واحد على الأقل للحزمة');

    try {
      // If editing, delete the old bundle first
      if (editingBundleId) {
        await axios.delete(`/api/doctor/favorites/bundles/${editingBundleId}`, { headers });
      }

      await axios.post('/api/doctor/favorites/bundles', {
        name: newBundleName,
        items: selectedBundleItems.map(i => ({ test_id: i.test_id, test_type: i.test_type, name: i.name }))
      }, { headers });
      toast.success('تم حفظ الحزمة المجمّعة المخصصة بنجاح!');
      setIsCreatingBundle(false);
      setEditingBundleId(null);
      setNewBundleName('');
      setSelectedBundleItems([]);
      // Reload bundles
      const bndls = await axios.get('/api/doctor/favorites/bundles', { headers });
      setBundles(bndls.data || []);
    } catch {
      toast.error('خطأ في إنشاء الحزمة');
    }
  };

  const handleDeleteBundle = (id) => {
    setDeleteConfirm({ isOpen: true, item: id, type: 'bundle', name: bundles.find(b => b.id === id)?.name || 'الباقة' });
  };

  const handleEditBundle = (bundle) => {
    setNewBundleName(bundle.name);
    setSelectedBundleItems(bundle.items?.map(i => {
      const matched = catalogs[i.test_type]?.find(t => t.id === i.test_id);
      return {
        test_id: i.test_id,
        test_type: i.test_type,
        name: i.name,
        price: matched?.price ?? matched?.price_with_film ?? matched?.cost ?? i.price ?? i.test_price,
        typeLabel: i.test_type === 'lab' ? 'المختبر' : i.test_type === 'radiology' ? 'الأشعة' : 'الخدمات السريرية'
      };
    }) || []);
    setEditingBundleId(bundle.id);
    setIsCreatingBundle(true);
  };

  // Filter Catalog Items for Bundle Builder
  const filteredCatalogItems = useMemo(() => {
    const all = catalogs[bundleModalTab]?.map(i => ({
      ...i,
      type: bundleModalTab,
      typeLabel: bundleModalTab === 'lab' ? 'المختبر' : bundleModalTab === 'radiology' ? 'الأشعة' : 'الخدمات السريرية'
    })) || [];
    if (!bundleSearchTerm.trim()) return all;
    return all.filter(i => i.name?.toLowerCase().includes(bundleSearchTerm.toLowerCase()));
  }, [catalogs, bundleSearchTerm, bundleModalTab]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-950 p-6 rounded-3xl shadow-lg text-white border border-indigo-900 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="relative z-10 flex justify-between items-center">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-700/80 flex items-center justify-center text-amber-400">
              <Star size={24} fill="currentColor" />
            </div>
            <div>
              <h1 className="text-xl font-black">إدارة المفضلات والجرعات والقوالب المجمّعة</h1>
              <p className="text-blue-200 text-xs mt-1">تعديل وصيانة مفضلات الأدوية والتحاليل والأشعة وحزم العمل بلمسة واحدة</p>
            </div>
          </div>
          <button onClick={fetchData} className="p-2.5 bg-indigo-900/60 rounded-xl text-blue-100 hover:bg-indigo-800 transition-colors">
            <RefreshCcw size={16} />
          </button>
        </div>
      </div>

      {/* Centered Tabs */}
      <div className="flex justify-center w-full">
        <div className="flex p-1.5 gap-2 bg-gray-100/90 backdrop-blur-md rounded-2xl border border-gray-200/80 max-w-3xl w-full shadow-xs">
          {[
            { id: 'meds', label: 'مفضلة الأدوية والجرعات', icon: Pill },
            { id: 'tests', label: 'مفضلة الفحوصات الطبية', icon: FlaskConical },
            { id: 'bundles', label: 'الحزم الطبية المجمّعة', icon: FolderHeart }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 sm:px-4 rounded-xl text-xs font-black transition-all border border-b-2 whitespace-nowrap select-none ${
                activeTab === tab.id
                  ? 'bg-white text-indigo-700 shadow-sm border-gray-100 border-b-indigo-600'
                  : 'border-transparent text-gray-500 hover:bg-white/50 hover:text-gray-700'
              }`}
            >
              <tab.icon size={15} className="shrink-0" />
              <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Core content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* TAB A: MEDICATIONS */}
          {activeTab === 'meds' && (
            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4">
              <h3 className="font-black text-sm text-gray-800 flex items-center justify-between pb-3 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <Pill className="text-indigo-600" size={17} /> الأدوية والتعليمات المحفوظة
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex bg-gray-100 rounded-lg p-0.5">
                      <button onClick={() => setMedsViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${medsViewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}><Grid size={14}/></button>
                      <button onClick={() => setMedsViewMode('list')} className={`p-1.5 rounded-md transition-colors ${medsViewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}><List size={14}/></button>
                    </div>
                    <button 
                      onClick={() => setIsAddingMed(true)}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Plus size={14}/> إضافة دواء مفضل
                    </button>
                  </div>
                </h3>
                {favoriteMeds.length === 0 ? (
                  <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-sm">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-3 text-indigo-400">
                      <Pill size={28} />
                    </div>
                    <h4 className="text-sm font-black text-gray-700">لا يوجد أدوية محفوظة في المفضلة حالياً</h4>
                    <p className="text-gray-400 text-xs mt-1 font-semibold">يمكنك إضافة أدوية وجرعات نموذجية للوصول إليها بسرعة عند المعاينة.</p>
                  </div>
                ) : medsViewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 transition-all duration-300">
                    {favoriteMeds.map((item, idx) => (
                      <div
                        key={item.id}
                        className="bg-white rounded-3xl border border-slate-100/90 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-indigo-300 flex flex-col justify-between p-5 select-none shadow-[0_4px_20px_rgb(0,0,0,0.03)] group"
                      >
                        {/* Top: Avatar + Medication Name + Index Counter */}
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center font-black text-base transition-transform group-hover:scale-105 shadow-xs bg-gradient-to-br from-indigo-50 to-indigo-100/80 text-indigo-700 border border-indigo-200/50">
                              <Pill size={20} />
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-black text-slate-800 text-sm leading-tight group-hover:text-indigo-700 transition-colors truncate">
                                {item.medication_name}
                              </h4>
                            </div>
                          </div>

                          <span className="text-xs font-black text-slate-400 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100 flex-shrink-0">
                            {idx + 1}
                          </span>
                        </div>

                        {/* Middle: Details (Dosage, Frequency, Duration, Instructions) */}
                        <div className="grid grid-cols-2 gap-2 mt-3.5 pt-3 border-t border-slate-100/80">
                          <div className="bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100/70 flex flex-col gap-0.5">
                            <span className="text-[10px] font-bold text-slate-400">الجرعة</span>
                            <span className="text-xs font-black text-slate-700 truncate" title={toEnglishDigits(item.dosage) || '---'}>
                              {toEnglishDigits(item.dosage) || '---'}
                            </span>
                          </div>
                          <div className="bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100/70 flex flex-col gap-0.5">
                            <span className="text-[10px] font-bold text-slate-400">التكرار</span>
                            <span className="text-xs font-black text-slate-700 truncate" title={toEnglishDigits(item.frequency) || '---'}>
                              {toEnglishDigits(item.frequency) || '---'}
                            </span>
                          </div>
                          <div className="bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100/70 flex flex-col gap-0.5">
                            <span className="text-[10px] font-bold text-slate-400">المدة</span>
                            <span className="text-xs font-black text-slate-700 truncate" title={item.duration || '---'}>
                              {item.duration || '---'}
                            </span>
                          </div>
                          <div className="bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100/70 flex flex-col gap-0.5">
                            <span className="text-[10px] font-bold text-slate-400">التعليمات</span>
                            <span className="text-xs font-black text-slate-700 truncate" title={item.instructions || '---'}>
                              {item.instructions || '---'}
                            </span>
                          </div>
                        </div>

                        {/* Bottom Actions */}
                        <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100/80">
                          <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-700 bg-indigo-50/90 px-2.5 py-1 rounded-full border border-indigo-200/60 shadow-2xs">
                            <Pill size={11} className="text-indigo-600" />
                            <span>دواء مفضل</span>
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEditFavMed(item)}
                              className="p-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-xl transition-all active:scale-95"
                              title="تعديل الدواء والجرعة"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={() => handleDeleteFavMed(item.id)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-95"
                              title="إزالة من المفضلة"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm whitespace-nowrap table-fixed">
                        <thead className="bg-gradient-to-r from-slate-50/90 via-indigo-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                          <tr>
                            <th className="w-[6%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                            <th className="w-[30%] px-4 py-4 text-right font-black text-xs text-slate-600">الدواء</th>
                            <th className="w-[26%] px-4 py-4 text-right font-black text-xs text-slate-600">الجرعة والتكرار</th>
                            <th className="w-[24%] px-4 py-4 text-right font-black text-xs text-slate-600">التعليمات والمدة</th>
                            <th className="w-[14%] px-4 py-4 text-center font-black text-xs text-slate-600">الإجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/70">
                          {favoriteMeds.map((item, idx) => (
                            <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors border-b border-slate-100/70 last:border-0 group">
                              <td className="w-[6%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                                {idx + 1}
                              </td>
                              <td className="w-[30%] px-4 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 bg-gradient-to-br from-indigo-50 to-indigo-100/80 text-indigo-700 border border-indigo-200/50 group-hover:scale-105 transition-transform">
                                    <Pill size={18} />
                                  </div>
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="font-black text-slate-800 text-sm group-hover:text-indigo-700 transition-colors truncate">
                                      {item.medication_name}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="w-[26%] px-4 py-4 text-right">
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs font-bold text-slate-700">
                                    {item.dosage ? `الجرعة: ${toEnglishDigits(item.dosage)}` : 'الجرعة: ---'}
                                  </span>
                                  <span className="text-[11px] font-semibold text-slate-500">
                                    {item.frequency ? `التكرار: ${toEnglishDigits(item.frequency)}` : 'التكرار: ---'}
                                  </span>
                                </div>
                              </td>
                              <td className="w-[24%] px-4 py-4 text-right">
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs font-bold text-slate-700">
                                    {item.instructions ? `التعليمات: ${item.instructions}` : 'التعليمات: ---'}
                                  </span>
                                  <span className="text-[11px] font-semibold text-slate-500">
                                    {item.duration ? `المدة: ${item.duration}` : 'المدة: ---'}
                                  </span>
                                </div>
                              </td>
                              <td className="w-[14%] px-4 py-4 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleEditFavMed(item)}
                                    className="p-2 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-colors"
                                    title="تعديل"
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteFavMed(item.id)}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                    title="حذف"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
          )}

          {/* TAB B: TESTS */}
          {activeTab === 'tests' && (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
              <h3 className="font-black text-sm text-gray-800 flex items-center justify-between pb-3 border-b border-gray-50">
                <div className="flex items-center gap-2">
                  <FlaskConical className="text-indigo-600" size={17} /> الفحوصات الطبية المفضلة
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-44 sm:w-56">
                    <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400">
                      <Search size={14} strokeWidth={2.2} />
                    </div>
                    <input
                      type="text"
                      placeholder="بحث في الفحوصات..."
                      value={testsSearchText}
                      onChange={e => setTestsSearchText(e.target.value)}
                      className="w-full h-[32px] pr-8 pl-7 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/50 transition-all"
                    />
                    {testsSearchText && (
                      <button
                        type="button"
                        onClick={() => setTestsSearchText('')}
                        className="absolute inset-y-0 left-0 pl-2 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                        title="مسح البحث"
                      >
                        <div className="w-4 h-4 rounded-full bg-slate-200/70 hover:bg-slate-300 flex items-center justify-center transition-colors">
                          <X size={10} strokeWidth={2.5} />
                        </div>
                      </button>
                    )}
                  </div>
                  <div className="flex bg-gray-100 rounded-lg p-0.5">
                    <button onClick={() => setTestsViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${testsViewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}><LayoutGrid size={18}/></button>
                    <button onClick={() => setTestsViewMode('list')} className={`p-1.5 rounded-md transition-colors ${testsViewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}><List size={18}/></button>
                  </div>
                  <button 
                    onClick={() => setIsAddingTest(true)}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Plus size={14}/> إضافة فحص مفضل
                  </button>
                </div>
              </h3>
              <div>
                {favoriteTests.length === 0 ? (
                  <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-sm">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-3 text-indigo-400">
                      <FlaskConical size={28} />
                    </div>
                    <h4 className="text-sm font-black text-gray-700">لا توجد فحوصات مخبرية أو إشعاعية في المفضلة حالياً</h4>
                    <p className="text-gray-400 text-xs mt-1 font-semibold">يمكنك إضافة الفحوصات الطبية الأكثر استخداماً للوصول السريع إليها أثناء الكشف.</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {[
                      { id: 'lab', label: 'المختبر', icon: FlaskConical, color: 'text-purple-800', avatarBg: 'bg-gradient-to-br from-purple-50 to-purple-100/80 text-purple-700 border-purple-200/50' },
                      { id: 'radiology', label: 'الأشعة', icon: Radiation, color: 'text-blue-800', avatarBg: 'bg-gradient-to-br from-blue-50 to-blue-100/80 text-blue-700 border-blue-200/50' },
                      { id: 'clinical', label: 'الخدمات السريرية', icon: Activity, color: 'text-emerald-800', avatarBg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/80 text-emerald-700 border-emerald-200/50' }
                    ].map(cat => {
                      const categoryItems = favoriteTests.filter(t => t.test_type === cat.id && (!testsSearchText || t.name.toLowerCase().includes(testsSearchText.toLowerCase())));
                      if (favoriteTests.filter(t => t.test_type === cat.id).length === 0) return null;
                      const CatIcon = cat.icon;

                      return (
                        <div key={cat.id} className="space-y-3">
                          <h4 className={`text-sm font-black ${cat.color} flex items-center gap-2`}>
                            <CatIcon size={16} /> {cat.label} ({categoryItems.length})
                          </h4>

                          {categoryItems.length === 0 ? (
                            <div className="text-center py-6 text-gray-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-gray-200">
                              لا توجد نتائج مطابقة لبحث "{testsSearchText}" في قسم {cat.label}.
                            </div>
                          ) : testsViewMode === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 transition-all duration-300">
                              {categoryItems.map((item, idx) => (
                                <div
                                  key={item.id}
                                  className="bg-white rounded-3xl border border-slate-100/90 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-indigo-300 flex flex-col justify-between p-5 select-none shadow-[0_4px_20px_rgb(0,0,0,0.03)] group"
                                >
                                  {/* Top: Avatar + Service Name + Index Counter */}
                                  <div className="flex justify-between items-start gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className={`w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center font-black text-base transition-transform group-hover:scale-105 shadow-xs ${cat.avatarBg}`}>
                                        <CatIcon size={20} />
                                      </div>
                                      <div className="min-w-0">
                                        <h4 className="font-black text-slate-800 text-sm leading-tight group-hover:text-indigo-700 transition-colors truncate">
                                          {item.name}
                                        </h4>
                                      </div>
                                    </div>
                                    <span className="text-xs font-black text-slate-400 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100 flex-shrink-0">
                                      {idx + 1}
                                    </span>
                                  </div>

                                  {/* Bottom: Plain Text Price & Actions */}
                                  <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100/80 gap-2">
                                    <div className="flex flex-col">
                                      <span className="text-[10px] font-bold text-slate-400 mb-0.5">سعر الخدمة</span>
                                      {renderPrice(item)}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => handleEditFavTest(item)}
                                        className="p-2 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-colors"
                                        title="تعديل"
                                      >
                                        <Edit2 size={15} />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteFavTest(item)}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                        title="حذف"
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm whitespace-nowrap table-fixed">
                                  <thead className="bg-gradient-to-r from-slate-50/90 via-indigo-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                                    <tr>
                                      <th className="w-[8%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                                      <th className="w-[48%] px-4 py-4 text-right font-black text-xs text-slate-600">اسم الخدمة</th>
                                      <th className="w-[24%] px-4 py-4 text-right font-black text-xs text-slate-600">سعر الخدمة</th>
                                      <th className="w-[20%] px-4 py-4 text-center font-black text-xs text-slate-600">الإجراءات</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100/70">
                                    {categoryItems.map((item, idx) => (
                                      <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors border-b border-slate-100/70 last:border-0 group">
                                        <td className="w-[8%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                                          {idx + 1}
                                        </td>
                                        <td className="w-[48%] px-4 py-4">
                                          <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 group-hover:scale-105 transition-transform ${cat.avatarBg}`}>
                                              <CatIcon size={18} />
                                            </div>
                                            <span className="font-black text-slate-800 text-sm group-hover:text-indigo-700 transition-colors truncate">
                                              {item.name}
                                            </span>
                                          </div>
                                        </td>
                                        <td className="w-[24%] px-4 py-4 text-right">
                                          {renderPrice(item)}
                                        </td>
                                        <td className="w-[20%] px-4 py-4 text-center">
                                          <div className="flex items-center justify-center gap-1">
                                            <button
                                              onClick={() => handleEditFavTest(item)}
                                              className="p-2 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-colors"
                                              title="تعديل"
                                            >
                                              <Edit2 size={16} />
                                            </button>
                                            <button
                                              onClick={() => handleDeleteFavTest(item)}
                                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                              title="حذف"
                                            >
                                              <Trash2 size={16} />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB C: BUNDLES */}
          {activeTab === 'bundles' && (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
              <h3 className="font-black text-sm text-gray-800 flex items-center justify-between pb-3 border-b border-gray-50">
                <div className="flex items-center gap-2">
                  <FolderHeart className="text-indigo-600" size={17} /> الحزم الطبية المجمّعة
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-44 sm:w-56">
                    <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400">
                      <Search size={14} strokeWidth={2.2} />
                    </div>
                    <input
                      type="text"
                      placeholder="بحث في الباقات..."
                      value={bundlesSearchText}
                      onChange={e => setBundlesSearchText(e.target.value)}
                      className="w-full h-[32px] pr-8 pl-7 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/50 transition-all"
                    />
                    {bundlesSearchText && (
                      <button
                        type="button"
                        onClick={() => setBundlesSearchText('')}
                        className="absolute inset-y-0 left-0 pl-2 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                        title="مسح البحث"
                      >
                        <div className="w-4 h-4 rounded-full bg-slate-200/70 hover:bg-slate-300 flex items-center justify-center transition-colors">
                          <X size={10} strokeWidth={2.5} />
                        </div>
                      </button>
                    )}
                  </div>
                  <div className="flex bg-gray-100 rounded-lg p-0.5">
                    <button onClick={() => setBundlesViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${bundlesViewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}><LayoutGrid size={18}/></button>
                    <button onClick={() => setBundlesViewMode('list')} className={`p-1.5 rounded-md transition-colors ${bundlesViewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}><List size={18}/></button>
                  </div>
                  <button
                    onClick={() => { setSelectedBundleItems([]); setNewBundleName(''); setEditingBundleId(null); setIsCreatingBundle(true); }}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Plus size={14} /> إنشاء باقة مجمّعة
                  </button>
                </div>
              </h3>

              <div>
                {bundles.length === 0 ? (
                  <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-sm">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-3 text-indigo-400">
                      <FolderHeart size={28} />
                    </div>
                    <h4 className="text-sm font-black text-gray-700">لم تقم بإنشاء باقات مجمعة مسبقاً</h4>
                    <p className="text-gray-400 text-xs mt-1 font-semibold">أنشئ حزم مخصصة للفحوصات المتكررة لتسجيلها بضغطة واحدة للمريض.</p>
                  </div>
                ) : (
                  (() => {
                    const filteredBundles = bundles.filter(b => (!bundlesSearchText || b.name.toLowerCase().includes(bundlesSearchText.toLowerCase())));
                    if (filteredBundles.length === 0) {
                      return (
                        <div className="text-center py-8 text-gray-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-gray-200">
                          لا توجد نتائج مطابقة لبحث "{bundlesSearchText}".
                        </div>
                      );
                    }

                    return bundlesViewMode === 'grid' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 transition-all duration-300">
                        {filteredBundles.map((bundle, idx) => {
                          const totalPrice = bundle.items?.reduce((acc, it) => acc + (Number(it.price) || 0), 0);
                          return (
                            <div
                              key={bundle.id}
                              className="bg-white rounded-3xl border border-slate-100/90 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-indigo-300 flex flex-col justify-between p-5 select-none shadow-[0_4px_20px_rgb(0,0,0,0.03)] group"
                            >
                              {/* Top: Avatar + Bundle Name + Index Counter */}
                              <div className="flex justify-between items-start gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center font-black text-base transition-transform group-hover:scale-105 shadow-xs bg-gradient-to-br from-indigo-50 to-indigo-100/80 text-indigo-700 border border-indigo-200/50">
                                    <FolderHeart size={20} />
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="font-black text-slate-800 text-sm leading-tight group-hover:text-indigo-700 transition-colors truncate">
                                      {bundle.name}
                                    </h4>
                                  </div>
                                </div>

                                <span className="text-xs font-black text-slate-400 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100 flex-shrink-0">
                                  {idx + 1}
                                </span>
                              </div>

                              {/* Middle: Included tests chips */}
                              <div className="space-y-1.5 mt-3 pt-3 border-t border-slate-100/80">
                                <span className="text-[10px] font-bold text-slate-400 block">
                                  الفحوصات المشمولة ({bundle.items?.length || 0}):
                                </span>
                                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto no-scrollbar">
                                  {bundle.items?.map((item, i) => (
                                    <span key={i} className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-slate-200/70">
                                      {item.name}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {/* Bottom: Price & Actions */}
                              <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100/80 gap-2">
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-bold text-slate-400 mb-0.5">إجمالي الباقة</span>
                                  {totalPrice > 0 ? (
                                    <span className="text-sm font-black text-rose-600 inline-flex items-center gap-1" dir="ltr">
                                      <span className="text-xs font-bold text-rose-500">ر.ي</span>
                                      <span>{Math.round(totalPrice).toLocaleString('en-US')}</span>
                                    </span>
                                  ) : (
                                    <span className="text-xs font-bold text-slate-400">---</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleEditBundle(bundle)}
                                    className="p-2 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-colors"
                                    title="تعديل"
                                  >
                                    <Edit2 size={15} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteBundle(bundle.id)}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                    title="حذف"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm whitespace-nowrap table-fixed">
                            <thead className="bg-gradient-to-r from-slate-50/90 via-indigo-50/20 to-slate-50/90 text-slate-600 border-b border-slate-100">
                              <tr>
                                <th className="w-[8%] px-3 py-4 text-center font-black text-xs text-slate-400">#</th>
                                <th className="w-[28%] px-4 py-4 text-right font-black text-xs text-slate-600">اسم الباقة</th>
                                <th className="w-[42%] px-4 py-4 text-right font-black text-xs text-slate-600">الفحوصات المشمولة</th>
                                <th className="w-[12%] px-4 py-4 text-right font-black text-xs text-slate-600">إجمالي السعر</th>
                                <th className="w-[10%] px-4 py-4 text-center font-black text-xs text-slate-600">الإجراءات</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/70">
                              {filteredBundles.map((bundle, idx) => {
                                const totalPrice = bundle.items?.reduce((acc, it) => acc + (Number(it.price) || 0), 0);
                                return (
                                  <tr key={bundle.id} className="hover:bg-indigo-50/30 transition-colors border-b border-slate-100/70 last:border-0 group">
                                    <td className="w-[8%] px-3 py-4 text-center font-black text-slate-400 text-xs">
                                      {idx + 1}
                                    </td>
                                    <td className="w-[28%] px-4 py-4">
                                      <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 bg-gradient-to-br from-indigo-50 to-indigo-100/80 text-indigo-700 border border-indigo-200/50 group-hover:scale-105 transition-transform">
                                          <FolderHeart size={18} />
                                        </div>
                                        <span className="font-black text-slate-800 text-sm group-hover:text-indigo-700 transition-colors truncate">
                                          {bundle?.name || '---'}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="w-[42%] px-4 py-4">
                                      <div className="flex flex-wrap gap-1.5 max-w-full">
                                        {bundle.items?.map((item, i) => (
                                          <span key={i} className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-slate-200/70">
                                            {item.name}
                                          </span>
                                        ))}
                                      </div>
                                    </td>
                                    <td className="w-[12%] px-4 py-4 text-right">
                                      {totalPrice > 0 ? (
                                        <span className="text-sm font-black text-rose-600 inline-flex items-center gap-1" dir="ltr">
                                          <span className="text-xs font-bold text-rose-500">ر.ي</span>
                                          <span>{Math.round(totalPrice).toLocaleString('en-US')}</span>
                                        </span>
                                      ) : (
                                        <span className="text-xs font-bold text-slate-400">---</span>
                                      )}
                                    </td>
                                    <td className="w-[10%] px-4 py-4 text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <button
                                          onClick={() => handleEditBundle(bundle)}
                                          className="p-2 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-colors"
                                          title="تعديل"
                                        >
                                          <Edit2 size={16} />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteBundle(bundle.id)}
                                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                          title="حذف"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ─── CREATE BUNDLE MODAL ─── */}
      {isCreatingBundle && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm modal-overlay-anim" dir="rtl">
          <div
            className={`bg-white rounded-3xl shadow-luxury overflow-hidden flex flex-col border border-gray-100 animate-scale-in transition-all duration-300 ${isMaximized ? 'w-[98vw] max-w-[98vw] h-[95vh]' : 'w-[96vw] max-w-6xl mx-auto h-[85vh]'}`}
          >
              {/* Header */}
              <div className="flex justify-between items-center p-5 border-b border-gray-150 flex-shrink-0 bg-gray-50/50">
                <h3 className="font-extrabold text-base text-gray-800 flex items-center gap-2">
                  <FolderHeart size={18} className="text-indigo-600" /> بناء حزمة طبية مجمّعة
                </h3>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setIsMaximized(!isMaximized)} className="p-1.5 rounded-xl bg-gray-100 text-gray-500 hover:text-indigo-600">
                    {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                  <button type="button" onClick={() => setIsCreatingBundle(false)} className="p-1.5 rounded-xl bg-gray-100 text-gray-400 hover:text-red-500">
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Form & List */}
              <form onSubmit={handleCreateBundleSubmit} className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className={`grid grid-cols-1 md:grid-cols-12 gap-6 flex-1 overflow-hidden p-6 ${isMaximized ? 'max-w-full w-full' : ''}`}>
                {/* Catalog list selection (Left) */}
                <div className="md:col-span-8 flex flex-col h-full overflow-hidden">
                  {/* Tab System for Bundle Builder */}
                  <div className="flex gap-2 p-1.5 bg-gray-100/80 rounded-2xl mb-4 flex-shrink-0">
                    {[
                      { id: 'lab', label: 'المختبر', icon: FlaskConical },
                      { id: 'radiology', label: 'الأشعة', icon: Radiation },
                      { id: 'clinical', label: 'الخدمات السريرية', icon: Activity }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => { setBundleModalTab(tab.id); setBundleSearchTerm(''); }}
                        className={`flex-1 py-2.5 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 transition-all ${
                          bundleModalTab === tab.id 
                            ? 'bg-white text-indigo-700 shadow-sm border border-gray-100 scale-[1.02]' 
                            : 'text-gray-500 hover:bg-gray-200/50'
                        }`}
                      >
                        <tab.icon size={14} /> {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 mb-4 flex-shrink-0">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                        <Search size={16} strokeWidth={2.2} />
                      </div>
                      <input
                        type="text"
                        placeholder={`البحث عن فحص في قائمة ${bundleModalTab === 'lab' ? 'المختبر' : bundleModalTab === 'radiology' ? 'الأشعة' : 'الخدمات السريرية'}...`}
                        value={bundleSearchTerm}
                        onChange={e => setBundleSearchTerm(e.target.value)}
                        className="w-full bg-slate-50/90 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 shadow-xs transition-all"
                      />
                      {bundleSearchTerm && (
                        <button
                          type="button"
                          onClick={() => setBundleSearchTerm('')}
                          className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          <div className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                            <X size={12} strokeWidth={2.5} />
                          </div>
                        </button>
                      )}
                    </div>
                    <div className="flex bg-slate-100 rounded-2xl p-1 shrink-0 border border-slate-200/50">
                      <button 
                        type="button" 
                        onClick={() => setBundleModalViewMode('grid')} 
                        className={`p-2 rounded-xl transition-all ${bundleModalViewMode === 'grid' ? 'bg-white shadow-xs text-indigo-600 font-black' : 'text-slate-400 hover:text-slate-600'}`}
                        title="عرض شبكي"
                      >
                        <LayoutGrid size={16} strokeWidth={2.2} />
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setBundleModalViewMode('list')} 
                        className={`p-2 rounded-xl transition-all ${bundleModalViewMode === 'list' ? 'bg-white shadow-xs text-indigo-600 font-black' : 'text-slate-400 hover:text-slate-600'}`}
                        title="عرض قائمة"
                      >
                        <List size={16} strokeWidth={2.2} />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-1">
                    {bundleModalViewMode === 'grid' ? (
                      <div className={`grid gap-3.5 transition-all duration-300 ${isMaximized ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                        {filteredCatalogItems.map((item, idx) => {
                          const isChecked = selectedBundleItems.some(s => s.test_id === item.id && s.test_type === item.type);
                          const CatIcon = item.type === 'lab' ? FlaskConical : item.type === 'radiology' ? Radiation : Activity;
                          return (
                            <div
                              key={`${item.type}_${item.id}`}
                              onClick={() => handleToggleBundleSelection(item, item.type)}
                              className={`flex flex-col justify-between p-4 rounded-2xl border cursor-pointer transition-all duration-200 group ${
                                isChecked
                                  ? 'bg-indigo-50/40 border-indigo-300 shadow-sm ring-1 ring-indigo-500/20'
                                  : 'bg-white border-slate-200/80 hover:border-indigo-200 hover:shadow-md'
                              }`}
                            >
                              {/* Top: # */}
                              <div className="flex items-center justify-between gap-2 mb-2.5">
                                <span className="text-[10px] font-black text-slate-400 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100">
                                  {idx + 1}
                                </span>
                              </div>

                              {/* Middle: Service Name */}
                              <div className="flex items-center gap-2.5 my-1 min-w-0">
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                  <CatIcon size={15} />
                                </div>
                                <p className="font-black text-xs text-slate-800 line-clamp-2 leading-relaxed group-hover:text-indigo-700 transition-colors" title={item.name}>
                                  {item.name}
                                </p>
                              </div>

                              {/* Bottom: Price & Checkbox */}
                              <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-100/80">
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-bold text-slate-400 mb-0.5">سعر الخدمة</span>
                                  {renderPrice(item)}
                                </div>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  readOnly
                                  className="w-4 h-4 rounded accent-indigo-600 pointer-events-none cursor-pointer"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white shadow-xs">
                        <table className="w-full text-right table-fixed">
                          <thead className="bg-gradient-to-r from-slate-50 via-indigo-50/20 to-slate-50 text-slate-600 border-b border-slate-200/80">
                            <tr className="text-xs font-black">
                              <th className="w-[8%] py-3 px-3 text-center text-slate-400">#</th>
                              <th className="w-[58%] py-3 px-4 text-right">اسم الخدمة</th>
                              <th className="w-[22%] py-3 px-3 text-right">سعر الخدمة</th>
                              <th className="w-[12%] py-3 px-3 text-center">إضافة</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100/80">
                            {filteredCatalogItems.map((item, idx) => {
                              const isChecked = selectedBundleItems.some(s => s.test_id === item.id && s.test_type === item.type);
                              const CatIcon = item.type === 'lab' ? FlaskConical : item.type === 'radiology' ? Radiation : Activity;
                              return (
                                <tr 
                                  key={`${item.type}_${item.id}`} 
                                  onClick={() => handleToggleBundleSelection(item, item.type)} 
                                  className={`border-b border-slate-100/70 transition-colors cursor-pointer group ${isChecked ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : 'hover:bg-slate-50/60'}`}
                                >
                                  <td className="w-[8%] py-3 px-3 text-center font-black text-slate-400 text-xs">
                                    {idx + 1}
                                  </td>
                                  <td className="w-[58%] py-3 px-4">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                        <CatIcon size={14} />
                                      </div>
                                      <span className="text-xs font-black text-slate-800 group-hover:text-indigo-700 transition-colors truncate" title={item.name}>
                                        {item.name}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="w-[22%] py-3 px-3 text-right">
                                    {renderPrice(item)}
                                  </td>
                                  <td className="w-[12%] py-3 px-3 text-center">
                                    <input 
                                      type="checkbox" 
                                      checked={isChecked} 
                                      readOnly 
                                      className="w-4 h-4 rounded accent-indigo-600 pointer-events-none cursor-pointer" 
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bundle parameters & selected cart (Right) */}
                <div className="md:col-span-4 flex flex-col h-full overflow-hidden bg-slate-50/70 rounded-3xl border border-slate-200/80 p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم الحزمة الطبية المجمّعة *</label>
                    <input
                      type="text"
                      placeholder="مثال: باقة فحوصات السكري الدورية..."
                      value={newBundleName}
                      onChange={e => setNewBundleName(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-indigo-500 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 shadow-xs transition-all"
                      required
                    />
                  </div>

                  <div className="flex items-center justify-between pb-2 border-b border-slate-200/70">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-700">الفحوصات المحددة للإدراج</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-700">
                        {selectedBundleItems.length}
                      </span>
                    </div>
                    {selectedBundleItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedBundleItems([])}
                        className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors"
                      >
                        تفريغ الكل
                      </button>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-0.5">
                    {selectedBundleItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-white/50">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-400 flex items-center justify-center mb-2.5 shadow-xs">
                          <FolderHeart size={22} />
                        </div>
                        <p className="text-xs font-black text-slate-700 mb-1">لم يتم تحديد أي فحوصات</p>
                        <p className="text-[11px] font-semibold text-slate-400 max-w-[200px] leading-relaxed">
                          اختر الفحوصات من القائمة المجاورة لإضافتها إلى هذه الحزمة
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedBundleItems.map((item, idx) => {
                          const CatIcon = item.test_type === 'lab' ? FlaskConical : item.test_type === 'radiology' ? Radiation : Activity;
                          const typeBadge = item.test_type === 'lab' ? 'bg-purple-50 text-purple-700 border-purple-200/70' : item.test_type === 'radiology' ? 'bg-blue-50 text-blue-700 border-blue-200/70' : 'bg-emerald-50 text-emerald-700 border-emerald-200/70';
                          const typeLabel = item.typeLabel || (item.test_type === 'lab' ? 'المختبر' : item.test_type === 'radiology' ? 'الأشعة' : 'الخدمات السريرية');
                          return (
                            <div 
                              key={idx} 
                              className="flex items-center justify-between p-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-indigo-200 transition-all group"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1 pl-2">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                  <CatIcon size={14} />
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-black text-slate-800 truncate" title={item.name}>
                                    {item.name}
                                  </span>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-black border ${typeBadge}`}>
                                      {typeLabel}
                                    </span>
                                    {getPriceNumber(item) && (
                                      <span className="text-xs font-black text-rose-600 whitespace-nowrap inline-flex items-center gap-1" dir="ltr">
                                        <span className="text-[10px] font-bold text-rose-500">ر.ي</span>
                                        <span>{getPriceNumber(item)}</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleToggleBundleSelection({ id: item.test_id }, item.test_type)}
                                className="w-7 h-7 rounded-xl flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                                title="إزالة من الحزمة"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-200/70 space-y-3">
                    {selectedBundleItems.length > 0 && (
                      <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-900">إجمالي التكلفة التقديرية</span>
                        {renderPrice(selectedBundleItems.reduce((acc, it) => acc + (Number(it.price) || 0), 0))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCreatingBundle(false)}
                        className="flex-1 py-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-all"
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        disabled={selectedBundleItems.length === 0 || !newBundleName.trim()}
                        className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl text-xs shadow-md shadow-indigo-200 hover:shadow-lg transition-all disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {editingBundleId ? 'حفظ تعديلات الباقة' : 'إنشاء وحفظ الباقة'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ─── ADD MEDICATION MODAL ─── */}
      {isAddingMed && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm modal-overlay-anim" dir="rtl">
          <div className={`bg-white rounded-3xl shadow-luxury overflow-hidden flex flex-col border border-gray-100 animate-scale-in transition-all duration-300 ${isMaximized ? 'w-[98vw] h-[98vh]' : 'w-full max-w-2xl'}`}>
            <div className="flex justify-between items-center p-5 border-b border-gray-150 flex-shrink-0 bg-gray-50/50">
              <h3 className="font-extrabold text-base text-gray-800 flex items-center gap-2">
                <Pill size={18} className="text-indigo-600" /> إضافة دواء للمفضلة
              </h3>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setIsMaximized(!isMaximized)} className="p-1.5 rounded-xl bg-gray-100 text-gray-500 hover:text-indigo-600">
                  {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button type="button" onClick={() => setIsAddingMed(false)} className="p-1.5 rounded-xl bg-gray-100 text-gray-400 hover:text-red-500">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 min-h-0">
              <div className={`${isMaximized ? 'max-w-6xl mx-auto w-full' : ''}`}>
                <form onSubmit={handleAddFavMedSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">اسم الدواء *</label>
                  <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-200/80 inline-flex items-center gap-1.5 shadow-2xs">
                    <span className="font-black text-indigo-700">{catalogs.medications.length}</span>
                    <span>دواء متاح</span>
                  </span>
                </div>
                <MedicationSelect
                  value={medData.name}
                  onChange={(val) => setMedData(prev => ({ ...prev, name: val }))}
                  options={catalogs.medications.map(m => m.name || m.scientific_name).filter(Boolean)}
                  placeholder="ابحث عن دواء أو اكتب الاسم مباشرة..."
                  theme="indigo"
                />
              </div>
              <div className={`grid gap-4 transition-all duration-300 ${isMaximized ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4' : 'grid-cols-1 md:grid-cols-2'}`}>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">الجرعة</label>
                  <input
                    type="text"
                    list="dosage-suggestions"
                    value={medData.dosage}
                    onChange={e => setMedData(prev => ({ ...prev, dosage: toEnglishDigits(e.target.value) }))}
                    placeholder="مثال: 500mg"
                    className="input-base text-xs font-semibold w-full py-2.5"
                  />
                  <datalist id="dosage-suggestions">
                    <option value="125mg" />
                    <option value="250mg" />
                    <option value="500mg" />
                    <option value="1g" />
                    <option value="5ml" />
                    <option value="10ml" />
                    <option value="حبة واحدة" />
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">التكرار</label>
                  <input
                    type="text"
                    list="frequency-suggestions"
                    value={medData.frequency}
                    onChange={e => setMedData(prev => ({ ...prev, frequency: toEnglishDigits(e.target.value) }))}
                    placeholder="مثال: مرتين يومياً"
                    className="input-base text-xs font-semibold w-full py-2.5"
                  />
                  <datalist id="frequency-suggestions">
                    <option value="مرة واحدة يومياً" />
                    <option value="مرتين يومياً" />
                    <option value="3 مرات يومياً" />
                    <option value="4 مرات يومياً" />
                    <option value="كل 8 ساعات" />
                    <option value="كل 12 ساعة" />
                    <option value="عند اللزوم" />
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">التعليمات والملاحظات</label>
                  <input
                    type="text"
                    list="instructions-suggestions"
                    value={medData.instructions}
                    onChange={e => setMedData(prev => ({ ...prev, instructions: e.target.value }))}
                    placeholder="مثال: بعد الأكل"
                    className="input-base text-xs font-semibold w-full py-2.5"
                  />
                  <datalist id="instructions-suggestions">
                    <option value="بعد الأكل" />
                    <option value="قبل الأكل" />
                    <option value="على الريق" />
                    <option value="قبل النوم" />
                    <option value="مع كمية وافرة من الماء" />
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">المدة</label>
                  <input
                    type="text"
                    list="duration-suggestions"
                    value={medData.duration}
                    onChange={e => setMedData(prev => ({ ...prev, duration: e.target.value }))}
                    placeholder="مثال: لمدة 5 أيام"
                    className="input-base text-xs font-semibold w-full py-2.5"
                  />
                  <datalist id="duration-suggestions">
                    <option value="لمدة 3 أيام" />
                    <option value="لمدة 5 أيام" />
                    <option value="لمدة أسبوع" />
                    <option value="لمدة أسبوعين" />
                    <option value="لمدة شهر" />
                  </datalist>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
                <button type="button" onClick={() => setIsAddingMed(false)} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-colors">
                  إلغاء
                </button>
                <button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs shadow-md">
                  حفظ في المفضلة
                </button>
                </div>
              </form>
            </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ─── ADD TEST MODAL ─── */}
      {isAddingTest && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm modal-overlay-anim" dir="rtl">
          <div className={`bg-white rounded-3xl shadow-luxury overflow-hidden flex flex-col border border-gray-100 animate-scale-in transition-all duration-300 ${isMaximized ? 'w-[98vw] max-w-[98vw] h-[95vh]' : 'w-[96vw] max-w-6xl mx-auto h-[85vh]'}`}>
            <div className="flex justify-between items-center p-5 border-b border-gray-150 flex-shrink-0 bg-gray-50/50">
              <h3 className="font-extrabold text-base text-gray-800 flex items-center gap-2">
                <FlaskConical size={18} className="text-indigo-600" /> {editingFavTestId ? 'تعديل الفحص' : 'إضافة فحص للمفضلة'}
              </h3>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setIsMaximized(!isMaximized)} className="p-1.5 rounded-xl bg-gray-100 text-gray-500 hover:text-indigo-600">
                  {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button type="button" onClick={() => { setIsAddingTest(false); setSelectedFavTestItem(null); setEditingFavTestId(null); setTestSearchTerm(''); }} className="p-1.5 rounded-xl bg-gray-100 text-gray-400 hover:text-red-500">
                  <X size={18} />
                </button>
              </div>
            </div>
            <form onSubmit={handleAddFavTestSubmit} className="flex-1 flex flex-col overflow-hidden min-h-0">
               <div className={`grid grid-cols-1 md:grid-cols-12 gap-6 flex-1 overflow-hidden p-6 ${isMaximized ? 'max-w-full w-full' : ''}`}>
                 {/* Left Pane: Catalog */}
                 <div className="md:col-span-8 flex flex-col h-full overflow-hidden">
                    <div className="flex gap-2 p-1.5 bg-gray-100/80 rounded-2xl mb-4 flex-shrink-0">
                      {[
                        { id: 'lab', label: 'المختبر', icon: FlaskConical },
                        { id: 'radiology', label: 'الأشعة', icon: Radiation },
                        { id: 'clinical', label: 'الخدمات السريرية', icon: Activity }
                      ].map(tab => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => { setTestModalTab(tab.id); setTestSearchTerm(''); }}
                          className={`flex-1 py-2.5 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 transition-all ${
                            testModalTab === tab.id 
                              ? 'bg-white text-indigo-700 shadow-sm border border-gray-100 scale-[1.02]' 
                              : 'text-gray-500 hover:bg-gray-200/50'
                          }`}
                        >
                          <tab.icon size={14} /> {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 mb-4 flex-shrink-0">
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                          <Search size={16} strokeWidth={2.2} />
                        </div>
                        <input
                          type="text"
                          placeholder={`البحث عن فحص في قائمة ${testModalTab === 'lab' ? 'المختبر' : testModalTab === 'radiology' ? 'الأشعة' : 'الخدمات السريرية'}...`}
                          value={testSearchTerm}
                          onChange={e => setTestSearchTerm(e.target.value)}
                          className="w-full bg-slate-50/90 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 shadow-xs transition-all"
                        />
                        {testSearchTerm && (
                          <button
                            type="button"
                            onClick={() => setTestSearchTerm('')}
                            className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <div className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                              <X size={12} strokeWidth={2.5} />
                            </div>
                          </button>
                        )}
                      </div>
                      <div className="flex bg-slate-100 rounded-2xl p-1 shrink-0 border border-slate-200/50">
                        <button 
                          type="button" 
                          onClick={() => setTestModalViewMode('grid')} 
                          className={`p-2 rounded-xl transition-all ${testModalViewMode === 'grid' ? 'bg-white shadow-xs text-indigo-600 font-black' : 'text-slate-400 hover:text-slate-600'}`}
                          title="عرض شبكي"
                        >
                          <LayoutGrid size={16} strokeWidth={2.2} />
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setTestModalViewMode('list')} 
                          className={`p-2 rounded-xl transition-all ${testModalViewMode === 'list' ? 'bg-white shadow-xs text-indigo-600 font-black' : 'text-slate-400 hover:text-slate-600'}`}
                          title="عرض قائمة"
                        >
                          <List size={16} strokeWidth={2.2} />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1">
                      {testModalViewMode === 'grid' ? (
                        <div className={`grid gap-3.5 transition-all duration-300 ${isMaximized ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                          {(catalogs[testModalTab]?.filter(i => !testSearchTerm.trim() || i.name?.toLowerCase().includes(testSearchTerm.toLowerCase())) || []).map((item, idx) => {
                            const isSelected = selectedFavTestItem?.id === item.id && selectedFavTestItem?.test_type === testModalTab;
                            const CatIcon = testModalTab === 'lab' ? FlaskConical : testModalTab === 'radiology' ? Radiation : Activity;
                            const typeLabel = testModalTab === 'lab' ? 'المختبر' : testModalTab === 'radiology' ? 'الأشعة' : 'الخدمات السريرية';
                            return (
                              <div
                                key={item.id}
                                onClick={() => setSelectedFavTestItem({ ...item, test_type: testModalTab, typeLabel })}
                                className={`flex flex-col justify-between p-4 rounded-2xl border cursor-pointer transition-all duration-200 group ${
                                  isSelected
                                    ? 'bg-indigo-50/40 border-indigo-300 shadow-sm ring-1 ring-indigo-500/20'
                                    : 'bg-white border-slate-200/80 hover:border-indigo-200 hover:shadow-md'
                                }`}
                              >
                                {/* Top: # */}
                                <div className="flex items-center justify-between gap-2 mb-2.5">
                                  <span className="text-[10px] font-black text-slate-400 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100">
                                    {idx + 1}
                                  </span>
                                </div>

                                {/* Middle: Service Name */}
                                <div className="flex items-center gap-2.5 my-1 min-w-0">
                                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                    <CatIcon size={15} />
                                  </div>
                                  <p className="font-black text-xs text-slate-800 line-clamp-2 leading-relaxed group-hover:text-indigo-700 transition-colors" title={item.name}>
                                    {item.name}
                                  </p>
                                </div>

                                  {/* Bottom: Price & Selection Radio */}
                                  <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-100/80">
                                    <div className="flex flex-col">
                                      <span className="text-[9px] font-bold text-slate-400 mb-0.5">سعر الخدمة</span>
                                      {renderPrice(item)}
                                    </div>
                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}>
                                      {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                    </div>
                                  </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white shadow-xs">
                          <table className="w-full text-right table-fixed">
                            <thead className="bg-gradient-to-r from-slate-50 via-indigo-50/20 to-slate-50 text-slate-600 border-b border-slate-200/80">
                              <tr className="text-xs font-black">
                                <th className="w-[8%] py-3 px-3 text-center text-slate-400">#</th>
                                <th className="w-[58%] py-3 px-4 text-right">اسم الخدمة</th>
                                <th className="w-[22%] py-3 px-3 text-right">سعر الخدمة</th>
                                <th className="w-[12%] py-3 px-3 text-center">اختيار</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/80">
                              {(catalogs[testModalTab]?.filter(i => !testSearchTerm.trim() || i.name?.toLowerCase().includes(testSearchTerm.toLowerCase())) || []).map((item, idx) => {
                                const isSelected = selectedFavTestItem?.id === item.id && selectedFavTestItem?.test_type === testModalTab;
                                const CatIcon = testModalTab === 'lab' ? FlaskConical : testModalTab === 'radiology' ? Radiation : Activity;
                                const typeLabel = testModalTab === 'lab' ? 'المختبر' : testModalTab === 'radiology' ? 'الأشعة' : 'الخدمات السريرية';
                                return (
                                  <tr 
                                    key={item.id} 
                                    onClick={() => setSelectedFavTestItem({ ...item, test_type: testModalTab, typeLabel })} 
                                    className={`border-b border-slate-100/70 transition-colors cursor-pointer group ${isSelected ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : 'hover:bg-slate-50/60'}`}
                                  >
                                    <td className="w-[8%] py-3 px-3 text-center font-black text-slate-400 text-xs">
                                      {idx + 1}
                                    </td>
                                    <td className="w-[58%] py-3 px-4">
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                          <CatIcon size={14} />
                                        </div>
                                        <span className="text-xs font-black text-slate-800 group-hover:text-indigo-700 transition-colors truncate" title={item.name}>
                                          {item.name}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="w-[22%] py-3 px-3 text-right">
                                      {renderPrice(item)}
                                    </td>
                                    <td className="w-[12%] py-3 px-3 text-center">
                                      <div className={`w-4 h-4 mx-auto rounded-full border flex items-center justify-center transition-all ${isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}>
                                        {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                 </div>

                 {/* Right Pane: Selected Details */}
                 <div className="md:col-span-4 flex flex-col h-full overflow-hidden bg-slate-50/70 rounded-3xl border border-slate-200/80 p-5 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/70">
                      <span className="text-xs font-black text-slate-700">الفحص المحدد</span>
                      {selectedFavTestItem && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-700">
                          تم التحديد
                        </span>
                      )}
                    </div>

                    {/* Preview Area */}
                    <div className="flex-1 overflow-y-auto min-h-0 flex flex-col justify-center">
                      {!selectedFavTestItem ? (
                        <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-white/50">
                          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-400 flex items-center justify-center mx-auto mb-2.5 shadow-xs">
                            <FlaskConical size={22} />
                          </div>
                          <p className="text-xs font-black text-slate-700 mb-1">لم يتم تحديد فحص</p>
                          <p className="text-[11px] font-semibold text-slate-400 max-w-[200px] mx-auto leading-relaxed">
                            اختر فحصاً من القائمة المجاورة لعرض تفاصيله وإضافته إلى مفضلاتك
                          </p>
                        </div>
                      ) : (
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-4">
                          {/* Category Badge & Code */}
                          <div className="flex items-center justify-between">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black border ${
                              selectedFavTestItem.test_type === 'lab' ? 'bg-purple-50 text-purple-700 border-purple-200/70' :
                              selectedFavTestItem.test_type === 'radiology' ? 'bg-blue-50 text-blue-700 border-blue-200/70' :
                              'bg-emerald-50 text-emerald-700 border-emerald-200/70'
                            }`}>
                              {selectedFavTestItem.test_type === 'lab' ? <FlaskConical size={14} /> :
                               selectedFavTestItem.test_type === 'radiology' ? <Radiation size={14} /> :
                               <Activity size={14} />}
                              {selectedFavTestItem.typeLabel || (selectedFavTestItem.test_type === 'lab' ? 'المختبر' : selectedFavTestItem.test_type === 'radiology' ? 'الأشعة' : 'الخدمات السريرية')}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold">
                              #{selectedFavTestItem.id}
                            </span>
                          </div>

                          {/* Service Name */}
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 block mb-1">اسم الخدمة</span>
                            <h4 className="text-sm font-black text-slate-800 leading-snug">
                              {selectedFavTestItem.name}
                            </h4>
                          </div>

                          {/* Service Price */}
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-600">سعر الخدمة</span>
                            {renderPrice(selectedFavTestItem)}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Actions */}
                    <div className="pt-3 border-t border-slate-200/70 flex gap-2">
                      <button 
                        type="button" 
                        onClick={() => { setIsAddingTest(false); setSelectedFavTestItem(null); setEditingFavTestId(null); setTestSearchTerm(''); }} 
                        className="flex-1 py-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-all"
                      >
                        إلغاء
                      </button>
                      <button 
                        type="submit" 
                        disabled={!selectedFavTestItem}
                        className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl text-xs shadow-md shadow-indigo-200 hover:shadow-lg transition-all disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {editingFavTestId ? 'حفظ التعديلات' : 'إضافة للمفضلة'}
                      </button>
                    </div>
                 </div>
               </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ─── CUSTOM DELETE CONFIRMATION MODAL ─── */}
      {deleteConfirm.isOpen && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm modal-overlay-anim" dir="rtl">
          <div className="bg-white rounded-3xl shadow-luxury overflow-hidden flex flex-col border border-gray-100 animate-scale-in transition-all duration-300 w-full max-w-md">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2">
                <Trash2 size={32} />
              </div>
              <h3 className="font-extrabold text-lg text-gray-800">تأكيد الحذف</h3>
              <p className="text-gray-500 text-sm font-semibold leading-relaxed">
                هل أنت متأكد من حذف <span className="text-red-500 font-black">{deleteConfirm.name}</span> من المفضلة؟
              </p>
            </div>
            <div className="flex gap-3 p-4 bg-gray-50/50 border-t border-gray-150">
              <button 
                onClick={() => setDeleteConfirm({ isOpen: false, item: null, type: '', name: '' })}
                className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl text-sm transition-colors"
              >
                إلغاء
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-black rounded-xl text-sm shadow-md transition-colors"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
