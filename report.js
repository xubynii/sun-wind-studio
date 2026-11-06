/* Supertall tools (shared) — PDF reports (jsPDF) handed to the viewer through the downloads capability */
(function(){
'use strict';
const LAB=window.LAB; const $=LAB.$, fmtI=LAB.fmtI;
let toastEl=null, downloads;
function toast(msg,isErr){ if(!toastEl){ toastEl=document.createElement('div'); toastEl.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);max-width:min(560px,90vw);padding:9px 14px;border-radius:5px;background:var(--panel2);color:var(--ink);border:1px solid var(--line);box-shadow:0 4px 18px rgba(0,0,0,.18);font:13px/1.4 var(--font-b);z-index:50;transition:opacity .3s'; document.body.appendChild(toastEl); }
  toastEl.textContent=msg; toastEl.style.borderColor=isErr?'var(--warn)':'var(--line)'; toastEl.style.opacity='1'; clearTimeout(toastEl._t); toastEl._t=setTimeout(()=>{ toastEl.style.opacity='0'; },isErr?7000:4000); }
LAB.toast=toast;
async function getDownloads(){ if(downloads!==undefined) return downloads; try{ downloads=(window.claude&&window.claude.use)?await window.claude.use('downloads'):null; }catch(e){ downloads=null; } return downloads; }
const clean=s=>String(s).replace(/≥/g,'>=').replace(/≤/g,'<=').replace(/→/g,'->').replace(/₂/g,'2').replace(/ /g,' ').replace(/–/g,'-').replace(/—/g,'-').replace(/’/g,"'").replace(/‑/g,'-');

function svgToPng(svg,w,h){
  return new Promise((res,rej)=>{ const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}); const url=URL.createObjectURL(blob); const img=new Image();
    img.onload=()=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; const ctx=c.getContext('2d'); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg',0.9)); };
    img.onerror=e=>{ URL.revokeObjectURL(url); rej(e); }; img.src=url; });
}
function sectionSVG(){ // standalone copy of the section with computed colours so it renders as an image
  const cs=getComputedStyle(document.documentElement); const v=k=>cs.getPropertyValue(k).trim();
  let s=$('section').innerHTML; if(!s) return null;
  s=s.replace(/var\(--ink\)/g,v('--ink')).replace(/var\(--[a-z0-9-]+\)/g,m=>v(m.slice(4,-1))||'#888');
  const style=`<style>text{font-family:Consolas,monospace;fill:${v('--muted')}} .zl{fill:${v('--ink')};font-weight:600} .ruler{stroke:${v('--line')}} .core{fill:${v('--ink')};fill-opacity:.35} .lead{stroke:${v('--line')};stroke-dasharray:2 2} .void{fill:#ffffff} .mark{fill:${v('--accent')}} rect.sel{stroke:none}</style>`;
  return s.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ').replace(/(<svg[^>]*>)/,'$1'+style);
}
function schemeData(){
  const S=LAB.S, floors=LAB.floors, gfa=floors.reduce((s,f)=>s+f.area,0); const byC={}; for(const f of floors){ const c=LAB.PROG[f.prog].cat; byC[c]=(byC[c]||0)+f.area; }
  const zones=LAB.zonesOf(floors).filter(z=>z.floors.length>=2||z.prog==='retail'||z.prog==='observation');
  return {title:'Massing scheme',settings:[['Typology',LAB.TYP[S.typology].name],['Height / floors',S.height+' m / '+floors.length],['Floor-to-floor',S.f2f.toFixed(2)+' m'],['Base plate',S.width+' x '+S.depth+' m, core '+Math.round(S.coreFrac*100)+'%'],['Position on site',`x ${S.posX} m, y ${S.posY} m, rotated ${S.rotDeg}°`],['Stepping',S.step.mode==='none'?'none':S.step.mode],['Voids',S.voids.length?S.voids.map(v=>v.type).join(', '):'none'],['Program mode',S.mixMode==='target'?'target percentages':'derived from massing']],
    stats:[['Indoor GFA',fmtI(gfa)+' m²'],['Outdoor (terraces, roof, covered voids)',fmtI(floors.reduce((s,f)=>s+f.terrace+f.roof+f.coveredVoid,0))+' m²'],['Floor space ratio',LAB.site&&LAB.site.site?(gfa/LAB.site.site.area).toFixed(2):'–']].concat(Object.keys(LAB.CAT).filter(c=>byC[c]).map(c=>[LAB.CAT[c].name,fmtI(byC[c])+' m² ('+(byC[c]/gfa*100).toFixed(0)+'%)'])),
    tables:[{title:'Zones',head:['Levels','Program','Floors','GFA m²','Reading'],rows:[...zones].reverse().map(z=>[`L${z.start+1}-L${z.end+1}`,LAB.PROG[z.prog].name,String(z.floors.length),fmtI(z.gfa),LAB.why(z)])}],
    notes:['Program is derived floor by floor from plate area, lease depth, height and voids, or arranged to target percentages. Every floor is carved as a 1 m solid/void grid.']};
}

