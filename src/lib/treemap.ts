/**
 * Squarified treemap layout (Bruls, Huizing & van Wijk, 2000). Pure and
 * dependency-free so it can run in a server component and be unit tested.
 *
 * Given weights and a rectangle, returns one rectangle per item whose area is
 * proportional to its weight, keeping tiles as close to square as possible so
 * labels fit. Items are laid out largest first.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function worst(areas: number[], side: number): number {
  const sum = areas.reduce((s, a) => s + a, 0);
  const max = Math.max(...areas);
  const min = Math.min(...areas);
  const s2 = sum * sum;
  const side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
}

export function squarify<T>(items: T[], weight: (item: T) => number, bounds: Rect): Array<{ item: T; rect: Rect }> {
  const valid = items.map((item) => ({ item, w: Math.max(0, weight(item)) })).filter((x) => x.w > 0);
  const total = valid.reduce((s, x) => s + x.w, 0);
  if (!valid.length || total <= 0 || bounds.w <= 0 || bounds.h <= 0) return [];
  const scale = (bounds.w * bounds.h) / total;
  const queue = valid.sort((a, b) => b.w - a.w).map((x) => ({ item: x.item, area: x.w * scale }));

  const out: Array<{ item: T; rect: Rect }> = [];
  let r = { ...bounds };
  let i = 0;
  while (i < queue.length) {
    const side = Math.min(r.w, r.h);
    const row = [queue[i]!];
    let j = i + 1;
    while (j < queue.length) {
      const current = row.map((x) => x.area);
      const next = [...current, queue[j]!.area];
      if (worst(next, side) > worst(current, side)) break;
      row.push(queue[j]!);
      j++;
    }
    const rowArea = row.reduce((s, x) => s + x.area, 0);
    const thickness = rowArea / side;
    let offset = 0;
    const vertical = r.w >= r.h; // short side is the height: stack the row as a column on the left
    for (const x of row) {
      const len = x.area / thickness;
      out.push({ item: x.item, rect: vertical ? { x: r.x, y: r.y + offset, w: thickness, h: len } : { x: r.x + offset, y: r.y, w: len, h: thickness } });
      offset += len;
    }
    r = vertical ? { x: r.x + thickness, y: r.y, w: r.w - thickness, h: r.h } : { x: r.x, y: r.y + thickness, w: r.w, h: r.h - thickness };
    i = j;
  }
  return out;
}
