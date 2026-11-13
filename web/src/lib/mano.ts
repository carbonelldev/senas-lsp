// Carga de MediaPipe + modelo (una sola vez por sesion) y analisis de fotogramas (hasta 2 manos).
import { FilesetResolver, HandLandmarker, type HandLandmarkerResult, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { analizar, toPixels, type Meta, type P3 } from "./clasificador";

export type { Meta, P3, NormalizedLandmark, HandLandmarker };
export type Modelo = { meta: Meta; landmarker: HandLandmarker };
export type Lado = "izq" | "der";
export type Lectura = { lms: NormalizedLandmark[]; p: P3[]; probs: Float64Array; lado: Lado };
export type Muestras = Record<string, [number, number][]>;

export const MAX_MANOS = 2;

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
    fetch(`/model/puntos.json?v=${__MODELO_V__}`).then((r) => r.json() as Promise<Meta>),
    FilesetResolver.forVisionTasks("/mediapipe"),
  ]);
  // Umbrales algo mas bajos que los de serie: con la mano de costado o inclinada la
  // confianza del detector baja, y el suavizado entre fotogramas ya filtra el ruido.
  const opts = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: "/model/hand_landmarker.task", delegate },
    runningMode: "VIDEO" as const,
    numHands: MAX_MANOS,
    minHandDetectionConfidence: 0.4,
    minHandPresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
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
  return (muestras ??= fetch(`/model/muestras.json?v=${__MODELO_V__}`).then((r) => r.json() as Promise<Muestras>));
}

let modo: "VIDEO" | "IMAGE" = "VIDEO";
export async function ponerModo(landmarker: HandLandmarker, m: "VIDEO" | "IMAGE") {
  if (modo !== m) {
    await landmarker.setOptions({ runningMode: m });
    modo = m;
  }
}

/**
 * MediaPipe etiqueta la mano suponiendo una imagen espejada (selfie). Los fotogramas que le
 * pasamos no lo estan, asi que la etiqueta sale al reves: "Left" es la mano derecha.
 */
function lado(res: HandLandmarkerResult, i: number): Lado {
  return res.handedness[i]?.[0]?.categoryName === "Left" ? "der" : "izq";
}

/** Clasifica una mano ya detectada (puntos 0..1 de una imagen de w x h). */
export function leer(meta: Meta, lms: NormalizedLandmark[], w: number, h: number, l: Lado = "der"): Lectura {
  return { lms, lado: l, ...analizar(meta, toPixels(lms, w, h)) };
}

export function leerTodas(meta: Meta, res: HandLandmarkerResult, w: number, h: number): Lectura[] {
  return res.landmarks.map((lms, i) => leer(meta, lms, w, h, lado(res, i)));
}

export function analizarVideo({ meta, landmarker }: Modelo, video: HTMLVideoElement, now: number) {
  return leerTodas(meta, landmarker.detectForVideo(video, now), video.videoWidth, video.videoHeight);
}

/** Suavizado exponencial de probabilidades entre fotogramas. */
export function suavizar(prev: Float64Array | null | undefined, probs: Float64Array, a = 0.35) {
  if (!prev) return probs.slice();
  for (let i = 0; i < probs.length; i++) prev[i] = a * probs[i] + (1 - a) * prev[i];
  return prev;
}

/** Suavizado por mano (cada lado lleva su propia memoria). */
export class Suavizador {
  private memoria = new Map<Lado, Float64Array>();
  actualizar(lecturas: Lectura[]) {
    const vistos = new Set<Lado>();
    const out = lecturas.map((r) => {
      // si las dos manos salen con el mismo lado (pasa a veces), la segunda no usa memoria
      const clave = vistos.has(r.lado) ? null : r.lado;
      vistos.add(r.lado);
      const s = clave ? suavizar(this.memoria.get(clave), r.probs) : r.probs;
      if (clave) this.memoria.set(clave, s);
      return { ...r, probs: s };
    });
    for (const k of [...this.memoria.keys()]) if (!vistos.has(k)) this.memoria.delete(k);
    return out;
  }
  reiniciar() {
    this.memoria.clear();
  }
}

export function mejor(meta: Meta, probs: Float64Array) {
  let best = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
  return { letter: meta.classes[best], conf: probs[best], index: best };
}

/** La mano con la letra mas segura va primero (es la que escribe). */
export function ordenarManos(meta: Meta, lecturas: Lectura[]) {
  return lecturas
    .map((r) => ({ ...r, ...mejor(meta, r.probs) }))
    .sort((a, b) => b.conf - a.conf);
}

export function ordenar(probs: Float64Array) {
  return [...probs.keys()].sort((a, b) => probs[b] - probs[a]);
}
