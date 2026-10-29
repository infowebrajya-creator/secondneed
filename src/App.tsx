import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { 
  ShoppingBag, Package, Boxes, Users, Receipt, Settings, Store, 
  Headphones, LogOut, FileSpreadsheet, Download, Smartphone, Monitor,
  ShieldCheck, X, Calculator, LayoutGrid, ChevronDown, Maximize2, Minimize2
} from 'lucide-react';
import { BillingSection } from './components/billing/BillingSection';
import { ToastContainer, ToastMessage } from './components/common/Toast';
import { usePwaInstall } from './utils/usePwaInstall';
import { useAuthStore } from './store/useAuthStore';
import { useKeyboardShortcuts } from './utils/keyboard';
import { useProductStore } from './store/useProductStore';
import { useCustomerStore } from './store/useCustomerStore';
import { useSalesStore } from './store/useSalesStore';
import { useBillingStore } from './store/useBillingStore';
import { useSettingsStore } from './store/useSettingsStore';

import { LoginPage } from './components/auth/LoginPage';

// Code-split heavy views to guarantee instant 0ms first-contentful-paint
const ProductsSection = lazy(() => import('./components/products/ProductsSection').then(m => ({ default: m.ProductsSection })));
const InventorySection = lazy(() => import('./components/inventory/InventorySection').then(m => ({ default: m.InventorySection })));
const CustomersSection = lazy(() => import('./components/customers/CustomersSection').then(m => ({ default: m.CustomersSection })));
const SalesSection = lazy(() => import('./components/sales/SalesSection').then(m => ({ default: m.SalesSection })));
const SettingsSection = lazy(() => import('./components/settings/SettingsSection').then(m => ({ default: m.SettingsSection })));
const SupportModal = lazy(() => import('./components/common/SupportModal').then(m => ({ default: m.SupportModal })));
const ShareReportsModal = lazy(() => import('./components/caReports/ShareReportsModal').then(m => ({ default: m.ShareReportsModal })));
const PwaInstallModal = lazy(() => import('./components/common/PwaInstallModal').then(m => ({ default: m.PwaInstallModal })));
const DailyCashRegisterModal = lazy(() => import('./components/cashRegister/DailyCashRegisterModal').then(m => ({ default: m.DailyCashRegisterModal })));

export type MainSection = 'billing' | 'products' | 'inventory' | 'customers' | 'sales' | 'settings';

const VALID_SECTIONS: MainSection[] = ['billing', 'products', 'inventory', 'customers', 'sales', 'settings'];

function getInitialSection(): MainSection {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.replace('#', '') as MainSection;
    if (VALID_SECTIONS.includes(hash)) {
      return hash;
    }
    const saved = localStorage.getItem('webrajya_active_section') as MainSection;
    if (saved && VALID_SECTIONS.includes(saved)) {
      return saved;
    }
  }
  return 'billing';
}

