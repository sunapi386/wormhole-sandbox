// Camera controller: free-flight, an actual multi-second flight THROUGH a wormhole throat
// (instead of an instant teleport), and an attract-mode tour that loops the three worlds.
window.createCamera = function (deps) {
  const V = window.VEC;
  const portals = deps.portals;
  const worldHasGround = deps.worldHasGround;
  const getState = deps.getState;          // () => { throat, flySpeed, traversal }
  const onFlash = deps.onFlash || function () {};
  const INFL = portals.INFLUENCE;

  const START = { world: deps.startWorld || 0, pos: [0, 3, 16], yaw: -1.15, pitch: 0.12 };
  const cam = { world: START.world, pos: START.pos.slice(), yaw: START.yaw, pitch: START.pitch };
  const keys = {};
  let dragging = false, lastX = 0, lastY = 0;
  let cooldown = 0;
  let transit = null;
  const tour = { active: deps.tour !== false, target: -1, dwell: 0, orbit: Math.random() * 6.28 };

  function facing() {
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    return [cp * Math.cos(cam.yaw), sp, cp * Math.sin(cam.yaw)];
  }
  function setFacing(d) { cam.yaw = Math.atan2(d[2], d[0]); cam.pitch = Math.asin(V.clamp(d[1], -1, 1)); }
  function basisFrom(fwd) {
    let right = V.norm(V.cross(fwd, [0, 1, 0]));
    if (V.len(right) < 1e-4) right = [1, 0, 0];
    return { fwd, right, up: V.cross(right, fwd) };
  }
  function userTookControl() { if (tour.active) { tour.active = false; deps.onTourChange && deps.onTourChange(false); } }

  // ---- input ----
  function attachInput(canvas) {
    canvas.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); userTookControl(); });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      cam.yaw += (e.clientX - lastX) * 0.005;
      cam.pitch = V.clamp(cam.pitch - (e.clientY - lastY) * 0.005, -1.5, 1.5);
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
      cam.pos = V.add(cam.pos, V.scale(facing(), step));
      if (worldHasGround(cam.world)) cam.pos[1] = Math.max(cam.pos[1], 0.4);
    }, { passive: false });

    const MOVE = { KeyW:1,KeyS:1,KeyA:1,KeyD:1,KeyR:1,KeyF:1,ArrowUp:1,ArrowDown:1,ArrowLeft:1,ArrowRight:1,ShiftLeft:1,ShiftRight:1 };
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyT") { tour.active = !tour.active; if (tour.active) { tour.target = -1; tour.dwell = 0; } deps.onTourChange && deps.onTourChange(tour.active); return; }
      if (MOVE[e.code]) { keys[e.code] = true; userTookControl(); e.preventDefault(); }
    });
    window.addEventListener("keyup", (e) => { keys[e.code] = false; });
  }

  // ---- per-frame update ----
  function update(dt) {
    const st = getState();
    if (transit) { updateTransit(dt, st); return basisFrom(transit.fwd); }

    let fwd = facing();
    const basis = basisFrom(fwd);
    if (tour.active) tourStep(dt, st);
    else manualMove(dt, st, basis);

    fwd = facing();
    if (worldHasGround(cam.world)) cam.pos[1] = Math.max(cam.pos[1], 0.4);

    cooldown -= dt;
    if (cooldown <= 0) checkEnter(st, fwd);
    return basisFrom(fwd);
  }

  function manualMove(dt, st, basis) {
    const spd = st.flySpeed * ((keys.ShiftLeft || keys.ShiftRight) ? 3 : 1);
    const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
    const u = (keys.KeyR ? 1 : 0) - (keys.KeyF ? 1 : 0);
    let mv = [0, 0, 0];
    mv = V.add(mv, V.scale(basis.fwd, f));
    mv = V.add(mv, V.scale(basis.right, s));
    mv = V.add(mv, V.scale([0, 1, 0], u));
    cam.pos = V.add(cam.pos, V.scale(mv, spd * dt));
  }

  // Attract-mode tour: cruise to the next mouth (slowly rotating in), fall into it, then after
  // emerging dwell a moment rotating to admire the new world, and head for its other mouth.
  function tourStep(dt, st) {
    if (tour.dwell > 0) { tour.dwell -= dt; cam.yaw += dt * 0.18; return; }
    if (tour.target < 0 || portals.list[tour.target].world !== cam.world) tour.target = portals.firstPortalInWorld(cam.world);
    const C = portals.list[tour.target].pos;
    const toC = V.sub(C, cam.pos), dist = V.len(toC), dirC = V.norm(toC);
    const tang = V.norm(V.cross(dirC, [0, 1, 0]));
    const orbitAmt = 0.5 * Math.min(1, dist / (st.throat * 10));   // curve in, straighten near the mouth
    tour.orbit += dt * 0.25;
    const head = V.norm(V.add(dirC, V.scale(tang, orbitAmt)));
    cam.pos = V.add(cam.pos, V.scale(head, st.flySpeed * dt));
    cam.yaw = V.lerpAngle(cam.yaw, Math.atan2(dirC[2], dirC[0]), 1 - Math.pow(0.05, dt));
    cam.pitch += (Math.asin(V.clamp(dirC[1], -1, 1)) - cam.pitch) * (1 - Math.pow(0.05, dt));
  }

  function checkEnter(st, fwd) {
    const b = st.throat;
    for (let i = 0; i < portals.count; i++) {
      if (portals.list[i].world !== cam.world) continue;
      const C = portals.list[i].pos, toC = V.sub(C, cam.pos), dist = V.len(toC);
      if (dist < b * 3.2 && V.dot(V.norm(toC), fwd) > 0.2) { beginTransit(i, st); return; }
    }
  }

  function beginTransit(i, st) {
    const P = portals.list[i];
    transit = {
      i, srcWorld: cam.world, dstWorld: P.dstWorld,
      srcCenter: P.pos, dstCenter: P.dst,
      axis: V.norm(V.sub(cam.pos, P.pos)),   // outward normal on the entry side
      t: 0, dur: Math.max(st.traversal, 0.4), swapped: false,
    };
    // start progress at the camera's current radius so there is no jump inward
    const R0 = V.clamp(V.len(V.sub(cam.pos, P.pos)), st.throat, st.throat * (INFL - 0.2));
    const Rmax = st.throat * (INFL - 0.2);
    transit.t = 0.5 * (1 - inv_smoother((R0 - st.throat) / (Rmax - st.throat)));
  }

  // invert smoother (approx) so we can seed transit.t from a radius; good enough for a smooth start
  function inv_smoother(y) { y = V.clamp(y, 0, 1); let u = y; for (let k = 0; k < 6; k++) { const f = u*u*u*(u*(u*6-15)+10) - y; const df = 30*u*u*(u-1)*(u-1); u -= f / (df || 1e-3); u = V.clamp(u, 0, 1); } return u; }

  function updateTransit(dt, st) {
    transit.t += dt / transit.dur;
    const tt = Math.min(transit.t, 1.0);
    const b = st.throat, Rmax = b * (INFL - 0.2), axis = transit.axis;
    if (tt < 0.5) {
      const R = V.mix(Rmax, b, V.smoother(tt * 2.0));
      cam.pos = V.add(transit.srcCenter, V.scale(axis, R));   // fall inward, looking into the throat
      transit.fwd = V.scale(axis, -1);
      cam.world = transit.srcWorld;
    } else {
      if (!transit.swapped) { transit.swapped = true; onFlash(); }
      const R = V.mix(b, Rmax, V.smoother((tt - 0.5) * 2.0));
      cam.pos = V.sub(transit.dstCenter, V.scale(axis, R));   // emerge and pull away into the far world
      transit.fwd = V.scale(axis, -1);
      cam.world = transit.dstWorld;
    }
    if (transit.t >= 1.0) {
      cam.world = transit.dstWorld;
      cam.pos = V.sub(transit.dstCenter, V.scale(axis, Rmax));
      setFacing(V.scale(axis, -1));
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
    reset: () => { cam.world = START.world; cam.pos = START.pos.slice(); cam.yaw = START.yaw; cam.pitch = START.pitch; transit = null; },
  };
};
