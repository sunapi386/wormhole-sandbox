# Physics review: black hole (v1) and wormhole (v2, v3) shaders

Scope: `index.html` (Schwarzschild black hole), `v2.html` (single Ellis wormhole),
`v3.html` (three worlds, six Ellis mouths, free flight and teleport). Units:
G = c = 1, `rs` = Schwarzschild radius (v1), `b` = throat radius (v2, v3).
Every finding is tagged CORRECT, ACCEPTABLE (artistic simplification that does not
misrepresent the physics), or ERROR (visibly or measurably wrong physics), followed
by the correct physics and a shader-implementable fix. A prioritized list is at the end.


## Part 1: v1 Schwarzschild black hole (`index.html`)

### 1.1 Geodesic equation: `acc = -1.5 * uGravity * h2 * pos / pow(dot(pos,pos), 2.5)`

Verdict: CORRECT (exact, not an approximation), with one caveat on `uGravity`.

Derivation. Write the null geodesic in the orbital plane with u = 1/r and prime = d/dphi:

    u'' + u = (3/2) rs u^2                      (Schwarzschild, rs = 2M)

Ask which fictitious central force F(r) = -k / r^4 (per unit mass, in a flat 3-space with an
affine parameter lambda) reproduces this via the Binet equation
u'' + u = -F(1/u) / (h^2 u^2), where h = |pos x vel| = r^2 dphi/dlambda:

    -F(1/u) / (h^2 u^2) = k u^4 / (h^2 u^2) = (k / h^2) u^2   =>   k = 1.5 rs h^2

so acc = -1.5 rs h^2 r_hat / r^4 = -1.5 rs h^2 pos / |pos|^5, which is exactly the shader
expression with rs = 1 and |pos|^5 = pow(dot(pos,pos), 2.5). The orbit shape r(phi) is
therefore exact.

The parametrization is also exact, not just the shape. The fictitious problem has potential
V = -k / (3 r^3) = -rs h^2 / (2 r^3), so its radial energy equation is

    (dr/dlambda)^2 = 2E_N - (h^2 / r^2) (1 - rs / r)

which is term for term the Schwarzschild radial equation for a photon,
(dr/dlambda)^2 = E^2 - (L^2 / r^2)(1 - rs/r), under E^2 = 2E_N and L = h. So `lambda` here
is the true affine parameter and `h` is the true conserved angular momentum L.

Angular momentum is exactly conserved by the integrator too: for a central force the
symplectic-Euler update satisfies pos_new x vel_new = (pos + vel_new dt) x vel_new
= pos x (vel + acc dt) = pos x vel. So caching `h2` once from the initial state is
consistent, not a shortcut.

Caveat on `uGravity`. Because it multiplies the force, `uGravity` is effectively rs.
The horizon test `r < 1.0` and all disk radii are however fixed in units of rs = 1. For
`uGravity = 3` the true horizon is at r = 3 and photon sphere at 4.5 while the shader still
captures only at r < 1 and draws disk gas at 2.7. For `uGravity = 0.5` there is a black ball
of radius 1 around a hole whose horizon is 0.5. See 1.6.

### 1.2 Camera to initial velocity mapping

Verdict: ERROR (small but systematic; the shadow and all lensed features are drawn too large).

The shader sets `vel = dir` where `dir` is the pixel direction of a flat pinhole camera. In
Schwarzschild coordinates the static observer at r0 has orthonormal frame components

    p^(r_hat)   = (1 - rs/r0)^(-1/2) dr/dlambda
    p^(phi_hat) = r0 dphi/dlambda

so a photon seen at angle alpha_obs from the radial direction has coordinate velocity
components (cos alpha_obs * sqrt(1 - rs/r0), sin alpha_obs), i.e. the radial component
is compressed. The shader uses (cos alpha, sin alpha) directly, so

    tan(alpha_obs) = sqrt(1 - rs/r0) * tan(alpha_shader)

At r0 = 14 (default) the factor is 0.964: rendered angular sizes measured from the image
center are 3.8 percent too large. At r0 = 3 (slider minimum) the factor is 0.816: rendered
sizes are about 22 percent too large. The shadow, photon ring and disk images are all
affected by this radial magnification about the image center.

Fix (one line, then recompute h2 from the corrected velocity):

    float rsE = uGravity;                              // effective rs
    float r0  = length(uCamPos);
    vec3  rh  = uCamPos / r0;
    float f   = sqrt(max(1.0 - rsE / r0, 0.0));
    vec3  vel = (dir - dot(dir, rh) * rh) + dot(dir, rh) * rh * f;
    float h2  = dot(cross(pos, vel), cross(pos, vel));

