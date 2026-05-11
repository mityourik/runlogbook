import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/me': 'http://localhost:3000',
      '/runs': 'http://localhost:3000',
      '/notifications': 'http://localhost:3000',
      '/analytics': 'http://localhost:3000',
      '/training-plans': 'http://localhost:3000',
      '/planned-workouts': 'http://localhost:3000',
      '/integrations': 'http://localhost:3000'
    }
  }
});
