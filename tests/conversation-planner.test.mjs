import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnections } from '../lib/connections.mjs';
import { applyCourseDecision, validateItinerary, planningMemory, localCourseDecision } from '../lib/conversation-planner.mjs';
import { normalize, applyCategoryRules } from '../lib/planner.mjs';
import { createApp } from '../server.mjs';
import { memoryConnections } from './helpers/memory-connections.mjs';
const catalogue = Array.from({length:8},(_,i)=>({id:`p${i}`,name:`장소${i}`,category:i===2?'식사':i===3?'문화':'카페',cost:i===2?15000:5000,stay:30,region:'성수',environment:'실내',demo:true,x:10+i,y:20+i}));
const makeCourse=()=>validateItinerary({id:'course',title:'우리 코스',places:catalogue.slice(0,4)},normalize({duration:360}));
const step=(type,targetId=null,extra={})=>({type,targetId,placeId:null,afterId:null,minutes:null,...extra});
const decide=(steps,extras={})=>({operation:'edit',canPlan:true,message:'변경안',steps,preferences:[],...extras});
const apply=(decision,course=makeCourse(),memory={},conditions=course.conditions)=>applyCourseDecision({decision,course,memory,catalogue,conditions});

test('keep then replace rest preserves the locked stop, metadata and ID across turns',()=>{
 const original=makeCourse();original.places[1].note='예약';
 const first=apply(decide([step('keep','p1')]),original);
 assert.equal(first.course,null);assert.deepEqual(first.memory.lockedPlaceIds,['p1']);
 const second=apply(decide([step('replace','p0',{placeId:'p4'}),step('replace','p2',{placeId:'p5'}),step('replace','p3',{placeId:'p6'})]),original,first.memory);
 assert.deepEqual(second.course.places.map(p=>p.id),['p4','p1','p5','p6']);assert.equal(second.course.places[1].note,'예약');assert.equal(second.course.id,original.id);assert.equal(second.course.revision,1);
 const conflict=apply(decide([step('replace','p1',{placeId:'p7'})]),second.course,second.memory);
 assert.equal(conflict.course,null);assert.match(conflict.message,/유지/);assert.deepEqual(second.course.places.map(p=>p.id),['p4','p1','p5','p6']);
});
test('add, move, stay and remove operate only on named IDs and recalculate totals',()=>{
 const result=apply(decide([step('remove','p2'),step('add',null,{placeId:'p4',afterId:'p0'}),step('move','p3',{afterId:null}),step('stay','p1',{minutes:45})]));
 assert.deepEqual(result.course.places.map(p=>p.id),['p3','p0','p4','p1']);assert.equal(result.course.places.at(-1).stay,45);assert.equal(result.course.totalCost,20000);assert.equal(result.course.minutes,165);
});
test('invalid model IDs, duplicates and late invalid operations roll back the entire transaction',()=>{
 const original=makeCourse(); const copy=structuredClone(original);
 for(const steps of [[step('replace','p0',{placeId:'invented'})],[step('add',null,{placeId:'p1',afterId:'p0'})],[step('remove','p0'),step('move','missing',{afterId:null})]]) {
  const result=apply(decide(steps),original);assert.equal(result.course,null);assert.equal(result.clarification,true);assert.deepEqual(original,copy);
 }
});
test('budget conflict preserves the original and remembers the requested budget for the next turn',()=>{
 const original=makeCourse();const result=apply(decide([]),original,{},normalize({...original.conditions,budget:16000}));
 assert.equal(result.course,null);assert.match(result.message,/予算|예산/);assert.equal(result.memory.pendingConditions.budget,16000);
 const next=apply(decide([step('remove','p2')]),original,result.memory,result.memory.pendingConditions);
 assert.equal(next.course.totalCost,15000);assert.equal(next.memory.pendingConditions,null);
});
test('time and category conflicts ask instead of returning an invalid route',()=>{
 const c=makeCourse();
 assert.match(apply(decide([step('stay','p0',{minutes:300})]),c).message,/길어요|체류 시간/);
 const result=apply(decide([]),c,{},applyCategoryRules('카페만',c.conditions));assert.equal(result.course,null);assert.match(result.message,/충돌/);
});
test('unkeep needs an explicit user request and soft preferences remain separate from verified facts',()=>{
 const c=makeCourse(),memory={courseId:c.id,lockedPlaceIds:['p1'],preferences:['조용한 곳 선호']};
 const no=applyCourseDecision({decision:decide([step('unkeep','p1'),step('remove','p1')]),course:c,memory,catalogue,conditions:c.conditions,request:'이동시간을 줄여줘'});assert.equal(no.course,null);assert.deepEqual(no.memory.lockedPlaceIds,['p1']);
 const yes=applyCourseDecision({decision:decide([step('unkeep','p1'),step('remove','p1')]),course:c,memory,catalogue,conditions:c.conditions,request:'두 번째 장소 유지 해제하고 빼줘'});assert.equal(yes.course.places.length,3);assert.deepEqual(yes.memory.preferences,['조용한 곳 선호']);
});
test('clarification leaves course and locks unchanged; demo handles ordinal keep and replace-rest',()=>{
 const c=makeCourse();assert.equal(apply({operation:'clarify',canPlan:false,message:'어느 카페인가요?'}).course,null);
 const decision=localCourseDecision('두 번째 장소는 유지하고 나머지는 바꿔줘',c,c.conditions,catalogue.slice(4));
 const result=apply(decision,c);assert.equal(result.course.places[1].id,'p1');assert.ok(result.course.places.filter(p=>p.id!=='p1').every(p=>!['p0','p2','p3'].includes(p.id)));
});
test('model receives numbered itinerary, constraints, known candidates and strict operation schema',async()=>{
 let payload;
 const api=createConnections({OPENAI_API_KEY:'test'},async(url,options)=>{payload=JSON.parse(options.body);return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({...decide([step('keep','p1')]),...normalize({}),message:'두 번째 장소를 유지할게요'})}]}]}));});
 const course=makeCourse();const result=await api.interpret('두 번째 장소 유지',course.conditions,[],{course,catalogue:catalogue.slice(4),memory:planningMemory({},course)});
 assert.equal(result.operation,'edit');assert.equal(result.steps[0].targetId,'p1');assert.equal(JSON.parse(payload.input).currentCourse.places[1].id,'p1');assert.equal(payload.text.format.schema.properties.steps.items.additionalProperties,false);assert.match(payload.instructions,/Preserve unmentioned stops/);
});
test('HTTP conversation can keep, replace, conflict and recover using persisted planning state',async t=>{
 const connections={...memoryConnections(),publicConfig:()=>({auth:true,ai:true,places:true}),searchPlaces:async()=>catalogue.slice(4),interpret:async(message,conditions,history,context)=>{
  assert.ok(context.course);assert.ok(context.memory);
  if(message==='고정')return {...decide([step('keep','p1')]),conditions};
  if(message==='예산')return {...decide([]),conditions:{...conditions,budget:16000}};
  return {...decide([step('remove','p2')]),conditions};
 }};
 const server=createApp({env:{},connections});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`;let cookie;
 const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 cookie=(await post('/api/auth/login',{email:'a@example.com',password:'12345678'})).headers.get('set-cookie').split(';')[0];
 const course=makeCourse();const first=await post('/api/chat',{message:'고정',conditions:course.conditions,currentCourse:course}).then(r=>r.json());assert.deepEqual(first.memory.lockedPlaceIds,['p1']);
 await post('/api/workspace',{workspace:{course,planningMemory:first.memory}});const workspace=await fetch(base+'/api/account',{headers:{Cookie:cookie}}).then(r=>r.json());assert.deepEqual(workspace.workspace.planningMemory.lockedPlaceIds,['p1']);
 const budget=await post('/api/chat',{message:'예산',conditions:course.conditions,currentCourse:course,memory:first.memory}).then(r=>r.json());assert.equal(budget.course,null);assert.equal(budget.memory.pendingConditions.budget,16000);
 const recovered=await post('/api/chat',{message:'식당 삭제',conditions:course.conditions,currentCourse:course,memory:budget.memory}).then(r=>r.json());assert.equal(recovered.course.totalCost,15000);assert.deepEqual(recovered.memory.lockedPlaceIds,['p1']);
});

test('named-place search retrieves a real candidate before applying the model edit', async t=>{
 const course=makeCourse(); let searches=0,calls=0;
 const connections={...memoryConnections(),publicConfig:()=>({auth:true,ai:true,places:true}),searchPlaces:async(region,options)=>{if(options.query){searches++;assert.equal(options.query,'찾는 카페');return [catalogue[4]];}return [];},interpret:async(message,conditions,history,context)=>{
  calls++;return context.catalogue.length?{...decide([step('replace','p0',{placeId:'p4'})]),conditions}:{operation:'search',canPlan:true,searchQuery:'찾는 카페',message:'검색할게요',steps:[],conditions};
 }};
 const server=createApp({env:{},connections});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`;
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'a@example.com',password:'12345678'})});
 const response=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0]},body:JSON.stringify({message:'첫번째를 찾는 카페로 바꿔줘',conditions:course.conditions,currentCourse:course})}).then(r=>r.json());
 assert.equal(searches,1);assert.equal(calls,2);assert.equal(response.course.places[0].id,'p4');
});
