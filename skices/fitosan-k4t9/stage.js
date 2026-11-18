/* FITOSAN PLUS — "Kustības pieraksts" motion stage.
 * A chronophotography plate (Marey) of one articulated side-view figure in the centre's exercise hall.
 * Single canvas 2D renderer, no libraries, transparent canvas. World units = centimetres,
 * floor at y = 0, y grows downward, the figure faces right (+x).
 *
 * API: window.FITStage.mount(el) -> { setProgress(p), seek(p, t?), play(sec), setPaused(b), destroy() }
 *      window.FITStage.CUTS = [0.10, 0.26, 0.44, 0.58, 0.72, 0.87]
 *
 * Timeline (progress p) — page text beats switch at .10 .26 .44 .58 .72 .87:
 *   0.00–0.10 Hero            hall draws in; the arm rises to 125° (plays once on mount), ghost arms, range-of-motion arc
 *   0.10–0.26 Izvērtējums     push-in; plumb line (stāja); knee flexion with goniometer arc; card "Ārsts novērtē"
 *   0.26–0.44 Fizioterapija   walk left→right with ghost poses and step marks (.272–.365);
 *                             balance cushion, single-leg stance, sway trace (.365–.44)
 *   0.44–0.58 Fizikālā ter.   couch draws in, figure sits; applicator on the shoulder; three physical factors
 *                             in turn (.47–.506 SMS · .506–.544 magnetic field · .544–.58 ultrasound)
 *   0.58–0.72 Ergoterapija    table rolls in; reach → grasp → cup to the mouth → back; dotted hand path
 *   0.72–0.87 Runa/uzturs/m.  sound arcs + letters (.725–), plate proportions inset (.772–), watercolour inset (.815–)
 *   0.87–1.00 Pieraksts       table rolls away, figure stands up and walks on; camera pulls back; appointment card
 * Degree / centimetre readouts are illustrative (disclosed by the page note).
 */
