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
    rose.forEach((r,i)=>{ const f=wint*SEASON_ROSE.winter[i]+(1-wint)*SEASON_ROSE.summer[i], s=wint*SEASON_SPEED.winter[i]+(1-wint)*SEASON_SPEED.summer[i]; r.f+=w*f; r.s+=w*f*s; }); tot+=w; }
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
  overlayMesh=new THREE.Mesh(new THREE.PlaneGeometry(DOM.xmax-DOM.xmin,DOM.ymax-DOM.ymin),new THREE.MeshBasicMaterial({map:overlayTex,transparent:true,depthWrite:false}));
  overlayMesh.rotation.x=-Math.PI/2; overlayMesh.position.set((DOM.xmin+DOM.xmax)/2,0.3,-(DOM.ymin+DOM.ymax)/2); overlayMesh.renderOrder=2; LAB.overlayGroup.add(overlayMesh);
}
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
    for(const m of site.meshes){ if(m.top<3) continue;
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

/* ---------- true plan, elevation and section: an orthographic camera stands in for the core's perspective camera; the section adds a clipping plane through the tower, facing the viewer ---------- */
const view={ortho:false,section:false};
const orthoCam=new THREE.OrthographicCamera(-1,1,1,-1,1,8000); const secPlane=new THREE.Plane(new THREE.Vector3(0,0,-1),0); const NOCLIP=[];
(function patchRender(){ const R=LAB.renderer, orig=R.render.bind(R);
  R.render=function(sc,cam){
    if(cam!==LAB.camera){ R.clippingPlanes=NOCLIP; return orig(sc,cam); }
    const o=LAB.orbit;
    if(view.section){ const dx=Math.sin(o.theta), dz=Math.cos(o.theta); secPlane.normal.set(-dx,0,-dz); secPlane.constant=dx*o.target.x+dz*o.target.z; R.clippingPlanes=[secPlane]; } else R.clippingPlanes=NOCLIP;
    if(view.ortho){ const pc=LAB.camera; orthoCam.position.copy(pc.position); orthoCam.quaternion.copy(pc.quaternion); const hh=o.dist*Math.tan(pc.fov*Math.PI/360), hw=hh*pc.aspect; orthoCam.left=-hw; orthoCam.right=hw; orthoCam.top=hh; orthoCam.bottom=-hh; orthoCam.updateProjectionMatrix(); return orig(sc,orthoCam); }
    return orig(sc,cam); };
  const origCap=LAB.captureView; LAB.captureView=function(opts){ const s={o:view.ortho,s:view.section}; view.ortho=!!(opts&&opts.plan); view.section=false; try{ return origCap(opts); } finally{ view.ortho=s.o; view.section=s.s; } };
})();
function setViewMode(ortho,section,theta,phi){ view.ortho=ortho; view.section=section; const o=LAB.orbit; if(theta!==undefined) o.theta=theta; if(phi!==undefined) o.phi=phi; o.target.set(LAB.S.posX,LAB.S.height*0.42,-LAB.S.posY); syncViewButtons(); LAB.requestRender(); }
function syncViewButtons(){ $('view-top').setAttribute('aria-pressed',String(view.ortho&&!view.section&&LAB.orbit.phi<0.05)); $('view-elev').setAttribute('aria-pressed',String(view.ortho&&!view.section&&LAB.orbit.phi>1.5)); $('view-section').setAttribute('aria-pressed',String(view.section)); }

/* ---------- level of detail: fused massing blocks in Basic; floors and a façade built from the strategy zones in Advanced; uploaded files as modeled ---------- */
const advGroup=new THREE.Group(), lodGroup=new THREE.Group(), dressGroup=new THREE.Group(); LAB.scene.add(advGroup); LAB.scene.add(lodGroup); LAB.scene.add(dressGroup); let advVersion=-1;
const mkMat=c=>new THREE.MeshLambertMaterial({color:c,side:THREE.DoubleSide});
const MAT={tower:mkMat(0x9aa3ad),spandrel:mkMat(0x8f99a4),glass:mkMat(0x6e9cc4),shade:mkMat(0xd9a441),pv:mkMat(0x1f3a5f),green:mkMat(0x5e8f5a)};
function applyColors(){ const v=(k,d)=>cssVar(k)||d; MAT.tower.color.set(v('--mass','#9aa3ad')); MAT.spandrel.color.set(v('--spandrel','#8f99a4')); MAT.glass.color.set(v('--glass','#6e9cc4')); MAT.shade.color.set(v('--shade-dev','#d9a441')); MAT.pv.color.set(v('--pv','#1f3a5f')); MAT.green.color.set(v('--green','#5e8f5a')); }
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
function buildAdv(){
  const R=LAB.uploadRaw; if(!R){ advGroup.visible=false; return; }
  if(advVersion!==R.version){
    clearGroup(advGroup);
    for(const [list,cat] of [[R.massing,'tower'],[R.shading,'shade'],[R.pv,'pv']]) for(const m of list){
      let g=new THREE.BufferGeometry(); const pos=new Float32Array(m.v.length); for(let i=0;i<m.v.length;i+=3){ pos[i]=m.v[i]-R.cx; pos[i+1]=m.v[i+2]-R.minz; pos[i+2]=-(m.v[i+1]-R.cy); }
      g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setIndex(m.f); g=g.toNonIndexed(); g.computeVertexNormals();
      const mesh=new THREE.Mesh(g,MAT[cat]); mesh.userData.cat=cat; mesh.castShadow=true; mesh.receiveShadow=true; advGroup.add(mesh); }
    advVersion=R.version;
  }
  const S=LAB.S; advGroup.position.set(S.posX,0,-S.posY); advGroup.rotation.y=S.rotDeg*Math.PI/180;
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
/* outline edges of a floor plate with their world orientation, used for the façade */
function edgesOf(f){ const out=[]; const c=Math.cos(f.rot), s=Math.sin(f.rot); for(const lp of LAB.maskLoops(f)){ const pts=lp.pts, n=pts.length; for(let k=0;k<n;k++){ const a=pts[k], b=pts[(k+1)%n]; const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy); if(L<0.5) continue;
  const ux=dx/L, uy=dy/L, sgn=lp.outer?1:-1, ox=uy*sgn, oy=-ux*sgn; const wx=ox*c-oy*s, wy=ox*s+oy*c; const deg=((Math.atan2(wy,wx)*180/Math.PI)%360+360)%360; const o=deg<45||deg>=315?'E':(deg<135?'N':(deg<225?'W':'S'));
  out.push({L,ux,uy,ox,oy,o,ang:f.rot+Math.atan2(dy,dx),mx:(a[0]+b[0])/2,my:(a[1]+b[1])/2}); } } return out; }
/* façade from the strategy zones: glazing by orientation and level, devices, PV, green walls, double skins, balconies, terrace screens; podium and canopy. Dressing is visual (viz) and hidden from the sun study, whose devices are analytic; podium, canopy and balcony slabs are real mass. */
function buildDress(floors,raw){
  const W=SW.ws, T=LAB.top; const glass=new Batch(), shade=new Batch(), pv=new Batch(), green=new Batch(), solid=new Batch(), slabs=new Batch();
  for(const f of floors){ const hh=f.h-GAP; const lvl=f.i+1;
    for(const e of edgesOf(f)){ const z=zoneFor(e.o,lvl), st=STRATS[z.strat], D=z.depth; const sp=(1-z.wwr)*hh, gh=hh-sp; const L=e.L;
      const at=(uo,vo)=>LAB.toWorld(f,e.mx+e.ux*uo+e.ox*vo,e.my+e.uy*uo+e.oy*vo);
      if(!raw){ if(z.strat==='punched'){ const nW=Math.max(1,Math.floor(L/2.4)), step=L/nW, w=Math.min(1.8,step-0.4); if(w>0.4) for(let i=0;i<nW;i++){ const q=at(-L/2+(i+0.5)*step,0.07); glass.box(q.x,q.y,f.z+sp+gh/2,w,0.12,gh,e.ang); } }
        else { const q=at(0,0.07); glass.box(q.x,q.y,f.z+sp+gh/2,L,0.12,gh,e.ang); }
        if(z.strat==='greenwall'&&sp>0.3){ const q=at(0,0.1); green.box(q.x,q.y,f.z+sp/2,L*0.98,0.1,sp*0.9,e.ang); } }
      if(z.pv>0&&sp>0.2){ const q=at(0,0.12); pv.box(q.x,q.y,f.z+sp/2,L*0.96,0.08,sp*z.pv,e.ang); }
      if(st.device&&D>0&&L>=0.8){
        if(z.strat==='overhang'){ const q=at(0,D/2); shade.box(q.x,q.y,f.z+hh-0.08,L+0.2,D,0.15,e.ang); }
        else if(z.strat==='louvres'||z.strat==='eggcrate'){ const nl=Math.floor(gh/0.5); for(let i=0;i<nl;i++){ const q=at(0,D/2); shade.box(q.x,q.y,f.z+sp+(i+0.5)*0.5,L,D,0.05,e.ang); } }
        if(z.strat==='fins'||z.strat==='eggcrate'){ const nf=Math.max(1,Math.floor(L/1.5)), step=L/nf; for(let i=0;i<nf;i++){ const q=at(-L/2+(i+0.5)*step,D/2); shade.box(q.x,q.y,f.z+sp+gh/2,0.1,D,gh,e.ang); } }
        else if(z.strat==='punched'){ const nW=Math.max(1,Math.floor(L/2.4)), step=L/nW, w=Math.min(1.8,step-0.4); if(w>0.4) for(let i=0;i<nW;i++){ const u=-L/2+(i+0.5)*step; let q=at(u,D/2); shade.box(q.x,q.y,f.z+hh-0.08,w+0.3,D,0.15,e.ang); for(const sgn of [-1,1]){ q=at(u+sgn*(w/2+0.08),D/2); shade.box(q.x,q.y,f.z+sp+gh/2,0.15,D,gh,e.ang); } } }
        else if(z.strat==='lightshelf'){ const q=at(0,D/2); if(gh>2.3) shade.box(q.x,q.y,f.z+sp+2.1,L,D,0.1,e.ang); else shade.box(q.x,q.y,f.z+hh-0.08,L+0.2,D,0.15,e.ang); }
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
function syncGeometry(){
  applyColors(); buildAdv(); const raw=useRaw();
  LAB.towerGroup.visible=false; advGroup.visible=raw; for(const o of advGroup.children) o.visible=o.userData.cat==='tower'||adv();
  lodGroup.visible=!raw; buildLOD(); dressGroup.visible=adv();
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
  if(on&&p.alt>0.01){ setSunLight(p); LAB.sun.intensity=0.4+0.6*Math.sin(p.alt); LAB.hemi.intensity=0.6; }
  else { LAB.sun.position.set(260,520,180); LAB.sun.intensity=0.75; LAB.hemi.intensity=0.95; }
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
function sunDay(doy,tz,h0,h1,ctx){
  const R=LAB.renderer, N=sunRes.w*sunRes.h; const withT=new Float32Array(N), without=new Float32Array(N); let lostWh=0, towerWh=0, hours=0; const towerBy={}; for(const c of CATS) towerBy[c]=0;
  const {gWhite,white,black,setTower,towerMeshes,siteMeshes,normalMats,zIndex,nF}=ctx; const pxArea=(920/512)*(920/512); const hourly=[];
  for(let h=h0;h<=h1;h++){ const p=sunPos(doy,h,tz); if(p.alt<0.03) continue; hours++;
    setSunLight(p); const I=dni(p.alt);
    LAB.scene.overrideMaterial=gWhite; gWhite.needsUpdate=true; LAB.ground.material=gWhite; R.shadowMap.enabled=true;
    for(const cfg of [1,0]){ setTower(!!cfg); R.setRenderTarget(rtTop); R.clear(); R.render(LAB.scene,topCam); const buf=readRT(rtTop); const thr=Math.max(20,Math.sin(p.alt)*255*0.45);
      const acc=cfg?withT:without; for(let k=0;k<N;k++){ if(buf[k*4]<thr) acc[k]+=1; } }
    setTower(true); LAB.scene.overrideMaterial=null;
    const d=sunDir(p); sunCam.position.set(d.x*2500,d.z*2500,-d.y*2500); sunCam.lookAt(0,80,0); sunCam.updateProjectionMatrix();
    const swap=(list,mat)=>{ for(const m of list){ m.userData._m=m.material; m.material=typeof mat==='function'?mat(m):mat; } }; const restore=list=>{ for(const m of list){ m.material=m.userData._m; } };
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
  const hiddenObjs=[]; LAB.scene.traverse(o=>{ if((o.isLine||o.isPoints||o.isSprite)&&o.visible){ o.visible=false; hiddenObjs.push(o); } });
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
    diffH:scope==='date'?0.12*perDay[0].hourly.reduce((s,r)=>s+r.I*Math.sin(r.alt),0)/1000:CLIMATE.ghi.reduce((s,g,m)=>s+g*KD[m]*PI.monthDays[m],0)};
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
    for(const h of d.hourly){ const glared=new Set(); for(const o of ORI){ const col=h.Az[o]; for(let i=0;i<nF;i++){ const a=col[i]; if(a<=0) continue; const Z=map[i][o], zone=Z.z; const beam=a*h.I/1000; const gh=Math.max(0.3,(r.floorH[i]-GAP)*zone.wwr); const t=stratT(zone,h.alt,h.az,FACE_AZ[o],gh); const g=beam*zone.wwr*zone.shgc*0.9;
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
/* natural ventilation by floor: a floor is operable where any face zone is operable; a double skin shelters its openings so the wind limit rises */
function ventStudy(){
  const V=SW.vent, PI=periodInfo(), rose=roseFor(PI), S=LAB.S, floors=LAB.floors||[]; const U10=rose.reduce((s,r)=>s+r.f*r.s,0);
  const cdf=(u,mean)=>1-Math.exp(-Math.PI/4*(u/mean)*(u/mean));
  const fWof=(Um,umax)=>V.mode==='cross'?Math.max(0,cdf(umax,Um)-cdf(0.5,Um)):(V.mode==='single'?cdf(umax,Um):cdf(umax*1.2,Um));
  const op=[]; let limit=0; for(const f of floors){ let operable=false, boost=1; for(const o of ORI){ if(!(f.facade&&f.facade[o]>0)) continue; const z=zoneFor(o,f.i+1); if(z.operable){ operable=true; boost=Math.max(boost,STRATS[z.strat].ventBoost||1); } } if(!operable) continue;
    const zm=f.z+f.h/2, Um=U10*Math.pow(Math.max(10,zm)/10,ALPHA), umax=V.umax*boost; op.push({i:f.i,zm,Um,umax,fW:fWof(Um,umax)}); if(1.8*Um<=umax) limit=f.i+1; }
  const fW=op.length?op.reduce((s,x)=>s+x.fW,0)/op.length:0; const Um=op.length?op.reduce((s,x)=>s+x.Um,0)/op.length:U10*Math.pow(S.height/20,ALPHA);
  const adaptive=V.band==='adaptive';
  const rows=CLIMATE.months.map((m,i)=>{ const days=PI.monthDays[i]; const T=CLIMATE.temp[i]; let tmin=V.tmin, tmax=V.tmax, comfort=null; if(adaptive&&T>=10&&T<=33.5){ comfort=17.8+0.31*T; tmin=comfort-3.5; tmax=comfort+3.5; } const lo=Math.max(T-5,tmin), hi=Math.min(T+5,tmax); const fT=Math.max(0,hi-lo)/10; const hours=days*24; return {m,days,T,fT,hours,vent:hours*fT*fW,comfort,tmin,tmax}; });
  const total=rows.reduce((s,r)=>s+r.vent,0), hoursTot=rows.reduce((s,r)=>s+r.hours,0);
  const Utop=U10*Math.pow(S.height/10,ALPHA);
  return {rows,total,hoursTot,fW,Um,U10,operable:op.length,nF:floors.length,limit,all:op.length>0&&limit>=floors.length,Utop,qTop:0.613*Utop*Utop*1.8*1.8,adaptive};
}
/* wind on terraces: height profile per terrace floor, halved where a wind-screen zone covers that level */
function terraceWind(){ const V=refWind(); const out=[]; for(const f of LAB.floors||[]){ if(f.terrace<30&&f.i<LAB.floors.length-1) continue; if(f.i===LAB.floors.length-1&&f.roof<30) continue; const z=f.z+f.h; const U=V.U*Math.pow(Math.max(10,z)/10,ALPHA); let screened=false; for(const o of ORI){ const q=zoneFor(o,f.i+1); if(STRATS[q.strat].screen){ screened=true; break; } } const Us=screened?U*0.5:U; out.push({level:f.i+1,z,area:f.i===LAB.floors.length-1?f.roof:f.terrace,U,gust:U*1.8,band:cls(U),screened,Us,bandS:cls(Us)}); } return out; }

/* ---------- sky and rose diagrams ---------- */
function sunPathSVG(){
  const R=92, cx=112, cy=112; const sd=LAB.S.impact.sun; const cur=DATES[sd.date]; const now=sunPos(cur.doy,sd.hour,cur.tz);
  const pt=p=>{ const r=R*(1-p.alt/(Math.PI/2)); return [cx+r*Math.sin(p.az), cy-r*Math.cos(p.az)]; };
  let s=`<svg viewBox="0 0 224 224" role="img" aria-label="Sun paths over the year with the current sun"><style>text{font-family:var(--font-m);font-size:8.5px;fill:var(--muted)} .pth{fill:none;stroke:var(--line);stroke-width:1} .pth.cur{stroke:var(--sun);stroke-width:1.8} .ring{fill:none;stroke:var(--line2)}</style>`;
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
  let s=`<svg viewBox="0 0 224 224" role="img" aria-label="Wind rose for the period"><style>text{font-family:var(--font-m);font-size:8.5px;fill:var(--muted)} .ring{fill:none;stroke:var(--line2)}</style>`;
  for(const t of [0.25,0.5,0.75,1]) s+=`<circle class="ring" cx="${cx}" cy="${cy}" r="${(R*t).toFixed(1)}"/>`;
  rose.forEach(r=>{ const L=R*r.f/maxf, a=r.dir*Math.PI/180, w=0.33; const x1=cx+L*Math.sin(a-w), y1=cy-L*Math.cos(a-w), x2=cx+L*Math.sin(a+w), y2=cy-L*Math.cos(a+w); const t=Math.min(1,Math.max(0,(r.s-3)/3)); s+=`<path d="M${cx},${cy}L${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}Z" fill="var(--wind)" fill-opacity="${(0.35+0.55*t).toFixed(2)}"><title>${r.name}: ${Math.round(r.f*100)}% of hours, ${r.s.toFixed(1)} m/s</title></path>`;
    const lx=cx+(R+12)*Math.sin(a), ly=cy-(R+12)*Math.cos(a); s+=`<text x="${lx.toFixed(1)}" y="${(ly+3).toFixed(1)}" text-anchor="middle">${r.name}</text>`; });
  s+=`<text x="${cx+3}" y="${cy-R*0.5+10}">${Math.round(maxf*50)}%</text>`;
  return s+'</svg>';
}
const fmtHour=v=>{ const h=Math.floor(v), m=v%1?'30':'00'; return `${h}:${m}`; };
function renderSky(){ const PI=periodInfo(); const rose=roseFor(PI); const sd=LAB.S.impact.sun, D=DATES[sd.date]; const p=sunPos(D.doy,sd.hour,D.tz);
  $('sky').innerHTML=`<div class="sky"><div><div class="viz">${sunPathSVG()}</div><p class="note" style="margin-top:4px">Sun paths at the solstices and equinox, altitude inward. ${D.label}, ${fmtHour(sd.hour)}: ${p.alt>0?(p.alt*180/Math.PI).toFixed(0)+'° high, azimuth '+(p.az*180/Math.PI).toFixed(0)+'°':'below the horizon'}.</p></div><div><div class="viz">${roseSVG(rose)}</div><p class="note" style="margin-top:4px">Wind rose for ${PI.full?'the year':PI.label}: petal length is share of hours, depth of colour the mean speed. Dominant: ${rose.slice().sort((x,y)=>y.f-x.f).slice(0,2).map(r=>r.name+' '+Math.round(r.f*100)+'%').join(', ')}.</p></div></div>`; }

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
let stale={sun:false,wind:false}, busy=false;
function showStale(){ if(busy) return; $('run-sun').textContent=stale.sun?'Run study (settings changed)':'Run study'; $('run-wind').textContent=stale.wind?'Run study (settings changed)':'Run study'; }
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
  $('run-active').addEventListener('click',()=>{ if(busy) return; const m=LAB.S.impact.mode==='wind'?'wind':'sun'; setMode(m); runStudy(m); });
  buildReportUI();
  const presets=$('wind-presets'); CLIMATE.winds.forEach(w=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.textContent=w.label; b.addEventListener('click',()=>{ LAB.S.impact.wind.dir=w.dir; LAB.S.impact.wind.speed=w.speed; LAB.S.impact.wind.annual=false; syncUI(); setMode('wind'); runCurrent(true); }); presets.appendChild(b); });
  $('view-sun').addEventListener('click',()=>{ const on=LAB.S.impact.mode!=='sun'; setMode(on?'sun':'none'); if(on) LAB.tabs.show('sun'); });
  $('view-wind').addEventListener('click',()=>{ const on=LAB.S.impact.mode!=='wind'; setMode(on?'wind':'none'); if(on) LAB.tabs.show('wind'); });
  // true views: the core's handlers run first and set the orbit; these refine them
  $('view-top').addEventListener('click',()=>setViewMode(true,false,0,0));
  $('view-elev').addEventListener('click',()=>setViewMode(true,false,view.ortho&&!view.section&&LAB.orbit.phi>1.5?LAB.orbit.theta+Math.PI/2:0,Math.PI/2));
  $('view-section').addEventListener('click',()=>setViewMode(true,true,view.section?LAB.orbit.theta+Math.PI/2:0,Math.PI/2));
  $('view-iso').addEventListener('click',()=>setViewMode(false,false)); $('view-site').addEventListener('click',()=>{ view.ortho=false; view.section=false; syncViewButtons(); LAB.requestRender(); });
  buildZoneUI();
  LAB.controlsFor($('params-glazing'),GLAZE_P,'gl',()=>SW.glaz,()=>{ LAB.syncFor($('params-glazing'),GLAZE_P,'gl',SW.glaz); persist(); if(sunResult) stale.sun=true; showStale(); rerender(); });
  LAB.controlsFor($('params-pv'),PV_P,'pv',()=>SW.pv,()=>{ LAB.syncFor($('params-pv'),PV_P,'pv',SW.pv); live(); });
  LAB.controlsFor($('params-vent'),VENT_P,'vt',()=>SW.vent,()=>{ syncVentUI(); persist(); if(windResult) stale.wind=true; showStale(); rerender(); });
  LAB.controlsFor($('params-dl'),DL_P,'dl',()=>SW.dl,()=>{ LAB.syncFor($('params-dl'),DL_P,'dl',SW.dl); persist(); if(sunResult) stale.sun=true; showStale(); rerender(); });
  LAB.controlsFor($('params-ws'),WS_P,'ws',()=>SW.ws,()=>{ LAB.syncFor($('params-ws'),WS_P,'ws',SW.ws); persist(); syncGeometry(); stale.wind=true; if(sunResult) stale.sun=true; showStale(); if(LAB.S.impact.mode==='wind') renderWind(windResult); });
  $('c-raw').addEventListener('change',e=>{ SW.show.raw=e.target.checked; persist(); syncGeometry(); if(sunResult) stale.sun=true; showStale(); updateGeomInfo(); });
  buildPeriodUI();
  syncUI();
}
function syncVentUI(){ const host=$('params-vent'); LAB.syncFor(host,VENT_P,'vt',SW.vent); const ad=SW.vent.band==='adaptive'; for(const k of ['tmin','tmax']){ const el=host.querySelector(`[data-param="${k}"]`); if(el) el.style.opacity=ad?'.4':'1'; } const dt=host.querySelector('[data-param="dT"]'); if(dt) dt.hidden=SW.vent.mode==='cross'; }
function setStudioMode(m){ if(SW.mode===m) return; SW.mode=m; persist(); document.body.dataset.mode=m; syncGeometry(); placeControls(); { const t=document.querySelector('#tabs button[aria-selected="true"]'); const cur=t?t.dataset.tab:'model'; if(m==='basic'&&['strat','daylight','vent','energy'].includes(cur)) LAB.tabs.show(cur==='vent'?'wind':(cur==='energy'?'eff':'sun')); else if(m==='advanced'&&(cur==='sun'||cur==='wind'||cur==='eff')) LAB.tabs.show(cur==='wind'?'vent':(cur==='eff'?'energy':'strat')); }
  if(sunResult){ stale.sun=true; } if(windResult&&(!!windResult.strat)!==stratActive()){ stale.wind=true; } showStale(); syncUI(); updateGeomInfo(); rerender(); }
function setMode(m){ if(LAB.S.impact.mode===m) return; LAB.S.impact.mode=m; syncUI(); clearOverlay(); applySunView(); if(!busy) runCurrent(false); persist(); }
function onTab(name){ if(['strat','daylight','vent','energy'].includes(name)&&!adv()){ LAB.tabs.show(name==='energy'?'eff':'sun'); return; } if((name==='sun'||name==='wind'||name==='eff')&&adv()){ LAB.tabs.show(name==='sun'?'daylight':(name==='wind'?'vent':'energy')); return; }
  const was=curTab; curTab=name; $('period-block').hidden=!['sun','wind','strat','daylight','vent','report'].includes(name); if(name==='sun'||name==='daylight') setMode('sun'); if(name==='wind'||name==='vent') setMode('wind'); if(name==='strat'&&LAB.S.impact.mode==='none') setMode('sun'); if(name==='report') syncReportUI(); if(!adv()&&(name==='eff'||was==='eff')) rerender(); }
function syncUI(){
  for(const m of ['sun','wind']) LAB.syncFor($('params-'+m),MODE_P[m],'im'+m,LAB.S.impact[m]);
  const sd=LAB.S.impact.sun; const dateCtl=document.querySelector('#params-sun [data-param="date"]'); if(dateCtl) dateCtl.querySelector('label').textContent=sd.scope==='date'?'Date':'Date shown in the viewport';
  const W=LAB.S.impact.wind; document.querySelectorAll('#params-wind [data-param="dir"], #params-wind [data-param="speed"]').forEach(el=>{ el.style.opacity=W.annual?'.45':'1'; });
  const vs=document.querySelector('#params-wind [data-param="view"] option[value="strat"]'); if(vs) vs.hidden=!adv();
  const m=LAB.S.impact.mode;
  $('view-sun').setAttribute('aria-pressed',String(m==='sun')); $('view-wind').setAttribute('aria-pressed',String(m==='wind')); updateLegend();
  document.querySelectorAll('#mode-switch button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===SW.mode)));
  document.body.dataset.mode=SW.mode;
  LAB.syncFor($('params-glazing'),GLAZE_P,'gl',SW.glaz); LAB.syncFor($('params-pv'),PV_P,'pv',SW.pv); syncVentUI(); LAB.syncFor($('params-dl'),DL_P,'dl',SW.dl); LAB.syncFor($('params-ws'),WS_P,'ws',SW.ws); syncZoneUI(); syncViewButtons();
  $('c-raw').checked=!!SW.show.raw;
  $('mode-banner').innerHTML=adv()?'<b>Design review</b> · the façade zones drive the model, the floor plan and the LEED v4.1 readings below. Edits re-read the façade instantly; a flag appears when daylight or ventilation need a rerun.':'<b>Site impact</b> · massing phase: how the form shades neighbours and plazas, how much sun it takes and receives, and how it changes the wind at street level. The model is shown as solid blocks.';
  syncReportUI();
}
function updateGeomInfo(){ const R=LAB.uploadRaw; const el=$('geom-info');
  if(!R){ el.innerHTML='<p class="empty">No uploaded model. The generated massing is drawn as blocks in Basic and as floors with the zoned façade in Advanced.</p>'; $('c-raw').closest('label').style.opacity='.45'; return; }
  $('c-raw').closest('label').style.opacity='1';
  el.innerHTML=`<p class="blurb" style="margin-top:0"><b>${R.name}</b>: ${R.massing.length} massing object${R.massing.length>1?'s':''}, ${R.shading.length} shading, ${R.pv.length} PV${R.pv.length?' ('+fmtI(meshArea(R.pv))+' m²)':''}. ${useRaw()?(adv()?'Shown and studied as modeled with every layer, so fins, overhangs, balconies and voids in the file shade the façades; zone devices are added on top.':'Shown and studied as the massing layer alone; switch to Advanced to bring in the shading and PV layers.'):'Shown and studied as the sliced massing; turn the modeled geometry on to use the file itself.'}</p>`;
}
/* one study as a promise: the sun render (plus daylight and ASE in Advanced) or the wind flow (plus ventilation in Advanced) */
function progressTo(kind,msg){ $('run-'+kind).textContent=msg; $('run-all-status').textContent=msg; $(kind==='sun'?'run-daylight-status':'run-vent-status').textContent=msg; $('run-active').textContent=msg; $('run-active').disabled=true; }
function runStudy(kind){
  return new Promise(resolve=>{ busy=true; progressTo(kind,'Computing…'); setTimeout(async()=>{
    try{ if(kind==='sun'){ runSunStudy(); if(adv()&&sunResult){ progressTo('sun','Daylight factors…'); await new Promise(r=>setTimeout(r,20)); sunResult.daylight=daylightTower(); sunResult.ase=await aseTower(msg=>progressTo('sun',msg)); sunResult.advanced=true; } if(sunResult) sunResult.at=Date.now(); }
      else { await runWindStudy(msg=>progressTo('wind',msg)); if(adv()&&windResult){ progressTo('wind','Natural ventilation…'); windResult.vent=ventStudy(); windResult.vt=ventTowerQuick(); windResult.terr=terraceWind(); windResult.advanced=true; } if(windResult) windResult.at=Date.now(); }
    }catch(e){ console.error(e); LAB.toast&&LAB.toast((kind==='sun'?'Sun':'Wind')+' study failed: '+e.message,true); }
    busy=false; stale[kind]=false; showStale(); $('run-all-status').textContent=''; $('run-daylight-status').textContent=''; $('run-vent-status').textContent=''; updateLegend(); if(kind==='sun') renderSun(sunResult); else renderWind(windResult); resolve(); },30); });
}
function runCurrent(force){
  const m=LAB.S.impact.mode, floors=LAB.floors; if(!floors) return;
  const out=$('impact-out'); out.hidden=m==='none'&&!adv(); if(m==='none'){ clearOverlay(); if(adv()) rerender(); return; }
  if(busy) return;
  if(m==='sun'){ if(force) runStudy('sun'); else { drawSunOverlay(); renderSun(sunResult); } }
  else if(m==='wind'){ if(force) runStudy('wind'); else { drawWindOverlay(); renderWind(windResult); } }
}
/* Advanced step 3: both studies in one go, then the live report */
async function runAll(){ if(busy||!LAB.floors) return; const b=$('run-all'); b.disabled=true; try{ setMode('sun'); await runStudy('sun'); LAB.S.impact.mode='wind'; syncUI(); await runStudy('wind'); LAB.S.impact.mode='sun'; syncUI(); clearOverlay(); drawSunOverlay(); applySunView(); } finally{ b.disabled=false; rerender(); } }
const sections={sun:'',wind:''}; let curTab='model';
/* glazing of a floor face for the energy model: the façade zone's window-to-wall ratio and SHGC, with the device transmission measured by the last sun run */
let tMap=null;
function zoneGlazing(fl,o){ const z=zoneFor(o,fl.i+1); if(!tMap){ tMap={}; if(sunResult&&sunResult.dayData){ try{ const A=solarStudy(sunResult); for(const Z of A.zones) tMap[Z.i]=Z.tAvg; }catch(e){} } } const idx=SW.zones.indexOf(z); const t=idx>=0&&tMap[idx]!=null?tMap[idx]:(STRATS[z.strat].mod||1); return {wwr:z.wwr,shgc:z.shgc,t,strat:z.strat}; }
function energyChanged(){ persist(); rerender(); }
function energySection(){ if(!LAB.energy||!LAB.floors) return ''; try{ return adv()?LAB.energy.energyHTML():LAB.energy.formHTML(); }catch(e){ console.error(e); return ''; } }
function setOut(kind,html){ sections[kind]=html; const out=$('impact-out'); const pb=document.getElementById('plan-block'); tMap=null;
  if(adv()){ out.hidden=false; const en=energySection(); out.innerHTML=reportHead()+'<div id="plan-slot"></div>'+sections.sun+sections.wind+en; const slot=document.getElementById('plan-slot'); if(slot&&pb) slot.appendChild(pb); }
  else { out.hidden=false; out.innerHTML=curTab==='eff'?energySection():html; const home=document.getElementById('plan-home'); if(pb&&home&&pb.parentNode!==home) home.appendChild(pb); } }
function fmtTime(t){ if(!t) return 'not yet run'; const d=new Date(t); return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
function reportHead(){
  const S=LAB.S, floors=LAB.floors||[]; const gfa=floors.reduce((s,f)=>s+f.area,0); const PI=periodInfo(); const sd=S.impact.sun, W=S.impact.wind;
  const name=S.typology==='upload'&&LAB.uploadRaw?LAB.uploadRaw.name:LAB.TYP[S.typology].name; const r=sunResult, w=windResult; const A=r&&r.dayData?solarStudy(r):null;
  const k=(label,v,sub,cls)=>`<div><small>${label}</small><b class="${cls||''}">${v}</b>${sub?`<em>${sub}</em>`:''}</div>`;
  let kp='';
  if(r){ kp+=k('New shadow on plazas',r.plazaTot?Math.round(r.plaza/r.plazaTot*100)+'%':'–',`${fmtI(r.plaza)} of ${fmtI(r.plazaTot)} m² · ≥ ${r.th[0]} h`); if(A) kp+=k('Heat through glazing',fmtI(A.shTot),`${r.perDay?'kWh, clear day':'kWh in the period'} · ${Math.round(A.blocked*100)}% blocked by devices`)+k('PV yield',fmtI(A.pvTot),`${r.perDay?'kWh, clear day':'kWh in the period'} · ${A.kwpTot.toFixed(0)} kWp`); if(r.daylight) kp+=k('Daylit floor · sDA proxy',Math.round(r.daylight.sda*100)+'%','LEED bands 40 / 55 / 75%',r.daylight.sda>=0.55?'ok':''); if(r.ase) kp+=k('Annual sunlight exposure',Math.round(r.ase.pct*100)+'%','LEED limit 10%',r.ase.pct>0.1?'over':'ok'); }
  if(w){ kp+=k('Plaza wind mean / peak',w.plazaMean.toFixed(1)+' / '+w.plazaWorst.toFixed(1),'m/s · '+(w.plazaWorst>6?'too windy at the peak':w.plazaWorst>4?'walking comfort':'sitting comfort'),w.plazaWorst>6?'over':'')+k('Ground made windier',fmtI(w.worse)+' m²',`${fmtI(w.better)} m² calmer${w.vsBase?' · strategies calm '+fmtI(w.vsBase.better)+' m²':''}`); if(w.vent) kp+=k('Natural ventilation',Math.round(w.vent.total/Math.max(1,w.vent.hoursTot)*100)+'%',`of hours · ${w.vent.operable} of ${w.vent.nF} floors operable`); if(w.vt&&w.vt.operable) kp+=k('ASHRAE 62.1 openings',w.vt.freePct.toFixed(1)+'%','of floor · rule ≥ 4%',w.vt.freePct>=4?'ok':'over'); }
  const en=LAB.energy&&LAB.energy.last; if(en){ kp+=k('TEUI',en.teui.toFixed(0),`kWh/m²/yr · target ${en.tgt.teui.toFixed(0)}`,en.teui<=en.tgt.teui?'ok':'over')+k('TEDI',en.tedi.toFixed(1),`kWh/m²/yr heating demand · target ${en.tgt.tedi.toFixed(0)}`,en.tedi<=en.tgt.tedi?'ok':'over')+k('GHGI',en.ghgi.toFixed(2),`kgCO₂e/m²/yr · target ${en.tgt.ghgi.toFixed(1)}`,en.ghgi<=en.tgt.ghgi?'ok':'over'); }
  const anyStale=(stale.sun&&r)||(stale.wind&&w); const S0=LAB.S.impact; const Dt=DATES[S0.sun.date];
  return `<div class="report-head"><div class="rh-title"><h2 style="margin:0">Design review</h2><span class="rh-meta">${name} · ${S.height} m · ${floors.length} floors · ${fmtI(gfa)} m² · ${PI.full?'whole year':PI.label} · ${DATES[sd.date].label}, ${fmtHour(sd.hour)} · wind ${W.annual?'period rose':W.dir+'° at '+W.speed.toFixed(1)+' m/s'} · ${SW.zones.length} façade zone${SW.zones.length===1?'':'s'}</span></div>
    <div class="rh-runs"><span>Sun ${r?'run '+fmtTime(r.at):'not yet run'}${r&&!r.advanced?' (Basic)':''}</span><span>Wind ${w?'run '+fmtTime(w.at):'not yet run'}${w&&!w.advanced?' (Basic)':''}</span>${anyStale?'<span class="rh-stale">Design changed since the last run · run the study again to refresh</span>':''}${!r&&!w?'<span>Design the façade, then run sun and daylight, and wind and ventilation.</span>':''}</div>
    ${kp?`<div class="kpi rh-kpi">${kp}</div>`:''}${leedCard(r,w)}</div>`;
}
function rerender(){ const m=LAB.S.impact.mode; if(adv()){ renderSun(sunResult); renderWind(windResult); analyseStatus(); } else { if(m==='sun') renderSun(sunResult); else if(m==='wind') renderWind(windResult); } try{ renderPlan(); }catch(e){ console.error(e); } }
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
function renderSun(r){
  const sd=LAB.S.impact.sun, D=DATES[sd.date]; const p=sunPos(D.doy,sd.hour,D.tz);
  let html=`<h2>Sun and shadow ${modeTag()}</h2>${staleNote('sun')}<div class="wgrid">${stat('Sun now',p.alt>0?`${(p.alt*180/Math.PI).toFixed(0)}° alt · ${(p.az*180/Math.PI).toFixed(0)}° az`:'below horizon')}${stat('Study window',`${sd.h0}:00–${sd.h1}:00`)}</div>`;
  if(!r){ const PI=periodInfo(); html+=`<p class="note">${adv()?'Run analysis':'Run the study'} to accumulate shadow hours between ${sd.h0}:00 and ${sd.h1}:00 ${sd.scope==='period'?'over '+(PI.full?'the whole year':PI.label):'on '+D.label.toLowerCase()}.</p>`; setOut('sun',html); return; }
  const yr=r.scope==='period', P=r.period, unit=yr?(P.full?'h/yr':'h'):'h', eunit=r.perDay?'kWh, clear day':'kWh in the period';
  html+=`<h3>What the massing suggests</h3><ul class="reads">${sunReadings(r).map(s=>`<li>${s}</li>`).join('')}</ul>`;
  if(yr){
    html+=`<h3>New shadow over ${P.full?'a year':P.label} (${P.days} days)</h3><div class="wgrid">${stat(`≥ ${r.th[0]} ${unit} more shadow`,fmtI(r.a1)+' m²')}${stat(`≥ ${r.th[1]} ${unit}`,fmtI(r.a2)+' m²')}${stat(`≥ ${r.th[2]} ${unit}`,fmtI(r.a4)+' m²')}${stat(`Plazas and mid-block links ≥ ${r.th[0]} ${unit}`,r.plazaTot?fmtI(r.plaza)+' m² <em>of '+fmtI(r.plazaTot)+'</em>':'–')}${stat('Around the transit plaza',fmtI(r.transit)+' m²')}${stat('Own site',fmtI(r.siteOpen)+' m²')}</div>
    <div class="wgrid">${stat('Sunlight lost by neighbours',fmtI(r.lostKWh)+' kWh')}${stat('Direct sun received by the tower',fmtI(r.towerKWh)+' kWh')}</div>`;
  } else {
    html+=`<h3>New shadow on the ground</h3><div class="wgrid">${stat('Shaded ≥ 1 h more',fmtI(r.a1)+' m²')}${stat('Shaded ≥ 2 h more',fmtI(r.a2)+' m²')}${stat('Shaded ≥ 4 h more',fmtI(r.a4)+' m²')}${stat('Plazas and mid-block links',r.plazaTot?fmtI(r.plaza)+' m² <em>of '+fmtI(r.plazaTot)+'</em>':'–')}${stat('Around the transit plaza',fmtI(r.transit)+' m²')}${stat('Own site',fmtI(r.siteOpen)+' m²')}</div>
    <div class="wgrid">${stat('Sunlight lost by neighbours',fmtI(r.lostKWh)+' kWh <em>clear-sky day</em>')}${stat('Direct sun received by the tower',fmtI(r.towerKWh)+' kWh <em>clear-sky day</em>')}</div>`;
  }
  const H=r.heat;
  html+=`<h3>Direct sun on the massing</h3><div class="tbl-wrap"><table><thead><tr><th>Surface</th><th class="num">m²</th><th class="num">Sun h/day <em>clear</em></th>${yr?'<th class="num">Sun h <em>expected</em></th>':''}<th class="num">Beam kWh</th><th class="num">kWh/m²</th></tr></thead><tbody>${ORI5.map(o=>`<tr><td>${NAMES[o]}</td><td class="num">${fmtI(H.area[o])}</td><td class="num">${H.sunH[o].toFixed(1)}</td>${yr?`<td class="num">${fmtI(H.sunHexp[o])}</td>`:''}<td class="num">${fmtI(H.by[o])}</td><td class="num">${H.intensity[o].toFixed(1)}</td></tr>`).join('')}${r.raw&&(H.by.shade>0||H.by.pv>0)?`<tr><td>Shading devices as modeled</td><td class="num">–</td><td class="num">–</td>${yr?'<td class="num">–</td>':''}<td class="num">${fmtI(H.by.shade)}</td><td class="num">–</td></tr><tr><td>PV surfaces as modeled</td><td class="num">${LAB.uploadRaw?fmtI(meshArea(LAB.uploadRaw.pv)):'–'}</td><td class="num">–</td>${yr?'<td class="num">–</td>':''}<td class="num">${fmtI(H.by.pv)}</td><td class="num">–</td></tr>`:''}</tbody></table></div>
  <p class="note">Direct beam reaching each face hour by hour after shading by neighbours, future towers and the massing's own voids, steps${r.raw?' and modeled devices':''}; "sun hours" counts hours when at least 3% of a face is lit. ${yr?`${r.months.length} representative days across the period, weighted by days represented and Vancouver's bright-sunshine share, so energy is what typical skies deliver.`:'Clear-sky values for the one date.'} Overlay amber to purple: ${r.th[0]} to ${yr?fmtI(Math.max(4,800*P.days/365)):Math.round(r.hours*0.8)}+ ${unit} of new shadow; the footprint is excluded.</p>`;
  if(adv()){ const A=solarStudy(r);
    html+=`<h2>Façade strategies</h2><div class="kpi"><div><small>Heat through glazing</small><b>${fmtI(A.shTot)}</b><em>${eunit} · ${fmtI(A.unTot)} without devices</em></div><div><small>Blocked by devices</small><b>${Math.round(A.blocked*100)}%</b><em>of beam through glass</em></div><div><small>PV yield</small><b>${fmtI(A.pvTot)}</b><em>${r.perDay?'kWh, clear day':'kWh in the period'} · ${A.kwpTot.toFixed(0)} kWp</em></div></div>
    <h3>By façade zone</h3><div class="tbl-wrap"><table><thead><tr><th>Zone</th><th>Strategy</th><th class="num">WWR</th><th class="num">Beam on zone kWh</th><th class="num">Let through</th><th class="num">Through glass kWh</th><th class="num">Glare h</th><th class="num">PV kWh</th><th class="num">Daylight</th></tr></thead><tbody>${A.zones.map(Z=>`<tr><td><span class="zi ${Z.z.face}"></span>${Z.label}</td><td class="why">${Z.st.name}${Z.st.device&&Z.z.depth?' · '+Z.z.depth.toFixed(1)+' m':''}${Z.z.operable?' · operable':''}</td><td class="num">${Math.round(Z.z.wwr*100)}%</td><td class="num">${fmtI(Z.beam)}</td><td class="num">${Math.round(Z.tAvg*100)}%</td><td class="num">${fmtI(Z.sh)} <em>/ ${fmtI(Z.un)}</em></td><td class="num">${Z.glare.toFixed(0)}</td><td class="num">${Z.pvKwh?fmtI(Z.pvKwh):'–'}</td><td class="num">${Z.aperture.toFixed(2)} ${Z.aperture<0.15?'<span class="pill low">dim</span>':(Z.aperture>0.35?'<span class="pill high">bright</span>':'')}</td></tr>`).join('')}</tbody></table></div>
    <h3>By face</h3><div class="wgrid">${ORI.map(o=>stat(NAMES[o]+' through glass',fmtI(A.byFace[o].sh)+' <em>/ '+fmtI(A.byFace[o].un)+' kWh</em>')).join('')}</div>
    <h3>Photovoltaics</h3>${A.pv.length?`<div class="tbl-wrap"><table><thead><tr><th>Surface</th><th class="num">m²</th><th class="num">kWp</th><th class="num">kWh</th><th class="num">kWh/m²</th></tr></thead><tbody>${A.pv.map(x=>`<tr><td>${x.name}</td><td class="num">${fmtI(x.area)}</td><td class="num">${x.kwp.toFixed(0)}</td><td class="num">${fmtI(x.kwh)}</td><td class="num">${x.perM2.toFixed(0)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">No PV surfaces: set roof coverage or a PV spandrel zone under Strategies, or import a PV layer.</p>'}
    <p class="note">Beam is measured per floor from the sun renders (height is encoded in each pixel), so each zone sees the sun that actually reaches its levels after neighbours and the building's own form. Devices are evaluated hour by hour from profile and horizontal shadow angles: overhangs and balconies against the glass height, louvres at 0.5 m pitch, fins at 1.5 m pitch, reveals around 1.8 m windows, light shelves at 2.1 m; a double skin passes 65% of the gain. Heat through glazing = beam × window-to-wall ratio × SHGC × 0.9 frame factor × device transmission; glare hours are hours with the sun below 25° on a lit zone and more than half the beam let through. PV adds an all-sky diffuse allowance (${fmtI(H.diffH)} kWh/m² horizontal${r.perDay?', clear day':''}) to the measured beam, then module efficiency and performance ratio. Daylight is window-to-wall ratio × visible transmittance.</p>`;
    const DL=r.daylight; if(!DL) html+=`<h2>Daylight</h2><p class="note">This study ran in Basic. Run the sun study again in Advanced to compute daylight factors and annual sunlight exposure for every floor.</p>`; else { const tgt=(DL.target*100).toFixed(1); const ase=r.ase;
      html+=`<h2>Daylight</h2><div class="kpi"><div><small>Daylit floor · sDA proxy</small><b class="${DL.sda>=0.55?'ok':''}">${Math.round(DL.sda*100)}%</b><em>DF ≥ ${tgt}% ≈ ${SW.dl.target} lux · LEED bands 40 / 55 / 75%</em></div><div><small>Mean daylight factor</small><b>${(DL.mean*100).toFixed(1)}%</b><em>work plane, overcast sky</em></div><div><small>Over-lit · DF > 5%</small><b class="${DL.over>0.25?'over':''}">${Math.round(DL.over*100)}%</b><em>glare and heat risk near the glass</em></div></div>
      <div class="viz">${floorBars(DL.rows,x=>x.pctLit,'var(--sun)','Daylit share per floor',0.55)}</div>
      ${ase?`<div class="kpi"><div><small>ASE 1000 lux / 250 h</small><b class="${ase.pct>0.10?'over':'ok'}">${Math.round(ase.pct*100)}%</b><em>of floor · LEED asks ≤ 10% · ${ase.period}</em></div></div><div class="viz">${floorBars(ase.rows,x=>x.pct,'#B8362B','Annual sunlight exposure per floor',0.10)}</div>`:''}
      <p class="note">Daylight factor per floor from eight sight lines to the glass (BRE split-flux, CIE overcast sky, 0.8 m work plane, 2 m grid), with the neighbours' obstruction angle, the zone's overhang, louvres, fins or reveals, the glass transmittance and 25% internal reflection. The sDA proxy is the share of floor with DF ≥ ${tgt}%, the daylight factor that gives ${SW.dl.target} lux under a ${fmtI(DL_E)} lux design sky, which is Vancouver's typical occupied-hour diffuse light; LEED's own sDA300/50% and ASE need an hourly Radiance run (ClimateStudio, Honeybee), so treat these as early-design readings. The dashed line marks the 55% LEED threshold${ase?' and the 10% ASE limit':''}.</p>`; } }
  setOut('sun',html);
}
function renderWind(r){
  const W=LAB.S.impact.wind; const PI=periodInfo();
  let html=`<h2>Pedestrian wind ${modeTag()}</h2>${staleNote('wind')}<div class="wgrid">${stat(W.annual?'Case':'Wind',W.annual?(PI.full?'whole year':PI.label)+' · 8 sectors':W.dir+'° at '+W.speed.toFixed(1)+' m/s')}${stat('Grid','4 m cells · '+(siteRaster?siteRaster.nx+'×'+siteRaster.ny:'–'))}</div>`;
  if(!r){ html+='<p class="note">Run the study to solve pedestrian-level flow with and without the tower.</p>'; }
  else {
    html+=`<h3>What the flow suggests</h3><ul class="reads">${windReadings(r).map(s=>`<li>${s}</li>`).join('')}</ul>`;
    const tot=r.cats.reduce((a,b)=>a+b,0)||1;
    html+=`<h3>${r.annual?'Mean speed over the period, Lawson bands':'Comfort at ground level (Lawson bands)'}</h3><table><thead><tr><th>Band</th><th class="num">Speed</th><th class="num">With tower</th><th class="num">Without</th></tr></thead><tbody>`+
      BANDS.map((n,i)=>`<tr><td><span class="dot" style="background:${BAND_COL[i]}"></span>${n}</td><td class="num">${['≤ 2.5','2.5–4','4–6','6–8','> 8'][i]} m/s</td><td class="num">${(r.cats[i]/tot*100).toFixed(0)}%</td><td class="num">${(r.catsB[i]/tot*100).toFixed(0)}%</td></tr>`).join('')+`</tbody></table>
    <div class="wgrid" style="margin-top:8px">${stat('Made worse by a band',fmtI(r.worse)+' m²')}${stat('Made calmer',fmtI(r.better)+' m²')}${stat(r.annual?'Peak annual mean':'Peak speed',r.maxS.toFixed(1)+' m/s')}${stat('Plaza mean / peak',r.plazaMean.toFixed(1)+' / '+r.plazaWorst.toFixed(1)+' m/s')}${r.annual?stat('Gusty more than 5% of hours',fmtI(r.gusty)+' m² <em>was '+fmtI(r.gustyB)+'</em>'):''}</div>`;
    if(r.annual) html+=`<h3>By wind sector</h3><div class="tbl-wrap"><table><thead><tr><th>From</th><th class="num">Share of hours</th><th class="num">Mean speed</th><th class="num">Plaza mean</th><th class="num">Peak</th><th class="num">Worse</th><th class="num">Calmer</th></tr></thead><tbody>${r.sectors.map(s=>`<tr><td>${s.name}</td><td class="num">${Math.round(s.f*100)}%</td><td class="num">${s.s.toFixed(1)} m/s</td><td class="num">${s.plazaMean.toFixed(1)}</td><td class="num">${s.maxS.toFixed(1)}</td><td class="num">${fmtI(s.worse)} m²</td><td class="num">${fmtI(s.better)} m²</td></tr>`).join('')}</tbody></table></div>`;
  }
  const V=refWind(); const prof=windProfile(V.U);
  html+=`<h3>Wind with height</h3><div class="tbl-wrap"><table><thead><tr><th class="num">Height</th><th class="num">Mean m/s</th><th class="num">Gust m/s</th><th class="num">Pressure kPa</th></tr></thead><tbody>${prof.map(p=>`<tr><td class="num">${p.z.toFixed(0)} m${p.z===LAB.S.height?' <em>top</em>':''}</td><td class="num">${p.U.toFixed(1)}</td><td class="num">${p.gust.toFixed(1)}</td><td class="num">${(p.q*1.8*1.8/1000).toFixed(2)}</td></tr>`).join('')}</tbody></table></div><p class="note">Power-law profile (exponent ${ALPHA}) on the ${V.label}; gusts at 1.8× the mean; pressure is the gust dynamic pressure 0.613·U². Indicative for terrace screens and operable windows, not a structural wind load.</p>`;
  if(adv()&&!(r&&r.vent)){ html+=`<h2>Wind strategies and ventilation</h2><p class="note">${r?'This study ran in Basic. ':''}Run the wind study in Advanced to compute natural-ventilation hours, the ASHRAE 62.1 opening check and the wind on terraces together with the pedestrian flow.</p>`; }
  else if(adv()){ const N=r.vent; const inP=N.rows.filter(x=>x.days>0); const TW=r.terr||[];
    html+=`<h2>Wind strategies and ventilation</h2>`;
    if(r&&r.vsBase) html+=`<div class="kpi"><div><small>Calmer with strategies</small><b>${fmtI(r.vsBase.better)}</b><em>m² against the bare tower</em></div><div><small>Windier</small><b>${fmtI(r.vsBase.worse)}</b><em>m²</em></div><div><small>Plaza mean</small><b>${r.plazaMean.toFixed(1)}</b><em>m/s · was ${r.vsBase.plazaMean0.toFixed(1)}</em></div></div><p class="note">Strategies in this run: ${[r.strat.podiumH>0&&r.strat.podiumExt>0?`podium ${r.strat.podiumH} m high reaching ${r.strat.podiumExt} m`:'',r.strat.canopy>0?`canopy ${r.strat.canopy} m deep`:'',r.strat.corners!=='sharp'?r.strat.corners+' corners':'',r.strat.shelter>0?Math.round(r.strat.shelter*100)+'% plaza shelter':''].filter(Boolean).join(', ')}. A podium becomes an obstacle at ground level and catches the downwash (up to 80% at 30 m high); a canopy breaks up to 35% of what reaches the entrance; rounded or chamfered corners cut corner-stream speeds by 22% or 15% within 14 m; planting and screens slow the sheltered plaza by up to 40%.</p>`;
    else if(stratActive()) html+=`<p class="warn">Wind strategies are set but this study ran without them. Run the wind study again to see their effect.</p>`;
    else html+=`<p class="empty">No ground-level wind strategies set. Add a podium, canopy, corner treatment or plaza shelter under Strategies and rerun the wind study.</p>`;
    html+=`<h3>Natural ventilation · ${{cross:'cross ventilation',single:'single-sided',stack:'stack'}[SW.vent.mode]}</h3>${N.operable?`<div class="kpi"><div><small>Usable hours</small><b>${fmtI(N.total)}</b><em>of ${fmtI(N.hoursTot)} in the period · ${Math.round(N.total/Math.max(1,N.hoursTot)*100)}%</em></div><div><small>Operable floors</small><b>${N.operable}</b><em>of ${N.nF} · from the façade zones</em></div><div><small>Windows usable up to</small><b>${N.all?'top':(N.limit?'L'+N.limit:'none')}</b><em>${N.all?'gusts stay under the limit':'gusts exceed the limit above; a double skin raises it 1.6×'}</em></div></div>
    <div class="tbl-wrap"><table><thead><tr><th>Month</th><th class="num">Days</th><th class="num">Mean °C</th><th class="num">Air in window</th><th class="num">Vent hours</th></tr></thead><tbody>${inP.map(x=>`<tr><td>${x.m}</td><td class="num">${x.days}</td><td class="num">${x.T.toFixed(1)}</td><td class="num">${Math.round(x.fT*100)}%</td><td class="num">${fmtI(x.vent)}</td></tr>`).join('')}</tbody></table></div>
    <p class="note">Hours when outdoor air sits in the comfort band (${N.adaptive?'ASHRAE 55 adaptive: 17.8 + 0.31 × monthly mean ± 3.5 °C, 80% acceptability, for months averaging 10 °C or more':SW.vent.tmin+' to '+SW.vent.tmax+' °C'}, against the monthly mean with a ±5 °C daily swing) and the wind at each operable floor is usable: cross ventilation needs 0.5 m/s to ${SW.vent.umax} m/s, single-sided only an upper limit, stack ventilation tolerates 20% more. Speeds follow a Rayleigh distribution around the period's rose mean scaled to height; floors count as operable where a façade zone has operable openings. This is the natural-ventilation potential chart of Ladybug and the CBE tools, read from monthly normals.</p>`:'<p class="empty">No façade zone has operable openings. Set "operable windows or vents" on a zone under Design to count ventilation hours.</p>'}
    ${(()=>{ const VT=r.vt; if(!VT||!VT.operable) return ''; return `<h3>ASHRAE 62.1 natural ventilation check</h3><div class="kpi"><div><small>Free opening area</small><b class="${VT.freePct>=4?'ok':'over'}">${VT.freePct.toFixed(1)}%</b><em>of floor served · rule: ≥ 4% · ${VT.meet4} of ${VT.operable} operable floors meet it</em></div><div><small>Floor within 8 m of an opening</small><b class="${VT.within8>=0.9?'ok':''}">${Math.round(VT.within8*100)}%</b><em>of operable floors' area</em></div><div><small>Operable floors</small><b>${VT.operable}</b><em>of ${VT.rows.length}</em></div></div><div class="viz">${floorBars(VT.rows,x=>x.within8,'var(--wind)','Floor within 8 m of an operable opening, per floor',0.9)}</div><p class="note">ASHRAE 62.1's natural ventilation path asks for openable area of at least 4% of the net floor area served, with every point within 8 m (25 ft) of an operable opening; CIBSE AM10's depth rules (2 to 2.5 floor heights single-sided, 5 cross) set the plan layers on the left. Free area is ${Math.round((SW.vent.open||0.1)*100)}% of the glass on operable zones; raise it under Design if the openings are larger.</p>`; })()}
    <h3>Wind on terraces and roofs</h3>${TW.length?`<div class="tbl-wrap"><table><thead><tr><th>Level</th><th class="num">Height</th><th class="num">m²</th><th class="num">Mean</th><th class="num">Gust</th><th>Comfort</th><th>With screens</th></tr></thead><tbody>${TW.map(t=>`<tr><td class="num">L${t.level}</td><td class="num">${t.z.toFixed(0)} m</td><td class="num">${fmtI(t.area)}</td><td class="num">${t.U.toFixed(1)}</td><td class="num">${t.gust.toFixed(1)}</td><td><span class="dot" style="background:${BAND_COL[t.band]}"></span>${BANDS[t.band]}</td><td>${t.screened?`<span class="dot" style="background:${BAND_COL[t.bandS]}"></span>${BANDS[t.bandS]} · ${t.Us.toFixed(1)} m/s`:'<span style="color:var(--muted)">no screen zone</span>'}</td></tr>`).join('')}</tbody></table></div><p class="note">Mean wind at terrace height from the profile, banded on the Lawson scale; a "Terrace wind screens" zone covering the level halves the speed people feel. Terraces above about 60 m need screens for anything beyond strolling.</p>`:'<p class="empty">No terraces over 30 m² on this massing.</p>'}`; }
  setOut('wind',html);
}

/* ---------- report data for the PDF builder ---------- */
function reportData(kind){
  if(kind==='custom') return customReportData();
  const S=LAB.S, fmt=fmtI; const modeName=adv()?'Design development':'Massing';
  if(kind==='sun'){ const r=sunResult, sd=S.impact.sun, D=DATES[sd.date]; if(!r) return null; const yr=r.scope==='period'; const P=r.period, unit=yr&&P.full?'h per year':'h in the period'; const H=r.heat;
    const out={title:'Sun and shadow study'+(yr?' · '+(P.full?'whole year':P.label):''),settings:[['Mode',modeName],['Scope',yr?`${P.full?'Whole year':P.label} (${P.days} days): ${r.months.length} representative days, hourly, weighted by days represented and bright-sunshine fraction`:D.label+', clear sky'],['Study window',`${sd.h0}:00 to ${sd.h1}:00, hourly`],['Geometry',r.raw?'uploaded model as modeled':S.typology==='upload'?'uploaded massing sliced into floors':LAB.TYP[S.typology].name],['Ground resolution','2 m'],['Facade sampling','512 × 512 from the sun, 1.8 m pixels, height per pixel']],
      stats:yr?[[`Ground with ≥ ${r.th[0]} ${unit} more shadow`,fmt(r.a1)+' m²'],[`≥ ${r.th[1]} ${unit}`,fmt(r.a2)+' m²'],[`≥ ${r.th[2]} ${unit}`,fmt(r.a4)+' m²'],[`Plazas and mid-block links ≥ ${r.th[0]} ${unit}`,fmt(r.plaza)+' of '+fmt(r.plazaTot)+' m²'],['Around the transit plaza (40 m radius)',fmt(r.transit)+' m²'],['On the competition parcel',fmt(r.siteOpen)+' m²'],['Sunlight lost by neighbouring façades',fmt(r.lostKWh)+' kWh in the period'],['Direct sun received by the tower',fmt(r.towerKWh)+' kWh in the period']]
        :[['Ground newly shaded ≥ 1 h',fmt(r.a1)+' m²'],['≥ 2 h',fmt(r.a2)+' m²'],['≥ 4 h',fmt(r.a4)+' m²'],['Plazas and mid-block links shaded ≥ 1 h',fmt(r.plaza)+' of '+fmt(r.plazaTot)+' m²'],['Around the transit plaza (40 m radius)',fmt(r.transit)+' m²'],['On the competition parcel',fmt(r.siteOpen)+' m²'],['Sunlight lost by neighbouring façades',fmt(r.lostKWh)+' kWh on a clear day'],['Direct sun received by the tower',fmt(r.towerKWh)+' kWh on a clear day']],
      notes:['Shadows are accumulated from hourly sun positions computed for 49.28° N, 123.12° W with local clock time, rendered on the site model with and without the tower; the difference is the new shadow. The tower footprint is excluded. Roofs of neighbouring buildings are treated like ground.','Façade sunlight is the area of neighbouring façades visible from the sun times clear-sky direct normal irradiance (1353 × 0.7^(AM^0.678) W/m²). Diffuse light and reflections are not included.',yr?'Period weighting uses Vancouver Airport bright-sunshine normals (about 1,930 h a year, 56 h in December to 290 h in July) divided by each month\'s daylight hours.':'Vancouver assesses new shadow on parks and public plazas at the spring and fall equinox between 10:00 and 16:00; use that setting for the policy case.'],
      overlay:yr?`Amber to purple: ${r.th[0]} to ${fmt(Math.max(4,800*P.days/365))}+ hours of additional shadow in the period.`:'Amber to purple: 1 h to '+Math.round(r.hours*0.8)+'+ h of additional shadow.'};
    out.tables=[{title:'Direct sun on the massing',head:['Surface','m²','Sun h/day clear'].concat(yr?['Sun h expected']:[]).concat(['Beam kWh','kWh/m²']),rows:ORI5.map(o=>[NAMES[o],fmt(H.area[o]),H.sunH[o].toFixed(1)].concat(yr?[fmt(H.sunHexp[o])]:[]).concat([fmt(H.by[o]),H.intensity[o].toFixed(1)]))}];
    out.tables.push({title:'Readings',head:['What the massing suggests'],rows:sunReadings(r).map(s=>[s.replace(/<[^>]+>/g,'')])});
    if(yr) out.tables.push({title:'Sample days',head:['Day','Represents','Sunny share','Hours in study','Plaza shaded ≥ 1 h that day','Lost kWh'],rows:r.months.map(m=>[m.m,m.repDays.toFixed(1)+' d',Math.round(m.sf*100)+'%',String(m.hours),fmt(m.plaza)+' m²',fmt(m.lost)])});
    if(adv()){ const A=solarStudy(r); const eunit=r.perDay?'kWh on a clear day':'kWh in the period';
      out.stats.push(['Heat through glazing with devices',fmt(A.shTot)+' '+eunit+' ('+fmt(A.unTot)+' without)'],['Beam blocked by devices',Math.round(A.blocked*100)+'%'],['PV yield',fmt(A.pvTot)+' '+eunit+', '+A.kwpTot.toFixed(0)+' kWp']);
      out.settings.push(['Glass visible transmittance',SW.glaz.vt.toFixed(2)],['Roof PV',`${Math.round(SW.pv.roof*100)}% of roofs and terraces, ${Math.round(SW.pv.eff*100)}% modules, PR ${SW.pv.pr.toFixed(2)}`]);
      out.tables.push({title:'Façade zones',head:['Zone','Strategy','WWR','SHGC','Depth','PV','Openings'],rows:SW.zones.map(z=>[zoneLabel(z),STRATS[z.strat].name,Math.round(z.wwr*100)+'%',z.shgc.toFixed(2),STRATS[z.strat].device||STRATS[z.strat].depthLabel?z.depth.toFixed(1)+' m':'-',z.pv?Math.round(z.pv*100)+'%':'-',z.operable?'operable':'fixed'])});
      out.tables.push({title:'Solar result by façade zone',head:['Zone','Beam on zone kWh','Let through','Through glass kWh','Without devices','Glare h','PV kWh','Daylight aperture'],rows:A.zones.map(Z=>[Z.label,fmt(Z.beam),Math.round(Z.tAvg*100)+'%',fmt(Z.sh),fmt(Z.un),Z.glare.toFixed(0),Z.pvKwh?fmt(Z.pvKwh):'-',Z.aperture.toFixed(2)])});
      if(A.pv.length) out.tables.push({title:'Photovoltaics',head:['Surface','m²','kWp','kWh','kWh/m²'],rows:A.pv.map(x=>[x.name,fmt(x.area),x.kwp.toFixed(0),fmt(x.kwh),x.perM2.toFixed(0)])});
      if(r.daylight){ const DL=r.daylight; out.stats.push(['Daylit floor (sDA proxy, DF ≥ '+(DL.target*100).toFixed(1)+'%)',Math.round(DL.sda*100)+'% (LEED bands 40 / 55 / 75%)'],['Mean daylight factor',(DL.mean*100).toFixed(1)+'%'],['Over-lit floor (DF > 5%)',Math.round(DL.over*100)+'%']); if(r.ase) out.stats.push(['Annual sunlight exposure (1000 lux, 250 h)',Math.round(r.ase.pct*100)+'% of floor (LEED limit 10%)']);
        out.tables.push({title:'Daylight by floor',head:['Level','Daylit share','Mean DF','Over-lit'].concat(r.ase?['ASE']:[]),rows:DL.rows.filter((x,i)=>i%Math.max(1,Math.round(DL.rows.length/24))===0||i===DL.rows.length-1).map(x=>['L'+(x.i+1),Math.round(x.pctLit*100)+'%',(x.mean*100).toFixed(1)+'%',Math.round(x.pctOver*100)+'%'].concat(r.ase?[Math.round((r.ase.rows[x.i]||{pct:0}).pct*100)+'%']:[]))});
        out.notes.push('Daylight factor per floor from eight sight lines to the glass (BRE split-flux, CIE overcast sky, 0.8 m work plane) with the neighbours\' obstruction angle, the zone\'s devices, the glass transmittance and 25% internal reflection; the sDA proxy counts floor with DF above the factor that gives the target lux under a 16,000 lux design sky. ASE sweeps representative days 8:00–18:00 for hours over 1,000 lux of direct sun on the floor, weighted by sunshine share, with no blinds. Early-design readings; LEED documentation needs an hourly Radiance run.'); }
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
  const cpOf=o=>{ const n={N:[0,1],E:[1,0],S:[0,-1],W:[-1,0]}[o]; const d=n[0]*wf.x+n[1]*wf.y; return d>0.5?0.7:(d<-0.5?-0.3:-0.5); };
  const zoneOf=o=>zoneFor(o,lvl); const V=SW.vent, open=V.open||0.1, mode=V.mode;
  const lit=[], litNo=[], vent=[]; let area=0, aLit=0, aLitNo=0, aVent=0, aWithin8=0, maxDepth=0; const edgeLen={N:0,E:0,S:0,W:0}; let opIn=0, opOut=0, cpIn=null, cpOut=null;
  for(const e of edgesOf(f)) edgeLen[e.o]+=e.L;
  let boost=1; for(const o of ORI){ const z=zoneOf(o); if(z.operable) boost=Math.max(boost,STRATS[z.strat].ventBoost||1); } const umax=V.umax*boost; const windowsOpen=Uz*1.8<=umax;
  // distance to the nearest operable opening (cells), for the CIBSE depth rules and the ASHRAE 62.1 8 m rule
  const near=new Int16Array(m.nx*m.ny).fill(-1); { const q=[]; for(let iy=0;iy<m.ny;iy++) for(let ix=0;ix<m.nx;ix++){ if(!solid(ix,iy)) continue; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ if(!solid(ix+dx,iy+dy)){ if(zoneOf(cardinalOf(dx,dy,f.rot)).operable){ near[iy*m.nx+ix]=1; q.push(ix,iy); break; } } } }
    let head=0; while(head<q.length){ const ix=q[head++], iy=q[head++]; const d=near[iy*m.nx+ix]; if(d>=30) continue; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const jx=ix+dx,jy=iy+dy; if(!solid(jx,jy)) continue; const x=m.x0+jx+0.5,y=m.y0+jy+0.5; if(inCore(x,y)) continue; const k=jy*m.nx+jx; if(near[k]<0){ near[k]=d+1; q.push(jx,jy); } } } }
  const limSingle=Math.round(2.5*hh), limStack=12, limCross=Math.round(5*hh);
  for(let iy=0;iy<m.ny;iy++) for(let ix=0;ix<m.nx;ix++){ if(!solid(ix,iy)) continue; const x=m.x0+ix+0.5, y=m.y0+iy+0.5; if(inCore(x,y)) continue; area++; const nd=near[iy*m.nx+ix]; if(nd>0&&nd<=8) aWithin8++;
    if(sunUp){ const ex=walk(ix,iy,sl.x,sl.y); if(ex){ const z=zoneOf(ex.o); const sp=(1-z.wwr)*hh, gh=hh-sp; const hz=ex.D*Math.tan(p.alt); if(hz>=sp&&hz<=sp+gh){ aLitNo++; litNo.push(ix,iy); const pr=stratParts(z,p.alt,azDeg,FACE_AZ[ex.o],gh); if(hz<=sp+gh*(1-pr.cut)&&pr.dim>0.02){ aLit++; lit.push(ix,iy,pr.dim); if(ex.D>maxDepth) maxDepth=ex.D; } } } }
    if(windowsOpen){ if(mode==='cross'){ const back=walk(ix,iy,-fl.x,-fl.y), fwd=walk(ix,iy,fl.x,fl.y); if(back&&fwd&&back.D<=limCross){ const zi=zoneOf(back.o), zo=zoneOf(fwd.o); if(zi.operable&&zo.operable&&cpOf(back.o)>cpOf(fwd.o)){ aVent++; vent.push(ix,iy); cpIn=cpOf(back.o); cpOut=cpOf(fwd.o); } } }
      else if(nd>0&&nd<=(mode==='stack'?limStack:limSingle)){ aVent++; vent.push(ix,iy); } } }
  let ghMean=0, gN=0; for(const o of ORI){ const z=zoneOf(o); if(!z.operable||!edgeLen[o]) continue; const gh=hh*z.wwr; ghMean+=gh; gN++; const A=edgeLen[o]*gh*open; const cp=cpOf(o); if(cp>0) opIn+=A; else opOut+=A; }
  ghMean=gN?ghMean/gN:2; const freeArea=opIn+opOut, freePct=area?freeArea/area*100:0;
  let ach=0, Q=0, Qw=0, Qs=0; const vol=area*hh; const dT=V.dT||3, Tm=283;
  if(windowsOpen&&vol>0){ if(mode==='cross'&&opIn>0&&opOut>0){ const Aeff=1/Math.sqrt(1/(opIn*opIn)+1/(opOut*opOut)); Qw=0.6*Aeff*Uz*Math.sqrt(Math.max(0.2,(cpIn==null?0.7:cpIn)-(cpOut==null?-0.3:cpOut))); } else if(mode!=='cross'&&freeArea>0){ Qw=0.025*freeArea*Uz; Qs=0.6*freeArea/3*Math.sqrt(9.81*(mode==='stack'?hh*3:ghMean)*dT/Tm); } Q=Math.sqrt(Qw*Qw+Qs*Qs); ach=Q*3600/vol; }
  return {f,lvl,hh,area,aLit,aLitNo,aVent,aWithin8,lit,litNo,vent,maxDepth,sunUp,p,azDeg,sl,fl,wdir,Uz,windowsOpen,umax,mode,ach,Q,Qw,Qs,opIn,opOut,freeArea,freePct,edgeLen,cc,ch,open,limSingle,limCross,limStack};
}
/* ---------- daylight: a split-flux daylight factor per cell from eight sight lines to the glass, obstructed by neighbours and the zone's device; ASE from the annual sun sweep ---------- */
const DL_E=16000; // design diffuse horizontal illuminance (lux) behind the sDA proxy: 300 lux ≈ DF 1.9% in Vancouver's occupied hours
function obstructionAngles(f){ if(!siteRaster) buildSiteRaster(); const out={}; const z=f.z+0.8; for(const o of ORI){ const n={N:[0,1],E:[1,0],S:[0,-1],W:[-1,0]}[o]; let hs=0,ds=0,c=0; for(const b of siteRaster.bld){ const dx=b.x-f.cx, dy=b.y-f.cy, d=Math.hypot(dx,dy); if(d<15||d>160) continue; if((dx*n[0]+dy*n[1])/d<0.6) continue; hs+=b.top; ds+=d; c++; } const hn=c?hs/c:0, dn=c?Math.max(25,ds/c):60; out[o]=Math.atan(Math.max(0,hn-z)/dn); } return out; }
function dfFactor(z){ const st=STRATS[z.strat], D=z.depth; let k=1; switch(z.strat){ case 'louvres': k=Math.max(0.2,1-0.6*D/0.5); break; case 'fins': k=Math.max(0.4,1-0.4*D/1.5); break; case 'eggcrate': k=Math.max(0.15,(1-0.6*D/0.5)*(1-0.4*D/1.5)); break; case 'punched': k=0.75*Math.max(0.6,1-0.3*D/1.8); break; case 'doubleskin': k=0.8; break; case 'greenwall': k=1; default: k=1; } return {k,shelf:z.strat==='lightshelf',top:(st.device&&(z.strat==='overhang'||z.strat==='balcony'||z.strat==='lightshelf'))?D:0}; }
function daylightFloor(f,step){
  step=step||1; const S=LAB.S, m=f.mask, lvl=f.i+1, hh=f.h-GAP, W2=f.w/2, D2=f.d/2; const cc=LAB.toLocal(f,S.posX,S.posY), ch=f.core/2; const tau=SW.glaz.vt*0.9;
  const solid=(cx,cy)=>cx>=0&&cy>=0&&cx<m.nx&&cy<m.ny&&(m.x0+cx+0.5<=W2)&&(m.y0+cy+0.5<=D2)&&!!m.cells[cy*m.nx+cx]; const inCore=(x,y)=>Math.abs(x-cc.x)<=ch&&Math.abs(y-cc.y)<=ch;
  const obs=obstructionAngles(f); const dirs=[]; for(let i=0;i<8;i++){ const a=i*Math.PI/4; dirs.push([Math.cos(a),Math.sin(a)]); }
  const df=new Float32Array(m.nx*m.ny); let sum=0, n=0, lit=0, over=0; const target=(SW.dl&&SW.dl.target||300)/DL_E;
  for(let iy=0;iy<m.ny;iy+=step) for(let ix=0;ix<m.nx;ix+=step){ if(!solid(ix,iy)) continue; const x0=m.x0+ix+0.5, y0=m.y0+iy+0.5; if(inCore(x0,y0)) continue; let sc=0;
    for(const [dx,dy] of dirs){ let x=x0,y=y0,px=ix,py=iy,hit=null; for(let k=1;k<160;k++){ x+=dx*0.5; y+=dy*0.5; if(inCore(x,y)) break; const cx=Math.floor(x-m.x0), cy=Math.floor(y-m.y0); if(!solid(cx,cy)){ let nx=cx!==px?Math.sign(cx-px):0, ny=cy!==py?Math.sign(cy-py):0; if((nx&&ny)||(!nx&&!ny)){ if(Math.abs(dx)>=Math.abs(dy)){ nx=Math.sign(dx); ny=0; } else { ny=Math.sign(dy); nx=0; } } hit={D:k*0.5,o:cardinalOf(nx,ny,f.rot)}; break; } px=cx; py=cy; }
      if(!hit) continue; const z=zoneFor(hit.o,lvl); const sp=(1-z.wwr)*hh, H=hh; const d=Math.max(0.5,hit.D); const F=dfFactor(z); const sill=Math.max(0,sp-0.8), head=Math.max(sill+0.1,H-0.8);
      const a1=Math.max(Math.atan(sill/d),obs[hit.o]), a2=Math.atan(head/(d+F.top)); if(a2<=a1) continue; let v=(Math.sin(a2)**2-Math.sin(a1)**2)/8*tau*F.k; if(F.shelf) v*=d<4?0.9:1.15; sc+=v; }
    const v=sc*1.25; df[iy*m.nx+ix]=v; sum+=v; n++; if(v>=target) lit++; if(v>0.05) over++; }
  return {df,step,mean:n?sum/n:0,pctLit:n?lit/n:0,pctOver:n?over/n:0,cells:n,target};
}
function aseFloor(f,coarse){
  const S=LAB.S, m=f.mask, lvl=f.i+1, hh=f.h-GAP, W2=f.w/2, D2=f.d/2; const cc=LAB.toLocal(f,S.posX,S.posY), ch=f.core/2; const tau=SW.glaz.vt;
  const solid=(cx,cy)=>cx>=0&&cy>=0&&cx<m.nx&&cy<m.ny&&(m.x0+cx+0.5<=W2)&&(m.y0+cy+0.5<=D2)&&!!m.cells[cy*m.nx+cx]; const inCore=(x,y)=>Math.abs(x-cc.x)<=ch&&Math.abs(y-cc.y)<=ch;
  const PI=periodInfo(); const nS=coarse?6:12, days=[]; for(let k=0;k<nS;k++){ const doy=((PI.d0-1+Math.floor((k+0.5)*PI.days/nS))%365)+1; const mo=monthOf(doy); days.push({doy,tz:CLIMATE.tz[mo],w:PI.days/nS*CLIMATE.sunshine[mo]/(CLIMATE.daylight[mo]*CLIMATE.days[mo])}); }
  const suns=[]; for(const d of days) for(let h=8;h<=18;h+=coarse?2:1){ const p=sunPos(d.doy,h,d.tz); if(p.alt<0.05) continue; const E=dni(p.alt)*Math.sin(p.alt)*105; if(E<1000) continue; const c=Math.cos(-f.rot), s=Math.sin(-f.rot); const sw={x:Math.sin(p.az),y:Math.cos(p.az)}; suns.push({alt:p.alt,az:p.az*180/Math.PI,E,w:d.w*(coarse?2:1),dx:sw.x*c-sw.y*s,dy:sw.x*s+sw.y*c}); }
  const step=coarse?2:1; const hrs=new Float32Array(m.nx*m.ny); let n=0, over=0;
  for(let iy=0;iy<m.ny;iy+=step) for(let ix=0;ix<m.nx;ix+=step){ if(!solid(ix,iy)) continue; const x0=m.x0+ix+0.5, y0=m.y0+iy+0.5; if(inCore(x0,y0)) continue; n++; let H=0;
    for(const su of suns){ let x=x0,y=y0,px=ix,py=iy,hit=null; for(let k=1;k<200;k++){ x+=su.dx*0.5; y+=su.dy*0.5; if(inCore(x,y)) break; const cx=Math.floor(x-m.x0), cy=Math.floor(y-m.y0); if(!solid(cx,cy)){ let nx=cx!==px?Math.sign(cx-px):0, ny=cy!==py?Math.sign(cy-py):0; if((nx&&ny)||(!nx&&!ny)){ if(Math.abs(su.dx)>=Math.abs(su.dy)){ nx=Math.sign(su.dx); ny=0; } else { ny=Math.sign(su.dy); nx=0; } } hit={D:k*0.5,o:cardinalOf(nx,ny,f.rot)}; break; } px=cx; py=cy; }
      if(!hit) continue; const z=zoneFor(hit.o,lvl); const sp=(1-z.wwr)*hh, gh=hh-sp; const hz=hit.D*Math.tan(su.alt); if(hz<sp||hz>sp+gh) continue; const pr=stratParts(z,su.alt,su.az,FACE_AZ[hit.o],gh); if(hz>sp+gh*(1-pr.cut)) continue; if(su.E*tau*pr.dim>=1000) H+=su.w; }
    hrs[iy*m.nx+ix]=H; if(H>=250) over++; }
  return {hrs,step,pctOver:n?over/n:0,cells:n,positions:suns.length,period:PI};
}
let dlCache={key:null,rows:null}, aseTowerRes=null, aseBusy=false;
function dlKey(){ const floors=LAB.floors; return JSON.stringify([SW.zones,SW.glaz.vt,SW.dl,floors.length,floors.map(f=>[f.w,f.d,f.h,f.area|0]),LAB.site&&LAB.site.meta&&LAB.site.meta.source,LAB.S.posX,LAB.S.posY,LAB.S.rotDeg,LAB.S.site.future]); }
let dlTimer=null;
function daylightTowerCached(){ if(!LAB.floors) return null; const key=dlKey(); if(dlCache.key===key) return dlCache.rows; clearTimeout(dlTimer); dlTimer=setTimeout(()=>{ try{ daylightTower(); if(LAB.S.impact.mode==='sun') renderSun(sunResult); }catch(e){ console.error(e); } },280); return null; }
function daylightTower(){
  const floors=LAB.floors; if(!floors) return null; const key=dlKey();
  if(dlCache.key===key) return dlCache.rows;
  const rows=floors.map(f=>{ const r=daylightFloor(f,2); return {i:f.i,area:f.area,mean:r.mean,pctLit:r.pctLit,pctOver:r.pctOver,target:r.target}; });
  const A=rows.reduce((s,r)=>s+r.area,0); const sda=rows.reduce((s,r)=>s+r.pctLit*r.area,0)/Math.max(1,A), over=rows.reduce((s,r)=>s+r.pctOver*r.area,0)/Math.max(1,A), mean=rows.reduce((s,r)=>s+r.mean*r.area,0)/Math.max(1,A);
  dlCache={key,rows:{rows,sda,over,mean,target:rows[0]?rows[0].target:0.019}}; return dlCache.rows;
}
async function aseTower(progress){
  const floors=LAB.floors; if(!floors||aseBusy) return; aseBusy=true; const rows=[]; try{ for(const f of floors){ if(progress) progress(`Annual sun · L${f.i+1} of ${floors.length}`); await new Promise(r=>setTimeout(r,0)); const r=aseFloor(f,true); rows.push({i:f.i,area:f.area,pct:r.pctOver}); } }finally{ aseBusy=false; }
  const A=rows.reduce((s,r)=>s+r.area,0); aseTowerRes={rows,pct:rows.reduce((s,r)=>s+r.pct*r.area,0)/Math.max(1,A),key:dlCache.key,period:periodInfo().label}; return aseTowerRes;
}
function floorBars(rows,get,color,label,threshold){ const W=380,H=90,L=28,R=8,T=8,B=16; const n=rows.length, bw=(W-L-R)/n; let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}"><style>text{font-family:var(--font-m);font-size:8.5px;fill:var(--muted)}</style>`; for(const v of [0,0.5,1]){ const y=T+(H-T-B)*(1-v); s+=`<line x1="${L}" x2="${W-R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--chart-grid)"/><text x="${L-3}" y="${(y+3).toFixed(1)}" text-anchor="end">${Math.round(v*100)}%</text>`; } if(threshold!=null){ const y=T+(H-T-B)*(1-threshold); s+=`<line x1="${L}" x2="${W-R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--warn)" stroke-dasharray="3 2"/>`; } rows.forEach((r,i)=>{ const v=Math.max(0,Math.min(1,get(r))); const h=(H-T-B)*v; s+=`<rect x="${(L+i*bw).toFixed(2)}" y="${(T+(H-T-B)-h).toFixed(1)}" width="${Math.max(0.5,bw-0.6).toFixed(2)}" height="${h.toFixed(1)}" fill="${color}"><title>L${r.i+1}: ${Math.round(v*100)}%</title></rect>`; }); s+=`<text x="${L}" y="${H-4}">L1</text><text x="${W-R}" y="${H-4}" text-anchor="end">L${n}</text>`; return s+'</svg>'; }
const rampDF=v=>{ const t=Math.max(0,Math.min(1,v/0.05)); const a=[52,76,110], b=[222,228,236], c=[217,144,31]; const col=t<0.4?lerpC(a,b,t/0.4):lerpC(b,c,(t-0.4)/0.6); return `rgb(${col.map(Math.round).join(',')})`; };
const rampASE=v=>{ const t=Math.max(0,Math.min(1,v/500)); const a=[240,224,190], b=[184,54,43]; const col=lerpC(a,b,t); return `rgb(${col.map(Math.round).join(',')})`; };
let planAse={key:null,res:null};
function planSVG(R,layer,extra){
  const f=R.f, m=f.mask; const Rr=Math.hypot(f.w,f.d)/2+4; const VW=380, VH=300; const sc=Math.min((VW-70)/(2*Rr),(VH-40)/(2*Rr)); const cx0=VW/2-20, cy0=VH/2; const rotDeg=f.rot*180/Math.PI;
  let s=`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Floor plan of level ${R.lvl}"><style>text{font-family:var(--font-m);font-size:9px;fill:var(--muted)}</style>`;
  s+=`<g transform="translate(${cx0},${cy0}) scale(1,-1) rotate(${rotDeg.toFixed(2)}) scale(${sc.toFixed(4)})">`;
  for(const lp of LAB.maskLoops(f)) s+=`<path d="M${lp.pts.map(q=>q[0].toFixed(2)+','+q[1].toFixed(2)).join('L')}Z" fill="${lp.outer?'var(--panel)':'var(--panel2)'}" stroke="none"/>`;
  const cell=(ix,iy,fill,op)=>`<rect x="${(m.x0+ix).toFixed(1)}" y="${(m.y0+iy).toFixed(1)}" width="${extra&&extra.step||1}" height="${extra&&extra.step||1}" fill="${fill}"${op!=null?` fill-opacity="${op}"`:''}/>`;
  if(layer==='sun'){ for(let k=0;k<R.litNo.length;k+=2) s+=`<rect x="${(m.x0+R.litNo[k]).toFixed(1)}" y="${(m.y0+R.litNo[k+1]).toFixed(1)}" width="1" height="1" fill="none" stroke="var(--sun)" stroke-opacity="0.35" stroke-width="0.15"/>`; for(let k=0;k<R.lit.length;k+=3) s+=cell(R.lit[k],R.lit[k+1],'var(--sun)',(0.3+0.6*R.lit[k+2]).toFixed(2)); }
  else if(layer==='df'&&extra){ const d=extra.df, st=extra.step; for(let iy=0;iy<m.ny;iy+=st) for(let ix=0;ix<m.nx;ix+=st){ const v=d[iy*m.nx+ix]; if(v>0) s+=cell(ix,iy,rampDF(v)); } }
  else if(layer==='ase'&&extra){ const d=extra.hrs, st=extra.step; for(let iy=0;iy<m.ny;iy+=st) for(let ix=0;ix<m.nx;ix+=st){ const v=d[iy*m.nx+ix]; if(v>10) s+=cell(ix,iy,rampASE(v)); } }
  else if(layer==='air'){ for(let k=0;k<R.vent.length;k+=2) s+=cell(R.vent[k],R.vent[k+1],'var(--wind)','0.28');
    if(R.mode==='cross'&&R.vent.length){ for(let k=0;k<R.vent.length;k+=2){ const ix=R.vent[k], iy=R.vent[k+1]; if(ix%4!==1||iy%4!==1) continue; const x=m.x0+ix+0.5, y=m.y0+iy+0.5, L=1.6, ax=x-R.fl.x*L/2, ay=y-R.fl.y*L/2, bx=x+R.fl.x*L/2, by=y+R.fl.y*L/2; const px=-R.fl.y*0.45, py=R.fl.x*0.45; s+=`<path d="M${ax.toFixed(2)},${ay.toFixed(2)}L${bx.toFixed(2)},${by.toFixed(2)}M${(bx-R.fl.x*0.6+px).toFixed(2)},${(by-R.fl.y*0.6+py).toFixed(2)}L${bx.toFixed(2)},${by.toFixed(2)}L${(bx-R.fl.x*0.6-px).toFixed(2)},${(by-R.fl.y*0.6-py).toFixed(2)}" fill="none" stroke="var(--wind)" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round"/>`; } } }
  for(const e of edgesOf(f)){ const z=zoneFor(e.o,R.lvl); const a=[e.mx-e.ux*e.L/2,e.my-e.uy*e.L/2], b=[e.mx+e.ux*e.L/2,e.my+e.uy*e.L/2]; s+=`<line x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${b[0].toFixed(2)}" y2="${b[1].toFixed(2)}" stroke="${FACE_COL[e.o]}" stroke-width="${z.operable?0.9:0.5}" stroke-dasharray="${z.operable?'none':'1.2 0.8'}"><title>${NAMES[e.o]} · ${STRATS[z.strat].name}${z.operable?' · operable':''}</title></line>`; }
  const rel=(LAB.S.rotDeg*Math.PI/180-f.rot)*180/Math.PI; s+=`<rect x="${(R.cc.x-R.ch).toFixed(2)}" y="${(R.cc.y-R.ch).toFixed(2)}" width="${(2*R.ch).toFixed(2)}" height="${(2*R.ch).toFixed(2)}" transform="rotate(${rel.toFixed(2)} ${R.cc.x.toFixed(2)} ${R.cc.y.toFixed(2)})" fill="var(--core)" fill-opacity="0.55"/>`;
  s+=`</g>`;
  const ax=VW-32, ay=34; s+=`<line x1="${ax}" y1="${ay+14}" x2="${ax}" y2="${ay-10}" stroke="var(--ink)" stroke-width="1"/><path d="M${ax-4},${ay-4}L${ax},${ay-12}L${ax+4},${ay-4}" fill="var(--ink)"/><text x="${ax}" y="${ay+26}" text-anchor="middle">N</text>`;
  if(layer==='sun'&&R.sunUp){ const sx=cx0+Math.sin(R.p.az)*(Rr*sc+14), sy=cy0-Math.cos(R.p.az)*(Rr*sc+14); s+=`<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="6" fill="var(--sun)"/><line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${(cx0+Math.sin(R.p.az)*(Rr*sc)).toFixed(1)}" y2="${(cy0-Math.cos(R.p.az)*(Rr*sc)).toFixed(1)}" stroke="var(--sun)" stroke-width="1.5"/>`; }
  if(layer==='air'){ const wa=R.wdir*Math.PI/180; const wx=cx0+Math.sin(wa)*(Rr*sc+20), wy=cy0-Math.cos(wa)*(Rr*sc+20), tx=cx0+Math.sin(wa)*(Rr*sc+4), ty=cy0-Math.cos(wa)*(Rr*sc+4); const dx=tx-wx, dy=ty-wy, L=Math.hypot(dx,dy)||1, ux=dx/L, uy=dy/L; s+=`<line x1="${wx.toFixed(1)}" y1="${wy.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="var(--wind)" stroke-width="2"/><path d="M${(tx-ux*6-uy*4).toFixed(1)},${(ty-uy*6+ux*4).toFixed(1)}L${tx.toFixed(1)},${ty.toFixed(1)}L${(tx-ux*6+uy*4).toFixed(1)},${(ty-uy*6-ux*4).toFixed(1)}" fill="var(--wind)"/>`; }
  if(layer==='df'||layer==='ase'){ const x0=VW-60, y0=VH-70; for(let i=0;i<24;i++){ const t=i/23; s+=`<rect x="${x0}" y="${(y0+46-i*2).toFixed(1)}" width="10" height="2.1" fill="${layer==='df'?rampDF(t*0.05):rampASE(t*500)}"/>`; } s+=`<text x="${x0+13}" y="${y0+50}">${layer==='df'?'0':'0 h'}</text><text x="${x0+13}" y="${y0+2}">${layer==='df'?'5%+':'500 h+'}</text>${layer==='df'?`<text x="${x0+13}" y="${y0+26}">2%</text>`:`<text x="${x0+13}" y="${y0+26}">250</text>`}`; }
  s+=`<text x="8" y="${VH-8}">L${R.lvl} · ${f.w.toFixed(0)} × ${f.d.toFixed(0)} m · ${fmtI(R.area)} m² floor</text>`;
  return s+'</svg>';
}
const LAYERS=[['sun','Sun now'],['df','Daylight factor'],['ase','Annual sun exposure'],['air','Air paths']];
function renderPlan(){
  const host=$('plan'); if(!adv()||!LAB.floors){ $('plan-block').hidden=true; return; } $('plan-block').hidden=false; if(!document.getElementById('plan-slot')) setOut('sun',sections.sun);
  const nF=LAB.floors.length, L=planLevel(); const inp=$('plan-level'); inp.max=nF; inp.value=L; const f=LAB.floors[L-1]; const R=planStudy(f); const layer=SW.planLayer||'sun';
  const chips=$('plan-layers'); chips.innerHTML=LAYERS.map(([k,n])=>`<button type="button" class="chip" data-layer="${k}" aria-pressed="${k===layer}">${n}</button>`).join(''); chips.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ SW.planLayer=b.dataset.layer; persist(); renderPlan(); }));
  const sd=LAB.S.impact.sun, Dt=DATES[sd.date]; const st=(k,v)=>`<div class="stat"><b>${v}</b><small>${k}</small></div>`; const pct=v=>R.area?Math.round(v/R.area*100)+'%':'–'; let extra=null, legend='', stats='', note='';
  const faces=ORI.map(o=>`<span><i style="background:${FACE_COL[o]}"></i>${NAMES[o]} face</span>`).join('')+'<span>Solid edge: operable · dashed: fixed</span>';
  if(layer==='sun'){ legend=`<span><i style="background:var(--sun)"></i>Sun on the floor with devices</span><span><i style="background:none;border:1.5px solid var(--sun)"></i>Without devices</span>`+faces;
    stats=st('Sunlit floor · with devices',R.sunUp?fmtI(R.aLit)+' m² <em>'+pct(R.aLit)+'</em>':'sun below horizon')+st('Without devices',R.sunUp?fmtI(R.aLitNo)+' m² <em>'+pct(R.aLitNo)+'</em>':'–')+st('Sun patch reaches',R.sunUp&&R.aLit?R.maxDepth.toFixed(1)+' m <em>from the glass</em>':'–')+st('Sun',R.sunUp?(R.p.alt*180/Math.PI).toFixed(0)+'° high · '+R.azDeg.toFixed(0)+'° az':'below horizon');
    note=`${Dt.label}, ${fmtHour(sd.hour)}. Each floor cell is traced back toward the sun to the glass it would see; it is lit where the ray passes the window between sill and head, dimmed or cut by that zone's device. The core is the only interior obstruction. Move the hour slider on the Sun tab to animate it.`; }
  else if(layer==='df'){ extra=daylightFloor(f,1); const tgt=(extra.target*100).toFixed(1); legend=`<span><i style="background:${rampDF(0.005)}"></i>DF under 1%</span><span><i style="background:${rampDF(0.02)}"></i>2% · well daylit</span><span><i style="background:${rampDF(0.05)}"></i>5%+ · over-lit</span>`+faces;
    stats=st('Daylit floor · sDA proxy',Math.round(extra.pctLit*100)+'% <em>DF ≥ '+tgt+'% ≈ '+(SW.dl&&SW.dl.target||300)+' lux</em>')+st('Mean daylight factor',(extra.mean*100).toFixed(1)+'%')+st('Over-lit · DF > 5%',Math.round(extra.pctOver*100)+'%')+st('LEED v4.1 reading',extra.pctLit>=0.75?'3 points band <em>≥ 75%</em>':extra.pctLit>=0.55?'2 points band <em>≥ 55%</em>':extra.pctLit>=0.40?'1 point band <em>≥ 40%</em>':'below 40%');
    note=`Daylight factor (CIE overcast sky) at a 0.8 m work plane: each cell looks along eight sight lines to the glass; the sky seen between sill and head, above the neighbours' obstruction angle and below the zone's overhang or balcony, gives the sky component (BRE split-flux), reduced by the glass transmittance ${SW.glaz.vt.toFixed(2)}, louvres, fins or reveals, with 25% added for internal reflection. The sDA proxy counts area with DF ≥ ${tgt}%, which is ${SW.dl&&SW.dl.target||300} lux under a ${fmtI(DL_E)} lux design sky, Vancouver's typical occupied-hour diffuse light; LEED's own sDA300/50% needs an hourly Radiance run. Light shelves lower the DF near the glass and raise it deeper in.`; }
  else if(layer==='ase'){ const key=JSON.stringify([f.i,SW.zones,SW.glaz.vt,nF,LAB.S.impact.period]); if(planAse.key!==key){ planAse={key,res:aseFloor(f,false)}; } extra=planAse.res; legend=`<span><i style="background:${rampASE(50)}"></i>Under 100 h of direct sun</span><span><i style="background:${rampASE(250)}"></i>250 h · ASE threshold</span><span><i style="background:${rampASE(500)}"></i>500 h+</span>`+faces;
    stats=st('ASE 1000 lux / 250 h',Math.round(extra.pctOver*100)+'% <em>of floor · LEED asks ≤ 10%</em>')+st('Sun positions swept',extra.positions+' <em>12 days × 8:00–18:00</em>')+st('Period',extra.period.full?'whole year':extra.period.label)+st('Blinds','not modeled <em>devices only</em>');
    note=`Annual sunlight exposure in the manner of IES LM-83: hours when direct sun on the floor exceeds 1,000 lux (DNI × sin altitude × 105 lm/W × glass VT × device transmission), over 8:00–18:00 on representative days across the period, weighted by Vancouver's sunshine share. LEED v4.1 flags area over 250 h; above 10% of the floor, glare control must be shown. Blinds are not modeled, so this is the façade's own performance.`; }
  else { legend=`<span><i style="background:var(--wind);opacity:.6"></i>Ventilated by the wind</span>`+faces;
    stats=st('Ventilated floor',R.windowsOpen?fmtI(R.aVent)+' m² <em>'+pct(R.aVent)+'</em>':'windows closed')+st('Air changes',R.windowsOpen&&R.ach>0?R.ach.toFixed(1)+' /h <em>wind '+R.Qw.toFixed(1)+(R.Qs?' + stack '+R.Qs.toFixed(1):'')+' m³/s</em>':'–')+st('Within 8 m of an opening',pct(R.aWithin8)+' <em>ASHRAE 62.1 zone</em>')+st('Free opening area',R.freePct.toFixed(1)+'% of floor <em>'+(R.freePct>=4?'meets':'below')+' the 4% rule</em>')+st('Wind at this level',R.Uz.toFixed(1)+' m/s <em>from '+R.wdir+'°'+(R.windowsOpen?'':' · gusts over '+R.umax.toFixed(0)+' m/s')+'</em>')+st('Depth rule',R.mode==='cross'?'5 H = '+R.limCross+' m <em>cross</em>':R.mode==='single'?'2.5 H = '+R.limSingle+' m <em>single-sided</em>':'12 m <em>stack</em>');
    note=`${R.mode==='cross'?'Cross ventilation (CIBSE AM10): a cell is ventilated when air can enter through an operable windward face (Cp +0.7) and leave through an operable side or leeward face (Cp −0.5 / −0.3) within five floor heights of the inlet, without meeting the core. Flow Q = 0.6 · A · U · √ΔCp.':R.mode==='single'?'Single-sided ventilation (AM10): cells within 2.5 floor heights of an operable face. Flow combines wind (0.025 · A · U) and stack (BS 5925, ΔT '+(SW.vent.dT||3)+' K over the opening height).':'Stack ventilation through atria or sky gardens: cells within 12 m of an operable face; flow combines wind and a three-storey stack.'} Free opening area is ${Math.round(R.open*100)}% of the glass on operable zones; ASHRAE 62.1 asks for openings of at least 4% of the floor served, within 8 m of every point. The wind is the ${LAB.S.impact.wind.annual?'dominant sector of the period':'current case'} scaled to this height. Interior partitions are not modeled.`; }
  host.innerHTML=planSVG(R,layer,extra); $('plan-legend').innerHTML=legend; $('plan-stats').innerHTML=stats; $('plan-note').textContent=note;
}

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
  else { el.className='ramp'; el.innerHTML=`<div class="bar"></div><div class="lbls"><span>No overlay · choose Sun or Wind</span><span></span></div>`; }
}
/* ---------- LEED v4.1 scorecard (Design development) ---------- */
function leedCard(r,w){
  const rows=[]; const st=(c,t)=>`<span class="status ${c}">${t}</span>`;
  if(r&&r.daylight){ const s=r.daylight.sda, pts=s>=0.75?3:(s>=0.55?2:(s>=0.40?1:0)); rows.push(['EQ Daylight · Option 1','sDA300/50% (proxy)',Math.round(s*100)+'% of floor','40 / 55 / 75% → 1 / 2 / 3 points',pts?st('ok',pts+' pt'+(pts>1?'s':'')):st('bad','0 pts')]);
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
const REP_SECTIONS=[['summary','Summary and settings',true],['shadow','Shadow on the ground and plazas',true],['facade','Sun on the façades and solar heat',true],['efficiency','Massing efficiency · form metrics',true],['daylight','Daylight · sDA and ASE (Design development)',true],['wind','Pedestrian wind comfort',true],['vent','Natural ventilation and terraces (Design development)',true],['energy','Energy model · TEUI, TEDI, GHGI (Design development)',true],['plans','Floor plans (Design development)',true],['method','Method and assumptions',true]];
const REP_LAYERS=[['sun','Sun now'],['df','Daylight factor'],['ase','Annual sun exposure'],['air','Air paths']];
function repDefaults(){ const o={title:'',author:'',levels:'',sections:{},layers:{sun:true,df:true,ase:true,air:true}}; for(const [k,,d] of REP_SECTIONS) o.sections[k]=d; return o; }
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
    if(adv()&&S.sections.plans&&LAB.floors){ const layers=REP_LAYERS.filter(([k])=>S.layers[k]); const rows=[]; const saved=SW.planLayer;
      for(const L of reportLevels()){ status(`Drawing level ${L}…`); await new Promise(r=>setTimeout(r,10)); const f=LAB.floors[L-1]; const R=planStudy(f); const cells=[];
        for(const [k,n] of layers){ let extra=null; if(k==='df') extra=daylightFloor(f,1); else if(k==='ase') extra=aseFloor(f,true); const svg=planSVG(R,k,extra); try{ const url=await svgToJpeg(svg,760,600); cells.push({url,w:760,h:600,caption:n+(k==='sun'?' · '+DATES[LAB.S.impact.sun.date].label+' '+fmtHour(LAB.S.impact.sun.hour):'')}); }catch(e){ console.warn(e); } }
        rows.push({label:'Level '+L+' · '+fmtI(R.area)+' m²',cells}); }
      SW.planLayer=saved; if(rows.length) customExtra.grids.push({title:'Floor plans · sun, daylight and air inside',cols:2,caption:'Each plan is drawn north up with the core; edges are coloured by face and solid where the zone is operable.',rows}); }
    status('Building the PDF…'); await LAB.report.make('custom'); status('');
  }catch(e){ console.error(e); status('Report failed: '+(e.message||e)); }
  finally{ b.disabled=false; }
}
function customReportData(){
  const S=SW.report; const sun=sunResult?reportData('sun'):null, wind=windResult?reportData('wind'):null; const canEff=S.sections.efficiency&&LAB.energy&&LAB.floors, canEn=adv()&&S.sections.energy&&LAB.energy&&LAB.floors; if(!sun&&!wind&&!canEff&&!canEn) return null;
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
  if(canEff){ try{ const F=LAB.energy.formReportData(); out.stats.push(...F.stats.map(x=>['Form · '+x[0],x[1]])); if(S.sections.summary) out.settings.push(...F.settings.filter(x=>/Reference|Typical/.test(x[0])).map(x=>['Form · '+x[0],x[1]])); out.tables.push(...F.tables); if(want('method')) out.notes.push(...F.notes.slice(0,3)); }catch(e){ console.error(e); } }
  if(canEn){ try{ const En=LAB.energy.reportData(); out.stats.push(...En.stats.map(x=>['Energy · '+x[0],x[1]])); if(S.sections.summary) out.settings.push(...En.settings.map(x=>['Energy · '+x[0],x[1]])); out.charts.push({svg:En.chart,title:'Monthly energy by end use'}); out.tables.push(...En.tables); if(want('method')) out.notes.push(...En.notes); }catch(e){ console.error(e); } }
  if(!S.sections.summary) out.settings=out.settings.slice(0,3);
  return out;
}
/* ---------- hooks and boot ---------- */
function autoRun(n){ if(!SW||sunResult||busy) return; if(!LAB.site&&n<10){ setTimeout(()=>autoRun(n+1),500); return; } if(LAB.S.impact.mode==='sun'&&LAB.S.impact.sun.scope==='date'){ try{ runCurrent(true); }catch(e){ console.warn(e); } } }
LAB.hooks.afterUpdate.push(floors=>{ if(!SW) return; siteRaster=null; syncGeometry(); updateGeomInfo(); syncZoneUI(); try{ renderPlan(); }catch(e){ console.error(e); } if(LAB.S.impact.mode==='sun'){ applySunView(); if(sunResult){ stale.sun=true; showStale(); } } if(LAB.S.impact.mode==='wind'&&windResult){ stale.wind=true; showStale(); } });
LAB.hooks.afterSite.push(()=>{ sunResult=null; windResult=null; if(!SW) return; clearOverlay(); if(!busy) rerender(); setTimeout(()=>autoRun(0),400); });
LAB.hooks.tab.push(name=>{ if(SW) onTab(name); });
LAB.sim={init(){ initState(); buildUI(); placeControls(); syncGeometry(); updateGeomInfo(); renderSky(); applySunView(); if(LAB.S.impact.mode!=='sun'&&LAB.S.impact.mode!=='wind') setMode('sun'); else runCurrent(false); rerender();
    setTimeout(()=>autoRun(0),900); },
  sunPos, runCurrent, runSunStudy, runWindStudy, setMode, setStudioMode, reportData, periodInfo, roseFor, DATES, STRATS, solarStudy, ventStudy, terraceWind, windProfile, zoneFor, zoneGlazing, energyChanged, get windResult(){return windResult;}, get sunResult(){return sunResult;}, get SW(){return SW;}};
})();
