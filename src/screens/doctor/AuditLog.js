import React, { useState, useEffect, useCallback } from 'react';
import { ScrollText, Search, RefreshCcw, User, Clock, Database } from 'lucide-react';
import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';

const TABLE_AR = {
  settings:          'الإعدادات',
  users:             'المستخدمون',
  patients:          'المرضى',
  visits:            'الزيارات',
  lab_tests:         'التحاليل',
  radiology_tests:   'الأشعة',
  financial_transactions: 'المعاملات المالية',
};

const ACTION_COLOR = {
  update: 'bg-amber-100 text-amber-700',
  insert: 'bg-emerald-100 text-emerald-700',
  delete: 'bg-red-100 text-red-700',
};

const AuditLog = () => {
  const { token } = useAuthStore();
  const [logs, setLogs]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery]   = useState('');
  const [limit, setLimit]   = useState(100);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/audit-log?limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      toast.error('فشل تحميل سجل التدقيق');
    } finally {
      setLoading(false);
    }
  }, [token, limit]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const filtered = logs.filter(r =>
    !query
    || r.action?.includes(query)
    || r.table_name?.includes(query)
    || r.user_name?.includes(query)
  );

  const parseJson = (val) => {
    try { return val ? JSON.stringify(JSON.parse(val), null, 2) : null; }
    catch { return val; }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-gray-800">سجل التدقيق</h1>
          <p className="text-xs text-gray-400 mt-1 font-semibold">جميع التغييرات الحساسة في النظام</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={limit} onChange={e=>setLimit(Number(e.target.value))}
            className="input-base text-sm py-2 px-3">
            {[50,100,200,500].map(n=><option key={n} value={n}>آخر {n}</option>)}
          </select>
          <button onClick={fetchLogs} disabled={loading}
            className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCcw size={14} className={loading?'animate-spin':''}/> تحديث
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"/>
        <input value={query} onChange={e=>setQuery(e.target.value)}
          className="input-base pr-9 text-sm" placeholder="ابحث في السجل (اسم المستخدم، الإجراء، الجدول)..."/>
      </div>

      {/* Count */}
      <p className="text-xs text-gray-400 mb-3">{filtered.length} نتيجة</p>

      {/* Log Entries */}
      <div className="space-y-2">
        {loading ? [1,2,3,4].map(i=>(
          <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse"/>
        )) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Database size={40} className="mx-auto mb-3 opacity-20"/>
            <p className="text-sm">لا توجد سجلات</p>
          </div>
        ) : filtered.map((entry, i) => (
          <div key={entry.id || i}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-start gap-4 animate-fade-in"
            style={{ animationDelay: `${Math.min(i*0.03, 0.3)}s`, animationFillMode: 'both' }}
          >
            <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
              <ScrollText size={14} className="text-gray-500"/>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ACTION_COLOR[entry.action]||'bg-gray-100 text-gray-600'}`}>
                  {entry.action}
                </span>
                <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-600 font-semibold">
                  {TABLE_AR[entry.table_name] || entry.table_name}
                </span>
                {entry.record_id && (
                  <span className="text-xs text-gray-400 font-mono">#{entry.record_id}</span>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <User size={11}/> {entry.user_name || 'النظام'}
                  {entry.user_role && <span className="text-gray-400">({entry.user_role})</span>}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={11}/>
                  {new Date(entry.created_at).toLocaleString('ar',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
                </span>
              </div>

              {/* Old → New */}
              {(entry.old_values || entry.new_values) && (
                <div className="flex items-start gap-2 mt-2 text-xs font-mono flex-wrap">
                  {entry.old_values && (
                    <span className="px-2 py-1 rounded-lg bg-red-50 text-red-600 max-w-xs truncate">
                      {parseJson(entry.old_values)}
                    </span>
                  )}
                  {entry.old_values && entry.new_values && <span className="text-gray-400 mt-1">←</span>}
                  {entry.new_values && (
                    <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 max-w-xs truncate">
                      {parseJson(entry.new_values)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AuditLog;
