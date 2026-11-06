/* Sun & Wind Studio — drawing kit: small SVG figures shared by the review panel and the PDF report.
   Every function returns an SVG string drawn with the page's colour tokens; pdf() resolves the tokens for jsPDF. */
(function(){
'use strict';
const LAB=window.LAB; const fmtI=LAB.fmtI;
const FONT='font-family:var(--font-m);font-size:9px;fill:var(--muted)';
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const svgOpen=(w,h,label,key)=>`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label||'')}"${key?' data-key="'+esc(key)+'"':''}><style>text{${FONT}} .k{fill:var(--ink)} .t{font-size:8px}</style>`;
const fmt=(v,d)=>d==null?(Math.abs(v)>=100?fmtI(v):(Math.abs(v)>=10?v.toFixed(1):v.toFixed(2))):v.toFixed(d);
/* horizontal bars: rows [{label, v, color?, sub?, note?}] */
function hbars(rows,o){ o=o||{}; const W=o.w||380, L=o.labelW||96, Rr=64, rh=o.rowH||18, T=o.title?16:4, H=T+rows.length*rh+4; const max=o.max||Math.max(1e-9,...rows.map(r=>Math.abs(r.v))); const pw=W-L-Rr;
  let s=svgOpen(W,H,o.title||'bars',o.key); if(o.title) s+=`<text class="k" x="0" y="10">${esc(o.title)}</text>`;
  rows.forEach((r,i)=>{ const y=T+i*rh; const w=Math.max(0,pw*Math.abs(r.v)/max); const col=r.color||o.color||'var(--accent)';
    s+=`<text x="${L-6}" y="${y+rh/2+3}" text-anchor="end" class="k">${esc(r.label)}</text><rect x="${L}" y="${y+3}" width="${pw}" height="${rh-6}" rx="2" fill="var(--chart-grid)"/><rect x="${L}" y="${y+3}" width="${w.toFixed(1)}" height="${rh-6}" rx="2" fill="${col}"><title>${esc(r.label)}: ${esc(r.note||fmt(r.v,o.dec)+(o.unit?' '+o.unit:''))}</title></rect>`;
    if(r.mark!=null){ const mx=L+pw*Math.max(0,Math.min(1,r.mark/max)); s+=`<line x1="${mx.toFixed(1)}" x2="${mx.toFixed(1)}" y1="${y+1}" y2="${y+rh-1}" stroke="var(--ink)" stroke-width="1.5"/>`; }
    s+=`<text x="${L+pw+6}" y="${y+rh/2+3}">${esc(r.text!=null?r.text:fmt(r.v,o.dec)+(o.unit?' '+o.unit:''))}</text>`; });
  if(o.markLabel) s+=`<text class="t" x="${W}" y="${H-1}" text-anchor="end">| ${esc(o.markLabel)}</text>`;
  return s+'</svg>'; }
/* paired bars: rows [{label, a, b}] with legend names o.names=[a,b]; a is the design case, b the comparison drawn as an outline */
function pairs(rows,o){ o=o||{}; const W=380, L=o.labelW||96, Rr=70, rh=20, T=16, H=T+rows.length*rh+14; const max=o.max||Math.max(1e-9,...rows.map(r=>Math.max(r.a,r.b))); const pw=W-L-Rr; const ca=o.colors?o.colors[0]:'var(--accent)', cb=o.colors?o.colors[1]:'var(--muted)';
  let s=svgOpen(W,H,o.title||'paired bars',o.key); if(o.title) s+=`<text class="k" x="0" y="10">${esc(o.title)}</text>`;
  rows.forEach((r,i)=>{ const y=T+i*rh; s+=`<text x="${L-6}" y="${y+rh/2+3}" text-anchor="end" class="k">${esc(r.label)}</text><rect x="${L}" y="${y+3}" width="${(pw*r.b/max).toFixed(1)}" height="${rh-7}" rx="2" fill="none" stroke="${cb}" stroke-dasharray="3 2"/><rect x="${L}" y="${y+3}" width="${(pw*r.a/max).toFixed(1)}" height="${rh-7}" rx="2" fill="${ca}"><title>${esc(r.label)}: ${fmt(r.a,o.dec)} vs ${fmt(r.b,o.dec)} ${esc(o.unit||'')}</title></rect><text x="${L+pw+6}" y="${y+rh/2+3}">${fmt(r.a,o.dec)} <tspan fill="var(--muted)">/ ${fmt(r.b,o.dec)}</tspan></text>`; });
  s+=`<rect x="${L}" y="${H-10}" width="10" height="7" rx="2" fill="${ca}"/><text class="t" x="${L+13}" y="${H-3}">${esc(o.names?o.names[0]:'design')}</text><rect x="${L+90}" y="${H-10}" width="10" height="7" rx="2" fill="none" stroke="${cb}" stroke-dasharray="3 2"/><text class="t" x="${L+103}" y="${H-3}">${esc(o.names?o.names[1]:'comparison')}</text>`;
  return s+'</svg>'; }
/* 100% stacked bands: rows [{label, parts:[v…]}], cols [{name,color}] */
function stack(rows,cols,o){ o=o||{}; const W=380, L=o.labelW||110, Rr=8, rh=22, T=o.title?16:4, H=T+rows.length*rh+16; const pw=W-L-Rr;
  let s=svgOpen(W,H,o.title||'bands',o.key); if(o.title) s+=`<text class="k" x="0" y="10">${esc(o.title)}</text>`;
  rows.forEach((r,i)=>{ const y=T+i*rh; const tot=r.parts.reduce((a,b)=>a+b,0)||1; let x=L; s+=`<text x="${L-6}" y="${y+rh/2+3}" text-anchor="end" class="k">${esc(r.label)}</text>`;
    r.parts.forEach((v,j)=>{ const w=pw*v/tot; if(w<=0) return; s+=`<rect x="${x.toFixed(1)}" y="${y+3}" width="${w.toFixed(1)}" height="${rh-7}" fill="${cols[j].color}"><title>${esc(cols[j].name)}: ${Math.round(v/tot*100)}%</title></rect>`; if(w>26) s+=`<text class="t" x="${(x+w/2).toFixed(1)}" y="${y+rh/2+2.5}" text-anchor="middle" fill="#fff" style="fill:#fff">${Math.round(v/tot*100)}%</text>`; x+=w; }); });
  let lx=L; cols.forEach(c=>{ s+=`<rect x="${lx}" y="${H-11}" width="8" height="8" rx="2" fill="${c.color}"/><text class="t" x="${lx+11}" y="${H-4}">${esc(c.name)}</text>`; lx+=14+c.name.length*4.6; });
  return s+'</svg>'; }
/* polar rose: sectors [{name, dir(deg from N), f, s?}]; petal length by f, depth of colour by s when given */
function rose(sectors,o){ o=o||{}; const W=o.size||224, cx=W/2, cy=W/2, R=W/2-26; const maxf=Math.max(1e-9,...sectors.map(r=>r.f)); const col=o.color||'var(--wind)'; const sMax=Math.max(1e-9,...sectors.map(r=>r.s||0));
  let s=svgOpen(W,W,o.title||'rose',o.key); if(o.title) s+=`<text class="k" x="0" y="10">${esc(o.title)}</text>`;
  for(const t of [0.25,0.5,0.75,1]) s+=`<circle cx="${cx}" cy="${cy}" r="${(R*t).toFixed(1)}" fill="none" stroke="var(--line2)"/>`;
  const half=(360/sectors.length/2)*Math.PI/180*0.85;
  sectors.forEach(r=>{ const Lr=R*r.f/maxf, a=r.dir*Math.PI/180; const x1=cx+Lr*Math.sin(a-half), y1=cy-Lr*Math.cos(a-half), x2=cx+Lr*Math.sin(a+half), y2=cy-Lr*Math.cos(a+half); const t=r.s!=null?0.35+0.6*Math.min(1,r.s/sMax):0.8; s+=`<path d="M${cx},${cy}L${x1.toFixed(1)},${y1.toFixed(1)}A${Lr.toFixed(1)},${Lr.toFixed(1)} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)}Z" fill="${col}" fill-opacity="${t.toFixed(2)}"><title>${esc(r.name)}: ${esc(r.text||Math.round(r.f*100)+'%')}${r.s!=null?', '+fmt(r.s,1)+(o.sUnit?' '+o.sUnit:''):''}</title></path>`;
    const lx=cx+(R+12)*Math.sin(a), ly=cy-(R+12)*Math.cos(a); s+=`<text x="${lx.toFixed(1)}" y="${(ly+3).toFixed(1)}" text-anchor="middle">${esc(r.name)}</text>`; });
  s+=`<text class="t" x="${cx+3}" y="${cy-R*0.5+9}">${esc(o.ringLabel||Math.round(maxf*50)+'%')}</text>`; if(o.caption) s+=`<text class="t" x="${cx}" y="${W-3}" text-anchor="middle">${esc(o.caption)}</text>`;
  return s+'</svg>'; }
/* four radial bars N E S W from a centre: faces {N:{v,color,text}} */
function compass(faces,o){ o=o||{}; const W=o.size||224, cx=W/2, cy=W/2, R=W/2-30; const max=o.max||Math.max(1e-9,...Object.values(faces).map(f=>f.v)); const bw=o.barW||26;
  let s=svgOpen(W,W,o.title||'by face',o.key); if(o.title) s+=`<text class="k" x="0" y="10">${esc(o.title)}</text>`;
  for(const t of [0.5,1]) s+=`<circle cx="${cx}" cy="${cy}" r="${(R*t).toFixed(1)}" fill="none" stroke="var(--line2)"/>`;
  const dirs={N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]};
  for(const k of ['N','E','S','W']){ const f=faces[k]; if(!f) continue; const [dx,dy]=dirs[k]; const Lr=R*Math.min(1,f.v/max); const px=-dy*bw/2, py=dx*bw/2; const x0=cx+px, y0=cy+py, x1=cx-px, y1=cy-py, x2=x1+dx*Lr, y2=y1+dy*Lr, x3=x0+dx*Lr, y3=y0+dy*Lr;
    s+=`<path d="M${x0},${y0}L${x1},${y1}L${x2.toFixed(1)},${y2.toFixed(1)}L${x3.toFixed(1)},${y3.toFixed(1)}Z" fill="${f.color||o.color||'var(--accent)'}" fill-opacity="0.9"><title>${k}: ${esc(f.text||fmt(f.v))}</title></path>`;
    const lx=cx+dx*(R+12), ly=cy+dy*(R+12); s+=`<text x="${lx.toFixed(1)}" y="${(ly+3).toFixed(1)}" text-anchor="middle" class="k">${k}</text>`; const tx=cx+dx*(Lr+8)+(dx?0:0), ty=cy+dy*(Lr+8); if(f.text) s+=`<text class="t" x="${tx.toFixed(1)}" y="${(ty+3).toFixed(1)}" text-anchor="middle">${esc(f.text)}</text>`; }
  if(o.caption) s+=`<text class="t" x="${cx}" y="${W-3}" text-anchor="middle">${esc(o.caption)}</text>`;
  return s+'</svg>'; }
/* line chart: series [{pts:[[x,y]…], color, name, dash?}], x horizontal; o.xLabel, o.yLabel, o.yMax, o.marks [{y,label}] */
function line(series,o){ o=o||{}; const W=380,H=o.h||170,L=40,Rr=10,T=o.title?30:14,B=28; const pw=W-L-Rr, ph=H-T-B; const xs=series.flatMap(s=>s.pts.map(p=>p[0])), ys=series.flatMap(s=>s.pts.map(p=>p[1])); const xmax=o.xMax||Math.max(1e-9,...xs), ymax=o.yMax||Math.max(1e-9,...ys);
  const X=x=>L+pw*x/xmax, Y=y=>T+ph-ph*y/ymax; let s=svgOpen(W,H,o.title||'chart',o.key); if(o.title) s+=`<text class="k" x="0" y="10">${esc(o.title)}</text>`;
  for(let i=0;i<=4;i++){ const y=T+ph*i/4, x=L+pw*i/4; s+=`<line x1="${L}" x2="${W-Rr}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--chart-grid)"/><text x="${L-4}" y="${(y+3).toFixed(1)}" text-anchor="end">${fmt(ymax*(1-i/4),o.yDec)}</text><text x="${x.toFixed(1)}" y="${H-B+11}" text-anchor="middle">${fmt(xmax*i/4,o.xDec)}</text>`; }
  (o.marks||[]).forEach(m=>{ s+=`<line x1="${L}" x2="${W-Rr}" y1="${Y(m.y).toFixed(1)}" y2="${Y(m.y).toFixed(1)}" stroke="var(--warn)" stroke-dasharray="3 2"/><text class="t" x="${W-Rr}" y="${(Y(m.y)-2).toFixed(1)}" text-anchor="end">${esc(m.label)}</text>`; });
  series.forEach(se=>{ s+=`<path d="M${se.pts.map(p=>X(p[0]).toFixed(1)+','+Y(p[1]).toFixed(1)).join('L')}" fill="none" stroke="${se.color}" stroke-width="1.8"${se.dash?' stroke-dasharray="4 3"':''}/>`; if(se.dots) se.pts.forEach(p=>{ s+=`<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="2.2" fill="${se.color}"><title>${esc(se.name)}: ${fmt(p[0],1)}, ${fmt(p[1],0)}</title></circle>`; }); });
  s+=`<text x="${W-Rr}" y="${H-2}" text-anchor="end">${esc(o.xLabel||'')}</text>${o.title?'':`<text x="${L}" y="${T-4}">${esc(o.yLabel||'')}</text>`}`; let lx=o.title?L:W-Rr-series.reduce((a,se)=>a+24+se.name.length*4.6,0); const ly=o.title?T-9:T+4; series.forEach(se=>{ s+=`<line x1="${lx}" x2="${lx+14}" y1="${ly}" y2="${ly}" stroke="${se.color}" stroke-width="2"${se.dash?' stroke-dasharray="4 3"':''}/><text class="t" x="${lx+17}" y="${ly+3}">${esc(se.name)}</text>`; lx+=24+se.name.length*4.6; }); if(o.title&&o.yLabel) s+=`<text class="t" x="${W-Rr}" y="${T-6}" text-anchor="end">${esc(o.yLabel)}</text>`;
  return s+'</svg>'; }
/* unrolled elevation: columns = faces, rows = floors (L1 at the bottom), colour = ramp(value); o.ramp(v)→css colour, o.max, o.unit, o.legend [[v,label]…] */
function facadeMap(cols,nF,get,o){ o=o||{}; const W=380, L=28, T=o.title?26:14, B=22, Rr=8; const cw=(W-L-Rr)/cols.length; const H=Math.max(120,Math.min(300,T+B+nF*3)); const rh=(H-T-B)/nF;
  let s=svgOpen(W,H,o.title||'façade map',o.key); if(o.title) s+=`<text class="k" x="0" y="10">${esc(o.title)}</text>`;
  cols.forEach((c,j)=>{ const x=L+j*cw+3; s+=`<text x="${(x+(cw-6)/2).toFixed(1)}" y="${T-3}" text-anchor="middle" class="k">${esc(c.label)}</text>`; for(let i=0;i<nF;i++){ const v=get(i,c.key); if(v==null) continue; const y=T+(nF-1-i)*rh; s+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(2)}" width="${(cw-6).toFixed(1)}" height="${Math.max(0.6,rh-0.3).toFixed(2)}" fill="${o.ramp(v)}"><title>L${i+1} ${esc(c.label)}: ${esc(fmt(v,o.dec)+(o.unit?' '+o.unit:''))}</title></rect>`; } });
  s+=`<text x="${L-3}" y="${T+8}" text-anchor="end">L${nF}</text><text x="${L-3}" y="${H-B}" text-anchor="end">L1</text>`;
  if(o.legend){ let lx=L; o.legend.forEach(([v,label])=>{ s+=`<rect x="${lx}" y="${H-12}" width="10" height="8" rx="2" fill="${o.ramp(v)}"/><text class="t" x="${lx+13}" y="${H-5}">${esc(label)}</text>`; lx+=18+label.length*4.4; }); }
  return s+'</svg>'; }
/* monthly bars: series [{name,color,values[12]}] grouped per month; o.months labels */
function months(series,o){ o=o||{}; const W=380,H=o.h||150,L=40,Rr=8,T=14,B=28,pw=W-L-Rr,ph=H-T-B; const M=o.months||LAB.CLIMATE.months; const max=o.max||Math.max(1e-9,...series.flatMap(s=>s.values));
  const nice=v=>{ const p=Math.pow(10,Math.floor(Math.log10(v))); const f=v/p; return (f<=1?1:(f<=2?2:(f<=5?5:10)))*p; }; const step=nice(max/4), ymax=Math.ceil(max/step)*step; const y=v=>T+ph-(v/ymax)*ph, bw=pw/12;
  let s=svgOpen(W,H,o.title||'monthly',o.key); if(o.title) s+=`<text class="k" x="0" y="10">${esc(o.title)}</text>`;
  for(let v=0;v<=ymax+1e-9;v+=step) s+=`<line x1="${L}" x2="${W-Rr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--chart-grid)"/><text x="${L-4}" y="${(y(v)+3).toFixed(1)}" text-anchor="end">${fmtI(v)}</text>`;
  const n=series.length; for(let m=0;m<12;m++){ series.forEach((se,j)=>{ const v=se.values[m]||0; const w=(bw-4)/n; const x=L+m*bw+2+j*w; if(v>0) s+=`<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${Math.max(1,w-0.6).toFixed(1)}" height="${Math.max(0,y(0)-y(v)).toFixed(1)}" fill="${se.color}"><title>${M[m]} · ${esc(se.name)}: ${fmtI(v)}</title></rect>`; }); s+=`<text x="${(L+m*bw+bw/2).toFixed(1)}" y="${H-B+11}" text-anchor="middle">${M[m]}</text>`; }
  let lx=L; series.forEach(se=>{ s+=`<rect x="${lx}" y="${H-9}" width="8" height="8" rx="2" fill="${se.color}"/><text class="t" x="${lx+11}" y="${H-2}">${esc(se.name)}</text>`; lx+=14+se.name.length*4.6; }); s+=`<text x="${L}" y="${T-4}">${esc(o.yLabel||'')}</text>`;
  return s+'</svg>'; }
/* threshold gauge: value 0–1 on a band with marks [{v,label}]; o.good 'high'|'low' colours the value */
function gauge(v,marks,o){ o=o||{}; const W=380,H=44,L=8,Rr=8,T=16; const pw=W-L-Rr; const ok=o.good==='low'?v<=marks[0].v:v>=marks[0].v; let s=svgOpen(W,H,o.title||'gauge',o.key); if(o.title) s+=`<text class="k" x="0" y="10">${esc(o.title)}</text>`;
  s+=`<rect x="${L}" y="${T}" width="${pw}" height="10" rx="5" fill="var(--chart-grid)"/><rect x="${L}" y="${T}" width="${(pw*Math.max(0,Math.min(1,v))).toFixed(1)}" height="10" rx="5" fill="${ok?'var(--ok)':'var(--bad)'}"/>`;
  marks.forEach(m=>{ const x=L+pw*m.v; s+=`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${T-3}" y2="${T+13}" stroke="var(--ink)"/><text class="t" x="${x.toFixed(1)}" y="${T+24}" text-anchor="middle">${esc(m.label)}</text>`; });
  const vx=L+pw*Math.max(0,Math.min(1,v)); s+=`<text class="k" x="${vx.toFixed(1)}" y="${T-5}" text-anchor="${v>0.85?'end':(v<0.15?'start':'middle')}">${Math.round(v*100)}%${o.suffix?' '+esc(o.suffix):''}</text>`;
  return s+'</svg>'; }
/* radar: items [{label, t (0 centre … 1 rim), text?}] */
function radar(items,o){ o=o||{}; const W=o.size||260, cx=W/2, cy=W/2+4, R=W/2-44; const n=items.length; const P=(i,t)=>{ const a=-Math.PI/2+i*2*Math.PI/n; return [cx+R*t*Math.cos(a),cy+R*t*Math.sin(a)]; };
  let s=svgOpen(W,W,o.title||'radar',o.key); if(o.title) s+=`<text class="k" x="0" y="10">${esc(o.title)}</text>`;
  for(const t of [0.25,0.5,0.75,1]) s+=`<path d="M${items.map((_,i)=>P(i,t).map(v=>v.toFixed(1)).join(',')).join('L')}Z" fill="none" stroke="var(--line2)"/>`;
  items.forEach((it,i)=>{ const [x,y]=P(i,1); s+=`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line2)"/>`; const [lx,ly]=P(i,1.22); s+=`<text class="t" x="${lx.toFixed(1)}" y="${(ly+3).toFixed(1)}" text-anchor="middle">${esc(it.label)}</text>`; });
  s+=`<path d="M${items.map((it,i)=>P(i,Math.max(0.04,it.t)).map(v=>v.toFixed(1)).join(',')).join('L')}Z" fill="${o.color||'var(--accent)'}" fill-opacity="0.25" stroke="${o.color||'var(--accent)'}" stroke-width="1.6"/>`;
  items.forEach((it,i)=>{ const [x,y]=P(i,Math.max(0.04,it.t)); s+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${it.color||o.color||'var(--accent)'}"><title>${esc(it.label)}: ${esc(it.text||'')}</title></circle>`; });
  if(o.caption) s+=`<text class="t" x="${cx}" y="${W-2}" text-anchor="middle">${esc(o.caption)}</text>`;
  return s+'</svg>'; }
/* donut: parts [{name,v,color}] */
function donut(parts,o){ o=o||{}; const W=380,H=o.h||150, cx=78, cy=H/2+(o.title?6:0), R=Math.min(58,H/2-14), r0=R*0.58; const tot=parts.reduce((a,p)=>a+p.v,0)||1; let a0=-Math.PI/2;
  let s=svgOpen(W,H,o.title||'shares',o.key); if(o.title) s+=`<text class="k" x="0" y="10">${esc(o.title)}</text>`;
  parts.forEach(p=>{ const a1=a0+2*Math.PI*p.v/tot; if(p.v<=0) return; const big=a1-a0>Math.PI?1:0; const x0=cx+R*Math.cos(a0),y0=cy+R*Math.sin(a0),x1=cx+R*Math.cos(a1),y1=cy+R*Math.sin(a1),u0=cx+r0*Math.cos(a1),v0=cy+r0*Math.sin(a1),u1=cx+r0*Math.cos(a0),v1=cy+r0*Math.sin(a0);
    s+=`<path d="M${x0.toFixed(1)},${y0.toFixed(1)}A${R},${R} 0 ${big} 1 ${x1.toFixed(1)},${y1.toFixed(1)}L${u0.toFixed(1)},${v0.toFixed(1)}A${r0},${r0} 0 ${big} 0 ${u1.toFixed(1)},${v1.toFixed(1)}Z" fill="${p.color}"><title>${esc(p.name)}: ${Math.round(p.v/tot*100)}%</title></path>`; a0=a1; });
  if(o.centre) s+=`<text class="k" x="${cx}" y="${cy+4}" text-anchor="middle">${esc(o.centre)}</text>`;
  parts.forEach((p,i)=>{ const ly=(o.title?22:12)+i*14; s+=`<rect x="160" y="${ly-8}" width="9" height="9" rx="2" fill="${p.color}"/><text x="173" y="${ly}">${esc(p.name)}</text><text x="${W-8}" y="${ly}" text-anchor="end">${esc(p.text!=null?p.text:Math.round(p.v/tot*100)+'%')}</text>`; });
  return s+'</svg>'; }
/* figure wrapper for the panel */
function fig(svg,caption,cls,key){ const m=key?null:/data-key="([^"]+)"/.exec(svg); const k=key||(m&&m[1]); return `<figure class="fig ${cls||''}"${k?` data-fig="${k}" tabindex="0" role="button" aria-label="Explain this figure"`:''}><div class="figsvg">${svg}</div>${caption?`<figcaption>${caption}</figcaption>`:''}</figure>`; }
function row(...figs){ return `<div class="figrow">${figs.join('')}</div>`; }
/* resolve colour tokens for the PDF */
/* the PDF is always printed in the light palette: the first :root rules, outside the dark-mode blocks */
let LIGHT=null; function lightTokens(){ if(LIGHT) return LIGHT; LIGHT={}; for(const sh of document.styleSheets){ let rules; try{ rules=sh.cssRules; }catch(e){ continue; } for(const r of rules){ if(r.selectorText===':root'&&r.style) for(let i=0;i<r.style.length;i++){ const p=r.style[i]; if(p.startsWith('--')&&!(p in LIGHT)) LIGHT[p]=r.style.getPropertyValue(p).trim(); } } } return LIGHT; }
function tok(k){ return lightTokens()[k]||getComputedStyle(document.documentElement).getPropertyValue(k).trim()||'#888'; }
function pdf(svg){ return svg.replace(/var\((--[a-z0-9-]+)\)/g,(m,k)=>/^--font/.test(k)?'Helvetica, Arial, sans-serif':tok(k)).replace(/font-family:[^;"]+/g,'font-family:Helvetica, Arial, sans-serif'); }
const ramp=(stops)=>v=>{ const t=Math.max(0,Math.min(1,v)); const n=stops.length-1; const i=Math.min(n-1,Math.floor(t*n)); const f=t*n-i; const a=stops[i], b=stops[i+1]; return `rgb(${Math.round(a[0]+(b[0]-a[0])*f)},${Math.round(a[1]+(b[1]-a[1])*f)},${Math.round(a[2]+(b[2]-a[2])*f)})`; };
LAB.viz={tok,hbars,pairs,stack,rose,compass,line,facadeMap,months,gauge,radar,donut,fig,row,pdf,ramp,esc};
})();
