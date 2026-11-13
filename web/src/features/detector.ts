// Pagina "Detectar": camara -> puntos -> letra, deletreo por mantener la sena y foto suelta.
import { Camara } from "../lib/camara";
import { Escritor } from "../lib/escritor";
import { Esqueleto } from "../lib/esqueleto";
import { moverIndicador, ponerLetra } from "../lib/fx";
import { analizarVideo, cargar, leer, mejor, ordenar, ponerModo, suavizar, type Modelo, type NormalizedLandmark } from "../lib/mano";
import { $, $$, bucle, type Limpieza } from "../lib/pagina";
import { Select } from "../lib/ui/select";
import { demoMorph } from "./demo";
import { ponerEstado } from "./estado";

const MIN_CONF = 0.5; // por debajo, la letra se muestra atenuada
const HI_CONF = 0.75; // a partir de aqui, brilla
const WRITE_CONF = 0.6; // para escribir
const HOLD_MS = 1100;

export function montarDetector(root: HTMLElement): Limpieza {
  // ----- elementos -----
  const stage = $(root, "[data-stage]");
  const video = $<HTMLVideoElement>(stage, "[data-video]");
  const foto = $<HTMLImageElement>(stage, "[data-photo]");
  const cam = new Camara(video, $<HTMLCanvasElement>(stage, "[data-overlay]"), stage);
  const camLabel = $(stage, "[data-cam-label]");
  const msEl = $(stage, "[data-ms]");
  const startBtn = $<HTMLButtonElement>(root, "[data-start]");
  const stopBtn = $<HTMLButtonElement>(root, "[data-stop]");
  const camaras = new Select($(root, "[data-select=camera]"));

  const result = $(root, "[data-result]");
  const letterEl = $(result, "[data-letter]");
  const confText = $(result, "[data-conf-text]");
  const confBar = $(result, "[data-conf-bar]");
  const fpsEl = $(result, "[data-fps]");
  const filas = $$(result, "[data-top3] li").map((li) => ({ l: $(li, "[data-l]"), bar: $(li, "[data-bar]"), p: $(li, "[data-p]") }));
  const visto = new Esqueleto($<HTMLCanvasElement>(result, "[data-seen]"), { margen: 0.14, grosor: 3, radio: 4 });

  const escritor = new Escritor($(root, "[data-text]"), { conf: WRITE_CONF, holdMs: HOLD_MS });
  const auto = $<HTMLInputElement>(root, "[data-auto]");
  const holdBar = $(root, "[data-hold]");

  const indicador = $(root, "[data-indicator]");
  const celdas = new Map($$(root, "[data-cell]").map((c) => [c.dataset.cell!, c]));

  // ----- estado -----
  let modelo: Modelo | null = null;
  let suavizado: Float64Array | null = null;
  let avgMs = 0;
  let activa = ""; // letra marcada en el alfabeto
  let pararBucle: Limpieza | null = null;
  let pararDemo: Limpieza | null = demoMorph($(stage, "[data-demo]"), $(stage, "[data-demo-letter]"));
  const limpiezas: Limpieza[] = [];

  // ----- resultado -----
  function mostrar(probs: Float64Array) {
    const orden = ordenar(probs);
    const { letter, conf } = mejor(modelo!.meta, probs);
    ponerLetra(letterEl, letter);
    result.dataset.conf = conf >= HI_CONF ? "hi" : conf >= MIN_CONF ? "mid" : "low";
    confText.textContent = `${Math.round(conf * 100)} %`;
    confBar.style.width = `${conf * 100}%`;
    filas.forEach((f, i) => {
      const k = orden[i];
      f.l.textContent = modelo!.meta.classes[k];
      f.bar.style.width = `${probs[k] * 100}%`;
      f.p.textContent = `${Math.round(probs[k] * 100)} %`;
    });
    marcar(conf >= MIN_CONF ? letter : "");
    return { letter, conf };
  }

  function mostrarNada() {
    ponerLetra(letterEl, "–");
    result.dataset.conf = "none";
    confText.textContent = "0 %";
    confBar.style.width = "0";
    filas.forEach((f) => {
      f.l.textContent = "·";
      f.bar.style.width = "0";
      f.p.textContent = "0 %";
    });
    marcar("");
  }

  function marcar(letra: string) {
    if (letra === activa) return;
    activa = letra;
    for (const [l, c] of celdas) {
      if (l === letra) c.dataset.on = "";
      else delete c.dataset.on;
    }
    moverIndicador(indicador, letra ? celdas.get(letra)! : null);
  }

  function escribir(letra: string, conf: number, now: number) {
    if (!auto.checked) {
      holdBar.style.width = "0";
      return;
    }
    const { progreso } = escritor.tick(letra, conf, now);
    holdBar.style.width = `${progreso * 100}%`;
  }

  // ----- camara -----
  async function encender(deviceId?: string) {
    if (!modelo) return;
    quitarFoto();
    try {
      await cam.abrir(deviceId);
    } catch (err) {
      console.error(err);
      ponerEstado("sin permiso de cámara", "error");
      camLabel.textContent = "sin permiso de cámara";
      return;
    }
    pararDemo?.();
    pararDemo = null;
    await ponerModo(modelo.landmarker, "VIDEO");
    camLabel.textContent = `${video.videoWidth}×${video.videoHeight}`;
    startBtn.hidden = true;
    stopBtn.hidden = false;
    ponerEstado("detectando", "live");
    await listarCamaras();
    suavizado = null;
    pararBucle?.();
    pararBucle = bucle(tick);
  }

  function apagar() {
    pararBucle?.();
    pararBucle = null;
    cam.cerrar();
    camLabel.textContent = "cámara apagada";
    msEl.textContent = "— ms";
    startBtn.hidden = false;
    stopBtn.hidden = true;
    mostrarNada();
    visto.mostrar(null);
    escritor.reiniciar();
    if (modelo) ponerEstado("listo", "ready");
    pararDemo ??= demoMorph($(stage, "[data-demo]"), $(stage, "[data-demo-letter]"));
  }

  async function listarCamaras() {
    const actual = cam.stream?.getVideoTracks()[0].getSettings().deviceId;
    const cams = await cam.listar();
    camaras.opciones(cams.map((c, i) => ({ value: c.deviceId, label: c.label || `cámara ${i + 1}` })));
    if (actual) camaras.valor = actual;
  }

  function tick(now: number) {
    if (!modelo || !cam.nuevoFotograma()) return;
    const t0 = performance.now();
    const r = analizarVideo(modelo, video, now);
    cam.dibujar(r?.lms ?? null);
    if (r) {
      suavizado = suavizar(suavizado, r.probs);
      const { letter, conf } = mostrar(suavizado);
      escribir(letter, conf, now);
      visto.espejo = cam.espejo;
      visto.mostrar(r.p);
    } else {
      suavizado = null;
      mostrarNada();
      escribir("", 0, now);
      visto.mostrar(null);
    }
    const ms = performance.now() - t0;
    avgMs = avgMs ? 0.9 * avgMs + 0.1 * ms : ms;
    msEl.textContent = `${Math.round(avgMs)} ms`;
    fpsEl.textContent = `${Math.round(avgMs)} ms / fotograma`;
  }

  // ----- foto suelta -----
  function quitarFoto() {
    if (stage.dataset.cam !== "photo") return;
    URL.revokeObjectURL(foto.src);
    foto.removeAttribute("src");
    stage.dataset.cam = "off";
    cam.limpiarOverlay();
  }

  /** Igual que en el entrenamiento: si no encuentra la mano, prueba con margen alrededor. */
  function conMargen(img: HTMLImageElement, pad: number) {
    const w = img.naturalWidth, h = img.naturalHeight;
    const b = Math.round(Math.max(w, h) * pad);
    const c = document.createElement("canvas");
    c.width = w + 2 * b;
    c.height = h + 2 * b;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, b, b);
    return c;
  }

  async function leerFoto(file: File) {
    if (!modelo) return;
    apagar();
    quitarFoto();
    foto.src = URL.createObjectURL(file);
    await foto.decode();
    pararDemo?.();
    pararDemo = null;
    stage.dataset.cam = "photo";
    stage.classList.remove("mirror");
    camLabel.textContent = `foto · ${foto.naturalWidth}×${foto.naturalHeight}`;
    await ponerModo(modelo.landmarker, "IMAGE");
    let hallado: { lms: NormalizedLandmark[]; w: number; h: number; b: number } | null = null;
    for (const pad of [0, 0.25, 0.5]) {
      const src = pad ? conMargen(foto, pad) : foto;
      const lms = modelo.landmarker.detect(src).landmarks[0];
      if (lms) {
        const w = pad ? (src as HTMLCanvasElement).width : foto.naturalWidth;
        const h = pad ? (src as HTMLCanvasElement).height : foto.naturalHeight;
        hallado = { lms, w, h, b: pad ? Math.round(Math.max(foto.naturalWidth, foto.naturalHeight) * pad) : 0 };
        break;
      }
    }
    // el overlay se dibuja a una resolucion decente aunque la foto sea pequena (object-fit: contain lo encaja)
    const k = Math.max(1, 720 / Math.max(foto.naturalWidth, foto.naturalHeight));
    cam.overlay.width = Math.round(foto.naturalWidth * k);
    cam.overlay.height = Math.round(foto.naturalHeight * k);
    if (!hallado) {
      cam.dibujar(null);
      mostrarNada();
      visto.mostrar(null);
      fpsEl.textContent = "no se ve ninguna mano en la foto";
      return;
    }
    const r = leer(modelo.meta, hallado.lms, hallado.w, hallado.h);
    // los puntos vienen de la imagen con margen: se reubican sobre la foto original
    const kx = hallado.w / foto.naturalWidth, ky = hallado.h / foto.naturalHeight;
    const ox = hallado.b / foto.naturalWidth, oy = hallado.b / foto.naturalHeight;
    cam.dibujar(hallado.lms.map((q) => ({ ...q, x: q.x * kx - ox, y: q.y * ky - oy })));
    mostrar(r.probs);
    visto.espejo = false;
    visto.mostrar(r.p);
    fpsEl.textContent = "foto";
  }

  // ----- eventos -----
  startBtn.addEventListener("click", () => encender());
  stopBtn.addEventListener("click", apagar);
  camaras.root.addEventListener("change", (e) => encender((e as CustomEvent<{ value: string }>).detail.value || undefined));
  limpiezas.push(() => camaras.destruir());
  for (const input of $$<HTMLInputElement>(root, "[data-file]")) {
    input.addEventListener("change", () => {
      if (input.files?.[0]) leerFoto(input.files[0]);
      input.value = "";
    });
  }
  $(root, "[data-space]").addEventListener("click", () => (escritor.texto += " "));
  $(root, "[data-back]").addEventListener("click", () => (escritor.texto = escritor.texto.slice(0, -1)));
  $(root, "[data-clear]").addEventListener("click", () => (escritor.texto = ""));
  const onResize = () => activa && moverIndicador(indicador, celdas.get(activa)!);
  addEventListener("resize", onResize);
  limpiezas.push(() => removeEventListener("resize", onResize));

  // modo presentación: el bloque del detector a pantalla completa (Esc para salir)
  const presentBtn = root.querySelector<HTMLButtonElement>("[data-present]");
  const presentLabel = root.querySelector<HTMLElement>("[data-present-label]");
  if (presentBtn && document.fullscreenEnabled) {
    presentBtn.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else root.requestFullscreen({ navigationUI: "hide" }).catch(console.error);
    });
    const onFs = () => {
      const on = document.fullscreenElement === root;
      if (presentLabel) presentLabel.textContent = on ? "Salir (Esc)" : "Modo presentación";
      onResize();
    };
    document.addEventListener("fullscreenchange", onFs);
    limpiezas.push(() => document.removeEventListener("fullscreenchange", onFs));
  } else if (presentBtn) {
    presentBtn.hidden = true;
  }

  // ----- modelo -----
  ponerEstado("cargando modelo", "loading");
  cargar()
    .then((m) => {
      modelo = m;
      ponerEstado("listo", "ready");
      startBtn.disabled = false;
    })
    .catch((err) => {
      console.error(err);
      ponerEstado("error al cargar", "error");
    });

  return () => {
    pararBucle?.();
    pararDemo?.();
    cam.cerrar();
    limpiezas.forEach((f) => f());
  };
}
