/* Sun & Wind Studio — help notes: descriptive paragraphs become a "?" beside their heading that shows the text on hover or focus,
   so the panels carry titles, controls and results only. Dynamic notes (typology blurbs, plan notes) stay in the page as hidden sources read at hover time. */
(function(){
'use strict';
const LAB=window.LAB;
const DYNAMIC=new Set(['blurb','step-blurb','zone-blurb','plan-note','sel-info']);
let tip=null;
function ensureTip(){ if(tip) return tip; tip=document.createElement('div'); tip.className='tipbox'; tip.setAttribute('role','tooltip'); tip.hidden=true; document.body.appendChild(tip); return tip; }
function show(icon){ const t=ensureTip(); const src=icon.dataset.src?document.getElementById(icon.dataset.src):null; const html=src?src.innerHTML:icon.dataset.tip; if(!html||!html.trim()){ t.hidden=true; return; } t.innerHTML=html; t.hidden=false;
  const r=icon.getBoundingClientRect(); const vw=window.innerWidth, vh=window.innerHeight; t.style.left='0px'; t.style.top='0px'; const tw=Math.min(340,vw-24); t.style.width=tw+'px'; const th=t.offsetHeight;
  let x=r.left; if(x+tw>vw-12) x=vw-12-tw; if(x<12) x=12; let y=r.bottom+8; if(y+th>vh-12) y=Math.max(12,r.top-8-th); t.style.left=x+'px'; t.style.top=y+'px'; }
function hide(){ if(tip) tip.hidden=true; }
function iconFor(text,srcId){ const s=document.createElement('button'); s.type='button'; s.className='help'; s.setAttribute('aria-label','About this'); s.textContent='?'; if(srcId) s.dataset.src=srcId; else s.dataset.tip=text; s.addEventListener('mouseenter',()=>show(s)); s.addEventListener('mouseleave',hide); s.addEventListener('focus',()=>show(s)); s.addEventListener('blur',hide); s.addEventListener('click',e=>{ e.preventDefault(); if(tip&&!tip.hidden) hide(); else show(s); }); return s; }
function headingBefore(el){ let p=el.previousElementSibling; let guard=0; while(p&&guard++<10){ if(/^H[1-4]$/.test(p.tagName)) return p; p=p.previousElementSibling; } return null; }
function apply(root){
  root=root||document; const nodes=[...root.querySelectorAll('p.plead, p.blurb, p.note, .sel-info')];
  for(const el of nodes){ if(el.dataset.helped) continue; if(el.closest('.tipbox')) continue;
    const id=el.id; const dynamic=id&&DYNAMIC.has(id);
    if(id&&!dynamic) continue; // period-note, io-status and other live status lines stay visible
    if(!dynamic&&!el.textContent.trim()) continue;
    const h=headingBefore(el); const icon=iconFor(el.innerHTML,dynamic?id:null);
    if(h){ h.appendChild(icon); } else { const holder=document.createElement('div'); holder.className='help-row'; holder.appendChild(icon); const lab=document.createElement('span'); lab.textContent=el.classList.contains('note')?'Method and assumptions':'About'; holder.appendChild(lab); el.parentNode.insertBefore(holder,el); }
    el.dataset.helped='1'; el.classList.add('tipsrc'); if(!dynamic){ el.hidden=true; } }
}
window.addEventListener('scroll',hide,true); window.addEventListener('resize',hide);
LAB.help={apply,hide};
})();
