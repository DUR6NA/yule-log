// The hearth: a WebGL2 fluid simulation of fire (buoyant heat advected through
// a velocity field with vorticity confinement), burning on procedurally shaded
// logs inside a brick firebox, with sparks.

// Scene units: x is centred on the fire, y runs up from the bottom of the view,
// one unit is the view height at scale 1.
const LOGS = [
  // a, b: ends of the log's axis. r: radius. cap: width of the cut face drawn at end b.
  { a: [-0.46, 0.228], b: [0.45, 0.248], r: 0.086, cap: 0.42 }, // back log
  { a: [-0.31, 0.318], b: [0.31, 0.392], r: 0.068, cap: 0.55 }, // resting on top
  { a: [0.5, 0.158], b: [-0.43, 0.17], r: 0.092, cap: 0.42 }, // front log
];

const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
`;

const LIB = /* glsl */ `
uniform vec2 uView;     // x: aspect (w/h), y: scene scale
uniform float uCenterX; // uv x of the hearth's centre
uniform float uTime;
uniform vec4 uLog[3];   // a.xy, b.xy
uniform vec2 uLogR[3];  // radius, cap width

vec2 toScene(vec2 uv) { return vec2((uv.x - uCenterX) * uView.x, uv.y) / uView.y; }

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
// Gradient noise, roughly -0.7..0.7
float gnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6. - 15.) + 10.);
  float a = dot(hash22(i) * 2. - 1., f);
  float b = dot(hash22(i + vec2(1, 0)) * 2. - 1., f - vec2(1, 0));
  float c = dot(hash22(i + vec2(0, 1)) * 2. - 1., f - vec2(0, 1));
  float d = dot(hash22(i + vec2(1, 1)) * 2. - 1., f - vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0., a = .5;
  for (int i = 0; i < 5; i++) { s += a * gnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; }
  return s + .5;
}

struct LogHit { float d; float dFace; float s; float v; float len; float r; float cap; };

LogHit logGeom(vec2 p, int i) {
  vec2 a = uLog[i].xy, b = uLog[i].zw;
  float r = uLogR[i].x, cap = uLogR[i].y;
  vec2 ba = b - a;
  float len = length(ba);
  vec2 dir = ba / len;
  vec2 nrm = vec2(-dir.y, dir.x);
  nrm *= sign(nrm.y + 1e-5); // "up" across the log, whichever way it points
  vec2 pa = p - a;
  float s = dot(pa, dir);
  float w = dot(pa, nrm);
  float bump = 1. + .05 * gnoise(vec2(s * 11., float(i) * 5.3 + sign(w) * 2.)) ;
  vec2 q = vec2(abs(s - len * .5) - len * .5, abs(w) - r * bump);
  float dBody = length(max(q, 0.)) + min(max(q.x, q.y), 0.);
  float er = r * cap;
  float dA = (length(vec2(s / er, w / r)) - 1.) * er;
  float dB = (length(vec2((s - len) / er, w / r)) - 1.) * er;
  return LogHit(min(dBody, min(dA, dB)), dB, s, w / r, len, r, cap);
}

float logsSdf(vec2 p) {
  return min(logGeom(p, 0).d, min(logGeom(p, 1).d, logGeom(p, 2).d));
}

// Where flames are born: just above the top of the log pile (wherever a log lies
// right underneath) and on the coal bed, hottest in the middle, in wandering
// patches so separate tongues form.
float emitter(vec2 p) {
  float d = logsSdf(p);
  float below = logsSdf(p - vec2(0., .07));
  float e = smoothstep(.065, .006, d) * step(-.004, d) * smoothstep(.015, -.02, below);
  e = max(e, smoothstep(.05, 0., abs(p.y - .13)) * smoothstep(.4, .08, abs(p.x)));
  e *= smoothstep(.56, .08, abs(p.x));
  float patches = .5 + .35 * gnoise(vec2(p.x * 8. + 3.1, uTime * .5)) + .7 * gnoise(vec2(p.x * 22. - 1.3, uTime * 1.8));
  return e * smoothstep(.38, .62, patches);
}
`;

const COMMON = HEADER + 'out vec4 outColor;\n' + LIB;

const QUAD_VS = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0, 1); }
`;

// --- Simulation passes -------------------------------------------------------

const CURL_FS = COMMON + /* glsl */ `
uniform sampler2D uVel;
uniform vec2 uTexel;
void main() {
  float L = texture(uVel, vUv - vec2(uTexel.x, 0)).y;
  float R = texture(uVel, vUv + vec2(uTexel.x, 0)).y;
  float B = texture(uVel, vUv - vec2(0, uTexel.y)).x;
  float T = texture(uVel, vUv + vec2(0, uTexel.y)).x;
  outColor = vec4(.5 * (R - L - T + B), 0, 0, 1);
}`;

