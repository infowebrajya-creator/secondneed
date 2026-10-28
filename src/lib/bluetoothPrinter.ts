import { Invoice, ShopProfile, PrintSettings } from '../types';
import { buildInvoiceEscPos } from './escpos';

let connectedDevice: any = null;
let writeCharacteristic: any = null;

export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function isBluetoothPrinterConnected(): boolean {
  return connectedDevice !== null && connectedDevice.gatt?.connected === true && writeCharacteristic !== null;
}

export function getConnectedBluetoothName(): string | null {
  return isBluetoothPrinterConnected() ? (connectedDevice.name || 'Bluetooth POS Printer') : null;
}

/**
 * Common Bluetooth Service UUIDs for ESC/POS receipt printers
 */
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS Printer Service
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Star Micronics Service
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent UART
  '0000ff00-0000-1000-8000-00805f9b34fb', // Custom UART
  '0000e7ff-0000-1000-8000-00805f9b34fb'  // Feasycom / Common 58mm/80mm mini
];

/**
 * Scans and connects to a wireless Bluetooth thermal receipt printer.
 */
export async function connectBluetoothPrinter(): Promise<{ success: boolean; deviceName?: string; error?: string }> {
  if (!isBluetoothSupported()) {
    return { success: false, error: 'Web Bluetooth is not supported on this browser or platform. Please use Chrome on Android or a supported browser.' };
  }

  try {
    const nav = navigator as any;
    const device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES
    });

    if (!device) {
      return { success: false, error: 'No printer device selected.' };
    }

    device.addEventListener('gattserverdisconnected', () => {
      connectedDevice = null;
      writeCharacteristic = null;
      window.dispatchEvent(new CustomEvent('webrajya_bluetooth_status', { detail: { connected: false } }));
    });

    const server = await device.gatt.connect();

    // Iterate through services to locate the writable characteristic
    let targetChar: any = null;
    const services = await server.getPrimaryServices().catch(() => []);

    for (const service of services) {
      const chars = await service.getCharacteristics().catch(() => []);
      for (const char of chars) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          targetChar = char;
          break;
        }
      }
      if (targetChar) break;
    }

    if (!targetChar) {
      return { success: false, error: 'Found printer, but could not detect ESC/POS writable channel.' };
    }

    connectedDevice = device;
    writeCharacteristic = targetChar;

    window.dispatchEvent(new CustomEvent('webrajya_bluetooth_status', { 
      detail: { connected: true, deviceName: device.name || 'Bluetooth Printer' } 
    }));

    return { success: true, deviceName: device.name || 'Bluetooth Thermal Printer' };
  } catch (err: any) {
    if (err.name === 'NotFoundError') {
      return { success: false, error: 'Bluetooth scan cancelled by user.' };
    }
    return { success: false, error: err?.message || 'Failed to connect to Bluetooth printer.' };
  }
}

/**
 * Disconnects the Bluetooth printer
 */
export async function disconnectBluetoothPrinter(): Promise<void> {
  try {
    if (connectedDevice && connectedDevice.gatt) {
      await connectedDevice.gatt.disconnect();
    }
  } catch (_) {}
  connectedDevice = null;
  writeCharacteristic = null;
  window.dispatchEvent(new CustomEvent('webrajya_bluetooth_status', { detail: { connected: false } }));
}

/**
 * Sends raw ESC/POS binary data to the Bluetooth printer in MTU-safe chunks.
 */
export async function sendBluetoothEscPos(bytes: Uint8Array): Promise<{ success: boolean; error?: string }> {
  if (!isBluetoothPrinterConnected()) {
    // Attempt automatic reconnect or prompt
    const connectRes = await connectBluetoothPrinter();
    if (!connectRes.success || !writeCharacteristic) {
      return { success: false, error: connectRes.error || 'Bluetooth printer not connected.' };
    }
  }

  try {
    // Send in 256-512 byte chunks to prevent Bluetooth buffer overflow
    const chunkSize = 256;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      if (writeCharacteristic.properties.writeWithoutResponse) {
        await writeCharacteristic.writeValueWithoutResponse(chunk);
      } else {
        await writeCharacteristic.writeValue(chunk);
      }
      // Brief 15ms pause between packets for low-cost thermal microcontrollers
      await new Promise(r => setTimeout(r, 15));
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error transmitting data to Bluetooth printer.' };
  }
}

/**
 * Prints a complete customer invoice directly to Bluetooth 58mm / 80mm printer.
 */
export async function printInvoiceSilentBluetooth(
  invoice: Invoice,
  shop: ShopProfile,
  printSettings?: PrintSettings
): Promise<{ success: boolean; error?: string }> {
  const bytes = buildInvoiceEscPos(invoice, shop, printSettings);
  return await sendBluetoothEscPos(bytes);
}

/**
 * Diagnostic test print for Bluetooth printer.
 */
export async function printTestBluetooth(shopName: string = 'WEBRAJYA POS'): Promise<{ success: boolean; error?: string }> {
  const encoder = new TextEncoder();
  const init = new Uint8Array([0x1B, 0x40, 0x1B, 0x61, 0x01]); // ESC @ (Init), Center
  const header = encoder.encode(`\n=== ${shopName.toUpperCase()} ===\n`);
  const body = encoder.encode(`BLUETOOTH WIRELESS THERMAL TEST\nDate: ${new Date().toLocaleString('en-IN')}\nStatus: PAIRED & READY\n--------------------------------\n\n\n`);
  const cut = new Uint8Array([0x1D, 0x56, 0x41, 0x03]); // GS V A (Feed & Cut)

  const combined = new Uint8Array(init.length + header.length + body.length + cut.length);
  combined.set(init, 0);
  combined.set(header, init.length);
  combined.set(body, init.length + header.length);
  combined.set(cut, init.length + header.length + body.length);

  return await sendBluetoothEscPos(combined);
}
