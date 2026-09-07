// Pluggable worlds. Each world provides GLSL snippets (as functions of its own index `i`,
// so ground can call its own sky function `wSky${i}`), plus metadata. Adding a world is just
// another entry here; src/shader.js assembles them into the fragment shader and generates the
// skyOf / groundOf / hasGround / worldTint dispatchers automatically.
//
// In `sky` the incoming ray direction is `vec3 d`. In `ground` the hit point is `vec3 p`, the
// ray direction is `vec3 dir`, and `float t` is the distance to the ground (for fog).
// Shared helpers available: hash21, vnoise, fbm, starfield, and the uniform uTime.
window.WORMHOLE_WORLDS = [
  {
    name: "Mars", hex: "#d98a5a", hasGround: true,
    // Mars: butterscotch sky, a pale shrunken sun, and Olympus Mons on the horizon.
    sky: () => `
      float y = clamp(d.y, 0.0, 1.0);
      vec3 sky = mix(vec3(0.86,0.63,0.45), vec3(0.30,0.24,0.28), pow(y, 0.75));
      vec3 sun = normalize(vec3(0.5, 0.30, 0.78));
      float s = max(dot(d, sun), 0.0);
      sky += vec3(1.0,0.88,0.70) * pow(s, 800.0) * 2.2;
      sky += vec3(0.9,0.7,0.5) * pow(s, 4.0) * 0.10;
      // Olympus Mons: a very broad, low shield volcano sitting on the horizon.
      float az = atan(d.z, d.x);
      float da = atan(sin(az + 1.1), cos(az + 1.1));
      float within = step(abs(da), 0.95);
      float prof = (0.22 - 0.16 * clamp(abs(da) / 0.9, 0.0, 1.0)) + 0.02 * fbm(vec2(da*8.0, 3.0));
      float m = smoothstep(prof + 0.01, prof - 0.01, d.y) * step(0.0, d.y) * within;
      vec3 volc = mix(vec3(0.30,0.14,0.09), vec3(0.44,0.23,0.15), fbm(vec2(da*5.0, d.y*22.0)));
      sky = mix(sky, volc, m);
      return sky;
    `,
    ground: (i) => `
      float n = fbm(p.xz * 0.5) * 0.6 + fbm(p.xz * 2.5) * 0.4;
      vec3 g = mix(vec3(0.45,0.20,0.11), vec3(0.66,0.36,0.22), n);
      g *= 0.8 + 0.3 * fbm(p.xz * 11.0);
      float fog = 1.0 - exp(-t * 0.02);
      return mix(g, wSky${i}(normalize(vec3(dir.x, 0.05, dir.z))), fog);
    `,
  },
  {
    name: "Earth", hex: "#5a9bd9", hasGround: true,
    // Earth: Monterey Pacific coast. Blue sky with sun and drifting cloud, ocean below.
    sky: () => `
      vec3 sun = normalize(vec3(0.3, 0.30, 0.9));
      float y = clamp(d.y, 0.0, 1.0);
      vec3 sky = mix(vec3(0.72,0.83,0.96), vec3(0.14,0.37,0.80), y);
      float s = max(dot(d, sun), 0.0);
      sky += vec3(1.0,0.97,0.90) * pow(s, 2200.0) * 7.0;
      sky += vec3(1.0,0.90,0.75) * pow(s, 6.0) * 0.16;
      float cl = fbm(d.xz / max(d.y, 0.12) * 1.0 + uTime * 0.008);
      sky = mix(sky, vec3(1.0), smoothstep(0.62, 0.95, cl) * clamp(d.y * 2.0, 0.0, 1.0) * 0.8);
      return sky;
    `,
    ground: (i) => `
      vec2 uv = p.xz;
      float ripple = fbm(uv * 1.8 + vec2(uTime*0.25, uTime*0.15)) * 0.6 + fbm(uv * 6.0 - uTime*0.2) * 0.4;
      vec3 water = mix(vec3(0.02,0.15,0.22), vec3(0.09,0.33,0.40), ripple);
      vec3 sun = normalize(vec3(0.3, 0.30, 0.9));
      vec3 nrm = normalize(vec3((fbm(uv*3.0+1.0)-0.5)*0.5, 1.0, (fbm(uv*3.0+7.0)-0.5)*0.5));
      float spec = pow(max(dot(reflect(dir, nrm), sun), 0.0), 60.0);
      water += vec3(1.0,0.96,0.85) * spec * 1.4;
      float fog = 1.0 - exp(-t * 0.02);
      return mix(water, wSky${i}(normalize(vec3(dir.x, 0.03, dir.z))), fog);
    `,
  },
  {
    name: "Halo", hex: "#7fd98a", hasGround: true,
    // Halo: a ringworld. The far side of the ring arcs overhead as a great band of land
    // (a great circle perpendicular to axis k), space and stars beyond, plus a distant sun.
    sky: () => `
      vec3 col = starfield(d) * 0.9;
      vec3 k = normalize(vec3(1.0, 0.06, 0.0));
      float bd = abs(dot(d, k));
      float band = smoothstep(0.36, 0.0, bd);
      if (band > 0.001) {
        vec3 perp = normalize(cross(k, vec3(0.0,1.0,0.0)));
        float ang = atan(dot(d, vec3(0.0,1.0,0.0)), dot(d, perp));
        vec3 land = mix(vec3(0.15,0.33,0.19), vec3(0.42,0.44,0.40), fbm(vec2(ang*3.0, bd*26.0)));
        land *= 0.75 + 0.4 * fbm(vec2(ang*13.0, 5.0));
        land = mix(land, vec3(0.09,0.24,0.42), smoothstep(0.5, 0.72, fbm(vec2(ang*2.0, 1.3))) * 0.55);
        col = mix(col, land, band);
        float edge = smoothstep(0.36, 0.31, bd) * (1.0 - smoothstep(0.31, 0.26, bd));
        col += vec3(0.5,0.75,1.0) * edge * 0.5;
      }
      col += vec3(1.0,0.96,0.88) * pow(max(dot(d, normalize(vec3(0.55,0.4,0.72))), 0.0), 3000.0) * 9.0;
      return col;
    `,
    ground: (i) => `
      float n = fbm(p.xz * 0.4) * 0.6 + fbm(p.xz * 2.0) * 0.4;
      vec3 g = mix(vec3(0.16,0.33,0.16), vec3(0.35,0.40,0.28), n);
      g *= 0.8 + 0.3 * fbm(p.xz * 9.0);
      float fog = 1.0 - exp(-t * 0.03);
      return mix(g, wSky${i}(normalize(vec3(dir.x, 0.06, dir.z))), fog);
    `,
  },
];
