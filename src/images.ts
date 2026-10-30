/**
 * Getting a picture ready to cut up: fetch or read it, shrink it to a size
 * the iPad handles comfortably, and turn it into a data URL that can be
 * kept in local storage so the puzzle survives a reload or going offline.
 */

/** Longest side of the stored picture, in pixels. */
export const STORE_SIDES = [1600, 1280, 1024, 800];

export interface LoadedPicture {
  image: HTMLImageElement;
  /** Picture size in puzzle units (the largest stored size). */
  width: number;
  height: number;
  /** Encodes the picture for storage, smaller with each `attempt`. */
  encode: ((attempt: number) => string | null) | null;
}

export function loadImage(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src.slice(0, 80)}`));
    img.src = src;
  });
}

export function fitSize(width: number, height: number, longest: number): { width: number; height: number } {
  const k = Math.min(1, longest / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

function encoder(img: HTMLImageElement): (attempt: number) => string | null {
  return (attempt) => {
    const side = STORE_SIDES[attempt];
    if (!side) return null;
    const { width, height } = fitSize(img.naturalWidth, img.naturalHeight, side);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    try {
      return canvas.toDataURL('image/jpeg', attempt === 0 ? 0.86 : 0.8);
    } catch {
      return null; // The picture's server didn't allow reading its pixels.
    }
  };
}

function ready(img: HTMLImageElement, canStore: boolean): LoadedPicture {
  const size = fitSize(img.naturalWidth, img.naturalHeight, STORE_SIDES[0]);
  return { image: img, ...size, encode: canStore ? encoder(img) : null };
}

/**
 * Load a picture from the web. Prefer a copy whose pixels can be read (so it
 * can be stored); otherwise show it anyway and keep only its address.
 */
export async function loadRemote(urls: string[]): Promise<LoadedPicture> {
  for (const url of urls) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) continue;
      const blobUrl = URL.createObjectURL(await res.blob());
      try {
        return ready(await loadImage(blobUrl), true);
      } finally {
        // The decoded image keeps working after the blob URL is released.
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      }
    } catch {
      // Blocked by CORS or the network; try the next option.
    }
  }
  for (const url of urls) {
    try {
      return ready(await loadImage(url), false);
    } catch {
      // Try the next one.
    }
  }
  throw new Error('Picture unavailable');
}

/** Read a photo chosen from the device's library. */
export async function loadFile(file: File): Promise<LoadedPicture> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    // Re-encode straight away so the original (possibly huge) file can go.
    const encode = encoder(img);
    const small = encode(0);
    if (!small) throw new Error('Could not read photo');
    const stored = await loadImage(small);
    return { image: stored, width: stored.naturalWidth, height: stored.naturalHeight, encode: (n) => (n === 0 ? small : encode(n)) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Load a picture previously kept in storage, or from its web address. */
export async function loadSaved(dataUrl: string | null, urls: string[]): Promise<HTMLImageElement> {
  if (dataUrl) {
    try {
      return await loadImage(dataUrl);
    } catch {
      // Fall back to the web copy.
    }
  }
  return (await loadRemote(urls)).image;
}
