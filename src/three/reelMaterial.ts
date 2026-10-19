import * as THREE from 'three';
import { SYMBOLS, SYMBOL_IDS, type SymbolId } from '../config/gameConfig';
import { reelEngine } from '../engine/ReelEngine';
import { ATLAS_COLS, ATLAS_ROWS } from './symbolAtlas';

/** Geometry constants shared by the reel mesh, paylines and framing (scene units). */
export const REEL = {
  radius: 2.25,
  width: 1.06,
  pitch: 1.12,
  /** Drum axis z. The drum's front surface sits at z = axisZ + radius. */
  axisZ: -2.0,
  rowHeight: 1.06,
} as const;

export const reelFrontZ = REEL.axisZ + REEL.radius;
/** World-space centre of cell row (0 top … 2 bottom) on the drum surface. */
export function cellCenter(reel: number, row: number, lift = 0) {
  const phi = ((1 - row) * REEL.rowHeight) / REEL.radius;
  return new THREE.Vector3((reel - 2) * REEL.pitch, Math.sin(phi) * (REEL.radius + lift), REEL.axisZ + Math.cos(phi) * (REEL.radius + lift));
}

const vertex = /* glsl */ `
  varying vec3 vObj;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vObj = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normalize(vec3(0.0, position.y, position.z)));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uAtlas;
  uniform sampler2D uStrip;
  uniform float uPos;
  uniform float uLen;
  uniform float uRadius;
  uniform float uWidth;
  uniform float uBlur;
  uniform float uTaps;
  uniform float uTime;
  uniform float uOverload;
  uniform vec3 uHi;
  uniform vec3 uHiCol0;
  uniform vec3 uHiCol1;
  uniform vec3 uHiCol2;
  uniform float uHiId0;
  uniform float uHiId1;
  uniform float uHiId2;
  uniform vec3 uGlow[6];
  varying vec3 vObj;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  const float COLS = ${ATLAS_COLS}.0;
  const float ROWS = ${ATLAS_ROWS}.0;

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  vec3 hue(float h) {
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  }

  // One illuminated glass tile at strip coordinate s, horizontal local coord lu.
  vec3 tile(float s, float lu, vec2 gx, vec2 gy, float aa, bool lit) {
    float c = floor(s + 0.5);
    float lv = s - c;
    float idx = floor(texture2D(uStrip, vec2((mod(c, uLen) + 0.5) / uLen, 0.5)).r * 255.0 + 0.5);

    float row = floor(uPos + 0.5) + 1.0 - c;
    float hi = 0.0;
    vec3 hiCol = vec3(0.0);
    if (lit) {
      if (row < 0.5 && row > -0.5) { hi = uHi.x; hiCol = uHiCol0; }
      else if (row < 1.5 && row > 0.5) { hi = uHi.y; hiCol = uHiCol1; }
      else if (row < 2.5 && row > 1.5) { hi = uHi.z; hiCol = uHiCol2; }
    }

    vec2 p = vec2(lu, lv);
    float d = sdRoundBox(p, vec2(0.462), 0.09);
    float inside = 1.0 - smoothstep(-aa, aa, d);

    // Obsidian glass face: vertical gradient, faint circuit dots, lit rim.
    vec3 face = mix(vec3(0.004, 0.007, 0.012), vec3(0.024, 0.034, 0.048), smoothstep(-0.45, 0.45, lv));
    vec2 g = fract(p * 8.0) - 0.5;
    face += vec3(0.010, 0.020, 0.030) * smoothstep(0.07, 0.0, length(g)) * 0.7;
    float rim = smoothstep(-0.085, 0.0, d);
    face += vec3(0.05, 0.13, 0.18) * rim * (0.35 + 0.65 * smoothstep(-0.3, 0.45, lv));
    face += hiCol * hi * (0.08 + 0.4 * rim);

    // Logo from the atlas (premultiplied), with explicit gradients so tile seams don't pick a wrong mip.
    float col = mod(idx, COLS);
    float arow = floor(idx / COLS);
    vec2 uv = vec2((col + lu + 0.5) / COLS, 1.0 - (arow + 0.5 - lv) / ROWS);
    vec4 art = textureGrad(uAtlas, uv, gx, gy);
    float halo = textureLod(uAtlas, uv, 4.0).a;
    vec3 glowCol = uGlow[int(idx + 0.5)];
    if (idx > 4.5) glowCol = mix(glowCol, hue(fract(uTime * 0.25 + lu * 0.6 - lv * 0.4)), 0.5);
    float notBlank = step(0.5, idx);

    vec3 col3 = face;
    col3 += glowCol * halo * (0.10 + 0.8 * hi) * inside * notBlank;
    float emis = 0.95 + hi * 0.9 + uOverload * 0.12;
    col3 = art.rgb * emis + col3 * (1.0 - art.a);

    // Outside the tile: the dark drum body, lit by the winning tile's glow.
    vec3 body = vec3(0.0015, 0.002, 0.003) + hiCol * hi * exp(-max(d, 0.0) * 14.0) * 0.9;
    return mix(body, col3, inside);
  }

  void main() {
    float phi = atan(vObj.y, vObj.z);
    float s = uPos + phi * uRadius;
    float lu = vObj.x / uWidth;
    vec2 gx = vec2(dFdx(lu) / COLS, dFdx(s) / ROWS);
    vec2 gy = vec2(dFdy(lu) / COLS, dFdy(s) / ROWS);
    float aa = max(0.0015, 0.7 * length(vec2(dFdx(s), dFdy(s))));

    vec3 colour;
    if (uBlur < 0.04) {
      colour = tile(s, lu, gx, gy, aa, true);
    } else {
      // Motion blur: average the strip over the distance travelled during the exposure.
      vec3 acc = vec3(0.0);
      float taps = uTaps;
      for (int k = 0; k < 12; k++) {
        if (float(k) >= taps) break;
        float o = (float(k) / max(taps - 1.0, 1.0) - 0.5) * uBlur;
        acc += tile(s + o, lu, gx, gy, aa + uBlur * 0.05, false);
      }
      colour = acc / taps;
    }

    // Studio reflections on the curved lacquer + soft occlusion toward the bezel.
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 R = reflect(-V, N);
    float key = pow(max(dot(R, normalize(vec3(0.0, 0.9, 0.45))), 0.0), 70.0);
    float rimL = pow(max(dot(R, normalize(vec3(-0.9, 0.15, 0.45))), 0.0), 14.0);
    float rimR = pow(max(dot(R, normalize(vec3(0.9, 0.15, 0.45))), 0.0), 14.0);
    colour += (key * vec3(0.55, 0.62, 0.75) + rimL * vec3(0.04, 0.22, 0.55) + rimR * vec3(0.30, 0.10, 0.55)) * 0.3;
    colour *= 1.0 - 0.6 * smoothstep(0.45, 0.95, abs(phi));
    gl_FragColor = vec4(colour, 1.0);
  }
`;

