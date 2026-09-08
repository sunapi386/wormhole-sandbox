// Engine: wires the GL context, the assembled shader, the camera controller, the HUD overlay,
// and the control panel together, and drives the render loop. Worlds and portals come from the
// registries (src/worlds.js, src/portals.js) so this file never hard-codes the content.
window.startEngine = function () {
  const V = window.VEC;
  const WORLDS = window.WORMHOLE_WORLDS;
  const P = window.WORMHOLE;
  const WORLD_NAMES = WORLDS.map((w) => w.name);
  const WORLD_HEX = WORLDS.map((w) => w.hex);

  const canvas = document.getElementById("glcanvas");
  const overlay = document.getElementById("overlay");
  const octx = overlay.getContext("2d");
  const errBox = document.getElementById("err");
  function fail(m) { errBox.style.display = "grid"; errBox.innerHTML = m; throw new Error(m); }

  const gl = canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: true })
          || canvas.getContext("experimental-webgl", { preserveDrawingBuffer: true });
  if (!gl) fail("WebGL is not available in this browser.");

  function compile(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) fail("Shader compile error:<br><pre style='text-align:left'>" + gl.getShaderInfoLog(s) + "</pre>");
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, window.SHADER.VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, window.SHADER.buildFragmentShader(WORLDS, P.count, P.INFLUENCE)));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) fail("Link error: " + gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const vbuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  ["uResolution","uTime","uCamPos","uCamRight","uCamUp","uCamFwd","uFov","uCamWorld",
   "uRim","uBright","uStepScale","uSoft",
   "uPortPos","uPortDst","uPortRad","uPortWorld","uPortDstWorld"].forEach((n) => U[n] = gl.getUniformLocation(prog, n));

  // static portal uniforms
  gl.uniform3fv(U.uPortPos, P.pos);
  gl.uniform3fv(U.uPortDst, P.dst);
  gl.uniform1iv(U.uPortWorld, P.world);
  gl.uniform1iv(U.uPortDstWorld, P.dstWorld);

  // ---- controls ----
  const SPEC = {
    throat:    ["Throat size",     0.6, 2.0, 0.02, 1.2, (v) => v.toFixed(2)],
    rim:       ["Portal rim glow", 0.0, 2.0, 0.02, 0.5, (v) => v.toFixed(2)],
    softness:  ["Lens blur",       0.0, 1.0, 0.02, 0.4, (v) => v.toFixed(2)],
    traversal: ["Traversal time",  1.0, 6.0, 0.1, 3.0, (v) => v.toFixed(1) + "s"],
    flySpeed:  ["Fly speed",       1.0, 30.0, 0.5, 7.0, (v) => v.toFixed(1)],
    fov:       ["Field of view",   40, 110, 1, 70, (v) => v.toFixed(0) + "°"],
    brightness:["Brightness",      0.2, 3.0, 0.02, 1.0, (v) => v.toFixed(2)],
    quality:   ["Ray quality",     0.6, 2.5, 0.05, 1.0, (v) => (1 / v).toFixed(2) + "x"],
    resScale:  ["Resolution",      0.4, 1.5, 0.05, 0.85, (v) => Math.round(v * 100) + "%"],
  };
  const state = {}, inputs = {}, valEls = {};
  for (const key in SPEC) {
    const [label, mn, mx, step, def, fmt] = SPEC[key];
    state[key] = def;
    const row = document.querySelector(`[data-slider="${key}"]`);
    row.innerHTML = `<label><span class="name">${label}</span><span class="val"></span></label><input type="range" min="${mn}" max="${mx}" step="${step}">`;
    const input = row.querySelector("input"), valEl = row.querySelector(".val");
    input.value = def; valEl.textContent = fmt(def);
    input.addEventListener("input", () => { state[key] = parseFloat(input.value); valEl.textContent = fmt(state[key]); if (key === "resScale") resize(); });
    inputs[key] = input; valEls[key] = valEl;
  }

  // ---- camera + overlay ----
  const hash = location.hash || "";
  const mw = hash.match(/w(\d)/);
  const sticks = window.createJoysticks(document.body);   // touch-only on-screen controls
  const camera = window.createCamera({
    portals: P,
    worldHasGround: (w) => WORLDS[w].hasGround,
    getState: () => ({ throat: state.throat, flySpeed: state.flySpeed, traversal: state.traversal }),
    getAxes: () => sticks.axes(),
    onFlash: () => doFlash(),
    onTourChange: (v) => { chkTour.checked = v; },
    startWorld: mw ? +mw[1] : 0,
    tour: !/tour0|notour/.test(hash),
  });
  const overlayR = window.createOverlay(octx, P, WORLD_HEX, WORLD_NAMES);
  camera.attachInput(canvas);

  // ---- panel wiring ----
  const panel = document.getElementById("panel");
  const chkTour = document.getElementById("chkTour");
  const chkPause = document.getElementById("chkPause");
  const flash = document.getElementById("flash");
  const worldTag = document.getElementById("world");
  chkTour.checked = camera.isTour();
  chkTour.addEventListener("change", () => camera.setTour(chkTour.checked));
  if (sticks.isTouch) { panel.classList.add("hidden"); document.getElementById("hud").style.display = "none"; }   // keep the joysticks clear on phones
  document.getElementById("btnHide").onclick = () => panel.classList.add("hidden");
  document.getElementById("toggle").onclick = () => panel.classList.remove("hidden");
  document.getElementById("btnReset").onclick = () => camera.reset();
  document.getElementById("btnShot").onclick = () => { render(performance.now()); const a = document.createElement("a"); a.download = "wormhole-network.png"; a.href = canvas.toDataURL("image/png"); a.click(); };
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") { chkPause.checked = !chkPause.checked; e.preventDefault(); }
    else if (e.code === "KeyH") panel.classList.toggle("hidden");
  });
  // Smooth wormhole transition: at the throat crossing, freeze the last (pre-crossing) frame as
  // an image over the canvas and dissolve it out, revealing the world you emerge into underneath.
  // Reads as passing through the throat rather than a hard teleport blink.
  function doFlash() {
    try {
      flash.style.backgroundImage = "url(" + canvas.toDataURL("image/jpeg", 0.82) + ")";
      flash.style.backgroundSize = "cover";
      flash.style.backgroundPosition = "center";
    } catch (e) { /* tainted canvas: fall back to a soft dip */ flash.style.backgroundImage = "none"; }
    flash.style.transition = "none"; flash.style.opacity = "1";
    requestAnimationFrame(() => { flash.style.transition = "opacity 0.65s ease"; flash.style.opacity = "0"; });
  }

  // ---- sizing ----
  const resTxt = document.getElementById("resTxt");
  let winW = window.innerWidth, winH = window.innerHeight;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    winW = window.innerWidth; winH = window.innerHeight;
    const s = state.resScale * dpr;
    const w = Math.max(1, Math.floor(winW * s)), h = Math.max(1, Math.floor(winH * s));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h); resTxt.textContent = w + "×" + h;
    overlay.width = Math.floor(winW * dpr); overlay.height = Math.floor(winH * dpr);
    overlay.style.width = winW + "px"; overlay.style.height = winH + "px";
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize); resize();

  // ---- render loop ----
  let simTime = 0, last = performance.now();
  let fpsAccum = 0, fpsCount = 0, fpsShown = performance.now();
  const fpsEl = document.getElementById("fps");
  const cam = camera.cam;

  function render(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!chkPause.checked) simTime += dt;
    const basis = camera.update(dt);

    gl.uniform2f(U.uResolution, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, simTime);
    gl.uniform3fv(U.uCamPos, cam.pos);
    gl.uniform3fv(U.uCamRight, basis.right);
    gl.uniform3fv(U.uCamUp, basis.up);
    gl.uniform3fv(U.uCamFwd, basis.fwd);
    gl.uniform1f(U.uFov, state.fov * Math.PI / 180);
    gl.uniform1i(U.uCamWorld, cam.world);
    gl.uniform1f(U.uRim, state.rim);
    gl.uniform1f(U.uBright, state.brightness);
    gl.uniform1f(U.uStepScale, state.quality);
    gl.uniform1f(U.uSoft, state.softness);
    gl.uniform1fv(U.uPortRad, P.radArray(state.throat));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    overlayR.draw(basis, cam, winW, winH, state.fov * Math.PI / 180, sticks.isTouch ? 150 : 0);
    worldTag.textContent = WORLD_NAMES[cam.world];
    worldTag.style.color = WORLD_HEX[cam.world];
    worldTag.style.borderColor = WORLD_HEX[cam.world] + "66";
  }
  function loop(now) {
    render(now);
    const inst = 1000 / Math.max(now - (loop._p || now), 0.001); loop._p = now;
    fpsAccum += inst; fpsCount++;
    if (now - fpsShown > 400) { fpsEl.textContent = Math.round(fpsAccum / fpsCount); fpsAccum = 0; fpsCount = 0; fpsShown = now; }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
};
