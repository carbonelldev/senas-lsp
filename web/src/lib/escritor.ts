// Escritura por mantener la sena: si la misma letra se sostiene HOLD ms con
// confianza suficiente, se escribe una vez; hay que soltar o cambiar para repetirla.

export class Escritor {
  private letra = "";
  private inicio = 0;
  private liberada = true;

  constructor(
    private readonly salida: HTMLElement,
    private readonly opts = { conf: 0.6, holdMs: 1100 },
  ) {}

  get texto() {
    return this.salida.textContent ?? "";
  }
  set texto(v: string) {
    this.salida.textContent = v;
  }

  /** Devuelve el progreso 0..1 del mantenimiento y si se acaba de escribir una letra. */
  tick(letra: string, conf: number, now: number): { progreso: number; escrita?: string } {
    if (!letra || conf < this.opts.conf || letra !== this.letra) {
      this.letra = letra && conf >= this.opts.conf ? letra : "";
      this.inicio = now;
      this.liberada = true;
      return { progreso: 0 };
    }
    if (!this.liberada) return { progreso: 0 };
    const p = Math.min(1, (now - this.inicio) / this.opts.holdMs);
    if (p >= 1) {
      this.liberada = false;
      this.texto += letra;
      return { progreso: 0, escrita: letra };
    }
    return { progreso: p };
  }

  reiniciar() {
    this.letra = "";
    this.liberada = true;
  }
}
