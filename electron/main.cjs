const { app, BrowserWindow, shell } = require('electron');
const net = require('node:net');
const path = require('node:path');
const { createStoreServer } = require('./store-server.cjs');

const rechargeHosts = new Set([
  'www.telcel.com',
  'miunefonweb.unefon.com.mx',
  'mi.movistar.com.mx',
  'mibait.com',
]);

function isLocalCameraHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.internal')) {
    return true;
  }

  if (net.isIPv4(host)) {
    const [first, second] = host.split('.').map(Number);
    return first === 10
      || first === 192 && second === 168
      || first === 172 && second >= 16 && second <= 31
      || first === 100 && second >= 64 && second <= 127
      || first === 127;
  }

  if (net.isIPv6(host)) {
    return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
  }

  return false;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#f7f8f6',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    let externalUrl;
    try {
      externalUrl = new URL(url);
    } catch (error) {
      console.error('No se pudo validar el enlace externo:', error);
      return { action: 'deny' };
    }

    const isRechargeLink = externalUrl.protocol === 'https:' && rechargeHosts.has(externalUrl.hostname);
    const isLocalCameraLink = ['http:', 'https:'].includes(externalUrl.protocol)
      && !externalUrl.username
      && !externalUrl.password
      && !externalUrl.search
      && !externalUrl.hash
      && isLocalCameraHost(externalUrl.hostname);
    if (!isRechargeLink && !isLocalCameraLink) {
      return { action: 'deny' };
    }

    shell.openExternal(externalUrl.href).catch((error) => {
      console.error('No se pudo abrir el enlace externo:', error);
    });
    return { action: 'deny' };
  });

  window.loadFile(path.join(__dirname, '..', 'dist', 'tienda', 'browser', 'index.html'));
}

let storeServer;

app.whenReady().then(async () => {
  storeServer = createStoreServer(app.getPath('userData'));
  await storeServer.start();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  console.error('No se pudo iniciar el servicio de sincronización:', error);
  app.quit();
});

app.on('before-quit', () => {
  if (storeServer) storeServer.close().catch((error) => {
    console.error('No se pudo cerrar el servicio de sincronización:', error);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
