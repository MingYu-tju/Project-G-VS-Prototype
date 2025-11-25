import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Changed to relative path './' to ensure assets load correctly on GitHub Pages
  // regardless of the domain or subdirectory.
  base: './', 
  assetsInclude: ['**/*.glb'], // Ensure GLB files are treated as assets
})