import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Minus, Search, Edit2, AlertCircle, Package, Trash2, Check, X, LayoutList, LayoutGrid, Maximize2, Minimize2, CalendarX, Filter, Activity, TrendingDown, Clock, XCircle, Info, PackagePlus, Edit3, Tag, AlertTriangle, CircleDollarSign, Calendar, AlignLeft, Eye, ChevronDown, Layers } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';
import ItemDetailsModal, { ItemEditModal } from '../../components/storeCommon/ItemDetailsModal';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';
import taffyot from '../../utils/taffyot';

// ── Main Component ────────────────────────────────────────────────
const Items = () => {
  const { token } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [modal, setModal] = useState({ isOpen: false, item: null });
  const [detailsModal, setDetailsModal] = useState({ isOpen: false, item: null });
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, item: null, loading: false });

  const [search, setSearch] = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [showUnitMenu, setShowUnitMenu] = useState(false);
  const [unitDropdownSearch, setUnitDropdownSearch] = useState('');
  const [stockStatus, setStockStatus] = useState('all');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [dateFilter, setDateFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [stats, setStats] = useState({ totalItems: 0, lowStock: 0, outOfStock: 0, expiring: 0 });
  
  const [allUnits, setAllUnits] = useState([]);
  const lastFetchRef = useRef(0);

  useEffect(() => {
    const highlightItemId = location.state?.highlightItemId;
    if (highlightItemId) {
      const fetchHighlightedItem = async () => {
        try {
          const res = await fetch(`/api/inventory/general/items/${highlightItemId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const itemData = await res.json();
          if (res.ok && itemData) {
            setDetailsModal({ isOpen: true, item: itemData });
            navigate(location.pathname, { replace: true, state: {} });
          }
        } catch (error) {
          console.error("Error fetching highlighted item", error);
        }
      };
      fetchHighlightedItem();
    }
  }, [location.state?.highlightItemId, token, navigate, location.pathname]);

  const latestSilentUpdate = useSocketStore(s => s.latestSilentUpdate);

  // Fetch unique units once
  useEffect(() => {
    fetch('/api/inventory/general/items', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAllUnits([...new Set(data.map(i => i.unit).filter(Boolean))].sort());
        }
      })
      .catch(() => {});
  }, [token]);

  const fetchItems = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchRef.current < 500) return;
    lastFetchRef.current = now;
    
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page,
        limit: 10000,
        search,
        unit: filterUnit,
        stockStatus: stockStatus !== 'all' ? stockStatus : '',
        dateFilter: dateFilter !== 'all' ? dateFilter : '',
        startDate,
        endDate
      });
      const res = await fetch(`/api/inventory/general/items?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setItems(data.items || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalItems(data.pagination?.totalItems || 0);
        if (data.stats) setStats(data.stats);
      } else {
        toast.error(data.message || 'تعذر تحميل بيانات الأصناف، يرجى التحقق من الاتصال بالخادم.', { toastId: 'items-load-error' });
      }
    } catch {
      toast.error('تعذر تحميل بيانات الأصناف، يرجى التحقق من الاتصال بالخادم.', { toastId: 'items-load-error' });
    } finally {
      setLoading(false);
    }
  }, [token, page, search, filterUnit, stockStatus, dateFilter, startDate, endDate]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    if (latestSilentUpdate?.type === 'inventory') fetchItems();
  }, [latestSilentUpdate, fetchItems]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, filterUnit, stockStatus, dateFilter, startDate, endDate]);

  const confirmDelete = async () => {
    if (!deleteModal.item) return;
    setDeleteModal(prev => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/inventory/general/items/${deleteModal.item.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        fetchItems();
      } else {
        toast.error(data.message);
      }
    } catch { toast.error('تعذر حذف الصنف، يرجى التحقق من الاتصال بالخادم.', { toastId: 'item-delete-error' }); }
    setDeleteModal({ isOpen: false, item: null, loading: false });
  };

  return (
    <div dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="text-emerald-600" />
            الأصناف العامة
          </h1>
          <p className="text-gray-500 mt-1">إدارة وتعريف الأصناف في المخزن العام</p>
        </div>
        <button onClick={() => setModal({ isOpen: true, item: null })}
          className="btn-primary bg-emerald-600 hover:bg-emerald-700 flex items-center gap-2">
          <Plus size={18} /> صنف جديد
        </button>
      </div>

      {/* Dynamic Ledger Stats (Unified KPI Design) */}
      {(() => {
        const itemCards = [
          {
            label: 'إجمالي الأصناف',
            rawValue: Number(stats.totalItems || 0),
            value: (stats.totalItems || 0).toLocaleString('en-US'),
            unit: 'صنف',
            sub: 'إجمالي الأصناف المسجلة في الدليل',
            icon: Package,
            color: 'text-indigo-600',
            valColor: 'text-indigo-700',
            bg: 'bg-indigo-100',
            border: 'border-indigo-200',
            statusKey: 'all'
          },
          {
            label: 'تحت الحد الأدنى',
            rawValue: Number(stats.lowStock || 0),
            value: (stats.lowStock || 0).toLocaleString('en-US'),
            unit: 'صنف',
            sub: 'أصناف وصلت للحد الأدنى للطلب',
            icon: TrendingDown,
            color: 'text-amber-600',
            valColor: 'text-amber-700',
            bg: 'bg-amber-100',
            border: 'border-amber-200',
            statusKey: 'low'
          },
          {
            label: 'وشيكة أو منتهية الصلاحية',
            rawValue: Number(stats.expiring || 0),
            value: (stats.expiring || 0).toLocaleString('en-US'),
            unit: 'صنف',
            sub: 'أصناف منتهية أو قريبة الانتهاء',
            icon: Clock,
            color: 'text-purple-600',
            valColor: 'text-purple-700',
            bg: 'bg-purple-100',
            border: 'border-purple-200',
            statusKey: 'expiring'
          },
          {
            label: 'أصناف نفدت',
            rawValue: Number(stats.outOfStock || 0),
            value: (stats.outOfStock || 0).toLocaleString('en-US'),
            unit: 'صنف',
            sub: 'أصناف رصيدها الحالي صفر بالمخزن',
            icon: XCircle,
            color: 'text-rose-600',
            valColor: 'text-rose-700',
            bg: 'bg-rose-100',
            border: 'border-rose-200',
            statusKey: 'out'
          }
        ].filter(s => s.rawValue > 0);

        if (itemCards.length === 0) return null;

        const gridColsClass =
          itemCards.length === 1 ? 'grid-cols-1 sm:max-w-[340px]' :
          itemCards.length === 2 ? 'grid-cols-1 sm:grid-cols-2 sm:max-w-[694px]' :
          itemCards.length === 3 ? 'grid-cols-1 sm:grid-cols-3' :
          'grid-cols-2 md:grid-cols-4';

        return (
          <div className={`grid ${gridColsClass} gap-3.5 mb-6`}>
            {itemCards.map((s, i) => (
              <div
                key={i}
                onClick={() => { setStockStatus(stockStatus === s.statusKey && s.statusKey !== 'all' ? 'all' : s.statusKey); setPage(1); }}
                className={`p-4 rounded-2xl border ${s.border} bg-white shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden flex flex-col justify-between isolate group cursor-pointer ${
                  stockStatus === s.statusKey && s.statusKey !== 'all' ? 'ring-2 ring-offset-1 ring-emerald-500/40' : ''
                }`}
              >
                <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${s.bg} to-transparent opacity-50 rounded-bl-full z-[-1] transition-transform duration-500 group-hover:scale-110`} />
                <div className="flex justify-between items-center mb-3">
                  <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center shadow-sm transition-transform group-hover:scale-105`}>
                    <s.icon size={16} className={s.color} />
                  </div>
                  <span className={`text-xs font-bold ${s.color}`}>
                    {s.label}
                  </span>
                </div>
                <div>
                  <p className={`text-xl font-black ${s.valColor || 'text-gray-800'} flex items-baseline justify-end gap-1.5`} dir="ltr">
                    {s.unit ? <span className="text-xs font-bold text-gray-400 uppercase">{s.unit}</span> : null}
                    <span>{s.value}</span>
                  </p>
                  {s.sub ? (
                    <p className="text-[10px] text-gray-400 font-semibold mt-1 truncate text-right" title={s.sub} dir="rtl">
                      {s.sub}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        {/* Header (مثل قائمة سجل الإجراءات في لوحة التحكم) */}
        <div className="relative z-30 bg-white/90 backdrop-blur-xl border-b border-gray-100 p-6 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-100 text-indigo-600 flex items-center justify-center shadow-inner">
              <Layers size={22} />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-800">قائمة الأصناف</h3>
              <p className="text-slate-500 text-sm font-bold mt-0.5">إدارة ومتابعة الأصناف والكميات المتوفرة وتواريخ الصلاحية</p>
            </div>
          </div>

          {/* فلتر حالة الأصناف في الطرف الأيسر بنفس صف العنوان */}
          <div className="flex items-center gap-3 w-full xl:w-auto justify-end">
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowStatusMenu(!showStatusMenu);
                  setShowUnitMenu(false);
                }}
                className={`h-10 px-3.5 rounded-2xl border text-xs font-bold transition-all flex items-center justify-between gap-2 cursor-pointer shadow-xs min-w-[170px] ${
                  stockStatus !== 'all'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-black'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Activity size={14} className={stockStatus !== 'all' ? 'text-emerald-600' : 'text-slate-500'} />
                  <span className="truncate">
                    {stockStatus === 'all'
                      ? 'حالة الصنف: الكل'
                      : stockStatus === 'low'
                      ? 'قريبة من الحد'
                      : stockStatus === 'out'
                      ? 'نفدت'
                      : 'وشيكة أو منتهية'}
                  </span>
                </div>
                <ChevronDown size={14} className={`transition-transform duration-200 text-slate-400 shrink-0 ${showStatusMenu ? 'rotate-180' : ''}`} />
              </button>

              {showStatusMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowStatusMenu(false)} />
                  <div className="absolute left-0 mt-1.5 w-52 bg-white rounded-2xl shadow-xl border border-slate-100 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-1">
                    {[
                      { id: 'all', label: 'كل الحالات', icon: Layers },
                      { id: 'low', label: 'قريبة من الحد', icon: AlertTriangle, color: 'text-amber-500' },
                      { id: 'out', label: 'نفدت الكمية', icon: XCircle, color: 'text-rose-500' },
                      { id: 'expiring', label: 'وشيكة أو منتهية', icon: Clock, color: 'text-purple-500' },
                    ].map(s => {
                      const Icon = s.icon;
                      const isSel = stockStatus === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setStockStatus(s.id);
                            setShowStatusMenu(false);
                          }}
                          className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between cursor-pointer ${
                            isSel ? 'bg-emerald-50 text-emerald-700 font-black' : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <Icon size={14} className={s.color || 'text-slate-500'} />
                            {s.label}
                          </span>
                          {isSel && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* --- FILTER BAR (Matching CashierReports.js) --- */}
        <div className="p-5 border-b border-gray-100 bg-white flex flex-col space-y-4">
          
          <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4">
            
            {/* Search Bar */}
            <div className="relative w-full xl:w-96">
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                  <Search size={16} strokeWidth={2.2} />
                </div>
                <input
                  type="text"
                  placeholder="بحث باسم أو وصف الصنف..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white/90 backdrop-blur-md border border-slate-200/90 focus:border-emerald-500 rounded-2xl pr-10 pl-10 py-2.5 text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-200/60 shadow-xs transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    title="مسح البحث"
                  >
                    <div className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                      <X size={12} strokeWidth={2.5} />
                    </div>
                  </button>
                )}
              </div>
            </div>

            {/* Right Side: Temporal Tabs + Unit Dropdown */}
            <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto justify-between xl:justify-end">
              {/* Time Filter Tabs */}
              <div className="flex gap-1 bg-gray-100/90 p-1.5 rounded-2xl text-xs font-bold text-gray-500 overflow-x-auto">
                {[
                  { id: 'all', label: 'الكل' },
                  { id: 'today', label: 'اليوم' },
                  { id: '7days', label: 'هذا الأسبوع' },
                  { id: '30days', label: 'هذا الشهر' },
                  { id: 'custom', label: 'تاريخ مخصص' },
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setDateFilter(f.id)}
                    className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap text-xs font-bold cursor-pointer ${
                      dateFilter === f.id ? 'bg-white text-emerald-800 shadow-xs font-black' : 'hover:bg-white/40 text-gray-600'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* فلتر نوع الصنف */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowUnitMenu(!showUnitMenu);
                    setShowStatusMenu(false);
                  }}
                  className={`h-10 px-3.5 rounded-2xl border text-xs font-bold transition-all flex items-center justify-between gap-2 cursor-pointer shadow-xs min-w-[170px] ${
                    filterUnit
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-black'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Tag size={14} className={filterUnit ? 'text-emerald-600' : 'text-slate-500'} />
                    <span className="truncate">
                      {filterUnit ? `النوع: ${filterUnit}` : 'نوع الصنف: الكل'}
                    </span>
                  </div>
                  <ChevronDown size={14} className={`transition-transform duration-200 text-slate-400 shrink-0 ${showUnitMenu ? 'rotate-180' : ''}`} />
                </button>

                {showUnitMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUnitMenu(false)} />
                    <div className="absolute left-0 mt-1.5 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                      <div className="relative mb-2">
                        <input
                          type="text"
                          placeholder="بحث في الأنواع..."
                          value={unitDropdownSearch}
                          onChange={(e) => setUnitDropdownSearch(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-56 overflow-y-auto space-y-0.5 custom-scrollbar">
                        <button
                          type="button"
                          onClick={() => {
                            setFilterUnit('');
                            setShowUnitMenu(false);
                          }}
                          className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between cursor-pointer ${
                            !filterUnit ? 'bg-emerald-50 text-emerald-700 font-black' : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <Layers size={14} className={!filterUnit ? 'text-emerald-600' : 'text-slate-400'} />
                            كل الأنواع
                          </span>
                          {!filterUnit && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />}
                        </button>
                        {allUnits
                          .filter(u => !unitDropdownSearch || u.toLowerCase().includes(unitDropdownSearch.toLowerCase()))
                          .map(u => (
                            <button
                              key={u}
                              type="button"
                              onClick={() => {
                                setFilterUnit(u);
                                setShowUnitMenu(false);
                              }}
                              className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-between cursor-pointer ${
                                filterUnit === u ? 'bg-emerald-50 text-emerald-700 font-black' : 'text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <span className="truncate">{u}</span>
                              {filterUnit === u && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />}
                            </button>
                          ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Custom Date Range Picker */}
          {dateFilter === 'custom' && (
            <div className="p-4 bg-emerald-50/40 rounded-2xl border border-emerald-100/80 flex flex-wrap gap-4 items-center animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-800">من تاريخ:</span>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={e => setStartDate(e.target.value)} 
                  className="px-3 py-1.5 bg-white border border-emerald-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-800">إلى تاريخ:</span>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={e => setEndDate(e.target.value)} 
                  className="px-3 py-1.5 bg-white border border-emerald-200/80 rounded-xl text-xs font-bold outline-none text-slate-700 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-2 mr-auto">
                <button 
                  type="button"
                  onClick={() => { setStartDate(''); setEndDate(''); setDateFilter('all'); setPage(1); }}
                  className="px-4 py-1.5 text-xs bg-white text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl font-bold border border-slate-200 transition-colors cursor-pointer"
                >
                  إعادة تعيين
                </button>
                <button 
                  type="button"
                  onClick={() => setPage(1)}
                  className="px-4 py-1.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                >
                  تطبيق الفلتر
                </button>
              </div>
            </div>
          )}

          {/* Results Counter & Reset Filters */}
          <div className="flex justify-between items-center pt-3 border-t border-gray-100/80 text-xs font-semibold text-slate-500">
            <span>
              تم العثور على <span className="text-emerald-700 font-black">{totalItems}</span> من الأصناف
            </span>
            {(search || filterUnit || stockStatus !== 'all' || dateFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setFilterUnit('');
                  setUnitDropdownSearch('');
                  setShowUnitMenu(false);
                  setStockStatus('all');
                  setShowStatusMenu(false);
                  setDateFilter('all');
                  setStartDate('');
                  setEndDate('');
                  setPage(1);
                }}
                className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer flex items-center gap-1"
              >
                <X size={12} />
                <span>إعادة تعيين كافة الفلاتر</span>
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full min-w-[900px] text-sm whitespace-nowrap table-fixed">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                <th className="px-3 py-4 text-center font-black w-[5%]">#</th>
                <th className="px-5 py-4 text-right font-black w-[24%]">الصنف</th>
                <th className="px-5 py-4 text-right font-black w-[12%]">نوع الصنف</th>
                <th className="px-5 py-4 text-right font-black w-[12%]">الكمية المتوفرة</th>
                <th className="px-5 py-4 text-right font-black w-[14%]">القيمة الإجمالية</th>
                <th className="px-5 py-4 text-right font-black w-[10%]">الحد الأدنى</th>
                <th className="px-5 py-4 text-right font-black w-[12%]">تاريخ الإنتهاء</th>
                <th className="px-5 py-4 text-center font-black w-[11%]">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i}><td colSpan="8" className="px-4 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-12 text-center text-gray-400">
                    <Package size={40} className="mx-auto mb-3 opacity-20" />
                    <p>لا توجد أصناف مطابقة للبحث</p>
                  </td>
                </tr>
              ) : items.map((item, index) => {
                const qty = parseInt(item.quantity || 0, 10);
                const minQty = parseInt(item.min_quantity || 0, 10);
                const isLow = qty <= minQty && qty > 0;
                const isOut = qty === 0;
                const totalCost = qty * parseInt(item.cost_price || 0, 10);
                
                return (
                  <tr key={item.id} onClick={() => setDetailsModal({ isOpen: true, item })} className="hover:bg-gray-50 transition-colors cursor-pointer">
                    <td className="px-3 py-4 text-center font-bold text-xs text-slate-400 align-middle">{index + 1}</td>
                    <td className="px-5 py-4 align-middle font-bold text-gray-900 truncate" title={item.name}>
                      {item.name}
                    </td>
                    <td className="px-5 py-4 font-bold text-gray-600 align-middle truncate" title={item.unit}>{item.unit}</td>
                    <td className="px-5 py-4 align-middle">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold ${
                        isOut ? 'bg-red-50 text-red-700 border border-red-100' :
                        isLow ? 'bg-amber-50 text-amber-700 border border-amber-100' : 
                        'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      }`}>
                        {qty}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-gray-900 text-base" dir="ltr">{totalCost.toLocaleString('en-US')}</span>
                        <span className="text-[10px] font-bold text-gray-400">ر.ي</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-bold text-gray-500 align-middle text-right" dir="ltr">{minQty.toLocaleString('en-US')}</td>
                    <td className="px-5 py-4 align-middle">
                      {item.expiry_date ? (
                        <span className="font-black text-gray-900 text-base" dir="ltr">{new Date(item.expiry_date).toLocaleDateString('en-GB')}</span>
                      ) : (
                        <span className="text-gray-300 font-bold">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <div className="flex gap-2 justify-center">
                        <button onClick={(e) => { e.stopPropagation(); setDetailsModal({ isOpen: true, item }); }}
                          className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-600 hover:text-white border border-indigo-100 shadow-sm rounded-xl transition-all" title="التفاصيل">
                          <Eye size={16} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setModal({ isOpen: true, item }); }}
                          className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-600 hover:text-white border border-emerald-100 shadow-sm rounded-xl transition-all" title="تعديل">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={(e) => { 
                          e.stopPropagation(); 
                          if (parseFloat(item.quantity) > 0) {
                            toast.error('تعذر الحذف: يتوفر رصيد مخزني حالي لهذا الصنف. يُرجى أولاً تصفير الكمية (عبر شاشة الصرف) لتتمكن من حذفه.');
                          } else {
                            setDeleteModal({ isOpen: true, item: item, loading: false }); 
                          }
                        }}
                          className="p-2 text-red-600 bg-red-50 hover:bg-red-600 hover:text-white border border-red-100 shadow-sm rounded-xl transition-all" title="حذف">
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

      {modal.isOpen && (
        <ItemEditModal 
          item={modal.item} 
          items={items} 
          onClose={() => setModal({ isOpen: false, item: null })}
          onSaved={() => {
            setModal({ isOpen: false, item: null });
            fetchItems();
            if (detailsModal.isOpen && detailsModal.item?.id === modal.item?.id) {
              setDetailsModal({ isOpen: false, item: null }); // close details if saved from edit
            }
          }}
          token={token}
        />
      )}

      {detailsModal.isOpen && (
        <ItemDetailsModal 
          item={detailsModal.item}
          token={token}
          onClose={() => setDetailsModal({ isOpen: false, item: null })}
          onEdit={(item) => {
            setModal({ isOpen: true, item });
          }}
          onDelete={(item) => { setDeleteModal({ isOpen: true, item: item, loading: false }); }}
          fetchItems={() => {
            fetchItems();
          }}
        />
      )}

      <ConfirmDeleteModal 
        isOpen={deleteModal.isOpen}
        loading={deleteModal.loading}
        itemName={deleteModal.item?.name}
        onClose={() => setDeleteModal({ isOpen: false, item: null, loading: false })}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

export default Items;
