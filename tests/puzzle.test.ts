import { describe, expect, it } from 'vitest';
import {
  createPuzzle,
  edgePoints,
  gridFor,
  groupOf,
  isComplete,
  makeCuts,
  pieceSize,
  PLACED,
  returnToTray,
  snap,
  takeFromTray,
  tracePiece,
  type PathSink,
  type PictureInfo,
} from '../src/puzzle';

const pic: PictureInfo = { id: 't', source: 'upload', title: 'T', artist: '', license: '', thumb: '', full: '' };

describe('gridFor', () => {
  it('gets close to the asked-for count with near-square pieces', () => {
    for (const aspect of [4 / 3, 3 / 2, 16 / 9, 1, 3 / 4]) {
      for (const n of [25, 50, 100, 37, 200]) {
        const { cols, rows } = gridFor(n, aspect);
        expect(Math.abs(cols * rows - n) / n).toBeLessThan(0.2);
        const pieceAspect = (aspect * rows) / cols;
        expect(pieceAspect).toBeGreaterThan(0.7);
        expect(pieceAspect).toBeLessThan(1.45);
      }
    }
  });

  it('keeps counts within limits', () => {
    const small = gridFor(1, 1);
    expect(small.cols * small.rows).toBe(4);
    const big = gridFor(10_000, 1);
    expect(big.cols * big.rows).toBeLessThanOrEqual(310);
  });
});

describe('cuts', () => {
  it('are the same for the same seed', () => {
    expect(makeCuts(5, 4, 42)).toEqual(makeCuts(5, 4, 42));
    expect(makeCuts(5, 4, 42)).not.toEqual(makeCuts(5, 4, 43));
  });

  it('edges start and end exactly at the corners', () => {
    const tab = makeCuts(3, 3, 1).horizontal[1][1];
    const pts = edgePoints(tab, 10, 20, 110, 20);
    expect(pts).toHaveLength(10);
    expect(pts[0]).toEqual([10, 20]);
    expect(pts[9][0]).toBeCloseTo(110);
    expect(pts[9][1]).toBeCloseTo(20);
  });

  it('neighbouring pieces share the same edge curve', () => {
    const cuts = makeCuts(3, 3, 9);
    const record = (col: number, row: number) => {
      const calls: number[][] = [];
      const sink: PathSink = {
        moveTo: (...a) => calls.push(a),
        lineTo: (...a) => calls.push(a),
        bezierCurveTo: (...a) => calls.push(a),
        closePath: () => {},
      };
      tracePiece(sink, cuts, 3, 3, 100, 80, col, row);
      return calls;
    };
    // Piece (1,1)'s top edge is piece (1,0)'s bottom edge, traced backwards.
    // Calls: moveTo, top (a line on row 0, else 3 curves), then 3 curves per side.
    const middle = [100, 80, ...record(1, 1).slice(1, 4).flat()];
    const bottom = [200, 80, ...record(1, 0).slice(5, 8).flat()];
    expect(new Set(middle.map((v) => v.toFixed(6)))).toEqual(new Set(bottom.map((v) => v.toFixed(6))));
  });
});

describe('playing', () => {
  const setup = () => createPuzzle(16, 400, 400, pic, 7, 0);

  it('starts with every piece in the tray', () => {
    const s = setup();
    expect(s.pieces).toHaveLength(16);
    expect([...s.tray].sort((a, b) => a - b)).toEqual(s.pieces.map((p) => p.id));
    expect(isComplete(s)).toBe(false);
  });

  it('snaps a piece dropped near its place onto the board', () => {
    const s = setup();
    const { w, h } = pieceSize(s);
    takeFromTray(s, 5, s.pieces[5].col * w + w * 0.3, s.pieces[5].row * h - h * 0.2);
    const r = snap(s, s.pieces[5].group);
    expect(r.placed).toBe(true);
    expect(s.pieces[5]).toMatchObject({ x: w, y: h, group: PLACED });
  });

  it('leaves a piece that is too far away', () => {
    const s = setup();
    const { w } = pieceSize(s);
    takeFromTray(s, 5, 900, 900 + w);
    expect(snap(s, s.pieces[5].group)).toEqual({ placed: false, joined: false });
  });

  it('joins neighbours off the board and moves them together', () => {
    const s = setup();
    const { w, h } = pieceSize(s);
    takeFromTray(s, 0, 600, 600);
    takeFromTray(s, 1, 600 + w + 12, 600 - 9);
    const r = snap(s, s.pieces[1].group);
    expect(r).toEqual({ placed: false, joined: true });
    expect(s.pieces[0].group).toBe(s.pieces[1].group);
    expect(s.pieces[1].x - s.pieces[0].x).toBeCloseTo(w);
    expect(s.pieces[1].y - s.pieces[0].y).toBeCloseTo(0);
    expect(groupOf(s, s.pieces[0].group)).toHaveLength(2);

    // A joined pair can't go back to the tray.
    returnToTray(s, 0);
    expect(s.pieces[0].inTray).toBe(false);

    // Joining a piece that is already on the board fixes the group in place.
    takeFromTray(s, 4, 0, h);
    snap(s, s.pieces[4].group);
    expect(s.pieces[4].group).toBe(PLACED);
    const g = s.pieces[0].group;
    for (const p of groupOf(s, g)) {
      p.x += -600 + 0.2 * w;
      p.y += -600;
    }
    expect(snap(s, g).placed).toBe(true);
    expect(s.pieces[1]).toMatchObject({ x: w, y: 0, group: PLACED });
  });

  it('is complete once every piece is placed', () => {
    const s = setup();
    const { w, h } = pieceSize(s);
    for (const p of [...s.pieces]) {
      takeFromTray(s, p.id, p.col * w, p.row * h);
      snap(s, p.group);
    }
    expect(isComplete(s)).toBe(true);
  });

  it('returns a single loose piece to the front of the tray', () => {
    const s = setup();
    takeFromTray(s, 3, 500, 500);
    returnToTray(s, 3);
    expect(s.tray[0]).toBe(3);
    expect(s.pieces[3].inTray).toBe(true);
  });
});
