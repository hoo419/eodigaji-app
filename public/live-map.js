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
export async function mountLiveMap(element, key, places, route, onSelect, routeDetails) {
  map = null;
  try {
    const maps = await sdk(key); if (!element.isConnected) return;
    const points = route.map((p,index) => ({...p, routeNumber:index+1})).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    const center = points[0] || { lat: 37.5445, lng: 127.0557 };
    map = new maps.Map(element, { center: new maps.LatLng(center.lat, center.lng), level: 5 });
    const bounds = new maps.LatLngBounds();
    // Nearby entrances can share coordinates. Keep every stop selectable in one overlay.
    const groups = [];
    for (const p of points) {
      const group = groups.find(g => Math.hypot((g[0].lat-p.lat)*111320, (g[0].lng-p.lng)*111320*Math.cos(p.lat*Math.PI/180)) < 25);
      if (group) group.push(p); else groups.push([p]);
    }
    for (const group of groups) {
      const position = new maps.LatLng(group[0].lat, group[0].lng);
      const content = document.createElement('div'); content.className = 'route-marker-group';
      for (const p of group) {
        bounds.extend(new maps.LatLng(p.lat,p.lng));
        const button = document.createElement('button');
        button.className = 'route-marker'; button.textContent = String(p.routeNumber); button.title = p.name;
        button.setAttribute('aria-label', p.routeNumber + '번 ' + p.name);
        button.addEventListener('click', () => onSelect(p.id)); content.append(button);
      }
      new maps.CustomOverlay({ map, position, content, xAnchor: .5, yAnchor: 1, zIndex: 10 });
    }
    if (points.length > 1) map.setBounds(bounds, 110, 40, 110, 40);
    const path = route.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)).map(p => new maps.LatLng(p.lat, p.lng));
    if (routeDetails?.legs?.some(leg => leg.actual)) {
      for (const leg of routeDetails.legs) for (const segment of leg.segments || []) {
        const line = segment.path.map(p => new maps.LatLng(p.lat,p.lng));
        line.forEach(p=>bounds.extend(p));
        if(line.length>1) new maps.Polyline({map,path:line,strokeWeight:5,strokeOpacity:.9,strokeColor:segment.mode==='WALKING'?'#23845c':segment.mode==='CAR'?'#3159df':'#8849be',strokeStyle:segment.mode==='WALKING'?'shortdash':'solid'});
      }
      map.setBounds(bounds,125,30,100,30);
    } else if (path.length > 1) new maps.Polyline({ map, path, strokeWeight: 3, strokeColor: '#818b99', strokeOpacity: .6, strokeStyle: 'shortdash' });
  } catch (e) { if (element.isConnected) { element.textContent = e.message; element.classList.add('map-live-error'); } }
}
export function zoomLiveMap(delta) { if (!map) return; map.setLevel(Math.max(1, Math.min(12, map.getLevel() + delta))); }
