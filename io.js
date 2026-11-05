/* Supertall Sun & Wind Studio — import (.3dm / .obj / .json). Layers become tower massing, shading devices, PV surfaces, site context or are ignored. The massing is sliced into floors for the engine; the raw geometry is kept so Advanced mode can study the building as modeled. */
(function(){
'use strict';
const LAB=window.LAB; const $=LAB.$;
let rhinoReady=null;

/* rhino3dm (WASM) loads lazily from the files published beside the page */
function rhino(){
  if(rhinoReady) return rhinoReady;
  rhinoReady=new Promise(res=>{ if(typeof window.rhino3dm!=='function'){ res(null); return; }
    try{ window.rhino3dm({locateFile:p=>p}).then(m=>{ LAB.rhino=m; res(m); }).catch(()=>res(null)); }catch(e){ res(null); } });
  return rhinoReady;
}

/* ---------- parsers → [{layerName, kind, v:flat, f:flat, top}] ---------- */
function meshFromArrays(V,F,layer){ let top=-1e9; for(let i=2;i<V.length;i+=3) if(V[i]>top) top=V[i]; return {layer,v:V,f:F,top}; }
function parseOBJ(text){
  const out=[]; let V=[]; let cur={name:'model',F:[]}; const groups=[cur];
  const lines=text.split(/\r?\n/);
  for(const ln of lines){ const s=ln.trim(); if(!s||s[0]==='#') continue; const p=s.split(/\s+/);
    if(p[0]==='v'){ V.push(parseFloat(p[1]),parseFloat(p[2]),parseFloat(p[3])); }
    else if(p[0]==='g'||p[0]==='o'){ cur={name:p.slice(1).join(' ')||'model',F:[]}; groups.push(cur); }
    else if(p[0]==='f'){ const idx=p.slice(1).map(t=>{ let i=parseInt(t.split('/')[0],10); if(i<0) i=V.length/3+i+1; return i-1; }); for(let k=1;k<idx.length-1;k++) cur.F.push(idx[0],idx[k],idx[k+1]); } }
  for(const g of groups){ if(!g.F.length) continue; const m=meshFromArrays(V.slice(),g.F,'existing'); m.layerName=g.name; m.kind='mesh'; out.push(m); }
  return out;
}
function parseJSON(text){
  const j=JSON.parse(text);
  if(j&&Array.isArray(j.meshes)&&j.meta) return j; // the tool's own site format
  const arr=Array.isArray(j)?j:(j.meshes||[]);
  return arr.filter(m=>m.v&&m.f).map(m=>{ const V=Array.isArray(m.v[0])?m.v.flat():m.v, F=Array.isArray(m.f[0])?m.f.flat():m.f; const mm=meshFromArrays(V.map(Number),F.map(Number),'existing'); mm.layerName=m.layer||'model'; mm.kind=m.kind||'mesh'; if(m.role) mm.role=m.role; if(m.part) mm.part=m.part; return mm; });
}
async function parse3DM(buf){
  const r=await rhino(); if(!r) throw new Error('rhino3dm could not load in this viewer; export the model as .obj or .json instead.');
  const file=r.File3dm.fromByteArray(new Uint8Array(buf)); if(!file) throw new Error('Not a readable .3dm file.');
  let scale=1; try{ const u=file.settings().modelUnitSystem; const map={2:0.001,3:0.01,4:1,5:1000,8:0.0254,9:0.3048,10:1609.34}; if(u in map) scale=map[u]; }catch(e){}
  const out=[]; const objs=file.objects(); const layers=file.layers(); const skipped={};
  const layerPath=(li)=>{ try{ let L=layers.get(li); let name=L.name; let guard=0; while(L&&L.parentLayerId&&guard++<8){ let par=null; for(let j=0;j<layers.count;j++){ const c=layers.get(j); if(c.id===L.parentLayerId){ par=c; break; } } if(!par) break; name=par.name+'::'+name; L=par; } return name; }catch(e){ return 'layer '+li; } };
  const layerTarget=(li)=>{ try{ let L=layers.get(li), g=0; while(L&&g++<9){ const k=L.getUserString?L.getUserString('sw.target'):null; if(k&&SW_KEYS[k]) return swKey(k); if(!L.parentLayerId) break; let par=null; for(let j=0;j<layers.count;j++){ const c=layers.get(j); if(c.id===L.parentLayerId){ par=c; break; } } L=par; } }catch(e){} return null; };
  const tgt={};
  const meshOf=(mesh,layer,kind)=>{ if(!mesh) return false; const V=[], F=[]; const vs=mesh.vertices(), fs=mesh.faces();
    for(let i=0;i<vs.count;i++){ const p=vs.get(i); V.push(p[0]*scale,p[1]*scale,p[2]*scale); }
    for(let i=0;i<fs.count;i++){ const f=fs.get(i); F.push(f[0],f[1],f[2]); if(f[2]!==f[3]) F.push(f[0],f[2],f[3]); }
    if(!F.length) return false; const m=meshFromArrays(V,F,'existing'); m.layerName=layer; m.kind=kind; out.push(m); return true; };
  for(let i=0;i<objs.count;i++){ const o=objs.get(i); const g=o.geometry(); if(!g) continue; let layer='(default)'; try{ const li=o.attributes().layerIndex; layer=layerPath(li); if(!(layer in tgt)) tgt[layer]=layerTarget(li)||swTarget(layer); }catch(e){}
    try{
      let ok=false, kind='other';
      if(g instanceof r.Mesh){ kind='mesh'; ok=meshOf(g,layer,kind); }
      else if(g instanceof r.Extrusion){ kind='extrusion'; ok=meshOf(g.getMesh(r.MeshType.Any),layer,kind); }
      else if(g instanceof r.Brep){ kind='polysurface'; const fc=g.faces(); const V=[],F=[]; let base=0; for(let k=0;k<fc.count;k++){ const mm=fc.get(k).getMesh(r.MeshType.Any); if(!mm) continue; const vs=mm.vertices(), fs=mm.faces(); for(let q=0;q<vs.count;q++){ const p=vs.get(q); V.push(p[0]*scale,p[1]*scale,p[2]*scale); } for(let q=0;q<fs.count;q++){ const f=fs.get(q); F.push(base+f[0],base+f[1],base+f[2]); if(f[2]!==f[3]) F.push(base+f[0],base+f[2],base+f[3]); } base+=vs.count; } if(F.length){ const m=meshFromArrays(V,F,'existing'); m.layerName=layer; m.kind=kind; out.push(m); ok=true; } }
      else if(g instanceof r.Curve||g instanceof r.Point||g instanceof r.TextDot||g instanceof r.Hatch){ kind='curve or annotation'; }
      if(!ok){ const key=layer+'|'+kind; skipped[key]=(skipped[key]||0)+1; }
    }catch(e){ console.warn('skip object',e); }
  }
  if(!out.length) throw new Error('The .3dm holds no meshes, extrusions or polysurfaces with render meshes. In Rhino, view the model in Rendered or Shaded mode once (so render meshes are stored), then save again.');
  for(const m of out){ const t=tgt[m.layerName]; if(t){ m.role=t.role; if(t.part) m.part=t.part; } }
  out.skipped=skipped; return out;
}

/* ---------- import dialog: layers → massing / shading / pv / context / ignore ---------- */
let pending=null; let siteMode=false; const ID=k=>siteMode?({status:'site-io-status',layers:'site-import-layers',dialog:'site-import-dialog',replace:'c-site-replace',name:'site-file-name'})[k]:({status:'io-status',layers:'import-layers',dialog:'import-dialog',replace:'c-import-replace',name:'file-name'})[k];
/* Sun & Wind Link (the Rhino plugin in rhino/) sets up these layers and sends each object's role and part outright;
   a plain .3dm saved with the same layers (or with layers the plugin mapped, stored as the layer user text sw.target) reads the same way. */
const SW_KEYS={tower:['massing',null],floor:['massing','floor'],ground:['massing','ground'],facade:['massing','facade'],window:['massing','window'],roof:['massing','roof'],ceiling:['massing','ceiling'],structure:['massing','structure'],core:['massing','core'],stair:['massing','stair'],mass:['massing','mass'],shading:['shading',null],pv:['pv',null],context:['context',null],terrain:['terrain',null],ignore:['ignore',null]};
const SW_ROOTS={'sw tower':'tower','sw shading':'shading','sw pv':'pv','sw context':'context','sw terrain':'terrain','sw ignore':'ignore'};
const SW_LEAVES={'floor plates':'floor','ground floor':'ground','facade':'facade','façade':'facade','windows':'window','roof':'roof','ceilings':'ceiling','structure':'structure','core':'core','stairs':'stair','massing volume':'mass'};
function swKey(k){ const t=SW_KEYS[k]; return t?{role:t[0],part:t[1]}:null; }
function swTarget(path){ const seg=String(path||'').split('::').map(x=>x.trim().toLowerCase()); const root=SW_ROOTS[seg[0]]; if(!root) return null;
  if(root==='tower') for(let i=seg.length-1;i>0;i--){ if(SW_LEAVES[seg[i]]) return swKey(SW_LEAVES[seg[i]]); } return swKey(root); }
function guessRole(name){
  const sw=swTarget(name); if(sw) return sw.role;
  if(/topo|terrain|dem\b|contour|grade|landform|ground surface/i.test(name)) return 'terrain';
  if(/pv|photovolt|solar panel|bipv|collector/i.test(name)) return 'pv';
  if(/shad|fin|louv|brise|overhang|canop|screen|sunbreak|balcon|awning/i.test(name)) return 'shading';
  if(/site|context|exist|herit|plaza|road|curb|ground|topo|tree|future|block|surround|neighbo/i.test(name)) return 'context';
  return 'massing';
}
const SITE_ROLES=[['context','site context · buildings, plazas, streets'],['terrain','terrain · ground surface'],['ignore','ignore']];
const ROLES=[['massing','tower massing'],['shading','shading device (Design development)'],['pv','PV surface (Design development)'],['context','site context'],['terrain','terrain · ground surface'],['ignore','ignore']];
function showImportDialog(meshes,name){
  const groups={}; for(const m of meshes){ const k=m.layerName||'model'; const g=groups[k]||(groups[k]={n:0,kinds:{},top:-1e9}); g.n++; g.kinds[m.kind||'mesh']=(g.kinds[m.kind||'mesh']||0)+1; g.top=Math.max(g.top,m.top); }
  pending={meshes,name,groups,live:!!meshes.live,after:meshes.after||null};
  const names=Object.keys(groups).sort();
  const explicit={}; for(const m of meshes) if(m.role&&!(m.layerName in explicit)) explicit[m.layerName||'model']=m.role;
  const roleList=siteMode?SITE_ROLES:ROLES; const guess=k=>{ const r=explicit[k]||guessRole(k); return siteMode?(r==='terrain'?'terrain':(r==='ignore'?'ignore':'context')):r; };
  $(ID('layers')).innerHTML=`<thead><tr><th>Layer</th><th class="num">Objects</th><th class="num">Top m</th><th>Use as</th></tr></thead><tbody>${names.map(k=>{ const g=groups[k]; const role=guess(k); return `<tr><td>${k}<br><span class="why">${Object.entries(g.kinds).map(([t,c])=>t+' ×'+c).join(', ')}</span></td><td class="num">${g.n}</td><td class="num">${g.top.toFixed(0)}</td><td><select data-layer="${k.replace(/"/g,'&quot;')}">${roleList.map(([v,l])=>`<option value="${v}"${role===v?' selected':''}>${l}</option>`).join('')}</select></td></tr>`; }).join('')}</tbody>`;
  const sk=meshes.skipped?Object.entries(meshes.skipped):[];
  status(`${name}: ${meshes.length} objects on ${names.length} layer${names.length>1?'s':''}${sk.length?'; skipped '+sk.map(([k,c])=>c+' '+k.split('|')[1]+' on '+k.split('|')[0]).join(', '):''}. Choose what each layer becomes, then Import.`);
  $(ID('replace')).checked=siteMode;
  /* a model file goes straight to the model check: the layers take their guessed roles and the preview opens;
     the role table stays one click away (Change layer roles) for a re-import. Only a file with no massing layer stops here. */
  if(!siteMode&&(pending.live||names.some(k=>guess(k)==='massing'))){ $('import-apply').textContent='Re-import'; $('import-note').hidden=false; applyImport(); return; }
  if(!siteMode){ $('import-apply').textContent='Import'; $('import-note').hidden=true; }
  $(ID('dialog')).hidden=false;
}
function applyImport(){
  if(!pending) return; const roles={}; document.querySelectorAll('#'+ID('layers')+' select').forEach(s=>{ roles[s.dataset.layer]=s.value; });
  const by=r=>pending.meshes.filter(m=>roles[m.layerName||'model']===r);
  const massing=by('massing'), shading=by('shading'), pv=by('pv'), terrain=by('terrain'); for(const m of terrain){ m.layer='terrain'; m.isTerrain=true; } const ctx=by('context').concat(terrain);
  const origin=(LAB.site&&LAB.site.meta&&LAB.site.meta.origin)?LAB.site.meta.origin:[0,0];
  // a file in the base model's coordinate system (site block centre near the Vancouver origin) is shifted onto the tool's origin
  const all=pending.meshes; let cx=0,cy=0,n=0; for(const m of all) for(let i=0;i<m.v.length;i+=3){ cx+=m.v[i]; cy+=m.v[i+1]; n++; } cx/=Math.max(1,n); cy/=Math.max(1,n);
  const inBase=pending.inBase!=null?pending.inBase:(Math.hypot(cx-origin[0],cy-origin[1])<400&&Math.hypot(origin[0],origin[1])>10); pending.inBase=inBase;
  if(inBase&&!pending.shifted){ pending.shifted=true; for(const m of all) for(let i=0;i<m.v.length;i+=3){ m.v[i]-=origin[0]; m.v[i+1]-=origin[1]; } }
  const msg=[];
  if(pending.live&&LAB.site&&LAB.site.meshes&&LAB.site.meshes.some(m=>m.fromLink)){ LAB.site.meshes=LAB.site.meshes.filter(m=>!m.fromLink); if(!ctx.length) LAB.buildSite(); }
  if(pending.live) for(const m of ctx) m.fromLink=true;
  if(ctx.length){ if($(ID('replace')).checked||!LAB.site){ applySite(ctx,pending.name); } else { levelTerrain(ctx); for(const m of ctx){ if(LAB.site.meshes.includes(m)) continue; if(!m.isTerrain) m.layer=/herit/i.test(m.layerName||'')?'heritage':'existing'; LAB.site.meshes.push(m); } LAB.buildSite(); } msg.push(ctx.length+' context objects'+(terrain.length?' including '+terrain.length+' terrain surface'+(terrain.length>1?'s':'')+' (ground at the tower set to 0 m; the rain study will route run-off over it)':'')); }
  if(massing.length){
    const U=voxelize(massing); U.grade=U.minz<-0.3?Math.min(U.top-2.4,-U.minz):0; LAB.upload=U; const S=LAB.S; S.typology='upload'; S.height=Math.round(U.top-U.grade); S.step={mode:'none'}; S.overrides={}; S.voids=[];
    if(LAB.site&&LAB.site.site&&Math.hypot(U.cx,U.cy)<200){ S.posX=Math.round(U.cx); S.posY=Math.round(U.cy); } else { S.posX=0; S.posY=0; }
    S.rotDeg=0;
    LAB.uploadRaw={massing,shading,pv,cx:U.cx,cy:U.cy,minz:U.minz,name:pending.name,inBase,fromLink:!!pending.live,version:(LAB.uploadRaw?LAB.uploadRaw.version:0)+1};
    msg.push(`massing from ${massing.length} objects: ${(U.top-U.grade).toFixed(0)} m above ground${U.grade>0?' and '+U.grade.toFixed(1)+' m below (model z under 0 is treated as underground)':''}, footprint about ${U.footprint.toLocaleString()} m²; ${LAB.uploadSummary()}`);
    if(shading.length) msg.push(shading.length+' shading objects'); if(pv.length) msg.push(pv.length+' PV objects');
  } else if(shading.length||pv.length){ status('Shading and PV layers need a massing layer in the same file to attach to. Choose a massing layer and import again.',true); if(pending.after) pending.after(false); return; }
  const impName=pending.name, live=pending.live, after=pending.after; LAB.update(); $(ID('dialog')).hidden=true; status(`Imported ${pending.name}: ${msg.join('; ')||'nothing selected'}.${inBase?' Coordinates were shifted from the base model onto the site centre.':''}${(shading.length||pv.length)?' Switch to Design development to study the modeled devices.':''}`);
  if(siteMode) pending=null; else { $('import-roles').hidden=false; }
  if(LAB.sim&&LAB.sim.afterImport) LAB.sim.afterImport();
  if(massing.length&&LAB.parts) setTimeout(()=>{ LAB.parts.open(massing,impName,{auto:live}); if(after) after(true); },60); else if(after) after(!!massing.length);
}

