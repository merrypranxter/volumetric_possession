import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {PigmentField} from "../src/field.js";
import {echoSettings,queuePhantomEcho,cloneEchoes,echoPosition,
  advancePhantomEchoes,ECHO_CAP,ECHO_STAMPS_PER_STEP} from "../src/phantom-echoes.js";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");
const settings={mode:"spiral",copies:3,delay:.25,drift:.9,duration:1.2,strength:.9};
const spawn=(q=[],config=settings,born=0)=>{queuePhantomEcho(q,[0,0,0],[1,1,0],[.3,.2,.45],born,config,.13,1.6);return q;};

test("delayed children spawn real bounded sibling DNA without changing the parent",()=>{
  const source=[0,0,0],direction=[1,1,0],color=[.3,.2,.45],q=[];
  const number=queuePhantomEcho(q,source,direction,color,0,settings,.14,1.6);
  assert.equal(number,3);assert.equal(q.length,3);
  assert.equal(q[0].delay,.25);assert.ok(q[1].delay>q[0].delay);
  assert.deepEqual(source,[0,0,0]);assert.deepEqual(direction,[1,1,0]);
  assert.ok(q.every(e=>e.origin.every(v=>Number.isFinite(v))));
  assert.notDeepEqual(q[0].color,q[1].color);
  assert.equal(spawn([], {mode:"off"}).length,0);
});

test("independent movement is real three-dimensional geometry, not screen space",()=>{
  for(const mode of ["spiral","fork","orbit"]){
    const q=spawn([],{...settings,mode});
    const a=echoPosition(q[0],.35),b=echoPosition(q[0],.9);
    assert.notDeepEqual(a,b);
    assert.ok(b.every(Number.isFinite));
    assert.ok(b.every(x=>x>=-.93&&x<=.93));
    const other=echoPosition(q[1],.9);
    assert.notDeepEqual(other,b);
  }
});

test("time delay prevents premature emission and expired children disappear",()=>{
  const q=spawn();
  const pre=advancePhantomEchoes(q,.1);
  assert.equal(pre.stamps.length,0);assert.equal(pre.queue.length,3);
  const active=advancePhantomEchoes(q,.6);
  assert.ok(active.stamps.length>0);
  assert.ok(active.stamps.every(s=>s.p.length===3&&s.color.length===3));
  const ended=advancePhantomEchoes(q,5);
  assert.equal(ended.queue.length,0);assert.equal(ended.stamps.length,0);
});

test("mobile caps apply to births, queued state and each fixed simulation step",()=>{
  const q=[];for(let i=0;i<40;i++)spawn(q);
  assert.equal(q.length,ECHO_CAP);
  const head=advancePhantomEchoes(q,1);
  assert.ok(head.stamps.length<=ECHO_STAMPS_PER_STEP);
  assert.ok(head.stamps.length<=6);
  const limited=advancePhantomEchoes(q,1,2);
  assert.ok(limited.stamps.length<=2);
  assert.equal(cloneEchoes(q).length,ECHO_CAP);
  const copy=cloneEchoes(q);copy[0].color[0]=1;
  assert.notEqual(copy[0].color[0],q[0].color[0]);
  assert.equal(echoSettings({copies:99}).copies,2);
});

test("CPU volume births are undoable and resume from checkpoint",()=>{
  const field=new PigmentField(1448);
  field.forgeMode="off";field.fiberEnabled=false;
  const before=field.snapshot();
  field.queueEcho([0,0,0],[1,0,0],[.5,.3,.8],{...settings,delay:.1},.17);
  assert.ok(field.echoes.length>0);
  const saved=field.snapshot();
  assert.equal(saved.echoes.length,3);
  field.step(.2,0.75);
  assert.ok(field.echoes.length>0);
  const changed=field.a.some((v,i)=>Math.abs(v-before.values[i])>1e-6);
  assert.equal(changed,true);
  field.restore(before);
  assert.equal(field.echoes.length,0);
  assert.deepEqual(Array.from(field.a),Array.from(before.values));
  field.restore(saved);
  assert.equal(field.echoes.length,3);
  field.reset(1448);
  assert.equal(field.echoes.length,0);
});

test("GPU transport uses existing RGB stamp uniforms and preserves births through snapshots",()=>{
  const gpu=read("src/gpu-transport.js"),cpu=read("src/field.js"),main=read("src/main.js"),ui=read("index.html");
  for(const src of [gpu,cpu]){
    assert.match(src,/queueEcho\(origin,direction,color,config,width,phase=0\)/);
    assert.match(src,/advancePhantomEchoes\(this\.echoes,this\.time\+dt/);
    assert.match(src,/cloneEchoes\(this\.echoes\)/);
    assert.match(src,/cloneEchoes\(s\.echoes\)/);
  }
  assert.match(gpu,/uStampPos\[16\],uStampColor\[16\]/);
  assert.match(gpu,/Math\.max\(0,16-this\.pending\.length\)/);
  assert.match(main,/if\(\(active\.afterlifeDeposits\+i\+1\)%4===0/);
  assert.match(main,/engine\.queueEcho\(/);
  for(const id of ["echoMode","echoCopies","echoDelay","echoDrift","echoDuration","echoStrength"])
    assert.ok(ui.includes('id="'+id+'"'),id);
});
