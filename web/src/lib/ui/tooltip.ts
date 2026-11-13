// Tooltip global para cualquier [data-tip="texto"] (reemplaza al title nativo).
// Se muestra al pasar el raton o al enfocar; se coloca encima y, si no cabe, debajo.
import type { Limpieza } from "../pagina";

let tip: HTMLElement | null = null;
let actual: HTMLElement | null = null;

function elemento() {
  if (tip?.isConnected) return tip;
  tip = document.createElement("div");
  tip.className = "tooltip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.appendChild(tip);
  return tip;
}

function colocar() {
  if (!actual || !tip || tip.hidden) return;
  const r = actual.getBoundingClientRect();
  const tr = tip.getBoundingClientRect();
  const arriba = r.top - tr.height - 8 >= 8;
  const y = arriba ? r.top - tr.height - 8 : r.bottom + 8;
  const x = Math.min(Math.max(8, r.left + r.width / 2 - tr.width / 2), innerWidth - tr.width - 8);
  tip.dataset.side = arriba ? "top" : "bottom";
  tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

function mostrar(target: HTMLElement) {
  const t = elemento();
  actual = target;
  t.textContent = target.dataset.tip ?? "";
  t.hidden = false;
  delete t.dataset.open;
  colocar();
  setTimeout(() => actual === target && (t.dataset.open = ""), 0);
}

function ocultar() {
  actual = null;
  if (!tip) return;
  delete tip.dataset.open;
  tip.hidden = true;
}

export function tooltips(): Limpieza {
  const over = (e: Event) => {
    const t = (e.target as Element | null)?.closest?.<HTMLElement>("[data-tip]") ?? null;
    if (t && t !== actual) mostrar(t);
    else if (!t && actual) ocultar();
  };
  const out = (e: PointerEvent) => {
    if (actual && !actual.contains(e.relatedTarget as Node | null)) ocultar();
  };
  const esc = (e: KeyboardEvent) => e.key === "Escape" && ocultar();
  document.addEventListener("pointerover", over);
  document.addEventListener("pointerout", out);
  document.addEventListener("pointerdown", ocultar);
  document.addEventListener("focusin", over);
  document.addEventListener("focusout", ocultar);
  document.addEventListener("keydown", esc);
  addEventListener("scroll", colocar, { passive: true, capture: true });
  addEventListener("resize", colocar);
  return () => {
    document.removeEventListener("pointerover", over);
    document.removeEventListener("pointerout", out);
    document.removeEventListener("pointerdown", ocultar);
    document.removeEventListener("focusin", over);
    document.removeEventListener("focusout", ocultar);
    document.removeEventListener("keydown", esc);
    removeEventListener("scroll", colocar, { capture: true });
    removeEventListener("resize", colocar);
  };
}
