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

test('meal dates require a restaurant, and an explicit restaurant–cafe pair has exactly two stops', () => {
  const base = { region: '테스트동', duration: 360 };
  const pair = applyCategoryRules('식사 후 데이트 코스로 식당과 카페 한 곳씩 추천해줘', base);
  assert.deepEqual(planCourse(pair, catalogue).places.map(p => p.category), ['식사', '카페']);
  const withoutRestaurants = catalogue.filter(p => p.category !== '식사');
  assert.throws(() => recommendCourses(applyCategoryRules('식사데이트코스 추천', base), withoutRestaurants), { code: 'NO_MATCHING_COURSE' });
  assert.equal(applyCategoryRules('식당은 빼줘', pair).mealPlan, 'optional');
});

test('live chat keeps the requested meal pair through neighborhood, destination, budget and environment changes', async t => {
  const matchedOptions = [];
  const existing = planCourse({ region: '테스트동', categories: ['산책'] }, catalogue);
  const connections = {
    ...memoryConnections(),
    publicConfig: () => ({ ai: true, places: true, auth: true }),
    searchPlaces: async (region, options) => {
      matchedOptions.push({ region, ...options });
      return catalogue.map(p => ({ ...p, region, cost: p.category === '식사' ? 20000 : p.category === '카페' ? 7000 : 0 }));
    },
    interpret: async (_, current) => ({ destinationQuery: '마포도서관', conditions: current, canPlan: false }),
    resolveDestination: async () => Array.from({ length: 4 }, (_, i) => ({ name: '도서관 ' + (i + 1), address: '서울 마포구', region: '서울 마포구', lat: 37.5 + i / 100, lng: 127 })),
  };
  const server = createApp({ env: {}, connections });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, cookie) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const login = await post('/api/auth/login', { email: 'meal@example.com', password: '12345678' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const chat = async (message, previous = {}) => {
    const response = await post('/api/chat', { message, conditions: previous.conditions || existing.conditions, memory: previous.memory, currentCourse: existing }, cookie);
    assert.equal(response.status, 200);
    return response.json();
  };
  const initial = await chat('망원동에서 3시간 식사데이트코스 블록에 카페와 식당 한곳씩 넣고 추천 인당 2 만원');
  assert.equal(initial.conditions.region, '망원동');
  assert.equal(initial.conditions.duration, 180);
  assert.equal(initial.conditions.budget, 20000);
  assert.equal(initial.course, null);
  assert.match(initial.message, /27,000원/);
  const candidates = await chat('마포도서관근처로', initial);
  assert.equal(candidates.memory.destinationCandidates.length, 4);
  const selected = await chat('도서관 4번근처로', candidates);
  assert.equal(selected.conditions.destinationName, '도서관 4');
  const outdoor = await chat('실외로 조건변경', selected);
  assert.equal(outdoor.course, null);
  assert.match(outdoor.message, /실외 조건에서 식당/);
  const renewed = await chat('환경조건 전체로변경 예산 3만원', outdoor);
  assert.equal(renewed.conditions.region, '서울 마포구');
  assert.deepEqual(renewed.course.places.map(p => p.category).sort(), ['식사', '카페']);
  assert.equal(renewed.course.totalCost, 27000);
  assert.deepEqual(matchedOptions.at(-1).center, { lat: 37.53, lng: 127 });
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
    return new Response(JSON.stringify({ documents: Array.from({ length: 15 }, (_, i) => ({ id: `${q}-${i}`, place_name: q + i, address_name: '서울 테스트구 테스트동 10', x: '127', y: '37.5' })) }));
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
