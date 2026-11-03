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
function classify(){ const S=state; S.ctx.all=S.info; S.cat=S.info.map((I,i)=>{ const L=S.pieces[i].layerName||'model'; const ch=S.layerChoice[L]; if(ch&&ch!=='auto') return ch; return byKeyword(L)||byGeometry(I,S.ctx); }); summarise(); }
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
/* ---------- the review card and the exploded preview ---------- */
const ORDER=['floor','ground','facade','window','roof','ceiling','structure','core','stair','mass','other'];
function nearestLevel(S,z){ let best=0, bd=1e9; S.levels.forEach((l,i)=>{ const d=Math.abs(l-z); if(d<bd){ bd=d; best=i; } }); return S.levels.length?best:0; }
function groundIds(S){ if(!S.levels.length) return []; const z=S.levels[nearestLevel(S,S.groundZ)]; return S.by.floor.filter(i=>Math.abs(S.info[i].z1-z)<0.6); }
function rowHTML(k){ const S=state; const ids=k==='ground'?groundIds(S):S.by[k]; const n=ids.length; const found=k==='ground'||n>0;
  const s=k==='ground'?`ground at model z <input type="number" id="pt-ground" step="0.05" value="${S.groundZ}" aria-label="Ground floor level, model z"> m${S.levels.length?' · plate at '+S.levels[nearestLevel(S,S.groundZ)].toFixed(2)+' m':''}`:(S.sum[k]||'not found in the model');
  const vis=!S.hideCat[k]; const ck=S.confirmed[k];
  return `<tr class="${found?'':'nf'}"><td><label class="eye" title="Show in the preview"><input type="checkbox" data-vis="${k}" ${vis?'checked':''} ${n?'':'disabled'}><span class="sw" style="background:${COL[k]}"></span></label></td><td><b>${NAME[k]}</b><br><span class="ps">${s}</span></td><td>${n?`<button type="button" class="btn small" data-show="${k}" aria-pressed="${S.show===k}" title="Highlight these parts and grey the rest">Isolate</button>`:''}</td><td>${k==='mass'||k==='other'?'':`<label class="check"><input type="checkbox" data-ok="${k}" ${found&&ck!==false?'checked':''} ${found?'':'disabled'}><span>${found?'Correct':'–'}</span></label>`}</td></tr>`; }
