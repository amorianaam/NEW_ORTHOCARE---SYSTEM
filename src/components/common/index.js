/**
 * Common Components Barrel Export (Single Source of Truth)
 */

// Core Common Clinical & EMR Modals
export { default as PatientEMRModal } from './PatientEMRModal';
export { default as HistoricEMRModal } from './HistoricEMRModal';
export { default as SmartOrderModal } from './SmartOrderModal';

// Financial & Administrative Modals
export { default as FinancialRecordModal } from './FinancialRecordModal';
export { default as ConfirmDeleteModal } from './ConfirmDeleteModal';

// Shared UI Cards & Badges
export { default as PatientQueueCard } from './PatientQueueCard';
export { default as SmartStatusBadge, STATUS_REGISTRY, COLOR_MAP, DOT_MAP, computeLiveStatus } from './SmartStatusBadge';
export { default as UnifiedTimelineNavigator } from './UnifiedTimelineNavigator';

// Form & Input Controls
export { default as MedicationSelect } from './MedicationSelect';
export { default as ComboboxSelect } from './ComboboxSelect';
export { default as SearchInput } from './SearchInput';
