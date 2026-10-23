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
  return arr.filter(m=>m.v&&m.f).map(m=>{ const V=Array.isArray(m.v[0])?m.v.flat():m.v, F=Array.isArray(m.f[0])?m.f.flat():m.f; const mm=meshFromArrays(V.map(Number),F.map(Number),'existing'); mm.layerName=m.layer||'model'; mm.kind='mesh'; return mm; });
}
async function parse3DM(buf){
  const r=await rhino(); if(!r) throw new Error('rhino3dm could not load in this viewer; export the model as .obj or .json instead.');
  const file=r.File3dm.fromByteArray(new Uint8Array(buf)); if(!file) throw new Error('Not a readable .3dm file.');
  let scale=1; try{ const u=file.settings().modelUnitSystem; const map={2:0.001,3:0.01,4:1,5:1000,8:0.0254,9:0.3048,10:1609.34}; if(u in map) scale=map[u]; }catch(e){}
  const out=[]; const objs=file.objects(); const layers=file.layers(); const skipped={};
  const layerPath=(li)=>{ try{ let L=layers.get(li); let name=L.name; let guard=0; while(L&&L.parentLayerId&&guard++<8){ let par=null; for(let j=0;j<layers.count;j++){ const c=layers.get(j); if(c.id===L.parentLayerId){ par=c; break; } } if(!par) break; name=par.name+'::'+name; L=par; } return name; }catch(e){ return 'layer '+li; } };
  const meshOf=(mesh,layer,kind)=>{ if(!mesh) return false; const V=[], F=[]; const vs=mesh.vertices(), fs=mesh.faces();
    for(let i=0;i<vs.count;i++){ const p=vs.get(i); V.push(p[0]*scale,p[1]*scale,p[2]*scale); }
    for(let i=0;i<fs.count;i++){ const f=fs.get(i); F.push(f[0],f[1],f[2]); if(f[2]!==f[3]) F.push(f[0],f[2],f[3]); }
    if(!F.length) return false; const m=meshFromArrays(V,F,'existing'); m.layerName=layer; m.kind=kind; out.push(m); return true; };
  for(let i=0;i<objs.count;i++){ const o=objs.get(i); const g=o.geometry(); if(!g) continue; let layer='(default)'; try{ layer=layerPath(o.attributes().layerIndex); }catch(e){}
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
  out.skipped=skipped; return out;
}

/* ---------- import dialog: layers → massing / shading / pv / context / ignore ---------- */
let pending=null;
function guessRole(name){
  if(/pv|photovolt|solar panel|bipv|collector/i.test(name)) return 'pv';
  if(/shad|fin|louv|brise|overhang|canop|screen|sunbreak|balcon|awning/i.test(name)) return 'shading';
  if(/site|context|exist|herit|plaza|road|curb|ground|topo|tree|future|block|surround|neighbo/i.test(name)) return 'context';
  return 'massing';
}
const ROLES=[['massing','tower massing'],['shading','shading device (Advanced)'],['pv','PV surface (Advanced)'],['context','site context'],['ignore','ignore']];
function showImportDialog(meshes,name){
  const groups={}; for(const m of meshes){ const k=m.layerName||'model'; const g=groups[k]||(groups[k]={n:0,kinds:{},top:-1e9}); g.n++; g.kinds[m.kind||'mesh']=(g.kinds[m.kind||'mesh']||0)+1; g.top=Math.max(g.top,m.top); }
  pending={meshes,name,groups};
  const names=Object.keys(groups).sort();
  $('import-layers').innerHTML=`<thead><tr><th>Layer</th><th class="num">Objects</th><th class="num">Top m</th><th>Use as</th></tr></thead><tbody>${names.map(k=>{ const g=groups[k]; const role=guessRole(k); return `<tr><td>${k}<br><span class="why">${Object.entries(g.kinds).map(([t,c])=>t+' ×'+c).join(', ')}</span></td><td class="num">${g.n}</td><td class="num">${g.top.toFixed(0)}</td><td><select data-layer="${k.replace(/"/g,'&quot;')}">${ROLES.map(([v,l])=>`<option value="${v}"${role===v?' selected':''}>${l}</option>`).join('')}</select></td></tr>`; }).join('')}</tbody>`;
  const sk=meshes.skipped?Object.entries(meshes.skipped):[];
  status(`${name}: ${meshes.length} objects on ${names.length} layer${names.length>1?'s':''}${sk.length?'; skipped '+sk.map(([k,c])=>c+' '+k.split('|')[1]+' on '+k.split('|')[0]).join(', '):''}. Choose what each layer becomes, then Import.`);
  $('c-import-replace').checked=false; $('import-dialog').hidden=false;
}
function applyImport(){
  if(!pending) return; const roles={}; document.querySelectorAll('#import-layers select').forEach(s=>{ roles[s.dataset.layer]=s.value; });
  const by=r=>pending.meshes.filter(m=>roles[m.layerName||'model']===r);
  const massing=by('massing'), shading=by('shading'), pv=by('pv'), ctx=by('context');
  const origin=(LAB.site&&LAB.site.meta&&LAB.site.meta.origin)?LAB.site.meta.origin:[0,0];
  // a file in the base model's coordinate system (site block centre near the Vancouver origin) is shifted onto the tool's origin
  const all=pending.meshes; let cx=0,cy=0,n=0; for(const m of all) for(let i=0;i<m.v.length;i+=3){ cx+=m.v[i]; cy+=m.v[i+1]; n++; } cx/=Math.max(1,n); cy/=Math.max(1,n);
  const inBase=Math.hypot(cx-origin[0],cy-origin[1])<400&&Math.hypot(origin[0],origin[1])>10;
  if(inBase){ for(const m of all) for(let i=0;i<m.v.length;i+=3){ m.v[i]-=origin[0]; m.v[i+1]-=origin[1]; } }
  const msg=[];
  if(ctx.length){ if($('c-import-replace').checked||!LAB.site){ applySite(ctx,pending.name); } else { for(const m of ctx){ m.layer=/herit/i.test(m.layerName||'')?'heritage':'existing'; LAB.site.meshes.push(m); } LAB.buildSite(); } msg.push(ctx.length+' context objects'); }
  if(massing.length){
    const U=voxelize(massing); LAB.upload=U; const S=LAB.S; S.typology='upload'; S.height=Math.round(U.top); S.step={mode:'none'}; S.overrides={}; S.voids=[];
    if(LAB.site&&LAB.site.site&&Math.hypot(U.cx,U.cy)<200){ S.posX=Math.round(U.cx); S.posY=Math.round(U.cy); } else { S.posX=0; S.posY=0; }
    S.rotDeg=0;
    LAB.uploadRaw={massing,shading,pv,cx:U.cx,cy:U.cy,minz:U.minz,name:pending.name,version:(LAB.uploadRaw?LAB.uploadRaw.version:0)+1};
    msg.push(`massing from ${massing.length} objects: ${U.top.toFixed(0)} m tall, footprint about ${U.footprint.toLocaleString()} m², sliced at ${S.f2f} m`);
    if(shading.length) msg.push(shading.length+' shading objects'); if(pv.length) msg.push(pv.length+' PV objects');
  } else if(shading.length||pv.length){ status('Shading and PV layers need a massing layer in the same file to attach to. Choose a massing layer and import again.',true); return; }
  LAB.update(); $('import-dialog').hidden=true; status(`Imported ${pending.name}: ${msg.join('; ')||'nothing selected'}.${inBase?' Coordinates were shifted from the base model onto the site centre.':''}${(shading.length||pv.length)?' Switch to Advanced to study the modeled devices.':''}`); pending=null;
}

