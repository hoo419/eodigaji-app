import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';

test('real HTTP API validates requests and serves plans without exposing private files', async t => {
  const server = createApp({ env: {} }); await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const result = await fetch(url + '/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ region: '성수', budget: 30000, environment: '실내' }) });
  assert.equal(result.status, 200);
  const p = await result.json(); assert.ok(p.totalCost <= 30000); assert.equal(p.demo, true);
  const bad = await fetch(url + '/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(bad.status, 400);
  assert.equal((await fetch(url + '/package.json')).status, 404);
  assert.equal((await fetch(url + '/.git/config')).status, 404);
  const unknown = await fetch(url + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: '우주선을 타고', conditions: {} }) });
  assert.equal((await unknown.json()).course, null);
});