// Vorticity confinement, buoyancy, turbulence, and the logs as solid obstacles.
const FORCES_FS = COMMON + /* glsl */ `
uniform sampler2D uVel, uCurl, uHeat;
uniform vec2 uTexel;
uniform float uDt, uCurlStrength, uBuoyancy, uTurbulence, uFire;
void main() {
  vec2 vel = texture(uVel, vUv).xy;
  float L = texture(uCurl, vUv - vec2(uTexel.x, 0)).x;
  float R = texture(uCurl, vUv + vec2(uTexel.x, 0)).x;
  float B = texture(uCurl, vUv - vec2(0, uTexel.y)).x;
  float T = texture(uCurl, vUv + vec2(0, uTexel.y)).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = .5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 1e-4;
  force *= uCurlStrength * C;
  force.y *= -1.;
  vel += force * uDt;

  vec2 hs = texture(uHeat, vUv).xy;
  vel.y += uDt * (uBuoyancy * hs.x - 30. * hs.y);

  vec2 p = toScene(vUv);
  float n = .3 * gnoise(p * vec2(5., 3.) + vec2(uTime * .3, -uTime * 1.4)) + gnoise(p * vec2(16., 8.) + vec2(3.1, -uTime * 4.2));
  vel.x += uDt * uTurbulence * n * (.25 + hs.x);

  float e = emitter(p) * min(uFire, 1.);
  vel.y = mix(vel.y, max(vel.y, 130. + 120. * uFire), e * .4);

  // Chimney draft: a hot flue pulls the whole column of air above the logs upward,
  // which keeps the flames standing instead of puffing and collapsing.
  float column = smoothstep(.62, .2, abs(p.x)) * smoothstep(.12, .3, p.y);
  vel.y += uDt * 2.5 * column * max((50. + 90. * min(uFire, 1.)) - vel.y, 0.);

  vel *= 1. / (1. + .35 * uDt);
  if (logsSdf(p) < 0.) vel = vec2(0);
  outColor = vec4(vel, 0, 1);
}`;

const DIVERGENCE_FS = COMMON + /* glsl */ `
uniform sampler2D uVel;
uniform vec2 uTexel;
void main() {
  float L = texture(uVel, vUv - vec2(uTexel.x, 0)).x;
  float R = texture(uVel, vUv + vec2(uTexel.x, 0)).x;
  float B = texture(uVel, vUv - vec2(0, uTexel.y)).y;
  float T = texture(uVel, vUv + vec2(0, uTexel.y)).y;
  vec2 C = texture(uVel, vUv).xy;
  if (vUv.x - uTexel.x < 0.) L = -C.x;
  if (vUv.x + uTexel.x > 1.) R = -C.x;
  if (vUv.y - uTexel.y < 0.) B = -C.y;
  outColor = vec4(.5 * (R - L + T - B), 0, 0, 1);
}`;

const SCALE_FS = COMMON + /* glsl */ `
uniform sampler2D uSrc;
uniform float uScale;
void main() { outColor = texture(uSrc, vUv) * uScale; }`;

const PRESSURE_FS = COMMON + /* glsl */ `
uniform sampler2D uPressure, uDivergence;
uniform vec2 uTexel;
void main() {
  float L = texture(uPressure, vUv - vec2(uTexel.x, 0)).x;
  float R = texture(uPressure, vUv + vec2(uTexel.x, 0)).x;
  float B = texture(uPressure, vUv - vec2(0, uTexel.y)).x;
  float T = texture(uPressure, vUv + vec2(0, uTexel.y)).x;
  float div = texture(uDivergence, vUv).x;
  outColor = vec4((L + R + B + T - div) * .25, 0, 0, 1);
}`;

const GRADIENT_FS = COMMON + /* glsl */ `
uniform sampler2D uPressure, uVel;
uniform vec2 uTexel;
void main() {
  float L = texture(uPressure, vUv - vec2(uTexel.x, 0)).x;
  float R = texture(uPressure, vUv + vec2(uTexel.x, 0)).x;
  float B = texture(uPressure, vUv - vec2(0, uTexel.y)).x;
  float T = texture(uPressure, vUv + vec2(0, uTexel.y)).x;
  vec2 vel = texture(uVel, vUv).xy - vec2(R - L, T - B);
  outColor = vec4(vel, 0, 1);
}`;

const ADVECT_VEL_FS = COMMON + /* glsl */ `
uniform sampler2D uVel;
uniform vec2 uTexel;
uniform float uDt;
void main() {
  vec2 coord = vUv - uDt * texture(uVel, vUv).xy * uTexel;
  outColor = vec4(texture(uVel, coord).xy, 0, 1);
}`;

// Heat (x) and smoke (y): advected, cooled by a scrolling noise field so
// flame tongues tear off and flicker, and fed from the tops of the logs.
const ADVECT_HEAT_FS = COMMON + /* glsl */ `
uniform sampler2D uVel, uHeat;
uniform vec2 uTexel;
uniform float uDt, uFire, uCooling;

void main() {
  vec2 vel = texture(uVel, vUv).xy;
  vec2 coord = vUv - uDt * vel * uTexel;
  vec2 hs = texture(uHeat, coord).xy;
  vec2 p = toScene(vUv);

  float cn = .5 + .55 * gnoise(p * vec2(11., 5.) + vec2(0., -uTime * 2.8));
  cn += .4 * gnoise(p * vec2(27., 14.) + vec2(1.7, -uTime * 5.));
  float h = hs.x;
  float smoke = hs.y;
  float lift = 1. + 2.4 * smoothstep(.48, .95, p.y); // flames give out well below the lintel
  float lost = min(h, uDt * uCooling * lift * (.12 + 1.5 * cn * cn));
  h -= lost;
  smoke = smoke * (1. - .5 * uDt) + lost * .35;

  float flicker = .5 + .5 * gnoise(vec2(p.x * 13., uTime * 3.3));
  h = max(h, uFire * emitter(p) * (.85 + .85 * flicker));

  float inside = smoothstep(-.012, 0., logsSdf(p));
  h *= inside;
  smoke *= inside;
  outColor = vec4(h, min(smoke, 1.), 0, 1);
}`;

