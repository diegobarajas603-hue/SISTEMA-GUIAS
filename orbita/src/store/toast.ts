import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

interface ToastState {
  message: string | null;
  tone: ToastTone;
  key: number;
  show: (message: string, tone?: ToastTone) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'info',
  key: 0,
  show: (message, tone = 'info') => set((s) => ({ message, tone, key: s.key + 1 })),
  hide: () => set({ message: null }),
}));

export const toast = (message: string, tone?: ToastTone) => useToast.getState().show(message, tone);
