import React from 'react';
import { Crown, RotateCcw, Scissors, CheckCircle, Eye, History, Phone } from 'lucide-react';
import SmartStatusBadge from './SmartStatusBadge';

// ── Helpers ──────────────────────────────────────────────────────────────────
const formatPhoneNumber = (phone) => {
  if (!phone) return '';
  const clean = String(phone).trim().replace(/\D/g, '');
  if (clean.length === 9) {
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }
  if (clean.length === 10 && clean.startsWith('0')) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7)}`;
  }
  return String(phone).trim();
};

// ── Type chips ───────────────────────────────────────────────────────────────
const VISIT_CHIP = {
  review: { label: 'مراجعة', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

// ── Theme configuration ──────────────────────────────────────────────────────
const THEME_STYLES = {
  blue: {
    avatar: 'bg-gradient-to-br from-blue-50 to-blue-100/80 text-blue-700 border border-blue-200/50',
    hoverBorder: 'hover:border-blue-300 hover:shadow-blue-500/10',
    defaultBadge: 'bg-blue-50 text-blue-700 border-blue-200/60',
    pulse: 'bg-blue-600',
    btnGradient: 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/20 hover:shadow-blue-500/30',
  },
  rose: {
    avatar: 'bg-gradient-to-br from-rose-50 to-rose-100/80 text-rose-700 border border-rose-200/50',
    hoverBorder: 'hover:border-rose-300 hover:shadow-rose-500/10',
    defaultBadge: 'bg-rose-50 text-rose-700 border-rose-200/60',
    pulse: 'bg-rose-500',
    btnGradient: 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 shadow-rose-500/20 hover:shadow-rose-500/30',
  },
  emerald: {
    avatar: 'bg-gradient-to-br from-emerald-50 to-emerald-100/80 text-emerald-700 border border-emerald-200/50',
    hoverBorder: 'hover:border-emerald-300 hover:shadow-emerald-500/10',
    defaultBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    pulse: 'bg-emerald-500',
    btnGradient: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/20 hover:shadow-emerald-500/30',
  },
  amber: {
    avatar: 'bg-gradient-to-br from-amber-50 to-amber-100/80 text-amber-700 border border-amber-200/50',
    hoverBorder: 'hover:border-amber-300 hover:shadow-amber-500/10',
    defaultBadge: 'bg-amber-50 text-amber-700 border-amber-200/60',
    pulse: 'bg-amber-500',
    btnGradient: 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 shadow-amber-500/20 hover:shadow-amber-500/30',
  },
};

// ── Main Component ───────────────────────────────────────────────────────────
export default function PatientQueueCard({
  visit,
  onClick,
  badge,               // from getPatientLiveBadge()
  colorTheme = 'blue', // 'blue' | 'rose' | 'emerald' | 'amber'
  index,               // 1-based sequence index
  workspaceTab,        // 'waiting_list' | 'pending_tracking' | 'completed_list'
  hideStatus = false,
  actionButton,
  actionLabel,
  actionIcon,
  onActionClick,
}) {
  if (!visit) return null;

  const isReadOnly = workspaceTab === 'completed_list' || visit.status === 'completed';
  const theme = THEME_STYLES[colorTheme] || THEME_STYLES.blue;

  // Unified English date and time formatting matching List view
  const dateFormatted = visit.created_at
    ? `${new Date(visit.created_at).toLocaleDateString('en-GB')} - ${new Date(visit.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`
    : '--';

  const hasPhone = Boolean(visit.phone && String(visit.phone).trim() && String(visit.phone).trim() !== '-' && String(visit.phone).trim() !== '—');
  const hasVisitsCount = Number(visit.total_visits) > 1;

  // Status badge determination matching List view
  const renderStatusBadge = () => {
    if (isReadOnly || workspaceTab === 'completed_list') {
      return <SmartStatusBadge visit={{ ...visit, status: 'completed' }} role="doctor" />;
    }

    if (workspaceTab === 'waiting_list') {
      return <SmartStatusBadge visit={{ ...visit, status: 'waiting' }} role="doctor" />;
    }

    return <SmartStatusBadge visit={visit} role="doctor" />;
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-3xl border border-slate-100/90 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${theme.hoverBorder} flex flex-col justify-between p-5 select-none shadow-[0_4px_20px_rgb(0,0,0,0.03)] group`}
      dir="rtl"
    >
      {/* Top: Avatar + Patient Name + Visit ID + Index Counter */}
      <div className="flex justify-between items-start gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center font-black text-base transition-transform group-hover:scale-105 shadow-xs ${theme.avatar}`}>
            {visit.full_name?.charAt(0) ?? '؟'}
          </div>
          <div className="min-w-0 flex-1 text-right" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
            <div className="flex items-center gap-1 flex-wrap">
              <h3 className="font-black text-slate-800 text-sm leading-tight group-hover:text-blue-700 transition-colors truncate">
                {visit.full_name}
              </h3>
              {Boolean(visit.is_follow_up) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-emerald-100/75 text-emerald-700 border border-emerald-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                  <RotateCcw size={11} className="text-emerald-600 shrink-0" strokeWidth={2.2} />
                  <span>مراجعة</span>
                </span>
              )}
              {Boolean(visit.is_exempt) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-amber-100/75 text-amber-700 border border-amber-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                  <Crown size={11} className="text-amber-600 shrink-0" strokeWidth={2.2} />
                  <span>إعفاء</span>
                </span>
              )}
              {Boolean(visit.is_surgery || visit.visit_status === 'transferred_to_center' || visit.status === 'transferred_to_center') && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-black bg-purple-100/75 text-purple-700 border border-purple-200/70 select-none flex-shrink-0 shadow-2xs leading-none whitespace-nowrap">
                  <Scissors size={11} className="text-purple-600 shrink-0" strokeWidth={2.2} />
                  <span>عمليات</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-1" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
              <p className="text-[11px] font-bold text-slate-400 text-right" dir="rtl" style={{ textAlign: 'right', direction: 'rtl' }}>
                <span dir="ltr">{visit.visit_number || visit.visitId}</span>
              </p>
              {visit.matchedVisit && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black select-none leading-none shadow-2xs ${
                  visit.matchedVisitTheme === 'teal' || visit.matchedVisitTheme === 'green'
                    ? 'bg-teal-50 text-teal-700 border border-teal-200/80'
                    : 'bg-sky-50 text-sky-700 border border-sky-200/80'
                }`}>
                  <History size={10} className={visit.matchedVisitTheme === 'teal' || visit.matchedVisitTheme === 'green' ? "text-teal-600 shrink-0" : "text-sky-600 shrink-0"} strokeWidth={2.2} />
                  <span>زيارة سابقة:</span>
                  <span dir="ltr" className="font-black">{visit.matchedVisit}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Index Counter Badge */}
        {index != null && (
          <span className="text-xs font-black text-slate-400 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100 flex-shrink-0">
            {index}
          </span>
        )}
      </div>

      {/* Middle row: Total visits badge (Right) & Phone (Left) */}
      {(hasVisitsCount || hasPhone) && (
        <div className="mt-3.5 pt-3 border-t border-slate-100/80 flex items-center justify-between min-h-[30px]">
          {hasVisitsCount ? (
            <div className="text-right">
              <span 
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200/50 cursor-help"
                title={visit.all_visit_numbers ? `معرفات الزيارات: ${visit.all_visit_numbers}` : undefined}
              >
                {Number(visit.total_visits) === 2 ? 'زيارتان' : `${visit.total_visits} زيارات`}
              </span>
            </div>
          ) : (
            <div />
          )}
          {hasPhone ? (
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
              <Phone size={13} className="text-slate-400 shrink-0" />
              <span>{formatPhoneNumber(visit.phone)}</span>
            </div>
          ) : (
            <div />
          )}
        </div>
      )}

      {/* Bottom Metadata: Date / Time and Status or Action Button */}
      <div className={`flex items-center ${(!hideStatus || actionButton || actionLabel) ? 'justify-between' : 'justify-start'} pt-3 mt-3 border-t border-slate-100/80 gap-2`}>
        <span className="text-xs font-bold text-slate-700 whitespace-nowrap" dir="ltr">
          {dateFormatted}
        </span>
        {actionButton ? (
          <div>{actionButton}</div>
        ) : actionLabel ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onActionClick) onActionClick(e);
              else if (onClick) onClick(e);
            }}
            className={`px-3 py-1.5 font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs active:scale-95 whitespace-nowrap text-white ${theme.btnGradient}`}
          >
            {actionIcon || <Eye size={13} strokeWidth={2.5} />}
            <span>{actionLabel}</span>
          </button>
        ) : !hideStatus ? (
          <div>
            {renderStatusBadge()}
          </div>
        ) : null}
      </div>
    </div>
  );
}
