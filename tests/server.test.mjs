import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { estimateTravel, places } from '../lib/planner.mjs';
import { memoryConnections } from './helpers/memory-connections.mjs';

test('real HTTP API validates requests and serves plans without exposing private files', async t => {
  const connections = { publicConfig: () => ({ auth: true }), auth: async () => ({ access_token: 'a', refresh_token: 'r', user: { id: 'u', email: 'a@example.com' } }) };
  const server = createApp({ env: {}, connections }); await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url + '/api/places')).status, 401);
  const login = await fetch(url + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@example.com', password: '12345678' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const result = await fetch(url + '/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ region: '성수', budget: 30000, environment: '실내' }) });
  assert.equal(result.status, 200);
  const p = await result.json(); assert.ok(p.totalCost <= 30000); assert.equal(p.demo, true);
  const noMatch = await fetch(url + '/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ region: '성수', budget: 0, duration: 60 }) });
  assert.equal(noMatch.status, 400);
  assert.equal((await noMatch.json()).code, 'NO_MATCHING_COURSE');
  const bad = await fetch(url + '/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: '{broken' });
  assert.equal(bad.status, 400);
  assert.equal((await fetch(url + '/package.json')).status, 404);
  assert.equal((await fetch(url + '/.git/config')).status, 404);
  const unknown = await fetch(url + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ message: '우주선을 타고', conditions: {} }) });
  assert.equal((await unknown.json()).course, null);
});

test('nearby plans include the departure leg without exposing the current coordinates', async t => {
  const catalogue = places.filter(place => place.region === '성수').map((place, index) => ({
    ...place, address: '서울 성동구 테스트로', lat: 37.546 + index * 0.001, lng: 127.056, demo: false,
  }));
  const requests = [];
  const connections = {
    ...memoryConnections(),
    publicConfig: () => ({ auth: true, places: true }),
    searchPlaces: async (region, options) => {
      requests.push({ region, ...options });
      return options.radius === 3000 ? [] : catalogue;
    },
  };
  const server = createApp({ env: {}, connections });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, cookie) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const login = await post('/api/auth/login', { email: 'nearby@example.com', password: '12345678' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const origin = { lat: 37.541234, lng: 127.052345 };
  const conditions = { region: '연남', duration: 240, start: '14:00', transport: '도보', destinationLat: 35, destinationLng: 129 };
  const plan = radius => post('/api/plan', { ...conditions, startLocation: { ...origin, radius } }, cookie);
  assert.equal((await plan(9000)).status, 400);
  assert.equal((await (await plan(3000)).json()).code, 'NO_MATCHING_COURSE');
  const result = await plan(5000);
  assert.equal(result.status, 200);
  const course = await result.json();
  assert.deepEqual(requests.map(request => [request.radius, request.center, request.privateCenter]), [[3000, origin, true], [5000, origin, true]]);
  assert.equal(course.conditions.region, '서울 성동구');
  assert.equal(course.conditions.destinationLat, null);
  assert.equal(course.departureMinutes, estimateTravel(origin, course.places[0]).minutes);
  assert.equal(course.places[0].time, `14:${String(course.departureMinutes).padStart(2, '0')}`);
  assert.equal(course.minutes, course.departureMinutes + course.places.reduce((sum, place) => sum + place.stay + place.travel, 0));
  assert.ok(course.minutes <= conditions.duration);
  assert.doesNotMatch(JSON.stringify(course), /37\.541234|127\.052345|startLocation/);
  assert.equal((await post('/api/saved', { course }, cookie)).status, 200);
  const { id } = await (await post('/api/shares', { courseId: course.id }, cookie)).json();
  const shared = await (await fetch(url + '/api/shares/' + id)).json();
  assert.equal(shared.course.departureMinutes, course.departureMinutes);
  assert.doesNotMatch(JSON.stringify(shared), /37\.541234|127\.052345|startLocation/);
});
