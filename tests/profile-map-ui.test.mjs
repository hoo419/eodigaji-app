import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/init\(\);\s*$/, '');
function harness() {
 const handlers = {};
 const node = { addEventListener() {}, setAttribute() {} };
 class Img {
  constructor(owned) { this.owned = owned; this.className = ''; this.replaced = false; }
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
 h.handlers.error({ target: photo }); assert.equal(photo.replaced, true);
});
