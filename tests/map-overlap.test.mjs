import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/live-map.js',import.meta.url),'utf8').replaceAll('export ','');
function harness(){
 const overlays=[];
 class LatLng {constructor(lat,lng){this.lat=lat;this.lng=lng;}}
 const maps={Map:class{setBounds(){}},LatLng,LatLngBounds:class{extend(){}},CustomOverlay:class{constructor(options){overlays.push(options);}},Polyline:class{}};
 const document={createElement:()=>({children:[],attrs:{},handlers:{},append(child){this.children.push(child);},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.handlers[k]=fn;}})};
 const context=vm.createContext({window:{kakao:{maps}},document});vm.runInContext(source,context);
 return{context,overlays};
}
test('colocated first and second stops both remain visible and independently selectable',async()=>{
 const h=harness(), selected=[];
 h.context.element={isConnected:true};h.context.route=[{id:'a',name:'카페',lat:37.5,lng:127},{id:'b',name:'전시',lat:37.5,lng:127},{id:'c',name:'식사',lat:37.51,lng:127.01}];h.context.onSelect=id=>selected.push(id);
 await vm.runInContext('mountLiveMap(element,"key",[],route,onSelect,null)',h.context);
 assert.equal(h.overlays.length,2);
 const buttons=h.overlays.flatMap(o=>o.content.children);
 assert.deepEqual(buttons.map(b=>b.textContent),['1','2','3']);
 buttons.forEach(b=>b.handlers.click());assert.deepEqual(selected,['a','b','c']);
});
test('missing coordinates do not renumber later itinerary stops',async()=>{
 const h=harness();h.context.element={isConnected:true};h.context.route=[{id:'a',name:'좌표없음'},{id:'b',name:'장소',lat:37.5,lng:127}];
 await vm.runInContext('mountLiveMap(element,"key",[],route,()=>{},null)',h.context);
 assert.equal(h.overlays[0].content.children[0].textContent,'2');
});