function layerRows(){ const S=state; return Object.keys(S.byLayer).sort().map(L=>{ const ids=S.byLayer[L]; const tally={}; for(const i of ids) tally[S.cat[i]]=(tally[S.cat[i]]||0)+1; const top=Object.entries(tally).sort((a,b)=>b[1]-a[1]); const dom=top.length?top[0][0]:'other'; const esc=LAB.viz?LAB.viz.esc(L):L; const q=L.replace(/"/g,'&quot;');
  return `<tr><td><label class="eye"><input type="checkbox" data-lvis="${q}" ${S.hideLayer[L]?'':'checked'}><span class="sw" style="background:${COL[dom]}"></span></label></td><td>${esc}<br><span class="ps">${ids.length} piece${ids.length>1?'s':''} · ${top.map(([c,n])=>NAME[c]+(n>1?' ×'+n:'')).join(', ')}</span></td><td><select data-layer="${q}" aria-label="Role of layer ${esc}"><option value="auto"${(S.layerChoice[L]||'auto')==='auto'?' selected':''}>As scanned</option>${CATS.map(c=>`<option value="${c[0]}"${S.layerChoice[L]===c[0]?' selected':''}>${c[1]}</option>`).join('')}</select></td></tr>`; }).join(''); }
function render(){ const S=state; const card=$('parts-dialog'); if(!card) return; const nL=Object.keys(S.byLayer).length;
  card.innerHTML=`<div class="pd-head"><h2>Check the model</h2><button type="button" class="btn small" id="pt-close" aria-label="Close">✕</button></div>
  <p class="ps">The scan found these parts in <b>${S.name}</b>, drawn exploded in the viewport. Untick a part or a layer to hide it, Isolate one to grey the rest, and confirm each.</p>
  <div class="pt-explode"><label for="pt-ex">Exploded view</label><input type="range" id="pt-ex" min="0" max="1" step="0.05" value="${S.explode}"><span>${Math.round(S.explode*100)}%</span><button type="button" class="btn small" id="pt-frame">Frame</button></div>
  <h3>Parts</h3><table class="pt"><tbody>${ORDER.filter(k=>k!=='other'||S.by.other.length).map(rowHTML).join('')}</tbody></table>
  <h3>Layers <span class="ps">${nL} in the massing</span></h3><div class="pt-lbtn"><button type="button" class="btn small" id="pt-all">Show all</button><button type="button" class="btn small" id="pt-none">Hide all</button></div><table class="pt"><tbody>${layerRows()}</tbody></table>
  <div class="actions"><button type="button" class="btn primary" id="pt-apply">Use these parts</button><button type="button" class="btn" id="pt-skip">Keep the plain import</button></div>
  <p class="ps">Floor plates set the storeys and plate outlines, the ground floor sets the ground level, the core sets the core share, and windows against façade set the window-to-wall ratio of each face. Structure, stairs, windows and façade panels are left out of the solid massing. Hidden parts are only hidden in this preview.</p>`;
  card.hidden=false;
  const q=sel=>card.querySelector(sel);
  q('#pt-close').onclick=close; q('#pt-skip').onclick=()=>{ close(); if(LAB.sim&&LAB.sim.afterImport) LAB.sim.afterImport(); }; q('#pt-apply').onclick=apply; q('#pt-frame').onclick=()=>{ if(LAB.sim&&LAB.sim.framePreview) LAB.sim.framePreview(); };
  const ex=q('#pt-ex'); ex.oninput=()=>{ S.explode=+ex.value; ex.nextElementSibling.textContent=Math.round(S.explode*100)+'%'; highlight(); };
  card.querySelectorAll('[data-show]').forEach(b=>b.onclick=()=>{ S.show=S.show===b.dataset.show?null:b.dataset.show; highlight(); render(); });
  card.querySelectorAll('[data-ok]').forEach(c=>c.onchange=()=>{ S.confirmed[c.dataset.ok]=c.checked; });
  card.querySelectorAll('[data-vis]').forEach(c=>c.onchange=()=>{ S.hideCat[c.dataset.vis]=!c.checked; highlight(); });
  card.querySelectorAll('[data-lvis]').forEach(c=>c.onchange=()=>{ S.hideLayer[c.dataset.lvis]=!c.checked; highlight(); });
  q('#pt-all').onclick=()=>{ S.hideLayer={}; S.hideCat={}; highlight(); render(); }; q('#pt-none').onclick=()=>{ for(const L in S.byLayer) S.hideLayer[L]=true; highlight(); render(); };
  card.querySelectorAll('select[data-layer]').forEach(s=>s.onchange=()=>{ S.layerChoice[s.dataset.layer]=s.value; classify(); highlight(); render(); });
  const g=q('#pt-ground'); if(g) g.onchange=()=>{ const v=parseFloat(g.value); if(isFinite(v)){ S.groundZ=v; highlight(); render(); } };
}
/* exploded axonometric: floors and ceilings lift apart level by level, the roof rises above them, façade and glass move out from their face;
   core, structure, stairs and massing volumes stay in place. Offsets are in model metres (x east, y north, z up). */
function offsets(S){ const e=S.explode, nL=Math.max(1,S.levels.length); const gap=Math.max(2.5,Math.min(8,(S.ctx.top||40)/nL*0.6)); const out=[];
  S.pieces.forEach((p,i)=>{ const I=S.info[i], c=S.cat[i]; let dx=0,dy=0,dz=0; const li=nearestLevel(S,c==='ceiling'?I.z1:I.z0);
    if(c==='floor'||c==='ceiling'||c==='facade'||c==='window') dz=e*gap*li; if(c==='roof') dz=e*(gap*nL+gap*2);
    if(c==='facade'||c==='window'){ const ux=I.cx-S.ctx.cx, uy=I.cy-S.ctx.cy; const ax=Math.abs(ux)/Math.max(1,S.ctx.dx), ay=Math.abs(uy)/Math.max(1,S.ctx.dy); const push=e*Math.max(6,0.25*Math.max(S.ctx.dx,S.ctx.dy)); if(ax>=ay) dx=Math.sign(ux)*push; else dy=Math.sign(uy)*push; if(c==='window'){ dx*=1.35; dy*=1.35; } }
    if(c==='structure') dx=-e*(S.ctx.dx*0.5+12); if(c==='stair'){ dx=e*(S.ctx.dx*0.5+12); }
    out.push({dx,dy,dz}); }); return out; }
function highlight(){ const S=state; if(!S||!LAB.sim||!LAB.sim.showExploded) return; const off=offsets(S); const gIds=S.show==='ground'?new Set(groundIds(S)):null; const items=[];
  S.pieces.forEach((p,i)=>{ const c=S.cat[i]; if(S.hideCat[c]||S.hideLayer[p.layerName||'model']) return; let col=COL[c], dim=false; if(S.show){ const on=S.show==='ground'?gIds.has(i):c===S.show; if(!on) dim=true; else if(S.show==='ground') col=COL.ground; } items.push({p,color:col,dim,off:off[i]}); });
  LAB.sim.showExploded(items); }
function close(){ const c=$('parts-dialog'); if(c) c.hidden=true; if(state){ state.show=null; } if(LAB.sim&&LAB.sim.showExploded) LAB.sim.showExploded(null); }
/* ---------- apply the confirmed parts ---------- */
function apply(){ const S=state; const ok=k=>S.confirmed[k]!==false&&S.by[k]&&S.by[k].length>0; const io=LAB.io; const U0=LAB.upload; if(!U0){ close(); return; }
  const keepOut=new Set(['structure','stair','other']); if(ok('window')) keepOut.add('window'); if(ok('facade')) keepOut.add('facade'); if(ok('ceiling')) keepOut.add('ceiling');
  const solids=S.pieces.filter((p,i)=>!keepOut.has(S.cat[i])); const plates=ok('floor')?S.by.floor.concat(ok('roof')?S.by.roof:[]).map(i=>S.pieces[i]):null;
  let U; try{ U=io.voxelize(solids.length?solids:S.pieces,S.all,plates); }catch(e){ U=io.voxelize(S.pieces,S.all,plates); }
  if(plates&&plates.length){ U.srcMeshes=plates; Object.assign(U,io.detectLevels(plates,U.minz,U.top,U.footprint,U)); if(U.levels){ U.useLevels=true; U.fromParts=true; io.platesToLevels(U,plates); } }
  U.grade=Math.max(0,Math.min(U.top-2.4,S.groundZ-U.minz)); LAB.upload=U; const St=LAB.S; St.height=Math.round(U.top-U.grade);
  if(ok('core')&&S.coreFrac) St.coreFrac=+S.coreFrac.toFixed(3);
  LAB.modelParts={name:S.name,counts:Object.fromEntries(CATS.map(c=>[c[0],S.by[c[0]].length])),confirmed:Object.fromEntries(Object.keys(S.by).map(k=>[k,ok(k)])),wwr:ok('window')?S.wwr:null,coreFrac:ok('core')?S.coreFrac:null,ceilingH:ok('ceiling')?S.ceilingH:null,groundZ:S.groundZ,levels:S.levels.length,typical:S.typical};
  if(LAB.modelParts.wwr&&LAB.sim&&LAB.sim.applyModelWWR) LAB.sim.applyModelWWR(LAB.modelParts.wwr);
  close(); LAB.update(); if(io.status) io.status(`Model parts confirmed: ${['floor','core','window','facade','structure','stair'].filter(k=>S.by[k].length).map(k=>S.by[k].length+' '+NAME[k].toLowerCase()).join(', ')}; ground at model z ${S.groundZ} m, ${LAB.floors?LAB.floors.length:0} floors above it.`);
  if(LAB.sim&&LAB.sim.afterImport) LAB.sim.afterImport(); }
/* ---------- entry ---------- */
function open(massing,name){ if(!massing||!massing.length) return; const pieces=LAB.io.splitPieces(massing); let bx0=1e9,bx1=-1e9,by0=1e9,by1=-1e9; for(const m of massing) for(let i=0;i<m.v.length;i+=3){ const x=m.v[i],y=m.v[i+1]; if(x<bx0)bx0=x; if(x>bx1)bx1=x; if(y<by0)by0=y; if(y>by1)by1=y; } const C={cx:(bx0+bx1)/2,cy:(by0+by1)/2}; const inf=pieces.map(p=>info(p,C));
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,z0=1e9,z1=-1e9; for(const I of inf){ x0=Math.min(x0,I.x0); x1=Math.max(x1,I.x1); y0=Math.min(y0,I.y0); y1=Math.max(y1,I.y1); z0=Math.min(z0,I.z0); z1=Math.max(z1,I.z1); }
  const U=LAB.upload; const foot=U&&U.footprint?U.footprint:(x1-x0)*(y1-y0)*0.6;
  const byLayer={}; pieces.forEach((p,i)=>{ const L=p.layerName||'model'; (byLayer[L]=byLayer[L]||[]).push(i); });
  state={name:name||'the model',pieces,info:inf,all:massing,byLayer,layerChoice:{},confirmed:{},ctx:{top:z1,minz:z0,foot:Math.max(50,foot),cx:(x0+x1)/2,cy:(y0+y1)/2,dx:x1-x0,dy:y1-y0},groundZ:null,show:null,explode:0.6,hideCat:{},hideLayer:{}};
  classify(); render(); highlight(); }
function reopen(){ if(state){ render(); highlight(); return true; } return false; }
LAB.parts={open,reopen,close,apply,CATS,get state(){return state;}};
})();
