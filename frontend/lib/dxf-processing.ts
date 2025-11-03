import { Parser } from "@dxfjs/parser";
import type {
  ArcEntity,
  LineEntity,
  LWPolylineEntity,
  PolylineEntity,
} from "@dxfjs/parser";
import martinez from "martinez-polygon-clipping";

type Point = [number, number];
type Ring = Point[];
type MultiPolygon = Point[][][];

type Segment = {
  start: Point;
  end: Point;
};

export type CuttingParams = {
  tile_w: number;
  tile_h: number;
  seam: number;
  start_x: number;
  start_y: number;
  angle_deg: number;
};

const SEGMENTS_PER_ARC = 24;
const COORD_TOLERANCE = 1e-6;
const RING_AREA_EPS = 1e-6;
const KEY_PRECISION = 6;
const OUTPUT_PRECISION = 2;

function pointKey(point: Point, precision = KEY_PRECISION) {
  const factor = 10 ** precision;
  const x = Math.round(point[0] * factor);
  const y = Math.round(point[1] * factor);
  return `${x}:${y}`;
}

function pointsEqual(a: Point, b: Point, tolerance = COORD_TOLERANCE) {
  return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance;
}

function ensureClosedRing(ring: Ring): Ring {
  if (!ring.length) return ring;
  const [firstX, firstY] = ring[0];
  const [lastX, lastY] = ring[ring.length - 1];
  if (Math.abs(firstX - lastX) > 1e-6 || Math.abs(firstY - lastY) > 1e-6) {
    return [...ring, [firstX, firstY]];
  }
  return ring;
}

function roundRing(ring: Ring): Ring {
  const factor = 10 ** OUTPUT_PRECISION;
  return ring.map(([x, y]) => [
    Math.round(x * factor) / factor,
    Math.round(y * factor) / factor,
  ]);
}

function ringArea(ring: Ring): number {
  if (ring.length < 3) return 0;
  const closed = ensureClosedRing(ring);
  let area = 0;
  for (let i = 0; i < closed.length - 1; i += 1) {
    const [x1, y1] = closed[i];
    const [x2, y2] = closed[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function normalizeRing(ring: Ring): Ring {
  if (ring.length <= 1) return ring;
  const closed = ensureClosedRing(ring);
  const withoutLast = closed.slice(0, closed.length - 1);
  if (!withoutLast.length) return closed;

  let minIndex = 0;
  let minKey = pointKey(withoutLast[0], OUTPUT_PRECISION);
  withoutLast.forEach((point, idx) => {
    const key = pointKey(point, OUTPUT_PRECISION);
    if (key < minKey) {
      minKey = key;
      minIndex = idx;
    }
  });

  const rotated: Ring = [
    ...withoutLast.slice(minIndex),
    ...withoutLast.slice(0, minIndex),
  ];
  rotated.push(rotated[0]);
  return rotated;
}

function normalizeOrientation(ring: Ring): Ring {
  const area = ringArea(ring);
  if (area < 0) {
    const reversed = [...ring].reverse();
    return ensureClosedRing(reversed);
  }
  return ensureClosedRing(ring);
}

function ringKey(ring: Ring): string {
  return ring.map((point) => pointKey(point, OUTPUT_PRECISION)).join("|");
}

function dedupePolygons(polygons: Ring[]): Ring[] {
  const seen = new Set<string>();
  const result: Ring[] = [];

  polygons.forEach((raw) => {
    const rounded = roundRing(raw);
    const normalizedStart = normalizeRing(rounded);
    const normalized = normalizeOrientation(normalizedStart);
    const key = ringKey(normalized);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  });

  return result;
}

function addSegment(segments: Segment[], start: Point, end: Point) {
  if (pointsEqual(start, end)) return;
  segments.push({ start, end });
}

function flattenMultiPolygon(mp: MultiPolygon | null): Ring[] {
  if (!mp || !Array.isArray(mp)) return [];
  const rings: Ring[] = [];
  mp.forEach((polygon) => {
    if (!polygon || !polygon.length) return;
    const outer = polygon[0];
    if (outer && outer.length >= 3) {
      rings.push(ensureClosedRing(outer as Ring));
    }
  });
  return rings;
}

function approximateArc(
  centerX: number,
  centerY: number,
  radius: number,
  startAngleDeg: number,
  endAngleDeg: number,
  segments: number = SEGMENTS_PER_ARC
): Ring {
  const startRad = (startAngleDeg * Math.PI) / 180;
  let endRad = (endAngleDeg * Math.PI) / 180;

  if (endRad < startRad) {
    endRad += Math.PI * 2;
  }

  const delta = (endRad - startRad) / segments;
  const points: Ring = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = startRad + delta * i;
    points.push([centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)]);
  }
  return points;
}

function approximateBulge(
  start: Point,
  end: Point,
  bulge: number,
  minSegments = 6
): Ring {
  if (Math.abs(bulge) < COORD_TOLERANCE) {
    return [start, end];
  }

  const [x1, y1] = start;
  const [x2, y2] = end;
  const dx = x2 - x1;
  const dy = y2 - y1;

  const chord = Math.hypot(dx, dy);
  if (!Number.isFinite(chord) || chord === 0) {
    return [start, end];
  }

  const theta = 4 * Math.atan(bulge);
  const radius = chord / (2 * Math.sin(theta / 2));

  const midx = (x1 + x2) / 2;
  const midy = (y1 + y2) / 2;
  const ux = dx / chord;
  const uy = dy / chord;
  const nx = -uy;
  const ny = ux;

  const distanceToCenter = radius * Math.cos(theta / 2);
  const centerX = midx + nx * distanceToCenter * Math.sign(bulge);
  const centerY = midy + ny * distanceToCenter * Math.sign(bulge);

  const startAngle = Math.atan2(y1 - centerY, x1 - centerX);
  let endAngle = Math.atan2(y2 - centerY, x2 - centerX);

  if (bulge > 0 && endAngle <= startAngle) {
    endAngle += Math.PI * 2;
  } else if (bulge < 0 && endAngle >= startAngle) {
    endAngle -= Math.PI * 2;
  }

  const sweep = endAngle - startAngle;
  const segmentCount = Math.max(minSegments, Math.ceil((Math.abs(sweep) / (Math.PI / 12))));
  const delta = sweep / segmentCount;

  const points: Ring = [];
  for (let i = 0; i <= segmentCount; i += 1) {
    const angle = startAngle + delta * i;
    points.push([centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)]);
  }
  return points;
}

