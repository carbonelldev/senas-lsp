// Datos fijos de la página /proceso. Las cifras de la web se leen de puntos.json en la página.

/** Resultados de Orange (capturas de Test and Score del grupo). */
export const ORANGE = {
  cv: 0.964, // Logistic Regression, cross-validation de 10 folds
  fondo: 0.233, // Logistic Regression, Cross validation by feature (background)
};

export const REPO = {
  url: "https://github.com/carbonelldev/senas-lsp",
  dueno: "carbonelldev",
  nombre: "senas-lsp",
  carpetas: [
    ["orange/", "workflow de Orange, las 1920 fotos y el modelo guardado"],
    ["train/", "scripts de Python: puntos de la mano, entrenamiento y evaluación"],
    ["web/", "esta página (Astro y TypeScript)"],
  ],
} as const;

export const WEB = {
  url: "https://senas-alfabeto.proultro14.workers.dev",
  capturaDetector: { src: "/proceso/web_detector.jpg", ancho: 1136, alto: 690 },
  capturaAprender: { src: "/proceso/web_aprender.jpg", ancho: 1136, alto: 516 },
};

/** Commits principales del repositorio (git log), del más reciente al más antiguo. */
export const COMMITS = [
  ["19 nov 2026", "Página del proceso: qué se hizo después de Orange"],
  ["15 nov 2026", "Añade los datos de Orange y las instrucciones para ejecutar todo"],
  ["13 nov 2026", "Corrige la posición del esqueleto y evita que la cara cuente como mano"],
  ["13 nov 2026", "Dos manos, deletreo más fácil y mejor reconocimiento con la mano girada"],
  ["13 nov 2026", "Reconocimiento de letras estáticas del alfabeto manual de la LSP"],
] as const;
