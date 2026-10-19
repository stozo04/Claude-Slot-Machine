import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { animation } from '../animation/AnimationController';
import { NeuralTraces } from './NeuralTraces';
import { canvasTexture, createBrushedTexture, drawSpaced, FONT_STACK } from './textures';

/** Machine envelope (scene units). Reel window is centred on the origin. */
export const MACHINE = {
  halfW: 3.9,
  windowW: 5.84,
  windowH: 3.06,
  fasciaH: 2.14, // half-height of the front plate
  headerY: 2.68,
  deckAngle: Math.atan2(0.46, 1.7),
  deckTopY: -2.14,
  floorY: -3.72,
} as const;

function roundedRectPath(shape: THREE.Shape | THREE.Path, x: number, y: number, w: number, h: number, r: number, reverse = false) {
  const x0 = x - w / 2;
  const y0 = y - h / 2;
  const pts: [number, number][] = [];
  const seg = 8;
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (Math.PI / 2) * (i / seg);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  corner(x0 + w - r, y0 + r, -Math.PI / 2);
  corner(x0 + w - r, y0 + h - r, 0);
  corner(x0 + r, y0 + h - r, Math.PI / 2);
  corner(x0 + r, y0 + r, Math.PI);
  if (reverse) pts.reverse();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
}

export function useChassisMaterials() {
  return useMemo(() => {
    const brushed = createBrushedTexture(512, 11);
    brushed.repeat.set(0.35, 0.35);
    const brushedBump = brushed.clone();
    brushedBump.needsUpdate = true;
    const titanium = new THREE.MeshPhysicalMaterial({
      color: '#262b33',
      metalness: 1,
      roughness: 0.36,
      roughnessMap: brushed,
      bumpMap: brushedBump,
      bumpScale: 0.35,
      anisotropy: 0.75,
      anisotropyRotation: 0,
      clearcoat: 0.25,
      clearcoatRoughness: 0.4,
      envMapIntensity: 1.9,
    });
    const graphite = new THREE.MeshStandardMaterial({ color: '#171b21', metalness: 0.85, roughness: 0.5, roughnessMap: brushed, envMapIntensity: 1.8 });
    const obsidian = new THREE.MeshPhysicalMaterial({ color: '#030406', metalness: 0.1, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6 });
    const trim = new THREE.MeshStandardMaterial({ color: '#8d99a8', metalness: 1, roughness: 0.22, envMapIntensity: 1.6 });
    const cyanLight = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.9, 1.25), toneMapped: false });
    const violetLight = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.35, 1.4), toneMapped: false });
    return { titanium, graphite, obsidian, trim, cyanLight, violetLight, brushed };
  }, []);
}
export type ChassisMaterials = ReturnType<typeof useChassisMaterials>;

function Fascia({ mats }: { mats: ChassisMaterials }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    roundedRectPath(shape, 0, 0, MACHINE.halfW * 2, MACHINE.fasciaH * 2, 0.32);
    const hole = new THREE.Path();
    roundedRectPath(hole, 0, 0, MACHINE.windowW, MACHINE.windowH, 0.07, true);
    shape.holes.push(hole);
    return new THREE.ExtrudeGeometry(shape, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 4, curveSegments: 6 });
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={mats.titanium} />;
}

/** Thin emissive trim lines that react to the machine's energy. */
function LightStrips({ mats }: { mats: ChassisMaterials }) {
  const cyan = useRef<THREE.Color>(null!);
  const base = useMemo(() => new THREE.Color(), []);
  void cyan;
  void base;
  useFrame(() => {
    const k = 0.9 + animation.energy * 1.4 + animation.overload * 0.9 + animation.winPulse * 0.4;
    mats.cyanLight.color.setRGB(0.05 * k, 0.9 * k * 0.9, 1.25 * k * 0.9);
    mats.violetLight.color.setRGB(0.6 * k, 0.3 * k, 1.3 * k);
  });
  const hw = MACHINE.windowW / 2 + 0.07;
  const hh = MACHINE.windowH / 2 + 0.07;
  const z = 0.43;
  return (
    <group>
      {/* window trim */}
      <mesh position={[0, hh, z]} material={mats.cyanLight}><boxGeometry args={[hw * 2, 0.028, 0.02]} /></mesh>
      <mesh position={[0, -hh, z]} material={mats.cyanLight}><boxGeometry args={[hw * 2, 0.028, 0.02]} /></mesh>
      <mesh position={[-hw, 0, z]} material={mats.violetLight}><boxGeometry args={[0.028, hh * 2, 0.02]} /></mesh>
      <mesh position={[hw, 0, z]} material={mats.violetLight}><boxGeometry args={[0.028, hh * 2, 0.02]} /></mesh>
      {/* vertical pillar light bars */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 3.68, 0, z]} material={s < 0 ? mats.cyanLight : mats.violetLight}>
          <boxGeometry args={[0.03, 3.5, 0.02]} />
        </mesh>
      ))}
      {/* header underline & deck edge */}
      <mesh position={[0, MACHINE.fasciaH - 0.02, z]} material={mats.cyanLight}><boxGeometry args={[7.2, 0.022, 0.02]} /></mesh>
    </group>
  );
}

