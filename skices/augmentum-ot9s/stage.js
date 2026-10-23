/* Augmentum — "Dokumenta ceļš līdz kārtībai" motion stage.
 * Single canvas 2D renderer, no libraries. World units ≈ CSS px at camera scale 1,
 * origin at the desk centre, y grows downward. All figures are illustrative.
 *
 * API: window.AUGStage.mount(el) -> { setProgress(p), play(sec), setPaused(b), destroy(), seek(p, t?) }
 *      window.AUGStage.MARK -> { width, shadow:[dx,dy], paths:[[[x,y],...],...] }
 *      (Augmentum ornament traced from the logo; units = mark width, centred on 0,0)
 *
 * Timeline (progress p) — page text beats switch at .15 .35 .51 .69 .86:
 *   0.00–0.16 Atsūtiet     documents land on the desk, more come out of the parcel locker
 *   0.16–0.36 Sakārtojam   postings journal slides in, documents fly into rows, postings counter
 *   0.36–0.52 Algas        payroll sheet fills column by column, leave/sick calendar
 *   0.52–0.70 Deklarācijas PVN · Darba devēja ziņojums · UIN · Statistika (CSP) get stamped, month strip fills
 *   0.70–0.86 Gada pārskats balance sheet fills, assets/liabilities bars level, "Starpība 0,00"
 *   0.86–1.00 Pārskatāmi   balance rules fold into the ornament (vector), cross-fade 0.93–0.97 to the real
 *                          logo layers img/mark-shadow.png + img/mark-gold.png (relative to this script), cards
 */