/* ---------- uploaded massing → per-floor masks ---------- */
/* connected pieces of each object, vertices welded at 1 mm: a loose plate, canopy, column or stair inside one object becomes its own piece.
   Each piece knows its layer and whether it is closed (every welded edge shared by exactly two triangles). */
function splitPieces(meshes){ const pieces=[];
  for(const m0 of meshes){ const key=new Map(), par=[]; const find=x=>{ while(par[x]!==x){ par[x]=par[par[x]]; x=par[x]; } return x; };
    const vid=i=>{ const k=Math.round(m0.v[i*3]*1000)+','+Math.round(m0.v[i*3+1]*1000)+','+Math.round(m0.v[i*3+2]*1000); let id=key.get(k); if(id==null){ id=par.length; par.push(id); key.set(k,id); } return id; };
    const tv=[]; for(let i=0;i<m0.f.length;i+=3){ const a=vid(m0.f[i]),b=vid(m0.f[i+1]),c=vid(m0.f[i+2]); tv.push(a,b,c); const ra=find(a); par[find(b)]=ra; par[find(c)]=ra; }
    const groups=new Map(); for(let t=0;t<tv.length;t+=3){ const r=find(tv[t]); let g=groups.get(r); if(!g){ g={f:[],e:new Map()}; groups.set(r,g); } g.f.push(m0.f[t],m0.f[t+1],m0.f[t+2]);
      for(const [p,q] of [[tv[t],tv[t+1]],[tv[t+1],tv[t+2]],[tv[t+2],tv[t]]]){ if(p===q) continue; const k=p<q?p+'_'+q:q+'_'+p; g.e.set(k,(g.e.get(k)||0)+1); } }
    for(const g of groups.values()){ let closed=g.e.size>0; for(const c of g.e.values()){ if(c!==2){ closed=false; break; } } pieces.push({v:m0.v,f:g.f,layerName:m0.layerName,kind:m0.kind,closed}); } }
  return pieces; }
