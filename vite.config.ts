import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Fix: Removed duplicate configuration block and imports
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-utils': ['recharts']
        }
      }
    }
  }
});