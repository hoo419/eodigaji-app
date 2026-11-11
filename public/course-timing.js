export const stayLimit = p => p.category === '식사' ? 90 : p.category === '산책' ? 60 : p.category === '문화' ? 120 : p.category === '카페' ? 90 : 720;
// Allocate the stay budget after travel, using original estimates as stable weights.
export function allocateStayTimes(list, duration, travel) {
  const result = list.map(p => ({ ...p }));
  const flexible = result.filter(p => !p.stayFixed);
  if (result.some(p => p.stayFixed && p.stay > stayLimit(p))) throw new Error('장소별 체류 한도를 초과했어요. 식사는 최대 90분이에요.');
  const fixed = result.filter(p => p.stayFixed).reduce((n, p) => n + p.stay, 0);
  const available = Math.min(Math.floor(duration - travel - fixed), flexible.reduce((n, p) => n + stayLimit(p), 0));
  if (available < flexible.length * 5) throw new Error('이동시간과 지정한 체류시간이 전체 시간을 초과해요. 시간을 늘리거나 장소를 줄여 주세요.');
  if (!flexible.length) return result;
  const weights = flexible.map(p => Number(p.stayWeight) > 0 ? Number(p.stayWeight) : p.stay);
  const shares = weights.map(() => 0);
  let remaining = available, pending = weights.map((_, i) => i);
  while (pending.length) {
    const sum = pending.reduce((n, i) => n + weights[i], 0);
    const small = pending.filter(i => remaining * weights[i] / sum < 5);
    const large = pending.filter(i => remaining * weights[i] / sum > stayLimit(flexible[i]));
    if (large.length) {
      large.forEach(i => { shares[i] = stayLimit(flexible[i]); remaining -= shares[i]; });
      pending = pending.filter(i => !large.includes(i)); continue;
    }
    if (!small.length) { pending.forEach(i => { shares[i] = remaining * weights[i] / sum; }); break; }
    small.forEach(i => { shares[i] = 5; remaining -= 5; });
    pending = pending.filter(i => !small.includes(i));
  }
  const rounded = shares.map(v => Math.floor(v));
  const order = shares.map((v, i) => ({ i, fraction: v - rounded[i] })).sort((a, b) => b.fraction - a.fraction);
  const remainder = available - rounded.reduce((n, v) => n + v, 0);
  for (let i = 0; i < remainder; i++) rounded[order[i].i]++;
  flexible.forEach((p, i) => { p.stayWeight = weights[i]; p.stay = rounded[i]; });
  return result;
}
