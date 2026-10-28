import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'cashier';
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  login: (emailInput: string, passwordInput: string, rememberDevice?: boolean) => { success: boolean; message?: string };
  logout: () => void;
}

/**
 * Detects if the current client is running in a mobile app, installed PWA,
 * mobile browser (Android/iOS), or touch device.
 */
export const isMobileAppVersion = (): boolean => {
  if (typeof window === 'undefined') return false;

  // 1. Standalone PWA / installed mobile home screen app mode
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true ||
    (typeof document !== 'undefined' && document.referrer.includes('android-app://'));
  if (isStandalone) return true;

  // 2. Mobile / Tablet User Agent detection
  const ua = (navigator.userAgent || navigator.vendor || (window as any).opera || '').toLowerCase();
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i.test(ua);
  if (isMobileUA) return true;

  // 3. Touch device with responsive mobile/tablet viewport width (<= 1024px)
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouch && window.innerWidth <= 1024) return true;

  return false;
};

/**
 * Intelligent Auth Storage:
 * - On Mobile App / Mobile Devices: ALWAYS persists in localStorage so the user only logs in ONCE.
 * - On Desktop: Persists in localStorage if 'webrajya_remember_device' is set, or sessionStorage for temporary counter usage.
 */
const authStorageAdapter: StateStorage = {
  getItem: (name: string): string | null => {
    if (typeof window === 'undefined') return null;

    // Check localStorage first (active for mobile app, PWA, or remembered desktop)
    const localVal = localStorage.getItem(name);
    if (localVal) return localVal;

    // Fallback to sessionStorage for session-only desktop logins
    return sessionStorage.getItem(name);
  },
  setItem: (name: string, value: string): void => {
    if (typeof window === 'undefined') return;

    if (isMobileAppVersion()) {
      // Mobile app version: 1-time login saved permanently in localStorage
      localStorage.setItem(name, value);
      sessionStorage.removeItem(name);
    } else {
      const remember = localStorage.getItem('webrajya_remember_device') === 'true';
      if (remember) {
        localStorage.setItem(name, value);
      } else {
        sessionStorage.setItem(name, value);
      }
    }
  },
  removeItem: (name: string): void => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(name);
      sessionStorage.removeItem(name);
      localStorage.removeItem('webrajya_remember_device');
    } catch (_) {}
  }
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,

      login: (emailInput: string, passwordInput: string, rememberDevice: boolean = true) => {
        const email = emailInput.trim().toLowerCase();
        const password = passwordInput.trim();

        if (typeof window !== 'undefined') {
          try {
            if (rememberDevice || isMobileAppVersion()) {
              localStorage.setItem('webrajya_remember_device', 'true');
            } else {
              localStorage.removeItem('webrajya_remember_device');
            }
          } catch (_) {}
        }

        // Default Credentials check
        if (email === 'admin@gmail.com' && password === 'admin123') {
          const user: User = {
            id: 'usr_admin_1',
            email: 'admin@gmail.com',
            name: 'WebRajya Administrator',
            role: 'admin'
          };
          set({ isAuthenticated: true, user });
          return { success: true };
        }

        return {
          success: false,
          message: 'Invalid email or password. Use default ID: admin@gmail.com / Pass: admin123'
        };
      },

      logout: () => {
        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem('webrajya_auth_session');
            sessionStorage.removeItem('webrajya_auth_session');
            localStorage.removeItem('webrajya_remember_device');
          } catch (_) {}
        }
        set({ isAuthenticated: false, user: null });
      }
    }),
    {
      name: 'webrajya_auth_session',
      storage: createJSONStorage(() => authStorageAdapter)
    }
  )
);
