let loading, map;
async function sdk(key) {
  if (window.kakao?.maps?.Map) return window.kakao.maps;
  if (!loading) loading = new Promise((resolve, reject) => {
    const script = document.createElement('script'); const timeout = setTimeout(() => reject(new Error('지도 응답 시간이 초과됐어요. 카카오 웹 도메인 설정을 확인해 주세요.')), 15000);
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.onload = () => { if (!window.kakao?.maps?.load) { clearTimeout(timeout); reject(new Error('카카오 지도 권한과 JavaScript 키를 확인해 주세요.')); return; } window.kakao.maps.load(() => { clearTimeout(timeout); resolve(window.kakao.maps); }); };
    script.onerror = () => { clearTimeout(timeout); reject(new Error('카카오 지도를 불러오지 못했어요. JavaScript 키와 도메인 등록을 확인해 주세요.')); };
    document.head.append(script);
  }).catch(e => { loading = null; throw e; });
  return loading;
}
// 실제 좌표에 마커를 표시합니다. 코스 선은 장소 간 연결선이며 길찾기 결과가 아닙니다.
export async function mountLiveMap(element, key, places, route, onSelect) {
  map = null;
  try {
    const maps = await sdk(key); if (!element.isConnected) return;
    const points = places.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    const center = points[0] || { lat: 37.5445, lng: 127.0557 };
    map = new maps.Map(element, { center: new maps.LatLng(center.lat, center.lng), level: 5 });
    const bounds = new maps.LatLngBounds();
    for (const p of points) {
      const position = new maps.LatLng(p.lat, p.lng); bounds.extend(position);
      const marker = new maps.Marker({ map, position, title: p.name });
      maps.event.addListener(marker, 'click', () => onSelect(p.id));
    }
    if (points.length > 1) map.setBounds(bounds, 110, 40, 110, 40);
    const path = route.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)).map(p => new maps.LatLng(p.lat, p.lng));
    if (path.length > 1) new maps.Polyline({ map, path, strokeWeight: 4, strokeColor: '#3159df', strokeOpacity: .8, strokeStyle: 'shortdash' });
  } catch (e) { if (element.isConnected) { element.textContent = e.message; element.classList.add('map-live-error'); } }
}
export function zoomLiveMap(delta) { if (!map) return; map.setLevel(Math.max(1, Math.min(12, map.getLevel() + delta))); }
