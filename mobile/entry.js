import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Geolocation } from '@capacitor/geolocation';
import { Share } from '@capacitor/share';
import { createMobileClient } from './client.mjs';
import config from './config.json';

// APK에는 공개 서버 주소만 포함합니다. AI 등의 비밀 키는 서버에 남겨 둡니다.
// 공유 화면 코드가 이 연결 객체를 통해 Android 위치·공유·종료 기능을 호출합니다.
const native = Capacitor.isNativePlatform();
window.EodigajiNative = {
  installed: native,
  offline: !config.apiBase,
  request: createMobileClient({ apiBase: config.apiBase, request: options => CapacitorHttp.request(options) }),
  async requestLocation() {
    if (!native) { if (!navigator.geolocation) throw new Error('위치 기능을 사용할 수 없어요.'); return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(() => resolve(true), reject, { timeout: 8000 })); }
    const permissionName = Capacitor.getPlatform() === 'ios' ? 'location' : 'coarseLocation';
    let permission = await Geolocation.checkPermissions();
    if (!['granted', 'limited'].includes(permission[permissionName])) permission = await Geolocation.requestPermissions({ permissions: [permissionName] });
    if (!['granted', 'limited'].includes(permission[permissionName])) throw new Error('위치 권한을 허용하지 않았어요. 지역을 직접 선택할 수 있어요.');
    // 현재는 위치 사용 가능 여부만 확인하고 좌표를 보관하거나 서버로 전송하지 않습니다.
    await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 8000 });
    return true;
  },
  async share(text) {
    if (!native) return false;
    await Share.share({ title: '어디가지 베타 · 우리의 코스', text, dialogTitle: '함께 갈 사람에게 보내기' });
    return true;
  },
  exit: () => App.exitApp(),
};
if (native) {
  document.documentElement.classList.add('android-app');
  if (Capacitor.getPlatform() === 'android') App.addListener('backButton', () => window.dispatchEvent(new Event('eodigaji:back')));
}
// 화면 초기화보다 먼저 위 연결 객체를 만들어야 웹 API 대신 앱 내부 요청을 사용할 수 있습니다.
import('../public/app.js');
