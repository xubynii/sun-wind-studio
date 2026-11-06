/* Sun & Wind Studio ← Tower Design Toolkit. Added by Ruijie Liu on the branch ruijie/tower-toolkit-link (6 Nov 2026) for
   Sinnie's review; nothing else in the tool changes. The Toolkit (https://ruijieliu6.github.io/tower-design-toolkit/) opens
   this page as ?from=toolkit and hands over the tower it designed, so it can be studied here in one click. The model goes
   from one browser window to the other by postMessage; nothing is uploaded.

   Protocol tdt-sunwind@1
     this page → opener  {type:'sw-ready', protocol}            once the Vancouver site has loaded (carries no data)
     opener → this page  {type:'tdt-model', protocol, payload}  taken only from the window that opened this one, and only
                                                                from https://ruijieliu6.github.io or http://localhost / 127.0.0.1
     this page → opener  {type:'sw-imported', ok, summary}      to the sender's origin only
   payload: {project:'vtc'|'city', name, rev, trueNorthDeg, tower:{name,height,storeys},
             meshes:[{layer, role:'massing'|'context', part:'mass', v:[x,y,z…], f:[i,j,k…]}],   (the format io.js reads)
             program:[{level, prog, z0, z1}],                                                    (this tool's program keys)
             site: null | a site file {meta, site, meshes, …} (Real Vancouver)}

   Competition site: the Toolkit and this tool share the block's frame (centre 0, 0; the 144.8 m side along x), so the
   massing lands where it was designed. Real Vancouver: the buildings around the tower replace the site, centred on the
   tower with meta.origin [0, 0], so the importer does not shift the massing again; a later competition-site model brings
   site.json back. The program goes onto the floors when the sliced floors match the Toolkit's storeys one to one. */
