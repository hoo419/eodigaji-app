import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTravel, planCourse, recommendCourses } from '../lib/planner.mjs';

test('walking estimates increase with distance instead of always reporting ten minutes', () => {
  const a = { lat: 37.54, lng: 127.05 };
  const near = estimateTravel(a, { lat: 37.541, lng: 127.051 });
  const far = estimateTravel(a, { lat: 37.58, lng: 127.08 });
  assert.ok(far.minutes > near.minutes);
  assert.ok(far.minutes > 60);
  assert.ok(far.distance > 4000);
  assert.match(far.basis, /실제 길찾기 아님/);
});

test('long real journeys are excluded when the requested time cannot accommodate them', () => {
  const catalogue = [
    { id: 'a', region: '서울', category: '카페', lat: 37.54, lng: 127.05, stay: 40, cost: 7000, environment: '실내', demo: false },
    { id: 'b', region: '서울', category: '문화', lat: 37.70, lng: 127.25, stay: 40, cost: 7000, environment: '실내', demo: false },
  ];
  assert.throws(() => planCourse({ region: '서울', duration: 120 }, catalogue), /조건에 맞는 코스/);
});

test('arrival times include travel before each subsequent stop and equal the total duration', () => {
  const course = planCourse({ start: '14:00' });
  const minute = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  for (let i = 1; i < course.places.length; i++) {
    assert.equal(minute(course.places[i].time), minute(course.places[i - 1].time) + course.places[i - 1].stay + course.places[i].travel);
  }
  assert.equal(course.minutes, course.places.reduce((sum, p) => sum + p.stay + p.travel, 0));
});

test('recommendations are distinct, themed, budget constrained and respect indoor preference', () => {
  const courses = recommendCourses({ environment: '실내', budget: 30000, duration: 180 });
  const signatures = courses.map(c => c.places.map(p => p.id).sort().join('|'));
  assert.equal(new Set(signatures).size, signatures.length);
  assert.ok(courses.length >= 2);
  courses.forEach((c, i) => {
    assert.equal(c.label, String.fromCharCode(65 + i));
    assert.ok(c.totalCost <= 30000 && c.minutes <= 180);
    assert.ok(c.places.every(p => p.environment === '실내'));
    assert.ok(!('availablePlaces' in c));
  });
});
