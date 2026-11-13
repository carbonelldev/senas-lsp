// Pagina "Aprender": esqueleto que recorre el alfabeto, practica con la camara y progreso.
import { LETRAS } from "../data/letras";
import { Camara } from "../lib/camara";
import { Esqueleto } from "../lib/esqueleto";
import { ponerLetra } from "../lib/fx";
import { analizarVideo, cargar, cargarMuestras, mejor, ponerModo, suavizar, type Modelo, type Muestras } from "../lib/mano";
import { $, $$, bucle, type Limpieza } from "../lib/pagina";
import { guardarAprendidas, leerAprendidas } from "../lib/progreso";
import { demoMorph } from "./demo";
import { ponerEstado } from "./estado";

const OK_CONF = 0.6; // probabilidad de la letra objetivo para darla por buena
const HOLD_MS = 800; // tiempo que hay que mantenerla

export function montarAprender(root: HTMLElement): Limpieza {
  const limpiezas: Limpieza[] = [];

  // ----- cabecera: esqueleto que cambia de letra -----
  limpiezas.push(demoMorph($(root, "[data-hero-skel]"), $(root, "[data-hero-letter]"), 1500));

  // ----- practica -----
  const practica = $(root, "[data-practice]");
  const stage = $(practica, "[data-stage]");
  const video = $<HTMLVideoElement>(stage, "[data-video]");
  const cam = new Camara(video, $<HTMLCanvasElement>(stage, "[data-overlay]"), stage);
  const camLabel = $(stage, "[data-cam-label]");
  const msEl = $(stage, "[data-ms]");
  const exito = $(stage, "[data-success]");
  const startBtn = $<HTMLButtonElement>(practica, "[data-start]");
  const targetEl = $(practica, "[data-target]");
  const img1 = $<HTMLImageElement>(practica, "[data-img1]");
  const img2 = $<HTMLImageElement>(practica, "[data-img2]");
  const objetivoSkel = new Esqueleto($<HTMLCanvasElement>(practica, "[data-target-skel]"), { margen: 0.16, grosor: 3, radio: 4 });
  const howEl = $(practica, "[data-how]");
  const ojoEl = $(practica, "[data-ojo]");
  const posEl = $(practica, "[data-pos]");
  const fbEl = $(practica, "[data-fb]");
  const fbPct = $(practica, "[data-fb-pct]");
  const fbBar = $(practica, "[data-fb-bar]");
  const shuffle = $<HTMLInputElement>(practica, "[data-shuffle]");
  const learnedEl = $(practica, "[data-learned]");
  const chips = new Map($$(practica, "[data-chip]").map((b) => [b.dataset.chip!, b]));
  const cards = new Map($$(root, "[data-card]").map((c) => [c.dataset.card!, c]));

  let modelo: Modelo | null = null;
  let muestras: Muestras | null = null;
  let suavizado: Float64Array | null = null;
  let actual = 0;
  let inicioHold = 0;
  let celebrando = false;
  let avgMs = 0;
  let pararBucle: Limpieza | null = null;
  let pararDemo: Limpieza | null = demoMorph($(stage, "[data-demo]"), $(stage, "[data-demo-letter]"));
  let timerExito = 0;

  // ----- progreso -----
  const aprendidas = leerAprendidas();
  function pintarProgreso() {
    guardarAprendidas(aprendidas);
    for (const [l, b] of chips) (aprendidas.has(l) ? (b.dataset.done = "") : delete b.dataset.done);
    for (const [l, c] of cards) (aprendidas.has(l) ? (c.dataset.learned = "") : delete c.dataset.learned);
    learnedEl.textContent = `${aprendidas.size} / ${LETRAS.length}`;
  }

  // ----- objetivo -----
  function feedback(texto: string, p: number, ok: boolean) {
    fbEl.textContent = texto;
    fbEl.classList.toggle("text-ok", ok);
    fbEl.classList.toggle("text-muted", !ok);
    fbPct.textContent = p ? `${Math.round(p * 100)} %` : "";
    fbBar.style.width = `${p * 100}%`;
  }

  function ponerObjetivo(i: number) {
    actual = (i + LETRAS.length) % LETRAS.length;
    const { letra, como, ojo } = LETRAS[actual];
    ponerLetra(targetEl, letra);
    img1.src = `/ejemplos/${letra}_1.jpg`;
    img2.src = `/ejemplos/${letra}_2.jpg`;
    img1.alt = `Ejemplo de la letra ${letra}`;
    img2.alt = `Otro ejemplo de la letra ${letra}`;
    howEl.textContent = como;
    ojoEl.textContent = ojo ?? "";
    ojoEl.classList.toggle("hidden", !ojo);
    posEl.textContent = `${actual + 1} / ${LETRAS.length}`;
    for (const [l, b] of chips) (l === letra ? (b.dataset.current = "") : delete b.dataset.current);
    if (muestras) objetivoSkel.mostrar(muestras[letra]);
    suavizado = null;
    inicioHold = 0;
    feedback(cam.abierta ? `Haz la ${letra}` : "Enciende la cámara para practicar", 0, false);
  }

  function siguiente() {
    const pendientes = LETRAS.map((_, i) => i).filter((i) => i !== actual && !aprendidas.has(LETRAS[i].letra));
    if (shuffle.checked) {
      const pool = pendientes.length ? pendientes : LETRAS.map((_, i) => i).filter((i) => i !== actual);
      return ponerObjetivo(pool[Math.floor(Math.random() * pool.length)]);
    }
    for (let k = 1; k <= LETRAS.length; k++) {
      const i = (actual + k) % LETRAS.length;
      if (!aprendidas.has(LETRAS[i].letra) || !pendientes.length) return ponerObjetivo(i);
    }
  }

  function celebrar(letra: string) {
    celebrando = true;
    aprendidas.add(letra);
    pintarProgreso();
    exito.dataset.on = "";
    cam.limpiarOverlay();
    timerExito = window.setTimeout(() => {
      delete exito.dataset.on;
      celebrando = false;
      siguiente();
    }, 1300);
  }

  // ----- camara -----
  async function encender() {
    if (!modelo) return;
    try {
      await cam.abrir();
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
    ponerEstado("practicando", "live");
    ponerObjetivo(actual);
    pararBucle?.();
    pararBucle = bucle(tick);
  }

  function tick(now: number) {
    if (!modelo || celebrando || !cam.nuevoFotograma()) return;
    const t0 = performance.now();
    const r = analizarVideo(modelo, video, now);
    cam.dibujar(r?.lms ?? null);
    const objetivo = LETRAS[actual].letra;
    if (!r) {
      suavizado = null;
      inicioHold = 0;
      feedback(`Haz la ${objetivo}`, 0, false);
    } else {
      suavizado = suavizar(suavizado, r.probs);
      const pObj = suavizado[modelo.meta.classes.indexOf(objetivo)];
      const { letter, conf } = mejor(modelo.meta, suavizado);
      if (pObj >= OK_CONF) {
        inicioHold ||= now;
        const t = Math.min(1, (now - inicioHold) / HOLD_MS);
        feedback("¡Eso es! Mantenla…", Math.max(pObj, t), true);
        if (t >= 1) celebrar(objetivo);
      } else {
        inicioHold = 0;
        const pista = letter !== objetivo && conf >= 0.5 ? `Parece una ${letter}. Sigue con la ${objetivo}` : `Casi… ajusta la mano para la ${objetivo}`;
        feedback(pista, pObj, false);
      }
    }
    const ms = performance.now() - t0;
    avgMs = avgMs ? 0.9 * avgMs + 0.1 * ms : ms;
    msEl.textContent = `${Math.round(avgMs)} ms`;
  }

  // ----- eventos -----
  startBtn.addEventListener("click", encender);
  $(practica, "[data-prev]").addEventListener("click", () => ponerObjetivo(actual - 1));
  $(practica, "[data-next]").addEventListener("click", () => (shuffle.checked ? siguiente() : ponerObjetivo(actual + 1)));
  $(practica, "[data-reset]").addEventListener("click", () => {
    aprendidas.clear();
    pintarProgreso();
    ponerObjetivo(0);
  });
  for (const [l, b] of chips) b.addEventListener("click", () => ponerObjetivo(LETRAS.findIndex((x) => x.letra === l)));
  for (const b of $$<HTMLButtonElement>(root, "[data-practicar]")) {
    b.addEventListener("click", () => {
      ponerObjetivo(LETRAS.findIndex((x) => x.letra === b.dataset.practicar));
      practica.scrollIntoView({ behavior: "smooth", block: "start" });
      if (!cam.abierta && modelo) encender();
    });
  }

  // ----- arranque -----
  pintarProgreso();
  const primera = LETRAS.findIndex((l) => !aprendidas.has(l.letra));
  ponerObjetivo(primera === -1 ? 0 : primera);
  cargarMuestras().then((m) => {
    muestras = m;
    objetivoSkel.mostrar(m[LETRAS[actual].letra], true);
  });
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
    clearTimeout(timerExito);
    cam.cerrar();
    limpiezas.forEach((f) => f());
  };
}
