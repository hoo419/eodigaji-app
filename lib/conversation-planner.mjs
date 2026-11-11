import { normalize, allowedCategory, estimateTravel, allocateStayTimes, stayLimit } from './planner.mjs';

export function planningMemory(value = {}, course = null) {
  const ids = new Set(course?.places.map(p => p.id) || []);
  const same = value?.courseId === course?.id;
  return { destinationCandidates: Array.isArray(value?.destinationCandidates) ? value.destinationCandidates.slice(0,5).filter(p=>p && typeof p.name==='string' && typeof p.region==='string' && Number.isFinite(p.lat) && Number.isFinite(p.lng)) : [], courseId: course?.id || null, lockedPlaceIds: same && Array.isArray(value.lockedPlaceIds) ? [...new Set(value.lockedPlaceIds)].filter(id => ids.has(id)) : [], preferences: Array.isArray(value?.preferences) ? value.preferences.filter(s => typeof s === 'string').map(s => s.slice(0, 150)).slice(-12) : [], pendingConditions: value?.pendingConditions && typeof value.pendingConditions === 'object' ? normalize(value.pendingConditions) : null, history: Array.isArray(value?.history) ? value.history.filter(v => typeof v === 'string').slice(-20) : [], excludedPlaceIds: Array.isArray(value?.excludedPlaceIds) ? value.excludedPlaceIds.filter(id => typeof id === 'string').slice(-120) : [] };
}
const clock = minute => `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
export function validateItinerary(course, conditions, locked = []) {
  const c = normalize(conditions); let list = structuredClone(course.places);
  if (list.length < 2 || list.length > 144) throw new Error('코스에는 장소가 2~144개 필요해요. 다른 장소를 추가하거나 삭제할 장소를 다시 골라 주세요.');
  if (new Set(list.map(p => p.id)).size !== list.length) throw new Error('같은 장소를 두 번 넣을 수 없어요.');
  for (const id of locked) if (!list.some(p => p.id === id)) throw new Error('유지하기로 한 장소가 빠졌어요. 먼저 해당 장소의 유지 조건을 해제해 주세요.');
  for (const p of list) {
    if (!allowedCategory(p, c) || (c.environment !== '전체' && p.environment !== c.environment) || p.region !== c.region) throw new Error(`${p.name} 장소가 새 지역·종류·실내외 조건과 충돌해요. 해당 장소를 교체하거나 조건을 조정할까요?`);
    if (!Number.isFinite(p.cost) || p.cost < 0 || !Number.isFinite(p.stay) || p.stay < 5 || p.stay > stayLimit(p)) throw new Error('장소 비용과 체류 시간을 확인해 주세요.');
  }
  if (course.timingMode === 'proportional') {
    const travel = list.slice(1).reduce((n, p, i) => n + estimateTravel(list[i], p, list[i].transport || c.transport).minutes, 0);
    list = allocateStayTimes(list, c.duration, travel);
  }
  const start = Number(c.start.slice(0, 2)) * 60 + Number(c.start.slice(3)); let time = start;
  for (let i = 0; i < list.length; i++) {
    const leg = i ? estimateTravel(list[i-1], list[i], list[i-1].transport || c.transport) : { minutes: 0, distance: 0, basis: '' };
    time += leg.minutes; Object.assign(list[i], { time: clock(time), travel: leg.minutes, travelDistance: leg.distance, travelBasis: leg.basis }); time += list[i].stay;
  }
  const totalCost = list.reduce((n, p) => n + p.cost, 0), minutes = time - start;
  if (totalCost > c.budget) throw new Error(`현재 구성은 1인 예상 ${totalCost.toLocaleString('ko-KR')}원으로 예산보다 ${(totalCost-c.budget).toLocaleString('ko-KR')}원 많아요. 어느 장소를 빼거나 저렴한 곳으로 바꿀까요?`);
  if (minutes > c.duration) throw new Error(`현재 구성은 예상 ${minutes}분으로 요청한 시간보다 ${minutes-c.duration}분 길어요. 체류 시간을 줄일지 장소를 뺄지 알려 주세요.`);
  return { ...course, conditions: c, places: list, totalCost, minutes, remainingMinutes: Math.max(0, c.duration - minutes), end: clock(time), demo: list.every(p => p.demo), estimated: true };
}
function optimize(list, transport) {
  if (list.length > 8) throw new Error('자동 순서 최적화는 8곳까지 가능해요. 장소를 줄이거나 원하는 순서를 알려 주세요.');
  let best = list, score = Infinity;
  function visit(prefix, rest, cost) {
    if (cost >= score) return;
    if (!rest.length) { best = prefix; score = cost; return; }
    rest.forEach((p, i) => visit([...prefix, p], rest.filter((_, j) => i !== j), cost + (prefix.length ? estimateTravel(prefix.at(-1), p, transport).minutes : 0)));
  }
  visit([], list, 0); return best;
}
// The LLM proposes operations using IDs; this transaction validates them before changing anything.
export function applyCourseDecision({ decision, course, catalogue = [], memory = {}, conditions, request = '' }) {
  const originalMemory = planningMemory(memory, course);
  if (Array.isArray(decision.preferences)) originalMemory.preferences = [...new Set([...originalMemory.preferences, ...decision.preferences.filter(v => typeof v === 'string').map(v => v.slice(0,150))])].slice(-12);
  if (decision.operation === 'clarify' || !decision.canPlan) return { course: null, memory: originalMemory, changes: [], message: decision.message };
  const nextMemory = structuredClone(originalMemory), c = normalize(conditions || decision.conditions || course?.conditions || {});
  try {
    if (!course) throw new Error('먼저 지역과 예산을 알려 주시면 코스를 만들 수 있어요.');
    let list = structuredClone(course.places); const changes = [];
    const trusted = new Map([...catalogue, ...course.places].map(p => [p.id, p]));
    if (!Array.isArray(decision.steps) || decision.steps.length > 24) throw new Error('변경할 내용을 다시 알려 주세요.');
    for (const step of decision.steps) {
      const index = list.findIndex(p => p.id === step.targetId), target = list[index];
      const getPlace = () => { const p = trusted.get(step.placeId); if (!p || nextMemory.excludedPlaceIds.includes(p.id)) throw new Error('검색 결과에서 확인할 수 있는 다른 장소를 골라 주세요.'); if (list.some(q => q.id === p.id)) throw new Error('이미 코스에 있는 장소예요. 추가 대신 순서를 바꿀까요?'); return structuredClone(p); };
      if (!['add', 'optimize'].includes(step.type) && !target) throw new Error('어느 장소를 바꿀지 명확하지 않아요. 장소 이름이나 순번을 알려 주세요.');
      if (step.type === 'keep') { nextMemory.lockedPlaceIds = [...new Set([...nextMemory.lockedPlaceIds, target.id])]; changes.push(`${target.name} 유지`); }
      else if (step.type === 'unkeep') { if (request && !/해제|풀어|풀고|바꿔도|유지하지|고정하지|유지.*취소|고정.*취소/.test(request)) throw new Error('유지 조건을 해제할지 먼저 알려 주세요.'); nextMemory.lockedPlaceIds = nextMemory.lockedPlaceIds.filter(id => id !== target.id); changes.push(`${target.name} 유지 해제`); }
      else if (step.type === 'remove' || step.type === 'replace') {
        if (nextMemory.lockedPlaceIds.includes(target.id)) throw new Error(`${target.name}은 유지하기로 한 장소예요. 유지 조건을 해제하고 바꿀까요?`);
        if (step.type === 'replace') { const p = getPlace(); list.splice(index, 1, p); changes.push(`${target.name} → ${p.name}`); }
        else { list.splice(index, 1); changes.push(`${target.name} 삭제`); }
        nextMemory.excludedPlaceIds = [...new Set([...nextMemory.excludedPlaceIds, target.id])].slice(-120);
      }
      else if (step.type === 'add') { const p = getPlace(); const at = step.afterId === null ? -1 : list.findIndex(q => q.id === step.afterId); if (step.afterId !== null && at < 0) throw new Error('추가할 위치를 알려 주세요.'); list.splice(at + 1, 0, p); changes.push(`${p.name} 추가`); }
      else if (step.type === 'move') { list.splice(index, 1); const at = step.afterId === null ? -1 : list.findIndex(q => q.id === step.afterId); if (step.afterId !== null && at < 0) throw new Error('이동할 위치를 알려 주세요.'); list.splice(at + 1, 0, target); changes.push(`${target.name} 순서 이동`); }
      else if (step.type === 'stay') { if (!Number.isInteger(step.minutes) || step.minutes < 5 || step.minutes > 720) throw new Error('체류 시간은 5~720분으로 알려 주세요.'); target.stay = step.minutes; target.stayFixed = true; changes.push(`${target.name} 체류 ${step.minutes}분`); }
      else if (step.type === 'optimize') { list = optimize(list, c.transport); changes.push('거리 기반 예상 이동시간이 짧은 순서로 정렬'); }
      else throw new Error('지원하지 않는 코스 변경입니다.');
    }
    if (Array.isArray(decision.preferences)) nextMemory.preferences = [...new Set([...nextMemory.preferences, ...decision.preferences.filter(s => typeof s === 'string').map(s => s.slice(0, 150))])].slice(-12);
    const updated = validateItinerary({ ...course, places: list }, c, nextMemory.lockedPlaceIds);
    const changed = JSON.stringify([course.places, course.conditions]) !== JSON.stringify([updated.places, updated.conditions]);
    if (changed) updated.revision = (course.revision || 0) + 1;
    nextMemory.courseId = course.id; nextMemory.pendingConditions = null; nextMemory.history = [...nextMemory.history, ...changes].slice(-20);
    return { course: changed ? updated : null, memory: nextMemory, changes, message: `${decision.message || '요청한 내용을 반영했어요.'}${changes.length ? '\n변경: ' + changes.join(' · ') : ''}\n장소 비용·체류·이동시간은 추정입니다.${changed ? ' 저장 버튼을 눌러야 저장한 코스에 반영됩니다.' : ''}` };
  } catch (e) { return { course: null, memory: { ...originalMemory, pendingConditions: c }, changes: [], message: e.message, clarification: true }; }
}
// No AI key: limited, explicit demo edits. Ambiguity is a question, never a guessed deletion.
export function localCourseDecision(message, course, conditions, catalogue = [], memory = {}) {
  if (/처음부터|새로운\s*코스|새\s*코스.*만들/.test(message)) return { operation: 'create', canPlan: true, conditions, steps: [], preferences: [], message: '새 코스를 만들게요.' };
  const steps = [], locked = [], ordinal = /(첫\s*번째|두\s*번째|세\s*번째|네\s*번째|마지막|\d+\s*번(?:째)?)/g;
  const ordinalIndex = s => /첫/.test(s) ? 0 : /두/.test(s) ? 1 : /세/.test(s) ? 2 : /네/.test(s) ? 3 : /마지막/.test(s) ? course.places.length-1 : Number(s.match(/\d+/)[0])-1;
  for (const match of message.matchAll(ordinal)) { const p = course.places[ordinalIndex(match[0])]; if (p) locked.push(p); }
  const named = course.places.filter(p => message.includes(p.name)); const targets = [...new Map([...locked, ...named].map(p => [p.id,p])).values()];
  const step = (type, targetId, extra = {}) => ({ type, targetId, placeId: null, afterId: null, minutes: null, ...extra });
  if (/유지|고정|그대로/.test(message) && !/해제|유지하지/.test(message)) targets.forEach(p => steps.push(step('keep', p.id)));
  if (/고정.*해제|유지.*해제/.test(message)) targets.forEach(p => steps.push(step('unkeep', p.id)));
  if (/삭제|빼줘|빼고|제외/.test(message)) {
    if (targets.length === 1 && !/유지|고정/.test(message)) steps.push(step('remove', targets[0].id));
    else for (const p of course.places) if (!allowedCategory(p, conditions) && !steps.some(s => s.targetId === p.id)) steps.push(step('remove', p.id));
  }
  if (/체류|머물/.test(message) && targets.length === 1) { const min = message.match(/(\d+)\s*분/); if (min) steps.push(step('stay',targets[0].id,{minutes:Number(min[1])})); }
  if (/이동.*최소|동선.*최적|이동.*짧/.test(message)) steps.push(step('optimize', null));
  const knownNew = catalogue.filter(p => !course.places.some(q => q.id === p.id) && message.includes(p.name));
  if (/교체|바꿔/.test(message) && targets.length === 1 && knownNew.length === 1) steps.push(step('replace',targets[0].id,{placeId:knownNew[0].id}));
  if (/나머지.*(?:교체|바꿔)/.test(message)) {
    const keepIds = new Set([...(memory.lockedPlaceIds || []), ...steps.filter(s => s.type === 'keep').map(s => s.targetId)]);
    const candidates = catalogue.filter(p => !course.places.some(q => q.id === p.id) && allowedCategory(p, conditions) && p.region === conditions.region && (conditions.environment === '전체' || p.environment === conditions.environment));
    for (const p of course.places.filter(p => !keepIds.has(p.id))) {
      const replacement = candidates.shift();
      if (!replacement) return { operation: 'clarify', canPlan: false, conditions, steps: [], preferences: [], message: '유지할 장소 외에 모두 바꾸기에는 새 장소가 부족해요. 지역이나 종류 조건을 넓힐까요?' };
      steps.push(step('replace', p.id, { placeId: replacement.id }));
    }
  }
  const changedConditions = JSON.stringify(normalize(course.conditions)) !== JSON.stringify(normalize(conditions));
  if (changedConditions) {
    for (const p of course.places) if ((!allowedCategory(p, conditions) || (conditions.environment !== '전체' && p.environment !== conditions.environment)) && !steps.some(s => s.targetId === p.id)) steps.push(step('remove', p.id));
    const remaining = course.places.filter(p => !steps.some(s => s.type === 'remove' && s.targetId === p.id));
    const candidates = catalogue.filter(p => p.region === conditions.region && allowedCategory(p, conditions) && (conditions.environment === '전체' || p.environment === conditions.environment) && !course.places.some(q => q.id === p.id)).sort((a,b) => a.cost-b.cost);
    while (remaining.length < 2 && candidates.length) { const p = candidates.shift(); steps.push(step('add', null, { placeId: p.id, afterId: remaining.at(-1)?.id || null })); remaining.push(p); }
  }
  return { operation: steps.length || changedConditions ? 'edit' : 'clarify', canPlan: steps.length > 0 || changedConditions, conditions, steps, preferences: [], message: steps.length || changedConditions ? '샘플 편집으로 요청을 적용했어요.' : '어느 장소를 어떻게 바꿀까요? 장소 이름이나 “두 번째 장소 삭제”처럼 알려 주세요. 자유로운 대화 편집은 AI 연결 후 사용할 수 있어요.' };
}