function expandPolylineVertices(
  vertices: Array<{ x: number; y: number; bulge?: number }>,
  isClosed: boolean
): Ring {
  if (!vertices.length) return [];
  const points: Point[] = [];

  const count = vertices.length;
  for (let i = 0; i < count; i += 1) {
    const current = vertices[i];
    const next = vertices[(i + 1) % count];
    const currentPoint: Point = [current.x, current.y];
    const nextPoint: Point = [next.x, next.y];

    points.push(currentPoint);

    const bulge = current.bulge ?? 0;
    if (Math.abs(bulge) > COORD_TOLERANCE) {
      const arcPoints = approximateBulge(currentPoint, nextPoint, bulge);
      arcPoints.slice(1, -1).forEach((p) => points.push(p));
    }

    if (!isClosed && i === count - 1) {
      points.push(nextPoint);
    }
  }

  return points;
}

function buildPolygonsFromSegments(segments: Segment[]): Ring[] {
  if (!segments.length) return [];

  const adjacency = new Map<string, number[]>();
  const pointsMap = new Map<string, Point>();

  segments.forEach((segment, idx) => {
    const startKey = pointKey(segment.start);
    const endKey = pointKey(segment.end);
    if (startKey === endKey) return;

    if (!adjacency.has(startKey)) adjacency.set(startKey, []);
    if (!adjacency.has(endKey)) adjacency.set(endKey, []);
    adjacency.get(startKey)!.push(idx);
    adjacency.get(endKey)!.push(idx);

    if (!pointsMap.has(startKey)) pointsMap.set(startKey, segment.start);
    if (!pointsMap.has(endKey)) pointsMap.set(endKey, segment.end);
  });

  const used = new Array(segments.length).fill(false);
  const rings: Ring[] = [];

  segments.forEach((segment, idx) => {
    if (used[idx]) return;

    const currentSegment = segments[idx];
    used[idx] = true;

    const loop: Point[] = [currentSegment.start, currentSegment.end];
    let currentPoint = currentSegment.end;
    const startPoint = currentSegment.start;

    let steps = 0;
    const maxSteps = segments.length * 4;

    while (steps < maxSteps) {
      steps += 1;

      if (pointsEqual(currentPoint, startPoint)) {
        loop[loop.length - 1] = startPoint;
        break;
      }

      const key = pointKey(currentPoint);
      const connected = adjacency.get(key) ?? [];
      let advanced = false;

      for (const connectedIdx of connected) {
        if (used[connectedIdx]) continue;
        const nextSeg = segments[connectedIdx];
        let nextPoint: Point | null = null;
        if (pointsEqual(currentPoint, nextSeg.start)) {
          nextPoint = nextSeg.end;
        } else if (pointsEqual(currentPoint, nextSeg.end)) {
          nextPoint = nextSeg.start;
        }
        if (!nextPoint) {
          continue;
        }

        used[connectedIdx] = true;
        loop.push(nextPoint);
        currentPoint = nextPoint;
        advanced = true;
        break;
      }

      if (!advanced) {
        break;
      }
    }

    if (loop.length >= 4 && pointsEqual(loop[0], loop[loop.length - 1])) {
      const rounded = roundRing(loop);
      const closed = ensureClosedRing(rounded);
      const area = Math.abs(ringArea(closed));
      if (area > RING_AREA_EPS) {
        rings.push(closed);
      }
    }
  });

  return rings;
}

