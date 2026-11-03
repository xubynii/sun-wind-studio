/* Sun & Wind Studio — rain: wind-driven rain on the façades (ISO 15927-3 / BS 8104 reading), the building's rain shadow at ground level,
   entrance shelter under canopies and podiums, glass kept dry by the façade zones' devices, and roof catchment, run-off and harvesting (the core's water model). Vancouver normals. */
(function(){
'use strict';
const LAB=window.LAB; const $=LAB.$, fmtI=LAB.fmtI; const C=LAB.CLIMATE;
const ORI=['N','E','S','W']; const NAMES={N:'North',E:'East',S:'South',W:'West'}; const FACE_AZ={N:0,E:90,S:180,W:270};
/* share of the year's rain arriving with wind from each sector (Vancouver: frontal rain rides on south-easterlies; summer showers are lighter and westerly) */
const RAIN_ROSE=[{name:'N',dir:0,f:0.03},{name:'NE',dir:45,f:0.05},{name:'E',dir:90,f:0.17},{name:'SE',dir:135,f:0.34},{name:'S',dir:180,f:0.17},{name:'SW',dir:225,f:0.10},{name:'W',dir:270,f:0.09},{name:'NW',dir:315,f:0.05}];
const RAIN_SPEED={N:3.5,NE:4,E:5,SE:6.5,S:5,SW:4.5,W:4.5,NW:4};
const P={
  dir:{label:'Design storm · wind from',min:0,max:355,step:5,fmt:v=>v+'° · '+['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(v/22.5)%16]},
  speed:{label:'Storm wind at 10 m',min:2,max:20,step:0.5,fmt:v=>v.toFixed(1)+' m/s'},
  drop:{label:'Rain type',options:[['drizzle','drizzle · 0.5 mm drops fall 2 m/s'],['steady','steady rain · 1.5 mm drops fall 5 m/s'],['heavy','heavy rain · 3 mm drops fall 8 m/s']]},
  dur:{label:'Storm duration',min:10,max:180,step:10,fmt:v=>v+' min'},
  surface:{label:'Ground surface',options:[['paved','paved · 90% run-off'],['mixed','mixed paving and planting · 60%'],['planted','planted, pervious · 30%']]},
};
const RUNOFF={paved:0.9,mixed:0.6,planted:0.3};
const VT={drizzle:2.0,steady:5.0,heavy:8.0};
let R=null; // last result
function state(){ const S=LAB.S; if(!S.rain){ S.rain={dir:135,speed:9,drop:'steady',dur:60,surface:'paved'}; } if(S.rain.dur==null) S.rain.dur=60; if(!S.rain.surface) S.rain.surface='paved'; if(!S.rain.fromData&&C.loaded&&C.stormSpeedP95){ S.rain.speed=Math.max(6,Math.round(C.stormSpeedP95*2)/2); const top=C.rainRose&&C.rainRose.slice().sort((a,b)=>b.f-a.f)[0]; if(top) S.rain.dir=top.dir; S.rain.fromData=true; } return S.rain; }
function rose(){ return (C.loaded&&C.rainRose&&C.rainRose.some(r=>r.f>0))?C.rainRose:RAIN_ROSE; }
function roseSpeed(r){ return (C.loaded&&C.rainRose&&r.s)?r.s:RAIN_SPEED[r.name]; }
function angle(){ const s=state(); const alpha=Math.atan(s.speed/VT[s.drop]); return {alpha,alt:Math.PI/2-alpha}; } // alpha from vertical; the rain vector falls at altitude 90−alpha
function wallFactor(z,top){ const t=Math.max(0,Math.min(1,z/Math.max(1,top))); return 0.2+0.3*t*t; } // ISO 15927-3 wall factors: ~0.2 low on a tall wall, ~0.5 at the top
function exposure(){
  /* annual driving-rain index per face: I = Σ over sectors f·R·v·cos(θ) in the manner of ISO 15927-3 (airfield index, 2/9·v·r^(8/9)), using monthly normals and the rain rose */
  const Rann=C.rain.reduce((a,b)=>a+b,0); const out={}; const s=state(); const RR=rose();
  for(const o of ORI){ let I=0, wet=0; for(const r of RR){ const cosT=Math.cos((r.dir-FACE_AZ[o])*Math.PI/180); if(cosT<=0) continue; const v=roseSpeed(r); I+=2/9*v*Math.pow(r.f*Rann,8/9)*cosT; wet+=r.f*cosT; }
    if(C.loaded&&C.wdrBins){ I=2/9*C.wdrBins.reduce((acc,S,b)=>acc+S*Math.max(0,Math.cos((b*10+5-FACE_AZ[o])*Math.PI/180)),0); } // hourly ISO 15927-3 sum from the weather file
    out[o]={index:I,wetShare:wet}; }
  const max=Math.max(...ORI.map(o=>out[o].index)); for(const o of ORI) out[o].rel=max?out[o].index/max:0;
  return out;
}
/* ---------- site drainage and ponding: where run-off collects when the site has topography ----------
   Ground elevation comes from the imported terrain (study.js terrainDEM, 2 m cells). Buildings are impassable. Priority-flood depression filling
   (Barnes et al. 2014) finds every closed depression and the level at which it spills; run-off is routed to the steepest lower neighbour (D8),
   each depression fills from its catchment and passes its overflow on along the spill path; the edges of the domain are the outlets. */
function ponding(){
  const sim=LAB.sim, T=sim.terrainDEM(), D=sim.DOM, nx=D.nx, ny=D.ny, cs=D.cs, N=nx*ny, s=state(), S=LAB.S;
  const depthMM=(S.water.storm||80)*(s.dur||60)/60, Cr=RUNOFF[s.surface]||0.9, rainM=depthMM/1000*Cr, cell=cs*cs;
  const out={flat:!T.has,depthMM,Cr,relief:T.has?T.max-T.min:0,ponds:[],pondArea:0,pondVol:0,leaves:0,inflowTot:0,atBase:[],trapped:0,towerIn:0};
  if(!T.has) return out;
  const z=T.dem; const tower=sim.towerRaster(cs,nx,ny); const SR=sim.buildSiteRaster(); const bld=new Uint8Array(N);
  for(let k=0;k<N;k++){ const ix=k%nx, iy=(k/nx)|0; if(tower[k]) bld[k]=2; else if(SR.H[(iy>>1)*SR.nx+(ix>>1)]>0) bld[k]=1; }
  // priority flood with a binary heap keyed on (level, insertion order)
  const F=new Float32Array(N).fill(Infinity), done=new Uint8Array(N), parent=new Int32Array(N).fill(-1), popIdx=new Int32Array(N).fill(-1); let no=0, seq=0;
  const hk=[], hs=[], hv=[]; const less=(i,j)=>hk[i]<hk[j]||(hk[i]===hk[j]&&hs[i]<hs[j]);
  const swap=(i,j)=>{ let t=hk[i]; hk[i]=hk[j]; hk[j]=t; t=hs[i]; hs[i]=hs[j]; hs[j]=t; t=hv[i]; hv[i]=hv[j]; hv[j]=t; };
  const push=(key,val)=>{ hk.push(key); hs.push(seq++); hv.push(val); let i=hk.length-1; while(i>0){ const q=(i-1)>>1; if(!less(i,q)) break; swap(i,q); i=q; } };
  const pop=()=>{ const val=hv[0]; const lk=hk.pop(), ls=hs.pop(), lv=hv.pop(); if(hk.length){ hk[0]=lk; hs[0]=ls; hv[0]=lv; let i=0; for(;;){ const l=2*i+1, r=l+1; let m=i; if(l<hk.length&&less(l,m)) m=l; if(r<hk.length&&less(r,m)) m=r; if(m===i) break; swap(i,m); i=m; } } return val; };
  for(let k=0;k<N;k++){ if(bld[k]) continue; const ix=k%nx, iy=(k/nx)|0; if(ix===0||iy===0||ix===nx-1||iy===ny-1){ F[k]=z[k]; push(F[k],k); } }
  while(hk.length){ const k=pop(); if(done[k]) continue; done[k]=1; popIdx[k]=no++; const ix=k%nx, iy=(k/nx)|0;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const jx=ix+dx, jy=iy+dy; if(jx<0||jy<0||jx>=nx||jy>=ny) continue; const j=jy*nx+jx; if(done[j]||bld[j]) continue; const f=Math.max(z[j],F[k]); if(f<F[j]){ F[j]=f; parent[j]=k; push(f,j); } } }
  // depressions: raised cells grouped into 8-connected components, each with one spill level
  const raised=new Uint8Array(N), comp=new Int32Array(N).fill(-1); const deps=[];
  for(let k=0;k<N;k++) if(done[k]&&F[k]>z[k]+0.002) raised[k]=1;
  for(let k=0;k<N;k++){ if(!raised[k]||comp[k]>=0) continue; const id=deps.length; const d={id,cells:[],F:F[k],entry:k,vin:0,Vs:0}; deps.push(d); const q=[k]; comp[k]=id;
    while(q.length){ const c=q.pop(); d.cells.push(c); if(popIdx[c]<popIdx[d.entry]) d.entry=c; const ix=c%nx, iy=(c/nx)|0; for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ const jx=ix+dx, jy=iy+dy; if(jx<0||jy<0||jx>=nx||jy>=ny) continue; const j=jy*nx+jx; if(raised[j]&&comp[j]<0){ comp[j]=id; q.push(j); } } }
    for(const c of d.cells) d.Vs+=(d.F-z[c])*cell; }
  // run-off targets: steepest lower neighbour; a depression cell with none is its pit; a slope cell with none follows the flood parent
  const tgt=new Int32Array(N).fill(-3); const ground=[];
  for(let k=0;k<N;k++){ if(!done[k]) continue; ground.push(k); const ix=k%nx, iy=(k/nx)|0; let best=-1, bz=Infinity;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const jx=ix+dx, jy=iy+dy; if(jx<0||jy<0||jx>=nx||jy>=ny) continue; const j=jy*nx+jx; if(!done[j]) continue; if(raised[k]&&!(raised[j]&&comp[j]===comp[k])) continue; if(z[j]>=z[k]) continue; const sc=z[j]+(dx&&dy?1e-6:0); if(sc<bz){ bz=sc; best=j; } }
    tgt[k]=best>=0?best:(raised[k]?-2:(parent[k]>=0?parent[k]:-1)); }
  // inflow: rain on the ground at the run-off coefficient, plus the terraces' edge cascades at the tower's base when they drain outward
  const inflow=new Float32Array(N); for(const k of ground) inflow[k]=rainM*cell;
  const W=LAB.water; if(W&&S.water.mode==='cascade'&&W.area>0){ const ring=[]; for(const k of ground){ const ix=k%nx, iy=(k/nx)|0; let adj=false; for(let dy=-1;dy<=1&&!adj;dy++) for(let dx=-1;dx<=1;dx++){ const jx=ix+dx, jy=iy+dy; if(jx<0||jy<0||jx>=nx||jy>=ny) continue; if(bld[jy*nx+jx]===2){ adj=true; break; } } if(adj) ring.push(k); }
    out.towerIn=W.area*depthMM/1000*0.8; if(ring.length) for(const k of ring) inflow[k]+=out.towerIn/ring.length; }
  // accumulate downhill: cells in order of falling level, falling ground, then reverse flood order (a cell always comes before the cell it drains to)
  ground.sort((a,b)=>(F[b]-F[a])||(z[b]-z[a])||(popIdx[b]-popIdx[a]));
  const acc=new Float32Array(N); let leaves=0; for(const k of ground){ acc[k]+=inflow[k]; const t=tgt[k]; if(t>=0) acc[t]+=acc[k]; else if(t===-2) deps[comp[k]].vin+=acc[k]; else leaves+=acc[k]; }
  // overflow: full depressions pass their excess along the flood path from the spill cell to the next depression or the edge
  deps.sort((a,b)=>b.F-a.F);
  for(const d of deps){ if(d.vin<=d.Vs) continue; let ov=d.vin-d.Vs; let p=parent[d.entry], guard=0; while(p>=0&&guard++<N){ acc[p]+=ov; if(raised[p]){ deps.find(x=>x.id===comp[p]).vin+=ov; ov=0; break; } p=parent[p]; } leaves+=ov; }
  // water level in each depression from the volume it holds
  const depth=new Float32Array(N); const site=LAB.site; const plaza=sim.plazaCellsAt(cs,nx,ny);
  for(const d of deps){ const V=Math.min(d.vin,d.Vs); if(V<=0) continue; let lo=Infinity, hi=d.F; for(const c of d.cells) lo=Math.min(lo,z[c]); const vol=L=>{ let v=0; for(const c of d.cells) v+=Math.max(0,L-z[c])*cell; return v; };
    for(let it=0;it<40;it++){ const mid=(lo+hi)/2; if(vol(mid)<V) lo=mid; else hi=mid; } const L=(lo+hi)/2; let area=0, maxD=0, sx=0, sy=0, sw=0, base=false, onPlaza=0; const baseSides={};
    for(const c of d.cells){ const dd=Math.max(0,L-z[c]); if(dd<=0.002) continue; depth[c]=dd; area+=cell; maxD=Math.max(maxD,dd); const ix=c%nx, iy=(c/nx)|0; const x=D.xmin+(ix+0.5)*cs, y=D.ymin+(iy+0.5)*cs; sx+=x*dd; sy+=y*dd; sw+=dd; if(plaza[c]) onPlaza+=cell;
      for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){ const jx=ix+dx, jy=iy+dy; if(jx<0||jy<0||jx>=nx||jy>=ny) continue; if(bld[jy*nx+jx]===2){ base=true; const o=Math.abs(dx)>=Math.abs(dy)?(dx>0?'W':'E'):(dy>0?'S':'N'); baseSides[o]=(baseSides[o]||0)+1; } } }
    if(area<2*cell||maxD<0.015) continue; const cx=sx/sw, cy=sy/sw; const onParcel=!!(site&&site.site&&LAB.pointInPoly(cx,cy,site.site.polygon));
    const sides=Object.keys(baseSides).sort((a,b)=>baseSides[b]-baseSides[a]);
    out.ponds.push({area,vol:V,maxD,meanD:V/area,level:L,spill:d.F,spills:d.vin>d.Vs,catchA:d.vin/rainM,cx,cy,onParcel,onPlaza:onPlaza/area,atBase:base,baseSide:sides[0]||null,where:base?'against the tower\'s base ('+(sides[0]?NAMES[sides[0]].toLowerCase()+' side':'')+')':(onPlaza/area>0.5?'on a plaza':(onParcel?'on the parcel':'in the street'))});
    out.pondArea+=area; out.pondVol+=V; if(base) out.atBase.push(out.ponds[out.ponds.length-1]); }
  // ground enclosed by buildings with no way out holds its own rain
  for(let k=0;k<N;k++){ if(bld[k]||done[k]) continue; depth[k]=rainM; out.trapped+=cell; }
  // run-off paths: cells carrying 600 m² of catchment or more that also carry far more than most of their neighbours (a swale, not sheet flow)
  const path=new Uint8Array(N); const thr=600*rainM; for(const k of ground){ if(acc[k]<thr||depth[k]>0.005) continue; const ix=k%nx, iy=(k/nx)|0; let lower=0, n=0; for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const jx=ix+dx, jy=iy+dy; if(jx<0||jy<0||jx>=nx||jy>=ny) continue; const j=jy*nx+jx; if(!done[j]) continue; n++; if(acc[j]<acc[k]*0.5) lower++; } if(n&&lower>=n-2) path[k]=1; }
  out.path=path; out.ponds.sort((a,b)=>b.vol-a.vol); out.leaves=leaves; out.inflowTot=ground.length*rainM*cell+out.towerIn; out.depth=depth; out.flowA=acc; out.rainM=rainM; out.ground=ground.length*cell; out.nDeps=deps.length;
  return out;
}
function bs8104(I){ return I<33?'sheltered':(I<56.5?'moderate':(I<100?'severe':'very severe')); } // L/m² per spell bands, read against the annual index scaled to a worst spell
async function run(progress){
  const S=LAB.S, s=state(); if(!LAB.floors) return null; if(progress) progress('Rain shadow…'); await new Promise(r=>setTimeout(r,20));
  const {alpha,alt}=angle(); const ex=LAB.sim.exposurePass(alt,s.dir); // rain comes from s.dir, descending at altitude alt
  const N=ex.shade.length; const DOM={xmin:-340,ymin:-220,nx:340,cs:2}; let dry=0, drySite=0, dryPlaza=0, plazaTot=0; const site=LAB.site; const foot=LAB.sim.towerRaster?null:null;
  const plaza=new Uint8Array(N); if(site) for(const m of site.meshes){ if(m.layer!=='plaza'&&m.layer!=='midblock') continue; /* plaza cells from the mesh triangles on the 2 m grid */ for(let i=0;i<m.f.length;i+=3){ const a=m.f[i]*3,b=m.f[i+1]*3,c=m.f[i+2]*3; const xs=[m.v[a],m.v[b],m.v[c]], ys=[m.v[a+1],m.v[b+1],m.v[c+1]]; const x0=Math.max(0,Math.floor((Math.min(...xs)-DOM.xmin)/2)), x1=Math.min(339,Math.floor((Math.max(...xs)-DOM.xmin)/2)), y0=Math.max(0,Math.floor((Math.min(...ys)-DOM.ymin)/2)), y1=Math.min(219,Math.floor((Math.max(...ys)-DOM.ymin)/2)); for(let iy=y0;iy<=y1;iy++) for(let ix=x0;ix<=x1;ix++) plaza[iy*340+ix]=1; } }
  for(let k=0;k<N;k++){ if(ex.shade[k]>0.5){ dry+=4; const x=DOM.xmin+((k%340)+0.5)*2, y=DOM.ymin+(Math.floor(k/340)+0.5)*2; if(site&&site.site&&LAB.pointInPoly(x,y,site.site.polygon)) drySite+=4; if(plaza[k]) dryPlaza+=4; } if(plaza[k]) plazaTot+=4; }
  // wetted façade per face and floor from the exposure pass (lit area = area the rain vector reaches)
  const floors=LAB.floors, top=S.height; const wet={N:0,E:0,S:0,W:0}; const byFloor=[]; for(let i=0;i<floors.length;i++){ const f=floors[i]; const row={i,z:f.z,fac:{}}; for(const o of ORI){ const a=ex.Az?ex.Az[o][i]:0; row.fac[o]=a; wet[o]+=a; } byFloor.push(row); }
  const facArea={}; for(const o of ORI) facArea[o]=floors.reduce((a,f)=>a+(f.facade?f.facade[o]:0)*f.h,0);
  const expo=exposure(); const Rann=C.rain.reduce((a,b)=>a+b,0);
  // wind-driven rain on each face in the design storm (catch ratio ~0.222·U·R^0.88 with the wall factor by height) and over the year (index-weighted)
  const stormI=S.water.storm||80; const faces=ORI.map(o=>{ const cosT=Math.max(0,Math.cos((s.dir-FACE_AZ[o])*Math.PI/180)); let catchStorm=0, annual=0, A=0; for(const r of byFloor){ const f=floors[r.i]; const zc=f.z+f.h/2; const wf=wallFactor(zc,top); const a=(f.facade?f.facade[o]:0)*f.h; A+=a; catchStorm+=0.222*s.speed*Math.pow(stormI,0.88)*cosT*wf*a; annual+=expo[o].index*wf*a; }
    return {o,area:A,wet:wet[o],wetShare:A?Math.min(1,wet[o]/A):0,storm:A?catchStorm/A:0,annual:A?annual/A:0,index:expo[o].index,rel:expo[o].rel,band:bs8104(expo[o].index/4)}; });
  // glass kept dry by the zones' devices (Design development): an overhang or balcony of depth D shelters D/tanα of the window below it
  let zones=null; if(LAB.sim.SW&&LAB.sim.SW.mode==='advanced'){ const ST=LAB.sim.STRATS; const tan=Math.tan(alpha); zones=LAB.sim.SW.zones.map((z,i)=>{ const st=ST[z.strat]; const hh=(floors[0].h||4)-0.45; const gh=Math.max(0.3,hh*z.wwr); let D=0; if(z.strat==='overhang'||z.strat==='balcony'||z.strat==='lightshelf') D=z.depth; if(z.strat==='doubleskin') D=99; const dryH=Math.min(gh,D/Math.max(0.05,tan)); const faces=z.face==='all'?ORI:[z.face]; const cos=Math.max(...faces.map(o=>Math.max(0,Math.cos((s.dir-FACE_AZ[o])*Math.PI/180)))); return {i,label:(z.face==='all'?'All':z.face)+' · L'+z.from+'–L'+Math.min(z.to,floors.length),strat:st.name,depth:D>=99?null:D,gh,dryShare:gh?dryH/gh:0,facing:cos>0.05}; }); }
  // entrance shelter: canopy and podium from the wind strategies
  let shelter=null; if(LAB.sim.SW&&LAB.sim.SW.mode==='advanced'){ const W=LAB.sim.SW.ws; const tan=Math.tan(alpha); const canopyH=6; const dryCanopy=W.canopy>0?Math.max(0,W.canopy-canopyH*tan):0; const podiumDry=W.podiumH>0&&W.podiumExt>0?Math.max(0,W.podiumExt-W.podiumH*tan):0; shelter={canopy:W.canopy,dryCanopy,podiumH:W.podiumH,podiumExt:W.podiumExt,podiumDry,leeDepth:S.height*0.6}; }
  // roof catchment and harvesting from the core's water model (computed when S.water.on)
  const W=LAB.water; const Y=W?LAB.rainYear(floors,W):null;
  if(progress) progress('Site drainage…'); await new Promise(r=>setTimeout(r,10)); let pond=null; try{ pond=ponding(); }catch(e){ console.error(e); }
  R={at:Date.now(),alpha,alt,dir:s.dir,speed:s.speed,drop:s.drop,dry,drySite,dryPlaza,plazaTot,faces,facArea,byFloor,expo,Rann,zones,shelter,water:W,year:Y,lost:ex.lostA/Math.max(1,LAB.sim.dni?1:1),shade:ex.shade,pond,advanced:LAB.sim.SW.mode==='advanced'};
  drawOverlay(); return R;
}
function drawOverlay(){ if(!R||!LAB.sim.setOverlay) return; const pd=R.pond&&!R.pond.flat?R.pond:null; const nx=LAB.sim.DOM.nx;   LAB.sim.setOverlay((ix,iy)=>{ const k=iy*nx+ix; if(pd){ const d=pd.depth[k]; if(d>0.005){ const t=Math.min(1,d/0.4); return [150+(20-150)*t,200+(70-200)*t,235+(150-235)*t,175+60*t]; } if(pd.path[k]) return [60,130,205,150]; } const v=R.shade[k]; if(v<0.5) return null; return [168,178,192,120]; }); }
const stat=(k,v)=>`<div class="stat"><b>${v}</b><small>${k}</small></div>`;
function readings(r){ const out=[]; const worst=r.faces.reduce((a,f)=>f.index>a.index?f:a,r.faces[0]);
  out.push(`The <b>${NAMES[worst.o].toLowerCase()}</b> face carries the driving rain: ${worst.index.toFixed(0)} on the annual index, ${worst.band} on the BS 8104 scale, and ${Math.round(worst.wetShare*100)}% of it is wetted in the design storm. Upper floors catch two to three times the rain of the base, so copings, sealant joints and glazing at the top of that face are the first details to resolve.`);
  const dryFace=r.faces.reduce((a,f)=>f.index<a.index?f:a,r.faces[0]); out.push(`The ${NAMES[dryFace.o].toLowerCase()} face stays largely dry (${Math.round(dryFace.wetShare*100)}% wetted): the place for entrances, operable windows and anything that dislikes water.`);
  out.push(`In a ${r.speed.toFixed(0)} m/s storm from ${r.dir}° the rain falls at ${(r.alpha*180/Math.PI).toFixed(0)}° from vertical. The building keeps ${fmtI(r.dry)} m² of ground dry on its lee side${r.plazaTot?', '+fmtI(r.dryPlaza)+' m² of it on plazas':''}; the windward side gets wetter still with the downwash.`);
  if(r.shelter){ if(r.shelter.canopy>0) out.push(`A ${r.shelter.canopy} m canopy at 6 m keeps ${r.shelter.dryCanopy.toFixed(1)} m of pavement dry on the windward side${r.shelter.dryCanopy<1.5?': too little for a dry entrance in this storm; a deeper canopy, a lower one or a recessed door would':''}.`); else out.push('No canopy is set: entrances on the windward face will be wet in this storm. Add one under Ventilation, or recess the doors.'); }
  if(r.water) out.push(`Roofs and terraces catch ${fmtI(r.water.area)} m²: ${fmtI(r.water.yield)} m³ a year at 80% run-off, and ${r.water.peak.toFixed(0)} L/s in the ${LAB.S.water.storm} mm/h design storm${r.water.dropsN?' with '+r.water.dropsN+' edge cascades off the terraces':''}.`);
  if(r.pond){ const p=r.pond; if(p.flat) out.push('The ground is level in this model, so run-off sheets away to the drains and nothing pools. Import a terrain surface (a layer named topo, terrain, contour or grade) to see where water would collect on the real site.');
    else if(!p.ponds.length) out.push(`With ${p.relief.toFixed(1)} m of relief across the site, a ${p.depthMM.toFixed(0)} mm storm runs off without pooling: every hollow either drains to the edge or holds less than 15 mm.`);
    else { const big=p.ponds[0]; out.push(`Water pools in ${p.ponds.length} place${p.ponds.length>1?'s':''} after a ${p.depthMM.toFixed(0)} mm storm; the largest, ${big.where}, covers ${fmtI(big.area)} m² up to ${(big.maxD*1000).toFixed(0)} mm deep (${big.vol.toFixed(0)} m³ from a ${fmtI(big.catchA)} m² catchment)${big.spills?' and spills over':' and holds it all'}.`);
      if(p.atBase.length){ const b=p.atBase[0]; out.push(`A pond forms against the tower's base on the ${b.baseSide?NAMES[b.baseSide].toLowerCase():''} side, ${(b.maxD*1000).toFixed(0)} mm deep: grade the ground away from the building (the usual rule is 2% for the first 3 m), set the slab above the pond level or add a trench drain there, or an entrance on that side will flood.`); }
      else out.push('No pond touches the tower\'s footprint; the base stays dry in this storm.');
      if(p.towerIn>0) out.push(`The terraces' edge cascades add ${p.towerIn.toFixed(0)} m³ at the base in this storm; draining the terraces inward to gutters would take this off the ground.`); } }
  if(r.zones){ const best=r.zones.filter(z=>z.facing).sort((a,b)=>b.dryShare-a.dryShare)[0]; if(best&&best.dryShare>0) out.push(`Among the zones facing the storm, ${best.label} (${best.strat}) keeps ${Math.round(best.dryShare*100)}% of its glass dry; fins and louvres do not shelter glass from rain, only overhangs, balconies and double skins do.`); }
  return out; }
