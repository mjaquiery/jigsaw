/**
 * Talks to the real picture collections. Skipped unless LIVE_SOURCES=1
 * (npm run check-sources), so normal test runs work offline.
 */
import { describe, expect, it } from 'vitest';
import { fromAic, fromCommons, fromMet, type Fetcher } from '../src/sources';

const live = !!process.env.LIVE_SOURCES;
const UA = 'JigsawSourceCheck/1.0 (https://github.com/mjaquiery/jigsaw)';
const fetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Origin: 'https://mjaquiery.github.io' } });
  const cors = res.headers.get('access-control-allow-origin');
  console.log(`${res.status} cors=${cors} ${url.slice(0, 120)}`);
  return res;
};

async function checkImage(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Origin: 'https://mjaquiery.github.io' } });
  const cors = res.headers.get('access-control-allow-origin');
  console.log(`  image ${res.status} ${res.headers.get('content-type')} cors=${cors} ${url.slice(0, 110)}`);
  return { ok: res.ok, cors };
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
      for (const p of found.slice(0, 3)) console.log(`  ${p.title} | ${p.artist} | ${p.license}`);
      expect(found.length).toBeGreaterThan(0);
      const thumb = await checkImage(found[0].thumb);
      const full = await checkImage(found[0].full);
      expect(thumb.ok).toBe(true);
      if (!full.ok && found[0].fallback) expect((await checkImage(found[0].fallback)).ok).toBe(true);
    });
  }
});
