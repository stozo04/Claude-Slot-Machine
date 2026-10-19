import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { animation } from '../animation/AnimationController';
import { SYMBOLS, type SymbolId } from '../config/gameConfig';
import { cellCenter } from './reelMaterial';
import { createSpriteTexture } from './textures';

const MAX = 520;

/** Cosmetic particles in the winning symbols' signature colours. Never touches game state. */
export function WinParticles({ enabled }: { enabled: boolean }) {
  const data = useMemo(
    () => ({
      pos: new Float32Array(MAX * 3),
      vel: new Float32Array(MAX * 3),
      col: new Float32Array(MAX * 3),
      base: new Float32Array(MAX * 3),
      life: new Float32Array(MAX),
      max: new Float32Array(MAX),
      cursor: 0,
    }),
    [],
  );
  const sprite = useMemo(createSpriteTexture, []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(data.col, 3));
    return g;
  }, [data]);
  useEffect(() => () => { geometry.dispose(); sprite.dispose(); }, [geometry, sprite]);
  const lastBurst = useRef(0);
  const tmp = useMemo(() => new THREE.Color(), []);

  const emit = (symbol: SymbolId, x: number, y: number, z: number, speed: number) => {
    const i = data.cursor++ % MAX;
    data.pos[i * 3] = x + (Math.random() - 0.5) * 0.5;
    data.pos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.5;
    data.pos[i * 3 + 2] = z;
    const a = Math.random() * Math.PI * 2;
    const sp = speed * (0.3 + Math.random());
    data.vel[i * 3] = Math.cos(a) * sp;
    data.vel[i * 3 + 1] = Math.sin(a) * sp + speed * 0.3;
    data.vel[i * 3 + 2] = (Math.random() * 0.6 + 0.2) * speed;
    const def = SYMBOLS[symbol];
    if (symbol === 'GEMINI') tmp.setHSL(Math.random(), 0.9, 0.62);
    else tmp.set(Math.random() < 0.65 ? def.glow : def.glow2 ?? def.glow);
    tmp.convertSRGBToLinear();
    data.base[i * 3] = tmp.r;
    data.base[i * 3 + 1] = tmp.g;
    data.base[i * 3 + 2] = tmp.b;
    data.max[i] = data.life[i] = 0.9 + Math.random() * 1.1;
  };

  useFrame((_, dt) => {
    if (!enabled || animation.reducedMotion) {
      return;
    }
    const tierBoost = { none: 0, small: 28, nice: 60, big: 110, mega: 170, overload: 260, }[animation.presentingTier];
    if (animation.burstCounter !== lastBurst.current) {
      lastBurst.current = animation.burstCounter;
      const cells = animation.winCells;
      for (let n = 0; n < tierBoost && cells.length; n++) {
        const c = cells[n % cells.length];
        const p = cellCenter(c.reel, c.row, 0.25);
        emit(c.symbol, p.x, p.y, p.z, 1.3);
      }
    }
    if (animation.isPresentingWin && animation.presentingTier !== 'small') {
      const rate = tierBoost * 0.9; // per second
      const cells = animation.winCells;
      const n = Math.floor(rate * dt + Math.random());
      for (let k = 0; k < n && cells.length; k++) {
        const c = cells[Math.floor(Math.random() * cells.length)];
        const p = cellCenter(c.reel, c.row, 0.25);
        emit(c.symbol, p.x, p.y, p.z, 0.9);
      }
    }
    for (let i = 0; i < MAX; i++) {
      if (data.life[i] <= 0) {
        data.col[i * 3] = data.col[i * 3 + 1] = data.col[i * 3 + 2] = 0;
        continue;
      }
      data.life[i] -= dt;
      const f = Math.max(0, data.life[i] / data.max[i]);
      data.vel[i * 3 + 1] -= dt * 0.9;
      data.pos[i * 3] += data.vel[i * 3] * dt;
      data.pos[i * 3 + 1] += data.vel[i * 3 + 1] * dt;
      data.pos[i * 3 + 2] += data.vel[i * 3 + 2] * dt;
      const k = f * f * 2.2;
      data.col[i * 3] = data.base[i * 3] * k;
      data.col[i * 3 + 1] = data.base[i * 3 + 1] * k;
      data.col[i * 3 + 2] = data.base[i * 3 + 2] * k;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  });
  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={10}>
      <pointsMaterial map={sprite} size={0.16} sizeAttenuation vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  );
}
