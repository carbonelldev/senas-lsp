// Efectos de interfaz: spotlight en tarjetas, aparicion al hacer scroll,
// contadores, cambio de letra con animacion. Sin dependencias.
import { tooltips } from "./ui/tooltip";

const reducido = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Spotlight: guarda la posicion del puntero en --mx/--my de cada .spot. */
export function spotlight(root: ParentNode = document) {
  const onMove = (e: PointerEvent) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>(".spot");
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  (root as Document | HTMLElement).addEventListener("pointermove", onMove as EventListener, { passive: true });
  return () => (root as Document | HTMLElement).removeEventListener("pointermove", onMove as EventListener);
}

/** Scroll reveal para .reveal (con --i como indice de retardo). */
export function revelar(root: ParentNode = document) {
  const els = [...root.querySelectorAll<HTMLElement>(".reveal")];
  if (reducido() || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("in"));
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
  );
  els.forEach((el) => io.observe(el));
  return () => io.disconnect();
}

/** Contadores: [data-count="76"] [data-suffix=" %"] suben desde 0 al entrar en pantalla. */
export function contadores(root: ParentNode = document) {
  const els = [...root.querySelectorAll<HTMLElement>("[data-count]")];
  const pintar = (el: HTMLElement, v: number) => {
    const dec = Number(el.dataset.decimals ?? 0);
    el.textContent = v.toFixed(dec).replace(".", ",") + (el.dataset.suffix ?? "");
  };
  if (reducido() || !("IntersectionObserver" in window)) {
    els.forEach((el) => pintar(el, Number(el.dataset.count)));
    return () => {};
  }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      const el = en.target as HTMLElement;
      const fin = Number(el.dataset.count);
      const t0 = performance.now();
      const dur = 1100;
      const paso = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 4);
        pintar(el, fin * e);
        if (p < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    }
  });
  els.forEach((el) => io.observe(el));
  return () => io.disconnect();
}

/**
 * Cambia el texto de una letra grande con una animacion de entrada (solo si cambia).
 * La animacion va en el [data-letter-anim] mas cercano si existe: el blur del filtro
 * rompe el texto con degradado (background-clip: text) si se aplica al mismo elemento.
 */
export function ponerLetra(el: HTMLElement, letra: string) {
  if (el.textContent === letra) return;
  el.textContent = letra;
  const anim = el.closest<HTMLElement>("[data-letter-anim]") ?? el;
  anim.classList.remove("animate-letter-in");
  void anim.offsetWidth; // reinicia la animacion
  anim.classList.add("animate-letter-in");
}

/** Mueve un indicador absoluto hasta el elemento activo (pastilla que se desliza). */
export function moverIndicador(indicador: HTMLElement, destino: HTMLElement | null) {
  if (!destino) {
    indicador.style.opacity = "0";
    return;
  }
  const padre = indicador.offsetParent as HTMLElement | null;
  const pr = padre?.getBoundingClientRect() ?? { left: 0, top: 0 };
  const r = destino.getBoundingClientRect();
  indicador.style.opacity = "1";
  indicador.style.transform = `translate(${r.left - pr.left}px, ${r.top - pr.top}px)`;
  indicador.style.width = `${r.width}px`;
  indicador.style.height = `${r.height}px`;
}

export function iniciarFx() {
  tooltips(); // delegacion global: sobrevive a los cambios de pagina
  // Al terminar una animacion de entrada se quita del elemento: con fill-mode el filter
  // se queda en blur(0px), que crea un stacking context y atraparia los desplegables de dentro.
  const quitarEntrada = (el: Element) => ((el as HTMLElement).style.animation = "none");
  document.addEventListener("animationend", (e) => {
    if (e.animationName === "blur-in") quitarEntrada(e.target as HTMLElement);
  });
  let limpiar: Array<() => void> = [];
  const correr = () => {
    limpiar.forEach((f) => f());
    // red de seguridad por si algun animationend no llega (pestaña en segundo plano, etc.)
    const t = window.setTimeout(() => document.querySelectorAll(".animate-blur-in").forEach(quitarEntrada), 1600);
    limpiar = [spotlight(), revelar(), contadores(), () => clearTimeout(t)];
  };
  document.addEventListener("astro:page-load", correr);
}
