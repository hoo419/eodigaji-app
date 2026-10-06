import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnections } from '../lib/connections.mjs';

test('public config cannot expose provider secrets', () => {
  const api = createConnections({ OPENAI_API_KEY: 'secret-ai', KAKAO_REST_API_KEY: 'secret-rest', KAKAO_JAVASCRIPT_KEY: 'public-map' });
  const config = api.publicConfig();
  assert.equal(config.ai, true); assert.equal(config.mapKey, 'public-map');
  assert.ok(!JSON.stringify(config).includes('secret-'));
});
test('missing keys fail explicitly without network requests', async () => {
  const api = createConnections({}, () => { throw new Error('unexpected network'); });
  await assert.rejects(api.interpret('실내', {}), /OpenAI/);
  await assert.rejects(api.searchPlaces('성수'), /카카오/);
  await assert.rejects(api.auth('login', { email: 'a@b.com', password: '12345678' }), /Supabase/);
});
test('AI accepts only validated condition fields and refusal is not a plan', async () => {
  let request;
  const api = createConnections({ OPENAI_API_KEY: 'test', OPENAI_MODEL: 'test-model' }, async (url, options) => {
    request = JSON.parse(options.body);
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ message: '실내로 준비할게요', region: '성수', environment: '실내', budget: 30000, duration: 180, start: '14:00', mood: '여유로운', transport: '도보', purpose: '데이트', canPlan: true }) }] }] }));
  });
  const result = await api.interpret('실내로', {});
  assert.equal(result.conditions.environment, '실내');
  assert.equal(result.conditions.budget, 30000);
  assert.equal(request.store, false);
  const refused = createConnections({ OPENAI_API_KEY: 'test' }, async () => new Response(JSON.stringify({ output: [{ content: [{ type: 'refusal', refusal: 'no' }] }] })));
  await assert.rejects(refused.interpret('x', {}), /응답/);
});
test('provider error bodies with credentials are never forwarded to users', async () => {
  const api = createConnections({ OPENAI_API_KEY: 'secret-test' }, async () => new Response('secret-test', { status: 401 }));
  await assert.rejects(api.interpret('x', {}), e => /인증/.test(e.message) && !e.message.includes('secret-test'));
});

test('email delivery limits are explained without exposing upstream details', async () => {
  const api = createConnections({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public' }, async () => new Response(JSON.stringify({ code: 'over_email_send_rate_limit', message: 'private upstream details' }), { status: 429 }));
  await assert.rejects(api.auth('signup', { email: 'test@example.com', password: '12345678' }), e => /메일 발송 한도/.test(e.message) && !e.message.includes('private'));
});

test('Supabase REST error_code distinguishes login and email confirmation failures', async () => {
  for (const [code, pattern] of [['invalid_credentials', /비밀번호/], ['email_not_confirmed', /인증이 아직/]]) {
    const api = createConnections({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public' }, async () => new Response(JSON.stringify({ code: 400, error_code: code, msg: 'private details' }), { status: 400 }));
    await assert.rejects(api.auth('login', { email: 'test@example.com', password: '12345678' }), e => pattern.test(e.message) && !e.message.includes('private'));
  }
});
test('real place data preserves coordinates and marks estimates', async () => {
  const api = createConnections({ KAKAO_REST_API_KEY: 'test' }, async url => {
    const category = new URL(url).searchParams.get('query');
    return new Response(JSON.stringify({ documents: [{ id: category, place_name: '실제 장소', x: '127.04', y: '37.54', road_address_name: '서울 성동구', category_name: '음식점', place_url: 'http://place.map.kakao.com/1' }] }));
  });
  const places = await api.searchPlaces('성수');
  assert.ok(places.length); assert.equal(places[0].lat, 37.54); assert.equal(places[0].lng, 127.04);
  assert.equal(places[0].demo, false); assert.equal(places[0].estimated, true);
});

test('regional searches preserve the requested city without adding Seoul', async () => {
  const queries = [];
  const api = createConnections({ KAKAO_REST_API_KEY: 'test' }, async url => {
    const query = new URL(url).searchParams.get('query'); queries.push(query);
    return new Response(JSON.stringify({ documents: [{ id: query, place_name: '지역 장소', x: '129.16', y: '35.16' }] }));
  });
  const places = await api.searchPlaces('부산 해운대');
  assert.equal(queries.length, 4);
  assert.ok(queries.every(query => query.startsWith('부산 해운대 ') && !query.includes('서울')));
  assert.ok(places.every(place => place.region === '부산 해운대'));
});
test('Gemini uses header authentication and validates generated conditions', async () => {
  let observed;
  const api = createConnections({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'gemini-secret' }, async (url, options) => {
    observed = { url, options };
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ ...{ region: '성수', purpose: '데이트', budget: 30000, duration: 180, start: '14:00', environment: '실내', mood: '여유로운', transport: '도보' }, message: '실내로 계획할게요.', canPlan: true }) }] } }] }));
  });
  const result = await api.interpret('실내로', {});
  assert.equal(result.conditions.environment, '실내');
  assert.equal(observed.options.headers['x-goog-api-key'], 'gemini-secret');
  assert.ok(!observed.url.includes('gemini-secret'));
});
test('Supabase secret keys cannot be used as public anon credentials', async () => {
  const api = createConnections({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_secret_do-not-use' }, async () => { throw new Error('network must not run'); });
  await assert.rejects(api.auth('login', { email: 'a@b.com', password: '12345678' }), /공개 키/);
});

test('signup explicitly returns email confirmations to the configured app origin', async () => {
  let observed;
  const api = createConnections({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key', APP_ORIGIN: 'http://127.0.0.1:4173' }, async url => {
    observed = new URL(url); return new Response(JSON.stringify({ user: { id: 'pending' } }));
  });
  await api.auth('signup', { email: 'test@example.com', password: '12345678' });
  assert.equal(observed.pathname, '/auth/v1/signup');
  assert.equal(observed.searchParams.get('redirect_to'), 'http://127.0.0.1:4173/');
});

test('Gemini retries temporary 503 errors and returns validated conditions', async () => {
  let attempts = 0;
  const api = createConnections({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'secret' }, async () => {
    attempts++;
    if (attempts === 1) return new Response('{}', { status: 503 });
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ message: '실내로 준비할게요', canPlan: true, environment: '실내' }) }] } }] }));
  });
  assert.equal((await api.interpret('실내', {})).conditions.environment, '실내');
  assert.equal(attempts, 2);
});
test('Gemini stops after three temporary failures without exposing upstream content', async () => {
  let attempts = 0;
  const api = createConnections({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'secret' }, async () => { attempts++; return new Response('private upstream details', { status: 503 }); });
  await assert.rejects(api.interpret('실내', {}), e => /일시적/.test(e.message) && !e.message.includes('private'));
  assert.equal(attempts, 3);
});
