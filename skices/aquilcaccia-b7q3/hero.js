/* =================================================================
   Aquilcaccia hero
   Dusk clearing. Two setters on point, the flush, the shot,
   the run, the leap and the retrieve. One canvas, no libraries.
   ================================================================= */
(function(){
"use strict";
var cv=document.getElementById("sky"); if(!cv) return;
var ctx=cv.getContext("2d"), hero=cv.parentElement;
var RM=matchMedia("(prefers-reduced-motion:reduce)").matches;
var PI=Math.PI, TAU=PI*2;
function rnd(a,b){return a+Math.random()*(b-a)}
function lerp(a,b,t){return a+(b-a)*t}
function clamp(v,a,b){return v<a?a:v>b?b:v}
function sst(t){t=clamp(t,0,1);return t*t*(3-2*t)}

var W=0,H=0,DPR=1,G=0,U=50,side=false,skyTop=70;
var stage={x0:0,x1:0,s:0}, clr={a:0,b:0};
var layers=[], hillC=null, stars=[], amb=[], feathers=[], puffs=[], rings=[], leaves=[], drops=[];
var flash=0, time=0, last=0, running=true, px=0;
var reticle={x:0,y:0,a:0,t:0,on:false};
var dogs=[], fb=null, phase="point", phaseT=0, pointHold=2.4, loops=0;
var home={a:0,b:0,f:0};

var INK="#070b08", INK_FAR="#141c16", RIM="rgba(255,198,132,.5)";

/* ---------------------------------------------------------------
   layout: where the text is, where the stage can live
   --------------------------------------------------------------- */
function textBounds(){
  var hr=hero.getBoundingClientRect(), top=1e9, right=0;
  var els=hero.querySelectorAll(".hero-c .wrap > *");
  for(var i=0;i<els.length;i++){
    var el=els[i], r;
    if(el.tagName==="H1"||el.tagName==="P"){ var rg=document.createRange(); rg.selectNodeContents(el); r=rg.getBoundingClientRect(); }
    else r=el.getBoundingClientRect();
    if(!r.width) continue;
    var off=(el.classList.contains("rv")&&!el.classList.contains("in"))?28:0, rr=r.right;
    if(el.children.length>1 && el.lastElementChild) rr=el.lastElementChild.getBoundingClientRect().right;
    top=Math.min(top,r.top-hr.top-off); right=Math.max(right,rr-hr.left);
  }
  if(top>1e8){ top=H*.5; right=W*.6; }
  return {top:top,right:right};
}
function groundY(x){ var k=U/50; return G + (5*Math.sin(x*.011+1.3) + 3*Math.sin(x*.027+.4))*k; }

function resize(){
  DPR=Math.min(2,window.devicePixelRatio||1);
  W=cv.clientWidth; H=cv.clientHeight; if(!W||!H) return;
  cv.width=Math.round(W*DPR); cv.height=Math.round(H*DPR); ctx.setTransform(DPR,0,0,DPR,0,0);
  var tb=textBounds();
  side = W>=900 && (W-tb.right)>=430;
  if(side){ stage.x0=tb.right+30; stage.x1=W-26; G=Math.round(H*.6); }
  else { stage.x0=8; stage.x1=W-8; G=Math.round(clamp(tb.top-18, 176, H*.6)); }
  stage.s=stage.x1-stage.x0;
  U = side ? clamp(stage.s/9.6,50,84) : clamp(stage.s/9.2,38,60);
  skyTop = side?84:66;
  if(side){ clr.a=stage.x0+stage.s*.03; clr.b=stage.x0+stage.s*.95; }
  else { clr.a=W*.1; clr.b=W*.9; }
  home.b=stage.x0+stage.s*(side?.07:.06);
  home.a=stage.x0+stage.s*(side?.31:.385);
  home.f=stage.x0+stage.s*(side?.5:.6);
  buildLayers(); buildHill();
  stars=[]; var ns=Math.round(W*G/9000);
  for(var i=0;i<ns;i++) stars.push({x:Math.random()*W,y:Math.random()*G*.7,r:Math.random()*1.1+.2,p:Math.random()*6});
  amb=[]; var n=W<700?2:3; while(amb.length<n) amb.push(newAmb(true));
  resetScene();
}

/* ---------------------------------------------------------------
   forest: three treelines that open into a clearing over the stage
   --------------------------------------------------------------- */
function gap(x,a,b,ramp){ if(x<a) return sst((a-x)/ramp); if(x>b) return sst((x-b)/ramp); return 0; }
function buildLayers(){
  var m=Math.min(W*1.1,H);
  var defs=[
    {dy:2, h:.15,col:"#2c3a2e",dens:22,pine:.6, par:.010,mk:function(x){return lerp(.42,1,gap(x,clr.a,clr.b,W*.14))}},
    {dy:3, h:.24,col:"#1a261d",dens:16,pine:.75,par:.020,mk:function(x){return gap(x,clr.a-W*.01,clr.b+W*.01,W*.11)}},
    {dy:5, h:.36,col:"#0d1610",dens:11,pine:.85,par:.032,mk:function(x){return gap(x,clr.a-W*.05,clr.b+W*.05,W*.07)}}
  ];
  layers=defs.map(function(d){
    var c=document.createElement("canvas"), w=Math.ceil(W*1.15), h=Math.ceil(G+40);
    c.width=Math.round(w*DPR); c.height=Math.round(h*DPR);
    var g=c.getContext("2d"); g.scale(DPR,DPR); g.fillStyle=d.col;
    var base=G+d.dy, th=m*d.h, x=0;
    g.beginPath(); g.moveTo(0,h); g.lineTo(0,base);
    while(x<w){
      var tw=rnd(.5,1.2)*(W/d.dens), cx=x+tw/2, k=d.mk(cx-W*.075), tht=th*rnd(.45,1)*k;
      if(tht<7){ g.lineTo(x,base); g.lineTo(x+tw,base); x+=tw*rnd(.55,.9); continue; }
      if(Math.random()<d.pine){
        var top=base-tht, tiers=5, i, yy, half;
        g.lineTo(x,base);
        for(i=0;i<tiers;i++){ yy=top+(tht*(i+1)/tiers); half=(tw/2)*((i+1)/tiers)*1.05; g.lineTo(cx-half,yy); g.lineTo(cx-half*.45,yy-tht/tiers*.35); }
        g.lineTo(cx,top-4);
        for(i=tiers-1;i>=0;i--){ yy=top+(tht*(i+1)/tiers); half=(tw/2)*((i+1)/tiers)*1.05; g.lineTo(cx+half*.45,yy-tht/tiers*.35); g.lineTo(cx+half,yy); }
        g.lineTo(x+tw,base);
      } else {
        var r=tw*.62, tp=base-tht*.75;
        g.lineTo(x,base); g.quadraticCurveTo(x-r*.2,tp+r*.6,cx-r*.5,tp+r*.25); g.quadraticCurveTo(cx,tp-r*.45,cx+r*.5,tp+r*.2); g.quadraticCurveTo(x+tw+r*.2,tp+r*.6,x+tw,base);
      }
      x+=tw*rnd(.55,.9);
    }
    g.lineTo(w,base); g.lineTo(w,h); g.closePath(); g.fill();
    return {c:c,w:w,h:h,par:d.par};
  });
}
/* the ground the dogs stand on: a dark rise with grass, ferns and one bush */
function buildHill(){
  hillC=document.createElement("canvas"); hillC.width=Math.round(W*DPR); hillC.height=Math.round(H*DPR);
  var g=hillC.getContext("2d"); g.scale(DPR,DPR);
  var k=U/50, x, gr=g.createLinearGradient(0,G-10,0,H);
  gr.addColorStop(0,"#0b130d"); gr.addColorStop(.35,"#0a110c"); gr.addColorStop(1,"#0a100c");
  g.fillStyle=gr; g.beginPath(); g.moveTo(0,H);
  for(x=0;x<=W+4;x+=4) g.lineTo(x,groundY(x));
  g.lineTo(W,H); g.closePath(); g.fill();
  // grass along the crest
  g.fillStyle="#0b130d";
  for(x=-4;x<W+4;x+=rnd(2.2,5)){
    var gy=groundY(x), hh=rnd(3,10)*k, lean=rnd(-3,3)*k, bw=rnd(1.2,2.4)*k;
    g.beginPath(); g.moveTo(x-bw,gy+2); g.quadraticCurveTo(x+lean*.3,gy-hh*.6,x+lean,gy-hh); g.quadraticCurveTo(x+lean*.5,gy-hh*.4,x+bw,gy+2); g.closePath(); g.fill();
  }
  // fern clumps; the largest one hides the bird
  var spots=[[home.f,1.5]], n=Math.max(3,Math.round(stage.s/170)), i;
  for(i=0;i<n;i++) spots.push([stage.x0+stage.s*rnd(.02,.98), rnd(.5,.95)]);
  spots.forEach(function(sp){
    var cx=sp[0], sc=sp[1]*k, gy=groundY(cx), fr=Math.round(7+sp[1]*5), j;
    if(sc<1.2*k && Math.abs(cx-home.f)<U*1.3) return;
    for(j=0;j<fr;j++){
      var a=lerp(-1.25,1.25,j/(fr-1))+rnd(-.08,.08), len=rnd(17,27)*sc*(1-.3*Math.abs(a)/1.25), ex=cx+Math.sin(a)*len, ey=gy-Math.cos(a)*len, wd=3.4*sc;
      g.beginPath(); g.moveTo(cx-wd,gy+3); g.quadraticCurveTo(cx+Math.sin(a)*len*.3-wd,gy-Math.cos(a)*len*.75,ex,ey); g.quadraticCurveTo(cx+Math.sin(a)*len*.5+wd,gy-Math.cos(a)*len*.5,cx+wd,gy+3); g.closePath(); g.fill();
    }
  });
}

/* ---------------------------------------------------------------
   woodcock
   --------------------------------------------------------------- */
function wing(s,f,off){
  var up=f*1.9*s;
  ctx.beginPath(); ctx.moveTo(.35*s,-.15*s+off*s);
  ctx.bezierCurveTo(.25*s,-.15*s-up*.6,-.15*s,-.1*s-up*1.05,-.7*s,-.05*s-up);
  ctx.bezierCurveTo(-.95*s,-.02*s-up*.9,-.75*s,-.05*s-up*.45,-.45*s,0+off*s);
  ctx.closePath(); ctx.fill();
}
function drawWoodcock(b){
  ctx.save(); ctx.translate(b.x,b.y); var dir=b.vx<0?-1:1; ctx.scale(dir,1); ctx.rotate((b.rot||0)*dir);
  var s=b.s, w=b.fall?-.25:Math.sin(b.ph);
  ctx.fillStyle="#0a0f0b";
  ctx.globalAlpha=.75; wing(s,w*.85,.15); ctx.globalAlpha=1;
  ctx.beginPath(); ctx.moveTo(-.9*s,-.05*s); ctx.lineTo(-1.55*s,-.2*s); ctx.lineTo(-1.5*s,.25*s); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0,0,1.05*s,.55*s,-.08,0,TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(.95*s,-.22*s,.42*s,0,TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(1.25*s,-.24*s); ctx.lineTo(2.55*s,.12*s); ctx.lineTo(2.5*s,.2*s); ctx.lineTo(1.22*s,-.02*s); ctx.closePath(); ctx.fill();
  wing(s,w,0);
  ctx.restore();
}
function newAmb(init){
  var fromLeft=Math.random()<.75, s=rnd(W<700?4.5:5.5,W<700?6.5:8.5), lo=Math.max(skyTop+30,G-U*3.4);
  return {x:init?rnd(-.1,1)*W:(fromLeft?-50:W+50), y:rnd(skyTop+8,lo), vx:(fromLeft?1:-1)*rnd(48,84)*(W<700?.8:1), s:s, ph:Math.random()*6, f:rnd(9,12), amp:rnd(5,12), alive:true, fall:false, vy:0, rot:0, id:Math.random()};
}

/* ---------------------------------------------------------------
   the dog: a small skeleton drawn as a backlit silhouette.
   Units: 1 = height at the withers. x forward, y down, 0 = ground.
   Leg angles are measured from straight down, positive = forward.
   --------------------------------------------------------------- */
var FLN=[.27,.33,.22], HLN=[.37,.37,.31], FW=[.085,.062,.04,.034], HW=[.14,.085,.045,.036];
var TORSO=[[.44,-.29],[.08,-.24],[-.4,-.255],[-.7,-.17],[-.76,.04],[-.56,.2],[-.24,.1],[.16,.33],[.5,.3],[.68,.04],[.62,-.2]];
function P(o){
  var p={by:0,air:0,pitch:0,stretch:1,neck:.85,head:-.15,jaw:0,tail:-.6,ear:0,
         fl:[-.45,.05,.12],fr:[-.38,.02,.12],hl:[.5,-.85,.05],hr:[.42,-.8,.08],ground:1};
  for(var k in o) p[k]=o[k]; return p;
}
function mixP(a,b,t){
  var r={}, k, x, y;
  for(k in a){ x=a[k]; y=b[k]; r[k]=(x&&x.length)?[lerp(x[0],y[0],t),lerp(x[1],y[1],t),lerp(x[2],y[2],t)]:lerp(x,y,t); }
  return r;
}
var STAND=P({});
var POINT=P({pitch:-.03,stretch:1.03,neck:.2,head:.03,tail:.1,fl:[.32,.9,-.7],fr:[-.52,-.02,.1],hl:[.3,-.95,-.12],hr:[.44,-.86,0]});
var BACK =P({pitch:-.02,stretch:1.02,neck:.36,head:0,tail:.3,fl:[-.3,.1,.14],fr:[-.5,0,.1],hl:[.32,-.93,-.1],hr:[.46,-.84,.02]});
var CROUCH=P({pitch:-.08,stretch:.97,neck:.3,head:.08,tail:.22,fl:[-.62,.3,.2],fr:[-.5,.22,.2],hl:[.85,-1.12,.12],hr:[.72,-1.05,.14]});
var PROUD=P({neck:1.08,head:.1,tail:.95,jaw:.3,fl:[-.4,.05,.12],fr:[-.34,.02,.12]});
var TURN =P({stretch:.9,neck:.8,head:-.05,tail:.5,fl:[-.2,.1,.12],fr:[-.5,0,.1],hl:[.65,-.95,.1],hr:[.4,-.8,.08]});
var LEAP=[
  [0,  P({ground:0,by:-.04,pitch:.32,stretch:1.06,neck:.75,head:.25,jaw:.15,tail:.28,fl:[.55,1.25,-.5],fr:[.7,1.3,-.35],hl:[-.55,-1.15,-.6],hr:[-.35,-1.0,-.45]})],
  [.26,P({ground:0,by:-.04,pitch:.44,stretch:1.09,neck:.95,head:.36,jaw:.95,tail:.1,fl:[.75,1.35,.2],fr:[.9,1.4,.4],hl:[-.7,-1.25,-.8],hr:[-.55,-1.15,-.65]})],
  [.5, P({ground:0,by:-.04,pitch:.22,stretch:1.05,neck:1.0,head:.3,jaw:.3,tail:.02,fl:[.8,1.2,.5],fr:[.95,1.25,.6],hl:[-.45,-1.2,-.5],hr:[-.25,-1.1,-.35]})],
  [.78,P({ground:0,by:-.04,pitch:-.28,stretch:1.0,neck:.75,head:0,jaw:.1,tail:.45,fl:[.75,.75,.65],fr:[.9,.85,.75],hl:[.5,-1.35,.2],hr:[.7,-1.3,.3]})],
  [1,  P({ground:0,by:0,pitch:-.12,stretch:.97,neck:.7,head:.02,jaw:.1,tail:.4,fl:[.2,.25,.3],fr:[.45,.5,.5],hl:[.9,-.9,.5],hr:[1.05,-.6,.6]})]
];
function leapPose(t){
  for(var i=1;i<LEAP.length;i++) if(t<=LEAP[i][0]) return mixP(LEAP[i-1][1],LEAP[i][1],sst((t-LEAP[i-1][0])/(LEAP[i][0]-LEAP[i-1][0])));
  return LEAP[LEAP.length-1][1];
}
function frontLeg(t){ var s=Math.sin(t), f=Math.pow(Math.max(0,Math.cos(t)),.8); return [-.2+.72*s+.45*f, .05+.85*s+1.15*f, .15+.7*s-.9*f]; }
function hindLeg(t){ var s=Math.sin(t), f=Math.pow(Math.max(0,Math.cos(t)),.8); return [.3+.95*s+.3*f, -.6+.75*s-.7*f, -.05+.7*s+.35*f]; }
function gallop(ph){
  var tf=ph+PI*.9;
  return {by:0,air:.05+.07*Math.max(0,Math.sin(ph*2+1.2)),pitch:.1*Math.sin(ph+1.2),stretch:1-.07*Math.sin(ph),
    neck:.5+.08*Math.sin(ph+1),head:.05,jaw:.12,tail:.2+.18*Math.sin(ph+2),ear:.75+.4*Math.sin(ph+2.5),
    fl:frontLeg(tf+.28),fr:frontLeg(tf-.28),hl:hindLeg(ph+.25),hr:hindLeg(ph-.25),ground:1};
}
function mix3(a,b,t){ return [lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)]; }
function trot(ph,k,o){
  var p={by:0,air:.02*Math.abs(Math.sin(ph)),pitch:.015*Math.sin(ph*2),stretch:1,neck:.95,head:.05,jaw:0,tail:.8,ear:.25+.2*Math.sin(ph*2),
    fl:mix3(STAND.fl,frontLeg(ph),k),hr:mix3(STAND.hr,hindLeg(ph+.2),k),fr:mix3(STAND.fr,frontLeg(ph+PI),k),hl:mix3(STAND.hl,hindLeg(ph+PI+.2),k),ground:1};
  if(o) for(var q in o) p[q]=o[q];
  return p;
}
function leg(o,L,a){
  var x1=o[0]+L[0]*Math.sin(a[0]), y1=o[1]+L[0]*Math.cos(a[0]);
  var x2=x1+L[1]*Math.sin(a[1]), y2=y1+L[1]*Math.cos(a[1]);
  var x3=x2+L[2]*Math.sin(a[2]), y3=y2+L[2]*Math.cos(a[2]);
  return [o[0],o[1],x1,y1,x2,y2,x3,y3];
}
function rig(p){
  var py=-.78+p.by, c=Math.cos(p.pitch), s=Math.sin(p.pitch), st=p.stretch;
  function T(x,y){ x*=st; return [x*c+y*s, py-x*s+y*c]; }
  var S=T(.36,-.02), Hp=T(-.4,-.1), NB=T(.47,-.16), TB=T(-.6,-.15), r={T:T,NB:NB,TB:TB};
  r.fl=leg(S,FLN,p.fl); r.fr=leg([S[0]+.035,S[1]-.012],FLN,p.fr);
  r.hl=leg(Hp,HLN,p.hl); r.hr=leg([Hp[0]+.045,Hp[1]-.012],HLN,p.hr);
  var na=p.neck+p.pitch*.7; r.na=na; r.Hd=[NB[0]+.4*Math.cos(na), NB[1]-.4*Math.sin(na)];
  var ha=p.head+p.pitch*.4; r.ha=ha; r.f=[Math.cos(ha),-Math.sin(ha)];
  var ta=p.tail+p.pitch; r.tip=[TB[0]-.62*Math.cos(ta), TB[1]-.62*Math.sin(ta)];
  var low=Math.max(r.fl[7],r.fr[7],r.hl[7],r.hr[7])+.035;
  r.shift=(p.ground>.5?-low:Math.min(0,-low))-(p.air||0);
  r.mouth=[r.Hd[0]+r.f[0]*.3+r.f[1]*-.045, r.Hd[1]+r.f[1]*.3+r.f[0]*.045+.1+r.shift];
  return r;
}
function blob(pts){
  var n=pts.length, a=pts[n-1], b=pts[0], i, p, q;
  ctx.beginPath(); ctx.moveTo((a[0]+b[0])/2,(a[1]+b[1])/2);
  for(i=0;i<n;i++){ p=pts[i]; q=pts[(i+1)%n]; ctx.quadraticCurveTo(p[0],p[1],(p[0]+q[0])/2,(p[1]+q[1])/2); }
  ctx.closePath(); ctx.fill();
}
/* a limb as a soft tube: joints with a radius each, skinned and smoothed */
function tube(P,R){
  var n=P.length, L=[], Rt=[], i, ax, ay, bx, by, l;
  for(i=0;i<n;i++){
    ax=(i>0?P[i][0]-P[i-1][0]:P[1][0]-P[0][0]); ay=(i>0?P[i][1]-P[i-1][1]:P[1][1]-P[0][1]); l=Math.sqrt(ax*ax+ay*ay)||1; ax/=l; ay/=l;
    bx=(i<n-1?P[i+1][0]-P[i][0]:ax); by=(i<n-1?P[i+1][1]-P[i][1]:ay); l=Math.sqrt(bx*bx+by*by)||1; bx/=l; by/=l;
    var tx=ax+bx, ty=ay+by; l=Math.sqrt(tx*tx+ty*ty)||1; tx/=l; ty/=l;
    var k=R[i]/Math.max(.55,ax*tx+ay*ty);
    L.push([P[i][0]-ty*k,P[i][1]+tx*k]); Rt.push([P[i][0]+ty*k,P[i][1]-tx*k]);
  }
  var e=P[n-1], d=[e[0]-P[n-2][0],e[1]-P[n-2][1]]; l=Math.sqrt(d[0]*d[0]+d[1]*d[1])||1;
  L.push([e[0]+d[0]/l*R[n-1],e[1]+d[1]/l*R[n-1]]);
  blob(L.concat(Rt.reverse()));
}
function mid(a,b,t){ return [lerp(a[0],b[0],t),lerp(a[1],b[1],t)]; }
/* soft feathering: a smooth sliver of hair hanging off a line */
function sliver(a,b,gx,gy,d1,d2){
  blob([a, mid(a,b,.5), b, [lerp(a[0],b[0],.72)+gx*d2, lerp(a[1],b[1],.72)+gy*d2], [lerp(a[0],b[0],.3)+gx*d1, lerp(a[1],b[1],.3)+gy*d1]]);
}
function drawLeg(j,hind){
  var a=[j[0],j[1]], b=[j[2],j[3]], c=[j[4],j[5]], e=[j[6],j[7]];
  var dx=e[0]-c[0], dy=e[1]-c[1], l=Math.sqrt(dx*dx+dy*dy)||1, px=dy/l, py=-dx/l;
  if(hind){
    tube([a, mid(a,b,.5), b, mid(b,c,.5), c, mid(c,e,.55), e], [.17,.15,.1,.07,.05,.038,.036]);
  } else {
    tube([a, b, mid(b,c,.5), c, e], [.1,.07,.05,.04,.034]);
    sliver([b[0]-px*.05,b[1]-py*.05], [c[0]-px*.03,c[1]-py*.03], -px*.8-.1,-py*.8+.5, .075,.06);
  }
  ctx.beginPath(); ctx.ellipse(e[0]+px*.04,e[1]+py*.04-.004,.072,.04,Math.atan2(py,px),0,TAU); ctx.fill();
}
function drawDog(d){
  var p=d.pose, r=rig(p), T=r.T, f=r.f, up=[f[1],-f[0]], Hd=r.Hd, NB=r.NB, TB=r.TB;
  var fs=d.face<0?-1:1, fa=Math.max(.06,Math.abs(d.face));
  function at(o,a,b,c,e){ return [o[0]+a[0]*b+c[0]*e, o[1]+a[1]*b+c[1]*e]; }
  ctx.save(); ctx.translate(d.x, groundY(d.x)+d.jy); ctx.scale(fs*fa*d.u, d.u); ctx.translate(0,r.shift);
  ctx.lineCap="round"; ctx.lineJoin="round";
  // far legs
  ctx.fillStyle=INK_FAR; drawLeg(r.fr,0); drawLeg(r.hr,1);
  ctx.fillStyle=INK;
  // tail: a fine, tapering line with the setter's flag of silky hair under it
  var tx=r.tip[0]-TB[0], ty=r.tip[1]-TB[1], tl=Math.sqrt(tx*tx+ty*ty)||1; tx/=tl; ty/=tl; var nx=ty, ny=-tx; if(ny<0){ nx=-nx; ny=-ny; }
  var t0=[TB[0]+.12,TB[1]+.02];
  function tp(t,o){ return [TB[0]+tx*tl*t+nx*o, TB[1]+ty*tl*t+ny*o]; }
  var hang=clamp(.5+ny*.5,0,1), gx=lerp(nx,-.1,.5*hang), gy=lerp(ny,1,.5*hang);
  function fl(t,dp){ var q=tp(t,.01); return [q[0]+gx*dp,q[1]+gy*dp]; }
  blob([[t0[0]-nx*.04,t0[1]-ny*.04], tp(.3,-.03), tp(.7,-.018), r.tip, r.tip, fl(.88,.035), fl(.7,.085), fl(.5,.12), fl(.32,.14), fl(.16,.11), [t0[0]+nx*.06,t0[1]+ny*.06]]);
  // torso, with the mass of the shoulder and the haunch
  blob(TORSO.map(function(q){return T(q[0],q[1])}));
  var sh=T(.37,.03), hn=T(-.45,-.01);
  ctx.beginPath(); ctx.ellipse(sh[0],sh[1],.19,.24,-p.pitch,0,TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hn[0],hn[1],.25,.22,-p.pitch,0,TAU); ctx.fill();
  var c1=T(.56,.16), c2=T(.12,.3); sliver(c1,c2,-.2,1,.07,.08);
  // neck and head as one soft outline: arched neck, clear stop, long square muzzle
  var nd=[Math.cos(r.na),-Math.sin(r.na)], nn=[nd[1],-nd[0]], nm=mid(NB,Hd,.5);
  var nTopA=at(NB,nn,.2,nd,-.24), nTopM=at(nm,nn,.14,nd,0), sk=at(Hd,f,.0,up,.132), st=at(Hd,f,.16,up,.07), mTop=at(Hd,f,.48,up,.056);
  blob([nTopA, nTopM, at(Hd,f,-.13,up,.09), sk, at(Hd,f,.09,up,.115), st, at(Hd,f,.3,up,.055), mTop, mTop, at(Hd,f,.512,up,.03), at(Hd,f,.505,up,-.025), at(Hd,f,.505,up,-.025),
        at(Hd,f,.2,up,-.03), at(Hd,f,-.02,up,-.09), at(nm,nn,-.125,nd,.02), at(NB,nn,-.26,nd,.06), at(NB,nn,-.14,nd,-.3)]);
  var jaw=Math.max(p.jaw, d.carry?.3:0), ja=r.ha-jaw*.6, f2=[Math.cos(ja),-Math.sin(ja)], u2=[f2[1],-f2[0]], Hh=at(Hd,f,.03,up,-.02);
  blob([at(Hh,f2,-.06,u2,.03), at(Hh,f2,.2,u2,.012), at(Hh,f2,.465,u2,.0), at(Hh,f2,.47,u2,-.035), at(Hh,f2,.41,u2,-.075), at(Hh,f2,.3,u2,-.092), at(Hh,f2,.12,u2,-.095), at(Hh,f2,-.08,u2,-.09)]);
  // long, low-set ear with soft hair
  var ea=p.ear+.1, ev=[-Math.sin(ea),Math.cos(ea)], en=[ev[1],-ev[0]], eb=at(Hd,f,-.07,up,.03);
  blob([at(eb,ev,-.02,en,.07), at(eb,ev,.14,en,.095), at(eb,ev,.3,en,.06), at(eb,ev,.36,en,-.01), at(eb,ev,.27,en,-.075), at(eb,ev,.1,en,-.08), at(eb,ev,-.03,en,-.05)]);
  // near legs
  drawLeg(r.fl,0); drawLeg(r.hl,1);
  // the bird, carried: limp, head down
  if(d.carry){
    var m=at(Hd,f,.3,up,-.045), sw=.14*Math.sin(time*7+d.x*.05);
    ctx.save(); ctx.translate(m[0],m[1]); ctx.rotate(PI*.5-.2+sw); ctx.translate(-.1,0); ctx.fillStyle="#0a0f0b";
    ctx.beginPath(); ctx.ellipse(.14,0,.19,.092,0,0,TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(.36,.012,.066,0,TAU); ctx.fill();
    poly([[.4,-.012],[.66,.035],[.4,.04]]);
    poly([[.02,.03],[.2,.26],[.36,.3],[.24,.06]]);
    poly([[-.02,-.05],[-.14,-.07],[-.13,.04]]);
    ctx.restore();
  }
  // warm light on the back, from the sun behind
  ctx.strokeStyle=RIM; ctx.lineWidth=.02; ctx.beginPath();
  var a=T(-.6,-.19), b=T(-.3,-.262), c=T(.1,-.246), e=T(.36,-.29), q1=tp(.5,-.035);
  ctx.moveTo(r.tip[0],r.tip[1]); ctx.quadraticCurveTo(q1[0],q1[1],t0[0]-nx*.04,t0[1]-ny*.04); ctx.lineTo(a[0],a[1]); ctx.quadraticCurveTo(b[0],b[1],c[0],c[1]); ctx.quadraticCurveTo(e[0],e[1],nTopA[0],nTopA[1]);
  ctx.quadraticCurveTo(nTopM[0],nTopM[1],sk[0],sk[1]); ctx.quadraticCurveTo(st[0],st[1]-.02,mTop[0],mTop[1]); ctx.stroke();
  ctx.restore();
}
function poly(pts){ ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]); for(var i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]); ctx.closePath(); ctx.fill(); }

