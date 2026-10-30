const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'WebRajya Invoice - Retail POS & Inventory',
    icon: path.join(__dirname, '../public/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    show: false,
    autoHideMenuBar: true
  });

  // Remove default menu bar for clean POS kiosk appearance
  Menu.setApplicationMenu(null);

  // Load Vite dev server if running in development, or dist/index.html in production
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5174';
  const isDev = process.env.NODE_ENV === 'development';

  const distPath = path.join(__dirname, '../dist/index.html');
  if (!isDev && fs.existsSync(distPath)) {
    mainWindow.loadFile(distPath);
  } else {
    mainWindow.loadURL(devServerUrl).catch(() => {
      // Fallback to local dist if dev server not running
      if (fs.existsSync(distPath)) {
        mainWindow.loadFile(distPath);
      }
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handler: Get list of all native printers installed in Windows / OS
ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map(p => ({
      name: p.name,
      displayName: p.displayName || p.name,
      description: p.description || '',
      isDefault: p.isDefault,
      status: p.status
    }));
  } catch (err) {
    console.error('[Electron] Error fetching printers:', err);
    return [];
  }
});

// Disable background throttling for ultra-responsive POS performance
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

// IPC Handler: 100% True Native Silent Printing (Bypasses any print dialog)
ipcMain.handle('print-silent', async (event, options = {}) => {
  return new Promise((resolve) => {
    let resolved = false;

    // Create an invisible background window to render and print the HTML receipt
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const cleanup = () => {
      if (!printWindow.isDestroyed()) {
        printWindow.close();
      }
    };

    // Safety timeout: prevent lingering window or frozen UI if printer spooler hangs
    const timeoutTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        console.warn('[Electron] Silent print timed out after 8s');
        resolve({ success: false, error: 'Printer spooler response timeout' });
      }
    }, 8000);

    const htmlContent = options.html || '<html><body>Empty</body></html>';
    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    printWindow.webContents.on('did-fail-load', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutTimer);
        cleanup();
        resolve({ success: false, error: 'Failed to load receipt HTML in spooler window' });
      }
    });

    printWindow.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        if (resolved) return;
        const printOpts = {
          silent: true,
          printBackground: true,
          deviceName: options.deviceName || options.printerName || '', // If empty, uses Windows default printer
          margins: { marginType: 'none' },
          pageSize: options.pageSize || (options.is80mm ? { width: 80000, height: 297000 } : 'A5')
        };

        printWindow.webContents.print(printOpts, (success, failureReason) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutTimer);
            cleanup();
            if (!success) {
              console.error('[Electron] Silent print failed:', failureReason);
              resolve({ success: false, error: failureReason });
            } else {
              resolve({ success: true });
            }
          }
        });
      }, 100);
    });
  });
});

// IPC Handler: Window controls
ipcMain.handle('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('close-window', () => {
  if (mainWindow) mainWindow.close();
});
