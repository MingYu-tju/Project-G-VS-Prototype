import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use absolute root path for custom domains. 
  // This ensures /models/head.glb resolves correctly to https://yourdomain.com/models/head.glb
  base: '/', 
  assetsInclude: ['**/*.glb'],
})