/* ref: the meshes that set the grid and datum (all of the massing layer); plates: confirmed floor-plate pieces, whose outlines count as floor */
function voxelize(meshes,ref,plates){
  let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9,minz=1e9,maxz=-1e9;
  for(const m of (ref||meshes)) for(let i=0;i<m.v.length;i+=3){ minx=Math.min(minx,m.v[i]); maxx=Math.max(maxx,m.v[i]); miny=Math.min(miny,m.v[i+1]); maxy=Math.max(maxy,m.v[i+1]); minz=Math.min(minz,m.v[i+2]); maxz=Math.max(maxz,m.v[i+2]); }
  const cx=(minx+maxx)/2, cy=(miny+maxy)/2, nx=Math.ceil(maxx-minx)+2, ny=Math.ceil(maxy-miny)+2, x0=-nx/2, y0=-ny/2;
  /* solid intervals per object from face orientation: going up a cell's column, a face pointing down is an entry and a face pointing up an exit.
     An exit with no entry (an open floor plate, a canopy, a mesh with a gap) is ignored, so it cannot flip everything stacked with it;
     stacked storeys that share a face simply close one interval and open the next. Objects with inward normals are flipped. */
  const merged=new Array(nx*ny); for(let k=0;k<nx*ny;k++) merged[k]=[]; let openHits=0; const singles=new Map();
  const pieces=splitPieces(meshes);
  for(const m of pieces){ const hits=new Map(); let vol=0;
    for(let i=0;i<m.f.length;i+=3){ const a=m.f[i]*3,b=m.f[i+1]*3,c=m.f[i+2]*3; vol+=m.v[a]*(m.v[b+1]*m.v[c+2]-m.v[b+2]*m.v[c+1])-m.v[a+1]*(m.v[b]*m.v[c+2]-m.v[b+2]*m.v[c])+m.v[a+2]*(m.v[b]*m.v[c+1]-m.v[b+1]*m.v[c]); }
    const flip=vol<0?-1:1;
    for(let i=0;i<m.f.length;i+=3){ const a=m.f[i]*3,b=m.f[i+1]*3,c=m.f[i+2]*3;
      const ax=m.v[a]-cx,ay=m.v[a+1]-cy,az=m.v[a+2]-minz,bx=m.v[b]-cx,by=m.v[b+1]-cy,bz=m.v[b+2]-minz,qx=m.v[c]-cx,qy=m.v[c+1]-cy,qz=m.v[c+2]-minz;
      const det=(bx-ax)*(qy-ay)-(qx-ax)*(by-ay); if(Math.abs(det)<1e-7) continue; const sg=(det>0?1:-1)*flip; // +1 faces up (exit), −1 faces down (entry)
      const ix0=Math.max(0,Math.floor(Math.min(ax,bx,qx)-x0)), ix1=Math.min(nx-1,Math.floor(Math.max(ax,bx,qx)-x0)), iy0=Math.max(0,Math.floor(Math.min(ay,by,qy)-y0)), iy1=Math.min(ny-1,Math.floor(Math.max(ay,by,qy)-y0));
      for(let iy=iy0;iy<=iy1;iy++){ const py=y0+iy+0.5; for(let ix=ix0;ix<=ix1;ix++){ const px=x0+ix+0.5;
        const l1=((bx-px)*(qy-py)-(qx-px)*(by-py))/det, l2=((qx-px)*(ay-py)-(ax-px)*(qy-py))/det, l3=1-l1-l2;
        if(l1>=-1e-6&&l2>=-1e-6&&l3>=-1e-6){ const k=iy*nx+ix; let h=hits.get(k); if(!h){ h=[]; hits.set(k,h); } h.push([l1*az+l2*bz+l3*qz,sg]); } } } }
    for(const [k,zs] of hits){ zs.sort((p,q)=>p[0]-q[0]||q[1]-p[1]); const u=[]; for(const h of zs){ const l=u[u.length-1]; if(l&&l[1]===h[1]&&h[0]-l[0]<0.02) continue; u.push(h); } // the same face hit twice on a triangle edge counts once
      let depth=0, start=0, closed=0; for(const [z,sg] of u){ if(sg<0){ if(depth===0) start=z; depth++; } else if(depth>0){ depth--; if(depth===0){ if(z-start>0.15) merged[k].push([start,z]); closed++; } } else openHits++; }
      if(!closed&&u.length===1) singles.set(k,Math.max(singles.get(k)||0,u[0][0])); } }
  const ints=new Array(nx*ny); let any=0;
  for(let k=0;k<nx*ny;k++){ const iv=merged[k].sort((p,q)=>p[0]-q[0]); const out=[]; for(const p of iv){ const last=out[out.length-1]; if(last&&p[0]<=last[1]+0.2) last[1]=Math.max(last[1],p[1]); else out.push([p[0],p[1]]); } ints[k]=out; if(out.length) any++; }
  let plateAll=null; if(plates&&plates.length){ plateAll=new Uint8Array(nx*ny); for(const p of plates) rasterPiece(p,cx,cy,x0,y0,nx,ny,k=>{ plateAll[k]=1; }); if(!any){ for(let k=0;k<nx*ny;k++) if(plateAll[k]) any++; } }
  if(!any&&singles.size){ for(const [k,z] of singles){ if(z>0.15){ ints[k]=[[0,z]]; any++; } } } // a model of open shells only: each surface stands on the ground, as before
  if(!any) throw new Error('The model has no closed volumes to slice. Make sure the massing is a closed mesh or polysurface.');
  const U={nx,ny,x0,y0,ints,top:maxz-minz,base:0,footprint:any,cx,cy,minz,srcMeshes:meshes,plateAll};
  Object.assign(U,detectLevels(meshes,minz,maxz-minz,any,U));
  return U;
}
/* floor plates in a developed model: upward-facing horizontal faces whose area is a good share of the footprint, clustered by height.
   A plain mass has such faces only at its base and roof, so it reports none and is sliced at the floor-to-floor height instead. */
