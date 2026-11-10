import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Users,
  UserPlus,
  CreditCard,
  ClipboardList,
  Wallet,
  Stethoscope,
  FlaskConical,
  Radiation,
  Settings,
  Pill,
  Layers,
  Package,
  LogOut,
  Bell,
  ChevronLeft,
  ChevronRight,
  Scissors,
  Activity,
  Warehouse,
  X,
  ShieldAlert,
  FolderOpen,
  TrendingUp,
  ArrowLeftRight,
  Archive,
  FileText,
  Star,
  Clock,
  CheckSquare,
  BarChart3,
  RefreshCcw,
  Trash2,
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import useAuthStore from "../store/useAuthStore";
import useSocketStore from "../store/useSocketStore";
import { formatArabicQuantity } from '../utils/arabicFormatters';
import GlobalSearch from "./GlobalSearch";
import useRealtimeNotifications from "../hooks/useRealtimeNotifications";
import { disconnectSocket } from "../utils/socket";
import { isSoundEnabled, setSoundEnabled, playNotificationSound } from "../utils/notificationSound";

// ─── Menu config ──────────────────────────────────────────────────
const menuConfig = {
  secretary: [
    { icon: Activity, label: "لوحة التحكم", path: "/secretary/dashboard" },
    { icon: UserPlus, label: "تسجيل مريض", path: "/secretary/register" },
    { icon: Users, label: "أرشيف المرضى", path: "/secretary/patients" },
  ],
  cashier: [
    { icon: Activity, label: "لوحة التحكم", path: "/cashier/board" },
    { icon: ArrowLeftRight, label: "الإيرادات والمصروفات", path: "/cashier/general" },
    { icon: Archive, label: "الأرشيف المالي", path: "/cashier/archive" },
    { icon: FileText, label: "التقارير المالية", path: "/cashier/reports" },
  ],
  doctor: [
    { icon: Activity, label: "لوحة التحكم", path: "/doctor/dashboard" },
    { icon: Stethoscope, label: "قائمة المرضى", path: "/doctor/queue" },
    { icon: ShieldAlert, label: "معاينات جانبية", path: "/doctor/vip" },
    { icon: FolderOpen, label: "أرشيف المرضى", path: "/doctor/archive" },
    { icon: Star, label: "إدارة المفضلات", path: "/doctor/favorites" },
    { icon: TrendingUp, label: "التقارير التحليلية", path: "/doctor/reports" },
  ],

  lab: [
    { icon: Activity, label: "لوحة التحكم", path: "/lab/dashboard" },
    { icon: Package, label: "مخزن ومستهلكات القسم", path: "/lab/inventory" },
    {
      icon: BarChart3,
      label: "تقارير الأداء والإحصائيات",
      path: "/lab/reports",
    },
  ],
  radiology: [
    { icon: Activity, label: "لوحة التحكم", path: "/radiology/dashboard" },
    { icon: Package, label: "مخزن ومستهلكات القسم", path: "/radiology/inventory" },
    { icon: BarChart3, label: "تقارير الأداء والإحصائيات", path: "/radiology/reports" },
  ],
  surgery_coordinator: [
    { icon: Scissors, label: "العمليات", path: "/surgery/operations" },
  ],
  or_store: [
    { icon: Activity, label: "لوحة التحكم", path: "/or-store/dashboard" },
    { icon: Package, label: "الأصناف", path: "/or-store/items" },
    { icon: Archive, label: "استلام وتوريد", path: "/or-store/receive" },
    { icon: ArrowLeftRight, label: "الصرف السريع", path: "/or-store/issue" },
    { icon: Layers, label: "التحضير والتصنيع", path: "/or-store/manufacturing" },
    { icon: CheckSquare, label: "الجرد الدوري", path: "/or-store/stocktaking" },
  ],
  general_store: [
    { icon: Activity, label: "لوحة التحكم", path: "/general-store/dashboard" },
    { icon: Package, label: "الأصناف", path: "/general-store/items" },
    { icon: Archive, label: "استلام وارد", path: "/general-store/receive" },
    { icon: ArrowLeftRight, label: "صرف للأقسام", path: "/general-store/issue" },
    { icon: CheckSquare, label: "الجرد الدوري", path: "/general-store/stocktaking" },
  ],
  auditor: [
    {
      group: "إدارة الإحصائيات والتقارير",
      items: [
        { icon: Activity, label: "لوحة التقارير", path: "/auditor/dashboard" },
        { icon: Wallet, label: "التقرير المالي", path: "/auditor/financial" },
        { icon: Scissors, label: "أداء العمليات", path: "/auditor/surgery" },
        { icon: Users, label: "المرضى والزيارات", path: "/auditor/patients" },
        {
          icon: FlaskConical,
          label: "الخدمات التشخيصية",
          path: "/auditor/diagnostics",
        },
        {
          icon: Warehouse,
          label: "التقرير المخزني",
          path: "/auditor/inventory",
        },
        { icon: ClipboardList, label: "سجل الرصد", path: "/auditor/audit" },
      ],
    },
    {
      group: "إدارة النظام والتحكم",
      items: [
        { icon: Users, label: "إدارة المستخدمين", path: "/auditor/users" },
        {
          icon: Pill,
          label: "دليل الأدوية",
          path: "/auditor/catalog/medications",
        },
        {
          icon: Layers,
          label: "الخدمات السريرية",
          path: "/auditor/catalog/clinical",
        },
        {
          icon: Package,
          label: "باقات العمليات",
          path: "/auditor/catalog/surgery-prep",
        },
        {
          icon: FlaskConical,
          label: "كتالوج التحاليل",
          path: "/auditor/catalog/lab",
        },
        {
          icon: Package,
          label: "مخزن ومستهلكات المختبر",
          path: "/auditor/lab-inventory",
        },
        {
          icon: Radiation,
          label: "كتالوج الأشعة",
          path: "/auditor/catalog/radiology",
        },
        {
          icon: Package,
          label: "مخزن ومستهلكات الأشعة",
          path: "/auditor/radiology-inventory",
        },
        {
          icon: Settings,
          label: "إعدادات النظام",
          path: "/auditor/system-settings",
        },
        {
          icon: ClipboardList,
          label: "سجل الأحداث الكامل",
          path: "/auditor/audit-log",
        },
      ],
    },
  ],
};

