import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize, parseMessage, planCourse, partySizeFromMessage} from '../lib/planner.mjs';
import {courseShareUrl,readSharedCourse} from '../public/course-share.js';

test('party size validates integers and retains a compatible default for old courses',()=>{
 assert.equal(normalize({}).partySize,2);
 for(const partySize of [0,-1,1.5,101,'x']) assert.throws(()=>normalize({purpose:'여행',partySize}),/인원/);
 assert.equal(normalize({purpose:'여행',partySize:'4'}).partySize,4);
});
test('chat changes travelers without confusing per-person budgets with party size',()=>{
 assert.equal(parseMessage('4명 여행',{}).conditions.partySize,4);
 for(const text of ['1인 예산 3만원','1인당 30000원','1인 3만원']) {
  assert.equal(partySizeFromMessage(text),null);
  assert.equal(parseMessage(text,{partySize:4,purpose:'여행'}).conditions.partySize,4);
 }
 assert.equal(partySizeFromMessage('총 6인 여행'),6);
});
test('saved share snapshots retain travelers without multiplying the per-person budget',()=>{
 const c=planCourse({purpose:'여행',partySize:4,budget:30000});
 const shared=readSharedCourse(new URL(courseShareUrl(c,'https://example.com')).hash);
 assert.equal(shared.conditions.partySize,4);
 assert.equal(shared.conditions.budget,30000);
 assert.equal(shared.totalCost,c.totalCost);
});