// --- Display passes ----------------------------------------------------------

const FIRE_COLOR = /* glsl */ `
vec3 fireColor(float h) {
  float t = max(h, 0.);
  vec3 c = vec3(1., .07, .005) * smoothstep(.02, .22, t) * .9;
  c += vec3(1., .35, .03) * smoothstep(.15, .5, t);
  c += vec3(.8, .62, .25) * smoothstep(.4, .9, t);
  c += vec3(.6, .65, .6) * smoothstep(.85, 1.35, t);
  return c * (.35 + 1.9 * t);
}`;

const EMIT_FS =
  COMMON +
  FIRE_COLOR +
  /* glsl */ `
uniform sampler2D uHeat;
void main() { outColor = vec4(fireColor(texture(uHeat, vUv).x), 1); }`;

const BLUR_FS = COMMON + /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uDir;
void main() {
  vec3 c = texture(uSrc, vUv).rgb * .2270270270;
  vec2 o1 = uDir * 1.3846153846, o2 = uDir * 3.2307692308;
  c += (texture(uSrc, vUv + o1).rgb + texture(uSrc, vUv - o1).rgb) * .3162162162;
  c += (texture(uSrc, vUv + o2).rgb + texture(uSrc, vUv - o2).rgb) * .0702702703;
  outColor = vec4(c, 1);
}`;

// The firebox, logs and grate don't move, so their patterns are rendered once
// per layout into three textures. Each frame only relights them.
const BAKE_FS =
  HEADER +
  /* glsl */ `
layout(location = 0) out vec4 outSurface;  // albedo, response to ambient light
layout(location = 1) out vec4 outResponse; // response to firelight, ember mask, ember phase, log coverage
layout(location = 2) out vec4 outOverlay;  // grate coverage, grate glint
` +
  LIB +
  /* glsl */ `
uniform float uPx;

const float FLOOR_Y = .105;
const float BACK_W = .78;

struct Surface { vec3 albedo; float ka; float kl; float ember; float phase; };

// x: distance to the cell's seed, y: distance to the nearest edge, z: a random value per cell
vec3 voronoi(vec2 x) {
  vec2 n = floor(x), f = fract(x);
  vec2 mg, mr;
  float md = 8.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(i, j);
    vec2 r = g + hash22(n + g) - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  float me = 8.;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(i, j);
    vec2 r = g + hash22(n + g) - f;
    if (dot(mr - r, mr - r) > 1e-5) me = min(me, dot(.5 * (mr + r), normalize(r - mr)));
  }
  return vec3(sqrt(md), me, hash12(n + mg));
}

vec3 bricks(vec2 q, vec2 size, float seed) {
  float row = floor(q.y / size.y);
  float x = q.x / size.x + .5 * mod(row, 2.);
  vec2 id = vec2(floor(x), row);
  vec2 f = vec2(fract(x) * size.x, fract(q.y / size.y) * size.y);
  vec2 edge = min(f, size - f);
  float mortar = smoothstep(.003, .0075, min(edge.x, edge.y));
  float h = hash12(id + seed);
  vec3 brick = mix(vec3(.13, .035, .016), vec3(.22, .075, .035), h);
  brick = mix(brick, vec3(.16, .11, .07), step(.86, h) * .6); // the odd buff firebrick
  brick *= .7 + .6 * fbm(q * 38. + id);
  float bevel = smoothstep(.0, .02, min(edge.x, edge.y));
  vec3 mortarCol = vec3(.045, .04, .035) * (.7 + .6 * hash12(floor(q * 300.)));
  return mix(mortarCol, brick * (.6 + .4 * bevel), mortar);
}