const kp=(label,v,sub,cls)=>`<div><small>${label}</small><b class="${cls||''}">${v}</b>${sub?`<em>${sub}</em>`:''}</div>`;
const BAND_C={sheltered:'var(--ok)',moderate:'#E3C25C',severe:'#E08A3C','very severe':'var(--bad)'};
function rainRoseSVG(){ const V=LAB.viz; return V.rose(rose().map(x=>({name:x.name,dir:x.dir,f:x.f,s:roseSpeed(x),text:Math.round(x.f*100)+'% of the year\'s rain'})),{key:'rain-rose',title:'Rain rose · share of annual rain by wind sector',color:'#2F6FA8',sUnit:'m/s mean'}); }
function exposureSVG(r){ const V=LAB.viz; const faces={}; for(const f of r.faces) faces[f.o]={v:f.index,color:BAND_C[f.band],text:f.index.toFixed(0)+' · '+f.band}; return V.compass(faces,{key:'rain-exposure',title:'Driving-rain index by face · BS 8104 band',caption:'bar length = annual index; colour = sheltered, moderate, severe, very severe'}); }
function html(){
  const s=state(); const {alpha}=angle(); const r=R; const V=LAB.viz; const Rann=C.rain.reduce((a,b)=>a+b,0);
  let h=`<h2>Rain ${LAB.sim.SW.mode==='advanced'?'<span class="tag adv">Design development</span>':'<span class="tag">Massing</span>'}</h2>`;
  const storm=kp('Design storm',s.dir+'° · '+s.speed.toFixed(1)+' m/s',s.drop+' · rain '+(alpha*180/Math.PI).toFixed(0)+'° from vertical');
  if(!r){ h+=`<div class="kpi">${storm}${kp('Annual rain',fmtI(Rann)+' mm','Vancouver Intl AP, mostly October to March')}${kp('Storm on the ground',((LAB.S.water.storm||80)*(s.dur||60)/60).toFixed(0)+' mm',s.dur+' min at '+(LAB.S.water.storm||80)+' mm/h')}</div>`+V.fig(rainRoseSVG(),'Vancouver\'s rain rides on south-easterly fronts; petal length is the share of annual rain, colour the mean wind speed in that sector.')+`<p class="note">Run the study to map the building's rain shadow, the wetted façades, the roof catchment and, with a terrain surface, where water pools on the site.</p>`; return h; }
  const worst=r.faces.reduce((a,f)=>f.index>a.index?f:a,r.faces[0]); const p=r.pond;
  h+=`<p class="headline">${readings(r)[0]}</p>`;
  h+=`<div class="kpi">${storm}${kp('Most exposed face',NAMES[worst.o],worst.band+' · index '+worst.index.toFixed(0)+' · '+Math.round(worst.wetShare*100)+'% wetted',worst.band==='sheltered'?'ok':(worst.band==='very severe'?'over':''))}${kp('Ground kept dry',fmtI(r.dry)+' m²',r.plazaTot?fmtI(r.dryPlaza)+' m² of it on plazas':'rain shadow of the building')}</div>`;
  h+=V.row(V.fig(rainRoseSVG(),'Share of annual rain by wind sector; colour is the mean wind in that sector.'),V.fig(exposureSVG(r),'ISO 15927-3 annual index per face, read against the BS 8104 exposure bands.'));
  h+=V.row(V.fig(wallChart(r),'Share of each face the storm wets, by height: upper floors catch two to three times the base.'),V.fig(V.hbars(r.faces.map(f=>({label:NAMES[f.o],v:f.storm,color:BAND_C[f.band],text:f.storm.toFixed(1)+' L/m²/h · '+Math.round(f.wetShare*100)+'% wetted'})),{key:'storm-catch',title:'Storm catch on each face',dec:1,labelW:52}),'Wind-driven rain on the face in the design storm (catch ratio 0.222·U·R^0.88 with wall factors by height).'));
  if(r.shelter) h+=`<div class="kpi">${kp('Canopy keeps dry',r.shelter.canopy>0?r.shelter.dryCanopy.toFixed(1)+' m':'none',r.shelter.canopy>0?'of '+r.shelter.canopy+' m depth on the windward side':'entrances on the windward face will be wet',r.shelter.canopy>0&&r.shelter.dryCanopy<1.5?'over':'')}${kp('Podium keeps dry',r.shelter.podiumExt>0?r.shelter.podiumDry.toFixed(1)+' m':'none',r.shelter.podiumExt>0?'of '+r.shelter.podiumExt+' m':'no podium set')}${kp('On the parcel',fmtI(r.drySite)+' m²','ground kept dry')}</div>`;
  if(r.zones&&r.zones.length) h+=V.fig(V.hbars(r.zones.map(z=>({label:z.label,v:z.dryShare,color:z.facing?'#2F6FA8':'var(--chart-axis)',text:Math.round(z.dryShare*100)+'%'+(z.facing?'':' · not facing the storm')+(z.depth==null?' · double skin':'')})),{key:'glass-dry',title:'Glass kept dry by the façade zones',max:1,labelW:120}),'An overhang or balcony of depth D shelters D / tan α of the glass below it; fins and louvres do not shelter glass from rain.');
  if(p){ h+=`<h3>Site drainage and ponding</h3>`;
    if(p.flat) h+=`<div class="kpi">${kp('Terrain','level','no terrain surface imported')}${kp('Storm on the ground',p.depthMM.toFixed(0)+' mm',s.dur+' min at '+Math.round(p.Cr*100)+'% run-off')}</div><p class="note">The site model has no topography, so the drainage study has nothing to route. Import a terrain surface with the site (a layer named topo, terrain, contour, grade or landform) and the study will fill its hollows and show where water collects.</p>`;
    else { h+=`<div class="kpi">${kp('Pooled',fmtI(p.pondArea)+' m²',p.ponds.length+' pond'+(p.ponds.length===1?'':'s')+' · '+p.pondVol.toFixed(0)+' m³ · '+Math.round(100*p.pondVol/Math.max(1e-6,p.inflowTot))+'% of run-off',p.atBase.length?'over':'')}${kp('Leaves at the edges',p.leaves.toFixed(0)+' m³',p.relief.toFixed(1)+' m of relief across the site')}${kp('At the tower\'s base',p.atBase.length?p.atBase.length+' pond'+(p.atBase.length>1?'s':''):'dry',p.atBase.length?'grade away from the building':'no pond touches the footprint',p.atBase.length?'over':'ok')}</div>`;
      if(p.ponds.length) h+=V.fig(V.hbars(p.ponds.slice(0,8).map((q,i)=>({label:'Pond '+(i+1)+(q.atBase?' · at base':''),v:q.vol,color:q.atBase?'var(--bad)':'#2F6FA8',text:q.vol.toFixed(0)+' m³ · '+(q.maxD*1000).toFixed(0)+' mm deep · '+fmtI(q.area)+' m² · '+q.where+(q.spills?' · spills':'')})),{key:'ponds',title:'Where water pools · volume held after the storm',dec:0,labelW:92}),'Ponds in the viewport are drawn by depth; blue lines are run-off paths. Catch basins and pipes are not modelled: read ponds as where drains must go and where the ground floor must sit above.'); }
    h+=`<p class="note">Ground elevation comes from the imported terrain on 2 m cells, with the tower and the neighbours as impassable blocks. Priority-flood depression filling finds every closed hollow and its spill level; run-off (rain depth × the surface's run-off coefficient, plus the terraces' edge cascades at the base when they drain outward) is routed cell to cell down the steepest slope, each hollow fills from its catchment and passes the excess along its spill path, and the edges of the model are the outlets.</p>`; }
  if(r.water){ const W=r.water, Y=r.year; h+=`<h3>Roof catchment and harvesting</h3><div class="kpi">${kp('Catchment',fmtI(W.area)+' m²','roofs and terraces')}${kp('Annual yield',fmtI(W.yield)+' m³','at 80% run-off'+(Y?' · cistern '+fmtI(Y.cistern)+' m³':''))}${kp('Peak run-off',W.peak.toFixed(0)+' L/s',LAB.S.water.storm+' mm/h · '+W.outlets+' outlets, '+W.dropsN+' cascades')}</div>${Y?V.fig(rainChart(Y),`Monthly yield against the irrigation need of the planted terraces; the cistern is the largest shortfall wetter months must cover. Terraces drain ${LAB.S.water.mode==='cascade'?'outward over their edges':'inward to gutters'}.`):''}`; }
  h+=`<p class="note">Driving rain follows ISO 15927-3: an annual index per face ${C.loaded?'summed hour by hour from the CWEC2020 typical year for Vancouver Intl AP (wind speed × rain^(8/9) × cos θ), with each month\'s rainfall normal spread over its overcast, humid hours because the file carries no hourly rain':'from an assumed rain rose and sector wind speeds'}, with wall factors rising from 0.2 at the base to 0.5 at the top of a tall wall, read against BS 8104's exposure bands. The rain shadow is the ground the building, podium and canopy screen from rain falling at the storm angle. Indicative: detailing needs hourly weather and a façade-specific catch ratio. The full readings and tables are in the report.</p>`;
  return h;
}
function wallChart(r){ const W=380,H=150,L=40,Rr=8,T=10,B=24; const pw=W-L-Rr, ph=H-T-B; const top=LAB.S.height; const col={N:'#5B7FA6',E:'#D9A441',S:'#D06A4B',W:'#8C5B90'};
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Wetted façade by height" data-key="wetted-wall"><style>text{font-family:var(--font-m);font-size:8.5px;fill:var(--muted)}</style>`;
  for(const v of [0,0.5,1]){ const x=L+pw*v; s+=`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${T}" y2="${T+ph}" stroke="var(--chart-grid)"/><text x="${x.toFixed(1)}" y="${H-10}" text-anchor="middle">${Math.round(v*100)}%</text>`; }
  for(const o of ORI){ const pts=[]; for(const row of r.byFloor){ const f=LAB.floors[row.i]; const A=(f.facade?f.facade[o]:0)*f.h; const share=A>0?Math.min(1,row.fac[o]/A):0; const y=T+ph*(1-(f.z+f.h/2)/top); pts.push([L+pw*share,y]); } if(pts.length) s+=`<path d="M${pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L')}" fill="none" stroke="${col[o]}" stroke-width="1.4"/>`; }
  s+=`<text x="${L}" y="8">wetted share of each face, by height · ${ORI.map(o=>`<tspan fill="${col[o]}">${o}</tspan>`).join(' ')}</text><text x="${W-Rr}" y="${T+8}" text-anchor="end">${top} m</text><text x="${W-Rr}" y="${T+ph}" text-anchor="end">0 m</text>`;
  return s+'</svg>'; }
