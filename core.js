/* Supertall Massing Lab core (shared by the Sun & Wind and Energy tools) — core: state, geometry, program engine, site, viewport, section, tables */
(function(){
'use strict';
const CFG = window.LAB_CONFIG || {};
const LAB = window.LAB = { hooks:{afterUpdate:[], afterSite:[], tab:[]}, site:null, rhino:null, upload:null, APP:CFG.name||'Supertall Massing Lab', CFG };

/* ---------- definitions ---------- */
const pct = v => Math.round(v*100)+'%';
const PARAMS = {
  height:{label:'Height (structural)',min:250,max:300,step:1,fmt:v=>v+' m'},
  f2f:{label:'Floor-to-floor',min:3.6,max:4.6,step:0.05,fmt:v=>v.toFixed(2)+' m'},
  width:{label:'Base width (x)',min:30,max:70,step:1,fmt:v=>v+' m'},
  depth:{label:'Base depth (y)',min:30,max:70,step:1,fmt:v=>v+' m'},
  coreFrac:{label:'Core share of base plate',min:0.14,max:0.34,step:0.01,fmt:pct},
  taper:{label:'Top plate scale',min:0.3,max:0.95,step:0.01,fmt:pct},
  profile:{label:'Taper profile',min:0.5,max:2.5,step:0.05,fmt:v=>Math.abs(v-1)<0.03?'linear':(v<1?'concave · '+v.toFixed(2):'convex · '+v.toFixed(2))},
  twist:{label:'Total twist',min:0,max:180,step:5,fmt:v=>v+'°'},
  twistTaper:{label:'Top plate scale',min:0.6,max:1,step:0.01,fmt:pct},
  tiers:{label:'Tiers',min:2,max:6,step:1,fmt:v=>v},
  setback:{label:'Setback per tier',min:0.05,max:0.3,step:0.01,fmt:pct},
  align:{label:'Setback alignment',min:0,max:1,step:0.05,fmt:v=>v<0.03?'centred':(v>0.97?'flush to one corner':pct(v)+' toward corner')},
  blocks:{label:'Blocks',min:2,max:6,step:1,fmt:v=>v},
  shift:{label:'Block shift',min:0,max:0.5,step:0.01,fmt:v=>pct(v)+' of plate'},
  blockTaper:{label:'Block shrink toward top',min:0,max:0.35,step:0.01,fmt:pct},
  posX:{label:'Tower position east–west',min:-60,max:60,step:1,fmt:v=>(v>0?'+':'')+v+' m'},
  posY:{label:'Tower position north–south',min:-35,max:35,step:1,fmt:v=>(v>0?'+':'')+v+' m'},
  rotDeg:{label:'Plan rotation',min:-90,max:90,step:1,fmt:v=>v+'°'},
  bias:{label:'Program bias',min:-1,max:1,step:0.05,fmt:v=>Math.abs(v)<0.03?'neutral':(v<0?'residential '+pct(-v):'commercial '+pct(v))},
  minZone:{label:'Minimum zone',min:3,max:14,step:1,fmt:v=>v+' floors'},
  groundFloors:{label:'Lobby and retail floors',min:1,max:5,step:1,fmt:v=>v},
  mepInterval:{label:'Plant / refuge floor every',min:15,max:40,step:1,fmt:v=>v+' floors'},
  officeMinArea:{label:'Office needs a plate of at least',min:800,max:2200,step:50,fmt:v=>v.toLocaleString()+' m²'},
  resiMaxDepth:{label:'Residential lease depth up to',min:7,max:14,step:0.5,fmt:v=>v.toFixed(1)+' m'},
};
const ENVELOPE = ['height','f2f','coreFrac'];
const SITEP = ['posX','posY','rotDeg'];
const RULEP = ['bias','minZone','groundFloors','mepInterval','officeMinArea','resiMaxDepth'];
const MIXP = {
  public:{label:'Public & landscape',min:0,max:60,step:1,fmt:v=>v+'%'},
  infra:{label:'Infrastructure & BoH',min:0,max:40,step:1,fmt:v=>v+'%'},
  commercial:{label:'Commercial',min:0,max:100,step:1,fmt:v=>v+'%'},
  residential:{label:'Residential',min:0,max:100,step:1,fmt:v=>v+'%'},
};
const SUBP = {
  office:{label:'Commercial → office',min:0,max:100,step:5,fmt:v=>v+'%'},
  studio:{label:'Commercial → studio / creative',min:0,max:100,step:5,fmt:v=>v+'%'},
  retail:{label:'Commercial → rentable (retail, F&B)',min:0,max:100,step:5,fmt:v=>v+'%'},
  hotel:{label:'Residential → hotel',min:0,max:100,step:5,fmt:v=>v+'%'},
  resi:{label:'Residential → rental housing',min:0,max:100,step:5,fmt:v=>v+'%'},
};

const TYP = {
  prism:{name:'Extruded prism',params:['width','depth'],
    blurb:'One plate, top to bottom. Program is set by plate size and depth alone, so a wide prism reads as office and a slim one as residential.',
    defaults:{width:46,depth:42,coreFrac:0.24}},
  taper:{name:'Tapered shaft',params:['width','depth','taper','profile'],
    blurb:'The plate shrinks with height. Deep lower plates take office, the shallower upper plates flip to hotel or residential where the lease depth allows.',
    defaults:{width:60,depth:54,coreFrac:0.22,taper:0.45,profile:1.2}},
  twist:{name:'Twisting tower',params:['width','depth','twist','twistTaper'],
    blurb:'Each plate rotates about the core. Area barely changes, so the twist mostly redistributes the corner units; add taper to shift program.',
    defaults:{width:44,depth:40,coreFrac:0.24,twist:90,twistTaper:0.8}},
  tiered:{name:'Set-back tiers',params:['width','depth','tiers','setback','align'],
    blurb:'Stepped volumes with a broad base. Program snaps to each tier, so tiers become the natural boundaries between office, hotel and residential.',
    defaults:{width:66,depth:60,coreFrac:0.18,tiers:4,setback:0.18,align:0.6}},
  stacked:{name:'Shifted stack',params:['width','depth','blocks','shift','blockTaper'],
    blurb:'Blocks slide off one another around a continuous core. Each block programs as a unit; the terraces at each shift become amenity decks.',
    defaults:{width:48,depth:44,coreFrac:0.24,blocks:4,shift:0.22,blockTaper:0.2}},
  upload:{name:'Uploaded massing',params:[],
    blurb:'Your own model, sliced into floors at the current floor-to-floor height. Voids, per-floor program edits and every impact study run on it as on a generated tower.',
    defaults:{}},
};
const ICONS = {
  prism:'<polygon points="7,2 19,2 19,36 7,36"/>',
  taper:'<polygon points="4,36 22,36 17,2 9,2"/>',
  twist:'<polygon points="6,36 20,36 18,2 8,2"/><path d="M8,2 C15,12 6,22 12,36" style="fill:none"/>',
  tiered:'<polygon points="3,36 23,36 23,24 20,24 20,14 17,14 17,5 11,5 11,14 8,14 8,24 3,24"/>',
  stacked:'<rect x="4" y="27" width="14" height="9"/><rect x="9" y="18" width="14" height="9"/><rect x="4" y="9" width="14" height="9"/><rect x="9" y="1" width="14" height="8"/>',
  upload:'<polygon points="6,36 20,36 20,14 13,14 13,4 6,14"/><path d="M13,4 L20,14" style="fill:none"/>',
};
const PROG = {
  retail:{name:'Rentable commercial',short:'Rentable',cat:'commercial',tok:'--p-retail',eui:220,trips:45},
  office:{name:'Office',short:'Office',cat:'commercial',tok:'--p-office',eui:150,trips:9},
  studio:{name:'Studio / creative',short:'Studio',cat:'commercial',tok:'--p-studio',eui:140,trips:7},
  hotel:{name:'Hotel',short:'Hotel',cat:'residential',tok:'--p-hotel',eui:260,trips:14},
  resi:{name:'Rental housing',short:'Housing',cat:'residential',tok:'--p-resi',eui:130,trips:5.5},
  public:{name:'Public facility',short:'Public',cat:'public',tok:'--p-public',eui:180,trips:25},
  amenity:{name:'Sky garden / landscape',short:'Sky garden',cat:'public',tok:'--p-amenity',eui:25,trips:3},
  observation:{name:'Public observation',short:'Observation',cat:'public',tok:'--p-observation',eui:200,trips:30},
  boh:{name:'BoH / loading / parking',short:'BoH',cat:'infra',tok:'--p-boh',eui:60,trips:1},
  mep:{name:'Plant / refuge',short:'Plant',cat:'infra',tok:'--p-mep',eui:40,trips:0},
};
const CAT = {public:{name:'Public & landscape',tok:'--p-amenity'},infra:{name:'Infrastructure & BoH',tok:'--p-mep'},commercial:{name:'Commercial',tok:'--p-office'},residential:{name:'Residential',tok:'--p-resi'}};
const COLORS = {};
function readColors(){
  const cs = getComputedStyle(document.documentElement);
  for (const k in PROG) COLORS[k] = cs.getPropertyValue(PROG[k].tok).trim();
  for (const k of ['view','grid','ground','context','heritage','plaza','future','accent','core','w1','w2','ink','muted','line','panel2']) COLORS[k] = cs.getPropertyValue('--'+k).trim();
}

let nFloorsNow = 70;
const lvl = v => 'L'+Math.max(1,Math.round(v*nFloorsNow));
const FACE_OPTS = [['S','South (−y)'],['N','North (+y)'],['E','East (+x)'],['W','West (−x)']];
const FACES = { S:{n:[0,-1],along:[1,0]}, N:{n:[0,1],along:[-1,0]}, E:{n:[1,0],along:[0,1]}, W:{n:[-1,0],along:[0,-1]} };

const VOID_TYPES = {
  f2f:{name:'Face-to-face void',chip:'Face to face',
    blurb:'Your SolidVoidTower rule: a portal on one face, a portal on another, a Bezier spine between them, rectangular sections swept along it. Bulge swells the middle into an atrium or pinches it into a throat.',
    params:{
      faceA:{label:'Portal A face',options:FACE_OPTS}, zA:{label:'Portal A height',min:0.02,max:0.98,step:0.005,fmt:v=>lvl(v)+' · '+Math.round(v*S.height)+' m'},
      uA:{label:'Portal A offset along face',min:-0.8,max:0.8,step:0.05,fmt:v=>v.toFixed(2)}, wA:{label:'Portal A width',min:6,max:40,step:1,fmt:v=>v+' m'}, hA:{label:'Portal A height',min:4,max:30,step:1,fmt:v=>v+' m'},
      faceB:{label:'Portal B face',options:FACE_OPTS}, zB:{label:'Portal B height',min:0.02,max:0.98,step:0.005,fmt:v=>lvl(v)+' · '+Math.round(v*S.height)+' m'},
      uB:{label:'Portal B offset along face',min:-0.8,max:0.8,step:0.05,fmt:v=>v.toFixed(2)}, wB:{label:'Portal B width',min:6,max:40,step:1,fmt:v=>v+' m'}, hB:{label:'Portal B height',min:4,max:30,step:1,fmt:v=>v+' m'},
      bulge:{label:'Bulge',min:-0.5,max:0.6,step:0.05,fmt:v=>v>0.02?'swell +'+v.toFixed(2):(v<-0.02?'pinch '+v.toFixed(2):'straight')},
      pull:{label:'Pull (perpendicular run)',min:4,max:24,step:1,fmt:v=>v+' m'},
    },
    defaults:{faceA:'S',zA:0.30,uA:-0.2,wA:22,hA:15,faceB:'E',zB:0.38,uB:0.25,wB:16,hB:12,bulge:0.25,pull:12}},
  gardens:{name:'Spiralling sky gardens',chip:'Sky gardens',
    blurb:'Commerzbank rule: a multi-storey garden bitten from one face, the next garden higher up on the next face, spiralling around the plan.',
    params:{from:{label:'From',min:0,max:1,step:0.01,fmt:lvl},to:{label:'To',min:0,max:1,step:0.01,fmt:lvl},span:{label:'Garden height',min:2,max:6,step:1,fmt:v=>v+' floors'},every:{label:'New garden every',min:3,max:16,step:1,fmt:v=>v+' floors'},depth:{label:'Bite depth',min:6,max:24,step:1,fmt:v=>v+' m'},width:{label:'Bite width',min:0.3,max:1,step:0.05,fmt:pct},sides:{label:'Faces in rotation',options:[[4,'4 faces'],[3,'3 faces'],[2,'2 opposite faces']]}},
    defaults:{from:0.08,to:0.95,span:4,every:4,depth:14,width:1,sides:4}},
  oasis:{name:'Open-air oasis',chip:'Oasis',
    blurb:'CapitaSpring rule: several storeys thrown open to the air around the core, with only structure passing through. Repeat it and you get WOHA-style stacked sky terraces.',
    params:{at:{label:'Starts at',min:0.05,max:0.9,step:0.01,fmt:lvl},floors:{label:'Height',min:2,max:8,step:1,fmt:v=>v+' floors'},open:{label:'Plate opened',min:0.4,max:1,step:0.05,fmt:pct},every:{label:'Repeat every',min:0,max:30,step:1,fmt:v=>v?v+' floors':'no repeat'}},
    defaults:{at:0.33,floors:4,open:0.85,every:0}},
  ribbon:{name:'Pixel ribbon',chip:'Ribbon',
    blurb:'MahaNakhon rule: a ribbon of removed pixels winds around the shaft, exposing the core and making oversized terraces.',
    params:{from:{label:'From',min:0,max:1,step:0.01,fmt:lvl},to:{label:'To',min:0,max:1,step:0.01,fmt:lvl},turns:{label:'Turns',min:0.25,max:3,step:0.25,fmt:v=>v+' ×'},size:{label:'Pixel size',min:6,max:24,step:1,fmt:v=>v+' m'},wobble:{label:'Wobble',min:0,max:1,step:0.05,fmt:pct}},
    defaults:{from:0.05,to:0.98,turns:1.5,size:14,wobble:0.6}},
  crown:{name:'Crown opening',chip:'Crown',
    blurb:'Kingdom Centre rule: a through-opening that widens toward the top, leaving two legs joined by a bridge.',
    params:{from:{label:'Opens from',min:0.5,max:0.95,step:0.01,fmt:lvl},width:{label:'Width at top',min:0.2,max:0.8,step:0.05,fmt:pct},axis:{label:'Opening runs along',options:[['y','y (through N–S)'],['x','x (through E–W)']]}},
    defaults:{from:0.7,width:0.55,axis:'y'}},
  atria:{name:'Zone atria',chip:'Zone atria',
    blurb:'Shanghai Tower rule: the tower is stacked in zones, each with a perimeter sky garden at its base between the skins.',
    params:{from:{label:'From',min:0,max:1,step:0.01,fmt:lvl},to:{label:'To',min:0,max:1,step:0.01,fmt:lvl},every:{label:'Zone height',min:8,max:20,step:1,fmt:v=>v+' floors'},span:{label:'Garden height',min:1,max:4,step:1,fmt:v=>v+' floors'},margin:{label:'Perimeter depth',min:3,max:12,step:0.5,fmt:v=>v+' m'}},
    defaults:{from:0.05,to:0.95,every:13,span:2,margin:6}},
  wells:{name:'Spiralling lightwells',chip:'Lightwells',
    blurb:'30 St Mary Axe rule: perimeter wells, each floor rotated a few degrees from the one below, so the wells spiral up the shaft.',
    params:{from:{label:'From',min:0,max:1,step:0.01,fmt:lvl},to:{label:'To',min:0,max:1,step:0.01,fmt:lvl},count:{label:'Wells',min:2,max:8,step:1,fmt:v=>v},size:{label:'Well size',min:3,max:10,step:0.5,fmt:v=>v+' m'},spin:{label:'Rotation per floor',min:0,max:12,step:0.5,fmt:v=>v+'°'},inset:{label:'Ring radius',min:0.5,max:0.95,step:0.05,fmt:pct}},
    defaults:{from:0.03,to:0.97,count:6,size:6,spin:5,inset:0.78}},
};
const STEP_MODES = {
  none:{name:'None',blurb:'',params:{}},
  spiral:{name:'Cascading spiral terraces',blurb:'The Spiral rule: one terrace per floor, stepping around the plan so the volume tapers as it climbs.',
    params:{from:{label:'From',min:0,max:0.9,step:0.01,fmt:lvl},to:{label:'To',min:0.1,max:1,step:0.01,fmt:lvl},step:{label:'Step per side per turn',min:0.5,max:4,step:0.1,fmt:v=>v.toFixed(1)+' m'},perTurn:{label:'Floors per turn',min:8,max:32,step:1,fmt:v=>v}},
    defaults:{from:0.1,to:1,step:2.2,perTurn:16}},
  wave:{name:'Undulating terraces',blurb:'Aqua rule: the slab edge on every face swells and recedes floor by floor, so terraces differ on each level.',
    params:{from:{label:'From',min:0,max:0.9,step:0.01,fmt:lvl},to:{label:'To',min:0.1,max:1,step:0.01,fmt:lvl},amp:{label:'Terrace depth',min:1,max:6,step:0.25,fmt:v=>v.toFixed(2)+' m'},period:{label:'Vertical period',min:4,max:20,step:1,fmt:v=>v+' floors'},waves:{label:'Waves per face',min:1,max:4,step:1,fmt:v=>v}},
    defaults:{from:0.05,to:1,amp:3.5,period:9,waves:2}},
  pixel:{name:'Staggered slabs',blurb:'56 Leonard rule: slabs slide off axis by a little each, making a flurry of cantilevered terraces.',
    params:{from:{label:'From',min:0,max:0.9,step:0.01,fmt:lvl},to:{label:'To',min:0.1,max:1,step:0.01,fmt:lvl},jitter:{label:'Max offset',min:1,max:8,step:0.5,fmt:v=>v+' m'},seed:{label:'Seed',min:1,max:20,step:1,fmt:v=>v}},
    defaults:{from:0.75,to:1,jitter:4,seed:7}},
  ziggurat:{name:'Regular setbacks',blurb:'Ziggurat rule: every few floors the plate steps in by a fixed amount on the chosen faces.',
    params:{from:{label:'From',min:0,max:0.9,step:0.01,fmt:lvl},to:{label:'To',min:0.1,max:1,step:0.01,fmt:lvl},step:{label:'Step',min:0.5,max:3,step:0.1,fmt:v=>v.toFixed(1)+' m'},every:{label:'Every',min:1,max:8,step:1,fmt:v=>v+' floors'},sides:{label:'Faces',options:[['all','all faces'],['x','east and west'],['y','north and south'],['one','east only']]}},
    defaults:{from:0.2,to:1,step:1.2,every:2,sides:'all'}},
};
const WATER_P = {
  period:{label:'Period',options:[['storm','one design storm'],['period','selected time period · Vancouver monthly normals']]},
  rain:{label:'Annual rainfall',min:300,max:3000,step:50,fmt:v=>v.toLocaleString()+' mm/yr'},
  storm:{label:'Design storm',min:20,max:200,step:5,fmt:v=>v+' mm/h'},
  mode:{label:'Terraces drain',options:[['cascade','outward · cascade over the edge'],['core','inward · gutters and downpipes']]},
  planted:{label:'Terrace area planted',min:0,max:1,step:0.05,fmt:v=>Math.round(v*100)+'%'},
};
const PRECEDENTS = [
  {name:'Your SolidVoidTower study',city:'Rhino script in Documents',h:'36 × 28 m · 48 floors',mine:true,
   mech:'Six face-to-face voids from your VOIDS list: lobby void S→E, west terrace W→N, sky garden S→W, pinched throat E→N, through-void N→S, crown terrace E→S. Loaded onto a 36 × 30 m prism.',apply:'rhino'},
  {name:'Commerzbank Tower',city:'Frankfurt · Foster + Partners, 1997',h:'259 m · 56 fl',
   mech:'Nine 15 m-high glazed sky gardens, three per face, spiral up the triangular plan around a full-height atrium.',
   src:'https://www.skylineatlas.com/commerzbank-tower/',apply:'void',type:'gardens',preset:{from:0.08,to:0.95,span:4,every:4,depth:14,width:1,sides:3}},
  {name:'CapitaSpring',city:'Singapore · BIG + Carlo Ratti, 2021',h:'280 m · 51 fl',
   mech:'The Green Oasis: a four-storey open-air garden on levels 17 to 20 with a 312 m spiralling walkway, offices above and serviced flats below.',
   src:'https://newatlas.com/architecture/capitaspring-singapore/',apply:'void',type:'oasis',preset:{at:0.33,floors:4,open:0.85,every:0}},
  {name:'Oasia Hotel Downtown',city:'Singapore · WOHA, 2016',h:'190 m',
   mech:'Four open-sided sky terraces at storeys 6, 12, 21 and 27, each sheltered by the garden above; four corner cores free the plate; rain irrigates the planted mesh skin.',
   src:'https://woha.net/project/oasia-hotel-downtown/',apply:'void',type:'oasis',preset:{at:0.12,floors:5,open:0.9,every:12}},
  {name:'Shanghai Tower',city:'Shanghai · Gensler, 2015',h:'632 m',
   mech:'Nine stacked zones, each with an atrium sky garden at its base between the two skins. The spiralling crown parapet harvests rainwater for the building.',
   src:'https://www.tomorrow.city/shanghai-tower-sustainable-earthquake-resistant-skyscraper/',apply:'void',type:'atria',preset:{from:0.05,to:0.95,every:13,span:2,margin:6}},
  {name:'MahaNakhon',city:'Bangkok · Büro Ole Scheeren, 2016',h:'314 m',
   mech:'A three-dimensional ribbon of pixels cut from the façade exposes the core and makes oversized terraces and skyboxes.',
   src:'https://newatlas.com/mahanakhon-tower-bangkok-thailand/45261/',apply:'void',type:'ribbon',preset:{from:0.05,to:0.98,turns:1.5,size:14,wobble:0.6}},
  {name:'Kingdom Centre',city:'Riyadh · Ellerbe Becket + Omrania, 2002',h:'302 m · 99 fl',
   mech:'A parabolic opening through the crown, crossed by a 65 m skybridge.',
   src:'https://en.wikipedia.org/wiki/Kingdom_Centre',apply:'void',type:'crown',preset:{from:0.7,width:0.55,axis:'y'}},
  {name:'30 St Mary Axe',city:'London · Foster + Partners, 2004',h:'180 m',
   mech:'Each floor rotated five degrees from the one below, so six perimeter lightwells spiral up the shaft and drive natural ventilation.',
   src:'https://www.archinomy.com/case-studies/30-st-mary-axe-the-gherkin-london/',apply:'void',type:'wells',preset:{from:0.03,to:0.97,count:6,size:6,spin:5,inset:0.78}},
  {name:'The Spiral',city:'New York · BIG, 2022',h:'314 m · 66 fl',
   mech:'A planted terrace on every level, stepping around the tower so the terraces cut ever deeper into the plates and the volume tapers toward the top.',
   src:'https://www.detail.de/de_en/the-spiral-in-new-york-von-big',apply:'step',mode:'spiral',preset:{from:0.1,to:1,step:2.2,perTurn:16}},
  {name:'Aqua',city:'Chicago · Studio Gang, 2009',h:'250 m · 82 fl',
   mech:'Terraces cantilever up to 12 ft and differ in shape from floor to floor, tuned to view, solar shading and unit type, so the tower appears to undulate.',
   src:'https://studiogang.com/projects/aqua-tower/',apply:'step',mode:'wave',preset:{from:0.05,to:1,amp:3.5,period:9,waves:2}},
  {name:'56 Leonard',city:'New York · Herzog & de Meuron, 2017',h:'253 m · 57 fl',
   mech:'A staggered progression of slabs turning slightly off axis as they ascend, producing an irregular flurry of cantilevered terraces.',
   src:'https://www.herzogdemeuron.com/projects/305-56-leonard-street/',apply:'step',mode:'pixel',preset:{from:0.75,to:1,jitter:4,seed:7}},
];
const RHINO_VOIDS = [
  {faceA:'S',zA:9/201.6,uA:-0.2,wA:28,hA:17,faceB:'E',zB:19/201.6,uB:0.25,wB:16,hB:12,bulge:0.15,pull:14},
  {faceA:'W',zA:40/201.6,uA:0.3,wA:18,hA:14,faceB:'N',zB:58/201.6,uB:-0.3,wB:22,hB:17,bulge:0.35,pull:12},
  {faceA:'S',zA:78/201.6,uA:0.25,wA:20,hA:16,faceB:'W',zB:100/201.6,uB:-0.15,wB:16,hB:18,bulge:0.35,pull:13},
  {faceA:'E',zA:118/201.6,uA:-0.35,wA:16,hA:13,faceB:'N',zB:136/201.6,uB:0.3,wB:20,hB:15,bulge:-0.2,pull:12},
  {faceA:'N',zA:152/201.6,uA:-0.3,wA:18,hA:14,faceB:'S',zB:167/201.6,uB:0.3,wB:18,hB:20,bulge:0.25,pull:10},
  {faceA:'E',zA:182/201.6,uA:0.2,wA:16,hA:13,faceB:'S',zB:197/201.6,uB:-0.25,wB:24,hB:16,bulge:0.35,pull:12},
];

/* ---------- state ---------- */
const DEFAULTS = {
  typology:'taper', height:280, f2f:4.0, width:60, depth:54, coreFrac:0.22,
  taper:0.45, profile:1.2, twist:90, twistTaper:0.8, tiers:4, setback:0.18, align:0.6, blocks:4, shift:0.22, blockTaper:0.2,
  posX:0, posY:0, rotDeg:0,
  bias:0, minZone:6, groundFloors:3, mepInterval:25, officeMinArea:1300, resiMaxDepth:11,
  observation:true, useOffice:true, useHotel:true, useResi:true, useStudio:false, snap:true,
  mixMode:'auto', mix:{public:12,infra:8,commercial:45,residential:35}, sub:{office:65,studio:15,retail:20,hotel:35,resi:65},
  overrides:{}, voids:[], step:{mode:'none'}, water:{on:false,rain:1190,storm:80,mode:'cascade',period:'storm',planted:0.5},
  site:{future:true,labels:true,labelPt:12},
  impact:{mode:'none', period:{from:'01-01',to:'12-31'}, sun:{date:'equinox',hour:12,h0:9,h1:17,scope:'date'}, wind:{dir:270,speed:3.5,delta:false,annual:false}, traffic:{auto:25}, density:{radius:100}},
  energy:{wwrN:0.35,wwrE:0.4,wwrS:0.45,wwrW:0.4,glazU:1.4,wallU:0.28,roofU:0.18,shgc:0.35,infil:0.2,vent:0.35,hr:0.7,lpd:6,equip:8,heat:'hp',cop:3.5,setH:21,setC:25,shade:0.85,mass:'medium'},
};
const KEY = CFG.key || 'supertall-massing-lab-v5';
const clone = o => JSON.parse(JSON.stringify(o));
let S = clone(DEFAULTS);
try { const raw = localStorage.getItem(KEY); if (raw){ const p=JSON.parse(raw); S = Object.assign(clone(DEFAULTS), p); for(const k of ['mix','sub','water','site','impact','energy']) S[k]=Object.assign(clone(DEFAULTS[k]), p[k]||{}); if(p.impact){ for(const k of ['sun','wind','traffic','density']) S.impact[k]=Object.assign(clone(DEFAULTS.impact[k]), (p.impact[k]||{})); } } } catch(e){}
for (const k of ['overrides','step']) if (!S[k] || typeof S[k] !== 'object') S[k] = clone(DEFAULTS[k]);
if (S.impact.sun.annual !== undefined){ delete S.impact.sun.annual; }
if (S.impact.sun.scope==='three'||S.impact.sun.scope==='year') S.impact.sun.scope='period';
if (!S.impact.period) S.impact.period=clone(DEFAULTS.impact.period);
if (S.water.period==='year') S.water.period='period';
if (!Array.isArray(S.voids)) S.voids = [];
if (S.typology==='upload') S.typology='taper';
function save(){ try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){} }

const EDIT = {
  h:{label:'Floor height',min:3,max:9,step:0.1,neutral:()=>S.f2f,fmt:v=>v.toFixed(1)+' m'},
  sx:{label:'Width scale',min:0.4,max:1.6,step:0.01,neutral:()=>1,fmt:pct},
  sy:{label:'Depth scale',min:0.4,max:1.6,step:0.01,neutral:()=>1,fmt:pct},
  dx:{label:'Shift x',min:-24,max:24,step:0.5,neutral:()=>0,fmt:v=>(v>0?'+':'')+v.toFixed(1)+' m'},
  dy:{label:'Shift y',min:-24,max:24,step:0.5,neutral:()=>0,fmt:v=>(v>0?'+':'')+v.toFixed(1)+' m'},
  rot:{label:'Rotate plate',min:-90,max:90,step:1,neutral:()=>0,fmt:v=>(v>0?'+':'')+v+'°'},
};
const sel = {a:null,b:null};
let falloff = 0, voidSel = -1, lastFloors = [], lastHeight = 0, water = null, topRaster = null;
function ovOf(i){ return S.overrides[i] || {}; }
function setOv(i,k,v){
  if(i<0||i>220) return;
  const o=S.overrides[i]||{};
  const neutral=EDIT[k]?EDIT[k].neutral():null;
  if(v===null||v===undefined||(neutral!==null&&Math.abs(v-neutral)<1e-6)) delete o[k]; else o[k]=v;
  if(Object.keys(o).length) S.overrides[i]=o; else delete S.overrides[i];
}
function selRange(){ if(sel.a===null) return null; return [Math.min(sel.a,sel.b), Math.max(sel.a,sel.b)]; }
function select(i,extend){ if(extend&&sel.a!==null) sel.b=i; else { sel.a=i; sel.b=i; } update(); }
function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

/* ---------- geometry: plates ---------- */
/* plan (x east, y north, z up) → three (x, up, -y) */
const V3 = (x,y,z)=>new THREE.Vector3(x,z,-y);
function toWorld(fl,lx,ly){ const c=Math.cos(fl.rot), s=Math.sin(fl.rot); return {x:fl.cx+lx*c-ly*s, y:fl.cy+lx*s+ly*c}; }
function toLocal(fl,x,y){ const c=Math.cos(fl.rot), s=Math.sin(fl.rot), dx=x-fl.cx, dy=y-fl.cy; return {x:dx*c+dy*s, y:-dx*s+dy*c}; }
function inRange(fl,p){ return fl.t>=(p.from||0) && fl.t<=(p.to===undefined?1:p.to); }
function place(ux,uy){ const a=S.rotDeg*Math.PI/180, c=Math.cos(a), s=Math.sin(a); return {x:S.posX+ux*c-uy*s, y:S.posY+ux*s+uy*c}; }

function floorsFor(S){
  if(S.typology==='upload'){ const r=LAB.upload?LAB.uploadFloors(S):null; if(r) return r; S.typology='taper'; }
  const H=S.height, f=S.f2f, W=S.width, D=S.depth;
  const c0 = Math.sqrt(S.coreFrac*W*D);
  const out=[];
  let tierB=[];
  if (S.typology==='tiered'){
    const ws=[]; let sum=0;
    for(let k=0;k<S.tiers;k++){ const w=1-0.12*k; ws.push(w); sum+=w; }
    let acc=0; for(const w of ws){ acc+=w/sum; tierB.push(acc); }
  }
  const st=S.step, mode=st.mode||'none';
  let stepI0=null, z=0;
  for(let i=0;i<220;i++){
    const o=S.overrides[i]||{};
    const h=o.h||f;
    if(z+h>H+1e-6) break;
    const t=(z+h/2)/H;
    let cx=0,cy=0,w=W,d=D,rot=0,seg=0;
    if (S.typology==='taper'){ const s=1-(1-S.taper)*Math.pow(t,S.profile); w=W*s; d=D*s; }
    else if (S.typology==='twist'){ const s=1-(1-S.twistTaper)*t; w=W*s; d=D*s; rot=S.twist*Math.PI/180*t; }
    else if (S.typology==='tiered'){ let k=0; while(k<tierB.length-1 && t>tierB[k]) k++; seg=k; const s=Math.pow(1-S.setback,k); w=W*s; d=D*s; cx=S.align*(W-w)/2; cy=S.align*(D-d)/2; }
    else if (S.typology==='stacked'){ const k=Math.min(S.blocks-1, Math.floor(t*S.blocks)); seg=k; const s=1-S.blockTaper*(k/Math.max(1,S.blocks-1)); w=W*s; d=D*s;
      if (k>0){ const dir=[[1,0],[0,1],[-1,0],[0,-1]][(k-1)%4]; cx=dir[0]*S.shift*W; cy=dir[1]*S.shift*D; } }
    if(mode!=='none' && inRange({t},st)){
      if(stepI0===null) stepI0=i;
      const k=i-stepI0;
      if(mode==='spiral'){
        const p=k/st.perTurn, off=[0,0,0,0];
        for(let s=0;s<4;s++){ const u=p-s/4; if(u>0){ const fu=Math.floor(u); off[s]=st.step*(fu+Math.min(1,(u-fu)*4)); } }
        w-=off[0]+off[2]; cx+=(off[2]-off[0])/2; d-=off[1]+off[3]; cy+=(off[3]-off[1])/2;
      } else if(mode==='pixel'){
        const r=mulberry(st.seed*1000+i); cx+=(r()*2-1)*st.jitter; cy+=(r()*2-1)*st.jitter; w*=1+(r()*2-1)*0.08; d*=1+(r()*2-1)*0.08;
      } else if(mode==='ziggurat'){
        const ins=Math.floor(k/st.every)*st.step;
        if(st.sides==='all'){ w-=2*ins; d-=2*ins; } else if(st.sides==='x'){ w-=2*ins; } else if(st.sides==='y'){ d-=2*ins; } else { w-=ins; cx-=ins/2; }
      }
    }
    if(o.sx) w*=o.sx; if(o.sy) d*=o.sy; if(o.dx) cx+=o.dx; if(o.dy) cy+=o.dy; if(o.rot) rot+=o.rot*Math.PI/180;
    w=Math.max(14,w); d=Math.max(14,d);
    const c=Math.max(6, Math.min(c0, Math.min(w,d)-12));
    const edited=Object.keys(o).length>0;
    const P=place(cx,cy);
    out.push({i,z,h,t,ux:cx,uy:cy,urot:rot,cx:P.x,cy:P.y,rot:rot+S.rotDeg*Math.PI/180,w,d,seg,core:c,coreArea:c*c,edited,manual:!!o.prog,
      leaseMin:(Math.min(w,d)-c)/2, leaseMax:(Math.max(w,d)-c)/2, ext:Math.abs(w*Math.cos(rot))+Math.abs(d*Math.sin(rot))});
    z+=h;
  }
  return out;
}

/* ---------- geometry: masks ---------- */
function newMask(fl){ const nx=Math.max(1,Math.ceil(fl.w)), ny=Math.max(1,Math.ceil(fl.d)); fl.mask={nx,ny,x0:-fl.w/2,y0:-fl.d/2,cells:new Uint8Array(nx*ny).fill(1)}; }
function cellsIn(fl,x0,x1,y0,y1,fn){
  const m=fl.mask;
  const ix0=Math.max(0,Math.floor(x0-m.x0)), ix1=Math.min(m.nx-1,Math.ceil(x1-m.x0));
  const iy0=Math.max(0,Math.floor(y0-m.y0)), iy1=Math.min(m.ny-1,Math.ceil(y1-m.y0));
  for(let iy=iy0;iy<=iy1;iy++){ const ly=m.y0+iy+0.5; if(ly<y0||ly>y1) continue;
    for(let ix=ix0;ix<=ix1;ix++){ const lx=m.x0+ix+0.5; if(lx<x0||lx>x1) continue; fn(iy*m.nx+ix,lx,ly); } }
}
function cutRect(fl,x0,x1,y0,y1){ cellsIn(fl,x0,x1,y0,y1,(k)=>{ fl.mask.cells[k]=0; }); }
function cutFn(fl,x0,x1,y0,y1,test){ cellsIn(fl,x0,x1,y0,y1,(k,lx,ly)=>{ if(test(lx,ly)) fl.mask.cells[k]=0; }); }
function floorAt(floors,z){ for(const fl of floors) if(z<fl.z+fl.h) return fl; return floors[floors.length-1]; }
function facePoint(fl,face,u){ const F=FACES[face]; const half=(face==='S'||face==='N')?fl.w/2:fl.d/2; const dist=(face==='S'||face==='N')?fl.d/2:fl.w/2; return {x:F.n[0]*dist+F.along[0]*u*half, y:F.n[1]*dist+F.along[1]*u*half}; }
function rotV(rot,v){ const c=Math.cos(rot), s=Math.sin(rot); return [v[0]*c-v[1]*s, v[0]*s+v[1]*c]; }

/* face-to-face void frame: portal points, Bezier control points and samplers, shared with the exporter */
function f2fFrame(v,floors,H){
  const fa=floorAt(floors,v.zA*H), fb=floorAt(floors,v.zB*H);
  const A=facePoint(fa,v.faceA,v.uA), B=facePoint(fb,v.faceB,v.uB);
  const pa=toWorld(fa,A.x,A.y), pb=toWorld(fb,B.x,B.y);
  const na=rotV(fa.rot,FACES[v.faceA].n), nb=rotV(fb.rot,FACES[v.faceB].n);
  const p0=[pa.x,pa.y,v.zA*H], p3=[pb.x,pb.y,v.zB*H];
  const p1=[p0[0]-na[0]*v.pull,p0[1]-na[1]*v.pull,p0[2]], p2=[p3[0]-nb[0]*v.pull,p3[1]-nb[1]*v.pull,p3[2]];
  const bz=(t)=>{ const mt=1-t, a=mt*mt*mt, b=3*mt*mt*t, c=3*mt*t*t, d=t*t*t; return [a*p0[0]+b*p1[0]+c*p2[0]+d*p3[0], a*p0[1]+b*p1[1]+c*p2[1]+d*p3[1], a*p0[2]+b*p1[2]+c*p2[2]+d*p3[2]]; };
  const tg=(t)=>{ const mt=1-t, a=3*mt*mt, b=6*mt*t, c=3*t*t; const v3=[a*(p1[0]-p0[0])+b*(p2[0]-p1[0])+c*(p3[0]-p2[0]), a*(p1[1]-p0[1])+b*(p2[1]-p1[1])+c*(p3[1]-p2[1]), a*(p1[2]-p0[2])+b*(p2[2]-p1[2])+c*(p3[2]-p2[2])]; const L=Math.hypot(...v3)||1; return v3.map(x=>x/L); };
  const frame=(t)=>{ const tc=Math.min(1,Math.max(0,t)); const P=bz(t), T=tg(t), s=1+v.bulge*Math.sin(Math.PI*tc); const w=(v.wA*(1-tc)+v.wB*tc)*s, h=(v.hA*(1-tc)+v.hB*tc)*s;
    let X=[-T[1],T[0],0]; const L=Math.hypot(X[0],X[1]); X= L<1e-6?[1,0,0]:[X[0]/L,X[1]/L,0]; const Y=[T[1]*X[2]-T[2]*X[1], T[2]*X[0]-T[0]*X[2], T[0]*X[1]-T[1]*X[0]]; return {P,T,X,Y,w,h}; };
  return {p0,p1,p2,p3,na,nb,bz,tg,frame};
}
LAB.f2fFrame=f2fFrame;
const GEN = {
  f2f(v,floors,H){
    const {bz,tg}=f2fFrame(v,floors,H);
    const N=40, boxes=[]; let zmin=1e9, zmax=-1e9;
    for(let k=0;k<=N;k++){
      const t=-0.04+1.08*k/N, tc=Math.min(1,Math.max(0,t));
      const P=bz(t), T=tg(t), s=1+v.bulge*Math.sin(Math.PI*tc);
      const w=(v.wA*(1-tc)+v.wB*tc)*s, h=(v.hA*(1-tc)+v.hB*tc)*s;
      let X=[-T[1],T[0],0]; const L=Math.hypot(X[0],X[1]); X= L<1e-6?[1,0,0]:[X[0]/L,X[1]/L,0];
      const Y=[T[1]*X[2]-T[2]*X[1], T[2]*X[0]-T[0]*X[2], T[0]*X[1]-T[1]*X[0]];
      const Pn=bz(t+1.08/N); const ds=Math.hypot(Pn[0]-P[0],Pn[1]-P[1],Pn[2]-P[2]);
      boxes.push({P,T,X,Y,w,h,ds}); zmin=Math.min(zmin,P[2]-h); zmax=Math.max(zmax,P[2]+h);
    }
    for(const fl of floors){
      if(fl.z+fl.h<zmin||fl.z>zmax) continue;
      const zm=fl.z+fl.h/2, tol=fl.h*0.3, c=Math.cos(fl.rot), s=Math.sin(fl.rot);
      for(const b of boxes){
        if(Math.abs(b.P[2]-zm)>b.h/2+b.w/2+tol) continue;
        const Pl=toLocal(fl,b.P[0],b.P[1]);
        const rl=(vec)=>[vec[0]*c+vec[1]*s, -vec[0]*s+vec[1]*c, vec[2]];
        const T=rl(b.T), X=rl(b.X), Y=rl(b.Y), R=(b.w+b.h+b.ds)/2+1, ht=b.ds*0.6+0.35;
        cutFn(fl,Pl.x-R,Pl.x+R,Pl.y-R,Pl.y+R,(lx,ly)=>{
          const q=[lx-Pl.x, ly-Pl.y, zm-b.P[2]];
          const ax=q[0]*X[0]+q[1]*X[1]+q[2]*X[2], ay=q[0]*Y[0]+q[1]*Y[1]+q[2]*Y[2], at=q[0]*T[0]+q[1]*T[1]+q[2]*T[2];
          return Math.abs(ax)<=b.w/2 && Math.abs(ay)<=b.h/2+tol && Math.abs(at)<=ht;
        });
      }
    }
  },
  gardens(v,floors){
    const SIDES={4:['E','N','W','S'],3:['E','N','W'],2:['E','W']}[v.sides]||['E','N','W','S'];
    let i0=null;
    for(const fl of floors){ if(!inRange(fl,v)) continue; if(i0===null) i0=fl.i;
      const k=fl.i-i0; if(k%v.every>=v.span) continue;
      const side=SIDES[Math.floor(k/v.every)%SIDES.length], w=fl.w, d=fl.d, dep=v.depth, hw=v.width*w/2, hd=v.width*d/2;
      if(side==='E') cutRect(fl,w/2-dep,w,-hd,hd); else if(side==='W') cutRect(fl,-w,-w/2+dep,-hd,hd);
      else if(side==='N') cutRect(fl,-hw,hw,d/2-dep,d); else cutRect(fl,-hw,hw,-d,-d/2+dep);
    }
  },
  oasis(v,floors){
    const n=floors.length; const starts=[]; let s0=Math.round(v.at*n);
    if(v.every>0){ for(let s=s0;s<n-3;s+=v.every) starts.push(s); } else starts.push(s0);
    for(const s of starts) for(let i=s;i<Math.min(n-1,s+v.floors);i++){ const fl=floors[i]; cutRect(fl,-fl.w*v.open/2,fl.w*v.open/2,-fl.d*v.open/2,fl.d*v.open/2); }
  },
  ribbon(v,floors){
    for(const fl of floors){ if(!inRange(fl,v)) continue;
      const u=(fl.t-v.from)/Math.max(0.01,v.to-v.from), th=2*Math.PI*v.turns*u;
      const size=v.size*(1+v.wobble*0.5*Math.sin(3*th+1)), m=Math.max(Math.abs(Math.cos(th)),Math.abs(Math.sin(th)));
      const px=Math.cos(th)/m*fl.w/2, py=Math.sin(th)/m*fl.d/2;
      cutRect(fl,px-size/2,px+size/2,py-size/2,py+size/2);
    }
  },
  crown(v,floors){
    for(const fl of floors){ if(fl.t<v.from) continue;
      const u=(fl.t-v.from)/Math.max(0.01,1-v.from), wv=fl.w*v.width*Math.sqrt(u);
      if(v.axis==='y') cutRect(fl,-wv/2,wv/2,-fl.d,fl.d); else { const dv=fl.d*v.width*Math.sqrt(u); cutRect(fl,-fl.w,fl.w,-dv/2,dv/2); }
    }
  },
  atria(v,floors){
    let i0=null;
    for(const fl of floors){ if(!inRange(fl,v)) continue; if(i0===null) i0=fl.i;
      if((fl.i-i0)%v.every>=v.span) continue; const m=v.margin, w=fl.w, d=fl.d;
      cutRect(fl,w/2-m,w,-d,d); cutRect(fl,-w,-w/2+m,-d,d); cutRect(fl,-w,w,d/2-m,d); cutRect(fl,-w,w,-d,-d/2+m);
    }
  },
  wells(v,floors){
    for(const fl of floors){ if(!inRange(fl,v)) continue;
      for(let j=0;j<v.count;j++){ const a=2*Math.PI*j/v.count+v.spin*fl.i*Math.PI/180;
        const px=Math.cos(a)*v.inset*fl.w/2, py=Math.sin(a)*v.inset*fl.d/2;
        cutRect(fl,px-v.size/2,px+v.size/2,py-v.size/2,py+v.size/2); }
    }
  },
};

function finishMask(fl){
  const m=fl.mask;
  const cc=toLocal(fl,S.posX,S.posY), c=fl.core/2+0.3;
  cellsIn(fl,cc.x-c,cc.x+c,cc.y-c,cc.y+c,(k)=>{ fl.mask.cells[k]=1; });
  let solid=0,total=0; fl.colVoid=new Float32Array(m.nx);
  for(let iy=0;iy<m.ny;iy++){ const ly=m.y0+iy+0.5; if(ly>fl.d/2) continue;
    for(let ix=0;ix<m.nx;ix++){ const lx=m.x0+ix+0.5; if(lx>fl.w/2) continue; total++; if(m.cells[iy*m.nx+ix]) solid++; else fl.colVoid[ix]+=1; } }
  const rows=Math.max(1,Math.min(m.ny,Math.floor(fl.d-0.5)+1));
  for(let ix=0;ix<m.nx;ix++) fl.colVoid[ix]/=rows;
  fl.voidFrac=total?1-solid/total:0; fl.area=fl.w*fl.d*(total?solid/total:1); fl.garden=fl.voidFrac>0.55;
  // façade length by world orientation (m): exposed cell edges, rotated by the plate rotation
  const fac={N:0,E:0,S:0,W:0}; const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let iy=0;iy<m.ny;iy++) for(let ix=0;ix<m.nx;ix++){ if(!m.cells[iy*m.nx+ix]) continue; const lx=m.x0+ix+0.5, ly=m.y0+iy+0.5; if(lx>fl.w/2||ly>fl.d/2) continue;
    for(const [dx,dy] of dirs){ const jx=ix+dx, jy=iy+dy; const outside=jx<0||jy<0||jx>=m.nx||jy>=m.ny||(m.x0+jx+0.5>fl.w/2)||(m.y0+jy+0.5>fl.d/2); if(!outside&&m.cells[jy*m.nx+jx]) continue;
      const a=Math.atan2(dy,dx)+fl.rot; const deg=((a*180/Math.PI)%360+360)%360; const o=deg<45||deg>=315?'E':(deg<135?'N':(deg<225?'W':'S')); fac[o]+=1; } }
  fl.facade=fac;
  const rects=[]; let open={};
  for(let iy=0;iy<m.ny;iy++){
    const next={}; let ix=0;
    while(ix<m.nx){ if(!m.cells[iy*m.nx+ix]){ ix++; continue; } let e=ix; while(e+1<m.nx&&m.cells[iy*m.nx+e+1]) e++;
      const key=ix+':'+e; const r=open[key]; if(r){ r.iy1=iy; next[key]=r; } else { const nr={ix0:ix,ix1:e,iy0:iy,iy1:iy}; rects.push(nr); next[key]=nr; }
      ix=e+1; }
    open=next;
  }
  fl.rects=rects.map(r=>{ const x0=m.x0+r.ix0, x1=Math.min(fl.w/2,m.x0+r.ix1+1), y0=m.y0+r.iy0, y1=Math.min(fl.d/2,m.y0+r.iy1+1); return {x:(x0+x1)/2,y:(y0+y1)/2,w:x1-x0,d:y1-y0}; });
}
/* closed rectilinear outlines of a floor's solid cells in local coordinates: outer loops counter-clockwise, holes clockwise */
function maskLoops(fl){
  const m=fl.mask, W2=fl.w/2, D2=fl.d/2;
  const solid=(ix,iy)=> ix>=0&&iy>=0&&ix<m.nx&&iy<m.ny&&(m.x0+ix+0.5<=W2)&&(m.y0+iy+0.5<=D2)&&!!m.cells[iy*m.nx+ix];
  const X=ix=>Math.min(W2,m.x0+ix), Y=iy=>Math.min(D2,m.y0+iy);
  const edges=new Map(); const key=(x,y)=>x.toFixed(2)+','+y.toFixed(2);
  const add=(ax,ay,bx,by)=>{ const k=key(ax,ay); (edges.get(k)||edges.set(k,[]).get(k)).push([bx,by]); };
  for(let iy=0;iy<m.ny;iy++) for(let ix=0;ix<m.nx;ix++){ if(!solid(ix,iy)) continue;
    if(!solid(ix,iy-1)) add(X(ix),Y(iy),X(ix+1),Y(iy)); if(!solid(ix+1,iy)) add(X(ix+1),Y(iy),X(ix+1),Y(iy+1));
    if(!solid(ix,iy+1)) add(X(ix+1),Y(iy+1),X(ix),Y(iy+1)); if(!solid(ix-1,iy)) add(X(ix),Y(iy+1),X(ix),Y(iy)); }
  const loops=[];
  for(const [k0,outs] of edges){ while(outs.length){ const start=k0.split(',').map(Number); let cur=start, pts=[start], guard=0;
      let next=outs.pop();
      while(next&&guard++<100000){ const kk=key(next[0],next[1]); if(kk===k0){ break; } pts.push(next); const o=edges.get(kk); if(!o||!o.length){ break; } next=o.pop(); }
      if(pts.length>=4){ const simp=[]; for(let i=0;i<pts.length;i++){ const a=pts[(i-1+pts.length)%pts.length], b=pts[i], c=pts[(i+1)%pts.length]; if(Math.abs((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))>1e-6) simp.push(b); }
        let area=0; for(let i=0;i<simp.length;i++){ const a=simp[i], b=simp[(i+1)%simp.length]; area+=a[0]*b[1]-b[0]*a[1]; } if(Math.abs(area)>1) loops.push({pts:simp,outer:area>0,area:Math.abs(area)/2}); } } }
  return loops;
}
LAB.maskLoops=maskLoops;
function buildMasks(floors){
  for(const fl of floors) if(!fl.mask) newMask(fl);
  const st=S.step;
  if(st.mode==='wave' && S.typology!=='upload'){
    for(const fl of floors){ if(!inRange(fl,st)) continue;
      const w=fl.w, d=fl.d, ph=2*Math.PI*fl.i/st.period, A=st.amp, k=2*Math.PI*st.waves;
      const ins=(s,len,p)=>A*(0.5+0.5*Math.sin(k*(s/len)+ph+p));
      cutFn(fl,-w,w,-d,d,(lx,ly)=> lx>w/2-ins(ly,d,0) || lx<-w/2+ins(ly,d,Math.PI/2) || ly>d/2-ins(lx,w,Math.PI) || ly<-d/2+ins(lx,w,1.5*Math.PI));
    }
  }
  for(const v of S.voids){ const g=GEN[v.type]; if(g) g(v,floors,S.height); }
  for(const fl of floors) finishMask(fl);
}

