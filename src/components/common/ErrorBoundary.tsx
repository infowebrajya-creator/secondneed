import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCw, Download, LifeBuoy, ShieldAlert } from 'lucide-react';
import { db } from '../../lib/db';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isExporting: boolean;
  exportSuccess: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isExporting: false,
      exportSuccess: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[WebRajya Jidoka Crash Guard] Uncaught runtime exception:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleExportEmergencyBackup = async () => {
    this.setState({ isExporting: true });
    try {
      const [products, invoices, customers, stockMovements, drafts, settings] = await Promise.all([
        db.products.toArray().catch(() => []),
        db.invoices.toArray().catch(() => []),
        db.customers.toArray().catch(() => []),
        db.stockMovements.toArray().catch(() => []),
        db.drafts.toArray().catch(() => []),
        db.keyValueSettings.toArray().catch(() => [])
      ]);

      const backupData = {
        app: 'WebRajya Invoice',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        isEmergencyDump: true,
        data: {
          products,
          invoices,
          customers,
          stockMovements,
          drafts,
          settings
        }
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `webrajya_emergency_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.setState({ exportSuccess: true, isExporting: false });
    } catch (e) {
      console.error('Failed to export emergency backup:', e);
      alert('Could not export database. Please contact support.');
      this.setState({ isExporting: false });
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0D2D56] text-white flex items-center justify-center p-4 font-sans select-none">
          <div className="max-w-md w-full bg-white text-[#172B4D] rounded-2xl shadow-2xl overflow-hidden border border-white/20 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-[#123B70] p-6 text-white text-center relative">
              <div className="w-14 h-14 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto mb-3 border border-red-500/30">
                <ShieldAlert className="w-8 h-8 text-[#FF8A00]" />
              </div>
              <h2 className="text-lg font-black tracking-wide uppercase">WebRajya Protection Active</h2>
              <p className="text-xs text-blue-200 mt-1">
                A display error occurred, but your local invoices and business data are safely protected in IndexedDB.
              </p>
            </div>

            {/* Actions */}
            <div className="p-6 space-y-3">
              <div className="bg-[#F5F9FF] border border-[#D8E1EC] rounded-xl p-3 text-xs text-[#64748B]">
                <div className="font-bold text-[#172B4D] mb-1 flex items-center gap-1.5">
                  <AlertOctagon className="w-4 h-4 text-red-500" />
                  <span>Error Summary:</span>
                </div>
                <p className="font-mono text-[11px] text-red-600 truncate">
                  {this.state.error?.message || 'Unexpected application render exception.'}
                </p>
              </div>

              {/* Primary Action: Reload & Restore */}
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-3 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-98 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Application & Restore Session</span>
              </button>

              {/* Secondary Action: Emergency Export */}
              <button
                type="button"
                onClick={this.handleExportEmergencyBackup}
                disabled={this.state.isExporting}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border border-[#D8E1EC] active:scale-98 text-[#172B4D] rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#2563EB]" />
                <span>
                  {this.state.exportSuccess 
                    ? '✓ Emergency Backup Downloaded!' 
                    : this.state.isExporting 
                    ? 'Exporting Local Data...' 
                    : 'Download Emergency JSON Backup'}
                </span>
              </button>

              {/* Support Info */}
              <div className="pt-2 text-center text-[11px] text-[#64748B] flex items-center justify-center gap-1">
                <LifeBuoy className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Support: <strong>WebRajya Helpdesk &amp; Technical Support</strong></span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
