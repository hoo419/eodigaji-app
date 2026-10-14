import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouting, directionsLink } from '../lib/routing.mjs';
const points = [{ name: '출발/카페', lat: 37.54, lng: 127.05 }, { name: '공원', lat: 37.55, lng: 127.06 }];

test('each mode uses a distinct documented directions link with escaped names', () => {
  for (const [mode, path] of [['도보', 'walk'], ['대중교통', 'traffic'], ['자동차', 'car']]) {
    const link = directionsLink(...points, mode);
    assert.ok(link.includes(`/link/by/${path}/`));
    assert.ok(link.includes('%2F'));
  }
});

test('walking returns provider path geometry and caches requests', async () => {
  let count = 0;
  const route = createRouting({ KAKAO_REST_API_KEY: 'test-key' }, async url => {
    count++; assert.ok(url.includes('/v2/routing/walk?'));
    return { ok: true, json: async () => ({ status: 'OK', route: { properties: { totalDistance: 1800, totalTime: 1560 }, legs: [{ steps: [{ path: { points: [[127.05, 37.54], [127.052, 37.543], [127.06, 37.55]] } }] }] } }) };
  });
  const result = await route(points, '도보');
  assert.equal(result.actual, true);
  assert.equal(result.legs[0].minutes, 26);
  assert.equal(result.legs[0].segments[0].mode, 'WALKING');
  assert.equal(result.legs[0].segments[0].path.length, 3);
  await route(points, '도보'); assert.equal(count, 1);
});

test('transit preserves walking and bus segments separately', async () => {
  const route = createRouting({ KAKAO_REST_API_KEY: 'test-key' }, async url => {
    assert.ok(url.includes('/v2/routing/publictraffic?'));
    return { ok: true, json: async () => ({ status: 'OK', routes: [{ properties: { totalDistance: 2100, totalTime: 1200 }, steps: ['WALKING', 'BUS'].map(type => ({ properties: { type }, path: { points: [[127.05, 37.54], [127.06, 37.55]] } })) }] }) };
  });
  const result = await route(points, '대중교통');
  assert.deepEqual(result.legs[0].segments.map(s => s.mode), ['WALKING', 'BUS']);
});

test('car decodes road vertex pairs', async () => {
  const route = createRouting({ KAKAO_REST_API_KEY: 'test-key' }, async url => {
    assert.ok(url.startsWith('https://apis-navi.kakaomobility.com/v1/directions?'));
    return { ok: true, json: async () => ({ routes: [{ result_code: 0, summary: { distance: 2100, duration: 420 }, sections: [{ roads: [{ name: '도로', vertexes: [127.05, 37.54, 127.06, 37.55] }] }] }] }) };
  });
  const result = await route(points, '자동차');
  assert.equal(result.actual, true);
  assert.equal(result.legs[0].segments[0].mode, 'CAR');
  assert.equal(result.legs[0].minutes, 7);
});

test('provider failure cannot masquerade as a real route or expose secrets', async () => {
  const route = createRouting({ KAKAO_REST_API_KEY: 'private-key' }, async () => { throw new Error('private-key'); });
  const result = await route(points, '도보');
  assert.equal(result.actual, false);
  assert.deepEqual(result.legs[0].segments, []);
  assert.ok(result.legs[0].link.includes('/walk/'));
  assert.ok(!JSON.stringify(result).includes('private-key'));
  await assert.rejects(route([{ lat: Infinity, lng: 1 }, points[1]], '도보'), /좌표/);
});
