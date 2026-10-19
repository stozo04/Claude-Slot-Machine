import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useGame, type Quality } from '../store/gameStore';
import { Chassis, useChassisMaterials } from './Chassis';
import { CameraRig } from './CameraRig';
import { ControlDeck3D } from './ControlDeck3D';
import { Effects } from './Effects';
import { HoloReadouts } from './HoloReadouts';
import { ReelBank } from './Reels';
import { Stage } from './Stage';
import { buildSymbolAtlas } from './symbolAtlas';
import { WinParticles } from './WinParticles';

const QUALITY_LEVEL: Record<Quality, number> = { low: 0, balanced: 1, high: 2 };

function Machine({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const [atlas, setAtlas] = useState<THREE.Texture | null>(null);
  const mats = useChassisMaterials();
  const quality = useGame((s) => s.settings.quality);
  const reduced = useGame((s) => s.settings.reducedMotion);
  const q = QUALITY_LEVEL[quality];

  useEffect(() => {
    let cancelled = false;
    buildSymbolAtlas(gl)
      .then((tex) => {
        if (!cancelled) setAtlas(tex);
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [gl]);

  useEffect(() => {
    if (atlas) onReady();
  }, [atlas, onReady]);

  return (
    <>
      <Stage reflective={q >= 1} quality={q} />
      <CameraRig parallax={!reduced} />
      <group>
        <Chassis mats={mats} />
        {atlas && <ReelBank atlas={atlas} mats={mats} quality={q} />}
        <HoloReadouts />
        <ControlDeck3D mats={mats} />
        <WinParticles enabled={!reduced} />
      </group>
      <Effects quality={q} />
    </>
  );
}

export default function SlotMachine3D({ onReady }: { onReady: () => void }) {
  const quality = useGame((s) => s.settings.quality);
  const dprMax = quality === 'high' ? 2 : quality === 'balanced' ? 1.5 : 1;
  return (
    <Canvas
      dpr={[1, dprMax]}
      camera={{ fov: 30, near: 0.1, far: 120, position: [0, 0.4, 16] }}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.NoToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        if (import.meta.env.DEV) (window as unknown as { __NEURAL__?: Record<string, unknown> }).__NEURAL__ = { ...(window as unknown as { __NEURAL__?: Record<string, unknown> }).__NEURAL__, scene, gl };
      }}
      aria-hidden
    >
      <Suspense fallback={null}>
        <Machine onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
