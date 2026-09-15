// SyncTeX scaled points -> PDF big points. The compiler provides source records;
// nearest-record lookup is a line-level approximation, not character mapping.
export function parseSyncTeX(text) {
  const value = (name) =>
    Number(text.match(new RegExp("^" + name + ":([\\d.-]+)", "m"))?.[1] || 0);
  const scale =
    ((((value("Unit") || 1) * (value("Magnification") || 1000)) /
      1000 /
      65536) *
      72) /
    72.27;
  const offsetX = ((value("X Offset") / 65536) * 72) / 72.27,
    offsetY = ((value("Y Offset") / 65536) * 72) / 72.27;
  const inputs = new Map(
    [...text.matchAll(/^Input:(\d+):(.*)$/gm)].map((m) => [Number(m[1]), m[2]]),
  );
  const main = [...inputs].find(([, name]) =>
    /(?:^|\/)main\.tex$/.test(name),
  )?.[0];
  if (!main) throw Error("Compiler source map has no main manuscript.");
  let page = 0;
  const points = [];
  for (const line of text.split("\n")) {
    const sheet = line.match(/^\{(\d+)/);
    if (sheet) {
      page = Number(sheet[1]);
      continue;
    }
    const m = line.match(
      /^([gxhk$])(\d+),(\d+)(?:,-?\d+)?:(-?\d+),(-?\d+)(?::(-?\d+)(?:,(-?\d+),(-?\d+))?)?/,
    );
    if (m && Number(m[2]) === main && page) {
      points.push({
        page,
        line: Number(m[3]),
        x: Number(m[4]) * scale + offsetX,
        y: Number(m[5]) * scale + offsetY,
        width: Number(m[6] || 0) * scale,
        height: Number(m[7] || 0) * scale,
        depth: Number(m[8] || 0) * scale,
        kind: m[1],
      });
    }
  }
  return points;
}
export function sourceAt(points, page, x, y) {
  if (!Number.isInteger(page) || page < 1 || ![x, y].every(Number.isFinite))
    throw Error("Invalid PDF position.");
  let best = null,
    distance = Infinity;
  for (const p of points) {
    if (p.page !== page) continue;
    const dx = Math.abs(p.x - x),
      dy = Math.abs(p.y - y);
    const d = dy * dy * 4 + dx * dx;
    if (d < distance) {
      best = p;
      distance = d;
    }
  }
  return best ? { line: best.line, page, distance: Math.sqrt(distance) } : null;
}
