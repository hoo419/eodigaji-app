import { icon } from './icons.js';
import { mountLiveMap, zoomLiveMap } from './live-map.js';

const $ = s => document.querySelector(s);
// 사용자 입력·외부 문자열을 HTML 템플릿에 넣을 때 태그로 실행되지 않도록 이스케이프합니다.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => `${Number(n).toLocaleString('ko-KR')}원`;
const length = n => `${Math.floor(n / 60)}시간${n % 60 ? ` ${n % 60}분` : ''}`;
const today = new Date();
const dateISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
function stored(key, fallback) { try { return JSON.parse(localStorage.getItem(`eodigaji.${key}`)) ?? fallback; } catch { return fallback; } }
const readProfile = stored('profile', null);
const readSaved = stored('saved', []);
// 화면 상태의 중심입니다. 상태를 바꾼 뒤 render()를 호출해 해당 화면을 다시 그립니다.
const state = {
  config: { ai: false, places: false, map: false, auth: false }, user: null,
  tab: 'explore', view: 'map', filter: '전체', query: '', zoom: 1, places: [], course: null, selected: null,
  profile: readProfile && typeof readProfile.name === 'string' ? readProfile : null,
  saved: Array.isArray(readSaved) ? readSaved.filter(c => c && typeof c.id === 'string' && Array.isArray(c.places) && c.conditions) : [],
  conditions: { region: '성수', purpose: '데이트', budget: 50000, duration: 240, start: '14:00', date: dateISO, environment: '전체', mood: '여유로운', transport: '도보' },
  messages: [{ role: 'assistant', text: '안녕하세요! 오늘은 어떤 하루를 보내고 싶으세요?\n\n“성수에서 조용한 실내 데이트, 1인 3만원”처럼 말해 주세요. 함께 코스를 만들어 볼게요.' }],
  chatting: false, busy: false,
};
let modalReturn = null, draftProfile = {}, draftCourse = null, toastTimer;
function persist(key, value) { try { localStorage.setItem(`eodigaji.${key}`, JSON.stringify(value)); return true; } catch { toast('브라우저 저장 공간을 사용할 수 없어 이번 화면에서만 유지됩니다.'); return false; } }
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('show'); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4000); }
// Android에서는 모바일 연결 계층, 웹에서는 현재 서버의 HTTP API로 요청을 보냅니다.
async function api(path, body) {
  if (window.EodigajiNative) return window.EodigajiNative.request(path, body);
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(path, body === undefined ? { signal: controller.signal } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    const data = await res.json(); if (!res.ok) throw new Error(data.error || '요청을 처리하지 못했어요.'); return data;
  } catch (e) { if (e.name === 'AbortError' || e instanceof TypeError) throw new Error('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'); throw e; }
  finally { clearTimeout(timeout); }
}
const brand = '<span class="brand">어디가지<span class="beta">베타</span></span>';
const photo = (p, cls = 'photo') => p.photo ? `<img class="${cls}" src="https://images.unsplash.com/${esc(p.photo)}?auto=format&fit=crop&w=900&q=80" alt="${esc(p.category)} 분위기 참고 사진" loading="lazy" referrerpolicy="no-referrer">` : `<span class="${cls} photo-placeholder" role="img" aria-label="${esc(p.name)} 사진 미제공">${icon(p.category === '카페' ? 'coffee' : 'pin')}<small>장소 사진 미제공</small></span>`;
const btn = (action, text, ic = '', cls = '', extra = '') => `<button type="button" class="btn ${cls}" data-action="${action}" ${extra}>${ic ? icon(ic) : ''}${text}</button>`;
const actionIcon = (action, ic, label, extra = '') => `<button type="button" class="icon-btn" data-action="${action}" aria-label="${esc(label)}" ${extra}>${icon(ic)}</button>`;
const isSaved = course => state.saved.some(p => p.id === course.id);

