import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnections } from '../lib/connections.mjs';
import { createApp } from '../server.mjs';
import { normalize } from '../lib/planner.mjs';
const destination = {id:'kakao-star',name:'스타필드 고양',region:'경기 고양시 덕양구',address:'경기 고양시 덕양구 고양대로 1955',lat:37.646,lng:126.894,sourceUrl:'https://place.map.kakao.com/123'};

test('global online lookup finds malls without prefixing the previous neighborhood',async()=>{
  let query;
  const api=createConnections({KAKAO_REST_API_KEY:'test'},async url=>{
    query=new URL(url).searchParams.get('query');
    return new Response(JSON.stringify({documents:[{id:'star',place_name:'스타필드 고양',address_name:'경기 고양시 덕양구 동산동 370',road_address_name:destination.address,x:'126.894',y:'37.646',category_group_code:'MT1',place_url:destination.sourceUrl},{id:'tenant',place_name:'카페 스타필드 고양점',address_name:'경기 고양시 덕양구 동산동 370',x:'126.894',y:'37.646'}]}));
  });
  const found=await api.resolveDestination('고양 스타필드');
  assert.equal(query,'고양 스타필드'); assert.equal(found.length,1);
  assert.equal(found[0].region,'경기 고양시 덕양구'); assert.equal(found[0].lat,37.646);
});

test('nearby search uses verified coordinates, radius and distance sorting',async()=>{
  const urls=[];
  const api=createConnections({KAKAO_REST_API_KEY:'test'},async url=>{
    urls.push(new URL(url));return new Response(JSON.stringify({documents:[{id:String(urls.length),place_name:'주변 장소',x:'126.895',y:'37.647',address_name:destination.address}]}));
  });
  await api.searchPlaces(destination.region,{center:destination});
  assert.equal(urls.length,4);
  assert.ok(urls.every(u=>u.searchParams.get('x')==='126.894' && u.searchParams.get('y')==='37.646' && u.searchParams.get('radius')==='3000' && u.searchParams.get('sort')==='distance'));
  assert.ok(urls.every(u=>!u.searchParams.get('query').includes('성수')));
});

for (const ambiguous of [false,true]) test(`destination question and answer create a course near its verified location (ambiguous=${ambiguous})`,async t=>{
  let searchedCenter;
  const connections={publicConfig:()=>({auth:true,ai:true,places:true}),auth:async()=>({access_token:'a',refresh_token:'r',user:{id:'u'}}),
    resolveDestination:async()=>ambiguous?[destination,{...destination,id:'other',name:'스타필드 하남',region:'경기 하남시',address:'경기 하남시 미사대로',lat:37.54,lng:127.22}]:[destination],
    interpret:async(message,current)=>({message:'조건 반영',canPlan:false,destinationQuery:message==='고양 스타필드'?'고양 스타필드':null,conditions:normalize({...current,...(message.includes('6시간')?{duration:360,budget:30000}: {})})}),
    searchPlaces:async(region,options)=>{searchedCenter=options.center;return Array.from({length:6},(_,i)=>({id:'p'+i,name:'주변'+i,region,category:i%2?'문화':'카페',cost:3000,stay:40,environment:'실내',mood:'여유로운',lat:destination.lat+i/10000,lng:destination.lng,demo:false}));}};
  const server=createApp({env:{},connections});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'test@example.com',password:'12345678'})});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const post=async body=>{const r=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
  let first=await post({message:'고양 스타필드',conditions:{region:'성수'}});
  assert.equal(first.course,null);
  if(ambiguous){assert.match(first.message,/번호/);first=await post({message:'1번',conditions:{region:'성수'},memory:first.memory});}
  assert.match(first.message,/1955/);assert.match(first.message,/예산/);
  const answer=await post({message:'데이트 6시간 1인 3만원',conditions:first.conditions,memory:first.memory});
  assert.ok(answer.course);assert.equal(answer.course.conditions.region,destination.region);
  assert.equal(answer.course.conditions.duration,360);assert.equal(answer.course.conditions.budget,30000);
  assert.deepEqual(searchedCenter,{lat:destination.lat,lng:destination.lng});assert.equal(answer.memory.pendingConditions,null);
});