`vel` is then not unit length; that is correct (null geodesics are scale invariant in
lambda and E^2 = 2E_N picks up the right value automatically: |vel|^2 - rs h^2 / r0^3
= 1 - rs/r0 = E^2 for E_obs = 1).

### 1.3 Integrator: symplectic Euler with `dt = uStepScale * (0.045 r + 0.02)`

Verdict: ACCEPTABLE for primary images, marginal for the photon ring.

`vel += acc*dt; pos += vel*dt` is semi-implicit (symplectic) Euler: first order in
position, but for a central force it conserves angular momentum exactly and has bounded
energy error, which is why it does not blow up. Accuracy estimates with default settings:

- Primary lensing (impact parameter b ~ 4 to 6 rs, closest approach r ~ 4 to 6):
  turning rate |acc|/|v| ~ 1.5 b^2 / r^4 ~ 0.06 rad per unit lambda, step ~0.25, so about
  0.015 rad of turning per step. Global deflection error well under 1 percent. Fine.
- Photon sphere (r = 1.5, critical b^2 = 27/4): |acc| = 1.5 * 6.75 / 1.5^4 = 2.0,
  |v| = sqrt(3), turning rate ~1.15 rad per unit lambda, dt = 0.0875, so about 0.10 rad
  (5.8 degrees) per step. For a first-order method that is coarse, and the photon orbit
  is exponentially unstable, so the second and higher photon rings are smeared. The first
  ring (n = 1) survives; n >= 2 does not.
- Step budget: one photon-sphere orbit costs ~62 steps (circumference 9.42 at |v| = sqrt 3,
  dt = 0.0875). The trip in from r0 = 14 and back out to escapeR = 56 costs ~250 steps
  because dt is capped at 0.105 everywhere inside r < uDiskOuter + 2.5 (the cap applies
  even with the disk switched off). That leaves ~110 steps of the 360 budget, under two
  photon-sphere orbits, so near-critical rays that loop twice exhaust the loop.

Two concrete problems:

1. Step exhaustion falls through to the sky. When the loop ends with the ray still near
   r ~ 1.5 and neither `captured` nor escaped, the code paints `sky(normalize(vel))` with
   whatever direction the ray happened to have. Any ray inside r < 1.5 rs has already
   crossed the maximum of the effective potential and has no turning point, so it is
   physically captured. Rule: after the loop, `if (!captured && r < 1.5 * rsE) captured = true;`.
   Exhaustion outside 1.5 rs means near-critical orbiting; either black or sky is defensible.
2. Step size is not tied to curvature. Use a turning-angle criterion, which is cheap:

       float turn = 1.5 * rsE * h2 / (r*r*r*r);           // |acc|
       float dt = clamp(0.03 * length(vel) / max(turn, 1e-4), 0.01, 0.6) * uStepScale;

   (about 0.03 rad of turning per step everywhere; far away it falls back to the cap).

Better still, and what v2 already does: integrate the planar Binet form
`u'' + u = 1.5 rsE u^2` with RK4 in phi. The ray plane is fixed (pos x vel is conserved),
the ODE is smooth and non-stiff, phi steps of 0.02 to 0.05 rad give clean higher-order rings,
capture is `u > 1/rsE`, escape is `u -> 0` with `u' < 0`. Disk crossings become a sign change
of the plane point's y coordinate, which can be root-found within a step instead of
volumetrically marched. This is the single biggest accuracy upgrade available to v1 and
it reuses the v2 code structure (basis e1, e2; reconstruct outgoing direction the same way).

### 1.4 Event horizon and photon sphere

Verdict: CORRECT (for `uGravity = 1`).

With the exact central force, the unstable circular photon orbit sits at the extremum of
V_eff = (h^2 / 2 r^2)(1 - rs/r), i.e. r = 1.5 rs. Critical impact parameter is
b_c = (3 sqrt 3 / 2) rs = 2.598 rs. Capture at r < rs is correct: nothing inside rs can
turn around (V_eff is negative there), so the `r < 1.0` test only needs to be reached; it
does not need to be exact. The `escapeR = |cam| + 42` cutoff leaves at most ~0.03 degrees of
undelivered deflection for shadow-adjacent rays (residual ~ rs b / (2 R^2)), negligible.

### 1.5 Accretion disk: Doppler beaming sign

Verdict: ERROR. The bright side of the disk is the receding side.