function detectLevels(meshes,minz,top,footprint,U){ U=U||LAB.upload; const over=(x,y)=>{ if(!U||!U.ints) return true; const ix=Math.floor(x-U.cx-U.x0), iy=Math.floor(y-U.cy-U.y0); return ix>=0&&iy>=0&&ix<U.nx&&iy<U.ny&&(U.ints[iy*U.nx+ix].length>0||(U.plateAll&&U.plateAll[iy*U.nx+ix]===1)); }; // plates count only over the tower's own footprint, so a canopy or a neighbouring slab is not a floor
  const bin=0.25, hist=new Map();
  for(const m of meshes) for(let i=0;i<m.f.length;i+=3){ const a=m.f[i]*3,b=m.f[i+1]*3,c=m.f[i+2]*3;
    const ux=m.v[b]-m.v[a],uy=m.v[b+1]-m.v[a+1],uz=m.v[b+2]-m.v[a+2],vx=m.v[c]-m.v[a],vy=m.v[c+1]-m.v[a+1],vz=m.v[c+2]-m.v[a+2];
    const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx; const len=Math.hypot(nx,ny,nz); if(len<1e-6||nz<0.95*len) continue;
    if(!over((m.v[a]+m.v[b]+m.v[c])/3,(m.v[a+1]+m.v[b+1]+m.v[c+1])/3)) continue; const z=(m.v[a+2]+m.v[b+2]+m.v[c+2])/3-minz; const k=Math.round(z/bin); const e=hist.get(k)||[0,0]; e[0]+=len/2; e[1]+=len/2*z; hist.set(k,e); }
  const keys=[...hist.keys()].sort((p,q)=>p-q); const clusters=[]; let cur=null;
  for(const k of keys){ const [A,ZW]=hist.get(k); if(cur&&k-cur.last<=2){ cur.area+=A; cur.zw+=ZW; cur.last=k; } else { cur={area:A,zw:ZW,last:k}; clusters.push(cur); } }
  const horiz=clusters.length; const levels=clusters.filter(c=>c.area>=0.2*footprint).map(c=>c.zw/c.area).filter(z=>z>=-0.05&&z<top-1.0).sort((p,q)=>p-q);
  const merged=[]; for(const z of levels){ if(!merged.length||z-merged[merged.length-1]>1.0) merged.push(z); }
  if(!merged.length||Math.abs(merged[0])>0.6) merged.unshift(0);
  const interior=merged.filter(z=>z>0.6); const scan={horiz,candidates:merged.length,interior:interior.length};
  if(interior.length<3) return {levels:null,plates:interior.length,typical:0,useLevels:false,scan,reason:interior.length?`only ${interior.length} horizontal plate${interior.length>1?'s':''} above the base cover${interior.length>1?'':'s'} a fifth of the footprint`:`no horizontal faces above the base cover a fifth of the footprint (${horiz} horizontal face level${horiz===1?'':'s'} seen)`};
  const gaps=[]; for(let i=1;i<merged.length;i++) gaps.push(merged[i]-merged[i-1]); gaps.sort((p,q)=>p-q); const med=gaps[Math.floor(gaps.length/2)];
  if(med<2.4||med>9) return {levels:null,plates:interior.length,typical:med,useLevels:false,scan,reason:`${interior.length} plates found but their typical spacing of ${med.toFixed(1)} m is not a storey height (2.4–9 m)`};
  return {levels:merged,plates:interior.length,typical:med,useLevels:true,scan,reason:null,span:[merged[1],merged[merged.length-1]],gaps:[gaps[0],gaps[gaps.length-1]]};
}
function rasterPiece(p,cx,cy,x0,y0,nx,ny,fn){ const v=p.v; for(let i=0;i<p.f.length;i+=3){ const a=p.f[i]*3,b=p.f[i+1]*3,c=p.f[i+2]*3; const ax=v[a]-cx,ay=v[a+1]-cy,bx=v[b]-cx,by=v[b+1]-cy,qx=v[c]-cx,qy=v[c+1]-cy; const det=(bx-ax)*(qy-ay)-(qx-ax)*(by-ay); if(Math.abs(det)<1e-7) continue;
    const ix0=Math.max(0,Math.floor(Math.min(ax,bx,qx)-x0)), ix1=Math.min(nx-1,Math.floor(Math.max(ax,bx,qx)-x0)), iy0=Math.max(0,Math.floor(Math.min(ay,by,qy)-y0)), iy1=Math.min(ny-1,Math.floor(Math.max(ay,by,qy)-y0));
    for(let iy=iy0;iy<=iy1;iy++){ const py=y0+iy+0.5; for(let ix=ix0;ix<=ix1;ix++){ const px=x0+ix+0.5; const l1=((bx-px)*(qy-py)-(qx-px)*(by-py))/det, l2=((qx-px)*(ay-py)-(ax-px)*(qy-py))/det; if(l1>=-1e-6&&l2>=-1e-6&&1-l1-l2>=-1e-6) fn(iy*nx+ix); } } } }
