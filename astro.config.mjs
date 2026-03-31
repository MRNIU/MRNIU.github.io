// @ts-check
import { defineConfig } from 'astro/config';
import { copyDataIntegration } from './src/integrations/copy-data.ts';

// https://astro.build/config
export default defineConfig({
  integrations: [copyDataIntegration()],
});
