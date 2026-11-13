# deletrea · alfabeto manual de la Lengua de Señas Peruana (LSP)

Web: https://senas-alfabeto.proultro14.workers.dev

Reconoce las 24 letras estáticas del alfabeto manual de la LSP con la cámara, en el navegador (dataset: "Peruvian sign language alphabet", Kaggle).
MediaPipe saca los 21 puntos de la mano y una **regresión logística** decide la letra.
Nada sale del dispositivo.

## Resultados

| Método | Validación cruzada (10) | Fondo nuevo* |
|---|---|---|
| Píxeles: MobileNetV2 + reg. logística (`train/entrenar.py`) | 99,1 % | 22 % |
| **Puntos de la mano + reg. logística** (`train/entrenar_puntos.py`) | 90,3 % | **76 %** |

\* Entrenar con las fotos de un fondo (`library`) y probar con las del otro (`wall`), y al revés.
Es la prueba que más se parece a usar otra cámara en otro sitio.

## Estructura

```
train/                      scripts de Python (venv en train/.venv)
  extraer_puntos.py         fotos -> 21 puntos por mano (cache/puntos.npz)
  entrenar_puntos.py        compara modelos y exporta el mejor a puntos.json
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

## Volver a entrenar

Requiere Python 3.12 y el dataset en `../data` (imágenes + `labels.csv`). Los modelos base
(`train/base/`: `mobilenetv2-12.onnx` del ONNX Model Zoo y `hand_landmarker.task` de MediaPipe)
no se suben al repo; descargarlos antes de usar `modelo_base.py` / `extraer_puntos.py`.

```sh
cd train
py -3.12 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python extraer_puntos.py ../../data
.venv/Scripts/python entrenar_puntos.py ../web/public/model
.venv/Scripts/python evaluar.py ../web/public/model/evaluacion.json
.venv/Scripts/python exportar_muestras.py ../web/public/model/puntos.json ../web/public/model/muestras.json
.venv/Scripts/python exportar_prueba.py ../web/public/model/puntos.json ../web/scripts/casos_prueba.json
```

## Web

```sh
cd web
npm test        # el clasificador en JS da lo mismo que Python
npm run dev     # local
npm run deploy  # compila y publica en Cloudflare Workers
```

## Créditos y declaración de uso de IA

- Dataset: Egoavil Huaman, C. R. *Peruvian sign language alphabet* [Conjunto de datos]. Kaggle.
  https://www.kaggle.com/datasets/cristhianegoavil/peruvian-sign-language-alphabet
  (las fotos de `web/public/ejemplos/` provienen de este dataset).
- El código de este repositorio (scripts de `train/` y la aplicación `web/`) se desarrolló con
  ayuda de Claude Code (Anthropic, 2026), un asistente de programación con IA generativa.
  El modelo en Orange (`ProyectoIA.ows`) y el informe son trabajo del grupo.