export function App() {
  const { isAuthenticated, logout, user } = useAuthStore();
  const loadProducts = useProductStore((state) => state.loadProducts);
  const loadCustomers = useCustomerStore((state) => state.loadCustomers);
  const loadInvoices = useSalesStore((state) => state.loadInvoices);
  const cartItemsCount = useBillingStore((state) => state.items.length);

  // Restore current tab on page refresh
  const [activeSection, setActiveSection] = useState<MainSection>(getInitialSection);

  useEffect(() => {
    localStorage.setItem('webrajya_active_section', activeSection);
    window.location.hash = activeSection;
  }, [activeSection]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as MainSection;
      if (['billing', 'products', 'sales', 'settings'].includes(hash)) {
        setActiveSection(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const { shopProfile, loadSettings } = useSettingsStore();
  const [isCashRegisterOpen, setIsCashRegisterOpen] = useState(false);

  // Fullscreen state with bi-directional event synchronization
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isDocFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isDocFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!isFullscreen) {
        const docEl = document.documentElement as any;
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        } else if (docEl.msRequestFullscreen) {
          await docEl.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen toggle failed or blocked by browser permissions:', err);
    }
  };

  const isSyncingRef = useRef(false);

  useEffect(() => {
    // Initial data load on mount
    loadProducts();
    loadCustomers();
    loadInvoices();
    loadSettings();

    // Silent 2-second background synchronization loop with Mutex
    const runSilentSync = async () => {
      if (isSyncingRef.current || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) {
        return;
      }
      isSyncingRef.current = true;
      try {
        await Promise.allSettled([
          loadCustomers(true),
          loadInvoices(true),
          loadSettings()
        ]);
      } catch (_) {
        // Silent background suppression
      } finally {
        isSyncingRef.current = false;
      }
    };

    // 2-second live background refresh interval
    const heartbeatInterval = setInterval(runSilentSync, 2000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runSilentSync();
      }
    };

    window.addEventListener('online', runSilentSync);
    window.addEventListener('focus', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('online', runSilentSync);
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadProducts, loadCustomers, loadInvoices, loadSettings]);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isAddProductOpenFromApp, setIsAddProductOpenFromApp] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isShareReportsOpen, setIsShareReportsOpen] = useState(false);

  const { 
    hasNativePrompt, isInstalled, isStandalone, isIos, promptInstall 
  } = usePwaInstall();
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [installModalTab, setInstallModalTab] = useState<'windows' | 'pwa'>('windows');
  const isInsideElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target as Node)) {
        setIsToolsMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsToolsMenuOpen(false);
      }
    };
    if (isToolsMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isToolsMenuOpen]);

  const [showBackupAlert, setShowBackupAlert] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (sessionStorage.getItem('webrajya_backup_banner_dismissed') === 'true') return false;
    const lastBackup = localStorage.getItem('webrajya_last_backup_date');
    if (!lastBackup) return true;
    const lastTime = new Date(lastBackup).getTime();
    const diffDays = (Date.now() - lastTime) / (1000 * 60 * 60 * 24);
    return diffDays >= 7;
  });

  const addToast = (type: 'success' | 'error' | 'info', title: string, description?: string) => {
    const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, type, title, description }]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Global Keyboard Navigation Shortcuts
  useKeyboardShortcuts({
    onF2_NewBill: () => {
      setActiveSection('billing');
    },
    onF4_SearchProduct: () => {
      setActiveSection('billing');
    },
    onF8_QuickPay: () => {
      if (activeSection !== 'billing') setActiveSection('billing');
    },
    onF9_SaveAndPrint: () => {
      if (activeSection !== 'billing') setActiveSection('billing');
    },
    onF10_HoldDraft: () => {
      if (activeSection !== 'billing') setActiveSection('billing');
    }
  });

  const navItems: { id: MainSection; label: string; icon: React.ReactNode; shortcut: string }[] = [
    { id: 'billing', label: 'Invoicing', icon: <ShoppingBag className="w-4 h-4 text-white" />, shortcut: 'F2' },
    { id: 'products', label: 'Products', icon: <Package className="w-4 h-4 text-white" />, shortcut: '' },
    { id: 'inventory', label: 'Stock', icon: <Boxes className="w-4 h-4 text-white" />, shortcut: '' },
    { id: 'customers', label: 'Khata', icon: <Users className="w-4 h-4 text-white" />, shortcut: '' },
    { id: 'sales', label: 'Sales History', icon: <Receipt className="w-4 h-4 text-white" />, shortcut: '' },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4 text-white" />, shortcut: '' },
  ];

  // Render Login Page if user is not authenticated
  if (!isAuthenticated) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#F7F4EC] flex items-center justify-center font-bold text-[#0F172A]">Loading WebRajya...</div>}>
        <LoginPage onOpenSupport={() => setIsSupportOpen(true)} />
        {isSupportOpen && <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />}
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F9FF] text-[#172B4D] flex flex-col font-sans antialiased">
      {/* SECTION 3: Compact Horizontal Top Navigation Bar (#123B70) */}
      <header className="no-print bg-[#123B70] text-white shrink-0 border-b border-[#0D2D56] shadow-sm sticky top-0 z-40 px-3 sm:px-4 py-2 flex items-center justify-between safe-area-pt">
        {/* Brand Identity */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white p-0.5 shadow-sm shrink-0 flex items-center justify-center overflow-hidden border border-white/20">
            <img src="/logo.png" alt="WebRajya Invoice" className="w-full h-full object-contain" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xs sm:text-sm font-black text-white tracking-wide uppercase leading-none">
              WEBRAJYA <span className="text-[#FF8A00]">INVOICE</span>
            </h1>
            <span className="hidden sm:inline-block text-[11px] text-blue-200/80 font-medium border-l border-white/20 pl-2 leading-none">
              GST & Retail Invoicing
            </span>
            <span 
              className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shrink-0"
              title="Continuous Live Synchronization Heartbeat (Refreshes automatically every 2 seconds)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Live Sync 2s</span>
            </span>
          </div>
        </div>

        {/* Horizontal Navigation Tabs (Desktop only) */}
        <nav className="hidden md:flex items-center gap-1.5">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#2563EB] text-white shadow-xs font-bold'
                    : 'text-white/85 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                {item.id === 'billing' && cartItemsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-[#EF4444] text-white text-[10px] font-mono font-black">
                    {cartItemsCount}
                  </span>
                )}
                {item.shortcut && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/20 text-white font-mono font-bold">
                    {item.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Info: Unified Tools Dropdown & Logout */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Single Unified Menu for App Download, CA Reports, Register & Support */}
          <div className="relative" ref={toolsMenuRef}>
            <button
              type="button"
              onClick={() => setIsToolsMenuOpen((prev) => !prev)}
              className={`text-xs font-bold px-2 sm:px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer active:scale-95 ${
                isToolsMenuOpen
                  ? 'bg-[#1D4ED8] text-white border-blue-300 ring-2 ring-white/20 shadow-md'
                  : 'bg-white/10 hover:bg-white/20 text-white/95 hover:text-white border-white/15 shadow-xs'
              }`}
              title="Tools (Install App, CA Reports, Cash Register, Support)"
              aria-expanded={isToolsMenuOpen}
              aria-haspopup="true"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
              <span className="tracking-wide">Tools</span>
              <ChevronDown
                className={`w-3 h-3 text-white/70 shrink-0 transition-transform duration-200 ${
                  isToolsMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Dropdown Menu Popup */}
            {isToolsMenuOpen && (
              <div 
                className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white rounded-xl shadow-2xl border border-slate-200 p-1.5 text-slate-800 z-50 animate-in fade-in zoom-in-95 duration-150"
                role="menu"
              >
                <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                    Quick Tools & Services
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    4 Tools
                  </span>
                </div>

                <div className="py-1 space-y-1">
                  {/* 1. App Download / Install */}
                  {!isInsideElectron ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setInstallModalTab(typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent) ? 'windows' : 'pwa');
                        setIsInstallModalOpen(true);
                        setIsToolsMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 p-2 rounded-lg text-left hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition-all group cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        <Download className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-xs text-slate-800 group-hover:text-emerald-950">
                            {isInstalled || isStandalone ? 'App Ready' : 'Download / Install App'}
                          </span>
                          <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            {isInstalled || isStandalone ? 'Ready' : 'PC & Mobile'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          Windows desktop .exe & Mobile PWA
                        </p>
                      </div>
                    </button>
                  ) : (
                    <div className="w-full flex items-center gap-3 p-2 rounded-lg text-left bg-emerald-50/70 border border-emerald-200/80">
                      <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <Monitor className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-emerald-950">Windows App Active</span>
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                            v1.0
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-700 truncate mt-0.5">Desktop Edition Installed</p>
                      </div>
                    </div>
                  )}

                  {/* 2. CA Reports */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsShareReportsOpen(true);
                      setIsToolsMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg text-left hover:bg-green-50 border border-transparent hover:border-green-200 transition-all group cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-lg bg-green-100 text-green-700 border border-green-200 flex items-center justify-center shrink-0 group-hover:bg-green-700 group-hover:text-white transition-colors">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-xs text-slate-800 group-hover:text-green-950">
                          CA Reports
                        </span>
                        <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-green-100 text-green-800">
                          Excel / PDF
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        Share monthly sales & tax data with CA
                      </p>
                    </div>
                  </button>

                  {/* 3. Daily Cash Register */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsCashRegisterOpen(true);
                      setIsToolsMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg text-left hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-all group cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                      <Calculator className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-xs text-slate-800 group-hover:text-amber-950">
                          Cash Register
                        </span>
                        <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                          Daily Cash
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        Daily cash drawer & day-end balance
                      </p>
                    </div>
                  </button>

                  {/* 4. Support */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsSupportOpen(true);
                      setIsToolsMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg text-left hover:bg-red-50 border border-transparent hover:border-red-200 transition-all group cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-lg bg-red-100 text-red-600 border border-red-200 flex items-center justify-center shrink-0 group-hover:bg-red-600 group-hover:text-white transition-colors">
                      <Headphones className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-xs text-slate-800 group-hover:text-red-950">
                          Support
                        </span>
                        <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                          Helpline
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        Call / WhatsApp: 9630013483
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Fullscreen Kiosk Mode Toggle (Laptop / Desktop Viewports Only) */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className={`hidden md:inline-flex items-center gap-1.5 font-bold text-xs px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer active:scale-95 ${
              isFullscreen
                ? 'bg-[#1D4ED8] text-cyan-200 border-cyan-300 ring-2 ring-white/20 shadow-md'
                : 'bg-white/10 hover:bg-white/20 text-white/90 hover:text-white border-white/15 shadow-xs'
            }`}
            title={isFullscreen ? 'Exit Full Screen (Esc / F11)' : 'Enter Full Screen (F11 Kiosk Mode)'}
            aria-label={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
            )}
            <span className="tracking-wide">{isFullscreen ? 'Exit Full' : 'Full Screen'}</span>
          </button>

          <button
            onClick={() => logout()}
            className="bg-white/10 hover:bg-white/20 text-white/90 hover:text-white font-bold text-xs px-2 sm:px-2.5 py-1.5 rounded-lg border border-white/15 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            title="Logout of WebRajya Invoice"
          >
            <LogOut className="w-3.5 h-3.5 text-red-300" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* 7-Day Safety Net Automated Backup Reminder */}
      {showBackupAlert && (
        <div className="no-print bg-gradient-to-r from-amber-600 to-amber-700 text-white px-3 sm:px-4 py-2 text-xs flex items-center justify-between shadow-sm shrink-0 border-b border-amber-800">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <ShieldCheck className="w-4 h-4 text-amber-200 shrink-0" />
            <span className="truncate">
              <strong>Database Safety Reminder:</strong> No offline backup taken in the last 7 days. Download your JSON backup to protect sales and stock records.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setActiveSection('settings');
                setShowBackupAlert(false);
              }}
              className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-900 rounded-md font-black text-[11px] shadow-2xs transition-colors cursor-pointer"
            >
              Backup Now
            </button>
            <button
              onClick={() => {
                sessionStorage.setItem('webrajya_backup_banner_dismissed', 'true');
                setShowBackupAlert(false);
              }}
              className="p-1 hover:bg-white/20 rounded transition-colors text-white/90 cursor-pointer"
              title="Dismiss for this session"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace Area (#F5F9FF background) */}
      <main className="no-print flex-1 p-2 pb-28 md:p-3 md:pb-4 w-full mx-auto overflow-x-hidden">
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[350px] text-xs font-bold text-[#64748B]">
            <div className="w-5 h-5 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin mr-2" />
            Loading workspace...
          </div>
        }>
          {activeSection === 'billing' && (
            <BillingSection 
              onToast={addToast} 
              onOpenAddProductModal={() => {
                setActiveSection('products');
                setIsAddProductOpenFromApp(true);
              }} 
            />
          )}
          {activeSection === 'products' && (
            <ProductsSection 
              onToast={addToast} 
              isAddModalOpenFromExternal={isAddProductOpenFromApp}
              onCloseExternalModal={() => setIsAddProductOpenFromApp(false)}
            />
          )}
          {activeSection === 'inventory' && <InventorySection onToast={addToast} />}
          {activeSection === 'customers' && <CustomersSection onToast={addToast} />}
          {activeSection === 'sales' && <SalesSection onToast={addToast} onNavigateToBilling={() => setActiveSection('billing')} />}
          {activeSection === 'settings' && <SettingsSection onToast={addToast} />}
        </Suspense>
      </main>

      {/* Mobile Fixed Bottom Navigation Bar with Safe Area Support */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#123B70] text-white border-t border-[#0D2D56] flex items-center justify-around py-1.5 px-2 shadow-2xl safe-area-pb">
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`relative flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex-1 active:scale-95 ${
                isActive
                  ? 'bg-[#2563EB] text-white shadow-xs font-black'
                  : 'text-blue-200/75 hover:text-white'
              }`}
            >
              <div className="relative w-5 h-5 flex items-center justify-center">
                {item.icon}
                {item.id === 'billing' && cartItemsCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#EF4444] text-white text-[9px] font-mono font-black flex items-center justify-center border border-[#123B70]">
                    {cartItemsCount}
                  </span>
                )}
              </div>
              <span className="mt-0.5 leading-none">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Modals rendered on-demand inside Suspense */}
      <Suspense fallback={null}>
        {/* Support Contact Modal */}
        {isSupportOpen && <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />}

        {/* Share Reports with CA Modal */}
        {isShareReportsOpen && (
          <ShareReportsModal
            isOpen={isShareReportsOpen}
            onClose={() => setIsShareReportsOpen(false)}
            onToast={addToast}
          />
        )}

        {/* PWA / Windows Install Modal (Laptop, Tablet & Mobile) */}
        {isInstallModalOpen && (
          <PwaInstallModal
            isOpen={isInstallModalOpen}
            onClose={() => setIsInstallModalOpen(false)}
            onInstall={promptInstall}
            hasNativePrompt={hasNativePrompt}
            isInstalled={isInstalled}
            isIos={isIos}
            initialTab={installModalTab}
          />
        )}

        {/* Daily Cash Register & Day-End Cash Closure Modal */}
        {isCashRegisterOpen && (
          <DailyCashRegisterModal
            isOpen={isCashRegisterOpen}
            onClose={() => setIsCashRegisterOpen(false)}
            shopProfile={shopProfile}
            onToast={addToast}
          />
        )}
      </Suspense>

      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