export interface ReelUniforms {
  [key: string]: THREE.IUniform;
  uPos: THREE.IUniform<number>;
  uBlur: THREE.IUniform<number>;
  uTaps: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
  uOverload: THREE.IUniform<number>;
  uHi: THREE.IUniform<THREE.Vector3>;
  uHiCol0: THREE.IUniform<THREE.Color>;
  uHiCol1: THREE.IUniform<THREE.Color>;
  uHiCol2: THREE.IUniform<THREE.Color>;
}

const symbolIndex = (id: SymbolId) => SYMBOL_IDS.indexOf(id);

export function createStripTexture(reel: number): THREE.DataTexture {
  const strip = reelEngine.strip(reel);
  const data = new Uint8Array(strip.length);
  strip.forEach((id, i) => (data[i] = symbolIndex(id)));
  const tex = new THREE.DataTexture(data, strip.length, 1, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

export function createReelMaterial(reel: number, atlas: THREE.Texture) {
  const uniforms: ReelUniforms = {
    uAtlas: { value: atlas },
    uStrip: { value: createStripTexture(reel) },
    uPos: { value: 0 },
    uLen: { value: reelEngine.stripLength(reel) },
    uRadius: { value: REEL.radius / REEL.rowHeight },
    uWidth: { value: REEL.width },
    uBlur: { value: 0 },
    uTaps: { value: 1 },
    uTime: { value: 0 },
    uOverload: { value: 0 },
    uHi: { value: new THREE.Vector3() },
    uHiCol0: { value: new THREE.Color() },
    uHiCol1: { value: new THREE.Color() },
    uHiCol2: { value: new THREE.Color() },
    uHiId0: { value: 0 },
    uHiId1: { value: 0 },
    uHiId2: { value: 0 },
    uGlow: { value: SYMBOL_IDS.map((id) => new THREE.Color(SYMBOLS[id].glow).convertSRGBToLinear()) },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment, side: THREE.FrontSide });
  return { material, uniforms };
}

/** A drum surface covering only the visible arc (±~54°) — the rest of the drum is hidden inside the cabinet. */
export function createReelGeometry() {
  const arc = 1.9;
  const g = new THREE.CylinderGeometry(REEL.radius, REEL.radius, REEL.width, 72, 1, true, -arc / 2, arc);
  g.rotateZ(Math.PI / 2);
  return g;
}