/* exposed-top raster: which floor's top is open to the sky at each 1 m cell (terraces, roof) */
function computeTop(floors){
  const cs=1;
  let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
  for(const fl of floors){ const R=Math.hypot(fl.w,fl.d)/2; minx=Math.min(minx,fl.cx-R); maxx=Math.max(maxx,fl.cx+R); miny=Math.min(miny,fl.cy-R); maxy=Math.max(maxy,fl.cy+R); }
  minx=Math.floor(minx-3); miny=Math.floor(miny-3); const nx=Math.ceil(maxx+3-minx)|0, ny=Math.ceil(maxy+3-miny)|0;
  const N=nx*ny, top=new Int16Array(N).fill(-1), Hh=new Float32Array(N), covered=new Uint8Array(N);
  const terrace=new Float32Array(floors.length), coveredVoid=new Float32Array(floors.length);
  for(const fl of floors){
    const R=Math.hypot(fl.w,fl.d)/2, m=fl.mask;
    const ix0=Math.max(0,Math.floor(fl.cx-R-minx)), ix1=Math.min(nx-1,Math.ceil(fl.cx+R-minx));
    const iy0=Math.max(0,Math.floor(fl.cy-R-miny)), iy1=Math.min(ny-1,Math.ceil(fl.cy+R-miny));
    for(let iy=iy0;iy<=iy1;iy++) for(let ix=ix0;ix<=ix1;ix++){
      const l=toLocal(fl,minx+ix+0.5,miny+iy+0.5);
      if(Math.abs(l.x)>fl.w/2||Math.abs(l.y)>fl.d/2) continue;
      const mx=Math.floor(l.x-m.x0), my=Math.floor(l.y-m.y0); if(mx<0||my<0||mx>=m.nx||my>=m.ny) continue;
      const k=iy*nx+ix;
      if(m.cells[my*m.nx+mx]){ top[k]=fl.i; Hh[k]=fl.z+fl.h; }
      else if(top[k]>=0){ coveredVoid[fl.i]+=0; }
    }
  }
  // covered void: void cells of floor i that have a solid floor above them
  for(const fl of floors){
    const R=Math.hypot(fl.w,fl.d)/2, m=fl.mask;
    const ix0=Math.max(0,Math.floor(fl.cx-R-minx)), ix1=Math.min(nx-1,Math.ceil(fl.cx+R-minx));
    const iy0=Math.max(0,Math.floor(fl.cy-R-miny)), iy1=Math.min(ny-1,Math.ceil(fl.cy+R-miny));
    for(let iy=iy0;iy<=iy1;iy++) for(let ix=ix0;ix<=ix1;ix++){
      const l=toLocal(fl,minx+ix+0.5,miny+iy+0.5);
      if(Math.abs(l.x)>fl.w/2||Math.abs(l.y)>fl.d/2) continue;
      const mx=Math.floor(l.x-m.x0), my=Math.floor(l.y-m.y0); if(mx<0||my<0||mx>=m.nx||my>=m.ny) continue;
      const k=iy*nx+ix;
      if(!m.cells[my*m.nx+mx] && top[k]>fl.i) coveredVoid[fl.i]+=1;
    }
  }
  for(let k=0;k<N;k++) if(top[k]>=0) terrace[top[k]]+=1;
  floors.forEach(fl=>{ fl.terrace=fl.i<floors.length-1?terrace[fl.i]:0; fl.roof=fl.i===floors.length-1?terrace[fl.i]:0; fl.coveredVoid=coveredVoid[fl.i]; });
  return {cs,minx,miny,nx,ny,top,H:Hh};
}

