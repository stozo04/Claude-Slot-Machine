import { ContactShadows, Environment, Lightformer, MeshReflectorMaterial } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { animation } from '../animation/AnimationController';
import { mulberry32 } from '../engine/rng';
import { MACHINE } from './Chassis';
import { createSpriteTexture } from './textures';

/** Procedural IBL (no network): soft boxes that give the titanium and glass something to reflect. */
function StudioEnvironment() {
  return (
    <Environment resolution={256} frames={1} background={false}>
      <color attach="background" args={['#02030a']} />
      <Lightformer form="rect" intensity={4.5} position={[0, 7, 4]} scale={[14, 1.4, 1]} rotation-x={Math.PI / 2.4} color="#dfeaff" />
      <Lightformer form="rect" intensity={2.4} position={[-8, 1, 3]} scale={[1.2, 9, 1]} rotation-y={Math.PI / 2.8} color="#38c8ff" />
      <Lightformer form="rect" intensity={2.4} position={[8, 1, 3]} scale={[1.2, 9, 1]} rotation-y={-Math.PI / 2.8} color="#9a6bff" />
      <Lightformer form="rect" intensity={1.2} position={[0, -2, 8]} scale={[12, 1.2, 1]} color="#6aa7ff" />
      {/* broad front fill: gives flat faces a soft gradient to reflect */}
      <Lightformer form="rect" intensity={1.8} position={[0, 1.5, 10]} scale={[22, 9, 1]} rotation-y={Math.PI} color="#9db4d4" />
      <Lightformer form="rect" intensity={1.6} position={[-5, 4, 9]} scale={[6, 1, 1]} rotation-y={Math.PI} color="#e6f0ff" />
      <Lightformer form="rect" intensity={1.6} position={[5, -1, 9]} scale={[6, 1, 1]} rotation-y={Math.PI} color="#d8c9ff" />
      <Lightformer form="circle" intensity={1.6} position={[0, 3, -8]} scale={6} color="#4a7fff" />
    </Environment>
  );
}

/** A hall of dark neighbours: out-of-focus sister machines and light strips. */
function Backdrop() {
  const items = useMemo(() => {
    const rnd = mulberry32(42);
    const machines = Array.from({ length: 9 }, (_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      return { x: side * (9 + row * 5.2 + rnd() * 1.2), z: -6 - row * 7, hue: rnd() < 0.5 ? '#2fb6ff' : '#8b5bff', h: 7 + rnd() * 1.5 };
    });
    const strips = Array.from({ length: 16 }, (_, i) => ({ x: -26 + i * 3.5 + rnd(), h: 6 + rnd() * 12, color: rnd() < 0.6 ? '#1c8fd0' : '#6a3fd0' }));
    return { machines, strips };
  }, []);
  return (
    <group>
      {items.machines.map((m, i) => (
        <group key={i} position={[m.x, MACHINE.floorY + m.h / 2, m.z]}>
          <mesh>
            <boxGeometry args={[6.8, m.h, 3.5]} />
            <meshStandardMaterial color="#07090d" metalness={0.8} roughness={0.5} />
          </mesh>
          <mesh position={[0, m.h / 2 - 0.5, 1.76]}>
            <planeGeometry args={[5.4, 0.25]} />
            <meshBasicMaterial color={new THREE.Color(m.hue).multiplyScalar(0.9)} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {items.strips.map((s, i) => (
        <mesh key={i} position={[s.x, -3 + s.h / 2, -34]}>
          <boxGeometry args={[0.12, s.h, 0.12]} />
          <meshBasicMaterial color={new THREE.Color(s.color).multiplyScalar(1.6)} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, 6, -36]}>
        <planeGeometry args={[120, 40]} />
        <meshBasicMaterial color="#03050a" />
      </mesh>
    </group>
  );
}

/** Slowly drifting luminous motes, brightening with the machine's energy. */
function Motes() {
  const sprite = useMemo(createSpriteTexture, []);
  const { geometry, base } = useMemo(() => {
    const rnd = mulberry32(9);
    const n = 140;
    const pos = new Float32Array(n * 3);
    const b = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rnd() - 0.5) * 30;
      pos[i * 3 + 1] = -3 + rnd() * 12;
      pos[i * 3 + 2] = -10 + rnd() * 18;
      b.set([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return { geometry: g, base: b };
  }, []);
  const mat = useRef<THREE.PointsMaterial>(null!);
  useEffect(() => () => { geometry.dispose(); sprite.dispose(); }, [geometry, sprite]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, base[i * 3 + 1] + Math.sin(t * 0.15 + i) * 0.5 + ((t * 0.12 * (0.4 + (i % 5) * 0.2)) % 12) * 0.0);
      pos.setX(i, base[i * 3] + Math.cos(t * 0.1 + i * 1.3) * 0.4);
    }
    pos.needsUpdate = true;
    mat.current.opacity = 0.25 + animation.energy * 0.35;
  });
  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial ref={mat} map={sprite} size={0.22} color="#5fb8ff" transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation toneMapped={false} />
    </points>
  );
}

export function Stage({ reflective, quality }: { reflective: boolean; quality: number }) {
  const key = useRef<THREE.SpotLight>(null!);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    key.current.intensity = 120 + animation.energy * 40 + animation.overload * 40 + Math.sin(t * 0.7) * 4;
  });
  return (
    <>
      <color attach="background" args={['#03050a']} />
      <fog attach="fog" args={['#03050a', 16, 55]} />
      <StudioEnvironment />
      <ambientLight intensity={0.08} />
      <spotLight ref={key} position={[-3, 9, 9]} angle={0.55} penumbra={1} intensity={120} color="#cfe3ff" distance={40} decay={2} target-position={[0, 0, 0]} />
      <pointLight position={[-7, 1, 3]} intensity={26} color="#2fb6ff" distance={16} decay={2} />
      <pointLight position={[7, 1, 3]} intensity={26} color="#8b5bff" distance={16} decay={2} />
      <pointLight position={[0, -3.4, 4]} intensity={10} color="#27c8ff" distance={9} decay={2} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, MACHINE.floorY, 0]}>
        <planeGeometry args={[90, 70]} />
        {reflective ? (
          <MeshReflectorMaterial
            blur={[260, 80]}
            resolution={quality >= 2 ? 768 : 384}
            mixBlur={1.2}
            mixStrength={2.4}
            mirror={0.55}
            roughness={0.9}
            depthScale={0.9}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.3}
            color="#06080d"
            metalness={0.6}
          />
        ) : (
          <meshStandardMaterial color="#05070b" metalness={0.7} roughness={0.5} />
        )}
      </mesh>
      <ContactShadows position={[0, MACHINE.floorY + 0.01, 0.2]} opacity={0.85} scale={16} blur={2.6} far={5} resolution={512} color="#000000" />
      <Backdrop />
      <Motes />
    </>
  );
}
