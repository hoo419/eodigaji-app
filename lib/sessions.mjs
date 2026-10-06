import { randomBytes } from 'node:crypto';
// 외부 인증 토큰은 서버에 보관하고 클라이언트에는 무작위 세션 ID만 쿠키로 전달합니다.
// 메모리 저장 방식이므로 서버 재시작 시 로그인 세션은 사라집니다.
export function createSessions(connections, origin) {
  const sessions = new Map();
  const flags = `Path=/; HttpOnly; SameSite=Strict${origin.startsWith('https:') ? '; Secure' : ''}`;
  const cookieId = req => req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('eodigaji_session='))?.slice(17);
  function create(res, data) {
    const now = Date.now(); for (const [id, value] of sessions) if (value.until < now) sessions.delete(id);
    if (sessions.size >= 1000) throw new Error('로그인 접속이 많아요. 잠시 후 다시 시도해 주세요.');
    const id = randomBytes(32).toString('hex');
    if (!data.access_token || !data.refresh_token || !data.user?.id) throw new Error('인증 세션을 확인하지 못했어요.');
    sessions.set(id, { token: data.access_token, refresh: data.refresh_token, user: { id: data.user.id, email: data.user.email }, expires: now + (data.expires_in || 3600) * 1000, until: now + 7 * 86400000 });
    res.setHeader('Set-Cookie', `eodigaji_session=${id}; ${flags}; Max-Age=604800`);
    return { id: data.user.id, email: data.user.email };
  }
  async function get(req) {
    const id = cookieId(req); const session = sessions.get(id);
    if (!session || session.until < Date.now()) { sessions.delete(id); return null; }
    // 토큰 만료 1분 전부터 갱신하며 실패하면 재로그인을 요구하도록 세션을 제거합니다.
    if (session.expires < Date.now() + 60000) {
      try { const d = await connections.auth('refresh', { refresh_token: session.refresh }); session.token = d.access_token; session.refresh = d.refresh_token; session.expires = Date.now() + (d.expires_in || 3600) * 1000; if (!session.token) throw new Error(); }
      catch { sessions.delete(id); return null; }
    }
    return session;
  }
  async function logout(req, res) {
    const id = cookieId(req); const session = sessions.get(id); sessions.delete(id);
    res.setHeader('Set-Cookie', `eodigaji_session=; ${flags}; Max-Age=0`);
    if (session) await connections.auth('logout', { token: session.token });
  }
  return { create, get, logout };
}
