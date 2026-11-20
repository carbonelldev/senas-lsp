// Página "Proceso": navegar entre pasos como en una presentación (← →, botones, puntos),
// pantalla completa y los esqueletos girados/espejados del paso de aumento de datos.
import { Esqueleto } from "../lib/esqueleto";
import { cargarMuestras } from "../lib/mano";
import { $, $$, type Limpieza } from "../lib/pagina";

const SIGUIENTE = new Set(["ArrowRight", "ArrowDown", "PageDown", " "]);
const ANTERIOR = new Set(["ArrowLeft", "ArrowUp", "PageUp"]);

export function montarProceso(root: HTMLElement): Limpieza {
  const limpiezas: Limpieza[] = [];
  const pasos = $$(root, "[data-slide]");
  const contador = $(root, "[data-contador]");
  const anterior = $<HTMLButtonElement>(root, "[data-anterior]");
  const siguiente = $<HTMLButtonElement>(root, "[data-siguiente]");
  const puntos = $(root, "[data-puntos]");
  const total = pasos.length - 1;
  const dos = (n: number) => String(n).padStart(2, "0");
  let actual = 0;

  // ----- puntos laterales -----
  const botones = pasos.map((p, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.tip = i ? `${dos(i)} · ${p.dataset.titulo}` : "Inicio";
    b.setAttribute("aria-label", b.dataset.tip);
    b.className = "w-1.5 rounded-full bg-line-2 transition-all duration-300 hover:bg-dim aria-[current=step]:bg-accent";
    b.style.height = "6px";
    b.addEventListener("click", () => ir(i));
    puntos.appendChild(b);
    return b;
  });

  function marcar(i: number) {
    actual = i;
    contador.textContent = `${dos(i)} / ${dos(total)}`;
    anterior.disabled = i === 0;
    siguiente.disabled = i === total;
    botones.forEach((b, k) => {
      b.setAttribute("aria-current", k === i ? "step" : "false");
      b.style.height = k === i ? "20px" : "6px";
    });
  }

  /** El paso que ocupa la mitad de la pantalla. */
  function pasoVisible() {
    const mitad = innerHeight / 2;
    const i = pasos.findIndex((p) => {
      const r = p.getBoundingClientRect();
      return r.top <= mitad && r.bottom > mitad;
    });
    return i === -1 ? actual : i;
  }

  // Mientras dura un desplazamiento hecho con las flechas, el paso actual es el de destino:
  // los pasos que se cruzan por el camino no cuentan. Sin esto, al pulsar rápido varias veces
  // se calculaba el siguiente a partir de un paso intermedio y la página saltaba de un lado a otro.
  let navegando = false;
  let finNav = 0;
  const terminar = () => {
    navegando = false;
    clearTimeout(finNav);
  };

  function ir(i: number) {
    const k = Math.max(0, Math.min(total, i));
    navegando = true;
    marcar(k);
    const suave = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    pasos[k].scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
    clearTimeout(finNav);
    finNav = window.setTimeout(terminar, 700); // por si no hay scroll (ya estaba ahí)
  }

  let cuadro = 0;
  const onScroll = () => {
    if (navegando) {
      // termina cuando el scroll lleva un momento quieto (scrollend no existe en todos los navegadores)
      clearTimeout(finNav);
      finNav = window.setTimeout(terminar, 160);
      return;
    }
    cuadro ||= requestAnimationFrame(() => {
      cuadro = 0;
      const i = pasoVisible();
      if (i !== actual) marcar(i);
    });
  };
  addEventListener("scroll", onScroll, { passive: true });
  limpiezas.push(() => {
    removeEventListener("scroll", onScroll);
    cancelAnimationFrame(cuadro);
    clearTimeout(finNav);
  });
  marcar(pasoVisible());

  anterior.addEventListener("click", () => ir(actual - 1));
  siguiente.addEventListener("click", () => ir(actual + 1));

  const onKey = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, textarea, select, [contenteditable], [role=listbox]")) return;
    if (t?.closest("button, a") && (e.key === " " || e.key === "Enter")) return;
    if (SIGUIENTE.has(e.key)) ir(actual + 1);
    else if (ANTERIOR.has(e.key)) ir(actual - 1);
    else if (e.key === "Home") ir(0);
    else if (e.key === "End") ir(total);
    else return;
    e.preventDefault();
  };
  document.addEventListener("keydown", onKey);
  limpiezas.push(() => document.removeEventListener("keydown", onKey));

  // ----- pantalla completa -----
  const presentar = $$<HTMLButtonElement>(root, "[data-presentar]");
  if (document.fullscreenEnabled) {
    for (const b of presentar) {
      b.addEventListener("click", () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen({ navigationUI: "hide" }).then(() => ir(Math.max(actual, 1))).catch(console.error);
      });
    }
    const onFs = () => {
      const on = !!document.fullscreenElement;
      $$(root, "[data-presentar-texto]").forEach((s) => (s.textContent = on ? "Salir" : "Presentar"));
    };
    document.addEventListener("fullscreenchange", onFs);
    limpiezas.push(() => {
      document.removeEventListener("fullscreenchange", onFs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    });
  } else {
    presentar.forEach((b) => (b.hidden = true));
  }

  // ----- esqueletos girados / espejados -----
  const lienzos = $$<HTMLCanvasElement>(root, "canvas[data-mano]");
  let vivo = true;
  limpiezas.push(() => (vivo = false));
  cargarMuestras().then((m) => {
    if (!vivo) return;
    for (const c of lienzos) {
      const pts = m[c.dataset.mano!];
      if (!pts) continue;
      const esq = new Esqueleto(c, { margen: 0.2, grosor: 3, radio: 4 });
      esq.espejo = c.hasAttribute("data-espejo");
      esq.mostrar(girar(pts, Number(c.dataset.rot ?? 0)), true);
    }
  });

  return () => limpiezas.forEach((f) => f());
}

/** Gira los puntos en el plano de la imagen alrededor de su centro (grados). */
function girar(pts: [number, number][], grados: number): [number, number][] {
  if (!grados) return pts;
  const a = (grados * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const cx = pts.reduce((t, p) => t + p[0], 0) / pts.length;
  const cy = pts.reduce((t, p) => t + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}
