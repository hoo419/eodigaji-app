import test from 'node:test';
import assert from 'node:assert/strict';
import { planCourse, parseMessage, recommendCourses } from '../lib/planner.mjs';

test('course respects per-person budget and available time', () => {
  const p = planCourse({ region: '성수', budget: 20000, duration: 120, start: '14:00' });
  assert.ok(p.places.length >= 2);
  assert.ok(p.totalCost <= 20000);
  assert.ok(p.minutes <= 120);
  assert.equal(p.places[0].time, '14:00');
});
test('indoor selection never includes outdoor stops', () => {
  const p = planCourse({ region: '연남', environment: '실내', budget: 50000, duration: 240 });
  assert.ok(p.places.length >= 2);
  assert.ok(p.places.every(p => p.environment === '실내'));
});
test('impossible budget reports no matching course', () => {
  assert.throws(() => planCourse({ region: '성수', environment: '실내', budget: 1 }), /조건/);
});
test('unsupported regions cannot silently return a Seoul course', () => {
  assert.throws(() => planCourse({ region: '부산' }), /지역/);
});

test('a live regional catalogue can generate a course outside the sample regions', () => {
  const catalogue = [
    { id: 'busan-cafe', region: '부산 해운대', category: '카페', cost: 7000, stay: 40, environment: '실내', demo: false },
    { id: 'busan-food', region: '부산 해운대', category: '식사', cost: 20000, stay: 50, environment: '실내', demo: false },
  ];
  const course = planCourse({ region: ' 부산  해운대 ', budget: 30000 }, catalogue);
  assert.equal(course.conditions.region, '부산 해운대');
  assert.equal(course.demo, false);
  assert.equal(course.places.length, 2);
});
test('invalid numerical conditions are rejected', () => {
  for (const budget of [-1, 'oops', Infinity]) assert.throws(() => planCourse({ budget }), /예산/);
  assert.throws(() => planCourse({ duration: 0 }), /시간/);
});
test('chat applies rain, budget, region and preserves other conditions', () => {
  const p = parseMessage('연남에서 비가 와서 실내로, 1인 3만원', { transport: '대중교통', purpose: '데이트' });
  assert.equal(p.conditions.region, '연남');
  assert.equal(p.conditions.environment, '실내');
  assert.equal(p.conditions.budget, 30000);
  assert.equal(p.conditions.transport, '대중교통');
});
test('unsupported chat requests are acknowledged as unrecognized', () => {
  assert.equal(parseMessage('화성에서 우주선을 타고', {}).understood.length, 0);
});
test('indoor/outdoor neutral preference does not accidentally become indoor only', () => {
  assert.equal(parseMessage('실내외 상관없어', { environment: '실내' }).conditions.environment, '전체');
});
test('an unsupported named destination with a budget must not reuse the previous region', () => {
  assert.throws(() => parseMessage('부산에서 3만원 데이트', { region: '성수' }), /지역/);
});

test('themes require one anchor and combine different categories without repetition', () => {
  const catalogue = ['카페', '문화', '식사', '산책'].flatMap((category, group) =>
    Array.from({ length: 3 }, (_, i) => ({ id: group + '-' + i, region: '성수', category,
      cost: category === '식사' ? 20000 : category === '산책' ? 0 : 7000, stay: 40,
      environment: category === '산책' ? '실외' : '실내', mood: '여유로운', demo: false })));
  const courses = recommendCourses({}, catalogue);
  assert.equal(courses.length, 3);
  for (const course of courses) {
    assert.equal(new Set(course.places.map(p => p.category)).size, course.places.length);
    const anchor = { '카페 데이트': '카페', '문화 데이트': '문화', '공원 데이트': '산책' }[course.concept];
    assert.equal(course.places.filter(p => p.category === anchor).length, 1);
    assert.ok(course.totalCost <= course.conditions.budget);
    assert.ok(course.minutes <= course.conditions.duration);
  }
});

test('budget constraints can produce a harmonious course without a restaurant', () => {
  const course = planCourse({ environment: '전체', budget: 10000 });
  assert.ok(course.totalCost <= 10000);
  assert.ok(course.places.every(p => p.category !== '식사'));
  assert.equal(new Set(course.places.map(p => p.category)).size, course.places.length);
});

test('restaurant presence does not override a better matching non-meal combination', () => {
  const catalogue = [
    { id: 'cafe', category: '카페', mood: '여유로운' },
    { id: 'park', category: '산책', mood: '여유로운' },
    { id: 'food', category: '식사', mood: '로맨틱한' },
  ].map(p => ({ ...p, region: '성수', cost: 5000, stay: 40, environment: '실내', demo: false }));
  const course = planCourse({ duration: 100 }, catalogue, { category: '카페' });
  assert.deepEqual(course.places.map(p => p.id).sort(), ['cafe', 'park']);
});
