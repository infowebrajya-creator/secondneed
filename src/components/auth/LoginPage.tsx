import React, { useState } from 'react';
import { 
  KeyRound, Mail, Eye, EyeOff, LogIn, Globe, Package, 
  Receipt, ShoppingBag, ShieldCheck, Headphones, AlertCircle, ArrowRight, Sparkles, Download
} from 'lucide-react';
import { useAuthStore, isMobileAppVersion } from '../../store/useAuthStore';
import { WINDOWS_EXE_URL } from '../../utils/constants';

interface LoginPageProps {
  onOpenSupport?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onOpenSupport }) => {
  const { login } = useAuthStore();
  const isMobile = isMobileAppVersion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    setTimeout(() => {
      const res = login(email, password, rememberDevice);
      setIsLoading(false);
      if (!res.success) {
        setErrorMsg(res.message || 'Invalid credentials');
      }
    }, 300);
  };

  const handleFillDefaultAdmin = () => {
    setEmail('admin@gmail.com');
    setPassword('admin123');
    setErrorMsg('');
  };

  return (
    <div className="min-h-screen bg-[#F7F4EC] text-[#0F172A] flex flex-col justify-between font-sans relative overflow-hidden select-none bg-[radial-gradient(#E5D7C3_1px,transparent_1px)] [background-size:20px_20px]">
      
      {/* Subtle Warm Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-[#F2E6D5]/60 to-transparent pointer-events-none" />
      <div className="absolute top-1/3 -right-32 w-96 h-96 bg-[#D9683E]/10 rounded-full blur-3xl pointer-events-none" />

      {/* TOP HEADER BAR (webrajya.com style) */}
      <header className="px-6 py-4 flex items-center justify-between z-10 border-b border-[#E8DEC9] bg-[#F7F4EC]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white p-1 shadow-md border border-[#E5D7C3] flex items-center justify-center shrink-0">
            <img src="/logo.png" alt="WebRajya Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="text-sm font-black text-[#0F172A] tracking-wider uppercase leading-none">
              WEBRAJYA <span className="text-[#D9683E]">INVOICE</span>
            </div>
            <div className="text-[11px] text-[#6B5E4C] font-semibold mt-0.5">Retail Billing & Store ERP</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <a
            href={WINDOWS_EXE_URL}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all shadow-md hover:shadow-lg cursor-pointer"
            title="Download WebRajya for Windows (.exe)"
          >
            <Download className="w-3.5 h-3.5 text-emerald-200" />
            <span className="hidden sm:inline">Download Windows App (.exe)</span>
            <span className="sm:hidden font-mono text-[11px]">.exe</span>
          </a>

          <a
            href="https://webrajya.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-full bg-[#0F172A] hover:bg-[#1E293B] text-white text-xs font-bold transition-all shadow-md hover:shadow-lg cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 text-[#D9683E]" />
            <span className="hidden sm:inline">webrajya.com</span>
          </a>
        </div>
      </header>

      {/* MAIN LOGIN CONTENT */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 z-10">
        
        {/* Top Feature Tagline Pill */}
        <div className="mb-4 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#EFE3D0] border border-[#E2D2BC] text-[#0F172A] text-[11px] font-mono font-bold uppercase tracking-wider shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-[#D9683E]" />
          <span>CONNECTED BUSINESS SOFTWARE PLATFORM</span>
        </div>

        {/* Hero Title */}
        <div className="text-center max-w-xl mb-6">
          <h1 className="text-3xl sm:text-4xl font-black text-[#0F172A] tracking-tight leading-tight">
            Sign In To <span className="text-[#D9683E]">WebRajya Invoice.</span>
          </h1>
          <p className="text-xs sm:text-sm text-[#6B5E4C] font-medium mt-1">
            Zero-lag speed, offline resilience, and fast retail billing.
          </p>
        </div>

        {/* LOGIN CARD */}
        <div className="w-full max-w-md bg-white border border-[#E5D7C3] rounded-3xl p-6 sm:p-8 shadow-xl shadow-[#0F172A]/5 relative">
          
          {/* Logo Badge Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-[#F7F4EC] p-2 mx-auto mb-2.5 shadow-sm border border-[#E5D7C3] flex items-center justify-center">
              <img src="/logo.png" alt="WebRajya Logo" className="w-full h-full object-contain" />
            </div>
            <h2 className="text-xl font-black text-[#0F172A]">Administrator Login</h2>
            <p className="text-xs text-[#6B5E4C]">Enter default system credentials to access WebRajya Invoice</p>
          </div>

          {/* Quick Default Fill Banner */}
          <div className="mb-5 p-3 rounded-2xl bg-[#F9F4EB] border border-[#E5D7C3] flex items-center justify-between text-xs">
            <div className="space-y-0.5">
              <div className="font-bold text-[#0F172A] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#D9683E]" /> Default Admin Credentials:
              </div>
              <div className="font-mono text-[11px] text-[#6B5E4C]">
                ID: <span className="text-[#0F172A] font-bold">admin@gmail.com</span> | Pass: <span className="text-[#0F172A] font-bold">admin123</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleFillDefaultAdmin}
              className="px-2.5 py-1.5 bg-[#D9683E] hover:bg-[#C8592E] text-white rounded-lg font-bold text-[11px] transition-all shrink-0 cursor-pointer shadow-xs active:scale-95"
            >
              Fill Default
            </button>
          </div>

          {/* Error Alert */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-start gap-2 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#0F172A] mb-1.5 uppercase tracking-wider">
                Email Address / ID
              </label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 absolute left-3.5 text-[#8C7C68] pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@gmail.com"
                  className="w-full pl-10 pr-4 py-3 bg-[#FAF7F2] border border-[#E5D7C3] rounded-xl text-sm text-[#0F172A] placeholder-[#A39480] font-mono focus:outline-none focus:border-[#D9683E] focus:bg-white focus:ring-2 focus:ring-[#D9683E]/20 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F172A] mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative flex items-center">
                <KeyRound className="w-4 h-4 absolute left-3.5 text-[#8C7C68] pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="admin123"
                  className="w-full pl-10 pr-11 py-3 bg-[#FAF7F2] border border-[#E5D7C3] rounded-xl text-sm text-[#0F172A] placeholder-[#A39480] font-mono focus:outline-none focus:border-[#D9683E] focus:bg-white focus:ring-2 focus:ring-[#D9683E]/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 text-[#8C7C68] hover:text-[#0F172A] transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 1-Time Login / Remember Session */}
            <div className="flex items-center justify-between text-xs py-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[#6B5E4C] hover:text-[#0F172A] font-medium">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="w-4 h-4 rounded border-[#E5D7C3] text-[#D9683E] focus:ring-[#D9683E]/30 accent-[#D9683E] cursor-pointer"
                />
                <span>
                  {isMobile ? (
                    <strong className="text-emerald-700">✓ 1-Time Login: Stay signed in on this mobile phone</strong>
                  ) : (
                    'Keep me signed in on this computer'
                  )}
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-xl font-black text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer mt-2 active:scale-[0.99] disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4 text-[#D9683E]" /> Sign In To WebRajya Invoice
                </>
              )}
            </button>
          </form>

          {/* Quick Support Contact Banner */}
          <div className="mt-5 pt-4 border-t border-[#E8DEC9] flex items-center justify-between text-xs text-[#6B5E4C]">
            <span className="flex items-center gap-1">
              <Headphones className="w-3.5 h-3.5 text-[#DC2626]" /> Need Assistance?
            </span>
            <span className="font-bold text-[#0F172A]">Aryan Rajput: 9630013483</span>
          </div>
        </div>

        {/* Windows .exe Download helper under login card */}
        <div className="mt-4 flex items-center justify-center">
          <a
            href={WINDOWS_EXE_URL}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#E5D7C3] shadow-xs text-xs font-bold text-[#0F172A] hover:border-emerald-500 hover:text-emerald-700 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Using a Counter PC? <strong>Download WebRajya for Windows (.exe)</strong></span>
          </a>
        </div>
      </main>

      {/* WEBRAJYA PRODUCT CATALOGUE FOOTER */}
      <footer className="z-10 bg-[#FAF6EE] border-t border-[#E8DEC9] px-6 py-6 space-y-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* WebRajya Branding & Website */}
          <div className="space-y-1 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <span className="text-sm font-black text-[#0F172A] tracking-wider">WEBRAJYA SOLUTIONS</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D9683E] text-white font-black uppercase">Official</span>
            </div>
            <p className="text-xs text-[#6B5E4C]">
              Connected Software That Runs Your Business | Visit <a href="https://webrajya.com" target="_blank" rel="noopener noreferrer" className="text-[#D9683E] font-bold hover:underline">webrajya.com</a>
            </p>
          </div>

          {/* WebRajya Product Catalogue Pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-bold text-[#0F172A]">
            <span className="px-3 py-1.5 rounded-xl bg-white border border-[#E5D7C3] flex items-center gap-1.5 shadow-2xs">
              <ShoppingBag className="w-3.5 h-3.5 text-[#D9683E]" /> Retail Invoicing
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-white border border-[#E5D7C3] flex items-center gap-1.5 shadow-2xs">
              <Receipt className="w-3.5 h-3.5 text-[#2563EB]" /> GST E-Invoicing
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-white border border-[#E5D7C3] flex items-center gap-1.5 shadow-2xs">
              <Package className="w-3.5 h-3.5 text-emerald-600" /> Smart Stock Control
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-white border border-[#E5D7C3] flex items-center gap-1.5 shadow-2xs">
              <Globe className="w-3.5 h-3.5 text-purple-600" /> Retail ERP Suite
            </span>
          </div>
        </div>

        {/* Bottom Copyright & Contact Bar */}
        <div className="max-w-6xl mx-auto pt-3 border-t border-[#E8DEC9] flex flex-col sm:flex-row items-center justify-between text-[11px] text-[#6B5E4C] gap-2">
          <div>
            © {new Date().getFullYear()} <strong className="text-[#0F172A]">WebRajya</strong> (<a href="https://webrajya.com" className="hover:underline">webrajya.com</a>). All rights reserved.
          </div>
          <div className="flex items-center gap-3 font-mono">
            <span>Email: <strong className="text-[#0F172A]">infowebrajya@gmail.com</strong></span>
            <span>•</span>
            <span>Support: <strong className="text-[#0F172A]">9630013483 (Aryan Rajput)</strong></span>
          </div>
        </div>
      </footer>
    </div>
  );
};
