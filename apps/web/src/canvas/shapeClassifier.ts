import type { ModuleKind, NodeType } from "@march/spec-schema";

export interface Point {
  x: number;
  y: number;
}

/** Douglas-Peucker path simplification -- keeps only the points that matter for corner-counting. */
export function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;

  const sqDistToSegment = (p: Point, a: Point, b: Point): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) {
      return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
    }
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
    const clamped = Math.max(0, Math.min(1, t));
    const projX = a.x + clamped * dx;
    const projY = a.y + clamped * dy;
    return (p.x - projX) ** 2 + (p.y - projY) ** 2;
  };

  const recurse = (pts: Point[]): Point[] => {
    if (pts.length < 3) return pts;
    const [first, last] = [pts[0], pts[pts.length - 1]];
    let maxDist = -1;
    let maxIndex = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = sqDistToSegment(pts[i], first, last);
      if (d > maxDist) {
        maxDist = d;
        maxIndex = i;
      }
    }
    if (maxDist > epsilon * epsilon) {
      const left = recurse(pts.slice(0, maxIndex + 1));
      const right = recurse(pts.slice(maxIndex));
      return [...left.slice(0, -1), ...right];
    }
    return [first, last];
  };

  return recurse(points);
}

export interface ClassifiedShape {
  shape: HandDrawShape;
  confidence: number;
}

export type HandDrawShape =
  | "rectangle"
  | "square"
  | "circle"
  | "triangle"
  | "diamond"
  | "swirl"
  | "v"
  | "lambda"
  | "e";

/**
 * Every hand-drawable shape maps to exactly one node type -- a geometric
 * shortcut per type. Backend gets the full nine-shape vocabulary; frontend
 * reuses four of the same gestures (component/store/api_client/page echo
 * entity/database/external/implementation's shapes -- "a box", "a round
 * vessel", "pointing outward", "a container"), since the classifier itself
 * is generic path geometry with no notion of node types. The remaining five
 * gestures (diamond/swirl/v/lambda/e) don't have a clean frontend concept to
 * map to, so they're simply not recognized for frontend modules yet.
 */
export const HAND_DRAW_MAP: Record<ModuleKind, Partial<Record<HandDrawShape, NodeType>>> = {
  backend: {
    rectangle: "entity",
    square: "implementation",
    circle: "database",
    triangle: "external",
    diamond: "interface",
    swirl: "queue",
    v: "input",
    lambda: "output",
    e: "endpoint",
  },
  frontend: {
    rectangle: "component",
    square: "page",
    circle: "store",
    triangle: "api_client",
  },
};

function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

function perimeter(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

function isClosedPath(points: Point[], closeThreshold: number): boolean {
  const first = points[0];
  const last = points[points.length - 1];
  return Math.hypot(last.x - first.x, last.y - first.y) <= closeThreshold;
}

/** Drops a trailing point that's just re-closing the loop near the start, so corner analysis doesn't double it up. */
function dropClosingDuplicate(points: Point[], closeThreshold: number): Point[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.hypot(last.x - first.x, last.y - first.y) < closeThreshold) {
    return points.slice(0, -1);
  }
  return points;
}

/** Signed turning angle in degrees from vector (prev->curr) to (curr->next). */
function turnDeg(prev: Point, curr: Point, next: Point): number {
  const v1 = { x: curr.x - prev.x, y: curr.y - prev.y };
  const v2 = { x: next.x - curr.x, y: next.y - curr.y };
  if ((v1.x === 0 && v1.y === 0) || (v2.x === 0 && v2.y === 0)) return 0;
  const rad = Math.atan2(v1.x * v2.y - v1.y * v2.x, v1.x * v2.x + v1.y * v2.y);
  return (rad * 180) / Math.PI;
}

/** Sum of signed turning angle across the whole stroke -- how many times (and which way) it winds around. */
function totalTurningDeg(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length - 1; i++) {
    total += turnDeg(points[i - 1], points[i], points[i + 1]);
  }
  return total;
}

/** Corners whose turning angle clears the noise threshold -- filters out hand-tremor micro-corners. */
function significantCorners(points: Point[], closed: boolean, thresholdDeg: number): { point: Point; turn: number }[] {
  const n = points.length;
  if (n < 3) return [];
  const start = closed ? 0 : 1;
  const end = closed ? n : n - 1;
  const result: { point: Point; turn: number }[] = [];
  for (let i = start; i < end; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i % n];
    const next = points[(i + 1) % n];
    const turn = turnDeg(prev, curr, next);
    if (Math.abs(turn) >= thresholdDeg) {
      result.push({ point: curr, turn });
    }
  }
  return result;
}

