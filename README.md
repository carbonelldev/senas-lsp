# deletrea · alfabeto manual de la Lengua de Señas Peruana (LSP)

Web: https://senas-alfabeto.proultro14.workers.dev

Reconoce las 24 letras estáticas del alfabeto manual de la LSP con la cámara, en el navegador (dataset: "Peruvian sign language alphabet", Kaggle).
MediaPipe saca los 21 puntos de cada mano (hasta dos a la vez) y una **red neuronal pequeña** decide la letra.
La letra se escribe al mantenerla; hay sugerencias de palabras, lectura en voz alta y atajos de teclado.
Nada sale del dispositivo.

## Resultados

| Método | Validación cruzada (10) | Fondo nuevo* | Ángulo nuevo** |
|---|---|---|---|
| Píxeles: MobileNetV2 + reg. logística (`train/entrenar.py`) | 99,1 % | 22 % | — |
| Puntos de la mano v1 (coordenadas + distancias) + reg. logística | 90,7 % | 76,0 % | 74,3 % |
| **Puntos de la mano v2 (+ ángulos de las articulaciones, giros 3D) + red neuronal** | 90,8 % | **76,0 %** | **90,5 %** |

\* Entrenar con las fotos de un fondo (`library`) y probar con las del otro (`wall`), y al revés.
Es la prueba que más se parece a usar otra cámara en otro sitio.

\*\* Las manos de prueba se giran al azar (±30° en el plano, ±35° de costado, ±25° arriba/abajo) antes de clasificarlas.
Es una simulación con los mismos puntos, no fotos nuevas.

## Estructura

```
orange/                     modelo en Orange (lo que pide el curso)
  ProyectoIA.ows            workflow: File + Import Images -> Merge Data -> Image Embedding -> 4 modelos -> Test and Score
  data/images/              las 1920 fotos del dataset, renombradas de números a palabras (baba.jpg, babe.jpg...)
  data/labels.csv           letra y fondo de cada foto, con la cabecera de 3 filas de Orange
  data/Trabajo IA.pkcls     modelo guardado (Logistic Regression)
  data/LICENSE              licencia MIT del dataset
train/                      scripts de Python (venv en train/.venv)
  caracteristicas.py        cálculo de características (mismo que web/src/lib/clasificador.ts)
  extraer_puntos.py         fotos -> 21 puntos por mano (cache/puntos.npz)
  entrenar_puntos.py        compara modelos (CV10, fondo nuevo, ángulo nuevo) y exporta el mejor a puntos.json
  evaluar.py                matriz de confusion y acierto por letra -> evaluacion.json (pagina /proyecto)
  exportar_muestras.py      una mano "ideal" por letra -> muestras.json (esqueletos de la web)
  exportar_prueba.py        casos para comprobar que el clasificador JS == Python
  elegir_ejemplos.py        2 fotos claras por letra -> web/public/ejemplos/
web/                        Astro 7 + Tailwind 4, desplegado en Cloudflare Workers
  src/layouts/Base.astro    html, nav, fondo, footer, ClientRouter
  src/components/           ui/ (Button, Eyebrow, Meter, Select, Switch), detector/, learn/, project/, HowItWorks
  src/lib/                  clasificador (modelo), mano (MediaPipe), camara, esqueleto,
                            escritor (deletreo), fx (animaciones), progreso, pagina
  src/lib/ui/               select (desplegable con teclado), tooltip (global, [data-tip])
  src/features/             detector.ts y aprender.ts montan cada pagina
  src/data/letras.ts        como se hace cada letra
  src/data/proyecto.ts      memoria: autores/universidad (rellenar), fases, limitaciones, stack
  src/pages/                index (detector + modo presentacion), aprender, proyecto (memoria)
  public/model/             hand_landmarker.task, puntos.json, muestras.json, evaluacion.json
```

Paginas: `/` demo con modo presentacion (pantalla completa), `/aprender` guia y practica,
`/proyecto` memoria (dataset, metodo en 3 fases, matriz de confusion, limitaciones, reproducir).

## Abrir el modelo en Orange

1. Instalar [Orange 3.40](https://orangedatamining.com/download/) y, en *Options → Add-ons*,
   el complemento **Image Analytics** (se usó la versión 0.13.0). Reiniciar Orange.
2. Abrir `orange/ProyectoIA.ows`. File e Import Images buscan `data/labels.csv` y `data/images`
   junto al workflow; si no los encuentran, elegirlos a mano en cada widget.
3. Image Embedding (Inception v3) calcula en un servidor de Orange: hace falta internet y tarda
   unos minutos la primera vez.
4. Abrir Test and Score para ver los resultados (cross-validation, 10 folds).

## Volver a entrenar el modelo de la web

Requiere Python 3.12. Usa las mismas fotos de `orange/data`. Los modelos base de `train/base/`
no están en el repo; se descargan así (el de MobileNetV2 solo hace falta para `entrenar.py`):

```sh
cd train
mkdir base
curl -L -o base/hand_landmarker.task https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task
curl -L -o base/mobilenetv2-12.onnx https://github.com/onnx/models/raw/main/validated/vision/classification/mobilenet/model/mobilenetv2-12.onnx
py -3.12 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python extraer_puntos.py ../orange/data
.venv/Scripts/python entrenar_puntos.py ../web/public/model
.venv/Scripts/python evaluar.py ../web/public/model/evaluacion.json
.venv/Scripts/python exportar_muestras.py ../web/public/model/puntos.json ../web/public/model/muestras.json
.venv/Scripts/python exportar_prueba.py ../web/public/model/puntos.json ../web/scripts/casos_prueba.json
```

## Web

Para usarla basta con abrir https://senas-alfabeto.proultro14.workers.dev en Chrome o Edge y
dar permiso a la cámara. Para ejecutarla en local hace falta Node.js 24:

```sh
cd web
npm install
npm test        # clasificador JS == Python y simulación del deletreo
npm run dev     # local
npm run deploy  # compila y publica en Cloudflare Workers
```

## Créditos y declaración de uso de IA

- Dataset: Egoavil Huaman, C. R. (2025). *Peruvian sign language alphabet* [Conjunto de datos]. Kaggle.
  https://www.kaggle.com/datasets/cristhianegoavil/peruvian-sign-language-alphabet
  Licencia MIT (`orange/data/LICENSE`). Las fotos de `orange/data/images/` y `web/public/ejemplos/`
  provienen de este dataset.
- El código de este repositorio (scripts de `train/` y la aplicación `web/`) se desarrolló con
  ayuda de Claude Code (Anthropic, 2026), un asistente de programación con IA generativa.
  También se usó para renombrar las fotos y dar a `labels.csv` el formato de Orange.
  El workflow de Orange (`ProyectoIA.ows`) es trabajo del grupo.
