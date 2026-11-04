/* Sun & Wind Studio — model parts review: after an import, every piece of the massing layer is classified as floor plate, ground floor,
   façade, window, roof, ceiling, structure, core, stair or massing volume, first by layer name and then by its geometry. A review card
   over the viewport lists what was found, highlights each part on request and lets the user confirm or reassign by layer.
   Confirmed parts drive the study: plates set the storeys and plate outlines, the ground floor sets the ground level, the core sets the
   core share, windows and façade set the window-to-wall ratio by face; structure, stairs, windows and façade panels are kept out of the solid. */
(function(){
'use strict';
const LAB=window.LAB; const $=id=>document.getElementById(id); const fmtI=v=>Math.round(v).toLocaleString('en-US');
const CATS=[['floor','Floor plates','#4F7CAC'],['ground','Ground floor','#8C5B90'],['facade','Façade','#7E8A96'],['window','Windows','#5FA8D3'],['roof','Roof','#D06A4B'],['ceiling','Ceiling','#D9A441'],['structure','Structure','#44515E'],['core','Core','#B07D4F'],['stair','Stairs','#4E9A5B'],['mass','Massing volume','#A9B2BC'],['other','Not used','#C9CED4']];
const NAME=Object.fromEntries(CATS.map(c=>[c[0],c[1]])), COL=Object.fromEntries(CATS.map(c=>[c[0],c[2]]));
const KW=[[/stair|step|tread|riser/i,'stair'],[/core|shaft|lift|elev/i,'core'],[/column|beam|struct|brace|girder|truss|pier/i,'structure'],[/window|glass|glaz|pane|vision/i,'window'],[/ceil|soffit/i,'ceiling'],[/roof/i,'roof'],[/slab|floor|plate|deck|level/i,'floor'],[/fa[cç]ade|curtain|cladd|wall|spandrel|mullion|panel|envelope|skin/i,'facade'],[/mass|volume|block|tower/i,'mass']];
let state=null; // {pieces, info, byLayer, layerChoice, ctx, confirmed, groundZ}
/* geometry of one piece, in model coordinates */
function info(p,C){ const v=p.v; let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,z0=1e9,z1=-1e9; let up=0,down=0,vert=0,tot=0,vol=0; const upZ=new Map(); const face={N:0,E:0,S:0,W:0}; let sx=0,sy=0,sn=0;
  for(let i=0;i<p.f.length;i+=3){ const a=p.f[i]*3,b=p.f[i+1]*3,c=p.f[i+2]*3; for(const q of [a,b,c]){ const x=v[q],y=v[q+1],z=v[q+2]; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; if(z<z0)z0=z; if(z>z1)z1=z; }
    const ux=v[b]-v[a],uy=v[b+1]-v[a+1],uz=v[b+2]-v[a+2],wx=v[c]-v[a],wy=v[c+1]-v[a+1],wz=v[c+2]-v[a+2]; const nx=uy*wz-uz*wy, ny=uz*wx-ux*wz, nz=ux*wy-uy*wx; const len=Math.hypot(nx,ny,nz); if(len<1e-9) continue; const A=len/2; tot+=A;
    vol+=v[a]*(v[b+1]*v[c+2]-v[b+2]*v[c+1])-v[a+1]*(v[b]*v[c+2]-v[b+2]*v[c])+v[a+2]*(v[b]*v[c+1]-v[b+1]*v[c]);
    const zc=(v[a+2]+v[b+2]+v[c+2])/3; sx+=(v[a]+v[b]+v[c])/3*A; sy+=(v[a+1]+v[b+1]+v[c+1])/3*A; sn+=A;
    if(nz/len>0.9){ up+=A; const k=Math.round(zc*20)/20; upZ.set(k,(upZ.get(k)||0)+A); } else if(nz/len<-0.9) down+=A; else if(Math.abs(nz/len)<0.2){ vert+=A; const mx=(v[a]+v[b]+v[c])/3-C.cx, my=(v[a+1]+v[b+1]+v[c+1])/3-C.cy; const sgn=(nx*mx+ny*my)<0?-1:1; const az=(Math.atan2(sgn*nx,sgn*ny)*180/Math.PI+360)%360; face[az<45||az>=315?'N':(az<135?'E':(az<225?'S':'W'))]+=A; } }
  vol=Math.abs(vol)/6; const dx=x1-x0, dy=y1-y0, dz=z1-z0; if(p.closed&&vol/Math.max(1e-9,tot/2)<0.6){ for(const k in face) face[k]/=2; } const tops=[...upZ.entries()].filter(e=>e[1]>0.25).length;
  return {x0,x1,y0,y1,z0,z1,dx,dy,dz,up,down,vert,tot,vol,thick:p.closed?vol/Math.max(1e-9,tot/2):0,face,tops,cx:sn?sx/sn:(x0+x1)/2,cy:sn?sy/sn:(y0+y1)/2,closed:p.closed};
}
function byKeyword(name){ for(const [re,c] of KW) if(re.test(name||'')) return c; return null; }
function byGeometry(I,ctx){
  const plan=I.dx*I.dy, small=Math.max(I.dx,I.dy);
  if(I.dz>=1.5&&I.dz<=9&&small<=16&&I.tops>=6) return 'stair';
  if(small<1.8&&I.dz>2.4&&I.vert>0.5*I.tot) return 'structure';
  if(I.dz<1.6&&Math.min(I.dx,I.dy)<1.2&&small>3&&I.up<0.4*plan+1) return 'structure';
  const horiz=(I.up+I.down)>0.6*I.tot&&I.dz<1.2;
  if(horiz){ const A=Math.max(I.up,I.down); if(A<0.12*ctx.foot) return 'other'; if(!I.closed&&I.down>I.up*1.5) return 'ceiling'; if(I.z1>=ctx.top-1.5) return 'roof'; return 'floor'; }
  const central=Math.hypot(I.cx-ctx.cx,I.cy-ctx.cy)<0.35*Math.max(ctx.dx,ctx.dy);
  const inside=(ctx.all||[]).some(J=>J!==I&&J.dx*J.dy>=2.5*plan&&(J.dz>=0.5*I.dz||(J.dz<1.2&&(J.up+J.down)>0.6*J.tot))&&J.x0<=I.x0+0.5&&J.x1>=I.x1-0.5&&J.y0<=I.y0+0.5&&J.y1>=I.y1-0.5);
  if(I.closed&&I.dz>0.45*ctx.top&&Math.min(I.dx,I.dy)>=3&&small<=30&&plan<0.4*ctx.foot&&central&&inside) return 'core';
  if(I.vert>0.6*I.tot){ if(I.closed&&I.thick<0.06) return 'window'; if(!I.closed||I.thick<0.6) return 'facade'; }
  if(I.closed) return 'mass';
  return 'facade';
}
function classify(){ const S=state; S.ctx.all=S.info; S.cat=S.info.map((I,i)=>{ if(S.pieceChoice&&S.pieceChoice[i]) return S.pieceChoice[i]; const L=S.pieces[i].layerName||'model'; const ch=S.layerChoice[L]; if(ch&&ch!=='auto') return ch; return byKeyword(L)||byGeometry(I,S.ctx); }); summarise(); }
function summarise(){ const S=state; const by={}; for(const c of CATS) by[c[0]]=[]; S.cat.forEach((c,i)=>by[c].push(i)); S.by=by;
  const plates=by.floor.map(i=>S.info[i]); const zs=plates.map(I=>I.z1).sort((a,b)=>a-b); const lv=[]; for(const z of zs){ if(!lv.length||z-lv[lv.length-1]>1.0) lv.push(z); } S.levels=lv;
  const gaps=[]; for(let i=1;i<lv.length;i++) gaps.push(lv[i]-lv[i-1]); gaps.sort((a,b)=>a-b); S.typical=gaps.length?gaps[Math.floor(gaps.length/2)]:0;
  if(S.groundZ==null){ const g=lv.length?lv.reduce((a,z)=>Math.abs(z)<Math.abs(a)?z:a,lv[0]):0; S.groundZ=Math.abs(g)<1.5?+g.toFixed(2):(S.ctx.minz<-0.3?0:+S.ctx.minz.toFixed(2)); }
  const sum=(list,k)=>list.reduce((a,i)=>a+S.info[i][k],0); const faceSum=(list)=>{ const o={N:0,E:0,S:0,W:0}; for(const i of list) for(const k in o) o[k]+=S.info[i].face[k]; return o; };
  const win=faceSum(by.window), fac=faceSum(by.facade); S.wwr={}; const tmax=Math.max(...['N','E','S','W'].map(k=>win[k]+fac[k])); for(const k of ['N','E','S','W']){ const t=win[k]+fac[k]; S.wwr[k]=t>Math.max(1,0.08*tmax)?win[k]/t:null; }
  const plateA=plates.length?Math.max(...plates.map(I=>Math.max(I.up,I.down))):S.ctx.foot; const core=by.core.map(i=>S.info[i]); S.coreArea=core.reduce((a,I)=>a+I.dx*I.dy,0); S.coreFrac=core.length?Math.max(0.04,Math.min(0.45,S.coreArea/Math.max(1,plateA))):null;
  const ceil=by.ceiling.map(i=>S.info[i].z0).sort((a,b)=>a-b); const fc=[]; for(const z of ceil){ const below=lv.filter(l=>l<z-0.5).pop(); if(below!=null) fc.push(z-below); } fc.sort((a,b)=>a-b); S.ceilingH=fc.length?fc[Math.floor(fc.length/2)]:null;
  S.sum={floor:by.floor.length?`${by.floor.length} plate${by.floor.length>1?'s':''} on ${lv.length} level${lv.length>1?'s':''}${S.typical?' · typical storey '+S.typical.toFixed(2)+' m':''}`:'',
    ground:'',facade:by.facade.length?`${by.facade.length} piece${by.facade.length>1?'s':''} · ${fmtI(sum(by.facade,'vert')/(by.facade.some(i=>S.info[i].closed)?2:1))} m²`:'',
    window:by.window.length?`${by.window.length} piece${by.window.length>1?'s':''} · ${fmtI(sum(by.window,'vert')/2)} m² of glass${Object.values(S.wwr).some(v=>v!=null)?' · window-to-wall '+['N','E','S','W'].map(k=>k+' '+(S.wwr[k]==null?'–':Math.round(S.wwr[k]*100)+'%')).join(' '):''}`:'',
    roof:by.roof.length?`${by.roof.length} piece${by.roof.length>1?'s':''} · ${fmtI(sum(by.roof,'up'))} m² · top at z ${Math.max(...by.roof.map(i=>S.info[i].z1)).toFixed(1)} m`:'',
    ceiling:by.ceiling.length?`${by.ceiling.length} piece${by.ceiling.length>1?'s':''}${S.ceilingH?' · floor-to-ceiling '+S.ceilingH.toFixed(2)+' m':''}`:'',
    structure:by.structure.length?`${by.structure.filter(i=>S.info[i].dz>2.4).length} columns or walls, ${by.structure.filter(i=>S.info[i].dz<=2.4).length} beams`:'',
    core:by.core.length?`${by.core.length} piece${by.core.length>1?'s':''} · ${core.map(I=>I.dx.toFixed(0)+' × '+I.dy.toFixed(0)+' m').join(', ')} · ${Math.round((S.coreFrac||0)*100)}% of the plate`:'',
    stair:by.stair.length?`${by.stair.length} stair${by.stair.length>1?'s':''}`:'',
    mass:by.mass.length?`${by.mass.length} closed volume${by.mass.length>1?'s':''}`:''};
}
/* ---------- the review popup: a 3-D preview of the model beside a step-through of the parts found ---------- */
const ORDER=['floor','ground','facade','window','roof','ceiling','structure','core','stair','mass','other'];
function nearestLevel(S,z){ let best=0, bd=1e9; S.levels.forEach((l,i)=>{ const d=Math.abs(l-z); if(d<bd){ bd=d; best=i; } }); return S.levels.length?best:0; }
function groundIds(S){ if(!S.levels.length) return []; const z=S.levels[nearestLevel(S,S.groundZ)]; return S.by.floor.filter(i=>Math.abs(S.info[i].z1-z)<0.6); }
function idsOf(S,k){ return k==='ground'?groundIds(S):(S.by[k]||[]); }
function steps(S){ return ORDER.filter(k=>k==='ground'?S.levels.length>0:idsOf(S,k).length>0); }
const esc=s=>LAB.viz?LAB.viz.esc(s):String(s);
/* the preview: its own renderer, scene and orbit, so the main viewport is untouched */
let V=null;
function viewer(host){ if(V&&V.host===host) return V; if(V) disposeViewer();
  const W=Math.max(200,host.clientWidth), H=Math.max(200,host.clientHeight); const r=new THREE.WebGLRenderer({antialias:true,alpha:true}); r.setPixelRatio(Math.min(2,window.devicePixelRatio||1)); r.setSize(W,H); host.insertBefore(r.domElement,host.firstChild);
  const sc=new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff,0x8a939c,0.85)); const dl=new THREE.DirectionalLight(0xffffff,0.65); dl.position.set(0.6,1,0.8); sc.add(dl);
  const cam=new THREE.PerspectiveCamera(35,W/H,0.5,50000); const grp=new THREE.Group(); sc.add(grp); const orb={th:0.75,ph:1.05,dist:200,t:new THREE.Vector3()};
  const draw=()=>{ cam.position.set(orb.t.x+orb.dist*Math.sin(orb.ph)*Math.sin(orb.th),orb.t.y+orb.dist*Math.cos(orb.ph),orb.t.z+orb.dist*Math.sin(orb.ph)*Math.cos(orb.th)); cam.lookAt(orb.t); r.render(sc,cam); };
  let drag=null; const el=r.domElement; el.style.touchAction='none';
  el.addEventListener('pointerdown',e=>{ drag={x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,b:e.button,pan:e.button===2}; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove',e=>{ if(!drag) return; const dx=e.clientX-drag.x, dy=e.clientY-drag.y; drag.x=e.clientX; drag.y=e.clientY;
    if(drag.pan){ const k=orb.dist*0.0016; orb.t.x-=dx*k*Math.cos(orb.th); orb.t.z+=dx*k*Math.sin(orb.th); orb.t.y+=dy*k; } else { orb.th-=dx*0.007; orb.ph=Math.min(1.55,Math.max(0.08,orb.ph-dy*0.006)); } draw(); });
  el.addEventListener('pointerup',e=>{ const d=drag; drag=null; if(d&&d.b===0&&Math.hypot(e.clientX-d.x0,e.clientY-d.y0)<4) pick(e,e.shiftKey||e.ctrlKey||e.metaKey); }); el.addEventListener('contextmenu',e=>e.preventDefault());
  el.addEventListener('wheel',e=>{ e.preventDefault(); orb.dist=Math.max(10,orb.dist*(1+e.deltaY*0.0012)); draw(); },{passive:false});
  const ro=new ResizeObserver(()=>{ const w=host.clientWidth, h=host.clientHeight; if(!w||!h) return; r.setSize(w,h); cam.aspect=w/h; cam.updateProjectionMatrix(); draw(); }); ro.observe(host);
  V={host,r,sc,cam,grp,orb,draw,ro,mats:{}}; return V; }
