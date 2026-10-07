import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute the actual UI handlers; only browser DOM and external API are substituted.
function app({ logoutFails = false } = {}) {
  const handlers = {};
  const node = { addEventListener() {}, close() {}, classList: { add() {}, remove() {} } };
  const context = vm.createContext({
    document: { querySelector: () => node, addEventListener: (name, fn) => (handlers[name] ??= []).push(fn) },
    window: { addEventListener() {}, location: { hash: '' } },
    localStorage: { getItem: key => key.endsWith('.profile') ? '{"name":"Old guest"}' : '[]' },
    URLSearchParams, setTimeout: () => 0, clearTimeout() {},
    icon: () => '',
    request: async path => {
      if (path === '/api/auth/logout' && logoutFails) throw new Error('Logout unavailable');
      return ({ '/api/config': { auth: true }, '/api/places': [], '/api/plan': { conditions: {} }, '/api/auth/user': { user: null } })[path] ?? {};
    },
  });
  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/init\(\);\s*$/, '');
  vm.runInContext(source + '\napi = request; render = () => {};', context);
  return {
    run: code => vm.runInContext(code, context),
    logout: () => handlers.click[0]({ target: { closest: () => ({ dataset: { action: 'logout' } }) } }),
  };
}

test('logout hides the profile instead of restoring an old guest profile', async () => {
  const ui = app();
  ui.run('state.user = { id: "member" }; state.profile = { name: "Member" }; state.saved = [{ id: "private" }];');
  await ui.logout();
  assert.equal(ui.run('state.user'), null);
  assert.equal(ui.run('state.profile'), null);
  assert.equal(ui.run('state.saved.length'), 0);
});

test('failed logout keeps the account visible rather than claiming success', async () => {
  const ui = app({ logoutFails: true });
  ui.run('state.user = { id: "member" }; state.profile = { name: "Member" };');
  await ui.logout();
  assert.equal(ui.run('state.user?.id'), 'member');
  assert.equal(ui.run('state.profile?.name'), 'Member');
});

test('reload without a session does not show the old guest profile in online mode', async () => {
  const ui = app();
  await ui.run('init()');
  assert.equal(ui.run('state.profile'), null);
  assert.equal(ui.run('state.saved.length'), 0);
});
