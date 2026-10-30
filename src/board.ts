import { h, onTap, reducedMotion } from './dom';
import { ICONS } from './icons';
import {
  bringToFront,
  groupOf,
  isComplete,
  isEdgePiece,
  makeCuts,
  moveGroup,
  pieceSize,
  placedCount,
  PLACED,
  returnToTray,
  snap,
  tabMargin,
  takeFromTray,
  tracePiece,
  type PieceState,
  type PuzzleState,
} from './puzzle';
import { sourceLabel } from './sources';
import type { Sound } from './sound';
import type { Store } from './storage';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Point {
  x: number;
  y: number;
}

export interface BoardActions {
  /** Back to the picture menu. */
  home: () => void;
}

const inside = (r: Rect, p: Point) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Share of the table the board fills, leaving a border to lay pieces on. */
const BOARD_FILL = 0.84;
/** Tray cells are a little smaller than a piece; tabs may overlap. */
const CELL_SHARE = 0.8;
/** Smallest scale for pieces in the tray, compared with on the table. */
const TRAY_SHRINK = 0.7;

export class GameView {
  readonly el: HTMLElement;
  private readonly play: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly guide: HTMLImageElement;
  private readonly layer: HTMLElement;
  private readonly tray: HTMLElement;
  private readonly trayGrid: HTMLElement;
  private readonly trayInfo: HTMLElement;
  private readonly trayPrev: HTMLButtonElement;
  private readonly trayNext: HTMLButtonElement;
  private readonly progress: HTMLElement;
  private readonly guideBtn: HTMLButtonElement;
  private readonly edgesBtn: HTMLButtonElement;

  private readonly pw: number;
  private readonly ph: number;
  private readonly margin: number;
  private readonly paths: Path2D[] = [];
  private readonly canvases: HTMLCanvasElement[] = [];
  private readonly hitCtx = document.createElement('canvas').getContext('2d')!;

  private scale = 1;
  private renderedScale = 0;
  private board: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private tableRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private trayRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private landscape = true;
  private trayPage = 0;
  private perPage = 1;
  private cell = 0;
  private trayScale = 1;
  private drag: { pointerId: number; group: number; last: Point; frame: number } | null = null;
  private alive = true;
  private done = false;

  constructor(
    private readonly state: PuzzleState,
    private readonly image: HTMLImageElement,
    private readonly store: Store,
    private readonly sound: Sound,
    private readonly actions: BoardActions,
  ) {
    const size = pieceSize(state);
    this.pw = size.w;
    this.ph = size.h;
    this.margin = tabMargin(state);

    const cuts = makeCuts(state.cols, state.rows, state.seed);
    for (const p of state.pieces) {
      const path = new Path2D();
      tracePiece(path, cuts, state.cols, state.rows, this.pw, this.ph, p.col, p.row);
      this.paths.push(path);
      const canvas = h('canvas', { class: 'piece', 'data-id': p.id });
      this.canvases.push(canvas);
    }

    this.el = h('div', { class: 'game' });
    const settings = store.data.settings;

    const bar = h('div', { class: 'toolbar' });
    const homeBtn = this.toolButton(ICONS.home, 'Pictures', () => this.actions.home());
    const bigBtn = this.toolButton(ICONS.picture, 'Big picture', () => this.showBigPicture());
    this.guideBtn = this.toolButton(ICONS.guide, 'Faint picture', () => {
      this.store.setSetting('guide', !this.store.data.settings.guide);
      this.paintToggles();
    });
    this.edgesBtn = this.toolButton(ICONS.edges, 'Edge pieces', () => {
      this.store.setSetting('edgesOnly', !this.store.data.settings.edgesOnly);
      this.trayPage = 0;
      this.paintToggles();
      this.renderTray();
    });
    const muteBtn = this.toolButton(settings.muted ? ICONS.soundOff : ICONS.soundOn, 'Sound', () => {
      this.sound.muted = !this.sound.muted;
      this.store.setSetting('muted', this.sound.muted);
      muteBtn.querySelector('.tool-icon')!.innerHTML = this.sound.muted ? ICONS.soundOff : ICONS.soundOn;
      muteBtn.setAttribute('aria-pressed', String(!this.sound.muted));
    });
    muteBtn.setAttribute('aria-pressed', String(!settings.muted));
    this.progress = h('div', { class: 'progress', 'aria-live': 'polite' });
    bar.append(homeBtn, this.progress, h('div', { class: 'toolbar-spacer' }), bigBtn, this.guideBtn, this.edgesBtn, muteBtn);

    this.play = h('div', { class: 'play' });
    this.frame = h('div', { class: 'frame' });
    this.guide = h('img', { class: 'guide', alt: '', src: image.src, draggable: 'false' });
    this.frame.append(this.guide);
    this.layer = h('div', { class: 'layer' });

    this.tray = h('div', { class: 'tray' });
    this.trayPrev = h('button', { class: 'tray-arrow prev', 'aria-label': 'Previous pieces' });
    this.trayNext = h('button', { class: 'tray-arrow next', 'aria-label': 'More pieces' });
    onTap(this.trayPrev, () => this.turnPage(-1));
    onTap(this.trayNext, () => this.turnPage(1));
    this.trayInfo = h('div', { class: 'tray-info' });
    this.trayGrid = h('div', { class: 'tray-grid' });
    this.tray.append(this.trayPrev, h('div', { class: 'tray-body' }, this.trayInfo, this.trayGrid), this.trayNext);

    this.play.append(this.frame, this.tray, this.layer);
    this.el.append(bar, this.play);

    this.play.addEventListener('pointerdown', this.onDown);
    this.play.addEventListener('pointermove', this.onMove);
    this.play.addEventListener('pointerup', this.onUp);
    this.play.addEventListener('pointercancel', this.onUp);
    this.play.addEventListener('lostpointercapture', this.onUp);

    this.paintToggles();
    this.updateProgress();
    if (navigator.webdriver) (window as unknown as { jigsaw: GameView }).jigsaw = this;
  }

