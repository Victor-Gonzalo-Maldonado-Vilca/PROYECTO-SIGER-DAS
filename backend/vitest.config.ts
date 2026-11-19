import { defineConfig } from 'vitest/config';

// `npm test` ejecuta solo las pruebas unitarias (no necesitan base de datos).
// `npm run test:integracion` ejecuta las que usan PostgreSQL (docker compose up -d).
const integracion = process.env.SIGER_INTEGRACION === '1';

export default defineConfig({
  test: {
    include: integracion ? ['src/**/*.integracion.test.ts'] : ['src/**/*.test.ts'],
    exclude: integracion ? [] : ['src/**/*.integracion.test.ts', 'node_modules/**'],
    fileParallelism: false,
  },
});
