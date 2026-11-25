(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const wall = document.querySelector('#mosaic');
  const toggle = document.querySelector('#motion');
  const wallVideos = [...wall.querySelectorAll('video')];
  let wallPlaying = !reduced.matches;
  const visible = new Set();

  function attach(video) {
    if (video.hasAttribute('src')) return;
    video.src = video.dataset.src;
    if (video.dataset.cue) {
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = Math.min(video.duration, Number(video.dataset.cue));
      }, {once: true});
    }
  }

  function updateWall() {
    const action = wallPlaying ? 'Pause' : 'Play';
    toggle.querySelector('span').textContent = action;
    toggle.setAttribute('aria-label', action + ' task wall');
    toggle.querySelector('use').setAttribute('href', wallPlaying ? '#pause' : '#play');
    for (const video of wallVideos) {
      if (!wallPlaying || document.hidden || !visible.has(video)) {
        video.pause();
        continue;
      }
      attach(video);
      if (video.paused) video.play().catch(error => {
        if (error.name === 'NotAllowedError') {
          wallPlaying = false;
          updateWall();
        }
      });
    }
  }

  const scrubber = document.querySelector('.scrubber');
  const clock = document.querySelector('#replay-time');
  const tracks = [...scrubber.querySelectorAll('[data-frames]')].map(figure => ({
    figure,
    steps: figure.dataset.frames.split(' ').map(Number),
    image: figure.querySelector('img')
  }));
  const ticks = [...new Set(tracks.flatMap(track => track.steps))].sort((a,b) => a-b);
  const seconds = step => Number((step / 60).toFixed(2)) + ' s';
  function scrub() {
    const step = ticks[clock.valueAsNumber];
    document.querySelector('#frame-time').textContent = seconds(step);
    clock.setAttribute('aria-valuetext', seconds(step));
    for (const {figure, steps, image} of tracks) {
      const sample = steps.findLast(time => time <= step);
      const last = sample === steps[steps.length-1];
      const label = figure.querySelector('strong').textContent;
      const stamp = (last ? 'Final frame · ' : '') + seconds(sample);
      const name = figure.dataset.sequence + '-' + String(sample).padStart(5,'0') + '.jpg';
      image.src = 'media/evidence/sugar/' + name;
      image.alt = label + ', sugar box rollout at ' + seconds(sample);
      figure.querySelector('figcaption span').textContent = stamp;
    }
  }
  clock.max = ticks.length-1;
  clock.addEventListener('input', scrub);
  document.querySelector('.keyframes').open = false;
  scrubber.hidden = false;
  scrub();

  const replay = document.querySelector('#play-frames');
  let frameTimer = null;
  function stopReplay() {
    clearTimeout(frameTimer);
    frameTimer = null;
    replay.textContent = 'Play replay';
  }
  function advanceReplay() {
    const i = clock.valueAsNumber;
    if (i >= ticks.length-1 || document.hidden) {
      stopReplay();
      return;
    }
    frameTimer = setTimeout(() => {
      clock.value = i+1;
      scrub();
      advanceReplay();
    }, 1000 * (ticks[i+1]-ticks[i]) / 60);
  }
  replay.addEventListener('click', () => {
    if (frameTimer !== null) { stopReplay(); return; }
    if (clock.valueAsNumber === ticks.length-1) {
      clock.value = 0;
      scrub();
    }
    replay.textContent = 'Pause replay';
    advanceReplay();
  });
  clock.addEventListener('input', stopReplay);
  new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) stopReplay();
  }).observe(scrubber);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopReplay(); });

  const picker = document.querySelector('#example');
  function chooseExample() {
    stopReplay();
    for (const panel of document.querySelectorAll('[data-example]')) {
      panel.hidden = panel.dataset.example !== picker.value;
      if (panel.hidden) panel.querySelectorAll('video').forEach(video => video.pause());
    }
  }
  picker.parentElement.hidden = false;
  picker.addEventListener('change', chooseExample);
  chooseExample();

  const observer = new IntersectionObserver(entries => {
    for (const {target, isIntersecting} of entries) {
      if (isIntersecting) {
        visible.add(target);
        if (!wall.contains(target)) attach(target);
      } else {
        visible.delete(target);
        target.pause();
      }
    }
    updateWall();
  });
  // Cover images of videos further down the page load shortly before they scroll into view.
  const posters = new IntersectionObserver(entries => {
    for (const {target, isIntersecting} of entries) {
      if (!isIntersecting) continue;
      target.poster = target.dataset.poster;
      posters.unobserve(target);
    }
  }, {rootMargin: '900px 0px'});
  document.querySelectorAll('video[data-poster]').forEach(video => posters.observe(video));
  document.querySelectorAll('video[data-src]').forEach(video => {
    observer.observe(video);
    if (wall.contains(video)) {
      video.addEventListener('playing', () => video.classList.add('has-picture'));
      video.addEventListener('error', () => video.classList.remove('has-picture'));
    }
    video.addEventListener('error', () => {
      const note = document.createElement('span');
      note.className = 'media-error';
      note.textContent = 'Video unavailable.';
      video.insertAdjacentElement('afterend', note);
    }, {once: true});
    if (video.dataset.end) {
      const start = Number(video.dataset.cue);
      const end = Number(video.dataset.end);
      const inClip = () => video.currentTime >= start && video.currentTime < end;
      const returnToClip = () => {
        if (video.readyState && !inClip()) video.currentTime = start;
      };
      video.addEventListener('play', returnToClip);
      video.addEventListener('seeked', returnToClip);
      video.addEventListener('timeupdate', () => {
        if (!video.paused && !inClip() && !video.seeking) video.currentTime = start;
      });
      video.addEventListener('ended', () => { video.currentTime = start; });
    }
  });
  toggle.addEventListener('click', () => { wallPlaying = !wallPlaying; updateWall(); });
  document.querySelector('#again').addEventListener('click', () => {
    for (const video of wallVideos) {
      if (video.readyState) video.currentTime = Number(video.dataset.cue);
    }
    wallPlaying = true;
    updateWall();
  });
  reduced.addEventListener('change', () => {
    if (reduced.matches) wallPlaying = false;
    updateWall();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) visible.forEach(video => video.pause());
    updateWall();
  });
  document.querySelector('a[aria-disabled="true"]')?.addEventListener('click', event => event.preventDefault());
  updateWall();

  // The article ships its data tables so plots also work from a file URL.
  const ns = 'http://www.w3.org/2000/svg';
  function add(parent, tag, attrs, text) {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    parent.append(node);
    return node;
  }
  function chart(figure) {
    const plot = figure.querySelector('.plot');
    const kind = figure.dataset.kind;
    const rows = [...figure.querySelectorAll('tbody tr')].map(row =>
      [row.cells[0].textContent, ...[...row.cells].slice(1).map(cell => parseFloat(cell.textContent))]);
    function draw() {
      const w = plot.clientWidth;
      if (!w) return;
      const small = w < 500, h = small ? 235 : 250;
      const edgePlot = kind === 'edges';
      const top = 22, bottom = h - 32;
      const left = edgePlot ? (small ? 54 : 90) : (small ? 44 : 56);
      const right = edgePlot ? (small ? 53 : 90) : 30;
      const x = i => left + i * (w-left-right) / (rows.length-1);
      const max = edgePlot ? 150 : 80;
      const y = v => bottom - v * (bottom-top) / max;
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      svg.setAttribute('aria-hidden', 'true');
      for (const n of (edgePlot ? [0,50,100,150] : [0,20,40,60,80])) {
        add(svg, 'line', {x1: 27, x2: w-6, y1: y(n), y2: y(n), class:'gridline'});
        add(svg, 'text', {x:21, y:y(n)+4, 'text-anchor':'end'}, n);
      }
      rows.forEach(([label], i) => {
        const short = edgePlot && small ? ['Simulation','Real packing','LEGO'][i] : label;
        add(svg,'text',{x:x(i),y:h-10,'text-anchor':'middle'},short);
      });
      for (const [col, method] of [[1,'standard'],[2,'beta']]) {
        rows.forEach((row,i) => {
          const g=add(svg,'g',{class:'obs '+method});
          const val=row[col], cx=x(i)+(edgePlot ? (col===1 ? -12 : 12) : 0);
          if (i && kind === 'success') add(g,'path',{d:'M '+x(i-1)+' '+y(rows[i-1][col])+' L '+cx+' '+y(val),class:'series-line '+method});
          if (edgePlot) add(g,'line',{x1:cx,x2:cx,y1:y(0),y2:y(val),class:'stem'});
          if (col === 2) add(g,'circle',{cx,cy:y(val),r:5,class:'chart-marker'});
          else add(g,'rect',{x:cx-4.5,y:y(val)-4.5,width:9,height:9,class:'chart-marker'});
          const dy=edgePlot || val>row[3-col] ? -10 : 17;
          add(g,'text',{x:cx,y:y(val)+dy,'text-anchor':'middle',class:'measure'},edgePlot ? val : val.toFixed(1)+'%');
        });
      }
      plot.replaceChildren(svg);
    }
    new ResizeObserver(draw).observe(plot);
    draw();
  }
  document.querySelectorAll('figure.chart').forEach(chart);
})();
