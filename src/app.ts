import { creditLine, GameView } from './board';
import { h, onTap, wait } from './dom';
import { ICONS } from './icons';
import { loadFile, loadImage, loadRemote, loadSaved, type LoadedPicture } from './images';
import {
  clampCount,
  createPuzzle,
  gridFor,
  makeCuts,
  MAX_PIECES,
  MIN_PIECES,
  placedCount,
  PRESET_COUNTS,
  tracePiece,
  type PictureInfo,
  type PuzzleState,
} from './puzzle';
import { sourceLabel, SuggestionPool } from './sources';
import { Sound } from './sound';
import { Store } from './storage';

export class App {
  private readonly store = new Store();
  private readonly sound = new Sound(this.store.data.settings.muted);
  private readonly pool = new SuggestionPool(undefined, this.store.data.seen);
  private screen: HTMLElement | null = null;
  private game: GameView | null = null;
  /** Thumbnail of the puzzle in progress, for the "carry on" card. */
  private currentImage: HTMLImageElement | null = null;

  constructor(private readonly root: HTMLElement) {
    // Audio can only start from a user gesture; on iOS a touch only counts once it ends.
    for (const type of ['pointerdown', 'pointerup', 'touchend']) {
      window.addEventListener(type, () => this.sound.unlock(), { capture: true });
    }
    const relayout = () => this.game?.layout();
    window.addEventListener('resize', relayout);
    // iPad Safari sometimes reports the old size straight after rotating.
    window.addEventListener('orientationchange', () => setTimeout(relayout, 350));
  }

  start(): void {
    const current = this.store.data.current;
    if (current) void this.resume(current);
    else this.showHome();
    this.pool.warm();
  }

