import test from 'node:test';
import assert from 'node:assert/strict';
import { planCourse, recommendCourses, allocateStayTimes } from '../lib/planner.mjs';
import { validateItinerary } from '../lib/conversation-planner.mjs';

test('all recommendation themes fill the requested time including travel', () => {
  for (const purpose of ['데이트', '여행']) for (const duration of [120, 180, 240, 360]) {
    const courses = recommendCourses({ duration, purpose }, undefined, { random: () => 0.5 });
    for (const c of courses) {
      assert.ok(c.minutes <= duration);
      assert.equal(c.remainingMinutes, duration - c.minutes);
      assert.equal(c.places.reduce((n, p) => n + p.stay + p.travel, 0), c.minutes);
      assert.ok(c.places.every(p => Number.isInteger(p.stay) && p.stay >= 5));
    }
  }
});
test('proportional allocation preserves weights and exact rounded totals', () => {
  const places = [{stay:40}, {stay:50}, {stay:40}];
  const result = allocateStayTimes(places, 360, 20);
  assert.deepEqual(result.map(p => p.stay), [105, 131, 104]);
  assert.deepEqual(places.map(p => p.stay), [40, 50, 40]);
  assert.deepEqual(allocateStayTimes(result, 360, 20), result);
});
test('duration edits redistribute while keeping explicit stay times fixed', () => {
  const original = planCourse({duration:240});
  original.places[0].stay = 60; original.places[0].stayFixed = true;
  const updated = validateItinerary(original, {...original.conditions, duration:360});
  assert.equal(updated.minutes, 360);
  assert.equal(updated.places[0].stay, 60);
  assert.equal(updated.end, '20:00');
  assert.throws(() => allocateStayTimes([{stay:360,stayFixed:true}, {stay:40}],360,10), /초과/);
});

test('long courses grow beyond four blocks and meals never exceed ninety minutes', () => {
  const catalogue = Array.from({length:20}, (_,i) => ({id:String(i), name:'장소'+i,region:'성수',category:i%2?'식사':'카페',stay:40,cost:0,environment:'실내',mood:'여유로운',demo:true}));
  const c = planCourse({duration:720}, catalogue);
  assert.ok(c.places.length > 4);
  assert.ok(c.places.filter(p=>p.category==='식사').every(p=>p.stay<=90));
  assert.ok(c.minutes<=720);
  assert.equal(new Set(c.places.map(p=>p.id)).size,c.places.length);
});
test('scarce candidates leave explicit free time instead of inflating stays', () => {
  const catalogue = [0,1].map(i=>({id:String(i),name:'식사'+i,category:'식사',region:'성수',stay:50,cost:0,environment:'실내',mood:'여유로운',demo:true}));
  const c = planCourse({duration:360,categories:['식사']},catalogue);
  assert.equal(c.minutes,190);
  assert.equal(c.remainingMinutes,170);
  assert.deepEqual(c.places.map(p=>p.stay),[90,90]);
});

test('manual meals over ninety minutes are rejected and stay caps leave time unused', () => {
  assert.throws(()=>allocateStayTimes([{category:'식사',stay:91,stayFixed:true}],360,0),/90분/);
  const list = allocateStayTimes([{category:'식사',stay:50},{category:'카페',stay:40}],360,30);
  assert.deepEqual(list.map(p=>p.stay),[90,90]);
});