function disposeViewer(){ if(!V) return; try{ V.ro.disconnect(); clearViewer(); V.r.dispose(); V.r.forceContextLoss&&V.r.forceContextLoss(); V.r.domElement.remove(); }catch(e){} V=null; }
function clearViewer(){ while(V.grp.children.length){ const o=V.grp.children.pop(); if(o.geometry) o.geometry.dispose(); } }
function mat(c,ghost){ const k=c+(ghost?'g':''); if(!V.mats[k]) V.mats[k]=ghost?new THREE.MeshLambertMaterial({color:new THREE.Color(c),transparent:true,opacity:0.16,depthWrite:false}):new THREE.MeshLambertMaterial({color:new THREE.Color(c),side:THREE.DoubleSide}); return V.mats[k]; }
function frame(){ if(!V) return; const b=new THREE.Box3().setFromObject(V.grp); if(b.isEmpty()) return; const c=b.getCenter(new THREE.Vector3()), sz=b.getSize(new THREE.Vector3()); V.orb.t.copy(c); V.orb.dist=Math.max(30,Math.max(sz.x,sz.y,sz.z)*1.9); V.draw(); }
/* rebuild the preview: the current part (or layer) in its colour with outlines, everything else as a grey ghost, or hidden */
function paint(){ const S=state; if(!V) return; clearViewer(); const C=S.ctx; const sel=S.showLayer?null:(S.mode==='layer'?null:S.cur); const selIds=new Set(S.showLayer?S.byLayer[S.showLayer]:(sel?idsOf(S,sel):[]));
  const groups=new Map(); S.pieces.forEach((p,i)=>{ if(S.hideLayer[p.layerName||'model']) return; const picked=S.sel.has(i); const on=selIds.has(i); if(!on&&!picked&&!S.ghost) return; const key=picked?'#E8692B':(on?(S.showLayer?COL[S.cat[i]]:COL[sel]):'ghost'); let g=groups.get(key); if(!g){ g=[]; groups.set(key,g); } g.push(i); });
  for(const [key,list] of groups){ let n=0; for(const i of list) n+=S.pieces[i].f.length; const pos=new Float32Array(n*3), owner=new Int32Array(n/3); let w=0, t=0; for(const pi of list){ const p=S.pieces[pi]; for(let i=0;i<p.f.length;i++){ const q=p.f[i]*3; pos[w++]=p.v[q]-C.cx; pos[w++]=p.v[q+2]-C.minz; pos[w++]=-(p.v[q+1]-C.cy); if(i%3===2) owner[t++]=pi; } }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.computeVertexNormals(); const ghost=key==='ghost'; const m=new THREE.Mesh(g,mat(ghost?'#9AA3AD':key,ghost)); m.renderOrder=ghost?2:(key==='#E8692B'?3:1); m.userData.owner=owner; V.grp.add(m);
    if(!ghost&&n<600000){ const e=new THREE.LineSegments(new THREE.EdgesGeometry(g,30),new THREE.LineBasicMaterial({color:key==='#E8692B'?0x7a2a08:0x1d2731,transparent:true,opacity:key==='#E8692B'?0.9:0.5})); V.grp.add(e); } }
  // ground plane at the ground floor level
  const gs=Math.max(C.dx,C.dy)*1.6+20; const gp=new THREE.Mesh(new THREE.PlaneGeometry(gs,gs),new THREE.MeshBasicMaterial({color:0x7f8b96,transparent:true,opacity:0.12,side:THREE.DoubleSide,depthWrite:false})); gp.rotation.x=-Math.PI/2; gp.position.y=S.groundZ-C.minz; V.grp.add(gp);
  const gl=new THREE.LineSegments(new THREE.EdgesGeometry(gp.geometry),new THREE.LineBasicMaterial({color:0x7f8b96})); gl.rotation.x=-Math.PI/2; gl.position.y=gp.position.y; V.grp.add(gl);
  if(!S.framed){ S.framed=true; frame(); } else V.draw(); }