`diskEmission` receives `photonDir = vel`, the direction the backward-traced ray is
travelling, i.e. away from the camera. Physical light reaching the camera propagates along
-vel. Then `beam = 1 + uDoppler * dot(orbit, vel)` is greater than 1 (brighter, blue tint)
when the gas velocity `orbit` has a positive component along the ray's outbound direction,
which is when the gas is moving away from the observer.

The texture and the beaming disagree, so this is visible in the animation. Check the
texture rotation: `mat2(ca, -sa, sa, ca)` is column-major, so the matrix is
[[ca, sa], [-sa, ca]] and `q = R(-rot) * p.xz`. A pattern feature at texture point q0
appears at p = R(+rot) q0, so the pattern rotates from +x toward +z, and its velocity at p
is along (-z, x), which is exactly `orbit = normalize(vec3(-p.z, 0, p.x))`. So the gas
visibly moves along `orbit`.

Concrete case: camera at (14, 0, 0) looking toward the origin; gas at (0, 0, 5). There
`orbit = (-1, 0, 0)`, i.e. moving away from the camera. The ray direction is
vel ~ (-14, 0, 5)/14.9, so dot(orbit, vel) = +0.94, beam > 1, and the receding gas is
rendered bright and blue. Sign flipped.

Fix: `float beam = 1.0 + uDoppler * dot(orbit, -normalize(photonDir));` (or flip the sign
of `rot`; either restores consistency, but the beaming sign is the physically wrong one).

### 1.6 Accretion disk: beaming law, redshift, temperature, ISCO

Beaming law: `pow(beam, 2.2)` with `beam = 1 + beta cos theta`, clamped to [0.15, 2.6].
Verdict: ACCEPTABLE artistic, but far from the real numbers; and the blue-only tint is wrong
in the red direction.

Gravitational redshift: absent. Verdict: ERROR by omission (largest missing effect).

Correct physics. For gas on a circular geodesic at radius r in the equatorial plane, the
frequency ratio observed at infinity to emitted is a single scalar g:

    v_orb  = sqrt( rs / (2 (r - rs)) )                    orbital speed seen by a static observer
    g      = sqrt(1 - rs/r) * sqrt(1 - v_orb^2) / (1 - v_orb * dot(n, e_phi))
           = sqrt(1 - 1.5 rs/r) / (1 - v_orb * dot(n, e_phi))

where n is the unit propagation direction of the photon toward the observer (in the local
static frame) and e_phi is the gas velocity direction. The numerator sqrt(1 - 1.5 rs/r) is
the gravitational redshift combined with the transverse Doppler factor (it equals 1/u^t of
the orbit). At the ISCO r = 3 rs: v_orb = 0.5, numerator = 0.707, so g ranges from
0.707/1.5 = 0.47 (receding) to 0.707/0.5 = 1.41 (approaching). Even the side-on gas is
redshifted to 71 percent frequency and (0.707)^4 = 25 percent bolometric brightness. The
shader has none of this: the inner edge is rendered at full local brightness and tint.

Observed intensity: I_nu(obs, nu) = g^3 I_nu(emit, nu/g); bolometric I = g^4 I_emit. For a
blackbody the cleanest statement is that a blackbody at T appears as a blackbody at g T with
the g^3 absorbed. So the correct shader recipe is:

    T_obs   = g * T(rad)
    color   = blackbodyRGB(T_obs)                // Planckian locus fit, normalized chroma
    radiance = pow(T_obs / T_ref, 4.0)           // Stefan-Boltzmann; carries the g^4

At ISCO the approaching/receding brightness ratio is (1.41/0.47)^4 ~ 80:1. This is real
(and is why the Interstellar team deliberately toned it down). Keep an artistic exponent
slider: `radiance = pow(T_obs/T_ref, 4.0 * uBeamStrength)` with 1.0 = physical.

Local frame direction n. In the Cartesian scheme, -vel is the coordinate propagation
direction; convert to static-frame components by scaling the radial part:

    vec3 nph  = -vel;
    vec3 rh   = pos / r;
    float nr  = dot(nph, rh);
    vec3 nloc = normalize((nph - nr*rh) + nr*rh / sqrt(max(1.0 - rsE/r, 1e-3)));

(Using -normalize(vel) directly is a tolerable approximation at r >= 3 rs.)

Beta should be radius dependent (`v_orb` above), not a constant slider; keep `uDoppler` as a
0..1 multiplier on v_orb if a knob is wanted. Note the current linear form
1 + beta cos theta omits the Lorentz factor; the true Doppler factor is
delta = 1 / (gamma (1 - beta cos theta)), which at beta = 0.5 spans 0.58 to 1.73 versus the
shader's 0.5 to 1.5 before clamping and exponent.

