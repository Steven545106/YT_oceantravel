import test from 'node:test';
import assert from 'node:assert/strict';
import { findGridPath, smoothGridPath, nearestFreeCell, gridCellOf, gridCenterOf, formatDuration } from '../dist/nav-grid.js';

// '#' = land, '.' = sea, '~' = sea next to land (slower)
function makeGrid(rows, cell = 1) {
  const cols = rows[0].length;
  const blocked = new Uint8Array(cols * rows.length), near = new Uint8Array(cols * rows.length);
  rows.forEach((row, j) => [...row].forEach((c, i) => { if (c === '#') blocked[j * cols + i] = 1; if (c === '~') near[j * cols + i] = 1; }));
  return { cols, rows: rows.length, cell, blocked, near, minX: 0, minZ: 0 };
}
const walk = (grid, path) => path.every(({ i, j }) => !grid.blocked[j * grid.cols + i]);
const contiguous = (path) => path.every((p, k) => k === 0 || (Math.abs(p.i - path[k - 1].i) <= 1 && Math.abs(p.j - path[k - 1].j) <= 1));

test('finds a straight path in open water', () => {
  const g = makeGrid(['.....', '.....', '.....']);
  const path = findGridPath(g, { i: 0, j: 1 }, { i: 4, j: 1 });
  assert.deepEqual(path[0], { i: 0, j: 1 });
  assert.deepEqual(path.at(-1), { i: 4, j: 1 });
  assert.ok(contiguous(path));
});

test('routes around land and never steps on it', () => {
  const g = makeGrid(['..#..', '..#..', '..#..', '.....']);
  const path = findGridPath(g, { i: 0, j: 0 }, { i: 4, j: 0 });
  assert.ok(path && walk(g, path) && contiguous(path));
  assert.ok(path.some(({ j }) => j === 3), 'must pass through the gap at the bottom');
});

test('does not cut diagonally between two land corners', () => {
  const g = makeGrid(['.#', '#.']);
  assert.equal(findGridPath(g, { i: 0, j: 0 }, { i: 1, j: 1 }), null);
});

test('returns null for an unreachable goal, or the closest cell when partial', () => {
  const g = makeGrid(['..#..', '..#..', '..#..']);
  assert.equal(findGridPath(g, { i: 0, j: 1 }, { i: 4, j: 1 }), null);
  const partial = findGridPath(g, { i: 0, j: 1 }, { i: 4, j: 1 }, true);
  assert.equal(partial.at(-1).i, 1);
  assert.ok(walk(g, partial));
});

test('prefers open water over cells next to the coast', () => {
  const g = makeGrid(['~~~~~', '.....', '.....']);
  const path = findGridPath(g, { i: 0, j: 0 }, { i: 4, j: 0 });
  assert.ok(path.some(({ j }) => j >= 1), 'detours away from the near-coast row');
});

test('smoothGridPath shortens open routes but keeps detours around land', () => {
  const open = makeGrid(['......', '......', '......']);
  const p1 = smoothGridPath(open, findGridPath(open, { i: 0, j: 0 }, { i: 5, j: 2 }));
  assert.equal(p1.length, 2);
  const wall = makeGrid(['..#...', '..#...', '..#...', '......']);
  const p2 = smoothGridPath(wall, findGridPath(wall, { i: 0, j: 0 }, { i: 5, j: 0 }));
  assert.ok(p2.length >= 3, 'must bend around the wall');
  for (let k = 1; k < p2.length; k++) {
    for (let t = 0; t <= 20; t++) {
      const x = p2[k - 1].x + (p2[k].x - p2[k - 1].x) * t / 20, z = p2[k - 1].z + (p2[k].z - p2[k - 1].z) * t / 20;
      const { i, j } = gridCellOf(wall, x, z);
      assert.equal(wall.blocked[j * wall.cols + i], 0);
    }
  }
});

test('nearestFreeCell skips blocked cells', () => {
  const g = makeGrid(['###', '#.#', '###']);
  assert.deepEqual(nearestFreeCell(g, 0, 0), { i: 1, j: 1 });
  assert.equal(nearestFreeCell(makeGrid(['##', '##']), 0, 0), null);
});

test('grid cell and centre conversions agree', () => {
  const g = { ...makeGrid(['....', '....'], 2), minX: 10, minZ: -4 };
  const c = gridCenterOf(g, 2, 1);
  assert.deepEqual(c, { x: 15, z: -1 });
  assert.deepEqual(gridCellOf(g, c.x, c.z), { i: 2, j: 1 });
  assert.deepEqual(gridCellOf(g, -999, 999), { i: 0, j: 1 });
});

test('formatDuration', () => {
  assert.equal(formatDuration(0), '1 秒');
  assert.equal(formatDuration(45), '45 秒');
  assert.equal(formatDuration(133), '2 分 13 秒');
  assert.equal(formatDuration(605), '10 分 05 秒');
});
