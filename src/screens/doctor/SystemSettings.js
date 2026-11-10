import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Settings2, Save, DollarSign, HardDrive, Clock, Shield, CheckCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import useAuthStore from '../../store/useAuthStore';

const SettingCard = ({ icon: Icon, title, description, color, children }) => (
  <div
    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:-translate-y-0.5 transition-transform duration-300"
  >
    <div className={`px-5 py-4 border-b border-gray-100 flex items-center gap-3 ${color}`}>
      <div className="w-9 h-9 rounded-xl bg-white/50 flex items-center justify-center">
        <Icon size={18} />
      </div>
      <div>
        <p className="font-bold text-sm">{title}</p>
        <p className="text-xs opacity-75">{description}</p>
      </div>
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const SystemSettings = () => {
  const { token } = useAuthStore();
  const [entryFee, setEntryFee]             = useState('25');
  const [backupPath, setBackupPath]         = useState('D:\\ORTHOCARE_Backup');
  const [backupTime, setBackupTime]         = useState('23:00');
  const [sessionDuration, setSessionDuration] = useState('480');
  const [minPasswordLen, setMinPasswordLen]   = useState('6');
  const [saved, setSaved]                   = useState(false);
  const [saving, setSaving]                 = useState(false);

  useEffect(() => {
    if (!token) return;
    axios.get('/api/settings', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        const d = res.data;
        if (d.entry_fee) setEntryFee(String(d.entry_fee));
        if (d.backup_path) setBackupPath(String(d.backup_path));
        if (d.backup_time) setBackupTime(String(d.backup_time));
        if (d.session_duration) setSessionDuration(String(d.session_duration));
        if (d.min_password_len) setMinPasswordLen(String(d.min_password_len));
      })
      .catch((err) => {
        toast.error('حدث خطأ في تحميل إعدادات النظام');
      });
  }, [token]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const headers = {
        Authorization: `Bearer ${token}`
      };
      
      const settingsToSave = [
        { key: 'entry_fee', value: entryFee },
        { key: 'backup_path', value: backupPath },
        { key: 'backup_time', value: backupTime },
        { key: 'session_duration', value: sessionDuration },
        { key: 'min_password_len', value: minPasswordLen }
      ];

      await Promise.all(
        settingsToSave.map(s =>
          axios.put('/api/settings', s, { headers })
        )
      );

      setSaved(true);
      toast.success('تم حفظ الإعدادات بنجاح');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  const handleBackupNow = async () => {
    if (!token) return;
    toast.info('جاري إنشاء النسخة الاحتياطية...');
    try {
      await axios.post('/api/settings/backup', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('تم إنشاء النسخة الاحتياطية بنجاح ✓');
    } catch (err) {
      toast.error('فشل إنشاء النسخة الاحتياطية');
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-gray-800">إعدادات النظام</h1>
          <p className="text-xs text-gray-400 mt-1 font-semibold">ضبط الإعدادات العامة للمركز</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className={`flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all ${
            saved
              ? 'bg-emerald-600 text-white'
              : 'btn-primary'
          }`}>
          {saved ? <CheckCircle size={15} /> : <Save size={15} />}
          {saved ? 'تم الحفظ' : (saving ? 'جاري الحفظ...' : 'حفظ الإعدادات')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Entry Fee */}
        <SettingCard
          icon={DollarSign} title="رسوم المعاينة"
          description="يُطبق على جميع الزيارات الجديدة"
          color="bg-blue-50 text-blue-700"
        >
          <div className="flex items-center gap-4">
            <div className="flex-1">
               <label className="block text-sm font-semibold text-gray-700 mb-2">المبلغ (ريال يمني)</label>
              <div className="flex items-center gap-2">
                <input type="number" min="0" value={entryFee}
                  onChange={e => setEntryFee(e.target.value)}
                  className="input-base w-40 text-xl font-bold text-center"
                />
                <span className="text-gray-500 font-semibold">ريال يمني</span>
              </div>
            </div>
            <div className="text-sm text-gray-500 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-amber-700 font-semibold text-xs mb-1">⚠️ ملاحظة</p>
              <p className="text-xs">أي تغيير يُسجل تلقائياً في سجل التدقيق</p>
            </div>
          </div>
        </SettingCard>

        {/* Backup Settings */}
        <SettingCard
          icon={HardDrive} title="إعدادات النسخ الاحتياطي"
          description="نسخ يومي تلقائي لقاعدة البيانات"
          color="bg-emerald-50 text-emerald-700"
        >
          <div className="grid grid-cols-2 gap-5 mb-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">مسار الحفظ المحلي</label>
              <input value={backupPath} onChange={e => setBackupPath(e.target.value)}
                className="input-base font-mono text-sm" placeholder="C:\Backup" dir="ltr" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">وقت النسخ اليومي</label>
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-gray-400 flex-shrink-0" />
                <input type="time" value={backupTime} onChange={e => setBackupTime(e.target.value)}
                  className="input-base flex-1" dir="ltr" />
              </div>
            </div>
          </div>
          <button onClick={handleBackupNow}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
            <HardDrive size={15} />
            نسخ احتياطي الآن
          </button>
        </SettingCard>

        {/* Security */}
        <SettingCard
          icon={Shield} title="الأمان"
          description="إعدادات الحماية وكلمات المرور"
          color="bg-purple-50 text-purple-700"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700">مدة الجلسة (دقائق)</label>
              <input type="number" value={sessionDuration} onChange={e => setSessionDuration(e.target.value)}
                className="input-base w-24 text-center text-sm" />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700">الحد الأدنى لكلمة المرور (حروف)</label>
              <input type="number" value={minPasswordLen} onChange={e => setMinPasswordLen(e.target.value)}
                className="input-base w-24 text-center text-sm" />
            </div>
          </div>
        </SettingCard>
      </div>
    </div>
  );
};

export default SystemSettings;
