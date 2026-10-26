# Mohamed Fadhel Ghodhbane: personal site

Astro 5 static site with two pages: the home page (about, services, projects, recent writing, contact) and the writing index (articles, writeups, notes with search and filters).

## Run it locally

```bash
npm install
npm run dev
```

The dev server runs at http://localhost:4321. `npm run build` writes the static site to `dist/`, and `npm run preview` serves that build.

## Add a post

Create a Markdown file in `src/content/posts/`, for example `src/content/posts/my-first-post.md`:

```markdown
---
title: Detection-as-code for Microsoft Sentinel
summary: One or two sentences shown in the list.
type: article          # article, writeup, or note
tags: [Sentinel, KQL]
status: published      # planned posts show in the list without a page
date: 2026-11-15
---

Write the post here in Markdown. Code blocks such as ```kql are highlighted.
```

A post with `status: published` gets its own page at `/writing/<file-name>/`, a date in the list, and a link from the home page. The eight current entries are planned topics marked `status: planned`. Delete or edit them freely.

## Add a project

Create a file in `src/content/projects/` with `title`, `summary`, `status` (`planned` or `published`) and an optional `link` to the repository. Published projects light up on the home page.

## Deploy

The site deploys to GitHub Pages through `.github/workflows/deploy.yml` on every push to `main`. It is set up for a repository named `<username>.github.io` (`site` in `astro.config.mjs`). In the repository, open Settings, then Pages, and choose GitHub Actions as the source.

## Design

The palette, type, and controls live in `src/styles/global.css`. The plankton wake is `src/scripts/wake.js`: particles drift along a current and light up under the visitor's cursor or finger, and it renders a single still frame when the visitor prefers reduced motion.
