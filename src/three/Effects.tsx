import { Bloom, ChromaticAberration, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { animation } from '../animation/AnimationController';

/** Performance-aware post stack: bloom on HDR-bright light only, filmic tone map, gentle vignette. */
export function Effects({ quality }: { quality: number }) {
  const bloom = useRef<{ intensity: number }>(null);
  useFrame(() => {
    if (bloom.current) bloom.current.intensity = 0.5 + animation.energy * 0.2 + animation.overload * 0.3 + animation.winPulse * 0.12;
  });
  return (
    <EffectComposer multisampling={quality >= 2 ? 4 : 0} enableNormalPass={false}>
      <Bloom ref={bloom as never} mipmapBlur luminanceThreshold={0.95} luminanceSmoothing={0.2} intensity={0.6} radius={quality >= 2 ? 0.78 : 0.6} levels={quality >= 2 ? 8 : 5} />
      {quality >= 2 ? <ChromaticAberration offset={new THREE.Vector2(0.0004, 0.0005)} radialModulation modulationOffset={0.4} /> : <></>}
      <Vignette eskil={false} offset={0.28} darkness={0.75} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.18} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
