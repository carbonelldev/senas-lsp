// node scripts/probar-clasificador.ts  -> compara clasificador.ts con Python
import { readFileSync } from "node:fs";
import { classify, featuresOf, normalize, type Meta, type P3 } from "../src/lib/clasificador.ts";
const meta: Meta = JSON.parse(readFileSync(new URL("../public/model/puntos.json", import.meta.url), "utf8"));
const casos = JSON.parse(readFileSync(new URL("./casos_prueba.json", import.meta.url), "utf8"));
let maxDiff = 0, same = 0;
casos.pts.forEach((pts: P3[], i: number) => {
  const p = classify(meta, featuresOf(normalize(pts), meta.pairs));
  const q: number[] = casos.probs[i];
  p.forEach((v, j) => (maxDiff = Math.max(maxDiff, Math.abs(v - q[j]))));
  if (p.indexOf(Math.max(...p)) === q.indexOf(Math.max(...q))) same++;
});
console.log(`casos ${casos.pts.length} | misma letra ${same} | diferencia max ${maxDiff.toExponential(2)}`);
if (same !== casos.pts.length || maxDiff > 1e-6) process.exit(1);