function rainChart(Y){ const W=380,H=170,L=44,Rr=8,T=12,B=26,pw=W-L-Rr,ph=H-T-B; const max=Math.max(1,...Y.rows.map(r=>Math.max(r.yield,r.demand)));
  const nice=v=>{ const p=Math.pow(10,Math.floor(Math.log10(v))); const f=v/p; return (f<=1?1:(f<=2?2:(f<=5?5:10)))*p; }; const step=nice(max/4), ymax=Math.ceil(max/step)*step; const y=v=>T+ph-(v/ymax)*ph, bw=pw/12;
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly rain yield and irrigation need" data-key="harvest"><style>text{font-family:var(--font-m);font-size:8.5px;fill:var(--muted)}</style>`;
  for(let v=0;v<=ymax+1e-9;v+=step) s+=`<line x1="${L}" x2="${W-Rr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--chart-grid)"/><text x="${L-4}" y="${(y(v)+3).toFixed(1)}" text-anchor="end">${fmtI(v)}</text>`;
  s+=`<text x="${L-4}" y="8" text-anchor="end">m³</text>`;
  Y.rows.forEach((r,i)=>{ const x=L+i*bw+2, w=bw-4; if(r.days>0){ s+=`<rect x="${x.toFixed(1)}" y="${y(r.yield).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0,y(0)-y(r.yield)).toFixed(1)}" fill="#2F6FA8"><title>${r.m}: ${fmtI(r.yield)} m³ yield</title></rect>`; if(r.demand>0) s+=`<rect x="${(x+w*0.3).toFixed(1)}" y="${y(r.demand).toFixed(1)}" width="${(w*0.4).toFixed(1)}" height="${Math.max(0,y(0)-y(r.demand)).toFixed(1)}" fill="#5E8F5A"><title>${r.m}: ${fmtI(r.demand)} m³ irrigation</title></rect>`; } s+=`<text x="${(x+w/2).toFixed(1)}" y="${H-B+10}" text-anchor="middle"${r.days>0?'':' opacity=".4"'}>${r.m}</text>`; });
  s+=`<line x1="${L}" x2="${W-Rr}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="var(--chart-axis)"/><rect x="${L}" y="${H-9}" width="8" height="8" rx="2" fill="#2F6FA8"/><text x="${L+11}" y="${H-2}">Rain yield</text><rect x="${L+80}" y="${H-9}" width="8" height="8" rx="2" fill="#5E8F5A"/><text x="${L+91}" y="${H-2}">Irrigation need</text>`;
  return s+'</svg>'; }
