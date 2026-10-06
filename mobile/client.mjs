import { places, planCourse, parseMessage } from '../lib/planner.mjs';

// 빈 주소는 오프라인 체험을 뜻합니다. 실제 서버는 경로·인증정보 없는 HTTPS origin만 허용합니다.
export function validateServerUrl(value = '') {
  if (!value.trim()) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('앱 서버 주소는 인증정보·경로가 없는 HTTPS 주소여야 합니다.');
  return url.origin;
}
// 웹과 같은 API 형태를 제공해 화면 코드를 공유합니다. 서버 설정이 없으면 APK 안에서 계산합니다.
export function createMobileClient({ apiBase = '', request } = {}) {
  const base = validateServerUrl(apiBase);
  return async (path, body) => {
    if (!/^\/api\/[a-z/?=&_-]+$/.test(path)) throw new Error('지원하지 않는 API 경로입니다.');
    // 서버 연결 실패를 샘플 성공으로 바꾸지 않고 오류를 그대로 화면에 알립니다.
    if (base) {
      let response;
      try { response = await request({ url: base + path, method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { data: body }), connectTimeout: 15000, readTimeout: 45000 }); }
      catch { throw new Error('서버에 연결하지 못했어요. 인터넷 연결과 서버 주소를 확인해 주세요.'); }
      let data = response.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch { throw new Error('서버 응답을 읽지 못했어요.'); } }
      if (response.status < 200 || response.status >= 300) throw new Error(data?.error || '서버 요청에 실패했어요.');
      return data;
    }
    if (path === '/api/config') return { ai: false, aiProvider: 'gemini', places: false, map: false, mapKey: '', auth: false, offline: true };
    if (path === '/api/health') return { status: 'ok', mode: 'offline-demo' };
    if (path === '/api/places') return places;
    if (path === '/api/auth/user') return { user: null };
    if (path === '/api/plan') return planCourse(body || {});
    if (path === '/api/chat') {
      if (typeof body?.message !== 'string' || !body.message.trim() || body.message.length > 1500) throw new Error('메시지는 1~1500자로 입력해 주세요.');
      const parsed = parseMessage(body.message, body.conditions || {});
      if (!parsed.understood.length) return { message: '오프라인 체험 중이에요. “성수에서 실내로, 1인 3만원”처럼 지역·예산·분위기를 알려 주세요.', course: null };
      const course = planCourse(parsed.conditions);
      return { message: `${parsed.understood.join(', ')} 조건으로 ${course.places.length}곳의 샘플 코스를 준비했어요. 서버 없이 앱에서 만든 체험 코스입니다.`, course };
    }
    throw new Error('실제 회원 서비스는 앱 서버를 연결한 후 이용할 수 있어요.');
  };
}