  destroy(): void {
    this.alive = false;
    this.drag = null;
  }

  private toolButton(icon: string, label: string, fn: () => void): HTMLButtonElement {
    const btn = h('button', { class: 'tool', 'aria-label': label });
    btn.innerHTML = `<span class="tool-icon">${icon}</span><span class="tool-label">${label}</span>`;
    onTap(btn, () => {
      this.sound.tap();
      fn();
    });
    return btn;
  }

  private paintToggles(): void {
    const { guide, edgesOnly } = this.store.data.settings;
    this.guideBtn.setAttribute('aria-pressed', String(guide));
    this.edgesBtn.setAttribute('aria-pressed', String(edgesOnly));
    this.frame.classList.toggle('show-guide', guide);
  }

  private updateProgress(): void {
    const placed = placedCount(this.state);
    this.progress.textContent = `${placed} of ${this.state.pieces.length} in place`;
  }

  // ---------- layout ----------

  /** Fit the board, table and tray to the screen. */
  layout(): void {
    if (!this.alive) return;
    const r = this.play.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.landscape = r.width >= r.height;
    this.el.classList.toggle('landscape', this.landscape);
    this.el.classList.toggle('portrait', !this.landscape);
    if (this.landscape) {
      const w = clamp(r.width * 0.21, 170, 300);
      this.trayRect = { x: r.width - w, y: 0, w, h: r.height };
      this.tableRect = { x: 0, y: 0, w: r.width - w, h: r.height };
    } else {
      const th = clamp(r.height * 0.21, 170, 280);
      this.trayRect = { x: 0, y: r.height - th, w: r.width, h: th };
      this.tableRect = { x: 0, y: 0, w: r.width, h: r.height - th };
    }
    setRect(this.tray, this.trayRect);

    const t = this.tableRect;
    this.scale = Math.min((t.w * BOARD_FILL) / this.state.width, (t.h * BOARD_FILL) / this.state.height);
    const bw = this.state.width * this.scale;
    const bh = this.state.height * this.scale;
    this.board = { x: t.x + (t.w - bw) / 2, y: t.y + (t.h - bh) / 2, w: bw, h: bh };
    setRect(this.frame, this.board);

    if (Math.abs(this.scale - this.renderedScale) / this.scale > 0.02) this.renderPieces();
    const groups = new Set(this.state.pieces.filter((p) => !p.inTray && p.group !== PLACED).map((p) => p.group));
    groups.forEach((g) => this.keepOnTable(g));
    this.positionAll();
    this.layoutTray();
  }

