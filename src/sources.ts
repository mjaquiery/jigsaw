/**
 * Puzzle picture suggestions from open collections:
 *
 * - Wikimedia Commons "Featured pictures" (photographs; public domain or
 *   Creative Commons, credited to the photographer).
 * - The Art Institute of Chicago and The Metropolitan Museum of Art
 *   (public-domain paintings, released under CC0).
 *
 * Each source is asked about a gentle theme (gardens, harbours, birds...),
 * and the results are mixed together so the three suggestions vary.
 */
import { shuffle, type PictureInfo } from './puzzle';

export type Fetcher = (url: string) => Promise<Response>;

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const AIC_API = 'https://api.artic.edu/api/v1/artworks/search';
const AIC_IIIF = 'https://www.artic.edu/iiif/2';
const MET_API = 'https://collectionapi.metmuseum.org/public/collection/v1';

export const PHOTO_THEMES = [
  'garden',
  'flowers',
  'tulips',
  'roses',
  'lighthouse',
  'harbour',
  'beach',
  'coast',
  'lake',
  'mountains',
  'waterfall',
  'village',
  'castle',
  'bridge',
  'autumn',
  'forest',
  'meadow',
  'birds',
  'butterfly',
  'horses',
  'steam locomotive',
  'sailing boat',
  'sunset',
  'countryside',
];

export const ART_THEMES = [
  'landscape',
  'flowers',
  'garden',
  'still life',
  'seascape',
  'river',
  'village',
  'harbor',
  'birds',
  'horses',
  'winter',
  'boats',
  'orchard',
  'autumn',
  'bridge',
  'cottage',
  'meadow',
  'lake',
];

/** Keep suggestions gentle: skip anything whose title or text mentions these. */
const UNWELCOME =
  /\b(nude|naked|nudity|dead|death|corpse|war|battle|blood|crucifixion|martyr|execution|skull|slaughter|hunt|hunting|massacre|murder|funeral|grave)/i;

/** Pictures need to suit a screen: not too tall or too wide. */
const MIN_ASPECT = 0.6;
const MAX_ASPECT = 2.2;

const OK_LICENSE = /^(public domain|pd\b|pd-|cc0|cc[ -]by)/i;

export function stripHtml(s = ''): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function okShape(width?: number, height?: number): boolean {
  if (!width || !height) return true;
  const aspect = width / height;
  return aspect >= MIN_ASPECT && aspect <= MAX_ASPECT;
}

function welcome(...texts: (string | undefined)[]): boolean {
  return !texts.some((t) => t && UNWELCOME.test(t));
}

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

