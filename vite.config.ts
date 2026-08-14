import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // alvo conservador — precisa rodar em Safari/iPhones mais antigos usados
    // pelos colaboradores em viagem, não só nos navegadores mais recentes
    target: ['es2017', 'safari12', 'ios12'],
  },
});
