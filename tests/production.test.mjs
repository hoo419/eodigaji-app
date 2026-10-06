import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';

async function serve(t, env, status) {
  const server = createApp({ env, connections: { publicConfig: () => status } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
test('live mode refuses sample plans and chat when providers are missing', async t => {
  const base = await serve(t, { APP_MODE: 'live' }, { ai: false, places: false, auth: false, map: false });
  for (const path of ['/api/plan', '/api/chat']) {
    const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: '성수 실내 3만원' }) });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).course, undefined);
  }
  const ready = await fetch(base + '/api/ready');
  assert.equal(ready.status, 503);
  assert.equal((await ready.json()).ready, false);
});
test('explicit Android origin supports preflight while foreign origins are rejected', async t => {
  const base = await serve(t, { APP_ORIGIN: 'https://example.com', APP_ALLOWED_ORIGINS: 'https://localhost' }, { ai: true, places: true, auth: true, map: true });
  const res = await fetch(base + '/api/config', { method: 'OPTIONS', headers: { Origin: 'https://localhost', 'Access-Control-Request-Method': 'GET' } });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://localhost');
  assert.equal((await fetch(base + '/api/config', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(base + '/api/ready')).status, 200);
});
