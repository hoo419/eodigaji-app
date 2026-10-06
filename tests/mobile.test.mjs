import test from 'node:test';
import assert from 'node:assert/strict';
import { createMobileClient, validateServerUrl } from '../mobile/client.mjs';

test('installed app generates sample routes without a server or network', async () => {
  const api = createMobileClient({ request: () => { throw new Error('network must not run'); } });
  assert.equal((await api('/api/config')).offline, true);
  const route = await api('/api/plan', { region: '연남', budget: 20000, duration: 180, environment: '실내' });
  assert.ok(route.places.length >= 2);
  assert.ok(route.totalCost <= 20000);
  assert.ok(route.places.every(p => p.environment === '실내'));
});
test('offline chat edits shared conditions and unsupported auth does not fake login', async () => {
  const api = createMobileClient();
  const reply = await api('/api/chat', { message: '성수에서 실내 3만원', conditions: { region: '연남' } });
  assert.equal(reply.course.conditions.region, '성수');
  assert.equal(reply.course.conditions.budget, 30000);
  await assert.rejects(api('/api/auth/login', {}), /서버/);
});
test('production server configuration requires HTTPS and forbids credentials', () => {
  assert.equal(validateServerUrl(''), '');
  assert.equal(validateServerUrl('https://api.example.com/'), 'https://api.example.com');
  for (const value of ['http://192.168.0.5:4173', 'https://name:secret@example.com', 'https://example.com/?key=secret', 'javascript:alert(1)']) assert.throws(() => validateServerUrl(value));
});
test('native server errors are shown without falling back to a fake success', async () => {
  const api = createMobileClient({ apiBase: 'https://api.example.com', request: async () => ({ status: 401, data: { error: '로그인이 필요해요.' } }) });
  await assert.rejects(api('/api/saved', {}), /로그인/);
});