/* the envelope of a storey: the checked façade, window, massing and core pieces cut at a height, drawn onto the grid as walls,
   and everything the walls enclose (a flood from the grid edge cannot reach it). Gaps under about 2 m, such as doors, are closed. */
function envelopeCells(U,zm){ const P=LAB.modelParts, R=LAB.uploadRaw; if(!P||!P.pieces||!R||P.rawVersion!==R.version) return null;
  // worked on a half-metre grid, then read back to the 1 m study grid: a cell counts when three of its four quarters are inside
  const Q=2, M=6, nx=U.nx*Q+2*M, ny=U.ny*Q+2*M, wall=new Uint8Array(nx*ny); let any=false; // M: a margin so the outside flood always has room
  const mark=(x,y)=>{ const ix=Math.floor((x-U.cx-U.x0)*Q)+M, iy=Math.floor((y-U.cy-U.y0)*Q)+M; if(ix>=0&&iy>=0&&ix<nx&&iy<ny){ wall[iy*nx+ix]=1; any=true; } };
  for(const p of P.pieces){ if(!/^(facade|window|mass|core|structure)$/.test(p.cat)) continue; if(p.ez0==null){ let a=1e9,b=-1e9; for(const i of p.f){ const z=p.v[i*3+2]; if(z<a)a=z; if(z>b)b=z; } p.ez0=a; p.ez1=b; } if(zm<=p.ez0||zm>=p.ez1) continue;
    for(let t=0;t<p.f.length;t+=3){ const q=[p.f[t],p.f[t+1],p.f[t+2]].map(i=>[p.v[i*3],p.v[i*3+1],p.v[i*3+2]+1e-5]); const pts=[];
      for(const [A,B] of [[q[0],q[1]],[q[1],q[2]],[q[2],q[0]]]){ if((A[2]-zm)*(B[2]-zm)<0){ const k=(zm-A[2])/(B[2]-A[2]); pts.push([A[0]+(B[0]-A[0])*k,A[1]+(B[1]-A[1])*k]); } }
      if(pts.length===2){ const [a,b]=pts, L=Math.hypot(b[0]-a[0],b[1]-a[1]), n=Math.max(1,Math.ceil(L/0.1)); for(let i=0;i<=n;i++) mark(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n); } } }
  if(!any) return null;
  // close gaps up to about 2 m (doors, joints) by growing the walls 1 m, flood the outside, then peel the growth back off
  let dil=new Uint8Array(wall); for(let r=0;r<2;r++){ const d2=new Uint8Array(dil); for(let k=0;k<nx*ny;k++){ if(!dil[k]) continue; const ix=k%nx, iy=(k/nx)|0; if(ix>0) d2[k-1]=1; if(ix<nx-1) d2[k+1]=1; if(iy>0) d2[k-nx]=1; if(iy<ny-1) d2[k+nx]=1; } dil=d2; }
  const out=new Uint8Array(nx*ny), st=[]; const push=k=>{ if(!out[k]&&!dil[k]){ out[k]=1; st.push(k); } };
  for(let ix=0;ix<nx;ix++){ push(ix); push((ny-1)*nx+ix); } for(let iy=0;iy<ny;iy++){ push(iy*nx); push(iy*nx+nx-1); }
  while(st.length){ const k=st.pop(), ix=k%nx, iy=(k/nx)|0; if(ix>0) push(k-1); if(ix<nx-1) push(k+1); if(iy>0) push(k-nx); if(iy<ny-1) push(k+nx); }
  for(let r=0;r<2;r++){ const peel=[]; for(let k=0;k<nx*ny;k++){ if(out[k]||wall[k]||!dil[k]) continue; const ix=k%nx, iy=(k/nx)|0; if((ix>0&&out[k-1])||(ix<nx-1&&out[k+1])||(iy>0&&out[k-nx])||(iy<ny-1&&out[k+nx])) peel.push(k); } for(const k of peel) out[k]=1; }
  const res=new Set(); for(let iy=0;iy<U.ny;iy++) for(let ix=0;ix<U.nx;ix++){ let n=0; for(let a=0;a<Q;a++) for(let b=0;b<Q;b++) if(!out[(iy*Q+a+M)*nx+ix*Q+b+M]) n++; if(n>=3) res.add(iy*U.nx+ix); }
  return res; }
