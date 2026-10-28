/* Būvelementi — "No baļķa līdz jūsu izmēram" motion stage.
   One canvas 2D, no libraries. API:
   BEStage.mount(el) → { setProgress(p), play(sec), setPaused(b), destroy() }
   Timeline (p): 0 Mežs 0–.14 · 1 Baļķis .14–.32 · 2 Zāģēšana .32–.50 ·
                 3 Žāvēšana .50–.68 · 4 Ēvelēšana .68–.86 · 5 Jums .86–1 */
(function () {
  'use strict';

  var CUTS = [0, 0.14, 0.32, 0.50, 0.68, 0.86, 1];
  var F = 0.03; // half-width of the cross-fade around each cut
  var NAMES = ['Mežs', 'Baļķis', 'Zāģēšana', 'Žāvēšana', 'Ēvelēšana', 'Jums'];
  var PHOTOS = [
    ['img/balki.jpg', 'Baldone · baļķu laukums'],
    ['img/balku-gali.jpg', 'Zāģbaļķi pirms zāģēšanas'],
    ['img/brusas.jpg', 'Brusas no savas zāģētavas'],
    ['img/krautne.jpg', 'Krautnes ražotnes laukumā'],
    ['img/apdare.jpg', 'Ēvelēti apdares dēļi'],
    ['img/iekravejs.jpg', 'Iekraušana Baldonē']
  ];
  var MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
  var BG = '#15130F', LINE = '232,211,176', RUST = '#B4490B', MOSS = '128,140,98';
  var BOX = 460; // design box in units, fitted into the drawing area

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function sm(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function eo(x) { x = clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); }
  function eio(x) { x = clamp(x, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function L(a) { return 'rgba(' + LINE + ',' + a + ')'; }
  function mix(c1, c2, t) {
    var a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
    var r = Math.round(lerp(a >> 16, b >> 16, t)), g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t)), bl = Math.round(lerp(a & 255, b & 255, t));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  function arcPts(cx, cy, rx, ry, a0, a1, n) {
    var o = [];
    for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return o;
  }
  function poly(g, pts) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  }
  function polyLen(pts) {
    var s = 0;
    for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    return s;
  }

  // ---------- planed-board profiles (cross-sections, 120 × 20 units) ----------
  var PROFILES = (function () {
    var kl = [[-56, -10], [56, -10], [60, -6], [60, -3], [68, -3], [68, 3], [60, 3], [60, 10], [-60, 10], [-60, 3.5], [-52, 3.5], [-52, -3.5], [-60, -3.5], [-60, -6]];
    var eu = [[-53, -10], [53, -10], [60, -3.5], [60, -3], [68, -3], [68, 3], [60, 3], [60, 10], [34, 10], [34, 7.5], [26, 7.5], [26, 10], [-26, 10], [-26, 7.5], [-34, 7.5], [-34, 10], [-60, 10], [-60, 3.5], [-52, 3.5], [-52, -3.5], [-60, -3.5]];
    var ps = arcPts(-52, -2, 8, 8, Math.PI, Math.PI * 1.5, 8).concat([[52, -10], [52, 0], [60, 0], [60, 10], [-50, 10], [-50, 0], [-60, 0]]);
    var bh = [[-60, 10], [-60, 5], [-52, 5], [-52, -1], [-60, -1]];
    for (var i = 0; i <= 28; i++) { var x = -60 + 120 * i / 28; bh.push([x, -2 - 10 * Math.sqrt(Math.max(0, 1 - Math.pow(x / 61, 2)))]); }
    bh = bh.concat([[60, -1], [68, -1], [68, 5], [60, 5], [60, 10]]);
    var te = [];
    te = te.concat(arcPts(-57, -8.5, 3, 3, Math.PI, Math.PI * 1.5, 4));
    for (var j = 0; j < 11; j++) { var gx = -50 + j * 10; te.push([gx - 2.2, -11.5], [gx - 1.4, -10.4], [gx + 1.4, -10.4], [gx + 2.2, -11.5]); }
    te = te.concat(arcPts(57, -8.5, 3, 3, -Math.PI / 2, 0, 4), arcPts(57, 8.5, 3, 3, 0, Math.PI / 2, 4), arcPts(-57, 8.5, 3, 3, Math.PI / 2, Math.PI, 4));
    return [
      { n: 'klasiskais', p: kl }, { n: 'eiro', p: eu }, { n: 'pusspunde', p: ps },
      { n: 'blokhaus', p: bh }, { n: 'terases, rievotais', p: te }
    ];
  })();
  PROFILES.forEach(function (o) { o.len = polyLen(o.p); });

  // ---------- log end (end grain) ----------
  var R = 150, RB = 163, PITH = [7, -5], NR = 30;
  function barkR(a) { return RB * (1 + 0.012 * Math.sin(5 * a) + 0.008 * Math.sin(11 * a + 1) + 0.005 * Math.sin(23 * a + 2)); }
  function drawDisc(g, rf, sx, blur) {
    g.save();
    g.scale(sx, 1);
    // bark with a soft drop shadow
    g.save();
    g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = blur; g.shadowOffsetY = blur * 0.35;
    g.beginPath();
    for (var i = 0; i <= 140; i++) { var a = i / 140 * Math.PI * 2, r = barkR(a); if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(r, 0); }
    g.closePath(); g.fillStyle = '#5A4632'; g.fill();
    g.restore();
    // bark texture: short radial fissures
    g.strokeStyle = 'rgba(20,14,8,.45)'; g.lineWidth = 1;
    for (i = 0; i < 46; i++) {
      var a2 = i / 46 * Math.PI * 2 + Math.sin(i * 7.1) * 0.04, r2 = barkR(a2);
      g.beginPath(); g.moveTo(Math.cos(a2) * (R + 2), Math.sin(a2) * (R + 2)); g.lineTo(Math.cos(a2) * (r2 - 1), Math.sin(a2) * (r2 - 1)); g.stroke();
    }
    // wood
    var gr = g.createRadialGradient(PITH[0], PITH[1], 0, 0, 0, R);
    gr.addColorStop(0, '#EBCB98'); gr.addColorStop(0.55, '#DDB47C'); gr.addColorStop(0.86, '#C89B63'); gr.addColorStop(1, '#A87543');
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(40,26,14,.55)'; g.lineWidth = 1.4; g.stroke();
    // growth rings, drawn outward from the pith
    var n = rf * NR;
    for (i = 1; i <= Math.ceil(n); i++) {
      var k = i / NR, ri = R * Math.pow(k, 0.9) * 0.985, al = Math.min(1, n - i + 1);
      var cx = PITH[0] * (1 - k), cy = PITH[1] * (1 - k);
      g.beginPath();
      for (var j = 0; j <= 90; j++) {
        var th = j / 90 * Math.PI * 2;
        var rr = ri * (1 + 0.012 * Math.sin(3 * th + i * 0.7) + 0.007 * Math.sin(7 * th + i * 1.3));
        if (j) g.lineTo(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr); else g.moveTo(cx + rr, cy);
      }
      g.closePath();
      g.strokeStyle = 'rgba(112,72,36,' + ((i % 4 === 0 ? 0.42 : 0.24) * al) + ')';
      g.lineWidth = i % 4 === 0 ? 1.5 : 1;
      g.stroke();
    }
    g.restore();
    g.save(); g.scale(sx, 1);
    g.beginPath(); g.arc(PITH[0], PITH[1], 3, 0, Math.PI * 2); g.fillStyle = 'rgba(110,70,34,' + (0.7 * Math.min(1, rf * 4)) + ')'; g.fill();
    g.restore();
  }

  // end-grain arcs inside a board end (clip must be set by caller)
  function grain(g, x, y, w, h, seed, alpha) {
    var cx = x + w * (0.3 + 0.4 * ((seed * 0.37) % 1)), cy = y + h + w * 0.9;
    g.strokeStyle = 'rgba(110,70,36,' + alpha + ')'; g.lineWidth = 1;
    for (var i = 0; i < 6; i++) {
      var r = w * 0.75 + i * h * 0.45;
      g.beginPath(); g.arc(cx, cy, r, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    }
  }

  function mount(el) {
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    canvas.setAttribute('aria-hidden', 'true');
    el.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var reduce = !!(mq && mq.matches);

    var W = 1, H = 1, dpr = 1, lay = null;
    var target = 0, cur = 0, vel = 0, paused = false, raf = 0, last = 0, T = 0, playState = null, destroyed = false;
    var SA = 1, curS = 1; // current scene alpha, current world scale (px per unit)
    var intro = 0, introStart = 0; // 0→1 over ~1.8 s after mount: the forest grows in even at p = 0
    var disc = null;

    var imgs = PHOTOS.map(function (ph) {
      var im = new Image(); im.decoding = 'async';
      im.onload = function () { request(); };
      im.src = ph[0];
      return im;
    });

    var parts = [];
    for (var i = 0; i < 56; i++) parts.push({ u: Math.random(), v: Math.random() * 2 - 1, sp: 0.5 + Math.random(), r: 0.5 + Math.random() * 1.3, ph: Math.random() * 6.28 });

    // rough board outline for the planing scene
    var ROUGH = (function () {
      var o = [], n = 40, k;
      for (k = 0; k <= n; k++) o.push([-150 + 300 * k / n, -32 + Math.sin(k * 1.7) * 2 + Math.sin(k * 4.3) * 1.6]);
      for (k = 0; k <= 8; k++) o.push([150 + Math.sin(k * 2.1) * 2.2, -32 + 64 * k / 8]);
      for (k = n; k >= 0; k--) o.push([-150 + 300 * k / n, 32 + Math.sin(k * 2.3 + 1) * 2 + Math.sin(k * 5.1) * 1.4]);
      for (k = 8; k >= 0; k--) o.push([-150 + Math.sin(k * 1.9) * 2.2, -32 + 64 * k / 8]);
      return o;
    })();

    function al(x) { ctx.globalAlpha = SA * clamp(x, 0, 1); }
    function lw(px) { return px / curS; }
    function text(str, x, y, px, col, align, wt, base) {
      ctx.font = (wt || 400) + ' ' + (px / curS) + 'px ' + MONO;
      ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.textBaseline = base || 'middle';
      ctx.fillText(str, x, y);
    }
    function leader(x1, y1, x2, y2, a) {
      ctx.strokeStyle = L(0.7 * a); ctx.lineWidth = lw(1);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.fillStyle = L(0.9 * a); ctx.beginPath(); ctx.arc(x1, y1, lw(2.2), 0, Math.PI * 2); ctx.fill();
    }
    function tick(x, y, a, len) { // 45° architectural tick
      var d = lw(len || 4);
      ctx.beginPath(); ctx.moveTo(x - d, y + d); ctx.lineTo(x + d, y - d); ctx.stroke();
    }

    // ---------- layout ----------
    function layout() {
      var pad = clamp(W * 0.05, 16, 40);
      var top = clamp(H * 0.09, 60, 78);
      var pw = clamp(W * 0.4, 128, 300), ph = Math.round(pw * 0.66);
      var photo = { x: W - pad - pw, y: H - pad - ph, w: pw, h: ph };
      var D = { x: pad, y: top, w: W - 2 * pad, h: Math.max(80, photo.y - 14 - top) };
      var s = Math.min(D.w, D.h) / BOX;
      lay = { pad: pad, photo: photo, D: D, s: s, cx: D.x + D.w / 2, cy: D.y + D.h / 2, info: { x: pad, w: photo.x - pad - 18 } };
    }
    function buildDisc() {
      var sc = lay.s * dpr * 1.12, half = RB + 30;
      var size = Math.ceil(2 * half * sc);
      var c = document.createElement('canvas'); c.width = c.height = size;
      var g = c.getContext('2d');
      g.translate(size / 2, size / 2); g.scale(sc, sc);
      drawDisc(g, 1, 1, 24 * sc);
      disc = { c: c, half: half, key: lay.s * dpr };
    }
    function resize() {
      var r = el.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      layout(); disc = null; request();
    }

    // ---------- scenes (origin = drawing-area centre, units) ----------
    var GY = 150;
    var TREES = [
      { x: -180, h: 190 }, { x: -130, h: 262, fall: 1 }, { x: -82, h: 228 }, { x: -34, h: 282 },
      { x: 14, h: 214 }, { x: 64, h: 268 }, { x: 116, h: 236 }, { x: 170, h: 198 }
    ];
    // spruce silhouette: slim trunk, tiered outline with a faint moss fill and fine branch lines
    function spruce(x, base, h, wb, ca) {
      var top = base - h, cb = base - h * 0.16, n = Math.max(4, Math.round(h / 34)), mw = h * 0.15;
      ctx.fillStyle = L(0.8);
      ctx.beginPath(); ctx.moveTo(x - wb, base); ctx.lineTo(x - wb * 0.3, top + 8); ctx.lineTo(x + wb * 0.3, top + 8); ctx.lineTo(x + wb, base); ctx.closePath(); ctx.fill();
      if (ca <= 0) return;
      var pts = [[x, top]], th = (cb - top) / n, j, yb, w;
      for (j = 0; j < n; j++) { yb = top + th * (j + 1); w = mw * Math.pow((j + 1) / n, 0.85); pts.push([x + w, yb], [x + w * 0.42, yb - th * 0.28]); }
      pts.pop(); pts.push([x, cb + 2]);
      for (j = n - 1; j >= 0; j--) { yb = top + th * (j + 1); w = mw * Math.pow((j + 1) / n, 0.85); if (j < n - 1) pts.push([x - w * 0.42, yb - th * 0.28 + th]); pts.push([x - w, yb]); }
      var a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * ca;
      poly(ctx, pts);
      ctx.fillStyle = 'rgba(' + MOSS + ',0.16)'; ctx.fill();
      ctx.strokeStyle = L(0.55); ctx.lineWidth = lw(1); ctx.stroke();
      ctx.strokeStyle = L(0.22); ctx.lineWidth = lw(0.8);
      for (j = 0; j < n; j++) {
        yb = top + th * (j + 1); w = mw * Math.pow((j + 1) / n, 0.85);
        ctx.beginPath(); ctx.moveTo(x - w * 0.9, yb - 1); ctx.lineTo(x, yb - th * 0.62); ctx.lineTo(x + w * 0.9, yb - 1); ctx.stroke();
      }
      ctx.globalAlpha = a0;
    }
    function scene0(t) { // forest → felled tree → log
      // ground with hatch
      al(1); ctx.strokeStyle = L(0.35); ctx.lineWidth = lw(1.2);
      ctx.beginPath(); ctx.moveTo(-215, GY); ctx.lineTo(215, GY); ctx.stroke();
      ctx.strokeStyle = L(0.12); ctx.lineWidth = lw(1);
      for (var hx = -210; hx < 212; hx += 12) { ctx.beginPath(); ctx.moveTo(hx, GY + 2); ctx.lineTo(hx - 8, GY + 10); ctx.stroke(); }

      var fade = 1 - 0.84 * sm(seg(t, 0.46, 0.66));
      var fall = Math.pow(seg(t, 0.28, 0.5), 2.1);
      var morph = eio(seg(t, 0.48, 0.66));
      TREES.forEach(function (tr, i) {
        var tg = Math.max(t, intro * 0.3), g = eo(seg(tg, i * 0.018, 0.22 + i * 0.018)), h = tr.h * g;
        if (h < 1) return;
        if (!tr.fall) {
          al(fade); spruce(tr.x, GY, h, 2.6, sm(g * 1.4 - 0.2));
          return;
        }
        // the tree that is felled
        if (morph >= 1) return;
        ctx.save(); al(1 - morph);
        ctx.translate(tr.x, GY); ctx.rotate(fall * Math.PI / 2);
        spruce(0, 0, h, 3.4, (1 - seg(t, 0.33, 0.48)) * sm(g * 1.4 - 0.2));
        ctx.restore();
      });
      // felling cut at the base
      var cut = seg(t, 0.2, 0.28);
      if (cut > 0 && morph < 1) {
        al((1 - seg(t, 0.4, 0.48)));
        ctx.strokeStyle = RUST; ctx.lineWidth = lw(2);
        ctx.beginPath(); ctx.moveTo(-142, GY - 7); ctx.lineTo(-142 + 24 * cut, GY - 7); ctx.stroke();
        if (cut < 1) { ctx.fillStyle = 'rgba(180,73,11,.35)'; ctx.beginPath(); ctx.arc(-142 + 24 * cut, GY - 7, lw(6), 0, Math.PI * 2); ctx.fill(); }
      }
      // log (side view)
      if (morph > 0) {
        var th = lerp(9, 46, morph), cy = GY - th / 2, x0 = -130, x1 = 122;
        al(morph);
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 16 * curS; ctx.shadowOffsetY = 5 * curS;
        var gb = ctx.createLinearGradient(0, cy - th / 2, 0, cy + th / 2);
        gb.addColorStop(0, '#76604A'); gb.addColorStop(0.45, '#5A4632'); gb.addColorStop(1, '#2F241A');
        ctx.fillStyle = gb;
        ctx.beginPath(); ctx.moveTo(x0 + 6, cy - th / 2); ctx.lineTo(x1, cy - th / 2 + 1); ctx.lineTo(x1, cy + th / 2); ctx.lineTo(x0 + 6, cy + th / 2);
        ctx.quadraticCurveTo(x0 - 2, cy, x0 + 6, cy - th / 2); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = 'rgba(15,10,6,.35)'; ctx.lineWidth = lw(1);
        for (var b = 0; b < 5; b++) {
          var by = cy - th / 2 + th * (0.18 + b * 0.16);
          ctx.beginPath(); ctx.moveTo(x0 + 14 + b * 9, by); ctx.lineTo(x1 - 20 - b * 13, by + Math.sin(b) * 1.5); ctx.stroke();
        }
        // end grain at the cut end
        var ex = x1, rx = th * 0.26, ry = th / 2;
        var ge = ctx.createRadialGradient(ex, cy, 0, ex, cy, ry);
        ge.addColorStop(0, '#EBCB98'); ge.addColorStop(0.8, '#C89B63'); ge.addColorStop(1, '#A87543');
        ctx.fillStyle = ge; ctx.beginPath(); ctx.ellipse(ex, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(112,72,36,.4)'; ctx.lineWidth = lw(1);
        for (var r2 = 0.3; r2 < 1; r2 += 0.22) { ctx.beginPath(); ctx.ellipse(ex + 1, cy - 1, rx * r2, ry * r2, 0, 0, Math.PI * 2); ctx.stroke(); }
        // species label (from buvelementi.lv: egle, priede, lapu koki)
        var da = sm(seg(t, 0.6, 0.72));
        if (da > 0) {
          al(da);
          text('egle · priede · lapu koki', (x0 + x1) / 2, cy - th / 2 - 22, 12, L(0.95), 'center', 500);
        }
      }
    }

    function scene1(t) { // camera turns to the log end, rings draw in
      var turn = eio(seg(t, 0, 0.32));
      // starts where the log end sat in the previous shot, then swings round to face the camera
      var z = lerp(0.17, 1, turn), sx = lerp(0.3, 1, turn);
      ctx.save(); al(1);
      ctx.translate(lerp(119, 0, turn), lerp(112, 0, turn));
      ctx.scale(z, z);
      var rf = seg(t, 0.14, 0.8);
      if (rf >= 1 && sx >= 1 && disc) ctx.drawImage(disc.c, -disc.half, -disc.half, disc.half * 2, disc.half * 2);
      else drawDisc(ctx, rf, sx, 18 * curS);
      ctx.restore();
      var la = sm(seg(t, 0.56, 0.72)) * (1 - sm(seg(t, 0.92, 1)));
      if (la > 0) {
        al(la);
        leader(PITH[0], PITH[1], -120, -192, 1); text('serde', -124, -205, 12, L(0.95), 'left', 500);
        leader(96, -64, 150, -192, 1); text('gadskārtas', 205, -205, 12, L(0.95), 'right', 500);
        leader(-104, 112, -150, 192, 1); text('miza', -154, 205, 12, L(0.95), 'left', 500);
      }
    }

    var K = 150 / 160; // units per mm (log ø 320 mm → disc R 150)
    var PIECES = [
      { x: -75, y: -75, w: 150, h: 150, d: 0, lab: '150×150', fs: 13 },
      { x: -125, y: -75, w: 50, h: 150, d: -1, lab: '50×150', fs: 11, rot: 1 },
      { x: 75, y: -75, w: 50, h: 150, d: 1, lab: '50×150', fs: 11, rot: 1 },
      { x: -150, y: -50, w: 25, h: 100, d: -2, lab: '25×100', fs: 10, rot: 1 },
      { x: 125, y: -50, w: 25, h: 100, d: 2, lab: '25×100', fs: 10, rot: 1 }
    ];
    var OFF = [-50, -26, 0, 26, 50]; // explode offsets per piece (outer, side, cant)
    function chord(x) { var r = 160; return Math.sqrt(Math.max(0, r * r - x * x)) + 6; }
    var SAWS = [
      [-75, null, 0.042, 0.166], [75, null, 0.075, 0.199], [-125, null, 0.124, 0.241], [125, null, 0.158, 0.266],
      [-150, null, 0.199, 0.29], [150, null, 0.224, 0.307],
      [null, -75, 0.282, 0.382, -125, 125], [null, 75, 0.307, 0.398, -125, 125],
      [null, -50, 0.365, 0.44, -150, -125], [null, 50, 0.373, 0.448, -150, -125],
      [null, -50, 0.382, 0.457, 125, 150], [null, 50, 0.39, 0.465, 125, 150]
    ];
    function scene2(t) { // sawing pattern on the log end
      if (!disc) return;
      var e = eio(seg(t, 0.46, 0.64)), hf = disc.half;
      ctx.save(); al(1 - 0.84 * e);
      ctx.drawImage(disc.c, -hf, -hf, hf * 2, hf * 2);
      ctx.restore();
      if (e > 0) {
        PIECES.forEach(function (pc) {
          var ox = OFF[pc.d + 2] * e;
          ctx.save(); al(1);
          ctx.beginPath(); ctx.rect(pc.x * K + ox, pc.y * K, pc.w * K, pc.h * K); ctx.clip();
          ctx.drawImage(disc.c, -hf + ox, -hf, hf * 2, hf * 2);
          ctx.restore();
          al(e); ctx.strokeStyle = L(0.9); ctx.lineWidth = lw(1.2);
          ctx.strokeRect(pc.x * K + ox, pc.y * K, pc.w * K, pc.h * K);
        });
      }
      // saw lines
      SAWS.forEach(function (sw) {
        var pr = seg(t, sw[2], sw[3]);
        if (pr <= 0) return;
        var x1, y1, x2, y2;
        if (sw[0] !== null) { var c = chord(sw[0]); x1 = x2 = sw[0] * K; y1 = -c * K; y2 = c * K; }
        else { x1 = sw[4] * K; x2 = sw[5] * K; y1 = y2 = sw[1] * K; }
        var hx = lerp(x1, x2, pr), hy = lerp(y1, y2, pr);
        al(1 - e);
        ctx.strokeStyle = RUST; ctx.lineWidth = lw(1.8);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(hx, hy); ctx.stroke();
        if (pr < 1) {
          ctx.fillStyle = 'rgba(180,73,11,.32)'; ctx.beginPath(); ctx.arc(hx, hy, lw(7), 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#F0A060'; ctx.beginPath(); ctx.arc(hx, hy, lw(2), 0, Math.PI * 2); ctx.fill();
        }
      });
      // labels and dimension chain
      var la = sm(seg(t, 0.54, 0.68));
      if (la > 0) {
        PIECES.forEach(function (pc) {
          var ox = OFF[pc.d + 2] * e, cx = (pc.x + pc.w / 2) * K + ox, cy = (pc.y + pc.h / 2) * K;
          al(la);
          ctx.save(); ctx.translate(cx, cy); if (pc.rot) ctx.rotate(-Math.PI / 2);
          text(pc.lab, 0, 0, pc.fs, 'rgba(45,28,12,.92)', 'center', 600);
          ctx.restore();
          // chain dimension above
          var yd = -184, xa = pc.x * K + ox, xb = (pc.x + pc.w) * K + ox;
          ctx.strokeStyle = L(0.7); ctx.lineWidth = lw(1);
          ctx.beginPath(); ctx.moveTo(xa, yd); ctx.lineTo(xb, yd); ctx.moveTo(xa, yd + 6); ctx.lineTo(xa, yd - 6); ctx.moveTo(xb, yd + 6); ctx.lineTo(xb, yd - 6); ctx.stroke();
          text(String(pc.w), (xa + xb) / 2, yd - 11, 10, L(0.85), 'center', 500);
        });
        al(la);
        var vx = 75 * K + 5;
        ctx.strokeStyle = L(0.75); ctx.lineWidth = lw(1);
        ctx.beginPath(); ctx.moveTo(vx, -75 * K); ctx.lineTo(vx, 75 * K); ctx.stroke();
        tick(vx, -75 * K); tick(vx, 75 * K);
        ctx.save(); ctx.translate(vx + 8, 0); ctx.rotate(-Math.PI / 2); text('150', 0, 0, 10, L(0.9), 'center', 500); ctx.restore();
        text('zāģēšanas shēma · mm', -205, -212, 10, L(0.55), 'left', 400);
      }
    }

    var WET = '#8C6138', DRY = '#DDB57D';
    function scene3(t) { // drying stack with stickers + moisture meter
      var cols = 4, rows = 7, bw = 55, bh = 19, gx = 5, sh = 6, x0 = -212, base = 112;
      var d = sm(seg(t, 0.15, 0.65));
      var col = mix(WET, DRY, d);
      // bearers
      al(sm(seg(t, 0, 0.08)));
      ctx.fillStyle = '#2C241C'; ctx.fillRect(x0 - 6, base, cols * bw + (cols - 1) * gx + 12, 12);
      ctx.strokeStyle = L(0.2); ctx.lineWidth = lw(1); ctx.strokeRect(x0 - 6, base, cols * bw + (cols - 1) * gx + 12, 12);
      for (var r = 0; r < rows; r++) {
        var rt = eo(seg(t, 0.02 + r * 0.03, 0.12 + r * 0.03));
        if (rt <= 0) continue;
        var yb = base - r * (bh + sh) - sh, dy = -(1 - rt) * 70;
        al(rt);
        // sticker under this row
        ctx.fillStyle = '#3B2F23';
        for (var sk = 0; sk < 3; sk++) ctx.fillRect(x0 - 3 + sk * ((cols * bw + (cols - 1) * gx - 6) / 2), yb + dy, 12, sh);
        for (var c = 0; c < cols; c++) {
          var bx = x0 + c * (bw + gx), by = yb - bh + dy;
          var gfill = ctx.createLinearGradient(bx, by, bx, by + bh);
          gfill.addColorStop(0, col); gfill.addColorStop(1, mix(WET, DRY, d * 0.7));
          ctx.fillStyle = gfill; ctx.fillRect(bx, by, bw, bh);
          ctx.save(); ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip(); grain(ctx, bx, by, bw, bh, r * 4 + c, 0.3); ctx.restore();
          ctx.strokeStyle = 'rgba(30,20,10,.45)'; ctx.lineWidth = lw(1); ctx.strokeRect(bx, by, bw, bh);
        }
      }
      // airflow through the sticker layers
      var fa = sm(seg(t, 0.2, 0.3));
      if (fa > 0) {
        al(fa); ctx.strokeStyle = L(0.5); ctx.lineWidth = lw(1);
        ctx.setLineDash([lw(6), lw(10)]); ctx.lineDashOffset = -T * 22 / curS;
        for (r = 0; r < rows; r++) {
          var ya = base - r * (bh + sh) - sh / 2;
          ctx.beginPath(); ctx.moveTo(x0 - 14, ya); ctx.lineTo(x0 + cols * bw + (cols - 1) * gx + 14, ya); ctx.stroke();
        }
        ctx.setLineDash([]);
        var ax = x0 + cols * bw + (cols - 1) * gx + 18;
        ctx.strokeStyle = L(0.6);
        for (r = 0; r < rows; r += 2) { var yy = base - r * (bh + sh) - sh / 2; ctx.beginPath(); ctx.moveTo(ax - 4, yy - 4); ctx.lineTo(ax, yy); ctx.lineTo(ax - 4, yy + 4); ctx.stroke(); }
      }
      // moisture meter
      var ma = sm(seg(t, 0.12, 0.22));
      if (ma > 0) {
        var mx = 60, top = -96, bot = 124, Y0 = -82, Y18 = 8, Y12 = 86;
        al(ma);
        ctx.strokeStyle = L(0.55); ctx.lineWidth = lw(1);
        ctx.strokeRect(mx, top, 12, bot - top);
        var lv = lerp(Y0, Y18, eio(seg(t, 0.22, 0.38)));
        lv = lerp(lv, Y12, eio(seg(t, 0.48, 0.62)));
        var gm = ctx.createLinearGradient(0, lv, 0, bot);
        gm.addColorStop(0, col); gm.addColorStop(1, mix(WET, DRY, 0.3));
        ctx.fillStyle = gm; ctx.fillRect(mx + 2, lv, 8, bot - lv - 2);
        ctx.fillStyle = RUST;
        ctx.beginPath(); ctx.moveTo(mx - 3, lv); ctx.lineTo(mx - 11, lv - 5); ctx.lineTo(mx - 11, lv + 5); ctx.closePath(); ctx.fill();
        var marks = [[Y0, '', ''], [Y18, '18 %', 'konstrukcijām'], [Y12, '12 %', 'iekšdarbiem']];
        marks.forEach(function (m, i) {
          var on = i === 0 ? 1 : i === 1 ? seg(t, 0.3, 0.38) : seg(t, 0.54, 0.62);
          ctx.strokeStyle = L(0.6); ctx.beginPath(); ctx.moveTo(mx + 12, m[0]); ctx.lineTo(mx + 22, m[0]); ctx.stroke();
          if (m[1]) text(m[1], mx + 28, m[0] - (m[2] ? lw(7) : 0), 12, L(0.55 + 0.4 * on), 'left', 600);
          if (m[2]) text(m[2], mx + 28, m[0] + lw(8), 10, L(0.4 + 0.4 * on), 'left', 400);
        });
        text('mitrums', mx - 2, top - lw(44), 10, L(0.55), 'left', 400);
        var read = t < 0.37 ? 'svaigs' : t < 0.61 ? '18 %' : '12 %';
        text(read, mx - 2, top - lw(20), 22, L(0.95), 'left', 600);
      }
    }

    function drawProfile(o, cx, cy, sc, a, draw) {
      // draw: 0..1 outline draw-in, then fill
      ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
      var fillA = sm((draw - 0.55) / 0.45);
      if (fillA > 0) {
        al(a * fillA);
        poly(ctx, o.p);
        var gp = ctx.createLinearGradient(-60, -12, 60, 12);
        gp.addColorStop(0, '#E2C08C'); gp.addColorStop(1, '#C89B63');
        ctx.fillStyle = gp; ctx.fill();
        ctx.save(); poly(ctx, o.p); ctx.clip();
        ctx.strokeStyle = 'rgba(112,72,36,.32)'; ctx.lineWidth = 1 / sc / curS;
        for (var i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(18, 70, 66 + i * 7, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
        ctx.restore();
      }
      al(a);
      ctx.strokeStyle = L(0.9); ctx.lineWidth = 1.2 / sc / curS;
      var len = o.len;
      ctx.setLineDash([len * clamp(draw / 0.6, 0, 1), len]);
      poly(ctx, o.p); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    function scene4(t) { // planing the rough board → profile family
      var rowY = function (i) { return -156 + i * 74; };
      var PX = -100, PS = 1.34;
      var mt = eio(seg(t, 0.2, 0.3));
      var bx = lerp(0, PX, mt), by = lerp(-20, rowY(0), mt), bs = lerp(1, 0.48, mt);
      // board being planed
      if (mt < 1) {
        var pl = lerp(-176, 176, eio(seg(t, 0.03, 0.22)));
        ctx.save(); ctx.translate(bx, by); ctx.scale(bs, bs);
        al(1 - sm(seg(t, 0.25, 0.3)));
        var gb = ctx.createLinearGradient(0, -32, 0, 32);
        gb.addColorStop(0, '#DDB57D'); gb.addColorStop(1, '#B98B55');
        // clean (planed) part left of the cutter
        ctx.save(); ctx.beginPath(); ctx.rect(-200, -60, pl + 200, 120); ctx.clip();
        ctx.fillStyle = gb; ctx.fillRect(-146, -28, 292, 56);
        ctx.strokeStyle = L(0.9); ctx.lineWidth = lw(1.2) / bs; ctx.strokeRect(-146, -28, 292, 56);
        ctx.restore();
        // rough part right of the cutter
        ctx.save(); ctx.beginPath(); ctx.rect(pl, -60, 400, 120); ctx.clip();
        poly(ctx, ROUGH); ctx.fillStyle = '#A77B4A'; ctx.fill();
        ctx.strokeStyle = 'rgba(232,211,176,.45)'; ctx.lineWidth = lw(1) / bs; ctx.stroke();
        ctx.restore();
        // end-grain arcs
        ctx.save(); poly(ctx, ROUGH); ctx.clip();
        ctx.strokeStyle = 'rgba(112,72,36,.3)'; ctx.lineWidth = lw(1) / bs;
        for (var i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(40, 230, 205 + i * 13, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
        ctx.restore();
        // cutter head + chips
        var ca = 1 - seg(t, 0.2, 0.24);
        if (ca > 0) {
          al(ca * (1 - mt));
          ctx.strokeStyle = RUST; ctx.lineWidth = lw(2) / bs;
          ctx.beginPath(); ctx.moveTo(pl, -46); ctx.lineTo(pl, 46); ctx.stroke();
          ctx.save(); ctx.translate(pl, -58); ctx.rotate(T * 9);
          ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.stroke();
          for (var s = 0; s < 4; s++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(11, 0); ctx.stroke(); }
          ctx.restore();
          ctx.strokeStyle = 'rgba(221,181,125,.8)'; ctx.lineWidth = lw(1.2) / bs;
          for (var c = 0; c < 9; c++) {
            var ph = (T * 1.6 + c * 0.13) % 1, cxp = pl - 6 - ph * (30 + c * 4), cyp = -34 - ph * (34 + (c % 3) * 12);
            ctx.globalAlpha = SA * ca * (1 - ph) * 0.9;
            ctx.beginPath(); ctx.moveTo(cxp, cyp); ctx.lineTo(cxp - 3, cyp - 2); ctx.stroke();
          }
        }
        ctx.restore();
        if (t < 0.24) {
          al(sm(seg(t, 0.05, 0.11)) * (1 - seg(t, 0.18, 0.24)));
          text('ēvelēšana · 28×145', 0, 62, 11, L(0.7), 'center', 500);
        }
      }
      // profile family
      PROFILES.forEach(function (o, i) {
        var a, draw;
        var s0 = 0.26 + i * 0.05; a = sm(seg(t, s0, s0 + 0.04)); draw = seg(t, s0, s0 + 0.1);
        if (a <= 0) return;
        drawProfile(o, PX, rowY(i), PS, a, draw);
        al(a);
        text(o.n, 2, rowY(i), 12, L(0.92), 'left', 500);
        ctx.strokeStyle = L(0.18); ctx.lineWidth = lw(1);
        ctx.beginPath(); ctx.moveTo(-200, rowY(i) + 34); ctx.lineTo(200, rowY(i) + 34); ctx.stroke();
      });
    }

    function scene5(t) { // finished pack with stamp + route
      var cols = 4, rows = 6, bw = 36, bh = 11, gp = 1.4;
      var FW = cols * bw + (cols - 1) * gp, FH = rows * bh + (rows - 1) * gp;
      var fx = -206, fy = -34, dvx = 214, dvy = -84; // long side reads as a 6 m pack
      var fa = sm(seg(t, 0.2, 0.32));
      // shadow
      al(sm(seg(t, 0, 0.1)) * 0.6);
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.ellipse(fx + FW / 2 + dvx / 2, fy + FH + dvy / 2 + 8, (FW + dvx) * 0.52, 16, Math.atan2(dvy, dvx) * 0.55, 0, Math.PI * 2); ctx.fill();
      if (fa > 0) {
        al(fa);
        // top face
        var gt = ctx.createLinearGradient(fx, fy, fx + dvx, fy + dvy);
        gt.addColorStop(0, '#D9B27A'); gt.addColorStop(1, '#BC9060');
        ctx.fillStyle = gt;
        poly(ctx, [[fx, fy], [fx + FW, fy], [fx + FW + dvx, fy + dvy], [fx + dvx, fy + dvy]]); ctx.fill();
        ctx.strokeStyle = 'rgba(80,52,26,.4)'; ctx.lineWidth = lw(1);
        for (var c = 1; c < cols; c++) { var lx = fx + c * (bw + gp) - gp / 2; ctx.beginPath(); ctx.moveTo(lx, fy); ctx.lineTo(lx + dvx, fy + dvy); ctx.stroke(); }
        // right face
        ctx.fillStyle = '#9E7044';
        poly(ctx, [[fx + FW, fy], [fx + FW + dvx, fy + dvy], [fx + FW + dvx, fy + FH + dvy], [fx + FW, fy + FH]]); ctx.fill();
        for (var r = 1; r < rows; r++) { var ly = fy + r * (bh + gp) - gp / 2; ctx.beginPath(); ctx.moveTo(fx + FW, ly); ctx.lineTo(fx + FW + dvx, ly + dvy); ctx.stroke(); }
        ctx.strokeStyle = L(0.5);
        poly(ctx, [[fx, fy], [fx + dvx, fy + dvy], [fx + FW + dvx, fy + dvy], [fx + FW + dvx, fy + FH + dvy], [fx + FW, fy + FH]]);
        ctx.stroke();
      }
      // board ends, rows dropping in from the bottom up
      for (r = rows - 1; r >= 0; r--) {
        var ri = rows - 1 - r, rt = eo(seg(t, 0.01 + ri * 0.03, 0.12 + ri * 0.03));
        if (rt <= 0) continue;
        al(rt);
        var yy = fy + r * (bh + gp) - (1 - rt) * 46;
        for (c = 0; c < cols; c++) {
          var xx = fx + c * (bw + gp);
          var ge = ctx.createLinearGradient(xx, yy, xx + bw, yy + bh);
          ge.addColorStop(0, '#E6C796'); ge.addColorStop(1, '#C99C64');
          ctx.fillStyle = ge; ctx.fillRect(xx, yy, bw, bh);
          ctx.save(); ctx.beginPath(); ctx.rect(xx, yy, bw, bh); ctx.clip(); grain(ctx, xx, yy, bw, bh, r * 5 + c, 0.28); ctx.restore();
          ctx.strokeStyle = 'rgba(60,40,20,.5)'; ctx.lineWidth = lw(0.8); ctx.strokeRect(xx, yy, bw, bh);
        }
      }
      // straps
      var sa = sm(seg(t, 0.3, 0.4));
      if (sa > 0) {
        al(sa);
        [0.15, 0.5, 0.85].forEach(function (f) {
          ctx.strokeStyle = '#1B1713'; ctx.lineWidth = lw(3.2);
          ctx.beginPath(); ctx.moveTo(fx + f * dvx, fy + f * dvy); ctx.lineTo(fx + FW + f * dvx, fy + f * dvy); ctx.lineTo(fx + FW + f * dvx, fy + FH + f * dvy); ctx.stroke();
          ctx.strokeStyle = L(0.3); ctx.lineWidth = lw(1);
          ctx.beginPath(); ctx.moveTo(fx + f * dvx, fy + f * dvy - lw(1.6)); ctx.lineTo(fx + FW + f * dvx, fy + f * dvy - lw(1.6)); ctx.stroke();
        });
      }
      // length dimension along the pack
      var la = sm(seg(t, 0.34, 0.48));
      if (la > 0) {
        al(la); ctx.strokeStyle = L(0.75); ctx.lineWidth = lw(1);
        var ox = -14, oy = -10;
        ctx.beginPath(); ctx.moveTo(fx + ox, fy + oy); ctx.lineTo(fx + ox + dvx, fy + oy + dvy); ctx.stroke();
        tick(fx + ox, fy + oy); tick(fx + ox + dvx, fy + oy + dvy);
        ctx.save(); ctx.translate(fx + ox + dvx / 2 - 10, fy + oy + dvy / 2 - 10); ctx.rotate(Math.atan2(dvy, dvx));
        text('6,0 m', 0, 0, 11, L(0.9), 'center', 500); ctx.restore();
      }
      // stamp tag
      var st = seg(t, 0.38, 0.5);
      if (st > 0) {
        ctx.font = '700 ' + (12 / curS) + 'px ' + MONO;
        var tw = Math.max(176, ctx.measureText('KD 18 % · 6,0 m').width + 34 / curS), tg = Math.max(46, 44 / curS);
        var sc = lerp(1.4, 1, eo(st)), tx = fx + FW + dvx * 0.42, ty = fy + FH + dvy * 0.42 + tg * 0.5 + 10;
        al(eo(st));
        ctx.save(); ctx.translate(tx, ty); ctx.rotate(-0.06); ctx.scale(sc, sc);
        ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 10 * curS; ctx.shadowOffsetY = 3 * curS;
        ctx.fillStyle = '#F1E5CF'; ctx.fillRect(-tw / 2, -tg / 2, tw, tg);
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = RUST; ctx.lineWidth = lw(2); ctx.strokeRect(-tw / 2 + 4, -tg / 2 + 4, tw - 8, tg - 8);
        text('45×145 · C24', 0, -tg * 0.18, 12, RUST, 'center', 700);
        text('KD 18 % · 6,0 m', 0, tg * 0.2, 12, RUST, 'center', 700);
        ctx.restore();
      }
      // route
      // keep the route curves clear of the stamp tag (tag height is fixed in px, so it grows in units on small stages)
      var tagBot = fy + FH + dvy * 0.42 + Math.max(46, 44 / curS) + 10;
      var ra = seg(t, 0.52, 0.9);
      if (ra > 0) {
        var ox0 = -150, oy0 = Math.max(168, tagBot + 40);
        var ends = [[10, 112], [86, 120], [160, 128], [196, 158], [120, 160]];
        al(1);
        ctx.strokeStyle = L(0.55); ctx.lineWidth = lw(1.2);
        ctx.setLineDash([lw(5), lw(5)]); ctx.lineDashOffset = -T * 12 / curS;
        ends.forEach(function (en, i) {
          var pr = eio(seg(ra, i * 0.08, 0.6 + i * 0.08));
          if (pr <= 0) return;
          var qx = (ox0 + en[0]) / 2, qy = Math.max(Math.min(oy0, en[1]) - 46 + i * 6, tagBot + 6);
          ctx.beginPath(); ctx.moveTo(ox0, oy0);
          for (var k = 1; k <= 24; k++) {
            var u = k / 24 * pr, a1 = (1 - u) * (1 - u), b1 = 2 * u * (1 - u), c1 = u * u;
            ctx.lineTo(a1 * ox0 + b1 * qx + c1 * en[0], a1 * oy0 + b1 * qy + c1 * en[1]);
          }
          ctx.stroke();
          if (pr > 0.98) { ctx.setLineDash([]); ctx.fillStyle = L(0.85); ctx.beginPath(); ctx.arc(en[0], en[1], lw(3), 0, Math.PI * 2); ctx.fill(); ctx.setLineDash([lw(5), lw(5)]); }
        });
        ctx.setLineDash([]);
        var pulse = reduce ? 0 : (Math.sin(T * 3) + 1) / 2;
        ctx.fillStyle = 'rgba(180,73,11,' + (0.25 * (1 - pulse)) + ')';
        ctx.beginPath(); ctx.arc(ox0, oy0, lw(6 + 8 * pulse), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = RUST; ctx.beginPath(); ctx.arc(ox0, oy0, lw(5), 0, Math.PI * 2); ctx.fill();
        al(sm(seg(ra, 0, 0.2)));
        text('Baldone → visa Latvija', ox0 - 6, oy0 + 26, 12, L(0.92), 'left', 500);
      }
    }

    var SCENES = [scene0, scene1, scene2, scene3, scene4, scene5];
    var CAMS = [
      function (t) { var f = eio(seg(t, 0.6, 1)); return { z: 1 + 0.04 * eio(t) + 0.04 * f, x: -18 * f, y: -30 * f }; },
      function (t) { return { z: 0.94 + 0.06 * eio(t), x: 0, y: 0 }; },
      function (t) { return { z: 1 + 0.035 * eio(t), x: 0, y: 0 }; },
      function (t) { return { z: 1 + 0.04 * eio(t), x: 4 * t, y: 0 }; },
      function (t) { return { z: 1 + 0.03 * eio(t), x: 0, y: 0 }; },
      function (t) { return { z: 1 + 0.045 * eio(t), x: -6 * t, y: 0 }; }
    ];
    function sceneState(p) {
      var out = [];
      for (var k = 0; k < 6; k++) {
        var a0 = CUTS[k], a1 = CUTS[k + 1];
        var aIn = k === 0 ? 1 : sm(seg(p, a0 - F, a0 + F));
        var aOut = k === 5 ? 1 : 1 - sm(seg(p, a1 - F, a1 + F));
        if (k === 1) aOut = p > a1 + F ? 0 : 1; // log end stays solid under the identical sawing disc
        var t;
        if (k === 0) t = p / (a1 + F);
        else if (k === 5) t = (p - (a0 - F)) / (1 - (a0 - F));
        else t = (p - (a0 - F)) / (a1 - a0 + 2 * F);
        out.push({ a: Math.min(aIn, aOut), t: clamp(t, 0, 1) });
      }
      return out;
    }

    // ---------- screen-space layers ----------
    function ambient(dt) {
      var bx0 = W * 0.92, by0 = -H * 0.05, bx1 = W * 0.18, by1 = H * 1.05;
      var nx = -(by1 - by0), ny = bx1 - bx0, nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
      var w0 = W * 0.06, w1 = W * 0.42;
      var gb = ctx.createLinearGradient(bx0, by0, bx1, by1);
      gb.addColorStop(0, 'rgba(232,211,176,.075)'); gb.addColorStop(1, 'rgba(232,211,176,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = gb;
      ctx.beginPath();
      ctx.moveTo(bx0 + nx * w0, by0 + ny * w0); ctx.lineTo(bx1 + nx * w1, by1 + ny * w1);
      ctx.lineTo(bx1 - nx * w1, by1 - ny * w1); ctx.lineTo(bx0 - nx * w0, by0 - ny * w0); ctx.closePath(); ctx.fill();
      if (reduce) return;
      for (var i = 0; i < parts.length; i++) {
        var q = parts[i];
        q.u += dt * 0.012 * q.sp; if (q.u > 1) { q.u = 0; q.v = Math.random() * 2 - 1; }
        var x = lerp(bx0, bx1, q.u), y = lerp(by0, by1, q.u), w = lerp(w0, w1, q.u);
        var vv = q.v + Math.sin(T * 0.4 + q.ph) * 0.08;
        x += nx * w * vv; y += ny * w * vv;
        var a = (0.18 + 0.22 * Math.sin(T * 1.3 + q.ph)) * (1 - Math.abs(vv)) * (1 - q.u * 0.6);
        if (a <= 0) continue;
        ctx.fillStyle = 'rgba(240,222,190,' + a + ')';
        ctx.beginPath(); ctx.arc(x, y, q.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    function vignette() {
      var g = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.3, W / 2, H * 0.45, Math.max(W, H) * 0.8);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.42)');
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    function photos(st) {
      var P = lay.photo, maxA = 0;
      for (var k = 0; k < 6; k++) {
        var a = st[k].a; if (a <= 0.001) continue;
        maxA = Math.max(maxA, a);
        var im = imgs[k];
        if (!im.complete || !im.naturalWidth) continue;
        var tt = st[k].t;
        var rv = k === 0 ? eo(Math.max(seg(cur, 0, 0.035), seg(intro, 0.35, 0.95))) : eo(seg(tt, 0.02, 0.32));
        if (reduce) rv = 1;
        if (rv <= 0) continue;
        ctx.save();
        ctx.globalAlpha = a;
        var top = P.y + P.h * (1 - rv);
        ctx.beginPath(); ctx.rect(P.x, top, P.w, P.y + P.h - top); ctx.clip();
        var z = 1.1 - 0.1 * eo(tt), iw = im.naturalWidth, ih = im.naturalHeight;
        var sc = Math.max(P.w / iw, P.h / ih) * z, dw = iw * sc, dh = ih * sc;
        ctx.drawImage(im, P.x + (P.w - dw) / 2, P.y + (P.h - dh) / 2, dw, dh);
        if (rv < 1) {
          var gf = ctx.createLinearGradient(0, top, 0, top + 26);
          gf.addColorStop(0, 'rgba(21,19,15,.95)'); gf.addColorStop(1, 'rgba(21,19,15,0)');
          ctx.fillStyle = gf; ctx.fillRect(P.x, top, P.w, 26);
          ctx.fillStyle = L(0.7); ctx.fillRect(P.x, top, P.w, 1);
        }
        var gc = ctx.createLinearGradient(0, P.y + P.h * 0.55, 0, P.y + P.h);
        gc.addColorStop(0, 'rgba(10,9,7,0)'); gc.addColorStop(1, 'rgba(10,9,7,.78)');
        ctx.fillStyle = gc; ctx.fillRect(P.x, P.y + P.h * 0.55, P.w, P.h * 0.45);
        ctx.globalAlpha = a * sm(rv * 1.5 - 0.5);
        ctx.font = '500 ' + (P.w < 170 ? 9.5 : 11) + 'px ' + MONO;
        ctx.fillStyle = L(0.95); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(PHOTOS[k][1], P.x + 9, P.y + P.h - 9, P.w - 18);
        ctx.restore();
      }
      // frame with corner ticks
      ctx.globalAlpha = Math.max(0.4, maxA);
      ctx.strokeStyle = L(0.28); ctx.lineWidth = 1;
      ctx.strokeRect(P.x + 0.5, P.y + 0.5, P.w - 1, P.h - 1);
      ctx.strokeStyle = L(0.75); ctx.beginPath();
      var c = 9;
      [[P.x, P.y, 1, 1], [P.x + P.w, P.y, -1, 1], [P.x, P.y + P.h, 1, -1], [P.x + P.w, P.y + P.h, -1, -1]].forEach(function (q) {
        ctx.moveTo(q[0] - q[2] * 4, q[1] + q[3] * 0); ctx.lineTo(q[0] + q[2] * c, q[1]);
        ctx.moveTo(q[0], q[1] - q[3] * 4); ctx.lineTo(q[0], q[1] + q[3] * c);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    function info(p, st) {
      var I = lay.info, P = lay.photo;
      if (I.w < 96) return;
      var idx = 0; for (var k = 1; k < 6; k++) if (p >= CUTS[k]) idx = k;
      var bot = P.y + P.h, gap = 4, sw = (I.w - gap * 5) / 6;
      ctx.globalAlpha = 1;
      for (k = 0; k < 6; k++) {
        var x = I.x + k * (sw + gap);
        ctx.fillStyle = L(0.18); ctx.fillRect(x, bot - 2, sw, 2);
        var f = p >= CUTS[k + 1] ? 1 : p <= CUTS[k] ? 0 : (p - CUTS[k]) / (CUTS[k + 1] - CUTS[k]);
        ctx.fillStyle = k === idx ? RUST : L(0.75); ctx.fillRect(x, bot - 2, sw * f, 2);
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = '500 11px ' + MONO; ctx.fillStyle = L(0.55);
      ctx.fillText((idx < 9 ? '0' : '') + (idx + 1) + ' / 06', I.x, bot - 34);
      ctx.font = '600 ' + (I.w < 150 ? 14 : 16) + 'px ' + MONO; ctx.fillStyle = L(0.95);
      ctx.fillText(NAMES[idx], I.x, bot - 13, I.w);
    }

    function render(dt) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1; ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
      ambient(dt);
      if (!disc || disc.key !== lay.s * dpr) buildDisc();
      var p = cur, st = sceneState(p);
      for (var k = 0; k < 6; k++) {
        if (st[k].a <= 0.001) continue;
        var cam = CAMS[k](st[k].t);
        ctx.save();
        ctx.translate(lay.cx, lay.cy); ctx.scale(lay.s * cam.z, lay.s * cam.z); ctx.translate(cam.x, cam.y);
        curS = lay.s * cam.z; SA = st[k].a;
        SCENES[k](st[k].t);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      vignette();
      photos(st);
      info(p, st);
    }

    function step(dt) {
      if (reduce) { cur = target; vel = 0; return; }
      if (dt > 0.2) { cur = target; vel = 0; return; } // long stall (background tab): jump
      var w = 20, n = Math.ceil(dt / (1 / 240)), h = dt / n;
      for (var i = 0; i < n; i++) { // semi-implicit substeps keep the critically damped spring stable
        vel += (w * w * (target - cur) - 2 * w * vel) * h;
        cur += vel * h;
      }
      cur = clamp(cur, 0, 1);
      if (Math.abs(target - cur) < 1e-4 && Math.abs(vel) < 1e-3) { cur = target; vel = 0; }
    }
    function frame(now) {
      raf = 0;
      if (destroyed) return;
      var raw = last ? (now - last) / 1000 : 1 / 60, dt = Math.min(0.05, raw);
      last = now; T += dt;
      if (intro < 1) { if (!introStart) introStart = now; intro = reduce ? 1 : Math.min(1, (now - introStart) / 1800); }
      if (playState) {
        if (!playState.start) playState.start = now;
        var e = (now - playState.start) / 1000 / playState.dur;
        target = clamp(e, 0, 1);
        if (e >= 1) playState = null;
      }
      step(raw > 0.2 ? raw : dt);
      render(dt);
      var moving = cur !== target || intro < 1;
      if (!paused && (!reduce || playState)) raf = requestAnimationFrame(frame);
      else if (moving && !paused) raf = requestAnimationFrame(frame);
      else last = 0;
    }
    function request() { if (!raf && !destroyed) raf = requestAnimationFrame(frame); }

    var ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', resize);
    if (mq && mq.addEventListener) mq.addEventListener('change', function (ev) { reduce = ev.matches; request(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(request);
    resize();

    return {
      setProgress: function (p) { target = clamp(+p || 0, 0, 1); playState = null; request(); },
      play: function (sec) { playState = { dur: Math.max(0.1, +sec || 8), start: 0 }; request(); },
      setPaused: function (b) { paused = !!b; if (!paused) { last = 0; request(); } },
      destroy: function () {
        destroyed = true; if (raf) cancelAnimationFrame(raf); raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      },
      _snap: function (p) { target = cur = clamp(+p || 0, 0, 1); vel = 0; intro = 1; introStart = 1; render(0); },
      _debug: function () { return { p: cur, target: target, intro: intro, paused: paused, raf: !!raf }; }
    };
  }

  window.BEStage = { mount: mount };
})();
