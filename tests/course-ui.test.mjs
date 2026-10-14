import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { places, recommendCourses } from '../lib/planner.mjs';
const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/init\(\);\s*$/, '');
function harness(windowOptions = {}, navigator = {}) {
  const handlers = {};
  const node = { addEventListener() {}, remove() {} };
  const context = vm.createContext({ document: { querySelector: () => node, addEventListener() {} }, window: { addEventListener: (key, fn) => { handlers[key] = fn; }, matchMedia: () => ({ matches: false, addEventListener() {} }), ...windowOptions }, navigator, localStorage: { getItem: () => null }, icon: () => '' });
  vm.runInContext(source, context);
  return { context, handlers, run: code => vm.runInContext(code, context) };
}
test('installed native Android and iOS/PWA modes suppress install controls', () => {
  assert.equal(harness().run('installed()'), false);
  assert.equal(harness({ EodigajiNative: {} }).run('installed()'), true);
  assert.equal(harness({}, { standalone: true }).run('installed()'), true);
  assert.equal(harness({ matchMedia: () => ({ matches: true, addEventListener() {} }) }).run('installed()'), true);
  const h = harness(); h.handlers.appinstalled(); assert.equal(h.run('installed()'), true);
});
test('choosing B or C resolves its own course instead of falling back to A', () => {
  const h = harness(); const courses = recommendCourses();
  h.context.courses = courses;
  h.run('acceptCourse({...courses[0],recommendations:courses})');
  courses.forEach(c => { h.context.targetId = c.id; assert.equal(h.run('lookupCourse(targetId).id'), c.id); });
});
test('sample map renders only selected route stops even when extra places are loaded', () => {
  const h = harness(); h.context.course = recommendCourses()[0]; h.context.catalogue = places;
  h.run('state.course=course;state.places=catalogue;state.courseChosen=true');
  const html = h.run('mapArt()');
  assert.equal((html.match(/class="pin-button /g) || []).length, h.context.course.places.length);
  const other = places.find(p => !h.context.course.places.some(s => s.id === p.id));
  assert.ok(!html.includes(`data-id="${other.id}"`));
});
test('recommendation display does not contain the old additional place list', () => {
  const h = harness(); h.context.courses = recommendCourses();
  h.run('acceptCourse({...courses[0],recommendations:courses})');
  const html = h.run('discovery()');
  assert.equal((html.match(/data-action="choose-course"/g) || []).length, h.context.courses.length);
  assert.ok(!html.includes('함께 들르기 좋은 곳'));
});