/* pieces picked in the preview: what they are now, and a new label for them */
function selHTML(S){ if(!S.sel.size) return `<p class="ps pd-pickhint">Click a piece in the preview to select it, Shift-click to add more, then give it another label.</p>`;
  const ids=[...S.sel]; const t={}, ly={}; for(const i of ids){ t[S.cat[i]]=(t[S.cat[i]]||0)+1; const L=S.pieces[i].layerName||'model'; ly[L]=(ly[L]||0)+1; }
  const I0=S.info[ids[0]]; const size=ids.length===1?` · ${I0.dx.toFixed(1)} × ${I0.dy.toFixed(1)} × ${I0.dz.toFixed(1)} m, z ${I0.z0.toFixed(1)}–${I0.z1.toFixed(1)}`:'';
  const cur=Object.keys(t).length===1?Object.keys(t)[0]:'';
  return `<div class="pd-pick"><div class="pd-stephead"><span class="sw lg" style="background:#E8692B"></span><h3>${ids.length} piece${ids.length>1?'s':''} selected</h3><button type="button" class="btn small" id="pt-selclear">Clear</button></div>
  <p class="ps">Now: ${Object.entries(t).map(([c,n])=>NAME[c]+(n>1?' ×'+n:'')).join(', ')} · on ${Object.keys(ly).map(esc).join(', ')}${size}${ids.some(i=>S.pieceChoice[i])?' · set by hand':''}</p>
  <div class="pd-q"><label class="lvl">Label as <select id="pt-sellabel">${CATS.map(c=>`<option value="${c[0]}"${c[0]===cur?' selected':''}>${c[1]}</option>`).join('')}</select></label><button type="button" class="btn primary small" id="pt-selapply">Assign</button>${ids.some(i=>S.pieceChoice[i])?'<button type="button" class="btn small" id="pt-selreset">Back to the scan</button>':''}</div>
  ${ids.length===1&&(S.cat[ids[0]]==='floor'||S.cat[ids[0]]==='roof'||Math.max(S.info[ids[0]].up,S.info[ids[0]].down)>0.6*S.info[ids[0]].tot)?'<div class="pd-q"><button type="button" class="btn small" id="pt-selground">Make this the ground floor</button></div>':''}<div class="pd-q"><button type="button" class="btn small" id="pt-sellayer">Select the whole layer</button><button type="button" class="btn small" id="pt-selsimilar">Select the same part</button></div></div>`; }
