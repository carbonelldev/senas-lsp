// Carga de MediaPipe + modelo (una sola vez por sesion) y analisis de fotogramas (hasta 2 manos).
import {
  FaceDetector, FilesetResolver, HandLandmarker,
  type FaceDetectorResult, type HandLandmarkerResult, type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { analizar, toPixels, type Meta, type P3 } from "./clasificador";

export type { Meta, P3, NormalizedLandmark, HandLandmarker };
/** `caras` sirve para descartar "manos" que en realidad son la cara (falsos positivos). */
export type Modelo = { meta: Meta; landmarker: HandLandmarker; caras: FaceDetector | null };
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
  // Umbrales un poco por encima de los de serie: con dos manos, unos mas bajos hacian que
  // la cara se colara como "segunda mano". Lo que queda lo filtran las caras y la estabilidad.
  const opts = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: "/model/hand_landmarker.task", delegate },
    runningMode: "VIDEO" as const,
    numHands: MAX_MANOS,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  const optsCara = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: "/model/face_detector.tflite", delegate },
    runningMode: "VIDEO" as const,
    minDetectionConfidence: 0.5,
  });
  const conRespaldo = async <T>(crear: (d: "GPU" | "CPU") => Promise<T>) => {
    try {
      return await crear("GPU");
    } catch {
      return await crear("CPU");
    }
  };
  const [landmarker, caras] = await Promise.all([
    conRespaldo((d) => HandLandmarker.createFromOptions(fileset, opts(d))),
    // si el detector de caras no carga, se sigue sin el (solo se pierde ese filtro)
    conRespaldo((d) => FaceDetector.createFromOptions(fileset, optsCara(d))).catch((err) => {
      console.warn("Sin detector de caras:", err);
      return null;
    }),
  ]);
  return { meta, landmarker, caras };
}

/** Cuantas manos se buscan (1 o 2). */
export async function ponerManos({ landmarker }: Modelo, n: 1 | 2) {
  await landmarker.setOptions({ numHands: n });
}

/** Una mano "ideal" por letra, con los 21 puntos normalizados. Para dibujar esqueletos. */
export function cargarMuestras() {
  return (muestras ??= fetch(`/model/muestras.json?v=${__MODELO_V__}`).then((r) => r.json() as Promise<Muestras>));
}

let modo: "VIDEO" | "IMAGE" = "VIDEO";
export async function ponerModo({ landmarker, caras }: Modelo, m: "VIDEO" | "IMAGE") {
  if (modo !== m) {
    await Promise.all([landmarker.setOptions({ runningMode: m }), caras?.setOptions({ runningMode: m })]);
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

// ----- filtro de caras -----
type Caja = { x0: number; y0: number; x1: number; y1: number }; // normalizada 0..1
let cajasCara: Caja[] = [];
let cuadroCara = 0;
const CARA_CADA = 3; // la cara se mueve poco: basta con buscarla cada 3 fotogramas

function cajasDeCaras(res: FaceDetectorResult, w: number, h: number): Caja[] {
  return res.detections.flatMap((d) => {
    const b = d.boundingBox;
    if (!b) return [];
    // se agranda un poco: la caja de BlazeFace cubre la cara justa, no el pelo ni la barbilla
    const mx = b.width * 0.15, my = b.height * 0.2;
    return [{ x0: (b.originX - mx) / w, y0: (b.originY - my) / h, x1: (b.originX + b.width + mx) / w, y1: (b.originY + b.height + my) / h }];
  });
}

function cajaDeMano(lms: NormalizedLandmark[]): Caja {
  const xs = lms.map((p) => p.x), ys = lms.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Parte de la caja de la mano que cae dentro de la caja de la cara (0..1). */
function solape(m: Caja, c: Caja) {
  const iw = Math.max(0, Math.min(m.x1, c.x1) - Math.max(m.x0, c.x0));
  const ih = Math.max(0, Math.min(m.y1, c.y1) - Math.max(m.y0, c.y0));
  const area = Math.max(1e-6, (m.x1 - m.x0) * (m.y1 - m.y0));
  return (iw * ih) / area;
}

/**
 * Manos de un fotograma de video, sin las que son en realidad la cara: una "mano" cuya caja cae
 * en mas de la mitad dentro de una cara se descarta. Una mano de verdad delante de la cara la
 * tapa, y entonces el detector de caras no la encuentra, asi que no se pierde.
 */
export function analizarVideo({ meta, landmarker, caras }: Modelo, video: HTMLVideoElement, now: number) {
  const res = landmarker.detectForVideo(video, now);
  const w = video.videoWidth, h = video.videoHeight;
  if (!res.landmarks.length || !caras) {
    cajasCara = [];
    cuadroCara = 0;
    return leerTodas(meta, res, w, h);
  }
  if (cuadroCara++ % CARA_CADA === 0) cajasCara = cajasDeCaras(caras.detectForVideo(video, now), w, h);
  return leerTodas(meta, res, w, h).filter((r) => {
    const m = cajaDeMano(r.lms);
    return !cajasCara.some((c) => solape(m, c) > 0.5);
  });
}

/** Suavizado exponencial de probabilidades entre fotogramas. */
export function suavizar(prev: Float64Array | null | undefined, probs: Float64Array, a = 0.35) {
  if (!prev) return probs.slice();
  for (let i = 0; i < probs.length; i++) prev[i] = a * probs[i] + (1 - a) * prev[i];
  return prev;
}

/**
 * Suavizado por mano (cada lado lleva su propia memoria). Ademas, una mano nueva solo se da
 * por buena cuando lleva MIN_CUADROS fotogramas seguidos: los falsos positivos sueltos no pasan.
 */
const MIN_CUADROS = 3;
export class Suavizador {
  private memoria = new Map<Lado, Float64Array>();
  private racha = new Map<Lado, number>();
  actualizar(lecturas: Lectura[]) {
    // racha: cuantos fotogramas seguidos lleva vista cada mano
    const presentes = new Set(lecturas.map((r) => r.lado));
    for (const l of presentes) this.racha.set(l, (this.racha.get(l) ?? 0) + 1);
    for (const l of [...this.racha.keys()]) if (!presentes.has(l)) this.racha.delete(l);
    const estables = lecturas.filter((r) => (this.racha.get(r.lado) ?? 0) >= MIN_CUADROS);

    const vistos = new Set<Lado>();
    const out = estables.map((r) => {
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
    this.racha.clear();
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
