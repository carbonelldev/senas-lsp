// Deletreo por mantener la sena. Logica pura (sin DOM): la pagina la pinta con onCambio.
//
// - Una letra se escribe cuando se mantiene `holdMs` con confianza suficiente.
// - Parpadeos de otra letra de menos de GRACIA_MS no reinician la cuenta (el modelo duda a ratos).
// - Para repetir una letra (LL, RR, CC) hay que soltarla: bajar la mano un momento o cambiar de forma.
// - Si se baja la mano mas de `espacioMs` despues de escribir, se pone un espacio (opcional).

import { sugerir } from "../data/palabras.ts";

const GRACIA_MS = 200;

export type Opciones = { conf: number; holdMs: number; espacioAuto: boolean; espacioMs: number };

export class Escritor {
  texto = "";
  private candidata = "";
  private otra = "";
  private otraDesde = 0;
  private inicio = 0;
  private ultimaCoincidencia = 0;
  private liberada = true;
  private ultimaMano = 0;
  private pendienteEspacio = false;

  opts: Opciones;
  private readonly onCambio: (texto: string, escrita?: string) => void;

  constructor(opts: Opciones, onCambio: (texto: string, escrita?: string) => void = () => {}) {
    this.opts = opts;
    this.onCambio = onCambio;
  }

  /** Un fotograma con mano. Devuelve el progreso 0..1 de la letra que se esta manteniendo. */
  tick(letra: string, conf: number, now: number): { progreso: number; letra: string; escrita?: string } {
    this.ultimaMano = now;
    const vista = conf >= this.opts.conf ? letra : "";
    if (vista && vista === this.candidata) {
      this.ultimaCoincidencia = now;
      this.otra = "";
    } else {
      // otra letra (o ninguna): se apunta desde cuando aparece, por si se queda
      if (vista !== this.otra) {
        this.otra = vista;
        this.otraDesde = now;
      }
      if (!this.candidata || now - this.ultimaCoincidencia > GRACIA_MS) {
        // cambio de verdad (no un parpadeo): la nueva cuenta desde que aparecio
        this.candidata = this.otra;
        this.inicio = this.ultimaCoincidencia = this.otraDesde;
        this.otra = "";
        this.liberada = true;
      }
    }
    if (!this.candidata || !this.liberada) return { progreso: 0, letra: this.candidata };
    const p = Math.min(1, (now - this.inicio) / this.opts.holdMs);
    if (p < 1) return { progreso: p, letra: this.candidata };
    this.liberada = false;
    this.pendienteEspacio = true;
    this.poner(this.texto + this.candidata, this.candidata);
    return { progreso: 1, letra: this.candidata, escrita: this.candidata };
  }

  /** Un fotograma sin manos: suelta la letra y, si toca, pone el espacio automatico. */
  sinMano(now: number) {
    if (now - this.ultimaMano > GRACIA_MS) {
      this.candidata = "";
      this.liberada = true;
    }
    if (this.opts.espacioAuto && this.pendienteEspacio && now - this.ultimaMano > this.opts.espacioMs) {
      this.pendienteEspacio = false;
      if (this.texto && !this.texto.endsWith(" ")) this.poner(this.texto + " ");
    }
  }

  espacio() {
    this.pendienteEspacio = false;
    if (this.texto && !this.texto.endsWith(" ")) this.poner(this.texto + " ");
  }

  borrar() {
    this.pendienteEspacio = false;
    this.poner(this.texto.slice(0, -1));
  }

  borrarPalabra() {
    this.pendienteEspacio = false;
    this.poner(this.texto.replace(/\S*\s*$/, ""));
  }

  limpiar() {
    this.pendienteEspacio = false;
    this.poner("");
  }

  /** La palabra que se esta escribiendo (lo que hay despues del ultimo espacio). */
  get palabraActual() {
    return this.texto.split(" ").pop() ?? "";
  }

  sugerencias(n = 4) {
    return sugerir(this.palabraActual, n);
  }

  /** Sustituye la palabra a medias por la sugerencia y deja un espacio detras. */
  completar(palabra: string) {
    this.pendienteEspacio = false;
    const base = this.texto.slice(0, this.texto.length - this.palabraActual.length);
    this.poner(`${base}${palabra} `);
  }

  reiniciar() {
    this.candidata = "";
    this.liberada = true;
  }

  private poner(texto: string, escrita?: string) {
    this.texto = texto;
    this.onCambio(texto, escrita);
  }
}
