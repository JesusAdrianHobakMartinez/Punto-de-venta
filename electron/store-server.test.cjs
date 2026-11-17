const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createStoreServer, isPrivateNetworkAddress } = require('./store-server.cjs');

test('requires the connection key and rejects stale writes without replacing shared data', async (t) => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'tienda-sync-'));
  let server = createStoreServer(userDataPath);
  t.after(async () => {
    await server.close();
    await fs.rm(userDataPath, { recursive: true, force: true });
  });
  await server.start();

  const infoResponse = await fetch('http://127.0.0.1:43827/api/connection');
  assert.equal(infoResponse.status, 200);
  const info = await infoResponse.json();
  assert.ok(Array.isArray(info.tailscaleAddresses));
  const endpoint = 'http://127.0.0.1:43827/api/store';
  const crossOriginInfo = await fetch('http://127.0.0.1:43827/api/connection', {
    headers: { Origin: 'https://example.test' },
  });
  assert.equal(crossOriginInfo.status, 403);

  const unauthorized = await fetch(endpoint);
  assert.equal(unauthorized.status, 401);

  const headers = {
    Authorization: `Bearer ${info.token}`,
    'Content-Type': 'application/json',
    'If-Match': '0',
  };
  const initial = await fetch(endpoint, { headers: { Authorization: headers.Authorization } });
  assert.deepEqual(await initial.json(), { data: null, revision: 0 });

  const data = { products: [], categories: [], employees: [], sales: [] };
  const saved = await fetch(endpoint, { method: 'PUT', headers, body: JSON.stringify(data) });
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { revision: 1 });

  const stale = await fetch(endpoint, { method: 'PUT', headers, body: JSON.stringify({ ...data, categories: ['Otro'] }) });
  assert.equal(stale.status, 409);

  const updated = await fetch(endpoint, {
    method: 'PUT',
    headers: { ...headers, 'If-Match': '1' },
    body: JSON.stringify({ ...data, categories: ['Actualizada'] }),
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(await updated.json(), { revision: 2 });

  const current = await fetch(endpoint, { headers: { Authorization: headers.Authorization } });
  assert.deepEqual(await current.json(), { data: { ...data, categories: ['Actualizada'] }, revision: 2 });

  await server.close();
  server = createStoreServer(userDataPath);
  await server.start();
  const restored = await fetch(endpoint, { headers: { Authorization: headers.Authorization } });
  assert.deepEqual(await restored.json(), { data: { ...data, categories: ['Actualizada'] }, revision: 2 });
});

test('allows Tailscale addresses while rejecting addresses outside the local and VPN ranges', () => {
  assert.equal(isPrivateNetworkAddress('100.100.20.5'), true);
  assert.equal(isPrivateNetworkAddress('::ffff:100.100.20.5'), true);
  assert.equal(isPrivateNetworkAddress('100.128.0.1'), false);
  assert.equal(isPrivateNetworkAddress('8.8.8.8'), false);
  assert.equal(isPrivateNetworkAddress('192.168.1.20'), true);
});

test('issues unique device keys, limits key management to the primary computer, and supports revocation', async (t) => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'tienda-client-keys-'));
  let server = createStoreServer(userDataPath);
  t.after(async () => {
    await server.close();
    await fs.rm(userDataPath, { recursive: true, force: true });
  });
  await server.start();

  const keyEndpoint = 'http://127.0.0.1:43827/api/connection/keys';
  const externalManagement = await fetch(keyEndpoint, {
    headers: { Origin: 'https://example.test' },
  });
  assert.equal(externalManagement.status, 403);

  const firstResponse = await fetch(keyEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Caja secundaria' }),
  });
  assert.equal(firstResponse.status, 201);
  const first = await firstResponse.json();

  const secondResponse = await fetch(keyEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Laptop oficina' }),
  });
  assert.equal(secondResponse.status, 201);
  const second = await secondResponse.json();
  assert.notEqual(first.token, second.token);

  const listed = await fetch(keyEndpoint);
  const keys = await listed.json();
  assert.deepEqual(keys, [
    { id: first.id, name: first.name },
    { id: second.id, name: second.name },
  ]);
  assert.equal(JSON.stringify(keys).includes(first.token), false);

  const endpoint = 'http://127.0.0.1:43827/api/store';
  const firstAccess = await fetch(endpoint, { headers: { Authorization: `Bearer ${first.token}` } });
  assert.equal(firstAccess.status, 200);
  const revoked = await fetch(`${keyEndpoint}/${first.id}`, { method: 'DELETE' });
  assert.equal(revoked.status, 200);
  const rejectedFirst = await fetch(endpoint, { headers: { Authorization: `Bearer ${first.token}` } });
  assert.equal(rejectedFirst.status, 401);

  await server.close();
  server = createStoreServer(userDataPath);
  await server.start();
  const retainedSecond = await fetch(endpoint, { headers: { Authorization: `Bearer ${second.token}` } });
  assert.equal(retainedSecond.status, 200);
});