/* ---------- program engine ---------- */
function fit(v,lo,hi,soft){ if(v>=lo&&v<=hi) return 1; const dd=v<lo?(lo-v)/(soft*lo):(v-hi)/(soft*hi); return Math.max(0,1-dd); }
function rulesFor(S){
  return {
    office:{area:[S.officeMinArea,4200],depth:[9.5,21],peak:0.22,bias:0.22},
    studio:{area:[600,1900],depth:[7,15],peak:0.35,bias:0.1},
    retail:{area:[800,4500],depth:[8,25],peak:0.05,bias:0.1},
    hotel:{area:[750,2300],depth:[7,13.5],peak:0.5,bias:0},
    resi:{area:[380,1650],depth:[5,S.resiMaxDepth],peak:0.8,bias:-0.22},
    public:{area:[700,4500],depth:[7,25],peak:0.1,bias:0},
    boh:{area:[900,5000],depth:[9,30],peak:0.02,bias:0},
  };
}
function scoreFloor(fl,S,rules){
  const sc={};
  for(const p in rules){
    const r=rules[p];
    let s=0.45*fit(fl.area,r.area[0],r.area[1],0.35)+0.35*fit(fl.leaseMax,r.depth[0],r.depth[1],0.3)+0.2*(1-Math.min(1,Math.abs(fl.t-r.peak)/0.7))+r.bias*S.bias;
    // site influences: views up high, street noise and transit at grade, wind on high terraces
    if(p==='hotel'||p==='resi') s+=0.15*fl.t;
    if(p==='resi'&&fl.t<0.12) s-=0.25;
    if((p==='office'||p==='retail'||p==='studio')&&fl.t<0.3) s+=0.05;
    if(p==='public'){ if(fl.garden) s+=0.6; if(fl.terrace>150) s+=0.15; s-=0.2*Math.max(0,fl.t-0.6); if(fl.t<0.1) s+=0.2; }
    if(p==='boh'&&fl.t<0.08) s+=0.5;
    sc[p]=s;
  }
  return sc;
}
function argmax(sc,allowed){ let b=null,bv=-Infinity; for(const k in sc){ if(allowed&&!allowed.has(k)) continue; if(sc[k]>bv){bv=sc[k];b=k;} } return b; }

