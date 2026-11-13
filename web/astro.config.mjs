import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Huella de los archivos del modelo: se añade a su URL (?v=...) para que, al reentrenar,
// ni el navegador ni la caché de Cloudflare sirvan el modelo anterior.
const huella = createHash("sha256")
  .update(readFileSync(new URL("./public/model/puntos.json", import.meta.url)))
  .update(readFileSync(new URL("./public/model/muestras.json", import.meta.url)))
  .digest("hex")
  .slice(0, 12);

export default defineConfig({
  site: "https://senas-alfabeto.proultro14.workers.dev",
  output: "static",
  trailingSlash: "ignore",
  vite: {
    plugins: [tailwindcss()],
    define: { __MODELO_V__: JSON.stringify(huella) },
    optimizeDeps: { exclude: ["@mediapipe/tasks-vision"] },
  },
});
