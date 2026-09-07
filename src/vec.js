// Minimal 3-vector helpers shared across the engine. Vectors are plain [x,y,z] arrays.
window.VEC = {
  add:  (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]],
  sub:  (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]],
  scale:(a, s) => [a[0]*s, a[1]*s, a[2]*s],
  dot:  (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2],
  cross:(a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]],
  len:  (a)    => Math.hypot(a[0], a[1], a[2]),
  norm: (a)    => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; },
  lerp: (a, b, t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t],
  clamp:(x, a, b) => Math.max(a, Math.min(b, x)),
  mix:  (a, b, t) => a + (b - a) * t,
  smoother: (u) => { u = Math.max(0, Math.min(1, u)); return u*u*u*(u*(u*6-15)+10); },
  lerpAngle: (a, b, t) => { let d = ((b - a + Math.PI) % (2*Math.PI)) - Math.PI; if (d < -Math.PI) d += 2*Math.PI; return a + d*t; },
};
