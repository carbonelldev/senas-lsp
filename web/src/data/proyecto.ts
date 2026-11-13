// Datos de la memoria del proyecto. Rellena autores/universidad/asignatura para que
// aparezcan en la cabecera de /proyecto (si se dejan vacíos no se muestran).
export const PROYECTO = {
  titulo: "Reconocimiento de letras estáticas del alfabeto manual de la LSP",
  autores: [] as string[],
  universidad: "",
  asignatura: "",
  curso: "2026",
};

export const DATASET = {
  fotos: 1920,
  letras: 24,
  porLetra: 80,
  fondos: ["library", "wall"],
  porFondo: 40,
  tamano: "100 × 100 px",
  formato: "JPG",
  fuente: "Peruvian sign language alphabet (Kaggle, C. R. Egoavil Huaman), dos fondos",
};

/** Las tres fases del trabajo, con los números tal como salieron. */
export const FASES = [
  {
    n: "01",
    titulo: "Exploración en Orange",
    entrada: "Píxeles → embeddings de Inception v3 (2048 valores)",
    resumen:
      "Flujo visual: Import Images → Image Embedding (Inception v3) → Test and Score con cuatro modelos. La regresión logística ganó con un 96,4 % de acierto en validación cruzada de 10 particiones.",
    resultados: [
      { modelo: "Regresión logística", cv: 0.964, auc: 0.999 },
      { modelo: "SVM", cv: 0.962, auc: 0.999 },
      { modelo: "Red neuronal", cv: 0.958, auc: 0.999 },
      { modelo: "kNN", cv: 0.936, auc: 0.994 },
    ],
    leccion: "Un 96 % parecía excelente, pero la validación cruzada mezcla fotos casi idénticas entre entrenamiento y prueba.",
  },
  {
    n: "02",
    titulo: "Réplica en Python y prueba de fondo nuevo",
    entrada: "Píxeles → MobileNetV2 (1280 valores) → regresión logística",
    resumen:
      "Se repitió la receta con un extractor que sí cabe en un navegador (MobileNetV2, ONNX) y se añadió una prueba más honesta: entrenar con las fotos de un fondo y probar con las del otro.",
    resultados: [
      { modelo: "Validación cruzada (10)", cv: 0.991 },
      { modelo: "Fondo nuevo", cv: 0.221 },
    ],
    leccion:
      "El modelo aprendía el fondo y la iluminación, no la mano: con un fondo que no había visto acertaba el 22 %, poco más que adivinar entre 24 letras.",
  },
  {
    n: "03",
    titulo: "Puntos de la mano",
    entrada: "MediaPipe Hand Landmarker → 21 puntos → 70 características → regresión logística",
    resumen:
      "Se cambió la entrada: en vez de píxeles, la forma de la mano. Los 21 puntos se normalizan (muñeca en el origen, palma = 1) y se añaden las distancias entre las puntas de los dedos. El fondo desaparece del problema.",
    resultados: [
      { modelo: "Validación cruzada (10)", cv: 0.903 },
      { modelo: "Fondo nuevo", cv: 0.766 },
      { modelo: "Mano izquierda (espejo)", cv: 0.76 },
    ],
    leccion: "Menos acierto en la prueba fácil, 3,5 veces más en la difícil. Es el modelo que corre en esta web.",
  },
] as const;

export const LIMITACIONES = [
  "Poca variedad en el dataset: pocas manos y solo dos fondos. Con otras personas, cámaras o luces el acierto puede bajar.",
  "La J, la Ñ y la Z se hacen con movimiento; el modelo clasifica fotos fijas, así que no están.",
  "Las letras de puño cerrado (A, E, M, N, S, T) comparten casi todos los puntos; distinguirlas depende de la posición del pulgar, que MediaPipe a veces oculta.",
  "MediaPipe no encontró la mano en el 8 % de las fotos (están muy recortadas); esas fotos no entran en el entrenamiento.",
  "Solo reconoce letras sueltas del alfabeto manual: no interpreta la Lengua de Señas Peruana completa (palabras, frases, expresión facial).",
];

export const STACK = [
  { nombre: "Orange Data Mining", uso: "exploración inicial y comparación de modelos" },
  { nombre: "Python · scikit-learn", uso: "entrenamiento, validación cruzada, exportación del modelo" },
  { nombre: "MediaPipe Hand Landmarker", uso: "21 puntos de la mano, en Python y en el navegador" },
  { nombre: "Astro 7 · Tailwind 4 · TypeScript", uso: "la web; el clasificador reimplementado en JS" },
  { nombre: "Cloudflare Workers", uso: "publicación como sitio estático" },
];
