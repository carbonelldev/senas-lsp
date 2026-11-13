// Mismo calculo que train/entrenar_puntos.py (features + modelo exportado a JSON).

export type Layer = { W: number[][]; b: number[]; act: "relu" | "softmax" };
export type Meta = {
  classes: string[];
  model: string;
  mean: number[];
  scale: number[];
  layers: Layer[];
  pairs: [number, number][];
  metrics: { cv10: number; newBackground: number; detected: number };
};
export type P3 = [number, number, number];

/** Puntos de MediaPipe (0..1) a pixeles; z usa la misma escala que x. */
export function toPixels(lms: { x: number; y: number; z: number }[], w: number, h: number): P3[] {
  return lms.map((p) => [p.x * w, p.y * h, p.z * w]);
}

/** Muneca en el origen y tamano de la palma = 1. */
export function normalize(pts: P3[]): P3[] {
  const [x0, y0, z0] = pts[0];
  const p = pts.map(([x, y, z]) => [x - x0, y - y0, z - z0] as P3);
  const s = [5, 9, 13, 17].reduce((a, j) => a + Math.hypot(p[j][0], p[j][1]), 0) / 4;
  const k = 1 / Math.max(s, 1e-6);
  return p.map(([x, y, z]) => [x * k, y * k, z * k]);
}

export function featuresOf(p: P3[], pairs: [number, number][]) {
  const f: number[] = [];
  for (let i = 1; i < 21; i++) f.push(p[i][0], p[i][1], p[i][2]);
  for (const [a, b] of pairs) f.push(Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1], p[a][2] - p[b][2]));
  return f;
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