function pick(e,add){ if(!V||!state) return; const S=state; const el=V.r.domElement, r=el.getBoundingClientRect(); const ray=new THREE.Raycaster(); ray.setFromCamera({x:((e.clientX-r.left)/r.width)*2-1,y:-((e.clientY-r.top)/r.height)*2+1},V.cam);
  const meshes=V.grp.children.filter(o=>o.isMesh&&o.userData.owner); const hits=ray.intersectObjects(meshes,false); const hit=hits.find(h=>!h.object.material.transparent)||hits[0]; let i=-1; if(hit&&hit.faceIndex!=null) i=hit.object.userData.owner[hit.faceIndex];
  if(i<0){ if(!add){ S.sel.clear(); render(); } return; }
  if(add){ if(S.sel.has(i)) S.sel.delete(i); else S.sel.add(i); } else { if(S.sel.size===1&&S.sel.has(i)) S.sel.clear(); else { S.sel.clear(); S.sel.add(i); } } render(); }
function stepHTML(S){ const st=steps(S); if(!st.length) return '<p class="empty">Nothing recognisable was found in the massing layer.</p>'; const k=S.cur, idx=st.indexOf(k); const ids=idsOf(S,k);
  const layers={}; for(const i of ids){ const L=S.pieces[i].layerName||'model'; layers[L]=(layers[L]||0)+1; } const ans=S.confirmed[k];
  const gi=S.levels.length?nearestLevel(S,S.groundZ):-1; const sum=k==='ground'?`The ground floor is the plate at model z <input type="number" id="pt-ground" step="0.05" value="${S.groundZ}" aria-label="Ground floor level, model z"> m. Everything below it becomes basement. Pick another level:<span class="pd-levels">${S.levels.map((z,i)=>`<button type="button" class="pd-lv${i===gi?' on':''}" data-glevel="${i}" title="Level at model z ${z.toFixed(2)} m">${i<gi?'B'+(gi-i):'L'+(i-gi+1)}<small>${z.toFixed(1)}</small></button>`).join('')}</span>`:(S.sum[k]||'');
  return `<div class="pd-stephead"><span class="sw lg" style="background:${COL[k]}"></span><h3>${NAME[k]}</h3><span class="ps">${idx+1} of ${st.length}</span></div>
  <p class="pd-sum">${sum}</p>
  <p class="ps">${ids.length} piece${ids.length===1?'':'s'} on ${Object.keys(layers).length} layer${Object.keys(layers).length===1?'':'s'}: ${Object.entries(layers).map(([L,n])=>`<b>${esc(L)}</b>${n>1?' ×'+n:''}`).join(', ')}</p>
  ${k==='mass'||k==='other'?`<p class="ps">${k==='mass'?'Closed volumes that are none of the above; they form the solid massing.':'Small pieces the scan could not place; they are left out.'}</p>`:`<div class="pd-q"><span>Is this right?</span><button type="button" class="btn ${ans===true?'primary':''}" id="pt-yes">Yes</button><button type="button" class="btn ${ans===false?'primary':''}" id="pt-no">No</button></div>`}
  ${S.fix===k?`<div class="pd-fix"><p class="ps">Change what these layers are, or mark the part as not in this model.</p>${Object.keys(layers).map(L=>`<label class="lvl">${esc(L)} <select data-layer="${L.replace(/"/g,'&quot;')}"><option value="auto"${(S.layerChoice[L]||'auto')==='auto'?' selected':''}>As scanned</option>${CATS.map(c=>`<option value="${c[0]}"${S.layerChoice[L]===c[0]?' selected':''}>${c[1]}</option>`).join('')}</select></label>`).join('')}<button type="button" class="btn small" id="pt-none-here">Not in this model</button></div>`:''}
  <div class="pd-nav"><button type="button" class="btn small" id="pt-prev" ${idx<=0?'disabled':''}>← Previous</button><button type="button" class="btn small" id="pt-next" ${idx>=st.length-1?'disabled':''}>Next →</button></div>`; }
