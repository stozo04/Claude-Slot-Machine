import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { animation } from '../animation/AnimationController';
import { SYMBOLS, WIN_TIERS } from '../config/gameConfig';
import { analysisSummary } from '../engine/summary';
import { useGame } from '../store/gameStore';
import { money } from '../utils/format';
import { FONT_STACK, MONO_STACK } from './textures';

/** A floating translucent readout rendered from a canvas; redraws only when its text changes. */
function useCanvasPlane(width: number, height: number) {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return { canvas, ctx: canvas.getContext('2d')!, texture };
  }, [width, height]);
}

function drawPanel(ctx: CanvasRenderingContext2D, w: number, h: number, label: string, value: string, accent: string) {
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, 'rgba(10,28,44,0.55)');
  bg.addColorStop(1, 'rgba(8,12,24,0.35)');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(6, 6, w - 12, h - 12, 22);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.globalAlpha = 1;
  // scanlines
  ctx.fillStyle = 'rgba(160,220,255,0.05)';
  for (let y = 12; y < h - 12; y += 6) ctx.fillRect(14, y, w - 28, 1.5);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = accent;
  ctx.font = `600 34px ${FONT_STACK}`;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 12;
  ctx.fillText(label, 34, h * 0.26);
  ctx.fillStyle = '#eaf6ff';
  ctx.shadowBlur = 20;
  let size = 82;
  ctx.font = `700 ${size}px ${MONO_STACK}`;
  while (ctx.measureText(value).width > w - 68 && size > 30) {
    size -= 4;
    ctx.font = `700 ${size}px ${MONO_STACK}`;
  }
  ctx.fillText(value, 34, h * 0.64);
  ctx.shadowBlur = 0;
}

function HoloPanel({ position, rotationY, label, accent, select }: { position: [number, number, number]; rotationY: number; label: string; accent: string; select: () => string }) {
  const { canvas, ctx, texture } = useCanvasPlane(512, 220);
  const last = useRef('');
  const mesh = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame((state) => {
    const text = select();
    if (text !== last.current) {
      last.current = text;
      drawPanel(ctx, canvas.width, canvas.height, label, text, accent);
      texture.needsUpdate = true;
    }
    const t = state.clock.elapsedTime;
    mesh.current.position.y = position[1] + Math.sin(t * 0.8 + position[0]) * 0.035;
    mat.current.opacity = 0.9 + Math.sin(t * 3.1 + position[1] * 4) * 0.04 + animation.winPulse * 0.1;
  });
  return (
    <mesh ref={mesh} position={position} rotation={[0, rotationY, 0]} renderOrder={8}>
      <planeGeometry args={[1.18, 0.5]} />
      <meshBasicMaterial ref={mat} map={texture} transparent toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

/**
 * Holographic win total. Everyday wins show in a slim readout strip under the reels so the winning
 * symbols stay visible; MEGA WIN / NEURAL OVERLOAD take over the centre of the glass.
 */
function WinHologram() {
  const { canvas, ctx, texture } = useCanvasPlane(1400, 420);
  const mesh = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  const state = useRef({ text: '', label: '', color: '#ffffff', shown: 0, last: '', centre: false });

  useEffect(() => {
    const offStart = animation.on('win-start', (payload) => {
      const { tier } = payload as { tier: string };
      state.current.label = WIN_TIERS.find((t) => t.id === tier)?.label ?? 'WIN';
      state.current.color = SYMBOLS[animation.presentingSymbol ?? 'GROK'].glow;
      state.current.text = money(0);
      state.current.centre = tier === 'mega' || tier === 'overload';
    });
    const offCount = animation.on('win-count', (value) => {
      state.current.text = money(value as number);
    });
    return () => {
      offStart();
      offCount();
    };
  }, []);

  useFrame((_, dt) => {
    const s = state.current;
    const target = animation.isPresentingWin ? 1 : 0;
    s.shown += (target - s.shown) * Math.min(1, dt * (target ? 9 : 4));
    mesh.current.visible = s.shown > 0.01;
    if (!mesh.current.visible) return;
    const key = `${s.label}|${s.text}|${s.color}|${s.centre}`;
    if (key !== s.last) {
      s.last = key;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 40;
      ctx.fillStyle = s.color;
      const label = [...s.label].join(' ');
      if (s.centre) {
        ctx.font = `700 64px ${FONT_STACK}`;
        ctx.fillText(label, w / 2, h * 0.2);
        ctx.fillStyle = '#ffffff';
        let size = 230;
        ctx.font = `800 ${size}px ${FONT_STACK}`;
        while (ctx.measureText(s.text).width > w - 80 && size > 60) {
          size -= 10;
          ctx.font = `800 ${size}px ${FONT_STACK}`;
        }
        ctx.fillText(s.text, w / 2, h * 0.62);
      } else {
        // single line: LABEL   $AMOUNT
        ctx.font = `700 92px ${FONT_STACK}`;
        const labelW = ctx.measureText(label).width;
        ctx.font = `800 150px ${FONT_STACK}`;
        const amountW = ctx.measureText(s.text).width;
        const gap = 70;
        const total = labelW + gap + amountW;
        const x0 = (w - total) / 2;
        ctx.textAlign = 'left';
        ctx.font = `700 92px ${FONT_STACK}`;
        ctx.fillStyle = s.color;
        ctx.fillText(label, x0, h / 2);
        ctx.font = `800 150px ${FONT_STACK}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(s.text, x0 + labelW + gap, h / 2 + 4);
      }
      ctx.shadowBlur = 0;
      texture.needsUpdate = true;
    }
    mat.current.opacity = s.shown * (s.centre ? 0.95 : 1);
    const m = mesh.current;
    if (s.centre) {
      m.position.set(0, 0.05, 0.9);
      m.scale.setScalar(0.9 + s.shown * 0.1 + (animation.presentingTier === 'overload' ? Math.sin(performance.now() / 180) * 0.015 : 0));
    } else {
      m.position.set(0, -1.84, 0.6);
      m.scale.setScalar(0.42 * (0.94 + s.shown * 0.06));
    }
  });
  return (
    <mesh ref={mesh} position={[0, 0.05, 0.9]} renderOrder={9} visible={false}>
      <planeGeometry args={[5.6, 1.68]} />
      <meshBasicMaterial ref={mat} map={texture} transparent toneMapped={false} depthWrite={false} depthTest={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

export function HoloReadouts() {
  const rtp = useMemo(() => analysisSummary().rtpLabel, []);
  const select = useMemo(
    () => ({
      balance: () => money(useGame.getState().snapshot.wallet.balance),
      bet: () => money(useGame.getState().snapshot.totalBet),
      win: () => money(useGame.getState().snapshot.lastWin),
      rtp: () => rtp,
    }),
    [rtp],
  );
  return (
    <group>
      <HoloPanel position={[-3.62, 1.55, 1.0]} rotationY={0.32} label="CREDITS" accent="#52d6ff" select={select.balance} />
      <HoloPanel position={[-3.62, 0.9, 1.0]} rotationY={0.32} label="TOTAL BET" accent="#52d6ff" select={select.bet} />
      <HoloPanel position={[3.62, 1.55, 1.0]} rotationY={-0.32} label="LAST WIN" accent="#b69cff" select={select.win} />
      <HoloPanel position={[3.62, 0.9, 1.0]} rotationY={-0.32} label="THEORETICAL RTP" accent="#b69cff" select={select.rtp} />
      <WinHologram />
    </group>
  );
}
