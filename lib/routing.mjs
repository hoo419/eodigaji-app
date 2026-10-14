const modes = { '도보': 'walk', '대중교통': 'traffic', '자동차': 'car' };
const validPoint = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180;
const pointPath = p => `${encodeURIComponent(String(p.name || '장소').slice(0, 100))},${p.lat},${p.lng}`;
export function directionsLink(a, b, mode) {
  if (!validPoint(a) || !validPoint(b) || !modes[mode]) return '';
  return `https://map.kakao.com/link/by/${modes[mode]}/${pointPath(a)}/${pointPath(b)}`;
}
const safePath = points => (Array.isArray(points) ? points : []).filter(p => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90).map(([lng, lat]) => ({ lng, lat }));
export function createRouting(env = {}, request = fetch) {
  const cache = new Map();
  return async function courseRoutes(points, mode) {
    if (!Array.isArray(points) || points.length < 2 || points.length > 4 || !points.every(validPoint) || !modes[mode]) throw new Error('경로의 장소 좌표와 이동수단을 확인해 주세요.');
    const result = await Promise.all(points.slice(1).map(async (b, i) => {
      const a = points[i], link = directionsLink(a, b, mode);
      const key = JSON.stringify([mode, a.lat, a.lng, b.lat, b.lng]);
      const cached = cache.get(key);
      if (cached?.until > Date.now()) return { ...cached.value, link };
      let leg;
      try {
        if (!env.KAKAO_REST_API_KEY) throw new Error();
        const car = mode === '자동차';
        const url = new URL(car ? 'https://apis-navi.kakaomobility.com/v1/directions' : `https://dapi.kakao.com/v2/routing/${mode === '도보' ? 'walk' : 'publictraffic'}`);
        if (car) { url.searchParams.set('origin', `${a.lng},${a.lat}`); url.searchParams.set('destination', `${b.lng},${b.lat}`); url.searchParams.set('summary', 'false'); }
        else { for (const [key, value] of Object.entries({ start_x: a.lng, start_y: a.lat, end_x: b.lng, end_y: b.lat })) url.searchParams.set(key, String(value)); }
        const response = await request(url.href, { headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` }, signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error();
        const data = await response.json();
        let distance, seconds, segments;
        if (car) {
          const route = data.routes?.[0];
          if (route?.result_code !== 0) throw new Error();
          distance = route.summary?.distance; seconds = route.summary?.duration;
          segments = (route.sections || []).flatMap(section => (section.roads || []).map(road => {
            const pairs = []; for (let j = 0; j + 1 < (road.vertexes || []).length; j += 2) pairs.push([road.vertexes[j], road.vertexes[j + 1]]);
            return { mode: 'CAR', path: safePath(pairs), guidance: String(road.name || '') };
          }));
        } else {
          if (data.status !== 'OK') throw new Error();
          const route = mode === '도보' ? data.route : data.routes?.[0];
          distance = route?.properties?.totalDistance; seconds = route?.properties?.totalTime;
          const steps = mode === '도보' ? (route?.legs || []).flatMap(leg => leg.steps || []) : route?.steps || [];
          segments = steps.map(step => ({ mode: mode === '도보' ? 'WALKING' : String(step.properties?.type || 'WALKING'), path: safePath(step.path?.points), guidance: String(step.properties?.guidance || '').slice(0, 200) }));
        }
        segments = segments.filter(s => s.path.length >= 2);
        if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(seconds) || seconds < 0 || !segments.length || segments.reduce((n, s) => n + s.path.length, 0) > 20000) throw new Error();
        leg = { from: i, to: i + 1, mode, actual: true, distance, minutes: Math.max(1, Math.ceil(seconds / 60)), segments, link, message: '카카오 길찾기 조회 결과' };
      } catch {
        leg = { from: i, to: i + 1, mode, actual: false, segments: [], link, message: '실제 경로를 불러오지 못했어요. 카카오맵에서 해당 이동수단으로 확인해 주세요.' };
      }
      if (cache.size > 500) cache.clear();
      cache.set(key, { until: Date.now() + (leg.actual ? 300000 : 30000), value: leg });
      return leg;
    }));
    return { mode, actual: result.every(leg => leg.actual), legs: result };
  };
}
