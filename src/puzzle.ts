/**
 * The puzzle model: how a picture is cut, where every piece is, and the
 * rules for joining pieces together. No DOM here, so it can be tested.
 *
 * Positions are in "picture units": the stored picture's pixel size, with
 * (0, 0) at the top-left corner of the board. A piece's x/y is the top-left
 * of its body (the rectangle without tabs), so a piece is in the right
 * place when x = col * pieceW and y = row * pieceH.
 */

export const PRESET_COUNTS = [25, 50, 100] as const;
export const MIN_PIECES = 4;
export const MAX_PIECES = 300;

/** Group id shared by every piece fixed in its right place on the board. */
export const PLACED = 0;

/** How close (as a share of a piece) counts as "near enough" to snap. */
export const SNAP_TOLERANCE = 0.35;

/** Tabs reach out up to this share of the edge length beyond the body. */
export const TAB_MARGIN = 0.36;

export interface PictureInfo {
  id: string;
  source: 'commons' | 'aic' | 'met' | 'upload';
  title: string;
  artist: string;
  license: string;
  /** Page about the picture, for the credits. */
  link?: string;
  thumb: string;
  full: string;
  /** A smaller copy to fall back on if the full one won't load. */
  fallback?: string;
}

export interface PieceState {
  id: number;
  col: number;
  row: number;
  x: number;
  y: number;
  inTray: boolean;
  group: number;
  z: number;
}

export interface PuzzleState {
  version: 1;
  cols: number;
  rows: number;
  seed: number;
  width: number;
  height: number;
  picture: PictureInfo;
  pieces: PieceState[];
  /** Ids of the pieces still in the tray, in the order shown. */
  tray: number[];
  zTop: number;
  startedAt: number;
}

export function clampCount(n: number): number {
  if (!Number.isFinite(n)) return PRESET_COUNTS[0];
  return Math.min(MAX_PIECES, Math.max(MIN_PIECES, Math.round(n)));
}

/**
 * Pick columns and rows for about `count` pieces of a picture with the given
 * width/height ratio, preferring pieces that are close to square.
 */
export function gridFor(count: number, aspect: number): { cols: number; rows: number } {
  const target = clampCount(count);
  let best = { cols: 2, rows: 2 };
  let bestScore = Infinity;
  for (let rows = 2; rows <= target / 2; rows++) {
    for (const cols of [Math.floor(target / rows), Math.ceil(target / rows)]) {
      if (cols < 2) continue;
      const pieceAspect = (aspect * rows) / cols;
      const score = Math.abs(cols * rows - target) / target + Math.abs(Math.log(pieceAspect)) * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = { cols, rows };
      }
    }
  }
  return best;
}

/** Small seeded random number generator, so cuts can be rebuilt from a seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Tab {
  flip: 1 | -1;
  t: number;
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
}

export interface Cuts {
  /** horizontal[r][c]: the edge along the top of row r (r = 1..rows-1). */
  horizontal: Tab[][];
  /** vertical[r][c]: the edge along the left of column c (c = 1..cols-1). */
  vertical: Tab[][];
}

export function makeCuts(cols: number, rows: number, seed: number): Cuts {
  const rand = rng(seed);
  const jitter = () => (rand() * 2 - 1) * 0.04;
  const tab = (): Tab => ({
    flip: rand() < 0.5 ? 1 : -1,
    t: 0.085 + rand() * 0.02,
    a: jitter(),
    b: jitter(),
    c: jitter(),
    d: jitter(),
    e: jitter(),
  });
  const horizontal: Tab[][] = [];
  const vertical: Tab[][] = [];
  for (let r = 0; r < rows; r++) {
    horizontal.push(Array.from({ length: cols }, tab));
    vertical.push(Array.from({ length: cols }, tab));
  }
  return { horizontal, vertical };
}

type Point = [number, number];

/**
 * The ten control points of a classic tab edge from (x0, y0) to (x1, y1):
 * a start point followed by three cubic Bézier curves.
 */
