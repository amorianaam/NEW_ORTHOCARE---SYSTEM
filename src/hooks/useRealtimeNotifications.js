import React, { useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { FlaskConical, Activity, UserPlus, Syringe, DollarSign, Database, AlertTriangle, Package, Scissors, CreditCard } from 'lucide-react';
import { getSocket, joinRoom } from '../utils/socket';
import useSocketStore from '../store/useSocketStore';
import { formatArabicQuantity, formatArabicItemsCount, getSmartItemText, formatArabicServicesCount } from '../utils/arabicFormatters';

/**
 * useRealtimeNotifications — connects to Socket.IO and listens to role-specific events.
 * Call this once at the top-level component (e.g., Layout or App).
 * @param {string} role - user role string
 */
const useRealtimeNotifications = (role) => {
  // Selectorized store actions: prevents hook re-evaluation on notifications/unreadCount state changes
  const setPatientEvent = useSocketStore((s) => s.setPatientEvent);
  const setLabEvent = useSocketStore((s) => s.setLabEvent);
  const setRadiologyEvent = useSocketStore((s) => s.setRadiologyEvent);
  const setCashierUpdate = useSocketStore((s) => s.setCashierUpdate);
  const setSilentUpdate = useSocketStore((s) => s.setSilentUpdate);
  const addNotification = useSocketStore((s) => s.addNotification);
  const setSecretaryEvent = useSocketStore((s) => s.setSecretaryEvent);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!role) return;

    const socket = getSocket();
    socketRef.current = socket;
    joinRoom(role);

    // Explicitly ensure surgery_coordinator joins room
    if (role === 'surgery_coordinator') {
      joinRoom('surgery_coordinator');
    }

    // Registry of all [event, handler] pairs to guarantee exact-reference cleanup
    const listeners = [];
    const addListener = (event, handler) => {
      socket.on(event, handler);
      listeners.push({ event, handler });
    };

    // Re-join role room on reconnect
    const onConnect = () => {
      joinRoom(role);
      if (role === 'surgery_coordinator') {
        joinRoom('surgery_coordinator');
      }
    };
    addListener('connect', onConnect);

    const isStoreRole = role === 'general_store' || role === 'or_store';

    if (!isStoreRole) {
      // ── Secretary Specific Events ──
      if (role === 'secretary') {
        const onSecretaryLabReady = (data = {}) => {
          const patientName = data.patientName || 'مريض';
          setSecretaryEvent({ type: 'lab_ready', message: `نتائج تحاليل جاهزة: ${patientName}`, actionPath: '/secretary/dashboard', ...data });
          toast.success(
            <div className="flex items-center gap-3">
              <FlaskConical size={20} className="text-white" />
              <span className="font-semibold text-sm">نتائج تحاليل جاهزة: {patientName}</span>
            </div>, {
              toastId: `sec-lab-ready-${data.visitId || data.requestId || Date.now()}`,
              position: 'bottom-right',
              autoClose: 6000,
              icon: false,
            }
          );
        };
        addListener('secretary:lab_ready', onSecretaryLabReady);

        const onSecretaryRadiologyReady = (data = {}) => {
          const patientName = data.patientName || 'مريض';
          setSecretaryEvent({ type: 'radiology_ready', message: `تقرير الأشعة جاهز: ${patientName}`, actionPath: '/secretary/dashboard', ...data });
          toast.success(
            <div className="flex items-center gap-3">
              <Activity size={20} className="text-white" />
              <span className="font-semibold text-sm">تقرير الأشعة جاهز: {patientName}</span>
            </div>, {
              toastId: `sec-rad-ready-${data.visitId || data.requestId || Date.now()}`,
              position: 'bottom-right',
              autoClose: 6000,
              icon: false,
            }
          );
        };
        addListener('secretary:radiology_ready', onSecretaryRadiologyReady);

        const onSecretaryStatusChanged = (data = {}) => {
          setSecretaryEvent({ type: 'status_changed', ...data });
        };
        addListener('secretary:status_changed', onSecretaryStatusChanged);

        const onSecretaryPatientRegistered = (data = {}) => {
          const patientName = data.patientName || 'مريض';
          setSecretaryEvent({ type: 'patient_registered', message: `تم تسجيل مريض جديد: ${patientName}`, actionPath: '/secretary/dashboard', ...data });
          toast.info(
            <div className="flex items-center gap-3">
              <UserPlus size={20} className="text-white" />
              <span className="font-semibold text-sm">تم تسجيل مريض جديد: {patientName}</span>
            </div>, {
              toastId: `sec-patient-reg-${data.visitId || data.patientId || Date.now()}`,
              position: 'bottom-right',
              autoClose: 5000,
              icon: false,
            }
          );
        };
        addListener('secretary:patient_registered', onSecretaryPatientRegistered);

        const onSecretaryPatientDischarged = (data = {}) => {
          setSecretaryEvent({ type: 'patient_discharged', ...data });
          toast.success(`اكتملت معاينة المريض ${data.patientName}`, {
            toastId: `sec-patient-discharged-${data.visitId || Date.now()}`,
          });
        };
        addListener('secretary:patient_discharged', onSecretaryPatientDischarged);
      }

      // ── Cashier Specific Events ──
      if (role === 'cashier') {
        // Order cancelled by doctor
        const onOrderCancelledCashier = (data = {}) => {
          setSilentUpdate({ type: 'order_cancelled', ...data });
          const serviceName = data.serviceName || 'الخدمة';
          const patientName = data.patientName || 'المريض';
          const msg = `الطبيب ألغى طلب ${serviceName} للمريض ${patientName} (تم سحبه من السداد)`;
          addNotification({
            type: 'alert',
            message: msg,
            patientName,
            visitId: data.visitId,
            actionPath: '/cashier/board',
            storePayload: {
              title: 'إلغاء طلب خدمة',
              itemName: serviceName,
              bodyPost: ' - تم سحبه من السداد بواسطة الطبيب',
              footerText: `المريض: ${patientName}`
            }
          });
          toast.info(msg, {
            toastId: `cashier-order-cancelled-${data.visitId || data.serviceId || Date.now()}`
          });
        };
        addListener('order:cancelled', onOrderCancelledCashier);

        // Service requested by doctor
        const onCashierServiceRequested = (data = {}) => {
          setSilentUpdate({ type: 'cashier', ...data });
          const patientName = data.patientName || data.patient_name || 'مريض';
          const servicesCount = data.servicesCount || 1;
          const smartCount = formatArabicServicesCount(servicesCount);
          const msg = `طلب خدمات طبية للمريض: ${patientName} (${smartCount})`;
          
          addNotification({
            type: 'service_request',
            message: msg,
            patientName,
            visitId: data.visitId,
            actionPath: '/cashier/board?tab=services',
            storePayload: {
              title: 'طلب خدمات طبية',
              itemBadge: smartCount,
              bodyPost: '- بانتظار تسديد الرسوم',
              footerText: `المريض: ${patientName}`
            }
          });

          toast.info(
            <div className="flex items-center gap-3">
              <Activity size={20} className="text-white" />
              <span className="font-semibold text-sm">{msg}</span>
            </div>, {
              toastId: `cashier-services-${data.visitId || Date.now()}`,
              position: 'bottom-right',
              autoClose: 6000,
              icon: false,
            }
          );
        };
        addListener('cashier:service_requested', onCashierServiceRequested);

        // Surgery fee pending (priced & scheduled)
        const onCashierSurgeryFeePending = (data = {}) => {
          setSilentUpdate({ type: 'cashier', ...data });
          const patientName = data.patientName || data.patient_name || 'مريض';
          const surgeryType = data.surgeryType || data.surgery_type || 'عملية جراحية';
          const msg = `تم تسعير عملية جديدة للمريض: ${patientName} (عملية: ${surgeryType})`;

          addNotification({
            type: 'surgery_fee',
            message: msg,
            patientName,
            visitId: data.visitId,
            actionPath: '/cashier/board?tab=surgeries',
            storePayload: {
              title: 'رسوم عملية جراحية',
              itemName: `عملية: ${surgeryType}`,
              bodyPost: '- بانتظار تسديد رسوم العملية',
              footerText: `المريض: ${patientName}`
            }
          });

          toast.info(
            <div className="flex items-center gap-3">
              <Scissors size={20} className="text-white" />
              <span className="font-semibold text-sm">{msg}</span>
            </div>, {
              toastId: `cashier-surgery-fee-${data.visitId || data.surgeryId || Date.now()}`,
              position: 'bottom-right',
              autoClose: 6000,
              icon: false,
            }
          );
        };
        addListener('cashier:surgery_fee_pending', onCashierSurgeryFeePending);

        // New patient registered / revisit by secretary (Entry fees)
        const onPatientRegisteredCashier = (data = {}) => {
          const patientName = data.patientName || data.patient_name || 'مريض';
          const msg = data.message || `مريض جديد: ${patientName}`;
          const isRevisit = data.message?.includes('زيارة جديدة');

          addNotification({
            type: 'entry_fee',
            message: msg,
            patientName,
            visitId: data.visitId,
            actionPath: '/cashier/board?tab=entry_fees',
            storePayload: {
              title: isRevisit ? 'رسوم زيارة جديدة' : 'رسوم معاينة جديدة',
              bodyPost: 'بانتظار تسديد رسوم المعاينة',
              footerText: `المريض: ${patientName}`
            }
          });

          toast.info(
            <div className="flex items-center gap-3">
              <UserPlus size={20} className="text-white" />
              <span className="font-semibold text-sm">{msg}</span>
            </div>, {
              toastId: `cashier-entry-fee-${data.visitId || Date.now()}`,
              position: 'bottom-right',
              autoClose: 6000,
              icon: false,
            }
          );
        };
        addListener('patient:registered', onPatientRegisteredCashier);
      }

      // ── Lab / Radiology Specific Events ──
      if (role === 'lab' || role === 'radiology') {
        const onOrderCancelledDiag = (data = {}) => {
          setSilentUpdate({ type: 'order_cancelled', ...data });
          const serviceName = data.serviceName || 'الخدمة';
          const patientName = data.patientName || 'المريض';
          const msg = `الطبيب ألغى طلب ${serviceName} للمريض ${patientName}`;
          const actionPath = role === 'radiology' ? '/radiology/requests' : '/lab/requests';
          addNotification({
            type: 'alert',
            message: msg,
            patientName,
            visitId: data.visitId,
            actionPath,
            storePayload: {
              title: 'إلغاء طلب خدمة',
              itemName: serviceName,
              bodyPost: ' - تم إلغاء الطلب من قبل الطبيب',
              footerText: `المريض: ${patientName}`
            }
          });
          toast.warning(msg, {
            toastId: `diag-order-cancelled-${data.visitId || data.serviceId || Date.now()}`
          });
        };
        addListener('order:cancelled', onOrderCancelledDiag);

        const onServiceRefundedDiag = (data = {}) => {
          setSilentUpdate({ type: 'service_refunded', ...data });
          const serviceName = data.serviceName || 'الخدمة';
          const patientName = data.patientName || 'المريض';
          const msg = `تم استرداد رسوم ${serviceName} للمريض ${patientName} وإلغاء تنفيذه`;
          const actionPath = role === 'radiology' ? '/radiology/requests' : '/lab/requests';
          addNotification({
            type: 'alert',
            message: msg,
            patientName,
            visitId: data.visitId,
            actionPath,
            storePayload: {
              title: 'استرداد خدمة طبية',
              itemName: serviceName,
              bodyPost: ' - تم الاسترداد وإلغاء التنفيذ',
              footerText: `المريض: ${patientName}`
            }
          });
          toast.info(msg, {
            toastId: `diag-service-refunded-${data.visitId || data.serviceId || Date.now()}`
          });
        };
        addListener('service:refunded', onServiceRefundedDiag);

        // Incoming Transfer (Lab / Radiology)
        const onTransferSentDiag = (data = {}) => {
          setSilentUpdate({ type: 'transfer' });
          const senderStore = data.sender_name || (data.from_store === 'or' ? 'مخزن العمليات' : 'المخزن العام');
          const smartName = getSmartItemText(data.item_count, data.item_name || data.batch_ref);
          const actionPath = role === 'radiology' ? '/radiology/inventory' : '/lab/inventory';
          addNotification({
            type: 'receive',
            actionPath,
            storePayload: {
              title: 'شحنة واردة جديدة',
              itemName: smartName,
              itemBadge: data.quantity_label,
              footerText: `من: ${senderStore}`
            },
            message: data.message || `شحنة جديدة: ${smartName} من ${senderStore}`
          });
          toast.info(
            <div className="flex items-center gap-3">
              <Package size={20} className="text-white" />
              <span className="font-semibold text-sm">{data.message || `شحنة جديدة: ${smartName} من ${senderStore}`}</span>
            </div>, {
              toastId: `diag-transfer-sent-${data.batch_ref || data.transfer_id || Date.now()}`,
              position: 'bottom-right',
              autoClose: 6000,
              icon: false,
            }
          );
        };
        addListener('transfer:sent', onTransferSentDiag);

        // Transfer Revoked (Lab / Radiology)
        const onTransferRevokedDiag = (data = {}) => {
          setSilentUpdate({ type: 'transfer' });
          const itemName = data.itemName || data.item_name || getSmartItemText(data.item_count, data.batch_ref || data.batchRef);
          const senderName = data.senderName || data.sender_name || 'المخزن المرسل';
          const actionPath = role === 'radiology' ? '/radiology/inventory' : '/lab/inventory';
          addNotification({
            type: 'alert',
            actionPath,
            storePayload: {
              title: 'إلغاء شحنة',
              itemName,
              footerText: `إلغاء من قبل: ${senderName}`
            },
            message: `تم إلغاء وسحب شحنة ${itemName} من قبل ${senderName}`
          });
          toast.warning(`تم سحب/إلغاء شحنة ${itemName} من قبل ${senderName}`, {
            toastId: `diag-transfer-revoked-${data.batch_ref || data.transfer_id || Date.now()}`
          });
        };
        addListener('transfer:revoked', onTransferRevokedDiag);

        // Lab/Radiology: new service request from doctor
        const onRequestNew = (data = {}) => {
          const baseMessage = data.message || 'طلب خدمة جديد';
          setLabEvent({ message: baseMessage, ...data });
          toast.info(
            <div className="flex items-center gap-3">
              <Activity size={20} className="text-white" />
              <span className="font-semibold text-sm">{baseMessage}</span>
            </div>, {
              toastId: `diag-request-new-${data.visitId || data.requestId || Date.now()}`,
              position: 'bottom-right',
              autoClose: 6000,
              icon: false,
            }
          );
        };
        addListener('request:new', onRequestNew);
      }

      // ── Doctor Specific Events ──
      if (role === 'doctor') {
        const onServiceCancelledByCashier = (data = {}) => {
          setSilentUpdate({ type: 'service_cancelled', ...data });
          const serviceName = data.serviceName || 'الخدمة';
          const patientName = data.patientName || 'المريض';
          const msg = `المحاسب ألغى ${serviceName} للمريض ${patientName}`;
          addNotification({
            type: 'alert',
            message: msg,
            patientName,
            visitId: data.visitId,
            actionPath: '/doctor/queue',
            storePayload: {
              title: 'إلغاء خدمة غير مدفوعة',
              itemName: serviceName,
              bodyPost: ' - تم الإلغاء من قبل المحاسب',
              footerText: `المريض: ${patientName}`
            }
          });
          toast.warning(msg, {
            toastId: `doc-service-cancelled-${data.visitId || data.serviceId || Date.now()}`
          });
        };
        addListener('service:cancelled_by_cashier', onServiceCancelledByCashier);

        const onServiceRefundedDoctor = (data = {}) => {
          setSilentUpdate({ type: 'service_refunded', ...data });
          const serviceName = data.serviceName || 'الخدمة';
          const patientName = data.patientName || 'المريض';
          const msg = `المحاسب قام باسترداد رسوم ${serviceName} للمريض ${patientName} وتم سحب الطلب`;
          addNotification({
            type: 'alert',
            message: msg,
            patientName,
            visitId: data.visitId,
            actionPath: '/doctor/queue',
            storePayload: {
              title: 'استرداد رسوم خدمة',
              itemName: serviceName,
              bodyPost: ' - تم الاسترداد وسحب الطلب',
              footerText: `المريض: ${patientName}`
            }
          });
          toast.info(msg, {
            toastId: `doc-service-refunded-${data.visitId || data.serviceId || Date.now()}`
          });
        };
        addListener('service:refunded', onServiceRefundedDoctor);

        // Backup notifications (Doctor / Clinic Admin)
        const onBackupDone = ({ file } = {}) => {
          toast.success(
            <div className="flex items-center gap-3">
              <Database size={20} className="text-white" />
              <span className="font-semibold text-sm">نسخ احتياطي: {file}</span>
            </div>, {
              toastId: `backup-done-${file || Date.now()}`,
              autoClose: 8000,
              icon: false
            }
          );
        };
        addListener('backup:done', onBackupDone);

        const onBackupFailed = ({ message } = {}) => {
          toast.error(
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} className="text-white" />
              <span className="font-semibold text-sm">{message}</span>
            </div>, {
              toastId: `backup-failed-${Date.now()}`,
              autoClose: 8000,
              icon: false
            }
          );
        };
        addListener('backup:failed', onBackupFailed);
      }

      // ── Doctor & Secretary Shared Events ──
      if (role === 'doctor' || role === 'secretary') {
        // Patient moved to waiting (entry fee paid or follow-up)
        const onPatientWaiting = (data = {}) => {
          const fullName = data.patientName || data.patient_name;
          const baseMessage = data.message || 'تم تسديد رسوم المعاينة ونقل المريض لقائمة الانتظار';
          const finalMessage = fullName && !baseMessage.includes(fullName) ? `${baseMessage} - ${fullName}` : baseMessage;
          setPatientEvent({ message: finalMessage, patientName: fullName, type: 'patient_queued', ...data });
          toast.success(
            <div className="flex items-center gap-3">
              <UserPlus size={20} className="text-white" />
              <span className="font-semibold text-sm">{finalMessage}</span>
            </div>, {
              toastId: `patient-waiting-${data.visitId || Date.now()}`,
              position: 'bottom-right',
              autoClose: 5000,
              icon: false,
            }
          );
        };
        addListener('patient:waiting', onPatientWaiting);

        // Lab investigation completed
        const onLabCompleted = (data = {}) => {
          const fullName = data.patientName || data.patient_name;
          const baseMessage = data.message || 'تم إنجاز التحليل';
          const finalMessage = fullName ? `${baseMessage} - ${fullName}` : baseMessage;
          setLabEvent({ message: finalMessage, ...data });
          toast.success(
            <div className="flex items-center gap-3">
              <FlaskConical size={20} className="text-white" />
              <span className="font-semibold text-sm">{finalMessage}</span>
            </div>, {
              toastId: `lab-completed-${data.visitId || data.requestId || Date.now()}`,
              position: 'bottom-right',
              autoClose: 6000,
              icon: false,
            }
          );
        };
        addListener('lab:completed', onLabCompleted);

        // Radiology scan completed
        const onRadiologyCompleted = (data = {}) => {
          const fullName = data.patientName || data.patient_name;
          const baseMessage = data.message || 'تم إنجاز الأشعة';
          const finalMessage = fullName ? `${baseMessage} - ${fullName}` : baseMessage;
          setRadiologyEvent({ message: finalMessage, ...data });
          toast.success(
            <div className="flex items-center gap-3">
              <Activity size={20} className="text-white" />
              <span className="font-semibold text-sm">{finalMessage}</span>
            </div>, {
              toastId: `radiology-completed-${data.visitId || data.requestId || Date.now()}`,
              position: 'bottom-right',
              autoClose: 6000,
              icon: false,
            }
          );
        };
        addListener('radiology:completed', onRadiologyCompleted);

        // Result edited / updated
        const onResultUpdated = (data = {}) => {
          const patientName = data.patientName || 'مريض';
          const isRad = data.category === 'radiology' || data.type === 'radiology_ready';
          const msg = data.message || (isRad ? `تم تعديل نتيجة الأشعة للمريض: ${patientName}` : `تم تعديل نتيجة التحاليل للمريض: ${patientName}`);

          addNotification({
            type: isRad ? 'radiology_ready' : 'lab_ready',
            message: msg,
            patientName,
            visitId: data.visitId,
            actionPath: role === 'secretary' ? '/secretary/dashboard' : '/doctor/queue'
          });

          toast.info(
            <div className="flex items-center gap-3">
              {isRad ? <Activity size={20} className="text-white" /> : <FlaskConical size={20} className="text-white" />}
              <span className="font-semibold text-sm">{msg}</span>
            </div>, {
              toastId: `result-updated-${data.visitId || Date.now()}`,
              position: 'bottom-right',
              autoClose: 6000,
              icon: false,
            }
          );
        };
        addListener('result:updated', onResultUpdated);
      }

      // ── Surgery Coordinator Specific Events ──
      if (role === 'surgery_coordinator') {
        const onSurgeryReferral = ({ message, visitId, surgeryId } = {}) => {
          const msg = message || 'إحالة عملية جديدة';
          toast.info(
            <div className="flex items-center gap-3">
              <Syringe size={20} className="text-white" />
              <span className="font-semibold text-sm">{msg}</span>
            </div>, {
              toastId: `surgery-referral-${visitId || surgeryId || Date.now()}`,
              position: 'bottom-right',
              autoClose: 6000,
              icon: false,
            }
          );
        };
        addListener('surgery:new_referral', onSurgeryReferral);

        const onSurgeryPayment = ({ message, visitId, surgeryId } = {}) => {
          const msg = message || 'تم استلام دفعة عملية';
          toast.success(
            <div className="flex items-center gap-3">
              <DollarSign size={20} className="text-white" />
              <span className="font-semibold text-sm">{msg}</span>
            </div>, {
              toastId: `surgery-payment-${visitId || surgeryId || Date.now()}`,
              position: 'bottom-right',
              autoClose: 6000,
              icon: false,
            }
          );
        };
        addListener('surgery:payment_received', onSurgeryPayment);
      }

      // ── Visit Cancelled Event (Doctor / Secretary / Cashier) ──
      if (role === 'doctor' || role === 'secretary' || role === 'cashier') {
        const onVisitCancelled = (data = {}) => {
          setSilentUpdate({
            timestamp: Date.now(),
            type: 'cancellation',
            visitId: data.visitId,
            patientId: data.patientId,
            isConsultationRefund: data.isConsultationRefund
          });
          const patientName = data.patientName || 'مريض';
          const vNum = data.visitNumber ? `(${data.visitNumber}) ` : '';
          const msg = data.message || `تم إلغاء الزيارة ${vNum}للمريض: (${patientName}) من قبل المحاسب وتم سحبها من النظام`;
          
          addNotification({
            type: 'alert',
            message: msg,
            patientName,
            visitId: data.visitId
          });

          toast.error(
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} className="text-white flex-shrink-0" />
              <div>
                <p className="font-bold text-sm leading-snug">{msg}</p>
              </div>
            </div>,
            {
              toastId: `visit-cancelled-${data.visitId || Date.now()}`,
              autoClose: 8000,
              icon: false
            }
          );
        };
        addListener('visit:cancelled', onVisitCancelled);
      }

      // ── Silent Hydration Events ──
      const onPatientUpdated = (data = {}) => setSilentUpdate(data);
      addListener('patient:updated', onPatientUpdated);

      const onLabUpdate = (data = {}) => {
        setSilentUpdate(data);
        setLabEvent(data);
      };
      addListener('lab:update', onLabUpdate);

      const onRequestUpdate = (data = {}) => {
        setSilentUpdate(data);
        setLabEvent(data);
      };
      addListener('request:update', onRequestUpdate);

      const onRadiologyUpdated = (data = {}) => setSilentUpdate(data);
      addListener('radiology:updated', onRadiologyUpdated);

      if (role === 'lab' || role === 'radiology') {
        const onInventoryUpdatedDiag = (data = {}) => setSilentUpdate({ ...data, type: 'inventory' });
        addListener('inventory:updated', onInventoryUpdatedDiag);
      }

      const onCashierUpdate = (data = {}) => {
        setCashierUpdate(data);
        setSilentUpdate({ ...data, type: 'cashier', ts: Date.now() });
      };
      addListener('cashier:update', onCashierUpdate);
    }

    if (isStoreRole) {
      // ── General Store: stock received / issued ──
      const onInventoryUpdatedStore = (data = {}) => setSilentUpdate({ ...data, type: 'inventory' });
      addListener('inventory:updated', onInventoryUpdatedStore);

      const onBatchReceived = (data = {}) => {
        setSilentUpdate({ type: 'inventory' });
        const itemsCount = data.items?.length || 0;
        let title, itemName, itemBadge;

        if (itemsCount === 1) {
            const formattedQty = formatArabicQuantity(data.items[0].quantity, data.items[0].item_unit);
            title = 'عملية استلام';
            itemName = data.items[0].item_name;
            itemBadge = formattedQty;
        } else {
            title = `استلام دفعة (${formatArabicItemsCount(itemsCount)})`;
        }

        addNotification({ 
            role,
            type: 'receive',
            storePayload: {
                title,
                itemName,
                itemBadge,
                footerText: `المورد: ${data.supplier}`
            },
            message: itemName ? `${title}, ${itemName} (${itemBadge}), المورد: ${data.supplier}` : `${title} | المورد: ${data.supplier}`
        });
      };
      addListener('batch:received', onBatchReceived);

      const onBatchIssued = (data = {}) => {
        setSilentUpdate({ type: 'inventory' });
        const itemsCount = data.items?.length || 0;
        let title, itemName, itemBadge;

        if (itemsCount === 1) {
            const formattedQty = formatArabicQuantity(data.items[0].quantity, data.items[0].item_unit);
            title = 'عملية صرف';
            itemName = data.items[0].item_name;
            itemBadge = formattedQty;
        } else {
            title = `صرف دفعة (${formatArabicItemsCount(itemsCount)})`;
        }

        addNotification({ 
            role,
            type: 'issue',
            storePayload: {
                title,
                itemName,
                itemBadge,
                footerText: `الوجهة: ${data.destination}`
            },
            message: itemName ? `${title}, ${itemName} (${itemBadge}), الوجهة: ${data.destination}` : `${title} | الوجهة: ${data.destination}`
        });
      };
      addListener('batch:issued', onBatchIssued);

      // ── Transfer Notifications ──
      const onTransferRevokedStore = (data = {}) => {
        setSilentUpdate({ type: 'transfer' });
        const fallbackSender = role === 'or_store' ? 'المخزن العام' : 'مخزن العمليات';
        const senderName = data.senderName || data.sender_name || fallbackSender;
        const itemName = data.itemName || data.item_name || getSmartItemText(data.item_count, data.batch_ref || data.batchRef);
        const msg = `تم سحب/إلغاء شحنة ${itemName} من قبل ${senderName}`;
        addNotification({
          role,
          type: 'alert',
          storePayload: {
            title: 'إلغاء شحنة',
            itemName,
            footerText: `إلغاء من قبل: ${senderName}`
          },
          message: msg
        });
        toast.warning(`تم سحب/إلغاء شحنة ${itemName} من قبل ${senderName}`, {
          toastId: `store-transfer-revoked-${data.transfer_id || data.batch_ref || Date.now()}`
        });
      };
      addListener('transfer:revoked', onTransferRevokedStore);

      const onTransferSentStore = (data = {}) => {
        setSilentUpdate({ type: 'transfer' });
        const fallbackSender = role === 'or_store' ? 'المخزن العام' : 'مخزن العمليات';
        const dynamicPath = role === 'or_store' ? '/or-store/receive' : '/general-store/receive';
        addNotification({
          role,
          type: 'receive',
          actionPath: dynamicPath,
          storePayload: {
            title: 'شحنة واردة جديدة',
            itemName: getSmartItemText(data.item_count, data.item_name || data.batch_ref),
            itemBadge: data.quantity_label,
            footerText: `من: ${data.sender_name || fallbackSender}`
          },
          message: data.message || `شحنة جديدة: ${getSmartItemText(data.item_count, data.item_name || data.batch_ref)} من ${fallbackSender}`
        });
      };
      addListener('transfer:sent', onTransferSentStore);

      const onTransferReceivedStore = (data = {}) => {
        setSilentUpdate({ type: 'inventory' }); // refresh ledger
        const fallbackSender = role === 'or_store' ? 'المخزن العام' : 'مخزن العمليات';
        const smartName = getSmartItemText(data.item_count, data.item_name || data.batch_ref);
        const msg = `تم تأكيد استلام شحنة ${smartName} من قبل ${data.sender_name || fallbackSender}`;
        addNotification({
          role,
          type: 'receive',
          storePayload: {
            title: 'تأكيد استلام شحنة',
            itemName: getSmartItemText(data.item_count, data.item_name || data.batch_ref),
            footerText: `بواسطة: ${data.sender_name || fallbackSender}`
          },
          message: msg
        });
        toast.success(
          <div className="flex items-center gap-3">
            <Package size={20} className="text-white" />
            <span className="font-semibold text-sm">{msg}</span>
          </div>, {
            toastId: `store-transfer-received-${data.transfer_id || data.batch_ref || Date.now()}`,
            position: 'bottom-right',
            autoClose: 6000,
            icon: false
          }
        );
      };
      addListener('transfer:received', onTransferReceivedStore);

      const onTransferRejectedStore = (data = {}) => {
        setSilentUpdate({ type: 'inventory' }); // update general store ledger
        const itemName = data.itemName || data.item_name || getSmartItemText(data.item_count, data.batch_ref || data.batchRef);
        const receiverName = data.receiverName || data.receiver_name || data.sender_name || 'الجهة المستلمة';
        addNotification({
          role,
          type: 'alert',
          storePayload: {
            title: 'تم رفض الشحنة',
            itemName,
            bodyPost: ` - السبب: ${data.reason}`,
            footerText: `رفض بواسطة: ${receiverName}`
          },
          message: `تم رفض شحنة ${itemName}. السبب: ${data.reason}`
        });
        toast.error(`تم رفض استلام شحنة ${itemName} من قبل ${receiverName}. السبب: ${data.reason}`, {
          toastId: `store-transfer-rejected-${data.transfer_id || data.batch_ref || Date.now()}`
        });
      };
      addListener('transfer:rejected', onTransferRejectedStore);
    }

    return () => {
      const currentSocket = socketRef.current;
      if (currentSocket) {
        listeners.forEach(({ event, handler }) => {
          currentSocket.off(event, handler);
        });
      }
    };
  }, [role, setPatientEvent, setLabEvent, setRadiologyEvent, setCashierUpdate, setSilentUpdate, addNotification, setSecretaryEvent]);
};

export default useRealtimeNotifications;
