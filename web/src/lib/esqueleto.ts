// Esqueleto de mano en un canvas que se transforma suavemente entre formas.
import { dibujarMano } from "./camara";

type XY = [number, number];
const reducido = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export class Esqueleto {
  private ctx: CanvasRenderingContext2D;
  private actual: XY[] | null = null;
  private objetivo: XY[] | null = null;
  private raf = 0;
  private ultima = 0;
  espejo = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private opts: { grosor?: number; radio?: number; margen?: number; color?: string; acento?: string } = {},
  ) {
    this.ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const { width, height } = canvas.getBoundingClientRect();
    if (width && height) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
  }

  /** Forma nueva (21 puntos, cualquier escala); se interpola desde la actual. */
  mostrar(pts: ReadonlyArray<ArrayLike<number>> | null, inmediato = false) {
    this.objetivo = pts ? encajar(pts.map((p) => [p[0], p[1]]), this.canvas, this.opts.margen ?? 0.16) : null;
    if (inmediato || reducido() || !this.actual) this.actual = this.objetivo?.map((p) => [...p] as XY) ?? null;
    this.animar();
  }

  limpiar() {
    this.actual = this.objetivo = null;
    cancelAnimationFrame(this.raf);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private animar() {
    cancelAnimationFrame(this.raf);
    const paso = (t: number) => {
      const dt = Math.min(64, t - (this.ultima || t));
      this.ultima = t;
      let lejos = false;
      if (this.actual && this.objetivo) {
        const k = 1 - Math.exp(-dt / 90); // suavizado exponencial, ~90 ms de constante
        for (let i = 0; i < 21; i++) {
          for (const j of [0, 1] as const) {
            const d = this.objetivo[i][j] - this.actual[i][j];
            this.actual[i][j] += d * k;
            if (Math.abs(d) > 0.2) lejos = true;
          }
        }
      }
      this.pintar();
      if (lejos) this.raf = requestAnimationFrame(paso);
    };
    this.raf = requestAnimationFrame(paso);
  }

  private pintar() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.actual) return;
    const s = canvas.width / 320;
    const pts = this.actual.map(([x, y]) => ({ x: this.espejo ? canvas.width - x : x, y }));
    dibujarMano(ctx, pts, (this.opts.grosor ?? 4) * s, (this.opts.radio ?? 5) * s, this.opts.color, this.opts.acento);
  }
}

/** Escala y centra 21 puntos dentro del canvas (en pixeles del canvas). */
function encajar(pts: XY[], canvas: HTMLCanvasElement, margen: number): XY[] {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const lado = Math.min(canvas.width, canvas.height) * (1 - 2 * margen);
  const k = lado / Math.max(maxX - minX, maxY - minY, 1e-6);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return pts.map(([x, y]) => [canvas.width / 2 + (x - cx) * k, canvas.height / 2 + (y - cy) * k]);
}
