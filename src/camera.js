// Camera controller: a 6DOF "spaceship" free-look, a multi-second flight THROUGH a wormhole
// throat (not an instant teleport), and an attract-mode tour that loops the three worlds.
//
// Orientation is an orthonormal basis (fwd, up, right) rotated by INCREMENTAL LOCAL rotations
// (yaw about local up, pitch about local right, roll about local forward). There is no world-up
// reference and no pitch clamp, so there is no gimbal-locked / dead vertical axis: you can loop
// over the top and keep flying in any direction.
window.createCamera = function (deps) {
  const V = window.VEC;
  const portals = deps.portals;
  const worldHasGround = deps.worldHasGround;
  const getState = deps.getState;          // () => { throat, flySpeed, traversal }
  const onFlash = deps.onFlash || function () {};
  const INFL = portals.INFLUENCE;

  // opening view (matches the old yaw/pitch start so the first frame is unchanged)
  const SY = -1.15, SP = 0.12;
  const START = { world: deps.startWorld || 0, pos: [0, 3, 16],
                  fwd: [Math.cos(SP)*Math.cos(SY), Math.sin(SP), Math.cos(SP)*Math.sin(SY)] };

  const cam = { world: START.world, pos: START.pos.slice(), fwd: [0,0,1], up: [0,1,0], right: [1,0,0] };
  const keys = {};
  let dragging = false, lastX = 0, lastY = 0;
  let cooldown = 0;
  let transit = null;
  const tour = { active: deps.tour !== false, target: -1, dwell: 0, orbit: Math.random() * 6.28 };

  // ---- orientation ----
  function orthonormalize() {
    cam.fwd = V.norm(cam.fwd);
    let r = V.cross(cam.fwd, cam.up);
    if (V.len(r) < 1e-5) r = V.cross(cam.fwd, Math.abs(cam.fwd[1]) < 0.9 ? [0,1,0] : [0,0,1]);
    cam.right = V.norm(r);
    cam.up = V.cross(cam.right, cam.fwd);
  }
  function setLook(fwd, preferredUp) {
    cam.fwd = V.norm(fwd);
    let u = preferredUp || [0,1,0];
    if (Math.abs(V.dot(cam.fwd, V.norm(u))) > 0.999) u = Math.abs(cam.fwd[1]) < 0.9 ? [0,1,0] : [0,0,1];
    cam.up = u;
    orthonormalize();
  }
  const rotYaw   = (a) => { cam.fwd = V.rotateAround(cam.fwd, cam.up, a); orthonormalize(); };
  const rotPitch = (a) => { cam.fwd = V.rotateAround(cam.fwd, cam.right, a); cam.up = V.rotateAround(cam.up, cam.right, a); orthonormalize(); };
  const rotRoll  = (a) => { cam.up = V.rotateAround(cam.up, cam.fwd, a); orthonormalize(); };
  setLook(START.fwd, [0,1,0]);

  function camBasis() { return { fwd: cam.fwd, right: cam.right, up: cam.up }; }
  function userTookControl() { if (tour.active) { tour.active = false; deps.onTourChange && deps.onTourChange(false); } }

  // ---- input ----
  function attachInput(canvas) {
    canvas.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); userTookControl(); });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      rotYaw(-(e.clientX - lastX) * 0.005);     // drag right -> look right, about local up
      rotPitch(-(e.clientY - lastY) * 0.005);   // drag down  -> look down,  about local right
      lastX = e.clientX; lastY = e.clientY;
    });
    const end = () => { dragging = false; };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      userTookControl();
      if (transit) return;
      const step = getState().throat * 0.9 * (e.deltaY < 0 ? 1 : -1);
      cam.pos = V.add(cam.pos, V.scale(cam.fwd, step));
      if (worldHasGround(cam.world)) cam.pos[1] = Math.max(cam.pos[1], 0.4);
    }, { passive: false });

    const MOVE = { KeyW:1,KeyS:1,KeyA:1,KeyD:1,KeyR:1,KeyF:1,KeyQ:1,KeyE:1,ArrowUp:1,ArrowDown:1,ArrowLeft:1,ArrowRight:1,ShiftLeft:1,ShiftRight:1 };
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyT") { tour.active = !tour.active; if (tour.active) { tour.target = -1; tour.dwell = 0; } deps.onTourChange && deps.onTourChange(tour.active); return; }
      if (MOVE[e.code]) { keys[e.code] = true; userTookControl(); e.preventDefault(); }
    });
    window.addEventListener("keyup", (e) => { keys[e.code] = false; });
  }

  // ---- per-frame update ----
  function update(dt) {
    const st = getState();
    if (transit) { updateTransit(dt, st); return camBasis(); }

    if (tour.active) {
      tourStep(dt, st);
    } else {
      const rd = (keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0);
      if (rd) rotRoll(rd * 1.6 * dt);           // roll about local forward
      manualMove(dt, st);
    }
    if (worldHasGround(cam.world)) cam.pos[1] = Math.max(cam.pos[1], 0.4);

    cooldown -= dt;
    if (cooldown <= 0) checkEnter(st);
    return camBasis();
  }

  function manualMove(dt, st) {
    const spd = st.flySpeed * ((keys.ShiftLeft || keys.ShiftRight) ? 3 : 1);
    const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
    const u = (keys.KeyR ? 1 : 0) - (keys.KeyF ? 1 : 0);
    let mv = V.scale(cam.fwd, f);
    mv = V.add(mv, V.scale(cam.right, s));
    mv = V.add(mv, V.scale(cam.up, u));         // strafe along the camera's own up (true 6DOF)
    cam.pos = V.add(cam.pos, V.scale(mv, spd * dt));
  }

  // Attract-mode tour: cruise to the next mouth (slowly turning to face it), fall in, then after
  // emerging dwell a moment panning across the new world, and head for its other mouth.
  function tourStep(dt, st) {
    if (tour.dwell > 0) {
      tour.dwell -= dt;
      cam.fwd = V.rotateAround(cam.fwd, [0,1,0], dt * 0.18);   // slow level pan
      setLook(cam.fwd, [0,1,0]);
      return;
    }
    if (tour.target < 0 || portals.list[tour.target].world !== cam.world) tour.target = portals.firstPortalInWorld(cam.world);
    const C = portals.list[tour.target].pos;
    const toC = V.sub(C, cam.pos), dist = V.len(toC), dirC = V.norm(toC);
    const tang = V.norm(V.cross(dirC, [0,1,0]));
    const orbitAmt = 0.5 * Math.min(1, dist / (st.throat * 10));
    tour.orbit += dt * 0.25;
    const head = V.norm(V.add(dirC, V.scale(tang, orbitAmt)));
    cam.pos = V.add(cam.pos, V.scale(head, st.flySpeed * dt));
    const nf = V.norm(V.lerp(cam.fwd, dirC, 1 - Math.pow(0.05, dt)));
    setLook(nf, [0,1,0]);
  }

  function checkEnter(st) {
    const b = st.throat;
    for (let i = 0; i < portals.count; i++) {
      if (portals.list[i].world !== cam.world) continue;
      const C = portals.list[i].pos, toC = V.sub(C, cam.pos), dist = V.len(toC);
      if (dist < b * 3.2 && V.dot(V.norm(toC), cam.fwd) > 0.2) { beginTransit(i, st); return; }
    }
  }

  function beginTransit(i, st) {
    const P = portals.list[i];
    transit = { i, srcWorld: cam.world, dstWorld: P.dstWorld, srcCenter: P.pos, dstCenter: P.dst,
                axis: V.norm(V.sub(cam.pos, P.pos)), t: 0, dur: Math.max(st.traversal, 0.4), swapped: false };
    const R0 = V.clamp(V.len(V.sub(cam.pos, P.pos)), st.throat, st.throat * (INFL - 0.2));
    const Rmax = st.throat * (INFL - 0.2);
    transit.t = 0.5 * (1 - inv_smoother((R0 - st.throat) / (Rmax - st.throat)));
  }
  function inv_smoother(y) { y = V.clamp(y, 0, 1); let u = y; for (let k = 0; k < 6; k++) { const f = u*u*u*(u*(u*6-15)+10) - y; const df = 30*u*u*(u-1)*(u-1); u -= f / (df || 1e-3); u = V.clamp(u, 0, 1); } return u; }

  function updateTransit(dt, st) {
    transit.t += dt / transit.dur;
    const tt = Math.min(transit.t, 1.0);
    const b = st.throat, Rmax = b * (INFL - 0.2), axis = transit.axis;
    if (tt < 0.5) {
      cam.pos = V.add(transit.srcCenter, V.scale(axis, V.mix(Rmax, b, V.smoother(tt * 2.0))));
      cam.world = transit.srcWorld;
    } else {
      if (!transit.swapped) { transit.swapped = true; onFlash(); }
      cam.pos = V.sub(transit.dstCenter, V.scale(axis, V.mix(b, Rmax, V.smoother((tt - 0.5) * 2.0))));
      cam.world = transit.dstWorld;
    }
    setLook(V.scale(axis, -1), [0,1,0]);        // look along the direction of travel
    if (transit.t >= 1.0) {
      cam.world = transit.dstWorld;
      cam.pos = V.sub(transit.dstCenter, V.scale(axis, Rmax));
      setLook(V.scale(axis, -1), [0,1,0]);
      if (worldHasGround(cam.world)) cam.pos[1] = Math.max(cam.pos[1], 0.4);
      cooldown = 0.7;
      if (tour.active) { tour.dwell = 2.4; tour.orbit = Math.random() * 6.28; tour.target = portals.otherPortalInWorld(cam.world, portals.pair(transit.i)); }
      transit = null;
    }
  }

  return {
    cam, attachInput, update,
    isTour: () => tour.active,
    setTour: (v) => { tour.active = v; if (v) { tour.target = -1; tour.dwell = 0; } },
    reset: () => { cam.world = START.world; cam.pos = START.pos.slice(); setLook(START.fwd, [0,1,0]); transit = null; },
  };
};
