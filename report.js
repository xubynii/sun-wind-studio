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
    if(!dl){ toast('This viewer cannot save files. Open the artifact in claude.ai to download the report.',true); return; }
    await dl.save({filename:out.filename,data:out.blob}); toast(`Saved ${out.filename} (${(out.blob.size/1024).toFixed(0)} KB).`);
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
LAB.report={init(){ for(const k of ['rain','sun','wind','form','energy','scheme']){ const b=$('pdf-'+k); if(b) b.addEventListener('click',()=>make(k)); } }, make, build, schemeData, sectionSVG};
})();
