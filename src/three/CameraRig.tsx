import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { animation } from '../animation/AnimationController';

/** Machine bounds used for framing (scene units). */
const FIT = { halfW: 4.7, top: 3.3, bottom: -3.3 };

/**
 * Frames the machine in the space left between the HTML top bar and bottom console, adds a gentle
 * pointer parallax, and pulls back for big wins. Camera motion never touches outcomes.
 */
export function CameraRig({ parallax }: { parallax: boolean }) {
  const { camera, size, pointer } = useThree();
  const insets = useRef({ top: 64, bottom: 160 });
  const smooth = useRef({ x: 0, y: 0, dist: 14 });

  useEffect(() => {
    const read = () => {
      const top = document.querySelector('[data-topbar]')?.getBoundingClientRect().height ?? 64;
      const bottom = document.querySelector('[data-console]')?.getBoundingClientRect().height ?? 160;
      insets.current = { top, bottom };
    };
    read();
    const ro = new ResizeObserver(read);
    document.querySelectorAll('[data-topbar],[data-console]').forEach((el) => ro.observe(el));
    window.addEventListener('resize', read);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', read);
    };
  }, []);

  useFrame((_, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    const availH = Math.max(200, size.height - insets.current.top - insets.current.bottom);
    const availAspect = size.width / availH;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const halfH = (FIT.top - FIT.bottom) / 2;
    // Distance so the machine fits the free rectangle (height- or width-limited), scaled up to the full canvas.
    const distH = (halfH / tanHalf) * (size.height / availH);
    const distW = (FIT.halfW / (tanHalf * (size.width / size.height))) * 1.0;
    const baseDist = Math.max(distH, distW, 9) + 1.2;
    const s = smooth.current;
    const k = 1 - Math.exp(-dt * 3);
    const targetDist = baseDist * (1 + animation.cameraPull * 0.22);
    s.dist += (targetDist - s.dist) * k;
    const px = parallax ? pointer.x : 0;
    const py = parallax ? pointer.y : 0;
    s.x += (px * 0.7 - s.x) * k;
    s.y += (py * 0.35 - s.y) * k;
    const centreY = (FIT.top + FIT.bottom) / 2;
    cam.position.set(s.x, centreY + 0.5 + s.y + animation.cameraPull * 0.35, s.dist);
    cam.lookAt(0, centreY - 0.1, 0);
    // Shift the framing so the machine sits centred between the top bar and the console.
    const shift = (insets.current.bottom - insets.current.top) / 2;
    cam.setViewOffset(size.width, size.height, 0, shift, size.width, size.height);
  });
  return null;
}