Temperature profile: `bright = pow(1 - tnorm, 1.6) + 0.14` with a linear-in-r palette.
Verdict: ACCEPTABLE artistic. Physical thin disk (Shakura-Sunyaev, Novikov-Thorne in the
Newtonian limit):

    T(r)^4  proportional to  r^-3 * (1 - sqrt(r_in / r))

so T goes to zero at the inner edge (zero-torque boundary), peaks at r = (49/36) r_in
~ 1.36 r_in, and falls as r^(-3/4) outside. In shader form:
`float T = Tmax * pow(rin/rad, 0.75) * pow(max(1.0 - sqrt(rin/rad), 0.0), 0.25) / 0.488;`
(0.488 normalizes the peak to Tmax). The visible difference from the current ramp is a
dark, cooler inner rim rather than the brightest gas being at the very edge.

Keplerian shear: `rot = uTime * uSpin * pow(rad, -1.5) * 6.0`.
Verdict: CORRECT. In Schwarzschild coordinates the circular-orbit angular velocity is exactly
Omega = sqrt(M / r^3) = sqrt(rs / (2 r^3)), the same r^-3/2 law as Newton. `uSpin * 6` is a
time scale, fine.

ISCO: default `diskInner = 2.7`, slider minimum 1.2. Verdict: ERROR (mild).
The Schwarzschild ISCO is at 6M = 3 rs. Stable circular orbits do not exist below 3 rs;
between 1.5 rs and 3 rs circular orbits exist but are unstable, and below 1.5 rs no
circular timelike orbit exists at all, so "Keplerian gas" at r = 1.2 is not a thing. Fix:
clamp `diskInner >= 3.0 * uGravity` (or default to it and label the slider as ISCO offset).
If gas inside the ISCO is wanted for looks, render it as a faint plunging region with
free-fall velocity, not as the brightest part of the disk.

Horizon and radii versus `uGravity`: as noted in 1.1, tie all of these to rsE = uGravity:
capture at `r < rsE`, photon sphere 1.5 rsE, ISCO 3 rsE, and the camera correction in 1.2.
Then the "Lensing strength" slider becomes a physical mass slider.

### 1.7 Disk radiative transfer and sampling

Verdict: ACCEPTABLE. The volumetric emission/absorption march (`alpha = dens*dt*5.5`,
`transmit *= 1 - 0.85 alpha`) is an artistic optically-thin-ish disk. With dt ~ 0.1 and
thickness 0.35 a normal-incidence ray gets 3 to 7 samples; grazing rays (default pitch 9
degrees) get many more, which is fine. If the Binet-in-plane integrator from 1.3 is adopted,
switch to a thin disk with an analytic plane crossing per step; that both sharpens the
image and makes the redshift factor g evaluable at a single well-defined radius.

Surface-brightness conservation along rays (I_nu/nu^3 invariant) is implicitly respected by
ray tracing; only the g factors above are missing.

### 1.8 Kerr / frame dragging

Verdict: not worth it until 1.2, 1.5 and 1.6 land. The visible payoffs of Kerr are the
D-shaped, offset shadow (only obvious at a/M > 0.9) and the prograde ISCO shrinking toward
1 M so the disk reaches much deeper (and gets much bluer and brighter on the approaching
side). Cost: a 4D integration in Boyer-Lindquist with the Carter constant, roughly 3x the
per-step work and a fresh set of coordinate singularities to handle at the horizon and axis.
If pursued later, integrate the Hamiltonian form (x^mu, p_mu) with RK4 in Kerr-Schild
coordinates to avoid the horizon singularity, and switch the disk to the Kerr Omega,
v_orb and g-factor (Cunningham 1975 form).


## Part 2: v2 single Ellis wormhole (`v2.html`)

### 2.1 Geodesic reduction: `l'' = curve * L^2 * l / r^4`, `phi' = L / r^2`, `r^2 = b^2 + l^2`

Verdict: CORRECT (exact for `uCurve = 1`).

Lagrangian for ds^2 = -dt^2 + dl^2 + r(l)^2 dOmega^2 in the equatorial plane:
-tdot^2 + ldot^2 + r^2 phidot^2 = 0. Conserved: E = tdot, L = r^2 phidot. Euler-Lagrange for l:
lddot = r r' phidot^2 = r r' L^2 / r^4, and for the Ellis shape r r' = l, so
lddot = L^2 l / r^4. The general Morris-Thorne form is lddot = L^2 r'(l) / r^3, which is
useful for 2.5 below.