export function edgePoints(tab: Tab, x0: number, y0: number, x1: number, y1: number): Point[] {
  const { t, a, b, c, d, e, flip } = tab;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const p = (u: number, v: number): Point => [x0 + u * dx - v * flip * dy, y0 + u * dy + v * flip * dx];
  return [
    p(0, 0),
    p(0.2, a),
    p(0.5 + b + d, -t + c),
    p(0.5 - t + b, t + c),
    p(0.5 - 2 * t + b - d, 3 * t + c),
    p(0.5 + 2 * t + b - d, 3 * t + c),
    p(0.5 + t + b, t + c),
    p(0.5 + b + d, -t + c),
    p(0.8, e),
    p(1, 0),
  ];
}

/** Anything with moveTo/lineTo/bezierCurveTo: a Path2D or a canvas context. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  closePath(): void;
}

/**
 * Trace the outline of piece (col, row) in picture units at its right place,
 * then mapped through `map` (e.g. to canvas pixels).
 */
export function tracePiece(
  sink: PathSink,
  cuts: Cuts,
  cols: number,
  rows: number,
  pieceW: number,
  pieceH: number,
  col: number,
  row: number,
  map: (x: number, y: number) => Point = (x, y) => [x, y],
): void {
  const left = col * pieceW;
  const top = row * pieceH;
  const right = left + pieceW;
  const bottom = top + pieceH;
  const start = map(left, top);
  sink.moveTo(start[0], start[1]);

  const follow = (pts: Point[] | null, endX: number, endY: number) => {
    if (!pts) {
      const [x, y] = map(endX, endY);
      sink.lineTo(x, y);
      return;
    }
    for (let i = 1; i < pts.length; i += 3) {
      const [a, b, c] = [map(...pts[i]), map(...pts[i + 1]), map(...pts[i + 2])];
      sink.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]);
    }
  };

  follow(row > 0 ? edgePoints(cuts.horizontal[row][col], left, top, right, top) : null, right, top);
  follow(col < cols - 1 ? edgePoints(cuts.vertical[row][col + 1], right, top, right, bottom) : null, right, bottom);
  follow(
    row < rows - 1 ? edgePoints(cuts.horizontal[row + 1][col], left, bottom, right, bottom).reverse() : null,
    left,
    bottom,
  );
  follow(col > 0 ? edgePoints(cuts.vertical[row][col], left, top, left, bottom).reverse() : null, left, top);
  sink.closePath();
}

export function pieceSize(state: Pick<PuzzleState, 'width' | 'height' | 'cols' | 'rows'>) {
  return { w: state.width / state.cols, h: state.height / state.rows };
}

/** How far tabs can stick out beyond a piece's body, in picture units. */
export function tabMargin(state: Pick<PuzzleState, 'width' | 'height' | 'cols' | 'rows'>): number {
  const { w, h } = pieceSize(state);
  return TAB_MARGIN * Math.max(w, h);
}

export function shuffle<T>(items: T[], rand: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function createPuzzle(
  count: number,
  width: number,
  height: number,
  picture: PictureInfo,
  seed: number = Math.floor(Math.random() * 2 ** 31),
  now: number = Date.now(),
): PuzzleState {
  const { cols, rows } = gridFor(count, width / height);
  const pieces: PieceState[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const id = row * cols + col;
      pieces.push({ id, col, row, x: 0, y: 0, inTray: true, group: id + 1, z: 0 });
    }
  }
  const order = shuffle(
    pieces.map((p) => p.id),
    rng(seed ^ 0x5bd1e995),
  );
  return { version: 1, cols, rows, seed, width, height, picture, pieces, tray: order, zTop: 0, startedAt: now };
}

export function isEdgePiece(state: PuzzleState, p: PieceState): boolean {
  return p.col === 0 || p.row === 0 || p.col === state.cols - 1 || p.row === state.rows - 1;
}

export function groupOf(state: PuzzleState, group: number): PieceState[] {
  return state.pieces.filter((p) => !p.inTray && p.group === group);
}

export function placedCount(state: PuzzleState): number {
  return state.pieces.filter((p) => p.group === PLACED).length;
}

export function isComplete(state: PuzzleState): boolean {
  return state.pieces.every((p) => p.group === PLACED);
}

