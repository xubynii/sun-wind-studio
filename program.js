/* Program: the function of each floor, edited two ways.
   1. In the section view: click a floor, drag over several, Shift-click for a range, Ctrl-click to add; the program bar assigns them.
   2. On the Program tab, as layers in the manner of dtmass's block stack: every run of floors with one program is a layer row
      (grip, swatch, program, storey range, eye, lock, back to Auto). Top of the list is the top of the tower; drag a layer above or
      below another to restack, each layer keeping its number of floors.
   Above-ground choices live in S.overrides[i].prog (the field the floor editor writes, so the stacking fills the Auto floors around
   them); basements in S.belowProg[B-number]. Locks in S.progLock, ghosted layers in S.progHide, both keyed by floor. */
(function(){
  const $=id=>document.getElementById(id); const sel=new Set(); let anchor=null;
  const PAL={retail:'#D9A441',office:'#4F7CAC',studio:'#7A6FB0',hotel:'#C0607A',resi:'#5E9E6E',public:'#2F8F8A',amenity:'#7FB069',observation:'#E8692B',boh:'#8A8F96',mep:'#5F646B'};
  const PR=()=>LAB.PROG||{}, col=k=>PAL[k]||'#9AA0A6';
  const S=()=>LAB.S; const bag=n=>(S()[n]||(S()[n]={}));
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const area=f=>f.area||(f.mask?f.mask.cells.reduce((a,b)=>a+b,0):0);
  const save=()=>{ if(LAB.persist) LAB.persist(); };
  let note='';
  /* floors top to bottom, then basements B1, B2 … */
  function rows(){ const F=LAB.floors||[]; const B=((S().typology==='upload'&&LAB.belowFloors)||[]).slice().sort((a,b)=>b.z-a.z);
    const out=F.map(f=>({k:'a:'+f.i,f,below:false,name:'L'+(f.i+1)})).reverse(); B.forEach((f,j)=>out.push({k:'b:'+(j+1),f,below:true,bi:j+1,name:'B'+(j+1)})); return out; }
  function progOf(r){ if(r.below){ const bp=S().belowProg&&S().belowProg[r.bi]; return {p:bp||null,manual:!!bp}; } const o=S().overrides&&S().overrides[r.f.i]; return {p:r.f.prog||null,manual:!!(o&&o.prog)}; }
  const locked=k=>!!(S().progLock&&S().progLock[k]), hidden=k=>!!(S().progHide&&S().progHide[k]);
  function setProg(keys,p){ const ov=bag('overrides'), bp=bag('belowProg'); let n=0, skipped=0;
    for(const k of keys){ if(locked(k)){ skipped++; continue; } const [t,s]=k.split(':'), i=+s; n++;
      if(t==='a'){ const o=ov[i]||(ov[i]={}); if(p) o.prog=p; else { delete o.prog; if(!Object.keys(o).length) delete ov[i]; } } else { if(p) bp[i]=p; else delete bp[i]; } }
    note=skipped?`${skipped} locked floor${skipped>1?'s were':' was'} left as ${skipped>1?'they were':'it was'}.`:'';
    if(n) LAB.update(); refresh(); return n; }
  /* layers: runs of one program, shown top-down; basements are their own group */
  function layers(){ const R=rows(); const up=R.filter(r=>!r.below).reverse(), dn=R.filter(r=>r.below).reverse(); const out=[];
    const run=(list,below)=>{ let cur=null; for(const r of list){ const {p,manual}=progOf(r); const key=p||'none'; if(cur&&cur.p===key){ cur.rows.push(r); cur.manual+=manual?1:0; } else { cur={p:key,rows:[r],manual:manual?1:0,below}; out.push(cur); } } };
    run(up,false); run(dn,true);
    for(const L of out){ L.rows.reverse(); L.keys=L.rows.map(r=>r.k); L.id=L.keys[0]+'…'+L.keys[L.keys.length-1]; const names=L.rows.map(r=>r.name); L.range=L.rows.length===1?names[0]:`${names[0]}–${names[names.length-1]}`; L.area=L.rows.reduce((a,r)=>a+area(r.f),0);
      L.lock=L.keys.every(locked); L.hide=L.keys.every(hidden); L.state=L.manual===0?'auto':(L.manual===L.rows.length?'set':'mixed'); }
    return out.filter(L=>!L.below).reverse().concat(out.filter(L=>L.below).reverse()); }
  /* restack: the above-ground layers in a new top-down order, each keeping its floor count; every floor takes its layer's program by hand */
  function restack(order){ const ov=bag('overrides'); let i=0;
    for(const L of order.slice().reverse()){ for(let n=0;n<L.rows.length;n++,i++){ if(L.p==='none') continue; const o=ov[i]||(ov[i]={}); o.prog=L.p; } }
    sel.clear(); note=''; LAB.update(); refresh(); }
  function opts(cur,short){ return Object.entries(PR()).map(([k,v])=>`<option value="${k}"${k===cur?' selected':''} title="${esc(v.name)}">${esc(short?v.short:v.name)}</option>`).join(''); }
  const ICON={eye:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>',
    eyeoff:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 3l18 18M10.6 6.1A10.6 10.6 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.2 7.6A16.6 16.6 0 0 0 2 12s3.6 6 10 6a9.8 9.8 0 0 0 4.1-.9"/></svg>',
    lock:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    unlock:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>',
    auto:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4"/></svg>'};
  function render(){ const list=$('prog-list'); if(!list||!LAB.floors) return; const P=PR(); const Ls=layers();
    list.innerHTML=Ls.map(L=>{ const on=L.keys.length&&L.keys.every(k=>sel.has(k)); const nm=L.p==='none'?(L.below?'Basement':'Not set'):P[L.p].short; const full=L.p==='none'?nm:P[L.p].name; const drag=!L.below&&!L.lock;
      return `<div class="lrow${on?' on':''}${L.hide?' hiddenb':''}${L.below?' below':''}" data-id="${L.id}" ${drag?'draggable="true"':''} tabindex="0" role="button" aria-pressed="${on}" title="${esc(full)} · ${L.rows.length} floor${L.rows.length>1?'s':''} · ${Math.round(L.area).toLocaleString()} m²">
        ${drag?'<span class="dgrip" aria-hidden="true">⋮⋮</span>':'<span class="nogrip"></span>'}<i class="sw" style="background:${L.p==='none'?'transparent':col(L.p)};${L.p==='none'?'box-shadow:inset 0 0 0 1px var(--line)':''}"></i><span class="nm">${esc(nm)}${L.state==='auto'&&L.p!=='none'?'<em class="au">auto</em>':''}${L.state==='mixed'?'<em class="au">partly set</em>':''}</span><span class="fl">${L.range} · ${L.rows.length}F</span>
        <button class="ic${L.hide?' on':''}" data-act="hide" title="${L.hide?'Show':'Ghost'} these floors in the drawings" aria-label="${L.hide?'Show':'Ghost'} ${esc(nm)}">${ICON[L.hide?'eyeoff':'eye']}</button><button class="ic${L.lock?' on':''}" data-act="lock" title="${L.lock?'Unlock':'Lock'}: a locked layer keeps its program" aria-label="${L.lock?'Unlock':'Lock'} ${esc(nm)}">${ICON[L.lock?'lock':'unlock']}</button><button class="ic" data-act="auto" title="Back to Auto: the stacking chooses" aria-label="Back to Auto for ${esc(nm)}" ${L.state==='auto'||L.lock?'disabled':''}>${ICON.auto}</button></div>`; }).join('');
    list.querySelectorAll('.lrow').forEach(r=>{ const L=Ls.find(x=>x.id===r.dataset.id); if(!L) return;
      r.onclick=e=>{ if(e.target.closest('.ic')) return; if(e.shiftKey||e.ctrlKey||e.metaKey){ const all=L.keys.every(k=>sel.has(k)); for(const k of L.keys) all?sel.delete(k):sel.add(k); } else { const same=L.keys.length===sel.size&&L.keys.every(k=>sel.has(k)); sel.clear(); if(!same) for(const k of L.keys) sel.add(k); } anchor=L.keys[0]; note=''; refresh(); };
      r.onkeydown=e=>{ if(e.target===r&&(e.key==='Enter'||e.key===' ')){ e.preventDefault(); r.onclick(e); } };
      r.querySelector('[data-act="hide"]').onclick=()=>{ const h=bag('progHide'); const v=!L.hide; for(const k of L.keys) v?h[k]=1:delete h[k]; save(); refresh(); };
      r.querySelector('[data-act="lock"]').onclick=()=>{ const h=bag('progLock'); const v=!L.lock; for(const k of L.keys) v?h[k]=1:delete h[k]; save(); refresh(); };
      r.querySelector('[data-act="auto"]').onclick=()=>setProg(L.keys,null);
      if(r.draggable){ r.addEventListener('dragstart',e=>{ e.dataTransfer.setData('text/plain',L.id); e.dataTransfer.effectAllowed='move'; r.classList.add('dragging'); });
        r.addEventListener('dragend',()=>r.classList.remove('dragging'));
        r.addEventListener('dragover',e=>{ e.preventDefault(); const rc=r.getBoundingClientRect(), top=e.clientY<rc.top+rc.height/2; r.classList.toggle('dropTop',top); r.classList.toggle('dropBot',!top); });
        r.addEventListener('dragleave',()=>r.classList.remove('dropTop','dropBot'));
        r.addEventListener('drop',e=>{ e.preventDefault(); r.classList.remove('dropTop','dropBot'); moveLayer(e.dataTransfer.getData('text/plain'),L.id,e.clientY<r.getBoundingClientRect().top+r.getBoundingClientRect().height/2); }); } });
    // mix by area
    const by={}; let tot=0; for(const r of rows()){ const {p}=progOf(r); if(!p) continue; const a=area(r.f); by[p]=(by[p]||0)+a; tot+=a; }
    const ks=Object.keys(by).sort((a,b)=>by[b]-by[a]); $('prog-mix').innerHTML=tot?`<div class="pm-bar" role="img" aria-label="Program mix by floor area">${ks.map(k=>`<span style="width:${(by[k]/tot*100).toFixed(2)}%;background:${col(k)}" title="${esc(P[k].name)} · ${Math.round(by[k]).toLocaleString()} m²"></span>`).join('')}</div><div class="pm-keys">${ks.map(k=>`<span><i style="background:${col(k)}"></i>${esc(P[k].short)} ${Math.round(by[k]/tot*100)}%</span>`).join('')}</div>`:'';
    $('prog-sel').textContent=(sel.size?`${sel.size} floor${sel.size>1?'s':''} selected. Pick a program and press Assign, or Back to Auto.`:'Select a layer here, or select floors straight in the Section view.')+(note?' '+note:''); }
  /* move one above-ground layer above or below another */
  function moveLayer(fromId,toId,above){ const up=layers().filter(x=>!x.below); const from=up.find(x=>x.id===fromId), to=up.find(x=>x.id===toId); if(!from||!to||from===to) return;
    if(up.some(x=>x.lock)){ note='Unlock the locked layers to restack the tower.'; render(); return; }
    const order=up.filter(x=>x!==from); order.splice(order.indexOf(to)+(above?0:1),0,from); restack(order); }
  /* the program bar over the section view */
  function bar(){ let B=$('secprog'); if(B) return B; const vp=$('viewport'); if(!vp) return null; B=document.createElement('div'); B.id='secprog'; B.className='secprog'; B.hidden=true; vp.appendChild(B);
    B.addEventListener('pointerdown',e=>e.stopPropagation()); B.addEventListener('wheel',e=>e.stopPropagation());
    B.addEventListener('click',e=>{ const b=e.target.closest('button[data-p]'); if(b){ if(sel.size) setProg([...sel],b.dataset.p||null); return; } if(e.target.closest('#sp-clear')){ sel.clear(); note=''; refresh(); } });
    B.addEventListener('change',e=>{ if(e.target.id==='sp-tint'){ S().progTint=e.target.checked?1:0; save(); LAB.requestRender(); } });
    renderBar(); return B; }
  function renderBar(){ const B=$('secprog'); if(!B) return; const P=PR(); const lockedSel=[...sel].filter(locked).length;
    const names=[...sel].map(k=>{ const r=rows().find(x=>x.k===k); return r?r.name:''; }).filter(Boolean);
    B.innerHTML=`<div class="sp-head"><b>Program</b><span>${sel.size?`${sel.size===1?names[0]:sel.size+' floors'} selected${lockedSel?` · ${lockedSel} locked`:''}`:'Click a floor in the section · drag over several · Shift-click a range · Ctrl-click to add'}</span>${sel.size?'<button type="button" id="sp-clear" class="sp-x">Clear</button>':''}</div>
      <div class="sp-chips">${Object.entries(P).map(([k,v])=>`<button type="button" data-p="${k}" ${sel.size?'':'disabled'} title="${esc(v.name)}"><i style="background:${col(k)}"></i>${esc(v.short)}</button>`).join('')}<button type="button" data-p="" ${sel.size?'':'disabled'} title="Back to Auto: the stacking chooses"><i style="background:transparent;box-shadow:inset 0 0 0 1px #9AA0A6"></i>Auto</button></div>
      <label class="sp-tint"><input type="checkbox" id="sp-tint" ${tint()?'checked':''}> Colour the rooms by program</label>${note?`<p class="sp-note">${esc(note)}</p>`:''}`; }
  const tint=()=>S().progTint!==0;
  function refresh(){ render(); renderBar(); if(LAB.requestRender) LAB.requestRender(); }
  const order=()=>rows().map(r=>r.k);
  function pick(k,mode){ note='';
    if(mode==='range'&&anchor){ const R=order(), a=R.indexOf(anchor), b=R.indexOf(k); if(a>=0&&b>=0){ sel.clear(); for(let i=Math.min(a,b);i<=Math.max(a,b);i++) sel.add(R[i]); } }
    else if(mode==='toggle'){ sel.has(k)?sel.delete(k):sel.add(k); anchor=k; }
    else { if(sel.size===1&&sel.has(k)) sel.clear(); else { sel.clear(); sel.add(k); } anchor=k; }
    refresh(); }
  function pickRange(a0,k,add,base){ const R=order(), a=R.indexOf(a0), b=R.indexOf(k); if(a<0||b<0) return; sel.clear(); if(add&&base) for(const x of base) sel.add(x); for(let i=Math.min(a,b);i<=Math.max(a,b);i++) sel.add(R[i]); refresh(); }
  function fillAdd(){ const f=$('prog-from'), t=$('prog-to'), p=$('prog-addp'); if(!f) return; const R=rows().filter(r=>!r.below); const o=R.map(r=>`<option value="${r.k}">${r.name}</option>`).join(''); const fv=f.value, tv=t.value; f.innerHTML=o; t.innerHTML=o; if(fv) f.value=fv; if(tv) t.value=tv; if(!f.value&&R.length) f.value=R[R.length-1].k; if(!t.value&&R.length) t.value=R[R.length-1].k; if(!p.options.length) p.innerHTML=opts('office'); }
  function init(){ if(!$('prog-list')) return; $('prog-pick').innerHTML=opts('office');
    $('prog-assign').addEventListener('click',()=>{ if(sel.size) setProg([...sel],$('prog-pick').value); });
    $('prog-auto').addEventListener('click',()=>{ if(sel.size) setProg([...sel],null); });
    $('prog-add').addEventListener('click',()=>{ const R=order().filter(k=>k.startsWith('a:')); const a=R.indexOf($('prog-from').value), b=R.indexOf($('prog-to').value); if(a<0||b<0) return; setProg(R.slice(Math.min(a,b),Math.max(a,b)+1),$('prog-addp').value); });
    $('prog-insec').addEventListener('click',()=>{ if(LAB.clip&&LAB.clip.openSection) LAB.clip.openSection(); });
    LAB.hooks.afterUpdate.push(()=>{ const keep=new Set(order()); for(const k of [...sel]) if(!keep.has(k)) sel.delete(k); render(); renderBar(); fillAdd(); });
    if(LAB.hooks.tab) LAB.hooks.tab.push(n=>{ if(n==='program') render(); });
    fillAdd(); render(); }
  LAB.program={render,setProg,pick,pickRange,moveLayer,layers,isSel:k=>sel.has(k),hidden,locked,color:col,tint,
    showBar(on){ const B=on?bar():$('secprog'); if(B&&B.hidden===on) B.hidden=!on; }, get sel(){ return sel; }};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0)); else setTimeout(init,0);
})();
