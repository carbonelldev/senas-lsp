// Pastilla de estado de la barra superior (components/StatusPill.astro).
export type Estado = "loading" | "ready" | "live" | "error";

export function ponerEstado(texto: string, estado: Estado) {
  const el = document.getElementById("status");
  if (!el) return;
  el.dataset.state = estado;
  const t = el.querySelector("[data-text]");
  if (t) t.textContent = texto;
}
