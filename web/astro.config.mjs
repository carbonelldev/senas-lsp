import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://senas-alfabeto.proultro14.workers.dev",
  output: "static",
  trailingSlash: "ignore",
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: { exclude: ["@mediapipe/tasks-vision"] },
  },
});