function render() {
  const name = state.profile?.name || '여행자';
  $('#app').innerHTML = `<div class="shell"><aside class="sidebar" aria-label="주 메뉴">${brand}<div class="brand-note">A DAY, JUST FOR US</div>
    <nav class="nav">${[['explore', 'compass', '탐색'], ['saved', 'heart', '저장한 코스'], ['profile', 'user', '마이페이지']].map(([id, i, label]) => `<button data-action="nav" data-tab="${id}" class="${state.tab === id ? 'active' : ''}" ${state.tab === id ? 'aria-current="page"' : ''}>${icon(i)}<span class="nav-label">${label}</span>${id === 'saved' && state.saved.length ? `<span class="count">${state.saved.length}</span>` : ''}</button>`).join('')}</nav>
    <div class="side-note">${icon('spark')}<br><strong>계획은 가볍게,<br>우리의 하루는 특별하게.</strong><p>좋아하는 것들로 채우는<br>둘만의 새로운 하루</p></div>
    <button class="side-profile" data-action="nav" data-tab="profile"><span class="avatar">${esc(name.slice(0, 1))}</span><div><strong>${esc(name)}님</strong><small>${state.profile ? '나만의 취향으로 탐색 중' : '게스트로 둘러보는 중'}</small></div></button></aside>
    <div class="main-wrap"><header class="topbar"><div class="crumb">우리의 다음 목적지 <strong>/ &nbsp; ${state.tab === 'explore' ? '탐색' : state.tab === 'saved' ? '저장한 코스' : '마이페이지'}</strong></div><div class="mobile-brand">${brand}</div><div class="top-actions"><span class="small muted"><span class="status-dot"></span>새로운 하루의 시작</span>${btn('about', '샘플 체험', '', 'ghost')}${state.user ? btn('logout', '로그아웃', '', 'logout-top') : ''}${btn(state.profile ? 'edit-profile' : 'onboard', state.profile ? `${esc(name)}님` : '로그인 · 회원가입', 'user', 'outline')}</div></header>
    <main id="main" class="content">${state.tab === 'explore' ? explore() : state.tab === 'saved' ? savedPage() : profilePage()}</main></div></div>`;
  if (state.view === 'chat') { const messages = $('.messages'); if (messages) messages.scrollTop = messages.scrollHeight; }
  if (state.tab === 'explore') {
    $('.sample-foot').textContent = state.course?.demo ? `샘플 장소 코스 · ${state.config.ai ? '실제 AI 조건 분석' : '규칙 기반 대화 체험'} · 실제 지도·장소 연동은 상단 서비스 설정에서 확인하세요.` : '카카오 장소 검색 결과 · 비용·체류·이동 시간·실내외는 추정이며 검증된 영업 정보가 아닙니다. 지도 선은 방문 순서로 실제 길찾기가 아닙니다.';
    if (!state.course?.demo) { const note = $('.map-legend p'); if (note) note.textContent = '실제 장소 위치 · 파란 선은 방문 순서 (길찾기 아님)'; const credit = $('.map-credit'); if (credit) credit.textContent = ''; }
    if (state.config.ai) { const sub = $('.chat-heading p'); if (sub) sub.textContent = `${state.config.aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} 연결 · 입력한 조건을 분석해요`; }
    refreshLiveMap();
  }
  const connectionButton = $('[data-action="about"]'); if (connectionButton) { connectionButton.dataset.action = 'connections'; connectionButton.textContent = '서비스 설정'; }
  if (window.EodigajiNative) {
    const footer = $('.sample-foot'); if (footer && state.config.offline) footer.textContent = '앱 내 오프라인 체험 · 코스 생성과 저장에 PC 서버가 필요하지 않습니다. 장소·비용·이동 정보는 샘플입니다.';
    const profileText = $('.profile-card>p'); if (profileText && !state.user) profileText.textContent = '이 앱에 저장된 체험 프로필입니다.';
  }
  if (state.user && state.tab === 'profile') {
    $('.profile-card>p').textContent = `로그인: ${state.user.email} · 프로필과 코스는 Supabase에 저장됩니다.`;
    $('.profile-card').insertAdjacentHTML('beforeend', btn('logout', '로그아웃', 'user', 'outline full'));
    const reset = $('[data-action="reset-confirm"]'); if (reset) reset.remove();
    const lines = document.querySelectorAll('.info-line');
    if (lines[0]) lines[0].innerHTML = '<strong>회원 계정</strong><p>이메일로 인증한 계정입니다. 다른 기기에서도 로그인하면 저장한 코스를 불러올 수 있습니다.</p>';
    if (lines[2]) lines[2].innerHTML = '<strong>저장 공간</strong><p>회원 프로필과 코스를 클라우드 DB에 저장합니다. 정확한 위치와 대화 내역은 이 앱의 DB에 저장하지 않습니다.</p>';
  }
}
function refreshLiveMap() {
  const target = $('#real-map');
  if (target && state.config.map) mountLiveMap(target, state.config.mapKey, filteredPlaces(), state.course?.places || [], id => placeDialog(id));
}
function acceptCourse(course) { state.course = course; state.conditions = course.conditions; if (course.availablePlaces) state.places = course.availablePlaces; }
function greeting(title, sub, eyebrow = 'MAKE ROOM FOR A LITTLE ADVENTURE') { return `<section class="greeting"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${sub}</p></div><span class="date">${icon('calendar')}${esc(today.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }))}</span></section>`; }
function explore() {
  const c = state.conditions;
  return `${greeting('오늘, 어디로 떠나볼까요?', '취향이 닮은 장소부터 기분 좋은 동선까지. 우리의 하루를 찾아보세요.')}
    <div class="filters" aria-label="현재 코스 조건">${[['pin', '어디로 갈까요?', `${c.region} · ${c.purpose}`], ['calendar', '언제 만날까요?', `${c.date.slice(5).replace('-', '.')} · ${c.start}`], ['wallet', '1인 예산', won(c.budget)], ['sun', '오늘의 취향', `${c.mood} · ${c.environment === '전체' ? '실내외' : c.environment}`]].map(([i, label, value]) => `<button class="filter-cell" data-action="filters">${icon(i)}<span><small>${label}</small><strong>${esc(value)}</strong></span>${icon('down', 'down')}</button>`).join('')}<div class="filter-end">${btn('filters', '조건 변경', 'filter', 'primary')}</div></div>
    <div class="explore-toolbar"><div class="segment" role="group" aria-label="탐색 방식"><button data-action="view" data-view="map" class="${state.view === 'map' ? 'active' : ''}" aria-pressed="${state.view === 'map'}">${icon('map')}지도 탐색</button><button data-action="view" data-view="chat" class="${state.view === 'chat' ? 'active' : ''}" aria-pressed="${state.view === 'chat'}">${icon('spark')}AI와 계획하기</button></div><span class="toolbar-note">어디로 갈지 고민되는 순간, 어디가지</span></div>
    <div class="explore-grid ${state.view === 'chat' ? 'chat-layout' : ''}">${state.view === 'chat' ? chatPanel() : discovery()}${mapPanel()}</div><p class="sample-foot">샘플 체험 · 장소·사진·영업시간·비용·이동 경로는 시연용 예시입니다. 실제 AI 및 지도 서비스는 아직 연결되지 않았습니다.</p>`;
}
function courseCard(course, saved = false) {
  const c = course.conditions;
  return `<article class="course-card"><div class="course-image">${photo(course.places[0])}<span class="photo-badge">${icon('spark')} ${esc(c.mood)} ${esc(c.purpose)}</span><button class="save-float ${isSaved(course) ? 'saved' : ''}" data-action="save" data-id="${esc(course.id)}" aria-label="${isSaved(course) ? '코스 저장 취소' : '코스 저장'}" aria-pressed="${isSaved(course)}">${icon('heart')}</button><span class="photo-caption">분위기 참고 이미지</span></div>
    <div class="course-body"><div class="row"><span class="tag blue">${esc(c.region)}</span><span class="tag">${esc(c.environment === '전체' ? '실내 + 실외' : c.environment)}</span><span class="tag">${esc(c.transport)}</span></div><h3>${esc(course.title)}</h3><p>${c.purpose === '데이트' ? '서로에게 조금 더 집중할 수 있도록,' : '동네의 새로운 모습을 만날 수 있도록,'}<br>취향에 맞는 ${course.places.length}곳을 하나의 하루로 이었어요.</p>
    <div class="mini-route">${course.places.map((p, i) => `${i ? icon('chevron') : ''}<b>${esc(p.category)}</b>`).join('')}</div><div class="course-stats"><span class="row">${icon('clock')}${length(course.minutes)}</span><span class="row">${icon('wallet')}1인 ${course.estimated ? '예상 ' : ''}${won(course.totalCost)}</span><span class="row">${icon('pin')}${course.places.length}곳</span></div>
    ${saved ? `<div class="saved-actions">${btn('course', '코스 다시 보기', 'arrow', 'primary', `data-id="${esc(course.id)}"`)}${actionIcon('remove-saved', 'trash', '저장한 코스 삭제', `data-id="${esc(course.id)}"`)}</div>` : btn('course', '우리의 코스 자세히 보기', 'arrow', 'primary full', `data-id="${esc(course.id)}"`)}</div></article>`;
}
function discovery() {
  const list = filteredPlaces();
  return `<section class="discovery"><div class="section-title"><h2>이런 하루, 어때요?</h2><small>선택한 조건을 담았어요</small></div>${state.course ? courseCard(state.course) : '<p>코스를 불러오는 중입니다.</p>'}<button class="ai-invite" data-action="view" data-view="chat">${icon('spark')}<div><strong>생각한 데이트가 따로 있나요?</strong><p>AI에게 말하고, 우리답게 바꿔 보세요.</p></div>${icon('chevron')}</button><div class="section-title"><h2>함께 들르기 좋은 곳</h2><small>${list.length}개의 ${state.config.places ? '검색된' : '샘플'} 장소</small></div><div class="place-list">${list.length ? list.slice(0, 4).map(miniPlace).join('') : '<p class="small muted" style="padding:20px 0">검색 결과가 없어요. 다른 검색어나 분류를 선택해 주세요.</p>'}</div></section>`;
}
function miniPlace(p) { return `<button class="mini-place" data-action="place" data-id="${esc(p.id)}"><span class="thumb">${photo(p)}</span><span><small>${esc(p.category)} · ${esc(p.region)}</small><h3>${esc(p.name)}</h3><p>${esc(p.environment)} · ${p.estimated ? '예상 ' : ''}${won(p.cost)}</p></span>${icon('chevron')}</button>`; }
function filteredPlaces() { return state.places.filter(p => p.region === state.conditions.region && (state.filter === '전체' || p.category === state.filter) && `${p.name} ${p.category} ${p.description} ${p.region}`.includes(state.query)); }
function mapPanel() {
  return `<section class="map-panel" aria-label="${esc(state.conditions.region)} ${state.config.places ? '장소 지도' : '샘플 지도'}"><label class="map-search">${icon('search')}<input id="map-search" type="search" value="${esc(state.query)}" placeholder="조회된 장소 이름이나 분류로 검색" aria-label="현재 조회된 장소에서 검색"></label><div class="map-chips" role="group" aria-label="장소 분류">${['전체', '카페', '식사', '문화', '산책'].map(x => `<button data-action="category" data-category="${x}" class="${state.filter === x ? 'active' : ''}" aria-pressed="${state.filter === x}">${x}</button>`).join('')}</div><div id="map-render">${mapArt()}</div><div class="map-controls">${actionIcon('zoom-in', 'plus', '지도 확대')}${actionIcon('zoom-out', 'minus', '지도 축소')}${actionIcon('map-reset', 'target', '지도 원래 크기로')}</div><div class="map-legend"><div><strong class="row">${icon('pin')}${esc(state.conditions.region)}에서 만나는 우리의 하루</strong><p>${state.course?.places.length || 0}개의 장소 · 파란 선은 추천 코스 · 샘플 지도</p></div>${btn('course', '코스 보기', 'arrow', '', state.course ? `data-id="${esc(state.course.id)}"` : '')}</div><small class="map-credit">어디가지 베타 · 지리적 위치와 경로는 실제 지도와 다릅니다.</small></section>`;
}
function mapArt() {
  if (state.course && !state.course.demo) return state.config.map ? '<div id="real-map" class="real-map" aria-label="카카오 지도"></div>' : '<div class="map-live-error">실제 장소를 검색했어요. 지도를 표시하려면 서비스 설정에서 카카오 JavaScript 키를 등록해 주세요.</div>';
  let blocks = ''; for (let row = 0; row < 8; row++) for (let col = 0; col < 10; col++) {
    const x = col * 108 - 20, y = row * 99 - 40;
    blocks += `<rect x="${x}" y="${y}" width="83" height="75" rx="6" fill="${(row + col) % 3 === 0 ? '#e2e6e0' : '#e8ebe5'}" stroke="#dce2da" stroke-width="1"/><path d="M${x + 40} ${y}v75M${x} ${y + 37}h83" stroke="#f3f4ef" stroke-width="5"/>`;
  }
  const course = state.course?.places || [];
  const line = course.map((p, i) => `${i ? 'L' : 'M'} ${p.x * 10} ${p.y * 8}`).join(' ');
  const visible = filteredPlaces();
  return `<div class="map-art" style="transform:scale(${state.zoom})"><svg class="base-map" viewBox="0 0 1000 800" preserveAspectRatio="none" aria-hidden="true"><rect width="1000" height="800" fill="#f1f2ec"/><g transform="rotate(-13 500 400)">${blocks}<path d="M-100 312H1100M360-100V900" stroke="#d6dbd2" stroke-width="30"/><path d="M-100 312H1100M360-100V900" stroke="#fffefa" stroke-width="25"/><path d="M-100 600H1100M790-100V900" stroke="#fffefa" stroke-width="21"/><path d="M-100 314H1100" stroke="#d2c9b1" stroke-width="2" stroke-dasharray="9 8"/></g><path d="M-20 460Q135 460 164 550T370 830H-20Z" fill="#d4e1cb"/><path d="M-30 590Q90 480 150 650T325 830" fill="none" stroke="#eaf0df" stroke-width="14"/><path d="M670 800Q730 655 1030 625V830Z" fill="#cce2e7"/><path d="M650 800Q724 635 1030 607" fill="none" stroke="#e5edd9" stroke-width="24"/><text x="490" y="165" font-size="22" fill="#939e91" font-family="sans-serif" letter-spacing="6">${esc(state.conditions.region)}동</text><text x="70" y="655" font-size="15" fill="#8da480" font-family="sans-serif">동네 공원</text><text x="820" y="740" font-size="14" fill="#87a8b1" font-family="sans-serif">물빛 산책로</text><text x="390" y="620" font-size="12" fill="#a2aa9e" font-family="sans-serif" transform="rotate(-13 390 620)">연무장길 · 예시</text><path d="${line}" fill="none" stroke="#fff" stroke-width="9" stroke-linejoin="round"/><path d="${line}" fill="none" stroke="#476ce2" stroke-width="4" stroke-linecap="round" stroke-dasharray="5 8" stroke-linejoin="round"/></svg>
    ${visible.map(p => { const idx = course.findIndex(x => x.id === p.id); return `<button class="pin-button ${state.selected === p.id ? 'selected' : ''} ${idx === -1 ? 'alternative' : ''}" data-action="place" data-id="${p.id}" style="left:${p.x}%;top:${p.y}%" aria-label="${esc(p.name)} 장소 상세">${idx > -1 ? `<b>${idx + 1}</b>${esc(p.name)}` : icon(p.category === '카페' ? 'coffee' : 'pin')}</button>`; }).join('')}</div>${!visible.length ? '<div class="map-empty">검색 결과가 없어요. 검색어나 분류를 바꿔 주세요.</div>' : ''}`;
}
function chatPanel() {
  return `<section class="chat-panel" aria-label="AI 코스 계획 체험"><div class="chat-heading"><div class="row"><span class="ai-avatar">${icon('spark')}</span><strong>우리의 하루를 함께 계획해요</strong></div><p>샘플 대화 체험 · 입력한 조건을 코스에 반영해요</p></div><div class="messages" aria-live="polite" aria-label="대화 내역">${state.messages.map(m => `<div class="bubble ${m.role === 'user' ? 'user' : ''}">${esc(m.text)}</div>${m.course ? `<div class="chat-route"><h3>${esc(m.course.title)}</h3><p>${m.course.places.map(p => esc(p.name)).join(' → ')}</p>${btn('chat-course', '이 코스를 지도에서 보기', 'map', '', `data-id="${esc(m.course.id)}"`)}</div>` : ''}`).join('')}${state.chatting ? '<div class="bubble" role="status">조건에 맞는 하루를 찾고 있어요…</div>' : ''}</div><div class="suggestions">${['실내로 바꿔 줘', '1인 3만원으로', '로맨틱한 데이트'].map(x => `<button data-action="suggest" data-message="${x}" ${state.chatting ? 'disabled' : ''}>${x}</button>`).join('')}</div><form id="chat-form" class="chat-compose"><textarea id="chat-input" name="message" placeholder="어떤 데이트를 하고 싶으세요?" aria-label="데이트 요청 메시지" maxlength="1500" required ${state.chatting ? 'disabled' : ''}></textarea><button aria-label="메시지 보내기" ${state.chatting ? 'disabled' : ''}>${icon('arrow')}</button></form><p class="chat-note">현재 선택한 지역·예산·시간을 이어서 반영합니다.</p></section>`;
}
function savedPage() { return `${greeting('다음에 함께 가요.', '마음에 든 하루를 모아 두었어요. 언제든 다시 꺼내 보세요.', 'OUR LITTLE COLLECTION')}${state.saved.length ? `<div class="saved-grid">${state.saved.map(c => courseCard(c, true)).join('')}</div>` : `<div class="empty-state">${icon('heart')}<h2>아직 저장한 코스가 없어요.</h2><p>마음에 드는 코스의 하트를 눌러 주세요.<br>우리의 다음 데이트가 여기에 모여요.</p>${btn('nav', '첫 번째 코스 찾아보기', 'arrow', 'primary', 'data-tab="explore"')}</div>`}`; }
function profilePage() {
  const p = state.profile;
  return `${greeting('우리의 취향을 알아가는 곳.', '취향을 남겨 두면 다음 계획을 시작하기가 조금 더 쉬워져요.', 'A LITTLE MORE ABOUT YOU')}<div class="profile-grid"><section class="profile-card"><div class="avatar">${esc(p?.name?.slice(0, 1) || '나')}</div><h2>${esc(p?.name || '반가워요, 여행자')}님</h2><p>${p ? '이 브라우저에 저장된 체험 프로필입니다.' : '프로필을 만들고 우리만의 취향을 남겨 보세요.'}</p><dl class="profile-info">${[['나이', p?.age ? `${p.age}세` : '선택하지 않음'], ['성별', p?.gender || '선택하지 않음'], ['성격', p?.personality || '선택하지 않음'], ['MBTI', p?.mbti || '선택하지 않음'], ['관심사', p?.interests?.join(', ') || '선택하지 않음']].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${btn(p ? 'edit-profile' : 'onboard', p ? '취향 프로필 수정' : '내 취향으로 시작하기', 'user', 'primary full')}</section><section class="profile-card"><h2 style="font-size:18px">이용 안내</h2><div class="info-line"><strong>베타 체험 모드</strong><p>실제 회원가입 없이 프로필과 추천 흐름을 체험할 수 있어요. 코스와 장소는 샘플이며 실제 예약·운영 정보가 아닙니다.</p></div><div class="info-line"><strong>위치 설정</strong><p>${esc(p?.location || '지역을 직접 선택하고 있어요.')}<br>정확한 위치는 저장하지 않습니다.</p>${btn('location', '위치 권한 설정', 'target', 'outline')}</div><div class="info-line"><strong>저장 공간</strong><p>프로필과 저장한 코스는 이 브라우저에만 저장됩니다. 다른 기기와 동기화되지 않습니다.</p></div>${btn('reset-confirm', '내 체험 데이터 초기화', 'trash', 'ghost danger')}</section></div>`;
}