function render(){ const S=state; const card=$('parts-dialog'); if(!card) return; const st=steps(S); if(!S.cur||!st.includes(S.cur)) S.cur=st[0];
  const dots=st.map(k=>{ const a=S.confirmed[k]; return `<button type="button" class="pd-dot${k===S.cur&&!S.showLayer?' on':''}" data-step="${k}" title="${NAME[k]}"><span class="sw" style="background:${COL[k]}"></span>${NAME[k]}<i>${a===true?'✓':(a===false?'✕':'')}</i></button>`; }).join('');
  const layers=Object.keys(S.byLayer).sort();
  card.innerHTML=`<div class="pd-head"><div><h2>Check the model</h2><span class="ps">${esc(S.name)} · ${S.pieces.length} pieces on ${layers.length} layer${layers.length===1?'':'s'}</span></div><button type="button" class="btn small" id="pt-close" aria-label="Close">✕</button></div>
  <div class="pd-body"><div class="pd-view" id="pt-view"><div class="pd-tools"><label class="check"><input type="checkbox" id="pt-ghost" ${S.ghost?'checked':''}><span>Show the rest</span></label><button type="button" class="btn small" id="pt-frame">Frame</button></div><div class="pd-hint">Click to select · Shift-click to add · drag to orbit · right-drag to pan · scroll to zoom</div></div>
  <div class="pd-side"><div class="pd-dots">${dots}</div>${selHTML(S)}<div class="pd-step">${S.showLayer?`<div class="pd-stephead"><h3>Layer · ${esc(S.showLayer)}</h3></div><p class="ps">${S.byLayer[S.showLayer].length} pieces, coloured by the part each was read as.</p><button type="button" class="btn small" id="pt-back">Back to the parts</button>`:stepHTML(S)}</div>
  <details class="pd-layers"${S.openLayers?' open':''}><summary>All layers (${layers.length})</summary><table class="pt"><tbody>${layers.map(L=>{ const ids=S.byLayer[L]; const t={}; for(const i of ids) t[S.cat[i]]=(t[S.cat[i]]||0)+1; const top=Object.entries(t).sort((a,b)=>b[1]-a[1]); const q=L.replace(/"/g,'&quot;'); return `<tr class="pick${S.showLayer===L?' on':''}" data-lpick="${q}"><td><input type="checkbox" data-lvis="${q}" ${S.hideLayer[L]?'':'checked'} aria-label="Show layer ${esc(L)}"></td><td><span class="sw" style="background:${COL[top[0][0]]}"></span> ${esc(L)}<br><span class="ps">${top.map(([c,n])=>NAME[c]+(n>1?' ×'+n:'')).join(', ')}</span></td><td><select data-layer="${q}" aria-label="Role of layer ${esc(L)}"><option value="auto"${(S.layerChoice[L]||'auto')==='auto'?' selected':''}>As scanned</option>${CATS.map(c=>`<option value="${c[0]}"${S.layerChoice[L]===c[0]?' selected':''}>${c[1]}</option>`).join('')}</select></td></tr>`; }).join('')}</tbody></table></details>
  <div class="actions"><button type="button" class="btn primary" id="pt-apply">Use these parts</button><button type="button" class="btn" id="pt-skip">Keep the plain import</button></div></div></div>`;
  card.hidden=false; const q=sel=>card.querySelector(sel);
  // the preview survives re-renders: move its canvas into the new host
  const host=q('#pt-view'); if(V){ V.host=host; host.insertBefore(V.r.domElement,host.firstChild); V.ro.disconnect(); V.ro.observe(host); } else viewer(host); paint();
  q('#pt-close').onclick=close; q('#pt-skip').onclick=()=>{ close(); if(LAB.sim&&LAB.sim.afterImport) LAB.sim.afterImport(); }; q('#pt-apply').onclick=apply; q('#pt-frame').onclick=frame;
  q('#pt-ghost').onchange=e=>{ S.ghost=e.target.checked; paint(); };
  card.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{ S.cur=b.dataset.step; S.showLayer=null; S.fix=null; S.sel.clear(); render(); });
  const go=d=>{ const s2=steps(S); const i=s2.indexOf(S.cur)+d; if(i>=0&&i<s2.length){ S.cur=s2[i]; S.fix=null; S.sel.clear(); render(); } };
  const pv=q('#pt-prev'), nx=q('#pt-next'); if(pv) pv.onclick=()=>go(-1); if(nx) nx.onclick=()=>go(1);
  const y=q('#pt-yes'); if(y) y.onclick=()=>{ S.confirmed[S.cur]=true; S.fix=null; S.sel.clear(); const s2=steps(S); const i=s2.indexOf(S.cur); if(i<s2.length-1) S.cur=s2[i+1]; render(); };
  const n=q('#pt-no'); if(n) n.onclick=()=>{ S.fix=S.fix===S.cur?null:S.cur; render(); };
  const nh=q('#pt-none-here'); if(nh) nh.onclick=()=>{ S.confirmed[S.cur]=false; S.fix=null; go(1); render(); };
  const setGround=i=>{ S.groundZ=+S.info[i].z1.toFixed(2); if(S.cat[i]!=='floor') S.pieceChoice[i]='floor'; classify(); S.cur='ground'; S.confirmed.ground=true; S.sel.clear(); S.showLayer=null; render(); };
  const sa=q('#pt-selapply'); if(sa) sa.onclick=()=>{ const v=q('#pt-sellabel').value; const ids=[...S.sel]; if(v==='ground'){ setGround(ids.reduce((a,i)=>S.info[i].z1<S.info[a].z1?i:a,ids[0])); return; } for(const i of ids) S.pieceChoice[i]=v; classify(); S.cur=v==='other'?S.cur:v; S.showLayer=null; S.sel.clear(); render(); };
  const sg=q('#pt-selground'); if(sg) sg.onclick=()=>setGround([...S.sel][0]);
  card.querySelectorAll('[data-glevel]').forEach(b=>b.onclick=()=>{ S.groundZ=+S.levels[+b.dataset.glevel].toFixed(2); S.confirmed.ground=true; render(); });
  const sr=q('#pt-selreset'); if(sr) sr.onclick=()=>{ for(const i of S.sel) delete S.pieceChoice[i]; classify(); render(); };
  const sc=q('#pt-selclear'); if(sc) sc.onclick=()=>{ S.sel.clear(); render(); };
  const sl=q('#pt-sellayer'); if(sl) sl.onclick=()=>{ const Ls=new Set([...S.sel].map(i=>S.pieces[i].layerName||'model')); S.pieces.forEach((p,i)=>{ if(Ls.has(p.layerName||'model')) S.sel.add(i); }); render(); };
  const ss=q('#pt-selsimilar'); if(ss) ss.onclick=()=>{ const cs=new Set([...S.sel].map(i=>S.cat[i])); S.cat.forEach((c,i)=>{ if(cs.has(c)) S.sel.add(i); }); render(); };
  const bk=q('#pt-back'); if(bk) bk.onclick=()=>{ S.showLayer=null; render(); };
  card.querySelectorAll('select[data-layer]').forEach(s=>s.onchange=()=>{ S.layerChoice[s.dataset.layer]=s.value; classify(); render(); });
  card.querySelectorAll('[data-lvis]').forEach(c=>c.onchange=()=>{ S.hideLayer[c.dataset.lvis]=!c.checked; paint(); });
  card.querySelectorAll('[data-lpick]').forEach(r=>r.onclick=e=>{ if(e.target.closest('input,select')) return; const L=r.dataset.lpick; S.showLayer=S.showLayer===L?null:L; S.openLayers=true; render(); });
  const pl=q('.pd-layers'); if(pl) pl.ontoggle=()=>{ S.openLayers=pl.open; };
  const g=q('#pt-ground'); if(g) g.onchange=()=>{ const v=parseFloat(g.value); if(isFinite(v)){ S.groundZ=v; render(); } };
}
function highlight(){ paint(); }
function close(){ const c=$('parts-dialog'); if(c) c.hidden=true; disposeViewer(); if(state){ state.framed=false; } }
/* ---------- apply the confirmed parts ---------- */
/* the ground floor goes onto the site: its level becomes the site ground (z = 0, or the terrain at the tower), and unless the file was
   drawn in the site's own coordinates, the plate turns so its edges run parallel to the parcel and, if it lands off the parcel, moves onto it */
