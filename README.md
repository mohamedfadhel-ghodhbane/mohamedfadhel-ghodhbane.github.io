# Mohamed Fadhel Ghodhbane: personal site

Astro 5 static site: the home page (about, services, projects, recent writing, contact), the articles index (articles, writeups, notes with search and filters, at `/writing/`), one page per published post, an RSS feed at `/rss.xml`, and a custom 404 page.

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

A post with `status: published` gets its own page at `/writing/<file-name>/`, a date and reading time in the list, a link from the home page, and an entry in the RSS feed. Planned posts (`status: planned`) never get a page; the writing index lists the three with the lowest `order` under "Coming next". Code blocks get a language label and a copy button. Posts with three or more sections get a table of contents, and every post ends with a short author note and links to the previous and next post. Tags link to the articles page filtered by that topic (`/writing/?topic=kql`). The `article` type is labelled "Guide" on the site.

## Add a project

Create a file in `src/content/projects/` with `title`, `summary`, `status` (`planned` or `published`) and an optional `link` to the repository. The Projects section and its menu link stay hidden until at least one project is published.

## Deploy

The site deploys to GitHub Pages through `.github/workflows/deploy.yml` on every push to `main`. It is set up for a repository named `<username>.github.io` (`site` in `astro.config.mjs`). In the repository, open Settings, then Pages, and choose GitHub Actions as the source.

## Search and sharing

Every page carries a canonical link and Open Graph and Twitter tags. Each published post gets its own 1200 x 630 title card in `public/og/<post>.jpg`, made by `python tools/og-images.py` (run it after adding or retitling a post; it needs Pillow and Chrome). Pages without a card use `public/og-default.jpg`. The home page describes the site owner with schema.org `Person` data, and each article with `BlogPosting` data.

## Visitor stats

The layout loads GoatCounter (`src/layouts/Base.astro`), which counts visits without cookies or personal data. The dashboard is at https://portfoliomohamed.goatcounter.com. Visits from localhost are not counted; to stop counting your own browser on the live site, open the site once with `#toggle-goatcounter` at the end of the address.

## Design

The look is "Paper": a warm off-white background, ink text, hairline rules and one emerald accent, with Newsreader serif headings and Albert Sans body text. The palette, type and controls live in `src/styles/global.css`, and article code blocks use Shiki's `github-light-default` theme (`astro.config.mjs`). The home page hero has a strip-chart recorder, `src/scripts/trace.js`: an ink pen plots the visitor's movement as the paper scrolls, and peaks that cross the dashed threshold are ringed and marked "detected". It takes its colours from the CSS tokens, pauses off screen, draws at 30 fps on narrow screens, and shows a single still frame when the visitor prefers reduced motion.
