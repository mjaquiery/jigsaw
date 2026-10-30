import { describe, expect, it } from 'vitest';
import { createPuzzle } from '../src/puzzle';
import { scopeKey, Store } from '../src/storage';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  constructor(private readonly limit = Infinity) {}
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    if (v.length > this.limit) throw new DOMException('full', 'QuotaExceededError');
    this.map.set(k, v);
  }
}

const pic = { id: 'p', source: 'aic' as const, title: 'P', artist: 'A', license: 'CC0', thumb: 't', full: 'f' };

describe('Store', () => {
  it('keeps separate puzzles for the live site and the preview', () => {
    expect(scopeKey('/jigsaw/')).toBe('jigsaw:/jigsaw/');
    expect(scopeKey('/jigsaw/index.html')).toBe('jigsaw:/jigsaw/');
    expect(scopeKey('/jigsaw/stage/')).toBe('jigsaw:/jigsaw/stage/');
  });

  it('remembers the puzzle and settings across reloads', () => {
    const storage = new MemoryStorage();
    const a = new Store(storage, '/jigsaw/');
    a.setCurrent(createPuzzle(25, 800, 600, pic, 1, 0));
    a.setSetting('guide', false);
    const b = new Store(storage, '/jigsaw/');
    expect(b.data.current?.pieces).toHaveLength(a.data.current!.pieces.length);
    expect(b.data.settings.guide).toBe(false);
    expect(new Store(storage, '/jigsaw/stage/').data.current).toBeNull();
  });

  it('stores the largest picture that fits', () => {
    const store = new Store(new MemoryStorage(50), '/');
    const sizes = ['x'.repeat(100), 'x'.repeat(60), 'x'.repeat(40)];
    expect(store.saveImage((i) => sizes[i] ?? null)).toBe(true);
    expect(store.loadImage()).toHaveLength(40);
    expect(store.saveImage((i) => (i < 2 ? sizes[i] : null))).toBe(false);
  });

  it('ignores damaged saved data', () => {
    const storage = new MemoryStorage();
    storage.setItem('jigsaw:/', '{"version":1,"settings":{},"current":{"version":1}}');
    const store = new Store(storage, '/');
    expect(store.data.current).toBeNull();
    expect(store.data.settings.count).toBe(25);
    storage.setItem('jigsaw:/', 'not json');
    expect(new Store(storage, '/').data.current).toBeNull();
  });

  it('drops the stored picture when the puzzle is finished', () => {
    const store = new Store(new MemoryStorage(), '/');
    store.saveImage(() => 'data:image/jpeg;base64,xx');
    store.setCurrent(null);
    expect(store.loadImage()).toBeNull();
  });
});