export function moveGroup(state: PuzzleState, group: number, dx: number, dy: number): void {
  for (const p of groupOf(state, group)) {
    p.x += dx;
    p.y += dy;
  }
}

export function bringToFront(state: PuzzleState, group: number): void {
  state.zTop += 1;
  for (const p of groupOf(state, group)) p.z = state.zTop;
}

/** Take a piece out of the tray and put it on the table at (x, y). */
export function takeFromTray(state: PuzzleState, id: number, x: number, y: number): void {
  const p = state.pieces[id];
  state.tray = state.tray.filter((t) => t !== id);
  p.inTray = false;
  p.x = x;
  p.y = y;
  p.group = id + 1;
  bringToFront(state, p.group);
}

/** Put a loose piece back at the start of the tray. */
export function returnToTray(state: PuzzleState, id: number): void {
  const p = state.pieces[id];
  if (p.group === PLACED || groupOf(state, p.group).length > 1) return;
  p.inTray = true;
  state.tray = [id, ...state.tray.filter((t) => t !== id)];
}

export interface SnapResult {
  /** The group fell into its right place on the board. */
  placed: boolean;
  /** The group joined at least one neighbouring piece or group. */
  joined: boolean;
}

/**
 * After a group is dropped: fix it on the board if it is near its right
 * place, otherwise join it to any neighbours lying near where they belong.
 * Joining repeats, so a group can pick up several neighbours at once.
 */
export function snap(state: PuzzleState, group: number, tolerance = SNAP_TOLERANCE): SnapResult {
  const { w, h } = pieceSize(state);
  const tolX = w * tolerance;
  const tolY = h * tolerance;
  const result: SnapResult = { placed: false, joined: false };
  if (group === PLACED) return result;

  for (let guard = 0; guard < state.pieces.length; guard++) {
    const members = groupOf(state, group);
    if (!members.length) return result;

    const first = members[0];
    const offX = first.col * w - first.x;
    const offY = first.row * h - first.y;
    if (Math.abs(offX) <= tolX && Math.abs(offY) <= tolY) {
      for (const p of members) {
        p.x = p.col * w;
        p.y = p.row * h;
        p.group = PLACED;
        p.z = 0;
      }
      result.placed = true;
      return result;
    }

    const match = findNeighbour(state, members, w, h, tolX, tolY);
    if (!match) return result;
    const { mine, theirs } = match;
    // Move this group so it lines up exactly with the neighbour it found.
    moveGroup(
      state,
      group,
      theirs.x + (mine.col - theirs.col) * w - mine.x,
      theirs.y + (mine.row - theirs.row) * h - mine.y,
    );
    result.joined = true;
    if (theirs.group === PLACED) {
      for (const p of members) {
        p.group = PLACED;
        p.z = 0;
      }
      result.placed = true;
      return result;
    }
    const other = theirs.group;
    for (const p of groupOf(state, other)) p.group = group;
    bringToFront(state, group);
  }
  return result;
}

function findNeighbour(
  state: PuzzleState,
  members: PieceState[],
  w: number,
  h: number,
  tolX: number,
  tolY: number,
): { mine: PieceState; theirs: PieceState } | null {
  const group = members[0].group;
  for (const mine of members) {
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const col = mine.col + dc;
      const row = mine.row + dr;
      if (col < 0 || row < 0 || col >= state.cols || row >= state.rows) continue;
      const theirs = state.pieces[row * state.cols + col];
      if (theirs.inTray || theirs.group === group) continue;
      const wantX = theirs.x - dc * w;
      const wantY = theirs.y - dr * h;
      if (Math.abs(mine.x - wantX) <= tolX && Math.abs(mine.y - wantY) <= tolY) return { mine, theirs };
    }
  }
  return null;
}

export function isPuzzleState(value: unknown): value is PuzzleState {
  const v = value as PuzzleState;
  return (
    !!v &&
    v.version === 1 &&
    Number.isInteger(v.cols) &&
    Number.isInteger(v.rows) &&
    v.width > 0 &&
    v.height > 0 &&
    Array.isArray(v.pieces) &&
    v.pieces.length === v.cols * v.rows &&
    Array.isArray(v.tray) &&
    typeof v.picture?.full === 'string'
  );
}
