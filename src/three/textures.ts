import * as THREE from 'three';

/** Procedural brushed-metal grain (horizontal streaks) used for roughness + bump. */
export function createBrushedTexture(size = 512, seed = 7): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#7a7a7a';
  ctx.fillRect(0, 0, size, size);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < size * 7; i++) {
    const y = rnd() * size;
    const x = rnd() * size;
    const len = 20 + rnd() * size * 0.7;
    const v = Math.floor(70 + rnd() * 120);
    ctx.strokeStyle = `rgba(${v},${v},${v},${0.05 + rnd() * 0.13})`;
    ctx.lineWidth = 0.5 + rnd() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (rnd() - 0.5) * 0.6);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Soft round sprite for particles / bokeh. */
export function createSpriteTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export const FONT_STACK = '"SF Pro Display", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", Arial, sans-serif';
export const MONO_STACK = '"SF Mono", ui-monospace, Menlo, Consolas, monospace';

/** Draw text with manual letter spacing (canvas letterSpacing support is uneven) and a neon glow. */
export function drawSpaced(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, spacing: number, align: 'center' | 'left' | 'right' = 'center') {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let x = align === 'center' ? cx - total / 2 : align === 'left' ? cx : cx - total;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, x, cy);
    x += widths[i] + spacing;
  });
  ctx.textAlign = prev;
}

export function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  draw(ctx, width, height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return { texture: t, canvas: c, ctx };
}