function rectAngle(pts){ const P=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]); if(P.length<3) return 0; const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]); const lo=[],up=[]; for(const p of P){ while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0) lo.pop(); lo.push(p); } for(let i=P.length-1;i>=0;i--){ const p=P[i]; while(up.length>=2&&cr(up[up.length-2],up[up.length-1],p)<=0) up.pop(); up.push(p); } const H=lo.slice(0,-1).concat(up.slice(0,-1));
  let best=0, bA=Infinity; for(let i=0;i<H.length;i++){ const a=H[i], b=H[(i+1)%H.length]; const th=Math.atan2(b[1]-a[1],b[0]-a[0]); const c=Math.cos(th), s=Math.sin(th); let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9; for(const p of H){ const u=p[0]*c+p[1]*s, v=-p[0]*s+p[1]*c; if(u<x0)x0=u; if(u>x1)x1=u; if(v<y0)y0=v; if(v>y1)y1=v; } const A=(x1-x0)*(y1-y0); if(A<bA-1e-6){ bA=A; best=th; } }
  return ((best*180/Math.PI)%90+90)%90; }
function placeOnSite(S,U){ const R=LAB.uploadRaw; const site=LAB.site&&LAB.site.site; const St=LAB.S; if(!site||!site.polygon||!site.polygon.length) return null; if(R&&R.inBase) return {kept:true};
  let ids=groundIds(S); if(!ids.length) ids=S.by.mass.length?S.by.mass:S.pieces.map((p,i)=>i); const pts=[]; let sx=0,sy=0;
  for(const i of ids){ const p=S.pieces[i]; for(let k=0;k<p.f.length;k++){ const q=p.f[k]*3; const x=p.v[q]-U.cx, y=p.v[q+1]-U.cy; pts.push([x,y]); sx+=x; sy+=y; } } if(!pts.length) return null;
  const pc=[sx/pts.length,sy/pts.length]; const aPlate=rectAngle(pts), aSite=rectAngle(site.polygon); let d=aSite-aPlate; d=((d+45)%90+90)%90-45; const P=LAB.PARAMS||{};
  const clamp=(v,k)=>P[k]?Math.max(P[k].min,Math.min(P[k].max,v)):v; St.rotDeg=clamp(Math.round(d*10)/10,'rotDeg');
  const r=St.rotDeg*Math.PI/180, c=Math.cos(r), s=Math.sin(r); const wx=St.posX+pc[0]*c-pc[1]*s, wy=St.posY+pc[0]*s+pc[1]*c; let moved=false;
  if(!LAB.pointInPoly(wx,wy,site.polygon)){ let gx=0,gy=0; for(const q of site.polygon){ gx+=q[0]; gy+=q[1]; } gx/=site.polygon.length; gy/=site.polygon.length; St.posX=clamp(Math.round(gx-(pc[0]*c-pc[1]*s)),'posX'); St.posY=clamp(Math.round(gy-(pc[0]*s+pc[1]*c)),'posY'); moved=true; }
  return {rot:St.rotDeg,moved}; }