  private show(el: HTMLElement): void {
    const old = this.screen;
    this.screen = el;
    el.classList.add('screen', 'entering');
    this.root.append(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('entering')));
    if (old) {
      old.classList.add('leaving');
      setTimeout(() => old.remove(), 400);
    }
  }

  private button(cls: string, label: string, icon: string | null, fn: () => void): HTMLButtonElement {
    const btn = h('button', { class: cls });
    btn.innerHTML = `${icon ?? ''}<span>${escapeHtml(label)}</span>`;
    onTap(btn, () => {
      this.sound.tap();
      fn();
    });
    return btn;
  }

  private showLoading(message: string): void {
    const el = h('div', { class: 'page loading' }, h('div', { class: 'spinner' }), h('p', {}, message));
    this.show(el);
  }

  // ---------- home ----------

  private showHome(notice?: string): void {
    this.game?.destroy();
    this.game = null;
    const el = h('div', { class: 'page home' });
    const body = h('div', { class: 'page-body' });
    el.append(h('header', { class: 'page-head' }, h('h1', {}, 'Jigsaw')), body);

    if (notice) body.append(h('p', { class: 'notice' }, notice));

    const current = this.store.data.current;
    if (current) body.append(this.carryOnCard(current));

    body.append(h('h2', {}, current ? 'Or start a new picture' : 'Choose a picture'));
    const grid = h('div', { class: 'suggestions' });
    body.append(grid);

    const status = h('p', { class: 'status', 'aria-live': 'polite' });
    const refresh = this.button('pill', 'Show me different pictures', ICONS.refresh, () => void fill(true));
    const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'file-input', 'aria-label': 'Choose a photo' });
    const upload = this.button('pill', 'Use one of my photos', ICONS.photo, () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (file) void this.pickFile(file);
    });
    body.append(status, h('div', { class: 'home-actions' }, refresh, upload, fileInput));

    const fill = async (fresh: boolean) => {
      let pictures = fresh ? [] : this.store.data.suggestions;
      if (pictures.length < 3) {
        refresh.disabled = true;
        grid.replaceChildren(...[0, 1, 2].map(() => h('div', { class: 'suggestion placeholder' })));
        status.textContent = 'Finding pictures…';
        pictures = await this.freshSuggestions(3);
        refresh.disabled = false;
        if (!this.screen?.contains(grid)) return;
        if (pictures.length) this.store.setSuggestions(pictures);
      }
      status.textContent = pictures.length
        ? ''
        : navigator.onLine === false
          ? 'The iPad is offline, so new pictures can’t be fetched. You can still use one of your photos.'
          : 'Couldn’t fetch pictures just now. Try again in a moment, or use one of your photos.';
      grid.replaceChildren(...pictures.map((p) => this.suggestionCard(p)));
    };
    void fill(false);
    this.show(el);
  }

  /** New suggestions whose thumbnails are known to load. */
  private async freshSuggestions(count: number): Promise<PictureInfo[]> {
    const out: PictureInfo[] = [];
    for (let round = 0; round < 4 && out.length < count; round++) {
      const batch = await this.pool.next(count - out.length);
      if (!batch.length) break;
      const checked = await Promise.all(
        batch.map((p) =>
          Promise.race([loadImage(p.thumb).then(() => true), wait(10_000).then(() => false)]).catch(() => false),
        ),
      );
      batch.forEach((p, i) => (checked[i] ? out.push(p) : this.pool.reportBroken(p)));
    }
    return out;
  }

  private carryOnCard(current: PuzzleState): HTMLElement {
    const card = h('button', { class: 'carry-on', 'aria-label': 'Carry on with your puzzle' });
    const thumb = h('span', { class: 'carry-thumb' });
    const src = this.currentImage?.src ?? this.store.loadImage() ?? current.picture.thumb;
    thumb.append(h('img', { src, alt: '' }));
    card.append(
      thumb,
      h(
        'span',
        { class: 'carry-text' },
        h('strong', {}, 'Carry on with your puzzle'),
        h('span', {}, `${placedCount(current)} of ${current.pieces.length} pieces in place`),
      ),
      h('span', { class: 'carry-go' }),
    );
    card.querySelector('.carry-go')!.innerHTML = ICONS.play;
    onTap(card, () => {
      this.sound.tap();
      void this.resume(current);
    });
    return card;
  }

  private suggestionCard(pic: PictureInfo): HTMLElement {
    const card = h('button', { class: 'suggestion', 'aria-label': pic.title });
    const img = h('img', { src: pic.thumb, alt: '', loading: 'eager', draggable: 'false' });
    img.addEventListener('error', () => card.classList.add('broken'));
    card.append(
      h('span', { class: 'suggestion-pic' }, img),
      h('span', { class: 'suggestion-title' }, pic.title),
      h('span', { class: 'suggestion-credit' }, `${pic.artist} · ${sourceLabel(pic.source)}`),
    );
    onTap(card, () => {
      this.sound.tap();
      void this.pickPicture(pic);
    });
    return card;
  }

  private async pickPicture(pic: PictureInfo): Promise<void> {
    this.showLoading('Getting the picture ready…');
    try {
      const urls = [pic.full, pic.fallback, pic.thumb].filter((u): u is string => !!u);
      this.showCount(pic, await loadRemote(urls));
    } catch {
      this.showHome('Sorry, that picture wouldn’t load. Please choose another.');
    }
  }

  private async pickFile(file: File): Promise<void> {
    this.showLoading('Getting your photo ready…');
    try {
      const loaded = await loadFile(file);
      const pic: PictureInfo = {
        id: `upload:${Date.now()}`,
        source: 'upload',
        title: 'Your photo',
        artist: '',
        license: '',
        thumb: '',
        full: '',
      };
      this.showCount(pic, loaded);
    } catch {
      this.showHome('Sorry, that photo couldn’t be opened. Please try another.');
    }
  }

  // ---------- piece count ----------

  private showCount(pic: PictureInfo, loaded: LoadedPicture): void {
    const el = h('div', { class: 'page count' });
    const back = this.button('pill back', 'Back', ICONS.back, () => this.showHome());
    el.append(h('header', { class: 'page-head' }, back, h('h1', {}, 'How many pieces?')));

    const preview = h('div', { class: 'preview' });
    const img = h('img', { src: loaded.image.src, alt: pic.title, draggable: 'false' });
    const lines = h('canvas', { class: 'cut-lines' });
    preview.append(img, lines);
    const credit = h('p', { class: 'credit' });
    credit.append(h('strong', {}, pic.title), document.createTextNode(pic.source === 'upload' ? '' : ` — ${creditLine(pic)}`));

    let count = clampCount(this.store.data.settings.count);
    const presets = h('div', { class: 'presets' });
    const presetBtns = PRESET_COUNTS.map((n) => {
      const b = this.button('preset', String(n), null, () => {
        stepper.hidden = true;
        choose(n);
      });
      b.setAttribute('aria-label', `${n} pieces`);
      presets.append(b);
      return b;
    });
    const other = this.button('preset other', 'Other', null, () => {
      stepper.hidden = false;
      choose(count);
      input.focus();
    });
    presets.append(other);

    const input = h('input', {
      type: 'number',
      inputmode: 'numeric',
      pattern: '[0-9]*',
      min: MIN_PIECES,
      max: MAX_PIECES,
      class: 'count-input',
      'aria-label': 'Number of pieces',
    });
    const minus = this.button('round', '', ICONS.minus, () => choose(count - 5));
    minus.setAttribute('aria-label', 'Fewer pieces');
    const plus = this.button('round', '', ICONS.plus, () => choose(count + 5));
    plus.setAttribute('aria-label', 'More pieces');
    const stepper = h('div', { class: 'stepper' }, minus, input, plus);
    stepper.hidden = (PRESET_COUNTS as readonly number[]).includes(count);
    input.addEventListener('input', () => {
      const n = Number(input.value);
      if (n >= MIN_PIECES && n <= MAX_PIECES) choose(n, false);
    });
    input.addEventListener('change', () => choose(Number(input.value)));

    const summary = h('p', { class: 'summary', 'aria-live': 'polite' });
    const startBtn = this.button('big-btn primary', 'Start the puzzle', ICONS.play, () => begin());
    const controls = h('div', { class: 'count-controls' }, presets, stepper, summary, startBtn);
    el.append(h('div', { class: 'count-body' }, h('div', { class: 'preview-wrap' }, preview, credit), controls));

    const aspect = loaded.width / loaded.height;
    const seed = Math.floor(Math.random() * 2 ** 31);
    const choose = (n: number, updateInput = true) => {
      count = clampCount(n);
      const { cols, rows } = gridFor(count, aspect);
      for (const [i, b] of presetBtns.entries()) b.setAttribute('aria-pressed', String(PRESET_COUNTS[i] === count && stepper.hidden));
      other.setAttribute('aria-pressed', String(!stepper.hidden));
      if (updateInput) input.value = String(count);
      summary.textContent = `${cols * rows} pieces, ${cols} across and ${rows} down`;
      drawCutLines(lines, cols, rows, seed, aspect);
    };

    const begin = () => {
      if (this.store.data.current) {
        this.confirm('Start this new puzzle?', 'The puzzle you were doing will be put away.', 'Yes, start new', () =>
          launch(),
        );
      } else launch();
    };
    const launch = () => {
      this.store.setSetting('count', count);
      const puzzle = createPuzzle(count, loaded.width, loaded.height, pic, seed);
      if (pic.source === 'upload' && !this.store.saveImage(loaded.encode)) {
        // Can't keep the photo, so the puzzle can't come back after a reload.
        this.store.setCurrent(null);
      } else {
        if (pic.source !== 'upload') this.store.saveImage(loaded.encode);
        this.store.setCurrent(puzzle);
      }
      this.startGame(puzzle, loaded.image);
    };

    this.show(el);
    requestAnimationFrame(() => choose(count));
    new ResizeObserver(() => choose(count, false)).observe(preview);
  }

  private confirm(title: string, text: string, yes: string, fn: () => void): void {
    const overlay = h('div', { class: 'overlay confirm', role: 'dialog', 'aria-label': title });
    const card = h('div', { class: 'win-card' });
    const close = () => overlay.remove();
    const ok = this.button('big-btn primary', yes, null, () => {
      close();
      fn();
    });
    const no = this.button('big-btn', 'No, go back', null, close);
    card.append(h('h2', {}, title), h('p', {}, text), h('div', { class: 'win-buttons' }, ok, no));
    overlay.append(card);
    this.screen?.append(overlay);
  }

  // ---------- playing ----------

  private async resume(current: PuzzleState): Promise<void> {
    this.showLoading('Getting your puzzle out…');
    try {
      const pic = current.picture;
      const urls = [pic.full, pic.fallback].filter((u): u is string => !!u);
      const image = await loadSaved(this.store.loadImage(), urls);
      this.startGame(current, image);
    } catch {
      this.showHome('Your puzzle’s picture couldn’t be loaded. Check the internet connection and try again.');
    }
  }

  private startGame(puzzle: PuzzleState, image: HTMLImageElement): void {
    this.currentImage = image;
    const view = new GameView(puzzle, image, this.store, this.sound, { home: () => this.showHome() });
    this.game?.destroy();
    this.game = view;
    this.show(view.el);
    requestAnimationFrame(() => view.layout());
  }
}

function drawCutLines(canvas: HTMLCanvasElement, cols: number, rows: number, seed: number, aspect: number): void {
  const w = canvas.clientWidth;
  const hgt = canvas.clientHeight || w / aspect;
  if (!w) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(hgt * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cuts = makeCuts(cols, rows, seed);
  const path = new Path2D();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tracePiece(path, cuts, cols, rows, w / cols, hgt / rows, col, row);
    }
  }
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 3;
  ctx.stroke(path);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke(path);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
