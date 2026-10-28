import React, { useState, useEffect } from 'react';
import { 
  Store, Save, RefreshCw, Download, Upload, ShieldCheck, Trash2,
  Printer, Receipt, FileText, CheckCircle2, Usb, Scissors, Zap, DollarSign, Info, Monitor,
  Volume2, VolumeX, Bluetooth
} from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useProductStore } from '../../store/useProductStore';
import { useSalesStore } from '../../store/useSalesStore';
import { ShopProfileSchema } from '../../utils/validation';
import { PaperSize, PrintEngine } from '../../types';
import { PwaInstallModal } from '../common/PwaInstallModal';
import { WINDOWS_EXE_URL } from '../../utils/constants';
import { usePwaInstall } from '../../utils/usePwaInstall';
import { isSoundEnabled, setSoundEnabled, playBeep, playCashChime, playError } from '../../utils/audio';
import { 
  pairUsbPrinter, testUsbPrinter, testUsbCut, testUsbCashDrawer, 
  getUsbPrinterStatus, isWebUsbSupported 
} from '../../lib/usbPrinter';
import {
  isBluetoothSupported,
  isBluetoothPrinterConnected,
  getConnectedBluetoothName,
  connectBluetoothPrinter,
  disconnectBluetoothPrinter,
  printTestBluetooth
} from '../../lib/bluetoothPrinter';