async function make(kind){
  if(!window.jspdf||!window.jspdf.jsPDF){ toast('The PDF library did not load in this viewer.',true); return; }
  try{
    const out=await build(kind); if(!out) return;
    const dl=await getDownloads();
    if(dl){ await dl.save({filename:out.filename,data:out.blob}); toast(`Saved ${out.filename} (${(out.blob.size/1024).toFixed(0)} KB).`); return; }
    // outside the claude.ai runtime (GitHub Pages, a local server, the desktop): a plain browser download
    if(window.claude&&window.claude.use){ toast('This viewer cannot save files. Open the page in claude.ai or from its web address to download the report.',true); return; }
    const url=URL.createObjectURL(out.blob); const a=document.createElement('a'); a.href=url; a.download=out.filename; a.rel='noopener'; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },4000); toast(`Downloading ${out.filename} (${(out.blob.size/1024).toFixed(0)} KB).`);
  }catch(e){ if(e&&e.code==='declined') toast('Save cancelled.'); else { console.error(e); toast('Report failed: '+(e.message||e.code||e),true); } }
}
async function build(kind){
  const floors=LAB.floors; if(!floors){ return null; }
  let data=null;
  try{ data= kind==='energy'?LAB.energy.reportData() : kind==='form'?LAB.energy.formReportData() : kind==='scheme'?schemeData() : (LAB.sim?LAB.sim.reportData(kind):null); }catch(e){ console.error(e); }
  if(!data){ toast(kind==='rain'?'Turn rain on first, then make the report.':'Run the study first, then make the report.',true); return null; }
  toast('Building the '+data.title.toLowerCase()+' report…');
  {
    const {jsPDF}=window.jspdf; const doc=new jsPDF({unit:'mm',format:'a4',compress:true}); const PW=210, M=16, CW=PW-2*M; let y=0, page=1;
    const S=LAB.S; const stamp=new Date().toLocaleString();
    const footer=()=>{ doc.setFontSize(8); doc.setTextColor(130); doc.text(clean(`${LAB.APP} · Vancouver Tall competition site · ${stamp} · indicative early-design study · page ${page}`),M,290); doc.setTextColor(30); };
    const need=(h)=>{ if(y+h>278){ footer(); doc.addPage(); page++; y=M; } };
    const h1=(t)=>{ need(14); doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.text(clean(t),M,y+7); y+=12; doc.setFont('helvetica','normal'); };
    const h2=(t,follow)=>{ need(follow||28); doc.setFont('helvetica','bold'); doc.setFontSize(11.5); doc.text(clean(t).toUpperCase(),M,y+5); doc.setDrawColor(190); doc.line(M,y+7,PW-M,y+7); y+=11; doc.setFont('helvetica','normal'); };
    const para=(t,size)=>{ doc.setFontSize(size||9.5); const lines=doc.splitTextToSize(clean(t),CW); need(lines.length*4.2+2); doc.text(lines,M,y+4); y+=lines.length*4.2+2; };
    const pairs=(list,cols)=>{ cols=cols||2; const cw=CW/cols; for(let i=0;i<list.length;i+=cols){ const row=[]; let lines=1;
        for(let c=0;c<cols&&i+c<list.length;c++){ const [k,v]=list[i+c]; doc.setFontSize(10.5); const t=doc.splitTextToSize(clean(v),cw-4); row.push({k,t}); lines=Math.max(lines,t.length); }
        const rowH=5+lines*4.6; need(rowH);
        row.forEach((r,c)=>{ const x=M+c*cw; doc.setFontSize(7.5); doc.setTextColor(110); doc.text(clean(r.k).toUpperCase(),x,y+3); doc.setTextColor(20); doc.setFontSize(10.5); doc.setFont('helvetica','bold'); doc.text(r.t,x,y+7.5); doc.setFont('helvetica','normal'); });
        y+=rowH; } y+=2; };
    const table=(t)=>{ if(t.title) h2(t.title); const n=t.head.length; const lens=t.head.map((h,i)=>Math.max(6,Math.min(44,String(h).length,...t.rows.map(r=>String(r[i]).length)))); const widths=lens.map((l,i)=>Math.max(6,Math.min(44,Math.max(String(t.head[i]).length,...t.rows.map(r=>String(r[i]).length))))); const sum=widths.reduce((a,b)=>a+b,0); const wsc=widths.map(w=>w*CW/sum);
      doc.setFontSize(7.5); doc.setTextColor(110); need(6); let x=M; t.head.forEach((h,i)=>{ doc.text(clean(h).toUpperCase(),x+(i>0?wsc[i]-1:0),y+3,{align:i>0?'right':'left'}); x+=wsc[i]; }); doc.setDrawColor(190); doc.line(M,y+4.5,PW-M,y+4.5); y+=6; doc.setTextColor(20); doc.setFontSize(8.5);
      for(const r of t.rows){ const cells=r.map((c,i)=>doc.splitTextToSize(clean(c),wsc[i]-2)); const hgt=Math.max(...cells.map(c=>c.length))*3.8+2; need(hgt); x=M; cells.forEach((c,i)=>{ doc.text(c,x+(i>0?wsc[i]-1:0),y+3.2,{align:i>0?'right':'left'}); x+=wsc[i]; }); doc.setDrawColor(230); doc.line(M,y+hgt-0.5,PW-M,y+hgt-0.5); y+=hgt; } y+=3; };
    const image=(url,w,h,caption)=>{ const dw=CW, dh=CW*h/w; need(dh+8); doc.addImage(url,'JPEG',M,y,dw,dh); y+=dh+1; if(caption){ doc.setFontSize(8); doc.setTextColor(110); doc.text(clean(caption),M,y+3); doc.setTextColor(20); y+=5; } y+=2; };

    y=M; h1(data.title); doc.setFontSize(9.5); doc.setTextColor(90); doc.text(clean(`${LAB.TYP[S.typology].name} · ${S.height} m · ${floors.length} floors · ${fmtI(floors.reduce((s,f)=>s+f.area,0))} m² GFA · ${stamp}`),M,y+2); doc.setTextColor(20); y+=8;
    if(data.stats&&data.stats.length){ h2('Results'); pairs(data.stats,2); }
    if(data.settings&&data.settings.length){ h2('Settings'); pairs(data.settings,2); }
    const wantPlan=kind!=='energy'&&kind!=='scheme'&&kind!=='form';
    if(wantPlan){ const plan=LAB.captureView({plan:true}); image(plan.url,plan.w,plan.h,'Plan over the site model'+(data.overlay?' · '+data.overlay:'')); }
    const iso=LAB.captureView({iso:true}); image(iso.url,iso.w,iso.h,'Model as studied'+(kind==='rain'?' and rain routing':(kind==='sun'||kind==='custom'?' with current-hour shadows':'')));
    for(const G of [data.grid].concat(data.grids||[]).filter(g=>g&&g.rows&&g.rows.length)){ const cols=G.cols||3, gap=3, cw=(CW-gap*(cols-1))/cols; const f0=G.rows.map(r=>r.cells.find(c=>c.url)).find(Boolean); h2(G.title,f0?cw*f0.h/f0.w+30:28); if(G.caption) para(G.caption,8.5);
      for(const row of G.rows){ const cells=row.cells.filter(c=>c.url); if(!cells.length) continue; const ch=cw*cells[0].h/cells[0].w;
        for(let i=0;i<cells.length;i+=cols){ const line=cells.slice(i,i+cols); need(ch+10); doc.setFontSize(8.5); doc.setFont('helvetica','bold'); doc.text(clean(i===0?row.label:row.label+' (cont.)'),M,y+3); doc.setFont('helvetica','normal'); y+=4.5;
          line.forEach((c,j)=>{ const x=M+j*(cw+gap); doc.addImage(c.url,'JPEG',x,y,cw,ch); doc.setDrawColor(200); doc.rect(x,y,cw,ch); doc.setFontSize(7.5); doc.setTextColor(110); doc.text(clean(c.caption||''),x,y+ch+3); doc.setTextColor(20); });
          y+=ch+5.5; } }
      y+=2; }
    for(const ch of [data.chart].concat(data.charts||[]).filter(Boolean)){ try{ const svg=typeof ch==='string'?ch:ch.svg; if(ch.title) h2(ch.title,CW*666/1140+14); const png=await svgToPng(svg,1140,666); need(CW*666/1140+6); doc.addImage(png,'JPEG',M,y,CW,CW*666/1140); y+=CW*666/1140+4; }catch(e){ console.warn('chart image failed',e); } }
    if(data.tables) for(const t of data.tables) table(t);
    const sec=sectionSVG(); if(sec){ try{ const png=await svgToPng(sec,780,1200); const dh=110, dw=dh*780/1200; h2('Section and program stack',dh+16); doc.addImage(png,'JPEG',M,y,dw,dh);
      const leg=Object.keys(LAB.PROG); let ly=y+4; doc.setFontSize(8.5); for(const k of leg){ const c=LAB.COLORS[k]||'#888'; const n=parseInt(c.slice(1),16); doc.setFillColor((n>>16)&255,(n>>8)&255,n&255); doc.rect(M+dw+8,ly-2.6,3.2,3.2,'F'); doc.text(clean(LAB.PROG[k].name),M+dw+13,ly); ly+=5; } y+=dh+4; }catch(e){ console.warn('section image failed',e); } }
    if(data.notes&&data.notes.length){ h2('Method and assumptions'); for(const n of data.notes) para(n,9); }
    footer();
    const blob=doc.output('blob');
    return {blob,filename:`${kind}-report-${new Date().toISOString().slice(0,10)}.pdf`,pages:page};
  }
}
/* ---------- the visual report: five sections, each led by its key results drawn as scales, then maps, plans and charts with one-line captions ---------- */
const RGB=c=>{ c=String(c||'').trim(); let m;
  if((m=c.match(/^rgba?\(([^)]+)\)/))){ const v=m[1].split(',').map(x=>parseFloat(x)); const a=v.length>3?v[3]:1; return [0,1,2].map(i=>Math.round(v[i]*a+255*(1-a))); }
  if(c[0]==='#'){ if(c.length===4) c='#'+c[1]+c[1]+c[2]+c[2]+c[3]+c[3]; const n=parseInt(c.slice(1,7),16); return [(n>>16)&255,(n>>8)&255,n&255]; }
  return [136,136,136]; };
