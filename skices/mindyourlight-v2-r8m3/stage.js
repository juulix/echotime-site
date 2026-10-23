/* Mind Your Light — "Svece → Vāze" motion stage.
 * Single canvas 2D renderer. World units = millimetres, origin at the jar's
 * base centre, y grows downward (canvas convention).
 *
 * API: window.MYLStage.mount(el) -> { setProgress(p), play(sec), setPaused(b), destroy() }
 *
 * Timeline (progress p):
 *   0.00–0.40 lit, burning down      0.40–0.50 extinguish + smoke
 *   0.50–0.64 wax lifts out, night → day      0.64–0.68 empty jar
 *   0.68–0.76 flower insert lands     0.76–0.97 stems, leaves, roses      0.97–1 hold
 */
(function () {
  'use strict';

  // ---------- math ----------
  var PI = Math.PI, TAU = PI * 2;
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function seg(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function inOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function inOutSine(t) { return -(Math.cos(PI * t) - 1) / 2; }
  function outCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function outBack(t, s) { s = s || 1.5; var u = t - 1; return 1 + (s + 1) * u * u * u + s * u * u; }
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function noise(x) { var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u); }
  function fbm(x) { return noise(x) * 0.5 + noise(x * 2.03 + 17.1) * 0.3 + noise(x * 4.11 + 41.7) * 0.2; }
  function rng(seed) { seed = (Math.abs(seed | 0) % 2147483646) + 1; return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function mixc(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : +clamp(a, 0, 1).toFixed(4)) + ')'; }

  // ---------- product geometry (mm) ----------
  var R = 52.5;          // jar outer radius (10.5 cm Ø)
  // the real jar (img/jar-body.png): straight walls x 22…801 px over a 964 px tall body
  var JP = { w: 823, h: 964, wallL: 22, wallR: 801 };
  var H = 2 * R * JP.h / (JP.wallR - JP.wallL);   // ≈ 130 mm, proportions of the photographed jar
  var K = 0.16;          // ellipse ratio (camera slightly above)
  var RY = R * K;
  var RIM = 6;           // beaded rim band
  var BASE = 20;         // thick amber base band
  var RW = 46.5;         // wax pillar radius
  var WAX_FLOOR = -BASE + 2;
  var WAX_TOP0 = -119, WAX_TOP1 = -46;
  var HORIZON = -64;
  var WATER = -92;
  var WICKS = [{ x: -17, z: 7 }, { x: 17, z: 7 }, { x: 0, z: -11 }];
  var TOP_SAFE = 70, BOT_SAFE = 14;

  var NIGHT_BG = [20, 11, 12], DAY_WALL_L = [247, 240, 232], DAY_WALL_D = [229, 216, 201];
  var DAY_TABLE = [238, 228, 216], DAY_TABLE_D = [222, 207, 191];

  // ---------- pressed-glass relief: daisy medallions in an ogee/diamond lattice ----------
  var CW = 8.9, CH = 10.6;                 // half width / half height of one cell
  var CELLS = (function () {
    var out = [], dth = 2 * CW / R, row = 0;
    for (var h = BASE + CH * 0.95; h <= H - RIM - CH * 0.6; h += CH, row++) {
      var off = (row % 2) * dth / 2;
      for (var th = -PI + off; th <= PI; th += dth) out.push({ th: th, h: h, c: Math.cos(th), s: Math.sin(th) });
    }
    return out;
  })();
  function cellOutline(c) {
    c.beginPath();
    c.moveTo(0, -CH);
    c.bezierCurveTo(CW * 0.18, -CH * 0.62, CW * 1.04, -CH * 0.6, CW, 0);
    c.bezierCurveTo(CW * 1.04, CH * 0.6, CW * 0.18, CH * 0.62, 0, CH);
    c.bezierCurveTo(-CW * 0.18, CH * 0.62, -CW * 1.04, CH * 0.6, -CW, 0);
    c.bezierCurveTo(-CW * 1.04, -CH * 0.6, -CW * 0.18, -CH * 0.62, 0, -CH);
    c.closePath();
  }
  function daisy(c, mode, a) {
    for (var i = 0; i < 10; i++) {
      var an = i / 10 * TAU;
      c.save(); c.rotate(an); c.translate(0, -3.15);
      c.beginPath(); c.ellipse(0, 0, 0.95, 2.05, 0, 0, TAU);
      if (mode === 'fill') c.fill(); else c.stroke();
      c.restore();
    }
    c.beginPath(); c.arc(0, 0, 1.15, 0, TAU);
    if (mode === 'fill') c.fill(); else c.stroke();
  }

  // flower-insert holes (disc local x,z in mm)
  var HOLES = (function () {
    var rnd = rng(9137), hs = [{ x: 0, z: 0, r: 8.5 }];
    var i, a;
    for (i = 0; i < 6; i++) { a = i / 6 * TAU + 0.3; hs.push({ x: Math.cos(a) * 21, z: Math.sin(a) * 21, r: 6.2 }); }
    for (i = 0; i < 11; i++) { a = i / 11 * TAU + 0.1; hs.push({ x: Math.cos(a) * 38, z: Math.sin(a) * 38, r: 5 }); }
    for (var tries = 0; tries < 900 && hs.length < 46; tries++) {
      var rr = 1.8 + rnd() * 2.2, d = Math.sqrt(rnd()) * (R - 4 - rr), ang = rnd() * TAU;
      var nx = Math.cos(ang) * d, nz = Math.sin(ang) * d, ok = true;
      for (var j = 0; j < hs.length; j++) { var dx = hs[j].x - nx, dz = hs[j].z - nz; if (Math.sqrt(dx * dx + dz * dz) < hs[j].r + rr + 1.6) { ok = false; break; } }
      if (ok) hs.push({ x: nx, z: nz, r: rr });
    }
    return hs;
  })();

  // Final styled photo (photo px). plate + flowers (at fl.x, fl.y) recreates final-photo exactly.
  var FP = {
    w: 1080, h: 1616, region: [150, 380, 1000, 1420],
    jar: { x0: 546, x1: 762, rim: 1080, bot: 1340 },
    fl: { x: 216, y: 448, w: 729, h: 727 },
    pivot: [654, 1080],
    // c = centre, r = reveal radius, t = start progress; amaranthus hangs, so it wipes downwards
    items: [
      { c: [430, 800], r: 60, t: 0.832 },               // protea leaves
      { c: [535, 935], r: 62, t: 0.840 },               // yellow protea
      { c: [650, 1045], r: 62, t: 0.848 },              // yellow protea
      { c: [695, 890], r: 58, t: 0.856 },               // dark protea
      { c: [605, 720], r: 70, t: 0.862 },               // carnation
      { c: [785, 1005], r: 60, t: 0.868 },              // dark carnation
      { c: [470, 625], r: 70, t: 0.872 },               // carnation
      { c: [275, 600], r: 48, t: 0.874 },               // orange slices, top → down along the arc
      { c: [515, 510], r: 70, t: 0.880 },               // carnation
      { c: [335, 700], r: 48, t: 0.882 },
      { c: [370, 810], r: 48, t: 0.890 },
      { c: [405, 925], r: 48, t: 0.898 },
      { c: [865, 960], r: 85, t: 0.895, kind: 'down', d: 0.075 }   // amaranthus
    ]
  };

  // ---------- timeline ----------
  function timeline(p) {
    var T = {};
    T.burn = inOutSine(seg(p, 0.02, 0.40));
    T.waxTop = lerp(WAX_TOP0, WAX_TOP1, T.burn);
    T.ext = WICKS.map(function (w, i) { return 0.40 + i * 0.014; });
    T.flames = T.ext.map(function (e) { return 1 - smooth(seg(p, e, e + 0.025)); });
    var avg = (T.flames[0] + T.flames[1] + T.flames[2]) / 3;
    T.glowRaw = Math.pow(avg, 1.6);
    T.lift = inOutCubic(seg(p, 0.50, 0.62));
    T.waxAlpha = 1 - smooth(seg(p, 0.575, 0.62));
    T.day = inOutSine(seg(p, 0.50, 0.64));
    T.empty = smooth(seg(p, 0.55, 0.64));
    var d = seg(p, 0.68, 0.76);
    T.discY = lerp(-170, 0, outBack(d, 1.1));
    T.discTilt = lerp(0.5, 0, outCubic(d)) + Math.sin(d * PI * 2.2) * 0.035 * (1 - d);
    T.discAlpha = smooth(seg(p, 0.68, 0.70));
    T.water = outCubic(seg(p, 0.70, 0.80));
    // ending: match cut, relight, dissolves, bloom from the real photo
    T.match = inOutCubic(seg(p, 0.64, 0.78));
    T.relight = smooth(seg(p, 0.64, 0.76));
    T.room = inOutSine(seg(p, 0.74, 0.82));
    T.jarX = inOutSine(seg(p, 0.78, 0.84));
    T.finish = smooth(seg(p, 0.76, 0.86));
    T.wipe = inOutSine(seg(p, 0.82, 0.88));
    T.items = FP.items.map(function (it) {
      var d = it.d || 0.065;
      return { rb: outBack(seg(p, it.t, it.t + d * 0.85), 1.3), rs: it.kind === 'down' ? inOutSine(seg(p, it.t, it.t + d)) : outBack(seg(p, it.t + 0.012, it.t + d), 1.25), s: seg(p, it.t + 0.012, it.t + d) };
    });
    T.flScale = lerp(0.96, 1, outBack(seg(p, 0.82, 0.97), 1.4));
    T.push = inOutSine(seg(p, 0, 0.4));
    return T;
  }

  // ---------- path helpers ----------
  function frontPath(c, top, bot) {
    c.beginPath();
    c.moveTo(R, top);
    c.ellipse(0, top, R, RY, 0, 0, PI, false);
    c.lineTo(-R, bot);
    c.ellipse(0, bot, R, RY, 0, PI, 0, true);
    c.closePath();
  }
  function silhouettePath(c) {
    c.beginPath();
    c.moveTo(R, -H);
    c.ellipse(0, -H, R, RY, 0, 0, PI, true);
    c.lineTo(-R, -3);
    c.quadraticCurveTo(-R, 0, -R + 3, 0.5);
    c.ellipse(0, 0, R - 3, RY * 0.95, 0, PI, 0, true);
    c.quadraticCurveTo(R, 0, R, -3);
    c.closePath();
  }

  // ---------- sprites (glass, pre-rendered once per size) ----------
  var SPR = { x: -R - 3, y: -H - RY - 4, w: 2 * R + 6, h: H + 2 * RY + 8 };
  function makeCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

  function eachCell(front, fn) {
    CELLS.forEach(function (cl) {
      var c = cl.c; if (c < 0.07) return;
      var rr = front ? R * 0.985 : R * 0.93;
      var x = rr * cl.s, y = front ? -cl.h + RY * c : -cl.h - RY * 0.93 * c;
      fn(x, y, c, cl);
    });
  }

  function buildSprites(S) {
    var W = SPR.w * S, Hh = SPR.h * S;
    var body = makeCanvas(W, Hh), relief = makeCanvas(W, Hh), back = makeCanvas(W, Hh), day = makeCanvas(W, Hh), night = makeCanvas(W, Hh);
    function prep(cv) { var c = cv.getContext('2d'); c.setTransform(S, 0, 0, S, -SPR.x * S, -SPR.y * S); return c; }
    function bandClip(c) { // patterned zone between rim band and base band (front wall)
      frontPath(c, -H + RIM, -BASE); c.clip();
    }

    // --- body tint (multiply): the amber of the glass itself ---
    var c = prep(body);
    frontPath(c, -H, 0);
    var g = c.createLinearGradient(-R, 0, R, 0);
    g.addColorStop(0, '#b45a22'); g.addColorStop(0.07, '#d98340'); g.addColorStop(0.22, '#f5bd85');
    g.addColorStop(0.42, '#fcd3a5'); g.addColorStop(0.62, '#f8c592'); g.addColorStop(0.86, '#e08d4a'); g.addColorStop(0.95, '#c4682a'); g.addColorStop(1, '#a04a1c');
    c.fillStyle = g; c.fill();

    // --- relief (multiply): pattern, bands, base, refraction at the edges ---
    c = prep(relief);
    c.save(); bandClip(c);
    eachCell(true, function (x, y, k) {
      c.save(); c.translate(x, y); c.scale(k, 1);
      c.lineWidth = 0.55; c.strokeStyle = 'rgba(150,62,20,' + (0.5 * Math.pow(k, 0.7)) + ')';
      cellOutline(c); c.stroke();
      c.lineWidth = 0.3; c.strokeStyle = 'rgba(170,80,30,' + (0.35 * k) + ')';
      c.save(); c.scale(0.86, 0.86); cellOutline(c); c.stroke(); c.restore();
      c.fillStyle = 'rgba(190,95,40,' + (0.28 * k) + ')'; daisy(c, 'fill');
      c.lineWidth = 0.3; c.strokeStyle = 'rgba(140,55,18,' + (0.45 * k) + ')'; daisy(c, 'stroke');
      c.restore();
    });
    c.restore();
    // base band: thick pressed glass, deeper amber
    c.save(); frontPath(c, -BASE, 0); c.clip();
    var gb = c.createLinearGradient(0, -BASE, 0, RY);
    gb.addColorStop(0, 'rgba(200,110,50,0.15)'); gb.addColorStop(0.4, 'rgba(175,85,32,0.5)'); gb.addColorStop(1, 'rgba(120,50,18,0.75)');
    c.fillStyle = gb; c.fillRect(-R, -BASE - 2, 2 * R, BASE + RY + 4);
    c.restore();
    c.lineWidth = 0.6; c.strokeStyle = 'rgba(150,62,20,0.6)';
    c.beginPath(); c.ellipse(0, -H + RIM, R, RY, 0, 0, PI); c.stroke();
    c.beginPath(); c.ellipse(0, -BASE, R, RY, 0, 0, PI); c.stroke();
    var ge = c.createLinearGradient(-R, 0, R, 0);
    ge.addColorStop(0, 'rgba(90,30,8,0.7)'); ge.addColorStop(0.045, 'rgba(120,45,12,0.25)'); ge.addColorStop(0.09, 'rgba(255,255,255,0)');
    ge.addColorStop(0.91, 'rgba(255,255,255,0)'); ge.addColorStop(0.955, 'rgba(120,45,12,0.3)'); ge.addColorStop(1, 'rgba(80,25,6,0.8)');
    frontPath(c, -H, 0); c.fillStyle = ge; c.fill();

    // --- back wall relief seen through the jar (multiply) ---
    c = prep(back);
    c.save(); silhouettePath(c); c.clip();
    c.beginPath(); c.rect(-R, -H + RIM - RY, 2 * R, H - RIM - BASE + RY * 0.2); c.clip();
    eachCell(false, function (x, y, k) {
      c.save(); c.translate(x, y); c.scale(k * 0.93, 1);
      c.lineWidth = 0.5; c.strokeStyle = 'rgba(160,75,28,' + (0.38 * k) + ')'; cellOutline(c); c.stroke();
      c.fillStyle = 'rgba(200,110,50,' + (0.22 * k) + ')'; daisy(c, 'fill');
      c.restore();
    });
    c.restore();
    // inner floor
    c.fillStyle = 'rgba(214,140,80,0.45)'; c.beginPath(); c.ellipse(0, -BASE + 1, R - 4, (R - 4) * K, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(170,80,30,0.5)'; c.lineWidth = 0.6; c.beginPath(); c.ellipse(0, -BASE + 1, R - 4, (R - 4) * K, 0, PI, TAU); c.stroke();
    // back rim band lines
    c.strokeStyle = 'rgba(170,80,30,0.45)'; c.lineWidth = 0.5;
    c.beginPath(); c.ellipse(0, -H + RIM, R - 2, RY * 0.95, 0, PI, TAU); c.stroke();

    // --- day highlights (source-over) ---
    c = prep(day);
    c.save(); frontPath(c, -H, 0); c.clip();
    var gs = c.createLinearGradient(-R, 0, R, 0);
    gs.addColorStop(0.0, 'rgba(255,255,255,0)'); gs.addColorStop(0.13, 'rgba(255,250,240,0.0)');
    gs.addColorStop(0.17, 'rgba(255,250,240,0.5)'); gs.addColorStop(0.2, 'rgba(255,252,246,0.62)'); gs.addColorStop(0.235, 'rgba(255,250,240,0.16)');
    gs.addColorStop(0.3, 'rgba(255,250,240,0.0)'); gs.addColorStop(0.86, 'rgba(255,250,240,0)'); gs.addColorStop(0.9, 'rgba(255,250,240,0.3)');
    gs.addColorStop(0.92, 'rgba(255,250,240,0.0)');
    c.fillStyle = gs; c.fillRect(-R, -H - RY, 2 * R, H + 2 * RY);
    c.restore();
    c.save(); bandClip(c);
    eachCell(true, function (x, y, k, cl) {
      var side = clamp(0.6 - cl.s * 0.55, 0.12, 1), a = side * Math.pow(k, 0.5);
      c.save(); c.translate(x - 0.35 * k, y - 0.4); c.scale(k, 1);
      c.lineWidth = 0.35; c.strokeStyle = 'rgba(255,252,246,' + (0.55 * a) + ')';
      c.beginPath(); c.moveTo(-CW, 0); c.bezierCurveTo(-CW * 1.04, -CH * 0.6, -CW * 0.18, -CH * 0.62, 0, -CH); c.stroke();
      c.beginPath(); c.moveTo(CW, 0); c.bezierCurveTo(CW * 1.04, CH * 0.6, CW * 0.18, CH * 0.62, 0, CH); c.stroke();
      c.lineWidth = 0.22; c.strokeStyle = 'rgba(255,252,246,' + (0.45 * a) + ')'; daisy(c, 'stroke');
      c.restore();
    });
    c.restore();
    c.lineWidth = 0.9; c.strokeStyle = 'rgba(255,252,245,0.85)';
    c.beginPath(); c.ellipse(0, -H, R - 0.3, RY - 0.2, 0, 0.05 * PI, 0.95 * PI); c.stroke();
    c.lineWidth = 0.5; c.strokeStyle = 'rgba(255,252,245,0.55)';
    c.beginPath(); c.ellipse(0, -H, R - 2, RY - 0.8, 0, 1.05 * PI, 1.95 * PI); c.stroke();
    c.beginPath(); c.ellipse(0, -H + RIM, R, RY, 0, 0.15 * PI, 0.85 * PI); c.stroke();
    c.beginPath(); c.ellipse(0, -BASE - 0.5, R, RY, 0, 0.15 * PI, 0.85 * PI); c.stroke();
    c.lineWidth = 0.7; c.strokeStyle = 'rgba(255,250,240,0.45)';
    c.beginPath(); c.ellipse(0, -1.5, R - 2, RY * 0.95, 0, 0.1 * PI, 0.9 * PI); c.stroke();

    // --- night: relief lit from inside (lighter) ---
    c = prep(night);
    c.save(); bandClip(c);
    eachCell(true, function (x, y, k) {
      var a = Math.pow(k, 1.5);
      c.save(); c.translate(x, y); c.scale(k, 1);
      c.lineWidth = 0.7; c.strokeStyle = 'rgba(255,180,100,' + (0.55 * a) + ')'; cellOutline(c); c.stroke();
      c.fillStyle = 'rgba(255,205,140,' + (0.5 * a) + ')'; daisy(c, 'fill');
      c.fillStyle = 'rgba(255,235,190,' + (0.6 * a) + ')'; c.beginPath(); c.arc(0, 0, 1.1, 0, TAU); c.fill();
      c.restore();
    });
    c.restore();
    c.lineWidth = 0.8; c.strokeStyle = 'rgba(255,170,90,0.6)';
    c.beginPath(); c.ellipse(0, -H, R - 0.3, RY - 0.2, 0, 0, PI); c.stroke();
    c.lineWidth = 1.4; c.strokeStyle = 'rgba(255,140,60,0.35)';
    c.beginPath(); c.moveTo(-R + 0.7, -H); c.lineTo(-R + 0.7, -4); c.moveTo(R - 0.7, -H); c.lineTo(R - 0.7, -4); c.stroke();

    return { body: body, relief: relief, back: back, day: day, night: night, nightTmp: makeCanvas(W, Hh) };
  }

  function makeGrain() {
    var cv = makeCanvas(160, 160), c = cv.getContext('2d'), d = c.createImageData(160, 160), r = rng(77);
    for (var i = 0; i < d.data.length; i += 4) { var v = 110 + r() * 145 | 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    c.putImageData(d, 0, 0); return cv;
  }

  // ---------- mount ----------
  function mount(el, opts) {
    opts = opts || {};
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    el.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var grain = makeGrain(), grainPat = null;
    var puff = makeCanvas(64, 64); (function () { var c = puff.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(232,222,214,1)'); g.addColorStop(0.35, 'rgba(232,222,214,0.55)'); g.addColorStop(0.7, 'rgba(232,222,214,0.14)'); g.addColorStop(1, 'rgba(232,222,214,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64); })();

    var curS = 1, cw = 0, ch = 0, dpr = 1, sprites = null, spriteS = 0;
    var target = 0, pos = 0, vel = 0;
    // ignition gate (opt-in): lit === false starts with clean wicks in dusk light until ignite()
    var ign = { lit: opts.lit !== false, w: [1, 1, 1], light: 1, boost: [0, 0, 0], sparks: [], flares: [0, 0, 0], anim: null };
    if (!ign.lit) { ign.w = [0, 0, 0]; ign.light = 0; }
    var IGN_ORDER = [2, 0, 1], IGN_GAP = 0.3, IGN_DUR = 2.4;
    var playing = null, paused = false, raf = 0, last = 0, clock = 0, destroyed = false;
    var motes = []; (function () { var r = rng(4242); for (var i = 0; i < 46; i++) motes.push({ x: (r() - 0.5) * 300, y: -20 - r() * 300, s: 0.35 + r() * 0.9, k: r() * 100 }); })();

    // scale so the box fits the container minus the header safe zone; jar sized by min(width, height)
    function fit(boxTop, boxBot, boxW) {
      var top = Math.min(TOP_SAFE, ch * 0.2), avail = Math.max(40, ch - top - BOT_SAFE);
      var s = Math.min(cw / boxW, avail / (boxBot - boxTop)) * 0.96;
      var cy = top + (avail - s * (boxBot - boxTop)) / 2 - s * boxTop;
      return { s: s, cy: cy };
    }
    function resize() {
      var r = el.getBoundingClientRect();
      cw = Math.max(1, r.width); ch = Math.max(1, r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      var sMax = fit(-190, 28, 268).s * 1.06 * dpr;
      if (!sprites || Math.abs(sMax - spriteS) / spriteS > 0.08) { spriteS = sMax; sprites = buildSprites(sMax); }
      grainPat = null;
      if (paused || !raf) draw();
    }
    var ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', resize);

    // ---------- draw ----------
    function draw() {
      var p = clamp(pos, 0, 1), t = reduce ? 3.7 : clock;
      var T = timeline(p);
      if (ign.w[0] < 1 || ign.w[1] < 1 || ign.w[2] < 1) {
        T.flames = T.flames.map(function (f, i) { return f * ign.w[i]; });
        T.glowRaw = Math.pow((T.flames[0] + T.flames[1] + T.flames[2]) / 3, 1.6);
      }
      // dusk ambient while unlit (fades as the room light rises; only matters at night)
      var dusk = (1 - ign.light) * (1 - T.day);
      var flick = reduce ? 0.5 : fbm(t * 4.2);
      var glow = T.glowRaw * (0.94 + 0.12 * flick);
      var night = 1 - T.day;

      // camera A: the jar story; camera B: the canvas jar sits exactly on the photo jar
      var F = fit(-190, 28, 268);
      var sA = F.s * (1 + 0.05 * T.push), cyA = F.cy + (F.s - sA) * (-190 + 28) / 2;
      var PF = photoFit(), J = FP.jar;
      var sB = (J.x1 - J.x0) * PF.ps / (2 * R), syB = (J.bot - J.rim) * PF.ps / (H * sB);
      var cxB = PF.ox + (J.x0 + J.x1) / 2 * PF.ps, cyB = PF.oy + J.bot * PF.ps - RY * sB * syB * 0.5;
      var m = T.match;
      var s = Math.exp(lerp(Math.log(sA), Math.log(sB), m)), sy = lerp(1, syB, m);
      var cx = lerp(cw / 2, cxB, m), cy = lerp(cyA, cyB, m);
      if (fin.flowers) prepFlowers(clamp(PF.ps * dpr, 0.3, 1));   // async; swaps in when ready
      var imgsReady = !!(fin.plate && fin.photo);
      // end state: the photo itself, pixel for pixel, with a barely-there drift
      var allOpen = T.items.every(function (h) { return h.s >= 1; });
      if (imgsReady && fin.ready && p >= 0.97 && allOpen) {
        if (fin.kbStart < 0) fin.kbStart = clock;
        var kb = reduce ? 0 : 0.01 * (1 - Math.cos((clock - fin.kbStart) * TAU / 40)) / 2;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.translate(cw / 2, ch / 2); ctx.scale(1 + kb, 1 + kb); ctx.translate(-cw / 2, -ch / 2);
        drawPhotoLayer(ctx, fin.photo, PF);
        return;
      }
      fin.kbStart = -1;
      var vx0 = -cx / s, vx1 = (cw - cx) / s, vy0 = -cy / (s * sy), vy1 = (ch - cy) / (s * sy);
      curS = s * dpr;
      function world() { ctx.setTransform(dpr * s, 0, 0, dpr * s * sy, dpr * cx, dpr * cy); }
      var tone = fin.tone, RL = tone ? T.relight : 0;
      var roomDone = imgsReady && T.room >= 1, jarGone = imgsReady && T.jarX >= 1;
      var flameY = T.waxTop - 12;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      world();

      // ---- background ----
      function tableFill(c0, c1) {
        var gb = ctx.createLinearGradient(0, HORIZON - 12, 0, HORIZON + 12);
        gb.addColorStop(0, rgba(c0, 0)); gb.addColorStop(1, rgba(c0, 1));
        ctx.fillStyle = gb; ctx.fillRect(vx0, HORIZON - 12, vx1 - vx0, 24.5);
        var gt = ctx.createLinearGradient(0, HORIZON + 12, 0, Math.max(vy1, HORIZON + 40));
        gt.addColorStop(0, rgba(c0)); gt.addColorStop(1, rgba(c1));
        ctx.fillStyle = gt; ctx.fillRect(vx0, HORIZON + 12, vx1 - vx0, Math.max(1, vy1 - HORIZON - 12));
      }
      if (night > 0.001) {
        ctx.fillStyle = rgba(NIGHT_BG); ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
        tableFill([28, 14, 14], [12, 6, 7]);
        if (dusk > 0.002) {
          // quiet window light from the upper left: cool at the source, warming as it falls
          var gk = ctx.createRadialGradient(vx0 + (vx1 - vx0) * 0.08, vy0, 0, vx0 + (vx1 - vx0) * 0.2, vy0 + (vy1 - vy0) * 0.25, Math.max(vx1 - vx0, vy1 - vy0) * 0.95);
          gk.addColorStop(0, 'rgba(122,120,136,' + (0.42 * dusk) + ')'); gk.addColorStop(0.35, 'rgba(104,84,84,' + (0.26 * dusk) + ')');
          gk.addColorStop(0.75, 'rgba(60,40,38,' + (0.12 * dusk) + ')'); gk.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gk; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
          // a soft sheen on the table where that light lands
          ctx.save(); ctx.translate(-40, 6); ctx.scale(1, 0.22);
          var gt2 = ctx.createRadialGradient(0, 0, 0, 0, 0, 230);
          gt2.addColorStop(0, 'rgba(110,96,100,' + (0.22 * dusk) + ')'); gt2.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gt2; ctx.beginPath(); ctx.arc(0, 0, 230, 0, TAU); ctx.fill();
          ctx.restore(); ctx.globalCompositeOperation = 'source-over';
        }
        if (glow > 0.002) {
          ctx.globalCompositeOperation = 'lighter';
          var gw = ctx.createRadialGradient(0, flameY, 0, 0, flameY, 330);
          gw.addColorStop(0, 'rgba(150,62,22,' + (0.62 * glow) + ')'); gw.addColorStop(0.3, 'rgba(92,34,16,' + (0.42 * glow) + ')');
          gw.addColorStop(0.65, 'rgba(40,14,9,' + (0.25 * glow) + ')'); gw.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gw; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
          ctx.save(); ctx.translate(0, 2); ctx.scale(1, 0.24);
          var gp = ctx.createRadialGradient(0, 0, 0, 0, 0, 260);
          gp.addColorStop(0, 'rgba(255,150,70,' + (0.42 * glow) + ')'); gp.addColorStop(0.35, 'rgba(190,80,30,' + (0.2 * glow) + ')'); gp.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gp; ctx.beginPath(); ctx.arc(0, 0, 260, 0, TAU); ctx.fill();
          ctx.restore();
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      if (T.day > 0.001) {
        ctx.globalAlpha = T.day;
        var gwall = ctx.createLinearGradient(vx0, vy0, vx1 * 0.6, HORIZON);
        gwall.addColorStop(0, rgba(RL ? mixc(DAY_WALL_L, tone.wallL, RL) : DAY_WALL_L)); gwall.addColorStop(1, rgba(RL ? mixc(DAY_WALL_D, tone.wallD, RL) : DAY_WALL_D));
        ctx.fillStyle = gwall; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
        tableFill(RL ? mixc(DAY_TABLE, tone.top, RL) : DAY_TABLE, RL ? mixc(DAY_TABLE_D, tone.low, RL) : DAY_TABLE_D);
        // window light on the wall from the upper left
        ctx.globalCompositeOperation = 'lighter';
        for (var wi = 0; wi < 2; wi++) {
          var ox = -210 + wi * 120;
          for (var k = 0; k < 9; k++) {
            var gsh = ctx.createLinearGradient(0, -420, 0, HORIZON);
            gsh.addColorStop(0, 'rgba(255,248,236,0)'); gsh.addColorStop(0.35, 'rgba(255,248,236,' + (0.026 * T.day * (1 - RL)).toFixed(4) + ')'); gsh.addColorStop(1, 'rgba(255,248,236,0)');
            ctx.fillStyle = gsh;
            var sp = k * 4.5;
            ctx.beginPath();
            ctx.moveTo(ox - sp, -420 - sp); ctx.lineTo(ox + 95 + sp, -420 - sp);
            ctx.lineTo(ox + 175 + sp, HORIZON + sp * 0.5); ctx.lineTo(ox + 70 - sp, HORIZON + sp * 0.5);
            ctx.closePath(); ctx.fill();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        var gh = ctx.createLinearGradient(0, HORIZON - 10, 0, HORIZON + 22);
        gh.addColorStop(0, 'rgba(150,120,95,0)'); gh.addColorStop(0.45, 'rgba(150,120,95,0.09)'); gh.addColorStop(1, 'rgba(150,120,95,0)');
        ctx.fillStyle = gh; ctx.fillRect(vx0, HORIZON - 10, vx1 - vx0, 32);
        ctx.globalAlpha = 1;
      }
      var dawn = Math.sin(T.day * PI);
      if (dawn > 0.01) {
        ctx.globalCompositeOperation = 'soft-light';
        var gdw = ctx.createRadialGradient(vx0, vy0, 0, vx0, vy0, (vx1 - vx0) * 1.3);
        gdw.addColorStop(0, 'rgba(255,180,120,' + (0.55 * dawn) + ')'); gdw.addColorStop(1, 'rgba(210,130,90,' + (0.3 * dawn) + ')');
        ctx.fillStyle = gdw; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
        ctx.globalCompositeOperation = 'source-over';
      }

      // ---- table shadows ----
      ctx.save(); ctx.translate(2, 1); ctx.scale(1, K);
      var gcs = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.35);
      gcs.addColorStop(0, 'rgba(40,18,10,' + (0.42 + 0.2 * night) + ')'); gcs.addColorStop(1, 'rgba(40,18,10,0)');
      ctx.fillStyle = gcs; ctx.beginPath(); ctx.arc(0, 0, R * 1.35, 0, TAU); ctx.fill();
      ctx.restore();
      if (T.day > 0.01) {
        ctx.globalCompositeOperation = 'multiply';
        for (var k2 = 0; k2 <= 36; k2++) {
          var u = k2 / 36;
          ctx.save(); ctx.translate(170 * u + 6, -0.3 * 170 * u);
          ctx.scale(1, K * (1 + u * 0.4));
          ctx.fillStyle = 'rgba(150,118,92,' + (0.04 * (1 - u * 0.85) * T.day).toFixed(4) + ')';
          ctx.beginPath(); ctx.arc(0, 0, R * (1 + u * 0.5), 0, TAU); ctx.fill();
          ctx.restore();
        }
        // soft amber light thrown through the glass (no hot core)
        ctx.globalCompositeOperation = 'source-over';
        ctx.save(); ctx.translate(80, -18); ctx.rotate(-0.22); ctx.scale(1, 0.3);
        var gca = ctx.createRadialGradient(0, 0, 0, 0, 0, 58);
        gca.addColorStop(0, 'rgba(236,150,80,' + (0.16 * T.day * (1 - RL)) + ')'); gca.addColorStop(1, 'rgba(236,150,80,0)');
        ctx.fillStyle = gca; ctx.beginPath(); ctx.arc(0, 0, 56, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
      }

      var SX = SPR.x, SY = SPR.y, SW = SPR.w, SH = SPR.h;
      // ---- room dissolves into the photo plate (soft radial gradient from the jar outwards) ----
      if (imgsReady && T.room > 0) {
        var jx = cxB, jy = cyB - (J.bot - J.rim) * PF.ps * 0.5, diag = Math.hypot(Math.max(jx, cw - jx), Math.max(jy, ch - jy));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (roomDone) drawPhotoLayer(ctx, fin.plate, PF);
        else {
          var dc = screenCanvas('a');
          drawPhotoLayer(dc, fin.plate, PF);
          dc.globalCompositeOperation = 'destination-in';
          var rr = lerp(1, diag * 1.9, T.room);
          var gd = dc.createRadialGradient(jx, jy, 0, jx, jy, rr);
          gd.addColorStop(0, 'rgba(0,0,0,1)'); gd.addColorStop(0.45, 'rgba(0,0,0,1)'); gd.addColorStop(1, 'rgba(0,0,0,0)');
          dc.fillStyle = gd; dc.fillRect(0, 0, cw, ch);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(dc.canvas, 0, 0);
        }
        world();
      }
      if (!jarGone) {

      // ---- jar: back wall ----
      ctx.globalCompositeOperation = 'multiply';
      if (jarL.ready) {
        ctx.globalAlpha = lerp(0.35, 0.28, T.empty); ctx.drawImage(jarL.back, jarL.x, jarL.y, jarL.w, jarL.h); ctx.globalAlpha = 1;
        // the opening: looking down into the empty jar — far inner wall warm amber, shadowed towards the near rim
        ctx.save(); ctx.beginPath(); ctx.ellipse(0, -H, R - 1.2, RY - 0.5, 0, 0, TAU); ctx.clip();
        var gop = ctx.createLinearGradient(0, -H - RY, 0, -H + RY);
        var fo = clamp(Math.max(T.day, glow * 0.85, dusk * 0.3), 0, 1), dk = [26, 14, 11];
        gop.addColorStop(0, rgba(mixc(dk, [222, 160, 100], fo))); gop.addColorStop(0.55, rgba(mixc(dk, [170, 104, 58], fo))); gop.addColorStop(1, rgba(mixc(dk, [104, 58, 30], fo)));
        ctx.fillStyle = gop; ctx.fillRect(-R, -H - RY, 2 * R, 2 * RY);
        ctx.restore();
      }
      else {
        silhouettePath(ctx); ctx.fillStyle = 'rgba(246,196,140,' + lerp(0.55, 0.2, T.empty) + ')'; ctx.fill();
        ctx.globalAlpha = lerp(0.35, 1, T.empty);
        ctx.drawImage(sprites.back, SX, SY, SW, SH);
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
      if (jarL.ready) {
        softLip(R - 1.5, RY - 0.6, PI, TAU, T.day > 0.5 ? [170, 90, 40] : [255, 160, 80], 0.18 + 0.22 * Math.max(T.day, glow), 0.8);
        if (T.day > 0.01) softLip(R - 0.6, RY - 0.25, PI * 1.02, PI * 1.98, [255, 246, 232], 0.5 * T.day, 0.9);
      } else {
        ctx.strokeStyle = 'rgba(' + (T.day > 0.5 ? '170,90,40' : '255,160,80') + ',' + (0.25 + 0.3 * Math.max(T.day, glow)) + ')';
        ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(0, -H, R - 1.5, RY - 0.6, 0, PI, TAU); ctx.stroke();
      }
      if (T.empty > 0.01) { // inner floor catches light
        ctx.strokeStyle = 'rgba(255,248,236,' + (0.4 * T.empty) + ')'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.ellipse(0, -BASE + 1, R - 4, (R - 4) * K, 0, 0.1 * PI, 0.9 * PI); ctx.stroke();
      }

      // ---- water ----
      var wl = lerp(-BASE, WATER, T.water);
      if (T.water > 0.001) {
        ctx.save(); frontPath(ctx, wl, -BASE + 2); ctx.clip();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgba(244,222,198,0.55)'; ctx.fillRect(-R, wl - RY, 2 * R, -wl + RY);
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(255,248,236,0.65)'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.ellipse(0, wl, R - 3, RY * 0.95, 0, 0.08 * PI, 0.92 * PI); ctx.stroke();
        ctx.strokeStyle = 'rgba(160,80,35,0.22)';
        ctx.beginPath(); ctx.ellipse(0, wl, R - 3, RY * 0.95, 0, PI, TAU); ctx.stroke();
      }

      // ---- stems inside the glass: short, refracted under the waterline ----

      // ---- wax pillar ----
      var liftY = -300 * T.lift, waxA = T.waxAlpha;
      if (waxA > 0.002) {
        ctx.save(); ctx.translate(0, liftY); ctx.globalAlpha = waxA;
        var top = T.waxTop, bot = WAX_FLOOR, ryw = RW * K;
        var dayLit = Math.max(Math.pow(T.day, 0.45), 0.2 * dusk);
        var gwx = ctx.createLinearGradient(-RW, 0, RW, 0);
        var wl0 = mixc([62, 40, 32], [214, 205, 192], dayLit), wl1 = mixc([96, 64, 50], [252, 249, 243], dayLit), wl2 = mixc([52, 34, 28], [200, 190, 178], dayLit);
        gwx.addColorStop(0, rgba(wl2)); gwx.addColorStop(0.32, rgba(wl1)); gwx.addColorStop(0.7, rgba(wl0)); gwx.addColorStop(1, rgba(wl2));
        ctx.beginPath(); ctx.moveTo(-RW, top); ctx.lineTo(-RW, bot); ctx.ellipse(0, bot, RW, ryw, 0, PI, 0, true); ctx.lineTo(RW, top);
        ctx.ellipse(0, top, RW, ryw, 0, 0, PI, false); ctx.closePath();
        ctx.fillStyle = gwx; ctx.fill();
        if (glow > 0.002) {
          ctx.save(); ctx.clip();
          ctx.globalCompositeOperation = 'lighter';
          var gss = ctx.createLinearGradient(0, top, 0, top + 70);
          gss.addColorStop(0, 'rgba(255,200,130,' + (0.85 * glow) + ')'); gss.addColorStop(0.3, 'rgba(240,140,70,' + (0.4 * glow) + ')'); gss.addColorStop(1, 'rgba(120,50,20,0)');
          ctx.fillStyle = gss; ctx.fillRect(-RW, top - 10, 2 * RW, 90);
          ctx.restore();
        }
        var lit = clamp(glow * 1.2 + dayLit, 0, 1);  // dusk counts as soft daylight on the wax
        var gtop = ctx.createRadialGradient(-10, top - 3, 2, 0, top, RW);
        gtop.addColorStop(0, rgba(mixc([84, 58, 46], dayLit > glow ? [255, 253, 249] : [255, 214, 160], lit)));
        gtop.addColorStop(1, rgba(mixc([58, 40, 32], dayLit > glow ? [236, 230, 220] : [190, 120, 72], lit)));
        ctx.fillStyle = gtop; ctx.beginPath(); ctx.ellipse(0, top, RW, ryw, 0, 0, TAU); ctx.fill();
        // melt pool: bright & glossy only while burning
        var pool = lerp(0.25, 0.88, smooth(seg(T.burn, 0, 0.35)));
        if (glow > 0.01) {
          var gpool = ctx.createRadialGradient(0, top, 0, 0, top, RW * pool);
          gpool.addColorStop(0, 'rgba(255,224,170,' + (0.6 * glow) + ')'); gpool.addColorStop(0.75, 'rgba(250,200,140,' + (0.38 * glow) + ')'); gpool.addColorStop(1, 'rgba(250,200,140,0)');
          ctx.fillStyle = gpool; ctx.beginPath(); ctx.ellipse(0, top, RW * pool, ryw * pool, 0, 0, TAU); ctx.fill();
        }
        if (jarL.ready && glow > 0.01) { // a soft band of light where the molten top meets the wall of wax
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(0, top + ryw * 0.3); ctx.scale(1, ryw * 2.6 / RW);
          var gband = ctx.createRadialGradient(0, 0, 0, 0, 0, RW);
          gband.addColorStop(0, 'rgba(255,196,120,' + (0.32 * glow) + ')'); gband.addColorStop(0.6, 'rgba(240,140,64,' + (0.14 * glow) + ')'); gband.addColorStop(1, 'rgba(200,100,40,0)');
          ctx.fillStyle = gband; ctx.beginPath(); ctx.arc(0, 0, RW, 0, TAU); ctx.fill();
          ctx.restore();
        }
        ctx.strokeStyle = 'rgba(255,240,220,' + (jarL.ready ? 0.35 * dayLit : 0.2 + 0.4 * dayLit) + ')'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.ellipse(0, top, RW - 0.5, ryw - 0.2, 0, 0.05 * PI, 0.95 * PI); ctx.stroke();
        WICKS.forEach(function (w, i) {
          var wx = w.x, wy = top + w.z * K, len = 3.6 + 2.2 * T.burn, lean = (i - 1) * 0.6;
          ctx.strokeStyle = '#1b1210'; ctx.lineWidth = 0.75; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + lean * 0.3, wy - len * 0.6, wx + lean, wy - len); ctx.stroke();
          var ember = p >= T.ext[i] - 0.002 ? (1 - T.flames[i]) * (1 - seg(p, T.ext[i] + 0.01, T.ext[i] + 0.045)) : 0;
          if (ember > 0.01 && T.flames[i] < 1) {
            ctx.globalCompositeOperation = 'lighter';
            var ge2 = ctx.createRadialGradient(wx + lean, wy - len, 0, wx + lean, wy - len, 2.2);
            ge2.addColorStop(0, 'rgba(255,120,40,' + ember + ')'); ge2.addColorStop(1, 'rgba(255,60,10,0)');
            ctx.fillStyle = ge2; ctx.beginPath(); ctx.arc(wx + lean, wy - len, 2.2, 0, TAU); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          }
          w._tx = wx + lean; w._ty = wy - len;
          var fl = ign.flares[i];
          if (fl > 0.01) {
            ctx.globalCompositeOperation = 'lighter';
            var gfl2 = ctx.createRadialGradient(w._tx, w._ty, 0, w._tx, w._ty, 9 * fl + 2);
            gfl2.addColorStop(0, 'rgba(255,250,230,' + fl + ')'); gfl2.addColorStop(0.25, 'rgba(255,190,90,' + (0.7 * fl) + ')'); gfl2.addColorStop(1, 'rgba(255,120,30,0)');
            ctx.fillStyle = gfl2; ctx.beginPath(); ctx.arc(w._tx, w._ty, 9 * fl + 2, 0, TAU); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          }
        });
        // spark particles from the strike
        if (ign.sparks.length) {
          ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
          ign.sparks.forEach(function (sp) {
            var w = WICKS[sp.i]; if (w._tx == null) return;
            var a = 1 - sp.age / sp.life, x = w._tx + sp.x, y = w._ty + sp.y;
            ctx.strokeStyle = 'rgba(255,' + (200 + 55 * a | 0) + ',' + (120 + 100 * a | 0) + ',' + a + ')'; ctx.lineWidth = 0.45;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - sp.vx * 0.025, y - sp.vy * 0.025); ctx.stroke();
          });
          ctx.globalCompositeOperation = 'source-over';
        }
        // the paper label sits outside the glass: once a flame sinks behind it, the flame is hidden
        // and only its light shows around the label (drawn later in drawRealLabel)
        var labTop = jarL.ready && jarL.labRect ? jarL.labRect.cy - jarL.labRect.hh : 1e9;
        WICKS.forEach(function (w, i) {
          w._occ = smooth(seg(w._ty + liftY, labTop - 24, labTop + 1));
          ctx.globalAlpha = waxA * (1 - w._occ);
          var lv = T.flames[i]; if (lv > 0.003 && w._occ < 0.999) drawFlame(w._tx, w._ty + 1, lv, i, t, false);
        });
        ctx.globalAlpha = waxA;
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // ---- glass front ----
      if (jarL.ready) drawRealGlass(T, glow, dusk, flameY, liftY, waxA, t);
      else {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = (lerp(0.92, 0.42, T.empty) + 0.12 * T.water) * (1 - 0.35 * RL);
      ctx.drawImage(sprites.body, SX, SY, SW, SH);
      ctx.globalAlpha = lerp(0.9, 0.95, T.day);
      ctx.drawImage(sprites.relief, SX, SY, SW, SH);
      ctx.globalAlpha = 1;
      if (glow > 0.002) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.save(); frontPath(ctx, -H, 0); ctx.clip();
        var gin = ctx.createRadialGradient(0, flameY + 8, 4, 0, flameY + 20, 130);
        gin.addColorStop(0, 'rgba(255,170,80,' + (0.55 * glow) + ')'); gin.addColorStop(0.4, 'rgba(220,100,35,' + (0.3 * glow) + ')'); gin.addColorStop(1, 'rgba(120,40,10,' + (0.08 * glow) + ')');
        ctx.fillStyle = gin; ctx.fillRect(-R, -H - RY, 2 * R, H + 2 * RY);
        ctx.restore();
        var nt = sprites.nightTmp, nc = nt.getContext('2d');
        nc.setTransform(1, 0, 0, 1, 0, 0); nc.globalCompositeOperation = 'source-over'; nc.clearRect(0, 0, nt.width, nt.height);
        nc.drawImage(sprites.night, 0, 0);
        nc.globalCompositeOperation = 'destination-in';
        var ss = nt.width / SW;
        nc.setTransform(ss, 0, 0, ss, -SX * ss, -SY * ss);
        var gm = nc.createRadialGradient(0, flameY + 10, 0, 0, flameY + 25, 150);
        gm.addColorStop(0, 'rgba(0,0,0,1)'); gm.addColorStop(0.55, 'rgba(0,0,0,0.55)'); gm.addColorStop(1, 'rgba(0,0,0,0.12)');
        nc.fillStyle = gm; nc.fillRect(SX, SY, SW, SH);
        ctx.globalAlpha = clamp(glow * 1.1, 0, 1);
        ctx.drawImage(nt, SX, SY, SW, SH);
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
      if (dusk > 0.002) {
        ctx.save(); frontPath(ctx, -H, 0); ctx.clip();
        ctx.globalCompositeOperation = 'screen';
        var gdk = ctx.createLinearGradient(-R, -H, R, 0);
        gdk.addColorStop(0, 'rgba(140,112,104,' + (0.24 * dusk) + ')'); gdk.addColorStop(0.5, 'rgba(90,58,42,' + (0.1 * dusk) + ')'); gdk.addColorStop(1, 'rgba(40,22,16,0)');
        ctx.fillStyle = gdk; ctx.fillRect(-R, -H - RY, 2 * R, H + 2 * RY);
        ctx.restore(); ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = clamp(0.18 + T.day * 0.82 + 0.3 * dusk, 0, 1);
      ctx.drawImage(sprites.day, SX, SY, SW, SH);
      ctx.globalAlpha = 1;
      if (dusk > 0.002) { // the unlit jar sits in shade: cool, darker away from the window
        ctx.save(); silhouettePath(ctx); ctx.clip();
        ctx.globalCompositeOperation = 'multiply';
        var gsh2 = ctx.createLinearGradient(-R, -H, R * 0.8, 0);
        gsh2.addColorStop(0, rgba(mixc([255, 255, 255], [150, 140, 150], dusk))); gsh2.addColorStop(1, rgba(mixc([255, 255, 255], [62, 54, 60], dusk)));
        ctx.fillStyle = gsh2; ctx.fillRect(-R - 2, -H - RY - 2, 2 * R + 4, H + 2 * RY + 4);
        ctx.restore(); ctx.globalCompositeOperation = 'source-over';
      }

      // ---- flame halos, then the label in front of them ----
      if (waxA > 0.002) {
        ctx.save(); ctx.translate(0, liftY);
        WICKS.forEach(function (w, i) { var lv = T.flames[i]; if (lv > 0.003 && w._tx != null) drawFlame(w._tx, w._ty + 1, lv, i, t, true); });
        ctx.restore();
      }
      // relight the canvas glass towards the photographed jar: brighter, more orange amber
      if (RL > 0) {
        ctx.save(); frontPath(ctx, -H, 0); ctx.clip();
        ctx.globalCompositeOperation = 'screen';
        var gR = ctx.createLinearGradient(0, -H, 0, 0);
        gR.addColorStop(0, 'rgba(214,112,44,' + (0.3 * RL) + ')'); gR.addColorStop(1, 'rgba(190,84,30,' + (0.38 * RL) + ')');
        ctx.fillStyle = gR; ctx.fillRect(-R, -H - RY, 2 * R, H + 2 * RY);
        ctx.restore(); ctx.globalCompositeOperation = 'source-over';
      }
      drawLabel(glow, Math.max(T.day, 0.24 * dusk), T.match);
      }

      // ---- insert, smoke ----
      if (T.discAlpha > 0.002) drawDisc(T);
      drawSmoke(T, p, t);
      }

      // ---- canvas jar + disc cross into the photo jar: a soft sweep up through the jar ----
      if (imgsReady && T.jarX > 0 && !jarGone) {
        var jc = screenCanvas('b');
        drawPhotoLayer(jc, fin.plate, PF);
        jc.globalCompositeOperation = 'destination-in';
        jc.setTransform(dpr * s, 0, 0, dpr * s * sy, dpr * cx, dpr * cy);
        var yTop = -H - 40, yBot = 30, edge = lerp(yBot + 40, yTop - 40, T.jarX);
        var gj = jc.createLinearGradient(0, edge - 45, 0, edge + 45);
        gj.addColorStop(0, 'rgba(0,0,0,0)'); gj.addColorStop(1, 'rgba(0,0,0,1)');
        jc.fillStyle = gj;
        jc.beginPath(); jc.ellipse(0, 0, R * 1.08, RY * 1.4, 0, 0, PI); jc.lineTo(-R * 1.08, -H - RY * 2.5);
        jc.ellipse(0, -H - 2, R * 1.08, RY * 2.2, 0, PI, TAU); jc.lineTo(R * 1.08, 0); jc.closePath();
        jc.fill();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(jc.canvas, 0, 0);
        world();
      }

      // ---- flowers from the real photo ----
      if (imgsReady) drawFlowersLayer(T, PF);
      world();

      // ---- motes ----
      if (!reduce && T.finish < 1) {
        ctx.globalCompositeOperation = 'lighter';
        motes.forEach(function (m) {
          var mx = m.x + (fbm(t * 0.05 + m.k) - 0.5) * 60, my = m.y + (fbm(t * 0.04 + m.k + 9) - 0.5) * 50 - ((t * 2 + m.k * 3) % 40);
          var dn = Math.hypot(mx, my - flameY);
          var an = glow * clamp(1 - dn / 220, 0, 1) * 0.7;
          var ad = T.day * clamp((-(mx + 40) + (-my - 120) * 0.6) / 200, 0, 1) * 0.5;
          var au = dusk * clamp((-(mx + 20) + (-my - 60) * 0.7) / 180, 0, 1) * 0.35;
          ad += au;
          var a = (an + ad) * (0.5 + 0.5 * noise(t * 0.8 + m.k)) * (1 - RL);
          if (a < 0.01) return;
          ctx.fillStyle = an > ad ? 'rgba(255,190,120,' + a.toFixed(3) + ')' : 'rgba(255,255,250,' + a.toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(mx, my, m.s * 0.55, 0, TAU); ctx.fill();
        });
        ctx.globalCompositeOperation = 'source-over';
      }

      // ---- screen-space finish ----
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var vg = ctx.createRadialGradient(cw / 2, ch * 0.5, Math.min(cw, ch) * 0.35, cw / 2, ch * 0.5, Math.hypot(cw, ch) * 0.62);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(' + (night > 0.5 ? '8,3,4' : '120,95,75') + ',' + ((0.55 * night + 0.16 * T.day) * (1 - T.finish)) + ')');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch);
      if (!grainPat) grainPat = ctx.createPattern(grain, 'repeat');
      ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = (0.07 + 0.03 * night) * (1 - T.finish);
      var go = reduce ? 0 : ((clock * 24) | 0);
      ctx.save(); ctx.translate(-(go * 37) % 160, -(go * 53) % 160);
      ctx.fillStyle = grainPat; ctx.fillRect(0, 0, cw + 160, ch + 160);
      ctx.restore();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    // ---- flame ----
    function drawFlame(x, y, lv, i, t, halo) {
      var n1 = reduce ? 0.5 : fbm(t * 3.3 + i * 11.3), n2 = reduce ? 0.5 : fbm(t * 2.1 + i * 5.7 + 40), n3 = reduce ? 0.5 : fbm(t * 7.5 + i * 2.1);
      var bst = ign.boost[i]; // freshly lit flames dance harder, then settle
      if (bst > 0) { n1 = 0.5 + (n1 - 0.5) * (1 + 2.2 * bst); n2 = 0.5 + (n2 - 0.5) * (1 + 1.8 * bst); }
      var h = 21 * (0.35 + 0.65 * lv) * (0.9 + 0.22 * n1) * Math.min(1, lv);
      var w = 4.1 * (0.45 + 0.55 * lv) * (0.95 + 0.1 * n3);
      var lean = (n2 - 0.5) * 4.5 * (h / 21) + (1 - lv) * (i - 1) * 3;
      if (halo) {
        ctx.globalCompositeOperation = 'lighter';
        var gh = ctx.createRadialGradient(x, y - h * 0.45, 0, x, y - h * 0.45, 48 * lv);
        gh.addColorStop(0, 'rgba(255,190,110,' + (0.42 * lv) + ')'); gh.addColorStop(0.25, 'rgba(255,130,50,' + (0.16 * lv) + ')'); gh.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = gh; ctx.beginPath(); ctx.arc(x, y - h * 0.45, 48 * lv, 0, TAU); ctx.fill();
        var gc = ctx.createRadialGradient(x + lean * 0.2, y - h * 0.32, 0, x + lean * 0.2, y - h * 0.32, w * 2.2);
        gc.addColorStop(0, 'rgba(255,245,220,' + (0.55 * lv) + ')'); gc.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = gc; ctx.beginPath(); ctx.arc(x + lean * 0.2, y - h * 0.32, w * 2.2, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        return;
      }
      var tx = x + lean, ty = y - h;
      function shape(sc) {
        var ww = w * sc, hh = h * sc;
        ctx.beginPath();
        ctx.moveTo(x, y + 1.2 * sc);
        ctx.bezierCurveTo(x - ww * 1.05, y + 0.6, x - ww * 1.15, y - hh * 0.38, x - ww * 0.55 + lean * 0.25, y - hh * 0.62);
        ctx.bezierCurveTo(x - ww * 0.2 + lean * 0.55, y - hh * 0.82, tx - 0.3, ty + hh * 0.08, x + lean * sc, y - hh);
        ctx.bezierCurveTo(tx + 0.3, ty + hh * 0.08, x + ww * 0.2 + lean * 0.55, y - hh * 0.82, x + ww * 0.55 + lean * 0.25, y - hh * 0.62);
        ctx.bezierCurveTo(x + ww * 1.15, y - hh * 0.38, x + ww * 1.05, y + 0.6, x, y + 1.2 * sc);
        ctx.closePath();
      }
      shape(1);
      var g = ctx.createLinearGradient(x, y + 1, x + lean, y - h);
      g.addColorStop(0, 'rgba(60,90,230,0.55)'); g.addColorStop(0.1, 'rgba(110,110,200,0.45)'); g.addColorStop(0.2, 'rgba(255,150,60,0.85)');
      g.addColorStop(0.45, 'rgba(255,196,96,0.95)'); g.addColorStop(0.78, 'rgba(255,140,50,0.75)'); g.addColorStop(1, 'rgba(255,100,30,0)');
      ctx.fillStyle = g; ctx.fill();
      shape(0.72);
      var g2 = ctx.createLinearGradient(x, y, x + lean, y - h * 0.72);
      g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(0.18, 'rgba(255,236,190,0.7)'); g2.addColorStop(0.45, 'rgba(255,250,232,0.95)'); g2.addColorStop(1, 'rgba(255,230,170,0)');
      ctx.fillStyle = g2; ctx.fill();
      ctx.fillStyle = 'rgba(40,60,170,' + (0.35 * lv) + ')';
      ctx.beginPath(); ctx.ellipse(x, y - 0.2, w * 0.55, 1.4, 0, 0, TAU); ctx.fill();
    }

    // ---- label ----
    function drawLabel(glow, day, m) {
      // during the match cut the label slides to where it sits on the photographed jar
      m = m || 0;
      var lx = lerp(24, 24, m), top = lerp(-82, -80, m), bot = lerp(-48, -50, m);
      function cyf(x) { return RY * Math.sqrt(1 - (x / R) * (x / R)); }
      ctx.beginPath();
      for (var x = -lx; x <= lx; x += 2) ctx.lineTo(x, top + cyf(x));
      for (x = lx; x >= -lx; x -= 2) ctx.lineTo(x, bot + cyf(x));
      ctx.closePath();
      var nightCol = mixc([40, 22, 18], [228, 170, 110], clamp(glow, 0, 1));
      var col = mixc(nightCol, [242, 233, 218], day);
      var g = ctx.createLinearGradient(-lx, 0, lx, 0);
      g.addColorStop(0, rgba(mixc(col, [120, 80, 50], 0.25))); g.addColorStop(0.35, rgba(col)); g.addColorStop(1, rgba(mixc(col, [120, 80, 50], 0.3)));
      ctx.fillStyle = g; ctx.fill();
      var ink = rgba(mixc([60, 22, 20], [92, 30, 32], day), 0.55 + 0.4 * Math.max(day, glow * 0.6));
      var my = (top + bot) / 2 + RY;
      ctx.fillStyle = ink; ctx.strokeStyle = ink;
      ctx.save(); ctx.translate(0, my - 7.2); ctx.rotate(PI / 4); ctx.lineWidth = 0.35; ctx.strokeRect(-1.7, -1.7, 3.4, 3.4); ctx.fillRect(-0.7, -0.7, 1.4, 1.4); ctx.restore();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '600 3.15px "Bodoni Moda", "Didot", Georgia, serif';
      ctx.fillText('MIND YOUR LIGHT', 0, my - 0.6);
      ctx.font = '500 1.7px "Hanken Grotesk", system-ui, sans-serif';
      ctx.fillText('PREMIUM SOY WAX CANDLE', 0, my + 3.4);
      ctx.lineWidth = 0.2; ctx.beginPath(); ctx.moveTo(-7, my + 5.6); ctx.lineTo(7, my + 5.6); ctx.stroke();
      ctx.font = '600 2.1px "Hanken Grotesk", system-ui, sans-serif';
      ctx.fillText('ROMANCE', 0, my + 8.2);
    }

    // ---- disc ----
    function drawDisc(T) {
      var tilt = T.discTilt, y0 = -H - 1.6 + T.discY, Rd = R + 0.4;
      var k = K + Math.sin(tilt) * 0.55, rot = tilt * 0.35;
      ctx.save(); ctx.globalAlpha = T.discAlpha; ctx.translate(0, y0); ctx.rotate(rot);
      var ryd = Rd * k;
      ctx.fillStyle = 'rgba(220,226,228,0.45)';
      ctx.beginPath(); ctx.ellipse(0, 2.6, Rd, ryd, 0, 0, PI); ctx.lineTo(-Rd, 0); ctx.ellipse(0, 0, Rd, ryd, 0, PI, 0, true); ctx.closePath(); ctx.fill();
      var g = ctx.createLinearGradient(-Rd, -ryd, Rd, ryd);
      g.addColorStop(0, 'rgba(255,255,255,0.42)'); g.addColorStop(0.5, 'rgba(236,240,240,0.2)'); g.addColorStop(1, 'rgba(255,255,255,0.32)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, Rd, ryd, 0, 0, TAU); ctx.fill();
      var sk = ryd / Rd;
      HOLES.forEach(function (h) {
        var hx = h.x, hy = h.z * sk, rx = h.r, ry = h.r * sk;
        ctx.fillStyle = 'rgba(150,80,40,0.22)';
        ctx.beginPath(); ctx.ellipse(hx, hy, rx, ry, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(110,70,50,0.35)'; ctx.lineWidth = 0.35;
        ctx.beginPath(); ctx.ellipse(hx, hy, rx, ry, 0, PI * 1.05, PI * 1.95); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.45;
        ctx.beginPath(); ctx.ellipse(hx, hy + 0.5, rx, ry, 0, PI * 0.1, PI * 0.9); ctx.stroke();
      });
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.ellipse(0, 2.6, Rd, ryd, 0, 0.1 * PI, 0.9 * PI); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.ellipse(0, 0, Rd, ryd, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,110,105,0.25)'; ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.ellipse(0, 0, Rd - 0.8, ryd - 0.3, 0, 1.1 * PI, 1.9 * PI); ctx.stroke();
      ctx.restore(); ctx.globalAlpha = 1;
    }

    // ---- the real jar: photo-based front glass (multiply), relief sparkle map and opaque paper label ----
    // Built once, async in slices. Until ready the procedural glass is used.
    var jarL = { ready: false };
    (function () {
      var im = new Image();
      im.onload = function () {
        var go = function () { if (!destroyed) setTimeout(function () { prepJar(im); }, 0); };
        if (im.decode) im.decode().then(go, go); else go();
      };
      im.src = 'img/jar-body.png';
    })();
    function prepJar(im) {
      var W = JP.w, Hh = JP.h, mm = (2 * R) / (JP.wallR - JP.wallL), ryPx = RY / mm;
      var src, blr, hl, warm, rows, cols, y0 = 0, y1 = 0, step = 0, y = 0, lab = null;
      var steps = [
        function () { // the photo clipped to the straight walls: the beaded rim flares past them and read as wire handles
          var cv = makeCanvas(W, Hh), c = cv.getContext('2d');
          // and a clean rounded bottom: below the glass's dark bottom edge the cut-out still carries
          // a pale, ragged strip of the photo's tabletop, which read as a stepped outline
          var L = JP.wallL, Rr = JP.wallR, yb = 927;
          c.beginPath(); c.moveTo(L, 0); c.lineTo(L, 815);
          c.bezierCurveTo(L, 880, L + 48, 918, L + 138, yb); c.lineTo(Rr - 138, yb);
          c.bezierCurveTo(Rr - 48, 918, Rr, 880, Rr, 815); c.lineTo(Rr, 0); c.closePath();
          c.clip(); c.drawImage(im, 0, 0);
          im = cv; src = c.getImageData(0, 0, W, Hh).data; return true;
        },
        function () { // blurred luminance via down/up-sampling
          var tiny = makeCanvas(W / 8, Hh / 8), big = makeCanvas(W, Hh), tc = tiny.getContext('2d'), bc = big.getContext('2d');
          tc.imageSmoothingQuality = bc.imageSmoothingQuality = 'high';
          tc.drawImage(im, 0, 0, tiny.width, tiny.height); bc.drawImage(tiny, 0, 0, W, Hh);
          blr = bc.getImageData(0, 0, W, Hh).data; rows = new Int32Array(Hh); cols = new Int32Array(W); y = 0; return true;
        },
        function () { // label rows: cream paper by colour
          var until = performance.now() + 8;
          for (; y < Hh && performance.now() < until; y++) { var n = 0; for (var x = 0; x < W; x++) { var o = (y * W + x) * 4; if (isCream(src, o)) n++; } rows[y] = n; }
          if (y < Hh) return false;
          y0 = -1; for (var k = 0; k < Hh; k++) if (rows[k] > W * 0.3) { if (y0 < 0) y0 = k; y1 = k; }
          y = 0; return true;
        },
        function () { // label columns inside those rows
          if (y0 < 0) return true;
          for (var x = 0; x < W; x++) { var n = 0; for (var yy = y0; yy <= y1; yy += 2) if (isCream(src, (yy * W + x) * 4)) n++; cols[x] = n; }
          var need = (y1 - y0) / 2 * 0.6, x0 = -1, x1 = 0;
          for (x = 0; x < W; x++) if (cols[x] > need) { if (x0 < 0) x0 = x; x1 = x; }
          if (x0 >= 0) lab = { x: x0 + 1, y: y0 + 1, w: x1 - x0 - 1, h: y1 - y0 - 1 };
          hl = new ImageData(W, Hh); warm = new ImageData(W, Hh); y = 0; return true;
        },
        function () { // high-frequency highlight map: luminance minus blurred luminance
          var until = performance.now() + 8, d = hl.data, dw = warm.data;
          for (; y < Hh && performance.now() < until; y++) for (var x = 0; x < W; x++) {
            var o = (y * W + x) * 4, a = src[o + 3]; if (a < 8) continue;
            if (lab && x >= lab.x - 2 && x <= lab.x + lab.w + 2 && y >= lab.y - 2 && y <= lab.y + lab.h + 2) continue;
            var L = 0.3 * src[o] + 0.59 * src[o + 1] + 0.11 * src[o + 2], Lb = 0.3 * blr[o] + 0.59 * blr[o + 1] + 0.11 * blr[o + 2];
            var v = clamp((L - Lb) * 1.9 - 6, 0, 255) * a / 255;
            if (v < 2) continue;
            d[o] = d[o + 1] = 255; d[o + 2] = 250; d[o + 3] = v;
            dw[o] = 255; dw[o + 1] = 190; dw[o + 2] = 110; dw[o + 3] = Math.min(255, v * 1.7);
          }
          return y >= Hh;
        },
        function () { jarL.hlW0 = soften(putCanvas(hl), 2); return true; },
        function () { jarL.hlN0 = soften(putCanvas(warm), 2); src = blr = null; return true; },
        function () { // multiply layer: the photo itself, paper area left white (the label is drawn opaque later)
          var c = makeCanvas(W, Hh), cc = c.getContext('2d'); cc.drawImage(im, 0, 0);
          if (lab) { cc.globalCompositeOperation = 'source-atop'; cc.fillStyle = '#fff'; cc.fillRect(lab.x - 2, lab.y - 2, lab.w + 4, lab.h + 4); }
          jarL.mul0 = c;
          var l = makeCanvas(W, Hh), lc = l.getContext('2d');
          if (lab) lc.drawImage(im, lab.x, lab.y, lab.w, lab.h, lab.x, lab.y, lab.w, lab.h);
          jarL.lab0 = l; return true;
        },
        function () { jarL.mul = warp(jarL.mul0); return true; },
        function () { jarL.hlW = warp(jarL.hlW0); return true; },
        function () { jarL.hlN = warp(jarL.hlN0); return true; },
        function () { jarL.lab = warp(jarL.lab0); jarL.mul0 = jarL.hlW0 = jarL.hlN0 = jarL.lab0 = null; return true; },
        function () { // feathered silhouette (~3 screen px falloff) from the warped photo alpha
          var sharp = makeCanvas(jarL.mul.width, jarL.mul.height), sc = sharp.getContext('2d');
          sc.drawImage(jarL.mul, 0, 0); sc.globalCompositeOperation = 'source-in'; sc.fillStyle = '#000'; sc.fillRect(0, 0, sharp.width, sharp.height);
          jarL.maskSharp = sharp; jarL.mask = soften(sharp, 5); return true;
        },
        function () { // thick glass: a darker refractive band along each wall, then the soft edge
          var c = jarL.mul.getContext('2d'), Wm = jarL.mul.width, Hm = jarL.mul.height, band = 15;
          c.globalCompositeOperation = 'multiply';
          var gl = c.createLinearGradient(JP.wallL, 0, JP.wallL + band, 0);
          gl.addColorStop(0, 'rgb(150,84,46)'); gl.addColorStop(1, 'rgb(255,255,255)');
          c.fillStyle = gl; c.fillRect(JP.wallL, 0, band, Hm);
          var gr = c.createLinearGradient(JP.wallR - band, 0, JP.wallR, 0);
          gr.addColorStop(0, 'rgb(255,255,255)'); gr.addColorStop(1, 'rgb(150,84,46)');
          c.fillStyle = gr; c.fillRect(JP.wallR - band, 0, band + 1, Hm);
          c.globalCompositeOperation = 'destination-in'; c.drawImage(jarL.mask, 0, 0);
          c.globalCompositeOperation = 'source-over';
          [jarL.hlW, jarL.hlN].forEach(function (cv) { var x = cv.getContext('2d'); x.globalCompositeOperation = 'destination-in'; x.drawImage(jarL.mask, 0, 0); x.globalCompositeOperation = 'source-over'; });
          return true;
        },
        function () { // a soft ring just around/over the silhouette, for the room light wrapping the glass
          var big = soften(jarL.maskSharp, 14), rc = big.getContext('2d'), Wm = big.width, Hm = big.height, k = 0.965;
          rc.globalCompositeOperation = 'destination-out';
          rc.drawImage(jarL.mask, Wm * (1 - k) / 2, Hm * (1 - k) / 2, Wm * k, Hm * k);
          jarL.ring = big;
          var bt = makeCanvas(Wm, Hm), bc = bt.getContext('2d');   // back wall tint, soft edged
          bc.drawImage(jarL.mask, 0, 0); bc.globalCompositeOperation = 'source-in'; bc.fillStyle = 'rgb(244,200,150)'; bc.fillRect(0, 0, Wm, Hm);
          jarL.back = bt; jarL.maskSharp = null;
          return true;
        },
        function () { // scratch canvases + first upload, then go live
          var wc = warm2.getContext('2d');
          jarL.tmp = makeCanvas(jarL.mul.width, jarL.mul.height); jarL.ltmp = makeCanvas(jarL.mul.width, jarL.mul.height);
          [jarL.mul, jarL.hlW, jarL.hlN, jarL.lab, jarL.tmp, jarL.ltmp, jarL.mask, jarL.ring, jarL.back].forEach(function (cv) { wc.drawImage(cv, 0, 0, 1, 1); });
          jarL.mm = mm; jarL.x = -R - JP.wallL * mm; jarL.y = -H; jarL.w = W * mm; jarL.h = jarL.mul.height * mm;
          jarL.labRect = lab ? { cx: jarL.x + (lab.x + lab.w / 2) * mm, cy: -H + (lab.y + lab.h / 2) * mm + RY, hw: lab.w / 2 * mm, hh: lab.h / 2 * mm } : null;
          jarL.ready = true; if (paused || !raf) draw(); return true;
        }
      ];
      function isCream(d, o) { return d[o + 3] > 200 && d[o] > 200 && d[o + 1] > 188 && d[o + 2] > 160 && d[o] - d[o + 2] < 62; }
      // cheap blur: down- then up-sample (works without ctx.filter)
      // halve n times, then double back up: a smooth, gaussian-like blur without blocky steps
      function soften(cv, f) {
        var n = Math.max(1, Math.round(Math.log(f) / Math.LN2)), chain = [cv], cur = cv, i;
        for (i = 0; i < n; i++) {
          var d = makeCanvas(Math.max(2, cur.width / 2), Math.max(2, cur.height / 2)), dc = d.getContext('2d');
          dc.imageSmoothingQuality = 'high'; dc.drawImage(cur, 0, 0, d.width, d.height); chain.push(d); cur = d;
        }
        for (i = n - 1; i >= 0; i--) {
          var u = makeCanvas(chain[i].width, chain[i].height), uc = u.getContext('2d');
          uc.imageSmoothingQuality = 'high'; uc.drawImage(cur, 0, 0, u.width, u.height); cur = u;
        }
        return cur;
      }
      function putCanvas(id) { var c = makeCanvas(W, Hh); c.getContext('2d').putImageData(id, 0, 0); return c; }
      // bend the flat front photo around the cylinder: each column drops by the front-arc offset
      function warp(cv) {
        var out = makeCanvas(W, Hh + Math.ceil(ryPx) + 2), oc = out.getContext('2d'), half = (JP.wallR - JP.wallL) / 2, mid = (JP.wallR + JP.wallL) / 2;
        for (var x = 0; x < W; x++) {   // 1 px columns: no staircase on the rim edge
          var u = clamp((x + 0.5 - mid) / half, -1, 1), dy = ryPx * Math.sqrt(1 - u * u);
          oc.drawImage(cv, x, 0, 1, Hh, x, dy, 1, Hh);
        }
        return out;
      }
      (function run() {
        if (destroyed) return;
        if (steps[step]()) step++;
        if (step < steps.length) setTimeout(run, 0);
      })();
    }
    var warm2 = makeCanvas(2, 2);

    // photo-based glass, drawn over the jar interior
    function drawRealGlass(T, glow, dusk, flameY, liftY, waxA, t) {
      var X = jarL.x, Y = jarL.y, Wd = jarL.w, Hd = jarL.h;
      // amber tint + relief: the photo as a transmission layer
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 1;
      ctx.drawImage(jarL.mul, X, Y, Wd, Hd);
      // light from inside: amber glow behind the glass, relief brightest near the flame
      if (glow > 0.002) {
        maskedPaint('lighter', 1, function (c) {
          var gin = c.createRadialGradient(0, flameY + 8, 4, 0, flameY + 20, 120);
          gin.addColorStop(0, 'rgba(255,160,70,' + (0.5 * glow) + ')'); gin.addColorStop(0.45, 'rgba(210,92,30,' + (0.26 * glow) + ')'); gin.addColorStop(1, 'rgba(110,36,10,' + (0.06 * glow) + ')');
          c.fillStyle = gin; c.fillRect(-R - 4, -H - RY - 4, 2 * R + 8, H + 2 * RY + 8);
        });
        // relief: only the ridges near the flame catch it; the upper glass stays smooth and warm
        var tc = jarL.tmp.getContext('2d'), sc = jarL.tmp.width / Wd;
        tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, jarL.tmp.width, jarL.tmp.height);
        tc.drawImage(jarL.hlN, 0, 0);
        tc.globalCompositeOperation = 'destination-in';
        tc.setTransform(sc, 0, 0, sc, -X * sc, -Y * sc);
        var gm = tc.createLinearGradient(0, flameY - 30, 0, flameY + 80);
        gm.addColorStop(0, 'rgba(0,0,0,0.12)'); gm.addColorStop(0.3, 'rgba(0,0,0,1)'); gm.addColorStop(0.6, 'rgba(0,0,0,0.45)'); gm.addColorStop(1, 'rgba(0,0,0,0.08)');
        tc.fillStyle = gm; tc.fillRect(X, Y, Wd, Hd);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp(glow * 0.95, 0, 1);
        ctx.drawImage(jarL.tmp, X, Y, Wd, Hd);
        ctx.globalAlpha = 1;
        // flame light on the lip: soft, brightest at the front centre
        softLip(R - 0.5, RY - 0.2, 0.04 * PI, 0.96 * PI, [255, 176, 96], 0.42 * glow, 1.1, 'lighter');
        softLip(R - 1.6, RY - 0.7, 1.04 * PI, 1.96 * PI, [255, 150, 70], 0.22 * glow, 0.9, 'lighter');
      }
      // dusk: quiet window light from the upper left, the jar in shade
      if (dusk > 0.002) {
        maskedPaint('multiply', 1, function (c) {
          var gsh2 = c.createLinearGradient(-R, -H, R * 0.8, 0);
          gsh2.addColorStop(0, rgba(mixc([255, 255, 255], [146, 136, 146], dusk))); gsh2.addColorStop(1, rgba(mixc([255, 255, 255], [60, 53, 60], dusk)));
          c.fillStyle = gsh2; c.fillRect(-R - 4, -H - RY - 4, 2 * R + 8, H + 2 * RY + 8);
        });
      }
      // daylight specular sparkle of the pressed relief (from the photo itself)
      var sp = clamp(0.06 + 0.94 * T.day + 0.45 * dusk, 0, 1);
      if (sp > 0.01) {
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = sp * 0.8;
        ctx.drawImage(jarL.hlW, X, Y, Wd, Hd);
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
      // flame halos sit behind the paper label
      if (waxA > 0.002) {
        ctx.save(); ctx.translate(0, liftY);
        WICKS.forEach(function (w, i) { var lv = T.flames[i] * (1 - (w._occ || 0) * 0.85); if (lv > 0.003 && w._tx != null) drawFlame(w._tx, w._ty + 1, lv, i, t, true); });
        ctx.restore();
      }
      var occ = waxA > 0.002 ? WICKS.reduce(function (a, w, i) { return a + (w._occ || 0) * T.flames[i]; }, 0) / 3 : 0;
      drawRealLabel(T, glow, dusk, occ * waxA, liftY);
      // the room's light wraps softly over the silhouette, so the jar sits in the light
      var wrapCol = mixc(mixc([120, 112, 130], [255, 150, 72], clamp(glow, 0, 1)), [255, 244, 228], T.day);
      var wrapA = 0.22 * glow + 0.16 * dusk + 0.14 * T.day;
      if (wrapA > 0.005) {
        var tc2 = jarL.tmp.getContext('2d');
        tc2.setTransform(1, 0, 0, 1, 0, 0); tc2.globalCompositeOperation = 'source-over'; tc2.clearRect(0, 0, jarL.tmp.width, jarL.tmp.height);
        tc2.drawImage(jarL.ring, 0, 0); tc2.globalCompositeOperation = 'source-in'; tc2.fillStyle = rgba(wrapCol); tc2.fillRect(0, 0, jarL.tmp.width, jarL.tmp.height);
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = clamp(wrapA, 0, 1);
        ctx.drawImage(jarL.tmp, X, Y, Wd, Hd);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    }
    // paint fn (world coords) on the jar scratch canvas, keep it only inside the feathered jar mask, composite with op
    function maskedPaint(op, alpha, fn) {
      var tc = jarL.tmp.getContext('2d'), sc = jarL.tmp.width / jarL.w;
      tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, jarL.tmp.width, jarL.tmp.height);
      tc.setTransform(sc, 0, 0, sc, -jarL.x * sc, -jarL.y * sc);
      fn(tc);
      tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalCompositeOperation = 'destination-in'; tc.drawImage(jarL.mask, 0, 0);
      tc.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = op; ctx.globalAlpha = alpha;
      ctx.drawImage(jarL.tmp, jarL.x, jarL.y, jarL.w, jarL.h);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // a rim highlight that is brightest at the front centre and fades out towards the walls
    function softLip(rx, ry, a0, a1, col, alpha, width, op) {
      if (alpha < 0.004) return;
      var g = ctx.createLinearGradient(-rx, 0, rx, 0);
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.3, rgba(col, alpha * 0.55)); g.addColorStop(0.5, rgba(col, alpha)); g.addColorStop(0.7, rgba(col, alpha * 0.55)); g.addColorStop(1, rgba(col, 0));
      ctx.save(); ctx.globalCompositeOperation = op || 'source-over';
      ctx.strokeStyle = g; ctx.lineWidth = width; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(0, -H, rx, ry, 0, a0, a1); ctx.stroke();
      ctx.restore();
    }
    // the paper label: opaque, lit by the room in daylight, from behind/above by the flame at night
    function drawRealLabel(T, glow, dusk, occ, liftY) {
      occ = occ || 0;
      if (!jarL.labRect) return;
      var lt = jarL.ltmp, lc = lt.getContext('2d'), Wc = lt.width, Hc = lt.height;
      lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over'; lc.globalAlpha = 1; lc.clearRect(0, 0, Wc, Hc);
      lc.drawImage(jarL.lab, 0, 0);
      var day = T.day, night = 1 - day;
      // night colour of the paper: dusk grey when unlit, warm and brighter at the top when the flame burns
      var top = mixc([255, 255, 255], mixc(mixc([30, 24, 24], [106, 99, 106], clamp(dusk * 1.4, 0, 1)), [255, 206, 150], clamp(glow, 0, 1)), night);
      var bot = mixc([255, 255, 255], mixc(mixc([24, 18, 18], [80, 74, 80], clamp(dusk * 1.4, 0, 1)), [168, 108, 70], clamp(glow, 0, 1)), night);
      if (night > 0.002) {
        var r = jarL.labRect, mmp = jarL.mm, ly = (r.cy - jarL.y) / mmp, lh = 140;
        lc.globalCompositeOperation = 'multiply';
        var g = lc.createLinearGradient(0, ly - lh, 0, ly + lh);
        g.addColorStop(0, rgba(top)); g.addColorStop(1, rgba(bot));
        lc.fillStyle = g; lc.fillRect(0, 0, Wc, Hc);
        if (glow > 0.01) { // light bleeding through the paper's upper edge
          lc.globalCompositeOperation = 'lighter';
          var g2 = lc.createLinearGradient(0, ly - lh, 0, ly - lh * 0.45);
          g2.addColorStop(0, 'rgba(255,170,90,' + ((0.32 + 0.35 * occ) * glow * night) + ')'); g2.addColorStop(1, 'rgba(255,170,90,0)');
          lc.fillStyle = g2; lc.fillRect(0, 0, Wc, Hc);
        }
        lc.globalCompositeOperation = 'destination-in'; lc.drawImage(jarL.lab, 0, 0);
      }
      // during the match cut the label eases to the size it has on the photographed jar
      var m = T.match, sc = lerp(1, 0.7, m), r2 = jarL.labRect;
      ctx.save();
      ctx.translate(r2.cx, r2.cy); ctx.scale(sc, sc); ctx.translate(-r2.cx, -r2.cy + lerp(0, 3, m));
      ctx.drawImage(lt, jarL.x, jarL.y, jarL.w, jarL.h);
      ctx.restore();
      // light of the hidden flames bleeding around the paper's top and side edges
      if (occ > 0.01 && glow > 0.01) {
        var L = jarL.labRect, a = occ * glow;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath(); ctx.rect(-R, -H - RY, 2 * R, H + 2 * RY); ctx.rect(L.cx - L.hw, L.cy - L.hh, 2 * L.hw, 2 * L.hh); ctx.clip('evenodd');
        var gx = ctx.createRadialGradient(L.cx, L.cy - L.hh * 0.6, L.hh * 0.4, L.cx, L.cy - L.hh * 0.2, L.hw * 1.35);
        gx.addColorStop(0, 'rgba(255,196,120,' + (0.55 * a) + ')'); gx.addColorStop(0.45, 'rgba(255,150,70,' + (0.28 * a) + ')'); gx.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = gx; ctx.fillRect(L.cx - L.hw * 1.5, L.cy - L.hh * 2.2, L.hw * 3, L.hh * 3.2);
        ctx.restore();
      }
    }

    // ---- ending: the real styled photo (plate + flowers), matched to the canvas jar ----
    var warm = makeCanvas(2, 2);
    var fin = { photo: null, plate: null, flowers: null, tone: null, job: null, jobK: 0, k: 0, layers: null, cS: null, tmp: null, ready: false, finalKey: '', kbStart: -1 };
    function loadImg(src, key, cb) {
      var im = new Image();
      // decode off the main thread, then touch the image once in its own task so the first
      // frame that needs it does not pay for decode / upload
      im.onload = function () {
        var ready = function () {
          if (destroyed) return;
          setTimeout(function () { warm.getContext('2d').drawImage(im, 0, 0, 1, 1); fin[key] = im; if (cb) cb(im); if (paused || !raf) draw(); }, 0);
        };
        if (im.decode) im.decode().then(ready, ready); else ready();
      };
      im.onerror = function () { fin[key] = null; };
      im.src = src;
    }
    loadImg('img/final-photo.jpg', 'photo');
    loadImg('img/final-plate.jpg', 'plate', function (im) {
      // sample the photo's wall and stool tones so the canvas room can be relit towards them
      var c = makeCanvas(27, 40).getContext('2d'); c.drawImage(im, 0, 0, 27, 40);
      var d = c.getImageData(0, 0, 27, 40).data;
      function avg(x0, y0, x1, y1) { var s = [0, 0, 0], n = 0; for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) { var o = (y * 27 + x) * 4; s[0] += d[o]; s[1] += d[o + 1]; s[2] += d[o + 2]; n++; } return [s[0] / n, s[1] / n, s[2] / n]; }
      fin.tone = { wallL: avg(1, 2, 12, 14), wallD: avg(16, 10, 26, 24), top: avg(5, 30, 22, 32), low: avg(4, 36, 24, 40) };
    });
    loadImg('img/final-flowers.png', 'flowers', function () { fin.jobK = 0; });

    var disc = makeCanvas(128, 128); (function () { var c = disc.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.62, 'rgba(0,0,0,1)'); g.addColorStop(0.82, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, 128, 128); })();

    // photo placement: region x150–1000, y380–1420 always visible with margin; cover when the aspect allows,
    // otherwise the photo's own edge pixels are stretched outwards (no bars)
    function photoFit() {
      var top = Math.min(TOP_SAFE, ch * 0.2), uh = Math.max(40, ch - top - BOT_SAFE);
      var rg = FP.region, rw = rg[2] - rg[0], rh = rg[3] - rg[1];
      var ps = Math.min(cw / rw, uh / rh) * 0.94;
      var ox = cw / 2 - (rg[0] + rw / 2) * ps, oy = top + uh / 2 - (rg[1] + rh / 2) * ps;
      if (FP.w * ps >= cw) ox = clamp(ox, cw - FP.w * ps, 0);
      if (FP.h * ps >= ch) oy = clamp(oy, ch - FP.h * ps, 0);
      return { ps: ps, ox: ox, oy: oy };
    }
    // draw a full-frame photo layer in CSS px with stretched edges where it does not reach the stage edge
    function drawPhotoLayer(c, img, PF) {
      var ps = PF.ps, x0 = PF.ox, y0 = PF.oy, x1 = x0 + FP.w * ps, y1 = y0 + FP.h * ps, e = 3;
      c.drawImage(img, x0, y0, FP.w * ps, FP.h * ps);
      if (x0 > 0) c.drawImage(img, 0, 0, e, FP.h, -1, y0, x0 + 1.5, FP.h * ps);
      if (x1 < cw) c.drawImage(img, FP.w - e, 0, e, FP.h, x1 - 0.5, y0, cw - x1 + 1, FP.h * ps);
      if (y0 > 0) c.drawImage(img, 0, 0, FP.w, e, x0, -1, FP.w * ps, y0 + 1.5);
      if (y1 < ch) c.drawImage(img, 0, FP.h - e, FP.w, e, x0, y1 - 0.5, FP.w * ps, ch - y1 + 1);
      if (x0 > 0 && y0 > 0) c.drawImage(img, 0, 0, e, e, 0, 0, x0 + 1, y0 + 1);
      if (x1 < cw && y0 > 0) c.drawImage(img, FP.w - e, 0, e, e, x1 - 1, 0, cw - x1 + 1, y0 + 1);
      if (x0 > 0 && y1 < ch) c.drawImage(img, 0, FP.h - e, e, e, 0, y1 - 1, x0 + 1, ch - y1 + 1);
      if (x1 < cw && y1 < ch) c.drawImage(img, FP.w - e, FP.h - e, e, e, x1 - 1, y1 - 1, cw - x1 + 1, ch - y1 + 1);
    }
    var scr = { a: null, b: null };
    function screenCanvas(key) {
      var cv = scr[key];
      if (!cv || cv.width !== canvas.width || cv.height !== canvas.height) cv = scr[key] = makeCanvas(canvas.width, canvas.height);
      var c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, cv.width, cv.height);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      return c;
    }

    function blurCopy(src) {
      var w = src.width, h = src.height, out = makeCanvas(w, h);
      var tiny = makeCanvas(Math.max(4, w / 10), Math.max(4, h / 10)), mid = makeCanvas(Math.max(4, w / 3), Math.max(4, h / 3));
      var tc = tiny.getContext('2d'), mc = mid.getContext('2d'), oc = out.getContext('2d');
      tc.imageSmoothingQuality = mc.imageSmoothingQuality = oc.imageSmoothingQuality = 'high';
      tc.drawImage(src, 0, 0, tiny.width, tiny.height); mc.drawImage(tiny, 0, 0, mid.width, mid.height); oc.drawImage(mid, 0, 0, w, h);
      return out;
    }
    // Split final-flowers into a stems layer and one soft-weighted layer per listed element.
    // Weights sum to 1, so adding the layers with 'lighter' rebuilds the photo exactly.
    // All pixel work runs in ~8 ms slices (setTimeout), one layer per task at the end.
    function prepFlowers(k) {
      if (fin.jobK && Math.abs(k - fin.jobK) / fin.jobK <= 0.12) return;
      var job = fin.job = {}; fin.jobK = k;
      var FL = FP.fl, W = Math.ceil(FL.w * k), Hh = Math.ceil(FL.h * k), NI = FP.items.length;
      var src, datas = [], bb = [], y = 0, layers = [], L = 0;
      var ix = FP.items.map(function (it) { return (it.c[0] - FL.x) * k; }), iy = FP.items.map(function (it) { return (it.c[1] - FL.y) * k; }), ir = FP.items.map(function (it) { return it.r * k; });
      var dist = new Float32Array(NI), wts = new Float32Array(NI);
      function alive() { return fin.job === job && !destroyed; }
      function put(Li, o, x, yy, w) {
        var d = datas[Li];
        d[o] = src[o]; d[o + 1] = src[o + 1]; d[o + 2] = src[o + 2]; d[o + 3] = Math.round(src[o + 3] * w);
        var B = bb[Li]; if (x < B[0]) B[0] = x; if (yy < B[1]) B[1] = yy; if (x > B[2]) B[2] = x; if (yy > B[3]) B[3] = yy;
      }
      function start() {
        if (!alive()) return;
        var c = makeCanvas(W, Hh).getContext('2d');
        c.drawImage(fin.flowers, 0, 0, W, Hh);
        src = c.getImageData(0, 0, W, Hh).data;
        for (var j = 0; j <= NI; j++) bb.push([W, Hh, -1, -1]);
        setTimeout(alloc, 0);
      }
      function alloc() { // a few MB per layer; spread over tasks
        if (!alive()) return;
        var until = performance.now() + 8;
        while (datas.length <= NI && performance.now() < until) datas.push(new Uint8ClampedArray(W * Hh * 4));
        setTimeout(datas.length <= NI ? alloc : slice, 0);
      }
      function slice() {
        if (!alive()) return;
        var until = performance.now() + 8, j;
        for (; y < Hh && performance.now() < until; y++) for (var x = 0; x < W; x++) {
          var o = (y * W + x) * 4; if (src[o + 3] < 3) continue;
          var r = src[o], g = src[o + 1], b = src[o + 2];
          // dark green / olive stems
          if (g >= r * 0.72 && g > b * 1.05 && r + g + b < 330) { put(NI, o, x, y, 1); continue; }
          var dmin = 1e9;
          for (j = 0; j < NI; j++) { var dx = (x - ix[j]) / ir[j], dy = (y - iy[j]) / ir[j]; dist[j] = Math.sqrt(dx * dx + dy * dy); if (dist[j] < dmin) dmin = dist[j]; }
          var sum = 0;
          for (j = 0; j < NI; j++) { wts[j] = Math.exp(-(dist[j] - dmin) * 6); sum += wts[j]; }
          for (j = 0; j < NI; j++) { var w = wts[j] / sum; if (w > 0.004) put(j, o, x, y, w); }
        }
        setTimeout(y < Hh ? slice : build, 0);
      }
      function build() { // one layer per task
        if (!alive()) return;
        var B = bb[L];
        if (B[2] < 0) layers.push(null);
        else {
          var x0 = Math.max(0, B[0] - 2), y0 = Math.max(0, B[1] - 2), w = Math.min(W, B[2] + 3) - x0, h = Math.min(Hh, B[3] + 3) - y0;
          var cv = makeCanvas(w, h), cc = cv.getContext('2d'), id = cc.createImageData(w, h), d = id.data, sd = datas[L];
          for (var yy = 0; yy < h; yy++) { var so = ((yy + y0) * W + x0) * 4; d.set(sd.subarray(so, so + w * 4), yy * w * 4); }
          cc.putImageData(id, 0, 0);
          layers.push({ cv: cv, blur: L < NI ? blurCopy(cv) : null, x: x0, y: y0, w: w, h: h });
        }
        datas[L] = null; L++;
        if (L <= NI) { setTimeout(build, 0); return; }
        // upload each layer (and the scratch canvases) in its own task before going live
        var cS = makeCanvas(W, Hh), tmp = makeCanvas(W, Hh), queue = [];
        layers.forEach(function (Ly) { if (Ly) { queue.push(Ly.cv); if (Ly.blur) queue.push(Ly.blur); } });
        queue.push(cS, tmp);
        (function up() {
          if (!alive()) return;
          var cv = queue.shift();
          if (cv) { var wc = warm.getContext('2d'); wc.drawImage(cv, 0, 0, 1, 1); if (cv === cS || cv === tmp) cv.getContext('2d').clearRect(0, 0, 1, 1); setTimeout(up, 0); return; }
          fin.layers = layers; fin.k = k; fin.finalKey = ''; fin.job = null;
          fin.cS = cS; fin.tmp = tmp;
          fin.ready = true;
          screenCanvas('a'); screenCanvas('b');
          if (paused || !raf) draw();
        })();
      }
      setTimeout(start, 0);
    }

    function composeFlowers(T) {
      var k = fin.k, W = fin.cS.width, Hh = fin.cS.height, NI = FP.items.length, FL = FP.fl;
      var done = T.wipe >= 1 && T.items.every(function (h) { return h.s >= 1; });
      var key = done ? 'final' + k : '';
      if (key && fin.finalKey === key) return;
      var c = fin.cS.getContext('2d'), tc = fin.tmp.getContext('2d');
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, W, Hh);
      // stems: feathered upward wipe from the rim
      var st = fin.layers[NI];
      if (st && T.wipe > 0) {
        if (T.wipe >= 1) c.drawImage(st.cv, st.x, st.y);
        else {
          var feather = 140 * k, rimY = (FP.jar.rim - FL.y) * k, wy0 = lerp(rimY + 20 * k, -feather, T.wipe);
          drawGrad(c, tc, st, wy0, feather, true, 1);
        }
      }
      FP.items.forEach(function (it, i) {
        var Ly = fin.layers[i], hd = T.items[i];
        if (!Ly || hd.rb <= 0) return;
        var cx = (it.c[0] - FL.x) * k, cy = (it.c[1] - FL.y) * k, sz = it.r * k;
        c.globalCompositeOperation = 'lighter';
        if (it.kind === 'down') {        // hanging amaranthus: a downward wipe
          if (hd.s >= 1) c.drawImage(Ly.cv, Ly.x, Ly.y);
          else { var f2 = 90 * k; drawGrad(c, tc, Ly, lerp(Ly.y - f2, Ly.y + Ly.h, hd.rs), f2, false, 1); }
          c.globalCompositeOperation = 'source-over';
          return;
        }
        c.globalCompositeOperation = 'source-over';
        var ab = (1 - hd.s) * smooth(clamp(hd.rb * 1.6, 0, 1)) * 0.6;
        if (ab > 0.01) drawMasked(c, tc, Ly, Ly.blur, cx, cy, sz * 2.4 * hd.rb, ab, 'source-over');
        if (hd.rs > 0) {
          if (hd.s >= 1) { c.globalCompositeOperation = 'lighter'; c.drawImage(Ly.cv, Ly.x, Ly.y); }
          else {
            var un = seg(hd.s, 0.8, 1);
            drawMasked(c, tc, Ly, Ly.cv, cx, cy, sz * 2.4 * hd.rs, 1 - un, 'lighter');
            if (un > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = un; c.drawImage(Ly.cv, Ly.x, Ly.y); c.globalAlpha = 1; }
          }
          c.globalCompositeOperation = 'source-over';
          var lift = Math.sin(PI * hd.s) * 0.12;
          if (lift > 0.005) {
            c.globalCompositeOperation = 'source-atop';
            var g = c.createRadialGradient(cx, cy, 0, cx, cy, sz * 1.3);
            g.addColorStop(0, 'rgba(255,226,200,' + lift + ')'); g.addColorStop(1, 'rgba(255,226,200,0)');
            c.fillStyle = g; c.fillRect(cx - sz * 1.3, cy - sz * 1.3, sz * 2.6, sz * 2.6);
            c.globalCompositeOperation = 'source-over';
          }
        }
      });
      fin.finalKey = key;
    }
    // one layer through a soft disc (cached texture)
    function drawMasked(c, tc, Ly, img, cx, cy, rad, alpha, op) {
      tc.globalCompositeOperation = 'source-over'; tc.clearRect(Ly.x, Ly.y, Ly.w, Ly.h);
      tc.drawImage(img, Ly.x, Ly.y);
      tc.globalCompositeOperation = 'destination-in';
      tc.save(); tc.beginPath(); tc.rect(Ly.x, Ly.y, Ly.w, Ly.h); tc.clip();
      tc.drawImage(disc, cx - rad, cy - rad, 2 * rad, 2 * rad);
      tc.restore();
      tc.globalCompositeOperation = 'source-over';
      if (alpha <= 0) return;
      c.globalCompositeOperation = op; c.globalAlpha = alpha;
      c.drawImage(tc.canvas, Ly.x, Ly.y, Ly.w, Ly.h, Ly.x, Ly.y, Ly.w, Ly.h);
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
    // one layer through a feathered horizontal edge at y; up = reveal below the edge (stems rising)
    function drawGrad(c, tc, Ly, y, feather, up, alpha) {
      tc.globalCompositeOperation = 'source-over'; tc.clearRect(Ly.x, Ly.y, Ly.w, Ly.h);
      tc.drawImage(Ly.cv, Ly.x, Ly.y);
      tc.globalCompositeOperation = 'destination-in';
      var g = tc.createLinearGradient(0, y, 0, y + feather);
      g.addColorStop(0, up ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)'); g.addColorStop(1, up ? 'rgba(0,0,0,1)' : 'rgba(0,0,0,0)');
      tc.fillStyle = g; tc.fillRect(Ly.x, Ly.y, Ly.w, Ly.h);
      tc.globalCompositeOperation = 'source-over';
      c.globalAlpha = alpha;
      c.drawImage(tc.canvas, Ly.x, Ly.y, Ly.w, Ly.h, Ly.x, Ly.y, Ly.w, Ly.h);
      c.globalAlpha = 1;
    }
    function drawFlowersLayer(T, PF) {
      if (!fin.ready || T.wipe <= 0) return;
      composeFlowers(T);
      var FL = FP.fl, pv = FP.pivot;
      ctx.save();
      ctx.setTransform(dpr * PF.ps, 0, 0, dpr * PF.ps, dpr * PF.ox, dpr * PF.oy);
      ctx.translate(pv[0], pv[1]); ctx.scale(T.flScale, T.flScale); ctx.translate(-pv[0], -pv[1]);
      ctx.drawImage(fin.cS, FL.x, FL.y, FL.w, FL.h);
      ctx.restore();
    }

    // ---- smoke ----
    function drawSmoke(T, p, t) {
      WICKS.forEach(function (w, i) {
        var age = seg(p, T.ext[i] + 0.004, T.ext[i] + 0.066);
        if (age <= 0 || age >= 1 || w._tx == null) return;
        var str = smooth(seg(age, 0, 0.15)) * (1 - smooth(seg(age, 0.45, 1)));
        if (str < 0.005) return;
        var len = 40 + 230 * outCubic(age), x0 = w._tx, y0 = w._ty;
        var detach = smooth(seg(age, 0.3, 1)) * len * 0.55;
        var col = 'rgba(232,222,214,';
        var tt = reduce ? 0 : t, drift = (i - 1) * 18 + (hash(i * 3.1) - 0.5) * 20;
        for (var sI = 0; sI < 3; sI++) {
          var N = 44, pts = [];
          for (var k = 0; k <= N; k++) {
            var u = k / N, yy = y0 - detach - u * (len - detach), uu = (y0 - yy) / 280;
            var curl = Math.sin(uu * 10 + tt * 1.1 + sI * 1.9 + i * 2.3) * (2 + 22 * uu) * uu
                     + (fbm(uu * 3.2 - tt * 0.35 + i * 7.1 + sI * 1.3) - 0.5) * (6 + 70 * uu * uu);
            pts.push([x0 + curl + drift * uu * uu, yy, u]);
          }
          for (k = 0; k < N; k++) {
            var pa = pts[k], pb = pts[k + 1];
            for (var sub = 0; sub < 3; sub++) {
              var f2 = sub / 3, u2 = pa[2] + (pb[2] - pa[2]) * f2;
              var thick = 0.55 + 0.9 * noise(u2 * 7 + i * 4 + sI * 2.7 + tt * 0.3);
              var al = str * 0.16 * Math.pow(1 - u2, 1.3) * smooth(seg(u2, 0, 0.1)) * (sI === 0 ? 1 : 0.6) * (0.6 + 0.6 * thick);
              if (al < 0.003) continue;
              var rad = (1.1 + 12 * u2 * u2 + 2 * u2 + sI * 0.6) * thick;
              ctx.globalAlpha = al;
              ctx.drawImage(puff, lerp(pa[0], pb[0], f2) - rad, lerp(pa[1], pb[1], f2) - rad, rad * 2, rad * 2);
            }
          }
          ctx.globalAlpha = 1;
          if (sI === 0) {
            var gfl = ctx.createLinearGradient(0, y0, 0, y0 - len);
            gfl.addColorStop(0, col + '0)'); gfl.addColorStop(0.05, col + (0.5 * str) + ')');
            gfl.addColorStop(0.5, col + (0.14 * str) + ')'); gfl.addColorStop(1, col + '0)');
            ctx.strokeStyle = gfl; ctx.lineWidth = 0.5; ctx.lineJoin = 'round';
            ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
            for (k = 1; k <= N; k++) ctx.lineTo(pts[k][0], pts[k][1]);
            ctx.stroke();
          }
        }
      });
    }

    // ---------- loop ----------
    function frame(now) {
      raf = 0; if (destroyed || paused) return;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
      clock += dt;
      if (ign.anim) stepIgnite(dt);
      if (ign.sparks.length) stepSparks(dt);
      if (playing) {
        if (playing.start == null) playing.start = now;
        var e = (now - playing.start) / 1000 / playing.dur;
        target = clamp(e, 0, 1);
        if (e >= 1) finishPlay();
      }
      var w = 15, diff = target - pos;
      vel += (w * w * diff - 2 * w * vel) * dt; pos += vel * dt;
      if (Math.abs(diff) < 1e-5 && Math.abs(vel) < 1e-5) { pos = target; vel = 0; }
      draw();
      raf = requestAnimationFrame(frame);
    }
    // ---------- ignition ----------
    function flameCurve(u) { // bead → full height with organic overshoot that settles
      if (u <= 0) return 0;
      return clamp(1 - Math.exp(-u * 5.2) * Math.cos(u * 8.5) - 0.0 * u, 0, 1.18);
    }
    function stepIgnite(dt) {
      var A = ign.anim; A.t += dt;
      if (A.reduce) {
        var k = clamp(A.t / 0.4, 0, 1);
        ign.w = [k, k, k]; ign.light = k;
      } else {
        var sum = 0;
        IGN_ORDER.forEach(function (wi, n) {
          var u = A.t - n * IGN_GAP;              // seconds since this wick was struck
          if (u >= 0 && !A.struck[n]) { A.struck[n] = true; spawnSparks(wi); }
          ign.flares[wi] = u >= 0 ? Math.exp(-u * 14) * (u < 0.02 ? u / 0.02 : 1) : 0;
          var g = u > 0.06 ? flameCurve((u - 0.06) / 0.95) : 0;
          ign.w[wi] = g; ign.boost[wi] = u > 0 ? Math.exp(-u * 2.2) : 0;
          sum += Math.min(g, 1);
        });
        // room light follows the flames, then eases fully home
        ign.light = Math.max(Math.pow(sum / 3, 1.2) * 0.92, smooth(clamp((A.t - 0.4) / (IGN_DUR - 0.5), 0, 1)));
      }
      if (A.t >= (A.reduce ? 0.4 : IGN_DUR)) finishIgnite();
    }
    function finishIgnite() {
      var A = ign.anim; if (!A) return;
      ign.anim = null; ign.lit = true; ign.w = [1, 1, 1]; ign.light = 1; ign.boost = [0, 0, 0]; ign.flares = [0, 0, 0];
      clearTimeout(A.timer); A.resolve();
    }
    function spawnSparks(wi) {
      var r = rng((clock * 1000 | 0) + wi * 77);
      for (var k = 0; k < 9; k++) {
        var a = -PI / 2 + (r() - 0.5) * 2.4, v = 25 + r() * 45;
        ign.sparks.push({ i: wi, x: 0, y: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.18 + r() * 0.22 });
      }
    }
    function stepSparks(dt) {
      ign.sparks.forEach(function (sp) { sp.age += dt; sp.vy += 60 * dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt; });
      ign.sparks = ign.sparks.filter(function (sp) { return sp.age < sp.life; });
    }

    function finishPlay() {
      if (!playing) return;
      var pr = playing; playing = null; clearTimeout(pr.timer); target = 1; pr.resolve();
    }
    function start() { if (!raf && !paused && !destroyed) { last = 0; raf = requestAnimationFrame(frame); } }

    resize();
    start();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (paused) draw(); });

    return {
      setProgress: function (p) { if (playing) return; target = clamp(+p || 0, 0, 1); },
      _jump: function (p) { target = pos = clamp(+p || 0, 0, 1); vel = 0; draw(); },
      play: function (sec) {
        sec = sec || 14;
        if (playing) finishPlay();
        return new Promise(function (res) {
          pos = 0; vel = 0; target = 0;
          playing = { start: null, dur: sec, resolve: res };
          playing.timer = setTimeout(finishPlay, sec * 1000 + 600);
          start();
        });
      },
      isLit: function () { return ign.lit; },
      ignite: function () {
        if (ign.lit && !ign.anim) return Promise.resolve();
        if (ign.anim) return ign.anim.promise;
        var A = { t: 0, reduce: reduce, struck: [false, false, false] };
        A.promise = new Promise(function (res) { A.resolve = res; });
        // safety net when frames are throttled (hidden tab)
        A.timer = setTimeout(function () { if (ign.anim === A) { finishIgnite(); draw(); } }, ((reduce ? 0.4 : IGN_DUR) + 1.5) * 1000);
        ign.anim = A; start();
        return A.promise;
      },
      setPaused: function (b) { paused = !!b; if (paused) { if (raf) cancelAnimationFrame(raf); raf = 0; } else start(); },
      destroy: function () {
        destroyed = true; if (raf) cancelAnimationFrame(raf); raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
        if (playing) finishPlay();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  window.MYLStage = { mount: mount };
})();
