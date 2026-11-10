import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, User, Hash, CheckSquare, Clock, Package } from 'lucide-react';

import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import { toast } from 'react-toastify';

const STATUS_AR = {
  registered:                       'تسجيل جديد',
  pending_payment:                  'انتظار دفع',
  waiting:                          'انتظار الطبيب',
  with_doctor:                      'مع الطبيب',
  awaiting_service_payment:         'انتظار دفع خدمات',
  completed_admin_pending_services: 'خدمات معلقة',
  awaiting_surgery:                 'بانتظار العملية',
  transferred_to_center:            'محول للعمليات',
  completed:                        'مكتمل',
  cancelled:                        'ملغي',
};

const GlobalSearch = () => {
  const { token, user } = useAuthStore();
  const navigate  = useNavigate();
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const timer    = useRef(null);

  const search = useCallback(async (q) => {
    const isStoreRole = ['general_store', 'or_store'].includes(user?.role);
    if (q.trim().length < (isStoreRole ? 1 : 2)) { setResults([]); return; }
    setLoading(true);
    try {
      const isStoreRole = ['general_store', 'or_store'].includes(user?.role);
      const endpoint = isStoreRole ? `/api/search?q=${encodeURIComponent(q)}` : `/api/search?q=${encodeURIComponent(q)}`;
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, [token, user?.role]);

  useEffect(() => {
    clearTimeout(timer.current);
    const isStoreRole = ['general_store', 'or_store'].includes(user?.role);
    if (query.trim().length >= (isStoreRole ? 1 : 2)) {
      timer.current = setTimeout(() => search(query), 350);
    } else {
      setResults([]);
    }
  }, [query, search]);

  // Keyboard shortcut Ctrl+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      if (e.key === 'Escape') { setOpen(false); setQuery(''); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = (item) => {
    if (user?.role === 'doctor') {
      const today = new Date().toISOString().split('T')[0];
      const isToday = item.visit_date && item.visit_date.startsWith(today);
      if (isToday && item.visitId) {
        navigate('/doctor/queue', { state: { autoOpenVisitId: item.visitId } });
      } else {
        navigate('/doctor/archive', { state: { autoOpenPatientId: item.patient_id } });
      }
    } else if (user?.role === 'secretary' || user?.role === 'receptionist') {
      navigate('/secretary/patients', { state: { openPatientId: item.patient_id } });
    } else if (user?.role === 'lab') {
      navigate(`/lab/reports?visitId=${item.visitId}`);
    } else if (user?.role === 'radiology') {
      navigate(`/radiology/reports?visitId=${item.visitId}`);
    } else if (user?.role === 'general_store') {
      if (item.result_type === 'stocktaking_session') {
        navigate('/general-store/stocktaking', { state: { highlightSessionId: item.session_id } });
      } else {
        navigate('/general-store/items', { state: { highlightItemId: item.item_id } });
      }
    } else if (user?.role === 'or_store') {
      if (item.result_type === 'stocktaking_session') {
        navigate('/or-store/stocktaking', { state: { highlightSessionId: item.session_id } });
      } else {
        navigate('/or-store/items', { state: { highlightItemId: item.item_id } });
      }
    } else {
      toast.info("ميزة البحث غير مفعلة لهذا الحساب حالياً", {
        position: "bottom-center"
      });
    }
    setOpen(false);
    setQuery('');
    setResults([]);
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 100); }}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors text-sm min-w-[180px] border border-gray-200"
      >
        <Search size={15}/>
        <span className="flex-1 text-right text-gray-400">بحث سريع...</span>
        <span className="text-xs text-gray-300 font-mono bg-gray-200 px-1.5 py-0.5 rounded">Ctrl K</span>
      </button>

      {/* Search Modal */}
      
        {open && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4" dir="rtl">
            {/* Backdrop */}
            <div 
              className="animate-in fade-in duration-200 absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => { setOpen(false); setQuery(''); }}
            />

            {/* Modal */}
            <div
              className="animate-in fade-in zoom-in-95 duration-200 relative z-10 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200"
            >
              {/* Input */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-white/50">
                <Search size={20} className="text-gray-400 flex-shrink-0"/>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={['general_store', 'or_store'].includes(user?.role) ? "ابحث باسم الصنف، النوع، رقم الجرد..." : "ابحث بالاسم، رقم الهاتف، الملف، رقم الزيارة..."}
                  className="flex-1 outline-none bg-transparent text-gray-800 text-base placeholder:text-gray-400 placeholder:font-light"
                  autoComplete="off"
                />
                {query && (
                  <button onClick={() => { setQuery(''); setResults([]); }}
                    className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 transition-colors">
                    <X size={16}/>
                  </button>
                )}
                {loading && <span className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin flex-shrink-0"/>}
              </div>

              {/* Results */}
              <div className="max-h-[350px] overflow-y-auto">
                {results.length === 0 && query.trim().length >= 2 && !loading ? (
                  <div className="text-center py-12 text-gray-400 text-sm">لا توجد نتائج</div>
                ) : results.map((r, i) => (
                  <button key={r.id || r.item_id || i}
                    onClick={() => handleSelect(r)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 hover:scale-[1.01] transition-all duration-200 text-right border-b border-gray-50 last:border-0"
                  >
                    <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {r.full_name?.charAt(0)}
                    </div>
                    
                    {['general_store', 'or_store'].includes(user?.role) ? (
                      // Store Result Card (Item or Stocktake)
                      r.result_type === 'stocktaking_session' ? (
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-800 text-sm flex items-center gap-2">
                            <CheckSquare size={14} className="text-blue-500" />
                            جلسة جرد (رقم {r.session_id})
                          </p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <Clock size={10}/> {new Date(r.created_at).toLocaleDateString('ar')}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {r.status === 'completed' ? 'مكتملة' : 'مسودة'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-800 text-sm">{r.full_name}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <Package size={10}/> {r.category || '—'}
                            </span>
                            {r.quantity !== undefined && (
                              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                {r.quantity} {r.category || 'وحدة'}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    ) : (
                      // Patient Result Card
                      <>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-800 text-sm">{r.full_name}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <Hash size={10}/> {r.visit_number || '—'}
                            </span>
                            {r.phone && <span className="flex items-center gap-1 text-xs text-gray-400">{r.phone}</span>}
                            {r.age && <span className="text-xs text-gray-400">{r.age} سنة</span>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {r.status && !['doctor', 'secretary', 'lab', 'radiology'].includes(user?.role) && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap flex-shrink-0">
                              {STATUS_AR[r.status] || r.status}
                            </span>
                          )}
                          
                          {user?.role === 'radiology' && r.radiology_count > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap flex-shrink-0 font-bold">
                              {r.radiology_count} أشعة
                            </span>
                          )}
                          
                          {user?.role === 'lab' && r.lab_count > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 whitespace-nowrap flex-shrink-0 font-bold">
                              {r.lab_count} تحليل
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </button>
                ))}

                {!query && (
                  <div className="text-center py-8 text-gray-400">
                    <Search size={28} className="mx-auto mb-2 opacity-20"/>
                    <p className="text-sm">ابدأ الكتابة للبحث</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      
    </>
  );
};

export default GlobalSearch;
