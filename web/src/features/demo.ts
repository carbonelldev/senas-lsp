// Esqueleto que recorre el alfabeto, transformandose de una letra a la siguiente.
import { Esqueleto } from "../lib/esqueleto";
import { ponerLetra } from "../lib/fx";
import { cargarMuestras } from "../lib/mano";
import type { Limpieza } from "../lib/pagina";

export function demoMorph(canvas: HTMLCanvasElement, letra?: HTMLElement | null, cadaMs = 1700): Limpieza {
  const esq = new Esqueleto(canvas, { margen: 0.2, grosor: 3, radio: 4.5 });
  let i = 0;
  let timer = 0;
  let parado = false;
  cargarMuestras().then((m) => {
    if (parado) return;
    const letras = Object.keys(m);
    const paso = () => {
      const l = letras[i++ % letras.length];
      esq.mostrar(m[l]);
      if (letra) ponerLetra(letra, l);
      timer = window.setTimeout(paso, cadaMs);
    };
    paso();
  });
  return () => {
    parado = true;
    clearTimeout(timer);
    esq.limpiar();
  };
}
