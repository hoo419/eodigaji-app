import test from 'node:test';
import assert from 'node:assert/strict';
import { courseShareUrl, readSharedCourse } from '../public/course-share.js';
import { planCourse } from '../lib/planner.mjs';

test('shared link restores exact stops, order, conditions and costs without an account', () => {
  const course = planCourse({ region: '연남', budget: 30000, date: '2026-11-01' });
  const url = courseShareUrl({ ...course, profile: { email: 'private@example.com' }, availablePlaces: [] }, 'https://example.com/?token=secret');
  const restored = readSharedCourse(new URL(url).hash);
  assert.deepEqual(restored.places, course.places);
  assert.deepEqual(restored.conditions, course.conditions);
  assert.equal(restored.totalCost, course.totalCost);
  assert.equal(restored.id, course.id);
  assert.equal(new URL(url).search, '');
  assert.equal('profile' in restored, false);
  assert.equal('availablePlaces' in restored, false);
});
test('invalid shared links fail explicitly and ordinary fragments are ignored', () => {
  assert.equal(readSharedCourse('#main'), null);
  for (const hash of ['#course=!', '#course=e30', '#course=', '#course=' + 'a'.repeat(32001)]) {
    assert.throws(() => readSharedCourse(hash), /공유 링크/);
  }
});
