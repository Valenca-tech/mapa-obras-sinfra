import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Site estático: `npm run build` gera a pasta dist/, publicável em qualquer
// hospedagem de arquivos (GitHub Pages, HostGator). Sem servidor Node em produção.
export default defineConfig({
  base: './',
  plugins: [vue()],
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'], // o PGlite carrega o próprio WebAssembly
    // Pré-otimizados desde o início do `npm run dev`: carregados só quando o
    // mapa abre, fariam o Vite reotimizar e recarregar a página nessa hora.
    include: ['maplibre-gl', '@maplibre/maplibre-gl-leaflet'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  worker: { format: 'es' },
});
