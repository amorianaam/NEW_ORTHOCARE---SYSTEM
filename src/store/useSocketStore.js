import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { playNotificationSound } from '../utils/notificationSound';

const useSocketStore = create(
  persist(
    (set) => ({
  latestPatientEvent: null,
  latestLabEvent: null,
  latestRadiologyEvent: null,
  latestInventoryEvent: null,
  latestCashierUpdate: null,
  latestSilentUpdate: null,
  latestSecretaryEvent: null,
  notifications: [],
  unreadCount: 0,

  setCashierUpdate: (event) => set({ latestCashierUpdate: { ...event, timestamp: Date.now() } }),
  setSilentUpdate: (event) => set({ latestSilentUpdate: { ...event, timestamp: Date.now() } }),
  setInventoryEvent: (event) => set({ latestInventoryEvent: { ...event, timestamp: Date.now() } }),

  setSecretaryEvent: (event) => set((state) => {
    const now = Date.now();
    const THREE_SECONDS = 3000;

    const newEvent = {
      ...event,
      timestamp: now,
      id: `${now}-${Math.random().toString(36).substr(2, 6)}`,
      read: false
    };

    // If event has no message or storePayload, it is a silent background state sync — do NOT push to notifications list!
    if (!event.message && !event.storePayload) {
      return { latestSecretaryEvent: newEvent };
    }

    // Dedup: reject duplicate notification if same visitId and type arrived within 3 seconds
    const isDuplicate = event.visitId && event.type && state.notifications.some(
      (n) => n.visitId === event.visitId && n.type === event.type && (now - n.timestamp) < THREE_SECONDS
    );

    if (isDuplicate) {
      return { latestSecretaryEvent: newEvent };
    }

    playNotificationSound();

    const updatedNotifications = [newEvent, ...state.notifications].slice(0, 50);
    return {
      latestSecretaryEvent: newEvent,
      notifications: updatedNotifications,
      unreadCount: state.unreadCount + 1
    };
  }),

  addNotification: (event) => set((state) => {
    if (!event || (!event.message && !event.storePayload)) return state;
    const now = Date.now();
    const TWO_SECONDS = 2000;

    // Dedup: reject if same message or payload arrived within 2 seconds
    const eventKey = event.message || event.storePayload?.title;
    const isDuplicate = eventKey && state.notifications.some(
      (n) => (n.message || n.storePayload?.title) === eventKey && (now - n.timestamp) < TWO_SECONDS
    );
    if (isDuplicate) return state;

    playNotificationSound();

    const newEvent = { 
      ...event, 
      timestamp: now, 
      id: `${now}-${Math.random().toString(36).substr(2, 6)}`, 
      read: false 
    };
    const updatedNotifications = [newEvent, ...state.notifications].slice(0, 50);
    return { notifications: updatedNotifications, unreadCount: state.unreadCount + 1 };
  }),

  markAllAsRead: () => set((state) => ({ 
    unreadCount: 0, 
    notifications: state.notifications.map(n => ({ ...n, read: true })) 
  })),
  clearNotifications: () => set({ notifications: [], unreadCount: 0 }),
  clearAllNotifications: () => set({ notifications: [], unreadCount: 0 }),
  deleteNotification: (id) => set((state) => ({
    notifications: state.notifications.filter(n => n.id !== id),
    unreadCount: Math.max(0, state.unreadCount - (state.notifications.find(n => n.id === id)?.read ? 0 : 1))
  })),

  setPatientEvent: (event) => set((state) => {
    const now = Date.now();
    const THREE_SECONDS = 3000;

    const newEvent = { 
      type: event.type || 'patient',
      ...event, 
      timestamp: now, 
      id: `${now}-${Math.random().toString(36).substr(2, 6)}`, 
      read: false 
    };

    if (!event.message && !event.storePayload) {
      return { latestPatientEvent: newEvent };
    }

    const isDuplicate = (event.visitId && (event.type || 'patient'))
      ? state.notifications.some(n => n.visitId === event.visitId && (n.type === event.type || n.type === 'patient') && (now - n.timestamp) < THREE_SECONDS)
      : state.notifications.some(n => n.message === event.message && (now - n.timestamp) < THREE_SECONDS);

    if (isDuplicate) {
      return { latestPatientEvent: newEvent };
    }

    playNotificationSound();

    const updatedNotifications = [newEvent, ...state.notifications].slice(0, 50);
    return { latestPatientEvent: newEvent, notifications: updatedNotifications, unreadCount: state.unreadCount + 1 };
  }),

  setLabEvent: (event) => set((state) => {
    const now = Date.now();
    const THREE_SECONDS = 3000;

    const newEvent = { 
      type: event.type || 'lab',
      ...event, 
      timestamp: now, 
      id: `${now}-${Math.random().toString(36).substr(2, 6)}`, 
      read: false 
    };

    if (!event.message && !event.storePayload) {
      return { latestLabEvent: newEvent };
    }

    const isDuplicate = (event.visitId && (event.type || 'lab'))
      ? state.notifications.some(n => n.visitId === event.visitId && (n.type === event.type || n.type === 'lab') && (now - n.timestamp) < THREE_SECONDS)
      : state.notifications.some(n => n.message === event.message && (now - n.timestamp) < THREE_SECONDS);

    if (isDuplicate) {
      return { latestLabEvent: newEvent };
    }

    playNotificationSound();

    const updatedNotifications = [newEvent, ...state.notifications].slice(0, 50);
    return { latestLabEvent: newEvent, notifications: updatedNotifications, unreadCount: state.unreadCount + 1 };
  }),

  setRadiologyEvent: (event) => set((state) => {
    const now = Date.now();
    const THREE_SECONDS = 3000;

    const newEvent = { 
      type: event.type || 'radiology',
      ...event, 
      timestamp: now, 
      id: `${now}-${Math.random().toString(36).substr(2, 6)}`, 
      read: false 
    };

    if (!event.message && !event.storePayload) {
      return { latestRadiologyEvent: newEvent };
    }

    const isDuplicate = (event.visitId && (event.type || 'radiology'))
      ? state.notifications.some(n => n.visitId === event.visitId && (n.type === event.type || n.type === 'radiology') && (now - n.timestamp) < THREE_SECONDS)
      : state.notifications.some(n => n.message === event.message && (now - n.timestamp) < THREE_SECONDS);

    if (isDuplicate) {
      return { latestRadiologyEvent: newEvent };
    }

    playNotificationSound();

    const updatedNotifications = [newEvent, ...state.notifications].slice(0, 50);
    return { latestRadiologyEvent: newEvent, notifications: updatedNotifications, unreadCount: state.unreadCount + 1 };
  }),
    }),
    {
      name: 'orthocare-notifications-storage',
      partialize: (state) => ({
        notifications: state.notifications,
        unreadCount: state.unreadCount
      })
    }
  )
);

export default useSocketStore;
