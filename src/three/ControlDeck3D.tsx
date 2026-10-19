import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { animation } from '../animation/AnimationController';
import { DENOMINATIONS, MULTIPLIERS } from '../config/gameConfig';
import { actions, startSpin, useGame } from '../store/gameStore';
import { MACHINE, type ChassisMaterials } from './Chassis';
import { canvasTexture, FONT_STACK } from './textures';

const setCursor = (c: string) => {
  document.body.style.cursor = c;
};

function labelTexture(text: string, size = 48, color = '#9fb4c8') {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.font = `600 ${size}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText([...text].join(' '), w / 2, h / 2);
  }).texture;
}

function Label({ text, position, width = 0.9, color }: { text: string; position: [number, number, number]; width?: number; color?: string }) {
  const tex = useMemo(() => labelTexture(text, 44, color), [text, color]);
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, width / 4]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/** Physically modelled SPIN button: lit ring, depressing cap. Mirrors the HTML SPIN button. */
function SpinButton({ mats }: { mats: ChassisMaterials }) {
  const cap = useRef<THREE.Group>(null!);
  const ring = useRef<THREE.MeshBasicMaterial>(null!);
  const capMat = useRef<THREE.MeshStandardMaterial>(null!);
  const pressed = useRef(false);
  const labelTex = useMemo(
    () =>
      canvasTexture(256, 256, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#d9f6ff';
        ctx.font = `800 70px ${FONT_STACK}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SPIN', w / 2, h / 2);
      }).texture,
    [],
  );
  useFrame((state) => {
    const snap = useGame.getState().snapshot;
    const enabled = snap.spinBlocker === null;
    const busy = snap.phase !== 'IDLE';
    const t = state.clock.elapsedTime;
    const target = pressed.current || busy ? -0.07 : 0;
    cap.current.position.y += (target - cap.current.position.y) * 0.3;
    const glow = enabled ? 1.6 + Math.sin(t * 2.4) * 0.5 : busy ? 1.0 + Math.sin(t * 9) * 0.5 : 0.15;
    ring.current.color.setRGB(0.1 * glow, 0.9 * glow, 1.3 * glow);
    capMat.current.emissiveIntensity = enabled ? 0.55 + animation.winPulse * 0.8 : busy ? 0.35 : 0.05;
  });
  const onDown = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    pressed.current = true;
  };
  const onUp = () => {
    if (!pressed.current) return;
    pressed.current = false;
    startSpin();
  };
  return (
    <group position={[0, 0.0, 0.1]}>
      <mesh material={mats.graphite} position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.78, 0.84, 0.12, 64]} />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.66, 0.028, 16, 96]} />
        <meshBasicMaterial ref={ring} toneMapped={false} />
      </mesh>
      <group
        ref={cap}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerLeave={() => {
          pressed.current = false;
          setCursor('auto');
        }}
        onPointerOver={() => setCursor('pointer')}
      >
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.58, 0.62, 0.22, 64]} />
          <meshStandardMaterial ref={capMat} color="#10161d" metalness={0.6} roughness={0.2} emissive="#12a8d8" emissiveIntensity={0.5} envMapIntensity={1.4} />
        </mesh>
        <mesh position={[0, 0.312, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.52, 48]} />
          <meshBasicMaterial map={labelTex} transparent toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Metallic selector knob that rotates to the selected detent and cycles on click. */