/* confirmed plates give each level its own outline: a plate counts for the level nearest its top within 0.6 m */
function platesToLevels(U,plates){ if(!U.levels) return; U.plateCells=U.levels.map(()=>new Set()); for(const p of plates){ let zt=-1e9; for(let i=2;i<p.v.length;i+=3){} for(let i=0;i<p.f.length;i++){ const z=p.v[p.f[i]*3+2]; if(z>zt) zt=z; } zt-=U.minz; let best=-1, bd=0.6; U.levels.forEach((z,li)=>{ const d=Math.abs(z-zt); if(d<bd){ bd=d; best=li; } }); if(best<0) continue; const set=U.plateCells[best]; rasterPiece(p,U.cx,U.cy,U.x0,U.y0,U.nx,U.ny,k=>set.add(k)); } }
/* re-run the plate scan on an uploaded model (the Design development slice step asks for it before slicing) */
LAB.scanLevels=function(U){ U=U||LAB.upload; if(!U||!U.srcMeshes) return null; if(U.fromParts) return U; const keep=U.useLevels; Object.assign(U,detectLevels(U.srcMeshes,U.minz,U.top,U.footprint,U)); if(U.levels&&keep===false) U.useLevels=false; return U; };
/* floors from the upload, split at the ground level: U.grade is the height of the ground above the model's lowest point (model z = 0 by default).
   Floors above it become the tower studied by every tool; floors below it are basements, kept in LAB.belowFloors with negative z. */
