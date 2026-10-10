/* Original procedural botanical drawing for Flowers V2. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const garden = document.getElementById('garden');
  const hearts = document.getElementById('hearts');
  const paper = document.getElementById('paper');
  const letter = document.getElementById('letter');
  const review = window.parent !== window && document.documentElement?.hasAttribute('data-review') ? window.FLOWERS_REVIEW : null;
  const animationMode = review?.animationMode==='canvas'&&window.FlowersCanvas ? 'canvas' : ['managed','paced'].includes(review?.animationMode) ? review.animationMode : 'baseline';
  const managed = animationMode !== 'baseline';
  const canvasMode = animationMode === 'canvas';
  let canvasRenderer = null;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = {
    get matches() {return Boolean(review?.still)||motionQuery.matches;},
    addEventListener: (type,listener)=>motionQuery.addEventListener(type,listener)
  };
  let seed = window.FlowersNotes?.getState().seed || 'a-little-garden';
  let random;
  let composition;
  let width = 1600;
  const height = 440;
  let group;
  let ordinal = 0;
  let phase = 0;
  let animations = [];
  let paused = false;
  let elapsed = 0;
  let started = null;
  let heartTimer = 0;
  let heartIndex = 0;
  let occupied = [];
  let gardenSchedule = [];
  let effectEvents = [];
  let eventCursor = 0;
  let effectTimer = 0;
  const liveEffects = new Map();
  let createdEffects = 0;
  let peakEffects = 0;
  let scheduledEffects = 0;
  let completedEffects = 0;
  let drawDuration = 0;
  let reuseCount = 0;
  let geometryBuilds = 0;
  let builtSeed = null;
  let builtWidth = null;
  const heartTimes = [18000, 62000, 118000, 201000, 306000, 435000, 570000];

  function seeded(text) {
    let h = 2166136261;
    for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return () => {
      h += 0x6D2B79F5;
      let t = Math.imul(h ^ h >>> 15, 1 | h);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const range = (a, b) => a + random() * (b - a);
  const n = v => Math.round(v * 100) / 100;
  const p = a => `${n(a[0])},${n(a[1])}`;
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function node(tag, attrs, parent = group) {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    parent.append(el);
    return el;
  }
  function smooth(points, closed = false) {
    let d = `M${p(points[0])}`;
    const count = points.length;
    for (let i = 0; i < (closed ? count : count - 1); i++) {
      const a = points[closed ? (i + count - 1) % count : Math.max(0, i - 1)];
      const b = points[i];
      const c = points[(i + 1) % count];
      const e = points[closed ? (i + 2) % count : Math.min(count - 1, i + 2)];
      const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
      const c2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
      d += `C${p(c1)} ${p(c2)} ${p(c)}`;
    }
    return d + (closed ? 'Z' : '');
  }
  function plant(start, opacity = 1) {
    phase = start;
    ordinal = 0;
    group = node('g', {opacity:n(opacity)}, garden);
  }
  function stroke(d, weight = .7, opacity = 1, fill = false) {
    if (fill) node('path', {d, class:'ink-fill'});
    const el = node('path', {d, class:'ink-stroke', 'stroke-width':n(weight), opacity:n(opacity), pathLength:'1'});
    el.dataset.start = n(phase + Math.min(ordinal * .025, 1.7));
    el.dataset.duration = n(range(.45, 1.3));
    ordinal++;
    return el;
  }
  function line(points, weight = .7, opacity = 1) { return stroke(smooth(points), weight, opacity); }
  function dot(x, y, radius, ink = true) {
    const el = node('circle', {cx:n(x),cy:n(y),r:n(radius),fill:ink?'var(--ink)':'var(--paper)',stroke:'var(--ink)','stroke-width':.5});
    el.dataset.dot = 'true';
    el.dataset.start = n(phase + Math.min(ordinal++ * .025, 1.7));
  }
  function curvePoint(a,b,c,t) {
    const s=1-t;
    return [s*s*a[0]+2*s*t*b[0]+t*t*c[0],s*s*a[1]+2*s*t*b[1]+t*t*c[1]];
  }

  function leaf(x, y, length, breadth, angle, ribs = true) {
    const rot = point => [x + point[0]*Math.cos(angle)-point[1]*Math.sin(angle), y + point[0]*Math.sin(angle)+point[1]*Math.cos(angle)];
    const bend = range(-.2,.2)*length;
    const edgeA = [], edgeB = [];
    for (let i=0;i<=10;i++) {
      const t=i/10, sw=Math.pow(Math.sin(t*Math.PI),.9)*breadth;
      const mid=bend*t*t;
      edgeA.push(rot([mid+sw*(.92+range(-.09,.09)), -length*t]));
      edgeB.push(rot([mid-sw*(.8+range(-.08,.08)), -length*t]));
    }
    stroke(smooth([...edgeA,...edgeB.reverse()],true),range(.65,1.15),1,true);
    const a=rot([0,0]), b=rot([bend*.2,-length*.5]), c=rot([bend,-length]);
    stroke(`M${p(a)}Q${p(b)} ${p(c)}`, .8);
    if (ribs) {
      const ribCount=Math.floor(length/6);
      for(let i=1;i<ribCount;i++) {
        const t=i/ribCount, mid=curvePoint(a,b,c,t);
        for(const side of [-1,1]) {
          const e=t+.09, sw=Math.sin(e*Math.PI)*breadth;
          const end=rot([bend*e*e+side*sw*.92,-length*e]);
          const control=lerp(mid,end,.5);control[1]+=length*.026;
          stroke(`M${p(mid)}Q${p(control)} ${p(end)}`,range(.32,.55),.8);
        }
      }
    }
  }

  function grass(x, length, bend, weight=.65) {
    const base=[x,height+range(0,18)],tip=[x+bend,height-length];
    const mid=[x+bend*.13,height-length*.5];
    stroke(`M${p(base)}Q${p(mid)} ${p(tip)}`,weight,range(.55,.95));
    if(length>90) stroke(`M${n(x+range(1,3))},${height+5}Q${n(mid[0]+3)},${n(mid[1])} ${p(tip)}`,weight*.7,.75);
  }

  function fern(x,y,length,angle) {
    const rot=(xx,yy)=>[x+xx*Math.cos(angle)-yy*Math.sin(angle),y+xx*Math.sin(angle)+yy*Math.cos(angle)];
    const bow=range(-16,18);
    const pts=[];
    for(let t=0;t<=1.01;t+=.1)pts.push(rot(bow*t*t,-t*length));
    line(pts,1.05);
    for(let i=2;i<15;i++) {
      const t=i/16, center=rot(bow*t*t,-length*t);
      const size=length*.25*Math.sin(Math.PI*Math.pow(t,.75))*(1-t*.28);
      for(const side of [-1,1]) {
        const a=angle+side*range(.8,1.17);
        leaf(center[0],center[1],size,Math.max(2,size*.1),a,false);
      }
    }
  }

  function seedHead(x,y,len,angle) {
    const base=[x,y],top=[x+Math.sin(angle)*len,y-Math.cos(angle)*len];
    const mid=lerp(base,top,.5);mid[0]+=12;
    stroke(`M${p(base)}Q${p(mid)} ${p(top)}`, .8);
    for(let i=0;i<9;i++) {
      const t=.5+i*.05, pt=curvePoint(base,mid,top,t);
      for(const side of [-1,1]) {
        const end=[pt[0]+side*(10-i*.7),pt[1]-range(8,17)];
        line([pt,end],.5);
        leaf(end[0],end[1],range(4,8),1.8,side*.45,false);
      }
    }
  }

  function flower(x,y,r,rotation=0,aspect=1) {
    const petals=Math.floor(range(5,7));
    const phaseAngle=range(0,Math.PI*2);
    const transform=(rr,a)=>[x+Math.cos(a)*rr,y+Math.sin(a)*rr*aspect];
    for(let i=0;i<petals;i++) {
      const a=phaseAngle+i*Math.PI*2/petals+range(-.13,.13)+rotation;
      const len=r*range(.78,1.14),half=range(.48,.68);
      const points=[transform(4,a-half),transform(len*.56,a-half*.88),transform(len*.95,a-half*.69),transform(len*1.03,a-half*.22),transform(len*.99,a+.1),transform(len*.98,a+half*.55),transform(len*.8,a+half*.86),transform(len*.45,a+half*.68),transform(3,a+half)];
      stroke(smooth(points,true),range(.82,1.3),1,true);
      for(let j=0;j<range(3,7);j++) {
        const aa=a+range(-.35,.35),rr=range(.32,.76)*len;
        const from=transform(range(5,12),aa);
        const to=transform(rr,aa+range(-.035,.035));
        const mid=lerp(from,to,.45);mid[0]+=range(-2,2);
        line([from,mid,to],range(.27,.43),range(.4,.7));
      }
      if(random()<.55) {
        const pts=points.slice(2,6).map(q=>[q[0]+range(-1.2,1.2),q[1]+range(-1.2,1.2)]);
        line(pts,.36,.55);
      }
    }
    for(let i=0;i<20;i++) {
      const a=range(0,Math.PI*2), rr=range(4,11),q=transform(rr,a);
      line([[x,y],q],.5,.8);dot(q[0],q[1],range(.8,1.7),random()<.55);
    }
    for(let i=0;i<12;i++) {const q=transform(range(0,4),range(0,Math.PI*2));dot(q[0],q[1],range(.6,1.2));}
  }

  function daisy(x,y,r,kind) {
    const count=kind==='cosmos'?8:range(13,18)|0;
    const offset=range(0,6.28),aspect=range(.64,.9);
    const transform=(rr,a)=>[x+Math.cos(a)*rr,y+Math.sin(a)*rr*aspect];
    for(let i=0;i<count;i++) {
      const a=offset+i*Math.PI*2/count;
      const len=r*range(.78,1.08),spread=(kind==='cosmos'?.34:.15)*range(.85,1.15);
      const pts=[transform(7,a-spread),transform(len*.65,a-spread),transform(len*.98,a-spread*.8),transform(len,a-spread*.2),transform(len*.96,a+spread*.2),transform(len,a+spread*.65),transform(len*.7,a+spread),transform(7,a+spread)];
      stroke(smooth(pts,true),range(.75,1.15),1,true);
      for(let j=-1;j<=1;j++)line([transform(10,a+j*spread*.35),transform(len*.4,a+j*spread*.5),transform(len*.8,a+j*spread*.6)],.35,.65);
    }
    const core=kind==='cosmos'?7:9;
    const points=Array.from({length:16},(_,i)=>transform(core*range(.9,1.1),i*Math.PI/8));
    stroke(smooth(points,true),.8,1,true);
    for(let i=0;i<35;i++){const a=range(0,Math.PI*2),q=transform(Math.sqrt(random())*core,a);dot(q[0],q[1],range(.4,1.1));}
  }

  function umbel(x,y,r) {
    const nodes=[];
    for(let i=0;i<14;i++) {
      const a=Math.PI+(i/13)*Math.PI;
      const q=[x+Math.cos(a)*r*range(.75,1.05),y+Math.sin(a)*r*.48];
      const base=[x,y+r*.57];
      line([base,lerp(base,q,.65),q],range(.4,.7));nodes.push(q);
    }
    for(const q of nodes)for(let j=0;j<5;j++) {
      const a=j*Math.PI*2/5,tip=[q[0]+Math.cos(a)*range(3,6),q[1]+Math.sin(a)*range(3,5)];
      line([q,tip],.4);dot(tip[0],tip[1],range(.8,1.5),false);
    }
  }

  function bloomPlant(x,y,r,lean=0,kind='poppy') {
    const base=[x-lean,height+12],top=[x,y],mid=[x+lean*.6,y+(height-y)*.62];
    stroke(`M${p(base)}Q${p(mid)} ${p(top)}`,range(1.1,1.6));
    stroke(`M${n(base[0]+2)},${base[1]}Q${n(mid[0]+2)},${mid[1]} ${n(top[0]+1)},${top[1]}`, .4,.75);
    for(let i=0;i<2;i++) {
      const t=.24+i*.24,pt=curvePoint(base,mid,top,t);
      leaf(pt[0],pt[1],range(48,88),range(9,16),(i%2===0?-1:1)*range(.65,1.3));
    }
    if(r>38 && kind==='poppy') {
      const anchor=curvePoint(base,mid,top,.49);
      const bx=x+range(32,58)*(lean<0?-1:1),by=y+range(15,48);
      stroke(`M${p(anchor)}Q${n(bx-8)},${n(by-22)} ${n(bx)},${n(by)}`, .85);
      const bud=[];
      for(let i=0;i<12;i++){const a=i*Math.PI*2/12;bud.push([bx+Math.cos(a)*6,by+Math.sin(a)*9]);}
      stroke(smooth(bud,true),.85,1,true);
      for(let i=-2;i<=2;i++)line([[bx+i*1.7,by+7],[bx+i*2,by],[bx+i,by-8]],.45);
    }
    phase+=.8;ordinal=0;
    if(kind==='daisy'||kind==='cosmos')daisy(x,y,r,kind);
    else if(kind==='umbel')umbel(x,y,r);
    else flower(x,y,r,range(-.6,.6),range(.65,1.02));
  }

  function vine(x,side,length=250) {
    const pts=[];
    for(let i=0;i<=20;i++) {
      const t=i/20;
      pts.push([x+side*(t*95+Math.sin(t*8)*28),height-t*length]);
    }
    line(pts,1.1);
    for(let i=3;i<19;i+=3) {
      const pt=pts[i];
      leaf(pt[0],pt[1],range(24,44),range(7,12),side*(i%2?1.1:-.6));
      if(i===12) {
        const curl=[];
        for(let j=0;j<35;j++){const t=j/34, a=t*Math.PI*3;curl.push([pt[0]+side*(20+t*6)+Math.cos(a)*(1-t)*14,pt[1]-18+Math.sin(a)*(1-t)*14]);}
        line([pt,...curl],.6);
      }
    }
  }

  function build() {
    cancelAnimations();
    fitLetter();
    const bounds=garden.getBoundingClientRect();
    const nextWidth=Math.max(440,Math.min(5000,height*bounds.width/Math.max(1,bounds.height)));
    if(managed&&builtSeed===seed&&builtWidth===nextWidth&&gardenSchedule.length) {
      reuseCount++;
      prepareCanvas();
      resetHearts();
      animateGarden();
      fitLetter();
      return;
    }
    random=seeded(seed);
    const profiles=window.FlowersCompositions || [];
    const match=/^flowers-v2:(\d{2}):/.exec(seed);
    const index=match?Math.max(0,Math.min(23,Number(match[1])-1)):Math.floor(seeded(seed+'-composition')()*24);
    composition=profiles[index] || {id:1,name:'A little garden',grass:1,ferns:1,leaves:1,seedheads:1,clusters:[{x:.15,spread:.23,height:250},{x:.78,spread:.23,height:260}],vines:[{x:.09,side:1},{x:.9,side:-1}],blooms:[{x:.12,y:150,r:56,lean:30},{x:.29,y:210,r:49,lean:-30},{x:.55,y:260,r:50,lean:35},{x:.75,y:130,r:58,lean:-40},{x:.9,y:210,r:50,lean:30}]};
    garden.dataset.composition=String(composition.id);
    garden.dataset.name=composition.name;
    width=nextWidth;
    const densityWidth=Math.min(width,2100);
    garden.setAttribute('viewBox',`0 0 ${n(width)} ${height}`);
    garden.setAttribute('preserveAspectRatio','none');
    garden.replaceChildren();
    const clusters=composition.clusters;
    const envelope=x=>Math.max(65,...clusters.map(c=>c.height*Math.exp(-Math.pow((x/width-c.x)/c.spread,2))));
    const count=Math.round(densityWidth/12*composition.grass);
    // Thin background stems give the dense base an open upper edge.
    for(let i=0;i<count;i++) {
      const x=range(-30,width+30);
      plant(range(.1,3.3),range(.5,.8));
      grass(x,envelope(x)*range(.45,1.05),range(-60,60),range(.35,.7));
    }
    for(let i=0;i<Math.round(densityWidth/110*composition.ferns);i++) {
      plant(range(1.2,3.5));
      const x=range(0,width);
      fern(x,height+range(0,35),envelope(x)*range(.6,.93),range(-.65,.65));
    }
    // Broader, veined leaves create quieter shapes between the fine strokes.
    for(let i=0;i<Math.round(densityWidth/42*composition.leaves);i++) {
      const x=range(0,width),len=envelope(x)*range(.4,.8);
      plant(range(1.5,4.4));
      leaf(x,height+range(0,35),len,range(11,23),range(-1.1,1.1));
    }
    for(const v of composition.vines){plant(range(1.7,2.7));vine(width*v.x,v.side,v.length);}
    const blooms=width>1050?composition.blooms:(composition.mobileBlooms||composition.blooms);
    for(const {x,y,r,lean,kind} of blooms) {
      plant(range(2.3,5.2));
      bloomPlant(x*width+range(-7,7),y+range(-9,9),r,lean,kind);
    }
    // Small foreground blades connect the plants along the lower edge.
    for(let i=0;i<Math.round(densityWidth/24);i++) {
      plant(range(4.3,6.5),range(.7,1));
      const x=range(-15,width+15);
      grass(x,range(23,87),range(-34,34),range(.55,.9));
    }
    for(let i=0;i<Math.round(densityWidth/135*composition.seedheads);i++) {
      const x=range(0,width);
      plant(range(3,5));seedHead(x,height+8,envelope(x)*range(.7,1.2),range(-.27,.27));
    }
    builtSeed=seed;builtWidth=width;geometryBuilds++;
    gardenSchedule=createGardenSchedule();
    prepareCanvas();
    resetHearts();
    animateGarden();
    fitLetter();
  }

  function cancelAnimations() {
    canvasRenderer?.pause();
    for(const animation of animations)animation.cancel();
    animations=[];
    for(const animation of liveEffects.keys())animation.cancel();
    liveEffects.clear();
    effectEvents=[];eventCursor=0;
    clearTimeout(effectTimer);
    clearTimeout(heartTimer);
    createdEffects=0;peakEffects=0;scheduledEffects=0;completedEffects=0;
  }

  function createGardenSchedule() {
    const records=Array.from(garden.querySelectorAll('[data-start]'),(el,index)=>({
      el,index,start:Number(el.dataset.start)*1000,
      duration:el.dataset.dot?230:Number(el.dataset.duration)*1000,
      dot:Boolean(el.dataset.dot),opacity:el.getAttribute('opacity')||'1'
    }));
    if(animationMode==='paced') {
      // Keep every stroke. Bound overlap with a deterministic completion heap.
      const ends=[];
      const push=value=>{
        let i=ends.length;ends.push(value);
        while(i>0){const parent=(i-1)>>1;if(ends[parent]<=value)break;ends[i]=ends[parent];i=parent;}ends[i]=value;
      };
      const pop=()=>{
        const first=ends[0],last=ends.pop();
        if(ends.length){let i=0;while(i*2+1<ends.length){let child=i*2+1;if(child+1<ends.length&&ends[child+1]<ends[child])child++;if(ends[child]>=last)break;ends[i]=ends[child];i=child;}ends[i]=last;}
        return first;
      };
      let prior=-Infinity;
      for(const record of [...records].sort((a,b)=>a.start-b.start||a.index-b.index)) {
        let start=Math.max(record.start,prior+2);
        while(ends.length&&ends[0]<=start)pop();
        if(ends.length>=320){start=Math.max(start,ends[0]);while(ends.length&&ends[0]<=start)pop();}
        record.start=start;prior=start;push(start+record.duration);
      }
    }
    drawDuration=records.reduce((end,record)=>Math.max(end,record.start+record.duration),0);
    return records;
  }

  function setRecordStyle(record,finished) {
    if(record.dot)record.el.style.opacity=finished?record.opacity:'0';
    else{record.el.style.strokeDasharray='1';record.el.style.strokeDashoffset=finished?'0':'1';}
  }

  function addEffects(records) {
    const events=[];
    for(const source of records) {
      const record={...source,end:source.start+source.duration,animation:null,done:false};
      setRecordStyle(record,false);
      events.push({at:record.start,ending:false,record},{at:record.end,ending:true,record});
    }
    scheduledEffects+=records.length;
    effectEvents=effectEvents.slice(eventCursor).concat(events).sort((a,b)=>a.at-b.at||Number(b.ending)-Number(a.ending));
    eventCursor=0;
    runDueEffects();
  }

  function completeEffect(record) {
    if(record.done)return;
    record.done=true;
    setRecordStyle(record,true);
    if(record.animation){liveEffects.delete(record.animation);record.animation.cancel();record.animation=null;}
    completedEffects++;
  }

  function runDueEffects() {
    clearTimeout(effectTimer);
    const time=activeTime();
    // Tolerate sub-nanosecond clock error after a replay or a pause.
    while(eventCursor<effectEvents.length&&effectEvents[eventCursor].at<=time+0.000001) {
      const event=effectEvents[eventCursor++],record=event.record;
      if(event.ending||record.end<=time+0.000001){completeEffect(record);continue;}
      const frames=record.dot?[{opacity:0},{opacity:record.opacity}]:[{strokeDashoffset:1},{strokeDashoffset:0}];
      const animation=record.el.animate(frames,{duration:record.duration,fill:'both',easing:'ease-in-out'});
      record.animation=animation;liveEffects.set(animation,record);
      animation.currentTime=Math.max(0,activeTime()-record.start);
      if(paused||document.hidden)animation.pause();
      createdEffects++;peakEffects=Math.max(peakEffects,liveEffects.size);
    }
    if(eventCursor===effectEvents.length){effectEvents=[];eventCursor=0;}
    if(!paused&&!document.hidden&&!reduced.matches&&eventCursor<effectEvents.length) {
      effectTimer=setTimeout(runDueEffects,Math.max(0,effectEvents[eventCursor].at-activeTime()));
    }
  }

  function currentEffects() {return managed?liveEffects.keys():animations;}

  function prepareCanvas() {
    if(!canvasMode)return;
    if(!canvasRenderer)canvasRenderer=window.FlowersCanvas.create({garden,getTime:activeTime,pixelRatio:review?.pixelRatio});
    canvasRenderer.prepare({width,height,schedule:gardenSchedule});
  }

  function animateGarden() {
    if(canvasMode) {
      canvasRenderer.replay(reduced.matches);
      if(!reduced.matches&&!paused&&!document.hidden)canvasRenderer.resume();
      scheduleHeart();
      return;
    }
    if(managed) {
      if(reduced.matches){for(const record of gardenSchedule)setRecordStyle(record,true);return;}
      addEffects(gardenSchedule);
      scheduleHeart();
      return;
    }
    if(reduced.matches) return;
    for(const el of garden.querySelectorAll('[data-start]')) {
      const delay=Number(el.dataset.start)*1000;
      const frames=el.dataset.dot ? [{opacity:0},{opacity:el.getAttribute('opacity')||1}] : [{strokeDashoffset:1},{strokeDashoffset:0}];
      if(!el.dataset.dot)el.style.strokeDasharray='1';
      const a=el.animate(frames,{duration:el.dataset.dot?230:Number(el.dataset.duration)*1000,delay,fill:'both',easing:'ease-in-out'});
      animations.push(a);
      createdEffects++;scheduledEffects++;peakEffects=Math.max(peakEffects,animations.length);
    }
    if(paused||document.hidden)for(const a of animations)a.pause();
    scheduleHeart();
  }
  function resetHearts() {
    hearts.replaceChildren();heartIndex=0;occupied=[];elapsed=0;started=paused||document.hidden?null:performance.now();
    if(reduced.matches){drawHeart();drawHeart();}
  }
  function activeTime() {return elapsed + (started===null?0:performance.now()-started);}
  function scheduleHeart() {
    clearTimeout(heartTimer);
    if(paused||document.hidden||reduced.matches||heartIndex>=heartTimes.length)return;
    heartTimer=setTimeout(()=>{drawHeart();scheduleHeart();},Math.max(0,heartTimes[heartIndex]-activeTime()));
  }
  function heartPosition(index,size,placed) {
    const rect=paper.getBoundingClientRect(), lr=letter.getBoundingClientRect();
    const w=rect.width,h=Math.min(rect.height,window.innerHeight);
    const mobile=w<=700;
    const candidates=mobile?[[.16,.15],[.86,.20],[.80,.60],[.14,.56],[.49,.115]]:[[.23,.30],[.77,.40],[.61,.135],[.12,.51],[.85,.19],[.35,.13],[.88,.55]];
    const excluded={left:lr.left-rect.left-20,right:lr.right-rect.left+20,top:lr.top-rect.top+Number.parseFloat(getComputedStyle(letter).paddingTop)-22,bottom:lr.bottom-rect.top+24};
    const bottom=garden.getBoundingClientRect().top-rect.top-22;
    const rng=seeded(seed+'-position-'+index),r=size*1.3;
    const options=[candidates[index],...candidates.slice(index+1),...candidates.slice(0,index),[.15,.12],[.85,.12],[.50,.12]].filter(Boolean);
    for(const [rx,ry] of options) {
      const x=w*rx+(rng()-.5)*12,y=Math.max(87+r,h*ry+(rng()-.5)*12);
      if(x-r<16||x+r>w-16||y+r>bottom)continue;
      if(x+r>excluded.left&&x-r<excluded.right&&y+r>excluded.top&&y-r<excluded.bottom)continue;
      if(placed.some(q=>Math.hypot(x-q.x,y-q.y)<r+q.size*1.3+22))continue;
      return {x,y};
    }
    return null;
  }
  function reflowHearts() {
    const placed=[];
    for(const heart of occupied) {
      const position=heartPosition(heart.index,heart.size,placed);
      heart.el.style.display=position?'':'none';
      if(!position)continue;
      Object.assign(heart,position);
      heart.el.setAttribute('transform',`translate(${n(heart.x)} ${n(heart.y)}) rotate(${heart.rotation}) scale(${n(heart.size/20)})`);
      placed.push(heart);
    }
  }
  function drawHeart(at=activeTime()) {
    const mobile=paper.getBoundingClientRect().width<=700;
    if(heartIndex>=(mobile?5:7)){heartIndex=7;return;}
    const rng=seeded(seed+'-heart-'+heartIndex);
    const size=mobile?11+rng()*4:12+rng()*9;
    const position=heartPosition(heartIndex,size,occupied.filter(q=>q.el.style.display!=='none'));
    if(!position){heartIndex++;return;}
    const {x,y}=position,rotation=n((rng()-.5)*30);
    const g=node('g',{transform:`translate(${n(x)} ${n(y)}) rotate(${rotation}) scale(${n(size/20)})`},hearts);
    occupied.push({x,y,size,rotation,el:g,index:heartIndex});
    const d='M0 15C-4 10-19 0-17-8C-15-19-3-17 0-8C5-20 17-17 18-9C20-1 8 10 0 15';
    const outline=node('path',{d,fill:'none',stroke:'var(--ink)','stroke-width':1.05,'stroke-linecap':'round',pathLength:1},g);
    const clipId=`heart-ink-${heartIndex}`;
    const clip=node('clipPath',{id:clipId},g);
    node('path',{d},clip);
    const scribble=[];
    for(let i=0;i<38;i++) {
      const yy=-19+i*.94;
      scribble.push([i%2?-23:23,yy]);scribble.push([i%2?23:-23,yy+(rng()-.5)*1.2]);
    }
    const hatch=node('path',{d:smooth(scribble),fill:'none',stroke:'var(--ink)','stroke-width':1.2,'stroke-linecap':'round','clip-path':`url(#${clipId})`,pathLength:1},g);
    if(!reduced.matches) {
      const marks=[[outline,0,1100],[hatch,900,1400]];
      if(managed)addEffects(marks.map(([el,delay,duration])=>({el,start:at+delay,duration,dot:false})));
      else for(const [el,delay,duration] of marks) {
        el.style.strokeDasharray='1';
        const a=el.animate([{strokeDashoffset:1},{strokeDashoffset:0}],{duration,delay,fill:'both',easing:'ease-in-out'});
        animations.push(a);
        createdEffects++;scheduledEffects++;peakEffects=Math.max(peakEffects,animations.length);
      }
    }
    heartIndex++;
  }
  function setPaused(next) {
    elapsed=activeTime();paused=next;started=paused||document.hidden?null:performance.now();
    for(const a of currentEffects()) {
      if(a.playState==='finished')continue;
      if(paused||document.hidden)a.pause();else a.play();
    }
    if(managed)runDueEffects();
    if(canvasRenderer){if(paused||document.hidden)canvasRenderer.pause();else canvasRenderer.resume();}
    scheduleHeart();
  }
  function fitLetter() {
    document.body.classList.remove('long-note');
    const contentBottom=letter.getBoundingClientRect().bottom;
    const gardenTop=garden.getBoundingClientRect().top;
    document.body.classList.toggle('long-note',contentBottom+30>gardenTop);
    reflowHearts();
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){elapsed=activeTime();started=null;for(const a of currentEffects())if(a.playState==='running')a.pause();clearTimeout(heartTimer);}
    else{started=paused?null:performance.now();if(!paused)for(const a of currentEffects())if(a.playState==='paused')a.play();scheduleHeart();}
    if(managed)runDueEffects();
    if(canvasRenderer){if(document.hidden||paused)canvasRenderer.pause();else canvasRenderer.resume();}
  });
  reduced.addEventListener('change',()=>build());
  let resizeTimer;
  let lastWidth=window.innerWidth;
  let lastHeight=window.innerHeight;
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(Math.abs(lastWidth-innerWidth)>30||Math.abs(lastHeight-innerHeight)>30){lastWidth=innerWidth;lastHeight=innerHeight;build();}else fitLetter();},180);});
  window.addEventListener('flowers:notes',event=>{
    const next=event.detail.seed;
    if(next&&next!==seed){seed=next;build();}else requestAnimationFrame(fitLetter);
  });
  window.FlowersGarden={
    replay:()=>{paused=false;build();},pause:()=>setPaused(true),resume:()=>setPaused(false),
    finish:()=>{
      canvasRenderer?.finish();
      if(managed){clearTimeout(effectTimer);for(let i=eventCursor;i<effectEvents.length;i++)completeEffect(effectEvents[i].record);effectEvents=[];eventCursor=0;}
      else for(const a of animations)a.finish();
    },
    getState:()=>({seed,composition:composition.id,name:composition.name,width,paths:garden.querySelectorAll('path').length,hearts:occupied.length,paused,reducedMotion:reduced.matches,activeTime:activeTime(),animationMode,createdEffects,liveEffects:managed?liveEffects.size:animations.length,peakEffects,scheduledEffects,completedEffects,drawDuration,reuseCount,geometryBuilds,canvas:canvasRenderer?.getState()||null})
  };
  if(review)window.FlowersGarden.reviewAt=milliseconds=>{
    const time=Math.max(0,Math.min(600000,Number(milliseconds)||0));
    paused=true;build();elapsed=time;started=null;
    canvasRenderer?.seek(time);
    if(managed)runDueEffects();
    else for(const a of animations){a.currentTime=time;a.pause();}
    while(!reduced.matches&&heartIndex<heartTimes.length&&heartTimes[heartIndex]<=time) {
      const start=heartTimes[heartIndex],first=animations.length;
      drawHeart(start);
      for(let i=first;i<animations.length;i++){animations[i].currentTime=time-start;animations[i].pause();}
    }
  };
  build();
  document.fonts.ready.then(fitLetter);
})();