/* window sill and head per level and face, and the ceiling height per level, read from the confirmed windows and ceilings;
   heights are metres above that level's plate, so the façade zones and their devices follow the modeled openings */
function openingsToLevels(U,S,winIds,ceilIds){ if(!U.levels) return; const L=U.levels, top=U.top; const span=li=>[L[li],li+1<L.length?L[li+1]:top];
  const open=L.map(()=>({})), ceil=L.map(()=>null);
  // every vertical glass triangle counts on the face it looks out of, so glass joined round a corner still splits by face
  const cx=S.ctx.cx, cy=S.ctx.cy;
  for(const i of winIds){ const p=S.pieces[i], v=p.v; for(let t=0;t<p.f.length;t+=3){ const a=p.f[t]*3,b=p.f[t+1]*3,c=p.f[t+2]*3; const ux=v[b]-v[a],uy=v[b+1]-v[a+1],uz=v[b+2]-v[a+2],wx=v[c]-v[a],wy=v[c+1]-v[a+1],wz=v[c+2]-v[a+2]; const nx=uy*wz-uz*wy, ny=uz*wx-ux*wz, nz=ux*wy-uy*wx; const len=Math.hypot(nx,ny,nz); if(len<0.3||Math.abs(nz/len)>0.2) continue;
      const mx=(v[a]+v[b]+v[c])/3-cx, my=(v[a+1]+v[b+1]+v[c+1])/3-cy; const sg=(nx*mx+ny*my)<0?-1:1; const az=(Math.atan2(sg*nx,sg*ny)*180/Math.PI+360)%360; const o=az<45||az>=315?'N':(az<135?'E':(az<225?'S':'W'));
      const z0=Math.min(v[a+2],v[b+2],v[c+2])-U.minz, z1=Math.max(v[a+2],v[b+2],v[c+2])-U.minz;
      for(let li=0;li<L.length;li++){ const [lo0,hi0]=span(li); const lo=Math.max(z0,lo0), hi=Math.min(z1,hi0); if(hi-lo<0.3) continue; const r=open[li][o]||(open[li][o]=[1e9,-1e9]); r[0]=Math.min(r[0],lo-lo0); r[1]=Math.max(r[1],hi-lo0); } } }
  for(const i of ceilIds){ const z=S.info[i].z0-U.minz; for(let li=0;li<L.length;li++){ const [a,b]=span(li); if(z>a+1.8&&z<b+0.05){ ceil[li]=ceil[li]==null?z-a:Math.min(ceil[li],z-a); break; } } }
  U.openings=open; U.ceilings=ceil;
  const heads=[], sills=[]; open.forEach(r=>{ for(const k in r){ sills.push(r[k][0]); heads.push(r[k][1]); } }); const med=a=>{ a.sort((x,y)=>x-y); return a.length?a[Math.floor(a.length/2)]:null; };
  return {sill:med(sills),head:med(heads),levels:open.filter(r=>Object.keys(r).length).length}; }

