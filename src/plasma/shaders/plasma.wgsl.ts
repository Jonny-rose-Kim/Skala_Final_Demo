/**
 * Plasma volume shader (WGSL, WebGPU). Same uniform semantics and visual result as the GLSL version.
 * Written natively in WGSL so the engine never needs the GLSL->WGSL (twgsl) WASM download.
 */
export const PLASMA_VERTEX_WGSL = /* wgsl */ `
#include<sceneUboDeclaration>
#include<meshUboDeclaration>
attribute position: vec3<f32>;
varying vWorldPos: vec3<f32>;
varying vClip: vec4<f32>;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let wp = mesh.world * vec4f(vertexInputs.position, 1.0);
  vertexOutputs.vWorldPos = wp.xyz;
  let clip = scene.viewProjection * wp;
  vertexOutputs.vClip = clip;
  vertexOutputs.position = clip;
}
`;

export const PLASMA_FRAGMENT_WGSL = /* wgsl */ `
varying vWorldPos: vec3<f32>;
varying vClip: vec4<f32>;

uniform uCameraPosition: vec3<f32>;
uniform uCameraForward: vec3<f32>;
uniform uVolumeCenter: vec3<f32>;
uniform uVolumeRadius: f32;
uniform uVolumeHalfHeight: f32;
uniform uHaloMargin: f32;
uniform uInstanceRotY: f32;
uniform uTime: f32;
uniform uSeed: f32;
uniform uIntensity: f32;
uniform uGlow: f32;
uniform uOpacity: f32;
uniform uEdgeSoftness: f32;
uniform uVariation: f32;
uniform uSheath: f32;
uniform uFlicker: f32;
uniform uColorCore: vec3<f32>;
uniform uColorHalo: vec3<f32>;
uniform uSteps: f32;
uniform uCutEnabled: f32;
uniform uCutStart: f32;
uniform uCutSweep: f32;
uniform uFlipDepthY: f32;
uniform uDebugMode: f32;
var depthTexSampler: sampler;
var depthTex: texture_2d<f32>;

fn hash13(pIn: vec3<f32>) -> f32 {
  var p = fract(pIn * 0.3183099 + vec3f(0.1, 0.2, 0.3));
  p = p * 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
fn vnoise(x: vec3<f32>) -> f32 {
  let i = floor(x);
  var f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  let n000 = hash13(i);
  let n100 = hash13(i + vec3f(1.0, 0.0, 0.0));
  let n010 = hash13(i + vec3f(0.0, 1.0, 0.0));
  let n110 = hash13(i + vec3f(1.0, 1.0, 0.0));
  let n001 = hash13(i + vec3f(0.0, 0.0, 1.0));
  let n101 = hash13(i + vec3f(1.0, 0.0, 1.0));
  let n011 = hash13(i + vec3f(0.0, 1.0, 1.0));
  let n111 = hash13(i + vec3f(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
fn ign(px: vec2<f32>) -> f32 {
  return fract(52.9829189 * fract(0.06711056 * px.x + 0.00583715 * px.y));
}

fn density(p: vec3<f32>, haloR: f32) -> f32 {
  let q = p - uniforms.uVolumeCenter;
  let c = cos(-uniforms.uInstanceRotY);
  let s = sin(-uniforms.uInstanceRotY);
  let lq = vec2f(q.x * c - q.z * s, q.x * s + q.z * c);
  if (uniforms.uCutEnabled > 0.5) {
    let az = atan2(lq.y, lq.x);
    var d = az - uniforms.uCutStart;
    d = d - 6.2831853 * floor(d / 6.2831853);
    if (d < uniforms.uCutSweep) { return 0.0; }
  }
  let r = length(q.xz) / uniforms.uVolumeRadius;
  let h = clamp((q.y + uniforms.uVolumeHalfHeight) / (2.0 * uniforms.uVolumeHalfHeight), 0.0, 1.0);
  let edge = max(uniforms.uEdgeSoftness, 0.02);
  var fr = 1.0 - smoothstep(1.0 - edge, haloR, r);
  fr = fr * (1.0 + 0.18 * exp(-pow((r - 0.9) / 0.07, 2.0)));
  let sh = max(uniforms.uSheath, 0.03);
  var fh = smoothstep(0.0, sh, h) * smoothstep(0.0, sh, 1.0 - h);
  fh = fh * (0.72 + 0.28 * (1.0 - pow(2.0 * h - 1.0, 2.0)));
  let t = uniforms.uTime * 0.35;
  let np = vec3f(q.x * 9.0, q.y * 40.0, q.z * 9.0) + vec3f(uniforms.uSeed * 13.1, t, uniforms.uSeed * 7.7 + t * 0.6);
  let n = vnoise(np) * 0.65 + vnoise(np * 2.3 + 11.0) * 0.35;
  let variation = 1.0 + uniforms.uVariation * (n - 0.5) * 0.9;
  return fr * fh * variation;
}

fn intersectCylinder(ro: vec3<f32>, rd: vec3<f32>, c: vec3<f32>, R: f32, H: f32) -> vec2<f32> {
  let o = ro - c;
  let a = rd.x * rd.x + rd.z * rd.z;
  let b = 2.0 * (o.x * rd.x + o.z * rd.z);
  let cc = o.x * o.x + o.z * o.z - R * R;
  var tN = -1e9;
  var tF = 1e9;
  if (a > 1e-9) {
    let disc = b * b - 4.0 * a * cc;
    if (disc < 0.0) { return vec2f(1.0, 0.0); }
    let sq = sqrt(disc);
    tN = (-b - sq) / (2.0 * a);
    tF = (-b + sq) / (2.0 * a);
  } else if (cc > 0.0) {
    return vec2f(1.0, 0.0);
  }
  if (abs(rd.y) > 1e-9) {
    let t1 = (-H - o.y) / rd.y;
    let t2 = (H - o.y) / rd.y;
    let sN = min(t1, t2);
    let sF = max(t1, t2);
    tN = max(tN, sN);
    tF = min(tF, sF);
  } else if (abs(o.y) > H) {
    return vec2f(1.0, 0.0);
  }
  return vec2f(tN, tF);
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let ro = uniforms.uCameraPosition;
  let rd = normalize(fragmentInputs.vWorldPos - ro);
  let haloR = 1.0 + uniforms.uHaloMargin / uniforms.uVolumeRadius;
  let tt = intersectCylinder(ro, rd, uniforms.uVolumeCenter, uniforms.uVolumeRadius * haloR, uniforms.uVolumeHalfHeight);
  let t0 = max(tt.x, 0.0);
  var t1 = tt.y;
  var uv = fragmentInputs.vClip.xy / fragmentInputs.vClip.w * 0.5 + 0.5;
  if (uniforms.uFlipDepthY > 0.5) { uv.y = 1.0 - uv.y; }
  let zCam = textureSample(depthTex, depthTexSampler, uv).r;
  let cosA = max(dot(rd, uniforms.uCameraForward), 1e-4);
  let tDepth = zCam / cosA;
  if (uniforms.uDebugMode > 0.5) {
    fragmentOutputs.color = vec4f(vec3f(clamp(zCam / 3.0, 0.0, 1.0)), 1.0);
    return fragmentOutputs;
  }
  t1 = min(t1, tDepth);
  if (t1 <= t0 || uniforms.uIntensity <= 0.0005) {
    fragmentOutputs.color = vec4f(0.0);
    return fragmentOutputs;
  }
  let steps = max(uniforms.uSteps, 6.0);
  let dt = (t1 - t0) / steps;
  let jitter = ign(fragmentInputs.position.xy);
  var col = vec3f(0.0);
  var T = 1.0;
  let sigma = uniforms.uOpacity * 14.0;
  let emis = uniforms.uGlow * 6.0 * uniforms.uIntensity * (1.0 + uniforms.uFlicker);
  for (var i: i32 = 0; i < 96; i = i + 1) {
    if (f32(i) >= steps) { break; }
    let t = t0 + (f32(i) + jitter) * dt;
    let p = ro + rd * t;
    let d = density(p, haloR);
    if (d > 0.0005) {
      let core = smoothstep(0.15, 0.6, d);
      let e = mix(uniforms.uColorHalo, uniforms.uColorCore, core) * d * emis;
      let absorb = exp(-sigma * d * dt);
      col = col + T * e * dt;
      T = T * absorb;
      if (T < 0.01) { break; }
    }
  }
  let alpha = clamp(1.0 - T, 0.0, 1.0);
  fragmentOutputs.color = vec4f(col, alpha);
}
`;
