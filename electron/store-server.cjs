const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const PORT = 43827;

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function isPrivateNetworkAddress(address) {
  const normalized = address.toLowerCase();
  if (isLoopback(normalized) || normalized.startsWith('fc') || normalized.startsWith('fd')
    || normalized.startsWith('fe80:')) return true;
  const ipv4 = normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized;
  const octets = ipv4.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  return isTailscaleAddress(ipv4)
    || octets[0] === 10
    || octets[0] === 192 && octets[1] === 168
    || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31
    || octets[0] === 169 && octets[1] === 254;
}

function isTailscaleAddress(address) {
  const octets = address.split('.').map(Number);
  return octets.length === 4 && octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127
    && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255);
}

function isPrivateLanAddress(address) {
  const octets = address.split('.').map(Number);
  return octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    && (octets[0] === 10
      || octets[0] === 192 && octets[1] === 168
      || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31
      || octets[0] === 169 && octets[1] === 254);
}

function isLocalManagementRequest(request) {
  const origin = request.headers.origin;
  return isLoopback(request.socket.remoteAddress)
    && (!origin || origin === 'null' || origin === `http://127.0.0.1:${PORT}`);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest();
}

function isAuthorized(request, token, clientKeys) {
  const authorization = request.headers.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;
  const suppliedHash = hashToken(authorization.slice(7));
  const knownHashes = [hashToken(token), ...clientKeys.map((key) => Buffer.from(key.tokenHash, 'hex'))];
  return knownHashes.some((knownHash) => knownHash.length === suppliedHash.length
    && crypto.timingSafeEqual(knownHash, suppliedHash));
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flatMap((interfaces) => interfaces || [])
    .filter((address) => address.family === 'IPv4' && !address.internal && isPrivateLanAddress(address.address))
    .map((address) => address.address);
}

function getTailscaleAddresses() {
  return Object.values(os.networkInterfaces())
    .flatMap((interfaces) => interfaces || [])
    .filter((address) => address.family === 'IPv4' && !address.internal && isTailscaleAddress(address.address))
    .map((address) => address.address);
}