interface SettingsSectionProps {
  onToast: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({ onToast }) => {
  const { 
    shopProfile, printSettings, supabaseConfig, isLoading, isTestingConnection,
    loadSettings, saveShopProfile, savePrintSettings, saveSupabaseConfig, testConnection, exportBackupJSON, importBackupJSON, clearAllDemoData
  } = useSettingsStore();

  const { loadProducts } = useProductStore();
  const { loadInvoices } = useSalesStore();

  const { syncWithSupabase: syncProducts } = useProductStore();
  const { syncInvoicesWithSupabase: syncInvoices } = useSalesStore();

  const [activeTab, setActiveTab] = useState<'shop' | 'print' | 'backup' | 'sound'>('shop');
  const [soundOn, setSoundOn] = useState<boolean>(() => isSoundEnabled());
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(() => 
    typeof window !== 'undefined' ? localStorage.getItem('webrajya_last_backup_date') : null
  );
  
  // Local form states
  const [profileForm, setProfileForm] = useState(shopProfile);
  const [printForm, setPrintForm] = useState(printSettings);
  const [supaForm, setSupaForm] = useState(supabaseConfig);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const { hasNativePrompt, isInstalled, isStandalone, isIos, promptInstall } = usePwaInstall();
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [installModalTab, setInstallModalTab] = useState<'windows' | 'pwa'>('windows');

  // Electron Native Windows App state
  const isInsideElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
  const [nativePrinters, setNativePrinters] = useState<Array<{ name: string; displayName: string; isDefault: boolean }>>([]);
  const [selectedNativePrinter, setSelectedNativePrinter] = useState<string>(
    () => (typeof window !== 'undefined' ? localStorage.getItem('webrajya_electron_printer') || '' : '')
  );
  const [isTestingNativePrint, setIsTestingNativePrint] = useState(false);

  // USB Thermal Hardware Pairing State
  const [usbStatus, setUsbStatus] = useState(getUsbPrinterStatus());
  const [isPairingUsb, setIsPairingUsb] = useState(false);
  const [isTestingUsb, setIsTestingUsb] = useState(false);

  // Wireless Bluetooth Hardware Pairing State (Mobile / Handheld)
  const [bluetoothConnected, setBluetoothConnected] = useState(isBluetoothPrinterConnected());
  const [bluetoothDeviceName, setBluetoothDeviceName] = useState(getConnectedBluetoothName());
  const [isPairingBluetooth, setIsPairingBluetooth] = useState(false);
  const [isTestingBluetooth, setIsTestingBluetooth] = useState(false);

  useEffect(() => {
    loadSettings();
    setUsbStatus(getUsbPrinterStatus());
    setBluetoothConnected(isBluetoothPrinterConnected());
    setBluetoothDeviceName(getConnectedBluetoothName());

    const handleBtStatus = (e: any) => {
      setBluetoothConnected(!!e.detail?.connected);
      setBluetoothDeviceName(e.detail?.deviceName || null);
    };
    window.addEventListener('webrajya_bluetooth_status', handleBtStatus);

    if (isInsideElectron && window.electronAPI) {
      window.electronAPI.getPrinters().then((printers) => {
        setNativePrinters(printers);
      }).catch(err => console.warn('Could not fetch native printers:', err));
    }

    return () => {
      window.removeEventListener('webrajya_bluetooth_status', handleBtStatus);
    };
  }, [isInsideElectron]);

  const handleSelectNativePrinter = (printerName: string) => {
    setSelectedNativePrinter(printerName);
    if (typeof window !== 'undefined') {
      localStorage.setItem('webrajya_electron_printer', printerName);
    }
    onToast('success', 'Windows Printer Set', printerName ? `Assigned to: ${printerName}` : 'Using Windows Default Printer');
  };

  const handleTestNativePrint = async () => {
    if (!window.electronAPI) return;
    setIsTestingNativePrint(true);
    try {
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: monospace; font-size: 11px; margin: 0; padding: 12px; }
            .c { text-align: center; }
            .b { font-weight: bold; }
            .line { border-bottom: 1px dashed #000; margin: 8px 0; }
          </style>
        </head>
        <body>
          <div class="c b">*** WEBRAJYA INVOICE ***</div>
          <div class="c">${shopProfile.shopName || 'Retail Store'}</div>
          <div class="line"></div>
          <div>TEST PRINT: Native Windows Silent Spooler</div>
          <div>TARGET PRINTER: ${selectedNativePrinter || 'System Default'}</div>
          <div>STATUS: 100% Zero-Click Silent Mode</div>
          <div>TIME: ${new Date().toLocaleTimeString()}</div>
          <div class="line"></div>
          <div class="c b">*** PRINTER READY FOR BILLING ***</div>
        </body>
        </html>
      `;
      const res = await window.electronAPI.printSilent({
        html: testHtml,
        is80mm: true,
        deviceName: selectedNativePrinter || undefined,
        printerName: selectedNativePrinter || undefined
      });
      if (res.success) {
        onToast('success', 'Silent Test Printed!', `Sent to ${selectedNativePrinter || 'Default Printer'}`);
      } else {
        onToast('error', 'Silent Print Failed', res.error || 'Unknown error');
      }
    } catch (e: any) {
      onToast('error', 'Print Error', e.message);
    } finally {
      setIsTestingNativePrint(false);
    }
  };

  const handlePairUsb = async () => {
    setIsPairingUsb(true);
    const res = await pairUsbPrinter();
    setIsPairingUsb(false);
    setUsbStatus(getUsbPrinterStatus());
    if (res.success) {
      onToast('success', 'USB Printer Paired!', `Connected to ${res.deviceName || 'Thermal Printer'}`);
    } else {
      onToast('error', 'Pairing Failed', res.error);
    }
  };

  const handleTestUsbPrint = async () => {
    setIsTestingUsb(true);
    const res = await testUsbPrinter(shopProfile.shopName);
    setIsTestingUsb(false);
    if (res.success) {
      onToast('success', 'Test Receipt Printed!', 'Hardware communication verified.');
    } else {
      onToast('error', 'Print Failed', res.error);
    }
  };

  const handleTestCut = async () => {
    const res = await testUsbCut();
    if (res.success) {
      onToast('success', 'Auto-Cut Triggered', 'Cutter command sent to printer.');
    } else {
      onToast('error', 'Cut Failed', res.error);
    }
  };

  const handleTestCashDrawer = async () => {
    const res = await testUsbCashDrawer();
    if (res.success) {
      onToast('success', 'Cash Drawer Pulse Sent', 'Pulse command sent to drawer pin.');
    } else {
      onToast('error', 'Drawer Pulse Failed', res.error);
    }
  };

  const handlePairBluetooth = async () => {
    if (!isBluetoothSupported()) {
      onToast('error', 'Bluetooth Unavailable', 'Web Bluetooth requires Chrome on Android or a supported browser over HTTPS.');
      return;
    }
    setIsPairingBluetooth(true);
    const res = await connectBluetoothPrinter();
    setIsPairingBluetooth(false);
    setBluetoothConnected(isBluetoothPrinterConnected());
    setBluetoothDeviceName(getConnectedBluetoothName());
    if (res.success) {
      onToast('success', 'Bluetooth Printer Paired!', `Connected to ${res.deviceName || 'Wireless Printer'}`);
    } else {
      onToast('error', 'Bluetooth Pairing Failed', res.error);
    }
  };

  const handleDisconnectBluetooth = async () => {
    await disconnectBluetoothPrinter();
    setBluetoothConnected(false);
    setBluetoothDeviceName(null);
    onToast('info', 'Bluetooth Disconnected', 'Printer connection released.');
  };

  const handleTestBluetoothPrint = async () => {
    setIsTestingBluetooth(true);
    const res = await printTestBluetooth(shopProfile.shopName || 'WEBRAJYA POS');
    setIsTestingBluetooth(false);
    if (res.success) {
      onToast('success', 'Bluetooth Test Printed!', 'Wirelessly transmitted ESC/POS receipt.');
    } else {
      onToast('error', 'Bluetooth Print Failed', res.error);
    }
  };

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isDirty) {
      setProfileForm(shopProfile);
    }
    setPrintForm(printSettings);
    setSupaForm(supabaseConfig);
  }, [shopProfile, printSettings, supabaseConfig, isDirty]);

  const handleProfileChange = (field: keyof typeof profileForm, value: string) => {
    const next = { ...profileForm, [field]: value };
    setProfileForm(next);
    setIsDirty(true);
    setSaveStatus('saving');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      await saveShopProfile(next);
      setIsDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    }, 350);
  };

  const handleProfileBlur = async () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveStatus('saving');
    await saveShopProfile(profileForm);
    setIsDirty(false);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2500);
  };

  const handleSaveShopProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const result = ShopProfileSchema.safeParse(profileForm);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        if (err.path[0]) errors[err.path[0].toString()] = err.message;
      });
      setProfileErrors(errors);
      onToast('error', 'Validation Notice', 'Some fields may not match standard format');
    } else {
      setProfileErrors({});
    }
    setSaveStatus('saving');
    await saveShopProfile(profileForm);
    setIsDirty(false);
    setSaveStatus('saved');
    onToast('success', 'Shop Profile Saved', 'Updated invoice header and shop details');
    setTimeout(() => setSaveStatus('idle'), 2500);
  };

  const handleSavePrintSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await savePrintSettings(printForm);
    const sizeName = printForm.paperSize === '80mm' || printForm.paperSize === 'Thermal'
      ? '80mm Receipt Roll'
      : printForm.paperSize === 'A4'
      ? 'A4 Full Page'
      : 'A5 Standard';
    const engineName = printForm.printEngine === 'usb' ? 'Direct USB' : printForm.printEngine === 'bluetooth' ? 'Wireless Bluetooth' : printForm.printEngine === 'browser' ? 'Browser Kiosk' : 'Auto Dual-Mode';
    onToast('success', 'Print Settings Saved', `Paper: ${sizeName} | Mode: ${engineName}`);
  };

  const handleSelectPaperSize = async (size: PaperSize) => {
    const updated = { ...printForm, paperSize: size };
    setPrintForm(updated);
    await savePrintSettings(updated);
    const sizeName = size === '80mm' ? '80mm Receipt Roll' : size === 'A4' ? 'A4 Full Sheet' : 'A5 Half-Sheet';
    onToast('success', 'Paper Format Updated', `Default set to: ${sizeName}`);
  };

  const handleSelectPrintEngine = async (engine: PrintEngine) => {
    const updated = { ...printForm, printEngine: engine };
    setPrintForm(updated);
    await savePrintSettings(updated);
    const engineName = engine === 'usb' ? 'Direct USB Cable' : engine === 'bluetooth' ? 'Wireless Bluetooth' : engine === 'browser' ? 'Browser Kiosk' : 'Auto Dual-Mode';
    onToast('success', 'Print Engine Updated', `Mode set to: ${engineName}`);
  };

  const handleSaveSupabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSupabaseConfig(supaForm);
    onToast('success', 'Supabase Config Saved', 'Supabase endpoint updated');
  };

  const handleTestConnection = async () => {
    const res = await testConnection(supaForm.url, supaForm.anonKey);
    if (res.success) {
      onToast('success', 'Connection Successful', res.message);
    } else {
      onToast('error', 'Connection Failed', res.message);
    }
  };

  const handleSyncToCloud = async () => {
    onToast('info', 'Sync Started', 'Pushing local products and invoices to Supabase...');
    const prodRes = await syncProducts();
    const invRes = await syncInvoices();
    
    if (prodRes.success && invRes.success) {
      onToast('success', 'Sync Complete!', `${prodRes.message} | ${invRes.message}`);
    } else {
      onToast('error', 'Sync Partial Error', `${prodRes.message || ''} ${invRes.message || ''}`);
    }
  };

  const handleDownloadBackup = async () => {
    const jsonStr = await exportBackupJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WebRajya_Backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const nowIso = new Date().toISOString();
    if (typeof window !== 'undefined') {
      localStorage.setItem('webrajya_last_backup_date', nowIso);
      setLastBackupTime(nowIso);
    }
    onToast('success', 'Backup Exported', 'Downloaded full JSON database backup file.');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const res = await importBackupJSON(content);
      if (res.success) {
        onToast('success', 'Database Restored!', res.message);
      } else {
        onToast('error', 'Import Failed', res.message);
      }
    };
    reader.readAsText(file);
  };

  const handleClearDemoData = async () => {
    if (confirm('Are you sure you want to delete all demo data (products, invoices, stock movements, and drafts)? This action cannot be undone.')) {
      await clearAllDemoData();
      await loadProducts();
      await loadInvoices();
      onToast('success', 'Demo Data Deleted', 'All products, sales history, stock movements, and drafts have been cleared.');
    }
  };

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-4.5rem)] gap-3 font-sans text-[#172B4D] pb-24 md:pb-0">
      {/* Top Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-[#D8E1EC] rounded-xl p-3 sm:p-4 shadow-sm shrink-0">
        <div>
          <h2 className="text-base font-extrabold text-[#172B4D] flex items-center gap-2">
            <Store className="w-5 h-5 text-[#2563EB]" /> Settings & Configuration
          </h2>
          <p className="text-xs text-[#64748B] mt-0.5">Manage shop profile, A5 print layout, Supabase credentials, and data backups</p>
        </div>

        {/* Tab Switcher - Horizontally scrollable on mobile */}
        <div className="flex gap-1 bg-[#F5F9FF] p-1 rounded-xl border border-[#D8E1EC] text-xs font-semibold overflow-x-auto touch-scroll no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('shop')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer shrink-0 ${activeTab === 'shop' ? 'bg-[#2563EB] text-white shadow-xs font-bold' : 'text-[#64748B] hover:text-[#172B4D]'}`}
          >
            Shop Profile
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('print')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer shrink-0 ${activeTab === 'print' ? 'bg-[#2563EB] text-white shadow-xs font-bold' : 'text-[#64748B] hover:text-[#172B4D]'}`}
          >
            Print & Paper Settings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer shrink-0 ${activeTab === 'backup' ? 'bg-[#2563EB] text-white shadow-xs font-bold' : 'text-[#64748B] hover:text-[#172B4D]'}`}
          >
            Backup & Restore
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sound')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer shrink-0 ${activeTab === 'sound' ? 'bg-[#2563EB] text-white shadow-xs font-bold' : 'text-[#64748B] hover:text-[#172B4D]'}`}
          >
            Sound & Audio FX
          </button>
        </div>
      </div>

      {/* Main Tab Panels */}
      <div className="flex-1 bg-white border border-[#D8E1EC] rounded-xl overflow-y-auto p-4 sm:p-6 text-xs shadow-sm">
        {/* Windows Desktop or PWA App Installation Banner Card */}
        {isInsideElectron ? (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-[#0F172A] to-[#1E3A8A] text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm border border-blue-900/40">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-white p-1 shrink-0 overflow-hidden shadow-xs">
                <img src="/logo.png" alt="WebRajya Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-600 px-2 py-0.5 rounded text-white flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                    Windows Desktop App Active
                  </span>
                  <span className="text-xs font-black text-white">WebRajya Native Edition</span>
                </div>
                <p className="text-[11px] text-blue-100/80 mt-0.5">
                  Running with native Windows print spooler access & 0-click silent printing.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/brochure.html"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white border border-white/20 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Open Printable A4 Product Brochure"
              >
                <FileText className="w-3.5 h-3.5 text-blue-200" />
                <span>Sales Brochure</span>
              </a>
              <span className="px-3 py-1.5 rounded-lg bg-white/10 text-xs font-bold text-blue-200 border border-white/15">
                Desktop Client v1.0.0
              </span>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-[#123B70] to-[#1E3A8A] text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm border border-blue-900/40">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-white p-1 shrink-0 overflow-hidden shadow-xs">
                <img src="/logo.png" alt="WebRajya Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-[#2563EB] px-2 py-0.5 rounded text-white">
                    Official Apps
                  </span>
                  <span className="text-xs font-black text-white">Get WebRajya for Windows & Mobile</span>
                </div>
                <p className="text-[11px] text-blue-100/80 mt-0.5">
                  Download Windows .exe for 0-click silent printing, or install Chrome PWA on mobile/tablet.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 w-full sm:w-auto">
              <a
                href="/brochure.html"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-white/20 transition-all cursor-pointer"
                title="Open Printable A4 Product Brochure"
              >
                <FileText className="w-4 h-4 text-blue-200" />
                <span>Sales Brochure</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  setInstallModalTab(typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent) ? 'windows' : 'pwa');
                  setIsInstallModalOpen(true);
                }}
                className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-xs transition-colors shrink-0 cursor-pointer active:scale-95"
              >
                <Download className="w-4 h-4 text-emerald-200" />
                <span>{isInstalled || isStandalone ? 'App Ready • Open Info' : 'Download / Install App'}</span>
              </button>
            </div>
          </div>
        )}
        {activeTab === 'shop' && (
          <form onSubmit={handleSaveShopProfile} className="max-w-3xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#D8E1EC] pb-2">
              <h3 className="text-sm font-extrabold text-[#172B4D] uppercase tracking-wider">
                Stationery Shop Details & Invoice Header
              </h3>
              <div className="flex items-center gap-1.5">
                {saveStatus === 'saving' && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] px-2.5 py-0.5 rounded-full animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]"></span>
                    Saving...
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] px-2.5 py-0.5 rounded-full transition-all">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" />
                    Auto-saved
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-bold text-[#172B4D] mb-1">Shop Name *</label>
                <input
                  type="text"
                  value={profileForm.shopName}
                  onChange={(e) => handleProfileChange('shopName', e.target.value)}
                  onBlur={handleProfileBlur}
                  className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-[#172B4D] focus:outline-none focus:border-[#2563EB] font-bold text-sm"
                />
                {profileErrors.shopName && <p className="text-[#B91C1C] text-[11px] font-mono mt-0.5">{profileErrors.shopName}</p>}
              </div>

              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-bold text-[#172B4D] mb-1">Tagline / Subheading</label>
                <input
                  type="text"
                  value={profileForm.tagline}
                  onChange={(e) => handleProfileChange('tagline', e.target.value)}
                  onBlur={handleProfileBlur}
                  className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-[#172B4D] focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-bold text-[#172B4D] mb-1">Address *</label>
                <textarea
                  rows={2}
                  value={profileForm.address}
                  onChange={(e) => handleProfileChange('address', e.target.value)}
                  onBlur={handleProfileBlur}
                  className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-[#172B4D] focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#172B4D] mb-1">Phone Number *</label>
                <input
                  type="text"
                  value={profileForm.phone}
                  onChange={(e) => handleProfileChange('phone', e.target.value)}
                  onBlur={handleProfileBlur}
                  className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-[#172B4D] focus:outline-none focus:border-[#2563EB] font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#172B4D] mb-1">GSTIN (15 Digits) *</label>
                <input
                  type="text"
                  value={profileForm.gstin}
                  onChange={(e) => handleProfileChange('gstin', e.target.value.toUpperCase())}
                  onBlur={handleProfileBlur}
                  className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-[#172B4D] focus:outline-none focus:border-[#2563EB] uppercase font-bold text-[#B45309] font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#172B4D] mb-1">Invoice Number Prefix *</label>
                <input
                  type="text"
                  value={profileForm.invoicePrefix}
                  onChange={(e) => handleProfileChange('invoicePrefix', e.target.value)}
                  onBlur={handleProfileBlur}
                  className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-[#172B4D] focus:outline-none focus:border-[#2563EB] font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#172B4D] mb-1">UPI Payment ID (for Invoice QR)</label>
                <input
                  type="text"
                  value={profileForm.upiId}
                  onChange={(e) => handleProfileChange('upiId', e.target.value)}
                  onBlur={handleProfileBlur}
                  className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-[#172B4D] focus:outline-none focus:border-[#2563EB] font-mono"
                  placeholder="e.g. webrajyastationery@sbi"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#172B4D] mb-1">Bank Name</label>
                <input
                  type="text"
                  value={profileForm.bankName}
                  onChange={(e) => handleProfileChange('bankName', e.target.value)}
                  onBlur={handleProfileBlur}
                  className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-[#172B4D] focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#172B4D] mb-1">Bank Account Number</label>
                <input
                  type="text"
                  value={profileForm.accountNo}
                  onChange={(e) => handleProfileChange('accountNo', e.target.value)}
                  onBlur={handleProfileBlur}
                  className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-[#172B4D] focus:outline-none focus:border-[#2563EB] font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#172B4D] mb-1">IFSC Code</label>
                <input
                  type="text"
                  value={profileForm.ifscCode || ''}
                  onChange={(e) => handleProfileChange('ifscCode', e.target.value.toUpperCase())}
                  onBlur={handleProfileBlur}
                  className="w-full px-3 py-2 bg-white border border-[#D8E1EC] rounded-lg text-[#172B4D] focus:outline-none focus:border-[#2563EB] font-mono uppercase"
                  placeholder="e.g. SBIN0001234"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-[#D8E1EC] flex items-center justify-between">
              <button
                type="submit"
                className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Save className="w-4 h-4" /> Save Shop Profile
              </button>
              <span className="text-[11px] text-[#64748B]">
                Changes auto-save automatically as you type
              </span>
            </div>
          </form>
        )}

        {activeTab === 'print' && (
          <form onSubmit={handleSavePrintSettings} className="max-w-3xl space-y-6">
            <div>
              <h3 className="text-sm font-extrabold text-[#172B4D] uppercase tracking-wider border-b border-[#D8E1EC] pb-2 mb-3">
                Default Invoice Paper Size & Format
              </h3>
              <p className="text-xs text-[#64748B] mb-4">
                Select the default paper format used for all invoice prints, billing shortcuts [F9], and receipts.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 80mm Receipt Roll */}
                <div
                  onClick={() => handleSelectPaperSize('80mm')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                    printForm.paperSize === '80mm' || printForm.paperSize === 'Thermal'
                      ? 'border-[#2563EB] bg-[#EFF6FF] shadow-xs ring-2 ring-[#2563EB]/20'
                      : 'border-[#D8E1EC] bg-white hover:border-[#94A3B8] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Receipt className={`w-5 h-5 ${printForm.paperSize === '80mm' || printForm.paperSize === 'Thermal' ? 'text-[#2563EB]' : 'text-[#64748B]'}`} />
                        <span className="font-extrabold text-sm text-[#0F172A]">80mm Receipt Roll</span>
                      </div>
                      {(printForm.paperSize === '80mm' || printForm.paperSize === 'Thermal') && (
                        <CheckCircle2 className="w-5 h-5 text-[#2563EB]" />
                      )}
                    </div>
                    <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-[#DBEAFE] text-[#1E40AF] rounded mb-2">
                      Thermal / Plain Receipt
                    </span>
                    <p className="text-xs text-[#475569] leading-relaxed">
                      Compact 80mm (3-inch) roll paper format. Ideal for high-speed retail billing, thermal receipt printers, and plain counter slips.
                    </p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-[#D8E1EC]/60 text-[10px] font-mono font-bold text-[#64748B]">
                    Width: 80mm (Continuous)
                  </div>
                </div>

                {/* A5 Landscape / Half-Letter */}
                <div
                  onClick={() => handleSelectPaperSize('A5')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                    printForm.paperSize === 'A5'
                      ? 'border-[#2563EB] bg-[#EFF6FF] shadow-xs ring-2 ring-[#2563EB]/20'
                      : 'border-[#D8E1EC] bg-white hover:border-[#94A3B8] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FileText className={`w-5 h-5 ${printForm.paperSize === 'A5' ? 'text-[#2563EB]' : 'text-[#64748B]'}`} />
                        <span className="font-extrabold text-sm text-[#0F172A]">A5 Half-Sheet</span>
                      </div>
                      {printForm.paperSize === 'A5' && (
                        <CheckCircle2 className="w-5 h-5 text-[#2563EB]" />
                      )}
                    </div>
                    <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-[#E0E7FF] text-[#3730A3] rounded mb-2">
                      Standard Stationery
                    </span>
                    <p className="text-xs text-[#475569] leading-relaxed">
                      Standard wholesale A5 stationery format. Includes full item breakdown, HSN codes, Scheme discounts, and bank details.
                    </p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-[#D8E1EC]/60 text-[10px] font-mono font-bold text-[#64748B]">
                    Dimensions: 148 × 210 mm
                  </div>
                </div>

                {/* A4 Full Sheet */}
                <div
                  onClick={() => handleSelectPaperSize('A4')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                    printForm.paperSize === 'A4'
                      ? 'border-[#2563EB] bg-[#EFF6FF] shadow-xs ring-2 ring-[#2563EB]/20'
                      : 'border-[#D8E1EC] bg-white hover:border-[#94A3B8] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Printer className={`w-5 h-5 ${printForm.paperSize === 'A4' ? 'text-[#2563EB]' : 'text-[#64748B]'}`} />
                        <span className="font-extrabold text-sm text-[#0F172A]">A4 Full Sheet</span>
                      </div>
                      {printForm.paperSize === 'A4' && (
                        <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />
                      )}
                    </div>
                    <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-[#F1F5F9] text-[#475569] rounded mb-2">
                      Accounting / Filing
                    </span>
                    <p className="text-xs text-[#475569] leading-relaxed">
                      Full-page standard office sheet. Spacious layout for large invoices with 30+ items, GST summary slabs, and formal tax audit records.
                    </p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-[#D8E1EC]/60 text-[10px] font-mono font-bold text-[#64748B]">
                    Dimensions: 210 × 297 mm
                  </div>
                </div>
              </div>
            </div>

            {/* Silent Print Engine Selection */}
            <div>
              <h3 className="text-sm font-extrabold text-[#172B4D] uppercase tracking-wider border-b border-[#D8E1EC] pb-2 mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#2563EB]" />
                Silent Printing Engine & Hardware Mode
              </h3>
              <p className="text-xs text-[#64748B] mb-3">
                Choose how WebRajya communicates with your receipt printer to bypass the Chrome print dialog.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                {/* Auto Dual-Mode */}
                <div
                  onClick={() => handleSelectPrintEngine('auto')}
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                    (printForm.printEngine || 'auto') === 'auto'
                      ? 'border-[#2563EB] bg-[#EFF6FF] shadow-xs ring-2 ring-[#2563EB]/20'
                      : 'border-[#D8E1EC] bg-white hover:border-[#94A3B8] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Zap className={`w-4 h-4 ${(printForm.printEngine || 'auto') === 'auto' ? 'text-[#2563EB]' : 'text-[#64748B]'}`} />
                        <span className="font-extrabold text-xs text-[#0F172A]">Auto Dual-Mode</span>
                      </div>
                      {(printForm.printEngine || 'auto') === 'auto' && (
                        <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />
                      )}
                    </div>
                    <span className="inline-block px-1.5 py-0.5 text-[9px] font-black uppercase bg-[#DCFCE7] text-[#15803D] rounded mb-1.5">
                      Recommended
                    </span>
                    <p className="text-[11px] text-[#475569] leading-relaxed">
                      Automatically prints 100% silently via USB or Bluetooth if connected; gracefully falls back to browser/kiosk print.
                    </p>
                  </div>
                </div>

                {/* Direct USB WebUSB */}
                <div
                  onClick={() => handleSelectPrintEngine('usb')}
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                    printForm.printEngine === 'usb'
                      ? 'border-[#2563EB] bg-[#EFF6FF] shadow-xs ring-2 ring-[#2563EB]/20'
                      : 'border-[#D8E1EC] bg-white hover:border-[#94A3B8] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Usb className={`w-4 h-4 ${printForm.printEngine === 'usb' ? 'text-[#2563EB]' : 'text-[#64748B]'}`} />
                        <span className="font-extrabold text-xs text-[#0F172A]">Direct USB Cable</span>
                      </div>
                      {printForm.printEngine === 'usb' && (
                        <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />
                      )}
                    </div>
                    <span className="inline-block px-1.5 py-0.5 text-[9px] font-black uppercase bg-[#DBEAFE] text-[#1E40AF] rounded mb-1.5">
                      Zero Print Dialog
                    </span>
                    <p className="text-[11px] text-[#475569] leading-relaxed">
                      Sends raw ESC/POS binary bytes straight over the USB wire. Triggers instant printing, auto-cutter, and cash drawer kick.
                    </p>
                  </div>
                </div>

                {/* Wireless Bluetooth */}
                <div
                  onClick={() => handleSelectPrintEngine('bluetooth')}
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                    printForm.printEngine === 'bluetooth'
                      ? 'border-[#7C3AED] bg-[#FAF5FF] shadow-xs ring-2 ring-[#7C3AED]/20'
                      : 'border-[#D8E1EC] bg-white hover:border-[#94A3B8] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Bluetooth className={`w-4 h-4 ${printForm.printEngine === 'bluetooth' ? 'text-[#7C3AED]' : 'text-[#64748B]'}`} />
                        <span className="font-extrabold text-xs text-[#0F172A]">Wireless Bluetooth</span>
                      </div>
                      {printForm.printEngine === 'bluetooth' && (
                        <CheckCircle2 className="w-4 h-4 text-[#7C3AED]" />
                      )}
                    </div>
                    <span className="inline-block px-1.5 py-0.5 text-[9px] font-black uppercase bg-[#EDE9FE] text-[#6D28D9] rounded mb-1.5">
                      Mobile & Tablet
                    </span>
                    <p className="text-[11px] text-[#475569] leading-relaxed">
                      Connects wirelessly over Web Bluetooth to portable 58mm or 80mm ESC/POS printers. Perfect for phone billing counters.
                    </p>
                  </div>
                </div>

                {/* Browser Kiosk Mode */}
                <div
                  onClick={() => handleSelectPrintEngine('browser')}
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                    printForm.printEngine === 'browser'
                      ? 'border-[#2563EB] bg-[#EFF6FF] shadow-xs ring-2 ring-[#2563EB]/20'
                      : 'border-[#D8E1EC] bg-white hover:border-[#94A3B8] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Printer className={`w-4 h-4 ${printForm.printEngine === 'browser' ? 'text-[#2563EB]' : 'text-[#64748B]'}`} />
                        <span className="font-extrabold text-xs text-[#0F172A]">Browser / Kiosk</span>
                      </div>
                      {printForm.printEngine === 'browser' && (
                        <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />
                      )}
                    </div>
                    <span className="inline-block px-1.5 py-0.5 text-[9px] font-black uppercase bg-[#F1F5F9] text-[#475569] rounded mb-1.5">
                      Standard Spooler
                    </span>
                    <p className="text-[11px] text-[#475569] leading-relaxed">
                      Uses the operating system's standard print driver. Silent when Chrome is launched with the <code className="text-[#2563EB] font-bold">--kiosk-printing</code> flag.
                    </p>
                  </div>
                </div>
              </div>

              {/* Windows Native Silent Spooler Card (when running inside Desktop App) */}
              {isInsideElectron && (
                <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl space-y-3.5 mb-4 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-200/60">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
                        <Monitor className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-xs text-[#0F172A]">
                            Windows Native Silent Printer
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-[#15803D]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            0-Click Spooler Active
                          </span>
                        </div>
                        <p className="text-[11px] text-[#64748B] mt-0.5">
                          Direct hardware spooler integration. Bypasses all browser dialogs completely.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleTestNativePrint}
                      disabled={isTestingNativePrint}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer active:scale-95"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>{isTestingNativePrint ? 'Testing...' : 'Test Windows Silent Print'}</span>
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-1">
                    <label className="text-xs font-bold text-[#172B4D] shrink-0">Target Windows Printer:</label>
                    <select
                      value={selectedNativePrinter}
                      onChange={(e) => handleSelectNativePrinter(e.target.value)}
                      className="w-full sm:w-80 px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-bold text-[#172B4D] focus:outline-none focus:border-[#2563EB]"
                    >
                      <option value="">System Default Printer (Automatic)</option>
                      {nativePrinters.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.displayName || p.name} {p.isDefault ? '(Default)' : ''}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-[#64748B]">
                      {nativePrinters.length > 0 ? `${nativePrinters.length} printer(s) detected` : 'Detecting printers...'}
                    </span>
                  </div>
                </div>
              )}

              {/* USB Thermal Printer Hardware Pairing Box */}
              <div className="p-4 bg-[#F8FAFC] border border-[#CBD5E1] rounded-2xl space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-xl ${usbStatus.isConnected ? 'bg-emerald-100 text-[#15803D]' : 'bg-slate-200 text-slate-600'}`}>
                      <Usb className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-xs text-[#0F172A]">
                          USB Thermal Receipt Printer
                        </span>
                        {usbStatus.isConnected ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-[#15803D]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Connected
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                            Not Paired / Unplugged
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#64748B] mt-0.5">
                        {usbStatus.deviceName ? `Active Device: ${usbStatus.deviceName}` : 'Connect your 80mm thermal printer via USB cable to enable 1-click silent printing.'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handlePairUsb}
                    disabled={isPairingUsb}
                    className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer active:scale-95"
                  >
                    <Usb className="w-3.5 h-3.5" />
                    <span>{isPairingUsb ? 'Pairing...' : usbStatus.isConnected ? 'Re-pair USB Printer' : 'Pair USB Printer'}</span>
                  </button>
                </div>

                {/* Diagnostics and Hardware Control Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-[#64748B] mr-1">Hardware Tests:</span>
                  <button
                    type="button"
                    onClick={handleTestUsbPrint}
                    disabled={isTestingUsb}
                    className="px-3 py-1.5 bg-white hover:bg-[#F1F5F9] text-[#172B4D] border border-[#CBD5E1] rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#2563EB]" />
                    <span>{isTestingUsb ? 'Printing...' : 'Test Print Receipt'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleTestCut}
                    className="px-3 py-1.5 bg-white hover:bg-[#F1F5F9] text-[#172B4D] border border-[#CBD5E1] rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
                  >
                    <Scissors className="w-3.5 h-3.5 text-[#D97706]" />
                    <span>Test Auto-Cut</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleTestCashDrawer}
                    className="px-3 py-1.5 bg-white hover:bg-[#F1F5F9] text-[#172B4D] border border-[#CBD5E1] rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
                  >
                    <DollarSign className="w-3.5 h-3.5 text-[#15803D]" />
                    <span>Kick Cash Drawer</span>
                  </button>
                </div>

                {/* Hardware Feature Checkboxes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-[#E2E8F0]">
                  <label className="flex items-center gap-2.5 p-2 bg-white rounded-lg border border-[#E2E8F0] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={printForm.autoCutPaper ?? true}
                      onChange={(e) => setPrintForm({ ...printForm, autoCutPaper: e.target.checked })}
                      className="rounded border-[#D8E1EC] text-[#2563EB] focus:ring-[#2563EB]"
                    />
                    <div>
                      <div className="font-bold text-[11px] text-[#172B4D]">Auto-Cut Paper (GS V)</div>
                      <div className="text-[10px] text-[#64748B]">Triggers hardware cutter after bill ends</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 bg-white rounded-lg border border-[#E2E8F0] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={printForm.openCashDrawer ?? false}
                      onChange={(e) => setPrintForm({ ...printForm, openCashDrawer: e.target.checked })}
                      className="rounded border-[#D8E1EC] text-[#2563EB] focus:ring-[#2563EB]"
                    />
                    <div>
                      <div className="font-bold text-[11px] text-[#172B4D]">Pop Open Cash Drawer (ESC p)</div>
                      <div className="text-[10px] text-[#64748B]">Sends electrical pulse to drawer pin 2</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Wireless Bluetooth Thermal Printer Hardware Pairing Box (Mobile & Tablet) */}
              <div className="p-4 bg-[#FAF5FF] border border-purple-200 rounded-2xl space-y-3.5 mt-3 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-purple-100">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-xl ${bluetoothConnected ? 'bg-purple-600 text-white shadow-xs' : 'bg-purple-100 text-purple-700'}`}>
                      <Bluetooth className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-xs text-[#0F172A]">
                          Wireless Bluetooth Thermal Printer (Mobile / Handheld)
                        </span>
                        {bluetoothConnected ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse"></span>
                            Connected
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                            Not Connected
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#64748B] mt-0.5">
                        {bluetoothDeviceName ? `Active Device: ${bluetoothDeviceName}` : 'Pair with portable 58mm or 80mm Bluetooth receipt printer for wireless mobile counter billing.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handlePairBluetooth}
                      disabled={isPairingBluetooth}
                      className="px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer active:scale-95"
                    >
                      <Bluetooth className="w-3.5 h-3.5" />
                      <span>{isPairingBluetooth ? 'Scanning...' : bluetoothConnected ? 'Re-pair Bluetooth' : 'Pair Bluetooth Printer'}</span>
                    </button>
                    {bluetoothConnected && (
                      <button
                        type="button"
                        onClick={handleDisconnectBluetooth}
                        className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-xs font-bold transition-colors cursor-pointer active:scale-95"
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-[#64748B] mr-1">Bluetooth Tests:</span>
                  <button
                    type="button"
                    onClick={handleTestBluetoothPrint}
                    disabled={isTestingBluetooth || !bluetoothConnected}
                    className="px-3 py-1.5 bg-white hover:bg-[#F1F5F9] disabled:opacity-40 text-[#172B4D] border border-[#CBD5E1] rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#7C3AED]" />
                    <span>{isTestingBluetooth ? 'Sending...' : 'Test Bluetooth Print'}</span>
                  </button>
                </div>
              </div>

              {/* Chrome Kiosk Silent Print Helper Card */}
              <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl flex items-start gap-2.5 mt-3">
                <Info className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
                <div className="text-[11px] text-[#78350F] leading-relaxed">
                  <strong className="text-[#92400E]">Chrome Kiosk Silent Printing Shortcut:</strong> On Windows PCs, you can right-click your WebRajya Chrome desktop shortcut → <strong>Properties</strong> → add <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold text-[#92400E]">--kiosk-printing</code> at the end of the Target field. This will make even regular browser prints silent with zero dialog popups.
                </div>
              </div>

              {/* Windows .exe Native App Promo Card (when in web browser) */}
              {!isInsideElectron && (
                <div className="p-4 bg-gradient-to-r from-slate-900 to-[#123B70] text-white rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 mt-3 shadow-xs border border-blue-900/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-400/20 shrink-0">
                      <Monitor className="w-5 h-5 text-blue-300" />
                    </div>
                    <div>
                      <div className="font-extrabold text-xs text-white flex items-center gap-2">
                        <span>Want 100% 0-Click Silent Printing without WebUSB prompts?</span>
                        <span className="text-[9px] font-black uppercase bg-emerald-500 text-white px-1.5 py-0.5 rounded">
                          Recommended
                        </span>
                      </div>
                      <div className="text-[11px] text-blue-200/80 mt-0.5">
                        Download WebRajya for Windows (.exe) — connects directly to your Windows printer spooler for instant thermal bills.
                      </div>
                    </div>
                  </div>
                  <a
                    href={WINDOWS_EXE_URL}
                    className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shrink-0 transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-95"
                  >
                    <Download className="w-4 h-4 text-emerald-200" />
                    <span>Download Windows App (.exe)</span>
                  </a>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-extrabold text-[#172B4D] uppercase tracking-wider border-b border-[#D8E1EC] pb-2 mb-3">
                Print Content & Template Elements
              </h3>

              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printForm.showGstBreakdown}
                    onChange={(e) => setPrintForm({ ...printForm, showGstBreakdown: e.target.checked })}
                    className="rounded border-[#D8E1EC] text-[#2563EB] focus:ring-[#2563EB]"
                  />
                  <div>
                    <div className="font-bold text-[#172B4D]">Show Tax Breakdown Table</div>
                    <div className="text-[11px] text-[#64748B]">Includes CGST + SGST or IGST tax slab columns on printed invoice</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printForm.showBankDetails}
                    onChange={(e) => setPrintForm({ ...printForm, showBankDetails: e.target.checked })}
                    className="rounded border-[#D8E1EC] text-[#2563EB] focus:ring-[#2563EB]"
                  />
                  <div>
                    <div className="font-bold text-[#172B4D]">Include Bank & UPI QR Payment Info</div>
                    <div className="text-[11px] text-[#64748B]">Prints bank account, IFSC, UPI ID and scan-and-pay details</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-[#F5F9FF] border border-[#D8E1EC] rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printForm.showTerms}
                    onChange={(e) => setPrintForm({ ...printForm, showTerms: e.target.checked })}
                    className="rounded border-[#D8E1EC] text-[#2563EB] focus:ring-[#2563EB]"
                  />
                  <div>
                    <div className="font-bold text-[#172B4D]">Print Terms & Conditions Footer</div>
                    <div className="text-[11px] text-[#64748B]">Include return policy & jurisdiction terms</div>
                  </div>
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-[#D8E1EC]">
              <button
                type="submit"
                className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Save className="w-4 h-4" /> Save Print Settings
              </button>
            </div>
          </form>
        )}

        {activeTab === 'backup' && (
          <div className="max-w-2xl space-y-6">
            <h3 className="text-sm font-extrabold text-[#172B4D] uppercase tracking-wider border-b border-[#D8E1EC] pb-2">
              Database Backup & JSON Data Management
            </h3>

            {/* Last Backup Status Indicator */}
            <div className="flex items-center justify-between p-3.5 bg-white border border-[#D8E1EC] rounded-xl shadow-xs">
              <div className="flex items-center gap-3">
                <ShieldCheck className={`w-5 h-5 shrink-0 ${lastBackupTime ? 'text-[#15803D]' : 'text-amber-500'}`} />
                <div>
                  <div className="text-xs font-bold text-[#172B4D]">
                    {lastBackupTime 
                      ? `Last Backup: ${new Date(lastBackupTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
                      : 'No backup downloaded yet'}
                  </div>
                  <div className="text-[11px] text-[#64748B]">
                    {lastBackupTime ? 'Your local IndexedDB data was safely saved to disk.' : 'Recommended: Take a manual JSON backup every 7 days.'}
                  </div>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-md text-[10px] font-black shrink-0 ${lastBackupTime ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {lastBackupTime ? 'Active Protection' : 'Backup Needed'}
              </span>
            </div>

            <div className="p-4 bg-[#F5F9FF] border border-[#D8E1EC] rounded-xl space-y-3">
              <div className="font-bold text-[#172B4D]">Export Complete JSON Database Backup</div>
              <p className="text-[11px] text-[#64748B]">Download all local products, invoices, stock movements, and settings into a single JSON file for safe offline keeping.</p>
              <button
                onClick={handleDownloadBackup}
                className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Download className="w-4 h-4" /> Download Backup (.json)
              </button>
            </div>

            <div className="p-4 bg-[#F5F9FF] border border-[#D8E1EC] rounded-xl space-y-3">
              <div className="font-bold text-[#172B4D]">Restore Database from Backup JSON</div>
              <p className="text-[11px] text-[#64748B]">Upload a previously exported WebRajya JSON backup file to restore product catalog and sales history.</p>
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-[#F5F9FF] text-[#172B4D] border border-[#D8E1EC] rounded-lg text-xs font-bold cursor-pointer shadow-xs">
                <Upload className="w-4 h-4 text-[#15803D]" /> Select Backup JSON File
                <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            <div className="p-4 bg-[#FEE2E2] border border-[#FCA5A5] rounded-xl space-y-3">
              <div className="font-bold text-[#B91C1C]">Purge All Demo Data</div>
              <p className="text-[11px] text-[#B91C1C]/80">Permanently delete all sample products, demo sales history, stock movements, and draft bills from database.</p>
              <button
                onClick={handleClearDemoData}
                className="px-4 py-2 bg-[#B91C1C] hover:bg-[#991B1B] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Trash2 className="w-4 h-4" /> Delete All Demo Data
              </button>
            </div>
          </div>
        )}

        {activeTab === 'sound' && (
          <div className="max-w-2xl space-y-6">
            <h3 className="text-sm font-extrabold text-[#172B4D] uppercase tracking-wider border-b border-[#D8E1EC] pb-2">
              Sensory Audio Cues & Sound Effects
            </h3>

            <div className="p-4 bg-[#F5F9FF] border border-[#D8E1EC] rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#2563EB] flex items-center justify-center shrink-0">
                    {soundOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="font-bold text-[#172B4D]">Audio Feedback & Sound Effects</div>
                    <div className="text-[11px] text-[#64748B]">Synthesized Web Audio API feedback for barcode scans, item additions, and cash chimes.</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const nextState = !soundOn;
                    setSoundEnabled(nextState);
                    setSoundOn(nextState);
                    if (nextState) playBeep();
                    onToast('info', 'Sound Settings', nextState ? 'Audio feedback enabled' : 'Audio muted');
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-black transition-colors cursor-pointer shrink-0 ${
                    soundOn ? 'bg-[#15803D] text-white shadow-xs' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {soundOn ? 'SOUND: ON' : 'SOUND: MUTED'}
                </button>
              </div>

              <div className="pt-3 border-t border-[#D8E1EC]">
                <div className="text-xs font-bold text-[#172B4D] mb-2">Test Audio Cues</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => playBeep()}
                    className="px-3 py-1.5 bg-white hover:bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Volume2 className="w-3.5 h-3.5" /> Barcode Beep (880Hz)
                  </button>
                  <button
                    type="button"
                    onClick={() => playCashChime()}
                    className="px-3 py-1.5 bg-white hover:bg-[#F0FDF4] text-[#15803D] border border-[#86EFAC] rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Volume2 className="w-3.5 h-3.5" /> Sale Complete Chime
                  </button>
                  <button
                    type="button"
                    onClick={() => playError()}
                    className="px-3 py-1.5 bg-white hover:bg-[#FEF2F2] text-[#DC2626] border border-[#FCA5A5] rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Volume2 className="w-3.5 h-3.5" /> Alert / Error Tone
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PWA / Windows App Installation Modal */}
      <PwaInstallModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        onInstall={promptInstall}
        hasNativePrompt={hasNativePrompt}
        isInstalled={isInstalled}
        isIos={isIos}
        initialTab={installModalTab}
      />
    </div>
  );
};