function assignProgram(floors,S){
  const n=floors.length;
  const prog=new Array(n).fill(null), fixed=new Array(n).fill(false), manual=new Array(n).fill(false);
  for(let i=0;i<Math.min(S.groundFloors,n);i++){ prog[i]='retail'; fixed[i]=true; }
  if(n>6){ prog[n-1]='mep'; fixed[n-1]=true; if(S.observation){ prog[n-2]='observation'; prog[n-3]='observation'; fixed[n-2]=fixed[n-3]=true; } }
  for(let i=S.groundFloors;i<n-4;i++){ if(i%S.mepInterval===0){ prog[i]='mep'; fixed[i]=true; } }
  for(let i=0;i<n;i++){ if(floors[i].garden && !fixed[i]){ prog[i]='amenity'; fixed[i]=true; } }
  for(let i=0;i<n;i++){ const o=S.overrides[i]; if(o&&o.prog){ prog[i]=o.prog; fixed[i]=true; manual[i]=true; } }
  const rules=rulesFor(S);
  const scores=floors.map(f=>scoreFloor(f,S,rules));
  const elig=[]; for(let i=0;i<n;i++) if(!fixed[i]) elig.push(i);

  if(S.mixMode==='target'){
    // quotas in m² from the category mix, split into programs; fixed floors count toward their categories first
    const mix=S.mix, sub=S.sub, tot=Object.values(mix).reduce((a,b)=>a+b,0)||1;
    const gfa=floors.reduce((s,f)=>s+f.area,0);
    const q={};
    const cs=(sub.office+sub.studio+sub.retail)||1, rs=(sub.hotel+sub.resi)||1;
    q.office=gfa*mix.commercial/tot*sub.office/cs; q.studio=gfa*mix.commercial/tot*sub.studio/cs; q.retail=gfa*mix.commercial/tot*sub.retail/cs;
    q.hotel=gfa*mix.residential/tot*sub.hotel/rs; q.resi=gfa*mix.residential/tot*sub.resi/rs;
    q.public=gfa*mix.public/tot; q.boh=gfa*mix.infra/tot;
    for(let i=0;i<n;i++){ if(!fixed[i]) continue; const p=prog[i]; const key=(p==='amenity'||p==='observation')?'public':(p==='mep'?'boh':p); if(q[key]!==undefined) q[key]-=floors[i].area; }
    const allowed=new Set(Object.keys(q));
    let below=null;
    for(let i=0;i<n;i++){
      if(fixed[i]){ if(prog[i]!=='mep') below=prog[i]; continue; }
      let best=null,bv=-Infinity;
      for(const p of allowed){
        let s=scores[i][p]; if(p===below) s+=0.35;
        const rem=q[p]; if(rem<floors[i].area*0.5) s-=1.5+Math.max(0,-rem)/Math.max(1,floors[i].area)*0.2;
        if(s>bv){bv=s;best=p;}
      }
      prog[i]=best; q[best]-=floors[i].area; below=best;
    }
  } else {
    const allowed=new Set(); if(S.useOffice) allowed.add('office'); if(S.useHotel) allowed.add('hotel'); if(S.useResi) allowed.add('resi'); if(S.useStudio) allowed.add('studio');
    if(!allowed.size) allowed.add('office');
    const segCount=Math.max(...floors.map(f=>f.seg))+1;
    if(S.snap && segCount>1){
      for(let s=0;s<segCount;s++){
        const idx=elig.filter(i=>floors[i].seg===s); if(!idx.length) continue;
        const sum={}; for(const p of allowed) sum[p]=0;
        for(const i of idx) for(const p of allowed) sum[p]+=scores[i][p];
        const p=argmax(sum); for(const i of idx) prog[i]=p;
      }
    } else {
      for(const i of elig) prog[i]=argmax(scores[i],allowed);
      let guard=0, changed=true;
      while(changed && guard++<80){
        changed=false;
        const runs=[]; for(let k=0;k<elig.length;k++){ const i=elig[k]; const last=runs[runs.length-1]; if(last && prog[last.idx[0]]===prog[i]) last.idx.push(i); else runs.push({idx:[i]}); }
        for(let r=0;r<runs.length;r++){
          const run=runs[r]; if(run.idx.length>=S.minZone) continue;
          const cands=[]; if(r>0) cands.push(prog[runs[r-1].idx[0]]); if(r<runs.length-1) cands.push(prog[runs[r+1].idx[0]]);
          if(!cands.length) continue;
          let best=null,bv=-Infinity; for(const c of cands){ let s=0; for(const i of run.idx) s+=scores[i][c]; if(s>bv){bv=s;best=c;} }
          for(const i of run.idx) prog[i]=best; changed=true; break;
        }
      }
    }
  }
  for(let k=1;k<elig.length;k++){ const i=elig[k], j=elig[k-1];
    if(prog[i]!==prog[j] && prog[i]!=='amenity' && prog[j]!=='amenity' && !manual[i] && !manual[j] && prog[i]!=='boh' && prog[j]!=='boh' && prog[i]!=='retail' && prog[j]!=='retail'){ prog[i]='amenity'; } }
  floors.forEach((f,i)=>{ f.prog=prog[i]; f.score=scores[i]; });
  return floors;
}
function zonesOf(floors){
  const z=[]; for(const f of floors){ const l=z[z.length-1]; if(l && l.prog===f.prog) l.floors.push(f); else z.push({prog:f.prog,floors:[f]}); }
  for(const zz of z){ const a=zz.floors.map(f=>f.area), d=zz.floors.map(f=>f.leaseMax);
    zz.minA=Math.min(...a); zz.maxA=Math.max(...a); zz.minD=Math.min(...d); zz.maxD=Math.max(...d);
    zz.gfa=a.reduce((s,v)=>s+v,0); zz.start=zz.floors[0].i; zz.end=zz.floors[zz.floors.length-1].i;
    zz.manual=zz.floors.some(f=>f.manual); zz.garden=zz.floors.some(f=>f.garden);
    zz.voidMax=Math.max(...zz.floors.map(f=>f.voidFrac)); zz.top=zz.floors[zz.floors.length-1].z+zz.floors[zz.floors.length-1].h; }
  return z;
}
function why(z){
  const d=z.maxD.toFixed(1), a=Math.round(z.maxA).toLocaleString();
  if(z.manual) return 'Set by hand in the floor editor.';
  if(z.garden && z.prog==='amenity') return `A void removes up to ${Math.round(z.voidMax*100)}% of the plate here: open sky garden with the core and structure passing through.`;
  const tgt=S.mixMode==='target'?' Placed here by the target mix: ':'';
  switch(z.prog){
    case 'office': return `${tgt}Plates to ${a} m² with ${d} m lease depth: deep enough for open office floors around a central core.`;
    case 'studio': return `${tgt}Mid-size plates with ${d} m depth suit studio and creative floors that want daylight but not a corporate plate.`;
    case 'hotel': return `${tgt}Mid-size plates and ${d} m depth suit a double-loaded corridor of rooms; the zone below carries the back-of-house.`;
    case 'resi': return `${tgt}Lease depth ${d} m or less keeps every unit within daylight reach; the height gives the views the rents depend on.`;
    case 'retail': return z.start<3?'Ground-related floors: entrance lobbies, rentable retail and drop-off toward the retail high street.':`${tgt}Rentable commercial on wide low plates, close to the street and the transit plaza.`;
    case 'public': return `${tgt}Public facility: cultural or community floors placed low for access, or at a void for a sky-level room.`;
    case 'boh': return `${tgt}Back-of-house, loading and parking on the lowest deep plates, served from the lane.`;
    case 'amenity': return 'Transfer floor between programs: sky lobby, lift interchange, amenity or terrace.';
    case 'observation': return 'Top occupied floors above 250 m: public observation deck and restaurant.';
    case 'mep': return z.floors[0].t>0.9 ? 'Crown plant and BMU level.' : 'Refuge and plant floor at the stated interval.';
  }
  return '';
}