const roleLabels = {
  secretary: "سكرتير",
  cashier: "أمين الصندوق",
  doctor: "طبيب",
  lab: "مختبر",
  radiology: "أشعة",
  surgery_coordinator: "منسق عمليات",
  or_store: "مخزن العمليات",
  general_store: "المخزن العام",
  auditor: "مدير النظام",
};

const ROLE_GRADIENT = {
  doctor: "linear-gradient(180deg, #1E3A8A 0%, #1E40AF 60%, #2563EB 100%)",
  secretary: "linear-gradient(180deg, #134E4A 0%, #0F766E 60%, #0D9488 100%)",
  cashier: "linear-gradient(180deg, #1C1917 0%, #292524 60%, #44403C 100%)",
  lab: "linear-gradient(180deg, #4C1D95 0%, #6D28D9 60%, #7C3AED 100%)",
  radiology: "linear-gradient(180deg, #1E3A8A 0%, #1D4ED8 60%, #3B82F6 100%)",
  auditor: "linear-gradient(180deg, #0F172A 0%, #1E293B 60%, #334155 100%)",
  default: "linear-gradient(180deg, #1F2937 0%, #374151 60%, #4B5563 100%)",
};

// ─── Sidebar Item ─────────────────────────────────────────────────
const SidebarItem = ({ icon: Icon, label, path, active, collapsed }) => {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(path)}
      className={`relative w-full flex items-center gap-3.5 p-2 mb-1.5 text-right transition-all duration-500 ease-out group overflow-hidden ${
        active
          ? "bg-white/15 text-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] ring-1 ring-white/20 rounded-2xl"
          : "text-white/60 hover:bg-white/5 hover:text-white rounded-2xl"
      }`}>
      
      {/* Active Glowing Indicator */}
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1/2 bg-white rounded-r-full shadow-[0_0_12px_rgba(255,255,255,0.9)]" />
      )}

      {/* Icon Wrapper */}
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-500 ease-out z-10 ${
          active 
            ? "bg-white text-slate-900 shadow-md transform scale-100" 
            : "bg-white/5 group-hover:bg-white/20 group-hover:rotate-3 group-hover:scale-105"
        }`}>
        <Icon size={20} strokeWidth={active ? 2.5 : 2} />
      </div>
      
      {!collapsed && (
        <span className={`text-sm font-bold tracking-wide whitespace-nowrap overflow-hidden z-10 transition-all duration-300 ${active ? "translate-x-0" : "group-hover:-translate-x-1"}`}>
          {label}
        </span>
      )}
    </button>
  );
};

// ─── Notification Bell ────────────────────────────────────────────
const TYPE_CONFIG = {
  receive:            { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: ArrowDownRight },
  issue:              { bg: 'bg-amber-50',   text: 'text-amber-600',   icon: ArrowUpRight },
  alert:              { bg: 'bg-red-50',     text: 'text-red-600',     icon: AlertTriangle },
  expiry:             { bg: 'bg-orange-50',  text: 'text-orange-600',  icon: Clock },
  lab_ready:          { bg: 'bg-amber-50',   text: 'text-amber-600',   icon: FlaskConical },
  radiology_ready:    { bg: 'bg-amber-50',   text: 'text-amber-600',   icon: Radiation },
  patient_registered: { bg: 'bg-sky-50',     text: 'text-sky-600',     icon: UserPlus },
  patient_queued:     { bg: 'bg-sky-50',     text: 'text-sky-600',     icon: UserPlus },
  status_changed:     { bg: 'bg-teal-50',    text: 'text-teal-600',    icon: Activity },
  service_request:    { bg: 'bg-blue-50',    text: 'text-blue-600',    icon: Activity },
  entry_fee:          { bg: 'bg-sky-50',     text: 'text-sky-600',     icon: CreditCard },
  surgery_fee:        { bg: 'bg-rose-50',    text: 'text-rose-600',    icon: Scissors },
  lab:                { bg: 'bg-amber-50',   text: 'text-amber-600',   icon: FlaskConical },
  radiology:          { bg: 'bg-violet-50',  text: 'text-violet-600',  icon: Radiation },
  patient:            { bg: 'bg-sky-50',     text: 'text-sky-600',     icon: UserPlus },
  default:            { bg: 'bg-blue-50',    text: 'text-blue-500',    icon: Bell },
};

const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const allNotifications = useSocketStore(state => state.notifications);
  const notifications = useMemo(() => {
    return allNotifications.filter(n => !n.role || n.role === user?.role);
  }, [allNotifications, user?.role]);
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read).length;
  }, [notifications]);
  const markAllAsRead = useSocketStore(state => state.markAllAsRead);
  const clearAllNotifications = useSocketStore(state => state.clearAllNotifications);
  const deleteNotification = useSocketStore(state => state.deleteNotification);
  const [soundEnabled, setSoundEnabledState] = useState(() => isSoundEnabled());

  const handleToggleSound = (e) => {
    e.stopPropagation();
    const next = !soundEnabled;
    setSoundEnabled(next);
    setSoundEnabledState(next);
    if (next) {
      playNotificationSound();
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) markAllAsRead();
        }}
        className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500">
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="animate-in fade-in slide-in-from-top-4 duration-200 absolute left-0 top-12 w-96 min-w-[360px] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50"
          dir="rtl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50 bg-white">
            <span className="font-bold text-gray-800 text-sm">الإشعارات</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleSound}
                title={soundEnabled ? 'كتم صوت الإشعارات' : 'تفعيل صوت الإشعارات'}
                className={`p-1.5 rounded-lg transition-colors ${soundEnabled ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400 hover:bg-gray-100'}`}>
                {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
              {notifications.length > 0 && (
                <button
                  onClick={clearAllNotifications}
                  className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors">
                  مسح الكل
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                لا توجد إشعارات جديدة
              </div>
            ) : (
              notifications.map((n) => {
                const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.default;
                const Icon = config.icon;
                
                return (
                  <div 
                    key={n.id} 
                    onClick={() => {
                      if (n.actionPath) {
                        navigate(n.actionPath);
                        setOpen(false);
                      }
                    }}
                    className={`flex items-start gap-3 px-4 py-3 transition-colors group relative ${!n.read ? 'bg-blue-50/20' : ''} ${n.actionPath ? 'cursor-pointer hover:bg-gray-100' : 'hover:bg-gray-50/50'}`}>
                    {!n.read && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
                    )}
                    <div className={`w-8 h-8 rounded-full ${config.bg} ${config.text} flex items-center justify-center shrink-0`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="leading-snug break-words whitespace-normal">
                        {n.storePayload ? (
                          <div className="flex flex-col gap-1.5 mt-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`${config.bg} ${config.text} text-[10px] px-2 py-0.5 rounded-full font-bold border border-current/10`}>
                                {n.storePayload.title}
                              </span>
                            </div>
                            
                            {(n.storePayload.itemName || n.storePayload.bodyPre || n.storePayload.bodyPost) && (
                              <div className="font-semibold text-sm text-slate-800 mt-1 flex flex-wrap items-center gap-1.5 leading-relaxed">
                                {n.storePayload.bodyPre && <span>{n.storePayload.bodyPre}</span>}
                                
                                {n.storePayload.itemName && <span>{n.storePayload.itemName}</span>}
                                
                                {n.storePayload.itemBadge && (
                                  <span className={`${config.bg} ${config.text} text-[9px] px-1.5 py-0.5 rounded-full font-bold border border-current/10`}>
                                    {n.storePayload.itemBadge}
                                  </span>
                                )}
                                
                                {n.storePayload.bodyPost && <span>{n.storePayload.bodyPost}</span>}
                              </div>
                            )}

                            {n.storePayload.footerText && (
                              <p className="font-medium text-xs text-slate-500">
                                {n.storePayload.footerText}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="font-medium text-sm text-gray-800 leading-snug">{n.message || 'إشعار من النظام'}</p>
                        )}
                      </div>
                      {!n.storePayload && n.patientName && !n.message?.includes(n.patientName) && (
                        <p className="text-xs font-bold text-indigo-500 mt-0.5">{n.patientName}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(n.timestamp).toLocaleTimeString("ar", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};


// ─── Main Layout ─────────────────────────────────────────────────
const Layout = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout, token } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  // 🔔 Real-time notifications
  useRealtimeNotifications(user?.role);
  const addNotification = useSocketStore(state => state.addNotification);
  const latestSilentUpdate = useSocketStore(state => state.latestSilentUpdate);

  // Clear notifications on role switch to prevent cross-store alert leakage
  const prevRoleRef = useRef(user?.role);
  useEffect(() => {
    if (prevRoleRef.current && prevRoleRef.current !== user?.role) {
      useSocketStore.getState().clearAllNotifications();
    }
    prevRoleRef.current = user?.role;
  }, [user?.role]);

  useEffect(() => {
    const ALERT_ENDPOINTS = {
      general_store: '/api/inventory/general/alerts',
      or_store: '/api/inventory/or/alerts',
      lab: '/api/inventory/lab/alerts',
      radiology: '/api/inventory/radiology/alerts',
    };

    const ALERT_ACTION_PATHS = {
      general_store: '/general-store/items',
      or_store: '/or-store/items',
      lab: '/lab/inventory',
      radiology: '/radiology/inventory',
    };

    const endpoint = ALERT_ENDPOINTS[user?.role];
    if (!endpoint) return;

    const actionPath = ALERT_ACTION_PATHS[user?.role];

    const fetchAlerts = async () => {
      try {
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const { expiry = [], stock = [] } = data;
        
        // Clear any previous inventory alerts for this role before populating fresh ones
        useSocketStore.setState(state => ({
          notifications: state.notifications.filter(
            n => n.role !== user?.role || (!n.isInventoryAlert && n.type !== 'expiry' && (n.type !== 'alert' || !n.storePayload?.title?.includes('نواقص')))
          )
        }));

        expiry.forEach(item => {
          if (item.days_left <= 0) {
            addNotification({ 
              role: user?.role,
              type: 'expiry', 
              isInventoryAlert: true,
              actionPath,
              storePayload: { 
                title: 'تنبيه صلاحية', 
                bodyPre: 'انتهت صلاحية ', 
                itemName: item.name, 
                itemBadge: item.type 
              },
              message: `انتهت صلاحية ${item.name} (${item.type}).` 
            });
          } else {
            addNotification({ 
              role: user?.role,
              type: 'expiry', 
              isInventoryAlert: true,
              actionPath,
              storePayload: { 
                title: 'تنبيه صلاحية', 
                itemName: item.name, 
                itemBadge: item.type, 
                bodyPost: ` قارب على الانتهاء (${item.days_left} يوم)` 
              },
              message: `${item.name} (${item.type}) قارب على الانتهاء (${item.days_left} يوم).` 
            });
          }
        });
        
        stock.forEach(item => {
          if (item.quantity <= 0) {
            addNotification({ 
              role: user?.role,
              type: 'alert', 
              isInventoryAlert: true,
              actionPath,
              storePayload: { 
                title: 'تنبيه نواقص', 
                bodyPre: 'نفدت كمية ', 
                itemName: item.name, 
                itemBadge: item.type 
              },
              message: `نفدت كمية ${item.name} (${item.type}).` 
            });
          } else {
            const formattedQty = formatArabicQuantity(item.quantity, item.type);
            addNotification({ 
              role: user?.role,
              type: 'alert', 
              isInventoryAlert: true,
              actionPath,
              storePayload: { 
                title: 'تنبيه نواقص', 
                itemName: item.name, 
                itemBadge: formattedQty, 
                bodyPost: ' تحت الحد الأدنى' 
              },
              message: `${item.name} (${formattedQty}) تحت الحد الأدنى.` 
            });
          }
        });
      } catch (error) {
        console.error("Error fetching inventory alerts", error);
      }
    };

    fetchAlerts();
  }, [user?.role, token, addNotification, latestSilentUpdate?.type === 'inventory' ? latestSilentUpdate?.timestamp : null]);

  const items = menuConfig[user?.role] || [];
  const roleName = roleLabels[user?.role] || user?.role;
  const gradient = ROLE_GRADIENT[user?.role] || ROLE_GRADIENT.default;

  const handleLogout = () => {
    disconnectSocket();
    logout();
    navigate("/login");
  };

  const getFlatItems = (menuItems) => {
    let flat = [];
    menuItems.forEach((i) => {
      if (i.group) {
        flat = flat.concat(i.items);
      } else {
        flat.push(i);
      }
    });
    return flat;
  };
  const flatItems = getFlatItems(items);
  const currentLabel =
    flatItems.find((i) => location.pathname.startsWith(i.path))?.label ||
    "لوحة التحكم";

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden" dir="rtl">
      {/* ── Sidebar ── */}
      <aside
        
        className="flex flex-col h-full flex-shrink-0 relative z-40 transition-all duration-300"
        style={{ background: gradient, width: collapsed ? 72 : 224 }}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-3 py-5 border-b border-white/10">
          <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
            <Stethoscope size={20} className="text-blue-700" />
          </div>
          
            {!collapsed && (
              <div
                className="animate-fade-in">
                <p className="text-white font-bold text-sm leading-none">
                  ORTHOCARE
                </p>
                <p className="text-white/50 text-xs mt-0.5">
                  نظام الإدارة الطبية
                </p>
              </div>
            )}
          
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto no-scrollbar px-2 py-4 space-y-3">
          {items.map((itemOrGroup, idx) => {
            if (itemOrGroup.group) {
              return (
                <div key={itemOrGroup.group + idx} className="space-y-1">
                  {!collapsed && (
                    <p className="text-[10px] font-bold text-blue-200/50 uppercase tracking-widest px-3 mb-2 mt-4 text-right">
                      {itemOrGroup.group}
                    </p>
                  )}
                  {itemOrGroup.items.map((item) => (
                    <SidebarItem
                      key={item.path}
                      {...item}
                      active={location.pathname.startsWith(item.path)}
                      collapsed={collapsed}
                    />
                  ))}
                </div>
              );
            }
            return (
              <SidebarItem
                key={itemOrGroup.path}
                {...itemOrGroup}
                active={location.pathname.startsWith(itemOrGroup.path)}
                collapsed={collapsed}
              />
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="px-2 py-3 border-t border-white/10 space-y-1">
          <SidebarItem
            icon={Settings}
            label="الإعدادات"
            path="/settings"
            active={location.pathname.startsWith('/settings')}
            collapsed={collapsed}
          />
          <button
            onClick={handleLogout}
            
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-300 hover:bg-red-500/20 hover:text-red-200 transition-all active:scale-95">
            <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <LogOut size={18} />
            </div>
            
              {!collapsed && (
                <span
                  className="animate-fade-in text-sm font-semibold whitespace-nowrap overflow-hidden">
                  تسجيل الخروج
                </span>
              )}
            
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          
          className="absolute -left-3.5 top-16 w-7 h-7 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-500 shadow-md z-50 hover-lift active:scale-95">
          {collapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
      </aside>

      {/* ── Main Area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-5 flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center">
              <h2 className="font-black text-gray-900 text-lg leading-none">
                {currentLabel}
              </h2>
            </div>
          </div>

          {/* Center: Global Search */}
          <div className="flex-1 max-w-xs mx-6">
            <GlobalSearch />
          </div>

          {/* Right: Bell + User */}
          <div className="flex items-center gap-3">
            <NotificationBell />

            <div className="flex items-center gap-3 pr-4 border-r border-gray-100">
              <button
                onClick={() => navigate('/settings')}
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform hover:scale-105 active:scale-95 shadow-md text-white text-sm font-black"
                style={{ background: gradient }}>
                {user?.fullName?.charAt(0)}
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 flex flex-col">
          <div
            key={location.pathname}
            className="flex-1 flex flex-col animate-fade-in"
            >
            {children ?? <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
