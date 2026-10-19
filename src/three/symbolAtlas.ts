import * as THREE from 'three';
import { SYMBOLS, SYMBOL_IDS, type SymbolDef } from '../config/gameConfig';

/** 3 × 2 atlas of 512 px symbol tiles, in SYMBOL_IDS order. Tile 0 (BLANK) stays empty. */
export const ATLAS_COLS = 3;
export const ATLAS_ROWS = 2;
const TILE = 512;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load symbol asset: ${src}`));
    img.src = src;
  });
}

/** Draw a logo preserving its aspect ratio, centred inside the tile with a margin. */
function fit(img: HTMLImageElement, box: number) {
  const w = img.naturalWidth || 256;
  const h = img.naturalHeight || 256;
  const k = box / Math.max(w, h);
  return { w: w * k, h: h * k };
}

async function drawSymbol(ctx: CanvasRenderingContext2D, def: SymbolDef, ox: number, oy: number) {
  if (!def.asset || def.treatment === 'none') return;
  const img = await loadImage(def.asset);
  const cx = ox + TILE / 2;
  const cy = oy + TILE / 2;
  ctx.save();
  if (def.treatment === 'medallion') {
    // Opaque artwork (Muse): crop into a circular medallion with a thin lit rim.
    const r = TILE * 0.36;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    ctx.save();
    ctx.lineWidth = 7;
    ctx.strokeStyle = def.glow;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const { w, h } = fit(img, TILE * (def.id === 'GEMINI' ? 0.62 : 0.6));
  if (def.treatment === 'invert-white') {
    // Black-on-transparent marks: keep the exact artwork shape, light it white for the dark glass.
    const tmp = document.createElement('canvas');
    tmp.width = TILE;
    tmp.height = TILE;
    const t = tmp.getContext('2d')!;
    t.drawImage(img, (TILE - w) / 2, (TILE - h) / 2, w, h);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = '#ffffff';
    t.fillRect(0, 0, TILE, TILE);
    ctx.drawImage(tmp, ox, oy);
  } else {
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  }
  ctx.restore();
}

export async function buildSymbolAtlas(renderer?: THREE.WebGLRenderer): Promise<THREE.CanvasTexture> {
  const canvas = document.createElement('canvas');
  canvas.width = TILE * ATLAS_COLS;
  canvas.height = TILE * ATLAS_ROWS;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await Promise.all(
    SYMBOL_IDS.map((id, i) => drawSymbol(ctx, SYMBOLS[id], (i % ATLAS_COLS) * TILE, Math.floor(i / ATLAS_COLS) * TILE)),
  );
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = true; // shader treats samples as premultiplied → no dark fringes in mips
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = renderer ? Math.min(16, renderer.capabilities.getMaxAnisotropy()) : 8;
  tex.needsUpdate = true;
  return tex;
}