Initial conditions: with |dir| = 1 we have E = 1 and ldot^2 + L^2/r^2 = 1 is satisfied by
`y = (l0, dot(dir,e1), 0)` and `L = r0 * dot(dir, e2)` since dot(dir,e1)^2 + dot(dir,e2)^2 = 1.
The static observer's orthonormal frame in this metric is exactly (d/dl, (1/r) d/dphi)
because g_tt = -1 and g_ll = 1, so the pixel direction maps to (ldot, r phidot) with no
correction of the kind needed in v1 (section 1.2). L = r^2 phidot = r0 * (r0 phidot)
= r0 * dot(dir, e2) is the conserved angular momentum, and since E = 1 it is also the
impact parameter.

No redshift is needed. The Ellis metric has g_tt = -1 everywhere: no time dilation and no
gravitational frequency shift for static observers and static skies. The absence of any
redshift treatment in v2 and v3 is CORRECT, unlike v1.

Outgoing direction reconstruction: `dr = (l/r) l'`, `phidot = L/r^2`,
`outDir = dr * radial + r * phidot * tang` with radial = cos(phi) e1 + sin(phi) e2. This is
the derivative of r(lambda) n(phi(lambda)) and is exact for the near side (l > 0). For the
far side see 2.4.

Convention note: v2 treats `|uCamPos|` as the proper radial coordinate l (so r0 = sqrt(b^2 +
l0^2)); v3 treats `|rel|` as the areal radius r (so l = sqrt(r0^2 - b^2)). Both are
self-consistent (the observable is only the direction map), but they are different
embeddings of the flat exterior and a camera at the same distance sees a slightly different
ring size in each. Pick one; the areal choice (v3) is the more natural one to glue to a flat
exterior because circumferences match at the junction.

### 2.2 `uCurve != 1`

Verdict: ACCEPTABLE artistic, with a mismatched rim.

Scaling only the l'' term breaks the first integral: ldot^2 + curve * L^2 / r^2 is what is
conserved, so the system is no longer a geodesic flow of any metric and E is not conserved.
Harmless visually. But the critical impact parameter moves: a ray reaches the throat iff
ldot^2 > 0 at r = b, which for r0 >> b gives |L| < b / sqrt(curve). The rim glow is centered
on |L| = b regardless, so for curve != 1 the glow ring and the actual lensing ring separate.
Cheap fix: center the rim on `b / sqrt(uCurve)`. Better fix in 2.5.

### 2.3 Rim: `exp(-((|L| - b) / w)^2)`, is |L| = b the marginal ray?

Verdict: CORRECT (for curve = 1), with a terminology note.

The radial equation is ldot^2 = 1 - L^2 / (b^2 + l^2). The effective potential L^2/r^2 is
maximal at the throat l = 0, so |L| < b passes through, |L| > b turns at l = sqrt(L^2 - b^2)
and comes back, and |L| = b asymptotically winds onto the throat (the unstable photon orbit
of this geometry). So |L| = b is exactly the marginal, throat-grazing ray, and its angular
radius seen from r0 is sin(alpha) = b / r0 exactly.

Terminology: this is the critical curve (photon-sphere ring), not an Einstein ring in the
strict sense (there is no point source behind the lens). Physically it carries no emission;
it is bright only because infinitely many increasingly faint images of both skies pile up
there. The added glow is ACCEPTABLE artistic; a purely physical render would show the
critical curve as the boundary where the far-world image folds over into the near-world image.

Near-critical rays wind many times: at r ~ b = 1 with h = 0.06, one orbit costs ~105 of the
240 steps, so rays with |L| within a few percent of b end the loop still near the throat and
paint whatever direction they had. The glow hides this. If the glow is turned down, either
raise MAX_STEPS or treat rays that end with r < 1.5 b as "ring" and shade them with the
rim color or a blend of both skies.

### 2.4 Through-throat continuation and parity

Verdict: ACCEPTABLE in v2 as a convention, but it silently mirror-reverses the far world,
and it is the root of the v3 discontinuity in 3.3.

The shader continues the (theta, phi) angular coordinates through the throat unchanged and
embeds the far sheet as position = B + r n(theta, phi), then looks up the far sky in
`outDir`. On the far sheet, dr/dl = l/r < 0, so d/dl points toward the mouth center. The
transported frame (d/dl, d/dtheta, d/dphi), which is right-handed relative to world A's
axes (outward, theta, phi), arrives as (inward, theta, phi) relative to world B's axes,
determinant -1. The spacetime is orientable; the embedding is not parity-consistent with
"both worlds are the same right-handed R^3". Observable consequence: the far world's sky
seen inside the mouth is mirror-reversed relative to what a local observer there sees, and a
central ray entering at position A + 3b e1 heading -e1 emerges at B + 3b e1 heading +e1,
i.e. on the same side and pointing back. The mouth acts like a reflective ball that shows the
other world; the center of the mouth shows the far sky in the direction from B toward the
viewer's own position.