Surface firebox(vec2 p) {
  Surface o = Surface(vec3(0), 1., 1., 0., 0.);
  float ax = abs(p.x);
  float dx = max(ax - BACK_W, 0.);
  float floorLine = FLOOR_Y - dx * .5;
  if (p.y < floorLine) {
    // Hearth floor under a bed of ash, with coals glowing under the logs.
    float depth = floorLine - p.y;
    vec2 fq = vec2(p.x / (1. + depth * 5.), depth * 3.);
    float ash = fbm(fq * vec2(14., 22.)) * .8 + .2 * hash12(floor(p * 900.));
    vec3 vo = voronoi(vec2(p.x * 28., depth * 60.));
    float coal = smoothstep(.75, .1, vo.x) * smoothstep(.45, .1, ax) * smoothstep(.07, 0., depth);
    o.albedo = mix(mix(vec3(.02, .018, .016), vec3(.09, .08, .072), ash), vec3(.01), coal * .6);
    o.kl = .9;
    o.ember = coal * smoothstep(.05, .25, vo.y + .1) * .9;
    o.phase = p.x * 9. + vo.z * 7.;
  } else if (ax > BACK_W) {
    // Angled side walls of the firebox, in rough perspective.
    float k = 1. + dx * 2.6;
    vec2 q = vec2(dx * (1.6 + dx * 2.5), (p.y - floorLine) / k);
    float soot = smoothstep(.1, .8, q.y) * .7 + .3 * fbm(q * 5.);
    o.albedo = mix(bricks(q, vec2(.2, .066), 31.), vec3(.006), clamp(soot, 0., .92));
    o.kl = .55 / k;
  } else {
    vec2 q = vec2(p.x + 3., p.y - FLOOR_Y);
    float soot = smoothstep(.02, .55, q.y) * smoothstep(1.05, .05, ax) + .45 * (fbm(vec2(p.x * 3., p.y * 1.2)) - .5);
    soot += .25 * smoothstep(.0, .6, fbm(vec2(p.x * 9., p.y * 2. - .3)) - .35) * smoothstep(.1, .5, q.y);
    o.albedo = mix(bricks(q, vec2(.2, .066), 7.), vec3(.005, .004, .004), clamp(soot, 0., .95));
  }
  return o;
}

float logSurface(vec2 p, int i, inout Surface o) {
  LogHit h = logGeom(p, i);
  float cov = smoothstep(uPx, -uPx, h.d);
  if (cov <= 0.) return 0.;

  float seed = float(i) * 17.31;
  float v = clamp(h.v, -1., 1.);
  float s = h.s;
  float around = asin(v) * h.r; // distance around the bark
  float hot = smoothstep(.7, .05, abs(p.x)); // the middle of the pile burns hottest
  float nz = sqrt(max(0., 1. - v * v));

  // Bark: rough plates split by furrows that run along the log
  float bn = fbm(vec2(s * 5., around * 17.) + seed);
  float furrow = abs(fract(around * 16. + bn * 1.8 + seed) - .5) * 2.;
  float plate = smoothstep(.2, .7, furrow);
  vec3 bark = mix(vec3(.018, .012, .008), vec3(.11, .075, .048), plate * (.45 + .8 * bn));
  bark *= .85 + .35 * gnoise(vec2(s * 90., around * 160.));

  // Char: alligator blocks on the hot side, dark cracks between them
  vec3 vo = voronoi(vec2(s * 30., around * 44.) + seed);
  float charAmt = clamp(smoothstep(-.15, .55, v + .55 * gnoise(vec2(s * 4.5, around * 9.) + seed)) * (.25 + .75 * hot), 0., 1.);
  float crack = 1. - smoothstep(.005, .07, vo.y);
  crack *= smoothstep(.0, .35, gnoise(vec2(s * 70., around * 90.) + seed) + .2); // broken, not a net
  vec3 charCol = mix(vec3(.012, .011, .01), vec3(.05, .046, .043), vo.x * vo.z);
  vec3 c = mix(bark, charCol, charAmt);
  c = mix(c, vec3(.002), crack * charAmt);

  // Only some cracks are live coals
  float live = smoothstep(.55, .8, fbm(vec2(s * 3.2 + seed, around * 6.)) + .2 * vo.z);
  float under = .35 + .65 * smoothstep(-1., -.2, v); // underside in shadow
  float rim = smoothstep(.5, 1., v);

  // Round shading, lit from the fire behind and above, so the top catches a rim
  Surface l = Surface(c, (.35 + .65 * nz) * 1.6 * under, (.22 + .25 * nz + 1.6 * rim) * under, 0., 0.);
  l.ember = crack * charAmt * live * (.3 + .7 * hot) * smoothstep(-.6, .6, v) * .9;
  l.phase = s * 7. + float(i) * 1.7 + vo.z * 9.;

  // The sawn end: pale wood, growth rings, radial checks, a charred rim
  float faceCov = smoothstep(uPx, -uPx, h.dFace);
  if (faceCov > 0.) {
    vec2 fq = vec2((s - h.len) / (h.r * h.cap), h.v);
    float fr = length(fq);
    float ang = atan(fq.y, fq.x);
    float rings = .5 + .5 * cos((fr + .04 * gnoise(fq * 3. + seed)) * 52.);
    vec3 wood = mix(vec3(.26, .15, .075), vec3(.36, .23, .12), rings * .7 + .3 * fbm(fq * 9. + seed));
    wood = mix(wood, vec3(.16, .085, .04), smoothstep(.25, 0., fr) * .6);
    float check = smoothstep(.93, 1., .5 + .5 * cos(ang * 4. + seed + 2.5 * gnoise(fq * 2. + seed))) * smoothstep(.1, .5, fr);
    wood *= 1. - .8 * check;
    float charRim = smoothstep(.62, .9, fr + .1 * gnoise(vec2(ang * 3., seed)));
    wood = mix(wood, vec3(.008), charRim * (.5 + .5 * hot));
    wood = mix(wood, vec3(.03, .02, .012), smoothstep(.9, .96, fr));
    l.albedo = mix(l.albedo, wood, faceCov);
    l.ka = mix(l.ka, 1., faceCov);
    l.kl = mix(l.kl, .5, faceCov);
    l.ember = mix(l.ember, charRim * smoothstep(1., .85, fr) * live * hot * .8, faceCov);
  }

  o.albedo = mix(o.albedo, l.albedo, cov);
  o.ka = mix(o.ka, l.ka, cov);
  o.kl = mix(o.kl, l.kl, cov);
  o.ember = mix(o.ember, l.ember, cov);
  o.phase = mix(o.phase, l.phase, step(.5, cov));
  return cov;
}