LAB.uploadFloors=function(S){
  const U=LAB.upload, f=S.f2f; const g=Math.max(0,Math.min(U.top-2.4,U.grade||0)); const H=Math.max(2.4,Math.min(S.height,U.top-g)); const top=g+H;
  const baseArea=U.footprint; const c0=Math.sqrt(S.coreFrac*baseArea);
  const byLevels=!!(U.levels&&U.useLevels!==false); const L=byLevels?U.levels:null;
  // candidate storeys in model coordinates (z0 from the model's base): file plates, or an even slice up and down from the ground
  const slabs=[];
  if(byLevels){ for(let i=0;i<L.length;i++){ const z0=L[i], z1=i+1<L.length?L[i+1]:U.top; const h=z1-z0; if(h<1.8) continue; slabs.push({z0,h,li:i,probes:[z0+Math.min(1.2,h*0.4),z0+Math.min(0.3,h*0.15),z0-0.12,z0+h*0.6]}); } }
  else { let k=0; for(let z=g;z+f<=top+1e-6&&k<220;z+=f,k++){ const o=S.overrides[k]||{}; const h=o.h||f; slabs.push({z0:z,h,probes:[z+h/2],k}); if(h!==f) z+=h-f; } for(let z=g-f;z>=-1e-6;z-=f) slabs.unshift({z0:z,h:f,probes:[z+f/2]}); }
  const out=[], below=[];
  for(const sl of slabs){ const {z0,h,probes}=sl; const under=z0+h<=g+0.3; if(!under&&z0>=top-0.5) continue;
    let bx0=1e9,bx1=-1e9,by0=1e9,by1=-1e9; const cells=[];
    let pc=sl.li!=null&&U.plateCells?U.plateCells[sl.li]:null;
    // a storey whose plate is missing or covers less than half of what its walls enclose takes its outline from the envelope too
    if(U.fromParts){ const env=envelopeCells(U,U.minz+z0+Math.min(1.2,h*0.4)); if(env&&env.size&&(!pc||pc.size<0.5*env.size)){ const m=new Set(pc||[]); for(const k of env) m.add(k); pc=m; } }
    for(let iy=0;iy<U.ny;iy++) for(let ix=0;ix<U.nx;ix++){ const iv=U.ints[iy*U.nx+ix]; let inside=!!(pc&&pc.has(iy*U.nx+ix)); for(const p of iv){ for(const q of probes){ if(q>=p[0]&&q<=p[1]){ inside=true; break; } } if(inside) break; } if(inside){ cells.push(ix,iy); if(ix<bx0)bx0=ix; if(ix>bx1)bx1=ix; if(iy<by0)by0=iy; if(iy>by1)by1=iy; } }
    if(!cells.length) continue;
    const nx=bx1-bx0+1, ny=by1-by0+1, w=nx, d=ny, ux=U.x0+bx0+w/2, uy=U.y0+by0+d/2;
    const mask={nx,ny,x0:-w/2,y0:-d/2,cells:new Uint8Array(nx*ny)}; for(let k=0;k<cells.length;k+=2) mask.cells[(cells[k+1]-by0)*nx+(cells[k]-bx0)]=1;
    const c=Math.max(6,Math.min(c0,Math.min(w,d)-8)); const a=S.rotDeg*Math.PI/180, P={x:S.posX+ux*Math.cos(a)-uy*Math.sin(a), y:S.posY+ux*Math.sin(a)+uy*Math.cos(a)};
    const z=under?z0-g:Math.max(0,z0-g), hh=under?h:Math.min(h,z0+h-Math.max(g,z0)); const o=(sl.k!=null&&S.overrides[sl.k])||{};
    const fl={i:0,z,h:hh,t:Math.max(0,(z+hh/2)/Math.max(1,H)),ux,uy,urot:0,cx:P.x,cy:P.y,rot:a,w,d,seg:0,core:c,coreArea:c*c,edited:Object.keys(o).length>0,manual:!!o.prog,leaseMin:(Math.min(w,d)-c)/2,leaseMax:(Math.max(w,d)-c)/2,ext:w,mask,below:under,open:(sl.li!=null&&U.openings)?U.openings[sl.li]:null,ceil:(sl.li!=null&&U.ceilings)?U.ceilings[sl.li]:null};
    if(under) below.push(fl); else { fl.i=out.length; out.push(fl); } }
  below.forEach((fl,i)=>{ fl.i=i; fl.level='B'+(below.length-i); });
  LAB.belowFloors=below;
  if(!out.length){ LAB.upload=null; S.typology='prism'; LAB.belowFloors=[]; return null; }
  return out;
};
/* the model's ground level in model z, and setting it: everything below becomes basement */
LAB.groundZ=function(){ const U=LAB.upload; return U?U.minz+(U.grade||0):0; };
LAB.setGroundZ=function(z){ const U=LAB.upload; if(!U) return; U.grade=Math.max(0,Math.min(U.top-2.4,z-U.minz)); LAB.S.height=Math.round(U.top-U.grade); LAB.update(); };
LAB.uploadSummary=function(){ const U=LAB.upload; if(!U) return ''; const B=LAB.belowFloors||[]; const bs=B.length?` · ${B.length} basement level${B.length>1?'s':''} below ground (${Math.round(B.reduce((a,f)=>a+f.mask.cells.reduce((x,c)=>x+c,0),0)).toLocaleString()} m²), not studied`:''; return LAB._upSum()+bs; };
LAB._upSum=function(){ const U=LAB.upload; if(!U) return ''; if(U.levels&&U.useLevels!==false) return `${U.plates} floor plates found in the file (typical ${U.typical.toFixed(1)} m storey); floors follow them`; if(U.levels) return `${U.plates} floor plates found but the mass is sliced at ${LAB.S.f2f} m`; return `solid mass, no floor plates found; sliced at ${LAB.S.f2f} m`; };

/* ---------- upload UI ---------- */
function status(msg,isErr){ const el=$(ID('status')); el.textContent=msg; el.style.color=isErr?'var(--warn)':'var(--muted)'; }
async function handleFile(file,site){
  siteMode=!!site; status(`Reading ${file.name}…`); const fn=$(ID('name')); if(fn) fn.textContent=file.name;
  try{
    let meshes; const name=file.name.toLowerCase();
    if(name.endsWith('.obj')) meshes=parseOBJ(await file.text());
    else if(name.endsWith('.json')) meshes=parseJSON(await file.text());
    else if(name.endsWith('.3dm')) meshes=await parse3DM(await file.arrayBuffer());
    else throw new Error('Use a .3dm, .obj or .json file.');
    if(meshes.meta){ LAB.site=meshes; LAB.buildSite(); LAB.update(); status(`Site replaced by ${file.name}.`); return; }
    for(const m of meshes){ if(!m.layerName) m.layerName='model'; if(!m.kind) m.kind='mesh'; }
    showImportDialog(meshes,file.name);
  }catch(e){ console.error(e); status(e.message||String(e),true); }
}
/* a terrain surface sets the datum: the ground at the tower's position becomes z = 0, so the tower's base sits on the ground and the
   drainage study reads pond levels against the ground floor; everything imported with it shifts by the same amount */
