// Mismo calculo que train/caracteristicas.py + el modelo exportado a public/model/puntos.json.
// Si cambia uno, hay que cambiar el otro y regenerar scripts/casos_prueba.json (`npm test`).

export type Layer = { W: number[][]; b: number[]; act: "relu" | "softmax" };
export type Meta = {
  classes: string[];
  model: string;
  /** Version de las caracteristicas: 1 = coordenadas + distancias; 2 = + angulos. */
  features?: 1 | 2;
  mean: number[];
  scale: number[];
  layers: Layer[];
  pairs: [number, number][];
  metrics: { cv10: number; newBackground: number; detected: number; newAngle?: number };
};
export type P3 = [number, number, number];

const PALMA = [5, 9, 13, 17];
const CHAINS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]];
const JOINTS = CHAINS.flatMap((c) => [1, 2, 3].map((k) => [c[k - 1], c[k], c[k + 1]] as const));
const SPREAD = [[[1, 4], [5, 8]], [[5, 8], [9, 12]], [[9, 12], [13, 16]], [[13, 16], [17, 20]]] as const;
const THUMB = [5, 6, 9, 10, 13, 14].map((j) => [4, j] as const);

/** Puntos de MediaPipe (0..1) a pixeles; z usa la misma escala que x. */
export function toPixels(lms: { x: number; y: number; z: number }[], w: number, h: number): P3[] {
  return lms.map((p) => [p.x * w, p.y * h, p.z * w]);
}

/** Muneca en el origen y tamano de la palma = 1 (v2 lo mide en 3D, v1 en 2D). */
export function normalize(pts: P3[], version: 1 | 2 = 2): P3[] {
  const [x0, y0, z0] = pts[0];
  const p = pts.map(([x, y, z]) => [x - x0, y - y0, z - z0] as P3);
  const s = PALMA.reduce((a, j) => a + Math.hypot(p[j][0], p[j][1], version === 2 ? p[j][2] : 0), 0) / PALMA.length;
  const k = 1 / Math.max(s, 1e-6);
  return p.map(([x, y, z]) => [x * k, y * k, z * k]);
}

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v: P3) => Math.hypot(v[0], v[1], v[2]);
const dist = (a: P3, b: P3) => len(sub(a, b));
const cos = (u: P3, v: P3) => (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / Math.max(len(u) * len(v), 1e-6);

export function featuresOf(p: P3[], pairs: [number, number][], version: 1 | 2 = 2) {
  const f: number[] = [];
  for (let i = 1; i < 21; i++) f.push(p[i][0], p[i][1], p[i][2]);
  for (const [a, b] of pairs) f.push(dist(p[a], p[b]));
  if (version === 2) {
    for (const [a, b, c] of JOINTS) f.push(cos(sub(p[b], p[a]), sub(p[c], p[b]))); // flexion de cada articulacion
    for (const [[a1, a2], [b1, b2]] of SPREAD) f.push(cos(sub(p[a2], p[a1]), sub(p[b2], p[b1]))); // apertura entre dedos
    for (const [a, b] of THUMB) f.push(dist(p[a], p[b])); // donde queda el pulgar
  }
  return f;
}

/** Puntos crudos (en pixeles) -> puntos normalizados + probabilidades de cada letra. */
export function analizar(meta: Meta, pts: P3[]) {
  const version = meta.features ?? 1;
  const p = normalize(pts, version);
  return { p, probs: classify(meta, featuresOf(p, meta.pairs, version)) };
}

export function classify(meta: Meta, feats: number[]) {
  let h = feats.map((v, i) => (v - meta.mean[i]) / meta.scale[i]);
  for (const L of meta.layers) {
    const out = L.b.slice();
    for (let i = 0; i < h.length; i++) {
      const row = L.W[i];
      const v = h[i];
      for (let j = 0; j < out.length; j++) out[j] += v * row[j];
    }
    h = L.act === "relu" ? out.map((v) => Math.max(0, v)) : out;
  }
  const mx = Math.max(...h);
  const e = h.map((v) => Math.exp(v - mx));
  const sum = e.reduce((a, b) => a + b, 0);
  return Float64Array.from(e, (v) => v / sum);
}
