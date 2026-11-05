/* Sun & Wind Studio — live link to Rhino. The Rhino plugin (rhino/sw_link.py, "Sun & Wind Link") serves the model on
   http://127.0.0.1:<port>: /sw/rev answers {rev, doc, objects}; /sw/model answers {swlink, rev, doc, units, meshes:[{layer, role, part, v, f}]}.
   The page polls the revision once a second and re-imports when it changes. Each object arrives with its role (massing, shading, pv,
   context, terrain) and part (floor, ground, window, core…), so nothing is guessed from layer names and the parts review applies on its own.
   Open ?link (or ?link=<port>) to connect on load; the copy Rhino serves at http://127.0.0.1:<port>/ connects to itself. */
(function(){
const LAB=window.LAB; const $=LAB.$;
const L={on:false,port:8797,rev:null,applied:null,busy:false,timer:null,fails:0,doc:'',last:0};
const base=()=>{ const loc=window.location; return (/^(127\.0\.0\.1|localhost)$/.test(loc.hostname)&&+loc.port===L.port)?'':'http://127.0.0.1:'+L.port; };
function say(t,bad){ const el=$('rlink-status'); if(!el) return; el.textContent=t; el.classList.toggle('bad',!!bad); }
function dot(state){ const d=$('rlink-dot'); if(d) d.dataset.state=state; }
function ago(t){ const s=Math.round((Date.now()-t)/1000); return s<2?'just now':(s<60?s+' s ago':Math.round(s/60)+' min ago'); }
async function getJSON(path){ const r=await fetch(base()+path,{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }
function schedule(ms){ clearTimeout(L.timer); if(L.on) L.timer=setTimeout(poll,ms); }
async function poll(){
  if(!L.on) return;
  try{
    const h=await getJSON('/sw/rev'); L.fails=0; L.doc=h.doc||'Rhino';
    if(h.rev!==L.applied&&!L.busy){ await pull(h.rev); }
    else{ dot('ok'); say(`Linked to ${L.doc} · ${h.objects||0} objects · ${L.applied!=null?'updated '+ago(L.last):'waiting for the first model'}`); }
    schedule(1000);
  }catch(e){
    L.fails++; dot('bad');
    say(`Can't reach Rhino on 127.0.0.1:${L.port}. In Rhino, run Sun & Wind Link and press Start link. If this page is the claude.ai copy and it still can't connect, your browser is blocking local connections: press Open the tool in the Rhino panel to use the copy Rhino serves, or use Export JSON there.`,true);
    schedule(Math.min(5000,1000+L.fails*1000));
  }
}
async function pull(rev){
  L.busy=true; dot('sync'); say(`Reading the model from ${L.doc}…`);
  try{
    const r=await fetch(base()+'/sw/model',{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status);
    const text=await r.text(); const head=text.slice(0,400); const mr=/"rev"\s*:\s*(\d+)/.exec(head), md=/"doc"\s*:\s*"([^"]*)"/.exec(head);
    const j={rev:mr?+mr[1]:rev,doc:md?md[1]:L.doc};
    const meshes=LAB.io.parseJSON(text);
    if(!meshes.length){ L.applied=j.rev; L.last=Date.now(); dot('ok'); say(`${L.doc} has nothing on the Sun & Wind layers yet. In Rhino, set up the layers or map yours, then draw or move objects onto them.`); return; }
    const keep=$('rlink-keep')&&$('rlink-keep').checked&&LAB.uploadRaw&&LAB.uploadRaw.fromLink&&LAB.S.typology==='upload';
    const saved=keep?{posX:LAB.S.posX,posY:LAB.S.posY,rotDeg:LAB.S.rotDeg}:null;
    await new Promise(res=>{
      meshes.live=true;
      meshes.after=ok=>{ if(ok&&saved){ Object.assign(LAB.S,saved); LAB.update(); } res(); };
      LAB.io.importLive(meshes,(j.doc||'Rhino')+' (live)');
      setTimeout(res,8000); // never wait on a stuck import
    });
    L.applied=j.rev; L.last=Date.now(); dot('ok');
    const n={}; for(const m of meshes){ const k=m.part||m.role||'other'; n[k]=(n[k]||0)+1; }
    say(`Linked to ${L.doc} · updated just now · ${Object.entries(n).map(([k,c])=>c+' '+k).join(', ')}`);
  }catch(e){ console.error(e); dot('bad'); say('The model from Rhino could not be read: '+(e.message||e),true); L.applied=rev; }
  finally{ L.busy=false; }
}
function connect(on){
  L.on=on; const b=$('rlink-go'); if(b) b.textContent=on?'Disconnect':'Connect';
  if(on){ const p=parseInt(($('rlink-port')||{}).value,10); if(p>0&&p<65536) L.port=p; L.applied=null; L.fails=0; say('Connecting…'); poll(); }
  else{ clearTimeout(L.timer); dot('off'); say('Not connected. Edits in Rhino stay there until you connect again.'); }
}
function init(){
  const b=$('rlink-go'); if(!b||b.dataset.stub) return;
  b.addEventListener('click',()=>connect(!L.on));
  const q=new URLSearchParams(window.location.search); if(q.has('link')){ const p=parseInt(q.get('link'),10); if(p>0) $('rlink-port').value=p; else if(/^(127\.0\.0\.1|localhost)$/.test(window.location.hostname)&&window.location.port) $('rlink-port').value=window.location.port; const d=$('rlink'); if(d) d.open=true; connect(true); }
}
LAB.link={init,connect,get state(){ return L; }};
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else setTimeout(init,0);
})();
