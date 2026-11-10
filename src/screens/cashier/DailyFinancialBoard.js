import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, Wallet, TrendingUp, TrendingDown,
  RotateCcw, CreditCard, Activity, Scissors, Users
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useSearchParams } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import useSocketStore from '../../store/useSocketStore';

import FinancialRecordModal from '../../components/common/FinancialRecordModal';
import UnifiedPaymentModal from '../../components/cashier/UnifiedPaymentModal';
import { formatCurrency } from '../../components/cashier/cashierConstants';
import EntryFeesTab from './tabs/EntryFeesTab';
import ServicesTab from './tabs/ServicesTab';
import SurgeriesTab from './tabs/SurgeriesTab';
import TodayPatientsTab from './tabs/TodayPatientsTab';

const DailyFinancialBoard = () => {
  const { token } = useAuthStore();
  const latestCashierUpdate = useSocketStore(state => state.latestCashierUpdate);
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const lastFetchRef = useRef(0);
  
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const validTabs = ['entry_fees', 'services', 'surgeries', 'today_patients'];
  const [activeTab, setActiveTab] = useState(tabParam && validTabs.includes(tabParam) ? tabParam : 'entry_fees');

  useEffect(() => {
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);
  
  // Unified Checkout Modal State
  const [checkoutVisitId, setCheckoutVisitId] = useState(null);
  const [checkoutVisitData, setCheckoutVisitData] = useState(null);
  const [checkoutMode, setCheckoutMode] = useState('both');
  
  // Patient Financial Record Modal State
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [selectedVisitIdForRecord, setSelectedVisitIdForRecord] = useState(null);
  const [recordData, setRecordData] = useState(null);
  const [recordLoading, setRecordLoading] = useState(false);

  const fetchPatientRecord = useCallback(async (id, preferredVisitId = null, isSilent = false) => {
    setSelectedPatientId(id);
    if (!isSilent) {
      setSelectedVisitIdForRecord(preferredVisitId);
      setRecordLoading(true);
    }
    try {
      const res = await fetch(`/api/cashier/archive/patient/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setRecordData(await res.json());
      } else {
        if (!isSilent) toast.error('تعذر جلب السجل المالي للمريض');
      }
    } catch (err) {
      if (!isSilent) toast.error('خطأ في الاتصال بالخادم');
    } finally {
      if (!isSilent) setRecordLoading(false);
    }
  }, [token]);

  const fetchStats = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingStats(true);
    try {
      const statsRes = await fetch('/api/cashier/stats/summary', { headers: { Authorization: `Bearer ${token}` } });
      if (statsRes.ok) {
        setStats(await statsRes.json());
        lastFetchRef.current = Date.now();
      }
    } catch (err) {
      if (!isSilent) toast.error('تعذر جلب الإحصائيات');
    } finally {
      if (!isSilent) setLoadingStats(false);
    }
  }, [token]);

  // Initial Mount Fetch
  useEffect(() => {
    fetchStats(false);
  }, [fetchStats]);

  // Real-Time Silent Sync Bridge
  useEffect(() => {
    if (latestCashierUpdate?.timestamp && latestCashierUpdate.timestamp > lastFetchRef.current) {
      fetchStats(true);
      if (selectedPatientId) {
        fetchPatientRecord(selectedPatientId, selectedVisitIdForRecord, true);
      }
    }
  }, [latestCashierUpdate, selectedPatientId, selectedVisitIdForRecord, fetchStats, fetchPatientRecord]);

  const [tabCounts, setTabCounts] = useState({});

  const handleCountChange = useCallback((tabId, count) => {
    setTabCounts(prev => (prev[tabId] === count ? prev : { ...prev, [tabId]: count }));
  }, []);

  const TABS = [
    { 
      id: 'entry_fees', 
      label: 'رسوم المعاينة', 
      icon: CreditCard, 
      color: 'text-sky-600', 
      bg: 'bg-sky-100', 
      activeBg: 'bg-sky-600', 
      badge: tabCounts.entry_fees !== undefined ? tabCounts.entry_fees : (stats?.pendingEntryFeesCount || 0) 
    },
    { 
      id: 'services', 
      label: 'الخدمات الطبية', 
      icon: Activity, 
      color: 'text-sky-600', 
      bg: 'bg-sky-100', 
      activeBg: 'bg-sky-600', 
      badge: tabCounts.services !== undefined ? tabCounts.services : (stats?.waitingServicesCount || 0) 
    },
    { 
      id: 'surgeries', 
      label: 'العمليات الجراحية', 
      icon: Scissors, 
      color: 'text-sky-600', 
      bg: 'bg-sky-100', 
      activeBg: 'bg-sky-600', 
      badge: tabCounts.surgeries !== undefined ? tabCounts.surgeries : (stats?.pendingSurgeriesCount || 0) 
    },
    { 
      id: 'today_patients', 
      label: 'مراجعو اليوم', 
      icon: Users, 
      color: 'text-sky-600', 
      bg: 'bg-sky-100', 
      activeBg: 'bg-sky-600', 
      badge: tabCounts.today_patients !== undefined ? tabCounts.today_patients : (stats?.activePatientsCount || 0) 
    },
  ];

  return (
    <div className="space-y-6 w-full" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-600 to-sky-800 text-white flex items-center justify-center shadow-lg shadow-sky-600/30">
            <LayoutDashboard size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
              لوحة التحكم
              <span className="relative flex h-3 w-3" title="متصل بالشبكة المحلية">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </h1>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/60 backdrop-blur-md border border-gray-200/60 shadow-sm mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
              <p className="text-xs font-bold text-gray-600">مراقبة حية للمركز المالي وحالة الخدمات</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 flex-shrink-0">
        {[
          { 
            label: 'إجمالي الدخل', 
            value: formatCurrency(stats?.todayIncome || 0), 
            icon: TrendingUp, 
            color: 'text-emerald-600', 
            bg: 'bg-emerald-100', 
            border: 'border-emerald-200'
          },
          { 
            label: 'المرتجعات', 
            value: formatCurrency(stats?.todayRefunds || 0), 
            icon: RotateCcw, 
            color: 'text-rose-600', 
            bg: 'bg-rose-100', 
            border: 'border-rose-200'
          },
          { 
            label: 'المصروفات', 
            value: formatCurrency(stats?.todayExpenses || 0), 
            icon: TrendingDown, 
            color: 'text-amber-600', 
            bg: 'bg-amber-100', 
            border: 'border-amber-200'
          },
          { 
            label: 'صافي الصندوق', 
            value: formatCurrency(stats?.todayAvailable || 0), 
            icon: Wallet, 
            color: (stats?.todayAvailable || 0) >= 0 ? 'text-sky-600' : 'text-rose-600', 
            bg: (stats?.todayAvailable || 0) >= 0 ? 'bg-sky-100' : 'bg-rose-100', 
            border: (stats?.todayAvailable || 0) >= 0 ? 'border-sky-200' : 'border-rose-300',
            valColor: (stats?.todayAvailable || 0) >= 0 ? 'text-emerald-700' : 'text-rose-600'
          },
        ].map((s, i) => (
          <div key={i} className={`p-4 rounded-2xl border ${s.border} bg-white shadow-sm relative overflow-hidden flex flex-col justify-between isolate hover:shadow-md transition-all duration-200 group`}>
            <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${s.bg} to-transparent opacity-50 rounded-bl-full z-[-1] transition-transform duration-500 group-hover:scale-110`} />
            <div className="flex justify-between items-center mb-3">
              <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center shadow-sm transition-transform group-hover:scale-105`}>
                <s.icon size={16} className={s.color} />
              </div>
              <span className={`text-xs font-bold ${s.color}`}>{s.label}</span>
            </div>
            <div>
              {loadingStats ? (
                <div className="h-7 bg-gray-100 rounded-lg animate-pulse w-24 mr-auto"></div>
              ) : (
                <p
                  className={`text-xl font-black ${s.valColor || 'text-gray-800'} flex items-baseline justify-end gap-1.5 transition-opacity duration-200`}
                  dir="ltr"
                >
                  <span className="text-xs font-bold text-gray-400 uppercase">ر.ي</span>
                  <span>{s.value}</span>
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs Menu */}
      <div className="flex bg-white rounded-2xl shadow-sm border border-gray-100 p-1.5 flex-shrink-0 overflow-x-auto no-scrollbar mb-6">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-max flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all duration-300 whitespace-nowrap ${
              activeTab === tab.id 
                ? `${tab.activeBg} text-white shadow-md transform scale-[1.02]` 
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${activeTab === tab.id ? 'bg-white/20 text-white' : tab.bg + ' ' + tab.color}`}>
              <tab.icon size={16} strokeWidth={2.5} />
            </div>
            {tab.label}
            {tab.badge > 0 && (
              <span className={`mr-1 px-2 py-0.5 rounded-full text-xs font-black ${
                activeTab === tab.id ? 'bg-white text-sky-800' : 'bg-red-500 text-white shadow-sm animate-pulse'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="min-h-[500px]">
        <div key={activeTab} className="h-full flex flex-col transition-all duration-200">
          {activeTab === 'entry_fees' && (
            <EntryFeesTab 
              onPatientClick={fetchPatientRecord} 
              onCheckout={(v) => { setCheckoutVisitId(v.visit_id); setCheckoutVisitData(v); setCheckoutMode('entry'); }} 
              onCountChange={(cnt) => handleCountChange('entry_fees', cnt)}
            />
          )}
          {activeTab === 'services' && (
            <ServicesTab 
              onPatientClick={fetchPatientRecord} 
              onCheckout={(v) => { setCheckoutVisitId(v.visit_id); setCheckoutVisitData(v); setCheckoutMode('services'); }} 
              onCountChange={(cnt) => handleCountChange('services', cnt)}
            />
          )}
          {activeTab === 'surgeries' && (
            <SurgeriesTab 
              onPatientClick={fetchPatientRecord} 
              onCheckout={(s) => { 
                setCheckoutVisitId(s.surgery_id || s.id); 
                setCheckoutVisitData({ ...s, is_surgery: true }); 
                setCheckoutMode('surgery'); 
              }} 
              onCountChange={(cnt) => handleCountChange('surgeries', cnt)}
            />
          )}
          {activeTab === 'today_patients' && (
            <TodayPatientsTab 
              onPatientClick={fetchPatientRecord} 
              onCountChange={(cnt) => handleCountChange('today_patients', cnt)}
            />
          )}
        </div>
      </div>

      {/* Unified Payment Modal */}
      {checkoutVisitId && (
        <UnifiedPaymentModal 
          visitId={checkoutVisitId}
          visitData={checkoutVisitData}
          token={token}
          mode={checkoutMode}
          onClose={() => { setCheckoutVisitId(null); setCheckoutVisitData(null); }}
          onOpenLedger={(patientId) => { fetchPatientRecord(patientId); setCheckoutVisitId(null); setCheckoutVisitData(null); }}
          onPaid={() => fetchStats()}
        />
      )}

      {/* Patient Financial Record Modal */}
      {selectedPatientId && (
        <FinancialRecordModal 
          token={localStorage.getItem('token')} 
          initialVisitId={selectedVisitIdForRecord}
          onRefresh={() => fetchPatientRecord(selectedPatientId, selectedVisitIdForRecord)} 
          onOpenCheckout={(visit, preferredMode = null) => { 
            if (visit) { 
              const enrichedVisit = { 
                ...visit, 
                full_name: recordData?.patient?.full_name || visit.full_name, 
                phone: recordData?.patient?.phone || visit.phone, 
                patient_id: recordData?.patient?.id || visit.patient_id 
              }; 
              setCheckoutVisitId(visit.id || visit.visit_id || visit.surgery_id); 
              setCheckoutVisitData(enrichedVisit); 
              if (visit.is_surgery) { 
                setCheckoutMode('surgery'); 
              } else if (preferredMode) {
                setCheckoutMode(preferredMode);
              } else { 
                setCheckoutMode('both'); 
              } 
              setSelectedPatientId(null); 
              setSelectedVisitIdForRecord(null);
            } 
          }} 
          recordData={recordData}
          recordLoading={recordLoading}
          onClose={() => {
            setSelectedPatientId(null);
            setSelectedVisitIdForRecord(null);
          }}
        />
      )}
    </div>
  );
};

export default DailyFinancialBoard;

