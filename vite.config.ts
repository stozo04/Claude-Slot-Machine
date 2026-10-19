import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps every URL relative so the build works on GitHub Pages sub-paths.
export default defineConfig({ base: './', plugins: [react()] });
