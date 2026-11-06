/* Supertall Sun & Wind Studio — sun, shadow, solar and pedestrian-wind studies on a massing (Vancouver, BC), in two modes:
   Basic reads the massing alone as blocks; Advanced shows floors and a façade built from strategy zones (glazing, shading devices, PV, double skins, balconies, screens), plus ventilation and ground-level wind strategies, and can study uploaded geometry as modeled. */
(function(){
'use strict';
const LAB=window.LAB; const $=LAB.$, fmtI=LAB.fmtI;
const CLIMATE=LAB.CLIMATE; // from climate.js
const KEY=LAB.CFG.key||'supertall-sunwind-studio';
/* seasonal wind roses (share of hours by sector N NE E SE S SW W NW, and mean speeds), approximate YVR: winter is east-dominated outflow, summer west and north-west */
const SEASON_ROSE={winter:[0.04,0.07,0.32,0.14,0.05,0.07,0.20,0.11],summer:[0.04,0.04,0.14,0.08,0.06,0.10,0.30,0.24]};
const SEASON_SPEED={winter:[3.0,3.6,5.0,5.6,3.6,4.0,4.6,4.0],summer:[3.0,3.3,3.8,4.2,3.4,4.0,4.4,4.0]};
/* diffuse share of global horizontal irradiation by month (Vancouver, approximate) */
const KD=[0.72,0.66,0.58,0.52,0.48,0.45,0.42,0.44,0.50,0.60,0.70,0.73];
const ORI=['N','E','S','W'], ORI5=['N','E','S','W','roof'], CATS=['N','E','S','W','roof','shade','pv'];
const NAMES={N:'North',E:'East',S:'South',W:'West',roof:'Roofs and terraces',shade:'Shading devices',pv:'PV surfaces',all:'All faces'};
const FACE_AZ={N:0,E:90,S:180,W:270};
const ALPHA=0.25; // wind profile exponent, urban edge
const GAP=0.45;   // slab gap between floor plates in Advanced

/* ---------- façade strategy catalogue ---------- */
const STRATS={
  curtain:{name:'Curtain wall',blurb:'Floor-to-floor glazing over a spandrel band, no external device. Sets the baseline window-to-wall ratio and glass for these levels.',d:{wwr:0.6,shgc:0.4,depth:0,pv:0},device:false},
  punched:{name:'Punched windows · deep reveals',blurb:'Windows 1.8 m wide in a solid wall, each set in a reveal that shades like a small egg-crate.',d:{wwr:0.35,shgc:0.4,depth:0.4,pv:0},device:true,depthLabel:'Reveal depth'},
  overhang:{name:'Horizontal overhang',blurb:'A continuous shelf at the head of the glass. Best on the south, where the sun is high.',d:{wwr:0.5,shgc:0.4,depth:0.9,pv:0},device:true,depthLabel:'Overhang depth'},
  louvres:{name:'Horizontal louvres',blurb:'Slats at 0.5 m pitch over the glass: the shading of a deep overhang at a fraction of the projection.',d:{wwr:0.55,shgc:0.4,depth:0.3,pv:0},device:true,depthLabel:'Slat depth'},
  fins:{name:'Vertical fins',blurb:'Fins at 1.5 m pitch. For the low east and west sun that overhangs cannot stop.',d:{wwr:0.5,shgc:0.4,depth:0.6,pv:0},device:true,depthLabel:'Fin depth'},
  eggcrate:{name:'Egg-crate',blurb:'Louvres and fins together: the strongest shading, at a cost to view and daylight.',d:{wwr:0.5,shgc:0.4,depth:0.4,pv:0},device:true,depthLabel:'Depth'},
  lightshelf:{name:'Light shelf',blurb:'A shelf at 2.1 m splits the glass: it shades the view window and bounces daylight off the ceiling from the clerestory above it.',d:{wwr:0.6,shgc:0.4,depth:0.9,pv:0},device:true,depthLabel:'Shelf depth'},
  balcony:{name:'Balconies as overhangs',blurb:'A slab and railing on every floor; each shades the glass below as a deep overhang. The residential answer.',d:{wwr:0.55,shgc:0.4,depth:1.8,pv:0},device:true,depthLabel:'Balcony depth'},
  doubleskin:{name:'Double-skin façade',blurb:'An outer glass layer with a ventilated cavity and blinds inside it: solar gain cut to about 65%, and the sheltered cavity lets windows open much higher up the tower.',d:{wwr:0.7,shgc:0.4,depth:0.8,pv:0},device:false,mod:0.65,depthLabel:'Cavity width',ventBoost:1.6},
  pvspandrel:{name:'PV spandrel',blurb:'Photovoltaic panels on the opaque band of each floor. Pays on the south, east and west.',d:{wwr:0.4,shgc:0.4,depth:0,pv:0.8},device:false},
  greenwall:{name:'Planted spandrel · green wall',blurb:'A living wall on the spandrel band. Little effect on beam through the glass, so it pairs with a smaller window.',d:{wwr:0.3,shgc:0.4,depth:0,pv:0},device:false},
  windscreen:{name:'Terrace wind screens',blurb:'1.5 m glass screens along the terrace edges on these levels, halving the wind people feel there. The glazing stays a curtain wall.',d:{wwr:0.55,shgc:0.4,depth:0,pv:0},device:false,screen:true},
};
const DEFAULT_ZONE={face:'all',from:1,to:999,strat:'curtain',wwr:0.4,shgc:0.4,depth:0,pv:0,operable:false};
const DEFAULT_ZONES=[
  {face:'N',from:1,to:999,strat:'curtain',wwr:0.35,shgc:0.35,depth:0,pv:0,operable:true},
  {face:'E',from:1,to:999,strat:'fins',wwr:0.4,shgc:0.35,depth:0.6,pv:0,operable:true},
  {face:'S',from:1,to:999,strat:'overhang',wwr:0.45,shgc:0.35,depth:0.9,pv:0,operable:true},
  {face:'W',from:1,to:999,strat:'fins',wwr:0.4,shgc:0.35,depth:0.8,pv:0,operable:true},
];

/* ---------- studio state, kept on LAB.S.sw so the core saves it ---------- */
const DEF={ mode:'basic', show:{raw:true}, zones:null,
  glaz:{vt:0.60},
  pv:{roof:0.5,eff:0.20,pr:0.80},
  vent:{mode:'cross',band:'fixed',tmin:12,tmax:24,umax:8,open:0.1,dT:3},
  dl:{target:300},
  ws:{podiumH:0,podiumExt:0,canopy:0,corners:'sharp',shelter:0},
};
let SW=null;
const clone=o=>JSON.parse(JSON.stringify(o));
function initState(){ const S=LAB.S; const d=clone(DEF); const cur=S.sw||{}; for(const k in d){ if(d[k]&&typeof d[k]==='object') d[k]=Object.assign(d[k],cur[k]||{}); else if(cur[k]!==undefined) d[k]=cur[k]; }
  d.zones=Array.isArray(cur.zones)&&cur.zones.length?cur.zones.filter(z=>STRATS[z.strat]).map(z=>Object.assign(clone(DEFAULT_ZONE),z)):clone(DEFAULT_ZONES);
  S.sw=d; SW=d; if(!S.impact.wind.view) S.impact.wind.view=S.impact.wind.delta?'delta':'comfort'; return d; }
function persist(){ try{ localStorage.setItem(KEY,JSON.stringify(LAB.S)); }catch(e){} }
const adv=()=>SW.mode==='advanced';
function zoneFor(face,level){ let z=null; for(const q of SW.zones){ if((q.face===face||q.face==='all')&&level>=q.from&&level<=q.to) z=q; } return z||DEFAULT_ZONE; }
function zoneLabel(z){ const nF=LAB.floors?LAB.floors.length:999; const to=Math.min(z.to,nF); return `${z.face==='all'?'All':z.face} · L${z.from}${to>z.from?'–L'+to:''}`; }

/* ---------- time period (month-day to month-day, any year) ---------- */
function parseMD(s){ const p=String(s||'01-01').split('-'); const m=Math.min(12,Math.max(1,parseInt(p[0],10)||1))-1; const d=Math.min(CLIMATE.days[m],Math.max(1,parseInt(p[1],10)||1)); return {m,d}; }
function doyOf(m,d){ let n=0; for(let i=0;i<m;i++) n+=CLIMATE.days[i]; return n+d; }
function monthOf(doy){ let n=0; for(let i=0;i<12;i++){ n+=CLIMATE.days[i]; if(doy<=n) return i; } return 11; }
const fmtMD=x=>CLIMATE.months[x.m]+' '+x.d;
function periodInfo(){
  const P=LAB.S.impact.period||{from:'01-01',to:'12-31'}; const a=parseMD(P.from), b=parseMD(P.to); const d0=doyOf(a.m,a.d), d1=doyOf(b.m,b.d);
  const days=d1>=d0?d1-d0+1:(365-d0+1)+d1; const monthDays=new Array(12).fill(0); for(let k=0;k<days;k++) monthDays[monthOf(((d0-1+k)%365)+1)]++;
  const full=days>=365; return {a,b,d0,d1,days,monthDays,full,label:full?'whole year':fmtMD(a)+' – '+fmtMD(b),startMonth:a.m};
}
function roseFor(PI){
  const rose=CLIMATE.rose.map(r=>({dir:r.dir,name:r.name,f:0,s:0})); let tot=0;
  for(let m=0;m<12;m++){ const w=PI.monthDays[m]; if(!w) continue; const wint=0.5+0.5*Math.cos(2*Math.PI*(m+0.5)/12);
    const RM=CLIMATE.roseMonthly&&CLIMATE.roseMonthly[m];
    rose.forEach((r,i)=>{ const f=RM?RM[i].f:(wint*SEASON_ROSE.winter[i]+(1-wint)*SEASON_ROSE.summer[i]), s=RM?RM[i].s:(wint*SEASON_SPEED.winter[i]+(1-wint)*SEASON_SPEED.summer[i]); r.f+=w*f; r.s+=w*f*s; }); tot+=w; }
  rose.forEach(r=>{ r.s=r.f?r.s/r.f:3.5; r.f=tot?r.f/tot:0; }); return rose;
}
const PERIOD_PRESETS=[['Whole year','01-01','12-31'],['Winter · Dec–Feb','12-01','02-28'],['Spring · Mar–May','03-01','05-31'],['Summer · Jun–Aug','06-01','08-31'],['Fall · Sep–Nov','09-01','11-30'],['Equinox day · 21 Mar','03-21','03-21'],['Equinox week','03-18','03-24']];
const DATES={equinox:{doy:80,label:'Equinox · 21 March',tz:-7,m:2},summer:{doy:172,label:'Summer solstice · 21 June',tz:-7,m:5},autumn:{doy:264,label:'Equinox · 21 September',tz:-7,m:8},winter:{doy:355,label:'Winter solstice · 21 December',tz:-8,m:11}};

/* ---------- solar position (NOAA) ---------- */
function sunPos(doy,hour,tz){
  const lat=CLIMATE.lat*Math.PI/180, lon=CLIMATE.lon;
  const g=2*Math.PI/365*(doy-1+(hour-12)/24);
  const eq=229.18*(0.000075+0.001868*Math.cos(g)-0.032077*Math.sin(g)-0.014615*Math.cos(2*g)-0.040849*Math.sin(2*g));
  const decl=0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)-0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)-0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g);
  const off=eq+4*lon-60*tz, tst=hour*60+off, ha=(tst/4-180)*Math.PI/180;
  const cz=Math.sin(lat)*Math.sin(decl)+Math.cos(lat)*Math.cos(decl)*Math.cos(ha);
  const zen=Math.acos(Math.max(-1,Math.min(1,cz))), alt=Math.PI/2-zen;
  let az=Math.acos(Math.max(-1,Math.min(1,(Math.sin(decl)-Math.sin(lat)*cz)/(Math.cos(lat)*Math.sin(zen)||1e-9))));
  if(ha>0) az=2*Math.PI-az;
  return {alt,az};
}
function sunDir(p){ const c=Math.cos(p.alt); return {x:Math.sin(p.az)*c, y:Math.cos(p.az)*c, z:Math.sin(p.alt)}; }
function dni(alt){ if(alt<=0.02) return 0; const am=1/Math.sin(alt); return 1353*Math.pow(0.7,Math.pow(am,0.678)); }

/* ---------- overlay plane over the site ---------- */
const DOM={xmin:-340,xmax:340,ymin:-220,ymax:220,cs:2}; DOM.nx=(DOM.xmax-DOM.xmin)/DOM.cs; DOM.ny=(DOM.ymax-DOM.ymin)/DOM.cs;
let overlayMesh=null, overlayTex=null, overlayData=new Uint8Array(DOM.nx*DOM.ny*4);
function ensureOverlay(){
  if(overlayMesh) return;
  overlayTex=new THREE.DataTexture(overlayData,DOM.nx,DOM.ny,THREE.RGBAFormat); overlayTex.minFilter=THREE.LinearFilter; overlayTex.magFilter=THREE.LinearFilter;
  overlayMesh=new THREE.Mesh(new THREE.PlaneGeometry(DOM.xmax-DOM.xmin,DOM.ymax-DOM.ymin,DOM.nx/2,DOM.ny/2),new THREE.MeshBasicMaterial({map:overlayTex,transparent:true,depthWrite:false}));
  overlayMesh.rotation.x=-Math.PI/2; overlayMesh.position.set((DOM.xmin+DOM.xmax)/2,0.3,-(DOM.ymin+DOM.ymax)/2); overlayMesh.renderOrder=2; LAB.overlayGroup.add(overlayMesh);
  setOverlayHeights(terrainDEM());
}
/* ---------- terrain: a ground elevation grid from meshes imported as terrain; flat (all zero) without one ---------- */
let demCache={key:null,dem:null,has:false};
function terrainDEM(){
  const site=LAB.site; const key=site?site.meshes.filter(m=>m.layer==='terrain').length+':'+(site.meta&&site.meta.source):'none'; if(demCache.key===key) return demCache;
  const cs=DOM.cs, nx=DOM.nx, ny=DOM.ny, N=nx*ny; const dem=new Float32Array(N); const hit=new Uint8Array(N); let any=false;
  if(site) for(const m of site.meshes){ if(m.layer!=='terrain') continue; any=true;
    for(let i=0;i<m.f.length;i+=3){ const a=m.f[i]*3,b=m.f[i+1]*3,c=m.f[i+2]*3; const ax=m.v[a],ay=m.v[a+1],az=m.v[a+2],bx=m.v[b],by=m.v[b+1],bz=m.v[b+2],qx=m.v[c],qy=m.v[c+1],qz=m.v[c+2];
      const det=(bx-ax)*(qy-ay)-(qx-ax)*(by-ay); if(Math.abs(det)<1e-9) continue;
      const x0=Math.max(0,Math.floor((Math.min(ax,bx,qx)-DOM.xmin)/cs)), x1=Math.min(nx-1,Math.floor((Math.max(ax,bx,qx)-DOM.xmin)/cs)), y0=Math.max(0,Math.floor((Math.min(ay,by,qy)-DOM.ymin)/cs)), y1=Math.min(ny-1,Math.floor((Math.max(ay,by,qy)-DOM.ymin)/cs));
      for(let iy=y0;iy<=y1;iy++){ const py=DOM.ymin+(iy+0.5)*cs; for(let ix=x0;ix<=x1;ix++){ const px=DOM.xmin+(ix+0.5)*cs; const l1=((bx-px)*(qy-py)-(qx-px)*(by-py))/det, l2=((qx-px)*(ay-py)-(ax-px)*(qy-py))/det, l3=1-l1-l2; if(l1<-1e-6||l2<-1e-6||l3<-1e-6) continue; const z=l1*az+l2*bz+l3*qz; const k=iy*nx+ix; if(!hit[k]||z>dem[k]){ dem[k]=z; hit[k]=1; } } } } }
  if(any){ // fill cells outside the terrain mesh with the nearest sampled height so the grid is continuous
    for(let pass=0;pass<40;pass++){ let changed=false; const src=hit.slice(); for(let k=0;k<N;k++){ if(src[k]) continue; const x=k%nx, y=(k/nx)|0; let s=0,n=0; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const xx=x+dx,yy=y+dy; if(xx<0||yy<0||xx>=nx||yy>=ny) continue; const j=yy*nx+xx; if(src[j]){ s+=dem[j]; n++; } } if(n){ dem[k]=s/n; hit[k]=1; changed=true; } } if(!changed) break; } }
  demCache={key,dem,has:any,min:any?Math.min(...dem):0,max:any?Math.max(...dem):0}; return demCache;
}
/* the overlay plane follows the terrain so ponds and flow paths sit on the ground; the flat ground plane drops below the lowest terrain */
function setOverlayHeights(T){ if(!overlayMesh) return; const g=overlayMesh.geometry; const pos=g.attributes.position; const segX=DOM.nx/2, segY=DOM.ny/2; let i=0;
  for(let iy=0;iy<=segY;iy++) for(let ix=0;ix<=segX;ix++){ let z=0; if(T.has){ const cx=Math.min(DOM.nx-1,ix*2), cy=Math.min(DOM.ny-1,(segY-iy)*2); z=T.dem[cy*DOM.nx+cx]; } pos.setZ(i++,z); }
  pos.needsUpdate=true; g.computeBoundingSphere(); if(T.has){ LAB.ground.position.y=Math.min(-0.05,T.min-0.5); } else LAB.ground.position.y=-0.05; LAB.requestRender(); }
function setOverlay(fn){
  ensureOverlay();
  for(let iy=0;iy<DOM.ny;iy++) for(let ix=0;ix<DOM.nx;ix++){ const k=(iy*DOM.nx+ix)*4; const c=fn(ix,iy); if(c){ overlayData[k]=c[0]; overlayData[k+1]=c[1]; overlayData[k+2]=c[2]; overlayData[k+3]=c[3]; } else overlayData[k+3]=0; }
  overlayTex.needsUpdate=true; overlayMesh.visible=true; LAB.requestRender();
}
function clearOverlay(){ if(overlayMesh) overlayMesh.visible=false; LAB.requestRender(); if(SW) updateLegend(); }
const lerpC=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const hex=h=>{ const n=parseInt(h.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; };
const cssVar=k=>getComputedStyle(document.documentElement).getPropertyValue(k).trim();

/* ---------- site rasters ---------- */
let siteRaster=null;
function rasterTri(ax,ay,bx,by,cx,cy,cs,x0,y0,nx,ny,fn){
  const minx=Math.max(0,Math.floor((Math.min(ax,bx,cx)-x0)/cs)), maxx=Math.min(nx-1,Math.floor((Math.max(ax,bx,cx)-x0)/cs));
  const miny=Math.max(0,Math.floor((Math.min(ay,by,cy)-y0)/cs)), maxy=Math.min(ny-1,Math.floor((Math.max(ay,by,cy)-y0)/cs));
  const det=(bx-ax)*(cy-ay)-(cx-ax)*(by-ay); if(Math.abs(det)<1e-9) return;
  for(let iy=miny;iy<=maxy;iy++){ const py=y0+(iy+0.5)*cs; for(let ix=minx;ix<=maxx;ix++){ const px=x0+(ix+0.5)*cs;
    const l1=((bx-px)*(cy-py)-(cx-px)*(by-py))/det, l2=((cx-px)*(ay-py)-(ax-px)*(cy-py))/det, l3=1-l1-l2;
    if(l1>=-1e-6&&l2>=-1e-6&&l3>=-1e-6) fn(iy*nx+ix); } }
}
function buildSiteRaster(){
  const site=LAB.site; const cs=4, nx=DOM.nx/2, ny=DOM.ny/2, N=nx*ny;
  const H=new Float32Array(N); const bld=[];
  if(site){
    for(const m of site.meshes){ if(m.top<3||m.layer==='terrain') continue;
      let fp=0, sx=0, sy=0, n=0;
      for(let i=0;i<m.f.length;i+=3){ const a=m.f[i]*3,b=m.f[i+1]*3,c=m.f[i+2]*3;
        const ax=m.v[a],ay=m.v[a+1],bx=m.v[b],by=m.v[b+1],cx=m.v[c],cy=m.v[c+1];
        const nz=(bx-ax)*(cy-ay)-(cx-ax)*(by-ay); const az=m.v[a+2],bz=m.v[b+2],cz=m.v[c+2];
        if(Math.min(az,bz,cz)>m.top-1.5 && nz>0){ fp+=nz/2; }
        rasterTri(ax,ay,bx,by,cx,cy,cs,DOM.xmin,DOM.ymin,nx,ny,k=>{ if(H[k]<m.top) H[k]=m.top; });
        sx+=ax+bx+cx; sy+=ay+by+cy; n+=3; }
      if(fp<5) fp=Math.max(fp,20);
      bld.push({x:sx/n,y:sy/n,top:m.top,fp,layer:m.layer});
    }
    if(LAB.S.site.future) for(const f of site.future){ const b=LAB.polyBounds(f.pts);
      for(let iy=Math.max(0,Math.floor((b.miny-DOM.ymin)/cs));iy<=Math.min(ny-1,Math.floor((b.maxy-DOM.ymin)/cs));iy++) for(let ix=Math.max(0,Math.floor((b.minx-DOM.xmin)/cs));ix<=Math.min(nx-1,Math.floor((b.maxx-DOM.xmin)/cs));ix++){ const k=iy*nx+ix; if(H[k]<f.top) H[k]=f.top; }
      bld.push({x:(b.minx+b.maxx)/2,y:(b.miny+b.maxy)/2,top:f.top,fp:(b.maxx-b.minx)*(b.maxy-b.miny),layer:'future'}); }
  }
  siteRaster={cs,nx,ny,H,bld};
}
function towerRaster(cs,nx,ny){
  const out=new Uint8Array(nx*ny); const fl=LAB.floors&&LAB.floors[0]; if(!fl) return out;
  const R=Math.hypot(fl.w,fl.d)/2, m=fl.mask;
  for(let iy=0;iy<ny;iy++){ const y=DOM.ymin+(iy+0.5)*cs; if(Math.abs(y-fl.cy)>R) continue; for(let ix=0;ix<nx;ix++){ const x=DOM.xmin+(ix+0.5)*cs; if(Math.abs(x-fl.cx)>R) continue;
    const l=LAB.toLocal(fl,x,y); if(Math.abs(l.x)>fl.w/2||Math.abs(l.y)>fl.d/2) continue; const mx=Math.floor(l.x-m.x0), my=Math.floor(l.y-m.y0); if(mx<0||my<0||mx>=m.nx||my>=m.ny) continue; if(m.cells[my*m.nx+mx]) out[iy*nx+ix]=1; } }
  return out;
}
function dilate(src,nx,ny,n){ if(n<=0) return src; const out=new Uint8Array(src); for(let k=0;k<src.length;k++){ if(!src[k]) continue; const x=k%nx,y=(k/nx)|0; for(let dy=-n;dy<=n;dy++) for(let dx=-n;dx<=n;dx++){ if(dx*dx+dy*dy>n*n+n) continue; const xx=x+dx,yy=y+dy; if(xx<0||yy<0||xx>=nx||yy>=ny) continue; out[yy*nx+xx]=1; } } return out; }
function plazaCellsAt(cs,nx,ny){ const N=nx*ny, out=new Uint8Array(N); const site=LAB.site; if(site) for(const m of site.meshes){ if(m.layer!=='plaza'&&m.layer!=='midblock') continue; for(let i=0;i<m.f.length;i+=3){ const a=m.f[i]*3,b=m.f[i+1]*3,c=m.f[i+2]*3; rasterTri(m.v[a],m.v[a+1],m.v[b],m.v[b+1],m.v[c],m.v[c+1],cs,DOM.xmin,DOM.ymin,nx,ny,k=>{ out[k]=1; }); } } return out; }

/* ---------- true plan, elevation and section, and a Rhino-style clipping plane ----------
   Plan, Elevation and Section render through an orthographic camera set square to the view (plan straight down with north up,
   elevations and sections level), and stay 2D: dragging pans and the wheel zooms about the cursor, nothing orbits.
   The clipping plane cuts the whole scene; a vertical plane gives sections, a horizontal one gives plan cuts at any height,
   below grade too. In 3D it shows as a tinted plane with a handle to drag it along its normal. While it is on, the ground
   becomes a block of earth, so the cut shows the basements in their ground. */
const view={ortho:false,section:false};
const orthoCam=new THREE.OrthographicCamera(-1,1,1,-1,1,20000); const NOCLIP=[];
const clip={on:false,kind:'v',ang:0,off:0,h:1.2,flip:false};
const clipPlane=new THREE.Plane();
const clipBelow=()=>{ const B=(LAB.S.typology==='upload'&&LAB.belowFloors)||[]; let d=0; for(const f of B) d=Math.max(d,-f.z); return d; };
const clipCentre=()=>new THREE.Vector3(LAB.S.posX,0,-LAB.S.posY);
function clipAxis(){ return clip.kind==='v'?new THREE.Vector3(Math.sin(clip.ang),0,Math.cos(clip.ang)):new THREE.Vector3(0,1,0); }
function clipPoint(){ const c=clipCentre(); return clip.kind==='v'?c.addScaledVector(clipAxis(),clip.off):new THREE.Vector3(c.x,clip.h,c.z); }
/* the kept side faces away from the axis (the near half of a section is removed); Flip keeps the other side */
function updateClipPlane(){ const n=clipAxis().negate(); if(clip.flip) n.negate(); clipPlane.setFromNormalAndCoplanarPoint(n,clipPoint()); return clipPlane; }
const CLIP_MAT=new THREE.MeshBasicMaterial({color:new THREE.Color('#E8692B'),transparent:true,opacity:0.1,side:THREE.DoubleSide,depthWrite:false});
const CLIP_LINE=new THREE.LineBasicMaterial({color:new THREE.Color('#E8692B')});
const clipWidget=new THREE.Group(); clipWidget.userData.deco=true; clipWidget.renderOrder=8; clipWidget.visible=false;
const clipSheet=new THREE.Mesh(new THREE.PlaneGeometry(1,1),CLIP_MAT); clipSheet.userData.deco=true;
const clipFrame=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.5,-.5,0),new THREE.Vector3(.5,-.5,0),new THREE.Vector3(.5,.5,0),new THREE.Vector3(-.5,.5,0)]),CLIP_LINE);
clipWidget.add(clipSheet); clipWidget.add(clipFrame); LAB.scene.add(clipWidget);
const clipHandle=new THREE.Mesh(new THREE.SphereGeometry(1,20,14),new THREE.MeshBasicMaterial({color:new THREE.Color('#E8692B')})); clipHandle.userData.deco=true; clipHandle.renderOrder=9; clipHandle.visible=false; LAB.scene.add(clipHandle);
const clipArrow=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,1)]),CLIP_LINE); clipArrow.userData.deco=true; clipArrow.visible=false; LAB.scene.add(clipArrow);
const EARTH_MAT=new THREE.MeshLambertMaterial({color:new THREE.Color('#D3C4AA'),side:THREE.DoubleSide});
const earth=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),EARTH_MAT); earth.userData.deco=true; earth.visible=false; earth.receiveShadow=true; LAB.scene.add(earth);
function placeClipWidget(show3d){ const on=clip.on; const S=LAB.S, H=S.height||100, below=clipBelow();
  const dep=Math.max(8,below+6); earth.visible=on; if(on){ earth.scale.set(420,dep,420); earth.position.set(S.posX,-0.06-dep/2,-S.posY); }
  BELOW_MAT.opacity=on?0.85:0.55;
  const w=show3d&&on; clipWidget.visible=w; clipHandle.visible=w; clipArrow.visible=w; if(!w) return;
  const n=updateClipPlane().normal, p=clipPoint(); const eps=0.06; const R=Math.max(1.2,LAB.orbit.dist*0.011);
  clipWidget.rotation.set(0,0,0);
  if(clip.kind==='v'){ const W=Math.max(140,Math.sqrt(LAB.upload&&LAB.upload.footprint||3000)*2.6), top=H+12, bot=-(below+4);
    clipWidget.position.set(p.x+n.x*eps,(top+bot)/2,p.z+n.z*eps); clipWidget.rotation.y=Math.atan2(n.x,n.z); clipWidget.scale.set(W,top-bot,1);
    clipHandle.position.set(p.x+n.x*eps,top+R*1.5,p.z+n.z*eps); }
  else { const W=Math.max(160,Math.sqrt(LAB.upload&&LAB.upload.footprint||3000)*3); clipWidget.position.set(p.x,p.y+n.y*eps,p.z); clipWidget.rotation.x=-Math.PI/2; clipWidget.scale.set(W,W,1);
    clipHandle.position.set(p.x+W/2,p.y+n.y*eps,p.z-W/2); }
  clipHandle.scale.setScalar(R); const ax=clipAxis(); clipArrow.position.copy(clipHandle.position); clipArrow.lookAt(clipHandle.position.clone().add(ax)); clipArrow.scale.set(1,1,R*5); }
/* cut fill: while the plane is on, the inside of every cut solid shows as a flat fill, as Rhino's section display does
   (the inside faces seen through the cut are the back faces): dark for the building, tan for the earth, brown for basements */
const CAP={value:0}; const CAP_COL={tower:new THREE.Color('#3A3F45'),earth:new THREE.Color('#B9A27E'),below:new THREE.Color('#5E4B3A')};
function capMaterial(m){ if(!m||m.userData.capped||m.side!==THREE.DoubleSide||!(m.isMeshLambertMaterial||m.isMeshStandardMaterial||m.isMeshPhongMaterial||m.isMeshBasicMaterial)) return; if(m===CLIP_MAT) return;
  const col={value:m===EARTH_MAT?CAP_COL.earth:m===BELOW_MAT?CAP_COL.below:CAP_COL.tower}; m.userData.capped=true; const prev=m.onBeforeCompile;
  m.onBeforeCompile=(sh,r)=>{ if(prev) prev.call(m,sh,r); sh.uniforms.uCap=CAP; sh.uniforms.uCapCol=col; sh.fragmentShader='uniform float uCap;\nuniform vec3 uCapCol;\n'+sh.fragmentShader.replace(/\}\s*$/,'\tif(uCap>0.5&&!gl_FrontFacing) gl_FragColor=vec4(uCapCol,1.0);\n}'); };
  m.customProgramCacheKey=()=>'cap'; m.needsUpdate=true; }
function capScene(sc){ sc.traverse(o=>{ if(!o.isMesh||!o.visible||(o.userData&&o.userData.deco&&o!==earth)) return; const ms=Array.isArray(o.material)?o.material:[o.material]; for(const m of ms) capMaterial(m); }); }
/* an elevation shows the building itself: anything between the viewer and the tower's nearest face is cut away */
const ELEV={key:null,front:0}; const elevClip=new THREE.Plane();
function elevPlane(){ const S=LAB.S, th=LAB.orbit.theta, d={x:Math.sin(th),y:-Math.cos(th)}; const F=(LAB.floors||[]).concat(LAB.belowFloors||[]); const key=[F.length&&F[0],F.length,th,S.posX,S.posY,S.rotDeg].join('|');
  if(ELEV.key!==key){ let fr=-1e9; for(const f of F){ const m=f.mask; if(!m) continue; for(const [ix,iy] of [[0,0],[m.nx,0],[0,m.ny],[m.nx,m.ny]]){ const p=LAB.toWorld(f,m.x0+ix,m.y0+iy); fr=Math.max(fr,(p.x-S.posX)*d.x+(p.y-S.posY)*d.y); } } ELEV.key=key; ELEV.front=fr>-1e8?fr:30; }
  const n=new THREE.Vector3(-d.x,0,d.y), pt=new THREE.Vector3(S.posX+d.x*(ELEV.front+1.5),0,-(S.posY+d.y*(ELEV.front+1.5))); return elevClip.setFromNormalAndCoplanarPoint(n,pt); }
/* the orthographic camera is placed square to the view: straight down for the plan (north up), level for elevations and sections */
function placeOrtho(){ const o=LAB.orbit, pc=LAB.camera; const t=o.target; const far=6000;
  if(o.phi<0.05){ orthoCam.up.set(0,0,-1); orthoCam.position.set(t.x,t.y+far,t.z); }
  else { orthoCam.up.set(0,1,0); orthoCam.position.set(t.x+far*Math.sin(o.theta),t.y,t.z+far*Math.cos(o.theta)); }
  orthoCam.lookAt(t); const hh=o.dist*Math.tan(pc.fov*Math.PI/360), hw=hh*pc.aspect; orthoCam.left=-hw; orthoCam.right=hw; orthoCam.top=hh; orthoCam.bottom=-hh; orthoCam.near=1; orthoCam.far=far*2+4000; orthoCam.updateProjectionMatrix(); orthoCam.updateMatrixWorld(); return {hh,hw}; }
(function patchRender(){ const R=LAB.renderer, orig=R.render.bind(R);
  R.render=function(sc,cam){
    if(cam!==LAB.camera){ R.clippingPlanes=NOCLIP; return orig(sc,cam); }
    placeClipWidget(!view.ortho&&!clip.capturing);
    if(clip.on) capScene(sc); CAP.value=clip.on?1:0;
    R.clippingPlanes=clip.on?[updateClipPlane()]:NOCLIP;
    if(view.ortho&&!view.section&&LAB.orbit.phi>1.5&&!clip.capturing) R.clippingPlanes=[elevPlane()];
    if(planActive()&&!clip.capturing){ planClip.constant=planCutZ(planFloor()); R.clippingPlanes=[planClip]; CAP.value=0; }
    if(view.ortho){ placeOrtho(); const up=(LAB.orbit.phi>1.5||planActive())&&!clip.capturing; let bv=true; if(up){ earth.visible=false; bv=belowGroup.visible; belowGroup.visible=false; if(view.section) CAP.value=0; }
      const res=orig(sc,orthoCam); if(up) belowGroup.visible=bv; drawSheet(); return res; }
    hideSheet(); return orig(sc,cam); };
  const origCap=LAB.captureView; LAB.captureView=function(opts){ const s={o:view.ortho,c:clip.on}; view.ortho=!!(opts&&opts.plan); clip.on=false; clip.capturing=true; try{ return origCap(opts); } finally{ view.ortho=s.o; clip.on=s.c; clip.capturing=false; LAB.requestRender(); } };
  LAB.pickCamera=()=>view.ortho?orthoCam:null;
})();
/* 2D navigation in the orthographic views: drag pans (any button), the wheel zooms about the cursor, touch pans with one finger */
(function orthoNav(){ const el=LAB.renderer.domElement.parentElement||document.getElementById('viewport'); let last=null; const live=new Set();
  const axes=()=>{ const o=LAB.orbit; return o.phi<0.05?{r:new THREE.Vector3(1,0,0),u:new THREE.Vector3(0,0,-1)}:{r:new THREE.Vector3(Math.cos(o.theta),0,-Math.sin(o.theta)),u:new THREE.Vector3(0,1,0)}; };
  el.addEventListener('pointerdown',e=>{ live.add(e.pointerId); last={x:e.clientX,y:e.clientY}; },true);
  const done=e=>{ live.delete(e.pointerId); if(!live.size) last=null; }; el.addEventListener('pointerup',done,true); el.addEventListener('pointercancel',done,true);
  el.addEventListener('pointermove',e=>{ if(!view.ortho||!e.buttons||live.size!==1||!last||drag||clipDrag||secDrag||floorSel) return; if(e.target.closest&&e.target.closest('.viewtools,.clip-panel,.keyplan,.secprog,.abar,.mass-hint')) return;
    e.stopImmediatePropagation(); const o=LAB.orbit, H=LAB.renderer.domElement.clientHeight||1; const hh=o.dist*Math.tan(LAB.camera.fov*Math.PI/360), k=2*hh/H; const A=axes();
    o.target.addScaledVector(A.r,-(e.clientX-last.x)*k).addScaledVector(A.u,(e.clientY-last.y)*k); last={x:e.clientX,y:e.clientY}; LAB.requestRender(); },true);
  el.addEventListener('wheel',e=>{ if(!view.ortho||(e.target.closest&&e.target.closest('.keyplan,.secprog,.clip-panel'))) return; e.preventDefault(); e.stopImmediatePropagation(); const o=LAB.orbit, c=LAB.renderer.domElement, rc=c.getBoundingClientRect();
    const nd=Math.min(3000,Math.max(15,o.dist*(1+e.deltaY*0.0012))), f=nd/o.dist; const hh=o.dist*Math.tan(LAB.camera.fov*Math.PI/360), hw=hh*LAB.camera.aspect;
    const ux=(((e.clientX-rc.left)/rc.width)*2-1)*hw, uy=(-((e.clientY-rc.top)/rc.height)*2+1)*hh; const A=axes(); o.target.addScaledVector(A.r,ux*(1-f)).addScaledVector(A.u,uy*(1-f)); o.dist=nd; LAB.requestRender(); },{capture:true,passive:false});
})();
/* drag the handle in 3D to slide the plane along its normal */
let clipDrag=null;
(function clipDragging(){ const el=document.getElementById('viewport'); const rc=new THREE.Raycaster();
  const scr=v=>{ const c=LAB.renderer.domElement, p=v.clone().project(LAB.camera); return {x:(p.x+1)/2*c.clientWidth,y:(1-p.y)/2*c.clientHeight}; };
  el.addEventListener('pointerdown',e=>{ if(!clip.on||view.ortho||e.button!==0||!clipHandle.visible) return; const c=LAB.renderer.domElement, r=c.getBoundingClientRect();
    rc.setFromCamera({x:((e.clientX-r.left)/r.width)*2-1,y:-((e.clientY-r.top)/r.height)*2+1},LAB.camera); if(!rc.intersectObject(clipHandle,false).length) return;
    e.stopImmediatePropagation(); el.setPointerCapture(e.pointerId); const a=scr(clipHandle.position), b=scr(clipHandle.position.clone().add(clipAxis())); clipDrag={id:e.pointerId,x:e.clientX,y:e.clientY,sx:b.x-a.x,sy:b.y-a.y,v0:clip.kind==='v'?clip.off:clip.h}; el.style.cursor='grabbing'; },true);
  el.addEventListener('pointermove',e=>{ if(!clipDrag||e.pointerId!==clipDrag.id){ if(clip.on&&!view.ortho&&!e.buttons&&clipHandle.visible){ const c=LAB.renderer.domElement, r=c.getBoundingClientRect(); rc.setFromCamera({x:((e.clientX-r.left)/r.width)*2-1,y:-((e.clientY-r.top)/r.height)*2+1},LAB.camera); if(rc.intersectObject(clipHandle,false).length){ el.style.cursor='grab'; el.title='Drag to move the clipping plane'; } else if(el.title){ el.title=''; } } return; }
    e.stopImmediatePropagation(); const d=clipDrag, L2=d.sx*d.sx+d.sy*d.sy||1; const m=((e.clientX-d.x)*d.sx+(e.clientY-d.y)*d.sy)/L2; setClipPos(d.v0+m,!e.altKey); },true);
  const end=e=>{ if(!clipDrag||e.pointerId!==clipDrag.id) return; clipDrag=null; el.style.cursor=''; try{ el.releasePointerCapture(e.pointerId); }catch(x){} e.stopImmediatePropagation(); };
  el.addEventListener('pointerup',end,true); el.addEventListener('pointercancel',end,true);
})();
function clipRange(){ const S=LAB.S; if(clip.kind==='h') return {min:-(Math.ceil(clipBelow())+3),max:Math.ceil((S.height||100)+5),step:0.1};
  const R=Math.ceil(Math.max(60,Math.sqrt(LAB.upload&&LAB.upload.footprint||3000)*1.3)); return {min:-R,max:R,step:0.1}; }
function setClipPos(v,snap){ const r=clipRange(); v=Math.max(r.min,Math.min(r.max,snap?Math.round(v*2)/2:Math.round(v*10)/10)); if(clip.kind==='v') clip.off=v; else clip.h=v; syncClipUI(); LAB.requestRender(); }
function setClip(patch){ Object.assign(clip,patch); syncClipUI(); syncViewButtons(); LAB.requestRender(); }
function syncClipUI(){ const P=$('clip-panel'); if(!P) return; P.hidden=!clip.on||view.section; $('view-clip').setAttribute('aria-pressed',String(clip.on)); if(!clip.on) return;
  P.querySelectorAll('[data-ck]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.ck===clip.kind)));
  const r=clipRange(), v=clip.kind==='v'?clip.off:clip.h, s=$('clip-pos'); s.min=r.min; s.max=r.max; s.step=r.step; s.value=v;
  $('clip-pos-l').textContent=clip.kind==='v'?'Position':'Height'; $('clip-pos-v').textContent=(clip.kind==='v'?(v>0?'+':'')+v.toFixed(1)+' m from the tower centre':(v<0?v.toFixed(1)+' m, below grade':v.toFixed(1)+' m above grade'));
  $('clip-ang-row').hidden=clip.kind!=='v'; const deg=Math.round(((clip.ang*180/Math.PI)%360+360)%360); $('clip-ang').value=deg; $('clip-ang-v').textContent=deg%90===0?'looking '+['north','west','south','east'][(deg/90+(clip.flip?2:0))%4]:deg+'°';
  $('clip-look').textContent=clip.kind==='v'?'Look at the section':'Look at the plan cut'; }
function setViewMode(ortho,section,theta,phi){ view.ortho=ortho; view.section=section; const o=LAB.orbit; if(theta!==undefined) o.theta=theta; if(phi!==undefined) o.phi=phi;
  if(ortho&&phi>1.5){ const S=LAB.S, H=S.height||100, below=clipBelow(); o.target.set(S.posX,(H-below)/2,-S.posY); o.dist=((H+below)*0.62+8)/Math.tan(LAB.camera.fov*Math.PI/360); }
  else if(ortho){ const S=LAB.S; o.target.set(S.posX,clip.on&&clip.kind==='h'?clip.h:0,-S.posY); o.dist=Math.max(220,(S.height||100)*1.4); }
  else o.target.set(LAB.S.posX,LAB.S.height*0.42,-LAB.S.posY);
  syncViewButtons(); syncClipUI(); LAB.requestRender(); }
function syncViewButtons(){ const o=LAB.orbit; $('view-top').setAttribute('aria-pressed',String(view.ortho&&o.phi<0.05)); $('view-elev').setAttribute('aria-pressed',String(view.ortho&&!view.section&&o.phi>1.5)); $('view-section').setAttribute('aria-pressed',String(view.ortho&&view.section));
  $('view-iso').setAttribute('aria-pressed',String(!view.ortho)); const v=$('viewport'); if(v) v.classList.toggle('is-2d',view.ortho); const h=$('view2d-hint'); if(h){ h.hidden=!view.ortho; h.textContent=view.ortho?(o.phi<0.05?(planFloor()?'Floor plan':'Site plan'):view.section?'Section A–A':['South','East','North','West'][((Math.round(o.theta/(Math.PI/2))%4)+4)%4]+' elevation'):''; h.title=view.ortho?'Orthographic · drag to pan · scroll to zoom · 3D to orbit':''; } }
function buildClipUI(){
  $('view-clip').addEventListener('click',()=>{ if(clip.on) setClip({on:false}); else setClip({on:true,kind:view.ortho&&LAB.orbit.phi<0.05?'h':'v',ang:view.ortho?LAB.orbit.theta:Math.round(LAB.orbit.theta/(Math.PI/2))*(Math.PI/2)}); if(!clip.on&&view.section) setViewMode(true,false); });
  $('clip-panel').querySelectorAll('[data-ck]').forEach(b=>b.addEventListener('click',()=>{ setClip({kind:b.dataset.ck}); if(view.ortho) $('clip-look').click(); }));
  $('clip-pos').addEventListener('input',e=>setClipPos(parseFloat(e.target.value),false));
  $('clip-ang').addEventListener('input',e=>{ setClip({ang:parseFloat(e.target.value)*Math.PI/180}); if(view.section) setViewMode(true,true,clip.ang+(clip.flip?Math.PI:0),Math.PI/2); });
  $('clip-flip').addEventListener('click',()=>{ setClip({flip:!clip.flip}); if(view.section) setViewMode(true,true,clip.ang+(clip.flip?Math.PI:0),Math.PI/2); });
  $('clip-look').addEventListener('click',()=>{ if(clip.kind==='v') setViewMode(true,true,clip.ang+(clip.flip?Math.PI:0),Math.PI/2); else setViewMode(true,false,0,0); });
  $('clip-close').addEventListener('click',()=>{ setClip({on:false}); if(view.section) setViewMode(true,false); });
  LAB.hooks.afterUpdate.push(()=>{ if(clip.on) syncClipUI(); });
  syncClipUI(); syncViewButtons(); }
LAB.clip={get state(){return clip;}, set:setClip, view, setViewMode, openSection:()=>openSection()}; LAB.persist=()=>persist();
/* ---------- section and elevation drawings ----------
   Section: one view, square to the cut line set on the key plan. Over the orthographic render (washed back, so it reads as the
   building beyond), the cut is drawn as a section drawing: slabs, exterior walls, basement walls and core walls in solid poche,
   the glazing cut as thin lines at each storey's sill and head, the earth hatched with the basements cut into it, and levels marked.
   Elevation: the same earth line and hatch, with the floors below ground dashed in it, so the underground stays visible. */
const SHEET={key:null,cut:null};
const NS='http://www.w3.org/2000/svg';
function levelName(f,below){ return below?'B'+f.bi:'L'+(f.i+1); }
function belowSorted(){ const B=((LAB.S.typology==='upload'&&LAB.belowFloors)||[]).slice().sort((a,b)=>b.z-a.z); B.forEach((f,k)=>{ f.bi=k+1; }); return B; }
function secGeom(){ const S=LAB.S, th=clip.ang+(clip.flip?Math.PI:0); const d={x:Math.sin(clip.ang),y:-Math.cos(clip.ang)}; const r={x:Math.cos(th),y:Math.sin(th)};
  const L=clip.flip?{x:d.x,y:d.y}:{x:-d.x,y:-d.y}; const p0={x:S.posX+d.x*clip.off,y:S.posY+d.y*clip.off}; return {th,d,r,L,p0}; }
function runsOf(f,p0,r,step){ const S=LAB.S, m=f.mask; if(!m) return {cut:[],core:[]}; const CR=coreRectsOf(f);
  const uc=(f.cx-p0.x)*r.x+(f.cy-p0.y)*r.y, R=Math.hypot(m.nx,m.ny)/2+2; const cut=[], core=[]; let a=null, c=null; const N=Math.ceil(2*R/step);
  for(let k=0;k<=N+1;k++){ const u=uc-R+k*step; let ins=false, isc=false; if(k<=N){ const l=LAB.toLocal(f,p0.x+r.x*u,p0.y+r.y*u); const ix=Math.floor(l.x-m.x0), iy=Math.floor(l.y-m.y0); const inC=!!inCoreRect(CR,l.x,l.y); ins=(ix>=0&&iy>=0&&ix<m.nx&&iy<m.ny&&!!m.cells[iy*m.nx+ix])||inC; isc=inC; }
    if(ins&&a===null) a=u-step/2; if(!ins&&a!==null){ cut.push([a,u-step/2]); a=null; } if(isc&&c===null) c=u-step/2; if(!isc&&c!==null){ core.push([c,u-step/2]); c=null; } }
  return {cut:cut.filter(q=>q[1]-q[0]>0.6),core:core.filter(q=>q[1]-q[0]>0.6)}; }
/* projection of a floor onto a horizontal axis: all cells, or only those on the far side of the cut */
function spanOf(f,o,r,L){ const m=f.mask; if(!m) return []; const bins=new Map(); for(let iy=0;iy<m.ny;iy++) for(let ix=0;ix<m.nx;ix++){ if(!m.cells[iy*m.nx+ix]) continue; const p=LAB.toWorld(f,m.x0+ix+0.5,m.y0+iy+0.5); const dx=p.x-o.x, dy=p.y-o.y; if(L&&dx*L.x+dy*L.y<0) continue; const u=dx*r.x+dy*r.y; const b=Math.floor(u); for(let q=b-1;q<=b+1;q++) if(Math.abs(q+0.5-u)<1.2) bins.set(q,1); }
  const ks=[...bins.keys()].sort((a,b)=>a-b); const out=[]; for(const k of ks){ const l=out[out.length-1]; if(l&&k<=l[1]) l[1]=k+1; else out.push([k,k+1]); } return out; }
function minus(A,B){ const out=[]; for(const [a,b] of A){ let segs=[[a,b]]; for(const [c,d] of B){ const nx=[]; for(const [x,y] of segs){ if(d<=x||c>=y){ nx.push([x,y]); continue; } if(c>x) nx.push([x,c]); if(d<y) nx.push([d,y]); } segs=nx; } for(const s of segs) if(s[1]-s[0]>0.3) out.push(s); } return out; }
const compass=(x,y)=>Math.abs(x)>=Math.abs(y)?(x>0?'E':'W'):(y>0?'N':'S');
function sectionCut(){ const G=secGeom(), F=LAB.floors||[], B=belowSorted(); const key=[F.length&&F[0],B.length&&B[0],F.length,B.length,clip.ang,clip.off,clip.flip,LAB.S.posX,LAB.S.posY,LAB.S.rotDeg,LAB.modelParts&&LAB.modelParts.rawVersion].join('|');
  if(SHEET.key===key&&SHEET.cut&&SHEET.F===F) return SHEET.cut;
  const rows=[]; for(const f of B.slice().reverse()) rows.push({f,below:true,...runsOf(f,G.p0,G.r,0.25)}); for(const f of F) rows.push({f,below:false,...runsOf(f,G.p0,G.r,0.25)});
  SHEET.key=key; SHEET.F=F; SHEET.cut={G,rows}; return SHEET.cut; }
function el(tag,attrs,parent){ const e=document.createElementNS(NS,tag); for(const k in attrs) e.setAttribute(k,attrs[k]); if(parent) parent.appendChild(e); return e; }
function sheetEls(){ let s=document.getElementById('sheet'); if(s) return s; const vp=$('viewport'); const w=document.createElement('div'); w.id='sheet-wash'; w.className='sheet-wash'; w.hidden=true; vp.insertBefore(w,vp.querySelector('.compass'));
  s=document.createElementNS(NS,'svg'); s.id='sheet'; s.setAttribute('class','sheet'); vp.insertBefore(s,vp.querySelector('.compass')); return s; }
function hideSheet(){ if(LAB.program) LAB.program.showBar(false); const s=document.getElementById('sheet'); if(s) s.style.display='none'; const w=document.getElementById('sheet-wash'); if(w) w.hidden=true; const k=document.getElementById('keyplan'); if(k) k.hidden=true; const pp=document.getElementById('planpanel'); if(pp) pp.hidden=true; }
function scaleBar(svg,kx){ const ink='#1F2227';const m10=Math.abs(kx)*10; if(m10>8){ const bx=18, by=58; let n=10; while(Math.abs(kx)*n<60) n*=2; while(Math.abs(kx)*n>160&&n>2) n/=2; const L2=Math.abs(kx)*n; el('rect',{x:bx,y:by-10,width:L2+40,height:22,fill:'rgba(255,255,255,.85)'},svg); el('rect',{x:bx+4,y:by-3,width:L2/2,height:4,fill:ink},svg); el('rect',{x:bx+4+L2/2,y:by-3,width:L2/2,height:4,fill:'#fff',stroke:ink,'stroke-width':1},svg); const t=el('text',{x:bx+8+L2,y:by+2,fill:ink,'font-size':10,'font-family':'var(--font-m),monospace'},svg); t.textContent=n+' m'; } }
function drawSheet(){ const o=LAB.orbit; const planOn=planActive()&&!clip.capturing; if(!view.ortho||clip.capturing||(o.phi<1.5&&!planOn)){ hideSheet(); if(view.ortho&&o.phi<0.05&&!clip.capturing) planPanelSync(); return; }
  const svg=sheetEls(), cv=LAB.renderer.domElement, vp=$('viewport'); const cr=cv.getBoundingClientRect(), vr=vp.getBoundingClientRect(); const W=cr.width, H=cr.height;
  Object.assign(svg.style,{display:'block',left:(cr.left-vr.left)+'px',top:(cr.top-vr.top)+'px',width:W+'px',height:H+'px'}); svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.innerHTML='';
  if(planOn){ document.getElementById('sheet-wash').hidden=false; const k=drawPlan(svg,W,H); scaleBar(svg,k); planPanelSync(); const kp=document.getElementById('keyplan'); if(kp) kp.hidden=true; return; }
  { const pp=document.getElementById('planpanel'); if(pp) pp.hidden=true; }
  document.getElementById('sheet-wash').hidden=!view.section;
  const S=LAB.S, sec=view.section; let G, org, r;
  if(sec){ G=sectionCut().G; org=G.p0; r=G.r; } else { const th=o.theta; org={x:S.posX,y:S.posY}; r={x:Math.cos(th),y:Math.sin(th)}; }
  const P=(u,y)=>{ const v=new THREE.Vector3(org.x+r.x*u,y,-(org.y+r.y*u)).project(orthoCam); return [(v.x+1)/2*W,(1-v.y)/2*H]; };
  const O=P(0,0), X=P(1,0), Y=P(0,1); const kx=X[0]-O[0], ky=Y[1]-O[1]; const sx=u=>O[0]+kx*u, sy=y=>O[1]+ky*y; SHEET.sb=sec?{O,kx,ky}:null;
  if(LAB.program) LAB.program.showBar(!!sec);
  const defs=el('defs',{},svg); const pat=el('pattern',{id:'earth-hatch',patternUnits:'userSpaceOnUse',width:9,height:9,patternTransform:'rotate(45)'},defs); el('rect',{width:9,height:9,fill:'#ECE4D5'},pat); el('line',{x1:0,y1:0,x2:0,y2:9,stroke:'#A8916C','stroke-width':1},pat);
  const gy=sy(0); el('rect',{x:0,y:gy,width:W,height:Math.max(0,H-gy),fill:'url(#earth-hatch)'},svg);
  const B=belowSorted(), F=LAB.floors||[]; const ink='#1F2227', pr=(a,b,y0,y1,fill,extra)=>{ const x0=sx(Math.min(a,b)), x1=sx(Math.max(a,b)), ya=sy(Math.max(y0,y1)), yb=sy(Math.min(y0,y1)); return el('rect',Object.assign({x:x0.toFixed(1),y:ya.toFixed(1),width:Math.max(0.6,x1-x0).toFixed(1),height:Math.max(0.6,yb-ya).toFixed(1),fill:fill||ink},extra||{}),svg); };
  let uMax=-1e9, uMin=1e9;
  if(!sec){ // elevation: the floors below ground, dashed in the earth
    for(const f of B){ for(const [a,b] of spanOf(f,org,r,null)){ pr(a,b,f.z,f.z+f.h,'rgba(255,255,255,.78)',{stroke:'#5E4B3A','stroke-width':1.2,'stroke-dasharray':'6 4'}); uMax=Math.max(uMax,b); uMin=Math.min(uMin,a); } }
    for(const f of F.slice(0,1)) for(const [a,b] of spanOf(f,org,r,null)){ uMax=Math.max(uMax,b); uMin=Math.min(uMin,a); }
  } else {
    const {rows}=sectionCut(); const T=Math.min(0.5,Math.max(0.25,GAP)), TW=0.3, TB=0.4;
    // beyond the cut: the building drawn as a thin-lined elevation, then the cut rooms in white (below grade they open up the earth)
    for(const q of rows){ if(q.below) continue; for(const [a,b] of spanOf(q.f,G.p0,G.r,G.L)) pr(a,b,q.f.z,q.f.z+q.f.h,'#FFFFFF',{stroke:'#8A8F96','stroke-width':0.6}); }
    for(const q of rows) for(const [a,b] of q.cut) pr(a,b,q.f.z,q.f.z+q.f.h,q.below?'#FAF8F4':'#FFFFFF');
    const inCut=(q,u)=>q.cut.some(([a,b])=>u>a+0.3&&u<b-0.3); const thin={stroke:'#8A8F96','stroke-width':0.7};
    rows.forEach((q,k)=>{ const f=q.f, top=f.z+f.h, prev=rows[k-1], next=rows[k+1];
      for(const [a,b] of q.cut){ uMax=Math.max(uMax,b); uMin=Math.min(uMin,a); }
      const PG=LAB.program, fkey=q.below?'b:'+f.bi:'a:'+f.i;
      if(PG&&PG.hidden(fkey)){ for(const [a,b] of q.cut) pr(a,b,f.z,top,'#F3F3F1',{stroke:'#C9CED4','stroke-width':0.6,'stroke-dasharray':'3 2'}); return; }
      if(PG&&PG.tint()){ const pk=q.below?(LAB.S.belowProg||{})[f.bi]:f.prog; if(pk) for(const [a,b] of q.cut) pr(a,b,f.z,top-T,PG.color(pk),{opacity:0.3}); }
      // columns: cut ones in poche, the nearest ones beyond in thin line
      { const CO=colsOf(f), cs=CO.cs; const seen=new Set(); for(const {x,y} of CO.cols){ const w=LAB.toWorld(f,x,y); const dx=w.x-G.p0.x, dy=w.y-G.p0.y; const sd=dx*G.L.x+dy*G.L.y, u=dx*G.r.x+dy*G.r.y; if(Math.abs(sd)<=cs/2+0.05) pr(u-cs/2,u+cs/2,f.z,top-T); else if(sd>0&&inCut(q,u)){ const key=Math.round(u*2); if(seen.has(key)) continue; seen.add(key); pr(u-cs/2,u+cs/2,f.z,top-T,'none',thin); } } }
      // slab over each storey, and under any part not standing on the storey below (the lowest one is the raft or ground slab)
      for(const [a,b] of q.cut) pr(a,b,top-T,top);
      for(const [a,b] of (prev?minus(q.cut,prev.cut):q.cut)) pr(a,b,f.z-(prev?T:(q.below?0.8:T)),f.z);
      const y0=f.z, y1=top-T;
      for(const [a,b] of q.cut){
        if(q.below){ pr(a,a+TB,y0,y1); pr(b-TB,b,y0,y1); continue; }
        for(const [end,dir] of [[a,-1],[b,1]]){ const o2=compass(r.x*dir,r.y*dir); const z=zoneFor(o2,f.i+1); const Bd=band(f,o2,z); const wx0=dir<0?end:end-TW, wx1=wx0+TW;
          const sill=y0+Bd.sp, head=y0+Bd.head; if(sill>y0+0.05) pr(wx0,wx1,y0,sill); if(head<y1-0.05) pr(wx0,wx1,head,y1);
          const m=(wx0+wx1)/2; for(const du of [-0.06,0.06]) el('line',{x1:sx(m+du).toFixed(1),x2:sx(m+du).toFixed(1),y1:sy(sill).toFixed(1),y2:sy(head).toFixed(1),stroke:'#2F5F8A','stroke-width':1},svg);
          el('line',{x1:sx(wx0).toFixed(1),x2:sx(wx1).toFixed(1),y1:sy(sill).toFixed(1),y2:sy(sill).toFixed(1),stroke:ink,'stroke-width':1},svg);
          // the façade device on this face, cut where it crosses the plane, in thin line where it is seen beyond
          const st=z.strat, D=z.depth||0, out=v=>end+dir*v;
          if(D>0.05){ if(st==='overhang'||(st==='lightshelf'&&Bd.gh<=2.3)) pr(out(0),out(D),head+0.08,head+0.23);
            if(st==='lightshelf'&&Bd.gh>2.3){ const ysh=sill+Math.min(2.1,Bd.gh-0.3); pr(out(-0.6),out(D),ysh,ysh+0.1); }
            if(st==='balcony'){ pr(out(0),out(D),y0,y0+0.2); el('line',{x1:sx(out(D-0.04)).toFixed(1),x2:sx(out(D-0.04)).toFixed(1),y1:sy(y0+0.2).toFixed(1),y2:sy(y0+1.3).toFixed(1),stroke:ink,'stroke-width':1.3},svg); }
            if(st==='louvres'||st==='eggcrate'){ const nl=Math.floor(Bd.gh/0.5); for(let i=0;i<nl;i++){ const yy=sill+(i+0.5)*0.5; pr(out(0.02),out(D),yy-0.025,yy+0.025); } }
            if(st==='fins'||st==='eggcrate') pr(out(0),out(D),sill,head,'none',thin); }
          if(st==='doubleskin'){ const Dd=Math.max(0.3,D); for(const du of [-0.03,0.03]) el('line',{x1:sx(out(Dd)+du).toFixed(1),x2:sx(out(Dd)+du).toFixed(1),y1:sy(y0).toFixed(1),y2:sy(top).toFixed(1),stroke:'#2F5F8A','stroke-width':0.9},svg); pr(out(0),out(Dd),top-T,top-T+0.1); } }
      }
      for(const [c0,c1] of q.core){ pr(c0,c0+TW,y0,y1); pr(c1-TW,c1,y0,y1);
        const at=u=>LAB.toLocal(f,G.p0.x+G.r.x*u,G.p0.y+G.r.y*u); const lm=at((c0+c1)/2); const CRr=inCoreRect(coreRectsOf(f),lm.x,lm.y,0.5)||coreRectsOf(f)[0]; if(!CRr) continue; const LY=coreLayout(CRr.x0,CRr.x1,CRr.y0,CRr.y1);
        const la=at(c0), lb=at(c1); let split=null; if(LY.fits&&(la.x-LY.xs)*(lb.x-LY.xs)<0) split=c0+(c1-c0)*(LY.xs-la.x)/(lb.x-la.x);
        const parts=split!=null?[[c0,split,la.x<LY.xs],[split,c1,lb.x<LY.xs]]:[[c0,c1,!LY.fits||((la.x+lb.x)/2<LY.xs)]];
        if(split!=null) pr(split-0.1,split+0.1,y0,y1);
        for(const [u0,u1,lift] of parts){ const a0=Math.max(u0,c0+TW), a1=Math.min(u1,c1-TW); if(a1-a0<0.6) continue;
          if(lift&&LY.fits){ pr(a0+0.05,a1-0.05,top-T-0.01,top+0.01,'#FFFFFF'); el('line',{x1:sx(a0+0.15).toFixed(1),x2:sx(a1-0.15).toFixed(1),y1:sy(y0+0.1).toFixed(1),y2:sy(y1-0.1).toFixed(1),...thin},svg); el('line',{x1:sx(a1-0.15).toFixed(1),x2:sx(a0+0.15).toFixed(1),y1:sy(y0+0.1).toFixed(1),y2:sy(y1-0.1).toFixed(1),...thin},svg); }
          else if(LY.fits){ const ym=y0+(top-y0)/2, run=Math.min(a1-a0-2.6,((top-y0)/2)/0.18*0.28); if(run>1){ const s0=a0+1.2, s1=s0+run, nst=Math.max(2,Math.round(((top-y0)/2)/0.18));
            let d1=`M${sx(a0+0.1).toFixed(1)} ${sy(y0).toFixed(1)}L${sx(s0).toFixed(1)} ${sy(y0).toFixed(1)}`; for(let i=1;i<=nst;i++){ const ux=s0+run*i/nst, yv=y0+(ym-y0)*i/nst; d1+=`L${sx(s0+run*(i-1)/nst).toFixed(1)} ${sy(yv).toFixed(1)}L${sx(ux).toFixed(1)} ${sy(yv).toFixed(1)}`; }
            el('path',{d:d1,fill:'none',stroke:ink,'stroke-width':0.8},svg); el('line',{x1:sx(s0).toFixed(1),y1:(sy(y0)+0).toFixed(1),x2:sx(s1).toFixed(1),y2:sy(ym).toFixed(1),stroke:ink,'stroke-width':0.6},svg);
            pr(s1,Math.min(a1-0.05,s1+1.2),ym-0.2,ym); el('line',{x1:sx(s1).toFixed(1),y1:sy(ym).toFixed(1),x2:sx(s0).toFixed(1),y2:sy(top-T).toFixed(1),stroke:'#6B7078','stroke-width':0.7,'stroke-dasharray':'4 2'},svg); } } } }
      // room tag in every room the cut passes through, so masses either side of a void are each named
      if(Math.abs(ky)*f.h>22) for(const R0 of q.cut){ if(Math.abs(kx)*(R0[1]-R0[0])<44) continue; const free=minus([R0],q.core.map(([c0,c1])=>[c0-0.8,c1+0.8])).sort((A,B)=>(B[1]-B[0])-(A[1]-A[0])); const FR=free[0]; if(!FR||Math.abs(kx)*(FR[1]-FR[0])<44) continue; const mid=(FR[0]+FR[1])/2; const pr2=LAB.PROG&&LAB.PROG[f.prog];
        const t=el('text',{x:sx(mid).toFixed(1),y:(sy(f.z+(f.h-T)/2)+3).toFixed(1),'text-anchor':'middle','font-size':9,'letter-spacing':'0.05em',fill:'#5F646B','font-family':'var(--font-b),sans-serif',stroke:'#fff','stroke-width':3,'paint-order':'stroke'},svg); const bp2=q.below&&LAB.S.belowProg&&LAB.PROG[LAB.S.belowProg[f.bi]]; t.textContent=q.below?(bp2?bp2.name.toUpperCase():'BASEMENT'):((pr2&&pr2.name)||'FLOOR').toUpperCase(); }
    });
  }
  if(sec&&uMax>-1e8&&LAB.program){ const {rows}=sectionCut(); for(const q of rows){ const k=q.below?'b:'+q.f.bi:'a:'+q.f.i; if(!LAB.program.isSel(k)) continue; for(const [a,b] of q.cut){ pr(a,b,q.f.z,q.f.z+q.f.h,'rgba(232,105,43,.10)',{stroke:'#E8692B','stroke-width':2.2}); } } }
  if(sec&&uMax>-1e8){ const {rows}=sectionCut(); const F0=F[0]; const zTop=F.length?F[F.length-1].z+F[F.length-1].h:0, zBot=B.length?Math.min(...B.map(f=>f.z))-0.8:-0.5;
    const dimH=(u0,u1,y,label)=>{ const a=[sx(u0),sy(y)], b=[sx(u1),sy(y)]; el('line',{x1:a[0].toFixed(1),y1:a[1].toFixed(1),x2:b[0].toFixed(1),y2:b[1].toFixed(1),stroke:ink,'stroke-width':0.6},svg); for(const p of [a,b]) el('line',{x1:(p[0]-3).toFixed(1),y1:(p[1]+3).toFixed(1),x2:(p[0]+3).toFixed(1),y2:(p[1]-3).toFixed(1),stroke:ink,'stroke-width':1},svg); if(Math.abs(b[0]-a[0])>34){ const t=el('text',{x:((a[0]+b[0])/2).toFixed(1),y:(a[1]-4).toFixed(1),'text-anchor':'middle','font-size':9.5,fill:ink,'font-family':'var(--font-m),monospace'},svg); t.textContent=label; } };
    const dimV=(u,y0,y1,label)=>{ const a=[sx(u),sy(y0)], b=[sx(u),sy(y1)]; el('line',{x1:a[0].toFixed(1),y1:a[1].toFixed(1),x2:b[0].toFixed(1),y2:b[1].toFixed(1),stroke:ink,'stroke-width':0.6},svg); for(const p of [a,b]) el('line',{x1:(p[0]-3).toFixed(1),y1:(p[1]+3).toFixed(1),x2:(p[0]+3).toFixed(1),y2:(p[1]-3).toFixed(1),stroke:ink,'stroke-width':1},svg); if(Math.abs(b[1]-a[1])>26){ const cx=a[0]-4, cy=(a[1]+b[1])/2; const t=el('text',{x:cx.toFixed(1),y:cy.toFixed(1),'text-anchor':'middle','font-size':9.5,fill:ink,'font-family':'var(--font-m),monospace',transform:`rotate(-90 ${cx.toFixed(1)} ${cy.toFixed(1)})`},svg); t.textContent=label; } };
    // structural grid where the cut crosses it: dash-dot lines, bubbles above the roof, spacing dimensioned
    if(F0){ const TG=towerGrid(); const l0=toT(G.p0.x,G.p0.y), l1=toT(G.p0.x+G.r.x,G.p0.y+G.r.y); const du={x:l1.x-l0.x,y:l1.y-l0.y}; const cr=[];
      if(Math.abs(du.x)>0.15) TG.X.forEach((x,i)=>cr.push([(x-l0.x)/du.x,TG.labX[i]])); if(Math.abs(du.y)>0.15) TG.Y.forEach((y,j)=>cr.push([(y-l0.y)/du.y,TG.labY[j]]));
      const gl=cr.filter(([u])=>u>uMin-1&&u<uMax+1).sort((a,b)=>a[0]-b[0]); const yb=sy(zBot-2), yt=sy(zTop+5);
      gl.forEach(([u,lab])=>{ const x=sx(u); el('line',{x1:x.toFixed(1),x2:x.toFixed(1),y1:yb.toFixed(1),y2:yt.toFixed(1),stroke:'#8A8F96','stroke-width':0.6,'stroke-dasharray':'14 3 2 3'},svg); el('circle',{cx:x.toFixed(1),cy:(yt-9).toFixed(1),r:9,fill:'#fff',stroke:ink,'stroke-width':0.9},svg); const t=el('text',{x:x.toFixed(1),y:(yt-5.5).toFixed(1),'text-anchor':'middle','font-size':10,'font-weight':600,fill:ink,'font-family':'var(--font-m),monospace'},svg); t.textContent=lab; });
      for(let i=0;i+1<gl.length;i++) dimH(gl[i][0],gl[i+1][0],zTop+2.2,(gl[i+1][0]-gl[i][0]).toFixed(2)); }
    // storey heights chained on the left, overall height outside them
    const lvz=[...B.map(f=>f.z),...F.map(f=>f.z),zTop].sort((a,b)=>a-b); const uL=uMin-4, uO=uMin-7.5;
    for(let i=0;i+1<lvz.length;i++) dimV(uL,lvz[i],lvz[i+1],(lvz[i+1]-lvz[i]).toFixed(2)); if(lvz.length>1) dimV(uO,lvz[0],zTop,(zTop-lvz[0]).toFixed(2)+' overall'); }
  // ground line and level datums
  el('line',{x1:0,x2:W,y1:gy.toFixed(1),y2:gy.toFixed(1),stroke:ink,'stroke-width':2},svg);
  if(uMax>-1e8){ const lx=sx(uMax)+18; const lv=[]; for(const f of B) lv.push([f.z,levelName(f,true)]); F.forEach(f=>lv.push([f.z,levelName(f,false)])); const top=F.length?F[F.length-1]:null; if(top) lv.push([top.z+top.h,'Roof']);
    const minGap=15; let lastY=1e9; const lvs=lv.sort((a,b)=>a[0]-b[0]); const must=new Set([0]);
    for(let k=0;k<lvs.length;k++){ const [z,nm]=lvs[k]; const y=sy(z); const key=Math.abs(z)<0.01||nm==='Roof'||nm.startsWith('B'); if(!key&&Math.abs(lastY-y)<minGap) continue; if(!key&&k<lvs.length-1&&Math.abs(sy(lvs[lvs.length-1][0])-y)<minGap) continue; lastY=y;
      el('line',{x1:(lx-10).toFixed(1),x2:(lx+70).toFixed(1),y1:y.toFixed(1),y2:y.toFixed(1),stroke:'#6B7078','stroke-width':0.8,'stroke-dasharray':'2 2'},svg);
      el('path',{d:`M${lx} ${y} l-5 -6 h10 z`,fill:'none',stroke:ink,'stroke-width':1},svg);
      const t=el('text',{x:(lx+8).toFixed(1),y:(y-3).toFixed(1),fill:ink,'font-size':10.5,'font-family':'var(--font-m),monospace',stroke:'#fff','stroke-width':3,'paint-order':'stroke'},svg); t.textContent=`${nm}  ${z>0.005?'+':z<-0.005?'−':'±'}${Math.abs(z).toFixed(2)}`; }
  }
  scaleBar(svg,kx);
  if(sec) drawKeyPlan(); else { const k=document.getElementById('keyplan'); if(k) k.hidden=true; }
}
/* small line icons for the drawing tools */
const TI=(d,extra)=>`<svg class="ti" viewBox="0 0 24 24" aria-hidden="true"${extra||''}>${d}</svg>`;
const ICO={cut:TI('<path d="M3 12h18" stroke-dasharray="4 2.5"/><path d="M7 8l-4 4 4 4M17 8l4 4-4 4"/>'),section:TI('<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M5 9h14M5 15h14"/><path d="M12 3v18" stroke-dasharray="3 2"/>'),
  vline:TI('<path d="M12 8v13" stroke-dasharray="4 2 1 2"/><circle cx="12" cy="5" r="3"/><path d="M19 15h4M21 13v4"/>'),hline:TI('<path d="M8 12h13" stroke-dasharray="4 2 1 2"/><circle cx="5" cy="12" r="3"/><path d="M19 4h4M21 2v4"/>'),
  restore:TI('<path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4"/>'),trash:TI('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'),flip:TI('<path d="M7 7h12l-3-3M17 17H5l3 3"/>'),
  eye:TI('<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>'),pointer:TI('<path d="M6 3l12 8-5 1 3 6-2 1-3-6-4 3z"/>'),grid:TI('<path d="M3 8h18M3 16h18M8 3v18M16 3v18"/>')};
/* ---------- floor plans as architectural drawings ----------
   Conventions (North American / ISO 128 practice): the plan is a horizontal cut 1.2 m above the finished floor, looking down.
   Cut elements are poche (solid) with the heaviest line: exterior and basement walls, columns, core walls, fins.
   Glazing cut at the sill is drawn as frame lines with the glass between and mullion ticks. Things below the cut are thin
   solid (floor below, balcony slabs, louvres); things above the cut are dashed (floor above, overhangs, light shelves).
   Annotation: structural grids with bubbles (numbers one way, letters the other), chained and overall dimensions,
   a room tag, the section line with its arrows, a north arrow and a scale bar. An uploaded model's checked parts
   (structure, core, stairs, façade, windows) are cut from the model itself; anything not modeled is drawn from the
   floor plate, the façade zones and the core. */
const PLAN={lv:{kind:'above',i:0},grid:true};
const planClip=new THREE.Plane(new THREE.Vector3(0,-1,0),0);
function planSeq(){ return belowSorted().slice().reverse().concat(LAB.floors||[]); }
function planFloor(){ if(PLAN.lv.kind==='site') return null; const F=LAB.floors||[], B=belowSorted(); if(PLAN.lv.kind==='below'&&B.length) return B[Math.min(B.length-1,PLAN.lv.i)]; return F[Math.min(F.length-1,Math.max(0,PLAN.lv.kind==='above'?PLAN.lv.i:0))]||null; }
const planCutZ=f=>f.z+Math.min(1.2,f.h*0.4);
const planActive=()=>view.ortho&&LAB.orbit.phi<0.05&&!!planFloor();
/* the uploaded model's checked parts, cut at a height: closed loops for solids, open runs for sheets */
function sliceParts(zc){ const P=LAB.modelParts, R=LAB.uploadRaw, U=LAB.upload; if(!P||!P.pieces||!R||P.rawVersion!==R.version||!LAB.S||LAB.S.typology!=='upload') return null;
  const zm=zc+(U&&U.grade||0)+R.minz, a=LAB.S.rotDeg*Math.PI/180, c=Math.cos(a), s=Math.sin(a), S=LAB.S; const W=(x,y)=>{ const lx=x-R.cx, ly=y-R.cy; return [S.posX+lx*c-ly*s,S.posY+lx*s+ly*c]; };
  const out={structure:[],core:[],stair:[],facade:[],window:[]};
  for(const p of P.pieces){ const list=out[p.cat]; if(!list) continue; if(p.z0==null){ let z0=1e9,z1=-1e9; for(const i of p.f){ const z=p.v[i*3+2]; if(z<z0)z0=z; if(z>z1)z1=z; } p.z0=z0; p.z1=z1; } if(zm<=p.z0||zm>=p.z1) continue;
    const segs=[]; for(let t=0;t<p.f.length;t+=3){ const q=[p.f[t],p.f[t+1],p.f[t+2]].map(i=>[p.v[i*3],p.v[i*3+1],p.v[i*3+2]+1e-5]); const pts=[];
      for(const [A,B] of [[q[0],q[1]],[q[1],q[2]],[q[2],q[0]]]){ if((A[2]-zm)*(B[2]-zm)<0){ const k=(zm-A[2])/(B[2]-A[2]); pts.push(W(A[0]+(B[0]-A[0])*k,A[1]+(B[1]-A[1])*k)); } } if(pts.length===2) segs.push(pts); }
    if(segs.length) list.push(chainSegs(segs)); }
  return out; }
function chainSegs(segs){ const key=p=>Math.round(p[0]*500)+','+Math.round(p[1]*500); const adj=new Map(); segs.forEach((sg,i)=>{ for(const e of [0,1]){ const k=key(sg[e]); (adj.get(k)||adj.set(k,[]).get(k)).push([i,e]); } });
  const used=new Uint8Array(segs.length), loops=[], open=[];
  for(let i=0;i<segs.length;i++){ if(used[i]) continue; used[i]=1; const pts=[segs[i][0],segs[i][1]]; let closed=false;
    for(let g=0;g<200000;g++){ const k=key(pts[pts.length-1]); const nx=(adj.get(k)||[]).find(([j])=>!used[j]); if(!nx) break; used[nx[0]]=1; const np=segs[nx[0]][1-nx[1]]; if(key(np)===key(pts[0])){ closed=true; break; } pts.push(np); }
    (closed?loops:open).push(pts); } return {loops,open}; }
function planPanel(){ let K=document.getElementById('planpanel'); if(K) return K; const vp=$('viewport');
  K=document.createElement('div'); K.id='planpanel'; K.className='keyplan planpanel';
  K.innerHTML=`<div class="kp-head"><b id="pp-title">Floor plan</b><span id="pp-sub"></span></div><div class="pp-row"><button type="button" id="pp-down" title="Level below" aria-label="Level below">▼</button><select id="pp-level" aria-label="Level"></select><button type="button" id="pp-up" title="Level above" aria-label="Level above">▲</button></div><div class="pp-res" id="pp-res" hidden></div><div class="pp-row"><button type="button" id="pp-draw" class="pp-wide" aria-pressed="false" title="Drag across the plan to draw a new section cut. On the plan, drag the A–A line to move it, drag an orange dot to turn it, click a bubble to flip it.">${ICO.cut}Draw cut</button><button type="button" id="pp-open" class="pp-wide" title="Open the section along A–A">${ICO.section}Section A–A</button></div><label class="pp-check"><input type="checkbox" id="pp-grid" checked> Grids and dimensions</label><details class="pp-gridbox" id="pp-gridbox"><summary title="Click a grid line or its bubble to select it, drag it to move it (Shift 1 m, Alt free), Delete removes it. Click a column to remove it from every floor, Shift-click for this floor only; click its empty intersection to put it back.">${ICO.grid}Structural grid</summary><div class="pp-g"><label>Layout<select id="pg-mode"><option value="fit">Fit bays to the plate</option><option value="fixed">Fixed spacing</option><option value="custom">Custom lines (edited by hand)</option></select></label><label>Bays along x<span><input type="number" id="pg-sx" min="3" max="24" step="0.3"> m</span></label><label>Bays along y<span><input type="number" id="pg-sy" min="3" max="24" step="0.3"> m</span></label><label class="pg-fixed">Offset x<span><input type="number" id="pg-ox" step="0.1"> m</span></label><label class="pg-fixed">Offset y<span><input type="number" id="pg-oy" step="0.1"> m</span></label><label>Edge inset<span><input type="number" id="pg-inset" min="0" max="6" step="0.1"> m</span></label><label>Column size<span><input type="number" id="pg-cs" min="0.3" max="2.5" step="0.05"> m</span></label></div><div class="pg-edit"><button type="button" id="pg-addx" class="pp-wide" aria-pressed="false" title="Add a numbered grid line, then click the plan to place it"></button><button type="button" id="pg-addy" class="pp-wide" aria-pressed="false" title="Add a lettered grid line, then click the plan to place it"></button></div><div class="pg-sel" id="pg-sel" hidden><b id="pg-sel-name"></b><label>at <input type="number" id="pg-selv" step="0.1"> m</label><button type="button" id="pg-del" title="Delete this grid line (Delete key)" aria-label="Delete this grid line">${ICO.trash}</button></div><div class="pg-stats" id="pg-count"></div><button type="button" id="pg-restore" class="pp-wide" title="Put back every removed column">${ICO.restore}Restore columns</button></details><div class="pp-legend"><span><i class="lg-cut"></i>Cut</span><span><i class="lg-glass"></i>Glazing</span><span><i class="lg-below"></i>Below</span><span><i class="lg-over"></i>Above</span></div>`;
  vp.appendChild(K); K.addEventListener('pointerdown',e=>e.stopPropagation()); K.addEventListener('wheel',e=>e.stopPropagation());
  const sel=K.querySelector('#pp-level'); sel.onchange=()=>{ const [k,i]=sel.value.split(':'); PLAN.lv={kind:k,i:+i||0}; planFrame(false); if(adv()&&k==='above'){ SW.planLevel=(+i||0)+1; persist(); renderPlan(); } };
  const step=d=>{ const o=[...sel.options]; let j=sel.selectedIndex-d; j=Math.max(0,Math.min(o.length-1,j)); sel.selectedIndex=j; sel.onchange(); };
  K.querySelector('#pp-up').onclick=()=>step(1); K.querySelector('#pp-down').onclick=()=>step(-1);
  K.querySelector('#pp-draw').onclick=()=>{ PLAN.drawCut=!PLAN.drawCut; syncDrawBtn(); }; K.querySelector('#pp-open').onclick=()=>{ PLAN.drawCut=false; syncDrawBtn(); openSection(); };
  for(const id of ['pg-mode','pg-sx','pg-sy','pg-ox','pg-oy','pg-inset','pg-cs']) K.querySelector('#'+id).addEventListener('change',()=>{ const G=gridCfg(); const md=K.querySelector('#pg-mode').value; if(md==='custom') gridToCustom(); else { G.mode=md; PLAN.gridSel=null; } for(const [k,i] of [['sx','pg-sx'],['sy','pg-sy'],['ox','pg-ox'],['oy','pg-oy'],['inset','pg-inset'],['cs','pg-cs']]){ const v=parseFloat(K.querySelector('#'+i).value); if(isFinite(v)) G[k]=v; } G.sx=Math.max(3,Math.min(24,G.sx)); G.sy=Math.max(3,Math.min(24,G.sy)); G.cs=Math.max(0.3,Math.min(2.5,G.cs)); G.inset=Math.max(0,Math.min(6,G.inset)); GRIDV++; SHEET.key=null; persist(); syncGridUI(); LAB.requestRender(); });
  K.querySelector('#pg-addx').onclick=()=>gridAdd('x'); K.querySelector('#pg-addy').onclick=()=>gridAdd('y'); K.querySelector('#pg-del').onclick=()=>gridDelete();
  K.querySelector('#pg-selv').addEventListener('change',e=>{ const GS=PLAN.gridSel; const v=parseFloat(e.target.value); if(!GS||!isFinite(v)) return; const G=gridToCustom(), [ax,id]=GS.key.split(':'); const L=(ax==='x'?G.lx:G.ly).find(l=>l.id===id); if(L){ L.v=v; GRIDV++; SHEET.key=null; persist(); syncGridUI(); LAB.requestRender(); } });
  K.querySelector('#pg-restore').onclick=()=>{ gridCfg().removed={}; GRIDV++; SHEET.key=null; persist(); syncGridUI(); LAB.requestRender(); };
  setTimeout(syncGridUI,0);
  K.querySelector('#pp-grid').onchange=e=>{ PLAN.grid=e.target.checked; LAB.requestRender(); };
  return K; }
function syncGridUI(){ const K=document.getElementById('planpanel'); if(!K) return; const G=gridCfg(); const set=(id,v)=>{ const e=K.querySelector('#'+id); if(e&&document.activeElement!==e) e.value=v; };
  set('pg-mode',G.mode); set('pg-sx',G.sx); set('pg-sy',G.sy); set('pg-ox',G.ox); set('pg-oy',G.oy); set('pg-inset',G.inset); set('pg-cs',G.cs); K.querySelectorAll('.pg-fixed').forEach(l=>l.hidden=G.mode!=='fixed'); for(const id of ['pg-sx','pg-sy','pg-inset']){ const e=K.querySelector('#'+id); if(e) e.closest('label').hidden=G.mode==='custom'; }
  K.querySelector('#pg-addx').setAttribute('aria-pressed',String(PLAN.addGrid==='x')); K.querySelector('#pg-addy').setAttribute('aria-pressed',String(PLAN.addGrid==='y')); K.querySelector('#pg-addx').innerHTML=ICO.vline+(PLAN.addGrid==='x'?'Click plan':'Number'); K.querySelector('#pg-addy').innerHTML=ICO.hline+(PLAN.addGrid==='y'?'Click plan':'Letter');
  { const GS=PLAN.gridSel, box=K.querySelector('#pg-sel'); let L=null, lab=''; if(GS){ const TG0=towerGrid(), [ax,id]=GS.key.split(':'); const i=(ax==='x'?TG0.idsX:TG0.idsY).indexOf(id); if(i>=0){ L={ax,v:(ax==='x'?TG0.X:TG0.Y)[i]}; lab=(ax==='x'?TG0.labX:TG0.labY)[i]; } else PLAN.gridSel=null; }
    box.hidden=!L; if(L){ K.querySelector('#pg-sel-name').textContent=`Grid ${lab}`; set('pg-selv',+L.v.toFixed(2)); } if(GS) { const gb=K.querySelector('#pp-gridbox'); if(gb) gb.open=true; } }
  const TG=towerGrid(), f=planFloor(); const n=Object.keys(G.removed).filter(k=>{ const [a]=k.split('@'); const [x,y]=a.split('|'); return TG.idsX.includes(x)&&TG.idsY.includes(y); }).length; const c=f?colsOf(f):null; const cnt=K.querySelector('#pg-count'); if(cnt) cnt.innerHTML=`<span title="Grid lines">${ICO.grid}${TG.X.length} × ${TG.Y.length}</span>${c?`<span title="Columns on this floor"><i class="pg-col"></i>${c.cols.length}</span>`:''}${n?`<span title="Columns removed"><i class="pg-col off"></i>${n}</span>`:''}`; }
function planPanelSync(){ const K=planPanel(); K.hidden=false; const sel=K.querySelector('#pp-level'); const F=LAB.floors||[], B=belowSorted(); const sg=v=>(v>0.005?'+':v<-0.005?'−':'±')+Math.abs(v).toFixed(2);
  const opts=[['site:0','Site · roof plan']].concat(F.map((f,i)=>['above:'+i,`L${i+1} · ${sg(f.z)}`]).reverse(),B.map((f,i)=>['below:'+i,`B${i+1} · ${sg(f.z)}`]));
  const want=PLAN.lv.kind+':'+(PLAN.lv.kind==='site'?0:PLAN.lv.i); const sig=opts.map(o=>o[0]+o[1]).join('|'); if(sel.dataset.sig!==sig){ sel.innerHTML=opts.map(([v,l])=>`<option value="${v}">${l}</option>`).join(''); sel.dataset.sig=sig; } sel.value=want; if(sel.value!==want) sel.value='above:0';
  const f=planFloor(); { const pr=K.querySelector('#pp-res'); const on=adv()&&!!f&&!f.below; pr.hidden=!on; if(on) ppResults(); } K.querySelector('#pp-title').textContent=f?(f.below?'B'+f.bi:'L'+(f.i+1))+' plan':'Site plan'; K.querySelector('#pp-sub').textContent=f?`FFL ${sg(f.z)} · cut at +${(planCutZ(f)-f.z).toFixed(2)}`:'roofs from above'; }
function planFrame(refit){ const f=planFloor(), o=LAB.orbit, S=LAB.S; if(f){ const R=Math.max(f.w||30,f.d||30)*0.62+22; if(refit) { o.dist=R/Math.tan(LAB.camera.fov*Math.PI/360); o.target.set(S.posX,planCutZ(f),-S.posY); } else o.target.y=planCutZ(f); } else if(refit){ o.target.set(S.posX,0,-S.posY); o.dist=Math.max(220,(S.height||100)*1.4); } SHEET.key=null; LAB.requestRender(); }

/* core footprints of a floor, in its own axes: from the modeled core parts cut at mid-storey, else from closed openings in the
   floor plate (a plate drawn around its core), else a square of the core size on the tower axis */
function coreRectsOf(f){ const S=LAB.S, P=LAB.modelParts, R=LAB.uploadRaw; const key=[S.posX,S.posY,S.rotDeg,P&&P.rawVersion,R&&R.version].join('|'); if(f._cores&&f._cores.key===key) return f._cores.list;
  let list=[];
  const cut=sliceParts(f.z+Math.min(f.h*0.5,2)); if(cut&&cut.core.length){ for(const g of cut.core){ let a0=1e9,a1=-1e9,b0=1e9,b1=-1e9; for(const lp of g.loops.concat(g.open)) for(const q of lp){ const l=LAB.toLocal(f,q[0],q[1]); a0=Math.min(a0,l.x); a1=Math.max(a1,l.x); b0=Math.min(b0,l.y); b1=Math.max(b1,l.y); } if(a1-a0>1.5&&b1-b0>1.5) list.push({x0:a0,x1:a1,y0:b0,y1:b1,src:'model'}); }
    // walls of one core modeled as separate pieces: merge rectangles that touch
    for(let again=true;again;){ again=false; for(let i=0;i<list.length&&!again;i++) for(let j=i+1;j<list.length;j++){ const A=list[i], B=list[j]; if(A.x0<=B.x1+0.5&&B.x0<=A.x1+0.5&&A.y0<=B.y1+0.5&&B.y0<=A.y1+0.5){ list[i]={x0:Math.min(A.x0,B.x0),x1:Math.max(A.x1,B.x1),y0:Math.min(A.y0,B.y0),y1:Math.max(A.y1,B.y1),src:'model'}; list.splice(j,1); again=true; break; } } } }
  if(!list.length&&f.mask){ const loops=LAB.maskLoops(f); const outer=loops.filter(l=>l.outer).reduce((a,l)=>a+l.area,0); for(const lp of loops){ if(lp.outer||lp.area<9||lp.area>0.45*outer) continue; let a0=1e9,a1=-1e9,b0=1e9,b1=-1e9; for(const p of lp.pts){ a0=Math.min(a0,p[0]); a1=Math.max(a1,p[0]); b0=Math.min(b0,p[1]); b1=Math.max(b1,p[1]); } list.push({x0:a0,x1:a1,y0:b0,y1:b1,src:'opening'}); } }
  if(!list.length&&(f.core||0)>4){ const cl=LAB.toLocal(f,S.posX,S.posY), ch=f.core/2; list.push({x0:cl.x-ch,x1:cl.x+ch,y0:cl.y-ch,y1:cl.y+ch,src:'axis'}); }
  f._cores={key,list}; return list; }
const inCoreRect=(list,x,y,pad)=>list.find(r=>x>=r.x0-(pad||0)&&x<=r.x1+(pad||0)&&y>=r.y0-(pad||0)&&y<=r.y1+(pad||0));
/* shared by the plan and the section: the plate's bounds in its own axes, the column grid, and the core layout */
function plateBounds(f){ let bx0=1e9,bx1=-1e9,by0=1e9,by1=-1e9; for(const lp of LAB.maskLoops(f)) for(const p of lp.pts){ bx0=Math.min(bx0,p[0]); bx1=Math.max(bx1,p[0]); by0=Math.min(by0,p[1]); by1=Math.max(by1,p[1]); } return {bx0,bx1,by0,by1}; }
function insideF(f,lx,ly){ const m=f.mask; if(!m) return false; const ix=Math.floor(lx-m.x0), iy=Math.floor(ly-m.y0); return ix>=0&&iy>=0&&ix<m.nx&&iy<m.ny&&!!m.cells[iy*m.nx+ix]&&lx<=f.w/2&&ly<=f.d/2; }
/* the structural grid: one grid for the tower, in the tower's own axes (centre at the tower position, turned with it).
   Fit: the bays divide each direction evenly between the plate edges less the inset. Fixed: lines at the set spacing from the offset.
   A column stands at every intersection inside the floor plate and clear of the core, unless it was removed (for every floor, or for one). */
function gridCfg(){ const S=LAB.S; if(!S.grid) S.grid={mode:'fit',sx:9,sy:9,ox:0,oy:0,inset:0.9,cs:0.8,removed:{}}; const G=S.grid; if(!G.removed) G.removed={};
  // removed columns used to be keyed by line numbers; they are keyed by line ids now, so an added or deleted line does not move them
  for(const k of Object.keys(G.removed)){ const m=/^(\d+),(\d+)(@.*)?$/.exec(k); if(m){ G.removed['x'+m[1]+'|y'+m[2]+(m[3]||'')]=1; delete G.removed[k]; } }
  if(G.mode==='custom'&&(!G.lx||!G.ly)) G.mode='fit'; return G; }
/* the first hand edit turns the grid into custom lines, starting from the lines on screen */
function gridToCustom(){ const G=gridCfg(); if(G.mode==='custom') return G; const TG=towerGrid(); G.lx=TG.X.map((v,i)=>({id:TG.idsX[i],v:+v.toFixed(3)})); G.ly=TG.Y.map((v,j)=>({id:TG.idsY[j],v:+v.toFixed(3)})); G.mode='custom'; G.nid=(G.nid||0)+1; return G; }
const gridNewId=(G,ax)=>{ G.nid=(G.nid||0)+1; return ax+'n'+G.nid; };
let GRIDV=0;
function toT(x,y){ const S=LAB.S, a=-S.rotDeg*Math.PI/180, c=Math.cos(a), s=Math.sin(a), dx=x-S.posX, dy=y-S.posY; return {x:dx*c-dy*s,y:dx*s+dy*c}; }
function fromT(x,y){ const S=LAB.S, a=S.rotDeg*Math.PI/180, c=Math.cos(a), s=Math.sin(a); return {x:S.posX+x*c-y*s,y:S.posY+x*s+y*c}; }
function floorExtT(f){ let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9; for(const lp of LAB.maskLoops(f)) for(const p of lp.pts){ const w=LAB.toWorld(f,p[0],p[1]), t=toT(w.x,w.y); x0=Math.min(x0,t.x); x1=Math.max(x1,t.x); y0=Math.min(y0,t.y); y1=Math.max(y1,t.y); } return {x0,x1,y0,y1}; }
function towerGrid(){ const G=gridCfg(), F=(LAB.floors||[]).concat(LAB.belowFloors||[]); const key=[F.length&&F[0],F.length,LAB.S.posX,LAB.S.posY,LAB.S.rotDeg,G.mode,G.sx,G.sy,G.ox,G.oy,G.inset,G.cs,GRIDV,G.mode==='custom'?JSON.stringify([G.lx,G.ly]):''].join('|'); if(towerGrid.c&&towerGrid.c.key===key) return towerGrid.c;
  const E={x0:1e9,x1:-1e9,y0:1e9,y1:-1e9}; for(const f of F){ const e=floorExtT(f); E.x0=Math.min(E.x0,e.x0); E.x1=Math.max(E.x1,e.x1); E.y0=Math.min(E.y0,e.y0); E.y1=Math.max(E.y1,e.y1); } if(E.x0>E.x1){ E.x0=E.y0=-15; E.x1=E.y1=15; }
  const lines=(a,b,sp,o)=>{ const lo=a+G.inset, hi=b-G.inset, s=Math.max(1,+sp||9), out=[]; if(hi<=lo) return [(a+b)/2];
    if(G.mode==='fit'){ const n=Math.max(1,Math.round((hi-lo)/s)); for(let i=0;i<=n;i++) out.push(lo+i*(hi-lo)/n); }
    else { const k0=Math.ceil((lo-o)/s-1e-6), k1=Math.floor((hi-o)/s+1e-6); for(let k=k0;k<=k1;k++) out.push(o+k*s); } return out; };
  let X, Y, idsX, idsY;
  if(G.mode==='custom'){ const ax=G.lx.slice().sort((a,b)=>a.v-b.v), ay=G.ly.slice().sort((a,b)=>a.v-b.v); X=ax.map(l=>l.v); Y=ay.map(l=>l.v); idsX=ax.map(l=>l.id); idsY=ay.map(l=>l.id); }
  else { X=lines(E.x0,E.x1,G.sx,+G.ox||0); Y=lines(E.y0,E.y1,G.sy,+G.oy||0); idsX=X.map((_,i)=>'x'+i); idsY=Y.map((_,j)=>'y'+j); }
  towerGrid.c={key,X,Y,E,idsX,idsY,labX:X.map((_,i)=>String(i+1)),labY:Y.map((_,j)=>String.fromCharCode(65+(j%26))+(j>=26?String(Math.floor(j/26)):''))}; return towerGrid.c; }
const floorKey=f=>(f.below?'b':'')+f.i;
function colsOf(f){ const G=gridCfg(), TG=towerGrid(); const ck=TG.key+'|'+f.z.toFixed(2)+'|'+JSON.stringify(G.removed).length; if(f._cols&&f._cols.key===ck) return f._cols;
  const CR=coreRectsOf(f), cols=[], ghosts=[], fk=floorKey(f);
  TG.X.forEach((x,i)=>TG.Y.forEach((y,j)=>{ const w=fromT(x,y), l=LAB.toLocal(f,w.x,w.y); if(!insideF(f,l.x,l.y)) return; if(inCoreRect(CR,l.x,l.y,0.6)) return; const id=TG.idsX[i]+'|'+TG.idsY[j]; const off=G.removed[id]?'all':(G.removed[id+'@'+fk]?'floor':null); (off?ghosts:cols).push({x:l.x,y:l.y,i,j,id,off}); }));
  f._cols={key:ck,cols,ghosts,cs:(+G.cs||0.8)*(f.below?1.12:1),TG}; return f._cols; }
function gridDelete(){ const GS=PLAN.gridSel; if(!GS) return; const G=gridToCustom(), [ax,id]=GS.key.split(':'); const list=ax==='x'?G.lx:G.ly; if(list.length<=1) return; const i=list.findIndex(l=>l.id===id); if(i<0) return; list.splice(i,1); PLAN.gridSel=null; GRIDV++; SHEET.key=null; persist(); syncGridUI(); LAB.requestRender(); }
function gridAdd(ax){ PLAN.addGrid=PLAN.addGrid===ax?null:ax; PLAN.hoverT=null; syncGridUI(); LAB.requestRender(); }
function toggleCol(id,off,floorOnly){ const G=gridCfg(), f=planFloor(); const fk=f?floorKey(f):''; if(off==='all') delete G.removed[id]; else if(off==='floor') delete G.removed[id+'@'+fk]; else if(floorOnly) G.removed[id+'@'+fk]=1; else G.removed[id]=1; GRIDV++; SHEET.key=null; persist(); syncGridUI(); LAB.requestRender(); }
/* core as a room: walls, a lift bank along its west wall, a lobby, two stairs to the east */
function coreLayout(x0,x1,y0,y1){ const T=0.3, cw=x1-x0, cd=y1-y0; const lob=Math.min(3.2,cw*0.22), nLift=Math.max(2,Math.min(8,Math.ceil(((LAB.floors||[]).length)/9))); const liftW=Math.min(2.6,Math.max(1.8,(cd-2*T)/Math.max(1,nLift)));
  const fits=cw>=liftW+lob+3.2&&cd>=5; return {T,cw,cd,lob,nLift,liftW,xl:x0+T,xs:x0+T+liftW+0.2+lob,fits}; }
function insetPoly(pts,t){ let A=0; for(let i=0;i<pts.length;i++){ const a=pts[i], b=pts[(i+1)%pts.length]; A+=a[0]*b[1]-b[0]*a[1]; } const sg=A>0?1:-1, n=pts.length, out=[];
  for(let i=0;i<n;i++){ const p=pts[(i-1+n)%n], c=pts[i], q=pts[(i+1)%n]; const e1=[c[0]-p[0],c[1]-p[1]], e2=[q[0]-c[0],q[1]-c[1]]; const l1=Math.hypot(e1[0],e1[1])||1, l2=Math.hypot(e2[0],e2[1])||1; const n1=[-e1[1]/l1*sg,e1[0]/l1*sg], n2=[-e2[1]/l2*sg,e2[0]/l2*sg];
    const bis=[n1[0]+n2[0],n1[1]+n2[1]], bl=Math.hypot(bis[0],bis[1]); if(bl<1e-6){ out.push([c[0]+n1[0]*t,c[1]+n1[1]*t]); continue; } const cosh=(bis[0]*n1[0]+bis[1]*n1[1])/bl; const m=t/Math.max(0.25,cosh); out.push([c[0]+bis[0]/bl*m,c[1]+bis[1]/bl*m]); } return out; }
function drawPlan(svg,W,H){ const f=planFloor(); const S=LAB.S, zc=planCutZ(f), below=!!f.below, ink='#1F2227';
  const prj=(x,y)=>{ const v=new THREE.Vector3(x,zc,-y).project(orthoCam); return [(v.x+1)/2*W,(1-v.y)/2*H]; };
  const O=prj(0,0), X1=prj(1,0), Y1=prj(0,1); const ax=[X1[0]-O[0],X1[1]-O[1]], ay=[Y1[0]-O[0],Y1[1]-O[1]]; const k=Math.hypot(ax[0],ax[1]);
  const px=(x,y)=>[O[0]+ax[0]*x+ay[0]*y,O[1]+ax[1]*x+ay[1]*y]; const fmt=p=>p[0].toFixed(1)+' '+p[1].toFixed(1);
  const Lw=(g,lx,ly)=>{ const p=LAB.toWorld(g,lx,ly); return px(p.x,p.y); };
  const loopsPath=g=>LAB.maskLoops(g).map(lp=>'M'+lp.pts.map(q=>fmt(Lw(g,q[0],q[1]))).join('L')+'Z').join(' ');
  const worldPath=(loops,close)=>loops.map(pts=>'M'+pts.map(q=>fmt(px(q[0],q[1]))).join('L')+(close?'Z':'')).join(' ');
  const defs=el('defs',{},svg); const pat=el('pattern',{id:'earth-hatch',patternUnits:'userSpaceOnUse',width:9,height:9,patternTransform:'rotate(45)'},defs); el('rect',{width:9,height:9,fill:'#ECE4D5'},pat); el('line',{x1:0,y1:0,x2:0,y2:9,stroke:'#A8916C','stroke-width':1},pat);
  if(below) el('rect',{x:0,y:0,width:W,height:H,fill:'url(#earth-hatch)'},svg);
  const seq=planSeq(), idx=seq.indexOf(f), fb=seq[idx-1], fa=seq[idx+1];
  const site=LAB.site&&LAB.site.site; if(!below&&site&&site.polygon&&site.polygon.length) el('path',{d:worldPath([site.polygon],true),fill:'none',stroke:'#6B7078','stroke-width':0.9,'stroke-dasharray':'14 3 2 3'},svg);
  if(fb&&!below) el('path',{d:loopsPath(fb),fill:'#F4F3F0',stroke:'#7A8088','stroke-width':0.7,'fill-rule':'evenodd'},svg);
  el('path',{d:loopsPath(f),fill:'#FFFFFF','fill-rule':'evenodd'},svg);
  if(adv()&&!below&&PLAN_OVL&&PLAN_OVL.f===f&&PLAN_OVL.html){ if(!PLAN_OVL.node){ const g=document.createElementNS(NS,'g'); g.setAttribute('class','plan-ovl'); g.setAttribute('shape-rendering','crispEdges'); g.innerHTML=PLAN_OVL.html; PLAN_OVL.node=g; }
    const o0=Lw(f,0,0), a1=Lw(f,1,0), b1=Lw(f,0,1); PLAN_OVL.node.setAttribute('transform',`matrix(${(a1[0]-o0[0]).toFixed(4)} ${(a1[1]-o0[1]).toFixed(4)} ${(b1[0]-o0[0]).toFixed(4)} ${(b1[1]-o0[1]).toFixed(4)} ${o0[0].toFixed(2)} ${o0[1].toFixed(2)})`); svg.appendChild(PLAN_OVL.node); }
  const cut=sliceParts(zc)||{structure:[],core:[],stair:[],facade:[],window:[]}; const has=c=>cut[c].some(q=>q.loops.length||q.open.length);
  const tiny=k<1.2; const TW=below?0.4:0.3; const poche={fill:ink,stroke:ink,'stroke-width':0.6};
  const lineL=(g,a,b,attrs)=>{ const A=Lw(g,a[0],a[1]), B=Lw(g,b[0],b[1]); return el('line',Object.assign({x1:A[0].toFixed(1),y1:A[1].toFixed(1),x2:B[0].toFixed(1),y2:B[1].toFixed(1)},attrs),svg); };
  const quadL=(g,pts,attrs)=>el('path',Object.assign({d:'M'+pts.map(q=>fmt(Lw(g,q[0],q[1]))).join('L')+'Z'},attrs),svg);
  // façade, cut at the sill height
  const devices=[];
  for(const e of edgesOf(f)){ const at=(u,v)=>[e.mx+e.ux*u+e.ox*v,e.my+e.uy*u+e.oy*v]; const h2=e.L/2; const q=(u0,u1,v0,v1)=>[at(u0,v0),at(u1,v0),at(u1,v1),at(u0,v1)];
    if(below){ quadL(f,q(-h2,h2,-TW,0),poche); continue; }
    const z=zoneFor(e.o,f.i+1), st=z.strat, Bd=band(f,e.o,z), cr=zc-f.z, D=z.depth||0; const inGlass=cr>=Bd.sp-0.01&&cr<=Bd.head+0.01; devices.push({e,at,q,h2,st,D,inGlass});
    if(has('facade')||has('window')) continue;
    if(st==='punched'){ const T=Math.max(TW,D); const nW=Math.max(1,Math.floor(e.L/2.4)), stp=e.L/nW, w=Math.min(1.8,stp-0.4); let u=-h2;
      for(let i=0;i<nW;i++){ const c0=-h2+(i+0.5)*stp; if(inGlass&&w>0.4){ quadL(f,q(u,c0-w/2,-T,0),poche); lineL(f,at(c0-w/2,-T/2),at(c0+w/2,-T/2),{stroke:'#2F5F8A','stroke-width':0.9}); for(const v of [-T,-T+0.06]) lineL(f,at(c0-w/2,v),at(c0+w/2,v),{stroke:ink,'stroke-width':0.6}); u=c0+w/2; } }
      quadL(f,q(u,h2,-T,0),poche); }
    else if(inGlass){ for(const v of [0,-TW]) lineL(f,at(-h2,v),at(h2,v),{stroke:ink,'stroke-width':0.9}); lineL(f,at(-h2,-TW/2),at(h2,-TW/2),{stroke:'#2F5F8A','stroke-width':0.8});
      if(k*1.5>5){ const n=Math.max(1,Math.round(e.L/1.5)); for(let i=0;i<=n;i++){ const u=-h2+i*e.L/n; quadL(f,q(u-0.04,u+0.04,-TW,0),poche); } } }
    else quadL(f,q(-h2,h2,-TW,0),poche); }
  // shading devices: fins are cut; slabs and louvres lie below the cut; overhangs and shelves are above it
  for(const d of devices){ const {at,q,h2,st,D}=d; if(D<=0.05&&st!=='doubleskin') continue; const over={fill:'none',stroke:'#4B5057','stroke-width':0.8,'stroke-dasharray':'5 3'}, under={fill:'none',stroke:'#5F646B','stroke-width':0.7};
    if(st==='overhang'||st==='lightshelf') quadL(f,q(-h2-0.1,h2+0.1,0,D),over);
    if(st==='louvres'||st==='eggcrate'){ quadL(f,q(-h2,h2,0.02,D),under); if(k*0.5>4) for(const v of [D*0.33,D*0.66]) lineL(f,at(-h2,v),at(h2,v),{stroke:'#8A8F96','stroke-width':0.5}); }
    if(st==='fins'||st==='eggcrate'){ const n=Math.max(1,Math.floor(2*h2/1.5)), stp=2*h2/n; for(let i=0;i<n;i++){ const u=-h2+(i+0.5)*stp; quadL(f,q(u-0.05,u+0.05,0,D),poche); } }
    if(st==='balcony'){ quadL(f,q(-h2-0.05,h2+0.05,0,D),{fill:'#FAFAF8',stroke:'#5F646B','stroke-width':0.8}); lineL(f,at(-h2-0.05,D-0.04),at(h2+0.05,D-0.04),{stroke:ink,'stroke-width':1.4}); }
    if(st==='doubleskin'){ const Dd=Math.max(0.3,D); for(const v of [Dd-0.03,Dd+0.03]) lineL(f,at(-h2,v),at(h2,v),{stroke:'#2F5F8A','stroke-width':0.8}); } }
  // uploaded parts, cut from the model
  for(const c of ['facade','structure']) for(const g of cut[c]){ if(g.loops.length) el('path',{d:worldPath(g.loops,true),'fill-rule':'evenodd',...poche},svg); if(g.open.length) el('path',{d:worldPath(g.open,false),fill:'none',stroke:ink,'stroke-width':2.2},svg); }
  for(const g of cut.window) el('path',{d:worldPath(g.loops,true)+' '+worldPath(g.open,false),fill:'none',stroke:'#2F5F8A','stroke-width':0.9},svg);
  for(const g of cut.stair) el('path',{d:worldPath(g.loops,true)+' '+worldPath(g.open,false),fill:'none',stroke:ink,'stroke-width':0.9},svg);
  const {bx0,bx1,by0,by1}=plateBounds(f); const inside=(lx,ly)=>insideF(f,lx,ly);
  const cl=LAB.toLocal(f,S.posX,S.posY), c=f.core||0, ch=c/2;
  const CO=colsOf(f), TG=CO.TG; const colHits=[]; // column handles go on top of the grid-line handles, so a click on a column hits the column
  if(!has('structure')){ const cs=CO.cs, sq=(x,y)=>[[x-cs/2,y-cs/2],[x+cs/2,y-cs/2],[x+cs/2,y+cs/2],[x-cs/2,y+cs/2]]; const hit=(c,extra)=>colHits.push(()=>{ const p=Lw(f,c.x,c.y); el('circle',Object.assign({cx:p[0].toFixed(1),cy:p[1].toFixed(1),r:Math.max(7,cs*k*0.8).toFixed(1),fill:'transparent','data-col':c.id,style:'pointer-events:all;cursor:pointer'},extra||{}),svg).appendChild(Object.assign(document.createElementNS(NS,'title'),{textContent:`Column ${TG.labX[c.i]}–${TG.labY[c.j]} · click to ${c.off?'put it back':'remove it from every floor · Shift-click for this floor only'}`})); });
    for(const c of CO.cols){ quadL(f,sq(c.x,c.y),poche); hit(c); }
    if(!tiny) for(const c of CO.ghosts) hit(c,{'data-off':c.off,class:'col-ghost'}); }
  // core: walls, a bank of lifts on one side of a lobby, two stairs on the other, doors into the lobby
  const coreRoom=(x0,x1,y0,y1)=>{ const R=(a,b,cc,d,at)=>quadL(f,[[a,cc],[b,cc],[b,d],[a,d]],at||poche); R(x0,x1,y0,y1,{fill:'#fff'}); const LY=coreLayout(x0,x1,y0,y1), T=LY.T, cd=LY.cd, lob=LY.lob, nLift=LY.nLift, liftW=LY.liftW, xl=LY.xl, xs=LY.xs;
    R(x0,x1,y0,y0+T); R(x0,x1,y1-T,y1); R(x0,x0+T,y0,y1); R(x1-T,x1,y0,y1);
    // a door into a core too small to plan
    if(!LY.fits){ R(x0+LY.cw/2-0.5,x0+LY.cw/2+0.5,y0-0.02,y0+T+0.02,{fill:'#fff'}); if(!tiny&&k>3){ const p=Lw(f,(x0+x1)/2,(y0+y1)/2); const t=el('text',{x:p[0].toFixed(1),y:(p[1]+3).toFixed(1),'text-anchor':'middle','font-size':9,fill:'#5F646B','font-family':'var(--font-m),monospace'},svg); t.textContent='CORE'; } return; }
    R(xs,xs+0.2,y0,y1);
    const nl=Math.max(1,Math.min(nLift,Math.floor((cd-2*T)/liftW))); for(let i=0;i<nl;i++){ const a=y0+T+i*(cd-2*T)/nl, b=a+(cd-2*T)/nl; R(xl+liftW,xl+liftW+0.2,a,b); quadL(f,[[xl,a],[xl+liftW,a],[xl+liftW,b],[xl,b]],{fill:'none',stroke:ink,'stroke-width':0.6}); if(!tiny){ lineL(f,[xl,a],[xl+liftW,b],{stroke:ink,'stroke-width':0.5}); lineL(f,[xl,b],[xl+liftW,a],{stroke:ink,'stroke-width':0.5}); } R(xl+liftW-0.02,xl+liftW+0.22,(a+b)/2-0.55,(a+b)/2+0.55,{fill:'#fff'}); }
    // lobby opens to the floor at both ends
    R(xl+liftW+0.2,xs,y0-0.02,y0+T+0.02,{fill:'#fff'}); R(xl+liftW+0.2,xs,y1-T-0.02,y1+0.02,{fill:'#fff'});
    // two stairs, one above the other, each two flights with landings
    const sx0=xs+0.2, sx1=x1-T, sw=sx1-sx0, sh=(cd-2*T-0.2)/2;
    if(sw>2.2&&sh>3.5) for(let s=0;s<2;s++){ const a=y0+T+s*(sh+0.2), b=a+sh; if(s===0) R(sx0,sx1,b,b+0.2); const land=Math.min(1.4,sh*0.25), fw=(sw-0.1)/2, mid=sx0+fw;
      quadL(f,[[sx0,a],[sx1,a],[sx1,b],[sx0,b]],{fill:'none',stroke:ink,'stroke-width':0.6}); R(mid,mid+0.1,a+land,b-land,{fill:'none',stroke:ink,'stroke-width':0.6});
      if(k*0.28>2.2) for(let t=a+land;t<=b-land+1e-6;t+=0.28){ lineL(f,[sx0,t],[mid,t],{stroke:ink,'stroke-width':0.4}); lineL(f,[mid+0.1,t],[sx1,t],{stroke:ink,'stroke-width':0.4}); }
      const cutY=a+land+(b-a-2*land)*0.55; lineL(f,[sx0,cutY-0.6],[mid,cutY+0.6],{stroke:ink,'stroke-width':1.1}); // break line where the flight passes the cut
      if(!tiny){ lineL(f,[sx0+fw/2,a+land],[sx0+fw/2,cutY],{stroke:ink,'stroke-width':0.6}); const tip=Lw(f,sx0+fw/2,cutY), bb=Lw(f,sx0+fw/2,cutY-0.5); const dx=tip[0]-bb[0], dy=tip[1]-bb[1], L=Math.hypot(dx,dy)||1; el('path',{d:`M${fmt(tip)}L${(tip[0]-dx/L*6-dy/L*3).toFixed(1)} ${(tip[1]-dy/L*6+dx/L*3).toFixed(1)}L${(tip[0]-dx/L*6+dy/L*3).toFixed(1)} ${(tip[1]-dy/L*6-dx/L*3).toFixed(1)}Z`,fill:ink},svg);
        if(k>5){ const tp=Lw(f,sx0+fw/2,a+land*0.5); const t=el('text',{x:tp[0].toFixed(1),y:(tp[1]+3).toFixed(1),'text-anchor':'middle','font-size':8.5,fill:ink,'font-family':'var(--font-m),monospace'},svg); t.textContent='UP'; } }
      // door from the lobby, swing drawn
      const dy0=s===0?a+land*0.15:b-land*0.15-0.9; R(xs-0.02,xs+0.22,dy0,dy0+0.9,{fill:'#fff'}); if(!tiny){ const hinge=Lw(f,xs+0.2,dy0), leaf=Lw(f,xs+0.2+0.9,dy0), end=Lw(f,xs+0.2,dy0+0.9); const r=0.9*k; el('path',{d:`M${fmt(hinge)}L${fmt(leaf)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 ${s===0?0:1} ${fmt(end)}`,fill:'none',stroke:ink,'stroke-width':0.5},svg); } }
  }
  if(!has('core')) for(const r of coreRectsOf(f)) coreRoom(r.x0,r.x1,r.y0,r.y1);
  // a modeled core: walls as modeled, or, if it is one solid, read as a room with walls and the core layout inside
  for(const g of cut.core){ if(g.loops.length>1) el('path',{d:worldPath(g.loops,true),'fill-rule':'evenodd',...poche},svg);
    else if(g.loops.length===1){ const lp=g.loops[0], loc=lp.map(q=>{ const l=LAB.toLocal(f,q[0],q[1]); return [l.x,l.y]; }); let a0=1e9,a1=-1e9,b0=1e9,b1=-1e9,A=0; loc.forEach((q,i)=>{ a0=Math.min(a0,q[0]); a1=Math.max(a1,q[0]); b0=Math.min(b0,q[1]); b1=Math.max(b1,q[1]); const r2=loc[(i+1)%loc.length]; A+=q[0]*r2[1]-r2[0]*q[1]; });
      if(Math.min(a1-a0,b1-b0)<1.2) el('path',{d:worldPath([lp],true),...poche},svg);
      else if(Math.abs(A)/2>0.85*(a1-a0)*(b1-b0)) coreRoom(a0,a1,b0,b1);
      else { el('path',{d:worldPath([lp],true),...poche},svg); el('path',{d:worldPath([insetPoly(lp,0.3)],true),fill:'#fff'},svg); } }
    if(g.open.length) el('path',{d:worldPath(g.open,false),fill:'none',stroke:ink,'stroke-width':2.2},svg); }
  // overhead: the floor above, dashed (drawn last among the lines so it reads over the plate)
  if(fa) el('path',{d:loopsPath(fa),fill:'none',stroke:'#4B5057','stroke-width':0.8,'stroke-dasharray':'6 3','fill-rule':'evenodd'},svg);
  // grids and dimensions
  if(PLAN.grid&&!tiny){ const e=floorExtT(f), LT=(tx,ty)=>{ const w=fromT(tx,ty); return px(w.x,w.y); }; const ext=5.5, br=9; const gl={stroke:'#8A8F96','stroke-width':0.6,'stroke-dasharray':'14 3 2 3'}; const txt=(p,s,size)=>{ const t=el('text',{x:p[0].toFixed(1),y:(p[1]+3.5).toFixed(1),'text-anchor':'middle','font-size':size||10,fill:ink,'font-family':'var(--font-m),monospace',stroke:'#fff','stroke-width':3,'paint-order':'stroke'},svg); t.textContent=s; return t; };
    const bubble=(p,s)=>{ el('circle',{cx:p[0].toFixed(1),cy:p[1].toFixed(1),r:br,fill:'#fff',stroke:ink,'stroke-width':0.9},svg); const t=el('text',{x:p[0].toFixed(1),y:(p[1]+3.5).toFixed(1),'text-anchor':'middle','font-size':10,'font-weight':600,fill:ink,'font-family':'var(--font-m),monospace'},svg); t.textContent=s; };
    const away=(p,q,dist)=>{ const dx=p[0]-q[0], dy=p[1]-q[1], L=Math.hypot(dx,dy)||1; return [p[0]+dx/L*dist,p[1]+dy/L*dist]; };
    const GS=PLAN.gridSel; const gline=(a,b,key,lab)=>{ const on=GS&&GS.key===key; el('line',{x1:a[0].toFixed(1),y1:a[1].toFixed(1),x2:b[0].toFixed(1),y2:b[1].toFixed(1),...gl,...(on?{stroke:'#E8692B','stroke-width':1.6,'stroke-dasharray':'14 3 2 3'}:{})},svg);
      const hl=el('line',{x1:a[0].toFixed(1),y1:a[1].toFixed(1),x2:b[0].toFixed(1),y2:b[1].toFixed(1),stroke:'transparent','stroke-width':10,'data-grid':key,style:'pointer-events:stroke;cursor:'+(key[0]==='x'?'ew-resize':'ns-resize')},svg); hl.appendChild(Object.assign(document.createElementNS(NS,'title'),{textContent:`Grid ${lab}: click to select, drag to move, Delete to remove`}));
      const p=away(b,a,br); bubble(p,lab); if(on) el('circle',{cx:p[0].toFixed(1),cy:p[1].toFixed(1),r:br+2.5,fill:'none',stroke:'#E8692B','stroke-width':2},svg); el('circle',{cx:p[0].toFixed(1),cy:p[1].toFixed(1),r:br+2,fill:'transparent','data-grid':key,style:'pointer-events:all;cursor:pointer'},svg); };
    TG.X.forEach((x,i)=>gline(LT(x,e.y0-ext),LT(x,e.y1+ext),'x:'+TG.idsX[i],TG.labX[i]));
    TG.Y.forEach((y,j)=>gline(LT(e.x1+ext,y),LT(e.x0-ext,y),'y:'+TG.idsY[j],TG.labY[j]));
    if(PLAN.addGrid&&PLAN.hoverT){ const v=PLAN.addGrid==='x'?PLAN.hoverT.x:PLAN.hoverT.y; const a=PLAN.addGrid==='x'?LT(v,e.y0-ext):LT(e.x1+ext,v), b=PLAN.addGrid==='x'?LT(v,e.y1+ext):LT(e.x0-ext,v); el('line',{x1:a[0].toFixed(1),y1:a[1].toFixed(1),x2:b[0].toFixed(1),y2:b[1].toFixed(1),stroke:'#E8692B','stroke-width':1.4,'stroke-dasharray':'6 4'},svg); }
    const dim=(A,B,off,label)=>{ const a=LT(A[0],A[1]), b=LT(B[0],B[1]); el('line',{x1:a[0].toFixed(1),y1:a[1].toFixed(1),x2:b[0].toFixed(1),y2:b[1].toFixed(1),stroke:ink,'stroke-width':0.6},svg);
      const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1, ux=dx/L, uy=dy/L; for(const p of [a,b]) el('line',{x1:(p[0]-(ux-uy)*3).toFixed(1),y1:(p[1]-(uy+ux)*3).toFixed(1),x2:(p[0]+(ux-uy)*3).toFixed(1),y2:(p[1]+(uy+ux)*3).toFixed(1),stroke:ink,'stroke-width':1},svg);
      if(L>34) txt([(a[0]+b[0])/2-uy*off,(a[1]+b[1])/2+ux*off],label,9.5); };
    const yd=e.y0-2.6, yo=e.y0-4.4, xd=e.x1+2.6, xo=e.x1+4.4;
    for(let i=0;i+1<TG.X.length;i++) dim([TG.X[i],yd],[TG.X[i+1],yd],-8,(TG.X[i+1]-TG.X[i]).toFixed(2)); dim([e.x0,yo],[e.x1,yo],-8,(e.x1-e.x0).toFixed(2));
    for(let j=0;j+1<TG.Y.length;j++) dim([xd,TG.Y[j]],[xd,TG.Y[j+1]],-8,(TG.Y[j+1]-TG.Y[j]).toFixed(2)); dim([xo,e.y0],[xo,e.y1],-8,(e.y1-e.y0).toFixed(2));
  }
  // room tag on the deepest side of the core
  if(!tiny){ const CR0=coreRectsOf(f)[0]||{x0:cl.x,x1:cl.x,y0:cl.y,y1:cl.y}; const ccx=(CR0.x0+CR0.x1)/2, ccy=(CR0.y0+CR0.y1)/2, hx=(CR0.x1-CR0.x0)/2, hy=(CR0.y1-CR0.y0)/2; const sides=[[1,0,bx1-CR0.x1,hx],[-1,0,CR0.x0-bx0,hx],[0,1,by1-CR0.y1,hy],[0,-1,CR0.y0-by0,hy]].sort((a,b)=>b[2]-a[2]); const sd=sides[0]; const tx=ccx+sd[0]*(sd[3]+sd[2]/2), ty=ccy+sd[1]*(sd[3]+sd[2]/2);
    if(inside(tx,ty)){ let p=Lw(f,tx,ty); if(clip.kind==='v'){ const G=secGeom(), w=LAB.toWorld(f,tx,ty); const dd=(w.x-G.p0.x)*G.L.x+(w.y-G.p0.y)*G.L.y; if(Math.abs(dd)<3.5){ const sh=(dd>=0?1:-1)*(3.5-Math.abs(dd)); p=px(w.x+G.L.x*sh,w.y+G.L.y*sh); } } const gross=f.area||(f.mask?f.mask.cells.reduce((a,b)=>a+b,0):0); const pr=LAB.PROG&&LAB.PROG[f.prog]; const bp=below&&LAB.S.belowProg&&LAB.PROG[LAB.S.belowProg[f.bi]]; const nm=below?(bp?bp.name.toUpperCase():'BASEMENT'):((pr&&pr.name)||'FLOOR').toUpperCase(); const t1=el('text',{x:p[0].toFixed(1),y:(p[1]-2).toFixed(1),'text-anchor':'middle','font-size':11,'font-weight':600,'letter-spacing':'0.06em',fill:ink,'font-family':'var(--font-b),sans-serif',stroke:'#fff','stroke-width':3,'paint-order':'stroke'},svg); t1.textContent=nm;
      const t2=el('text',{x:p[0].toFixed(1),y:(p[1]+12).toFixed(1),'text-anchor':'middle','font-size':10,fill:'#5F646B','font-family':'var(--font-m),monospace',stroke:'#fff','stroke-width':3,'paint-order':'stroke'},svg); t2.textContent=`${Math.round(gross).toLocaleString()} m² gross`; } }
  // the section line, A–A: drag the line to move it, drag an end dot to turn it, click a bubble to flip, double-click it to open the section; Draw a cut sketches a new one
  if(clip.kind==='v'){ const G=secGeom(); const Rr=Math.max(bx1-bx0,by1-by0)*0.5+Math.abs(clip.off)+9; const a=px(G.p0.x-G.r.x*Rr,G.p0.y-G.r.y*Rr), b=px(G.p0.x+G.r.x*Rr,G.p0.y+G.r.y*Rr); const live={'pointer-events':'auto'};
    el('line',{x1:a[0].toFixed(1),y1:a[1].toFixed(1),x2:b[0].toFixed(1),y2:b[1].toFixed(1),stroke:ink,'stroke-width':0.8,'stroke-dasharray':'16 3 3 3'},svg);
    el('line',{x1:a[0].toFixed(1),y1:a[1].toFixed(1),x2:b[0].toFixed(1),y2:b[1].toFixed(1),stroke:'transparent','stroke-width':14,'data-sec':'line',style:'pointer-events:stroke;cursor:move'},svg);
    const dpx=Math.max(24,2.2*k), Lx=G.L.x*dpx, Ly=-G.L.y*dpx; [[a,'endL'],[b,'endR']].forEach(([p,part])=>{ const tip=[p[0]+Lx,p[1]+Ly]; el('line',{x1:p[0].toFixed(1),y1:p[1].toFixed(1),x2:tip[0].toFixed(1),y2:tip[1].toFixed(1),stroke:ink,'stroke-width':1.6},svg);
      const g=el('g',{'data-sec':'flip',style:'pointer-events:auto;cursor:pointer'},svg); el('circle',{cx:tip[0].toFixed(1),cy:tip[1].toFixed(1),r:9,fill:ink},g); const t=el('text',{x:tip[0].toFixed(1),y:(tip[1]+3.5).toFixed(1),'text-anchor':'middle','font-size':10,'font-weight':700,fill:'#fff'},g); t.textContent='A'; const ti=el('title',{},g); ti.textContent='Click to look the other way · double-click to open the section';
      el('circle',{cx:p[0].toFixed(1),cy:p[1].toFixed(1),r:5.5,fill:'#fff',stroke:'#E8692B','stroke-width':2,'data-sec':part,style:'pointer-events:auto;cursor:grab'},svg); }); }
  if(secDrag&&secDrag.part==='draw'&&secDrag.b){ const A=px(secDrag.a.x,secDrag.a.y), B=px(secDrag.b.x,secDrag.b.y); el('line',{x1:A[0].toFixed(1),y1:A[1].toFixed(1),x2:B[0].toFixed(1),y2:B[1].toFixed(1),stroke:'#E8692B','stroke-width':2,'stroke-dasharray':'10 3 2 3'},svg); }
  SHEET.pb={O,ax,ay};
  // north arrow
  { const nx=W-42, ny=H-150; el('circle',{cx:nx,cy:ny,r:16,fill:'#fff',stroke:ink,'stroke-width':0.9},svg); el('path',{d:`M${nx} ${ny-13} L${nx+6} ${ny+8} L${nx} ${ny+3} L${nx-6} ${ny+8} Z`,fill:ink},svg); const t=el('text',{x:nx,y:ny-20,'text-anchor':'middle','font-size':10,'font-weight':700,fill:ink},svg); t.textContent='N'; }
  for(const fn of colHits) fn();
  return k; }
/* editing the section cut on the plan: the handles live in the drawing, so the listeners sit on the viewport */
let secDrag=null;
function cutFromLine(A,B){ const dx=B.x-A.x, dy=B.y-A.y; if(Math.hypot(dx,dy)<2) return false; const th=Math.atan2(dy,dx); const d={x:Math.sin(th),y:-Math.cos(th)}, S=LAB.S; Object.assign(clip,{kind:'v',ang:th,flip:false,off:Math.round(((A.x-S.posX)*d.x+(A.y-S.posY)*d.y)*10)/10}); return true; }
function cutEdit(p,live){ Object.assign(clip,p,{kind:'v'}); if(view.section){ const o=LAB.orbit; o.theta=clip.ang+(clip.flip?Math.PI:0); o.phi=Math.PI/2; } if(!live) SHEET.key=null; LAB.requestRender(); }
(function planSecEdit(){ const vp=document.getElementById('viewport');
  const toPlan=e=>{ const pb=SHEET.pb, cr=LAB.renderer.domElement.getBoundingClientRect(); if(!pb) return null; const sx=e.clientX-cr.left-pb.O[0], sy=e.clientY-cr.top-pb.O[1]; const det=pb.ax[0]*pb.ay[1]-pb.ax[1]*pb.ay[0]; if(Math.abs(det)<1e-9) return null; return {x:(sx*pb.ay[1]-sy*pb.ay[0])/det,y:(pb.ax[0]*sy-pb.ax[1]*sx)/det}; };
  vp.addEventListener('pointerdown',e=>{ if(!planActive()||e.button!==0) return; if(e.target.closest&&e.target.closest('.viewtools,.clip-panel,.keyplan,.secprog,.abar,.mass-hint')) return; const t=e.target.closest&&e.target.closest('[data-sec]'); const p=toPlan(e); if(!p) return;
    const gEl=e.target.closest&&e.target.closest('[data-grid]');
    if(PLAN.addGrid&&!PLAN.drawCut){ e.stopImmediatePropagation(); e.preventDefault(); vp.setPointerCapture(e.pointerId); const G=gridToCustom(), ax=PLAN.addGrid, t=toT(p.x,p.y); const v=+(ax==='x'?t.x:t.y).toFixed(1); const id=gridNewId(G,ax); (ax==='x'?G.lx:G.ly).push({id,v}); PLAN.gridSel={key:ax+':'+id}; PLAN.addGrid=null; PLAN.hoverT=null; GRIDV++; SHEET.key=null; secDrag={id:e.pointerId,part:'grid',key:ax+':'+id,x:e.clientX,y:e.clientY,moved:true}; syncGridUI(); LAB.requestRender(); return; }
    if(gEl&&!PLAN.drawCut){ e.stopImmediatePropagation(); e.preventDefault(); vp.setPointerCapture(e.pointerId); PLAN.gridSel={key:gEl.dataset.grid}; secDrag={id:e.pointerId,part:'grid',key:gEl.dataset.grid,x:e.clientX,y:e.clientY,moved:false}; syncGridUI(); LAB.requestRender(); return; }
    const colEl=e.target.closest&&e.target.closest('[data-col]'); if(colEl&&!PLAN.drawCut){ e.stopImmediatePropagation(); e.preventDefault(); vp.setPointerCapture(e.pointerId); secDrag={id:e.pointerId,part:'col',col:colEl.dataset.col,off:colEl.dataset.off||null,shift:e.shiftKey,x:e.clientX,y:e.clientY,moved:false}; return; }
    if(!t&&!PLAN.drawCut) return; e.stopImmediatePropagation(); e.preventDefault(); vp.setPointerCapture(e.pointerId);
    secDrag={id:e.pointerId,part:t?t.dataset.sec:'draw',a:p,b:null,x:e.clientX,y:e.clientY,moved:false}; },true);
  vp.addEventListener('pointermove',e=>{ if(!secDrag||e.pointerId!==secDrag.id) return; e.stopImmediatePropagation(); secDrag.moved=secDrag.moved||Math.hypot(e.clientX-secDrag.x,e.clientY-secDrag.y)>3; if(secDrag.part==='col'||!secDrag.moved) return; const p=toPlan(e); if(!p) return;
    if(secDrag.part==='grid'){ const G=gridToCustom(), [ax,id]=secDrag.key.split(':'); const L=(ax==='x'?G.lx:G.ly).find(l=>l.id===id); if(!L) return; const t=toT(p.x,p.y); let v=ax==='x'?t.x:t.y; v=e.altKey?Math.round(v*100)/100:(e.shiftKey?Math.round(v):Math.round(v*10)/10); L.v=v; GRIDV++; SHEET.key=null; syncGridUI(); LAB.requestRender(); return; } const G=secGeom(), S=LAB.S;
    if(secDrag.part==='draw'){ secDrag.b=p; LAB.requestRender(); return; }
    if(secDrag.part==='line'){ const off=(p.x-S.posX)*G.d.x+(p.y-S.posY)*G.d.y; cutEdit({off:e.altKey?Math.round(off*10)/10:Math.round(off*2)/2},true); }
    else if(secDrag.part==='endL'||secDrag.part==='endR'){ let a=Math.atan2(p.y-G.p0.y,p.x-G.p0.x)+(secDrag.part==='endL'?Math.PI:0); if(!e.altKey) a=Math.round(a/(Math.PI/36))*(Math.PI/36); const fl=clip.flip; const th=a-(fl?Math.PI:0); const d={x:Math.sin(th),y:-Math.cos(th)}; cutEdit({ang:th,off:(G.p0.x-S.posX)*d.x+(G.p0.y-S.posY)*d.y},true); } },true);
  const end=e=>{ if(!secDrag||e.pointerId!==secDrag.id) return; const d=secDrag; secDrag=null; e.stopImmediatePropagation(); try{ vp.releasePointerCapture(e.pointerId); }catch(x){}
    if(d.part==='col'){ if(!d.moved) toggleCol(d.col,d.off,d.shift); return; }
    if(d.part==='grid'){ persist(); syncGridUI(); LAB.requestRender(); return; }
    if(d.part==='draw'){ if(d.b&&cutFromLine(d.a,d.b)){ PLAN.drawCut=false; syncDrawBtn(); } }
    else if(d.part==='flip'&&!d.moved) cutEdit({flip:!clip.flip});
    SHEET.key=null; LAB.requestRender(); };
  vp.addEventListener('pointerup',end,true); vp.addEventListener('pointercancel',end,true);
  vp.addEventListener('pointermove',e=>{ if(!PLAN.addGrid||secDrag||!planActive()) return; const p=toPlan(e); if(!p) return; PLAN.hoverT=toT(p.x,p.y); LAB.requestRender(); });
  window.addEventListener('keydown',e=>{ if(!planActive()) return; const t=e.target; if(t&&(t.tagName==='INPUT'||t.tagName==='SELECT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if(e.key==='Escape'&&(PLAN.addGrid||PLAN.gridSel)){ PLAN.addGrid=null; PLAN.hoverT=null; PLAN.gridSel=null; syncGridUI(); LAB.requestRender(); return; }
    if((e.key==='Delete'||e.key==='Backspace')&&PLAN.gridSel){ e.preventDefault(); gridDelete(); } });
  vp.addEventListener('dblclick',e=>{ if(!planActive()) return; const t=e.target.closest&&e.target.closest('[data-sec="flip"]'); if(!t) return; e.stopPropagation(); openSection(); });
})();
function syncDrawBtn(){ const b=document.getElementById('pp-draw'); if(b){ b.setAttribute('aria-pressed',String(!!PLAN.drawCut)); b.innerHTML=ICO.cut+(PLAN.drawCut?'Drag on plan':'Draw cut'); } const v=document.getElementById('viewport'); if(v) v.classList.toggle('drawing-cut',!!PLAN.drawCut); }
function openSection(){ setClip({on:true,kind:'v'}); SHEET.key=null; setViewMode(true,true,clip.ang+(clip.flip?Math.PI:0),Math.PI/2); }
/* pick floors straight in the section: click one, drag over several, Shift-click a range, Ctrl-click to add; the program bar assigns */
let floorSel=null;
function secFloorAt(e){ const sb=SHEET.sb; if(!sb||!view.section) return null; const cr=LAB.renderer.domElement.getBoundingClientRect(); const px=e.clientX-cr.left, py=e.clientY-cr.top; const u=(px-sb.O[0])/sb.kx, y=(py-sb.O[1])/sb.ky;
  const {rows}=sectionCut(); belowSorted(); for(const q of rows){ const f=q.f; if(y<f.z||y>=f.z+f.h) continue; if(!q.cut.some(([a,b])=>u>=a-0.6&&u<=b+0.6)) continue; return q.below?'b:'+f.bi:'a:'+f.i; } return null; }
(function secFloorPick(){ const vp=document.getElementById('viewport');
  vp.addEventListener('pointerdown',e=>{ if(!(view.ortho&&view.section)||e.button!==0||!LAB.program) return; if(e.target.closest&&e.target.closest('.viewtools,.clip-panel,.keyplan,.secprog,.abar,.mass-hint')) return; const k=secFloorAt(e); if(!k) return;
    e.stopImmediatePropagation(); e.preventDefault(); vp.setPointerCapture(e.pointerId); const mode=e.shiftKey?'range':(e.ctrlKey||e.metaKey)?'toggle':'new'; floorSel={id:e.pointerId,anchor:k,mode,base:new Set(LAB.program.sel),x:e.clientX,y:e.clientY,moved:false}; LAB.program.pick(k,mode); },true);
  vp.addEventListener('pointermove',e=>{ if(!floorSel||e.pointerId!==floorSel.id) return; e.stopImmediatePropagation(); if(!floorSel.moved&&Math.hypot(e.clientX-floorSel.x,e.clientY-floorSel.y)<5) return; floorSel.moved=true; const k=secFloorAt(e); if(k&&k!==floorSel.last){ floorSel.last=k; LAB.program.pickRange(floorSel.anchor,k,floorSel.mode!=='new',floorSel.base); } },true);
  const end=e=>{ if(!floorSel||e.pointerId!==floorSel.id) return; floorSel=null; e.stopImmediatePropagation(); try{ vp.releasePointerCapture(e.pointerId); }catch(x){} };
  vp.addEventListener('pointerup',end,true); vp.addEventListener('pointercancel',end,true);
  vp.addEventListener('pointermove',e=>{ if(floorSel||e.buttons||!(view.ortho&&view.section)) return; const k=secFloorAt(e); vp.classList.toggle('floor-hover',!!k); });
})();
/* key plan: the cut line on a small plan of the parcel and the footprint; drag the line to move it, drag an end to turn it, click an arrow to look the other way */
let kpDrag=null;
function kpFrame(){ const S=LAB.S, F=LAB.floors||[]; let E=50; for(const f of F) E=Math.max(E,Math.hypot(f.w||0,f.d||0)*0.75+Math.hypot(f.cx-S.posX,f.cy-S.posY)); E=Math.max(E,Math.abs(clip.off)+12); return {cx:S.posX,cy:S.posY,E:Math.min(E,400),W:210}; }
function drawKeyPlan(){ let K=document.getElementById('keyplan'); const vp=$('viewport');
  if(!K){ K=document.createElement('div'); K.id='keyplan'; K.className='keyplan'; K.innerHTML=`<div class="kp-head"><b>Section A–A</b><span id="kp-dir"></span></div><svg id="kp-svg" width="210" height="210" viewBox="0 0 210 210" role="img" aria-label="Key plan with the section line"><title>Drag the line to move the cut, drag a dot to turn it, click an arrow to flip it, drag across an empty spot to draw a new cut</title></svg><div class="kp-acts"><button type="button" id="kp-flip" title="Look the other way">${ICO.flip}Flip</button><button type="button" data-kp="ns" title="Cut east–west, looking north">E–W</button><button type="button" data-kp="ew" title="Cut north–south, looking east">N–S</button></div>`; vp.appendChild(K);
    K.addEventListener('pointerdown',e=>e.stopPropagation()); K.addEventListener('wheel',e=>e.stopPropagation());
    $('kp-flip').onclick=()=>sectionSet({flip:!clip.flip});
    K.querySelectorAll('[data-kp]').forEach(b=>b.onclick=()=>sectionSet(b.dataset.kp==='ns'?{ang:0,flip:false,off:0}:{ang:-Math.PI/2,flip:false,off:0}));
    const sv=$('kp-svg'); const toPlan=e=>{ const F=kpFrame(), rc=sv.getBoundingClientRect(), k=(F.W/2)/F.E; const px=(e.clientX-rc.left)*F.W/rc.width, py=(e.clientY-rc.top)*F.W/rc.height; return {x:F.cx+(px-F.W/2)/k,y:F.cy-(py-F.W/2)/k}; };
    sv.addEventListener('pointerdown',e=>{ const t=e.target.closest('[data-kpart]'); if(!t){ sv.setPointerCapture(e.pointerId); kpDrag={part:'draw',id:e.pointerId,a:toPlan(e)}; e.preventDefault(); return; } const part=t.dataset.kpart; if(part==='arrow'){ sectionSet({flip:!clip.flip}); return; } sv.setPointerCapture(e.pointerId); kpDrag={part,id:e.pointerId}; e.preventDefault(); });
    sv.addEventListener('pointermove',e=>{ if(!kpDrag||e.pointerId!==kpDrag.id) return; const p=toPlan(e), G=secGeom(), S=LAB.S;
      if(kpDrag.part==='draw'){ kpDrag.b=p; const F=kpFrame(), kk=(F.W/2)/F.E, X=x=>(F.W/2+(x-F.cx)*kk), Y=y=>(F.W/2-(y-F.cy)*kk); let pv=document.getElementById('kp-preview'); if(!pv){ pv=document.createElementNS(NS,'line'); pv.id='kp-preview'; pv.setAttribute('stroke','#E8692B'); pv.setAttribute('stroke-width','2'); pv.setAttribute('stroke-dasharray','8 3'); sv.appendChild(pv); } pv.setAttribute('x1',X(kpDrag.a.x)); pv.setAttribute('y1',Y(kpDrag.a.y)); pv.setAttribute('x2',X(p.x)); pv.setAttribute('y2',Y(p.y)); return; }
      if(kpDrag.part==='line'){ const off=(p.x-S.posX)*G.d.x+(p.y-S.posY)*G.d.y; sectionSet({off:e.altKey?Math.round(off*10)/10:Math.round(off*2)/2},true); }
      else { let a=Math.atan2(p.y-G.p0.y,p.x-G.p0.x)+(kpDrag.part==='endL'?Math.PI:0); if(!e.altKey) a=Math.round(a/(Math.PI/36))*(Math.PI/36); const d={x:Math.sin(a),y:-Math.cos(a)}; const off=(G.p0.x-S.posX)*d.x+(G.p0.y-S.posY)*d.y; sectionSet({ang:a,flip:false,off},true); } });
    const end=e=>{ if(kpDrag&&e.pointerId===kpDrag.id){ const d=kpDrag; kpDrag=null; if(d.part==='draw'&&d.b&&cutFromLine(d.a,d.b)){ sectionSet({}); } SHEET.key=null; LAB.requestRender(); } }; sv.addEventListener('pointerup',end); sv.addEventListener('pointercancel',end);
  }
  K.hidden=false; const F=kpFrame(), k=(F.W/2)/F.E, X=x=>(F.W/2+(x-F.cx)*k).toFixed(1), Y=y=>(F.W/2-(y-F.cy)*k).toFixed(1);
  const G=secGeom(), S=LAB.S; let h='';
  const site=LAB.site&&LAB.site.site; if(site&&site.polygon&&site.polygon.length) h+=`<polygon points="${site.polygon.map(q=>X(q[0])+','+Y(q[1])).join(' ')}" fill="none" stroke="#9AA0A6" stroke-width="1" stroke-dasharray="4 3"/>`;
  const runsPoly=(f,fill,stroke,dash)=>{ const m=f.mask; if(!m) return ''; let s=''; for(let iy=0;iy<m.ny;iy++){ let ix=0; while(ix<m.nx){ if(!m.cells[iy*m.nx+ix]){ ix++; continue; } let j=ix; while(j+1<m.nx&&m.cells[iy*m.nx+j+1]) j++; const c=[[m.x0+ix,m.y0+iy],[m.x0+j+1,m.y0+iy],[m.x0+j+1,m.y0+iy+1],[m.x0+ix,m.y0+iy+1]].map(q=>LAB.toWorld(f,q[0],q[1])); s+=`<polygon points="${c.map(q=>X(q.x)+','+Y(q.y)).join(' ')}" fill="${fill}" stroke="${fill}" stroke-width="0.6"/>`; ix=j+1; } } return s; };
  const B=belowSorted(), Fl=LAB.floors||[]; if(B.length) h+=`<g opacity=".55">${runsPoly(B[B.length-1],'#B9A27E')}</g>`; if(Fl.length) h+=runsPoly(Fl[0],'#5B6169'); if(Fl.length) for(const r of coreRectsOf(Fl[0])){ const c=[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]].map(q=>LAB.toWorld(Fl[0],q[0],q[1])); h+=`<polygon points="${c.map(q=>X(q.x)+','+Y(q.y)).join(' ')}" fill="#fff" stroke="#1F2227" stroke-width="1.4"/><text x="${X((c[0].x+c[2].x)/2)}" y="${(+Y((c[0].y+c[2].y)/2)+3).toFixed(1)}" text-anchor="middle" font-size="8" fill="#1F2227">core</text>`; } const mid=Fl[Math.floor(Fl.length/2)]; if(mid&&mid!==Fl[0]) h+=`<g opacity=".35">${runsPoly(mid,'#2E3338')}</g>`;
  const R=F.E*1.6, a={x:G.p0.x-G.r.x*R,y:G.p0.y-G.r.y*R}, b={x:G.p0.x+G.r.x*R,y:G.p0.y+G.r.y*R}; const eL={x:G.p0.x-G.r.x*F.E*0.82,y:G.p0.y-G.r.y*F.E*0.82}, eR={x:G.p0.x+G.r.x*F.E*0.82,y:G.p0.y+G.r.y*F.E*0.82};
  h+=`<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="#E8692B" stroke-width="1.6" stroke-dasharray="10 3 2 3"/>`;
  h+=`<line data-kpart="line" x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="transparent" stroke-width="14" style="cursor:move"/>`;
  const al=F.E*0.16; for(const [e,part] of [[eL,'endL'],[eR,'endR']]){ const tip={x:e.x+G.L.x*al,y:e.y+G.L.y*al};
    h+=`<g data-kpart="arrow" style="cursor:pointer"><line x1="${X(e.x)}" y1="${Y(e.y)}" x2="${X(tip.x)}" y2="${Y(tip.y)}" stroke="#E8692B" stroke-width="2"/><circle cx="${X(tip.x)}" cy="${Y(tip.y)}" r="8" fill="#E8692B"/><text x="${X(tip.x)}" y="${(+Y(tip.y)+3.5).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">A</text></g>`;
    h+=`<circle data-kpart="${part}" cx="${X(e.x)}" cy="${Y(e.y)}" r="5.5" fill="#fff" stroke="#E8692B" stroke-width="2" style="cursor:grab"/>`; }
  h+=`<g transform="translate(192 22)"><path d="M0 -12 L5 4 L0 1 L-5 4 Z" fill="#1F2227"/><text y="15" text-anchor="middle" font-size="9" fill="#1F2227">N</text></g>`;
  $('kp-svg').innerHTML=h;
  const deg=((G.th*180/Math.PI)%360+360)%360; const look=Math.atan2(G.L.y,G.L.x)*180/Math.PI; const lk=((90-look)%360+360)%360; const nm=['north','north-east','east','south-east','south','south-west','west','north-west'][Math.round(lk/45)%8];
  $('kp-dir').textContent=`looking ${nm} · ${clip.off>0?'+':''}${clip.off.toFixed(1)} m`; }
function sectionSet(p,live){ Object.assign(clip,p,{on:true,kind:'v'}); const o=LAB.orbit; o.theta=clip.ang+(clip.flip?Math.PI:0); o.phi=Math.PI/2; if(!live) SHEET.key=null; syncClipUI(); syncViewButtons(); LAB.requestRender(); }
/* ---------- level of detail: fused massing blocks in Basic; floors and a façade built from the strategy zones in Advanced; uploaded files as modeled ---------- */
const advGroup=new THREE.Group(), lodGroup=new THREE.Group(), dressGroup=new THREE.Group(); LAB.scene.add(advGroup); LAB.scene.add(lodGroup); LAB.scene.add(dressGroup); let advVersion=-1;
const mkMat=c=>new THREE.MeshLambertMaterial({color:c,side:THREE.DoubleSide});
const MAT={tower:mkMat(0x9aa3ad),spandrel:mkMat(0x8f99a4),glass:mkMat(0x6e9cc4),shade:mkMat(0xd9a441),pv:mkMat(0x1f3a5f),green:mkMat(0x5e8f5a)};
function applyColors(){ const v=(k,d)=>cssVar(k)||d; MAT.tower.color.set(v('--mass','#9aa3ad')); MAT.spandrel.color.set(v('--spandrel','#8f99a4')); MAT.glass.color.set(v('--glass','#6e9cc4')); MAT.shade.color.set(v('--shade-dev','#d9a441')); MAT.pv.color.set(v('--pv','#1f3a5f')); MAT.green.color.set(v('--green','#5e8f5a')); }
/* the part colours of the model check, so the imported model reads the same after import */
const PART_MATS={};
function partColorMat(cat){ if(PART_MATS[cat]) return PART_MATS[cat]; const C=(LAB.parts&&LAB.parts.CATS)||[]; const row=C.find(c=>c[0]===cat); const col=row?row[2]:'#A9B2BC';
  const m=new THREE.MeshLambertMaterial({color:new THREE.Color(col),side:THREE.DoubleSide}); if(cat==='window'){ m.transparent=true; m.opacity=0.6; m.depthWrite=false; } return PART_MATS[cat]=m; }
function useRaw(){ return !!LAB.uploadRaw&&SW.show.raw&&LAB.S.typology==='upload'; }
function meshArea(list){ let A=0; for(const m of list) for(let i=0;i<m.f.length;i+=3){ const a=m.f[i]*3,b=m.f[i+1]*3,c=m.f[i+2]*3; const ux=m.v[b]-m.v[a],uy=m.v[b+1]-m.v[a+1],uz=m.v[b+2]-m.v[a+2],vx=m.v[c]-m.v[a],vy=m.v[c+1]-m.v[a+1],vz=m.v[c+2]-m.v[a+2]; A+=0.5*Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx); } return A; }
function clearGroup(g){ while(g.children.length){ const o=g.children.pop(); if(o.geometry) o.geometry.dispose(); } }
/* many boxes in one geometry: plan-aligned boxes (su along plan x, sv along plan y, sw up) rotated by rot about their centre, baked into three coordinates */
class Batch{ constructor(){ this.p=[]; this.n=[]; }
  box(cx,cy,zc,su,sv,sw,rot){ const a=su/2,b=sv/2,h=sw/2,c=Math.cos(rot),s=Math.sin(rot); const P=this.p,N=this.n;
    const push=(u,v,w,nu,nv,nw)=>{ const xr=u*c-v*s, yr=u*s+v*c; P.push(cx+xr,zc+w,-(cy+yr)); const nx=nu*c-nv*s, ny=nu*s+nv*c; N.push(nx,nw,-ny); };
    const quad=(p0,p1,p2,p3,n)=>{ for(const q of [p0,p1,p2,p0,p2,p3]) push(q[0],q[1],q[2],n[0],n[1],n[2]); };
    quad([a,-b,-h],[a,b,-h],[a,b,h],[a,-b,h],[1,0,0]); quad([-a,b,-h],[-a,-b,-h],[-a,-b,h],[-a,b,h],[-1,0,0]);
    quad([a,b,-h],[-a,b,-h],[-a,b,h],[a,b,h],[0,1,0]); quad([-a,-b,-h],[a,-b,-h],[a,-b,h],[-a,-b,h],[0,-1,0]);
    quad([-a,-b,h],[a,-b,h],[a,b,h],[-a,b,h],[0,0,1]); quad([-a,b,-h],[a,b,-h],[a,-b,-h],[-a,-b,-h],[0,0,-1]); }
  mesh(mat,ud){ if(!this.p.length) return null; const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3)); const m=new THREE.Mesh(g,mat); m.castShadow=true; m.receiveShadow=true; Object.assign(m.userData,ud||{}); return m; } }
/* ---------- basements: floors below the ground level of an uploaded model, drawn as a translucent stack under the site ---------- */
const belowGroup=new THREE.Group(); LAB.scene.add(belowGroup); const BELOW_MAT=new THREE.MeshLambertMaterial({color:new THREE.Color('#8C7A66'),transparent:true,opacity:0.55,depthWrite:false});
function buildBelow(){ clearGroup(belowGroup); const B=(LAB.S.typology==='upload'&&LAB.belowFloors)||[]; const G=LAB.ground;
  if(G&&G.material){ G.material.transparent=B.length>0; G.material.opacity=B.length?0.72:1; G.material.needsUpdate=true; }
  if(!B.length){ LAB.requestRender(); return; } const body=new Batch();
  for(const f of B){ const m=f.mask, hh=f.h-GAP; for(let iy=0;iy<m.ny;iy++){ let ix=0; while(ix<m.nx){ if(!m.cells[iy*m.nx+ix]){ ix++; continue; } let j=ix; while(j+1<m.nx&&m.cells[iy*m.nx+j+1]) j++; const lx=m.x0+(ix+j+1)/2, ly=m.y0+iy+0.5; const p=LAB.toWorld(f,lx,ly); body.box(p.x,p.y,f.z+hh/2,j-ix+1,1,hh,f.rot); ix=j+1; } } }
  const mesh=body.mesh(BELOW_MAT,{below:true}); if(mesh){ mesh.castShadow=false; mesh.receiveShadow=false; mesh.renderOrder=1; belowGroup.add(mesh); } LAB.requestRender(); }
/* model parts review: highlight the pieces of one category over the model */
const partsGroup=new THREE.Group(); partsGroup.renderOrder=6; LAB.scene.add(partsGroup);
function showParts(pieces,color){ clearGroup(partsGroup); const R=LAB.uploadRaw, U=LAB.upload; if(!pieces||!pieces.length||!R){ LAB.requestRender(); return; }
  const mat=new THREE.MeshBasicMaterial({color:new THREE.Color(color||'#C8552D'),transparent:true,opacity:0.85,depthTest:false,side:THREE.DoubleSide}); const S=LAB.S;
  for(const p of pieces){ const pos=new Float32Array(p.f.length*3); for(let i=0;i<p.f.length;i++){ const q=p.f[i]*3; pos[i*3]=p.v[q]-R.cx; pos[i*3+1]=p.v[q+2]-R.minz; pos[i*3+2]=-(p.v[q+1]-R.cy); } const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); const m=new THREE.Mesh(g,mat); m.renderOrder=6; m.userData.deco=true; partsGroup.add(m); }
  partsGroup.position.set(S.posX,-((U&&U.grade)||0),-S.posY); partsGroup.rotation.y=S.rotDeg*Math.PI/180; LAB.requestRender(); }
/* exploded preview of the uploaded model during the parts review: the site, the studied massing and the overlays are hidden,
   every piece is drawn in its part colour at its exploded offset; closing the review restores the view */
let preview=null; const PREV_MAT={}; const DIM_MAT=new THREE.MeshLambertMaterial({color:new THREE.Color('#C9CED4'),transparent:true,opacity:0.3,depthWrite:false});
function partMat(c){ if(!PREV_MAT[c]){ PREV_MAT[c]=new THREE.MeshLambertMaterial({color:new THREE.Color(c),side:THREE.DoubleSide}); } return PREV_MAT[c]; }
function showExploded(items){ clearGroup(partsGroup); const R=LAB.uploadRaw, U=LAB.upload, S=LAB.S;
  if(!items){ if(preview){ for(const [o,v] of preview.vis) o.visible=v; preview=null; syncGeometry(); } partsGroup.visible=false; LAB.requestRender(); return; }
  if(!R) return; const first=!preview;
  if(first){ preview={vis:[]}; for(const o of [lodGroup,dressGroup,advGroup,belowGroup,LAB.towerGroup,LAB.overlayGroup,LAB.waterGroup]){ if(o){ preview.vis.push([o,o.visible]); o.visible=false; } } }
  partsGroup.visible=true;
  const byMat=new Map(); for(const it of items){ const key=it.dim?'dim':it.color; let arr=byMat.get(key); if(!arr){ arr=[]; byMat.set(key,arr); } arr.push(it); }
  for(const [key,list] of byMat){ let n=0; for(const it of list) n+=it.p.f.length; const pos=new Float32Array(n*3); let w=0;
    for(const it of list){ const p=it.p, o=it.off; for(let i=0;i<p.f.length;i++){ const q=p.f[i]*3; pos[w++]=p.v[q]-R.cx+o.dx; pos[w++]=p.v[q+2]-R.minz+o.dz; pos[w++]=-(p.v[q+1]-R.cy+o.dy); } }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.computeVertexNormals(); const m=new THREE.Mesh(g,key==='dim'?DIM_MAT:partMat(key)); m.userData.deco=true; m.renderOrder=key==='dim'?7:6; partsGroup.add(m);
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(g,30),new THREE.LineBasicMaterial({color:key==='dim'?0xB8BFC6:0x24303A,transparent:true,opacity:key==='dim'?0.25:0.55})); edges.userData.deco=true; partsGroup.add(edges); }
  partsGroup.position.set(S.posX,-((U&&U.grade)||0),-S.posY); partsGroup.rotation.y=S.rotDeg*Math.PI/180;
  if(first) framePreview(); LAB.requestRender(); }
function framePreview(){ const b=new THREE.Box3().setFromObject(partsGroup); if(b.isEmpty()) return; const c=b.getCenter(new THREE.Vector3()), sz=b.getSize(new THREE.Vector3()); const o=LAB.orbit; o.target.copy(c); o.theta=0.75; o.phi=1.08; o.dist=Math.max(60,Math.max(sz.x,sz.y,sz.z)*1.6); LAB.requestRender(); }
function applyModelWWR(w){ if(!SW||!w) return; for(const z of SW.zones){ const faces=z.face==='all'?['N','E','S','W']:[z.face]; const vals=faces.map(f=>w[f]).filter(v=>v!=null); if(vals.length) z.wwr=Math.max(0.1,Math.min(0.95,+(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2))); } persist(); try{ syncZoneUI(); }catch(e){} markStaleAll(); }
function markStaleAll(){ if(sunResult) stale.sun=true; if(windResult) stale.wind=true; showStale(); }
function buildAdv(){
  const R=LAB.uploadRaw; if(!R){ advGroup.visible=false; return; }
  const MP=LAB.modelParts, byPart=!!(MP&&MP.pieces&&MP.rawVersion===R.version); const key=R.version+(byPart?':parts':'');
  if(advVersion!==key){
    clearGroup(advGroup);
    const toMesh=(v,f,mat,cat,part)=>{ let g=new THREE.BufferGeometry(); const pos=new Float32Array(v.length); for(let i=0;i<v.length;i+=3){ pos[i]=v[i]-R.cx; pos[i+1]=v[i+2]-R.minz; pos[i+2]=-(v[i+1]-R.cy); }
      g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setIndex(f); g=g.toNonIndexed(); g.computeVertexNormals(); const mesh=new THREE.Mesh(g,mat); mesh.userData.cat=cat; if(part) mesh.userData.part=part; mesh.castShadow=true; mesh.receiveShadow=true; advGroup.add(mesh); };
    if(byPart){ // each checked part in its preview colour; the studies still read it all as the tower
      const groups=new Map(); for(const p of MP.pieces){ let g=groups.get(p.v); if(!g){ g={}; groups.set(p.v,g); } (g[p.cat]||(g[p.cat]=[])).push(...p.f); }
      for(const [v,g] of groups) for(const cat in g){ if(cat==='other') continue; toMesh(v,g[cat],partColorMat(cat),'tower',cat); } }
    else for(const m of R.massing) toMesh(m.v,m.f,MAT.tower,'tower');
    for(const [list,cat] of [[R.shading,'shade'],[R.pv,'pv']]) for(const m of list) toMesh(m.v,m.f,MAT[cat],cat);
    advVersion=key;
  }
  const S=LAB.S; advGroup.position.set(S.posX,-((LAB.upload&&LAB.upload.grade)||0),-S.posY); advGroup.rotation.y=S.rotDeg*Math.PI/180;
}
function sameFloor(a,b){ if(a.w!==b.w||a.d!==b.d||a.h!==b.h||Math.abs(a.ux-b.ux)>1e-6||Math.abs(a.uy-b.uy)>1e-6||Math.abs(a.urot-b.urot)>1e-6) return false; const ma=a.mask,mb=b.mask; if(ma.nx!==mb.nx||ma.ny!==mb.ny) return false; for(let k=0;k<ma.cells.length;k++) if(ma.cells[k]!==mb.cells[k]) return false; return true; }
function buildLOD(){
  clearGroup(lodGroup); clearGroup(dressGroup); const floors=LAB.floors; if(!floors||!floors.length) return;
  const raw=useRaw(), A=adv();
  if(!raw){ const body=new Batch();
    if(!A){ let i=0; while(i<floors.length){ let j=i; while(j+1<floors.length&&sameFloor(floors[i],floors[j+1])) j++; const f=floors[i], z0=f.z, z1=floors[j].z+floors[j].h; for(const rc of f.rects){ const p=LAB.toWorld(f,rc.x,rc.y); body.box(p.x,p.y,(z0+z1)/2,rc.w,rc.d,z1-z0,f.rot); } i=j+1; }
      const m=body.mesh(MAT.tower,{cat:'tower'}); if(m) lodGroup.add(m); }
    else { for(const f of floors){ const hh=f.h-GAP; for(const rc of f.rects){ const p=LAB.toWorld(f,rc.x,rc.y); body.box(p.x,p.y,f.z+hh/2,rc.w,rc.d,hh,f.rot); } }
      const m=body.mesh(MAT.spandrel,{cat:'tower'}); if(m) lodGroup.add(m); } }
  if(A) buildDress(floors,raw);
}
/* the glass band of a floor on one face: it hangs from the modeled window head (or the ceiling) when the plates came from the model,
   otherwise from the top of the floor; the zone's window-to-wall ratio sets the glass height, so the sill drops as the ratio grows */
function band(f,o,z){ const hh=f.h-GAP; let head=hh; if(f.open&&f.open[o]) head=Math.min(hh,Math.max(0.6,f.open[o][1])); else if(f.ceil) head=Math.min(hh,Math.max(1.8,f.ceil)); const gh=Math.max(0.3,Math.min(head,hh*z.wwr)); return {hh,head,gh,sp:Math.max(0,head-gh)}; }
/* outline edges of a floor plate with their world orientation, used for the façade */
function edgesOf(f){ const out=[]; const c=Math.cos(f.rot), s=Math.sin(f.rot); for(const lp of LAB.maskLoops(f)){ const pts=lp.pts, n=pts.length; for(let k=0;k<n;k++){ const a=pts[k], b=pts[(k+1)%n]; const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy); if(L<0.5) continue;
  const ux=dx/L, uy=dy/L, sgn=lp.outer?1:-1, ox=uy*sgn, oy=-ux*sgn; const wx=ox*c-oy*s, wy=ox*s+oy*c; const deg=((Math.atan2(wy,wx)*180/Math.PI)%360+360)%360; const o=deg<45||deg>=315?'E':(deg<135?'N':(deg<225?'W':'S'));
  out.push({L,ux,uy,ox,oy,o,ang:f.rot+Math.atan2(dy,dx),mx:(a[0]+b[0])/2,my:(a[1]+b[1])/2}); } } return out; }
/* façade from the strategy zones: glazing by orientation and level, devices, PV, green walls, double skins, balconies, terrace screens; podium and canopy. Dressing is visual (viz) and hidden from the sun study, whose devices are analytic; podium, canopy and balcony slabs are real mass. */
function buildDress(floors,raw){
  const W=SW.ws, T=LAB.top; const glass=new Batch(), shade=new Batch(), pv=new Batch(), green=new Batch(), solid=new Batch(), slabs=new Batch();
  for(const f of floors){ const hh=f.h-GAP; const lvl=f.i+1;
    for(const e of edgesOf(f)){ const z=zoneFor(e.o,lvl), st=STRATS[z.strat], D=z.depth; const B=band(f,e.o,z), sp=B.sp, gh=B.gh, head=B.head; const L=e.L;
      const at=(uo,vo)=>LAB.toWorld(f,e.mx+e.ux*uo+e.ox*vo,e.my+e.uy*uo+e.oy*vo);
      if(!raw){ if(z.strat==='punched'){ const nW=Math.max(1,Math.floor(L/2.4)), step=L/nW, w=Math.min(1.8,step-0.4); if(w>0.4) for(let i=0;i<nW;i++){ const q=at(-L/2+(i+0.5)*step,0.07); glass.box(q.x,q.y,f.z+sp+gh/2,w,0.12,gh,e.ang); } }
        else { const q=at(0,0.07); glass.box(q.x,q.y,f.z+sp+gh/2,L,0.12,gh,e.ang); }
        if(z.strat==='greenwall'&&sp>0.3){ const q=at(0,0.1); green.box(q.x,q.y,f.z+sp/2,L*0.98,0.1,sp*0.9,e.ang); } }
      if(z.pv>0&&sp>0.2){ const q=at(0,0.12); pv.box(q.x,q.y,f.z+sp/2,L*0.96,0.08,sp*z.pv,e.ang); }
      if(st.device&&D>0&&L>=0.8){
        if(z.strat==='overhang'){ const q=at(0,D/2); shade.box(q.x,q.y,f.z+head+0.08,L+0.2,D,0.15,e.ang); }
        else if(z.strat==='louvres'||z.strat==='eggcrate'){ const nl=Math.floor(gh/0.5); for(let i=0;i<nl;i++){ const q=at(0,D/2); shade.box(q.x,q.y,f.z+sp+(i+0.5)*0.5,L,D,0.05,e.ang); } }
        if(z.strat==='fins'||z.strat==='eggcrate'){ const nf=Math.max(1,Math.floor(L/1.5)), step=L/nf; for(let i=0;i<nf;i++){ const q=at(-L/2+(i+0.5)*step,D/2); shade.box(q.x,q.y,f.z+sp+gh/2,0.1,D,gh,e.ang); } }
        else if(z.strat==='punched'){ const nW=Math.max(1,Math.floor(L/2.4)), step=L/nW, w=Math.min(1.8,step-0.4); if(w>0.4) for(let i=0;i<nW;i++){ const u=-L/2+(i+0.5)*step; let q=at(u,D/2); shade.box(q.x,q.y,f.z+head+0.08,w+0.3,D,0.15,e.ang); for(const sgn of [-1,1]){ q=at(u+sgn*(w/2+0.08),D/2); shade.box(q.x,q.y,f.z+sp+gh/2,0.15,D,gh,e.ang); } } }
        else if(z.strat==='lightshelf'){ const q=at(0,D/2); if(gh>2.3) shade.box(q.x,q.y,f.z+sp+Math.min(2.1,gh-0.3),L,D,0.1,e.ang); else shade.box(q.x,q.y,f.z+head+0.08,L+0.2,D,0.15,e.ang); }
        else if(z.strat==='balcony'){ let q=at(0,D/2); slabs.box(q.x,q.y,f.z+0.1,L+0.1,D,0.2,e.ang); q=at(0,D-0.04); glass.box(q.x,q.y,f.z+0.2+0.55,L+0.1,0.08,1.1,e.ang); } }
      if(z.strat==='doubleskin'&&D>0.2&&L>=0.8){ const q=at(0,D); glass.box(q.x,q.y,f.z+hh/2,L+0.1,0.06,hh-0.1,e.ang); }
      if(st.screen&&f.terrace>30&&T){ const p=at(0,-1.2); const ix=Math.floor(p.x-T.minx), iy=Math.floor(p.y-T.miny); if(ix>=0&&iy>=0&&ix<T.nx&&iy<T.ny&&T.top[iy*T.nx+ix]===f.i){ const q=at(0,-0.1); glass.box(q.x,q.y,f.z+f.h+0.75,L,0.06,1.5,e.ang); } }
    }
    if(SW.pv.roof>0){ const last=f.i===floors.length-1; if(last||f.terrace>30){ const sc=Math.sqrt(SW.pv.roof); for(const rc of f.rects){ const p=LAB.toWorld(f,rc.x,rc.y); let exposed=last; if(!last&&T){ const ix=Math.floor(p.x-T.minx), iy=Math.floor(p.y-T.miny); exposed=ix>=0&&iy>=0&&ix<T.nx&&iy<T.ny&&T.top[iy*T.nx+ix]===f.i; } if(exposed&&rc.w*rc.d>20) pv.box(p.x,p.y,f.z+hh+0.08,rc.w*sc,rc.d*sc,0.12,f.rot); } } }
  }
  const f0=floors[0]; const podium=W.podiumH>0&&W.podiumExt>0;
  if(podium) solid.box(f0.cx,f0.cy,W.podiumH/2,f0.w+2*W.podiumExt,f0.d+2*W.podiumExt,W.podiumH,f0.rot);
  if(W.canopy>0&&!(podium&&W.podiumH>=6)){ const fc=floors.find(x=>x.z+x.h>=6)||f0; const zc=Math.min(6,fc.z+fc.h)-0.15, cd=W.canopy; const bw=podium?f0.w+2*W.podiumExt:fc.w, bd=podium?f0.d+2*W.podiumExt:fc.d;
    for(const [sx,sy,su,sv] of [[1,0,cd,bd+2*cd],[-1,0,cd,bd+2*cd],[0,1,bw,cd],[0,-1,bw,cd]]){ const q=LAB.toWorld(f0,sx*(bw/2+cd/2),sy*(bd/2+cd/2)); solid.box(q.x,q.y,zc,su,sv,0.3,f0.rot); } }
  for(const [b,mat,ud] of [[glass,MAT.glass,{viz:true}],[shade,MAT.shade,{viz:true}],[pv,MAT.pv,{viz:true}],[green,MAT.green,{viz:true}],[slabs,MAT.spandrel,{cat:'tower'}],[solid,MAT.spandrel,{cat:'tower'}]]){ const m=b.mesh(mat,ud); if(m) dressGroup.add(m); }
}
/* street labels lie flat on the ground along their streets instead of floating as billboards; the core's sprites are kept hidden so its sizing code is untouched */
function nearestStreetAngle(x,y){ const site=LAB.site; if(!site||!site.curves) return 0; let best=1e9, ang=0;
  for(const c of site.curves){ if(c.layer!=='curb'&&c.layer!=='block'&&c.layer!=='outline') continue; for(let i=0;i+1<c.pts.length;i++){ const a=c.pts[i], b=c.pts[i+1]; const dx=b[0]-a[0], dy=b[1]-a[1]; const L2=dx*dx+dy*dy; if(L2<4) continue; let t=((x-a[0])*dx+(y-a[1])*dy)/L2; t=Math.max(0,Math.min(1,t)); const px=a[0]+t*dx-x, py=a[1]+t*dy-y; const d=px*px+py*py; if(d<best){ best=d; ang=Math.atan2(dy,dx); } } }
  if(best>60*60) return 0; if(ang>Math.PI/2) ang-=Math.PI; if(ang<=-Math.PI/2) ang+=Math.PI; return ang; }
function flattenLabels(){
  const g=LAB.siteGroup; const old=[]; g.traverse(o=>{ if(o.userData.labelPlane) old.push(o); }); for(const o of old){ g.remove(o); o.geometry.dispose(); }
  const pt=(LAB.S.site&&LAB.S.site.labelPt)||12; const hM=pt*0.42; // label height in metres on the ground
  g.traverse(sp=>{ if(!sp.isSprite||!sp.userData.label) return; sp.visible=false; const L=sp.userData.label; const w=hM*L.w/L.h; const x=sp.position.x, y=-sp.position.z;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,hM),new THREE.MeshBasicMaterial({map:sp.material.map,transparent:true,depthWrite:false})); mesh.userData.labelPlane=true; mesh.renderOrder=3;
    mesh.rotation.x=-Math.PI/2; mesh.rotateOnWorldAxis(new THREE.Vector3(0,1,0),nearestStreetAngle(x,y)); mesh.position.set(x,0.45,-y); g.add(mesh); });
  LAB.requestRender();
}
function syncGeometry(){
  applyColors(); buildAdv(); const raw=useRaw();
  LAB.towerGroup.visible=false; advGroup.visible=raw; for(const o of advGroup.children) o.visible=o.userData.cat==='tower'||adv();
  lodGroup.visible=!raw; buildLOD(); buildBelow(); dressGroup.visible=adv();
  LAB.requestRender();
}
function towerGroups(){ return useRaw()?[advGroup,dressGroup]:[lodGroup,dressGroup]; }

/* ---------- sun study ---------- */
const sunRes={w:DOM.nx,h:DOM.ny}; const ZMAX=330;
let rtTop=null, topCam=null, rtSun=null, sunCam=null, sunResult=null, shadowState=null;
function setSunLight(p){ const d=sunDir(p); LAB.sun.position.set(d.x*1500,Math.max(0.02,d.z)*1500,-d.y*1500); LAB.sun.target.position.set(0,0,0); LAB.sun.target.updateMatrixWorld(); }
function applySunView(){
  const sd=LAB.S.impact.sun, D=DATES[sd.date]; const p=sunPos(D.doy,sd.hour,D.tz);
  const on=LAB.S.impact.mode==='sun';
  LAB.renderer.shadowMap.enabled=on; LAB.sun.castShadow=on;
  if(on&&p.alt>0.01){ setSunLight(p); LAB.sun.intensity=0.35+0.45*Math.sin(p.alt); LAB.hemi.intensity=0.5; }
  else { LAB.sun.position.set(260,520,180); LAB.sun.intensity=0.5; LAB.hemi.intensity=0.7; }
  if(shadowState!==on){ shadowState=on; LAB.scene.traverse(o=>{ if(o.material&&o.material.needsUpdate!==undefined) o.material.needsUpdate=true; }); }
  LAB.requestRender();
  return p;
}
function readRT(rt){ const buf=new Uint8Array(rt.width*rt.height*4); LAB.renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,buf); return buf; }
/* pixel encoding from the sun: R = azimuth of the surface normal, G = its vertical component, B = height above ground, A = category */
function orientOf(r,g){ const ny=g/127.5-1; if(ny>0.7) return 'roof'; if(ny<-0.7) return null; const az=(r/255-0.5)*360; if(az>-45&&az<=45) return 'N'; if(az>45&&az<=135) return 'E'; if(az<=-135||az>135) return 'S'; return 'W'; }
function catOf(a){ return a>=240?'tower':(a>=180&&a<=220?'shade':(a>=130&&a<=170?'pv':null)); }
const NORMAL_VS='varying vec3 vN; varying float vZ; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 wp=modelMatrix*vec4(position,1.0); vZ=wp.y; gl_Position=projectionMatrix*viewMatrix*wp; }';
const NORMAL_FS='uniform float uCat; varying vec3 vN; varying float vZ; void main(){ vec3 n=gl_FrontFacing?vN:-vN; float az=atan(n.x,-n.z)/6.2831853+0.5; gl_FragColor=vec4(az,n.y*0.5+0.5,clamp(vZ/'+ZMAX.toFixed(1)+',0.0,1.0),uCat); }';
const normalMat=c=>new THREE.ShaderMaterial({uniforms:{uCat:{value:c}},vertexShader:NORMAL_VS,fragmentShader:NORMAL_FS,side:THREE.DoubleSide});
/* one representative day: per-cell new-shadow hours (clear sky), façade sunlight, and an hourly record of lit area per category and per floor */
function sunDay(doy,tz,h0,h1,ctx,positions){
  const R=LAB.renderer, N=sunRes.w*sunRes.h; const withT=new Float32Array(N), without=new Float32Array(N); let lostWh=0, towerWh=0, hours=0; const towerBy={}; for(const c of CATS) towerBy[c]=0;
  const {gWhite,white,black,setTower,towerMeshes,siteMeshes,normalMats,zIndex,nF}=ctx; const pxArea=(920/512)*(920/512); const hourly=[];
  const poss=positions||[]; if(!positions) for(let h=h0;h<=h1;h++) poss.push({h,p:sunPos(doy,h,tz)});
  for(const {h,p} of poss){ if(p.alt<0.03) continue; hours++;
    setSunLight(p); const I=dni(p.alt);
    LAB.scene.overrideMaterial=gWhite; gWhite.needsUpdate=true; LAB.ground.material=gWhite; R.shadowMap.enabled=true;
    for(const cfg of [1,0]){ setTower(!!cfg); R.setRenderTarget(rtTop); R.clear(); R.render(LAB.scene,topCam); const buf=readRT(rtTop); const thr=Math.max(20,Math.sin(p.alt)*255*0.45);
      const acc=cfg?withT:without; for(let k=0;k<N;k++){ if(buf[k*4]<thr) acc[k]+=1; } }
    setTower(true); LAB.scene.overrideMaterial=null;
    const d=sunDir(p); sunCam.position.set(d.x*2500,d.z*2500,-d.y*2500); sunCam.lookAt(0,80,0); sunCam.updateProjectionMatrix();
    const swap=(list,mat)=>{ for(const m of list){ if(!m.userData._m) m.userData._m=m.material; m.material=typeof mat==='function'?mat(m):mat; } }; const restore=list=>{ for(const m of list){ if(m.userData._m){ m.material=m.userData._m; delete m.userData._m; } } };
    const count=()=>{ R.setRenderTarget(rtSun); R.clear(); R.render(LAB.scene,sunCam); const b=readRT(rtSun); let c=0; for(let k=0;k<b.length;k+=4) if(b[k]>128) c++; return c; };
    R.shadowMap.enabled=false; LAB.ground.material=black;
    swap(siteMeshes,white); swap(towerMeshes,black); const litWith=count();
    setTower(false); const litWithout=count(); setTower(true);
    swap(siteMeshes,black); restore(towerMeshes); swap(towerMeshes,m=>normalMats[m.userData.cat||'tower']);
    const A={}; for(const c of CATS) A[c]=0; const Az={}; for(const o of ORI) Az[o]=new Float32Array(nF);
    { R.setRenderTarget(rtSun); R.clear(); R.render(LAB.scene,sunCam); const b=readRT(rtSun); for(let k=0;k<b.length;k+=4){ const cat=catOf(b[k+3]); if(!cat) continue; const o=orientOf(b[k],b[k+1]); if(!o) continue; const key=cat==='tower'?o:cat; A[key]+=pxArea; if(cat==='tower'&&o!=='roof'){ const fi=zIndex[b[k+2]]; if(fi>=0) Az[o][fi]+=pxArea; } } }
    for(const c of CATS){ towerBy[c]+=A[c]*I; } towerWh+=(A.N+A.E+A.S+A.W+A.roof)*I;
    restore(siteMeshes); restore(towerMeshes);
    lostWh+=Math.max(0,litWithout-litWith)*pxArea*I;
    hourly.push({h,alt:p.alt,az:p.az*180/Math.PI,I,A,Az});
  }
  const v=new Float32Array(N); for(let k=0;k<N;k++) v[k]=Math.max(0,withT[k]-without[k]);
  return {v,lostWh,towerWh,towerBy,hours,hourly};
}
function shadowFrames(days,h0,h1,perDayAll){
  const R=LAB.renderer, prev={shadow:R.shadowMap.enabled,cast:LAB.sun.castShadow,hemi:LAB.hemi.intensity,sunI:LAB.sun.intensity,ov:overlayMesh?overlayMesh.visible:false};
  R.shadowMap.enabled=true; LAB.sun.castShadow=true; if(overlayMesh) overlayMesh.visible=false; shadowState=null; LAB.scene.traverse(o=>{ if(o.material&&o.material.needsUpdate!==undefined) o.material.needsUpdate=true; });
  const out=[];
  for(const d of days){ const hs=perDayAll?[]:[h0,Math.round((h0+h1)/2),h1]; if(perDayAll) for(let h=h0;h<=h1;h++) hs.push(h);
    const frames=[]; for(const h of hs){ const p=sunPos(d.doy,h,d.tz); if(p.alt<0.03){ frames.push({h,alt:p.alt,url:null}); continue; }
      setSunLight(p); LAB.sun.intensity=0.4+0.6*Math.sin(p.alt); LAB.hemi.intensity=0.6; const cap=LAB.captureView({plan:true,maxW:560,labels:false,dist:900}); frames.push({h,alt:p.alt,az:p.az,url:cap.url,w:cap.w,hh:cap.h}); }
    out.push({label:d.label,frames}); }
  R.shadowMap.enabled=prev.shadow; LAB.sun.castShadow=prev.cast; LAB.hemi.intensity=prev.hemi; LAB.sun.intensity=prev.sunI; if(overlayMesh) overlayMesh.visible=prev.ov; shadowState=null; applySunView();
  return out;
}
function facadeAreas(){ const facArea={N:0,E:0,S:0,W:0,roof:0}; for(const f of LAB.floors){ for(const o of ORI) facArea[o]+=(f.facade?f.facade[o]:0)*f.h; facArea.roof+=f.terrace+f.roof; } return facArea; }
function runSunStudy(){
  const R=LAB.renderer, sd=LAB.S.impact.sun;
  if(!rtTop){ rtTop=new THREE.WebGLRenderTarget(sunRes.w,sunRes.h,{depthBuffer:true}); topCam=new THREE.OrthographicCamera(-(DOM.xmax-DOM.xmin)/2,(DOM.xmax-DOM.xmin)/2,(DOM.ymax-DOM.ymin)/2,-(DOM.ymax-DOM.ymin)/2,1,3000);
    rtSun=new THREE.WebGLRenderTarget(512,512,{depthBuffer:true}); sunCam=new THREE.OrthographicCamera(-460,460,460,-460,1,4000); }
  topCam.position.set((DOM.xmin+DOM.xmax)/2,1500,-(DOM.ymin+DOM.ymax)/2); topCam.up.set(0,0,-1); topCam.lookAt((DOM.xmin+DOM.xmax)/2,0,-(DOM.ymin+DOM.ymax)/2); topCam.updateProjectionMatrix();
  const floors=LAB.floors, nF=floors.length; const zIndex=new Int16Array(256).fill(-1); for(let b=0;b<256;b++){ const z=b/255*ZMAX; for(let i=0;i<nF;i++){ if(z<floors[i].z+floors[i].h){ zIndex[b]=i; break; } } }
  const groups=towerGroups(); const groupVis=groups.map(g=>g.visible); const setTower=v=>{ for(const g of groups) g.visible=v; };
  const ctx={white:new THREE.MeshBasicMaterial({color:0xffffff}),black:new THREE.MeshBasicMaterial({color:0x000000}),gWhite:new THREE.MeshLambertMaterial({color:0xffffff}),setTower,towerMeshes:[],siteMeshes:[],normalMats:{tower:normalMat(1.0),shade:normalMat(0.78),pv:normalMat(0.59)},zIndex,nF};
  const hiddenViz=[]; for(const g of groups){ g.visible=true; g.traverse(o=>{ if(!o.isMesh) return; if(o.userData.viz){ if(o.visible){ o.visible=false; hiddenViz.push(o); } return; } if(o.visible) ctx.towerMeshes.push(o); }); }
  LAB.siteGroup.traverse(o=>{ if(o.isMesh&&o.userData.site&&o.castShadow) ctx.siteMeshes.push(o); });
  const prevClear=new THREE.Color(); R.getClearColor(prevClear); const prevAlpha=R.getClearAlpha();
  const prev={shadow:R.shadowMap.enabled,cast:LAB.sun.castShadow,hemi:LAB.hemi.intensity,sunI:LAB.sun.intensity,bg:LAB.scene.background,ground:LAB.ground.material,ov:overlayMesh?overlayMesh.visible:false};
  R.shadowMap.enabled=true; LAB.sun.castShadow=true; LAB.hemi.intensity=0; LAB.sun.intensity=1; LAB.scene.background=null; R.setClearColor(0x000000,0); if(overlayMesh) overlayMesh.visible=false;
  const hiddenObjs=[]; LAB.scene.traverse(o=>{ if((o.isLine||o.isPoints||o.isSprite||o.userData.labelPlane||o.userData.below)&&o.visible){ o.visible=false; hiddenObjs.push(o); } });
  const N=sunRes.w*sunRes.h; const scope=(sd.scope==='period')?'period':'date'; const PI=periodInfo();
  let days;
  if(scope==='period'){ const nS=PI.days<=3?PI.days:(PI.days<=45?Math.max(3,Math.ceil(PI.days/4)):12); days=[];
    for(let k=0;k<nS;k++){ const doy=((PI.d0-1+Math.floor((k+0.5)*PI.days/nS))%365)+1; const m=monthOf(doy); days.push({label:CLIMATE.months[m]+' '+(doy-doyOf(m,0)),doy,tz:CLIMATE.tz[m],m,yearDays:PI.days/nS,sf:CLIMATE.sunshine[m]/(CLIMATE.daylight[m]*CLIMATE.days[m])}); } }
  else { const D=DATES[sd.date]; days=[{label:D.label,doy:D.doy,tz:D.tz,m:D.m,yearDays:1,sf:1}]; }
  const perDay=[]; const avg=new Float32Array(N), yearH=new Float32Array(N); let wsum=0, lostYear=0, towerYear=0, lostDayAvg=0, towerDayAvg=0;
  const byPeriod={}; for(const c of CATS) byPeriod[c]=0;
  let err=null;
  try{
    for(const d of days){ const r=sunDay(d.doy,d.tz,sd.h0,sd.h1,ctx); const by={}; for(const c of CATS) by[c]=r.towerBy[c]/1000;
      perDay.push(Object.assign({},d,{hours:r.hours,lost:r.lostWh/1000,tower:r.towerWh/1000,by,v:r.v,hourly:r.hourly}));
      const wY=scope==='date'?1:d.yearDays*d.sf; for(const c of CATS) byPeriod[c]+=by[c]*wY;
      for(let k=0;k<N;k++){ avg[k]+=r.v[k]*d.yearDays; yearH[k]+=r.v[k]*d.yearDays*d.sf; } wsum+=d.yearDays; lostYear+=r.lostWh/1000*d.yearDays*d.sf; towerYear+=r.towerWh/1000*d.yearDays*d.sf; lostDayAvg+=r.lostWh/1000*d.yearDays; towerDayAvg+=r.towerWh/1000*d.yearDays; }
  }catch(e){ err=e; }
  R.setRenderTarget(null); LAB.scene.overrideMaterial=null; R.shadowMap.enabled=prev.shadow; LAB.sun.castShadow=prev.cast; LAB.hemi.intensity=prev.hemi; LAB.sun.intensity=prev.sunI; LAB.scene.background=prev.bg; LAB.ground.material=prev.ground; R.setClearColor(prevClear,prevAlpha);
  groups.forEach((g,i)=>{ g.visible=groupVis[i]; }); for(const o of hiddenViz) o.visible=true; if(overlayMesh) overlayMesh.visible=prev.ov; for(const o of hiddenObjs) o.visible=true; shadowState=null; applySunView();
  if(err) throw err;
  for(let k=0;k<N;k++) avg[k]/=wsum; lostDayAvg/=wsum; towerDayAvg/=wsum;
  const facArea=facadeAreas(); const gfa=floors.reduce((s,f)=>s+f.area,0);
  const sunH={N:0,E:0,S:0,W:0,roof:0}, sunHexp={N:0,E:0,S:0,W:0,roof:0};
  for(const d of perDay){ const hh={N:0,E:0,S:0,W:0,roof:0}; for(const r of d.hourly) for(const o of ORI5){ if(facArea[o]>0&&r.A[o]>0.03*facArea[o]) hh[o]++; } d.sunH=hh; for(const o of ORI5){ sunH[o]+=hh[o]*d.yearDays; sunHexp[o]+=hh[o]*d.yearDays*d.sf; } }
  for(const o of ORI5) sunH[o]/=wsum;
  const heat={by:byPeriod,area:facArea,total:ORI5.reduce((s,o)=>s+byPeriod[o],0),intensity:ORI5.reduce((m,o)=>{ m[o]=facArea[o]>0?byPeriod[o]/facArea[o]:0; return m; },{}),sunH,sunHexp,gfa,
    diffH:scope==='date'?0.12*perDay[0].hourly.reduce((s,r)=>s+r.I*Math.sin(r.alt),0)/1000:CLIMATE.ghi.reduce((s,g,m)=>s+g*(CLIMATE.kd?CLIMATE.kd[m]:KD[m])*PI.monthDays[m],0)};
  const foot=towerRaster(2,sunRes.w,sunRes.h), plazaCells=plazaCellsAt(2,sunRes.w,sunRes.h), site=LAB.site, tp=site?site.labels.find(l=>/TRANSIT/.test(l.text)):null;
  const metric=scope==='period'?yearH:avg; const th=scope==='period'?[100,250,500].map(t=>Math.max(1,Math.round(t*PI.days/365))):[1,2,4];
  let a1=0,a2=0,a4=0,plaza=0,plazaTot=0,siteOpen=0,transit=0; const newSh=new Float32Array(N);
  for(let k=0;k<N;k++){ if(foot[k]) continue; const v=metric[k]; newSh[k]=v;
    if(v>=th[0]) a1+=4; if(v>=th[1]) a2+=4; if(v>=th[2]) a4+=4;
    if(plazaCells[k]){ plazaTot+=4; if(v>=th[0]) plaza+=4; }
    const x=DOM.xmin+((k%sunRes.w)+0.5)*2, y=DOM.ymin+(Math.floor(k/sunRes.w)+0.5)*2;
    if(tp&&Math.hypot(x-tp.pos[0],y-tp.pos[1])<40&&v>=th[0]) transit+=4;
    if(site&&site.site&&v>=th[0]&&LAB.pointInPoly(x,y,site.site.polygon)) siteOpen+=4; }
  const months=scope==='period'?perDay.map(d=>{ let pl=0; for(let k=0;k<N;k++) if(plazaCells[k]&&!foot[k]&&d.v[k]>=1) pl+=4; return {m:d.label,sun:CLIMATE.sunshine[d.m],sf:d.sf,hours:d.hours,plaza:pl,lost:d.lost*d.yearDays*d.sf,tower:d.tower*d.yearDays*d.sf,repDays:d.yearDays,towerDay:d.tower,by:d.by,sunH:d.sunH}; }):null;
  const frames=shadowFrames(days,sd.h0,sd.h1,days.length<=3);
  const floorFace=floors.map(f=>{ const m={}; for(const o of ORI) m[o]=(f.facade?f.facade[o]:0)*f.h; return m; });
  sunResult={scope,period:PI,newSh,th,a1,a2,a4,plaza,plazaTot,transit,siteOpen,hours:sd.h1-sd.h0+1,days:perDay.map(d=>d.label),lostKWh:scope==='date'?lostDayAvg:lostYear,towerKWh:scope==='date'?towerDayAvg:towerYear,perDay:scope==='date',months,heat,nF,floorFace,floorH:floors.map(f=>f.h),
    dayData:perDay.map(d=>({label:d.label,m:d.m,hours:d.hours,yearDays:d.yearDays,sf:d.sf,by:d.by,sunH:d.sunH,lost:d.lost,tower:d.tower,hourly:d.hourly})),frames,raw:useRaw(),settings:JSON.parse(JSON.stringify(sd))};
  drawSunOverlay(); LAB.requestRender();
  return sunResult;
}
function drawSunOverlay(){
  if(!sunResult) return; const c1=hex('#F2C46B'), c2=hex('#7A2E8E'); const maxV=sunResult.scope==='period'?Math.max(4,800*sunResult.period.days/365):Math.max(2,sunResult.hours*0.8), lo=sunResult.th[0]*0.5;
  setOverlay((ix,iy)=>{ const v=sunResult.newSh[iy*DOM.nx+ix]; if(v<lo) return null; const t=Math.min(1,v/maxV); const c=lerpC(c1,c2,t); return [c[0],c[1],c[2],Math.round(110+120*t)]; }); updateLegend();
}

/* one directional exposure pass from a vector (used for wind-driven rain): ground newly sheltered by the tower, and the façade area the vector reaches per orientation and floor */
function exposurePass(alt,azDeg){
  const R=LAB.renderer; const floors=LAB.floors; if(!floors) return null;
  if(!rtTop){ rtTop=new THREE.WebGLRenderTarget(sunRes.w,sunRes.h,{depthBuffer:true}); topCam=new THREE.OrthographicCamera(-(DOM.xmax-DOM.xmin)/2,(DOM.xmax-DOM.xmin)/2,(DOM.ymax-DOM.ymin)/2,-(DOM.ymax-DOM.ymin)/2,1,3000);
    rtSun=new THREE.WebGLRenderTarget(512,512,{depthBuffer:true}); sunCam=new THREE.OrthographicCamera(-460,460,460,-460,1,4000); }
  topCam.position.set((DOM.xmin+DOM.xmax)/2,1500,-(DOM.ymin+DOM.ymax)/2); topCam.up.set(0,0,-1); topCam.lookAt((DOM.xmin+DOM.xmax)/2,0,-(DOM.ymin+DOM.ymax)/2); topCam.updateProjectionMatrix();
  const nF=floors.length; const zIndex=new Int16Array(256).fill(-1); for(let b=0;b<256;b++){ const z=b/255*ZMAX; for(let i=0;i<nF;i++){ if(z<floors[i].z+floors[i].h){ zIndex[b]=i; break; } } }
  const groups=towerGroups(); const groupVis=groups.map(g=>g.visible); const setTower=v=>{ for(const g of groups) g.visible=v; };
  const ctx={white:new THREE.MeshBasicMaterial({color:0xffffff}),black:new THREE.MeshBasicMaterial({color:0x000000}),gWhite:new THREE.MeshLambertMaterial({color:0xffffff}),setTower,towerMeshes:[],siteMeshes:[],normalMats:{tower:normalMat(1.0),shade:normalMat(0.78),pv:normalMat(0.59)},zIndex,nF};
  const hiddenViz=[]; for(const g of groups){ g.visible=true; g.traverse(o=>{ if(!o.isMesh) return; if(o.userData.viz){ if(o.visible){ o.visible=false; hiddenViz.push(o); } return; } if(o.visible) ctx.towerMeshes.push(o); }); }
  LAB.siteGroup.traverse(o=>{ if(o.isMesh&&o.userData.site&&o.castShadow) ctx.siteMeshes.push(o); });
  const prevClear=new THREE.Color(); R.getClearColor(prevClear); const prevAlpha=R.getClearAlpha();
  const prev={shadow:R.shadowMap.enabled,cast:LAB.sun.castShadow,hemi:LAB.hemi.intensity,sunI:LAB.sun.intensity,bg:LAB.scene.background,ground:LAB.ground.material,ov:overlayMesh?overlayMesh.visible:false};
  R.shadowMap.enabled=true; LAB.sun.castShadow=true; LAB.hemi.intensity=0; LAB.sun.intensity=1; LAB.scene.background=null; R.setClearColor(0x000000,0); if(overlayMesh) overlayMesh.visible=false;
  const hiddenObjs=[]; LAB.scene.traverse(o=>{ if((o.isLine||o.isPoints||o.isSprite||o.userData.labelPlane||o.userData.below)&&o.visible){ o.visible=false; hiddenObjs.push(o); } });
  let out=null, err=null;
  try{ const r=sunDay(0,0,0,0,ctx,[{h:0,p:{alt,az:azDeg*Math.PI/180}}]); const H=r.hourly[0]||null; out={shade:r.v,A:H?H.A:null,Az:H?H.Az:null,nF,lostA:r.lostWh,pxArea:(920/512)*(920/512)}; }catch(e){ err=e; }
  R.setRenderTarget(null); LAB.scene.overrideMaterial=null; R.shadowMap.enabled=prev.shadow; LAB.sun.castShadow=prev.cast; LAB.hemi.intensity=prev.hemi; LAB.sun.intensity=prev.sunI; LAB.scene.background=prev.bg; LAB.ground.material=prev.ground; R.setClearColor(prevClear,prevAlpha);
  groups.forEach((g,i)=>{ g.visible=groupVis[i]; }); for(const o of hiddenViz) o.visible=true; if(overlayMesh) overlayMesh.visible=prev.ov; for(const o of hiddenObjs) o.visible=true; shadowState=null; applySunView();
  if(err) throw err; return out;
}

/* ---------- Advanced solar analytics by façade zone, from the hourly per-floor record without a rerun ---------- */
function stratT(z,alt,azDeg,faceAz,gh){
  const st=STRATS[z.strat]; const mod=st.mod||1; const D=z.depth; if(!st.device||D<=0) return mod;
  const hsa=((azDeg-faceAz)+540)%360-180; const c=Math.cos(hsa*Math.PI/180); if(c<=0.02) return mod;
  const tanProf=Math.tan(alt)/c, tanH=Math.abs(Math.tan(hsa*Math.PI/180)); let fh=0, fv=0; const g=Math.max(0.5,gh);
  switch(z.strat){ case 'overhang': case 'balcony': fh=Math.min(1,D*tanProf/g); break; case 'louvres': fh=Math.min(1,D*tanProf/0.5); break; case 'fins': fv=Math.min(1,D*tanH/1.5); break;
    case 'eggcrate': fh=Math.min(1,D*tanProf/0.5); fv=Math.min(1,D*tanH/1.5); break; case 'punched': fh=Math.min(1,D*tanProf/g); fv=Math.min(1,D*tanH/1.8); break;
    case 'lightshelf': { const hs=Math.min(2.1,g); fh=(hs/g)*Math.min(1,D*tanProf/hs); break; } }
  return (1-fh)*(1-fv)*mod;
}
function solarStudy(r){
  const P=SW.pv, dayScope=r.scope==='date'; const H=r.heat; const nF=r.nF;
  const mkZ=(z,i,label)=>({z,i,label,st:STRATS[z.strat],beam:0,un:0,sh:0,t:0,n:0,glare:0,areaGl:0,areaOp:0,pvArea:0,pvBeam:0,floors:new Set()});
  const zones=SW.zones.map((z,i)=>mkZ(z,i,zoneLabel(z))); const dz=mkZ(DEFAULT_ZONE,-1,'Unassigned faces');
  const zi=zone=>zone===DEFAULT_ZONE?dz:zones[SW.zones.indexOf(zone)];
  const map=[]; for(let i=0;i<nF;i++){ const m={}; for(const o of ORI){ const zone=zoneFor(o,i+1), Z=zi(zone); m[o]=Z; const A=r.floorFace[i][o]; if(A>0){ Z.floors.add(i); Z.areaGl+=A*zone.wwr; Z.areaOp+=A*(1-zone.wwr); Z.pvArea+=A*(1-zone.wwr)*zone.pv; } } map.push(m); }
  const byFace={}; for(const o of ORI) byFace[o]={un:0,sh:0};
  for(const d of r.dayData){ const wY=dayScope?1:d.yearDays*d.sf;
    for(const h of d.hourly){ const glared=new Set(); for(const o of ORI){ const col=h.Az[o]; for(let i=0;i<nF;i++){ const a=col[i]; if(a<=0) continue; const Z=map[i][o], zone=Z.z; const beam=a*h.I/1000; const fl=LAB.floors&&LAB.floors[i]; const gh=fl?band(fl,o,zone).gh:Math.max(0.3,(r.floorH[i]-GAP)*zone.wwr); const t=stratT(zone,h.alt,h.az,FACE_AZ[o],gh); const g=beam*zone.wwr*zone.shgc*0.9;
        Z.beam+=beam*wY; Z.un+=g*wY; Z.sh+=g*t*wY; Z.t+=t*beam; Z.n+=beam; byFace[o].un+=g*wY; byFace[o].sh+=g*t*wY; Z.pvBeam+=beam*(1-zone.wwr)*zone.pv*wY;
        if(h.alt<25*Math.PI/180&&t>0.5&&r.floorFace[i][o]>0&&a>0.03*r.floorFace[i][o]) glared.add(Z); } }
      for(const Z of glared) Z.glare+=wY; } }
  const all=zones.concat(dz.floors.size?[dz]:[]); let unTot=0, shTot=0; for(const Z of all){ Z.tAvg=Z.n?Z.t/Z.n:1; Z.aperture=Z.z.wwr*SW.glaz.vt; unTot+=Z.un; shTot+=Z.sh; }
  const diffH=H.diffH, diffRoof=diffH*0.9, diffVert=diffH*0.5*0.8; const rows=[]; const add=(name,area,beamKwh,diff,Z)=>{ if(area<=0) return; const kwp=area*P.eff, kwh=(beamKwh+diff*area)*P.eff*P.pr; rows.push({name,area,kwp,kwh,perM2:kwh/area}); if(Z) Z.pvKwh=kwh; };
  add('Roofs and terraces · '+Math.round(P.roof*100)+'% covered',H.area.roof*P.roof,H.by.roof*P.roof,diffRoof,null);
  for(const Z of all){ Z.pvKwh=0; if(Z.pvArea>0) add(Z.label+' · PV on '+Math.round(Z.z.pv*100)+'% of the spandrel',Z.pvArea,Z.pvBeam,diffVert,Z); }
  if(r.raw&&LAB.uploadRaw&&LAB.uploadRaw.pv.length&&adv()){ const A=meshArea(LAB.uploadRaw.pv); if(A>0) add('PV surfaces as modeled ('+LAB.uploadRaw.pv.length+' objects)',A,H.by.pv,diffH*0.7,null); }
  const pvTot=rows.reduce((s,x)=>s+x.kwh,0), kwpTot=rows.reduce((s,x)=>s+x.kwp,0);
  return {zones:all,unTot,shTot,blocked:unTot>0?1-shTot/unTot:0,byFace,pv:rows,pvTot,kwpTot};
}

/* ---------- wind: lattice-Boltzmann at pedestrian level ---------- */
let windResult=null;
function baseCorners(){ const fl=LAB.floors&&LAB.floors[0]; if(!fl) return []; return [[-fl.w/2,-fl.d/2],[fl.w/2,-fl.d/2],[fl.w/2,fl.d/2],[-fl.w/2,fl.d/2]].map(p=>LAB.toWorld(fl,p[0],p[1])); }
function runWind(withTower,dir,strat,plazaMask){
  if(!siteRaster) buildSiteRaster();
  const {cs,nx,ny,H}=siteRaster, N=nx*ny;
  const solid=new Uint8Array(N); for(let k=0;k<N;k++) if(H[k]>3) solid[k]=1;
  const podium=!!(withTower&&strat&&strat.podiumH>0&&strat.podiumExt>0);
  if(withTower){ let tr=towerRaster(cs,nx,ny); if(podium) tr=dilate(tr,nx,ny,Math.round(strat.podiumExt/cs)); for(let k=0;k<N;k++) if(tr[k]) solid[k]=1; }
  const ex=[0,1,0,-1,0,1,-1,-1,1], ey=[0,0,1,0,-1,1,1,-1,-1], w=[4/9,1/9,1/9,1/9,1/9,1/36,1/36,1/36,1/36], opp=[0,3,4,1,2,7,8,5,6];
  let f=new Float32Array(9*N), g=new Float32Array(9*N);
  for(let k=0;k<N;k++) for(let i=0;i<9;i++) f[i*N+k]=w[i];
  const th=(dir+180)*Math.PI/180; const fx0=Math.sin(th), fy0=Math.cos(th);
  const tau=0.58, uT=0.05; let F=2e-5;
  const steps=Math.round(Math.max(nx,ny)*3.2);
  const ux=new Float32Array(N), uy=new Float32Array(N);
  for(let s=0;s<steps;s++){
    let umean=0, cnt=0;
    for(let k=0;k<N;k++){ if(solid[k]) continue;
      let rho=0,vx=0,vy=0; for(let i=0;i<9;i++){ const fi=f[i*N+k]; rho+=fi; vx+=fi*ex[i]; vy+=fi*ey[i]; }
      vx=vx/rho+F*fx0*tau/rho; vy=vy/rho+F*fy0*tau/rho; ux[k]=vx; uy[k]=vy;
      const sp=Math.hypot(vx,vy); if(sp>0.25){ vx*=0.25/sp; vy*=0.25/sp; } const usq=1.5*(vx*vx+vy*vy);
      for(let i=0;i<9;i++){ const eu=3*(ex[i]*vx+ey[i]*vy); const feq=w[i]*rho*(1+eu+0.5*eu*eu-usq); f[i*N+k]+=-(f[i*N+k]-feq)/tau; }
      umean+=Math.hypot(ux[k],uy[k])*((fx0*ux[k]+fy0*uy[k])>0?1:0.5); cnt++; }
    umean/=Math.max(1,cnt); F=Math.max(0,F+Math.max(-1e-5,Math.min(1e-5,(uT-umean)*4e-5)));
    for(let k=0;k<N;k++){ if(solid[k]) continue; const x=k%nx, y=(k/nx)|0;
      for(let i=0;i<9;i++){ const v=f[i*N+k]; const xn=(x+ex[i]+nx)%nx, yn=(y+ey[i]+ny)%ny, kn=yn*nx+xn;
        if(solid[kn]) g[opp[i]*N+k]=v; else g[i*N+kn]=v; } }
    const t=f; f=g; g=t;
  }
  const dist=new Float32Array(N).fill(1e9); for(let k=0;k<N;k++){ if(!solid[k]) continue; const x=k%nx,y=(k/nx)|0; for(let dy=-6;dy<=6;dy++) for(let dx=-6;dx<=6;dx++){ const xx=x+dx,yy=y+dy; if(xx<0||yy<0||xx>=nx||yy>=ny) continue; const j=yy*nx+xx; const dd=Math.hypot(dx,dy)*cs; if(dd<dist[j]) dist[j]=dd; } }
  let ref=0,rc=0; for(let k=0;k<N;k++) if(!solid[k]&&dist[k]>24){ ref+=Math.hypot(ux[k],uy[k]); rc++; } ref=ref/Math.max(1,rc)||1;
  const ratio=new Float32Array(N); for(let k=0;k<N;k++) ratio[k]=solid[k]?0:Math.hypot(ux[k],uy[k])/ref;
  let zone=null;
  if(withTower&&LAB.floors){ const fl=LAB.floors[0]; let hs=0,hc=0; for(const b of siteRaster.bld){ if(Math.hypot(b.x-fl.cx,b.y-fl.cy)<120){ hs+=b.top; hc++; } } const hn=hc?hs/hc:20;
    let amp=Math.min(2.1,Math.max(1,1+0.45*Math.log2(LAB.S.height/Math.max(8,hn)))); const amp0=amp; let note=[];
    if(strat){ if(podium){ const k=1-0.8*Math.min(1,strat.podiumH/30); amp=1+(amp-1)*k; note.push('podium'); } if(strat.canopy>0){ amp=1+(amp-1)*(1-0.35*Math.min(1,strat.canopy/6)); note.push('canopy'); } }
    const depth=0.22*LAB.S.height, half=Math.max(fl.w,fl.d)*0.6; zone={depth,half,amp,amp0,hn,note};
    for(let k=0;k<N;k++){ if(solid[k]) continue; const x=DOM.xmin+((k%nx)+0.5)*cs-fl.cx, y=DOM.ymin+(((k/nx)|0)+0.5)*cs-fl.cy; const along=-(x*fx0+y*fy0), across=Math.abs(-x*fy0+y*fx0); if(along>0&&along<depth&&across<half){ ratio[k]*=1+(amp-1)*(1-along/depth); } }
    if(strat&&strat.corners!=='sharp'){ const cs4=baseCorners(); for(let k=0;k<N;k++){ if(solid[k]) continue; const x=DOM.xmin+((k%nx)+0.5)*cs, y=DOM.ymin+(((k/nx)|0)+0.5)*cs; for(const c of cs4){ if(Math.hypot(x-c.x,y-c.y)<14){ ratio[k]*=strat.corners==='rounded'?0.78:0.85; break; } } } }
    if(strat&&strat.shelter>0&&plazaMask){ for(let k=0;k<N;k++) if(plazaMask[k]&&!solid[k]) ratio[k]*=1-0.4*strat.shelter; } }
  return {ratio,solid,nx,ny,cs,zone};
}
const cls=v=>v<=2.5?0:(v<=4?1:(v<=6?2:(v<=8?3:4)));
function summarise(a,b,U,plazaMask){
  const N=a.nx*a.ny, cats=[0,0,0,0,0], catsB=[0,0,0,0,0]; let worse=0, better=0, maxS=0, plazaWorst=0, plazaMean=0, pc=0;
  for(let k=0;k<N;k++){ if(a.solid[k]) continue; const s=a.ratio[k]*U, sb=b.solid[k]?s:b.ratio[k]*U; cats[cls(s)]+=a.cs*a.cs; catsB[cls(sb)]+=a.cs*a.cs; if(cls(s)>cls(sb)) worse+=a.cs*a.cs; if(cls(s)<cls(sb)) better+=a.cs*a.cs; if(s>maxS) maxS=s; if(plazaMask[k]){ plazaWorst=Math.max(plazaWorst,s); plazaMean+=s; pc++; } }
  return {cats,catsB,worse,better,maxS,plazaWorst,plazaMean:pc?plazaMean/pc:0};
}
function stratActive(){ const W=SW.ws; return adv()&&((W.podiumH>0&&W.podiumExt>0)||W.canopy>0||W.corners!=='sharp'||W.shelter>0); }
async function runWindStudy(progress){
  const W=LAB.S.impact.wind; if(!siteRaster) buildSiteRaster(); const plazaMask=plazaCellsAt(siteRaster.cs,siteRaster.nx,siteRaster.ny);
  const strat=stratActive()?SW.ws:null;
  if(!W.annual){ const a=runWind(true,W.dir,strat,plazaMask), b=runWind(false,W.dir,null,plazaMask); const s=summarise(a,b,W.speed,plazaMask);
    let a0=null, vsBase=null; if(strat){ a0=runWind(true,W.dir,null,plazaMask); vsBase=summarise(a,a0,W.speed,plazaMask); vsBase.plazaMean0=summarise(a0,b,W.speed,plazaMask).plazaMean; }
    windResult=Object.assign({annual:false,a,b,a0,vsBase,U:W.speed,strat:strat&&clone(strat),settings:clone(W)},s); drawWindOverlay(); return windResult; }
  const N=siteRaster.nx*siteRaster.ny; const meanA=new Float32Array(N), meanB=new Float32Array(N), meanA0=new Float32Array(N), pOver6=new Float32Array(N), pOver6B=new Float32Array(N); const sectors=[]; let solidA=null, zone=null;
  const PI=periodInfo(), rose=roseFor(PI);
  for(let i=0;i<rose.length;i++){ const r=rose[i]; if(progress) progress(`Sector ${i+1} of ${rose.length} · ${r.name}…`); await new Promise(res=>setTimeout(res,20));
    const a=runWind(true,r.dir,strat,plazaMask), b=runWind(false,r.dir,null,plazaMask); const a0=strat?runWind(true,r.dir,null,plazaMask):null; solidA=a.solid; zone=a.zone||zone; const s=summarise(a,b,r.s,plazaMask);
    for(let k=0;k<N;k++){ if(a.solid[k]) continue; const sa=a.ratio[k]*r.s, sb=b.solid[k]?sa:b.ratio[k]*r.s; meanA[k]+=r.f*sa; meanB[k]+=r.f*sb; if(a0) meanA0[k]+=r.f*(a0.solid[k]?sa:a0.ratio[k]*r.s); if(sa*1.8>6) pOver6[k]+=r.f; if(sb*1.8>6) pOver6B[k]+=r.f; }
    sectors.push(Object.assign({dir:r.dir,name:r.name,f:r.f,s:r.s},s)); }
  const a={ratio:meanA,solid:solidA,nx:siteRaster.nx,ny:siteRaster.ny,cs:siteRaster.cs,zone}, b={ratio:meanB,solid:solidA,nx:a.nx,ny:a.ny,cs:a.cs};
  const s=summarise(a,b,1,plazaMask); let gusty=0, gustyB=0; for(let k=0;k<N;k++){ if(solidA[k]) continue; if(pOver6[k]>0.05) gusty+=a.cs*a.cs; if(pOver6B[k]>0.05) gustyB+=a.cs*a.cs; }
  let a0=null, vsBase=null; if(strat){ a0={ratio:meanA0,solid:solidA,nx:a.nx,ny:a.ny,cs:a.cs}; vsBase=summarise(a,a0,1,plazaMask); vsBase.plazaMean0=summarise(a0,b,1,plazaMask).plazaMean; }
  windResult=Object.assign({annual:true,period:PI,a,b,a0,vsBase,U:1,sectors,gusty,gustyB,strat:strat&&clone(strat),settings:clone(W)},s); drawWindOverlay(); return windResult;
}
function drawWindOverlay(){
  if(!windResult) return; const {a,b,a0,U}=windResult; let view=LAB.S.impact.wind.view||'comfort'; if(view==='strat'&&!a0) view='comfort';
  const CC=[hex('#3E8E7E'),hex('#8FC17A'),hex('#E3C25C'),hex('#E08A3C'),hex('#B8362B')];
  setOverlay((ix,iy)=>{ const k=((iy>>1)*a.nx+(ix>>1)); if(a.solid[k]) return null;
    if(view==='delta'||view==='strat'){ const ref=view==='strat'?a0:b; const d=(a.ratio[k]-(ref.solid[k]?a.ratio[k]:ref.ratio[k]))*U; if(Math.abs(d)<0.35) return null; const t=Math.min(1,Math.abs(d)/4); return d>0?[184,54,43,Math.round(60+150*t)]:[62,142,126,Math.round(60+150*t)]; }
    const c=CC[cls(a.ratio[k]*U)]; return [c[0],c[1],c[2],150]; }); updateLegend();
}
function windProfile(U10){ const top=LAB.S.height; const zs=[10,30,60,100,150,200,250,300].filter(z=>z<top-5).concat([top]); return zs.map(z=>{ const U=U10*Math.pow(z/10,ALPHA); return {z,U,gust:U*1.8,q:0.613*U*U}; }); }
function refWind(){ const W=LAB.S.impact.wind; if(!W.annual) return {U:W.speed,label:W.dir+'° at '+W.speed.toFixed(1)+' m/s'}; const rose=roseFor(periodInfo()); const U=rose.reduce((s,r)=>s+r.f*r.s,0); return {U,label:'period mean '+U.toFixed(1)+' m/s'}; }
/* natural ventilation, hour by hour over the CWEC typical year (Ladybug's natural-ventilation potential and the CBE adaptive model, with the airflow of
   NIST CONTAM / EnergyPlus AirflowNetwork reduced to one zone per floor): windows open when the air the room would reach sits in the comfort band
   (ASHRAE 55 adaptive on the prevailing mean outdoor temperature, else the fixed band), gusts at that floor's height stay under the limit and it is not
   raining hard; airflow then balances wind pressure (Cp by wind angle on each face) and stack pressure through every operable opening */
const cpFace=(windFrom,faceAz)=>{ const t=((((windFrom-faceAz)%360)+540)%360-180)*Math.PI/180, c=Math.cos(t); return -0.2+0.5*c+0.4*(2*c*c-1); }; // tall-building face: +0.7 windward, −0.6 side, −0.3 leeward
// weather-station wind (open airfield, 10 m) to the site: ASHRAE Fundamentals boundary layers, as EnergyPlus does (met α 0.14 / 270 m; site α ALPHA / 400 m)
const siteWind=(ws,z)=>ws*Math.pow(270/10,0.14)*Math.pow(Math.max(10,z)/400,ALPHA);
function ventOpenings(f){ const lvl=f.i+1, open=SW.vent.open||0.1, off=LAB.phys?LAB.phys.faceOffset(f.rot):0; const by={};
  for(const e of edgesOf(f)){ const z=zoneFor(e.o,lvl); if(!z.operable) continue; const B=band(f,e.o,z); const q=by[e.o]||(by[e.o]={o:e.o,A:0,zb:f.z+B.sp,gh:B.gh,az:FACE_AZ[e.o]+off}); q.A+=e.L*B.gh*open; }
  return Object.values(by).filter(q=>q.A>0); }
function ventFlow(ops,U,wdir,Te,dT,mode,zMid,hh){
  if(!ops.length) return 0; const rho=1.2041*293.15/(Te+273.15), Ti=Te+dT, rhoI=rho*(Te+273.15)/(Ti+273.15), Cd=0.6, g=9.81;
  const items=fs=>{ const it=[]; for(const q of fs){ const cp=cpFace(wdir,q.az), pw=0.5*rho*U*U*cp; for(const fz of [0.25,0.75]){ const z=q.zb+q.gh*fz; it.push({A:q.A/2,p:pw-(rho-rhoI)*g*(z-zMid)}); } } return it; };
  const balance=it=>{ if(it.length<2) return 0; let lo=Infinity, hi=-Infinity; for(const x of it){ lo=Math.min(lo,x.p); hi=Math.max(hi,x.p); } if(hi-lo<1e-6) return 0;
    const net=P=>{ let m=0; for(const x of it){ const d=x.p-P; m+=Cd*x.A*Math.sign(d)*Math.sqrt(2*(d>0?rho:rhoI)*Math.abs(d)); } return m; };
    for(let k=0;k<32;k++){ const mid=(lo+hi)/2; if(net(mid)>0) lo=mid; else hi=mid; } const P=(lo+hi)/2; let q=0; for(const x of it){ const d=x.p-P; if(d>0) q+=Cd*x.A*Math.sqrt(2*d/rho); } return q; };
  const turb=fs=>0.025*fs.reduce((s,q)=>s+q.A,0)*U; // BS 5925 single-sided wind turbulence
  if(mode==='single') return ops.reduce((s,q)=>{ const b=balance(items([q])), t=turb([q]); return s+Math.sqrt(b*b+t*t); },0);
  const it=items(ops); if(mode==='stack'){ const A=ops.reduce((s,q)=>s+q.A,0)*0.5; it.push({A,p:0.5*rho*U*U*-0.5-(rho-rhoI)*g*(3*hh)}); }
  const b=balance(it); if(ops.length===1){ const t=turb(ops); return Math.sqrt(b*b+t*t); } return b; }
function ventStudy(){
  const V=SW.vent, PI=periodInfo(), rose=roseFor(PI), S=LAB.S, floors=LAB.floors||[]; const U10m=rose.reduce((s,r)=>s+r.f*r.s,0); const P=LAB.phys&&LAB.phys.prep();
  const adaptive=V.band==='adaptive'; const Utop=U10m*Math.pow(S.height/10,ALPHA);
  const op=[]; for(const f of floors){ const ops=ventOpenings(f); if(!ops.length) continue; let boost=1; for(const o of ORI){ const z=zoneFor(o,f.i+1); if(z.operable) boost=Math.max(boost,STRATS[z.strat].ventBoost||1); }
    const hh=f.h-GAP; const area=Math.max(1,f.area); op.push({f,ops,zm:f.z+f.h/2,hh,area,umax:V.umax*boost,vol:area*hh,open:0,comfortH:0,windBlocked:0,achs:[],fresh:0}); }
  const reqACH=(S.energy&&S.energy.vent||0.35)*3.6; // per metre of storey height: L/s per m² → air changes
  const rows=CLIMATE.months.map((m,i)=>({m,days:PI.monthDays[i],T:CLIMATE.temp[i],fT:0,hours:0,vent:0,comfort:null,tmin:V.tmin,tmax:V.tmax,cSum:0,cN:0}));
  const grid=new Float32Array(8760).fill(-1); let total=0, hoursTot=0, rainH=0;
  if(!P){ return {rows,total:0,hoursTot:0,fW:0,Um:U10m,U10:U10m,operable:op.length,nF:floors.length,limit:0,all:false,Utop,qTop:0.613*Utop*Utop*3.24,adaptive,hourly:false,floors:[],grid}; }
  for(let k=0;k<8760;k++){ if(!LAB.phys.inPeriod(PI,P.doy[k])) continue; const m=P.mon[k], R=rows[m]; R.hours++; hoursTot++;
    const Te=P.T[k]; let lo=V.tmin, hi=V.tmax; const tp=P.tpma[k]; if(adaptive&&tp>=10&&tp<=33.5){ const tc=0.31*tp+17.8; lo=tc-3.5; hi=tc+3.5; R.cSum+=tc; R.cN++; }
    const Ti=Te+(V.dT||3); const comfy=Ti>=lo&&Ti<=hi; if(comfy) R.fT++; const wet=P.rain[k]>1; if(comfy&&wet) rainH++;
    if(!op.length){ continue; } let n=0;
    if(comfy&&!wet){ const ws=P.ws[k], wd=P.wd[k]; for(const q of op){ q.comfortH++; const U=siteWind(ws,q.zm); if(1.8*U>q.umax){ q.windBlocked++; continue; } q.open++; n++;
      const Q=ventFlow(q.ops,U,wd,Te,V.dT||3,V.mode,q.zm,q.hh); const ach=Q*3600/q.vol; q.achs.push(ach); if(ach>=reqACH/q.hh) q.fresh++; } }
    const sh=n/op.length; grid[k]=sh; R.vent+=sh; total+=sh; }
  rows.forEach(R=>{ R.fT=R.hours?R.fT/R.hours:0; if(R.cN){ R.comfort=R.cSum/R.cN; R.tmin=R.comfort-3.5; R.tmax=R.comfort+3.5; } });
  const med=a=>{ if(!a.length) return 0; const s=Float32Array.from(a).sort(); return s[s.length>>1]; };
  const fl=op.map(q=>({i:q.f.i,share:hoursTot?q.open/hoursTot:0,ofComfort:q.comfortH?q.open/q.comfortH:0,achMed:med(q.achs),fresh:q.open?q.fresh/q.open:0}));
  let limit=0; for(const q of op){ if(!q.comfortH||q.windBlocked/q.comfortH<0.2) limit=q.f.i+1; }
  const allAch=[]; op.forEach(q=>{ for(let j=0;j<q.achs.length;j+=4) allAch.push(q.achs[j]); }); const openTot=op.reduce((s,q)=>s+q.open,0), freshTot=op.reduce((s,q)=>s+q.fresh,0);
  const comfortTot=rows.reduce((s,R)=>s+R.fT*R.hours,0); const Um=op.length?op.reduce((s,q)=>s+U10m*Math.pow(Math.max(10,q.zm)/10,ALPHA),0)/op.length:U10m*Math.pow(S.height/20,ALPHA);
  return {rows,total,hoursTot,fW:comfortTot?total/comfortTot:0,Um,U10:U10m,operable:op.length,nF:floors.length,limit,all:op.length>0&&limit>=floors.length,Utop,qTop:0.613*Utop*Utop*1.8*1.8,adaptive,
    hourly:true,floors:fl,grid,achMed:med(allAch),fresh:openTot?freshTot/openTot:0,rainH,comfortH:comfortTot,reqACH};
}
/* share of operable floors with windows open, by week and hour of day */
function ventCarpet(grid){ const W=380,H=150,L=30,R=34,T=10,B=22; const nw=52, cw=(W-L-R)/nw, chh=(H-T-B)/24; let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Hours with windows open by week and hour of day" data-key="vent-carpet"><style>text{font-family:var(--font-m);font-size:8.5px;fill:var(--muted)}</style>`;
  const col=v=>v<0?'none':v<0.02?'var(--panel2)':`rgba(46,140,150,${(0.18+0.82*v).toFixed(2)})`;
  for(let w=0;w<nw;w++) for(let h=0;h<24;h++){ let sm=0,c=0; for(let d=0;d<7;d++){ const k=(w*7+d)*24+h; if(k>=8760||grid[k]<0) continue; sm+=grid[k]; c++; } if(!c) continue; s+=`<rect x="${(L+w*cw).toFixed(2)}" y="${(T+h*chh).toFixed(2)}" width="${(cw+0.05).toFixed(2)}" height="${(chh+0.05).toFixed(2)}" fill="${col(sm/c)}"/>`; }
  for(const h of [0,6,12,18,24]) s+=`<text x="${L-4}" y="${(T+h*chh+3).toFixed(1)}" text-anchor="end">${h}h</text>`;
  CLIMATE.months.forEach((mn,i)=>{ const d=CLIMATE.days.slice(0,i).reduce((a,b)=>a+b,0); s+=`<text x="${(L+d/7*cw).toFixed(1)}" y="${H-8}">${mn[0]}</text>`; });
  const x0=W-R+8; for(let i=0;i<20;i++) s+=`<rect x="${x0}" y="${(T+i*(H-T-B)/20).toFixed(1)}" width="8" height="${((H-T-B)/20+0.2).toFixed(1)}" fill="${col(1-i/19)}"/>`; s+=`<text x="${x0-2}" y="${T-2}">all</text><text x="${x0-2}" y="${H-B+9}">none</text>`;
  return s+'</svg>'; }
/* wind on terraces: height profile per terrace floor, halved where a wind-screen zone covers that level */
function terraceWind(){ const V=refWind(); const out=[]; for(const f of LAB.floors||[]){ if(f.terrace<30&&f.i<LAB.floors.length-1) continue; if(f.i===LAB.floors.length-1&&f.roof<30) continue; const z=f.z+f.h; const U=V.U*Math.pow(Math.max(10,z)/10,ALPHA); let screened=false; for(const o of ORI){ const q=zoneFor(o,f.i+1); if(STRATS[q.strat].screen){ screened=true; break; } } const Us=screened?U*0.5:U; out.push({level:f.i+1,z,area:f.i===LAB.floors.length-1?f.roof:f.terrace,U,gust:U*1.8,band:cls(U),screened,Us,bandS:cls(Us)}); } return out; }

/* ---------- sky and rose diagrams ---------- */
function sunPathSVG(){
  const R=92, cx=112, cy=112; const sd=LAB.S.impact.sun; const cur=DATES[sd.date]; const now=sunPos(cur.doy,sd.hour,cur.tz);
  const pt=p=>{ const r=R*(1-p.alt/(Math.PI/2)); return [cx+r*Math.sin(p.az), cy-r*Math.cos(p.az)]; };
  let s=`<svg viewBox="0 0 224 224" role="img" aria-label="Sun paths over the year with the current sun" data-key="sun-path"><style>text{font-family:var(--font-m);font-size:8.5px;fill:var(--muted)} .pth{fill:none;stroke:var(--line);stroke-width:1} .pth.cur{stroke:var(--sun);stroke-width:1.8} .ring{fill:none;stroke:var(--line2)}</style>`;
  for(const a of [0,30,60]) s+=`<circle class="ring" cx="${cx}" cy="${cy}" r="${(R*(1-a/90)).toFixed(1)}"/>`;
  s+=`<line x1="${cx-R}" x2="${cx+R}" y1="${cy}" y2="${cy}" class="ring"/><line x1="${cx}" x2="${cx}" y1="${cy-R}" y2="${cy+R}" class="ring"/>`;
  s+=`<text x="${cx}" y="${cy-R-5}" text-anchor="middle">N</text><text x="${cx+R+5}" y="${cy+3}">E</text><text x="${cx}" y="${cy+R+11}" text-anchor="middle">S</text><text x="${cx-R-5}" y="${cy+3}" text-anchor="end">W</text>`;
  s+=`<text x="${cx+2}" y="${cy-R*(1-30/90)-2}">30°</text><text x="${cx+2}" y="${cy-R*(1-60/90)-2}">60°</text>`;
  for(const k of ['summer','equinox','winter']){ const D=DATES[k]; const pts=[]; for(let h=3;h<=22;h+=0.25){ const p=sunPos(D.doy,h,D.tz); if(p.alt>0) pts.push(pt(p)); } if(pts.length) s+=`<path class="pth${k===sd.date||(k==='equinox'&&sd.date==='autumn')?' cur':''}" d="M${pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L')}"/>`; }
  for(let h=6;h<=20;h+=2){ const p=sunPos(DATES.equinox.doy,h,DATES.equinox.tz); if(p.alt<=0) continue; const q=pt(p); s+=`<text x="${q[0].toFixed(1)}" y="${(q[1]-3).toFixed(1)}" text-anchor="middle">${h}</text>`; }
  if(now.alt>0){ const q=pt(now); s+=`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="4.5" fill="var(--sun)" stroke="var(--panel2)" stroke-width="1.5"/>`; }
  return s+'</svg>';
}
function roseSVG(rose){
  const cx=112, cy=112, R=86; const maxf=Math.max(...rose.map(r=>r.f),0.01);
  let s=`<svg viewBox="0 0 224 224" role="img" aria-label="Wind rose for the period" data-key="wind-rose"><style>text{font-family:var(--font-m);font-size:8.5px;fill:var(--muted)} .ring{fill:none;stroke:var(--line2)}</style>`;
  for(const t of [0.25,0.5,0.75,1]) s+=`<circle class="ring" cx="${cx}" cy="${cy}" r="${(R*t).toFixed(1)}"/>`;
  rose.forEach(r=>{ const L=R*r.f/maxf, a=r.dir*Math.PI/180, w=0.33; const x1=cx+L*Math.sin(a-w), y1=cy-L*Math.cos(a-w), x2=cx+L*Math.sin(a+w), y2=cy-L*Math.cos(a+w); const t=Math.min(1,Math.max(0,(r.s-3)/3)); s+=`<path d="M${cx},${cy}L${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}Z" fill="var(--wind)" fill-opacity="${(0.35+0.55*t).toFixed(2)}"><title>${r.name}: ${Math.round(r.f*100)}% of hours, ${r.s.toFixed(1)} m/s</title></path>`;
    const lx=cx+(R+12)*Math.sin(a), ly=cy-(R+12)*Math.cos(a); s+=`<text x="${lx.toFixed(1)}" y="${(ly+3).toFixed(1)}" text-anchor="middle">${r.name}</text>`; });
  s+=`<text x="${cx+3}" y="${cy-R*0.5+10}">${Math.round(maxf*50)}%</text>`;
  return s+'</svg>';
}
const fmtHour=v=>{ const h=Math.floor(v), m=v%1?'30':'00'; return `${h}:${m}`; };
function renderSky(){ const PI=periodInfo(); const rose=roseFor(PI); const sd=LAB.S.impact.sun, D=DATES[sd.date]; const p=sunPos(D.doy,sd.hour,D.tz);
  const V=LAB.viz; $('sky').innerHTML=V.row(V.fig(sunPathSVG(),`Sun paths at the solstices and equinox, altitude inward. ${D.label}, ${fmtHour(sd.hour)}: ${p.alt>0?(p.alt*180/Math.PI).toFixed(0)+'° high, azimuth '+(p.az*180/Math.PI).toFixed(0)+'°':'below the horizon'}.`),V.fig(roseSVG(rose),`Wind rose for ${PI.full?'the year':PI.label}: petal length is share of hours, depth of colour the mean speed. Dominant: ${rose.slice().sort((x,y)=>y.f-x.f).slice(0,2).map(r=>r.name+' '+Math.round(r.f*100)+'%').join(', ')}.`)); }

/* ---------- UI ---------- */
const MODE_P={
  sun:{scope:{label:'Scope',options:[['date','the one date shown'],['period','the selected time period, sunshine-weighted']]},date:{label:'Date',options:Object.keys(DATES).map(k=>[k,DATES[k].label])},hour:{label:'Sun in the viewport at',min:6,max:20,step:0.5,fmt:fmtHour},h0:{label:'Study from',min:5,max:12,step:1,fmt:v=>v+':00'},h1:{label:'Study to',min:13,max:21,step:1,fmt:v=>v+':00'}},
  wind:{annual:{label:'Case',options:[[false,'one wind case'],[true,'the selected time period · seasonal wind rose, 8 sectors']]},dir:{label:'Wind from',min:0,max:355,step:5,fmt:v=>v+'° · '+['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(v/22.5)%16]},speed:{label:'Site wind speed at 10 m',min:1,max:15,step:0.5,fmt:v=>v.toFixed(1)+' m/s'},view:{label:'Overlay shows',options:[['comfort','pedestrian comfort with the tower'],['delta','change caused by the tower'],['strat','change made by the wind strategies']]}},
};
const pctF=v=>Math.round(v*100)+'%';
const ZONE_P={face:{label:'Face',options:[['all','all faces'],['N','North'],['E','East'],['S','South'],['W','West']]},from:{label:'From level',min:1,max:120,step:1,fmt:v=>'L'+v},to:{label:'To level',min:1,max:120,step:1,fmt:v=>'L'+v},
  strat:{label:'Strategy',options:Object.keys(STRATS).map(k=>[k,STRATS[k].name])},wwr:{label:'Window-to-wall ratio',min:0.1,max:0.9,step:0.05,fmt:pctF},shgc:{label:'Glazing SHGC',min:0.2,max:0.7,step:0.05,fmt:v=>v.toFixed(2)},
  depth:{label:'Device depth',min:0.1,max:3,step:0.1,fmt:v=>v.toFixed(1)+' m'},pv:{label:'PV on the spandrel',min:0,max:1,step:0.05,fmt:v=>v?pctF(v):'none'},operable:{label:'Openings',options:[[false,'fixed glazing'],[true,'operable windows or vents']]}};
const GLAZE_P={vt:{label:'Visible transmittance of the glass',min:0.3,max:0.8,step:0.05,fmt:v=>v.toFixed(2)}};
const PV_P={roof:{label:'Roofs and terraces covered',min:0,max:0.9,step:0.05,fmt:pctF},eff:{label:'Module efficiency',min:0.12,max:0.26,step:0.01,fmt:pctF},pr:{label:'Performance ratio',min:0.6,max:0.9,step:0.02,fmt:v=>v.toFixed(2)}};
const VENT_P={mode:{label:'Ventilation strategy',options:[['cross','cross ventilation · openings on two faces'],['single','single-sided · operable windows'],['stack','stack through atria or sky gardens']]},band:{label:'Comfort band',options:[['fixed','fixed outdoor air window'],['adaptive','ASHRAE 55 adaptive · 80% acceptability']]},tmin:{label:'Outdoor air usable from',min:8,max:18,step:0.5,fmt:v=>v.toFixed(1)+' °C'},tmax:{label:'Outdoor air usable up to',min:20,max:30,step:0.5,fmt:v=>v.toFixed(1)+' °C'},umax:{label:'Windows closed above',min:4,max:14,step:0.5,fmt:v=>v.toFixed(1)+' m/s gust'},open:{label:'Free opening area',min:0.02,max:0.4,step:0.01,fmt:v=>Math.round(v*100)+'% of the glass'},dT:{label:'Indoor–outdoor ΔT for stack flow',min:1,max:8,step:0.5,fmt:v=>v.toFixed(1)+' K'}};
const DL_P={target:{label:'Daylight target on the work plane',options:[[200,'200 lux · circulation'],[300,'300 lux · offices, LEED sDA'],[500,'500 lux · classrooms, studios']]}};
const WS_P={podiumH:{label:'Podium height',min:0,max:40,step:1,fmt:v=>v?v+' m':'none'},podiumExt:{label:'Podium reach beyond the tower',min:0,max:30,step:1,fmt:v=>v?v+' m':'none'},canopy:{label:'Entrance canopy depth',min:0,max:12,step:0.5,fmt:v=>v?v.toFixed(1)+' m':'none'},corners:{label:'Tower corners',options:[['sharp','sharp'],['chamfered','chamfered'],['rounded','rounded']]},shelter:{label:'Plaza planting and screens',min:0,max:1,step:0.05,fmt:v=>v?pctF(v)+' of plaza sheltered':'none'}};
let zoneSel=0;
function buildPeriodUI(){
  const host=$('period-presets'); PERIOD_PRESETS.forEach(([name,f,t])=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.textContent=name; b.dataset.f=f; b.dataset.t=t; b.addEventListener('click',()=>{ LAB.S.impact.period={from:f,to:t}; onPeriodChange(); }); host.appendChild(b); });
  const md=(el)=>{ const v=el.value; if(!v) return null; const p=v.split('-'); return p[1]+'-'+p[2]; };
  $('period-from').addEventListener('change',e=>{ const v=md(e.target); if(v){ LAB.S.impact.period.from=v; onPeriodChange(); } });
  $('period-to').addEventListener('change',e=>{ const v=md(e.target); if(v){ LAB.S.impact.period.to=v; onPeriodChange(); } });
  syncPeriodUI();
}
function onPeriodChange(){ syncPeriodUI(); stale.sun=true; stale.wind=true; showStale(); persist(); renderSky(); rerender(); }
function syncPeriodUI(){
  const P=LAB.S.impact.period, PI=periodInfo(); $('period-from').value='2026-'+P.from; $('period-to').value='2026-'+P.to;
  document.querySelectorAll('#period-presets .chip').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.f===P.from&&b.dataset.t===P.to)));
  const rose=roseFor(PI); const top=rose.slice().sort((x,y)=>y.f-x.f).slice(0,2).map(r=>r.name+' '+Math.round(r.f*100)+'%').join(', ');
  const sun=CLIMATE.sunshine.reduce((s,v,i)=>s+v*PI.monthDays[i]/CLIMATE.days[i],0);
  $('period-note').textContent=`${PI.full?'Whole year':PI.label} · ${PI.days} day${PI.days>1?'s':''} · about ${fmtI(sun)} sunshine hours, wind mostly from ${top}. Period studies, PV and ventilation use this range.`;
}
let stale={sun:false,wind:false,rain:false}, busy=false;
function showStale(){ if(busy) return; $('run-sun').textContent=stale.sun?'Run study (settings changed)':'Run study'; $('run-wind').textContent=stale.wind?'Run study (settings changed)':'Run study'; $('run-rain').textContent=stale.rain?'Run study (settings changed)':'Run study'; }
function renderRain(){ try{ setOut('rain',LAB.rain?LAB.rain.html():''); }catch(e){ console.error(e); } }
/* an uploaded mass entering Design development: ask whether to slice it into floors, or keep the plates found in the file */
function maybeSliceDialog(){ const U=LAB.upload; const dlg=$('slice-dialog'); if(!adv()||!U||LAB.S.typology!=='upload'){ dlg.hidden=true; return; } const pc=document.getElementById('parts-dialog'); if(pc&&!pc.hidden) return; if(U.fromParts){ SW.sliceOK=SW.sliceOK||{}; SW.sliceOK[String(LAB.uploadRaw?LAB.uploadRaw.version:0)]=true; dlg.hidden=true; return; } SW.sliceOK=SW.sliceOK||{}; const key=String(LAB.uploadRaw?LAB.uploadRaw.version:0); if(SW.sliceOK[key]){ dlg.hidden=true; return; }
  // 1. scan the model for floor plates; 2. offer them, or an even slice at the set floor-to-floor height when there are none
  $('slice-f2f').value=LAB.S.f2f; $('slice-text').textContent='Scanning the model for floor plates…'; $('slice-apply').hidden=true; $('slice-keep').hidden=true; $('slice-row').hidden=true; dlg.hidden=false; LAB.tabs.show('model');
  setTimeout(()=>{ try{ if(LAB.scanLevels) LAB.scanLevels(U); }catch(e){ console.error(e); } sliceText(); },60); }
function sliceText(){ const U=LAB.upload; if(!U) return; const f=parseFloat($('slice-f2f').value)||LAB.S.f2f; const n=Math.max(1,Math.floor(U.top/f)); const sc=U.scan||{};
  if(U.levels){ $('slice-text').textContent=`Scan found ${U.plates} floor plates in the file: horizontal faces covering a fifth or more of the footprint at ${U.span?U.span[0].toFixed(1)+'–'+U.span[1].toFixed(1)+' m':'several heights'}, typical storey ${U.typical.toFixed(1)} m${U.gaps?' (from '+U.gaps[0].toFixed(1)+' to '+U.gaps[1].toFixed(1)+' m)':''}. Design development studies the interior floor by floor: use these plates, or slice the mass evenly instead.`;
    $('slice-keep').textContent=`Use the ${U.plates} floor plates found`; $('slice-keep').hidden=false; $('slice-apply').textContent=`Slice evenly into ${n} floors at ${f} m instead`; $('slice-apply').classList.remove('primary'); $('slice-keep').classList.add('primary'); }
  else { $('slice-text').textContent=`Scan found no usable floor plates: ${U.reason||'the model is a solid mass'}. The mass will be sliced at a set floor-to-floor height instead: ${n} floors at ${f} m from a ${U.top.toFixed(0)} m model.`;
    $('slice-keep').hidden=true; $('slice-apply').textContent=`Slice into ${n} floors at ${f} m`; $('slice-apply').classList.add('primary'); }
  $('slice-apply').hidden=false; $('slice-row').hidden=false; }
function sliceDecision(useLevels){ const U=LAB.upload; if(!U) return; SW.sliceOK=SW.sliceOK||{}; SW.sliceOK[String(LAB.uploadRaw?LAB.uploadRaw.version:0)]=true; const f=parseFloat($('slice-f2f').value); if(!useLevels&&f>=2.4&&f<=9){ LAB.S.f2f=f; } U.useLevels=!!useLevels&&!!U.levels; $('slice-dialog').hidden=true; persist(); LAB.update(); updateGeomInfo(); }
const live=()=>{ persist(); syncGeometry(); if(adv()){ if(sunResult) stale.sun=true; if(windResult) stale.wind=true; showStale(); } rerender(); };
function buildZoneUI(){
  LAB.controlsFor($('zone-editor'),ZONE_P,'zn',()=>SW.zones[zoneSel],(k)=>{ const z=SW.zones[zoneSel]; if(!z) return;
    if(k==='strat'){ Object.assign(z,clone(STRATS[z.strat].d)); } if(k==='from'&&z.to<z.from) z.to=z.from; if(k==='to'&&z.to<z.from) z.from=z.to;
    syncZoneUI(); live(); });
  $('zone-add').addEventListener('click',()=>{ const nF=LAB.floors?LAB.floors.length:60; const base=SW.zones[zoneSel]||DEFAULT_ZONES[2]; const z=Object.assign(clone(DEFAULT_ZONE),{face:base.face,from:Math.min(nF,base.to>=nF?Math.max(1,Math.round(nF*0.6)):base.to+1),to:nF,strat:'overhang'},clone(STRATS.overhang.d)); z.operable=true; SW.zones.push(z); zoneSel=SW.zones.length-1; syncZoneUI(); live(); });
  $('zone-remove').addEventListener('click',()=>{ if(!SW.zones.length) return; SW.zones.splice(zoneSel,1); zoneSel=Math.max(0,Math.min(zoneSel,SW.zones.length-1)); syncZoneUI(); live(); });
  $('zone-reset').addEventListener('click',()=>{ SW.zones=clone(DEFAULT_ZONES); zoneSel=0; syncZoneUI(); live(); });
}
function syncZoneUI(){
  const host=$('zone-chips'); host.innerHTML=''; const nF=LAB.floors?LAB.floors.length:120;
  if(zoneSel>=SW.zones.length) zoneSel=SW.zones.length-1; if(zoneSel<0&&SW.zones.length) zoneSel=0;
  SW.zones.forEach((z,i)=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.setAttribute('aria-pressed',String(i===zoneSel)); const st=STRATS[z.strat]; b.innerHTML=`<i class="zi ${z.face}"></i>${zoneLabel(z)} · ${st.name}${st.device&&z.depth?' '+z.depth.toFixed(1)+' m':''}`; b.addEventListener('click',()=>{ zoneSel=i; syncZoneUI(); }); host.appendChild(b); });
  const ed=$('zone-editor'); const z=SW.zones[zoneSel]; ed.hidden=!z; $('zone-remove').disabled=!z; if(!z){ $('zone-blurb').textContent='No zones: every face is a 40% curtain wall.'; return; }
  for(const k of ['from','to']){ const el=$('zn-'+k); el.max=nF; } if(z.to>nF) z.to=nF;
  LAB.syncFor(ed,ZONE_P,'zn',z); const st=STRATS[z.strat];
  const vis=(k,on,label)=>{ const el=ed.querySelector(`[data-param="${k}"]`); if(!el) return; el.hidden=!on; if(label) el.querySelector('label').textContent=label; };
  vis('depth',!!(st.device||st.depthLabel),st.depthLabel||'Device depth'); vis('pv',true,z.strat==='pvspandrel'?'PV on the spandrel':'PV on the spandrel (optional)');
  $('zone-blurb').textContent=st.blurb;
}
function buildUI(){
  document.querySelectorAll('#mode-switch button').forEach(b=>b.addEventListener('click',()=>setStudioMode(b.dataset.mode)));
  for(const m of ['sun','wind']){
    LAB.controlsFor($('params-'+m),MODE_P[m],'im'+m,()=>LAB.S.impact[m],(k)=>{
      syncUI(); persist();
      if(m==='sun'&&(k==='hour'||k==='date')){ applySunView(); renderSky(); renderPlan(); if(k==='hour') return; }
      if(m==='wind'&&k==='view'){ drawWindOverlay(); return; }
      if(m==='wind') renderPlan();
      stale[m]=true; showStale(); });
  }
  $('plan-level').addEventListener('change',e=>{ SW.planLevel=parseInt(e.target.value,10)||1; persist(); renderPlan(); });
  $('plan-up').addEventListener('click',()=>{ SW.planLevel=planLevel()+1; persist(); renderPlan(); }); $('plan-down').addEventListener('click',()=>{ SW.planLevel=planLevel()-1; persist(); renderPlan(); });
  $('run-sun').addEventListener('click',()=>{ setMode('sun'); runCurrent(true); });
  $('run-wind').addEventListener('click',()=>{ setMode('wind'); runCurrent(true); });
  $('run-all').addEventListener('click',()=>runAll());
  $('run-daylight').addEventListener('click',()=>{ setMode('sun'); if(!busy) runStudy('sun'); });
  $('run-vent').addEventListener('click',()=>{ setMode('wind'); if(!busy) runStudy('wind'); });
  $('run-active').addEventListener('click',()=>{ if(busy) return; const m=LAB.S.impact.mode==='wind'?'wind':(LAB.S.impact.mode==='rain'?'rain':'sun'); setMode(m); runStudy(m); });
  buildReportUI();
  const presets=$('wind-presets'); CLIMATE.winds.forEach(w=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.textContent=w.label; b.addEventListener('click',()=>{ LAB.S.impact.wind.dir=w.dir; LAB.S.impact.wind.speed=w.speed; LAB.S.impact.wind.annual=false; syncUI(); setMode('wind'); runCurrent(true); }); presets.appendChild(b); });
  $('view-sun').addEventListener('click',()=>{ const on=LAB.S.impact.mode!=='sun'; setMode(on?'sun':'none'); if(on) LAB.tabs.show('sun'); });
  $('view-wind').addEventListener('click',()=>{ const on=LAB.S.impact.mode!=='wind'; setMode(on?'wind':'none'); if(on) LAB.tabs.show('wind'); });
  $('view-rain').addEventListener('click',()=>{ const on=LAB.S.impact.mode!=='rain'; setMode(on?'rain':'none'); if(on) LAB.tabs.show('rain'); });
  $('run-rain').addEventListener('click',()=>{ setMode('rain'); if(!busy) runStudy('rain'); });
  $('slice-apply').addEventListener('click',()=>sliceDecision(false)); $('slice-keep').addEventListener('click',()=>sliceDecision(true)); $('slice-f2f').addEventListener('input',()=>{ if(!$('slice-dialog').hidden) sliceText(); });
  $('reslice').addEventListener('click',()=>{ SW.sliceOK=SW.sliceOK||{}; delete SW.sliceOK[String(LAB.uploadRaw?LAB.uploadRaw.version:0)]; maybeSliceDialog(); if(!adv()) LAB.toast&&LAB.toast('Slicing options open in Design development.'); });
  if(LAB.rain) LAB.rain.buildUI();
  // true views: the core's handlers run first and set the orbit; these refine them
  $('view-top').addEventListener('click',()=>{ if(clip.on&&clip.kind==='v') setClip({on:false}); setViewMode(true,false,0,0); planFrame(true); });
  $('view-elev').addEventListener('click',()=>{ const th=view.ortho&&!view.section&&LAB.orbit.phi>1.5?LAB.orbit.theta+Math.PI/2:0; setClip({on:false}); setViewMode(true,false,th,Math.PI/2); });
  // one section view: where it cuts and which way it looks are set on the key plan, not by pressing the button again
  $('view-section').addEventListener('click',()=>{ if(!(clip.on&&clip.kind==='v')) setClip({on:true,kind:'v',ang:0,flip:false,off:0}); SHEET.key=null; setViewMode(true,true,clip.ang+(clip.flip?Math.PI:0),Math.PI/2); });
  $('view-iso').addEventListener('click',()=>setViewMode(false,false)); $('view-site').addEventListener('click',()=>{ view.ortho=false; view.section=false; syncViewButtons(); LAB.requestRender(); });
  buildClipUI();
  buildZoneUI();
  LAB.controlsFor($('params-glazing'),GLAZE_P,'gl',()=>SW.glaz,()=>{ LAB.syncFor($('params-glazing'),GLAZE_P,'gl',SW.glaz); persist(); if(sunResult) stale.sun=true; showStale(); rerender(); });
  LAB.controlsFor($('params-pv'),PV_P,'pv',()=>SW.pv,()=>{ LAB.syncFor($('params-pv'),PV_P,'pv',SW.pv); live(); });
  LAB.controlsFor($('params-vent'),VENT_P,'vt',()=>SW.vent,()=>{ syncVentUI(); persist(); if(windResult) stale.wind=true; showStale(); rerender(); });
  LAB.controlsFor($('params-dl'),DL_P,'dl',()=>SW.dl,()=>{ LAB.syncFor($('params-dl'),DL_P,'dl',SW.dl); persist(); if(sunResult) stale.sun=true; showStale(); rerender(); });
  LAB.controlsFor($('params-ws'),WS_P,'ws',()=>SW.ws,()=>{ LAB.syncFor($('params-ws'),WS_P,'ws',SW.ws); persist(); syncGeometry(); stale.wind=true; if(sunResult) stale.sun=true; showStale(); if(LAB.S.impact.mode==='wind') renderWind(windResult); });
  $('c-raw').addEventListener('change',e=>{ SW.show.raw=e.target.checked; persist(); syncGeometry(); if(sunResult) stale.sun=true; showStale(); updateGeomInfo(); });
  const lp=document.getElementById('p-labelPt'); if(lp) lp.addEventListener('input',()=>flattenLabels());
  buildPeriodUI();
  syncUI();
}
function syncVentUI(){ const host=$('params-vent'); LAB.syncFor(host,VENT_P,'vt',SW.vent); const ad=SW.vent.band==='adaptive'; for(const k of ['tmin','tmax']){ const el=host.querySelector(`[data-param="${k}"]`); if(el) el.style.opacity=ad?'.4':'1'; } const dt=host.querySelector('[data-param="dT"]'); if(dt) dt.hidden=SW.vent.mode==='cross'; }
function setStudioMode(m){ if(SW.mode===m) return; SW.mode=m; persist(); document.body.dataset.mode=m; syncGeometry(); placeControls(); setTimeout(maybeSliceDialog,0); { const t=document.querySelector('#tabs button[aria-selected="true"]'); const cur=t?t.dataset.tab:'model'; if(m==='basic'&&['strat','daylight','vent','energy'].includes(cur)) LAB.tabs.show(cur==='vent'?'wind':(cur==='energy'?'eff':'sun')); else if(m==='advanced'&&(cur==='sun'||cur==='wind'||cur==='eff')) LAB.tabs.show(cur==='wind'?'vent':(cur==='eff'?'energy':'strat')); }
  if(sunResult){ stale.sun=true; } if(windResult&&(!!windResult.strat)!==stratActive()){ stale.wind=true; } showStale(); syncUI(); updateGeomInfo(); rerender(); phaseView(m); }
/* Design development opens in plan view (the floor plan it studies); back in Massing a plan the switch set returns to 3D */
function phaseView(m){ const o=LAB.orbit; if(m==='advanced'){ if(!(view.ortho&&!view.section&&o.phi<0.05)) $('view-top').click(); } else if(view.ortho&&!view.section&&o.phi<0.05) $('view-iso').click(); }
function setMode(m){ if(LAB.S.impact.mode===m) return; setTimeout(()=>setTone(curTab),0); const wasRain=LAB.S.impact.mode==='rain'; LAB.S.impact.mode=m; syncUI(); clearOverlay(); applySunView(); if((m==='rain')!==wasRain){ LAB.S.water.on=(m==='rain'); LAB.update(); } if(!busy) runCurrent(false); persist(); }
function onTab(name){ if(['strat','daylight','vent','energy'].includes(name)&&!adv()){ LAB.tabs.show(name==='energy'?'eff':'sun'); return; } if((name==='sun'||name==='wind'||name==='eff')&&adv()){ LAB.tabs.show(name==='sun'?'daylight':(name==='wind'?'vent':'energy')); return; }
  const was=curTab; curTab=name; const pb=$('period-block'); pb.hidden=!['sun','wind','strat','daylight','vent','report','rain'].includes(name);
  if(!pb.hidden){ const sec=document.querySelector('.tab[data-tab="'+name+'"]'); const h=sec&&sec.querySelector('h1.ptitle'); if(h&&h.nextElementSibling!==pb) h.insertAdjacentElement('afterend',pb); } if(name==='sun'||name==='daylight') setMode('sun'); if(name==='wind'||name==='vent') setMode('wind'); if(name==='rain') setMode('rain'); if(name==='strat'&&LAB.S.impact.mode==='none') setMode('sun'); if(name==='report') syncReportUI(); if(!adv()&&(name==='eff'||was==='eff')) rerender(); else if(adv()&&was!==name) setOut(null); }
function syncUI(){
  for(const m of ['sun','wind']) LAB.syncFor($('params-'+m),MODE_P[m],'im'+m,LAB.S.impact[m]);
  const sd=LAB.S.impact.sun; const dateCtl=document.querySelector('#params-sun [data-param="date"]'); if(dateCtl) dateCtl.querySelector('label').textContent=sd.scope==='date'?'Date':'Date shown in the viewport';
  const W=LAB.S.impact.wind; document.querySelectorAll('#params-wind [data-param="dir"], #params-wind [data-param="speed"]').forEach(el=>{ el.style.opacity=W.annual?'.45':'1'; });
  const vs=document.querySelector('#params-wind [data-param="view"] option[value="strat"]'); if(vs) vs.hidden=!adv();
  const m=LAB.S.impact.mode;
  $('view-sun').setAttribute('aria-pressed',String(m==='sun')); $('view-wind').setAttribute('aria-pressed',String(m==='wind')); $('view-rain').setAttribute('aria-pressed',String(m==='rain')); updateLegend();
  document.querySelectorAll('#mode-switch button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===SW.mode)));
  document.body.dataset.mode=SW.mode;
  LAB.syncFor($('params-glazing'),GLAZE_P,'gl',SW.glaz); LAB.syncFor($('params-pv'),PV_P,'pv',SW.pv); syncVentUI(); LAB.syncFor($('params-dl'),DL_P,'dl',SW.dl); LAB.syncFor($('params-ws'),WS_P,'ws',SW.ws); syncZoneUI(); syncViewButtons();
  $('c-raw').checked=!!SW.show.raw;
  $('mode-banner').innerHTML=adv()?'<b>Design review</b> · the façade zones drive the model, the floor plan and the LEED v4.1 readings below. Edits re-read the façade instantly; a flag appears when daylight or ventilation need a rerun.':'<b>Site impact</b> · massing phase: how the form shades neighbours and plazas, how much sun it takes and receives, and how it changes the wind at street level. The model is shown as solid blocks.';
  syncReportUI();
}
function updateGeomInfo(){ const R=LAB.uploadRaw; const el=$('geom-info'); $('lod-block').hidden=!R;
  if(!R){ el.innerHTML=''; return; } const gi=$('up-grade'); if(gi&&document.activeElement!==gi&&LAB.groundZ) gi.value=LAB.groundZ().toFixed(1);
  el.innerHTML=`<p class="blurb" style="margin-top:0"><b>${R.name}</b>: ${R.massing.length} massing object${R.massing.length>1?'s':''}, ${R.shading.length} shading, ${R.pv.length} PV${R.pv.length?' ('+fmtI(meshArea(R.pv))+' m²)':''}. ${useRaw()?(adv()?'Shown and studied as modeled with every layer, so fins, overhangs, balconies and voids in the file shade the façades; zone devices are added on top.':'Shown and studied as the massing layer alone; switch to Design development to bring in the shading and PV layers.'):'Shown and studied as the sliced massing; turn the modeled geometry on to use the file itself.'}</p><p class="blurb"><b>Floors:</b> ${LAB.uploadSummary?LAB.uploadSummary():''} · ${LAB.floors?LAB.floors.length:0} floors in the study.</p>`;
  $('reslice').hidden=!adv(); if(LAB.help) LAB.help.apply(el); if(LAB.modelParts){ const P=LAB.modelParts; el.insertAdjacentHTML('beforeend',`<p class="blurb"><b>Parts confirmed:</b> ${['floor','core','window','facade','structure','stair','ceiling','roof'].filter(k=>P.counts[k]&&P.confirmed[k]).map(k=>P.counts[k]+' '+({floor:'floor plates',core:'core',window:'windows',facade:'façade',structure:'structure',stair:'stairs',ceiling:'ceilings',roof:'roof'})[k]).join(', ')||'none'}${P.wwr?' · window-to-wall '+['N','E','S','W'].map(k=>k+' '+(P.wwr[k]==null?'–':Math.round(P.wwr[k]*100)+'%')).join(' '):''}${P.ceilingH?' · floor-to-ceiling '+P.ceilingH.toFixed(2)+' m':''}${P.openings&&P.openings.head!=null?` · windows from ${P.openings.sill.toFixed(2)} to ${P.openings.head.toFixed(2)} m above the floor on ${P.openings.levels} levels; the façade zones and their shading hang from these heads`:''}</p>`); }
}
/* one study as a promise: the sun render (plus daylight and ASE in Advanced) or the wind flow (plus ventilation in Advanced) */
/* buttons that start a study spin while it runs; the analysis bar shows a moving stripe */
const RUN_BTNS={sun:['run-sun','run-daylight','run-active'],wind:['run-wind','run-vent','run-active'],rain:['run-rain','run-active']};
function busyLook(kind,on){ (RUN_BTNS[kind]||[]).forEach(id=>{ const b=$(id); if(b){ b.classList.toggle('is-busy',on); b.classList.remove('is-done'); b.setAttribute('aria-busy',String(on)); } }); const bar=$('abar'); if(bar) bar.classList.toggle('busy',on); }
function progressTo(kind,msg){ $('run-'+kind).textContent=msg; $('run-all-status').textContent=msg; $(kind==='sun'?'run-daylight-status':kind==='wind'?'run-vent-status':'run-rain-status').textContent=msg; $('run-active').textContent=msg; $('run-active').disabled=true; busyLook(kind,true); }
let doneTimer=0;
function runStudy(kind){
  const t0=performance.now();
  return new Promise(resolve=>{ busy=true; progressTo(kind,'Computing…'); setTimeout(async()=>{
    try{ if(kind==='sun'){ runSunStudy(); if(adv()&&sunResult){ progressTo('sun','Daylight factors…'); await new Promise(r=>setTimeout(r,20)); sunResult.daylight=daylightTower(); sunResult.ase=await aseTower(msg=>progressTo('sun',msg)); sunResult.advanced=true; } if(sunResult) sunResult.at=Date.now(); }
      else if(kind==='rain'){ await LAB.rain.run(msg=>progressTo('rain',msg)); }
      else { await runWindStudy(msg=>progressTo('wind',msg)); if(adv()&&windResult){ progressTo('wind','Natural ventilation…'); windResult.vent=ventStudy(); windResult.vt=ventTowerQuick(); windResult.terr=terraceWind(); windResult.advanced=true; } if(windResult) windResult.at=Date.now(); }
    }catch(e){ console.error(e); LAB.toast&&LAB.toast((kind==='sun'?'Sun':kind==='rain'?'Rain':'Wind')+' study failed: '+e.message,true); }
    { const wait=700-(performance.now()-t0); if(wait>0) await new Promise(r=>setTimeout(r,wait)); } // long enough to see that it ran
    busy=false; busyLook(kind,false); stale[kind]=false; showStale(); $('run-all-status').textContent=''; $('run-daylight-status').textContent=''; $('run-vent-status').textContent=''; $('run-rain-status').textContent=''; updateLegend(); if(kind==='sun') renderSun(sunResult); else if(kind==='rain') renderRain(); else renderWind(windResult);
    { const b=$('run-active'); b.textContent='Done ✓'; b.classList.add('is-done'); clearTimeout(doneTimer); doneTimer=setTimeout(()=>{ b.classList.remove('is-done'); if(!busy) updateLegend(); },1400); }
    resolve(); },30); });
}
function runCurrent(force){
  const m=LAB.S.impact.mode, floors=LAB.floors; if(!floors) return;
  const out=$('impact-out'); out.hidden=m==='none'&&!adv(); if(m==='none'){ clearOverlay(); if(adv()) rerender(); return; }
  if(busy) return;
  if(m==='sun'){ if(force) runStudy('sun'); else { drawSunOverlay(); renderSun(sunResult); } }
  else if(m==='wind'){ if(force) runStudy('wind'); else { drawWindOverlay(); renderWind(windResult); } }
  else if(m==='rain'){ if(force) runStudy('rain'); else { if(LAB.rain) LAB.rain.drawOverlay(); renderRain(); } }
}
/* Advanced step 3: both studies in one go, then the live report */
async function runAll(){ if(busy||!LAB.floors) return; const b=$('run-all'); b.disabled=true; try{ setMode('sun'); await runStudy('sun'); LAB.S.impact.mode='wind'; syncUI(); await runStudy('wind'); LAB.S.impact.mode='sun'; syncUI(); clearOverlay(); drawSunOverlay(); applySunView(); } finally{ b.disabled=false; rerender(); } }
const sections={sun:'',wind:'',rain:''}; let curTab='model';
/* glazing of a floor face for the energy model: the façade zone's window-to-wall ratio and SHGC, with the device transmission measured by the last sun run */
let tMap=null;
function zoneGlazing(fl,o){ const z=zoneFor(o,fl.i+1); if(!tMap){ tMap={}; if(sunResult&&sunResult.dayData){ try{ const A=solarStudy(sunResult); for(const Z of A.zones) tMap[Z.i]=Z.tAvg; }catch(e){} } } const idx=SW.zones.indexOf(z); const t=idx>=0&&tMap[idx]!=null?tMap[idx]:(STRATS[z.strat].mod||1); return {wwr:z.wwr,shgc:z.shgc,t,strat:z.strat}; }
function energyChanged(){ persist(); rerender(); }
function energySection(){ if(!LAB.energy||!LAB.floors) return ''; try{ return adv()?LAB.energy.energyHTML():LAB.energy.formHTML(); }catch(e){ console.error(e); return ''; } }
/* ---------- program fit: how the façade and the plate serve each floor's program ----------
   Indicative needs per program: daylit share of the floor (sDA300/50%, climate-based), annual sunlight exposure (ASE, too much or too little),
   and fresh air (share of the floor within 8 m of an operable opening). Daylight and air read live from the façade zones and
   the plate; ASE comes with the sun study. */
const FIT={office:{dl:0.55,aseMax:0.10},studio:{dl:0.55,aseMax:0.05},hotel:{dl:0.40,aseMax:0.20,air:0.8},resi:{dl:0.40,aseMin:0.03,aseMax:0.30,air:0.8},retail:{dl:0.20,aseMax:0.15},public:{dl:0.40,aseMax:0.20},observation:{aseMax:0.35},amenity:{aseMin:0.15},boh:{},mep:{}};
const FIT_COL={ok:'#4E9A5B',near:'#D9A441',bad:'#C2453B',wait:'#E3E5E8',na:'#F6F6F4'};
const FIT_NAME={dl:'Daylight',sun:'Sun',air:'Fresh air'};
function fitRows(){ const floors=LAB.floors||[]; const r=sunResult; const DL=(r&&r.daylight)||daylightTowerCached(); const ASE=r&&r.ase; const VT=ventTowerQuick();
  const at=(rows,i)=>rows?rows.find(x=>x.i===i):null;
  return floors.map(f=>{ const q=FIT[f.prog]||{}; const d=at(DL&&DL.rows,f.i), a=at(ASE&&ASE.rows,f.i), v=at(VT&&VT.rows,f.i); const c={};
    c.dl=q.dl==null?{st:'na'}:(d?{v:d.pctLit,st:d.pctLit>=q.dl?'ok':(d.pctLit>=q.dl*0.8?'near':'bad'),need:'≥ '+Math.round(q.dl*100)+'%',lo:d.pctLit<q.dl}:{st:'wait'});
    if(q.aseMax==null&&q.aseMin==null) c.sun={st:'na'}; else if(!a) c.sun={st:'wait'}; else { const hi=q.aseMax!=null&&a.pct>q.aseMax, lo=q.aseMin!=null&&a.pct<q.aseMin; const near=(hi&&a.pct<=q.aseMax*1.25)||(lo&&a.pct>=q.aseMin*0.75); c.sun={v:a.pct,st:!hi&&!lo?'ok':(near?'near':'bad'),hi,lo,need:[q.aseMin!=null?'≥ '+Math.round(q.aseMin*100)+'%':'',q.aseMax!=null?'≤ '+Math.round(q.aseMax*100)+'%':''].filter(Boolean).join(' and ')}; }
    c.air=q.air==null?{st:'na'}:(v?{v:v.operable?v.within8:0,st:(v.operable?v.within8:0)>=q.air?'ok':((v.operable?v.within8:0)>=q.air*0.8?'near':'bad'),need:'≥ '+Math.round(q.air*100)+'% within 8 m',closed:!v.operable}:{st:'wait'});
    return {f,c}; }); }
function fitSVG(rows,cols){ const n=rows.length, rh=Math.max(4,Math.min(14,440/Math.max(1,n))), L=46, PW=14, W=380, cw=(W-L-PW-12)/cols.length, T=22, H=T+rh*n+6;
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Program fit by floor" data-key="program-fit"><style>text{font-family:var(--font-m);font-size:8.5px;fill:var(--muted)}</style>`;
  cols.forEach((k,j)=>{ s+=`<text x="${(L+PW+8+cw*j+cw/2).toFixed(1)}" y="12" text-anchor="middle" style="fill:var(--ink);font-weight:600">${FIT_NAME[k]}</text>`; });
  const lstep=Math.max(1,Math.ceil(10/rh));
  rows.slice().reverse().forEach((R,k)=>{ const y=T+k*rh; const f=R.f; const P=LAB.PROG[f.prog]; if(k%lstep===0||k===n-1) s+=`<text x="${L-4}" y="${(y+rh/2+3).toFixed(1)}" text-anchor="end">L${f.i+1}</text>`;
    s+=`<rect x="${L}" y="${y.toFixed(1)}" width="${PW}" height="${(rh-1).toFixed(1)}" fill="${(LAB.program&&LAB.program.color(f.prog))||'#9AA0A6'}"><title>L${f.i+1} · ${P?P.name:''}</title></rect>`;
    cols.forEach((key,j)=>{ const c=R.c[key]; const x=L+PW+8+cw*j; const txt=c.v!=null?Math.round(c.v*100)+'%':''; s+=`<rect x="${(x+1).toFixed(1)}" y="${y.toFixed(1)}" width="${(cw-2).toFixed(1)}" height="${(rh-1).toFixed(1)}" rx="1.5" fill="${FIT_COL[c.st]}"${c.st==='na'?' stroke="#E6E6E2"':''}><title>L${f.i+1} ${P?P.short:''} · ${FIT_NAME[key]} ${c.st==='na'?'not needed for this program':(c.st==='wait'?'run the study':txt+' · needs '+c.need)}</title></rect>`; if(rh>=11&&txt) s+=`<text x="${(x+cw/2).toFixed(1)}" y="${(y+rh/2+3).toFixed(1)}" text-anchor="middle" style="fill:${c.st==='ok'||c.st==='bad'?'#fff':'#1F2227'}">${txt}</text>`; }); });
  return s+'</svg>'; }
/* problems grouped by runs of one program, each with the façade move that helps */
function fitIssues(rows,cols){ const out=[]; const MOVE={dl:'raise the window-to-wall ratio or the glass VT on these levels, cut the device depth, or give this program a shallower plate',hi:'deepen the overhang or fins on the sunny faces of these levels, or lower the window-to-wall ratio',lo:'this program wants sun: lighten the shading on these levels, or move it higher or to the south',air:'make the façade zones on these levels operable, or keep the plate within 8 m of an opening'};
  for(const key of cols){ let cur=null; const flush=()=>{ if(cur) out.push(cur); cur=null; };
    for(const R of rows){ const c=R.c[key]; const bad=c.st==='bad'||c.st==='near'; const kind=key==='sun'?(c.hi?'hi':'lo'):(key==='air'?'air':'dl'); const id=R.f.prog+'|'+kind;
      if(bad&&cur&&cur.id===id&&cur.to===R.f.i-1){ cur.to=R.f.i; cur.vals.push(c.v); continue; } flush(); if(bad) cur={id,key,kind,prog:R.f.prog,from:R.f.i,to:R.f.i,vals:[c.v],need:c.need,worst:c.st}; } flush(); }
  return out.map(x=>{ const P=LAB.PROG[x.prog]; const avg=x.vals.reduce((a,b)=>a+(b||0),0)/x.vals.length; const rng=x.from===x.to?'L'+(x.from+1):`L${x.from+1}–L${x.to+1}`;
    return `<li><i style="background:${(LAB.program&&LAB.program.color(x.prog))||'#9AA0A6'}"></i><b>${P?P.short:''} ${rng}</b><span class="fi-tag" style="background:${FIT_COL[x.worst]}">${FIT_NAME[x.key]} ${Math.round(avg*100)}%</span><span class="fi-need">needs ${x.need}</span><span class="fi-move">${MOVE[x.kind]}</span></li>`; }).join(''); }
function programFitHTML(kind){ if(!adv()||!LAB.floors||!LAB.floors.length) return ''; const V=LAB.viz; const cols=kind==='light'?['dl','sun']:(kind==='air'?['air']:['dl','sun','air']);
  const rows=fitRows(); const need=rows.filter(R=>cols.some(k=>R.c[k].st!=='na')); const ok=need.filter(R=>cols.every(k=>['ok','na','wait'].includes(R.c[k].st))&&cols.some(k=>R.c[k].st==='ok')).length; const bad=need.filter(R=>cols.some(k=>R.c[k].st==='bad')).length; const wait=need.filter(R=>cols.some(k=>R.c[k].st==='wait')).length;
  const issues=fitIssues(rows,cols);
  return `<h2>Program fit · ${kind==='light'?'light':kind==='air'?'fresh air':'all floors'}</h2><div class="kpi">${kp('Floors that suit their program',ok+' of '+need.length,wait?'so far, on what has been read':'',ok===need.length&&need.length?'ok':'')}${kp('Need a change',bad,bad?'red in the matrix':'none',bad?'over':'ok')}${wait?kp('Waiting for a run',wait,'floors without a sun study'):''}</div>`
    +V.fig(fitSVG(rows,cols),'<span class="fit-key"><i style="background:'+FIT_COL.ok+'"></i>suits <i style="background:'+FIT_COL.near+'"></i>close <i style="background:'+FIT_COL.bad+'"></i>short <i style="background:'+FIT_COL.wait+'"></i>run the study <i style="background:'+FIT_COL.na+';outline:1px solid #E6E6E2"></i>not needed</span>')
    +(issues?`<ul class="fit-issues">${issues}</ul>`:''); }
/* Design development splits each panel: the inside of the floor plate first (with its floor plan and program fit), then the façade or the outside */
const PLAN_MARK='<!--plan-->', FIT_MARK='<!--fit-->';
const partHead=(k,t,sub)=>`<div class="part-head part-${k}"><b>${t}</b><span>${sub}</span></div>`;
/* the review panel shows only the study of the tab you are on; Model, Site, Design and Report show the whole review */
function focusOf(){ return ({sun:'sun',daylight:'sun',wind:'wind',vent:'wind',rain:'rain',energy:'energy',eff:'energy'})[curTab]||null; }
function setOut(kind,html){ if(kind) sections[kind]=html; { const bn=document.getElementById('mode-banner'); if(bn) bn.hidden=adv()&&!!focusOf(); } const out=$('impact-out'); const pb=document.getElementById('plan-block'); tMap=null;
  if(adv()){ out.hidden=false; const f=focusOf(); const withPlan=f==='sun'||f==='wind'; const place=(h,fit)=>{ h=h||''; const slot=withPlan?'<div id="plan-slot"></div>':''; h=h.includes(PLAN_MARK)?h.replace(PLAN_MARK,slot):slot+h; return h.includes(FIT_MARK)?h.replace(FIT_MARK,fit):h+fit; }; const body=!f?programFitHTML('all'):(f==='energy'?energySection():f==='sun'?place(sections.sun,programFitHTML('light')):f==='wind'?place(sections.wind,programFitHTML('air')):sections[f]); out.innerHTML=(!f?reportHead():'')+body; const slot=document.getElementById('plan-slot'); if(slot&&pb) slot.appendChild(pb); else { const home=document.getElementById('plan-home'); if(pb&&home&&pb.parentNode!==home) home.appendChild(pb); } const home=document.getElementById('plan-home'); if(home) home.hidden=!withPlan; if(withPlan&&planFor!==planKind()) try{ renderPlan(); }catch(e){ console.error(e); } }
  else { out.hidden=false; const S=LAB.S, floors=LAB.floors||[]; const name=S.typology==='upload'&&LAB.uploadRaw?LAB.uploadRaw.name:LAB.TYP[S.typology].name; const what=curTab==='eff'?'Massing efficiency':(kind==='sun'?'Sun and shadow':kind==='wind'?'Pedestrian wind':'Rain');
    const r=kind==='sun'?sunResult:(kind==='wind'?windResult:(LAB.rain&&LAB.rain.result)); const head=`<div class="report-head"><div class="rh-title"><h2 style="margin:0">Site impact · ${what}</h2><span class="rh-meta">${name} · ${S.height} m · ${floors.length} floors · ${curTab==='eff'?'live from the massing':(r?'run '+fmtTime(r.at):'not yet run')}${!curTab.match(/eff/)&&stale[kind]&&r?' · <span class="rh-stale">settings changed, run again</span>':''}</span></div></div>`;
    out.innerHTML=head+(curTab==='eff'?energySection():html); const home=document.getElementById('plan-home'); if(pb&&home&&pb.parentNode!==home) home.appendChild(pb); }
  if(LAB.help) LAB.help.apply(out); }
function fmtTime(t){ if(!t) return 'not yet run'; const d=new Date(t); return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
function reportHead(){
  const S=LAB.S, floors=LAB.floors||[]; const gfa=floors.reduce((s,f)=>s+f.area,0); const PI=periodInfo(); const sd=S.impact.sun, W=S.impact.wind;
  const name=S.typology==='upload'&&LAB.uploadRaw?LAB.uploadRaw.name:LAB.TYP[S.typology].name; const r=sunResult, w=windResult; const A=r&&r.dayData?solarStudy(r):null;
  const k=(label,v,sub,cls)=>`<div><small>${label}</small><b class="${cls||''}">${v}</b>${sub?`<em>${sub}</em>`:''}</div>`;
  let kp='';
  if(r){ if(r.daylight) kp+=k('Daylit floor',Math.round(r.daylight.sda*100)+'%','sDA300/50% · LEED 55% for 2 pts',r.daylight.sda>=0.55?'ok':''); if(A) kp+=k('Heat through glazing',fmtI(A.shTot),`${r.perDay?'kWh, clear day':'kWh in the period'} · ${Math.round(A.blocked*100)}% blocked by devices`)+k('PV yield',fmtI(A.pvTot),`${r.perDay?'kWh, clear day':'kWh in the period'} · ${A.kwpTot.toFixed(0)} kWp`); if(r.daylight) kp+=k('Daylit floor · sDA proxy',Math.round(r.daylight.sda*100)+'%','LEED bands 40 / 55 / 75%',r.daylight.sda>=0.55?'ok':''); if(r.ase) kp+=k('Annual sunlight exposure',Math.round(r.ase.pct*100)+'%','LEED limit 10%',r.ase.pct>0.1?'over':'ok'); }
  if(w){ if(w.vent) kp+=k('Natural ventilation',Math.round(w.vent.total/Math.max(1,w.vent.hoursTot)*100)+'%',`of hours · ${w.vent.operable} of ${w.vent.nF} floors operable`); if(w.vt&&w.vt.operable) kp+=k('ASHRAE 62.1 openings',w.vt.freePct.toFixed(1)+'%','of floor · rule ≥ 4%',w.vt.freePct>=4?'ok':'over'); }
  const en=LAB.energy&&LAB.energy.last; if(en){ kp+=k('TEUI',en.teui.toFixed(0),`kWh/m²/yr · target ${en.tgt.teui.toFixed(0)}`,en.teui<=en.tgt.teui?'ok':'over')+k('TEDI',en.tedi.toFixed(1),`kWh/m²/yr heating demand · target ${en.tgt.tedi.toFixed(0)}`,en.tedi<=en.tgt.tedi?'ok':'over')+k('GHGI',en.ghgi.toFixed(2),`kgCO₂e/m²/yr · target ${en.tgt.ghgi.toFixed(1)}`,en.ghgi<=en.tgt.ghgi?'ok':'over'); }
  const anyStale=(stale.sun&&r)||(stale.wind&&w); const S0=LAB.S.impact; const Dt=DATES[S0.sun.date];
  return `<div class="report-head"><div class="rh-title"><h2 style="margin:0">Design review</h2><span class="rh-meta">${name} · ${S.height} m · ${floors.length} floors · ${fmtI(gfa)} m² · ${PI.full?'whole year':PI.label} · ${DATES[sd.date].label}, ${fmtHour(sd.hour)} · wind ${W.annual?'period rose':W.dir+'° at '+W.speed.toFixed(1)+' m/s'} · ${SW.zones.length} façade zone${SW.zones.length===1?'':'s'}</span></div>
    <div class="rh-runs"><span>Sun ${r?'run '+fmtTime(r.at):'not yet run'}${r&&!r.advanced?' (Basic)':''}</span><span>Wind ${w?'run '+fmtTime(w.at):'not yet run'}${w&&!w.advanced?' (Basic)':''}</span>${anyStale?'<span class="rh-stale">Design changed since the last run · run the study again to refresh</span>':''}${!r&&!w?'<span>Design the façade, then run sun and daylight, and wind and ventilation.</span>':''}</div>
    ${kp?`<div class="kpi rh-kpi">${kp}</div>`:''}${leedCard(r,w)}</div>`;
}
function rerender(){ const m=LAB.S.impact.mode; if(adv()){ renderSun(sunResult); renderWind(windResult); renderRain(); analyseStatus(); } else { if(m==='sun') renderSun(sunResult); else if(m==='wind') renderWind(windResult); else if(m==='rain') renderRain(); } try{ renderPlan(); }catch(e){ console.error(e); } }
/* the Analyse tab's step strip */
function analyseStatus(){ const el=$('analyse-status'); if(!el) return; const S=LAB.S; const floors=LAB.floors||[]; const massing=S.typology==='upload'&&LAB.uploadRaw?LAB.uploadRaw.name:LAB.TYP[S.typology].name+' (generated)'; const ops=SW.zones.filter(z=>z.operable).length; const devs=SW.zones.filter(z=>STRATS[z.strat].device||STRATS[z.strat].mod).length;
  el.innerHTML=`<li class="done"><b>Massing</b><span>${massing} · ${S.height} m · ${floors.length} floors</span></li><li class="${SW.zones.length?'done':''}"><b>Design</b><span>${SW.zones.length} façade zone${SW.zones.length===1?'':'s'} · ${devs} with shading · ${ops} operable${stratActive()?' · ground wind strategies set':''}</span></li><li class="${sunResult&&windResult&&!stale.sun&&!stale.wind?'done':(sunResult||windResult?'part':'')}"><b>Analyse</b><span>sun ${sunResult?fmtTime(sunResult.at):'not run'} · wind ${windResult?fmtTime(windResult.at):'not run'}${(stale.sun||stale.wind)?' · design changed, run again':''}</span></li>`; }
/* in Advanced the sun and wind controls live on the Analyse tab; in Basic on their own tabs */
function placeControls(){ const a=adv(); const mv=(id,host)=>{ const el=document.getElementById(id), h=document.getElementById(host); if(el&&h&&el.parentNode!==h) h.appendChild(el); };
  if(a){ mv('params-sun','an-sun'); mv('wind-presets','an-wind'); mv('params-wind','an-wind'); } else { mv('params-sun','sun-host'); mv('wind-presets','wind-host'); mv('params-wind','wind-host'); } }

/* ---------- readings and results ---------- */
const stat=(k,v)=>`<div class="stat"><b>${v}</b><small>${k}</small></div>`;
const hot=by=>ORI.reduce((a,o)=>by[o]>by[a]?o:a,'S');
const modeTag=()=>`<span class="tag ${adv()?'adv':''}">${adv()?'Advanced':'Basic'}</span>`;
const staleNote=k=>stale[k]?`<p class="warn">Settings changed since this study ran. Run it again for current numbers.</p>`:'';
function sunReadings(r){
  const H=r.heat, out=[]; const unit=r.perDay?'kWh on a clear day':'kWh in the period'; const tot=Math.max(1,H.total);
  const h=hot(H.by); const share=H.by[h]/tot;
  out.push(`The <b>${NAMES[h].toLowerCase()}</b> face takes ${Math.round(share*100)}% of the direct sun (${H.intensity[h].toFixed(1)} kWh/m² ${r.perDay?'on a clear day':'in the period'}): the first face to shade. ${h==='E'||h==='W'?'Low sun there means vertical fins, egg-crates or deep reveals work; overhangs do little.':h==='S'?'High sun there means an overhang, louvres or a light shelf work well and keep the view.':'North sun is low and brief; shading matters less than glazing area.'}`);
  if(H.area.roof>50) out.push(`Roofs and terraces receive ${H.intensity.roof.toFixed(1)} kWh/m² over ${fmtI(H.area.roof)} m²: the best PV surface. At 20% module efficiency, half that area would give about ${fmtI(H.area.roof*0.5*0.2)} kWp.`);
  if(r.plazaTot>0) out.push(`${fmtI(r.plaza)} of ${fmtI(r.plazaTot)} m² of plazas and mid-block links get ${r.th[0]} h or more of new shadow${r.perDay?' on this date':' in the period'}${r.settings.date==='equinox'&&r.perDay?' (Vancouver\'s policy check is the equinox, 10:00–16:00)':''}.`);
  if(r.lostKWh>0) out.push(`Neighbouring façades lose ${fmtI(r.lostKWh)} ${unit} of direct sun to the tower${r.lostKWh/Math.max(1,r.towerKWh)>0.3?', a large share next to what the tower itself receives: look at setbacks or a slimmer upper shaft':''}.`);
  const sh=H.sunH; const lowFace=ORI.reduce((a,o)=>sh[o]<sh[a]?o:a,'N'); out.push(`Clear-day sun hours by face: ${ORI.map(o=>o+' '+sh[o].toFixed(0)+' h').join(', ')}. ${lowFace==='N'?'':'The '+NAMES[lowFace].toLowerCase()+' face is unusually shaded by neighbours.'}`);
  if(!adv()) out.push('Switch to <b>Advanced</b> to design the façade: zones by face and level with shading, glazing, PV, double skins, balconies and screens, with heat and yield numbers.');
  return out;
}
function windReadings(r){
  const out=[]; const z=r.a.zone;
  if(z){ const ratio=LAB.S.height/Math.max(8,z.hn); out.push(`The tower stands ${ratio.toFixed(1)}× taller than its neighbours (mean ${z.hn.toFixed(0)} m within 120 m), so downwash can raise ground speeds up to ${z.amp0.toFixed(2)}× within ${z.depth.toFixed(0)} m of the windward face${z.note.length?'; the '+z.note.join(' and ')+' bring'+(z.note.length>1?'':'s')+' that to '+z.amp.toFixed(2)+'×':''}. ${ratio>2&&!z.note.length?'A podium that reaches 10 m or more beyond the tower, or a deep entrance canopy, is the usual fix.':''}`); }
  if(r.worse>0) out.push(`${fmtI(r.worse)} m² of open ground drop a comfort band because of the tower; ${fmtI(r.better)} m² become calmer in its lee.`);
  out.push(`Plaza mean ${r.plazaMean.toFixed(1)} m/s, peak ${r.plazaWorst.toFixed(1)} m/s: ${r.plazaWorst>6?'too windy for sitting or standing at the peak; planting, screens or a sheltering edge building help':r.plazaWorst>4?'fine for walking, marginal for sitting':'comfortable for sitting'}.`);
  if(r.vsBase) out.push(`The wind strategies move ${fmtI(r.vsBase.better)} m² to a calmer band and ${fmtI(r.vsBase.worse)} m² to a windier one against the bare tower; plaza mean ${r.vsBase.plazaMean0.toFixed(1)} → ${r.plazaMean.toFixed(1)} m/s.`);
  const V=refWind(); const top=V.U*Math.pow(LAB.S.height/10,ALPHA); out.push(`At the top of the tower the mean wind is about ${top.toFixed(1)} m/s with gusts near ${(top*1.8).toFixed(0)} m/s (${(0.613*top*top*1.8*1.8/1000).toFixed(1)} kPa): terraces up there need screens, and operable windows a height limit.`);
  if(!adv()) out.push('Switch to <b>Advanced</b> to test a podium, canopy, corner treatment and plaza shelter, terrace screens and operable façade zones, and to count natural-ventilation hours.');
  return out;
}
const BANDS=['sitting','standing','strolling','walking','uncomfortable'], BAND_COL=['#3E8E7E','#8FC17A','#E3C25C','#E08A3C','#B8362B'];
/* ---------- analysis drawings: shadow range, façade sun map, downwash section ---------- */
const kp=(label,v,sub,cls)=>`<div><small>${label}</small><b class="${cls||''}">${v}</b>${sub?`<em>${sub}</em>`:''}</div>`;
function hull(pts){ const P=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]); if(P.length<3) return P; const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]); const lo=[]; for(const p of P){ while(lo.length>=2&&cross(lo[lo.length-2],lo[lo.length-1],p)<=0) lo.pop(); lo.push(p); } const up=[]; for(let i=P.length-1;i>=0;i--){ const p=P[i]; while(up.length>=2&&cross(up[up.length-2],up[up.length-1],p)<=0) up.pop(); up.push(p); } up.pop(); lo.pop(); return lo.concat(up); }
/* sun hours on each face by floor: hours a face is lit (3% or more of its area) per day, expected over the period */
function facadeSunHours(r){ const nF=r.nF; const v=[]; for(let i=0;i<nF;i++) v.push({N:null,E:null,S:null,W:null}); let max=0, wTot=0;
  for(const d of r.dayData){ const w=r.perDay?1:d.yearDays*d.sf; wTot+=r.perDay?1:d.yearDays; for(const h of d.hourly){ for(const o of ORI){ const col=h.Az[o]; for(let i=0;i<nF;i++){ const A=r.floorFace[i][o]; if(!(A>0)) continue; if(v[i][o]==null) v[i][o]=0; if(col[i]>0.03*A) v[i][o]+=w; } } } }
  const div=Math.max(1e-9,wTot); for(let i=0;i<nF;i++) for(const o of ORI){ if(v[i][o]!=null){ v[i][o]/=div; max=Math.max(max,v[i][o]); } } return {v,max,nF}; }
const SUN_RAMP=LAB.viz?LAB.viz.ramp([[236,239,243],[242,205,120],[224,154,44],[122,46,142]]):null;
function facadeMapSVG(r){ const M=facadeSunHours(r); const mx=Math.max(1,M.max); const V=LAB.viz; return V.facadeMap(ORI.map(o=>({key:o,label:NAMES[o]})),M.nF,(i,o)=>M.v[i][o],{key:'facade-map',title:`Sun hours on each face by floor · ${r.perDay?'clear day':'expected, per day'}`,ramp:v=>SUN_RAMP(v/mx),legend:[[0,'0 h'],[mx/2,(mx/2).toFixed(0)+' h'],[mx,mx.toFixed(0)+' h']],dec:1,unit:'h'}); }
/* shadow range diagram: the tower's shadow at each hour of the study window on the study date, in plan over the site */
function shadowRangeSVG(r){
  const S=LAB.S, floors=LAB.floors||[]; if(!floors.length) return ''; const sd=S.impact.sun, D=DATES[sd.date]; const V=LAB.viz;
  const corners=f=>{ const out=[]; for(const lp of LAB.maskLoops(f)) for(const q of lp.pts){ const w=LAB.toWorld(f,q[0],q[1]); out.push([w.x,w.y]); } return out; };
  const step=Math.max(1,Math.round(floors.length/8)); const sample=floors.filter((f,i)=>i%step===0||i===floors.length-1); const base=corners(floors[0]); const foot=hull(base);
  const shadows=[]; for(let h=sd.h0;h<=sd.h1;h++){ const p=sunPos(D.doy,h,D.tz); if(p.alt<=0.12) continue; const cot=1/Math.tan(p.alt); if(cot>8) continue; const sx=-Math.sin(p.az)*cot, sy=-Math.cos(p.az)*cot; const pts=base.slice(); for(const f of sample){ const z=f.z+f.h; for(const c of corners(f)) pts.push([c[0]+sx*z,c[1]+sy*z]); } shadows.push({h,hull:hull(pts),dir:[sx,sy]}); }
  let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity; for(const s of shadows.concat([{hull:foot}])) for(const p of s.hull){ minx=Math.min(minx,p[0]); maxx=Math.max(maxx,p[0]); miny=Math.min(miny,p[1]); maxy=Math.max(maxy,p[1]); }
  const pad=24; minx=Math.max(DOM.xmin,minx-pad); maxx=Math.min(DOM.xmax,maxx+pad); miny=Math.max(DOM.ymin,miny-pad); maxy=Math.min(DOM.ymax,maxy+pad);
  const W=380,H=300; const sc=Math.min((W-16)/(maxx-minx),(H-28)/(maxy-miny)); const cx=(minx+maxx)/2, cy=(miny+maxy)/2; const X=x=>W/2+(x-cx)*sc, Y=y=>H/2+6-(y-cy)*sc;
  let s=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Shadow range diagram" data-key="shadow-range"><style>text{font-family:var(--font-m);font-size:9px;fill:var(--muted)}</style><rect width="${W}" height="${H}" fill="var(--panel2)"/>`;
  if(!siteRaster) buildSiteRaster(); const SR=siteRaster; const plaza=plazaCellsAt(SR.cs,SR.nx,SR.ny);
  for(let iy=0;iy<SR.ny;iy++) for(let ix=0;ix<SR.nx;ix++){ const x=DOM.xmin+ix*SR.cs, y=DOM.ymin+iy*SR.cs; if(x+SR.cs<minx||x>maxx||y+SR.cs<miny||y>maxy) continue; const k=iy*SR.nx+ix; if(SR.H[k]>0) s+=`<rect x="${X(x).toFixed(1)}" y="${Y(y+SR.cs).toFixed(1)}" width="${(SR.cs*sc+0.3).toFixed(1)}" height="${(SR.cs*sc+0.3).toFixed(1)}" fill="var(--context)" fill-opacity="0.55"/>`; else if(plaza[k]) s+=`<rect x="${X(x).toFixed(1)}" y="${Y(y+SR.cs).toFixed(1)}" width="${(SR.cs*sc+0.3).toFixed(1)}" height="${(SR.cs*sc+0.3).toFixed(1)}" fill="var(--plaza)" fill-opacity="0.5"/>`; }
  const site=LAB.site&&LAB.site.site; if(site&&site.polygon) s+=`<path d="M${site.polygon.map(p=>X(p[0]).toFixed(1)+','+Y(p[1]).toFixed(1)).join('L')}Z" fill="none" stroke="var(--accent)" stroke-dasharray="4 3"/>`;
  shadows.forEach(sh=>{ s+=`<path d="M${sh.hull.map(p=>X(p[0]).toFixed(1)+','+Y(p[1]).toFixed(1)).join('L')}Z" fill="var(--sun)" fill-opacity="0.12" stroke="var(--sun)" stroke-opacity="0.75" stroke-width="0.8"><title>${sh.h}:00</title></path>`; });
  s+=`<path d="M${foot.map(p=>X(p[0]).toFixed(1)+','+Y(p[1]).toFixed(1)).join('L')}Z" fill="var(--ink)" fill-opacity="0.85"/>`;
  const fc=[foot.reduce((a,p)=>a+p[0],0)/foot.length,foot.reduce((a,p)=>a+p[1],0)/foot.length];
  shadows.forEach(sh=>{ let far=sh.hull[0], fd=-1; for(const p of sh.hull){ const d=(p[0]-fc[0])*sh.dir[0]+(p[1]-fc[1])*sh.dir[1]; if(d>fd){ fd=d; far=p; } } const lx=X(far[0])+sh.dir[0]*8, ly=Y(far[1])-sh.dir[1]*8; s+=`<text x="${Math.max(10,Math.min(W-10,lx)).toFixed(1)}" y="${Math.max(10,Math.min(H-4,ly+3)).toFixed(1)}" text-anchor="middle" style="fill:var(--ink)">${sh.h}</text>`; });
  const bar=50*sc; s+=`<line x1="10" x2="${(10+bar).toFixed(1)}" y1="${H-8}" y2="${H-8}" stroke="var(--ink)" stroke-width="1.5"/><text x="${(12+bar).toFixed(1)}" y="${H-5}">50 m</text><text x="${W-10}" y="12" text-anchor="end" style="fill:var(--ink)">N ↑</text><text x="8" y="12">${D.label} · ${sd.h0}:00–${sd.h1}:00</text>`;
  if(!shadows.length) s+=`<text x="${W/2}" y="${H/2}" text-anchor="middle">sun too low in the window to draw shadows</text>`;
  return s+'</svg>'; }
/* downwash section: wind from the left meets the tower; the neighbours' mean height, the stagnation point and the ground vortex with its amplification */
function downwashSVG(r){
  const S=LAB.S, z=r&&r.a&&r.a.zone, st=(r&&r.strat)||{}; const W=380,H=236, gy=H-30, top=S.height; const sc=(gy-26)/Math.max(60,top); const fl=LAB.floors&&LAB.floors[0]; const tw=fl?Math.max(fl.w,fl.d):40; const V=refWind(); const amp0=z?z.amp0:1, amp=z?z.amp:1, hn=z?z.hn:0, depth=z?z.depth:0.22*top;
  const tx0=W*0.62-tw*sc/2, tx1=tx0+tw*sc; const Y=h=>gy-h*sc;
  let s=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Downwash section" data-key="downwash"><style>text{font-family:var(--font-m);font-size:9px;fill:var(--muted)} .k{fill:var(--ink)}</style><defs><marker id="ah" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L6,3L0,6Z" fill="var(--wind)"/></marker></defs>`;
  s+=`<line x1="0" x2="${W}" y1="${gy}" y2="${gy}" stroke="var(--ink)" stroke-width="1.2"/>`;
  if(hn>0){ const nx0=40, nw=48*sc; s+=`<rect x="${nx0}" y="${Y(hn).toFixed(1)}" width="${Math.max(10,nw).toFixed(1)}" height="${(gy-Y(hn)).toFixed(1)}" fill="var(--context)" fill-opacity="0.6"/><text x="${nx0}" y="${(Y(hn)-4).toFixed(1)}">neighbours · ${hn.toFixed(0)} m mean</text>`; }
  if(st.podiumH>0&&st.podiumExt>0){ s+=`<rect x="${(tx0-st.podiumExt*sc).toFixed(1)}" y="${Y(st.podiumH).toFixed(1)}" width="${(tw*sc+2*st.podiumExt*sc).toFixed(1)}" height="${(gy-Y(st.podiumH)).toFixed(1)}" fill="var(--mass)" fill-opacity="0.6"/><text x="${(tx0-st.podiumExt*sc).toFixed(1)}" y="${(Y(st.podiumH)-3).toFixed(1)}">podium ${st.podiumH} m · ${st.podiumExt} m out</text>`; }
  if(st.canopy>0){ s+=`<line x1="${(tx0-st.canopy*sc).toFixed(1)}" x2="${tx0}" y1="${Y(6).toFixed(1)}" y2="${Y(6).toFixed(1)}" stroke="var(--ink)" stroke-width="2"/>`; }
  s+=`<rect x="${tx0.toFixed(1)}" y="${Y(top).toFixed(1)}" width="${(tw*sc).toFixed(1)}" height="${(gy-Y(top)).toFixed(1)}" fill="var(--mass)" stroke="var(--ink)" stroke-width="0.8"/><text class="k" x="${(tx0+tw*sc/2).toFixed(1)}" y="${(Y(top)-5).toFixed(1)}" text-anchor="middle">${top} m</text>`;
  for(const t of [0.9,0.6,0.3]){ const h=top*t; const U=V.U*Math.pow(Math.max(10,h)/10,ALPHA); const len=28+U*5; const x1=tx0-16, x0=x1-len; s+=`<line x1="${x0.toFixed(1)}" x2="${x1.toFixed(1)}" y1="${Y(h).toFixed(1)}" y2="${Y(h).toFixed(1)}" stroke="var(--wind)" stroke-width="1.6" marker-end="url(#ah)"/><text x="${(x0-3).toFixed(1)}" y="${(Y(h)+3).toFixed(1)}" text-anchor="end">${U.toFixed(1)} m/s</text>`; }
  const sp=top*0.7; s+=`<circle cx="${tx0.toFixed(1)}" cy="${Y(sp).toFixed(1)}" r="3" fill="var(--wind)"/><text x="${(tx0-6).toFixed(1)}" y="${(Y(sp)-6).toFixed(1)}" text-anchor="end">stagnation ≈ 0.7 H</text>`;
  const dx=Math.max(14,depth*sc); s+=`<path d="M${(tx0-4).toFixed(1)},${Y(sp).toFixed(1)}Q${(tx0-10).toFixed(1)},${Y(sp*0.5).toFixed(1)} ${(tx0-8).toFixed(1)},${(gy-6).toFixed(1)}Q${(tx0-10).toFixed(1)},${(gy-2).toFixed(1)} ${(tx0-dx).toFixed(1)},${(gy-4).toFixed(1)}" fill="none" stroke="var(--wind)" stroke-width="2" marker-end="url(#ah)"/>`;
  s+=`<path d="M${(tx0-dx*0.55).toFixed(1)},${(gy-4).toFixed(1)}A${(dx*0.3).toFixed(1)},${(Math.min(26,top*0.1*sc)).toFixed(1)} 0 0 1 ${(tx0-dx*0.15).toFixed(1)},${(gy-4).toFixed(1)}" fill="none" stroke="var(--wind)" stroke-width="1" stroke-dasharray="3 2"/>`;
  s+=`<text class="k" x="${(tx0-dx/2).toFixed(1)}" y="${(gy+12).toFixed(1)}" text-anchor="middle">×${amp.toFixed(2)} at ground${amp!==amp0?' (×'+amp0.toFixed(2)+' bare)':''} · ${depth.toFixed(0)} m out</text>`;
  s+=`<text x="${(tx1+6).toFixed(1)}" y="${(Y(top*0.4)).toFixed(1)}">lee</text><text x="6" y="${H-4}">wind from the ${r&&r.annual?'dominant sector':'case direction'} · ${V.label}</text>`;
  return s+'</svg>'; }
function renderSun(r){
  const sd=LAB.S.impact.sun, D=DATES[sd.date]; const p=sunPos(D.doy,sd.hour,D.tz); const V=LAB.viz;
  let html=`<h2>${adv()?'Sun · inside, then at the façade':'Sun and shadow'} ${modeTag()}</h2>${staleNote('sun')}`;
  if(!r&&adv()){ html+=`<div class="kpi">${kp('Study window',`${sd.h0}–${sd.h1} h`,sd.scope==='period'?periodInfo().label:D.label)}${kp('Façade zones',SW.zones.length,SW.zones.filter(z=>STRATS[z.strat].device).length+' with shading')}</div><p class="note">Run the study for heat through the glazing, what the devices block, glare, PV on the façade, daylight and sunlight exposure on every floor.</p>`; setOut('sun',html); return; }
  if(!r){ const PI=periodInfo(); html+=`<div class="kpi">${kp('Sun now',p.alt>0?(p.alt*180/Math.PI).toFixed(0)+'°':'set',p.alt>0?'altitude · azimuth '+(p.az*180/Math.PI).toFixed(0)+'°':'below the horizon')}${kp('Study window',`${sd.h0}–${sd.h1} h`,sd.scope==='period'?(PI.full?'whole year':PI.label):D.label)}</div>`+V.row(V.fig(shadowRangeSVG(null),`Shadow range · ${D.label}`),V.fig(sunPathSVG(),'Sun paths · solstices and equinox'))+`<p class="note">${adv()?'Run analysis':'Run the study'} to accumulate shadow hours, sun on each face and the sunlight neighbours lose.</p>`; setOut('sun',html); return; }
  const yr=r.scope==='period', P=r.period, unit=yr?(P.full?'h/yr':'h'):'h', eunit=r.perDay?'kWh, clear day':'kWh in the period'; const H=r.heat;
  // site and exterior: Massing only (Design development reads the inside)
  if(!adv()){
  html+=`<p class="headline">${sunReadings(r)[0]}</p>`;
  html+=`<div class="kpi">${kp(`New shadow ≥ ${r.th[0]} ${unit}`,fmtI(r.a1)+' m²',`${fmtI(r.a2)} m² ≥ ${r.th[1]} · ${fmtI(r.a4)} m² ≥ ${r.th[2]}`)}${kp('Plazas and links shaded',r.plazaTot?Math.round(r.plaza/r.plazaTot*100)+'%':'–',r.plazaTot?`${fmtI(r.plaza)} of ${fmtI(r.plazaTot)} m² ≥ ${r.th[0]} ${unit}`:'no plazas in the site model',r.plazaTot&&r.plaza/r.plazaTot>0.25?'over':'')}${kp('Sunlight lost by neighbours',fmtI(r.lostKWh),`${eunit} · tower receives ${fmtI(r.towerKWh)}`)}</div>`;
  html+=V.row(V.fig(shadowRangeSVG(r),`Shadow range · ${D.label}, ${sd.h0}:00–${sd.h1}:00, hourly`),V.fig(sunPathSVG(),'Sun paths · solstices and equinox, current sun marked'));
  html+=V.fig(V.hbars([{label:`≥ ${r.th[0]} ${unit}`,v:r.a1},{label:`≥ ${r.th[1]} ${unit}`,v:r.a2},{label:`≥ ${r.th[2]} ${unit}`,v:r.a4},{label:'On plazas',v:r.plaza,text:r.plazaTot?fmtI(r.plaza)+' of '+fmtI(r.plazaTot)+' m²':'–'},{label:'Transit plaza',v:r.transit},{label:'Own parcel',v:r.siteOpen}],{key:'ground-shade',title:`Ground newly shaded${yr?' over '+(P.full?'the year':P.label):''}`,color:'var(--sun)',unit:'m²',dec:0}),'New shadow on the ground by threshold and by place; the footprint is excluded.');
  html+=V.row(V.fig(V.hbars(ORI5.map(o=>({label:NAMES[o].replace('Roofs and terraces','Roofs'),v:H.sunH[o],color:FACE_COL[o]||'var(--muted)',text:H.sunH[o].toFixed(1)+' h'+(yr?' · '+fmtI(H.sunHexp[o])+' h expected':'')})),{key:'sun-hours-face',title:'Sun hours by face · clear day',unit:'h',dec:1,labelW:60}),'Hours each face sees the sun after neighbours and the tower\'s own form.'),V.fig(V.hbars(ORI5.map(o=>({label:NAMES[o].replace('Roofs and terraces','Roofs'),v:H.intensity[o],color:FACE_COL[o]||'var(--muted)',text:H.intensity[o].toFixed(1)+' kWh/m² · '+fmtI(H.by[o])+' kWh'})),{key:'sun-irr-face',title:`Direct sun per m² · ${r.perDay?'clear day':'period'}`,dec:1,labelW:60}),'Beam irradiation per m² of face and in total; the brightest face is the first to shade.'));
  if(r.dayData&&r.floorFace) html+=V.fig(facadeMapSVG(r),'Unrolled elevations: each column is a face, each row a floor; colour is the hours of direct sun. Dark rows are floors the neighbours screen.');
  }
  if(adv()){ const A=solarStudy(r); const DL0=r.daylight; let ext='';
    html+=`<p class="headline">Devices block ${Math.round(A.blocked*100)}% of the sun through the glass${DL0?`; ${Math.round(DL0.sda*100)}% of the floor is daylit`:''}${r.ase?`; ${Math.round(r.ase.pct*100)}% sees too much direct sun`:''}.</p>`;
    html+=partHead('in','Inside','daylight and sun on the floor plate')+PLAN_MARK;
    ext+=`<h3>Façade strategies</h3><div class="kpi">${kp('Heat through glazing',fmtI(A.shTot),`${eunit} · ${fmtI(A.unTot)} without devices`)}${kp('Blocked by devices',Math.round(A.blocked*100)+'%','of beam through glass')}${kp('PV yield',fmtI(A.pvTot),`${eunit} · ${A.kwpTot.toFixed(0)} kWp`)}</div>`;
    ext+=V.fig(V.pairs(A.zones.map(Z=>({label:Z.label,a:Z.sh,b:Z.un})),{key:'zone-heat',title:'Heat through glazing by façade zone, kWh',names:['with devices','without'],colors:['var(--sun)','var(--muted)'],dec:0,labelW:120}),'Solid: with the zone\'s shading; dashed: the same glass unshaded. The gap is what the device earns.');
    ext+=V.row(V.fig(V.hbars(A.zones.map(Z=>({label:Z.label,v:Z.glare,color:'var(--bad)',text:Z.glare.toFixed(0)+' h'})),{key:'glare',title:'Low-sun glare hours by zone',dec:0,labelW:120}),'Hours with the sun under 25° and more than half the beam let through.'),V.fig(A.pv.length?V.hbars(A.pv.map(x=>({label:x.name,v:x.kwh,color:'var(--pv)',text:fmtI(x.kwh)+' kWh · '+x.kwp.toFixed(0)+' kWp'})),{key:'pv',title:'Photovoltaics',dec:0,labelW:110}):`<p class="empty">No PV surfaces yet: set roof coverage or a PV spandrel zone, or import a PV layer.</p>`,'Yield from measured beam plus an all-sky diffuse allowance.'));
    ext+=`<p class="note">Beam is measured per floor from the sun renders, so each zone sees the sun that reaches its own levels. Devices are evaluated hour by hour from profile and horizontal shadow angles; heat through glazing = beam × window-to-wall ratio × SHGC × 0.9 × device transmission. PV adds an all-sky diffuse allowance (${fmtI(H.diffH)} kWh/m² horizontal) to the measured beam, then module efficiency and performance ratio.</p>`;
    const DL=r.daylight; if(!DL) html+=`<h3>Daylight</h3><p class="note">This study ran in the massing phase. Run the sun study again in Design development to compute daylight factors and annual sunlight exposure for every floor.</p>`; else { const tgt=(DL.target*100).toFixed(1); const ase=r.ase;
      html+=`<h3>Daylight</h3><div class="kpi">${kp('Spatial daylight autonomy',Math.round(DL.sda*100)+'%',`sDA${DL.target}/50% · floor at ${DL.target} lux half the occupied hours`,DL.sda>=0.55?'ok':'')}${kp('Useful daylight',Math.round(DL.udiU*100)+'%','UDI 100–3,000 lux · share of occupied hours')}${kp('Over 3,000 lux',Math.round(DL.udiE*100)+'%','of occupied hours · glare and heat near the glass',DL.udiE>0.2?'over':'')}${kp('Daylight factor',(DL.mean*100).toFixed(1)+'%','mean · CIE overcast sky')}</div>`;
      html+=V.fig(V.gauge(DL.sda,[{v:0.40,label:'1 pt · 40%'},{v:0.55,label:'2 pts · 55%'},{v:0.75,label:'3 pts · 75%'}],{key:'sda',title:`LEED v4.1 EQ Daylight · sDA${DL.target}/50%`,good:'high'})+floorBars(DL.rows,x=>x.pctLit,'var(--sun)','Spatial daylight autonomy per floor',0.55),`Share of floor that reaches ${DL.target} lux from daylight for at least half of the 8:00–18:00 hours of the typical year, against the LEED bands; below, floor by floor.`);
      html+=V.fig(floorStack(DL.rows,[['udiS','under 100 lux','var(--chart-grid)'],['udiU','useful 100–3,000','var(--sun)'],['udiE','over 3,000 lux','#B8362B']],'Useful daylight illuminance per floor'),'Share of occupied hours, averaged over each floor: too dark for daylight alone, useful, or so bright that blinds come down (Nabil and Mardaljevic, 100–3,000 lux as in Honeybee).');
      if(ase) html+=V.fig(V.gauge(ase.pct,[{v:0.10,label:'limit 10%'}],{key:'ase',title:'Annual sunlight exposure · ASE 1000 lux / 250 h',good:'low'})+floorBars(ase.rows,x=>x.pct,'#B8362B','Annual sunlight exposure per floor',0.10),`Floor with more than 250 h of direct sun above 1,000 lux, ${ase.period}; LEED asks for 10% or less, or a glare-control story.`);
      html+=`<p class="note">${DL.hourly?`Climate-based, in the manner of Radiance, Daysim and Honeybee: each floor cell looks along sixteen sight lines to the glass and takes the sky between sill and head (0.8 m work plane, 2 m grid), above the neighbours' obstruction angle and under the zone's overhang, with louvres, fins or reveals and the glass transmittance ${SW.glaz.vt.toFixed(2)}; the neighbours return a fifth of the sky they hide. Hour by hour over the occupied hours of the CWEC typical year (every second day), each face's window sees its own Perez all-weather sky, and the light reflected inside (BRE split-flux: floor 0.2, walls 0.5, ceiling 0.8) is added across the plate. Direct sun is left to the blinds, as LM-83 assumes for sDA, and ASE counts the measured direct sun hour by hour.`:'The hourly weather is not loaded, so daylight autonomy is read from the daylight factor against a 16,000 lux design sky.'} Interior partitions are not modelled, so deep open plates read better than cellular ones; a Radiance run with real materials stays the reference for the LEED submission.</p>`; }html+=FIT_MARK+partHead('out','At the façade','heat through the glass, glare and PV')+ext; }
  if(!adv()) html+=`<p class="note">Direct beam reaching each face hour by hour after shading by neighbours, future towers and the massing's own voids and steps; "sun hours" counts hours when at least 3% of a face is lit. ${yr?`${r.months.length} representative days across the period, weighted by days represented and Vancouver's bright-sunshine share.`:'Clear-sky values for the one date.'} Overlay amber to purple: ${r.th[0]} to ${yr?fmtI(Math.max(4,800*P.days/365)):Math.round(r.hours*0.8)}+ ${unit} of new shadow. The full readings and tables are in the report.</p>`;
  setOut('sun',html);
}
function renderWind(r){
  const W=LAB.S.impact.wind; const PI=periodInfo(); const V=LAB.viz; const Vr=refWind(); const prof=windProfile(Vr.U);
  let html=`<h2>${adv()?'Air · inside, then outside':'Pedestrian wind'} ${modeTag()}</h2>${staleNote('wind')}`;
  const profileFig=V.fig(V.line([{name:'mean',color:'var(--wind)',pts:prof.map(p=>[p.U,p.z]),dots:true},{name:'gust',color:'var(--bad)',dash:true,pts:prof.map(p=>[p.gust,p.z])}],{key:'wind-profile',title:'Wind with height · '+Vr.label,xLabel:'m/s',yLabel:'height m',yMax:LAB.S.height,xDec:0,yDec:0,marks:[{y:60,label:'terraces need screens above ~60 m'}]}),`Power-law profile (exponent ${ALPHA}); gusts 1.8× the mean. Gust pressure at the top ${(prof[prof.length-1].q*3.24/1000).toFixed(1)} kPa.`);
  if(!r&&adv()){ const ops=SW.zones.filter(z=>z.operable).length; html+=`<div class="kpi">${kp(W.annual?'Case':'Wind',W.annual?(PI.full?'whole year':PI.label):W.dir+'°',W.annual?'8 sectors of the rose':W.speed.toFixed(1)+' m/s at 10 m')}${kp('Operable zones',ops,'of '+SW.zones.length+' façade zones')}</div><p class="note">Run the study for natural-ventilation hours, the ASHRAE 62.1 opening check and the wind on terraces.</p>`; setOut('wind',html); return; }
  if(!r){ html+=`<div class="kpi">${kp(W.annual?'Case':'Wind',W.annual?(PI.full?'whole year':PI.label):W.dir+'°',W.annual?'8 sectors of the rose':W.speed.toFixed(1)+' m/s at 10 m')}${kp('Grid','4 m','lattice-Boltzmann, pedestrian level')}</div>`+V.row(V.fig(downwashSVG(null),'Downwash section · run the study for the amplification'),V.fig(roseSVG(roseFor(PI)),'Wind rose for the period'))+profileFig+'<p class="note">Run the study to solve pedestrian-level flow with and without the tower.</p>'; setOut('wind',html); return; }
  // pedestrian level: Massing only
  if(!adv()){
  html+=`<p class="headline">${windReadings(r)[0]}</p>`;
  html+=`<div class="kpi">${kp('Plaza wind · mean / peak',r.plazaMean.toFixed(1)+' / '+r.plazaWorst.toFixed(1),'m/s · '+(r.plazaWorst>6?'too windy at the peak':r.plazaWorst>4?'walking comfort':'sitting comfort'),r.plazaWorst>6?'over':'')}${kp('Ground made windier',fmtI(r.worse)+' m²',`${fmtI(r.better)} m² calmer in the lee`,r.worse>r.better?'over':'')}${kp(r.annual?'Peak annual mean':'Peak speed',r.maxS.toFixed(1)+' m/s',r.annual?`gusty > 5% of hours on ${fmtI(r.gusty)} m² (was ${fmtI(r.gustyB)})`:'at pedestrian level')}</div>`;
  const cols=BANDS.map((n,i)=>({name:n,color:BAND_COL[i]})); const rows=[{label:'With the tower',parts:r.cats},{label:'Without',parts:r.catsB}];
  html+=V.fig(V.stack(rows,cols,{key:'lawson',title:r.annual?'Lawson comfort bands · mean speed over the period, share of open ground':'Lawson comfort bands · share of open ground'}),'Sitting ≤ 2.5, standing 2.5–4, strolling 4–6, walking 6–8, uncomfortable > 8 m/s.');
  const DIRS={N:0,NE:45,E:90,SE:135,S:180,SW:225,W:270,NW:315};
  html+=V.row(V.fig(downwashSVG(r),'Downwash section: the stagnation point near 0.7 H turns the wind down the windward face into a ground vortex; the label is the ground amplification against the free wind.'),V.fig(r.annual?V.rose(r.sectors.map(s=>({name:s.name,dir:s.dir!=null?s.dir:DIRS[s.name],f:s.f,s:s.plazaMean,text:Math.round(s.f*100)+'% of hours, plaza mean '+s.plazaMean.toFixed(1)+' m/s, '+fmtI(s.worse)+' m² worse'})),{key:'wind-sectors',title:'By sector · share of hours, colour = plaza mean',sUnit:'m/s plaza mean'}):roseSVG(roseFor(PI)),r.annual?'Petal length is the sector\'s share of hours; depth of colour is the plaza mean it produces.':'Wind rose for the period; this run is one case.'));
  html+=profileFig;
  }
  if(adv()&&!(r&&r.vent)){ html+=`<h2>Wind strategies and ventilation</h2><p class="note">${r?'This study ran in the massing phase. ':''}Run the wind study in Design development to compute natural-ventilation hours, the ASHRAE 62.1 opening check and the wind on terraces together with the pedestrian flow.</p>`; }
  else if(adv()){ const N=r.vent; const TW=r.terr||[]; const VT=r.vt; let ext='';
    { const N0=r.vent, VT0=r.vt; html+=`<p class="headline">${N0&&N0.operable?`Windows can be open ${Math.round(N0.total/Math.max(1,N0.hoursTot)*100)}% of the hours on ${N0.operable} floors`:'No floor has operable windows yet'}${VT0&&VT0.operable?`; openings are ${VT0.freePct.toFixed(1)}% of the floor they serve`:''}.</p>`; }
    html+=partHead('in','Inside','natural ventilation through the floor plate')+PLAN_MARK;
    ext+=`<h3>Ground-level wind strategies</h3>`;
    if(r&&r.vsBase) ext+=`<div class="kpi">${kp('Calmer with strategies',fmtI(r.vsBase.better),'m² against the bare tower','ok')}${kp('Windier',fmtI(r.vsBase.worse),'m²')}${kp('Plaza mean',r.plazaMean.toFixed(1),`m/s · was ${r.vsBase.plazaMean0.toFixed(1)}`)}</div><p class="note">Strategies in this run: ${[r.strat.podiumH>0&&r.strat.podiumExt>0?`podium ${r.strat.podiumH} m high reaching ${r.strat.podiumExt} m`:'',r.strat.canopy>0?`canopy ${r.strat.canopy} m deep`:'',r.strat.corners!=='sharp'?r.strat.corners+' corners':'',r.strat.shelter>0?Math.round(r.strat.shelter*100)+'% plaza shelter':''].filter(Boolean).join(', ')}. A podium becomes an obstacle at ground level and catches the downwash; a canopy breaks up to 35% of what reaches the entrance; rounded or chamfered corners cut corner-stream speeds; planting and screens slow the sheltered plaza by up to 40%.</p>`;
    else if(stratActive()) ext+=`<p class="warn">Wind strategies are set but this study ran without them. Run the wind study again to see their effect.</p>`;
    else ext+=`<p class="empty">No ground-level wind strategies set. Add a podium, canopy, corner treatment or plaza shelter under Design and rerun the wind study.</p>`;
    html+=`<h3>Natural ventilation · ${{cross:'cross ventilation',single:'single-sided',stack:'stack'}[SW.vent.mode]}</h3>`;
    if(N.operable){ const pc=Math.round(N.total/Math.max(1,N.hoursTot)*100);
      html+=`<div class="kpi">${kp('Windows open',pc+'%',`of ${fmtI(N.hoursTot)} hours · ${fmtI(N.total)} floor-averaged hours`)}${kp('Operable floors',N.operable,`of ${N.nF} · usable to ${N.all?'the top':(N.limit?'L'+N.limit:'none')}`)}${N.hourly?kp('Air change when open',N.achMed.toFixed(1)+' /h','median, wind and stack')+kp('Fresh air met by windows',Math.round(N.fresh*100)+'%',`of open hours reach ${(SW.vent&&LAB.S.energy.vent||0.35).toFixed(2)} L/s per m²`,N.fresh>=0.9?'ok':''):''}</div>`;
      if(N.hourly){ html+=V.fig(ventCarpet(N.grid),`Share of operable floors with windows open, by week across the year (columns) and hour of the day (rows): ${N.adaptive?'ASHRAE 55 adaptive comfort on the prevailing mean outdoor temperature':SW.vent.tmin+'–'+SW.vent.tmax+' °C'}, gusts under ${SW.vent.umax} m/s at each floor's height, no heavy rain.`);
        html+=V.fig(floorBars(N.floors.map(x=>({i:x.i,v:x.share})),x=>x.v,'var(--wind)','Hours with windows open per floor',null),'Share of the period each operable floor can open its windows; it falls with height as the wind strengthens. Floors without operable zones are left out.','','vent-months'); }
      else html+=V.fig(V.months([{name:'usable hours',color:'var(--wind)',values:N.rows.map(x=>x.vent)},{name:'hours in period',color:'var(--chart-grid)',values:N.rows.map(x=>x.hours)}],{key:'vent-months',title:'Natural-ventilation potential by month',yLabel:'hours'}),'Read from monthly normals: the hourly weather is not loaded.');
      html+=`<p class="note">Hour by hour over the CWEC typical year, as Ladybug's natural-ventilation potential and the CBE comfort tool read it: windows open when the room air (outdoor + ${SW.vent.dT||3} K of internal gain) sits in ${N.adaptive?'the ASHRAE 55 adaptive band, 17.8 + 0.31 × the prevailing mean of the last seven days ± 3.5 °C (80% acceptability; the fixed band below a 10 °C prevailing mean)':'the fixed band '+SW.vent.tmin+'–'+SW.vent.tmax+' °C'}, when 1.8 × the hourly wind, carried from the airport to this urban site and up to that floor's height (ASHRAE boundary layers, as EnergyPlus does), stays under ${SW.vent.umax} m/s and rain is under 1 mm/h. Airflow is a one-zone-per-floor pressure network in the manner of NIST CONTAM: each operable face gets the wind pressure for that hour's direction (Cp +0.7 windward, −0.6 side, −0.3 leeward), the stack pressure over the window height, and orifice flow with discharge coefficient 0.6 balanced for the internal pressure${SW.vent.mode==='single'?'; single-sided rooms add the BS 5925 turbulence term':SW.vent.mode==='stack'?'; stack mode adds an exhaust three storeys up under roof suction':''}. Interior partitions are not modelled.</p>`; }
    else html+='<p class="empty">No façade zone has operable openings. Set "operable windows or vents" on a zone under Design to count ventilation hours.</p>';
    if(VT&&VT.operable){ html+=`<h3>ASHRAE 62.1 natural ventilation check</h3><div class="kpi">${kp('Free opening area',VT.freePct.toFixed(1)+'%',`of floor served · rule ≥ 4% · ${VT.meet4} of ${VT.operable} floors meet it`,VT.freePct>=4?'ok':'over')}${kp('Within 8 m of an opening',Math.round(VT.within8*100)+'%','of the operable floors\' area',VT.within8>=0.9?'ok':'')}${kp('Operable floors',VT.operable,`of ${VT.rows.length}`)}</div>`;
      html+=V.fig(V.gauge(Math.min(1,VT.freePct/10),[{v:0.4,label:'rule · 4% of floor'}],{key:'ashrae',title:'Openable area as a share of the floor served (scale to 10%)',good:'high'})+floorBars(VT.rows,x=>x.within8,'var(--wind)','Floor within 8 m of an operable opening, per floor',0.9),'ASHRAE 62.1 asks for openable area of at least 4% of the net floor area served, with every point within 8 m of an opening.'); }
    ext+=`<h3>Wind on terraces and roofs</h3>`+(TW.length?V.fig(V.hbars(TW.map(t=>({label:'L'+t.level+' · '+t.z.toFixed(0)+' m',v:t.U,color:BAND_COL[t.band],text:t.U.toFixed(1)+' m/s · '+BANDS[t.band]+(t.screened?' → '+BANDS[t.bandS]+' with screens':'')})),{key:'terrace-wind',title:'Mean wind on each terrace, Lawson band',dec:1,unit:'m/s',labelW:84}),'Mean wind at terrace height from the profile; a "Terrace wind screens" zone halves the speed people feel.'):'<p class="empty">No terraces over 30 m² on this massing.</p>'); html+=FIT_MARK+partHead('out','Outside','wind at the base and on terraces')+ext; }
  if(!adv()) html+=`<p class="note">Two-dimensional lattice-Boltzmann flow at pedestrian level on 4 m cells, with and without the tower, scaled to the site wind; it shows where the massing accelerates or shelters the wind, not absolute values. The full readings, sector table and profile table are in the report.</p>`;
  setOut('wind',html);
}

/* ---------- report data for the PDF builder ---------- */
function reportData(kind){
  if(kind==='custom') return customReportData();
  if(kind==='rain') return LAB.rain?LAB.rain.reportData():null;
  const S=LAB.S, fmt=fmtI; const modeName=adv()?'Design development':'Massing';
  if(kind==='sun'){ const r=sunResult, sd=S.impact.sun, D=DATES[sd.date]; if(!r) return null; const yr=r.scope==='period'; const P=r.period, unit=yr&&P.full?'h per year':'h in the period'; const H=r.heat;
    const out={title:'Sun and shadow study'+(yr?' · '+(P.full?'whole year':P.label):''),settings:[['Mode',modeName],['Scope',yr?`${P.full?'Whole year':P.label} (${P.days} days): ${r.months.length} representative days, hourly, weighted by days represented and bright-sunshine fraction`:D.label+', clear sky'],['Study window',`${sd.h0}:00 to ${sd.h1}:00, hourly`],['Geometry',r.raw?'uploaded model as modeled':S.typology==='upload'?'uploaded massing sliced into floors':LAB.TYP[S.typology].name],['Ground resolution','2 m'],['Facade sampling','512 × 512 from the sun, 1.8 m pixels, height per pixel']],
      stats:yr?[[`Ground with ≥ ${r.th[0]} ${unit} more shadow`,fmt(r.a1)+' m²'],[`≥ ${r.th[1]} ${unit}`,fmt(r.a2)+' m²'],[`≥ ${r.th[2]} ${unit}`,fmt(r.a4)+' m²'],[`Plazas and mid-block links ≥ ${r.th[0]} ${unit}`,fmt(r.plaza)+' of '+fmt(r.plazaTot)+' m²'],['Around the transit plaza (40 m radius)',fmt(r.transit)+' m²'],['On the competition parcel',fmt(r.siteOpen)+' m²'],['Sunlight lost by neighbouring façades',fmt(r.lostKWh)+' kWh in the period'],['Direct sun received by the tower',fmt(r.towerKWh)+' kWh in the period']]
        :[['Ground newly shaded ≥ 1 h',fmt(r.a1)+' m²'],['≥ 2 h',fmt(r.a2)+' m²'],['≥ 4 h',fmt(r.a4)+' m²'],['Plazas and mid-block links shaded ≥ 1 h',fmt(r.plaza)+' of '+fmt(r.plazaTot)+' m²'],['Around the transit plaza (40 m radius)',fmt(r.transit)+' m²'],['On the competition parcel',fmt(r.siteOpen)+' m²'],['Sunlight lost by neighbouring façades',fmt(r.lostKWh)+' kWh on a clear day'],['Direct sun received by the tower',fmt(r.towerKWh)+' kWh on a clear day']],
      notes:['Shadows are accumulated from hourly sun positions computed for 49.28° N, 123.12° W with local clock time, rendered on the site model with and without the tower; the difference is the new shadow. The tower footprint is excluded. Roofs of neighbouring buildings are treated like ground.','Façade sunlight is the area of neighbouring façades visible from the sun times clear-sky direct normal irradiance (1353 × 0.7^(AM^0.678) W/m²). Diffuse light and reflections are not included.',yr?'Period weighting uses Vancouver Airport bright-sunshine normals (about 1,930 h a year, 56 h in December to 290 h in July) divided by each month\'s daylight hours.':'Vancouver assesses new shadow on parks and public plazas at the spring and fall equinox between 10:00 and 16:00; use that setting for the policy case.'],
      overlay:yr?`Amber to purple: ${r.th[0]} to ${fmt(Math.max(4,800*P.days/365))}+ hours of additional shadow in the period.`:'Amber to purple: 1 h to '+Math.round(r.hours*0.8)+'+ h of additional shadow.'};
    out.tables=[{title:'Direct sun on the massing',head:['Surface','m²','Sun h/day clear'].concat(yr?['Sun h expected']:[]).concat(['Beam kWh','kWh/m²']),rows:ORI5.map(o=>[NAMES[o],fmt(H.area[o]),H.sunH[o].toFixed(1)].concat(yr?[fmt(H.sunHexp[o])]:[]).concat([fmt(H.by[o]),H.intensity[o].toFixed(1)]))}];
    out.tables.push({title:'Readings',head:['What the massing suggests'],rows:sunReadings(r).map(s=>[s.replace(/<[^>]+>/g,'')])});
    try{ const V=LAB.viz; out.charts=[{svg:V.pdf(shadowRangeSVG(r)),title:'Shadow range · '+D.label},{svg:V.pdf(facadeMapSVG(r)),title:'Sun hours on each face by floor'},{svg:V.pdf(V.hbars(ORI5.map(o=>({label:NAMES[o],v:H.sunH[o],color:FACE_COL[o]||'#888',text:H.sunH[o].toFixed(1)+' h'})),{title:'Sun hours by face, clear day',dec:1})),title:'Sun hours by face'}]; }catch(e){ console.error(e); }
    if(yr) out.tables.push({title:'Sample days',head:['Day','Represents','Sunny share','Hours in study','Plaza shaded ≥ 1 h that day','Lost kWh'],rows:r.months.map(m=>[m.m,m.repDays.toFixed(1)+' d',Math.round(m.sf*100)+'%',String(m.hours),fmt(m.plaza)+' m²',fmt(m.lost)])});
    if(adv()){ const A=solarStudy(r); const eunit=r.perDay?'kWh on a clear day':'kWh in the period';
      out.stats.push(['Heat through glazing with devices',fmt(A.shTot)+' '+eunit+' ('+fmt(A.unTot)+' without)'],['Beam blocked by devices',Math.round(A.blocked*100)+'%'],['PV yield',fmt(A.pvTot)+' '+eunit+', '+A.kwpTot.toFixed(0)+' kWp']);
      out.settings.push(['Glass visible transmittance',SW.glaz.vt.toFixed(2)],['Roof PV',`${Math.round(SW.pv.roof*100)}% of roofs and terraces, ${Math.round(SW.pv.eff*100)}% modules, PR ${SW.pv.pr.toFixed(2)}`]);
      out.tables.push({title:'Façade zones',head:['Zone','Strategy','WWR','SHGC','Depth','PV','Openings'],rows:SW.zones.map(z=>[zoneLabel(z),STRATS[z.strat].name,Math.round(z.wwr*100)+'%',z.shgc.toFixed(2),STRATS[z.strat].device||STRATS[z.strat].depthLabel?z.depth.toFixed(1)+' m':'-',z.pv?Math.round(z.pv*100)+'%':'-',z.operable?'operable':'fixed'])});
      out.tables.push({title:'Solar result by façade zone',head:['Zone','Beam on zone kWh','Let through','Through glass kWh','Without devices','Glare h','PV kWh','Daylight aperture'],rows:A.zones.map(Z=>[Z.label,fmt(Z.beam),Math.round(Z.tAvg*100)+'%',fmt(Z.sh),fmt(Z.un),Z.glare.toFixed(0),Z.pvKwh?fmt(Z.pvKwh):'-',Z.aperture.toFixed(2)])});
      if(A.pv.length) out.tables.push({key:'pv',title:'Photovoltaics',head:['Surface','m²','kWp','kWh','kWh/m²'],rows:A.pv.map(x=>[x.name,fmt(x.area),x.kwp.toFixed(0),fmt(x.kwh),x.perM2.toFixed(0)])});
      if(r.daylight){ const DL=r.daylight; out.stats.push(['Spatial daylight autonomy (sDA'+DL.target+'/50%)',Math.round(DL.sda*100)+'% of floor (LEED bands 40 / 55 / 75%)'],['Useful daylight (UDI 100–3,000 lux)',Math.round(DL.udiU*100)+'% of occupied hours'],['Over 3,000 lux',Math.round(DL.udiE*100)+'% of occupied hours'],['Mean daylight factor',(DL.mean*100).toFixed(1)+'%']); if(r.ase) out.stats.push(['Annual sunlight exposure (1000 lux, 250 h)',Math.round(r.ase.pct*100)+'% of floor (LEED limit 10%)']);
        out.tables.push({title:'Daylight by floor',head:['Level','sDA','DA mean','UDI useful','Over 3,000','Mean DF'].concat(r.ase?['ASE']:[]),rows:DL.rows.filter((x,i)=>i%Math.max(1,Math.round(DL.rows.length/24))===0||i===DL.rows.length-1).map(x=>['L'+(x.i+1),Math.round(x.pctLit*100)+'%',Math.round(x.da*100)+'%',Math.round(x.udiU*100)+'%',Math.round(x.udiE*100)+'%',(x.mean*100).toFixed(1)+'%'].concat(r.ase?[Math.round((r.ase.rows[x.i]||{pct:0}).pct*100)+'%']:[]))});
        out.notes.push('Daylight is climate-based: sixteen sight lines per floor cell to the glass, the neighbours\' obstruction and the zone\'s devices give each cell its view of the sky through each face; hour by hour over the 8:00–18:00 hours of the CWEC typical year each face is lit by its own Perez all-weather sky, with BRE externally and internally reflected light. sDA300/50%, UDI 100–3,000 lux and ASE1000/250h follow IES LM-83 and Honeybee; direct sun is left to blinds for sDA. Interior partitions and real materials need a Radiance run for the submission.'); }
      out.notes.push('Beam is measured per floor from the sun renders, so each zone sees the sun reaching its own levels. Devices are evaluated hour by hour from profile and horizontal shadow angles (overhangs and balconies against the glass height, louvres at 0.5 m pitch, fins at 1.5 m pitch, reveals around 1.8 m windows, light shelves at 2.1 m; a double skin passes 65% of the gain). Heat through glazing = beam × window-to-wall ratio × SHGC × 0.9 × device transmission. PV adds an all-sky diffuse allowance to the measured beam, then module efficiency and performance ratio. Indicative early-design figures.'); }
    if(r.frames&&r.frames.length){ out.grid={title:'Shadows through the '+(yr?'period':'day'),caption:yr&&r.frames.length>3?'One row per representative day: start, middle and end of the study window.':'Every hour of the study window.',rows:r.frames.map(f=>({label:f.label,cells:f.frames.map(c=>({url:c.url,w:c.w,h:c.hh,caption:(c.h<10?'0':'')+c.h+':00'+(c.url?' · sun '+Math.round(c.alt*180/Math.PI)+'° high':' · below horizon')}))}))}; }
    return out; }
  if(kind==='wind'){ const r=windResult, W=S.impact.wind; if(!r) return null; const tot=r.cats.reduce((a,b)=>a+b,0)||1; const names=['Sitting (≤ 2.5 m/s)','Standing (2.5–4)','Strolling (4–6)','Walking (6–8)','Uncomfortable (> 8)'];
    const out={title:'Pedestrian wind study'+(r.annual?' · '+(r.period.full?'whole year':r.period.label):''),settings:[['Mode',modeName],['Case',r.annual?`${r.period.full?'Whole year':r.period.label} (${r.period.days} days): eight sectors of a seasonally blended Vancouver wind rose, weighted by frequency and mean speed`:'Wind from '+W.dir+'° at '+W.speed.toFixed(1)+' m/s at 10 m'],['Method','2-D lattice-Boltzmann (D2Q9), 4 m cells, periodic domain, force driven to a free-stream target'],['Obstacles','Site buildings over 3 m, future towers'+(S.site.future?' included':' excluded')+', tower footprint at pedestrian level'+(r.strat&&r.strat.podiumH>0&&r.strat.podiumExt>0?', podium':'')],['Downwash allowance',r.a.zone?`${r.a.zone.amp.toFixed(2)}× within ${r.a.zone.depth.toFixed(0)} m of the windward face (neighbours average ${r.a.zone.hn.toFixed(0)} m${r.a.zone.note.length?'; '+r.a.zone.amp0.toFixed(2)+'× before the '+r.a.zone.note.join(' and '):''})`:'none']],
      stats:[[r.annual?'Peak annual mean speed':'Peak pedestrian speed',r.maxS.toFixed(1)+' m/s'],['Plaza mean / peak',r.plazaMean.toFixed(1)+' / '+r.plazaWorst.toFixed(1)+' m/s'],['Area moved to a worse comfort band',fmt(r.worse)+' m²'],['Area made calmer',fmt(r.better)+' m²']].concat(r.annual?[['Gusty more than 5% of hours',fmt(r.gusty)+' m² (was '+fmt(r.gustyB)+' m²)']]:[]),
      tables:[{title:r.annual?'Annual mean speed, share of open ground':'Lawson comfort bands, share of open ground',head:['Band','With tower','Without tower'],rows:names.map((n,i)=>[n,(r.cats[i]/tot*100).toFixed(0)+'%',(r.catsB[i]/tot*100).toFixed(0)+'%'])},{title:'Readings',head:['What the flow suggests'],rows:windReadings(r).map(s=>[s.replace(/<[^>]+>/g,'')])}],
      notes:['Speeds are the solved pedestrian-level flow scaled to the site wind speed; they show where the massing accelerates or shelters the wind, not absolute values. Gusts run roughly 1.8× the mean. A CFD or wind-tunnel study is needed for a development permit.',r.annual?'Wind rose for the period (approximate YVR normals, blended between an east-dominated winter rose and a west and north-west summer rose): '+r.sectors.map(s=>s.name+' '+Math.round(s.f*100)+'% at '+s.s.toFixed(1)+' m/s').join(', ')+'.':'Vancouver\'s prevailing wind is westerly; the winter case to check for the plaza is easterly Arctic outflow along Burrard Inlet.'],
      overlay:(W.view==='delta')?'Red: faster with the tower; teal: calmer.':(W.view==='strat'&&r.a0)?'Red: faster with the strategies; teal: calmer.':'Green to red: sitting, standing, strolling, walking, uncomfortable.'};
    const V=refWind(); out.tables.push({title:'Wind with height · '+V.label,head:['Height m','Mean m/s','Gust m/s','Gust pressure kPa'],rows:windProfile(V.U).map(p=>[p.z.toFixed(0),p.U.toFixed(1),p.gust.toFixed(1),(p.q*3.24/1000).toFixed(2)])});
    try{ const Z=LAB.viz; const prof=windProfile(V.U); out.charts=[{svg:Z.pdf(Z.stack([{label:'With the tower',parts:r.cats},{label:'Without',parts:r.catsB}],BANDS.map((n,i)=>({name:n,color:BAND_COL[i]})),{title:'Lawson comfort bands, share of open ground'})),title:'Comfort bands'},{svg:Z.pdf(downwashSVG(r)),title:'Downwash section'},{svg:Z.pdf(Z.line([{name:'mean',color:'#1F8A8A',pts:prof.map(p=>[p.U,p.z]),dots:true},{name:'gust',color:'#B3362B',dash:true,pts:prof.map(p=>[p.gust,p.z])}],{title:'Wind with height · '+V.label,xLabel:'m/s',yLabel:'height m',yMax:LAB.S.height,xDec:0,yDec:0})),title:'Wind with height'}]; if(r.annual) out.charts.push({svg:Z.pdf(Z.rose(r.sectors.map(x=>({name:x.name,dir:x.dir,f:x.f,s:x.plazaMean})),{title:'By sector: share of hours, colour = plaza mean',color:'#1F8A8A'})),title:'Wind sectors'}); }catch(e){ console.error(e); }
    if(r.annual) out.tables.push({title:'By wind sector',head:['From','Share of hours','Mean speed','Plaza mean','Peak','Worse','Calmer'],rows:r.sectors.map(s=>[s.name,Math.round(s.f*100)+'%',s.s.toFixed(1)+' m/s',s.plazaMean.toFixed(1),s.maxS.toFixed(1),fmt(s.worse)+' m²',fmt(s.better)+' m²'])});
    if(adv()&&r.vent){ const N=r.vent; const TW=r.terr||[]; const VT=r.vt;
      if(VT&&VT.operable) out.stats.push(['ASHRAE 62.1 free opening area',VT.freePct.toFixed(1)+'% of floor served ('+VT.meet4+' of '+VT.operable+' operable floors meet 4%)'],['Floor within 8 m of an operable opening',Math.round(VT.within8*100)+'%']);
      if(r.vsBase) out.stats.push(['Calmer with the wind strategies',fmt(r.vsBase.better)+' m² (windier '+fmt(r.vsBase.worse)+' m²)'],['Plaza mean before the strategies',r.vsBase.plazaMean0.toFixed(1)+' m/s']);
      out.settings.push(['Wind strategies',r.strat?[r.strat.podiumH>0&&r.strat.podiumExt>0?`podium ${r.strat.podiumH} m high, ${r.strat.podiumExt} m beyond the tower`:'',r.strat.canopy>0?`canopy ${r.strat.canopy} m`:'',r.strat.corners!=='sharp'?r.strat.corners+' corners':'',r.strat.shelter>0?Math.round(r.strat.shelter*100)+'% plaza shelter':''].filter(Boolean).join(', '):'none in this run'],['Natural ventilation',`${{cross:'cross',single:'single-sided',stack:'stack'}[SW.vent.mode]}, outdoor air ${SW.vent.tmin}–${SW.vent.tmax} °C, windows closed above ${SW.vent.umax} m/s gust; ${N.operable} of ${N.nF} floors operable`]);
      out.stats.push(['Natural ventilation hours',fmt(N.total)+' of '+fmt(N.hoursTot)+' in the period'],['Operable windows usable up to',N.all?'the top':(N.limit?'L'+N.limit:'none')]);
      out.tables.push({title:'Natural ventilation by month',head:['Month','Days','Mean °C','Air in window','Vent hours'],rows:N.rows.filter(x=>x.days>0).map(x=>[x.m,String(x.days),x.T.toFixed(1),Math.round(x.fT*100)+'%',fmt(x.vent)])});
      if(TW.length) out.tables.push({title:'Wind on terraces and roofs',head:['Level','Height m','m²','Mean m/s','Gust m/s','Comfort','With screens'],rows:TW.map(t=>['L'+t.level,t.z.toFixed(0),fmt(t.area),t.U.toFixed(1),t.gust.toFixed(1),BANDS[t.band],t.screened?BANDS[t.bandS]+' ('+t.Us.toFixed(1)+' m/s)':'-'])});
      out.notes.push('Ventilation hours combine the share of hours with outdoor air in the comfort window (monthly mean ±5 °C daily swing) with the share of hours the wind at each operable floor is usable under a Rayleigh distribution of the period\'s rose mean, scaled to height with a 0.25 power law; a double-skin zone raises the limit 1.6×. Wind strategies: a podium is an obstacle at ground level and catches up to 80% of the downwash at 30 m; a canopy breaks up to 35% of it at the entrance; rounded or chamfered corners cut corner streams by 22% or 15% within 14 m; plaza planting and screens slow the sheltered area by up to 40%; terrace screens halve the wind felt on terraces.'); }
    return out; }
  return null;
}

/* ---------- floor plan: the sun patch on the plate through each zone's glass and device, and air paths through operable faces ---------- */
const FACE_COL={N:'#5B7FA6',E:'#D9A441',S:'#D06A4B',W:'#8C5B90'};
function stratParts(z,alt,azDeg,faceAz,gh){ const st=STRATS[z.strat]; const D=z.depth; let dim=st.mod||1, cut=0; if(!st.device||D<=0) return {cut,dim};
  const hsa=((azDeg-faceAz)+540)%360-180; const c=Math.cos(hsa*Math.PI/180); if(c<=0.02) return {cut,dim};
  const tanProf=Math.tan(alt)/c, tanH=Math.abs(Math.tan(hsa*Math.PI/180)); const g=Math.max(0.5,gh);
  switch(z.strat){ case 'overhang': case 'balcony': cut=Math.min(1,D*tanProf/g); break; case 'louvres': dim*=1-Math.min(1,D*tanProf/0.5); break; case 'fins': dim*=1-Math.min(1,D*tanH/1.5); break;
    case 'eggcrate': dim*=(1-Math.min(1,D*tanProf/0.5))*(1-Math.min(1,D*tanH/1.5)); break; case 'punched': cut=Math.min(1,D*tanProf/g); dim*=1-Math.min(1,D*tanH/1.8); break;
    case 'lightshelf': { const hs=Math.min(2.1,g); cut=(hs/g)*Math.min(1,D*tanProf/hs); break; } }
  return {cut,dim}; }
function planLevel(){ const nF=LAB.floors?LAB.floors.length:1; let L=SW.planLevel||Math.round(nF*0.55); L=Math.max(1,Math.min(nF,L)); return L; }
function cardinalOf(nx,ny,rot){ const a=Math.atan2(ny,nx)+rot; const deg=((a*180/Math.PI)%360+360)%360; return deg<45||deg>=315?'E':(deg<135?'N':(deg<225?'W':'S')); }
function planStudy(f){
  const S=LAB.S, m=f.mask, lvl=f.i+1, hh=f.h-GAP, W2=f.w/2, D2=f.d/2; const cc=LAB.toLocal(f,S.posX,S.posY), ch=f.core/2;
  const solid=(cx,cy)=>cx>=0&&cy>=0&&cx<m.nx&&cy<m.ny&&(m.x0+cx+0.5<=W2)&&(m.y0+cy+0.5<=D2)&&!!m.cells[cy*m.nx+cx];
  const inCore=(x,y)=>Math.abs(x-cc.x)<=ch&&Math.abs(y-cc.y)<=ch;
  const walk=(ix,iy,dx,dy)=>{ let x=m.x0+ix+0.5, y=m.y0+iy+0.5, px=ix, py=iy; for(let k=1;k<400;k++){ x+=dx*0.5; y+=dy*0.5; if(inCore(x,y)) return null; const cx=Math.floor(x-m.x0), cy=Math.floor(y-m.y0); if(!solid(cx,cy)){ let nx=cx!==px?Math.sign(cx-px):0, ny=cy!==py?Math.sign(cy-py):0; if(nx&&ny){ if(Math.abs(dx)>=Math.abs(dy)) ny=0; else nx=0; } if(!nx&&!ny){ nx=Math.sign(dx); ny=Math.sign(dy); if(Math.abs(dx)>=Math.abs(dy)) ny=0; else nx=0; } return {D:k*0.5,o:cardinalOf(nx,ny,f.rot)}; } px=cx; py=cy; } return null; };
  const sd=S.impact.sun, Dt=DATES[sd.date]; const p=sunPos(Dt.doy,sd.hour,Dt.tz); const sunUp=p.alt>0.02; const azDeg=p.az*180/Math.PI;
  const sw={x:Math.sin(p.az),y:Math.cos(p.az)}; const c=Math.cos(-f.rot), s=Math.sin(-f.rot); const sl={x:sw.x*c-sw.y*s,y:sw.x*s+sw.y*c};
  const Wc=S.impact.wind; let wdir=Wc.dir, U10=Wc.speed; if(Wc.annual){ const rose=roseFor(periodInfo()); const top=rose.slice().sort((a,b)=>b.f-a.f)[0]; wdir=top.dir; U10=rose.reduce((q,r)=>q+r.f*r.s,0); }
  const wf={x:Math.sin(wdir*Math.PI/180),y:Math.cos(wdir*Math.PI/180)}; const fl={x:-(wf.x*c-wf.y*s),y:-(wf.x*s+wf.y*c)};
  const zc=f.z+f.h/2, Uz=U10*Math.pow(Math.max(10,zc)/10,ALPHA);
  const cpOf=o=>cpFace(wdir,FACE_AZ[o]+(LAB.phys?LAB.phys.faceOffset(f.rot):0));
  const zoneOf=o=>zoneFor(o,lvl); const V=SW.vent, open=V.open||0.1, mode=V.mode;
  const lit=[], litNo=[], vent=[]; let area=0, aLit=0, aLitNo=0, aVent=0, aWithin8=0, aRule=0, maxDepth=0; const edgeLen={N:0,E:0,S:0,W:0}; let opIn=0, opOut=0, cpIn=null, cpOut=null;
  for(const e of edgesOf(f)) edgeLen[e.o]+=e.L;
  let boost=1; for(const o of ORI){ const z=zoneOf(o); if(z.operable) boost=Math.max(boost,STRATS[z.strat].ventBoost||1); } const umax=V.umax*boost; const windowsOpen=Uz*1.8<=umax;
  // distance to the nearest operable opening (cells), for the CIBSE depth rules and the ASHRAE 62.1 8 m rule
  const near=new Int16Array(m.nx*m.ny).fill(-1); { const q=[]; for(let iy=0;iy<m.ny;iy++) for(let ix=0;ix<m.nx;ix++){ if(!solid(ix,iy)) continue; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ if(!solid(ix+dx,iy+dy)){ if(zoneOf(cardinalOf(dx,dy,f.rot)).operable){ near[iy*m.nx+ix]=1; q.push(ix,iy); break; } } } }
    let head=0; while(head<q.length){ const ix=q[head++], iy=q[head++]; const d=near[iy*m.nx+ix]; if(d>=60) continue; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const jx=ix+dx,jy=iy+dy; if(!solid(jx,jy)) continue; const x=m.x0+jx+0.5,y=m.y0+jy+0.5; if(inCore(x,y)) continue; const k=jy*m.nx+jx; if(near[k]<0){ near[k]=d+1; q.push(jx,jy); } } } }
  const limSingle=Math.round(2.5*hh), limStack=12, limCross=Math.round(5*hh);
  for(let iy=0;iy<m.ny;iy++) for(let ix=0;ix<m.nx;ix++){ if(!solid(ix,iy)) continue; const x=m.x0+ix+0.5, y=m.y0+iy+0.5; if(inCore(x,y)) continue; area++; const nd=near[iy*m.nx+ix]; if(nd>0&&nd<=8) aWithin8++; if(nd>0&&nd<=(mode==='cross'?limCross:mode==='single'?limSingle:limStack)) aRule++;
    if(sunUp){ const ex=walk(ix,iy,sl.x,sl.y); if(ex){ const z=zoneOf(ex.o); const B=band(f,ex.o,z), sp=B.sp, gh=B.gh; const hz=ex.D*Math.tan(p.alt); if(hz>=sp&&hz<=sp+gh){ aLitNo++; litNo.push(ix,iy); const pr=stratParts(z,p.alt,azDeg,FACE_AZ[ex.o],gh); if(hz<=sp+gh*(1-pr.cut)&&pr.dim>0.02){ aLit++; lit.push(ix,iy,pr.dim); if(ex.D>maxDepth) maxDepth=ex.D; } } } }
    if(windowsOpen){ if(mode==='cross'){ const back=walk(ix,iy,-fl.x,-fl.y), fwd=walk(ix,iy,fl.x,fl.y); if(back&&fwd&&back.D<=limCross){ const zi=zoneOf(back.o), zo=zoneOf(fwd.o); if(zi.operable&&zo.operable&&cpOf(back.o)>cpOf(fwd.o)){ aVent++; vent.push(ix,iy); cpIn=cpOf(back.o); cpOut=cpOf(fwd.o); } } }
      else if(nd>0&&nd<=(mode==='stack'?limStack:limSingle)){ aVent++; vent.push(ix,iy); } } }
  let ghMean=0, gN=0; for(const o of ORI){ const z=zoneOf(o); if(!z.operable||!edgeLen[o]) continue; const gh=hh*z.wwr; ghMean+=gh; gN++; const A=edgeLen[o]*gh*open; const cp=cpOf(o); if(cp>0) opIn+=A; else opOut+=A; }
  ghMean=gN?ghMean/gN:2; const freeArea=opIn+opOut, freePct=area?freeArea/area*100:0;
  let ach=0, Q=0, Qw=0, Qs=0; const vol=area*hh; const dT=V.dT||3, Tm=283;
  if(windowsOpen&&vol>0){ if(mode==='cross'&&opIn>0&&opOut>0){ const Aeff=1/Math.sqrt(1/(opIn*opIn)+1/(opOut*opOut)); Qw=0.6*Aeff*Uz*Math.sqrt(Math.max(0.2,(cpIn==null?0.7:cpIn)-(cpOut==null?-0.3:cpOut))); } else if(mode!=='cross'&&freeArea>0){ Qw=0.025*freeArea*Uz; Qs=0.6*freeArea/3*Math.sqrt(9.81*(mode==='stack'?hh*3:ghMean)*dT/Tm); } Q=Math.sqrt(Qw*Qw+Qs*Qs); ach=Q*3600/vol; }
  return {f,lvl,hh,area,aLit,aLitNo,aVent,aWithin8,aRule,near,lit,litNo,vent,maxDepth,sunUp,p,azDeg,sl,fl,wdir,Uz,windowsOpen,umax,mode,ach,Q,Qw,Qs,opIn,opOut,freeArea,freePct,edgeLen,cc,ch,open,limSingle,limCross,limStack};
}
/* ---------- daylight, after Radiance / Daysim / Honeybee practice: sky component per cell from sixteen sight lines to the glass under the CIE overcast sky (the daylight factor),
   then a climate-based run over the LM-83 occupied hours of the CWEC year: each face's window is lit by its own Perez all-weather sky, light reflected off the
   neighbours (BRE externally reflected component) and an internally reflected component from the BRE split-flux formula hour by hour; direct sun is left to the
   blinds as LM-83 does for sDA. Outputs: DF, daylight autonomy DA300, sDA300/50%, UDI 100–3000 lux and the monthly daylight share used for dimming the lights. ---------- */
const DL_E=16000; // fallback design diffuse illuminance when the hourly weather is not loaded
const DL_R={floor:0.2,wall:0.5,ceil:0.8,erc:0.2,maint:0.9,udiLo:100,udiHi:3000,rays:16};
const cieBand=(s1,s2)=>3*((s2*s2-s1*s1)/2+2*(s2*s2*s2-s1*s1*s1)/3)/(7*Math.PI); // share of CIE overcast horizontal illuminance per radian of azimuth from altitudes with sines s1..s2
const vertSkyAbove=t=>1-(t/2+Math.sin(2*t)/4)/(Math.PI/4); // share of a vertical window's sky light coming from above an obstruction angle t
function obstructionAngles(f){ if(!siteRaster) buildSiteRaster(); const out={}; const z=f.z+0.8; for(const o of ORI){ const n={N:[0,1],E:[1,0],S:[0,-1],W:[-1,0]}[o]; let hs=0,ds=0,c=0; for(const b of siteRaster.bld){ const dx=b.x-f.cx, dy=b.y-f.cy, d=Math.hypot(dx,dy); if(d<15||d>160) continue; if((dx*n[0]+dy*n[1])/d<0.6) continue; hs+=b.top; ds+=d; c++; } const hn=c?hs/c:0, dn=c?Math.max(25,ds/c):60; out[o]=Math.atan(Math.max(0,hn-z)/dn); } return out; }
function dfFactor(z){ const st=STRATS[z.strat], D=z.depth; let k=1; switch(z.strat){ case 'louvres': k=Math.max(0.2,1-0.6*D/0.5); break; case 'fins': k=Math.max(0.4,1-0.4*D/1.5); break; case 'eggcrate': k=Math.max(0.15,(1-0.6*D/0.5)*(1-0.4*D/1.5)); break; case 'punched': k=0.75*Math.max(0.6,1-0.3*D/1.8); break; case 'doubleskin': k=0.8; break; default: k=1; } return {k,shelf:z.strat==='lightshelf',top:(st.device&&(z.strat==='overhang'||z.strat==='balcony'||z.strat==='lightshelf'))?D:0}; }
/* the occupied hours and each face's hourly sky for one floor rotation; every hs-th day */
const dlSkyCache={};
function dlSky(f,hs){ const P=LAB.phys&&LAB.phys.prep(); if(!P) return null; const off=LAB.phys.faceOffset(f.rot); const key=Math.round(off)+':'+hs; if(dlSkyCache[key]&&dlSkyCache[key].src===P) return dlSkyCache[key];
  const idx=[]; for(const k of P.occ) if((P.doy[k]-1)%hs===0) idx.push(k); const n=idx.length; const out={src:P,n,mon:new Int8Array(n)}; idx.forEach((k,j)=>out.mon[j]=P.mon[k]);
  for(const o of ORI){ const F=LAB.phys.face(FACE_AZ[o]+off); const sky=new Float32Array(n), gnd=new Float32Array(n); idx.forEach((k,j)=>{ sky[j]=F.skyL[k]; gnd[j]=F.gndL[k]; }); out[o]={sky,gnd}; }
  return (dlSkyCache[key]=out); }
function daylightFloor(f,step,hs){
  step=step||1; hs=hs||1; const S=LAB.S, m=f.mask, lvl=f.i+1, hh=f.h-GAP, W2=f.w/2, D2=f.d/2; const cc=LAB.toLocal(f,S.posX,S.posY), ch=f.core/2; const tau=SW.glaz.vt*DL_R.maint;
  const solid=(cx,cy)=>cx>=0&&cy>=0&&cx<m.nx&&cy<m.ny&&(m.x0+cx+0.5<=W2)&&(m.y0+cy+0.5<=D2)&&!!m.cells[cy*m.nx+cx]; const inCore=(x,y)=>Math.abs(x-cc.x)<=ch&&Math.abs(y-cc.y)<=ch;
  const obs=obstructionAngles(f); const NR=DL_R.rays, dphi=2*Math.PI/NR; const dirs=[]; for(let i=0;i<NR;i++){ const a=(i+0.5)*dphi; dirs.push([Math.cos(a),Math.sin(a)]); }
  const fi={}; for(const o of ORI) fi[o]=ORI.indexOf(o);
  const nc=m.nx*m.ny, sc=new Float32Array(nc*4), df=new Float32Array(nc), cellList=[];
  for(let iy=0;iy<m.ny;iy+=step) for(let ix=0;ix<m.nx;ix+=step){ if(!solid(ix,iy)) continue; const x0=m.x0+ix+0.5, y0=m.y0+iy+0.5; if(inCore(x0,y0)) continue; const ci=iy*m.nx+ix; cellList.push(ci);
    for(const [dx,dy] of dirs){ let x=x0,y=y0,px=ix,py=iy,hit=null; for(let k=1;k<160;k++){ x+=dx*0.5; y+=dy*0.5; if(inCore(x,y)) break; const cx=Math.floor(x-m.x0), cy=Math.floor(y-m.y0); if(!solid(cx,cy)){ let nx=cx!==px?Math.sign(cx-px):0, ny=cy!==py?Math.sign(cy-py):0; if((nx&&ny)||(!nx&&!ny)){ if(Math.abs(dx)>=Math.abs(dy)){ nx=Math.sign(dx); ny=0; } else { ny=Math.sign(dy); nx=0; } } hit={D:k*0.5,o:cardinalOf(nx,ny,f.rot)}; break; } px=cx; py=cy; }
      if(!hit) continue; const z=zoneFor(hit.o,lvl); const B=band(f,hit.o,z); const d=Math.max(0.5,hit.D); const F=dfFactor(z); const sill=Math.max(0,B.sp-0.8), head=Math.max(sill+0.1,B.head-0.8);
      const a0=Math.atan(sill/d), a2=Math.atan(head/(d+F.top)); if(a2<=a0) continue; const ob=obs[hit.o], a1=Math.max(a0,Math.min(a2,ob));
      let v=dphi*cieBand(Math.sin(a1),Math.sin(a2))+DL_R.erc*dphi*cieBand(Math.sin(a0),Math.sin(a1)); v*=tau*F.k; if(F.shelf) v*=d<4?0.9:1.15; sc[ci*4+fi[hit.o]]+=v; } }
  // internally reflected component (BRE split-flux), uniform over the plate: glass area by face, room surfaces, reflectances
  let perim=0; const Wg={N:0,E:0,S:0,W:0}; for(const e of edgesOf(f)){ const z=zoneFor(e.o,lvl); const B=band(f,e.o,z); perim+=e.L; Wg[e.o]+=e.L*B.gh*tau*dfFactor(z).k; }
  const Af=f.area||cellList.length*step*step, walls=(perim+4*f.core)*hh, Atot=2*Af+walls, Rm=(DL_R.floor*Af+DL_R.ceil*Af+DL_R.wall*walls)/Atot;
  const Rfw=(DL_R.floor*Af+DL_R.wall*walls/2)/(Af+walls/2), Rcw=(DL_R.ceil*Af+DL_R.wall*walls/2)/(Af+walls/2), kI=0.85/(Atot*(1-Rm));
  const fo={}; for(const o of ORI) fo[o]=vertSkyAbove(obs[o]);
  let ircDF=0; for(const o of ORI) ircDF+=kI*Wg[o]*((0.396*fo[o]+DL_R.erc*0.396*(1-fo[o]))*Rfw+0.1*Rcw);
  const target=SW.dl&&SW.dl.target||300; let sum=0, n=0, lit=0, daSum=0, uS=0, uU=0, uE=0;
  for(const ci of cellList){ const v=sc[ci*4]+sc[ci*4+1]+sc[ci*4+2]+sc[ci*4+3]+ircDF; df[ci]=v; sum+=v; n++; }
  const sky=dlSky(f,hs); const da=new Float32Array(nc); const dsfM=new Float64Array(12), hM=new Float64Array(12); let hourly=false;
  if(sky){ hourly=true; const N=sky.n; const irc=new Float32Array(N); const sN=sky.N, sE=sky.E, sS=sky.S, sW=sky.W;
    for(let j=0;j<N;j++){ let v=0; for(const o of ORI){ const q=sky[o]; v+=Wg[o]*((q.sky[j]*fo[o]+DL_R.erc*q.sky[j]*(1-fo[o]))*Rfw+q.gnd[j]*Rcw); } irc[j]=kI*v; hM[sky.mon[j]]++; }
    // sky light through each face scales with that face's Perez sky against the CIE overcast vertical/horizontal ratio 0.396
    const kN=new Float32Array(N), kE=new Float32Array(N), kS=new Float32Array(N), kW=new Float32Array(N); for(let j=0;j<N;j++){ kN[j]=sN.sky[j]/0.396; kE[j]=sE.sky[j]/0.396; kS[j]=sS.sky[j]/0.396; kW[j]=sW.sky[j]/0.396; }
    const cellDsf=new Float64Array(12);
    for(const ci of cellList){ const a=sc[ci*4], b=sc[ci*4+1], c=sc[ci*4+2], d=sc[ci*4+3]; let ok=0, s=0, u=0, e=0; cellDsf.fill(0);
      for(let j=0;j<N;j++){ const E=a*kN[j]+b*kE[j]+c*kS[j]+d*kW[j]+irc[j]; if(E>=target){ ok++; cellDsf[sky.mon[j]]+=1; } else cellDsf[sky.mon[j]]+=E/target; if(E<DL_R.udiLo) s++; else if(E>DL_R.udiHi) e++; else u++; }
      const daC=ok/N; da[ci]=daC; daSum+=daC; if(daC>=0.5) lit++; uS+=s/N; uU+=u/N; uE+=e/N; for(let q=0;q<12;q++) dsfM[q]+=cellDsf[q]; }
    for(let q=0;q<12;q++) dsfM[q]=hM[q]&&n?dsfM[q]/(hM[q]*n):0; }
  else { const t=target/DL_E; for(const ci of cellList){ const v=df[ci]; const daC=Math.max(0,Math.min(1,1-0.5*t/Math.max(1e-6,v))); da[ci]=daC; daSum+=daC; if(v>=t) lit++; if(v<DL_R.udiLo/DL_E) uS++; else if(v>DL_R.udiHi/DL_E) uE++; else uU++; } for(let q=0;q<12;q++) dsfM[q]=n?daSum/n:0; }
  return {df,da,step,mean:n?sum/n:0,pctLit:n?lit/n:0,daMean:n?daSum/n:0,udiS:n?uS/n:0,udiU:n?uU/n:0,udiE:n?uE/n:0,pctOver:n?uE/n:0,dsf:Array.from(dsfM),cells:n,target,hourly,hours:sky?sky.n*hs:0,irc:ircDF};
}
/* annual sunlight exposure (IES LM-83): every occupied hour of the CWEC year with its measured direct normal light (Perez beam efficacy), grouped by 2° of azimuth so
   each cell walks one ray per azimuth, then tests every hour in that bin against the window band and the zone's device, hour by hour */
function aseHours(PI){ const P=LAB.phys&&LAB.phys.prep(); if(!P) return null; const key=PI.d0+':'+PI.d1; if(aseHours.c&&aseHours.c.key===key&&aseHours.c.src===P) return aseHours.c.v;
  const bins=new Map(); let occN=0; for(const k of P.occ){ if(!LAB.phys.inPeriod(PI,P.doy[k])) continue; occN++; if(P.alt[k]<=0.03) continue; const E=P.Eb[k]*Math.sin(P.alt[k]); if(E<1000) continue; const b=Math.round(P.az[k]*90/Math.PI); let o=bins.get(b); if(!o){ o={az:b*2,alt:[],E:[]}; bins.set(b,o); } o.alt.push(P.alt[k]); o.E.push(E); }
  const v={bins:[...bins.values()].map(o=>({az:o.az,alt:Float32Array.from(o.alt),E:Float32Array.from(o.E)})),occN,hours:[...bins.values()].reduce((s,o)=>s+o.alt.length,0)}; aseHours.c={key,src:P,v}; return v; }
function aseFloor(f,coarse){
  const S=LAB.S, m=f.mask, lvl=f.i+1, W2=f.w/2, D2=f.d/2; const cc=LAB.toLocal(f,S.posX,S.posY), ch=f.core/2; const tau=SW.glaz.vt; const off=LAB.phys?LAB.phys.faceOffset(f.rot):0;
  const solid=(cx,cy)=>cx>=0&&cy>=0&&cx<m.nx&&cy<m.ny&&(m.x0+cx+0.5<=W2)&&(m.y0+cy+0.5<=D2)&&!!m.cells[cy*m.nx+cx]; const inCore=(x,y)=>Math.abs(x-cc.x)<=ch&&Math.abs(y-cc.y)<=ch;
  const PI=periodInfo(); const AH=aseHours(PI); const step=coarse?2:1; const hrs=new Float32Array(m.nx*m.ny); let n=0, over=0;
  if(!AH) return {hrs,step,pctOver:0,cells:0,positions:0,period:PI,thr:250,hourly:false};
  const thr=250*(PI.full?1:AH.occN/3650); const c=Math.cos(-f.rot), s=Math.sin(-f.rot); const B=AH.bins.map(b=>{ const a=b.az*Math.PI/180, sx=Math.sin(a), sy=Math.cos(a); return {b,dx:sx*c-sy*s,dy:sx*s+sy*c}; });
  for(let iy=0;iy<m.ny;iy+=step) for(let ix=0;ix<m.nx;ix+=step){ if(!solid(ix,iy)) continue; const x0=m.x0+ix+0.5, y0=m.y0+iy+0.5; if(inCore(x0,y0)) continue; n++; let Hh=0;
    for(const {b,dx,dy} of B){ let x=x0,y=y0,px=ix,py=iy,hit=null; for(let k=1;k<200;k++){ x+=dx*0.5; y+=dy*0.5; if(inCore(x,y)) break; const cx=Math.floor(x-m.x0), cy=Math.floor(y-m.y0); if(!solid(cx,cy)){ let nx=cx!==px?Math.sign(cx-px):0, ny=cy!==py?Math.sign(cy-py):0; if((nx&&ny)||(!nx&&!ny)){ if(Math.abs(dx)>=Math.abs(dy)){ nx=Math.sign(dx); ny=0; } else { ny=Math.sign(dy); nx=0; } } hit={D:k*0.5,o:cardinalOf(nx,ny,f.rot)}; break; } px=cx; py=cy; }
      if(!hit) continue; const z=zoneFor(hit.o,lvl); const Bd=band(f,hit.o,z), sp=Bd.sp, gh=Bd.gh; const faz=FACE_AZ[hit.o]+off;
      for(let j=0;j<b.alt.length;j++){ const al=b.alt[j]; const hz=hit.D*Math.tan(al); if(hz<sp||hz>sp+gh) continue; if(b.E[j]*tau<1000) continue; const pr=stratParts(z,al,b.az,faz,gh); if(hz>sp+gh*(1-pr.cut)) continue; if(b.E[j]*tau*pr.dim>=1000) Hh++; } }
    hrs[iy*m.nx+ix]=Hh; if(Hh>=thr) over++; }
  return {hrs,step,pctOver:n?over/n:0,cells:n,positions:AH.hours,period:PI,thr,hourly:true};
}
let dlCache={key:null,rows:null}, aseTowerRes=null, aseBusy=false;
function dlKey(){ const floors=LAB.floors; return JSON.stringify([SW.zones,SW.glaz.vt,SW.dl,floors.length,floors.map(f=>[f.w,f.d,f.h,f.area|0]),LAB.site&&LAB.site.meta&&LAB.site.meta.source,LAB.S.posX,LAB.S.posY,LAB.S.rotDeg,LAB.S.site.future,!!(LAB.CLIMATE.hourly)]); }
/* floors that share plate, rotation, zones and obstruction give the same result: compute once */
function floorSig(f){ const m=f.mask; let h=0; for(let k=0;k<m.cells.length;k++) if(m.cells[k]) h=(h*31+k)%1000000007; const obs=obstructionAngles(f); return JSON.stringify([m.nx,m.ny,m.x0,m.y0,h,f.w,f.d,f.h,f.core,f.rot.toFixed(3),LAB.toLocal(f,LAB.S.posX,LAB.S.posY),f.open,f.ceil,ORI.map(o=>SW.zones.indexOf(zoneFor(o,f.i+1))),ORI.map(o=>Math.round(obs[o]*90))]); }
let dlTimer=null;
function daylightTowerCached(){ if(!LAB.floors) return null; const key=dlKey(); if(dlCache.key===key) return dlCache.rows; clearTimeout(dlTimer); dlTimer=setTimeout(()=>{ try{ daylightTower(); if(LAB.S.impact.mode==='sun') renderSun(sunResult); else if(adv()) setOut(null); }catch(e){ console.error(e); } },280); return null; }
function daylightTower(){
  const floors=LAB.floors; if(!floors) return null; const key=dlKey();
  if(dlCache.key===key) return dlCache.rows; const memo={};
  const rows=floors.map(f=>{ const sig=floorSig(f); const r=memo[sig]||(memo[sig]=daylightFloor(f,2,2)); return {i:f.i,area:f.area,mean:r.mean,pctLit:r.pctLit,pctOver:r.pctOver,da:r.daMean,udiS:r.udiS,udiU:r.udiU,udiE:r.udiE,dsf:r.dsf,target:r.target,hourly:r.hourly}; });
  const A=rows.reduce((s,r)=>s+r.area,0); const aw=g=>rows.reduce((s,r)=>s+g(r)*r.area,0)/Math.max(1,A);
  dlCache={key,rows:{rows,sda:aw(r=>r.pctLit),over:aw(r=>r.pctOver),mean:aw(r=>r.mean),da:aw(r=>r.da),udiS:aw(r=>r.udiS),udiU:aw(r=>r.udiU),udiE:aw(r=>r.udiE),target:SW.dl&&SW.dl.target||300,hourly:rows.length?rows[0].hourly:false,unique:Object.keys(memo).length}}; return dlCache.rows;
}
async function aseTower(progress){
  const floors=LAB.floors; if(!floors||aseBusy||!(LAB.phys&&LAB.phys.prep())) return null; aseBusy=true; const rows=[]; const memo={}; try{ for(const f of floors){ const sig=floorSig(f); if(!memo[sig]){ if(progress) progress(`Annual sun · L${f.i+1} of ${floors.length}`); await new Promise(r=>setTimeout(r,0)); memo[sig]=aseFloor(f,true); } const r=memo[sig]; rows.push({i:f.i,area:f.area,pct:r.pctOver}); } }finally{ aseBusy=false; }
  const A=rows.reduce((s,r)=>s+r.area,0); aseTowerRes={rows,pct:rows.reduce((s,r)=>s+r.pct*r.area,0)/Math.max(1,A),key:dlCache.key,period:periodInfo().label}; return aseTowerRes;
}
function floorBars(rows,get,color,label,threshold){ const W=380,H=90,L=28,R=8,T=8,B=16; const n=rows.length, bw=(W-L-R)/n; let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}"><style>text{font-family:var(--font-m);font-size:8.5px;fill:var(--muted)}</style>`; for(const v of [0,0.5,1]){ const y=T+(H-T-B)*(1-v); s+=`<line x1="${L}" x2="${W-R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--chart-grid)"/><text x="${L-3}" y="${(y+3).toFixed(1)}" text-anchor="end">${Math.round(v*100)}%</text>`; } if(threshold!=null){ const y=T+(H-T-B)*(1-threshold); s+=`<line x1="${L}" x2="${W-R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--warn)" stroke-dasharray="3 2"/>`; } rows.forEach((r,i)=>{ const v=Math.max(0,Math.min(1,get(r))); const h=(H-T-B)*v; s+=`<rect x="${(L+i*bw).toFixed(2)}" y="${(T+(H-T-B)-h).toFixed(1)}" width="${Math.max(0.5,bw-0.6).toFixed(2)}" height="${h.toFixed(1)}" fill="${color}"><title>L${r.i+1}: ${Math.round(v*100)}%</title></rect>`; }); s+=`<text x="${L}" y="${H-4}">L1</text><text x="${W-R}" y="${H-4}" text-anchor="end">L${n}</text>`; return s+'</svg>'; }
function floorStack(rows,parts,label){ const W=380,H=104,L=28,R=8,T=8,B=30; const n=rows.length, bw=(W-L-R)/Math.max(1,n); let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}" data-key="udi"><style>text{font-family:var(--font-m);font-size:8.5px;fill:var(--muted)}</style>`; const ph=H-T-B; for(const v of [0,0.5,1]){ const y=T+ph*(1-v); s+=`<line x1="${L}" x2="${W-R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--chart-grid)"/><text x="${L-3}" y="${(y+3).toFixed(1)}" text-anchor="end">${Math.round(v*100)}%</text>`; }
  rows.forEach((r,i)=>{ let acc=0; for(const [k,name,col] of parts){ const v=Math.max(0,r[k]||0); const h=ph*v; s+=`<rect x="${(L+i*bw).toFixed(2)}" y="${(T+ph-(acc+v)*ph).toFixed(1)}" width="${Math.max(0.5,bw-0.6).toFixed(2)}" height="${h.toFixed(1)}" fill="${col}"><title>L${r.i+1} · ${name}: ${Math.round(v*100)}%</title></rect>`; acc+=v; } });
  s+=`<text x="${L}" y="${T+ph+11}">L1</text><text x="${W-R}" y="${T+ph+11}" text-anchor="end">L${n}</text>`; parts.forEach(([k,name,col],j)=>{ const x=L+j*((W-L-R)/parts.length); s+=`<rect x="${x}" y="${H-10}" width="8" height="8" rx="2" fill="${col}"/><text x="${x+11}" y="${H-3}">${name}</text>`; }); return s+'</svg>'; }
const rampDA=v=>{ const t=Math.max(0,Math.min(1,v)); const a=[44,62,96], b=[150,170,190], c=[240,196,92]; const col=t<0.5?lerpC(a,b,t/0.5):lerpC(b,c,(t-0.5)/0.5); return `rgb(${col.map(Math.round).join(',')})`; };
const rampDF=v=>{ const t=Math.max(0,Math.min(1,v/0.05)); const a=[52,76,110], b=[222,228,236], c=[217,144,31]; const col=t<0.4?lerpC(a,b,t/0.4):lerpC(b,c,(t-0.4)/0.6); return `rgb(${col.map(Math.round).join(',')})`; };
const rampASE=v=>{ const t=Math.max(0,Math.min(1,v/500)); const a=[240,224,190], b=[184,54,43]; const col=lerpC(a,b,t); return `rgb(${col.map(Math.round).join(',')})`; };
let planAse={key:null,res:null}, planDL={key:null,res:null};
const rampReach=d=>d<=8?'rgba(46,140,150,0.72)':d<=60?'rgba(46,140,150,0.32)':'rgba(184,54,43,0.16)';
/* the result layer's cells in the floor's own axes (1 unit = 1 m): drawn in the right-panel plan and over the viewport plan */
function planCells(R,layer,extra){ const f=R.f, m=f.mask; let s='';
  const cell=(ix,iy,fill,op)=>`<rect x="${(m.x0+ix).toFixed(1)}" y="${(m.y0+iy).toFixed(1)}" width="${extra&&extra.step||1}" height="${extra&&extra.step||1}" fill="${fill}"${op!=null?` fill-opacity="${op}"`:''}/>`;
  if(layer==='sun'){ for(let k=0;k<R.litNo.length;k+=2) s+=`<rect x="${(m.x0+R.litNo[k]).toFixed(1)}" y="${(m.y0+R.litNo[k+1]).toFixed(1)}" width="1" height="1" fill="none" stroke="var(--sun)" stroke-opacity="0.35" stroke-width="0.15"/>`; for(let k=0;k<R.lit.length;k+=3) s+=cell(R.lit[k],R.lit[k+1],'var(--sun)',(0.3+0.6*R.lit[k+2]).toFixed(2)); }
  else if(layer==='da'&&extra){ const d=extra.da, st=extra.step; for(let iy=0;iy<m.ny;iy+=st) for(let ix=0;ix<m.nx;ix+=st){ const k=iy*m.nx+ix; if(extra.df[k]>0||d[k]>0) s+=cell(ix,iy,rampDA(d[k])); } }
  else if(layer==='df'&&extra){ const d=extra.df, st=extra.step; for(let iy=0;iy<m.ny;iy+=st) for(let ix=0;ix<m.nx;ix+=st){ const v=d[iy*m.nx+ix]; if(v>0) s+=cell(ix,iy,rampDF(v)); } }
  else if(layer==='ase'&&extra){ const d=extra.hrs, st=extra.step; for(let iy=0;iy<m.ny;iy+=st) for(let ix=0;ix<m.nx;ix+=st){ const v=d[iy*m.nx+ix]; if(v>10) s+=cell(ix,iy,rampASE(v)); } }
  else if(layer==='reach'){ const lim=R.mode==='cross'?R.limCross:R.mode==='single'?R.limSingle:R.limStack; for(let iy=0;iy<m.ny;iy++) for(let ix=0;ix<m.nx;ix++){ const x=m.x0+ix+0.5, y=m.y0+iy+0.5; if(!(x<=f.w/2&&y<=f.d/2&&m.cells[iy*m.nx+ix])) continue; if(Math.abs(x-R.cc.x)<=R.ch&&Math.abs(y-R.cc.y)<=R.ch) continue; const d=R.near[iy*m.nx+ix]; s+=cell(ix,iy,rampReach(d<=0?99:d<=8?1:d<=lim?9:99)); } }
  else if(layer==='air'){ for(let k=0;k<R.vent.length;k+=2) s+=cell(R.vent[k],R.vent[k+1],'var(--wind)','0.28');
    if(R.mode==='cross'&&R.vent.length){ for(let k=0;k<R.vent.length;k+=2){ const ix=R.vent[k], iy=R.vent[k+1]; if(ix%4!==1||iy%4!==1) continue; const x=m.x0+ix+0.5, y=m.y0+iy+0.5, L=1.6, ax=x-R.fl.x*L/2, ay=y-R.fl.y*L/2, bx=x+R.fl.x*L/2, by=y+R.fl.y*L/2; const px=-R.fl.y*0.45, py=R.fl.x*0.45; s+=`<path d="M${ax.toFixed(2)},${ay.toFixed(2)}L${bx.toFixed(2)},${by.toFixed(2)}M${(bx-R.fl.x*0.6+px).toFixed(2)},${(by-R.fl.y*0.6+py).toFixed(2)}L${bx.toFixed(2)},${by.toFixed(2)}L${(bx-R.fl.x*0.6-px).toFixed(2)},${(by-R.fl.y*0.6-py).toFixed(2)}" fill="none" stroke="var(--wind)" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round"/>`; } } }
  return s; }
function planSVG(R,layer,extra){
  const f=R.f, m=f.mask; const Rr=Math.hypot(f.w,f.d)/2+4; const VW=380, VH=300; const sc=Math.min((VW-70)/(2*Rr),(VH-40)/(2*Rr)); const cx0=VW/2-20, cy0=VH/2; const rotDeg=f.rot*180/Math.PI;
  let s=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Floor plan of level ${R.lvl}"><style>text{font-family:var(--font-m);font-size:9px;fill:var(--muted)}</style>`;
  s+=`<g transform="translate(${cx0},${cy0}) scale(1,-1) rotate(${rotDeg.toFixed(2)}) scale(${sc.toFixed(4)})">`;
  for(const lp of LAB.maskLoops(f)) s+=`<path d="M${lp.pts.map(q=>q[0].toFixed(2)+','+q[1].toFixed(2)).join('L')}Z" fill="${lp.outer?'var(--panel)':'var(--panel2)'}" stroke="none"/>`;
  s+=planCells(R,layer,extra);
  for(const e of edgesOf(f)){ const z=zoneFor(e.o,R.lvl); const a=[e.mx-e.ux*e.L/2,e.my-e.uy*e.L/2], b=[e.mx+e.ux*e.L/2,e.my+e.uy*e.L/2]; s+=`<line x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${b[0].toFixed(2)}" y2="${b[1].toFixed(2)}" stroke="${FACE_COL[e.o]}" stroke-width="${z.operable?0.9:0.5}" stroke-dasharray="${z.operable?'none':'1.2 0.8'}"><title>${NAMES[e.o]} · ${STRATS[z.strat].name}${z.operable?' · operable':''}</title></line>`; }
  const rel=(LAB.S.rotDeg*Math.PI/180-f.rot)*180/Math.PI; s+=`<rect x="${(R.cc.x-R.ch).toFixed(2)}" y="${(R.cc.y-R.ch).toFixed(2)}" width="${(2*R.ch).toFixed(2)}" height="${(2*R.ch).toFixed(2)}" transform="rotate(${rel.toFixed(2)} ${R.cc.x.toFixed(2)} ${R.cc.y.toFixed(2)})" fill="var(--core)" fill-opacity="0.55"/>`;
  s+=`</g>`;
  const ax=VW-32, ay=34; s+=`<line x1="${ax}" y1="${ay+14}" x2="${ax}" y2="${ay-10}" stroke="var(--ink)" stroke-width="1"/><path d="M${ax-4},${ay-4}L${ax},${ay-12}L${ax+4},${ay-4}" fill="var(--ink)"/><text x="${ax}" y="${ay+26}" text-anchor="middle">N</text>`;
  if(layer==='sun'&&R.sunUp){ const sx=cx0+Math.sin(R.p.az)*(Rr*sc+14), sy=cy0-Math.cos(R.p.az)*(Rr*sc+14); s+=`<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="6" fill="var(--sun)"/><line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${(cx0+Math.sin(R.p.az)*(Rr*sc)).toFixed(1)}" y2="${(cy0-Math.cos(R.p.az)*(Rr*sc)).toFixed(1)}" stroke="var(--sun)" stroke-width="1.5"/>`; }
  if(layer==='air'){ const wa=R.wdir*Math.PI/180; const wx=cx0+Math.sin(wa)*(Rr*sc+20), wy=cy0-Math.cos(wa)*(Rr*sc+20), tx=cx0+Math.sin(wa)*(Rr*sc+4), ty=cy0-Math.cos(wa)*(Rr*sc+4); const dx=tx-wx, dy=ty-wy, L=Math.hypot(dx,dy)||1, ux=dx/L, uy=dy/L; s+=`<line x1="${wx.toFixed(1)}" y1="${wy.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="var(--wind)" stroke-width="2"/><path d="M${(tx-ux*6-uy*4).toFixed(1)},${(ty-uy*6+ux*4).toFixed(1)}L${tx.toFixed(1)},${ty.toFixed(1)}L${(tx-ux*6+uy*4).toFixed(1)},${(ty-uy*6-ux*4).toFixed(1)}" fill="var(--wind)"/>`; }
  if(layer==='df'||layer==='ase'||layer==='da'){ const x0=VW-60, y0=VH-70; const rp=t=>layer==='df'?rampDF(t*0.05):layer==='da'?rampDA(t):rampASE(t*500); const lab=layer==='df'?['0','2%','5%+']:layer==='da'?['0%','50%','100%']:['0 h','250','500 h+']; for(let i=0;i<24;i++){ const t=i/23; s+=`<rect x="${x0}" y="${(y0+46-i*2).toFixed(1)}" width="10" height="2.1" fill="${rp(t)}"/>`; } s+=`<text x="${x0+13}" y="${y0+50}">${lab[0]}</text><text x="${x0+13}" y="${y0+26}">${lab[1]}</text><text x="${x0+13}" y="${y0+2}">${lab[2]}</text>`; }
  s+=`<text x="8" y="${VH-8}">L${R.lvl} · ${f.w.toFixed(0)} × ${f.d.toFixed(0)} m · ${fmtI(R.area)} m² floor</text>`;
  return s+'</svg>';
}
const PLAN_SETS={sun:[['sun','Sun now'],['da','Daylight autonomy'],['df','Daylight factor'],['ase','Annual sun exposure']],air:[['air','Air paths now'],['reach','Reach of openings']]};
const planKind=()=>focusOf()==='wind'?'air':'sun'; let planFor=null;
function renderPlan(){
  const host=$('plan'); if(!adv()||!LAB.floors){ $('plan-block').hidden=true; if(PLAN_OVL){ PLAN_OVL=null; LAB.requestRender(); } return; } $('plan-block').hidden=false; if(!document.getElementById('plan-slot')) setOut('sun',sections.sun);
  const nF=LAB.floors.length, L=planLevel(); const inp=$('plan-level'); inp.max=nF; inp.value=L; const f=LAB.floors[L-1]; if(PLAN.lv.kind==='above'&&PLAN.lv.i!==L-1){ PLAN.lv={kind:'above',i:L-1}; if(planActive()) planFrame(false); } const R=planStudy(f); const pk=planKind(), set=PLAN_SETS[pk]; planFor=pk; SW.planLayers=SW.planLayers||{}; const layer=set.some(([k])=>k===SW.planLayers[pk])?SW.planLayers[pk]:set[0][0];
  $('plan-title').textContent=pk==='air'?'Floor plan · air inside':'Floor plan · sun and daylight inside'; $('plan-info').textContent=pk==='air'?"Air follows the ventilation tab's wind case and opening settings. Edges are coloured by face, solid where the zone is operable.":"Sun follows the daylight tab's date and hour. Edges are coloured by face, solid where the zone is operable.";
  const chips=$('plan-layers'); chips.innerHTML=set.map(([k,n])=>`<button type="button" class="chip" data-layer="${k}" aria-pressed="${k===layer}">${n}</button>`).join(''); chips.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ SW.planLayers[pk]=b.dataset.layer; persist(); renderPlan(); }));
  const sd=LAB.S.impact.sun, Dt=DATES[sd.date]; const st=(k,v)=>`<div class="stat"><b>${v}</b><small>${k}</small></div>`; const pct=v=>R.area?Math.round(v/R.area*100)+'%':'–'; let extra=null, legend='', stats='', note='';
  const faces=ORI.map(o=>`<span><i style="background:${FACE_COL[o]}"></i>${NAMES[o]} face</span>`).join('')+'<span>Solid edge: operable · dashed: fixed</span>';
  if(layer==='sun'){ legend=`<span><i style="background:var(--sun)"></i>Sun on the floor with devices</span><span><i style="background:none;border:1.5px solid var(--sun)"></i>Without devices</span>`+faces;
    stats=st('Sunlit floor · with devices',R.sunUp?fmtI(R.aLit)+' m² <em>'+pct(R.aLit)+'</em>':'sun below horizon')+st('Without devices',R.sunUp?fmtI(R.aLitNo)+' m² <em>'+pct(R.aLitNo)+'</em>':'–')+st('Sun patch reaches',R.sunUp&&R.aLit?R.maxDepth.toFixed(1)+' m <em>from the glass</em>':'–')+st('Sun',R.sunUp?(R.p.alt*180/Math.PI).toFixed(0)+'° high · '+R.azDeg.toFixed(0)+'° az':'below horizon');
    note=`${Dt.label}, ${fmtHour(sd.hour)}. Each floor cell is traced back toward the sun to the glass it would see; it is lit where the ray passes the window between sill and head, dimmed or cut by that zone's device. The core is the only interior obstruction. Move the hour slider on the Sun tab to animate it.`; }
  else if(layer==='da'||layer==='df'){ const dk=JSON.stringify([f.i,SW.zones,SW.glaz.vt,SW.dl,nF,!!LAB.CLIMATE.hourly]); if(planDL.key!==dk) planDL={key:dk,res:daylightFloor(f,1,1)}; extra=planDL.res; const T=extra.target;
    if(layer==='da'){ legend=`<span><i style="background:${rampDA(0.1)}"></i>DA under 20%</span><span><i style="background:${rampDA(0.5)}"></i>50% · counts for sDA</span><span><i style="background:${rampDA(1)}"></i>lit all year</span>`+faces;
      stats=st('Spatial daylight autonomy',Math.round(extra.pctLit*100)+'% <em>sDA'+T+'/50% · LEED 40 / 55 / 75%</em>')+st('Mean daylight autonomy',Math.round(extra.daMean*100)+'% <em>of hours at '+T+' lux</em>')+st('Useful daylight',Math.round(extra.udiU*100)+'% <em>UDI 100–3,000 lux</em>')+st('Over 3,000 lux',Math.round(extra.udiE*100)+'% <em>of hours · glare risk</em>');
      note=extra.hourly?`Daylight autonomy: the share of the ${fmtI(extra.hours)} occupied hours (8:00–18:00, CWEC typical year) in which each cell reaches ${T} lux from daylight alone. Every face's window is lit by its own Perez all-weather sky hour by hour; the cell's sky view comes from sixteen sight lines to the glass, cut by the neighbours and the zone's device, with a fifth of the hidden sky returned by the neighbours and the BRE internally reflected light added across the plate. Cells at 50% or more count toward sDA. Direct sun is left to the blinds, as LM-83 assumes; the Annual sun exposure layer counts it.`:'The hourly weather is not loaded, so autonomy is estimated from the daylight factor.'; }
    else { legend=`<span><i style="background:${rampDF(0.005)}"></i>DF under 1%</span><span><i style="background:${rampDF(0.02)}"></i>2% · well daylit</span><span><i style="background:${rampDF(0.05)}"></i>5%+ · over-lit</span>`+faces;
      stats=st('Mean daylight factor',(extra.mean*100).toFixed(1)+'% <em>CIE overcast sky</em>')+st('Reflected inside',(extra.irc*100).toFixed(2)+'% <em>BRE internally reflected component</em>')+st('Spatial daylight autonomy',Math.round(extra.pctLit*100)+'% <em>climate-based, see the autonomy layer</em>');
      note=`Daylight factor under the CIE overcast sky at a 0.8 m work plane: sixteen sight lines per cell to the glass; the sky between sill and head, above the neighbours' obstruction angle and below the zone's overhang or balcony, weighted by the CIE luminance distribution (sky component), plus a fifth of the obstructed sky (externally reflected) and the BRE split-flux internally reflected component for floor 0.2, walls 0.5 and ceiling 0.8, all through the glass transmittance ${SW.glaz.vt.toFixed(2)} with a 0.9 maintenance factor. 2% reads as well daylit (BS EN 17037 asks 300 lux over half the plane). Light shelves lower the DF near the glass and raise it deeper in.`; } }
  else if(layer==='ase'){ const key=JSON.stringify([f.i,SW.zones,SW.glaz.vt,nF,LAB.S.impact.period]); if(planAse.key!==key){ planAse={key,res:aseFloor(f,false)}; } extra=planAse.res; legend=`<span><i style="background:${rampASE(50)}"></i>Under 100 h of direct sun</span><span><i style="background:${rampASE(250)}"></i>250 h · ASE threshold</span><span><i style="background:${rampASE(500)}"></i>500 h+</span>`+faces;
    stats=st('ASE 1000 lux / '+Math.round(extra.thr)+' h',Math.round(extra.pctOver*100)+'% <em>of floor · LEED asks ≤ 10%</em>')+st('Sunny hours swept',fmtI(extra.positions)+' <em>8:00–18:00 with direct sun over 1,000 lux</em>')+st('Period',extra.period.full?'whole year':extra.period.label)+st('Blinds','not modeled <em>devices only</em>');
    note=`Annual sunlight exposure as IES LM-83 defines it: every occupied hour (8:00–18:00 clock time) of the CWEC typical year with measured direct sun, its normal irradiance turned into lux by the Perez beam efficacy, sun on the work plane = beam × sin altitude × glass VT × device transmission. Each cell walks one ray per 2° of sun azimuth to the glass it would see, then tests every hour in that bin against the window band and the device's cut-off. Cells over ${Math.round(extra.thr)} h are flagged${extra.period.full?'':' (250 h scaled to the period)'}; LEED v4.1 asks that no more than 10% of the floor is flagged, or that glare control is shown. Blinds are not modelled here, so this is the façade's own performance.`; }
  else if(layer==='reach'){ const lim=R.mode==='cross'?R.limCross:R.mode==='single'?R.limSingle:R.limStack; legend=`<span><i style="background:${rampReach(1)}"></i>Within 8 m of an opening</span><span><i style="background:${rampReach(9)}"></i>Within the ${R.mode==='cross'?'cross':R.mode==='single'?'single-sided':'stack'} depth rule, ${lim} m</span><span><i style="background:${rampReach(99)}"></i>Beyond it</span>`+faces;
    stats=st('Within 8 m of an opening',pct(R.aWithin8)+' <em>ASHRAE 62.1 zone</em>')+st('Within the depth rule',pct(R.aRule)+' <em>'+(R.mode==='cross'?'5 H = '+R.limCross+' m from the inlet':R.mode==='single'?'2.5 H = '+R.limSingle+' m':'12 m to an operable face')+'</em>')+st('Out of reach',pct(R.area-R.aRule)+' <em>deeper than the rule, or no operable face</em>')+st('Free opening area',R.freePct.toFixed(1)+'% of floor <em>'+(R.freePct>=4?'meets':'below')+' the 4% rule</em>');
    note=`Walking distance through the plate from each cell to the nearest operable window, around the core (a 1 m grid). ASHRAE 62.1 counts a space as naturally ventilated within 8 m of an opening; CIBSE AM10 sets how deep air reaches: 2.5 floor heights for single-sided rooms, 5 for cross ventilation, about 12 m to a stack. This layer does not depend on the hour: it is the reach the façade allows, while Air paths now shows the current wind case. Interior partitions are not modeled.`; }
  else { legend=`<span><i style="background:var(--wind);opacity:.6"></i>Ventilated by the wind</span>`+faces;
    stats=st('Ventilated floor',R.windowsOpen?fmtI(R.aVent)+' m² <em>'+pct(R.aVent)+'</em>':'windows closed')+st('Air changes',R.windowsOpen&&R.ach>0?R.ach.toFixed(1)+' /h <em>wind '+R.Qw.toFixed(1)+(R.Qs?' + stack '+R.Qs.toFixed(1):'')+' m³/s</em>':'–')+st('Within 8 m of an opening',pct(R.aWithin8)+' <em>ASHRAE 62.1 zone</em>')+st('Free opening area',R.freePct.toFixed(1)+'% of floor <em>'+(R.freePct>=4?'meets':'below')+' the 4% rule</em>')+st('Wind at this level',R.Uz.toFixed(1)+' m/s <em>from '+R.wdir+'°'+(R.windowsOpen?'':' · gusts over '+R.umax.toFixed(0)+' m/s')+'</em>')+st('Depth rule',R.mode==='cross'?'5 H = '+R.limCross+' m <em>cross</em>':R.mode==='single'?'2.5 H = '+R.limSingle+' m <em>single-sided</em>':'12 m <em>stack</em>');
    note=`${R.mode==='cross'?'Cross ventilation (CIBSE AM10): a cell is ventilated when air can enter through an operable windward face (Cp +0.7) and leave through an operable side or leeward face (Cp −0.5 / −0.3) within five floor heights of the inlet, without meeting the core. Flow Q = 0.6 · A · U · √ΔCp.':R.mode==='single'?'Single-sided ventilation (AM10): cells within 2.5 floor heights of an operable face. Flow combines wind (0.025 · A · U) and stack (BS 5925, ΔT '+(SW.vent.dT||3)+' K over the opening height).':'Stack ventilation through atria or sky gardens: cells within 12 m of an operable face; flow combines wind and a three-storey stack.'} Free opening area is ${Math.round(R.open*100)}% of the glass on operable zones; ASHRAE 62.1 asks for openings of at least 4% of the floor served, within 8 m of every point. The wind is the ${LAB.S.impact.wind.annual?'dominant sector of the period':'current case'} scaled to this height. Interior partitions are not modeled.`; }
  host.innerHTML=planSVG(R,layer,extra); $('plan-legend').innerHTML=legend; $('plan-stats').innerHTML=stats; $('plan-note').textContent=note; if(LAB.help) LAB.help.apply($('plan-block'));
  const why=layer==='sun'?(!R.sunUp?'Sun below the horizon':(!R.lit.length?'No sun on this floor now':'')):layer==='air'?(!R.windowsOpen?'Windows closed: gusts over '+R.umax.toFixed(0)+' m/s here':(!R.vent.length?'No air path on this floor':'')):'';
  PLAN_OVL={f,layer,set,why,off:!!SW.planOvlOff,html:SW.planOvlOff?'':planCells(R,layer,extra),node:null,sig:pk+'|'+layer+'|'+!!SW.planOvlOff+'|'+why}; ppResults(); LAB.requestRender();
}
/* the viewport plan's result layer: chips to pick it (or turn it off) and a legend, in the floating plan panel */
let PLAN_OVL=null;
const OVL_KEY={da:[rampDA,[0,0.25,0.5,0.75,1],['0%','50%','100%']],df:[rampDF,[0,0.01,0.02,0.035,0.05],['0','2%','5%+']],ase:[rampASE,[0,125,250,375,500],['0 h','250 h','500 h+']]};
function ppResults(){ const host=document.getElementById('pp-res'); if(!host||!PLAN_OVL) return; if(host.dataset.sig===PLAN_OVL.sig) return; host.dataset.sig=PLAN_OVL.sig;
  const {set,layer,off}=PLAN_OVL; let h='<div class="pp-chips">'+set.map(([k,n])=>`<button type="button" data-ovl="${k}" aria-pressed="${!off&&k===layer}">${n}</button>`).join('')+`<button type="button" data-ovl="off" aria-pressed="${off}">Off</button></div>`;
  if(!off){ const K=OVL_KEY[layer]; if(K) h+=`<div class="pp-ramp" style="background:linear-gradient(90deg,${K[1].map(v=>K[0](v)).join(',')})"></div><div class="pp-ramp-l">${K[2].map(t=>'<span>'+t+'</span>').join('')}</div>`;
    else if(layer==='reach') h+=`<div class="pp-legend"><span><i style="background:${rampReach(1)}"></i>≤ 8 m</span><span><i style="background:${rampReach(9)}"></i>Depth rule</span><span><i style="background:${rampReach(99)}"></i>Beyond</span></div>`;
    else h+=`<div class="pp-legend"><span><i style="background:var(--${layer==='air'?'wind':'sun'});opacity:.7"></i>${layer==='air'?'Ventilated':'Sunlit'}</span></div>`; }
  if(!off&&PLAN_OVL.why) h+='<div class="pp-why">'+PLAN_OVL.why+'</div>';
  host.innerHTML=h; host.querySelectorAll('[data-ovl]').forEach(b=>b.onclick=()=>{ const k=b.dataset.ovl; if(k==='off') SW.planOvlOff=true; else { SW.planOvlOff=false; SW.planLayers=SW.planLayers||{}; SW.planLayers[planFor]=k; } persist(); renderPlan(); }); }

/* ---------- tower-wide ventilation checks (ASHRAE 62.1 natural ventilation): free opening area and floor within 8 m of an operable opening, per floor ---------- */
function ventFloorQuick(f){
  const S=LAB.S, m=f.mask, lvl=f.i+1, hh=f.h-GAP, W2=f.w/2, D2=f.d/2; const cc=LAB.toLocal(f,S.posX,S.posY), ch=f.core/2; const open=SW.vent.open||0.1;
  const solid=(cx,cy)=>cx>=0&&cy>=0&&cx<m.nx&&cy<m.ny&&(m.x0+cx+0.5<=W2)&&(m.y0+cy+0.5<=D2)&&!!m.cells[cy*m.nx+cx]; const inCore=(x,y)=>Math.abs(x-cc.x)<=ch&&Math.abs(y-cc.y)<=ch;
  const near=new Int16Array(m.nx*m.ny).fill(-1); const q=[]; let area=0;
  for(let iy=0;iy<m.ny;iy++) for(let ix=0;ix<m.nx;ix++){ if(!solid(ix,iy)) continue; if(inCore(m.x0+ix+0.5,m.y0+iy+0.5)) continue; area++; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ if(!solid(ix+dx,iy+dy)&&zoneFor(cardinalOf(dx,dy,f.rot),lvl).operable){ near[iy*m.nx+ix]=1; q.push(ix,iy); break; } } }
  let head=0; while(head<q.length){ const ix=q[head++], iy=q[head++]; const d=near[iy*m.nx+ix]; if(d>=8) continue; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const jx=ix+dx,jy=iy+dy; if(!solid(jx,jy)||inCore(m.x0+jx+0.5,m.y0+jy+0.5)) continue; const k=jy*m.nx+jx; if(near[k]<0){ near[k]=d+1; q.push(jx,jy); } } }
  let within=0; for(let k=0;k<near.length;k++) if(near[k]>0&&near[k]<=8) within++;
  let free=0; for(const e of edgesOf(f)){ const z=zoneFor(e.o,lvl); if(z.operable) free+=e.L*hh*z.wwr*open; }
  return {i:f.i,area,within8:area?within/area:0,freePct:area?free/area*100:0,operable:free>0};
}
let vtCache={key:null,res:null};
function ventTowerQuick(){ const floors=LAB.floors; if(!floors) return null; const key=JSON.stringify([SW.zones,SW.vent.open,floors.length,floors.map(f=>[f.w,f.d,f.h,f.area|0]),LAB.S.posX,LAB.S.posY,LAB.S.rotDeg]); if(vtCache.key===key) return vtCache.res;
  const rows=floors.map(ventFloorQuick); const op=rows.filter(r=>r.operable); const A=op.reduce((s,r)=>s+r.area,0);
  vtCache={key,res:{rows,operable:op.length,meet4:op.filter(r=>r.freePct>=4).length,within8:op.reduce((s,r)=>s+r.within8*r.area,0)/Math.max(1,A),freePct:op.reduce((s,r)=>s+r.freePct*r.area,0)/Math.max(1,A)}}; return vtCache.res; }

/* ---------- analysis bar legend under the canvas ---------- */
function updateLegend(){
  const el=$('ov-legend'); const m=LAB.S.impact.mode; const runBtn=$('run-active');
  runBtn.textContent=m==='wind'?(adv()?'Run wind & ventilation':'Run wind'):(adv()?'Run sun & daylight':'Run sun'); runBtn.disabled=busy;
  if(m==='sun'){ const r=sunResult; const yr=r&&r.scope==='period'; const hi=r?(yr?fmtI(Math.max(4,800*r.period.days/365)):Math.round(r.hours*0.8)):'8'; const lo=r?r.th[0]:1; el.className='ramp'; el.innerHTML=`<div class="bar" style="background:linear-gradient(90deg,#F2C46B,#7A2E8E)"></div><div class="lbls"><span>${lo} h of new shadow${yr?(r.period.full?' / yr':' in period'):''}</span><span>${r?'':'run to see the map · '}${hi}+ h</span></div>`; }
  else if(m==='wind'){ const v=LAB.S.impact.wind.view||'comfort'; if(v==='comfort'){ el.className='ramp bands'; el.innerHTML=`<div class="bar">${BAND_COL.map(c=>`<i style="background:${c}"></i>`).join('')}</div><div class="lbls"><span>sitting ≤ 2.5</span><span>standing</span><span>strolling</span><span>walking</span><span>uncomfortable > 8 m/s</span></div>`; } else { el.className='ramp'; el.innerHTML=`<div class="bar" style="background:linear-gradient(90deg,#3E8E7E,var(--line2) 50%,#B8362B)"></div><div class="lbls"><span>calmer ${v==='strat'?'with the strategies':'with the tower'}</span><span>windier</span></div>`; } }
  else if(m==='rain'){ runBtn.textContent='Run rain'; const r=LAB.rain&&LAB.rain.result; const pd=r&&r.pond&&!r.pond.flat?r.pond:null; const maxD=pd&&pd.ponds.length?Math.max(...pd.ponds.map(p=>p.maxD)):0; el.className='ramp bands'; el.innerHTML=`<div class="bar"><i style="background:#A8B2C0"></i><i style="background:#3C82CD"></i><i style="background:linear-gradient(90deg,#96C8EB,#14468F)"></i></div><div class="lbls"><span>kept dry by the building</span><span>run-off path</span><span>${pd?(pd.ponds.length?'ponds, to '+(maxD*1000).toFixed(0)+' mm deep':'no ponds'):(r?'ponds need a terrain':'run to see the rain shadow')}</span></div>`; }
  else { el.className='ramp'; el.innerHTML=`<div class="bar"></div><div class="lbls"><span>No overlay · choose Sun, Wind or Rain</span><span></span></div>`; }
}
/* ---------- LEED v4.1 scorecard (Design development) ---------- */
function leedCard(r,w){
  const rows=[]; const st=(c,t)=>`<span class="status ${c}">${t}</span>`;
  if(r&&r.daylight){ const s=r.daylight.sda, pts=s>=0.75?3:(s>=0.55?2:(s>=0.40?1:0)); rows.push(['EQ Daylight · Option 1','sDA300/50% · climate-based',Math.round(s*100)+'% of floor','40 / 55 / 75% → 1 / 2 / 3 points',pts?st('ok',pts+' pt'+(pts>1?'s':'')):st('bad','0 pts')]);
    if(r.ase) rows.push(['','ASE1000/250h',Math.round(r.ase.pct*100)+'% of floor','≤ 10%, or show glare control',r.ase.pct<=0.10?st('ok','meets'):st('warn','address glare')]); }
  else rows.push(['EQ Daylight · Option 1','sDA300/50% · ASE1000/250h','–','run sun and daylight',st('na','not run')]);
  if(w&&w.vt&&w.vt.operable){ const ok4=w.vt.freePct>=4, ok8=w.vt.within8>=0.95; rows.push(['EQ Minimum IAQ · natural ventilation','ASHRAE 62.1 openable area',w.vt.freePct.toFixed(1)+'% of floor served','≥ 4%',ok4?st('ok','meets'):st('bad','below')],['','Within 8 m of an operable opening',Math.round(w.vt.within8*100)+'% of operable floors','every point',ok8?st('ok','meets'):st('warn','not everywhere')]); }
  else rows.push(['EQ Minimum IAQ · natural ventilation','ASHRAE 62.1 openable area and reach','–',w?'no operable zones':'run wind and ventilation',st('na',w?'no openings':'not run')]);
  if(w&&w.vent) rows.push(['EQ Thermal comfort · naturally ventilated',(w.vent.adaptive?'ASHRAE 55 adaptive band':'fixed comfort band')+' · usable hours',Math.round(w.vent.total/Math.max(1,w.vent.hoursTot)*100)+'% of hours in the period','informational',st('na','reading')]);
  if(r&&r.dayData){ const A=solarStudy(r); rows.push(['Solar heat through glazing','beam after devices',fmtI(A.shTot)+' kWh · '+Math.round(A.blocked*100)+'% blocked','lower is better',st('na','reading')]); }
  const en=LAB.energy&&LAB.energy.last; if(en){ rows.push(['Energy · Vancouver rezoning targets','TEUI',en.teui.toFixed(0)+' kWh/m²/yr','≤ '+en.tgt.teui.toFixed(0)+' (program-weighted)',en.teui<=en.tgt.teui?st('ok','meets'):st('bad','over by '+Math.round((en.teui/en.tgt.teui-1)*100)+'%')],['','TEDI',en.tedi.toFixed(1)+' kWh/m²/yr','≤ '+en.tgt.tedi.toFixed(0),en.tedi<=en.tgt.tedi?st('ok','meets'):st('bad','over')],['','GHGI',en.ghgi.toFixed(2)+' kgCO₂e/m²/yr','≤ '+en.tgt.ghgi.toFixed(1),en.ghgi<=en.tgt.ghgi?st('ok','meets'):st('bad','over')]); }
  return `<h3 style="margin-top:12px">Scorecard · LEED v4.1 and Vancouver targets, indicative</h3><div class="tbl-wrap"><table class="score"><thead><tr><th>Credit</th><th>Metric</th><th>Result</th><th>Threshold</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x[0]}</td><td class="why">${x[1]}</td><td class="num">${x[2]}</td><td class="why">${x[3]}</td><td>${x[4]}</td></tr>`).join('')}</tbody></table></div><p class="note">Proxies for early design: sDA from a daylight-factor model, ASE from a sun sweep without blinds, ventilation from the façade zones' operable share. LEED documentation needs an hourly Radiance run and the 62.1 natural ventilation procedure.</p>`;
}
/* ---------- report builder ---------- */
const REP_SECTIONS=[['summary','Summary and settings',true],['shadow','Shadow on the ground and plazas',true],['facade','Sun on the façades and solar heat',true],['efficiency','Massing efficiency · form metrics',true],['daylight','Daylight · sDA and ASE (Design development)',true],['wind','Pedestrian wind comfort',true],['rain','Rain · driving rain, shelter and harvesting',true],['vent','Natural ventilation and terraces (Design development)',true],['energy','Energy model · TEUI, TEDI, GHGI (Design development)',true],['plans','Floor plans (Design development)',true],['method','Method and assumptions',true]];
const REP_LAYERS=[['sun','Sun now'],['da','Daylight autonomy'],['df','Daylight factor'],['ase','Annual sun exposure'],['air','Air paths'],['reach','Reach of openings']];
function repDefaults(){ const o={title:'',author:'',levels:'',sections:{},layers:{sun:true,da:true,df:false,ase:true,air:true,reach:true}}; for(const [k,,d] of REP_SECTIONS) o.sections[k]=d; return o; }
function buildReportUI(){
  SW.report=Object.assign(repDefaults(),SW.report||{}); SW.report.sections=Object.assign(repDefaults().sections,SW.report.sections||{}); SW.report.layers=Object.assign(repDefaults().layers,SW.report.layers||{});
  $('rep-sections').innerHTML=REP_SECTIONS.map(([k,n])=>`<label class="check${/Design development/.test(n)?' adv':''}" for="rep-s-${k}"><input type="checkbox" id="rep-s-${k}" data-k="${k}"><span>${n.replace(' (Design development)','')}</span></label>`).join('');
  $('rep-layers').innerHTML=REP_LAYERS.map(([k,n])=>`<label class="check" for="rep-l-${k}"><input type="checkbox" id="rep-l-${k}" data-k="${k}"><span>${n}</span></label>`).join('');
  document.querySelectorAll('#rep-sections input').forEach(i=>i.addEventListener('change',e=>{ SW.report.sections[e.target.dataset.k]=e.target.checked; persist(); }));
  document.querySelectorAll('#rep-layers input').forEach(i=>i.addEventListener('change',e=>{ SW.report.layers[e.target.dataset.k]=e.target.checked; persist(); }));
  $('rep-title').addEventListener('input',e=>{ SW.report.title=e.target.value; persist(); }); $('rep-author').addEventListener('input',e=>{ SW.report.author=e.target.value; persist(); }); $('rep-levels').addEventListener('input',e=>{ SW.report.levels=e.target.value; persist(); });
  $('rep-make').addEventListener('click',()=>generateReport());
  syncReportUI();
}
function syncReportUI(){ const R=SW.report; if(!R) return; document.querySelectorAll('#rep-sections input').forEach(i=>{ i.checked=!!R.sections[i.dataset.k]; }); document.querySelectorAll('#rep-layers input').forEach(i=>{ i.checked=!!R.layers[i.dataset.k]; }); $('rep-title').value=R.title||''; $('rep-author').value=R.author||''; $('rep-levels').value=R.levels||''; $('rep-layers').parentNode&&($('rep-layers').style.display=adv()?'':'none'); }
function svgToJpeg(svg,w,h){
  const cs=getComputedStyle(document.documentElement); const resolved=svg.replace(/var\((--[a-z0-9-]+)\)/g,(m,k)=>{ if(k==='--font-m') return 'Consolas, monospace'; if(k==='--font-b') return 'sans-serif'; return cs.getPropertyValue(k).trim()||'#888'; }).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');
  return new Promise((res,rej)=>{ const blob=new Blob([resolved],{type:'image/svg+xml;charset=utf-8'}); const url=URL.createObjectURL(blob); const img=new Image(); img.onload=()=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; const ctx=c.getContext('2d'); ctx.fillStyle=cs.getPropertyValue('--panel').trim()||'#fff'; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg',0.9)); }; img.onerror=e=>{ URL.revokeObjectURL(url); rej(e); }; img.src=url; });
}
let customExtra=null;
function reportLevels(){ const nF=LAB.floors?LAB.floors.length:1; const txt=(SW.report&&SW.report.levels||'').trim(); let L=txt?txt.split(/[,\s]+/).map(x=>parseInt(x,10)).filter(x=>x>=1&&x<=nF):[]; if(!L.length) L=[...new Set([Math.max(1,Math.round(nF*0.15)),Math.max(1,Math.round(nF*0.5)),Math.max(1,Math.round(nF*0.85))])]; return L.slice(0,6); }
async function generateReport(){
  const b=$('rep-make'); const S=SW.report; b.disabled=true; const status=msg=>{ $('run-all-status').textContent=msg; };
  try{
    customExtra={grids:[],charts:[]};
    if(adv()&&S.sections.plans&&LAB.floors){ for(const [pk,title] of [['sun','Floor plans · sun and daylight inside'],['air','Floor plans · air inside']]){ const layers=REP_LAYERS.filter(([k])=>S.layers[k]&&PLAN_SETS[pk].some(([q])=>q===k)); if(!layers.length) continue; const rows=[];
      for(const L of reportLevels()){ status(`Drawing level ${L}…`); await new Promise(r=>setTimeout(r,10)); const f=LAB.floors[L-1]; const R=planStudy(f); const cells=[];
        for(const [k,n] of layers){ let extra=null; if(k==='df'||k==='da') extra=daylightFloor(f,1,2); else if(k==='ase') extra=aseFloor(f,true); const svg=planSVG(R,k,extra); try{ const url=await svgToJpeg(svg,760,600); cells.push({url,w:760,h:600,caption:n+(k==='sun'?' · '+DATES[LAB.S.impact.sun.date].label+' '+fmtHour(LAB.S.impact.sun.hour):'')}); }catch(e){ console.warn(e); } }
        rows.push({label:'Level '+L+' · '+fmtI(R.area)+' m²',cells}); }
      if(rows.length) customExtra.grids.push({title,cols:2,caption:'Each plan is drawn north up with the core; edges are coloured by face and solid where the zone is operable.',rows}); } }
    status('Building the PDF…'); await LAB.report.make('custom'); status('');
  }catch(e){ console.error(e); status('Report failed: '+(e.message||e)); }
  finally{ b.disabled=false; }
}
function customReportData(){
  const S=SW.report; const sun=sunResult?reportData('sun'):null, wind=windResult?reportData('wind'):null; const canEff=S.sections.efficiency&&LAB.energy&&LAB.floors, canEn=adv()&&S.sections.energy&&LAB.energy&&LAB.floors; const canRain=S.sections.rain&&LAB.rain&&LAB.rain.result; if(!sun&&!wind&&!canEff&&!canEn&&!canRain) return null;
  const out={title:S.title||('Sun, wind and energy study · '+(adv()?'design development':'massing')),settings:[],stats:[],tables:[],notes:[],grids:[],charts:[]};
  if(S.author) out.settings.push(['Prepared by',S.author]); out.settings.push(['Phase',adv()?'Design development':'Massing'],['Generated',new Date().toLocaleString()]);
  const has=(title,keys)=>keys.some(k=>title.indexOf(k)>=0);
  const F={shadow:['Sample days'],facade:['Direct sun on the massing','Readings','Façade zones','Solar result by façade zone','Photovoltaics'],daylight:['Daylight by floor'],wind:['Lawson','Annual mean speed','Readings','Wind with height','By wind sector'],vent:['Natural ventilation by month','Wind on terraces and roofs']};
  const want=sec=>!!S.sections[sec]&&(adv()||!['daylight','vent','plans','energy'].includes(sec));
  if(sun){ if(S.sections.summary) out.settings.push(...sun.settings.filter(x=>!/Mode/.test(x[0])).map(x=>['Sun · '+x[0],x[1]]));
    if(want('shadow')||want('facade')||want('daylight')){ const pick=sun.stats.filter(x=>{ const t=x[0]; const isDL=/Daylit|daylight factor|Over-lit|Annual sunlight/.test(t); const isFac=/Heat through|blocked|PV yield|Direct sun received|Sunlight lost/.test(t); const isSh=!isDL&&!isFac; return (isSh&&want('shadow'))||(isFac&&want('facade'))||(isDL&&want('daylight')); }); out.stats.push(...pick); }
    for(const t of sun.tables){ if((want('shadow')&&has(t.title,F.shadow))||(want('facade')&&has(t.title,F.facade))||(want('daylight')&&has(t.title,F.daylight))) out.tables.push(t); }
    if(want('shadow')&&sun.grid) out.grids.push(sun.grid); if(want('method')) out.notes.push(...sun.notes); if(sun.overlay&&want('shadow')) out.overlay=sun.overlay; }
  if(wind){ if(S.sections.summary) out.settings.push(...wind.settings.filter(x=>!/Mode/.test(x[0])).map(x=>['Wind · '+x[0],x[1]]));
    if(want('wind')||want('vent')){ out.stats.push(...wind.stats.filter(x=>{ const v=/ventilation|Operable|ASHRAE|8 m/.test(x[0]); return (v&&want('vent'))||(!v&&want('wind')); })); }
    for(const t of wind.tables){ if((want('wind')&&has(t.title,F.wind))||(want('vent')&&has(t.title,F.vent))) out.tables.push(t); }
    if(want('method')) out.notes.push(...wind.notes); }
  if(customExtra&&customExtra.grids.length&&want('plans')) out.grids.push(...customExtra.grids);
  if(want('rain')&&LAB.rain&&LAB.rain.result){ try{ const Rn=LAB.rain.reportData(); if(Rn){ if(S.sections.summary) out.settings.push(...Rn.settings.map(x=>['Rain · '+x[0],x[1]])); out.stats.push(...Rn.stats.map(x=>['Rain · '+x[0],x[1]])); out.tables.push(...Rn.tables); if(Rn.chart) out.charts.push({svg:Rn.chart,title:'Monthly rain yield and irrigation need'}); if(want('method')) out.notes.push(...Rn.notes); } }catch(e){ console.error(e); } }
  if(canEff){ try{ const F=LAB.energy.formReportData(); out.stats.push(...F.stats.map(x=>['Form · '+x[0],x[1]])); if(S.sections.summary) out.settings.push(...F.settings.filter(x=>/Reference|Typical/.test(x[0])).map(x=>['Form · '+x[0],x[1]])); out.tables.push(...F.tables); if(want('method')) out.notes.push(...F.notes.slice(0,3)); }catch(e){ console.error(e); } }
  if(canEn){ try{ const En=LAB.energy.reportData(); out.stats.push(...En.stats.map(x=>['Energy · '+x[0],x[1]])); if(S.sections.summary) out.settings.push(...En.settings.map(x=>['Energy · '+x[0],x[1]])); out.charts.push({svg:En.chart,title:'Monthly energy by end use'}); out.tables.push(...En.tables); if(want('method')) out.notes.push(...En.notes); }catch(e){ console.error(e); } }
  if(!S.sections.summary) out.settings=out.settings.slice(0,3);
  return out;
}
/* ---------- hooks and boot ---------- */
function autoRun(n){ if(!SW||sunResult||busy) return; if((!LAB.site||CLIMATE.pending)&&n<12){ setTimeout(()=>autoRun(n+1),500); return; } if(LAB.S.impact.mode==='sun'&&LAB.S.impact.sun.scope==='date'){ try{ runCurrent(true); }catch(e){ console.warn(e); } } }
LAB.hooks.afterUpdate.push(floors=>{ if(!SW) return; siteRaster=null; syncGeometry(); updateGeomInfo(); syncZoneUI(); try{ renderPlan(); }catch(e){ console.error(e); } if(LAB.rain&&LAB.rain.result){ stale.rain=true; showStale(); if(LAB.S.impact.mode==='rain') renderRain(); } if(LAB.S.impact.mode==='sun'){ applySunView(); if(sunResult){ stale.sun=true; showStale(); } } if(LAB.S.impact.mode==='wind'&&windResult){ stale.wind=true; showStale(); } });
LAB.hooks.afterSite.push(()=>{ sunResult=null; windResult=null; demCache={key:null,dem:null,has:false}; try{ flattenLabels(); LAB.siteGroup.traverse(o=>{ if(o.isMesh&&o.userData.layer==='terrain'){ o.material=o.material.clone(); o.material.color.set(cssVar('--ground')||'#CBD3DA'); } }); if(overlayMesh) setOverlayHeights(terrainDEM()); }catch(e){ console.warn(e); } if(!SW) return; clearOverlay(); if(!busy) rerender(); setTimeout(()=>autoRun(0),400); });
LAB.hooks.afterWeather.push(()=>{ if(!SW) return; syncPeriodUI(); renderSky(); if(sunResult){ stale.sun=true; } if(windResult){ stale.wind=true; } if(LAB.rain&&LAB.rain.result){ stale.rain=true; } showStale(); if(!busy) rerender(); });
LAB.hooks.tab.push(name=>{ if(SW) onTab(name); setTone(name); });
/* the review panel takes the colour of the study in view: the tab's own colour, else the study drawn on the ground */
function setTone(name){ const t=({sun:'sun',daylight:'daylight',wind:'wind',vent:'vent',rain:'rain',energy:'energy',eff:'eff',strat:'strat'})[name||curTab]||(LAB.S&&LAB.S.impact&&LAB.S.impact.mode)||'none'; document.body.dataset.tone=t; document.body.dataset.tab=name||curTab; }
/* ---------- pick the mass in the viewport and nudge it on the site with the arrow keys ---------- */
let massSel=false, selHelper=null, mDown=null; const vpEl=LAB.renderer.domElement.parentElement;
function massTargets(){ const t=[]; for(const g of [advGroup,lodGroup,dressGroup,LAB.towerGroup]){ if(!g||!g.visible) continue; g.traverse(o=>{ if(o.isMesh&&o.visible&&!o.userData.deco&&!o.userData.labelPlane) t.push(o); }); } return t; }
function refreshMassSel(){ if(selHelper){ LAB.scene.remove(selHelper); selHelper.geometry.dispose(); selHelper.material.dispose(); selHelper=null; } const hint=$('mass-hint'); hint.hidden=!massSel; if(!massSel){ LAB.requestRender(); return; } hint.innerHTML=hintText(0,0);
  const box=new THREE.Box3(); for(const o of massTargets()) box.expandByObject(o); if(box.isEmpty()){ massSel=false; hint.hidden=true; return; } box.expandByScalar(0.8);
  selHelper=new THREE.Box3Helper(box,new THREE.Color(cssVar('--accent')||'#C8552D')); selHelper.userData.deco=true; selHelper.renderOrder=5; LAB.scene.add(selHelper); LAB.requestRender(); }
/* press on the mass and drag it across the site; the groups slide visually while dragging and the move is committed on release (1 m grid, Alt for free) */
const dragPlane=new THREE.Plane(), dragHit=new THREE.Vector3(); let drag=null; const gPick=new THREE.Raycaster();
function pickRay(e){ const el=LAB.renderer.domElement, r=el.getBoundingClientRect(); gPick.setFromCamera({x:((e.clientX-r.left)/r.width)*2-1,y:-((e.clientY-r.top)/r.height)*2+1},view.ortho?orthoCam:LAB.camera); return gPick; }
function groundPoint(e){ const ray=pickRay(e); const d=ray.ray.direction; if(Math.abs(d.y)>0.15) dragPlane.set(new THREE.Vector3(0,1,0),0); else { const n=new THREE.Vector3(d.x,0,d.z).normalize(); dragPlane.setFromNormalAndCoplanarPoint(n,new THREE.Vector3(LAB.S.posX,0,-LAB.S.posY)); } return ray.ray.intersectPlane(dragPlane,dragHit)?{x:dragHit.x,y:-dragHit.z}:null; }
function massAt(e){ return pickRay(e).intersectObjects(massTargets(),false).length>0; }
/* the groups slide from where they rest: each keeps its own height (the uploaded model and the parts sit lowered by the ground level, so the basements stay below grade), and the basements slide with the tower */
let slideRest=null;
function slideGroups(dx,dy){ const gs=[lodGroup,dressGroup,LAB.towerGroup,LAB.waterGroup,selHelper,advGroup,belowGroup,partsGroup].filter(Boolean);
  if(!slideRest||slideRest.gs.some((g,i)=>g!==gs[i])) slideRest={gs,pos:gs.map(g=>g.position.clone())};
  slideRest.gs.forEach((g,i)=>{ const p=slideRest.pos[i]; g.position.set(p.x+dx,p.y,p.z-dy); });
  if(!dx&&!dy) slideRest=null; LAB.requestRender(); }
function hintText(dx,dy){ const S=LAB.S; const x=S.posX+(dx||0), y=S.posY+(dy||0); return `<b>Mass selected</b> · ${x>0?'+':''}${x} m E, ${y>0?'+':''}${y} m N · drag to move · arrows nudge 1 m, Shift 5 m · [ ] rotate · Esc`; }
vpEl.addEventListener('pointerdown',e=>{ mDown=null; if(e.button!==0||e.target.closest('.viewtools,.clip-panel,.keyplan,.secprog,.abar,.hud,.compass,.mass-hint')) return; mDown={x:e.clientX,y:e.clientY,b:e.button};
  if(massAt(e)){ const g=groundPoint(e); if(g){ e.stopImmediatePropagation(); vpEl.setPointerCapture(e.pointerId); drag={id:e.pointerId,ox:LAB.S.posX-g.x,oy:LAB.S.posY-g.y,dx:0,dy:0,moved:false}; if(!massSel){ massSel=true; refreshMassSel(); } vpEl.style.cursor='grabbing'; } } },true);
vpEl.addEventListener('pointermove',e=>{ if(drag){ if(e.pointerId!==drag.id) return; const g=groundPoint(e); if(!g) return; const P=LAB.PARAMS, S=LAB.S; const snap=e.altKey?0.1:1; let nx=Math.round((g.x+drag.ox)/snap)*snap, ny=Math.round((g.y+drag.oy)/snap)*snap; nx=Math.max(P.posX.min,Math.min(P.posX.max,nx)); ny=Math.max(P.posY.min,Math.min(P.posY.max,ny)); drag.dx=+(nx-S.posX).toFixed(1); drag.dy=+(ny-S.posY).toFixed(1); drag.moved=drag.moved||Math.hypot(e.clientX-mDown.x,e.clientY-mDown.y)>3; slideGroups(drag.dx,drag.dy); $('mass-hint').innerHTML=hintText(drag.dx,drag.dy); return; }
  if(e.buttons) return; vpEl.style.cursor=massAt(e)?'grab':''; });
const endDrag=e=>{ if(!drag||e.pointerId!==drag.id) return; const d=drag; drag=null; vpEl.style.cursor=''; try{ vpEl.releasePointerCapture(e.pointerId); }catch(x){} slideGroups(0,0); if(d.moved&&(d.dx||d.dy)){ LAB.S.posX=+(LAB.S.posX+d.dx).toFixed(1); LAB.S.posY=+(LAB.S.posY+d.dy).toFixed(1); LAB.update(); } $('mass-hint').innerHTML=hintText(0,0); mDown=null; };
vpEl.addEventListener('pointerup',endDrag,true); vpEl.addEventListener('pointercancel',endDrag,true);
vpEl.addEventListener('pointerup',e=>{ const d=mDown; mDown=null; if(!d||d.b!==0) return; if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>5) return;
  const hit=massAt(e); const was=massSel; massSel=hit; if(massSel||was) refreshMassSel(); });
window.addEventListener('keydown',e=>{ if(!massSel) return; const t=e.target; if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable)) return;
  if(e.key==='Escape'){ massSel=false; refreshMassSel(); return; }
  let dx=0, dy=0, rot=0; if(e.key==='ArrowUp') dy=1; else if(e.key==='ArrowDown') dy=-1; else if(e.key==='ArrowRight') dx=1; else if(e.key==='ArrowLeft') dx=-1; else if(e.key==='['||e.key==='PageDown') rot=-1; else if(e.key===']'||e.key==='PageUp') rot=1; else return;
  e.preventDefault(); const S=LAB.S, P=LAB.PARAMS, step=e.shiftKey?5:1;
  // the arrows follow the screen: "up" is the way the camera looks along the ground, snapped to the nearest compass axis
  const th=LAB.orbit.theta; const fx=-Math.sin(th), fy=Math.cos(th); let ux,uy; if(Math.abs(fx)>=Math.abs(fy)){ ux=Math.sign(fx)||1; uy=0; } else { ux=0; uy=Math.sign(fy)||1; } const rx=uy, ry=-ux;
  const mx=(dy*ux+dx*rx)*step, my=(dy*uy+dx*ry)*step; const clamp=(v,p)=>Math.max(p.min,Math.min(p.max,v));
  if(mx||my){ S.posX=clamp(S.posX+mx,P.posX); S.posY=clamp(S.posY+my,P.posY); } if(rot) S.rotDeg=clamp(S.rotDeg+rot*(e.shiftKey?15:5),P.rotDeg);
  LAB.update(); });
LAB.hooks.afterUpdate.push(()=>{ if(massSel) refreshMassSel(); });
LAB.sim={init(){ initState(); buildUI(); placeControls(); syncGeometry(); updateGeomInfo(); renderSky(); applySunView(); if(LAB.S.impact.mode!=='sun'&&LAB.S.impact.mode!=='wind') setMode('sun'); else runCurrent(false); rerender(); if(adv()) setTimeout(()=>phaseView('advanced'),0);
    setTimeout(()=>autoRun(0),900); },
  showParts, showExploded, framePreview, applyModelWWR, sunPos, runCurrent, runSunStudy, runWindStudy, setMode, setStudioMode, reportData, periodInfo, roseFor, DATES, STRATS, solarStudy, band, ventStudy, daylightTower, daylightTowerCached, daylightFloor, aseFloor, aseTower, ventTowerQuick, planStudy, terraceWind, windProfile, zoneFor, zoneGlazing, energyChanged, exposurePass, setOverlay, dni, terrainDEM, towerRaster, plazaCellsAt, buildSiteRaster:()=>{ if(!siteRaster) buildSiteRaster(); return siteRaster; }, DOM,
  markStale(kind){ stale[kind]=true; showStale(); }, rerenderRain:renderRain, renderSun:()=>renderSun(sunResult), renderWind:r=>renderWind(r||windResult), afterImport(){ if(!SW) return; updateGeomInfo(); if(adv()) setTimeout(maybeSliceDialog,0); },
  get windResult(){return windResult;}, get sunResult(){return sunResult;}, get SW(){return SW;}};
})();
