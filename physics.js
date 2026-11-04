/* Sun & Wind Studio — hourly climate physics shared by the daylight, energy and ventilation studies, after the open-source engines:
   Perez 1990 all-weather sky on tilted faces (pvlib 'allsitescomposite1990', Radiance gendaymtx, EnergyPlus), Perez 1990 luminous
   efficacy to turn W/m² into lux (EnergyPlus WeatherManager), NOAA sun position for every hour of the CWEC typical year,
   LM-83 occupied hours (8:00–18:00 clock time) and the ASHRAE 55 prevailing mean outdoor temperature. */
(function(){
'use strict';
const LAB=window.LAB;
// Perez 1990 irradiance coefficients: f11 f12 f13 f21 f22 f23 per sky-clearness bin
const PZ=[[-0.008,0.588,-0.062,-0.060,0.072,-0.022],[0.130,0.683,-0.151,-0.019,0.066,-0.029],[0.330,0.487,-0.221,0.055,-0.064,-0.026],[0.568,0.187,-0.295,0.109,-0.152,-0.014],
  [0.873,-0.392,-0.362,0.226,-0.462,0.001],[1.132,-1.237,-0.412,0.288,-0.823,0.056],[1.060,-1.600,-0.359,0.264,-1.127,0.131],[0.678,-0.327,-0.250,0.156,-1.377,0.251]];
const EPS=[1.065,1.23,1.5,1.95,2.8,4.5,6.2];
// Perez 1990 luminous efficacy (lm/W), as in EnergyPlus
const DIF={a:[97.24,107.22,104.97,102.39,100.71,106.42,141.88,152.23],b:[-0.46,1.15,2.96,5.59,5.94,3.83,1.90,0.35],c:[12.00,0.59,-5.53,-13.95,-22.75,-36.15,-53.24,-45.27],d:[-8.91,-3.95,-8.77,-13.90,-23.74,-28.83,-14.03,-7.98]};
const DIR={a:[57.20,98.99,109.83,110.34,106.36,107.19,105.75,101.18],b:[-4.55,-3.46,-4.90,-5.84,-3.97,-1.25,0.77,1.58],c:[-2.98,-1.21,-1.71,-1.99,-1.75,-1.51,-1.26,-1.10],d:[117.12,12.38,-8.81,-4.56,-6.16,-26.73,-34.44,-8.29]};
const EXT_ILL=[131153,130613,128992,126816,124731,123240,122652,123120,124576,126658,128814,130471];
const ALBEDO=0.2;
let H=null; const faceCache={};
function sunAt(lat,lon,doy,hour,tz){
  const g=2*Math.PI/365*(doy-1+(hour-12)/24);
  const eq=229.18*(0.000075+0.001868*Math.cos(g)-0.032077*Math.sin(g)-0.014615*Math.cos(2*g)-0.040849*Math.sin(2*g));
  const decl=0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)-0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)-0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g);
  const ha=((hour*60+eq+4*lon-60*tz)/4-180)*Math.PI/180;
  const cz=Math.sin(lat)*Math.sin(decl)+Math.cos(lat)*Math.cos(decl)*Math.cos(ha); const zen=Math.acos(Math.max(-1,Math.min(1,cz)));
  let az=Math.acos(Math.max(-1,Math.min(1,(Math.sin(decl)-Math.sin(lat)*cz)/(Math.cos(lat)*Math.sin(zen)||1e-9)))); if(ha>0) az=2*Math.PI-az;
  return {alt:Math.PI/2-zen,az,cz};
}
/* every hour of the typical year: sun, Perez sky state and luminous efficacy */
function prep(){
  const C=LAB.CLIMATE, h=C.hourly; if(!h||!h.t||h.t.length<8760) return null; if(H&&H.src===h) return H;
  const n=8760, lat=C.lat*Math.PI/180, lon=C.lon;
  const o={src:h,n,doy:new Int16Array(n),mon:new Int8Array(n),hr:new Int8Array(n),alt:new Float32Array(n),az:new Float32Array(n),cz:new Float32Array(n),
    T:Float32Array.from(h.t),ws:Float32Array.from(h.ws),wd:Float32Array.from(h.wd),rain:Float32Array.from(h.rain||new Array(n).fill(0)),ghi:Float32Array.from(h.ghi),dni:Float32Array.from(h.dni),dhi:Float32Array.from(h.dhi),
    F1:new Float32Array(n),F2:new Float32Array(n),effD:new Float32Array(n),effB:new Float32Array(n),Ed:new Float32Array(n),Eb:new Float32Array(n),tpma:new Float32Array(n),occ:null};
  const mStart=[]; { let s=0; for(let m=0;m<12;m++){ mStart.push(s); s+=C.days[m]; } }
  for(let k=0;k<n;k++){ const doy=Math.floor(k/24)+1, he=k%24+1; let m=11; for(let q=0;q<12;q++){ if(doy<=mStart[q]+C.days[q]){ m=q; break; } }
    o.doy[k]=doy; o.mon[k]=m; o.hr[k]=he; const p=sunAt(lat,lon,doy,he-0.5,-8); o.alt[k]=p.alt; o.az[k]=p.az; o.cz[k]=p.cz;
    const dhi=o.dhi[k], dni=o.dni[k]; if(p.alt<=0.01||dhi<=0){ continue; }
    const z=Math.PI/2-p.alt; const zeta=1.041*z*z*z; const eps=((dhi+dni)/(dhi+1e-4)+zeta)/(1+zeta); let b=0; while(b<7&&eps>EPS[b]) b++;
    const altD=p.alt*180/Math.PI; const am=(1-0.1*(C.elev||4)/1000)/(Math.sin(p.alt)+0.15/Math.pow(altD+3.885,1.253));
    const delta=dhi*93.73*am/EXT_ILL[m]; const c=PZ[b];
    o.F1[k]=Math.max(0,c[0]+c[1]*delta+c[2]*z); o.F2[k]=c[3]+c[4]*delta+c[5]*z;
    const W=Math.exp(0.07*(o.T[k]-3)-0.075); // precipitable water from a dew point ~3 K under air temperature (Vancouver, humid)
    o.effD[k]=Math.max(0,DIF.a[b]+DIF.b[b]*W+DIF.c[b]*p.cz+DIF.d[b]*Math.log(Math.max(1e-4,delta)));
    o.effB[k]=Math.max(0,DIR.a[b]+DIR.b[b]*W+DIR.c[b]*Math.exp(5.73*z-5)+DIR.d[b]*delta);
    o.Ed[k]=dhi*o.effD[k]; o.Eb[k]=dni*o.effB[k]; }
  // occupied hours, LM-83: 8:00 to 18:00 local clock time (daylight saving from the climate's monthly offsets) → hour-ending in standard time
  const occ=[]; for(let k=0;k<n;k++){ const m=o.mon[k]; const dst=(C.tz[m]||-8)+8; const clockEnd=o.hr[k]+dst; if(clockEnd>=9&&clockEnd<=18) occ.push(k); } o.occ=Int32Array.from(occ);
  // ASHRAE 55 prevailing mean outdoor temperature: mean of the previous seven daily means
  const dm=new Float32Array(365); for(let d=0;d<365;d++){ let s=0; for(let q=0;q<24;q++) s+=o.T[d*24+q]; dm[d]=s/24; }
  for(let d=0;d<365;d++){ let s=0; for(let q=1;q<=7;q++) s+=dm[(d-q+365)%365]; const v=s/7; for(let q=0;q<24;q++) o.tpma[d*24+q]=v; }
  o.daily=dm; H=o; for(const k in faceCache) delete faceCache[k]; return H;
}
/* irradiance (W/m²) and illuminance (lux) on a vertical face of compass azimuth az (deg) for every hour, Perez 1990 */
function face(az){
  const P=prep(); if(!P) return null; const key=Math.round(((az%360)+360)%360); if(faceCache[key]) return faceCache[key];
  const n=P.n, a0=key*Math.PI/180, b85=Math.cos(85*Math.PI/180); const sky=new Float32Array(n), gnd=new Float32Array(n), beam=new Float32Array(n), skyL=new Float32Array(n), gndL=new Float32Array(n), beamL=new Float32Array(n);
  for(let k=0;k<n;k++){ if(P.alt[k]<=0.01) continue; const cosT=Math.cos(P.alt[k])*Math.cos(P.az[k]-a0); const a=Math.max(0,cosT), b=Math.max(b85,P.cz[k]);
    const s=Math.max(0,P.dhi[k]*((1-P.F1[k])*0.5+P.F1[k]*a/b+P.F2[k])); sky[k]=s; beam[k]=P.dni[k]*a; gnd[k]=P.ghi[k]*ALBEDO*0.5;
    skyL[k]=s*P.effD[k]; beamL[k]=beam[k]*P.effB[k]; gndL[k]=(P.Eb[k]*P.cz[k]+P.Ed[k])*ALBEDO*0.5; }
  return (faceCache[key]={az:key,sky,gnd,beam,skyL,gndL,beamL});
}
/* hours of a month-day period (by day of year) */
function inPeriod(PI,doy){ return PI.full||(PI.d1>=PI.d0?(doy>=PI.d0&&doy<=PI.d1):(doy>=PI.d0||doy<=PI.d1)); }
/* compass azimuth offset of a floor's faces: its rotation folded into ±45° (cardinal faces are the nearest compass point) */
function faceOffset(rot){ const d=((rot*180/Math.PI)%90+90)%90; return -(d>45?d-90:d); }
LAB.phys={prep,face,inPeriod,faceOffset,sunAt,ALBEDO};
})();
