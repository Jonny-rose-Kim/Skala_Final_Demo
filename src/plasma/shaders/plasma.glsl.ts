/**
 * Plasma volume shader (GLSL, WebGL2). Bounded-cylinder ray marching with opaque-depth
 * termination and an analytic cutaway sector. Visual approximation only (render_source = illustrative).
 */
export const PLASMA_VERTEX_GLSL = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vWorldPos;
varying vec4 vClip;
void main(void) {
  vec4 wp = world * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vClip = worldViewProjection * vec4(position, 1.0);
  gl_Position = vClip;
}
`;

export const PLASMA_FRAGMENT_GLSL = /* glsl */ `
precision highp float;
varying vec3 vWorldPos;
varying vec4 vClip;

uniform vec3 uCameraPosition;
uniform vec3 uCameraForward;
uniform vec3 uVolumeCenter;
uniform float uVolumeRadius;
uniform float uVolumeHalfHeight;
uniform float uHaloMargin;
uniform float uInstanceRotY;
uniform float uTime;
uniform float uSeed;
uniform float uIntensity;
uniform float uGlow;
uniform float uOpacity;
uniform float uEdgeSoftness;
uniform float uVariation;
uniform float uSheath;
uniform float uFlicker;
uniform vec3 uColorCore;
uniform vec3 uColorHalo;
uniform float uSteps;
uniform float uCutEnabled;
uniform float uCutStart;
uniform float uCutSweep;
uniform float uFlipDepthY;
uniform float uDebugMode;
uniform sampler2D depthTex;

float hash13(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float ign(vec2 px) {
  // interleaved gradient noise: stable per pixel, no temporal randomness
  return fract(52.9829189 * fract(0.06711056 * px.x + 0.00583715 * px.y));
}

// returns density in [0, ~1.3]
float density(vec3 p, float haloR) {
  vec3 q = p - uVolumeCenter;
  // rotate into the instance frame for the cutaway azimuth
  float c = cos(-uInstanceRotY); float s = sin(-uInstanceRotY);
  vec2 lq = vec2(q.x * c - q.z * s, q.x * s + q.z * c);
  if (uCutEnabled > 0.5) {
    float az = atan(lq.y, lq.x);
    float d = az - uCutStart;
    d = d - 6.2831853 * floor(d / 6.2831853);
    if (d < uCutSweep) return 0.0;
  }
  float r = length(q.xz) / uVolumeRadius;
  float h = clamp((q.y + uVolumeHalfHeight) / (2.0 * uVolumeHalfHeight), 0.0, 1.0);
  float edge = max(uEdgeSoftness, 0.02);
  float fr = 1.0 - smoothstep(1.0 - edge, haloR, r);
  // mild edge brightening typical of confined discharges (illustrative)
  fr *= 1.0 + 0.18 * exp(-pow((r - 0.9) / 0.07, 2.0));
  float sh = max(uSheath, 0.03);
  float fh = smoothstep(0.0, sh, h) * smoothstep(0.0, sh, 1.0 - h);
  fh *= 0.72 + 0.28 * (1.0 - pow(2.0 * h - 1.0, 2.0));
  float t = uTime * 0.35;
  vec3 np = vec3(q.x * 9.0, q.y * 40.0, q.z * 9.0) + vec3(uSeed * 13.1, t, uSeed * 7.7 + t * 0.6);
  float n = vnoise(np) * 0.65 + vnoise(np * 2.3 + 11.0) * 0.35;
  float variation = 1.0 + uVariation * (n - 0.5) * 0.9;
  return fr * fh * variation;
}

// cylinder (axis Y) intersection; returns (tNear, tFar) or tFar<tNear when no hit
vec2 intersectCylinder(vec3 ro, vec3 rd, vec3 c, float R, float H) {
  vec3 o = ro - c;
  float a = rd.x * rd.x + rd.z * rd.z;
  float b = 2.0 * (o.x * rd.x + o.z * rd.z);
  float cc = o.x * o.x + o.z * o.z - R * R;
  float tN = -1e9; float tF = 1e9;
  if (a > 1e-9) {
    float disc = b * b - 4.0 * a * cc;
    if (disc < 0.0) return vec2(1.0, 0.0);
    float sq = sqrt(disc);
    tN = (-b - sq) / (2.0 * a);
    tF = (-b + sq) / (2.0 * a);
  } else if (cc > 0.0) {
    return vec2(1.0, 0.0);
  }
  // slabs
  if (abs(rd.y) > 1e-9) {
    float t1 = (-H - o.y) / rd.y;
    float t2 = (H - o.y) / rd.y;
    float sN = min(t1, t2); float sF = max(t1, t2);
    tN = max(tN, sN); tF = min(tF, sF);
  } else if (abs(o.y) > H) {
    return vec2(1.0, 0.0);
  }
  return vec2(tN, tF);
}

void main(void) {
  vec3 ro = uCameraPosition;
  vec3 rd = normalize(vWorldPos - ro);
  float haloR = 1.0 + uHaloMargin / uVolumeRadius;
  vec2 tt = intersectCylinder(ro, rd, uVolumeCenter, uVolumeRadius * haloR, uVolumeHalfHeight);
  float t0 = max(tt.x, 0.0);
  float t1 = tt.y;
  // opaque depth termination (camera-space Z stored by the depth renderer)
  vec2 uv = vClip.xy / vClip.w * 0.5 + 0.5;
  if (uFlipDepthY > 0.5) uv.y = 1.0 - uv.y;
  float zCam = texture2D(depthTex, uv).r;
  float cosA = max(dot(rd, uCameraForward), 1e-4);
  float tDepth = zCam / cosA;
  if (uDebugMode > 0.5) {
    gl_FragColor = vec4(vec3(clamp(zCam / 3.0, 0.0, 1.0)), 1.0);
    return;
  }
  t1 = min(t1, tDepth);
  if (t1 <= t0 || uIntensity <= 0.0005) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float steps = max(uSteps, 6.0);
  float dt = (t1 - t0) / steps;
  float jitter = ign(gl_FragCoord.xy);
  vec3 col = vec3(0.0);
  float T = 1.0;
  float sigma = uOpacity * 14.0;
  float emis = uGlow * 6.0 * uIntensity * (1.0 + uFlicker);
  for (int i = 0; i < 96; i++) {
    if (float(i) >= steps) break;
    float t = t0 + (float(i) + jitter) * dt;
    vec3 p = ro + rd * t;
    float d = density(p, haloR);
    if (d > 0.0005) {
      vec3 q = p - uVolumeCenter;
      float h = clamp((q.y + uVolumeHalfHeight) / (2.0 * uVolumeHalfHeight), 0.0, 1.0);
      float core = smoothstep(0.15, 0.6, d);
      vec3 e = mix(uColorHalo, uColorCore, core) * d * emis;
      float absorb = exp(-sigma * d * dt);
      col += T * e * dt;
      T *= absorb;
      if (T < 0.01) break;
      // keep h referenced to avoid unused warnings on some drivers
      col += vec3(0.0) * h;
    }
  }
  float alpha = clamp(1.0 - T, 0.0, 1.0);
  // premultiplied output
  gl_FragColor = vec4(col, alpha);
}
`;
