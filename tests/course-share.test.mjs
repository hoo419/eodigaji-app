import test from 'node:test';
import assert from 'node:assert/strict';
import { courseCalendar, courseShareUrl, readSharedCourse } from '../public/course-share.js';
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
test('calendar export uses Korean time and preserves an overnight course', () => {
  const course = planCourse({ region: '성수', date: '2026-11-18', start: '23:30' });
  course.minutes = 120;
  course.title = '저녁, 산책; ' + '한글'.repeat(30);
  const file = courseCalendar(course, new Date('2026-11-01T00:00:00Z'));
  assert.match(file, /DTSTART:20261118T143000Z\r\nDTEND:20261118T163000Z/);
  assert.match(file.replaceAll('\r\n ', ''), /SUMMARY:저녁\\, 산책\\; 한글/);
  assert.ok(file.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
  assert.throws(() => courseCalendar({ ...course, conditions: { ...course.conditions, date: '2026-02-30' } }), /날짜/);
});
