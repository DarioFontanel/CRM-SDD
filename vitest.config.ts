import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // "Oggi" è il giorno locale del Mac: i test fissano il fuso per essere ripetibili.
    env: { TZ: 'Europe/Rome' },
  },
});