/* ---------- generic controls ---------- */
/* $ returns the element, or an inert detached stand-in when a page leaves that part of the interface out, so a tool built from a subset of the panels never trips on a missing control */
const stubs={};
const $=id=>{ let el=document.getElementById(id); if(el) return el; for(const k in stubs){ el=stubs[k].querySelector('#'+CSS.escape(id)); if(el) return el; } if(!stubs[id]){ stubs[id]=document.createElement('div'); stubs[id].dataset.stub=id; } return stubs[id]; };
function controlsFor(host,defs,prefix,getObj,onChange){
  host.innerHTML='';
  for(const k in defs){
    const p=defs[k], id=prefix+'-'+k;
    const wrap=document.createElement('div'); wrap.className='ctl'; wrap.dataset.param=k;
    if(p.options){
      wrap.innerHTML=`<div class="ctl-head"><label for="${id}">${p.label}</label></div><select id="${id}">${p.options.map(o=>`<option value="${o[0]}">${o[1]}</option>`).join('')}</select>`;
      wrap.querySelector('select').addEventListener('change',e=>{ const raw=e.target.value; const o=getObj(); const t=typeof p.options[0][0]; o[k]=t==='number'?parseFloat(raw):(t==='boolean'?raw==='true':raw); onChange(k); });
    } else {
      wrap.innerHTML=`<div class="ctl-head"><label for="${id}">${p.label}</label><output id="o-${id}"></output></div><input type="range" id="${id}" min="${p.min}" max="${p.max}" step="${p.step}">`;
      wrap.querySelector('input').addEventListener('input',e=>{ getObj()[k]=parseFloat(e.target.value); onChange(k); });
    }
    host.appendChild(wrap);
  }
}
function syncFor(host,defs,prefix,obj){
  for(const k in defs){ const p=defs[k], el=$(prefix+'-'+k); if(!el) continue;
    if(p.options){ el.value=String(obj[k]); } else { el.value=obj[k]; const o=$('o-'+prefix+'-'+k); if(o) o.textContent=p.fmt(obj[k]); } }
}
function slider(key){
  const p=PARAMS[key];
  const wrap=document.createElement('div'); wrap.className='ctl'; wrap.dataset.param=key;
  wrap.innerHTML=`<div class="ctl-head"><label for="p-${key}">${p.label}</label><output id="o-${key}"></output></div><input type="range" id="p-${key}" min="${p.min}" max="${p.max}" step="${p.step}">`;
  wrap.querySelector('input').addEventListener('input',e=>{ S[key]=parseFloat(e.target.value); update(); });
  return wrap;
}
function buildControls(){
  const tb=$('typos');
  for(const k in TYP){
    const b=document.createElement('button'); b.type='button'; b.className='typo'; b.dataset.t=k;
    b.innerHTML=`<svg viewBox="0 0 26 38" aria-hidden="true">${ICONS[k]}</svg><span>${TYP[k].name}</span>`;
    b.addEventListener('click',()=>{ if(k==='upload'&&!LAB.upload){ $('file-in').click(); return; } S.typology=k; Object.assign(S,TYP[k].defaults); update(); });
    tb.appendChild(b);
  }
  ENVELOPE.forEach(k=>$('envelope').appendChild(slider(k)));
  for(const k in TYP) TYP[k].params.forEach(pk=>{ if(!$('p-'+pk)) $('form').appendChild(slider(pk)); });
  SITEP.forEach(k=>$('siteparams').appendChild(slider(k)));
  RULEP.forEach(k=>$('rules').appendChild(slider(k)));
  const checks=[['useOffice','Office','office'],['useHotel','Hotel','hotel'],['useResi','Housing','resi'],['useStudio','Studio','studio'],['observation','Observation deck','observation'],['snap','Program per volume',null]];
  for(const [k,label,prog] of checks){
    const l=document.createElement('label'); l.className='check'; l.htmlFor='c-'+k;
    l.innerHTML=`<input type="checkbox" id="c-${k}">${prog?`<span class="sw" style="background:var(${PROG[prog].tok})"></span>`:''}<span>${label}</span>`;
    l.querySelector('input').addEventListener('change',e=>{ S[k]=e.target.checked; update(); });
    $('checks').appendChild(l);
  }
  $('mix-mode').addEventListener('change',e=>{ S.mixMode=e.target.value; update(); });
  controlsFor($('mix-params'),MIXP,'mx',()=>S.mix,update);
  controlsFor($('sub-params'),SUBP,'sb',()=>S.sub,update);
  $('c-future').addEventListener('change',e=>{ S.site.future=e.target.checked; LAB.buildSite(); update(); });
  $('c-labels').addEventListener('change',e=>{ S.site.labels=e.target.checked; LAB.buildSite(); needsRender=true; });
  { const wrap=document.createElement('div'); wrap.className='ctl'; wrap.innerHTML=`<div class="ctl-head"><label for="p-labelPt">Street label size</label><output id="o-labelPt"></output></div><input type="range" id="p-labelPt" min="6" max="24" step="1">`;
    wrap.querySelector('input').addEventListener('input',e=>{ S.site.labelPt=parseFloat(e.target.value); $('o-labelPt').textContent=S.site.labelPt+' pt'; fitLabels(); needsRender=true; }); $('labelsize').appendChild(wrap); }
  $('fit-site').addEventListener('click',()=>{ const st=LAB.site&&LAB.site.site; if(!st) return; const b=polyBounds(st.polygon); S.width=Math.min(70,Math.max(30,Math.round((b.maxx-b.minx)*0.5))); S.depth=Math.min(70,Math.max(30,Math.round((b.maxy-b.miny)*0.72))); S.posX=0; S.posY=0; update(); });
  $('shuffle').addEventListener('click',()=>{
    if(S.typology==='upload') return;
    const rnd=(k)=>{ const p=PARAMS[k]; const steps=Math.round((p.max-p.min)/p.step); return p.min+Math.round(Math.random()*steps)*p.step; };
    for(const k of TYP[S.typology].params) S[k]=rnd(k);
    S.coreFrac=+(0.18+Math.random()*0.1).toFixed(2); S.height=Math.round(250+Math.random()*50); update();
  });
  $('reset').addEventListener('click',()=>{ S=clone(DEFAULTS); sel.a=sel.b=null; voidSel=-1; update(); });
  $('copy').addEventListener('click',copyCSV);
  buildEditor(); buildVoidUI(); buildStepUI(); buildWaterUI(); buildPrecedents();
}
function polyBounds(p){ let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9; for(const q of p){ minx=Math.min(minx,q[0]); maxx=Math.max(maxx,q[0]); miny=Math.min(miny,q[1]); maxy=Math.max(maxy,q[1]); } return {minx,maxx,miny,maxy}; }
function syncControls(){
  nFloorsNow=lastFloors.length||Math.floor(S.height/S.f2f);
  document.querySelectorAll('.typo').forEach(b=>{ b.setAttribute('aria-pressed',String(b.dataset.t===S.typology)); if(b.dataset.t==='upload') b.style.opacity=LAB.upload?'1':'.55'; });
  $('blurb').textContent=TYP[S.typology].blurb;
  $('form-title').firstChild.textContent='Form · '+TYP[S.typology].name;
  const active=new Set(TYP[S.typology].params);
  document.querySelectorAll('#form .ctl').forEach(el=>{ el.hidden=!active.has(el.dataset.param); });
  $('form').hidden=S.typology==='upload';
  for(const k in PARAMS){ const inp=$('p-'+k); if(!inp) continue; inp.value=S[k]; $('o-'+k).textContent=PARAMS[k].fmt(S[k]); }
  for(const k of ['useOffice','useHotel','useResi','useStudio','observation','snap']) $('c-'+k).checked=!!S[k];
  const segTyp=S.typology==='tiered'||S.typology==='stacked';
  $('c-snap').closest('.check').style.opacity=segTyp?'1':'.45';
  { const mz=$('rules').querySelector('[data-param="minZone"]'); if(mz) mz.style.opacity=(segTyp&&S.snap)?'.45':'1'; }
  $('mix-mode').value=S.mixMode; $('mix-target').hidden=S.mixMode!=='target'; $('checks').hidden=S.mixMode==='target';
  syncFor($('mix-params'),MIXP,'mx',S.mix); syncFor($('sub-params'),SUBP,'sb',S.sub);
  const tot=Object.values(S.mix).reduce((a,b)=>a+b,0); $('mix-total').textContent=tot===100?'adds to 100%':`adds to ${tot}% · shares are normalised`;
  $('c-future').checked=!!S.site.future; $('c-labels').checked=!!S.site.labels;
  if(S.site.labelPt==null) S.site.labelPt=12; $('p-labelPt').value=S.site.labelPt; $('o-labelPt').textContent=S.site.labelPt+' pt';
  syncVoidUI(); syncStepUI(); syncWaterUI();
}

/* ---------- void UI ---------- */
let voidUiType=null;
function buildVoidUI(){
  const add=$('void-add');
  add.innerHTML='<option value="">Add a void…</option>'+Object.keys(VOID_TYPES).map(k=>`<option value="${k}">${VOID_TYPES[k].name}</option>`).join('');
  add.addEventListener('change',e=>{ const t=e.target.value; if(!t) return; S.voids.push(Object.assign({type:t},clone(VOID_TYPES[t].defaults))); voidSel=S.voids.length-1; e.target.value=''; update(); });
  $('void-remove').addEventListener('click',()=>{ if(voidSel<0) return; S.voids.splice(voidSel,1); voidSel=Math.min(voidSel,S.voids.length-1); update(); });
  $('void-rhino').addEventListener('click',copyRhino);
}
function syncVoidUI(){
  const chips=$('void-chips'); chips.innerHTML='';
  if(voidSel>=S.voids.length) voidSel=S.voids.length-1;
  if(voidSel<0 && S.voids.length) voidSel=0;
  S.voids.forEach((v,i)=>{
    const b=document.createElement('button'); b.type='button'; b.className='chip'; b.setAttribute('aria-pressed',String(i===voidSel));
    const T=VOID_TYPES[v.type]; const extra=v.type==='f2f'?` ${v.faceA}→${v.faceB}`:'';
    b.innerHTML=`<i></i>${i+1} · ${T?T.chip:v.type}${extra}`;
    b.addEventListener('click',()=>{ voidSel=i; syncVoidUI(); });
    chips.appendChild(b);
  });
  $('void-empty').hidden=S.voids.length>0; $('void-actions').hidden=S.voids.length===0;
  const host=$('void-params');
  if(voidSel<0){ host.innerHTML=''; voidUiType=null; return; }
  const v=S.voids[voidSel], T=VOID_TYPES[v.type]; if(!T){ host.innerHTML=''; return; }
  const key=v.type+'#'+voidSel;
  if(voidUiType!==key){ voidUiType=key; host.innerHTML=`<p class="blurb">${T.blurb}</p>`; const ph=document.createElement('div'); host.appendChild(ph); controlsFor(ph,T.params,'v'+voidSel,()=>S.voids[voidSel],update); }
  syncFor(host,T.params,'v'+voidSel,v);
}
function copyRhino(){
  const f=S.voids.filter(v=>v.type==='f2f'); const btn=$('void-rhino');
  if(!f.length){ btn.textContent='No face-to-face voids'; setTimeout(()=>btn.textContent='Copy as Rhino VOIDS',1500); return; }
  const n=lastFloors.length, H=S.height;
  const lines=[`# Paste into solid_void_tower.py. Match the study tower first:`,`# TOWER_W = ${S.width.toFixed(1)}   TOWER_D = ${S.depth.toFixed(1)}   FLOOR_H = ${S.f2f.toFixed(2)}   FLOORS = ${n}   (H = ${(n*S.f2f).toFixed(1)} m)`,'VOIDS = ['];
  f.forEach((v,i)=>{ lines.push(`    # ${i+1}`); lines.push(`    dict(a=dict(face="${v.faceA}", z=${(v.zA*H).toFixed(1)}, u=${v.uA.toFixed(2)}, w=${v.wA.toFixed(1)}, h=${v.hA.toFixed(1)}),`); lines.push(`         b=dict(face="${v.faceB}", z=${(v.zB*H).toFixed(1)}, u=${v.uB.toFixed(2)}, w=${v.wB.toFixed(1)}, h=${v.hB.toFixed(1)}),`); lines.push(`         bulge=${v.bulge.toFixed(2)}, pull=${v.pull.toFixed(1)}, sections=9),`); });
  lines.push(']');
  copyText(lines.join('\n'),btn,'Copy as Rhino VOIDS');
}
let stepUiMode=null;
function buildStepUI(){
  const sm=$('step-mode'); sm.innerHTML=Object.keys(STEP_MODES).map(k=>`<option value="${k}">${STEP_MODES[k].name}</option>`).join('');
  sm.addEventListener('change',e=>{ const m=e.target.value; S.step=Object.assign({mode:m},clone(STEP_MODES[m].defaults||{})); update(); });
}
function syncStepUI(){
  const m=S.step.mode||'none', M=STEP_MODES[m]; $('step-mode').value=m; $('step-blurb').textContent=M.blurb;
  const host=$('step-params'); if(stepUiMode!==m){ stepUiMode=m; controlsFor(host,M.params,'st',()=>S.step,update); }
  syncFor(host,M.params,'st',S.step);
}
function buildWaterUI(){
  controlsFor($('water-params'),WATER_P,'wa',()=>S.water,update);
  $('c-water').addEventListener('change',e=>{ S.water.on=e.target.checked; update(); });
  $('view-water').addEventListener('click',()=>{ S.water.on=!S.water.on; if(S.water.on){ LAB.tabs.show('tests'); LAB.tabs.showTest('rain'); } update(); });
}
function syncWaterUI(){ $('c-water').checked=!!S.water.on; $('view-water').setAttribute('aria-pressed',String(!!S.water.on)); syncFor($('water-params'),WATER_P,'wa',S.water); $('water-params').style.opacity=S.water.on?'1':'.5'; }
function buildPrecedents(){
  const host=$('precedents');
  for(const p of PRECEDENTS){
    const d=document.createElement('div'); d.className='prec'+(p.mine?' mine':'');
    d.innerHTML=`<div class="prec-head"><b>${p.name}</b><span>${p.h}</span></div><p><span style="color:var(--ink)">${p.city}.</span> ${p.mech}</p>
      <div class="prec-foot">${p.src?`<a href="${p.src}" target="_blank" rel="noopener">source</a>`:'<span></span>'}<button class="btn small" type="button">Apply</button></div>`;
    d.querySelector('button').addEventListener('click',()=>applyPrecedent(p));
    host.appendChild(d);
  }
}
function applyPrecedent(p){
  if(p.apply==='rhino'){ S.typology='prism'; S.width=36; S.depth=30; S.f2f=4.2; S.coreFrac=0.14; S.voids=RHINO_VOIDS.map(v=>Object.assign({type:'f2f'},v)); voidSel=0; S.step={mode:'none'}; }
  else if(p.apply==='void'){ S.voids.push(Object.assign({type:p.type},clone(p.preset))); voidSel=S.voids.length-1; }
  else if(p.apply==='step'){ S.step=Object.assign({mode:p.mode},clone(p.preset)); }
  update();
}

