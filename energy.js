/* Sun & Wind Studio — energy: massing efficiency (form-only metrics, Massing phase) and a monthly energy balance per program zone (ISO 13790-style utilisation method, Design development), Vancouver climate. Adapted from the Supertall Energy Lab; glazing, SHGC and shading come from the façade zones. */
(function(){
'use strict';
const LAB=window.LAB; const $=LAB.$, fmtI=LAB.fmtI;
const ENV_P={
  glazU:{label:'Glazing U-value',min:0.6,max:3,step:0.1,fmt:v=>v.toFixed(1)+' W/m²K'},
  wallU:{label:'Opaque wall U-value',min:0.1,max:0.6,step:0.02,fmt:v=>v.toFixed(2)+' W/m²K'},
  roofU:{label:'Roof and soffit U-value',min:0.1,max:0.4,step:0.02,fmt:v=>v.toFixed(2)+' W/m²K'},
  infil:{label:'Infiltration',min:0.05,max:0.6,step:0.05,fmt:v=>v.toFixed(2)+' ach'},
  shade:{label:'Context shading on solar gains',min:0.5,max:1,step:0.05,fmt:v=>Math.round(v*100)+'% reaches the façade'},
  mass:{label:'Thermal mass',options:[['light','light · a = 2'],['medium','medium · a = 3'],['heavy','heavy · a = 4']]},
};
const SYS_P={
  heat:{label:'Heating and hot water plant',options:[['hp','Air-source heat pump · COP 3.0 / 2.5'],['gas','Gas boiler · 92% / 85%'],['res','Electric resistance']]},
  cop:{label:'Cooling COP',min:2.5,max:5,step:0.25,fmt:v=>v.toFixed(2)},
  hr:{label:'Heat recovery on ventilation',min:0,max:0.9,step:0.05,fmt:v=>Math.round(v*100)+'%'},
  vent:{label:'Outdoor air',min:0.15,max:0.8,step:0.05,fmt:v=>v.toFixed(2)+' L/s per m²'},
  setH:{label:'Heating set point',min:18,max:23,step:0.5,fmt:v=>v.toFixed(1)+' °C'},
  setC:{label:'Cooling set point',min:23,max:27,step:0.5,fmt:v=>v.toFixed(1)+' °C'},
  lpd:{label:'Lighting power density',min:3,max:14,step:0.5,fmt:v=>v.toFixed(1)+' W/m²'},
  equip:{label:'Plug and process loads',min:3,max:20,step:0.5,fmt:v=>v.toFixed(1)+' W/m²'},
};
/* per-program operation: hours per week, m² per person, hot water kWh/m²/yr, multipliers on lighting and equipment */
const OPS={
  office:{hrs:60,occ:18,dhw:5,lightF:1,eqF:1}, studio:{hrs:70,occ:25,dhw:6,lightF:1,eqF:1.1}, retail:{hrs:84,occ:8,dhw:4,lightF:1.6,eqF:0.8},
  hotel:{hrs:168,occ:48,dhw:45,lightF:0.8,eqF:0.5}, resi:{hrs:168,occ:42,dhw:25,lightF:0.6,eqF:0.6}, public:{hrs:84,occ:12,dhw:8,lightF:1.2,eqF:0.7},
  amenity:{hrs:84,occ:30,dhw:3,lightF:0.5,eqF:0.3,open:true}, observation:{hrs:98,occ:6,dhw:5,lightF:1.2,eqF:0.8}, boh:{hrs:84,occ:200,dhw:2,lightF:0.6,eqF:0.5}, mep:{hrs:168,occ:1000,dhw:0,lightF:0.3,eqF:2,open:true},
};
/* vertical-surface irradiation factors on global horizontal, by month, for 49° N */
const KS=[1.6,1.4,1.1,0.85,0.65,0.55,0.6,0.75,1.0,1.3,1.6,1.7], KEW=[0.6,0.62,0.65,0.68,0.7,0.7,0.7,0.7,0.68,0.64,0.6,0.58], KN=[0.3,0.3,0.32,0.36,0.42,0.45,0.43,0.38,0.34,0.3,0.28,0.28];
const KOR={N:KN,E:KEW,S:KS,W:KEW};
/* indicative City of Vancouver rezoning targets (Zero Emissions Building Plan, approximate) kWh/m²/yr and kgCO2e/m²/yr */
const TARGETS={resi:{teui:100,tedi:15,ghgi:3},hotel:{teui:130,tedi:30,ghgi:4},office:{teui:100,tedi:20,ghgi:3},studio:{teui:110,tedi:20,ghgi:3},retail:{teui:150,tedi:30,ghgi:4},public:{teui:120,tedi:25,ghgi:3},observation:{teui:150,tedi:30,ghgi:4},amenity:{teui:40,tedi:5,ghgi:1},boh:{teui:60,tedi:10,ghgi:2},mep:{teui:60,tedi:5,ghgi:2}};
const USES=[['heat','Space heating','--s1'],['cool','Cooling','--s2'],['light','Lighting','--s3'],['equip','Plug and process','--s4'],['dhw','Hot water','--s5'],['aux','Fans, pumps, lifts','--s6']];
const ORI=['N','E','S','W'];
let last=null;
function peopleFor(floors){ const r={jobs:0,residents:0,guests:0,visitors:0}; for(const f of floors){ const a=f.area; switch(f.prog){ case 'office': r.jobs+=a/18; break; case 'studio': r.jobs+=a/25; break; case 'retail': r.jobs+=a/35; r.visitors+=a/8; break; case 'hotel': r.guests+=a/48; r.jobs+=a/300; break; case 'resi': r.residents+=a/42; break; case 'public': r.jobs+=a/60; r.visitors+=a/12; break; case 'observation': r.visitors+=a/5; break; case 'boh': r.jobs+=a/200; break; } } r.total=r.jobs+r.residents+r.guests; return r; }
/* glazing on a floor face: from the façade zones when the studio provides them, else a typical curtain wall */
function glazing(fl,o){ if(LAB.sim&&LAB.sim.zoneGlazing) return LAB.sim.zoneGlazing(fl,o); return {wwr:0.4,shgc:0.35,t:1,strat:'curtain'}; }

function modelMonthly(floors){
  const S=LAB.S, E=S.energy, C=LAB.CLIMATE; const a={light:2,medium:3,heavy:4}[E.mass]||3;
  const effH=E.heat==='hp'?3.0:(E.heat==='gas'?0.92:1), effW=E.heat==='hp'?2.5:(E.heat==='gas'?0.85:1), gasHeat=E.heat==='gas';
  const util=(g)=>{ if(!isFinite(g)||g<=0) return 1; if(Math.abs(g-1)<1e-6) return a/(a+1); return (1-Math.pow(g,a))/(1-Math.pow(g,a+1)); };
  const zones={}; const glz={}; for(const o of ORI) glz[o]={A:0,wwr:0,shgcT:0};
  floors.forEach((fl,i)=>{ const z=zones[fl.prog]||(zones[fl.prog]={p:fl.prog,area:0,vol:0,Agl:{N:0,E:0,S:0,W:0},Aop:{N:0,E:0,S:0,W:0},Gsol:{N:0,E:0,S:0,W:0},roof:0,soffit:0,floors:0,open:false});
    z.area+=fl.area; z.vol+=fl.area*(fl.h-0.4); z.floors++; z.roof+=fl.terrace+fl.roof; z.soffit+=i>0?floors[i-1].coveredVoid:0;
    for(const o of ORI){ const A=(fl.facade?fl.facade[o]:0)*fl.h; const g=glazing(fl,o); z.Agl[o]+=A*g.wwr; z.Aop[o]+=A*(1-g.wwr); z.Gsol[o]+=A*g.wwr*g.shgc*g.t; glz[o].A+=A; glz[o].wwr+=A*g.wwr; glz[o].shgcT+=A*g.wwr*g.shgc*g.t; }
    if(fl.garden||OPS[fl.prog].open) z.open=true; });
  for(const o of ORI){ glz[o].wwrAvg=glz[o].A?glz[o].wwr/glz[o].A:0; glz[o].shgcEff=glz[o].wwr?glz[o].shgcT/glz[o].wwr:0; }
  const monthly={heat:new Array(12).fill(0),cool:new Array(12).fill(0),light:new Array(12).fill(0),equip:new Array(12).fill(0),dhw:new Array(12).fill(0),aux:new Array(12).fill(0)};
  const rows=[]; let gasK=0, elecK=0, tediK=0, totalK=0, envelope={gl:0,op:0,roof:0}; const shade=E.shade||0.85;
  for(const p in zones){ const z=zones[p], ops=OPS[p], focc=ops.hrs/168; const cond=!z.open;
    const Htr=ORI.reduce((s,o)=>s+z.Agl[o]*E.glazU+z.Aop[o]*E.wallU,0)+(z.roof+z.soffit)*E.roofU;
    const Hve=1200*(E.vent/1000*z.area*(1-E.hr)*focc+E.infil*z.vol/3600);
    envelope.gl+=Object.values(z.Agl).reduce((s,v)=>s+v,0); envelope.op+=Object.values(z.Aop).reduce((s,v)=>s+v,0); envelope.roof+=z.roof+z.soffit;
    const r={p,area:z.area,floors:z.floors,heat:0,cool:0,light:0,equip:0,dhw:0,aux:0,tedi:0,solar:0,internal:0,Htr,Hve,cond};
    for(let m=0;m<12;m++){ const hrs=24*C.days[m], T=C.temp[m];
      const Qint=((z.area/ops.occ)*75+E.lpd*ops.lightF*z.area*0.75+E.equip*ops.eqF*z.area)*focc*hrs/1000+E.equip*ops.eqF*z.area*0.2*(1-focc)*hrs/1000;
      const Qsol=ORI.reduce((s,o)=>s+z.Gsol[o]*0.9*shade*C.ghi[m]*C.days[m]*KOR[o][m],0);
      const QG=Qint+Qsol; r.solar+=Qsol; r.internal+=Qint;
      let QH=0,QC=0;
      if(cond){ const QL=(Htr+Hve)*Math.max(0,E.setH-T)*hrs/1000; QH=Math.max(0,QL-util(QL>0?QG/QL:Infinity)*QG);
        const QLc=(Htr+Hve)*Math.max(0,E.setC-T)*hrs/1000; QC=Math.max(0,QG-util(QG>0?QLc/QG:Infinity)*QLc); }
      const light=E.lpd*ops.lightF*z.area*ops.hrs*(C.days[m]/7)*0.75/1000, equip=E.equip*ops.eqF*z.area*(ops.hrs+(168-ops.hrs)*0.2)*(C.days[m]/7)/1000;
      const dhw=ops.dhw*z.area/effW*C.days[m]/365, aux=(6*focc+4)*z.area*C.days[m]/365;
      const heat=QH/effH, cool=cond?QC/E.cop:0;
      monthly.heat[m]+=heat; monthly.cool[m]+=cool; monthly.light[m]+=light; monthly.equip[m]+=equip; monthly.dhw[m]+=dhw; monthly.aux[m]+=aux;
      r.heat+=heat; r.cool+=cool; r.light+=light; r.equip+=equip; r.dhw+=dhw; r.aux+=aux; r.tedi+=QH;
    }
    r.total=r.heat+r.cool+r.light+r.equip+r.dhw+r.aux; r.teui=r.total/z.area; r.tediI=r.tedi/z.area;
    const gas=gasHeat?r.heat+r.dhw:0, elec=r.total-gas; r.ghgi=(gas*0.18+elec*0.011)/z.area;
    gasK+=gas; elecK+=elec; tediK+=r.tedi; totalK+=r.total; rows.push(r);
  }
  rows.sort((x,y)=>y.total-x.total);
  const gfa=floors.reduce((s,f)=>s+f.area,0);
  const tgt={teui:0,tedi:0,ghgi:0}; for(const r of rows){ const t=TARGETS[r.p]||TARGETS.office; tgt.teui+=t.teui*r.area; tgt.tedi+=t.tedi*r.area; tgt.ghgi+=t.ghgi*r.area; } tgt.teui/=gfa; tgt.tedi/=gfa; tgt.ghgi/=gfa;
  const uses={}; for(const [k] of USES) uses[k]=monthly[k].reduce((s,v)=>s+v,0);
  last={rows,monthly,uses,gfa,total:totalK,teui:totalK/gfa,tedi:tediK/gfa,ghgi:(gasK*0.18+elecK*0.011)/gfa,gas:gasK,elec:elecK,tgt,envelope,glz,people:peopleFor(floors)};
  return last;
}
/* ---------- hourly model: ISO 13790 simple hourly method (5R1C), as in the open-source RC_BuildingSimulator (ETH Zurich) and the EnergyPlus-calibrated
   practice behind it. One zone per program; every hour of the CWEC typical year; solar gains from the Perez all-weather sky on each face at its true
   azimuth; ventilation, heat recovery and setbacks on the program's schedule; lighting dimmed by the climate-based daylight of each floor; heat-pump
   and chiller efficiency follow the outdoor temperature (fixed fraction of Carnot). ---------- */
const MASS={light:{am:2.5,cm:110000},medium:{am:2.5,cm:165000},heavy:{am:3.0,cm:260000}};
const SFP=1.2; // W per L/s of outdoor air: balanced supply and extract with heat recovery
function occupied(sch,k,C){ const doy=Math.floor(k/24), m=LAB.phys.prep().mon[k]; const dst=(C.tz[m]||-8)+8; const clock=(k%24+dst)%24; const dow=doy%7; if(sch.d===5&&dow>=5) return false; return clock>=sch.a&&clock<sch.b; }
function schedOf(p){ const h=OPS[p].hrs; return h>=168?{d:7,a:0,b:24}:h>=98?{d:7,a:8,b:22}:h>=84?{d:7,a:8,b:20}:h>=70?{d:5,a:7,b:21}:{d:5,a:7,b:19}; }
const DAYLIT_PROG=p=>OPS[p].hrs<168;
/* diurnal profiles for programs lived in around the clock (shape of the NECB / ASHRAE 90.1 residential schedules): share of people, lighting and equipment by clock hour */
const H24=(...runs)=>{ const a=[]; for(const [n,v] of runs) for(let i=0;i<n;i++) a.push(v); return a; };
const PROF={people:H24([7,0.9],[2,0.5],[8,0.25],[5,0.7],[2,0.9]),light:H24([6,0.05],[2,0.3],[9,0.1],[6,0.5],[1,0.2]),equip:H24([6,0.3],[3,0.6],[8,0.4],[6,0.8],[1,0.5])}; // housing and hotels light mostly after dark: no daylight-linked dimming credited
function modelHourly(floors){
  const S=LAB.S, E=S.energy, C=LAB.CLIMATE, P=LAB.phys.prep(); const n=8760; const ms=MASS[E.mass]||MASS.medium;
  const gasHeat=E.heat==='gas'; const etaH=3.0/(308.15/28), etaC=E.cop/(280.15/38);
  const copH=T=>E.heat==='hp'?Math.max(1.5,Math.min(5,etaH*308.15/Math.max(5,35-T))):(gasHeat?0.92:1);
  const copC=T=>Math.max(E.cop*0.6,Math.min(E.cop*1.6,etaC*280.15/Math.max(5,T+3)));
  const effW=E.heat==='hp'?2.5:(E.heat==='gas'?0.85:1);
  const DL=LAB.sim&&LAB.sim.daylightTowerCached?LAB.sim.daylightTowerCached():null;
  const zones={}; const glz={}; for(const o of ORI) glz[o]={A:0,wwr:0,shgcT:0};
  floors.forEach((fl,i)=>{ const z=zones[fl.prog]||(zones[fl.prog]={p:fl.prog,area:0,vol:0,Agl:{N:0,E:0,S:0,W:0},Aop:{N:0,E:0,S:0,W:0},Gaz:{},roof:0,soffit:0,floors:0,open:false,dsf:new Array(12).fill(0),dsfA:0});
    z.area+=fl.area; z.vol+=fl.area*(fl.h-0.4); z.floors++; z.roof+=fl.terrace+fl.roof; z.soffit+=i>0?floors[i-1].coveredVoid:0;
    const off=LAB.phys.faceOffset(fl.rot||0);
    for(const o of ORI){ const A=(fl.facade?fl.facade[o]:0)*fl.h; const g=glazing(fl,o); z.Agl[o]+=A*g.wwr; z.Aop[o]+=A*(1-g.wwr); const az=Math.round(({N:0,E:90,S:180,W:270}[o]+off+360)%360); z.Gaz[az]=(z.Gaz[az]||0)+A*g.wwr*g.shgc*g.t; glz[o].A+=A; glz[o].wwr+=A*g.wwr; glz[o].shgcT+=A*g.wwr*g.shgc*g.t; }
    const dr=DL&&DL.rows&&DL.rows[i]; if(dr&&dr.dsf){ for(let m=0;m<12;m++) z.dsf[m]+=dr.dsf[m]*fl.area; z.dsfA+=fl.area; }
    if(fl.garden||OPS[fl.prog].open) z.open=true; });
  for(const o of ORI){ glz[o].wwrAvg=glz[o].A?glz[o].wwr/glz[o].A:0; glz[o].shgcEff=glz[o].wwr?glz[o].shgcT/glz[o].wwr:0; }
  const monthly={heat:new Array(12).fill(0),cool:new Array(12).fill(0),light:new Array(12).fill(0),equip:new Array(12).fill(0),dhw:new Array(12).fill(0),aux:new Array(12).fill(0)};
  const hH=new Float32Array(n), hC=new Float32Array(n); const rows=[]; let gasK=0, elecK=0, tediK=0, totalK=0, saveK=0; const envelope={gl:0,op:0,roof:0}; const shade=E.shade||0.85; const LS={glass:{N:0,E:0,S:0,W:0},wall:{N:0,E:0,S:0,W:0},roof:0,vent:0,infil:0,recov:0,solar:0,internal:0};
  for(const p in zones){ const z=zones[p], ops=OPS[p], sch=schedOf(p), cond=!z.open; const Af=z.area;
    if(z.dsfA) for(let m=0;m<12;m++) z.dsf[m]/=z.dsfA;
    const Hw=ORI.reduce((s,o)=>s+z.Agl[o]*E.glazU,0), Hop=ORI.reduce((s,o)=>s+z.Aop[o]*E.wallU,0)+(z.roof+z.soffit)*E.roofU;
    const At=4.5*Af, Am=ms.am*Af, Cm=ms.cm*Af, His=3.45*At, Hms=9.1*Am, Hem=Hop<Hms*0.99?1/(1/Hop-1/Hms):Hop*50;
    envelope.gl+=Object.values(z.Agl).reduce((s,v)=>s+v,0); envelope.op+=Object.values(z.Aop).reduce((s,v)=>s+v,0); envelope.roof+=z.roof+z.soffit;
    const faces=Object.entries(z.Gaz).filter(([,g])=>g>0).map(([az,g])=>{ const F=LAB.phys.face(+az); return {g:g*0.9*shade,F}; });
    const r={p,area:Af,floors:z.floors,heat:0,cool:0,light:0,equip:0,dhw:0,aux:0,tedi:0,solar:0,internal:0,Htr:Hw+Hop,Hve:0,cond,peakH:0,peakC:0,tMax:-99,over26:0,lightSave:0};
    let Tm=20; const lightOn=E.lpd*ops.lightF*0.75*Af, dimOK=DAYLIT_PROG(p);
    for(let k=0;k<n;k++){ const m=P.mon[k], Te=P.T[k]; const occ=occupied(sch,k,C);
      let sol=0; for(const q of faces) sol+=q.g*(q.F.sky[k]+q.F.gnd[k]+q.F.beam[k]);
      const dst=(C.tz[m]||-8)+8, clock=(k%24+dst)%24, dayHour=clock>=8&&clock<18;
      const dim=occ&&dimOK&&dayHour?Math.min(0.9,(z.dsf[m]||0)*0.9):0; const allDay=p==='resi'||p==='hotel';
      const lightW=allDay?E.lpd*ops.lightF*Af*PROF.light[clock]:(occ?lightOn*(1-dim):0); const equipW=E.equip*ops.eqF*Af*(allDay?PROF.equip[clock]:(occ?1:0.2));
      const peopleW=allDay?Af/ops.occ*75*PROF.people[clock]:(occ?Af/ops.occ*75:0); const phiInt=peopleW+lightW+equipW;
      const Hve=1200*((occ?E.vent/1000*Af*(1-E.hr):0)+E.infil*z.vol/3600);
      const H1=1/(1/Hve+1/His), H2=H1+Hw, H3=1/(1/H2+1/Hms);
      const phiM0=Am/At*(0.5*phiInt+sol), phiSt0=(1-Am/At-Hw/(9.1*At))*(0.5*phiInt+sol);
      const solve=phiHC=>{ const phiIa=0.5*phiInt+phiHC; const mtot=phiM0+Hem*Te+H3*(phiSt0+Hw*Te+H1*(phiIa/Hve+Te))/H2;
        const TmN=(Tm*(Cm/3600-0.5*(H3+Hem))+mtot)/(Cm/3600+0.5*(H3+Hem)); const Tmm=(TmN+Tm)/2;
        const Ts=(Hms*Tmm+phiSt0+Hw*Te+H1*(Te+phiIa/Hve))/(Hms+Hw+H1); const Ta=(His*Ts+Hve*Te+phiIa)/(His+Hve); return {Ta,TmN}; };
      let res=solve(0), phi=0;
      if(cond){ const sH=occ?E.setH:E.setH-4, sC=occ?E.setC:E.setC+4;
        if(res.Ta<sH||res.Ta>sC){ const tgt=res.Ta<sH?sH:sC; const r10=solve(10*Af); phi=10*Af*(tgt-res.Ta)/(r10.Ta-res.Ta); res=solve(phi); } }
      { const dT=res.Ta-Te; if(dT>0){ for(const o of ORI){ LS.glass[o]+=z.Agl[o]*E.glazU*dT/1000; LS.wall[o]+=z.Aop[o]*E.wallU*dT/1000; } LS.roof+=(z.roof+z.soffit)*E.roofU*dT/1000; const oa=occ?E.vent/1000*Af:0; LS.vent+=1200*oa*(1-E.hr)*dT/1000; LS.recov+=1200*oa*E.hr*dT/1000; LS.infil+=1200*E.infil*z.vol/3600*dT/1000; } LS.solar+=sol/1000; LS.internal+=phiInt/1000; }
      Tm=res.TmN; if(!cond){ if(res.Ta>r.tMax) r.tMax=res.Ta; if(occ&&res.Ta>26) r.over26++; }
      const qh=phi>0?phi/1000:0, qc=phi<0?-phi/1000:0; hH[k]+=qh; hC[k]+=qc; if(phi>r.peakH) r.peakH=phi; if(-phi>r.peakC) r.peakC=-phi;
      const heat=qh/copH(Te), cool=qc/copC(Te); const light=lightW/1000, equip=equipW/1000; const aux=(occ?SFP*E.vent*Af/1000:0)+0.02*(qh+qc)+4*Af/8760;
      monthly.heat[m]+=heat; monthly.cool[m]+=cool; monthly.light[m]+=light; monthly.equip[m]+=equip; monthly.aux[m]+=aux;
      r.heat+=heat; r.cool+=cool; r.light+=light; r.equip+=equip; r.aux+=aux; r.tedi+=qh; r.solar+=sol/1000; r.internal+=phiInt/1000; r.Hve+=Hve/n; r.lightSave+=occ?lightOn*dim/1000:0; }
    for(let m=0;m<12;m++){ const dhw=ops.dhw*Af/effW*C.days[m]/365; monthly.dhw[m]+=dhw; r.dhw+=dhw; }
    r.total=r.heat+r.cool+r.light+r.equip+r.dhw+r.aux; r.teui=r.total/Af; r.tediI=r.tedi/Af; r.peakHw=r.peakH/Af; r.peakCw=r.peakC/Af;
    const gas=gasHeat?r.heat+r.dhw:0, elec=r.total-gas; r.ghgi=(gas*0.18+elec*0.011)/Af;
    gasK+=gas; elecK+=elec; tediK+=r.tedi; totalK+=r.total; saveK+=r.lightSave; rows.push(r); }
  rows.sort((x,y)=>y.total-x.total);
  const gfa=floors.reduce((s,f)=>s+f.area,0);
  const tgt={teui:0,tedi:0,ghgi:0}; for(const r of rows){ const t=TARGETS[r.p]||TARGETS.office; tgt.teui+=t.teui*r.area; tgt.tedi+=t.tedi*r.area; tgt.ghgi+=t.ghgi*r.area; } tgt.teui/=gfa; tgt.tedi/=gfa; tgt.ghgi/=gfa;
  const uses={}; for(const [k] of USES) uses[k]=monthly[k].reduce((s,v)=>s+v,0);
  let pkH=0, pkC=0; for(let k=0;k<n;k++){ if(hH[k]>pkH) pkH=hH[k]; if(hC[k]>pkC) pkC=hC[k]; }
  last={rows,monthly,uses,gfa,total:totalK,teui:totalK/gfa,tedi:tediK/gfa,ghgi:(gasK*0.18+elecK*0.011)/gfa,gas:gasK,elec:elecK,tgt,envelope,glz,people:peopleFor(floors),
    method:'hourly',hourly:{heat:hH,cool:hC},loss:LS,peakH:pkH*1000/gfa,peakC:pkC*1000/gfa,lightSave:saveK,lightShare:saveK/Math.max(1,uses.light+saveK),daylit:!!DL};
  return last;
}
function model(floors){ return LAB.phys&&LAB.phys.prep()?modelHourly(floors):modelMonthly(floors); }
/* hourly heating and cooling demand by week and hour of day, W/m² (the carpet plot of Ladybug and the EnergyPlus results viewer) */
function loadCarpet(r){ if(!r.hourly) return ''; const W=380,H=150,L=30,R=34,T=10,B=22; const nw=52, cw=(W-L-R)/nw, chh=(H-T-B)/24; const gfa=r.gfa; let mx=0; const g=[];
  for(let w=0;w<nw;w++) for(let h=0;h<24;h++){ let s=0,c=0; for(let d=0;d<7;d++){ const k=(w*7+d)*24+h; if(k>=8760) continue; s+=(r.hourly.heat[k]-r.hourly.cool[k]); c++; } const v=c?s/c*1000/gfa:0; g.push(v); mx=Math.max(mx,Math.abs(v)); }
  mx=Math.max(1,mx); const col=v=>{ const t=Math.min(1,Math.abs(v)/mx); if(t<0.03) return 'var(--panel2)'; return v>0?`rgba(196,72,52,${(0.15+0.85*t).toFixed(2)})`:`rgba(52,110,190,${(0.15+0.85*t).toFixed(2)})`; };
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Hourly heating and cooling demand by week and hour" data-key="energy-carpet"><style>text{font-family:var(--font-m);font-size:8.5px;fill:var(--muted)}</style>`;
  for(let w=0;w<nw;w++) for(let h=0;h<24;h++){ const v=g[w*24+h]; s+=`<rect x="${(L+w*cw).toFixed(2)}" y="${(T+h*chh).toFixed(2)}" width="${(cw+0.05).toFixed(2)}" height="${(chh+0.05).toFixed(2)}" fill="${col(v)}"/>`; }
  for(const h of [0,6,12,18,24]) s+=`<text x="${L-4}" y="${(T+h*chh+3).toFixed(1)}" text-anchor="end">${h}h</text>`;
  LAB.CLIMATE.months.forEach((mn,i)=>{ const d=LAB.CLIMATE.days.slice(0,i).reduce((a,b)=>a+b,0); s+=`<text x="${(L+d/7*cw).toFixed(1)}" y="${H-8}">${mn[0]}</text>`; });
  const x0=W-R+8; for(let i=0;i<20;i++){ const v=mx*(1-i/9.5); s+=`<rect x="${x0}" y="${(T+i*(H-T-B)/20).toFixed(1)}" width="8" height="${((H-T-B)/20+0.2).toFixed(1)}" fill="${col(v)}"/>`; }
  s+=`<text x="${x0-2}" y="${T-2}">${mx.toFixed(0)}</text><text x="${x0-2}" y="${H-B+9}">-${mx.toFixed(0)}</text>`;
  return s+'</svg>'; }
function chartSVG(r,forPdf){
  const W=380,H=222,L=44,R=8,T=14,B=46; const pw=W-L-R, ph=H-T-B; const C=LAB.CLIMATE;
  const tot=r.monthly.heat.map((_,m)=>USES.reduce((s,[k])=>s+r.monthly[k][m],0)); const max=Math.max(1,...tot)/1000;
  const nice=v=>{ const p=Math.pow(10,Math.floor(Math.log10(v))); const f=v/p; return (f<=1?1:(f<=2?2:(f<=5?5:10)))*p; }; const step=nice(max/4), ymax=Math.ceil(max/step)*step;
  const y=v=>T+ph-(v/ymax)*ph; const bw=pw/12; const cs=getComputedStyle(document.documentElement);
  const col=k=>forPdf?cs.getPropertyValue(k).trim():`var(${k})`;
  const mut=forPdf?cs.getPropertyValue('--muted').trim():'var(--muted)', grid=forPdf?cs.getPropertyValue('--chart-grid').trim():'var(--chart-grid)', axis=forPdf?cs.getPropertyValue('--chart-axis').trim():'var(--chart-axis)', surf=forPdf?cs.getPropertyValue('--panel').trim():'var(--panel)';
  let s=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Monthly energy by end use" data-key="energy-monthly">${forPdf?`<rect width="${W}" height="${H}" fill="${surf}"/>`:''}<style>text{font-family:system-ui,sans-serif;font-size:9px;fill:${mut}}</style>`;
  for(let v=0;v<=ymax+1e-9;v+=step){ s+=`<line x1="${L}" x2="${W-R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${grid}"/><text x="${L-4}" y="${(y(v)+3).toFixed(1)}" text-anchor="end">${v}</text>`; }
  s+=`<text x="${L-4}" y="8" text-anchor="end">MWh</text>`;
  for(let m=0;m<12;m++){ let acc=0; const x=L+m*bw+2, w=bw-4;
    for(const [k,name,tok] of USES){ const v=r.monthly[k][m]/1000; if(v<=0) continue; const y1=y(acc+v), y0=y(acc); acc+=v;
      s+=`<rect x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0,y0-y1-1).toFixed(1)}" fill="${col(tok)}"><title>${C.months[m]} · ${name}: ${v.toFixed(1)} MWh</title></rect>`; }
    s+=`<text x="${(x+w/2).toFixed(1)}" y="${H-B+10}" text-anchor="middle">${C.months[m]}</text>`; }
  s+=`<line x1="${L}" x2="${W-R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="${axis}"/>`;
  USES.forEach(([k,name,tok],i)=>{ const lx=L+(i%3)*((W-L-R)/3), ly=H-20+Math.floor(i/3)*10; s+=`<rect x="${lx}" y="${ly}" width="8" height="8" rx="2" fill="${col(tok)}"/><text x="${lx+11}" y="${ly+7}">${name}</text>`; });
  return s+'</svg>';
}
const stat=(k,v)=>`<div class="stat"><b>${v}</b><small>${k}</small></div>`;
function kpi(label,v,unit,t){ const over=v>t*1.001; return `<div><small>${label}</small><b class="${over?'over':'ok'}">${v.toFixed(v<10?1:0)}</b><em>${unit} · target ${t.toFixed(0)} · ${over?'over by '+((v/t-1)*100).toFixed(0)+'%':'meets'}</em></div>`; }
const PLANT={hp:'air-source heat pump',gas:'gas boiler',res:'electric resistance'};
const kp=(label,v,sub,cls)=>`<div><small>${label}</small><b class="${cls||''}">${v}</b>${sub?`<em>${sub}</em>`:''}</div>`;
function targetBars(r){ const V=LAB.viz; const rows=[['TEUI',r.teui,r.tgt.teui,'kWh/m²/yr'],['TEDI',r.tedi,r.tgt.tedi,'kWh/m²/yr heating'],['GHGI',r.ghgi,r.tgt.ghgi,'kgCO₂e/m²/yr']].map(([k,v,t,u])=>({label:k,v:v/t,mark:1,color:v<=t*1.001?'var(--ok)':'var(--bad)',text:v.toFixed(v<10?1:0)+' of '+t.toFixed(t<10?1:0)+' '+u})); return V.hbars(rows,{key:'energy-targets',title:'Against the Vancouver targets · bar is the result, the tick the target',max:Math.max(1.4,...rows.map(x=>x.v*1.05)),labelW:46}); }
function useDonut(r){ const V=LAB.viz; return V.donut(USES.map(([k,n,tok])=>({name:n,v:r.uses[k],color:`var(${tok})`,text:fmtI(r.uses[k]/1000)+' MWh · '+(r.uses[k]/r.total*100).toFixed(0)+'%'})),{key:'end-uses',title:'End uses',centre:fmtI(r.total/1000)+' MWh'}); }
/* ---------- where the heat goes: each path's loss over the year, summed for every hour the inside is warmer than the outside ---------- */
const LOSS_COL={glass:'#5B8FC9',wall:'#A0857A',roof:'#7C6A8E',vent:'#3FA7A0',infil:'#B7C3CE'};
function lossRows(r){ const L=r.loss, g=r.gfa||1, N={N:'North',E:'East',S:'South',W:'West'}; const rows=[];
  for(const o of ORI) rows.push({label:'Windows · '+N[o],v:L.glass[o]/g,color:LOSS_COL.glass});
  for(const o of ORI) rows.push({label:'Walls · '+N[o],v:L.wall[o]/g,color:LOSS_COL.wall});
  rows.push({label:'Roofs and soffits',v:L.roof/g,color:LOSS_COL.roof},{label:'Ventilation',v:L.vent/g,color:LOSS_COL.vent},{label:'Infiltration',v:L.infil/g,color:LOSS_COL.infil});
  const tot=rows.reduce((a,b)=>a+b.v,0)||1; rows.forEach(x=>x.share=x.v/tot); return {rows:rows.filter(x=>x.v>0.05).sort((a,b)=>b.v-a.v),tot}; }
function lossHTML(r){ if(!r.loss) return ''; const V=LAB.viz; const {rows,tot}=lossRows(r); const L=r.loss, g=r.gfa||1;
  const gA=ORI.reduce((a,o)=>a+r.glz[o].wwr,0), wA=ORI.reduce((a,o)=>a+r.glz[o].A-r.glz[o].wwr,0), rA=r.envelope.roof;
  const gL=ORI.reduce((a,o)=>a+L.glass[o],0), wL=ORI.reduce((a,o)=>a+L.wall[o],0);
  const per=[{label:'Window',v:gA?gL/gA:0,color:LOSS_COL.glass},{label:'Wall',v:wA?wL/wA:0,color:LOSS_COL.wall},{label:'Roof, soffit',v:rA?L.roof/rA:0,color:LOSS_COL.roof}].filter(x=>x.v>0);
  const top=rows[0], ratio=per[1]&&per[1].v?per[0].v/per[1].v:0; const gains=(L.solar+L.internal)/g; const kept=L.recov/g;
  return '<h3>Where the heat goes</h3><div class="kpi">'+kp('Heat lost',(tot).toFixed(0)+' kWh/m²','per m² of floor a year, while it is warmer inside than out')+kp('Largest path',top?top.label:'–',top?Math.round(top.share*100)+'% of the loss':'')+kp('Window vs wall',ratio?ratio.toFixed(1)+'×':'–','heat lost per m² of window, against a m² of wall')+kp('Kept by heat recovery',kept.toFixed(0)+' kWh/m²',Math.round(E_hr()*100)+'% of the outdoor air\'s heat')+'</div>'
    +V.fig(V.hbars(rows.map(x=>({label:x.label,v:x.v,color:x.color,text:x.v.toFixed(1)+' · '+Math.round(x.share*100)+'%'})),{key:'heat-loss',title:'Heat lost by path, kWh per m² of floor a year',dec:1,labelW:112}),'Transmission through each face\'s glass and wall, roofs and soffits, outdoor air after heat recovery, and leakage; summed over every hour of the typical year that the inside is warmer than the outside.')
      +V.fig(V.hbars(per.map(x=>({label:x.label,v:x.v,color:x.color,text:x.v.toFixed(0)+' kWh/m²'})),{key:'heat-loss-element',title:'Loss per m² of each element, kWh a year',dec:0,labelW:80}),'The same loss divided by each element\'s area: what one more square metre of it costs. '+(gains>=tot?'Gains from sun, people, lights and equipment add up to more than the loss over the year, but much of them comes when heat is not needed.':'Gains from sun, people, lights and equipment offset '+Math.round(gains/Math.max(1e-9,tot)*100)+'% of the loss over the year.'));
}
const E_hr=()=>LAB.S.energy.hr||0;
/* ---------- one floor as thermal zones (each façade side's outer band and the interior), with or without heating, cooling and opening windows ----------
   The same ISO 13790 5R1C hourly model, per zone. Systems: none (free-running, the outdoor-air supply still runs), windows (opened when it is warm inside and cooler
   outside), heating, heating with windows, heating and cooling. Comfort is counted in occupied hours on the operative temperature (mean of air and surfaces). */
const T_BINS=[18,20,26,28];
function thermalZones(prog,zs,sys){ const S=LAB.S, E=S.energy, C=LAB.CLIMATE, P=LAB.phys&&LAB.phys.prep(); if(!P) return null; const n=8760; const ms=MASS[E.mass]||MASS.medium;
  const ops=OPS[prog]||OPS.office, sch=schedOf(OPS[prog]?prog:'office'), allDay=prog==='resi'||prog==='hotel'; const heatOn=sys==='heat'||sys==='heatwin'||sys==='full', coolOn=sys==='full', winOn=sys==='win'||sys==='heatwin';
  const out=zs.map(z=>{ const Af=Math.max(1,z.area); const Hw=z.Agl*E.glazU, Hop=z.Aop*E.wallU+z.roof*E.roofU; const At=4.5*Af, Am=ms.am*Af, Cm=ms.cm*Af, His=3.45*At, Hms=9.1*Am, Hem=Hop>0?(Hop<Hms*0.99?1/(1/Hop-1/Hms):Hop*50):0;
    const faces=z.sol.map(q=>({g:q.g*0.9*(E.shade||0.85),F:LAB.phys.face(q.az)})).filter(q=>q.F);
    const To=new Float32Array(n); const bins=[0,0,0,0,0]; let occN=0, heat=0, cool=0, openH=0; const loss={glass:0,wall:0,roof:0,vent:0,infil:0}; const mon={min:new Array(12).fill(99),max:new Array(12).fill(-99),sum:new Array(12).fill(0),cnt:new Array(12).fill(0)};
    let Tm=20; const lightOn=E.lpd*ops.lightF*0.75*Af;
    for(let pass=0;pass<2;pass++) for(let k=pass?0:8760-336;k<n;k++){ const m=P.mon[k], Te=P.T[k]; const occ=occupied(sch,k,C); const dst=(C.tz[m]||-8)+8, clock=(k%24+dst)%24;
      let sol=0; for(const q of faces) sol+=q.g*(q.F.sky[k]+q.F.gnd[k]+q.F.beam[k]);
      const lightW=allDay?E.lpd*ops.lightF*Af*PROF.light[clock]:(occ?lightOn:0), equipW=E.equip*ops.eqF*Af*(allDay?PROF.equip[clock]:(occ?1:0.2)), peopleW=allDay?Af/ops.occ*75*PROF.people[clock]:(occ?Af/ops.occ*75:0); const phiInt=peopleW+lightW+equipW;
      const Hmech=1200*(occ?E.vent/1000*Af*(1-E.hr):0), Hinf=1200*E.infil*z.vol/3600;
      const solveH=(phiHC,Hve)=>{ const H1=1/(1/Hve+1/His), H2=H1+Hw, H3=1/(1/H2+1/Hms); const phiM0=Am/At*(0.5*phiInt+sol), phiSt0=(1-Am/At-Hw/(9.1*At))*(0.5*phiInt+sol); const phiIa=0.5*phiInt+phiHC;
        const mtot=phiM0+Hem*Te+H3*(phiSt0+Hw*Te+H1*(phiIa/Hve+Te))/H2; const TmN=(Tm*(Cm/3600-0.5*(H3+Hem))+mtot)/(Cm/3600+0.5*(H3+Hem)); const Tmm=(TmN+Tm)/2;
        const Ts=(Hms*Tmm+phiSt0+Hw*Te+H1*(Te+phiIa/Hve))/(Hms+Hw+H1); const Ta=(His*Ts+Hve*Te+phiIa)/(His+Hve); return {Ta,Ts,TmN}; };
      let Hve=Hmech+Hinf, res=solveH(0,Hve), phi=0, opened=false;
      if(winOn&&z.operable&&res.Ta>24&&Te<res.Ta-1&&Te>10&&(occ||allDay)){ Hve+=1200*z.ach*z.vol/3600; res=solveH(0,Hve); opened=true; }
      const sH=occ?E.setH:E.setH-4, sC=occ?E.setC:E.setC+4;
      if((heatOn&&res.Ta<sH)||(coolOn&&res.Ta>sC)){ const tgt=res.Ta<sH?sH:sC; const r10=solveH(10*Af,Hve); phi=10*Af*(tgt-res.Ta)/(r10.Ta-res.Ta); if(phi<0&&!coolOn) phi=0; if(phi>0&&!heatOn) phi=0; res=solveH(phi,Hve); }
      Tm=res.TmN; if(!pass) continue;
      const t=(res.Ta+res.Ts)/2; To[k]=t; if(occ){ occN++; let b=0; while(b<4&&t>=T_BINS[b]) b++; bins[b]++; }
      if(phi>0) heat+=phi/1000; else cool-=phi/1000; if(opened) openH++;
      const dT=res.Ta-Te; if(dT>0){ loss.glass+=Hw*dT/1000; loss.wall+=z.Aop*E.wallU*dT/1000; loss.roof+=z.roof*E.roofU*dT/1000; loss.vent+=Hmech*dT/1000; loss.infil+=Hinf*dT/1000; }
      if(t<mon.min[m]) mon.min[m]=t; if(t>mon.max[m]) mon.max[m]=t; mon.sum[m]+=t; mon.cnt[m]++; }
    return {key:z.key,name:z.name,area:z.area,Agl:z.Agl,Aop:z.Aop,To,bins,occN,heat,cool,openH,loss,mon:{min:mon.min,max:mon.max,mean:mon.sum.map((v,i)=>v/Math.max(1,mon.cnt[i]))},operable:z.operable}; });
  return out; }
function energyHTML(){
  const floors=LAB.floors; if(!floors) return ''; const r=model(floors); const E=LAB.S.energy; const names={N:'North',E:'East',S:'South',W:'West'}; const V=LAB.viz;
  return `<h2>Energy · typical year</h2><div class="kpi">${kpi('TEUI',r.teui,'kWh/m²/yr',r.tgt.teui)}${kpi('TEDI',r.tedi,'kWh/m²/yr heating demand',r.tgt.tedi)}${kpi('GHGI',r.ghgi,'kgCO₂e/m²/yr',r.tgt.ghgi)}</div>
  ${V.fig(targetBars(r),'Indicative City of Vancouver rezoning targets weighted by program.')}
  ${r.method==='hourly'?lossHTML(r):''}
  ${r.method==='hourly'?`<div class="kpi">${kp('Peak heating',r.peakH.toFixed(0)+' W/m²','design hour of the typical year')}${kp('Peak cooling',r.peakC.toFixed(0)+' W/m²','design hour of the typical year')}${kp('Lighting saved by daylight',Math.round(r.lightShare*100)+'%',r.daylit?fmtI(r.lightSave/1000)+' MWh/yr · dimming on daytime programs':'waiting for the daylight run',r.lightShare>0.2?'ok':'')}</div>`:''}
  ${V.fig(chartSVG(r,false),'Monthly energy by end use: heating peaks in winter, cooling and fans in summer; lighting dips in the bright months where daylight dims it.')}
  ${r.method==='hourly'?V.fig(loadCarpet(r),'Heating (red) and cooling (blue) demand, W/m² of floor, by week across the year and hour of the day: night-time heating, sun-driven afternoon cooling, the setback after hours.'):''}
  ${V.row(V.fig(useDonut(r),`${fmtI(r.elec/1000)} MWh electricity, ${fmtI(r.gas/1000)} MWh gas · ${fmtI(r.total/Math.max(1,r.people.total))} kWh per person · ${PLANT[E.heat]}`),V.fig(V.hbars(ORI.map(o=>({label:names[o],v:r.glz[o].wwrAvg,color:'var(--glass)',text:Math.round(r.glz[o].wwrAvg*100)+'% · SHGC '+r.glz[o].shgcEff.toFixed(2)+' · '+fmtI(r.glz[o].A)+' m²'})),{key:'glazing-face',title:'Glazing by face · window-to-wall from the zones',max:1,labelW:46}),'Effective SHGC is after the zone\'s shading devices.'))}
  ${V.fig(V.hbars(r.rows.map(z=>({label:LAB.PROG[z.p].name+(z.cond?'':' (uncond.)'),v:z.teui,mark:(TARGETS[z.p]||TARGETS.office).teui,color:z.teui<=(TARGETS[z.p]||TARGETS.office).teui?'var(--ok)':'var(--bad)',text:z.teui.toFixed(0)+' · target '+(TARGETS[z.p]||TARGETS.office).teui+' · TEDI '+z.tediI.toFixed(1)+' · '+fmtI(z.area)+' m²'})),{key:'program-teui',title:'TEUI by program, kWh/m²/yr · tick = target',dec:0,labelW:110}),'Programs are derived from the massing; sky gardens and plant floors are unconditioned.')}
  <details style="margin-top:10px"><summary>Monthly table</summary><div class="tbl-wrap"><table><thead><tr><th>MWh</th>${LAB.CLIMATE.months.map(m=>`<th class="num">${m}</th>`).join('')}</tr></thead><tbody>${USES.map(([k,n])=>`<tr><td>${n}</td>${r.monthly[k].map(v=>`<td class="num">${(v/1000).toFixed(0)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>
  <p class="note">${r.method==='hourly'?`Hourly simulation, one zone per program, for all 8,760 hours of the CWEC typical year: the ISO 13790 five-resistance, one-capacitance model used by the open-source RC_BuildingSimulator, with air, surface and mass nodes (${E.mass} construction). Transmission through glazing, opaque wall, roofs, terraces and soffits comes from the carved floor masks by orientation; ventilation with ${Math.round(E.hr*100)}% heat recovery runs on the program schedule, with infiltration always; set points ${E.setH} / ${E.setC} °C, set back 4 K after hours. Solar gains use the Perez all-weather sky on each face at its true azimuth (as EnergyPlus and Radiance do), through the window-to-wall ratio, SHGC and device transmission of the zone on that face and level, with ${Math.round((E.shade||0.85)*100)}% of the sun reaching the façade past the neighbours. Lighting on daytime programs dims with each floor's climate-based daylight. The heat pump and chiller follow the outdoor temperature at a fixed share of the Carnot efficiency (heating COP 3.0 at 7 °C). TEUI counts all end uses; TEDI is space-heating demand before the plant; GHGI uses 0.18 kg/kWh for gas and 0.011 kg/kWh for BC electricity.`:`Monthly balance per program zone in the manner of ISO 13790 (the hourly weather is not loaded): transmission, ventilation with heat recovery and infiltration, internal and solar gains offset through an ISO 13790 utilisation factor set by thermal mass.`} Interior zoning, real HVAC controls and thermal bridges need a full EnergyPlus or OpenStudio model for compliance. The end-use, glazing and program tables are in the report.</p>`;
}
function energyReport(){
  const r=last||model(LAB.floors); const E=LAB.S.energy; const names={N:'North',E:'East',S:'South',W:'West'};
  return {title:'Energy model · typical year',chart:chartSVG(r,true),charts:[{svg:LAB.viz.pdf(useDonut(r)),title:'End uses'},{svg:LAB.viz.pdf(targetBars(r)),title:'Against the targets'}],
    settings:[['Glazing U / wall U / roof U',E.glazU.toFixed(1)+' / '+E.wallU.toFixed(2)+' / '+E.roofU.toFixed(2)+' W/m²K'],['Window-to-wall by face N / E / S / W',ORI.map(o=>Math.round(r.glz[o].wwrAvg*100)+'%').join(' / ')+' (from the façade zones)'],['Effective SHGC after devices N / E / S / W',ORI.map(o=>r.glz[o].shgcEff.toFixed(2)).join(' / ')],['Infiltration / outdoor air',E.infil.toFixed(2)+' ach / '+E.vent.toFixed(2)+' L/s per m² with '+Math.round(E.hr*100)+'% heat recovery'],['Plant',PLANT[E.heat]+' (heat pump COP 3.0 at 7 °C following the outdoor temperature, 2.5 hot water; 92% / 85% gas), cooling COP '+E.cop.toFixed(2)+' at 35 °C, also following the outdoor temperature'],['Set points',E.setH.toFixed(1)+' / '+E.setC.toFixed(1)+' °C'],['Lighting / plug loads',E.lpd.toFixed(1)+' / '+E.equip.toFixed(1)+' W/m²'],['Context shading',Math.round((E.shade||0.85)*100)+'% of solar reaches the façade'],['Thermal mass',E.mass]],
    stats:[['TEUI',r.teui.toFixed(1)+' kWh/m²/yr (target '+r.tgt.teui.toFixed(0)+')'],['TEDI',r.tedi.toFixed(1)+' kWh/m²/yr (target '+r.tgt.tedi.toFixed(0)+')'],['GHGI',r.ghgi.toFixed(2)+' kgCO2e/m²/yr (target '+r.tgt.ghgi.toFixed(1)+')'],['Annual energy',fmtI(r.total/1000)+' MWh'],['Electricity / gas',fmtI(r.elec/1000)+' / '+fmtI(r.gas/1000)+' MWh'],['Per person',fmtI(r.total/Math.max(1,r.people.total))+' kWh/yr'],['Glazing / opaque wall area',fmtI(r.envelope.gl)+' / '+fmtI(r.envelope.op)+' m²'],['Roofs, terraces and soffits',fmtI(r.envelope.roof)+' m²']],
    tables:[{key:'end-uses',title:'End uses',head:['End use','MWh/yr','kWh/m²','Share'],rows:USES.map(([k,n])=>[n,fmtI(r.uses[k]/1000),(r.uses[k]/r.gfa).toFixed(1),(r.uses[k]/r.total*100).toFixed(0)+'%'])},
      {title:'Glazing by face',head:['Face','Façade m²','Window-to-wall','Effective SHGC'],rows:ORI.map(o=>[names[o],fmtI(r.glz[o].A),Math.round(r.glz[o].wwrAvg*100)+'%',r.glz[o].shgcEff.toFixed(2)])},
      {title:'By program',head:['Program','m²','TEUI','TEDI','Target TEUI','Solar gain MWh','Internal gain MWh'],rows:r.rows.map(z=>[LAB.PROG[z.p].name+(z.cond?'':' (unconditioned)'),fmtI(z.area),z.teui.toFixed(0),z.tediI.toFixed(1),String((TARGETS[z.p]||TARGETS.office).teui),fmtI(z.solar/1000),fmtI(z.internal/1000)])},
      {title:'Monthly energy, MWh',head:['End use'].concat(LAB.CLIMATE.months),rows:USES.map(([k,n])=>[n].concat(r.monthly[k].map(v=>(v/1000).toFixed(0))))}],
    notes:[(r.method==='hourly'?'Method: hourly ISO 13790 5R1C simulation per program zone for the 8,760 hours of the CWEC typical year (as in the open-source RC_BuildingSimulator), with Perez all-weather solar gains on each face, schedules and setbacks, heat recovery, daylight-linked dimming from the climate-based daylight run, and heat-pump and chiller efficiency following the outdoor temperature. Peak heating '+r.peakH.toFixed(0)+' W/m², peak cooling '+r.peakC.toFixed(0)+' W/m²; daylight dims '+Math.round(r.lightShare*100)+'% of the lighting. ':'')+'Fallback method: monthly quasi-steady-state balance per program zone in the manner of ISO 13790. Losses = (transmission + ventilation) × (set point − outdoor temperature) × hours; gains = internal (people 75 W, lighting at 75% of installed power, equipment on program schedules) + solar (glazing area × SHGC × device transmission × 0.9 frame factor × context shading × monthly irradiation by orientation for 49° N). Heating demand = losses − utilisation × gains; cooling demand = gains − utilisation × losses at the cooling set point. Utilisation follows the ISO 13790 gain/loss ratio with a mass parameter a of 2, 3 or 4.','Façade areas by orientation come from the exposed edges of each floor\'s 1 m solid/void mask, so voids, terraces and rotated plates change the envelope; window-to-wall ratio, SHGC and device transmission come from the façade zone covering each face and level. Roofs are the exposed tops of floors; soffits are voids under a floor above.','TEUI is total energy per m² of indoor area; TEDI is space-heating demand before plant efficiency; GHGI uses 0.18 kgCO2e/kWh for natural gas and 0.011 kgCO2e/kWh for BC electricity. Targets are indicative City of Vancouver rezoning values (housing 100 / 15 / 3, office 100 / 20 / 3, hotel 130 / 30 / 4) weighted by program area; confirm current by-law values before relying on them.','Climate: Vancouver Airport monthly normals, global horizontal irradiation 0.7 to 6.2 kWh/m²/day. Programs are derived from the massing by plate size and height. Not a substitute for an EnergyPlus or ClimateStudio model at design development.']};
}
/* ---------- massing efficiency: form-only metrics, no envelope or systems inputs ---------- */
const RATE_COL=['#1F7A4D','#7fb800','#fab219','#ec835a','#B3362B'], RATE_L=['A','B','C','D','E'];
function rate(v,bands,higherBetter){ let i=0; if(higherBetter){ while(i<bands.length&&v<bands[i]) i++; } else { while(i<bands.length&&v>bands[i]) i++; } return Math.min(4,i); }
function daylitShare(floors){
  let lit=0, tot=0;
  for(const fl of floors){ const m=fl.mask, W2=fl.w/2, D2=fl.d/2; const inside=(ix,iy)=>ix>=0&&iy>=0&&ix<m.nx&&iy<m.ny&&(m.x0+ix+0.5<=W2)&&(m.y0+iy+0.5<=D2);
    const dist=new Int16Array(m.nx*m.ny).fill(-1); const q=[];
    for(let iy=0;iy<m.ny;iy++) for(let ix=0;ix<m.nx;ix++){ if(!inside(ix,iy)||!m.cells[iy*m.nx+ix]) continue; tot++;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const jx=ix+dx,jy=iy+dy; if(!inside(jx,jy)||!m.cells[jy*m.nx+jx]){ dist[iy*m.nx+ix]=1; q.push(ix,iy); break; } } }
    let head=0; while(head<q.length){ const ix=q[head++], iy=q[head++]; const d=dist[iy*m.nx+ix]; if(d>=6) continue; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const jx=ix+dx,jy=iy+dy; if(!inside(jx,jy)||!m.cells[jy*m.nx+jx]) continue; const k=jy*m.nx+jx; if(dist[k]<0){ dist[k]=d+1; q.push(jx,jy); } } }
    for(let k=0;k<dist.length;k++) if(dist[k]>0) lit++; }
  return tot?lit/tot:0;
}
function formStudy(floors){
  const S=LAB.S; const gfa=floors.reduce((s,f)=>s+f.area,0), vol=floors.reduce((s,f)=>s+f.area*f.h,0);
  const fac={N:0,E:0,S:0,W:0}; let facTot=0, roof=0, soffit=0; floors.forEach((f,i)=>{ for(const o in fac){ const A=(f.facade?f.facade[o]:0)*f.h; fac[o]+=A; facTot+=A; } roof+=f.terrace+f.roof; soffit+=i>0?floors[i-1].coveredVoid:0; });
  const slab=floors[0].area, env=facTot+roof+soffit+slab;
  const ff=env/gfa, sv=env/vol, hli=(facTot*0.73+(roof+soffit+slab)*0.18)/gfa;
  const H=floors[floors.length-1].z+floors[floors.length-1].h, side=Math.sqrt(vol/H), envRef=4*side*H+2*side*side, ffRef=envRef/gfa, hliRef=(4*side*H*0.73+2*side*side*0.18)/gfa;
  const daylit=daylitShare(floors); const outdoor=floors.reduce((s,f)=>s+f.terrace+f.roof+f.coveredVoid,0);
  const south=(fac.S+0.5*fac.E+0.5*fac.W)/Math.max(1,facTot), north=fac.N/Math.max(1,facTot);
  const slender=H/Math.min(floors[0].w,floors[0].d);
  const metrics=[
    {k:'Form factor',v:ff,fmt:ff.toFixed(2)+' m²/m²',bench:'≤ 0.30 compact · 0.5+ articulated',r:rate(ff,[0.3,0.4,0.5,0.6],false),why:'Envelope area per m² of floor: every extra m² of skin is heat loss and cost.'},
    {k:'Surface-to-volume',v:sv,fmt:sv.toFixed(3)+' m⁻¹',bench:'≤ 0.09 towers · 0.18+ low-rise',r:rate(sv,[0.09,0.12,0.15,0.18],false),why:'The same idea per m³ of conditioned volume.'},
    {k:'Compactness vs square prism',v:envRef/env,fmt:Math.round(envRef/env*100)+'%',bench:'100% = as compact as a square prism of the same height and volume',r:rate(envRef/env,[0.9,0.8,0.7,0.6],true),why:'How much extra skin the voids, steps and shifts add.'},
    {k:'Heat-loss index',v:hli,fmt:hli.toFixed(2)+' W/m²K',bench:'≤ 0.25 good · 0.5+ leaky form',r:rate(hli,[0.25,0.32,0.4,0.5],false),why:'Envelope × typical U-values (0.73 for a 40% glazed wall, 0.18 for roofs and soffits) per m² of floor, before any envelope choice.'},
    {k:'Daylit floor area',v:daylit,fmt:Math.round(daylit*100)+'%',bench:'≥ 75% shallow plates · < 30% deep plates',r:rate(daylit,[0.75,0.6,0.45,0.3],true),why:'Share of indoor area within 6 m of a façade or void: lighting energy and quality of space.'},
    {k:'Solar-facing façade',v:south,fmt:Math.round(south*100)+'%',bench:'40–55% balanced',r:Math.abs(south-0.47)<0.06?0:(Math.abs(south-0.47)<0.12?1:(Math.abs(south-0.47)<0.18?2:3)),why:'South plus half of east and west: winter gains and summer overheating both rise with it.'},
    {k:'North-facing façade',v:north,fmt:Math.round(north*100)+'%',bench:'≤ 25%',r:rate(north,[0.22,0.28,0.34,0.4],false),why:'Loses heat without solar gain.'},
    {k:'Exposed roofs and soffits',v:(roof+soffit)/gfa,fmt:fmtI(roof+soffit)+' m² · '+Math.round((roof+soffit)/gfa*100)+'% of GFA',bench:'≤ 3% for a plain shaft',r:rate((roof+soffit)/gfa,[0.03,0.06,0.1,0.15],false),why:'Terraces and voids add horizontal envelope, the costliest kind.'},
  ];
  const score=metrics.reduce((s,m)=>s+m.r,0)/metrics.length; const overall=Math.round(score);
  return {gfa,vol,env,facTot,fac,roof,soffit,slab,ff,sv,hli,ffRef,hliRef,daylit,outdoor,south,north,slender,metrics,score,overall,relHeat:hli/hliRef,relEnv:env/envRef,side,H};
}
const badge=i=>`<span class="rating" style="background:${RATE_COL[i]}">${RATE_L[i]}</span>`;
function formReadings(r){ const out=[]; const names={N:'North',E:'East',S:'South',W:'West'};
  out.push(`Overall form rating <b>${RATE_L[r.overall]}</b>: the massing would lose ${Math.round(r.relHeat*100)}% of the heat a ${r.side.toFixed(0)} m square shaft of the same height and volume would, at the same construction.`);
  if(r.ff>0.4) out.push(`Form factor ${r.ff.toFixed(2)}: the skin is large for the floor area. Voids, steps and terraces are costing envelope; each is a heat-loss and cost decision to confirm in design development.`); else out.push(`Form factor ${r.ff.toFixed(2)}: a compact envelope; the energy story will be decided by glazing ratio and systems rather than form.`);
  if(r.daylit<0.6) out.push(`Only ${Math.round(r.daylit*100)}% of the floor is within 6 m of a façade or void: deep plates will lean on electric light. Voids, slimmer wings or a lower core share help.`); else out.push(`${Math.round(r.daylit*100)}% of the floor is within 6 m of a façade or void: good daylight reach for offices and housing alike.`);
  const hotO=Object.keys(r.fac).reduce((a,o)=>r.fac[o]>r.fac[a]?o:a,'S'); out.push(`The largest face is ${names[hotO].toLowerCase()} at ${fmtI(r.fac[hotO])} m² (${Math.round(r.fac[hotO]/Math.max(1,r.facTot)*100)}% of the façade); solar-facing share ${Math.round(r.south*100)}%${r.south>0.55?', high: shading will matter':(r.south<0.4?', low: little winter gain':' , balanced')}.`);
  if((r.roof+r.soffit)/r.gfa>0.06) out.push(`Roofs, terraces and soffits are ${Math.round((r.roof+r.soffit)/r.gfa*100)}% of the floor area: the costliest envelope, and also the PV and planting opportunity.`);
  return out; }
function formRadar(r){ const V=LAB.viz; return V.radar(r.metrics.map(m=>({label:m.k.replace('Compactness vs square prism','Compactness').replace('Exposed roofs and soffits','Roofs, soffits').replace('Solar-facing façade','Solar-facing').replace('North-facing façade','North-facing').replace('Daylit floor area','Daylit area').replace('Surface-to-volume','Surface / volume'),t:(4-m.r)/4,color:RATE_COL[m.r],text:m.fmt+' · '+RATE_L[m.r]})),{key:'form-radar',title:'Form profile · rim is an A rating',color:RATE_COL[r.overall]}); }
function formHTML(){
  const floors=LAB.floors; if(!floors) return ''; const r=formStudy(floors); const V=LAB.viz; const names={N:'North',E:'East',S:'South',W:'West'};
  return `<h2>Massing efficiency</h2><div class="kpi"><div><small>Overall</small><b><span class="rating" style="background:${RATE_COL[r.overall]};font-size:16px;padding:4px 10px">${RATE_L[r.overall]}</span></b><em>form-only rating, A best</em></div><div><small>Heat loss vs compact prism</small><b class="${r.relHeat>1.15?'over':'ok'}">${Math.round(r.relHeat*100)}%</b><em>${r.relHeat>1?'+':''}${Math.round((r.relHeat-1)*100)}% against a ${r.side.toFixed(0)} m square shaft</em></div><div><small>Envelope</small><b>${fmtI(r.env)} m²</b><em>${fmtI(r.facTot)} façade · ${fmtI(r.roof+r.soffit)} roofs and soffits</em></div></div>
  <p class="headline">${formReadings(r)[0]}</p>
  ${V.row(V.fig(formRadar(r),'Eight form metrics rated A to E for supertall towers; the fuller the shape, the more efficient the form.'),V.fig(V.hbars(['N','E','S','W'].map(o=>({label:names[o],v:r.fac[o],color:{N:'#5B7FA6',E:'#D9A441',S:'#D06A4B',W:'#8C5B90'}[o],text:fmtI(r.fac[o])+' m² · '+Math.round(r.fac[o]/Math.max(1,r.facTot)*100)+'%'})),{key:'facade-orient',title:'Façade by orientation',dec:0,labelW:46}),`Solar-facing share ${Math.round(r.south*100)}% (south plus half of east and west); north ${Math.round(r.north*100)}%.`))}
  ${V.fig(V.hbars(r.metrics.map(m=>({label:m.k,v:4.3-m.r,color:RATE_COL[m.r],text:m.fmt+' · '+RATE_L[m.r]})),{key:'form-metrics',title:'Form metrics · bar length is the rating, A longest',max:4.3,labelW:150}),'Benchmarks: form factor ≤ 0.30 compact; surface-to-volume ≤ 0.09 for towers; heat-loss index ≤ 0.25 W/m²K; daylit area ≥ 75% within 6 m of a façade; solar-facing 40–55%; north ≤ 25%; roofs and soffits ≤ 3% of floor area.')}
  <p class="note">Read from the massing alone: envelope areas come from the carved floor masks by orientation, roofs are exposed floor tops, soffits are voids under a floor above. The heat-loss index applies typical construction so that only form is compared; the full energy model in Design development takes the façade zones, construction and systems. Ratings A to E are bands for supertall towers, not code compliance. The metric table and readings are in the report.</p>`;
}
function formReport(){
  const r=formStudy(LAB.floors); const S=LAB.S;
  return {title:'Massing efficiency',charts:[{svg:LAB.viz.pdf(formRadar(r)),title:'Form profile'}],settings:[['Typology',LAB.TYP[S.typology].name],['Height / floors',S.height+' m / '+LAB.floors.length],['Reference prism',r.side.toFixed(1)+' m square, same height and volume'],['Typical construction assumed','U 0.73 W/m²K walls at 40% glazing, 0.18 roofs and soffits']],
    stats:[['Overall form rating',RATE_L[r.overall]+' (A best)'],['Heat loss vs compact prism',Math.round(r.relHeat*100)+'%'],['Envelope',fmtI(r.env)+' m² ('+fmtI(r.facTot)+' façade, '+fmtI(r.roof+r.soffit)+' roofs and soffits, '+fmtI(r.slab)+' ground slab)'],['Indoor GFA / volume',fmtI(r.gfa)+' m² / '+fmtI(r.vol)+' m³'],['Outdoor area',fmtI(r.outdoor)+' m²'],['Slenderness',r.slender.toFixed(1)+' : 1'],['Daylit floor area (within 6 m of a façade)',Math.round(r.daylit*100)+'%']],
    tables:[{title:'Form metrics',head:['Metric','Value','Benchmark','Rating'],rows:r.metrics.map(m=>[m.k,m.fmt,m.bench,RATE_L[m.r]])},{key:'facade-orient',title:'Façade by orientation',head:['Orientation','m²','Share'],rows:['N','E','S','W'].map(o=>[{N:'North',E:'East',S:'South',W:'West'}[o],fmtI(r.fac[o]),Math.round(r.fac[o]/Math.max(1,r.facTot)*100)+'%'])},{title:'Readings',head:['What the form suggests'],rows:formReadings(r).map(s=>[s.replace(/<[^>]+>/g,'')])}],
    notes:['Form-only study: envelope areas are measured from the carved 1 m floor masks by orientation; roofs are exposed floor tops; soffits are voids under a floor above. No envelope or system inputs are used; the heat-loss index applies typical construction so that only form is compared.','Ratings are bands for supertall towers (form factor A ≤ 0.30, B ≤ 0.40, C ≤ 0.50, D ≤ 0.60; heat-loss index A ≤ 0.25 W/m²K; daylit area A ≥ 75% within 6 m of a façade). They are not code compliance figures.','The reference is a square prism of the same height and conditioned volume; the heat-loss ratio says how much more the form would lose than that prism at the same construction.'].concat(r.metrics.map(m=>m.k+': '+m.why))};
}
LAB.energy={
  init(){ const E=LAB.S.energy; if(E.shade==null) E.shade=0.85;
    LAB.controlsFor($('energy-env'),ENV_P,'en',()=>LAB.S.energy,()=>{ LAB.syncFor($('energy-env'),ENV_P,'en',LAB.S.energy); if(LAB.sim&&LAB.sim.energyChanged) LAB.sim.energyChanged(); });
    LAB.controlsFor($('energy-sys'),SYS_P,'en',()=>LAB.S.energy,()=>{ LAB.syncFor($('energy-sys'),SYS_P,'en',LAB.S.energy); if(LAB.sim&&LAB.sim.energyChanged) LAB.sim.energyChanged(); });
    LAB.syncFor($('energy-env'),ENV_P,'en',LAB.S.energy); LAB.syncFor($('energy-sys'),SYS_P,'en',LAB.S.energy); },
  formStudy, formHTML, formReportData:formReport, energyHTML, thermalZones, lossHTML, lossRows, lossRows, T_BINS, model, modelMonthly, reportData:energyReport, TARGETS, USES, chartSVG, get last(){return last;},
};
})();
