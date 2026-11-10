/**
 * SmartStatusBadge — Unified status badge for all user roles across ORTHOCARE
 * 
 * Props:
 *   visit            — visit object { status, labRequests, radiologyRequests, clinicalRequests }
 *   role             — 'cashier' | 'doctor' | 'secretary' | 'radiology' | 'lab' (default: 'cashier')
 *   size             — 'sm' | 'md' (default: 'sm')
 *   showPulse        — boolean (default: true)
 *   financial_status — string (optional: from getDynamicFinancialStatus SQL column)
 */
import React from 'react';

// ── Unified Status Registry ─────────────────────────────────────────
const STATUS_REGISTRY = {
  // Visit-level statuses
  registered:                       { label: 'تسجيل جديد',             color: 'slate',   pulse: false },
  waiting:                          { label: 'في قاعة الانتظار',        color: 'sky',     pulse: false },
  with_doctor:                      { label: 'مع الطبيب',               color: 'indigo',  pulse: true  },
  awaiting_service_payment:         { label: 'في انتظار الدفع',         color: 'amber',   pulse: true  },
  awaiting_lab:                     { label: 'في انتظار التنفيذ',       color: 'purple',  pulse: true  },
  awaiting_radiology:               { label: 'في انتظار التنفيذ',       color: 'purple',  pulse: true  },
  awaiting_surgery:                 { label: 'بانتظار العملية',         color: 'rose',    pulse: true  },
  transferred_to_center:            { label: 'محول للعمليات',           color: 'purple',  pulse: false },
  completed_admin_pending_services: { label: 'مكتمل (خدمات معلقة)',     color: 'amber',   pulse: false },
  completed:                        { label: 'تمت المعاينة',            color: 'emerald', pulse: false },
  cancelled:                        { label: 'زيارة ملغية',             color: 'slate',   pulse: false },

  // Financial statuses (from dynamic SQL)
  financial_cancelled:              { label: 'زيارة ملغية',             color: 'slate',   pulse: false },
  pending_entry_fee:                { label: 'بانتظار رسوم المعاينة',   color: 'rose',    pulse: true  },
  pending_services_payment:         { label: 'بانتظار رسوم الخدمات',   color: 'amber',   pulse: true  },
  pending_surgery_payment:          { label: 'بانتظار دفعة/عملية',     color: 'orange',  pulse: true  },
  pending_execution:                { label: 'في انتظار التنفيذ',       color: 'purple',  pulse: true  },
  in_execution:                     { label: 'قيد التنفيذ',             color: 'teal',    pulse: true  },
  examination_done:                 { label: 'تمت المعاينة',            color: 'emerald', pulse: false },
  ready_for_examination:            { label: 'جاهز للمعاينة',          color: 'sky',     pulse: false },

  // Doctor / Secretary live-computed statuses
  live_pending_payment:             { label: 'بانتظار الدفع',          color: 'rose',    pulse: true  },
  live_clinical_action:             { label: 'في انتظار التنفيذ',       color: 'purple',  pulse: true  },
  live_in_progress:                 { label: 'قيد التنفيذ',             color: 'teal',    pulse: true  },
  live_results_ready:               { label: 'النتائج جاهزة',          color: 'emerald', pulse: false },
  live_follow_up_services:          { label: 'متابعة خدمات',           color: 'sky',     pulse: false },
};

// ── Tailwind Color Map ──────────────────────────────────────────────
const COLOR_MAP = {
  slate:   'bg-slate-100/90 text-slate-600 border-slate-200/80',
  sky:     'bg-sky-100/90 text-sky-700 border-sky-200/80',
  indigo:  'bg-indigo-100/90 text-indigo-700 border-indigo-200/80',
  amber:   'bg-amber-100/90 text-amber-700 border-amber-200/80',
  orange:  'bg-orange-100/90 text-orange-700 border-orange-200/80',
  purple:  'bg-purple-100/90 text-purple-700 border-purple-200/80',
  violet:  'bg-violet-100/90 text-violet-700 border-violet-200/80',
  rose:    'bg-rose-100/90 text-rose-700 border-rose-200/80',
  emerald: 'bg-emerald-100/90 text-emerald-700 border-emerald-200/80',
  teal:    'bg-teal-100/90 text-teal-700 border-teal-200/80',
};

