import { create } from 'zustand';
import { Collections } from '../lib/firestore';
import { AppNotification } from '../types';

interface NotificationState {
  // ─── 상태 ───────────────────────────────────────────────────────────
  notifications: AppNotification[]; // 본인 알림 목록 (최신순)
  unreadCount: number;               // 읽지 않은 알림 수 (파생값)
  isLoading: boolean;

  // ─── 액션 ───────────────────────────────────────────────────────────
  setNotifications: (notifications: AppNotification[]) => void;
  markAsRead: (id: string) => void;      // 단건 읽음 처리
  clearNotifications: () => void;        // 언마운트/로그아웃 시 초기화
}

export const useNotificationStore = create<NotificationState>((set) => ({
  // 초기값
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  // 알림 목록 업데이트 — unreadCount도 함께 재계산
  setNotifications: (notifications) =>
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.is_read).length,
    }),

  // 단건 읽음 처리 — Firestore 업데이트 + 로컬 상태 반영
  markAsRead: (id) => {
    // Firestore 업데이트 (비동기, 실패 시 무시)
    Collections.notification(id).update({ is_read: true }).catch((e) => {
      console.warn('[NotificationStore] markAsRead 실패:', e);
    });

    // 로컬 상태 즉시 반영 (낙관적 업데이트)
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  // 전체 초기화
  clearNotifications: () => set({
    notifications: [],
    unreadCount: 0,
    isLoading: false,
  }),
}));
