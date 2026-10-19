import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { animation } from '../animation/AnimationController';
import { mulberry32 } from '../engine/rng';

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z: number;
}

/**
 * Circuit-like traces (flat ribbons) etched into the chassis. Each trace carries its running
 * distance `aS`; the shader sends light pulses along it. Idle: slow shimmer. Spinning: energy
 * races upward through the frame. Purely cosmetic.
 */
function buildTraces(rects: Rect[], perRect: number[], seed: number) {
  const rnd = mulberry32(seed);
  const pos: number[] = [];
  const aS: number[] = [];
  const aSeed: number[] = [];
  const index: number[] = [];
  const width = 0.011;
  const grid = 0.11;

  rects.forEach((rect, ri) => {
    for (let n = 0; n < perRect[ri]; n++) {
      const sx = rect.x0 + Math.floor(rnd() * ((rect.x1 - rect.x0) / grid)) * grid;
      const sy = rect.y0 + Math.floor(rnd() * ((rect.y1 - rect.y0) / grid * 0.4)) * grid;
      const pts: THREE.Vector2[] = [new THREE.Vector2(sx, sy)];
      let dir = rnd() < 0.7 ? new THREE.Vector2(0, 1) : new THREE.Vector2(rnd() < 0.5 ? 1 : -1, 0);
      const steps = 4 + Math.floor(rnd() * 6);
      for (let k = 0; k < steps; k++) {
        const last = pts[pts.length - 1];
        const len = grid * (2 + Math.floor(rnd() * 6));
        const next = last.clone().addScaledVector(dir, len);
        if (next.x < rect.x0 || next.x > rect.x1 || next.y < rect.y0 || next.y > rect.y1) break;
        pts.push(next);
        const r = rnd();
        if (r < 0.35) dir = new THREE.Vector2(rnd() < 0.5 ? 1 : -1, 0);
        else if (r < 0.6) dir = new THREE.Vector2(rnd() < 0.5 ? 0.7071 : -0.7071, 0.7071);
        else dir = new THREE.Vector2(0, 1);
      }
      if (pts.length < 3) continue;
      const seedValue = rnd();
      let dist = rnd() * 3;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const d = b.clone().sub(a);
        const len = d.length();
        d.normalize();
        const nx = -d.y * width;
        const ny = d.x * width;
        const base = pos.length / 3;
        pos.push(a.x + nx, a.y + ny, rect.z, a.x - nx, a.y - ny, rect.z, b.x + nx, b.y + ny, rect.z, b.x - nx, b.y - ny, rect.z);
        aS.push(dist, dist, dist + len, dist + len);
        for (let q = 0; q < 4; q++) aSeed.push(seedValue);
        index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        dist += len;
      }
      // node pad at the end of the trace
      const e = pts[pts.length - 1];
      const p = 0.03;
      const base = pos.length / 3;
      pos.push(e.x - p, e.y - p, rect.z, e.x + p, e.y - p, rect.z, e.x - p, e.y + p, rect.z, e.x + p, e.y + p, rect.z);
      aS.push(dist, dist, dist, dist);
      for (let q = 0; q < 4; q++) aSeed.push(seedValue);
      index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(aSeed, 1));
  g.setIndex(index);
  return g;
}

const vertex = /* glsl */ `
  attribute float aS;
  attribute float aSeed;
  varying float vS;
  varying float vSeed;
  void main() {
    vS = aS;
    vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uOverload;
  varying float vS;
  varying float vSeed;
  void main() {
    float speed = 0.18 + uEnergy * 1.9;
    float f = fract(vS * 0.33 - uTime * speed + vSeed * 7.0);
    float pulse = smoothstep(0.0, 0.05, f) * smoothstep(0.34, 0.05, f);
    float f2 = fract(vS * 0.21 - uTime * speed * 0.6 + vSeed * 3.0);
    float pulse2 = smoothstep(0.0, 0.03, f2) * smoothstep(0.2, 0.03, f2);
    vec3 cyan = vec3(0.1, 0.75, 1.0);
    vec3 violet = vec3(0.55, 0.3, 1.0);
    vec3 base = mix(cyan, violet, smoothstep(0.35, 0.8, vSeed));
    float k = 0.06 + 0.1 * uEnergy;
    float glow = k + (pulse + 0.6 * pulse2) * (0.6 + 1.6 * uEnergy) + uOverload * 0.35;
    gl_FragColor = vec4(base * glow * 1.4, 1.0);
  }
`;

export function NeuralTraces({ rects, counts, seed = 1 }: { rects: Rect[]; counts: number[]; seed?: number }) {
  const geometry = useMemo(() => buildTraces(rects, counts, seed), [rects, counts, seed]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: { uTime: { value: 0 }, uEnergy: { value: 0.25 }, uOverload: { value: 0 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uEnergy.value = animation.energy;
    material.uniforms.uOverload.value = animation.overload;
  });
  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}
