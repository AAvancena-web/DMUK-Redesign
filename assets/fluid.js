/* Hero ink: a small WebGL2 fluid simulation (stable-fluids style).
   Warm DM orange tones drift and curl behind the banner. Falls back to the
   CSS aurora when WebGL2 or float render targets are unavailable. */
(function () {
  'use strict';
  var canvas = document.getElementById('fluid');
  if (!canvas) return;
  var hero = canvas.closest('.hero') || document.body;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var gl = canvas.getContext('webgl2', { alpha: true, depth: false, stencil: false, antialias: false, premultipliedAlpha: true });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) { canvas.remove(); return; }
  gl.getExtension('OES_texture_float_linear');

  var CFG = {
    SIM: 128, DYE: 720,
    DENSITY_DISSIPATION: 0.4, VELOCITY_DISSIPATION: 0.35,
    PRESSURE: 0.8, PRESSURE_ITER: 18, CURL: 28,
    RADIUS: 0.32, FORCE: 5200
  };
  // warm palette only: orange, amber, ember, warm white
  var PALETTE = [[1.0, 0.42, 0.10], [1.0, 0.62, 0.18], [0.92, 0.24, 0.07], [1.0, 0.78, 0.50], [0.85, 0.32, 0.05]];
  function pickColor(k) {
    var c = PALETTE[(Math.random() * PALETTE.length) | 0];
    k = k || 0.34;
    return [c[0] * k, c[1] * k, c[2] * k];
  }

  /* ---------- shaders ---------- */
  var VERT = '#version 300 es\nprecision highp float;in vec2 aPosition;out vec2 vUv,vL,vR,vT,vB;uniform vec2 texelSize;' +
    'void main(){vUv=aPosition*.5+.5;vL=vUv-vec2(texelSize.x,0.);vR=vUv+vec2(texelSize.x,0.);vT=vUv+vec2(0.,texelSize.y);vB=vUv-vec2(0.,texelSize.y);gl_Position=vec4(aPosition,0.,1.);}';
  var HEAD = '#version 300 es\nprecision highp float;precision highp sampler2D;in vec2 vUv,vL,vR,vT,vB;out vec4 o;';
  var FRAG = {
    splat: 'uniform sampler2D uTarget;uniform float aspectRatio,radius;uniform vec3 color;uniform vec2 point;' +
      'void main(){vec2 p=vUv-point;p.x*=aspectRatio;vec3 s=exp(-dot(p,p)/radius)*color;o=vec4(texture(uTarget,vUv).xyz+s,1.);}',
    advect: 'uniform sampler2D uVelocity,uSource;uniform vec2 texelSize;uniform float dt,dissipation;' +
      'void main(){vec2 c=vUv-dt*texture(uVelocity,vUv).xy*texelSize;o=texture(uSource,c)/(1.+dissipation*dt);}',
    divergence: 'uniform sampler2D uVelocity;void main(){float L=texture(uVelocity,vL).x,R=texture(uVelocity,vR).x,T=texture(uVelocity,vT).y,B=texture(uVelocity,vB).y;' +
      'vec2 C=texture(uVelocity,vUv).xy;if(vL.x<0.)L=-C.x;if(vR.x>1.)R=-C.x;if(vT.y>1.)T=-C.y;if(vB.y<0.)B=-C.y;o=vec4(.5*(R-L+T-B),0.,0.,1.);}',
    curl: 'uniform sampler2D uVelocity;void main(){float L=texture(uVelocity,vL).y,R=texture(uVelocity,vR).y,T=texture(uVelocity,vT).x,B=texture(uVelocity,vB).x;o=vec4(.5*(R-L-T+B),0.,0.,1.);}',
    vorticity: 'uniform sampler2D uVelocity,uCurl;uniform float curl,dt;void main(){float L=texture(uCurl,vL).x,R=texture(uCurl,vR).x,T=texture(uCurl,vT).x,B=texture(uCurl,vB).x,C=texture(uCurl,vUv).x;' +
      'vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L));f/=length(f)+.0001;f*=curl*C;f.y*=-1.;vec2 v=texture(uVelocity,vUv).xy+f*dt;o=vec4(clamp(v,-1000.,1000.),0.,1.);}',
    pressure: 'uniform sampler2D uPressure,uDivergence;void main(){float L=texture(uPressure,vL).x,R=texture(uPressure,vR).x,T=texture(uPressure,vT).x,B=texture(uPressure,vB).x,d=texture(uDivergence,vUv).x;o=vec4((L+R+B+T-d)*.25,0.,0.,1.);}',
    gradient: 'uniform sampler2D uPressure,uVelocity;void main(){float L=texture(uPressure,vL).x,R=texture(uPressure,vR).x,T=texture(uPressure,vT).x,B=texture(uPressure,vB).x;vec2 v=texture(uVelocity,vUv).xy-vec2(R-L,T-B);o=vec4(v,0.,1.);}',
    clear: 'uniform sampler2D uTexture;uniform float value;void main(){o=value*texture(uTexture,vUv);}',
    display: 'uniform sampler2D uTexture;void main(){vec3 c=texture(uTexture,vUv).rgb;c=pow(max(c,0.),vec3(.85));c=c/(1.+c*.25);float a=clamp(max(c.r,max(c.g,c.b))*1.3,0.,1.);o=vec4(c,a);}'
  };

  function compile(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var vs;
  function Program(frag) {
    vs = vs || compile(gl.VERTEX_SHADER, VERT);
    var p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, HEAD + frag));
    gl.bindAttribLocation(p, 0, 'aPosition'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p: p, u: u, bind: function () { gl.useProgram(p); } };
  }

  var P;
  try {
    P = {};
    for (var k in FRAG) P[k] = Program(FRAG[k]);
  } catch (e) { canvas.remove(); return; }

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  function blit(t) {
    if (t) { gl.viewport(0, 0, t.w, t.h); gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); }
    else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  function FBO(w, h) {
    gl.activeTexture(gl.TEXTURE0);
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo');
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    return { fbo: fbo, w: w, h: h, tx: 1 / w, ty: 1 / h,
      attach: function (id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; } };
  }
  function DFBO(w, h) {
    var a = FBO(w, h), b = FBO(w, h);
    return { w: w, h: h, tx: 1 / w, ty: 1 / h,
      get read() { return a; }, get write() { return b; }, swap: function () { var t = a; a = b; b = t; } };
  }
  function res(r) {
    var w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, a = w / h; if (a < 1) a = 1 / a;
    var mn = Math.round(r), mx = Math.round(r * a);
    return w > h ? { w: mx, h: mn } : { w: mn, h: mx };
  }

  var vel, dye, div, curlT, pres;
  function sizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.max(1, Math.floor(canvas.clientWidth * dpr)), h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width === w && canvas.height === h) return false;
    canvas.width = w; canvas.height = h; return true;
  }
  function initFBOs() {
    var s = res(CFG.SIM), d = res(CFG.DYE);
    vel = DFBO(s.w, s.h); dye = DFBO(d.w, d.h);
    div = FBO(s.w, s.h); curlT = FBO(s.w, s.h); pres = DFBO(s.w, s.h);
  }
  try { sizeCanvas(); initFBOs(); } catch (e) { canvas.remove(); return; }
  document.documentElement.classList.add('has-fluid');

  function aspect() { return canvas.width / canvas.height; }
  function splat(x, y, dx, dy, color) {
    var r = CFG.RADIUS / 100; if (aspect() > 1) r *= aspect();
    P.splat.bind();
    gl.uniform1i(P.splat.u.uTarget, vel.read.attach(0));
    gl.uniform1f(P.splat.u.aspectRatio, aspect());
    gl.uniform2f(P.splat.u.point, x, y);
    gl.uniform3f(P.splat.u.color, dx, dy, 0);
    gl.uniform1f(P.splat.u.radius, r);
    blit(vel.write); vel.swap();
    gl.uniform1i(P.splat.u.uTarget, dye.read.attach(0));
    gl.uniform3f(P.splat.u.color, color[0], color[1], color[2]);
    blit(dye.write); dye.swap();
  }
  function randomSplat(strength) {
    var a = Math.random() * Math.PI * 2, f = (300 + Math.random() * 500) * (strength || 1);
    splat(0.08 + Math.random() * 0.84, 0.1 + Math.random() * 0.8, Math.cos(a) * f, Math.sin(a) * f, pickColor());
  }

  function step(dt) {
    gl.disable(gl.BLEND);
    P.curl.bind();
    gl.uniform2f(P.curl.u.texelSize, vel.tx, vel.ty);
    gl.uniform1i(P.curl.u.uVelocity, vel.read.attach(0));
    blit(curlT);

    P.vorticity.bind();
    gl.uniform2f(P.vorticity.u.texelSize, vel.tx, vel.ty);
    gl.uniform1i(P.vorticity.u.uVelocity, vel.read.attach(0));
    gl.uniform1i(P.vorticity.u.uCurl, curlT.attach(1));
    gl.uniform1f(P.vorticity.u.curl, CFG.CURL);
    gl.uniform1f(P.vorticity.u.dt, dt);
    blit(vel.write); vel.swap();

    P.divergence.bind();
    gl.uniform2f(P.divergence.u.texelSize, vel.tx, vel.ty);
    gl.uniform1i(P.divergence.u.uVelocity, vel.read.attach(0));
    blit(div);

    P.clear.bind();
    gl.uniform1i(P.clear.u.uTexture, pres.read.attach(0));
    gl.uniform1f(P.clear.u.value, CFG.PRESSURE);
    blit(pres.write); pres.swap();

    P.pressure.bind();
    gl.uniform2f(P.pressure.u.texelSize, vel.tx, vel.ty);
    gl.uniform1i(P.pressure.u.uDivergence, div.attach(0));
    for (var i = 0; i < CFG.PRESSURE_ITER; i++) {
      gl.uniform1i(P.pressure.u.uPressure, pres.read.attach(1));
      blit(pres.write); pres.swap();
    }

    P.gradient.bind();
    gl.uniform2f(P.gradient.u.texelSize, vel.tx, vel.ty);
    gl.uniform1i(P.gradient.u.uPressure, pres.read.attach(0));
    gl.uniform1i(P.gradient.u.uVelocity, vel.read.attach(1));
    blit(vel.write); vel.swap();

    P.advect.bind();
    gl.uniform2f(P.advect.u.texelSize, vel.tx, vel.ty);
    var v = vel.read.attach(0);
    gl.uniform1i(P.advect.u.uVelocity, v);
    gl.uniform1i(P.advect.u.uSource, v);
    gl.uniform1f(P.advect.u.dt, dt);
    gl.uniform1f(P.advect.u.dissipation, CFG.VELOCITY_DISSIPATION);
    blit(vel.write); vel.swap();

    gl.uniform1i(P.advect.u.uVelocity, vel.read.attach(0));
    gl.uniform1i(P.advect.u.uSource, dye.read.attach(1));
    gl.uniform1f(P.advect.u.dissipation, CFG.DENSITY_DISSIPATION);
    blit(dye.write); dye.swap();
  }
  function render() {
    P.display.bind();
    gl.uniform2f(P.display.u.texelSize, 1 / canvas.width, 1 / canvas.height);
    gl.uniform1i(P.display.u.uTexture, dye.read.attach(0));
    blit(null);
  }

  /* pointer: a gentle stir as the cursor passes */
  var ptr = { x: 0, y: 0, px: 0, py: 0, moved: false, color: pickColor(0.12), on: false };
  hero.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    var r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
    if (!ptr.on) { ptr.px = x; ptr.py = y; ptr.on = true; }
    ptr.x = x; ptr.y = y; ptr.moved = true;
  }, { passive: true });
  hero.addEventListener('pointerleave', function () { ptr.on = false; });

  var last = performance.now(), nextAuto = 0, running = true, visible = true, colorTimer = 0;
  // opening bloom
  for (var b = 0; b < 6; b++) randomSplat(1.3);

  function frame(now) {
    if (!running) return;
    var dt = Math.min((now - last) / 1000, 0.033); last = now;
    if (sizeCanvas()) { try { initFBOs(); for (var j = 0; j < 4; j++) randomSplat(); } catch (e) { return; } }

    if (now > nextAuto) {
      randomSplat();
      if (Math.random() < 0.45) randomSplat(0.7);
      nextAuto = now + 900 + Math.random() * 1100;
    }
    colorTimer += dt;
    if (colorTimer > 1.4) { ptr.color = pickColor(0.12); colorTimer = 0; }
    if (ptr.moved && ptr.on) {
      var dx = (ptr.x - ptr.px) * CFG.FORCE, dy = (ptr.y - ptr.py) * CFG.FORCE;
      if (Math.abs(dx) + Math.abs(dy) > 0.5) splat(ptr.x, ptr.y, dx, dy, ptr.color);
      ptr.px = ptr.x; ptr.py = ptr.y; ptr.moved = false;
    }
    step(dt);
    render();
    if (visible && !document.hidden) requestAnimationFrame(frame); else running = false;
  }
  function start() { if (running || reduce) return; running = true; last = performance.now(); requestAnimationFrame(frame); }

  if (reduce) {
    // one still frame of ink, no motion
    for (var s = 0; s < 40; s++) step(0.016);
    render();
    running = false;
    return;
  }
  requestAnimationFrame(frame);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) start(); }, { threshold: 0 }).observe(hero);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && visible) start(); });
})();