function apply(){ const S=state; const ok=k=>S.confirmed[k]!==false&&S.by[k]&&S.by[k].length>0; const io=LAB.io; const U0=LAB.upload; if(!U0){ close(); return; }
  const keepOut=new Set(['structure','stair','other']); if(ok('window')) keepOut.add('window'); if(ok('facade')) keepOut.add('facade'); if(ok('ceiling')) keepOut.add('ceiling');
  const solids=S.pieces.filter((p,i)=>!keepOut.has(S.cat[i])); const plates=ok('floor')?S.by.floor.concat(ok('roof')?S.by.roof:[]).map(i=>S.pieces[i]):null;
  let U; try{ U=io.voxelize(solids.length?solids:S.pieces,S.all,plates); }catch(e){ U=io.voxelize(S.pieces,S.all,plates); }
  if(plates&&plates.length){ U.srcMeshes=plates; Object.assign(U,io.detectLevels(plates,U.minz,U.top,U.footprint,U)); if(U.levels){ U.useLevels=true; U.fromParts=true; io.platesToLevels(U,plates); S.openInfo=openingsToLevels(U,S,ok('window')?S.by.window:[],ok('ceiling')?S.by.ceiling:[]); } }
  U.grade=Math.max(0,Math.min(U.top-2.4,S.groundZ-U.minz)); LAB.upload=U; const St=LAB.S; St.height=Math.round(U.top-U.grade); const placed=S.confirmed.ground!==false?placeOnSite(S,U):null;
  if(ok('core')&&S.coreFrac) St.coreFrac=+S.coreFrac.toFixed(3);
  LAB.modelParts={pieces:S.pieces.map((q,i)=>({v:q.v,f:q.f,cat:S.cat[i]})),rawVersion:LAB.uploadRaw?LAB.uploadRaw.version:0,name:S.name,counts:Object.fromEntries(CATS.map(c=>[c[0],S.by[c[0]].length])),confirmed:Object.fromEntries(Object.keys(S.by).map(k=>[k,ok(k)])),wwr:ok('window')?S.wwr:null,coreFrac:ok('core')?S.coreFrac:null,ceilingH:ok('ceiling')?S.ceilingH:null,openings:S.openInfo||null,groundZ:S.groundZ,levels:S.levels.length,typical:S.typical};
  if(LAB.modelParts.wwr&&LAB.sim&&LAB.sim.applyModelWWR) LAB.sim.applyModelWWR(LAB.modelParts.wwr);
  close(); LAB.update(); if(io.status) io.status(`Model parts confirmed: ${['floor','core','window','facade','structure','stair'].filter(k=>S.by[k].length).map(k=>S.by[k].length+' '+NAME[k].toLowerCase()).join(', ')}; ground at model z ${S.groundZ} m set on the site ground, ${LAB.floors?LAB.floors.length:0} floors above it${placed&&placed.kept?'; kept where the file places it on the site':(placed?`; turned ${placed.rot}° to run parallel to the parcel${placed.moved?' and moved onto it':''}`:'')}.`);
  if(LAB.sim&&LAB.sim.afterImport) LAB.sim.afterImport(); }
/* ---------- entry ---------- */
function open(massing,name){ if(!massing||!massing.length) return; const pieces=LAB.io.splitPieces(massing); let bx0=1e9,bx1=-1e9,by0=1e9,by1=-1e9; for(const m of massing) for(let i=0;i<m.v.length;i+=3){ const x=m.v[i],y=m.v[i+1]; if(x<bx0)bx0=x; if(x>bx1)bx1=x; if(y<by0)by0=y; if(y>by1)by1=y; } const C={cx:(bx0+bx1)/2,cy:(by0+by1)/2}; const inf=pieces.map(p=>info(p,C));
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,z0=1e9,z1=-1e9; for(const I of inf){ x0=Math.min(x0,I.x0); x1=Math.max(x1,I.x1); y0=Math.min(y0,I.y0); y1=Math.max(y1,I.y1); z0=Math.min(z0,I.z0); z1=Math.max(z1,I.z1); }
  const U=LAB.upload; const foot=U&&U.footprint?U.footprint:(x1-x0)*(y1-y0)*0.6;
  const byLayer={}; pieces.forEach((p,i)=>{ const L=p.layerName||'model'; (byLayer[L]=byLayer[L]||[]).push(i); });
  state={name:name||'the model',pieces,info:inf,all:massing,byLayer,layerChoice:{},confirmed:{},ctx:{top:z1,minz:z0,foot:Math.max(50,foot),cx:(x0+x1)/2,cy:(y0+y1)/2,dx:x1-x0,dy:y1-y0},groundZ:null,showLayer:null,hideLayer:{},cur:null,fix:null,ghost:true,framed:false,sel:new Set(),pieceChoice:{}};
  classify(); render(); highlight(); }
function reopen(){ if(state){ render(); highlight(); return true; } return false; }
LAB.parts={open,reopen,close,apply,CATS,get state(){return state;}};
})();