async function getJson(fetcher: Fetcher, url: string): Promise<unknown> {
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// ---------- Wikimedia Commons ----------

interface CommonsMeta {
  value?: string;
}

interface CommonsPage {
  pageid?: number;
  title: string;
  imageinfo?: {
    url: string;
    thumburl?: string;
    width?: number;
    height?: number;
    mime?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, CommonsMeta | undefined>;
  }[];
}

export function commonsUrl(theme: string, random = true): string {
  const params: Record<string, string> = {
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: '20',
    gsrsearch: `${theme} incategory:Featured_pictures_on_Wikimedia_Commons filetype:bitmap`,
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiextmetadatafilter: 'LicenseShortName|Artist|ObjectName',
    iiurlwidth: '1920',
  };
  if (random) params.gsrsort = 'random';
  else params.gsroffset = String(Math.floor(Math.random() * 40));
  return `${COMMONS_API}?${new URLSearchParams(params)}`;
}

/** Swap the width in a Commons thumbnail URL (…/1920px-Name.jpg). */
export function commonsThumb(url: string, width: number): string {
  return url.includes('/thumb/') ? url.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`) : url;
}

export function parseCommons(data: unknown): PictureInfo[] {
  const pages = ((data as { query?: { pages?: CommonsPage[] } })?.query?.pages ?? []) as CommonsPage[];
  const out: PictureInfo[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const meta = info.extmetadata ?? {};
    const license = stripHtml(meta.LicenseShortName?.value);
    if (!OK_LICENSE.test(license)) continue;
    if (info.mime && !/^image\/(jpeg|png)$/.test(info.mime)) continue;
    if (!okShape(info.width, info.height)) continue;
    const fileName = page.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '');
    const title = stripHtml(meta.ObjectName?.value) || fileName;
    if (!welcome(title, fileName)) continue;
    const full = info.thumburl ?? info.url;
    out.push({
      id: `commons:${page.pageid ?? page.title}`,
      source: 'commons',
      title,
      artist: stripHtml(meta.Artist?.value) || 'Unknown photographer',
      license,
      link: info.descriptionurl,
      thumb: commonsThumb(full, 500),
      full,
      fallback: commonsThumb(full, 1280),
    });
  }
  return out;
}

export async function fromCommons(theme: string, fetcher: Fetcher): Promise<PictureInfo[]> {
  try {
    const found = parseCommons(await getJson(fetcher, commonsUrl(theme, true)));
    if (found.length) return found;
  } catch {
    // Fall through and try without random ordering.
  }
  return parseCommons(await getJson(fetcher, commonsUrl(theme, false)));
}

// ---------- Art Institute of Chicago ----------

interface AicArtwork {
  id: number;
  title?: string;
  image_id?: string | null;
  artist_title?: string | null;
  artist_display?: string | null;
  date_display?: string | null;
  is_public_domain?: boolean;
  thumbnail?: { width?: number; height?: number; alt_text?: string } | null;
}

export function aicUrl(theme: string, page = 1 + Math.floor(Math.random() * 4)): string {
  const params = new URLSearchParams({
    q: `${theme} painting`,
    'query[term][is_public_domain]': 'true',
    fields: 'id,title,image_id,artist_title,artist_display,date_display,is_public_domain,thumbnail',
    limit: '20',
    page: String(page),
  });
  return `${AIC_API}?${params}`;
}

export function parseAic(data: unknown): PictureInfo[] {
  const json = data as { data?: AicArtwork[]; config?: { iiif_url?: string } };
  const iiif = json?.config?.iiif_url ?? AIC_IIIF;
  const out: PictureInfo[] = [];
  for (const art of json?.data ?? []) {
    if (!art.image_id || art.is_public_domain === false) continue;
    if (!okShape(art.thumbnail?.width, art.thumbnail?.height)) continue;
    const title = art.title?.trim() || 'Untitled';
    if (!welcome(title, art.thumbnail?.alt_text)) continue;
    const artist = art.artist_title?.trim() || art.artist_display?.split('\n')[0]?.trim() || 'Unknown artist';
    out.push({
      id: `aic:${art.id}`,
      source: 'aic',
      title: art.date_display ? `${title}, ${art.date_display}` : title,
      artist,
      license: 'Public domain (CC0)',
      link: `https://www.artic.edu/artworks/${art.id}`,
      thumb: `${iiif}/${art.image_id}/full/400,/0/default.jpg`,
      full: `${iiif}/${art.image_id}/full/1686,/0/default.jpg`,
      fallback: `${iiif}/${art.image_id}/full/843,/0/default.jpg`,
    });
  }
  return out;
}

export async function fromAic(theme: string, fetcher: Fetcher): Promise<PictureInfo[]> {
  return parseAic(await getJson(fetcher, aicUrl(theme)));
}

// ---------- The Met ----------

/** European Paintings, Asian Art and The American Wing. */
const MET_DEPARTMENTS = [11, 6, 1];

interface MetObject {
  objectID: number;
  isPublicDomain?: boolean;
  primaryImage?: string;
  primaryImageSmall?: string;
  title?: string;
  artistDisplayName?: string;
  objectDate?: string;
  objectURL?: string;
  classification?: string;
}

export function metSearchUrl(theme: string, department = pick(MET_DEPARTMENTS)): string {
  const params = new URLSearchParams({ hasImages: 'true', departmentId: String(department), q: theme });
  return `${MET_API}/search?${params}`;
}

export function parseMetObject(obj: unknown): PictureInfo | null {
  const o = obj as MetObject;
  if (!o?.objectID || !o.isPublicDomain || !o.primaryImageSmall) return null;
  const title = o.title?.trim() || 'Untitled';
  if (!welcome(title)) return null;
  return {
    id: `met:${o.objectID}`,
    source: 'met',
    title: o.objectDate ? `${title}, ${o.objectDate}` : title,
    artist: o.artistDisplayName?.trim() || 'Unknown artist',
    license: 'Public domain (CC0)',
    link: o.objectURL,
    thumb: o.primaryImageSmall,
    // The full-size originals can be tens of megabytes, so use the web copy.
    full: o.primaryImageSmall,
  };
}