  private renderPieces(): void {
    this.renderedScale = this.scale;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const k = this.scale * dpr;
    const m = this.margin;
    const { width: W, height: H } = this.state;
    const kx = this.image.naturalWidth / W;
    const ky = this.image.naturalHeight / H;
    const cssW = (this.pw + 2 * m) * this.scale;
    const cssH = (this.ph + 2 * m) * this.scale;
    for (const p of this.state.pieces) {
      const canvas = this.canvases[p.id];
      canvas.width = Math.ceil(cssW * dpr);
      canvas.height = Math.ceil(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      const ox = p.col * this.pw - m;
      const oy = p.row * this.ph - m;
      // Draw in picture units, with this piece's tab box at the canvas origin.
      ctx.setTransform(k, 0, 0, k, -ox * k, -oy * k);
      const path = this.paths[p.id];
      ctx.save();
      ctx.clip(path);
      // Safari draws nothing if the source rectangle leaves the image, so clamp it.
      const sx = Math.max(0, ox);
      const sy = Math.max(0, oy);
      const sw = Math.min(W, ox + this.pw + 2 * m) - sx;
      const sh = Math.min(H, oy + this.ph + 2 * m) - sy;
      ctx.drawImage(this.image, sx * kx, sy * ky, sw * kx, sh * ky, sx, sy, sw, sh);
      // A soft bevel so each piece stands out from the picture around it.
      const px = 1 / this.scale;
      ctx.lineWidth = 3 * px;
      ctx.translate(px, px);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.stroke(path);
      ctx.translate(-2 * px, -2 * px);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.stroke(path);
      ctx.restore();
      ctx.lineWidth = 1.2 * px;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.stroke(path);
    }
  }

  private positionAll(): void {
    for (const p of this.state.pieces) if (!p.inTray) this.position(p);
  }

  /** Put a piece that is on the table at its place on screen. */
  private position(p: PieceState): void {
    const canvas = this.canvases[p.id];
    if (canvas.parentElement !== this.layer) {
      canvas.style.transform = '';
      this.layer.append(canvas);
    }
    const left = this.board.x + (p.x - this.margin) * this.scale;
    const top = this.board.y + (p.y - this.margin) * this.scale;
    canvas.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    canvas.style.zIndex = String(p.group === PLACED ? 1 : 10 + p.z);
    canvas.classList.toggle('placed', p.group === PLACED);
  }

  /** Nudge a group so it can't be lost off the edge of the table. */
  private keepOnTable(group: number): void {
    const members = groupOf(this.state, group);
    if (!members.length) return;
    const t = this.tableRect;
    const x0 = (t.x - this.board.x) / this.scale;
    const y0 = (t.y - this.board.y) / this.scale;
    const x1 = x0 + t.w / this.scale;
    const y1 = y0 + t.h / this.scale;
    const minX = Math.min(...members.map((p) => p.x));
    const minY = Math.min(...members.map((p) => p.y));
    const maxX = Math.max(...members.map((p) => p.x)) + this.pw;
    const maxY = Math.max(...members.map((p) => p.y)) + this.ph;
    const dx = minX < x0 ? x0 - minX : maxX > x1 ? Math.max(x0 - minX, x1 - maxX) : 0;
    const dy = minY < y0 ? y0 - minY : maxY > y1 ? Math.max(y0 - minY, y1 - maxY) : 0;
    if (dx || dy) moveGroup(this.state, group, dx, dy);
  }

  // ---------- tray ----------

  private layoutTray(): void {
    const outer = Math.max(this.pw, this.ph) + 2 * this.margin;
    const want = outer * this.scale * CELL_SHARE;
    const arrows = 64 + 12;
    const info = 40;
    const pad = 16;
    const innerW = this.landscape ? this.trayRect.w - pad : this.trayRect.w - 2 * arrows - pad;
    const innerH = this.landscape ? this.trayRect.h - 2 * arrows - info - pad : this.trayRect.h - info - pad;
    // Tray pieces may shrink a little so a page holds a useful number.
    const small = Math.min(want * TRAY_SHRINK, innerW, innerH);
    const cols = Math.max(1, Math.floor(innerW / small));
    const rows = Math.max(1, Math.floor(innerH / small));
    this.cell = Math.min(innerW / cols, innerH / rows, want);
    this.perPage = cols * rows;
    this.trayScale = Math.min(1, this.cell / want);
    this.trayGrid.style.setProperty('--cols', String(cols));
    this.trayGrid.style.setProperty('--rows', String(rows));
    this.trayGrid.style.setProperty('--cell', `${this.cell}px`);
    this.trayPrev.innerHTML = this.landscape ? ICONS.up : ICONS.left;
    this.trayNext.innerHTML = this.landscape ? ICONS.down : ICONS.right;
    this.renderTray();
  }

  private trayList(): number[] {
    const { edgesOnly } = this.store.data.settings;
    return edgesOnly ? this.state.tray.filter((id) => isEdgePiece(this.state, this.state.pieces[id])) : this.state.tray;
  }

  private turnPage(step: number): void {
    const pages = Math.max(1, Math.ceil(this.trayList().length / this.perPage));
    this.trayPage = clamp(this.trayPage + step, 0, pages - 1);
    this.renderTray();
  }

  private renderTray(): void {
    const list = this.trayList();
    const pages = Math.max(1, Math.ceil(list.length / this.perPage));
    this.trayPage = clamp(this.trayPage, 0, pages - 1);
    const shown = list.slice(this.trayPage * this.perPage, (this.trayPage + 1) * this.perPage);

    this.trayGrid.replaceChildren();
    for (const id of shown) {
      const canvas = this.canvases[id];
      canvas.style.transform = `translate(-50%, -50%) scale(${this.trayScale})`;
      canvas.style.zIndex = '';
      canvas.classList.remove('placed', 'lifted');
      const cell = h('div', { class: 'tray-cell', 'data-id': id }, canvas);
      this.trayGrid.append(cell);
    }

    const edges = this.store.data.settings.edgesOnly;
    const word = (n: number) => `${n} ${edges ? 'edge piece' : 'piece'}${n === 1 ? '' : 's'}`;
    if (!list.length) {
      this.trayInfo.textContent = edges && this.state.tray.length ? 'No edge pieces left' : 'Tray is empty';
    } else {
      this.trayInfo.textContent = pages > 1 ? `${word(list.length)} · ${this.trayPage + 1} of ${pages}` : word(list.length);
    }
    this.trayPrev.disabled = this.trayPage === 0;
    this.trayNext.disabled = this.trayPage >= pages - 1;
    this.tray.classList.toggle('single-page', pages <= 1);
  }

  // ---------- dragging ----------

  private local(e: PointerEvent): Point {
    const r = this.play.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private toPicture(pt: Point): Point {
    return { x: (pt.x - this.board.x) / this.scale, y: (pt.y - this.board.y) / this.scale };
  }

  /** The loose piece under a point, or failing that the nearest one close by. */
  private hit(pt: Point): PieceState | null {
    const u = this.toPicture(pt);
    const loose = this.state.pieces.filter((p) => !p.inTray && p.group !== PLACED).sort((a, b) => b.z - a.z);
    const m = this.margin;
    for (const p of loose) {
      const lx = u.x - (p.x - p.col * this.pw);
      const ly = u.y - (p.y - p.row * this.ph);
      const cx = p.col * this.pw;
      const cy = p.row * this.ph;
      if (lx < cx - m || lx > cx + this.pw + m || ly < cy - m || ly > cy + this.ph + m) continue;
      if (this.hitCtx.isPointInPath(this.paths[p.id], lx, ly)) return p;
    }
    // Forgiving touch: accept the nearest piece if the finger is close.
    const reach = Math.max(0.6 * Math.min(this.pw, this.ph), 28 / this.scale);
    let best: PieceState | null = null;
    let bestDist = reach;
    for (const p of loose) {
      const d = Math.hypot(p.x + this.pw / 2 - u.x, p.y + this.ph / 2 - u.y);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return best;
  }

  private onDown = (e: PointerEvent): void => {
    if (!e.isPrimary || e.button > 0 || this.drag || this.done) return;
    const pt = this.local(e);
    let group: number | null = null;
    if (inside(this.tableRect, pt)) {
      group = this.hit(pt)?.group ?? null;
    } else {
      const cell = (e.target as Element).closest?.('.tray-cell') as HTMLElement | null;
      if (cell) {
        const id = Number(cell.dataset.id);
        const u = this.toPicture(pt);
        takeFromTray(this.state, id, u.x - this.pw / 2, u.y - this.ph / 2);
        group = this.state.pieces[id].group;
        this.renderTray();
      }
    }
    if (group === null || group === PLACED) return;
    e.preventDefault();
    try {
      this.play.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events in tests can't be captured.
    }
    bringToFront(this.state, group);
    this.drag = { pointerId: e.pointerId, group, last: pt, frame: 0 };
    const members = groupOf(this.state, group);
    const lift = members.length <= 6;
    for (const p of members) {
      this.canvases[p.id].classList.toggle('lifted', lift);
      this.position(p);
    }
    this.sound.tap();
  };

  private onMove = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const pt = this.local(e);
    moveGroup(this.state, drag.group, (pt.x - drag.last.x) / this.scale, (pt.y - drag.last.y) / this.scale);
    drag.last = pt;
    if (!drag.frame) {
      drag.frame = requestAnimationFrame(() => {
        drag.frame = 0;
        if (this.drag === drag) groupOf(this.state, drag.group).forEach((p) => this.position(p));
      });
    }
  };

  private onUp = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    this.drag = null;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    const members = groupOf(this.state, drag.group);
    members.forEach((p) => this.canvases[p.id].classList.remove('lifted'));

    if (inside(this.trayRect, drag.last) && members.length === 1) {
      returnToTray(this.state, members[0].id);
      this.canvases[members[0].id].remove();
      this.trayPage = 0;
      this.renderTray();
      this.store.save();
      return;
    }

    this.keepOnTable(drag.group);
    const result = snap(this.state, drag.group);
    if (result.placed) this.sound.place();
    else if (result.joined) this.sound.join();
    this.settle();
    this.updateProgress();
    this.store.save();
    if (isComplete(this.state)) void this.finish();
  };

  /** Glide pieces into their new places after a snap. */
  private settle(): void {
    const loose = this.state.pieces.filter((p) => !p.inTray);
    if (!reducedMotion()) {
      loose.forEach((p) => this.canvases[p.id].classList.add('settling'));
      setTimeout(() => loose.forEach((p) => this.canvases[p.id].classList.remove('settling')), 220);
    }
    this.positionAll();
  }

  // ---------- extras ----------

  private showBigPicture(): void {
    const pic = this.state.picture;
    const overlay = h('div', { class: 'overlay big-picture', role: 'dialog', 'aria-label': 'The whole picture' });
    const img = h('img', { src: this.image.src, alt: pic.title, draggable: 'false' });
    const caption = h('div', { class: 'caption' });
    caption.append(h('strong', {}, pic.title), h('span', {}, creditLine(pic)));
    const close = h('button', { class: 'pill', 'aria-label': 'Close' });
    close.innerHTML = `${ICONS.close}<span>Close</span>`;
    overlay.append(img, caption, close);
    onTap(overlay, () => {
      this.sound.tap();
      overlay.classList.add('leaving');
      setTimeout(() => overlay.remove(), 300);
    });
    this.el.append(overlay);
  }

  private async finish(): Promise<void> {
    this.done = true;
    this.store.setCurrent(null);
    this.el.classList.add('complete');
    this.sound.win();
    await new Promise((r) => setTimeout(r, 900));
    if (!this.alive) return;
    const panel = h('div', { class: 'overlay win', role: 'dialog', 'aria-label': 'Puzzle finished' });
    const card = h('div', { class: 'win-card' });
    const again = h('button', { class: 'big-btn primary' }, 'Choose another picture');
    const admire = h('button', { class: 'big-btn' }, 'Look at my puzzle');
    onTap(again, () => {
      this.sound.tap();
      this.actions.home();
    });
    onTap(admire, () => {
      this.sound.tap();
      panel.remove();
      this.showAdmireBar();
    });
    card.append(
      h('h2', {}, 'Well done!'),
      h('p', {}, `You finished all ${this.state.pieces.length} pieces.`),
      h('div', { class: 'win-buttons' }, again, admire),
    );
    panel.append(card);
    this.el.append(panel);
  }

  private showAdmireBar(): void {
    const btn = h('button', { class: 'big-btn primary admire-next' }, 'Choose another picture');
    onTap(btn, () => {
      this.sound.tap();
      this.actions.home();
    });
    this.el.append(btn);
  }

  /** For automated tests: screen points for a piece's centre now and when placed. */
  testPoints(id: number): { now: Point; target: Point; inTray: boolean } {
    const p = this.state.pieces[id];
    const r = this.play.getBoundingClientRect();
    const at = (x: number, y: number) => ({
      x: r.left + this.board.x + (x + this.pw / 2) * this.scale,
      y: r.top + this.board.y + (y + this.ph / 2) * this.scale,
    });
    return { now: at(p.x, p.y), target: at(p.col * this.pw, p.row * this.ph), inTray: p.inTray };
  }
}

export function creditLine(pic: PuzzleState['picture']): string {
  if (pic.source === 'upload') return 'Your own photo';
  return `${pic.artist} · ${pic.license} · ${sourceLabel(pic.source)}`;
}

function setRect(el: HTMLElement, r: Rect): void {
  el.style.left = `${r.x}px`;
  el.style.top = `${r.y}px`;
  el.style.width = `${r.w}px`;
  el.style.height = `${r.h}px`;
}
