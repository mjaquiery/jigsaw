/**
 * Talks to the real picture collections. Skipped unless LIVE_SOURCES=1
 * (npm run check-sources), so normal test runs work offline.
 */
import { describe, expect, it } from 'vitest';
import { fromAic, fromCommons, fromMet, type Fetcher } from '../src/sources';

const live = !!process.env.LIVE_SOURCES;
const HEADERS = {
  'User-Agent': 'JigsawSourceCheck/1.0 (https://github.com/mjaquiery/jigsaw)',
  Origin: 'https://mjaquiery.github.io',
};

async function report(res: Response, url: string, label = '') {
  const cors = res.headers.get('access-control-allow-origin');
  console.log(`${label}${res.status} ${res.headers.get('content-type')} cors=${cors} ${url.slice(0, 120)}`);
  if (!res.ok) console.log(`  body: ${(await res.clone().text()).slice(0, 300).replace(/\s+/g, ' ')}`);
}

const fetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: HEADERS });
  await report(res, url);
  return res;
};

async function checkImage(url: string) {
  const res = await fetch(url, { headers: HEADERS });
  await report(res, url, '  image ');
  return res.ok;
}

describe.skipIf(!live)('live picture sources', () => {
  for (const [name, load, theme] of [
    ['Wikimedia Commons', fromCommons, 'garden'],
    ['Art Institute of Chicago', fromAic, 'landscape'],
    ['The Met', fromMet, 'flowers'],
  ] as const) {
    it(`${name} returns usable pictures`, { timeout: 60_000 }, async () => {
      const found = await load(theme, fetcher);
      console.log(`${name}: ${found.length} pictures`);
      for (const p of found.slice(0, 5)) console.log(`  ${p.title} | ${p.artist} | ${p.license}`);
      expect(found.length).toBeGreaterThan(0);
      const thumbOk = await checkImage(found[0].thumb);
      await checkImage(found[0].full);
      // The Art Institute's image server sits behind a bot check that turns
      // away data-centre traffic such as CI, so only warn for it. The app
      // skips suggestions whose pictures won't load.
      if (name === 'Art Institute of Chicago' && !thumbOk) console.warn('  (images blocked from here)');
      else expect(thumbOk).toBe(true);
    });
  }

  it('Met endpoints (diagnostic)', { timeout: 30_000 }, async () => {
    for (const url of [
      'https://collectionapi.metmuseum.org/public/collection/v1/departments',
      'https://collectionapi.metmuseum.org/public/collection/v1.1/search?q=flowers&limit=3',
      'https://collectionapi.metmuseum.org/public/collection/v1/objects/436535',
    ]) {
      const res = await fetch(url, { headers: HEADERS });
      await report(res, url);
      if (res.ok) console.log(`  body: ${(await res.text()).slice(0, 400)}`);
    }
  });
});