function Title() {
  const { texture } = useMemo(
    () =>
      canvasTexture(2048, 340, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.textBaseline = 'middle';
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, '#9be9ff');
        grad.addColorStop(0.5, '#ffffff');
        grad.addColorStop(1, '#c7b3ff');
        ctx.shadowColor = 'rgba(80,200,255,0.9)';
        ctx.shadowBlur = 38;
        ctx.fillStyle = grad;
        ctx.font = `800 170px ${FONT_STACK}`;
        drawSpaced(ctx, 'NEURAL JACKPOT', w / 2, h * 0.42, 22);
        ctx.shadowBlur = 14;
        ctx.fillStyle = 'rgba(190,220,255,0.85)';
        ctx.font = `600 54px ${FONT_STACK}`;
        drawSpaced(ctx, 'T H E   A I   W A R S', w / 2, h * 0.84, 18);
      }),
    [],
  );
  const matRef = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame((state) => {
    const flicker = 0.93 + Math.sin(state.clock.elapsedTime * 2.1) * 0.03 + animation.overload * 0.5;
    matRef.current.color.setScalar(flicker * (1 + animation.winPulse * 0.35));
  });
  return (
    <mesh position={[0, MACHINE.headerY + 0.01, 0.7]}>
      <planeGeometry args={[6.2, 1.03]} />
      <meshBasicMaterial ref={matRef} map={texture} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

function Header({ mats }: { mats: ChassisMaterials }) {
  return (
    <group>
      <RoundedBox args={[MACHINE.halfW * 2 - 0.2, 1.04, 1.3]} radius={0.16} smoothness={5} position={[0, MACHINE.headerY, 0.0]} material={mats.titanium} />
      {/* black glass sign plate */}
      <RoundedBox args={[6.6, 0.84, 0.12]} radius={0.05} smoothness={4} position={[0, MACHINE.headerY, 0.63]} material={mats.obsidian} />
      <Title />
      <mesh position={[0, MACHINE.headerY + 0.47, 0.7]} material={mats.cyanLight}><boxGeometry args={[6.5, 0.02, 0.02]} /></mesh>
      <mesh position={[0, MACHINE.headerY - 0.47, 0.7]} material={mats.violetLight}><boxGeometry args={[6.5, 0.02, 0.02]} /></mesh>
    </group>
  );
}

function Deck({ mats }: { mats: ChassisMaterials }) {
  const geometry = useMemo(() => {
    const W = MACHINE.halfW * 2 - 0.2;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(1.7, -0.46);
    shape.lineTo(1.7, -1.05);
    shape.lineTo(0, -1.05);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 });
    g.translate(0, 0, -W / 2);
    g.rotateY(-Math.PI / 2);
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group position={[0, MACHINE.deckTopY, 0.1]}>
      <mesh geometry={geometry} material={mats.graphite} />
      {/* front edge light */}
      <mesh position={[0, -0.47, 1.76]} material={mats.cyanLight}><boxGeometry args={[7.2, 0.025, 0.02]} /></mesh>
    </group>
  );
}

export function Chassis({ mats }: { mats: ChassisMaterials }) {
  const traceRects = useMemo(
    () => [
      { x0: -3.62, x1: -3.0, y0: -1.85, y1: 1.85, z: 0.455 },
      { x0: 3.0, x1: 3.62, y0: -1.85, y1: 1.85, z: 0.455 },
      { x0: -3.4, x1: 3.4, y0: 1.7, y1: 1.98, z: 0.455 },
    ],
    [],
  );
  const headerRects = useMemo(
    () => [
      { x0: -3.6, x1: -3.25, y0: 2.3, y1: 3.1, z: 0.655 },
      { x0: 3.25, x1: 3.6, y0: 2.3, y1: 3.1, z: 0.655 },
    ],
    [],
  );
  return (
    <group>
      {/* hidden body housing the drums */}
      <mesh position={[0, 0.2, -2.6]} material={mats.graphite}>
        <boxGeometry args={[MACHINE.halfW * 2 - 0.3, MACHINE.fasciaH * 2 - 0.2, 4.4]} />
      </mesh>
      <mesh position={[0, 0.0, -1.0]} material={mats.graphite}>
        <boxGeometry args={[MACHINE.halfW * 2 - 0.15, 6.0, 1.6]} />
      </mesh>
      <Fascia mats={mats} />
      <Header mats={mats} />
      <Deck mats={mats} />
      {/* pedestal */}
      <RoundedBox args={[MACHINE.halfW * 2 - 0.6, 0.6, 2.2]} radius={0.1} smoothness={3} position={[0, -3.45, 0.3]} material={mats.titanium} />
      <mesh position={[0, MACHINE.floorY + 0.02, 0.3]} material={mats.cyanLight}><boxGeometry args={[7.0, 0.018, 2.0]} /></mesh>
      <LightStrips mats={mats} />
      <NeuralTraces rects={traceRects} counts={[34, 34, 6]} seed={5} />
      <NeuralTraces rects={headerRects} counts={[6, 6]} seed={23} />
    </group>
  );
}