General statement. The far sheet can be embedded as position = B + r R(n) and direction
R(outDir) for any fixed R in O(3); every choice is a legitimate identification of the two
asymptotic regions (an isometry of the throat sphere). Orientation is preserved iff
det R = -1, because R has to cancel the radial flip. Three natural choices:

- R = I (current). Upright image of the far world's "behind" hemisphere, mirror-reversed.
  Mouth looks like a convex mirror showing the other world.
- R = -I (antipodal). Parity preserved and the center shows "ahead", but a pixel above the
  center now shows the far world's "ahead and down": the image is rolled 180 degrees about
  the line of sight (ground at the top of the mouth). Not a good fix.
- R = I - 2 a a^T, reflection through the plane perpendicular to a fixed per-pair unit
  axis a. For approaches along a: R(-a) = a and R leaves every vector perpendicular to a
  unchanged, so the central ray emerges heading straight ahead and the "up" and "sideways"
  pixels stay up and sideways. Upright, non-mirrored, parity-preserving window for approaches
  along a; mirror-ball-like for side approaches. Both mouths of a pair must share a (in each
  world's axis convention) so the round trip is the identity (R^2 = I).

For v2 the identity map is ACCEPTABLE: with procedural skies the mirror reversal is not
perceptible and there is no traversal to stay consistent with. For v3 the reflection map is
the right choice; see 3.3.

### 2.5 A physical replacement for `uCurve`: the Morris-Thorne / DNEG two-parameter throat

The general spherically symmetric static wormhole with g_tt = -1 is ds^2 = -dt^2 + dl^2 +
r(l)^2 dOmega^2 with any r(l) >= b. The geodesic equation is lddot = L^2 r'(l) / r^3,
phidot = L / r^2. The "Interstellar" throat (James, von Tunzelmann, Franklin, Thorne 2015)
has a throat half-length a and lensing width W:

    r(l) = b                                     for |l| <= a
    r(l) = b + M [ x atan(x) - 0.5 ln(1 + x^2) ] for |l| > a, x = 2 (|l| - a) / (pi M)

with M = W / 1.42953. This gives an artist-tunable "curvature" (W) and "throat length" (a)
that remain exact geodesics with conserved E, and a critical impact parameter that is still
exactly |L| = b. Implementation is only a change in `deriv`: replace `y.x / (r2*r2)` by
`rprime(l) / (r*r*r)` with r and r' from the formula above (three transcendental calls per
derivative evaluation, four per RK4 step, well within budget at 240 steps).

### 2.6 Integrator and termination

RK4 with h = uStepScale * max(0.03, 0.06 r): CORRECT and sufficient. Deflection tail beyond
`escapeR = 1.5 l0 + 34` is of order b^2 / R^2 ~ 4e-4 rad, negligible.


## Part 3: v3 wormhole network (`v3.html`)

### 3.1 Nearest-influence-sphere transport, no metric superposition

Verdict: ACCEPTABLE for the default layout; degrades at large throat size.

There is no exact multi-Ellis solution to work from (the Ellis geometry needs exotic matter
and GR is nonlinear), and in the weak field b^2 / r^2 << 1 the metric perturbations of two
distant mouths add to first order. So "bend by the nearest throat only, straight lines
elsewhere" is the right approximation as long as influence spheres do not overlap. With the
default b = 1.3, Rinf = 3.9 and mouth separations of 13 to 14 in every world, they do not.
At the slider maximum b = 3.0, Rinf = 9 exceeds half the mouth separations (6.5 to 7) and
the first-hit rule silently drops the second mouth's lensing for rays in the overlap. Also
at large b the Verdant and Ember spheres (centers at y = 4.5) dip below y = 0 and the ground
plane is never tested inside a sphere, so ground that should occlude the mouth from below
is skipped. Both are edge cases of the slider range; either cap the throat slider at about
2.0 or test the ground plane inside `traverse` (one extra plane intersection per RK4 step
in the local Cartesian reconstruction).

### 3.2 Truncation at Rinf = 3b

Verdict: ACCEPTABLE, with a visible seam at the silhouette.

