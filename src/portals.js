// The world graph: 3 worlds (0 Mars, 1 Earth, 2 Halo) joined by 6 wormhole mouths
// arranged as a triangle. Mouths are paired i <-> i^1: (0,1) Mars/Earth, (2,3) Mars/Halo,
// (4,5) Earth/Halo. Each mouth's dst is the paired mouth's position, so a ray or camera
// that crosses a throat re-emerges at the far mouth.
window.WORMHOLE = (function () {
  const Y = 9; // mouths float above every ground plane (above the lensing influence radius)

  const list = [
    { world: 0, pos: [ 10, Y,  0], dstWorld: 1, dst: [  8, Y, -2] }, // 0  Mars  -> Earth
    { world: 1, pos: [  8, Y, -2], dstWorld: 0, dst: [ 10, Y,  0] }, // 1  Earth -> Mars
    { world: 0, pos: [ -9, Y,  7], dstWorld: 2, dst: [ -9, Y,  5] }, // 2  Mars  -> Halo
    { world: 2, pos: [ -9, Y,  5], dstWorld: 0, dst: [ -9, Y,  7] }, // 3  Halo  -> Mars
    { world: 1, pos: [ -8, Y,  7], dstWorld: 2, dst: [  9, Y, -4] }, // 4  Earth -> Halo
    { world: 2, pos: [  9, Y, -4], dstWorld: 1, dst: [ -8, Y,  7] }, // 5  Halo  -> Earth
  ];

  const n = list.length;
  const pos = new Float32Array(n * 3), dst = new Float32Array(n * 3);
  const world = new Int32Array(n), dstWorld = new Int32Array(n);
  list.forEach((p, i) => { pos.set(p.pos, i*3); dst.set(p.dst, i*3); world[i] = p.world; dstWorld[i] = p.dstWorld; });

  // radius array depends on the live throat slider, so it is rebuilt each frame
  function radArray(throat) { const r = new Float32Array(n); r.fill(throat); return r; }

  // the other mouth in `w` that is not `notIdx` (each world hosts exactly two)
  function otherPortalInWorld(w, notIdx) {
    for (let i = 0; i < n; i++) if (world[i] === w && i !== notIdx) return i;
    return firstPortalInWorld(w);
  }
  function firstPortalInWorld(w) { for (let i = 0; i < n; i++) if (world[i] === w) return i; return 0; }
  const pair = (i) => i ^ 1;

  return { list, count: n, pos, dst, world, dstWorld, radArray, otherPortalInWorld, firstPortalInWorld, pair, INFLUENCE: 4.0 };
})();