function send(response, status, body) {
  response.writeHead(status, {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 5 * 1024 * 1024) throw new Error('El archivo de datos excede el límite permitido.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function isValidStore(data) {
  return data && Array.isArray(data.products) && Array.isArray(data.categories)
    && Array.isArray(data.employees) && Array.isArray(data.sales)
    && (data.deletionRequests === undefined || Array.isArray(data.deletionRequests))
    && (data.shifts === undefined || Array.isArray(data.shifts));
}

function createStoreServer(userDataPath) {
  const tokenPath = path.join(userDataPath, 'mobile-sync-token');
  const clientKeysPath = path.join(userDataPath, 'mobile-sync-client-keys.json');
  const storePath = path.join(userDataPath, 'shared-store.json');
  let token;
  let clientKeys = [];
  let store = { data: null, revision: 0 };
  let writeQueue = Promise.resolve();

  async function saveClientKeys() {
    const temporaryPath = `${clientKeysPath}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(clientKeys), { mode: 0o600 });
    await fs.rename(temporaryPath, clientKeysPath);
  }

  const server = http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match',
        'Access-Control-Allow-Methods': 'DELETE, GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Origin': '*',
      });
      response.end();
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/api/connection' && request.method === 'GET') {
      if (!isLocalManagementRequest(request)) {
        send(response, 403, { error: 'Esta información solo está disponible en la computadora principal.' });
        return;
      }
      send(response, 200, {
        token,
        port: PORT,
        addresses: getLanAddresses(),
        tailscaleAddresses: getTailscaleAddresses(),
      });
      return;
    }

    if (url.pathname === '/api/connection/keys') {
      if (!isLocalManagementRequest(request)) {
        send(response, 403, { error: 'La administración de claves solo está disponible en la computadora principal.' });
        return;
      }
      if (request.method === 'GET') {
        send(response, 200, clientKeys.map(({ id, name }) => ({ id, name })));
        return;
      }
      if (request.method !== 'POST') {
        send(response, 405, { error: 'Método no permitido para administrar claves.' });
        return;
      }

      let body;
      try {
        body = await readBody(request);
      } catch (error) {
        send(response, 400, { error: error instanceof SyntaxError ? 'Los datos enviados no son JSON válido.' : error.message });
        return;
      }
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 80) {
        send(response, 400, { error: 'Escribe un nombre de equipo de 1 a 80 caracteres.' });
        return;
      }

      const key = crypto.randomBytes(32).toString('hex');
      const entry = { id: crypto.randomUUID(), name, tokenHash: hashToken(key).toString('hex') };
      clientKeys = [...clientKeys, entry];
      try {
        await saveClientKeys();
      } catch (error) {
        clientKeys = clientKeys.filter((item) => item.id !== entry.id);
        send(response, 500, { error: `No se pudo guardar la clave: ${error.message}` });
        return;
      }
      send(response, 201, { id: entry.id, name: entry.name, token: key });
      return;
    }

    if (url.pathname.startsWith('/api/connection/keys/') && request.method === 'DELETE') {
      if (!isLocalManagementRequest(request)) {
        send(response, 403, { error: 'La administración de claves solo está disponible en la computadora principal.' });
        return;
      }
      let id;
      try {
        id = decodeURIComponent(url.pathname.slice('/api/connection/keys/'.length));
      } catch {
        send(response, 400, { error: 'El identificador de clave no es válido.' });
        return;
      }
      const nextKeys = clientKeys.filter((key) => key.id !== id);
      if (nextKeys.length === clientKeys.length) {
        send(response, 404, { error: 'No se encontró la clave que quieres revocar.' });
        return;
      }
      const previousKeys = clientKeys;
      clientKeys = nextKeys;
      try {
        await saveClientKeys();
      } catch (error) {
        clientKeys = previousKeys;
        send(response, 500, { error: `No se pudo revocar la clave: ${error.message}` });
        return;
      }
      send(response, 200, { revoked: true });
      return;
    }

    if (url.pathname !== '/api/store' || !['GET', 'PUT'].includes(request.method)) {
      send(response, 404, { error: 'No se encontró el recurso solicitado.' });
      return;
    }
    if (!isPrivateNetworkAddress(request.socket.remoteAddress)) {
      send(response, 403, { error: 'La sincronización solo está disponible en la red local o mediante Tailscale.' });
      return;
    }
    if (!isAuthorized(request, token, clientKeys)) {
      send(response, 401, { error: 'La clave de conexión no es válida.' });
      return;
    }

    if (request.method === 'GET') {
      send(response, 200, store);
      return;
    }

    let data;
    try {
      data = await readBody(request);
    } catch (error) {
      send(response, 400, { error: error instanceof SyntaxError ? 'Los datos enviados no son JSON válido.' : error.message });
      return;
    }
    if (!isValidStore(data)) {
      send(response, 400, { error: 'Los datos de la tienda no tienen el formato esperado.' });
      return;
    }
    const operation = writeQueue.then(async () => {
      if (Number(request.headers['if-match']) !== store.revision) {
        send(response, 409, { error: 'Los datos cambiaron en otro dispositivo. Actualiza la tienda antes de volver a guardar.', revision: store.revision });
        return;
      }
      const nextStore = { data, revision: store.revision + 1 };
      const temporaryPath = `${storePath}.tmp`;
      try {
        await fs.writeFile(temporaryPath, JSON.stringify(nextStore), 'utf8');
        await fs.rename(temporaryPath, storePath);
        store = nextStore;
        send(response, 200, { revision: store.revision });
      } catch (error) {
        send(response, 500, { error: `No se pudieron guardar los datos compartidos: ${error.message}` });
      }
    });
    writeQueue = operation.catch((error) => {
      console.error('Falló la cola de escritura compartida:', error);
    });
    await operation;
  });

  return {
    async start() {
      await fs.mkdir(userDataPath, { recursive: true });
      token = (await fs.readFile(tokenPath, 'utf8').catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      })) || crypto.randomBytes(24).toString('hex');
      await fs.writeFile(tokenPath, token, { mode: 0o600 });
      clientKeys = await readJson(clientKeysPath, []);
      if (!Array.isArray(clientKeys) || clientKeys.some((key) =>
        !key || typeof key.id !== 'string' || typeof key.name !== 'string'
        || typeof key.tokenHash !== 'string' || !/^[a-f0-9]{64}$/i.test(key.tokenHash))) {
        throw new Error('El archivo de claves de conexión tiene un formato no válido.');
      }
      store = await readJson(storePath, store);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(PORT, '0.0.0.0', resolve);
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    },
  };
}

module.exports = { createStoreServer, isPrivateNetworkAddress };
