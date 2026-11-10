import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { planCourse } from '../lib/planner.mjs';

// A database double survives app restarts and enforces the same owner boundaries as RLS.
import { memoryConnections } from './helpers/memory-connections.mjs';

test('account data survives logout, new session and server restart; shares are immutable and isolated', async t => {
  const connections = memoryConnections();
  let server;
  async function start() { server = createApp({ env: {}, connections }); await new Promise(r => server.listen(0, '127.0.0.1', r)); return `http://127.0.0.1:${server.address().port}`; }
  let base = await start(); t.after(() => new Promise(r => server.close(r)));
  const post = (path, body, cookie) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const login = async email => (await post('/api/auth/login', { email, password: '12345678' })).headers.get('set-cookie').split(';')[0];
  const getAccount = cookie => fetch(base + '/api/account', { headers: { Cookie: cookie } }).then(r => r.json());
  for (const [path, body] of [['/api/plan', {}], ['/api/chat', {}], ['/api/route', {}], ['/api/workspace', {}], ['/api/shares', {}], ['/api/saved', {}]]) assert.equal((await post(path, body)).status, 401);
  let a = await login('a@example.com');
  const c = planCourse({ region: '성수' }); c.places[0].note = '예약 메모: "창가 자리" <script>alert(1)</script>';
  assert.equal((await post('/api/profile', { profile: { name: '사용자 A' } }, a)).status, 200);
  assert.equal((await post('/api/saved', { course: c }, a)).status, 200);
  assert.equal((await post('/api/workspace', { workspace: { conditions: c.conditions, course: c, messages: [{ role: 'user', text: '내 대화' }] } }, a)).status, 200);
  const shared = await post('/api/shares', { courseId: c.id }, a).then(r => r.json()); assert.ok(shared.id);
  const anonymous = await fetch(base + '/api/shares/' + shared.id).then(r => r.json());
  assert.equal(anonymous.course.places[0].note, c.places[0].note); assert.equal('user_id' in anonymous.course, false);
  c.title = '수정한 내 코스'; await post('/api/saved', { course: c }, a);
  assert.notEqual((await fetch(base + '/api/shares/' + shared.id).then(r => r.json())).course.title, c.title);
  assert.equal((await post('/api/shares/' + shared.id, { course: c }, a)).status, 405);
  const b = await login('b@example.com');
  assert.equal((await getAccount(b)).saved.length, 0);
  assert.equal((await post('/api/shares', { courseId: c.id, user_id: 'a@example.com' }, b)).status, 404);
  await post('/api/auth/logout', {}, a);
  await new Promise(r => server.close(r)); base = await start(); a = await login('a@example.com');
  const restored = await getAccount(a);
  assert.equal(restored.profile.name, '사용자 A'); assert.equal(restored.saved[0].title, c.title); assert.equal(restored.workspace.messages[0].text, '내 대화');
  assert.equal((await fetch(base + '/api/shares/' + shared.id)).status, 200);
});
