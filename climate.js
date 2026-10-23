/* Vancouver climate normals shared by the Supertall tools: monthly temperature, rain, irradiation, sunshine, wind rose. Approximate YVR values. */
(function(){
'use strict';
const LAB=window.LAB; const $=LAB.$, fmtI=LAB.fmtI;
const CLIMATE = {
  city:'Vancouver, BC', lat:49.2827, lon:-123.1207,
  months:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  days:[31,28,31,30,31,30,31,31,30,31,30,31],
  doy21:[21,52,80,111,141,172,202,233,264,294,325,355],
  tz:[-8,-8,-7,-7,-7,-7,-7,-7,-7,-7,-8,-8],
  temp:[4.1,4.9,6.9,9.4,12.8,15.7,18.0,18.0,14.9,10.3,6.3,3.6],
  rain:[168,105,114,89,65,54,36,37,51,121,189,162],
  ghi:[0.9,1.7,2.8,4.2,5.4,5.8,6.2,5.3,3.8,2.1,1.1,0.7],
  sunshine:[60,91,134,185,222,226,290,277,212,120,60,56], // bright sunshine hours per month (YVR, approximate)
  daylight:[8.6,10.1,11.9,13.8,15.4,16.2,15.9,14.6,12.7,10.9,9.2,8.2], // hours per day
  hdd:2900, cdd:40, windMean:3.5, sunnyFraction:0.44,
  winds:[{id:'W',label:'Annual prevailing · west',dir:270,speed:3.5},{id:'E',label:'Winter outflow · east along the inlet',dir:90,speed:5},{id:'NW',label:'Summer sea breeze · north-west',dir:315,speed:4},{id:'SE',label:'Frontal storm · south-east',dir:135,speed:9}],
  // eight-sector wind rose, share of hours and mean speed at 10 m (YVR, approximate)
  rose:[{dir:0,name:'N',f:0.04,s:3.0},{dir:45,name:'NE',f:0.06,s:3.5},{dir:90,name:'E',f:0.24,s:4.5},{dir:135,name:'SE',f:0.12,s:5.0},{dir:180,name:'S',f:0.06,s:3.5},{dir:225,name:'SW',f:0.08,s:4.0},{dir:270,name:'W',f:0.24,s:4.5},{dir:315,name:'NW',f:0.16,s:4.0}],
};
CLIMATE.sunshineTotal=CLIMATE.sunshine.reduce((a,b)=>a+b,0);
LAB.CLIMATE=CLIMATE;
const stat=(k,v)=>`<div class="stat"><b>${v}</b><small>${k}</small></div>`;
function renderClimate(){
  const c=CLIMATE; $('climate').innerHTML=`<div class="wgrid">${stat('Location',c.city+' · 49.28° N')}${stat('Rain',fmtI(c.rain.reduce((a,b)=>a+b,0))+' mm/yr')}${stat('Sunshine',fmtI(c.sunshineTotal)+' h/yr')}${stat('Heating degree days',fmtI(c.hdd))}${stat('Mean wind','3.5 m/s · westerly')}${stat('Coldest / warmest','Dec 3.6 °C · Jul 18 °C')}</div>
  <div class="tbl-wrap"><table><thead><tr><th></th>${c.months.map(m=>`<th class="num">${m}</th>`).join('')}</tr></thead><tbody><tr><td>°C</td>${c.temp.map(v=>`<td class="num">${v.toFixed(0)}</td>`).join('')}</tr><tr><td>mm</td>${c.rain.map(v=>`<td class="num">${v}</td>`).join('')}</tr><tr><td>sun h</td>${c.sunshine.map(v=>`<td class="num">${v}</td>`).join('')}</tr><tr><td>kWh/m²/d</td>${c.ghi.map(v=>`<td class="num">${v.toFixed(1)}</td>`).join('')}</tr></tbody></table></div>
  <p class="note">Approximate Vancouver Airport normals. Wind rose: ${c.rose.map(r=>r.name+' '+Math.round(r.f*100)+'%').join(', ')}. Downtown sits on the harbour: the prevailing wind is westerly, winter outflow winds come from the east along Burrard Inlet, and the north shore mountains hold the view lines that shape downtown heights.</p>`;
}
LAB.climate={CLIMATE, render:renderClimate, init(){ renderClimate(); }};
})();