const mixW=(c,t)=>c.map(v=>Math.round(v+(255-v)*t));
function raster(svg,scale){ scale=scale||3; svg=LAB.viz.pdf(svg); if(!/xmlns=/.test(svg)) svg=svg.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');
  const m=/viewBox="\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg); const w=m?+m[3]:380, h=m?+m[4]:200; const W=Math.round(w*scale), H=Math.round(h*scale);
  if(!/<svg[^>]*\swidth=/.test(svg)) svg=svg.replace('<svg ','<svg width="'+W+'" height="'+H+'" ');
  return new Promise((res,rej)=>{ const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}); const url=URL.createObjectURL(blob); const img=new Image();
    img.onload=()=>{ const c=document.createElement('canvas'); c.width=W; c.height=H; const ctx=c.getContext('2d'); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H); ctx.drawImage(img,0,0,W,H); URL.revokeObjectURL(url); res({url:c.toDataURL('image/jpeg',0.92),w:W,h:H}); };
    img.onerror=e=>{ URL.revokeObjectURL(url); rej(new Error('figure did not render')); }; img.src=url; }); }
async function visual(spec){
  if(!window.jspdf||!window.jspdf.jsPDF){ toast('The PDF library did not load in this viewer.',true); return; }
  const V=LAB.viz, T=k=>RGB(V.tok(k));
  const {jsPDF}=window.jspdf; const doc=new jsPDF({unit:'mm',format:'a4',compress:true}); const PW=210, M=14, CW=PW-2*M, BOT=281; let y=M, page=1, run='';
  const INK=[26,32,38], MUT=[104,114,124], LINE=[222,227,232], TRACK=[234,237,241], TILE=[246,247,249];
  const ACC=T('--accent'), ST={ok:T('--ok'),warn:RGB('#D8962E'),bad:T('--bad'),na:[150,158,166]}, OKBG=mixW(T('--ok'),0.78);
  const stamp=new Date().toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
  const fill=c=>doc.setFillColor(c[0],c[1],c[2]), stroke=c=>doc.setDrawColor(c[0],c[1],c[2]), ink=c=>doc.setTextColor(c[0],c[1],c[2]);
  const font=(sz,b)=>{ doc.setFontSize(sz); doc.setFont('helvetica',b?'bold':'normal'); };
  const fit=(t,w)=>{ t=clean(t); if(doc.getTextWidth(t)<=w) return t; while(t.length>1&&doc.getTextWidth(t+'…')>w) t=t.slice(0,-1); return t+'…'; };
  const footer=()=>{ font(7); ink(MUT); doc.text(clean(`${LAB.APP} · Vancouver Tall competition site · ${stamp} · indicative early-design study`),M,290); doc.text(String(page),PW-M,290,{align:'right'}); };
  const newPage=()=>{ footer(); doc.addPage(); page++; y=M; if(run){ font(7); ink(MUT); doc.text(clean(run),M,y+1); doc.text(fit(spec.title,90),PW-M,y+1,{align:'right'}); stroke(LINE); doc.setLineWidth(0.2); doc.line(M,y+3,PW-M,y+3); y+=8; } };
  const need=h=>{ if(y+h>BOT) newPage(); };
  const pill=(txt,st,xr,yt)=>{ font(6.8,true); const t=clean(txt), w=doc.getTextWidth(t)+4; fill(ST[st]||ST.na); doc.roundedRect(xr-w,yt,w,4.4,2.2,2.2,'F'); ink([255,255,255]); doc.text(t,xr-w/2,yt+3.1,{align:'center'}); return w; };
  /* the scale under a key result: A–E chips, a stacked band bar, or a bar against its passing zone with the threshold ticked */
  const scale=(k,x,yy,w)=>{ const RC=['#1F7A4D','#7FB800','#E3B21C','#E2834F','#B3362B'];
    if(k.rating!=null){ const cw=w/5; RC.forEach((c,i)=>{ const on=i===k.rating; fill(on?RGB(c):mixW(RGB(c),0.62)); doc.roundedRect(x+i*cw+0.4,yy-0.6,cw-0.8,4,0.8,0.8,'F'); font(6.5,true); ink([255,255,255]); doc.text('ABCDE'[i],x+i*cw+cw/2,yy+2.3,{align:'center'}); }); return; }
    if(k.stack){ let xx=x; k.stack.parts.forEach((p,i)=>{ if(p<=0) return; fill(RGB(k.stack.colors[i])); doc.rect(xx,yy,w*p,2.4,'F'); xx+=w*p; }); font(5.8); ink(MUT); doc.text('calm',x,yy+5.4); doc.text('windy',x+w,yy+5.4,{align:'right'}); return; }
    const B=k.bar; if(!B) return; const P=v=>x+w*Math.max(0,Math.min(1,v/B.max));
    fill(TRACK); doc.rect(x,yy,w,2.4,'F'); if(B.zone){ fill(OKBG); doc.rect(P(B.zone[0]),yy,P(B.zone[1])-P(B.zone[0]),2.4,'F'); }
    fill(k.status==='na'?[120,132,144]:ST[k.status]); doc.rect(x,yy+0.5,Math.max(0.6,P(B.v)-x),1.4,'F');
    for(const [v,l] of B.ticks||[]){ const tx=P(v); fill(INK); doc.rect(tx-0.2,yy-0.8,0.4,4,'F'); if(l){ font(5.8); ink(MUT); const f=(v/B.max); doc.text(clean(l),tx,yy+5.6,{align:f>0.85?'right':f<0.12?'left':'center'}); } } };
  const tile=(k,x,yy,w,h)=>{ fill(TILE); doc.roundedRect(x,yy,w,h,1.5,1.5,'F');
    const pw=k.badge?pill(k.badge,k.status,x+w-3,yy+2.6):0; font(8.4,true); ink(INK); doc.text(fit(k.name,w-8-pw),x+3,yy+5.6); font(6.6); ink(MUT); doc.text(fit(k.std,w-6),x+3,yy+9.2);
    font(17,true); ink(k.val==='–'?MUT:INK); const v=clean(k.val); doc.text(v,x+3,yy+17.4); if(k.unit){ const vw=doc.getTextWidth(v); font(7.4); ink(MUT); doc.text(clean(k.unit),x+4+vw,yy+17.4); }
    if(k.val==='–'){ font(6.6); ink(MUT); doc.text(doc.splitTextToSize(clean(k.tip||''),w-6).slice(0,2),x+3,yy+21.4); } else scale(k,x+3,yy+20.4,w-6); };
  const tiles=items=>{ if(!items||!items.length) return; const gap=4, n=3, w=(CW-gap*(n-1))/n, h=28;
    for(let i=0;i<items.length;i+=n){ need(h+4); items.slice(i,i+n).forEach((k,j)=>tile(k,M+j*(w+gap),y,w,h)); y+=h+4; } };
  const legendRow=(items,x,yy,maxW)=>{ font(6.6); let xx=x, ly=yy; for(const [c,l] of items){ const t=clean(l), tw=doc.getTextWidth(t)+7; if(xx+tw>x+maxW){ xx=x; ly+=4; } fill(RGB(c)); stroke(LINE); doc.setLineWidth(0.15); doc.rect(xx,ly-2.3,2.6,2.6,'FD'); ink(MUT); doc.text(t,xx+3.6,ly); xx+=tw; } return ly-yy+4; };
  const img=async f=>{ if(f.img) return f.img; try{ return await raster(f.svg); }catch(e){ console.warn(e); return null; } };
  /* a row-wise grid of figures: images keep their aspect, capped in height; caption and legend under each */
  const grid=async(figs,cols,capH,extra)=>{ if(!figs||!figs.length) return; const gap=5; capH=capH||80;
    const ims=[]; for(const f of figs) ims.push(await img(f));
    for(let i=0;i<figs.length;i+=cols){ const line=figs.slice(i,i+cols), L=ims.slice(i,i+cols); const cw=(CW-gap*(cols-1))/cols;
      const dims=L.map((im,j)=>{ if(!im) return null; let w=cols===1?Math.min(cw,120):cw, h=w*im.h/im.w; if(h>capH){ h=capH; w=h*im.w/im.h; } return {w,h}; });
      const legH=line.map(f=>f.legend?Math.ceil(f.legend.length/4)*4+1:0); const rowH=Math.max(...dims.map(d=>d?d.h:0))+5+Math.max(...legH);
      need(rowH+3+(i+cols>=figs.length?(extra||0):0)); line.forEach((f,j)=>{ const d=dims[j], x=M+j*(cw+gap); if(!d) return; doc.addImage(L[j].url,'JPEG',x,y,d.w,d.h); stroke(LINE); doc.setLineWidth(0.15); doc.rect(x,y,d.w,d.h);
        font(7.2); ink(MUT); doc.text(fit(f.caption||'',Math.max(d.w,cw)),x,y+d.h+3.6); if(f.legend) legendRow(f.legend,x,y+d.h+7.6,Math.max(d.w,cw)); });
      y+=rowH+3; } };
  const secHead=(n,s)=>{ need(30); font(28,true); ink(ACC); doc.text(String(n),M,y+11); font(19,true); ink(INK); doc.text(clean(s.title),M+13,y+10.5); font(7.6); ink(MUT); doc.text(fit(s.std,CW-13),M+13,y+15.6); stroke(INK); doc.setLineWidth(0.5); doc.line(M,y+19,PW-M,y+19); y+=25; };
  const groupHead=g=>{ need(40); fill(RGB(g.color||'#888')); doc.rect(M,y+0.4,3.2,3.2,'F'); font(11.5,true); ink(INK); doc.text(clean(g.name),M+5.4,y+3.5); y+=8; };

  // title block
  font(22,true); ink(INK); doc.text(fit(spec.title,CW),M,y+8); font(8.6); ink(MUT); doc.text(clean(spec.meta.concat([stamp]).concat(spec.author?['by '+spec.author]:[]).join('  ·  ')),M,y+14); y+=22;
  let n=0;
  for(const s of spec.sections){ n++; if(n>1){ run=(s.num||n)+'  '+s.title; newPage(); } secHead(s.num||n,s);
    if(s.key==='summary'){ const im=s.hero; const lw=96; let ih=0; if(im){ ih=Math.min(64,lw*im.h/im.w); const iw=ih*im.w/im.h; doc.addImage(im.url,'JPEG',M,y,iw,ih); }
      const rx=M+lw+6, rw=CW-lw-6; let ry=y;
      if(s.points!=null){ font(30,true); ink(ACC); doc.text(String(s.points),rx,ry+11); const pw=doc.getTextWidth(String(s.points)); font(13,true); ink(MUT); doc.text('/ 3',rx+pw+1.5,ry+11); font(7.6); doc.text('LEED EQ Daylight points (sDA)',rx,ry+16); ry+=23; }
      const T3=[['ok','meet'],['warn','near'],['bad','below']]; const bw=(rw-6)/3; T3.forEach(([k,l],i)=>{ const x=rx+i*(bw+3); fill(ST[k]); doc.roundedRect(x,ry,bw,17,1.5,1.5,'F'); font(18,true); ink([255,255,255]); doc.text(String(s.tally[k]||0),x+bw/2,ry+10,{align:'center'}); font(7,true); doc.text(l,x+bw/2,ry+14.6,{align:'center'}); }); ry+=21;
      if(s.tally.na){ font(7.2); ink(MUT); doc.text(s.tally.na+' not run yet',rx,ry+2); ry+=6; }
      y=Math.max(y+ih,ry)+6;
      for(const g of s.groups){ if(!g.items.length) continue; need(16); font(9.4,true); ink(INK); doc.text(clean(g.name),M,y+3); stroke(LINE); doc.setLineWidth(0.2); doc.line(M,y+5,PW-M,y+5); y+=7;
        for(const k of g.items){ need(12); font(8.6,true); ink(INK); doc.text(fit(k.name,58),M,y+4); font(6.6); ink(MUT); doc.text(fit(k.std,58),M,y+7.8);
          const bx=M+62, bwid=58; if(k.val==='–'){ font(6.8); ink(MUT); doc.text(fit(k.tip||'',bwid),bx,y+5); } else scale(k,bx,y+3,bwid);
          font(12.5,true); ink(k.val==='–'?MUT:INK); const v=clean(k.val); doc.text(v,M+126,y+6.2); if(k.unit){ const vw=doc.getTextWidth(v); font(6.8); ink(MUT); doc.text(clean(k.unit),M+127+vw,y+6.2); }
          if(k.badge) pill(k.badge,k.status,PW-M,y+2.4); y+=10.2; } y+=2; }
      continue; }
    for(const g of s.groups){ groupHead(g); tiles(g.tiles);
      if(g.figs&&g.figs.length) await grid(g.figs,g.figs.length===1?1:2,g.figs.length===1?70:78);
      if(g.strip&&g.strip.length) await grid(g.strip,3,40);
      if(g.rows) for(const [ri,R] of g.rows.entries()){ if(R.label){ need(52); font(8.6,true); ink(INK); doc.text(R.label,M,y+3); y+=5; } await grid(R.figs,g.cols||R.figs.length,62,ri===g.rows.length-1&&g.legend?10:0); }
      if(g.legend){ need(10); y+=legendRow(g.legend,M,y+3,CW)+2; }
      if(g.after) for(const f of g.after) await grid([f],1,70);
      y+=3; } }
  footer();
  const blob=doc.output('blob'); return deliver({blob,filename:'sun-wind-report-'+new Date().toISOString().slice(0,10)+'.pdf',pages:page}); }
