import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCategoryRules, parseMessage, recommendCourses, planCourse } from '../lib/planner.mjs';
import { createConnections } from '../lib/connections.mjs';
import { createApp } from '../server.mjs';
import { memoryConnections } from './helpers/memory-connections.mjs';
const catalogue = ['카페', '식사', '문화', '산책'].flatMap((category, g) => Array.from({ length: 12 }, (_, i) => ({ id: `${g}-${i}`, name: category + i, category, region: '테스트동', cost: 1000, stay: 20, mood: '미확인', environment: category === '산책' ? '실외' : '실내', demo: false })));

test('cafe-only and restaurant exclusions are hard constraints that persist across follow-ups', () => {
  for (const message of ['카페만 찾아줘', '카페로만 구성해줘', '오직 카페 추천']) {
    const c = applyCategoryRules(message, { region: '테스트동' });
    const courses = recommendCourses(c, catalogue);
    assert.ok(courses.length); assert.ok(courses.every(c => c.places.every(p => p.category === '카페')));
    const next = parseMessage('예산은 3만원으로', c).conditions;
    assert.deepEqual(next.categories, ['카페']); assert.equal(next.budget, 30000);
  }
  for (const message of ['식당 제외해줘', '식당은 빼줘', '식사는 넣지마', '음식점 없이', '식당 안 넣어줘']) {
    const c = applyCategoryRules(message, { region: '테스트동' });
    assert.ok(c.excludedCategories.includes('식사'), message);
    assert.ok(recommendCourses(c, catalogue).every(c => c.places.every(p => p.category !== '식사')));
  }
  const c = applyCategoryRules('식당 다시 포함해줘', applyCategoryRules('식당 제외', { region: '테스트동' }));
  assert.equal(c.excludedCategories.includes('식사'), false); assert.equal(c.includeMeals, true);
});

test('romantic dates default to cafes, explicit meal requests can include restaurants', () => {
  const base = { region: '테스트동', mood: '로맨틱한' };
  assert.ok(recommendCourses(base, catalogue).every(c => c.places.every(p => p.category === '카페')));
  const meals = applyCategoryRules('식당도 포함해줘', base);
  assert.ok(planCourse(meals, catalogue).places.some(p => p.category === '식사'));
});

test('refresh excludes every earlier place and cannot silently fill with duplicates', () => {
  const first = recommendCourses({ region: '테스트동', categories: ['카페'] }, catalogue);
  const excludePlaceIds = first.flatMap(c => c.places.map(p => p.id));
  const next = recommendCourses({ region: '테스트동', categories: ['카페'] }, catalogue, { excludePlaceIds });
  assert.ok(next.every(c => c.places.every(p => !excludePlaceIds.includes(p.id))));
  assert.throws(() => recommendCourses({ region: '테스트동' }, catalogue, { excludePlaceIds: catalogue.map(p => p.id) }), /조건에 맞는 코스/);
});

test('Sol request uses structured outputs and an incorrect model cannot override cafe-only memory', async () => {
  let payload;
  const api = createConnections({ OPENAI_API_KEY: 'test' }, async (url, options) => {
    payload = JSON.parse(options.body);
    return new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ message: '준비했어요', canPlan: true, categories: [], excludedCategories: [], includeMeals: true }) }] }] }));
  });
  const c = await api.interpret('카페만 찾아줘', { region: '테스트동' });
  assert.deepEqual(c.conditions.categories, ['카페']); assert.equal(c.conditions.includeMeals, false);
  assert.equal(payload.model, 'gpt-6.1-sol'); assert.equal(payload.reasoning.effort, 'low'); assert.equal(payload.text.format.strict, true);
  assert.ok(payload.text.format.schema.properties.excludedCategories);
  const next = await api.interpret('3만원으로 해줘', c.conditions);
  assert.deepEqual(next.conditions.categories, ['카페']);
});

test('place search caches a larger pool so refresh can obtain new real place candidates', async () => {
  let requests = 0;
  const api = createConnections({ KAKAO_REST_API_KEY: 'test' }, async url => {
    requests++; const q = new URL(url).searchParams.get('query');
    return new Response(JSON.stringify({ documents: Array.from({ length: 15 }, (_, i) => ({ id: `${q}-${i}`, place_name: q + i, x: '127', y: '37.5' })) }));
  });
  const a = await api.searchPlaces('테스트동');
  const b = await api.searchPlaces('테스트동', { excludePlaceIds: a.slice(0, 12).map(p => p.id) });
  assert.equal(a.length, 60); assert.equal(b.length, 48); assert.equal(requests, 4);
  assert.ok(b.every(p => !a.slice(0, 12).some(q => q.id === p.id)));
});

test('chat and refresh APIs enforce constraints even with an imperfect AI and reject exhausted alternatives', async t => {
  const baseConnections = memoryConnections();
  const connections = { ...baseConnections, publicConfig: () => ({ ai: true, places: true, auth: true }), searchPlaces: async () => catalogue, interpret: async (message, current) => ({ canPlan: true, message: '추천', conditions: applyCategoryRules(message, current) }) };
  const server = createApp({ env: {}, connections }); await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const login = await post('/api/auth/login', { email: 'test@example.com', password: '12345678' }); cookie = login.headers.get('set-cookie').split(';')[0];
  const reply = await post('/api/chat', { message: '카페만 찾아줘', conditions: { region: '테스트동' } }).then(r => r.json());
  assert.ok(reply.course.places.every(p => p.category === '카페'));
  const previous = reply.course.recommendations.flatMap(c => c.places.map(p => p.id));
  const refresh = await post('/api/plan', { ...reply.course.conditions, excludePlaceIds: previous }).then(r => r.json());
  assert.ok(refresh.places.every(p => !previous.includes(p.id)));
  const exhausted = await post('/api/plan', { region: '테스트동', excludePlaceIds: catalogue.map(p => p.id) });
  assert.equal(exhausted.status, 400); assert.match((await exhausted.json()).error, /부족/);
});