/* ---------------------------------------------------------------
   dog as an actor: a queue of small actions
   --------------------------------------------------------------- */
function Dog(x,idle){ this.x=x; this.dir=1; this.face=1; this.jy=0; this.ph=0; this.u=U; this.pose=mixP(idle,idle,0); this.idle=idle; this.q=[]; this.cur=null; this.carry=false; this.watch=0; }
Dog.prototype.next=function(){
  var a=this.q.shift()||{k:"hold",pose:this.idle,d:Infinity};
  a.t=0; a.x0=this.x; a.d0=this.dir; this.cur=a;
  if(a.k==="run"){ var dist=a.to-this.x; a.dist=dist; a.D=a.d||Math.max(.12, Math.abs(dist)*(a.prof==="in"||a.prof==="out"?1.6:a.prof==="io"?1.5:1)/(a.v*U)); }
  if(a.k==="call"){ a.fn(this); this.next(); }
};
Dog.prototype.idleNow=function(){ return this.cur && this.cur.k==="hold" && this.cur.d===Infinity && !this.q.length; };
Dog.prototype.update=function(dt){
  if(!this.cur) this.next();
  var a=this.cur, tgt, rate=14, p, e;
  a.t+=dt;
  if(a.k==="hold"){
    tgt=typeof a.pose==="function"?a.pose(a.t,this):a.pose; rate=a.rate||10;
    if(a.t>=a.d){ this.next(); }
  } else if(a.k==="run"){
    p=clamp(a.t/a.D,0,1);
    e=a.prof==="in"?Math.pow(p,1.6):a.prof==="out"?1-Math.pow(1-p,1.6):a.prof==="io"?sst(p):p;
    var nx=a.x0+a.dist*e, stride=a.gait==="gallop"?2.35:a.gait==="trot"?1.25:.8;
    this.ph+=Math.abs(nx-this.x)/(stride*U)*TAU; this.x=nx;
    if(a.gait==="gallop"){ tgt=gallop(this.ph); rate=30; }
    else if(a.gait==="trot"){ tgt=trot(this.ph,.42,{tail:.85+.3*Math.sin(time*11)}); rate=22; }
    else { tgt=trot(this.ph,.3,{neck:.3,head:.02,tail:.15,pitch:-.03}); rate=16; }
    if(p>=1) this.next();
  } else if(a.k==="leap"){
    p=clamp(a.t/a.d,0,1);
    this.x=a.x0+a.dx*p; this.jy=-a.h*Math.sin(PI*p);
    tgt=leapPose(p); rate=40;
    if(!a.fired && p>=.5){ a.fired=true; if(a.onApex) a.onApex(this); }
    if(p>=1){ this.jy=0; this.ph=PI*.3; this.next(); }
  } else if(a.k==="turn"){
    p=clamp(a.t/a.d,0,1); this.face=a.d0*Math.cos(PI*p); tgt=TURN; rate=18;
    if(p>=1){ this.dir=-a.d0; this.face=this.dir; this.next(); }
  }
  if(tgt){
    var k=1-Math.exp(-dt*rate);
    this.pose=mixP(this.pose,tgt,k);
    this.pose.ground=tgt.ground;
  }
};
function hold(pose,d,rate){ return {k:"hold",pose:pose,d:d,rate:rate}; }
function run(to,gait,v,prof,d){ return {k:"run",to:to,gait:gait,v:v,prof:prof,d:d}; }
function turn(){ return {k:"turn",d:.24}; }
function call(fn){ return {k:"call",fn:fn}; }
/* on point: frozen, only a tremor in the tail and the head following the bird */
function pointPose(base){
  return function(t,dog){
    var p=mixP(base,base,0);
    p.tail+=.014*Math.sin(time*21)+.01*Math.sin(time*2.3);
    p.stretch+=.004*Math.sin(time*2.1);
    p.neck+=dog.watch*.42; p.head+=dog.watch*.3;
    return p;
  };
}
function proudPose(t,dog){
  var p=mixP(PROUD,PROUD,0); p.tail+=.32*Math.sin(time*12); p.neck+=.03*Math.sin(time*3); return p;
}

