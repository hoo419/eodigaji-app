// 키나 토큰을 출력하지 않고 외부 서비스 연결을 확인합니다. AI 검사는 --ai로 명시합니다.
import { loadEnvFile } from 'node:process';
import { createConnections } from '../lib/connections.mjs';
try { loadEnvFile(); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const api = createConnections();
const config = api.publicConfig();
let failed = false;
async function check(label, ready, action) {
  if (!ready) { console.log(`${label}: 설정 필요`); failed = true; return; }
  try { console.log(`${label}: ${await action()}`); }
  catch { console.log(`${label}: 연결 실패 — 키·권한·한도·네트워크를 확인하세요.`); failed = true; }
}
await check('카카오 장소', config.places, async () => `${(await api.searchPlaces('성수')).length}곳 조회 성공`);
console.log(`카카오 지도: ${config.map ? '키 설정됨 — 브라우저 표시 확인 필요' : '설정 필요'}`);
if (process.argv.includes('--ai')) await check('AI', config.ai, async () => {
  const result = await api.interpret('성수에서 실내 데이트, 1인 3만원으로 계획해 줘', {});
  if (!result.canPlan || result.conditions.budget !== 30000 || result.conditions.environment !== '실내') throw new Error('Invalid interpretation');
  return '조건 추출 성공';
});
else console.log(`AI: ${config.ai ? '키 설정됨' : '설정 필요'} — 실제 요청 검사는 --ai 사용`);
await check('Supabase', config.auth, async () => {
  const base = new URL(process.env.SUPABASE_URL);
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.supabase.co')) throw new Error('Invalid URL');
  const response = await fetch(new URL('/auth/v1/settings', base), { headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Auth settings failed');
  return '인증 서비스 연결 성공 — DB 스키마와 사용자별 저장은 별도 확인 필요';
});
process.exitCode = failed ? 1 : 0;
