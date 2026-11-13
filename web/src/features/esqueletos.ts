// Dibuja el esqueleto de la letra indicada en cada <canvas data-skeleton="X"> de la pagina.
import { Esqueleto } from "../lib/esqueleto";
import { cargarMuestras } from "../lib/mano";

export function iniciarEsqueletos() {
  document.addEventListener("astro:page-load", () => {
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>("canvas[data-skeleton]")];
    if (!canvases.length) return;
    cargarMuestras().then((m) => {
      for (const c of canvases) {
        if (!c.isConnected) continue;
        const pts = m[c.dataset.skeleton!];
        if (pts) new Esqueleto(c, { margen: 0.18, grosor: 3, radio: 4 }).mostrar(pts, true);
      }
    });
  });
}