export async function parseDxfFile(file: File): Promise<Ring[]> {
  const content = await file.text();
  return parseDxfContent(content);
}

export async function parseDxfContent(content: string): Promise<Ring[]> {
  const parser = new Parser();
  const dxf = await parser.parse(content);
  const polygons: Ring[] = [];
  const segments: Segment[] = [];

  const entities = dxf.entities ?? {};

  const lwPolylines: LWPolylineEntity[] = entities.lwPolylines ?? [];
  lwPolylines.forEach((entity) => {
    if (!entity?.vertices?.length) return;
    const isClosed =
      Boolean((entity.flag ?? 0) & 1) ||
      pointsEqual(
        [entity.vertices[0].x, entity.vertices[0].y],
        [entity.vertices[entity.vertices.length - 1].x, entity.vertices[entity.vertices.length - 1].y]
      );

    const expanded = expandPolylineVertices(entity.vertices, isClosed);

    if (isClosed) {
      polygons.push(ensureClosedRing(expanded));
    } else {
      for (let i = 0; i < expanded.length - 1; i += 1) {
        addSegment(segments, expanded[i], expanded[i + 1]);
      }
    }
  });

  const polylines: PolylineEntity[] = entities.polylines ?? [];
  polylines.forEach((polyline) => {
    if (!polyline?.vertices?.length) return;
    const isClosed =
      Boolean((polyline.flag ?? 0) & 1) ||
      pointsEqual(
        [polyline.vertices[0].x, polyline.vertices[0].y],
        [polyline.vertices[polyline.vertices.length - 1].x, polyline.vertices[polyline.vertices.length - 1].y]
      );
    const expanded = expandPolylineVertices(polyline.vertices, isClosed);

    if (isClosed) {
      polygons.push(ensureClosedRing(expanded));
    } else {
      for (let i = 0; i < expanded.length - 1; i += 1) {
        addSegment(segments, expanded[i], expanded[i + 1]);
      }
    }
  });

  const lines: LineEntity[] = entities.lines ?? [];
  lines.forEach((line) => {
    const start: Point = [line.startX ?? 0, line.startY ?? 0];
    const end: Point = [line.endX ?? 0, line.endY ?? 0];
    addSegment(segments, start, end);
  });

  const arcs: ArcEntity[] = entities.arcs ?? [];
  arcs.forEach((arc) => {
    const radius = arc.radius ?? 0;
    if (!radius) return;
    const points = approximateArc(
      arc.center?.x ?? 0,
      arc.center?.y ?? 0,
      radius,
      arc.startAngle ?? 0,
      arc.endAngle ?? 0,
      SEGMENTS_PER_ARC
    );
    for (let i = 0; i < points.length - 1; i += 1) {
      addSegment(segments, points[i], points[i + 1]);
    }
  });

  const circles = entities.circles ?? [];
  circles.forEach((circle) => {
    const radius = circle.radius ?? 0;
    if (!radius) return;
    const points = approximateArc(
      circle.center?.x ?? 0,
      circle.center?.y ?? 0,
      radius,
      0,
      360,
      SEGMENTS_PER_ARC
    );
    polygons.push(ensureClosedRing(points));
  });

  const segmentPolygons = buildPolygonsFromSegments(segments);
  polygons.push(...segmentPolygons);

  const deduped = dedupePolygons(polygons);
  if (!deduped.length) {
    throw new Error("Не удалось извлечь полигоны из DXF.");
  }

  return deduped;
}