export async function fromMet(theme: string, fetcher: Fetcher, tries = 8): Promise<PictureInfo[]> {
  const found = (await getJson(fetcher, metSearchUrl(theme))) as { objectIDs?: number[] | null };
  const ids = (found?.objectIDs ?? []).slice(0, 300);
  const chosen = new Set<number>();
  while (chosen.size < Math.min(tries, ids.length)) chosen.add(pick(ids));
  const objects = await Promise.all(
    [...chosen].map((id) => getJson(fetcher, `${MET_API}/objects/${id}`).catch(() => null)),
  );
  return objects.map(parseMetObject).filter((p): p is PictureInfo => !!p);
}

// ---------- Mixing ----------

export type SourceName = 'commons' | 'aic' | 'met';

export const SOURCES: Record<SourceName, { label: string; themes: string[]; load: typeof fromCommons }> = {
  commons: { label: 'Wikimedia Commons', themes: PHOTO_THEMES, load: fromCommons },
  aic: { label: 'Art Institute of Chicago', themes: ART_THEMES, load: fromAic },
  met: { label: 'The Met', themes: ART_THEMES, load: fromMet },
};

export function sourceLabel(source: PictureInfo['source']): string {
  return source === 'upload' ? 'Your photo' : SOURCES[source].label;
}

/**
 * A pool of suggestions, topped up in the background so "new pictures"
 * is quick. Suggestions are taken from different sources in turn and
 * never repeat within a session.
 */
export class SuggestionPool {
  private readonly queues: Record<SourceName, PictureInfo[]> = { commons: [], aic: [], met: [] };
  private readonly seen = new Set<string>();
  private readonly failures: Record<SourceName, number> = { commons: 0, aic: 0, met: 0 };
  private readonly pending = new Map<SourceName, Promise<void>>();
  private turn = Math.floor(Math.random() * 3);

  constructor(
    private readonly fetcher: Fetcher = (url) => fetch(url),
    seen: string[] = [],
  ) {
    seen.forEach((id) => this.seen.add(id));
  }

  private names(): SourceName[] {
    return Object.keys(this.queues) as SourceName[];
  }

  private refill(name: SourceName): Promise<void> {
    const existing = this.pending.get(name);
    if (existing) return existing;
    const source = SOURCES[name];
    const job = source
      .load(pick(source.themes), this.fetcher)
      .then((found) => {
        const fresh = found.filter((p) => !this.seen.has(p.id) && !this.queues[name].some((q) => q.id === p.id));
        this.queues[name].push(...shuffle(fresh).slice(0, 6));
        this.failures[name] = fresh.length ? 0 : this.failures[name] + 1;
      })
      .catch(() => {
        this.failures[name] += 1;
      })
      .finally(() => this.pending.delete(name));
    this.pending.set(name, job);
    return job;
  }

  /** Top up any source that is running low, without waiting. */
  warm(): void {
    for (const name of this.names()) {
      if (this.queues[name].length < 3 && this.failures[name] < 3) void this.refill(name);
    }
  }

  /** Get `count` new suggestions, mixing sources where possible. */
  async next(count = 3): Promise<PictureInfo[]> {
    const out: PictureInfo[] = [];
    for (let round = 0; round < 4 && out.length < count; round++) {
      const live = this.names().filter((n) => this.failures[n] < 3);
      if (!live.length) break;
      const needed = live.filter((n) => this.queues[n].length === 0);
      if (needed.length === live.length || round > 0) await Promise.all(needed.map((n) => this.refill(n)));
      else needed.forEach((n) => void this.refill(n));
      let progress = true;
      while (out.length < count && progress) {
        progress = false;
        for (let i = 0; i < live.length && out.length < count; i++) {
          const name = live[(this.turn + i) % live.length];
          const p = this.queues[name].shift();
          if (p && !this.seen.has(p.id)) {
            this.seen.add(p.id);
            out.push(p);
            progress = true;
          }
        }
      }
      this.turn += 1;
    }
    this.warm();
    return out;
  }
}
