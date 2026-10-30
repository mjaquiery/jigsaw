import { describe, expect, it } from 'vitest';
import {
  aicUrl,
  commonsThumb,
  commonsUrl,
  parseAic,
  parseCommons,
  parseMetObject,
  parseMetSearch,
  SuggestionPool,
  type Fetcher,
} from '../src/sources';

const commonsPage = (title: string, license: string, extra: Record<string, unknown> = {}) => ({
  pageid: title.length,
  title,
  imageinfo: [
    {
      url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${title.slice(5)}`,
      thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${title.slice(5)}/1920px-${title.slice(5)}`,
      width: 4000,
      height: 3000,
      mime: 'image/jpeg',
      descriptionurl: 'https://commons.wikimedia.org/wiki/' + title,
      extmetadata: {
        LicenseShortName: { value: license },
        Artist: { value: '<a href="//x">Jane Smith</a>' },
        ...extra,
      },
    },
  ],
});

describe('Wikimedia Commons', () => {
  it('builds a featured-picture search', () => {
    const url = new URL(commonsUrl('garden'));
    expect(url.searchParams.get('gsrsearch')).toContain('incategory:Featured_pictures_on_Wikimedia_Commons');
    expect(url.searchParams.get('origin')).toBe('*');
    expect(url.searchParams.get('gsrsort')).toBe('random');
    expect(new URL(commonsUrl('steam locomotive')).searchParams.get('gsrsearch')).toMatch(
      /^intitle:steam intitle:locomotive /,
    );
  });

  it('keeps only openly licensed, suitably shaped pictures', () => {
    const tall = commonsPage('File:Tall tower.jpg', 'CC BY-SA 4.0');
    tall.imageinfo[0].height = 9000;
    const found = parseCommons({
      query: {
        pages: [
          commonsPage('File:Rose garden.jpg', 'CC BY-SA 4.0'),
          commonsPage('File:Old mill.jpg', 'Public domain'),
          commonsPage('File:Logo.jpg', 'Fair use'),
          commonsPage('File:Battle scene.jpg', 'CC0'),
          tall,
        ],
      },
    });
    expect(found.map((p) => p.title)).toEqual(['Rose garden', 'Old mill']);
    expect(found[0]).toMatchObject({ source: 'commons', artist: 'Jane Smith', license: 'CC BY-SA 4.0' });
    expect(found[0].thumb).toContain('/500px-Rose garden.jpg');
    expect(found[0].full).toContain('/1920px-');
  });

  it('leaves non-thumbnail URLs alone', () => {
    expect(commonsThumb('https://example.org/a.jpg', 500)).toBe('https://example.org/a.jpg');
  });
});

describe('Art Institute of Chicago', () => {
  it('asks only for public-domain works', () => {
    const url = new URL(aicUrl('garden', 2));
    expect(url.searchParams.get('query[term][is_public_domain]')).toBe('true');
    expect(url.searchParams.get('page')).toBe('2');
  });

  it('builds IIIF image links', () => {
    const found = parseAic({
      config: { iiif_url: 'https://www.artic.edu/iiif/2' },
      data: [
        { id: 1, title: 'Water Lilies', image_id: 'abc', artist_title: 'Claude Monet', date_display: '1906', is_public_domain: true, thumbnail: { width: 400, height: 300 } },
        { id: 2, title: 'No image', image_id: null, is_public_domain: true },
        { id: 3, title: 'Not free', image_id: 'def', is_public_domain: false },
      ],
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      id: 'aic:1',
      title: 'Water Lilies, 1906',
      artist: 'Claude Monet',
      full: 'https://www.artic.edu/iiif/2/abc/full/1686,/0/default.jpg',
    });
  });
});

describe('The Met', () => {
  it('reads object ids from the paged search', () => {
    expect(parseMetSearch({ total: 3, objectIDs: [1, 2, 3] })).toEqual([1, 2, 3]);
    expect(parseMetSearch({ results: [{ objectID: 7 }, { objectID: 8 }] })).toEqual([7, 8]);
    expect(parseMetSearch({ total: 0, objectIDs: null })).toEqual([]);
    expect(parseMetSearch(null)).toEqual([]);
  });

  it('accepts only public-domain objects with images', () => {
    expect(parseMetObject({ objectID: 1, isPublicDomain: false, primaryImageSmall: 'x' })).toBeNull();
    expect(parseMetObject({ objectID: 1, isPublicDomain: true, primaryImageSmall: '' })).toBeNull();
    expect(
      parseMetObject({ objectID: 7, isPublicDomain: true, primaryImageSmall: 'https://images.metmuseum.org/a.jpg', title: 'Wheat Field', artistDisplayName: 'Vincent van Gogh' }),
    ).toMatchObject({ id: 'met:7', title: 'Wheat Field', artist: 'Vincent van Gogh' });
  });
});

describe('SuggestionPool', () => {
  const art = (i: number) => ({ id: i, title: `Art ${i}`, image_id: `img${i}`, is_public_domain: true });
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)));

  it('mixes sources and never repeats a picture', async () => {
    let n = 0;
    const fetcher: Fetcher = (url) => {
      if (url.includes('commons')) return json({ query: { pages: [1, 2, 3, 4].map((i) => commonsPage(`File:Photo ${n}-${i}.jpg`, 'CC0')) } }).finally(() => n++);
      if (url.includes('artic')) return json({ data: [1, 2, 3, 4, 5].map(art) });
      return Promise.reject(new Error('offline'));
    };
    const pool = new SuggestionPool(fetcher);
    const first = await pool.next(3);
    expect(first).toHaveLength(3);
    expect(new Set(first.map((p) => p.source))).toEqual(new Set(['commons', 'aic']));
    const second = await pool.next(3);
    const ids = [...first, ...second].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives up quietly when everything is offline', async () => {
    const pool = new SuggestionPool(() => Promise.reject(new Error('offline')));
    expect(await pool.next(3)).toEqual([]);
  });
});
