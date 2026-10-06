// On-device skin and lesion detection: known-answer tests over synthetic
// frames. Run with:  npm run test:detector
import { analyzeFrame } from '../src/lib/skinAnalysis.js'
const W=160,H=120
const NOISE = 12   // realistic sensor/JPEG noise, heavier than before
function make(fill){const d=new Uint8ClampedArray(W*H*4)
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const[r,g,b]=fill(x,y);const p=(y*W+x)*4
    d[p]=r;d[p+1]=g;d[p+2]=b;d[p+3]=255}return{data:d,width:W,height:H}}
const n=()=>(Math.random()-0.5)*NOISE
const SKIN={'FitzI pale':[255,219,203],'FitzII':[224,172,138],'FitzIII':[198,150,120],
 'FitzIV':[172,120,90],'FitzV':[126,86,62],'FitzVI':[92,62,46],'FitzVI deep':[68,45,34],
 'warm light':[235,165,125],'cool light':[205,165,150],'shadowed':[140,105,85]}
const OBJ={'pine wood':[196,150,100],'oak desk':[150,105,60],'dark wood':[110,72,40],
 'cardboard':[186,152,110],'manila':[210,180,130],'terracotta':[190,105,70],
 'orange fruit':[240,140,40],'brick':[160,80,60],'tan leather':[175,130,90],
 'beige wall':[220,205,185],'kraft paper':[168,133,92],'white wall':[235,235,232],
 'plant':[60,120,55],'sky':[110,150,220],'blue shirt':[70,70,140],'grey laptop':[120,120,125]}
const flat=c=>make(()=>[c[0]+n(),c[1]+n(),c[2]+n()])
const grain=c=>make((x,y)=>{const k=Math.sin(y/2.5)*18;return[c[0]+k+n(),c[1]+k*0.8+n(),c[2]+k*0.6+n()]})
const mole=c=>make((x,y)=>Math.hypot(x-80,y-60)<13?[c[0]*.35,c[1]*.30,c[2]*.32]:[c[0]+n(),c[1]+n(),c[2]+n()])
const hair=c=>make((x,y)=>Math.abs(y-(60+Math.sin(x/9)*16))<1.2?[30,25,22]:[c[0]+n(),c[1]+n(),c[2]+n()])

let pass=0,fail=0
const chk=(label,a,wantSkin,wantLesion)=>{
  const ok = a.isSkin===wantSkin && (wantLesion===null||a.hasLesion===wantLesion)
  ok?pass++:fail++
  console.log((ok?'  ok  ':'  FAIL').padEnd(7)+label.padEnd(22),
    'skin='+(a.isSkin?'Y':'n'),'ratio='+a.skinRatio.toFixed(2),'lesion='+(a.hasLesion?'Y':'n'))
}
console.log('--- non-skin objects: expect skin=n ---')
for(const k in OBJ) chk(k, analyzeFrame(flat(OBJ[k])), false, null)
console.log('--- wood with grain: expect skin=n ---')
for(const k of ['pine wood','oak desk','cardboard']) chk(k+' grain', analyzeFrame(grain(OBJ[k])), false, null)
console.log('--- clear skin: expect skin=Y lesion=n ---')
for(const k in SKIN) chk(k, analyzeFrame(flat(SKIN[k])), true, false)
console.log('--- skin + mole: expect skin=Y lesion=Y ---')
for(const k in SKIN) chk(k, analyzeFrame(mole(SKIN[k])), true, true)
console.log('--- skin + hair only: expect skin=Y lesion=n ---')
for(const k in SKIN) chk(k, analyzeFrame(hair(SKIN[k])), true, false)

// --- objects in the middle of the frame ------------------------------------
//
// The ring test accepts a frame whose outer edge is skin, which is how a hand
// resting beside a keyboard got the keyboard analysed as one enormous lesion.
// The middle of the frame is what is being photographed, so when it isn't skin
// it has to look like a plausible darkening of the skin around it.
const KB={'black kb':[[48,48,50],[28,28,30]],'warm-lit black kb':[[78,70,62],[44,40,36]],
 'grey kb':[[125,125,128],[85,85,88]],'silver kb':[[225,225,228],[180,180,184]],
 'warm-lit white kb':[[238,222,198],[196,180,158]],'beige kb':[[212,202,182],[170,160,142]],
 'tungsten beige kb':[[224,192,158],[180,152,122]]}
// Key tops on a darker chassis, with the gaps on a regular grid.
const keys=(key,chas)=>(x,y)=>{const c=(x%13<3||y%11<3)?chas:key;return[c[0]+n(),c[1]+n(),c[2]+n()]}
const SKIN_MID=[198,150,120]
// Skin at the edge of frame, object filling the middle.
const around=f=>(x,y)=>{const nx=(x-W/2)/(W*.35),ny=(y-H/2)/(H*.35)
  return Math.hypot(nx,ny)>0.72?[SKIN_MID[0]+n(),SKIN_MID[1]+n(),SKIN_MID[2]+n()]:f(x,y)}
const solid=c=>()=>[c[0]+n(),c[1]+n(),c[2]+n()]

console.log('--- keyboard fills the frame: expect skin=n ---')
for(const k in KB) chk(k, analyzeFrame(make(keys(...KB[k]))), false, null)
console.log('--- skin at the edges, keyboard in the middle: expect skin=n ---')
for(const k in KB) chk(k, analyzeFrame(make(around(keys(...KB[k])))), false, null)
console.log('--- skin at the edges, other objects in the middle: expect skin=n ---')
for(const [k,c] of Object.entries({'black phone':[32,32,34],'white mug':[238,238,240],
  'grey mouse':[110,112,116],'monitor bezel':[24,24,26],'denim':[70,80,120],
  'green mousepad':[60,110,70],'steel':[160,163,168]}))
  chk(k, analyzeFrame(make(around(solid(c)))), false, null)

// The ring test exists so a lesion covering most of the frame is not refused.
// That must still work, or the fix above has broken the case it was added for.
console.log('--- skin at the edges, large lesion in the middle: expect skin=Y lesion=Y ---')
for(const [k,c] of Object.entries({'very dark lesion':[25,18,15],'dark brown lesion':[52,34,26],
  'inflamed patch':[150,70,58]}))
  chk(k, analyzeFrame(make(around(solid(c)))), true, true)

console.log('\npass='+pass+' fail='+fail)

process.exit(fail ? 1 : 0)
