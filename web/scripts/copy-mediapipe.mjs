// Copia el runtime WebAssembly de MediaPipe a public/mediapipe para servirlo
// desde el mismo dominio (sin CDN externos).
import { copyFileSync, mkdirSync } from "node:fs";
const src = new URL("../node_modules/@mediapipe/tasks-vision/wasm/", import.meta.url);
const dst = new URL("../public/mediapipe/", import.meta.url);
mkdirSync(dst, { recursive: true });
for (const f of [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
]) {
  copyFileSync(new URL(f, src), new URL(f, dst));
}
console.log("MediaPipe copiado a public/mediapipe");
