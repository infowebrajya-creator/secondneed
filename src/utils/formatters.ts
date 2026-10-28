export function formatCurrency(amount: number, showDecimals: boolean = true): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: showDecimals ? 2 : 0,
    minimumFractionDigits: showDecimals ? 2 : 0,
  }).format(safeAmount);
}

export function formatDate(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTime(timeString?: string): string {
  if (timeString) return timeString;
  return new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function generateInvoiceNumber(prefix: string = 'WR-', lastCount: number = 1000): string {
  const nextNum = lastCount + 1;
  const yearSuffix = new Date().getFullYear().toString().slice(-2);
  return `${prefix}${yearSuffix}-${nextNum.toString().padStart(5, '0')}`;
}

export function calculateNextInvoiceNumber(existingNumbers: string[], prefix: string = 'INV-'): string {
  const cleanPrefix = prefix || 'INV-';
  const yearSuffix = new Date().getFullYear().toString().slice(-2);
  const escapedPrefix = cleanPrefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const pattern = new RegExp(`^${escapedPrefix}${yearSuffix}-(\\d+)$`);
  let maxNum = 1000;

  for (const numStr of existingNumbers) {
    if (!numStr) continue;
    const match = numStr.match(pattern);
    if (match) {
      const val = parseInt(match[1], 10);
      if (!isNaN(val) && val > maxNum) {
        maxNum = val;
      }
    }
  }

  const nextNum = maxNum + 1;
  return `${cleanPrefix}${yearSuffix}-${nextNum.toString().padStart(5, '0')}`;
}

