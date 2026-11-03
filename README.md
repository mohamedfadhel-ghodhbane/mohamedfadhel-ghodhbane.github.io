# Mohamed Fadhel Ghodhbane: personal site

Astro 5 static site: the home page (about, services, projects, recent writing, contact), the writing index (articles, writeups, notes with search and filters), one page per published post, an RSS feed at `/rss.xml`, and a custom 404 page.

Shared identity and links (name, email, LinkedIn, GitHub, social image) live in `src/lib/site.ts`.

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
status: published      # planned posts stay hidden; the next three show under "Coming next"
date: 2026-11-15
---

Write the post here in Markdown. Code blocks such as ```kql are highlighted.
```

A post with `status: published` gets its own page at `/writing/<file-name>/`, a date and reading time in the list, a link from the home page, and an entry in the RSS feed. Planned posts (`status: planned`) never get a page; the writing index lists the three with the lowest `order` under "Coming next". Code blocks get a language label and a copy button.

## Add a project

Create a file in `src/content/projects/` with `title`, `summary`, `status` (`planned` or `published`) and an optional `link` to the repository. The Projects section and its menu link stay hidden until at least one project is published.

## Deploy

The site deploys to GitHub Pages through `.github/workflows/deploy.yml` on every push to `main`. It is set up for a repository named `<username>.github.io` (`site` in `astro.config.mjs`). In the repository, open Settings, then Pages, and choose GitHub Actions as the source.

## Search and sharing

Every page carries a canonical link, Open Graph and Twitter tags, and the shared preview image `public/og-default.jpg` (1200 x 630). The home page describes the site owner with schema.org `Person` data, and each article with `BlogPosting` data.

## Design

The palette, type, and controls live in `src/styles/global.css`. The plankton wake is `src/scripts/wake.js`: particles drift along a current and light up under the visitor's cursor or finger, and it renders a single still frame when the visitor prefers reduced motion. On narrow screens it draws at 30 fps with fewer particles to save battery.
