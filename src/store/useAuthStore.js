import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import useSocketStore from './useSocketStore';

const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (user, token) => {
        const prevUser = useAuthStore.getState().user;
        if (!prevUser || prevUser.id !== user?.id || prevUser.role !== user?.role) {
          useSocketStore.getState().clearAllNotifications();
        }
        set({ user, token, isAuthenticated: true });
      },
      logout: () => {
        useSocketStore.getState().clearAllNotifications();
        set({ user: null, token: null, isAuthenticated: false });
      },
    }),
    {
      name: 'orthocare-auth-storage',
    }
  )
);

export default useAuthStore;
