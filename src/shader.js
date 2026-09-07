// Assembles the WebGL fragment shader from the shared chunks plus the pluggable worlds.
// buildFragmentShader() generates the per-world functions and the skyOf/groundOf/hasGround/
// worldTint dispatchers, so the rest of the engine never hard-codes the world list.
window.SHADER = (function () {
  const VERT = "attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }";

  function hexToVec3(hex) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0,2),16)/255, g = parseInt(h.slice(2,4),16)/255, b = parseInt(h.slice(4,6),16)/255;
    return `vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
  }

  const COMMON = `
    float hash21(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      float a = hash21(i), b = hash21(i+vec2(1,0)), c = hash21(i+vec2(0,1)), d = hash21(i+vec2(1,1));
      return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
    }
    float fbm(vec2 p){ float v=0.0, a=0.5; for(int k=0;k<5;k++){ v+=a*vnoise(p); p*=2.03; a*=0.5; } return v; }
    vec3 starfield(vec3 d){
      float u=atan(d.z,d.x), v=asin(clamp(d.y,-1.0,1.0)); vec2 uv=vec2(u,v);
      float neb=fbm(uv*2.0+4.0)*fbm(uv*3.7-2.0);
      vec3 col=mix(vec3(0.004,0.006,0.012), vec3(0.06,0.03,0.12), neb)*neb*1.2;
      for(int L=0;L<3;L++){
        float sc=70.0+float(L)*130.0; vec2 g=uv*sc; vec2 id=floor(g), f=fract(g);
        float h=hash21(id+float(L)*41.7);
        if(h>0.955){
          vec2 sp=vec2(hash21(id+1.7), hash21(id+4.3));
          float star=smoothstep(0.14,0.0,length(f-sp));
          float tw=0.7+0.3*sin(uTime*2.5+h*120.0);
          vec3 sc2=mix(vec3(0.65,0.78,1.0), vec3(1.0,0.87,0.62), hash21(id+8.1));
          col+=star*tw*sc2*((h-0.955)/0.045)*1.6;
        }
      }
      return col;
    }
  `;

  // Ellis / Morris-Thorne wormhole geodesic in the ray plane:
  //   l'' = L^2 l / r^4,  phi' = L / r^2,  r = sqrt(b^2 + l^2)   (RK4)
  const GEODESIC = `
    vec3 pd(vec3 y, float L, float b2){ float r2 = b2 + y.x*y.x; return vec3(y.y, (L*L)*y.x/(r2*r2), L/r2); }
    void traverse(vec3 ro, vec3 rd, vec3 c, float b, out vec3 outLocal, out vec3 outDir, out bool through, out float rim){
      float b2 = b*b, Rinf = b*INFL;
      vec3 rel = ro - c; float r0 = length(rel);
      vec3 e1 = r0 > 1e-5 ? rel/r0 : vec3(1.0,0.0,0.0);
      vec3 perp = rd - dot(rd,e1)*e1; float pl = length(perp);
      vec3 e2 = pl > 1e-5 ? perp/pl : normalize(cross(e1, abs(e1.y) < 0.9 ? vec3(0,1,0) : vec3(1,0,0)));
      float L = r0 * dot(rd, e2);
      vec3 y = vec3(sqrt(max(r0*r0 - b2, 0.0)), dot(rd, e1), 0.0);   // (l, l', phi)
      for (int i = 0; i < PSTEPS; i++){
        float r = sqrt(b2 + y.x*y.x);
        if (r > Rinf + 0.001) break;
        float h = uStepScale * max(0.02, 0.05 * r);
        vec3 k1 = pd(y, L, b2), k2 = pd(y+0.5*h*k1, L, b2), k3 = pd(y+0.5*h*k2, L, b2), k4 = pd(y+h*k3, L, b2);
        y += (h/6.0) * (k1 + 2.0*k2 + 2.0*k3 + k4);
      }
      float l = y.x, phi = y.z, r = sqrt(b2 + l*l);
      float dr = (l/r)*y.y, phidot = L/(r*r);
      vec3 radial = cos(phi)*e1 + sin(phi)*e2;
      vec3 tang   = -sin(phi)*e1 + cos(phi)*e2;
      outDir = normalize(dr*radial + r*phidot*tang);
      outLocal = Rinf * radial;
      through = (l < 0.0);
      float w = max(0.08*b, 0.05);
      rim = exp(-pow((abs(L) - b)/w, 2.0));
    }
  `;

  const TRACE = `
    vec3 trace(vec3 pos, vec3 dir, int world){
      vec3 col = vec3(0.0), glow = vec3(0.0);
      bool done = false;
      for (int seg = 0; seg < MAX_SEG; seg++){
        int hitP = -1; float tNear = 1e9;
        vec3 hitPos = vec3(0.0), hitDst = vec3(0.0); float hitRad = 1.0; int hitDstWorld = 0;
        for (int i = 0; i < NUM_PORTALS; i++){
          if (uPortWorld[i] != world) continue;
          vec3 oc = pos - uPortPos[i]; float R = uPortRad[i] * INFL;
          float d2 = dot(oc, oc); float th;
          if (d2 < R*R) { th = 0.0; }
          else { float bb = dot(oc, dir), cc = d2 - R*R, disc = bb*bb - cc;
                 if (disc < 0.0) continue; th = -bb - sqrt(disc); if (th <= 1e-4) continue; }
          if (th < tNear){ tNear = th; hitP = i; hitPos = uPortPos[i]; hitDst = uPortDst[i]; hitRad = uPortRad[i]; hitDstWorld = uPortDstWorld[i]; }
        }
        float tG = 1e9;
        if (hasGround(world) && dir.y < -1e-4){ float tg = (0.0 - pos.y)/dir.y; if (tg > 1e-4) tG = tg; }

        if (tG < tNear){ col = groundOf(world, pos + dir*tG, dir, tG); done = true; break; }
        if (hitP < 0){ col = skyOf(world, dir); done = true; break; }

        pos += dir * tNear;
        vec3 outLocal, outDir; bool through; float rim;
        traverse(pos, dir, hitPos, hitRad, outLocal, outDir, through, rim);
        if (through){ glow += worldTint(hitDstWorld) * rim * uRim; pos = hitDst + outLocal; dir = outDir; world = hitDstWorld; }
        else       { glow += worldTint(world) * rim * uRim; pos = hitPos + outLocal + outDir*0.01; dir = outDir; }
      }
      if (!done) col = skyOf(world, dir);
      return col * uBright + glow;
    }
  `;

  const MAIN = `
    void main(){
      vec2 base = gl_FragCoord.xy;
      int samples = int(clamp(floor(1.0 + uSoft*3.0 + 0.5), 1.0, 4.0));
      float thv = tan(uFov * 0.5);
      vec3 acc = vec3(0.0);
      for (int sI = 0; sI < 4; sI++){
        if (sI >= samples) break;
        vec2 jit = uSoft > 0.001
          ? (vec2(hash21(base + float(sI)*7.1), hash21(base + float(sI)*13.7)) - 0.5) * uSoft * 2.2
          : vec2(0.0);
        vec2 uv = (base + jit - 0.5*uResolution) / uResolution.y;
        vec3 dir = normalize(uCamFwd + uv.x*thv*uCamRight + uv.y*thv*uCamUp);
        acc += trace(uCamPos, dir, uCamWorld);
      }
      vec3 col = acc / float(samples);
      col = vec3(1.0) - exp(-col * 1.1);
      col = pow(col, vec3(1.0/2.2));
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function buildFragmentShader(worlds, numPortals, influence) {
    let s = `
      precision highp float;
      #define NUM_PORTALS ${numPortals}
      #define MAX_SEG 5
      #define PSTEPS 140
      #define INFL ${influence.toFixed(1)}

      uniform vec2 uResolution; uniform float uTime;
      uniform vec3 uCamPos, uCamRight, uCamUp, uCamFwd; uniform float uFov; uniform int uCamWorld;
      uniform float uRim, uBright, uStepScale, uSoft;
      uniform vec3 uPortPos[NUM_PORTALS]; uniform vec3 uPortDst[NUM_PORTALS];
      uniform float uPortRad[NUM_PORTALS]; uniform int uPortWorld[NUM_PORTALS]; uniform int uPortDstWorld[NUM_PORTALS];
      ${COMMON}
    `;

    // per-world sky functions
    worlds.forEach((w, i) => { s += `\n vec3 wSky${i}(vec3 d){ ${w.sky(i)} }\n`; });

    // skyOf dispatcher
    s += "\n vec3 skyOf(int w, vec3 d){ ";
    worlds.forEach((w, i) => {
      s += (i === 0 ? `if (w==0)` : (i < worlds.length - 1 ? `else if (w==${i})` : `else`)) + ` return wSky${i}(d); `;
    });
    s += "}\n";

    // per-world ground functions (declared after skyOf so they may call it)
    worlds.forEach((w, i) => { if (w.hasGround) s += `\n vec3 wGround${i}(vec3 p, vec3 dir, float t){ ${w.ground(i)} }\n`; });

    // groundOf dispatcher
    s += "\n vec3 groundOf(int w, vec3 p, vec3 dir, float t){ ";
    const grounded = worlds.map((w, i) => [w, i]).filter(([w]) => w.hasGround);
    grounded.forEach(([w, i], k) => {
      s += (k === 0 ? `if (w==${i})` : `else if (w==${i})`) + ` return wGround${i}(p, dir, t); `;
    });
    s += "return vec3(0.0); }\n";

    // hasGround
    s += "\n bool hasGround(int w){ ";
    worlds.forEach((w, i) => { s += `if (w==${i}) return ${w.hasGround ? "true" : "false"}; `; });
    s += "return false; }\n";

    // worldTint (for portal-rim glow, coloured by destination world)
    s += "\n vec3 worldTint(int w){ ";
    worlds.forEach((w, i) => {
      s += (i === 0 ? `if (w==0)` : (i < worlds.length - 1 ? `else if (w==${i})` : `else`)) + ` return ${hexToVec3(w.hex)}; `;
    });
    s += "}\n";

    s += GEODESIC + TRACE + MAIN;
    return s;
  }

  return { VERT, buildFragmentShader };
})();