function reportData(){
  const r=R; if(!r) return null; const s=state(); const fmt=fmtI;
  const out={title:'Rain study · driving rain, shelter and harvesting',settings:[['Design storm','wind from '+s.dir+'° at '+s.speed.toFixed(1)+' m/s, '+s.drop+', rain '+(r.alpha*180/Math.PI).toFixed(0)+'° from vertical'],['Rain rose','share of annual rain by wind sector: '+rose().map(x=>x.name+' '+Math.round(x.f*100)+'%').join(', ')+(C.loaded?' (CWEC2020 typical year, rainfall normals spread over overcast humid hours)':' (assumed)')],['Design storm intensity',LAB.S.water.storm+' mm/h'],['Annual rainfall',fmt(r.Rann)+' mm ('+(C.loaded?'Vancouver Intl AP station normals':'typed Vancouver Airport normals')+')'],['Terrace drainage',LAB.S.water.mode==='cascade'?'outward, cascading over edges':'inward to gutters and downpipes']],
    stats:[['Ground kept dry by the building (rain shadow)',fmt(r.dry)+' m²'],['Of which plazas and mid-block links',fmt(r.dryPlaza)+' of '+fmt(r.plazaTot)+' m²'],['On the parcel',fmt(r.drySite)+' m²']],
    tables:[{title:'Driving rain by face',head:['Face','Façade m²','Annual index','BS 8104 band','Wetted in storm','Storm catch L/m²/h'],rows:r.faces.map(f=>[NAMES[f.o],fmt(f.area),f.index.toFixed(0),f.band,Math.round(f.wetShare*100)+'%',f.storm.toFixed(1)])}],
    notes:['Driving rain follows ISO 15927-3: an annual index per face from the rain rose and sector wind speeds (2/9 · v · r^(8/9) · cos θ), with wall factors rising from 0.2 at the base to 0.5 at the top of a tall wall, read against BS 8104 exposure bands (sheltered, moderate, severe, very severe). Storm catch uses the semi-empirical catch ratio 0.222 · U · R^0.88 for a rain intensity R.','The rain shadow is rendered: rain falling at the storm angle (wind speed over the drop terminal velocity: 2, 5 or 8 m/s for drizzle, steady and heavy rain) from the storm direction, with and without the building, its podium and canopy; the difference is the ground the building keeps dry. Wetted façade is the area the same vector reaches after neighbours and the building\'s own form, per face and floor.','Roof catchment, run-off, gutter outlets and edge cascades come from a flow-routing model of the exposed terraces and roof on a 1 m grid; yield uses 80% run-off; the cistern is the largest cumulative shortfall when wetter months water the planted terraces in drier ones.','Indicative early-design readings. Detailing a façade for driving rain needs hourly weather data and a façade-specific catch ratio; drainage design needs the local rainfall intensity-duration curves.'],
    overlay:'Blue ponds by depth and blue flow paths where run-off collects on the terrain; grey: ground the building keeps dry in the design storm.'};
  try{ const V=LAB.viz; out.charts=[{svg:V.pdf(rainRoseSVG()),title:'Rain rose'},{svg:V.pdf(exposureSVG(r)),title:'Driving-rain index by face'},{svg:V.pdf(wallChart(r)),title:'Wetted façade by height'}]; }catch(e){ console.error(e); }
  out.settings.push(['Storm duration and ground surface',s.dur+' min, '+(P.surface.options.find(o=>o[0]===s.surface)||['',s.surface])[1]]);
  if(r.pond){ const p=r.pond; out.settings.push(['Terrain',p.flat?'none: level ground':'imported terrain, '+p.relief.toFixed(1)+' m of relief across the site']);
    if(!p.flat){ out.stats.push(['Storm depth on the ground',p.depthMM.toFixed(0)+' mm at '+Math.round(p.Cr*100)+'% run-off'],['Pooled area and volume',fmt(p.pondArea)+' m², '+p.pondVol.toFixed(0)+' m³ ('+Math.round(100*p.pondVol/Math.max(1e-6,p.inflowTot))+'% of the run-off)'],['Run-off leaving at the site edges',p.leaves.toFixed(0)+' m³'],['Ponds touching the tower\'s base',p.atBase.length?String(p.atBase.length):'none']);
      if(p.ponds.length) out.tables.push({title:'Where water pools',head:['Pond','Where','Area m²','Max depth','Volume m³','Catchment m²','Spills'],rows:p.ponds.slice(0,12).map((q,i)=>[String(i+1),q.where+' ('+(q.cx>0?'+':'')+q.cx.toFixed(0)+' E, '+(q.cy>0?'+':'')+q.cy.toFixed(0)+' N)',fmt(q.area),(q.maxD*1000).toFixed(0)+' mm',q.vol.toFixed(1),fmt(q.catchA),q.spills?'yes':'no'])});
      out.notes.push('Site ponding: ground elevation from the imported terrain on 2 m cells with buildings impassable; priority-flood depression filling (Barnes, Lehman and Mulla 2014) gives each closed hollow and its spill level; run-off is routed down the steepest slope (D8), hollows fill from their catchments and pass the excess along the spill path, and the model edges are the outlets. Catch basins, pipes and infiltration during the storm are not modelled.'); } else out.notes.push('Site ponding: the site model carries no topography, so no drainage routing was possible; import a terrain surface to study where water collects.'); }
  if(r.shelter) out.stats.push(['Canopy keeps dry on the windward side',r.shelter.canopy>0?r.shelter.dryCanopy.toFixed(1)+' m of '+r.shelter.canopy+' m':'no canopy set'],['Podium keeps dry',r.shelter.podiumExt>0?r.shelter.podiumDry.toFixed(1)+' m of '+r.shelter.podiumExt+' m':'no podium']);
  if(r.zones) out.tables.push({key:'glass-dry',title:'Glass kept dry by the façade zones',head:['Zone','Strategy','Device depth','Faces the storm','Glass kept dry'],rows:r.zones.map(z=>[z.label,z.strat,z.depth==null?'double skin':z.depth.toFixed(1)+' m',z.facing?'yes':'no',Math.round(z.dryShare*100)+'%'])});
  if(r.water){ const W=r.water, Y=r.year; out.stats.push(['Catchment on roofs and terraces',fmt(W.area)+' m²'],['Annual yield',fmt(W.yield)+' m³ at 80% run-off'],['Peak run-off in the design storm',W.peak.toFixed(0)+' L/s'],['Gutter outlets / edge cascades',W.outlets+' / '+W.dropsN+' (largest '+W.biggestOutlet.toFixed(1)+' and '+W.biggestDrop.toFixed(1)+' L/s, tallest fall '+W.maxDrop.toFixed(0)+' m)']);
    out.tables.push({title:'Terraces and roof',head:['Surface','Area m²','Share','Leaves by'],rows:W.comps.slice(0,8).map(c=>[c.level>=LAB.floors.length-1?'Roof':'Terrace L'+(c.level+2),fmt(c.area),(c.area/W.area*100).toFixed(0)+'%',c.edge&&c.outlets?c.edge+' m of edge and '+c.outlets+' outlets':(c.edge?c.edge+' m of edge, cascading':(c.outlets?c.outlets+' gutter outlets':'ponds'))])});
    if(Y){ out.stats.push(['Cistern to bridge dry months',fmt(Y.cistern)+' m³'],['Irrigation need (May–Sep)',fmt(Y.demandTot)+' m³']); out.chart=rainChart(Y).replace(/var\((--[a-z0-9-]+)\)/g,(m,k)=>getComputedStyle(document.documentElement).getPropertyValue(k).trim()||'#888'); out.tables.push({title:'Monthly water balance',head:['Month','Days','Rain mm','Yield m³','Irrigation m³','Balance m³'],rows:Y.rows.filter(x=>x.days>0).map(x=>[x.m,String(x.days),String(x.rain),fmt(x.yield),fmt(x.demand),(x.yield-x.demand>=0?'+':'')+fmt(x.yield-x.demand)])}); } }
  out.tables.push({title:'Readings',head:['What the rain suggests'],rows:readings(r).map(x=>[x.replace(/<[^>]+>/g,'')])});
  return out;
}
function buildUI(){
  const s=state(); LAB.controlsFor($('params-rain'),P,'rn',()=>state(),()=>{ LAB.syncFor($('params-rain'),P,'rn',state()); if(LAB.sim.markStale) LAB.sim.markStale('rain'); if(R) renderNote(); });
  LAB.syncFor($('params-rain'),P,'rn',s);
  const host=$('rain-presets'); C.winds.forEach(w=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.textContent=w.label; b.addEventListener('click',()=>{ const st=state(); st.dir=w.dir; st.speed=Math.max(st.speed,w.speed); LAB.syncFor($('params-rain'),P,'rn',st); if(LAB.sim.markStale) LAB.sim.markStale('rain'); if(LAB.sim.setMode){ LAB.sim.setMode('rain'); LAB.sim.runCurrent(true); } }); host.appendChild(b); });
}
function renderNote(){ if(LAB.sim&&LAB.sim.rerenderRain) LAB.sim.rerenderRain(); }
LAB.rain={run,html,reportData,buildUI,drawOverlay,state,exposure,ponding,get result(){return R;},RAIN_ROSE};
})();
