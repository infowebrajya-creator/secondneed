import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { clsx } from 'clsx';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-14 sm:top-5 left-3 right-3 sm:left-auto sm:right-6 z-[100] flex flex-col gap-2 max-w-sm sm:max-w-md w-auto pointer-events-none mx-auto sm:mx-0">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />,
    info: <Info className="w-4 h-4 text-blue-600 shrink-0" />,
  };

  const borderStyles = {
    success: 'border-l-4 border-l-emerald-500 border-y-slate-200/90 border-r-slate-200/90',
    error: 'border-l-4 border-l-red-500 border-y-slate-200/90 border-r-slate-200/90',
    info: 'border-l-4 border-l-blue-500 border-y-slate-200/90 border-r-slate-200/90',
  };

  const badgeBg = {
    success: 'bg-emerald-50',
    error: 'bg-red-50',
    info: 'bg-blue-50',
  };

  return (
    <div
      className={clsx(
        'pointer-events-auto flex items-start gap-2.5 p-3 rounded-xl border bg-white/95 backdrop-blur-md shadow-xl shadow-slate-900/10 transition-all transform animate-in fade-in slide-in-from-top-2 duration-200',
        borderStyles[toast.type]
      )}
    >
      <div className={clsx('p-1 rounded-lg shrink-0 mt-0.5', badgeBg[toast.type])}>
        {icons[toast.type]}
      </div>
      <div className="flex-1 min-w-0 pr-1">
        <h4 className="text-xs font-bold text-[#172B4D] leading-snug">{toast.title}</h4>
        {toast.description && (
          <p className="text-[11px] text-[#64748B] mt-0.5 leading-snug break-words">
            {toast.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="text-[#94A3B8] hover:text-[#172B4D] p-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
