import { isPuzzleState, type PictureInfo, type PuzzleState } from './puzzle';

/**
 * Everything is kept in local storage. Keys include the page's path, because
 * every GitHub Pages site for an account shares one origin, and the preview
 * build under /stage/ must not disturb the real puzzle.
 */
const PREFIX = 'jigsaw:';

export interface Settings {
  muted: boolean;
  guide: boolean;
  edgesOnly: boolean;
  count: number;
}

export interface SavedData {
  version: 1;
  settings: Settings;
  /** The puzzle in progress, if any. Its picture is stored separately. */
  current: PuzzleState | null;
  /** The last suggestions shown, so the menu has pictures straight away. */
  suggestions: PictureInfo[];
  /** Ids of pictures already suggested, so they don't come round again soon. */
  seen: string[];
}

const MAX_SEEN = 400;

export function emptyData(): SavedData {
  return {
    version: 1,
    settings: { muted: false, guide: true, edgesOnly: false, count: 25 },
    current: null,
    suggestions: [],
    seen: [],
  };
}

function cleanData(value: unknown): SavedData | null {
  const v = value as SavedData;
  if (!v || v.version !== 1 || typeof v.settings !== 'object') return null;
  const base = emptyData();
  return {
    version: 1,
    settings: { ...base.settings, ...v.settings },
    current: isPuzzleState(v.current) ? v.current : null,
    suggestions: Array.isArray(v.suggestions) ? v.suggestions : [],
    seen: Array.isArray(v.seen) ? v.seen : [],
  };
}

export function scopeKey(path: string): string {
  // Ignore the file name so / and /index.html share a puzzle.
  return PREFIX + path.replace(/[^/]*$/, '');
}

export class Store {
  data: SavedData;
  private readonly key: string;

  constructor(
    private readonly storage: Storage | null = safeLocalStorage(),
    path: string = typeof location === 'undefined' ? '/' : location.pathname,
  ) {
    this.key = scopeKey(path);
    this.data = this.load();
  }

  private get imageKey(): string {
    return `${this.key}:image`;
  }

  private load(): SavedData {
    try {
      const raw = this.storage?.getItem(this.key);
      if (raw) {
        const parsed = cleanData(JSON.parse(raw));
        if (parsed) return parsed;
      }
    } catch {
      // Unreadable or blocked storage: start fresh.
    }
    return emptyData();
  }

  save(): boolean {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.data));
      return true;
    } catch {
      // Storage full or unavailable; the puzzle still works without it.
      return false;
    }
  }

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.data.settings[key] = value;
    this.save();
  }

  setCurrent(puzzle: PuzzleState | null): void {
    this.data.current = puzzle;
    if (!puzzle) this.removeImage();
    this.save();
  }

  setSuggestions(pictures: PictureInfo[]): void {
    this.data.suggestions = pictures;
    this.data.seen = [...this.data.seen, ...pictures.map((p) => p.id)].slice(-MAX_SEEN);
    this.save();
  }

  /**
   * Keep the puzzle's picture. `encode` gives the picture at decreasing
   * sizes; the largest one that fits in storage is kept.
   */
  saveImage(encode: ((attempt: number) => string | null) | null): boolean {
    this.removeImage();
    if (!encode || !this.storage) return false;
    for (let attempt = 0; ; attempt++) {
      const data = encode(attempt);
      if (!data) return false;
      try {
        this.storage.setItem(this.imageKey, data);
        return true;
      } catch {
        // Too big: try a smaller copy.
      }
    }
  }

  loadImage(): string | null {
    try {
      return this.storage?.getItem(this.imageKey) ?? null;
    } catch {
      return null;
    }
  }

  removeImage(): void {
    try {
      this.storage?.removeItem(this.imageKey);
    } catch {
      // Nothing to do.
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