/* ---------- floor editor ---------- */
function buildEditor(){
  const host=$('edit-sliders');
  for(const k in EDIT){
    const p=EDIT[k]; const wrap=document.createElement('div'); wrap.className='ctl';
    wrap.innerHTML=`<div class="ctl-head"><label for="e-${k}">${p.label}</label><output id="o-e-${k}"></output></div><input type="range" id="e-${k}" min="${p.min}" max="${p.max}" step="${p.step}">`;
    wrap.querySelector('input').addEventListener('input',e=>applyEdit(k,parseFloat(e.target.value)));
    host.appendChild(wrap);
  }
  $('e-prog').innerHTML='<option value="auto">Auto (from massing)</option>'+Object.keys(PROG).map(k=>`<option value="${k}">${PROG[k].name}</option>`).join('');
  $('e-prog').addEventListener('change',e=>{ const r=selRange(); if(!r) return; for(let i=r[0];i<=r[1];i++) setOv(i,'prog',e.target.value==='auto'?null:e.target.value); update(); });
  $('e-falloff').addEventListener('input',e=>{ falloff=parseInt(e.target.value,10); $('o-e-falloff').textContent=falloff?falloff+' floors each side':'off'; });
  $('clear-sel').addEventListener('click',()=>{ const r=selRange(); if(!r) return; for(let i=r[0];i<=r[1];i++) delete S.overrides[i]; update(); });
  $('clear-all').addEventListener('click',()=>{ S.overrides={}; update(); });
  const fromInput=(which)=>e=>{ const v=parseInt(e.target.value,10); if(!v||v<1) return; const i=Math.min(v,lastFloors.length)-1; sel[which]=i; if(sel.a===null) sel.a=i; if(sel.b===null) sel.b=i; update(); };
  $('sel-a').addEventListener('change',fromInput('a')); $('sel-b').addEventListener('change',fromInput('b'));
}
function applyEdit(k,v){
  const r=selRange(); if(!r) return; const [lo,hi]=r, neutral=EDIT[k].neutral();
  for(let i=lo;i<=hi;i++) setOv(i,k,v);
  for(let j=1;j<=falloff;j++){ const frac=1-j/(falloff+1), val=neutral+(v-neutral)*frac; setOv(lo-j,k,val); setOv(hi+j,k,val); }
  update();
}
function syncEditor(){
  const r=selRange(), n=lastFloors.length;
  $('editor').disabled=!r; $('sel-a').max=n; $('sel-b').max=n;
  document.querySelectorAll('#edit-sliders .ctl').forEach((el,i)=>{ el.hidden=S.typology==='upload'&&i>0; });
  if(!r){ $('sel-a').value=''; $('sel-b').value=''; $('sel-info').textContent='Click a floor in the section or the model. Shift-click to extend the range.'; return; }
  const [lo,hi]=r; $('sel-a').value=lo+1; $('sel-b').value=hi+1;
  const fl=lastFloors[Math.min(lo,n-1)], o=ovOf(lo), count=hi-lo+1;
  $('sel-info').textContent=`${count===1?'L'+(lo+1):'L'+(lo+1)+'–L'+(hi+1)} · ${count} floor${count>1?'s':''} · ${fl.w.toFixed(0)}×${fl.d.toFixed(0)} m · ${Math.round(fl.area).toLocaleString()} m²${fl.voidFrac>0.02?' · '+Math.round(fl.voidFrac*100)+'% void':''}${fl.terrace>20?' · '+Math.round(fl.terrace)+' m² terrace above':''} · ${PROG[fl.prog].short}`;
  for(const k in EDIT){ const v=o[k]!==undefined?o[k]:EDIT[k].neutral(); $('e-'+k).value=v; $('o-e-'+k).textContent=EDIT[k].fmt(v)+(o[k]!==undefined?'':' · default'); }
  $('e-prog').value=o.prog||'auto'; $('o-e-prog').textContent=o.prog?'manual':'auto';
}

/* ---------- 3D ---------- */
const vp=$('viewport');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.shadowMap.type=THREE.PCFShadowMap;
vp.insertBefore(renderer.domElement, vp.firstChild);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(38,1,1,8000);
const hemi=new THREE.HemisphereLight(0xffffff,0x334455,0.95); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,0.75); sun.position.set(260,520,180); scene.add(sun); scene.add(sun.target);
sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-480; sun.shadow.camera.right=480; sun.shadow.camera.top=480; sun.shadow.camera.bottom=-480; sun.shadow.camera.near=1; sun.shadow.camera.far=3000; sun.shadow.bias=-0.0015;
const ground=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400), new THREE.MeshLambertMaterial({color:0x888888}));
ground.rotation.x=-Math.PI/2; ground.position.y=-0.05; ground.receiveShadow=true; ground.layers.enable(1); scene.add(ground);
let grid=null; const siteGroup=new THREE.Group(); scene.add(siteGroup);
let towerGroup=new THREE.Group(); scene.add(towerGroup);
let waterGroup=new THREE.Group(); scene.add(waterGroup);
const overlayGroup=new THREE.Group(); scene.add(overlayGroup);
const orbit={theta:0.75,phi:1.12,dist:520,target:new THREE.Vector3(0,120,0)};
let needsRender=true;

function applyTheme(){
  readColors();
  scene.background=new THREE.Color(COLORS.view);
  ground.material.color.set(COLORS.ground);
  if(grid){ scene.remove(grid); grid.geometry.dispose(); }
  grid=new THREE.GridHelper(2400,48,new THREE.Color(COLORS.grid),new THREE.Color(COLORS.grid));
  grid.material.transparent=true; grid.material.opacity=0.45; scene.add(grid);
  LAB.buildSite(); needsRender=true;
}
function disposeGroup(g){ scene.remove(g); g.traverse(o=>{ if(o.geometry) o.geometry.dispose(); }); }

/* site model */
/* map-style pointer label: rounded pill with a small tail, fixed pixel size on screen, anchored at its tail */
function labelSprite(text){
  const c=document.createElement('canvas'); const ctx=c.getContext('2d'); const font='600 22px "Barlow Condensed", "Arial Narrow", sans-serif'; ctx.font=font;
  const tw=Math.ceil(ctx.measureText(text).width), pad=12, bh=34, tail=9, w=tw+pad*2, h=bh+tail; c.width=w; c.height=h; ctx.font=font;
  const r=8; ctx.beginPath(); ctx.moveTo(r,0); ctx.lineTo(w-r,0); ctx.quadraticCurveTo(w,0,w,r); ctx.lineTo(w,bh-r); ctx.quadraticCurveTo(w,bh,w-r,bh); ctx.lineTo(w/2+tail*0.8,bh); ctx.lineTo(w/2,h); ctx.lineTo(w/2-tail*0.8,bh); ctx.lineTo(r,bh); ctx.quadraticCurveTo(0,bh,0,bh-r); ctx.lineTo(0,r); ctx.quadraticCurveTo(0,0,r,0); ctx.closePath();
  ctx.fillStyle=COLORS.panel2||'#fff'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=COLORS.line||'#ccc'; ctx.stroke();
  ctx.fillStyle=COLORS.ink; ctx.textBaseline='middle'; ctx.textAlign='center'; ctx.fillText(text,w/2,bh/2+1);
  const tex=new THREE.CanvasTexture(c); tex.minFilter=THREE.LinearFilter;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false,sizeAttenuation:false})); sp.userData.label={w,h,fontPx:22}; fitLabel(sp); sp.center.set(0.5,0); return sp;
}
/* size a label sprite so its text is S.site.labelPt points on screen (1 pt = 96/72 CSS px), whatever the viewport height */
function fitLabel(sp){
  const L=sp.userData.label; if(!L) return; const pt=S.site.labelPt!=null?S.site.labelPt:12;
  const fontPx=pt*96/72, targetH=fontPx*L.h/L.fontPx; // canvas height on screen in CSS px
  const Hpx=renderer.domElement.clientHeight||vp.clientHeight||800; const P11=camera.projectionMatrix.elements[5]||2.9;
  const s=2*targetH/(P11*Hpx); sp.scale.set(s*L.w/L.h,s,1);
}
function fitLabels(){ scene.traverse(o=>{ if(o.isSprite&&o.userData.label) fitLabel(o); }); }
LAB.buildSite=function(){
  siteGroup.clear();
  const site=LAB.site; if(!site) return;
  const mats={existing:new THREE.MeshLambertMaterial({color:new THREE.Color(COLORS.context)}), heritage:new THREE.MeshLambertMaterial({color:new THREE.Color(COLORS.heritage)}),
    plaza:new THREE.MeshLambertMaterial({color:new THREE.Color(COLORS.plaza)}), midblock:new THREE.MeshLambertMaterial({color:new THREE.Color(COLORS.plaza)})};
  for(const m of site.meshes){
    const g=new THREE.BufferGeometry();
    const pos=new Float32Array(m.v.length); for(let i=0;i<m.v.length;i+=3){ pos[i]=m.v[i]; pos[i+1]=m.v[i+2]; pos[i+2]=-m.v[i+1]; }
    g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setIndex(m.f); g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,mats[m.layer]||mats.existing); mesh.userData.site=true; mesh.userData.layer=m.layer;
    mesh.receiveShadow=true; if(m.top>1) mesh.castShadow=true; else mesh.position.y=0.06;
    siteGroup.add(mesh);
  }
  if(S.site.future) for(const f of site.future){
    const b=polyBounds(f.pts); const w=b.maxx-b.minx, d=b.maxy-b.miny, h=f.top-f.base;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color:new THREE.Color(COLORS.future),transparent:true,opacity:0.28,depthWrite:false}));
    mesh.position.set((b.minx+b.maxx)/2,f.base+h/2,-(b.miny+b.maxy)/2); mesh.userData.site=true; mesh.userData.layer='future'; mesh.castShadow=true; mesh.receiveShadow=true; siteGroup.add(mesh);
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:new THREE.Color(COLORS.future),transparent:true,opacity:0.7})); edges.position.copy(mesh.position); siteGroup.add(edges);
  }
  const lineMat={block:new THREE.LineBasicMaterial({color:new THREE.Color(COLORS.ink),transparent:true,opacity:0.35}), curb:new THREE.LineBasicMaterial({color:new THREE.Color(COLORS.muted),transparent:true,opacity:0.5}),
    outline:new THREE.LineBasicMaterial({color:new THREE.Color(COLORS.muted),transparent:true,opacity:0.25}), tower:new THREE.LineBasicMaterial({color:new THREE.Color(COLORS.accent),transparent:true,opacity:0.5}), futureOutline:new THREE.LineBasicMaterial({color:new THREE.Color(COLORS.future)})};
  const segs={}; for(const c of site.curves){ const arr=segs[c.layer]||(segs[c.layer]=[]); for(let i=0;i<c.pts.length-1;i++){ arr.push(c.pts[i][0],0.12,-c.pts[i][1],c.pts[i+1][0],0.12,-c.pts[i+1][1]); } }
  for(const L in segs){ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(segs[L],3)); siteGroup.add(new THREE.LineSegments(g,lineMat[L]||lineMat.outline)); }
  if(site.site&&site.site.polygon){
    const p=site.site.polygon, shape=new THREE.Shape(p.map(q=>new THREE.Vector2(q[0],-q[1])));
    const fill=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:new THREE.Color(COLORS.accent),transparent:true,opacity:0.12,depthWrite:false}));
    fill.rotation.x=-Math.PI/2; fill.position.y=0.1; siteGroup.add(fill);
    const arr=[]; for(let i=0;i<p.length;i++){ const a=p[i], b=p[(i+1)%p.length]; arr.push(a[0],0.2,-a[1],b[0],0.2,-b[1]); }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(arr,3)); siteGroup.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:new THREE.Color(COLORS.accent)})));
  }
  if(S.site.labels){
    // the base model splits some names over two text objects: join a label with its partner within 40 m
    const labels=site.labels.map(l=>({text:l.text.trim(),pos:l.pos.slice()})); const used=new Set();
    for(const a of labels){ if(used.has(a)) continue; if(/^MID-BLOCK$/i.test(a.text)){ let best=null; for(const b of labels){ if(b===a||used.has(b)||!/^CONNECTION$/i.test(b.text)) continue; const d=Math.hypot(a.pos[0]-b.pos[0],a.pos[1]-b.pos[1]); if(d<40&&(!best||d<best.d)) best={b,d}; } if(best){ a.text='MID-BLOCK CONNECTION'; a.pos=[(a.pos[0]+best.b.pos[0])/2,(a.pos[1]+best.b.pos[1])/2]; used.add(best.b); } } }
    for(const l of labels){ if(used.has(l)) continue; const sp=labelSprite(l.text); sp.position.set(l.pos[0],3,-l.pos[1]); siteGroup.add(sp); }
  }
  needsRender=true;
  for(const fn of LAB.hooks.afterSite) fn();
};

function buildTower(floors){
  disposeGroup(towerGroup); towerGroup=new THREE.Group();
  const mats={}; for(const k in PROG) mats[k]=new THREE.MeshLambertMaterial({color:new THREE.Color(COLORS[k])});
  const coreMat=new THREE.MeshLambertMaterial({color:new THREE.Color(COLORS.core)});
  const gap=0.45, r=selRange();
  const selMat=new THREE.LineBasicMaterial({color:new THREE.Color(COLORS.accent)});
  for(const fl of floors){
    const hh=fl.h-gap, yc=fl.z+hh/2;
    for(const rc of fl.rects){
      const m=new THREE.Mesh(new THREE.BoxGeometry(rc.w,hh,rc.d),mats[fl.prog]);
      const p=toWorld(fl,rc.x,rc.y); m.position.set(p.x,yc,-p.y); m.rotation.y=fl.rot; m.userData.i=fl.i; m.castShadow=true; m.receiveShadow=true; towerGroup.add(m);
    }
    const core=new THREE.Mesh(new THREE.BoxGeometry(fl.core*0.96,hh-0.12,fl.core*0.96),coreMat);
    core.position.set(S.posX,yc,-S.posY); core.rotation.y=S.rotDeg*Math.PI/180; core.userData.i=fl.i; core.castShadow=true; towerGroup.add(core);
    if(r && fl.i>=r[0] && fl.i<=r[1]){
      const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(fl.w+0.6,hh+0.6,fl.d+0.6)),selMat);
      edges.position.set(fl.cx,yc,-fl.cy); edges.rotation.y=fl.rot; edges.userData.deco=true; towerGroup.add(edges);
    }
  }
  const top=floors[floors.length-1];
  const stub=new THREE.Mesh(new THREE.BoxGeometry(top.core*0.8,6,top.core*0.8),coreMat);
  stub.position.set(S.posX, top.z+top.h+3, -S.posY); stub.userData.deco=true; towerGroup.add(stub);
  scene.add(towerGroup); needsRender=true;
}
function buildWater3D(){
  disposeGroup(waterGroup); waterGroup=new THREE.Group();
  if(water){
    const c1=new THREE.Color(COLORS.w1), c2=new THREE.Color(COLORS.w2);
    const pos=[], col=[];
    const push=(a,b,t)=>{ const c=c1.clone().lerp(c2,t); pos.push(a[0],a[1],a[2],b[0],b[1],b[2]); col.push(c.r,c.g,c.b,c.r,c.g,c.b); };
    for(const s of water.segs) push(s.a,s.b,s.t);
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    waterGroup.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({vertexColors:true})));
    const mk=(pts,color,size)=>{ if(!pts.length) return; const pg=new THREE.BufferGeometry(); pg.setAttribute('position',new THREE.Float32BufferAttribute(pts.flat(),3)); waterGroup.add(new THREE.Points(pg,new THREE.PointsMaterial({color:new THREE.Color(color),size,sizeAttenuation:false}))); };
    mk(water.pitPts,COLORS.w2,7); mk(water.landPts,COLORS.w1,5);
  }
  scene.add(waterGroup); needsRender=true;
}
function placeCamera(){ const {theta,phi,dist,target}=orbit; camera.position.set(target.x+dist*Math.sin(phi)*Math.sin(theta), target.y+dist*Math.cos(phi), target.z+dist*Math.sin(phi)*Math.cos(theta)); camera.lookAt(target); }
function renderNow(){ placeCamera(); renderer.render(scene,camera); needsRender=false; }
/* capture the viewport as a JPEG data URL; plan=true takes a temporary top-down view over the site */
function captureView(opts){
  opts=opts||{}; const saved={theta:orbit.theta,phi:orbit.phi,dist:orbit.dist,target:orbit.target.clone()};
  if(opts.plan){ orbit.theta=0; orbit.phi=0.02; orbit.dist=opts.dist||1150; orbit.target.set(S.posX,0,-S.posY); }
  else if(opts.iso){ orbit.theta=0.75; orbit.phi=1.12; orbit.dist=opts.dist||S.height*1.75; orbit.target.set(S.posX,S.height*0.42,-S.posY); }
  const hiddenSprites=[]; if(!opts.plan||opts.labels===false) scene.traverse(o=>{ if(o.isSprite&&o.visible){ o.visible=false; hiddenSprites.push(o); } });
  renderNow(); for(const o of hiddenSprites) o.visible=true;
  const src=renderer.domElement, maxW=opts.maxW||1280, sc=Math.min(1,maxW/src.width); const c=document.createElement('canvas'); c.width=Math.round(src.width*sc); c.height=Math.round(src.height*sc);
  c.getContext('2d').drawImage(src,0,0,c.width,c.height); const url=c.toDataURL('image/jpeg',0.82);
  orbit.theta=saved.theta; orbit.phi=saved.phi; orbit.dist=saved.dist; orbit.target.copy(saved.target); renderNow();
  return {url,w:c.width,h:c.height};
}
function resize(){ const w=vp.clientWidth, h=vp.clientHeight; if(!w||!h) return; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); fitLabels(); needsRender=true; }
new ResizeObserver(resize).observe(vp);
(function loop(){ requestAnimationFrame(loop); if(needsRender){ placeCamera(); renderer.render(scene,camera); needsRender=false; } })();

