/* overlays-fx.js: effect kit for the overlays-v5 starters (video-pc-edit,
   video-iphone-edit, video-iphone-pc-edit). Copied into a project's assets/ and
   loaded in <head> after gsap.min.js. Spec and usage rules: README.md next to this file.

   Every helper adds tweens to the composition's global paused timeline `tl`
   (declared in index.html) at call time, so call them from the inline script
   after `const tl = ...`. Everything is seek-safe: no Math.random, no time-based
   callbacks; text that changes over time is a pure function of a proxy tween.

   Order in the inline script:
     1. FX.screens = [...]           how track pixels map to the 1920x1080 canvas
     2. ZOOMS.forEach(z => FX.zoom(z, {TW}))   (PC only)
     3. fxCallout / fxTitle / fxCmd / fxCheck / fxSection / fxCount / fxMark / fxDrift
   Callouts read the zoom state, so they must come after the zooms. */
(function(){
  const FX = window.FX = {screens: [], zooms: []};
  const $ = s => typeof s === 'string' ? document.querySelector(s) : s;
  const num = (el, k, d) => { const v = parseFloat(el.dataset[k]); return isNaN(v) ? d : v; };
  const win = el => [num(el, 'start', 0), num(el, 'duration', 0)];
  const mk = (tag, cls, html) => { const e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; };
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const SVGNS = 'http://www.w3.org/2000/svg';
  const CHECK = '<svg viewBox="0 0 24 24"><polyline points="5,12.5 10,17 19,7"/></svg>';
  FX.warn = msg => console.warn('[fx] ' + msg);

  /* ---------------------------------------------------------------- geometry
     FX.screens: one entry per footage layout, in time order; `until` = timeline
     second the layout ends (omit on the last one).
       PC (full frame):  {kind:'pc', TW:3840, TH:2160}
       iPhone (phone-layout.json, canvas px): {kind:'phone', rect:[724,43,465.5,997], TW:1180, TH:2556}
       iPhone then PC:   [{kind:'phone', ..., until:SWITCH}, {kind:'pc', ...}]            */
  FX.toCanvas = function(x, y, t){
    const sc = FX.screens.find(s => s.until == null || t < s.until) || FX.screens[0];
    if(!sc){ FX.warn('FX.screens is empty; callout uses raw canvas px'); return [x, y]; }
    if(sc.kind === 'phone'){ const [l, tp, w, h] = sc.rect; return [l + x * w / sc.TW, tp + y * h / sc.TH]; }
    let cx = x * 1920 / sc.TW, cy = y * 1080 / sc.TH;
    const z = FX.zooms.find(z => t >= z.in && t < z.out);
    if(z){
      if(t < z.on || t >= z.off) FX.warn('element at ' + t + 's starts while the zoom at ' + z.in + 's is moving');
      cx = cx * z.s + z.x; cy = cy * z.s + z.y;
    }
    return [cx, cy];
  };

  /* ---------------------------------------------------------------- zoom
     Same math as the starter's ZOOMS loop: scale = min(1920/w, 1080/h, 3) in canvas px,
     centred on the box, clamped to the frame. Adds the focus vignette (#zoom-vig). */
  FX.zoomParams = function(z, TW){
    const [bx, by, bw, bh] = z.box, k = 1920 / (TW || 3840);
    const s = Math.min(1920 / (bw * k), 1080 / (bh * k), 3);
    const cx = (bx + bw / 2) * k, cy = (by + bh / 2) * k;
    return {s, x: Math.min(0, Math.max(1920 - 1920 * s, 960 - cx * s)), y: Math.min(0, Math.max(1080 - 1080 * s, 540 - cy * s))};
  };
  FX.zoom = function(z, o){
    o = o || {};
    const sel = o.sel || '#screen', p = FX.zoomParams(z, o.TW), off = z.start + .7 + z.hold;
    tl.to(sel, {scale: p.s, x: p.x, y: p.y, duration: .7, ease: 'power2.inOut'}, z.start);
    tl.to(sel, {scale: 1, x: 0, y: 0, duration: .6, ease: 'power2.inOut'}, off);
    let vig = document.getElementById('zoom-vig');
    if(!vig && o.vignette !== false){
      vig = mk('div'); vig.id = 'zoom-vig';
      const scr = $(sel); scr.parentNode.insertBefore(vig, scr.nextSibling);
    }
    if(vig && o.vignette !== false){
      tl.to(vig, {opacity: 1, duration: .7, ease: 'power2.inOut'}, z.start);
      tl.to(vig, {opacity: 0, duration: .6, ease: 'power2.inOut'}, off);
    }
    FX.zooms.push({in: z.start, on: z.start + .7, off, out: off + .6, s: p.s, x: p.x, y: p.y});
  };

  /* ---------------------------------------------------------------- 1. callout
     Pin + one ring pulse at start (and a second at +1.1 s), line draws in 0.4 s,
     note glides in from the line's direction, all fades out over the last 0.3 s.
     Length 2.5-6 s. Inside a zoom: start after the zoom-in ends, end before the
     zoom-out starts (FX.toCanvas warns otherwise). */
  window.fxCallout = function(id){
    const el = $(id), [s, d] = win(el);
    const side = el.dataset.side || 'right';
    const horiz = side === 'right' || side === 'left';
    const len = num(el, 'len', 150), rise = num(el, 'rise', horiz ? -60 : 0);
    const [px, py] = FX.toCanvas(num(el, 'x', 0), num(el, 'y', 0), s);
    el.style.left = px + 'px'; el.style.top = py + 'px';

    const sx = side === 'left' ? -1 : 1, sy = side === 'up' ? -1 : 1;
    let pts, pos, tf, dx = 0, dy = 0;
    if(horiz){
      const e = Math.min(Math.abs(rise), len * .6);
      pts = [[0, 0], [sx * e, rise], [sx * len, rise]];
      pos = side === 'right' ? {left: (len + 12) + 'px', top: rise + 'px'} : {right: (len + 12) + 'px', top: rise + 'px'};
      tf = 'translateY(-50%)'; dx = sx;
    } else {
      pts = [[0, 0], [0, sy * len]];
      pos = side === 'up' ? {left: '0px', bottom: (len + 12) + 'px'} : {left: '0px', top: (len + 12) + 'px'};
      tf = 'translateX(-50%)'; dy = sy;
    }
    const L = pts.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
    const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('class', 'co-line');
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', 'M' + pts.map(p => p.join(' ')).join(' L'));
    path.setAttribute('stroke-dasharray', L.toFixed(1)); svg.appendChild(path);
    const label = el.querySelector('.co-label');
    const wrap = mk('div', 'co-pos'); Object.assign(wrap.style, pos, {transform: tf});
    label.parentNode.insertBefore(wrap, label); wrap.appendChild(label);
    const ring = mk('div', 'co-ring'), pin = mk('div', 'co-pin');
    el.insertBefore(svg, el.firstChild); el.appendChild(ring); el.appendChild(pin);

    tl.fromTo(pin, {scale: 0}, {scale: 1, duration: .35, ease: 'back.out(2.2)'}, s)
      .fromTo(ring, {scale: .3, opacity: .95}, {scale: 1.9, opacity: 0, duration: .8, ease: 'power2.out'}, s)
      .fromTo(ring, {scale: .3, opacity: .7}, {scale: 1.9, opacity: 0, duration: .8, ease: 'power2.out', immediateRender: false}, s + 1.1)
      .fromTo(path, {strokeDashoffset: L}, {strokeDashoffset: 0, duration: .4, ease: 'power2.out'}, s + .15)
      .fromTo(label, {opacity: 0, x: dx * 22, y: dy * 22, filter: 'blur(8px)'},
                     {opacity: 1, x: 0, y: 0, filter: 'blur(0px)', duration: .45, ease: 'power3.out'}, s + .42);
    tl.to(el, {opacity: 0, duration: .3, ease: 'power2.in'}, s + d - .3);
    tl.set(el, {opacity: 0}, s + d);
  };

  /* ---------------------------------------------------------------- 2. on-screen statement
     Scrim (blur + dim) in 0.45 s, kicker, words rise one by one, the .mark bar sweeps
     under the key word, sub line, then everything leaves over the last 0.4 s. 3-6 s. */
  function splitWords(line){
    const out = [];
    Array.from(line.childNodes).forEach(n => {
      if(n.nodeType === 3){
        n.textContent.split(/(\s+)/).forEach(part => {
          if(!part) return;
          if(/^\s+$/.test(part)){ line.insertBefore(document.createTextNode(part), n); return; }
          const w = mk('span', 'w'); w.textContent = part; line.insertBefore(w, n); out.push(w);
        });
        line.removeChild(n);
      } else if(n.nodeType === 1 && n.tagName !== 'BR'){ n.classList.add('w'); out.push(n); }
    });
    return out;
  }
  window.fxTitle = function(id){
    const el = $(id), [s, d] = win(el);
    /* The scrim blurs whatever is below it on purpose. Tell hyperframes check so, but only for
       the badges, chips, checklists and callouts on screen during this statement: the others
       keep their occlusion and contrast checks. */
    document.querySelectorAll('.badge, .fx-cmd, .fx-check, .fx-callout').forEach(e => {
      const [es, ed] = win(e);
      if(es < s + d && es + ed > s) e.setAttribute('data-layout-allow-occlusion', '');
    });
    el.setAttribute('data-layout-allow-overlap', '');   /* its words sit over the blurred text below */
    const scrim = mk('div', 'ft-scrim'); el.insertBefore(scrim, el.firstChild);
    const kicker = el.querySelector('.ft-kicker'), line = el.querySelector('.ft-line'), sub = el.querySelector('.ft-sub');
    const words = line ? splitWords(line) : [];
    const bars = Array.from(el.querySelectorAll('.mark')).map(m => { const b = mk('i', 'mk-bar'); m.insertBefore(b, m.firstChild); return b; });
    const content = [kicker, line, sub].filter(Boolean);
    tl.fromTo(scrim, {opacity: 0}, {opacity: 1, duration: .45, ease: 'power2.out'}, s);
    if(kicker) tl.fromTo(kicker, {opacity: 0, y: 16}, {opacity: 1, y: 0, duration: .5, ease: 'power2.out'}, s + .15);
    if(words.length) tl.fromTo(words, {opacity: 0, y: 46, filter: 'blur(14px)'},
                               {opacity: 1, y: 0, filter: 'blur(0px)', duration: .6, ease: 'expo.out', stagger: .07}, s + .25);
    if(bars.length) tl.fromTo(bars, {scaleX: 0}, {scaleX: 1, duration: .5, ease: 'power2.inOut'}, s + .45 + .07 * words.length);
    if(sub) tl.fromTo(sub, {opacity: 0, y: 18}, {opacity: 1, y: 0, duration: .6, ease: 'power2.out'}, s + .75);
    tl.to(content, {opacity: 0, y: -12, filter: 'blur(8px)', duration: .35, ease: 'power2.in'}, s + d - .4);
    tl.to(scrim, {opacity: 0, duration: .4, ease: 'power2.in'}, s + d - .4);
    tl.set(el, {opacity: 0}, s + d);
  };

  /* ---------------------------------------------------------------- 3. command chip
     Chip drops in, the text types itself (about 20 characters per second, max 1.4 s),
     the caret blinks every 0.53 s, optional green check at data-ok. Width is reserved
     up front (ghost text), so the chip never resizes while typing. */
  window.fxCmd = function(id){
    const el = $(id), [s, d] = win(el);
    const text = el.textContent.trim(), kind = el.dataset.kind || 'Type', okAt = num(el, 'ok', NaN);
    el.innerHTML = '<span class="cm-kind">' + esc(kind) + '</span><span class="cm-prompt">&rsaquo;</span>' +
      '<span class="cm-text"><span class="cm-ghost">' + esc(text) + '&nbsp;</span><span class="cm-typed"></span></span>' +
      (isNaN(okAt) ? '' : '<span class="cm-ok">' + CHECK + '</span>');
    if(!el.dataset.pos || el.dataset.pos === 'top') gsap.set(el, {xPercent: -50});
    const typed = el.querySelector('.cm-typed');
    const t0 = .35, td = Math.min(1.4, .05 * text.length + .2);
    const render = T => {
      const n = Math.max(0, Math.min(text.length, Math.round((T - t0) / td * text.length)));
      const caret = (T < t0 + td || Math.floor(T / .53) % 2 === 0) ? 1 : 0;
      typed.innerHTML = esc(text.slice(0, n)) + '<span class="cm-caret" style="opacity:' + caret + '"></span>';
    };
    render(0);
    const proxy = {p: 0};
    tl.fromTo(proxy, {p: 0}, {p: d, duration: d, ease: 'none', onUpdate(){ render(proxy.p); }}, s);
    tl.fromTo(el, {opacity: 0, y: -18, filter: 'blur(8px)'}, {opacity: 1, y: 0, filter: 'blur(0px)', duration: .45, ease: 'power3.out'}, s);
    if(!isNaN(okAt)){
      tl.fromTo(el.querySelector('.cm-ok'), {opacity: 0, scale: .4}, {opacity: 1, scale: 1, duration: .4, ease: 'back.out(2)'}, okAt);
      tl.to(el, {borderColor: 'rgba(74,222,128,.75)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.16), 0 18px 50px rgba(0,0,0,.5), 0 0 34px rgba(74,222,128,.32)', duration: .4, ease: 'power2.out'}, okAt);
    }
    tl.to(el, {opacity: 0, y: -12, duration: .3, ease: 'power2.in'}, s + d - .3);
    tl.set(el, {opacity: 0}, s + d);
  };

  /* ---------------------------------------------------------------- 4. checklist panel
     Panel slides in with every item pending (dim); each item ticks at its data-at:
     circle fills green, check draws, label turns white, progress bar and the n/N count
     advance. Panel leaves over the last 0.4 s. */
  window.fxCheck = function(id){
    const el = $(id), [s, d] = win(el);
    const items = Array.from(el.querySelectorAll('.ck-item'));
    const title = el.querySelector('.ck-title');
    const head = mk('div', 'ck-head'); title.parentNode.insertBefore(head, title); head.appendChild(title);
    const count = mk('span', 'ck-count'); head.appendChild(count);
    const bar = mk('div', 'ck-bar', '<i></i>'); el.appendChild(bar);
    const ats = items.map(it => num(it, 'at', s));
    items.forEach(it => it.insertBefore(mk('i', 'ck-box', CHECK), it.firstChild));
    gsap.set(el, {yPercent: -50});
    const side = el.dataset.pos === 'left' ? -1 : 1;
    tl.fromTo(el, {opacity: 0, x: side * 60, filter: 'blur(10px)'}, {opacity: 1, x: 0, filter: 'blur(0px)', duration: .6, ease: 'power3.out'}, s);
    tl.fromTo(items, {opacity: 0, y: 12}, {opacity: 1, y: 0, duration: .45, ease: 'power2.out', stagger: .08}, s + .25);
    const order = ats.slice().sort((a, b) => a - b);
    items.forEach((it, i) => {
      const at = ats[i], box = it.querySelector('.ck-box'), pl = box.querySelector('polyline');
      pl.setAttribute('stroke-dasharray', '22'); pl.setAttribute('stroke-dashoffset', '22');
      tl.to(box, {backgroundColor: '#4ADE80', borderColor: '#4ADE80', boxShadow: '0 0 18px rgba(74,222,128,.7)', duration: .3, ease: 'power2.out'}, at)
        .fromTo(box, {scale: 1}, {scale: 1.18, duration: .15, ease: 'power2.out', yoyo: true, repeat: 1}, at)
        .to(pl, {strokeDashoffset: 0, duration: .35, ease: 'power2.out'}, at + .08)
        .to(it.querySelector('b'), {color: '#FFFFFF', duration: .3, ease: 'power2.out'}, at)
        .to(bar.firstChild, {scaleX: (order.indexOf(at) + 1) / items.length, duration: .4, ease: 'power2.out'}, at);
    });
    const proxy = {p: 0}, render = T => { count.textContent = ats.filter(a => a <= T).length + '/' + items.length; };
    render(s);
    tl.fromTo(proxy, {p: s}, {p: s + d, duration: d, ease: 'none', onUpdate(){ render(proxy.p); }}, s);
    tl.to(el, {opacity: 0, x: side * 40, duration: .4, ease: 'power2.in'}, s + d - .4);
    tl.set(el, {opacity: 0}, s + d);
  };

  /* ---------------------------------------------------------------- 5. section card
     Replaces the starter's hand-written section block. Not after a card: a light beam
     sweeps left to right and wipes the card in over the footage (0.8 s). After a card:
     the card is already opaque, content only. Then kicker, headline, sub, rail, the
     screenshot (.st-media) swings in, the numeral (.st-num) drifts, the image slowly
     pushes in. Ends with dissolveOut() onto the footage, or handoffOut when {toCard}. */
  window.fxSection = function(id, start, dur, o){
    o = o || {};
    const card = $(id);
    if(!o.afterCard){
      const beam = mk('div', 'st-beam'); beam.setAttribute('data-layout-allow-overflow', ''); card.appendChild(beam);
      tl.fromTo(id + ' .inner', {clipPath: 'inset(0% 100% 0% 0%)'}, {clipPath: 'inset(0% 0% 0% 0%)', duration: .8, ease: 'power3.inOut'}, start);
      tl.fromTo(beam, {x: -150, opacity: 1}, {x: 1920, duration: .8, ease: 'power3.inOut'}, start);
      tl.set(beam, {opacity: 0}, start + .8);
      tl.set(id + ' .inner', {clipPath: 'none'}, start + .81);
    }
    const q = sel => card.querySelector(sel);
    tl.from(id + ' .st-kicker', {opacity: 0, y: 18, duration: .6, ease: 'power2.out'}, start + .3)
      .from(id + ' .st-headline', {opacity: 0, y: 50, filter: 'blur(18px)', duration: 1.2, ease: 'expo.out'}, start + .45)
      .from(id + ' .st-sub', {opacity: 0, y: 20, duration: .8, ease: 'power2.out'}, start + 1.2);
    if(q('.rail')){
      tl.from(id + ' .rail .node', {opacity: 0, y: 14, duration: .4, stagger: .06, ease: 'power2.out'}, start + 1.3)
        .fromTo(id + ' .rail .node.on .dot', {boxShadow: '0 0 0px rgba(55,189,248,0)'},
                {boxShadow: '0 0 30px rgba(55,189,248,.9)', duration: .7, repeat: 1, yoyo: true, ease: 'sine.inOut'}, start + 2.2);
    }
    if(q('.st-num')) tl.fromTo(id + ' .st-num', {opacity: 0, x: -40}, {opacity: 1, x: 0, duration: 1.4, ease: 'power3.out'}, start + .25);
    if(q('.st-media')){
      q('.st-media').setAttribute('data-layout-allow-overflow', '');   /* the image pushes in from 1.12x inside its frame */
      tl.fromTo(id + ' .st-media', {opacity: 0, x: 120, transformPerspective: 1800, rotationX: 2, rotationY: -32, filter: 'blur(12px)'},
                {opacity: 1, x: 0, transformPerspective: 1800, rotationX: 2, rotationY: -11, filter: 'blur(0px)', duration: 1.1, ease: 'expo.out'}, start + .6);
      tl.fromTo(id + ' .st-media img', {scale: 1.12}, {scale: 1.0, duration: dur, ease: 'none'}, start);
    }
    if(q('.bg-shot')) fxDrift(id + ' .bg-shot', start, dur);
    if(o.toCard) handoffOut(id, '.section-stage', start, dur); else dissolveOut(id, start, dur);
  };

  /* ---------------------------------------------------------------- small helpers */
  /* count-up: fxCount('#idea-1 .n', 66.9, 10, {from:0, dur:1.1, decimals:0, prefix:'', suffix:''}) */
  window.fxCount = function(sel, at, to, o){
    o = o || {};
    const el = $(sel), from = o.from || 0, dec = o.decimals || 0, proxy = {v: from};
    const fmt = v => (o.prefix || '') + v.toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, o.sep == null ? '' : o.sep) + (o.suffix || '');
    el.textContent = fmt(from);
    tl.fromTo(proxy, {v: from}, {v: to, duration: o.dur || 1.1, ease: 'power3.out', onUpdate(){ el.textContent = fmt(proxy.v); }}, at);
  };
  /* marker sweep under any element that has class "mark" (adds the bar): fxMark('#idea-2 .mark', 93.6) */
  window.fxMark = function(sel, at, dur){
    document.querySelectorAll(sel).forEach(m => {
      let b = m.querySelector('.mk-bar');
      if(!b){ b = mk('i', 'mk-bar'); m.insertBefore(b, m.firstChild); }
      tl.fromTo(b, {scaleX: 0}, {scaleX: 1, duration: dur || .5, ease: 'power2.inOut'}, at);
    });
  };
  /* slow push-in on a card image or backdrop: fxDrift('#hook-intro .bg-shot', 0, 13) */
  window.fxDrift = function(sel, start, dur, from, to){
    tl.fromTo(sel, {scale: from || 1.08}, {scale: to || 1.0, duration: dur, ease: 'none'}, start);
  };
})();
