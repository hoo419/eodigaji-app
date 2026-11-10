import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { memoryConnections } from './helpers/memory-connections.mjs';
const require=createRequire(import.meta.url);const {chromium}=require(`${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);
const server=createApp({env:{APP_ORIGIN:'http://127.0.0.1:4201'},connections:memoryConnections()});await new Promise(r=>server.listen(4201,'127.0.0.1',r));const base='http://127.0.0.1:4201';
const identities=[{email:'isolation-a@example.com',name:'테스트사용자A'},{email:'isolation-b@example.com',name:'테스트사용자B'}];
for(const person of identities){const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:person.email,password:'test-password'})});await fetch(base+'/api/profile',{method:'POST',headers:{'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0]},body:JSON.stringify({profile:{name:person.name}})});}
const browser=await chromium.launch({headless:true,channel:'msedge'});const checks=[];
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route(/https:\/\//,r=>r.abort());const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function login(person){await page.locator('dialog[open] #auth-form').waitFor();await page.locator('[name=email]').fill(person.email);await page.locator('[name=password]').fill('test-password');await page.locator('[form=auth-form]').click();await page.locator('.shell').waitFor();}
 async function logout(){await page.locator('[data-action=logout]').first().click();await page.locator('dialog[open] #auth-form').waitFor();assert.equal(await page.locator('.shell').count(),0);}
 const account=()=>context.request.get(base+'/api/account').then(r=>r.json());
 await mkdir('artifacts',{recursive:true});await page.goto(base);await login(identities[0]);checks.push('A 로그인 성공');
 await page.getByRole('button',{name:'조건 변경',exact:true}).click();await page.locator('[name=region]').fill('연남');await page.locator('[name=budget]').fill('30000');await page.locator('[form=conditions-form]').click();await page.locator('dialog').waitFor({state:'hidden'});
 await page.locator('[data-action=choose-course]').first().click();await page.locator('.course-detail-grid').waitFor();assert.ok(await page.locator('.block-list .course-block').count()>=2);checks.push('A 연남/3만원 코스 생성 및 상세 동작');
 await page.getByRole('button',{name:'코스 저장',exact:true}).click();await page.getByRole('button',{name:'블록으로 수정',exact:true}).click();await page.locator('#editor-title').fill('A전용비공개코스');await page.locator('[data-block-field=note]').first().fill('A전용비공개메모');await page.getByRole('button',{name:'변경사항 저장',exact:true}).click();await page.locator('.course-detail-grid').waitFor();
 await page.getByRole('button',{name:'대화로 코스 수정',exact:true}).click();await page.locator('#chat-input').fill('두 번째 장소는 유지해줘');const response=page.waitForResponse(r=>r.url().endsWith('/api/chat'));await page.locator('#chat-form').evaluate(f=>f.requestSubmit());await response;await page.waitForFunction(()=>!document.querySelector('#chat-input').disabled);await page.locator('.conversation-context .tag').filter({hasText:'유지'}).waitFor();
 const savedA=await account();const aId=savedA.saved[0].id;assert.equal(savedA.saved[0].title,'A전용비공개코스');checks.push('A 코스 제목/메모 저장 및 대화로 장소 유지');await page.screenshot({path:'artifacts/account-isolation-a.png',fullPage:true});
 await logout();checks.push('A 로그아웃 후 로그인 팝업 및 본문 제거');
 await login(identities[1]);const firstB=await account();assert.equal(firstB.user.email,identities[1].email);assert.equal(firstB.saved.length,0);assert.equal(firstB.profile.name,identities[1].name);
 await page.locator('[data-action=nav][data-tab=saved]').click();await page.locator('.empty-state').waitFor();assert.equal(await page.locator('.course-card').count(),0);checks.push('B 저장 목록에 A 코스 없음');
 assert.equal((await page.locator('#app').innerText()).includes('A전용비공개'),false);
 await page.locator('.nav [data-action=nav][data-tab=explore]').click();assert.ok((await page.locator('.filters').innerText()).includes('성수'),'B에게 A의 연남 조건이 남아 있으면 안 됨');assert.ok((await page.locator('.filters').innerText()).includes('50,000'),'B에게 A의 3만원 예산이 남아 있으면 안 됨');
 await page.getByRole('button',{name:'AI와 계획하기',exact:true}).click();assert.equal((await page.locator('.messages').innerText()).includes('두 번째 장소는 유지해줘'),false);assert.equal(await page.locator('.conversation-context .tag').count(),0);assert.equal((await page.locator('#app').innerText()).includes('A전용비공개'),false);checks.push('B 조건/대화/고정 장소/메모에 A 정보 없음');
 await page.reload();await page.locator('.shell').waitFor();const reloadedB=await account();assert.equal(reloadedB.saved.length,0);assert.equal(JSON.stringify(reloadedB).includes(aId),false);assert.equal(JSON.stringify(reloadedB).includes('A전용비공개'),false);checks.push('B 새로고침 후에도 A 코스 ID/제목/메모 없음');await page.screenshot({path:'artifacts/account-isolation-b.png',fullPage:true});
 await page.locator('[data-action=choose-course]').first().click();await page.getByRole('button',{name:'코스 저장',exact:true}).click();const bSaved=await account();assert.equal(bSaved.saved.length,1);assert.notEqual(bSaved.saved[0].id,aId);checks.push('B 자신만의 코스 생성/저장');
 await logout();await login(identities[0]);const restoredA=await account();assert.equal(restoredA.saved.length,1);assert.equal(restoredA.saved[0].id,aId);assert.equal(restoredA.saved[0].title,'A전용비공개코스');assert.equal(restoredA.saved[0].places[0].note,'A전용비공개메모');assert.equal(restoredA.workspace.conditions.region,'연남');assert.ok(restoredA.workspace.planningMemory.lockedPlaceIds.length);assert.ok(restoredA.workspace.messages.some(m=>m.text==='두 번째 장소는 유지해줘'));assert.equal(restoredA.saved.some(c=>c.id===bSaved.saved[0].id),false);checks.push('A 재로그인 시 자신의 코스/메모/대화/조건/유지 정보 복원, B 코스 없음');
 let release; const gate = new Promise(r=>release=r); let intercepted; const arrived=new Promise(r=>intercepted=r);
 await page.route('**/api/chat',async route=>{const response=await route.fetch();intercepted();await gate;await route.fulfill({response});});
 await page.getByRole('button',{name:'AI와 계획하기',exact:true}).click();await page.locator('#chat-input').fill('첫 번째 장소는 유지해줘');await page.locator('#chat-form').evaluate(f=>f.requestSubmit());await arrived;
 await logout();await login(identities[1]);const delivered=page.waitForResponse(r=>r.url().endsWith('/api/chat'));release();await delivered;
 await page.getByRole('button',{name:'AI와 계획하기',exact:true}).click();
 assert.equal((await page.locator('.messages').innerText()).includes('첫 번째 장소는 유지해줘'),false);assert.equal((await page.locator('#app').innerText()).includes('A전용비공개'),false);const afterLateReply=await account();assert.equal(JSON.stringify(afterLateReply).includes(aId),false);checks.push('A의 지연된 대화 응답이 B 로그인 후 도착해도 B 화면/저장소에 섞이지 않음');
 assert.deepEqual(errors,[]);
 await writeFile('artifacts/account-isolation-result.json',JSON.stringify({result:'passed',scope:'local browser with test authentication and database double',checks},null,2));console.log(JSON.stringify({result:'passed',checks},null,2));
} catch(e){await writeFile('artifacts/account-isolation-result.json',JSON.stringify({result:'failed',checks,error:e.message},null,2));throw e;}
finally{await browser.close();await new Promise(r=>server.close(r));}
