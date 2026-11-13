// Ciclo de vida con el ClientRouter de Astro: montar al entrar en la pagina,
// limpiar (camara, bucles) al salir.

export type Limpieza = () => void;

export function enPagina(selector: string, montar: (root: HTMLElement) => Limpieza | void) {
  let limpiar: Limpieza | void;
  const correr = () => {
    limpiar?.();
    limpiar = undefined;
    const root = document.querySelector<HTMLElement>(selector);
    if (root) limpiar = montar(root);
  };
  document.addEventListener("astro:page-load", correr);
  document.addEventListener("astro:before-swap", () => {
    limpiar?.();
    limpiar = undefined;
  });
}

/** requestAnimationFrame en bucle; devuelve la funcion para pararlo. */
export function bucle(fn: (now: number) => void): Limpieza {
  let id = 0;
  const paso = (now: number) => {
    fn(now);
    id = requestAnimationFrame(paso);
  };
  id = requestAnimationFrame(paso);
  return () => cancelAnimationFrame(id);
}

export const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Falta ${sel}`);
  return el;
};
export const $$ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => [...root.querySelectorAll<T>(sel)];