(function () {
  'use strict';

  // ---------- math ----------
  var PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
  var sin = Math.sin, cos = Math.cos;
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function seg(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function inOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function outCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function inCubic(t) { return t * t * t; }
  function outBack(t, k) { if (t <= 0) return 0; k = k == null ? 1.4 : k; var u = t - 1; return 1 + (k + 1) * u * u * u + k * u * u; }
  function bump(t) { return sin(PI * clamp(t, 0, 1)); }

  // ---------- palette & type ----------
  var C = {
    ink: '#1B2A2C', soft: '#46585A', slate: '#495E60', fig: '#243739', far: '#70868A', paper: '#EEF2F0',
    red: '#C2321F', wood: '#C9A06A', woodD: '#A98150', mat: '#2E8CA3', sheet: '#FBFCFB',
    hair: 'rgba(27,42,44,.14)', hair2: 'rgba(27,42,44,.26)', frame: '#9AACAD'
  };
  var MONO = '"Atkinson Hyperlegible Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  var DISP = '"Radio Canada Big", "Atkinson Hyperlegible Next", system-ui, -apple-system, "Segoe UI", sans-serif';
  var BODY = '"Atkinson Hyperlegible Next", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  // exact strings (client's own wording / contacts)
  var TXT = {
    rom: 'kustību apjoms', posture: 'stāja', gait: 'gaita', balance: 'līdzsvars',
    cardTitle: 'Ārsts novērtē',
    cardItems: ['veselības stāvokli', 'funkcionālos ierobežojumus', 'rehabilitācijas potenciālu', 'motivāciju', 'piemērotāko pakalpojuma veidu'],
    phys: ['Amplipulsterapija (SMS)', 'Mainīgā magnētiskā lauka terapija', 'Ultraskaņas terapija'],
    ergo: 'ikdienas nodarbes',
    letters: ['A', 'Ā', 'B', 'R', 'S', 'Š'],
    speech: 'runa · valoda · balss', food: 'produktu grupu proporcijas', art: 'akvareļi · guaša · māls',
    fTitle: 'Pieraksts', fPhone: '(+371) 63011748', fHours: 'P–Pk 8:00–19:00', fAddr: 'Pērnavas iela 4F, Jelgava'
  };

  // logo tree traced from the client's logo (img/tree.svg, viewBox 66.29 × 100, evenodd)
  var TREE_D = 'M38.41 0.00C37.86 0.12 37.27 0.24 36.27 0.71C35.28 1.19 33.81 2.51 32.43 2.84C31.06 3.18 28.85 2.68 28.02 2.70C27.19 2.73 27.83 2.70 27.45 2.99C27.07 3.27 26.13 4.01 25.75 4.41C25.37 4.81 25.32 4.72 25.18 5.41C25.04 6.09 25.32 7.80 24.89 8.53C24.47 9.27 23.38 9.25 22.62 9.82C21.86 10.38 21.01 11.43 20.34 11.95C19.68 12.47 19.35 12.23 18.63 12.94C17.92 13.66 16.60 15.41 16.07 16.22C15.55 17.02 15.58 17.31 15.50 17.78C15.43 18.26 15.15 18.21 15.65 19.06C16.15 19.91 17.99 22.05 18.49 22.90C18.99 23.76 18.71 23.87 18.63 24.18C18.56 24.49 18.54 24.61 18.07 24.75C17.59 24.89 16.62 24.80 15.79 25.04C14.96 25.27 13.82 25.77 13.09 26.17C12.35 26.58 11.85 26.98 11.38 27.45C10.91 27.93 10.62 28.05 10.24 29.02C9.86 29.99 9.27 31.70 9.10 33.29C8.94 34.87 9.06 37.22 9.25 38.55C9.44 39.88 9.84 40.61 10.24 41.25C10.64 41.89 10.83 42.01 11.66 42.39C12.49 42.77 14.60 43.15 15.22 43.53C15.84 43.91 15.58 44.29 15.36 44.67C15.15 45.05 14.39 45.28 13.94 45.80C13.49 46.33 12.90 46.87 12.66 47.80C12.42 48.72 12.71 50.55 12.52 51.35C12.33 52.16 12.16 52.20 11.52 52.63C10.88 53.06 9.72 53.65 8.68 53.91C7.63 54.17 6.09 53.96 5.26 54.20C4.43 54.43 4.24 55.05 3.70 55.33C3.15 55.62 2.56 55.36 1.99 55.90C1.42 56.45 0.62 57.42 0.28 58.61C-0.05 59.79 -0.12 61.71 0.00 63.02C0.12 64.32 0.66 65.55 1.00 66.43C1.33 67.31 1.80 67.66 1.99 68.28C2.18 68.90 1.92 69.46 2.13 70.13C2.35 70.79 2.56 71.41 3.27 72.26C3.98 73.12 5.29 74.47 6.40 75.25C7.52 76.03 8.30 76.51 9.96 76.96C11.62 77.41 14.68 77.79 16.36 77.95C18.04 78.12 18.78 77.74 20.06 77.95C21.34 78.17 22.83 78.64 24.04 79.23C25.25 79.82 26.58 80.87 27.31 81.51C28.05 82.15 28.12 82.12 28.45 83.07C28.78 84.02 29.16 85.85 29.30 87.20C29.45 88.55 29.47 89.88 29.30 91.18C29.14 92.48 28.78 94.12 28.31 95.02C27.83 95.92 27.90 96.28 26.46 96.59C25.01 96.89 20.86 96.68 19.63 96.87C18.40 97.06 19.16 97.39 19.06 97.72C18.97 98.06 18.94 98.53 19.06 98.86C19.18 99.19 19.49 99.53 19.77 99.72C20.06 99.91 15.72 99.95 20.77 100.00C25.82 100.05 44.95 100.12 50.07 100.00C55.19 99.88 51.23 99.76 51.49 99.29C51.75 98.81 51.73 97.68 51.64 97.16C51.54 96.63 51.45 96.25 50.92 96.16C50.40 96.06 49.72 96.51 48.51 96.59C47.30 96.66 44.69 96.70 43.67 96.59C42.65 96.47 42.84 96.82 42.39 95.87C41.94 94.93 41.18 93.55 40.97 90.90C40.75 88.24 40.94 82.05 41.11 79.94C41.28 77.83 41.77 78.92 41.96 78.24C42.15 77.55 41.96 76.53 42.25 75.82C42.53 75.11 43.12 74.40 43.67 73.97C44.22 73.54 45.00 73.38 45.52 73.26C46.04 73.14 46.18 73.00 46.80 73.26C47.42 73.52 48.27 74.56 49.22 74.82C50.17 75.08 51.61 74.96 52.49 74.82C53.37 74.68 53.44 74.66 54.48 73.97C55.52 73.28 57.56 72.05 58.75 70.70C59.93 69.35 61.10 66.95 61.59 65.86C62.09 64.77 61.83 64.89 61.74 64.15C61.64 63.42 61.64 62.38 61.02 61.45C60.41 60.53 58.53 59.22 58.04 58.61C57.54 57.99 57.56 58.11 58.04 57.75C58.51 57.40 60.10 57.09 60.88 56.47C61.66 55.86 62.23 54.98 62.73 54.05C63.23 53.13 63.63 51.97 63.87 50.92C64.11 49.88 63.82 49.12 64.15 47.80C64.49 46.47 65.60 44.03 65.86 42.96C66.12 41.89 65.98 41.99 65.72 41.39C65.46 40.80 64.96 40.02 64.30 39.40C63.63 38.79 62.59 38.00 61.74 37.70C60.88 37.39 59.74 37.70 59.17 37.55C58.61 37.41 58.46 37.17 58.32 36.84C58.18 36.51 58.13 36.01 58.32 35.56C58.51 35.11 58.56 34.47 59.46 34.14C60.36 33.81 62.64 33.97 63.73 33.57C64.82 33.17 65.58 32.48 66.00 31.72C66.43 30.96 66.48 30.11 66.29 29.02C66.10 27.93 65.34 26.10 64.86 25.18C64.39 24.25 63.89 23.85 63.44 23.47C62.99 23.09 63.35 23.00 62.16 22.90C60.98 22.81 57.40 22.95 56.33 22.90C55.26 22.85 55.95 22.78 55.76 22.62C55.57 22.45 55.31 22.50 55.19 21.91C55.07 21.31 55.26 19.91 55.05 19.06C54.84 18.21 54.34 17.40 53.91 16.79C53.49 16.17 53.15 15.79 52.49 15.36C51.83 14.94 50.47 14.53 49.93 14.22C49.38 13.92 49.48 14.39 49.22 13.51C48.96 12.64 48.62 9.98 48.36 8.96C48.10 7.94 48.17 7.99 47.65 7.40C47.13 6.80 46.06 6.45 45.23 5.41C44.40 4.36 43.62 2.04 42.67 1.14C41.73 0.24 40.26 0.19 39.54 0.00C38.83 -0.19 38.95 -0.12 38.41 0.00ZM24.32 57.75C24.85 57.71 25.37 57.40 26.60 58.04C27.83 58.68 30.80 60.88 31.72 61.59C32.65 62.30 32.03 61.76 32.15 62.30C32.27 62.85 32.55 63.99 32.43 64.86C32.31 65.74 31.63 66.12 31.44 67.57C31.25 69.01 31.46 72.19 31.29 73.54C31.13 74.89 30.75 75.18 30.44 75.68C30.13 76.17 29.80 76.39 29.45 76.53C29.09 76.67 28.90 76.79 28.31 76.53C27.71 76.27 26.88 75.46 25.89 74.96C24.89 74.47 23.26 74.13 22.33 73.54C21.41 72.95 20.63 71.98 20.34 71.41C20.06 70.84 20.67 70.74 20.63 70.13C20.58 69.51 20.10 68.44 20.06 67.71C20.01 66.97 20.20 66.12 20.34 65.72C20.48 65.32 20.34 65.36 20.91 65.29C21.48 65.22 23.12 65.48 23.76 65.29C24.40 65.10 24.61 64.53 24.75 64.15C24.89 63.77 24.87 63.73 24.61 63.02C24.35 62.30 23.38 60.67 23.19 59.89C23.00 59.10 23.28 58.68 23.47 58.32C23.66 57.97 23.80 57.80 24.32 57.75ZM40.40 57.75C40.94 57.44 42.89 59.36 43.53 59.89C44.17 60.41 43.76 60.57 44.24 60.88C44.71 61.19 45.73 61.07 46.37 61.74C47.01 62.40 47.80 64.04 48.08 64.86C48.36 65.69 48.15 66.24 48.08 66.71C48.01 67.19 47.96 67.33 47.65 67.71C47.34 68.09 47.08 68.52 46.23 68.99C45.38 69.46 43.39 70.29 42.53 70.55C41.68 70.82 41.49 70.72 41.11 70.55C40.73 70.39 40.33 70.06 40.26 69.56C40.18 69.06 40.68 68.87 40.68 67.57C40.68 66.26 40.30 63.37 40.26 61.74C40.21 60.10 39.85 58.06 40.40 57.75Z';
  var TREE = null;

  // ---------- body ----------
  var THIGH = 42, SHANK = 41, UARM = 29, FARM = 25, HAND = 8.5, STAND_Y = -89.9;
  var KEYS = ['x', 'y', 'lean', 'neck', 'ns', 'ne', 'fs', 'fe', 'nh', 'nk', 'na', 'fh', 'fk', 'fa'];
  function mk() { return { x: 0, y: STAND_Y, lean: 0.02, neck: 0, ns: 0.05, ne: 0.14, fs: -0.04, fe: 0.12, nh: 0.035, nk: 0.03, na: -0.005, fh: -0.03, fk: 0.02, fa: 0.05 }; }
  function blend(a, b, t) { var q = {}; for (var i = 0; i < KEYS.length; i++) { var k = KEYS[i]; q[k] = a[k] + (b[k] - a[k]) * t; } return q; }

  // leg → [kx,ky, ax,ay, FAx,FAy, FBx,FBy, heelx,heely, toex,toey]
  function legPts(hx, hy, h, k, a) {
    var kx = hx + THIGH * sin(h), ky = hy + THIGH * cos(h), sa = h - k;
    var ax = kx + SHANK * sin(sa), ay = ky + SHANK * cos(sa), tf = sa + PI / 2 + a;
    var fx = sin(tf), fy = cos(tf), nx = -cos(tf), ny = sin(tf);
    return [kx, ky, ax, ay,
      ax - 3 * fx + 4 * nx, ay - 3 * fy + 4 * ny, ax + 15 * fx + 4.7 * nx, ay + 15 * fy + 4.7 * ny,
      ax - 3 * fx + 7 * nx, ay - 3 * fy + 7 * ny, ax + 15 * fx + 6.9 * nx, ay + 15 * fy + 6.9 * ny];
  }
  // arm → [ex,ey, wx,wy, hx,hy]
  function armPts(sx, sy, sa, ea) {
    var ex = sx + UARM * sin(sa), ey = sy + UARM * cos(sa), fa = sa + ea;
    var wx = ex + FARM * sin(fa), wy = ey + FARM * cos(fa);
    return [ex, ey, wx, wy, wx + HAND * sin(fa + 0.08), wy + HAND * cos(fa + 0.08)];
  }
  function torsoPts(q) {
    var ux = sin(q.lean), uy = -cos(q.lean), hl = q.lean * 0.5 + q.neck;
    var nbx = q.x + 53 * ux, nby = q.y + 53 * uy;
    return { sx: q.x + 48.5 * ux, sy: q.y + 48.5 * uy, cx: q.x + 41 * ux, cy: q.y + 41 * uy, nbx: nbx, nby: nby,
      hx: nbx + 14.5 * sin(hl) + 1.5, hy: nby - 14.5 * cos(hl), hl: hl };
  }
  function skel(q) {
    var t = torsoPts(q);
    t.px = q.x; t.py = q.y;
    t.na = armPts(t.sx, t.sy, q.ns, q.ne); t.fa = armPts(t.sx - 1.5, t.sy + 0.5, q.fs, q.fe);
    t.nl = legPts(q.x, q.y, q.nh, q.nk, q.na); t.fl = legPts(q.x - 1, q.y, q.fh, q.fk, q.fa);
    return t;
  }
  function ground(q, floorY) {
    var a = legPts(0, 0, q.nh, q.nk, q.na), b = legPts(-1, 0, q.fh, q.fk, q.fa);
    q.y = floorY - Math.max(a[9], a[11], b[9], b[11]);
    return q;
  }
  // 2-bone IK. Leg: knee forward (+x). Returns [h, k]
  function ikLeg(hx, hy, ax, ay) {
    var dx = ax - hx, dy = ay - hy, d = Math.min(Math.sqrt(dx * dx + dy * dy), THIGH + SHANK - 0.2);
    var al = Math.atan2(dx, dy), be = Math.acos(clamp((THIGH * THIGH + d * d - SHANK * SHANK) / (2 * THIGH * d), -1, 1));
    var ga = Math.acos(clamp((THIGH * THIGH + SHANK * SHANK - d * d) / (2 * THIGH * SHANK), -1, 1));
    return [al + be, PI - ga];
  }
  // Arm: elbow back/down. Returns [sa, ea]
  function ikArm(sx, sy, wx, wy) {
    var dx = wx - sx, dy = wy - sy, d = clamp(Math.sqrt(dx * dx + dy * dy), 6, UARM + FARM - 0.3);
    var al = Math.atan2(dx, dy), be = Math.acos(clamp((UARM * UARM + d * d - FARM * FARM) / (2 * UARM * d), -1, 1));
    var ga = Math.acos(clamp((UARM * UARM + FARM * FARM - d * d) / (2 * UARM * FARM), -1, 1));
    return [al - be, PI - ga];
  }

  // tapered capsule; works on a 2D context and on Path2D; constant winding so unions fill cleanly
  function cap(c, ax, ay, ra, bx, by, rb) {
    var an = Math.atan2(by - ay, bx - ax);
    c.moveTo(ax + ra * cos(an + PI / 2), ay + ra * sin(an + PI / 2));
    c.arc(ax, ay, ra, an + PI / 2, an + PI * 1.5);
    c.arc(bx, by, rb, an - PI / 2, an + PI / 2);
    c.closePath();
  }
  function dot(c, x, y, r) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); c.closePath(); }
  var P_BODY = 1, P_NARM = 2, P_FARM = 4, P_NLEG = 8, P_FLEG = 16, P_NSHANK = 32, P_ALL = 31;
  function addArm(c, sx, sy, a) { cap(c, sx, sy, 5.3, a[0], a[1], 4.4); cap(c, a[0], a[1], 4.3, a[2], a[3], 3.2); cap(c, a[2], a[3], 3.2, a[4], a[5], 2.5); }
  function addLeg(c, hx, hy, l, shankOnly) {
    if (!shankOnly) cap(c, hx, hy, 8.6, l[0], l[1], 6.3);
    cap(c, l[0], l[1], 6.0, l[2], l[3], 3.9); cap(c, l[4], l[5], 3.0, l[6], l[7], 2.2);
  }
  function addParts(c, k, m) {
    if (m & P_FARM) addArm(c, k.sx - 1.5, k.sy + 0.5, k.fa);
    if (m & P_FLEG) addLeg(c, k.px - 1, k.py, k.fl);
    if (m & P_NLEG) addLeg(c, k.px, k.py, k.nl);
    if (m & P_NSHANK) addLeg(c, k.px, k.py, k.nl, true);
    if (m & P_BODY) {
      cap(c, k.px - 1, k.py + 0.5, 9.8, k.cx, k.cy, 11.6);
      cap(c, k.nbx, k.nby + 2, 4.3, lerp(k.nbx, k.hx, 0.6), lerp(k.nby, k.hy, 0.6), 4.0);
      dot(c, k.hx, k.hy, 10.5);
      dot(c, k.hx + 9.4 * cos(k.hl) - 2.2 * sin(k.hl), k.hy + 9.4 * sin(k.hl) + 2.2 * cos(k.hl), 2.3);
    }
    if (m & P_NARM) addArm(c, k.sx, k.sy, k.na);
  }
  function ghostPath(q, m) { var pth = new Path2D(); addParts(pth, skel(q), m == null ? P_ALL : m); return pth; }

  // ---------- gait ----------
  // The walk is driven by foot placement, not by joint curves: every stance foot is planted at a fixed
  // world position (heel rocker → flat → toe rocker), the pelvis travels at constant speed, and the
  // hip/knee angles come out of 2-bone IK. So there is no foot sliding by construction.
  var STRIDE = 132, LEAD = 30, HEEL_N = -1.33, HEEL_F = -7.31;
  function walkArms(q, ph, A) {
    var s0 = mk();
    q.ns = lerp(s0.ns, -24 * DEG * cos(TAU * ph) + 0.04, A); q.ne = lerp(s0.ne, 0.2 + 0.32 * (0.5 - 0.5 * cos(TAU * ph)), A);
    q.fs = lerp(s0.fs, 24 * DEG * cos(TAU * ph) + 0.04, A); q.fe = lerp(s0.fe, 0.2 + 0.32 * (0.5 + 0.5 * cos(TAU * ph)), A);
    q.lean = 0.02 + 0.05 * A;
  }
  // o: { heelN, heelF: initial heel offsets from x0; cushFrom: u after which plants land on the cushion }
  function makeWalk(x0, phi0, cycles, rampIn, rampOut, o) {
    o = o || {};
    var M = 400, tab = new Float32Array(M + 1), i;
    var h0n = o.heelN == null ? HEEL_N : o.heelN, h0f = o.heelF == null ? HEEL_F : o.heelF;
    function amp(u) { return smooth(seg(u, 0, rampIn)) * (rampOut ? 1 - smooth(seg(u, 1 - rampOut, 1)) : 1); }
    for (i = 1; i <= M; i++) tab[i] = tab[i - 1] + STRIDE * cycles * amp((i - 0.5) / M) / M;
    function Xat(u) { u = clamp(u, 0, 1); var x = u * M, k = Math.min(M - 1, x | 0); return x0 + tab[k] + (tab[k + 1] - tab[k]) * (x - k); }
    function plant(n, off) {            // n-th heel strike of a leg (off 0 = near, 0.5 = far)
      var un = (n - off - phi0) / cycles;
      if (un <= 1e-9) return { x: x0 + (off ? h0f : h0n), A: 0, fy: 0, u: un };
      un = Math.min(un, 1); var A = amp(un);
      return { x: Xat(un) + A * LEAD + (off ? HEEL_F : HEEL_N), A: A, fy: (o.cushFrom != null && un > o.cushFrom) ? -CUSH : 0, u: un };
    }
    // pelvis height: inverted pendulum over the leading (most recently planted) foot, eased into the next strike
    function pend(pl, x, R, f) { var dx = pl.x + lerp(0.43, 3, smooth(seg(f, 0, 0.12))) * (pl.A > 0 ? 1 : 0) + (pl.A > 0 ? 0 : 3) - x; return -pl.fy + 7.05 + Math.sqrt(Math.max(1, R * R - dx * dx)); }
    function hipY(u) {
      var ps = phi0 + cycles * u, pn = ps - Math.floor(ps + 1e-9), nearLead = pn < 0.5, f = nearLead ? pn : pn - 0.5;
      var offL = nearLead ? 0 : 0.5, offO = nearLead ? 0.5 : 0, A = amp(u);
      var L = plant(Math.floor(ps + offL + 1e-9), offL), H = pend(L, Xat(u), 82.85 - 0.9 * A * bump(seg(f, 0, 0.26)), f);
      if (f > 0.38) { var N = plant(Math.floor(ps + offO + 1e-9) + 1, offO); H = lerp(H, pend(N, Xat(N.u), 82.85, 0), smooth(seg(f, 0.38, 0.5))); }
      return -H;
    }
    function stanceFoot(n, frac, off, hx, hy, Anow) {   // → [ankle x, ankle y, pitch (toes up +)]
      var pl = plant(n, off), be, tf, fx, fy, nx, ny;
      if (frac < 0.12) {
        be = 20 * DEG * pl.A * (1 - smooth(frac / 0.12)); tf = PI / 2 + be; fx = sin(tf); fy = cos(tf); nx = -cos(tf); ny = sin(tf);
        return [pl.x + 3 * fx - 7 * nx, pl.fy + 3 * fy - 7 * ny, be];
      }
      var ax = pl.x + 3, ay = pl.fy - 7, d = Math.sqrt((ax - hx) * (ax - hx) + (ay - hy) * (ay - hy));
      var Rt = lerp(82.75, lerp(82.75, 79.2, Anow), smooth(seg(frac, 0.47, 0.6)));
      if (frac < 0.3 || d <= Rt) return [ax, ay, 0];
      var lo = -80 * DEG, hi = 0, tx = pl.x + 18, ty = pl.fy - 0.1;
      for (var it = 0; it < 16; it++) {
        be = (lo + hi) / 2; tf = PI / 2 + be; fx = sin(tf); fy = cos(tf); nx = -cos(tf); ny = sin(tf);
        ax = tx - 15 * fx - 6.9 * nx; ay = ty - 15 * fy - 6.9 * ny;
        d = Math.sqrt((ax - hx) * (ax - hx) + (ay - hy) * (ay - hy));
        if (d > Rt) hi = be; else lo = be;
      }
      return [ax, ay, be];
    }
    function foot(u, off, hx, hy) {
      var psi = phi0 + cycles * u + off, n = Math.floor(psi + 1e-9), frac = psi - n;
      if (frac <= 0.6) return stanceFoot(n, frac, off, hx, hy, amp(u));
      var uo = clamp((n + 0.6 - off - phi0) / cycles, 0, 1);
      var a = stanceFoot(n, 0.6, off, Xat(uo) - (off ? 1 : 0), hipY(uo), amp(uo)), b = stanceFoot(n + 1, 0, off, 0, 0, 0);
      var e = (frac - 0.6) / 0.4, se = e * e * (3 - 2 * e), Am = Math.max(amp(uo), plant(n + 1, off).A);
      var ax = lerp(a[0], b[0], lerp(se, e, 0.3)), ay = lerp(a[1], b[1], se) - Am * 5.5 * sin(PI * Math.pow(e, 0.8));
      var be = lerp(a[2], b[2], smooth(seg(e, 0.0, 0.9)));
      // keep the sole above the floor
      var tf = PI / 2 + be, low = Math.max(ay - 3 * cos(tf) + 7 * sin(tf), ay + 15 * cos(tf) + 6.9 * sin(tf));
      var fl = lerp(plant(n, off).fy, plant(n + 1, off).fy, se) - 1.3 * sin(PI * e);
      if (low > fl) ay -= low - fl;
      return [ax, ay, be];
    }
    var Wk = { x0: x0, x1: Xat(1), phi0: phi0, cycles: cycles, strikes: [] };
    Wk.pose = function (u) {
      u = clamp(u, 0, 1);
      var A = amp(u), ph = phi0 + cycles * u, q = mk();
      walkArms(q, ph, A);
      q.x = Xat(u); q.y = hipY(u);
      var a = foot(u, 0, q.x, q.y), b = foot(u, 0.5, q.x - 1, q.y);
      var hn = ikLeg(q.x, q.y, a[0], a[1]), hf = ikLeg(q.x - 1, q.y, b[0], b[1]);
      q.nh = hn[0]; q.nk = hn[1]; q.na = a[2] - (hn[0] - hn[1]);
      q.fh = hf[0]; q.fk = hf[1]; q.fa = b[2] - (hf[0] - hf[1]);
      return q;
    };
    for (var off = 0; off <= 0.5; off += 0.5) for (var n = Math.ceil(phi0 + off); n <= phi0 + off + cycles + 1e-6; n++) {
      var pl = plant(n, off); if (pl.u > 0.005 && pl.u < 0.999) Wk.strikes.push({ u: pl.u, x: pl.x, near: !off });
    }
    Wk.strikes.sort(function (p1, p2) { return p1.u - p2.u; });
    return Wk;
  }

  // ---------- scene (built once) ----------
  var SC = null;
  var RAISE = 125 * DEG, CUSH = 6, SEAT_DX = -40, SEAT_Y = -61, TABLE_Y = -76;
  function build() {
    var S = {};
    S.W1 = makeWalk(0, 0.5, 3, 0.18, 1 / 3, { cushFrom: 0.8 });
    var XB = S.XB = S.W1.x1;
    S.stB = S.W1.pose(1);
    var eb = skel(S.stB); S.nAx = eb.nl[2]; S.fAx = eb.fl[2];
    S.W2 = makeWalk(XB, 0.5, 2.55, 0.22, 0, { heelN: S.nAx - 3 - XB, heelF: S.fAx - 3 - XB });
    S.g1 = []; S.g2 = [];
    var i, q;
    for (i = 0; i < 12; i++) S.g1.push({ u: i / 12, path: ghostPath(S.W1.pose(i / 12)) });
    for (i = 0; i < 11; i++) { var u = i * 0.25 / 2.55; if (u < 0.985) S.g2.push({ u: u, path: ghostPath(S.W2.pose(u)) }); }
    S.gArm = [30, 60, 90].map(function (d) { q = ground(mk(), 0); q.ns = d * DEG; q.ne = 0.06; return { a: d * DEG, path: ghostPath(q, P_NARM) }; });
    S.gKnee = [30, 60].map(function (d) { q = mk(); q.nk = d * DEG; q.nh = 0.05; q.na = 0; ground(q, 0); q.y = STAND_Y; return { a: d * DEG, path: ghostPath(q, P_NSHANK) }; });
    // seated geometry
    S.tableX0 = XB - 6; S.tableX1 = XB + 112; S.cupX = XB + 23;
    S.couchX0 = XB - 196; S.couchX1 = XB - 20;
    S.bars2 = XB + 372;
    S.gErgo = null;
    return S;
  }

  // seated / sit-down / stand-up pose. e: 0 standing at XB … 1 seated on the couch edge
  function sitPose(e, p, T) {
    var S = SC, XB = S.XB, q = mk();
    var eX = 1 - (1 - e) * (1 - e), eY = smooth(e);
    q.x = XB + SEAT_DX * eX; q.y = lerp(STAND_Y, SEAT_Y, eY);
    var st = { cupX: S.cupX, cupY: TABLE_Y, cupTilt: 0, grip: 0, brush: 0 };
    // ergotherapy: reach → grasp → lift → back
    var t1 = inOut(seg(p, 0.607, 0.634)), t2 = inOut(seg(p, 0.640, 0.668)), t3 = inOut(seg(p, 0.682, 0.706)), t4 = inOut(seg(p, 0.712, 0.730));
    var lift = t2 * (1 - t3);
    var speak = smooth(seg(p, 0.722, 0.74)) * (1 - smooth(seg(p, 0.80, 0.83)));
    var paint = smooth(seg(p, 0.812, 0.828)) * (1 - smooth(seg(p, 0.862, 0.876)));
    q.lean = lerp(0.02, 0.05, e) + 0.36 * bump(e) + sin(T * 1.25) * 0.005 * e
      + 0.17 * t1 * (1 - t2) + 0.17 * t3 * (1 - t4) + 0.03 * lift + 0.10 * paint;
    q.neck = -0.10 * lift - 0.05 * speak + 0.06 * paint;
    var hN = ikLeg(q.x, q.y, lerp(S.nAx, XB + 7, e), -7), hF = ikLeg(q.x - 1, q.y, lerp(S.fAx, XB - 3, e), -7);
    q.nh = hN[0]; q.nk = hN[1]; q.na = q.nk - q.nh; q.fh = hF[0]; q.fk = hF[1]; q.fa = q.fk - q.fh;
    var t = torsoPts(q), kn = legPts(q.x, q.y, q.nh, q.nk, q.na), kf = legPts(q.x - 1, q.y, q.fh, q.fk, q.fa);
    var mx = t.hx + 9.2 * cos(t.hl) - 4.5 * sin(t.hl), my = t.hy + 9.2 * sin(t.hl) + 4.5 * cos(t.hl);
    st.mx = mx; st.my = my;
    // near wrist target
    var Rx = q.x + 0.62 * (kn[0] - q.x), Ry = q.y + 0.62 * (kn[1] - q.y) - 9;
    var Gx = S.cupX - 9.5, Gy = TABLE_Y - 6.5, Mx = mx + 4.5, My = my + 10;
    var R2x = S.tableX0 + 9, R2y = TABLE_Y - 4;
    var wx = lerp(Rx, Gx, t1), wy = lerp(Ry, Gy, t1) - 9 * bump(t1);
    wx = lerp(wx, Mx, lift); wy = lerp(wy, My, lift) - 4 * bump(lift);
    wx = lerp(wx, R2x, t4); wy = lerp(wy, R2y, t4) - 5 * bump(t4);
    if (paint > 0) {
      var bx = XB + 13 + 8 * sin((p - 0.81) * 250), by = TABLE_Y - 14.5 + 1.5 * cos((p - 0.81) * 380);
      wx = lerp(wx, bx, paint); wy = lerp(wy, by, paint) - 6 * bump(paint); st.brush = paint;
    }
    st.wx = wx; st.wy = wy;
    st.grip = t1 >= 1 && t4 <= 0 ? 1 : 0;
    if (st.grip) { st.cupTilt = -0.62 * smooth(seg(lift, 0.55, 1)); st.cupX = lerp(S.cupX, mx + 8.5, lift); st.cupY = lerp(TABLE_Y, my + 11.5, lift) - 4 * bump(lift); }
    st.cupA = 1 - smooth(seg(p, 0.756, 0.778));
    var aN = ikArm(t.sx, t.sy, wx, wy);
    var aF = ikArm(t.sx - 1.5, t.sy + 0.5, q.x - 1 + 0.46 * (kf[0] - q.x + 1), q.y + 0.46 * (kf[1] - q.y) - 9);
    var k = smooth(e);
    q.ns = lerp(0.05 + q.lean * 0.4, aN[0], k); q.ne = lerp(0.14, aN[1], k);
    q.fs = lerp(-0.04 + q.lean * 0.4, aF[0], k); q.fe = lerp(0.12, aF[1], k);
    q.st = st;
    return q;
  }

  // figure pose for progress p
  function poseAt(p, T, introK, live) {
    var S = SC, q, e, u;
    if (p < 0.272) {
      q = mk();
      var raise = RAISE * introK * (1 - inOut(seg(p, 0.078, 0.122))), raise0 = raise;
      if (live) raise += sin(T * 0.9) * 0.022 * introK * (1 - seg(p, 0.06, 0.1));
      q.ns = 0.05 + raise; q.ne = lerp(0.14, 0.05, clamp(raise / RAISE, 0, 1));
      q.lean = 0.02 - 0.012 * (raise / RAISE) + (live ? sin(T * 1.25) * 0.004 : 0);
      q.neck = -0.05 * (raise / RAISE);
      var kf = inOut(seg(p, 0.162, 0.222)) * (1 - inOut(seg(p, 0.238, 0.27)));
      q.nk = 0.03 + (PI / 2 - 0.03) * kf; q.nh = 0.035 + 0.03 * kf; q.na = lerp(-0.005, 0.12, kf);
      q.fs = -0.04 - 0.10 * kf; q.ns += 0.12 * kf * (1 - clamp(raise, 0, 1));
      q.x = 0; q.y = STAND_Y;
      var b = legPts(-1, 0, q.fh, q.fk, q.fa); q.y = -Math.max(b[9], b[11]);
      q.kf = kf; q.raise = raise; q.raise0 = raise0;
      return q;
    }
    if (p < 0.365) {
      return S.W1.pose(seg(p, 0.272, 0.365));
    }
    if (p < 0.445) {
      var st = S.stB;
      var bal = mk(); bal.x = S.XB;
      var sw = live ? sin(T * 1.7) * 0.012 + sin(T * 2.9 + 1) * 0.006 : 0;
      bal.nh = 40 * DEG + sw * 2; bal.nk = 74 * DEG; bal.na = -0.2;
      bal.fh = st.fh + sw; bal.fk = st.fk; bal.fa = st.fa - sw;
      bal.ns = 30 * DEG - sw * 6; bal.ne = 0.42; bal.fs = -26 * DEG + sw * 6; bal.fe = 0.5; bal.lean = 0.03 + sw * 1.5; bal.neck = -sw;
      e = inOut(seg(p, 0.365, 0.392)) * (1 - inOut(seg(p, 0.426, 0.446)));
      q = blend(st, bal, e);
      var b2 = legPts(-1, 0, q.fh, q.fk, q.fa);
      q.y = -CUSH * (1 - smooth(seg(p, 0.428, 0.446))) - Math.max(b2[9], b2[11]);
      q.bal = e;
      return q;
    }
    if (p < 0.915) {
      e = inOut(seg(p, 0.445, 0.48)) * (1 - inOut(seg(p, 0.874, 0.915)));
      return sitPose(e, p, live ? T : 0);
    }
    return S.W2.pose(seg(p, 0.915, 1));
  }

  // camera keys [p, cx, cy, w, h]
  function camKeys(XB, narrow) {
    return narrow ? [
      [0, -12, -112, 300, 282], [0.09, -8, -112, 288, 270], [0.15, 76, -100, 262, 240], [0.25, 74, -100, 252, 232],
      [0.30, 95, -112, 420, 330], [0.365, XB - 95, -112, 430, 330], [0.40, XB - 4, -116, 300, 280], [0.44, XB - 2, -116, 292, 272],
      [0.485, XB - 10, -128, 296, 288], [0.575, XB - 8, -128, 286, 278],
      [0.62, XB + 30, -102, 272, 250], [0.71, XB + 34, -102, 264, 242],
      [0.76, XB + 56, -112, 300, 276], [0.86, XB + 58, -112, 292, 268],
      [0.94, XB + 110, -165, 500, 470], [1, XB + 128, -172, 520, 490]
    ] : [
      [0, -45, -114, 320, 290], [0.09, -37, -114, 304, 276], [0.15, 44, -98, 262, 236], [0.25, 42, -98, 250, 226],
      [0.30, 95, -112, 430, 330], [0.365, XB - 95, -112, 440, 330], [0.40, XB - 8, -112, 300, 276], [0.44, XB - 6, -112, 290, 268],
      [0.485, XB + 22, -104, 300, 262], [0.575, XB + 26, -104, 286, 250],
      [0.62, XB + 32, -100, 272, 244], [0.71, XB + 36, -100, 262, 236],
      [0.76, XB + 52, -112, 292, 268], [0.86, XB + 56, -112, 284, 260],
      [0.94, XB + 110, -150, 520, 450], [1, XB + 130, -158, 540, 470]
    ];
  }

  // ---------- mount ----------
  function mount(el) {
    if (!SC) SC = build();
    if (!TREE) { try { TREE = new Path2D(TREE_D); } catch (e) { TREE = null; } }
    var S = SC, XB = S.XB;
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    el.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var W = 1, H = 1, dpr = 1, narrow = false, IN = { t: 84, b: 56, l: 20, r: 20 }, aw = 1, ah = 1;
    var KEYSCAM = camKeys(XB, false), cam = [0, 0, 1, 1], s = 1, ox = 0, oy = 0;
    var cur = 0, vel = 0, target = 0, T = 0, introT = reduce ? 9 : 0;
    var playing = null, paused = false, raf = 0, last = 0, destroyed = false;
    var F = {}, meas = {};

    function resize() {
      var r = el.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      narrow = W < 560;
      IN = narrow ? { t: 12, b: Math.round(H * 0.16), l: 12, r: 12 } : { t: 84, b: 56, l: 20, r: 20 };
      aw = Math.max(1, W - IN.l - IN.r); ah = Math.max(1, H - IN.t - IN.b);
      KEYSCAM = camKeys(XB, narrow);
      var big = !narrow && W > 900;
      F = narrow ? { lab: 9.5, labB: 10, num: 16, card: 9.5, title: 11.5, row: 18, phone: 21, body: 11.5 }
        : { lab: big ? 12.5 : 11.5, labB: big ? 13 : 12, num: big ? 24 : 21, card: big ? 12.5 : 11.5, title: big ? 14.5 : 13.5, row: big ? 25 : 23, phone: big ? 31 : 27, body: big ? 14 : 13 };
      meas = {};
      draw();
    }

    function camAt(p) {
      var K = KEYSCAM, i = 0;
      while (i < K.length - 2 && p > K[i + 1][0]) i++;
      var a = K[i], b = K[i + 1], t = inOut(seg(p, a[0], b[0]));
      cam[0] = lerp(a[1], b[1], t); cam[1] = lerp(a[2], b[2], t); cam[2] = lerp(a[3], b[3], t); cam[3] = lerp(a[4], b[4], t);
    }
    function world() { ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (ox - cam[0] * s), dpr * (oy - cam[1] * s)); }
    function screen() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function X(x) { return ox + (x - cam[0]) * s; }
    function Y(y) { return oy + (y - cam[1]) * s; }
    function px(n) { return n / s; }
    function font(w, size, fam) { return w + ' ' + size + 'px ' + fam; }
    // text in screen space
    function text(str, x, y, f, col, align, a) {
      ctx.font = f; ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
      if (a != null) ctx.globalAlpha = a;
      ctx.fillText(str, x, y);
      if (a != null) ctx.globalAlpha = 1;
    }
    function tw(str, f) { var k = f + '|' + str; if (meas[k] == null) { ctx.font = f; meas[k] = ctx.measureText(str).width; } return meas[k]; }
    function rr(x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
    }
    function sheetCard(x, y, w, h, a) {
      ctx.globalAlpha = a * 0.5; ctx.fillStyle = 'rgba(27,42,44,.07)'; rr(x - 1, y + 3, w + 2, h + 3, 9); ctx.fill();
      ctx.globalAlpha = a; ctx.fillStyle = C.sheet; rr(x, y, w, h, 7); ctx.fill();
      ctx.strokeStyle = C.hair2; ctx.lineWidth = 1; ctx.stroke();
    }

    // ----- world props -----
    function drawBars(x0, k) {
      if (k <= 0) return;
      var i, top = -236;
      ctx.globalAlpha = k;
      ctx.strokeStyle = C.wood; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath();
      for (i = 0; i < 12; i++) {
        var rk = seg(k, i * 0.05, i * 0.05 + 0.4); if (rk <= 0) continue;
        var y = -22 - i * 17.6;
        ctx.moveTo(x0 + 2, y); ctx.lineTo(x0 + 2 + 154 * rk, y);
      }
      ctx.stroke();
      ctx.fillStyle = C.wood; ctx.strokeStyle = C.woodD; ctx.lineWidth = px(1);
      for (i = 0; i < 3; i++) {
        var hgt = -top * outCubic(seg(k, i * 0.12, 0.6 + i * 0.12));
        ctx.beginPath(); ctx.rect(x0 + i * 78 - 2.8, -hgt, 5.6, hgt); ctx.fill(); ctx.stroke();
      }
      ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
    }
    function shadow(x, w, a) {
      ctx.fillStyle = 'rgba(27,42,44,' + (a == null ? 0.1 : a) + ')';
      ctx.beginPath(); ctx.ellipse(x, 1.6, w, 2.4, 0, 0, TAU); ctx.fill();
    }
    function drawMatBall(k) {
      if (k <= 0) return;
      ctx.globalAlpha = k;
      ctx.fillStyle = C.mat; rrW(-284, -4.2, 158 * outCubic(k), 4.2, 2); ctx.fill();
      var bx = -92, r = 27, drop = (1 - outBack(seg(k, 0.3, 1), 1.2)) * -40;
      shadow(bx, 20 * k, 0.09);
      ctx.beginPath(); ctx.arc(bx, -r + drop, r, 0, TAU);
      ctx.fillStyle = 'rgba(194,50,31,.13)'; ctx.fill();
      ctx.strokeStyle = 'rgba(194,50,31,.78)'; ctx.lineWidth = px(1.25); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx, -r + drop, r - 6, -2.5, -1.5); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = px(1.5); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    function rrW(x, y, w, h, r) { // rounded rect in world units
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
    }
    function drawCushion(k, press) {
      if (k <= 0) return;
      var x = XB + 6, hgt = (CUSH + 1.5) * Math.min(1.15, outBack(k, 1.6)) - press * 1.2;
      ctx.globalAlpha = Math.min(1, k * 1.5);
      shadow(x, 27, 0.08);
      ctx.beginPath(); ctx.moveTo(x - 25, 0); ctx.bezierCurveTo(x - 24, -hgt * 1.25, x + 24, -hgt * 1.25, x + 25, 0); ctx.closePath();
      ctx.fillStyle = C.mat; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = px(1);
      ctx.beginPath(); ctx.moveTo(x - 17, -hgt * 0.55); ctx.quadraticCurveTo(x, -hgt * 0.95, x + 17, -hgt * 0.55); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    function drawCouch(k) {
      if (k <= 0) return;
      var x0 = S.couchX0, x1 = S.couchX1, dy = (1 - outCubic(k)) * 16;
      ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.4); ctx.translate(0, dy);
      shadow((x0 + x1) / 2, (x1 - x0) / 2 - 4, 0.06);
      ctx.strokeStyle = C.frame; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0 + 14, -43); ctx.lineTo(x0 + 10, -1.5); ctx.moveTo(x1 - 14, -43); ctx.lineTo(x1 - 10, -1.5);
      ctx.moveTo(x0 + 12, -18); ctx.lineTo(x1 - 12, -18);
      ctx.stroke();
      ctx.fillStyle = '#DDE5E3'; rrW(x0 + 3, -45, x1 - x0 - 6, 3.4, 1.5); ctx.fill();
      ctx.fillStyle = C.mat; rrW(x0, -52, x1 - x0, 8, 3.2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = px(1);
      ctx.beginPath(); ctx.moveTo(x0 + 6, -49.6); ctx.lineTo(x1 - 6, -49.6); ctx.stroke();
      ctx.lineCap = 'butt'; ctx.restore();
    }
    function drawDevice(k, sk, T, fw) {
      if (k <= 0) return;
      var x = S.couchX1 - 98, y = -52, w = 46, h = 30;
      ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - outCubic(k)) * 8);
      // cable to the pad on the back of the shoulder
      var pxd = sk.sx - 10.5, pyd = sk.sy + 7;
      ctx.strokeStyle = C.soft; ctx.lineWidth = px(1.2);
      ctx.beginPath(); ctx.moveTo(x + w - 6, y - h + 6); ctx.bezierCurveTo(x + w + 26, y - h - 34, pxd - 30, pyd + 34, pxd - 3, pyd + 1); ctx.stroke();
      ctx.fillStyle = C.sheet; ctx.strokeStyle = C.soft; ctx.lineWidth = px(1.2);
      rrW(x, y - h, w, h, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.fig; rrW(x + 5, y - h + 5, 23, 13, 1.5); ctx.fill();
      ctx.strokeStyle = '#7FD0E0'; ctx.lineWidth = px(1.2); ctx.beginPath();
      for (var i = 0; i <= 19; i++) { var yy = y - h + 11.5 + sin(i * 0.9 - T * 5) * 3.4 * (0.45 + 0.55 * sin(i * 0.3)); if (i) ctx.lineTo(x + 7 + i, yy); else ctx.moveTo(x + 7 + i, yy); }
      ctx.stroke();
      ctx.fillStyle = C.soft; ctx.beginPath(); dot(ctx, x + 34.5, y - h + 9, 2.2); dot(ctx, x + 40.5, y - h + 9, 2.2); ctx.fill();
      ctx.fillStyle = C.hair2; ctx.fillRect(x + 5, y - 7.5, 36, 1.2);
      // applicator: flat pad for current + magnetic field, a second electrode for the modulated current,
      // a hand-held head for ultrasound
      fw = fw || [1, 0, 0];
      if (fw[0] > 0.01) {
        ctx.save(); ctx.globalAlpha = k * fw[0];
        ctx.strokeStyle = C.soft; ctx.lineWidth = px(1.2);
        ctx.beginPath(); ctx.moveTo(x + w - 6, y - h + 11); ctx.bezierCurveTo(x + w + 30, y - h - 14, pxd - 30, pyd + 46, pxd - 2.4, pyd + 18); ctx.stroke();
        ctx.translate(pxd + 0.8, pyd + 17); ctx.rotate(0.08);
        ctx.fillStyle = C.sheet; ctx.strokeStyle = C.ink; ctx.lineWidth = px(1.1); rrW(-3.2, -5.5, 5.2, 11, 1.6); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      if (fw[2] < 0.99) {
        ctx.save(); ctx.globalAlpha = k * (1 - fw[2]); ctx.translate(pxd, pyd); ctx.rotate(0.12);
        ctx.fillStyle = C.sheet; ctx.strokeStyle = C.ink; ctx.lineWidth = px(1.1); rrW(-3.2, -6, 5.2, 12, 1.6); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      if (fw[2] > 0.01) {
        ctx.save(); ctx.globalAlpha = k * fw[2]; ctx.translate(pxd - 0.6, pyd + 1); ctx.rotate(0.42);
        ctx.fillStyle = C.sheet; ctx.strokeStyle = C.ink; ctx.lineWidth = px(1.1);
        rrW(-15, -2.3, 12.5, 4.6, 2.2); ctx.fill(); ctx.stroke();
        rrW(-3.6, -5, 5, 10, 2); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
    // the physical factor reaching the shoulder (drawn over the figure)
    function drawWaves(k, sk, T, fw) {
      if (k <= 0) return;
      var pxd = sk.sx - 10.5, pyd = sk.sy + 7, cx0 = sk.sx - 3, cy0 = sk.sy + 6, j, a;
      ctx.save();
      ctx.strokeStyle = '#6CC3D6'; ctx.lineCap = 'round';
      if (fw[0] > 0) for (j = 0; j < 3; j++) {
        a = ((T * 0.9 + j / 3) % 1); ctx.globalAlpha = k * fw[0] * (1 - a) * 0.85; ctx.lineWidth = px(1.5);
        ctx.setLineDash([px(3), px(3.5)]); ctx.beginPath(); ctx.arc(cx0, cy0, 6 + a * 18, 0, TAU); ctx.stroke();
      }
      ctx.setLineDash([]);
      if (fw[1] > 0) for (j = 0; j < 3; j++) {
        a = 0.6 + 0.4 * sin(T * 3 - j * 0.9); ctx.globalAlpha = k * fw[1] * a * 0.8; ctx.lineWidth = px(1.4);
        ctx.beginPath(); ctx.ellipse(cx0 + 3, cy0, 9 + j * 6.5, 4.5 + j * 3.6, -0.5, 0, TAU); ctx.stroke();
      }
      if (fw[2] > 0) for (j = 0; j < 4; j++) {
        a = ((T * 1.1 + j / 4) % 1); ctx.globalAlpha = k * fw[2] * (1 - a) * 0.9; ctx.lineWidth = px(1.5);
        ctx.beginPath(); ctx.arc(pxd, pyd, 5 + a * 24, -0.75, 0.75); ctx.stroke();
      }
      ctx.lineCap = 'butt'; ctx.globalAlpha = 1; ctx.restore();
    }
    function drawCup(x, y, tilt, a) {
      ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(tilt);
      ctx.fillStyle = C.sheet; ctx.strokeStyle = C.ink; ctx.lineWidth = px(1.2); ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.arc(-5.6, -5.6, 3.3, PI * 0.5, PI * 1.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-5, -11); ctx.lineTo(5, -11); ctx.lineTo(4.2, -0.8); ctx.quadraticCurveTo(4, 0, 3.2, 0); ctx.lineTo(-3.2, 0); ctx.quadraticCurveTo(-4, 0, -4.2, -0.8); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    function drawTable(k, off, st, p) {
      if (k <= 0) return;
      var x0 = S.tableX0 + off, x1 = S.tableX1 + off;
      ctx.save(); ctx.globalAlpha = k;
      shadow((x0 + x1) / 2 + 22, 44, 0.06);
      ctx.strokeStyle = C.frame; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1 - 13, TABLE_Y + 4); ctx.lineTo(x1 - 13, -7); ctx.moveTo(x0 + 38, -7); ctx.lineTo(x1 - 4, -7); ctx.stroke();
      ctx.fillStyle = C.sheet; ctx.strokeStyle = C.soft; ctx.lineWidth = px(1.2);
      ctx.beginPath(); dot(ctx, x0 + 41, -3.4, 3.2); dot(ctx, x1 - 8, -3.4, 3.2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.wood; rrW(x0, TABLE_Y, x1 - x0, 4.2, 1.8); ctx.fill();
      ctx.strokeStyle = C.woodD; ctx.lineWidth = px(1); ctx.stroke();
      ctx.lineCap = 'butt';
      // things on the table
      var plate = smooth(seg(p, 0.770, 0.792)), paper = smooth(seg(p, 0.806, 0.824));
      if (plate > 0) {
        ctx.globalAlpha = k * plate; ctx.fillStyle = C.sheet; ctx.strokeStyle = C.ink; ctx.lineWidth = px(1.1);
        ctx.beginPath(); ctx.moveTo(x0 + 80, TABLE_Y - 2.6); ctx.quadraticCurveTo(x0 + 94, TABLE_Y + 1.2, x0 + 108, TABLE_Y - 2.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      if (paper > 0) {
        ctx.globalAlpha = k * paper; ctx.fillStyle = C.sheet; ctx.strokeStyle = C.soft; ctx.lineWidth = px(1);
        ctx.beginPath(); ctx.rect(x0 + 18, TABLE_Y - 1.1, 38 * paper, 1.1); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
      if (st && !st.grip && st.cupA > 0) drawCup(st.cupX + off, TABLE_Y, 0, k * st.cupA);
    }

    // ----- measurement graphics (world) -----
    // range-of-motion arc: centre, radius, start angle a0 → a1 (angles in the figure convention: 0 = down, + forward)
    function romArc(cx0, cy0, r, a0, a1, full, a) {
      var th0 = PI / 2 - a0, th1 = PI / 2 - a1, ccw = a1 > a0, i;
      ctx.globalAlpha = a;
      ctx.strokeStyle = C.hair2; ctx.lineWidth = px(1);
      ctx.beginPath(); ctx.arc(cx0, cy0, r, PI / 2 - a0, PI / 2 - full, full > a0); ctx.stroke();
      ctx.setLineDash([px(3), px(3)]);
      ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.lineTo(cx0 + (r + 6) * sin(a0), cy0 + (r + 6) * cos(a0)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = C.red; ctx.lineWidth = px(1.6);
      ctx.beginPath(); ctx.arc(cx0, cy0, r, th0, th1, ccw); ctx.stroke();
      ctx.lineWidth = px(1.1); ctx.beginPath();
      var n = Math.floor(Math.abs(a1 - a0) / (10 * DEG) + 1e-6), sg = a1 > a0 ? 1 : -1;
      for (i = 0; i <= n; i++) {
        var an = a0 + sg * i * 10 * DEG, len = (i % 3 === 0) ? 5.5 : 2.8;
        ctx.moveTo(cx0 + r * sin(an), cy0 + r * cos(an)); ctx.lineTo(cx0 + (r + len) * sin(an), cy0 + (r + len) * cos(an));
      }
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.lineTo(cx0 + r * sin(a1), cy0 + r * cos(a1)); ctx.globalAlpha = a * 0.55; ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ----- figure -----
    function drawFigure(k) {
      var halo = Math.max(1.0, px(1.7));
      ctx.fillStyle = C.far; ctx.beginPath(); addParts(ctx, k, P_FARM | P_FLEG); ctx.fill();
      ctx.lineJoin = 'round'; ctx.strokeStyle = C.paper; ctx.lineWidth = halo; ctx.fillStyle = C.fig;
      ctx.beginPath(); addParts(ctx, k, P_NLEG); ctx.stroke(); ctx.fill();
      ctx.beginPath(); addParts(ctx, k, P_BODY); ctx.fill();
      ctx.beginPath(); addParts(ctx, k, P_NARM); ctx.stroke(); ctx.fill();
      ctx.strokeStyle = 'rgba(238,242,240,.42)'; ctx.lineWidth = px(1); ctx.beginPath();
      ctx.moveTo(k.na[2], k.na[3]); ctx.lineTo(k.na[0], k.na[1]); ctx.lineTo(k.sx, k.sy); ctx.lineTo(k.px, k.py); ctx.lineTo(k.nl[0], k.nl[1]); ctx.lineTo(k.nl[2], k.nl[3]);
      ctx.stroke();
      ctx.fillStyle = C.paper; ctx.beginPath();
      dot(ctx, k.sx, k.sy, 1.9); dot(ctx, k.na[0], k.na[1], 1.7); dot(ctx, k.na[2], k.na[3], 1.5);
      dot(ctx, k.px, k.py, 1.9); dot(ctx, k.nl[0], k.nl[1], 1.8); dot(ctx, k.nl[2], k.nl[3], 1.6);
      ctx.fill();
    }
    function ghost(path, a) { if (a <= 0.004) return; ctx.globalAlpha = a; ctx.fillStyle = C.slate; ctx.fill(path); ctx.globalAlpha = 1; }

    // ----- screen-space cards -----
    function assessCard(p) {
      var a = smooth(seg(p, 0.118, 0.15)) * (1 - smooth(seg(p, 0.252, 0.282)));
      if (a <= 0) return;
      var fT = font(600, F.title, BODY), fR = font(400, F.card, MONO), i, mw = tw(TXT.cardTitle, fT);
      for (i = 0; i < 5; i++) mw = Math.max(mw, tw(TXT.cardItems[i], fR) + F.row * 0.5 + 9);
      var pad = narrow ? 11 : 16, w = mw + pad * 2, h = pad * 2 + F.title + 8 + 5 * F.row - 4;
      var x = W - IN.r - w - (narrow ? 0 : 10), y = IN.t + ah * (narrow ? 0.30 : 0.36) - h / 2 + (1 - outCubic(seg(p, 0.118, 0.16))) * 16;
      sheetCard(x, y, w, h, a);
      text(TXT.cardTitle, x + pad, y + pad + F.title * 0.82, fT, C.ink, 'left', a);
      ctx.globalAlpha = a; ctx.fillStyle = C.red; ctx.fillRect(x + pad, y + pad + F.title + 5, 18, 1.5); ctx.globalAlpha = 1;
      var bs = Math.round(F.row * 0.46);
      for (i = 0; i < 5; i++) {
        var ry = y + pad + F.title + 14 + i * F.row, t0 = 0.142 + i * 0.024, on = seg(p, t0, t0 + 0.014);
        ctx.globalAlpha = a; ctx.strokeStyle = on > 0 ? C.slate : C.hair2; ctx.lineWidth = 1.2;
        rr(x + pad, ry, bs, bs, 2.5); ctx.stroke();
        if (on > 0) {
          ctx.strokeStyle = C.mat; ctx.lineWidth = 1.9; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
          var x0 = x + pad + bs * 0.2, y0 = ry + bs * 0.52, x1 = x + pad + bs * 0.42, y1 = ry + bs * 0.76, x2 = x + pad + bs * 0.86, y2 = ry + bs * 0.2, t1 = seg(on, 0, 0.4), t2 = seg(on, 0.4, 1);
          ctx.moveTo(x0, y0); ctx.lineTo(lerp(x0, x1, t1), lerp(y0, y1, t1)); if (t2 > 0) ctx.lineTo(lerp(x1, x2, t2), lerp(y1, y2, t2));
          ctx.stroke(); ctx.lineCap = 'butt';
        }
        text(TXT.cardItems[i], x + pad + bs + 9, ry + bs * 0.5 + F.card * 0.36, fR, C.ink, 'left', a * lerp(0.5, 1, on));
      }
      ctx.globalAlpha = 1;
    }
    function physPanel(p, T, fw) {
      var a = smooth(seg(p, 0.468, 0.495)) * (1 - smooth(seg(p, 0.566, 0.59)));
      if (a <= 0) return;
      var fR = font(400, F.card, MONO), i, mw = 0;
      for (i = 0; i < 3; i++) mw = Math.max(mw, tw(TXT.phys[i], fR));
      var pad = narrow ? 10 : 14, sc = narrow ? 40 : 62, w = mw + pad * 2 + 14, rowH = F.row - 1, h = pad + sc + 8 + rowH * 3 + pad - 4;
      var x = narrow ? W - IN.r - w : W - IN.r - w - 10, y = (narrow ? IN.t + 2 : IN.t + ah * 0.13) + (1 - outCubic(seg(p, 0.468, 0.505))) * 14;
      sheetCard(x, y, w, h, a);
      // scope
      var sx = x + pad, sy = y + pad, sw = w - pad * 2, j, k2;
      ctx.save(); rr(sx, sy, sw, sc, 4); ctx.fillStyle = '#EDF2F1'; ctx.globalAlpha = a; ctx.fill(); ctx.clip();
      ctx.strokeStyle = C.hair; ctx.lineWidth = 1; ctx.beginPath();
      for (j = 1; j < 8; j++) { ctx.moveTo(sx + sw * j / 8, sy); ctx.lineTo(sx + sw * j / 8, sy + sc); }
      ctx.moveTo(sx, sy + sc / 2); ctx.lineTo(sx + sw, sy + sc / 2); ctx.stroke();
      ctx.strokeStyle = C.mat; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      var my = sy + sc / 2;
      if (fw[0] > 0) {
        ctx.globalAlpha = a * fw[0]; ctx.lineWidth = 1.6; ctx.beginPath();
        for (j = 0; j <= sw; j += 1.5) { var v = sin(j * 0.5 - T * 7) * (0.5 - 0.5 * cos(j * TAU / (sw / 3) - T * 1.6)) * sc * 0.4; if (j) ctx.lineTo(sx + j, my + v); else ctx.moveTo(sx + j, my + v); }
        ctx.stroke();
      }
      if (fw[1] > 0) {
        ctx.lineWidth = 1.5;
        for (j = 0; j < 5; j++) { k2 = 0.55 + 0.45 * sin(T * 3.2 - j * 0.8); ctx.globalAlpha = a * fw[1] * k2; ctx.beginPath(); ctx.ellipse(sx + sw / 2, my, 14 + j * sw * 0.085, 4 + j * sc * 0.1, 0, 0, TAU); ctx.stroke(); }
        ctx.globalAlpha = a * fw[1]; ctx.fillStyle = C.slate; ctx.fillRect(sx + sw / 2 - 9, my - 2.5, 18, 5);
      }
      if (fw[2] > 0) {
        ctx.lineWidth = 1.6; ctx.fillStyle = C.slate; ctx.globalAlpha = a * fw[2]; ctx.fillRect(sx + 8, my - 8, 5, 16);
        for (j = 0; j < 7; j++) { k2 = ((T * 0.55 + j / 7) % 1); ctx.globalAlpha = a * fw[2] * (1 - k2) * 0.95; ctx.beginPath(); ctx.arc(sx + 13, my, 6 + k2 * sw * 0.86, -0.42, 0.42); ctx.stroke(); }
      }
      ctx.restore(); ctx.lineCap = 'butt';
      var act = p < 0.506 ? 0 : p < 0.544 ? 1 : 2;
      for (i = 0; i < 3; i++) {
        var ry = sy + sc + 8 + i * rowH, on = i === act;
        ctx.globalAlpha = a * (on ? 1 : 0.35); ctx.fillStyle = on ? C.mat : C.soft; ctx.beginPath(); ctx.arc(sx + 3.5, ry + rowH / 2 - 1, on ? 3.5 : 2.5, 0, TAU); ctx.fill();
        text(TXT.phys[i], sx + 14, ry + rowH / 2 + F.card * 0.34 - 1, fR, on ? C.ink : C.soft, 'left', a * (on ? 1 : 0.62));
      }
      ctx.globalAlpha = 1;
    }
    function finalCard(p) {
      var e = seg(p, 0.872, 0.914), a = smooth(e);
      if (a <= 0) return;
      var fL = font(500, F.labB, MONO), fP = font(600, F.phone, DISP), fB = font(400, F.body, BODY);
      var pad = narrow ? 14 : 20, th = narrow ? 58 : 84, twd = th * 0.6629, gap = narrow ? 13 : 20;
      var mw = Math.max(tw(TXT.fPhone, fP), tw(TXT.fAddr, fB), tw(TXT.fHours, fB));
      var w = pad * 2 + twd + gap + mw + 4, ch = F.labB + 8 + F.phone + (narrow ? 5 : 9) + F.body * 2.5, h = pad * 2 + Math.max(th, ch);
      var x = narrow ? IN.l + (aw - w) / 2 : IN.l + aw * 0.5 - w / 2 - aw * 0.06, y = (narrow ? IN.t + 8 : IN.t + 58) + (1 - outBack(e, 1.1)) * 22;
      sheetCard(x, y, w, h, a);
      ctx.globalAlpha = a;
      if (TREE) { ctx.save(); ctx.translate(x + pad, y + (h - th) / 2); ctx.scale(th / 100, th / 100); ctx.fillStyle = C.slate; ctx.fill(TREE, 'evenodd'); ctx.restore(); }
      var tx = x + pad + twd + gap, ty = y + pad;
      ctx.strokeStyle = C.hair2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tx - gap / 2, y + pad); ctx.lineTo(tx - gap / 2, y + h - pad); ctx.stroke();
      text(TXT.fTitle, tx, ty + F.labB * 0.8, fL, C.soft, 'left', a);
      text(TXT.fPhone, tx, ty + F.labB + 8 + F.phone * 0.78, fP, C.red, 'left', a);
      var by = ty + F.labB + 8 + F.phone + (narrow ? 5 : 9);
      text(TXT.fHours, tx, by + F.body * 0.8, font(500, F.body, DISP), C.ink, 'left', a);
      text(TXT.fAddr, tx, by + F.body * 0.8 + F.body * 1.42, fB, C.ink, 'left', a);
      ctx.globalAlpha = 1;
    }

    // ----- frame -----
    function draw() {
      var p = cur, live = !reduce, introK, roomK, i, a, u;
      introK = introT >= 1.9 ? 1 : inOut(seg(introT, 0.25, 1.85)); roomK = introT >= 1.4 ? 1 : seg(introT, 0, 1.4);
      camAt(p);
      // slow ambient drift of the camera in the hero
      s = Math.min(aw / cam[2], ah / cam[3]); ox = IN.l + aw / 2; oy = IN.t + ah / 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      world();
      var vx0 = cam[0] - ox / s, vx1 = cam[0] + (W - ox) / s;

      var q = poseAt(p, T, introK, live), k = skel(q), st = q.st || null;

      // floor + centimetre scale
      var fk = outCubic(roomK), fx0 = lerp(0, vx0, fk), fx1 = lerp(0, vx1, fk);
      ctx.strokeStyle = C.hair2; ctx.lineWidth = px(1); ctx.beginPath();
      for (var v = Math.ceil(fx0 / 10) * 10; v <= fx1; v += 10) { ctx.moveTo(v, 0); ctx.lineTo(v, (v % 50 === 0) ? 5 : 2.4); }
      ctx.stroke();
      ctx.strokeStyle = C.soft; ctx.lineWidth = px(1.3); ctx.beginPath(); ctx.moveTo(fx0, 0); ctx.lineTo(fx1, 0); ctx.stroke();

      // room
      if (vx0 < -120) { drawBars(-290, roomK); drawMatBall(seg(roomK, 0.25, 1)); }
      if (vx1 > S.bars2 - 10) drawBars(S.bars2, 1);
      var cushK = seg(p, 0.292, 0.33) * (1 - seg(p, 0.43, 0.45));
      drawCouch(seg(p, 0.436, 0.476));

      // ghosts
      var gf;
      if (p < 0.14 && q.raise > 0.02) for (i = 0; i < S.gArm.length; i++) ghost(S.gArm[i].path, 0.24 * seg(q.raise, S.gArm[i].a + 0.05, S.gArm[i].a + 0.22) * (1 - seg(p, 0.085, 0.118)));
      if (q.kf > 0) { ctx.save(); ctx.translate(0, q.y - STAND_Y); for (i = 0; i < S.gKnee.length; i++) ghost(S.gKnee[i].path, 0.24 * seg(q.kf * PI / 2, S.gKnee[i].a + 0.05, S.gKnee[i].a + 0.2)); ctx.restore(); }
      if (p > 0.272 && p < 0.48) {
        u = seg(p, 0.272, 0.365); gf = 1 - smooth(seg(p, 0.408, 0.44));
        for (i = 0; i < S.g1.length; i++) { a = seg(u, S.g1[i].u + 0.035, S.g1[i].u + 0.085); if (a > 0) ghost(S.g1[i].path, a * gf * lerp(0.11, 0.26, seg(S.g1[i].u, u - 0.75, u))); }
      }
      if (p > 0.915) {
        u = seg(p, 0.915, 1);
        for (i = 0; i < S.g2.length; i++) { a = seg(u, S.g2[i].u + 0.035, S.g2[i].u + 0.085); if (a > 0) ghost(S.g2[i].path, a * lerp(0.10, 0.24, seg(S.g2[i].u, u - 0.8, u))); }
      }
      // ergo ghost arms + hand path
      if (p > 0.6 && p < 0.745) {
        if (!S.gErgo) S.gErgo = [0.626, 0.655].map(function (pp) { return { p: pp, path: ghostPath(sitPose(1, pp, 0), P_NARM) }; });
        gf = 1 - smooth(seg(p, 0.705, 0.74));
        for (i = 0; i < S.gErgo.length; i++) ghost(S.gErgo[i].path, 0.2 * gf * seg(p, S.gErgo[i].p + 0.006, S.gErgo[i].p + 0.02));
      }

      // step marks
      if (p > 0.272 && p < 0.47) {
        u = seg(p, 0.272, 0.365); gf = 1 - smooth(seg(p, 0.412, 0.442));
        var prevX = null, lastPair = null;
        for (i = 0; i < S.W1.strikes.length; i++) {
          var sk0 = S.W1.strikes[i]; a = seg(u, sk0.u, sk0.u + 0.03) * gf; if (a <= 0) break;
          ctx.globalAlpha = a * (sk0.near ? 0.9 : 0.5); ctx.fillStyle = C.fig; rrW(sk0.x, 7.5, 21, 3, 1.5); ctx.fill();
          ctx.globalAlpha = a; ctx.strokeStyle = C.red; ctx.lineWidth = px(1.2); ctx.beginPath(); ctx.moveTo(sk0.x, 13.5); ctx.lineTo(sk0.x, 21); ctx.stroke();
          if (prevX != null) { ctx.beginPath(); ctx.moveTo(prevX, 17.2); ctx.lineTo(sk0.x, 17.2); ctx.stroke(); if (i === 2) lastPair = [prevX, sk0.x, a]; }
          prevX = sk0.x;
        }
        ctx.globalAlpha = 1;
        var stepPair = lastPair;
      }

      // cushion (under the foot)
      drawCushion(cushK, q.bal || 0);

      // contact shadow
      shadow(q.x + (st ? 18 * (1 - seg(Math.abs(q.y - STAND_Y), 0, 20)) + 20 : 2), 26, 0.1);

      // physical-therapy device (behind the figure)
      var fw = [1 - seg(p, 0.5, 0.512), seg(p, 0.5, 0.512) * (1 - seg(p, 0.538, 0.55)), seg(p, 0.538, 0.55)];
      var devK = seg(p, 0.462, 0.488) * (1 - seg(p, 0.564, 0.588));
      drawDevice(devK, k, live ? T : 0.4, fw);

      // table (rolls in from the right, behind the arm)
      var tin = seg(p, 0.572, 0.612), tout = seg(p, 0.866, 0.905);
      var tOff = (1 - outCubic(tin)) * 230 + inCubic(tout) * 300, tK = Math.min(1, tin * 2.2) * (1 - seg(tout, 0.55, 1));
      drawTable(tK, tOff, st, p);

      // figure
      drawFigure(k);
      drawWaves(devK * seg(p, 0.476, 0.492), k, live ? T : 0.4, fw);
      if (st && st.grip) drawCup(st.cupX, st.cupY, st.cupTilt, 1);
      if (st && st.brush > 0.3) {
        ctx.globalAlpha = seg(st.brush, 0.3, 0.7); ctx.strokeStyle = C.woodD; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
        var hx = k.na[4], hy = k.na[5];
        ctx.beginPath(); ctx.moveTo(hx - 5, hy - 9); ctx.lineTo(hx + 2.5, hy + 4.5); ctx.stroke();
        ctx.strokeStyle = C.mat; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx + 2.5, hy + 4.5); ctx.lineTo(hx + 4, hy + 7.2); ctx.stroke();
        ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
      }

      // ---- measurement overlays (world) ----
      // hero: shoulder range of motion
      var heroA = (1 - smooth(seg(p, 0.088, 0.122))) * seg(introT, 0.2, 0.7);
      if (heroA > 0 && p < 0.13) romArc(k.sx, k.sy, 76, 0, Math.max(0.001, q.raise), PI, heroA);
      // plumb line
      var plK = seg(p, 0.112, 0.158), plA = smooth(seg(p, 0.108, 0.125)) * (1 - smooth(seg(p, 0.246, 0.272)));
      if (plA > 0) {
        var plx = 2.5, ytop = -182, ybot = lerp(ytop, -3, outCubic(plK));
        ctx.globalAlpha = plA; ctx.strokeStyle = C.red; ctx.lineWidth = px(1.2);
        ctx.setLineDash([px(5), px(3.5)]); ctx.beginPath(); ctx.moveTo(plx, ytop); ctx.lineTo(plx, ybot); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = C.red; ctx.beginPath(); ctx.moveTo(plx - 2.6, ybot - 5.5); ctx.lineTo(plx + 2.6, ybot - 5.5); ctx.lineTo(plx, ybot); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(plx, ytop, 1.8, 0, TAU); ctx.fill();
        var marks = [k.hy + 1, k.sy, k.py, k.fl[1], k.fl[3]];
        ctx.beginPath();
        for (i = 0; i < marks.length; i++) if (marks[i] < ybot - 4) { ctx.moveTo(plx - 5, marks[i]); ctx.lineTo(plx + 5, marks[i]); }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
      // knee goniometer
      var knA = smooth(seg(p, 0.156, 0.172)) * (1 - smooth(seg(p, 0.244, 0.27)));
      if (knA > 0) romArc(k.nl[0], k.nl[1], 31, q.nh, q.nh - Math.max(0.001, q.nk - 0.03), q.nh - PI * 0.62, knA);
      // sway trace above the head
      var swK = seg(p, 0.384, 0.432), swA = smooth(seg(p, 0.378, 0.392)) * (1 - smooth(seg(p, 0.43, 0.452)));
      var swx = XB + 3, swy = -196;
      if (swA > 0) {
        ctx.globalAlpha = swA; ctx.strokeStyle = C.hair2; ctx.lineWidth = px(1);
        ctx.beginPath(); ctx.arc(swx, swy, 13, 0, TAU); ctx.moveTo(swx - 17, swy); ctx.lineTo(swx + 17, swy); ctx.moveTo(swx, swy - 17); ctx.lineTo(swx, swy + 17); ctx.stroke();
        ctx.beginPath(); ctx.arc(swx, swy, 6.5, 0, TAU); ctx.stroke();
        ctx.strokeStyle = C.red; ctx.lineWidth = px(1.3); ctx.lineJoin = 'round'; ctx.beginPath();
        var n = Math.round(160 * swK);
        for (i = 0; i <= n; i++) { var tt = i / 160, dmp = 1 - 0.55 * tt; var sxx = swx + (sin(tt * 21) * 7.5 + sin(tt * 47 + 1) * 2.6) * dmp, syy = swy + (cos(tt * 16 + 0.6) * 5 + sin(tt * 39) * 2.2) * dmp; if (i) ctx.lineTo(sxx, syy); else ctx.moveTo(sxx, syy); }
        ctx.stroke();
        ctx.setLineDash([px(2), px(3)]); ctx.strokeStyle = C.hair2; ctx.lineWidth = px(1); ctx.beginPath(); ctx.moveTo(swx, swy + 18); ctx.lineTo(k.hx, k.hy - 12); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      // ergo hand path
      var erA = st ? smooth(seg(p, 0.606, 0.615)) * (1 - smooth(seg(p, 0.708, 0.74))) : 0;
      if (erA > 0) {
        if (!S.ergoPath) { S.ergoPath = []; for (var pp = 0.607; pp <= 0.6685; pp += 0.001) { var qs = sitPose(1, pp, 0).st; S.ergoPath.push([qs.wx + 2, qs.wy - 7]); } }
        var en = Math.min(S.ergoPath.length - 1, Math.floor((p - 0.607) / 0.001));
        ctx.strokeStyle = C.red; ctx.lineWidth = px(1.4); ctx.globalAlpha = erA; ctx.setLineDash([px(2.5), px(4)]); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); for (i = 0; i <= en; i++) { if (i) ctx.lineTo(S.ergoPath[i][0], S.ergoPath[i][1]); else ctx.moveTo(S.ergoPath[i][0], S.ergoPath[i][1]); } ctx.stroke();
        ctx.setLineDash([]); ctx.lineCap = 'butt';
        if (en > 2) { ctx.fillStyle = C.red; ctx.beginPath(); dot(ctx, S.ergoPath[en][0], S.ergoPath[en][1], px(2.4)); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      // speech: sound arcs
      var spA = st ? smooth(seg(p, 0.724, 0.74)) * (1 - smooth(seg(p, 0.86, 0.878))) : 0, spAct = st ? 1 - 0.7 * smooth(seg(p, 0.79, 0.82)) : 0;
      if (spA > 0) {
        ctx.strokeStyle = C.mat; ctx.lineCap = 'round';
        for (i = 0; i < 3; i++) {
          a = live ? (0.45 + 0.55 * sin(T * 4.2 - i * 1.1)) : 0.8; ctx.globalAlpha = spA * spAct * a * seg(p, 0.724 + i * 0.006, 0.74 + i * 0.006); ctx.lineWidth = px(1.6);
          ctx.beginPath(); ctx.arc(st.mx - 2, st.my, 7 + i * 5.5, -0.95, 0.25); ctx.stroke();
        }
        ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
      }
      // nutrition inset (plan view of the plate)
      var plC = narrow ? [XB + 150, -138, 23] : [XB + 140, -140, 21], plA2 = st ? smooth(seg(p, 0.772, 0.792)) * (1 - smooth(seg(p, 0.858, 0.876))) : 0;
      if (plA2 > 0) {
        var pk = seg(p, 0.778, 0.822), cols = ['rgba(46,140,163,.62)', 'rgba(201,160,106,.80)', 'rgba(73,94,96,.42)', 'rgba(73,94,96,.16)'], fr = [0.36, 0.28, 0.22, 0.14], acc = 0;
        ctx.globalAlpha = plA2; ctx.setLineDash([px(2), px(3)]); ctx.strokeStyle = C.hair2; ctx.lineWidth = px(1);
        if (!narrow) { ctx.beginPath(); ctx.moveTo(S.tableX0 + 96, TABLE_Y - 4.5); ctx.lineTo(plC[0] - plC[2] * 0.62, plC[1] + plC[2] * 0.86); ctx.stroke(); } ctx.setLineDash([]);
        ctx.fillStyle = C.sheet; ctx.beginPath(); ctx.arc(plC[0], plC[1], plC[2], 0, TAU); ctx.fill(); ctx.strokeStyle = C.soft; ctx.lineWidth = px(1.2); ctx.stroke();
        var rIn = plC[2] - 4.2;
        for (i = 0; i < 4; i++) {
          var kk = outCubic(seg(pk, i * 0.2, i * 0.2 + 0.4)), a0 = -PI / 2 + acc * TAU, a1 = a0 + fr[i] * TAU * kk; acc += fr[i];
          if (kk <= 0) continue;
          ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(plC[0], plC[1]); ctx.arc(plC[0], plC[1], rIn, a0, a1); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = C.sheet; ctx.lineWidth = px(1.6); ctx.stroke();
        }
        ctx.strokeStyle = C.hair2; ctx.lineWidth = px(1); ctx.beginPath(); ctx.arc(plC[0], plC[1], rIn, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // art inset (plan view of the sheet)
      var arC = narrow ? [XB + 64, -128, 50, 36] : [XB + 50, -130, 48, 35], arA = st ? smooth(seg(p, 0.812, 0.83)) * (1 - smooth(seg(p, 0.858, 0.876))) : 0;
      if (arA > 0) {
        var ak = seg(p, 0.82, 0.866), bl = [[-11, -4, 10, 'rgba(46,140,163,'], [5, 5, 9, 'rgba(201,160,106,'], [13, -6, 7.5, 'rgba(73,94,96,']];
        ctx.globalAlpha = arA; ctx.setLineDash([px(2), px(3)]); ctx.strokeStyle = C.hair2; ctx.lineWidth = px(1);
        if (!narrow) { ctx.beginPath(); ctx.moveTo(S.tableX0 + 44, TABLE_Y - 3); ctx.lineTo(arC[0] + 2, arC[1] + arC[3] / 2 + 3); ctx.stroke(); } ctx.setLineDash([]);
        ctx.save(); ctx.translate(arC[0], arC[1]); ctx.rotate(-0.1);
        ctx.fillStyle = C.sheet; ctx.strokeStyle = C.soft; ctx.lineWidth = px(1.2); ctx.beginPath(); ctx.rect(-arC[2] / 2, -arC[3] / 2, arC[2], arC[3]); ctx.fill(); ctx.stroke(); ctx.clip();
        for (i = 0; i < 3; i++) {
          var bk = outCubic(seg(ak, i * 0.26, i * 0.26 + 0.42)); if (bk <= 0) continue;
          var g = ctx.createRadialGradient(bl[i][0], bl[i][1], 0, bl[i][0], bl[i][1], bl[i][2] * (0.5 + bk * 0.7));
          g.addColorStop(0, bl[i][3] + '.62)'); g.addColorStop(0.7, bl[i][3] + '.4)'); g.addColorStop(1, bl[i][3] + '0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(bl[i][0], bl[i][1], bl[i][2] * 1.5 * bk, bl[i][2] * 1.1 * bk, i * 0.7, 0, TAU); ctx.fill();
        }
        ctx.restore(); ctx.globalAlpha = 1;
      }

      // ---- screen-space text ----
      screen();
      var fLab = font(400, F.lab, MONO), fNum = font(600, F.num, DISP), tx, ty;
      if (heroA > 0 && p < 0.13) {
        var ra = Math.max(0, q.raise), deg = Math.round(clamp(q.raise0 / DEG, 0, 180));
        tx = X(k.sx + 98 * sin(Math.max(ra, 0.5))); ty = Y(k.sy + 98 * cos(Math.max(ra, 0.5))) + F.num * 0.2;
        tx = Math.min(tx, W - IN.r - tw(TXT.rom, fLab) - 2);
        text(deg + '°', tx, ty, fNum, C.red, 'left', heroA);
        text(TXT.rom, tx, ty + F.lab + 5, fLab, C.soft, 'left', heroA * seg(introT, 0.5, 1));
      }
      if (plA > 0) text(TXT.posture, X(2.5) + 8, Y(-182) + 4, fLab, C.soft, 'left', plA * seg(p, 0.118, 0.135));
      if (knA > 0) {
        var kd = Math.round(clamp((q.nk - 0.03) / DEG, 0, 180));
        if (narrow) { tx = X(k.nl[0] + 22); ty = Y(k.nl[1] + 4); } else { tx = Math.max(IN.l + 6, X(k.nl[0] - 82)); ty = Y(k.nl[1] - 30); }
        text(kd + '°', tx, ty, fNum, C.red, 'left', knA);
        text(TXT.rom, tx, ty + F.lab + 5, fLab, C.soft, 'left', knA);
      }
      assessCard(p);
      if (p > 0.272 && p < 0.47 && S.W1.strikes.length) {
        gf = 1 - smooth(seg(p, 0.412, 0.442)); u = seg(p, 0.272, 0.365);
        var s0 = S.W1.strikes[0];
        a = seg(u, s0.u, s0.u + 0.05) * gf;
        if (a > 0) text(TXT.gait, X(s0.x) - 8, Y(17.2) + F.lab * 0.36, fLab, C.soft, 'right', a);
        if (stepPair) text(Math.round(stepPair[1] - stepPair[0]) + ' cm', (X(stepPair[0]) + X(stepPair[1])) / 2, Y(21) + F.lab + 3, font(500, F.lab, MONO), C.red, 'center', stepPair[2]);
      }
      if (swA > 0) text(TXT.balance, X(swx + 17) + 7, Y(swy) + F.lab * 0.36, fLab, C.soft, 'left', swA);
      physPanel(p, live ? T : 0.4, fw);
      if (erA > 0) { var qm = sitPose(1, 0.66, 0).st; text(TXT.ergo, X(qm.wx + 12), Y(qm.wy - 16), fLab, C.soft, 'left', erA * seg(p, 0.628, 0.645)); }
      // speech letters + labels
      if (spA > 0) {
        var Lp = narrow ? [[-6, -143], [8, -160], [24, -174], [42, -185], [61, -193], [81, -198]] : [[-8, -142], [6, -159], [22, -174], [40, -186], [59, -195], [79, -201]];
        for (i = 0; i < 6; i++) {
          var lt = seg(p, 0.728 + i * 0.009, 0.752 + i * 0.009); if (lt <= 0) continue;
          var le = outCubic(lt), l1 = 1 - le, lx = l1 * l1 * (st.mx + 6) + 2 * l1 * le * (st.mx + 46) + le * le * (XB + Lp[i][0]), ly = l1 * l1 * st.my + 2 * l1 * le * (st.my - 8) + le * le * Lp[i][1] + (live ? sin(T * 1.6 + i * 1.3) * 1.2 : 0);
          text(TXT.letters[i], X(lx), Y(ly), font(600, Math.round(lerp(F.num * 0.62, F.num * (0.86 + i * 0.07), le)), DISP), i % 2 ? C.slate : C.ink, 'center', spA * lerp(0.35, 1, spAct) * Math.min(1, lt * 3));
        }
        if (!narrow) text(TXT.speech, Math.max(IN.l + 4, X(XB - 14) - tw(TXT.speech, fLab)), Y(-159), fLab, C.soft, 'left', spA * seg(p, 0.745, 0.765));
      }
      if (narrow && st) {
        var caps = [[TXT.speech, 0.742, 0.786], [TXT.food, 0.786, 0.828], [TXT.art, 0.828, 0.872]];
        for (i = 0; i < 3; i++) {
          a = smooth(seg(p, caps[i][1], caps[i][1] + 0.006)) * (1 - smooth(seg(p, caps[i][2] - 0.006, caps[i][2])));
          if (a <= 0) continue;
          ctx.globalAlpha = a; ctx.fillStyle = C.mat; ctx.beginPath(); ctx.arc(IN.l + 8, IN.t + 13, 3, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
          text(caps[i][0], IN.l + 17, IN.t + 13 + F.labB * 0.36, font(400, F.labB, MONO), C.ink, 'left', a);
        }
      }
      if (plA2 > 0) {
        a = plA2 * seg(p, 0.786, 0.802);
        if (!narrow) text(TXT.food, X(plC[0]), Y(plC[1] - plC[2]) - 9, fLab, C.soft, 'center', a);
      }
      if (arA > 0 && !narrow) text(TXT.art, X(arC[0] - arC[2] / 2), Y(arC[1] - arC[3] / 2 - 2) - 7, fLab, C.soft, 'left', arA * seg(p, 0.828, 0.845));
      finalCard(p);
    }

    function frame(now) {
      raf = 0; if (destroyed || paused) return;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;
      if (playing) {
        if (playing.start == null) playing.start = now;
        var e = (now - playing.start) / 1000 / playing.dur;
        target = clamp(playing.from + (1 - playing.from) * inOut(clamp(e, 0, 1)), 0, 1);
        if (e >= 1) finishPlay();
      }
      if (reduce) { cur = target; vel = 0; }
      else {
        var w = 22, f = -w * w * (cur - target) - 2 * w * vel;
        vel += f * dt; cur += vel * dt;
        if (Math.abs(cur - target) < 1e-4 && Math.abs(vel) < 1e-4) { cur = target; vel = 0; }
        T += dt; if (introT < 9) introT += dt;
      }
      draw();
      if (!reduce || playing || cur !== target) start();
    }
    function finishPlay() { if (!playing) return; var pr = playing; playing = null; clearTimeout(pr.timer); target = 1; pr.resolve(); }
    function start() { if (!raf && !paused && !destroyed) raf = requestAnimationFrame(frame); }

    var ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', resize);
    resize();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!destroyed) { meas = {}; draw(); } });
    start();

    return {
      setProgress: function (p) { if (playing) return; target = clamp(+p || 0, 0, 1); if (introT < 2 && target > 0.12) introT = 9; last = 0; start(); },
      // jump without easing and render synchronously (initial frame, tests, ?p=); t = optional ambient clock (intro counts as finished)
      seek: function (p, t) { if (playing) finishPlay(); target = cur = clamp(+p || 0, 0, 1); vel = 0; if (t != null) T = +t; if (t != null || cur > 0.02) introT = 9; draw(); },
      play: function (sec) {
        sec = Math.max(0.1, +sec || 8);
        if (playing) finishPlay();
        return new Promise(function (res) {
          target = cur; playing = { start: null, dur: sec, resolve: res, from: cur };
          playing.timer = setTimeout(finishPlay, sec * 1000 + 600);
          last = 0; start();
        });
      },
      setPaused: function (b) { paused = !!b; if (paused) { if (raf) cancelAnimationFrame(raf); raf = 0; } else { last = 0; start(); } },
      destroy: function () {
        destroyed = true; if (raf) cancelAnimationFrame(raf); raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
        if (playing) finishPlay();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  window.FITStage = { mount: mount, CUTS: [0.10, 0.26, 0.44, 0.58, 0.72, 0.87] };
})();