/* ---------------------------------------------------------------
   the scene
   --------------------------------------------------------------- */
function resetScene(){
  var A=new Dog(home.a,POINT), B=new Dog(home.b,BACK);
  A.q=[hold(pointPose(POINT),Infinity)]; B.q=[hold(pointPose(BACK),Infinity)];
  dogs=[A,B]; fb=null; phase="point"; phaseT=0; pointHold=loops?rnd(1.7,2.5):2.3;
  feathers=[]; puffs=[]; rings=[]; leaves=[]; drops=[]; reticle.on=false; reticle.a=0;
}
function flush(){
  var k=U/50, gy=groundY(home.f);
  fb={x:home.f,y:gy-2,vx:60*k,vy:-330*k,s:(W<700?7.5:9)*Math.max(.9,k*.85),ph:0,f:19,t:0,alive:true,fall:false,rot:-.5,k:k,kx:clamp(Math.min(stage.s*.2,U*3.4)/(150*k),.3,1.3)};
  for(var i=0;i<12;i++){ var a=rnd(-1.2,1.2); leaves.push({x:home.f+rnd(-8,8)*k,y:gy-rnd(4,16)*k,vx:Math.sin(a)*rnd(40,150)*k,vy:-Math.cos(a)*rnd(60,190)*k,r:rnd(1.4,3)*k,rot:rnd(0,6),vr:rnd(-9,9),a:1}); }
  phase="flight"; phaseT=0; reticle.on=false;
}
function burst(x,y,s,n){
  for(var i=0;i<n;i++){ var a=rnd(0,TAU), sp=rnd(30,140); feathers.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-30,r:rnd(1.6,3.6)*(s/9),rot:rnd(0,6),vr:rnd(-6,6),a:1,c:Math.random()<.5?"#3a2c1e":"#6b5236",sw:rnd(1,3)}); }
}
function shoot(x,y,auto){
  flash=1; rings.push({x:x,y:y,r:4,a:.9});
  for(var i=0;i<7;i++) puffs.push({x:x+rnd(-6,6),y:y+rnd(-6,6),r:rnd(4,9),vr:rnd(14,26),a:.55,vx:rnd(-8,8),vy:rnd(-12,-2)});
  if(fb && fb.alive && phase==="flight"){
    var d=Math.sqrt((fb.x-x)*(fb.x-x)+(fb.y-y)*(fb.y-y));
    if(auto || d<Math.max(52,fb.s*6)){ burst(fb.x,fb.y,fb.s,24); startRetrieve(); return; }
  }
  var hit=null, best=1e9;
  amb.forEach(function(b){ if(!b.alive) return; var dd=Math.sqrt((b.x-x)*(b.x-x)+(b.y-y)*(b.y-y)); if(dd<Math.max(44,b.s*6)&&dd<best){ best=dd; hit=b; } });
  if(hit){ hit.alive=false; hit.fall=true; hit.vy=-40; hit.spin=rnd(2.5,5)*(Math.random()<.5?-1:1); burst(hit.x,hit.y,hit.s,16); }
}
/* the shot connected: plan the fall so that it ends in the dog's mouth */
var apexMouth=null;
function startRetrieve(){
  var A=dogs[0], B=dogs[1], b=fb;
  if(!apexMouth) apexMouth=rig(leapPose(.5)).mouth;
  b.alive=false; b.fall=true; phase="retrieve"; phaseT=0; reticle.on=false;
  var v=side?6.6:5.4, Tl=side?.62:.58, react=.17;
  var hj=clamp((G-b.y)*.42,.55*U,1.05*U);
  var cx=clamp(b.x+b.vx*.3, A.x+2.5*U, stage.x1-(side?2.1:1.25)*U);
  var bodyX=cx-apexMouth[0]*U, takeX=bodyX-v*U*Tl*.5;
  if(takeX<A.x+.5*U){ takeX=A.x+.5*U; bodyX=takeX+v*U*Tl*.5; cx=bodyX+apexMouth[0]*U; }
  var Tr=1.6*(takeX-A.x)/(v*U), Tf=react+Tr+Tl*.5;
  var cy=groundY(bodyX)+apexMouth[1]*U-hj;
  if(cy<b.y+6){ hj=Math.max(.3*U, groundY(bodyX)+apexMouth[1]*U-(b.y+6)); cy=groundY(bodyX)+apexMouth[1]*U-hj; }
  b.fx0=b.x; b.fy0=b.y; b.fx1=cx; b.fy1=cy; b.ft=0; b.fT=Tf; b.spin=rnd(5,8); b.vy0=-70*b.k;
  var landX=takeX+v*U*Tl, stopX=Math.max(landX+.4*U, Math.min(landX+1.5*U, stage.x1-.7*U));
  A.q=[hold(CROUCH,react,26), run(takeX,"gallop",v,"in"),
       {k:"leap",d:Tl,h:hj,dx:v*U*Tl,onApex:function(dog){ dog.carry=true; b.gone=true; burst(cx,cy,b.s,7); }},
       run(stopX,"gallop",v,"out"), turn(), run(home.a-.3*U,"trot",3.1,"io"), hold(proudPose,1.25,12),
       call(function(dog){ dog.carry=false; drops.push({x:dog.x-U*1.05,y:groundY(dog.x-U)-U*.06,a:1,s:b.s}); }),
       hold(STAND,.3,8), turn(), run(home.a,"stalk",1.15,"io"), hold(pointPose(POINT),Infinity,5)];
  var bStop=lerp(B.x,takeX,.72), bD=Math.max(.5,Tf-.34-.12);
  B.q=[hold(pointPose(BACK),.34), run(bStop,"gallop",5.6,"io",bD),
       {k:"leap",d:.44,h:.42*U,dx:.25*U}, hold(STAND,.2,12), {k:"leap",d:.4,h:.3*U,dx:.1*U}, hold(STAND,.25,10),
       turn(), run(home.b-.25*U,"trot",2.9,"io"), hold(STAND,.9,8), turn(), run(home.b,"stalk",1.1,"io"), hold(pointPose(BACK),Infinity,5)];
  A.cur=null; B.cur=null;
}
function director(dt){
  phaseT+=dt;
  if(phase==="point"){
    if(!RM && phaseT>pointHold && dogs[0].idleNow() && dogs[1].idleNow()) flush();
  } else if(phase==="flight"){
    var b=fb, k=b.k;
    b.t+=dt; b.ph+=b.f*dt;
    b.vx=lerp(60,215,sst(b.t/.6))*k*b.kx; b.vy=-lerp(330,64,sst(b.t/1.0))*k;
    if(b.y<skyTop+26) b.vy=Math.max(b.vy,0);
    b.x+=(b.vx+Math.sin(b.t*9)*22*k)*dt; b.y+=b.vy*dt; b.rot=lerp(-.55,-.12,sst(b.t/.9));
    dogs[0].watch=dogs[1].watch=sst(b.t/.7);
    if(b.t>.2 && !reticle.on){ reticle.on=true; reticle.t=0; reticle.x=b.x-46*k; reticle.y=b.y+60*k; }
    if(reticle.on){
      reticle.t+=dt; reticle.a=Math.min(1,reticle.a+dt*4);
      var lead=b.vx*.1; reticle.x+=(b.x+lead-reticle.x)*Math.min(1,dt*7); reticle.y+=(b.y-reticle.y)*Math.min(1,dt*7);
      if(b.t>.98) shoot(b.x+lead*.4,b.y,true);
    }
    if(b.x>W+60){ fb=null; phase="point"; phaseT=0; pointHold=1.2; }
  } else if(phase==="retrieve"){
    var w=Math.max(0,dogs[0].watch-dt*1.2); dogs[0].watch=dogs[1].watch=w;
    if(phaseT>1.2 && dogs[0].idleNow() && dogs[1].idleNow()){ phase="point"; phaseT=0; loops++; pointHold=rnd(1.7,2.5); fb=null; }
  }
  if(!reticle.on) reticle.a=Math.max(0,reticle.a-dt*2.5);
  if(fb && fb.fall && !fb.gone){
    fb.ft+=dt; var t=clamp(fb.ft/fb.fT,0,1), g2=2*(fb.fy1-fb.fy0-fb.vy0*fb.fT)/(fb.fT*fb.fT);
    fb.x=lerp(fb.fx0,fb.fx1,t); fb.y=fb.fy0+fb.vy0*fb.ft+.5*g2*fb.ft*fb.ft; fb.rot+=fb.spin*dt*(1-t*.5);
    if(Math.random()<dt*14) feathers.push({x:fb.x,y:fb.y,vx:rnd(-20,20),vy:rnd(-10,20),r:rnd(1.4,2.6)*(fb.s/9),rot:rnd(0,6),vr:rnd(-6,6),a:.9,c:"#6b5236",sw:rnd(1,3)});
  }
}

