import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/init\(\);\s*$/, '');
function harness() {
 const handlers = {};
 const node = { addEventListener() {}, setAttribute() {} };
 class Img {
  constructor(owned) { this.owned = owned; this.className = ''; this.replaced = false; this.attributes = new Set(); }
  hasAttribute(key) { return this.attributes.has(key); }
  setAttribute(key) { this.attributes.add(key); }
  matches() { return this.owned; }
  replaceWith() { this.replaced = true; }
 }
 const context = vm.createContext({ document: { querySelector: () => node, createElement: () => ({...node}), addEventListener: (key, fn) => { handlers[key] = fn; } }, window: { addEventListener() {} }, localStorage: { getItem: () => null }, icon: () => '', HTMLImageElement: Img });
 vm.runInContext(source, context);
 return { handlers, Img, context };
}
test('Kakao tile errors leave SDK-managed images intact', () => {
 const h = harness(); const tile = new h.Img(false);
 h.handlers.error({ target: tile }); assert.equal(tile.replaced, false);
});
test('app-owned photo errors still show a fallback', () => {
 const h = harness(); const photo = new h.Img(true);
 h.handlers.error({ target: photo }); assert.equal(photo.src, './place-example.svg'); assert.equal(photo.replaced, false);
 h.handlers.error({ target: photo }); assert.equal(photo.replaced, true);
});

test('travel selection shows party input and date selection hides it',()=>{
 const h=harness(), input={disabled:true}, field={hidden:true,querySelector:()=>input};
 const target={name:'purpose',value:'여행',form:{id:'conditions-form',querySelector:()=>field}};
 h.handlers.change({target});assert.equal(field.hidden,false);assert.equal(input.disabled,false);
 target.value='데이트';h.handlers.change({target});assert.equal(field.hidden,true);assert.equal(input.disabled,true);
});
test('travel summary displays party size and aggregate estimated cost',()=>{
 const h=harness();
 const html=vm.runInContext("groupSummary({conditions:{purpose:'여행',partySize:4},totalCost:19000})",h.context);
 assert.match(html,/4명/);assert.match(html,/76,000원/);
});