function Knob({ position, label, values, current, onSelect, mats }: { position: [number, number, number]; label: string; values: readonly number[]; current: () => number; onSelect: (v: number) => void; mats: ChassisMaterials }) {
  const group = useRef<THREE.Group>(null!);
  const knurl = useMemo(() => Array.from({ length: 28 }, (_, i) => (i / 28) * Math.PI * 2), []);
  useFrame(() => {
    const idx = Math.max(0, values.indexOf(current()));
    const target = ((idx - 1) * Math.PI) / 3;
    group.current.rotation.y += (-target - group.current.rotation.y) * 0.18;
  });
  return (
    <group position={position}>
      <mesh material={mats.graphite} position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.5, 0.54, 0.08, 48]} />
      </mesh>
      {/* detent ticks */}
      {values.map((v, i) => {
        const a = ((i - 1) * Math.PI) / 3;
        return (
          <mesh key={v} position={[Math.sin(a) * 0.6, 0.07, -Math.cos(a) * 0.6]} material={mats.cyanLight}>
            <boxGeometry args={[0.045, 0.02, 0.1]} />
          </mesh>
        );
      })}
      <group
        ref={group}
        onClick={(e) => {
          e.stopPropagation();
          const idx = values.indexOf(current());
          onSelect(values[(idx + 1) % values.length]);
        }}
        onPointerOver={() => setCursor('pointer')}
        onPointerOut={() => setCursor('auto')}
      >
        <mesh material={mats.trim} position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.34, 0.37, 0.28, 48]} />
        </mesh>
        {knurl.map((a, i) => (
          <mesh key={i} position={[Math.sin(a) * 0.37, 0.2, Math.cos(a) * 0.37]} rotation={[0, a, 0]} material={mats.trim}>
            <boxGeometry args={[0.035, 0.27, 0.035]} />
          </mesh>
        ))}
        <mesh position={[0, 0.345, 0]} material={mats.obsidian}>
          <cylinderGeometry args={[0.28, 0.28, 0.03, 40]} />
        </mesh>
        {/* indicator */}
        <mesh position={[0, 0.365, -0.17]} material={mats.cyanLight}>
          <boxGeometry args={[0.04, 0.02, 0.18]} />
        </mesh>
      </group>
      <Label text={label} position={[0, 0.03, 0.74]} width={1.0} />
    </group>
  );
}

function TactileButton({ position, label, onPress, mats, accent }: { position: [number, number, number]; label: string; onPress: () => void; mats: ChassisMaterials; accent: 'cyan' | 'violet' }) {
  const cap = useRef<THREE.Mesh>(null!);
  const pressed = useRef(false);
  useFrame(() => {
    const target = pressed.current ? -0.035 : 0.0;
    cap.current.position.y += (0.1 + target - cap.current.position.y) * 0.35;
  });
  return (
    <group position={position}>
      <mesh material={mats.graphite} position={[0, 0.03, 0]}>
        <boxGeometry args={[0.8, 0.08, 0.4]} />
      </mesh>
      <mesh
        ref={cap}
        position={[0, 0.1, 0]}
        material={mats.obsidian}
        onPointerDown={(e) => {
          e.stopPropagation();
          pressed.current = true;
        }}
        onPointerUp={() => {
          if (pressed.current) onPress();
          pressed.current = false;
        }}
        onPointerLeave={() => {
          pressed.current = false;
          setCursor('auto');
        }}
        onPointerOver={() => setCursor('pointer')}
      >
        <boxGeometry args={[0.68, 0.08, 0.3]} />
      </mesh>
      <mesh position={[0, 0.147, 0.14]} material={accent === 'cyan' ? mats.cyanLight : mats.violetLight}>
        <boxGeometry args={[0.5, 0.01, 0.015]} />
      </mesh>
      <Label text={label} position={[0, 0.03, 0.34]} width={0.95} color={accent === 'cyan' ? '#7fdcff' : '#c2b0ff'} />
    </group>
  );
}

export function ControlDeck3D({ mats }: { mats: ChassisMaterials }) {
  const getDenom = () => useGame.getState().snapshot.denomination;
  const getMult = () => useGame.getState().snapshot.multiplier;
  return (
    <group position={[0, MACHINE.deckTopY - 0.23, 0.1 + 0.85]} rotation={[MACHINE.deckAngle, 0, 0]}>
      <SpinButton mats={mats} />
      <Knob position={[-2.55, 0, 0.0]} label="DENOM" values={DENOMINATIONS} current={getDenom} onSelect={actions.setDenomination} mats={mats} />
      <Knob position={[2.55, 0, 0.0]} label="BET ×" values={MULTIPLIERS} current={getMult} onSelect={actions.setMultiplier} mats={mats} />
      <TactileButton position={[-1.4, 0, 0.12]} label="DEPOSIT" onPress={actions.openDeposit} mats={mats} accent="cyan" />
      <TactileButton position={[1.4, 0, 0.12]} label="CASH OUT" onPress={actions.requestCashOut} mats={mats} accent="violet" />
    </group>
  );
}
