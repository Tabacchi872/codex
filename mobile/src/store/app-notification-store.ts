import { create } from 'zustand';

import {
  countMyUnreadNotifications,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/app-notification-service';
import type { AppNotification } from '@/types/app-notification';

// Non persistito: sempre letto fresco da Supabase all'apertura della
// schermata/al login (stesso principio di ogni altro store "server-owned"
// del progetto — l'app mostra solo il risultato autorevole del server,
// mai una cache locale che potrebbe disallinearsi tra due account sullo
// stesso device).
type AppNotificationState = {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  reset: () => void;
};

export const useAppNotificationStore = create<AppNotificationState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    const result = await listMyNotifications();
    if (!result.ok) {
      set({ loading: false, error: result.message });
      return;
    }
    set({
      loading: false,
      notifications: result.data,
      unreadCount: result.data.filter((n) => !n.readAt).length,
    });
  },

  refreshUnreadCount: async () => {
    const result = await countMyUnreadNotifications();
    if (result.ok) set({ unreadCount: result.data });
  },

  markRead: async (id) => {
    const previous = get().notifications;
    const target = previous.find((n) => n.id === id);
    if (!target || target.readAt) return;

    // Aggiornamento ottimistico, corretto se la RPC fallisce.
    set({
      notifications: previous.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      unreadCount: Math.max(0, get().unreadCount - 1),
    });

    const result = await markNotificationRead(id);
    if (!result.ok) {
      set({ notifications: previous, unreadCount: previous.filter((n) => !n.readAt).length });
    }
  },

  markAllRead: async () => {
    const previous = get().notifications;
    set({
      notifications: previous.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
      unreadCount: 0,
    });

    const result = await markAllNotificationsRead();
    if (!result.ok) {
      set({ notifications: previous, unreadCount: previous.filter((n) => !n.readAt).length });
    }
  },

  reset: () => set({ notifications: [], unreadCount: 0, loading: false, error: null }),
}));
