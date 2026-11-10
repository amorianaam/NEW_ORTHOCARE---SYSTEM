import React, { useState, useEffect, useMemo } from 'react';
import {
  User, Lock, Eye, EyeOff, Save, CheckCircle2,
  Shield, Bell, Info, Sun, Moon, Volume2, VolumeX,
  Key, Stethoscope, Wallet, FlaskConical, Radiation,
  Scissors, Package, Warehouse, ShieldAlert, Users,
  Check, AlertTriangle, Sparkles,
  FileBadge, ShieldCheck, CheckSquare
} from 'lucide-react';
import { toast } from 'react-toastify';
import useAuthStore from '../store/useAuthStore';
import { isSoundEnabled, setSoundEnabled, playNotificationSound } from '../utils/notificationSound';

// ── Role Specific Configuration ─────────────────────────────────────
const ROLE_CONFIG = {
  doctor: {
    label: 'طبيب العيادة',
    department: 'قسم المعاينة والعيادات الخارجية',
    icon: Stethoscope,
    gradient: 'from-blue-600 via-indigo-600 to-blue-800',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-50 text-blue-700 border-blue-200/80',
    desc: 'معاينة وتشخيص المرضى، كتابة الوصفات والتقارير الطبية وإحالة العمليات'
  },
  secretary: {
    label: 'سكرتير الاستقبال',
    department: 'إدارة قاعة الانتظار وتسجيل المرضى',
    icon: Users,
    gradient: 'from-teal-600 via-emerald-600 to-teal-800',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    badge: 'bg-teal-50 text-teal-700 border-teal-200/80',
    desc: 'إدخال ملفات المرضى، إدارة تدفق الزيارات وتنسيق المواعيد'
  },
  cashier: {
    label: 'أمين الصندوق',
    department: 'المحاسبة والإيرادات المالية',
    icon: Wallet,
    gradient: 'from-slate-700 via-stone-800 to-slate-900',
    color: 'text-stone-700',
    bg: 'bg-stone-50',
    border: 'border-stone-200',
    badge: 'bg-stone-100 text-stone-700 border-stone-300/80',
    desc: 'تحصيل الرسوم وإصدار السندات ومتابعة الإيرادات والمصروفات اليومية'
  },
  lab: {
    label: 'فني المختبر',
    department: 'قسم التحاليل الطبية والباثولوجيا',
    icon: FlaskConical,
    gradient: 'from-purple-600 via-violet-600 to-indigo-800',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    badge: 'bg-purple-50 text-purple-700 border-purple-200/80',
    desc: 'استلام عينات الفحوصات وإجراء التحاليل واعتماد النتائج المخبرية'
  },
  radiology: {
    label: 'فني الأشعة',
    department: 'قسم التصوير التشخيصي والأشعة',
    icon: Radiation,
    gradient: 'from-sky-600 via-blue-600 to-cyan-800',
    color: 'text-sky-600',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    badge: 'bg-sky-50 text-sky-700 border-sky-200/80',
    desc: 'إجراء دراسات وفحوصات الأشعة وتجهيز الأفلام والتقارير الإشعاعية'
  },
  surgery_coordinator: {
    label: 'منسق العمليات',
    department: 'جدولة وتنسيق غرف العمليات الجراحية',
    icon: Scissors,
    gradient: 'from-orange-600 via-amber-600 to-orange-800',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    badge: 'bg-orange-50 text-orange-700 border-orange-200/80',
    desc: 'إدارة مواعيد العمليات الجراحية وتنسيق باقات وتجهيزات العمليات'
  },
  or_store: {
    label: 'مسؤول مخزن العمليات',
    department: 'المستلزمات الطبية ومستهلكات الجراحة',
    icon: Package,
    gradient: 'from-rose-600 via-pink-600 to-rose-800',
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    badge: 'bg-rose-50 text-rose-700 border-rose-200/80',
    desc: 'إدارة مخزون المستلزمات وصرف الأدوات والجرد الدوري لمخزن الجراحة'
  },
  general_store: {
    label: 'مسؤول المخزن العام',
    department: 'المستودع الرئيسي والتوريدات العامة',
    icon: Warehouse,
    gradient: 'from-teal-700 via-cyan-800 to-slate-900',
    color: 'text-teal-700',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    badge: 'bg-teal-50 text-teal-800 border-teal-200/80',
    desc: 'استلام التوريدات وإدارة الأصناف العامة والصرف لمستودعات الأقسام'
  },
  auditor: {
    label: 'مدير النظام والتدقيق',
    department: 'الحوكمة المركزية والرقابة والتقارير',
    icon: ShieldAlert,
    gradient: 'from-slate-800 via-indigo-950 to-slate-900',
    color: 'text-indigo-800',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    badge: 'bg-slate-100 text-slate-800 border-slate-300',
    desc: 'إدارة المستخدمين، ضبط إعدادات النظام، مراقبة سجلات الأمان والتدقيق'
  },
  default: {
    label: 'مستخدم النظام',
    department: 'الخدمات الطبية والإدارية',
    icon: User,
    gradient: 'from-slate-700 via-slate-800 to-slate-900',
    color: 'text-slate-700',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    desc: 'مستخدم موثق بالنظام بصلاحيات وصول محددة'
  }
};