/* ---------------------------------------------------------------
   frame
   --------------------------------------------------------------- */
function fog(y,a){
  var fg=ctx.createLinearGradient(0,y-H*.05,0,y+H*.05);
  fg.addColorStop(0,"rgba(240,200,150,0)"); fg.addColorStop(.5,"rgba(240,200,150,"+a+")"); fg.addColorStop(1,"rgba(240,200,150,0)");
  ctx.fillStyle=fg; ctx.fillRect(0,y-H*.05,W,H*.1);
}
function step(dt){
  time+=dt;
  director(dt);
  dogs.forEach(function(d){ d.u=U; d.update(dt); });
  amb.forEach(function(b){
    if(b.alive){ b.x+=b.vx*dt; b.ph+=b.f*dt; b.y+=Math.sin(time*1.3+b.id*10)*b.amp*dt*.6; }
    else { b.vy+=520*dt; b.y+=b.vy*dt; b.x+=b.vx*.25*dt; b.rot+=b.spin*dt; }
  });
  amb=amb.filter(function(b){ return b.fall ? b.y<G+30 : (b.x>-80 && b.x<W+80); });
  var n=W<700?2:3; while(amb.length<n) amb.push(newAmb(false));
  feathers.forEach(function(f){ f.vx*=.96; f.vy=f.vy*.94+38*dt*2.2; f.x+=(f.vx+Math.sin(time*f.sw*2+f.rot)*14)*dt; f.y+=f.vy*dt; f.rot+=f.vr*dt; f.a-=dt*.3; });
  feathers=feathers.filter(function(f){return f.a>0});
  leaves.forEach(function(l){ l.vx*=.97; l.vy+=420*dt; l.x+=l.vx*dt; l.y+=l.vy*dt; l.rot+=l.vr*dt; l.a-=dt*.9; });
  leaves=leaves.filter(function(l){return l.a>0});
  puffs.forEach(function(p){ p.r+=p.vr*dt; p.vr*=.97; p.x+=p.vx*dt; p.y+=p.vy*dt; p.a-=dt*.45; });
  puffs=puffs.filter(function(p){return p.a>0});
  rings.forEach(function(r){ r.r+=260*dt; r.a-=dt*1.6; });
  rings=rings.filter(function(r){return r.a>0});
  drops.forEach(function(d){ d.a-=dt*.8; });
  drops=drops.filter(function(d){return d.a>0});
  if(flash>0) flash=Math.max(0,flash-dt*7);
}
function draw(){
  var gEnd=G+H*.03, g=ctx.createLinearGradient(0,0,0,gEnd);
  g.addColorStop(0,"#0b1611"); g.addColorStop(.42,"#26332b"); g.addColorStop(.74,"#7a6340"); g.addColorStop(.93,"#d98d46"); g.addColorStop(1,"#efb066");
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  stars.forEach(function(s){ ctx.globalAlpha=Math.max(0,(.25+.35*Math.sin(time*1.5+s.p))*(1-s.y/(G*.7))); ctx.fillStyle="#f6eedc"; ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,TAU); ctx.fill(); });
  ctx.globalAlpha=1;
  // sun, low in the clearing
  var sx=stage.x0+stage.s*(side?.7:.72), sy=G-U*.2, sg=ctx.createRadialGradient(sx,sy,0,sx,sy,Math.max(W,H)*.45);
  sg.addColorStop(0,"rgba(255,214,150,.95)"); sg.addColorStop(.05,"rgba(255,190,110,.75)"); sg.addColorStop(.2,"rgba(240,140,60,.25)"); sg.addColorStop(1,"rgba(240,140,60,0)");
  ctx.fillStyle=sg; ctx.fillRect(0,0,W,H);
  ctx.fillStyle="rgba(255,226,170,.95)"; ctx.beginPath(); ctx.arc(sx,sy,Math.min(W,H)*.045,0,TAU); ctx.fill();
  function off(i){ return (-px*layers[i].par*W)-(W*.075); }
  ctx.drawImage(layers[0].c,off(0),0,layers[0].w,layers[0].h);
  fog(G-H*.012,.2);
  amb.forEach(drawWoodcock);
  ctx.drawImage(layers[1].c,off(1),0,layers[1].w,layers[1].h);
  fog(G+H*.005,.1);
  ctx.drawImage(layers[2].c,off(2),0,layers[2].w,layers[2].h);
  if(fb && !fb.gone) drawWoodcock(fb);
  feathers.forEach(function(f){ ctx.save(); ctx.globalAlpha=Math.max(0,f.a); ctx.translate(f.x,f.y); ctx.rotate(f.rot); ctx.fillStyle=f.c; ctx.beginPath(); ctx.ellipse(0,0,f.r*1.8,f.r*.6,0,0,TAU); ctx.fill(); ctx.restore(); });
  ctx.drawImage(hillC,0,0,W,H);
  drops.forEach(function(d){ ctx.save(); ctx.globalAlpha=Math.min(1,d.a*1.6); ctx.translate(d.x,d.y); ctx.fillStyle="#0a0f0b"; ctx.beginPath(); ctx.ellipse(0,0,d.s*1.1,d.s*.45,0,0,TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(-d.s*1.0,-d.s*.1); ctx.lineTo(-d.s*2.3,d.s*.2); ctx.lineTo(-d.s*1.0,d.s*.15); ctx.closePath(); ctx.fill(); ctx.restore(); });
  drawDog(dogs[1]); drawDog(dogs[0]);
  leaves.forEach(function(l){ ctx.save(); ctx.globalAlpha=Math.max(0,Math.min(1,l.a*1.5)); ctx.translate(l.x,l.y); ctx.rotate(l.rot); ctx.fillStyle="#0c150e"; ctx.beginPath(); ctx.ellipse(0,0,l.r*1.7,l.r*.7,0,0,TAU); ctx.fill(); ctx.restore(); });
  puffs.forEach(function(p){ ctx.fillStyle="rgba(230,224,210,"+Math.max(0,p.a)+")"; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,TAU); ctx.fill(); });
  rings.forEach(function(r){ ctx.strokeStyle="rgba(255,230,180,"+Math.max(0,r.a)+")"; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(r.x,r.y,r.r,0,TAU); ctx.stroke(); });
  if(reticle.a>0){
    var x=reticle.x, y=reticle.y, R=20+(reticle.on?Math.max(0,1-reticle.t*1.3)*12:0);
    ctx.save(); ctx.globalAlpha=reticle.a*.9; ctx.strokeStyle="#e2c283"; ctx.lineWidth=1.3;
    ctx.beginPath(); ctx.arc(x,y,R,0,TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-R-9,y); ctx.lineTo(x-6,y); ctx.moveTo(x+6,y); ctx.lineTo(x+R+9,y); ctx.moveTo(x,y-R-9); ctx.lineTo(x,y-6); ctx.moveTo(x,y+6); ctx.lineTo(x,y+R+9); ctx.stroke();
    ctx.fillStyle="#e2c283"; ctx.beginPath(); ctx.arc(x,y,1.6,0,TAU); ctx.fill(); ctx.restore();
  }
  if(flash>0){ ctx.fillStyle="rgba(255,240,210,"+(flash*.22)+")"; ctx.fillRect(0,0,W,H); }
}
var raf=0;
function frame(t){
  raf=0;
  if(!running||!W){ last=0; return; }
  var dt=Math.min(.05,last?(t-last)/1000:.016); last=t;
  step(dt); draw();
  if(!RM) raf=requestAnimationFrame(frame);
}
function kick(){ if(!raf && running) raf=requestAnimationFrame(frame); }

