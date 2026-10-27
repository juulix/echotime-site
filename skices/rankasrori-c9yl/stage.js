/* Rankas Rori — "Viens betons, trīs ceļi" motion stage.
 * Single canvas 2D renderer drawn like a technical drawing / section.
 * World units = centimetres, ground line at y = 0, y grows downward (canvas convention).
 *
 * API: window.RRStage.mount(el) -> { setProgress(p), play(sec), setPaused(b), destroy() }
 *
 * Timeline (progress p; text beats switch at 0.08, 0.26, 0.50, 0.76, 0.93):
 *   0.00–0.08 hero        plant drawing draws itself in on mount (~1.3 s); labels, slow push-in
 *   0.08–0.26 mezgls      cement (screw), aggregate 5/8 · 8/16 (belt), water dose into the mixer;
 *                         paddles spin, layers blend into one mix; readout C12/15 → C25/30
 *                         photo: mezgls.jpg (0.10–0.28)
 *   0.20–0.28             mix discharges through the chute into the truck drum
 *   0.285–0.375 transport truck drives from the plant to the site (camera follows)
 *   0.375–0.445           outriggers + pump boom unfolds over the formwork
 *   0.425–0.50            slab fills, pour point sweeps, screed levels the surface
 *                         photos: sukne-1.jpg (0.29–0.43), platne-3.jpg (0.41–0.53)
 *   0.50–0.555 camera     push-in to the precast floor
 *   0.51–0.61 grods       red mould fills, lifts off → KC 10-7.5 with Ø1200 / Ø1000 / H 750 dims
 *   0.575–0.65 FBS        mould fills, lifts → FBS 24-3-6, 2400 / 600 dims, lifting loops
 *   0.655–0.75 LB         seven LB blocks drop into a bonded wall (studs on top)
 *                         photos: grodi-laukums.jpg (0.53–0.66), lb-veidnes.jpg (0.64–0.78)
 *   0.75–0.80 camera      pans to the ground section (break lines at both ends)
 *   0.765–0.835 dig       mini excavator digs the trench + pits (moves right, faces left)
 *   0.825–0.875           base, 2 rings, lid Z/Z lowered into the well; bio tank lowered
 *   0.83–0.895            pipes: kanalizācija (house → well → tank → out), ūdensvads, meliorācija
 *   0.87–0.95             excavator back-fills (left → right, exits)
 *                         photo: bio-bedre.jpg (0.79–0.94)
 *   0.93–1.00 fināls      ground closes (section covered), grass grows, only lids stay visible;
 *                         camera pulls back; photo: zalaja-vaks.jpg
 */