// ── Password Field Helper Component ─────────────────────────────────
const PasswordInputField = ({ label, value, onChange, placeholder, autoComplete, id }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-bold text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full h-11 px-4 pl-11 bg-slate-50/70 border border-slate-200/90 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100/60 rounded-xl transition-all outline-none text-xs md:text-sm font-semibold text-slate-800 placeholder-slate-400"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          tabIndex={-1}
          className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors rounded-lg focus:outline-none"
          title={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
};

// ── Main Component ──────────────────────────────────────────────────
export default function PersonalSettings() {
  const { user, token, login } = useAuthStore();

  // Profile Form state
  const [profile, setProfile] = useState({ fullName: user?.fullName || user?.full_name || '' });
  const [savingProfile, setSavingProfile] = useState(false);

  // Password Form state
  const [pass, setPass] = useState({ current: '', new: '', confirm: '' });
  const [savingPass, setSavingPass] = useState(false);

  // Theme & Preferences
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [soundActive, setSoundActive] = useState(isSoundEnabled());

  // Role Configuration Resolution
  const userRole = user?.role || 'default';
  const roleMeta = ROLE_CONFIG[userRole] || ROLE_CONFIG.default;
  const RoleIcon = roleMeta.icon;

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = (selectedTheme) => {
    setTheme(selectedTheme);
    localStorage.setItem('theme', selectedTheme);
    if (selectedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    toast.success(`تم تحويل المظهر إلى ${selectedTheme === 'dark' ? 'الوضع الداكن' : 'الوضع الفاتح'}`);
  };

  const handleToggleSound = () => {
    const nextVal = !soundActive;
    setSoundEnabled(nextVal);
    setSoundActive(nextVal);
    if (nextVal) {
      playNotificationSound();
      toast.success('تم تفعيل التنبيهات الصوتية بنجاح');
    } else {
      toast.info('تم كتم التنبيهات الصوتية');
    }
  };

  const handleTestSound = () => {
    playNotificationSound();
    toast.info('تم تشغيل نغمة التنبيه التجريبية');
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!profile.fullName.trim()) return toast.error('يرجى إدخال الاسم الكامل');
    setSavingProfile(true);
    try {
      const res = await fetch(`/api/users/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fullName: profile.fullName }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('تم حفظ وتحديث بيانات الملف الشخصي بنجاح');
        login({ ...user, fullName: profile.fullName }, token);
      } else {
        toast.error(data.message || 'فشل تحديث الملف الشخصي');
      }
    } catch {
      toast.error('تعذر الاتصال بالخادم، يرجى المحاولة لاحقاً');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!pass.current) return toast.error('يرجى إدخال كلمة المرور الحالية');
    if (pass.new.length < 6) return toast.error('كلمة المرور الجديدة يجب أن تكون 6 خانات على الأقل');
    if (pass.new !== pass.confirm) return toast.error('كلمة المرور وتأكيدها غير متطابقين');
    setSavingPass(true);
    try {
      const res = await fetch('/api/users/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: pass.current, newPassword: pass.new }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'تم تغيير وتحديث كلمة المرور بنجاح');
        setPass({ current: '', new: '', confirm: '' });
      } else {
        toast.error(data.message || 'فشل تغيير كلمة المرور');
      }
    } catch {
      toast.error('تعذر الاتصال بالخادم، يرجى التحقق من الشبكة');
    } finally {
      setSavingPass(false);
    }
  };

  // Password Strength Calculation
  const passStrength = useMemo(() => {
    if (!pass.new) return { score: 0, text: 'لم يتم الإدخال', color: 'bg-slate-200' };
    let score = 0;
    if (pass.new.length >= 6) score += 1;
    if (pass.new.length >= 8) score += 1;
    if (/[0-9]/.test(pass.new)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass.new) || /[A-Z]/.test(pass.new)) score += 1;

    if (score <= 1) return { score: 1, text: 'ضعيفة', color: 'bg-rose-500' };
    if (score === 2) return { score: 2, text: 'مقبولة', color: 'bg-amber-400' };
    if (score === 3) return { score: 3, text: 'جيدة جداً', color: 'bg-blue-500' };
    return { score: 4, text: 'قوية وممتازة', color: 'bg-emerald-500' };
  }, [pass.new]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" dir="rtl">
      {/* ── 1. Top Header Banner ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 md:p-6 bg-white rounded-3xl border border-gray-100 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${roleMeta.gradient} text-white flex items-center justify-center shadow-md shadow-blue-500/10`}>
            <RoleIcon size={24} strokeWidth={2.2} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">
                إعدادات الحساب والنظام
              </h1>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black border ${roleMeta.badge}`}>
                <RoleIcon size={12} strokeWidth={2.2} />
                <span>{roleMeta.label}</span>
              </span>
            </div>
            <p className="text-xs md:text-sm font-semibold text-gray-400 mt-1">
              إدارة بيانات حسابك الشخصي، سياسات حوكمة الأمان وتغيير كلمة المرور، ومظهر النظام العام
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs font-bold text-slate-700 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>حالة الحساب:</span>
            <span className="text-emerald-700 font-black">نشط وموثق</span>
          </div>
        </div>
      </div>

      {/* ── 2. Main Dashboard Layout (Sidebar + Main Column) ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── Side Column (User Showcase & Quick System Overview) ──────── */}
        <div className="lg:col-span-4 space-y-6">
          {/* Identity & Account Card */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm relative overflow-hidden group">
            {/* Soft Ambient Background Glow */}
            <div className={`absolute -top-16 -right-16 w-36 h-36 bg-gradient-to-br ${roleMeta.gradient} opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-opacity duration-500`} />
            
            <div className="flex items-center gap-4 relative z-10">
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${roleMeta.gradient} text-white flex items-center justify-center text-2xl font-black shadow-md ring-4 ring-white`}>
                {(user?.fullName || user?.full_name || '؟').charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black text-slate-800 truncate" title={user?.fullName || user?.full_name}>
                  {user?.fullName || user?.full_name || 'مستخدم النظام'}
                </h2>
                <p className="text-xs font-mono font-bold text-slate-400 mt-0.5" dir="ltr">
                  @{user?.username || 'user'}
                </p>
                <div className="mt-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black border ${roleMeta.badge}`}>
                    <RoleIcon size={12} strokeWidth={2.2} />
                    <span>{roleMeta.label}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Department info */}
            <div className="mt-5 pt-4 border-t border-slate-100/90 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="font-bold">القسم والتبعية:</span>
                <span className="font-black text-slate-800 text-left">{roleMeta.department}</span>
              </div>
              <div className="flex items-center justify-between text-slate-500">
                <span className="font-bold">مستوى الأمان:</span>
                <span className="inline-flex items-center gap-1 font-black text-emerald-600">
                  <ShieldCheck size={13} />
                  مشفر ومحمي
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500">
                <span className="font-bold">حوكمة الصلاحيات:</span>
                <span className="font-mono font-bold text-slate-600 uppercase">ROLE-{userRole}</span>
              </div>
            </div>

            {/* Role Functional Summary */}
            <div className="mt-4 p-3 bg-slate-50/80 rounded-2xl border border-slate-100 text-[11px] font-bold text-slate-600 leading-relaxed">
              {roleMeta.desc}
            </div>
          </div>

          {/* Quick Preferences Box (Visible in sidebar on desktop) */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="font-black text-sm text-slate-800">مظهر النظام والتنبيهات</h3>
                <p className="text-[11px] font-bold text-slate-400">تخصيص العرض والمؤثرات الصوتية</p>
              </div>
            </div>

            {/* Theme Toggle Buttons */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">وضع الإضاءة (Theme Mode):</label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => toggleTheme('light')}
                  className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                    theme === 'light'
                      ? 'bg-blue-50/70 border-blue-500 text-blue-700 shadow-2xs'
                      : 'bg-slate-50/60 border-slate-200/80 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <Sun size={20} className={theme === 'light' ? 'text-amber-500' : 'text-slate-400'} />
                  <span className="text-xs font-black">الوضع الفاتح</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleTheme('dark')}
                  className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-slate-900 border-slate-700 text-white shadow-inner'
                      : 'bg-slate-50/60 border-slate-200/80 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <Moon size={20} className={theme === 'dark' ? 'text-blue-400' : 'text-slate-400'} />
                  <span className="text-xs font-black">الوضع الداكن</span>
                </button>
              </div>
            </div>

            {/* Sound Notifications Toggle */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-slate-700">التنبيهات الصوتية الحية</label>
                  <p className="text-[10px] font-bold text-slate-400">نغمات رنين عند استلام إشعارات سريرية</p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleSound}
                  className={`p-2 rounded-xl border transition-all cursor-pointer ${
                    soundActive
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
                  }`}
                  title={soundActive ? 'كتم التنبيهات' : 'تفعيل التنبيهات'}
                >
                  {soundActive ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
              </div>

              {soundActive && (
                <button
                  type="button"
                  onClick={handleTestSound}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold text-blue-600 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-200/70 rounded-xl transition-all cursor-pointer"
                >
                  <Volume2 size={14} />
                  <span>تجربة رنة الإشعار</span>
                </button>
              )}
            </div>
          </div>

          {/* Security & Confidentiality Badge */}
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-emerald-400">
                <ShieldCheck size={16} />
              </div>
              <h4 className="font-black text-xs text-white">الأمان والخصوصية الطبية</h4>
            </div>
            <p className="text-[11px] text-slate-300 font-medium leading-relaxed">
              لحماية السجلات والبيانات الطبية للمرضى، احرص على عدم مشاركة بيانات حسابك والاحتفاظ بكلمة مرور قوية ومحدثة دورياً.
            </p>
          </div>
        </div>

        {/* ── Main Column (Forms & Settings) ─────────────────────────── */}
        <div className="lg:col-span-8 space-y-6">
          {/* ── Section 1: Profile Information ────────────────────────── */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200/60 flex items-center justify-center shadow-2xs">
                    <User size={20} strokeWidth={2.2} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800">بيانات الملف الشخصي</h3>
                    <p className="text-xs font-bold text-slate-400">تحديث الاسم المعروض والبيانات العامة في النظام</p>
                  </div>
                </div>
                <span className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-xl border border-blue-100">
                  الحساب الشخصي
                </span>
              </div>

              <form onSubmit={handleSaveProfile} className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Full Name */}
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      الاسم الكامل (Display Name) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={profile.fullName}
                      onChange={e => setProfile(p => ({ ...p, fullName: e.target.value }))}
                      placeholder="أدخل اسمك الكامل..."
                      className="w-full h-11 px-4 bg-slate-50/70 border border-slate-200/90 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100/60 rounded-xl transition-all outline-none text-xs md:text-sm font-semibold text-slate-800"
                    />
                    <p className="text-[11px] font-semibold text-slate-400 mt-1">
                      يظهر هذا الاسم في ترويسة النظام وسندات القبض وتقارير المعاينة وسجلات النشاط.
                    </p>
                  </div>

                  {/* Username (Immutable) */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">اسم المستخدم (Username)</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={user?.username || ''}
                        disabled
                        dir="ltr"
                        className="w-full h-11 px-4 pl-9 bg-slate-100/80 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-500 cursor-not-allowed"
                      />
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                    <p className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                      <Info size={11} className="text-slate-400" />
                      معرّف دخول ثابت لا يمكن تغييره لأسباب تدقيقية
                    </p>
                  </div>

                  {/* Role (Immutable) */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">الدور الوظيفي (Role)</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={roleMeta.label}
                        disabled
                        className="w-full h-11 px-4 pr-9 bg-slate-100/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 cursor-not-allowed"
                      />
                      <RoleIcon size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                    <p className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                      <CheckSquare size={11} className="text-slate-400" />
                      محدد ومضبوط بواسطة إدارة النظام
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="flex items-center justify-center gap-2 text-xs md:text-sm font-black px-6 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer min-w-[140px]"
                  >
                    {savingProfile ? (
                      <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                    ) : (
                      <Save size={16} />
                    )}
                    <span>{savingProfile ? 'جاري الحفظ...' : 'حفظ بيانات الملف'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* ── Section 2: Change Password & Security ─────────────────── */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center shadow-2xs">
                    <Key size={20} strokeWidth={2.2} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800">تغيير كلمة المرور</h3>
                    <p className="text-xs font-bold text-slate-400">تحديث وتعيين كلمة مرور جديدة للحساب الشخصي</p>
                  </div>
                </div>
                <span className="text-xs font-black text-blue-700 bg-blue-50 px-3 py-1 rounded-xl border border-blue-200/70">
                  أمان الحساب
                </span>
              </div>

              <form onSubmit={handleChangePassword} className="p-6 space-y-5">
                <div className="space-y-4">
                  {/* Current Password */}
                  <PasswordInputField
                    id="current-password"
                    label="كلمة المرور الحالية"
                    value={pass.current}
                    onChange={e => setPass(p => ({ ...p, current: e.target.value }))}
                    placeholder="أدخل كلمة المرور الحالية..."
                    autoComplete="current-password"
                  />

                  {/* New Password & Confirm Password Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <PasswordInputField
                      id="new-password"
                      label="كلمة المرور الجديدة"
                      value={pass.new}
                      onChange={e => setPass(p => ({ ...p, new: e.target.value }))}
                      placeholder="6 خانات على الأقل..."
                      autoComplete="new-password"
                    />

                    <PasswordInputField
                      id="confirm-password"
                      label="تأكيد كلمة المرور الجديدة"
                      value={pass.confirm}
                      onChange={e => setPass(p => ({ ...p, confirm: e.target.value }))}
                      placeholder="أعد إدخال كلمة المرور..."
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                {/* Password Strength Bar */}
                {pass.new && (
                  <div className="p-3.5 bg-slate-50/70 rounded-2xl border border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-500">مستوى قوة كلمة المرور:</span>
                      <span className="font-black text-slate-800">{passStrength.text}</span>
                    </div>
                    <div className="flex gap-1.5 h-1.5">
                      {[1, 2, 3, 4].map(idx => (
                        <div
                          key={idx}
                          className={`flex-1 rounded-full transition-all duration-300 ${
                            passStrength.score >= idx ? passStrength.color : 'bg-slate-200'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Password Matching Feedback */}
                {pass.confirm && (
                  <div className={`p-3 rounded-2xl border flex items-center gap-2 text-xs font-bold ${
                    pass.new === pass.confirm
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                      : 'bg-rose-50 text-rose-700 border-rose-200/80'
                  }`}>
                    {pass.new === pass.confirm ? (
                      <>
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                        <span>كلمتا المرور متطابقتان وجاهزتان للحفظ</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                        <span>كلمتا المرور غير متطابقتين، يرجى التحقق من المدخلات</span>
                      </>
                    )}
                  </div>
                )}

                {/* Security Advice Box */}
                <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100 flex items-start gap-2.5">
                  <ShieldCheck size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                  <p className="text-[11px] font-bold text-slate-600 leading-relaxed">
                    إرشادات الأمان: احرص على اختيار كلمة مرور قوية وغير مكررة، وتجنب مشاركتها مع أي شخص آخر للحفاظ على سرية وحماية حسابك الطبي.
                  </p>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingPass}
                    className="flex items-center justify-center gap-2 text-xs md:text-sm font-black px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer min-w-[180px]"
                  >
                    {savingPass ? (
                      <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                    <span>{savingPass ? 'جاري الحفظ والتحديث...' : 'حفظ وتحديث كلمة المرور'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
    </div>
  );
}
