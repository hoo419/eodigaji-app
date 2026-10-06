// 웹 화면과 API를 함께 제공하는 Node.js 서버입니다. npm start로 실행합니다.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { places, planCourse, parseMessage } from './lib/planner.mjs';
import { createConnections } from './lib/connections.mjs';
import { createSessions } from './lib/sessions.mjs';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const assets = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/styles.css': ['styles.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'], '/icons.js': ['icons.js', 'text/javascript'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
assets['/live-map.js'] = ['live-map.js', 'text/javascript'];
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
// JSON 객체만 받고 본문을 16KB로 제한해 잘못되거나 과도한 요청을 거릅니다.
async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('JSON 형식으로 요청해 주세요.');
  let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 16384) throw new Error('요청이 너무 길어요.'); }
  let value; try { value = JSON.parse(body); } catch { throw new Error('요청 내용을 읽을 수 없어요.'); }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('올바른 조건을 입력해 주세요.');
  return value;
}
// 연결 객체를 외부에서 주입할 수 있어 테스트에서는 실제 유료 API를 호출하지 않습니다.
export function createApp({ env = process.env, connections = createConnections(env) } = {}) {
  const origin = env.APP_ORIGIN || 'http://127.0.0.1:4173';
  const live = env.APP_MODE === 'live';
  const allowedOrigins = new Set([origin, ...(!live ? ['http://localhost:4173'] : []), ...(env.APP_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)]);
  const sessions = createSessions(connections, origin);
  // 호출 제한은 이 프로세스의 메모리에만 유지됩니다. 재시작하면 초기화됩니다.
  const rates = new Map(); let day = '', aiCount = 0;
  const status = connections.publicConfig();
  async function plan(input) { return planCourse(input, status.places ? await connections.searchPlaces(input.region || '성수') : places); }
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const url = new URL(req.url, 'http://localhost'); const path = url.pathname;
    try {
      if (path.startsWith('/api/') && req.headers.origin) {
        if (!allowedOrigins.has(req.headers.origin)) return json(res, 403, { error: '허용되지 않은 요청입니다.' });
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
      }
      if (path.startsWith('/api/') && req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.writeHead(204); return res.end();
      }
      // 설정 준비 여부입니다. 외부 서비스의 실제 인증 성공은 별도 연결 검사로 확인합니다.
      if (req.method === 'GET' && path === '/api/ready') {
        const missing = ['ai', 'places', 'map', 'auth'].filter(key => !status[key]);
        return json(res, missing.length ? 503 : 200, { ready: !missing.length, missing, check: 'configuration' });
      }
      if (live && ((['/api/plan', '/api/places'].includes(path) && !status.places) || (path === '/api/chat' && (!status.ai || !status.places)))) {
        return json(res, 503, { error: '서비스 연결 준비 중입니다. 잠시 후 다시 이용해 주세요.' });
      }
      if (path.startsWith('/api/') && req.method === 'POST') {
        const now = Date.now(); for (const [key, value] of rates) if (value.until < now) rates.delete(key);
        const key = `${req.socket.remoteAddress}:${path.startsWith('/api/auth/') ? 'auth' : 'api'}`;
        const limit = path.startsWith('/api/auth/') ? 10 : 30;
        const bucket = rates.get(key) || { count: 0, until: now + 60000 }; bucket.count++; rates.set(key, bucket);
        if (bucket.count > limit) return json(res, 429, { error: '요청이 많아요. 1분 후 다시 시도해 주세요.' });
      }
      if (req.method === 'GET' && path === '/api/health') return json(res, 200, { status: 'ok', mode: status.ai || status.places || status.auth ? 'configured' : 'demo' });
      if (req.method === 'GET' && path === '/api/config') return json(res, 200, status);
      if (req.method === 'GET' && path === '/api/places') return json(res, 200, status.places ? await connections.searchPlaces(url.searchParams.get('region') || '성수') : places);
      if (req.method === 'GET' && path === '/api/auth/user') return json(res, 200, { user: (await sessions.get(req))?.user || null });
      if (req.method === 'POST' && ['/api/auth/login', '/api/auth/signup'].includes(path)) {
        const data = await connections.auth(path.endsWith('signup') ? 'signup' : 'login', await readJson(req));
        if (!data.access_token) return json(res, 200, { user: null, message: '가입 요청을 처리했어요. 인증이 필요한 계정은 수신함과 스팸함을 확인해 주세요. 이미 인증한 이메일이라면 새 메일이 오지 않을 수 있으니 로그인해 주세요.' });
        return json(res, 200, { user: sessions.create(res, data), message: '로그인했어요.' });
      }
      if (req.method === 'POST' && path === '/api/auth/logout') { await readJson(req); await sessions.logout(req, res); return json(res, 200, { ok: true }); }
      // 데이터 소유자는 요청 본문이 아닌 검증된 로그인 세션에서 결정합니다.
      if (path === '/api/account' || path === '/api/profile' || path === '/api/saved') {
        const session = await sessions.get(req); if (!session) return json(res, 401, { error: '로그인이 필요해요.' });
        const user = encodeURIComponent(session.user.id), q = `?user_id=eq.${user}`;
        if (req.method === 'GET' && path === '/api/account') {
          const [profile, saved] = await Promise.all([connections.database('profiles', 'GET', session.token, q), connections.database('saved_courses', 'GET', session.token, q + '&order=created_at.desc')]);
          return json(res, 200, { user: session.user, profile: profile[0]?.data || null, saved: saved.map(row => row.data) });
        }
        if (req.method === 'POST' && path === '/api/profile') {
          const body = await readJson(req); const p = body.profile;
          if (!p || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 20) throw new Error('프로필 이름을 확인해 주세요.');
          const clean = { name: p.name.trim(), age: String(p.age || '').slice(0, 3), gender: String(p.gender || '').slice(0, 20), personality: String(p.personality || '').slice(0, 30), mbti: String(p.mbti || '').slice(0, 4), interests: Array.isArray(p.interests) ? p.interests.filter(v => typeof v === 'string').slice(0, 6).map(v => v.slice(0, 20)) : [], location: String(p.location || '').slice(0, 100) };
          await connections.database('profiles', 'POST', session.token, '?on_conflict=user_id', { user_id: session.user.id, data: clean, updated_at: new Date().toISOString() });
          return json(res, 200, { profile: clean });
        }
        if (req.method === 'POST' && path === '/api/saved') {
          const body = await readJson(req);
          if (body.remove) { if (typeof body.remove !== 'string' || body.remove.length > 100) throw new Error('코스를 확인해 주세요.'); await connections.database('saved_courses', 'DELETE', session.token, q + `&course_id=eq.${encodeURIComponent(body.remove)}`); }
          else { const c = body.course; if (!c || typeof c.id !== 'string' || c.id.length > 100 || typeof c.title !== 'string' || c.title.length > 200 || !Array.isArray(c.places) || c.places.length > 12 || !c.conditions) throw new Error('저장할 코스 정보가 올바르지 않아요.'); await connections.database('saved_courses', 'POST', session.token, '?on_conflict=user_id,course_id', { user_id: session.user.id, course_id: c.id, data: c }); }
          return json(res, 200, { ok: true });
        }
        return json(res, 405, { error: '지원하지 않는 요청입니다.' });
      }
      if (req.method === 'POST' && path === '/api/plan') return json(res, 200, await plan(await readJson(req)));
      if (req.method === 'POST' && path === '/api/chat') {
        const { message, conditions = {}, history = [] } = await readJson(req);
        if (typeof message !== 'string' || !message.trim() || message.length > 1500) throw new Error('메시지는 1~1500자로 입력해 주세요.');
        if (!conditions || Array.isArray(conditions) || typeof conditions !== 'object') throw new Error('조건을 확인해 주세요.');
        if (status.ai) {
          const today = new Date().toISOString().slice(0, 10); if (day !== today) { day = today; aiCount = 0; }
          if (aiCount >= Number(env.AI_DAILY_LIMIT || 100)) return json(res, 429, { error: '오늘 설정한 AI 요청 한도에 도달했어요. 내일 다시 이용해 주세요.' });
          if (!Array.isArray(history) || history.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.text !== 'string')) throw new Error('대화 내역을 확인해 주세요.');
          aiCount++;
          const reply = await connections.interpret(message, conditions, history);
          return json(res, 200, { message: reply.message, course: reply.canPlan ? await plan(reply.conditions) : null, provider: status.aiProvider });
        }
        // AI 키가 없을 때는 정규식 기반 체험 모드이며 실제 AI 응답이 아닙니다.
        const parsed = parseMessage(message, conditions);
        if (!parsed.understood.length) return json(res, 200, { message: '현재는 샘플 대화 체험이에요. “성수에서 실내로, 1인 3만원”처럼 지역·실내외·예산·시간·분위기·이동수단을 알려 주세요.', course: null });
        const course = await plan(parsed.conditions);
        return json(res, 200, { message: `${parsed.understood.join(', ')} 조건을 반영했어요. ${course.places.length}곳을 연결해 ${Math.floor(course.minutes / 60)}시간 ${course.minutes % 60}분, 1인 약 ${course.totalCost.toLocaleString('ko-KR')}원의 샘플 코스를 준비했어요.`, course });
      }
      if (req.method !== 'GET') return json(res, 405, { error: '지원하지 않는 요청입니다.' });
      // 등록된 정적 파일만 제공하므로 임의 경로의 .env나 서버 코드를 내려주지 않습니다.
      const asset = assets[path]; if (!asset) return json(res, 404, { error: '페이지를 찾을 수 없어요.' });
      const file = await readFile(resolve(publicDir, asset[0]));
      res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8`, 'Cache-Control': 'no-cache' }); res.end(file);
    } catch (error) { json(res, error.code === 'ENOENT' ? 404 : 400, { error: error.code === 'ENOENT' ? '페이지를 찾을 수 없어요.' : error.message }); }
  });
}
// 직접 실행할 때만 환경 파일을 읽고 포트를 엽니다. 테스트에서 import해도 서버가 자동 실행되지 않습니다.
// 현재는 PC 내부 주소에만 바인딩하며 프로세스 종료 후 자동 재시작하는 기능은 없습니다.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url))); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '127.0.0.1';
  const server = createApp().listen(port, host, () => console.log(`어디가지 베타: http://${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