/* ---------- uploaded massing → per-floor masks ---------- */
function voxelize(meshes){
  let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9,minz=1e9,maxz=-1e9;
  for(const m of meshes) for(let i=0;i<m.v.length;i+=3){ minx=Math.min(minx,m.v[i]); maxx=Math.max(maxx,m.v[i]); miny=Math.min(miny,m.v[i+1]); maxy=Math.max(maxy,m.v[i+1]); minz=Math.min(minz,m.v[i+2]); maxz=Math.max(maxz,m.v[i+2]); }
  const cx=(minx+maxx)/2, cy=(miny+maxy)/2, nx=Math.ceil(maxx-minx)+2, ny=Math.ceil(maxy-miny)+2, x0=-nx/2, y0=-ny/2;
  const cols=new Array(nx*ny); for(let k=0;k<nx*ny;k++) cols[k]=[];
  for(const m of meshes) for(let i=0;i<m.f.length;i+=3){ const a=m.f[i]*3,b=m.f[i+1]*3,c=m.f[i+2]*3;
    const ax=m.v[a]-cx,ay=m.v[a+1]-cy,az=m.v[a+2]-minz,bx=m.v[b]-cx,by=m.v[b+1]-cy,bz=m.v[b+2]-minz,qx=m.v[c]-cx,qy=m.v[c+1]-cy,qz=m.v[c+2]-minz;
    const det=(bx-ax)*(qy-ay)-(qx-ax)*(by-ay); if(Math.abs(det)<1e-7) continue;
    const ix0=Math.max(0,Math.floor(Math.min(ax,bx,qx)-x0)), ix1=Math.min(nx-1,Math.floor(Math.max(ax,bx,qx)-x0)), iy0=Math.max(0,Math.floor(Math.min(ay,by,qy)-y0)), iy1=Math.min(ny-1,Math.floor(Math.max(ay,by,qy)-y0));
    for(let iy=iy0;iy<=iy1;iy++){ const py=y0+iy+0.5; for(let ix=ix0;ix<=ix1;ix++){ const px=x0+ix+0.5;
      const l1=((bx-px)*(qy-py)-(qx-px)*(by-py))/det, l2=((qx-px)*(ay-py)-(ax-px)*(qy-py))/det, l3=1-l1-l2;
      if(l1>=-1e-6&&l2>=-1e-6&&l3>=-1e-6) cols[iy*nx+ix].push(l1*az+l2*bz+l3*qz); } } }
  const ints=new Array(nx*ny); let any=0;
  for(let k=0;k<nx*ny;k++){ const zs=cols[k].sort((p,q)=>p-q); const iv=[]; for(let i=0;i+1<zs.length;i+=2){ if(zs[i+1]-zs[i]>0.5) iv.push([zs[i],zs[i+1]]); } if(zs.length===1) iv.push([0,zs[0]]); ints[k]=iv; if(iv.length) any++; }
  if(!any) throw new Error('The model has no closed volumes to slice. Make sure the massing is a closed mesh or polysurface.');
  return {nx,ny,x0,y0,ints,top:maxz-minz,base:0,footprint:any,cx,cy,minz};
}
LAB.uploadFloors=function(S){
  const U=LAB.upload, H=S.height, f=S.f2f; const out=[]; let z=0;
  const baseArea=U.footprint; const c0=Math.sqrt(S.coreFrac*baseArea);
  for(let i=0;i<220;i++){
    const o=S.overrides[i]||{}; const h=o.h||f; if(z+h>H+1e-6) break; const zm=z+h/2, t=zm/H;
    let bx0=1e9,bx1=-1e9,by0=1e9,by1=-1e9; const cells=[];
    for(let iy=0;iy<U.ny;iy++) for(let ix=0;ix<U.nx;ix++){ const iv=U.ints[iy*U.nx+ix]; let inside=false; for(const p of iv){ if(zm>=p[0]&&zm<=p[1]){ inside=true; break; } } if(inside){ cells.push(ix,iy); if(ix<bx0)bx0=ix; if(ix>bx1)bx1=ix; if(iy<by0)by0=iy; if(iy>by1)by1=iy; } }
    if(!cells.length){ z+=h; if(out.length) break; else continue; }
    const nx=bx1-bx0+1, ny=by1-by0+1, w=nx, d=ny, ux=U.x0+bx0+w/2, uy=U.y0+by0+d/2;
    const mask={nx,ny,x0:-w/2,y0:-d/2,cells:new Uint8Array(nx*ny)}; for(let k=0;k<cells.length;k+=2) mask.cells[(cells[k+1]-by0)*nx+(cells[k]-bx0)]=1;
    const c=Math.max(6,Math.min(c0,Math.min(w,d)-8));
    const a=S.rotDeg*Math.PI/180, P={x:S.posX+ux*Math.cos(a)-uy*Math.sin(a), y:S.posY+ux*Math.sin(a)+uy*Math.cos(a)};
    out.push({i:out.length,z,h,t,ux,uy,urot:0,cx:P.x,cy:P.y,rot:a,w,d,seg:0,core:c,coreArea:c*c,edited:Object.keys(o).length>0,manual:!!o.prog,leaseMin:(Math.min(w,d)-c)/2,leaseMax:(Math.max(w,d)-c)/2,ext:w,mask});
    z+=h;
  }
  if(!out.length){ LAB.upload=null; S.typology='prism'; return null; }
  return out;
};