cv.addEventListener("pointerdown",function(e){
  var r=cv.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
  if(phase==="flight"){ reticle.x=x; reticle.y=y; }
  shoot(x,y,false);
  var h=document.getElementById("hint"); if(h) h.style.opacity=0;
  if(RM){ step(.016); draw(); }
});
addEventListener("pointermove",function(e){ if(e.pointerType==="mouse") px=(e.clientX/innerWidth-.5); },{passive:true});
var rt; addEventListener("resize",function(){ clearTimeout(rt); rt=setTimeout(function(){ if(Math.abs(cv.clientWidth-W)>24 || Math.abs(cv.clientHeight-H)>120) relayout(); },160); });
function relayout(){ last=0; resize(); if(RM){ step(.016); draw(); } else kick(); }
if("IntersectionObserver" in window) new IntersectionObserver(function(es){ running=es[0].isIntersecting && !document.hidden; if(running && !RM) kick(); }).observe(cv);
document.addEventListener("visibilitychange",function(){ running=!document.hidden; if(running && !RM) kick(); });
if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ var tb=textBounds(); if(!side && Math.abs(clamp(tb.top-18,176,H*.6)-G)>10) relayout(); });

resize(); step(.016); draw(); kick();

window.AQHero={
  relayout:relayout,
  _:{ step:function(sec){ var n=Math.round(sec*60); for(var i=0;i<n;i++) step(1/60); draw(); },
      info:function(){ return {W:W,H:H,G:G,U:U,side:side,stage:stage,phase:phase,phaseT:phaseT,loops:loops,dogs:dogs.map(function(d){return {x:d.x,k:d.cur&&d.cur.k,carry:d.carry}})}; },
      poses:function(u,re){ u=u||64;
        running=false; ctx.fillStyle="#e9b46c"; ctx.fillRect(0,0,W,H);
        var list=[["stand",STAND],["point",POINT],["back",BACK],["crouch",CROUCH],["proud",PROUD],["turn",TURN]], i;
        for(i=0;i<8;i++) list.push(["gallop "+i,gallop(i/8*TAU)]);
        for(i=0;i<6;i++) list.push(["trot "+i,trot(i/6*TAU,.42)]);
        for(i=0;i<=6;i++) list.push(["leap "+(i/6).toFixed(2),leapPose(i/6)]);
        if(re) list=list.filter(function(it){return re.test(it[0])});
        var cols=Math.max(1,Math.floor(W/(u*3.5))), sG=G, sU=U; G=0; U=0;
        list.forEach(function(it,j){
          var cx=(j%cols+.5)*(W/cols), cy=u*1.9+Math.floor(j/cols)*u*2.1;
          ctx.strokeStyle="rgba(0,0,0,.25)"; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(cx-100,cy); ctx.lineTo(cx+100,cy); ctx.stroke();
          G=cy; drawDog({x:cx,jy:0,face:1,u:u,pose:it[1],carry:/proud|leap 0\.[5-9]|leap 1/.test(it[0])});
          ctx.fillStyle="#222"; ctx.font="11px sans-serif"; ctx.fillText(it[0],cx-100,cy+16);
        });
        G=sG; U=sU;
      } }
};
})();
