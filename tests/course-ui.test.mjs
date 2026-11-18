import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { places, recommendCourses } from '../lib/planner.mjs';
const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/init\(\);\s*$/, '');
function harness(windowOptions = {}, navigator = {}) {
  const handlers = {};
  const submitHandlers = [];
  const node = { addEventListener() {}, remove() {}, focus() {} };
  const context = vm.createContext({ document: { querySelector: () => node, addEventListener(key, fn) { if (key === 'submit') submitHandlers.push(fn); } }, window: { addEventListener: (key, fn) => { handlers[key] = fn; }, matchMedia: () => ({ matches: false, addEventListener() {} }), ...windowOptions }, navigator, localStorage: { getItem: () => null }, icon: () => '' });
  vm.runInContext(source, context);
  return { context, handlers, submitHandlers, run: code => vm.runInContext(code, context) };
}
test('changing exploration conditions searches previously recommended places again', async () => {
  const h = harness();
  const courses = recommendCourses({ region: '성수', budget: 50000 });
  h.context.initial = { ...courses[0], recommendations: courses };
  h.context.FormData = class { *[Symbol.iterator]() { yield ['budget', '40000']; yield ['environment', '실내']; } };
  h.context.search = (path, { excludePlaceIds = [], ...conditions }) => {
    assert.equal(path, '/api/plan');
    const results = recommendCourses(conditions, places, { excludePlaceIds });
    return { ...results[0], recommendations: results };
  };
  h.run(`acceptCourse(initial); api = search; render = toast = closeDialog = () => {};
    dialog.querySelector = () => ({})`);
  await h.submitHandlers[0]({ preventDefault() {}, target: { id: 'conditions-form' } });
  assert.equal(h.run('state.course.conditions.budget'), 40000);
  assert.equal(h.run('state.course.conditions.environment'), '실내');
  assert.ok(h.run('state.course.places.some(p => initial.recommendations.some(c => c.places.some(q => q.id === p.id)))'));
});
test('new chats reset planning context and earlier chats restore their own course and messages', () => {
  const h = harness();
  let sequence = 0;
  h.context.crypto = { randomUUID: () => `chat-${++sequence}` };
  h.context.structuredClone = structuredClone;
  h.context.course = recommendCourses({ region: '연남' })[0];
  h.run(`render = () => {}; acceptCourse(course);
    state.messages = [{ role: 'user', text: '연남에서 산책' }];
    state.planningMemory.lockedPlaceIds = [course.places[0].id];
    switchChat()`);
  assert.equal(h.run('state.course'), null);
  assert.equal(h.run('state.conditions.region'), '성수');
  assert.equal(h.run('state.seenPlaceIds.length'), 0);
  assert.equal(h.run('chatTitle(state.messages)'), '');
  assert.equal(h.run('state.previousChats.length'), 1);
  h.run(`state.messages = [{ role: 'user', text: '새 일정' }];
    switchChat(state.previousChats[0].id)`);
  assert.equal(h.run('state.course.id'), h.context.course.id);
  assert.equal(h.run('chatTitle(state.messages)'), '연남에서 산책');
  assert.equal(h.run('state.planningMemory.lockedPlaceIds[0]'), h.context.course.places[0].id);
  assert.equal(h.run('chatTitle(workspaceSnapshot().previousChats[0].messages)'), '새 일정');
});
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
