/* Vancouver climate for the Sun & Wind Studio. Defaults are typed approximations of Vancouver Airport normals; at boot the studio loads
   weather.json, distilled from the CWEC2020 typical-year EPW for Vancouver Intl AP (WMO 718920), and replaces them with measured values:
   monthly temperature, irradiation, sunshine and daylight, monthly and annual wind roses, the rain rose and driving-rain sums, plus the 8,760 hourly records. */
(function(){
'use strict';
const LAB=window.LAB; const $=LAB.$, fmtI=LAB.fmtI;
const CLIMATE = {
  city:'Vancouver, BC', lat:49.2827, lon:-123.1207, source:'typed Vancouver Airport normals (fallback)', loaded:false, pending:true,
  months:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  days:[31,28,31,30,31,30,31,31,30,31,30,31],
  doy21:[21,52,80,111,141,172,202,233,264,294,325,355],
  tz:[-8,-8,-7,-7,-7,-7,-7,-7,-7,-7,-8,-8],
  temp:[4.1,4.9,6.9,9.4,12.8,15.7,18.0,18.0,14.9,10.3,6.3,3.6],
  rain:[168,105,114,89,65,54,36,37,51,121,189,162],
  ghi:[0.9,1.7,2.8,4.2,5.4,5.8,6.2,5.3,3.8,2.1,1.1,0.7],
  sunshine:[60,91,134,185,222,226,290,277,212,120,60,56],
  daylight:[8.6,10.1,11.9,13.8,15.4,16.2,15.9,14.6,12.7,10.9,9.2,8.2],
  kd:[0.72,0.66,0.58,0.52,0.48,0.45,0.42,0.44,0.50,0.60,0.70,0.73],
  hdd:2900, cdd:40, windMean:3.5, sunnyFraction:0.44,
  winds:[{id:'W',label:'Annual prevailing · west',dir:270,speed:3.5},{id:'E',label:'Winter outflow · east along the inlet',dir:90,speed:5},{id:'NW',label:'Summer sea breeze · north-west',dir:315,speed:4},{id:'SE',label:'Frontal storm · south-east',dir:135,speed:9}],
  rose:[{dir:0,name:'N',f:0.04,s:3.0},{dir:45,name:'NE',f:0.06,s:3.5},{dir:90,name:'E',f:0.24,s:4.5},{dir:135,name:'SE',f:0.12,s:5.0},{dir:180,name:'S',f:0.06,s:3.5},{dir:225,name:'SW',f:0.08,s:4.0},{dir:270,name:'W',f:0.24,s:4.5},{dir:315,name:'NW',f:0.16,s:4.0}],
  roseMonthly:null, rainRose:null, wdrFace:null, wdrBins:null, hourly:null, stormSpeedP95:null,
};
CLIMATE.sunshineTotal=CLIMATE.sunshine.reduce((a,b)=>a+b,0);
LAB.CLIMATE=CLIMATE;
const stat=(k,v)=>`<div class="stat"><b>${v}</b><small>${k}</small></div>`;
function renderClimate(){
  const c=CLIMATE; const el=$('climate'); const hot=c.temp.indexOf(Math.max(...c.temp)), cold=c.temp.indexOf(Math.min(...c.temp));
  el.innerHTML=`<div class="wgrid">${stat('Station',c.loaded?(c.station||'Vancouver Intl AP')+' · '+c.lat.toFixed(2)+'° N':c.city+' · 49.28° N')}${stat('Rain',fmtI(c.rain.reduce((a,b)=>a+b,0))+' mm/yr')}${stat('Sunshine',fmtI(c.sunshineTotal)+' h/yr')}${stat('Heating degree days',fmtI(c.hdd))}${stat('Mean wind',c.windMean.toFixed(1)+' m/s · '+c.rose.slice().sort((a,b)=>b.f-a.f)[0].name+' most often')}${stat('Coldest / warmest',c.months[cold]+' '+c.temp[cold].toFixed(1)+' °C · '+c.months[hot]+' '+c.temp[hot].toFixed(0)+' °C')}</div>
  <div class="tbl-wrap"><table><thead><tr><th></th>${c.months.map(m=>`<th class="num">${m}</th>`).join('')}</tr></thead><tbody><tr><td>°C</td>${c.temp.map(v=>`<td class="num">${v.toFixed(0)}</td>`).join('')}</tr><tr><td>mm</td>${c.rain.map(v=>`<td class="num">${v}</td>`).join('')}</tr><tr><td>sun h</td>${c.sunshine.map(v=>`<td class="num">${v}</td>`).join('')}</tr><tr><td>kWh/m²/d</td>${c.ghi.map(v=>`<td class="num">${v.toFixed(1)}</td>`).join('')}</tr></tbody></table></div>
  <p class="note">${c.loaded?`Weather: ${c.source}. Sunshine counts hours with direct normal irradiance over 120 W/m²; wind roses are monthly and annual from the hourly records (${c.rose.map(r=>r.name+' '+Math.round(r.f*100)+'%').join(', ')}); the rain rose spreads each month's rainfall normal over its overcast, humid hours, since the typical-year file carries no hourly rain.`:`Approximate Vancouver Airport normals (fallback; weather.json did not load). Wind rose: ${c.rose.map(r=>r.name+' '+Math.round(r.f*100)+'%').join(', ')}.`} Downtown sits on the harbour: the prevailing wind is westerly, winter outflow winds come from the east along Burrard Inlet, and the north shore mountains hold the view lines that shape downtown heights.</p>`;
}
function applyWeather(w){
  for(const k of ['temp','rain','ghi','sunshine','daylight','kd','hdd','cdd','windMean','rose','roseMonthly','rainRose','wdrFace','wdrBins','hourly','stormSpeedP95','station','lat','lon','source','wetMethod']) if(w[k]!==undefined) CLIMATE[k]=w[k];
  CLIMATE.sunshineTotal=CLIMATE.sunshine.reduce((a,b)=>a+b,0); CLIMATE.sunnyFraction=CLIMATE.sunshineTotal/4450;
  if(w.stormSpeedP95){ const se=CLIMATE.winds.find(x=>x.id==='SE'); if(se) se.speed=Math.max(6,Math.round(w.stormSpeedP95*2)/2); }
  const top=CLIMATE.rose.slice().sort((a,b)=>b.f-a.f)[0]; const W=CLIMATE.winds.find(x=>x.id==='W'); if(W&&top){ W.dir=top.dir; W.speed=top.s; W.label='Annual prevailing · '+top.name; }
  CLIMATE.loaded=true; CLIMATE.pending=false; renderClimate();
  for(const fn of (LAB.hooks.afterWeather||[])){ try{ fn(CLIMATE); }catch(e){ console.error(e); } }
}
LAB.hooks.afterWeather=LAB.hooks.afterWeather||[];
LAB.climate={CLIMATE, render:renderClimate, init(){ renderClimate();
  fetch('weather.json').then(r=>r.ok?r.json():null).then(w=>{ if(w&&w.hourly) applyWeather(w); else { CLIMATE.pending=false; renderClimate(); } }).catch(e=>{ console.warn('weather.json not loaded',e); CLIMATE.pending=false; renderClimate(); }); }};
})();
