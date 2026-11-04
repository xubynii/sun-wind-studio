/* Program tab: the function of each floor plate.
   Floors above ground keep their choice in S.overrides[i].prog, the same field the floor editor writes, so the stacking
   respects it and fills the Auto floors around it. Basements keep theirs in S.belowProg[B-number].
   Sections, plans, the 3D floor colours and the report read the result, so they stay in sync. */
(function(){
  const $=id=>document.getElementById(id); const sel=new Set(); let anchor=null;
  const PAL={retail:'#D9A441',office:'#4F7CAC',studio:'#7A6FB0',hotel:'#C0607A',resi:'#5E9E6E',public:'#2F8F8A',amenity:'#7FB069',observation:'#E8692B',boh:'#8A8F96',mep:'#5F646B'};
  const PR=()=>LAB.PROG||{}, col=k=>PAL[k]||'#9AA0A6';
  const sg=v=>(v>0.005?'+':v<-0.005?'−':'±')+Math.abs(v).toFixed(2);
  const area=f=>f.area||(f.mask?f.mask.cells.reduce((a,b)=>a+b,0):0);
  function rows(){ const F=LAB.floors||[]; const B=((LAB.S.typology==='upload'&&LAB.belowFloors)||[]).slice().sort((a,b)=>b.z-a.z);
    const out=F.map(f=>({k:'a:'+f.i,f,below:false,name:'L'+(f.i+1)})).reverse(); B.forEach((f,j)=>out.push({k:'b:'+(j+1),f,below:true,bi:j+1,name:'B'+(j+1)})); return out; }
  function progOf(r){ const S=LAB.S; if(r.below){ const bp=S.belowProg&&S.belowProg[r.bi]; return {p:bp||null,manual:!!bp}; } const o=S.overrides&&S.overrides[r.f.i]; return {p:r.f.prog||null,manual:!!(o&&o.prog)}; }
  function setProg(keys,p){ const S=LAB.S; S.overrides=S.overrides||{}; S.belowProg=S.belowProg||{};
    for(const k of keys){ const [t,n]=k.split(':'), i=+n; if(t==='a'){ const o=S.overrides[i]||(S.overrides[i]={}); if(p) o.prog=p; else { delete o.prog; if(!Object.keys(o).length) delete S.overrides[i]; } } else { if(p) S.belowProg[i]=p; else delete S.belowProg[i]; } }
    LAB.update(); render(); }
  function opts(cur,short){ return Object.entries(PR()).map(([k,v])=>`<option value="${k}"${k===cur?' selected':''} title="${v.name}">${short?v.short:v.name}</option>`).join(''); }
  function render(){ const list=$('prog-list'); if(!list||!LAB.floors) return; const R=rows(); const P=PR();
    list.innerHTML=R.map(r=>{ const {p,manual}=progOf(r); const a=area(r.f); const auto=!manual;
      return `<div class="prog-row${sel.has(r.k)?' sel':''}${r.below?' below':''}" data-k="${r.k}" role="listitem"><span class="sw" style="background:${p?col(p):'transparent'};${p?'':'border:1px dashed var(--line)'}"></span><b>${r.name}${manual?'<span class="man" title="Set by hand">●</span>':''}</b><span class="z">${sg(r.f.z)}</span><span class="a">${Math.round(a).toLocaleString()} m²</span><select data-k="${r.k}" aria-label="Program of ${r.name}"><option value=""${auto?' selected':''}>${r.below?'Not set':'Auto'+(p&&P[p]?' ('+P[p].short+')':'')}</option>${opts(manual?p:null,true)}</select></div>`; }).join('');
    // mix by area
    const by={}; let tot=0; for(const r of R){ const {p}=progOf(r); if(!p) continue; const a=area(r.f); by[p]=(by[p]||0)+a; tot+=a; }
    const ks=Object.keys(by).sort((a,b)=>by[b]-by[a]); $('prog-mix').innerHTML=tot?`<div class="pm-bar" role="img" aria-label="Program mix by floor area">${ks.map(k=>`<span style="width:${(by[k]/tot*100).toFixed(2)}%;background:${col(k)}" title="${P[k].name} · ${Math.round(by[k]).toLocaleString()} m²"></span>`).join('')}</div><div class="pm-keys">${ks.map(k=>`<span><i style="background:${col(k)}"></i>${P[k].short} ${Math.round(by[k]/tot*100)}%</span>`).join('')}</div>`:'';
    $('prog-sel').textContent=sel.size?`${sel.size} floor${sel.size>1?'s':''} selected · pick a program and press Assign, or Back to Auto.`:'Click a floor to select it, Shift-click to select a range, or change a floor\'s program right in its row.'; }
  function init(){ if(!$('prog-list')) return; $('prog-pick').innerHTML=opts('office');
    $('prog-list').addEventListener('change',e=>{ const s=e.target.closest('select[data-k]'); if(!s) return; setProg([s.dataset.k],s.value||null); });
    $('prog-list').addEventListener('click',e=>{ if(e.target.closest('select')) return; const row=e.target.closest('.prog-row'); if(!row) return; const k=row.dataset.k; const R=rows().map(r=>r.k);
      if(e.shiftKey&&anchor&&R.includes(anchor)){ const a=R.indexOf(anchor), b=R.indexOf(k); sel.clear(); for(let i=Math.min(a,b);i<=Math.max(a,b);i++) sel.add(R[i]); }
      else if(e.ctrlKey||e.metaKey){ if(sel.has(k)) sel.delete(k); else sel.add(k); anchor=k; }
      else { if(sel.size===1&&sel.has(k)) sel.clear(); else { sel.clear(); sel.add(k); } anchor=k; } render(); });
    $('prog-assign').addEventListener('click',()=>{ if(sel.size) setProg([...sel],$('prog-pick').value); });
    $('prog-auto').addEventListener('click',()=>{ if(sel.size) setProg([...sel],null); });
    LAB.hooks.afterUpdate.push(()=>{ const keep=new Set(rows().map(r=>r.k)); for(const k of [...sel]) if(!keep.has(k)) sel.delete(k); render(); });
    if(LAB.hooks.tab) LAB.hooks.tab.push(n=>{ if(n==='program') render(); });
    render(); }
  LAB.program={render,setProg};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0)); else setTimeout(init,0);
})();