async function deliver(out){
  try{ const dl=await getDownloads();
    if(dl){ await dl.save({filename:out.filename,data:out.blob}); toast(`Saved ${out.filename} (${(out.blob.size/1024).toFixed(0)} KB, ${out.pages} pages).`); return out; }
    if(window.claude&&window.claude.use){ toast('This viewer cannot save files. Open the page in claude.ai or from its web address to download the report.',true); return out; }
    const url=URL.createObjectURL(out.blob); const a=document.createElement('a'); a.href=url; a.download=out.filename; a.rel='noopener'; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },4000); toast(`Downloading ${out.filename} (${(out.blob.size/1024).toFixed(0)} KB, ${out.pages} pages).`); return out; }
  catch(e){ if(e&&e.code==='declined'){ toast('Save cancelled.'); return out; } throw e; } }
/* the PDF buttons on the study tabs print the matching section of the same visual report */
const PDF_FOR={sun:['site'],wind:['site'],rain:['site'],form:['energy'],energy:['energy']};
LAB.report={init(){ for(const k of ['rain','sun','wind','form','energy','scheme']){ const b=$('pdf-'+k); if(b) b.addEventListener('click',()=>PDF_FOR[k]&&LAB.sim&&LAB.sim.pdfReport?LAB.sim.pdfReport(PDF_FOR[k]):make(k)); } }, make, build, visual, raster, schemeData, sectionSVG};
})();
