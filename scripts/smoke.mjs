import assert from 'node:assert/strict';

const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:5173';
const request = (path, init) => fetch(new URL(path, base), { ...init, signal: AbortSignal.timeout(8000) });
const health = await request('/api/health');
assert.equal(health.status, 200);
const { protocolVersion } = await health.json();
assert.equal(typeof protocolVersion, 'number');
for (const path of ['/', '/a-client-side-route']) {
  const response = await request(path);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<div id="root"><\/div>/);
}
assert.equal((await request('/api/missing')).status, 404);
assert.equal((await request('/api/lobby')).status, 426);
assert.equal((await request('/api/lobby', { method: 'POST' })).status, 405);
assert.equal((await request('/api/lobby?clientId=invalid', { headers: { Upgrade: 'websocket' } })).status, 400);
assert.equal((await request('/api/lobby', { headers: { Origin: 'https://other.example' } })).status, 403);
assert.equal((await request('/api/turn-credentials')).status, 405);
const turn = await request('/api/turn-credentials', { method: 'POST' });
assert.equal(turn.status, 501);
assert.equal(turn.headers.get('cache-control'), 'no-store');
assert.equal((await turn.json()).error, 'not_implemented');

function nextEvent(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`${name} timed out`)); }, 8000);
    const listener = event => { cleanup(); resolve(event); };
    const error = () => { cleanup(); reject(new Error('WebSocket failed')); };
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener(name, listener);
      socket.removeEventListener('error', error);
    };
    socket.addEventListener(name, listener, { once: true });
    socket.addEventListener('error', error, { once: true });
  });
}
const url = new URL('/api/lobby', base);
url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
url.searchParams.set('clientId', crypto.randomUUID());
const socket = new WebSocket(url);
try {
  const connected = JSON.parse((await nextEvent(socket, 'message')).data);
  assert.equal(connected.type, 'connected');
  assert.equal(connected.v, protocolVersion);
  assert.match(connected.socketId, /^[0-9a-f-]{36}$/);
  for (const [payload, expected] of [
    [JSON.stringify({ v: protocolVersion, type: 'ping' }), { v: protocolVersion, type: 'pong' }],
    ['not json', { v: protocolVersion, type: 'error', code: 'invalid_message' }],
    [JSON.stringify({ v: protocolVersion, type: 'join' }), { v: protocolVersion, type: 'error', code: 'not_implemented' }],
    [JSON.stringify({ v: -1, type: 'ping' }), { v: protocolVersion, type: 'error', code: 'invalid_message' }],
  ]) {
    const reply = nextEvent(socket, 'message');
    socket.send(payload);
    assert.deepEqual(JSON.parse((await reply).data), expected);
  }
  const closed = nextEvent(socket, 'close');
  socket.send('x'.repeat(4097));
  assert.equal((await closed).code, 1009);
} finally { socket.close(); }
console.log(`Smoke checks passed: SPA, health, API boundaries, TURN placeholder, Lobby upgrade/control/close (${base}).`);
