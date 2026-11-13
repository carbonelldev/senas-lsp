// Pagina "Detectar": camara -> puntos (hasta 2 manos) -> letra, deletreo y foto suelta.
import { Camara } from "../lib/camara";
import { Esqueleto } from "../lib/esqueleto";
import { moverIndicador, ponerLetra } from "../lib/fx";
import {
  analizarVideo, cargar, leerTodas, ordenar, ordenarManos, ponerModo, Suavizador,
  type Lectura, type Modelo,
} from "../lib/mano";
import { $, $$, bucle, type Limpieza } from "../lib/pagina";
import { Select } from "../lib/ui/select";
import { montarDeletreo } from "./deletreo";
import { demoMorph } from "./demo";
import { ponerEstado } from "./estado";

const MIN_CONF = 0.5; // por debajo, la letra se muestra atenuada
const HI_CONF = 0.75; // a partir de aqui, brilla
const LADO = { der: "derecha", izq: "izquierda" } as const;

type Mano = ReturnType<typeof ordenarManos>[number];

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
  const otraLado = $(result, "[data-otra-lado]");
  const otraLetra = $(result, "[data-otra-letra]");
  const otraConf = $(result, "[data-otra-conf]");
  const visto = new Esqueleto($<HTMLCanvasElement>(result, "[data-seen]"), { margen: 0.14, grosor: 3, radio: 4 });

  const deletreo = montarDeletreo(root, {
    caja: $(result, "[data-ring-box]"),
    circulo: result.querySelector<SVGCircleElement>("[data-ring]")!,
  });

  const indicador = $(root, "[data-indicator]");
  const celdas = new Map($$(root, "[data-cell]").map((c) => [c.dataset.cell!, c]));

  // ----- estado -----
  let modelo: Modelo | null = null;
  const suavizador = new Suavizador();
  let avgMs = 0;
  let activa = ""; // letra marcada en el alfabeto
  let pararBucle: Limpieza | null = null;
  let pararDemo: Limpieza | null = demoMorph($(stage, "[data-demo]"), $(stage, "[data-demo-letter]"));
  const limpiezas: Limpieza[] = [() => deletreo.destruir()];

  // ----- resultado -----
  /** Muestra las manos ya ordenadas (la primera es la que escribe) y las dibuja sobre la imagen. */
  function mostrarManos(manos: Mano[], dibujar: (m: Mano) => Lectura["lms"] = (m) => m.lms) {
    cam.dibujar(
      manos.map((m) => ({
        lms: dibujar(m),
        etiqueta: (m.conf >= MIN_CONF ? m.letter : "?") + (manos.length > 1 ? ` · ${LADO[m.lado]}` : ""),
      })),
    );
    result.dataset.manos = String(manos.length);
    const [p, otra] = manos;
    if (!p) return mostrarNada();
    mostrar(p.probs, p.letter, p.conf);
    visto.espejo = cam.espejo;
    visto.mostrar(p.p);
    if (otra) {
      otraLado.textContent = `mano ${LADO[otra.lado]}`;
      otraLetra.textContent = otra.conf >= MIN_CONF ? otra.letter : "?";
      otraConf.textContent = `${Math.round(otra.conf * 100)} %`;
    }
  }

  function mostrar(probs: Float64Array, letter: string, conf: number) {
    const orden = ordenar(probs);
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
  }

  function mostrarNada() {
    ponerLetra(letterEl, "–");
    result.dataset.conf = "none";
    result.dataset.manos = "0";
    confText.textContent = "0 %";
    confBar.style.width = "0";
    filas.forEach((f) => {
      f.l.textContent = "·";
      f.bar.style.width = "0";
      f.p.textContent = "0 %";
    });
    visto.mostrar(null);
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
    suavizador.reiniciar();
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
    deletreo.reiniciar();
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
    const manos = ordenarManos(modelo.meta, suavizador.actualizar(analizarVideo(modelo, video, now)));
    mostrarManos(manos);
    if (manos[0]) deletreo.tick(manos[0].letter, manos[0].conf, now);
    else deletreo.sinMano(now);
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
    // se espera al evento load (decode() puede fallar o quedarse colgado con la pestaña en segundo plano)
    const cargada = new Promise<void>((ok, mal) => {
      foto.onload = () => ok();
      foto.onerror = () => mal(new Error("No se pudo abrir la imagen"));
    });
    foto.src = URL.createObjectURL(file);
    try {
      await cargada;
    } catch {
      fpsEl.textContent = "no se pudo abrir la imagen";
      return;
    }
    pararDemo?.();
    pararDemo = null;
    stage.dataset.cam = "photo";
    stage.classList.remove("mirror");
    camLabel.textContent = `foto · ${foto.naturalWidth}×${foto.naturalHeight}`;
    await ponerModo(modelo.landmarker, "IMAGE");
    const W = foto.naturalWidth, H = foto.naturalHeight;
    // el overlay se dibuja a una resolucion decente aunque la foto sea pequena (object-fit: contain lo encaja)
    const k = Math.max(1, 720 / Math.max(W, H));
    cam.overlay.width = Math.round(W * k);
    cam.overlay.height = Math.round(H * k);
    for (const pad of [0, 0.25, 0.5]) {
      const src = pad ? conMargen(foto, pad) : foto;
      const res = modelo.landmarker.detect(src);
      if (!res.landmarks.length) continue;
      const w = pad ? (src as HTMLCanvasElement).width : W;
      const h = pad ? (src as HTMLCanvasElement).height : H;
      const b = pad ? Math.round(Math.max(W, H) * pad) : 0;
      const manos = ordenarManos(modelo.meta, leerTodas(modelo.meta, res, w, h));
      // los puntos vienen de la imagen con margen: se reubican sobre la foto original
      mostrarManos(manos, (m) => m.lms.map((q) => ({ ...q, x: (q.x * w - b) / W, y: (q.y * h - b) / H })));
      visto.espejo = false;
      fpsEl.textContent = manos.length > 1 ? "foto · 2 manos" : "foto";
      return;
    }
    cam.dibujar([]);
    mostrarNada();
    fpsEl.textContent = "no se ve ninguna mano en la foto";
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
