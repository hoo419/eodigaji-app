import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { validateItinerary } from '../lib/conversation-planner.mjs';
import { normalize } from '../lib/planner.mjs';
import { memoryConnections } from './helpers/memory-connections.mjs';
const require=createRequire(import.meta.url);const {chromium}=require(`${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
const catalogue=Array.from({length:10},(_,i)=>({id:`p${i}`,name:`테스트 카페 ${i+1}`,category:'카페',cost:5000,stay:30,region:'성수',environment:'실내',demo:true,x:10+i,y:20+i}));
const original=validateItinerary({id:'conversation-course',title:'대화로 만드는 하루',places:catalogue.slice(0,4)},normalize({duration:360}));
const step=(type,targetId=null,extra={})=>({type,targetId,placeId:null,afterId:null,minutes:null,...extra});
const connections={...memoryConnections(),publicConfig:()=>({auth:true,ai:true,aiProvider:'test',places:true,map:false}),searchPlaces:async()=>catalogue.slice(4),interpret:async(message,conditions,history,context)=>{
 assert.ok(context.course);const steps=/삭제/.test(message)?[step('remove','p1')]:[step('keep','p1'),step('replace','p0',{placeId:'p4'}),step('replace','p2',{placeId:'p5'}),step('replace','p3',{placeId:'p6'})];
 return {operation:'edit',canPlan:true,message:'두 번째 카페를 유지하며 코스를 수정할게요.',conditions,steps,preferences:['조용한 곳 선호']};
}};
const server=createApp({env:{APP_ORIGIN:'http://127.0.0.1:4200'},connections});await new Promise(r=>server.listen(4200,'127.0.0.1',r));const base='http://127.0.0.1:4200';
const post=(path,body,cookie)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
const login=await post('/api/auth/login',{email:'conversation@example.com',password:'12345678'});const cookie=login.headers.get('set-cookie').split(';')[0];
await post('/api/profile',{profile:{name:'코스 편집자'}},cookie);await post('/api/saved',{course:original},cookie);await post('/api/workspace',{workspace:{course:original}},cookie);
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route(/https:\/\//,route=>route.abort());const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function signIn(){await page.locator('dialog[open] #auth-form').waitFor();await page.locator('[name=email]').fill('conversation@example.com');await page.locator('[name=password]').fill('12345678');await page.locator('[form=auth-form]').click();await page.locator('.shell').waitFor();}
 async function chat(text){await page.locator('#chat-input').fill(text);const response=page.waitForResponse(r=>r.url().endsWith('/api/chat'));await page.locator('#chat-form').evaluate(f=>f.requestSubmit());const result=await(await response).json();await page.waitForFunction(()=>!document.querySelector('#chat-input').disabled);return result;}
 await page.goto(base);await signIn();await page.locator('[data-action=nav][data-tab=saved]').click();await page.getByRole('button',{name:'코스 다시 보기',exact:true}).click();await page.getByRole('button',{name:'대화로 코스 수정',exact:true}).click();
 const first=await chat('두 번째 카페는 유지하고 나머지는 바꿔줘');assert.deepEqual(first.course.places.map(p=>p.id),['p4','p1','p5','p6']);await page.locator('.conversation-context ol>li').filter({hasText:'테스트 카페 2'}).getByText('유지',{exact:true}).waitFor();
 await page.getByRole('button',{name:'직전 변경 되돌리기',exact:true}).click();assert.ok((await page.locator('.conversation-context ol').innerText()).includes('테스트 카페 1'));
 await chat('두 번째 카페는 유지하고 나머지는 바꿔줘');await page.getByRole('button',{name:'변경사항 저장',exact:true}).click();
 const saved=await context.request.get(base+'/api/account').then(r=>r.json());assert.equal(saved.saved.length,1);assert.equal(saved.saved[0].revision,1);assert.deepEqual(saved.saved[0].places.map(p=>p.id),['p4','p1','p5','p6']);
 const conflict=await chat('고정한 두 번째 장소 삭제해줘');assert.equal(conflict.course,null);assert.match(conflict.message,/유지/);assert.equal(await page.locator('.conversation-context ol>li').count(),4);
 await page.screenshot({path:'artifacts/conversation-planner-desktop.png',fullPage:true});
 await page.locator('[data-action=logout]').first().click();await signIn();await page.getByRole('button',{name:'AI와 계획하기',exact:true}).click();await page.locator('.conversation-context ol>li').filter({hasText:'테스트 카페 2'}).getByText('유지',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);await page.screenshot({path:'artifacts/conversation-planner-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS: current-course dialogue, keep/replace, undo, explicit saved-course update, lock conflict, relogin memory, mobile layout');
} finally {await browser.close();await new Promise(r=>server.close(r));}