The Ellis metric at l = 2.83 b (r = 3b) is not flat: dr/dl = 0.94. Gluing flat space there
matches the circumference (areal radius) but not the radial derivative, i.e. a thin shell.
The direction map at the junction is handled correctly (local orthonormal components are
used), so the error is only the undelivered far-field bending. Leading-order weak-field
deflection of the Ellis wormhole is alpha ~ (pi/4)(b/a)^2 for impact parameter a >> b.
A ray grazing the sphere at a = 3b should bend by about pi/36 ~ 5 degrees and bends by zero
in the sim; at a = 6b the missing bend is about 1.2 degrees. Visually this is a faint
discontinuity in the sky distortion at the projected edge of the influence sphere.

Fix: raise Rinf to 5b or 6b and let the step grow faster far from the throat (curvature
scales as b^2 / r^4, so `h = uStepScale * max(0.02, 0.1 * r * r / b)` is safe outside
2b). Since |dr/dlambda| <= 1, r moves by at most h per step, so cap the step at the
remaining distance to the sphere, `h = min(h, max(Rinf - r, 0.0) + 0.02)`, to keep the
overshoot below 0.02 (the extrapolation in 3.4 only handles r < Rinf). This needs the step
budget in 3.4.

### 3.3 Paired-mouth transport with identity local frame, and the teleport

Verdict: ERROR. The ray continuation and the camera teleport use different identifications,
so the view through a mouth and the view after flying through it differ by 180 degrees.

Rays: `pos = hitDst + outLocal; dir = outDir` is the identity embedding of section 2.4.
A central ray entering mouth A from the -fwd side (camera at A - 3b fwd looking along fwd)
exits at B - 3b fwd heading -fwd: same side, pointing back toward the direction it came
from. The center of the mouth shows world B in the direction -fwd.

Camera: `cam.pos = dst + 1.4 b * fwd` with unchanged `fwd`. The camera emerges on the far
side of B heading +fwd with right and up unchanged. That is the transport of the
reflection map of 2.4 for an approach along a, not the identity map the rays use.
Immediately after the flash the
center pixel shows world B in direction +fwd.

These are opposite directions. The flash hides a 180 degree cut, and the far world seen
through the mouth is additionally mirror-reversed relative to the world you arrive in (see
the handedness computation in 2.4). Because the two mouths of a pair reference each other,
each map is an involution and consistent with itself, so the bug is purely the mismatch.

Which side to change. Making the camera match the current rays (R = I) means the camera
bounces back out the same side with its forward direction radially reflected, which is
not the intended "fly through" experience. The antipodal map (R = -I) makes the center
show "ahead" but rolls the image 180 degrees, and the yaw/pitch camera has no roll to
compensate. The reflection map R = I - 2 a a^T from 2.4 is the one whose camera transport
for approaches along a is exactly "keep position mirrored across the mouth, keep fwd, keep
right and up", i.e. what the teleport already does. So change the rays to the reflection
map and make the teleport its exact transform.

Shader (through case only), with one new `uniform vec3 uPortAxis[NUM_PORTALS]` holding the
per-pair unit axis a, captured into `hitAxis` in the portal loop like the other fields:

    #define REFL(v, a) ((v) - 2.0 * dot((v), (a)) * (a))
    if (through){
      pos = hitDst + REFL(outLocal, hitAxis);
      dir = REFL(outDir, hitAxis);
      world = hitDstWorld;
    }

JS teleport, applied when |p| < b with p = cam.pos - src and p_hat = p / |p|. Identity
transport through the throat flips the radial component of every vector, then R is applied:

    T(v)   = REFL(v - 2 dot(v, p_hat) p_hat, a)
    cam.pos = dst + REFL(p, a) * (1.1 b / |p|)
    fwd'    = T(fwd), right' = T(right), up' = T(up)   ->   yaw, pitch from fwd'

For approaches along a, T(fwd) = fwd and right, up are unchanged, so this reduces to the
existing code. For off-axis entries the transported frame can carry a roll that the
yaw/pitch camera cannot represent; re-deriving yaw and pitch from fwd' and dropping the
roll is acceptable (it is small for near-axis entries). Both mouths of a pair must store the
same a. A reasonable default is the horizontal unit vector from the world origin to the mouth
position, or whatever direction the mouth is meant to be approached from; both mouths of a
pair get the same vector.

Verification: fly along a straight into a mouth. The mouth interior should show the far
world upright and ahead (sky at the top of the mouth, ground at the bottom, sun on the
same side as when you arrive), and the frame after the teleport should match the frame
before it up to the lensing of the sphere you are now inside; the flash becomes optional.
Ground appearing at the top of the mouth interior means the map still carries a roll.