const DOT_MAP = {
  slate:   'bg-slate-400',
  sky:     'bg-sky-500',
  indigo:  'bg-indigo-500',
  amber:   'bg-amber-500',
  orange:  'bg-orange-500',
  purple:  'bg-purple-500',
  violet:  'bg-violet-500',
  rose:    'bg-rose-500',
  emerald: 'bg-emerald-500',
  teal:    'bg-teal-500',
};

// ── Doctor / Secretary Live Badge Computation ───────────────────────
function computeLiveStatus(visit) {
  if (!visit) return null;
  if (visit.status === 'completed' || visit.status === 'cancelled') return null;

  const labs      = (visit.labRequests || []).filter(r => r && r.status !== 'cancelled' && r.status !== 'refunded');
  const rads      = (visit.radiologyRequests || []).filter(r => r && r.status !== 'cancelled' && r.status !== 'refunded');
  const clinicals = (visit.clinicalRequests || []).filter(r => r && r.status !== 'cancelled' && r.status !== 'refunded');
  const all = [
    ...labs.map(r => ({ ...r, type: 'lab' })),
    ...rads.map(r => ({ ...r, type: 'radiology' })),
    ...clinicals.map(r => ({ ...r, type: 'clinical' }))
  ];

  if (all.length === 0) return null;

  // 1. Any service awaiting payment -> "بانتظار الدفع"
  if (all.some(r => r.status === 'pending_payment')) return 'live_pending_payment';

  // 2. Actively in execution (in_progress or result_uploaded) -> "قيد التنفيذ"
  if (all.some(r => r.status === 'in_progress' || r.status === 'result_uploaded')) {
    return 'in_execution';
  }

  // 3. Paid services awaiting execution -> "في انتظار التنفيذ"
  if (all.some(r => r.status === 'paid')) {
    return 'pending_execution';
  }

  // 4. All active diagnostic/clinical services completed -> "النتائج جاهزة"
  if (all.every(r => r.status === 'completed')) {
    return 'live_results_ready';
  }

  return 'live_follow_up_services';
}

export default function SmartStatusBadge({
  visit,
  role = 'cashier',
  size = 'sm',
  showPulse = true,
  financial_status
}) {
  let statusKey;

  if (role === 'cashier') {
    statusKey = financial_status || visit?.financial_status || visit?.status;
  } else if (role === 'doctor' || role === 'secretary') {
    statusKey = computeLiveStatus(visit) || visit?.status;
  } else {
    statusKey = computeLiveStatus(visit) || visit?.status;
  }

  const config = STATUS_REGISTRY[statusKey] || {
    label: statusKey || 'غير محدد',
    color: 'slate',
    pulse: false
  };

  const colorClass = COLOR_MAP[config.color] || COLOR_MAP.slate;
  const dotClass = DOT_MAP[config.color] || DOT_MAP.slate;
  const shouldPulse = showPulse && config.pulse;

  const sizeClass = size === 'sm'
    ? 'text-[11px] px-2.5 py-1 gap-1.5'
    : 'text-xs px-3 py-1.5 gap-2';

  return (
    <span className={`inline-flex items-center rounded-xl border font-bold shadow-xs whitespace-nowrap select-none transition-all ${colorClass} ${sizeClass}`}>
      <span className="relative flex h-2 w-2 flex-shrink-0">
        {shouldPulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotClass}`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotClass}`} />
      </span>
      <span>{config.label}</span>
    </span>
  );
}

export { STATUS_REGISTRY, COLOR_MAP, DOT_MAP, computeLiveStatus };