/**
 * Classifies a completed freehand stroke into one of nine geometric shapes
 * (see HandDrawShape), or returns null if it doesn't confidently match any
 * of them. Purely geometric -- has no notion of node types or module kind at
 * all; HAND_DRAW_MAP is what a caller uses to translate the result into an
 * actual node type for the module it's drawing into. No ML -- pure path
 * geometry:
 *  - total turning angle (how many times the stroke winds around) separates
 *    a spiral/swirl (multiple loops) from a cursive "e" (about one loop, but
 *    open -- start and end don't meet) from a closed loop (circle)
 *  - corner count (after filtering hand-tremor noise by turn-angle
 *    significance, not just Douglas-Peucker distance) distinguishes
 *    triangle/quad/circle for closed shapes, and V from Λ for open ones
 *    (same single-corner shape, just which way the point faces)
 */
export function classifyStroke(rawPoints: Point[]): ClassifiedShape | null {
  if (rawPoints.length < 6) return null;

  const xs = rawPoints.map((p) => p.x);
  const ys = rawPoints.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX;
  const height = Math.max(...ys) - minY;
  const size = Math.max(width, height);
  if (size < 20) return null;

  const closed = isClosedPath(rawPoints, size * 0.22);

  // Fine simplification preserves enough curvature to measure winding and
  // self-intersection; coarse simplification is for corner-counting.
  const finePoints = dropClosingDuplicate(simplify(rawPoints, size * 0.025), size * 0.1);
  const coarsePoints = dropClosingDuplicate(simplify(rawPoints, size * 0.08), size * 0.1);

  // Winding more than ~1.3 loops is deliberate spiraling, not just a sloppy circle.
  const totalTurn = Math.abs(totalTurningDeg(finePoints));
  if (totalTurn > 470) {
    return { shape: "swirl", confidence: Math.min(1, totalTurn / 720) };
  }

  const corners = significantCorners(coarsePoints, closed, 30);
  const cornerCount = corners.length;

  if (!closed) {
    // One sharp corner: V (point faces down, i.e. below the start/end baseline)
    // or Λ (point faces up) -- same shape, just which way it opens.
    if (cornerCount === 1) {
      const start = coarsePoints[0];
      const end = coarsePoints[coarsePoints.length - 1];
      const baselineY = (start.y + end.y) / 2;
      const apexY = corners[0].point.y;
      if (apexY > baselineY + size * 0.08) {
        return { shape: "v", confidence: 0.75 };
      }
      if (apexY < baselineY - size * 0.08) {
        return { shape: "lambda", confidence: 0.75 };
      }
      return null;
    }
    // No single sharp corner (a smooth curve simplifies to several moderate
    // corners, not one), but wound around close to a full loop without
    // closing (start and end don't meet) -- an open loop, like a cursive "e".
    if (cornerCount !== 1 && totalTurn > 180) {
      return { shape: "e", confidence: Math.min(1, totalTurn / 360) };
    }
    return null;
  }

  const area = polygonArea(coarsePoints);
  const perim = perimeter(coarsePoints);
  const circularity = perim > 0 ? (4 * Math.PI * area) / (perim * perim) : 0;

  if (cornerCount <= 2 && circularity > 0.7) {
    return { shape: "circle", confidence: circularity };
  }

  if (cornerCount === 3) {
    return { shape: "triangle", confidence: 0.8 };
  }

  if (cornerCount === 4) {
    const cx = minX + width / 2;
    const cy = minY + height / 2;
    const bboxCorners = [
      { x: minX, y: minY },
      { x: minX + width, y: minY },
      { x: minX + width, y: minY + height },
      { x: minX, y: minY + height },
    ];
    const edgeMidpoints = [
      { x: cx, y: minY },
      { x: minX + width, y: cy },
      { x: cx, y: minY + height },
      { x: minX, y: cy },
    ];
    const distTo = (pts: Point[], p: Point) => Math.min(...pts.map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
    const distToCorners = corners.reduce((sum, c) => sum + distTo(bboxCorners, c.point), 0);
    const distToMidpoints = corners.reduce((sum, c) => sum + distTo(edgeMidpoints, c.point), 0);

    if (distToMidpoints < distToCorners) {
      return { shape: "diamond", confidence: 0.7 };
    }
    const aspect = Math.min(width, height) / Math.max(width, height);
    if (aspect > 0.82) {
      return { shape: "square", confidence: 0.7 };
    }
    return { shape: "rectangle", confidence: 0.75 };
  }

  // Noisy strokes that simplified to more than 4 corners but are still round.
  if (circularity > 0.6) {
    return { shape: "circle", confidence: circularity };
  }

  return null;
}
