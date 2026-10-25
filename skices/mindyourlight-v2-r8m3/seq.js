/*
 * Mind Your Light: scroll-driven frame sequence (the Kling product film, 200 WebP frames).
 * API mirrors the old canvas stage so the page code barely changes:
 *   MYLSeq.mount(el, { base, meta, lit, onColor }) -> { setProgress(p), ignite(), setPaused(b), isLit(), color() }
 * Unlit = frame 0 (lid on). ignite() plays the film up to the lit candle; scroll then drives the rest.
 */
(function () {
  'use strict';
  var LIT_T = 6.5;     // seconds: lit candle, evening — where the scroll story starts
  var BAND = 0.70;     // fraction of frame height that must stay visible (flowers on top, jar at the bottom)

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function mount(el, opts) {
    opts = opts || {};
    var meta = opts.meta, base = opts.base || 'seq/';
    var N = meta.n, fps = meta.fps, F0 = Math.round(LIT_T * fps);
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    el.appendChild(canvas);

    var cw = 0, ch = 0, dpr = 1, set = 'v720', fw = 720, fh = 1280;
    var imgs = new Array(N), loaded = new Array(N);
    var lit = opts.lit !== false, f = lit ? F0 : 0, ft = f, playing = null;
    var raf = 0, paused = false, last = 0, dirty = true, lastColor = '';

    function pickSet() {
      var need = ch * dpr;
      var s = (need > 1350 && meta.sizes && meta.sizes.v1080) ? 'v1080' : 'v720';
      if (s !== set || !imgs[0]) {
        set = s; fw = (meta.sizes && meta.sizes[s] ? meta.sizes[s][0] : 720); fh = (meta.sizes && meta.sizes[s] ? meta.sizes[s][1] : 1280);
        load();
      }
    }
    function src(i) { return base + set + '/' + (i < 10 ? '00' : i < 100 ? '0' : '') + i + '.webp'; }
    function load() {
      imgs = new Array(N); loaded = new Array(N);
      // coarse pass first (every 8th, plus the frames we need right now), then everything
      var order = [], seen = {};
      function add(i) { i = clamp(i | 0, 0, N - 1); if (!seen[i]) { seen[i] = 1; order.push(i); } }
      add(Math.round(f)); add(0); add(F0);
      for (var s = 8; s >= 1; s = s >> 1) for (var i = 0; i < N; i += s) add(i);
      var k = 0, inflight = 0;
      (function pump() {
        while (inflight < 6 && k < order.length) {
          (function (i) {
            var im = new Image(); im.decoding = 'async';
            im.onload = function () { loaded[i] = true; inflight--; if (Math.abs(i - f) < 12) dirty = true; pump(); };
            im.onerror = function () { inflight--; pump(); };
            im.src = src(i); imgs[i] = im; inflight++;
          })(order[k++]);
        }
      })();
    }
    function nearest(i) {
      if (loaded[i]) return i;
      for (var d = 1; d < N; d++) {
        if (i - d >= 0 && loaded[i - d]) return i - d;
        if (i + d < N && loaded[i + d]) return i + d;
      }
      return -1;
    }

    function resize() {
      var r = el.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cw = Math.max(1, r.width); ch = Math.max(1, r.height);
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      pickSet(); dirty = true; if (!raf) draw();
    }

    function color() { return meta.bg[clamp(Math.round(f), 0, N - 1)]; }

    function draw() {
      var i = nearest(clamp(Math.round(f), 0, N - 1));
      var bg = color();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (i >= 0) {
        var W = canvas.width, H = canvas.height;
        var s = Math.min(Math.max(W / fw, H / fh), H / (BAND * fh));
        var dw = fw * s, dh = fh * s, dx = (W - dw) / 2, dy = (H - dh) / 2;
        ctx.drawImage(imgs[i], dx, dy, dw, dh);
        // feather the photo into the fill colour where it doesn't reach the edges
        var fe = Math.min(70 * dpr, dw * 0.12);
        if (dx > 0.5) {
          var gl = ctx.createLinearGradient(dx, 0, dx + fe, 0); gl.addColorStop(0, bg); gl.addColorStop(1, hexA(bg, 0));
          ctx.fillStyle = gl; ctx.fillRect(dx - 1, 0, fe + 1, H);
          var gr = ctx.createLinearGradient(dx + dw, 0, dx + dw - fe, 0); gr.addColorStop(0, bg); gr.addColorStop(1, hexA(bg, 0));
          ctx.fillStyle = gr; ctx.fillRect(dx + dw - fe, 0, fe + 1, H);
        }
      }
      if (bg !== lastColor) { lastColor = bg; if (opts.onColor) opts.onColor(bg); }
      dirty = false;
    }
    function hexA(hex, a) {
      var n = parseInt(hex.slice(1), 16);
      return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
    }

    function frame(now) {
      raf = 0; if (paused) return;
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60; last = now;
      if (playing) {
        if (playing.t0 == null) playing.t0 = now;
        var u = clamp((now - playing.t0) / playing.dur, 0, 1);
        f = ft = playing.from + (playing.to - playing.from) * ease(u); dirty = true;
        if (u >= 1) { var pr = playing; playing = null; lit = true; pr.resolve(); }
      } else if (Math.abs(ft - f) > 0.01) {
        f += (ft - f) * Math.min(1, dt * 10); dirty = true;
      } else if (f !== ft) { f = ft; dirty = true; }
      if (dirty) draw();
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf && !paused) { last = 0; raf = requestAnimationFrame(frame); } }

    var ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', resize);
    resize(); start();

    return {
      setProgress: function (p) { if (!lit || playing) return; ft = F0 + clamp(+p || 0, 0, 1) * (N - 1 - F0); start(); },
      ignite: function () {
        if (lit) return Promise.resolve();
        return new Promise(function (res) {
          playing = { from: f, to: F0, dur: reduce ? 500 : 3400, t0: null, resolve: res };
          start();
          setTimeout(function () { if (playing) { f = ft = F0; playing = null; lit = true; dirty = true; draw(); res(); } }, (reduce ? 500 : 3400) + 1200);
        });
      },
      setPaused: function (b) { paused = !!b; if (!paused) start(); },
      isLit: function () { return lit; },
      color: color
    };
  }

  window.MYLSeq = { mount: mount };
})();
