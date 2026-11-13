// Camara + overlay. Un solo sitio para abrir, cerrar, espejar y listar dispositivos.
import type { NormalizedLandmark } from "./mano";

export const CONEXIONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
const PUNTAS = new Set([4, 8, 12, 16, 20]);

export class Camara {
  stream: MediaStream | null = null;
  readonly ctx: CanvasRenderingContext2D;

  constructor(
    readonly video: HTMLVideoElement,
    readonly overlay: HTMLCanvasElement,
    readonly marco: HTMLElement,
  ) {
    this.ctx = overlay.getContext("2d")!;
  }

  get abierta() {
    return !!this.stream;
  }

  async abrir(deviceId?: string) {
    this.cerrar();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    const ajustes = this.stream.getVideoTracks()[0].getSettings();
    this.marco.classList.toggle("mirror", ajustes.facingMode !== "environment");
    this.marco.style.aspectRatio = `${this.video.videoWidth} / ${this.video.videoHeight}`;
    this.overlay.width = this.video.videoWidth;
    this.overlay.height = this.video.videoHeight;
    this.marco.dataset.cam = "on";
    return ajustes;
  }

  cerrar() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.limpiarOverlay();
    this.marco.dataset.cam = "off";
    delete this.marco.dataset.hand;
  }

  get espejo() {
    return this.marco.classList.contains("mirror");
  }

  /** Se puede llamar en cada rAF: solo devuelve true cuando hay un fotograma nuevo. */
  private ultimoT = -1;
  nuevoFotograma() {
    const v = this.video;
    if (v.readyState < 2 || v.currentTime === this.ultimoT) return false;
    this.ultimoT = v.currentTime;
    return true;
  }

  async listar() {
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.filter((d) => d.kind === "videoinput");
  }

  limpiarOverlay() {
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  /**
   * Dibuja los 21 puntos de cada mano sobre el video. La primera es la principal (la que escribe):
   * va en violeta; la otra en cian y algo mas tenue. Si se pasa `etiqueta`, se rotula junto a la muneca.
   */
  dibujar(manos: { lms: NormalizedLandmark[]; etiqueta?: string }[]) {
    const { width: w, height: h } = this.overlay;
    const ctx = this.ctx;
    this.limpiarOverlay();
    this.marco.dataset.hand = manos.length ? "on" : "off";
    this.marco.dataset.hands = String(manos.length);
    const grosor = Math.max(2.5, w / 300);
    const radio = Math.max(3.5, w / 190);
    manos.forEach((m, i) => {
      const pts = m.lms.map((q) => ({ x: q.x * w, y: q.y * h }));
      const principal = i === 0;
      ctx.globalAlpha = principal ? 1 : 0.75;
      dibujarMano(ctx, pts, grosor, radio, "rgba(255,255,255,0.9)", principal ? "#8b7cff" : "#22d3ee");
      ctx.globalAlpha = 1;
      if (m.etiqueta) this.rotular(pts[0], m.etiqueta, principal ? "#8b7cff" : "#22d3ee", radio);
    });
  }

  /** Pastilla de texto bajo la muneca; se contra-espeja para que se lea bien con la vista en espejo. */
  private rotular(p: { x: number; y: number }, texto: string, color: string, radio: number) {
    const ctx = this.ctx;
    const fs = Math.max(13, this.overlay.width / 52);
    ctx.save();
    ctx.translate(p.x, p.y + radio * 3 + fs);
    if (this.espejo) ctx.scale(-1, 1);
    ctx.font = `600 ${fs}px "Geist Variable", system-ui, sans-serif`;
    const ancho = ctx.measureText(texto).width + fs * 1.1;
    const alto = fs * 1.7;
    ctx.fillStyle = "rgba(10,10,10,0.78)";
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, fs / 9);
    ctx.beginPath();
    ctx.roundRect(-ancho / 2, -alto / 2, ancho, alto, alto / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ededed";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, 0, fs * 0.05);
    ctx.restore();
  }
}

export function dibujarMano(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  grosor: number,
  radio: number,
  color = "rgba(255,255,255,0.9)",
  acento = "#8b7cff",
) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = grosor;
  ctx.beginPath();
  for (const [a, b] of CONEXIONES) {
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
  }
  ctx.stroke();
  for (let i = 0; i < pts.length; i++) {
    const punta = PUNTAS.has(i);
    ctx.fillStyle = punta ? acento : "#0a0a0a";
    ctx.strokeStyle = punta ? acento : color;
    ctx.lineWidth = Math.max(1, grosor * 0.7);
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, punta ? radio * 1.15 : radio * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