const dialog = $('#dialog');
function openDialog(title, body, footer = '') {
  modalReturn = document.activeElement;
  dialog.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${title}</h2>${actionIcon('close', 'close', '닫기')}</div><div class="dialog-body">${body}</div>${footer ? `<div class="dialog-actions">${footer}</div>` : ''}`;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
function closeDialog() { dialog.close(); modalReturn?.focus?.(); }
dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(); } });
function selectField(name, label, values, current) { return `<label class="field">${label}<select name="${name}">${values.map(v => { const [value, text] = Array.isArray(v) ? v : [v, v]; return `<option value="${esc(value)}" ${String(value) === String(current) ? 'selected' : ''}>${esc(text)}</option>`; }).join('')}</select></label>`; }
function filtersDialog() {
  const c = state.conditions;
  openDialog('어떤 하루를 만들까요?', `<p>이번 데이트에 맞는 조건을 골라 주세요.<br>부담 없는 예산과 편안한 동선부터 시작해요.</p><form id="conditions-form"><div class="form-grid"><label class="field">희망 지역<input name="region" type="text" maxlength="60" value="${esc(c.region)}" placeholder="예: 부산 해운대, 수원 행궁동, 제주 애월" required></label>${selectField('purpose', '오늘의 목적', ['데이트', '여행'], c.purpose)}<label class="field">날짜<input name="date" type="date" value="${esc(c.date)}" required></label><label class="field">시작 시간<input name="start" type="time" value="${esc(c.start)}" required></label>${selectField('duration', '함께할 시간', [[120, '2시간'], [180, '3시간'], [240, '4시간'], [360, '6시간']], c.duration)}<label class="field">1인당 예산 (원)<input name="budget" type="number" min="0" max="1000000" step="500" value="${c.budget}" required></label>${selectField('mood', '선호 분위기', ['여유로운', '감성적인', '로맨틱한', '활동적인'], c.mood)}${selectField('transport', '이동수단', ['도보', '대중교통', '자동차'], c.transport)}${selectField('environment', '실내 · 실외', [['전체', '상관없어요'], '실내', '실외'], c.environment)}</div><div class="form-note">시·군·구나 동네 이름을 입력해 주세요. 실제 장소 검색은 국내 지역을 지원하며, 샘플 모드에서는 성수·연남·해방촌만 이용할 수 있어요. 영업 여부와 교통 상황은 반영되지 않습니다.</div><p id="form-error" class="form-error" role="alert"></p></form>`, `<button class="btn primary" type="submit" form="conditions-form">${icon('spark')}이 조건으로 코스 찾기</button>`);
}
function lookupCourse(id) { return [state.course, ...state.saved, ...state.messages.map(m => m.course)].find(c => c && c.id === id) || state.course; }
function courseDialog(course) {
  if (!course) return;
  draftCourse = course;
  openDialog('우리의 하루', `<div class="detail-hero" style="border-radius:13px;overflow:hidden">${photo(course.places[0])}<span class="photo-caption">분위기 참고 이미지</span></div><div class="row" style="margin-top:20px"><span class="tag blue">${esc(course.conditions.region)}</span><span class="tag">${esc(course.conditions.purpose)}</span><span class="tag">샘플 코스</span></div><h3 class="detail-title">${esc(course.title)}</h3><p>${esc(course.conditions.date || dateISO)} · ${esc(course.conditions.start)}–${esc(course.end)}</p><div class="detail-summary"><span>${icon('clock')}${length(course.minutes)}</span><span>${icon('wallet')}1인 ${won(course.totalCost)}</span><span>${icon('walk')}${esc(course.conditions.transport)}</span></div><div class="timeline">${course.places.map((p, i) => `<div class="stop"><time>${p.time}</time><span class="stop-number">${i + 1}</span><div><button class="stop-place" data-action="place" data-id="${p.id}" data-from="course">${photo(p)}<span><span class="small muted">${esc(p.category)} · ${p.stay}분</span><h3>${esc(p.name)}</h3><p>${won(p.cost)} · ${esc(p.environment)}</p></span></button>${i < course.places.length - 1 ? `<p class="travel-note">${icon('walk')} ${esc(course.conditions.transport)} 약 ${course.places[i + 1].travel}분 · 예시</p>` : ''}</div></div>`).join('')}</div><div class="form-note">장소·영업시간·이동 시간·비용은 샘플입니다. 실제 장소 데이터와 경로 최적화는 아직 연결되지 않았습니다.</div>`, `${btn('save-detail', isSaved(course) ? '저장 취소' : '코스 저장', 'heart', 'primary', `data-id="${course.id}"`)}${btn('share', '공유', 'share', 'outline', `data-id="${course.id}"`)}${btn('use-course', '지도', 'map', 'outline', `data-id="${course.id}"`)}`);
  if (!course.demo) {
    dialog.querySelector('.dialog-body>.row .tag:last-child').textContent = '실제 장소 · 추정 일정';
    dialog.querySelector('.form-note').textContent = '카카오에서 검색한 실제 장소입니다. 비용·실내외·체류·이동 시간은 분류별 추정값으로 실제 영업 여부·가격·교통은 각 장소에서 확인해 주세요. 지도 선은 방문 순서만 표시합니다.';
  }
}
function placeDialog(id, fromCourse = false) {
  const p = state.places.find(p => p.id === id) || draftCourse?.places.find(p => p.id === id); if (!p) return;
  state.selected = id;
  const map = $('#map-render'); if (map) map.innerHTML = mapArt();
  refreshLiveMap();
  openDialog('장소 자세히 보기', `<div class="detail-hero" style="border-radius:13px;overflow:hidden">${photo(p)}<span class="photo-caption">분위기 참고 이미지</span></div><div class="row" style="margin-top:20px"><span class="tag blue">${esc(p.category)}</span><span class="tag">${esc(p.environment)}</span><span class="tag">샘플 장소</span></div><h3 class="detail-title">${esc(p.name)}</h3><p>${esc(p.description)}</p><div class="place-detail-grid">${icon('pin')}<span>${esc(p.address)}<br><small>실제 업체 주소가 아닌 체험용 장소입니다.</small></span>${icon('clock')}<span>${esc(p.hours)}<br><small>추천 체류 시간 ${p.stay}분</small></span>${icon('wallet')}<span>1인 예상 비용 ${won(p.cost)}</span>${icon('spark')}<span>${esc(p.mood)} 분위기를 좋아하는 분께 추천해요.</span></div>`, `${fromCourse ? btn('back-course', '코스로 돌아가기', 'back', 'outline') : btn('close', '닫기', '', 'outline')}${btn('place-chat', '이 취향으로 코스 만들기', 'spark', 'primary', `data-id="${p.id}"`)}`);
  if (!p.demo) {
    dialog.querySelector('.dialog-body>.row .tag:last-child').textContent = '카카오 장소 정보';
    const addressNote = dialog.querySelector('.place-detail-grid span small'); if (addressNote) addressNote.textContent = '카카오 장소 검색에서 제공한 주소입니다.';
    const reason = dialog.querySelector('.place-detail-grid span:last-child'); if (reason) reason.textContent = '분위기·실내외·가격·영업 여부는 방문 전 확인이 필요합니다.';
    if (p.sourceUrl) dialog.querySelector('.dialog-actions').insertAdjacentHTML('afterbegin', `<a class="btn outline" href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">카카오맵에서 확인</a>`);
  }
}
function onboard(step = 0, editing = false) {
  const progress = `<div class="onboarding-mark" aria-label="${step + 1} / 3 단계">${[0, 1, 2].map(n => `<span class="${n <= step ? 'active' : ''}"></span>`).join('')}</div>`;
  if (step === 0) {
    openDialog('어디가지 베타에 오신 걸 환영해요', `${progress}<div class="welcome-visual">${icon('compass')}</div><h3 class="intro-title">오늘의 우리에게<br>딱 맞는 하루.</h3><p>좋아하는 것들을 알려 주세요.<br>우리만의 데이트와 여행을 함께 만들어 볼게요.</p><div class="form-note">지금은 로그인·회원가입 화면 체험입니다. 실제 계정이나 비밀번호를 생성하지 않습니다.</div><div class="stack" style="margin-top:20px">${btn('signup', '취향 프로필 만들기', 'arrow', 'primary full')}${btn('demo-login', '체험 로그인', 'user', 'outline full')}</div><button class="onboarding-skip" data-action="close">먼저 둘러볼게요</button>`);
  } else if (step === 1) {
  const p = editing ? state.profile || {} : draftProfile;
    openDialog(editing ? '나의 취향 수정' : '어떤 순간을 좋아하나요?', `${progress}<p>이름 외에는 모두 선택 사항이에요.<br>MBTI보다 직접 고른 취향을 먼저 참고해요.</p><form id="profile-form"><div class="form-grid"><label class="field wide">이름 또는 별명<input name="name" placeholder="어떻게 불러 드릴까요?" maxlength="20" value="${esc(p.name || '')}" required autocomplete="nickname"></label>${selectField('gender', '성별 (선택)', [['', '선택하지 않음'], '여성', '남성', '직접 규정하지 않음'], p.gender)}<label class="field">나이 (선택)<input name="age" type="number" min="14" max="120" value="${esc(p.age || '')}" placeholder="만 나이"></label>${selectField('personality', '성격 (선택)', [['', '선택하지 않음'], '차분한 편', '활발한 편', '상황에 따라 달라요'], p.personality)}${selectField('mbti', 'MBTI (선택)', [['', '모르겠어요'], ...['I', 'E'].flatMap(a => ['N', 'S'].flatMap(b => ['F', 'T'].flatMap(c => ['P', 'J'].map(d => a + b + c + d))))], p.mbti)}<fieldset class="field wide" style="border:0;padding:0;margin:0"><legend style="margin-bottom:10px">좋아하는 활동 (여러 개 선택)</legend><div class="choices">${['카페', '맛집', '전시', '산책', '사진', '드라이브'].map(x => `<label class="choice"><input type="checkbox" name="interests" value="${x}" ${p.interests?.includes(x) ? 'checked' : ''}>${x}</label>`).join('')}</div></fieldset></div><p class="form-note">프로필은 이 브라우저에만 저장돼요. 이번 일정에서 직접 선택한 조건을 우선합니다.</p><p id="form-error" class="form-error" role="alert"></p><input type="hidden" name="editing" value="${editing}"></form>`, `<button class="btn primary" type="submit" form="profile-form">${editing ? '프로필 저장' : '다음으로'}${icon('arrow')}</button>`);
  } else {
    openDialog('우리, 어디에서 만날까요?', `${progress}<div class="welcome-visual">${icon('pin')}</div><h3 class="intro-title">가까운 곳부터<br>새롭게 발견해요.</h3><p>위치 권한은 선택 사항이에요. 허용하지 않아도 원하는 지역을 직접 골라 모든 체험 기능을 이용할 수 있어요.</p><div class="form-note">위치 권한 흐름만 체험하며, 좌표는 서버로 전송하거나 저장하지 않습니다. 코스는 선택한 샘플 지역을 기준으로 표시됩니다.</div><p id="location-status" class="form-error" role="status"></p>`, `${btn('manual-location', '지역 직접 선택', '', 'outline')}${btn('allow-location', '위치 권한 설정', 'target', 'primary')}`);
  }
}
async function requestLocation() {
  if (window.EodigajiNative) {
    try { await window.EodigajiNative.requestLocation(); await finishProfile('앱 위치 권한 허용 · 지역 직접 선택'); }
    catch (e) { const status = $('#location-status'); if (status) status.textContent = e.message || '위치를 확인할 수 없어요. 지역을 직접 선택해 주세요.'; else toast('위치를 확인할 수 없어요. 지역을 직접 선택해 주세요.'); }
    return;
  }
  if (!navigator.geolocation) { toast('이 환경에서는 위치를 사용할 수 없어요. 지역을 직접 선택해 주세요.'); return; }
  const status = $('#location-status'); if (status) status.textContent = '브라우저에서 위치 권한을 확인해 주세요.';
  navigator.geolocation.getCurrentPosition(() => finishProfile('위치 권한 허용 · 샘플 지역 직접 선택'), () => { if ($('#location-status')) $('#location-status').textContent = '위치를 확인할 수 없어요. “지역 직접 선택”으로 계속할 수 있습니다.'; else toast('위치 권한을 확인하지 못했어요. 지역을 직접 선택할 수 있습니다.'); }, { timeout: 8000, maximumAge: 0, enableHighAccuracy: false });
}
async function finishProfile(location) {
  state.profile = { ...(state.profile || draftProfile), name: state.profile?.name || draftProfile.name || '여행자', location };
  if (state.user) { try { await api('/api/profile', { profile: state.profile }); } catch (e) { toast(e.message); return; } }
  else persist('profile', state.profile);
  closeDialog(); render(); toast('준비됐어요. 우리의 첫 코스를 만들어 볼까요?'); filtersDialog();
}
// 현재 조건과 최근 대화를 함께 보내며 처리 중에는 중복 전송을 막습니다.
async function sendChat(message) {
  if (state.chatting || !message.trim()) return;
  state.messages.push({ role: 'user', text: message.trim() }); state.chatting = true; state.view = 'chat'; state.tab = 'explore'; render();
    try { const reply = await api('/api/chat', { message, conditions: state.conditions, history: state.messages.slice(-9, -1).map(m => ({ role: m.role, text: m.text })) }); state.messages.push({ role: 'assistant', text: reply.message, course: reply.course }); if (reply.course) { acceptCourse(reply.course); state.query = ''; state.filter = '전체'; } }
  catch (e) { state.messages.push({ role: 'assistant', text: e.message }); }
  finally { state.chatting = false; render(); $('#chat-input')?.focus(); }
}
// 로그인 사용자는 서버 저장 성공 후 화면을 갱신하고, 게스트는 이 기기의 localStorage에 저장합니다.
async function toggleSave(course) {
  if (!course) return;
  const removed = isSaved(course);
  if (state.user) { try { const { availablePlaces, ...compact } = course; await api('/api/saved', removed ? { remove: course.id } : { course: compact }); } catch (e) { toast(e.message); return; } }
  state.saved = removed ? state.saved.filter(p => p.id !== course.id) : [course, ...state.saved];
  const persisted = state.user || persist('saved', state.saved); render(); if (persisted) toast(removed ? '저장한 코스에서 삭제했어요.' : '둘만의 다음 하루를 저장했어요.');
}
async function share(course) {
  const text = `어디가지 베타 · ${course.title}\n${course.conditions.date || dateISO}\n${course.places.map(p => `${p.time} ${p.name} (${won(p.cost)})`).join('\n')}\n1인 합계 ${won(course.totalCost)} · ${length(course.minutes)}\n${course.demo ? '※ 시연용 샘플 코스입니다.' : '※ 카카오 검색 장소로 구성한 코스이며 비용·시간은 추정입니다. 영업 여부는 방문 전 확인해 주세요.'}`;
  if (window.EodigajiNative?.installed) { try { await window.EodigajiNative.share(text); } catch { toast('공유를 취소했거나 사용할 수 없어요.'); } return; }
  try { await navigator.clipboard.writeText(text); toast('코스를 복사했어요. 메시지에 붙여 넣어 공유하세요.'); }
  catch { openDialog('코스 공유', `<p>아래 일정을 복사해서 함께 갈 사람에게 보내 주세요.</p><textarea class="share-text" readonly aria-label="공유할 코스 내용">${esc(text)}</textarea>`, btn('close', '닫기', '', 'primary')); $('.share-text')?.select(); }
}
// 이벤트 위임: 화면을 다시 그려도 data-action 속성으로 버튼 동작을 한 곳에서 처리합니다.
document.addEventListener('click', async e => {
  const target = e.target.closest('[data-action]'); if (!target || target.disabled) return;
  const { action, id } = target.dataset;
  if (action === 'close') closeDialog();
  if (action === 'nav') { state.tab = target.dataset.tab; render(); window.scrollTo(0, 0); }
  if (action === 'view') { state.view = target.dataset.view; state.tab = 'explore'; render(); }
  if (action === 'filters') filtersDialog();
  if (action === 'category') { state.filter = target.dataset.category; render(); }
  if (['zoom-in', 'zoom-out', 'map-reset'].includes(action)) { if (state.course && !state.course.demo) { if (action === 'map-reset') refreshLiveMap(); else zoomLiveMap(action === 'zoom-in' ? -1 : 1); } else { state.zoom = action === 'map-reset' ? 1 : Math.max(1, Math.min(1.75, state.zoom + (action === 'zoom-in' ? .25 : -.25))); $('#map-render').innerHTML = mapArt(); } }
  if (action === 'course') courseDialog(lookupCourse(id));
  if (action === 'place') placeDialog(id, target.dataset.from === 'course');
  if (action === 'back-course') courseDialog(draftCourse);
  if (action === 'save' || action === 'save-detail') { const c = lookupCourse(id); target.disabled = true; await toggleSave(c); target.disabled = false; if (action === 'save-detail') courseDialog(c); }
  if (action === 'remove-saved') toggleSave(lookupCourse(id));
  if (action === 'share') await share(lookupCourse(id));
  if (action === 'use-course' || action === 'chat-course') { const c = lookupCourse(id); acceptCourse(c); if (!c.demo && !c.availablePlaces) state.places = c.places; state.view = 'map'; state.tab = 'explore'; state.query = ''; state.filter = '전체'; closeDialog(); render(); window.scrollTo(0, 0); }
  if (action === 'suggest') await sendChat(target.dataset.message);
  if (action === 'place-chat') { const p = state.places.find(p => p.id === id); closeDialog(); await sendChat(`${p.region}에서 ${p.environment}, ${p.mood === '여유로운' ? '조용한' : p.mood} ${state.conditions.purpose}`); }
  if (action === 'onboard') { draftProfile = {}; if (state.config.auth) authDialog('login'); else onboard(0); }
  if (action === 'connections') connectionsDialog();
  if (action === 'auth-login' || action === 'auth-signup') authDialog(action === 'auth-login' ? 'login' : 'signup');
  if (action === 'logout') { try { await api('/api/auth/logout', {}); } catch (e) { toast(e.message); } state.user = null; state.profile = stored('profile', null); state.saved = stored('saved', []); closeDialog(); render(); }
  if (action === 'signup') onboard(1);
  if (action === 'edit-profile') onboard(1, true);
  if (action === 'demo-login') { if (state.profile) { closeDialog(); state.tab = 'profile'; render(); } else { draftProfile = { name: '여행자' }; onboard(1); } }
  if (action === 'location') { draftProfile = state.profile || {}; onboard(2); }
  if (action === 'allow-location') await requestLocation();
  if (action === 'manual-location') finishProfile('지역 직접 선택');
  if (action === 'reset-confirm') openDialog('체험 데이터를 초기화할까요?', '<p>이 브라우저에 저장한 프로필과 코스가 삭제됩니다. 초기화한 데이터는 되돌릴 수 없습니다.</p>', `${btn('close', '취소', '', 'outline')}${btn('reset', '초기화', 'trash', 'primary')}`);
  if (action === 'reset') { state.profile = null; state.saved = []; draftProfile = {}; persist('profile', null); persist('saved', []); closeDialog(); render(); toast('프로필과 저장한 코스를 초기화했어요.'); }
  if (action === 'about') openDialog('어디가지 베타 · 체험 안내', '<h3 class="intro-title">대화로 찾는<br>우리만의 다음 목적지.</h3><p>지도 탐색, 대화형 코스 추천, 성향 조사, 코스 저장을 미리 경험하는 시제품입니다.</p><div class="info-line"><strong>지금 작동하는 기능</strong><p>조건별 샘플 코스 생성, 조건을 해석하는 규칙 기반 대화, 장소 검색, 지도 확대, 코스 상세, 브라우저 저장과 텍스트 공유</p></div><div class="info-line"><strong>실서비스 연결 전인 기능</strong><p>실제 회원 인증, 대규모 언어 모델 AI, 실제 지도·영업정보·교통 경로, 클라우드 동기화</p></div><div class="info-line"><strong>서버 운영</strong><p>현재 PC의 로컬 Node 서버에서 실행됩니다. 외부 사용자에게 공개되거나 클라우드에 배포된 상태가 아닙니다.</p></div>', btn('close', '확인했어요', '', 'primary'));
});
document.addEventListener('input', e => { if (e.target.id === 'map-search') { state.query = e.target.value; $('#map-render').innerHTML = mapArt(); refreshLiveMap(); const d = $('.discovery'); if (d) d.outerHTML = discovery(); } });
document.addEventListener('keydown', e => { if (e.target.id === 'chat-input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#chat-form').requestSubmit(); } });
document.addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'chat-form') return sendChat(new FormData(e.target).get('message'));
  if (e.target.id === 'profile-form') {
    const data = new FormData(e.target); const name = data.get('name').trim();
    if (!name) { $('#form-error').textContent = '이름 또는 별명을 입력해 주세요.'; return; }
    draftProfile = { name, age: data.get('age'), gender: data.get('gender'), personality: data.get('personality'), mbti: data.get('mbti'), interests: data.getAll('interests') };
    if (data.get('editing') === 'true') { const profile = { ...state.profile, ...draftProfile }; if (state.user) { try { await api('/api/profile', { profile }); } catch (e) { $('#form-error').textContent = e.message; return; } } else persist('profile', profile); state.profile = profile; closeDialog(); render(); toast('취향 프로필을 저장했어요.'); }
    else { if (draftProfile.interests.includes('전시')) state.conditions.mood = '감성적인'; else if (draftProfile.personality === '차분한 편') state.conditions.mood = '여유로운'; onboard(2); }
  }
  if (e.target.id === 'conditions-form' && !state.busy) {
    const conditions = Object.fromEntries(new FormData(e.target)); state.busy = true;
    const submit = dialog.querySelector('[type="submit"]'); submit.disabled = true; submit.textContent = '코스를 찾고 있어요…';
    try { const course = await api('/api/plan', conditions); acceptCourse(course); state.query = ''; state.filter = '전체'; state.selected = null; state.tab = 'explore'; closeDialog(); render(); toast('선택한 조건으로 코스를 준비했어요.'); }
    catch (err) { if ($('#form-error')) $('#form-error').textContent = err.message; }
    finally { state.busy = false; if (submit.isConnected) { submit.disabled = false; submit.innerHTML = `${icon('spark')}이 조건으로 코스 찾기`; } }
  }
});
async function init() {
  const confirmation = new URLSearchParams(window.location.hash.slice(1));
  const returnedFromEmail = confirmation.has('access_token') || confirmation.has('error') || confirmation.has('error_code');
  if (returnedFromEmail) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  try { state.config = await api('/api/config'); [state.places, state.course] = await Promise.all([api('/api/places'), api('/api/plan', state.conditions)]); state.conditions = state.course.conditions;
    if (state.config.auth) { const result = await api('/api/auth/user'); state.user = result.user; if (state.user) await loadAccount(); }
    render();
    if (returnedFromEmail) {
      authDialog('login');
      $('#auth-error').textContent = confirmation.has('error') || confirmation.has('error_code')
        ? '인증 링크가 만료되었거나 이미 사용되었을 수 있어요. 먼저 로그인해 보고, 인증되지 않았다면 새 인증 메일을 받아 주세요.'
        : '이메일 인증을 마쳤어요. 가입한 이메일과 비밀번호로 로그인해 주세요.';
    }
    if (window.EodigajiNative?.installed && !state.profile && !stored('welcome-seen', false)) { persist('welcome-seen', true); if (state.config.auth) authDialog('signup'); else onboard(0); }
  }
  catch (e) { $('#app').innerHTML = `<div class="boot">${brand}<p>${esc(e.message)}</p><button class="btn primary" id="retry">다시 연결하기</button>${btn('connections', '서비스 설정 확인', 'info', 'outline')}</div>`; $('#retry').addEventListener('click', init); }
}
function connectionsDialog() {
  if (window.EodigajiNative && state.config.offline) {
    openDialog('어디가지 베타 · Android', '<h3 class="intro-title">휴대폰에서 바로,<br>우리의 하루를 계획해요.</h3><p>화면과 추천 기능이 앱 안에 들어 있어 PC 서버를 켜지 않아도 사용할 수 있습니다.</p><div class="info-line"><strong>지금 사용할 수 있어요</strong><p>샘플 코스 생성, 대화형 조건 수정, 취향 프로필, 장소 상세, 코스 저장과 공유</p></div><div class="info-line"><strong>실제 AI·지도·계정</strong><p>온라인 서비스용 서버가 연결되면 사용할 수 있습니다. 현재는 앱 안의 샘플 데이터를 사용합니다.</p></div>', btn('close', '확인', '', 'primary'));
    return;
  }
  const c = state.config;
  const rows = [
    ['AI 대화', c.ai, c.aiProvider === 'openai' ? 'OpenAI' : 'Gemini', 'https://aistudio.google.com/apikey'],
    ['장소 검색', c.places, '카카오 REST API', 'https://developers.kakao.com/console/app'],
    ['지도 표시', c.map, '카카오 JavaScript API', 'https://developers.kakao.com/console/app'],
    ['회원 인증 · DB', c.auth, 'Supabase Free', 'https://supabase.com/dashboard'],
  ];
  openDialog('실제 서비스 연결', `<p>무료 한도 내에서 시작할 수 있어요.<br>본인 계정에서 키를 발급한 후 프로젝트의 <b>.env</b>에 입력해 주세요. 비밀 키는 채팅에 보내지 마세요.</p>${rows.map(([title, ok, name, link]) => `<div class="info-line"><div class="row spread"><strong>${title}</strong><span class="tag ${ok ? 'green' : ''}">${ok ? '키 설정됨' : '키 입력 대기'}</span></div><p>${name} · <a href="${link}" target="_blank" rel="noopener noreferrer">발급 페이지 열기</a></p></div>`).join('')}<div class="form-note">키가 설정되어도 계정 권한·무료 한도·웹 도메인 등록에 따라 호출이 제한될 수 있어요. Supabase DB는 제공된 schema.sql을 먼저 실행해야 합니다. .env 변경 후 서버를 재시작해 주세요.</div>`, btn('close', '확인', '', 'primary'));
}
function authDialog(mode) {
  const signup = mode === 'signup';
  openDialog(signup ? '회원가입' : '로그인', `<p>이메일 계정으로 코스와 취향을 저장하세요.</p><form id="auth-form"><input type="hidden" name="mode" value="${mode}"><div class="stack"><label class="field">이메일<input type="email" name="email" required maxlength="254" autocomplete="email"></label><label class="field">비밀번호<input type="password" name="password" required minlength="8" maxlength="128" autocomplete="${signup ? 'new-password' : 'current-password'}"></label></div><div class="form-note">${signup ? '이메일과 비밀번호로 가입하고 바로 로그인하세요. 비밀번호는 브라우저 저장 공간에 보관하지 않습니다.' : 'Supabase에서 계정을 인증합니다. 비밀번호는 브라우저 저장 공간에 보관하지 않습니다.'}</div><p id="auth-error" class="form-error" role="alert"></p></form>`, `${btn(signup ? 'auth-login' : 'auth-signup', signup ? '로그인으로' : '회원가입', '', 'outline')}<button class="btn primary" type="submit" form="auth-form">${signup ? '가입하기' : '로그인'}</button>`);
}
async function loadAccount() {
  const data = await api('/api/account'); state.profile = data.profile; state.saved = data.saved;
}
document.addEventListener('submit', async e => {
  if (e.target.id !== 'auth-form') return; e.preventDefault();
  const data = new FormData(e.target); const submit = dialog.querySelector('[type=submit]'); submit.disabled = true;
  try {
    const result = await api(`/api/auth/${data.get('mode')}`, { email: data.get('email'), password: data.get('password') });
    e.target.reset();
    if (!result.user) { $('#auth-error').textContent = result.message; return; }
    state.user = result.user; state.profile = null; state.saved = [];
    try { await loadAccount(); } catch (err) { toast(`로그인은 완료됐지만 저장소 연결을 확인해야 해요. ${err.message}`); }
    closeDialog(); render(); if (!state.profile) { draftProfile = {}; onboard(1); }
  } catch (err) { if ($('#auth-error')) $('#auth-error').textContent = err.message; }
  finally { if (submit.isConnected) submit.disabled = false; }
});
document.addEventListener('error', e => {
  if (e.target instanceof HTMLImageElement) {
    const replacement = document.createElement('span'); replacement.className = `${e.target.className} photo-placeholder`;
    replacement.setAttribute('role', 'img'); replacement.setAttribute('aria-label', '사진을 불러올 수 없어요');
    replacement.innerHTML = `${icon('pin')}<small>사진을 불러올 수 없어요</small>`; e.target.replaceWith(replacement);
  }
}, true);
window.addEventListener('eodigaji:back', () => {
  if (dialog.open) { closeDialog(); return; }
  if (state.tab !== 'explore' || state.view !== 'map') { state.tab = 'explore'; state.view = 'map'; render(); return; }
  openDialog('앱을 종료할까요?', '<p>저장한 코스는 다음에 앱을 열어도 그대로 남아 있어요.</p>', `${btn('close', '계속 둘러보기', '', 'outline')}<button class="btn primary" id="exit-app">종료</button>`);
  $('#exit-app').addEventListener('click', () => window.EodigajiNative?.exit());
});
init();