float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.)) + min(max(d.x, d.y), 0.); }

// The grate in front of the logs: x coverage, y how much firelight it glints
vec2 grate(vec2 p) {
  float ax = abs(p.x);
  float d = sdBox(vec2(p.x, p.y - .085), vec2(.6, .009)) - .003;
  d = min(d, sdBox(vec2(ax - .575, p.y - .15), vec2(.012, .135)) - .004);
  float ball = length(vec2(ax - .575, p.y - .31)) - .03;
  d = min(d, ball);
  d = min(d, sdBox(vec2(ax - .575, p.y - .285), vec2(.02, .005)) - .002);
  float cov = smoothstep(uPx, -uPx, d);
  if (cov <= 0.) return vec2(0);
  if (ball < 0.) {
    vec2 n2 = (vec2(ax, p.y) - vec2(.575, .31)) / .03;
    vec3 n = vec3(n2 * vec2(sign(p.x), 1.), sqrt(max(0., 1. - dot(n2, n2))));
    vec3 l = normalize(vec3(-sign(p.x) * .7, .4, .55));
    return vec2(cov, pow(max(dot(reflect(-l, n), vec3(0, 0, 1)), 0.), 18.) * .6 + .05);
  }
  return vec2(cov, smoothstep(.0, -.006, d) * .02);
}

void main() {
  vec2 p = toScene(vUv);
  Surface o = firebox(p);
  float logCov = 0.;
  for (int i = 0; i < 3; i++) logCov = max(logCov, logSurface(p, i, o));
  outSurface = vec4(o.albedo, o.ka);
  outResponse = vec4(o.kl, o.ember, o.phase, logCov);
  outOverlay = vec4(grate(p), 0, 0);
}`;

const COMPOSITE_FS =
  COMMON +
  FIRE_COLOR +
  /* glsl */ `
uniform sampler2D uHeat, uBloom, uSurface, uResponse, uOverlay;
uniform float uFire, uEmber;
uniform vec3 uFlicker; // the firelight's wandering centre (xy) and strength (z)
uniform vec2 uRes;

vec3 emberColor(float g) {
  g = max(g, 0.);
  return vec3(1., .2, .025) * g * 2.4 + vec3(1., .62, .2) * g * g * g * 3.;
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }

