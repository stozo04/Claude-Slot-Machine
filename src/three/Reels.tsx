import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { animation } from '../animation/AnimationController';
import { PAYLINES, REEL_COUNT, SYMBOLS } from '../config/gameConfig';
import { MACHINE, type ChassisMaterials } from './Chassis';
import { cellCenter, createReelGeometry, createReelMaterial, REEL, reelFrontZ } from './reelMaterial';

const tmpColor = new THREE.Color();

function Reel({ index, atlas, geometry, quality }: { index: number; atlas: THREE.Texture; geometry: THREE.BufferGeometry; quality: number }) {
  const { material, uniforms } = useMemo(() => createReelMaterial(index, atlas), [index, atlas]);
  const mesh = useRef<THREE.Mesh>(null!);
  useEffect(() => () => material.dispose(), [material]);
  const x = (index - 2) * REEL.pitch;
  useFrame((state) => {
    const v = animation.reels[index];
    const u = uniforms;
    u.uPos.value = v.pos;
    u.uTime.value = state.clock.elapsedTime;
    u.uOverload.value = animation.overload;
    // Exposure-based motion blur; fewer taps on weaker devices.
    const blur = Math.min(2.4, Math.abs(v.vel) * 0.05);
    u.uBlur.value = blur;
    u.uTaps.value = blur < 0.04 ? 1 : quality >= 2 ? 11 : quality === 1 ? 8 : 5;
    const hi = animation.highlight[index];
    u.uHi.value.set(hi[0].level, hi[1].level, hi[2].level);
    u.uHiCol0.value.set(SYMBOLS[hi[0].symbol].glow).convertSRGBToLinear();
    u.uHiCol1.value.set(SYMBOLS[hi[1].symbol].glow).convertSRGBToLinear();
    u.uHiCol2.value.set(SYMBOLS[hi[2].symbol].glow).convertSRGBToLinear();
    // Mechanical vibration when the reel locks in.
    const t = state.clock.elapsedTime;
    mesh.current.position.set(x + Math.sin(t * 95 + index) * 0.01 * v.shake, Math.sin(t * 130 + index * 2) * 0.012 * v.shake, REEL.axisZ);
  });
  return <mesh ref={mesh} geometry={geometry} material={material} position={[x, 0, REEL.axisZ]} frustumCulled={false} />;
}

function Dividers({ mats }: { mats: ChassisMaterials }) {
  return (
    <group>
      {Array.from({ length: REEL_COUNT + 1 }, (_, k) => (
        <mesh key={k} position={[(k - REEL_COUNT / 2) * REEL.pitch, 0, reelFrontZ - 0.35]} material={mats.graphite}>
          <boxGeometry args={[0.07, MACHINE.windowH + 0.2, 0.9]} />
        </mesh>
      ))}
      {/* top & bottom shadow caps inside the window */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, s * (MACHINE.windowH / 2 + 0.06), reelFrontZ - 0.2]} material={mats.graphite}>
          <boxGeometry args={[MACHINE.windowW + 0.2, 0.16, 1]} />
        </mesh>
      ))}
    </group>
  );
}

/** Curved glass over the reels: reflection only (additive), so it never dims the symbols. */
function Glass() {
  const geometry = useMemo(() => {
    const R = 14;
    const arc = 6.6 / R;
    const g = new THREE.CylinderGeometry(R, R, MACHINE.windowH + 0.12, 64, 1, true, -arc / 2, arc);
    g.translate(0, 0, 0);
    return g;
  }, []);
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#000000',
        roughness: 0.04,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        envMapIntensity: 0.7,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide,
      }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return <mesh geometry={geometry} material={material} position={[0, 0, 0.5 - 14]} renderOrder={5} />;
}

/** All 20 paylines pre-built; the AnimationController decides which are lit and how brightly. */
function PaylineGlow() {
  const lines = useMemo(
    () =>
      PAYLINES.map((rows) => {
        const pts: THREE.Vector3[] = [];
        const first = cellCenter(0, rows[0], 0.12);
        pts.push(new THREE.Vector3(-2.82, first.y, first.z));
        rows.forEach((row, reel) => pts.push(cellCenter(reel, row, 0.12)));
        const last = cellCenter(REEL_COUNT - 1, rows[REEL_COUNT - 1], 0.12);
        pts.push(new THREE.Vector3(2.82, last.y, last.z));
        return pts;
      }),
    [],
  );
  const refs = useRef<(THREE.Object3D | null)[]>([]);
  useFrame((state) => {
    const active = new Map(animation.visibleLines.map((l) => [l.line, l]));
    refs.current.forEach((obj, i) => {
      if (!obj) return;
      const info = active.get(i);
      const level = info?.level ?? 0;
      obj.visible = level > 0.01;
      if (!info) return;
      const mat = (obj as unknown as { material: { color: THREE.Color; opacity: number } }).material;
      const glow = SYMBOLS[info.symbol].glow;
      const pulse = 1.2 + Math.sin(state.clock.elapsedTime * 7 + i) * 0.25;
      mat.color.set(glow).multiplyScalar(pulse * 1.25);
      mat.opacity = Math.min(1, level);
    });
  });
  return (
    <group>
      {lines.map((points, i) => (
        <Line
          key={i}
          ref={(el) => {
            refs.current[i] = el as unknown as THREE.Object3D | null;
          }}
          points={points}
          lineWidth={3.2}
          transparent
          toneMapped={false}
          depthWrite={false}
          renderOrder={6}
        />
      ))}
    </group>
  );
}

/** NEURAL OVERLOAD: a holographic scan beam sweeping diagonally through the reels. */
function OverloadSweep() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: { uTime: { value: 0 }, uAmount: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: /* glsl */ `
          varying vec2 vUv; uniform float uTime; uniform float uAmount;
          void main(){
            float d = vUv.x * 0.8 + vUv.y * 0.35;
            float x = fract(d * 0.8 - uTime * 0.42);
            float beam = exp(-pow((x - 0.5) * 11.0, 2.0));
            float edge = exp(-pow((x - 0.5) * 38.0, 2.0));
            vec3 c = mix(vec3(0.1, 0.8, 1.0), vec3(0.8, 0.4, 1.0), vUv.x);
            float a = (beam * 0.22 + edge * 0.55) * uAmount;
            gl_FragColor = vec4(c * a * 1.1, a);
          }`,
      }),
    [],
  );
  const mesh = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uAmount.value = animation.overload;
    mesh.current.visible = animation.overload > 0.01;
  });
  return (
    <mesh ref={mesh} position={[0, 0, 0.56]} material={material} renderOrder={7} visible={false}>
      <planeGeometry args={[5.8, 3.0]} />
    </mesh>
  );
}

export function ReelBank({ atlas, mats, quality }: { atlas: THREE.Texture; mats: ChassisMaterials; quality: number }) {
  const geometry = useMemo(createReelGeometry, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  void tmpColor;
  return (
    <group>
      {Array.from({ length: REEL_COUNT }, (_, i) => (
        <Reel key={i} index={i} atlas={atlas} geometry={geometry} quality={quality} />
      ))}
      <Dividers mats={mats} />
      <PaylineGlow />
      <OverloadSweep />
      <Glass />
    </group>
  );
}
