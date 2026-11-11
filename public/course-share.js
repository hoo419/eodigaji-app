// 공개 코스 정보만 URL에 담습니다. 계정·프로필·인증 정보는 포함하지 않습니다.
const courseKeys = ['id', 'title', 'conditions', 'places', 'totalCost', 'minutes', 'end', 'demo', 'estimated', 'concept', 'environmentLabel', 'label', 'revision', 'timingMode', 'remainingMinutes'];
const conditionKeys = ['region', 'purpose', 'partySize', 'budget', 'duration', 'start', 'date', 'environment', 'mood', 'transport', 'categories', 'excludedCategories', 'includeMeals', 'destinationName', 'destinationAddress', 'destinationUrl', 'destinationLat', 'destinationLng'];
const placeKeys = ['id', 'name', 'region', 'category', 'cost', 'stay', 'stayWeight', 'stayFixed', 'environment', 'mood', 'x', 'y', 'lat', 'lng', 'photo', 'description', 'address', 'hours', 'demo', 'time', 'travel', 'travelDistance', 'travelBasis', 'travelActual', 'url', 'sourceUrl', 'photoUrl', 'note', 'transport'];
const pick = (value, keys) => Object.fromEntries(keys.filter(k => value[k] !== undefined).map(k => [k, value[k]]));
export function snapshot(course) {
  if (!course || !course.conditions || !Array.isArray(course.places) || course.places.length < 2 || course.places.length > 144) throw new Error('공유할 코스가 올바르지 않아요.');
  const result = { ...pick(course, courseKeys), conditions: pick(course.conditions, conditionKeys), places: course.places.map(p => pick(p, placeKeys)) };
  for (const value of [result, result.conditions, ...result.places]) {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'conditions' || key === 'places') continue;
      if (value === result.conditions && ['categories', 'excludedCategories'].includes(key)) { if (!Array.isArray(item) || item.length > 4 || item.some(v => !['카페', '문화', '산책', '식사'].includes(v))) throw new Error('장소 종류를 확인해 주세요.'); continue; }
      if (item !== null && !['string', 'number', 'boolean'].includes(typeof item)) throw new Error('공유 코스 형식이 올바르지 않아요.');
      if (typeof item === 'string' && item.length > 2000) throw new Error('공유 코스 문자열이 올바르지 않아요.');
      if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('공유 코스 수치가 올바르지 않아요.');
    }
  }
  if (typeof result.id !== 'string' || typeof result.title !== 'string' || typeof result.conditions.region !== 'string' || !result.places.every(p => typeof p.name === 'string' && typeof p.id === 'string' && /^\d{2}:\d{2}$/.test(p.time))) throw new Error('공유 코스 내용이 올바르지 않아요.');
  if (!/^[\w.-]{1,100}$/.test(result.id) || !result.places.every(p => /^[\w.-]{1,100}$/.test(p.id))) throw new Error('코스 ID가 올바르지 않아요.');
  for (const p of result.places) {
    if (!Number.isFinite(p.cost) || p.cost < 0 || p.cost > 1000000 || !Number.isFinite(p.stay) || p.stay < 5 || p.stay > (p.category === '식사' ? 90 : 720)) throw new Error('장소 비용과 체류 시간을 확인해 주세요.');
    if (p.transport && !['도보', '자동차', '대중교통'].includes(p.transport)) throw new Error('이동수단을 확인해 주세요.');
    if (p.photoUrl && !/^https:\/\//.test(p.photoUrl)) delete p.photoUrl;
    if (p.sourceUrl && !/^https:\/\/place\.map\.kakao\.com\//.test(p.sourceUrl)) delete p.sourceUrl;
  }
  if (result.conditions.partySize !== undefined && (!Number.isInteger(result.conditions.partySize) || result.conditions.partySize < 1 || result.conditions.partySize > 100)) throw new Error('여행 인원을 확인해 주세요.');
  return result;
}
export function courseShareUrl(course, base) {
  const json = JSON.stringify({ version: 1, course: snapshot(course) });
  const bytes = new TextEncoder().encode(json);
  const encoded = btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  if (encoded.length > 32000) throw new Error('코스 정보가 너무 커서 링크로 공유할 수 없어요.');
  const url = new URL(base); url.search = ''; url.hash = `course=${encoded}`;
  return url.href;
}
export function readSharedCourse(hash) {
  const encoded = new URLSearchParams(hash.replace(/^#/, '')).get('course');
  if (encoded === null) return null;
  try {
    if (!encoded || encoded.length > 32000 || !/^[\w-]+$/.test(encoded)) throw new Error();
    const bytes = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (data.version !== 1) throw new Error();
    return snapshot(data.course);
  } catch { throw new Error('공유 링크가 손상되었거나 지원하지 않는 코스입니다.'); }
}
