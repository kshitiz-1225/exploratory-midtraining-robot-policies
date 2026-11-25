(() => {
  'use strict';
  const ns = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const svg = $('network');
  const object = $('object');
  const armNames = {beta: 'β-DATA', Standard: 'Standard demonstrations'};
  const membership = {beta_only: 'β-DATA only', standard_only: 'Standard only', shared: 'Both datasets'};
  const defaults = {sim_packing: 'cracker box', real_packing: 'whiteboard eraser', real_lego: 'blue brick'};
  let domain = 'sim_packing', arm = 'all', side = 'end';
  let activeEdge, activeState, pinned = false;
  let visible = [];
  function tag(name, attrs = {}) {
    const el = document.createElementNS(ns, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }
  function locationName(s) {
    if (['small','medium','large'].includes(s)) return s + (domain === 'sim_packing' ? ' tray' : ' box');
    return s;
  }
  const title = s => s.charAt(0).toUpperCase() + s.slice(1);
  function supported(e, collection) {
    return collection === 'all' || e.membership === 'shared' || e.membership === (collection === 'beta' ? 'beta_only' : 'standard_only');
  }
  function frameFor(edge) {
    const collection = arm === 'all' ? (edge.frames.beta ? 'beta' : 'Standard') : arm;
    return [collection, edge.frames[collection]];
  }
  // Fetch the frames of the drawn edges at low priority so hover shows them at once.
  // Start after the selected frame has arrived so the preloads do not compete with it.
  const warmed = new Set();
  let explorerNear = false;
  function warm() {
    if (!explorerNear) return;
    const witness = $('witness');
    if (!witness.hidden && !witness.complete) {
      witness.addEventListener('load', warm, {once: true});
      witness.addEventListener('error', warm, {once: true});
      return;
    }
    let budget = 40;
    for (const e of visible) {
      const frames = frameFor(e)[1];
      if (!frames) continue;
      for (const name of [frames.start, frames.end]) {
        if (!name || warmed.has(name) || budget <= 0) continue;
        warmed.add(name);
        budget--;
        const img = new Image();
        img.fetchPriority = 'low';
        img.decoding = 'async';
        img.src = 'media/frames/' + name;
      }
    }
  }
  function showFrame() {
    let [collection, frames] = frameFor(activeEdge);
    const selection = activeState ? title(locationName(activeState)) : title(locationName(activeEdge.start)) + ' → ' + title(locationName(activeEdge.end));
    $('selected-object').textContent = title(activeEdge.object);
    $('transition').textContent = selection;
    let note = membership[activeEdge.membership];
    let sampleSide = side;
    let substitute = false;
    if (!frames) {
      // A state illustration is explicitly attributed to its own transition.
      const state = activeEdge[side];
      const neighbor = visible.find(e => e !== activeEdge && e.object === activeEdge.object && (e.start === state || e.end === state) && frameFor(e)[1] && !frameFor(e)[1].boundary && !frameFor(e)[1].interior);
      if (neighbor) {
        [collection, frames] = frameFor(neighbor);
        sampleSide = neighbor.start === state ? 'start' : 'end';
        substitute = true;
      }
    }
    const frame = $('witness');
    frame.hidden = !frames;
    $('unavailable').hidden = !!frames;
    if (frames) {
      if (frames.boundary && frames.boundary !== 'both') sampleSide = frames.boundary;
      if (frame.getAttribute('src') !== 'media/frames/' + frames[sampleSide]) frame.src = 'media/frames/' + frames[sampleSide];
      frame.alt = title(activeEdge.object) + ' · ' + armNames[collection] + (frames.interior ? ' camera view during the transfer' : ' · ' + locationName(activeEdge[substitute ? side : sampleSide]));
      frame.classList.toggle('rgb', frames.swap);
      frame.classList.toggle('strip-camera', !!frames.interior);
      frame.classList.toggle('box-camera', domain === 'real_packing');
      if (substitute) note = 'State example from another annotated transition. Edge footage unavailable.';
      else if (frames.interior) note = 'β-DATA · camera frame during the annotated transfer';
      else note += ' · ' + armNames[collection] + (frames.boundary ? ' boundary frame' : ' frame');
    } else frame.removeAttribute('src');
    $('frame-description').textContent = note;
    document.querySelectorAll('[data-side]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.side === sampleSide));
      b.disabled = !frames || frames.interior || Boolean(frames.boundary && frames.boundary !== 'both' && b.dataset.side !== frames.boundary);
    });
  }
  function choose(edge, state, target) {
    activeEdge = edge;
    activeState = state;
    side = state === edge.start ? 'start' : 'end';
    svg.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
    target?.classList.add('active');
    showFrame();
  }
  function bind(el, action) {
    el.setAttribute('tabindex','0');
    el.setAttribute('role','button');
    el.addEventListener('pointerenter', e => { if (!pinned && e.pointerType === 'mouse') action(); });
    el.addEventListener('focus', () => { pinned = false; action(); });
    el.addEventListener('click', () => { action(); pinned = true; });
    el.addEventListener('keydown', e => {
      if (e.key === 'Escape') pinned = false;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); action(); pinned = true; }
    });
  }
  // Solve the full object's springs once per redraw, including filtered edges.
  // A deterministic seed and bounds preserve landmarks when the collection changes.
  function layout(names, edges) {
    const nodes = new Map(names.map((name, i) => {
      const angle = Math.PI * 2 * i / names.length - Math.PI / 2 + .38;
      return [name,{x:260 + 155*Math.cos(angle), y:160 + 96*Math.sin(angle), vx:0, vy:0}];
    }));
    for (let step = 0; step < 110; step++) {
      for (const [a,p] of nodes) {
        p.vx += (260-p.x)*.004;
        p.vy += (160-p.y)*.006;
        for (const [b,q] of nodes) {
          if (a === b) continue;
          const dx = p.x-q.x, dy = p.y-q.y, distance = Math.max(1,Math.hypot(dx,dy));
          const spring = edges.some(e => (e.start===a && e.end===b) || (e.start===b && e.end===a)) ? .017*(180-distance) : 0;
          const force = 9500/(distance*distance) + spring;
          p.vx += force*dx/distance;
          p.vy += force*dy/distance;
        }
      }
      for (const p of nodes.values()) {
        p.x = Math.max(62, Math.min(458,p.x + (p.vx *= .66)));
        p.y = Math.max(52, Math.min(268,p.y + (p.vy *= .66)));
      }
    }
    return nodes;
  }
  function render() {
    pinned = false;
    const overview = object.value === '*';
    const edges = graphs[domain].filter(e => overview || e.object === object.value);
    visible = edges.filter(e => supported(e,arm));
    svg.replaceChildren();
    const defs = tag('defs');
    for (const [m,c] of Object.entries({beta_only:'#95e2c5',standard_only:'#efb778',shared:'#c1c8d5'})) {
      const marker=tag('marker',{id:'arrow-'+m, viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:9,markerHeight:9,orient:'auto',markerUnits:'userSpaceOnUse'});
      marker.append(tag('path',{d:'M0 0 10 5 0 10Z',fill:c}));defs.append(marker);
    }
    svg.append(defs);
    const objects = [...new Set(edges.map(e=>e.object))];
    const columns = overview ? (matchMedia('(max-width:650px)').matches ? 2 : 3) : 1;
    const cellHeight = overview ? 386 : 320;
    svg.setAttribute('viewBox','0 0 '+(520*columns)+' '+(cellHeight*Math.ceil(objects.length/columns)));
    svg.parentElement.classList.toggle('overview',overview);
    objects.forEach((obj,index) => {
    const edges = graphs[domain].filter(e=>e.object===obj);
    const component = visible.filter(e=>e.object===obj);
    const group = tag('g',{transform:'translate('+(520*(index%columns))+' '+(cellHeight*Math.floor(index/columns))+')'});
    svg.append(group);
    if (overview) {
      const label=tag('text',{x:260,y:358,'text-anchor':'middle',class:'object-label',role:'button',tabindex:0,'aria-label':'Inspect '+obj});
      label.textContent=title(obj);group.append(label);
      const inspect=()=>{object.value=obj;render();object.focus();};
      label.addEventListener('click',inspect);
      label.addEventListener('keydown',e=>{if (e.key==='Enter' || e.key===' ') {e.preventDefault();inspect();}});
    }
    const names = [...new Set(edges.flatMap(e=>[e.start,e.end]))].sort();
    const positions = layout(names, edges);
    for (const e of component) {
      const p=positions.get(e.start), q=positions.get(e.end);
      const dx=q.x-p.x, dy=q.y-p.y, dist=Math.hypot(dx,dy);
      const curve=edges.some(o=>o.start===e.end && o.end===e.start)?36:12;
      const cx=(p.x+q.x)/2-dy/dist*curve, cy=(p.y+q.y)/2+dx/dist*curve;
      const a=Math.atan2(cy-p.y,cx-p.x), b=Math.atan2(cy-q.y,cx-q.x);
      const path='M '+(p.x+39*Math.cos(a))+' '+(p.y+39*Math.sin(a))+' Q '+cx+' '+cy+' '+(q.x+42*Math.cos(b))+' '+(q.y+42*Math.sin(b));
      const g=tag('g',{class:'edge '+e.membership,'aria-label':title(obj)+', '+locationName(e.start)+' to '+locationName(e.end)+', '+membership[e.membership]});
      g.append(tag('path',{d:path,class:'hit'}),tag('path',{d:path,class:'line','marker-end':'url(#arrow-'+e.membership+')'}));
      bind(g,()=>choose(e,null,g));group.append(g);
    }
    for (const name of names) {
      const incident=component.filter(e=>e.start===name || e.end===name);
      if (!incident.length) continue;
      const full=edges.filter(e=>e.start===name || e.end===name);
      const m=full.every(e=>e.membership==='beta_only')?'beta_only':full.every(e=>e.membership==='standard_only')?'standard_only':'shared';
      const p=positions.get(name), g=tag('g',{class:'node '+m,transform:'translate('+p.x+' '+p.y+')','aria-label':title(obj)+' at '+locationName(name)+', '+membership[m]});
      g.append(tag('circle',{r:38}));
      const lines=title(locationName(name)).split(' ');
      lines.forEach((line,i)=>{const text=tag('text',{y:5+(i-(lines.length-1)/2)*16});text.textContent=line;g.append(text);});
      const candidate=incident.find(e=>frameFor(e)[1] && !frameFor(e)[1].boundary && !frameFor(e)[1].interior) || incident[0];
      bind(g,()=>choose(candidate,name,g));group.append(g);
    }
    });
    if (!visible.length) {
      const msg=tag('text',{x:260,y:160,'text-anchor':'middle',fill:'#aeaeac'});msg.textContent='No annotated transitions in this dataset.';svg.append(msg);
      $('witness').hidden=true;$('unavailable').hidden=false;$('selected-object').textContent=title(object.value);
      $('transition').textContent='No transition';$('frame-description').textContent='Choose another dataset or object.';
      document.querySelectorAll('[data-side]').forEach(b=>b.disabled=true);return;
    }
    const first=visible.find(e=>e.start==='large' && e.end==='medium' && frameFor(e)[1]) || visible.find(e=>e.frames.beta && e.frames.Standard) || visible[0];
    choose(first,null,svg.querySelectorAll('.edge')[visible.indexOf(first)]);
    warm();
  }
  function changeDomain() {
    const names=[...new Set(graphs[domain].map(e=>e.object))].sort();
    object.replaceChildren(new Option('All objects','*'),...names.map(n=>new Option(title(n),n)));object.value=defaults[domain];
    render();
  }
  for (const attr of ['domain','arm']) document.querySelectorAll('[data-'+attr+']').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('[data-'+attr+']').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    if (attr==='domain') {domain=button.dataset.domain;changeDomain();}
    else {arm=button.dataset.arm;render();}
  }));
  object.addEventListener('change',render);
  document.querySelectorAll('[data-side]').forEach(b=>b.addEventListener('click',()=>{
    pinned=true;side=b.dataset.side;activeState=null;showFrame();
  }));
  matchMedia('(max-width:650px)').addEventListener('change',()=>{if(object.value==='*')render();});
  $('witness').addEventListener('error',()=>{
    $('witness').hidden=true;
    $('unavailable').hidden=false;
  });
  changeDomain();
  const near = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    near.disconnect();
    explorerNear = true;
    warm();
  }, {rootMargin: '100% 0px'});
  near.observe(svg);
})();