void main() {
  vec2 uv = vUv;
  vec2 p = toScene(uv);
  vec4 surface = texture(uSurface, uv);
  vec4 response = texture(uResponse, uv);
  vec4 overlay = texture(uOverlay, uv);
  vec3 bloom = texture(uBloom, uv).rgb;
  float smoke = texture(uHeat, uv).y;
  float logCov = response.w;

  vec2 d = (p - uFlicker.xy) * vec2(.85, 1.);
  vec3 light = vec3(1., .46, .17) * uFire * uFlicker.z * 1.4 / (1. + 7. * dot(d, d));
  vec2 de = p - vec2(0., .17);
  light += vec3(1., .28, .07) * uEmber * .22 / (1. + 45. * dot(de, de));
  light += bloom * 1.6;
  vec3 ambient = mix(vec3(.034, .036, .05), vec3(.016, .011, .008), clamp(uFire * 2., 0., 1.));

  vec3 col = surface.rgb * (ambient * surface.a + light * response.x);
  col *= 1. - .5 * smoothstep(0., .7, smoke) * (1. - logCov);
  if (response.y > .001) col += emberColor(response.y * uEmber * (.6 + .55 * gnoise(vec2(response.z, uTime * .5))));

  // Flames, with a little heat shimmer so the edges stay crisp at screen resolution
  vec2 shimmer = vec2(gnoise(p * vec2(34., 16.) + vec2(0., -uTime * 5.)), gnoise(p * vec2(20., 30.) + vec2(5., -uTime * 4.))) * .0022;
  float heat = texture(uHeat, uv + shimmer).x;
  col += fireColor(heat) * (1. - .9 * logCov); // the sim grid is coarse; log edges stay crisp
  col += bloom * .55 * (1. - .5 * logCov);

  vec3 iron = vec3(.012, .011, .011) * (ambient + light * .4) + light * overlay.y;
  col = mix(col, iron, overlay.x);

  col = aces(col * 1.15);
  col = pow(col, vec3(1. / 2.2));

  vec2 vq = (uv - .5) * vec2(uView.x, 1.);
  col *= 1. - .35 * smoothstep(.45, 1.2, length(vq));
  col += (hash12(uv * uRes + fract(uTime) * 100.) - .5) * .018;
  outColor = vec4(col, 1);
}`;

const SPARK_VS = /* glsl */ `#version 300 es
in vec4 aSpark; // uv.xy, life (1 -> 0), size in px
uniform float uDpr;
out float vLife;
void main() {
  vLife = aSpark.z;
  gl_Position = vec4(aSpark.xy * 2. - 1., 0, 1);
  gl_PointSize = aSpark.w * uDpr * (.45 + .55 * vLife);
}`;

const SPARK_FS = /* glsl */ `#version 300 es
precision highp float;
in float vLife;
out vec4 outColor;
void main() {
  float d = length(gl_PointCoord - .5);
  float a = smoothstep(.5, 0., d);
  a *= a;
  vec3 c = mix(vec3(1., .22, .03), vec3(1., .86, .5), vLife * vLife) * (.25 + 1.1 * vLife);
  outColor = vec4(c * a, 1);
}`;

// --- JavaScript side --------------------------------------------------------

export function createHearth(canvas, { reducedMotion = false } = {}) {
  // The fire shares the GPU with the model it's burning, so keep it frugal:
  // at most 60 fps (20 once it's out) and no more than 1440 rendered rows.
  const LIT_FRAME_MS = 1000 / 60;
  const OUT_FRAME_MS = 1000 / 20;
  const MAX_RENDER_HEIGHT = 1440;
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: 'high-performance',
  });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || 'shader failed to compile');
    }
    return shader;
  }

  function program(fs, vs = QUAD_VS, attrib = 'aPos') {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, attrib);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link failed');
    const u = {};
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  const prog = {
    curl: program(CURL_FS),
    forces: program(FORCES_FS),
    divergence: program(DIVERGENCE_FS),
    scale: program(SCALE_FS),
    pressure: program(PRESSURE_FS),
    gradient: program(GRADIENT_FS),
    advectVel: program(ADVECT_VEL_FS),
    advectHeat: program(ADVECT_HEAT_FS),
    emit: program(EMIT_FS),
    blur: program(BLUR_FS),
    bake: program(BAKE_FS),
    composite: program(COMPOSITE_FS),
    spark: program(SPARK_FS, SPARK_VS, 'aSpark'),
  };

  const quadVao = gl.createVertexArray();
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const MAX_SPARKS = 600;
  const sparkData = new Float32Array(MAX_SPARKS * 4); // x, y, life, size
  const sparkVel = new Float32Array(MAX_SPARKS * 4); // vx, vy, lifespan, wobble seed
  let sparkCount = 0;
  const sparkVao = gl.createVertexArray();
  gl.bindVertexArray(sparkVao);
  const sparkBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, sparkBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, sparkData.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(quadVao);

  function target(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('float render targets are not supported');
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo, w, h, texel: [1 / w, 1 / h] };
  }

  // Three layers rendered together by the bake pass, sampled 1:1 by the composite.
  function bakeTarget(w, h) {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const layers = [0, 1, 2].map((i) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0);
      return { tex };
    });
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('multiple float render targets are not supported');
    }
    return { fbo, w, h, layers };
  }

  function pair(w, h) {
    let read = target(w, h);
    let write = target(w, h);
    return {
      get read() {
        return read;
      },
      get write() {
        return write;
      },
      swap() {
        [read, write] = [write, read];
      },
    };
  }

  function release(t) {
    if (!t) return;
    for (const x of 'read' in t ? [t.read, t.write] : [t]) {
      gl.deleteTexture(x.tex);
      gl.deleteFramebuffer(x.fbo);
    }
  }

  let sim = null;
  let baked = null;
  let needsBake = true;
  let width = 0;
  let height = 0;
  let dpr = 1;

  const view = { centerX: 0.5, fitWidth: null };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const k = Math.min(dpr, MAX_RENDER_HEIGHT / Math.max(canvas.clientHeight, 1));
    const w = Math.max(1, Math.round(canvas.clientWidth * k));
    const h = Math.max(1, Math.round(canvas.clientHeight * k));
    if (w === width && h === height && sim) return;
    width = canvas.width = w;
    height = canvas.height = h;

    if (baked) {
      for (const layer of baked.layers) gl.deleteTexture(layer.tex);
      gl.deleteFramebuffer(baked.fbo);
    }
    baked = bakeTarget(w, h);
    needsBake = true;

    const simH = h > 700 ? 300 : 220;
    const simW = Math.max(64, Math.round((simH * w) / h));
    const bloomW = Math.max(16, Math.round(w / 4));
    const bloomH = Math.max(16, Math.round(h / 4));
    if (sim && sim.w === simW && sim.h === simH && sim.bloomW === bloomW && sim.bloomH === bloomH) return;
    if (sim) for (const t of [sim.vel, sim.heat, sim.pressure, sim.curl, sim.div, sim.bloomA, sim.bloomB]) release(t);
    sim = {
      w: simW,
      h: simH,
      bloomW,
      bloomH,
      vel: pair(simW, simH),
      heat: pair(simW, simH),
      pressure: pair(simW, simH),
      curl: target(simW, simH),
      div: target(simW, simH),
      bloomA: target(bloomW, bloomH),
      bloomB: target(bloomW, bloomH),
    };
  }

  function sceneScale() {
    const fit = (view.fitWidth ?? canvas.clientWidth) / Math.max(canvas.clientHeight, 1);
    return Math.min(1, fit / 1.3);
  }

  function sceneToUv(x, y) {
    const s = sceneScale();
    const aspect = width / height;
    return [(x * s) / aspect + view.centerX, y * s];
  }

  const logUniform = new Float32Array(LOGS.flatMap((l) => [...l.a, ...l.b]));
  const logRUniform = new Float32Array(LOGS.flatMap((l) => [l.r, l.cap]));

  function sceneUniforms(u, time) {
    if (u.uView) gl.uniform2f(u.uView, width / height, sceneScale());
    if (u.uCenterX) gl.uniform1f(u.uCenterX, view.centerX);
    if (u.uTime) gl.uniform1f(u.uTime, time);
    if (u.uLog) gl.uniform4fv(u.uLog, logUniform);
    if (u.uLogR) gl.uniform2fv(u.uLogR, logRUniform);
  }

  let unit = 0;
  function use(p, time) {
    gl.useProgram(p.p);
    unit = 0;
    sceneUniforms(p.u, time);
    return p.u;
  }
  function tex(location, t) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.uniform1i(location, unit++);
  }
  function draw(dest) {
    if (dest) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dest.fbo);
      gl.viewport(0, 0, dest.w, dest.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Fire level: what the app asks for, eased so it catches and dies like a real fire.
  const level = { target: 0, fire: 0, surge: 0, ember: 0.14 };

  function step(dt, time) {
    const texel = [1 / sim.w, 1 / sim.h];
    const fire = Math.min(level.fire + level.surge, 1.25);
    let u;

    u = use(prog.curl, time);
    gl.uniform2fv(u.uTexel, texel);
    tex(u.uVel, sim.vel.read);
    draw(sim.curl);

    u = use(prog.forces, time);
    gl.uniform2fv(u.uTexel, texel);
    gl.uniform1f(u.uDt, dt);
    gl.uniform1f(u.uCurlStrength, 34);
    gl.uniform1f(u.uBuoyancy, 1100);
    gl.uniform1f(u.uTurbulence, 900);
    gl.uniform1f(u.uFire, fire);
    tex(u.uVel, sim.vel.read);
    tex(u.uCurl, sim.curl);
    tex(u.uHeat, sim.heat.read);
    draw(sim.vel.write);
    sim.vel.swap();

    u = use(prog.divergence, time);
    gl.uniform2fv(u.uTexel, texel);
    tex(u.uVel, sim.vel.read);
    draw(sim.div);

    u = use(prog.scale, time);
    gl.uniform1f(u.uScale, 0.8);
    tex(u.uSrc, sim.pressure.read);
    draw(sim.pressure.write);
    sim.pressure.swap();

    u = use(prog.pressure, time);
    gl.uniform2fv(u.uTexel, texel);
    tex(u.uDivergence, sim.div);
    const pressureUnit = unit;
    for (let i = 0; i < 22; i++) {
      unit = pressureUnit;
      tex(u.uPressure, sim.pressure.read);
      draw(sim.pressure.write);
      sim.pressure.swap();
    }

    u = use(prog.gradient, time);
    gl.uniform2fv(u.uTexel, texel);
    tex(u.uPressure, sim.pressure.read);
    tex(u.uVel, sim.vel.read);
    draw(sim.vel.write);
    sim.vel.swap();

    u = use(prog.advectVel, time);
    gl.uniform2fv(u.uTexel, texel);
    gl.uniform1f(u.uDt, dt);
    tex(u.uVel, sim.vel.read);
    draw(sim.vel.write);
    sim.vel.swap();

    u = use(prog.advectHeat, time);
    gl.uniform2fv(u.uTexel, texel);
    gl.uniform1f(u.uDt, dt);
    gl.uniform1f(u.uFire, fire);
    gl.uniform1f(u.uCooling, 1.15);
    tex(u.uVel, sim.vel.read);
    tex(u.uHeat, sim.heat.read);
    draw(sim.heat.write);
    sim.heat.swap();
  }

  function render(time) {
    let u;
    if (needsBake) {
      u = use(prog.bake, time);
      gl.uniform1f(u.uPx, 1.2 / (height * sceneScale()));
      draw(baked);
      needsBake = false;
    }

    u = use(prog.emit, time);
    tex(u.uHeat, sim.heat.read);
    draw(sim.bloomA);

    const passes = [
      [1, 0, 1],
      [0, 1, 1],
      [1, 0, 2.6],
      [0, 1, 2.6],
    ];
    for (const [x, y, r] of passes) {
      const [src, dst] = x ? [sim.bloomA, sim.bloomB] : [sim.bloomB, sim.bloomA];
      u = use(prog.blur, time);
      gl.uniform2f(u.uDir, (x * r) / sim.bloomW, (y * r) / sim.bloomH);
      tex(u.uSrc, src);
      draw(dst);
    }

    u = use(prog.composite, time);
    gl.uniform1f(u.uFire, Math.min(level.fire + level.surge * 0.6, 1.25));
    gl.uniform1f(u.uEmber, level.ember);
    gl.uniform3f(
      u.uFlicker,
      0.06 * Math.sin(time * 1.3) * Math.cos(time * 0.7),
      0.36,
      0.82 + 0.09 * Math.sin(time * 5.3) + 0.06 * Math.sin(time * 8.7 + 1.3) + 0.05 * Math.sin(time * 13.1 + 0.4),
    );
    gl.uniform2f(u.uRes, width, height);
    tex(u.uHeat, sim.heat.read);
    tex(u.uBloom, sim.bloomA);
    tex(u.uSurface, baked.layers[0]);
    tex(u.uResponse, baked.layers[1]);
    tex(u.uOverlay, baked.layers[2]);
    draw(null);

    if (sparkCount) {
      gl.useProgram(prog.spark.p);
      gl.uniform1f(prog.spark.u.uDpr, dpr);
      gl.bindVertexArray(sparkVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, sparkBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, sparkData, 0, sparkCount * 4);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArrays(gl.POINTS, 0, sparkCount);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(quadVao);
    }
  }

  function spawnSpark(strength = 1) {
    if (sparkCount >= MAX_SPARKS) return;
    const log = LOGS[Math.random() < 0.45 ? 0 : Math.random() < 0.5 ? 1 : 2];
    let t = 0.5 + (Math.random() - 0.5) * 0.7;
    const x = log.a[0] + (log.b[0] - log.a[0]) * t;
    if (Math.abs(x) > 0.42) t = 0.5;
    const sx = log.a[0] + (log.b[0] - log.a[0]) * t;
    const sy = log.a[1] + (log.b[1] - log.a[1]) * t + log.r * (0.6 + Math.random() * 0.8);
    const [ux, uy] = sceneToUv(sx, sy);
    const i = sparkCount++;
    sparkData[i * 4] = ux;
    sparkData[i * 4 + 1] = uy;
    sparkData[i * 4 + 2] = 1;
    sparkData[i * 4 + 3] = 1.6 + Math.random() * 2.6 * strength;
    sparkVel[i * 4] = (Math.random() - 0.5) * 0.08;
    sparkVel[i * 4 + 1] = 0.12 + Math.random() * 0.3 * strength;
    sparkVel[i * 4 + 2] = 0.7 + Math.random() * 1.8;
    sparkVel[i * 4 + 3] = Math.random() * 100;
  }

  function updateSparks(dt, time) {
    for (let i = 0; i < sparkCount; i++) {
      const o = i * 4;
      sparkVel[o + 1] += dt * 0.22;
      sparkVel[o] += dt * Math.sin(time * 3.1 + sparkVel[o + 3]) * 0.35;
      sparkVel[o] *= 1 - dt * 0.6;
      sparkVel[o + 1] *= 1 - dt * 0.4;
      sparkData[o] += sparkVel[o] * dt;
      sparkData[o + 1] += sparkVel[o + 1] * dt;
      sparkData[o + 2] -= dt / sparkVel[o + 2];
      if (sparkData[o + 2] <= 0 || sparkData[o + 1] > 1.05) {
        const last = --sparkCount * 4;
        sparkData.copyWithin(o, last, last + 4);
        sparkVel.copyWithin(o, last, last + 4);
        i--;
      }
    }
  }

  function ease(current, goal, rate, dt) {
    return current + (goal - current) * (1 - Math.exp(-rate * dt));
  }

  let last = performance.now();
  let clock = 0;
  let accumulator = 0;
  let frame = 0;
  const SIM_DT = 1 / 60;

  function loop(now) {
    frame = requestAnimationFrame(loop);
    const out = level.target === 0 && level.fire < 0.02;
    if (now - last < (out ? OUT_FRAME_MS : LIT_FRAME_MS) * 0.8) return;
    resize();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    clock += dt;

    const rising = level.target > level.fire;
    level.fire = ease(level.fire, level.target, rising ? 0.9 : 0.3, dt);
    level.surge *= Math.exp(-dt * 1.8);
    level.ember = Math.max(level.fire, level.ember * Math.exp(-dt / 150), 0.14);

    if (!reducedMotion && Math.random() < level.fire * dt * 9) spawnSpark(level.fire);

    accumulator += dt;
    let steps = 0;
    while (accumulator >= SIM_DT && steps < 3) {
      step(SIM_DT, clock);
      accumulator -= SIM_DT;
      steps++;
    }
    if (steps === 3) accumulator = 0;

    updateSparks(dt, clock);
    render(clock);
  }

  resize();
  frame = requestAnimationFrame(loop);

  return {
    /** 0 = out (embers only), 1 = roaring. */
    setFire(value) {
      level.target = Math.max(0, Math.min(1, value));
    },
    /** A token landed on the fire. */
    feed() {
      level.surge = Math.min(level.surge + 0.025, 0.22);
      if (!reducedMotion && Math.random() < 0.55) spawnSpark(1.2);
    },
    /** Centre the hearth at uv x `centerX`, scaled to fit `fitWidth` CSS px (null: the whole width). */
    frame(centerX, fitWidth) {
      if (view.centerX === centerX && view.fitWidth === fitWidth) return;
      view.centerX = centerX;
      view.fitWidth = fitWidth;
      needsBake = true;
    },
    levels: level,
    destroy() {
      cancelAnimationFrame(frame);
    },
  };
}