(function () {
  'use strict';

  // ---------- math ----------
  var PI = Math.PI, TAU = PI * 2;
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function seg(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  function sm(t) { return t * t * (3 - 2 * t); }
  function ioc(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function oc(t) { return 1 - Math.pow(1 - t, 3); }
  function ob(t) { var s = 1.3, u = t - 1; return 1 + (s + 1) * u * u * u + s * u * u; }
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function hash2(x, y) { return hash(x * 157.31 + y * 31.77); }
  function frac(x) { return x - Math.floor(x); }
  function plen(pts) { var L = 0; for (var i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
  function along(pts, u) { // point at fraction u of a polyline
    var L = plen(pts) * clamp(u, 0, 1);
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L <= l || i === pts.length - 1) { var t = l ? clamp(L / l, 0, 1) : 0; return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; }
      L -= l;
    }
    return pts[pts.length - 1];
  }

  // ---------- palette ----------
  var COL = {
    bg: '#D9D6D0', panel: '#E2DFD9', ink: '#161616', red: '#C42A23', redD: '#9E1F1A',
    conc: '#ECE9E3', concS: '#CBC6BD', concD: '#A8A299', mix: '#9A948B', wet: '#7F796F',
    top: '#5C4532', sand: '#C9A876', clay: '#8C6C4C', fill: '#D8BF92', grass: '#67713F',
    air: '#E6E3DD', tank: '#F4F2ED', closeSoil: '#6A5240',
    yel: '#E0AE2E', yelD: '#B88A16', binD: '#2C2C2A', trench: '#735843', shadow: 'rgba(22,22,22,0.16)'
  };
  var MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- photos (shared between mounts) ----------
  var IMG = {};
  function img(name) {
    if (!IMG[name]) {
      var im = new Image();
      im.decoding = 'async';
      im.onload = function () {
        // decode off the main thread before the first drawImage, so a card never stalls a frame
        if (im.decode) im.decode().then(function () { im._ok = true; }, function () { im._ok = true; }); else im._ok = true;
      };
      im.onerror = function () { im._ok = false; };
      im.src = 'img/' + name + '.jpg';
      IMG[name] = im;
    }
    return IMG[name];
  }
  // a..b fade/reveal in, c..d fade out; fy = vertical focus for cover-crop
  var CARDS = [
    { img: 'mezgls',        a: 0.10, b: 0.15, c: 0.25, d: 0.28, fy: 0.55, cap: 'Betona mezgls' },
    { img: 'sukne-1',       a: 0.29, b: 0.33, c: 0.40, d: 0.43, fy: 0.62, cap: 'Miksers ar sūkni' },
    { img: 'platne-3',      a: 0.41, b: 0.45, c: 0.50, d: 0.53, fy: 0.62, cap: 'Betonēšana objektā' },
    { img: 'grodi-laukums', a: 0.53, b: 0.57, c: 0.63, d: 0.66, fy: 0.55, cap: 'Grodi laukumā' },
    { img: 'lb-veidnes',    a: 0.64, b: 0.68, c: 0.75, d: 0.78, fy: 0.5,  cap: 'LB bloki un veidnes' },
    { img: 'bio-bedre',     a: 0.79, b: 0.83, c: 0.91, d: 0.94, fy: 0.5,  cap: 'Iekārtas uzstādīšana' },
    { img: 'zalaja-vaks',   a: 0.93, b: 0.975, c: 9, d: 9,      fy: 0.55, cap: 'Vāks zālienā' }
  ];

  // ---------- camera keys: [p, x0, y0, x1, y1] world rect to frame ----------
  var CAM = [
    [0.000, -150, -1950, 3000, 200],
    [0.080, 150, -1760, 2900, 110],
    [0.180, 950, -1260, 2600, 20],
    [0.270, 900, -1160, 2800, 80],
    [0.360, 2450, -1150, 5100, 150],
    [0.445, 2950, -1250, 5600, 150],
    [0.500, 4200, -820, 5700, 150],
    [0.555, 6050, -170, 6290, 35],
    [0.620, 6060, -180, 6580, 55],
    [0.700, 6060, -270, 7030, 65],
    [0.765, 7300, -800, 10200, 420],
    [0.800, 7900, -430, 9800, 300],
    [0.835, 8650, -430, 10650, 300],
    [0.850, 8300, -400, 9750, 280],
    [0.900, 7950, -430, 10100, 300],
    [0.955, 7850, -560, 9900, 280],
    [1.000, 7650, -640, 10100, 300]
  ];
  function camAt(p) {
    var i = 0;
    while (i < CAM.length - 2 && p > CAM[i + 1][0]) i++;
    var A = CAM[i], B = CAM[i + 1];
    var t = seg(p, A[0], B[0]); t = lerp(t, sm(t), 0.55);
    var aw = A[3] - A[1], ah = A[4] - A[2], bw = B[3] - B[1], bh = B[4] - B[2];
    return {
      cx: lerp((A[1] + A[3]) / 2, (B[1] + B[3]) / 2, t),
      cy: lerp((A[2] + A[4]) / 2, (B[2] + B[4]) / 2, t),
      w: Math.exp(lerp(Math.log(aw), Math.log(bw), t)),
      h: Math.exp(lerp(Math.log(ah), Math.log(bh), t))
    };
  }

  // ---------- static plant geometry (polylines, drawn in on mount) ----------
  function R(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]; }
  var INC_A = [2075, -150], INC_B = [1560, -930];
  var INC_N = (function () { var dx = INC_B[0] - INC_A[0], dy = INC_B[1] - INC_A[1], l = Math.hypot(dx, dy); return [-dy / l, dx / l]; })();
  if (INC_N[1] > 0) { INC_N[0] = -INC_N[0]; INC_N[1] = -INC_N[1]; }
  function off(pt, n, d) { return [pt[0] + n[0] * d, pt[1] + n[1] * d]; }
  var SCREW_A = [420, -480], SCREW_B = [1170, -905];
  var SCREW_N = (function () { var dx = SCREW_B[0] - SCREW_A[0], dy = SCREW_B[1] - SCREW_A[1], l = Math.hypot(dx, dy); return [-dy / l, dx / l]; })();

  var PLANT = [
    // silo
    { pts: R(270, -1700, 570, -750), fill: COL.conc, lw: 1.4 },
    { pts: [[270, -750], [405, -470], [435, -470], [570, -750]], fill: COL.conc, lw: 1.4 },
    { pts: [[270, -1700], [300, -1752], [540, -1752], [570, -1700]], fill: COL.concS, lw: 1.2 },
    { pts: [[276, -1800], [564, -1800]], lw: 1 },
    { pts: [[290, -1752], [290, -1800], [420, -1800], [420, -1752], [550, -1752], [550, -1800]], lw: 0.8 },
    { pts: [[270, -1460], [570, -1460]], lw: 0.6 }, { pts: [[270, -1220], [570, -1220]], lw: 0.6 }, { pts: [[270, -980], [570, -980]], lw: 0.6 },
    { pts: [[292, -750], [292, 0]], lw: 1.3 }, { pts: [[548, -750], [548, 0]], lw: 1.3 },
    { pts: [[292, -740], [548, -380], [292, -20]], lw: 0.7 }, { pts: [[548, -740], [292, -380], [548, -20]], lw: 0.7 },
    { pts: [[592, -1752], [592, -40]], lw: 0.7 }, { pts: [[612, -1752], [612, -40]], lw: 0.7 },
    // screw conveyor cement → mixer
    { pts: [off(SCREW_A, SCREW_N, 16), off(SCREW_B, SCREW_N, 16)], lw: 1.1 },
    { pts: [off(SCREW_A, SCREW_N, -16), off(SCREW_B, SCREW_N, -16)], lw: 1.1 },
    { pts: [[700, -640], [700, 0]], lw: 0.9 }, { pts: [[950, -780], [950, 0]], lw: 0.9 },
    // mixer house
    { pts: R(1100, -900, 1600, -640), fill: COL.conc, lw: 1.4 },
    { pts: R(1150, -870, 1550, -670), lw: 0.9 },
    { pts: R(1120, -1040, 1262, -900), fill: COL.conc, lw: 1.2 },
    { pts: [[1262, -980], [1300, -980], [1300, -900]], lw: 1 },
    { pts: [[1060, -640], [1640, -640]], lw: 1.6 },
    // yellow steel tower (MEKA): legs, bracing, top railing, stair to the platform
    { pts: [[1090, -640], [1090, 0]], lw: 1.3, sc: COL.yelD }, { pts: [[1610, -640], [1610, 0]], lw: 1.3, sc: COL.yelD },
    { pts: [[1090, -630], [1610, -330]], lw: 0.7, sc: COL.yelD }, { pts: [[1610, -630], [1090, -330]], lw: 0.7, sc: COL.yelD },
    { pts: [[1090, -320], [1610, -320]], lw: 0.9, sc: COL.yelD },
    { pts: [[1080, -900], [1080, -980], [1620, -980], [1620, -900]], lw: 1.1, sc: COL.yelD },
    { pts: [[1080, -940], [1620, -940]], lw: 0.7, sc: COL.yelD },
    { pts: [[1260, -980], [1260, -900]], lw: 0.7, sc: COL.yelD }, { pts: [[1440, -980], [1440, -900]], lw: 0.7, sc: COL.yelD },
    { pts: [[1640, -640], [1905, 0]], lw: 1.3, sc: COL.yelD }, { pts: [[1680, -640], [1945, 0]], lw: 1.3, sc: COL.yelD },
    { pts: [[1640, -640], [1640, -720], [1905, -80]], lw: 0.8, sc: COL.yelD },
    { pts: [[1310, -640], [1330, -470], [1370, -470], [1390, -640]], fill: COL.concS, lw: 1.1 },
    // inclined belt bin → mixer
    { pts: [off(INC_A, INC_N, 14), off(INC_B, INC_N, 14)], lw: 1.2 },
    { pts: [off(INC_A, INC_N, -14), off(INC_B, INC_N, -14)], lw: 1.2 },
    { pts: [[1820, -470], [1820, 0]], lw: 0.9 }, { pts: [[1990, -270], [1990, 0]], lw: 0.9 },
    // one wide low 4-compartment aggregate bin, as on the photo
    { pts: [[2040, -380], [2900, -380], [2900, -250], [2040, -250], [2040, -380]], fill: COL.binD, lw: 1.4 },
    { pts: [[2040, -250], [2093, -165], [2202, -165], [2255, -250], [2308, -165], [2417, -165], [2470, -250], [2523, -165], [2632, -165], [2685, -250], [2738, -165], [2847, -165], [2900, -250]], fill: COL.binD, lw: 1.3 },
    { pts: [[2255, -380], [2255, -250]], lw: 0.8 }, { pts: [[2470, -380], [2470, -250]], lw: 0.8 }, { pts: [[2685, -380], [2685, -250]], lw: 0.8 },
    { pts: [[2040, -150], [2900, -150]], lw: 1.1 }, { pts: [[2040, -128], [2900, -128]], lw: 1.1 },
    { pts: [[2050, -150], [2050, 0]], lw: 1.3 }, { pts: [[2470, -150], [2470, 0]], lw: 1.3 }, { pts: [[2890, -150], [2890, 0]], lw: 1.3 }
  ];
  PLANT.forEach(function (s) { s.len = plen(s.pts); });

  // aggregate: compartment outlet → collecting belt → incline → mixer inlet
  var BIN_X = [2147, 2362, 2577, 2792];
  var PEB_PATH = [
    [[2362, -165], [2362, -158], [2075, -158], off(INC_B, INC_N, 22), [1520, -880]],
    [[2577, -165], [2577, -158], [2075, -158], off(INC_B, INC_N, 22), [1520, -880]]
  ];
  PEB_PATH[0][2] = off(INC_A, INC_N, 22); PEB_PATH[1][2] = off(INC_A, INC_N, 22);

  // ---------- ground section helpers ----------
  var SEC_X0 = 7250, SEC_X1 = 10650;
  function pipeY(x) {
    if (x < 8800) return lerp(100, 140, (x - 8300) / 500);
    if (x < 9330) return lerp(150, 165, (x - 8920) / 410);
    return lerp(180, 205, (x - 9471) / 1129);
  }
  function bottomY(x) {
    var b = pipeY(x) + 24;
    if (x >= 8760 && x <= 8960) b = Math.max(b, 186);
    if (x >= 9290 && x <= 9511) b = Math.max(b, 246);
    return b;
  }

  // ---------- layout of the stage (css px) ----------
  function layout(W, H) {
    var mob = W < 560;
    var L = { mob: mob };
    if (!mob) {
      L.panelY = Math.round(H * 0.67);
      L.draw = { x: W * 0.09, y: H * 0.055, w: W * 0.87, h: L.panelY - H * 0.055 - 26 };
      var ch = Math.max(90, H - L.panelY - 58), cw = Math.min(W * 0.46, ch * 1.45);
      ch = cw / 1.45;
      L.card = { x: W - 24 - cw, y: L.panelY + 34, w: cw, h: ch };
      L.block = { x: W * 0.09, y: L.panelY + 22, w: L.card.x - W * 0.09 - 28 };
      L.fs = { lab: 10.5, val: 27, sub: 11.5, tag: 10.5, cap: 10 };
    } else {
      L.panelY = Math.round(H * 0.56);
      L.draw = { x: W * 0.035, y: H * 0.035, w: W * 0.93, h: L.panelY - H * 0.035 - 14 };
      var cw2 = Math.min(W * 0.44, 210), ch2 = cw2 / 1.45;
      L.card = { x: W - 14 - cw2, y: L.panelY + 22, w: cw2, h: ch2 };
      L.block = { x: 14, y: L.panelY + 12, w: L.card.x - 14 - 14 };
      L.fs = { lab: 9, val: 18, sub: 9.5, tag: 9, cap: 8.5 };
    }
    return L;
  }

  function blockInfo(p) {
    if (p < 0.08) return ['RASĒJUMS', 'BETONA MEZGLS', 'cements · šķemba · ūdens'];
    if (p < 0.26) {
      var i = Math.min(3, Math.floor(seg(p, 0.11, 0.235) * 4));
      return ['MARKA', ['C 12/15', 'C 16/20', 'C 20/25', 'C 25/30'][i], 'šķemba / oļi 5/8 · 8/16'];
    }
    if (p < 0.50) return ['TRANSPORTBETONS', 'C 25/30', p < 0.375 ? 'piegāde' : 'sūknēšana objektā'];
    if (p < 0.605) return ['GRODS', 'KC 10-7.5', 'Ø1200 / Ø1000 · H 750 · 625 kg'];
    if (p < 0.665) return ['PAMATU BLOKS', 'FBS 24-3-6', '2400 × 300 × 600 · 970 kg'];
    if (p < 0.76) return ['SALIEKAMAIS BLOKS', 'LB 18-6-6', 'L 1800 · H 600 · 1550 kg'];
    if (p < 0.93) return ['ĀRĒJIE TĪKLI', 'KANALIZĀCIJA', p < 0.835 ? 'tranšejas rakšana' : p < 0.899 ? 'grodu aka · attīrīšanas iekārta' : 'aizbēršana'];
    return ['VIRS ZEMES', 'VĀKS Z/Z', 'zaļās zonas vāks'];
  }

  // drum speed by phase: slow agitation, fast while charging, reverse while discharging
  function drumRate(p) {
    if (p < 0.20) return 0.6;
    if (p < 0.285) return lerp(0.6, 2.6, sm(seg(p, 0.20, 0.22)));
    if (p < 0.43) return lerp(2.6, 1.0, sm(seg(p, 0.285, 0.3)));
    if (p < 0.5) return lerp(1.0, -2.4, sm(seg(p, 0.43, 0.445)));
    return lerp(-2.4, 0.4, sm(seg(p, 0.5, 0.52)));
  }

  // =====================================================================
  function mount(el) {
    var cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'display:block;width:100%;height:100%;';
    el.appendChild(cv);
    var ctx = cv.getContext('2d');
    CARDS.forEach(function (c) { img(c.img); });

    var W = 1, H = 1, K = 1, L = layout(1, 1);
    var target = 0, pos = 0, vel = 0, paused = false, raf = 0, last = 0, tAmb = 0;
    var mountT = performance.now(), playing = null, destroyed = false;
    var cardCv = document.createElement('canvas'), cctx = cardCv.getContext('2d');
    var pores = null, poreTile = null;
    var lastVal = '', valT = -9, drumAng = 0;
    // view state (filled per frame)
    var s = 1, ox = 0, oy = 0, ip = 1, vx0 = 0, vx1 = 0, vy0 = 0, vy1 = 0;

    // pores texture: built once, in small chunks so mount never blocks a frame
    (function buildPores() {
      var N = 220, c = document.createElement('canvas'); c.width = c.height = N;
      var g = c.getContext('2d'), row = 0;
      function chunk() {
        var t0 = performance.now();
        while (row < N && performance.now() - t0 < 8) {
          for (var x = 0; x < N; x += 2) {
            var h = hash2(x, row);
            if (h > 0.93) { g.fillStyle = 'rgba(22,22,22,' + (0.05 + 0.09 * hash2(row, x)).toFixed(3) + ')'; g.fillRect(x, row, h > 0.985 ? 2 : 1, h > 0.985 ? 2 : 1); }
            else if (h < 0.05) { g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x, row, 1, 1); }
          }
          row += 1;
        }
        if (row < N && !destroyed) setTimeout(chunk, 0); else { pores = c; poreTile = null; }
      }
      setTimeout(chunk, 0);
    })();

    function resize() {
      var r = el.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
      K = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * K); cv.height = Math.round(H * K);
      L = layout(W, H);
      poreTile = null;
      if (paused || REDUCED) render(performance.now());
    }
    var ro = ('ResizeObserver' in window) ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', resize);
    resize();

    // ---------- coordinate helpers ----------
    function setView(p) {
      var c = camAt(p), D = L.draw;
      s = Math.min(D.w / c.w, D.h / c.h);
      ox = D.x + D.w / 2 - c.cx * s; oy = D.y + D.h / 2 - c.cy * s;
      ip = 1 / s;
      vx0 = -ox / s; vx1 = (W - ox) / s; vy0 = -oy / s; vy1 = (H - oy) / s;
    }
    function world() { ctx.setTransform(K * s, 0, 0, K * s, K * ox, K * oy); }
    function screen() { ctx.setTransform(K, 0, 0, K, 0, 0); }
    function sx(x) { return ox + x * s; }
    function sy(y) { return oy + y * s; }
    function visible(x0, x1) { return x1 > vx0 - 50 && x0 < vx1 + 50; }

    function path(pts, close) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); if (close) ctx.closePath(); }
    function strokeW(px, col) { ctx.lineWidth = px * ip; ctx.strokeStyle = col || COL.ink; ctx.stroke(); }
    function fillC(col) { ctx.fillStyle = col; ctx.fill(); }
    function rectP(x0, y0, x1, y1) { ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); }
    function line(x0, y0, x1, y1, px, col) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); strokeW(px, col); }
    function setFont(px, w) { ctx.font = (w || 500) + ' ' + px + 'px ' + MONO; }
    function spacing(v) { if ('letterSpacing' in ctx) ctx.letterSpacing = v; }

    // screen-space label with leader: anchor world (wx,wy) → text offset (dx,dy) px
    function label(wx, wy, text, a, dx, dy) {
      if (a <= 0.01) return;
      var ax = sx(wx), ay = sy(wy), tx = ax + dx, ty = ay + dy;
      ctx.save(); screen(); ctx.globalAlpha = a;
      ctx.lineWidth = 1; ctx.strokeStyle = COL.ink;
      ctx.beginPath(); ctx.arc(ax, ay, 2.2, 0, TAU); ctx.fillStyle = COL.ink; ctx.fill();
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tx, ty); ctx.lineTo(tx + (dx >= 0 ? 10 : -10), ty); ctx.stroke();
      setFont(L.fs.tag, 500); spacing('0.08em');
      ctx.textBaseline = 'middle'; ctx.textAlign = dx >= 0 ? 'left' : 'right';
      var x = tx + (dx >= 0 ? 14 : -14);
      ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = COL.bg; ctx.strokeText(text, x, ty);
      ctx.fillStyle = COL.ink; ctx.fillText(text, x, ty);
      spacing('0px'); ctx.restore();
    }
    // label whose text sits at world height ty (keeps section labels in the "sky")
    function labelTo(wx, wy, ty, text, a, dx) { label(wx, wy, text, a, dx, sy(ty) - sy(wy)); }
    // dimension text types itself in once the line is drawn
    function dimText(wx, wy, text, a, align, base) {
      var n = Math.ceil(text.length * seg(a, 0.68, 1));
      if (n <= 0) return;
      ctx.save(); screen();
      setFont(L.fs.tag, 500); spacing('0.04em');
      ctx.textAlign = align || 'center'; ctx.textBaseline = base || 'bottom';
      var tx = text.slice(0, n);
      if (ctx.textAlign === 'center') { ctx.textAlign = 'left'; var full = ctx.measureText(text).width; var x0 = sx(wx) - full / 2; ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = COL.bg; ctx.strokeText(tx, x0, sy(wy)); ctx.fillStyle = COL.ink; ctx.fillText(tx, x0, sy(wy)); }
      else { ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = COL.bg; ctx.strokeText(tx, sx(wx), sy(wy)); ctx.fillStyle = COL.ink; ctx.fillText(tx, sx(wx), sy(wy)); }
      spacing('0px'); ctx.restore();
    }
    // dimension lines draw like a draughtsman: extension lines → dimension line from the middle → ticks
    function dimH(x0, x1, y, ext0, ext1, a) {
      if (a <= 0.01) return;
      var e = sm(seg(a, 0, 0.35)), g = sm(seg(a, 0.28, 0.68)), k = ob(seg(a, 0.6, 0.78));
      ctx.save();
      line(x0, ext0, x0, lerp(ext0, y - 4 * ip, e), 0.6); line(x1, ext1, x1, lerp(ext1, y - 4 * ip, e), 0.6);
      var m = (x0 + x1) / 2, hw = (x1 - x0) / 2 * g;
      if (g > 0) line(m - hw, y, m + hw, y, 0.8);
      if (k > 0) { var t = 5 * ip * k; line(x0 - t, y + t, x0 + t, y - t, 1.1); line(x1 - t, y + t, x1 + t, y - t, 1.1); }
      ctx.restore();
    }
    function dimV(x, y0, y1, ext, a) {
      if (a <= 0.01) return;
      var e = sm(seg(a, 0, 0.35)), g = sm(seg(a, 0.28, 0.68)), k = ob(seg(a, 0.6, 0.78));
      ctx.save();
      line(ext, y0, lerp(ext, x + 4 * ip, e), y0, 0.6); line(ext, y1, lerp(ext, x + 4 * ip, e), y1, 0.6);
      var m = (y0 + y1) / 2, hh = (y1 - y0) / 2 * g;
      if (g > 0) line(x, m - hh, x, m + hh, 0.8);
      if (k > 0) { var t = 5 * ip * k; line(x - t, y0 + t, x + t, y0 - t, 1.1); line(x - t, y1 + t, x + t, y1 - t, 1.1); }
      ctx.restore();
    }
    // soft puff of dust/steam: n blobs spreading from (x,y) with progress u (0..1)
    function puff(x, y, spread, u, seed, n, col) {
      if (u <= 0 || u >= 1 || REDUCED) return;
      ctx.save();
      for (var i = 0; i < n; i++) {
        var hx = hash(seed + i), dir = hx < 0.5 ? -1 : 1, d = (0.35 + 0.65 * hash(seed + i + 9)) * spread * oc(u);
        ctx.globalAlpha = 0.32 * (1 - u) * (0.6 + 0.4 * hash(seed + i + 4));
        ctx.beginPath(); ctx.arc(x + dir * d, y - oc(u) * spread * 0.35 * hash(seed + i + 2), spread * (0.12 + 0.22 * u) * (0.6 + 0.6 * hash(seed + i + 6)), 0, TAU);
        fillC(col || '#CFC9BF');
      }
      ctx.restore();
    }

    // ---------- background ----------
    function drawBackground() {
      screen();
      ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);
      if (pores) {
        if (!poreTile) poreTile = ctx.createPattern(pores, 'repeat');
        ctx.fillStyle = poreTile; ctx.globalAlpha = 0.9; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      }
      // drafting grid
      var g = L.mob ? 24 : 32;
      ctx.beginPath();
      for (var x = (ox % g + g) % g; x < W; x += g) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); }
      for (var y = (oy % g + g) % g; y < H; y += g) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
      ctx.strokeStyle = 'rgba(22,22,22,0.045)'; ctx.lineWidth = 1; ctx.stroke();
    }

    // ---------- ground line + earth hatch outside the section ----------
    function drawGround() {
      var band = 22 * ip, sp = 13 * ip;
      function hatch(xa, xb) {
        if (xb <= xa) return;
        ctx.save(); rectP(xa, 0, xb, band); ctx.clip();
        ctx.beginPath();
        for (var x = Math.floor(xa / sp) * sp; x < xb + band; x += sp) { ctx.moveTo(x, 0); ctx.lineTo(x - band, band); }
        strokeW(0.6, 'rgba(22,22,22,0.45)'); ctx.restore();
      }
      hatch(vx0, Math.min(vx1, SEC_X0));
      hatch(Math.max(vx0, SEC_X1), vx1);
      line(vx0 - 10, 0, Math.min(vx1, SEC_X0) + 1, 0, 1.6);
      if (vx1 > SEC_X1) line(SEC_X1, 0, vx1 + 10, 0, 1.6);
    }

    // ---------- plant ----------
    function drawPlant(p, t, intro) {
      if (!visible(250, 3000)) return;
      var N = PLANT.length;
      // fills first, then strokes (each element draws in staggered)
      for (var i = 0; i < N; i++) {
        var sh = PLANT[i], a = seg(intro, (i / N) * 0.62, (i / N) * 0.62 + 0.38);
        if (sh.fill && a > 0) { path(sh.pts, true); ctx.globalAlpha = sm(seg(a, 0.4, 1)); fillC(sh.fill); ctx.globalAlpha = 1; }
      }
      // mixer window interior
      drawMixer(p, t, intro);
      for (var j = 0; j < N; j++) {
        var sh2 = PLANT[j], a2 = seg(intro, (j / N) * 0.62, (j / N) * 0.62 + 0.38);
        if (a2 <= 0) continue;
        path(sh2.pts, false);
        if (a2 < 1) ctx.setLineDash([sh2.len * a2, sh2.len + 1]);
        strokeW(sh2.lw, sh2.sc);
        ctx.setLineDash([]);
      }
      // bin details: yellow mesh guards between the legs, painted compartment numbers, stair treads
      var dA = sm(seg(intro, 0.55, 1));
      if (dA > 0.01) {
        ctx.save(); ctx.globalAlpha = dA;
        [[2062, 2458], [2482, 2878]].forEach(function (m) {
          rectP(m[0], -118, m[1], -12); strokeW(1.2, COL.yel);
          ctx.save(); rectP(m[0], -118, m[1], -12); ctx.clip(); ctx.beginPath();
          for (var gx = m[0] - 110; gx < m[1]; gx += 16) { ctx.moveTo(gx, -12); ctx.lineTo(gx + 106, -118); ctx.moveTo(gx + 106, -12); ctx.lineTo(gx, -118); }
          strokeW(0.45, 'rgba(184,138,22,0.75)'); ctx.restore();
          for (var px = m[0] + 132; px < m[1] - 20; px += 132) line(px, -118, px, -12, 0.9, COL.yel);
        });
        ctx.fillStyle = COL.yel; ctx.font = '700 64px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ['4', '3', '2', '1'].forEach(function (n, i) { ctx.fillText(n, BIN_X[i], -318); });
        ctx.beginPath();
        for (var st = 1; st < 12; st++) { var u = st / 12, ax = lerp(1640, 1905, u), ay = lerp(-640, 0, u); ctx.moveTo(ax, ay); ctx.lineTo(ax + 40, ay); }
        strokeW(1, COL.yelD);
        ctx.restore();
      }
      // screw helix ticks (move while dosing cement)
      var run = seg(p, 0.09, 0.11) * (1 - seg(p, 0.20, 0.23));
      var d = [SCREW_B[0] - SCREW_A[0], SCREW_B[1] - SCREW_A[1]], dl = Math.hypot(d[0], d[1]);
      ctx.save(); ctx.globalAlpha = intro;
      ctx.beginPath();
      var ph = frac(t * 0.9 * (0.15 + run));
      for (var k = 0; k < 22; k++) {
        var u = (k + ph) / 22, c = [SCREW_A[0] + d[0] * u, SCREW_A[1] + d[1] * u];
        var a0 = off(c, SCREW_N, 14), a1 = off([c[0] + d[0] / dl * 18, c[1] + d[1] / dl * 18], SCREW_N, -14);
        ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]);
      }
      strokeW(0.6, 'rgba(22,22,22,0.6)');
      ctx.restore();
      // cement powder flowing through the screw
      if (run > 0.01) {
        ctx.save(); ctx.globalAlpha = run;
        ctx.beginPath(); ctx.moveTo(SCREW_A[0], SCREW_A[1]); ctx.lineTo(SCREW_B[0], SCREW_B[1]); ctx.lineTo(1180, -870);
        ctx.setLineDash([22 * ip, 14 * ip]); ctx.lineDashOffset = -t * 70 * ip;
        ctx.lineCap = 'round'; strokeW(7, COL.concD); ctx.setLineDash([]); ctx.lineCap = 'butt';
        ctx.restore();
      }
      // aggregate pebbles on the belts
      var agg = seg(p, 0.10, 0.12) * (1 - seg(p, 0.21, 0.24));
      if (agg > 0.01) {
        ctx.save(); ctx.globalAlpha = agg;
        for (var q = 0; q < 44; q++) {
          var pp = PEB_PATH[q % 2], u2 = frac(t * 0.16 + q / 44 + hash(q) * 0.02);
          var pt = along(pp, u2), r = (q % 2 ? 9 : 6) + hash(q + 3) * 4;
          ctx.beginPath();
          for (var e = 0; e < 6; e++) { var an = e / 6 * TAU + q, rr = r * (0.75 + 0.35 * hash(q * 7 + e)); ctx.lineTo(pt[0] + Math.cos(an) * rr, pt[1] - r + Math.sin(an) * rr * 0.8); }
          ctx.closePath(); fillC(q % 2 ? '#8C867D' : '#B1A894'); strokeW(0.5);
        }
        ctx.restore();
      }
      // water dose
      var wa = seg(p, 0.14, 0.15) * (1 - seg(p, 0.185, 0.2));
      if (wa > 0.01) {
        ctx.save(); ctx.globalAlpha = wa;
        ctx.beginPath(); ctx.moveTo(1300, -900); ctx.lineTo(1300, -770);
        ctx.setLineDash([7 * ip, 7 * ip]); ctx.lineDashOffset = -t * 90 * ip; ctx.lineCap = 'round';
        strokeW(2.4, '#5D6A73'); ctx.setLineDash([]); ctx.lineCap = 'butt'; ctx.restore();
      }
      // discharge into the truck drum
      var dis = seg(p, 0.20, 0.215) * (1 - seg(p, 0.265, 0.282));
      if (dis > 0.01) {
        ctx.save(); ctx.globalAlpha = dis;
        ctx.beginPath();
        var top = -470, bot = -350, wv = Math.sin(t * 9) * 3;
        ctx.moveTo(1336, top); ctx.bezierCurveTo(1338 + wv, -430, 1342 - wv, -390, 1346, bot);
        ctx.lineTo(1372, bot); ctx.bezierCurveTo(1370 + wv, -390, 1366, -430, 1364, top); ctx.closePath();
        fillC(COL.wet); strokeW(0.7); ctx.restore();
      }
      // dust motes around the bins
      if (!REDUCED) {
        ctx.save();
        for (var m = 0; m < 16; m++) {
          var mx = 2060 + hash(m) * 840 + Math.sin(t * 0.4 + m) * 30, my = -60 - frac(t * 0.05 + hash(m + 9)) * 520;
          ctx.globalAlpha = 0.25 * Math.sin(frac(t * 0.05 + hash(m + 9)) * PI) * intro;
          ctx.beginPath(); ctx.arc(mx, my, 4 + hash(m + 2) * 4, 0, TAU); fillC('#8D877E');
        }
        ctx.restore();
      }
    }

    function drawMixer(p, t, intro) {
      var Lv = sm(seg(p, 0.10, 0.22)), mixT = sm(seg(p, 0.16, 0.235)), drain = sm(seg(p, 0.21, 0.275));
      var run = seg(p, 0.10, 0.12) * (1 - seg(p, 0.25, 0.28));
      ctx.save(); rectP(1150, -870, 1550, -670); ctx.clip();
      ctx.globalAlpha = intro;
      ctx.fillStyle = 'rgba(22,22,22,0.07)'; ctx.fillRect(1150, -870, 400, 200);
      var lvl = Lv * (1 - drain);
      if (lvl > 0.005) {
        var topY = -675 - lvl * 140;
        ctx.beginPath(); ctx.moveTo(1150, -670);
        for (var x = 1150; x <= 1550; x += 10) ctx.lineTo(x, topY + Math.sin(x * 0.035 + t * 5) * 5 * run * lvl);
        ctx.lineTo(1550, -670); ctx.closePath();
        if (mixT < 1) { ctx.globalAlpha = intro * (1 - mixT); fillC('#B4A88F'); }
        if (mixT < 1) {
          // cement layer on top of the aggregate before blending
          ctx.save(); ctx.globalAlpha = intro * (1 - mixT);
          rectP(1150, topY - 10, 1550, topY + (-670 - topY) * 0.45); ctx.clip();
          ctx.beginPath(); ctx.moveTo(1150, -670);
          for (var x2 = 1150; x2 <= 1550; x2 += 10) ctx.lineTo(x2, topY + Math.sin(x2 * 0.035 + t * 5) * 5 * run * lvl);
          ctx.lineTo(1550, -670); ctx.closePath(); fillC('#9E9A93'); ctx.restore();
        }
        ctx.globalAlpha = intro * mixT;
        ctx.beginPath(); ctx.moveTo(1150, -670);
        for (var x3 = 1150; x3 <= 1550; x3 += 10) ctx.lineTo(x3, topY + Math.sin(x3 * 0.035 + t * 5) * 5 * run * lvl);
        ctx.lineTo(1550, -670); ctx.closePath(); fillC(COL.wet);
        ctx.globalAlpha = intro;
      }
      // paddles of the pan mixer, seen from the side
      var th = t * (0.5 + 3.4 * run);
      for (var k = 0; k < 6; k++) {
        var a = th + k * TAU / 6, x0 = 1350 + Math.cos(a) * 170, depth = Math.sin(a);
        ctx.globalAlpha = intro * (0.35 + 0.65 * (depth * 0.5 + 0.5));
        line(x0, -850, x0, -690, depth > 0 ? 2.2 : 1.2);
        line(x0 - 14, -700, x0 + 14, -700, depth > 0 ? 2.2 : 1.2);
      }
      ctx.globalAlpha = intro;
      line(1350, -870, 1350, -850, 2);
      ctx.restore();
    }

    // ---------- truck: mixer + boom pump ----------
    function drumProfile(xr) {
      var A = [xr + 95, -300], B = [xr + 720, -235], dx = B[0] - A[0], dy = B[1] - A[1], Ld = Math.hypot(dx, dy);
      var d = [dx / Ld, dy / Ld], n = [d[1], -d[0]];
      function r(u) { return u < 0.32 ? lerp(48, 116, sm(u / 0.32)) : u < 0.8 ? 116 : lerp(116, 72, sm((u - 0.8) / 0.2)); }
      var topP = [], botP = [];
      for (var i = 0; i <= 24; i++) { var u = i / 24, c = [A[0] + dx * u, A[1] + dy * u], rr = r(u); topP.push([c[0] + n[0] * rr, c[1] + n[1] * rr]); botP.push([c[0] - n[0] * rr, c[1] - n[1] * rr]); }
      return { top: topP, bot: botP, A: A, d: d, n: n, Ld: Ld, r: r };
    }
    // boom unfolds section by section: outriggers first, then each arm with its own ease and a small overshoot
    function eo(t) { return lerp(sm(t), ob(t), 0.38); }
    function boomPose(p, xr) {
      var bt = seg(p, 0.375, 0.445);
      var e1 = eo(seg(bt, 0.2, 0.62)), e2 = eo(seg(bt, 0.42, 0.8)), e3 = eo(seg(bt, 0.55, 1));
      var sweep = lerp(-12, 14, sm(seg(p, 0.445, 0.495))) * PI / 180;
      var a1 = lerp(180, 288, e1) * PI / 180, a2 = lerp(0, -7, e2) * PI / 180, a3 = lerp(180, 422, e3) * PI / 180 + sweep * sm(seg(bt, 0.9, 1));
      var P0 = [xr + 760, -395], lens = [650, 600, 450], angs = [a1, a2, a3], pts = [P0];
      for (var i = 0; i < 3; i++) { var q = pts[i]; pts.push([q[0] + Math.cos(angs[i]) * lens[i], q[1] + Math.sin(angs[i]) * lens[i]]); }
      return { pts: pts, bt: bt, fold: 1 - sm(seg(bt, 0.15, 0.55)), angs: angs };
    }
    function wheel(x, y, r, ang) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); fillC('#3A3936'); strokeW(1.1);
      ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, TAU); fillC(COL.concS); strokeW(0.8);
      for (var i = 0; i < 5; i++) { var a = ang + i * TAU / 5; line(x + Math.cos(a) * r * 0.18, y + Math.sin(a) * r * 0.18, x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, 0.7); }
      ctx.beginPath(); ctx.arc(x, y, r * 0.12, 0, TAU); fillC(COL.ink);
    }
    function shadowE(cx, w, a) { ctx.save(); ctx.globalAlpha *= (a == null ? 1 : a); ctx.beginPath(); ctx.ellipse(cx, 2, w, 7, 0, 0, TAU); fillC(COL.shadow); ctx.restore(); }
    function truckX(p) { return lerp(1290, 3000, ioc(seg(p, 0.285, 0.375))); }
    function drawTruck(p, t, intro) {
      var xr = truckX(p);
      if (!visible(xr - 300, xr + 1900)) return;
      var wAng = (xr - 1290) / 52;
      // suspension: pitch follows acceleration, then a damped settle after the stop
      var h = 0.003, acc = (truckX(p + h) + truckX(p - h) - 2 * xr) / (h * h);
      var pitch = clamp(-acc / 1.3e6, -1, 1) * 0.022;
      if (p > 0.375) { var d = (p - 0.375) / 0.012; pitch += 0.016 * Math.exp(-d * 1.3) * Math.sin(d * 4.2); }
      if (p > 0.285 && p < 0.375 && !REDUCED) pitch += Math.sin(xr * 0.021) * 0.0025;
      ctx.save(); ctx.globalAlpha = sm(seg(intro, 0.45, 1));
      var pose = boomPose(p, xr);
      shadowE(xr + 520, 520, 0.9);
      // outriggers
      var og = sm(seg(pose.bt, 0, 0.25));
      if (og > 0.01) {
        [[xr + 300, -1], [xr + 745, 1]].forEach(function (o) {
          var fx = o[0] + o[1] * 70 * og, fy = -110 + 110 * og;
          line(o[0], -112, fx, fy, 2.4); rectP(fx - 18, fy - 4, fx + 18, fy + 2); fillC(COL.ink);
        });
      }
      ctx.save(); ctx.translate(xr + 520, -52); ctx.rotate(pitch); ctx.translate(-(xr + 520), 52);
      // chassis + fenders
      rectP(xr + 40, -128, xr + 990, -100); fillC(COL.concS); strokeW(1.2);
      [150, 282, 835].forEach(function (w) { ctx.beginPath(); ctx.arc(xr + w, -52, 66, PI * 1.08, PI * 1.92); strokeW(1.1); });
      // drum
      var D = drumProfile(xr);
      ctx.beginPath(); ctx.moveTo(D.top[0][0], D.top[0][1]);
      D.top.forEach(function (q) { ctx.lineTo(q[0], q[1]); });
      for (var i = D.bot.length - 1; i >= 0; i--) ctx.lineTo(D.bot[i][0], D.bot[i][1]);
      ctx.closePath();
      var gr = ctx.createLinearGradient(xr, -420, xr, -120);
      gr.addColorStop(0, '#F6F4EF'); gr.addColorStop(0.35, '#E6E2DA'); gr.addColorStop(0.7, '#CFC9C0'); gr.addColorStop(1, '#A49E95');
      ctx.fillStyle = gr; ctx.fill(); strokeW(1.4);
      // spiral blades seen through the shell: curved, fading at the silhouette, turning with the drum
      ctx.save(); ctx.clip();
      for (var k = 0; k < 8; k++) {
        var u0 = frac(k / 8 + drumAng / TAU * 0.5);
        var ia = Math.round(u0 * 24), ib = Math.min(24, ia + 4), im = Math.min(24, ia + 2);
        if (ia >= 24) continue;
        var mid = [(D.top[im][0] + D.bot[im][0]) / 2 + 22, (D.top[im][1] + D.bot[im][1]) / 2];
        ctx.beginPath(); ctx.moveTo(D.top[ia][0], D.top[ia][1]); ctx.quadraticCurveTo(mid[0], mid[1], D.bot[ib][0], D.bot[ib][1]);
        var edge = Math.sin(u0 * PI);
        strokeW(1.1, 'rgba(22,22,22,' + (0.14 + 0.3 * edge).toFixed(3) + ')');
      }
      ctx.restore();
      // drum rings + roller
      [0.3, 0.78].forEach(function (u) { var ii = Math.round(u * 24); line(D.top[ii][0], D.top[ii][1], D.bot[ii][0], D.bot[ii][1], 1.6); });
      // mouth + discharge chute at the rear
      path([[xr + 40, -392], [xr + 120, -392], [xr + 105, -340], [xr + 70, -335]], true); fillC(COL.concS); strokeW(1.1);
      var chute = sm(seg(p, 0.42, 0.44)) * (1 - sm(seg(p, 0.5, 0.52)));
      var ca = lerp(-1.05, -0.35, chute);
      ctx.save(); ctx.translate(xr + 70, -330); ctx.rotate(ca);
      path([[0, -8], [-150, -2], [-150, 10], [0, 8]], true); fillC(COL.concS); strokeW(1.1); ctx.restore();
      line(xr + 150, -215, xr + 200, -128, 1.4); line(xr + 640, -170, xr + 690, -128, 1.4);
      // cab: Volvo FM-like box with rounded roof edge, big door window, grille, bumper, mirror, beacon
      ctx.beginPath(); ctx.moveTo(xr + 790, -112); ctx.lineTo(xr + 790, -342); ctx.lineTo(xr + 950, -342);
      ctx.quadraticCurveTo(xr + 984, -342, xr + 986, -305); ctx.lineTo(xr + 993, -150); ctx.lineTo(xr + 993, -112); ctx.closePath();
      fillC(COL.conc); strokeW(1.4);
      path([[xr + 808, -322], [xr + 940, -322], [xr + 972, -290], [xr + 972, -238], [xr + 808, -238]], true); fillC('#B8C0C3'); strokeW(0.9);
      line(xr + 812, -300, xr + 900, -300, 0.5, 'rgba(255,255,255,0.6)');
      line(xr + 800, -228, xr + 800, -122, 0.7); line(xr + 940, -228, xr + 940, -122, 0.7);
      line(xr + 960, -342, xr + 995, -336, 2.4);
      rectP(xr + 976, -214, xr + 993, -140); fillC('#3A3936'); strokeW(0.8);
      for (var gl = -206; gl < -142; gl += 10) line(xr + 978, gl, xr + 991, gl, 0.6, 'rgba(255,255,255,0.35)');
      rectP(xr + 960, -136, xr + 1004, -108); fillC('#2F2E2B'); strokeW(1);
      rectP(xr + 984, -168, xr + 996, -150); fillC('#F2E7B8'); strokeW(0.6);
      line(xr + 990, -284, xr + 1018, -296, 1.2); rectP(xr + 1012, -318, xr + 1024, -272); fillC('#3A3936'); strokeW(0.8);
      path([[xr + 836, -112], [xr + 836, -100], [xr + 870, -100]], false); strokeW(1);
      ctx.beginPath(); ctx.arc(xr + 900, -342, 10, PI, 0); fillC('#E8892B'); strokeW(0.8);
      if (!REDUCED && p > 0.285 && p < 0.375) { ctx.save(); ctx.globalAlpha *= 0.25 + 0.25 * Math.sin(t * 9); ctx.beginPath(); ctx.arc(xr + 900, -346, 22, 0, TAU); fillC('#F2A54A'); ctx.restore(); }
      // turret
      rectP(xr + 732, -398, xr + 788, -345); fillC(COL.concS); strokeW(1.1);
      // boom sections with hydraulic rams
      var offs = [0, -26, -52], P = pose.pts;
      for (var b = 0; b < 3; b++) {
        var p0 = P[b], p1 = P[b + 1], oy2 = offs[b] * pose.fold;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1] + oy2); ctx.lineTo(p1[0], p1[1] + oy2);
        ctx.lineWidth = 30 - b * 4; ctx.strokeStyle = COL.ink; ctx.stroke();
        ctx.lineWidth = Math.max(4, 30 - b * 4 - 2.8 * ip); ctx.strokeStyle = COL.conc; ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.arc(p0[0], p0[1] + oy2, 9, 0, TAU); fillC(COL.ink);
      }
      if (pose.fold < 0.98) {
        // hydraulic rams on the underside of each arm: barrel + rod
        var rams = [[P[0], P[1], [P[0][0] + 10, P[0][1] + 40], 0.36], [P[1], P[2], [lerp(P[1][0], P[0][0], 0.16), lerp(P[1][1], P[0][1], 0.16)], 0.2]];
        rams.forEach(function (r, ri) {
          var a0 = r[0], a1 = r[1], dx = a1[0] - a0[0], dy = a1[1] - a0[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
          if (ny < 0) { nx = -nx; ny = -ny; }
          var end = [a0[0] + dx * r[3] + nx * 20, a0[1] + dy * r[3] + ny * 20], st = r[2];
          var mid = [lerp(st[0], end[0], 0.58), lerp(st[1], end[1], 0.58)];
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(st[0], st[1]); ctx.lineTo(mid[0], mid[1]); ctx.lineWidth = 11; ctx.strokeStyle = COL.ink; ctx.stroke(); ctx.lineWidth = 11 - 2.4 * ip; ctx.strokeStyle = COL.concS; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(mid[0], mid[1]); ctx.lineTo(end[0], end[1]); ctx.lineWidth = 5; ctx.strokeStyle = COL.ink; ctx.stroke(); ctx.lineWidth = Math.max(1, 5 - 2 * ip); ctx.strokeStyle = '#EDEBE6'; ctx.stroke();
          ctx.lineCap = 'butt';
        });
      }
      ctx.restore(); // end pitch
      // hose + pour (the hose sways, the stream wobbles, drops fall, the surface splashes)
      var tip = P[3];
      if (pose.bt > 0.92) {
        var hang = sm(seg(pose.bt, 0.92, 1)), surf = -50 * sm(seg(p, 0.425, 0.49));
        var hy = lerp(tip[1] + 40, surf - 70, hang), sw = REDUCED ? 0 : Math.sin(t * 2) * 5 + Math.sin(t * 3.7) * 2;
        ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.quadraticCurveTo(tip[0] + sw * 0.4, (tip[1] + hy) / 2, tip[0] + sw, hy);
        ctx.lineWidth = 9; ctx.strokeStyle = COL.ink; ctx.stroke(); ctx.lineWidth = 9 - 2.4 * ip; ctx.strokeStyle = '#3A3936'; ctx.stroke();
        var pour = seg(p, 0.43, 0.44) * (1 - seg(p, 0.488, 0.5));
        if (pour > 0.01) {
          ctx.save(); ctx.globalAlpha *= pour;
          var hx = tip[0] + sw;
          ctx.beginPath(); ctx.moveTo(hx - 7, hy);
          for (var yy = hy; yy <= surf; yy += 6) ctx.lineTo(hx - 5 - 3 * seg(yy, hy, surf) + Math.sin(yy * 0.08 + t * 11) * 1.6, yy);
          for (var yy2 = surf; yy2 >= hy; yy2 -= 6) ctx.lineTo(hx + 5 + 3 * seg(yy2, hy, surf) + Math.sin(yy2 * 0.08 + t * 11 + 1) * 1.6, yy2);
          ctx.closePath(); fillC(COL.wet);
          if (!REDUCED) {
            for (var dd = 0; dd < 6; dd++) { var fu = frac(t * 1.7 + dd / 6), yd = lerp(hy, surf, fu); ctx.beginPath(); ctx.arc(hx + (hash(dd) - 0.5) * 18, yd, 3.2, 0, TAU); fillC(COL.wet); }
            for (var sp = 0; sp < 10; sp++) {
              var su = frac(t * 1.25 + sp / 10), dir = sp % 2 ? 1 : -1, sxp = hx + dir * (10 + su * (40 + hash(sp) * 40));
              ctx.globalAlpha = pour * (1 - su) * 0.9; ctx.beginPath(); ctx.arc(sxp, surf - Math.sin(su * PI) * (16 + hash(sp + 3) * 16), 2.6, 0, TAU); fillC(COL.wet);
            }
          }
          ctx.restore();
        }
      }
      // wheels (outside the pitch: they stay on the ground)
      [[150], [282], [835]].forEach(function (w) { wheel(xr + w[0], -52, 52, wAng); });
      ctx.restore();
      label(xr + 420, -360, 'MIKSERIS', sm(seg(p, 0.29, 0.31)) * (1 - seg(p, 0.37, 0.39)), 30, -46);
      label(P[2][0], P[2][1], 'SŪKNIS', sm(seg(p, 0.42, 0.44)) * (1 - seg(p, 0.495, 0.51)), 26, -24);
    }

    // ---------- slab / formwork ----------
    function drawSlab(p, t) {
      if (!visible(4250, 5500)) return;
      var a = sm(seg(p, 0.33, 0.37));
      if (a <= 0) return;
      ctx.save(); ctx.globalAlpha = a;
      var f = sm(seg(p, 0.425, 0.49)), lev = sm(seg(p, 0.468, 0.5));
      var pose = boomPose(p, 3000), px = pose.pts[3][0];
      // the screed bar travels left → right; behind it the surface is flat and dull, ahead it is wet and wavy
      var sx2 = lerp(4300, 5450, lev);
      if (f > 0.002) {
        var prof = function () {
          ctx.beginPath(); ctx.moveTo(4300, 0);
          for (var x = 4300; x <= 5450; x += 10) {
            var wet = lev > 0 ? sm(clamp((x - sx2) / 50 + 0.5, 0, 1)) : 1;
            var bump = 26 * f * wet * Math.exp(-Math.pow((x - px) / 170, 2));
            var wob = wet * (Math.sin(x * 0.05 + t * 3) * 1.6 + Math.sin(x * 0.13 - t * 2.1) * 0.8) * f;
            var heap = lev > 0 && lev < 1 ? 7 * Math.exp(-Math.pow((x - sx2 - 22) / 26, 2)) : 0; // mortar pushed ahead of the bar
            ctx.lineTo(x, -50 * f - bump + wob - heap);
          }
          ctx.lineTo(5450, 0); ctx.closePath();
        };
        prof(); fillC(COL.wet);
        if (lev > 0) {
          ctx.save(); rectP(4300, -90, sx2, 2); ctx.clip(); prof(); fillC(COL.mix); ctx.restore();
          line(4304, -50 * f + 1.5, Math.max(4304, sx2 - 10), -50 * f + 1.5, 1.2, 'rgba(255,255,255,0.35)');
        }
        prof(); strokeW(1);
      }
      // rebar (section dots) + mesh line
      ctx.globalAlpha = a;
      line(4320, -22, 5430, -22, 0.6, 'rgba(22,22,22,0.6)');
      for (var r = 4330; r < 5440; r += 55) { ctx.beginPath(); ctx.arc(r, -22, 4, 0, TAU); fillC(COL.ink); }
      // formwork boards
      rectP(4278, -74, 4300, 4); fillC('#B48E5E'); strokeW(1.1);
      rectP(5450, -74, 5472, 4); fillC('#B48E5E'); strokeW(1.1);
      line(4262, -20, 4278, -20, 1); line(4240, 0, 4278, -60, 1.1);
      line(5472, -20, 5488, -20, 1); line(5510, 0, 5472, -60, 1.1);
      // screed bar levelling
      if (lev > 0 && lev < 1) {
        var bob = REDUCED ? 0 : Math.sin(t * 7) * 1.2;
        line(sx2, -66 + bob, sx2, -48 + bob, 3); line(sx2 - 60, -66 + bob, sx2 + 60, -66 + bob, 2.4);
        line(sx2 - 60, -66 + bob, sx2 - 92, -150 + bob, 1.6); line(sx2 + 60, -66 + bob, sx2 + 92, -150 + bob, 1.6);
      }
      ctx.restore();
      label(4290, -70, 'VEIDŅI', sm(seg(p, 0.36, 0.39)) * (1 - seg(p, 0.45, 0.47)), 30, -56);
      label(5200, -30, 'PLĀTNE', sm(seg(p, 0.465, 0.485)) * (1 - seg(p, 0.505, 0.52)), 30, -60);
    }

    // ---------- precast elements ----------
    var GX = 6160, KR = 0.25;
    function ringBody(cx, R0, H0, col) {
      var ry = R0 * KR;
      ctx.beginPath(); ctx.moveTo(cx - R0, -H0); ctx.lineTo(cx - R0, 0);
      ctx.ellipse(cx, 0, R0, ry, 0, PI, 0, true);
      ctx.lineTo(cx + R0, -H0);
      ctx.ellipse(cx, -H0, R0, ry, 0, 0, PI, false);
      ctx.closePath();
      var g = ctx.createLinearGradient(cx - R0, 0, cx + R0, 0);
      g.addColorStop(0, col[0]); g.addColorStop(0.42, col[1]); g.addColorStop(1, col[2]);
      ctx.fillStyle = g; ctx.fill(); strokeW(1.3);
    }
    function drawElements(p, t) {
      if (!visible(6050, 7000)) return;
      if (p < 0.49 || p > 0.8) return;
      var gA = sm(seg(p, 0.505, 0.52));
      ctx.save(); ctx.globalAlpha = gA;
      // pallets under the products
      [[6085, 6235], [6280, 6560], [6590, 6980]].forEach(function (pl) {
        rectP(pl[0], -6, pl[1], 0); fillC('#B48E5E'); strokeW(0.7);
      });
      ctx.restore();

      // ---- grods KC 10-7.5 ----
      var f = sm(seg(p, 0.515, 0.565)), dm = sm(seg(p, 0.565, 0.6)), dimA = seg(p, 0.586, 0.62);
      ctx.save(); ctx.globalAlpha = gA;
      ctx.translate(0, -6);
      shadowE(GX, 70, 0.8);
      // finished ring (hidden by the mould until it lifts)
      ringBody(GX, 60, 75, [COL.concD, COL.conc, COL.concS]);
      ctx.beginPath(); ctx.ellipse(GX, -75, 60, 15, 0, 0, TAU); fillC(COL.conc); strokeW(1.2);
      ctx.beginPath(); ctx.ellipse(GX, -75, 50, 12.5, 0, 0, TAU);
      var ig = ctx.createLinearGradient(GX - 50, -88, GX + 50, -62); ig.addColorStop(0, '#7E786F'); ig.addColorStop(1, '#B9B3AA');
      ctx.fillStyle = ig; ctx.fill(); strokeW(1);
      // pores
      ctx.fillStyle = 'rgba(22,22,22,0.28)';
      for (var q = 0; q < 26; q++) { ctx.fillRect(GX - 55 + hash(q) * 110, -66 + hash(q + 40) * 60, 1.2 * ip, 1.2 * ip); }
      // mould
      var lift = dm * 175, ma = 1 - sm(seg(dm, 0.55, 1));
      if (ma > 0.01) {
        ctx.save(); ctx.globalAlpha = gA * ma; ctx.translate(0, -lift);
        ringBody(GX, 66, 82, [COL.redD, COL.red, '#A92420']);
        ctx.beginPath(); ctx.ellipse(GX, -82, 66, 16.5, 0, 0, TAU); fillC('#D9433B'); strokeW(1.2);
        // concrete level inside the annulus while filling
        if (dm < 0.02) {
          var lv = -82 + 82 * (1 - f) * 0.9;
          ctx.save(); ctx.beginPath(); ctx.ellipse(GX, -82, 63, 15.7, 0, 0, TAU); ctx.clip();
          ctx.beginPath(); ctx.ellipse(GX, lv - (82 - 75) * f, 60, 15, 0, 0, TAU); fillC(f > 0.98 ? COL.mix : COL.wet); ctx.restore();
        }
        ctx.beginPath(); ctx.ellipse(GX, -82, 47, 11.7, 0, 0, TAU); fillC('#B92721'); strokeW(1);
        // ribs
        for (var rb = -1; rb <= 1; rb += 2) line(GX + rb * 66, -60, GX + rb * 72, -60, 2);
        ctx.restore();
      }
      // dust/steam where the mould breaks free
      puff(GX, -4, 120, seg(dm, 0.02, 0.6), 11, 12);
      // pour stream into the annulus
      var pr = seg(p, 0.515, 0.522) * (1 - seg(p, 0.558, 0.566));
      if (pr > 0.01) {
        ctx.save(); ctx.globalAlpha = gA * pr;
        rectP(GX + 53, -300, GX + 58, -84 + 60 * (1 - f)); fillC(COL.wet); ctx.restore();
      }
      // dims
      dimH(GX - 60, GX + 60, -122, -86, -86, dimA);
      dimH(GX - 50, GX + 50, -100, -78, -78, dimA * 0.9);
      dimV(GX + 86, -75, 0, GX + 64, dimA);
      ctx.restore();
      dimText(GX, -128, 'Ø1200', dimA);
      dimText(GX, -106, 'Ø1000', dimA * 0.9);
      dimText(GX + 92, -38, 'H 750', dimA, 'left', 'middle');
      label(GX - 66, -40, 'VEIDNE', sm(seg(p, 0.515, 0.53)) * (1 - seg(p, 0.56, 0.575)), -26, -40);

      // ---- FBS 24-3-6 ----
      var X0 = 6300, f2 = sm(seg(p, 0.578, 0.615)), dm2 = sm(seg(p, 0.615, 0.642)), dimB = seg(p, 0.632, 0.662);
      var fa = sm(seg(p, 0.565, 0.58));
      if (fa > 0.01) {
        ctx.save(); ctx.globalAlpha = fa; ctx.translate(0, -6);
        shadowE(X0 + 130, 140, 0.7);
        box(X0, 240, 60, 20, 10, [COL.conc, COL.concS, '#DCD8D1']);
        puff(X0 + 120, -2, 190, seg(dm2, 0.02, 0.6), 31, 12);
        if (dm2 > 0.5) { // lifting loops
          ctx.globalAlpha = fa * sm(seg(dm2, 0.5, 1));
          [X0 + 48, X0 + 192].forEach(function (lx) { ctx.beginPath(); ctx.arc(lx + 10, -65, 7, PI, 0); strokeW(1.6); });
        }
        var ma2 = 1 - sm(seg(dm2, 0.55, 1));
        if (ma2 > 0.01) {
          ctx.save(); ctx.globalAlpha = fa * ma2; ctx.translate(0, -dm2 * 140);
          box(X0 - 6, 252, 70, 20, 10, [COL.red, COL.redD, '#D9433B'], 2);
          if (dm2 < 0.02) { // open top: empty mould interior → concrete surface as it fills
            path([[X0 + 2, -68], [X0 + 20, -77], [X0 + 256, -77], [X0 + 238, -68]], true);
            fillC(f2 > 0.06 ? (f2 > 0.98 ? COL.mix : COL.wet) : '#6E1713'); strokeW(0.6);
          }
          ctx.restore();
        }
        var pr2 = seg(p, 0.578, 0.585) * (1 - seg(p, 0.608, 0.616));
        if (pr2 > 0.01) { ctx.globalAlpha = fa * pr2; rectP(X0 + 118, -320, X0 + 124, -72); fillC(COL.wet); }
        ctx.globalAlpha = 1;
        dimH(X0, X0 + 240, 20, 4, 4, dimB);
        dimV(X0 - 22, -60, 0, X0 - 4, dimB);
        ctx.restore();
        dimText(X0 + 120, 34 - 6, '2400', dimB, 'center', 'top');
        dimText(X0 - 30, -36, '600', dimB, 'right', 'middle');
      }

      // ---- LB wall ----
      var BL = [[6600, 0, 180], [6780, 0, 180], [6600, 1, 90], [6690, 1, 180], [6870, 1, 90], [6600, 2, 180], [6780, 2, 180]];
      var la = sm(seg(p, 0.645, 0.66));
      if (la > 0.01) {
        ctx.save(); ctx.translate(0, -6);
        for (var bi = 0; bi < BL.length; bi++) {
          var b = BL[bi], st = 0.655 + bi * 0.011, tt = seg(p, st, st + 0.03);
          if (tt <= 0) continue;
          var drop = tt < 0.6 ? (1 - Math.pow(tt / 0.6, 2)) * 150 : Math.abs(Math.sin((tt - 0.6) / 0.4 * PI * 2)) * 9 * (1 - (tt - 0.6) / 0.4);
          ctx.save(); ctx.globalAlpha = sm(seg(tt, 0, 0.3)) * la; ctx.translate(0, -drop);
          lbBlock(b[0], -60 * b[1], b[2], bi, b[1] === 2 || (b[1] === 1 && p < 0.655 + 5 * 0.011 + 0.01));
          ctx.restore();
          puff(b[0] + b[2] / 2, -60 * b[1] - 2, b[2] * 0.75, seg(tt, 0.42, 0.95), 50 + bi * 7, 7);
        }
        var dimC = seg(p, 0.70, 0.735);
        dimH(6600, 6780, 20, 4, 4, dimC);
        dimV(6578, -60, 0, 6596, dimC);
        ctx.restore();
        dimText(6690, 28, 'L 1800', dimC, 'center', 'top');
        dimText(6570, -36, 'H 600', dimC, 'right', 'middle');
      }
    }
    // extruded box: front face x0..x0+w, height h, top/side skew (dx,dy)
    function box(x0, w, h, dx, dy, cols, lw) {
      rectP(x0, -h, x0 + w, 0); fillC(cols[0]); strokeW(lw || 1.3);
      path([[x0, -h], [x0 + dx, -h - dy], [x0 + w + dx, -h - dy], [x0 + w, -h]], true); fillC(cols[2]); strokeW(lw || 1.1);
      path([[x0 + w, -h], [x0 + w + dx, -h - dy], [x0 + w + dx, -dy], [x0 + w, 0]], true); fillC(cols[1]); strokeW(lw || 1.1);
    }
    function lbBlock(x0, y0, w, seed, studs) {
      ctx.save(); ctx.translate(0, y0);
      box(x0, w, 60, 18, 9, [COL.conc, COL.concS, '#DCD8D1'], 1.2);
      ctx.fillStyle = 'rgba(22,22,22,0.3)';
      for (var q = 0; q < w / 6; q++) ctx.fillRect(x0 + 4 + hash(seed * 31 + q) * (w - 8), -56 + hash(seed * 17 + q) * 52, 1.3 * ip, 1.3 * ip);
      if (studs) {
        for (var u = 0; u < w / 90; u++) for (var k = 0; k < 2; k++) {
          var cx = x0 + u * 90 + 22.5 + k * 45 + 9;
          path([[cx - 15, -60], [cx - 10, -75], [cx + 10, -75], [cx + 15, -60]], true); fillC('#E4E0D9'); strokeW(0.9);
        }
      }
      ctx.restore();
    }

    // ---------- ground section ----------
    function soilClip() {
      ctx.beginPath();
      ctx.moveTo(SEC_X0, 0); ctx.lineTo(SEC_X1, 0);
      ctx.lineTo(SEC_X1, 180); ctx.lineTo(SEC_X1 + 22, 205); ctx.lineTo(SEC_X1 - 22, 240); ctx.lineTo(SEC_X1, 265); ctx.lineTo(SEC_X1, 520);
      ctx.lineTo(SEC_X0, 520); ctx.lineTo(SEC_X0, 265); ctx.lineTo(SEC_X0 - 22, 240); ctx.lineTo(SEC_X0 + 22, 205); ctx.lineTo(SEC_X0, 180);
      ctx.closePath();
    }
    function excavation(xb) {
      ctx.beginPath(); ctx.moveTo(8300, 0);
      for (var x = 8300; x <= xb; x += 10) ctx.lineTo(x, bottomY(x));
      ctx.lineTo(xb, bottomY(xb)); ctx.lineTo(xb, 0); ctx.closePath();
    }
    // ---- ground-section timeline (p) ----
    // dig .768–.835 · drive back .835–.842 · base/ring/ring .842–.869 (lowered on a chain by the excavator)
    // slew .869–.874 · BIO tank .874–.887 · slew .887–.891 · lid .891–.899
    // reverse .899–.905 · backfill pushed right → left .905–.95 · drive off .95–.975 · ground closes, grass .945–1
    var LIFT = [
      { k: 'base', a: 0.842, b: 0.851 }, { k: 'r1', a: 0.851, b: 0.860 }, { k: 'r2', a: 0.860, b: 0.869 },
      { k: 'tank', a: 0.874, b: 0.887 }, { k: 'lid', a: 0.891, b: 0.899 }
    ];
    var EX_X = 9140, CH = 110;
    function liftU(L1, p) { return oc(seg(p, L1.a + (L1.b - L1.a) * 0.08, L1.b)); }
    function exState(p, digX) {
      if (p < 0.835) return { x: digX + 140, face: -1, mode: 'dig' };
      if (p < 0.842) return { x: lerp(10440, EX_X, ioc(seg(p, 0.835, 0.842))), face: -1, mode: 'carry' };
      if (p < 0.869) return { x: EX_X, face: -1, mode: 'lift' };
      if (p < 0.874) return { x: EX_X, face: lerp(-1, 1, ioc(seg(p, 0.869, 0.874))), mode: 'carry' };
      if (p < 0.887) return { x: EX_X, face: 1, mode: 'lift' };
      if (p < 0.891) return { x: EX_X, face: lerp(1, -1, ioc(seg(p, 0.887, 0.891))), mode: 'carry' };
      if (p < 0.899) return { x: EX_X, face: -1, mode: 'lift' };
      if (p < 0.905) return { x: lerp(EX_X, 10250, ioc(seg(p, 0.899, 0.905))), face: -1, mode: 'carry' };
      if (p < 0.95) return { x: lerp(10250, 8420, lerp(seg(p, 0.905, 0.95), ioc(seg(p, 0.905, 0.95)), 0.5)), face: -1, mode: 'push' };
      return { x: lerp(8420, 11100, ioc(seg(p, 0.95, 0.975))), face: -1, mode: 'carry' };
    }
    function sway(t, seed, u) { return REDUCED ? 0 : 0.085 * Math.sin(t * 2.4 + seed) * (1 - u) + 0.02 * Math.sin(t * 5.1 + seed * 2) * (1 - u); }
    function drawSection(p, t) {
      if (!visible(SEC_X0, SEC_X1)) return;
      if (p < 0.66) return;
      var dg = seg(p, 0.768, 0.835), digX = lerp(8300, 10300, lerp(dg, ioc(dg), 0.5));
      var back = sm(seg(p, 0.905, 0.95)), close = sm(seg(p, 0.95, 0.99)), grassG = sm(seg(p, 0.945, 0.995));
      var fillFront = lerp(10310, 8290, back);

      // soil layers
      ctx.save(); soilClip(); ctx.clip();
      rectP(SEC_X0 - 40, 0, SEC_X1 + 40, 36); fillC(COL.top);
      rectP(SEC_X0 - 40, 36, SEC_X1 + 40, 150); fillC(COL.sand);
      rectP(SEC_X0 - 40, 150, SEC_X1 + 40, 520); fillC(COL.clay);
      line(SEC_X0 - 40, 36, SEC_X1 + 40, 36, 0.6, 'rgba(22,22,22,0.5)');
      line(SEC_X0 - 40, 150, SEC_X1 + 40, 150, 0.6, 'rgba(22,22,22,0.5)');
      var gx0 = Math.max(SEC_X0, vx0), gx1 = Math.min(SEC_X1, vx1), gs = Math.max(18, 9 * ip);
      ctx.beginPath();
      for (var x = Math.floor(gx0 / gs) * gs; x < gx1; x += gs) {
        for (var y = 8; y < 34; y += gs * 0.8) { var h = hash2(x, y); ctx.moveTo(x + h * gs, y + 4); ctx.lineTo(x + h * gs + 8, y); }
      }
      strokeW(0.6, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = 'rgba(70,52,30,0.45)';
      for (var x2 = Math.floor(gx0 / gs) * gs; x2 < gx1; x2 += gs) {
        for (var y2 = 40; y2 < 148; y2 += gs * 0.7) { var h2 = hash2(x2, y2); ctx.fillRect(x2 + h2 * gs, y2 + hash2(y2, x2) * 8, 1.6 * ip + 2, 1.6 * ip + 2); }
      }
      var sp = 12 * ip;
      ctx.beginPath();
      for (var x3 = Math.floor(gx0 / sp) * sp; x3 < gx1 + 400; x3 += sp) { ctx.moveTo(x3, 150); ctx.lineTo(x3 - 370, 520); }
      strokeW(0.5, 'rgba(40,26,14,0.35)');

      // the trench: in a long section we look at its far wall — darker soil with bucket-tooth scrapes
      if (digX > 8305) {
        excavation(Math.min(digX, 10300)); fillC(COL.trench);
        ctx.save(); excavation(Math.min(digX, 10300)); ctx.clip();
        ctx.beginPath();
        for (var xs = 8300; xs < Math.min(digX, 10300); xs += 34) {
          var hs = hash(xs * 0.37);
          for (var tooth = 0; tooth < 3; tooth++) { var bx = xs + tooth * 8 + hs * 10; ctx.moveTo(bx, 6); ctx.quadraticCurveTo(bx + 10, 90, bx + 4 + hs * 12, 250); }
        }
        strokeW(0.6, 'rgba(25,15,8,0.28)');
        ctx.fillStyle = 'rgba(25,15,8,0.12)'; ctx.fillRect(8300, 0, 2000, 28);
        ctx.restore();
        excavation(Math.min(digX, 10300)); ctx.setLineDash([6 * ip, 5 * ip]); strokeW(0.9, 'rgba(22,22,22,0.7)'); ctx.setLineDash([]);
      }
      if (back > 0.002) {
        ctx.save(); rectP(fillFront, -2, 10310, 270); ctx.clip();
        excavation(10300); fillC(COL.fill);
        ctx.fillStyle = 'rgba(90,66,40,0.35)';
        for (var q = 0; q < 260; q++) { var fx = 8300 + hash(q) * 2000; if (fx > fillFront) ctx.fillRect(fx, 4 + hash(q + 99) * 240, 2 * ip + 2, 2 * ip + 2); }
        ctx.restore();
        if (grassG > 0) { ctx.globalAlpha = grassG; rectP(8300, 0, 10300, 36); fillC(COL.top); ctx.globalAlpha = 1; }
      }

      // FBS foundation under the house
      for (var c = 0; c < 2; c++) for (var k = 0; k < 3; k++) {
        var bx0 = Math.max(7700, 7700 + k * 240 - (c ? 120 : 0)), bx1 = Math.min(8300, 7700 + k * 240 - (c ? 120 : 0) + 240);
        if (bx1 <= bx0) continue;
        rectP(bx0, c * 60, bx1, c * 60 + 60); fillC(COL.concS); strokeW(1);
      }
      hatchRect(7700, 0, 8300, 120, 10);

      // pipes, laid once the structure they join is in place
      var pa = seg(p, 0.862, 0.876), pb = seg(p, 0.887, 0.897), pc = seg(p, 0.89, 0.902), pw = seg(p, 0.866, 0.884), pm = seg(p, 0.884, 0.9);
      pipe([[8300, 100], [8800, 140]], pa); pipe([[8920, 150], [9330, 165]], pb); pipe([[9471, 180], [10650, 206]], pc);
      if (pw > 0) {
        ctx.beginPath(); ctx.moveTo(7700, 175); ctx.lineTo(lerp(7700, 7230, sm(pw)), 175);
        ctx.lineWidth = 9; ctx.strokeStyle = COL.ink; ctx.stroke(); ctx.lineWidth = 9 - 2.4 * ip; ctx.strokeStyle = '#3F6E8C'; ctx.stroke();
      }
      if (pm > 0) {
        var mx1 = lerp(9640, 10650, sm(pm));
        ctx.fillStyle = 'rgba(60,58,54,0.55)';
        for (var g = 0; g < 70; g++) { var gxx = 9640 + hash(g + 300) * 1010; if (gxx > mx1) continue; ctx.beginPath(); ctx.arc(gxx, 100 + hash(g + 500) * 22, 3 + hash(g) * 2.5, 0, TAU); ctx.fill(); }
        ctx.beginPath(); ctx.moveTo(9640, 111); ctx.lineTo(mx1, 111);
        ctx.setLineDash([16, 8]); ctx.lineWidth = 8; ctx.strokeStyle = COL.ink; ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore(); // end soil clip

      // spoil heap beside the trench (grows while digging, shrinks during backfill)
      var heap = sm(dg) * (1 - back);
      if (heap > 0.01) {
        var hcx = 10080, hw = 260, hh = 95 * heap;
        ctx.beginPath(); ctx.moveTo(hcx - hw, 0);
        for (var hx = -hw; hx <= hw; hx += 12) { var uu = hx / hw; ctx.lineTo(hcx + hx, -hh * (1 - uu * uu) * (0.9 + 0.1 * Math.sin(hx * 0.09))); }
        ctx.closePath(); fillC(COL.fill); strokeW(1);
        ctx.fillStyle = 'rgba(90,66,40,0.4)';
        for (var hq = 0; hq < 40; hq++) { var qx = (hash(hq + 700) * 2 - 1) * hw * 0.9, qy = -hh * (1 - Math.pow(qx / hw, 2)) * hash(hq + 800); ctx.fillRect(hcx + qx, qy, 3, 3); }
      }

      // lifted parts: each hangs on a chain from the bucket, swings, and settles as it lands
      var EX = exState(p, digX), tipW = null;
      function placed(k) { for (var i = 0; i < LIFT.length; i++) if (LIFT[i].k === k) return p >= LIFT[i].b; return false; }
      function active() { for (var i = 0; i < LIFT.length; i++) if (p >= LIFT[i].a && p < LIFT[i].b) return LIFT[i]; return null; }
      var act = active();
      var GEO = { base: [8800, 8920, 160, 172], r1: [8800, 8920, 85, 160], r2: [8800, 8920, 10, 85], lid: [8792, 8928, -10, 10], tank: [9330, 9471, -8, 232] };
      function drawPart(k, dy, ox) {
        var G = GEO[k];
        if (k === 'tank') tank(G[0] + ox, G[1] + ox, G[2], G[3], dy);
        else if (k === 'lid') wellLid(8800 + ox, 8920 + ox, dy);
        else wellPart(G[0] + ox, G[2], G[1] + ox, G[3], k === 'base' ? 'base' : 'ring', dy);
      }
      ['base', 'r1', 'r2'].forEach(function (k) { if (placed(k)) drawPart(k, 0, 0); });
      if (placed('tank')) drawPart('tank', 0, 0);
      // the closing ground: section covered, only the lids remain
      if (close > 0.002) {
        ctx.save(); soilClip(); ctx.clip();
        ctx.globalAlpha = close * 0.9; rectP(SEC_X0 - 40, 0, SEC_X1 + 40, 520); fillC(COL.closeSoil);
        ctx.globalAlpha = close * 0.35; ctx.beginPath();
        for (var x4 = Math.floor(gx0 / sp) * sp; x4 < gx1 + 400; x4 += sp * 1.5) { ctx.moveTo(x4, 0); ctx.lineTo(x4 - 520, 520); }
        strokeW(0.5, 'rgba(20,12,6,0.6)');
        ctx.restore();
      }
      if (placed('tank')) tankLid(9330, 9471, -8);
      if (placed('lid')) drawPart('lid', 0, 0);
      if (act) {
        var u = liftU(act, p), G = GEO[act.k], cx = (G[0] + G[1]) / 2, start = act.k === 'tank' ? 230 : act.k === 'base' ? 300 : 260;
        var dy = (1 - u) * start, th = sway(t, act.a * 100, u), ox = Math.sin(th) * CH;
        var top = (act.k === 'lid' ? -10 : G[2]) - dy;
        drawPart(act.k, dy, ox);
        tipW = [cx + ox * 0.15, top - CH * Math.cos(th)];
        // sling: chain from the bucket hook to two lifting points
        var hx2 = tipW[0], hy2 = tipW[1], half = Math.min(34, (G[1] - G[0]) / 2 - 8);
        ctx.save(); ctx.setLineDash([5 * ip, 3 * ip]);
        line(hx2, hy2, cx + ox - half, top, 1.3); line(hx2, hy2, cx + ox + half, top, 1.3);
        ctx.setLineDash([]); ctx.beginPath(); ctx.arc(hx2, hy2 + 6, 6, 0, PI); strokeW(1.6); ctx.restore();
        if (u > 0.9) puff(cx, act.k === 'tank' ? 232 : G[3], 70, seg(u, 0.9, 1), act.a * 1000, 6, '#B79C79');
      }

      // ground surface line over the section
      line(SEC_X0, 0, SEC_X1, 0, 1.6);
      ctx.save(); soilClip(); strokeW(1.1); ctx.restore();
      house();
      if (grassG > 0.01) grass(grassG, t);
      // excavator (contact shadow first)
      if (p < 0.975) {
        var ex = EX;
        shadowE(ex.x, 150, 0.9);
        excavator(ex.x, ex.face, ex.mode, t, ex.mode === 'dig' ? Math.min(digX, 10300) : ex.mode === 'lift' ? tipW : null);
        if (ex.mode === 'dig' && !REDUCED) puff(Math.min(digX, 10300) + 10, -4, 60, frac(t * 0.85), Math.floor(t * 0.85) * 13, 5, '#B79C79');
        if (ex.mode === 'push' && !REDUCED) puff(ex.x - 230, -4, 70, frac(t * 1.1), Math.floor(t * 1.1) * 17, 5, '#C9B08A');
      }

      // labels (text kept in the "sky" above the ground line)
      var la = 1 - sm(seg(p, 0.93, 0.95));
      labelTo(7712, 60, -110, 'FBS PAMATI', sm(seg(p, 0.79, 0.805)) * (1 - seg(p, 0.85, 0.865)), -18);
      labelTo(8560, 124, -150, 'KANALIZĀCIJA', sm(seg(p, 0.868, 0.88)) * la, 24);
      labelTo(8860, 120, -320, 'GRODU AKA · KC 10-7.5', sm(seg(p, 0.853, 0.865)) * la, 20);
      labelTo(9400, 60, -190, 'BIOLOĢISKĀ ATTĪRĪŠANA', sm(seg(p, 0.884, 0.894)) * la, 22);
      labelTo(7450, 175, -110, 'ŪDENSVADS', sm(seg(p, 0.874, 0.886)) * la, -16);
      labelTo(10120, 111, -130, 'MELIORĀCIJA', sm(seg(p, 0.893, 0.903)) * la, 20);
      labelTo(8860, -8, -230, 'VĀKS Z/Z', sm(seg(p, 0.955, 0.975)), 20);
      labelTo(8000, -10, -470, 'KONSULTĒJAM · APSEKOJAM · PROJEKTĒJAM', sm(seg(p, 0.775, 0.79)) * (1 - seg(p, 0.82, 0.835)), 24);
    }
    function hatchRect(x0, y0, x1, y1, gap) {
      ctx.save(); rectP(x0, y0, x1, y1); ctx.clip(); ctx.beginPath();
      for (var x = x0 - (y1 - y0); x < x1; x += gap) { ctx.moveTo(x, y1); ctx.lineTo(x + (y1 - y0), y0); }
      strokeW(0.5, 'rgba(22,22,22,0.4)'); ctx.restore();
      rectP(x0, y0, x1, y1); strokeW(1.1);
    }
    function pipe(pts, u) {
      if (u <= 0) return;
      var e = along(pts, sm(u));
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(e[0], e[1]);
      ctx.lineWidth = 15; ctx.strokeStyle = COL.ink; ctx.stroke();
      ctx.lineWidth = 15 - 2.4 * ip; ctx.strokeStyle = COL.red; ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1] - 3); ctx.lineTo(e[0], e[1] - 3); ctx.stroke();
      if (u < 1) { ctx.beginPath(); ctx.arc(e[0], e[1], 8, 0, TAU); fillC(COL.redD); strokeW(1); }
    }
    function wellPart(x0, y0, x1, y1, kind, dy) {
      ctx.save(); ctx.translate(0, -dy);
      if (kind === 'base') { rectP(x0, y0, x1, y1); fillC(COL.concS); hatchRect(x0, y0, x1, y1, 8); }
      else {
        rectP(x0 + 10, y0, x1 - 10, y1); fillC('rgba(22,22,22,0.12)');
        rectP(x0, y0, x0 + 10, y1); fillC(COL.concS); hatchRect(x0, y0, x0 + 10, y1, 7);
        rectP(x1 - 10, y0, x1, y1); fillC(COL.concS); hatchRect(x1 - 10, y0, x1, y1, 7);
      }
      ctx.restore();
    }
    function wellLid(x0, x1, dy) {
      ctx.save(); ctx.translate(0, -dy);
      rectP(x0 - 8, -4, x1 + 8, 10); fillC(COL.concS); hatchRect(x0 - 8, -4, x1 + 8, 10, 7);
      rectP((x0 + x1) / 2 - 24, -10, (x0 + x1) / 2 + 24, -4); fillC('#2F2E2B'); strokeW(1);
      ctx.restore();
    }
    function tank(x0, x1, y0, y1, dy) {
      ctx.save(); ctx.translate(0, -dy);
      var r = 14;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1 - r); ctx.quadraticCurveTo(x0, y1, x0 + r, y1); ctx.lineTo(x1 - r, y1); ctx.quadraticCurveTo(x1, y1, x1, y1 - r); ctx.lineTo(x1, y0); ctx.closePath();
      var tg = ctx.createLinearGradient(x0, 0, x1, 0); tg.addColorStop(0, '#DAD7D0'); tg.addColorStop(0.35, COL.tank); tg.addColorStop(1, '#CFCBC3');
      ctx.fillStyle = tg; ctx.fill(); strokeW(1.3);
      ctx.setLineDash([6 * ip, 5 * ip]);
      line(x0 + 47, 40, x0 + 47, y1 - 10, 0.8); line(x1 - 47, 70, x1 - 47, y1 - 10, 0.8);
      line(x0 + 6, 70, x1 - 6, 70, 0.6, 'rgba(22,22,22,0.5)');
      ctx.setLineDash([]);
      tankLid(x0, x1, y0);
      ctx.restore();
    }
    function tankLid(x0, x1, y0) {
      var cx = (x0 + x1) / 2;
      ctx.beginPath(); ctx.ellipse(cx, y0, (x1 - x0) / 2 - 8, 16, 0, PI, 0); ctx.closePath(); fillC('#E9E7E1'); strokeW(1.2);
    }
    function house() {
      if (!visible(7650, 8350)) return;
      rectP(7700, -420, 8300, 0); fillC('#4A4A47'); strokeW(1.4);
      ctx.beginPath(); for (var x = 7718; x < 8300; x += 18) { ctx.moveTo(x, -420); ctx.lineTo(x, 0); }
      strokeW(0.5, 'rgba(255,255,255,0.18)');
      rectP(7680, -440, 8320, -420); fillC('#2E2E2C'); strokeW(1.2);
      rectP(7780, -330, 7900, -120); fillC('#9FA9AC'); strokeW(1);
      rectP(8010, -330, 8240, -170); fillC('#9FA9AC'); strokeW(1);
    }
    // grass grows blade by blade, each with its own delay and height
    function grass(g, t) {
      var x0 = Math.max(SEC_X0, vx0 - 20), x1 = Math.min(SEC_X1, vx1 + 20), st = 3.2 * ip;
      ctx.beginPath();
      for (var x = Math.floor(x0 / st) * st; x < x1; x += st) {
        if (x > 7690 && x < 8310) continue;
        if (x > 8784 && x < 8936) continue;
        if (x > 9334 && x < 9467) continue;
        var i = Math.round(x / st), d0 = hash(i + 3) * 0.55, gi = ob(seg(g, d0, d0 + 0.45));
        if (gi <= 0) continue;
        var h = (5 + 8 * hash(i)) * ip * gi, sw = REDUCED ? 0 : Math.sin(t * 1.4 + x * 0.004) * 1.6 * ip * gi;
        ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + sw * 0.4, -h * 0.5, x + sw + (hash(i + 7) - 0.5) * 2 * ip, -h);
      }
      ctx.lineCap = 'round'; strokeW(1.3, COL.grass); ctx.lineCap = 'butt';
    }
    // Bobcat-type mini excavator: tracks, dozer blade, ROPS cab, 2-link boom (IK), bucket
    function excavator(x, face, mode, t, arg) {
      if (!visible(x - 300, x + 300)) return;
      var cyc = REDUCED ? 0.4 : t * 1.7, sgn = face >= 0 ? 1 : -1;
      var T;
      if (mode === 'dig') {
        var tx = arg + 10 + Math.sin(cyc) * 28;
        var dep = Math.min(bottomY(Math.max(8300, tx)), 230);
        var jit = REDUCED ? 0 : Math.sin(t * 23) * 2.2 * Math.max(0, Math.sin(cyc + 1.2));
        T = [(tx - x) * sgn, lerp(-30, dep - 12, 0.5 + 0.5 * Math.sin(cyc + 1.2)) + jit];
      } else if (mode === 'lift' && arg) T = [(arg[0] - x) * sgn, arg[1]];
      else if (mode === 'push') T = [220, -8 + (REDUCED ? 0 : Math.sin(cyc) * 4)];
      else T = [205, -70];
      ctx.save(); ctx.translate(x, 0); ctx.scale(face, 1);
      // tracks + blade
      ctx.beginPath(); ctx.moveTo(-100, -42); ctx.lineTo(100, -42); ctx.arc(100, -21, 21, -PI / 2, PI / 2); ctx.lineTo(-100, 0); ctx.arc(-100, -21, 21, PI / 2, PI * 1.5); ctx.closePath();
      fillC('#3A3936'); strokeW(1.2);
      var roll = (x / 18) % TAU;
      for (var w = -96; w <= 96; w += 48) { ctx.beginPath(); ctx.arc(w, -21, 12, 0, TAU); fillC(COL.concS); strokeW(0.8); line(w, -21, w + Math.cos(roll) * 10, -21 + Math.sin(roll) * 10, 0.8); }
      path([[118, -46], [134, -46], [140, 0], [118, 0]], true); fillC('#2F2E2B'); strokeW(1);
      line(100, -30, 120, -34, 3);
      // upper body, counterweight, ROPS cab
      rectP(-112, -92, 70, -44); fillC(COL.conc); strokeW(1.3);
      ctx.beginPath(); ctx.moveTo(-112, -98); ctx.lineTo(-138, -88); ctx.lineTo(-138, -50); ctx.lineTo(-112, -44); ctx.closePath(); fillC(COL.concS); strokeW(1.2);
      path([[-74, -92], [-74, -202], [20, -202], [36, -92]], true); fillC(COL.conc); strokeW(1.3);
      path([[-64, -190], [12, -190], [24, -104], [-64, -104]], true); fillC('#9FA9AC'); strokeW(0.9);
      line(-60, -180, -20, -112, 0.6, 'rgba(255,255,255,0.5)');
      rectP(-130, -60, -116, -50); fillC(COL.red);
      // boom + arm via 2-link IK (elbow up)
      var B = [56, -104], L1 = 215, L2 = 165;
      var dx = T[0] - B[0], dy = T[1] - B[1], d = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 1, L1 + L2 - 1);
      var phi = Math.atan2(dy, dx), offA = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
      var th1 = phi - offA, E = [B[0] + Math.cos(th1) * L1, B[1] + Math.sin(th1) * L1];
      var th2 = Math.atan2(T[1] - E[1], T[0] - E[0]), Tt = [E[0] + Math.cos(th2) * L2, E[1] + Math.sin(th2) * L2];
      ctx.lineCap = 'round';
      [[B, E, 20], [E, Tt, 14]].forEach(function (sg) {
        ctx.beginPath(); ctx.moveTo(sg[0][0], sg[0][1]); ctx.lineTo(sg[1][0], sg[1][1]);
        ctx.lineWidth = sg[2]; ctx.strokeStyle = COL.ink; ctx.stroke();
        ctx.lineWidth = sg[2] - 2.6 * ip; ctx.strokeStyle = COL.conc; ctx.stroke();
      });
      ctx.lineCap = 'butt';
      // hydraulic rams: boom and arm
      line(B[0] - 10, B[1] + 18, lerp(B[0], E[0], 0.55), lerp(B[1], E[1], 0.55) + 8, 3.6);
      line(lerp(B[0], E[0], 0.8), lerp(B[1], E[1], 0.8) - 12, lerp(E[0], Tt[0], 0.3), lerp(E[1], Tt[1], 0.3) - 10, 2.6);
      // bucket: open while digging/pushing, curled with a hook while lifting/carrying
      var curl = mode === 'lift' || mode === 'carry' ? 1.2 : 0;
      var ca = th2 + 1.9 - curl, cb = th2 + 0.7 - curl;
      path([Tt, [Tt[0] + Math.cos(ca) * 44, Tt[1] + Math.sin(ca) * 44], [Tt[0] + Math.cos(cb) * 36, Tt[1] + Math.sin(cb) * 36]], true);
      fillC('#2F2E2B'); strokeW(1);
      ctx.beginPath(); ctx.arc(E[0], E[1], 7, 0, TAU); fillC(COL.ink);
      ctx.restore();
    }

    // ---------- panel: title block + photo cards ----------
    function drawPanel(p, now) {
      screen();
      var py = L.panelY;
      ctx.fillStyle = COL.panel; ctx.fillRect(0, py, W, H - py);
      if (pores) { ctx.fillStyle = poreTile || (poreTile = ctx.createPattern(pores, 'repeat')); ctx.globalAlpha = 0.5; ctx.fillRect(0, py, W, H - py); ctx.globalAlpha = 1; }
      ctx.fillStyle = COL.ink; ctx.fillRect(0, py, W, 1);
      ctx.fillStyle = 'rgba(22,22,22,0.35)'; ctx.fillRect(L.card.x - 14, py + 10, 1, H - py - 20);
      // crop marks of the drawing area
      var D = L.draw, m = 10;
      ctx.strokeStyle = 'rgba(22,22,22,0.4)'; ctx.lineWidth = 1; ctx.beginPath();
      [[D.x, D.y, 1, 1], [D.x + D.w, D.y, -1, 1]].forEach(function (c) { ctx.moveTo(c[0], c[1] + c[3] * m); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0] + c[2] * m, c[1]); });
      ctx.stroke();

      // title block
      var info = blockInfo(p), B = L.block, fs = L.fs;
      if (info[1] !== lastVal) { lastVal = info[1]; valT = now; }
      var va = REDUCED ? 1 : sm(clamp((now - valT) / 260, 0, 1));
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      setFont(fs.lab, 500); spacing('0.14em');
      ctx.fillStyle = 'rgba(22,22,22,0.62)'; ctx.fillText(info[0], B.x, B.y + fs.lab + 6);
      spacing('0.02em');
      setFont(fs.val, 600);
      ctx.save(); ctx.globalAlpha = va; ctx.fillStyle = COL.ink;
      var vy = B.y + fs.lab + 14 + fs.val + (1 - va) * 6;
      ctx.fillText(fitText(info[1], B.w, fs.val, 600), B.x, vy);
      ctx.restore();
      setFont(fs.sub, 400); spacing('0.03em');
      ctx.fillStyle = 'rgba(22,22,22,0.78)';
      var lines = wrap(info[2], B.w), ly = vy + fs.sub + 10;
      lines.forEach(function (tx, i) { ctx.fillText(tx, B.x, ly + i * (fs.sub + 5)); });
      // red accent tick
      ctx.fillStyle = COL.red; ctx.fillRect(B.x, B.y - 2, 22, 3);
      spacing('0px');

      // cards
      for (var i = 0; i < CARDS.length; i++) {
        var c = CARDS[i];
        if (p < c.a || p > c.d) continue;
        var a = sm(seg(p, c.a, c.a + (c.b - c.a) * 0.5)) * (1 - sm(seg(p, c.c, c.d)));
        var rv = sm(seg(p, c.a, c.b));
        drawCard(c, a, rv);
      }
    }
    function fitText(tx, w, px, wt) {
      if (ctx.measureText(tx).width <= w) return tx;
      var sz = px; while (sz > 9 && ctx.measureText(tx).width > w) { sz -= 1; setFont(sz, wt); }
      return tx;
    }
    function wrap(tx, w) {
      if (ctx.measureText(tx).width <= w) return [tx];
      var parts = tx.split(' · '), out = [], cur = '';
      parts.forEach(function (pt) { var nx = cur ? cur + ' · ' + pt : pt; if (cur && ctx.measureText(nx).width > w) { out.push(cur); cur = pt; } else cur = nx; });
      if (cur) out.push(cur);
      return out;
    }
    function drawCard(c, a, rv) {
      var im = IMG[c.img], C = L.card;
      if (a <= 0.01) return;
      // caption
      ctx.save(); ctx.globalAlpha = a;
      setFont(L.fs.cap, 500); spacing('0.1em'); ctx.fillStyle = 'rgba(22,22,22,0.7)';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      var cap = 'FOTO · ' + c.cap.toUpperCase();
      while (cap.length > 8 && ctx.measureText(cap).width > C.w) cap = cap.slice(0, -2) + '…';
      ctx.fillText(cap, C.x, C.y - 7);
      spacing('0px'); ctx.restore();
      if (!im || !im._ok || !im.naturalWidth) {
        ctx.save(); ctx.globalAlpha = a * 0.5; ctx.strokeStyle = COL.ink; ctx.setLineDash([4, 4]); ctx.strokeRect(C.x + 0.5, C.y + 0.5, C.w - 1, C.h - 1); ctx.restore();
        return;
      }
      var pw = Math.round(C.w * K), ph = Math.round(C.h * K);
      if (cardCv.width !== pw || cardCv.height !== ph) { cardCv.width = pw; cardCv.height = ph; }
      cctx.setTransform(1, 0, 0, 1, 0, 0); cctx.globalCompositeOperation = 'source-over'; cctx.clearRect(0, 0, pw, ph);
      var iw = im.naturalWidth, ih = im.naturalHeight, sc = Math.max(pw / iw, ph / ih) * (1.08 - 0.08 * rv);
      var dw = iw * sc, dh = ih * sc;
      cctx.drawImage(im, (pw - dw) / 2, (ph - dh) * (c.fy || 0.5), dw, dh);
      if (rv < 1) {
        var e = 1.25 - rv * 1.5, f = 0.22;
        cctx.globalCompositeOperation = 'destination-in';
        var g = cctx.createLinearGradient(0, 0, 0, ph);
        var stops = [0, 1, clamp(e - f, 0, 1), clamp(e, 0, 1)].sort(function (u, v) { return u - v; });
        stops.forEach(function (v) { g.addColorStop(v, 'rgba(0,0,0,' + clamp((v - (e - f)) / f, 0, 1).toFixed(3) + ')'); });
        cctx.fillStyle = g; cctx.fillRect(0, 0, pw, ph);
        cctx.globalCompositeOperation = 'source-over';
      }
      ctx.save(); screen(); ctx.globalAlpha = a;
      ctx.drawImage(cardCv, C.x, C.y, C.w, C.h);
      ctx.globalAlpha = a * sm(seg(rv, 0.3, 1));
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 1; ctx.strokeRect(C.x + 0.5, C.y + 0.5, C.w - 1, C.h - 1);
      ctx.restore();
    }

    // ---------- frame ----------
    function render(now) {
      var p = pos, t = tAmb;
      var intro = REDUCED ? 1 : clamp((now - mountT) / 1300, 0, 1);
      setView(p);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawBackground();
      world();
      ctx.lineJoin = 'round';
      drawGround();
      drawSection(p, t);
      world();
      drawPlant(p, t, intro);
      drawSlab(p, t);
      drawTruck(p, t, intro);
      world();
      drawElements(p, t);
      // plant labels
      var plA = sm(seg(intro, 0.55, 1)) * (1 - seg(p, 0.2, 0.25));
      label(420, -1250, 'CEMENTS', plA, 70, -26);
      label(1190, -1000, 'ŪDENS', plA, -40, -34);
      label(1450, -760, 'MAISĪTĀJS', plA, 90, -150);
      // finale: low warm light over the finished lawn
      var warm = sm(seg(p, 0.95, 1));
      if (warm > 0.01) {
        screen();
        var D0 = L.draw, wg = ctx.createRadialGradient(D0.x + D0.w * 0.78, D0.y, 10, D0.x + D0.w * 0.6, D0.y + D0.h * 0.45, D0.w * 0.95);
        wg.addColorStop(0, 'rgba(255,190,110,' + (0.2 * warm).toFixed(3) + ')'); wg.addColorStop(1, 'rgba(255,190,110,0)');
        ctx.fillStyle = wg; ctx.fillRect(0, 0, W, L.panelY);
        world();
      }
      label(2685, -380, 'ŠĶEMBA / OĻI', plA, 30, -70);
      label(2362, -200, '5/8', plA, -26, 60);
      label(2577, -200, '8/16', plA, 26, 60);
      drawPanel(p, now);
    }

    function frame(now) {
      raf = 0;
      if (destroyed) return;
      var dt = last ? clamp((now - last) / 1000, 0, 0.05) : 0.016; last = now;
      if (!REDUCED) { tAmb += dt; drumAng += dt * drumRate(pos); }
      if (playing) { target = clamp((now - playing.t0) / playing.dur, 0, 1); if (target >= 1) playing = null; }
      if (REDUCED) { pos = target; vel = 0; }
      else {
        var w = 13;
        var acc = -2 * w * vel - w * w * (pos - target);
        vel += acc * dt; pos += vel * dt;
        if (Math.abs(pos - target) < 1e-5 && Math.abs(vel) < 1e-5) { pos = target; vel = 0; }
      }
      render(now);
      if (!paused) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf && !destroyed) raf = requestAnimationFrame(frame); }
    kick();

    return {
      setProgress: function (p) { playing = null; target = clamp(+p || 0, 0, 1); if (paused) { pos = target; vel = 0; render(performance.now()); } else kick(); },
      play: function (sec) { playing = { t0: performance.now(), dur: Math.max(0.5, +sec || 12) * 1000 }; target = 0; pos = 0; vel = 0; kick(); },
      setPaused: function (b) { b = !!b; if (b === paused) return; paused = b; if (b) { if (raf) cancelAnimationFrame(raf); raf = 0; } else { last = 0; kick(); } },
      destroy: function () { destroyed = true; if (raf) cancelAnimationFrame(raf); raf = 0; if (ro) ro.disconnect(); else window.removeEventListener('resize', resize); if (cv.parentNode) cv.parentNode.removeChild(cv); }
    };
  }

  window.RRStage = { mount: mount };
})();
