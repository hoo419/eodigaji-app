let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
window.addEventListener('appinstalled', () => { installPrompt = null; });
if ('serviceWorker' in navigator && window.isSecureContext && !window.EodigajiNative) {
 navigator.serviceWorker.register('/sw.js').catch(() => { /* Online app remains usable when installation is unavailable. */ });
}
document.addEventListener('click', async event => {
 if (!event.target.closest('[data-action="install-app"]')) return;
 if (installPrompt) {
  const prompt = installPrompt; installPrompt = null;
  await prompt.prompt(); await prompt.userChoice; return;
 }
 const installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
 const dialog = document.querySelector('#dialog');
 const previousFocus = document.activeElement;
 dialog.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${installed ? '설치된 웹앱' : '홈 화면에 추가하기'}</h2><button class="btn outline" data-action="close">닫기</button></div><div class="dialog-body"><p>${installed ? '지금 설치된 어디가지 앱을 사용하고 있어요.' : 'Android: Chrome 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 선택하세요.<br><br>iPhone: Safari의 공유 메뉴에서 “홈 화면에 추가”를 선택하세요.'}</p>${!installed ? '<p>설치 메뉴가 없다면 지원하는 브라우저에서 다시 열어 주세요. AI와 지도 이용에는 인터넷 연결이 필요합니다.</p>' : ''}</div>`;
 dialog.addEventListener('close', () => previousFocus?.focus(), { once: true });
 if (!dialog.open) dialog.showModal();
});
