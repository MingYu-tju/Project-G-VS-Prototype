import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use absolute root path for custom domains. 
  // This ensures /models/head.glb resolves correctly to https://yourdomain.com/models/head.glb
  base: '/', 
  assetsInclude: ['**/*.glb'],
    build: {
    rollupOptions: {
      // Tell Vite/Rollup to ignore these imports because they are provided by the index.html importmap
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'three',
        'zustand',
        '@react-three/fiber',
        '@react-three/drei',
        '@react-three/postprocessing',
        'postprocessing'
      ],
      output: {
        // Map the external imports to global variables (optional but good practice for UMD builds)
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          three: 'THREE',
          '@react-three/fiber': 'ReactThreeFiber',
          '@react-three/drei': 'ReactThreeDrei',
          '@react-three/postprocessing': 'ReactThreePostprocessing',
          'postprocessing': 'Postprocessing'
        }
      }
    }
  }

})