const ptrs=new Map(); let pinchD=0, downAt=null;
vp.addEventListener('pointerdown',e=>{ if(e.target.closest('.viewtools')) return; ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY}); vp.setPointerCapture(e.pointerId); downAt={x:e.clientX,y:e.clientY,shift:e.shiftKey}; });
vp.addEventListener('pointermove',e=>{
  if(!ptrs.has(e.pointerId)) return; const p=ptrs.get(e.pointerId);
  if(ptrs.size===1){ if(e.buttons===2||e.ctrlKey){ const k=orbit.dist*0.0015; const dx=(e.clientX-p.x)*k, dy=(e.clientY-p.y)*k; orbit.target.x-=dx*Math.cos(orbit.theta); orbit.target.z+=dx*Math.sin(orbit.theta); orbit.target.y+=dy; } else { orbit.theta-=(e.clientX-p.x)*0.006; orbit.phi=Math.min(1.52,Math.max(0.12,orbit.phi-(e.clientY-p.y)*0.005)); } needsRender=true; }
  p.x=e.clientX; p.y=e.clientY;
  if(ptrs.size===2){ downAt=null; const [a,b]=[...ptrs.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y); if(pinchD){ orbit.dist=Math.min(2400,Math.max(60,orbit.dist*pinchD/d)); needsRender=true; } pinchD=d; }
});
vp.addEventListener('contextmenu',e=>e.preventDefault());
const ray=new THREE.Raycaster();
const up=e=>{ ptrs.delete(e.pointerId); if(ptrs.size<2) pinchD=0;
  if(!downAt) return; const moved=Math.hypot(e.clientX-downAt.x,e.clientY-downAt.y), shift=downAt.shift; downAt=null;
  if(moved>5||ptrs.size>0) return;
  const rect=renderer.domElement.getBoundingClientRect();
  ray.setFromCamera({x:((e.clientX-rect.left)/rect.width)*2-1, y:-((e.clientY-rect.top)/rect.height)*2+1},camera);
  const hits=ray.intersectObjects(towerGroup.children.filter(o=>!o.userData.deco));
  if(hits.length) select(hits[0].object.userData.i,shift);
};
vp.addEventListener('pointerup',up); vp.addEventListener('pointercancel',e=>{ ptrs.delete(e.pointerId); downAt=null; });
vp.addEventListener('wheel',e=>{ e.preventDefault(); orbit.dist=Math.min(2400,Math.max(60,orbit.dist*(1+e.deltaY*0.0012))); needsRender=true; },{passive:false});
const setView=(th,ph,dist)=>{ orbit.theta=th; orbit.phi=ph; if(dist) orbit.dist=dist; orbit.target.set(S.posX,S.height*0.42,-S.posY); needsRender=true; };
$('view-iso').addEventListener('click',()=>setView(0.75,1.12));
$('view-elev').addEventListener('click',()=>setView(0,1.45));
$('view-top').addEventListener('click',()=>setView(0,0.14));
$('view-site').addEventListener('click',()=>{ orbit.theta=0.6; orbit.phi=0.8; orbit.dist=900; orbit.target.set(0,40,0); needsRender=true; });

/* ---------- water ---------- */
function computeWater(floors,T){
  const {cs,minx,miny,nx,ny,top,H:Hh}=T, N=nx*ny;
  const bias=S.water.mode==='cascade'?-0.02:0.02;
  const E=new Float32Array(N), cells=[];
  for(let k=0;k<N;k++){ if(top[k]<0) continue; const x=minx+((k%nx)+0.5)*cs-S.posX, y=miny+(Math.floor(k/nx)+0.5)*cs-S.posY; E[k]=Hh[k]+bias*Math.hypot(x,y); cells.push(k); }
  cells.sort((a,b)=>E[b]-E[a]);
  const acc=new Float32Array(N).fill(cs*cs), down=new Int32Array(N).fill(-1);
  const pits=[], drops=[];
  for(const k of cells){
    const ix=k%nx, iy=(k/nx)|0; let best=-1, bestE=E[k], toGround=false;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const jx=ix+dx, jy=iy+dy;
      if(jx<0||jy<0||jx>=nx||jy>=ny){ toGround=true; best=-2; bestE=-1e9; continue; }
      const j=jy*nx+jx; if(top[j]<0){ toGround=true; best=-2; bestE=-1e9; continue; }
      if(E[j]<bestE){ bestE=E[j]; best=j; toGround=false; } }
    if(best===-2||toGround){ drops.push({k,flow:acc[k],hgt:Hh[k]}); down[k]=-2; }
    else if(best<0){ pits.push({k,flow:acc[k],level:top[k]}); }
    else { acc[best]+=acc[k]; down[k]=best; }
  }
  const seen=new Uint8Array(N), comps=[];
  for(const k of cells){ if(seen[k]) continue; const t=top[k]; const q=[k]; seen[k]=1; let area=0, outlets=0, edge=0;
    while(q.length){ const c=q.pop(); area+=cs*cs; if(down[c]===-2) edge++; if(down[c]===-1) outlets++;
      const ix=c%nx, iy=(c/nx)|0; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const jx=ix+dx,jy=iy+dy; if(jx<0||jy<0||jx>=nx||jy>=ny) continue; const j=jy*nx+jx; if(!seen[j]&&top[j]===t){ seen[j]=1; q.push(j); } } }
    comps.push({level:t,area,outlets,edge}); }
  comps.sort((a,b)=>b.area-a.area);
  const maxAcc=Math.max(1,...cells.map(k=>acc[k]));
  const segs=[], pitPts=[], landPts=[];
  const P=(k,h)=>[minx+((k%nx)+0.5)*cs, h, -(miny+(((k/nx)|0)+0.5)*cs)];
  for(const k of cells){ if(acc[k]<4) continue; const t=Math.log(acc[k])/Math.log(maxAcc);
    if(down[k]>=0) segs.push({a:P(k,Hh[k]+0.3),b:P(down[k],Hh[down[k]]+0.3),t});
    else if(down[k]===-2){ segs.push({a:P(k,Hh[k]+0.3),b:P(k,0.3),t:1}); landPts.push(P(k,0.4)); } }
  for(const p of pits) if(p.flow>=4) pitPts.push(P(p.k,Hh[p.k]+0.5));
  const area=cells.length*cs*cs, storm=S.water.storm, lps=a=>a*storm/3600;
  pits.sort((a,b)=>b.flow-a.flow); drops.sort((a,b)=>b.flow-a.flow);
  return {area, yield:area*S.water.rain/1000*0.8, peak:lps(area), outlets:pits.filter(p=>p.flow>=4).length, biggestOutlet:pits.length?lps(pits[0].flow):0,
    dropsN:drops.filter(d=>d.flow>=4).length, biggestDrop:drops.length?lps(drops[0].flow):0, maxDrop:drops.length?Math.max(...drops.map(d=>d.hgt)):0,
    toGround:drops.reduce((s,d)=>s+d.flow,0), toOutlets:pits.reduce((s,p)=>s+p.flow,0), comps, segs, pitPts, landPts};
}

/* ---------- section ---------- */
function drawSection(floors,zones){
  const VW=390, VH=600, s=1.72, x0=112, yb=572;
  const parts=[`<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Tower section coloured by program">`];
  for(let m=0;m<=300;m+=50){ const y=yb-m*s; parts.push(`<line class="ruler" x1="22" x2="30" y1="${y}" y2="${y}"/><text x="18" y="${y+3}" font-size="9" text-anchor="end">${m}</text>`); }
  parts.push(`<line class="ruler" x1="30" x2="30" y1="${yb}" y2="${yb-300*s}"/>`);
  parts.push(`<line x1="40" x2="200" y1="${yb}" y2="${yb}" stroke="var(--ink)" stroke-width="1.2"/>`);
  const r=selRange();
  const leftEdge=Math.min(...floors.map(fl=>x0+fl.ux*s-fl.ext*s/2));
  for(const fl of floors){
    const w=fl.ext*s, x=x0+fl.ux*s-w/2, y=yb-(fl.z+fl.h)*s, h=fl.h*s-0.6;
    const isSel=r&&fl.i>=r[0]&&fl.i<=r[1];
    parts.push(`<rect data-i="${fl.i}" class="${isSel?'sel':''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${COLORS[fl.prog]}"><title>L${fl.i+1} · ${Math.round(fl.area).toLocaleString()} m²${fl.voidFrac>0.02?' · '+Math.round(fl.voidFrac*100)+'% void':''} · ${PROG[fl.prog].short}</title></rect>`);
    if(fl.voidFrac>0.01){ const m=fl.mask; let ix=0; const cv=fl.colVoid; const band=v=>v>=0.97?3:(v>=0.55?2:(v>=0.25?1:0));
      while(ix<m.nx){ const b=band(cv[ix]); if(!b){ ix++; continue; } let e=ix; while(e+1<m.nx&&band(cv[e+1])===b) e++;
        const vx=x0+(fl.ux+m.x0+ix)*s, vw=(e-ix+1)*s; parts.push(`<rect class="void" x="${vx.toFixed(1)}" y="${y.toFixed(1)}" width="${vw.toFixed(1)}" height="${h.toFixed(1)}" fill-opacity="${[0,0.4,0.7,1][b]}"/>`); ix=e+1; } }
    if(fl.edited) parts.push(`<rect class="mark" x="${(leftEdge-6).toFixed(1)}" y="${y.toFixed(1)}" width="2.5" height="${h.toFixed(1)}"/>`);
  }
  for(const fl of floors){ const c=fl.core*s, y=yb-(fl.z+fl.h)*s; parts.push(`<rect class="core" x="${(x0-c/2).toFixed(1)}" y="${y.toFixed(1)}" width="${c.toFixed(1)}" height="${(fl.h*s-0.6).toFixed(1)}"/>`); }
  const yt=yb-S.height*s; parts.push(`<line class="lead" x1="34" x2="${x0}" y1="${yt}" y2="${yt}"/><text x="36" y="${yt-3}" font-size="9">${S.height} m</text>`);
  const labels=zones.filter(z=>z.floors.length>=2||z.prog==='observation'||z.manual).map(z=>({z,y:yb-((z.floors[0].z+z.top)/2)*s}));
  labels.sort((a,b)=>a.y-b.y);
  for(let k=1;k<labels.length;k++){ if(labels[k].y-labels[k-1].y<26) labels[k].y=labels[k-1].y+26; }
  for(let k=labels.length-2;k>=0;k--){ if(labels[k+1].y-labels[k].y<26) labels[k].y=labels[k+1].y-26; }
  for(const L of labels){
    const z=L.z, xr=x0+Math.max(...z.floors.map(fl=>fl.ux*s+fl.ext*s/2))+6, zc=yb-((z.floors[0].z+z.top)/2)*s;
    parts.push(`<line class="lead" x1="${xr}" x2="206" y1="${zc}" y2="${L.y}"/>`);
    parts.push(`<text class="zl" x="210" y="${L.y-2}" font-size="10.5">${PROG[z.prog].short} · L${z.start+1}–L${z.end+1}</text>`);
    parts.push(`<text x="210" y="${L.y+9}" font-size="8.5">${z.floors.length} fl · ${Math.round(z.minA).toLocaleString()}${z.maxA-z.minA>20?'–'+Math.round(z.maxA).toLocaleString():''} m² · ${z.maxD.toFixed(1)} m</text>`);
  }
  parts.push('</svg>');
  $('section').innerHTML=parts.join('');
  $('section').onclick=e=>{ const t=e.target.closest('rect[data-i]'); if(t) select(parseInt(t.dataset.i,10),e.shiftKey); };
  $('legend').innerHTML=Object.keys(PROG).map(k=>`<span><i style="background:${COLORS[k]}"></i>${PROG[k].name}</span>`).join('')+`<span><i style="background:var(--core)"></i>Core</span>`;
}

