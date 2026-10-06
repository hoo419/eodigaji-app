// 서버와 APK가 함께 사용하는 순수 JavaScript 추천 로직입니다. 네트워크 없이 실행됩니다.
// 아래 장소는 가상의 샘플입니다. x/y는 샘플 지도 좌표이며 실제 위도·경도가 아닙니다.
export const regions = ['성수', '연남', '해방촌'];
const seeds = [
  ['느린 오후', '카페', 6500, 40, '실내', '여유로운', 35, 29, 'photo-1442512595331-e89e73853f31', '따뜻한 커피와 큰 창 너머로 시작하는 느긋한 오후.'],
  ['페이지 원', '문화', 9000, 45, '실내', '감성적인', 49, 39, 'photo-1507842217343-583bb7270b66', '서로의 취향이 담긴 책을 골라 주는 작은 서가.'],
  ['테이블 포 투', '식사', 23000, 55, '실내', '로맨틱한', 62, 55, 'photo-1414235077428-338989a2e8c0', '계절의 재료로 완성하는 둘만의 저녁 식탁.'],
  ['초록 산책길', '산책', 0, 40, '실외', '여유로운', 26, 66, 'photo-1441974231531-c6227db76b6e', '나란히 걸으며 이야기하기 좋은 초록빛 산책길.'],
  ['작은 전시실', '문화', 7000, 45, '실내', '감성적인', 59, 25, 'photo-1579783902614-a3fb3927b6a5', '작품 앞에서 발견하는 서로의 새로운 취향.'],
  ['모퉁이 키친', '식사', 12000, 40, '실내', '여유로운', 44, 59, 'photo-1555939594-58d7cb561ad1', '편안한 분위기에서 즐기는 부담 없는 한 끼.'],
  ['선셋 테라스', '카페', 7000, 40, '실외', '로맨틱한', 74, 39, 'photo-1501339847302-ac426a4a7cbb', '하늘이 물드는 시간, 테라스에서 잠시 쉬어 가요.'],
  ['골목 사진 여행', '산책', 0, 35, '실외', '활동적인', 71, 70, 'photo-1519608487953-e999c86e7455', '골목마다 다른 풍경 속에서 오늘의 사진을 남겨요.'],
];
export const places = regions.flatMap((region, r) => seeds.map((s, i) => ({
  id: `${r}-${i}`, region, name: s[0], category: s[1], cost: s[2], stay: s[3], environment: s[4], mood: s[5], x: s[6], y: s[7], photo: s[8], description: s[9],
  address: `서울 · ${region} 샘플 구역`, hours: '12:00 – 21:00 (예시)', demo: true,
})));
export const defaults = { region: '성수', purpose: '데이트', budget: 50000, duration: 240, start: '14:00', environment: '전체', mood: '여유로운', transport: '도보' };
// 빠진 조건에는 기본값을 채우고, 예산(1인 원 단위)과 시간(분 단위)의 범위를 검사합니다.
export function normalize(input = {}) {
  const c = { ...defaults, ...input };
  if (typeof c.region !== 'string') throw new Error('지역을 입력해 주세요.');
  c.region = c.region.trim().replace(/\s+/g, ' ');
  if (!/^[가-힣a-zA-Z0-9 ·.-]{1,60}$/.test(c.region) || !/[가-힣a-zA-Z]/.test(c.region)) throw new Error('지역은 시·군·구 또는 동네 이름으로 60자 이내로 입력해 주세요.');
  c.budget = Number(c.budget); c.duration = Number(c.duration);
  if (!Number.isFinite(c.budget) || c.budget < 0 || c.budget > 1000000) throw new Error('1인 예산을 0원부터 100만원 사이로 입력해 주세요.');
  if (!Number.isFinite(c.duration) || c.duration < 60 || c.duration > 720) throw new Error('이용 시간을 1시간부터 12시간 사이로 선택해 주세요.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.start)) throw new Error('시작 시간을 확인해 주세요.');
  if (!['전체', '실내', '실외'].includes(c.environment)) throw new Error('실내외 조건을 확인해 주세요.');
  if (!['도보', '대중교통', '자동차'].includes(c.transport)) throw new Error('이동수단을 확인해 주세요.');
  if (!['데이트', '여행'].includes(c.purpose)) throw new Error('데이트 또는 여행을 선택해 주세요.');
  if (!['여유로운', '감성적인', '로맨틱한', '활동적인'].includes(c.mood)) throw new Error('분위기를 확인해 주세요.');
  return c;
}
const clock = n => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
/**
 * 조건에 맞는 2~4개 장소를 골라 방문 시각을 붙입니다.
 * catalogue를 생략하면 샘플, 전달하면 외부에서 조회한 장소 목록을 사용합니다.
 * 실제 도로 최단 경로를 계산하지 않으며 이동시간은 이동수단별 고정 추정치입니다.
 */
export function planCourse(input = {}, catalogue = places) {
  const c = normalize(input);
  if (catalogue === places && !regions.includes(c.region)) throw new Error('샘플 지역은 성수, 연남, 해방촌이에요. 다른 지역은 장소 검색 서버를 연결해 주세요.');
  const candidates = catalogue.filter(p => p.region === c.region && (c.environment === '전체' || p.environment === c.environment)).slice(0, 12);
  const categories = c.purpose === '여행' ? ['문화', '산책', '카페', '식사'] : ['카페', '문화', '산책', '식사'];
  const travel = c.transport === '도보' ? 10 : c.transport === '자동차' ? 5 : 15;
  let best = null;
  // 최대 12개 후보의 부분집합을 검사합니다. 비트가 1인 위치의 장소를 선택합니다.
  // 먼저 예산·시간 초과 조합을 제외한 뒤 장소 수·종류·분위기 일치도로 점수를 매깁니다.
  for (let mask = 1; mask < 2 ** candidates.length; mask++) {
    let list = candidates.filter((_, i) => mask & (1 << i));
    if (list.length < 2 || list.length > 4) continue;
    const cost = list.reduce((n, p) => n + p.cost, 0);
    const minutes = list.reduce((n, p) => n + p.stay, 0) + (list.length - 1) * travel;
    if (cost > c.budget || minutes > c.duration) continue;
    const score = list.length * 20 + new Set(list.map(p => p.category)).size * 10 + list.filter(p => p.mood === c.mood).length * 8 + (c.purpose === '여행' && list.some(p => p.category === '문화') ? 12 : 0);
    if (!best || score > best.score) best = { list, cost, minutes, score };
  }
  if (!best) throw new Error('조건에 맞는 코스를 찾지 못했어요. 예산이나 시간을 늘리거나 실내외 조건을 변경해 주세요.');
  // 방문 순서는 목적별 카테고리 순서입니다. 지리적 최적화나 영업시간 검증은 아직 없습니다.
  best.list.sort((a, b) => categories.indexOf(a.category) - categories.indexOf(b.category));
  const [h, m] = c.start.split(':').map(Number); let t = h * 60 + m;
  const route = best.list.map((p, i) => { const stop = { ...p, time: clock(t), travel: i ? travel : 0 }; t += p.stay + travel; return stop; });
  const demo = route.every(p => p.demo);
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: `${c.region}에서 보내는 ${c.mood} 하루`, conditions: c, places: route, totalCost: best.cost, minutes: best.minutes, end: clock(h * 60 + m + best.minutes), demo, estimated: !demo, ...(demo ? {} : { availablePlaces: catalogue }) };
}
// 체험용 문장 해석기: 인식한 키워드만 기존 조건에 덮어써 후속 대화를 이어갑니다.
// 예: '실내 3만원'은 지역을 유지하고 실내외 조건과 1인 예산만 바꿉니다.
export function parseMessage(message, current = {}) {
  const conditions = { ...current }; const understood = [];
  if (/(부산|제주|강릉|속초|경주|대구|대전|광주|인천|수원|전주|여수|강남|홍대|잠실|종로|을지로|이태원|도쿄|오사카|파리)/.test(message)) throw new Error('현재 체험 가능한 지역은 성수, 연남, 해방촌이에요. 지역을 선택해 다시 요청해 주세요.');
  const set = (key, value, label) => { conditions[key] = value; understood.push(label); };
  for (const region of regions) if (message.includes(region)) set('region', region, region);
  if (/실내외|상관없|상관 없/.test(message)) set('environment', '전체', '실내외');
  else if (/실내|비가|비 오|비올|비 올/.test(message)) set('environment', '실내', '실내');
  else if (/실외|야외|바깥/.test(message)) set('environment', '실외', '실외');
  const b = message.match(/(\d+(?:\.\d+)?)\s*만\s*원/);
  const won = message.match(/(\d[\d,]*)\s*원/);
  if (b || won) set('budget', b ? Number(b[1]) * 10000 : Number(won[1].replaceAll(',', '')), '1인 예산');
  const hours = message.match(/(\d+(?:\.\d+)?)\s*시간/);
  if (hours) set('duration', Number(hours[1]) * 60, '이용 시간');
  if (/조용|여유|느긋/.test(message)) set('mood', '여유로운', '여유로운 분위기');
  if (/로맨틱|기념일/.test(message)) set('mood', '로맨틱한', '로맨틱한 분위기');
  if (/감성|전시|책/.test(message)) set('mood', '감성적인', '감성적인 분위기');
  if (/활동|활기/.test(message)) set('mood', '활동적인', '활동적인 분위기');
  if (/대중교통|차 없이|차없이|지하철|버스/.test(message)) set('transport', '대중교통', '대중교통');
  else if (/자동차|차로|드라이브/.test(message)) set('transport', '자동차', '자동차');
  else if (/도보|걸어서|걷기/.test(message)) set('transport', '도보', '도보');
  if (/여행/.test(message)) set('purpose', '여행', '여행');
  if (/데이트/.test(message)) set('purpose', '데이트', '데이트');
  return { conditions, understood };
}
