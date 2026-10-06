import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';

test('auth tokens stay server-side and account queries use the authenticated owner', async t => {
  const seen = [];
  const connections = {
    publicConfig: () => ({ auth: true, ai: false, places: false, map: false }),
    auth: async (action, data) => action === 'logout' ? {} : ({ access_token: 'private-access', refresh_token: 'private-refresh', expires_in: 3600, user: { id: data.email === 'a@example.com' ? 'owner-a' : 'owner-b', email: data.email } }),
    database: async (table, method, token, query, body) => { seen.push({ table, method, token, query, body }); return []; },
  };
  const server = createApp({ env: {}, connections }); await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, cookie) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post('/api/profile', { profile: { name: 'x' } })).status, 401);
  const login = await post('/api/auth/login', { email: 'a@example.com', password: '12345678' });
  const cookie = login.headers.get('set-cookie');
  assert.ok(cookie.includes('HttpOnly')); assert.ok(cookie.includes('SameSite=Strict')); assert.ok(!cookie.includes('private-'));
  const content = await login.text(); assert.ok(!content.includes('private-')); assert.ok(content.includes('owner-a'));
  const account = await fetch(url + '/api/account', { headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(account.status, 200); assert.equal(seen[0].query, '?user_id=eq.owner-a');
  await post('/api/profile', { profile: { name: '민지', user_id: 'owner-b' } }, cookie.split(';')[0]);
  assert.equal(seen.at(-1).body.user_id, 'owner-a');
  const loginB = await post('/api/auth/login', { email: 'b@example.com', password: '12345678' });
  await fetch(url + '/api/account', { headers: { Cookie: loginB.headers.get('set-cookie').split(';')[0] } });
  assert.equal(seen.at(-1).query, '?user_id=eq.owner-b&order=created_at.desc');
  await post('/api/auth/logout', {}, cookie.split(';')[0]);
  assert.equal((await fetch(url + '/api/auth/user', { headers: { Cookie: cookie.split(';')[0] } }).then(r => r.json())).user, null);
});
