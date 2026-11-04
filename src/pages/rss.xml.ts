import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { BASE, NAME } from '../lib/site';

// Feed of published writing, newest first, for feed readers.
export async function GET(context: APIContext) {
  const posts = (await getCollection('posts', (p) => p.data.status === 'published'))
    .sort((a, b) => (b.data.date?.getTime() ?? 0) - (a.data.date?.getTime() ?? 0) || a.data.order - b.data.order);

  return rss({
    title: `${NAME}: articles`,
    description: 'Articles on detection engineering and Microsoft security, incident writeups, and short notes.',
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.summary,
      pubDate: post.data.date,
      link: `${BASE}writing/${post.id}/`,
      categories: post.data.tags,
    })),
    customData: '<language>en</language>',
  });
}