function terrainZAt(T,x,y){ let nz=null, nd=Infinity; for(const m of T){ for(let i=0;i<m.f.length;i+=3){ const a=m.f[i]*3,b=m.f[i+1]*3,c=m.f[i+2]*3; const ax=m.v[a],ay=m.v[a+1],bx=m.v[b],by=m.v[b+1],cx=m.v[c],cy=m.v[c+1]; const det=(bx-ax)*(cy-ay)-(cx-ax)*(by-ay); if(Math.abs(det)>1e-9){ const l1=((bx-x)*(cy-y)-(cx-x)*(by-y))/det, l2=((cx-x)*(ay-y)-(ax-x)*(cy-y))/det, l3=1-l1-l2; if(l1>=-1e-6&&l2>=-1e-6&&l3>=-1e-6) return l1*m.v[a+2]+l2*m.v[b+2]+l3*m.v[c+2]; } }
    for(let i=0;i<m.v.length;i+=3){ const d=Math.hypot(m.v[i]-x,m.v[i+1]-y); if(d<nd){ nd=d; nz=m.v[i+2]; } } } return nz; }
function levelTerrain(meshes){ const T=meshes.filter(m=>m.isTerrain||m.layer==='terrain'); if(!T.length) return 0; const S=LAB.S; const z0=terrainZAt(T,S.posX,S.posY); if(z0==null||!isFinite(z0)) return 0;
  for(const m of meshes){ for(let i=2;i<m.v.length;i+=3) m.v[i]-=z0; if(typeof m.top==='number') m.top-=z0; } return z0; }
function applySite(meshes,name){
  if(meshes.meta){ LAB.site=meshes; }
  else {
    let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9; for(const m of meshes) for(let i=0;i<m.v.length;i+=3){ minx=Math.min(minx,m.v[i]); maxx=Math.max(maxx,m.v[i]); miny=Math.min(miny,m.v[i+1]); maxy=Math.max(maxy,m.v[i+1]); }
    const cx=(minx+maxx)/2, cy=(miny+maxy)/2; for(const m of meshes){ for(let i=0;i<m.v.length;i+=3){ m.v[i]-=cx; m.v[i+1]-=cy; } if(!m.layer||(!m.isTerrain&&m.layer!=='heritage')) m.layer=m.isTerrain?'terrain':'existing'; }
    const dz=levelTerrain(meshes);
    LAB.site={meta:{source:name,units:'m',origin:[cx,cy],datum:dz,north:'+y'},site:null,meshes,future:[],curves:[],labels:[],uses:[]};
  }
  LAB.buildSite(); LAB.update(); status(`Site replaced by ${name}: ${meshes.length||meshes.meshes.length} meshes. Restore the Vancouver site any time.`);
}

LAB.io={importLive(meshes,name){ siteMode=false; const fn=$(ID('name')); if(fn) fn.textContent=name; for(const m of meshes){ if(!m.layerName) m.layerName='model'; if(!m.kind) m.kind='mesh'; } showImportDialog(meshes,name); },swTarget,splitPieces,handleFile,detectLevels,platesToLevels,voxelize,parseOBJ,parseJSON,parse3DM,applySite,showImportDialog,applyImport,status,init(){
  $('file-in').addEventListener('change',e=>{ const f=e.target.files&&e.target.files[0]; if(f) handleFile(f); e.target.value=''; });
  $('import-apply').addEventListener('click',applyImport); $('import-roles').addEventListener('click',()=>{ if(!pending){ status('Choose the file again to change its layer roles.'); return; } siteMode=false; $('import-dialog').hidden=false; }); $('import-cancel').addEventListener('click',()=>{ pending=null; $('import-dialog').hidden=true; status('Import cancelled.'); });
  // the Site tab takes a site model the same way; every layer becomes context or terrain
  $('site-file-in').addEventListener('change',e=>{ const f=e.target.files&&e.target.files[0]; if(f) handleFile(f,true); e.target.value=''; });
  $('site-import-apply').addEventListener('click',applyImport); $('site-import-cancel').addEventListener('click',()=>{ pending=null; $('site-import-dialog').hidden=true; status('Import cancelled.'); });
  const sdrop=$('site-drop'); sdrop.addEventListener('dragover',e=>{ e.preventDefault(); sdrop.classList.add('over'); }); sdrop.addEventListener('dragleave',()=>sdrop.classList.remove('over'));
  sdrop.addEventListener('drop',e=>{ e.preventDefault(); sdrop.classList.remove('over'); const f=e.dataTransfer.files&&e.dataTransfer.files[0]; if(f) handleFile(f,true); });
  const drop=$('drop'); drop.addEventListener('dragover',e=>{ e.preventDefault(); drop.classList.add('over'); }); drop.addEventListener('dragleave',()=>drop.classList.remove('over'));
  drop.addEventListener('drop',e=>{ e.preventDefault(); drop.classList.remove('over'); const f=e.dataTransfer.files&&e.dataTransfer.files[0]; if(f) handleFile(f); });
  $('restore-site').addEventListener('click',()=>{ fetch('site.json').then(r=>r.json()).then(j=>{ LAB.site=j; LAB.buildSite(); LAB.update(); siteMode=true; $('site-file-name').textContent='Vancouver Tall Base Model'; status('Vancouver competition site restored.'); }); });
  $('parts-review').addEventListener('click',()=>{ if(!LAB.parts) return; if(!LAB.parts.reopen()&&LAB.uploadRaw) LAB.parts.open(LAB.uploadRaw.massing,LAB.uploadRaw.name); });
  $('up-grade').addEventListener('change',e=>{ const v=parseFloat(e.target.value); if(isFinite(v)&&LAB.upload){ LAB.setGroundZ(v); status(`Ground level set at model z ${v.toFixed(1)} m: ${(LAB.belowFloors||[]).length} floors below ground, ${LAB.floors?LAB.floors.length:0} above.`); } });
  $('clear-upload').addEventListener('click',()=>{ LAB.upload=null; LAB.uploadRaw=null; LAB.belowFloors=[]; const S=LAB.S; if(S.typology==='upload'){ S.typology='taper'; Object.assign(S,LAB.TYP.taper.defaults); S.height=280; } $('file-name').textContent='no file chosen'; LAB.update(); status('Uploaded model removed; the generated massing is back.'); });
  rhino().then(m=>{ status(m?'Ready. rhino3dm loaded: choose a .3dm and its layers will be listed.':'Ready. rhino3dm did not load here, so .3dm import is off; .obj and .json still work.'); });
}};
})();
