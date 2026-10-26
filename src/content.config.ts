import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    type: z.enum(['article', 'writeup', 'note']),
    tags: z.array(z.string()).default([]),
    status: z.enum(['planned', 'published']).default('planned'),
    date: z.coerce.date().optional(),
    order: z.number().default(100),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    status: z.enum(['planned', 'published']).default('planned'),
    link: z.string().url().optional(),
    order: z.number().default(100),
  }),
});

export const collections = { posts, projects };
