import { defineConfig } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 5000,
    allowedHosts: "all",
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        // Suprimir warnings específicos que não afetam o funcionamento
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(warning);
      },
      output: {
        manualChunks: {
          // Separar vendors grandes em chunks próprios
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
          ],
          'supabase': ['@supabase/supabase-js', '@supabase/auth-ui-react'],
          'query': ['@tanstack/react-query'],
          'form': ['react-hook-form', '@hookform/resolvers', 'zod'],
          'icons': ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 600, // Aumentar limite para 600kb
  },
  plugins: [
    dyadComponentTagger(), 
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  css: {
    postcss: "./postcss.config.js",
  },
}));