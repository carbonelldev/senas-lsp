// Carga de MediaPipe + modelo (una sola vez por sesion) y analisis de fotogramas.
import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { classify, featuresOf, normalize, toPixels, type Meta, type P3 } from "./clasificador";

export type { Meta, P3, NormalizedLandmark, HandLandmarker };
export type Modelo = { meta: Meta; landmarker: HandLandmarker };
export type Lectura = { lms: NormalizedLandmark[]; p: P3[]; probs: Float64Array };
export type Muestras = Record<string, [number, number][]>;

let modelo: Promise<Modelo> | null = null;
let muestras: Promise<Muestras> | null = null;

/** Modelo + detector. Se cachea: al cambiar de pagina no vuelve a cargar. */
export function cargar() {
  return (modelo ??= cargarModelo().catch((err) => {
    modelo = null;
    throw err;
  }));
}

async function cargarModelo(): Promise<Modelo> {
  const [meta, fileset] = await Promise.all([
    fetch("/model/puntos.json").then((r) => r.json() as Promise<Meta>),
    FilesetResolver.forVisionTasks("/mediapipe"),
  ]);
  const opts = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: "/model/hand_landmarker.task", delegate },
    runningMode: "VIDEO" as const,
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  let landmarker: HandLandmarker;
  try {
    landmarker = await HandLandmarker.createFromOptions(fileset, opts("GPU"));
  } catch {
    landmarker = await HandLandmarker.createFromOptions(fileset, opts("CPU"));
  }
  return { meta, landmarker };
}

/** Una mano "ideal" por letra, con los 21 puntos normalizados. Para dibujar esqueletos. */
export function cargarMuestras() {
  return (muestras ??= fetch("/model/muestras.json").then((r) => r.json() as Promise<Muestras>));
}

let modo: "VIDEO" | "IMAGE" = "VIDEO";
export async function ponerModo(landmarker: HandLandmarker, m: "VIDEO" | "IMAGE") {
  if (modo !== m) {
    await landmarker.setOptions({ runningMode: m });
    modo = m;
  }
}

/** Clasifica una mano ya detectada (puntos 0..1 de una imagen de w x h). */
export function leer(meta: Meta, lms: NormalizedLandmark[], w: number, h: number): Lectura {
  const p = normalize(toPixels(lms, w, h));
  return { lms, p, probs: classify(meta, featuresOf(p, meta.pairs)) };
}

export function analizarVideo({ meta, landmarker }: Modelo, video: HTMLVideoElement, now: number) {
  const lms = landmarker.detectForVideo(video, now).landmarks[0];
  return lms ? leer(meta, lms, video.videoWidth, video.videoHeight) : null;
}

/** Suavizado exponencial de probabilidades entre fotogramas. */
export function suavizar(prev: Float64Array | null, probs: Float64Array, a = 0.35) {
  if (!prev) return probs.slice();
  for (let i = 0; i < probs.length; i++) prev[i] = a * probs[i] + (1 - a) * prev[i];
  return prev;
}

export function mejor(meta: Meta, probs: Float64Array) {
  let best = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
  return { letter: meta.classes[best], conf: probs[best], index: best };
}

export function ordenar(probs: Float64Array) {
  return [...probs.keys()].sort((a, b) => probs[b] - probs[a]);
}