/* ---------- upload UI ---------- */
function status(msg,isErr){ const el=$('io-status'); el.textContent=msg; el.style.color=isErr?'var(--warn)':'var(--muted)'; }
async function handleFile(file){
  status(`Reading ${file.name}…`); const fn=$('file-name'); if(fn) fn.textContent=file.name;
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
function applySite(meshes,name){
  if(meshes.meta){ LAB.site=meshes; }
  else {
    let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9; for(const m of meshes) for(let i=0;i<m.v.length;i+=3){ minx=Math.min(minx,m.v[i]); maxx=Math.max(maxx,m.v[i]); miny=Math.min(miny,m.v[i+1]); maxy=Math.max(maxy,m.v[i+1]); }
    const cx=(minx+maxx)/2, cy=(miny+maxy)/2; for(const m of meshes) for(let i=0;i<m.v.length;i+=3){ m.v[i]-=cx; m.v[i+1]-=cy; }
    LAB.site={meta:{source:name,units:'m',origin:[cx,cy],north:'+y'},site:null,meshes,future:[],curves:[],labels:[],uses:[]};
  }
  LAB.buildSite(); LAB.update(); status(`Site replaced by ${name}: ${meshes.length||meshes.meshes.length} meshes. Restore the Vancouver site any time.`);
}

LAB.io={parseOBJ,parseJSON,parse3DM,applySite,showImportDialog,applyImport,status,init(){
  $('file-in').addEventListener('change',e=>{ const f=e.target.files&&e.target.files[0]; if(f) handleFile(f); e.target.value=''; });
  $('import-apply').addEventListener('click',applyImport); $('import-cancel').addEventListener('click',()=>{ pending=null; $('import-dialog').hidden=true; status('Import cancelled.'); });
  const drop=$('drop'); drop.addEventListener('dragover',e=>{ e.preventDefault(); drop.classList.add('over'); }); drop.addEventListener('dragleave',()=>drop.classList.remove('over'));
  drop.addEventListener('drop',e=>{ e.preventDefault(); drop.classList.remove('over'); const f=e.dataTransfer.files&&e.dataTransfer.files[0]; if(f) handleFile(f); });
  $('restore-site').addEventListener('click',()=>{ fetch('site.json').then(r=>r.json()).then(j=>{ LAB.site=j; LAB.buildSite(); LAB.update(); status('Vancouver competition site restored.'); }); });
  $('clear-upload').addEventListener('click',()=>{ LAB.upload=null; LAB.uploadRaw=null; const S=LAB.S; if(S.typology==='upload'){ S.typology='taper'; Object.assign(S,LAB.TYP.taper.defaults); S.height=280; } $('file-name').textContent='no file chosen'; LAB.update(); status('Uploaded model removed; the generated massing is back.'); });
  rhino().then(m=>{ status(m?'Ready. rhino3dm loaded: choose a .3dm and its layers will be listed.':'Ready. rhino3dm did not load here, so .3dm import is off; .obj and .json still work.'); });
}};
})();
