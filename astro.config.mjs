// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages user site. For a project repository instead, set `site` to https://<username>.github.io
// and add `base: '/<repo-name>/'`.
export default defineConfig({
  site: 'https://mohamedfadhel-ghodhbane.github.io',
  build: { inlineStylesheets: 'always' },
});