export function generateCuttingPlan(polygons: Ring[], params: CuttingParams): Ring[] {
  const { tile_w, tile_h, seam, start_x, start_y, angle_deg } = params;

  if (!polygons.length) {
    throw new Error("Нет корректных полигонов из DXF.");
  }

  const { minX, minY, maxX, maxY } = (function polygonBounds(polys: Ring[]) {
    let minPx = Number.POSITIVE_INFINITY;
    let minPy = Number.POSITIVE_INFINITY;
    let maxPx = Number.NEGATIVE_INFINITY;
    let maxPy = Number.NEGATIVE_INFINITY;

    polys.forEach((ring) => {
      ring.forEach(([x, y]) => {
        minPx = Math.min(minPx, x);
        minPy = Math.min(minPy, y);
        maxPx = Math.max(maxPx, x);
        maxPy = Math.max(maxPy, y);
      });
    });

    if (!Number.isFinite(minPx) || !Number.isFinite(minPy) || !Number.isFinite(maxPx) || !Number.isFinite(maxPy)) {
      throw new Error("DXF не содержит координат для построения полигона.");
    }

    return { minX: minPx, minY: minPy, maxX: maxPx, maxY: maxPy };
  })(polygons);

  const maxDim = Math.max(maxX - minX, maxY - minY);
  const angleRad = (angle_deg * Math.PI) / 180;

  const stepX = (tile_w + seam) * Math.cos(angleRad);
  const stepY = (tile_w + seam) * Math.sin(angleRad);
  const offsetX = (tile_h + seam) * Math.sin(angleRad);
  const offsetY = -(tile_h + seam) * Math.cos(angleRad);

  const originX = start_x;
  const originY = start_y;

  const numTiles = Math.max(
    1,
    Math.floor((maxDim * 2) / Math.min(tile_w + seam, tile_h + seam)) + 10
  );

  const areaPolygons = polygons.map((ring) => ensureClosedRing(ring));
  const results: Ring[] = [];

  for (let row = -numTiles; row < numTiles; row += 1) {
    for (let col = -numTiles; col < numTiles; col += 1) {
      const cx = originX + stepX * col + offsetX * row;
      const cy = originY + stepY * col + offsetY * row;

      const corners: Ring = [
        [cx, cy],
        [
          cx + tile_w * Math.cos(angleRad),
          cy + tile_w * Math.sin(angleRad),
        ],
        [
          cx + tile_w * Math.cos(angleRad) - tile_h * Math.sin(angleRad),
          cy + tile_w * Math.sin(angleRad) + tile_h * Math.cos(angleRad),
        ],
        [
          cx - tile_h * Math.sin(angleRad),
          cy + tile_h * Math.cos(angleRad),
        ],
      ];

      const tileRing = ensureClosedRing(corners);
      const tileMulti: MultiPolygon = [[tileRing]];

      let clipped = false;
      areaPolygons.forEach((area) => {
        const areaMulti: MultiPolygon = [[area]];
        const intersection = flattenMultiPolygon(
          martinez.intersection(tileMulti, areaMulti) as MultiPolygon | null
        );
        if (intersection.length) {
          clipped = true;
          intersection.forEach((ring) => {
            if (ring.length >= 4) {
              results.push(roundRing(ring));
            }
          });
        }
      });

      if (!clipped) continue;
    }
  }

  return results;
}

export async function processDxfOnClient(file: File, params: CuttingParams): Promise<Ring[]> {
  const polygons = await parseDxfFile(file);
  return generateCuttingPlan(polygons, params);
}