(function () {
  'use strict';

  var BASE = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^\/?#]*([?#].*)?$/, '') : ''; })();

  // ---------- math ----------
  var PI = Math.PI;
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function seg(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function inOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function outCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function inCubic(t) { return t * t * t; }
  function outBack(t, s) { if (t <= 0) return 0; s = s == null ? 1.6 : s; var u = t - 1; return 1 + (s + 1) * u * u * u + s * u * u; }
  function bump(t) { return Math.sin(PI * clamp(t, 0, 1)); }
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function fmt(n) {
    var neg = n < 0; n = Math.abs(n);
    var s = n.toFixed(2).split('.'), i = s[0], out = '';
    while (i.length > 3) { out = ' ' + i.slice(-3) + out; i = i.slice(0, -3); }
    return (neg ? '−' : '') + i + out + ',' + s[1];
  }

  // ---------- palette & type ----------
  var C = {
    desk: '#eef0f2', ink: '#141a3f', soft: 'rgba(20,26,63,.58)', mute: 'rgba(20,26,63,.40)',
    bar: 'rgba(20,26,63,.10)', bar2: 'rgba(20,26,63,.16)', rule: 'rgba(20,26,63,.13)',
    navy: '#283088', gold: '#cea144', goldHi: '#ecd391', goldLo: '#9c722c', red: '#b3402e',
    paper: '#ffffff', graphite: '#353b50', graphite2: '#272c3d', door: '#dfe2e8', tint: 'rgba(206,161,68,.20)'
  };
  var MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  var DISP = '"Bricolage Grotesque", "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
  var BODY = '"Instrument Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  // ---------- Augmentum ornament (45° bands traced against the logo, mirror-symmetric) ----------
  var MARK = (function () {
    var cx = 299, k = 424, cy = 125;                       // trace space: logo at 600 px width
    function m(q) { return [2 * cx - q[0], q[1]]; }
    var C1 = [239, 14], C2 = [209.5, 43.5], C3 = [225, 59], T3 = [237, 47];     // upper hook
    var L1 = [180, 103], L2 = [151, 132], L3 = [165, 146], LT = [177, 134];   // middle hook
    var V1 = [135.5, 237.5], F1 = [100, 202], MID = [299, 223];
    var raw = [
      [F1, V1, m(C1), m(C2), m(C3), m(T3)],
      [m(F1), m(V1), C1, C2, C3, T3],
      [LT, L3, L2, L1, MID, m(L1), m(L2), m(L3), m(LT)]
    ];
    return {
      width: 25 / k,
      shadow: [3 / k, 13 / k],
      box: [-cx / k, -cy / k, 600 / k, 268 / k],   // where img/mark-gold.png + mark-shadow.png (1200×536) sit
      paths: raw.map(function (P) { return P.map(function (q) { return [(q[0] - cx) / k, (q[1] - cy) / k]; }); })
    };
  })();

  // ---------- content (illustrative) ----------
  var DOCS = [
    { id: 'rec1', kind: 'receipt', w: 118, h: 236, row: 0, no: '3381', items: ['4,20', '6,85', '7,35'], total: '18,40' },
    { id: 'inv', kind: 'invoice', w: 200, h: 276, row: 1, no: '0142', total: '1 240,00' },
    { id: 'con', kind: 'contract', w: 200, h: 276, row: -1 },
    { id: 'bank', kind: 'bank', w: 200, h: 276, row: 2, eject: [0.02, 0.075] },
    { id: 'adv', kind: 'advance', w: 200, h: 276, row: 3, eject: [0.05, 0.105] },
    { id: 'rec2', kind: 'receipt', w: 118, h: 220, row: 4, no: '7720', items: ['12,40', '30,50'], total: '42,90', eject: [0.085, 0.14] }
  ];
  var LEDGER = [
    ['02.10.', 'Čeks Nr. 3381', '18,40', ''],
    ['03.10.', 'Rēķins Nr. 0142', '', '1 240,00'],
    ['05.10.', 'Bankas izraksts', '2 860,00', ''],
    ['07.10.', 'Avansa norēķins', '96,15', ''],
    ['09.10.', 'Čeks Nr. 7720', '42,90', ''],
    ['12.10.', 'Rēķins Nr. 0151', '', '685,00'],
    ['14.10.', 'Pavadzīme Nr. 88', '312,60', ''],
    ['16.10.', 'Bankas izraksts', '', '1 105,30'],
    ['19.10.', 'Rēķins Nr. 0158', '', '2 410,00'],
    ['21.10.', 'Čeks Nr. 4104', '27,35', '']
  ];
  var PAY = (function () {
    var who = ['A. K.', 'L. B.', 'M. Z.', 'R. O.', 'I. S.', 'E. V.'];
    var gross = [1850, 1420, 2300, 1180, 1640, 2050];
    return who.map(function (n, i) {
      var g = gross[i], v = Math.round(g * 10.5) / 100, t = Math.max(0, Math.round((g - v - 510) * 25.5) / 100);
      return [n, g, v, t, Math.round((g - v - t) * 100) / 100];
    });
  })();
  var FORMS = [['PVN', 'VID'], ['Darba devēja ziņojums', 'VID'], ['UIN', 'VID'], ['Statistika', 'CSP']];
  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAI', 'JŪN', 'JŪL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEC'];
  var ASSETS = [['Pamatlīdzekļi', 48200], ['Krājumi', 12640], ['Debitori', 9310], ['Nauda', 7450]];
  var LIABS = [['Pašu kapitāls', 41900], ['Ilgtermiņa kreditori', 21300], ['Īstermiņa kreditori', 14400]];
  var TOTAL = 77600;

  // ---------- layouts (wide desktop stage vs narrow phone stage) ----------
  function layout(narrow) {
    if (!narrow) return {
      narrow: false,
      locker: { x: -300, y: 150, w: 170, h: 250 },
      docs: { rec1: { x: 175, y: 60, r: 0.13 }, inv: { x: -60, y: -30, r: -0.07 }, con: { x: 80, y: -170, r: 0.05 },
              bank: { x: 255, y: -150, r: -0.06 }, adv: { x: 30, y: 165, r: 0.05 }, rec2: { x: -170, y: -200, r: -0.17 } },
      ledger: { x: 0, y: 0 }, ledgerBack: { x: -50, y: -70 },
      pay: { x: 40, y: 70 }, cal: { x: 230, y: -175 },
      forms: { x: -36, y: -170, dx: 24, dy: 86 }, strip: { x: 0, y: 322, cols: 12, cw: 48, ch: 46 },
      bil: { x: 0, y: 0 },
      orn: { x: 0, y: -70, s: 460 }, cardW: 200, cardH: 120,
      cards: [{ x: -240, y: 190 }, { x: 0, y: 215 }, { x: 240, y: 190 }],
      frames: { A: [0, 10, 900, 820], B: [0, 0, 720, 640], C: [30, -20, 780, 720], D: [0, -10, 760, 770], E: [0, 0, 720, 620], F: [0, 30, 800, 660] }
    };
    return {
      narrow: true,
      locker: { x: -180, y: 160, w: 130, h: 190 },
      docs: { rec1: { x: 150, y: 60, r: 0.12 }, inv: { x: -70, y: -50, r: -0.07 }, con: { x: 70, y: -135, r: 0.05 },
              bank: { x: 165, y: -110, r: -0.06 }, adv: { x: 40, y: 140, r: 0.05 }, rec2: { x: -170, y: -170, r: -0.15 } },
      ledger: { x: 0, y: 0 }, ledgerBack: { x: 0, y: -170 },
      pay: { x: 0, y: 70 }, cal: { x: 175, y: -165 },
      forms: { x: -12, y: -180, dx: 12, dy: 80 }, strip: { x: 0, y: 300, cols: 6, cw: 52, ch: 44 },
      bil: { x: 0, y: 0 },
      orn: { x: 0, y: -120, s: 420 }, cardW: 190, cardH: 118,
      cards: [{ x: -100, y: 95 }, { x: 100, y: 95 }, { x: 0, y: 225 }],
      frames: { A: [0, 0, 580, 590], B: [0, 0, 636, 520], C: [0, 10, 620, 580], D: [0, -60, 380, 620], D2: [0, 40, 380, 620],
                E: [0, 0, 636, 500], F: [0, 20, 560, 600] }
    };
  }
  function cameraAt(L, p) {
    var F = L.frames;
    function push(f, k) { return [f[0], f[1], f[2] * k, f[3] * k]; }
    var keys = [
      [0.00, F.A], [0.14, push(F.A, 0.955)], [0.205, F.B], [0.34, push(F.B, 0.96)],
      [0.395, F.C], [0.50, push(F.C, 0.965)], [0.56, F.D], [0.685, F.D2 || push(F.D, 0.96)],
      [0.745, F.E], [0.855, push(F.E, 0.97)], [0.915, F.F], [1.00, push(F.F, 0.96)]
    ];
    for (var i = 0; i < keys.length - 1; i++) {
      var a = keys[i], b = keys[i + 1];
      if (p <= b[0]) {
        var t = inOut(seg(p, a[0], b[0]));
        return [lerp(a[1][0], b[1][0], t), lerp(a[1][1], b[1][1], t), lerp(a[1][2], b[1][2], t), lerp(a[1][3], b[1][3], t)];
      }
    }
    return keys[keys.length - 1][1];
  }

  // ---------- drawing primitives ----------
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
  }
  function bar(c, x, y, w, h, col) { c.fillStyle = col || C.bar; rr(c, x, y, w, h, h / 2); c.fill(); }
  // sheet text zoom: keeps table type at >= ~9.5 px on screen (narrow stages scale the camera down)
  var TZ = { on: false, min: 0 };
  function F(font) {
    if (!TZ.on || !TZ.min) return font;
    return font.replace(/(\d+(?:\.\d+)?)px/, function (m, n) { n = +n; return Math.min(n * 1.7, Math.max(n, TZ.min)).toFixed(1) + 'px'; });
  }
  function fpx(font) { return parseFloat(/([\d.]+)px/.exec(F(font))[1]); }
  function text(c, s, x, y, font, col, align) {
    c.font = F(font); c.fillStyle = col; c.textAlign = align || 'left'; c.fillText(s, x, y);
  }
  function hline(c, x0, x1, y, col, lw) {
    c.strokeStyle = col; c.lineWidth = lw || 1; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
  }

  var SH = null;   // soft shadow sprite (rect occupies 140 of 200 px)
  function makeShadowSprite() {
    var s = document.createElement('canvas'); s.width = s.height = 200;
    var x = s.getContext('2d');
    x.shadowColor = 'rgba(20,26,63,.42)'; x.shadowBlur = 24; x.shadowOffsetX = 1000;
    x.fillStyle = '#000'; x.fillRect(30 - 1000, 34, 140, 140);
    return s;
  }
  // paper sheet centred on origin; z = lift (0 desk … 1 in the air)
  function paper(c, w, h, z, pathFn) {
    z = z || 0;
    var px = w * 0.214, py = h * 0.214;
    c.save();
    c.globalAlpha *= 0.5 - z * 0.22;
    c.drawImage(SH, -w / 2 - px + z * 14, -h / 2 - py + 2 + z * 30, w + 2 * px, h + 2 * py);
    c.restore();
    c.fillStyle = 'rgba(20,26,63,.09)';
    if (pathFn) { c.save(); c.translate(0, 1); pathFn(c, w, h); c.fill(); c.restore(); } else { rr(c, -w / 2, -h / 2 + 1, w, h, 3); c.fill(); }
    c.fillStyle = C.paper;
    if (pathFn) pathFn(c, w, h); else rr(c, -w / 2, -h / 2, w, h, 3);
    c.fill();
  }
  function receiptPath(c, w, h) {
    var x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2, n = Math.round(w / 6.5);
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y0); c.lineTo(x1, y1);
    for (var i = n; i >= 0; i--) c.lineTo(x0 + i * w / n, y1 - (i % 2 ? 5 : 0));
    c.closePath();
  }

  // ---------- documents ----------
  function drawDoc(c, d, z) {
    var w = d.w, h = d.h, x0 = -w / 2 + 16, x1 = w / 2 - 16, y = -h / 2;
    if (d.kind === 'receipt') {
      paper(c, w, h, z, receiptPath);
      x0 = -w / 2 + 12; x1 = w / 2 - 12;
      text(c, 'ČEKS', 0, y + 26, '600 12px ' + MONO, C.ink, 'center');
      text(c, 'Nr. ' + d.no, 0, y + 41, '400 9px ' + MONO, C.mute, 'center');
      bar(c, x0 + 14, y + 52, w - 52, 4);
      var yy = y + 74;
      for (var i = 0; i < d.items.length; i++) {
        bar(c, x0, yy - 6, 44 + hash(i + d.no.length) * 18, 5);
        text(c, d.items[i], x1, yy, '400 10px ' + MONO, C.soft, 'right'); yy += 18;
      }
      c.setLineDash([3, 3]); hline(c, x0, x1, yy - 4, C.bar2); c.setLineDash([]);
      text(c, 'KOPĀ', x0, yy + 13, '600 10px ' + MONO, C.ink);
      text(c, d.total, x1, yy + 13, '600 11px ' + MONO, C.ink, 'right');
      // barcode
      c.fillStyle = 'rgba(20,26,63,.55)';
      var bx = x0 + 4, by = h / 2 - 46;
      for (var b = 0; bx < x1 - 4; b++) { var bw = 1 + (hash(b * 3.7 + d.w) * 2.6 | 0); c.fillRect(bx, by, bw, 22); bx += bw + 1.6; }
      return;
    }
    paper(c, w, h, z);
    if (d.kind === 'invoice') {
      text(c, 'RĒĶINS', x0, y + 34, '700 19px ' + DISP, C.ink);
      text(c, 'Nr. ' + d.no, x1, y + 33, '400 10px ' + MONO, C.mute, 'right');
      bar(c, x0, y + 50, 70, 5); bar(c, x0, y + 60, 54, 5); bar(c, x1 - 66, y + 50, 66, 5); bar(c, x1 - 50, y + 60, 50, 5);
      hline(c, x0, x1, y + 84, C.rule);
      var r = y + 104, vals = ['420,00', '380,00', '225,00', '215,00'];
      for (var j = 0; j < 4; j++) { bar(c, x0, r - 6, 70 + hash(j + 4) * 30, 5); text(c, vals[j], x1, r, '400 10px ' + MONO, C.soft, 'right'); r += 21; }
      hline(c, x0, x1, r - 6, C.rule);
      text(c, 'Kopā', x0, r + 14, '600 11px ' + BODY, C.ink);
      text(c, d.total, x1, r + 14, '600 12px ' + MONO, C.ink, 'right');
      bar(c, x0, h / 2 - 30, 90, 4); bar(c, x0, h / 2 - 21, 64, 4);
    } else if (d.kind === 'bank') {
      text(c, 'KONTA IZRAKSTS', x0, y + 32, '700 14px ' + DISP, C.ink);
      bar(c, x0, y + 44, 110, 5);
      text(c, '01.10. – 31.10.', x0, y + 66, '400 9px ' + MONO, C.mute);
      hline(c, x0, x1, y + 76, C.rule);
      var rows = ['+2 860,00', '−1 240,00', '−96,15', '+685,00', '−312,60', '+1 105,30', '−42,90'];
      var ry = y + 94;
      for (var k = 0; k < rows.length; k++) {
        text(c, (k + 2) + '.10.', x0, ry, '400 9px ' + MONO, C.mute);
        bar(c, x0 + 38, ry - 6, 46 + hash(k + 9) * 26, 5);
        text(c, rows[k], x1, ry, '400 10px ' + MONO, rows[k][0] === '+' ? C.navy : C.soft, 'right'); ry += 20;
      }
    } else if (d.kind === 'contract') {
      text(c, 'LĪGUMS', 0, y + 36, '700 19px ' + DISP, C.ink, 'center');
      text(c, 'Nr. 12/26', 0, y + 52, '400 9px ' + MONO, C.mute, 'center');
      var py = y + 74;
      for (var q = 0; q < 8; q++) { bar(c, x0, py, (x1 - x0) * (q % 4 === 3 ? 0.6 : 0.94 + hash(q) * 0.06), 4); py += 12; if (q === 3) py += 8; }
      hline(c, x0, x0 + 66, h / 2 - 34, C.bar2); hline(c, x1 - 66, x1, h / 2 - 34, C.bar2);
      c.strokeStyle = C.navy; c.lineWidth = 1.4; c.beginPath();
      c.moveTo(x1 - 62, h / 2 - 40); c.bezierCurveTo(x1 - 54, h / 2 - 62, x1 - 46, h / 2 - 30, x1 - 38, h / 2 - 48);
      c.bezierCurveTo(x1 - 32, h / 2 - 58, x1 - 24, h / 2 - 36, x1 - 6, h / 2 - 46); c.stroke();
    } else if (d.kind === 'advance') {
      text(c, 'AVANSA', x0, y + 30, '700 15px ' + DISP, C.ink);
      text(c, 'NORĒĶINS', x0, y + 47, '700 15px ' + DISP, C.ink);
      bar(c, x1 - 54, y + 24, 54, 5);
      hline(c, x0, x1, y + 62, C.rule);
      var ay = y + 82, av = ['38,20', '24,95', '33,00'];
      for (var a = 0; a < 3; a++) { bar(c, x0, ay - 6, 64 + hash(a + 21) * 30, 5); text(c, av[a], x1, ay, '400 10px ' + MONO, C.soft, 'right'); ay += 21; }
      hline(c, x0, x1, ay - 6, C.rule);
      text(c, 'Kopā', x0, ay + 14, '600 11px ' + BODY, C.ink);
      text(c, '96,15', x1, ay + 14, '600 12px ' + MONO, C.ink, 'right');
      bar(c, x0, h / 2 - 30, 80, 4);
    }
  }

  // ---------- parcel locker ----------
  function drawLocker(c, L, open, T) {
    var w = L.w, h = L.h;
    c.save(); c.globalAlpha *= 0.55;
    c.drawImage(SH, -w / 2 - w * 0.214 + 6, -h / 2 - h * 0.214 + 10, w * 1.43, h * 1.43);
    c.restore();
    c.fillStyle = C.graphite; rr(c, -w / 2, -h / 2, w, h, 8); c.fill();
    c.fillStyle = C.graphite2; rr(c, -w / 2, h / 2 - 10, w, 10, 3); c.fill();
    var pad = w * 0.07, cw = (w - pad * 3) / 2, ch = (h * 0.74 - pad * 4) / 3;
    for (var r = 0; r < 3; r++) for (var col = 0; col < 2; col++) {
      var x = -w / 2 + pad + col * (cw + pad), y = -h / 2 + pad + r * (ch + pad);
      if (r === 1 && col === 1) {
        c.fillStyle = '#12151f'; rr(c, x, y, cw, ch, 3); c.fill();
        // door hinged on the left, swinging toward the viewer
        var a = open * 1.25, dw = cw * Math.cos(a), grow = Math.sin(a) * 6;
        c.fillStyle = open > 0.02 ? '#c9cdd6' : C.door;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.max(2, dw), y - grow); c.lineTo(x + Math.max(2, dw), y + ch + grow); c.lineTo(x, y + ch); c.closePath(); c.fill();
        c.fillStyle = 'rgba(20,26,63,.25)'; c.fillRect(x + Math.max(2, dw) - 6 * Math.cos(a), y + ch / 2 - 6, 3, 12);
      } else {
        c.fillStyle = C.door; rr(c, x, y, cw, ch, 3); c.fill();
        c.fillStyle = 'rgba(20,26,63,.22)'; c.fillRect(x + cw - 9, y + ch / 2 - 6, 3, 12);
      }
    }
    // control panel + status LED
    var py = -h / 2 + h * 0.74 + 4;
    c.fillStyle = '#1b1f2c'; rr(c, -w / 2 + pad, py, w * 0.46, h * 0.16, 3); c.fill();
    c.fillStyle = 'rgba(206,161,68,.55)'; rr(c, -w / 2 + pad + 6, py + 7, w * 0.25, 4, 2); c.fill();
    var led = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(T * 2.6));
    c.fillStyle = 'rgba(120,210,140,' + led.toFixed(3) + ')';
    c.beginPath(); c.arc(w / 2 - pad - 8, py + 10, 3.2, 0, PI * 2); c.fill();
    for (var k = 0; k < 6; k++) { c.fillStyle = 'rgba(223,226,232,.35)'; c.fillRect(w / 2 - pad - 46 + (k % 3) * 11, py + 18 + (k / 3 | 0) * 9, 7, 5); }
  }
  function lockerMouth(L) {
    var w = L.locker.w, h = L.locker.h, pad = w * 0.07, cw = (w - pad * 3) / 2, ch = (h * 0.74 - pad * 4) / 3;
    return { x: L.locker.x - w / 2 + pad * 2 + cw * 1.5, y: L.locker.y - h / 2 + pad * 2 + ch * 1.5 };
  }

  // ---------- ledger ----------
  var LW = 620, LH = 500;
  function ledgerRowY(i) { return -LH / 2 + 124 + i * 34; }
  function drawLedger(c, p, rowsT, count) {
    paper(c, LW, LH, 0);
    var x0 = -LW / 2 + 28, x1 = LW / 2 - 28, y = -LH / 2;
    text(c, 'Grāmatojumu žurnāls', x0, y + 50, '700 25px ' + DISP, C.ink);
    text(c, 'OKTOBRIS', x0, y + 70, '600 10px ' + BODY, C.mute);
    text(c, 'Grāmatojumi', x1 - 52, y + 50, '500 12px ' + BODY, C.soft, 'right');
    text(c, String(count), x1, y + 51, '600 22px ' + MONO, C.navy, 'right');
    var cx = [x0, x0 + (TZ.min > 15 ? 90 : 78), x1 - 150, x1];
    var hy = y + 98;
    text(c, 'DATUMS', cx[0], hy, '600 10px ' + BODY, C.mute);
    text(c, 'DOKUMENTS', cx[1], hy, '600 10px ' + BODY, C.mute);
    text(c, 'DEBETS', cx[2], hy, '600 10px ' + BODY, C.mute, 'right');
    text(c, 'KREDĪTS', cx[3], hy, '600 10px ' + BODY, C.mute, 'right');
    hline(c, x0, x1, hy + 10, C.bar2);
    // double money rules
    c.strokeStyle = 'rgba(40,48,136,.12)'; c.lineWidth = 1;
    c.beginPath();
    [cx[2] - 118, cx[2] - 115, cx[2] + 18, cx[2] + 21].forEach(function (vx) { c.moveTo(vx, hy - 14); c.lineTo(vx, LH / 2 - 26); });
    c.stroke();
    for (var i = 0; i < LEDGER.length; i++) {
      var ry = ledgerRowY(i), t = rowsT[i];
      hline(c, x0, x1, ry + 17, C.rule);
      if (t.flash > 0) { c.fillStyle = 'rgba(206,161,68,' + (0.26 * t.flash).toFixed(3) + ')'; c.fillRect(x0 - 8, ry - 17, x1 - x0 + 16, 34); }
      if (t.show <= 0) continue;
      var R = LEDGER[i], a = t.show;
      c.save(); c.globalAlpha *= clamp(a * 1.6, 0, 1);
      text(c, R[0], cx[0], ry + 5, '400 14px ' + MONO, C.soft);
      text(c, R[1].slice(0, Math.ceil(R[1].length * a)), cx[1], ry + 5, '500 15px ' + BODY, C.ink);
      if (R[2]) text(c, R[2], cx[2], ry + 5, '500 14px ' + MONO, C.ink, 'right');
      if (R[3]) text(c, R[3], cx[3], ry + 5, '500 14px ' + MONO, C.navy, 'right');
      c.restore();
    }
  }

  // ---------- payroll + calendar ----------
  var PW = 600, PH = 372;
  function drawPayroll(c, p) {
    paper(c, PW, PH, 0);
    var x0 = -PW / 2 + 26, x1 = PW / 2 - 26, y = -PH / 2;
    text(c, 'Darba algas', x0, y + 44, '700 23px ' + DISP, C.ink);
    text(c, 'OKTOBRIS · 6 DARBINIEKI', x1, y + 42, '600 10px ' + BODY, C.mute, 'right');
    var cols = [x0, x0 + 200, x0 + 312, x0 + 424, x1], heads = ['DARBINIEKS', 'BRUTO', 'VSAOI (DN)', 'IIN', 'NETO'];
    var hy = y + 82;
    for (var h = 0; h < 5; h++) text(c, heads[h], cols[h], hy, '600 10px ' + BODY, h === 4 ? C.navy : C.mute, h ? 'right' : 'left');
    hline(c, x0, x1, hy + 10, C.bar2);
    // active column sweep
    for (var k = 1; k < 5; k++) {
      var t = seg(p, 0.385 + (k - 1) * 0.031, 0.418 + (k - 1) * 0.031), act = bump(t);
      if (act > 0.01) { c.fillStyle = 'rgba(40,48,136,' + (0.06 * act).toFixed(3) + ')'; c.fillRect(cols[k] - 100, hy - 16, 108, PH - 96); }
    }
    var ry = hy + 32, sumNet = 0;
    for (var i = 0; i < PAY.length; i++) {
      var R = PAY[i];
      text(c, R[0], cols[0], ry, '500 15px ' + BODY, C.ink);
      for (var j = 1; j < 5; j++) {
        var tt = seg(p, 0.385 + (j - 1) * 0.031 + i * 0.0035, 0.40 + (j - 1) * 0.031 + i * 0.0035);
        if (tt <= 0) { bar(c, cols[j] - 54, ry - 7, 54, 5, 'rgba(20,26,63,.06)'); continue; }
        c.save(); c.globalAlpha *= tt;
        text(c, fmt(R[j]), cols[j], ry + (1 - tt) * 6, (j === 4 ? '600 ' : '400 ') + '14px ' + MONO, j === 4 ? C.navy : (j === 1 ? C.ink : C.soft), 'right');
        c.restore();
      }
      sumNet += R[4];
      hline(c, x0, x1, ry + 13, C.rule); ry += 34;
    }
    var tot = seg(p, 0.50, 0.515);
    text(c, 'Kopā izmaksai', cols[0], ry + 6, '600 13px ' + BODY, C.ink);
    c.save(); c.globalAlpha *= tot;
    text(c, fmt(sumNet), cols[4], ry + 7, '600 17px ' + MONO, C.navy, 'right');
    c.restore();
  }
  var CW = 240, CH = 230;
  function drawCalendar(c, p, narrow) {
    paper(c, CW, CH, 0.15);
    var x0 = -CW / 2 + 18, y = -CH / 2;
    text(c, 'Oktobris', x0, y + 32, '700 17px ' + DISP, C.ink);
    var wd = ['P', 'O', 'T', 'C', 'P', 'S', 'Sv'], cw = 29.5, ch = 24, gy = y + (narrow ? 56 : 60);
    for (var i = 0; i < 7; i++) text(c, wd[i], x0 + i * cw + cw / 2 - 2, gy - 8, '600 9px ' + BODY, i > 4 ? C.mute : C.soft, 'center');
    var vac = [12, 13, 14], sick = [22, 23];
    for (var d = 1; d <= 31; d++) {
      var idx = d - 1 + 3, cx = x0 + (idx % 7) * cw, cy = gy + (idx / 7 | 0) * ch;
      var v = vac.indexOf(d), s = sick.indexOf(d), on = 0;
      if (v >= 0) on = outBack(seg(p, 0.44 + v * 0.008, 0.455 + v * 0.008), 1.4);
      if (s >= 0) on = outBack(seg(p, 0.475 + s * 0.008, 0.49 + s * 0.008), 1.4);
      var col = (idx % 7) > 4 ? C.mute : C.ink;
      if (on > 0) {
        c.save(); c.translate(cx + cw / 2 - 2, cy + ch / 2 - 4); c.scale(on, on);
        if (v >= 0) { c.fillStyle = C.navy; rr(c, -12, -10, 24, 20, 4); c.fill(); }
        else {
          c.fillStyle = 'rgba(206,161,68,.28)'; rr(c, -12, -10, 24, 20, 4); c.fill();
          c.save(); rr(c, -12, -10, 24, 20, 4); c.clip(); c.strokeStyle = C.gold; c.lineWidth = 1.2; c.beginPath();
          for (var hx = -24; hx < 24; hx += 5) { c.moveTo(hx, 10); c.lineTo(hx + 20, -10); } c.stroke(); c.restore();
        }
        c.restore();
        if (v >= 0) col = '#fff';
      }
      text(c, String(d), cx + cw / 2 - 2, cy + ch / 2, '500 10px ' + MONO, col, 'center');
    }
    var ly = narrow ? CH / 2 - 34 : CH / 2 - 16, lx2 = narrow ? x0 : x0 + 104, ly2 = narrow ? CH / 2 - 10 : ly;
    c.fillStyle = C.navy; rr(c, x0, ly - 8, 10, 9, 2); c.fill();
    text(c, 'atvaļinājums', x0 + 15, ly, '500 10px ' + BODY, C.soft);
    c.fillStyle = 'rgba(206,161,68,.55)'; rr(c, lx2, ly2 - 8, 10, 9, 2); c.fill();
    text(c, 'slimības lapa', lx2 + 15, ly2, '500 10px ' + BODY, C.soft);
  }

  // ---------- declarations ----------
  var FW = 300, FH = 360, STAMP = null;
  function makeStamp() {
    var s = document.createElement('canvas'); s.width = 300; s.height = 104;
    var x = s.getContext('2d');
    x.strokeStyle = x.fillStyle = C.red;
    x.lineWidth = 5; rr(x, 6, 6, 288, 92, 12); x.stroke();
    x.lineWidth = 2; rr(x, 16, 16, 268, 72, 7); x.stroke();
    x.font = '800 44px ' + DISP; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('IESNIEGTS', 150, 54);
    // ink texture: knock out sparse specks (one-off, 300×104 px)
    x.globalCompositeOperation = 'destination-out';
    for (var i = 0; i < 520; i++) {
      var r = hash(i * 1.37) < 0.85 ? 0.7 + hash(i * 2.1) * 1.1 : 1.8 + hash(i * 3.3) * 2.2;
      x.globalAlpha = 0.35 + hash(i * 5.9) * 0.65;
      x.beginPath(); x.arc(hash(i * 7.7) * 300, hash(i * 9.1) * 104, r, 0, PI * 2); x.fill();
    }
    return s;
  }
  function drawForm(c, f, i, stampK) {
    paper(c, FW, FH, 0);
    var x0 = -FW / 2 + 22, x1 = FW / 2 - 22, y = -FH / 2;
    c.fillStyle = C.navy; c.fillRect(-FW / 2, y, FW, 5);
    // authority tag (top-left) — the stamp lands top-right, clear of it
    var tf = '600 10px ' + BODY, fs = fpx(tf);
    c.font = F(tf);
    var tw = c.measureText(f[1]).width + 16, th = Math.max(20, fs + 9);
    c.strokeStyle = C.bar2; c.lineWidth = 1; rr(c, x0, y + 12, tw, th, th / 2); c.stroke();
    text(c, f[1], x0 + tw / 2, y + 12 + th / 2 + fs * 0.36, tf, C.soft, 'center');
    var long = f[0].length > 10;
    text(c, f[0], x0, y + (long ? 74 : 72), '700 ' + (long ? 20 : 26) + 'px ' + DISP, C.ink);
    // fields
    var fy = y + 104;
    for (var k = 0; k < 7; k++) {
      bar(c, x0, fy, 70 + hash(k + i * 7) * 50, 5);
      c.strokeStyle = C.rule; rr(c, x1 - 104, fy - 9, 104, 22, 3); c.stroke();
      text(c, fmt(120 + hash(k * 3 + i) * 4800), x1 - 8, fy + 6, '400 11px ' + MONO, C.soft, 'right');
      fy += 36;
    }
    if (stampK > 0) {
      var s = stampK < 0.5 ? lerp(1.7, 0.94, inCubic(stampK * 2)) : lerp(0.94, 1, outCubic((stampK - 0.5) * 2));
      c.save();
      c.translate(x1 - 62, y + 31); c.rotate(-0.1 + (i % 2 ? 0.05 : 0)); c.scale(s * 0.4, s * 0.4);
      c.globalAlpha *= clamp(stampK * 2.4, 0, 1) * 0.92;
      c.drawImage(STAMP, -150, -52);
      c.restore();
    }
  }
  function drawStrip(c, L, p) {
    var S = L.strip, cols = S.cols, rows = 12 / cols, w = cols * S.cw;
    c.save(); c.translate(S.x - w / 2, S.y - rows * S.ch / 2);
    for (var k = 0; k < 12; k++) {
      var x = (k % cols) * S.cw, y = (k / cols | 0) * S.ch;
      var t = outBack(seg(p, 0.555 + k * 0.0105, 0.567 + k * 0.0105), 1.3);
      c.fillStyle = 'rgba(255,255,255,.7)'; rr(c, x + 2, y + 2, S.cw - 4, S.ch - 4, 6); c.fill();
      c.strokeStyle = C.rule; c.lineWidth = 1; rr(c, x + 2, y + 2, S.cw - 4, S.ch - 4, 6); c.stroke();
      if (t > 0) {
        c.save(); c.translate(x + S.cw / 2, y + S.ch / 2); c.scale(t, t);
        c.fillStyle = C.navy; rr(c, -S.cw / 2 + 2, -S.ch / 2 + 2, S.cw - 4, S.ch - 4, 6); c.fill();
        c.strokeStyle = C.gold; c.lineWidth = 2; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(-6, 8); c.lineTo(-2, 12); c.lineTo(7, 3); c.stroke(); c.lineCap = 'butt';
        c.restore();
      }
      var mf = '600 10px ' + MONO, mz = fpx(mf), on = Math.min(1, t);
      text(c, MONTHS[k], x + S.cw / 2, y + S.ch / 2 + mz * 0.36 - on * (mz * 0.36 + 5), mf, t > 0.5 ? '#fff' : C.soft, 'center');
    }
    c.restore();
  }

  // ---------- balance sheet ----------
  var BW = 620, BH = 480;
  var BCOL = [[-290, -8], [8, 290]];
  function bilanceRules() {
    var R = [[-290, 290, -176, 'a']];
    for (var s = 0; s < 2; s++) {
      var a = BCOL[s][0], b = BCOL[s][1];
      R.push([a, b, -136, 'h']);
      var n = s === 0 ? 4 : 3;
      for (var i = 1; i <= n; i++) R.push([a, b, -136 + 34 * i, 'r']);
      if (s === 1) R.push([a, b, 0, 'r']);
      R.push([a, b, 34, 'd'], [a, b, 38, 'd']);
    }
    R.push([-290, 290, 66, 'a'], [-262, -150, 200, 'd'], [-262, -150, 100, 'l']);
    return R;   // 18 rules
  }
  var BRULES = bilanceRules();
  function bilanceBars(p) {
    var ha = 100 * outCubic(seg(p, 0.75, 0.80));
    var hp = 100 * outBack(seg(p, 0.765, 0.822), 1.1);
    return [ha, Math.min(hp, 104)];
  }
  function drawBilance(c, p, contentA, drawRules) {
    paper(c, BW, BH, 0);
    c.save(); c.globalAlpha *= contentA;
    var y = -BH / 2;
    text(c, 'Gada pārskats', -290, -190, '700 25px ' + DISP, C.ink);
    text(c, 'BILANCE', 290, -192, '600 10px ' + BODY, C.mute, 'right');
    text(c, 'AKTĪVS', BCOL[0][0], -146, '700 12px ' + BODY, C.navy);
    text(c, 'PASĪVS', BCOL[1][0], -146, '700 12px ' + BODY, C.navy);
    function rows(list, s, t0) {
      for (var i = 0; i < list.length; i++) {
        var t = seg(p, t0 + i * 0.012, t0 + i * 0.012 + 0.014), ry = -136 + 34 * i + 23;
        if (t <= 0) continue;
        c.save(); c.globalAlpha *= t;
        text(c, list[i][0], BCOL[s][0], ry, '500 14px ' + BODY, C.ink);
        text(c, fmt(list[i][1]), BCOL[s][1], ry, '500 14px ' + MONO, C.ink, 'right');
        c.restore();
      }
    }
    rows(ASSETS, 0, 0.735); rows(LIABS, 1, 0.741);
    var tt = seg(p, 0.79, 0.805);
    if (tt > 0) {
      c.save(); c.globalAlpha *= tt;
      for (var s = 0; s < 2; s++) {
        text(c, 'Kopā', BCOL[s][0], 24, '700 14px ' + BODY, C.ink);
        text(c, fmt(TOTAL), BCOL[s][1], 24, '700 15px ' + MONO, C.navy, 'right');
      }
      c.restore();
    }
    // bars
    var H = bilanceBars(p), base = 200;
    c.fillStyle = C.navy; c.fillRect(-250, base - H[0], 40, H[0]);
    c.fillStyle = C.gold; c.fillRect(-202, base - H[1], 40, H[1]);
    text(c, 'A', -230, base + 16, '600 10px ' + MONO, C.mute, 'center');
    text(c, 'P', -182, base + 16, '600 10px ' + MONO, C.mute, 'center');
    var diff = Math.abs(H[0] - H[1]) / 100 * TOTAL;
    var settled = seg(p, 0.822, 0.835), sa = seg(p, 0.752, 0.77);
    if (sa > 0) {
      c.save(); c.globalAlpha *= sa;
      text(c, 'STARPĪBA', -120, 116, '600 10px ' + BODY, C.mute);
      text(c, fmt(Math.round(diff * 100) / 100), -120, 172, '600 44px ' + MONO, settled > 0.5 ? C.navy : C.ink);
      c.restore();
    }
    var ck = outBack(seg(p, 0.828, 0.85), 1.8);
    if (ck > 0.001) {
      c.save(); c.translate(236, 150); c.scale(ck, ck);
      c.fillStyle = C.gold; c.beginPath(); c.arc(0, 0, 26, 0, PI * 2); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(-11, 1); c.lineTo(-3, 9); c.lineTo(12, -7); c.stroke();
      c.restore();
      c.save(); c.globalAlpha *= seg(p, 0.835, 0.85);
      text(c, 'Bilance sakrīt', 236, 204, '600 12px ' + BODY, C.ink, 'center');
      c.restore();
    }
    c.restore();
    if (drawRules) {
      for (var i = 0; i < BRULES.length; i++) {
        var R = BRULES[i];
        if (R[3] === 'l') {   // level line across the bars: gold once balanced
          var lv = base - Math.max(H[0], H[1]);
          c.setLineDash([4, 4]); hline(c, R[0], R[1], lv, settled > 0 ? C.gold : C.bar2, 1.5); c.setLineDash([]);
        } else hline(c, R[0], R[1], R[2], R[3] === 'd' ? 'rgba(20,26,63,.45)' : R[3] === 'h' ? C.bar2 : C.rule, 1);
      }
    }
  }

  // ---------- overview cards ----------
  function drawCard(c, w, h, kind, t, T, narrow) {
    paper(c, w, h, 0.1, function (cc, ww, hh) { rr(cc, -ww / 2, -hh / 2, ww, hh, 12); });
    var x0 = -w / 2 + 16, x1 = w / 2 - 16, y = -h / 2;
    var title = kind === 0 ? 'NAUDAS PLŪSMA' : kind === 1 ? 'DEBITORI' : 'IZMAKSAS';
    text(c, title, x0, y + 24, '600 9.5px ' + BODY, C.mute);
    // value: right of the title, or on its own line when narrow
    function val(s, font) { if (narrow) text(c, s, x0, y + 48, font, C.navy); else text(c, s, x1, y + 25, font, C.navy, 'right'); }
    var top = narrow ? y + 58 : y + 40;
    if (kind === 0) {
      val('+4 280,00', '600 12px ' + MONO);
      var pts = [0.42, 0.5, 0.46, 0.58, 0.55, 0.63, 0.6, 0.7, 0.66, 0.78, 0.74, 0.86];
      var gx0 = x0, gx1 = x1, gy0 = top, gy1 = h / 2 - 14, n = pts.length, k = t * (n - 1);
      c.beginPath();
      for (var i = 0; i < n && i <= k + 1; i++) {
        var f = Math.min(1, k - i + 1), px = lerp(gx0, gx1, (i - 1 + f) / (n - 1)), py;
        if (i === 0) { c.moveTo(gx0, lerp(gy1, gy0, pts[0])); continue; }
        py = lerp(gy1, gy0, lerp(pts[i - 1], pts[i], f));
        c.lineTo(px, py);
      }
      c.strokeStyle = C.navy; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
      var ex = lerp(gx0, gx1, k / (n - 1)), ei = Math.floor(k), ef = k - ei;
      var ey = lerp(gy1, gy0, lerp(pts[ei], pts[Math.min(n - 1, ei + 1)], ef));
      c.fillStyle = C.gold; c.beginPath(); c.arc(ex, ey, 3.5 + 0.8 * Math.sin(T * 3), 0, PI * 2); c.fill();
    } else if (kind === 1) {
      val('72 % apmaksāti', '600 11px ' + MONO);
      var bw = x1 - x0, by = narrow ? y + 62 : y + 52;
      c.fillStyle = 'rgba(20,26,63,.08)'; rr(c, x0, by, bw, 12, 6); c.fill();
      c.fillStyle = C.gold; rr(c, x0, by, bw * 0.9 * t, 12, 6); c.fill();
      c.fillStyle = C.navy; rr(c, x0, by, bw * 0.72 * t, 12, 6); c.fill();
      if (!narrow) { bar(c, x0, by + 30, 60, 5); bar(c, x0 + 72, by + 30, 44, 5); }
      text(c, '14 rēķini', x1, by + (narrow ? 38 : 36), '400 10px ' + MONO, C.soft, 'right');
    } else {
      val('8 940,00', '600 12px ' + MONO);
      var hs = [0.55, 0.7, 0.48, 0.82, 0.62, 0.74], bx = x0, bwid = (x1 - x0) / 6, bmax = h / 2 - 12 - top;
      for (var b = 0; b < 6; b++) {
        var tb = outCubic(clamp(t * 1.6 - b * 0.12, 0, 1)), bh = bmax * hs[b] * tb;
        c.fillStyle = b === 5 ? C.gold : 'rgba(40,48,136,.78)';
        rr(c, bx + 4, h / 2 - 12 - bh, bwid - 8, bh, 3); c.fill(); bx += bwid;
      }
    }
  }

  // ---------- ornament ----------
  function ornGeom(L) {
    var O = L.orn, S = O.s;
    var paths = MARK.paths.map(function (P) { return P.map(function (q) { return [O.x + q[0] * S, O.y + q[1] * S]; }); });
    var segs = [], lens = [];
    paths.forEach(function (P, j) {
      var len = 0;
      for (var i = 0; i < P.length - 1; i++) { segs.push([P[i], P[i + 1]]); len += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); }
      lens.push(len);
    });
    // map balance rules → ornament segments, both sorted top-to-bottom
    var order = segs.map(function (s, i) { return i; }).sort(function (a, b) {
      var ma = (segs[a][0][1] + segs[a][1][1]) / 2, mb = (segs[b][0][1] + segs[b][1][1]) / 2;
      return ma - mb || (segs[a][0][0] + segs[a][1][0]) - (segs[b][0][0] + segs[b][1][0]);
    });
    var rules = BRULES.map(function (r, i) { return i; }).sort(function (a, b) { return BRULES[a][2] - BRULES[b][2] || BRULES[a][0] - BRULES[b][0]; });
    var pairs = order.map(function (si, k) { return { seg: segs[si], rule: BRULES[rules[k]], k: k }; });
    var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    paths.forEach(function (P) { P.forEach(function (q) { minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]); miny = Math.min(miny, q[1]); maxy = Math.max(maxy, q[1]); }); });
    var b = MARK.box;
    return { paths: paths, lens: lens, pairs: pairs, w: MARK.width * S, sh: [MARK.shadow[0] * S, MARK.shadow[1] * S], box: [minx, miny, maxx, maxy],
             img: [O.x + b[0] * S, O.y + b[1] * S, b[2] * S, b[3] * S] };
  }
  function strokePath(c, P) { c.beginPath(); c.moveTo(P[0][0], P[0][1]); for (var i = 1; i < P.length; i++) c.lineTo(P[i][0], P[i][1]); }
  // real logo layers (cross-faded in once the vector reveal is done); vector shows until they load
  var LOGO = { gold: null, shadow: null, ok: 0, glint: null };
  function loadLogo() {
    if (LOGO.gold) return;
    ['gold', 'shadow'].forEach(function (k) {
      var im = new Image(); im.decoding = 'async';
      im.onload = function () { LOGO.ok++; };
      im.src = BASE + 'img/mark-' + k + '.png';
      LOGO[k] = im;
    });
  }
  function drawOrnament(c, L, G, p, T) {
    var bil = L.bil;
    // 1) balance rules shrink, then rotate and travel onto the ornament's centre lines
    var guideA = 1 - seg(p, 0.905, 0.93);
    if (guideA > 0) {
      c.save(); c.globalAlpha *= guideA; c.lineCap = 'round';
      G.pairs.forEach(function (pr) {
        var r = pr.rule, A = pr.seg[0], B = pr.seg[1];
        if (A[0] > B[0]) { var tmp = A; A = B; B = tmp; }
        var Lt = Math.hypot(B[0] - A[0], B[1] - A[1]), th = Math.atan2(B[1] - A[1], B[0] - A[0]);
        var t1 = inOut(seg(p, 0.856 + pr.k * 0.001, 0.872 + pr.k * 0.001));
        var t2 = inOut(seg(p, 0.866 + pr.k * 0.0012, 0.892 + pr.k * 0.0012));
        var mx = lerp(bil.x + (r[0] + r[1]) / 2, (A[0] + B[0]) / 2, t2), my = lerp(bil.y + r[2], (A[1] + B[1]) / 2, t2);
        var len = t2 > 0 ? lerp(Lt * 0.55, Lt, t2) : lerp(r[1] - r[0], Lt * 0.55, t1), ang = th * t2;
        var dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2;
        c.strokeStyle = 'rgba(40,48,136,' + lerp(0.6, 0.9, t2).toFixed(3) + ')';
        c.lineWidth = lerp(1.3, 1.8, t2);
        c.beginPath(); c.moveTo(mx - dx, my - dy); c.lineTo(mx + dx, my + dy); c.stroke();
      });
      c.restore();
    }
    var xf = LOGO.ok === 2 ? smooth(seg(p, 0.93, 0.97)) : 0;   // vector → real logo layers
    if (xf < 1) {
      c.save(); c.globalAlpha *= 1 - xf;
      // 2) navy shadow slides in under the bands
      var sh = outCubic(seg(p, 0.915, 0.945));
      c.lineJoin = 'miter'; c.miterLimit = 4; c.lineCap = 'square';
      if (sh > 0) {
        c.save(); c.globalAlpha *= sh; c.translate(G.sh[0] * sh, G.sh[1] * sh);
        c.strokeStyle = C.navy; c.lineWidth = G.w;
        G.paths.forEach(function (P) { strokePath(c, P); c.stroke(); });
        c.restore();
      }
      // 3) gold bands draw along each path
      var bx = G.box, grad = c.createLinearGradient(bx[0], bx[1], bx[2], bx[3]);
      grad.addColorStop(0, '#a77b31'); grad.addColorStop(0.32, '#e6c880'); grad.addColorStop(0.5, C.gold);
      grad.addColorStop(0.72, '#d9b765'); grad.addColorStop(1, '#94692a');
      c.strokeStyle = grad;
      G.paths.forEach(function (P, j) {
        var r = inOut(seg(p, 0.888 + j * 0.008, 0.93 + j * 0.004));
        if (r <= 0) return;
        c.lineWidth = G.w * lerp(0.35, 1, outCubic(Math.min(1, r * 1.6)));
        c.setLineDash([G.lens[j] * r + 0.01, G.lens[j] + G.w * 2]);
        strokePath(c, P); c.stroke();
      });
      c.setLineDash([]); c.lineCap = 'butt';
      c.restore();
    }
    if (xf > 0) {
      var im = G.img;
      c.save(); c.globalAlpha *= xf;
      c.drawImage(LOGO.shadow, im[0], im[1], im[2], im[3]);
      c.drawImage(LOGO.gold, im[0], im[1], im[2], im[3]);
      // 4) slow metallic glint, masked by the gold layer
      if (p > 0.97) {
        var g = LOGO.glint;
        if (!g) { g = LOGO.glint = document.createElement('canvas'); g.width = 600; g.height = 268; }
        var gc = g.getContext('2d'), ph = (T * 0.16) % 1, gx = lerp(-260, 860, ph);
        gc.globalCompositeOperation = 'source-over'; gc.clearRect(0, 0, 600, 268);
        var gl = gc.createLinearGradient(gx - 90, 0, gx + 90, 268);
        gl.addColorStop(0, 'rgba(255,248,225,0)'); gl.addColorStop(0.5, 'rgba(255,248,225,.6)'); gl.addColorStop(1, 'rgba(255,248,225,0)');
        gc.fillStyle = gl; gc.fillRect(0, 0, 600, 268);
        gc.globalCompositeOperation = 'destination-in'; gc.drawImage(LOGO.gold, 0, 0, 600, 268);
        gc.globalCompositeOperation = 'source-over';
        c.globalAlpha *= seg(p, 0.97, 0.985);
        c.drawImage(g, im[0], im[1], im[2], im[3]);
      }
      c.restore();
    }
  }

  // ---------- mount ----------
  function mount(el) {
    if (!SH) SH = makeShadowSprite();
    if (!STAMP) STAMP = makeStamp();
    loadLogo();
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    el.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var W = 1, H = 1, dpr = 1, L = layout(false), G = ornGeom(L), bg = null;
    var IN = { t: 76, b: 28, l: 12, r: 12 };   // safe insets: fixed page header on top, page fade at the bottom
    var cur = 0, vel = 0, target = 0, T = 0;
    var playing = null, paused = false, raf = 0, last = 0, destroyed = false;

    function resize() {
      var r = el.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      var small = W < 560;
      IN = small ? { t: 16, b: Math.round(H * 0.1), l: 16, r: 16 } : { t: 76, b: 28, l: 12, r: 12 };
      L = layout(small || (W - IN.l - IN.r) / Math.max(1, H - IN.t - IN.b) < 0.86); G = ornGeom(L);
      // cached backdrop: desk tone, soft window light, edge vignette
      bg = document.createElement('canvas'); bg.width = canvas.width; bg.height = canvas.height;
      var b = bg.getContext('2d');
      b.fillStyle = C.desk; b.fillRect(0, 0, bg.width, bg.height);
      var g1 = b.createRadialGradient(bg.width * 0.3, bg.height * 0.18, 0, bg.width * 0.3, bg.height * 0.18, Math.max(bg.width, bg.height) * 0.8);
      g1.addColorStop(0, 'rgba(255,255,255,.75)'); g1.addColorStop(1, 'rgba(255,255,255,0)');
      b.fillStyle = g1; b.fillRect(0, 0, bg.width, bg.height);
      var g2 = b.createRadialGradient(bg.width / 2, bg.height / 2, Math.min(bg.width, bg.height) * 0.35, bg.width / 2, bg.height / 2, Math.max(bg.width, bg.height) * 0.78);
      g2.addColorStop(0, 'rgba(40,48,136,0)'); g2.addColorStop(1, 'rgba(40,48,136,.08)');
      b.fillStyle = g2; b.fillRect(0, 0, bg.width, bg.height);
      draw();
    }

    function grid(cam, s, ox, oy) {
      var x0 = cam[0] - ox / s, x1 = cam[0] + (W - ox) / s, y0 = cam[1] - oy / s, y1 = cam[1] + (H - oy) / s;
      var step = 8, major = 80, i, v;
      ctx.lineWidth = 1 / s;
      if (step * s >= 3.5) {
        ctx.strokeStyle = 'rgba(40,48,136,.055)'; ctx.beginPath();
        for (v = Math.floor(x0 / step) * step; v <= x1; v += step) if (v % major) { ctx.moveTo(v, y0); ctx.lineTo(v, y1); }
        for (v = Math.floor(y0 / step) * step; v <= y1; v += step) if (v % major) { ctx.moveTo(x0, v); ctx.lineTo(x1, v); }
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(40,48,136,.12)'; ctx.beginPath();
      for (v = Math.floor(x0 / major) * major; v <= x1; v += major) { ctx.moveTo(v, y0); ctx.lineTo(v, y1); }
      for (v = Math.floor(y0 / major) * major; v <= y1; v += major) { ctx.moveTo(x0, v); ctx.lineTo(x1, v); }
      ctx.stroke();
      i = 0;
    }

    function place(x, y, r, s, a) { ctx.save(); ctx.translate(x, y); if (r) ctx.rotate(r); if (s !== 1) ctx.scale(s, s); ctx.globalAlpha = a; }

    function docState(d, p) {
      var land = L.docs[d.id], st = { x: land.x, y: land.y, r: land.r, s: 1, z: 0, a: 1, fly: false };
      if (d.eject) {
        var t = seg(p, d.eject[0], d.eject[1]);
        if (t <= 0) { st.a = 0; return st; }
        var m = lockerMouth(L), e = outCubic(t);
        var cx = lerp(m.x, land.x, 0.5), cy = Math.min(m.y, land.y) - 190;
        var u = 1 - e;
        st.x = u * u * m.x + 2 * u * e * cx + e * e * land.x;
        st.y = u * u * m.y + 2 * u * e * cy + e * e * land.y;
        st.s = lerp(0.28, 1, outCubic(Math.min(1, t * 1.4))) * (1 + 0.035 * bump(seg(t, 0.82, 1)));
        st.r = lerp(-0.6, land.r, e);
        st.z = bump(t) * 0.9;
        st.fly = t < 1;
      }
      if (d.row >= 0) {
        var f0 = 0.175 + d.row * 0.026, ft = seg(p, f0, f0 + 0.045);
        if (ft > 0) {
          var lg = ledgerState(p), tx = lg.x - LW / 2 + 28 + 140, ty = lg.y + ledgerRowY(d.row);
          var e2 = inOut(ft);
          st.x = lerp(st.x, tx, e2); st.y = lerp(st.y, ty, e2) - bump(ft) * 60;
          st.r = lerp(st.r, 0, e2); st.s = lerp(st.s, 0.13, e2); st.z = bump(ft) * 0.8;
          st.a = 1 - seg(ft, 0.72, 1); st.fly = true;
        }
      } else {
        var xt = inCubic(seg(p, 0.15, 0.23));
        st.x -= xt * 520; st.r -= xt * 0.3; st.a = 1 - seg(p, 0.19, 0.24);
      }
      if (!st.fly && !reduce) { st.y += Math.sin(T * 0.8 + d.w * 0.07 + d.h) * 1.1; st.r += Math.sin(T * 0.6 + d.h) * 0.004; }
      return st;
    }
    function ledgerState(p) {
      var e = outCubic(seg(p, 0.15, 0.215)), b = inOut(seg(p, 0.35, 0.40)), x = inOut(seg(p, 0.502, 0.548));
      var bx = lerp(L.ledger.x, L.ledgerBack.x, b), by = lerp(L.ledger.y, L.ledgerBack.y, b);
      return { x: bx - x * 120, y: by + (1 - e) * 720 - x * 760, r: (1 - e) * 0.06 - x * 0.08, s: lerp(1, 0.94, b), a: 1 - seg(p, 0.525, 0.548), dim: 0.5 * b };
    }

    function draw() {
      if (!bg) return;
      var p = cur;
      var aw = Math.max(1, W - IN.l - IN.r), ah = Math.max(1, H - IN.t - IN.b);
      var cam = cameraAt(L, p), s = Math.min(aw / cam[2], ah / cam[3]);
      var ox = IN.l + aw / 2, oy = IN.t + ah / 2;
      TZ.min = 9.5 / s; TZ.on = false;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(bg, 0, 0);
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (ox - cam[0] * s), dpr * (oy - cam[1] * s));
      ctx.textBaseline = 'alphabetic';
      grid(cam, s, ox, oy);

      // --- A: locker + documents on the desk ---
      var states = DOCS.map(function (d) { return docState(d, p); });
      if (p < 0.24) {
        var lx = inCubic(seg(p, 0.15, 0.22)), lo = L.locker;
        var open = smooth(seg(p, 0.005, 0.03)) * (1 - smooth(seg(p, 0.13, 0.16)));
        place(lo.x - lx * 80, lo.y + lx * 420, -lx * 0.05, 1, 1 - seg(p, 0.17, 0.22));
        drawLocker(ctx, lo, open, T); ctx.restore();
      }
      // documents resting on the desk (under the ledger)
      DOCS.forEach(function (d, i) {
        var st = states[i];
        if (st.a <= 0 || st.fly) return;
        place(st.x, st.y, st.r, st.s, st.a); drawDoc(ctx, d, st.z); ctx.restore();
      });

      // --- B/C: ledger ---
      if (p > 0.14 && p < 0.56) {
        var lg = ledgerState(p);
        var rowsT = LEDGER.map(function (r, i) {
          var land = i < 5 ? 0.175 + i * 0.026 + 0.045 * 0.78 : 0.298 + (i - 5) * 0.01;
          return { show: seg(p, land - 0.004, land + 0.016), flash: bump(seg(p, land - 0.006, land + 0.03)) };
        });
        var count = Math.round(37 * smooth(seg(p, 0.18, 0.35)));
        place(lg.x, lg.y, lg.r, lg.s, lg.a);
        TZ.on = true; drawLedger(ctx, p, rowsT, count); TZ.on = false;
        if (lg.dim > 0) { ctx.fillStyle = 'rgba(238,240,242,' + lg.dim.toFixed(3) + ')'; rr(ctx, -LW / 2, -LH / 2, LW, LH, 3); ctx.fill(); }
        ctx.restore();
      }
      // documents in flight (above everything of scene A/B)
      DOCS.forEach(function (d, i) {
        var st = states[i];
        if (st.a <= 0 || !st.fly) return;
        place(st.x, st.y, st.r, st.s, st.a); drawDoc(ctx, d, st.z); ctx.restore();
      });

      // --- C: payroll + calendar ---
      if (p > 0.34 && p < 0.575) {
        var e = outCubic(seg(p, 0.35, 0.405)), x1 = inOut(seg(p, 0.505, 0.548));
        place(L.pay.x + (1 - e) * 640 - x1 * 140, L.pay.y + (1 - e) * 60 - x1 * 820, (1 - e) * 0.07 - x1 * 0.06, 1, 1 - seg(p, 0.525, 0.548));
        TZ.on = true; drawPayroll(ctx, p); TZ.on = false; ctx.restore();
        var ce = outBack(seg(p, 0.40, 0.435), 1.2), x2 = inOut(seg(p, 0.502, 0.54));
        if (ce > 0) {
          place(L.cal.x + x2 * 90, L.cal.y - x2 * 700, 0.04 - (1 - ce) * 0.08 + x2 * 0.1, lerp(0.85, 1, ce), clamp(ce * 1.5, 0, 1) * (1 - seg(p, 0.52, 0.54)));
          TZ.on = true; drawCalendar(ctx, p, L.narrow); TZ.on = false; ctx.restore();
        }
      }

      // --- D: declarations ---
      if (p > 0.515 && p < 0.72) {
        var F = L.forms, out = inOut(seg(p, 0.684, 0.716));
        for (var k = 0; k < FORMS.length; k++) {
          var ein = outCubic(seg(p, 0.522 + k * 0.006, 0.558 + k * 0.006));
          var fx = F.x + k * F.dx, fy = F.y + k * F.dy;
          var imp = 0.568 + k * 0.032, stampK = seg(p, imp - 0.008, imp + 0.012);
          var kick = stampK > 0.4 && stampK < 1 ? Math.sin((stampK - 0.4) / 0.6 * PI) * 3 * (1 - stampK) : 0;
          place(fx + (1 - ein) * (220 + k * 40) - out * (520 + k * 30), fy + (1 - ein) * 680 + kick + out * 160,
                (1 - ein) * (0.12 - k * 0.02) + (k - 2) * 0.012 - out * 0.12, 1, clamp(ein * 2, 0, 1) * (1 - seg(p, 0.698, 0.716)));
          TZ.on = true; drawForm(ctx, FORMS[k], k, stampK); TZ.on = false;
          ctx.restore();
        }
        var se = outCubic(seg(p, 0.535, 0.57));
        place(0, (1 - se) * 140 + out * 120, 0, 1, se * (1 - seg(p, 0.686, 0.708)));
        TZ.on = true; drawStrip(ctx, L, p); TZ.on = false; ctx.restore();
      }

      // --- E: balance sheet ---
      if (p > 0.68 && p < 0.9) {
        var be = outCubic(seg(p, 0.702, 0.748)), fade = 1 - seg(p, 0.86, 0.892);
        place(L.bil.x + (1 - be) * 360, L.bil.y + (1 - be) * 640, (1 - be) * 0.08, 1, clamp(be * 1.5, 0, 1) * fade);
        TZ.on = true; drawBilance(ctx, p, 1 - seg(p, 0.856, 0.875), p < 0.86); TZ.on = false;
        ctx.restore();
      }

      // --- F: ornament + overview ---
      if (p >= 0.86) {
        ctx.globalAlpha = 1;
        drawOrnament(ctx, L, G, p, T);
        for (var j = 0; j < 3; j++) {
          var ct = seg(p, 0.90 + j * 0.014, 0.94 + j * 0.014);
          if (ct <= 0) continue;
          var ps = L.cards[j], ob = outBack(ct, 1.3);
          place(ps.x, ps.y + (1 - ob) * 34, (j - 1) * 0.012 * (1 - ct), lerp(0.86, 1, ob), clamp(ct * 2, 0, 1));
          TZ.on = true; drawCard(ctx, L.cardW, L.cardH, j, outCubic(seg(p, 0.915 + j * 0.014, 0.975)), T, L.narrow); TZ.on = false;
          ctx.restore();
        }
      }

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
        T += dt;
      }
      draw();
      if (!reduce || playing || cur !== target) start();
    }
    function finishPlay() {
      if (!playing) return;
      var pr = playing; playing = null; clearTimeout(pr.timer); target = 1; pr.resolve();
    }
    function start() { if (!raf && !paused && !destroyed) { raf = requestAnimationFrame(function (n) { frame(n); }); } }

    var ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', resize);
    resize();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!destroyed) draw(); });
    start();

    return {
      setProgress: function (p) { if (playing) return; target = clamp(+p || 0, 0, 1); last = 0; start(); },
      // jump without easing and render synchronously (initial frame, tests); t = optional ambient clock
      seek: function (p, t) { if (playing) finishPlay(); target = cur = clamp(+p || 0, 0, 1); vel = 0; if (t != null) T = +t; draw(); },
      play: function (sec) {
        sec = Math.max(0.1, +sec || 6);
        if (playing) finishPlay();
        return new Promise(function (res) {
          target = cur;
          playing = { start: null, dur: sec, resolve: res, from: cur };
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

  window.AUGStage = { mount: mount, MARK: MARK };
})();