(function(){
'use strict';
const LAB=window.LAB; if(!LAB||!LAB.io) return;
const $=LAB.$;
const PROTOCOL='tdt-sunwind@1';
const ORIGIN_OK=/^(https:\/\/ruijieliu6\.github\.io|https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?)$/;
const PROGS=['retail','office','studio','hotel','resi','public','amenity','observation','boh','mep'];
const MAX_FLOATS=6e6, MAX_MESHES=20000;
const T={busy:false,next:null,lastRev:null};

function say(t,bad,state){ const box=$('tdt-link'); if(box){ box.hidden=false; } const el=$('tdt-status'); if(el){ el.textContent=t; el.classList.toggle('bad',!!bad); } const d=$('tdt-dot'); if(d) d.dataset.state=state||(bad?'bad':'ok'); }
const num=x=>typeof x==='number'&&isFinite(x);

/* meshes in the io.js JSON format, checked: finite coordinates, whole indices inside the vertex list, a size cap */
function clean(list,roles,count){
  if(!Array.isArray(list)) throw new Error('no meshes');
  const out=[];
  for(const m of list){
    if(!m||!Array.isArray(m.v)||!Array.isArray(m.f)||m.v.length%3||m.f.length%3||!m.f.length) throw new Error('a mesh is not a vertex and face list');
    count.n+=m.v.length; if(count.n>MAX_FLOATS||out.length>MAX_MESHES) throw new Error('the model is larger than this link takes');
    for(const x of m.v) if(!num(x)) throw new Error('a coordinate is not a number');
    const nv=m.v.length/3; for(const i of m.f) if(!Number.isInteger(i)||i<0||i>=nv) throw new Error('a face points outside its mesh');
    const role=roles?String(m.role):'context'; if(roles&&!roles.includes(role)) throw new Error('unknown role '+role.slice(0,20));
    out.push({layer:String(m.layer||'model').slice(0,160),role,part:m.part==='mass'?'mass':undefined,v:m.v.slice(),f:m.f.slice()});
  }
  return out;
}
/* a Real Vancouver site in this tool's site format (as site.json), from the Toolkit's buildings */
function siteOf(s,count){
  if(!s||typeof s!=='object'||!s.meta) throw new Error('the Real Vancouver site is missing');
  const meshes=clean(s.meshes,null,count).map(m=>{ let top=-1e9; for(let i=2;i<m.v.length;i+=3) if(m.v[i]>top) top=m.v[i]; return {layer:'existing',v:m.v,f:m.f,top}; });
  let site=null; const P=s.site&&s.site.polygon;
  if(Array.isArray(P)&&P.length>=3&&P.every(p=>Array.isArray(p)&&num(p[0])&&num(p[1]))) site={polygon:P.map(p=>[p[0],p[1]]),area:num(s.site.area)?s.site.area:0};
  const M=s.meta, base=(LAB.site&&LAB.site.meta)||{};
  return {meta:{source:String(M.source||'Tower Design Toolkit').slice(0,200),units:'m',origin:[0,0],north:'+y',lat:num(M.lat)?M.lat:base.lat,lon:num(M.lon)?M.lon:base.lon,tz:num(M.tz)?M.tz:(base.tz!=null?base.tz:-8),city:'Vancouver, BC',toolkit:true},site,meshes,future:[],curves:[],labels:[],uses:[]};
}
function northNote(p){
  const n=num(p.trueNorthDeg)?((p.trueNorthDeg%360)+360)%360:0; if(Math.abs(n)<0.05) return '';
  return ` North differs: the Toolkit reads true north on this model at ${n.toFixed(1)}° clockwise from +y (from the competition model's drawn north arrow), while this tool takes +y as north. The studies here use +y; check with Ruijie which one is right.`;
}
function setProgram(program){
  const F=LAB.floors||[]; if(!Array.isArray(program)||!program.length) return '';
  if(F.length!==program.length) return ` Program not set: ${F.length} floors here vs ${program.length} storeys in the Toolkit (choose the programs on the Program tab).`;
  const S=LAB.S; S.overrides=S.overrides||{}; let n=0;
  program.forEach((s,i)=>{ if(s&&PROGS.includes(s.prog)){ const o=S.overrides[i]||(S.overrides[i]={}); o.prog=s.prog; n++; } });
  if(n){ LAB.update(); if(LAB.persist) LAB.persist(); }
  return ` Program from the Toolkit on ${n} floors.`;
}
async function restoreVtcSite(){
  if(!(LAB.site&&LAB.site.meta&&LAB.site.meta.toolkit)) return;
  const r=await fetch('site.json'); if(!r.ok) throw new Error('site.json: HTTP '+r.status);
  LAB.site=await r.json(); LAB.buildSite(); LAB.update();
}
async function take(p,reply){
  if(T.busy){ T.next={p,reply}; return; }
  T.busy=true; say(`Reading ${String(p.name||'the model').slice(0,80)} from Tower Design Toolkit…`,false,'sync');
  try{
    if(p.project!=='vtc'&&p.project!=='city') throw new Error('unknown project');
    const count={n:0}; const meshes=clean(p.meshes,['massing','context'],count);
    if(!meshes.some(m=>m.role==='massing')) throw new Error('no tower massing in the model');
    const name=String(p.name||'Tower Design Toolkit').slice(0,120);
    let where='';
    if(p.project==='city'){ const site=siteOf(p.site,count); LAB.io.applySite(site,name); where=` on Real Vancouver with ${site.meshes.length} buildings around it (they replace the competition site; Restore the Vancouver site any time)`; }
    else { await restoreVtcSite(); where=' on the competition block, where it was designed'; }
    const list=LAB.io.parseJSON(JSON.stringify({meshes})); list.live=true;
    const ok=await new Promise(res=>{ let done=false; const end=v=>{ if(!done){ done=true; res(v); } }; list.after=end; LAB.io.importLive(list,name+' (from Tower Design Toolkit)'); setTimeout(()=>end(!!LAB.upload),8000); });
    if(!ok) throw new Error('the import did not complete; see the Model tab');
    const prog=setProgram(p.program);
    const t=p.tower||{}; const fl=(LAB.floors||[]).length;
    const summary=`Imported ${String(t.name||'the tower').slice(0,60)}${where}: ${fl} floors above ground, ${num(t.height)?Math.round(t.height)+' m':''}.${prog}${northNote(p)}`;
    T.lastRev=p.rev; say(summary,false,'ok'); reply(true,summary);
  }catch(e){ console.error(e); const m='The model from Tower Design Toolkit could not be read: '+(e&&e.message||e); say(m,true,'bad'); reply(false,m); }
  finally{ T.busy=false; if(T.next){ const n=T.next; T.next=null; take(n.p,n.reply); } }
}
function init(){
  const q=new URLSearchParams(window.location.search);
  const opener=window.opener;
  if(q.get('from')!=='toolkit'||!opener) return;
  say('Opened from Tower Design Toolkit: waiting for the model…',false,'sync');
  window.addEventListener('message',e=>{
    if(e.source!==opener||!ORIGIN_OK.test(e.origin)) return;
    const d=e.data; if(!d||typeof d!=='object'||d.type!=='tdt-model'||d.protocol!==PROTOCOL||!d.payload||typeof d.payload!=='object') return;
    take(d.payload,(ok,summary)=>{ try{ opener.postMessage({type:'sw-imported',protocol:PROTOCOL,ok,summary},e.origin); }catch(err){} });
  });
  // ready once site.json has loaded (the import places the massing against it), or after 10 s regardless
  const t0=Date.now(); (function ready(){ if(LAB.site||Date.now()-t0>10000){ try{ opener.postMessage({type:'sw-ready',protocol:PROTOCOL},'*'); }catch(err){} } else setTimeout(ready,150); })();
}
LAB.toolkit={get state(){ return T; }};
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0)); else setTimeout(init,0);
})();