/* ---------- tables and stats ---------- */
const fmtI=v=>Math.round(v).toLocaleString();
function drawTables(floors,zones){
  const gfa=floors.reduce((s,f)=>s+f.area,0), nia=floors.reduce((s,f)=>s+Math.max(0,f.area-f.coreArea),0);
  const byP={}; for(const f of floors){ byP[f.prog]=byP[f.prog]||{fl:0,gfa:0,terr:0,cov:0}; byP[f.prog].fl++; byP[f.prog].gfa+=f.area; byP[f.prog].terr+=f.terrace+f.roof; byP[f.prog].cov+=f.coveredVoid; }
  const order=Object.keys(PROG).filter(k=>byP[k]);
  const byC={}; for(const k of order){ const c=PROG[k].cat; byC[c]=byC[c]||{gfa:0,terr:0,cov:0}; byC[c].gfa+=byP[k].gfa; byC[c].terr+=byP[k].terr; byC[c].cov+=byP[k].cov; }
  $('mix').innerHTML=`<thead><tr><th>Program</th><th class="num">Floors</th><th class="num">Indoor m²</th><th class="num">Share</th><th class="num">Terrace m²</th><th class="num">Covered outdoor</th></tr></thead><tbody>`+
    Object.keys(CAT).filter(c=>byC[c]).map(c=>`<tr class="cat"><td><span class="dot" style="background:var(${CAT[c].tok})"></span><b>${CAT[c].name}</b></td><td></td><td class="num"><b>${fmtI(byC[c].gfa)}</b></td><td class="num"><b>${(byC[c].gfa/gfa*100).toFixed(0)}%</b></td><td class="num">${fmtI(byC[c].terr)}</td><td class="num">${fmtI(byC[c].cov)}</td></tr>`+
      order.filter(k=>PROG[k].cat===c).map(k=>`<tr><td style="padding-left:18px"><span class="dot" style="background:${COLORS[k]}"></span>${PROG[k].name}</td><td class="num">${byP[k].fl}</td><td class="num">${fmtI(byP[k].gfa)}</td><td class="num">${(byP[k].gfa/gfa*100).toFixed(0)}%</td><td class="num">${byP[k].terr>0.5?fmtI(byP[k].terr):'–'}</td><td class="num">${byP[k].cov>0.5?fmtI(byP[k].cov):'–'}</td></tr>`).join('')).join('')+
    `<tr><td><b>Total</b></td><td class="num"><b>${floors.length}</b></td><td class="num"><b>${fmtI(gfa)}</b></td><td class="num">100%</td><td class="num"><b>${fmtI(floors.reduce((s,f)=>s+f.terrace+f.roof,0))}</b></td><td class="num"><b>${fmtI(floors.reduce((s,f)=>s+f.coveredVoid,0))}</b></td></tr></tbody>`;
  const big=zones.filter(z=>z.floors.length>=2||z.prog==='observation'||z.prog==='retail'||z.garden);
  $('zones').innerHTML=`<thead><tr><th>Levels</th><th>Program</th><th>Massing reading</th></tr></thead><tbody>`+
    [...big].reverse().map(z=>`<tr><td class="num">L${z.start+1}–L${z.end+1}</td><td><span class="dot" style="background:${COLORS[z.prog]}"></span>${PROG[z.prog].short}<br><span style="color:var(--muted);font-size:11px">${z.floors.length} fl · ${fmtI(z.gfa)} m²</span></td><td class="why">${why(z)}</td></tr>`).join('')+`</tbody>`;
  const r=selRange();
  $('schedule').innerHTML=`<thead><tr><th>Lvl</th><th class="num">Elev m</th><th class="num">F2F m</th><th class="num">Plate m</th><th class="num">Indoor m²</th><th class="num">Void</th><th class="num">Terrace m²</th><th class="num">Depth m</th><th>Program</th></tr></thead><tbody>`+
    [...floors].reverse().map(f=>`<tr data-i="${f.i}" class="${r&&f.i>=r[0]&&f.i<=r[1]?'sel':''}"><td class="num">L${f.i+1}${f.edited?'<span class="ed" title="edited">•</span>':''}</td><td class="num">${f.z.toFixed(1)}</td><td class="num">${f.h.toFixed(1)}</td><td class="num">${f.w.toFixed(0)}×${f.d.toFixed(0)}${f.urot?' ∠'+Math.round(f.urot*180/Math.PI)+'°':''}</td><td class="num">${fmtI(f.area)}</td><td class="num">${f.voidFrac>0.005?Math.round(f.voidFrac*100)+'%':'–'}</td><td class="num">${(f.terrace+f.roof)>0.5?fmtI(f.terrace+f.roof):'–'}</td><td class="num">${f.leaseMax.toFixed(1)}</td><td><span class="dot" style="background:${COLORS[f.prog]}"></span>${PROG[f.prog].short}</td></tr>`).join('')+`</tbody>`;
  $('schedule').onclick=e=>{ const t=e.target.closest('tr[data-i]'); if(t) select(parseInt(t.dataset.i,10),e.shiftKey); };

  const base=floors[0], slender=S.height/Math.min(base.w,base.d), top=floors[floors.length-1];
  const edited=floors.filter(f=>f.edited).length, voidGfa=floors.reduce((s,f)=>s+f.w*f.d-f.area,0);
  const siteArea=(LAB.site&&LAB.site.site)?LAB.site.site.area:0;
  const outdoor=floors.reduce((s,f)=>s+f.terrace+f.roof+f.coveredVoid,0);
  const stats=[['Height',S.height+' m'],['Floors',floors.length],['Indoor GFA',fmtI(gfa)+' m²'],['Outdoor',fmtI(outdoor)+' m²'],['FSR',siteArea?(gfa/siteArea).toFixed(1):'–'],['Slenderness',slender.toFixed(1)+' : 1'],['Efficiency',(nia/gfa*100).toFixed(0)+'%']];
  $('stats').innerHTML=stats.map(([k,v])=>`<div class="stat"><b>${v}</b><small>${k}</small></div>`).join('');
  $('hud').innerHTML=`<b>${TYP[S.typology].name}</b>${S.step.mode&&S.step.mode!=='none'?' · '+STEP_MODES[S.step.mode].name.toLowerCase():''}${S.voids.length?' · '+S.voids.length+' void'+(S.voids.length>1?'s':''):''} · top occupied ${(top.z+top.h).toFixed(1)} m · core ${base.core.toFixed(1)} m sq${edited?` · <b>${edited}</b> floor${edited>1?'s':''} edited`:''}<br>Drag to orbit · right-drag to pan · scroll to zoom · click a floor to edit it`;

  const warns=[];
  if(slender>9) warns.push(`Slenderness ${slender.toFixed(1)}:1 is beyond the usual 8:1; expect outriggers or a damper at the top and a stiffer core.`);
  const coreOut=floors.filter(f=>{ const c=toLocal(f,S.posX,S.posY); return Math.abs(c.x)+f.core/2>f.w/2+0.5||Math.abs(c.y)+f.core/2>f.d/2+0.5; });
  if(coreOut.length) warns.push(`The continuous core sits outside the plate on ${coreOut.length} floor${coreOut.length>1?'s':''} (from L${coreOut[0].i+1}). Reduce the shift or step, or enlarge those plates.`);
  if(floors.some(f=>f.leaseMin<5.5)) warns.push('Some plates leave under 5.5 m between core and façade; they may not be usable as lettable space.');
  const gardens=floors.filter(f=>f.garden).length; if(gardens>floors.length*0.25) warns.push(`${gardens} floors lose more than half their plate to voids; the scheme is reading as more garden than building.`);
  if(LAB.site&&LAB.site.site){ const p=LAB.site.site.polygon; const outside=floors.filter(f=>{ for(const rc of f.rects){ const q=toWorld(f,rc.x,rc.y); if(!pointInPoly(q.x,q.y,p)) return true; } return false; }); if(outside.length) warns.push(`${outside.length} floor${outside.length>1?'s':''} reach beyond the site boundary (from L${outside[0].i+1}); move or rotate the tower, or shrink the plate.`); }
  if(S.typology==='upload'&&(S.height<250||S.height>300)) warns.push(`The uploaded massing is ${S.height} m tall, outside the 250–300 m brief.`);
  $('warn').textContent=warns.join(' ');

  $('water-out').hidden=!water;
  if(water){
    const W=water, n=floors.length;
    const cells=[['Catchment on building',fmtI(W.area)+' m²'],['Annual yield',fmtI(W.yield)+' m³/yr <em>at 80% runoff</em>'],['Peak run-off',W.peak.toFixed(0)+' L/s <em>'+S.water.storm+' mm/h</em>'],
      ['Gutter outlets',W.outlets+' <em>largest '+W.biggestOutlet.toFixed(1)+' L/s</em>'],['Edge cascades',W.dropsN+' <em>largest '+W.biggestDrop.toFixed(1)+' L/s</em>'],['Tallest free fall',W.maxDrop.toFixed(0)+' m']];
    $('water-stats').innerHTML=cells.map(([k,v])=>`<div class="stat"><b>${v}</b><small>${k}</small></div>`).join('');
    $('terraces').innerHTML=`<thead><tr><th>Surface</th><th class="num">Area m²</th><th class="num">Share</th><th>Leaves by</th></tr></thead><tbody>`+
      W.comps.slice(0,7).map(c=>`<tr><td>${c.level>=n-1?'Roof':'Terrace L'+(c.level+2)}</td><td class="num">${fmtI(c.area)}</td><td class="num">${(c.area/W.area*100).toFixed(0)}%</td><td class="why">${c.edge&&c.outlets?`${c.edge} m of edge and ${c.outlets} outlet${c.outlets>1?'s':''}`:(c.edge?`${c.edge} m of edge, cascading`:(c.outlets?`${c.outlets} gutter outlet${c.outlets>1?'s':''}`:'ponds'))}</td></tr>`).join('')+`</tbody>`;
    const share=W.toGround/(W.toGround+W.toOutlets||1);
    $('water-note').textContent=(S.water.mode==='cascade'?`Terraces fall outward, so ${Math.round(share*100)}% of the catchment ends as free-fall over an edge. Switch to inward drainage to size gutters and downpipes instead.`:`Terraces fall inward to a gutter at the wall or core, so ${Math.round((1-share)*100)}% of the catchment is collected at ${W.outlets} outlet${W.outlets===1?'':'s'}.`)+' Vancouver averages about 1,190 mm of rain a year at the airport, most of it from October to March.';
    $('water-year').hidden=S.water.period!=='period';
    if(S.water.period==='period'&&LAB.CLIMATE&&LAB.sim){ const Y=rainYear(floors,W);
      $('water-year').innerHTML=`<h3>${Y.label}, on Vancouver normals</h3><div class="wgrid">${[['Rain in the period',fmtI(Y.rainTot)+' mm'],['Yield in the period',fmtI(Y.yieldTot)+' m³'],['Wettest month',Y.wettest?Y.wettest.m+' · '+fmtI(Y.wettest.yield)+' m³':'–'],['Driest month',Y.driest?Y.driest.m+' · '+fmtI(Y.driest.yield)+' m³':'–'],['Planted terrace area',fmtI(Y.planted)+' m²'],['Irrigation need (May–Sep days in period)',fmtI(Y.demandTot)+' m³'],['Cistern to bridge shortfalls',fmtI(Y.cistern)+' m³'],['Surplus to drain',fmtI(Y.surplus)+' m³']].map(x=>`<div class="stat"><b>${x[1]}</b><small>${x[0]}</small></div>`).join('')}</div>
      <div class="viz">${rainChart(Y)}</div>
      <div class="tbl-wrap"><table><thead><tr><th>Month</th><th class="num">Days</th><th class="num">Rain mm</th><th class="num">Yield m³</th><th class="num">Irrigation m³</th><th class="num">Balance m³</th></tr></thead><tbody>${Y.rows.filter(r=>r.days>0).map(r=>`<tr><td>${r.m}</td><td class="num">${r.days}</td><td class="num">${r.rain}</td><td class="num">${fmtI(r.yield)}</td><td class="num">${fmtI(r.demand)}</td><td class="num">${(r.yield-r.demand>=0?'+':'')+fmtI(r.yield-r.demand)}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">Monthly yield = catchment × monthly normal rainfall × 0.8 runoff, pro-rated to the days of each month inside the period. Irrigation assumes the planted share of terraces needs 3 L/m² per day from May to September. The cistern figure is the largest cumulative shortfall when rain from wetter months is stored to water the drier ones.</p>`;
    }
  }
}
function rainYear(floors,W){
  const C=LAB.CLIMATE, PI=LAB.sim.periodInfo(), planted=floors.reduce((s,f)=>s+f.terrace+f.roof,0)*S.water.planted, scale=S.water.rain/C.rain.reduce((a,b)=>a+b,0);
  const rows=C.months.map((m,i)=>{ const days=PI.monthDays[i]; const rain=Math.round(C.rain[i]*scale*days/C.days[i]); const y=W.area*rain/1000*0.8; const demand=(i>=4&&i<=8)?planted*3*days/1000:0; return {m,days,rain,yield:y,demand}; });
  const inP=rows.filter(r=>r.days>0); let wettest=null, driest=null; for(const r of inP){ if(!wettest||r.yield>wettest.yield) wettest=r; if(!driest||r.yield<driest.yield) driest=r; }
  const order=rows.slice(PI.startMonth).concat(rows.slice(0,PI.startMonth));
  const demandTot=rows.reduce((s,r)=>s+r.demand,0), yieldTot=rows.reduce((s,r)=>s+r.yield,0), rainTot=rows.reduce((s,r)=>s+r.rain,0);
  let running=0, peakNeed=0; for(const r of order){ running+=r.demand-r.yield; if(running<0) running=0; peakNeed=Math.max(peakNeed,running); }
  return {rows,wettest,driest,planted,demandTot,yieldTot,rainTot,label:PI.full?'Whole year':PI.label,cistern:Math.min(peakNeed,demandTot),surplus:Math.max(0,yieldTot-demandTot)};
}
function rainChart(Y){
  const W=380,H=170,L=44,R=8,T=12,B=26,pw=W-L-R,ph=H-T-B; const max=Math.max(1,...Y.rows.map(r=>Math.max(r.yield,r.demand)));
  const nice=v=>{ const p=Math.pow(10,Math.floor(Math.log10(v))); const f=v/p; return (f<=1?1:(f<=2?2:(f<=5?5:10)))*p; }; const step=nice(max/4), ymax=Math.ceil(max/step)*step; const y=v=>T+ph-(v/ymax)*ph, bw=pw/12;
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly rain yield and irrigation need"><style>text{font-family:system-ui,sans-serif;font-size:9px;fill:var(--muted)}</style>`;
  for(let v=0;v<=ymax+1e-9;v+=step) s+=`<line x1="${L}" x2="${W-R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/><text x="${L-4}" y="${(y(v)+3).toFixed(1)}" text-anchor="end">${fmtI(v)}</text>`;
  s+=`<text x="${L-4}" y="8" text-anchor="end">m³</text>`;
  Y.rows.forEach((r,i)=>{ const x=L+i*bw+2, w=bw-4; if(r.days>0){ s+=`<rect x="${x.toFixed(1)}" y="${y(r.yield).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0,y(0)-y(r.yield)).toFixed(1)}" fill="var(--s1)"><title>${r.m}: ${fmtI(r.yield)} m³ yield</title></rect>`; if(r.demand>0) s+=`<rect x="${(x+w*0.3).toFixed(1)}" y="${y(r.demand).toFixed(1)}" width="${(w*0.4).toFixed(1)}" height="${Math.max(0,y(0)-y(r.demand)).toFixed(1)}" fill="var(--s2)"><title>${r.m}: ${fmtI(r.demand)} m³ irrigation</title></rect>`; } s+=`<text x="${(x+w/2).toFixed(1)}" y="${H-B+10}" text-anchor="middle"${r.days>0?'':' opacity=".4"'}>${r.m}</text>`; });
  s+=`<line x1="${L}" x2="${W-R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="axis"/><rect x="${L}" y="${H-9}" width="8" height="8" rx="2" fill="var(--s1)"/><text x="${L+11}" y="${H-2}">Rain yield</text><rect x="${L+80}" y="${H-9}" width="8" height="8" rx="2" fill="var(--s2)"/><text x="${L+91}" y="${H-2}">Irrigation need</text>`;
  return s+'</svg>';
}
function pointInPoly(x,y,poly){ let ins=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1]; if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-9)+xi)) ins=!ins; } return ins; }
function copyText(txt,btn,label){
  const done=()=>{ btn.textContent='Copied'; setTimeout(()=>btn.textContent=label,1500); };
  const fallback=()=>{ const ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); done(); }catch(e){ btn.textContent='Select and copy manually'; } document.body.removeChild(ta); };
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done,fallback); else fallback();
}
function scheduleCSV(){
  const rows=[['level','elevation_m','floor_height_m','centre_x_m','centre_y_m','width_m','depth_m','rotation_deg','indoor_m2','void_fraction','terrace_m2','covered_outdoor_m2','core_m','lease_depth_max_m','program','category','edited']];
  for(const f of lastFloors) rows.push([f.i+1,f.z.toFixed(2),f.h.toFixed(2),f.cx.toFixed(2),f.cy.toFixed(2),f.w.toFixed(2),f.d.toFixed(2),(f.rot*180/Math.PI).toFixed(1),f.area.toFixed(1),f.voidFrac.toFixed(3),(f.terrace+f.roof).toFixed(1),f.coveredVoid.toFixed(1),f.core.toFixed(2),f.leaseMax.toFixed(2),PROG[f.prog].name,CAT[PROG[f.prog].cat].name,f.edited?'yes':'no']);
  return rows.map(r=>r.join(',')).join('\n');
}
function copyCSV(){ copyText(scheduleCSV(),$('copy'),'Copy schedule as CSV'); }

/* ---------- update ---------- */
let updating=false;
function update(){
  if(updating) return; updating=true;
  try{
    const floors=floorsFor(S);
    buildMasks(floors);
    topRaster=computeTop(floors);
    assignProgram(floors,S);
    const zones=zonesOf(floors);
    lastFloors=floors; LAB.floors=floors; LAB.top=topRaster;
    syncControls();
    if(sel.a!==null){ sel.a=Math.min(sel.a,floors.length-1); sel.b=Math.min(sel.b,floors.length-1); }
    if(lastHeight!==S.height){ orbit.target.set(S.posX,S.height*0.42,-S.posY); if(!lastHeight) orbit.dist=S.height*1.75; lastHeight=S.height; }
    water=S.water.on?computeWater(floors,topRaster):null;
    buildTower(floors); buildWater3D(); drawSection(floors,zones); drawTables(floors,zones); syncEditor(); save();
    for(const fn of LAB.hooks.afterUpdate){ try{ fn(floors); }catch(e){ console.error(e); } }
  } finally { updating=false; }
}

LAB.boot=function(){
  buildControls(); applyTheme(); resize(); update();
  fetch('site.json').then(r=>r.ok?r.json():null).then(j=>{ if(j){ LAB.site=j; LAB.buildSite(); update(); } }).catch(e=>console.warn('site.json not loaded',e));
  const mq=window.matchMedia('(prefers-color-scheme: dark)');
  const retheme=()=>{ applyTheme(); update(); };
  if(mq.addEventListener) mq.addEventListener('change',retheme);
  new MutationObserver(retheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
};
/* ---------- left-pane tabs ---------- */
LAB.tabs={
  show(name){ if(!document.querySelector('#tabs button[data-tab="'+name+'"]')) name=CFG.tab||'site';
    document.querySelectorAll('#tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===name))); document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name)); try{ localStorage.setItem(KEY+':tab',name); }catch(e){}
    for(const fn of LAB.hooks.tab){ try{ fn(name); }catch(e){ console.error(e); } } },
  showTest(name){ document.querySelectorAll('#subtabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.test===name))); document.querySelectorAll('.test').forEach(t=>t.classList.toggle('active',t.dataset.test===name)); try{ localStorage.setItem(KEY+':test',name); }catch(e){} },
  init(){
    document.querySelectorAll('#tabs button').forEach(b=>b.addEventListener('click',()=>LAB.tabs.show(b.dataset.tab)));
    document.querySelectorAll('#subtabs button').forEach(b=>b.addEventListener('click',()=>{ LAB.tabs.showTest(b.dataset.test); if(LAB.sim) LAB.sim.setTest(b.dataset.test); }));
    let t=CFG.tab||'site', tt='rain'; try{ t=localStorage.getItem(KEY+':tab')||t; tt=localStorage.getItem(KEY+':test')||tt; }catch(e){}
    LAB.tabs.showTest(tt); LAB.tabs.show(t);
  }
};
Object.assign(LAB,{update, PROG, CAT, COLORS, PARAMS, TYP, V3, toWorld, toLocal, scene, renderer, camera, siteGroup, overlayGroup, ground, sun, hemi, orbit, requestRender:()=>{needsRender=true;}, renderNow, captureView, scheduleCSV, copyText, controlsFor, syncFor, $, fmtI, pointInPoly, polyBounds, newMask, finishMask, select, setSelectionNone:()=>{sel.a=sel.b=null;}, zonesOf, why, rainYear});
Object.defineProperties(LAB,{
  S:{get(){return S;},set(v){S=v;}},
  towerGroup:{get(){return towerGroup;}},
  waterGroup:{get(){return waterGroup;}},
  lastFloors:{get(){return lastFloors;}},
  water:{get(){return water;}},
});
})();