### 3.4 PSTEPS = 80 and early termination

Verdict: ERROR (accuracy), tied to the quality slider.

`uStepScale` is the quality slider value (0.6 to 2.5). The central through-ray path is the
integral of dl / h from l = -2.83b to +2.83b with h = 0.05 r uStepScale (r = sqrt(b^2 + l^2)):
40 asinh(2.83) / uStepScale ~ 71 / uStepScale steps. At slider 1.0 that is 71 of 80 (fits
barely); at slider 0.6 (labelled 1.67x quality) it needs ~118 and runs out. Near-critical
rays need ~125 steps per throat orbit and always run out. When the loop ends early,
`outLocal = Rinf * radial` snaps the ray radially out to the sphere at its current angular
position with its current direction. For direction-only skies that is a parallax error
only, but for ground planes and for subsequent portal intersections it is a position error
of up to (Rinf - r), and for near-critical rays the direction is wrong because the remaining
bending was never integrated. So "higher quality" currently makes v3 worse.

Fix: PSTEPS 160, plus the far-field step from 3.2, plus on early exit propagate the ray in a
straight line to the sphere instead of snapping:

    // after the loop, if r < Rinf: straight-line to the sphere
    vec3 p = r * radial;  // local Cartesian position in the plane basis
    float tt = -dot(p, outDir) + sqrt(max(dot(p,outDir)*dot(p,outDir) - dot(p,p) + Rinf*Rinf, 0.0));
    outLocal = p + outDir * tt;

### 3.5 Rim, world lookup, flight

Rim: same formula as v2, same verdict (critical curve, artistic glow, correct location for
curve = 1). Tinting the rim with the destination world color is artistic.

Skies: both worlds share one Cartesian axis convention, so the identity map, and the
reflection map with a horizontal axis a, both carry "up" to "up". Fine.

Flight: non-relativistic camera motion, no aberration. CORRECT at these speeds; the Ellis
metric has no time dilation so there is nothing else to add for a moving observer at v << c.


## Prioritized fixes

1. v3: through-throat continuation. Apply a fixed per-pair reflection
   R(v) = v - 2 dot(v, a) a to `outLocal` and `outDir` in the through branch (one new
   `uniform vec3 uPortAxis[6]`), and make the teleport its exact transform (section 3.3).
   Makes the view through a mouth continuous with the view after flying through, keeps the
   far world upright and non-mirrored. Largest visible bug. (Do not use the antipodal map
   `-outLocal, -outDir`: parity is right but the image rolls 180 degrees.)
2. v1: Doppler beaming sign. `dot(orbit, -normalize(photonDir))`. One-token change; the
   bright side is currently the receding side.
3. v1: gravitational plus transverse redshift and physical beaming. Compute the g factor
   g = sqrt(1 - 1.5 rs/r) / (1 - v_orb dot(n, e_phi)) with v_orb = sqrt(rs / (2 (r - rs))),
   then render a blackbody at g T with radiance (g T / T_ref)^4; keep an exponent slider for
   taste. Replaces `pow(beam, 2.2)` and the blue-only tint with the real thing.
4. v1: ISCO and horizon tied to `uGravity`. Clamp `diskInner >= 3 rsE`, capture at
   `r < rsE`, treat step exhaustion at `r < 1.5 rsE` as captured. Optionally the
   Novikov-Thorne temperature profile with T -> 0 at the inner edge.
5. v3: step budget. PSTEPS 160, faster far-field step, straight-line extrapolation to the
   influence sphere on early exit. Fixes the quality slider making things worse.
6. v1: camera frame correction. Scale the radial component of the initial velocity by
   sqrt(1 - rsE/r0) and recompute h2. Removes a 4 percent (default) to 22 percent (r0 = 3)
   magnification error of the shadow and ring.
7. v1: integrator. Move to the planar Binet form with RK4 (reuse the v2 structure), or at
   least a curvature-based step. Recovers second and higher photon rings.
8. v2/v3: replace `uCurve` with the Morris-Thorne (a, W) throat, which keeps rays geodesic
   and the rim at exactly |L| = b; or at minimum center the rim on b / sqrt(uCurve).
9. v3: Rinf 5b to 6b (removes the ~5 degree seam at the sphere silhouette), cap the throat
   slider near 2.0 or test the ground plane inside the sphere.
10. Kerr: defer. Only worth it after 3 and 4, and only if the D-shaped high-spin shadow or a
    disk reaching to ~1 M is specifically wanted.
