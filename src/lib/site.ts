// Identity and links shared by the pages, the structured data and the feed.
export const NAME = 'Mohamed Fadhel Ghodhbane';
export const JOB_TITLE = 'Cybersecurity engineer';
export const EMAIL = 'mohamedfadhel.ghodhbane@gmail.com';
export const LINKEDIN = 'https://linkedin.com/in/mohamed-fadhel-ghodhbane-5a5655202';
export const GITHUB = 'https://github.com/mohamedfadhel-ghodhbane';

export const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
export const HOME = new URL(BASE, import.meta.env.SITE).href;
export const PERSON_ID = `${HOME}#person`;
export const OG_IMAGE = new URL(`${BASE}og-default.jpg`, import.meta.env.SITE).href;
export const OG_IMAGE_ALT = 'Mohamed Fadhel Ghodhbane, cybersecurity engineer: securing networks, and catching what gets through.';

// words in the markdown source, minus image and link syntax; code counts, since readers read it too
export function wordCount(body = ''): number {
  const text = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|]/g, ' ');
  return text.split(/\s+/).filter((word) => /\w/.test(word)).length;
}

export function readingMinutes(body = ''): number {
  return Math.max(1, Math.round(wordCount(body) / 220));
}
